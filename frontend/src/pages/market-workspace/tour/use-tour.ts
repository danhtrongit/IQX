import { useEffect, useRef, useState } from "react"

import type { TourConfig, TourController, UseTourOptions } from "./types"

/**
 * Reusable spotlight-tour state machine. Framework/DOM-free on purpose —
 * `TourOverlay` (the only consumer touching `getBoundingClientRect` /
 * `scrollIntoView`) drives `busy` around its own transition timing; this hook
 * only holds index/active/busy and fires lifecycle callbacks.
 */
export function useTour(config: TourConfig, opts: UseTourOptions): TourController {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const totalSteps = config.steps.length

  // Latest callbacks without re-firing effects merely because a consumer
  // passes a fresh inline options object every render.
  const optsRef = useRef(opts)
  const advancingRef = useRef(false)
  useEffect(() => {
    optsRef.current = opts
  })

  const start = () => {
    advancingRef.current = false
    setIndex(0)
    setBusy(false)
    setActive(true)
    optsRef.current.onStart?.()
  }

  const stop = () => {
    advancingRef.current = false
    setActive(false)
    setBusy(false)
  }

  const next = () => {
    if (advancingRef.current) return
    const beforeNext = optsRef.current.onBeforeNext
    if (!beforeNext) {
      setIndex((i) => (i < totalSteps - 1 ? i + 1 : i))
      return
    }

    advancingRef.current = true
    setBusy(true)
    void Promise.resolve(beforeNext(index))
      .catch(() => undefined)
      .then(() => setIndex((i) => (i < totalSteps - 1 ? i + 1 : i)))
      .finally(() => {
        advancingRef.current = false
      })
  }

  const back = () => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }

  const skip = () => {
    advancingRef.current = false
    setActive(false)
    setBusy(false)
    optsRef.current.onSkip?.(index)
    optsRef.current.onComplete()
  }

  const complete = () => {
    advancingRef.current = false
    setActive(false)
    setBusy(false)
    optsRef.current.onComplete()
  }

  // onStepView(0) on start(), and onStepView(i) on every subsequent next()/back().
  // Declared AFTER the ref-sync effect above so it always reads this render's opts.
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
