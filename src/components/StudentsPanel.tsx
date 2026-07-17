import { useEffect, useState } from 'react'
import { api } from '../api'
import { STUDENT_RANKS } from '../../shared/types'
import type { Student, StudentInput } from '../../shared/types'
import { Button } from '@/components/ui/button'
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

  async function refresh() {
    setStudents(await api.students.list())
  }

  useEffect(() => {
    refresh()
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
      setAddForm(EMPTY_FORM)
      setAddFormKey((k) => k + 1)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(id: string) {
    await api.students.delete(id)
    await refresh()
  }

  function openEdit(student: Student) {
    setEditingStudent(student)
    setEditForm(toFormValues(student))
    setEditError(null)
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
      setEditingStudent(null)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
    }
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
          {students.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.firstName} {s.lastName}</TableCell>
              <TableCell>{s.rank ?? '—'}</TableCell>
              <TableCell>{s.email ?? '—'}</TableCell>
              <TableCell>{s.phone ?? '—'}</TableCell>
              <TableCell className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center italic text-muted-foreground">No students yet.</TableCell>
            </TableRow>
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
                placeholder="Family members, etc."
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
        </DialogContent>
      </Dialog>
    </div>
  )
}
