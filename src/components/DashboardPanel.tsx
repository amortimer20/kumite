import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { api } from '../api'
import type { Instructor, Lesson, StudentMembershipWithStudent } from '../../shared/types'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { todayIso } from '@/lib/isoDate'
import { STATUS_LABEL } from '@/lib/lessonStatus'
import { MEMBERSHIP_STATUS_COLOR, MEMBERSHIP_STATUS_LABEL, formatCents } from '@/lib/membershipFormat'
import { Skeleton } from '@/components/ui/skeleton'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function todayBounds() {
  const iso = todayIso()
  return { start: new Date(`${iso}T00:00:00`), end: new Date(`${iso}T23:59:59.999`) }
}

type InstructorGroup = { instructor: Instructor; lessons: Lesson[] }

function groupByInstructor(lessons: Lesson[]): InstructorGroup[] {
  const groups = new Map<string, InstructorGroup>()
  for (const lesson of lessons) {
    if (!groups.has(lesson.instructorId)) {
      groups.set(lesson.instructorId, { instructor: lesson.instructor, lessons: [] })
    }
    groups.get(lesson.instructorId)!.lessons.push(lesson)
  }
  for (const group of groups.values()) {
    group.lessons.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }
  return [...groups.values()].sort((a, b) =>
    `${a.instructor.lastName}${a.instructor.firstName}`.localeCompare(`${b.instructor.lastName}${b.instructor.firstName}`),
  )
}

function MembershipRow({ membership }: { membership: StudentMembershipWithStudent }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate">{membership.student.firstName} {membership.student.lastName}</p>
        <p className="truncate text-xs text-muted-foreground">{membership.plan.title} — {formatCents(membership.effectivePriceCents)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs font-medium ${MEMBERSHIP_STATUS_COLOR[membership.status]}`}>{MEMBERSHIP_STATUS_LABEL[membership.status]}</p>
        <p className="text-xs text-muted-foreground">
          {membership.amountOwedCents > 0
            ? `${formatCents(membership.amountOwedCents)} owed`
            : `Due ${formatDate(membership.nextDueDate)}`}
        </p>
      </div>
    </div>
  )
}

export function DashboardPanel() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [memberships, setMemberships] = useState<StudentMembershipWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)

  useEffect(() => {
    const { start, end } = todayBounds()
    Promise.all([
      api.lessons.list({ start: start.toISOString(), end: end.toISOString() }),
      api.studentMemberships.listActive(),
    ])
      .then(([lessonsResult, membershipsResult]) => {
        setLessons(lessonsResult)
        setMemberships(membershipsResult)
      })
      .finally(() => setLoading(false))
  }, [])

  const instructorGroups = groupByInstructor(lessons)
  const overdue = memberships
    .filter((m) => m.status === 'overdue')
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())
  const dueSoon = memberships
    .filter((m) => m.status === 'due_soon')
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Dashboard</h2>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-72 flex-1 rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 font-medium">Today's Schedule</h3>
          {showSkeleton ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : instructorGroups.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No lessons scheduled for today.</p>
          ) : (
            <div className="space-y-4">
              {instructorGroups.map((group) => (
                <div key={group.instructor.id}>
                  <p className="mb-1 text-sm font-medium text-muted-foreground">
                    {group.instructor.firstName} {group.instructor.lastName}
                  </p>
                  <div className="space-y-1">
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                          {lesson.type === 'group' && <Users className="size-3.5 shrink-0 text-muted-foreground" aria-label="Group class" />}
                          {lesson.type === 'group' ? lesson.title : `${lesson.student?.firstName} ${lesson.student?.lastName}`}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(lesson.startTime)} · {STATUS_LABEL[lesson.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-72 flex-1 rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 font-medium">Membership Health</h3>
          {showSkeleton ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : overdue.length === 0 && dueSoon.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">All memberships are up to date.</p>
          ) : (
            <div className="space-y-4">
              {overdue.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-destructive">Overdue ({overdue.length})</p>
                  <div className="divide-y divide-border">
                    {overdue.map((m) => <MembershipRow key={m.id} membership={m} />)}
                  </div>
                </div>
              )}
              {dueSoon.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-amber-500">Due soon ({dueSoon.length})</p>
                  <div className="divide-y divide-border">
                    {dueSoon.map((m) => <MembershipRow key={m.id} membership={m} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
