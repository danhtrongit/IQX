/**
 * Theme-aware pattern illustrations rendered with plain SVG.
 *
 * Replaces the static SVGs from `public/patterns/*` so the visuals adapt to
 * the active color scheme (dark/light) and follow the app's price palette
 * (emerald = up, red = down, amber = doji/neutral).
 *
 * `CandlePatternIllustration` renders a sequence of candles for a TA-Lib
 * candle pattern (Doji, Hammer, Engulfing, ...). For unknown patterns it
 * falls back to a templated trend-then-signal candle layout based on the
 * `signal` prop (bullish / bearish / neutral).
 *
 * `ChartPatternIllustration` renders the 15 classical chart patterns
 * (Ascending Triangle, Head & Shoulders, ...) as candles plus reference
 * lines for the neckline / support / resistance.
 */

import { useMemo } from "react"

// ── Types ────────────────────────────────────────────────────────────

export type Signal = "bullish" | "bearish" | "neutral"

interface Candle {
  o: number
  h: number
  l: number
  c: number
}

interface RefLine {
  /** Horizontal price level — drawn across full width. */
  y?: number
  /** Diagonal trendline — coordinates in data space (x1,y1)→(x2,y2). x is candle index. */
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  /** Tailwind-friendly stroke colour key. */
  color?: "red" | "blue" | "emerald" | "amber"
  dashed?: boolean
}

interface PatternData {
  candles: Candle[]
  refs?: RefLine[]
  caption?: string
}

// ── Color helpers ────────────────────────────────────────────────────

const STROKE_COLOR: Record<NonNullable<RefLine["color"]>, string> = {
  red: "#ef4444",
  blue: "#60a5fa",
  emerald: "#10b981",
  amber: "#fbbf24",
}

// ── Generic chart renderer ───────────────────────────────────────────

interface ChartProps {
  data: PatternData
  /** Render width/height in viewBox units. */
  width?: number
  height?: number
  /** Drawn underneath the chart, monospace caption (e.g. "[Open - Close] rất nhỏ"). */
  caption?: string
}

function CandleSVG({ data, width = 320, height = 200, caption }: ChartProps) {
  const { candles, refs = [] } = data
  const padL = 8
  const padR = 36
  const padT = 12
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  // Compute price domain across candles + reference lines (with 5% headroom)
  const allValues: number[] = []
  for (const c of candles) {
    allValues.push(c.h, c.l, c.o, c.c)
  }
  for (const r of refs) {
    if (typeof r.y === "number") allValues.push(r.y)
    if (typeof r.y1 === "number") allValues.push(r.y1)
    if (typeof r.y2 === "number") allValues.push(r.y2)
  }
  const dataMin = Math.min(...allValues)
  const dataMax = Math.max(...allValues)
  const range = dataMax - dataMin || 1
  const min = dataMin - range * 0.05
  const max = dataMax + range * 0.05

  const yScale = (v: number) => padT + ((max - v) / (max - min)) * plotH

  const slot = plotW / Math.max(candles.length, 1)
  const bodyW = Math.max(4, slot * 0.6)

  // Y-axis tick values (5 evenly spaced) — rounded to whole numbers
  const ticks: number[] = []
  for (let i = 0; i <= 4; i++) {
    ticks.push(min + ((max - min) * i) / 4)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      role="img"
    >
      {/* Faint grid */}
      {ticks.map((t, i) => {
        const y = yScale(t)
        return (
          <line
            key={`grid-${i}`}
            x1={padL}
            x2={padL + plotW}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-border opacity-40"
          />
        )
      })}

      {/* Reference / trend lines */}
      {refs.map((r, i) => {
        const colour = STROKE_COLOR[r.color ?? "blue"]
        const dash = r.dashed ? "4 3" : undefined
        if (typeof r.y === "number") {
          const y = yScale(r.y)
          return (
            <line
              key={`ref-${i}`}
              x1={padL}
              x2={padL + plotW}
              y1={y}
              y2={y}
              stroke={colour}
              strokeWidth={1.5}
              strokeDasharray={dash}
            />
          )
        }
        if (
          typeof r.x1 === "number" &&
          typeof r.y1 === "number" &&
          typeof r.x2 === "number" &&
          typeof r.y2 === "number"
        ) {
          const x1 = padL + (r.x1 + 0.5) * slot
          const x2 = padL + (r.x2 + 0.5) * slot
          const y1 = yScale(r.y1)
          const y2 = yScale(r.y2)
          return (
            <line
              key={`tref-${i}`}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
              stroke={colour}
              strokeWidth={1.5}
              strokeDasharray={dash}
            />
          )
        }
        return null
      })}

      {/* Candles */}
      {candles.map((c, i) => {
        const cx = padL + (i + 0.5) * slot
        const isUp = c.c >= c.o
        const isDoji = Math.abs(c.c - c.o) < range * 0.012
        const colour = isDoji ? STROKE_COLOR.amber : isUp ? STROKE_COLOR.emerald : STROKE_COLOR.red
        const yHigh = yScale(c.h)
        const yLow = yScale(c.l)
        const yTop = yScale(Math.max(c.o, c.c))
        const yBot = yScale(Math.min(c.o, c.c))
        const bodyH = Math.max(1, yBot - yTop)

        return (
          <g key={`c-${i}`}>
            {/* Wick */}
            <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={colour} strokeWidth={1.2} />
            {/* Body — outline-only for doji, filled for up/down */}
            {isDoji ? (
              <line
                x1={cx - bodyW / 2}
                x2={cx + bodyW / 2}
                y1={yTop}
                y2={yTop}
                stroke={colour}
                strokeWidth={1.6}
              />
            ) : (
              <rect
                x={cx - bodyW / 2}
                y={yTop}
                width={bodyW}
                height={bodyH}
                fill={colour}
                stroke={colour}
                strokeWidth={1}
                rx={0.5}
              />
            )}
          </g>
        )
      })}

      {/* Y-axis ticks (right side) */}
      {ticks.map((t, i) => {
        const y = yScale(t)
        return (
          <text
            key={`t-${i}`}
            x={padL + plotW + 4}
            y={y + 3}
            fontSize={9}
            className="fill-muted-foreground"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
          >
            {Math.round(t)}
          </text>
        )
      })}

      {/* Caption */}
      {caption && (
        <text
          x={width / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize={9}
          className="fill-muted-foreground"
        >
          {caption}
        </text>
      )}
    </svg>
  )
}

// ── Helpers to build pattern data ────────────────────────────────────

function uptrend(n: number, start = 60, step = 4): Candle[] {
  const out: Candle[] = []
  let o = start
  for (let i = 0; i < n; i++) {
    const c = o + step
    out.push({ o, h: c + step * 0.4, l: o - step * 0.3, c })
    o = c
  }
  return out
}

function downtrend(n: number, start = 90, step = 4): Candle[] {
  const out: Candle[] = []
  let o = start
  for (let i = 0; i < n; i++) {
    const c = o - step
    out.push({ o, h: o + step * 0.3, l: c - step * 0.4, c })
    o = c
  }
  return out
}

// ── Candle pattern catalog ───────────────────────────────────────────

function buildCandlePattern(name: string, signal: Signal): PatternData {
  switch (name) {
    case "Doji": {
      const lead = uptrend(5, 60, 4)
      const last = lead[lead.length - 1].c
      return {
        candles: [
          ...lead,
          { o: last + 4, h: last + 7, l: last + 1, c: last + 4 }, // doji
        ],
        caption: "[Open - Close] rất nhỏ",
      }
    }

    case "Doji Star":
    case "Morning Doji Star":
    case "Evening Doji Star":
    case "Tristar Pattern":
    case "Long Legged Doji":
    case "Rickshaw Man":
    case "Gravestone Doji":
    case "Dragonfly Doji":
    case "Takuri (Dragonfly Doji with long lower shadow)": {
      // Trend matching signal then doji-shaped final candle
      const lead = signal === "bearish" ? uptrend(4, 60, 4) : downtrend(4, 90, 4)
      const last = lead[lead.length - 1].c
      const bodyMid = signal === "bearish" ? last + 2 : last - 2
      let h = bodyMid + 4
      let l = bodyMid - 4
      if (name === "Gravestone Doji") {
        h = bodyMid + 10
        l = bodyMid
      } else if (name === "Dragonfly Doji" || name.startsWith("Takuri")) {
        h = bodyMid
        l = bodyMid - 12
      } else if (name === "Long Legged Doji" || name === "Rickshaw Man") {
        h = bodyMid + 9
        l = bodyMid - 9
      }
      return {
        candles: [...lead, { o: bodyMid, h, l, c: bodyMid + (signal === "bullish" ? 0.3 : -0.3) }],
        caption: "Open ≈ Close, bóng dài",
      }
    }

    case "Hammer":
    case "Inverted Hammer": {
      const lead = downtrend(4, 90, 5)
      const last = lead[lead.length - 1].c
      const o = last - 1
      const c = last + 2
      const h = name === "Inverted Hammer" ? c + 12 : c + 1
      const l = name === "Inverted Hammer" ? o - 1 : o - 14
      return {
        candles: [...lead, { o, h, l, c }],
        caption: name === "Inverted Hammer" ? "Bóng trên dài" : "Bóng dưới dài (Hammer)",
      }
    }

    case "Hanging Man":
    case "Shooting Star": {
      const lead = uptrend(4, 60, 5)
      const last = lead[lead.length - 1].c
      const o = last + 1
      const c = last - 2
      const h = name === "Shooting Star" ? o + 12 : o + 1
      const l = name === "Shooting Star" ? c - 1 : c - 14
      return {
        candles: [...lead, { o, h, l, c }],
        caption: name === "Shooting Star" ? "Bóng trên dài (đảo chiều giảm)" : "Bóng dưới dài",
      }
    }

    case "Engulfing Pattern": {
      const lead = signal === "bullish" ? downtrend(3, 90, 4) : uptrend(3, 60, 4)
      const last = lead[lead.length - 1]
      const small =
        signal === "bullish"
          ? { o: last.c + 0, h: last.c + 2, l: last.c - 4, c: last.c - 4 }
          : { o: last.c + 0, h: last.c + 4, l: last.c - 1, c: last.c + 4 }
      const big =
        signal === "bullish"
          ? { o: small.c - 1, h: small.o + 8, l: small.l - 1, c: small.o + 8 }
          : { o: small.c + 1, h: small.h + 1, l: small.o - 9, c: small.o - 9 }
      return { candles: [...lead, small, big], caption: "Nến lớn bao trùm nến nhỏ" }
    }

    case "Harami Pattern":
    case "Harami Cross Pattern": {
      const lead = signal === "bullish" ? downtrend(3, 90, 5) : uptrend(3, 60, 5)
      const last = lead[lead.length - 1]
      const big =
        signal === "bullish"
          ? { o: last.c, h: last.c + 1, l: last.c - 14, c: last.c - 14 }
          : { o: last.c, h: last.c + 14, l: last.c - 1, c: last.c + 14 }
      const innerMid = (big.o + big.c) / 2
      const inner =
        name === "Harami Cross Pattern"
          ? { o: innerMid, h: innerMid + 3, l: innerMid - 3, c: innerMid + 0.2 }
          : signal === "bullish"
            ? { o: innerMid - 2, h: innerMid + 2, l: innerMid - 3, c: innerMid + 2 }
            : { o: innerMid + 2, h: innerMid + 3, l: innerMid - 2, c: innerMid - 2 }
      return { candles: [...lead, big, inner], caption: "Nến nhỏ nằm trong thân nến lớn" }
    }

    case "Marubozu":
    case "Closing Marubozu":
    case "Long Line Candle": {
      const lead = signal === "bearish" ? uptrend(4, 60, 3) : downtrend(4, 90, 3)
      const last = lead[lead.length - 1].c
      const big =
        signal === "bearish"
          ? { o: last + 1, h: last + 1, l: last - 16, c: last - 16 }
          : { o: last - 1, h: last + 16, l: last - 1, c: last + 16 }
      return { candles: [...lead, big], caption: "Nến đặc, không bóng" }
    }

    case "Spinning Top":
    case "High-Wave Candle":
    case "Short Line Candle": {
      const lead = uptrend(4, 60, 3)
      const last = lead[lead.length - 1].c
      const small = { o: last - 1, h: last + 6, l: last - 7, c: last + 1 }
      return { candles: [...lead, small], caption: "Thân nến nhỏ, bóng dài" }
    }

    case "Three Advancing White Soldiers": {
      return {
        candles: [
          ...downtrend(2, 90, 4),
          { o: 80, h: 86, l: 79, c: 86 },
          { o: 84, h: 92, l: 83, c: 92 },
          { o: 90, h: 98, l: 89, c: 98 },
        ],
        caption: "3 nến tăng mạnh liên tiếp",
      }
    }

    case "Identical Three Crows": {
      return {
        candles: [
          ...uptrend(2, 60, 4),
          { o: 80, h: 81, l: 74, c: 74 },
          { o: 76, h: 76, l: 68, c: 68 },
          { o: 70, h: 70, l: 62, c: 62 },
        ],
        caption: "3 nến giảm mạnh liên tiếp",
      }
    }

    case "Morning Star": {
      return {
        candles: [
          { o: 95, h: 96, l: 88, c: 88 }, // big red
          { o: 86, h: 88, l: 84, c: 87 }, // small star
          { o: 88, h: 96, l: 87, c: 96 }, // big green
        ],
        caption: "Đảo chiều tăng (3 nến)",
      }
    }

    case "Evening Star": {
      return {
        candles: [
          { o: 60, h: 70, l: 59, c: 70 }, // big green
          { o: 71, h: 73, l: 70, c: 72 }, // small star
          { o: 70, h: 71, l: 62, c: 62 }, // big red
        ],
        caption: "Đảo chiều giảm (3 nến)",
      }
    }

    case "Three Inside Up/Down": {
      const isUp = signal === "bullish"
      return {
        candles: isUp
          ? [
              { o: 90, h: 91, l: 78, c: 78 }, // big red
              { o: 80, h: 86, l: 79, c: 86 }, // inside green
              { o: 86, h: 94, l: 85, c: 94 }, // confirm green
            ]
          : [
              { o: 70, h: 84, l: 69, c: 84 }, // big green
              { o: 82, h: 83, l: 76, c: 76 }, // inside red
              { o: 76, h: 77, l: 68, c: 68 }, // confirm red
            ],
      }
    }

    case "Three Outside Up/Down": {
      const isUp = signal === "bullish"
      return {
        candles: isUp
          ? [
              { o: 84, h: 85, l: 80, c: 80 }, // small red
              { o: 78, h: 92, l: 77, c: 92 }, // engulfing green
              { o: 92, h: 100, l: 91, c: 100 }, // confirm green
            ]
          : [
              { o: 76, h: 80, l: 75, c: 80 }, // small green
              { o: 82, h: 83, l: 70, c: 70 }, // engulfing red
              { o: 70, h: 71, l: 62, c: 62 }, // confirm red
            ],
      }
    }

    case "Belt-hold": {
      const lead = signal === "bullish" ? downtrend(3, 95, 4) : uptrend(3, 60, 4)
      const last = lead[lead.length - 1].c
      const sig =
        signal === "bullish"
          ? { o: last - 6, h: last + 8, l: last - 6, c: last + 8 } // open=low
          : { o: last + 6, h: last + 6, l: last - 8, c: last - 8 } // open=high
      return { candles: [...lead, sig], caption: "Open trùng High/Low" }
    }

    case "Piercing Pattern": {
      return {
        candles: [
          ...downtrend(2, 90, 5),
          { o: 80, h: 82, l: 70, c: 70 }, // big red
          { o: 68, h: 80, l: 67, c: 80 }, // green that closes above midpoint
        ],
      }
    }

    case "Dark Cloud Cover": {
      return {
        candles: [
          ...uptrend(2, 60, 5),
          { o: 70, h: 80, l: 69, c: 80 }, // big green
          { o: 82, h: 83, l: 72, c: 72 }, // red opens above and closes below midpoint
        ],
      }
    }

    case "Tasuki Gap":
    case "Up/Down-gap Side-by-side White Lines": {
      const isUp = signal === "bullish"
      return {
        candles: isUp
          ? [
              ...uptrend(2, 60, 5),
              { o: 76, h: 84, l: 75, c: 84 }, // green
              { o: 88, h: 94, l: 87, c: 94 }, // gap up green
              { o: 92, h: 93, l: 86, c: 87 }, // pullback red
            ]
          : [
              ...downtrend(2, 95, 5),
              { o: 79, h: 80, l: 71, c: 71 },
              { o: 67, h: 68, l: 60, c: 60 },
              { o: 63, h: 70, l: 62, c: 70 },
            ],
        caption: "Khoảng trống (gap) trong xu hướng",
      }
    }

    case "Matching Low": {
      return {
        candles: [
          ...downtrend(3, 95, 4),
          { o: 88, h: 89, l: 78, c: 78 },
          { o: 84, h: 85, l: 78, c: 78 }, // matching close=78
        ],
        refs: [{ y: 78, color: "emerald", dashed: true }],
        caption: "2 đáy Close trùng nhau",
      }
    }

    case "Three Stars in the South": {
      return {
        candles: [
          { o: 95, h: 96, l: 80, c: 80 },
          { o: 88, h: 89, l: 80, c: 82 },
          { o: 84, h: 85, l: 80, c: 82 },
        ],
        caption: "Nến giảm thu nhỏ dần ở đáy",
      }
    }
  }

  // Generic fallback — leading trend matching signal then a signature candle
  if (signal === "bullish") {
    const lead = downtrend(4, 90, 5)
    const last = lead[lead.length - 1].c
    return {
      candles: [...lead, { o: last - 1, h: last + 8, l: last - 2, c: last + 7 }],
    }
  }
  if (signal === "bearish") {
    const lead = uptrend(4, 60, 5)
    const last = lead[lead.length - 1].c
    return {
      candles: [...lead, { o: last + 1, h: last + 2, l: last - 8, c: last - 7 }],
    }
  }
  // neutral
  return {
    candles: [
      { o: 70, h: 76, l: 68, c: 73 },
      { o: 73, h: 78, l: 71, c: 74 },
      { o: 74, h: 78, l: 70, c: 72 },
      { o: 72, h: 76, l: 69, c: 73 },
      { o: 73, h: 75, l: 70, c: 73 }, // doji-ish
    ],
  }
}

// ── Chart pattern catalog ────────────────────────────────────────────

function buildChartPattern(name: string): PatternData {
  switch (name) {
    case "Ascending Triangle": {
      const candles: Candle[] = [
        { o: 70, h: 76, l: 68, c: 73 },
        { o: 72, h: 88, l: 71, c: 87 },
        { o: 84, h: 89, l: 78, c: 80 },
        { o: 80, h: 86, l: 76, c: 84 },
        { o: 84, h: 89, l: 79, c: 86 },
        { o: 84, h: 89, l: 81, c: 87 },
        { o: 86, h: 88, l: 82, c: 84 },
        { o: 84, h: 89, l: 83, c: 88 },
        { o: 88, h: 95, l: 87, c: 94 },
      ]
      return {
        candles,
        refs: [
          { y: 90, color: "red", dashed: true },
          { x1: 0, y1: 70, x2: 7, y2: 86, color: "blue", dashed: true },
        ],
        caption: "Kháng cự ngang · đáy sau cao dần",
      }
    }
    case "Descending Triangle": {
      const candles: Candle[] = [
        { o: 92, h: 96, l: 88, c: 90 },
        { o: 90, h: 92, l: 78, c: 80 },
        { o: 80, h: 86, l: 78, c: 84 },
        { o: 84, h: 86, l: 78, c: 80 },
        { o: 80, h: 84, l: 78, c: 82 },
        { o: 82, h: 84, l: 78, c: 80 },
        { o: 80, h: 82, l: 78, c: 79 },
        { o: 79, h: 80, l: 78, c: 78 },
        { o: 78, h: 79, l: 70, c: 71 },
      ]
      return {
        candles,
        refs: [
          { y: 78, color: "blue", dashed: true },
          { x1: 0, y1: 96, x2: 7, y2: 80, color: "red", dashed: true },
        ],
        caption: "Hỗ trợ ngang · đỉnh sau thấp dần",
      }
    }
    case "Symmetrical Triangle": {
      return {
        candles: [
          { o: 70, h: 96, l: 70, c: 92 },
          { o: 92, h: 94, l: 74, c: 76 },
          { o: 76, h: 90, l: 76, c: 88 },
          { o: 88, h: 90, l: 78, c: 80 },
          { o: 80, h: 88, l: 80, c: 86 },
          { o: 86, h: 88, l: 82, c: 84 },
          { o: 84, h: 86, l: 83, c: 85 },
          { o: 85, h: 92, l: 85, c: 92 },
        ],
        refs: [
          { x1: 0, y1: 96, x2: 6, y2: 86, color: "red", dashed: true },
          { x1: 0, y1: 70, x2: 6, y2: 84, color: "blue", dashed: true },
        ],
        caption: "Hai đường hội tụ",
      }
    }
    case "Bull Flag": {
      return {
        candles: [
          { o: 60, h: 64, l: 59, c: 64 },
          { o: 64, h: 76, l: 63, c: 75 },
          { o: 75, h: 90, l: 74, c: 89 }, // strong rally
          { o: 88, h: 90, l: 84, c: 85 },
          { o: 85, h: 87, l: 82, c: 83 },
          { o: 83, h: 85, l: 81, c: 81 },
          { o: 81, h: 83, l: 79, c: 80 }, // flag (slow drift down)
          { o: 80, h: 92, l: 79, c: 91 }, // breakout
        ],
        refs: [
          { x1: 2, y1: 90, x2: 6, y2: 84, color: "red", dashed: true },
          { x1: 2, y1: 84, x2: 6, y2: 78, color: "blue", dashed: true },
        ],
        caption: "Tăng mạnh → cờ → breakout",
      }
    }
    case "Bear Flag": {
      return {
        candles: [
          { o: 92, h: 94, l: 88, c: 88 },
          { o: 88, h: 89, l: 76, c: 76 },
          { o: 76, h: 77, l: 60, c: 62 }, // strong drop
          { o: 62, h: 68, l: 61, c: 67 },
          { o: 67, h: 70, l: 65, c: 69 },
          { o: 69, h: 73, l: 68, c: 72 },
          { o: 72, h: 74, l: 70, c: 73 }, // flag (drift up)
          { o: 73, h: 74, l: 58, c: 59 }, // breakdown
        ],
        refs: [
          { x1: 2, y1: 70, x2: 6, y2: 78, color: "red", dashed: true },
          { x1: 2, y1: 60, x2: 6, y2: 70, color: "blue", dashed: true },
        ],
        caption: "Giảm mạnh → cờ → breakdown",
      }
    }
    case "Cup and Handle": {
      return {
        candles: [
          { o: 90, h: 94, l: 88, c: 88 },
          { o: 88, h: 90, l: 78, c: 78 }, // start descent
          { o: 78, h: 80, l: 70, c: 71 },
          { o: 71, h: 73, l: 67, c: 69 }, // bottom
          { o: 69, h: 76, l: 68, c: 75 },
          { o: 75, h: 84, l: 74, c: 83 },
          { o: 83, h: 90, l: 82, c: 88 }, // back to rim
          { o: 88, h: 90, l: 84, c: 85 }, // handle pullback
          { o: 85, h: 96, l: 84, c: 95 }, // breakout
        ],
        refs: [{ y: 90, color: "red", dashed: true }],
        caption: "Cốc + tay cầm",
      }
    }
    case "Double Top": {
      return {
        candles: [
          { o: 70, h: 75, l: 69, c: 74 },
          { o: 74, h: 88, l: 73, c: 86 },
          { o: 86, h: 92, l: 84, c: 90 }, // top 1
          { o: 90, h: 91, l: 78, c: 80 },
          { o: 80, h: 86, l: 79, c: 84 },
          { o: 84, h: 92, l: 83, c: 90 }, // top 2 (~equal)
          { o: 90, h: 91, l: 76, c: 78 },
          { o: 78, h: 80, l: 66, c: 67 }, // breakdown
        ],
        refs: [
          { y: 92, color: "red", dashed: true },
          { y: 78, color: "blue", dashed: true },
        ],
        caption: "Hai đỉnh ngang nhau",
      }
    }
    case "Double Bottom": {
      return {
        candles: [
          { o: 92, h: 94, l: 86, c: 86 },
          { o: 86, h: 87, l: 72, c: 74 },
          { o: 74, h: 76, l: 68, c: 70 }, // bottom 1
          { o: 70, h: 84, l: 69, c: 82 },
          { o: 82, h: 84, l: 76, c: 78 },
          { o: 78, h: 80, l: 68, c: 70 }, // bottom 2 (~equal)
          { o: 70, h: 84, l: 69, c: 82 },
          { o: 82, h: 96, l: 81, c: 95 }, // breakout
        ],
        refs: [
          { y: 84, color: "red", dashed: true },
          { y: 68, color: "blue", dashed: true },
        ],
        caption: "Hai đáy ngang nhau",
      }
    }
    case "Triple Top": {
      return {
        candles: [
          { o: 70, h: 92, l: 69, c: 90 }, // top 1
          { o: 90, h: 91, l: 80, c: 81 },
          { o: 81, h: 92, l: 80, c: 90 }, // top 2
          { o: 90, h: 91, l: 80, c: 82 },
          { o: 82, h: 92, l: 81, c: 90 }, // top 3
          { o: 90, h: 91, l: 78, c: 79 }, // breakdown
          { o: 79, h: 80, l: 68, c: 68 },
        ],
        refs: [
          { y: 92, color: "red", dashed: true },
          { y: 80, color: "blue", dashed: true },
        ],
        caption: "Ba đỉnh ngang nhau",
      }
    }
    case "Triple Bottom": {
      return {
        candles: [
          { o: 92, h: 94, l: 70, c: 72 }, // bot 1
          { o: 72, h: 84, l: 70, c: 82 },
          { o: 82, h: 84, l: 70, c: 72 }, // bot 2
          { o: 72, h: 84, l: 70, c: 82 },
          { o: 82, h: 84, l: 70, c: 72 }, // bot 3
          { o: 72, h: 86, l: 71, c: 84 }, // breakout
          { o: 84, h: 96, l: 83, c: 95 },
        ],
        refs: [
          { y: 84, color: "red", dashed: true },
          { y: 70, color: "blue", dashed: true },
        ],
        caption: "Ba đáy ngang nhau",
      }
    }
    case "Falling Wedge": {
      return {
        candles: [
          { o: 95, h: 96, l: 88, c: 90 },
          { o: 90, h: 91, l: 78, c: 79 },
          { o: 79, h: 86, l: 78, c: 84 },
          { o: 84, h: 84, l: 74, c: 75 },
          { o: 75, h: 80, l: 74, c: 78 },
          { o: 78, h: 78, l: 72, c: 73 },
          { o: 73, h: 76, l: 72, c: 75 },
          { o: 75, h: 88, l: 74, c: 87 }, // breakout up
        ],
        refs: [
          { x1: 0, y1: 96, x2: 6, y2: 78, color: "red", dashed: true },
          { x1: 0, y1: 78, x2: 6, y2: 72, color: "blue", dashed: true },
        ],
        caption: "Hội tụ giảm dần · breakout lên",
      }
    }
    case "Rising Wedge": {
      return {
        candles: [
          { o: 60, h: 70, l: 59, c: 68 },
          { o: 68, h: 70, l: 62, c: 64 },
          { o: 64, h: 78, l: 63, c: 76 },
          { o: 76, h: 78, l: 70, c: 72 },
          { o: 72, h: 84, l: 71, c: 82 },
          { o: 82, h: 84, l: 78, c: 80 },
          { o: 80, h: 86, l: 79, c: 85 },
          { o: 85, h: 86, l: 70, c: 71 }, // breakdown
        ],
        refs: [
          { x1: 0, y1: 70, x2: 6, y2: 86, color: "red", dashed: true },
          { x1: 0, y1: 60, x2: 6, y2: 80, color: "blue", dashed: true },
        ],
        caption: "Hội tụ tăng dần · breakdown",
      }
    }
    case "Head and Shoulders": {
      return {
        candles: [
          { o: 60, h: 70, l: 59, c: 68 },
          { o: 68, h: 84, l: 67, c: 82 }, // L shoulder
          { o: 82, h: 84, l: 70, c: 72 },
          { o: 72, h: 92, l: 71, c: 90 }, // head
          { o: 90, h: 92, l: 70, c: 72 },
          { o: 72, h: 84, l: 71, c: 82 }, // R shoulder
          { o: 82, h: 84, l: 68, c: 69 }, // breakdown through neckline
        ],
        refs: [{ y: 70, color: "red", dashed: true }],
        caption: "Vai - Đầu - Vai",
      }
    }
    case "Inverse Head and Shoulders": {
      return {
        candles: [
          { o: 90, h: 92, l: 80, c: 82 },
          { o: 82, h: 84, l: 66, c: 68 }, // L shoulder
          { o: 68, h: 80, l: 67, c: 78 },
          { o: 78, h: 80, l: 58, c: 60 }, // head
          { o: 60, h: 80, l: 59, c: 78 },
          { o: 78, h: 80, l: 66, c: 68 }, // R shoulder
          { o: 68, h: 86, l: 67, c: 84 }, // breakout
        ],
        refs: [{ y: 80, color: "red", dashed: true }],
        caption: "Vai - Đầu - Vai ngược",
      }
    }
    case "Rectangle (Range)":
    case "Rectangle Range": {
      return {
        candles: [
          { o: 76, h: 88, l: 75, c: 86 },
          { o: 86, h: 88, l: 76, c: 78 },
          { o: 78, h: 88, l: 77, c: 86 },
          { o: 86, h: 88, l: 76, c: 78 },
          { o: 78, h: 88, l: 77, c: 86 },
          { o: 86, h: 88, l: 76, c: 78 },
          { o: 78, h: 88, l: 77, c: 86 },
        ],
        refs: [
          { y: 88, color: "red", dashed: true },
          { y: 76, color: "blue", dashed: true },
        ],
        caption: "Sideway giữa hai biên",
      }
    }
  }

  // Generic fallback for unknown chart pattern names — sideways candles
  return {
    candles: [
      { o: 70, h: 80, l: 68, c: 78 },
      { o: 78, h: 82, l: 72, c: 75 },
      { o: 75, h: 80, l: 70, c: 78 },
      { o: 78, h: 82, l: 73, c: 76 },
      { o: 76, h: 80, l: 72, c: 78 },
    ],
  }
}

// ── Public components ────────────────────────────────────────────────

export function CandlePatternIllustration({
  name,
  signal,
  caption,
}: {
  name: string
  signal: Signal
  caption?: string
}) {
  const data = useMemo(() => buildCandlePattern(name, signal), [name, signal])
  return <CandleSVG data={data} caption={caption ?? data.caption} />
}

export function ChartPatternIllustration({
  name,
  caption,
}: {
  name: string
  caption?: string
}) {
  const data = useMemo(() => buildChartPattern(name), [name])
  return <CandleSVG data={data} caption={caption ?? data.caption} />
}
