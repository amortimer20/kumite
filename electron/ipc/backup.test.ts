import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

// The real db.ts applies migrations to the dev database at import time, which a
// unit test must not touch. backup.ts only needs getDbPath, and these tests
// never exercise the paths that use it except via the mutable ref below, which
// backupDatabaseTo tests point at a real throwaway source file.
const { dbPathRef } = vi.hoisted(() => ({ dbPathRef: { current: '/nonexistent/karate-app.db' } }))
vi.mock('../db.ts', () => ({
  getDbPath: () => dbPathRef.current,
  prisma: {},
}))

const { assertRestorableBackup, backupDatabaseTo } = await import('./backup.ts')

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kumite-backup-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function file(name: string) {
  return path.join(tmpDir, name)
}

// Creates a database with the tables assertRestorableBackup requires.
function makeKumiteLikeDb(filePath: string) {
  const db = new Database(filePath)
  db.exec(`
    CREATE TABLE "Student" (id TEXT PRIMARY KEY);
    CREATE TABLE "Instructor" (id TEXT PRIMARY KEY);
    CREATE TABLE "Lesson" (id TEXT PRIMARY KEY);
    CREATE TABLE "_prisma_migrations" (id TEXT PRIMARY KEY);
  `)
  db.close()
}

describe('assertRestorableBackup', () => {
  it('accepts a database with Kumite\'s tables', () => {
    const p = file('good.db')
    makeKumiteLikeDb(p)
    expect(() => assertRestorableBackup(p)).not.toThrow()
  })

  // The silent-data-loss case: SQLite happily initialises a 0-byte file as a
  // brand-new empty database, so without this check a failed/aborted backup
  // would restore cleanly and present as "all your data is gone".
  it('rejects a 0-byte file rather than letting it become an empty database', () => {
    const p = file('empty.db')
    fs.writeFileSync(p, '')
    expect(() => assertRestorableBackup(p)).toThrow(/empty/i)
  })

  // The app-bricking case: db.ts swaps the staged file in before Prisma opens
  // its connection, so a file that isn't a database at all took the app down
  // during startup with no window and no error.
  it('rejects a file that is not a database', () => {
    const p = file('notadb.db')
    fs.writeFileSync(p, 'this is just some text, not a database at all')
    expect(() => assertRestorableBackup(p)).toThrow(/not a database file/i)
  })

  it('rejects a truncated database whose header survived', () => {
    const p = file('truncated.db')
    makeKumiteLikeDb(p)
    const full = fs.readFileSync(p)
    // Keep the SQLite header so this gets past the magic-bytes check and has to
    // be caught by opening the file.
    fs.writeFileSync(p, full.subarray(0, 100))
    expect(() => assertRestorableBackup(p)).toThrow()
  })

  it('rejects a valid database belonging to some other application', () => {
    const p = file('other-app.db')
    const db = new Database(p)
    db.exec('CREATE TABLE "Invoices" (id TEXT PRIMARY KEY);')
    db.close()
    expect(() => assertRestorableBackup(p)).toThrow(/not a Kumite backup/i)
  })

  it('rejects a database missing only some of the required tables', () => {
    const p = file('partial.db')
    const db = new Database(p)
    db.exec(`
      CREATE TABLE "Student" (id TEXT PRIMARY KEY);
      CREATE TABLE "Instructor" (id TEXT PRIMARY KEY);
    `)
    db.close()
    expect(() => assertRestorableBackup(p)).toThrow(/not a Kumite backup/i)
  })
})

describe('backupDatabaseTo', () => {
  afterEach(() => {
    dbPathRef.current = '/nonexistent/karate-app.db'
  })

  it('produces a restorable backup at the requested path', async () => {
    const src = file('source.db')
    makeKumiteLikeDb(src)
    dbPathRef.current = src
    const dest = file('backup.db')

    await backupDatabaseTo(dest)

    expect(fs.existsSync(dest)).toBe(true)
    expect(() => assertRestorableBackup(dest)).not.toThrow()
  })

  it('does not leave a .partial temp file behind after a successful backup', async () => {
    const src = file('source2.db')
    makeKumiteLikeDb(src)
    dbPathRef.current = src
    const dest = file('backup2.db')

    await backupDatabaseTo(dest)

    expect(fs.existsSync(`${dest}.partial`)).toBe(false)
  })

  // The core of the fix: a write interrupted partway (a pulled USB stick, a
  // lost network-drive connection, the app quitting mid-copy) must never leave
  // a file at the final path that looks like a valid backup but isn't.
  it('discards a corrupted partial write and throws, leaving nothing at the destination', async () => {
    const src = file('source3.db')
    makeKumiteLikeDb(src)
    dbPathRef.current = src
    const dest = file('backup3.db')

    // Simulate an interrupted/corrupted copy: better-sqlite3's own backup()
    // is stubbed to write garbage instead of a real snapshot.
    const backupSpy = vi
      .spyOn(Database.prototype, 'backup')
      .mockImplementation((async (destPath: string) => {
        fs.writeFileSync(destPath, 'not a valid sqlite file')
      }) as unknown as typeof Database.prototype.backup)

    try {
      await expect(backupDatabaseTo(dest)).rejects.toThrow(/integrity check/i)
    } finally {
      backupSpy.mockRestore()
    }
    expect(fs.existsSync(dest)).toBe(false)
    expect(fs.existsSync(`${dest}.partial`)).toBe(false)
  })
})
