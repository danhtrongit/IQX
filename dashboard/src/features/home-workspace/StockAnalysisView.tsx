import { useCallback, useEffect, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { IconArrowRise } from "@arco-design/web-react/icon"
import { AiInsightBriefing } from "@/features/stock"
import { PremiumGate } from "@/features/premium"
import { AnalysisEntryView } from "./AnalysisEntryView"
import { TourLaunchButton, TourOverlay } from "@/features/tour"
import { phanTichTour } from "@/features/cap0/tours/phanTichTour"
import { useCap0ProductTour, waitForTourTarget } from "@/features/cap0/tours/useCap0ProductTour"
import { TourCompletionNotice } from "@/features/cap0/tours/TourCompletionNotice"
import { trackJourneyEvent } from "@/shared/analytics/journey"

export function StockAnalysisView({ autoStartTour = false, onTourStarted }: { autoStartTour?: boolean; onTourStarted?: () => void }) {
  const [symbol, setSymbol] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const autoStarted = useRef(false)
  const submitSymbol = useCallback((next: string) => setSymbol(next), [])
  const tour = useCap0ProductTour(phanTichTour, "phantich", {
    onBeforeNext: async (index) => {
      if (index !== 0) return
      setInputValue("VCB")
      submitSymbol("VCB")
      const ready = await waitForTourTarget("tour-phantich-ready", 3000)
      if (!ready) trackJourneyEvent("tour_phantich_autofill_fail")
    },
    onFinished: (skipped) => {
      if (!skipped) Message.success("Tour hoàn thành ✓ — bạn có thể gõ mã khác để xem phân tích.")
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
        icon={<IconArrowRise />}
        title="Phân tích cổ phiếu"
        subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
        placeholder="Nhập mã cổ phiếu..."
        emptyIcon={<IconArrowRise />}
        emptyTitle="Nhập mã cổ phiếu để bắt đầu"
        emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
        onSubmit={submitSymbol}
        inputTourId="tour-phantich-input"
        value={inputValue}
        onValueChange={setInputValue}
        headerAction={<TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />}
        result={
          symbol ? (
            <div className="pt-6">
              <PremiumGate
                featureName="AI Insight"
                description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
              >
              {/* key=symbol forces a remount on symbol change: AiInsightBriefing fetches via a
                  mount-once useEffect([]) backed by useStockAiInsight's useMutation, whose data
                  does NOT re-fire on prop changes. Without this key, resubmitting a new symbol
                  in the persistent search box would silently keep showing the previous symbol's
                  insight. Fix belongs here (call site), not in the shared AiInsightBriefing. */}
                <AiInsightBriefing key={symbol} symbol={symbol} />
              </PremiumGate>
            </div>
          ) : undefined
        }
      />
      <TourOverlay config={phanTichTour} controller={tour} />
      <TourCompletionNotice pending={tour.completionPending} error={tour.completionError} onRetry={tour.retryCompletion} />
    </>
  )
}
