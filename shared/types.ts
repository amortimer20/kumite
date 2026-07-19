export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export const STUDENT_RANKS = [
  'White',
  'Yellow',
  'Orange',
  'Purple',
  'Blue',
  'Green',
  'Brown 3rd',
  'Brown 2nd',
  'Brown 1st',
  'Black',
] as const

export type StudentRank = (typeof STUDENT_RANKS)[number]

export interface Student {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  rank: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  familyMembers: FamilyMember[]
  // Total lessons ever booked for this student — used to decide whether
  // deleting them needs the archive-or-delete-everything choice.
  lessonCount: number
}

export interface StudentInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  rank?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  notes?: string | null
  active?: boolean
}

// Not independently schedulable — tracked alongside a primary Student record
// (e.g. for certificates), never referenced by Lesson/RecurringSeries directly.
export interface FamilyMember {
  id: string
  studentId: string
  firstName: string
  lastName: string
  rank: string | null
}

export interface FamilyMemberInput {
  firstName: string
  lastName: string
  rank?: string | null
}

export interface Instructor {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  active: boolean
  createdAt: string
}

export interface InstructorInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  active?: boolean
}

export interface Lesson {
  id: string
  studentId: string
  instructorId: string
  startTime: string
  endTime: string
  status: LessonStatus
  notes: string | null
  recurringSeriesId: string | null
  createdAt: string
  updatedAt: string
  student: Student
  instructor: Instructor
}

export interface LessonInput {
  studentId: string
  instructorId: string
  startTime: string
  endTime: string
  notes?: string | null
}

export interface LessonListFilter {
  start?: string
  end?: string
  instructorId?: string
}

export interface BusinessHours {
  id: string
  dayOfWeek: number
  isClosed: boolean
  openTime: string
  closeTime: string
}

export interface BusinessHoursInput {
  isClosed?: boolean
  openTime?: string
  closeTime?: string
}

export interface CertificateInput {
  name: string
  rank: string
  // ISO yyyy-mm-dd
  date: string
}

export interface RecurringSeriesInput {
  studentId: string
  instructorId: string
  startDate: string
  startTime: string
  endTime: string
  notes?: string | null
}

export interface Api {
  students: {
    list(): Promise<Student[]>
    create(input: StudentInput): Promise<Student>
    update(id: string, input: Partial<StudentInput>): Promise<Student>
    // Deleting a student with lesson history isn't possible (foreign key),
    // so this archives them instead; archived: true tells the UI which happened.
    // Passing force:true instead deletes the student's lessons and recurring
    // series first, so the student itself can be hard-deleted regardless.
    delete(id: string, options?: { force?: boolean }): Promise<{ archived: boolean }>
  }
  instructors: {
    list(): Promise<Instructor[]>
    create(input: InstructorInput): Promise<Instructor>
    update(id: string, input: Partial<InstructorInput>): Promise<Instructor>
    delete(id: string): Promise<{ archived: boolean }>
  }
  lessons: {
    list(filter?: LessonListFilter): Promise<Lesson[]>
    create(input: LessonInput): Promise<Lesson>
    update(id: string, input: Partial<LessonInput>): Promise<Lesson>
    updateStatus(id: string, status: LessonStatus): Promise<Lesson>
    delete(id: string): Promise<void>
  }
  businessHours: {
    list(): Promise<BusinessHours[]>
    update(dayOfWeek: number, input: BusinessHoursInput): Promise<BusinessHours>
  }
  recurringSeries: {
    create(input: RecurringSeriesInput): Promise<Lesson[]>
    // Deletes this and all future not-yet-occurred lessons in the series
    // (completed/no_show lessons are left untouched) and deactivates it.
    deleteFrom(seriesId: string, fromDateTime: string): Promise<void>
  }
  backup: {
    // Restoring relaunches the app to safely swap the database file, so
    // there is no success payload beyond confirming it wasn't canceled.
    create(): Promise<{ canceled: boolean; path?: string }>
    restore(): Promise<{ canceled: boolean }>
  }
  familyMembers: {
    create(studentId: string, input: FamilyMemberInput): Promise<FamilyMember>
    update(id: string, input: Partial<FamilyMemberInput>): Promise<FamilyMember>
    delete(id: string): Promise<void>
  }
  certificates: {
    // Ranks with no template available (e.g. White) are simply absent.
    listAvailableRanks(): Promise<string[]>
    // Opens the generated certificate in the OS's default PDF viewer —
    // printing from there is a normal action in that app, not something
    // triggered directly by Kumite.
    print(input: CertificateInput): Promise<void>
  }
}
