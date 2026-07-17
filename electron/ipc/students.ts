import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
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

  ipcMain.handle('students:delete', async (_event, id: string) => {
    await prisma.student.delete({ where: { id } })
  })
}
