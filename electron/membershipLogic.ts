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

// Every billing period from `startDate` through the last one that has already
// started as of `asOf` — billing is in advance, so a period is owed for the
// instant it starts, not when it ends. Returns bounds rather than just a
// count so each period can be materialized as its own MembershipCharge row
// (see electron/ipc/memberships.ts); periodsElapsed below is the count-only
// convenience for callers that don't need the bounds.
export function elapsedPeriods(startDate: Date, frequency: string, asOf: Date): { periodStart: Date; periodEnd: Date }[] {
  const periods: { periodStart: Date; periodEnd: Date }[] = []
  let periodStart = startDate
  while (periodStart <= asOf) {
    const periodEnd = advancePeriod(periodStart, frequency)
    periods.push({ periodStart, periodEnd })
    periodStart = periodEnd
  }
  return periods
}

export function periodsElapsed(startDate: Date, frequency: string, asOf: Date): number {
  return elapsedPeriods(startDate, frequency, asOf).length
}

// Balance computed from what's actually been charged (see MembershipCharge)
// rather than derived arithmetic: owed = (everything ever charged) - (total
// ever paid). Split payments then just work (pay half, owe half) without
// staff having to guess a coversUntil date, and paying multiple periods in
// advance naturally produces a credit that covers future periods until it
// runs out.
//
// `charges` must already be materialized through `asOf` by the caller — this
// is pure arithmetic over what's already been charged, not period-walking.
// Each charge keeps the price that applied when it was charged, so a price
// change mid-history is reflected automatically without this function
// needing to know about it.
//
// `effectivePriceCents`/`frequency`/`startDate` describe what's charged
// *next* (not yet materialized, since a not-yet-started period isn't owed
// yet) — used only to project nextDueDate forward when a payment surplus
// reaches past every existing charge, and as the fallback due date for a
// membership with no charges yet (not yet started).
export function computeOwedFromCharges(
  charges: { periodStart: Date | null; periodEnd: Date | null; priceCents: number }[],
  totalPaidCents: number,
  effectivePriceCents: number,
  frequency: string,
  startDate: Date,
): { owedCents: number; nextDueDate: Date } {
  const totalChargedCents = charges.reduce((sum, c) => sum + c.priceCents, 0)
  const owedCents = Math.max(0, totalChargedCents - totalPaidCents)

  // Allocate payment against charges oldest-first (FIFO) — the same
  // allocation the old single-price formula did implicitly by walking
  // forward from startDate a fixed number of "covered" periods, generalized
  // to charges that can each carry their own price. The opening-balance row
  // (no bounds — see MembershipCharge) sorts first, since it represents
  // everything that predates real per-period tracking.
  const sorted = [...charges].sort((a, b) => (a.periodStart?.getTime() ?? -Infinity) - (b.periodStart?.getTime() ?? -Infinity))

  let remaining = totalPaidCents
  let nextDueDate = startDate
  for (const charge of sorted) {
    if (remaining < charge.priceCents) {
      // This charge isn't fully paid — it's the due date. The opening-balance
      // row has no period start of its own; startDate is the closest
      // meaningful stand-in, same as when nothing has been charged at all.
      return { owedCents, nextDueDate: charge.periodStart ?? startDate }
    }
    remaining -= charge.priceCents
    if (charge.periodEnd) nextDueDate = charge.periodEnd
  }

  // Every existing charge is fully covered — any payment left over is a
  // credit toward periods that haven't been charged yet. A $0 (comp) plan is
  // always covered through the last charged period regardless of surplus,
  // which also avoids a divide-by-zero.
  if (effectivePriceCents > 0) {
    const periodsCoveredAhead = Math.floor(remaining / effectivePriceCents)
    for (let i = 0; i < periodsCoveredAhead; i++) {
      nextDueDate = advancePeriod(nextDueDate, frequency)
    }
  }
  return { owedCents, nextDueDate }
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
