import { app, ipcMain } from 'electron'
import { getDbPath } from '../db.ts'

export function registerAppInfoHandlers() {
  ipcMain.handle('appInfo:get', () => {
    return { version: app.getVersion(), dbPath: getDbPath() }
  })
}
