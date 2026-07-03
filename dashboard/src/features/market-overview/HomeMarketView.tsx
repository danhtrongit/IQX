// ─── HomeMarketView ───────────────────────────────────────────────────────────
// Computes display mode from wall clock (recomputed every 30 s via setInterval)
// and switches between PreMarketView, MidDayView and MarketDailyPage.
//
// Display mode rules (from getDisplayMode):
//   "eod_yesterday" → EOD (before 08:00)
//   "premarket"      → pre-market brief (08:00–08:59)
//   "midday_loading" → mid-day (backend still processing; MidDayView falls back)
//   "midday"         → mid-day
//   "eod_today"      → EOD (after 16:30)

import { useState, useEffect } from "react"
import { getDisplayMode } from "./midday/getDisplayMode"
import { MidDayView } from "./midday/MidDayView"
import { MarketDailyPage } from "./daily/MarketDailyPage"
import { PreMarketView } from "./premarket/PreMarketView"

export function HomeMarketView() {
  const [mode, setMode] = useState(() => getDisplayMode(new Date()))

  // Recompute mode every 30 s so the view advances across daily boundaries
  useEffect(() => {
    const id = setInterval(() => {
      setMode(getDisplayMode(new Date()))
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  if (mode === "premarket") {
    return <PreMarketView />
  }

  if (mode === "midday" || mode === "midday_loading") {
    return <MidDayView />
  }

  return <MarketDailyPage />
}
