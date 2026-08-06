import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { assertValidBusinessHours, updateBusinessHours } = await import('./businessHours.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

describe('assertValidBusinessHours', () => {
  it('rejects a close time at or before the open time on an open day', () => {
    expect(() => assertValidBusinessHours(false, '09:00', '08:00')).toThrow(/after opening/)
    expect(() => assertValidBusinessHours(false, '09:00', '09:00')).toThrow(/after opening/)
  })

  it('accepts a close time after the open time', () => {
    expect(() => assertValidBusinessHours(false, '09:00', '20:00')).not.toThrow()
  })

  // A closed day has no meaningful hours, so its times aren't constrained.
  it('ignores the times when the day is marked closed', () => {
    expect(() => assertValidBusinessHours(true, '20:00', '09:00')).not.toThrow()
  })
})

describe('updateBusinessHours', () => {
  it('validates against the stored open time when only the close time is patched', async () => {
    // The row starts at the seeded default 09:00-20:00.
    await updateBusinessHours(1, {})
    // Patching just the close time to before the stored 09:00 open must be
    // caught even though the patch alone carries no open time.
    await expect(updateBusinessHours(1, { closeTime: '08:00' })).rejects.toThrow(/after opening/)
    // The rejected write left the row untouched.
    const row = await mockPrisma.businessHours.findUniqueOrThrow({ where: { dayOfWeek: 1 } })
    expect(row.closeTime).toBe('20:00')
  })

  it('applies a valid single-field patch', async () => {
    await updateBusinessHours(2, {})
    const updated = await updateBusinessHours(2, { closeTime: '18:30' })
    expect(updated.openTime).toBe('09:00')
    expect(updated.closeTime).toBe('18:30')
  })

  it('lets a backwards range through once the day is closed', async () => {
    const updated = await updateBusinessHours(3, { isClosed: true, openTime: '20:00', closeTime: '09:00' })
    expect(updated.isClosed).toBe(true)
  })
})
