import { vi } from 'vitest'

// Importing 'electron' under plain Node (rather than the Electron binary)
// returns a path string, not the API — any ipc/*.ts file (or electron/migrate.ts,
// electron/db.ts) that imports `app`/`ipcMain` would crash immediately on
// import. This stands in a minimal fake so those files load normally; tests
// that need real IPC dispatch capture handlers themselves instead of relying
// on this ipcMain.
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    // electron/migrate.ts resolves prisma/migrations relative to this — the
    // real project root is exactly what we want so tests migrate a temp db
    // with the real migration history.
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd(),
  },
  ipcMain: {
    handle: () => {},
  },
}))
