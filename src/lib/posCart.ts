import type { PosItem } from '../../shared/types'

// A cart line holds a snapshot of the catalog item taken when it was added, so
// quantities can be adjusted without re-fetching.
export type CartLine = { item: PosItem; quantity: number }

// Re-points each cart line at the current catalog row.
//
// The cart's snapshots are only a display convenience: at checkout the server
// re-reads the catalog and snapshots the price itself, so the cart is not the
// source of truth for what gets charged. Without this, editing a price from
// Manage Items while that item sits in the cart left the running total — and
// the "Sale completed — $X" toast — quoting a figure the recorded sale didn't
// use, so staff could collect the wrong amount and Recent Sales would
// immediately contradict the toast.
//
// Lines whose item has since been deleted are dropped and reported, because
// checkout would reject them anyway ("no longer exists") and failing at the
// till is worse than being told up front. An item that was merely *archived*
// is kept: it still exists, the sale will go through, and silently removing
// something mid-transaction is more surprising than completing it.
export function reconcileCart(
  lines: CartLine[],
  items: PosItem[],
): { lines: CartLine[]; removedNames: string[] } {
  const byId = new Map(items.map((item) => [item.id, item]))
  const kept: CartLine[] = []
  const removedNames: string[] = []

  for (const line of lines) {
    const fresh = byId.get(line.item.id)
    if (!fresh) {
      removedNames.push(line.item.name)
      continue
    }
    // Only replace the line when something it displays actually differs, so an
    // unchanged cart keeps its existing objects and the array below can be
    // returned by reference.
    const unchanged =
      fresh.name === line.item.name &&
      fresh.priceCents === line.item.priceCents &&
      fresh.active === line.item.active
    kept.push(unchanged ? line : { ...line, item: fresh })
  }

  const changed = removedNames.length > 0 || kept.some((line, i) => line !== lines[i])
  return { lines: changed ? kept : lines, removedNames }
}
