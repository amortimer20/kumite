import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import { reconfigureAutoBackup, toAppSettings } from '../autoBackup.ts'
import type { AppSettingsInput } from '../../shared/types.ts'

// autoBackupKeepCount is null to mean "keep all"; any other value is a count
// of backups to retain, so a zero/negative/fractional number is meaningless.
// backupsToPrune already fails safe on a bad value (deletes nothing), but
// rejecting it here gives the user feedback instead of silently storing junk.
export function assertValidSettingsInput(input: AppSettingsInput) {
  const keep = input.autoBackupKeepCount
  if (keep !== undefined && keep !== null && (!Number.isInteger(keep) || keep < 1)) {
    throw new Error('Backups to keep must be a positive whole number.')
  }
}

// Singleton row, always id 1 — seeded lazily on first read, same pattern as
// BusinessHours.
async function getOrCreateSettings() {
  const row = await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  })
  return toAppSettings(row)
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    return getOrCreateSettings()
  })

  ipcMain.handle('settings:update', async (_event, input: AppSettingsInput) => {
    assertValidSettingsInput(input)
    const row = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    })
    const settings = toAppSettings(row)
    reconfigureAutoBackup(settings)
    return settings
  })
}
