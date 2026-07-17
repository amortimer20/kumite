import { registerStudentHandlers } from './students.ts'
import { registerInstructorHandlers } from './instructors.ts'
import { registerLessonHandlers } from './lessons.ts'

export function registerIpcHandlers() {
  registerStudentHandlers()
  registerInstructorHandlers()
  registerLessonHandlers()
}
