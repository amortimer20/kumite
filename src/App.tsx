import { useState } from 'react'
import './App.css'
import { StudentsPanel } from './components/StudentsPanel'
import { InstructorsPanel } from './components/InstructorsPanel'
import { SchedulePanel } from './components/SchedulePanel'

const TABS = ['Schedule', 'Students', 'Instructors'] as const
type Tab = (typeof TABS)[number]

function App() {
  const [tab, setTab] = useState<Tab>('Schedule')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kumite</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={t === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'Schedule' && <SchedulePanel />}
        {tab === 'Students' && <StudentsPanel />}
        {tab === 'Instructors' && <InstructorsPanel />}
      </main>
    </div>
  )
}

export default App
