import { describe, expect, it } from 'vitest'
import { filterPaymentsByRange, paymentCutoff } from './paymentHistoryFilter'

const now = new Date('2026-08-05T12:00:00Z')

function payment(paidOn: string) {
  return { paidOn }
}

describe('paymentCutoff', () => {
  it('returns null for "all" (no cutoff)', () => {
    expect(paymentCutoff('all', now)).toBeNull()
  })

  it('goes back 90 days for "90d"', () => {
    // 2026-08-05 minus 90 days = 2026-05-07.
    expect(paymentCutoff('90d', now)?.toISOString().slice(0, 10)).toBe('2026-05-07')
  })

  it('goes back one year for "12m"', () => {
    expect(paymentCutoff('12m', now)?.toISOString().slice(0, 10)).toBe('2025-08-05')
  })

  it('does not mutate the passed-in date', () => {
    const original = now.getTime()
    paymentCutoff('12m', now)
    expect(now.getTime()).toBe(original)
  })
})

describe('filterPaymentsByRange', () => {
  const payments = [
    payment('2026-08-01T00:00:00Z'), // within 90d
    payment('2026-03-01T00:00:00Z'), // within 12m, outside 90d
    payment('2024-01-01T00:00:00Z'), // outside 12m
  ]

  it('returns everything for "all"', () => {
    expect(filterPaymentsByRange(payments, 'all', now)).toHaveLength(3)
  })

  it('keeps only the last 90 days for "90d"', () => {
    const kept = filterPaymentsByRange(payments, '90d', now)
    expect(kept).toHaveLength(1)
    expect(kept[0].paidOn).toBe('2026-08-01T00:00:00Z')
  })

  it('keeps only the last 12 months for "12m"', () => {
    const kept = filterPaymentsByRange(payments, '12m', now)
    expect(kept.map((p) => p.paidOn)).toEqual(['2026-08-01T00:00:00Z', '2026-03-01T00:00:00Z'])
  })

  // The cutoff is inclusive, so a payment landing exactly on the boundary is
  // shown rather than dropped by an off-by-one.
  it('includes a payment dated exactly at the cutoff', () => {
    const boundary = paymentCutoff('90d', now)!.toISOString()
    const kept = filterPaymentsByRange([payment(boundary)], '90d', now)
    expect(kept).toHaveLength(1)
  })
})
