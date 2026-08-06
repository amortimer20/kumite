import React from 'react'
import ReactDOM from 'react-dom/client'
import { toast } from 'sonner'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { getErrorMessage } from './lib/errors.ts'
import './index.css'

// Safety net for rejected promises that no local handler caught. Most mutating
// api.* calls are wrapped in try/catch + toast, but the ones that aren't would
// otherwise fail with no feedback at all — the click just appears to do
// nothing. This surfaces those as a toast (the console error is left intact for
// diagnostics). A local catch prevents the rejection from reaching here, so
// this never double-reports.
window.addEventListener('unhandledrejection', (event) => {
  toast.error(getErrorMessage(event.reason))
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Last resort: App.tsx has its own boundary around the panels, so this
        only catches a crash in the shell itself. Without it, that case is a
        blank window. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
