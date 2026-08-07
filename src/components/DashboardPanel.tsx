import { useEffect, useState } from 'react'
import { CalendarDays, DollarSign, UserPlus, Users } from 'lucide-react'
import { api } from '../api'
import type { Instructor, Lesson, Report, Student, StudentMembershipWithStudent } from '../../shared/types'
import { LoadErrorBanner } from './LoadErrorBanner'
import { StudentMembershipDialog } from './StudentMembershipDialog'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { getErrorMessage } from '@/lib/errors'
import { endOfMonthIso, startOfMonthIso, todayIso } from '@/lib/isoDate'
import { STATUS_LABEL } from '@/lib/lessonStatus'
import { MEMBERSHIP_STATUS_COLOR, MEMBERSHIP_STATUS_LABEL, formatCents } from '@/lib/membershipFormat'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatFullDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function todayBounds() {
  const iso = todayIso()
  return { start: new Date(`${iso}T00:00:00`), end: new Date(`${iso}T23:59:59.999`) }
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex min-w-40 flex-1 items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
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

function MembershipRow({
  membership,
  onRecordPayment,
}: {
  membership: StudentMembershipWithStudent
  onRecordPayment: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        <p className="truncate">{membership.student.firstName} {membership.student.lastName}</p>
        <p className="truncate text-xs text-muted-foreground">{membership.plan.title} — {formatCents(membership.effectivePriceCents)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className={`text-xs font-medium ${MEMBERSHIP_STATUS_COLOR[membership.status]}`}>{MEMBERSHIP_STATUS_LABEL[membership.status]}</p>
          <p className="text-xs text-muted-foreground">
            {membership.amountOwedCents > 0
              ? `${formatCents(membership.amountOwedCents)} owed`
              : `Due ${formatDate(membership.nextDueDate)}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRecordPayment}>Record Payment</Button>
      </div>
    </div>
  )
}

export function DashboardPanel() {
  const [students, setStudents] = useState<Student[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [memberships, setMemberships] = useState<StudentMembershipWithStudent[]>([])
  const [monthReport, setMonthReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedFlag(loading)
  // If any of the four parallel fetches below reject, the others' setters
  // still run — leaving stale-but-plausible numbers rather than the confident
  // "0 Active students, $0.00 Collected this month" a totally blank state
  // would show. loadError surfaces that the figures on screen may be wrong,
  // instead of nothing saying so at all.
  const [loadError, setLoadError] = useState<string | null>(null)

  const [paymentStudent, setPaymentStudent] = useState<StudentMembershipWithStudent['student'] | null>(null)

  async function refresh() {
    const { start, end } = todayBounds()
    const [studentsResult, lessonsResult, membershipsResult, reportResult] = await Promise.all([
      api.students.list(),
      api.lessons.list({ start: start.toISOString(), end: end.toISOString() }),
      api.studentMemberships.listActive(),
      // Deliberately the same query the Reports tab runs, so the two screens
      // can't disagree. Summing active memberships' payments here instead
      // silently excluded POS sales entirely, and dropped a month's payments
      // retroactively the moment a membership was cancelled or archived.
      api.reports.generate({ startDate: startOfMonthIso(), endDate: endOfMonthIso() }),
    ])
    setStudents(studentsResult)
    setLessons(lessonsResult)
    setMemberships(membershipsResult)
    setMonthReport(reportResult)
  }

  async function reload() {
    try {
      await refresh()
      setLoadError(null)
    } catch (err) {
      setLoadError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeStudentCount = students.filter((s) => s.active).length
  const collectedThisMonthCents = monthReport
    ? monthReport.membership.totalCents + monthReport.pos.totalCents
    : 0

  const todayLabel = formatFullDate(todayIso())
  const instructorGroups = groupByInstructor(lessons)
  const overdue = memberships
    .filter((m) => m.status === 'overdue')
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())
  const due = memberships
    .filter((m) => m.status === 'due')
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())
  const dueSoon = memberships
    .filter((m) => m.status === 'due_soon')
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Dashboard</h2>
      {loadError && !loading ? (
        <LoadErrorBanner message={`Couldn't load the dashboard: ${loadError}`} onRetry={reload} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            {showSkeleton ? (
              <>
                <Skeleton className="h-[60px] min-w-40 flex-1" />
                <Skeleton className="h-[60px] min-w-40 flex-1" />
                <Skeleton className="h-[60px] min-w-40 flex-1" />
              </>
            ) : (
              <>
                <StatTile icon={Users} label="Active students" value={String(activeStudentCount)} />
                <StatTile icon={CalendarDays} label="Lessons today" value={String(lessons.length)} />
                <StatTile icon={DollarSign} label="Collected this month" value={formatCents(collectedThisMonthCents)} />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-72 flex-1 rounded-lg border border-border bg-card p-3">
              <h3 className="font-medium">Today's Schedule</h3>
              <p className="mb-2 text-xs text-muted-foreground">{todayLabel}</p>
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
                              {lesson.type === 'intro' && <UserPlus className="size-3.5 shrink-0 text-muted-foreground" aria-label="Intro lesson" />}
                              {lesson.type === 'group'
                                ? lesson.title
                                : lesson.type === 'intro'
                                  ? lesson.prospectName
                                  : `${lesson.student?.firstName} ${lesson.student?.lastName}`}
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
              ) : overdue.length === 0 && due.length === 0 && dueSoon.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">All memberships are up to date.</p>
              ) : (
                <div className="space-y-4">
                  {overdue.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-destructive">Overdue ({overdue.length})</p>
                      <div className="divide-y divide-border">
                        {overdue.map((m) => (
                          <MembershipRow key={m.id} membership={m} onRecordPayment={() => setPaymentStudent(m.student)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {due.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-orange-500">Due ({due.length})</p>
                      <div className="divide-y divide-border">
                        {due.map((m) => (
                          <MembershipRow key={m.id} membership={m} onRecordPayment={() => setPaymentStudent(m.student)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {dueSoon.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-amber-500">Due soon ({dueSoon.length})</p>
                      <div className="divide-y divide-border">
                        {dueSoon.map((m) => (
                          <MembershipRow key={m.id} membership={m} onRecordPayment={() => setPaymentStudent(m.student)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <StudentMembershipDialog
        student={paymentStudent}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentStudent(null)
            reload()
          }
        }}
      />
    </div>
  )
}
