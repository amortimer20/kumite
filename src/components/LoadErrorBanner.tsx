import { Button } from '@/components/ui/button'

// Shared "couldn't load" state for a panel's initial fetch. Distinct from the
// global unhandledrejection toast (src/main.tsx): that's a one-time, easy-to-
// miss notification, whereas a failed initial load needs to replace whatever
// confidently-empty content would otherwise render in its place (e.g. "0
// Active students" or "No instructors yet" when the real answer is "unknown,
// the fetch failed") — so this renders inline and stays up until Retry works.
export function LoadErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  )
}
