import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import type { FamilyMemberInput } from '../../shared/types.ts'

// Reject empty/whitespace names, checked only when present so it serves both
// create and update — same pattern as students/instructors/pos.
export function assertValidFamilyMemberInput(input: Partial<FamilyMemberInput>) {
  if (input.firstName !== undefined && input.firstName.trim() === '') {
    throw new Error('First name is required.')
  }
  if (input.lastName !== undefined && input.lastName.trim() === '') {
    throw new Error('Last name is required.')
  }
}

export function registerFamilyMemberHandlers() {
  ipcMain.handle('familyMembers:create', async (_event, studentId: string, input: FamilyMemberInput) => {
    assertValidFamilyMemberInput(input)
    return prisma.familyMember.create({ data: { ...input, studentId } })
  })

  ipcMain.handle('familyMembers:update', async (_event, id: string, input: Partial<FamilyMemberInput>) => {
    assertValidFamilyMemberInput(input)
    return prisma.familyMember.update({ where: { id }, data: input })
  })

  ipcMain.handle('familyMembers:delete', async (_event, id: string) => {
    await prisma.familyMember.delete({ where: { id } })
  })
}
