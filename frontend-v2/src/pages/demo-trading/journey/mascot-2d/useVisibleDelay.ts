import { useEffect, useRef, useState } from "react"

/** Presentation-only clock: preserves elapsed time through visibility pauses. */
export function useVisibleDelay(key: string, duration: number, enabled: boolean, onComplete: () => void) {
  const callback = useRef(onComplete)
  const [completedKey, setCompletedKey] = useState("")
  const clock = useRef({ key, duration, remaining: duration })
  useEffect(() => { callback.current = onComplete }, [onComplete])
  useEffect(() => {
    if (clock.current.key !== key || clock.current.duration !== duration) clock.current = { key, duration, remaining: duration }
    if (!enabled || completedKey === key) return
    const current = clock.current
    const started = performance.now()
    const timer = setTimeout(() => { setCompletedKey(key); callback.current() }, current.remaining)
    return () => { clearTimeout(timer); current.remaining = Math.max(0, current.remaining - (performance.now() - started)) }
  }, [key, duration, enabled, completedKey])
  return completedKey === key
}
