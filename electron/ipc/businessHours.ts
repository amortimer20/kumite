import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { BusinessHoursInput } from '../../shared/types.ts'

// openTime/closeTime are "HH:MM" 24-hour strings from <input type="time">, so
// a plain string compare is chronological. An open day whose close time isn't
// strictly after its open time would make the Schedule availability grid
// render an empty (or backwards) range for that day, silently, with no error.
export function assertValidBusinessHours(isClosed: boolean, openTime: string, closeTime: string) {
  if (!isClosed && closeTime <= openTime) {
    throw new Error('Closing time must be after opening time.')
  }
}

// The renderer patches one field at a time (just { closeTime }, say), so the
// row must be validated as it will look *after* the patch is applied —
// merging over the stored values, or the schema defaults if the row hasn't
// been seeded yet. Exported so the merge-and-validate logic is testable.
export async function updateBusinessHours(dayOfWeek: number, input: BusinessHoursInput) {
  const existing = await prisma.businessHours.findUnique({ where: { dayOfWeek } })
  const isClosed = input.isClosed ?? existing?.isClosed ?? false
  const openTime = input.openTime ?? existing?.openTime ?? '09:00'
  const closeTime = input.closeTime ?? existing?.closeTime ?? '20:00'
  assertValidBusinessHours(isClosed, openTime, closeTime)
  return prisma.businessHours.upsert({
    where: { dayOfWeek },
    create: { dayOfWeek, ...input },
    update: input,
  })
}

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

  ipcMain.handle('businessHours:update', (_event, dayOfWeek: number, input: BusinessHoursInput) =>
    updateBusinessHours(dayOfWeek, input),
  )
}
