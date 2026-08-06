import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { assertNoOverlap, createLesson, updateLesson } = await import('./lessons.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>
let instructorId: string
let otherInstructorId: string
let studentId: string

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
  const inst = await mockPrisma.instructor.create({ data: { firstName: 'Main', lastName: 'Sensei' } })
  instructorId = inst.id
  const other = await mockPrisma.instructor.create({ data: { firstName: 'Other', lastName: 'Sensei' } })
  otherInstructorId = other.id
  const student = await mockPrisma.student.create({ data: { firstName: 'Sam', lastName: 'Student' } })
  studentId = student.id
})

afterAll(async () => {
  await testDb.cleanup()
})

// A 9:00-10:00 lesson on the main instructor that most overlap tests probe
// against. Recreated per test (the DB is shared across the file) and
// returned so tests that need its id (the self-conflict case) have it.
async function seedNineToTen(status = 'scheduled') {
  return mockPrisma.lesson.create({
    data: {
      instructorId,
      type: 'group',
      title: 'Cardio',
      startTime: new Date('2025-01-06T09:00:00'),
      endTime: new Date('2025-01-06T10:00:00'),
      status,
    },
  })
}

describe('assertNoOverlap', () => {
  it('throws when a new lesson overlaps an existing one', async () => {
    await seedNineToTen()
    // 9:30-10:30 straddles the end of the 9:00-10:00 lesson.
    await expect(
      assertNoOverlap(instructorId, new Date('2025-01-06T09:30:00'), new Date('2025-01-06T10:30:00')),
    ).rejects.toThrow(/already has a lesson scheduled/)
    await mockPrisma.lesson.deleteMany({})
  })

  // Back-to-back is not an overlap: the query is startTime < end AND
  // endTime > start, both strict, so a lesson ending exactly when the next
  // begins doesn't collide. Booking the top of every hour must be allowed.
  it('allows a lesson that starts exactly when the previous one ends', async () => {
    await seedNineToTen()
    await expect(
      assertNoOverlap(instructorId, new Date('2025-01-06T10:00:00'), new Date('2025-01-06T11:00:00')),
    ).resolves.toBeUndefined()
    await mockPrisma.lesson.deleteMany({})
  })

  it('ignores a cancelled lesson when checking for conflicts', async () => {
    await seedNineToTen('cancelled')
    // Same slot as the cancelled lesson — should be free to rebook.
    await expect(
      assertNoOverlap(instructorId, new Date('2025-01-06T09:00:00'), new Date('2025-01-06T10:00:00')),
    ).resolves.toBeUndefined()
    await mockPrisma.lesson.deleteMany({})
  })

  it('does not conflict a lesson with itself when excludeLessonId is passed', async () => {
    const lesson = await seedNineToTen()
    // Re-saving the same lesson at the same time must not trip on its own row.
    await expect(
      assertNoOverlap(instructorId, new Date('2025-01-06T09:00:00'), new Date('2025-01-06T10:00:00'), lesson.id),
    ).resolves.toBeUndefined()
    await mockPrisma.lesson.deleteMany({})
  })

  it('does not conflict across different instructors', async () => {
    await seedNineToTen()
    await expect(
      assertNoOverlap(otherInstructorId, new Date('2025-01-06T09:00:00'), new Date('2025-01-06T10:00:00')),
    ).resolves.toBeUndefined()
    await mockPrisma.lesson.deleteMany({})
  })
})

describe('updateLesson merge semantics', () => {
  // An intro lesson carries a prospect name and (optional) phone. Used to
  // probe both merge directions on the same row: a phone that's absent from
  // the update is kept; one passed as explicit null is cleared.
  async function seedIntro() {
    return createLesson({
      type: 'intro',
      prospectName: 'Pat Prospect',
      prospectPhone: '555-0100',
      instructorId: otherInstructorId,
      startTime: '2025-02-10T14:00:00',
      endTime: '2025-02-10T15:00:00',
    })
  }

  it('keeps fields that are absent from the update', async () => {
    const lesson = await seedIntro()
    // Touch only the notes — everything else must be preserved.
    const updated = await updateLesson(lesson.id, { notes: 'Followed up by phone' })
    expect(updated.prospectName).toBe('Pat Prospect')
    expect(updated.prospectPhone).toBe('555-0100')
    expect(updated.notes).toBe('Followed up by phone')
    await mockPrisma.lesson.deleteMany({})
  })

  it('clears a field that is passed as an explicit null', async () => {
    const lesson = await seedIntro()
    const updated = await updateLesson(lesson.id, { prospectPhone: null })
    expect(updated.prospectPhone).toBeNull()
    // prospectName was absent from the update, so it stays.
    expect(updated.prospectName).toBe('Pat Prospect')
    await mockPrisma.lesson.deleteMany({})
  })

  it('rejects an update that would leave the end time at or before the start', async () => {
    const lesson = await seedIntro()
    await expect(updateLesson(lesson.id, { endTime: '2025-02-10T14:00:00' })).rejects.toThrow(
      /end time must be after/,
    )
    await mockPrisma.lesson.deleteMany({})
  })

  // Switching a private lesson to group must drop the student and require a
  // title — the type gate in the write, exercised through the merge path.
  it('drops the student when a private lesson is changed to a group lesson', async () => {
    const priv = await createLesson({
      type: 'private',
      studentId,
      instructorId: otherInstructorId,
      startTime: '2025-03-01T09:00:00',
      endTime: '2025-03-01T10:00:00',
    })
    const updated = await updateLesson(priv.id, { type: 'group', title: 'Sparring' })
    expect(updated.type).toBe('group')
    expect(updated.studentId).toBeNull()
    expect(updated.title).toBe('Sparring')
    await mockPrisma.lesson.deleteMany({})
  })
})
