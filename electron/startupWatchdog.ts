// A last-resort guard against the app getting wedged during startup with no
// window and no error — the single worst failure to hit at a front desk,
// because it's indistinguishable from a working-but-slow app. It was seen once
// under rapid kill/relaunch cycling (a Chromium SingletonLock teardown race),
// never reproduced, and it isn't fixable in our code: the race lives in
// Electron's single-instance machinery, not ours. So rather than chase it, we
// bound its *symptom* — if startup hasn't finished within the timeout, say so
// and exit non-zero, turning "hangs forever, looks broken" into "visible
// failure the user can retry", which a clean relaunch clears.
//
// The Electron bits (showing a dialog, exiting) are injected via `onTimeout`
// so this stays a pure function the unit tests can drive with fake timers.

export type StartupWatchdogOptions = {
  timeoutMs: number
  // Checked when the timer fires, as a guard against a spurious action if
  // startup finished in the same tick the timer was already queued for.
  isComplete: () => boolean
  onTimeout: () => void
}

// Returns a disarm function to call once startup has finished. The caller must
// arm this *before* `app.whenReady()`: the failure hypothesis is that
// `whenReady()` never resolves, so a watchdog set up inside that callback would
// never fire in exactly the case it exists for.
export function armStartupWatchdog({ timeoutMs, isComplete, onTimeout }: StartupWatchdogOptions): () => void {
  const handle = setTimeout(() => {
    if (isComplete()) return
    onTimeout()
  }, timeoutMs)
  return () => clearTimeout(handle)
}
