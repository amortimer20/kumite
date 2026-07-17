import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Student } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function StudentsPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setStudents(await api.students.list())
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
      await api.students.create({
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

  async function handleDelete(id: string) {
    await api.students.delete(id)
    await refresh()
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Students</h2>
      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleAdd}>
        <Input className="w-40" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input className="w-40" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Input className="w-48" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input className="w-36" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit">Add Student</Button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
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
          {students.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.firstName} {s.lastName}</TableCell>
              <TableCell>{s.email ?? '—'}</TableCell>
              <TableCell>{s.phone ?? '—'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center italic text-muted-foreground">No students yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
