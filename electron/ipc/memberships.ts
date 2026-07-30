import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import { computeMembershipBalance, computeMembershipStatus, computeUsage, currentPeriodBounds } from '../membershipLogic.ts'
import type {
  MembershipPaymentInput,
  MembershipPlanInput,
  MembershipUsageAdjustmentInput,
} from '../../shared/types.ts'

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

type MembershipForSerialize = {
  studentId: string
  startDate: Date
  priceOverrideCents: number | null
  plan: { priceCents: number; billingFrequency: string; includedPrivateLessons: number; _count: { studentMemberships: number } }
  payments: { amountCents: number }[]
  usageAdjustments: { delta: number; createdAt: Date }[]
}

async function serializeStudentMembership<T extends MembershipForSerialize>(membership: T) {
  const now = new Date()
  const { periodStart, periodEnd } = currentPeriodBounds(membership.startDate, membership.plan.billingFrequency, now)

  const effectivePriceCents = membership.priceOverrideCents ?? membership.plan.priceCents
  const totalPaidCents = membership.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const { owedCents, nextDueDate } = computeMembershipBalance(
    membership.startDate,
    membership.plan.billingFrequency,
    now,
    effectivePriceCents,
    totalPaidCents,
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
  input: { planId: string; priceOverrideCents?: number | null; startDate: string },
) {
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
    return tx.studentMembership.create({
      data: {
        studentId,
        planId: input.planId,
        priceOverrideCents: input.priceOverrideCents,
        startDate: new Date(input.startDate),
      },
      include: studentMembershipInclude,
    })
  })
  return serializeStudentMembership(membership)
}

export async function updateMembership(id: string, input: { planId?: string; priceOverrideCents?: number | null }) {
  const data: Prisma.StudentMembershipUpdateInput = { ...input }
  if (input.planId) {
    const current = await prisma.studentMembership.findUniqueOrThrow({ where: { id }, include: { plan: true } })
    if (input.planId !== current.planId) {
      const newPlan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: input.planId } })
      // A different billing cadence starting mid-cycle would otherwise
      // keep walking periods forward from the old plan's stale anchor
      // date — restart the clock from today instead so the new cadence
      // counts from the point the switch actually happened.
      if (newPlan.billingFrequency !== current.plan.billingFrequency) {
        data.startDate = new Date()
      }
    }
  }
  const membership = await prisma.studentMembership.update({
    where: { id },
    data,
    include: studentMembershipInclude,
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

  ipcMain.handle('studentMemberships:getForStudent', (_event, studentId: string) => getMembershipForStudent(studentId))
  ipcMain.handle('studentMemberships:getPaymentHistory', (_event, studentId: string) => getPaymentHistoryForStudent(studentId))
  ipcMain.handle('studentMemberships:listActive', () => listActiveMemberships())
  ipcMain.handle(
    'studentMemberships:assign',
    (_event, studentId: string, input: { planId: string; priceOverrideCents?: number | null; startDate: string }) =>
      assignMembership(studentId, input),
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
  ipcMain.handle(
    'studentMemberships:addUsageAdjustment',
    (_event, id: string, input: MembershipUsageAdjustmentInput) => addMembershipUsageAdjustment(id, input),
  )
}
