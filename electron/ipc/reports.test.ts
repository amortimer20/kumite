import { describe, expect, it, vi } from 'vitest'
import { PAYMENT_METHODS } from '../../shared/types.ts'

// reports.ts imports db.ts, whose module evaluation applies migrations to the
// dev database. These tests only exercise pure logic, so stand it in.
vi.mock('../db.ts', () => ({ prisma: {} }))

const { normalizeMethod } = await import('./reports.ts')

describe('normalizeMethod', () => {
  it('passes through every known method', () => {
    for (const method of PAYMENT_METHODS) {
      expect(normalizeMethod(method)).toBe(method)
    }
  })

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeMethod('Cash')).toBe('cash')
    expect(normalizeMethod('  CHECK  ')).toBe('check')
    expect(normalizeMethod('CaRd')).toBe('card')
  })

  it('buckets null, empty, and unrecognized values into "other"', () => {
    expect(normalizeMethod(null)).toBe('other')
    expect(normalizeMethod('')).toBe('other')
    expect(normalizeMethod('   ')).toBe('other')
    expect(normalizeMethod('venmo')).toBe('other')
  })

  // MembershipPayment.method is a freeform column, so historical rows can hold
  // anything. Whatever comes back must still be a valid bucket, because
  // addToBucket does a non-null assertion on the result of finding that bucket
  // among the ones emptyByMethod() created — an unknown value returned here
  // would be a crash, not a mislabelled row.
  it('only ever returns a method that emptyByMethod would have created a bucket for', () => {
    const inputs = [null, '', 'cash', 'CASH', 'zelle', 'bank transfer', '0', 'other']
    for (const input of inputs) {
      expect(PAYMENT_METHODS).toContain(normalizeMethod(input))
    }
  })
})
