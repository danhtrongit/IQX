// ─── Stock analysis view ──────────────────────────────────────────────────────
// Symbol entry + the 6-layer AI briefing for the /thi-truong workspace.
//
// The briefing subtree (masthead, header strip, briefing card, L1–L5 layers,
// charts and news) is owned by the chart route's shared insight slice
// (`@/pages/charts/stock/insight`); this view owns the entry flow, the premium
// gate and the product tour.
//
// `key={symbol}` is load-bearing: the briefing requests its analysis once per
// mount, so without the key a second symbol submitted in the same search box
// would keep showing the previous one.

import { useCallback, useEffect, useRef, useState } from "react"
import { TrendingUp } from "lucide-react"
import { toast } from "sonner"

import { StockInsightBriefing } from "@/pages/charts/stock/insight"

import { AnalysisEntryView } from "../components/analysis-entry-view"
import { PremiumGate } from "../components/premium-gate"
import { phanTichTour } from "../tour/configs/phan-tich-tour"
import { TourCompletionNotice } from "../tour/tour-completion-notice"
import { TourLaunchButton } from "../tour/tour-launch-button"
import { TourOverlay } from "../tour/tour-overlay"
import { trackJourneyEvent } from "../tour/journey-events"
import { useProductTour, waitForTourTarget } from "../tour/use-product-tour"

/** Symbol the tour loads to demonstrate the analysis. */
const TOUR_SYMBOL = "VCB"

export function StockAnalysisView({
  autoStartTour = false,
  onTourStarted,
}: {
  autoStartTour?: boolean
  onTourStarted?: () => void
}) {
  const [symbol, setSymbol] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const autoStarted = useRef(false)

  const submitSymbol = useCallback((next: string) => setSymbol(next), [])

  const tour = useProductTour(phanTichTour, "phantich", {
    onBeforeNext: async (index) => {
      if (index !== 0) return
      setInputValue(TOUR_SYMBOL)
      submitSymbol(TOUR_SYMBOL)
      const ready = await waitForTourTarget("tour-phantich-ready", 3000)
      if (!ready) trackJourneyEvent("tour_phantich_autofill_fail")
    },
    onFinished: (skipped) => {
      if (!skipped) toast.success("Tour hoàn thành — bạn có thể gõ mã khác để xem phân tích.")
    },
  })

  useEffect(() => {
    if (!autoStartTour || autoStarted.current) return
    autoStarted.current = true
    onTourStarted?.()
    tour.start()
  }, [autoStartTour, onTourStarted, tour])

  return (
    <>
      <AnalysisEntryView
        icon={<TrendingUp className="size-5" />}
        title="Phân tích cổ phiếu"
        subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
        placeholder="Nhập mã cổ phiếu..."
        emptyIcon={<TrendingUp />}
        emptyTitle="Nhập mã cổ phiếu để bắt đầu"
        emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
        onSubmit={submitSymbol}
        inputTourId="tour-phantich-input"
        value={inputValue}
        onValueChange={setInputValue}
        headerAction={<TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />}
        resultClassName="pt-6"
        result={
          symbol ? (
            <PremiumGate
              featureName="AI Insight"
              description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
            >
              <StockInsightBriefing key={symbol} symbol={symbol} />
            </PremiumGate>
          ) : undefined
        }
      />
      <TourOverlay config={phanTichTour} controller={tour} />
      <TourCompletionNotice
        pending={tour.completionPending}
        error={tour.completionError}
        onRetry={tour.retryCompletion}
      />
    </>
  )
}
