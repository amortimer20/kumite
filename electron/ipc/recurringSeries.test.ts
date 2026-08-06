import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'
import { addDaysIso, combineDateAndTime, isoDateOf } from '../recurringSeriesLogic.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { createRecurringSeries, endRecurringSeriesFrom, deleteRecurringSeriesFrom, extendAllActiveSeries } =
  await import('./recurringSeries.ts')

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

  it('rejects a start date beyond the 12-week rolling window with a clear message', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    // 13 weeks out — the first occurrence is already past the horizon, so no
    // dates are generated. This used to make lastOccurrence undefined and
    // produce an Invalid Date, surfacing as a raw Prisma error.
    await expect(
      createRecurringSeries({
        studentId: student.id,
        instructorId: instructor.id,
        startDate: futureIsoDate(7 * 13),
        startTime: '15:00',
        endTime: '15:30',
      }),
    ).rejects.toThrow('too far ahead')
  })

  it('skips occurrences before today for a back-dated series', async () => {
    const { student, instructor } = await makeStudentAndInstructor()
    const lessons = await createRecurringSeries({
      studentId: student.id,
      instructorId: instructor.id,
      startDate: futureIsoDate(-14),
      startTime: '15:00',
      endTime: '15:30',
      notes: 'first note',
    })
    const today = isoDateOf(new Date())
    expect(lessons.length).toBeGreaterThan(0)
    // No past occurrences were materialised — those would post as "scheduled"
    // lessons that silently spend the current period's included lessons.
    expect(lessons.every((l) => isoDateOf(l.startTime) >= today)).toBe(true)
    expect(lessons.some((l) => isoDateOf(l.startTime) === futureIsoDate(-7))).toBe(false)
    // The note lands on the first *generated* occurrence (today), not a
    // dropped past one.
    expect(isoDateOf(lessons[0].startTime)).toBe(today)
    expect(lessons[0].notes).toBe('first note')
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

describe('extendAllActiveSeries', () => {
  // Build a series row directly (rather than via createRecurringSeries, which
  // pre-generates up to the horizon) so generatedUntil can be positioned to
  // leave specific future weeks still to generate.
  async function makeSeries(generatedUntilIso: string) {
    const { student, instructor } = await makeStudentAndInstructor()
    const series = await mockPrisma.recurringSeries.create({
      data: {
        studentId: student.id,
        instructorId: instructor.id,
        type: 'private',
        dayOfWeek: 1,
        startTime: '15:00',
        endTime: '15:30',
        generatedUntil: combineDateAndTime(generatedUntilIso, '15:00'),
      },
    })
    return { student, instructor, series }
  }

  function startAt(iso: string) {
    return new Date(`${iso}T15:00:00`).getTime()
  }

  it('retries a week skipped for a conflict once the conflict clears', async () => {
    // First ungenerated week is generatedUntil + 7.
    const { instructor, series } = await makeSeries(futureIsoDate(1))
    const blockedIso = futureIsoDate(8)
    const laterIso = futureIsoDate(15)
    // A one-off booking blocks the instructor at the first new week.
    const conflict = await mockPrisma.lesson.create({
      data: {
        instructorId: instructor.id,
        startTime: new Date(`${blockedIso}T15:00:00`),
        endTime: new Date(`${blockedIso}T15:30:00`),
      },
    })

    await extendAllActiveSeries()

    const seriesLessons = () =>
      mockPrisma.lesson.findMany({ where: { recurringSeriesId: series.id }, orderBy: { startTime: 'asc' } })
    let lessons = await seriesLessons()
    // The blocked week is skipped...
    expect(lessons.some((l) => l.startTime.getTime() === startAt(blockedIso))).toBe(false)
    // ...but later weeks still generate (skip-and-continue, not stop-at-conflict)...
    expect(lessons.some((l) => l.startTime.getTime() === startAt(laterIso))).toBe(true)
    // ...and generatedUntil is held at the week before the conflict so the
    // skipped week is retried rather than lost behind the mark forever.
    let refreshed = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(isoDateOf(refreshed.generatedUntil)).toBe(futureIsoDate(1))

    // Remove the conflict and run the next startup.
    await mockPrisma.lesson.delete({ where: { id: conflict.id } })
    await extendAllActiveSeries()

    lessons = await seriesLessons()
    // The previously-skipped week now exists, and no duplicate later weeks.
    expect(lessons.filter((l) => l.startTime.getTime() === startAt(blockedIso)).length).toBe(1)
    expect(lessons.filter((l) => l.startTime.getTime() === startAt(laterIso)).length).toBe(1)
    refreshed = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(refreshed.generatedUntil.getTime()).toBeGreaterThan(startAt(blockedIso))
  })

  it('does not materialise past weeks when generatedUntil is stale', async () => {
    // The app was closed for three weeks: generatedUntil is now well behind.
    const { series } = await makeSeries(futureIsoDate(-21))

    await extendAllActiveSeries()

    const lessons = await mockPrisma.lesson.findMany({ where: { recurringSeriesId: series.id } })
    const today = isoDateOf(new Date())
    expect(lessons.length).toBeGreaterThan(0)
    // No back-dated "scheduled" lessons that would eat the current period's
    // included lessons.
    expect(lessons.every((l) => isoDateOf(l.startTime) >= today)).toBe(true)
    expect(lessons.some((l) => isoDateOf(l.startTime) === futureIsoDate(-7))).toBe(false)
    // The mark still advances past the skipped past weeks (up into the future),
    // so those weeks aren't rescanned on every future startup.
    const refreshed = await mockPrisma.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })
    expect(refreshed.generatedUntil.getTime()).toBeGreaterThan(Date.now())
  })
})
