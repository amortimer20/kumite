import { ipcMain } from 'electron'
import { Prisma } from '../../generated/prisma/client.ts'
import { prisma } from '../db.ts'
import type { PosItemInput, PosSaleInput } from '../../shared/types.ts'

type PosSaleForSerialize = {
  items: { quantity: number; unitPriceCents: number }[]
}

function serializePosSale<T extends PosSaleForSerialize>(sale: T) {
  return {
    ...sale,
    items: sale.items.map((item) => ({ ...item, lineTotalCents: item.quantity * item.unitPriceCents })),
  }
}

// An item can legitimately be $0 (e.g. a comped item), so price is only
// rejected when negative — same reasoning as MembershipPlan.priceCents.
function assertValidItemInput(input: Partial<PosItemInput>) {
  if (input.name !== undefined && input.name.trim() === '') {
    throw new Error('Name is required.')
  }
  if (input.priceCents !== undefined && input.priceCents < 0) {
    throw new Error('Price cannot be negative.')
  }
}

function assertValidSaleInput(input: PosSaleInput) {
  if (input.items.length === 0) {
    throw new Error('A sale needs at least one item.')
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Quantity must be a positive whole number.')
    }
  }
}

export async function listPosItems() {
  return prisma.posItem.findMany({ orderBy: { name: 'asc' } })
}

export async function createPosItem(input: PosItemInput) {
  assertValidItemInput(input)
  return prisma.posItem.create({ data: input })
}

export async function updatePosItem(id: string, input: Partial<PosItemInput>) {
  assertValidItemInput(input)
  return prisma.posItem.update({ where: { id }, data: input })
}

// Same archive-on-FK-violation fallback as membership plans/instructors: an
// item that's ever been sold can't be hard-deleted (its PosSaleItem rows
// are kept for sale history), so it's archived instead so it drops out of
// the checkout grid.
export async function deletePosItem(id: string) {
  try {
    await prisma.posItem.delete({ where: { id } })
    return { archived: false }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      await prisma.posItem.update({ where: { id }, data: { active: false } })
      return { archived: true }
    }
    throw err
  }
}

export async function listPosSales() {
  const sales = await prisma.posSale.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  })
  return sales.map(serializePosSale)
}

// Snapshots each item's current name/price and computes the total
// server-side, inside one transaction, so nothing money-related is ever
// trusted from the client as a lump sum.
export async function createPosSale(input: PosSaleInput) {
  assertValidSaleInput(input)
  const sale = await prisma.$transaction(async (tx) => {
    const itemIds = input.items.map((i) => i.itemId)
    const items = await tx.posItem.findMany({ where: { id: { in: itemIds } } })
    const itemsById = new Map(items.map((item) => [item.id, item]))

    const saleItemsData = input.items.map((requested) => {
      const item = itemsById.get(requested.itemId)
      if (!item) {
        throw new Error('One of the selected items no longer exists.')
      }
      return {
        itemId: item.id,
        itemName: item.name,
        unitPriceCents: item.priceCents,
        quantity: requested.quantity,
      }
    })
    const totalCents = saleItemsData.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0)

    return tx.posSale.create({
      data: {
        studentName: input.studentName ?? null,
        paymentMethod: input.paymentMethod ?? null,
        notes: input.notes ?? null,
        totalCents,
        items: { create: saleItemsData },
      },
      include: { items: true },
    })
  })
  return serializePosSale(sale)
}

// Correction mechanism for a mis-rung sale — no edit-in-place, same
// "delete and redo" convention as membership payments. Nothing else
// references a sale by foreign key, so this always hard-deletes (its line
// items cascade automatically).
export async function deletePosSale(id: string) {
  await prisma.posSale.delete({ where: { id } })
}

export function registerPosHandlers() {
  ipcMain.handle('posItems:list', () => listPosItems())
  ipcMain.handle('posItems:create', (_event, input: PosItemInput) => createPosItem(input))
  ipcMain.handle('posItems:update', (_event, id: string, input: Partial<PosItemInput>) => updatePosItem(id, input))
  ipcMain.handle('posItems:delete', (_event, id: string) => deletePosItem(id))

  ipcMain.handle('posSales:list', () => listPosSales())
  ipcMain.handle('posSales:create', (_event, input: PosSaleInput) => createPosSale(input))
  ipcMain.handle('posSales:delete', (_event, id: string) => deletePosSale(id))
}
