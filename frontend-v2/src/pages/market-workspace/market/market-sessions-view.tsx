// ─── Market sessions view ─────────────────────────────────────────────────────
// The three session tabs (Trước / Giữa / Cuối phiên) are always visible; the
// active one defaults to the current time of day on mount and never changes on
// its own while viewing. Each tab renders the brief that belongs to it — a
// session view never falls back to another session's report.
//
// All three briefs are fetched eagerly (even the unopened tabs) because the
// "MỚI" pill must compare all three, and a brief that isn't published yet
// answers 404 — that is a deliberate pending state, not an error.

import { useEffect, useMemo, useRef, useState } from "react"

import { TourCompletionNotice } from "../tour/tour-completion-notice"
import { TourLaunchButton } from "../tour/tour-launch-button"
import { TourOverlay } from "../tour/tour-overlay"
import { banTinTour } from "../tour/configs/ban-tin-tour"
import { useProductTour } from "../tour/use-product-tour"
import { formatSessionDate, localTodayIso } from "./date"
import { useDailyMarketAnalysis, useMidDayMarketAnalysis, usePreMarketAnalysis } from "./hooks"
import { getDefaultActivePeriod } from "./period"
import { SessionTabs } from "./session-tabs"
import { DailyMarketView } from "./views/daily-view"
import { MidDayView } from "./views/midday-view"
import { PreMarketView } from "./views/premarket-view"
import type { SessionPeriod } from "./types"

export function MarketSessionsView({
  autoStartTour = false,
  onTourStarted,
}: {
  autoStartTour?: boolean
  onTourStarted?: () => void
}) {
  const [active, setActive] = useState<SessionPeriod>(() =>
    autoStartTour ? "premarket" : getDefaultActivePeriod(new Date()),
  )
  const autoStarted = useRef(false)

  const tour = useProductTour(banTinTour, "bantin", {
    // The tour walks pre-market → mid-day → end-of-day, so each step must first
    // switch the tab its target lives in.
    onStepView: (index) => {
      if (index < 5) setActive("premarket")
      else if (index < 18) setActive("midday")
      else setActive("eod")
    },
  })

  useEffect(() => {
    if (!autoStartTour || autoStarted.current) return
    autoStarted.current = true
    onTourStarted?.()
    tour.start()
  }, [autoStartTour, onTourStarted, tour])

  const { data: premarketData } = usePreMarketAnalysis()
  const { data: middayData } = useMidDayMarketAnalysis()
  const { data: dailyData } = useDailyMarketAnalysis()

  const briefs = useMemo<Record<SessionPeriod, { session_date?: string; generated_at?: string } | undefined>>(
    () => ({ premarket: premarketData, midday: middayData, eod: dailyData }),
    [premarketData, middayData, dailyData],
  )

  // The "MỚI" pill belongs to today's brief with the newest `generated_at`.
  const newPeriod = useMemo<SessionPeriod | null>(() => {
    const today = localTodayIso()
    let best: SessionPeriod | null = null
    let bestTs = ""
    for (const period of ["premarket", "midday", "eod"] as const) {
      const brief = briefs[period]
      if (brief?.session_date === today && brief.generated_at && brief.generated_at > bestTs) {
        best = period
        bestTs = brief.generated_at
      }
    }
    return best
  }, [briefs])

  const sessionDate = briefs[active]?.session_date
  const dateLabel = sessionDate ? formatSessionDate(sessionDate) : null

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-sm bg-primary/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
            Phân tích thị trường
          </span>
          {dateLabel && (
            <span className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted-foreground">
              {dateLabel}
            </span>
          )}
        </div>
        <TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />
      </div>

      <SessionTabs active={active} onSelect={setActive} newPeriod={newPeriod} />

      {active === "premarket" && <PreMarketView tourMode={tour.active} />}
      {active === "midday" && <MidDayView tourMode={tour.active} />}
      {active === "eod" && <DailyMarketView tourMode={tour.active} />}

      <TourOverlay config={banTinTour} controller={tour} />
      <TourCompletionNotice
        pending={tour.completionPending}
        error={tour.completionError}
        onRetry={tour.retryCompletion}
      />
    </div>
  )
}
