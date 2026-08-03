import { useEffect, useState } from 'react'
import { Minus, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import type { PaymentMethod, PosItem, PosSale, Student } from '../../shared/types'
import { PAYMENT_METHODS } from '../../shared/types'
import { PAYMENT_METHOD_LABEL, formatCents, parsePriceToCents } from '@/lib/membershipFormat'
import { getErrorMessage } from '@/lib/errors'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { TableSkeletonRows } from './TableSkeletonRows'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Sentinel for "no student selected" — Radix Select disallows an empty
// string as an item value, and a sale never requires a student.
const WALK_IN = '__walk_in__'

type CartLine = { item: PosItem; quantity: number }

const EMPTY_ITEM_FORM = { name: '', price: '' }

function summarizeItems(sale: PosSale) {
  return sale.items.map((i) => `${i.quantity}x ${i.itemName}`).join(', ')
}

export function PosPanel() {
  const [items, setItems] = useState<PosItem[]>([])
  const [sales, setSales] = useState<PosSale[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState(WALK_IN)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [notes, setNotes] = useState('')
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  // Guards against a fast double-click completing the same sale twice.
  const [submitting, setSubmitting] = useState(false)

  const [manageOpen, setManageOpen] = useState(false)
  const [showArchivedItems, setShowArchivedItems] = useState(false)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM)
  const [itemFormError, setItemFormError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<PosItem | null>(null)
  const [editItemForm, setEditItemForm] = useState(EMPTY_ITEM_FORM)
  const [editItemError, setEditItemError] = useState<string | null>(null)

  async function refresh() {
    const [allItems, allSales] = await Promise.all([api.posItems.list(), api.posSales.list()])
    setItems(allItems)
    setSales(allSales)
  }

  useEffect(() => {
    Promise.all([refresh(), api.students.list().then((list) => setStudents(list.filter((s) => s.active)))]).finally(() =>
      setLoading(false),
    )
  }, [])

  function addToCart(item: PosItem) {
    setCart((lines) => {
      const existing = lines.find((l) => l.item.id === item.id)
      if (existing) {
        return lines.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...lines, { item, quantity: 1 }]
    })
  }

  function adjustQuantity(itemId: string, delta: number) {
    setCart((lines) =>
      lines
        .map((l) => (l.item.id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  function removeFromCart(itemId: string) {
    setCart((lines) => lines.filter((l) => l.item.id !== itemId))
  }

  const cartTotalCents = cart.reduce((sum, l) => sum + l.quantity * l.item.priceCents, 0)

  async function handleCompleteSale() {
    if (submitting) return
    setCheckoutError(null)
    if (cart.length === 0) {
      setCheckoutError('Add at least one item to the cart.')
      return
    }
    const student = students.find((s) => s.id === selectedStudentId)
    setSubmitting(true)
    try {
      await api.posSales.create({
        studentName: student ? `${student.firstName} ${student.lastName}` : null,
        paymentMethod: paymentMethod || null,
        notes: notes.trim() || null,
        items: cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
      })
      toast.success(`Sale completed — ${formatCents(cartTotalCents)}.`)
      setCart([])
      setSelectedStudentId(WALK_IN)
      setPaymentMethod('')
      setNotes('')
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteSale(sale: PosSale) {
    const confirmed = window.confirm(`Delete this ${formatCents(sale.totalCents)} sale? This cannot be undone.`)
    if (!confirmed) return
    await api.posSales.delete(sale.id)
    toast.success('Sale deleted.')
    await refresh()
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    setItemFormError(null)
    if (!itemForm.name.trim()) {
      setItemFormError('Name is required.')
      return
    }
    // A blank price must not quietly become $0.00 — see parsePriceToCents.
    const priceCents = parsePriceToCents(itemForm.price)
    if (priceCents === null) {
      setItemFormError('Enter a price of 0 or more.')
      return
    }
    try {
      await api.posItems.create({ name: itemForm.name.trim(), priceCents })
      toast.success(`${itemForm.name.trim()} added.`)
      setItemForm(EMPTY_ITEM_FORM)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function openEditItem(item: PosItem) {
    setEditingItem(item)
    setEditItemForm({ name: item.name, price: (item.priceCents / 100).toFixed(2) })
    setEditItemError(null)
  }

  async function handleSaveEditItem(e: React.FormEvent) {
    e.preventDefault()
    if (!editingItem) return
    setEditItemError(null)
    if (!editItemForm.name.trim()) {
      setEditItemError('Name is required.')
      return
    }
    const priceCents = parsePriceToCents(editItemForm.price)
    if (priceCents === null) {
      setEditItemError('Enter a price of 0 or more.')
      return
    }
    try {
      await api.posItems.update(editingItem.id, {
        name: editItemForm.name.trim(),
        priceCents,
      })
      toast.success('Changes saved.')
      setEditingItem(null)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDeleteItem(item: PosItem) {
    const confirmed = window.confirm(`Delete ${item.name}? This cannot be undone.`)
    if (!confirmed) return
    const { archived } = await api.posItems.delete(item.id)
    if (archived) {
      toast.info(`${item.name} has been sold before, so it was archived instead of deleted.`)
    } else {
      toast.success(`${item.name} deleted.`)
    }
    await refresh()
  }

  async function handleReactivateItem(item: PosItem) {
    await api.posItems.update(item.id, { active: true })
    toast.success(`${item.name} reactivated.`)
    await refresh()
  }

  const visibleCatalogItems = items.filter(
    (i) => i.active && i.name.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const manageableItems = items.filter((i) => showArchivedItems || i.active)

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">POS</h2>
        <Button variant="outline" onClick={() => setManageOpen(true)}>Manage Items</Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            className="mb-3 w-64"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleCatalogItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">{formatCents(item.priceCents)}</p>
              </button>
            ))}
            {visibleCatalogItems.length === 0 && (
              <p className="col-span-full text-sm italic text-muted-foreground">
                {search.trim() ? 'No items match your search.' : 'No items yet — add one with "Manage Items".'}
              </p>
            )}
          </div>
        </div>

        <div className="w-80 shrink-0 rounded-lg border border-border bg-card p-3">
          <p className="mb-2 font-medium">Cart</p>
          {cart.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Cart is empty — click an item to add it.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((line) => (
                <div key={line.item.id} className="flex items-center gap-2">
                  <div className="flex-1 truncate text-sm">{line.item.name}</div>
                  <Button variant="outline" size="icon-xs" onClick={() => adjustQuantity(line.item.id, -1)}>
                    <Minus />
                  </Button>
                  <span className="w-5 text-center text-sm">{line.quantity}</span>
                  <Button variant="outline" size="icon-xs" onClick={() => adjustQuantity(line.item.id, 1)}>
                    <Plus />
                  </Button>
                  <span className="w-16 text-right text-sm">{formatCents(line.quantity * line.item.priceCents)}</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => removeFromCart(line.item.id)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <div>
              <Label className="mb-1">Student</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WALK_IN}>Walk-in (no student)</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="font-medium">Total</span>
            <span className="font-medium">{formatCents(cartTotalCents)}</span>
          </div>
          {checkoutError && <p className="mt-2 text-sm text-destructive">{checkoutError}</p>}
          <Button className="mt-3 w-full" onClick={handleCompleteSale} disabled={cart.length === 0 || submitting}>
            Complete Sale
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 font-medium">Recent Sales</p>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Date</TableHead>
              <TableHead className="w-32">Student</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="w-20">Total</TableHead>
              <TableHead className="w-24">Payment</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              showSkeleton ? <TableSkeletonRows columns={6} /> : null
            ) : (
              <>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{new Date(sale.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="truncate">{sale.studentName ?? 'Walk-in'}</TableCell>
                    <TableCell className="truncate">{summarizeItems(sale)}</TableCell>
                    <TableCell>{formatCents(sale.totalCents)}</TableCell>
                    <TableCell className="truncate">
                      {sale.paymentMethod ? PAYMENT_METHOD_LABEL[sale.paymentMethod as PaymentMethod] ?? sale.paymentMethod : '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteSale(sale)}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center italic text-muted-foreground">No sales yet.</TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Items</DialogTitle>
          </DialogHeader>
          <form className="flex flex-wrap items-end gap-2" onSubmit={handleAddItem}>
            <div className="flex-1">
              <Label className="mb-1">Name</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="w-28">
              <Label className="mb-1">Price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <Button type="submit">Add Item</Button>
          </form>
          {itemFormError && <p className="text-sm text-destructive">{itemFormError}</p>}

          <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={showArchivedItems} onCheckedChange={(checked) => setShowArchivedItems(checked === true)} />
            Show archived
          </label>

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Price</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {manageableItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="truncate">
                      {item.name}
                      {!item.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                    </TableCell>
                    <TableCell>{formatCents(item.priceCents)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon-sm">
                            <MoreHorizontal />
                            <span className="sr-only">More actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEditItem(item)}>
                            <Pencil />Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {item.active ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => handleDeleteItem(item)}>
                              <Trash2 />Delete
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => handleReactivateItem(item)}>
                              <RotateCcw />Reactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {manageableItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center italic text-muted-foreground">No items yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingItem !== null} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={handleSaveEditItem}>
            <div>
              <Label className="mb-1">Name</Label>
              <Input
                value={editItemForm.name}
                onChange={(e) => setEditItemForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1">Price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editItemForm.price}
                onChange={(e) => setEditItemForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            {editItemError && <p className="text-sm text-destructive">{editItemError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
