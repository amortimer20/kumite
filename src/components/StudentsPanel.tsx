import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { STUDENT_RANKS } from '../../shared/types'
import type { FamilyMember, FamilyMemberInput, Student, StudentInput } from '../../shared/types'
import { TableSkeletonRows } from './TableSkeletonRows'
import { getErrorMessage } from '@/lib/errors'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const EMPTY_FAMILY_FORM: FamilyMemberInput = { firstName: '', lastName: '', rank: null }

const EMPTY_FORM: StudentInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  rank: null,
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
    street: student.street ?? '',
    city: student.city ?? '',
    state: student.state ?? '',
    zip: student.zip ?? '',
    notes: student.notes ?? '',
  }
}

function normalize(form: StudentInput): StudentInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email?.trim() || null,
    phone: form.phone?.trim() || null,
    rank: form.rank || null,
    street: form.street?.trim() || null,
    city: form.city?.trim() || null,
    state: form.state?.trim() || null,
    zip: form.zip?.trim() || null,
    notes: form.notes?.trim() || null,
  }
}

export function StudentsPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [addForm, setAddForm] = useState<StudentInput>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  // Radix Select doesn't reset its displayed label when value goes back to
  // undefined, so force a remount after each successful add to clear it.
  const [addFormKey, setAddFormKey] = useState(0)

  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState<StudentInput>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)

  const [familyForm, setFamilyForm] = useState<FamilyMemberInput>(EMPTY_FAMILY_FORM)
  const [familyError, setFamilyError] = useState<string | null>(null)
  // Same Radix Select reset-on-undefined issue as addFormKey above.
  const [familyFormKey, setFamilyFormKey] = useState(0)

  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    try {
      await api.students.create(normalize(addForm))
      toast.success(`${addForm.firstName.trim()} ${addForm.lastName.trim()} added.`)
      setAddForm(EMPTY_FORM)
      setAddFormKey((k) => k + 1)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDelete(student: Student) {
    const confirmed = window.confirm(
      `Delete ${student.firstName} ${student.lastName}? If they have lesson history they'll be archived instead — otherwise this cannot be undone.`,
    )
    if (!confirmed) return

    const { archived } = await api.students.delete(student.id)
    if (archived) {
      toast.info(`${student.firstName} ${student.lastName} has lesson history, so they were archived instead of deleted.`)
    } else {
      toast.success(`${student.firstName} ${student.lastName} deleted.`)
    }
    await refresh()
  }

  async function handleReactivate(student: Student) {
    await api.students.update(student.id, { active: true })
    toast.success(`${student.firstName} ${student.lastName} reactivated.`)
    await refresh()
  }

  function openEdit(student: Student) {
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

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Students</h2>
      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleAdd}>
        <Input
          className="w-40"
          placeholder="First name"
          value={addForm.firstName}
          onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
        />
        <Input
          className="w-40"
          placeholder="Last name"
          value={addForm.lastName}
          onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
        />
        <Select
          key={addFormKey}
          value={addForm.rank ?? undefined}
          onValueChange={(v) => setAddForm((f) => ({ ...f, rank: v }))}
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
        <Input
          className="w-48"
          placeholder="Email"
          value={addForm.email ?? ''}
          onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Input
          className="w-36"
          placeholder="Phone"
          value={addForm.phone ?? ''}
          onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <Button type="submit">Add Student</Button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
        Show archived
      </label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Rank</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeletonRows columns={5} />
          ) : (
            <>
              {students
                .filter((s) => showArchived || s.active)
                .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {s.firstName} {s.lastName}
                      {!s.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                    </TableCell>
                    <TableCell>{s.rank ?? '—'}</TableCell>
                    <TableCell>{s.email ?? '—'}</TableCell>
                    <TableCell>{s.phone ?? '—'}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                      {s.active ? (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(s)}>Delete</Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleReactivate(s)}>Reactivate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              {students.filter((s) => showArchived || s.active).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center italic text-muted-foreground">No students yet.</TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

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

            <div>
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
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteFamilyMember(fm)}>Delete</Button>
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
    </div>
  )
}
