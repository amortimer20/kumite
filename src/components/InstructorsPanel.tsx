import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Instructor } from '../../shared/types'

export function InstructorsPanel() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  async function handleDelete(id: string) {
    await api.instructors.delete(id)
    await refresh()
  }

  return (
    <div className="panel">
      <h2>Instructors</h2>
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit">Add Instructor</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {instructors.map((i) => (
            <tr key={i.id}>
              <td>{i.firstName} {i.lastName}</td>
              <td>{i.email ?? '—'}</td>
              <td>{i.phone ?? '—'}</td>
              <td><button onClick={() => handleDelete(i.id)}>Delete</button></td>
            </tr>
          ))}
          {instructors.length === 0 && (
            <tr><td colSpan={4} className="empty">No instructors yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
