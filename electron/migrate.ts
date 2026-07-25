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
// Each migration file is executed on its own (not wrapped in an extra
// transaction here) because several of them toggle `PRAGMA foreign_keys`
// around a table-rebuild, and that pragma is a no-op once a transaction is
// already open — wrapping it ourselves would silently defeat it.
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
      db.exec(sql)
      db.prepare(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
         VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`,
      ).run(crypto.randomUUID(), crypto.createHash('sha256').update(sql).digest('hex'), name)
    }
  } finally {
    db.close()
  }
}
