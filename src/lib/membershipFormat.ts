import type { MembershipBillingFrequency, MembershipStatus, PaymentMethod } from '../../shared/types'

export const FREQUENCY_LABEL: Record<MembershipBillingFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

// Shared between the POS checkout, membership payment form, and financial
// reports — one label map instead of a copy in each.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  check: 'Check',
  other: 'Other',
}

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ok: 'OK',
  due_soon: 'Due soon',
  overdue: 'Overdue',
}

export const MEMBERSHIP_STATUS_COLOR: Record<MembershipStatus, string> = {
  ok: 'text-green-500',
  due_soon: 'text-amber-500',
  overdue: 'text-destructive',
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function dollarsToCents(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

// Strict counterpart to dollarsToCents, for prices where "blank" must not
// quietly mean "free". dollarsToCents maps an empty or unparseable string to 0,
// which let a plan or catalog item be saved at $0.00 with a success toast — and
// a $0 membership plan reads as permanently paid up for every student on it.
// Returns null when there is no usable amount, so the caller has to decide.
export function parsePriceToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

// Number.parseInt(...) || 0 alone would let a real negative integer (e.g.
// "-2") through unchanged, since it's truthy — this clamps it to 0 instead.
export function clampNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

