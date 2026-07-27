export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

// "private" is scheduled against a specific student; "group" is just a block
// on an instructor's schedule with no per-student roster.
export type LessonType = 'private' | 'group'

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
  // Lessons that haven't actually happened yet (excludes completed/no_show) —
  // these are what get deleted along with the instructor; used to word the
  // delete confirmation.
  upcomingLessonCount: number
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
  studentId: string | null
  instructorId: string
  type: LessonType
  // Group class name (e.g. "Cardio"); null for private lessons.
  title: string | null
  startTime: string
  endTime: string
  status: LessonStatus
  notes: string | null
  recurringSeriesId: string | null
  createdAt: string
  updatedAt: string
  student: Student | null
  instructor: Instructor
}

// "private" requires studentId (and no title); "group" requires title (and
// no studentId) — enforced in application code, same as LessonStatus.
export interface LessonInput {
  type?: LessonType
  studentId?: string | null
  title?: string | null
  instructorId: string
  startTime: string
  endTime: string
  notes?: string | null
}

export interface LessonListFilter {
  start?: string
  end?: string
  instructorId?: string
  studentId?: string
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
  type?: LessonType
  studentId?: string | null
  title?: string | null
  instructorId: string
  startDate: string
  startTime: string
  endTime: string
  notes?: string | null
}

export const MEMBERSHIP_BILLING_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const

export type MembershipBillingFrequency = (typeof MEMBERSHIP_BILLING_FREQUENCIES)[number]

// A billing plan the studio offers (e.g. "2 Private, Unlimited Group"). Group
// class access implied by the title isn't tracked by the app — only the
// private-lesson allowance is, since private lessons are ordinary Lesson rows
// and group classes have no per-student scheduling here.
export interface MembershipPlan {
  id: string
  title: string
  billingFrequency: MembershipBillingFrequency
  priceCents: number
  includedPrivateLessons: number
  active: boolean
  createdAt: string
  // Students currently on this plan — used to decide whether deleting it
  // needs to fall back to archiving instead.
  studentCount: number
}

export interface MembershipPlanInput {
  title: string
  billingFrequency?: MembershipBillingFrequency
  priceCents: number
  includedPrivateLessons?: number
  active?: boolean
}

export type MembershipStatus = 'ok' | 'due_soon' | 'overdue'

export interface MembershipPayment {
  id: string
  studentMembershipId: string
  amountCents: number
  method: string | null
  paidOn: string
  coversFrom: string
  coversUntil: string
  notes: string | null
  createdAt: string
}

// coversFrom/coversUntil describe the billing period(s) this payment settles
// — a multi-cycle advance payment is just a wider range, not a separate
// "credit" concept.
export interface MembershipPaymentInput {
  amountCents: number
  method?: string | null
  paidOn: string
  coversFrom: string
  coversUntil: string
  notes?: string | null
}

// A manual credit/correction applied on top of the live-computed "private
// lessons used this period" count, never a raw overwrite. delta is signed
// from the student's perspective: +1 is a bonus lesson (reduces used,
// increases what they have remaining); -1 undoes one (increases used).
export interface MembershipUsageAdjustment {
  id: string
  studentMembershipId: string
  delta: number
  reason: string | null
  createdAt: string
}

export interface MembershipUsageAdjustmentInput {
  delta: number
  reason?: string | null
}

export interface StudentMembership {
  id: string
  studentId: string
  planId: string
  // null = use plan.priceCents.
  priceOverrideCents: number | null
  startDate: string
  active: boolean
  createdAt: string
  plan: MembershipPlan
  payments: MembershipPayment[]
  usageAdjustments: MembershipUsageAdjustment[]
  // --- Computed server-side, not stored ---
  // priceOverrideCents ?? plan.priceCents
  effectivePriceCents: number
  currentPeriodStart: string
  currentPeriodEnd: string
  // Whatever comes after the furthest coversUntil across payments, or
  // startDate if no payments have been recorded yet.
  nextDueDate: string
  status: MembershipStatus
  // Non-cancelled lessons in the current period, plus usage adjustments. A
  // lesson counts as soon as it's scheduled — only cancelling it releases
  // the slot — so nothing has to be marked "completed" for this to be accurate.
  privateLessonsUsed: number
  // plan.includedPrivateLessons - privateLessonsUsed; can go negative if over.
  privateLessonsRemaining: number
}

// Same as StudentMembership, but with the student attached — only the
// dashboard's cross-student billing view needs this; everywhere else already
// knows which student it's dealing with.
export interface StudentMembershipWithStudent extends StudentMembership {
  student: Student
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
    // Always deletes the instructor's upcoming lessons (and any recurring
    // series left with none remaining) first. If real lesson history
    // (completed/no_show) still blocks the hard delete, falls back to
    // archiving instead — same as students, but with no separate choice to
    // make since there's nothing to ask: history is always kept, everything
    // else is always cleared.
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
  membershipPlans: {
    list(): Promise<MembershipPlan[]>
    create(input: MembershipPlanInput): Promise<MembershipPlan>
    update(id: string, input: Partial<MembershipPlanInput>): Promise<MembershipPlan>
    // Archives instead of deleting if any student is currently on the plan.
    delete(id: string): Promise<{ archived: boolean }>
  }
  studentMemberships: {
    // The student's currently active membership, with usage/due fields
    // computed fresh — or null if they don't have one.
    getForStudent(studentId: string): Promise<StudentMembership | null>
    // Every currently active membership across all students, for the
    // dashboard's billing-health view.
    listActive(): Promise<StudentMembershipWithStudent[]>
    // Starts a brand-new membership; throws if the student already has an
    // active one (use update() to change plans while staying enrolled).
    assign(
      studentId: string,
      input: { planId: string; priceOverrideCents?: number | null; startDate: string },
    ): Promise<StudentMembership>
    update(
      id: string,
      input: { planId?: string; priceOverrideCents?: number | null },
    ): Promise<StudentMembership>
    // Soft-ends it (active: false) — billing/usage history is kept, same as
    // archiving elsewhere in the app.
    cancel(id: string): Promise<void>
    recordPayment(id: string, input: MembershipPaymentInput): Promise<StudentMembership>
    // Payments have no edit-in-place UI (same as everything else in this
    // app — delete and re-add rather than editing history), so a payment
    // entered with a mistake is just removed and re-recorded correctly.
    deletePayment(paymentId: string): Promise<StudentMembership>
    addUsageAdjustment(id: string, input: MembershipUsageAdjustmentInput): Promise<StudentMembership>
  }
}
