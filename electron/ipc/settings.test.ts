import { describe, expect, it, vi } from 'vitest'

// settings.ts imports db.ts and autoBackup.ts (which itself pulls in db.ts and
// ipc/backup.ts). The assert under test touches none of that, so stub the
// heavy imports out rather than run them.
vi.mock('../db.ts', () => ({ prisma: {} }))
vi.mock('../autoBackup.ts', () => ({
  reconfigureAutoBackup: () => {},
  toAppSettings: (row: unknown) => row,
}))

const { assertValidSettingsInput } = await import('./settings.ts')

describe('assertValidSettingsInput', () => {
  it('accepts null (keep all) and a positive whole number', () => {
    expect(() => assertValidSettingsInput({ autoBackupKeepCount: null })).not.toThrow()
    expect(() => assertValidSettingsInput({ autoBackupKeepCount: 30 })).not.toThrow()
  })

  it('accepts input that omits the keep count entirely', () => {
    expect(() => assertValidSettingsInput({ autoBackupEnabled: true })).not.toThrow()
  })

  it.each([0, -1, 2.5, NaN])('rejects a nonsensical keep count (%s)', (count) => {
    expect(() => assertValidSettingsInput({ autoBackupKeepCount: count })).toThrow(/positive whole number/)
  })
})
