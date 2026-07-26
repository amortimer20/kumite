import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import { MEMBERSHIP_BILLING_FREQUENCIES } from '../../shared/types'
import type { BusinessHours, MembershipBillingFrequency, MembershipPlan } from '../../shared/types'
import { TableSkeletonRows } from './TableSkeletonRows'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { getErrorMessage } from '@/lib/errors'
import { FREQUENCY_LABEL, clampNonNegativeInt, dollarsToCents, formatCents } from '@/lib/membershipFormat'
import { Switch } from '@/components/ui/switch'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const EMPTY_PLAN_FORM = { title: '', billingFrequency: 'monthly' as MembershipBillingFrequency, price: '', includedPrivateLessons: '0' }

export function SettingsPanel() {
  const [hours, setHours] = useState<BusinessHours[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)
  const [restoring, setRestoring] = useState(false)

  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const showPlansSkeleton = useDelayedFlag(plansLoading)
  const [showArchivedPlans, setShowArchivedPlans] = useState(false)
  const [addPlanForm, setAddPlanForm] = useState(EMPTY_PLAN_FORM)
  const [addPlanFormKey, setAddPlanFormKey] = useState(0)
  const [addPlanError, setAddPlanError] = useState<string | null>(null)

  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null)
  const [editPlanForm, setEditPlanForm] = useState(EMPTY_PLAN_FORM)
  const [editPlanError, setEditPlanError] = useState<string | null>(null)

  useEffect(() => {
    api.businessHours.list().then(setHours).finally(() => setLoading(false))
  }, [])

  async function refreshPlans() {
    setPlans(await api.membershipPlans.list())
  }

  useEffect(() => {
    refreshPlans().finally(() => setPlansLoading(false))
  }, [])

  async function handleAddPlan(e: React.FormEvent) {
    e.preventDefault()
    setAddPlanError(null)
    if (!addPlanForm.title.trim()) {
      setAddPlanError('Title is required.')
      return
    }
    if (dollarsToCents(addPlanForm.price) < 0) {
      setAddPlanError('Price cannot be negative.')
      return
    }
    try {
      await api.membershipPlans.create({
        title: addPlanForm.title.trim(),
        billingFrequency: addPlanForm.billingFrequency,
        priceCents: dollarsToCents(addPlanForm.price),
        includedPrivateLessons: clampNonNegativeInt(addPlanForm.includedPrivateLessons),
      })
      toast.success(`${addPlanForm.title.trim()} added.`)
      setAddPlanForm(EMPTY_PLAN_FORM)
      setAddPlanFormKey((k) => k + 1)
      await refreshPlans()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDeletePlan(plan: MembershipPlan) {
    const confirmed = window.confirm(`Delete ${plan.title}? This cannot be undone.`)
    if (!confirmed) return

    const { archived } = await api.membershipPlans.delete(plan.id)
    if (archived) {
      toast.info(`${plan.title} has students on it, so it was archived instead of deleted.`)
    } else {
      toast.success(`${plan.title} deleted.`)
    }
    await refreshPlans()
  }

  async function handleReactivatePlan(plan: MembershipPlan) {
    await api.membershipPlans.update(plan.id, { active: true })
    toast.success(`${plan.title} reactivated.`)
    await refreshPlans()
  }

  function openEditPlan(plan: MembershipPlan) {
    setEditingPlan(plan)
    setEditPlanForm({
      title: plan.title,
      billingFrequency: plan.billingFrequency,
      price: (plan.priceCents / 100).toFixed(2),
      includedPrivateLessons: String(plan.includedPrivateLessons),
    })
    setEditPlanError(null)
  }

  async function handleSaveEditPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPlan) return
    setEditPlanError(null)
    if (!editPlanForm.title.trim()) {
      setEditPlanError('Title is required.')
      return
    }
    if (dollarsToCents(editPlanForm.price) < 0) {
      setEditPlanError('Price cannot be negative.')
      return
    }
    try {
      await api.membershipPlans.update(editingPlan.id, {
        title: editPlanForm.title.trim(),
        billingFrequency: editPlanForm.billingFrequency,
        priceCents: dollarsToCents(editPlanForm.price),
        includedPrivateLessons: clampNonNegativeInt(editPlanForm.includedPrivateLessons),
      })
      toast.success('Changes saved.')
      setEditingPlan(null)
      await refreshPlans()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleChange(dayOfWeek: number, patch: Partial<BusinessHours>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)))
    const updated = await api.businessHours.update(dayOfWeek, patch)
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? updated : h)))
  }

  async function handleBackup() {
    const result = await api.backup.create()
    if (!result.canceled) {
      toast.success(`Backup saved to ${result.path}`)
    }
  }

  async function handleRestore() {
    const confirmed = window.confirm(
      'Restoring will replace all current data with the contents of the backup file, and the app will restart. This cannot be undone. Continue?',
    )
    if (!confirmed) return

    setRestoring(true)
    const result = await api.backup.restore()
    if (result.canceled) {
      setRestoring(false)
    }
    // Otherwise the app is relaunching now; leave the UI in its "restoring" state.
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Business Hours</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Used on the Schedule tab to show open slots between lessons for each day.
      </p>
      <div className="flex flex-col gap-3">
        {loading
          ? showSkeleton
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-border pb-3 last:border-0">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              ))
            : null
          : hours.map((h) => (
              <div key={h.dayOfWeek} className="flex items-center gap-4 border-b border-border pb-3 last:border-0">
                <span className="w-28 shrink-0 font-medium">{DAY_LABEL[h.dayOfWeek]}</span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!h.isClosed}
                    onCheckedChange={(checked) => handleChange(h.dayOfWeek, { isClosed: !checked })}
                  />
                  <Label className="text-muted-foreground">{h.isClosed ? 'Closed' : 'Open'}</Label>
                </div>
                {!h.isClosed && (
                  <>
                    <Input
                      type="time"
                      className="w-auto"
                      value={h.openTime}
                      onChange={(e) => handleChange(h.dayOfWeek, { openTime: e.target.value })}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      className="w-auto"
                      value={h.closeTime}
                      onChange={(e) => handleChange(h.dayOfWeek, { closeTime: e.target.value })}
                    />
                  </>
                )}
              </div>
            ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Membership Plans</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Billing plans students can be assigned to (e.g. "2 Private, Unlimited Group"). The title is
        descriptive — the app only tracks the private-lesson allowance, not group class attendance.
      </p>
      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleAddPlan}>
        <Input
          className="w-56"
          placeholder="Title"
          value={addPlanForm.title}
          onChange={(e) => setAddPlanForm((f) => ({ ...f, title: e.target.value }))}
        />
        <Select
          key={addPlanFormKey}
          value={addPlanForm.billingFrequency}
          onValueChange={(v) => setAddPlanForm((f) => ({ ...f, billingFrequency: v as MembershipBillingFrequency }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBERSHIP_BILLING_FREQUENCIES.map((freq) => (
              <SelectItem key={freq} value={freq}>{FREQUENCY_LABEL[freq]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-28"
          type="number"
          step="0.01"
          min="0"
          placeholder="Price"
          value={addPlanForm.price}
          onChange={(e) => setAddPlanForm((f) => ({ ...f, price: e.target.value }))}
        />
        <Input
          className="w-24"
          type="number"
          min="0"
          placeholder="# Privates"
          value={addPlanForm.includedPrivateLessons}
          onChange={(e) => setAddPlanForm((f) => ({ ...f, includedPrivateLessons: e.target.value }))}
        />
        <Button type="submit">Add Plan</Button>
      </form>
      {addPlanError && <p className="mb-4 text-sm text-destructive">{addPlanError}</p>}
      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showArchivedPlans} onCheckedChange={(checked) => setShowArchivedPlans(checked === true)} />
        Show archived
      </label>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-36">Frequency</TableHead>
            <TableHead className="w-28">Price</TableHead>
            <TableHead className="w-28">Privates</TableHead>
            <TableHead className="w-24">Students</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {plansLoading ? (
            showPlansSkeleton ? <TableSkeletonRows columns={6} /> : null
          ) : (
            <>
              {plans
                .filter((p) => showArchivedPlans || p.active)
                .map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="truncate">
                      {p.title}
                      {!p.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                    </TableCell>
                    <TableCell>{FREQUENCY_LABEL[p.billingFrequency]}</TableCell>
                    <TableCell>{formatCents(p.priceCents)}</TableCell>
                    <TableCell>{p.includedPrivateLessons}</TableCell>
                    <TableCell>{p.studentCount}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditPlan(p)}>Edit</Button>
                      {p.active ? (
                        <Button variant="destructive" size="sm" onClick={() => handleDeletePlan(p)}><Trash2 />Delete</Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleReactivatePlan(p)}>Reactivate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              {plans.filter((p) => showArchivedPlans || p.active).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center italic text-muted-foreground">No membership plans yet.</TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Backup & Restore</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Export a backup file to keep a copy of your data — for example in a synced folder like
        OneDrive or Dropbox. Restoring loads a backup file back in, replacing all current data.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleBackup} disabled={restoring}>
          Export Backup
        </Button>
        <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
          Restore from Backup
        </Button>
      </div>
      {restoring && <p className="mt-3 text-sm text-muted-foreground">Restoring backup, the app will restart…</p>}

      <Dialog open={editingPlan !== null} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Membership Plan</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={handleSaveEditPlan}>
            <div>
              <Label className="mb-1">Title</Label>
              <Input
                value={editPlanForm.title}
                onChange={(e) => setEditPlanForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">Billing frequency</Label>
                <Select
                  value={editPlanForm.billingFrequency}
                  onValueChange={(v) => setEditPlanForm((f) => ({ ...f, billingFrequency: v as MembershipBillingFrequency }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBERSHIP_BILLING_FREQUENCIES.map((freq) => (
                      <SelectItem key={freq} value={freq}>{FREQUENCY_LABEL[freq]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <Label className="mb-1">Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPlanForm.price}
                  onChange={(e) => setEditPlanForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="w-28">
                <Label className="mb-1"># Privates</Label>
                <Input
                  type="number"
                  min="0"
                  value={editPlanForm.includedPrivateLessons}
                  onChange={(e) => setEditPlanForm((f) => ({ ...f, includedPrivateLessons: e.target.value }))}
                />
              </div>
            </div>

            {editPlanError && <p className="text-sm text-destructive">{editPlanError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
