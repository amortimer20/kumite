import { describe, expect, it } from 'vitest'
import { reconcileCart } from './posCart'
import type { PosItem } from '../../shared/types'

function item(id: string, name: string, priceCents: number, active = true): PosItem {
  return { id, name, priceCents, active, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }
}

const gloves = item('1', 'Gloves', 2000)
const belt = item('2', 'Belt', 1500)

describe('reconcileCart', () => {
  it('picks up a price edited after the item was added to the cart', () => {
    const cart = [{ item: gloves, quantity: 2 }]
    const { lines, removedNames } = reconcileCart(cart, [item('1', 'Gloves', 2500)])

    expect(lines[0].item.priceCents).toBe(2500)
    expect(lines[0].quantity).toBe(2)
    expect(removedNames).toEqual([])
  })

  it('picks up a rename', () => {
    const { lines } = reconcileCart([{ item: gloves, quantity: 1 }], [item('1', 'Sparring Gloves', 2000)])
    expect(lines[0].item.name).toBe('Sparring Gloves')
  })

  it('drops a line whose item was deleted, and reports it by name', () => {
    const cart = [{ item: gloves, quantity: 1 }, { item: belt, quantity: 3 }]
    const { lines, removedNames } = reconcileCart(cart, [belt])

    expect(lines).toHaveLength(1)
    expect(lines[0].item.id).toBe('2')
    expect(lines[0].quantity).toBe(3)
    expect(removedNames).toEqual(['Gloves'])
  })

  // An archived item still exists, so checkout succeeds — removing it mid-sale
  // would be more surprising than completing it.
  it('keeps an item that was archived while in the cart', () => {
    const { lines, removedNames } = reconcileCart(
      [{ item: gloves, quantity: 1 }],
      [item('1', 'Gloves', 2000, false)],
    )
    expect(lines).toHaveLength(1)
    expect(lines[0].item.active).toBe(false)
    expect(removedNames).toEqual([])
  })

  // Returning the same array when nothing differs keeps refresh() from
  // needlessly replacing cart state on every call.
  it('returns the original array by reference when nothing changed', () => {
    const cart = [{ item: gloves, quantity: 2 }, { item: belt, quantity: 1 }]
    const { lines, removedNames } = reconcileCart(cart, [gloves, belt])

    expect(lines).toBe(cart)
    expect(removedNames).toEqual([])
  })

  it('handles an empty cart and an empty catalog', () => {
    expect(reconcileCart([], [gloves]).lines).toEqual([])
    expect(reconcileCart([{ item: gloves, quantity: 1 }], []).removedNames).toEqual(['Gloves'])
  })
})
