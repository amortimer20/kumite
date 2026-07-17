import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { InstructorInput } from '../../shared/types.ts'

export function registerInstructorHandlers() {
  ipcMain.handle('instructors:list', async () => {
    return prisma.instructor.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
  })

  ipcMain.handle('instructors:create', async (_event, input: InstructorInput) => {
    return prisma.instructor.create({ data: input })
  })

  ipcMain.handle('instructors:update', async (_event, id: string, input: Partial<InstructorInput>) => {
    return prisma.instructor.update({ where: { id }, data: input })
  })

  ipcMain.handle('instructors:delete', async (_event, id: string) => {
    await prisma.instructor.delete({ where: { id } })
  })
}
