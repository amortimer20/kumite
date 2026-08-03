import { useEffect, useState } from 'react'
import { CalendarDays, MoreHorizontal, Pencil, Repeat, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import { STUDENT_RANKS } from '../../shared/types'
import type { FamilyMember, FamilyMemberInput, Lesson, Student, StudentInput } from '../../shared/types'
import { RecurringLessonDeleteDialog } from './RecurringLessonDeleteDialog'
import { StudentMembershipDialog } from './StudentMembershipDialog'
import { TableSkeletonRows } from './TableSkeletonRows'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { useLessonDelete } from '@/hooks/useLessonDelete'
import { getErrorMessage } from '@/lib/errors'
import { dateToIso, isoDateToInstant, todayIso } from '@/lib/isoDate'
import { STATUS_LABEL } from '@/lib/lessonStatus'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const EMPTY_FAMILY_FORM: FamilyMemberInput = { firstName: '', lastName: '', rank: null }

const RELEASE_AGREEMENT_TEXT =
  "I, the undersigned, do hereby release and indemnify and save and hold harmless TRACY'S KARATE STUDIO, or any of its employees, or affiliates schools, against any and all liability for losses, damages, cost, or any other expense by reason of personal injury, property damage or negligence on behalf of any sort, or any aspect of learning the sport or self-defense arts. I, the undersigned, accept as my personal responsibility and liability and all risk, if any, as the result of my training, instruction or competition of any sort in connection with learning the sport or self-defense arts."

const EMPTY_FORM: StudentInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  rank: null,
  memberSince: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
}

function toFormValues(student: Student): StudentInput {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email ?? '',
    phone: student.phone ?? '',
    rank: student.rank,
    memberSince: student.memberSince ? dateToIso(new Date(student.memberSince)) : '',
    street: student.street ?? '',
    city: student.city ?? '',
    state: student.state ?? '',
    zip: student.zip ?? '',
    notes: student.notes ?? '',
  }
}

function matchesSearch(student: Student, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [student.firstName, student.lastName, student.email, student.phone, student.rank]
    .some((field) => field?.toLowerCase().includes(q))
}

function normalize(form: StudentInput): StudentInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email?.trim() || null,
    phone: form.phone?.trim() || null,
    rank: form.rank || null,
    memberSince: form.memberSince ? isoDateToInstant(form.memberSince) : null,
    street: form.street?.trim() || null,
    city: form.city?.trim() || null,
    state: form.state?.trim() || null,
    zip: form.zip?.trim() || null,
    notes: form.notes?.trim() || null,
  }
}

export function StudentsPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addForm, setAddForm] = useState<StudentInput>(EMPTY_FORM)
  const [agreedToWaiver, setAgreedToWaiver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Radix Select doesn't reset its displayed label when value goes back to
  // undefined, so force a remount after each successful add to clear it.
  const [addFormKey, setAddFormKey] = useState(0)

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState<StudentInput>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)

  // A student with lessons can't just be deleted outright — this opens a
  // modal to choose archive (keep history) vs. delete everything.
  const [deleteModalStudent, setDeleteModalStudent] = useState<Student | null>(null)

  const [lessonsStudent, setLessonsStudent] = useState<Student | null>(null)
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([])
  const [studentLessonsLoading, setStudentLessonsLoading] = useState(false)

  const [membershipStudent, setMembershipStudent] = useState<Student | null>(null)

  const [detailsStudent, setDetailsStudent] = useState<Student | null>(null)

  const [familyForm, setFamilyForm] = useState<FamilyMemberInput>(EMPTY_FAMILY_FORM)
  const [familyError, setFamilyError] = useState<string | null>(null)
  // Same Radix Select reset-on-undefined issue as addFormKey above.
  const [familyFormKey, setFamilyFormKey] = useState(0)

  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)

  async function refresh() {
    const updated = await api.students.list()
    setStudents(updated)
    // Keeps the open edit dialog's family member list current after any
    // family-member mutation, which refetches through this same function.
    setEditingStudent((prev) => (prev ? (updated.find((s) => s.id === prev.id) ?? null) : prev))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  function openAddDialog() {
    setAddForm({ ...EMPTY_FORM, memberSince: todayIso() })
    setAddFormKey((k) => k + 1)
    setAgreedToWaiver(false)
    setError(null)
    setAddDialogOpen(true)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    if (!agreedToWaiver) {
      setError('You must agree to the Release and Indemnity Agreement to add a student.')
      return
    }
    try {
      await api.students.create({ ...normalize(addForm), agreedToWaiver })
      toast.success(`${addForm.firstName.trim()} ${addForm.lastName.trim()} added.`)
      setAddDialogOpen(false)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function handleDeleteClick(student: Student) {
    if (student.lessonCount > 0) {
      setDeleteModalStudent(student)
      return
    }
    handleDeleteConfirmed(student)
  }

  async function handleDeleteConfirmed(student: Student) {
    const confirmed = window.confirm(`Delete ${student.firstName} ${student.lastName}? This cannot be undone.`)
    if (!confirmed) return

    const { archived } = await api.students.delete(student.id)
    if (archived) {
      toast.info(`${student.firstName} ${student.lastName} has lesson history, so they were archived instead of deleted.`)
    } else {
      toast.success(`${student.firstName} ${student.lastName} deleted.`)
    }
    await refresh()
  }

  async function handleArchiveFromModal() {
    if (!deleteModalStudent) return
    await api.students.delete(deleteModalStudent.id)
    toast.success(`${deleteModalStudent.firstName} ${deleteModalStudent.lastName} archived.`)
    setDeleteModalStudent(null)
    await refresh()
  }

  async function handleDeleteEverythingFromModal() {
    if (!deleteModalStudent) return
    await api.students.delete(deleteModalStudent.id, { force: true })
    toast.success(`${deleteModalStudent.firstName} ${deleteModalStudent.lastName}, their lessons, and any membership/billing history deleted.`)
    setDeleteModalStudent(null)
    await refresh()
  }

  async function handleReactivate(student: Student) {
    await api.students.update(student.id, { active: true })
    toast.success(`${student.firstName} ${student.lastName} reactivated.`)
    await refresh()
  }

  function openEdit(student: Student) {
    setDetailsStudent(null)
    setEditingStudent(student)
    setEditForm(toFormValues(student))
    setEditError(null)
    setFamilyForm(EMPTY_FAMILY_FORM)
    setFamilyError(null)
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingStudent) return
    setEditError(null)
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError('First and last name are required.')
      return
    }
    try {
      await api.students.update(editingStudent.id, normalize(editForm))
      toast.success('Changes saved.')
      setEditingStudent(null)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleAddFamilyMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editingStudent) return
    setFamilyError(null)
    if (!familyForm.firstName.trim() || !familyForm.lastName.trim()) {
      setFamilyError('First and last name are required.')
      return
    }
    try {
      await api.familyMembers.create(editingStudent.id, {
        firstName: familyForm.firstName.trim(),
        lastName: familyForm.lastName.trim(),
        rank: familyForm.rank,
      })
      toast.success(`${familyForm.firstName.trim()} ${familyForm.lastName.trim()} added.`)
      setFamilyForm(EMPTY_FAMILY_FORM)
      setFamilyFormKey((k) => k + 1)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleFamilyMemberRankChange(id: string, rank: string) {
    await api.familyMembers.update(id, { rank })
    await refresh()
  }

  async function handleDeleteFamilyMember(familyMember: FamilyMember) {
    const confirmed = window.confirm(
      `Delete ${familyMember.firstName} ${familyMember.lastName}? This cannot be undone.`,
    )
    if (!confirmed) return

    await api.familyMembers.delete(familyMember.id)
    toast.success(`${familyMember.firstName} ${familyMember.lastName} removed.`)
    await refresh()
  }

  function sortByStartTime(lessons: Lesson[]) {
    return lessons.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }

  async function openLessons(student: Student) {
    setLessonsStudent(student)
    setStudentLessonsLoading(true)
    try {
      const result = await api.lessons.list({ studentId: student.id })
      setStudentLessons(sortByStartTime(result))
    } finally {
      setStudentLessonsLoading(false)
    }
  }

  async function refreshStudentLessons() {
    if (!lessonsStudent) return
    const result = await api.lessons.list({ studentId: lessonsStudent.id })
    setStudentLessons(sortByStartTime(result))
    // A deleted lesson changes lessonCount, which the delete-student modal
    // relies on to decide whether to offer the archive-vs-delete choice.
    await refresh()
  }

  const {
    deleteModalLesson,
    setDeleteModalLesson,
    handleDeleteClick: handleLessonDeleteClick,
    handleDeleteJustThisLesson,
    handleDeleteThisAndFutureLessons,
  } = useLessonDelete(refreshStudentLessons)

  const visibleStudents = students.filter((s) => (showArchived || s.active) && matchesSearch(s, search))

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Students</h2>
      <div className="mb-3 flex items-center gap-4">
        <Input
          className="w-64"
          placeholder="Search students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
          Show archived
        </label>
        <Button className="ml-auto" onClick={openAddDialog}>Add Student</Button>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">Name</TableHead>
            <TableHead className="w-24">Rank</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            showSkeleton ? <TableSkeletonRows columns={3} /> : null
          ) : (
            <>
              {visibleStudents.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="truncate">
                    {s.firstName} {s.lastName}
                    {!s.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                  </TableCell>
                  <TableCell>{s.rank ?? '—'}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailsStudent(s)}>Details</Button>
                    <Button variant="outline" size="sm" onClick={() => setMembershipStudent(s)}>Membership</Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreHorizontal />
                          <span className="sr-only">More actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openLessons(s)}>
                          <CalendarDays />Lessons
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEdit(s)}>
                          <Pencil />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {s.active ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => handleDeleteClick(s)}>
                            <Trash2 />Delete
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => handleReactivate(s)}>
                            <RotateCcw />Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {visibleStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center italic text-muted-foreground">
                    {search.trim() ? 'No students match your search.' : 'No students yet.'}
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

      <Dialog open={addDialogOpen} onOpenChange={(open) => !open && setAddDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={handleAdd}>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">First name</Label>
                <Input
                  value={addForm.firstName}
                  onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">Last name</Label>
                <Input
                  value={addForm.lastName}
                  onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">Rank</Label>
                <Select
                  key={addFormKey}
                  value={addForm.rank ?? undefined}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, rank: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_RANKS.map((rank) => (
                      <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-1">Member since</Label>
                <Input
                  type="date"
                  value={addForm.memberSince ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, memberSince: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">Email</Label>
                <Input
                  value={addForm.email ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">Phone</Label>
                <Input
                  value={addForm.phone ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1">Street</Label>
              <Input
                value={addForm.street ?? ''}
                onChange={(e) => setAddForm((f) => ({ ...f, street: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">City</Label>
                <Input
                  value={addForm.city ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="w-20">
                <Label className="mb-1">State</Label>
                <Input
                  value={addForm.state ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="w-24">
                <Label className="mb-1">Zip</Label>
                <Input
                  value={addForm.zip ?? ''}
                  onChange={(e) => setAddForm((f) => ({ ...f, zip: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1">Notes</Label>
              <Textarea
                placeholder="Additional notes"
                value={addForm.notes ?? ''}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="border-t border-border pt-3">
              <Label className="mb-2">Release and Indemnity Agreement</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border border-input bg-muted/30 p-2.5 text-xs text-muted-foreground">
                {RELEASE_AGREEMENT_TEXT}
              </div>
              <label className="mt-2 flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={agreedToWaiver}
                  onCheckedChange={(checked) => setAgreedToWaiver(checked === true)}
                />
                I have read and agree to the Release and Indemnity Agreement above.
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Add Student</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsStudent !== null} onOpenChange={(open) => !open && setDetailsStudent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {detailsStudent?.firstName} {detailsStudent?.lastName}
              {detailsStudent && !detailsStudent.active && (
                <span className="ml-2 text-xs italic font-normal text-muted-foreground">Archived</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="mb-1 text-muted-foreground">Rank</Label>
                <p>{detailsStudent?.rank ?? '—'}</p>
              </div>
              <div>
                <Label className="mb-1 text-muted-foreground">Member since</Label>
                <p>{detailsStudent?.memberSince ? new Date(detailsStudent.memberSince).toLocaleDateString() : '—'}</p>
              </div>
              <div>
                <Label className="mb-1 text-muted-foreground">Phone</Label>
                <p>{detailsStudent?.phone ?? '—'}</p>
              </div>
            </div>
            <div>
              <Label className="mb-1 text-muted-foreground">Email</Label>
              <p>{detailsStudent?.email ?? '—'}</p>
            </div>
            <div>
              <Label className="mb-1 text-muted-foreground">Address</Label>
              <p>
                {detailsStudent && (detailsStudent.street || detailsStudent.city || detailsStudent.state || detailsStudent.zip)
                  ? [
                      detailsStudent.street,
                      [detailsStudent.city, detailsStudent.state].filter(Boolean).join(', '),
                      detailsStudent.zip,
                    ]
                      .filter(Boolean)
                      .join(' — ')
                  : '—'}
              </p>
            </div>
            <div>
              <Label className="mb-1 text-muted-foreground">Notes</Label>
              <p className="whitespace-pre-wrap">{detailsStudent?.notes || '—'}</p>
            </div>
            <div>
              <Label className="mb-1 text-muted-foreground">Release and Indemnity Agreement</Label>
              <p>
                {detailsStudent?.waiverAgreedAt
                  ? `Agreed ${new Date(detailsStudent.waiverAgreedAt).toLocaleDateString()}`
                  : 'Not on file'}
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <Label className="mb-2 text-muted-foreground">Family Members</Label>
              <div className="flex flex-col gap-1">
                {detailsStudent?.familyMembers.map((fm) => (
                  <p key={fm.id}>
                    {fm.firstName} {fm.lastName}
                    {fm.rank && <span className="text-muted-foreground"> — {fm.rank}</span>}
                  </p>
                ))}
                {detailsStudent?.familyMembers.length === 0 && (
                  <p className="italic text-muted-foreground">No family members added.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsStudent(null)}>Close</Button>
            <Button onClick={() => detailsStudent && openEdit(detailsStudent)}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingStudent !== null} onOpenChange={(open) => !open && setEditingStudent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={handleSaveEdit}>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">First name</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">Last name</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">Rank</Label>
                <Select
                  key={editingStudent?.id}
                  value={editForm.rank ?? undefined}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, rank: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_RANKS.map((rank) => (
                      <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-1">Member since</Label>
                <Input
                  type="date"
                  value={editForm.memberSince ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, memberSince: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">Email</Label>
                <Input
                  value={editForm.email ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">Phone</Label>
                <Input
                  value={editForm.phone ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1">Street</Label>
              <Input
                value={editForm.street ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, street: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="mb-1">City</Label>
                <Input
                  value={editForm.city ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="w-20">
                <Label className="mb-1">State</Label>
                <Input
                  value={editForm.state ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="w-24">
                <Label className="mb-1">Zip</Label>
                <Input
                  value={editForm.zip ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, zip: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1">Notes</Label>
              <Textarea
                placeholder="Additional notes"
                value={editForm.notes ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingStudent(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>

          <div className="mt-2 border-t border-border pt-3">
            <Label className="mb-2">Family Members</Label>
            <div className="flex flex-col gap-2">
              {editingStudent?.familyMembers.map((fm) => (
                <div key={fm.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{fm.firstName} {fm.lastName}</span>
                  <Select value={fm.rank ?? undefined} onValueChange={(v) => handleFamilyMemberRankChange(fm.id, v)}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Rank" />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDENT_RANKS.map((rank) => (
                        <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteFamilyMember(fm)}><Trash2 />Delete</Button>
                </div>
              ))}
              {editingStudent?.familyMembers.length === 0 && (
                <p className="text-sm italic text-muted-foreground">No family members added.</p>
              )}
            </div>

            <form className="mt-2 flex items-center gap-2" onSubmit={handleAddFamilyMember}>
              <Input
                className="flex-1"
                placeholder="First name"
                value={familyForm.firstName}
                onChange={(e) => setFamilyForm((f) => ({ ...f, firstName: e.target.value }))}
              />
              <Input
                className="flex-1"
                placeholder="Last name"
                value={familyForm.lastName}
                onChange={(e) => setFamilyForm((f) => ({ ...f, lastName: e.target.value }))}
              />
              <Select
                key={familyFormKey}
                value={familyForm.rank ?? undefined}
                onValueChange={(v) => setFamilyForm((f) => ({ ...f, rank: v }))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Rank" />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_RANKS.map((rank) => (
                    <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline" size="sm">Add</Button>
            </form>
            {familyError && <p className="mt-1 text-sm text-destructive">{familyError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalStudent !== null} onOpenChange={(open) => !open && setDeleteModalStudent(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteModalStudent?.firstName} {deleteModalStudent?.lastName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteModalStudent?.firstName} has {deleteModalStudent?.lessonCount} lesson
            {deleteModalStudent?.lessonCount === 1 ? '' : 's'} on the schedule. What would you like to do?
          </p>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button
              variant="outline"
              className="h-auto whitespace-normal text-left"
              onClick={handleArchiveFromModal}
            >
              Archive (keep lesson history)
            </Button>
            <Button
              variant="destructive"
              className="h-auto whitespace-normal text-left"
              onClick={handleDeleteEverythingFromModal}
            >
              <Trash2 className="shrink-0" />
              Delete permanently (also deletes {deleteModalStudent?.lessonCount} lessons and any membership/billing history)
            </Button>
            <Button variant="ghost" onClick={() => setDeleteModalStudent(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lessonsStudent !== null} onOpenChange={(open) => !open && setLessonsStudent(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lessonsStudent?.firstName} {lessonsStudent?.lastName}&rsquo;s Lessons</DialogTitle>
          </DialogHeader>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Date</TableHead>
                <TableHead className="w-40">Time</TableHead>
                <TableHead className="w-32">Instructor</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentLessonsLoading ? (
                <TableSkeletonRows columns={6} />
              ) : (
                <>
                  {studentLessons.map((lesson) => (
                    <TableRow key={lesson.id} className={lesson.status === 'cancelled' ? 'cancelled-row' : ''}>
                      <TableCell>{new Date(lesson.startTime).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {new Date(lesson.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(lesson.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="truncate">
                        <span className="inline-flex items-center gap-1.5">
                          {lesson.recurringSeriesId && (
                            <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Recurring lesson" />
                          )}
                          {lesson.instructor.firstName} {lesson.instructor.lastName}
                        </span>
                      </TableCell>
                      <TableCell>{STATUS_LABEL[lesson.status]}</TableCell>
                      <TableCell className="truncate">
                        {lesson.notes ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate">{lesson.notes}</span>
                            </TooltipTrigger>
                            <TooltipContent>{lesson.notes}</TooltipContent>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => handleLessonDeleteClick(lesson)}><Trash2 />Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {studentLessons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center italic text-muted-foreground">No lessons scheduled.</TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonsStudent(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecurringLessonDeleteDialog
        lesson={deleteModalLesson}
        onOpenChange={(open) => !open && setDeleteModalLesson(null)}
        onDeleteJustThis={handleDeleteJustThisLesson}
        onDeleteThisAndFuture={handleDeleteThisAndFutureLessons}
      />

      <StudentMembershipDialog
        student={membershipStudent}
        onOpenChange={(open) => !open && setMembershipStudent(null)}
      />
    </div>
  )
}
