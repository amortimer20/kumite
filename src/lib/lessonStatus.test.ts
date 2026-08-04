import { describe, expect, it } from 'vitest'
import { lessonHasHappened } from './lessonStatus'
import type { LessonStatus } from '../../shared/types'

const NOW = new Date('2026-08-04T12:00:00')

function lesson(status: LessonStatus, startTime: string) {
  return { status, startTime }
}

describe('lessonHasHappened', () => {
  it('is false for an upcoming scheduled lesson', () => {
    expect(lessonHasHappened(lesson('scheduled', '2026-08-05T15:00:00'), NOW)).toBe(false)
  })

  // Staff routinely forget to mark attendance, so a past lesson still sitting
  // at "scheduled" is history too — not an upcoming booking.
  it('is true for a past lesson still marked scheduled', () => {
    expect(lessonHasHappened(lesson('scheduled', '2026-07-28T15:00:00'), NOW)).toBe(true)
  })

  it('is true for completed and no_show regardless of when they were', () => {
    expect(lessonHasHappened(lesson('completed', '2026-07-28T15:00:00'), NOW)).toBe(true)
    expect(lessonHasHappened(lesson('no_show', '2026-07-28T15:00:00'), NOW)).toBe(true)
    // Status is a statement that it happened, so it wins over an odd start time.
    expect(lessonHasHappened(lesson('completed', '2026-09-01T15:00:00'), NOW)).toBe(true)
    expect(lessonHasHappened(lesson('no_show', '2026-09-01T15:00:00'), NOW)).toBe(true)
  })

  it('treats a cancelled lesson by when it was, not by its status', () => {
    expect(lessonHasHappened(lesson('cancelled', '2026-07-28T15:00:00'), NOW)).toBe(true)
    expect(lessonHasHappened(lesson('cancelled', '2026-08-05T15:00:00'), NOW)).toBe(false)
  })

  it('treats a lesson starting right now as having begun', () => {
    expect(lessonHasHappened(lesson('scheduled', '2026-08-04T11:59:59'), NOW)).toBe(true)
    expect(lessonHasHappened(lesson('scheduled', '2026-08-04T12:00:01'), NOW)).toBe(false)
  })
})
