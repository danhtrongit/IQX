// ─── HealthLineChart ────────────────────────────────────────────────────────
// "Sức khỏe thị trường" — SVG line chart of % stocks above MA20 over 20 days.
// Mirrors terminal's renderHealthChart(). Pure presentational.

import type { MarketCharts } from "../types"
import { ChartCard } from "./ChartCard"

// ── Props ─────────────────────────────────────────────────────────────────

interface HealthLineChartProps {
  data: MarketCharts["market_health_detail"]
  classification: string
}

// ── Color helpers ─────────────────────────────────────────────────────────

function getTodayColor(value: number | null): string {
  if (value === null) return "var(--color-text-3)"
  if (value >= 70) return "#22C77F"
  if (value >= 30) return "#FFB347"
  return "#FF4D5E"
}

function getCalloutColor(type: "warning" | "positive" | "neutral" | undefined): string {
  if (type === "warning") return "#ef4444"
  if (type === "positive") return "#22C77F"
  return "var(--color-text-2)"
}

// ── Component ─────────────────────────────────────────────────────────────

export function HealthLineChart({ data, classification }: HealthLineChartProps) {
  const { pct_above_ma20, trend_20d, callout } = data

  // Compute peak from trend_20d client-side
  let peak: { value: number; index: number } | null = null
  if (trend_20d.length > 0) {
    let maxVal = trend_20d[0]
    let maxIdx = 0
    for (let i = 1; i < trend_20d.length; i++) {
      if (trend_20d[i] > maxVal) {
        maxVal = trend_20d[i]
        maxIdx = i
      }
    }
    peak = { value: maxVal, index: maxIdx }
  }

  // Layout constants matching terminal
  const padL = 32
  const padR = 8
  const padT = 10
  const padB = 22
  const W = 320   // logical width (SVG viewBox)
  const H = 180   // logical height

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  // Y axis range — fixed min=28 max=60 per spec
  const yMin = 28
  const yMax = 60

  // Coordinate helpers
  const n = trend_20d.length
  function x(i: number): number {
    return padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  }
  function y(v: number): number {
    return padT + ((yMax - v) / (yMax - yMin)) * innerH
  }

  // Build polyline points string
  const polylinePoints = trend_20d
    .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")

  const todayColor = getTodayColor(pct_above_ma20)

  // Grid lines at 30, 40, 50, 60
  const gridValues = [30, 40, 50, 60]

  // X-axis tick indices: 0, 5, 10, 15, last
  const lastIdx = n - 1
  const tickIndices = Array.from(new Set([0, 5, 10, 15, lastIdx].filter((i) => i < n)))

  // Today display value (last point of trend_20d takes priority, fallback to pct_above_ma20)
  const todayValue = pct_above_ma20

  return (
    <ChartCard title="Sức khỏe thị trường">
      {/* SVG line chart */}
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {/* Grid lines */}
        {gridValues.map((val) => {
          const yPos = y(val)
          return (
            <g key={val}>
              <line
                x1={padL}
                y1={yPos}
                x2={W - padR}
                y2={yPos}
                stroke="var(--color-border-1)"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <text
                x={padL - 3}
                y={yPos + 3.5}
                fontSize={9}
                fill="var(--color-text-3)"
                textAnchor="end"
              >
                {val}%
              </text>
            </g>
          )
        })}

        {/* Dashed baseline at y=50 */}
        <line
          x1={padL}
          y1={y(50)}
          x2={W - padR}
          y2={y(50)}
          stroke="var(--color-text-3)"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />

        {/* X-axis tick labels */}
        {tickIndices.map((idx) => {
          const xPos = x(idx)
          const isLast = idx === lastIdx
          const label = isLast ? "HÔM NAY" : `−${lastIdx - idx}p`
          return (
            <text
              key={idx}
              x={xPos}
              y={H - padB + 14}
              fontSize={9}
              fill="var(--color-text-3)"
              textAnchor={isLast ? "end" : idx === 0 ? "start" : "middle"}
            >
              {label}
            </text>
          )
        })}

        {/* Data polyline */}
        {trend_20d.length >= 2 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={todayColor}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}

        {/* Peak dot + label */}
        {peak !== null && (
          <g>
            <circle
              cx={x(peak.index)}
              cy={y(peak.value)}
              r={3}
              fill="#FFB347"
            />
            <text
              x={x(peak.index) + 6}
              y={y(peak.value) - 6}
              fontSize={9}
              fill="#FFB347"
            >
              đỉnh {peak.value}%
            </text>
          </g>
        )}

        {/* Today pulse dot */}
        {trend_20d.length > 0 && (
          <g>
            {/* Animated outer ring */}
            <circle
              cx={x(lastIdx)}
              cy={y(trend_20d[lastIdx])}
              r={8}
              fill={todayColor}
              opacity={0.3}
            >
              <animate
                attributeName="r"
                values="4;10;4"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.4;0;0.4"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Solid center dot */}
            <circle
              cx={x(lastIdx)}
              cy={y(trend_20d[lastIdx])}
              r={4}
              fill={todayColor}
            />
          </g>
        )}
      </svg>

      {/* Today value + classification */}
      <div style={{ marginTop: 8, textAlign: "center" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: todayColor,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.2,
          }}
        >
          {todayValue === null
            ? "—"
            : todayValue.toLocaleString("vi-VN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }) + "%"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-2)",
            marginTop: 3,
          }}
        >
          {classification}
        </div>
      </div>

      {/* Callout box */}
      {callout !== null && callout !== undefined && (
        <div
          style={{
            fontSize: 10.5,
            padding: "8px 10px",
            background: "var(--color-fill-2)",
            borderRadius: 6,
            marginTop: 8,
            color: getCalloutColor(callout.type),
            lineHeight: 1.5,
          }}
        >
          {callout.text}
        </div>
      )}
    </ChartCard>
  )
}
