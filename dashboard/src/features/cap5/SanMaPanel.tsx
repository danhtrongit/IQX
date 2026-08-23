import { useEffect, useRef, useState } from "react"
import { Spin } from "@arco-design/web-react"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { TourLaunchButton, TourOverlay, useTour } from "@/features/tour"
import { sanMaTour } from "@/features/tour/configs/sanMaTour"
import { useCap5Events } from "./Cap5Context"
import { useCap5Progress, useMarkTourSanMa } from "./hooks"
import { HuntResultModal } from "./HuntResultModal"
import { useSanMaIndex } from "./sanMaHooks"
import {
  HUNT_FILTERS,
  HUNT_MAX_RESULTS,
  huntFilterAvailability,
  splitLocSan,
  type HuntFilterKey,
} from "./sanMaTypes"
import "./cap5-sanma.css"

/**
 * Màn SĂN MÃ của Cấp 5 (spec §5, mockup `iqx-cap5-sanma.html`) — panel
 * `"cap5-sanma"` của sidebar-phải.
 *
 * ★ Mở TRONG shell cấp (luật số 5): panel này không `navigate` đi đâu cả; "+ Săn
 * thêm"/"Watchlist" chỉ đổi `activePanel`. `Cap5TradingPage` không phải sửa gì.
 *
 * ★★ LUẬT SỐ 1 — ba chỗ dễ bịa số, cả ba đều được chặn:
 *   · dòng ghi chú lọc sàn KHÔNG hard-code "HOSE · ≥1 tỷ/phiên · ≥3.000đ": nó
 *     đọc `loc_san` từ máy chủ và tách riêng những điều kiện máy chủ CHƯA lọc
 *     được (khảo sát Cấp 5: "diện cảnh báo/kiểm soát" chưa có trường nào trong
 *     backend, "GTGD TB/phiên" mới chỉ ước lượng được);
 *   · bộ lọc `kha_dung=false` hiện thẳng «Chưa đủ dữ liệu» + lý do và KHÔNG bấm
 *     được — không mở ra một popup rỗng trông như "đã lọc, 0 mã";
 *   · lúc chưa tải xong, ghi chú nói "đang kiểm tra", không khẳng định gì.
 *
 * Dòng "Bộ lọc nâng cao" là hệ MỞ: nói thẳng "mở khóa ở các cấp sau", không
 * phải một nút bấm được rồi im lặng.
 */
export function SanMaPanel() {
  const { isCap5Active } = useCap5Events()
  const { setActivePanel } = useSidebar()
  const { data: index, isLoading, isError } = useSanMaIndex(isCap5Active)
  const [open, setOpen] = useState<HuntFilterKey | null>(null)

  const { apDung, chuaApDung } = splitLocSan(index?.loc_san)

  /* ── TOUR SĂN MÃ (spec §7 · `configs/sanMaTour.ts`) ─────────────────────────
   *
   * ★★ "Bỏ qua" giữa chừng KHÔNG tính là đã xem (spec §7 ghi rõ). Engine
   * `useTour` cố tình cho `skip()` gọi luôn `onComplete` ("skip = complete"),
   * nên phải tự phân biệt: `onSkip` bật `skippedRef` TRƯỚC khi `onComplete`
   * chạy (xem `useTour.skip()`), và chỉ khi cờ đó tắt mới `POST /cap5/tour-sanma`.
   *
   * ★ Cờ `da_xem_tour_sanma` sống trên SERVER (không localStorage) nên nó theo
   * user qua mọi máy — vì thế panel này dùng `useTour` trực tiếp chứ không
   * `useFeatureTour` (bản đó neo `seen` vào localStorage).
   */
  const { data: progress } = useCap5Progress(isCap5Active)
  const markTour = useMarkTourSanMa()
  const skippedRef = useRef(false)
  const autoStartedRef = useRef(false)
  const tour = useTour(sanMaTour, {
    onStart: () => {
      skippedRef.current = false
    },
    onSkip: () => {
      skippedRef.current = true
    },
    onComplete: () => {
      if (!skippedRef.current) markTour.mutate()
    },
  })

  /**
   * Tự bật ĐÚNG MỘT LẦN, lần đầu user vào màn Săn mã (spec §7).
   *
   * ★ Chỉ bật khi server nói THẲNG `da_xem_tour_sanma === false`. `undefined`
   * (wire cũ / chưa tải xong) là "chưa biết" ⇒ KHÔNG tự bật: thà không mở còn
   * hơn nhảy tour vào mặt một người đã xem rồi. Nút "?" vẫn mở lại được.
   */
  useEffect(() => {
    if (!isCap5Active) return
    if (autoStartedRef.current) return
    if (progress?.da_xem_tour_sanma !== false) return
    autoStartedRef.current = true
    tour.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCap5Active, progress?.da_xem_tour_sanma])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-1)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="cap5-sm" data-tour-id="tour-sanma-panel">
          <div className="cap5-sm-head">
            <div className="cap5-sm-title">Săn mã</div>
            {/* Nút "?" mở lại tour bất cứ lúc nào (spec §7 "Ghi chú kỹ thuật"). */}
            <TourLaunchButton onClick={tour.start} label="Hướng dẫn" />
          </div>
          <div className="cap5-sm-sub">
            Chọn một bộ lọc để tìm mã đáng chú ý, đưa vào Watchlist quan sát — chưa vội mua.
          </div>

          <div className="cap5-sm-note" data-testid="cap5-sanma-locsan" data-tour-id="tour-sanma-locsan">
            {isLoading && <span>Đang kiểm tra điều kiện lọc sàn với máy chủ…</span>}
            {!isLoading && isError && (
              <span>Chưa lấy được điều kiện lọc sàn từ máy chủ — chưa rõ bộ lọc đã loại những gì.</span>
            )}
            {!isLoading && !isError && (
              <span>
                {apDung.length > 0 ? (
                  <>
                    Mọi bộ lọc chỉ lấy <b>{apDung.join(" · ")}</b> · hiện{" "}
                    <b>top {HUNT_MAX_RESULTS.toLocaleString("en-US")}</b> mã mạnh nhất mỗi điều kiện.
                  </>
                ) : (
                  <>Máy chủ chưa cho biết điều kiện lọc sàn nào đã được áp dụng.</>
                )}
              </span>
            )}
            {chuaApDung.length > 0 && (
              <div className="cap5-sm-note-warn" data-testid="cap5-sanma-locsan-thieu">
                ⚠ Chưa lọc được: {chuaApDung.join(" · ")} — máy chủ chưa có dữ liệu cho điều kiện này.
              </div>
            )}
          </div>

          <div className="cap5-sm-list">
            {HUNT_FILTERS.map((f) => {
              const { kha_dung, ly_do } = huntFilterAvailability(index, f.ma)
              const chuaDuDuLieu = kha_dung === false
              return (
                <button
                  type="button"
                  key={f.ma}
                  className="cap5-sm-fl"
                  disabled={chuaDuDuLieu}
                  aria-disabled={chuaDuDuLieu}
                  data-testid={`cap5-sanma-filter-${f.ma}`}
                  data-tour-id={`tour-sanma-filter-${f.ma}`}
                  onClick={() => !chuaDuDuLieu && setOpen(f.ma)}
                >
                  <span className="cap5-sm-fl-ic">{f.icon}</span>
                  <span className="cap5-sm-fl-body">
                    <span className="cap5-sm-fl-nm">{f.ten}</span>
                    <span className="cap5-sm-fl-desc">{f.mo_ta}</span>
                    <span className="cap5-sm-fl-cond">{f.dieu_kien}</span>
                    {chuaDuDuLieu && (
                      <span className="cap5-sm-nodata" data-testid={`cap5-sanma-nodata-${f.ma}`}>
                        Chưa đủ dữ liệu để chạy bộ lọc này
                        {ly_do ? ` — ${ly_do}` : ""}
                      </span>
                    )}
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
                <span className="cap5-sm-fl-desc">
                  Kết hợp nhiều điều kiện — mở khóa ở các cấp sau
                </span>
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
              Xem Watchlist →
            </button>
          </div>
        </div>
      </div>

      <HuntResultModal filter={open} onClose={() => setOpen(null)} />
      <TourOverlay config={sanMaTour} controller={tour} />
    </div>
  )
}
