import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { deleteInstructor, assertValidInstructorInput } = await import('./instructors.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

async function makeInstructor() {
  return mockPrisma.instructor.create({ data: { firstName: 'Sam', lastName: 'Rivera' } })
}

async function makeStudent() {
  return mockPrisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen' } })
}

const DAY_MS = 86_400_000

describe('assertValidInstructorInput', () => {
  it('rejects blank names but accepts real ones', () => {
    expect(() => assertValidInstructorInput({ firstName: '', lastName: 'Rivera' })).toThrow(/First name/)
    expect(() => assertValidInstructorInput({ firstName: 'Sam', lastName: '   ' })).toThrow(/Last name/)
    expect(() => assertValidInstructorInput({ firstName: 'Sam', lastName: 'Rivera' })).not.toThrow()
  })

  it('ignores names absent from a partial update', () => {
    expect(() => assertValidInstructorInput({ email: 'sam@dojo.test' })).not.toThrow()
  })
})

describe('deleteInstructor', () => {
  it('hard-deletes an instructor with only upcoming lessons', async () => {
    const instructor = await makeInstructor()
    const student = await makeStudent()
    await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() + DAY_MS),
        endTime: new Date(Date.now() + DAY_MS + 1_800_000),
      },
    })

    const result = await deleteInstructor(instructor.id)
    expect(result.archived).toBe(false)
    expect(await mockPrisma.instructor.findUnique({ where: { id: instructor.id } })).toBeNull()
  })

  // Regression test: this exact scenario was once broken (one-off upcoming
  // lessons weren't cleared on the archive-fallback path) but was already
  // fixed before this test existed — this locks the fix in.
  it('archiving clears one-off and recurring-series upcoming lessons, preserves history, and deactivates the surviving series', async () => {
    const instructor = await makeInstructor()
    const student = await makeStudent()

    // Real history — this is what blocks the hard delete.
    await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() - 7 * DAY_MS),
        endTime: new Date(Date.now() - 7 * DAY_MS + 1_800_000),
        status: 'completed',
      },
    })

    // A one-off upcoming lesson, unrelated to any series.
    const oneOff = await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() + DAY_MS),
        endTime: new Date(Date.now() + DAY_MS + 1_800_000),
      },
    })

    // An active recurring series with a historical lesson attached (so the
    // series itself survives) plus an upcoming occurrence (should be cleared).
    const series = await mockPrisma.recurringSeries.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        dayOfWeek: 1,
        startTime: '15:00',
        endTime: '15:30',
        generatedUntil: new Date(Date.now() + 30 * DAY_MS),
      },
    })
    await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() - 14 * DAY_MS),
        endTime: new Date(Date.now() - 14 * DAY_MS + 1_800_000),
        status: 'completed',
        recurringSeriesId: series.id,
      },
    })
    const seriesUpcoming = await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(Date.now() + 7 * DAY_MS),
        endTime: new Date(Date.now() + 7 * DAY_MS + 1_800_000),
        recurringSeriesId: series.id,
      },
    })

    const result = await deleteInstructor(instructor.id)
    expect(result.archived).toBe(true)

    const instructorRow = await mockPrisma.instructor.findUniqueOrThrow({ where: { id: instructor.id } })
    expect(instructorRow.active).toBe(false)

    expect(await mockPrisma.lesson.findUnique({ where: { id: oneOff.id } })).toBeNull()
    expect(await mockPrisma.lesson.findUnique({ where: { id: seriesUpcoming.id } })).toBeNull()

    const remainingLessons = await mockPrisma.lesson.findMany({ where: { instructorId: instructor.id } })
    expect(remainingLessons.length).toBe(2)
    expect(remainingLessons.every((l) => l.status === 'completed')).toBe(true)

    const seriesRow = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(seriesRow.active).toBe(false)
  })
})
