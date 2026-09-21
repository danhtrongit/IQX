// ─── HomeMarketView ───────────────────────────────────────────────────────────
// 3 session tab (Trước/Giữa/Cuối phiên) luôn hiển thị; tab active mặc định theo
// giờ truy cập (getDefaultActivePeriod, tính 1 lần khi mount — không auto đổi
// tab trong phiên xem). Nội dung mỗi tab là view brief đầy đủ sẵn có.

import { useEffect, useMemo, useRef, useState } from "react"
import { TourLaunchButton, TourOverlay } from "@/features/tour"
import { banTinTour } from "@/features/cap0/tours/banTinTour"
import { useCap0ProductTour } from "@/features/cap0/tours/useCap0ProductTour"
import { TourCompletionNotice } from "@/features/cap0/tours/TourCompletionNotice"
import { getDefaultActivePeriod, type SessionPeriod } from "./home-analysis/getDefaultActivePeriod"
import { SessionMeta } from "./home-analysis/SessionMeta"
import { SessionTabs } from "./home-analysis/SessionTabs"
import { formatSessionDate } from "./home-analysis/formatSessionDate"
import { localTodayIso } from "./home-analysis/localDate"
import { useDailyMarketAnalysis } from "./daily/useDailyMarketAnalysis"
import { useMidDayAnalysis } from "./midday/useMidDayAnalysis"
import { usePreMarketAnalysis } from "./premarket/usePreMarketAnalysis"
import { MidDayView } from "./midday/MidDayView"
import { MarketDailyPage } from "./daily/MarketDailyPage"
import { PreMarketView } from "./premarket/PreMarketView"

export function HomeMarketView({ autoStartTour = false, onTourStarted }: { autoStartTour?: boolean; onTourStarted?: () => void }) {
  const [active, setActive] = useState<SessionPeriod>(() => autoStartTour ? "premarket" : getDefaultActivePeriod(new Date()))
  const autoStarted = useRef(false)
  const tour = useCap0ProductTour(banTinTour, "bantin", {
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

  const { data: dailyData } = useDailyMarketAnalysis()
  const { data: middayData } = useMidDayAnalysis()
  const { data: premarketData } = usePreMarketAnalysis()

  const briefs: Record<SessionPeriod, { session_date?: string; generated_at?: string } | undefined> = {
    premarket: premarketData,
    midday: middayData,
    eod: dailyData,
  }

  // Cả 3 hook fetch eager (kể cả tab chưa mở): pill MỚI phải so sánh đủ 3 brief.
  // Brief chưa publish → 404 → data undefined → view của tab đó render fallback
  // "đang xử lý + bản cuối ngày hôm trước" — đó là degrade chủ đích, không phải lỗi.
  // Pill MỚI: brief của HÔM NAY có generated_at lớn nhất
  const newPeriod = useMemo<SessionPeriod | null>(() => {
    const today = localTodayIso()
    let best: SessionPeriod | null = null
    let bestTs = ""
    for (const p of ["premarket", "midday", "eod"] as const) {
      const b = briefs[p]
      if (b?.session_date === today && b.generated_at && b.generated_at > bestTs) {
        best = p
        bestTs = b.generated_at
      }
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premarketData, middayData, dailyData])

  const dateLabel = briefs[active]?.session_date
    ? formatSessionDate(briefs[active]!.session_date!)
    : null

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 pb-20 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <SessionMeta dateLabel={dateLabel} />
        <TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />
      </div>
      <SessionTabs active={active} onSelect={setActive} newPeriod={newPeriod} />
      {active === "premarket" && <PreMarketView tourMode={tour.active} />}
      {active === "midday" && <MidDayView tourMode={tour.active} />}
      {active === "eod" && <MarketDailyPage tourMode={tour.active} />}
      <TourOverlay config={banTinTour} controller={tour} />
      <TourCompletionNotice pending={tour.completionPending} error={tour.completionError} onRetry={tour.retryCompletion} />
    </div>
  )
}
