// ─── MarketPulseBar ──────────────────────────────────────────────────────────
// 5-cell summary bar matching the terminal's .pulse block (iqx-terminal-final.html).
// Grid: 1.4fr hero (VN-Index) + 4 × 1fr equal cells.
// Reuses: useMarketOverview (VN-Index value/change + breadth + liquidity),
//         useForeignFlow (net value).
// "Sức khỏe TT" (% above MA20) is not in any existing hook → shows "—".
// Numbers use tabular-nums for alignment.

import { useMarketOverview, useForeignFlow } from "../hooks"
import { changeColor, changeArrow } from "../utils"
import "./article.css" // for .num / .up-text / .down-text tokens

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CellProps {
  label: string
  children: React.ReactNode
  hero?: boolean
}

function PulseCell({ label, children, hero }: CellProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1 bg-[var(--color-bg-2)] border-[var(--color-border-2)]",
        hero ? "px-5 py-4" : "px-4 py-3.5",
      ].join(" ")}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        {label}
      </span>
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MarketPulseBar() {
  const { data: ov, loading: ovLoading } = useMarketOverview()
  const { data: ff, loading: ffLoading } = useForeignFlow()

  const loading = ovLoading || ffLoading
  const vni = ov.vnindex
  const breadth = ov.marketBreadth

  // Thanh khoản: VNIndex value_traded in VND → convert to tỷ
  const liquidityBillions = vni.value_traded / 1e9
  // Reference: 0 means no comparison available yet
  // liquidityLabel built inline in JSX

  // Khối ngoại net
  const netValue = ff.netValue
  const netSign = netValue > 0 ? "+" : ""
  const netLabel = loading ? "—" : `${netSign}${fmt(Math.round(netValue / 1e9), 0)} tỷ`
  const netColor = netValue > 0 ? "text-up" : netValue < 0 ? "text-down" : "text-[var(--color-text-1)]"

  // Breadth ratio: advance / (advance + decline) with fallback
  const total = breadth.advance + breadth.decline + breadth.unchanged
  const advancePct = total > 0 ? (breadth.advance / total) * 100 : 0
  const unchangedPct = total > 0 ? (breadth.unchanged / total) * 100 : 0
  const declinePct = total > 0 ? (breadth.decline / total) * 100 : 0

  const ratioStr =
    !loading && breadth.decline > 0
      ? `tỷ lệ 1:${(breadth.decline / (breadth.advance || 1)).toFixed(1)}`
      : "tỷ lệ —"

  return (
    <div
      className="grid gap-px bg-[var(--color-border-2)] rounded-xl overflow-hidden border border-[var(--color-border-2)] mb-3.5"
      style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
      aria-label="Thống kê nhanh thị trường"
    >
      {/* ── Cell 1: VN-Index (hero) ── */}
      <PulseCell label="VN-INDEX" hero>
        <div className="flex items-baseline gap-3">
          <span
            className={`num text-[28px] font-semibold tracking-[-0.02em] tabular-nums ${
              loading ? "text-[var(--color-text-3)]" : changeColor(vni.changePercent)
            }`}
          >
            {loading ? "—" : fmt(vni.value)}
          </span>
          {!loading && (
            <div className="flex flex-col leading-tight">
              <span className={`num text-xs font-medium tabular-nums ${changeColor(vni.change)}`}>
                {vni.change >= 0 ? "+" : ""}
                {fmt(vni.change)}
              </span>
              <span className={`num text-[11px] font-medium tabular-nums ${changeColor(vni.changePercent)}`}>
                {changeArrow(vni.changePercent)}{Math.abs(vni.changePercent).toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      </PulseCell>

      {/* ── Cell 2: Độ rộng ── */}
      <PulseCell label="ĐỘ RỘNG">
        <div className="flex items-baseline gap-1 text-lg font-semibold tabular-nums">
          <span className="text-up num">{loading ? "—" : breadth.advance.toLocaleString("vi-VN")}</span>
          <span className="text-[var(--color-text-3)] text-sm">·</span>
          <span className="text-down num">{loading ? "—" : breadth.decline.toLocaleString("vi-VN")}</span>
        </div>
        {!loading && (
          <>
            <span className="text-[11px] text-[var(--color-text-3)] mt-1">
              {ratioStr}
              {breadth.unchanged > 0 && ` · ${breadth.unchanged.toLocaleString("vi-VN")} đứng`}
            </span>
            {/* Breadth bar */}
            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--color-fill-2)] flex mt-2">
              <div style={{ width: `${advancePct}%` }} className="bg-up h-full" />
              <div style={{ width: `${unchangedPct}%` }} className="bg-[var(--color-text-4)] h-full" />
              <div style={{ width: `${declinePct}%` }} className="bg-down h-full" />
            </div>
          </>
        )}
      </PulseCell>

      {/* ── Cell 3: Khối ngoại ── */}
      <PulseCell label="KHỐI NGOẠI">
        <span className={`num text-lg font-semibold tabular-nums ${netColor}`}>
          {netLabel}
        </span>
        {!loading && (
          <span className="text-[11px] text-[var(--color-text-3)] mt-1">
            {netValue > 0 ? "Mua ròng" : netValue < 0 ? "Bán ròng" : "Cân bằng"}
          </span>
        )}
      </PulseCell>

      {/* ── Cell 4: Thanh khoản ── */}
      <PulseCell label="THANH KHOẢN">
        <div className="flex items-baseline gap-1">
          <span className="num text-lg font-semibold tabular-nums text-[var(--color-text-1)]">
            {loading ? "—" : fmt(liquidityBillions, 0)}
          </span>
          {!loading && (
            <span className="text-[11px] text-[var(--color-text-3)]">tỷ</span>
          )}
        </div>
        {!loading && (
          <span className="text-[11px] text-[var(--color-text-3)] mt-1">
            GTGD VNIndex
          </span>
        )}
      </PulseCell>

      {/* ── Cell 5: Sức khỏe TT ── */}
      <PulseCell label="SỨC KHỎE TT">
        {/* % mã trên MA20 not available from existing hooks → graceful placeholder */}
        <span className="num text-lg font-semibold tabular-nums text-[var(--color-text-3)]">
          —
        </span>
        <span className="text-[11px] text-[var(--color-text-3)] mt-1">
          % mã trên MA20
        </span>
      </PulseCell>
    </div>
  )
}
