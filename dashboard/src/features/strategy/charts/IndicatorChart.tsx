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

// ─── Volatility (Bollinger Bands) synthetic data ──────────────────────────────

// mid line (same as price, but smoother)
const VOL_MID_PTS: [number, number][] = [
  [10, 90], [21, 88], [32, 85], [43, 83], [54, 82], [65, 80],
  [76, 79], [87, 78], [98, 76], [109, 74], [120, 73], [131, 72],
  [142, 71], [153, 70], [164, 68], [175, 67], [186, 65], [197, 64],
  [208, 62], [219, 60], [230, 59], [241, 57], [252, 55], [263, 53],
]

// bandwidth: wide at start, narrow in mid (squeeze), widen at end
const VOL_BW: number[] = [
  22, 20, 18, 16, 14, 12, 10, 8, 6, 5, 5, 6, 8, 10, 12, 15, 18, 20, 22, 24, 26, 26, 25, 24,
]

const VOL_UPPER_PTS: [number, number][] = VOL_MID_PTS.map(([x, y], i) => [x, y - VOL_BW[i]])
const VOL_LOWER_PTS: [number, number][] = VOL_MID_PTS.map(([x, y], i) => [x, y + VOL_BW[i]])

// ─── Volume synthetic data ────────────────────────────────────────────────────

const VOL_BAR_COUNT = 24
const VOL_BAR_W = 9
const VOL_BAR_MARGIN = 2
const VOL_TOTAL_W = VOL_BAR_COUNT * (VOL_BAR_W + VOL_BAR_MARGIN) - VOL_BAR_MARGIN
const VOL_START_X = (280 - VOL_TOTAL_W) / 2
const VOL_BASE_Y = 128

// 24 bar heights (0–65 range); index 14 is the spike
const VOL_BAR_HEIGHTS: number[] = [
  28, 32, 25, 38, 30, 22, 35, 40, 28, 33, 26, 30,
  35, 28, 72, 40, 34, 28, 36, 30, 25, 32, 28, 34,
]
const VOL_SPIKE_IDX = 14

// volume MA (simple 5-period average)
const VOL_MA_PTS: [number, number][] = VOL_BAR_HEIGHTS.map((_, i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(VOL_BAR_HEIGHTS.length - 1, i + 2)
  const avg = VOL_BAR_HEIGHTS.slice(lo, hi + 1).reduce((s, v) => s + v, 0) / (hi - lo + 1)
  const cx = VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2
  return [cx, VOL_BASE_Y - avg]
})

// OBV rising line (for obv/obv_ma_20 ids)
const OBV_RAW: number[] = [
  10, 14, 18, 15, 20, 24, 22, 28, 32, 30, 35, 40,
  38, 44, 50, 48, 54, 60, 58, 64, 70, 68, 74, 80,
]
const OBV_PTS: [number, number][] = OBV_RAW.map((v, i) => [
  VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2,
  120 - v * 0.9, // scale to 120–48 range
])
// OBV MA (5-period smooth)
const OBV_MA_PTS: [number, number][] = OBV_RAW.map((_, i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(OBV_RAW.length - 1, i + 2)
  const avg = OBV_RAW.slice(lo, hi + 1).reduce((s, v) => s + v, 0) / (hi - lo + 1)
  return [
    VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2,
    120 - avg * 0.9,
  ]
})

// ─── Level-breakout synthetic data ────────────────────────────────────────────

// price that approaches and then breaks a resistance level
const LVL_PRICE_PTS: [number, number][] = [
  [10, 110], [32, 105], [54, 100], [76, 97], [98, 93],
  [120, 90], [142, 88], [164, 85], [186, 82], [208, 78],
  [230, 75], [252, 68], [263, 52], // breakout above resistance
]
const LVL_RESISTANCE_Y = 75  // resistance level for high/breakout
const LVL_SUPPORT_Y = 88     // support level for low/breakdown
// breakout happens at index 12 (last point)
const LVL_BREAK_X = 263
const LVL_BREAK_RESISTANCE_Y = 52  // price above resistance (up breakout)
const LVL_BREAK_SUPPORT_Y = 108    // price below support (down breakdown)

// ─── Candlestick synthetic data ───────────────────────────────────────────────

// Each candle: { x, open, high, low, close }
// SVG y-axis: higher value = lower on screen; y=20 top, y=120 bottom

interface Candle {
  x: number
  open: number
  high: number
  low: number
  close: number
}

// helper to map price → svg y (price range 50–150 → svg 120–20)
function priceToY(p: number): number {
  return 120 - (p - 50) * (100 / 100) // (p-50)/100 * 100 mapped to 0–100 in svg
}

const CANDLES_HAMMER: Candle[] = [
  { x: 40,  open: 95, high: 98, low: 70, close: 96 },  // prior bearish
  { x: 80,  open: 94, high: 97, low: 68, close: 95 },  // bearish
  { x: 120, open: 93, high: 96, low: 67, close: 94 },  // bearish
  { x: 160, open: 76, high: 80, low: 55, close: 79 },  // hammer: long lower wick
  { x: 200, open: 79, high: 92, low: 77, close: 90 },  // bullish confirmation
]

const CANDLES_BULL_ENGULFING: Candle[] = [
  { x: 40,  open: 90, high: 93, low: 84, close: 85 },  // small red
  { x: 80,  open: 88, high: 92, low: 82, close: 84 },  // small red
  { x: 120, open: 87, high: 91, low: 81, close: 83 },  // small red (engulfed)
  { x: 160, open: 80, high: 95, low: 78, close: 94 },  // big green engulfing
  { x: 200, open: 94, high: 98, low: 90, close: 97 },  // bullish continuation
]

const CANDLES_BEAR_ENGULFING: Candle[] = [
  { x: 40,  open: 78, high: 84, low: 76, close: 83 },  // small green
  { x: 80,  open: 80, high: 86, low: 78, close: 85 },  // small green
  { x: 120, open: 82, high: 88, low: 80, close: 87 },  // small green (engulfed)
  { x: 160, open: 92, high: 94, low: 77, close: 78 },  // big red engulfing
  { x: 200, open: 78, high: 80, low: 70, close: 72 },  // bearish continuation
]

const CANDLES_SHOOTING_STAR: Candle[] = [
  { x: 40,  open: 78, high: 85, low: 76, close: 84 },  // bullish
  { x: 80,  open: 84, high: 92, low: 82, close: 90 },  // bullish
  { x: 120, open: 90, high: 97, low: 88, close: 95 },  // bullish
  { x: 160, open: 95, high: 118, low: 93, close: 96 }, // shooting star: long upper wick
  { x: 200, open: 95, high: 97, low: 82, close: 83 },  // bearish reversal
]

// default archetype: single diagonal line
const DEFAULT_PTS: [number, number][] = [
  [10, 120], [90, 90], [140, 70], [200, 55], [270, 40],
]

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function VolatilityMarks({ indicatorId }: { indicatorId: string }) {
  const isSqueeze = indicatorId.includes("squeeze")
  // For squeeze flavor use the squeeze-shaped bandwidth data (already encoded in VOL_BW)
  // For non-squeeze, use a fixed wider band (offset the squeeze center)
  const upperPts = isSqueeze
    ? VOL_UPPER_PTS
    : VOL_MID_PTS.map(([x, y]) => [x, y - 18] as [number, number])
  const lowerPts = isSqueeze
    ? VOL_LOWER_PTS
    : VOL_MID_PTS.map(([x, y]) => [x, y + 18] as [number, number])
  const bandPoly: [number, number][] = [
    ...upperPts,
    ...[...lowerPts].reverse(),
  ]

  return (
    <>
      {/* shaded band area */}
      <polygon
        points={toPath(bandPoly)}
        fill="#2563EB"
        fillOpacity="0.12"
        stroke="none"
      />
      {/* upper band */}
      <polyline
        points={toPath(upperPts)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.2"
        strokeDasharray="4 2"
        strokeLinejoin="round"
      />
      {/* lower band */}
      <polyline
        points={toPath(lowerPts)}
        fill="none"
        stroke="#2563EB"
        strokeWidth="1.2"
        strokeDasharray="4 2"
        strokeLinejoin="round"
      />
      {/* mid / price polyline */}
      <polyline
        points={toPath(VOL_MID_PTS)}
        fill="none"
        stroke="var(--color-text-3)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </>
  )
}

function VolumeMarks({ indicatorId }: { indicatorId: string }) {
  const isObv = indicatorId === "obv" || indicatorId === "obv_ma_20"

  if (isObv) {
    return (
      <>
        {/* OBV rising line */}
        <polyline
          points={toPath(OBV_PTS)}
          fill="none"
          stroke="#2563EB"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* OBV MA */}
        <polyline
          points={toPath(OBV_MA_PTS)}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.2"
          strokeDasharray="4 2"
          strokeLinejoin="round"
        />
        {/* end dot */}
        <circle
          cx={OBV_PTS[OBV_PTS.length - 1][0]}
          cy={OBV_PTS[OBV_PTS.length - 1][1]}
          r="3"
          fill="#2563EB"
        />
      </>
    )
  }

  return (
    <>
      {/* volume bars */}
      {VOL_BAR_HEIGHTS.map((h, i) => {
        const bx = VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN)
        const isSpike = i === VOL_SPIKE_IDX
        return (
          <rect
            key={i}
            x={bx}
            y={VOL_BASE_Y - h}
            width={VOL_BAR_W}
            height={h}
            fill={isSpike ? "#ef4444" : "#2563EB"}
            fillOpacity={isSpike ? "0.85" : "0.5"}
          />
        )
      })}
      {/* volume MA polyline */}
      <polyline
        points={toPath(VOL_MA_PTS)}
        fill="none"
        stroke="#ef4444"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </>
  )
}

function LevelBreakoutMarks({ indicatorId }: { indicatorId: string }) {
  const isDown =
    indicatorId.startsWith("low_") || indicatorId.includes("breakdown")
  const levelY = isDown ? LVL_SUPPORT_Y : LVL_RESISTANCE_Y
  const breakY = isDown ? LVL_BREAK_SUPPORT_Y : LVL_BREAK_RESISTANCE_Y
  const color = isDown ? "#ef4444" : "#16a34a"

  // triangle marker pointing up (breakout) or down (breakdown)
  const triSize = 6
  const triPoints = isDown
    ? `${LVL_BREAK_X},${breakY + triSize * 2} ${LVL_BREAK_X - triSize},${breakY} ${LVL_BREAK_X + triSize},${breakY}`
    : `${LVL_BREAK_X},${breakY - triSize * 2} ${LVL_BREAK_X - triSize},${breakY} ${LVL_BREAK_X + triSize},${breakY}`

  return (
    <>
      {/* price polyline */}
      <polyline
        points={toPath(LVL_PRICE_PTS)}
        fill="none"
        stroke="var(--color-text-3)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* level line (resistance or support) */}
      <line
        x1="10" y1={levelY} x2="270" y2={levelY}
        stroke={color}
        strokeWidth="1.2"
        strokeDasharray="5 3"
      />
      {/* breakout marker dot */}
      <circle
        cx={LVL_BREAK_X}
        cy={breakY}
        r="4"
        fill={color}
        fillOpacity="0.9"
      />
      {/* breakout triangle arrow */}
      <polygon
        points={triPoints}
        fill={color}
        fillOpacity="0.85"
      />
    </>
  )
}

function CandlestickMarks({ indicatorId }: { indicatorId: string }) {
  let candles: Candle[]
  if (indicatorId === "bull_engulfing") {
    candles = CANDLES_BULL_ENGULFING
  } else if (indicatorId === "bear_engulfing") {
    candles = CANDLES_BEAR_ENGULFING
  } else if (indicatorId === "shooting_star") {
    candles = CANDLES_SHOOTING_STAR
  } else {
    // default: hammer
    candles = CANDLES_HAMMER
  }

  const bodyW = 22

  return (
    <>
      {candles.map((c, i) => {
        const openY = priceToY(c.open)
        const closeY = priceToY(c.close)
        const highY = priceToY(c.high)
        const lowY = priceToY(c.low)
        const isBull = c.close >= c.open
        const color = isBull ? "#16a34a" : "#ef4444"
        const bodyTop = Math.min(openY, closeY)
        const bodyH = Math.max(Math.abs(closeY - openY), 2)
        const midX = c.x

        return (
          <g key={i}>
            {/* wick high–low */}
            <line
              x1={midX} y1={highY}
              x2={midX} y2={lowY}
              stroke={color}
              strokeWidth="1.5"
            />
            {/* candle body */}
            <rect
              x={midX - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
              fillOpacity="0.85"
            />
          </g>
        )
      })}
    </>
  )
}

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
    case "volatility":
      marks = <VolatilityMarks indicatorId={indicatorId} />
      break
    case "volume":
      marks = <VolumeMarks indicatorId={indicatorId} />
      break
    case "level-breakout":
      marks = <LevelBreakoutMarks indicatorId={indicatorId} />
      break
    case "candlestick":
      marks = <CandlestickMarks indicatorId={indicatorId} />
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
