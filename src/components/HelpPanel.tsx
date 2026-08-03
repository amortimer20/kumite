import { useState } from 'react'
import {
  Award,
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Settings as SettingsIcon,
  ShoppingCart,
  UserCog,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Kept in sync with each panel by hand — when you change what a panel does,
// update its section here in the same commit, so this never drifts out of
// date the way a separate help doc would.
const HELP_SECTIONS = ['dashboard', 'schedule', 'students', 'instructors', 'certificates', 'pos', 'reports', 'settings'] as const
type HelpSection = (typeof HELP_SECTIONS)[number]

const HELP_SECTION_LABEL: Record<HelpSection, string> = {
  dashboard: 'Dashboard',
  schedule: 'Schedule',
  students: 'Students',
  instructors: 'Instructors',
  certificates: 'Certificates',
  pos: 'POS',
  reports: 'Reports',
  settings: 'Settings',
}

const HELP_SECTION_ICON: Record<HelpSection, typeof CalendarDays> = {
  dashboard: LayoutDashboard,
  schedule: CalendarDays,
  students: Users,
  instructors: UserCog,
  certificates: Award,
  pos: ShoppingCart,
  reports: BarChart3,
  settings: SettingsIcon,
}

export function HelpPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [section, setSection] = useState<HelpSection>('dashboard')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] sm:max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-6">
          <nav className="flex w-48 shrink-0 flex-col gap-1">
            {HELP_SECTIONS.map((s) => {
              const Icon = HELP_SECTION_ICON[s]
              return (
                <Button
                  key={s}
                  variant={s === section ? 'default' : 'ghost'}
                  className="justify-start"
                  onClick={() => setSection(s)}
                >
                  <Icon />
                  {HELP_SECTION_LABEL[s]}
                </Button>
              )
            })}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto pr-2">
            {section === 'dashboard' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  A read-only overview of the studio's day. The three tiles at the top show active
                  students, lessons scheduled for today, and membership dues collected this month.
                </p>
                <p>
                  <strong>Today's Schedule</strong> lists today's lessons grouped by instructor, with an
                  icon showing whether each is a private, group, or intro lesson.
                </p>
                <p>
                  <strong>Membership Health</strong> lists memberships that are overdue or due soon.
                  Click <strong>Record Payment</strong> on any row to log a payment without leaving the
                  Dashboard.
                </p>
              </div>
            )}
            {section === 'schedule' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Pick a date and instructor to see and book that day's lessons. The lesson form supports
                  three types: <strong>Private</strong> (tied to a student), <strong>Group</strong> (a
                  class with a title, no per-student roster), and <strong>Intro</strong> (a free trial for
                  a prospect — just a name and optional phone number, no full Student profile needed).
                </p>
                <p>
                  Check <strong>Repeats weekly</strong> to create a recurring series. Intro lessons can't
                  repeat — they're one-off by design.
                </p>
                <p>
                  Each row in the day's table supports inline status changes and inline notes editing
                  (click to edit). Deleting a lesson that's part of a recurring series asks whether to
                  delete just that one lesson or it and every future one in the series.
                </p>
              </div>
            )}
            {section === 'students' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Search and filter students, including a toggle to show archived (inactive) students.
                  <strong> Add Student</strong> opens a form for contact info, address, rank, and
                  member-since date — signing requires agreeing to the Release &amp; Indemnity waiver
                  shown in the form.
                </p>
                <p>
                  Each row has <strong>Details</strong> (read-only info, including family members),
                  <strong> Membership</strong> (assign a plan or record a payment), and a menu for
                  <strong> Lessons</strong> (that student's lesson history), <strong>Edit</strong> (full
                  edit form, plus adding/removing family members and changing rank), and
                  <strong> Delete</strong>.
                </p>
                <p>
                  Deleting a student with lesson history archives them instead of a permanent delete, so
                  their past lessons and certificates stay intact — you'll be offered the choice.
                </p>
              </div>
            )}
            {section === 'instructors' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Search instructors and toggle showing archived ones. <strong>Add Instructor</strong>{' '}
                  takes a name, email, and phone number. Each row has Details, Edit, and Delete.
                </p>
                <p>
                  Deleting an instructor with upcoming lessons warns you that those lessons will also be
                  deleted. An instructor with past lesson history is archived instead of permanently
                  deleted, same as students.
                </p>
              </div>
            )}
            {section === 'certificates' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Print a rank certificate for a student (or one of their family members). Pick a
                  certificate type — <strong>Regular</strong> or <strong>Junior</strong> — and the rank
                  list narrows to the ranks available for that type.
                </p>
                <p>
                  <strong>Print Certificate</strong> generates a PDF and opens it in the system PDF
                  viewer, ready to print.
                </p>
              </div>
            )}
            {section === 'pos' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  A simple point-of-sale for merchandise. Click items in the catalog grid to add them to
                  the cart, adjust quantities, optionally attach a student (or leave it as a walk-in sale),
                  choose a payment method, and complete the sale.
                </p>
                <p>
                  <strong>Recent Sales</strong> below lists past sales with a delete option for a mis-rung
                  sale.
                </p>
                <p>
                  <strong>Manage Items</strong> lets you add, edit, delete, archive, and reactivate catalog
                  items. An item that's already been sold is archived instead of deleted, so past sales
                  keep their item name intact.
                </p>
              </div>
            )}
            {section === 'reports' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Generate a revenue report for a date range — use a quick preset (This Month, Last Month,
                  This Year) or a custom range.
                </p>
                <p>
                  The report shows combined revenue plus separate Membership Dues and POS Sales
                  breakdowns, each of which can be toggled on or off, and a table broken down by payment
                  method.
                </p>
                <p>
                  <strong>Export CSV</strong> saves the report to a file for spreadsheets or
                  record-keeping.
                </p>
              </div>
            )}
            {section === 'settings' && (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  <strong>Business Hours</strong> sets each day's open/close time (or marks it closed) —
                  used on the Schedule tab to show open slots between lessons.
                </p>
                <p>
                  <strong>Membership Plans</strong> lists every plan's title, billing frequency, price,
                  and included private lessons, and lets you add, edit, or delete plans. A plan with
                  students on it is archived instead of deleted.
                </p>
                <p>
                  <strong>Backup &amp; Restore</strong> lets you export or restore a backup file manually,
                  and also configure automatic backups to a folder of your choice on a schedule.
                </p>
                <p>
                  <strong>About</strong> shows the installed app version and the database file's location
                  on disk.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
