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
  windowSize,
  type SeriesPanel,
  type SeriesPanelsModel,
} from "./chart-math"
import { ChartLegendList, type LegendEntry } from "./chart-legend"
import { DASH, GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

const LEVEL_TONE: Record<NonNullable<SeriesPanel["levels"]>[number]["role"], ChartTone> = {
  buy: "pos",
  sell: "neg",
  neutral: "p3",
  avg: "p2",
}
const BAR_TONE = { pos: "pos", neg: "neg", neutral: "p3" } as const

function panelHeights(model: SeriesPanelsModel, narrow: boolean, thumbnail: boolean): number[] {
  if (thumbnail) return model.panels.map((_, index) => (index === 0 ? 96 : 40))
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
  const heights = panelHeights(model, narrow, thumbnail)
  const titleRow = thumbnail ? 0 : 20
  const topPad = shadeLabels ? 18 : model.marks.length ? 16 : 0
  const panelTops: number[] = []
  let cursorY = topPad
  for (const h of heights) {
    panelTops.push(cursorY)
    cursorY += h + titleRow + (thumbnail ? 4 : 8)
  }
  const height = cursorY + (hasTicks ? 18 : 0)
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

  // x tick labels: keep the non-empty ticks that do not collide with the previous one.
  const xTicks: { k: number; text: string }[] = []
  if (hasTicks) {
    let lastRight = -Infinity
    model.x.ticks?.forEach((text, k) => {
      if (!text) return
      const w = textWidth(text, 10.5)
      const left = Math.min(Math.max(x(k) - w / 2, 0), width - w)
      if (left < lastRight + 6) return
      xTicks.push({ k, text })
      lastRight = left + w
    })
  }

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
            const top = panelTops[panelIndex] + titleRow
            const bottom = top + heights[panelIndex]
            const [lo, hi] = panelRange(panel)
            const y = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top)
            const ticks = thumbnail ? [] : (panel.ticks ?? niceTicks(lo, hi, panelIndex === 0 ? 4 : 2))
            const digits = panel.digits ?? (Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi - lo) < 50 ? 1 : 0)
            const clip = `${uid}-clip-${panelIndex}`
            const candleWidth = Math.max(1, Math.min(10, step * 0.62))
            const barWidth = Math.max(1, Math.min(12, step * 0.7))
            const fill = panel.fill_between
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
                    <path
                      d={areaPath(panel.band.upper, panel.band.lower, x, y)}
                      className={cn(TONE_FILL[panel.band.tone ?? "p1"], "opacity-[0.12]")}
                    />
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
                {!thumbnail &&
                  panel.levels?.map((level, index) =>
                    level.label ? (
                      <text key={index} x={x0 + 4} y={y(level.value) - 4} className={cn(textFill(LEVEL_TONE[level.role]), "text-[10.5px]")}>
                        {level.label}
                      </text>
                    ) : null,
                  )}
                {!thumbnail &&
                  panel.zones?.map((zone, index) =>
                    zone.label ? (
                      <text key={index} x={x0 + 4} y={y(Math.max(zone.from, zone.to)) + 13} className={cn(textFill(zone.tone), "text-[10.5px]")}>
                        {zone.label}
                      </text>
                    ) : null,
                  )}
                {!thumbnail &&
                  panel.notes?.map((note, index) => {
                    const px = xi(note.i)
                    const anchor = px > x1 - 60 ? "end" : px < x0 + 60 ? "start" : "middle"
                    return (
                      <text
                        key={index}
                        x={px}
                        y={y(note.value) - 6}
                        textAnchor={anchor}
                        className={cn(textFill(note.tone), "text-[11px] font-semibold")}
                      >
                        {note.text}
                      </text>
                    )
                  })}
                {(model.points ?? [])
                  .filter((point) => point.panel === panelIndex)
                  .map((point, index) => (
                    <PointMark key={index} point={point} cx={xi(point.i)} cy={y(point.value)} left={x0} right={x1} />
                  ))}
              </g>
            )
          })}
          {shadeLabels &&
            model.x.shade?.map((shade, index) =>
              shade.label ? (
                <text
                  key={index}
                  x={(xi(shade.from) + xi(shade.to)) / 2}
                  y={12}
                  textAnchor="middle"
                  className={cn(textFill(shade.tone), "text-[10.5px] font-semibold")}
                >
                  {shade.label}
                </text>
              ) : null,
            )}
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
            <text key={tick.k} x={x(tick.k)} y={height - 5} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
              {tick.text}
            </text>
          ))}
          {cursor !== null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={topPad}
              y2={height - (hasTicks ? 18 : 0)}
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
              height={Math.max(0, height - topPad - (hasTicks ? 18 : 0))}
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

function PointMark({ point, cx, cy, left, right }: { point: Point; cx: number; cy: number; left: number; right: number }) {
  const ring = point.shape === "ring"
  const pos = point.pos ?? "above"
  const labelWidth = point.label ? textWidth(point.label) : 0
  let tx = cx
  let ty = cy - 9
  let anchor: "start" | "middle" | "end" = "middle"
  if (pos === "below") ty = cy + 16
  if (pos === "left") {
    tx = cx - 8
    ty = cy + 4
    anchor = "end"
  }
  if (pos === "right") {
    tx = cx + 8
    ty = cy + 4
    anchor = "start"
  }
  if (anchor === "middle") {
    if (cx - labelWidth / 2 < left) anchor = "start"
    else if (cx + labelWidth / 2 > right) anchor = "end"
  }
  if (anchor === "end" && tx - labelWidth < left) {
    anchor = "start"
    tx = cx + 8
  }
  if (anchor === "start" && tx + labelWidth > right) {
    anchor = "end"
    tx = cx - 8
  }
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={ring ? 5 : 3.5}
        strokeWidth={ring ? 1.8 : 1}
        className={ring ? cn(TONE_STROKE[point.tone], "fill-none") : cn(TONE_FILL[point.tone], "stroke-card")}
      />
      {point.label && (
        <text x={tx} y={ty} textAnchor={anchor} className={cn(textFill(point.tone), "text-[11px] font-semibold")}>
          {point.label}
        </text>
      )}
    </g>
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
        return (
          <g key={level}>
            <line x1={from} x2={right} y1={ly} y2={ly} strokeWidth="0.9" strokeDasharray="3 3" className="stroke-chart-2" />
            <text x={right - 3} y={ly - 3} textAnchor="end" className="fill-chart-2 text-[10.5px] tabular-nums">
              {percent.format(level)}
            </text>
          </g>
        )
      })}
    </g>
  )
}
