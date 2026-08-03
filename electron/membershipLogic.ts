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

// Number of billing periods that have started as of `asOf`, counting the
// period starting at `startDate` itself as the first one — billing is in
// advance, so a period is owed for the instant it starts, not when it ends.
export function periodsElapsed(startDate: Date, frequency: string, asOf: Date): number {
  let periodStart = startDate
  let count = 0
  while (periodStart <= asOf) {
    count++
    periodStart = advancePeriod(periodStart, frequency)
  }
  return count
}

// Balance-based replacement for inferring status from payment coversUntil
// dates: owed = (everything ever charged) - (total ever paid). Split payments
// then just work (pay half, owe half) without staff having to guess a
// coversUntil date, and paying multiple periods in advance naturally produces a
// credit that covers future periods until it runs out.
//
// `priceCents`/`frequency` are the membership's own snapshotted values, not its
// plan's current ones — the whole balance is recomputed from startDate on every
// read, so using live plan values meant a plan edit rewrote history for
// everyone on it.
//
// `priorChargesCents` is what was already charged in earlier billing terms.
// startDate anchors only the current term and is reset when the cadence
// changes, so without this those earlier periods would stop being owed and the
// payments against them would turn into credit toward the new term.
//
// nextDueDate is the start of the first period of the current term not yet
// covered by payments — kept for continuity with the existing due-date display
// and so computeMembershipStatus (which only needs a single date) doesn't change.
export function computeMembershipBalance(
  startDate: Date,
  frequency: string,
  asOf: Date,
  priceCents: number,
  totalPaidCents: number,
  priorChargesCents = 0,
): { owedCents: number; nextDueDate: Date } {
  const elapsed = periodsElapsed(startDate, frequency, asOf)
  // Payments left over once earlier terms are settled are what can cover the
  // current term. Clamped at 0 so an unpaid earlier balance doesn't read as
  // negative credit here (it's still owed — see owedCents below).
  const creditTowardCurrentTerm = Math.max(0, totalPaidCents - priorChargesCents)
  // A $0 (comp) plan is always covered through the current period — avoids a
  // divide-by-zero and matches "free" actually meaning never owed.
  const periodsCovered = priceCents > 0 ? Math.floor(creditTowardCurrentTerm / priceCents) : elapsed

  let nextDueDate = startDate
  for (let i = 0; i < periodsCovered; i++) {
    nextDueDate = advancePeriod(nextDueDate, frequency)
  }

  const owedCents = Math.max(0, priorChargesCents + elapsed * priceCents - totalPaidCents)
  return { owedCents, nextDueDate }
}

// What a term that is being closed out has charged in total, so it can be
// carried into priorChargesCents when the billing anchor is reset.
export function chargesForTerm(startDate: Date, frequency: string, asOf: Date, priceCents: number): number {
  return periodsElapsed(startDate, frequency, asOf) * priceCents
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
