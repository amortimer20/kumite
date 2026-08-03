import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import type { MembershipPayment, MembershipPaymentWithPlan, MembershipPlan, PaymentMethod, Student, StudentMembership } from '../../shared/types'
import { PAYMENT_METHODS } from '../../shared/types'
import {
  FREQUENCY_LABEL,
  MEMBERSHIP_STATUS_COLOR,
  MEMBERSHIP_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  dollarsToCents,
  formatCents,
} from '@/lib/membershipFormat'
import { isoDateToInstant, todayIso } from '@/lib/isoDate'
import { getErrorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const EMPTY_ASSIGN_FORM = { planId: '', priceOverride: '', startDate: todayIso() }
const EMPTY_PAYMENT_FORM = { amount: '', paidOn: todayIso(), method: '' as PaymentMethod | '', notes: '' }
const EMPTY_ADJUSTMENT_FORM = { delta: '1', reason: '' }

export function StudentMembershipDialog({
  student,
  onOpenChange,
}: {
  student: Student | null
  onOpenChange: (open: boolean) => void
}) {
  const [membership, setMembership] = useState<StudentMembership | null>(null)
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [paymentHistory, setPaymentHistory] = useState<MembershipPaymentWithPlan[]>([])
  const [loading, setLoading] = useState(true)

  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN_FORM)
  const [assignError, setAssignError] = useState<string | null>(null)
  // Guards against a fast double-click firing two assign requests before
  // either resolves — the server also closes this race with a transaction,
  // but disabling the button avoids relying on that as the only defense.
  const [assigning, setAssigning] = useState(false)

  const [changePlanForm, setChangePlanForm] = useState({ planId: '', priceOverride: '' })
  const [changePlanKey, setChangePlanKey] = useState(0)

  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [adjustmentForm, setAdjustmentForm] = useState(EMPTY_ADJUSTMENT_FORM)
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)

  async function refresh(studentId: string) {
    const [m, history] = await Promise.all([
      api.studentMemberships.getForStudent(studentId),
      api.studentMemberships.getPaymentHistory(studentId),
    ])
    setPaymentHistory(history)
    setMembership(m)
    if (m) {
      setChangePlanForm({
        planId: m.planId,
        priceOverride: m.priceOverrideCents != null ? (m.priceOverrideCents / 100).toFixed(2) : '',
      })
      setChangePlanKey((k) => k + 1)
      // Defaults to whatever's actually owed, so recording the payment they
      // just handed over doesn't require re-typing the plan price — but
      // still defaults to a full period if nothing's currently owed (e.g.
      // paying the next cycle ahead of time).
      const defaultAmountCents = m.amountOwedCents > 0 ? m.amountOwedCents : m.effectivePriceCents
      setPaymentForm({
        amount: (defaultAmountCents / 100).toFixed(2),
        paidOn: todayIso(),
        method: '',
        notes: '',
      })
    }
    return m
  }

  useEffect(() => {
    if (!student) return
    setLoading(true)
    setAssignForm(EMPTY_ASSIGN_FORM)
    setAssignError(null)
    setPaymentError(null)
    setAdjustmentForm(EMPTY_ADJUSTMENT_FORM)
    setAdjustmentError(null)
    Promise.all([refresh(student.id), api.membershipPlans.list()])
      .then(([, allPlans]) => setPlans(allPlans.filter((p) => p.active)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id])

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!student || assigning) return
    setAssignError(null)
    if (!assignForm.planId) {
      setAssignError('Choose a plan.')
      return
    }
    setAssigning(true)
    try {
      await api.studentMemberships.assign(student.id, {
        planId: assignForm.planId,
        priceOverrideCents: assignForm.priceOverride.trim() ? dollarsToCents(assignForm.priceOverride) : null,
        startDate: isoDateToInstant(assignForm.startDate),
      })
      toast.success('Membership assigned.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAssigning(false)
    }
  }

  async function handleChangePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student) return
    try {
      await api.studentMemberships.update(membership.id, {
        planId: changePlanForm.planId,
        priceOverrideCents: changePlanForm.priceOverride.trim() ? dollarsToCents(changePlanForm.priceOverride) : null,
      })
      toast.success('Plan updated.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student) return
    setPaymentError(null)
    if (!paymentForm.amount || !paymentForm.paidOn) {
      setPaymentError('Amount and paid-on date are required.')
      return
    }
    if (dollarsToCents(paymentForm.amount) <= 0) {
      setPaymentError('Amount must be greater than zero.')
      return
    }
    try {
      await api.studentMemberships.recordPayment(membership.id, {
        amountCents: dollarsToCents(paymentForm.amount),
        method: paymentForm.method || null,
        paidOn: isoDateToInstant(paymentForm.paidOn),
        notes: paymentForm.notes.trim() || null,
      })
      toast.success('Payment recorded.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDeletePayment(payment: MembershipPayment) {
    if (!student) return
    const confirmed = window.confirm(`Delete this ${formatCents(payment.amountCents)} payment? This cannot be undone.`)
    if (!confirmed) return
    await api.studentMemberships.deletePayment(payment.id)
    toast.success('Payment deleted.')
    await refresh(student.id)
  }

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student) return
    setAdjustmentError(null)
    const delta = Number.parseInt(adjustmentForm.delta, 10)
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustmentError('Enter a non-zero number (e.g. 1 for a bonus lesson, -1 to undo one).')
      return
    }
    try {
      await api.studentMemberships.addUsageAdjustment(membership.id, {
        delta,
        reason: adjustmentForm.reason.trim() || null,
      })
      toast.success('Adjustment added.')
      setAdjustmentForm(EMPTY_ADJUSTMENT_FORM)
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleCancelMembership() {
    if (!membership || !student) return
    const confirmed = window.confirm(
      `Cancel ${student.firstName}'s membership? They'll need to be assigned a new one to resume billing.`,
    )
    if (!confirmed) return
    await api.studentMemberships.cancel(membership.id)
    toast.success('Membership cancelled.')
    await refresh(student.id)
  }

  // The picker only lists active plans, but a student can be on one that's
  // since been archived (e.g. discontinued while they were still enrolled) —
  // without this, the Select can't display their own current plan as
  // selected at all, since it wouldn't be among the rendered options.
  const changePlanOptions =
    membership && !plans.some((p) => p.id === membership.planId) ? [...plans, membership.plan] : plans

  return (
    <Dialog open={student !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{student?.firstName} {student?.lastName}&rsquo;s Membership</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm italic text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-5">
            {!membership ? (
              <form className="flex flex-col gap-3" onSubmit={handleAssign}>
                <p className="text-sm text-muted-foreground">This student doesn&rsquo;t have a membership yet.</p>
                <div>
                  <Label className="mb-1">Plan</Label>
                  <Select value={assignForm.planId} onValueChange={(v) => setAssignForm((f) => ({ ...f, planId: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={plans.length === 0 ? 'No plans yet — add one in Settings' : 'Choose a plan'} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title} ({formatCents(p.priceCents)}/{FREQUENCY_LABEL[p.billingFrequency].toLowerCase()})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="mb-1">Price override (optional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Leave blank to use the plan's price"
                      value={assignForm.priceOverride}
                      onChange={(e) => setAssignForm((f) => ({ ...f, priceOverride: e.target.value }))}
                    />
                  </div>
                  <div className="w-40">
                    <Label className="mb-1">Start date</Label>
                    <Input
                      type="date"
                      value={assignForm.startDate}
                      onChange={(e) => setAssignForm((f) => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                </div>
                {assignError && <p className="text-sm text-destructive">{assignError}</p>}
                <div className="flex justify-end">
                  <Button type="submit" disabled={plans.length === 0 || assigning}>Assign Membership</Button>
                </div>
              </form>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{membership.plan.title}</span>
                    <div className="text-right">
                      <span className={`text-sm font-medium ${MEMBERSHIP_STATUS_COLOR[membership.status]}`}>{MEMBERSHIP_STATUS_LABEL[membership.status]}</span>
                      {membership.amountOwedCents > 0 && (
                        <p className={`text-xs ${MEMBERSHIP_STATUS_COLOR[membership.status]}`}>{formatCents(membership.amountOwedCents)} owed</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatCents(membership.effectivePriceCents)} / {FREQUENCY_LABEL[membership.plan.billingFrequency].toLowerCase()}
                    {membership.priceOverrideCents != null && ' (custom price)'}
                    {' — next due '}
                    {new Date(membership.nextDueDate).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Private lessons this period: {Math.max(0, membership.privateLessonsUsed)} used
                    {(membership.plan.includedPrivateLessons > 0 || membership.privateLessonsUsed > 0) && (
                      <> of {membership.plan.includedPrivateLessons} ({membership.privateLessonsRemaining < 0
                        ? `${-membership.privateLessonsRemaining} over`
                        : `${membership.privateLessonsRemaining} remaining`})</>
                    )}
                  </p>
                </div>

                <form className="flex items-end gap-2 border-t border-border pt-3" onSubmit={handleChangePlan}>
                  <div className="flex-1">
                    <Label className="mb-1">Change plan</Label>
                    <Select
                      key={changePlanKey}
                      value={changePlanForm.planId}
                      onValueChange={(v) => setChangePlanForm((f) => ({ ...f, planId: v }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {changePlanOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title}{!p.active ? ' (archived)' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Label className="mb-1">Price override</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Plan price"
                      value={changePlanForm.priceOverride}
                      onChange={(e) => setChangePlanForm((f) => ({ ...f, priceOverride: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" variant="outline">Save</Button>
                </form>

                <form className="flex flex-col gap-2 border-t border-border pt-3" onSubmit={handleRecordPayment}>
                  <Label>Record a payment</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-28"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <Input
                      className="w-40"
                      type="date"
                      title="Paid on"
                      value={paymentForm.paidOn}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, paidOn: e.target.value }))}
                    />
                    <Select
                      value={paymentForm.method}
                      onValueChange={(v) => setPaymentForm((f) => ({ ...f, method: v as PaymentMethod }))}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Method (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-48"
                      placeholder="Notes (optional)"
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                    <Button type="submit">Record Payment</Button>
                  </div>
                  {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
                </form>
              </>
            )}

            <div className="border-t border-border pt-3">
              <Label className="mb-2">Payment history</Label>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Paid</TableHead>
                      <TableHead className="w-20">Amount</TableHead>
                      <TableHead className="w-32">Plan</TableHead>
                      <TableHead className="w-28">Method</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center italic text-muted-foreground">No payments recorded yet.</TableCell>
                      </TableRow>
                    ) : (
                      paymentHistory.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{new Date(payment.paidOn).toLocaleDateString()}</TableCell>
                          <TableCell>{formatCents(payment.amountCents)}</TableCell>
                          <TableCell className="truncate">{payment.planTitle}</TableCell>
                          <TableCell className="truncate">{payment.method ?? '—'}</TableCell>
                          <TableCell className="truncate">{payment.notes ?? '—'}</TableCell>
                          <TableCell>
                            <Button variant="destructive" size="sm" onClick={() => handleDeletePayment(payment)}><Trash2 />Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {membership && (
              <>
                <form className="flex items-end gap-2 border-t border-border pt-3" onSubmit={handleAddAdjustment}>
                  <div className="w-24">
                    <Label className="mb-1">+/- lessons</Label>
                    <Input
                      type="number"
                      value={adjustmentForm.delta}
                      onChange={(e) => setAdjustmentForm((f) => ({ ...f, delta: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="mb-1">Reason (optional)</Label>
                    <Input
                      placeholder="e.g. bonus lesson, our scheduling error"
                      value={adjustmentForm.reason}
                      onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" variant="outline">Add</Button>
                </form>
                {adjustmentError && <p className="text-sm text-destructive">{adjustmentError}</p>}
              </>
            )}

            <DialogFooter className="border-t border-border pt-3">
              {membership && (
                <Button type="button" variant="destructive" onClick={handleCancelMembership}>Cancel Membership</Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
