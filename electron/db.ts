import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.ts'

const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'karate-app.db')
  : path.join(app.getAppPath(), 'prisma', 'dev.db')

export function getDbPath() {
  return dbPath
}

// A restore stages the chosen backup file here and relaunches the app rather
// than swapping files under a live connection (unsafe, especially on
// Windows). Applying it here, before the connection below is opened, keeps
// the swap to a moment when nothing holds the file open.
function applyPendingRestore() {
  const staged = `${dbPath}.restore-staged`
  if (!fs.existsSync(staged)) return

  // The staged file is a complete, checkpointed snapshot (produced via
  // better-sqlite3's backup API), so stale WAL/SHM siblings from the
  // outgoing database must not be left around to be replayed against it.
  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true })
  }

  if (fs.existsSync(dbPath)) {
    fs.renameSync(dbPath, `${dbPath}.pre-restore-${Date.now()}`)
  }
  fs.renameSync(staged, dbPath)
}

applyPendingRestore()

const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })

export const prisma = new PrismaClient({ adapter })
