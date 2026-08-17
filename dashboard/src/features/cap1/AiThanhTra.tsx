import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { Spin } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useStockAiInsight } from "@/features/stock"
import { useBctcDashboard } from "@/features/stock/bctc-dashboard"
import { LY_DO_OPTIONS, type LyDo } from "./types"
import { VERDICT_LABEL, verdictFromStatusLevel, verdictFromValuation, type Verdict } from "./verdict"

/** spec §4 table — which AI Insight layer backs each lý do (Định giá uses BCTC instead). */
const LAYER_BY_REASON: Partial<Record<LyDo, "L1" | "L3" | "L4" | "L5">> = {
  ky_thuat: "L1",
  dong_tien: "L3",
  noi_bo: "L4",
  tin_tuc: "L5",
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * Màu của pill trạng thái (mockup `iqx-cap1-datlenh.html` `.tt-verdict`) —
 * ✅ xanh lên giá · ⚠ vàng cảnh báo · ❌ đỏ xuống giá · ⚪ trung tính xám.
 */
const VERDICT_TONE: Record<Verdict, string> = {
  ung_ho_manh: "border-up/35 bg-up/10 text-up",
  ung_ho: "border-up/35 bg-up/10 text-up",
  trung_tinh: "border-[var(--color-border-2)] bg-[var(--color-fill-2)] text-[var(--color-text-2)]",
  can_chu_y:
    "border-[rgb(var(--warning-6))]/35 bg-[rgb(var(--warning-6))]/10 text-[rgb(var(--warning-6))]",
  nguoc_chieu: "border-down/35 bg-down/10 text-down",
}

interface Resolved {
  verdict: Verdict
  lines: string[]
  /** `true` when the real layer/valuation data could not be fetched (degrade gracefully — spec: don't block, don't crash). */
  degraded: boolean
  snapshot: Record<string, unknown>
}

/**
 * Panel AI Thanh tra 6 lớp (spec §5, THÊM MỚI) — appears once a Form Kế
 * hoạch lý do is picked. Reuses the EXISTING AI Insight endpoints (L1/L3/L4/
 * L5, via `useStockAiInsight`) and BCTC KHỐI 02 (`useBctcDashboard`'s
 * `blocks.valuation`) for 💎 Định giá — no new data source, per spec §0's
 * "KHÔNG dựng lại cái đã có".
 *
 * Maps the real "thang 5 bậc" straight from each layer's already-computed
 * `statusLevel` (see `verdictFromStatusLevel`) — Định giá has no `statusLevel`
 * (it isn't an AI Insight layer), so its verdict is derived from price vs.
 * vùng giá trị (`verdictFromValuation`).
 *
 * `useStockAiInsight`'s `analyzeInsight` POST is premium-gated on the
 * backend — a non-premium Cấp 1 (FREE) user's `analyze()` call will fail.
 * That failure degrades to ⚪ Trung tính with a "can't load" line instead of
 * crashing or blocking the (already ungated) MUA button — spec explicitly
 * does not want ❌ to block, and a fetch failure must not either.
 */
export interface AiThanhTraProps {
  symbol: string
  lyDo: LyDo
  currentPrice: number
  /** Fires whenever the resolved verdict changes — caller stores it as `trangThai_luc_dat` at pick time. */
  onVerdict?: (verdict: Verdict, snapshot: Record<string, unknown>) => void
  /** "Đọc chi tiết lớp này →" clicked — caller records `co_bam_doc_chi_tiet=true`. */
  onDocChiTiet?: () => void
  /**
   * ★★ NƠI mở phần chi tiết. Component này chỉ tồn tại BÊN TRONG một shell cấp
   * (nó cần một lý do đã chọn ở Form Kế hoạch), nên `navigate('/co-phieu/:sym')`
   * mặc định cũ là một cú ném user ra khỏi `/dau-truong` 100% số lần bấm — kéo
   * theo cả form kế hoạch đang gõ dở (state của `TradingPanel`).
   *
   * Có handler = host tự mở chi tiết tại chỗ. `undefined` = giữ nguyên hành vi
   * điều hướng cũ cho bất kỳ callsite nào khác.
   */
  onOpenDetail?: (symbol: string) => void
  /** ❌ case, "Chọn lý do khác" — caller resets the picked lý do. */
  onChonLyDoKhac?: () => void
}

export function AiThanhTra({
  symbol,
  lyDo,
  currentPrice,
  onVerdict,
  onDocChiTiet,
  onChonLyDoKhac,
  onOpenDetail,
}: AiThanhTraProps) {
  const navigate = useNavigate()
  const option = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  const layerKey = LAYER_BY_REASON[lyDo]
  const needsInsight = layerKey != null

  const { insight, analyze, isPending: insightPending, isError: insightError } =
    useStockAiInsight(symbol)
  const { data: bctc, isLoading: bctcLoading, isError: bctcError } = useBctcDashboard(symbol)

  // Fetch the 6-layer insight lazily, exactly once, only when a lý do backed
  // by it is actually picked (never for 💎 Định giá, which uses BCTC only).
  useEffect(() => {
    if (needsInsight && !insight && !insightPending && !insightError) analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsInsight, symbol])

  // ❌ acknowledgment ("Vẫn đặt lệnh với lý do này") — tracked as WHICH lý do
  // was dismissed (not a plain boolean + reset-on-change effect) so a fresh
  // lý do pick shows the mismatch warning again with no extra effect/render.
  const [acknowledgedFor, setAcknowledgedFor] = useState<LyDo | null>(null)
  const acknowledged = acknowledgedFor === lyDo

  const layer = layerKey ? insight?.layers[layerKey] : undefined

  const resolved = useMemo<Resolved | null>(() => {
    if (lyDo === "dinh_gia") {
      if (bctcLoading) return null
      const v = bctc?.blocks?.valuation
      if (bctcError || !v || v.current_price == null || v.fair_median == null) {
        return {
          verdict: "trung_tinh",
          lines: ["Không tải được dữ liệu định giá cho mã này ngay bây giờ."],
          degraded: true,
          snapshot: {},
        }
      }
      const bears = v.methods.map((m) => m.bear).filter((n): n is number => n != null)
      const bulls = v.methods.map((m) => m.bull).filter((n): n is number => n != null)
      const rangeLow = bears.length > 0 ? Math.min(...bears) : v.fair_median * 0.85
      const rangeHigh = bulls.length > 0 ? Math.max(...bulls) : v.fair_median * 1.15
      // Prefer the LIVE market price (the trading panel's real-time feed —
      // spec §5 "Giá hiện tại vs vùng") over BCTC's own (end-of-day-cached)
      // `current_price`, falling back to it only while the live feed isn't
      // ready yet (`currentPrice` is 0 before the price board loads).
      const effectivePrice = currentPrice > 0 ? currentPrice : v.current_price
      const verdict = verdictFromValuation({
        currentPrice: effectivePrice,
        median: v.fair_median,
        rangeLow,
        rangeHigh,
      })
      return {
        verdict,
        lines: [
          `Vùng giá trị: ${fmtVnd(rangeLow)} – ${fmtVnd(rangeHigh)}`,
          `Trung vị (giá hợp lý): ${fmtVnd(v.fair_median)}`,
          `Giá hiện tại: ${fmtVnd(effectivePrice)}${
            v.upside_pct != null
              ? ` (${v.upside_pct >= 0 ? "+" : ""}${v.upside_pct.toFixed(1)}% so với giá hợp lý)`
              : ""
          }`,
        ],
        degraded: false,
        snapshot: { rangeLow, rangeHigh, median: v.fair_median, currentPrice: effectivePrice },
      }
    }

    // AI Insight-backed lý do (Kỹ thuật/Dòng tiền/Nội bộ/Tin tức).
    if (insightPending || (!insight && !insightError)) return null
    if (insightError || !layer) {
      return {
        verdict: "trung_tinh",
        lines: ["Không tải được dữ liệu lớp này ngay bây giờ."],
        degraded: true,
        snapshot: {},
      }
    }
    return {
      verdict: verdictFromStatusLevel(layer.statusLevel),
      lines: layer.fields
        .slice(0, 5)
        .map((f) => `${f.label}: ${f.value.map((fr) => fr.content).join("")}`),
      degraded: false,
      snapshot: { statusLabel: layer.statusLabel, statusLevel: layer.statusLevel },
    }
  }, [lyDo, bctc, bctcLoading, bctcError, insight, insightPending, insightError, layer, currentPrice])

  useEffect(() => {
    if (resolved) onVerdict?.(resolved.verdict, { lyDo, ...resolved.snapshot })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.verdict])

  if (!option) return null

  return (
    <div
      data-testid="ai-thanh-tra"
      className="mt-2 space-y-2 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-2.5"
    >
      {/* Header (mockup): 🔍 AI Thanh tra · {tên lớp} — L{n}. 💎 Định giá không
          phải lớp AI Insight (spec §4: BCTC KHỐI 02) nên ghi "BCTC". */}
      <div className="text-[11.5px] font-bold text-[var(--color-text-1)]">
        {`🔍 AI Thanh tra · ${option.label} — ${layerKey ?? "BCTC"}`}
      </div>
      <div className="text-[9.5px] text-[var(--color-text-3)]">{`(Dữ liệu từ ${option.source})`}</div>

      {resolved == null ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-[var(--color-text-3)]">
          <Spin size={14} />
          {"Đang tải dữ liệu lớp…"}
        </div>
      ) : (
        <>
          <div className="space-y-0.5">
            {resolved.lines.map((line, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-[var(--color-text-2)]">
                {line}
              </p>
            ))}
          </div>

          {/* Trạng thái = pill full-width (mockup `.tt-verdict`). Chữ hoa bằng
              CSS nên nội dung vẫn đúng nguyên văn `VERDICT_LABEL`. */}
          <div
            data-testid="ai-thanh-tra-verdict"
            className={cn(
              "w-full rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold uppercase",
              VERDICT_TONE[resolved.verdict],
            )}
          >
            {VERDICT_LABEL[resolved.verdict]}
          </div>

          {!resolved.degraded && (
            <button
              type="button"
              className="text-[10.5px] font-medium text-[rgb(var(--primary-6))] hover:underline"
              onClick={() => {
                // Sự kiện nhiệm vụ bắn TRƯỚC, luôn luôn — Cấp 1 đếm cú bấm này.
                onDocChiTiet?.()
                if (onOpenDetail) {
                  onOpenDetail(symbol)
                  return
                }
                navigate(`/co-phieu/${symbol}`)
              }}
            >
              {"Đọc chi tiết lớp này →"}
            </button>
          )}

          {resolved.verdict === "nguoc_chieu" && !acknowledged && (
            <div className="space-y-1.5 rounded border border-down/30 bg-down/10 p-2">
              <p className="text-[10.5px] text-down">
                {"⚠ Lý do bạn chọn KHÔNG khớp với dữ liệu hiện tại của lớp này."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-[var(--color-border-2)] px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-1)]"
                  onClick={() => onChonLyDoKhac?.()}
                >
                  {"Chọn lý do khác"}
                </button>
                <button
                  type="button"
                  className="rounded border border-[var(--color-border-2)] px-2 py-1 text-[10.5px] font-medium text-[var(--color-text-1)]"
                  onClick={() => setAcknowledgedFor(lyDo)}
                >
                  {"Vẫn đặt lệnh với lý do này"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
