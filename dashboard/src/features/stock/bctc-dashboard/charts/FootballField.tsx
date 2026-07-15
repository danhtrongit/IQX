import { fmtNum, round } from "./chartTokens"

export interface ValuationMethod {
  name: string
  bear: number
  base: number
  bull: number
}

export interface FootballFieldProps {
  methods: ValuationMethod[]
  currentPrice: number
  ariaLabel?: string
}

const W = 400
const TRACK_X = 130
const TRACK_W = 250
const TOP = 12
const ROW_H = 24
const GAP = 12
const AXIS_GAP = 24

/**
 * KHỐI 2 (A) — football field: mỗi phương pháp một dải bear–bull, vạch base,
 * và một vạch giá hiện tại (đỏ) xuyên qua tất cả các dải.
 */
export function FootballField({
  methods,
  currentPrice,
  ariaLabel = "Dải định giá theo phương pháp",
}: FootballFieldProps) {
  const lows = methods.map((m) => m.bear)
  const highs = methods.map((m) => m.bull)
  const lo = Math.min(currentPrice, ...lows)
  const hi = Math.max(currentPrice, ...highs)
  const pad = (hi - lo || 1) * 0.06
  const min = lo - pad
  const max = hi + pad
  const span = max - min || 1

  const xOf = (v: number) => round(TRACK_X + ((v - min) / span) * TRACK_W)

  const rowsBottom = TOP + methods.length * (ROW_H + GAP)
  const height = rowsBottom + AXIS_GAP
  const curX = xOf(currentPrice)

  const axisTicks = [min + pad, currentPrice, max - pad]

  return (
    <svg
      className="bctc-chart-svg"
      viewBox={`0 0 ${W} ${round(height)}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* method rows */}
      {methods.map((m, i) => {
        const rowY = TOP + i * (ROW_H + GAP)
        const bandY = rowY + (ROW_H - 12) / 2
        const bx = xOf(m.bear)
        const bandW = Math.max(0, xOf(m.bull) - bx)
        return (
          <g key={`m-${i}`}>
            <text className="bctc-cx-lbl" x={0} y={round(rowY + ROW_H / 2 + 4)} fill="var(--ink-soft)">
              {m.name}
            </text>
            {/* scale baseline for the row */}
            <line x1={TRACK_X} y1={round(rowY + ROW_H)} x2={TRACK_X + TRACK_W} y2={round(rowY + ROW_H)} stroke="var(--line)" strokeWidth={1} />
            <rect
              data-band=""
              x={bx}
              y={round(bandY)}
              width={round(bandW)}
              height={12}
              rx={3}
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth={1}
            />
            {/* base marker */}
            <line x1={xOf(m.base)} y1={round(rowY + 2)} x2={xOf(m.base)} y2={round(rowY + ROW_H - 2)} stroke="var(--accent)" strokeWidth={2} />
          </g>
        )
      })}

      {/* current price line across all rows */}
      <line
        data-current=""
        x1={curX}
        y1={round(TOP - 4)}
        x2={curX}
        y2={round(rowsBottom)}
        stroke="var(--red)"
        strokeWidth={2}
      />
      <text className="bctc-val-lbl" x={curX} y={round(TOP - 6)} textAnchor="middle" fill="var(--red)">
        {fmtNum(currentPrice)}
      </text>

      {/* axis */}
      <g className="bctc-cy-lbl" textAnchor="middle">
        {axisTicks.map((t, i) => (
          <text key={`ax-${i}`} x={xOf(t)} y={round(height - 6)}>
            {fmtNum(t)}
          </text>
        ))}
      </g>
    </svg>
  )
}
