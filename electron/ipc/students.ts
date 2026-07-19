import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import { endActiveSeriesForStudent } from './recurringSeries.ts'
import type { StudentInput } from '../../shared/types.ts'

const studentInclude = {
  familyMembers: { orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
  _count: { select: { lessons: true } },
} satisfies Prisma.StudentInclude

function serializeStudent<T extends { _count: { lessons: number } }>(student: T) {
  const { _count, ...rest } = student
  return { ...rest, lessonCount: _count.lessons }
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
    const student = await prisma.student.create({ data: input, include: studentInclude })
    return serializeStudent(student)
  })

  ipcMain.handle('students:update', async (_event, id: string, input: Partial<StudentInput>) => {
    const student = await prisma.student.update({ where: { id }, data: input, include: studentInclude })
    return serializeStudent(student)
  })

  // A student with any lesson history can't be hard-deleted (foreign key), so
  // that case falls back to archiving them instead, keeping history intact —
  // unless force is set, which deletes their lessons/recurring series first
  // so the student can be hard-deleted regardless.
  ipcMain.handle('students:delete', async (_event, id: string, options?: { force?: boolean }) => {
    if (options?.force) {
      await prisma.$transaction([
        prisma.lesson.deleteMany({ where: { studentId: id } }),
        prisma.recurringSeries.deleteMany({ where: { studentId: id } }),
        prisma.student.delete({ where: { id } }),
      ])
      return { archived: false }
    }
    try {
      await prisma.student.delete({ where: { id } })
      return { archived: false }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        await prisma.student.update({ where: { id }, data: { active: false } })
        await endActiveSeriesForStudent(id)
        return { archived: true }
      }
      throw err
    }
  })
}
