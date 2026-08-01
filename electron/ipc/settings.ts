import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import { reconfigureAutoBackup, toAppSettings } from '../autoBackup.ts'
import type { AppSettingsInput } from '../../shared/types.ts'

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
