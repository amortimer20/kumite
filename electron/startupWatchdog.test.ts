import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armStartupWatchdog } from './startupWatchdog'

describe('armStartupWatchdog', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires onTimeout when startup has not completed in time', () => {
    const onTimeout = vi.fn()
    armStartupWatchdog({ timeoutMs: 30_000, isComplete: () => false, onTimeout })

    vi.advanceTimersByTime(30_000)

    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('does not fire before the timeout elapses', () => {
    const onTimeout = vi.fn()
    armStartupWatchdog({ timeoutMs: 30_000, isComplete: () => false, onTimeout })

    vi.advanceTimersByTime(29_999)

    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('does not fire once disarmed — the normal successful-startup path', () => {
    const onTimeout = vi.fn()
    const disarm = armStartupWatchdog({ timeoutMs: 30_000, isComplete: () => false, onTimeout })

    disarm()
    vi.advanceTimersByTime(60_000)

    expect(onTimeout).not.toHaveBeenCalled()
  })

  // Belt-and-suspenders: if startup finishes in the same tick the timer was
  // already queued for, the isComplete guard stops a spurious close.
  it('does not act if startup completed just as the timer fired', () => {
    let complete = false
    const onTimeout = vi.fn()
    armStartupWatchdog({ timeoutMs: 30_000, isComplete: () => complete, onTimeout })

    complete = true
    vi.advanceTimersByTime(30_000)

    expect(onTimeout).not.toHaveBeenCalled()
  })
})
