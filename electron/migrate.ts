import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

const migrationsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'migrations')
  : path.join(app.getAppPath(), 'prisma', 'migrations')

// Mirrors the table Prisma's own CLI (`prisma migrate dev`/`deploy`) tracks
// applied migrations in, so a database migrated by the CLI during
// development and one migrated by this runner on a fresh install end up in
// the same state. Checksum/drift validation is deliberately skipped — that
// guards against hand-edited migration history, which isn't a concern here
// since shipped migrations are only ever appended to, never edited.
function ensureMigrationsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `)
}

function appliedMigrationNames(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT migration_name FROM "_prisma_migrations"').all() as {
    migration_name: string
  }[]
  return new Set(rows.map((row) => row.migration_name))
}

// Applies any migration under prisma/migrations not yet recorded against
// dbPath, in order. Runs before Prisma opens its own connection, so a fresh
// install — where the database file doesn't exist yet — ends up with the
// full schema instead of failing on the first query.
//
// Each migration runs inside one transaction, together with the row that
// records it, so an interrupted upgrade (force-quit, power loss, the file
// briefly locked by antivirus) rolls all the way back instead of leaving a
// half-migrated database. That matters because several migrations rebuild a
// table by creating a copy, dropping the original, and renaming — without a
// transaction, dying midway leaves the original table already dropped and
// every subsequent launch failing on "table already exists", with no way in.
//
// `PRAGMA foreign_keys` is a no-op once a transaction is open, so it's set
// here, outside the transaction, instead of relying on the copies inside the
// migration files. The rebuilds also emit `PRAGMA defer_foreign_keys=ON`,
// which *does* work inside a transaction, so constraints are still enforced
// at commit time.
export function applyPendingMigrations(dbPath: string) {
  if (!fs.existsSync(migrationsDir)) return

  const migrationNames = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const db = new Database(dbPath)
  try {
    ensureMigrationsTable(db)
    const applied = appliedMigrationNames(db)

    for (const name of migrationNames) {
      if (applied.has(name)) continue
      const sql = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8')

      db.pragma('foreign_keys = OFF')
      try {
        // BEGIN IMMEDIATE takes the write lock up front, so a second instance
        // racing the same upgrade blocks here rather than interleaving
        // statements with this one.
        db.exec('BEGIN IMMEDIATE')
        db.exec(sql)
        db.prepare(
          `INSERT INTO "_prisma_migrations"
             (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
           VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
        ).run(crypto.randomUUID(), crypto.createHash('sha256').update(sql).digest('hex'), name)
        db.exec('COMMIT')
      } catch (err) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // Already rolled back (or never opened) — the original error is what
          // matters, so don't let a rollback failure mask it.
        }
        throw new Error(
          `Database update "${name}" could not be applied and was rolled back. ${err instanceof Error ? err.message : String(err)}`,
        )
      } finally {
        db.pragma('foreign_keys = ON')
      }
    }
  } finally {
    db.close()
  }
}
