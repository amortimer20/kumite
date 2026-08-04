import { describe, expect, it, vi } from 'vitest'

// autoBackup.ts imports db.ts (whose module evaluation migrates the dev
// database) and ipc/backup.ts. These tests only exercise the pure pruning
// decision, so stand both in.
vi.mock('./db.ts', () => ({ prisma: {} }))
vi.mock('./ipc/backup.ts', () => ({ backupDatabaseTo: async () => {} }))

const { backupsToPrune } = await import('./autoBackup.ts')

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
