import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// A render-time throw anywhere under here would otherwise blank the entire
// window with no message and no way back — the worst possible failure at a
// front desk, because it looks identical to the app being broken beyond use.
// This has to be a class component: componentDidCatch has no hook equivalent.
//
// Used twice (see App.tsx and main.tsx): once around the panel area keyed by
// the active tab, so a crash in one panel leaves the navigation working and
// switching tabs clears it, and once around the whole app as a last resort so
// a crash outside the panels still says something.
interface Props {
  children: ReactNode
  // Shown instead of the generic wording when the failure is known to be
  // confined to part of the screen.
  scope?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept so the component stack is recoverable from the devtools console,
    // which is the only diagnostic available in a packaged build.
    console.error('Unhandled error in the interface:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="panel">
        <div className="mx-auto mt-8 max-w-lg rounded-lg border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            {this.props.scope
              ? `The ${this.props.scope} screen ran into a problem and couldn't be displayed. Your data has not been changed — you can switch to another tab, or reload the app.`
              : 'Kumite ran into a problem and could not continue. Your data has not been changed.'}
          </p>
          <p className="mb-4 rounded border border-border bg-muted/40 p-2 font-mono text-xs break-words text-muted-foreground">
            {error.message || String(error)}
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={this.handleReload}>Reload Kumite</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            If this keeps happening, send the message above to whoever set up Kumite for you.
          </p>
        </div>
      </div>
    )
  }
}
