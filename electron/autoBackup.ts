import fs from 'node:fs'
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
  autoBackupKeepCount: number | null
  lastAutoBackupAt: Date | null
  lastAutoBackupError: string | null
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

// Only files this feature created. The backup folder is user-chosen and the UI
// actively suggests a synced OneDrive/Dropbox folder, so it may well contain
// unrelated files — including manual "Export Backup" files, which are named
// `kumite-backup-<date>.db` and must never be pruned, since the user saved
// those deliberately. Anchored so that prefix can't match.
const AUTO_BACKUP_FILENAME = /^kumite-auto-backup-.+\.db$/

// Which files to delete, given everything currently in the folder. Pure and
// exported so the choice of what to destroy is unit-tested rather than only
// exercised against a real directory.
//
// Ordering is by filename, not mtime: the names are ISO-timestamped precisely
// so they sort chronologically, and mtime is unreliable here because a sync
// client re-downloading a file rewrites it.
export function backupsToPrune(filenames: string[], keepCount: number | null): string[] {
  // Fail safe toward keeping files: null means keep everything, and a nonsense
  // count (0, negative, non-integer) deletes nothing rather than everything.
  if (keepCount === null || !Number.isInteger(keepCount) || keepCount < 1) return []
  const ours = filenames.filter((name) => AUTO_BACKUP_FILENAME.test(name)).sort()
  return ours.slice(0, Math.max(0, ours.length - keepCount))
}

async function pruneOldBackups(directory: string, keepCount: number | null) {
  const entries = await fs.promises.readdir(directory)
  for (const name of backupsToPrune(entries, keepCount)) {
    await fs.promises.rm(path.join(directory, name), { force: true })
  }
}

async function runAutoBackupNow(directory: string, keepCount: number | null) {
  try {
    await backupDatabaseTo(path.join(directory, timestampedBackupName()))
    await prisma.appSettings.update({
      where: { id: 1 },
      data: { lastAutoBackupAt: new Date(), lastAutoBackupError: null },
    })
  } catch (err) {
    // No caller to propagate to — this runs off a timer, not a user action.
    // A bad/removed directory shouldn't crash the app; it just skips a beat
    // and tries again next interval.
    console.error('Automatic backup failed:', err)
    // Recorded so Settings can say so, rather than just going quiet while
    // continuing to show the last time it *did* work — a renamed, deleted, or
    // disconnected folder would otherwise fail forever with the only sign
    // being a date that slowly falls further behind.
    await prisma.appSettings
      .update({ where: { id: 1 }, data: { lastAutoBackupError: err instanceof Error ? err.message : String(err) } })
      .catch((updateErr) => console.error('Could not record the automatic backup failure:', updateErr))
    return
  }

  // Separate from the block above so a pruning problem (a permissions error, a
  // file held open by a sync client) can't make a backup that genuinely
  // succeeded look like it failed.
  try {
    await pruneOldBackups(directory, keepCount)
  } catch (err) {
    console.error('Could not delete old automatic backups:', err)
  }
}

// Clears any previous schedule and starts a new one from scratch — called
// both at app startup (with whatever was last saved) and every time the
// user changes a setting, so a running timer never outlives its config.
export function reconfigureAutoBackup(
  settings: Pick<AppSettings, 'autoBackupEnabled' | 'autoBackupDirectory' | 'autoBackupFrequency' | 'autoBackupKeepCount'>,
) {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!settings.autoBackupEnabled || !settings.autoBackupDirectory) return

  const directory = settings.autoBackupDirectory
  const keepCount = settings.autoBackupKeepCount
  const intervalMs = AUTO_BACKUP_FREQUENCY_MINUTES[settings.autoBackupFrequency] * 60_000
  // Run one immediately — confirms it's working right away instead of
  // waiting a full interval (up to a week, at the slowest setting) for the
  // first proof it's active.
  void runAutoBackupNow(directory, keepCount)
  timer = setInterval(() => void runAutoBackupNow(directory, keepCount), intervalMs)
}

export async function startAutoBackupScheduler() {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } })
  if (!row) return
  reconfigureAutoBackup(toAppSettings(row))
}
