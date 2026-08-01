import path from 'node:path'
import { prisma } from './db.ts'
import { backupDatabaseTo } from './ipc/backup.ts'
import { AUTO_BACKUP_FREQUENCIES, AUTO_BACKUP_FREQUENCY_MINUTES } from '../shared/types.ts'
import type { AppSettings, AutoBackupFrequency } from '../shared/types.ts'

function isAutoBackupFrequency(value: string): value is AutoBackupFrequency {
  return (AUTO_BACKUP_FREQUENCIES as readonly string[]).includes(value)
}

// Prisma's column is a plain string (SQLite has no enum support), so this
// narrows/validates it into the known union — falling back to the default
// rather than crashing app startup over a hand-edited or corrupted row.
// No explicit AppSettings return annotation: lastAutoBackupAt is a Date here
// (Prisma's native DateTime representation) but `string` on the wire, same
// as createdAt/updatedAt elsewhere in the app — IPC's structured clone
// passes the Date through as-is, and the renderer just does `new Date(x)`.
export function toAppSettings(row: {
  autoBackupEnabled: boolean
  autoBackupDirectory: string | null
  autoBackupFrequency: string
  lastAutoBackupAt: Date | null
}) {
  return {
    ...row,
    autoBackupFrequency: isAutoBackupFrequency(row.autoBackupFrequency) ? row.autoBackupFrequency : ('daily' as AutoBackupFrequency),
  }
}

let timer: NodeJS.Timeout | null = null

// Sortable (ISO order) and Windows-filename-safe (no colons).
function timestampedBackupName() {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-')
  return `kumite-auto-backup-${stamp}.db`
}

async function runAutoBackupNow(directory: string) {
  try {
    await backupDatabaseTo(path.join(directory, timestampedBackupName()))
    await prisma.appSettings.update({ where: { id: 1 }, data: { lastAutoBackupAt: new Date() } })
  } catch (err) {
    // No caller to propagate to — this runs off a timer, not a user action.
    // A bad/removed directory shouldn't crash the app; it just skips a beat
    // and tries again next interval.
    console.error('Automatic backup failed:', err)
  }
}

// Clears any previous schedule and starts a new one from scratch — called
// both at app startup (with whatever was last saved) and every time the
// user changes a setting, so a running timer never outlives its config.
export function reconfigureAutoBackup(settings: Pick<AppSettings, 'autoBackupEnabled' | 'autoBackupDirectory' | 'autoBackupFrequency'>) {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!settings.autoBackupEnabled || !settings.autoBackupDirectory) return

  const directory = settings.autoBackupDirectory
  const intervalMs = AUTO_BACKUP_FREQUENCY_MINUTES[settings.autoBackupFrequency] * 60_000
  // Run one immediately — confirms it's working right away instead of
  // waiting a full interval (up to a week, at the slowest setting) for the
  // first proof it's active.
  void runAutoBackupNow(directory)
  timer = setInterval(() => void runAutoBackupNow(directory), intervalMs)
}

export async function startAutoBackupScheduler() {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } })
  if (!row) return
  reconfigureAutoBackup(toAppSettings(row))
}
