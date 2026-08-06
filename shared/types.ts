export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

// "private" is scheduled against a specific student; "group" is just a block
// on an instructor's schedule with no per-student roster; "intro" is a
// one-off free trial for a prospect who isn't a Student yet.
export type LessonType = 'private' | 'group' | 'intro'

// Recurring series are private/group only — a trial lesson has no reason to
// repeat weekly. Narrower than LessonType so the renderer can't even
// construct a recurring "intro" series.
export type RecurringLessonType = 'private' | 'group'

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
  // Black belt is a range of degrees, not a single rank — 1st is the entry
  // degree, 10th the highest, ascending (unlike the kyu-style Brown degrees
  // above, which count down as you approach black belt).
  'Black 1st',
  'Black 2nd',
  'Black 3rd',
  'Black 4th',
  'Black 5th',
  'Black 6th',
  'Black 7th',
  'Black 8th',
  'Black 9th',
  'Black 10th',
] as const

export type StudentRank = (typeof STUDENT_RANKS)[number]

export interface Student {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  rank: string | null
  // When they started training here — distinct from createdAt and from a
  // membership plan's own billing start date. Optional, backfilled manually.
  memberSince: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  // When the Release and Indemnity Agreement checkbox was agreed to at
  // creation time — server-stamped, not client-supplied. Null for students
  // added before this existed.
  waiverAgreedAt: string | null
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
  memberSince?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  notes?: string | null
  active?: boolean
  // Only meaningful on create — whether the Release and Indemnity Agreement
  // checkbox was checked. The server turns this into a stamped
  // waiverAgreedAt timestamp rather than storing the boolean itself.
  agreedToWaiver?: boolean
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
  // Group class name (e.g. "Cardio"); null for private/intro lessons.
  title: string | null
  // Only set when type is "intro" — the prospect's name and (optionally) a
  // phone number for following up, not a Student relation.
  prospectName: string | null
  prospectPhone: string | null
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

// "private" requires studentId (and no title/prospect fields); "group"
// requires title (and no studentId/prospect fields); "intro" requires
// prospectName (and no studentId/title) — enforced in application code,
// same as LessonStatus.
export interface LessonInput {
  type?: LessonType
  studentId?: string | null
  title?: string | null
  prospectName?: string | null
  prospectPhone?: string | null
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

export const AUTO_BACKUP_FREQUENCIES = ['hourly', 'every_6_hours', 'daily', 'weekly'] as const

export type AutoBackupFrequency = (typeof AUTO_BACKUP_FREQUENCIES)[number]

export const AUTO_BACKUP_FREQUENCY_MINUTES: Record<AutoBackupFrequency, number> = {
  hourly: 60,
  every_6_hours: 60 * 6,
  daily: 60 * 24,
  weekly: 60 * 24 * 7,
}

// Retention choices offered in Settings. Deliberately counts rather than an
// age ("delete older than 30 days"), because what the user is protecting
// against is the folder growing without bound — a count caps disk use
// predictably, where an age cap doesn't at the hourly frequency. Note the two
// settings interact: 30 backups is a month of history at Daily but only about
// a day at Hourly.
export const AUTO_BACKUP_KEEP_COUNTS = [10, 30, 60, 100] as const

export interface AppSettings {
  autoBackupEnabled: boolean
  // Null until the user picks a folder — backups don't run until then, even
  // if autoBackupEnabled is true.
  autoBackupDirectory: string | null
  autoBackupFrequency: AutoBackupFrequency
  // How many backups to keep; null means keep all of them. Typed as a plain
  // number rather than the AUTO_BACKUP_KEEP_COUNTS union so a value that isn't
  // one of the presets (a hand-edited row, or a preset we later drop) still
  // prunes to whatever it says instead of needing a fallback.
  autoBackupKeepCount: number | null
  // Null if an automatic backup has never completed successfully.
  lastAutoBackupAt: string | null
}

export interface AppSettingsInput {
  autoBackupEnabled?: boolean
  autoBackupDirectory?: string | null
  autoBackupFrequency?: AutoBackupFrequency
  autoBackupKeepCount?: number | null
}

// "junior" certificates are a distinct template per rank (same wording,
// different art/sizing for younger students) — not every rank has both;
// see RANK_TEMPLATES in electron/certificates/ranks.ts.
export type CertificateType = 'regular' | 'junior'

export interface CertificateInput {
  name: string
  rank: string
  type: CertificateType
  // ISO yyyy-mm-dd
  date: string
}

export interface RecurringSeriesInput {
  type?: RecurringLessonType
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
  notes: string | null
  createdAt: string
}

export interface MembershipPaymentInput {
  amountCents: number
  method?: PaymentMethod | null
  paidOn: string
  notes?: string | null
}

// A payment plus which plan it was paid against — spans every membership a
// student has ever had (not just their currently active one), so switching
// or cancelling plans never makes older payments disappear from view.
export interface MembershipPaymentWithPlan extends MembershipPayment {
  planTitle: string
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
  // null = use billedPriceCents.
  priceOverrideCents: number | null
  // The plan's price and cadence as of when this membership was created (or
  // last moved to a different plan). Billing uses these, not plan.priceCents /
  // plan.billingFrequency, so editing a plan never re-bills existing members —
  // plan edits apply to new sign-ups only.
  billedPriceCents: number
  billingFrequency: MembershipBillingFrequency
  // Total charged in earlier billing terms, before the current startDate anchor.
  priorChargesCents: number
  startDate: string
  active: boolean
  createdAt: string
  plan: MembershipPlan
  payments: MembershipPayment[]
  usageAdjustments: MembershipUsageAdjustment[]
  // --- Computed server-side, not stored ---
  // priceOverrideCents ?? billedPriceCents
  effectivePriceCents: number
  currentPeriodStart: string
  currentPeriodEnd: string
  // Start of the first billing period not yet covered by total payments —
  // see amountOwedCents below for how that's derived.
  nextDueDate: string
  status: MembershipStatus
  // (priorChargesCents + periods elapsed since startDate x effectivePriceCents)
  // - (sum of all payments), floored at 0. A split payment leaves the remainder
  // here instead of silently reading as "paid in full."
  amountOwedCents: number
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

// Shared between POS sales, membership payments, and financial reports —
// not domain-specific to any one of them.
export const PAYMENT_METHODS = ['cash', 'card', 'check', 'other'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// A front-desk catalog item (merchandise, drop-in fees, etc.) — price only,
// no stock/inventory tracking.
export interface PosItem {
  id: string
  name: string
  priceCents: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface PosItemInput {
  name: string
  priceCents: number
  active?: boolean
}

export interface PosSaleItem {
  id: string
  saleId: string
  itemId: string
  // Snapshots of the item at sale time, so a later rename/price edit on the
  // catalog item never changes a historical sale.
  itemName: string
  quantity: number
  unitPriceCents: number
  // Computed for display only, not a stored column: quantity * unitPriceCents.
  lineTotalCents: number
}

// What the renderer sends to record a sale — just item ids and quantities.
// The server looks up each item's current name/priceCents, snapshots them,
// and computes totalCents itself; nothing money-related here is trusted
// from the client.
export interface PosSaleItemInput {
  itemId: string
  quantity: number
}

export interface PosSaleInput {
  // Plain-text snapshot only — no studentId, intentionally no relation to
  // Student. Optional: a sale doesn't require a student to be selected.
  studentName?: string | null
  paymentMethod?: PaymentMethod | null
  notes?: string | null
  items: PosSaleItemInput[]
}

export interface PosSale {
  id: string
  studentName: string | null
  paymentMethod: string | null
  totalCents: number
  notes: string | null
  createdAt: string
  items: PosSaleItem[]
}

// Report payment-method buckets reuse PAYMENT_METHODS/PaymentMethod above.
// Cash/card/check come from PosSale.paymentMethod directly (already
// constrained) and from a case-insensitive match on MembershipPayment.method
// (freeform text, no enum). Anything else — including null/unrecognized —
// buckets into "other".

export interface ReportDateRangeInput {
  // Plain "yyyy-mm-dd", same convention as MembershipPaymentInput.paidOn.
  startDate: string
  endDate: string
}

export interface ReportMethodBreakdown {
  method: PaymentMethod
  totalCents: number
}

export interface ReportSourceBreakdown {
  totalCents: number
  count: number
  // Always all 4 PAYMENT_METHODS entries (zero-filled), not sparse — lets
  // the UI render a stable table without filling in zeros itself.
  byMethod: ReportMethodBreakdown[]
}

// The combined grand total and the toggled payment-method breakdown are
// deliberately not part of this shape — the UI recomputes those from
// membership/pos based on which sources are checked, so toggling a source
// on/off never needs a re-fetch.
export interface Report {
  startDate: string
  endDate: string
  membership: ReportSourceBreakdown
  pos: ReportSourceBreakdown
}

export interface ReportExportInput extends ReportDateRangeInput {
  includeMembership: boolean
  includePos: boolean
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
    // Native folder picker for choosing where automatic backups get written.
    chooseDirectory(): Promise<{ canceled: boolean; path?: string }>
  }
  settings: {
    // Seeded lazily on first read, same pattern as businessHours:list.
    get(): Promise<AppSettings>
    update(input: AppSettingsInput): Promise<AppSettings>
  }
  familyMembers: {
    create(studentId: string, input: FamilyMemberInput): Promise<FamilyMember>
    update(id: string, input: Partial<FamilyMemberInput>): Promise<FamilyMember>
    delete(id: string): Promise<void>
  }
  certificates: {
    // Ranks with no template for the given type (e.g. White, or Black ranks
    // when type is "junior") are simply absent.
    listAvailableRanks(type: CertificateType): Promise<string[]>
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
    // Applies the plan's current price/cadence to the students already on it,
    // taking effect at each one's next billing date — past and current periods
    // keep the old price, and the billing day doesn't shift. Students with a
    // custom (overridden) price are left untouched. Returns how many
    // memberships were actually updated.
    applyToExisting(id: string): Promise<{ updated: number }>
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
    // Every payment across every membership this student has ever had
    // (active or long since cancelled), newest first.
    getPaymentHistory(studentId: string): Promise<MembershipPaymentWithPlan[]>
  }
  posItems: {
    list(): Promise<PosItem[]>
    create(input: PosItemInput): Promise<PosItem>
    update(id: string, input: Partial<PosItemInput>): Promise<PosItem>
    // Archives instead of deleting if the item has ever been sold — same
    // fallback as membershipPlans.delete/instructors.delete.
    delete(id: string): Promise<{ archived: boolean }>
  }
  posSales: {
    // Newest first.
    list(): Promise<PosSale[]>
    create(input: PosSaleInput): Promise<PosSale>
    // No archive fallback needed — nothing references a sale by foreign
    // key, so this is always a hard delete (correction mechanism for a
    // mis-rung sale, same "delete and redo" convention as membership
    // payments).
    delete(id: string): Promise<void>
  }
  reports: {
    generate(input: ReportDateRangeInput): Promise<Report>
    // Mirrors backup.create's return convention exactly.
    exportCsv(input: ReportExportInput): Promise<{ canceled: boolean; path?: string }>
  }
  appInfo: {
    get(): Promise<AppInfo>
  }
}

export interface AppInfo {
  version: string
  dbPath: string
}
