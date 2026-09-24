import { colorVar, round, toPoints } from "./chart-tokens"

export interface LinePoint {
  x: number
  y: number
}

export interface LineSeries {
  label: string
  points: LinePoint[]
  /** semantic colour key → token */
  cls: string
}

export interface LineChartProps {
  series: LineSeries[]
  /** optional horizontal reference/threshold line (dashed) */
  threshold?: number
  ariaLabel?: string
}

const PLOT_L = 52
const PLOT_R = 600
const TOP = 20
const BASE_Y = 130

/**
 * KHỐI 5 (A) / KHỐI 4-5 (B) — đường 1–2 series + đường ngưỡng tuỳ chọn
 * (vd Lợi nhuận vs Tiền mặt, NIM, CIR, nợ ròng/EBITDA với mốc 0).
 */
export function LineChart({
  series,
  threshold,
  ariaLabel = "Biểu đồ đường theo năm",
}: LineChartProps) {
  const allPts = series.flatMap((s) => s.points)
  const xs = allPts.map((p) => p.x)
  const ys = allPts.map((p) => p.y)
  if (threshold !== undefined) ys.push(threshold)

  const xMin = xs.length ? Math.min(...xs) : 0
  const xMax = xs.length ? Math.max(...xs) : 1
  const xSpan = xMax - xMin || 1
  const yMin = ys.length ? Math.min(...ys) : 0
  const yMax = ys.length ? Math.max(...ys) : 1
  const pad = (yMax - yMin || 1) * 0.12
  const lo = yMin - pad
  const hi = yMax + pad

  const xOf = (x: number) => PLOT_L + ((x - xMin) / xSpan) * (PLOT_R - PLOT_L)
  const yOf = (y: number) => BASE_Y - ((y - lo) / (hi - lo)) * (BASE_Y - TOP)

  const xLabels = series[0]?.points.map((p) => p.x) ?? []

  return (
    <svg
      className="block h-auto w-full"
      viewBox="0 0 640 170"
      role="img"
      aria-label={ariaLabel}
    >
      {/* horizontal gridlines */}
      <g stroke="var(--border)" strokeWidth={1}>
        {[20, 60, 100, BASE_Y].map((y) => (
          <line key={`g-${y}`} x1={PLOT_L} y1={y} x2={PLOT_R} y2={y} />
        ))}
      </g>

      {/* threshold */}
      {threshold !== undefined ? (
        <g>
          <line
            x1={PLOT_L}
            y1={round(yOf(threshold))}
            x2={PLOT_R}
            y2={round(yOf(threshold))}
            stroke="var(--muted-foreground)"
            strokeWidth={1.1}
            strokeDasharray="4,3"
          />
          <text
            className="fill-muted-foreground text-xs tabular-nums"
            x={PLOT_L + 4}
            y={round(yOf(threshold) - 4)}
          >
            {threshold}
          </text>
        </g>
      ) : null}

      {/* series */}
      {series.map((s, si) => {
        const color = colorVar(s.cls)
        const pts = s.points.map((p) => [xOf(p.x), yOf(p.y)] as [number, number])
        const last = s.points[s.points.length - 1]
        return (
          <g key={`line-${si}`}>
            <polyline fill="none" stroke={color} strokeWidth={2.5} points={toPoints(pts)} />
            {pts.map(([cx, cy], k) => (
              <circle key={`dot-${si}-${k}`} cx={round(cx)} cy={round(cy)} r={3.5} fill={color} />
            ))}
            {last ? (
              <text
                className="text-[13px] font-semibold tabular-nums"
                x={PLOT_R + 4}
                y={round(yOf(last.y) + 4)}
                fill={color}
              >
                {last.y}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* x labels */}
      <g className="fill-muted-foreground text-xs" textAnchor="middle">
        {xLabels.map((x, i) => (
          <text key={`xl-${i}`} x={round(xOf(x))} y={150}>
            {x}
          </text>
        ))}
      </g>
    </svg>
  )
}
