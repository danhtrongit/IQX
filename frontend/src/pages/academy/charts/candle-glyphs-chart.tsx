import { Fragment } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import { wrapText, type CandleGlyphsModel } from "./chart-math"
import { LABEL_FILL, TONE_FILL, TONE_STROKE } from "./chart-theme"

type Group = CandleGlyphsModel["groups"][number]

const BODY_WIDTH = { s: 10, m: 16, l: 26 } as const
const SLOT_WIDTH = { s: 30, m: 40, l: 56 } as const

/**
 * K7: axis-less candle illustrations (anatomy, variants, patterns). Groups wrap on a phone; each
 * candle is green when it closes at or above its open, red otherwise.
 */
export function CandleGlyphsChart({ model, label }: { model: CandleGlyphsModel; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-4">
      {model.groups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 && model.join && (
            <span aria-hidden="true" className="text-lg font-semibold text-academy-label">
              {model.join}
            </span>
          )}
          <CandleGroup group={group} domain={model.domain} />
        </Fragment>
      ))}
    </div>
  )
}

function CandleGroup({ group, domain }: { group: Group; domain: CandleGlyphsModel["domain"] }) {
  const annotate = group.annotate === "ohlc"
  const plotHeight = group.candles.some((candle) => candle.size === "l") ? 150 : 120
  const labelled = group.candles.some((candle) => candle.label)
  const labelLines = group.candles.map((candle) => (candle.label ? wrapText(candle.label, SLOT_WIDTH[candle.size ?? "m"] + 10, 10.5, 2) : []))
  const labelHeight = labelled ? Math.max(...labelLines.map((lines) => lines.length)) * 13 + 6 : 0
  const slots = group.candles.map((candle) => SLOT_WIDTH[candle.size ?? "m"] + (labelled ? 10 : 0))
  const annotationWidth = annotate ? 70 : 0
  const width = slots.reduce((sum, slot) => sum + slot, 0) + annotationWidth + 4
  const top = 8
  const height = top + plotHeight + 6 + labelHeight
  const [lo, hi] = domain
  const y = (v: number) => top + plotHeight - ((v - lo) / (hi - lo || 1)) * plotHeight
  const centers = slots.map((slot, index) => 2 + slots.slice(0, index).reduce((sum, prev) => sum + prev, 0) + slot / 2)

  return (
    <figure className="m-0 flex flex-col items-center gap-1" aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
        {group.candles.map((candle, index) => {
          const tone: ChartTone = candle.c >= candle.o ? "pos" : "neg"
          const body = BODY_WIDTH[candle.size ?? "m"]
          const cx = centers[index]
          const bodyTop = y(Math.max(candle.o, candle.c))
          const bodyBottom = y(Math.min(candle.o, candle.c))
          return (
            <g key={index}>
              <line x1={cx} x2={cx} y1={y(candle.h)} y2={y(candle.l)} strokeWidth="1.6" className={TONE_STROKE[tone]} />
              <rect x={cx - body / 2} y={bodyTop} width={body} height={Math.max(1.5, bodyBottom - bodyTop)} rx="1" className={TONE_FILL[tone]} />
              {candle.label && (
                <text x={cx} y={top + plotHeight + 16} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px]")}>
                  {labelLines[index].map((line, lineIndex) => (
                    <tspan key={lineIndex} x={cx} dy={lineIndex === 0 ? 0 : 13}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              {annotate && index === group.candles.length - 1 && <OhlcLabels candle={candle} cx={cx} body={body} y={y} />}
            </g>
          )
        })}
      </svg>
      {group.title && <figcaption className="text-xs font-semibold text-foreground">{group.title}</figcaption>}
    </figure>
  )
}

function OhlcLabels({ candle, cx, body, y }: { candle: Group["candles"][number]; cx: number; body: number; y: (v: number) => number }) {
  const rising = candle.c >= candle.o
  const x0 = cx + body / 2 + 4
  const rows = [
    { v: candle.h, text: "Cao nhất" },
    { v: Math.max(candle.o, candle.c), text: rising ? "Đóng cửa" : "Mở cửa" },
    { v: Math.min(candle.o, candle.c), text: rising ? "Mở cửa" : "Đóng cửa" },
    { v: candle.l, text: "Thấp nhất" },
  ]
  return (
    <g>
      {rows.map((row) => (
        <g key={row.text}>
          <line x1={x0} x2={x0 + 8} y1={y(row.v)} y2={y(row.v)} strokeWidth="0.8" className="stroke-chart-5" />
          <text x={x0 + 11} y={y(row.v) + 3.5} className={cn(LABEL_FILL, "text-[10.5px]")}>
            {row.text}
          </text>
        </g>
      ))}
    </g>
  )
}
