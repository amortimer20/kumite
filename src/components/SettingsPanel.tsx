import { useEffect, useState } from 'react'
import { Clock, CreditCard, HardDrive, Info, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import { AUTO_BACKUP_FREQUENCIES, AUTO_BACKUP_KEEP_COUNTS, MEMBERSHIP_BILLING_FREQUENCIES } from '../../shared/types'
import type { AppInfo, AppSettings, AppSettingsInput, AutoBackupFrequency, BusinessHours, MembershipBillingFrequency, MembershipPlan } from '../../shared/types'
import { TableSkeletonRows } from './TableSkeletonRows'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { getErrorMessage } from '@/lib/errors'
import { FREQUENCY_LABEL, clampNonNegativeInt, formatCents, parsePriceToCents } from '@/lib/membershipFormat'
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

// Radix Select values are strings, so "keep everything" needs a sentinel that
// can't collide with a stringified count.
const KEEP_ALL = 'all'

const AUTO_BACKUP_FREQUENCY_LABEL: Record<AutoBackupFrequency, string> = {
  hourly: 'Every hour',
  every_6_hours: 'Every 6 hours',
  daily: 'Daily',
  weekly: 'Weekly',
}

const SECTIONS = ['hours', 'plans', 'backup', 'about'] as const
type Section = (typeof SECTIONS)[number]

const SECTION_LABEL: Record<Section, string> = {
  hours: 'Business Hours',
  plans: 'Membership Plans',
  backup: 'Backup & Restore',
  about: 'About',
}

const SECTION_ICON: Record<Section, typeof Clock> = {
  hours: Clock,
  plans: CreditCard,
  backup: HardDrive,
  about: Info,
}

export function SettingsPanel() {
  const [section, setSection] = useState<Section>('hours')
  const [hours, setHours] = useState<BusinessHours[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)
  const [restoring, setRestoring] = useState(false)

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [choosingDirectory, setChoosingDirectory] = useState(false)

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const showPlansSkeleton = useDelayedFlag(plansLoading)
  const [showArchivedPlans, setShowArchivedPlans] = useState(false)
  const [addPlanForm, setAddPlanForm] = useState(EMPTY_PLAN_FORM)
  const [addPlanFormKey, setAddPlanFormKey] = useState(0)
  const [addPlanError, setAddPlanError] = useState<string | null>(null)
  // Without this, a double-clicked submit creates the plan twice.
  const [addingPlan, setAddingPlan] = useState(false)

  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null)
  const [editPlanForm, setEditPlanForm] = useState(EMPTY_PLAN_FORM)
  const [editPlanError, setEditPlanError] = useState<string | null>(null)

  // After a plan's price/cadence change is saved (which applies to new sign-ups
  // only), offer to also apply it to the students already on the plan. Holds the
  // plan and its student count for the follow-up prompt; null when closed.
  const [applyPrompt, setApplyPrompt] = useState<{ planId: string; title: string; studentCount: number } | null>(null)
  const [applyingToExisting, setApplyingToExisting] = useState(false)

  useEffect(() => {
    api.businessHours.list().then(setHours).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.settings.get().then(setSettings).finally(() => setSettingsLoading(false))
  }, [])

  useEffect(() => {
    api.appInfo.get().then(setAppInfo)
  }, [])

  async function updateSettings(patch: AppSettingsInput) {
    setSettings(await api.settings.update(patch))
  }

  async function handleChooseBackupDirectory() {
    setChoosingDirectory(true)
    try {
      const result = await api.backup.chooseDirectory()
      if (!result.canceled && result.path) {
        await updateSettings({ autoBackupDirectory: result.path })
      }
    } finally {
      setChoosingDirectory(false)
    }
  }

  async function refreshPlans() {
    setPlans(await api.membershipPlans.list())
  }

  useEffect(() => {
    refreshPlans().finally(() => setPlansLoading(false))
  }, [])

  async function handleAddPlan(e: React.FormEvent) {
    e.preventDefault()
    if (addingPlan) return
    setAddPlanError(null)
    if (!addPlanForm.title.trim()) {
      setAddPlanError('Title is required.')
      return
    }
    // A blank price must not quietly become $0.00 — see parsePriceToCents. A
    // genuinely free plan is still allowed, it just has to be typed as 0.
    const priceCents = parsePriceToCents(addPlanForm.price)
    if (priceCents === null) {
      setAddPlanError('Enter a price of 0 or more (use 0 for a free plan).')
      return
    }
    setAddingPlan(true)
    try {
      await api.membershipPlans.create({
        title: addPlanForm.title.trim(),
        billingFrequency: addPlanForm.billingFrequency,
        priceCents,
        includedPrivateLessons: clampNonNegativeInt(addPlanForm.includedPrivateLessons),
      })
      toast.success(`${addPlanForm.title.trim()} added.`)
      setAddPlanForm(EMPTY_PLAN_FORM)
      setAddPlanFormKey((k) => k + 1)
      await refreshPlans()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAddingPlan(false)
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
    const priceCents = parsePriceToCents(editPlanForm.price)
    if (priceCents === null) {
      setEditPlanError('Enter a price of 0 or more (use 0 for a free plan).')
      return
    }
    // Whether the billing terms (not just the title/lessons) changed — that's
    // what "apply to new sign-ups only" is about, so it's the only case worth
    // offering to apply to existing members.
    const termsChanged =
      priceCents !== editingPlan.priceCents || editPlanForm.billingFrequency !== editingPlan.billingFrequency
    const { id: planId, title, studentCount } = editingPlan
    try {
      await api.membershipPlans.update(planId, {
        title: editPlanForm.title.trim(),
        billingFrequency: editPlanForm.billingFrequency,
        priceCents,
        includedPrivateLessons: clampNonNegativeInt(editPlanForm.includedPrivateLessons),
      })
      toast.success('Changes saved.')
      setEditingPlan(null)
      await refreshPlans()
      // Editing a plan only affects new sign-ups by default; if the terms
      // changed and there are students on it, ask whether to apply to them too.
      if (termsChanged && studentCount > 0) {
        setApplyPrompt({ planId, title, studentCount })
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleApplyToExisting() {
    if (!applyPrompt) return
    setApplyingToExisting(true)
    try {
      const { updated } = await api.membershipPlans.applyToExisting(applyPrompt.planId)
      toast.success(
        updated === 1
          ? '1 membership now bills at the new price from its next billing date.'
          : `${updated} memberships now bill at the new price from their next billing date.`,
      )
      setApplyPrompt(null)
      await refreshPlans()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setApplyingToExisting(false)
    }
  }

  async function handleChange(dayOfWeek: number, patch: Partial<BusinessHours>) {
    const previous = hours.find((h) => h.dayOfWeek === dayOfWeek)
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)))
    try {
      const updated = await api.businessHours.update(dayOfWeek, patch)
      setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? updated : h)))
    } catch (err) {
      // Roll the optimistic change back so the UI can never show a value the
      // database rejected (e.g. a close time before the open time).
      if (previous) setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? previous : h)))
      toast.error(getErrorMessage(err))
    }
  }

  async function handleBackup() {
    try {
      const result = await api.backup.create()
      if (!result.canceled) {
        toast.success(`Backup saved to ${result.path}`)
      }
    } catch (err) {
      // A failed export must never look like a cancelled one — this is the
      // app's only recovery mechanism.
      toast.error(getErrorMessage(err))
    }
  }

  async function handleRestore() {
    const confirmed = window.confirm(
      'Restoring will replace all current data with the contents of the backup file, and the app will restart. This cannot be undone. Continue?',
    )
    if (!confirmed) return

    setRestoring(true)
    try {
      const result = await api.backup.restore()
      if (result.canceled) {
        setRestoring(false)
      }
      // Otherwise the app is relaunching now; leave the UI in its "restoring" state.
    } catch (err) {
      // The backend rejects a file that isn't a usable Kumite backup. Clear the
      // "restoring" state, or the panel would sit there waiting for a restart
      // that is never coming.
      setRestoring(false)
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Settings</h2>
      <div className="flex gap-6">
        <nav className="flex w-48 shrink-0 flex-col gap-1">
          {SECTIONS.map((s) => {
            const Icon = SECTION_ICON[s]
            return (
              <Button
                key={s}
                variant={s === section ? 'default' : 'ghost'}
                className="justify-start"
                onClick={() => setSection(s)}
              >
                <Icon />
                {SECTION_LABEL[s]}
              </Button>
            )
          })}
        </nav>
        <div className="min-w-0 flex-1">
          {section === 'hours' && (
            <>
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
            </>
          )}

          {section === 'plans' && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Billing plans students can be assigned to (e.g. "2 Private, Unlimited Group"). The title is
                descriptive — the app only tracks the private-lesson allowance, not group class attendance.
              </p>
              <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={handleAddPlan}>
                <div>
                  <Label className="mb-1">Title</Label>
                  <Input
                    className="w-56"
                    placeholder="e.g. 2 Private, Unlimited Group"
                    value={addPlanForm.title}
                    onChange={(e) => setAddPlanForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="mb-1">Billing frequency</Label>
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
                </div>
                <div>
                  <Label className="mb-1">Price</Label>
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    min="0"
                    value={addPlanForm.price}
                    onChange={(e) => setAddPlanForm((f) => ({ ...f, price: e.target.value }))}
                  />
                </div>
                <div>
                  {/* Labelled because this field defaults to 0, which hides any
                      placeholder — a bare "0" gave staff no idea what it meant. */}
                  <Label className="mb-1">Private lessons</Label>
                  <Input
                    className="w-28"
                    type="number"
                    min="0"
                    value={addPlanForm.includedPrivateLessons}
                    onChange={(e) => setAddPlanForm((f) => ({ ...f, includedPrivateLessons: e.target.value }))}
                  />
                </div>
                <Button type="submit" disabled={addingPlan}>Add Plan</Button>
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
            </>
          )}

          {section === 'backup' && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Export a backup file to keep a copy of your data — for example in a synced folder like
                OneDrive or Dropbox. Restoring loads a backup file back in, replacing all current data.
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                Restoring keeps your previous data as a safety copy rather than overwriting it. It's saved
                next to the database, with a name ending in <code>.pre-restore-</code> and a number — see
                the About section for the folder. If a restore turns out to be the wrong one, that file is
                how it gets undone.
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

              <div className="mt-6 border-t border-border pt-4">
                <h3 className="mb-1 font-medium">Automatic Backups</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Periodically saves a timestamped backup to a folder of your choice while the app is
                  running — for example a synced OneDrive or Dropbox folder.
                </p>
                {settingsLoading ? (
                  <Skeleton className="h-9 w-64" />
                ) : (
                  settings && (
                    <div className="flex flex-col gap-3">
                      <label className="flex w-fit items-center gap-2 text-sm">
                        <Checkbox
                          checked={settings.autoBackupEnabled}
                          onCheckedChange={(checked) => updateSettings({ autoBackupEnabled: checked === true })}
                        />
                        Enable automatic backups
                      </label>

                      {settings.autoBackupEnabled && (
                        <>
                          <div className="flex items-center gap-2">
                            <Input readOnly className="max-w-md" value={settings.autoBackupDirectory ?? 'No folder selected'} />
                            <Button variant="outline" onClick={handleChooseBackupDirectory} disabled={choosingDirectory}>
                              Choose Folder…
                            </Button>
                          </div>

                          <div className="flex gap-3">
                            <div className="w-48">
                              <Label className="mb-1">Frequency</Label>
                              <Select
                                value={settings.autoBackupFrequency}
                                onValueChange={(v) => updateSettings({ autoBackupFrequency: v as AutoBackupFrequency })}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {AUTO_BACKUP_FREQUENCIES.map((freq) => (
                                    <SelectItem key={freq} value={freq}>{AUTO_BACKUP_FREQUENCY_LABEL[freq]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-48">
                              <Label className="mb-1">Backups to keep</Label>
                              <Select
                                value={settings.autoBackupKeepCount === null ? KEEP_ALL : String(settings.autoBackupKeepCount)}
                                onValueChange={(v) =>
                                  updateSettings({ autoBackupKeepCount: v === KEEP_ALL ? null : Number(v) })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {AUTO_BACKUP_KEEP_COUNTS.map((count) => (
                                    <SelectItem key={count} value={String(count)}>Keep last {count}</SelectItem>
                                  ))}
                                  <SelectItem value={KEEP_ALL}>Keep all</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground">
                            {settings.autoBackupKeepCount === null
                              ? 'Older backups are never deleted, so this folder will keep growing.'
                              : `Once there are more than ${settings.autoBackupKeepCount} automatic backups, the oldest is deleted. Backups you export yourself are never deleted.`}
                          </p>

                          <p className="text-sm text-muted-foreground">
                            {!settings.autoBackupDirectory
                              ? 'Select a folder above to start automatic backups.'
                              : settings.lastAutoBackupAt
                                ? `Last automatic backup: ${new Date(settings.lastAutoBackupAt).toLocaleString()}`
                                : 'No automatic backups yet — one will run shortly.'}
                          </p>
                        </>
                      )}
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {section === 'about' && (
            <div className="flex flex-col gap-3">
              <div>
                <Label className="mb-1">Version</Label>
                {appInfo ? (
                  <p className="text-sm">Kumite {appInfo.version}</p>
                ) : (
                  <Skeleton className="h-5 w-24" />
                )}
              </div>
              <div>
                <Label className="mb-1">Database location</Label>
                {appInfo ? (
                  <Input readOnly className="max-w-md" value={appInfo.dbPath} />
                ) : (
                  <Skeleton className="h-9 w-64" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={editingPlan !== null} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Membership Plan</DialogTitle>
          </DialogHeader>
          {/* Editing a plan changes new sign-ups by default; existing members
              keep the price they signed up at, so an edit can't rewrite past
              billing. When there are members on the plan, saving a price/cadence
              change opens a follow-up prompt to apply it to them too. */}
          <p className="text-sm text-muted-foreground">
            Price and billing frequency changes apply to new sign-ups by default.
            {editingPlan && editingPlan.studentCount > 0 && (
              <>
                {' '}The {editingPlan.studentCount} student{editingPlan.studentCount === 1 ? '' : 's'} already on this
                plan keep their current price — after saving, you can choose to apply the change to them as well.
              </>
            )}
          </p>
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
                <Label className="mb-1">Private lessons</Label>
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

      <Dialog open={applyPrompt !== null} onOpenChange={(open) => !open && !applyingToExisting && setApplyPrompt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply the new price to current members?</DialogTitle>
          </DialogHeader>
          {applyPrompt && (
            <p className="text-sm text-muted-foreground">
              {applyPrompt.title} is saved and applies to new sign-ups. There{' '}
              {applyPrompt.studentCount === 1 ? 'is 1 student' : `are ${applyPrompt.studentCount} students`} already on
              this plan. You can apply the new price to them too, taking effect at each one's next billing date — their
              past and current periods keep the old price, and their billing day doesn't change. Anyone with a custom
              price stays as they are. Otherwise, current members keep their current price.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyPrompt(null)} disabled={applyingToExisting}>
              Not now
            </Button>
            <Button onClick={handleApplyToExisting} disabled={applyingToExisting}>
              Apply to current members
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
