import { useState } from 'react'
import { CalendarDays, LayoutDashboard, Users, UserCog, Award, Settings, ShoppingCart, BarChart3, HelpCircle } from 'lucide-react'
import './App.css'
import { DashboardPanel } from './components/DashboardPanel'
import { StudentsPanel } from './components/StudentsPanel'
import { InstructorsPanel } from './components/InstructorsPanel'
import { SchedulePanel } from './components/SchedulePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { CertificatesPanel } from './components/CertificatesPanel'
import { PosPanel } from './components/PosPanel'
import { ReportsPanel } from './components/ReportsPanel'
import { HelpPanel } from './components/HelpPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const TABS = ['Dashboard', 'Schedule', 'Students', 'Instructors', 'Certificates', 'POS', 'Reports', 'Settings'] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, typeof CalendarDays> = {
  Dashboard: LayoutDashboard,
  Schedule: CalendarDays,
  Students: Users,
  Instructors: UserCog,
  Certificates: Award,
  POS: ShoppingCart,
  Reports: BarChart3,
  Settings: Settings,
}

function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="app">
        <header className="app-header">
          <h1>Kumite</h1>
          <nav className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => {
              const Icon = TAB_ICONS[t]
              return (
                <Button
                  key={t}
                  variant={t === tab ? 'default' : 'ghost'}
                  onClick={() => setTab(t)}
                >
                  <Icon />
                  {t}
                </Button>
              )
            })}
            {/* Help lives at the end of the nav (not as a separate header child)
                so it flows and wraps with the tab buttons instead of dropping to
                a row of its own. Icon-only to stay compact next to the tabs. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} aria-label="Help">
                  <HelpCircle />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Help</TooltipContent>
            </Tooltip>
          </nav>
        </header>
        <main>
          {/* Keyed by tab so the boundary remounts (and clears any caught
              error) when the user switches tabs — a crash in one panel leaves
              the rest of the app usable instead of needing a reload. */}
          <ErrorBoundary key={tab} scope={tab}>
            {tab === 'Dashboard' && <DashboardPanel />}
            {tab === 'Schedule' && <SchedulePanel />}
            {tab === 'Students' && <StudentsPanel />}
            {tab === 'Instructors' && <InstructorsPanel />}
            {tab === 'Certificates' && <CertificatesPanel />}
            {tab === 'POS' && <PosPanel />}
            {tab === 'Reports' && <ReportsPanel />}
            {tab === 'Settings' && <SettingsPanel />}
          </ErrorBoundary>
        </main>
        <Toaster />
        <HelpPanel open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  )
}

export default App
