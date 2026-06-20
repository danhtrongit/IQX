// ─── BreadthChart ──────────────────────────────────────────────────────────
// "Độ rộng thị trường HOSE" — 5-row horizontal bar chart.
// Mirrors terminal's `.breadth-rows` + `.breadth-summary` layout.
// Pure presentational — no hook inside.

import type { MarketCharts } from "../types"
import { ChartCard } from "./ChartCard"

// ── Color config ──────────────────────────────────────────────────────────

const ROWS = [
  {
    key: "ceiling" as const,
    label: "Tăng trần",
    dotColor: "#15824F",
    barColor: "#15824F",
    countColor: "#10b981",
  },
  {
    key: "up" as const,
    label: "Tăng",
    dotColor: "#10b981",
    barColor: "#10b981",
    countColor: "#10b981",
  },
  {
    key: "flat" as const,
    label: "Đứng giá",
    dotColor: "var(--color-text-4)",
    barColor: "var(--color-text-4)",
    countColor: "var(--color-text-2)",
  },
  {
    key: "down" as const,
    label: "Giảm",
    dotColor: "#ef4444",
    barColor: "#ef4444",
    countColor: "#ef4444",
  },
  {
    key: "floor" as const,
    label: "Giảm sàn",
    dotColor: "#b0303d",
    barColor: "#b0303d",
    countColor: "#ef4444",
  },
] as const

// ── Props ─────────────────────────────────────────────────────────────────

interface BreadthChartProps {
  data: MarketCharts["breadth"]
}

// ── Component ─────────────────────────────────────────────────────────────

export function BreadthChart({ data }: BreadthChartProps) {
  const total = data.ceiling + data.up + data.flat + data.down + data.floor
  const pctAboveMa20Colored = data.pct_above_ma20 < 50 ? "#ef4444" : "#10b981"
  const ratioColored = data.ratio_up_down.startsWith("1 :") ? "#ef4444" : "#10b981"

  return (
    <ChartCard title="Độ rộng thị trường HOSE">
      {/* 5 rows */}
      <div className="flex flex-col mb-3.5" style={{ gap: 10 }}>
        {ROWS.map((row) => {
          const count = data[row.key]
          const widthPct = total > 0 ? (count / total) * 100 : 0
          return (
            <div
              key={row.key}
              className="grid items-center"
              style={{
                gridTemplateColumns: "100px 1fr 50px",
                gap: 10,
                fontSize: 11.5,
              }}
            >
              {/* Label + dot */}
              <div
                className="flex items-center"
                style={{ gap: 6, color: "var(--color-text-2)" }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: row.dotColor,
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                <span>{row.label}</span>
              </div>

              {/* Bar track + fill */}
              <div
                style={{
                  height: 16,
                  background: "var(--color-fill-2)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: row.barColor,
                    borderRadius: 3,
                  }}
                />
              </div>

              {/* Count */}
              <div
                className="text-right font-bold font-mono"
                style={{ color: row.countColor, fontVariantNumeric: "tabular-nums" }}
              >
                {count}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary stats */}
      <div
        className="grid pt-3 border-t border-[var(--color-border-1)]"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}
      >
        {/* Tỷ lệ T/G */}
        <div>
          <div
            className="uppercase font-bold mb-1"
            style={{
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "var(--color-text-2)",
            }}
          >
            Tỷ lệ T/G
          </div>
          <div
            className="font-mono font-semibold"
            style={{ fontSize: 13, color: ratioColored }}
          >
            {data.ratio_up_down}
          </div>
        </div>

        {/* Phân loại */}
        <div>
          <div
            className="uppercase font-bold mb-1"
            style={{
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "var(--color-text-2)",
            }}
          >
            Phân loại
          </div>
          <div
            className="font-semibold"
            style={{ fontSize: 11, color: "var(--color-text-2)", lineHeight: 1.35 }}
          >
            {data.classification}
          </div>
        </div>

        {/* % > MA20 */}
        <div>
          <div
            className="uppercase font-bold mb-1"
            style={{
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "var(--color-text-2)",
            }}
          >
            {"% > MA20"}
          </div>
          <div
            className="font-mono font-semibold"
            style={{ fontSize: 13, color: pctAboveMa20Colored }}
          >
            {data.pct_above_ma20.toLocaleString("vi-VN", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
            %
          </div>
        </div>
      </div>
    </ChartCard>
  )
}
