import { registerStudentHandlers } from './students.ts'
import { registerInstructorHandlers } from './instructors.ts'
import { registerLessonHandlers } from './lessons.ts'
import { registerBusinessHoursHandlers } from './businessHours.ts'
import { registerRecurringSeriesHandlers } from './recurringSeries.ts'

export function registerIpcHandlers() {
  registerStudentHandlers()
  registerInstructorHandlers()
  registerLessonHandlers()
  registerBusinessHoursHandlers()
  registerRecurringSeriesHandlers()
}
