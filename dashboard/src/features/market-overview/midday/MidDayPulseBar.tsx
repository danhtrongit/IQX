// ─── MidDayPulseBar ───────────────────────────────────────────────────────────
// Prop-driven 5-cell pulse bar for the mid-day (phiên sáng) report.
// Mirrors MarketPulseBar's grid layout but reads from MidDayAnalysis props —
// no internal hooks; the parent controls refetch / freeze during lunch.
//
// Cells:
//  1. VN-Index hero  (value + signed change + AM sparkline)
//  2. Breadth        (up / down counts)
//  3. Khối ngoại     (foreign net billion + streak direction)
//  4. Thanh khoản AM (AM value vs MA20)
//  5. Sức khỏe TT    (FROZEN — grey, shows "Số cuối ngày · chờ 16:30")
//
// When isLunch=true, a "Tạm chốt cuối phiên sáng" banner is rendered above
// the cell grid.

import type { MidDayAnalysis } from "./types"
import { changeColor, changeArrow } from "../utils"
import "./midday.css"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CellProps {
  label: string
  children: React.ReactNode
  hero?: boolean
  frozen?: boolean
}

function PulseCell({ label, children, hero, frozen }: CellProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1 border-[var(--color-border-2)]",
        frozen
          ? "bg-[var(--color-fill-2)]"
          : "bg-[var(--color-bg-2)]",
        hero ? "px-5 py-4" : "px-4 py-3.5",
      ].join(" ")}
    >
      <span
        className={[
          "text-[10px] font-semibold uppercase tracking-[0.08em]",
          frozen
            ? "text-[var(--color-text-4)]"
            : "text-[var(--color-text-3)]",
        ].join(" ")}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

// ─── Sparkline (inline SVG) ───────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 56
  const h = 20
  const step = w / (values.length - 1)

  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ")

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: MidDayAnalysis
  isLunch: boolean
}

export function MidDayPulseBar({ data, isLunch }: Props) {
  const pulse = data.pulse
  const healthDetail = data.charts?.market_health_detail

  // ── Cell 1: VN-Index ──────────────────────────────────────────────────────
  const vni = pulse?.vn_index
  const vniValue = vni ? fmt(vni.value) : "—"
  const vniChange = vni ? (vni.change >= 0 ? "+" : "") + fmt(vni.change) : null
  const vniPct = vni
    ? changeArrow(vni.change_pct) + Math.abs(vni.change_pct).toFixed(2) + "%"
    : null
  const sparklineColor = vni
    ? vni.change_pct >= 0
      ? "#10b981"
      : "#ef4444"
    : "#FFB347"

  // ── Cell 2: Breadth ───────────────────────────────────────────────────────
  const breadthUp = pulse?.breadth.up ?? data.charts?.breadth?.up
  const breadthDown = pulse?.breadth.down ?? data.charts?.breadth?.down

  // ── Cell 3: Khối ngoại ────────────────────────────────────────────────────
  const foreignNet = pulse?.foreign_net_billion
  const foreignNetSign = foreignNet != null ? (foreignNet >= 0 ? "+" : "") : ""
  const foreignNetLabel =
    foreignNet != null ? `${foreignNetSign}${fmtInt(foreignNet)} tỷ` : "—"
  const foreignNetColor =
    foreignNet != null
      ? foreignNet > 0
        ? "text-up"
        : foreignNet < 0
          ? "text-down"
          : "text-[var(--color-text-1)]"
      : "text-[var(--color-text-3)]"

  const streak = data.charts?.foreign_detail?.streak
  const streakLabel =
    streak
      ? streak.direction === "buy"
        ? `Mua ròng ${streak.count} phiên`
        : streak.direction === "sell"
          ? `Bán ròng ${streak.count} phiên`
          : "Hỗn hợp"
      : foreignNet != null
        ? foreignNet > 0
          ? "Mua ròng"
          : foreignNet < 0
            ? "Bán ròng"
            : "Cân bằng"
        : null

  // ── Cell 4: Thanh khoản AM ────────────────────────────────────────────────
  const liq = pulse?.liquidity
  const liqValue = liq ? fmtInt(liq.am_value_billion) : "—"
  const vsMa20 =
    liq?.vs_ma20_pct != null
      ? `${liq.vs_ma20_pct > 0 ? "+" : ""}${liq.vs_ma20_pct.toFixed(0)}% vs MA20`
      : null

  // ── Cell 5: Market health (FROZEN) ────────────────────────────────────────
  const healthPct =
    healthDetail?.pct_above_ma20 != null
      ? `${healthDetail.pct_above_ma20.toFixed(0)}%`
      : "—"

  return (
    <div>
      {/* Lunch banner */}
      {isLunch && (
        <div
          className="flex items-center gap-2 px-4 py-2 mb-2 rounded-lg text-[13px] font-semibold"
          style={{
            background: "var(--mm-accent-soft, #FFB34722)",
            color: "var(--mm-accent, #FFB347)",
            border: "1px solid var(--mm-accent, #FFB347)",
          }}
          aria-label="Tạm chốt cuối phiên sáng"
        >
          <span>⏸</span>
          <span>Tạm chốt cuối phiên sáng</span>
          <span
            className="text-[11px] font-normal text-[var(--color-text-3)] ml-auto"
          >
            Chờ phiên chiều 13:00
          </span>
        </div>
      )}

      {/* 5-cell grid */}
      <div
        className="grid gap-px bg-[var(--color-border-2)] rounded-xl overflow-hidden border border-[var(--color-border-2)]"
        style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr" }}
        aria-label="Thống kê nhanh phiên sáng"
      >
        {/* ── Cell 1: VN-Index hero ── */}
        <PulseCell label="VN-INDEX" hero>
          <div className="flex items-start gap-3">
            <span
              className={`num text-[28px] font-semibold tracking-[-0.02em] tabular-nums ${
                vni ? changeColor(vni.change_pct) : "text-[var(--color-text-3)]"
              }`}
            >
              {vniValue}
            </span>
            {vni && (
              <div className="flex flex-col leading-tight mt-1">
                <span
                  className={`num text-xs font-medium tabular-nums ${changeColor(vni.change)}`}
                >
                  {vniChange}
                </span>
                <span
                  className={`num text-[11px] font-medium tabular-nums ${changeColor(vni.change_pct)}`}
                >
                  {vniPct}
                </span>
              </div>
            )}
          </div>
          {vni && vni.sparkline.length > 1 && (
            <div className="mt-1">
              <Sparkline values={vni.sparkline} color={sparklineColor} />
            </div>
          )}
        </PulseCell>

        {/* ── Cell 2: Breadth ── */}
        <PulseCell label="ĐỘ RỘNG">
          <div className="flex items-baseline gap-1 text-lg font-semibold tabular-nums">
            <span className="text-up num">
              {breadthUp != null ? breadthUp.toLocaleString("en-US") : "—"}
            </span>
            <span className="text-[var(--color-text-3)] text-sm">·</span>
            <span className="text-down num">
              {breadthDown != null ? breadthDown.toLocaleString("en-US") : "—"}
            </span>
          </div>
          <span className="text-[11px] text-[var(--color-text-3)] mt-1">
            Tăng · Giảm
          </span>
        </PulseCell>

        {/* ── Cell 3: Khối ngoại ── */}
        <PulseCell label="KHỐI NGOẠI">
          <span
            className={`num text-lg font-semibold tabular-nums ${foreignNetColor}`}
          >
            {foreignNetLabel}
          </span>
          {streakLabel && (
            <span className="text-[11px] text-[var(--color-text-3)] mt-1">
              {streakLabel}
            </span>
          )}
        </PulseCell>

        {/* ── Cell 4: Thanh khoản AM ── */}
        <PulseCell label="THANH KHOẢN AM">
          <div className="flex items-baseline gap-1">
            <span
              className="num text-lg font-semibold tabular-nums"
              style={{ color: "var(--mm-accent, #FFB347)" }}
            >
              {liqValue}
            </span>
            {liq && (
              <span className="text-[11px] text-[var(--color-text-3)]">tỷ</span>
            )}
          </div>
          {vsMa20 && (
            <span className="text-[11px] text-[var(--color-text-3)] mt-1">
              {vsMa20}
            </span>
          )}
          {!vsMa20 && liq && (
            <span className="text-[11px] text-[var(--color-text-3)] mt-1">
              GTGD phiên sáng
            </span>
          )}
        </PulseCell>

        {/* ── Cell 5: Sức khỏe TT (FROZEN) ── */}
        <PulseCell label="SỨC KHỎE TT" frozen>
          <span className="num text-lg font-semibold tabular-nums text-[var(--color-text-3)]">
            {healthPct}
          </span>
          <span className="text-[11px] text-[var(--color-text-3)] mt-1">
            Số cuối ngày · chờ 16:30
          </span>
        </PulseCell>
      </div>
    </div>
  )
}
