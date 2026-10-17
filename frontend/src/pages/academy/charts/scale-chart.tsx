import { cn } from "@/lib/utils"
import { textWidth, wrapText, type ScaleModel } from "./chart-math"
import { GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { useChartWidth } from "./use-chart-width"

/**
 * Wraps a marker label to `maxWidth` without stranding a unit or separator: a token of one or two
 * characters ("đ", "%", "·") stays on the line of the word before it.
 */
function wrapLabel(text: string, maxWidth: number): string[] {
  const glue = "\u0001"
  const tokens = text
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((joined, token) => {
      if (joined.length > 0 && token.length <= 2) joined[joined.length - 1] += glue + token
      else joined.push(token)
      return joined
    }, [])
  return wrapText(tokens.join(" "), maxWidth).map((line) => line.split(glue).join(" "))
}

/**
 * K4: a 1-D scale with zones, an optional stepped colour ramp (one flat segment per tone, never a
 * free gradient) and labelled markers. Horizontal scales put side `a` markers above and side `b`
 * below the track; vertical scales put labels to the right.
 */
export function ScaleChart({ model, label }: { model: ScaleModel; label: string }) {
  const [measure, width] = useChartWidth()
  return (
    <div ref={measure} className="w-full min-w-0">
      {model.orientation === "v" ? <VerticalScale model={model} label={label} width={width} /> : <HorizontalScale model={model} label={label} width={width} />}
    </div>
  )
}

function HorizontalScale({ model, label, width }: { model: ScaleModel; label: string; width: number }) {
  const [d0, d1] = model.domain
  const left = 12
  const right = width - 12
  const x = (v: number) => left + ((v - d0) / (d1 - d0 || 1)) * (right - left)
  const above = model.markers.filter((marker, index) => (marker.side ?? (index % 2 === 0 ? "a" : "b")) === "a")
  const below = model.markers.filter((marker) => !above.includes(marker))
  const lineHeight = 13
  // A label may grow to half the scale, but never into the room of the next marker on its side.
  const labelLines = (marker: (typeof model.markers)[number]) => {
    const side = above.includes(marker) ? above : below
    const room = Math.min(...side.filter((other) => other !== marker).map((other) => Math.abs(x(other.v) - x(marker.v)) - 8), (width - 24) / 2)
    return wrapLabel(marker.label, Math.max(110, room))
  }
  const labelBlock = (markers: typeof model.markers) =>
    markers.length ? Math.max(...markers.map((marker) => labelLines(marker).length + (marker.sub ? 1 : 0))) * lineHeight + 10 : 0
  const zoneLabels = model.zones?.some((zone) => zone.label) ? 16 : 0
  const trackTop = 6 + labelBlock(above)
  const trackHeight = 12
  const trackBottom = trackTop + trackHeight
  const ticksRow = model.ticks?.length ? 16 : 0
  const endsRow = model.ends ? 18 : 0
  const belowTop = trackBottom + zoneLabels + ticksRow + 6
  const height = belowTop + labelBlock(below) + endsRow + 4
  const tones = model.gradient ?? []
  const stepSize = (d1 - d0) / Math.max(1, tones.length)

  // A below-track marker's stem runs down through the tick row: a tick label it would cross is left
  // out (the marker label already carries that value).
  const stems = below.map((marker) => x(marker.v))
  const crossesStem = (at: number, w: number) => stems.some((stem) => Math.abs(stem - at) < w / 2 + 4)

  const markerLabel = (marker: (typeof model.markers)[number], y: number, up: boolean) => {
    const px = x(marker.v)
    const lines = labelLines(marker)
    const w = Math.max(...lines.map((line) => textWidth(line)))
    const anchor = px < left + 50 || px - w / 2 < 2 ? "start" : px > right - 50 || px + w / 2 > width - 2 ? "end" : "middle"
    const all = [...lines.map((text) => ({ text, sub: false })), ...(marker.sub ? [{ text: marker.sub, sub: true }] : [])]
    const startY = up ? y - (all.length - 1) * lineHeight : y
    return (
      <text x={px} y={startY} textAnchor={anchor} className="text-[11px]">
        {all.map((line, index) => (
          <tspan
            key={index}
            x={px}
            dy={index === 0 ? 0 : lineHeight}
            className={line.sub ? cn(LABEL_FILL, "tabular-nums") : cn(textFill(marker.tone), "font-semibold")}
          >
            {line.text}
          </tspan>
        ))}
      </text>
    )
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={left} y={trackTop} width={right - left} height={trackHeight} rx="3" className="fill-muted" />
      {tones.map((tone, index) => (
        <rect
          key={index}
          x={x(d0 + index * stepSize)}
          y={trackTop}
          width={Math.max(0, x(d0 + (index + 1) * stepSize) - x(d0 + index * stepSize))}
          height={trackHeight}
          className={cn(TONE_FILL[tone], "opacity-60")}
        />
      ))}
      {model.zones?.map((zone, index) => (
        <g key={index}>
          <rect x={x(zone.from)} y={trackTop} width={Math.max(1, x(zone.to) - x(zone.from))} height={trackHeight} className={cn(TONE_FILL[zone.tone], "opacity-70")} />
          {zone.label && (
            <text x={(x(zone.from) + x(zone.to)) / 2} y={trackBottom + 12} textAnchor="middle" className={cn(textFill(zone.tone), "text-[10.5px]")}>
              {zone.label}
            </text>
          )}
        </g>
      ))}
      {model.ticks?.map((tick, index) => (
        <g key={index}>
          <line x1={x(tick.v)} x2={x(tick.v)} y1={trackBottom} y2={trackBottom + 4} strokeWidth="1" className={GRID_STROKE} />
          {tick.label && !crossesStem(x(tick.v), textWidth(tick.label, 10.5)) && (
            <text x={x(tick.v)} y={trackBottom + zoneLabels + 14} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
              {tick.label}
            </text>
          )}
        </g>
      ))}
      {model.markers.map((marker, index) => {
        const up = above.includes(marker)
        return (
          <g key={index}>
            <line
              x1={x(marker.v)}
              x2={x(marker.v)}
              y1={up ? trackTop - 6 : trackTop}
              y2={up ? trackBottom : belowTop - 4}
              strokeWidth="2"
              className={TONE_STROKE[marker.tone]}
            />
            <circle cx={x(marker.v)} cy={trackTop + trackHeight / 2} r="5" strokeWidth="2" className={cn(TONE_FILL[marker.tone], "stroke-card")} />
            {markerLabel(marker, up ? trackTop - 10 : belowTop + 10, up)}
          </g>
        )
      })}
      {model.ends && (
        <>
          <text x={left} y={height - 6} className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
            {model.ends[0]}
          </text>
          <text x={right} y={height - 6} textAnchor="end" className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
            {model.ends[1]}
          </text>
        </>
      )}
    </svg>
  )
}

function VerticalScale({ model, label, width }: { model: ScaleModel; label: string; width: number }) {
  const [d0, d1] = model.domain
  const top = 14
  const height = 240
  const bottom = height - 14
  const trackX = model.ticks?.length ? Math.max(...model.ticks.map((tick) => textWidth(tick.label, 10.5))) + 10 : 16
  const trackWidth = 14
  const y = (v: number) => bottom - ((v - d0) / (d1 - d0 || 1)) * (bottom - top)
  const labelX = trackX + trackWidth + 14
  const zoneX = Math.max(labelX + 150, width * 0.55)
  const narrow = width < 380
  const tones = model.gradient ?? []
  const stepSize = (d1 - d0) / Math.max(1, tones.length)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={trackX} y={top} width={trackWidth} height={bottom - top} rx="3" className="fill-muted" />
      {tones.map((tone, index) => (
        <rect
          key={index}
          x={trackX}
          y={y(d0 + (index + 1) * stepSize)}
          width={trackWidth}
          height={Math.max(0, y(d0 + index * stepSize) - y(d0 + (index + 1) * stepSize))}
          className={cn(TONE_FILL[tone], "opacity-60")}
        />
      ))}
      {model.zones?.map((zone, index) => (
        <g key={index}>
          <rect x={trackX} y={y(zone.to)} width={trackWidth} height={Math.max(1, y(zone.from) - y(zone.to))} className={cn(TONE_FILL[zone.tone], "opacity-70")} />
          {zone.label && (
            <text
              x={narrow ? labelX : zoneX}
              y={(y(zone.from) + y(zone.to)) / 2 + (narrow ? 18 : 4)}
              className={cn(textFill(zone.tone), "text-[11px]")}
            >
              {zone.label}
            </text>
          )}
        </g>
      ))}
      {model.ticks?.map((tick, index) => (
        <text key={index} x={trackX - 4} y={y(tick.v) + 4} textAnchor="end" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
          {tick.label}
        </text>
      ))}
      {model.markers.map((marker, index) => {
        const my = Math.min(Math.max(y(marker.v), top + 6), bottom - (marker.sub ? 14 : 2))
        return (
          <g key={index}>
            <line x1={trackX - 3} x2={labelX - 4} y1={y(marker.v)} y2={y(marker.v)} strokeWidth="2" className={TONE_STROKE[marker.tone]} />
            <text x={labelX} y={my + 4} className="text-[11px]">
              <tspan className={cn(textFill(marker.tone), "font-semibold")}>{marker.label}</tspan>
              {marker.sub && (
                <tspan x={labelX} dy={13} className={cn(LABEL_FILL, "tabular-nums")}>
                  {marker.sub}
                </tspan>
              )}
            </text>
          </g>
        )
      })}
      {model.ends && (
        <>
          <text x={trackX + trackWidth / 2} y={top - 4} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px]")}>
            {model.ends[1]}
          </text>
          <text x={trackX + trackWidth / 2} y={height - 2} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px]")}>
            {model.ends[0]}
          </text>
        </>
      )}
    </svg>
  )
}
