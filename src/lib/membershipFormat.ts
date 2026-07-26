import type { MembershipBillingFrequency } from '../../shared/types'

export const FREQUENCY_LABEL: Record<MembershipBillingFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function dollarsToCents(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

// Number.parseInt(...) || 0 alone would let a real negative integer (e.g.
// "-2") through unchanged, since it's truthy — this clamps it to 0 instead.
export function clampNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

// Clamps to the last day of the target month instead of overflowing into the
// next one, matching the server-side computation in electron/ipc/memberships.ts.
function addMonthsClamped(date: Date, months: number): Date {
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

// Used only to prefill a sensible default "covers until" date in the
// payment form — staff can always edit it, so this doesn't need to match
// the server's authoritative computation with the same rigor.
export function advanceOnePeriod(isoDate: string, frequency: MembershipBillingFrequency): Date {
  const date = new Date(`${isoDate}T00:00:00`)
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
  // biweekly — this should be unreachable given the type, but a raw string
  // from a data-restore or future format change shouldn't produce quietly
  // wrong billing math.
  throw new Error(`Unknown membership billing frequency: ${frequency}`)
}
