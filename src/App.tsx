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
          <nav className="flex flex-wrap gap-2">
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
          </nav>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setHelpOpen(true)} aria-label="Help">
                <HelpCircle />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help</TooltipContent>
          </Tooltip>
        </header>
        <main>
          {tab === 'Dashboard' && <DashboardPanel />}
          {tab === 'Schedule' && <SchedulePanel />}
          {tab === 'Students' && <StudentsPanel />}
          {tab === 'Instructors' && <InstructorsPanel />}
          {tab === 'Certificates' && <CertificatesPanel />}
          {tab === 'POS' && <PosPanel />}
          {tab === 'Reports' && <ReportsPanel />}
          {tab === 'Settings' && <SettingsPanel />}
        </main>
        <Toaster />
        <HelpPanel open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  )
}

export default App
