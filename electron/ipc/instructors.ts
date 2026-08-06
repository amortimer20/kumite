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

// Reject empty/whitespace names, checked only when present so it serves both
// create and update — same pattern as students/pos.
export function assertValidInstructorInput(input: Partial<InstructorInput>) {
  if (input.firstName !== undefined && input.firstName.trim() === '') {
    throw new Error('First name is required.')
  }
  if (input.lastName !== undefined && input.lastName.trim() === '') {
    throw new Error('Last name is required.')
  }
}

// Deleting an instructor always clears their upcoming lessons first (real
// history — completed/no_show — is never touched here) *before* deciding
// whether the instructor itself hard-deletes or falls back to archiving —
// so both outcomes leave no stale upcoming lessons behind, one-off or
// recurring-series-generated alike.
export async function deleteInstructor(id: string) {
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
    assertValidInstructorInput(input)
    const instructor = await prisma.instructor.create({ data: input, include: instructorInclude })
    return serializeInstructor(instructor)
  })

  ipcMain.handle('instructors:update', async (_event, id: string, input: Partial<InstructorInput>) => {
    assertValidInstructorInput(input)
    const instructor = await prisma.instructor.update({ where: { id }, data: input, include: instructorInclude })
    return serializeInstructor(instructor)
  })

  ipcMain.handle('instructors:delete', (_event, id: string) => deleteInstructor(id))
}
