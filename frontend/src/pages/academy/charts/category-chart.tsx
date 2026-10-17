import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import { categoryRange, formatCompact, isNumber, linePath, niceTicks, textWidth, wrapText, type CategoryModel } from "./chart-math"
import { ChartLegendList } from "./chart-legend"
import { DASH, GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textColor, textFill } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/** Categorical order for series without a tone (DESIGN.md §2.5). */
const SERIES_ORDER: ChartTone[] = ["p1", "info", "p4", "p5", "p2", "p3"]

type Series = CategoryModel["series"][number]

function seriesTone(series: Series, index: number): ChartTone {
  return series.tone ?? (series.tone_by_sign ? series.tone_by_sign.pos : SERIES_ORDER[index % SERIES_ORDER.length])
}

function valueTone(model: CategoryModel, series: Series, index: number, value: number): ChartTone {
  if (series.tone_by_sign) return value >= 0 ? series.tone_by_sign.pos : series.tone_by_sign.neg
  const threshold = model.threshold
  if (threshold && (threshold.tone_at_or_above || threshold.tone_below)) {
    const tone = value >= threshold.value ? threshold.tone_at_or_above : threshold.tone_below
    if (tone) return tone
  }
  return seriesTone(series, index)
}

/**
 * K2: grouped or stacked bars and category lines, vertical or horizontal. Values are drawn as
 * given; a missing value is a gap, never zero.
 */
export function CategoryChart({ model, label, autoLegend = true }: { model: CategoryModel; label: string; autoLegend?: boolean }) {
  const [measure, width] = useChartWidth()
  const legend =
    autoLegend && model.series.length > 1 && !model.end_labels
      ? model.series.map((series, index) => ({
          label: series.name,
          tone: seriesTone(series, index),
          shape: model.mode === "line" ? ("line" as const) : ("bar" as const),
          dash: series.dash === true,
        }))
      : []

  return (
    <div ref={measure} className="w-full min-w-0 space-y-2">
      {model.title && <p className={cn("text-xs font-semibold text-foreground")}>{model.title}</p>}
      {legend.length > 0 && <ChartLegendList entries={legend} />}
      {model.orientation === "h" ? (
        <HorizontalBars model={model} label={label} width={width} />
      ) : (
        <VerticalChart model={model} label={label} width={width} />
      )}
      {model.caption_value && (
        <p className={cn("text-center text-sm font-semibold tabular-nums", textColor(model.caption_tone))}>{model.caption_value}</p>
      )}
    </div>
  )
}

function VerticalChart({ model, label, width }: { model: CategoryModel; label: string; width: number }) {
  const compact = width < 300
  const [lo, hi] = categoryRange(model)
  const ticks = (model.ticks ?? niceTicks(lo, hi, compact ? 3 : 4)).filter((tick) => tick >= lo && tick <= hi)
  const tickLabels = ticks.map((tick) => formatCompact(tick))
  const showAxis = !compact || model.ticks !== undefined
  const left = showAxis ? Math.max(24, Math.max(...tickLabels.map((text) => textWidth(text, 10.5)), 0) + 10) : 4
  const endLabelWidth =
    model.mode === "line" && model.end_labels ? Math.min(width * 0.32, Math.max(...model.end_labels.map((text) => textWidth(text))) + 10) : 0
  const right = width - 6 - endLabelWidth
  const count = model.labels.length
  const slot = (right - left) / count
  const labelLines = model.labels.map((text) => wrapText(text, Math.max(slot - 4, 28), 10.5, 2))
  const everyNth = Math.max(1, Math.ceil(Math.max(...model.labels.map((text) => Math.min(textWidth(text, 10.5), 80))) / Math.max(slot, 1)))
  const maxLines = Math.max(1, ...labelLines.map((lines) => lines.length))
  const valueRow = model.value_labels && model.value_labels !== "none" ? 14 : 0
  const top = 8 + valueRow + (model.sublabels ? 14 : 0)
  const plotHeight = compact ? 110 : width < 420 ? 160 : 190
  const bottom = top + plotHeight
  const height = bottom + 8 + maxLines * 13
  const y = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * plotHeight
  const zeroY = y(Math.min(Math.max(0, lo), hi))
  const cx = (index: number) => left + slot * (index + 0.5)
  const seriesCount = model.series.length
  const groupWidth = Math.min(slot * 0.72, model.mode === "grouped" ? 26 * seriesCount : 30)
  const barWidth = model.mode === "grouped" ? groupWidth / seriesCount : groupWidth
  const threshold = model.threshold

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((tick, index) => (
        <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} strokeWidth="0.8" className={GRID_STROKE} />
          {showAxis && (
            <text x={left - 6} y={y(tick) + 3.5} textAnchor="end" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
              {tickLabels[index]}
            </text>
          )}
        </g>
      ))}
      {lo < 0 && <line x1={left} x2={right} y1={zeroY} y2={zeroY} strokeWidth="1" className="stroke-chart-5" />}
      {model.mode !== "line" &&
        model.labels.map((_, index) => {
          let stackTop = 0
          return model.series.map((series, s) => {
            const value = series.values[index]
            if (!isNumber(value)) return null
            const tone = valueTone(model, series, s, value)
            let x: number
            let y0: number
            let y1: number
            if (model.mode === "stacked") {
              x = cx(index) - barWidth / 2
              y0 = y(stackTop)
              stackTop += Math.max(0, value)
              y1 = y(stackTop)
            } else {
              x = cx(index) - groupWidth / 2 + s * barWidth
              y0 = zeroY
              y1 = y(value)
            }
            const showValue =
              model.value_labels === "all" ? model.mode !== "stacked" || s === seriesCount - 1 : model.value_labels === "last" && index === count - 1
            const shownValue = model.mode === "stacked" ? stackTop : value
            return (
              <g key={`${index}-${s}`}>
                <rect
                  x={x + 0.5}
                  y={Math.min(y0, y1)}
                  width={Math.max(1, barWidth - 1)}
                  height={Math.max(0.8, Math.abs(y0 - y1))}
                  rx="1.5"
                  className={TONE_FILL[tone]}
                />
                {showValue && (
                  <text
                    x={x + barWidth / 2}
                    y={value < 0 && model.mode !== "stacked" ? y1 + 12 : Math.min(y0, y1) - 4}
                    textAnchor="middle"
                    className="fill-foreground text-[10.5px] font-semibold tabular-nums"
                  >
                    {formatCompact(shownValue)}
                  </text>
                )}
              </g>
            )
          })
        })}
      {model.mode === "line" &&
        model.series.map((series, s) => {
          const tone = seriesTone(series, s)
          const lastIndex = series.values.reduce<number>((last, value, index) => (isNumber(value) ? index : last), -1)
          return (
            <g key={`${series.name}-${s}`}>
              <path
                d={linePath(series.values, cx, y)}
                fill="none"
                strokeWidth="2"
                strokeDasharray={series.dash ? DASH : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={model.animate === "draw" && !series.dash ? 1 : undefined}
                className={cn(TONE_STROKE[tone], model.animate === "draw" && !series.dash && "academy-draw")}
              />
              {series.values.map((value, index) =>
                isNumber(value) && (model.value_labels === "all" || (model.value_labels === "last" && index === lastIndex)) ? (
                  <g key={index}>
                    <circle cx={cx(index)} cy={y(value)} r="2.6" className={TONE_FILL[tone]} />
                    <text x={cx(index)} y={y(value) - 6} textAnchor="middle" className="fill-foreground text-[10.5px] font-semibold tabular-nums">
                      {formatCompact(value)}
                    </text>
                  </g>
                ) : null,
              )}
              {model.end_labels && lastIndex >= 0 && (
                <text
                  x={cx(lastIndex) + 6}
                  y={y(series.values[lastIndex] as number) + 4}
                  className={cn(textFill(tone), "text-[11px] font-semibold tabular-nums")}
                >
                  {model.end_labels[s]}
                </text>
              )}
            </g>
          )
        })}
      {threshold && (
        <g>
          <line
            x1={left}
            x2={right}
            y1={y(threshold.value)}
            y2={y(threshold.value)}
            strokeWidth="1.2"
            strokeDasharray="5 4"
            className="stroke-chart-2"
          />
          <text x={right} y={y(threshold.value) - 4} textAnchor="end" className="fill-chart-2 text-[10.5px] font-semibold">
            {threshold.label}
          </text>
        </g>
      )}
      {model.sublabels?.map((text, index) => {
        if (!text) return null
        const top = Math.min(...model.series.map((series) => (isNumber(series.values[index]) ? y(Math.max(0, series.values[index] as number)) : bottom)))
        return (
          <text key={index} x={cx(index)} y={top - 4 - valueRow} textAnchor="middle" className={cn(LABEL_FILL, "text-[10px] tabular-nums")}>
            {text}
          </text>
        )
      })}
      {model.labels.map((_, index) =>
        index % everyNth !== 0 && index !== count - 1 ? null : (
          <text key={index} x={cx(index)} y={bottom + 14} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px]")}>
            {labelLines[index].map((line, lineIndex) => (
              <tspan key={lineIndex} x={cx(index)} dy={lineIndex === 0 ? 0 : 13}>
                {line}
              </tspan>
            ))}
          </text>
        ),
      )}
    </svg>
  )
}

function HorizontalBars({ model, label, width }: { model: CategoryModel; label: string; width: number }) {
  const [lo, hi] = categoryRange(model)
  const labelColumn = Math.min(150, Math.max(70, width * 0.34))
  const valueColumn = 46
  const left = labelColumn + 8
  const right = width - valueColumn
  const seriesCount = model.series.length
  const barHeight = model.mode === "grouped" ? Math.max(8, 18 / Math.max(1, seriesCount) + 4) : 16
  const lines = model.labels.map((text) => wrapText(text, labelColumn, 11, 3))
  const rowHeights = lines.map((rowLines) => Math.max((model.mode === "grouped" ? barHeight * seriesCount : barHeight) + 10, rowLines.length * 14 + 8))
  const tops: number[] = []
  let cursor = 4
  for (const h of rowHeights) {
    tops.push(cursor)
    cursor += h
  }
  const height = cursor + 4
  const x = (value: number) => left + ((value - lo) / (hi - lo || 1)) * (right - left)
  const zeroX = x(Math.min(Math.max(0, lo), hi))
  const threshold = model.threshold

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      <line x1={zeroX} x2={zeroX} y1={2} y2={height - 2} strokeWidth="1" className="stroke-chart-5" />
      {model.labels.map((_, index) => {
        const rowTop = tops[index]
        const mid = rowTop + rowHeights[index] / 2
        let stackLeft = 0
        return (
          <g key={index}>
            <text x={0} y={mid - ((lines[index].length - 1) * 14) / 2 + 4} className="fill-foreground text-[11px]">
              {lines[index].map((line, lineIndex) => (
                <tspan key={lineIndex} x={0} dy={lineIndex === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
            </text>
            {model.series.map((series, s) => {
              const value = series.values[index]
              if (!isNumber(value)) return null
              const tone = valueTone(model, series, s, value)
              const barTop = model.mode === "grouped" ? mid - (barHeight * seriesCount) / 2 + s * barHeight : mid - barHeight / 2
              let x0: number
              let x1: number
              if (model.mode === "stacked") {
                x0 = x(stackLeft)
                stackLeft += Math.max(0, value)
                x1 = x(stackLeft)
              } else {
                x0 = zeroX
                x1 = x(value)
              }
              const showValue =
                model.value_labels === "all" ? model.mode !== "stacked" || s === seriesCount - 1 : model.value_labels === "last" && index === model.labels.length - 1
              return (
                <g key={s}>
                  <rect
                    x={Math.min(x0, x1)}
                    y={barTop + 1}
                    width={Math.max(1, Math.abs(x1 - x0))}
                    height={Math.max(4, barHeight - 2)}
                    rx="1.5"
                    className={TONE_FILL[tone]}
                  />
                  {showValue && (
                    <text x={Math.max(x0, x1) + 5} y={barTop + barHeight / 2 + 4} className="fill-foreground text-[10.5px] font-semibold tabular-nums">
                      {formatCompact(model.mode === "stacked" ? stackLeft : value)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
      {threshold && (
        <g>
          <line x1={x(threshold.value)} x2={x(threshold.value)} y1={2} y2={height - 2} strokeWidth="1.2" strokeDasharray="5 4" className="stroke-chart-2" />
          <text x={x(threshold.value) + 4} y={12} className="fill-chart-2 text-[10.5px] font-semibold">
            {threshold.label}
          </text>
        </g>
      )}
    </svg>
  )
}
