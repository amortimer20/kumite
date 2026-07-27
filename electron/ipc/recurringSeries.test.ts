import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'
import { addDaysIso, isoDateOf } from '../recurringSeriesLogic.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { createRecurringSeries, endRecurringSeriesFrom, deleteRecurringSeriesFrom } = await import('./recurringSeries.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

// Offsets from "today" so occurrence counts stay small (~12 weeks out) no
// matter when this suite actually runs, instead of hardcoding a calendar
// date that could be years in the past by the time this test is read again.
function futureIsoDate(daysFromNow: number) {
  return addDaysIso(isoDateOf(new Date()), daysFromNow)
}

async function makeStudentAndInstructor() {
  const student = await mockPrisma.student.create({ data: { firstName: 'Maya', lastName: 'Chen' } })
  const instructor = await mockPrisma.instructor.create({ data: { firstName: 'Sam', lastName: 'Rivera' } })
  return { student, instructor }
}

describe('createRecurringSeries', () => {
  it('generates weekly occurrences with notes only on the first one', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    const lessons = await createRecurringSeries({
      studentId: student.id,
      instructorId: instructor.id,
      startDate: futureIsoDate(7),
      startTime: '15:00',
      endTime: '15:30',
      notes: 'first note',
    })
    expect(lessons.length).toBeGreaterThan(1)
    expect(lessons[0].notes).toBe('first note')
    expect(lessons.slice(1).every((l) => l.notes === null)).toBe(true)
    const starts = lessons.map((l) => new Date(l.startTime).getTime())
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(7 * 24 * 60 * 60 * 1000)
    }
  })

  it('creates a group series with no student and a title', async () => {
    const { instructor } = await makeStudentAndInstructor()
    const lessons = await createRecurringSeries({
      type: 'group',
      title: 'Cardio',
      instructorId: instructor.id,
      startDate: futureIsoDate(8),
      startTime: '16:00',
      endTime: '17:00',
    })
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessons.every((l) => l.studentId === null && l.type === 'group' && l.title === 'Cardio')).toBe(true)
  })

  it('rejects a series that would overlap an existing lesson for the instructor', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    const startDate = futureIsoDate(9)
    await mockPrisma.lesson.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        startTime: new Date(`${startDate}T15:00:00`),
        endTime: new Date(`${startDate}T15:30:00`),
      },
    })
    await expect(
      createRecurringSeries({
        studentId: student.id,
        instructorId: instructor.id,
        startDate,
        startTime: '15:00',
        endTime: '15:30',
      }),
    ).rejects.toThrow('already has a lesson scheduled')
  })
})

describe('endRecurringSeriesFrom', () => {
  it('cancels future lessons but leaves past ones alone, and deactivates the series', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    const lessons = await createRecurringSeries({
      studentId: student.id,
      instructorId: instructor.id,
      startDate: futureIsoDate(10),
      startTime: '15:00',
      endTime: '15:30',
    })
    const seriesId = lessons[0].recurringSeriesId!
    await endRecurringSeriesFrom(seriesId, lessons[1].startTime.toISOString())

    const refreshed = await mockPrisma.lesson.findMany({
      where: { recurringSeriesId: seriesId },
      orderBy: { startTime: 'asc' },
    })
    expect(refreshed.length).toBe(lessons.length) // nothing deleted
    expect(refreshed[0].status).toBe('scheduled')
    expect(refreshed.slice(1).every((l) => l.status === 'cancelled')).toBe(true)

    const series = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: seriesId } })
    expect(series.active).toBe(false)
  })
})

describe('deleteRecurringSeriesFrom', () => {
  it('hard-deletes future lessons but preserves completed/no_show ones even if in range', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    const lessons = await createRecurringSeries({
      studentId: student.id,
      instructorId: instructor.id,
      startDate: futureIsoDate(11),
      startTime: '15:00',
      endTime: '15:30',
    })
    const seriesId = lessons[0].recurringSeriesId!
    await mockPrisma.lesson.update({ where: { id: lessons[1].id }, data: { status: 'completed' } })

    await deleteRecurringSeriesFrom(seriesId, lessons[0].startTime.toISOString())

    const remaining = await mockPrisma.lesson.findMany({ where: { recurringSeriesId: seriesId } })
    expect(remaining.length).toBe(1)
    expect(remaining[0].id).toBe(lessons[1].id)
    expect(remaining[0].status).toBe('completed')

    const series = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: seriesId } })
    expect(series.active).toBe(false)
  })
})
