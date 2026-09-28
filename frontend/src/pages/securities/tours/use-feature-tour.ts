import { useState } from "react"

import { useTour, type TourConfig, type TourController } from "@/pages/market-workspace/tour"

/**
 * On-demand feature tour: the shared engine plus the localStorage "seen" flag
 * the legacy feature tours used. The tour never auto-runs — it is launched from
 * the view's own help button — and completion (finish or skip) is recorded under
 * `storageKey` so a future surface can gate on it. The flag is written only in
 * the browser; a blocked/full storage degrades to "not seen" instead of failing.
 */
export function useFeatureTour(config: TourConfig, storageKey: string): {
  controller: TourController
  start: () => void
} {
  const [seen, setSeen] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1"
    } catch {
      return false
    }
  })

  const controller = useTour(config, {
    onComplete: () => {
      if (seen) return
      try {
        window.localStorage.setItem(storageKey, "1")
      } catch {
        // Storage unavailable (private mode / disabled) — the tour stays launchable.
      }
      setSeen(true)
    },
  })

  return { controller, start: controller.start }
}
