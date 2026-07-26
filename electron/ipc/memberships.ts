import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
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

function serializeMembershipPlan<T extends { _count: { studentMemberships: number } }>(plan: T) {
  const { _count, ...rest } = plan
  return { ...rest, studentCount: _count.studentMemberships }
}

// Clamps to the last day of the target month instead of overflowing into the
// next one (the classic "Jan 31 + 1 month" bug — plain setMonth would land
// on ~March 3rd instead of Feb 28th/29th).
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate()
  const result = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  )
  const daysInResultMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, daysInResultMonth))
  return result
}

function advancePeriod(date: Date, frequency: string): Date {
  if (frequency === 'monthly') return addMonthsClamped(date, 1)
  if (frequency === 'weekly') {
    const next = new Date(date)
    next.setDate(next.getDate() + 7)
    return next
  }
  if (frequency === 'biweekly') {
    const next = new Date(date)
    next.setDate(next.getDate() + 14)
    return next
  }
  // Fails loudly instead of silently treating an unrecognized value as
  // biweekly — should be unreachable given the type, but a raw string from a
  // data-restore or future format change shouldn't produce quietly wrong
  // billing math.
  throw new Error(`Unknown membership billing frequency: ${frequency}`)
}

// Walks forward in frequency-sized steps from the membership's start date
// until it finds the period bracketing `asOf`. A handful of iterations in
// practice (years of history / period length), so this is fast enough
// without needing closed-form calendar math for the monthly case.
function currentPeriodBounds(startDate: Date, frequency: string, asOf: Date) {
  let periodStart = startDate
  let periodEnd = advancePeriod(periodStart, frequency)
  while (periodEnd <= asOf) {
    periodStart = periodEnd
    periodEnd = advancePeriod(periodStart, frequency)
  }
  return { periodStart, periodEnd }
}

// Window before the actual due date where status shows "due soon" — distinct
// from the overdue threshold itself, which per product decision has zero
// grace period (overdue the instant the due date passes).
const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

type MembershipForSerialize = {
  studentId: string
  startDate: Date
  priceOverrideCents: number | null
  plan: { priceCents: number; billingFrequency: string; includedPrivateLessons: number; _count: { studentMemberships: number } }
  payments: { coversUntil: Date }[]
  usageAdjustments: { delta: number; createdAt: Date }[]
}

async function serializeStudentMembership<T extends MembershipForSerialize>(membership: T) {
  const now = new Date()
  const { periodStart, periodEnd } = currentPeriodBounds(membership.startDate, membership.plan.billingFrequency, now)

  const nextDueDate = membership.payments.reduce(
    (max, p) => (p.coversUntil > max ? p.coversUntil : max),
    membership.startDate,
  )

  const msUntilDue = nextDueDate.getTime() - now.getTime()
  const status = msUntilDue <= 0 ? 'overdue' : msUntilDue <= DUE_SOON_WINDOW_MS ? 'due_soon' : 'ok'

  const scheduledLessons = await prisma.lesson.count({
    where: {
      studentId: membership.studentId,
      startTime: { gte: periodStart, lt: periodEnd },
      status: { not: 'cancelled' },
    },
  })
  // A positive delta is a credit (e.g. "+1 bonus lesson"), so it reduces the
  // used count — giving the student more remaining, not less. Only
  // adjustments granted within the current period count toward it: a bonus
  // is a one-time credit for "right now," not a permanent bump reapplied
  // every future cycle.
  const adjustmentCredit = membership.usageAdjustments
    .filter((a) => a.createdAt >= periodStart && a.createdAt < periodEnd)
    .reduce((sum, a) => sum + a.delta, 0)
  const privateLessonsUsed = scheduledLessons - adjustmentCredit

  const { plan, ...rest } = membership
  return {
    ...rest,
    plan: serializeMembershipPlan(plan),
    effectivePriceCents: rest.priceOverrideCents ?? plan.priceCents,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    nextDueDate,
    status,
    privateLessonsUsed,
    privateLessonsRemaining: plan.includedPrivateLessons - privateLessonsUsed,
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

export function registerMembershipHandlers() {
  ipcMain.handle('membershipPlans:list', async () => {
    const plans = await prisma.membershipPlan.findMany({
      orderBy: { title: 'asc' },
      include: membershipPlanInclude,
    })
    return plans.map(serializeMembershipPlan)
  })

  ipcMain.handle('membershipPlans:create', async (_event, input: MembershipPlanInput) => {
    assertValidPlanInput(input)
    const plan = await prisma.membershipPlan.create({ data: input, include: membershipPlanInclude })
    return serializeMembershipPlan(plan)
  })

  ipcMain.handle('membershipPlans:update', async (_event, id: string, input: Partial<MembershipPlanInput>) => {
    assertValidPlanInput(input)
    const plan = await prisma.membershipPlan.update({ where: { id }, data: input, include: membershipPlanInclude })
    return serializeMembershipPlan(plan)
  })

  // Same archive-on-FK-violation fallback as students/instructors: a plan
  // that's ever been assigned to a student can't be hard-deleted (its
  // StudentMembership rows are kept for billing history), so it's archived
  // instead so it drops out of the "assign a plan" picker.
  ipcMain.handle('membershipPlans:delete', async (_event, id: string) => {
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
  })

  ipcMain.handle('studentMemberships:getForStudent', async (_event, studentId: string) => {
    const membership = await prisma.studentMembership.findFirst({
      where: { studentId, active: true },
      include: studentMembershipInclude,
    })
    return membership ? serializeStudentMembership(membership) : null
  })

  ipcMain.handle(
    'studentMemberships:assign',
    async (
      _event,
      studentId: string,
      input: { planId: string; priceOverrideCents?: number | null; startDate: string },
    ) => {
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
    },
  )

  ipcMain.handle(
    'studentMemberships:update',
    async (_event, id: string, input: { planId?: string; priceOverrideCents?: number | null }) => {
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
    },
  )

  ipcMain.handle('studentMemberships:cancel', async (_event, id: string) => {
    await prisma.studentMembership.update({ where: { id }, data: { active: false } })
  })

  ipcMain.handle('studentMemberships:recordPayment', async (_event, id: string, input: MembershipPaymentInput) => {
    if (input.amountCents <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }
    const coversFrom = new Date(input.coversFrom)
    const coversUntil = new Date(input.coversUntil)
    if (coversUntil <= coversFrom) {
      throw new Error('Coverage end date must be after the start date.')
    }
    await prisma.membershipPayment.create({
      data: {
        studentMembershipId: id,
        amountCents: input.amountCents,
        method: input.method,
        paidOn: new Date(input.paidOn),
        coversFrom,
        coversUntil,
        notes: input.notes,
      },
    })
    const membership = await prisma.studentMembership.findUniqueOrThrow({
      where: { id },
      include: studentMembershipInclude,
    })
    return serializeStudentMembership(membership)
  })

  ipcMain.handle('studentMemberships:deletePayment', async (_event, paymentId: string) => {
    const deleted = await prisma.membershipPayment.delete({ where: { id: paymentId } })
    const membership = await prisma.studentMembership.findUniqueOrThrow({
      where: { id: deleted.studentMembershipId },
      include: studentMembershipInclude,
    })
    return serializeStudentMembership(membership)
  })

  ipcMain.handle(
    'studentMemberships:addUsageAdjustment',
    async (_event, id: string, input: MembershipUsageAdjustmentInput) => {
      await prisma.membershipUsageAdjustment.create({
        data: { studentMembershipId: id, delta: input.delta, reason: input.reason },
      })
      const membership = await prisma.studentMembership.findUniqueOrThrow({
        where: { id },
        include: studentMembershipInclude,
      })
      return serializeStudentMembership(membership)
    },
  )
}
