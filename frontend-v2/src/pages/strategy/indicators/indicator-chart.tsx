/**
 * Sơ đồ minh hoạ chỉ báo — port từ
 * `dashboard/src/features/strategy/charts/IndicatorChart.tsx`.
 *
 * Mỗi `archetype` có một hình mẫu riêng, dựng bằng SVG tĩnh (dữ liệu tổng hợp
 * cố định, không random) để người học nhìn ra hình dạng tín hiệu. Màu dùng token
 * IQX: xanh dương = chuỗi đang học, xanh lá = tăng, đỏ = giảm/ngưỡng trên.
 */
import type { ReactNode } from "react"

import type { Archetype } from "./indicator-info"

type Point = [number, number]

/** Đổi mảng điểm thành chuỗi `points` của SVG polyline. */
function toPath(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ")
}

/* ── Dữ liệu tổng hợp cố định ────────────────────────────────────────────── */

const PRICE_PTS: Point[] = [
  [10, 100], [21, 98], [32, 95], [43, 97], [54, 90], [65, 85],
  [76, 88], [87, 92], [98, 86], [109, 80], [120, 76], [131, 82],
  [142, 78], [153, 72], [164, 75], [175, 68], [186, 65], [197, 70],
  [208, 62], [219, 58], [230, 60], [241, 55], [252, 52], [263, 48],
]

/** MA làm mượt 5 điểm quanh mỗi mốc giá. */
const MA_PTS: Point[] = PRICE_PTS.map(([x], i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(PRICE_PTS.length - 1, i + 2)
  const avg = PRICE_PTS.slice(lo, hi + 1).reduce((sum, [, y]) => sum + y, 0) / (hi - lo + 1)
  return [x, avg]
})

/** MA chậm thứ hai cho death_cross — bắt đầu trên rồi cắt xuống. */
const MA2_PTS: Point[] = PRICE_PTS.map(([x], i) => {
  const lo = Math.max(0, i - 5)
  const hi = Math.min(PRICE_PTS.length - 1, i + 5)
  const avg = PRICE_PTS.slice(lo, hi + 1).reduce((sum, [, y]) => sum + y, 0) / (hi - lo + 1)
  return [x, avg - 4 + i * 0.3]
})

const DIST_REF_Y = 68

/** Oscillator 0–100, co về dải SVG 30–110 (100→30, 0→110). */
const OSC_RAW = [62, 58, 52, 44, 37, 31, 28, 32, 38, 45, 52, 60, 68, 74, 71, 65, 60]
const OSC_PTS: Point[] = OSC_RAW.map((v, i) => [
  10 + i * (260 / (OSC_RAW.length - 1)),
  110 - v * 0.8,
])

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

const MACD_PTS: Point[] = MACD_LINE_RAW.map((v, i) => [
  BAR_START_X + i * (BAR_W + BAR_MARGIN) + BAR_W / 2,
  ZERO_Y - v * HIST_SCALE,
])
const SIG_PTS: Point[] = SIG_LINE_RAW.map((v, i) => [
  BAR_START_X + i * (BAR_W + BAR_MARGIN) + BAR_W / 2,
  ZERO_Y - v * HIST_SCALE,
])

/** Điểm cắt: histogram đổi dấu từ -1 sang 1. */
const CROSS_IDX = 5

const VOL_MID_PTS: Point[] = [
  [10, 90], [21, 88], [32, 85], [43, 83], [54, 82], [65, 80],
  [76, 79], [87, 78], [98, 76], [109, 74], [120, 73], [131, 72],
  [142, 71], [153, 70], [164, 68], [175, 67], [186, 65], [197, 64],
  [208, 62], [219, 60], [230, 59], [241, 57], [252, 55], [263, 53],
]

/** Bề rộng dải: rộng ở đầu, thắt giữa (squeeze), mở lại ở cuối. */
const VOL_BW: number[] = [
  22, 20, 18, 16, 14, 12, 10, 8, 6, 5, 5, 6, 8, 10, 12, 15, 18, 20, 22, 24, 26, 26, 25, 24,
]

const VOL_UPPER_PTS: Point[] = VOL_MID_PTS.map(([x, y], i) => [x, y - VOL_BW[i]])
const VOL_LOWER_PTS: Point[] = VOL_MID_PTS.map(([x, y], i) => [x, y + VOL_BW[i]])

const VOL_BAR_COUNT = 24
const VOL_BAR_W = 9
const VOL_BAR_MARGIN = 2
const VOL_TOTAL_W = VOL_BAR_COUNT * (VOL_BAR_W + VOL_BAR_MARGIN) - VOL_BAR_MARGIN
const VOL_START_X = (280 - VOL_TOTAL_W) / 2
const VOL_BASE_Y = 128

/** 24 cột khối lượng; cột 15 là spike. */
const VOL_BAR_HEIGHTS: number[] = [
  28, 32, 25, 38, 30, 22, 35, 40, 28, 33, 26, 30,
  35, 28, 72, 40, 34, 28, 36, 30, 25, 32, 28, 34,
]
const VOL_SPIKE_IDX = 14

const VOL_MA_PTS: Point[] = VOL_BAR_HEIGHTS.map((_, i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(VOL_BAR_HEIGHTS.length - 1, i + 2)
  const avg = VOL_BAR_HEIGHTS.slice(lo, hi + 1).reduce((sum, v) => sum + v, 0) / (hi - lo + 1)
  const cx = VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2
  return [cx, VOL_BASE_Y - avg]
})

const OBV_RAW: number[] = [
  10, 14, 18, 15, 20, 24, 22, 28, 32, 30, 35, 40,
  38, 44, 50, 48, 54, 60, 58, 64, 70, 68, 74, 80,
]
const OBV_PTS: Point[] = OBV_RAW.map((v, i) => [
  VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2,
  120 - v * 0.9,
])
const OBV_MA_PTS: Point[] = OBV_RAW.map((_, i) => {
  const lo = Math.max(0, i - 2)
  const hi = Math.min(OBV_RAW.length - 1, i + 2)
  const avg = OBV_RAW.slice(lo, hi + 1).reduce((sum, v) => sum + v, 0) / (hi - lo + 1)
  return [
    VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN) + VOL_BAR_W / 2,
    120 - avg * 0.9,
  ]
})

const LVL_PRICE_PTS: Point[] = [
  [10, 110], [32, 105], [54, 100], [76, 97], [98, 93],
  [120, 90], [142, 88], [164, 85], [186, 82], [208, 78],
  [230, 75], [252, 68], [263, 52],
]
const LVL_RESISTANCE_Y = 75
const LVL_SUPPORT_Y = 88
const LVL_BREAK_X = 263
const LVL_BREAK_RESISTANCE_Y = 52
const LVL_BREAK_SUPPORT_Y = 108

type Candle = { x: number; open: number; high: number; low: number; close: number }

/** Giá 50–150 → trục y SVG 120–20. */
function priceToY(price: number): number {
  return 120 - (price - 50)
}

const CANDLES_HAMMER: Candle[] = [
  { x: 40, open: 95, high: 98, low: 70, close: 96 },
  { x: 80, open: 94, high: 97, low: 68, close: 95 },
  { x: 120, open: 93, high: 96, low: 67, close: 94 },
  { x: 160, open: 76, high: 80, low: 55, close: 79 },
  { x: 200, open: 79, high: 92, low: 77, close: 90 },
]

const CANDLES_BULL_ENGULFING: Candle[] = [
  { x: 40, open: 90, high: 93, low: 84, close: 85 },
  { x: 80, open: 88, high: 92, low: 82, close: 84 },
  { x: 120, open: 87, high: 91, low: 81, close: 83 },
  { x: 160, open: 80, high: 95, low: 78, close: 94 },
  { x: 200, open: 94, high: 98, low: 90, close: 97 },
]

const CANDLES_BEAR_ENGULFING: Candle[] = [
  { x: 40, open: 78, high: 84, low: 76, close: 83 },
  { x: 80, open: 80, high: 86, low: 78, close: 85 },
  { x: 120, open: 82, high: 88, low: 80, close: 87 },
  { x: 160, open: 92, high: 94, low: 77, close: 78 },
  { x: 200, open: 78, high: 80, low: 70, close: 72 },
]

const CANDLES_SHOOTING_STAR: Candle[] = [
  { x: 40, open: 78, high: 85, low: 76, close: 84 },
  { x: 80, open: 84, high: 92, low: 82, close: 90 },
  { x: 120, open: 90, high: 97, low: 88, close: 95 },
  { x: 160, open: 95, high: 118, low: 93, close: 96 },
  { x: 200, open: 95, high: 97, low: 82, close: 83 },
]

const DEFAULT_PTS: Point[] = [
  [10, 120], [90, 90], [140, 70], [200, 55], [270, 40],
]

/* ── Màu theo token IQX ──────────────────────────────────────────────────── */

const SERIES = "var(--primary)"
const UP = "var(--price-up)"
const DOWN = "var(--price-down)"
const MUTED = "var(--muted-foreground)"
const BORDER = "var(--border)"
const SURFACE = "var(--card)"

/* ── Hình con ────────────────────────────────────────────────────────────── */

function VolatilityMarks({ indicatorId }: { indicatorId: string }) {
  const isSqueeze = indicatorId.includes("squeeze")
  const upperPts = isSqueeze
    ? VOL_UPPER_PTS
    : VOL_MID_PTS.map(([x, y]) => [x, y - 18] as Point)
  const lowerPts = isSqueeze
    ? VOL_LOWER_PTS
    : VOL_MID_PTS.map(([x, y]) => [x, y + 18] as Point)
  const bandPoly: Point[] = [...upperPts, ...[...lowerPts].reverse()]

  return (
    <>
      <polygon points={toPath(bandPoly)} fill={SERIES} fillOpacity="0.12" stroke="none" />
      <polyline
        points={toPath(upperPts)}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.2"
        strokeDasharray="4 2"
        strokeLinejoin="round"
      />
      <polyline
        points={toPath(lowerPts)}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.2"
        strokeDasharray="4 2"
        strokeLinejoin="round"
      />
      <polyline
        points={toPath(VOL_MID_PTS)}
        fill="none"
        stroke={MUTED}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </>
  )
}

function VolumeMarks({ indicatorId }: { indicatorId: string }) {
  const isObv = indicatorId === "obv" || indicatorId === "obv_ma_20"

  if (isObv) {
    const last = OBV_PTS[OBV_PTS.length - 1]
    return (
      <>
        <polyline
          points={toPath(OBV_PTS)}
          fill="none"
          stroke={SERIES}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polyline
          points={toPath(OBV_MA_PTS)}
          fill="none"
          stroke={DOWN}
          strokeWidth="1.2"
          strokeDasharray="4 2"
          strokeLinejoin="round"
        />
        <circle cx={last[0]} cy={last[1]} r="3" fill={SERIES} />
      </>
    )
  }

  return (
    <>
      {VOL_BAR_HEIGHTS.map((height, i) => {
        const barX = VOL_START_X + i * (VOL_BAR_W + VOL_BAR_MARGIN)
        const isSpike = i === VOL_SPIKE_IDX
        return (
          <rect
            key={i}
            x={barX}
            y={VOL_BASE_Y - height}
            width={VOL_BAR_W}
            height={height}
            fill={isSpike ? DOWN : SERIES}
            fillOpacity={isSpike ? "0.85" : "0.5"}
          />
        )
      })}
      <polyline
        points={toPath(VOL_MA_PTS)}
        fill="none"
        stroke={DOWN}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </>
  )
}

function LevelBreakoutMarks({ indicatorId }: { indicatorId: string }) {
  const isDown = indicatorId.startsWith("low_") || indicatorId.includes("breakdown")
  const levelY = isDown ? LVL_SUPPORT_Y : LVL_RESISTANCE_Y
  const breakY = isDown ? LVL_BREAK_SUPPORT_Y : LVL_BREAK_RESISTANCE_Y
  const color = isDown ? DOWN : UP

  const triSize = 6
  const triPoints = isDown
    ? `${LVL_BREAK_X},${breakY + triSize * 2} ${LVL_BREAK_X - triSize},${breakY} ${LVL_BREAK_X + triSize},${breakY}`
    : `${LVL_BREAK_X},${breakY - triSize * 2} ${LVL_BREAK_X - triSize},${breakY} ${LVL_BREAK_X + triSize},${breakY}`

  return (
    <>
      <polyline
        points={toPath(LVL_PRICE_PTS)}
        fill="none"
        stroke={MUTED}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="10" y1={levelY} x2="270" y2={levelY} stroke={color} strokeWidth="1.2" strokeDasharray="5 3" />
      <circle cx={LVL_BREAK_X} cy={breakY} r="4" fill={color} fillOpacity="0.9" />
      <polygon points={triPoints} fill={color} fillOpacity="0.85" />
    </>
  )
}

function CandlestickMarks({ indicatorId }: { indicatorId: string }) {
  let candles: Candle[]
  if (indicatorId === "bull_engulfing") candles = CANDLES_BULL_ENGULFING
  else if (indicatorId === "bear_engulfing") candles = CANDLES_BEAR_ENGULFING
  else if (indicatorId === "shooting_star") candles = CANDLES_SHOOTING_STAR
  else candles = CANDLES_HAMMER

  const bodyW = 22

  return (
    <>
      {candles.map((candle, i) => {
        const openY = priceToY(candle.open)
        const closeY = priceToY(candle.close)
        const color = candle.close >= candle.open ? UP : DOWN
        const bodyTop = Math.min(openY, closeY)
        const bodyH = Math.max(Math.abs(closeY - openY), 2)
        return (
          <g key={i}>
            <line
              x1={candle.x}
              y1={priceToY(candle.high)}
              x2={candle.x}
              y2={priceToY(candle.low)}
              stroke={color}
              strokeWidth="1.5"
            />
            <rect
              x={candle.x - bodyW / 2}
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
      <line x1="10" y1="125" x2="270" y2="125" stroke={BORDER} strokeWidth="1" />
      <polyline
        points={toPath(PRICE_PTS)}
        fill="none"
        stroke={MUTED}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points={toPath(MA_PTS)}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {showDeathCross && (
        <polyline
          points={toPath(MA2_PTS)}
          fill="none"
          stroke={DOWN}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />
      )}
    </>
  )
}

function DistanceMarks() {
  const last = PRICE_PTS[PRICE_PTS.length - 1]
  const priceAbove = last[1] < DIST_REF_Y
  const gapColor = priceAbove ? UP : DOWN
  const gapTop = Math.min(last[1], DIST_REF_Y)
  const gapBot = Math.max(last[1], DIST_REF_Y)

  return (
    <>
      <polyline
        points={toPath(PRICE_PTS)}
        fill="none"
        stroke={MUTED}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1={DIST_REF_Y}
        x2="270"
        y2={DIST_REF_Y}
        stroke={SERIES}
        strokeWidth="1.2"
        strokeDasharray="5 3"
      />
      <rect x={last[0] - 12} y={gapTop} width="24" height={gapBot - gapTop} fill={gapColor} fillOpacity="0.35" />
      <line x1={last[0]} y1={last[1]} x2={last[0]} y2={DIST_REF_Y} stroke={gapColor} strokeWidth="1.5" />
    </>
  )
}

function OscillatorMarks() {
  const y30 = 110 - 30 * 0.8
  const y70 = 110 - 70 * 0.8
  const last = OSC_PTS[OSC_PTS.length - 1]

  return (
    <>
      <rect x="10" y={y30} width="260" height={110 - y30} fill={UP} fillOpacity="0.08" />
      <rect x="10" y="20" width="260" height={y70 - 20} fill={DOWN} fillOpacity="0.08" />
      <line x1="10" y1={y30} x2="270" y2={y30} stroke={UP} strokeWidth="1" strokeDasharray="4 3" />
      <line x1="10" y1={y70} x2="270" y2={y70} stroke={DOWN} strokeWidth="1" strokeDasharray="4 3" />
      <polyline
        points={toPath(OSC_PTS)}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={SERIES} />
    </>
  )
}

function MacdMarks() {
  return (
    <>
      <line x1="10" y1={ZERO_Y} x2="270" y2={ZERO_Y} stroke={BORDER} strokeWidth="1" />
      {HIST_RAW.map((value, i) => {
        const barX = BAR_START_X + i * (BAR_W + BAR_MARGIN)
        const barH = Math.abs(value) * HIST_SCALE
        return (
          <rect
            key={i}
            x={barX}
            y={value >= 0 ? ZERO_Y - barH : ZERO_Y}
            width={BAR_W}
            height={barH}
            fill={value >= 0 ? UP : DOWN}
            fillOpacity="0.7"
          />
        )
      })}
      <polyline
        points={toPath(MACD_PTS)}
        fill="none"
        stroke={SERIES}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points={toPath(SIG_PTS)}
        fill="none"
        stroke={DOWN}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray="4 2"
      />
      <circle
        cx={MACD_PTS[CROSS_IDX][0]}
        cy={MACD_PTS[CROSS_IDX][1]}
        r="3.5"
        fill={SERIES}
        stroke={SURFACE}
        strokeWidth="1"
      />
    </>
  )
}

/** Sơ đồ minh hoạ cho một chỉ báo; `aria-hidden` vì phần chữ đã giải thích. */
export function IndicatorChart({
  indicatorId,
  archetype,
}: {
  indicatorId: string
  archetype: Archetype
}) {
  let marks: ReactNode

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
          stroke={MUTED}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )
  }

  return (
    <svg viewBox="0 0 280 140" className="w-full" aria-hidden="true" overflow="visible">
      {marks}
    </svg>
  )
}
