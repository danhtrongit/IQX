import { useId, useState, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"
import { CATEGORY_DASH, CATEGORY_FILL, CATEGORY_STROKE } from "./chart-theme"
import { formatCompact, isNumber, niceTicks, wrapLabel, type CategoryModel } from "./chart-math"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

const LEFT = 46
const RIGHT = 12
const TOP = 22

function stackTotals(model: CategoryModel): number[] {
  return model.labels.map((_, index) => model.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0))
}

function valueRange(model: CategoryModel): [number, number] {
  const values =
    model.kind === "stacked"
      ? stackTotals(model)
      : model.series.flatMap((series) => series.values.filter(isNumber))
  let lo = Math.min(0, ...values)
  let hi = Math.max(0, ...values)
  if (hi === lo) hi = lo + 1
  const ticks = niceTicks(lo, hi, 4)
  if (ticks.length >= 2) {
    lo = Math.min(lo, ticks[0])
    hi = Math.max(hi, ticks[ticks.length - 1])
  }
  // Headroom for the value labels above the tallest bar.
  return [lo, hi + (hi - lo) * 0.08]
}

function SeriesKey({ model }: { model: CategoryModel }) {
  if (model.series.length < 2) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground" aria-label="Chú giải">
      {model.series.map((series, index) => (
        <li key={series.name} className="inline-flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true" className="shrink-0">
            {model.kind === "line" ? (
              <>
                <line x1="0" x2="22" y1="5" y2="5" strokeWidth="2" strokeDasharray={CATEGORY_DASH[index % CATEGORY_DASH.length]} className={CATEGORY_STROKE[index % CATEGORY_STROKE.length]} />
                <circle cx="11" cy="5" r="3" className={CATEGORY_FILL[index % CATEGORY_FILL.length]} />
              </>
            ) : (
              <rect x="4" y="0" width="14" height="10" className={CATEGORY_FILL[index % CATEGORY_FILL.length]} />
            )}
          </svg>
          {series.name}
        </li>
      ))}
    </ul>
  )
}

/**
 * Chapter 3 category charts: `grouped` bars, `line` and `stacked` bars of one unit, drawn from the
 * model with a zero baseline, value labels, gaps for missing values and a keyboard-readable cursor.
 */
export function CategoryChart({ model, label }: { model: CategoryModel; label: string }) {
  const [measure, width] = useChartWidth()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [cursor, setCursor] = useState<number | null>(null)

  const narrow = width < NARROW_CHART_WIDTH
  const count = model.labels.length
  const labelLines = model.labels.map((text) => wrapLabel(text, narrow ? 9 : 14, 2))
  const bottomPad = 12 + Math.max(...labelLines.map((lines) => lines.length), 1) * 13
  const plotHeight = narrow ? 170 : 190
  const height = TOP + plotHeight + bottomPad
  const bottom = TOP + plotHeight
  const [lo, hi] = valueRange(model)
  const y = (value: number) => bottom - ((value - lo) / (hi - lo)) * plotHeight
  const groupWidth = (width - LEFT - RIGHT) / count
  const center = (index: number) => LEFT + (index + 0.5) * groupWidth
  const ticks = niceTicks(lo, hi, narrow ? 3 : 4)
  const seriesCount = model.series.length
  const barWidth = model.kind === "stacked" ? Math.min(64, groupWidth * 0.5) : Math.min(40, (groupWidth * 0.72) / seriesCount)

  function moveTo(next: number) {
    setCursor(Math.max(0, Math.min(count - 1, next)))
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") {
      setCursor(null)
      return
    }
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") moveTo(0)
    else if (event.key === "End") moveTo(count - 1)
    else moveTo((cursor ?? (event.key === "ArrowRight" ? -1 : count)) + (event.key === "ArrowRight" ? 1 : -1))
  }
  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    const px = ((event.clientX - rect.left) * width) / rect.width
    moveTo(Math.floor((px - LEFT) / groupWidth))
  }

  const totals = model.kind === "stacked" ? stackTotals(model) : []
  const unitLine = model.unit ? `Đơn vị: ${model.unit}` : ""
  const readout =
    cursor === null
      ? null
      : [
          ...model.series.map((series) => ({ name: series.name, value: formatCompact(series.values[cursor]) })),
          ...(model.kind === "stacked" ? [{ name: "Tổng", value: formatCompact(totals[cursor]) }] : []),
        ]
  const tooltipOnLeft = cursor !== null && center(cursor) > width * 0.55

  return (
    <div ref={measure} className="relative w-full min-w-0 space-y-2">
      <SeriesKey model={model} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          role="img"
          tabIndex={0}
          aria-label={`${label}${unitLine ? `. ${unitLine}` : ""}`}
          aria-describedby={`${uid}-hint`}
          onKeyDown={onKeyDown}
          onBlur={() => setCursor(null)}
          onPointerLeave={() => setCursor(null)}
        >
          <title>{label}</title>
          <desc id={`${uid}-hint`}>Dùng phím mũi tên trái, phải, Home và End hoặc trỏ vào hình để đọc từng kỳ.</desc>
          {unitLine && (
            <text x={LEFT} y={12} className="fill-muted-foreground text-[10px]">
              {unitLine}
            </text>
          )}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} strokeWidth={tick === 0 ? 1.2 : 0.8} className={tick === 0 ? "stroke-muted-foreground" : "stroke-border"} />
              <text x={LEFT - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {formatCompact(tick)}
              </text>
            </g>
          ))}
          {cursor !== null && (
            <rect x={LEFT + cursor * groupWidth} y={TOP - 4} width={groupWidth} height={plotHeight + 4} className="fill-muted opacity-60" />
          )}
          {model.kind === "grouped" &&
            model.labels.map((_, index) =>
              model.series.map((series, seriesIndex) => {
                const value = series.values[index]
                if (!isNumber(value)) return null
                const left = center(index) - (barWidth * seriesCount) / 2 + seriesIndex * barWidth
                const top = Math.min(y(value), y(0))
                return (
                  <g key={`${index}-${series.name}`}>
                    <rect x={left + 1} y={top} width={Math.max(barWidth - 2, 2)} height={Math.max(Math.abs(y(value) - y(0)), 1)} rx="1.5" className={CATEGORY_FILL[seriesIndex % CATEGORY_FILL.length]} />
                    <text x={left + barWidth / 2} y={value >= 0 ? top - 4 : top + Math.abs(y(value) - y(0)) + 11} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                      {formatCompact(value)}
                    </text>
                  </g>
                )
              }),
            )}
          {model.kind === "stacked" &&
            model.labels.map((_, index) => {
              let acc = 0
              return (
                <g key={index}>
                  {model.series.map((series, seriesIndex) => {
                    const value = series.values[index] ?? 0
                    const from = acc
                    acc += value
                    const rectHeight = Math.abs(y(from) - y(acc))
                    return (
                      <g key={series.name}>
                        <rect x={center(index) - barWidth / 2} y={y(acc)} width={barWidth} height={Math.max(rectHeight, 0)} className={cn(CATEGORY_FILL[seriesIndex % CATEGORY_FILL.length], "stroke-card")} strokeWidth="1" />
                        {rectHeight > 15 && (
                          <text x={center(index)} y={y(from) - rectHeight / 2 + 3.5} textAnchor="middle" strokeWidth="3" style={{ paintOrder: "stroke" }} className="fill-foreground stroke-card text-[10px] font-semibold tabular-nums">
                            {formatCompact(value)}
                          </text>
                        )}
                      </g>
                    )
                  })}
                  <text x={center(index)} y={y(acc) - 5} textAnchor="middle" className="fill-foreground text-[10.5px] font-semibold tabular-nums">
                    {formatCompact(acc)}
                  </text>
                </g>
              )
            })}
          {model.kind === "line" &&
            model.series.map((series, seriesIndex) => {
              let path = ""
              let begun = false
              series.values.forEach((value, index) => {
                if (!isNumber(value)) {
                  begun = false
                  return
                }
                path += `${begun ? "L" : "M"}${center(index).toFixed(2)},${y(value).toFixed(2)}`
                begun = true
              })
              const tone = seriesIndex % CATEGORY_STROKE.length
              return (
                <g key={series.name}>
                  <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CATEGORY_DASH[tone]} className={CATEGORY_STROKE[tone]} />
                  {series.values.map((value, index) =>
                    isNumber(value) ? (
                      <g key={index}>
                        <circle cx={center(index)} cy={y(value)} r="3.5" className={cn(CATEGORY_FILL[tone], "stroke-card")} strokeWidth="1" />
                        <text x={center(index)} y={seriesIndex % 2 === 0 ? y(value) - 8 : y(value) + 15} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                          {formatCompact(value)}
                        </text>
                      </g>
                    ) : null,
                  )}
                </g>
              )
            })}
          {model.labels.map((_, index) => (
            <text key={index} x={center(index)} y={bottom + 15} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
              {labelLines[index].map((line, lineIndex) => (
                <tspan key={lineIndex} x={center(index)} dy={lineIndex === 0 ? 0 : 12}>
                  {line}
                </tspan>
              ))}
            </text>
          ))}
          <rect x={LEFT} y={TOP - 4} width={width - LEFT - RIGHT} height={plotHeight + bottomPad} className="fill-transparent" style={{ touchAction: "pan-y" }} onPointerMove={onPointerMove} />
        </svg>
        {readout && cursor !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-sm border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={tooltipOnLeft ? { right: Math.max(3, width - center(cursor) + 12) } : { left: Math.min(width - 150, center(cursor) + 12) }}
          >
            <b className="mb-1 block">{model.labels[cursor]}</b>
            {readout.map((row) => (
              <div key={row.name} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <strong className="tabular-nums">
                  {row.value}
                  {model.unit ? ` ${model.unit}` : ""}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {readout && cursor !== null ? `${model.labels[cursor]}: ${readout.map((row) => `${row.name} ${row.value}`).join(", ")}` : ""}
      </p>
    </div>
  )
}
