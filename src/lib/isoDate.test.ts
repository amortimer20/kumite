import { describe, expect, it } from 'vitest'
import { isFirstOfMonthIso, startOfNextMonthIso } from './isoDate'

describe('startOfNextMonthIso', () => {
  it('advances to the 1st of the following month', () => {
    expect(startOfNextMonthIso('2025-03-15')).toBe('2025-04-01')
  })

  it('rolls over into January of the next year from December', () => {
    expect(startOfNextMonthIso('2025-12-25')).toBe('2026-01-01')
  })

  it('advances even when already on the 1st', () => {
    expect(startOfNextMonthIso('2025-03-01')).toBe('2025-04-01')
  })
})

describe('isFirstOfMonthIso', () => {
  it('is true for the 1st of any month', () => {
    expect(isFirstOfMonthIso('2025-03-01')).toBe(true)
    expect(isFirstOfMonthIso('2025-12-01')).toBe(true)
  })

  it('is false for any other day', () => {
    expect(isFirstOfMonthIso('2025-03-02')).toBe(false)
    expect(isFirstOfMonthIso('2025-03-31')).toBe(false)
  })
})
