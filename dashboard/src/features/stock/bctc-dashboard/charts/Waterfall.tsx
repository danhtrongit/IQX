import { fmtNum, round } from "./chartTokens"

export type WaterfallKind = "total" | "start" | "end" | "add" | "increase" | "subtract" | "decrease"

export interface WaterfallStep {
  label: string
  value: number
  kind: WaterfallKind
}

export interface WaterfallProps {
  steps: WaterfallStep[]
  ariaLabel?: string
}

const TOP = 22
const BASE_Y = 128
const LABEL_Y = 150
const SLOT = 96
const PAD_X = 14

function isTotal(k: WaterfallKind): boolean {
  return k === "total" || k === "start" || k === "end"
}
function isSubtract(k: WaterfallKind): boolean {
  return k === "subtract" || k === "decrease"
}
function kindColor(k: WaterfallKind): string {
  if (isTotal(k)) return "var(--accent)"
  if (isSubtract(k)) return "var(--red)"
  return "var(--green)"
}

/**
 * KHỐI 5 (A) drilldown — cầu nối dòng tiền (waterfall):
 * LNST → +khấu hao → ±vốn lưu động → tiền từ KD → −đầu tư → dòng tiền tự do.
 * Totals anchor at 0; add/subtract steps float from the running cumulative.
 */
export function Waterfall({ steps, ariaLabel = "Cầu nối dòng tiền" }: WaterfallProps) {
  const width = Math.max(steps.length, 1) * SLOT + PAD_X * 2

  // Resolve each step to a [lo, hi] band in value-space.
  let cum = 0
  const bands = steps.map((s) => {
    const v = Math.abs(s.value)
    if (isTotal(s.kind)) {
      cum = s.value
      return { lo: Math.min(0, s.value), hi: Math.max(0, s.value) }
    }
    if (isSubtract(s.kind)) {
      const hi = cum
      cum -= v
      return { lo: cum, hi }
    }
    const lo = cum
    cum += v
    return { lo, hi: cum }
  })

  const hiMax = Math.max(0, ...bands.map((b) => b.hi))
  const loMin = Math.min(0, ...bands.map((b) => b.lo))
  const range = hiMax - loMin || 1
  const plotH = BASE_Y - TOP
  const yOf = (v: number) => BASE_Y - ((v - loMin) / range) * plotH

  return (
    <svg
      className="bctc-chart-svg"
      viewBox={`0 0 ${width} 170`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* zero baseline */}
      <line x1={PAD_X} y1={round(yOf(0))} x2={width - PAD_X} y2={round(yOf(0))} stroke="var(--line-strong)" strokeWidth={1} />

      {steps.map((s, i) => {
        const band = bands[i]
        const slotX = PAD_X + i * SLOT
        const barW = SLOT * 0.6
        const x = round(slotX + (SLOT - barW) / 2)
        const yTop = round(yOf(band.hi))
        const h = round(Math.max(0, yOf(band.lo) - yOf(band.hi)))
        const cx = round(slotX + SLOT / 2)
        const sign = isTotal(s.kind) ? "" : isSubtract(s.kind) ? "−" : "+"
        return (
          <g key={`step-${i}`}>
            <rect data-step="" x={x} y={yTop} width={round(barW)} height={h} rx={3} fill={kindColor(s.kind)} />
            <text className="bctc-val-lbl" x={cx} y={round(yTop - 5)} textAnchor="middle">
              {sign}
              {fmtNum(Math.abs(s.value))}
            </text>
            <text className="bctc-cx-lbl" x={cx} y={LABEL_Y} textAnchor="middle">
              {s.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
