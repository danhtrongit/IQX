// ─── ContributionChart ─────────────────────────────────────────────────────
// "Top mã đóng góp ±" — mirrored diverging bar chart.
//   • Negative (red) on the LEFT: value · bar grows leftward · ticker box at the
//     inner edge (next to the center divider).
//   • Positive (green) on the RIGHT: ticker box at the inner edge · bar grows
//     rightward · value at the outer edge.
// A continuous vertical divider separates the two columns, so the ticker boxes
// flank the center. Backgrounds/text use theme tokens; bars + ticker boxes use
// semantic red/green (same in light & dark). Pure presentational.

import type { MarketCharts } from "../types"
import { ChartCard } from "./ChartCard"

// ── Props ─────────────────────────────────────────────────────────────────

interface ContributionChartProps {
  data: MarketCharts["contribution"]
}

// ── Tokens ──────────────────────────────────────────────────────────────────

const RED_BAR = "linear-gradient(180deg, #f87171 0%, #ef4444 55%, #dc2626 100%)"
const GREEN_BAR = "linear-gradient(180deg, #34d399 0%, #22c55e 55%, #16a34a 100%)"
const RED_BOX = "#ef4444"
const GREEN_BOX = "#16a34a"
const ROW_H = 32
const BAR_H = 26
const MIN_BAR = 6 // px — keep a visible sliver for tiny values

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(points: number, positive: boolean): string {
  const abs = Math.abs(points).toFixed(2)
  return positive ? abs : `-${abs}`
}

function TickerBox({ ticker, color }: { ticker: string; color: string }) {
  return (
    <div
      style={{
        height: BAR_H,
        minWidth: 46,
        padding: "0 8px",
        background: color,
        color: "#fff",
        fontSize: 12.5,
        fontWeight: 700,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        letterSpacing: "-0.01em",
      }}
    >
      {ticker}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export function ContributionChart({ data }: ContributionChartProps) {
  const { top_negative, top_positive } = data

  const maxAbs = Math.max(
    1,
    ...top_negative.map((d) => Math.abs(d.points)),
    ...top_positive.map((d) => Math.abs(d.points)),
  )
  // Bar shares its track with the value label, so reserve ~52px for the value
  // (+gap): the longest bar = track − 52px, shorter bars scale linearly. This
  // keeps the value label always visible just beyond the bar's outer end.
  const barWidth = (points: number) => {
    const ratio = (Math.abs(points) / maxAbs).toFixed(4)
    return `max(${MIN_BAR}px, calc((100% - 52px) * ${ratio}))`
  }

  const rowCount = Math.max(top_negative.length, top_positive.length)
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    neg: top_negative[i] ?? null,
    pos: top_positive[i] ?? null,
  }))

  if (rowCount === 0) {
    return (
      <ChartCard title="Top mã đóng góp ±">
        <div className="text-[13px] text-[var(--color-text-3)] py-6 text-center">
          Không có dữ liệu đóng góp điểm số.
        </div>
      </ChartCard>
    )
  }

  const pillStyle = {
    height: ROW_H,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 4px",
    background: "var(--color-fill-1)",
    border: "1px solid var(--color-border-1)",
    borderRadius: 8,
    overflow: "hidden",
  } as const

  const valueStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-1)",
    whiteSpace: "nowrap" as const,
    fontVariantNumeric: "tabular-nums" as const,
  }

  return (
    <ChartCard title="Top mã đóng góp ±">
      <div style={{ position: "relative" }}>
        {/* Center divider — continuous vertical line between the two columns */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            transform: "translateX(-50%)",
            background: "var(--color-border-2)",
          }}
        />

        <div className="flex flex-col" style={{ gap: 7 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid items-center"
              style={{ gridTemplateColumns: "1fr 1fr", columnGap: 18 }}
            >
              {/* ── Negative side (left) ── value · bar(→left) · ticker ── */}
              <div style={pillStyle}>
                {row.neg ? (
                  <>
                    {/* track: right-packed so [value][bar] sit next to ticker */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 8,
                      }}
                    >
                      <span style={valueStyle}>{fmt(row.neg.points, false)}</span>
                      <div
                        style={{
                          width: barWidth(row.neg.points),
                          height: BAR_H,
                          background: RED_BAR,
                          borderRadius: 5,
                          flexShrink: 0,
                        }}
                      />
                    </div>
                    <TickerBox ticker={row.neg.ticker} color={RED_BOX} />
                  </>
                ) : null}
              </div>

              {/* ── Positive side (right) ── ticker · bar(→right) · value ── */}
              <div style={pillStyle}>
                {row.pos ? (
                  <>
                    <TickerBox ticker={row.pos.ticker} color={GREEN_BOX} />
                    {/* track: left-packed so [bar][value] sit next to ticker */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: barWidth(row.pos.points),
                          height: BAR_H,
                          background: GREEN_BAR,
                          borderRadius: 5,
                          flexShrink: 0,
                        }}
                      />
                      <span style={valueStyle}>{fmt(row.pos.points, true)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
