import React from "react"
import type { Archetype } from "../indicatorInfo"

// ─── helpers ────────────────────────────────────────────────────────────────

/** Convert an array of [x, y] pairs to an SVG polyline `points` string. */
function toPath(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ")
}

// ─── Fixed synthetic data arrays (deterministic, no Math.random) ─────────────

// price-ma: 24-point gentle uptrend with a dip (x: 10→270, y in 20–120 range)
const PRICE_PTS: [number, number][] = [
  [10, 100], [21, 98], [32, 95], [43, 97], [54, 90], [65, 85],
  [76, 88], [87, 92], [98, 86], [109, 80], [120, 76], [131, 82],
  [142, 78], [153, 72], [164, 75], [175, 68], [186, 65], [197, 70],
  [208, 62], [219, 58], [230, 60], [241, 55], [252, 52], [263, 48],
]

// Simple 5-pt smoothed MA (every 5th average of surrounding price pts)
const MA_PTS: [number, number][] = PRICE_PTS.map(([x], i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(PRICE_PTS.length - 1, i + 2)
  const avg =
    PRICE_PTS.slice(lo, hi + 1).reduce((s, [, y]) => s + y, 0) /
    (hi - lo + 1)
  return [x, avg]
})

// death_cross second (slower) MA — starts above, crosses below
const MA2_PTS: [number, number][] = PRICE_PTS.map(([x], i) => {
  const lo = Math.max(0, i - 5)
  const hi = Math.min(PRICE_PTS.length - 1, i + 5)
  const avg =
    PRICE_PTS.slice(lo, hi + 1).reduce((s, [, y]) => s + y, 0) /
    (hi - lo + 1)
  return [x, avg - 4 + i * 0.3]
})

// distance: same price polyline; reference line at y=68
const DIST_REF_Y = 68

// oscillator: a bounded 0–100 oscillator (scaled to 30–110 in SVG: 100→30, 0→110)
// raw values go oversold then rebound
const OSC_RAW = [62, 58, 52, 44, 37, 31, 28, 32, 38, 45, 52, 60, 68, 74, 71, 65, 60]
const OSC_PTS: [number, number][] = OSC_RAW.map((v, i) => [
  10 + i * (260 / (OSC_RAW.length - 1)),
  110 - v * 0.8, // scale: 0→110, 100→30
])

// macd: histogram bars + macd line + signal line
const HIST_RAW = [-4, -6, -5, -3, -1, 1, 3, 5, 4, 2, 1, -1, -2, -1, 0, 2, 3]
const BAR_COUNT = HIST_RAW.length
const BAR_W = 12
const BAR_MARGIN = 4
const TOTAL_W = BAR_COUNT * (BAR_W + BAR_MARGIN) - BAR_MARGIN
const BAR_START_X = (280 - TOTAL_W) / 2
const ZERO_Y = 70
const HIST_SCALE = 8

const MACD_LINE_RAW = [-6, -5, -4, -2, 0, 2, 4, 5, 4, 3, 2, 0, -1, -1, 0, 2, 3]
const SIG_LINE_RAW = [-5, -5, -4, -3, -1, 1, 3, 4, 4, 3, 2, 1, 0, -1, -1, 1, 2]

const MACD_PTS: [number, number][] = MACD_LINE_RAW.map((v, i) => [
  BAR_START_X + i * (BAR_W + BAR_MARGIN) + BAR_W / 2,
  ZERO_Y - v * HIST_SCALE,
])
const SIG_PTS: [number, number][] = SIG_LINE_RAW.map((v, i) => [
  BAR_START_X + i * (BAR_W + BAR_MARGIN) + BAR_W / 2,
  ZERO_Y - v * HIST_SCALE,
])

// crossover at index 5 (histogram flips from -1 → 1)
const CROSS_IDX = 5

// default archetype: single diagonal line
const DEFAULT_PTS: [number, number][] = [
  [10, 120], [90, 90], [140, 70], [200, 55], [270, 40],
]

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function PriceMaMarks({ indicatorId }: { indicatorId: string }) {
  const showDeathCross = indicatorId === "death_cross"
  return (
    <>
      {/* baseline */}
      <line
        x1="10" y1="125" x2="270" y2="125"
        stroke="var(--color-border-2)" strokeWidth="1"
      />
      {/* price polyline */}
      <polyline
        points={toPath(PRICE_PTS)}
        fill="none"
        stroke="var(--color-text-3)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* MA line */}
      <polyline
        points={toPath(MA_PTS)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* optional second MA for death_cross */}
      {showDeathCross && (
        <polyline
          points={toPath(MA2_PTS)}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />
      )}
    </>
  )
}

function DistanceMarks() {
  const lastPt = PRICE_PTS[PRICE_PTS.length - 1]
  const priceAbove = lastPt[1] < DIST_REF_Y // SVG y-axis is inverted
  const gapColor = priceAbove ? "#16a34a" : "#ef4444"
  const gapTop = Math.min(lastPt[1], DIST_REF_Y)
  const gapBot = Math.max(lastPt[1], DIST_REF_Y)
  const gapX = lastPt[0] - 12

  return (
    <>
      {/* price polyline */}
      <polyline
        points={toPath(PRICE_PTS)}
        fill="none"
        stroke="var(--color-text-3)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* reference line */}
      <line
        x1="10" y1={DIST_REF_Y} x2="270" y2={DIST_REF_Y}
        stroke="#2563EB"
        strokeWidth="1.2"
        strokeDasharray="5 3"
      />
      {/* shaded gap rect at last point */}
      <rect
        x={gapX}
        y={gapTop}
        width="24"
        height={gapBot - gapTop}
        fill={gapColor}
        fillOpacity="0.35"
      />
      {/* gap bracket lines */}
      <line
        x1={lastPt[0]} y1={lastPt[1]}
        x2={lastPt[0]} y2={DIST_REF_Y}
        stroke={gapColor}
        strokeWidth="1.5"
      />
    </>
  )
}

function OscillatorMarks() {
  // threshold y-coords: 30 → SVG y = 110-30*0.8=86; 70 → 110-70*0.8=54
  const Y_30 = 110 - 30 * 0.8  // = 86
  const Y_70 = 110 - 70 * 0.8  // = 54
  const lastPt = OSC_PTS[OSC_PTS.length - 1]

  return (
    <>
      {/* oversold zone shade (y=86 to y=110) */}
      <rect
        x="10" y={Y_30}
        width="260" height={110 - Y_30}
        fill="#16a34a" fillOpacity="0.08"
      />
      {/* overbought zone shade (y=20 to y=54) */}
      <rect
        x="10" y="20"
        width="260" height={Y_70 - 20}
        fill="#ef4444" fillOpacity="0.08"
      />
      {/* threshold lines */}
      <line
        x1="10" y1={Y_30} x2="270" y2={Y_30}
        stroke="#16a34a" strokeWidth="1" strokeDasharray="4 3"
      />
      <line
        x1="10" y1={Y_70} x2="270" y2={Y_70}
        stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3"
      />
      {/* oscillator polyline */}
      <polyline
        points={toPath(OSC_PTS)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* latest point dot */}
      <circle
        cx={lastPt[0]} cy={lastPt[1]}
        r="3.5"
        fill="#2563EB"
      />
    </>
  )
}

function MacdMarks() {
  return (
    <>
      {/* zero baseline */}
      <line
        x1="10" y1={ZERO_Y} x2="270" y2={ZERO_Y}
        stroke="var(--color-border-2)" strokeWidth="1"
      />
      {/* histogram bars */}
      {HIST_RAW.map((v, i) => {
        const barX = BAR_START_X + i * (BAR_W + BAR_MARGIN)
        const barH = Math.abs(v) * HIST_SCALE
        const barY = v >= 0 ? ZERO_Y - barH : ZERO_Y
        return (
          <rect
            key={i}
            x={barX} y={barY}
            width={BAR_W} height={barH}
            fill={v >= 0 ? "#16a34a" : "#ef4444"}
            fillOpacity="0.7"
          />
        )
      })}
      {/* MACD line */}
      <polyline
        points={toPath(MACD_PTS)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Signal line */}
      <polyline
        points={toPath(SIG_PTS)}
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray="4 2"
      />
      {/* crossover dot */}
      <circle
        cx={MACD_PTS[CROSS_IDX][0]}
        cy={MACD_PTS[CROSS_IDX][1]}
        r="3.5"
        fill="#2563EB"
        stroke="var(--color-fill-2)"
        strokeWidth="1"
      />
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndicatorChart({
  indicatorId,
  archetype,
}: {
  indicatorId: string
  archetype: Archetype
}): React.ReactElement {
  let marks: React.ReactNode

  switch (archetype) {
    case "price-ma":
      marks = <PriceMaMarks indicatorId={indicatorId} />
      break
    case "distance":
      marks = <DistanceMarks />
      break
    case "oscillator":
      marks = <OscillatorMarks />
      break
    case "macd":
      marks = <MacdMarks />
      break
    default:
      marks = (
        <polyline
          points={toPath(DEFAULT_PTS)}
          fill="none"
          stroke="var(--color-text-3)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )
  }

  return (
    <svg
      viewBox="0 0 280 140"
      style={{ width: "100%" }}
      aria-hidden="true"
      overflow="visible"
    >
      {marks}
    </svg>
  )
}
