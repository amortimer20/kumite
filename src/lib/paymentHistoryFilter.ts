// A student's payment history spans every membership they've ever had, so it
// only grows. The dialog defaults to a recent window to keep the list scannable
// — the full history is always one "All time" click away, and a "showing X of
// Y" counter makes clear the rest is filtered, not gone.

export const PAYMENT_HISTORY_RANGES = ['90d', '12m', 'all'] as const
export type PaymentHistoryRange = (typeof PAYMENT_HISTORY_RANGES)[number]

export const PAYMENT_HISTORY_RANGE_LABEL: Record<PaymentHistoryRange, string> = {
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  all: 'All time',
}

// 90 days is only ~3 rows for a monthly payer, which reads as "where did it all
// go?" — so the default is a year, bounded but rarely empty.
export const DEFAULT_PAYMENT_HISTORY_RANGE: PaymentHistoryRange = '12m'

// The earliest paidOn still shown for a range, or null for "all" (no cutoff).
export function paymentCutoff(range: PaymentHistoryRange, now: Date): Date | null {
  if (range === 'all') return null
  const cutoff = new Date(now)
  if (range === '90d') cutoff.setDate(cutoff.getDate() - 90)
  else cutoff.setFullYear(cutoff.getFullYear() - 1)
  return cutoff
}

// Keeps payments on or after the cutoff. A payment dated exactly at the cutoff
// is kept (inclusive), so "last 90 days" means the 90-day window, not 89.
export function filterPaymentsByRange<T extends { paidOn: string }>(
  payments: T[],
  range: PaymentHistoryRange,
  now: Date = new Date(),
): T[] {
  const cutoff = paymentCutoff(range, now)
  if (!cutoff) return payments
  const cutoffMs = cutoff.getTime()
  return payments.filter((p) => new Date(p.paidOn).getTime() >= cutoffMs)
}
