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
  due: 'Due',
  overdue: 'Overdue',
}

export const MEMBERSHIP_STATUS_COLOR: Record<MembershipStatus, string> = {
  ok: 'text-green-500',
  due_soon: 'text-amber-500',
  due: 'text-orange-500',
  overdue: 'text-destructive',
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

// The largest value a Prisma `Int` column holds — a signed 32-bit integer.
// Every money amount (cents) and count in the app is stored as `Int`, so a
// value past this overflows on write and surfaces a raw Prisma error in a
// toast instead of a friendly "that price is too large". As cents this is
// ~$21.4M, comfortably above any real price or dues amount.
export const MAX_INT_COLUMN = 2_147_483_647

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
  const cents = Math.round(parsed * 100)
  // A fat-fingered amount past the Int column's ceiling is rejected here rather
  // than left to overflow into a raw Prisma error downstream.
  if (cents > MAX_INT_COLUMN) return null
  return cents
}

// Number.parseInt(...) || 0 alone would let a real negative integer (e.g.
// "-2") through unchanged, since it's truthy — this clamps it to 0 instead.
// Clamped at the top end too, so a huge count can't overflow the Int column.
export function clampNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(MAX_INT_COLUMN, Math.max(0, parsed))
}

// A suggested (not enforced — the field stays editable) stub for a mid-month
// sign-up's partial first month: round(monthlyPrice x daysRemaining /
// daysInMonth), counting the join day itself as one of the remaining days
// (joining on the last day of a 30-day month still owes something for that
// day, not zero). `isoDate` is the chosen start date, "yyyy-mm-dd".
export function suggestProratedChargeCents(monthlyPriceCents: number, isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate() // day 0 of next month = last day of this one
  const daysRemaining = daysInMonth - day + 1
  return Math.round((monthlyPriceCents * daysRemaining) / daysInMonth)
}

