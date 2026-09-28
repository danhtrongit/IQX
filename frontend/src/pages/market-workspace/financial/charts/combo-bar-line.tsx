import { colorVar, round, toPoints } from "./chart-tokens"

export interface ComboBar {
  year: number
  value: number
}

export interface ComboLine {
  label: string
  /** one value per bar/year */
  points: number[]
  /** semantic colour key → token */
  cls: string
}

export interface ComboBarLineProps {
  bars: ComboBar[]
  lines: ComboLine[]
  ariaLabel?: string
}

const PLOT_L = 52
const PLOT_R = 600
const BASE_Y = 175
const BAR_TOP = 16
const LINE_TOP = 24
const LINE_BOT = 150

/**
 * KHỐI 4 (A) — combo cột doanh thu + đường biên lợi nhuận (2 trục ngầm:
 * cột theo giá trị tuyệt đối, đường theo % với thang riêng).
 */
export function ComboBarLine({
  bars,
  lines,
  ariaLabel = "Cột và đường theo năm",
}: ComboBarLineProps) {
  const plotW = PLOT_R - PLOT_L
  const nBars = Math.max(bars.length, 1)
  const slot = plotW / nBars
  const barW = Math.min(58, slot * 0.55)

  const maxBar = Math.max(1, ...bars.map((b) => b.value))
  const barUsable = BASE_Y - BAR_TOP

  const allPts = lines.flatMap((l) => l.points)
  const lineMax = allPts.length ? Math.max(...allPts) : 1
  const lineMin = allPts.length ? Math.min(...allPts) : 0
  const lineSpan = lineMax - lineMin || 1

  const centerOf = (i: number, count: number) => PLOT_L + plotW * ((i + 0.5) / Math.max(count, 1))
  const lineY = (v: number) => LINE_TOP + ((lineMax - v) / lineSpan) * (LINE_BOT - LINE_TOP)

  return (
    <svg
      className="block h-auto w-full"
      viewBox="0 0 640 220"
      role="img"
      aria-label={ariaLabel}
    >
      {/* horizontal gridlines */}
      <g stroke="var(--border)" strokeWidth={1}>
        {[30, 70, 110, 150, BASE_Y].map((y) => (
          <line key={`g-${y}`} x1={PLOT_L} y1={y} x2={PLOT_R} y2={y} />
        ))}
      </g>

      {/* revenue bars */}
      {bars.map((b, i) => {
        const h = round((b.value / maxBar) * barUsable)
        const cx = centerOf(i, bars.length)
        const x = round(cx - barW / 2)
        const y = round(BASE_Y - h)
        return (
          <g key={`bar-${b.year}`}>
            <rect
              x={x}
              y={y}
              width={round(barW)}
              height={h}
              fill="var(--chart-1)"
              fillOpacity={0.18}
              stroke="var(--chart-1)"
              strokeWidth={1.2}
            />
            <text
              className="text-xs font-semibold tabular-nums"
              x={round(cx)}
              y={round(y + 20)}
              textAnchor="middle"
              fill="var(--chart-1)"
            >
              {b.value}
            </text>
          </g>
        )
      })}

      {/* margin lines */}
      {lines.map((l, li) => {
        const color = colorVar(l.cls)
        const pts = l.points.map((v, k) => [centerOf(k, l.points.length), lineY(v)] as [number, number])
        const last = l.points[l.points.length - 1]
        return (
          <g key={`line-${li}`}>
            <polyline fill="none" stroke={color} strokeWidth={2.5} points={toPoints(pts)} />
            {pts.map(([cx, cy], k) => (
              <circle key={`dot-${li}-${k}`} cx={round(cx)} cy={round(cy)} r={3.5} fill={color} />
            ))}
            {last !== undefined ? (
              <text
                className="text-[13px] font-semibold tabular-nums"
                x={PLOT_R + 4}
                y={round(lineY(last) + 4)}
                fill={color}
              >
                {last}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* x labels */}
      <g className="fill-muted-foreground text-xs" textAnchor="middle">
        {bars.map((b, i) => (
          <text key={`xl-${b.year}`} x={round(centerOf(i, bars.length))} y={197}>
            {b.year}
          </text>
        ))}
      </g>
    </svg>
  )
}
