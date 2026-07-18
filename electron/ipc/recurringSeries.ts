import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import { assertNoOverlap } from './lessons.ts'
import type { RecurringSeriesInput } from '../../shared/types.ts'

const lessonInclude = { student: true, instructor: true } as const

// How far ahead occurrences are kept generated. Extended forward on every app
// startup by extendAllActiveSeries() so the window keeps rolling with time.
const ROLLING_WINDOW_WEEKS = 12

function isoDateOf(d: Date) {
  const offsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

function addDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDateOf(d)
}

function combineDateAndTime(isoDate: string, time: string) {
  return new Date(`${isoDate}T${time}:00`)
}

function rollingHorizon() {
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + ROLLING_WINDOW_WEEKS * 7)
  return horizon
}

export async function createRecurringSeries(input: RecurringSeriesInput) {
  const startTime = combineDateAndTime(input.startDate, input.startTime)
  const endTime = combineDateAndTime(input.startDate, input.endTime)
  if (endTime <= startTime) {
    throw new Error('Lesson end time must be after the start time.')
  }

  const dayOfWeek = new Date(`${input.startDate}T00:00:00`).getDay()
  const horizon = rollingHorizon()

  const occurrenceDates: string[] = []
  for (
    let iso = input.startDate;
    combineDateAndTime(iso, input.startTime) <= horizon;
    iso = addDaysIso(iso, 7)
  ) {
    occurrenceDates.push(iso)
  }

  // Validate the whole initial batch up front so creation is all-or-nothing.
  for (const iso of occurrenceDates) {
    await assertNoOverlap(
      input.instructorId,
      combineDateAndTime(iso, input.startTime),
      combineDateAndTime(iso, input.endTime),
    )
  }

  const lastOccurrence = occurrenceDates[occurrenceDates.length - 1]

  return prisma.$transaction(async (tx) => {
    const series = await tx.recurringSeries.create({
      data: {
        studentId: input.studentId,
        instructorId: input.instructorId,
        dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        generatedUntil: combineDateAndTime(lastOccurrence, input.startTime),
      },
    })
    for (const [index, iso] of occurrenceDates.entries()) {
      await tx.lesson.create({
        data: {
          studentId: input.studentId,
          instructorId: input.instructorId,
          startTime: combineDateAndTime(iso, input.startTime),
          endTime: combineDateAndTime(iso, input.endTime),
          // Only the first occurrence gets the note entered at creation time —
          // notes describe a specific lesson, not the whole series.
          notes: index === 0 ? input.notes : null,
          recurringSeriesId: series.id,
        },
      })
    }
    return tx.lesson.findMany({
      where: { recurringSeriesId: series.id },
      include: lessonInclude,
      orderBy: { startTime: 'asc' },
    })
  })
}

// Used when a student/instructor is archived (see endActiveSeriesMatching
// below) — that's not a delete, so affected lessons are marked cancelled
// rather than removed, preserving a "why did this disappear" trail.
export async function endRecurringSeriesFrom(seriesId: string, fromDateTime: string) {
  const cutoff = new Date(fromDateTime)
  await prisma.$transaction([
    prisma.recurringSeries.update({ where: { id: seriesId }, data: { active: false } }),
    prisma.lesson.updateMany({
      where: { recurringSeriesId: seriesId, startTime: { gte: cutoff } },
      data: { status: 'cancelled' },
    }),
  ])
}

// Used when the user explicitly deletes a recurring lesson "and all future
// lessons" from the Schedule tab. Unlike endRecurringSeriesFrom, this is a
// genuine delete since that's the actual intent — lessons that already have
// a real recorded outcome (completed/no_show) are excluded even if they
// somehow fall in the range, since destroying attendance history isn't.
export async function deleteRecurringSeriesFrom(seriesId: string, fromDateTime: string) {
  const cutoff = new Date(fromDateTime)
  await prisma.$transaction([
    prisma.recurringSeries.update({ where: { id: seriesId }, data: { active: false } }),
    prisma.lesson.deleteMany({
      where: {
        recurringSeriesId: seriesId,
        startTime: { gte: cutoff },
        status: { notIn: ['completed', 'no_show'] },
      },
    }),
  ])
}

// Called when a student/instructor is archived (see students.ts / instructors.ts),
// so their standing recurring lessons stop being extended and generated forever.
async function endActiveSeriesMatching(where: { studentId?: string; instructorId?: string }) {
  const seriesList = await prisma.recurringSeries.findMany({ where: { ...where, active: true } })
  const now = new Date().toISOString()
  for (const series of seriesList) {
    await endRecurringSeriesFrom(series.id, now)
  }
}

export function endActiveSeriesForStudent(studentId: string) {
  return endActiveSeriesMatching({ studentId })
}

export function endActiveSeriesForInstructor(instructorId: string) {
  return endActiveSeriesMatching({ instructorId })
}

export function registerRecurringSeriesHandlers() {
  ipcMain.handle('recurringSeries:create', (_event, input: RecurringSeriesInput) => createRecurringSeries(input))
  ipcMain.handle('recurringSeries:deleteFrom', (_event, seriesId: string, fromDateTime: string) =>
    deleteRecurringSeriesFrom(seriesId, fromDateTime),
  )
}

// Run at app startup. Unlike creation (which aborts entirely on any conflict),
// this runs unattended, so a conflicting week is skipped and the rest of the
// series keeps extending rather than getting stuck or silently disabled.
export async function extendAllActiveSeries() {
  const horizon = rollingHorizon()
  const seriesList = await prisma.recurringSeries.findMany({ where: { active: true } })

  for (const series of seriesList) {
    let iso = isoDateOf(series.generatedUntil)
    for (;;) {
      iso = addDaysIso(iso, 7)
      const occStart = combineDateAndTime(iso, series.startTime)
      if (occStart > horizon) break
      const occEnd = combineDateAndTime(iso, series.endTime)

      const conflict = await prisma.lesson.findFirst({
        where: {
          instructorId: series.instructorId,
          status: { not: 'cancelled' },
          startTime: { lt: occEnd },
          endTime: { gt: occStart },
        },
      })
      if (!conflict) {
        await prisma.lesson.create({
          data: {
            studentId: series.studentId,
            instructorId: series.instructorId,
            startTime: occStart,
            endTime: occEnd,
            recurringSeriesId: series.id,
          },
        })
      }
      await prisma.recurringSeries.update({
        where: { id: series.id },
        data: { generatedUntil: occStart },
      })
    }
  }
}
