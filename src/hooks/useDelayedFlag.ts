import { useEffect, useState } from 'react'

// Avoids flashing a loading skeleton for fetches that resolve almost
// instantly (e.g. local SQLite over IPC) — only shows once `active` has
// been true for longer than `delayMs`.
export function useDelayedFlag(active: boolean, delayMs = 150) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return show
}
