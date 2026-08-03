import { describe, expect, it } from 'vitest'
import { dollarsToCents, parsePriceToCents } from './membershipFormat'

describe('parsePriceToCents', () => {
  it('parses a normal price', () => {
    expect(parsePriceToCents('12.34')).toBe(1234)
    expect(parsePriceToCents('100')).toBe(10_000)
  })

  it('allows a deliberate zero, so a genuinely free plan is still possible', () => {
    expect(parsePriceToCents('0')).toBe(0)
    expect(parsePriceToCents('0.00')).toBe(0)
  })

  // The whole point of this function: these all previously became 0, which
  // silently created a free membership plan or a $0.00 catalog item.
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['letters', 'abc'],
    ['a comma-grouped number the number input rejects', ','],
    ['a lone currency symbol', '$'],
  ])('returns null for %s rather than 0', (_label, input) => {
    expect(parsePriceToCents(input)).toBeNull()
    // Contrast with the loose helper, which is exactly the old behaviour.
    expect(dollarsToCents(input)).toBe(0)
  })

  it('returns null for a negative price', () => {
    expect(parsePriceToCents('-5')).toBeNull()
  })

  // The case that actually matters: 19.99 * 100 is 1998.9999... in binary
  // floating point, and Math.round absorbs it.
  it('rounds prices entered in cents exactly', () => {
    expect(parsePriceToCents('19.99')).toBe(1999)
    expect(parsePriceToCents('0.07')).toBe(7)
    expect(parsePriceToCents('1234.56')).toBe(123_456)
  })

  // Documents a known limit rather than asserting a fix: a third decimal place
  // can land either side of the halfway point depending on its binary
  // representation (0.145 * 100 is 14.4999..., so this floors). Prices are
  // entered in dollars and cents, so this is out of reach in practice.
  it('is only exact to the cent for sub-cent input', () => {
    expect(parsePriceToCents('0.145')).toBe(14)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parsePriceToCents('  25.50  ')).toBe(2550)
  })
})
