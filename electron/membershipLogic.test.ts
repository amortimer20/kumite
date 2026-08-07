import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_WINDOW_MS,
  addMonthsClamped,
  advancePeriod,
  computeMembershipStatus,
  computeOwedFromCharges,
  computeUsage,
  currentPeriodBounds,
  elapsedPeriods,
  periodsElapsed,
} from './membershipLogic.ts'

describe('addMonthsClamped', () => {
  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    const result = addMonthsClamped(new Date(2025, 0, 31), 1)
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(28)
  })

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    const result = addMonthsClamped(new Date(2024, 0, 31), 1)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(29)
  })

  it('leaves a mid-month date unaffected by clamping', () => {
    const result = addMonthsClamped(new Date(2025, 2, 15), 1)
    expect(result.getMonth()).toBe(3)
    expect(result.getDate()).toBe(15)
  })
})

describe('advancePeriod', () => {
  const start = new Date(2025, 5, 1) // June 1, 2025

  it('advances weekly by 7 days', () => {
    const result = advancePeriod(start, 'weekly')
    expect(result.getDate()).toBe(8)
    expect(result.getMonth()).toBe(5)
  })

  it('advances biweekly by 14 days', () => {
    const result = advancePeriod(start, 'biweekly')
    expect(result.getDate()).toBe(15)
    expect(result.getMonth()).toBe(5)
  })

  it('advances monthly via addMonthsClamped', () => {
    const result = advancePeriod(new Date(2025, 0, 31), 'monthly')
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(28)
  })

  it('throws on an unrecognized frequency instead of silently defaulting', () => {
    expect(() => advancePeriod(start, 'yearly')).toThrow('Unknown membership billing frequency: yearly')
  })
})

describe('currentPeriodBounds', () => {
  it('returns the first period when asOf is within it', () => {
    const startDate = new Date(2025, 0, 1)
    const asOf = new Date(2025, 0, 15)
    const { periodStart, periodEnd } = currentPeriodBounds(startDate, 'monthly', asOf)
    expect(periodStart).toEqual(startDate)
    expect(periodEnd).toEqual(new Date(2025, 1, 1))
  })

  it('walks forward across multiple elapsed periods', () => {
    const startDate = new Date(2025, 0, 1)
    const asOf = new Date(2025, 3, 10) // well into April, 3 monthly periods elapsed
    const { periodStart, periodEnd } = currentPeriodBounds(startDate, 'monthly', asOf)
    expect(periodStart).toEqual(new Date(2025, 3, 1))
    expect(periodEnd).toEqual(new Date(2025, 4, 1))
  })

  it('treats asOf exactly on a period boundary as the start of the next period', () => {
    const startDate = new Date(2025, 0, 1)
    const asOf = new Date(2025, 1, 1) // exactly periodEnd of the first period
    const { periodStart, periodEnd } = currentPeriodBounds(startDate, 'monthly', asOf)
    expect(periodStart).toEqual(new Date(2025, 1, 1))
    expect(periodEnd).toEqual(new Date(2025, 2, 1))
  })
})

describe('computeMembershipStatus', () => {
  const now = new Date(2025, 5, 15, 12, 0, 0)

  it('is overdue the instant the due date passes (zero grace period)', () => {
    expect(computeMembershipStatus(now, now)).toBe('overdue')
    expect(computeMembershipStatus(new Date(now.getTime() - 1), now)).toBe('overdue')
  })

  it('is due_soon within the 3-day window', () => {
    const dueDate = new Date(now.getTime() + DUE_SOON_WINDOW_MS)
    expect(computeMembershipStatus(dueDate, now)).toBe('due_soon')
    expect(computeMembershipStatus(new Date(now.getTime() + 1), now)).toBe('due_soon')
  })

  it('is ok once past the due_soon window', () => {
    const dueDate = new Date(now.getTime() + DUE_SOON_WINDOW_MS + 1)
    expect(computeMembershipStatus(dueDate, now)).toBe('ok')
  })
})

describe('periodsElapsed', () => {
  it('counts the first period as elapsed the instant it starts', () => {
    const startDate = new Date(2025, 0, 1)
    expect(periodsElapsed(startDate, 'monthly', startDate)).toBe(1)
  })

  it('counts multiple elapsed periods', () => {
    const startDate = new Date(2025, 0, 1)
    const asOf = new Date(2025, 3, 10) // well into April
    expect(periodsElapsed(startDate, 'monthly', asOf)).toBe(4) // Jan, Feb, Mar, Apr
  })

  it('is 0 if the membership has not started yet', () => {
    const startDate = new Date(2025, 5, 1)
    const asOf = new Date(2025, 4, 15)
    expect(periodsElapsed(startDate, 'monthly', asOf)).toBe(0)
  })
})

describe('elapsedPeriods', () => {
  it('returns each period\'s own start and end, not just a count', () => {
    const startDate = new Date(2025, 0, 1)
    const asOf = new Date(2025, 2, 10) // into the 3rd month
    const periods = elapsedPeriods(startDate, 'monthly', asOf)
    expect(periods).toEqual([
      { periodStart: new Date(2025, 0, 1), periodEnd: new Date(2025, 1, 1) },
      { periodStart: new Date(2025, 1, 1), periodEnd: new Date(2025, 2, 1) },
      { periodStart: new Date(2025, 2, 1), periodEnd: new Date(2025, 3, 1) },
    ])
  })
})

describe('computeOwedFromCharges', () => {
  const startDate = new Date(2025, 0, 1)
  const priceCents = 10000

  // Mirrors how memberships.ts actually populates charge rows: one row per
  // elapsed period, each priced at whatever was in effect when it was charged.
  function chargesThrough(asOf: Date, price = priceCents) {
    return elapsedPeriods(startDate, 'monthly', asOf).map(({ periodStart, periodEnd }) => ({
      periodStart,
      periodEnd,
      priceCents: price,
    }))
  }

  it('owes a full period with no payments, due immediately at startDate', () => {
    const { owedCents, nextDueDate } = computeOwedFromCharges(chargesThrough(startDate), 0, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(10000)
    expect(nextDueDate).toEqual(startDate)
  })

  it('owes nothing once the current period is fully paid', () => {
    const { owedCents, nextDueDate } = computeOwedFromCharges(chargesThrough(startDate), 10000, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(0)
    expect(nextDueDate).toEqual(new Date(2025, 1, 1))
  })

  // This is the split-payment scenario the balance model exists to fix:
  // paying half up front used to be indistinguishable from paying in full
  // unless staff manually shortened a coversUntil date. Here it just works.
  it('a half payment leaves half the period owed, not fully paid', () => {
    const { owedCents, nextDueDate } = computeOwedFromCharges(chargesThrough(startDate), 5000, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(5000)
    expect(nextDueDate).toEqual(startDate) // still due — the period isn't fully covered yet
  })

  it('the second half payment then clears the balance', () => {
    const { owedCents, nextDueDate } = computeOwedFromCharges(chargesThrough(startDate), 10000, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(0)
    expect(nextDueDate).toEqual(new Date(2025, 1, 1))
  })

  it('paying multiple periods in advance produces a credit, not overdue status later', () => {
    const asOf = new Date(2025, 1, 15) // into the 2nd period
    const { owedCents, nextDueDate } = computeOwedFromCharges(chargesThrough(asOf), 30000, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(0)
    expect(nextDueDate).toEqual(new Date(2025, 3, 1)) // paid through 3 periods
  })

  it('treats a $0 (comp) plan as always covered, never owing', () => {
    const asOf = new Date(2025, 5, 15)
    const { owedCents } = computeOwedFromCharges(chargesThrough(asOf, 0), 0, 0, 'monthly', startDate)
    expect(owedCents).toBe(0)
  })

  // The actual payoff of a real ledger over the old single-price formula: a
  // price change mid-history is reflected exactly, because each charge kept
  // the price that applied when it was charged rather than one current price
  // being applied uniformly to every elapsed period.
  it('honours each charge\'s own price rather than the current one', () => {
    const charges = [
      { periodStart: new Date(2025, 0, 1), periodEnd: new Date(2025, 1, 1), priceCents: 8000 }, // old price
      { periodStart: new Date(2025, 1, 1), periodEnd: new Date(2025, 2, 1), priceCents: 10000 }, // new price
    ]
    const { owedCents } = computeOwedFromCharges(charges, 8000, 10000, 'monthly', startDate)
    expect(owedCents).toBe(10000) // $80 + $100 charged, $80 paid
  })

  it('falls back to startDate as the due date when nothing has been charged yet (not yet started)', () => {
    const futureStart = new Date(2025, 5, 1)
    const { owedCents, nextDueDate } = computeOwedFromCharges([], 0, priceCents, 'monthly', futureStart)
    expect(owedCents).toBe(0)
    expect(nextDueDate).toEqual(futureStart)
  })

  it('ignores the opening-balance row (no bounds) when finding the last charged period', () => {
    const charges = [
      { periodStart: null, periodEnd: null, priceCents: 5000 }, // legacy opening balance
      { periodStart: new Date(2025, 0, 1), periodEnd: new Date(2025, 1, 1), priceCents: 10000 },
    ]
    const { owedCents, nextDueDate } = computeOwedFromCharges(charges, 15000, priceCents, 'monthly', startDate)
    expect(owedCents).toBe(0)
    expect(nextDueDate).toEqual(new Date(2025, 1, 1))
  })
})

describe('computeUsage', () => {
  const periodStart = new Date(2025, 5, 1)
  const periodEnd = new Date(2025, 6, 1)

  it('counts scheduled lessons as used with no adjustments', () => {
    const { privateLessonsUsed, privateLessonsRemaining } = computeUsage(2, [], periodStart, periodEnd, 4)
    expect(privateLessonsUsed).toBe(2)
    expect(privateLessonsRemaining).toBe(2)
  })

  // Regression test: a prior version of this logic added the adjustment
  // instead of subtracting it, so a "+1 bonus lesson" perversely increased
  // the used count instead of decreasing it.
  it('a positive delta (bonus lesson) reduces used and increases remaining', () => {
    const adjustments = [{ delta: 1, createdAt: new Date(2025, 5, 10) }]
    const { privateLessonsUsed, privateLessonsRemaining } = computeUsage(2, adjustments, periodStart, periodEnd, 2)
    expect(privateLessonsUsed).toBe(1)
    expect(privateLessonsRemaining).toBe(1)
  })

  it('a negative delta (correction) increases used and decreases remaining', () => {
    const adjustments = [{ delta: -1, createdAt: new Date(2025, 5, 10) }]
    const { privateLessonsUsed, privateLessonsRemaining } = computeUsage(2, adjustments, periodStart, periodEnd, 4)
    expect(privateLessonsUsed).toBe(3)
    expect(privateLessonsRemaining).toBe(1)
  })

  it('excludes adjustments created outside the current period', () => {
    const adjustments = [
      { delta: 1, createdAt: new Date(2025, 3, 10) }, // before periodStart
      { delta: 1, createdAt: new Date(2025, 7, 10) }, // at/after periodEnd
    ]
    const { privateLessonsUsed } = computeUsage(2, adjustments, periodStart, periodEnd, 4)
    expect(privateLessonsUsed).toBe(2)
  })

  it('can go negative when a bonus outpaces usage (remaining is not clamped here)', () => {
    const adjustments = [{ delta: 3, createdAt: new Date(2025, 5, 10) }]
    const { privateLessonsUsed } = computeUsage(1, adjustments, periodStart, periodEnd, 0)
    expect(privateLessonsUsed).toBe(-2)
  })
})
