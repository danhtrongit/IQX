import { fmtNum, nonNeg, round } from "./chartTokens"

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

function markerColor(m: PeerMarker | undefined): string {
  switch (m) {
    case "company":
      return "var(--green)"
    case "median":
      return "var(--line-strong)"
    case "threshold":
      return "var(--amber)"
    default:
      return "var(--accent)"
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
      className="bctc-chart-svg"
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
              className="bctc-cx-lbl"
              x={0}
              y={round(rowY + ROW_H / 2 + 4)}
              fill={isCompany ? "var(--ink)" : "var(--ink-soft)"}
              fontWeight={isCompany ? 700 : 400}
            >
              {r.label}
            </text>
            <rect
              x={TRACK_X}
              y={round(barY)}
              width={TRACK_W}
              height={BAR_H}
              rx={3}
              fill="var(--paper)"
              stroke="var(--line)"
              strokeWidth={1}
            />
            <rect
              data-row-fill=""
              x={TRACK_X}
              y={round(barY)}
              width={fillW}
              height={BAR_H}
              rx={3}
              fill={markerColor(r.marker)}
            />
            <text
              className="bctc-val-lbl"
              x={TRACK_X + TRACK_W + 6}
              y={round(rowY + ROW_H / 2 + 4)}
              fill={isCompany ? "var(--ink)" : "var(--ink-soft)"}
            >
              {r.valueLabel ?? fmtNum(r.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
