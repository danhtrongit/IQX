import { useId, useState, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"
import { BAR_FILL, ROLE_FILL, ROLE_STROKE } from "./chart-theme"
import {
  formatValue,
  isNumber,
  phienLabel,
  seriesPanelsPoints,
  seriesPanelsReadout,
  type SeriesPanel,
  type SeriesPanelsModel,
} from "./chart-math"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

const DASH = "5 4"

/** Path of a series with gaps: a missing value never joins its neighbours. */
function linePath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let path = ""
  let begun = false
  values.forEach((value, index) => {
    if (!isNumber(value)) {
      begun = false
      return
    }
    path += `${begun ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`
    begun = true
  })
  return path
}

/** Points that have no visible neighbour would vanish from a path: they are drawn as dots. */
function isolatedPoints(values: readonly (number | null)[]): number[] {
  return values.flatMap((value, index) =>
    isNumber(value) && !isNumber(values[index - 1]) && !isNumber(values[index + 1]) ? [index] : [],
  )
}

function bandPath(panel: SeriesPanel, x: (i: number) => number, y: (v: number) => number): string {
  const band = panel.band
  if (!band) return ""
  let path = ""
  let start = -1
  const flush = (end: number) => {
    if (start < 0) return
    let upper = ""
    let lower = ""
    for (let i = start; i <= end; i += 1) upper += `${i === start ? "M" : "L"}${x(i).toFixed(2)},${y(band.upper[i] as number).toFixed(2)}`
    for (let i = end; i >= start; i -= 1) lower += `L${x(i).toFixed(2)},${y(band.lower[i] as number).toFixed(2)}`
    path += `${upper}${lower}Z`
    start = -1
  }
  band.upper.forEach((upper, index) => {
    if (isNumber(upper) && isNumber(band.lower[index])) {
      if (start < 0) start = index
    } else flush(index - 1)
  })
  flush(band.upper.length - 1)
  return path
}

function panelRange(panel: SeriesPanel): [number, number] {
  const values = [
    ...panel.series.flatMap((series) => series.values.filter(isNumber)),
    ...(panel.bars ? [...panel.bars.values.filter(isNumber), 0] : []),
    ...(panel.zero ? [0] : []),
    ...(panel.band ? [...panel.band.upper, ...panel.band.lower].filter(isNumber) : []),
  ]
  let lo = panel.bounds?.[0] ?? Math.min(...values)
  let hi = panel.bounds?.[1] ?? Math.max(...values)
  if (!panel.bounds) {
    const span = Math.max(hi - lo, 1e-5)
    lo -= span * 0.12
    hi += span * 0.12
    if (panel.nonnegative) lo = 0
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [0, 1]
  return [lo, hi]
}

export function ChartLegend({ model }: { model: SeriesPanelsModel }) {
  const entries = model.panels.flatMap((panel) => [
    ...panel.series.map((series) => ({ name: series.name, kind: "line" as const, role: series.role, dash: series.dash === true })),
    ...(panel.bars ? [{ name: panel.bars.name, kind: "bar" as const, role: "price" as const, dash: false }] : []),
  ])
  const unique = entries.filter((entry, index) => entries.findIndex((other) => other.name === entry.name) === index)
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground" aria-label="Chú giải">
      {unique.map((entry) => (
        <li key={entry.name} className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true" className="shrink-0">
            {entry.kind === "line" ? (
              <line x1="0" x2="22" y1="4" y2="4" strokeWidth="2" strokeDasharray={entry.dash ? DASH : undefined} className={ROLE_STROKE[entry.role]} />
            ) : (
              <rect x="6" y="0" width="10" height="8" className="fill-muted-foreground opacity-70" />
            )}
          </svg>
          {entry.name}
        </li>
      ))}
    </ul>
  )
}

/**
 * Chapter 1 chart: pre-computed, windowed multi-panel series sharing one x axis (the session
 * index), every panel with its own unit and axis. Gaps stay gaps, dashes and A/B marks follow the
 * model, and the reading is reachable by pointer and by keyboard (← → Home End).
 */
export function SeriesPanelsChart({ model, label, legend = true }: { model: SeriesPanelsModel; label: string; legend?: boolean }) {
  const [measure, width] = useChartWidth()
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "")
  const [cursor, setCursor] = useState<number | null>(null)

  const narrow = width < NARROW_CHART_WIDTH
  const points = seriesPanelsPoints(model)
  const span = Math.max(points - 1, 1)
  const x0 = 10
  const x1 = width - (narrow ? 46 : 56)
  const panelHeight = narrow ? 172 : 192
  const height = model.panels.length * panelHeight + 28
  const x = (index: number) => x0 + (index / span) * (x1 - x0)
  const marks = model.marks.map((mark) => ({ ...mark, index: mark.i - model.x.start })).filter((mark) => mark.index >= 0 && mark.index < points)

  const tickCount = narrow ? 3 : points <= 6 ? points : 5
  const tickIndexes = Array.from({ length: Math.min(tickCount, points) }, (_, j) => Math.round((span * j) / Math.max(Math.min(tickCount, points) - 1, 1)))

  function moveTo(next: number) {
    setCursor(Math.max(0, Math.min(points - 1, next)))
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") {
      setCursor(null)
      return
    }
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") moveTo(0)
    else if (event.key === "End") moveTo(points - 1)
    else moveTo((cursor ?? (event.key === "ArrowRight" ? -1 : points)) + (event.key === "ArrowRight" ? 1 : -1))
  }
  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    const px = ((event.clientX - rect.left) * width) / rect.width
    moveTo(Math.round(((px - x0) / (x1 - x0)) * span))
  }

  const readout = cursor === null ? null : seriesPanelsReadout(model, cursor)
  const tooltipOnLeft = cursor !== null && x(cursor) > width * 0.55

  return (
    <div ref={measure} className="relative w-full min-w-0 space-y-2">
      {legend && <ChartLegend model={model} />}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          role="img"
          tabIndex={0}
          aria-label={label}
          aria-describedby={`${uid}-hint`}
          onKeyDown={onKeyDown}
          onBlur={() => setCursor(null)}
          onPointerLeave={() => setCursor(null)}
        >
          <title>{label}</title>
          <desc id={`${uid}-hint`}>Dữ liệu minh họa. Dùng phím mũi tên trái, phải, Home và End hoặc trỏ vào hình để đọc các giá trị.</desc>
          {model.panels.map((panel, panelIndex) => {
            const top = panelIndex * panelHeight + 30
            const bottom = (panelIndex + 1) * panelHeight - 22
            const [lo, hi] = panelRange(panel)
            const y = (value: number) => bottom - ((value - lo) / (hi - lo)) * (bottom - top)
            const ticks = panel.ticks ?? (panel.zero && lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, (lo + hi) / 2, hi])
            const sell = panel.levels?.find((level) => level.role === "sell")
            const buy = panel.levels?.find((level) => level.role === "buy")
            const clip = `${uid}-clip-${panelIndex}`
            const band = bandPath(panel, x, y)
            const barWidth = Math.min(18, ((x1 - x0) / Math.max(points, 1)) * 0.64)
            return (
              <g key={`${panel.title}-${panelIndex}`}>
                <defs>
                  <clipPath id={clip}>
                    <rect x={x0 - 5} y={top - 7} width={x1 - x0 + 10} height={bottom - top + 14} />
                  </clipPath>
                </defs>
                <text x={x0} y={panelIndex * panelHeight + 15} className="fill-muted-foreground text-[10.5px]">
                  {panel.title}
                </text>
                {ticks.map((tick) => {
                  const level = panel.levels?.find((entry) => entry.value === tick)
                  const tone = level ? (level.role === "sell" ? "stroke-price-down" : "stroke-price-up") : "stroke-border"
                  const textTone = level ? (level.role === "sell" ? "fill-price-down" : "fill-price-up") : "fill-muted-foreground"
                  return (
                    <g key={tick}>
                      <line x1={x0} x2={x1} y1={y(tick)} y2={y(tick)} strokeWidth="0.8" strokeDasharray={level ? "4 4" : undefined} className={tone} />
                      <text x={x1 + 7} y={y(tick) + 3} className={cn("text-[10px]", textTone)}>
                        {formatValue(tick, panel.digits ?? 1)}
                      </text>
                    </g>
                  )
                })}
                {panel.zero && lo < 0 && hi > 0 && (
                  <line x1={x0} x2={x1} y1={y(0)} y2={y(0)} strokeWidth="0.8" strokeDasharray="4 4" className="stroke-muted-foreground" />
                )}
                <g clipPath={`url(#${clip})`}>
                  {band && <path d={band} className="fill-chart-1 opacity-[0.08]" />}
                  {sell && <rect x={x0} y={y(hi)} width={x1 - x0} height={Math.max(0, y(sell.value) - y(hi))} className="fill-price-down opacity-[0.06]" />}
                  {buy && <rect x={x0} y={y(buy.value)} width={x1 - x0} height={Math.max(0, y(lo) - y(buy.value))} className="fill-price-up opacity-[0.06]" />}
                  {panel.bars?.values.map((value, index) => {
                    if (!isNumber(value)) return null
                    const tone = panel.bars?.colors[index] ?? (value >= 0 ? "pos" : "neg")
                    return (
                      <rect
                        key={index}
                        x={x(index) - barWidth / 2}
                        y={Math.min(y(0), y(value))}
                        width={barWidth}
                        height={Math.max(0.8, Math.abs(y(value) - y(0)))}
                        className={cn(BAR_FILL[tone], "opacity-70")}
                      />
                    )
                  })}
                  {panel.series.map((series) => (
                    <g key={series.name}>
                      <path
                        d={linePath(series.values, x, y)}
                        fill="none"
                        strokeWidth={series.role === "price" ? 1.6 : 1.9}
                        strokeDasharray={series.dash ? DASH : undefined}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={ROLE_STROKE[series.role]}
                      />
                      {isolatedPoints(series.values).map((index) => (
                        <circle key={index} cx={x(index)} cy={y(series.values[index] as number)} r="2.2" className={ROLE_FILL[series.role]} />
                      ))}
                    </g>
                  ))}
                  {marks.map((mark) => (
                    <g key={`${mark.label}-${mark.i}`}>
                      <line x1={x(mark.index)} x2={x(mark.index)} y1={top - 2} y2={bottom} strokeWidth="0.8" strokeDasharray="3 4" className="stroke-muted-foreground" />
                      {panel.series.map((series) =>
                        isNumber(series.values[mark.index]) ? (
                          <circle key={series.name} cx={x(mark.index)} cy={y(series.values[mark.index] as number)} r="3" strokeWidth="1" className={cn(ROLE_FILL[series.role], "stroke-card")} />
                        ) : null,
                      )}
                    </g>
                  ))}
                  {cursor !== null &&
                    panel.series.map((series) =>
                      isNumber(series.values[cursor]) ? (
                        <circle key={series.name} cx={x(cursor)} cy={y(series.values[cursor] as number)} r="3.5" strokeWidth="1" className={cn(ROLE_FILL[series.role], "stroke-card")} />
                      ) : null,
                    )}
                </g>
                {panelIndex === 0 &&
                  marks.map((mark) => (
                    <text key={`${mark.label}-${mark.i}`} x={x(mark.index)} y={top - 9} textAnchor="middle" className="fill-chart-1 text-[11px] font-semibold">
                      {mark.label}
                    </text>
                  ))}
              </g>
            )
          })}
          {tickIndexes.map((index, j) => (
            <text
              key={index}
              x={x(index)}
              y={height - 8}
              textAnchor={j === 0 ? "start" : j === tickIndexes.length - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[10px]"
            >
              {phienLabel(model, index)}
            </text>
          ))}
          {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={26} y2={height - 26} strokeWidth="1" strokeDasharray="3 3" className="stroke-foreground" />}
          <rect
            x={x0 - 4}
            y={26}
            width={x1 - x0 + 8}
            height={height - 56}
            className="fill-transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={onPointerMove}
          />
        </svg>
        {readout && cursor !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-8 z-10 min-w-36 rounded-sm border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={tooltipOnLeft ? { right: Math.max(3, width - x(cursor) + 12) } : { left: Math.min(width - 150, x(cursor) + 12) }}
          >
            <b className="mb-1 block">{phienLabel(model, cursor)}</b>
            {readout.map((row) => (
              <div key={row.name} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <strong className="tabular-nums">{formatValue(row.value, 2)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {readout && cursor !== null
          ? `${phienLabel(model, cursor)}: ${readout.map((row) => `${row.name} ${formatValue(row.value, 2)}`).join(", ")}`
          : ""}
      </p>
      {marks.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
          {marks.map((mark) => (
            <p key={`${mark.label}-${mark.i}`}>
              <b className="text-foreground">{mark.label}</b>
              {" · "}
              {seriesPanelsReadout(model, mark.index)
                .map((row) => `${row.name}: ${formatValue(row.value, 2)}`)
                .join(" · ")}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
