import { cn } from "@/lib/utils"
import { textWidth, thinAxisLabels, wrapText, type AxisLabel, type GanttModel } from "./chart-math"
import { ChartLegendList } from "./chart-legend"
import { GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/**
 * K6a: rows of segments over a time or day domain (trading sessions, T+2 calendar, a daily
 * schedule). Segments are tinted with an outline in their tone so the label reads in both themes.
 */
export function GanttChart({ model, label }: { model: GanttModel; label: string }) {
  const [measure, width] = useChartWidth()
  const [d0, d1] = model.domain
  const nameWidth = Math.min(96, Math.max(56, width * 0.22, ...model.rows.map((row) => Math.min(textWidth(row.name) + 8, 96))))
  const left = nameWidth + 6
  const right = width - 10
  const x = (v: number) => left + ((v - d0) / (d1 - d0 || 1)) * (right - left)
  const headerRow = (model.columns ? 18 : 0) + (model.highlight?.label ? 16 : 0)
  const barHeight = 22
  const rowHeights = model.rows.map((row) => barHeight + 10 + (row.markers?.length ? 14 : 0) + (row.note ? wrapText(row.note, width - 12).length * 14 : 0))
  const tops: number[] = []
  let cursor = headerRow + 4
  for (const h of rowHeights) {
    tops.push(cursor)
    cursor += h
  }
  const plotBottom = cursor
  const height = plotBottom + 20
  const columnWidth = model.columns ? (right - left) / model.columns.length : 0
  const tickLabels = thinAxisLabels(
    model.ticks.flatMap((tick, index): AxisLabel[] => {
      if (!tick.label) return []
      const at = x(tick.v)
      const anchor = index === 0 && at - left < 16 ? "start" : index === model.ticks.length - 1 && right - at < 16 ? "end" : "middle"
      return [{ index, text: tick.label, anchor, at }]
    }),
  )

  return (
    <div ref={measure} className="w-full min-w-0 space-y-2">
      {model.legend && <ChartLegendList entries={model.legend.map((entry) => ({ ...entry, shape: "bar" as const }))} />}
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
        <title>{label}</title>
        {model.columns?.map((column, index) => (
          <g key={index}>
            {column.dim && <rect x={left + index * columnWidth} y={headerRow - 2} width={columnWidth} height={plotBottom - headerRow + 2} className="fill-muted opacity-70" />}
            <text x={left + (index + 0.5) * columnWidth} y={model.highlight?.label ? 30 : 13} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px] font-semibold")}>
              {column.label}
            </text>
          </g>
        ))}
        {model.highlight && (
          <g>
            <rect
              x={x(model.highlight.from)}
              y={headerRow}
              width={Math.max(1, x(model.highlight.to) - x(model.highlight.from))}
              height={plotBottom - headerRow}
              rx="3"
              strokeDasharray="4 3"
              strokeWidth="1"
              className="fill-chart-1/10 stroke-chart-1"
            />
            {model.highlight.label && (
              <text x={(x(model.highlight.from) + x(model.highlight.to)) / 2} y={12} textAnchor="middle" className="fill-chart-1 text-[11px] font-semibold">
                {model.highlight.label}
              </text>
            )}
          </g>
        )}
        {model.ticks.map((tick, index) => (
          <line key={index} x1={x(tick.v)} x2={x(tick.v)} y1={headerRow} y2={plotBottom} strokeWidth="0.6" strokeDasharray="2 4" className={GRID_STROKE} />
        ))}
        {tickLabels.map((tick) => (
          <text key={tick.index} x={tick.at} y={height - 6} textAnchor={tick.anchor} className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
            {tick.text}
          </text>
        ))}
        {model.rows.map((row, rowIndex) => {
          const top = tops[rowIndex]
          const nameLines = wrapText(row.name, nameWidth, 11, 2)
          return (
            <g key={rowIndex}>
              <text x={0} y={top + barHeight / 2 + 4 - ((nameLines.length - 1) * 13) / 2} className="fill-foreground text-[11px] font-semibold">
                {nameLines.map((line, index) => (
                  <tspan key={index} x={0} dy={index === 0 ? 0 : 13}>
                    {line}
                  </tspan>
                ))}
              </text>
              {row.segments.map((segment, index) => {
                const sx = x(segment.from)
                const sw = Math.max(1, x(segment.to) - sx)
                const fits = segment.label !== undefined && textWidth(segment.label, 10.5) + 6 <= sw
                return (
                  <g key={index}>
                    <rect
                      x={sx + 0.5}
                      y={top}
                      width={Math.max(1, sw - 1)}
                      height={barHeight}
                      rx="3"
                      className={segment.muted ? "fill-muted" : cn(TONE_FILL[segment.tone], "opacity-25")}
                    />
                    {!segment.muted && (
                      <rect x={sx + 0.5} y={top} width={Math.max(1, sw - 1)} height={barHeight} rx="3" fill="none" strokeWidth="1" className={TONE_STROKE[segment.tone]} />
                    )}
                    {segment.label && fits && (
                      <text x={sx + sw / 2} y={top + barHeight / 2 + 4} textAnchor="middle" className={cn(segment.muted ? LABEL_FILL : "fill-foreground", "text-[10.5px] font-semibold")}>
                        {segment.label}
                      </text>
                    )}
                    {segment.label && !fits && <title>{segment.label}</title>}
                  </g>
                )
              })}
              {row.markers?.map((marker, index) => {
                const mx = x(marker.at)
                const w = textWidth(marker.text, 10.5)
                const anchor = mx - w / 2 < 0 ? "start" : mx + w / 2 > width ? "end" : "middle"
                return (
                  <g key={index}>
                    <path d={`M${mx - 4},${top + barHeight + 6} L${mx + 4},${top + barHeight + 6} L${mx},${top + barHeight} Z`} className={TONE_FILL[marker.tone]} />
                    <text x={mx} y={top + barHeight + 18} textAnchor={anchor} className={cn(textFill(marker.tone), "text-[10.5px] font-semibold")}>
                      {marker.text}
                    </text>
                  </g>
                )
              })}
              {row.note && (
                <text x={0} y={top + barHeight + (row.markers?.length ? 14 : 0) + 18} className="fill-academy-label text-[11px]">
                  {wrapText(row.note, width - 12).map((line, index) => (
                    <tspan key={index} x={0} dy={index === 0 ? 0 : 14}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <SegmentLabelList model={model} left={left} right={right} />
    </div>
  )
}

/** Segment labels that did not fit inside their bar are listed under the chart, so none is lost. */
function SegmentLabelList({ model, left, right }: { model: GanttModel; left: number; right: number }) {
  const [d0, d1] = model.domain
  const scale = (right - left) / (d1 - d0 || 1)
  const hidden = model.rows.flatMap((row) =>
    row.segments
      .filter((segment) => segment.label && textWidth(segment.label, 10.5) + 6 > Math.max(1, (segment.to - segment.from) * scale))
      .map((segment) => ({ row: row.name, label: segment.label as string, tone: segment.tone })),
  )
  if (hidden.length === 0) return null
  const unique = hidden.filter((item, index) => hidden.findIndex((other) => other.label === item.label && other.tone === item.tone) === index)
  if (model.legend && unique.every((item) => model.legend?.some((entry) => entry.tone === item.tone))) return null
  return <ChartLegendList entries={unique.map((item) => ({ label: item.label, tone: item.tone, shape: "bar" as const }))} />
}
