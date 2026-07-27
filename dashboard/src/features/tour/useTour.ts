import { useEffect, useRef, useState } from "react"
import type { TourConfig, TourStep } from "./tourTypes"

export interface UseTourOptions {
  /** Fires on "Hoàn thành ✓" (last step) AND on "Bỏ qua tour" — skip counts as complete (spec). */
  onComplete: () => void
  /** Fires whenever a step becomes visible: on `start()` (index 0) and after every `next()`/`back()`. */
  onStepView?: (index: number) => void
  onStart?: () => void
  /** Fires only on `skip()`, with the index the user was on when they bailed. */
  onSkip?: (index: number) => void
}

export interface TourController {
  active: boolean
  index: number
  /**
   * Gate for the overlay's transition animation (Global Constraints: "cờ busy
   * chặn double-click"). `useTour` only HOLDS this bit of state — `TourOverlay`
   * is the one that sets it true while a step transition (fade/scroll/
   * reposition) is in flight and clears it once settled.
   */
  busy: boolean
  step: TourStep | undefined
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  start: () => void
  stop: () => void
  next: () => void
  back: () => void
  /** Bỏ qua tour — also fires `onComplete` (skip = complete, spec). */
  skip: () => void
  /** Hoàn thành ✓ (last step only, but callable anytime). */
  complete: () => void
  setBusy: (busy: boolean) => void
}

/**
 * Reusable spotlight-tour state machine (T1, `docs/superpowers/plans/
 * 2026-07-27-cap0-tours.md`). Framework/DOM-free on purpose — `TourOverlay`
 * (the only consumer that touches `getBoundingClientRect`/`scrollIntoView`)
 * drives `busy` around its own transition timing; this hook just holds
 * index/active/busy and fires the lifecycle callbacks at the right times.
 */
export function useTour(config: TourConfig, opts: UseTourOptions): TourController {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const totalSteps = config.steps.length

  // Latest callbacks without re-firing effects merely because a consumer
  // passes a fresh inline `{ onComplete: () => ... }` object every render —
  // synced in an effect (not during render) so it stays clear of React's
  // "don't write to a ref during render" rule.
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  const start = () => {
    setIndex(0)
    setBusy(false)
    setActive(true)
    optsRef.current.onStart?.()
  }

  const stop = () => {
    setActive(false)
    setBusy(false)
  }

  const next = () => {
    setIndex((i) => (i < totalSteps - 1 ? i + 1 : i))
  }

  const back = () => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }

  const skip = () => {
    setActive(false)
    setBusy(false)
    optsRef.current.onSkip?.(index)
    optsRef.current.onComplete()
  }

  const complete = () => {
    setActive(false)
    setBusy(false)
    optsRef.current.onComplete()
  }

  // onStepView(0) on start(), and onStepView(i) on every subsequent next()/back().
  // Declared AFTER the ref-sync effect above so it always reads this render's
  // opts (effects run in declaration order within the same commit).
  useEffect(() => {
    if (active) optsRef.current.onStepView?.(index)
  }, [active, index])

  return {
    active,
    index,
    busy,
    step: config.steps[index],
    totalSteps,
    isFirst: index === 0,
    isLast: index >= totalSteps - 1,
    start,
    stop,
    next,
    back,
    skip,
    complete,
    setBusy,
  }
}
