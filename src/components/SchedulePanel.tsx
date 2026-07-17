import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Instructor, Lesson, LessonStatus, Student } from '../../shared/types'
import { Button } from '@/components/ui/button'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function todayIsoDate() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function dayBounds(isoDate: string) {
  const start = new Date(`${isoDate}T00:00:00`)
  const end = new Date(`${isoDate}T23:59:59.999`)
  return { start, end }
}

function combineDateAndTime(isoDate: string, time: string) {
  return new Date(`${isoDate}T${time}:00`)
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

export function SchedulePanel() {
  const [date, setDate] = useState(todayIsoDate())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])

  const [studentId, setStudentId] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('15:30')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refreshLessons() {
    const { start, end } = dayBounds(date)
    setLessons(await api.lessons.list({ start: start.toISOString(), end: end.toISOString() }))
  }

  useEffect(() => {
    api.students.list().then(setStudents)
    api.instructors.list().then(setInstructors)
  }, [])

  useEffect(() => {
    refreshLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => {
    if (!studentId && students.length > 0) setStudentId(students[0].id)
    if (!instructorId && instructors.length > 0) setInstructorId(instructors[0].id)
  }, [students, instructors, studentId, instructorId])

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!studentId || !instructorId) {
      setError('Add a student and an instructor first.')
      return
    }
    try {
      await api.lessons.create({
        studentId,
        instructorId,
        startTime: combineDateAndTime(date, startTime).toISOString(),
        endTime: combineDateAndTime(date, endTime).toISOString(),
        notes: notes.trim() || null,
      })
      setNotes('')
      await refreshLessons()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleStatus(id: string, status: LessonStatus) {
    await api.lessons.updateStatus(id, status)
    await refreshLessons()
  }

  async function handleDelete(id: string) {
    await api.lessons.delete(id)
    await refreshLessons()
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Schedule</h2>
      <div className="mb-4 flex items-center gap-2">
        <Label htmlFor="schedule-date">Date</Label>
        <Input
          id="schedule-date"
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={handleSchedule}>
        <Select value={studentId} onValueChange={setStudentId} disabled={students.length === 0}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="No students yet" />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={instructorId} onValueChange={setInstructorId} disabled={instructors.length === 0}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="No instructors yet" />
          </SelectTrigger>
          <SelectContent>
            {instructors.map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.firstName} {i.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="time" className="w-auto" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <span className="text-muted-foreground">to</span>
        <Input type="time" className="w-auto" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <Input className="w-48" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button type="submit">Schedule Lesson</Button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Instructor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessons.map((l) => (
            <TableRow key={l.id} className={l.status === 'cancelled' ? 'cancelled-row' : ''}>
              <TableCell>
                {new Date(l.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(l.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </TableCell>
              <TableCell>{l.student.firstName} {l.student.lastName}</TableCell>
              <TableCell>{l.instructor.firstName} {l.instructor.lastName}</TableCell>
              <TableCell>
                <Select value={l.status} onValueChange={(v) => handleStatus(l.id, v as LessonStatus)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>{l.notes ?? '—'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => handleDelete(l.id)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
          {lessons.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center italic text-muted-foreground">No lessons scheduled for this day.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
