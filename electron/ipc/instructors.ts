import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import { endActiveSeriesForInstructor } from './recurringSeries.ts'
import type { InstructorInput } from '../../shared/types.ts'

// "Upcoming" here means not yet a real recorded outcome — this is exactly
// what deleting an instructor clears out, so it's also what's counted for
// the delete confirmation.
const notYetHappened: { notIn: string[] } = { notIn: ['completed', 'no_show'] }

const instructorInclude = {
  _count: { select: { lessons: { where: { status: notYetHappened } } } },
} satisfies Prisma.InstructorInclude

function serializeInstructor<T extends { _count: { lessons: number } }>(instructor: T) {
  const { _count, ...rest } = instructor
  return { ...rest, upcomingLessonCount: _count.lessons }
}

export function registerInstructorHandlers() {
  ipcMain.handle('instructors:list', async () => {
    const instructors = await prisma.instructor.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: instructorInclude,
    })
    return instructors.map(serializeInstructor)
  })

  ipcMain.handle('instructors:create', async (_event, input: InstructorInput) => {
    const instructor = await prisma.instructor.create({ data: input, include: instructorInclude })
    return serializeInstructor(instructor)
  })

  ipcMain.handle('instructors:update', async (_event, id: string, input: Partial<InstructorInput>) => {
    const instructor = await prisma.instructor.update({ where: { id }, data: input, include: instructorInclude })
    return serializeInstructor(instructor)
  })

  // Deleting an instructor always clears their upcoming lessons first (real
  // history — completed/no_show — is never touched here), then attempts the
  // hard delete. If history still blocks it, falls back to archiving, same
  // as students.
  ipcMain.handle('instructors:delete', async (_event, id: string) => {
    await prisma.$transaction([
      prisma.lesson.deleteMany({ where: { instructorId: id, status: notYetHappened } }),
      // Only series with no historical lessons left can be removed — one
      // that still has a completed/no_show lesson pointing at it would
      // hit the same foreign-key wall as the instructor itself.
      prisma.recurringSeries.deleteMany({
        where: { instructorId: id, lessons: { none: { status: { in: ['completed', 'no_show'] } } } },
      }),
    ])
    try {
      await prisma.instructor.delete({ where: { id } })
      return { archived: false }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        await prisma.instructor.update({ where: { id }, data: { active: false } })
        await endActiveSeriesForInstructor(id)
        return { archived: true }
      }
      throw err
    }
  })
}
