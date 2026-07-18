import { registerStudentHandlers } from './students.ts'
import { registerInstructorHandlers } from './instructors.ts'
import { registerLessonHandlers } from './lessons.ts'
import { registerBusinessHoursHandlers } from './businessHours.ts'
import { registerRecurringSeriesHandlers } from './recurringSeries.ts'
import { registerBackupHandlers } from './backup.ts'
import { registerFamilyMemberHandlers } from './familyMembers.ts'

export function registerIpcHandlers() {
  registerStudentHandlers()
  registerInstructorHandlers()
  registerLessonHandlers()
  registerBusinessHoursHandlers()
  registerRecurringSeriesHandlers()
  registerBackupHandlers()
  registerFamilyMemberHandlers()
}
