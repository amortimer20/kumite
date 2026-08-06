import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import { endActiveSeriesForStudent } from './recurringSeries.ts'
import { cancelActiveMembershipForStudent } from './memberships.ts'
import type { StudentInput } from '../../shared/types.ts'

const studentInclude = {
  familyMembers: { orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
  _count: { select: { lessons: true } },
} satisfies Prisma.StudentInclude

function serializeStudent<T extends { _count: { lessons: number } }>(student: T) {
  const { _count, ...rest } = student
  return { ...rest, lessonCount: _count.lessons }
}

// SQLite has no NOT-NULL-with-content constraint, so an empty or
// whitespace-only name would be accepted and then render as a blank row
// everywhere. Checked only when the field is present, so the same guard
// serves both create and update — same shape as pos.ts's assertValidItemInput.
export function assertValidStudentInput(input: Partial<StudentInput>) {
  if (input.firstName !== undefined && input.firstName.trim() === '') {
    throw new Error('First name is required.')
  }
  if (input.lastName !== undefined && input.lastName.trim() === '') {
    throw new Error('Last name is required.')
  }
}

// memberSince arrives as an ISO string (or null/undefined) from the renderer;
// Prisma's DateTime column needs an actual Date, and `undefined` must stay
// undefined (untouched) rather than becoming an unintended null on update.
function toStudentData<T extends Partial<StudentInput>>(input: T) {
  return {
    ...input,
    memberSince: input.memberSince === undefined ? undefined : input.memberSince ? new Date(input.memberSince) : null,
  }
}

export function registerStudentHandlers() {
  ipcMain.handle('students:list', async () => {
    const students = await prisma.student.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: studentInclude,
    })
    return students.map(serializeStudent)
  })

  ipcMain.handle('students:create', async (_event, input: StudentInput) => {
    // agreedToWaiver is transient — the server stamps its own timestamp
    // rather than trusting a client-supplied one, so the record reflects
    // when the request actually arrived, not something editable client-side.
    assertValidStudentInput(input)
    const { agreedToWaiver, ...studentInput } = input
    const student = await prisma.student.create({
      data: { ...toStudentData(studentInput), waiverAgreedAt: agreedToWaiver ? new Date() : null },
      include: studentInclude,
    })
    return serializeStudent(student)
  })

  ipcMain.handle('students:update', async (_event, id: string, input: Partial<StudentInput>) => {
    assertValidStudentInput(input)
    const student = await prisma.student.update({ where: { id }, data: toStudentData(input), include: studentInclude })
    return serializeStudent(student)
  })

  ipcMain.handle('students:delete', async (_event, id: string, options?: { force?: boolean }) => {
    return deleteStudent(id, options)
  })
}

// Whether deleting this student would destroy or orphan anything worth
// keeping. This is checked explicitly rather than inferred from a foreign-key
// error: Lesson.studentId and RecurringSeries.studentId are both
// `ON DELETE SET NULL`, so deleting a student with lessons *succeeds* and
// silently leaves behind nameless private lessons. Only StudentMembership
// still restricts, so relying on the error meant students without a membership
// were hard-deleted even when the caller asked to archive.
async function studentHasHistory(id: string) {
  const [lessons, series, memberships] = await Promise.all([
    prisma.lesson.count({ where: { studentId: id } }),
    prisma.recurringSeries.count({ where: { studentId: id } }),
    prisma.studentMembership.count({ where: { studentId: id } }),
  ])
  return lessons > 0 || series > 0 || memberships > 0
}

async function archiveStudent(id: string) {
  await prisma.student.update({ where: { id }, data: { active: false } })
  await endActiveSeriesForStudent(id)
  await cancelActiveMembershipForStudent(id)
}

// A student with lesson, series, or membership history is archived rather than
// deleted, so that history stays attributable — unless force is set, which
// deletes those dependents first so the student can be removed outright.
// Exported for tests; the IPC handler is a thin wrapper.
export async function deleteStudent(id: string, options?: { force?: boolean }) {
  if (options?.force) {
    await prisma.$transaction([
      prisma.lesson.deleteMany({ where: { studentId: id } }),
      prisma.recurringSeries.deleteMany({ where: { studentId: id } }),
      // Payments/adjustments must go before their StudentMembership rows,
      // which must go before the student itself — all restrict-on-delete.
      prisma.membershipUsageAdjustment.deleteMany({ where: { studentMembership: { studentId: id } } }),
      prisma.membershipPayment.deleteMany({ where: { studentMembership: { studentId: id } } }),
      prisma.studentMembership.deleteMany({ where: { studentId: id } }),
      prisma.student.delete({ where: { id } }),
    ])
    return { archived: false }
  }
  if (await studentHasHistory(id)) {
    await archiveStudent(id)
    return { archived: true }
  }
  try {
    await prisma.student.delete({ where: { id } })
    return { archived: false }
  } catch (err) {
    // Belt and braces: if some dependent the check above doesn't know about
    // still restricts the delete, archive rather than surfacing a raw
    // foreign-key error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      await archiveStudent(id)
      return { archived: true }
    }
    throw err
  }
}
