import type { Lesson } from '../../shared/types'

// A day's schedule as an alternating list of booked lessons and the free
// "Available" gaps between them, so the Schedule table can show open slots
// rather than only what's booked. Extracted from SchedulePanel.tsx so the gap
// arithmetic — the fiddly part — can be unit-tested without renderer infra.
export type ScheduleRow =
  | { kind: 'lesson'; lesson: Lesson }
  | { kind: 'gap'; start: Date; end: Date }

// `dayStart`/`dayEnd` are the studio's open/close instants for the day. A gap
// is only emitted where there's actually clear time between the cursor and the
// next lesson (and finally between the last lesson and closing), so touching or
// overlapping lessons never produce a zero- or negative-width "Available" row.
export function buildScheduleRows(dayStart: Date, dayEnd: Date, lessons: Lesson[]): ScheduleRow[] {
  const sorted = [...lessons].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )
  const rows: ScheduleRow[] = []
  let cursor = dayStart
  for (const lesson of sorted) {
    const start = new Date(lesson.startTime)
    const end = new Date(lesson.endTime)
    if (start > cursor) {
      const gapEnd = start < dayEnd ? start : dayEnd
      if (gapEnd > cursor) rows.push({ kind: 'gap', start: cursor, end: gapEnd })
    }
    rows.push({ kind: 'lesson', lesson })
    // A cancelled lesson doesn't consume its slot — advance only to its start,
    // so the time it would have taken is offered back as available.
    const advanceTo = lesson.status === 'cancelled' ? start : end
    if (advanceTo > cursor) cursor = advanceTo
  }
  if (cursor < dayEnd) rows.push({ kind: 'gap', start: cursor, end: dayEnd })
  return rows
}
