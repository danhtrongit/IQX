import { useId } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import { textWidth, wrapText, type SchematicLayer, type SchematicModel } from "./chart-math"
import { DASH, GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

type Range = [number, number]

function layerPoints(layer: SchematicLayer): [number, number][] {
  switch (layer.t) {
    case "line":
      return layer.pts
    case "segment":
      return [layer.from, layer.to]
    case "point":
    case "tag":
    case "text":
      return [layer.at]
    case "bracket":
      return [
        [layer.x[0], layer.y],
        [layer.x[1], layer.y],
      ]
    case "bars":
      return layer.x.flatMap((x, index) => [
        [x, layer.base] as [number, number],
        [x, layer.base + (layer.h[index] ?? 0)] as [number, number],
      ])
    case "zone":
      return [
        ...(layer.x ? [[layer.x[0], NaN] as [number, number], [layer.x[1], NaN] as [number, number]] : []),
        ...(layer.y ? [[NaN, layer.y[0]] as [number, number], [NaN, layer.y[1]] as [number, number]] : []),
      ]
  }
}

function extent(values: number[], fallback: Range): Range {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return fallback
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  if (lo === hi) return [lo - 1, hi + 1]
  const pad = (hi - lo) * 0.06
  return [lo - pad, hi + pad]
}

const POINT_RADIUS = { s: 3, m: 4.5, l: 6 } as const

/** Moves an anchored label of width `w` so it stays within [lo, hi], keeping its anchor. */
function fitX(x: number, w: number, anchor: "start" | "middle" | "end", lo: number, hi: number): number {
  const start = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  const shifted = Math.min(Math.max(start, lo), Math.max(lo, hi - w))
  return anchor === "middle" ? shifted + w / 2 : anchor === "end" ? shifted + w : shifted
}

/**
 * K5: a value-domain sketch (trend lines, support and resistance, divergence, cycles, payoff,
 * scatter). y grows upward. Optional stacked panels share the x domain. Axis arrows are drawn,
 * never typed.
 */
export function SchematicChart({ model, label }: { model: SchematicModel; label: string }) {
  const [measure, width] = useChartWidth()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const narrow = width < NARROW_CHART_WIDTH
  const panels = model.panels?.length ? model.panels : [{ title: undefined, y: undefined as Range | undefined }]
  const all = model.layers.flatMap(layerPoints)
  const xDomain: Range = model.domain?.x ?? extent(all.map((p) => p[0]), [0, 1])
  const panelY = panels.map((panel, index): Range => {
    if (panel.y) return panel.y
    if (model.domain?.y) return model.domain.y
    const own = model.layers.filter((layer) => (layer.panel ?? 0) === index).flatMap(layerPoints)
    return extent(own.map((p) => p[1]), [0, 1])
  })
  const axes = model.axes
  const yTicks = axes?.y?.ticks ?? []
  const xTicks = axes?.x?.ticks ?? []
  const left = yTicks.length ? Math.max(...yTicks.map((tick) => textWidth(tick.label, 10.5))) + 12 : axes?.y ? 12 : 6
  const right = width - 8
  const titleTop = axes?.y?.title ? 18 : 6
  const panelHeight = panels.length > 1 ? (narrow ? 112 : 136) : narrow ? 190 : 224
  const panelGap = 22
  const tops = panels.map((_, index) => titleTop + index * (panelHeight + panelGap) + (panels[index].title ? 14 : 0))
  const plotBottom = tops[tops.length - 1] + panelHeight
  const bottomPad = (xTicks.length ? 16 : 0) + (axes?.x?.title ? 18 : 0) + 6
  const height = plotBottom + bottomPad
  const x = (v: number) => left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * (right - left)
  const yFor = (panel: number) => {
    const [lo, hi] = panelY[panel] ?? panelY[0]
    const top = tops[panel] ?? tops[0]
    return (v: number) => top + panelHeight - ((v - lo) / (hi - lo || 1)) * panelHeight
  }
  const arrowId = `${uid}-arrow`

  return (
    <div ref={measure} className="w-full min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={label}>
        <title>{label}</title>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-academy-label" />
          </marker>
          {(["pos", "neg", "p1", "p2", "warn", "price", "p4", "p5", "info", "p3", "neutral"] as ChartTone[]).map((tone) => (
            <marker key={tone} id={`${arrowId}-${tone}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={TONE_FILL[tone]} />
            </marker>
          ))}
        </defs>
        {axes?.y?.title && (
          <text x={left} y={11} className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
            {axes.y.title}
          </text>
        )}
        {panels.map((panel, index) => {
          const top = tops[index]
          const y = yFor(index)
          return (
            <g key={index}>
              {panel.title && (
                <text x={left} y={top - 5} className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
                  {panel.title}
                </text>
              )}
              {index > 0 && <line x1={left} x2={right} y1={top - (panel.title ? 18 : 6)} y2={top - (panel.title ? 18 : 6)} strokeWidth="0.6" className={GRID_STROKE} />}
              {yTicks.map((tick, tickIndex) =>
                index === 0 || panels.length === 1 ? (
                  <g key={tickIndex}>
                    <line x1={left} x2={right} y1={y(tick.v)} y2={y(tick.v)} strokeWidth="0.6" strokeDasharray="3 4" className={GRID_STROKE} />
                    <text x={left - 5} y={y(tick.v) + 3.5} textAnchor="end" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
                      {tick.label}
                    </text>
                  </g>
                ) : null,
              )}
            </g>
          )
        })}
        {axes?.y && (
          <line
            x1={left}
            x2={left}
            y1={plotBottom}
            y2={titleTop + (axes.y.arrow ? 2 : 0)}
            strokeWidth="1.2"
            className="stroke-academy-label"
            markerEnd={axes.y.arrow ? `url(#${arrowId})` : undefined}
          />
        )}
        {axes?.x && (
          <line
            x1={left}
            x2={right}
            y1={plotBottom}
            y2={plotBottom}
            strokeWidth="1.2"
            className="stroke-academy-label"
            markerEnd={axes.x.arrow ? `url(#${arrowId})` : undefined}
          />
        )}
        {xTicks.map((tick, index) => (
          <text
            key={index}
            x={fitX(x(tick.v), textWidth(tick.label, 10.5), "middle", 0, width)}
            y={plotBottom + 13}
            textAnchor="middle"
            className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}
          >
            {tick.label}
          </text>
        ))}
        {axes?.x?.title && (
          <text x={right} y={height - 6} textAnchor="end" className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
            {axes.x.title}
          </text>
        )}
        {model.layers.map((layer, index) => (
          <Layer
            key={index}
            layer={layer}
            x={x}
            y={yFor(layer.panel ?? 0)}
            top={tops[layer.panel ?? 0] ?? tops[0]}
            height={panelHeight}
            left={left}
            right={right}
            arrowId={arrowId}
          />
        ))}
      </svg>
    </div>
  )
}

type LayerProps = {
  layer: SchematicLayer
  x: (v: number) => number
  y: (v: number) => number
  top: number
  height: number
  left: number
  right: number
  arrowId: string
}

function Layer({ layer, x, y, top, height, left, right, arrowId }: LayerProps) {
  switch (layer.t) {
    case "zone": {
      const x0 = layer.x ? x(layer.x[0]) : left
      const x1 = layer.x ? x(layer.x[1]) : right
      const y0 = layer.y ? y(layer.y[1]) : top
      const y1 = layer.y ? y(layer.y[0]) : top + height
      return (
        <g>
          <rect
            x={Math.min(x0, x1)}
            y={Math.min(y0, y1)}
            width={Math.abs(x1 - x0)}
            height={Math.abs(y1 - y0)}
            className={cn(TONE_FILL[layer.tone], "opacity-[0.12]")}
          />
          {layer.label && (
            <text x={Math.min(x0, x1) + 4} y={Math.min(y0, y1) + 13} className={cn(textFill(layer.tone), "text-[10.5px] font-semibold")}>
              {layer.label}
            </text>
          )}
        </g>
      )
    }
    case "line": {
      const width = layer.width ?? 2
      if (layer.colors?.length) {
        return (
          <g>
            {layer.pts.slice(1).map((point, index) => (
              <line
                key={index}
                x1={x(layer.pts[index][0])}
                y1={y(layer.pts[index][1])}
                x2={x(point[0])}
                y2={y(point[1])}
                strokeWidth={width}
                strokeLinecap="round"
                strokeDasharray={layer.dash ? DASH : undefined}
                className={TONE_STROKE[layer.colors?.[index] ?? layer.tone]}
              />
            ))}
          </g>
        )
      }
      const d = layer.pts.map((point, index) => `${index === 0 ? "M" : "L"}${x(point[0]).toFixed(2)},${y(point[1]).toFixed(2)}`).join("")
      return (
        <path
          d={d}
          fill="none"
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={layer.dash ? DASH : undefined}
          className={TONE_STROKE[layer.tone]}
        />
      )
    }
    case "segment":
      return (
        <line
          x1={x(layer.from[0])}
          y1={y(layer.from[1])}
          x2={x(layer.to[0])}
          y2={y(layer.to[1])}
          strokeWidth="1.6"
          strokeDasharray={layer.dash ? DASH : undefined}
          className={TONE_STROKE[layer.tone]}
          markerEnd={layer.arrow ? `url(#${arrowId}-${layer.tone})` : undefined}
        />
      )
    case "point": {
      const cx = x(layer.at[0])
      const cy = y(layer.at[1])
      const r = POINT_RADIUS[layer.size ?? "m"]
      const ring = layer.shape === "ring"
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            strokeWidth={ring ? 1.8 : 1}
            className={ring ? cn(TONE_STROKE[layer.tone], "fill-card") : cn(TONE_FILL[layer.tone], "stroke-card")}
          />
          {layer.label && <PlacedLabel text={layer.label} cx={cx} cy={cy} r={r} pos={layer.pos} tone={layer.tone} left={left} right={right} />}
        </g>
      )
    }
    case "tag": {
      const cx = x(layer.at[0])
      const cy = y(layer.at[1])
      const w = textWidth(layer.text, 10.5) + 10
      const boxY = layer.pos === "above" ? cy - 26 : cy + 8
      const boxX = Math.min(Math.max(cx - w / 2, left), right - w)
      return (
        <g>
          <rect x={boxX} y={boxY} width={w} height={18} rx="3" className={cn(TONE_FILL[layer.tone], "opacity-[0.16]")} />
          <rect x={boxX} y={boxY} width={w} height={18} rx="3" fill="none" strokeWidth="1" className={TONE_STROKE[layer.tone]} />
          <text x={boxX + w / 2} y={boxY + 12.5} textAnchor="middle" className={cn(textFill(layer.tone), "text-[10.5px] font-semibold")}>
            {layer.text}
          </text>
        </g>
      )
    }
    case "bracket": {
      const x0 = x(layer.x[0])
      const x1 = x(layer.x[1])
      const by = y(layer.y)
      return (
        <g>
          <path d={`M${x0},${by - 5} L${x0},${by} L${x1},${by} L${x1},${by - 5}`} fill="none" strokeWidth="1.4" className={TONE_STROKE[layer.tone]} />
          <text x={(x0 + x1) / 2} y={by + 14} textAnchor="middle" className={cn(textFill(layer.tone), "text-[10.5px] font-semibold")}>
            {layer.label}
          </text>
        </g>
      )
    }
    case "bars": {
      const xs = layer.x.map(x)
      const gaps = xs.slice(1).map((value, index) => Math.abs(value - xs[index]))
      const barWidth = Math.max(2, Math.min(18, (gaps.length ? Math.min(...gaps) : 20) * 0.7))
      return (
        <g>
          {layer.x.map((value, index) => {
            const h = layer.h[index] ?? 0
            const y0 = y(layer.base)
            const y1 = y(layer.base + h)
            return (
              <rect
                key={index}
                x={x(value) - barWidth / 2}
                y={Math.min(y0, y1)}
                width={barWidth}
                height={Math.max(0.8, Math.abs(y1 - y0))}
                className={TONE_FILL[layer.tones[index] ?? layer.tones[layer.tones.length - 1]]}
              />
            )
          })}
        </g>
      )
    }
    case "text": {
      const anchor = layer.anchor ?? "middle"
      const lines = wrapText(layer.text, right - left)
      const w = Math.max(...lines.map((line) => textWidth(line)))
      const tx = fitX(x(layer.at[0]), w, anchor, left, right)
      return (
        <text x={tx} y={y(layer.at[1])} textAnchor={anchor} className={cn(textFill(layer.tone), "text-[11px] font-semibold")}>
          {lines.map((line, index) => (
            <tspan key={index} x={tx} dy={index === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      )
    }
  }
}

function PlacedLabel({
  text,
  cx,
  cy,
  r,
  pos = "above",
  tone,
  left,
  right,
}: {
  text: string
  cx: number
  cy: number
  r: number
  pos?: "above" | "below" | "left" | "right"
  tone: ChartTone
  left: number
  right: number
}) {
  const w = textWidth(text)
  let tx = cx
  let ty = cy - r - 5
  let anchor: "start" | "middle" | "end" = "middle"
  if (pos === "below") ty = cy + r + 13
  if (pos === "left") {
    tx = cx - r - 5
    ty = cy + 4
    anchor = "end"
  }
  if (pos === "right") {
    tx = cx + r + 5
    ty = cy + 4
    anchor = "start"
  }
  if (anchor === "start" && tx + w > right) {
    anchor = "end"
    tx = cx - r - 5
  } else if (anchor === "end" && tx - w < left) {
    anchor = "start"
    tx = cx + r + 5
  }
  tx = fitX(tx, w, anchor, left, right)
  return (
    <text x={tx} y={ty} textAnchor={anchor} className={cn(textFill(tone), "text-[11px] font-semibold")}>
      {text}
    </text>
  )
}
