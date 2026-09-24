import { fmtNum, nonNeg, round } from "./chart-tokens"

export type PeerMarker = "company" | "median" | "threshold"

export interface PeerRow {
  label: string
  value: number
  /** company = giá trị doanh nghiệp, median = trung vị ngành, threshold = ngưỡng */
  marker?: PeerMarker
  /** override the printed value (e.g. "~0%"); defaults to the numeric value */
  valueLabel?: string
}

export interface PeerBarProps {
  rows: PeerRow[]
  /** scale denominator; defaults to the largest row value */
  max?: number
  ariaLabel?: string
}

const W = 320
const TRACK_X = 98
const TRACK_W = 174
const BAR_H = 16
const ROW_H = 26
const GAP = 8

function markerToken(m: PeerMarker | undefined): string {
  switch (m) {
    case "company":
      return "var(--chart-3)"
    case "median":
      return "var(--chart-5)"
    case "threshold":
      return "var(--chart-2)"
    default:
      return "var(--chart-1)"
  }
}

/**
 * KHỐI so-ngành — thanh xếp hạng ngang (công ty / trung vị / ngưỡng).
 * Chấm giá trị doanh nghiệp = xanh; dải trung tính = trung vị; vàng = ngưỡng.
 */
export function PeerBar({ rows, max, ariaLabel = "So sánh với ngành" }: PeerBarProps) {
  const scale = Math.max(max ?? 0, ...rows.map((r) => nonNeg(r.value)), 1)
  const height = rows.length * (ROW_H + GAP) + 4

  return (
    <svg
      className="block h-auto w-full"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {rows.map((r, i) => {
        const rowY = i * (ROW_H + GAP) + 2
        const barY = rowY + (ROW_H - BAR_H) / 2
        const fillW = round((nonNeg(r.value) / scale) * TRACK_W)
        const isCompany = r.marker === "company"
        return (
          <g key={`row-${i}`}>
            <text
              className={isCompany ? "fill-foreground text-xs font-semibold" : "fill-muted-foreground text-xs"}
              x={0}
              y={round(rowY + ROW_H / 2 + 4)}
            >
              {r.label}
            </text>
            <rect
              x={TRACK_X}
              y={round(barY)}
              width={TRACK_W}
              height={BAR_H}
              rx={3}
              fill="var(--card)"
              stroke="var(--border)"
              strokeWidth={1}
            />
            <rect
              x={TRACK_X}
              y={round(barY)}
              width={fillW}
              height={BAR_H}
              rx={3}
              fill={markerToken(r.marker)}
            />
            <text
              className={
                isCompany
                  ? "fill-foreground text-xs font-semibold tabular-nums"
                  : "fill-muted-foreground text-xs tabular-nums"
              }
              x={TRACK_X + TRACK_W + 6}
              y={round(rowY + ROW_H / 2 + 4)}
            >
              {r.valueLabel ?? fmtNum(r.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
