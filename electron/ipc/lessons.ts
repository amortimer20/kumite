import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { LessonInput, LessonListFilter, LessonStatus } from '../../shared/types.ts'

const include = { student: true, instructor: true } as const

async function assertNoOverlap(
  instructorId: string,
  startTime: Date,
  endTime: Date,
  excludeLessonId?: string,
) {
  const conflict = await prisma.lesson.findFirst({
    where: {
      instructorId,
      status: { not: 'cancelled' },
      id: excludeLessonId ? { not: excludeLessonId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  })
  if (conflict) {
    throw new Error('This instructor already has a lesson scheduled during that time.')
  }
}

export function registerLessonHandlers() {
  ipcMain.handle('lessons:list', async (_event, filter?: LessonListFilter) => {
    return prisma.lesson.findMany({
      where: {
        instructorId: filter?.instructorId,
        startTime: filter?.start ? { gte: new Date(filter.start) } : undefined,
        endTime: filter?.end ? { lte: new Date(filter.end) } : undefined,
      },
      include,
      orderBy: { startTime: 'asc' },
    })
  })

  ipcMain.handle('lessons:create', async (_event, input: LessonInput) => {
    const startTime = new Date(input.startTime)
    const endTime = new Date(input.endTime)
    if (endTime <= startTime) {
      throw new Error('Lesson end time must be after the start time.')
    }
    await assertNoOverlap(input.instructorId, startTime, endTime)
    return prisma.lesson.create({
      data: {
        studentId: input.studentId,
        instructorId: input.instructorId,
        startTime,
        endTime,
        notes: input.notes,
      },
      include,
    })
  })

  ipcMain.handle('lessons:update', async (_event, id: string, input: Partial<LessonInput>) => {
    const existing = await prisma.lesson.findUniqueOrThrow({ where: { id } })
    const startTime = input.startTime ? new Date(input.startTime) : existing.startTime
    const endTime = input.endTime ? new Date(input.endTime) : existing.endTime
    const instructorId = input.instructorId ?? existing.instructorId
    if (endTime <= startTime) {
      throw new Error('Lesson end time must be after the start time.')
    }
    await assertNoOverlap(instructorId, startTime, endTime, id)
    return prisma.lesson.update({
      where: { id },
      data: {
        studentId: input.studentId,
        instructorId: input.instructorId,
        startTime,
        endTime,
        notes: input.notes,
      },
      include,
    })
  })

  ipcMain.handle('lessons:updateStatus', async (_event, id: string, status: LessonStatus) => {
    return prisma.lesson.update({ where: { id }, data: { status }, include })
  })

  ipcMain.handle('lessons:delete', async (_event, id: string) => {
    await prisma.lesson.delete({ where: { id } })
  })
}
