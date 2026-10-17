import { cn } from "@/lib/utils"
import { textWidth, thinAxisLabels, wrapText, type AxisLabel, type GanttModel } from "./chart-math"
import { ChartLegendList } from "./chart-legend"
import { GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { BAR_HEIGHT, NOTE_LINE, NOTE_SIZE, ROW_GAP, boldWidth, fitColumnHeaders, isSpanRow, layoutPills, placeNote, rowNameWidth, type GanttRow, type PillBox } from "./gantt-layout"
import { useChartWidth } from "./use-chart-width"

/**
 * K6a: rows of segments over a time or day domain (trading sessions, T+2 calendar, a daily
 * schedule). Segments are tinted with an outline in their tone so the label reads in both themes.
 */
export function GanttChart({ model, label }: { model: GanttModel; label: string }) {
  const [measure, width] = useChartWidth()
  const [d0, d1] = model.domain
  const nameWidth = rowNameWidth(
    model.rows.map((row) => row.name),
    width,
  )
  const left = nameWidth + 6
  const right = width - 10
  const x = (v: number) => left + ((v - d0) / (d1 - d0 || 1)) * (right - left)

  // Column headers wrap onto two lines, then shrink, when a column is too narrow ("Thứ Hai" at 390px).
  const columnWidth = model.columns ? (right - left) / model.columns.length : 0
  const header = fitColumnHeaders(
    (model.columns ?? []).map((column) => column.label),
    columnWidth,
  )
  const columnLines = header.lines
  const headerLine = Math.round(header.size * 1.15)
  const headerLines = Math.max(1, ...columnLines.map((lines) => lines.length))
  const highlightBand = model.highlight?.label ? 16 : 0
  const headerRow = (model.columns ? 18 + (headerLines - 1) * headerLine : 0) + highlightBand

  const rowLayouts = model.rows.map((row) => {
    const span = isSpanRow(row)
    const pills = span && row.markers ? layoutPills(row.markers, x, left, width - 2) : []
    const note = span ? placeNote(row, pills, width, left) : row.note ? { side: false as const, x: 0, lines: wrapText(row.note, width - 12, NOTE_SIZE) } : null
    const markerBand = !span && row.markers?.length ? 14 : 0
    const sideHeight = note?.side ? note.lines.length * NOTE_LINE : 0
    const noteBelow = note && !note.side ? note.lines.length * 14 + 4 : 0
    const height = Math.max(BAR_HEIGHT, sideHeight) + ROW_GAP + markerBand + noteBelow
    return { span, pills, note, markerBand, height }
  })
  const tops: number[] = []
  let cursor = headerRow + 4
  for (const layout of rowLayouts) {
    tops.push(cursor)
    cursor += layout.height
  }
  const plotBottom = cursor
  const tickLabels = thinAxisLabels(
    model.ticks.flatMap((tick, index): AxisLabel[] => {
      if (!tick.label) return []
      const at = x(tick.v)
      const anchor = index === 0 && at - left < 16 ? "start" : index === model.ticks.length - 1 && right - at < 16 ? "end" : "middle"
      return [{ index, text: tick.label, anchor, at }]
    }),
  )
  const height = plotBottom + (tickLabels.length ? 20 : 4)

  return (
    <div ref={measure} className="w-full min-w-0 space-y-2">
      {model.legend && <ChartLegendList entries={model.legend.map((entry) => ({ ...entry, shape: "bar" as const }))} />}
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
        <title>{label}</title>
        {model.columns?.map((column, index) => (
          <g key={index}>
            {column.dim && <rect x={left + index * columnWidth} y={headerRow - 2} width={columnWidth} height={plotBottom - headerRow + 2} className="fill-muted opacity-70" />}
            <text
              x={left + (index + 0.5) * columnWidth}
              y={highlightBand + 13 + (headerLines - columnLines[index].length) * headerLine}
              textAnchor="middle"
              fontSize={header.size}
              className={cn(LABEL_FILL, column.dim && "opacity-60", "font-semibold")}
            >
              {columnLines[index].map((line, lineIndex) => (
                <tspan key={lineIndex} x={left + (index + 0.5) * columnWidth} dy={lineIndex === 0 ? 0 : headerLine}>
                  {line}
                </tspan>
              ))}
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
          const layout = rowLayouts[rowIndex]
          const barTop = top + (Math.max(BAR_HEIGHT, layout.note?.side ? layout.note.lines.length * NOTE_LINE : 0) - BAR_HEIGHT) / 2
          const mid = barTop + BAR_HEIGHT / 2
          const nameLines = wrapText(row.name, nameWidth, 11, 2)
          return (
            <g key={rowIndex}>
              <text x={0} y={mid + 4 - ((nameLines.length - 1) * 13) / 2} className="fill-foreground text-[11px] font-semibold">
                {nameLines.map((line, index) => (
                  <tspan key={index} x={0} dy={index === 0 ? 0 : 13}>
                    {line}
                  </tspan>
                ))}
              </text>
              {layout.span ? (
                <SpanRow row={row} pills={layout.pills} mid={mid} x={x} columns={model.columns?.length ?? 0} columnWidth={columnWidth} left={left} />
              ) : (
                <SegmentRow row={row} top={barTop} x={x} width={width} />
              )}
              {layout.note && (
                <text
                  x={layout.note.x}
                  y={layout.note.side ? mid + 4 - ((layout.note.lines.length - 1) * NOTE_LINE) / 2 : barTop + BAR_HEIGHT + layout.markerBand + 18}
                  className="fill-academy-label text-[11px]"
                >
                  {layout.note.lines.map((line, index) => (
                    <tspan key={index} x={layout.note?.x} dy={index === 0 ? 0 : layout.note?.side ? NOTE_LINE : 14}>
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

/** Tinted bars with their label inside when it fits; markers as small triangles under the bar. */
function SegmentRow({ row, top, x, width }: { row: GanttRow; top: number; x: (v: number) => number; width: number }) {
  return (
    <>
      {row.segments.map((segment, index) => {
        const sx = x(segment.from)
        const sw = Math.max(1, x(segment.to) - sx)
        const fits = segment.label !== undefined && boldWidth(segment.label, 10.5) + 6 <= sw
        return (
          <g key={index}>
            <rect x={sx + 0.5} y={top} width={Math.max(1, sw - 1)} height={BAR_HEIGHT} rx="3" className={segment.muted ? "fill-muted" : cn(TONE_FILL[segment.tone], "opacity-25")} />
            {!segment.muted && (
              <rect x={sx + 0.5} y={top} width={Math.max(1, sw - 1)} height={BAR_HEIGHT} rx="3" fill="none" strokeWidth="1" className={TONE_STROKE[segment.tone]} />
            )}
            {segment.label && fits && (
              <text x={sx + sw / 2} y={top + BAR_HEIGHT / 2 + 4} textAnchor="middle" className={cn(segment.muted ? LABEL_FILL : "fill-foreground", "text-[10.5px] font-semibold")}>
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
            <path d={`M${mx - 4},${top + BAR_HEIGHT + 6} L${mx + 4},${top + BAR_HEIGHT + 6} L${mx},${top + BAR_HEIGHT} Z`} className={TONE_FILL[marker.tone]} />
            <text x={mx} y={top + BAR_HEIGHT + 18} textAnchor={anchor} className={cn(textFill(marker.tone), "text-[10.5px] font-semibold")}>
              {marker.text}
            </text>
          </g>
        )
      })}
    </>
  )
}

/** Dashed connector between date pills, with a dot on every day column it crosses. */
function SpanRow({
  row,
  pills,
  mid,
  x,
  columns,
  columnWidth,
  left,
}: {
  row: GanttRow
  pills: PillBox[]
  mid: number
  x: (v: number) => number
  columns: number
  columnWidth: number
  left: number
}) {
  return (
    <>
      {row.segments.map((segment, index) => {
        const x1 = x(segment.from)
        const x2 = x(segment.to)
        const dots = Array.from({ length: columns }, (_, column) => left + (column + 0.5) * columnWidth).filter(
          (cx) => cx > x1 + 1 && cx < x2 - 1 && pills.every((pill) => cx < pill.x - 4 || cx > pill.x + pill.w + 4),
        )
        return (
          <g key={index}>
            <line x1={x1} x2={x2} y1={mid} y2={mid} strokeWidth="1.5" strokeDasharray="4 4" className="stroke-academy-label opacity-70" />
            {dots.map((cx) => (
              <circle key={cx} cx={cx} cy={mid} r="3" className="fill-academy-label opacity-70" />
            ))}
            {segment.label && <title>{segment.label}</title>}
          </g>
        )
      })}
      {pills.map((pill, index) => (
        <g key={index}>
          <rect x={pill.x} y={mid - BAR_HEIGHT / 2} width={pill.w} height={BAR_HEIGHT} rx="6" className="fill-card" />
          <rect x={pill.x} y={mid - BAR_HEIGHT / 2} width={pill.w} height={BAR_HEIGHT} rx="6" className={cn(TONE_FILL[pill.marker.tone], "opacity-20")} />
          <rect x={pill.x} y={mid - BAR_HEIGHT / 2} width={pill.w} height={BAR_HEIGHT} rx="6" fill="none" strokeWidth="1" className={TONE_STROKE[pill.marker.tone]} />
          <text x={pill.x + pill.w / 2} y={mid + 4} textAnchor="middle" className={cn(textFill(pill.marker.tone), "text-[11px] font-bold")}>
            {pill.marker.text}
          </text>
        </g>
      ))}
    </>
  )
}

/** Segment labels that did not fit inside their bar are listed under the chart, so none is lost. */
function SegmentLabelList({ model, left, right }: { model: GanttModel; left: number; right: number }) {
  const [d0, d1] = model.domain
  const scale = (right - left) / (d1 - d0 || 1)
  const hidden = model.rows.flatMap((row) =>
    isSpanRow(row)
      ? []
      : row.segments
          .filter((segment) => segment.label && boldWidth(segment.label, 10.5) + 6 > Math.max(1, (segment.to - segment.from) * scale))
          .map((segment) => ({ row: row.name, label: segment.label as string, tone: segment.tone })),
  )
  if (hidden.length === 0) return null
  const unique = hidden.filter((item, index) => hidden.findIndex((other) => other.label === item.label && other.tone === item.tone) === index)
  if (model.legend && unique.every((item) => model.legend?.some((entry) => entry.tone === item.tone))) return null
  return <ChartLegendList entries={unique.map((item) => ({ label: item.label, tone: item.tone, shape: "bar" as const }))} />
}
