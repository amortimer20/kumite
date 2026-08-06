import { describe, expect, it } from 'vitest'
import { buildScheduleRows, type ScheduleRow } from './scheduleRows'
import type { Lesson, LessonStatus } from '../../shared/types'

const DAY = '2025-01-06'
// Studio open 09:00, close 17:00 for every test.
const OPEN = at('09:00')
const CLOSE = at('17:00')

function at(hhmm: string): Date {
  return new Date(`${DAY}T${hhmm}:00`)
}

// buildScheduleRows only reads startTime/endTime/status, so the rest of the
// Lesson shape is filled by the cast rather than spelled out.
function lesson(start: string, end: string, status: LessonStatus = 'scheduled'): Lesson {
  return {
    id: `${start}-${end}-${status}`,
    startTime: at(start).toISOString(),
    endTime: at(end).toISOString(),
    status,
    type: 'private',
  } as Lesson
}

// The gap rows, in order, as [start, end] "hh:mm" pairs — the part the arithmetic
// actually decides.
function gaps(rows: ScheduleRow[]): [string, string][] {
  return rows
    .filter((r): r is Extract<ScheduleRow, { kind: 'gap' }> => r.kind === 'gap')
    .map((g) => [hhmm(g.start), hhmm(g.end)])
}

function hhmm(d: Date): string {
  return d.toTimeString().slice(0, 5)
}

describe('buildScheduleRows', () => {
  it('offers the whole day as one gap when nothing is booked', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [])
    expect(rows).toEqual([{ kind: 'gap', start: OPEN, end: CLOSE }])
  })

  it('brackets a single lesson with gaps before and after', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('10:00', '11:00')])
    expect(rows.map((r) => r.kind)).toEqual(['gap', 'lesson', 'gap'])
    expect(gaps(rows)).toEqual([
      ['09:00', '10:00'],
      ['11:00', '17:00'],
    ])
  })

  it('emits no leading gap when a lesson starts exactly at opening', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('09:00', '10:00')])
    expect(rows[0].kind).toBe('lesson')
    expect(gaps(rows)).toEqual([['10:00', '17:00']])
  })

  it('leaves no gap between back-to-back lessons', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('09:00', '10:00'), lesson('10:00', '11:00')])
    expect(rows.map((r) => r.kind)).toEqual(['lesson', 'lesson', 'gap'])
    expect(gaps(rows)).toEqual([['11:00', '17:00']])
  })

  // A cancelled lesson frees its slot: the cursor only advances to its start,
  // so the time it would have taken is offered back as available.
  it('does not let a cancelled lesson consume its slot', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('10:00', '11:00', 'cancelled')])
    // The 10:00-11:00 slot is swallowed into the trailing available window.
    expect(gaps(rows)).toEqual([
      ['09:00', '10:00'],
      ['10:00', '17:00'],
    ])
    // Contrast: a live lesson in the same slot pushes the gap to 11:00.
    const live = buildScheduleRows(OPEN, CLOSE, [lesson('10:00', '11:00')])
    expect(gaps(live)).toEqual([
      ['09:00', '10:00'],
      ['11:00', '17:00'],
    ])
  })

  // A lesson that runs past closing must not produce a negative-width trailing
  // gap, and the gap before it is capped at its start, not extended past close.
  it('produces no trailing gap for a lesson that runs past closing time', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('16:00', '18:00')])
    expect(rows.map((r) => r.kind)).toEqual(['gap', 'lesson'])
    expect(gaps(rows)).toEqual([['09:00', '16:00']])
  })

  // Overlapping lessons must never yield a zero/negative gap between them —
  // the cursor tracks the furthest end reached, not each lesson's own end.
  it('does not emit a gap between overlapping lessons', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('10:00', '12:00'), lesson('11:00', '13:00')])
    expect(rows.map((r) => r.kind)).toEqual(['gap', 'lesson', 'lesson', 'gap'])
    expect(gaps(rows)).toEqual([
      ['09:00', '10:00'],
      ['13:00', '17:00'],
    ])
  })

  it('sorts lessons by start time before laying out the rows', () => {
    const rows = buildScheduleRows(OPEN, CLOSE, [lesson('14:00', '15:00'), lesson('10:00', '11:00')])
    const lessonStarts = rows
      .filter((r): r is Extract<ScheduleRow, { kind: 'lesson' }> => r.kind === 'lesson')
      .map((r) => hhmm(new Date(r.lesson.startTime)))
    expect(lessonStarts).toEqual(['10:00', '14:00'])
  })
})
