import { colorVar, fmtNum, nonNeg, round } from "./chartTokens"

export interface StackedPart {
  label: string
  value: number
  /** semantic colour key (e.g. "fill-g" | "g" | "green") — resolved to a CSS var */
  cls: string
}

export interface StackedYear {
  year: number
  /** stacked bottom → top in array order */
  parts: StackedPart[]
}

export interface StackedBarAbsoluteProps {
  series: StackedYear[]
  /** optional explicit y-axis ticks (money marks); auto-generated when omitted */
  yTicks?: number[]
  ariaLabel?: string
}

const PAD_L = 44
const PAD_R = 26
const PAD_TOP = 20
const BASE_Y = 200
const COL_W = 46
const PITCH = 66
const FIRST_OFFSET = 18
const USABLE_H = BASE_Y - PAD_TOP - 8 // reserve top space for the total label

function autoTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  return [0, max / 3, (max * 2) / 3, max]
}

/**
 * KHỐI 3 (A) — cột chồng TUYỆT ĐỐI 5 năm (số tiền thật, có trục y).
 * Mỗi năm = 1 cột = tổng, chia thành các dải xếp chồng. Negative part values
 * are clamped to 0 (B1: oneoff_pct can be negative) so no bar renders inverted.
 */
export function StackedBarAbsolute({
  series,
  yTicks,
  ariaLabel = "Cột chồng tuyệt đối theo năm",
}: StackedBarAbsoluteProps) {
  const n = Math.max(series.length, 1)
  const width = PAD_L + n * PITCH + PAD_R

  const totals = series.map((s) => s.parts.reduce((a, p) => a + nonNeg(p.value), 0))
  const maxTotal = Math.max(0, ...totals)
  const ticks = (yTicks && yTicks.length ? yTicks : autoTicks(maxTotal))
  const maxScale = Math.max(maxTotal, ...ticks) || 1

  const yOf = (v: number) => BASE_Y - (nonNeg(v) / maxScale) * USABLE_H
  const colX = (i: number) => PAD_L + FIRST_OFFSET + i * PITCH

  return (
    <svg
      className="bctc-chart-svg"
      viewBox={`0 0 ${width} 235`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* gridlines + y labels */}
      <g className="bctc-cy-lbl" textAnchor="end">
        {ticks.map((t, i) => (
          <text key={`yl-${i}`} x={PAD_L - 4} y={round(yOf(t) + 3)}>
            {fmtNum(t)}
          </text>
        ))}
      </g>
      <g stroke="var(--line)" strokeWidth={1} strokeDasharray="2,3">
        {ticks
          .filter((t) => t > 0)
          .map((t, i) => (
            <line key={`gl-${i}`} x1={PAD_L} y1={round(yOf(t))} x2={width - 4} y2={round(yOf(t))} />
          ))}
      </g>
      {/* baseline */}
      <line x1={PAD_L} y1={BASE_Y} x2={width - 4} y2={BASE_Y} stroke="var(--line-strong)" strokeWidth={1} />

      {/* stacked columns */}
      {series.map((s, i) => {
        const x = colX(i)
        const cx = x + COL_W / 2
        const total = totals[i]
        let cursor = BASE_Y
        const showPct = i === 0 || i === series.length - 1
        return (
          <g key={`col-${s.year}`} data-year={s.year}>
            {s.parts.map((p, j) => {
              const h = round((nonNeg(p.value) / maxScale) * USABLE_H)
              const y = round(cursor - h)
              const segCenter = round(cursor - h / 2)
              cursor = y
              const pct = total > 0 ? Math.round((nonNeg(p.value) / total) * 100) : 0
              return (
                <g key={`seg-${j}`}>
                  <rect data-seg="" x={x} y={y} width={COL_W} height={h} fill={colorVar(p.cls)} />
                  {showPct && h > 14 ? (
                    <text className="bctc-val-in" x={cx} y={segCenter + 3} textAnchor="middle">
                      {pct}%
                    </text>
                  ) : null}
                </g>
              )
            })}
            {total > 0 ? (
              <text className="bctc-val-lbl" x={cx} y={round(yOf(total) - 7)} textAnchor="middle">
                {fmtNum(total)}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* x labels */}
      <g className="bctc-cx-lbl" textAnchor="middle">
        {series.map((s, i) => (
          <text key={`xl-${s.year}`} x={round(colX(i) + COL_W / 2)} y={BASE_Y + 18}>
            {s.year}
          </text>
        ))}
      </g>
    </svg>
  )
}
