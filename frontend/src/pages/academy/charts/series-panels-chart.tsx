import { useId, useState, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import {
  areaPath,
  formatValue,
  isNumber,
  linePath,
  niceTicks,
  observationLabel,
  panelRange,
  seriesPanelsReadout,
  textWidth,
  thinAxisLabels,
  windowSize,
  wrapText,
  type SeriesPanel,
  type SeriesPanelsModel,
} from "./chart-math"
import { ChartLegendList, type LegendEntry } from "./chart-legend"
import { DASH, GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import {
  LINE_HEIGHT,
  alongLine,
  annotationWidth,
  aroundPoint,
  inZone,
  placeLabels,
  polylineSegments,
  stackRowLabels,
  type Box,
  type Candidate,
  type LabelRequest,
  type Obstacle,
  type PlacedLabel,
  type Segment,
} from "./series-panels-labels"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

const LEVEL_TONE: Record<NonNullable<SeriesPanel["levels"]>[number]["role"], ChartTone> = {
  buy: "pos",
  sell: "neg",
  neutral: "p3",
  avg: "p2",
}
const BAR_TONE = { pos: "pos", neg: "neg", neutral: "p3" } as const

function panelHeights(model: SeriesPanelsModel, narrow: boolean, thumbnail: boolean, width: number): number[] {
  // A thumbnail keeps about the mockup's 760x260 proportion when it is drawn alone across the reader, and its
  // 96px sparkline height in a phone grid cell.
  if (thumbnail) {
    const scale = Math.max(1, (width * 0.32) / 96)
    return model.panels.map((_, index) => Math.round((index === 0 ? 96 : 40) * scale))
  }
  if (model.panels.length === 1) return [narrow ? 200 : 236]
  return model.panels.map((_, index) => (index === 0 ? (narrow ? 176 : 204) : narrow ? 104 : 118))
}

function legendEntries(model: SeriesPanelsModel): LegendEntry[] {
  const entries: LegendEntry[] = model.panels.flatMap((panel) => [
    ...(panel.candles ? [{ label: "Nến giá", tone: "pos" as const, shape: "bar" as const }] : []),
    ...panel.series.map((series) => ({ label: series.name, tone: series.role, shape: "line" as const, dash: series.dash === true })),
    ...(panel.bars ? [{ label: panel.bars.name, tone: "p3" as const, shape: "bar" as const }] : []),
  ])
  return entries.filter((entry, index) => entries.findIndex((other) => other.label === entry.label) === index)
}

function fibPrice(fib: NonNullable<SeriesPanel["fib"]>, level: number): number {
  return fib.dir === "up" ? fib.hi.v - (fib.hi.v - fib.lo.v) * level : fib.lo.v + (fib.hi.v - fib.lo.v) * level
}

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 })

/**
 * K1: precomputed, windowed multi-panel series sharing one x axis. Every index in the model is an
 * absolute observation index; array position k is index `x.start + k`. Thumbnails (`axes: false`)
 * draw the data only. Full charts can be read by pointer and by keyboard (arrow keys, Home, End).
 */
export function SeriesPanelsChart({ model, label, autoLegend = true }: { model: SeriesPanelsModel; label: string; autoLegend?: boolean }) {
  const [measure, width] = useChartWidth()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [cursor, setCursor] = useState<number | null>(null)

  const thumbnail = model.axes === false
  const narrow = width < NARROW_CHART_WIDTH
  const n = windowSize(model)
  const hasTicks = !thumbnail && (model.x.ticks?.some(Boolean) ?? false)
  const shadeLabels = !thumbnail && (model.x.shade?.some((shade) => shade.label) ?? false)
  const x0 = thumbnail ? 2 : 6
  const x1 = width - (thumbnail ? 2 : narrow ? 42 : 52)
  const step = (x1 - x0) / n
  const x = (k: number) => x0 + (k + 0.5) * step
  const xi = (i: number) => x(i - model.x.start)
  const heights = panelHeights(model, narrow, thumbnail, width)
  // Shade labels sit in rows above the plot; a label that would print over its neighbour drops to the next row.
  const labelledShades = shadeLabels ? (model.x.shade ?? []).flatMap((shade) => (shade.label ? [{ ...shade, label: shade.label }] : [])) : []
  const shadeRows = stackRowLabels(
    labelledShades.map((shade) => ({
      text: shade.label,
      size: 10.5,
      center: (xi(shade.from) + xi(shade.to)) / 2,
      min: xi(shade.from) - step / 2,
      max: xi(shade.to) + step / 2,
    })),
    width,
  )
  const shadeRowCount = Math.max(0, ...shadeRows.map((row) => row.row + 1))
  const topPad = shadeRowCount ? 18 + (shadeRowCount - 1) * 14 : model.marks.length ? 16 : 0
  // An untitled panel keeps a small margin so its top tick label is not clipped.
  const titleRows = model.panels.map((panel) => (thumbnail ? 0 : panel.title ? 20 : 8))
  const panelGap = thumbnail ? 4 : 8
  const panelTops: number[] = []
  let cursorY = topPad
  heights.forEach((h, index) => {
    panelTops.push(cursorY)
    cursorY += titleRows[index] + h + (index < heights.length - 1 ? panelGap : 0)
  })
  const xAxisRow = 20
  const height = cursorY + (hasTicks ? xAxisRow : thumbnail ? 0 : 6)
  const legend = autoLegend && !thumbnail ? legendEntries(model) : []

  function moveTo(next: number) {
    setCursor(Math.max(0, Math.min(n - 1, next)))
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") return setCursor(null)
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") moveTo(0)
    else if (event.key === "End") moveTo(n - 1)
    else moveTo((cursor ?? (event.key === "ArrowRight" ? -1 : n)) + (event.key === "ArrowRight" ? 1 : -1))
  }
  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    const px = ((event.clientX - rect.left) * width) / rect.width
    moveTo(Math.floor((px - x0) / step))
  }

  const readout = cursor === null ? null : seriesPanelsReadout(model, cursor)
  const readoutText =
    readout && cursor !== null
      ? `${observationLabel(model, cursor)}: ${readout.map((row) => `${row.name} ${formatValue(row.value, row.digits)}`).join(", ")}`
      : ""
  const tooltipOnLeft = cursor !== null && x(cursor) > width * 0.55

  // x tick labels: centred on their observation but kept inside the drawing, then thinned so that none overlaps
  // its neighbour; the last tick always stays.
  const xTicks = hasTicks
    ? thinAxisLabels(
        (model.x.ticks ?? []).flatMap((text, k) => {
          if (!text) return []
          const half = textWidth(text, 10.5) / 2
          return [{ index: k, text, anchor: "middle" as const, at: Math.min(Math.max(x(k), half + 1), width - half - 1) }]
        }),
      )
    : []

  return (
    <div ref={measure} className="relative w-full min-w-0 space-y-2">
      {legend.length > 1 && <ChartLegendList entries={legend} />}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          role="img"
          aria-label={label}
          {...(thumbnail
            ? {}
            : {
                tabIndex: 0,
                "aria-describedby": `${uid}-hint`,
                onKeyDown,
                onBlur: () => setCursor(null),
                onPointerLeave: () => setCursor(null),
              })}
        >
          <title>{label}</title>
          {!thumbnail && (
            <desc id={`${uid}-hint`}>Dữ liệu minh họa. Dùng phím mũi tên trái, phải, Home và End hoặc trỏ vào hình để đọc các giá trị.</desc>
          )}
          {model.panels.map((panel, panelIndex) => {
            const top = panelTops[panelIndex] + titleRows[panelIndex]
            const bottom = top + heights[panelIndex]
            const [lo, hi] = panelRange(panel)
            const y = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top)
            const ticks = thumbnail ? [] : (panel.ticks ?? niceTicks(lo, hi, panelIndex === 0 ? 4 : 2))
            const digits = panel.digits ?? (Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi - lo) < 50 ? 1 : 0)
            const clip = `${uid}-clip-${panelIndex}`
            const candleWidth = Math.max(1, Math.min(14, step * 0.62))
            const barWidth = Math.max(1, Math.min(12, step * 0.7))
            const fill = panel.fill_between
            // The panel above the x axis closes with a baseline when its lowest grid line runs well above its bottom
            // edge (explicit bounds below the lowest tick), so the axis labels read as attached to the plot.
            const lowestGrid = Math.max(top, ...ticks.filter((tick) => tick >= lo && tick <= hi).map(y))
            const baseline = hasTicks && panelIndex === model.panels.length - 1 && bottom - lowestGrid > 16
            const labels = placePanelLabels({ model, panel, panelIndex, thumbnail, x, xi, y, x0, x1, top, bottom, candleWidth, barWidth })
            return (
              <g key={panelIndex}>
                <defs>
                  <clipPath id={clip}>
                    <rect x={x0} y={top - 2} width={x1 - x0} height={bottom - top + 4} />
                  </clipPath>
                </defs>
                {!thumbnail && panel.title && (
                  <text x={x0} y={top - 7} className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
                    {panel.title}
                  </text>
                )}
                {ticks.map((tick) =>
                  tick < lo || tick > hi ? null : (
                    <g key={tick}>
                      <line x1={x0} x2={x1} y1={y(tick)} y2={y(tick)} strokeWidth="0.8" className={GRID_STROKE} />
                      <text x={x1 + 6} y={y(tick) + 3.5} className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
                        {formatValue(tick, digits)}
                      </text>
                    </g>
                  ),
                )}
                {thumbnail && <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill="none" strokeWidth="0.8" className={GRID_STROKE} />}
                {baseline && <line x1={x0} x2={x1} y1={bottom} y2={bottom} strokeWidth="1" className={GRID_STROKE} />}
                <g clipPath={`url(#${clip})`}>
                  {model.x.shade?.map((shade, index) => (
                    <rect
                      key={index}
                      x={xi(shade.from) - step / 2}
                      y={top}
                      width={Math.max(1, xi(shade.to) - xi(shade.from) + step)}
                      height={bottom - top}
                      className={cn(TONE_FILL[shade.tone], "opacity-[0.1]")}
                    />
                  ))}
                  {panel.zones?.map((zone, index) => (
                    <rect
                      key={index}
                      x={x0}
                      y={y(Math.max(zone.from, zone.to))}
                      width={x1 - x0}
                      height={Math.abs(y(zone.from) - y(zone.to))}
                      className={cn(TONE_FILL[zone.tone], "opacity-[0.1]")}
                    />
                  ))}
                  {panel.zero && lo < 0 && hi > 0 && (
                    <line x1={x0} x2={x1} y1={y(0)} y2={y(0)} strokeWidth="1" className="stroke-chart-5" />
                  )}
                  {panel.band && (
                    <g>
                      <path
                        d={areaPath(panel.band.upper, panel.band.lower, x, y)}
                        className={cn(TONE_FILL[panel.band.tone ?? "p1"], "opacity-[0.12]")}
                      />
                      {/* The band edges (upper and lower Bollinger band) are lines of their own, not only a fill. */}
                      {[panel.band.upper, panel.band.lower].map((edge, index) => (
                        <path
                          key={index}
                          data-band-edge={index === 0 ? "upper" : "lower"}
                          d={linePath(edge, x, y)}
                          fill="none"
                          strokeWidth={thumbnail ? 1 : 1.3}
                          strokeLinejoin="round"
                          className={cn(TONE_STROKE[panel.band?.tone ?? "p1"], "opacity-80")}
                        />
                      ))}
                    </g>
                  )}
                  {fill && panel.series[fill.a] && panel.series[fill.b] && (
                    <>
                      <path
                        d={areaPath(panel.series[fill.a].values, panel.series[fill.b].values, x, y, (k) => {
                          const a = panel.series[fill.a].values[k]
                          const b = panel.series[fill.b].values[k]
                          return isNumber(a) && isNumber(b) && a >= b
                        })}
                        className={cn(TONE_FILL[fill.above], "opacity-[0.18]")}
                      />
                      <path
                        d={areaPath(panel.series[fill.a].values, panel.series[fill.b].values, x, y, (k) => {
                          const a = panel.series[fill.a].values[k]
                          const b = panel.series[fill.b].values[k]
                          return isNumber(a) && isNumber(b) && a < b
                        })}
                        className={cn(TONE_FILL[fill.below], "opacity-[0.18]")}
                      />
                    </>
                  )}
                  {panel.fib && (
                    <FibLevels fib={panel.fib} xi={xi} y={y} right={x1} />
                  )}
                  {panel.levels?.map((level, index) => (
                    <line
                      key={index}
                      x1={x0}
                      x2={x1}
                      y1={y(level.value)}
                      y2={y(level.value)}
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      className={TONE_STROKE[LEVEL_TONE[level.role]]}
                    />
                  ))}
                  {panel.bars?.values.map((value, k) => {
                    if (!isNumber(value)) return null
                    const tone = BAR_TONE[panel.bars?.colors[k] ?? "neutral"]
                    const base = lo > 0 ? lo : hi < 0 ? hi : 0
                    return (
                      <rect
                        key={k}
                        x={x(k) - barWidth / 2}
                        y={Math.min(y(base), y(value))}
                        width={barWidth}
                        height={Math.max(0.8, Math.abs(y(value) - y(base)))}
                        className={cn(TONE_FILL[tone], "opacity-75")}
                      />
                    )
                  })}
                  {panel.candles &&
                    panel.candles.close.map((close, k) => {
                      const candles = panel.candles
                      const open = candles?.open[k]
                      const high = candles?.high[k]
                      const low = candles?.low[k]
                      if (!isNumber(open) || !isNumber(close) || !isNumber(high) || !isNumber(low)) return null
                      const tone: ChartTone = close >= open ? "pos" : "neg"
                      return (
                        <g key={k}>
                          <line x1={x(k)} x2={x(k)} y1={y(high)} y2={y(low)} strokeWidth="1" className={TONE_STROKE[tone]} />
                          <rect
                            x={x(k) - candleWidth / 2}
                            y={y(Math.max(open, close))}
                            width={candleWidth}
                            height={Math.max(1, Math.abs(y(open) - y(close)))}
                            className={TONE_FILL[tone]}
                          />
                        </g>
                      )
                    })}
                  {panel.series.map((series, index) => (
                    <path
                      key={`${series.name}-${index}`}
                      d={linePath(series.values, x, y)}
                      fill="none"
                      strokeWidth={series.width ?? (series.role === "price" ? 1.6 : 1.5)}
                      strokeDasharray={series.dash ? DASH : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={TONE_STROKE[series.role]}
                    />
                  ))}
                  {panel.segments?.map((segment, index) => {
                    const [fi, fv] = segment.from
                    const [ti, tv] = segment.to
                    const slope = ti === fi ? 0 : (tv - fv) / (ti - fi)
                    const endI = ti + (segment.extend ?? 0)
                    const endV = tv + slope * (segment.extend ?? 0)
                    return (
                      <line
                        key={index}
                        x1={xi(fi)}
                        y1={y(fv)}
                        x2={xi(endI)}
                        y2={y(endV)}
                        strokeWidth="1.5"
                        strokeDasharray={segment.dash ? DASH : undefined}
                        className={TONE_STROKE[segment.tone]}
                      />
                    )
                  })}
                  {model.marks.map((mark) => (
                    <line
                      key={`${mark.label}-${mark.i}`}
                      x1={xi(mark.i)}
                      x2={xi(mark.i)}
                      y1={top}
                      y2={bottom}
                      strokeWidth="0.8"
                      strokeDasharray="3 4"
                      className="stroke-chart-5"
                    />
                  ))}
                  {cursor !== null &&
                    panel.series.map((series, index) =>
                      isNumber(series.values[cursor]) ? (
                        <circle
                          key={index}
                          cx={x(cursor)}
                          cy={y(series.values[cursor] as number)}
                          r="3.5"
                          strokeWidth="1"
                          className={cn(TONE_FILL[series.role], "stroke-card")}
                        />
                      ) : null,
                    )}
                </g>
                {(model.points ?? [])
                  .filter((point) => point.panel === panelIndex)
                  .map((point, index) => (
                    <PointMarker key={index} point={point} cx={xi(point.i)} cy={y(point.value)} />
                  ))}
                {labels.map((placed) => (
                  <text
                    key={placed.key}
                    data-annotation={placed.key}
                    x={placed.x}
                    y={placed.y}
                    textAnchor={placed.anchor}
                    className={placed.className}
                  >
                    {placed.lines.length === 1
                      ? placed.text
                      : placed.lines.map((line, index) => (
                          <tspan key={index} x={placed.x} dy={index === 0 ? 0 : placed.size * LINE_HEIGHT}>
                            {line}
                          </tspan>
                        ))}
                  </text>
                ))}
              </g>
            )
          })}
          {labelledShades.map((shade, index) => (
            <text
              key={index}
              x={shadeRows[index].x}
              y={12 + shadeRows[index].row * 14}
              textAnchor="middle"
              className={cn(textFill(shade.tone), "text-[10.5px] font-semibold")}
            >
              {shade.label}
            </text>
          ))}
          {model.marks.map((mark) => (
            <text
              key={`${mark.label}-${mark.i}`}
              x={xi(mark.i)}
              y={topPad - 4}
              textAnchor="middle"
              className="fill-chart-1 text-[11px] font-semibold"
            >
              {mark.label}
            </text>
          ))}
          {xTicks.map((tick) => (
            <text key={tick.index} x={tick.at} y={height - 5} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
              {tick.text}
            </text>
          ))}
          {cursor !== null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={topPad}
              y2={height - (hasTicks ? xAxisRow : 0)}
              strokeWidth="1"
              strokeDasharray="3 3"
              className="stroke-foreground"
            />
          )}
          {!thumbnail && (
            <rect
              x={x0}
              y={topPad}
              width={x1 - x0}
              height={Math.max(0, height - topPad - (hasTicks ? xAxisRow : 0))}
              className="fill-transparent"
              style={{ touchAction: "pan-y" }}
              onPointerMove={onPointerMove}
            />
          )}
        </svg>
        {readout && cursor !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-sm border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={tooltipOnLeft ? { right: Math.max(3, width - x(cursor) + 12) } : { left: Math.min(Math.max(0, width - 160), x(cursor) + 12) }}
          >
            <b className="mb-1 block">{observationLabel(model, cursor)}</b>
            {readout.map((row, index) => (
              <div key={`${row.name}-${index}`} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <strong className="tabular-nums">{formatValue(row.value, row.digits)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      {!thumbnail && (
        <p role="status" aria-live="polite" className="sr-only">
          {readoutText}
        </p>
      )}
    </div>
  )
}

type Point = NonNullable<SeriesPanelsModel["points"]>[number]

const pointRadius = (point: Point) => (point.shape === "ring" ? 5 : 3.5)

/** The marker of a point; its label is placed with the other annotations of the panel. */
function PointMarker({ point, cx, cy }: { point: Point; cx: number; cy: number }) {
  const ring = point.shape === "ring"
  return (
    <circle
      cx={cx}
      cy={cy}
      r={pointRadius(point)}
      strokeWidth={ring ? 1.8 : 1}
      className={ring ? cn(TONE_STROKE[point.tone], "fill-none") : cn(TONE_FILL[point.tone], "stroke-card")}
    />
  )
}

function FibLevels({
  fib,
  xi,
  y,
  right,
}: {
  fib: NonNullable<SeriesPanel["fib"]>
  xi: (i: number) => number
  y: (v: number) => number
  right: number
}) {
  const from = xi(Math.min(fib.lo.i, fib.hi.i))
  return (
    <g>
      {fib.zone && (
        <rect
          x={from}
          y={Math.min(y(fibPrice(fib, fib.zone[0])), y(fibPrice(fib, fib.zone[1])))}
          width={Math.max(0, right - from)}
          height={Math.abs(y(fibPrice(fib, fib.zone[0])) - y(fibPrice(fib, fib.zone[1])))}
          className="fill-chart-2 opacity-[0.14]"
        />
      )}
      {fib.levels.map((level) => {
        const ly = y(fibPrice(fib, level))
        return <line key={level} x1={from} x2={right} y1={ly} y2={ly} strokeWidth="0.9" strokeDasharray="3 3" className="stroke-chart-2" />
      })}
    </g>
  )
}

type PanelGeometry = {
  model: SeriesPanelsModel
  panel: SeriesPanel
  panelIndex: number
  thumbnail: boolean
  x: (k: number) => number
  xi: (i: number) => number
  y: (v: number) => number
  x0: number
  x1: number
  top: number
  bottom: number
  candleWidth: number
  barWidth: number
}

type PanelLabel = PlacedLabel & { className: string }

/* Placement weights: what a label box may cover, from worst to most tolerable. */
const MARKER_WEIGHT = 300
const PRICE_WEIGHT = 60
const SERIES_WEIGHT = 40
const CANDLE_WEIGHT = 40
const SEGMENT_WEIGHT = 30
const LEVEL_WEIGHT = 25
const BAR_WEIGHT = 20
const SOFT_WEIGHT = 10

/**
 * Text annotations of one panel (point labels, notes, level, zone and Fibonacci labels), placed so that they stay
 * inside the plot and clear the series, candles, bars, markers and each other. A label too wide for the plot wraps.
 */
function placePanelLabels(g: PanelGeometry): PanelLabel[] {
  const { model, panel, panelIndex, thumbnail, x, xi, y, x0, x1, top, bottom, candleWidth, barWidth } = g
  const points = (model.points ?? []).filter((point) => point.panel === panelIndex)
  const requests: (LabelRequest & { className: string })[] = []
  const plotWidth = x1 - x0
  /**
   * Candidate positions of a label: on one line first (wrapped only when wider than the plot), then, for a long
   * label, the same positions with the text split over two lines.
   */
  const variants = (text: string, size: number, positions: (lineCount: number) => Candidate[]): Candidate[] => {
    const width = annotationWidth(text, size)
    const first = width <= plotWidth - 8 ? [text] : wrapText(text, ((plotWidth - 8) * 0.56) / 0.6, size, 3)
    const candidates = positions(first.length).map((candidate) => ({ ...candidate, lines: first }))
    if (first.length === 1 && width > plotWidth * 0.4) {
      const halves = wrapText(text, (Math.ceil(text.length / 2) + 3) * size * 0.56, size, 2)
      if (halves.length === 2) candidates.push(...positions(2).map((candidate) => ({ ...candidate, lines: halves })))
    }
    return candidates
  }

  points.forEach((point, index) => {
    if (!point.label) return
    requests.push({
      key: `point-${index}`,
      text: point.label,
      size: 11,
      candidates: variants(point.label, 11, (lines) => aroundPoint(xi(point.i), y(point.value), pointRadius(point) + 5, 11, point.pos ?? "above", lines)),
      className: cn(textFill(point.tone), "text-[11px] font-semibold"),
    })
  })
  if (!thumbnail) {
    panel.notes?.forEach((note, index) => {
      requests.push({
        key: `note-${index}`,
        text: note.text,
        size: 11,
        candidates: variants(note.text, 11, (lines) => aroundPoint(xi(note.i), y(note.value), 6, 11, "above", lines)),
        className: cn(textFill(note.tone), "text-[11px] font-semibold"),
      })
    })
    panel.levels?.forEach((level, index) => {
      if (!level.label) return
      requests.push({
        key: `level-${index}`,
        owner: `level-${index}`,
        text: level.label,
        size: 10.5,
        candidates: variants(level.label, 10.5, (lines) => alongLine(y(level.value), x0, x1, 10.5, "start", lines)),
        className: cn(textFill(LEVEL_TONE[level.role]), "text-[10.5px]"),
      })
    })
    panel.zones?.forEach((zone, index) => {
      if (!zone.label) return
      const zoneTop = y(Math.max(zone.from, zone.to))
      const zoneBottom = y(Math.min(zone.from, zone.to))
      requests.push({
        key: `zone-${index}`,
        text: zone.label,
        size: 10.5,
        candidates: variants(zone.label, 10.5, (lines) => inZone(zoneTop, zoneBottom, x0, x1, 10.5, lines)),
        className: cn(textFill(zone.tone), "text-[10.5px]"),
      })
    })
    const fib = panel.fib
    if (fib) {
      const from = xi(Math.min(fib.lo.i, fib.hi.i))
      fib.levels.forEach((level) => {
        requests.push({
          key: `fib-${level}`,
          owner: `fib-${level}`,
          text: percent.format(level),
          size: 10.5,
          candidates: alongLine(y(fibPrice(fib, level)), from, x1, 10.5, "end"),
          className: "fill-chart-2 text-[10.5px] tabular-nums",
        })
      })
    }
  }
  if (requests.length === 0) return []

  const segments: Segment[] = []
  const obstacles: Obstacle[] = []
  const series = (values: readonly (number | null)[], weight: number) =>
    segments.push(...polylineSegments(values.map((value, k) => (isNumber(value) ? [x(k), y(value)] : null)), weight))
  for (const line of panel.series) series(line.values, line.role === "price" ? PRICE_WEIGHT : SERIES_WEIGHT)
  if (panel.band) {
    series(panel.band.upper, LEVEL_WEIGHT)
    series(panel.band.lower, LEVEL_WEIGHT)
  }
  const horizontal = (value: number, from: number, weight: number, owner?: string) =>
    segments.push({ x1: from, y1: y(value), x2: x1, y2: y(value), weight, owner })
  panel.levels?.forEach((level, index) => horizontal(level.value, x0, LEVEL_WEIGHT, `level-${index}`))
  if (panel.fib) {
    const fib = panel.fib
    const from = xi(Math.min(fib.lo.i, fib.hi.i))
    fib.levels.forEach((level) => horizontal(fibPrice(fib, level), from, LEVEL_WEIGHT, `fib-${level}`))
  }
  if (panel.zero) horizontal(0, x0, SOFT_WEIGHT)
  panel.segments?.forEach((segment) => {
    const [fi, fv] = segment.from
    const [ti, tv] = segment.to
    const slope = ti === fi ? 0 : (tv - fv) / (ti - fi)
    const extend = segment.extend ?? 0
    segments.push({ x1: xi(fi), y1: y(fv), x2: xi(ti + extend), y2: y(tv + slope * extend), weight: SEGMENT_WEIGHT })
  })
  for (const mark of model.marks) segments.push({ x1: xi(mark.i), y1: top, x2: xi(mark.i), y2: bottom, weight: SOFT_WEIGHT })
  const candles = panel.candles
  candles?.close.forEach((_, k) => {
    const high = candles.high[k]
    const low = candles.low[k]
    if (!isNumber(high) || !isNumber(low)) return
    obstacles.push({ box: { l: x(k) - candleWidth / 2, r: x(k) + candleWidth / 2, t: y(high), b: y(low) }, weight: CANDLE_WEIGHT })
  })
  if (panel.bars) {
    const [lo, hi] = panelRange(panel)
    const base = lo > 0 ? lo : hi < 0 ? hi : 0
    panel.bars.values.forEach((value, k) => {
      if (!isNumber(value)) return
      obstacles.push({
        box: { l: x(k) - barWidth / 2, r: x(k) + barWidth / 2, t: Math.min(y(base), y(value)), b: Math.max(y(base), y(value)) },
        weight: BAR_WEIGHT,
      })
    })
  }
  for (const point of points) {
    const r = pointRadius(point) + 1
    const cx = xi(point.i)
    const cy = y(point.value)
    obstacles.push({ box: { l: cx - r, r: cx + r, t: cy - r, b: cy + r }, weight: MARKER_WEIGHT })
  }

  const bounds: Box = { l: x0, r: x1, t: top, b: bottom }
  const placed = placeLabels(requests, { bounds, segments, obstacles })
  const classes = new Map(requests.map((request) => [request.key, request.className]))
  return placed.map((label) => ({ ...label, className: classes.get(label.key) ?? LABEL_FILL }))
}
