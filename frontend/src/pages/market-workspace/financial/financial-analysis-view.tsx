// ─── Financial-statement analysis (/thi-truong?view=financial) ────────────────
// Symbol entry → the BCTC storytelling dashboard. The dashboard is remounted per
// symbol (`key={symbol}`) so a resubmit never shows the previous symbol's
// numbers, and its prose block is premium-gated while every chart stays public.
//
// The product tour is opt-in: the workspace deep-link (`?tour=bctc`) or the
// "Xem lại tour hướng dẫn" button. Step 0 fills the demo symbol and submits it,
// then waits for the dashboard to mount before moving on.

import { useCallback, useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { toast } from "sonner"

import { AnalysisEntryView } from "../components/analysis-entry-view"
import { bctcTour } from "../tour/configs/bctc-tour"
import { trackJourneyEvent } from "../tour/journey-events"
import { TourCompletionNotice } from "../tour/tour-completion-notice"
import { TourLaunchButton } from "../tour/tour-launch-button"
import { TourOverlay } from "../tour/tour-overlay"
import { useProductTour, waitForTourTarget } from "../tour/use-product-tour"
import { BctcDashboard } from "./bctc-dashboard"

export function FinancialAnalysisView({
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

  const tour = useProductTour(bctcTour, "bctc", {
    // Step 0 is the input: load the demo symbol so the following steps have a
    // dashboard to spotlight. A slow/failed load is reported, never faked.
    onBeforeNext: async (index) => {
      if (index !== 0) return
      setInputValue("VIC")
      submitSymbol("VIC")
      const ready = await waitForTourTarget("tour-bctc-ready", 4000)
      if (!ready) trackJourneyEvent("tour_bctc_autofill_fail")
    },
    onFinished: (skipped) => {
      if (!skipped) {
        toast.success(
          "Tour hoàn thành. Bạn có thể gõ mã khác (VD: VCB, FPT, MWG) để xem báo cáo tương ứng.",
        )
      }
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
        icon={<FileText className="size-5" aria-hidden />}
        title="Phân tích BCTC"
        subtitle="Báo cáo tài chính · Theo quý và cả năm"
        placeholder="Nhập mã cổ phiếu..."
        emptyIcon={<FileText aria-hidden />}
        emptyTitle="Nhập mã cổ phiếu để bắt đầu"
        emptyDesc="Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."
        onSubmit={submitSymbol}
        inputTourId="tour-bctc-input"
        value={inputValue}
        onValueChange={setInputValue}
        headerAction={<TourLaunchButton onClick={tour.start} label="Xem lại tour hướng dẫn" />}
        resultClassName="pt-6"
        result={
          // key=symbol forces a remount on symbol change: avoids stale data from
          // the previous symbol lingering after a resubmit.
          symbol ? <BctcDashboard key={symbol} symbol={symbol} /> : undefined
        }
      />
      <TourOverlay config={bctcTour} controller={tour} />
      <TourCompletionNotice
        pending={tour.completionPending}
        error={tour.completionError}
        onRetry={tour.retryCompletion}
      />
    </>
  )
}
