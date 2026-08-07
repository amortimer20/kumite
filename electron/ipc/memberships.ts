import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import {
  computeMembershipStatus,
  computeOwedFromCharges,
  computeUsage,
  currentPeriodBounds,
  elapsedPeriods,
} from '../membershipLogic.ts'
import type {
  MembershipExtraLessonInput,
  MembershipPaymentInput,
  MembershipPlanInput,
  MembershipUsageAdjustmentInput,
} from '../../shared/types.ts'

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient

// The fields ensureChargesMaterialized/materializeCharges need to know what's
// already been charged (priorChargesCents, read once — see the schema
// comment) and what a not-yet-materialized period should charge next.
type ChargeableMembership = {
  id: string
  startDate: Date
  priorChargesCents: number
  billedPriceCents: number
  priceOverrideCents: number | null
  billingFrequency: string
}

// Figures out which periods (if any) still need a MembershipCharge row for
// this membership, without writing anything — split from materializeCharges
// so callers that are already inside a transaction (closing out an old term
// on a plan/cadence change) can compose it without nesting transactions.
async function chargesToMaterialize(client: PrismaClientOrTx, membership: ChargeableMembership, asOf: Date) {
  const existing = await client.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
  const toCreate: Prisma.MembershipChargeCreateManyInput[] = []

  // One-time seed: fold in whatever priorChargesCents had already accumulated
  // before this feature existed. Only ever happens on a membership's very
  // first materialization — from then on `existing` is never empty again, so
  // this branch can't fire twice even if it's a newly-cancelled-and-reassigned
  // membership with its own fresh priorChargesCents of 0.
  if (existing.length === 0 && membership.priorChargesCents > 0) {
    toCreate.push({
      studentMembershipId: membership.id,
      periodStart: null,
      periodEnd: null,
      priceCents: membership.priorChargesCents,
      kind: 'opening_balance',
      label: 'Opening balance',
    })
  }

  const effectivePriceCents = membership.priceOverrideCents ?? membership.billedPriceCents
  const alreadyCharged = new Set(
    existing.filter((c) => c.periodStart).map((c) => c.periodStart!.getTime()),
  )
  for (const { periodStart, periodEnd } of elapsedPeriods(membership.startDate, membership.billingFrequency, asOf)) {
    if (alreadyCharged.has(periodStart.getTime())) continue
    toCreate.push({ studentMembershipId: membership.id, periodStart, periodEnd, priceCents: effectivePriceCents })
  }
  return toCreate
}

// Writes whatever chargesToMaterialize finds missing. Composable inside an
// existing transaction (e.g. closing out a term before resetting startDate) —
// callers reading fresh balance need the standalone, self-transacting
// ensureChargesMaterialized below instead.
async function materializeCharges(client: PrismaClientOrTx, membership: ChargeableMembership, asOf: Date) {
  const toCreate = await chargesToMaterialize(client, membership, asOf)
  if (toCreate.length > 0) {
    await client.membershipCharge.createMany({ data: toCreate })
  }
}

// Ensures every billing period from this membership's startDate through `now`
// has a MembershipCharge row, then returns all of them (existing + newly
// created) so the caller doesn't need a second query. Idempotent and safe to
// call on every read — mirrors how the balance used to be recomputed fresh on
// every read, just materialized into rows instead of an in-memory formula.
// Transactional so two reads racing the same membership can't create the same
// period twice (the @@unique constraint is the backstop if they somehow did).
async function ensureChargesMaterialized(membership: ChargeableMembership, asOf: Date) {
  return prisma.$transaction(async (tx) => {
    await materializeCharges(tx, membership, asOf)
    return tx.membershipCharge.findMany({ where: { studentMembershipId: membership.id } })
  })
}

const membershipPlanInclude = {
  _count: { select: { studentMemberships: { where: { active: true } } } },
} satisfies Prisma.MembershipPlanInclude

const studentMembershipInclude = {
  plan: { include: membershipPlanInclude },
  payments: { orderBy: { paidOn: 'asc' } },
  usageAdjustments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StudentMembershipInclude

// Adds the student record on top of studentMembershipInclude — only needed
// for the dashboard's cross-student billing view; everywhere else already
// knows which student it's dealing with.
const studentMembershipWithStudentInclude = {
  ...studentMembershipInclude,
  student: true,
} satisfies Prisma.StudentMembershipInclude

function serializeMembershipPlan<T extends { _count: { studentMemberships: number } }>(plan: T) {
  const { _count, ...rest } = plan
  return { ...rest, studentCount: _count.studentMemberships }
}

type MembershipForSerialize = ChargeableMembership & {
  studentId: string
  plan: { priceCents: number; billingFrequency: string; includedPrivateLessons: number; _count: { studentMemberships: number } }
  payments: { amountCents: number }[]
  usageAdjustments: { delta: number; createdAt: Date }[]
}

async function serializeStudentMembership<T extends MembershipForSerialize>(membership: T) {
  const now = new Date()
  // Deliberately the membership's own snapshotted cadence and price, not
  // membership.plan.* — see the schema comment on billedPriceCents. Reading the
  // plan here is what made a plan edit re-bill every past period.
  const { periodStart, periodEnd } = currentPeriodBounds(membership.startDate, membership.billingFrequency, now)

  const effectivePriceCents = membership.priceOverrideCents ?? membership.billedPriceCents
  const totalPaidCents = membership.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const charges = await ensureChargesMaterialized(membership, now)
  const { owedCents, nextDueDate } = computeOwedFromCharges(
    charges,
    totalPaidCents,
    effectivePriceCents,
    membership.billingFrequency,
    membership.startDate,
  )

  const status = computeMembershipStatus(nextDueDate, now)

  const scheduledLessons = await prisma.lesson.count({
    where: {
      studentId: membership.studentId,
      startTime: { gte: periodStart, lt: periodEnd },
      status: { not: 'cancelled' },
    },
  })
  const { privateLessonsUsed, privateLessonsRemaining } = computeUsage(
    scheduledLessons,
    membership.usageAdjustments,
    periodStart,
    periodEnd,
    membership.plan.includedPrivateLessons,
  )

  // Most-recently-charged extra lesson, so the "charge for an extra lesson"
  // form can pre-fill a sanity reference instead of staff retyping the same
  // amount from memory every time.
  const lastExtraLessonCharge = charges
    .filter((c) => c.kind === 'extra_lesson')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

  const { plan, ...rest } = membership
  return {
    ...rest,
    plan: serializeMembershipPlan(plan),
    effectivePriceCents,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    nextDueDate,
    status,
    amountOwedCents: owedCents,
    lastExtraLessonPriceCents: lastExtraLessonCharge?.priceCents ?? null,
    privateLessonsUsed,
    privateLessonsRemaining,
  }
}

// Used when a student is archived/deleted — an inactive student shouldn't
// keep showing up as "payment due." Billing/usage history is kept (this is
// the same soft "cancel" as the studentMemberships:cancel handler below).
export async function cancelActiveMembershipForStudent(studentId: string) {
  await prisma.studentMembership.updateMany({ where: { studentId, active: true }, data: { active: false } })
}

// A plan can legitimately be $0 (comp/free), so price is only rejected when
// negative; a payment (below) requires a strictly positive amount instead,
// since "recording a $0 payment" isn't a meaningful action.
function assertValidPlanInput(input: Partial<MembershipPlanInput>) {
  if (input.priceCents !== undefined && input.priceCents < 0) {
    throw new Error('Price cannot be negative.')
  }
  if (input.includedPrivateLessons !== undefined && input.includedPrivateLessons < 0) {
    throw new Error('Included private lessons cannot be negative.')
  }
}

export async function listMembershipPlans() {
  const plans = await prisma.membershipPlan.findMany({
    orderBy: { title: 'asc' },
    include: membershipPlanInclude,
  })
  return plans.map(serializeMembershipPlan)
}

export async function createMembershipPlan(input: MembershipPlanInput) {
  assertValidPlanInput(input)
  const plan = await prisma.membershipPlan.create({ data: input, include: membershipPlanInclude })
  return serializeMembershipPlan(plan)
}

export async function updateMembershipPlan(id: string, input: Partial<MembershipPlanInput>) {
  assertValidPlanInput(input)
  const plan = await prisma.membershipPlan.update({ where: { id }, data: input, include: membershipPlanInclude })
  return serializeMembershipPlan(plan)
}

// Applies a plan's current price and cadence to the students already on it.
// Plan edits otherwise reach new sign-ups only (see updateMembershipPlan and
// the schema comment on billedPriceCents) — deliberately, so that editing a
// plan can never rewrite past billing. This is the opt-in escape hatch for
// "raise the price for everyone on this plan," offered as a prompt after a
// plan's billing terms change.
//
// Per membership: materialize a real MembershipCharge row for every period
// through the current one at the student's OLD price, then re-anchor
// startDate to that period's end and snapshot the plan's new price/cadence.
// So past and current periods keep the old price (each with its own row,
// rather than a lump sum), and the new price takes effect at the next due
// date without shifting the billing day. This is the same close-out-the-term
// mechanism a cadence-changing plan switch uses (see updateMembership); the
// difference is the anchor is the current period's end, not `now`, precisely so
// a same-cadence price change doesn't move a monthly student's billing day to
// whatever day prices were raised.
//
// Memberships with a manual priceOverrideCents are skipped (filtered out of the
// query): that price is a deliberate per-student arrangement a plan-wide change
// shouldn't overwrite. All updates run in one transaction, so an interrupt
// can't leave some students re-priced and others not.
export async function applyPlanTermsToActiveMemberships(planId: string) {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: planId } })
    const memberships = await tx.studentMembership.findMany({
      where: { planId, active: true, priceOverrideCents: null },
    })
    for (const m of memberships) {
      // A not-yet-started membership (e.g. a future-dated signup) has no past to
      // protect, so it just adopts the new terms from its existing start date —
      // banking/re-anchoring here would skip its first period entirely.
      if (m.startDate > now) {
        await tx.studentMembership.update({
          where: { id: m.id },
          data: { billedPriceCents: plan.priceCents, billingFrequency: plan.billingFrequency },
        })
        continue
      }
      const { periodEnd } = currentPeriodBounds(m.startDate, m.billingFrequency, now)
      // Close out the old term with real per-period rows at the OLD price
      // before moving the anchor — once startDate moves, nothing would ever
      // materialize these periods again.
      await materializeCharges(tx, m, now)
      await tx.studentMembership.update({
        where: { id: m.id },
        data: {
          startDate: periodEnd,
          billedPriceCents: plan.priceCents,
          billingFrequency: plan.billingFrequency,
        },
      })
    }
    return { updated: memberships.length }
  })
}

// Same archive-on-FK-violation fallback as students/instructors: a plan
// that's ever been assigned to a student can't be hard-deleted (its
// StudentMembership rows are kept for billing history), so it's archived
// instead so it drops out of the "assign a plan" picker.
export async function deleteMembershipPlan(id: string) {
  try {
    await prisma.membershipPlan.delete({ where: { id } })
    return { archived: false }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      await prisma.membershipPlan.update({ where: { id }, data: { active: false } })
      return { archived: true }
    }
    throw err
  }
}

// Spans every membership the student has ever had, not just the active
// one — cancelling and later re-assigning a new plan creates a new
// StudentMembership row, and without this a student's older payment
// history would silently vanish from the UI even though it's still in
// the database, attached to that now-inactive row.
export async function getPaymentHistoryForStudent(studentId: string) {
  const memberships = await prisma.studentMembership.findMany({
    where: { studentId },
    include: { plan: { select: { title: true } }, payments: true },
  })
  return memberships
    .flatMap((m) => m.payments.map((p) => ({ ...p, planTitle: m.plan.title })))
    .sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime())
}

export async function getMembershipForStudent(studentId: string) {
  const membership = await prisma.studentMembership.findFirst({
    where: { studentId, active: true },
    include: studentMembershipInclude,
  })
  return membership ? serializeStudentMembership(membership) : null
}

// Used by the dashboard's billing-health view — every currently active
// membership across all students, so overdue/due-soon can be found without
// knowing which student to look at first.
export async function listActiveMemberships() {
  const memberships = await prisma.studentMembership.findMany({
    where: { active: true },
    include: studentMembershipWithStudentInclude,
  })
  return Promise.all(memberships.map(serializeStudentMembership))
}

export async function assignMembership(
  studentId: string,
  input: {
    planId: string
    priceOverrideCents?: number | null
    startDate: string
    // Set only when the front desk is prorating a mid-month sign-up's partial
    // first month — a suggested amount the user can override, never computed
    // or re-validated here beyond "greater than zero" (see
    // suggestProratedChargeCents in src/lib/membershipFormat.ts for how the
    // UI arrives at the suggestion). Materialized as a one-off MembershipCharge
    // rather than a real period, since it doesn't correspond to one.
    prorationStubCents?: number | null
  },
) {
  if (input.prorationStubCents != null && input.prorationStubCents <= 0) {
    throw new Error('The prorated amount must be greater than zero.')
  }
  // Check-then-create, but inside one transaction rather than two separate
  // round trips — SQLite's single-writer locking means a second call
  // racing this one (e.g. a double-clicked submit button) can't commit
  // its own create until this transaction finishes, so it'll see the
  // just-created row and correctly hit the "already has one" error
  // instead of both succeeding and silently creating two active rows.
  const membership = await prisma.$transaction(async (tx) => {
    const existing = await tx.studentMembership.findFirst({ where: { studentId, active: true } })
    if (existing) {
      throw new Error('This student already has an active membership. Change their plan instead of assigning a new one.')
    }
    const plan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: input.planId } })
    const created = await tx.studentMembership.create({
      data: {
        studentId,
        planId: input.planId,
        priceOverrideCents: input.priceOverrideCents,
        // Snapshot the plan's terms as they are right now — later edits to the
        // plan apply to new sign-ups only.
        billedPriceCents: plan.priceCents,
        billingFrequency: plan.billingFrequency,
        startDate: new Date(input.startDate),
      },
      include: studentMembershipInclude,
    })
    if (input.prorationStubCents) {
      await tx.membershipCharge.create({
        data: {
          studentMembershipId: created.id,
          periodStart: null,
          periodEnd: null,
          priceCents: input.prorationStubCents,
          kind: 'proration',
          label: 'Prorated first month',
        },
      })
    }
    return created
  })
  return serializeStudentMembership(membership)
}

// The paid-extra-lesson flow: a one-off charge outside the normal per-period
// billing, plus the payment that settles it and the allowance it buys, all in
// one transaction so the three legs can't be left half-done. The charge leg
// is not optional — a payment with no matching charge would be read as
// prepayment toward next month's dues and silently reduce what's owed then,
// the same phantom-credit failure mode "Membership billing no longer re-bills
// the past" (see Done) fixed for plan switches.
export async function chargeExtraLesson(id: string, input: MembershipExtraLessonInput) {
  if (input.priceCents <= 0) {
    throw new Error('Price must be greater than zero.')
  }
  if (!Number.isInteger(input.lessonCount) || input.lessonCount <= 0) {
    throw new Error('Enter how many extra lessons this covers (at least 1).')
  }
  const label = `${input.lessonCount} extra lesson${input.lessonCount === 1 ? '' : 's'}`
  const membership = await prisma.$transaction(async (tx) => {
    await tx.membershipCharge.create({
      data: {
        studentMembershipId: id,
        periodStart: null,
        periodEnd: null,
        priceCents: input.priceCents,
        kind: 'extra_lesson',
        label,
      },
    })
    await tx.membershipPayment.create({
      data: {
        studentMembershipId: id,
        amountCents: input.priceCents,
        method: input.method,
        paidOn: new Date(input.paidOn),
        notes: input.notes,
      },
    })
    // Period-scoped like any other adjustment, so an unused extra lesson still
    // expires at period end rather than rolling forward — same
    // use-it-or-lose-it behaviour as a free bonus lesson.
    await tx.membershipUsageAdjustment.create({
      data: { studentMembershipId: id, delta: input.lessonCount, reason: label },
    })
    return tx.studentMembership.findUniqueOrThrow({ where: { id }, include: studentMembershipInclude })
  })
  return serializeStudentMembership(membership)
}

export async function updateMembership(id: string, input: { planId?: string; priceOverrideCents?: number | null }) {
  const membership = await prisma.$transaction(async (tx) => {
    const data: Prisma.StudentMembershipUpdateInput = { ...input }
    if (input.planId) {
      const current = await tx.studentMembership.findUniqueOrThrow({ where: { id }, include: { payments: true } })
      if (input.planId !== current.planId) {
        const newPlan = await tx.membershipPlan.findUniqueOrThrow({ where: { id: input.planId } })
        // Moving to a different plan re-snapshots its terms onto the membership,
        // so from here on this student bills at the new plan's price and cadence.
        data.billedPriceCents = newPlan.priceCents
        data.billingFrequency = newPlan.billingFrequency

        // A different billing cadence starting mid-cycle would otherwise keep
        // walking periods forward from the old plan's stale anchor date — restart
        // the clock from today instead so the new cadence counts from the point
        // the switch actually happened.
        if (newPlan.billingFrequency !== current.billingFrequency) {
          const now = new Date()
          // Close out the old term with real per-period rows at the OLD price
          // and cadence before moving the anchor — once startDate moves,
          // nothing would ever materialize these periods again. Without this,
          // every period before the switch stops being owed and the payments
          // made against them are re-read as credit against the new plan's
          // price — a student who had paid $700 on a $100/month plan and moved
          // to $50/week came out ~14 weeks prepaid.
          await materializeCharges(tx, current, now)
          data.startDate = now
        }
      }
    }
    return tx.studentMembership.update({ where: { id }, data, include: studentMembershipInclude })
  })
  return serializeStudentMembership(membership)
}

export async function cancelMembership(id: string) {
  await prisma.studentMembership.update({ where: { id }, data: { active: false } })
}

export async function recordMembershipPayment(id: string, input: MembershipPaymentInput) {
  if (input.amountCents <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }
  await prisma.membershipPayment.create({
    data: {
      studentMembershipId: id,
      amountCents: input.amountCents,
      method: input.method,
      paidOn: new Date(input.paidOn),
      notes: input.notes,
    },
  })
  const membership = await prisma.studentMembership.findUniqueOrThrow({
    where: { id },
    include: studentMembershipInclude,
  })
  return serializeStudentMembership(membership)
}

export async function deleteMembershipPayment(paymentId: string) {
  const deleted = await prisma.membershipPayment.delete({ where: { id: paymentId } })
  const membership = await prisma.studentMembership.findUniqueOrThrow({
    where: { id: deleted.studentMembershipId },
    include: studentMembershipInclude,
  })
  return serializeStudentMembership(membership)
}

export async function addMembershipUsageAdjustment(id: string, input: MembershipUsageAdjustmentInput) {
  await prisma.membershipUsageAdjustment.create({
    data: { studentMembershipId: id, delta: input.delta, reason: input.reason },
  })
  const membership = await prisma.studentMembership.findUniqueOrThrow({
    where: { id },
    include: studentMembershipInclude,
  })
  return serializeStudentMembership(membership)
}

export function registerMembershipHandlers() {
  ipcMain.handle('membershipPlans:list', () => listMembershipPlans())
  ipcMain.handle('membershipPlans:create', (_event, input: MembershipPlanInput) => createMembershipPlan(input))
  ipcMain.handle('membershipPlans:update', (_event, id: string, input: Partial<MembershipPlanInput>) =>
    updateMembershipPlan(id, input),
  )
  ipcMain.handle('membershipPlans:delete', (_event, id: string) => deleteMembershipPlan(id))
  ipcMain.handle('membershipPlans:applyToExisting', (_event, id: string) => applyPlanTermsToActiveMemberships(id))

  ipcMain.handle('studentMemberships:getForStudent', (_event, studentId: string) => getMembershipForStudent(studentId))
  ipcMain.handle('studentMemberships:getPaymentHistory', (_event, studentId: string) => getPaymentHistoryForStudent(studentId))
  ipcMain.handle('studentMemberships:listActive', () => listActiveMemberships())
  ipcMain.handle(
    'studentMemberships:assign',
    (
      _event,
      studentId: string,
      input: { planId: string; priceOverrideCents?: number | null; startDate: string; prorationStubCents?: number | null },
    ) => assignMembership(studentId, input),
  )
  ipcMain.handle(
    'studentMemberships:update',
    (_event, id: string, input: { planId?: string; priceOverrideCents?: number | null }) => updateMembership(id, input),
  )
  ipcMain.handle('studentMemberships:cancel', (_event, id: string) => cancelMembership(id))
  ipcMain.handle('studentMemberships:recordPayment', (_event, id: string, input: MembershipPaymentInput) =>
    recordMembershipPayment(id, input),
  )
  ipcMain.handle('studentMemberships:deletePayment', (_event, paymentId: string) => deleteMembershipPayment(paymentId))
  ipcMain.handle('studentMemberships:chargeExtraLesson', (_event, id: string, input: MembershipExtraLessonInput) =>
    chargeExtraLesson(id, input),
  )
  ipcMain.handle(
    'studentMemberships:addUsageAdjustment',
    (_event, id: string, input: MembershipUsageAdjustmentInput) => addMembershipUsageAdjustment(id, input),
  )
}
