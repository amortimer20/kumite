import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { BusinessHoursInput } from '../../shared/types.ts'

export function registerBusinessHoursHandlers() {
  ipcMain.handle('businessHours:list', async () => {
    // SQLite doesn't support createMany's skipDuplicates, and a plain check-then-create
    // loop races against concurrent calls (e.g. React StrictMode's double effect
    // invocation) on the dayOfWeek unique constraint. A transaction of upserts is atomic.
    await prisma.$transaction(
      Array.from({ length: 7 }, (_, dayOfWeek) =>
        prisma.businessHours.upsert({
          where: { dayOfWeek },
          create: { dayOfWeek },
          update: {},
        }),
      ),
    )
    return prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } })
  })

  ipcMain.handle('businessHours:update', async (_event, dayOfWeek: number, input: BusinessHoursInput) => {
    return prisma.businessHours.upsert({
      where: { dayOfWeek },
      create: { dayOfWeek, ...input },
      update: input,
    })
  })
}
