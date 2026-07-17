import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
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

  // Same archive-on-delete fallback as students:delete, see comment there.
  ipcMain.handle('instructors:delete', async (_event, id: string) => {
    try {
      await prisma.instructor.delete({ where: { id } })
      return { archived: false }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        await prisma.instructor.update({ where: { id }, data: { active: false } })
        return { archived: true }
      }
      throw err
    }
  })
}
