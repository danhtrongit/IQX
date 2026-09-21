import { useCallback, useEffect, useRef, useState } from "react"
import { Message } from "@arco-design/web-react"
import { IconFile } from "@arco-design/web-react/icon"
import { BctcDashboard } from "@/features/stock/bctc-dashboard"
import { AnalysisEntryView } from "./AnalysisEntryView"
import { TourLaunchButton, TourOverlay } from "@/features/tour"
import { bctcTour } from "@/features/cap0/tours/bctcTour"
import { useCap0ProductTour, waitForTourTarget } from "@/features/cap0/tours/useCap0ProductTour"
import { TourCompletionNotice } from "@/features/cap0/tours/TourCompletionNotice"
import { trackJourneyEvent } from "@/shared/analytics/journey"

export function FinancialAnalysisView({ autoStartTour = false, onTourStarted }: { autoStartTour?: boolean; onTourStarted?: () => void }) {
  const [symbol, setSymbol] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const autoStarted = useRef(false)
  const submitSymbol = useCallback((next: string) => setSymbol(next), [])
  const tour = useCap0ProductTour(bctcTour, "bctc", {
    onBeforeNext: async (index) => {
      if (index !== 0) return
      setInputValue("VIC")
      submitSymbol("VIC")
      const ready = await waitForTourTarget("tour-bctc-ready", 4000)
      if (!ready) trackJourneyEvent("tour_bctc_autofill_fail")
    },
    onFinished: (skipped) => {
      if (!skipped) Message.success("Tour hoàn thành ✓ — bạn có thể gõ mã khác (VD: VCB, FPT, MWG) để xem báo cáo tương ứng.")
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
      icon={<IconFile />}
      title="Phân tích BCTC"
      subtitle="Báo cáo tài chính · Theo quý và cả năm"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconFile />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."
      onSubmit={submitSymbol}
      inputTourId="tour-bctc-input"
      value={inputValue}
      onValueChange={setInputValue}
      headerAction={<TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />}
      result={
        symbol ? (
          <div className="pt-6">
            {/* key=symbol forces a remount on symbol change, same reason as StockAnalysisView:
                avoids stale data from the previous symbol lingering after a resubmit. */}
            <BctcDashboard key={symbol} symbol={symbol} />
          </div>
        ) : undefined
      }
      />
      <TourOverlay config={bctcTour} controller={tour} />
      <TourCompletionNotice pending={tour.completionPending} error={tour.completionError} onRetry={tour.retryCompletion} />
    </>
  )
}
