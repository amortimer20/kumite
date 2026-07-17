import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import { endActiveSeriesForStudent } from './recurringSeries.ts'
import type { StudentInput } from '../../shared/types.ts'

export function registerStudentHandlers() {
  ipcMain.handle('students:list', async () => {
    return prisma.student.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
  })

  ipcMain.handle('students:create', async (_event, input: StudentInput) => {
    return prisma.student.create({ data: input })
  })

  ipcMain.handle('students:update', async (_event, id: string, input: Partial<StudentInput>) => {
    return prisma.student.update({ where: { id }, data: input })
  })

  // A student with any lesson history can't be hard-deleted (foreign key), so
  // that case falls back to archiving them instead, keeping history intact.
  ipcMain.handle('students:delete', async (_event, id: string) => {
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
