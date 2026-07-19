import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import type { Student } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/errors'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function todayIsoDate() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

interface PersonOption {
  id: string
  label: string
  rank: string | null
}

function personOptionsFor(student: Student | undefined): PersonOption[] {
  if (!student) return []
  return [
    { id: 'self', label: `${student.firstName} ${student.lastName}`, rank: student.rank },
    ...student.familyMembers.map((fm) => ({
      id: fm.id,
      label: `${fm.firstName} ${fm.lastName}`,
      rank: fm.rank,
    })),
  ]
}

export function CertificatesPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [availableRanks, setAvailableRanks] = useState<string[]>([])

  const [studentId, setStudentId] = useState('')
  const [personId, setPersonId] = useState('self')
  const [rank, setRank] = useState<string | undefined>(undefined)
  const [date, setDate] = useState(todayIsoDate())

  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.students.list().then((all) => setStudents(all.filter((s) => s.active))),
      api.certificates.listAvailableRanks().then(setAvailableRanks),
    ]).finally(() => setLoading(false))
  }, [])

  const selectedStudent = students.find((s) => s.id === studentId)
  const personOptions = personOptionsFor(selectedStudent)
  const selectedPerson = personOptions.find((p) => p.id === personId)

  function handleStudentChange(id: string) {
    setStudentId(id)
    setPersonId('self')
    const student = students.find((s) => s.id === id)
    const defaultRank = student?.rank
    setRank(defaultRank && availableRanks.includes(defaultRank) ? defaultRank : undefined)
  }

  function handlePersonChange(id: string) {
    setPersonId(id)
    const person = personOptionsFor(selectedStudent).find((p) => p.id === id)
    const defaultRank = person?.rank
    setRank(defaultRank && availableRanks.includes(defaultRank) ? defaultRank : undefined)
  }

  async function handlePrint(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!selectedPerson || !rank || !date) {
      setError('Select a person, rank, and date first.')
      return
    }
    setPrinting(true)
    try {
      await api.certificates.print({ name: selectedPerson.label, rank, date })
      toast.success('Opened in your PDF viewer — print from there.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Certificates</h2>
      {loading ? (
        <div className="flex max-w-md flex-col gap-3">
          <div>
            <Skeleton className="mb-1 h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div>
            <Skeleton className="mb-1 h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form className="flex max-w-md flex-col gap-3" onSubmit={handlePrint}>
          <div>
            <Label className="mb-1">Student</Label>
            <Select value={studentId} onValueChange={handleStudentChange} disabled={students.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {personOptions.length > 1 && (
            <div>
              <Label className="mb-1">Certificate for</Label>
              <Select key={studentId} value={personId} onValueChange={handlePersonChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1">Rank</Label>
            <Select key={`${studentId}-${personId}`} value={rank} onValueChange={setRank} disabled={!selectedPerson}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a rank" />
              </SelectTrigger>
              <SelectContent>
                {availableRanks.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button type="submit" disabled={printing || !selectedPerson || !rank}>
            {printing ? 'Printing…' : 'Print Certificate'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </div>
  )
}
