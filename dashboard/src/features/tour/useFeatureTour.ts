import { useState } from "react"
import type { TourConfig } from "./tourTypes"
import { useTour, type TourController } from "./useTour"

export interface UseFeatureTourOptions {
  /**
   * `localStorage` key used to remember this tour has been viewed. Omit to
   * keep `seen` purely in-memory (no persistence) — still safe, just doesn't
   * survive a reload.
   */
  storageKey?: string
}

export interface FeatureTourReturn {
  controller: TourController
  /** Launches the tour from step 0. Does NOT auto-run — call from a button. */
  start: () => void
  /** True once the tour has been completed or skipped (or `markSeen()` was called), from `localStorage` when a `storageKey` is given. */
  seen: boolean
  /** Manually mark the tour as seen without running it (e.g. "don't show again"). */
  markSeen: () => void
}

function readSeen(storageKey: string | undefined): boolean {
  if (!storageKey) return false
  try {
    return window.localStorage.getItem(storageKey) === "1"
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — fall back to
    // "not seen"; the tour just stays available to launch every time.
    return false
  }
}

function writeSeen(storageKey: string | undefined): void {
  if (!storageKey) return
  try {
    window.localStorage.setItem(storageKey, "1")
  } catch {
    // Storage unavailable — degrade silently, not a functional break (mirrors
    // `features/cap0/Cap0TradingPage.tsx`'s `markPlacementSeen`).
  }
}

/**
 * On-demand feature-tour harness (T1, `docs/superpowers/plans/
 * 2026-07-27-feature-tours.md`). Thin wrapper around the shared `useTour`
 * engine for feature pages that launch their tour from a "Xem hướng dẫn"
 * button rather than auto-running it: adds a `localStorage`-backed `seen`
 * flag (for potential future auto-run gating — NOT wired to auto-run in this
 * increment, per Global Constraints "on-demand only") and a no-op analytics
 * stub matching the engine's own convention.
 */
export function useFeatureTour(config: TourConfig, opts: UseFeatureTourOptions = {}): FeatureTourReturn {
  const { storageKey } = opts
  const [seen, setSeen] = useState(() => readSeen(storageKey))

  const markSeen = () => {
    writeSeen(storageKey)
    setSeen(true)
  }

  const controller = useTour(config, {
    onComplete: () => {
      markSeen()
      // TODO analytics: `${config.name}_complete`
    },
    onStart: () => {
      // TODO analytics: `${config.name}_start`
    },
    onStepView: (_index) => {
      // TODO analytics: `${config.name}_step_view(${_index})`
    },
    onSkip: (_index) => {
      // TODO analytics: `${config.name}_skip(${_index})`
    },
  })

  return {
    controller,
    start: controller.start,
    seen,
    markSeen,
  }
}
