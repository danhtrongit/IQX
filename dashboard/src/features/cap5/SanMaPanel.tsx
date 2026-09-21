import { useEffect, useRef, useState } from "react"
import { Spin } from "@arco-design/web-react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { TourLaunchButton, TourOverlay, useTour } from "@/features/tour"
import { sanMaTour } from "@/features/tour/configs/sanMaTour"
import { useCap5Events } from "./Cap5Context"
import { HuntResultModal } from "./HuntResultModal"
import { useSanMaIndex } from "./sanMaHooks"
import { useCap5Progress, useMarkTourSanMa } from "./hooks"
import {
  HUNT_FILTERS,
  huntFilterAvailability,
  type HuntFilterKey,
} from "./sanMaTypes"
import "./cap5-sanma.css"

/**
 * Màn SĂN MÃ của Cấp 5 (spec §5, mockup `iqx-cap5-sanma.html`) — panel
 * `"cap5-sanma"` của sidebar-phải.
 *
 * ★ Mở TRONG shell cấp (luật số 5): panel này không `navigate` đi đâu cả; "+ Săn
 * thêm"/"Theo dõi" chỉ đổi `activePanel`. `Cap5TradingPage` không phải sửa gì.
 *
 * Bộ lọc thiếu dữ liệu được vô hiệu hóa, tránh mở kết quả rỗng như thể
 * đã lọc thành công. Điều kiện lọc và trạng thái tải vẫn được giữ lại.
 *
 * Dòng "Bộ lọc nâng cao" là hệ MỞ: nói thẳng "mở khóa ở các cấp sau", không
 * phải một nút bấm được rồi im lặng.
 */
export function SanMaPanel() {
  const { isCap5Active } = useCap5Events()
  const { setActivePanel } = useSidebar()
  const { data: index, isLoading } = useSanMaIndex(isCap5Active)
  const [open, setOpen] = useState<HuntFilterKey | null>(null)
  const { data: progress } = useCap5Progress(isCap5Active)
  const markTour = useMarkTourSanMa()
  const skippedRef = useRef(false)
  const autoStartedRef = useRef(false)
  const tour = useTour(sanMaTour, {
    onStart: () => {
      skippedRef.current = false
      trackJourneyEvent("tour_sanma_start")
    },
    onStepView: (index) => {
      trackJourneyEvent("tour_sanma_step_view", { step_id: index + 1 })
      const target = sanMaTour.steps[index]?.targetId
      setOpen(target === "tour-sanma-popup" || target === "tour-sanma-add" ? "ngoai" : null)
    },
    onSkip: (index) => {
      skippedRef.current = true
      trackJourneyEvent("tour_sanma_skip", { step_id: index + 1 })
    },
    onComplete: () => {
      if (skippedRef.current) return
      trackJourneyEvent("tour_sanma_complete")
      markTour.mutate()
    },
  })

  useEffect(() => {
    if (isCap5Active) trackJourneyEvent("cap5_san_ma_view")
  }, [isCap5Active])

  useEffect(() => {
    if (!isCap5Active || autoStartedRef.current || progress?.da_xem_tour_sanma !== false) return
    autoStartedRef.current = true
    tour.start()
    // tour is intentionally excluded: its controller object is recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCap5Active, progress?.da_xem_tour_sanma])

  const openFilter = (filter: HuntFilterKey) => {
    trackJourneyEvent("cap5_hunt_open", { filter })
    setOpen(filter)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap5-sm" data-tour-id="tour-sanma-panel">
          <div className="cap5-sm-head">
            <div className="cap5-sm-title">Săn mã</div>
            <TourLaunchButton onClick={tour.start} label="Hướng dẫn" />
          </div>

          <div className="cap5-sm-list">
            {HUNT_FILTERS.map((f) => {
              const { kha_dung } = huntFilterAvailability(index, f.ma)
              const chuaDuDuLieu = kha_dung === false
              return (
                <button
                  type="button"
                  key={f.ma}
                  className="cap5-sm-fl"
                  disabled={chuaDuDuLieu}
                  aria-disabled={chuaDuDuLieu}
                  title={chuaDuDuLieu ? "Chưa đủ dữ liệu" : undefined}
                  data-testid={`cap5-sanma-filter-${f.ma}`}
                  data-tour-id={`tour-sanma-filter-${f.ma}`}
                  onClick={() => !chuaDuDuLieu && openFilter(f.ma)}
                >
                  <span className="cap5-sm-fl-ic">{f.icon}</span>
                  <span className="cap5-sm-fl-body">
                    <span className="cap5-sm-fl-nm">{f.ten}</span>

                    <span className="cap5-sm-fl-cond">{f.dieu_kien}</span>

                  </span>
                  {isLoading ? (
                    <Spin size={12} />
                  ) : (
                    !chuaDuDuLieu && <span className="cap5-sm-fl-arrow">→</span>
                  )}
                </button>
              )
            })}

            {/* §5.5 — hệ MỞ, khóa thật, nói thẳng lý do. Không phải nút "sắp ra mắt". */}
            <div className="cap5-sm-fl cap5-sm-fl-locked" data-testid="cap5-sanma-locked">
              <span className="cap5-sm-fl-ic">🔒</span>
              <span className="cap5-sm-fl-body">
                <span className="cap5-sm-fl-nm">Bộ lọc nâng cao</span>
                <span className="cap5-sm-fl-desc">Kết hợp nhiều điều kiện — mở khóa ở các cấp sau</span>

              </span>
            </div>
          </div>

          <div className="cap5-hm-foot" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="cap5-wl-add"
              data-tour-id="tour-sanma-watchlist-link"
              onClick={() => setActivePanel("cap5-watchlist")}
            >
              Xem Theo dõi →
            </button>
          </div>
        </div>
      </div>

      <HuntResultModal filter={open} onClose={() => setOpen(null)} />
      <TourOverlay config={sanMaTour} controller={tour} />
    </div>
  )
}
