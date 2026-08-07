import { useEffect, useRef, useState } from 'react'
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
  formatCents,
  parsePriceToCents,
  suggestProratedChargeCents,
} from '@/lib/membershipFormat'
import { isFirstOfMonthIso, isoDateToInstant, startOfNextMonthIso, todayIso } from '@/lib/isoDate'
import {
  DEFAULT_PAYMENT_HISTORY_RANGE,
  PAYMENT_HISTORY_RANGES,
  PAYMENT_HISTORY_RANGE_LABEL,
  filterPaymentsByRange,
} from '@/lib/paymentHistoryFilter'
import { getErrorMessage } from '@/lib/errors'
import { LoadErrorBanner } from './LoadErrorBanner'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// A function rather than a module-level constant — todayIso() evaluated once
// at module load would go stale on a front-desk machine left running for
// days, and would always be wrong for a mid-month proration suggestion.
function emptyAssignForm() {
  return { planId: '', priceOverride: '', startDate: todayIso(), prorate: false, prorationAmount: '' }
}
const EMPTY_PAYMENT_FORM = { amount: '', paidOn: todayIso(), method: '' as PaymentMethod | '', notes: '' }
const EMPTY_ADJUSTMENT_FORM = { delta: '1', reason: '' }
function emptyExtraLessonForm() {
  return { price: '', lessonCount: '1', paidOn: todayIso(), method: '' as PaymentMethod | '', notes: '' }
}

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
  const [historyRange, setHistoryRange] = useState(DEFAULT_PAYMENT_HISTORY_RANGE)
  const [loading, setLoading] = useState(true)
  // An uncaught load failure used to leave `membership` at its cleared-on-open
  // null and render the "doesn't have a membership yet" assign form — a
  // confident lie when the real state is just "failed to load."
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped on every refresh so a slow response for a student who is no longer
  // on screen is dropped rather than applied. Without it, switching from a
  // student with a long payment history to another lands the first student's
  // membership under the second's name — and because the payment form reads
  // `membership.id`, a payment then posts to the wrong student's membership.
  const requestIdRef = useRef(0)

  const [assignForm, setAssignForm] = useState(emptyAssignForm)
  const [assignError, setAssignError] = useState<string | null>(null)
  // Guards against a fast double-click firing two assign requests before
  // either resolves — the server also closes this race with a transaction,
  // but disabling the button avoids relying on that as the only defense.
  const [assigning, setAssigning] = useState(false)

  const [changePlanForm, setChangePlanForm] = useState({ planId: '', priceOverride: '' })
  const [changePlanKey, setChangePlanKey] = useState(0)
  const [changingPlan, setChangingPlan] = useState(false)

  // Guards against a double-clicked submit creating two records. The backend
  // has no dedup for payments, adjustments, or extra-lesson charges, so a
  // second click while the first is in flight genuinely posts twice.
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [addingAdjustment, setAddingAdjustment] = useState(false)
  const [chargingExtraLesson, setChargingExtraLesson] = useState(false)

  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [adjustmentForm, setAdjustmentForm] = useState(EMPTY_ADJUSTMENT_FORM)
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)

  const [extraLessonForm, setExtraLessonForm] = useState(emptyExtraLessonForm)
  const [extraLessonError, setExtraLessonError] = useState<string | null>(null)

  async function refresh(studentId: string) {
    const requestId = ++requestIdRef.current
    const [m, history] = await Promise.all([
      api.studentMemberships.getForStudent(studentId),
      api.studentMemberships.getPaymentHistory(studentId),
    ])
    // A newer refresh (the student switched, or another mutation fired one)
    // has superseded this one — drop it so it can't render stale figures.
    if (requestId !== requestIdRef.current) return m
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
      // Pre-fills a sanity reference rather than making staff retype the same
      // amount from memory — deliberately not a plan-level default rate,
      // since the studio has no fixed price for an extra lesson.
      setExtraLessonForm((f) => ({
        ...f,
        price: m.lastExtraLessonPriceCents != null ? (m.lastExtraLessonPriceCents / 100).toFixed(2) : '',
      }))
    }
    return m
  }

  function load(s: Student) {
    setLoading(true)
    setLoadError(null)
    // Clear the previous student's figures immediately so a failed or slow
    // load can never leave them showing under the newly-opened student's name.
    setMembership(null)
    setPaymentHistory([])
    setAssignForm(emptyAssignForm())
    setAssignError(null)
    setPaymentError(null)
    setAdjustmentForm(EMPTY_ADJUSTMENT_FORM)
    setAdjustmentError(null)
    setExtraLessonForm(emptyExtraLessonForm())
    setExtraLessonError(null)
    setHistoryRange(DEFAULT_PAYMENT_HISTORY_RANGE)
    // refresh() bumps requestIdRef synchronously, so reading it right after
    // captures this load's id for guarding the plans/loading updates too.
    const loadPromise = Promise.all([refresh(s.id), api.membershipPlans.list()])
    const requestId = requestIdRef.current
    loadPromise
      .then(([, allPlans]) => {
        if (requestId !== requestIdRef.current) return
        setPlans(allPlans.filter((p) => p.active))
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        setLoadError(getErrorMessage(err))
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }

  useEffect(() => {
    if (!student) return
    load(student)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id])

  // Suggests proration for a mid-month sign-up on a monthly plan, matching
  // the studio's "billed on the 1st" norm — defaults to prorating rather than
  // requiring staff to opt in, since that's meant to be the normal case.
  // Resets only when the plan or date actually changes, so editing the
  // suggested amount (or the price override) afterward isn't clobbered by
  // this effect re-running.
  useEffect(() => {
    const plan = plans.find((p) => p.id === assignForm.planId)
    const shouldProrate = plan?.billingFrequency === 'monthly' && !!assignForm.startDate && !isFirstOfMonthIso(assignForm.startDate)
    if (!shouldProrate) {
      setAssignForm((f) => (f.prorate ? { ...f, prorate: false } : f))
      return
    }
    setAssignForm((f) => {
      const priceCents = parsePriceToCents(f.priceOverride) ?? plan.priceCents
      return { ...f, prorate: true, prorationAmount: (suggestProratedChargeCents(priceCents, f.startDate) / 100).toFixed(2) }
    })
  }, [assignForm.planId, assignForm.startDate, plans])

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!student || assigning) return
    setAssignError(null)
    if (!assignForm.planId) {
      setAssignError('Choose a plan.')
      return
    }
    if (!assignForm.startDate) {
      setAssignError('Choose a start date.')
      return
    }
    // Blank legitimately means "use the plan's price". Anything typed, though,
    // has to parse — otherwise dollarsToCents turned it into a $0.00 override,
    // silently making the membership free.
    const priceOverrideCents = assignForm.priceOverride.trim() ? parsePriceToCents(assignForm.priceOverride) : null
    if (assignForm.priceOverride.trim() && priceOverrideCents === null) {
      setAssignError('Enter a valid custom price, or leave it blank to use the plan price.')
      return
    }
    // assignForm.prorate can only be true while the proration block above is
    // actually rendered (see showProration), so it's already a reliable
    // signal here without recomputing the mid-month check.
    let prorationStubCents: number | null = null
    let effectiveStartDate = assignForm.startDate
    if (assignForm.prorate) {
      prorationStubCents = parsePriceToCents(assignForm.prorationAmount)
      if (prorationStubCents === null || prorationStubCents <= 0) {
        setAssignError('Enter a valid prorated amount greater than zero, or uncheck proration.')
        return
      }
      // The agreed stub covers through the end of this month; billing proper
      // starts on the 1st of the next one — see suggestProratedChargeCents.
      effectiveStartDate = startOfNextMonthIso(assignForm.startDate)
    }
    setAssigning(true)
    try {
      await api.studentMemberships.assign(student.id, {
        planId: assignForm.planId,
        priceOverrideCents,
        startDate: isoDateToInstant(effectiveStartDate),
        prorationStubCents,
      })
      toast.success('Membership assigned.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAssigning(false)
    }
  }

  async function handleChargeExtraLesson(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student || chargingExtraLesson) return
    setExtraLessonError(null)
    const priceCents = parsePriceToCents(extraLessonForm.price)
    if (priceCents === null || priceCents <= 0) {
      setExtraLessonError('Enter a price greater than zero.')
      return
    }
    const lessonCount = Number.parseInt(extraLessonForm.lessonCount, 10)
    if (!Number.isInteger(lessonCount) || lessonCount <= 0) {
      setExtraLessonError('Enter how many extra lessons this covers (at least 1).')
      return
    }
    if (!extraLessonForm.paidOn) {
      setExtraLessonError('Choose a paid-on date.')
      return
    }
    setChargingExtraLesson(true)
    try {
      await api.studentMemberships.chargeExtraLesson(membership.id, {
        priceCents,
        lessonCount,
        method: extraLessonForm.method || null,
        paidOn: isoDateToInstant(extraLessonForm.paidOn),
        notes: extraLessonForm.notes.trim() || null,
      })
      toast.success('Extra lesson charged.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setChargingExtraLesson(false)
    }
  }

  async function handleChangePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student || changingPlan) return
    const priceOverrideCents = changePlanForm.priceOverride.trim()
      ? parsePriceToCents(changePlanForm.priceOverride)
      : null
    if (changePlanForm.priceOverride.trim() && priceOverrideCents === null) {
      toast.error('Enter a valid custom price, or leave it blank to use the plan price.')
      return
    }
    setChangingPlan(true)
    try {
      await api.studentMemberships.update(membership.id, {
        planId: changePlanForm.planId,
        priceOverrideCents,
      })
      toast.success('Plan updated.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setChangingPlan(false)
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student || recordingPayment) return
    setPaymentError(null)
    if (!paymentForm.amount || !paymentForm.paidOn) {
      setPaymentError('Amount and paid-on date are required.')
      return
    }
    const amountCents = parsePriceToCents(paymentForm.amount)
    if (amountCents === null || amountCents <= 0) {
      setPaymentError('Amount must be greater than zero.')
      return
    }
    setRecordingPayment(true)
    try {
      await api.studentMemberships.recordPayment(membership.id, {
        amountCents,
        method: paymentForm.method || null,
        paidOn: isoDateToInstant(paymentForm.paidOn),
        notes: paymentForm.notes.trim() || null,
      })
      toast.success('Payment recorded.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRecordingPayment(false)
    }
  }

  async function handleDeletePayment(payment: MembershipPayment) {
    if (!student) return
    const confirmed = window.confirm(`Delete this ${formatCents(payment.amountCents)} payment? This cannot be undone.`)
    if (!confirmed) return
    try {
      await api.studentMemberships.deletePayment(payment.id)
      toast.success('Payment deleted.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault()
    if (!membership || !student || addingAdjustment) return
    setAdjustmentError(null)
    const delta = Number.parseInt(adjustmentForm.delta, 10)
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustmentError('Enter a non-zero number (e.g. 1 for a bonus lesson, -1 to undo one).')
      return
    }
    setAddingAdjustment(true)
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
    } finally {
      setAddingAdjustment(false)
    }
  }

  async function handleCancelMembership() {
    if (!membership || !student) return
    const confirmed = window.confirm(
      `Cancel ${student.firstName}'s membership? They'll need to be assigned a new one to resume billing.`,
    )
    if (!confirmed) return
    try {
      await api.studentMemberships.cancel(membership.id)
      toast.success('Membership cancelled.')
      await refresh(student.id)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  // The picker only lists active plans, but a student can be on one that's
  // since been archived (e.g. discontinued while they were still enrolled) —
  // without this, the Select can't display their own current plan as
  // selected at all, since it wouldn't be among the rendered options.
  const changePlanOptions =
    membership && !plans.some((p) => p.id === membership.planId) ? [...plans, membership.plan] : plans

  const visiblePayments = filterPaymentsByRange(paymentHistory, historyRange)

  // Drives whether the proration block below is shown at all — only makes
  // sense for a monthly plan starting mid-month. See the effect above for
  // how assignForm.prorate/prorationAmount default once this is true.
  const assignSelectedPlan = plans.find((p) => p.id === assignForm.planId)
  const showProration =
    assignSelectedPlan?.billingFrequency === 'monthly' && !!assignForm.startDate && !isFirstOfMonthIso(assignForm.startDate)

  return (
    <Dialog open={student !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{student?.firstName} {student?.lastName}&rsquo;s Membership</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm italic text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <LoadErrorBanner
            message={`Couldn't load this student's membership: ${loadError}`}
            onRetry={() => student && load(student)}
          />
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
                {showProration && (
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={assignForm.prorate}
                        onCheckedChange={(checked) => setAssignForm((f) => ({ ...f, prorate: checked === true }))}
                      />
                      Prorate their first partial month
                    </label>
                    {assignForm.prorate && (
                      <div className="mt-2 flex items-end gap-2">
                        <div className="w-32">
                          <Label className="mb-1">Prorated charge</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={assignForm.prorationAmount}
                            onChange={(e) => setAssignForm((f) => ({ ...f, prorationAmount: e.target.value }))}
                          />
                        </div>
                        <p className="pb-2 text-sm text-muted-foreground">
                          Then billed normally starting{' '}
                          {new Date(`${startOfNextMonthIso(assignForm.startDate)}T00:00:00`).toLocaleDateString()}.
                        </p>
                      </div>
                    )}
                  </div>
                )}
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
                    {/* The membership's own snapshotted terms, not the plan's current
                        ones — those can differ once the plan has been edited. */}
                    {formatCents(membership.effectivePriceCents)} / {FREQUENCY_LABEL[membership.billingFrequency].toLowerCase()}
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
                  <Button type="submit" variant="outline" disabled={changingPlan}>Save</Button>
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
                    <Button type="submit" disabled={recordingPayment}>Record Payment</Button>
                  </div>
                  {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
                </form>
              </>
            )}

            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Payment history</Label>
                {paymentHistory.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {visiblePayments.length < paymentHistory.length
                        ? `Showing ${visiblePayments.length} of ${paymentHistory.length}`
                        : `${paymentHistory.length} payment${paymentHistory.length === 1 ? '' : 's'}`}
                    </span>
                    <Select value={historyRange} onValueChange={(v) => setHistoryRange(v as typeof historyRange)}>
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_HISTORY_RANGES.map((r) => (
                          <SelectItem key={r} value={r}>{PAYMENT_HISTORY_RANGE_LABEL[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
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
                    ) : visiblePayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center italic text-muted-foreground">No payments in this period. Choose a wider range to see older payments.</TableCell>
                      </TableRow>
                    ) : (
                      visiblePayments.map((payment) => (
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
                <form className="flex flex-col gap-2 border-t border-border pt-3" onSubmit={handleChargeExtraLesson}>
                  <Label>Charge for an extra lesson</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-28"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price"
                      value={extraLessonForm.price}
                      onChange={(e) => setExtraLessonForm((f) => ({ ...f, price: e.target.value }))}
                    />
                    <Input
                      className="w-20"
                      type="number"
                      min="1"
                      step="1"
                      title="Number of lessons"
                      value={extraLessonForm.lessonCount}
                      onChange={(e) => setExtraLessonForm((f) => ({ ...f, lessonCount: e.target.value }))}
                    />
                    <Input
                      className="w-40"
                      type="date"
                      title="Paid on"
                      value={extraLessonForm.paidOn}
                      onChange={(e) => setExtraLessonForm((f) => ({ ...f, paidOn: e.target.value }))}
                    />
                    <Select
                      value={extraLessonForm.method}
                      onValueChange={(v) => setExtraLessonForm((f) => ({ ...f, method: v as PaymentMethod }))}
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
                      value={extraLessonForm.notes}
                      onChange={(e) => setExtraLessonForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                    <Button type="submit" variant="outline" disabled={chargingExtraLesson}>Charge</Button>
                  </div>
                  {extraLessonError && <p className="text-sm text-destructive">{extraLessonError}</p>}
                </form>

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
                      placeholder="e.g. free bonus lesson, our scheduling error"
                      value={adjustmentForm.reason}
                      onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={addingAdjustment}>Add</Button>
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
