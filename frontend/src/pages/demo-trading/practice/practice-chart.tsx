import { memo, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"
import {
  REFERENCE_STROKE,
  THRESHOLD_STROKE,
  computeLayout,
  indexAtX,
  windowIndices,
  type ChartLayout,
} from "./chart-geometry"
import type { PracticeChart, PracticeEvent, Side } from "./practice-api"
import { formatDec, formatInt, sessionLabel } from "./practice-model"
import { useElementWidth } from "./use-element-width"

const noopMarker = () => undefined

type BodyProps = {
  layout: ChartLayout
  paneTitle: string
  onMarker: (ordinal: number, session: number) => void
}

/**
 * Static part of the chart (grid, candles, indicator pane, markers). Memoised on the layout object,
 * so a pointer move (crosshair/tooltip) never rebuilds it; only a new window/side/width does.
 */
const ChartBody = memo(function ChartBody({ layout, paneTitle, onMarker }: BodyProps) {
  const { x0, x1, indTop } = layout
  const textClass = "fill-muted-foreground text-[10px]"
  return (
    <g>
      <g data-testid="chart-pane-price" data-pane="price">
        <text x={x0} y={13} className={textClass}>
          GIÁ (ĐỒNG)
        </text>
        {layout.priceTicks.map((tick, index) => (
          <g key={`${index}-${tick.label}`}>
            <line x1={x0} x2={x1} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={0.7} />
            <text x={x1 + 5} y={tick.y + 3} className={textClass}>
              {tick.label}
            </text>
          </g>
        ))}
        <g>
          {layout.candles.map((candle, index) => (
            <g key={index} className={candle.up ? "text-price-up" : "text-price-down"}>
              <line x1={candle.x} x2={candle.x} y1={candle.high} y2={candle.low} stroke="currentColor" strokeWidth={1} />
              <rect x={candle.x - layout.bodyWidth / 2} y={candle.bodyTop} width={layout.bodyWidth} height={candle.bodyHeight} fill="currentColor" />
            </g>
          ))}
        </g>
        {layout.priceLines.map((line) => (
          <path
            key={line.key}
            data-series={line.key}
            d={line.d}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray={line.dash ?? undefined}
            style={{ stroke: line.color }}
          />
        ))}
        {layout.markers.map((marker) => {
          const buy = marker.side === "buy"
          const label = `${buy ? "M" : "B"}${marker.ordinal}`
          return (
            <g
              key={`${marker.side}-${marker.ordinal}`}
              role="button"
              tabIndex={0}
              aria-label={`Giao dịch ${marker.ordinal}: ${buy ? "Mua" : "Bán"} tại ${sessionLabel(marker.session)}`}
              data-marker={`${marker.side}-${marker.ordinal}`}
              className={cn("cursor-pointer outline-none focus-visible:[&>path]:stroke-foreground", buy ? "text-price-up" : "text-price-down")}
              onClick={() => onMarker(marker.ordinal, marker.session)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onMarker(marker.ordinal, marker.session)
              }}
            >
              <path
                d={buy ? `M${marker.x - 5},${marker.y + 4}L${marker.x},${marker.y - 3}L${marker.x + 5},${marker.y + 4}Z` : `M${marker.x - 5},${marker.y - 4}L${marker.x},${marker.y + 3}L${marker.x + 5},${marker.y - 4}Z`}
                fill="currentColor"
                stroke="transparent"
                strokeWidth={1.5}
              />
              <text x={marker.x} y={buy ? marker.y + 15 : marker.y - 7} textAnchor="middle" fill="currentColor" className="text-[9px] font-bold">
                {label}
              </text>
            </g>
          )
        })}
      </g>
      {layout.hasIndicatorPane && (
        <g data-testid="chart-pane-indicator" data-pane="indicator">
          <line x1={x0} x2={x1} y1={indTop - 24} y2={indTop - 24} className="stroke-border" />
          <text x={x0} y={indTop - 11} className={textClass}>
            {paneTitle}
          </text>
          {layout.indTicks.map((tick, index) => (
            <g key={`${index}-${tick.label}`}>
              <line x1={x0} x2={x1} y1={tick.y} y2={tick.y} className="stroke-border" strokeWidth={0.7} />
              <text x={x1 + 5} y={tick.y + 3} className={textClass}>
                {tick.label}
              </text>
            </g>
          ))}
          {layout.levels.map((level) => (
            <g key={`${level.kind}-${level.label}`} data-level={level.kind}>
              <line
                x1={x0}
                x2={x1}
                y1={level.y}
                y2={level.y}
                strokeWidth={level.kind === "threshold" ? 1 : 0.8}
                strokeDasharray={level.kind === "threshold" ? "5 3" : level.kind === "reference" ? "1.5 3" : undefined}
                style={{ stroke: level.kind === "threshold" ? THRESHOLD_STROKE : REFERENCE_STROKE }}
                opacity={level.kind === "zero" ? 0.7 : 1}
              />
              {level.kind !== "zero" && (
                <text
                  x={level.kind === "threshold" ? x1 - 3 : x0 + 3}
                  y={level.y - 3}
                  textAnchor={level.kind === "threshold" ? "end" : "start"}
                  className="text-[9px]"
                  style={{ fill: level.kind === "threshold" ? THRESHOLD_STROKE : REFERENCE_STROKE }}
                >
                  {level.label}
                </text>
              )}
            </g>
          ))}
          <g>
            {layout.indBars.map((bar, index) => (
              <rect
                key={index}
                x={bar.x - layout.bodyWidth / 2}
                y={bar.y}
                width={layout.bodyWidth}
                height={bar.height}
                data-bar={layout.indBarKind}
                className={bar.positive ? "fill-price-up/55" : "fill-price-down/55"}
              />
            ))}
          </g>
          {layout.indLines.map((line) => (
            <path
              key={line.key}
              data-series={line.key}
              d={line.d}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray={line.dash ?? undefined}
              style={{ stroke: line.color }}
            />
          ))}
        </g>
      )}
      {layout.xTicks.map((tick, index) => (
        <text key={index} x={tick.x} y={layout.height - 8} textAnchor={tick.anchor} className={textClass} data-axis="session">
          {tick.label}
        </text>
      ))}
    </g>
  )
})

export type PracticeChartViewProps = {
  chart: PracticeChart
  side: Side
  /** Last session shown (0 before the run starts). Later bars are never drawn nor used for scales. */
  revealed: number
  windowBars: number
  /** Session the window ends at when the viewer paged back; null follows the revealed edge. */
  panEnd: number | null
  events: readonly PracticeEvent[]
  paneTitle: string
  onMarkerSelect?: (tradeOrdinal: number, session: number) => void
  className?: string
}

type TooltipRow = { name: string; value: string }

function tooltipRows(chart: PracticeChart, side: Side, index: number): TooltipRow[] {
  const price = (key: "open" | "high" | "low" | "close") => formatInt(chart.bars[key][index])
  const rows: TooltipRow[] = [
    { name: "Mở cửa", value: price("open") },
    { name: "Cao nhất", value: price("high") },
    { name: "Thấp nhất", value: price("low") },
    { name: "Đóng cửa", value: price("close") },
  ]
  const plot = chart.plot[side]
  for (const line of plot.lines) rows.push({ name: line.label, value: formatDec(chart.series[side][line.key]?.[index]) })
  if (plot.histogram_key) rows.push({ name: "Histogram", value: formatDec(chart.series[side][plot.histogram_key]?.[index]) })
  if (plot.volume_key) rows.push({ name: "Khối lượng", value: formatInt(chart.series[side][plot.volume_key]?.[index] ?? chart.bars.volume[index]) })
  return rows
}

export function PracticeChartView({ chart, side, revealed, windowBars, panEnd, events, paneTitle, onMarkerSelect, className }: PracticeChartViewProps) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const window = windowIndices({
    firstSession: chart.first_session,
    revealed,
    windowBars,
    panEnd,
    barCount: chart.bars.close.length,
  })
  const visibleEvents = useMemo(() => events.filter((event) => event.session <= revealed), [events, revealed])
  const layout = useMemo(
    () => computeLayout({ chart, side, start: window.start, end: window.end, width, events: visibleEvents }),
    [chart, side, window.start, window.end, width, visibleEvents],
  )
  // `onMarkerSelect` must be stable (useCallback) or the memoised body repaints on every render.
  const onMarker = onMarkerSelect ?? noopMarker

  const hoverIndex = hover !== null && hover >= layout.start && hover <= layout.end ? hover : null
  const hoverX = hoverIndex === null ? 0 : layout.x0 + ((hoverIndex - layout.start + 0.5) / (layout.end - layout.start + 1)) * (layout.x1 - layout.x0)
  const rows = useMemo(() => (hoverIndex === null ? [] : tooltipRows(chart, side, hoverIndex)), [chart, side, hoverIndex])
  const hoverSession = hoverIndex === null ? null : chart.first_session + hoverIndex

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    setHover(indexAtX(layout, ((event.clientX - rect.left) / rect.width) * layout.width))
  }
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const from = hoverIndex ?? layout.end
    setHover(Math.min(layout.end, Math.max(layout.start, from + (event.key === "ArrowRight" ? 1 : -1))))
  }
  const tooltipLeft = hoverIndex === null ? 0 : Math.max(4, Math.min((hoverX / layout.width) * width + 12, width - 190))

  return (
    <div ref={boxRef} className={cn("relative", className)} data-testid="practice-chart">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        tabIndex={0}
        aria-label={`Biểu đồ nến và chỉ báo ${paneTitle}. Dùng mũi tên trái phải để xem từng phiên.`}
        className="block h-auto w-full touch-pan-y rounded-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHover(null)
        }}
        onKeyDown={onKeyDown}
      >
        <ChartBody layout={layout} paneTitle={paneTitle} onMarker={onMarker} />
        {hoverIndex !== null && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={20}
            y2={layout.hasIndicatorPane ? layout.indBottom : layout.priceBottom}
            className="stroke-muted-foreground"
            strokeWidth={0.7}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}
      </svg>
      {hoverIndex !== null && hoverSession !== null && (
        <div
          data-testid="practice-chart-tooltip"
          className="pointer-events-none absolute top-6 z-10 min-w-40 max-w-60 rounded-md border border-border bg-popover px-3 py-2 text-[11px] text-popover-foreground shadow-md"
          style={{ left: tooltipLeft }}
        >
          <strong className="mb-1 block text-xs">{sessionLabel(hoverSession)}</strong>
          {rows.map((row) => (
            <div key={row.name} className="flex justify-between gap-4 tabular-nums">
              <span className="text-muted-foreground">{row.name}</span>
              <b className="font-semibold">{row.value}</b>
            </div>
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {hoverSession === null ? "" : `${sessionLabel(hoverSession)}: ${rows.map((row) => `${row.name} ${row.value}`).join(", ")}`}
      </span>
    </div>
  )
}
