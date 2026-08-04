import type { LessonStatus } from '../../shared/types'

export const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

// Whether this lesson is a record of something that already took place, rather
// than a future booking. Deleting a future booking is routine and shouldn't
// nag; deleting a past one destroys a record of what actually happened —
// attendance especially — so it's worth a confirmation.
//
// Status is checked first because "completed"/"no_show" are statements that it
// happened, and should win even if the stored startTime is odd. Everything else
// falls back to whether the lesson has started, which matters because staff
// routinely forget to mark attendance: a week-old lesson still sitting at
// "scheduled" is history too, not an upcoming booking.
export function lessonHasHappened(
  lesson: { startTime: string; status: LessonStatus },
  now: Date = new Date(),
): boolean {
  if (lesson.status === 'completed' || lesson.status === 'no_show') return true
  return new Date(lesson.startTime).getTime() < now.getTime()
}
