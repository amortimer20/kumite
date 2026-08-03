import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { LessonInput, LessonListFilter, LessonStatus } from '../../shared/types.ts'

const include = { student: true, instructor: true } as const

// "private" requires a student (and no title); "group" requires a title
// (and no student); "intro" requires a prospect name — SQLite has no enum
// support, so this is enforced here rather than at the schema level, same
// as LessonStatus. prospectName is optional here (rather than required)
// so recurringSeries.ts's existing call sites don't need to pass it — a
// recurring series can never be type "intro" (RecurringSeriesInput.type
// excludes it), so this branch is never reached from that caller.
export function assertValidLessonInput(
  type: string,
  studentId: string | null | undefined,
  title: string | null | undefined,
  prospectName?: string | null,
) {
  if (type === 'private') {
    if (!studentId) throw new Error('A private lesson needs a student.')
  } else if (type === 'group') {
    if (!title) throw new Error('A group lesson needs a title.')
  } else if (type === 'intro') {
    if (!prospectName) throw new Error('An intro lesson needs a prospect name.')
  } else {
    throw new Error(`Unknown lesson type: ${type}`)
  }
}

export async function assertNoOverlap(
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
        studentId: filter?.studentId,
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
    const type = input.type ?? 'private'
    assertValidLessonInput(type, input.studentId, input.title, input.prospectName)
    await assertNoOverlap(input.instructorId, startTime, endTime)
    return prisma.lesson.create({
      data: {
        studentId: type === 'private' ? input.studentId : null,
        instructorId: input.instructorId,
        type,
        title: type === 'group' ? input.title : null,
        prospectName: type === 'intro' ? input.prospectName : null,
        prospectPhone: type === 'intro' ? input.prospectPhone : null,
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
    const type = input.type ?? existing.type
    const studentId = 'studentId' in input ? input.studentId : existing.studentId
    const title = 'title' in input ? input.title : existing.title
    const prospectName = 'prospectName' in input ? input.prospectName : existing.prospectName
    const prospectPhone = 'prospectPhone' in input ? input.prospectPhone : existing.prospectPhone
    if (endTime <= startTime) {
      throw new Error('Lesson end time must be after the start time.')
    }
    assertValidLessonInput(type, studentId, title, prospectName)
    await assertNoOverlap(instructorId, startTime, endTime, id)
    return prisma.lesson.update({
      where: { id },
      data: {
        studentId: type === 'private' ? studentId : null,
        instructorId,
        type,
        title: type === 'group' ? title : null,
        prospectName: type === 'intro' ? prospectName : null,
        prospectPhone: type === 'intro' ? prospectPhone : null,
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
