import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../testUtils/testDb.ts'

let mockPrisma: Awaited<ReturnType<typeof createTestDb>>['prisma']
vi.mock('../db.ts', () => ({
  get prisma() {
    return mockPrisma
  },
}))

const { createPosItem, createPosSale, deletePosItem } = await import('./pos.ts')

let testDb: Awaited<ReturnType<typeof createTestDb>>

beforeAll(async () => {
  testDb = await createTestDb()
  mockPrisma = testDb.prisma
})

afterAll(async () => {
  await testDb.cleanup()
})

describe('createPosSale', () => {
  // The whole point of snapshotting name/price onto PosSaleItem: a later
  // catalog reprice must not rewrite what a completed sale charged.
  it('keeps the sale line at the snapshotted price after the catalog is repriced', async () => {
    const item = await createPosItem({ name: 'Gi', priceCents: 1000 })

    const sale = await createPosSale({ items: [{ itemId: item.id, quantity: 2 }] })
    expect(sale.totalCents).toBe(2000)
    expect(sale.items[0].unitPriceCents).toBe(1000)
    expect(sale.items[0].lineTotalCents).toBe(2000)

    await mockPrisma.posItem.update({ where: { id: item.id }, data: { priceCents: 5000 } })

    const reread = await mockPrisma.posSale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    })
    expect(reread.totalCents).toBe(2000)
    expect(reread.items[0].unitPriceCents).toBe(1000)
  })

  it('throws when an item id no longer exists', async () => {
    await expect(createPosSale({ items: [{ itemId: 'does-not-exist', quantity: 1 }] })).rejects.toThrow(
      /no longer exists/,
    )
  })

  it('rejects an empty cart', async () => {
    await expect(createPosSale({ items: [] })).rejects.toThrow(/at least one item/)
  })

  it('rejects a non-integer quantity', async () => {
    const item = await createPosItem({ name: 'Belt', priceCents: 500 })
    await expect(createPosSale({ items: [{ itemId: item.id, quantity: 1.5 }] })).rejects.toThrow(
      /whole number/,
    )
  })

  it('rejects a zero or negative quantity', async () => {
    const item = await createPosItem({ name: 'Patch', priceCents: 300 })
    await expect(createPosSale({ items: [{ itemId: item.id, quantity: 0 }] })).rejects.toThrow(
      /whole number/,
    )
  })
})

describe('deletePosItem', () => {
  it('hard-deletes an item that has never been sold', async () => {
    const item = await createPosItem({ name: 'Water bottle', priceCents: 200 })

    const result = await deletePosItem(item.id)
    expect(result.archived).toBe(false)
    expect(await mockPrisma.posItem.findUnique({ where: { id: item.id } })).toBeNull()
  })

  // A sold item can't be hard-deleted without taking its sale-history rows
  // with it, so it's archived (active: false) and drops out of the grid.
  it('archives an item that has been sold instead of deleting it', async () => {
    const item = await createPosItem({ name: 'Sparring gloves', priceCents: 4000 })
    await createPosSale({ items: [{ itemId: item.id, quantity: 1 }] })

    const result = await deletePosItem(item.id)
    expect(result.archived).toBe(true)

    const row = await mockPrisma.posItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(row.active).toBe(false)
  })
})
