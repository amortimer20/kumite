import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import type { Instructor } from '../../shared/types'
import { TableSkeletonRows } from './TableSkeletonRows'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { getErrorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const EMPTY_EDIT_FORM = { firstName: '', lastName: '', email: '', phone: '' }

function toFormValues(instructor: Instructor) {
  return {
    firstName: instructor.firstName,
    lastName: instructor.lastName,
    email: instructor.email ?? '',
    phone: instructor.phone ?? '',
  }
}

export function InstructorsPanel() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [editError, setEditError] = useState<string | null>(null)

  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)

  async function refresh() {
    setInstructors(await api.instructors.list())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    try {
      await api.instructors.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      toast.success(`${firstName.trim()} ${lastName.trim()} added.`)
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleDelete(instructor: Instructor) {
    const message =
      instructor.upcomingLessonCount > 0
        ? `Delete ${instructor.firstName} ${instructor.lastName}? This will also delete their ${instructor.upcomingLessonCount} upcoming lesson${instructor.upcomingLessonCount === 1 ? '' : 's'}. This cannot be undone.`
        : `Delete ${instructor.firstName} ${instructor.lastName}? This cannot be undone.`
    const confirmed = window.confirm(message)
    if (!confirmed) return

    const { archived } = await api.instructors.delete(instructor.id)
    if (archived) {
      toast.info(`${instructor.firstName} ${instructor.lastName} has lesson history, so they were archived instead of deleted.`)
    } else {
      toast.success(`${instructor.firstName} ${instructor.lastName} deleted.`)
    }
    await refresh()
  }

  async function handleReactivate(instructor: Instructor) {
    await api.instructors.update(instructor.id, { active: true })
    toast.success(`${instructor.firstName} ${instructor.lastName} reactivated.`)
    await refresh()
  }

  function openEdit(instructor: Instructor) {
    setEditingInstructor(instructor)
    setEditForm(toFormValues(instructor))
    setEditError(null)
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingInstructor) return
    setEditError(null)
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setEditError('First and last name are required.')
      return
    }
    try {
      await api.instructors.update(editingInstructor.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
      })
      toast.success('Changes saved.')
      setEditingInstructor(null)
      await refresh()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Instructors</h2>
      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleAdd}>
        <Input className="w-40" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input className="w-40" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input className="w-48" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input className="w-36" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit">Add Instructor</Button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
        Show archived
      </label>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-32">Phone</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            showSkeleton ? <TableSkeletonRows columns={4} /> : null
          ) : (
            <>
              {instructors
                .filter((i) => showArchived || i.active)
                .map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="truncate">
                      {i.firstName} {i.lastName}
                      {!i.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                    </TableCell>
                    <TableCell className="truncate">{i.email ?? '—'}</TableCell>
                    <TableCell>{i.phone ?? '—'}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(i)}>Edit</Button>
                      {i.active ? (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(i)}><Trash2 />Delete</Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleReactivate(i)}>Reactivate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              {instructors.filter((i) => showArchived || i.active).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center italic text-muted-foreground">No instructors yet.</TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

      <Dialog open={editingInstructor !== null} onOpenChange={(open) => !open && setEditingInstructor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Instructor</DialogTitle>
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
                <Label className="mb-1">Email</Label>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">Phone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingInstructor(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
