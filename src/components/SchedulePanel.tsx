import { useEffect, useRef, useState } from 'react'
import { Repeat } from 'lucide-react'
import { api } from '../api'
import type { BusinessHours, Instructor, Lesson, LessonStatus, Student } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

function dayOfWeekFromIsoDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).getDay()
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const DAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type ScheduleRow =
  | { kind: 'lesson'; lesson: Lesson }
  | { kind: 'gap'; start: Date; end: Date }

function buildScheduleRows(dayStart: Date, dayEnd: Date, lessons: Lesson[]): ScheduleRow[] {
  const sorted = [...lessons].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )
  const rows: ScheduleRow[] = []
  let cursor = dayStart
  for (const lesson of sorted) {
    const start = new Date(lesson.startTime)
    const end = new Date(lesson.endTime)
    if (start > cursor) {
      const gapEnd = start < dayEnd ? start : dayEnd
      if (gapEnd > cursor) rows.push({ kind: 'gap', start: cursor, end: gapEnd })
    }
    rows.push({ kind: 'lesson', lesson })
    const advanceTo = lesson.status === 'cancelled' ? start : end
    if (advanceTo > cursor) cursor = advanceTo
  }
  if (cursor < dayEnd) rows.push({ kind: 'gap', start: cursor, end: dayEnd })
  return rows
}

export function SchedulePanel() {
  const [date, setDate] = useState(todayIsoDate())
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([])

  const [studentId, setStudentId] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [startTime, setStartTime] = useState('15:00')
  const [endTime, setEndTime] = useState('15:30')
  const [notes, setNotes] = useState('')
  const [repeatsWeekly, setRepeatsWeekly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const skipNextBlurSaveRef = useRef(false)

  async function refreshLessons() {
    if (!instructorId) {
      setLessons([])
      return
    }
    const { start, end } = dayBounds(date)
    setLessons(
      await api.lessons.list({ instructorId, start: start.toISOString(), end: end.toISOString() }),
    )
  }

  useEffect(() => {
    api.students.list().then(setStudents)
    api.instructors.list().then(setInstructors)
    api.businessHours.list().then(setBusinessHours)
  }, [])

  useEffect(() => {
    refreshLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, instructorId])

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
      if (repeatsWeekly) {
        await api.recurringSeries.create({
          studentId,
          instructorId,
          startDate: date,
          startTime,
          endTime,
          notes: notes.trim() || null,
        })
      } else {
        await api.lessons.create({
          studentId,
          instructorId,
          startTime: combineDateAndTime(date, startTime).toISOString(),
          endTime: combineDateAndTime(date, endTime).toISOString(),
          notes: notes.trim() || null,
        })
      }
      setNotes('')
      setRepeatsWeekly(false)
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

  async function handleEndSeries(lesson: Lesson) {
    if (!lesson.recurringSeriesId) return
    await api.recurringSeries.endFrom(lesson.recurringSeriesId, lesson.startTime)
    await refreshLessons()
  }

  function startEditingNotes(lesson: Lesson) {
    setEditingNotesId(lesson.id)
    setNotesDraft(lesson.notes ?? '')
  }

  function cancelEditingNotes() {
    skipNextBlurSaveRef.current = true
    setEditingNotesId(null)
  }

  async function saveNotes(id: string) {
    if (skipNextBlurSaveRef.current) {
      skipNextBlurSaveRef.current = false
      return
    }
    setEditingNotesId(null)
    await api.lessons.update(id, { notes: notesDraft.trim() || null })
    await refreshLessons()
  }

  const hoursForDay = businessHours.find((h) => h.dayOfWeek === dayOfWeekFromIsoDate(date))
  const scheduleRows =
    hoursForDay && !hoursForDay.isClosed
      ? buildScheduleRows(
          combineDateAndTime(date, hoursForDay.openTime),
          combineDateAndTime(date, hoursForDay.closeTime),
          lessons,
        )
      : lessons
          .slice()
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          .map((lesson): ScheduleRow => ({ kind: 'lesson', lesson }))

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Schedule</h2>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="schedule-date">Date</Label>
          <Input
            id="schedule-date"
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>Instructor</Label>
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
        </div>
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
        <Input type="time" className="w-auto" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <span className="text-muted-foreground">to</span>
        <Input type="time" className="w-auto" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <Input className="w-48" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={repeatsWeekly} onCheckedChange={(checked) => setRepeatsWeekly(checked === true)} />
          Repeats weekly
        </label>
        <Button type="submit">Schedule Lesson</Button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {hoursForDay?.isClosed && (
        <p className="mb-4 text-sm text-muted-foreground">
          Studio is marked closed on {DAY_LABEL[hoursForDay.dayOfWeek]}s — showing booked lessons only.
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scheduleRows.map((row) =>
            row.kind === 'gap' ? (
              <TableRow key={`gap-${row.start.toISOString()}`}>
                <TableCell className="text-muted-foreground">
                  {formatTime(row.start)} – {formatTime(row.end)}
                </TableCell>
                <TableCell colSpan={4} className="italic text-muted-foreground">Available</TableCell>
              </TableRow>
            ) : (
              <TableRow key={row.lesson.id} className={row.lesson.status === 'cancelled' ? 'cancelled-row' : ''}>
                <TableCell>
                  {formatTime(new Date(row.lesson.startTime))} – {formatTime(new Date(row.lesson.endTime))}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    {row.lesson.recurringSeriesId && (
                      <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Recurring lesson" />
                    )}
                    {row.lesson.student.firstName} {row.lesson.student.lastName}
                  </span>
                </TableCell>
                <TableCell>
                  <Select value={row.lesson.status} onValueChange={(v) => handleStatus(row.lesson.id, v as LessonStatus)}>
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
                <TableCell>
                  {editingNotesId === row.lesson.id ? (
                    <Input
                      autoFocus
                      className="h-7 w-40"
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={() => saveNotes(row.lesson.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveNotes(row.lesson.id)
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelEditingNotes()
                        }
                      }}
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer hover:underline"
                      onClick={() => startEditingNotes(row.lesson)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') startEditingNotes(row.lesson)
                      }}
                    >
                      {row.lesson.notes || <span className="italic text-muted-foreground">Add note</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {row.lesson.recurringSeriesId && (
                      <Button variant="outline" size="sm" onClick={() => handleEndSeries(row.lesson)}>End series</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleDelete(row.lesson.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ),
          )}
          {scheduleRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center italic text-muted-foreground">No lessons scheduled for this day.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
