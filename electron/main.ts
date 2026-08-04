import { app, BrowserWindow, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    // Electron's 800x600 default is too cramped for this app's tables — the
    // Students and Schedule panels both clip. minWidth keeps the top nav on one
    // or two rows rather than collapsing into a tall stack.
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// The database is opened, restored, and migrated during module evaluation of
// db.ts (that ordering is deliberate — see the comments there). Importing it
// dynamically, from inside a try/catch that runs after the app is ready, is
// what makes a failure reportable: a static import would run the same code
// during startup, before any window or dialog exists, and a throw there kills
// the process with no message at all — the user double-clicks the icon and
// nothing happens, with nothing to go on.
async function loadDatabaseAndHandlers() {
  const { registerIpcHandlers } = await import('./ipc/index.ts')
  registerIpcHandlers()
}

// Flipped once the database has loaded and handlers are registered, so a later
// crash isn't reported as a startup failure (and doesn't tell the user to go
// looking for a restore file that has nothing to do with it).
let startupComplete = false

function reportFatalError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (startupComplete) {
    dialog.showErrorBox(
      'Kumite hit an unexpected problem',
      `${message}\n\n` +
        'Kumite needs to close. Any work you had already saved is safe.\n\n' +
        'Please send this message to whoever set up Kumite for you.',
    )
    return
  }
  dialog.showErrorBox(
    'Kumite could not start',
    `${message}\n\n` +
      'Your data has not been changed. If you were restoring a backup, the database ' +
      'from before the restore was kept in this folder, with a name ending in ' +
      '".pre-restore-" followed by a number:\n\n' +
      `${app.getPath('userData')}\n\n` +
      'Please send this message to whoever set up Kumite for you.',
  )
}

// Anything that escapes to this point would otherwise be an invisible crash, so
// make it say something before going down.
process.on('uncaughtException', (err) => {
  reportFatalError(err)
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in the main process:', reason)
})

function start() {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    try {
      await loadDatabaseAndHandlers()
      startupComplete = true
    } catch (err) {
      reportFatalError(err)
      app.exit(1)
      return
    }

    // Neither of these is worth blocking startup over: the schedule still
    // works without a fresh batch of generated occurrences, and backups can be
    // re-enabled from Settings.
    try {
      const { extendAllActiveSeries } = await import('./ipc/recurringSeries.ts')
      await extendAllActiveSeries()
    } catch (err) {
      console.error('Failed to extend recurring lesson series:', err)
    }
    try {
      const { startAutoBackupScheduler } = await import('./autoBackup.ts')
      await startAutoBackupScheduler()
    } catch (err) {
      console.error('Failed to start automatic backup scheduler:', err)
    }

    createWindow()
  })
}

// Only one instance may run. Two would each run the startup migration runner
// and the staged-restore file swap against the same SQLite file — on Windows
// the second launch is one accidental double-click of the desktop shortcut
// away — and would keep two independent auto-backup schedulers writing to the
// same folder.
if (app.requestSingleInstanceLock()) {
  start()
} else {
  app.quit()
}
