// ─── HomeMarketView ───────────────────────────────────────────────────────────
// 3 session tab (Trước/Giữa/Cuối phiên) luôn hiển thị; tab active mặc định theo
// giờ truy cập (getDefaultActivePeriod, tính 1 lần khi mount — không auto đổi
// tab trong phiên xem). Nội dung mỗi tab là view brief đầy đủ sẵn có.

import { useMemo, useState } from "react"
import { getDefaultActivePeriod, type SessionPeriod } from "./home-analysis/getDefaultActivePeriod"
import { SessionMeta } from "./home-analysis/SessionMeta"
import { SessionTabs } from "./home-analysis/SessionTabs"
import { formatSessionDate } from "./home-analysis/formatSessionDate"
import { useDailyMarketAnalysis } from "./daily/useDailyMarketAnalysis"
import { useMidDayAnalysis } from "./midday/useMidDayAnalysis"
import { usePreMarketAnalysis } from "./premarket/usePreMarketAnalysis"
import { MidDayView } from "./midday/MidDayView"
import { MarketDailyPage } from "./daily/MarketDailyPage"
import { PreMarketView } from "./premarket/PreMarketView"

function localTodayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function HomeMarketView() {
  const [active, setActive] = useState<SessionPeriod>(() => getDefaultActivePeriod(new Date()))

  const { data: dailyData } = useDailyMarketAnalysis()
  const { data: middayData } = useMidDayAnalysis()
  const { data: premarketData } = usePreMarketAnalysis()

  const briefs: Record<SessionPeriod, { session_date?: string; generated_at?: string } | undefined> = {
    premarket: premarketData,
    midday: middayData,
    eod: dailyData,
  }

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
      <SessionMeta dateLabel={dateLabel} />
      <SessionTabs active={active} onSelect={setActive} newPeriod={newPeriod} />
      {active === "premarket" && <PreMarketView />}
      {active === "midday" && <MidDayView />}
      {active === "eod" && <MarketDailyPage />}
    </div>
  )
}
