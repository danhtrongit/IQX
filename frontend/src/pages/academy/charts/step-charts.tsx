import { useId } from "react"

import { cn } from "@/lib/utils"
import { CATEGORY_FILL, CATEGORY_STROKE, WATERFALL_FILL } from "./chart-theme"
import { formatCompact, niceTicks, waterfallBars, wrapLabel, type TimelineModel, type WaterfallModel } from "./chart-math"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

const ROW_HEIGHT = 58

/**
 * Chapter 3 `timeline`: labelled periods on a shared horizontal axis, one row per window
 * (for example the two four-quarter windows of a YoY comparison). Not a price chart.
 */
export function TimelineChart({ model, label }: { model: TimelineModel; label: string }) {
  const [measure, width] = useChartWidth()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const pad = 8
  const columns = model.labels.length
  const columnWidth = (width - pad * 2) / columns
  const axisHeight = 26
  const height = axisHeight + model.rows.length * ROW_HEIGHT + 6
  const narrow = width < NARROW_CHART_WIDTH

  return (
    <div ref={measure} className="w-full min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label} aria-describedby={`${uid}-desc`}>
        <title>{label}</title>
        <desc id={`${uid}-desc`}>
          {model.rows.map((row) => `${row.name}: từ ${model.labels[row.start]} đến ${model.labels[row.end]}, ${row.detail}`).join(". ")}
        </desc>
        {model.labels.map((text, index) => (
          <g key={`${text}-${index}`}>
            <line x1={pad + index * columnWidth} x2={pad + index * columnWidth} y1={axisHeight - 6} y2={height - 4} strokeWidth="0.8" className="stroke-border" />
            <text x={pad + (index + 0.5) * columnWidth} y={14} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
              {text}
            </text>
          </g>
        ))}
        <line x1={pad + columns * columnWidth} x2={pad + columns * columnWidth} y1={axisHeight - 6} y2={height - 4} strokeWidth="0.8" className="stroke-border" />
        {model.rows.map((row, rowIndex) => {
          const left = pad + row.start * columnWidth + 3
          const barWidth = (row.end - row.start + 1) * columnWidth - 6
          const top = axisHeight + rowIndex * ROW_HEIGHT + 4
          const tone = rowIndex % CATEGORY_FILL.length
          const centerX = left + barWidth / 2
          return (
            <g key={`${row.name}-${rowIndex}`}>
              <title>{`${row.name}: ${row.detail}`}</title>
              <rect x={left} y={top} width={barWidth} height={ROW_HEIGHT - 12} rx="4" className={cn(CATEGORY_FILL[tone], "opacity-25")} />
              <rect x={left} y={top} width={barWidth} height={ROW_HEIGHT - 12} rx="4" fill="none" strokeWidth="1.5" className={CATEGORY_STROKE[tone]} />
              <text x={centerX} y={top + 19} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                {wrapLabel(row.name, Math.max(8, Math.floor(barWidth / (narrow ? 6 : 6.5))), 1)[0]}
              </text>
              <text x={centerX} y={top + 34} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
                {wrapLabel(row.detail, Math.max(8, Math.floor(barWidth / (narrow ? 5.5 : 6))), 1)[0]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const signed = (value: number) => (value < 0 ? `−${formatCompact(Math.abs(value))}` : value > 0 ? `+${formatCompact(value)}` : formatCompact(0))

/**
 * Chapter 3 `waterfall`: a total step is a level measured from zero, any other step moves the
 * running level up or down (a "total" row is never added again). Signs and labels carry the
 * direction, so colour is not the only signal.
 */
export function WaterfallChart({ model, label }: { model: WaterfallModel; label: string }) {
  const [measure, width] = useChartWidth()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const bars = waterfallBars(model)
  const narrow = width < NARROW_CHART_WIDTH
  const left = 46
  const right = 10
  const top = 24
  const plotHeight = narrow ? 170 : 190
  const lines = bars.map((bar) => wrapLabel(bar.name, narrow ? 8 : 12, 3))
  const bottomPad = 10 + Math.max(...lines.map((entry) => entry.length), 1) * 12
  const height = top + plotHeight + bottomPad
  const bottom = top + plotHeight
  const levels = bars.flatMap((bar) => [bar.from, bar.to])
  const lo = Math.min(0, ...levels)
  const hi = Math.max(0, ...levels)
  const ticks = niceTicks(lo, hi, 4)
  const yMin = Math.min(lo, ticks[0] ?? lo)
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi) + (hi - lo) * 0.08
  const y = (value: number) => bottom - ((value - yMin) / (yMax - yMin || 1)) * plotHeight
  const slot = (width - left - right) / bars.length
  const barWidth = Math.min(46, slot * 0.62)
  const center = (index: number) => left + (index + 0.5) * slot
  const unitLine = model.unit ? `Đơn vị: ${model.unit}` : ""

  return (
    <div ref={measure} className="w-full min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`${label}${unitLine ? `. ${unitLine}` : ""}`} aria-describedby={`${uid}-desc`}>
        <title>{label}</title>
        <desc id={`${uid}-desc`}>{bars.map((bar) => `${bar.name} ${bar.total ? "" : signed(bar.value)}${bar.total ? formatCompact(bar.value) : ""}`).join("; ")}</desc>
        {unitLine && (
          <text x={left} y={12} className="fill-muted-foreground text-[10px]">
            {unitLine}
          </text>
        )}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} strokeWidth={tick === 0 ? 1.2 : 0.8} className={tick === 0 ? "stroke-muted-foreground" : "stroke-border"} />
            <text x={left - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {formatCompact(tick)}
            </text>
          </g>
        ))}
        {bars.map((bar, index) => {
          const next = bars[index + 1]
          const tone = bar.total ? WATERFALL_FILL.total : bar.value >= 0 ? WATERFALL_FILL.up : WATERFALL_FILL.down
          const topY = Math.min(y(bar.from), y(bar.to))
          const barHeight = Math.max(Math.abs(y(bar.from) - y(bar.to)), 1.5)
          return (
            <g key={`${bar.name}-${index}`}>
              {next && (
                <line x1={center(index) + barWidth / 2} x2={center(index + 1) - barWidth / 2} y1={y(bar.to)} y2={y(bar.to)} strokeWidth="0.9" strokeDasharray="3 3" className="stroke-muted-foreground" />
              )}
              <rect x={center(index) - barWidth / 2} y={topY} width={barWidth} height={barHeight} rx="1.5" className={tone} />
              <text x={center(index)} y={topY - 5} textAnchor="middle" className="fill-foreground text-[10.5px] font-semibold tabular-nums">
                {bar.total ? formatCompact(bar.value) : signed(bar.value)}
              </text>
              <text x={center(index)} y={bottom + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {lines[index].map((line, lineIndex) => (
                  <tspan key={lineIndex} x={center(index)} dy={lineIndex === 0 ? 0 : 11}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
