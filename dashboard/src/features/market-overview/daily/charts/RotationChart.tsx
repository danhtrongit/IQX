// ─── RotationChart ──────────────────────────────────────────────────────────
// "Dòng tiền chuyển nhóm" — diverging horizontal bar chart by sector.
// Mirrors terminal's renderRotation(). Pure presentational.

import type { MarketCharts } from "../types"
import { ChartCard } from "./ChartCard"

// ── Props ─────────────────────────────────────────────────────────────────

interface RotationChartProps {
  data: MarketCharts["sector_rotation"]
}

// ── Component ─────────────────────────────────────────────────────────────

export function RotationChart({ data }: RotationChartProps) {
  // Sort descending by net (inflows first)
  const sorted = [...data].sort((a, b) => b.net - a.net)
  const maxAbs = Math.max(...sorted.map((row) => Math.abs(row.net)), 1)

  return (
    <ChartCard title="Dòng tiền chuyển nhóm">
      {/* Subtitle */}
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          color: "var(--color-text-2)",
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        DÒNG TIỀN THEO NGÀNH (tỷ VND)
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {sorted.map((row) => {
          const isPositive = row.net >= 0
          const barColor = isPositive ? "#10b981" : "#ef4444"
          const barWidthPct = (Math.abs(row.net) / maxAbs) * 48

          return (
            <div
              key={row.sector}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr 52px",
                gap: 10,
                fontSize: 12,
                alignItems: "center",
              }}
            >
              {/* Col 1: sector name */}
              <div
                style={{
                  color: "var(--color-text-1)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.sector}
              </div>

              {/* Col 2: diverging bar */}
              <div style={{ position: "relative", height: 16 }}>
                {/* Center line */}
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: "var(--color-border-1)",
                  }}
                />
                {/* Bar */}
                <div
                  style={{
                    position: "absolute",
                    top: 3,
                    bottom: 3,
                    borderRadius: 2,
                    ...(isPositive
                      ? { left: "50%", width: `${barWidthPct}%` }
                      : { right: "50%", width: `${barWidthPct}%` }),
                    background: barColor,
                  }}
                />
              </div>

              {/* Col 3: value label */}
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  textAlign: "right",
                  fontWeight: 600,
                  color: barColor,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {isPositive ? "+" : ""}
                {row.net.toFixed(2)} tỷ
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}
