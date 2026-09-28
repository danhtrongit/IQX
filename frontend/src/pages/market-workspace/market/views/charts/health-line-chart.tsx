import type { MarketCharts } from "../../types"
import { ChartCard } from "./chart-card"

/** SVG logical canvas (the element scales to its container width). */
const W = 320
const H = 180
const PAD_L = 32
const PAD_R = 8
const PAD_T = 10
const PAD_B = 22
/** Fixed y-range from the legacy chart: below 28% / above 60% is clamped. */
const Y_MIN = 28
const Y_MAX = 60
const GRID_VALUES = [30, 40, 50, 60]

/** Line/dot/value tone: weak breadth is red, mid is the reference gold, strong green. */
function todayTone(value: number | null) {
  if (value === null) {
    return { line: "stroke-muted-foreground", fill: "fill-muted-foreground", value: "text-muted-foreground" }
  }
  if (value >= 70) return { line: "stroke-price-up", fill: "fill-price-up", value: "text-price-up" }
  if (value >= 30) return { line: "stroke-price-ref", fill: "fill-price-ref", value: "text-price-ref" }
  return { line: "stroke-price-down", fill: "fill-price-down", value: "text-price-down" }
}

function calloutTone(type: "warning" | "positive" | "neutral" | undefined): string {
  if (type === "warning") return "text-price-down"
  if (type === "positive") return "text-price-up"
  return "text-muted-foreground"
}

export interface HealthLineChartProps {
  data: MarketCharts["market_health_detail"]
  /** Breadth classification shown under the today value. */
  classification: string
  frozen?: boolean
  /** Tag pill label, e.g. "Cuối ngày 30/06". */
  dataTag?: string
  frozenNote?: string
}

/**
 * "Sức khỏe thị trường" — % of stocks above MA20 or EMA20 over 20 sessions,
 * hand-rolled SVG: dashed grid, peak callout, pulsing today dot, then the today
 * value with its classification and the backend callout.
 */
export function HealthLineChart({
  data,
  classification,
  frozen,
  dataTag,
  frozenNote,
}: HealthLineChartProps) {
  const isEma = data.indicator_basis === "EMA"
  const basis = isEma ? "EMA" : "MA"
  const current = (isEma ? data.pct_above_ema20 : data.pct_above_ma20) ?? null
  const comparison = (isEma ? data.pct_above_ema50 : data.pct_above_ma50) ?? null
  const trend_20d = isEma ? (data.trend_ema20_20d ?? []) : data.trend_20d
  const { callout } = data

  const count = trend_20d.length
  const lastIndex = count - 1

  let peak: { value: number; index: number } | null = null
  if (count > 0) {
    let maxValue = trend_20d[0]
    let maxIndex = 0
    for (let i = 1; i < count; i++) {
      if (trend_20d[i] > maxValue) {
        maxValue = trend_20d[i]
        maxIndex = i
      }
    }
    peak = { value: maxValue, index: maxIndex }
  }

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const x = (index: number) => PAD_L + (count <= 1 ? 0 : (index / (count - 1)) * innerW)
  const y = (value: number) => {
    const clamped = Math.min(Y_MAX, Math.max(Y_MIN, value))
    return PAD_T + ((Y_MAX - clamped) / (Y_MAX - Y_MIN)) * innerH
  }

  const polylinePoints = trend_20d.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ")

  const tone = todayTone(current)
  // Ticks at the fixed legacy positions; the last point is always labelled.
  const tickIndices = Array.from(new Set([0, 5, 10, 15, lastIndex].filter((i) => i >= 0 && i < count)))

  const tag = dataTag ? { label: dataTag, tone: frozen ? ("frozen" as const) : ("am" as const) } : undefined

  return (
    <ChartCard title="Sức khỏe thị trường" tag={tag} frozen={frozen} frozenNote={frozenNote}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        role="img"
        aria-label={`Tỷ lệ mã trên ${basis}20 trong ${count} phiên`}
      >
        {GRID_VALUES.map((value) => {
          const yPos = y(value)
          return (
            <g key={value}>
              <line
                x1={PAD_L}
                y1={yPos}
                x2={W - PAD_R}
                y2={yPos}
                className="stroke-border"
                strokeWidth={0.5}
                strokeDasharray="3,3"
              />
              <text
                x={PAD_L - 3}
                y={yPos + 3.5}
                fontSize={9}
                className="fill-muted-foreground"
                textAnchor="end"
              >
                {value}%
              </text>
            </g>
          )
        })}

        {/* 50% reference line */}
        <line
          x1={PAD_L}
          y1={y(50)}
          x2={W - PAD_R}
          y2={y(50)}
          className="stroke-muted-foreground"
          strokeWidth={1}
          strokeDasharray="3,3"
          opacity={0.5}
        />

        {tickIndices.map((index) => {
          const isLast = index === lastIndex
          return (
            <text
              key={index}
              x={x(index)}
              y={H - PAD_B + 14}
              fontSize={9}
              className="fill-muted-foreground"
              textAnchor={isLast ? "end" : index === 0 ? "start" : "middle"}
            >
              {isLast ? "PHIÊN NÀY" : `−${lastIndex - index}p`}
            </text>
          )
        })}

        {count >= 2 && (
          <polyline
            points={polylinePoints}
            fill="none"
            className={tone.line}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}

        {peak !== null && (
          <g>
            <circle cx={x(peak.index)} cy={y(peak.value)} r={3} className="fill-price-ref" />
            <text x={x(peak.index) + 6} y={y(peak.value) - 6} fontSize={9} className="fill-price-ref">
              đỉnh {peak.value}%
            </text>
          </g>
        )}

        {count > 0 && (
          <g>
            <circle
              cx={x(lastIndex)}
              cy={y(trend_20d[lastIndex])}
              r={8}
              className={tone.fill}
              opacity={0.3}
            >
              <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={x(lastIndex)} cy={y(trend_20d[lastIndex])} r={4} className={tone.fill} />
          </g>
        )}
      </svg>

      <div className="mt-2 text-center">
        <div className="text-xs font-semibold text-muted-foreground">Tỷ lệ mã trên {basis}20</div>
        <div className={`text-[22px] leading-tight font-bold tabular-nums ${tone.value}`}>
          {current === null
            ? "—"
            : `${current.toLocaleString("en-US", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}%`}
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          Trên {basis}50: {comparison === null ? "—" : `${comparison.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{classification}</div>
      </div>

      {callout && (
        <div
          className={`mt-2 rounded-sm bg-muted px-2.5 py-2 text-xs leading-normal ${calloutTone(callout.type)}`}
        >
          {callout.text}
        </div>
      )}
    </ChartCard>
  )
}
