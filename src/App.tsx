import { useState } from 'react'
import { CalendarDays, Users, UserCog, Award, Settings } from 'lucide-react'
import './App.css'
import { StudentsPanel } from './components/StudentsPanel'
import { InstructorsPanel } from './components/InstructorsPanel'
import { SchedulePanel } from './components/SchedulePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { CertificatesPanel } from './components/CertificatesPanel'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'

const TABS = ['Schedule', 'Students', 'Instructors', 'Certificates', 'Settings'] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, typeof CalendarDays> = {
  Schedule: CalendarDays,
  Students: Users,
  Instructors: UserCog,
  Certificates: Award,
  Settings: Settings,
}

function App() {
  const [tab, setTab] = useState<Tab>('Schedule')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kumite</h1>
        <nav className="flex gap-2">
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
      </header>
      <main>
        {tab === 'Schedule' && <SchedulePanel />}
        {tab === 'Students' && <StudentsPanel />}
        {tab === 'Instructors' && <InstructorsPanel />}
        {tab === 'Certificates' && <CertificatesPanel />}
        {tab === 'Settings' && <SettingsPanel />}
      </main>
      <Toaster />
    </div>
  )
}

export default App
