import { registerStudentHandlers } from './students.ts'
import { registerInstructorHandlers } from './instructors.ts'
import { registerLessonHandlers } from './lessons.ts'
import { registerBusinessHoursHandlers } from './businessHours.ts'
import { registerRecurringSeriesHandlers } from './recurringSeries.ts'
import { registerBackupHandlers } from './backup.ts'
import { registerFamilyMemberHandlers } from './familyMembers.ts'
import { registerCertificateHandlers } from './certificates.ts'
import { registerMembershipHandlers } from './memberships.ts'
import { registerSettingsHandlers } from './settings.ts'
import { registerPosHandlers } from './pos.ts'
import { registerReportsHandlers } from './reports.ts'
import { registerAppInfoHandlers } from './appInfo.ts'

export function registerIpcHandlers() {
  registerStudentHandlers()
  registerInstructorHandlers()
  registerLessonHandlers()
  registerBusinessHoursHandlers()
  registerRecurringSeriesHandlers()
  registerBackupHandlers()
  registerFamilyMemberHandlers()
  registerCertificateHandlers()
  registerMembershipHandlers()
  registerSettingsHandlers()
  registerPosHandlers()
  registerReportsHandlers()
  registerAppInfoHandlers()
}
