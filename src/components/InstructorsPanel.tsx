import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Instructor } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function InstructorsPanel() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [showArchived, setShowArchived] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    setInstructors(await api.instructors.list())
  }

  useEffect(() => {
    refresh()
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
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(instructor: Instructor) {
    setNotice(null)
    const { archived } = await api.instructors.delete(instructor.id)
    if (archived) {
      setNotice(`${instructor.firstName} ${instructor.lastName} has lesson history, so they were archived instead of deleted.`)
    }
    await refresh()
  }

  async function handleReactivate(id: string) {
    await api.instructors.update(id, { active: true })
    await refresh()
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
      {notice && <p className="mb-4 text-sm text-muted-foreground">{notice}</p>}
      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
        Show archived
      </label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {instructors
            .filter((i) => showArchived || i.active)
            .map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  {i.firstName} {i.lastName}
                  {!i.active && <span className="ml-2 text-xs italic text-muted-foreground">Archived</span>}
                </TableCell>
                <TableCell>{i.email ?? '—'}</TableCell>
                <TableCell>{i.phone ?? '—'}</TableCell>
                <TableCell>
                  {i.active ? (
                    <Button variant="outline" size="sm" onClick={() => handleDelete(i)}>Delete</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleReactivate(i.id)}>Reactivate</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          {instructors.filter((i) => showArchived || i.active).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center italic text-muted-foreground">No instructors yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
