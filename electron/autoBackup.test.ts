import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../shared/types.ts'

// autoBackup.ts imports db.ts (whose module evaluation migrates the dev
// database), ipc/backup.ts, and node:fs. None of that should run in a unit
// test, so all three are stood in with spies. The spies are hoisted so the
// (also-hoisted) vi.mock factories can close over them.
const { backupSpy, updateSpy, readdirSpy } = vi.hoisted(() => ({
  backupSpy: vi.fn(),
  updateSpy: vi.fn(),
  readdirSpy: vi.fn(),
}))

vi.mock('./ipc/backup.ts', () => ({ backupDatabaseTo: backupSpy }))
vi.mock('./db.ts', () => ({ prisma: { appSettings: { update: updateSpy } } }))
vi.mock('node:fs', () => ({
  default: { promises: { readdir: readdirSpy, rm: vi.fn(async () => {}) } },
}))

const { backupsToPrune, reconfigureAutoBackup } = await import('./autoBackup.ts')

// Names as the app actually generates them: ISO timestamp, colons replaced.
function autoBackup(day: number) {
  return `kumite-auto-backup-2026-08-${String(day).padStart(2, '0')}T09-00-00.db`
}

describe('backupsToPrune', () => {
  it('keeps the newest N and returns the rest, oldest first', () => {
    const files = [autoBackup(1), autoBackup(2), autoBackup(3), autoBackup(4), autoBackup(5)]
    expect(backupsToPrune(files, 2)).toEqual([autoBackup(1), autoBackup(2), autoBackup(3)])
  })

  it('deletes nothing when there are fewer backups than the limit', () => {
    expect(backupsToPrune([autoBackup(1), autoBackup(2)], 30)).toEqual([])
  })

  it('deletes nothing when the count exactly equals the limit', () => {
    expect(backupsToPrune([autoBackup(1), autoBackup(2)], 2)).toEqual([])
  })

  it('is not fooled by input order', () => {
    const files = [autoBackup(3), autoBackup(1), autoBackup(5), autoBackup(2)]
    expect(backupsToPrune(files, 1)).toEqual([autoBackup(1), autoBackup(2), autoBackup(3)])
  })

  it('keeps everything when the count is null', () => {
    expect(backupsToPrune([autoBackup(1), autoBackup(2), autoBackup(3)], null)).toEqual([])
  })

  // The backup folder is user-chosen and the UI suggests a synced Dropbox or
  // OneDrive folder, so it can contain anything. Deleting a file this feature
  // didn't create would be unrecoverable.
  it('never touches files it did not create', () => {
    const files = [
      autoBackup(1),
      autoBackup(2),
      autoBackup(3),
      'kumite-backup-2026-08-01.db', // a manual "Export Backup" — deliberately saved
      'taxes-2025.xlsx',
      'karate-app.db',
      'notes.txt',
      'kumite-auto-backup-old.txt', // right prefix, wrong extension
      'my-kumite-auto-backup-2026-08-01T09-00-00.db', // prefix not at the start
    ]
    expect(backupsToPrune(files, 1)).toEqual([autoBackup(1), autoBackup(2)])
  })

  it('handles an empty folder', () => {
    expect(backupsToPrune([], 10)).toEqual([])
  })

  // Fail safe: a nonsense retention value must delete nothing, not everything.
  it.each([0, -1, -30, 1.5, NaN, Infinity])('deletes nothing for an invalid count (%s)', (count) => {
    const files = [autoBackup(1), autoBackup(2), autoBackup(3)]
    expect(backupsToPrune(files, count)).toEqual([])
  })
})

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

function config(overrides: Partial<AppSettings> = {}) {
  return {
    autoBackupEnabled: true,
    autoBackupDirectory: '/backups',
    autoBackupFrequency: 'hourly' as const,
    autoBackupKeepCount: 30,
    ...overrides,
  }
}

describe('reconfigureAutoBackup', () => {
  // Scoped to this block so the pure backupsToPrune tests above still run
  // against real timers, exactly as they did before.
  beforeEach(() => {
    vi.useFakeTimers()
    backupSpy.mockResolvedValue(undefined)
    updateSpy.mockResolvedValue({})
    readdirSpy.mockResolvedValue([])
  })

  afterEach(() => {
    // Clear the module-level interval so it can't leak into the next test.
    reconfigureAutoBackup(config({ autoBackupEnabled: false }))
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('schedules nothing when auto-backup is disabled', () => {
    reconfigureAutoBackup(config({ autoBackupEnabled: false }))
    vi.advanceTimersByTime(DAY_MS * 7)
    expect(backupSpy).not.toHaveBeenCalled()
  })

  it('schedules nothing when no directory has been chosen', () => {
    reconfigureAutoBackup(config({ autoBackupDirectory: null }))
    vi.advanceTimersByTime(DAY_MS * 7)
    expect(backupSpy).not.toHaveBeenCalled()
  })

  // Runs one immediately so the user gets proof it works without waiting a
  // whole interval (up to a week at the slowest setting).
  it('runs one backup immediately when enabled', () => {
    reconfigureAutoBackup(config())
    expect(backupSpy).toHaveBeenCalledTimes(1)
    expect(backupSpy).toHaveBeenCalledWith(expect.stringContaining('/backups'))
  })

  it('runs another backup on every interval tick', () => {
    reconfigureAutoBackup(config({ autoBackupFrequency: 'hourly' }))
    expect(backupSpy).toHaveBeenCalledTimes(1) // immediate
    vi.advanceTimersByTime(HOUR_MS)
    expect(backupSpy).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(HOUR_MS)
    expect(backupSpy).toHaveBeenCalledTimes(3)
  })

  it('stops the timer when reconfigured to disabled', () => {
    reconfigureAutoBackup(config({ autoBackupFrequency: 'hourly' }))
    expect(backupSpy).toHaveBeenCalledTimes(1)
    reconfigureAutoBackup(config({ autoBackupEnabled: false }))
    vi.advanceTimersByTime(HOUR_MS * 3)
    expect(backupSpy).toHaveBeenCalledTimes(1) // no further ticks
  })

  // A frequency change must clear the old interval, not leave both running.
  it('replaces the old schedule when the frequency changes', () => {
    reconfigureAutoBackup(config({ autoBackupFrequency: 'hourly' }))
    vi.advanceTimersByTime(HOUR_MS)
    expect(backupSpy).toHaveBeenCalledTimes(2) // immediate + one hourly tick

    reconfigureAutoBackup(config({ autoBackupFrequency: 'daily' }))
    expect(backupSpy).toHaveBeenCalledTimes(3) // immediate run on reconfigure

    // The old hourly timer must be gone: an hour passing does nothing now.
    vi.advanceTimersByTime(HOUR_MS)
    expect(backupSpy).toHaveBeenCalledTimes(3)
    // A full day triggers the new daily timer.
    vi.advanceTimersByTime(DAY_MS)
    expect(backupSpy).toHaveBeenCalledTimes(4)
  })
})
