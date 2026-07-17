import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Instructor, Lesson, LessonStatus, Student } from '../../shared/types'

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
      <h2>Schedule</h2>
      <div className="schedule-date">
        <label>
          Date{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <form className="inline-form" onSubmit={handleSchedule}>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.length === 0 && <option value="">No students yet</option>}
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          {instructors.length === 0 && <option value="">No instructors yet</option>}
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>
          ))}
        </select>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <span>to</span>
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit">Schedule Lesson</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Student</th>
            <th>Instructor</th>
            <th>Status</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            <tr key={l.id} className={l.status === 'cancelled' ? 'cancelled-row' : ''}>
              <td>
                {new Date(l.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(l.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>{l.student.firstName} {l.student.lastName}</td>
              <td>{l.instructor.firstName} {l.instructor.lastName}</td>
              <td>
                <select value={l.status} onChange={(e) => handleStatus(l.id, e.target.value as LessonStatus)}>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </td>
              <td>{l.notes ?? '—'}</td>
              <td><button onClick={() => handleDelete(l.id)}>Delete</button></td>
            </tr>
          ))}
          {lessons.length === 0 && (
            <tr><td colSpan={6} className="empty">No lessons scheduled for this day.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
