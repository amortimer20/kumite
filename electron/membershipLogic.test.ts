import { describe, expect, it } from 'vitest'
import {
  DUE_SOON_WINDOW_MS,
  addMonthsClamped,
  advancePeriod,
  computeMembershipStatus,
  computeUsage,
  currentPeriodBounds,
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
