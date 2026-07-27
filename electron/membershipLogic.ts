// Pure billing/usage math for memberships — deliberately free of any Prisma
// or Electron import so it can be unit tested directly, with no database and
// no IPC plumbing involved.
import type { MembershipStatus } from '../shared/types.ts'

// Clamps to the last day of the target month instead of overflowing into the
// next one (the classic "Jan 31 + 1 month" bug — plain setMonth would land
// on ~March 3rd instead of Feb 28th/29th).
export function addMonthsClamped(date: Date, months: number): Date {
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

export function advancePeriod(date: Date, frequency: string): Date {
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
export function currentPeriodBounds(startDate: Date, frequency: string, asOf: Date) {
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
export const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export function computeMembershipStatus(nextDueDate: Date, now: Date): MembershipStatus {
  const msUntilDue = nextDueDate.getTime() - now.getTime()
  return msUntilDue <= 0 ? 'overdue' : msUntilDue <= DUE_SOON_WINDOW_MS ? 'due_soon' : 'ok'
}

// A positive delta is a credit (e.g. "+1 bonus lesson"), so it reduces the
// used count — giving the student more remaining, not less. Only adjustments
// granted within the current period count toward it: a bonus is a one-time
// credit for "right now," not a permanent bump reapplied every future cycle.
export function computeUsage(
  scheduledLessons: number,
  usageAdjustments: { delta: number; createdAt: Date }[],
  periodStart: Date,
  periodEnd: Date,
  includedPrivateLessons: number,
) {
  const adjustmentCredit = usageAdjustments
    .filter((a) => a.createdAt >= periodStart && a.createdAt < periodEnd)
    .reduce((sum, a) => sum + a.delta, 0)
  const privateLessonsUsed = scheduledLessons - adjustmentCredit
  return {
    privateLessonsUsed,
    privateLessonsRemaining: includedPrivateLessons - privateLessonsUsed,
  }
}
