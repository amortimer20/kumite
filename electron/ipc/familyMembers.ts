import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { FamilyMemberInput } from '../../shared/types.ts'

export function registerFamilyMemberHandlers() {
  ipcMain.handle('familyMembers:create', async (_event, studentId: string, input: FamilyMemberInput) => {
    return prisma.familyMember.create({ data: { ...input, studentId } })
  })

  ipcMain.handle('familyMembers:update', async (_event, id: string, input: Partial<FamilyMemberInput>) => {
    return prisma.familyMember.update({ where: { id }, data: input })
  })

  ipcMain.handle('familyMembers:delete', async (_event, id: string) => {
    await prisma.familyMember.delete({ where: { id } })
  })
}
