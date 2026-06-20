// ─── ContributionChart ─────────────────────────────────────────────────────
// "Top mã đóng góp ±" — 2-way diverging bar chart.
// Negative tickers anchor to the left zone (bars grow from right of zone),
// positive tickers anchor to the right zone (bars grow from left of zone).
// Ticker + value are printed INSIDE the bar. No "KÉO INDEX" text.
// Pure presentational — no hook inside.

import type { MarketCharts } from "../types"
import { ChartCard } from "./ChartCard"

// ── Props ─────────────────────────────────────────────────────────────────

interface ContributionChartProps {
  data: MarketCharts["contribution"]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatPoints(points: number, isPositive: boolean): string {
  const abs = Math.abs(points).toFixed(2)
  return isPositive ? `+${abs}` : `-${abs}`
}

// ── Component ─────────────────────────────────────────────────────────────

export function ContributionChart({ data }: ContributionChartProps) {
  const { top_negative, top_positive } = data

  // Determine scale: max absolute value across all tickers
  const allAbs = [
    ...top_negative.map((d) => Math.abs(d.points)),
    ...top_positive.map((d) => Math.abs(d.points)),
  ]
  const maxAbs = allAbs.length > 0 ? Math.max(...allAbs) : 1

  const rowCount = Math.max(top_negative.length, top_positive.length)
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    neg: top_negative[i] ?? null,
    pos: top_positive[i] ?? null,
  }))

  return (
    <ChartCard title="Top mã đóng góp ±">
      <div className="flex flex-col" style={{ gap: 5 }}>
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid items-center"
            style={{ gridTemplateColumns: "1fr 1fr", gap: 6 }}
          >
            {/* ── Negative side (left) — bar grows from right ── */}
            <div
              style={{
                height: 20,
                background: "var(--color-fill-1)",
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              {row.neg && (
                <div
                  style={{
                    width: `${(Math.abs(row.neg.points) / maxAbs) * 100}%`,
                    height: "100%",
                    background: "#ef4444",
                    borderRadius: 2,
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  {/* Ticker — left inside bar */}
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FFE0E3",
                      fontFamily: "monospace",
                      zIndex: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.neg.ticker}
                  </span>
                  {/* Value — right inside bar */}
                  <span
                    style={{
                      position: "absolute",
                      right: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#FFE0E3",
                      fontFamily: "monospace",
                      zIndex: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatPoints(row.neg.points, false)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Positive side (right) — bar grows from left ── */}
            <div
              style={{
                height: 20,
                background: "var(--color-fill-1)",
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              {row.pos && (
                <div
                  style={{
                    width: `${(Math.abs(row.pos.points) / maxAbs) * 100}%`,
                    height: "100%",
                    background: "#10b981",
                    borderRadius: 2,
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  {/* Ticker — left inside bar */}
                  <span
                    style={{
                      position: "absolute",
                      left: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#DFFCE9",
                      fontFamily: "monospace",
                      zIndex: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.pos.ticker}
                  </span>
                  {/* Value — right inside bar */}
                  <span
                    style={{
                      position: "absolute",
                      right: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#DFFCE9",
                      fontFamily: "monospace",
                      zIndex: 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatPoints(row.pos.points, true)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
