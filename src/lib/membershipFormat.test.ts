import { describe, expect, it } from 'vitest'
import { MAX_INT_COLUMN, clampNonNegativeInt, dollarsToCents, parsePriceToCents } from './membershipFormat'

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

  // A fat-fingered amount past the Int column's ceiling would otherwise reach
  // Prisma and surface a raw overflow message in a toast. Rejected as null
  // here, so it lands in the same "invalid price" path as blanks and negatives.
  it('returns null for an amount past the Int column ceiling', () => {
    // MAX_INT_COLUMN is in cents; feed dollars just over it.
    const justOverDollars = (MAX_INT_COLUMN / 100 + 1).toString()
    expect(parsePriceToCents(justOverDollars)).toBeNull()
    expect(parsePriceToCents('99999999')).toBeNull()
  })

  it('accepts an amount exactly at the ceiling', () => {
    expect(parsePriceToCents((MAX_INT_COLUMN / 100).toFixed(2))).toBe(MAX_INT_COLUMN)
  })
})

describe('clampNonNegativeInt', () => {
  it('parses a normal count', () => {
    expect(clampNonNegativeInt('4')).toBe(4)
  })

  it('clamps a negative to 0', () => {
    expect(clampNonNegativeInt('-2')).toBe(0)
  })

  it('treats an unparseable value as 0', () => {
    expect(clampNonNegativeInt('abc')).toBe(0)
    expect(clampNonNegativeInt('')).toBe(0)
  })

  it('clamps a count past the Int column ceiling', () => {
    expect(clampNonNegativeInt('9999999999')).toBe(MAX_INT_COLUMN)
  })
})
