import { useState } from "react"
import { Button, Modal } from "@arco-design/web-react"
import { IconFile } from "@arco-design/web-react/icon"
import { PremiumGate, usePremiumStatus } from "@/features/premium"
import { TourLaunchButton, TourOverlay, useFeatureTour } from "@/features/tour"
import { quanLyDanhMucTour } from "@/features/tour/configs/quanLyDanhMucTour"
import { PortfolioReport } from "./PortfolioReport"
import { sampleAnalysis, sampleNarrative } from "./__fixtures__/sample"

export function PortfolioAnalysisButton() {
  const [reportOpen, setReportOpen] = useState(false)
  const [tourMode, setTourMode] = useState(false)

  // On-demand product tour (T4, docs/superpowers/plans/2026-07-27-feature-tours.md).
  // PREMIUM feature — the "Xem hướng dẫn" launch button gates on its own
  // explicit `usePremiumStatus()` check, separate from the modal's own
  // `PremiumGate` below (which still renders — blurred — for free users who
  // open the REAL "Phân tích danh mục" button; that path is untouched).
  const { isPremium } = usePremiumStatus()
  const tour = useFeatureTour(quanLyDanhMucTour, { storageKey: "iqx_tour_quanlydanhmuc" })

  const openRealReport = () => {
    setTourMode(false)
    setReportOpen(true)
  }

  // Tour mode: open the modal AND start the tour in the same click — the
  // injected sample fixture renders synchronously in the same commit, so
  // every `data-tour-id` the tour steps target already exists in the DOM by
  // the time the tour needs it (see quanLyDanhMucTour.ts's step-1 comment).
  const openTour = () => {
    setTourMode(true)
    setReportOpen(true)
    tour.start()
  }

  const closeModal = () => {
    setReportOpen(false)
    setTourMode(false)
    if (tour.controller.active) tour.controller.stop()
  }

  return (
    <>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Button
          type="primary"
          size="small"
          icon={<IconFile />}
          onClick={openRealReport}
        >
          Phân tích danh mục
        </Button>
        {isPremium && <TourLaunchButton onClick={openTour} />}
      </div>

      <Modal
        visible={reportOpen}
        onCancel={closeModal}
        footer={null}
        title={null}
        style={{ width: "min(760px, 96vw)", top: 20 }}
        autoFocus={false}
      >
        <div style={{ maxHeight: "86vh", overflowY: "auto" }}>
          {reportOpen && tourMode && (
            <PortfolioReport
              injected={{ analysis: sampleAnalysis, narrative: sampleNarrative, meta: { valid: true, cached: false } }}
            />
          )}
          {reportOpen && !tourMode && (
            <PremiumGate
              featureName="Phân tích danh mục"
              description="Báo cáo phân tích danh mục theo giọng người quản lý quỹ."
              onAuthRequested={() => setReportOpen(false)}
            >
              <PortfolioReport />
            </PremiumGate>
          )}
        </div>
      </Modal>

      <TourOverlay config={quanLyDanhMucTour} controller={tour.controller} />
    </>
  )
}
