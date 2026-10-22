import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import {
  categoryRange,
  formatCategoryValue,
  isNumber,
  linePath,
  niceTicks,
  stackLabelSeries,
  stackTotals,
  textWidth,
  thinAxisLabels,
  wrapText,
  type AxisLabel,
  type CategoryModel,
} from "./chart-math"
import { ChartLegendList } from "./chart-legend"
import {
  DASH,
  GRID_STROKE,
  LABEL_FILL,
  TONE_FILL,
  TONE_STROKE,
  textColor,
  textFill,
} from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/** Categorical order for series without a tone (DESIGN.md §2.5). */
const SERIES_ORDER: ChartTone[] = ["p1", "info", "p4", "p5", "p2", "p3"]

type Series = CategoryModel["series"][number] & {
  per_bar_tones?: readonly (ChartTone | null)[]
}

function seriesTone(series: Series, index: number): ChartTone {
  return (
    series.tone ??
    (series.tone_by_sign
      ? series.tone_by_sign.pos
      : SERIES_ORDER[index % SERIES_ORDER.length])
  )
}

function valueTone(
  model: CategoryModel,
  series: Series,
  index: number,
  barIndex: number,
  value: number
): ChartTone {
  const perBar = series.per_bar_tones?.[barIndex]
  if (perBar) return perBar
  if (series.tone_by_sign)
    return value >= 0 ? series.tone_by_sign.pos : series.tone_by_sign.neg
  const threshold = model.threshold
  if (threshold && (threshold.tone_at_or_above || threshold.tone_below)) {
    const tone =
      value >= threshold.value
        ? threshold.tone_at_or_above
        : threshold.tone_below
    if (tone) return tone
  }
  return seriesTone(series, index)
}

/**
 * K2: grouped or stacked bars and category lines, vertical or horizontal. Values are drawn as
 * given; a missing value is a gap, never zero.
 */
export function CategoryChart({
  model,
  label,
  autoLegend = true,
}: {
  model: CategoryModel
  label: string
  autoLegend?: boolean
}) {
  const [measure, width] = useChartWidth()
  const legend =
    autoLegend && model.series.length > 1 && !model.end_labels
      ? model.series.map((series, index) => ({
          label: series.name,
          tone: seriesTone(series, index),
          shape:
            model.mode === "line" || series.dash === true
              ? ("line" as const)
              : ("bar" as const),
          dash: series.dash === true,
        }))
      : []

  return (
    <div ref={measure} className="w-full min-w-0 space-y-2">
      {model.title && (
        <p className={cn("text-xs font-semibold text-foreground")}>
          {model.title}
        </p>
      )}
      {legend.length > 0 && <ChartLegendList entries={legend} />}
      {model.orientation === "h" ? (
        <HorizontalBars model={model} label={label} width={width} />
      ) : (
        <VerticalChart model={model} label={label} width={width} />
      )}
      {model.caption_value && (
        <p
          className={cn(
            "text-center text-sm font-semibold tabular-nums",
            textColor(model.caption_tone)
          )}
        >
          {model.caption_value}
        </p>
      )}
    </div>
  )
}

type Box = { x0: number; x1: number; y0: number; y1: number }

const VALUE_SIZE = 10.5
/** Real glyphs run a little wider than the 0.56em estimate; placement keeps this much extra air. */
const LABEL_GAP = 4

const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x0 < b.x1 + gap &&
  b.x0 < a.x1 + gap &&
  a.y0 < b.y1 + gap &&
  b.y0 < a.y1 + gap

/** Box of a single-line label whose baseline is at `y`. */
function textBox(
  text: string,
  x: number,
  y: number,
  anchor: Anchor,
  size = VALUE_SIZE
): Box {
  const w = textWidth(text, size)
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2
  return { x0, x1: x0 + w, y0: y - size * 0.85, y1: y + size * 0.25 }
}

/**
 * Value label precision. A value authored with up to two decimals prints as authored; a computed value
 * (more decimals than that, e.g. a compounding series) rounds to its magnitude: whole numbers from 10,
 * one decimal from 1, two below, so 51.0263 prints "51" and not "51,03".
 */
function roundToDataPrecision(value: number): number {
  if (Math.abs(value * 100 - Math.round(value * 100)) < 1e-6) return value
  const magnitude = Math.abs(value)
  const digits = magnitude >= 10 ? 0 : magnitude >= 1 ? 1 : 2
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const valueText = (model: CategoryModel, value: number) =>
  formatCategoryValue(roundToDataPrecision(value), model.value_format)

type Anchor = "start" | "middle" | "end"

/** Keeps a label centred on `x` inside [0, width], switching its anchor at either edge. */
function clampAnchor(
  x: number,
  w: number,
  width: number
): { x: number; anchor: Anchor } {
  if (x - w / 2 < 1) return { x: 1, anchor: "start" }
  if (x + w / 2 > width - 1) return { x: width - 1, anchor: "end" }
  return { x, anchor: "middle" }
}

/** Spreads labels that want nearly the same baseline apart (at least `gap` between baselines) inside [lo, hi]. */
function spreadVertically(
  wanted: number[],
  gap: number,
  lo: number,
  hi: number
): number[] {
  const order = wanted
    .map((y, index) => ({ y, index }))
    .sort((a, b) => a.y - b.y)
  const placed = order.map((item) => item.y)
  for (let k = 0; k < placed.length; k += 1)
    placed[k] = Math.max(placed[k], k === 0 ? lo : placed[k - 1] + gap)
  if (placed.length && placed[placed.length - 1] > hi) {
    placed[placed.length - 1] = hi
    for (let k = placed.length - 2; k >= 0; k -= 1)
      placed[k] = Math.min(placed[k], placed[k + 1] - gap)
  }
  const result = new Array<number>(wanted.length)
  order.forEach((item, k) => {
    result[item.index] = placed[k]
  })
  return result
}

type Bar = {
  key: string
  tone: ChartTone
  x: number
  y0: number
  y1: number
  label: { text: string; x: number; y: number; anchor: Anchor } | null
}

function VerticalChart({
  model,
  label,
  width,
}: {
  model: CategoryModel
  label: string
  width: number
}) {
  const compact = width < 300
  const [lo, hi] = categoryRange(model)
  const ticks = (model.ticks ?? niceTicks(lo, hi, compact ? 3 : 4)).filter(
    (tick) => tick >= lo && tick <= hi
  )
  const tickLabels = ticks.map((tick) =>
    formatCategoryValue(tick, model.value_format)
  )
  const showAxis = !compact || model.ticks !== undefined
  // Tabular digits, signs and "%" print wider than the 0.56em estimate: reserve 0.68em per glyph for tick labels.
  const left = showAxis
    ? Math.max(
        24,
        Math.max(
          ...tickLabels.map((text) => (textWidth(text, 10.5) * 0.68) / 0.56),
          0
        ) + 10
      )
    : 4
  const endLabelWidth =
    model.mode === "line" && model.end_labels
      ? Math.min(
          width * 0.32,
          Math.max(...model.end_labels.map((text) => textWidth(text))) + 10
        )
      : 0
  const baseRight = width - 6 - endLabelWidth
  const count = model.labels.length
  const valueRow = model.value_labels && model.value_labels !== "none" ? 14 : 0
  const top = 8 + valueRow + (model.sublabels ? 14 : 0)
  const plotHeight = compact ? 110 : width < 420 ? 160 : 190
  const bottom = top + plotHeight
  const y = (value: number) =>
    bottom - ((value - lo) / (hi - lo || 1)) * plotHeight
  const zeroY = y(Math.min(Math.max(0, lo), hi))
  const barSeriesList =
    model.mode === "line"
      ? []
      : model.series.filter((series) => !series.dash)
  const lineSeriesList =
    model.mode === "line"
      ? model.series
      : model.series.filter((series) => series.dash === true)
  const seriesCount = Math.max(1, barSeriesList.length)
  const threshold = model.threshold

  /** Bars, their value labels and the boxes they cover, for a plot that ends at `right`. */
  const layout = (right: number) => {
    const slot = (right - left) / count
    const cx = (index: number) => left + slot * (index + 0.5)
    const groupWidth = Math.min(
      slot * 0.72,
      model.mode === "grouped" ? 26 * seriesCount : 30
    )
    const barWidth =
      model.mode === "grouped" ? groupWidth / seriesCount : groupWidth
    const bars: Bar[] = []
    if (model.mode !== "line") {
      const stacked = model.mode === "stacked"
      model.labels.forEach((_, index) => {
        let stackTop = 0
        let stackBottom = 0
        const totals = stackTotals(model, index)
        const labelSeries = stackLabelSeries(model, index)
        barSeriesList.forEach((series, s) => {
          const value = series.values[index]
          if (!isNumber(value)) return
          let x: number
          let y0: number
          let y1: number
          if (stacked) {
            x = cx(index) - barWidth / 2
            if (value >= 0) {
              y0 = y(stackTop)
              stackTop += value
              y1 = y(stackTop)
            } else {
              y0 = y(stackBottom)
              stackBottom += value
              y1 = y(stackBottom)
            }
          } else {
            x = cx(index) - groupWidth / 2 + s * barWidth
            y0 = zeroY
            y1 = y(value)
          }
          // Stacked: one label per category, on its last segment, showing the net total above the
          // positive stack (or below the negative one).
          const showValue =
            model.value_labels === "all"
              ? !stacked || s === labelSeries
              : model.value_labels === "last" &&
                index === count - 1 &&
                (!stacked || s === labelSeries)
          const shownValue = stacked ? totals.net : value
          const labelY = stacked
            ? totals.net < 0
              ? y(totals.neg) + 12
              : y(totals.pos) - 4
            : value < 0
              ? y1 + 12
              : Math.min(y0, y1) - 4
          const text = valueText(model, shownValue)
          bars.push({
            key: `${index}-${s}`,
            tone: valueTone(model, series, s, index, value),
            x,
            y0,
            y1,
            label: showValue
              ? {
                  text,
                  y: labelY,
                  ...clampAnchor(
                    x + barWidth / 2,
                    textWidth(text, VALUE_SIZE),
                    width
                  ),
                }
              : null,
          })
        })
      })
    }
    const obstacles: Box[] = bars.flatMap((bar) => [
      {
        x0: bar.x,
        x1: bar.x + barWidth,
        y0: Math.min(bar.y0, bar.y1),
        y1: Math.max(bar.y0, bar.y1),
      },
      ...(bar.label
        ? [textBox(bar.label.text, bar.label.x, bar.label.y, bar.label.anchor)]
        : []),
    ])
    return { right, slot, cx, barWidth, bars, obstacles }
  }

  // The threshold label sits on its line where nothing else is drawn: right end, left end, then over a
  // gap between categories, above or below the line. When every spot is taken it gets a right gutter.
  let geometry = layout(baseRight)
  let thresholdLabel: { x: number; y: number; anchor: Anchor } | null = null
  if (threshold?.label) {
    const text = threshold.label
    const ty = y(threshold.value)
    const spots = (g: ReturnType<typeof layout>) =>
      [
        { x: g.right, anchor: "end" as const },
        { x: left + 2, anchor: "start" as const },
        ...Array.from({ length: Math.max(0, count - 1) }, (_, k) => ({
          x: left + g.slot * (count - 1 - k),
          anchor: "middle" as const,
        })),
      ].flatMap((spot) => [
        { ...spot, y: ty - 4 },
        { ...spot, y: ty + 12 },
      ])
    const spot = spots(geometry).find((candidate) => {
      const box = textBox(text, candidate.x, candidate.y, candidate.anchor)
      return (
        box.y0 >= 0 &&
        box.y1 <= bottom &&
        !geometry.obstacles.some((obstacle) =>
          overlaps(box, obstacle, LABEL_GAP)
        )
      )
    })
    if (spot) thresholdLabel = spot
    else {
      geometry = layout(baseRight - textWidth(text, VALUE_SIZE) - 8)
      thresholdLabel = { x: geometry.right + 4, y: ty + 3.5, anchor: "start" }
    }
  }
  const { right, slot, cx, barWidth, bars } = geometry

  // Category labels wrap into their slot when every one fits; otherwise they stay on one line and thin
  // out, the last one always kept and a colliding neighbour dropped.
  const axisLabels = (lines: string[][]): AxisLabel[] =>
    lines.map((rows, index) => {
      const widest = rows.reduce((a, b) => (b.length > a.length ? b : a), "")
      const placed = clampAnchor(cx(index), textWidth(widest, 10.5), width)
      return { index, text: widest, at: placed.x, anchor: placed.anchor }
    })
  const wrapped = model.labels.map((text) =>
    wrapText(text, Math.max(slot - 4, 28), 10.5, 2)
  )
  const wrappedAxis = axisLabels(wrapped)
  const fitsWrapped =
    thinAxisLabels(wrappedAxis, 10.5, LABEL_GAP + 2).length === count
  const labelLines = fitsWrapped
    ? wrapped
    : model.labels.map((text) => wrapText(text, 80, 10.5, 2))
  const shownAxis = fitsWrapped
    ? wrappedAxis
    : thinAxisLabels(axisLabels(labelLines), 10.5, LABEL_GAP + 2)
  const maxLines = Math.max(
    1,
    ...shownAxis.map((entry) => labelLines[entry.index].length)
  )
  const height = bottom + 10 + maxLines * 13

  // Line end labels sit right of the last point, spread apart when two series end close together.
  const lastIndexes = lineSeriesList.map((series) =>
    series.values.reduce<number>(
      (last, value, index) => (isNumber(value) ? index : last),
      -1
    )
  )
  const endYs =
    model.mode === "line" && model.end_labels
      ? spreadVertically(
          lineSeriesList.map((series, s) =>
            lastIndexes[s] >= 0
              ? y(series.values[lastIndexes[s]] as number) + 4
              : bottom
          ),
          14,
          11,
          height - 2
        )
      : []

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {ticks.map((tick, index) => (
        <g key={tick}>
          <line
            x1={left}
            x2={right}
            y1={y(tick)}
            y2={y(tick)}
            strokeWidth="0.8"
            className={GRID_STROKE}
          />
          {showAxis && (
            <text
              x={left - 6}
              y={y(tick) + 3.5}
              textAnchor="end"
              className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}
            >
              {tickLabels[index]}
            </text>
          )}
        </g>
      ))}
      {lo < 0 && (
        <line
          x1={left}
          x2={right}
          y1={zeroY}
          y2={zeroY}
          strokeWidth="1"
          className="stroke-chart-5"
        />
      )}
      {bars.map((bar) => (
        <g key={bar.key}>
          <rect
            x={bar.x + 0.5}
            y={Math.min(bar.y0, bar.y1)}
            width={Math.max(1, barWidth - 1)}
            height={Math.max(0.8, Math.abs(bar.y0 - bar.y1))}
            rx="1.5"
            className={cn(TONE_FILL[bar.tone], bar.tone === "neutral" && "opacity-45")}
          />
          {bar.label && (
            <text
              x={bar.label.x}
              y={bar.label.y}
              textAnchor={bar.label.anchor}
              className="fill-foreground text-[10.5px] font-semibold tabular-nums"
            >
              {bar.label.text}
            </text>
          )}
        </g>
      ))}
      {lineSeriesList.map((series, s) => {
          const tone = seriesTone(series, s)
          const lastIndex = lastIndexes[s]
          return (
            <g key={`${series.name}-${s}`}>
              <path
                d={linePath(series.values, cx, y)}
                fill="none"
                strokeWidth="2"
                strokeDasharray={series.dash ? DASH : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={
                  model.animate === "draw" && !series.dash ? 1 : undefined
                }
                className={cn(
                  TONE_STROKE[tone],
                  model.animate === "draw" && !series.dash && "academy-draw"
                )}
              />
              {series.values.map((value, index) => {
                if (
                  !isNumber(value) ||
                  !(
                    model.value_labels === "all" ||
                    (model.value_labels === "last" && index === lastIndex)
                  )
                )
                  return null
                const text = valueText(model, value)
                const placed = clampAnchor(
                  cx(index),
                  textWidth(text, VALUE_SIZE),
                  width
                )
                return (
                  <g key={index}>
                    <circle
                      cx={cx(index)}
                      cy={y(value)}
                      r="2.6"
                      className={TONE_FILL[tone]}
                    />
                    <text
                      x={placed.x}
                      y={y(value) - 6}
                      textAnchor={placed.anchor}
                      className="fill-foreground text-[10.5px] font-semibold tabular-nums"
                    >
                      {text}
                    </text>
                  </g>
                )
              })}
              {model.end_labels && lastIndex >= 0 && (
                <text
                  x={cx(lastIndex) + 6}
                  y={endYs[s]}
                  className={cn(
                    textFill(tone),
                    "text-[11px] font-semibold tabular-nums"
                  )}
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
          {thresholdLabel && (
            <text
              x={thresholdLabel.x}
              y={thresholdLabel.y}
              textAnchor={thresholdLabel.anchor}
              className="fill-chart-2 text-[10.5px] font-semibold"
            >
              {threshold.label}
            </text>
          )}
        </g>
      )}
      {model.sublabels?.map((text, index) => {
        if (!text) return null
        const top = Math.min(
          ...model.series.map((series) =>
            isNumber(series.values[index])
              ? y(Math.max(0, series.values[index] as number))
              : bottom
          )
        )
        // A sublabel at the last slot would run past the chart; it keeps its anchor inside.
        const placed = clampAnchor(cx(index), textWidth(text, 10), width)
        return (
          <text
            key={index}
            x={placed.x}
            y={top - 4 - valueRow}
            textAnchor={placed.anchor}
            className={cn(LABEL_FILL, "text-[10px] tabular-nums")}
          >
            {text}
          </text>
        )
      })}
      {shownAxis.map((entry) => (
        <text
          key={entry.index}
          x={entry.at}
          y={bottom + 16}
          textAnchor={entry.anchor}
          className={cn(LABEL_FILL, "text-[10.5px]")}
        >
          {labelLines[entry.index].map((line, lineIndex) => (
            <tspan key={lineIndex} x={entry.at} dy={lineIndex === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      ))}
    </svg>
  )
}

function HorizontalBars({
  model,
  label,
  width,
}: {
  model: CategoryModel
  label: string
  width: number
}) {
  const [lo, hi] = categoryRange(model)
  const labelColumn = Math.min(150, Math.max(70, width * 0.34))
  const valueColumn = 46
  const left = labelColumn + 8
  const right = width - valueColumn
  const seriesCount = model.series.length
  const barHeight =
    model.mode === "grouped"
      ? Math.max(8, 18 / Math.max(1, seriesCount) + 4)
      : 16
  const lines = model.labels.map((text) => wrapText(text, labelColumn, 11, 3))
  const rowHeights = lines.map((rowLines) =>
    Math.max(
      (model.mode === "grouped" ? barHeight * seriesCount : barHeight) + 10,
      rowLines.length * 14 + 8
    )
  )
  const threshold = model.threshold
  // A threshold label gets its own row above the bars so it never prints over the first bar.
  const thresholdRow = threshold?.label ? 18 : 0
  const tops: number[] = []
  let cursor = 4 + thresholdRow
  for (const h of rowHeights) {
    tops.push(cursor)
    cursor += h
  }
  const height = cursor + 4
  const x = (value: number) =>
    left + ((value - lo) / (hi - lo || 1)) * (right - left)
  const zeroX = x(Math.min(Math.max(0, lo), hi))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <line
        x1={zeroX}
        x2={zeroX}
        y1={2}
        y2={height - 2}
        strokeWidth="1"
        className="stroke-chart-5"
      />
      {model.labels.map((_, index) => {
        const rowTop = tops[index]
        const mid = rowTop + rowHeights[index] / 2
        let stackRight = 0
        let stackLeft = 0
        const totals = stackTotals(model, index)
        const labelSeries = stackLabelSeries(model, index)
        return (
          <g key={index}>
            <text
              x={0}
              y={mid - ((lines[index].length - 1) * 14) / 2 + 4}
              className="fill-foreground text-[11px]"
            >
              {lines[index].map((line, lineIndex) => (
                <tspan key={lineIndex} x={0} dy={lineIndex === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
            </text>
            {model.series.map((series, s) => {
              const value = series.values[index]
              if (!isNumber(value)) return null
              const tone = valueTone(model, series, s, index, value)
              const barTop =
                model.mode === "grouped"
                  ? mid - (barHeight * seriesCount) / 2 + s * barHeight
                  : mid - barHeight / 2
              let x0: number
              let x1: number
              if (model.mode === "stacked") {
                if (value >= 0) {
                  x0 = x(stackRight)
                  stackRight += value
                  x1 = x(stackRight)
                } else {
                  x0 = x(stackLeft)
                  stackLeft += value
                  x1 = x(stackLeft)
                }
              } else {
                x0 = zeroX
                x1 = x(value)
              }
              const stacked = model.mode === "stacked"
              const showValue =
                model.value_labels === "all"
                  ? !stacked || s === labelSeries
                  : model.value_labels === "last" &&
                    index === model.labels.length - 1 &&
                    (!stacked || s === labelSeries)
              // Stacked rows carry the net total, right of the positive stack (or of the zero line).
              const shownValue = stacked ? totals.net : value
              const labelX = stacked ? x(totals.pos) + 5 : Math.max(x0, x1) + 5
              return (
                <g key={s}>
                  <rect
                    x={Math.min(x0, x1)}
                    y={barTop + 1}
                    width={Math.max(1, Math.abs(x1 - x0))}
                    height={Math.max(4, barHeight - 2)}
                    rx="1.5"
                    className={cn(TONE_FILL[tone], tone === "neutral" && "opacity-45")}
                  />
                  {showValue && (
                    <text
                      x={labelX}
                      y={barTop + barHeight / 2 + 4}
                      className="fill-foreground text-[10.5px] font-semibold tabular-nums"
                    >
                      {valueText(model, shownValue)}
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
          <line
            x1={x(threshold.value)}
            x2={x(threshold.value)}
            y1={2 + thresholdRow}
            y2={height - 2}
            strokeWidth="1.2"
            strokeDasharray="5 4"
            className="stroke-chart-2"
          />
          {threshold.label &&
            (() => {
              const placed = clampAnchor(
                x(threshold.value),
                (textWidth(threshold.label, 10.5) * 0.66) / 0.56,
                width
              )
              return (
                <text
                  x={placed.x}
                  y={14}
                  textAnchor={placed.anchor}
                  className="fill-chart-2 text-[10.5px] font-semibold"
                >
                  {threshold.label}
                </text>
              )
            })()}
        </g>
      )}
    </svg>
  )
}
