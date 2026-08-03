import { app, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { getDbPath } from '../db.ts'

function defaultBackupName() {
  const stamp = new Date().toISOString().slice(0, 10)
  return `kumite-backup-${stamp}.db`
}

// better-sqlite3's backup API produces a consistent, checkpointed snapshot
// even while the live connection has pending WAL data, so a plain file copy
// isn't needed (and would risk grabbing a torn read). Shared by the manual
// "Export Backup" button and the automatic scheduler in autoBackup.ts.
export async function backupDatabaseTo(filePath: string) {
  const src = new Database(getDbPath(), { readonly: true, fileMustExist: true })
  try {
    await src.backup(filePath)
  } finally {
    src.close()
  }
}

// Tables every real Kumite database has. Checked by name so that restoring
// some unrelated SQLite file (or a different app's database) is refused up
// front rather than swapped in at next launch.
const REQUIRED_TABLES = ['Student', 'Instructor', 'Lesson', '_prisma_migrations']

// A staged restore is applied by db.ts before Prisma opens its connection, so
// by the time a bad file is discovered there's no UI left to report it — the
// app just fails to start. Everything that can be checked has to be checked
// here, while the user is still looking at a dialog.
export function assertRestorableBackup(filePath: string) {
  if (fs.statSync(filePath).size === 0) {
    throw new Error('That file is empty, so it has no data to restore. Choose a different backup file.')
  }

  // SQLite's file header. Guards the case that matters most: a file with the
  // right name and extension whose contents aren't a database at all.
  const header = Buffer.alloc(16)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, header, 0, 16, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (header.toString('latin1', 0, 15) !== 'SQLite format 3') {
    throw new Error('That file is not a Kumite backup — it is not a database file. Choose a different file.')
  }

  const db = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check') as { integrity_check: string }[]
    if (integrity[0]?.integrity_check !== 'ok') {
      throw new Error('That backup file is damaged and cannot be restored. Try an earlier backup.')
    }
    const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
    const { found } = db
      .prepare(`SELECT COUNT(*) AS found FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
      .get(...REQUIRED_TABLES) as { found: number }
    if (found < REQUIRED_TABLES.length) {
      throw new Error('That database is not a Kumite backup — it is missing Kumite\'s tables. Choose a different file.')
    }
  } finally {
    db.close()
  }
}

export function registerBackupHandlers() {
  ipcMain.handle('backup:create', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Backup',
      defaultPath: defaultBackupName(),
      filters: [{ name: 'Kumite Backup', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { canceled: true }

    await backupDatabaseTo(filePath)
    return { canceled: false, path: filePath }
  })

  ipcMain.handle('backup:chooseDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Automatic Backup Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    return { canceled: false, path: filePaths[0] }
  })

  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore Backup',
      filters: [{ name: 'Kumite Backup', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { canceled: true }

    // Refuse anything that isn't a usable Kumite database before it can be
    // staged — see assertRestorableBackup.
    assertRestorableBackup(filePaths[0])

    // Stage the file and relaunch rather than swapping it in now: the app
    // holds an open connection to the live database, and replacing that
    // file out from under it is unsafe (especially on Windows). db.ts
    // applies the staged file the next time the app starts, before it
    // opens its own connection.
    fs.copyFileSync(filePaths[0], `${getDbPath()}.restore-staged`)

    app.relaunch()
    app.exit()
    return { canceled: false }
  })
}
