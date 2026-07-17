import { app, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { getDbPath } from '../db.ts'

function defaultBackupName() {
  const stamp = new Date().toISOString().slice(0, 10)
  return `kumite-backup-${stamp}.db`
}

export function registerBackupHandlers() {
  ipcMain.handle('backup:create', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Backup',
      defaultPath: defaultBackupName(),
      filters: [{ name: 'Kumite Backup', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { canceled: true }

    // better-sqlite3's backup API produces a consistent, checkpointed
    // snapshot even while the live connection has pending WAL data, so a
    // plain file copy isn't needed (and would risk grabbing a torn read).
    const src = new Database(getDbPath(), { readonly: true, fileMustExist: true })
    try {
      await src.backup(filePath)
    } finally {
      src.close()
    }
    return { canceled: false, path: filePath }
  })

  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore Backup',
      filters: [{ name: 'Kumite Backup', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { canceled: true }

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
