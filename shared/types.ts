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
  createdAt: string
  updatedAt: string
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
    delete(id: string): Promise<void>
  }
  instructors: {
    list(): Promise<Instructor[]>
    create(input: InstructorInput): Promise<Instructor>
    update(id: string, input: Partial<InstructorInput>): Promise<Instructor>
    delete(id: string): Promise<void>
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
    endFrom(seriesId: string, fromDateTime: string): Promise<void>
  }
  backup: {
    // Restoring relaunches the app to safely swap the database file, so
    // there is no success payload beyond confirming it wasn't canceled.
    create(): Promise<{ canceled: boolean; path?: string }>
    restore(): Promise<{ canceled: boolean }>
  }
}
