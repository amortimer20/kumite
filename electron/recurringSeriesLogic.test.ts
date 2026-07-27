import { describe, expect, it } from 'vitest'
import { addDaysIso, combineDateAndTime, computeOccurrenceDates, isoDateOf } from './recurringSeriesLogic.ts'

describe('isoDateOf', () => {
  it('formats a local date as yyyy-mm-dd regardless of time-of-day', () => {
    expect(isoDateOf(new Date(2025, 5, 7, 23, 59))).toBe('2025-06-07')
    expect(isoDateOf(new Date(2025, 5, 7, 0, 0))).toBe('2025-06-07')
  })
})

describe('addDaysIso', () => {
  it('adds days within a month', () => {
    expect(addDaysIso('2025-06-01', 7)).toBe('2025-06-08')
  })

  it('rolls over a month boundary', () => {
    expect(addDaysIso('2025-06-28', 7)).toBe('2025-07-05')
  })

  it('rolls over a year boundary', () => {
    expect(addDaysIso('2025-12-28', 7)).toBe('2026-01-04')
  })
})

describe('combineDateAndTime', () => {
  it('produces a Date at the given local time', () => {
    const d = combineDateAndTime('2025-06-01', '15:30')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(15)
    expect(d.getMinutes()).toBe(30)
  })
})

describe('computeOccurrenceDates', () => {
  it('generates weekly dates up through the last one at or before the horizon', () => {
    const horizon = combineDateAndTime('2025-06-22', '15:00') // exactly 3 weeks after start
    const dates = computeOccurrenceDates('2025-06-01', '15:00', horizon)
    expect(dates).toEqual(['2025-06-01', '2025-06-08', '2025-06-15', '2025-06-22'])
  })

  it('excludes an occurrence that would start after the horizon', () => {
    const horizon = combineDateAndTime('2025-06-20', '15:00') // 2 days before the 4th occurrence
    const dates = computeOccurrenceDates('2025-06-01', '15:00', horizon)
    expect(dates).toEqual(['2025-06-01', '2025-06-08', '2025-06-15'])
  })

  it('always includes the start date even if the horizon is the same day', () => {
    const horizon = combineDateAndTime('2025-06-01', '15:00')
    const dates = computeOccurrenceDates('2025-06-01', '15:00', horizon)
    expect(dates).toEqual(['2025-06-01'])
  })
})
