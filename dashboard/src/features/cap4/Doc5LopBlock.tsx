import { useEffect, useMemo } from "react"
import { useStockAiInsight } from "@/features/stock"
import { useBctcDashboard } from "@/features/stock/bctc-dashboard"
import { cn } from "@/shared/lib/cn"
import {
  LOP_DEFS,
  NHAN_DINH_LABEL,
  NHAN_DINH_OPTIONS,
  countCungGocNhin,
  countDongThuan,
  deriveAiRating,
  isDoc5LopComplete,
} from "./doc5Lop"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"
import "./cap4.css"

/**
 * Khối "Đọc 5 lớp" (spec §5, THÊM MỚI) — Cấp 4's replacement for Cấp 1's
 * "chọn 1 lý do" field. Cấp 1's Vùng mua, Cấp 2's cắt lỗ/chốt lời and Cấp 3's
 * quản lý vốn stay 100% intact around it (spec §5's "panel Cấp 3 GIỮ NGUYÊN,
 * thay riêng phần lý do mua").
 *
 * Each of the 5 lớp shows its **real data up-front** (no click needed — spec
 * §5.1) plus its "So với phiên trước" line, and 3 self-rating buttons.
 *
 * ★ **AI is HIDDEN until all 5 lớp are rated** (spec §5.2, "chống nhìn bài").
 * Only then does each lớp reveal the AI đối chiếu, with deliberately NEUTRAL
 * labels — `✓ Cùng góc nhìn với AI` (xanh) / `↔ Góc nhìn khác AI` (tím). Cấp 4
 * NEVER renders "đúng/sai" for reading differently from AI (spec §4.2/§9): the
 * arbiter is the real market outcome, measured server-side.
 *
 * Data comes from the EXISTING sources, exactly as `cap1/AiThanhTra.tsx` does:
 * `useStockAiInsight` for L1/L3/L4/L5 (real 5-bậc `statusLevel` + `diff`) and
 * `useBctcDashboard`'s KHỐI 02 `blocks.valuation` for 💎 Định giá. No new
 * endpoint — spec §0's "KHÔNG dựng lại cái đã có".
 *
 * Purely presentational + controlled: `TradingPanel` owns the ratings state
 * (it needs them for the cổng cứng and for `POST /cap4/kehoach`).
 */
export interface Doc5LopBlockProps {
  symbol: string
  /** Live market price (VND) — preferred over BCTC's cached `current_price`. */
  currentPrice: number
  doc5Lop: Lop5Partial
  onRate: (lop: Lop, nhanDinh: NhanDinhLop) => void
  /**
   * Fires with the AI's per-lớp 3-mức view ONLY once all 5 lớp are rated (i.e.
   * once the đối chiếu is legitimately revealed). The caller stores it and
   * posts it as `ai_5_lop` — without it the backend leaves
   * `so_lop_dong_thuan` NULL and the order never counts toward nhiệm vụ ③.
   */
  onAi5Lop?: (ai5Lop: Lop5Partial) => void
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

interface LopResolved {
  lop: Lop
  /** Still fetching this lớp's real data. */
  loading: boolean
  /** Real data could not be fetched — rate anyway, never block (spec: degrade). */
  degraded: boolean
  /** The real "thang 5 bậc" label, shown up-front (spec §5.1). */
  statusLabel: string | null
  lines: string[]
  /** "So với phiên trước" for this lớp, when the source provides one. */
  soVoiPhienTruoc: string | null
  /**
   * AI's view reduced to 3 mức (spec §5.3), or `null` while still loading.
   * A degraded lớp resolves to `"neu"` — the same "degrade to ⚪ Trung tính"
   * rule Cấp 1's AI Thanh tra already uses — so `ai_5_lop` stays a complete
   * 5-key map and the plan still counts toward nhiệm vụ ③. Its ROW says
   * "chưa có dữ liệu" instead of claiming a verdict.
   */
  aiRating: NhanDinhLop | null
}

export function Doc5LopBlock({
  symbol,
  currentPrice,
  doc5Lop,
  onRate,
  onAi5Lop,
}: Doc5LopBlockProps) {
  const {
    insight,
    analyze,
    isPending: insightPending,
    isError: insightError,
  } = useStockAiInsight(symbol)
  const { data: bctc, isLoading: bctcLoading, isError: bctcError } = useBctcDashboard(symbol)

  // Fetch the 6-layer insight lazily, exactly once per symbol. Unlike Cấp 1
  // (which only fetched the ONE picked lý do's layer) Cấp 4 always needs
  // L1/L3/L4/L5, since all 5 lớp are shown up-front.
  useEffect(() => {
    if (!insight && !insightPending && !insightError) analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  const resolved = useMemo<LopResolved[]>(() => {
    const insightLoading = insightPending || (!insight && !insightError)

    return LOP_DEFS.map((def): LopResolved => {
      if (def.layer == null) {
        // 💎 Định giá — BCTC KHỐI 02 (no 5-bậc statusLevel of its own).
        if (bctcLoading) {
          return {
            lop: def.lop,
            loading: true,
            degraded: false,
            statusLabel: null,
            lines: [],
            soVoiPhienTruoc: null,
            aiRating: null,
          }
        }
        const v = bctc?.blocks?.valuation
        if (bctcError || !v || v.current_price == null || v.fair_median == null) {
          return {
            lop: def.lop,
            loading: false,
            degraded: true,
            statusLabel: null,
            lines: [],
            soVoiPhienTruoc: null,
            aiRating: "neu",
          }
        }
        const bears = v.methods.map((m) => m.bear).filter((n): n is number => n != null)
        const bulls = v.methods.map((m) => m.bull).filter((n): n is number => n != null)
        const rangeLow = bears.length > 0 ? Math.min(...bears) : v.fair_median * 0.85
        const rangeHigh = bulls.length > 0 ? Math.max(...bulls) : v.fair_median * 1.15
        // Prefer the LIVE market price over BCTC's end-of-day-cached one
        // (identical rule to `cap1/AiThanhTra.tsx`).
        const effectivePrice = currentPrice > 0 ? currentPrice : v.current_price
        return {
          lop: def.lop,
          loading: false,
          degraded: false,
          statusLabel: null,
          lines: [
            `Vùng giá trị: ${fmtVnd(rangeLow)} – ${fmtVnd(rangeHigh)}`,
            `Trung vị (giá hợp lý): ${fmtVnd(v.fair_median)}`,
            `Giá hiện tại: ${fmtVnd(effectivePrice)}${
              v.upside_pct != null
                ? ` (${v.upside_pct >= 0 ? "+" : ""}${v.upside_pct.toFixed(1)}% so với giá hợp lý)`
                : ""
            }`,
          ],
          soVoiPhienTruoc: null,
          aiRating: deriveAiRating({
            kind: "valuation",
            currentPrice: effectivePrice,
            median: v.fair_median,
            rangeLow,
            rangeHigh,
          }),
        }
      }

      // AI Insight-backed lớp (L1 Kỹ thuật / L3 Dòng tiền / L4 Nội bộ / L5 Tin tức).
      if (insightLoading) {
        return {
          lop: def.lop,
          loading: true,
          degraded: false,
          statusLabel: null,
          lines: [],
          soVoiPhienTruoc: null,
          aiRating: null,
        }
      }
      const layer = insight?.layers?.[def.layer]
      if (insightError || !layer) {
        return {
          lop: def.lop,
          loading: false,
          degraded: true,
          statusLabel: null,
          lines: [],
          soVoiPhienTruoc: null,
          aiRating: "neu",
        }
      }
      const diffText = layer.diff?.text?.map((fr) => fr.content).join("") ?? ""
      return {
        lop: def.lop,
        loading: false,
        degraded: false,
        statusLabel: layer.statusLabel,
        lines: layer.fields
          .slice(0, 3)
          .map((f) => `${f.label}: ${f.value.map((fr) => fr.content).join("")}`),
        soVoiPhienTruoc: diffText.trim() ? diffText.trim() : null,
        aiRating: deriveAiRating({ kind: "statusLevel", statusLevel: layer.statusLevel }),
      }
    })
  }, [insight, insightPending, insightError, bctc, bctcLoading, bctcError, currentPrice])

  const soDaCham = LOP_DEFS.filter((def) => doc5Lop[def.lop] != null).length
  const complete = isDoc5LopComplete(doc5Lop)
  // AI is revealed only when the user rated all 5 lớp AND every lớp's data has
  // settled (loaded or degraded) — so a half-loaded reveal can't show blanks.
  const ai5Lop = useMemo<Lop5Partial | null>(() => {
    if (!complete || resolved.some((r) => r.aiRating == null)) return null
    const map: Lop5Partial = {}
    for (const r of resolved) map[r.lop] = r.aiRating as NhanDinhLop
    return map
  }, [complete, resolved])

  const ai5LopKey = ai5Lop ? JSON.stringify(ai5Lop) : null
  useEffect(() => {
    if (ai5Lop) onAi5Lop?.(ai5Lop)
    // Serialized so a re-render with an identical map doesn't re-notify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai5LopKey])

  const soDongThuan = countDongThuan(ai5Lop)
  const soCungGocNhin = countCungGocNhin(doc5Lop, ai5Lop)

  return (
    <div className="cap4-doc5lop" data-testid="cap4-doc5lop">
      <div className="cap4-block-tag">{"ĐỌC 5 LỚP"}</div>
      {/* ★ Số thứ tự «1.» KHÔNG phải trang trí: mockup `iqx-cap4-datlenh.html`
          đánh số ba mục của thẻ KẾ HOẠCH là 1./2./3., và khối này THAY CHỖ
          mục ① «1. Lý do mua» của Cấp 1 (`PlanFormCap1` ẩn trường đó ở Cấp 4).
          Thiếu số, panel Cấp 4/5 đọc thành "… → 2. Vùng mua → 3. Cắt lỗ/Chốt
          lời" — nhảy thẳng từ không-số sang 2. */}
      <div className="cap4-block-title">
        {"1. Đọc 5 lớp phân tích — tự chấm từng lớp, AI đối chiếu sau"}
      </div>

      {LOP_DEFS.map((def) => {
        const r = resolved.find((x) => x.lop === def.lop) as LopResolved
        const picked = doc5Lop[def.lop] ?? null
        const aiMuc = ai5Lop?.[def.lop]
        const cungGocNhin = aiMuc != null && picked != null && aiMuc === picked

        return (
          <div key={def.lop} className="cap4-lop-row" data-testid={`cap4-lop-${def.lop}`}>
            <div className="cap4-lop-head">
              <span className="cap4-lop-icon">{def.icon}</span>
              <span className="cap4-lop-name">{def.label}</span>
              {r.statusLabel && (
                <span className="cap4-lop-status">{`Trạng thái: ${r.statusLabel}`}</span>
              )}
            </div>

            {/* Chi tiết dữ liệu thật — hiện sẵn, không cần bấm mở (spec §5.1). */}
            {r.loading ? (
              <p className="cap4-lop-hint">{"Đang tải dữ liệu lớp…"}</p>
            ) : r.degraded ? (
              <p className="cap4-lop-hint">{"Chưa có dữ liệu lớp này."}</p>
            ) : (
              <div className="cap4-lop-data">
                {r.lines.map((line, i) => (
                  <p key={i} className="cap4-lop-line">
                    {line}
                  </p>
                ))}
              </div>
            )}
            {r.soVoiPhienTruoc && (
              <p className="cap4-lop-diff" data-testid={`cap4-diff-${def.lop}`}>
                {`So với phiên trước: ${r.soVoiPhienTruoc}`}
              </p>
            )}
            {/* §C12c — con số đến từ đâu. */}
            <p className="cap4-lop-source">{`(Dữ liệu từ ${def.source})`}</p>

            <div className="cap4-lop-rate-label">{"Bạn đọc lớp này là:"}</div>
            <div className="cap4-lop-rate-group">
              {NHAN_DINH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "cap4-rate-btn",
                    picked === opt.value && `cap4-rate-btn--on cap4-rate-btn--${opt.value}`,
                  )}
                  aria-pressed={picked === opt.value}
                  onClick={() => onRate(def.lop, opt.value)}
                  data-testid={`cap4-rate-${def.lop}-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Ô đối chiếu AI — ẨN cho tới khi chấm đủ 5 lớp (spec §5.2). */}
            {ai5Lop != null && (
              <div
                className={cn(
                  "cap4-ai-cell",
                  r.degraded
                    ? "cap4-ai-cell--nodata"
                    : cungGocNhin
                      ? "cap4-ai-cell--cung"
                      : "cap4-ai-cell--khac",
                )}
                data-testid={`cap4-ai-${def.lop}`}
              >
                {r.degraded
                  ? "⚪ Chưa có dữ liệu lớp này để đối chiếu"
                  : cungGocNhin
                    ? `✓ Cùng góc nhìn với AI — AI đánh giá: ${NHAN_DINH_LABEL[aiMuc!]}`
                    : `↔ Góc nhìn khác AI — AI đánh giá: ${NHAN_DINH_LABEL[aiMuc!]}`}
              </div>
            )}
          </div>
        )
      })}

      {ai5Lop == null ? (
        <div className="cap4-locked" data-testid="cap4-ai-locked">
          <div className="cap4-locked-main">
            {"🔒 Chấm đủ 5 lớp để xem AI đối chiếu và đặt lệnh"}
          </div>
          <div className="cap4-locked-sub">{`Đã chấm ${soDaCham}/5 lớp`}</div>
        </div>
      ) : (
        <div className="cap4-dongthuan">
          <div className="cap4-dongthuan-main" data-testid="cap4-dongthuan-summary">
            {`Điểm đồng thuận ${soDongThuan}/5 · Cùng góc nhìn AI ${soCungGocNhin}/5`}
          </div>
          {/* §C12c + spec §4.2 — where the numbers come from, and that a
              different reading is a góc nhìn khác, not a mistake. */}
          <div className="cap4-dongthuan-sub" data-testid="cap4-dongthuan-provenance">
            {`${soDongThuan}/5 lớp AI đánh giá Ủng hộ · bạn cùng góc nhìn AI ở ${soCungGocNhin}/5 lớp. Lệch AI là góc nhìn khác cần kiểm chứng bằng kết quả lệnh, không phải lỗi đọc.`}
          </div>
        </div>
      )}
    </div>
  )
}
