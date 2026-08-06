import { ipcMain } from 'electron'
import { prisma } from '../db.ts'
import { assertNoOverlap, assertValidLessonInput } from './lessons.ts'
import { addDaysIso, combineDateAndTime, computeOccurrenceDates, isoDateOf } from '../recurringSeriesLogic.ts'
import type { RecurringSeriesInput } from '../../shared/types.ts'

const lessonInclude = { student: true, instructor: true } as const

// How far ahead occurrences are kept generated. Extended forward on every app
// startup by extendAllActiveSeries() so the window keeps rolling with time.
const ROLLING_WINDOW_WEEKS = 12

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
  const type = input.type ?? 'private'
  assertValidLessonInput(type, input.studentId, input.title)

  const dayOfWeek = new Date(`${input.startDate}T00:00:00`).getDay()
  const horizon = rollingHorizon()
  const allOccurrences = computeOccurrenceDates(input.startDate, input.startTime, horizon)
  if (allOccurrences.length === 0) {
    // The first occurrence is already past the rolling window, so there's
    // nothing to generate. Without this, the empty list makes lastOccurrence
    // undefined and combineDateAndTime produces an Invalid Date, surfacing as
    // a raw database error rather than a reason the user can act on.
    throw new Error('That start date is too far ahead — recurring lessons can only be scheduled up to 12 weeks out.')
  }
  // A back-dated series would otherwise materialise past occurrences as
  // "scheduled" lessons, which count against the student's included lessons
  // for the current period and silently spend the allowance. Keep the weekly
  // cadence anchored on the start date, but only generate from today forward.
  const today = isoDateOf(new Date())
  const occurrenceDates = allOccurrences.filter((iso) => iso >= today)

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
        studentId: type === 'private' ? input.studentId : null,
        instructorId: input.instructorId,
        type,
        title: type === 'group' ? input.title : null,
        dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        generatedUntil: combineDateAndTime(lastOccurrence, input.startTime),
      },
    })
    for (const [index, iso] of occurrenceDates.entries()) {
      await tx.lesson.create({
        data: {
          studentId: type === 'private' ? input.studentId : null,
          instructorId: input.instructorId,
          type,
          title: type === 'group' ? input.title : null,
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
  const now = new Date()
  const horizon = rollingHorizon()
  const seriesList = await prisma.recurringSeries.findMany({ where: { active: true } })

  for (const series of seriesList) {
    const startMark = isoDateOf(series.generatedUntil)
    // generatedUntil only advances across the leading run of weeks that are
    // settled — created, already generated on a previous startup, or in the
    // past and no longer worth creating. The first *future* week we have to
    // skip for a conflict locks the mark in place so a later startup retries
    // it (once the conflict clears) instead of losing that lesson forever;
    // weeks beyond it are still generated in the meantime.
    let mark = startMark
    let markLocked = false
    let iso = startMark
    for (;;) {
      iso = addDaysIso(iso, 7)
      const occStart = combineDateAndTime(iso, series.startTime)
      if (occStart > horizon) break
      const occEnd = combineDateAndTime(iso, series.endTime)

      // Never auto-create a lesson in the past. A generatedUntil left stale by
      // the app being closed for a while — or a conflict that has since
      // receded into the past — would otherwise insert past "scheduled"
      // lessons that count against the current period's included lessons.
      if (occStart < now) {
        if (!markLocked) mark = iso
        continue
      }

      // Already generated on an earlier startup: the mark can sit behind these
      // when a prior conflict held it back. Nothing to create — just let the
      // mark flow past it.
      const existing = await prisma.lesson.findFirst({
        where: { recurringSeriesId: series.id, startTime: occStart },
      })
      if (existing) {
        if (!markLocked) mark = iso
        continue
      }

      const conflict = await prisma.lesson.findFirst({
        where: {
          instructorId: series.instructorId,
          status: { not: 'cancelled' },
          startTime: { lt: occEnd },
          endTime: { gt: occStart },
        },
      })
      if (conflict) {
        // Skip this week but keep extending. Holding the mark here is the whole
        // point: without it the skipped week falls behind generatedUntil and is
        // never retried, so a week blocked by a one-off double-booking would
        // silently never get its lesson even after the conflict is removed.
        markLocked = true
        continue
      }

      await prisma.lesson.create({
        data: {
          studentId: series.studentId,
          instructorId: series.instructorId,
          type: series.type,
          title: series.title,
          startTime: occStart,
          endTime: occEnd,
          recurringSeriesId: series.id,
        },
      })
      if (!markLocked) mark = iso
    }

    if (mark !== startMark) {
      await prisma.recurringSeries.update({
        where: { id: series.id },
        data: { generatedUntil: combineDateAndTime(mark, series.startTime) },
      })
    }
  }
}
