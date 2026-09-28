// ─── MidDayPulseBar — 5 con số của phiên sáng ────────────────────────────────
// Prop-driven (MidDayView owns the fetch and the lunch freeze). Cells:
//   1. VN-Index  (giá trị + thay đổi + sparkline phiên sáng)
//   2. Độ rộng   (mã tăng · mã giảm)
//   3. Khối ngoại ròng (tỷ) + chuỗi phiên
//   4. Thanh khoản AM so với MA20
//   5. Sức khỏe thị trường — FROZEN, số cuối ngày, chờ 16:30
//
// The sparkline is a hand-rolled inline SVG polyline (the legacy did the same):
// a 56×20 px strip does not deserve a chart library.

import type { ReactNode } from "react"
import { Pause } from "lucide-react"

import { cn } from "@/lib/utils"

import { formatSignedPercent, formatVndBillion, toneClass } from "../../format"
import type { MidDayAnalysis, MidDayCharts } from "../../types"

/** The index level keeps two decimals — the only place in the view that does. */
const INDEX_DECIMALS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

function PulseCell({
  label,
  children,
  hero,
  frozen,
}: {
  label: string
  children: ReactNode
  hero?: boolean
  frozen?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-1", frozen ? "bg-muted" : "bg-card", hero ? "p-4" : "p-3")}>
      <span
        className={cn(
          "text-xs font-semibold tracking-[0.08em] uppercase",
          frozen ? "text-muted-foreground/70" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * Sparkline of the morning tick series. Stroke is `currentColor`, so the
 * direction tone is applied with a price token class rather than a hex value.
 */
function Sparkline({ values, className }: { values: number[]; className: string }) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 56
  const h = 20
  const step = w / (values.length - 1)
  const points = values
    .map((value, index) => `${(index * step).toFixed(2)},${(h - ((value - min) / range) * h).toFixed(2)}`)
    .join(" ")

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * `foreign_detail` can degrade to `{data_state:"unavailable"}` — truthy, but
 * missing every field. The 2026-07-02 prod crash was this card dereferencing
 * `streak.direction` of undefined, so the streak is only used when it is shaped.
 */
function readStreak(
  block: MidDayCharts["foreign_detail"] | undefined,
): NonNullable<MidDayCharts["foreign_detail"]>["streak"] | undefined {
  const streak = block?.streak
  if (!streak || typeof streak.direction !== "string" || typeof streak.count !== "number") return undefined
  return streak
}

export function MidDayPulseBar({ data, isLunch }: { data: MidDayAnalysis; isLunch: boolean }) {
  const pulse = data.pulse
  const healthDetail = data.charts?.market_health_detail

  // ── Cell 1: VN-Index ───────────────────────────────────────────────────────
  const vni = pulse?.vn_index
  const vniValue = vni ? vni.value.toLocaleString("en-US", INDEX_DECIMALS) : "—"
  const vniChange = vni ? `${vni.change >= 0 ? "+" : ""}${vni.change.toLocaleString("en-US", INDEX_DECIMALS)}` : null
  const vniPct = vni ? formatSignedPercent(vni.change_pct) : null
  const sparklineTone = vni ? (vni.change_pct >= 0 ? "text-price-up" : "text-price-down") : "text-accent"

  // ── Cell 2: Độ rộng ────────────────────────────────────────────────────────
  const breadthUp = pulse?.breadth.up ?? data.charts?.breadth?.up
  const breadthDown = pulse?.breadth.down ?? data.charts?.breadth?.down

  // ── Cell 3: Khối ngoại ─────────────────────────────────────────────────────
  const foreignNet = pulse?.foreign_net_billion
  const foreignNetLabel =
    foreignNet != null ? `${foreignNet > 0 ? "+" : ""}${formatVndBillion(foreignNet * 1e9)}` : "—"
  const streak = readStreak(data.charts?.foreign_detail)
  const streakLabel = streak
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

  // ── Cell 4: Thanh khoản phiên sáng ─────────────────────────────────────────
  const liq = pulse?.liquidity
  const liqValue = liq ? formatVndBillion(liq.am_value_billion * 1e9) : "—"
  const vsMa20 = liq?.vs_ma20_pct != null ? `${formatSignedPercent(liq.vs_ma20_pct, 0)} vs MA20` : null

  // ── Cell 5: Sức khỏe thị trường (FROZEN) ───────────────────────────────────
  const healthPct = healthDetail?.pct_above_ma20 != null ? `${healthDetail.pct_above_ma20.toFixed(0)}%` : "—"

  return (
    <div>
      {isLunch && (
        <div
          className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-[13px] font-semibold text-accent"
          aria-label="Tạm chốt cuối phiên sáng"
        >
          <Pause className="size-4 shrink-0" aria-hidden />
          <span>Tạm chốt cuối phiên sáng</span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">Chờ phiên chiều 13:00</span>
        </div>
      )}

      <div
        className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]"
        aria-label="Thống kê nhanh phiên sáng"
      >
        <PulseCell label="VN-INDEX" hero>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "text-[28px] font-semibold tracking-[-0.02em] tabular-nums",
                vni ? toneClass(vni.change_pct) : "text-muted-foreground",
              )}
            >
              {vniValue}
            </span>
            {vni && (
              <div className="mt-1 flex flex-col leading-tight">
                <span className={cn("text-xs font-medium tabular-nums", toneClass(vni.change))}>{vniChange}</span>
                <span className={cn("text-xs font-medium tabular-nums", toneClass(vni.change_pct))}>{vniPct}</span>
              </div>
            )}
          </div>
          {vni && vni.sparkline.length > 1 && (
            <div className="mt-1">
              <Sparkline values={vni.sparkline} className={sparklineTone} />
            </div>
          )}
        </PulseCell>

        <PulseCell label="ĐỘ RỘNG">
          <div className="flex items-baseline gap-1 text-lg font-semibold tabular-nums">
            <span className="text-price-up">{breadthUp != null ? Math.round(breadthUp).toLocaleString("en-US") : "—"}</span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-price-down">{breadthDown != null ? Math.round(breadthDown).toLocaleString("en-US") : "—"}</span>
          </div>
          <span className="mt-1 text-xs text-muted-foreground">Tăng · Giảm</span>
        </PulseCell>

        <PulseCell label="KHỐI NGOẠI">
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              foreignNet != null ? toneClass(foreignNet) : "text-muted-foreground",
            )}
          >
            {foreignNetLabel}
          </span>
          {streakLabel && <span className="mt-1 text-xs text-muted-foreground">{streakLabel}</span>}
        </PulseCell>

        <PulseCell label="THANH KHOẢN AM">
          <span className="text-lg font-semibold tabular-nums text-accent">{liqValue}</span>
          {vsMa20 ? (
            <span className="mt-1 text-xs text-muted-foreground">{vsMa20}</span>
          ) : liq ? (
            <span className="mt-1 text-xs text-muted-foreground">GTGD phiên sáng</span>
          ) : null}
        </PulseCell>

        <PulseCell label="SỨC KHỎE TT" frozen>
          <span className="text-lg font-semibold tabular-nums text-muted-foreground">{healthPct}</span>
          <span className="mt-1 text-xs text-muted-foreground">Số cuối ngày · chờ 16:30</span>
        </PulseCell>
      </div>
    </div>
  )
}
