import { useState } from 'react'
import './App.css'
import { StudentsPanel } from './components/StudentsPanel'
import { InstructorsPanel } from './components/InstructorsPanel'
import { SchedulePanel } from './components/SchedulePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Button } from '@/components/ui/button'

const TABS = ['Schedule', 'Students', 'Instructors', 'Settings'] as const
type Tab = (typeof TABS)[number]

function App() {
  const [tab, setTab] = useState<Tab>('Schedule')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kumite</h1>
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <Button
              key={t}
              variant={t === tab ? 'default' : 'ghost'}
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'Schedule' && <SchedulePanel />}
        {tab === 'Students' && <StudentsPanel />}
        {tab === 'Instructors' && <InstructorsPanel />}
        {tab === 'Settings' && <SettingsPanel />}
      </main>
    </div>
  )
}

export default App
