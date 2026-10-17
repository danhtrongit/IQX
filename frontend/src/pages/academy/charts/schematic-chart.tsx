import { useId } from "react"

import { cn } from "@/lib/utils"
import type { ChartTone } from "../content-types"
import { textWidth, wrapText, type SchematicLayer, type SchematicModel } from "./chart-math"
import { DASH, GRID_STROKE, LABEL_FILL, TONE_FILL, TONE_STROKE, textFill } from "./chart-theme"
import { NARROW_CHART_WIDTH, useChartWidth } from "./use-chart-width"

type Range = [number, number]
type Anchor = "start" | "middle" | "end"

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
const TICK_SIZE = 10.5
const ZONE_SIZE = 10.5
const NOTE_SIZE = 11
/** Below this share of the panel height a y band reads as a level range: hatched, with dashed edges. */
const THIN_BAND = 0.1

/** Moves an anchored label of width `w` so it stays within [lo, hi], keeping its anchor. */
function fitX(x: number, w: number, anchor: Anchor, lo: number, hi: number): number {
  const start = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x
  const shifted = Math.min(Math.max(start, lo), Math.max(lo, hi - w))
  return anchor === "middle" ? shifted + w / 2 : anchor === "end" ? shifted + w : shifted
}

/* ---------- label layout ---------- */

/**
 * Layout estimate of a semibold label: wider than `textWidth` (0.56em, the overflow check) so a
 * label placed clear of its neighbours stays clear in a real font with Vietnamese diacritics.
 */
const layoutWidth = (text: string, size: number) => textWidth(text, size) * 1.1

type Box = { x0: number; y0: number; x1: number; y1: number }
type Seg = [number, number, number, number]
type Placement = { lines: string[]; x: number; y: number; anchor: Anchor; size: number; gap: number; className: string }
type Scene = { boxes: Box[]; segs: Seg[]; bounds: Box }

function placementBox(p: Placement): Box {
  const w = Math.max(...p.lines.map((line) => layoutWidth(line, p.size)))
  const x0 = p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x
  return { x0, x1: x0 + w, y0: p.y - p.size * 0.8, y1: p.y + (p.lines.length - 1) * p.gap + p.size * 0.25 }
}

function overlapArea(a: Box, b: Box, pad = 1): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + pad
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + pad
  return w > 0 && h > 0 ? w * h : 0
}

/** Length of segment `s` inside box `b` (Liang-Barsky clipping). */
function clippedLength([x0, y0, x1, y1]: Seg, b: Box): number {
  const dx = x1 - x0
  const dy = y1 - y0
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, x0 - b.x0],
    [dx, b.x1 - x0],
    [-dy, y0 - b.y0],
    [dy, b.y1 - y0],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return 0
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return 0
  }
  return (t1 - t0) * Math.hypot(dx, dy)
}

/** Collision cost of a label box: leaving the drawing, covering a mark or a label, crossing a line. */
function boxCost(box: Box, scene: Scene): number {
  const { bounds } = scene
  const out = Math.max(0, bounds.x0 - box.x0) + Math.max(0, box.x1 - bounds.x1) + Math.max(0, bounds.y0 - box.y0) + Math.max(0, box.y1 - bounds.y1)
  let cost = out * 2000
  for (const other of scene.boxes) cost += overlapArea(box, other) * 40
  const padded = { x0: box.x0 - 1.5, y0: box.y0 - 1.5, x1: box.x1 + 1.5, y1: box.y1 + 1.5 }
  for (const seg of scene.segs) cost += clippedLength(seg, padded) * 60
  return cost
}

/** The cheapest candidate; earlier candidates win ties, so a clear authored position is kept. */
function choose(candidates: Placement[], scene: Scene): Placement {
  let best = candidates[0]
  let bestCost = Infinity
  candidates.forEach((candidate, index) => {
    const cost = boxCost(placementBox(candidate), scene) + index * 4
    if (cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  })
  return best
}

const POINT_ORDER = {
  above: ["above", "below", "right", "left"],
  below: ["below", "above", "right", "left"],
  left: ["left", "right", "above", "below"],
  right: ["right", "left", "above", "below"],
} as const

function pointCandidates(text: string, cx: number, cy: number, r: number, pos: keyof typeof POINT_ORDER, className: string, lo: number, hi: number): Placement[] {
  const w = layoutWidth(text, NOTE_SIZE)
  const make = (x: number, y: number, anchor: Anchor): Placement => ({
    lines: [text],
    x: fitX(x, w, anchor, lo, hi),
    y,
    anchor,
    size: NOTE_SIZE,
    gap: 13,
    className,
  })
  return POINT_ORDER[pos].flatMap((dir) => {
    switch (dir) {
      case "above":
        return [0, 14, 28].map((d) => make(cx, cy - r - 5 - d, "middle"))
      case "below":
        return [0, 14, 28].map((d) => make(cx, cy + r + 13 + d, "middle"))
      case "left":
        return [0, -12, 12, -24, 24].map((d) => make(cx - r - 5, cy + 4 + d, "end"))
      case "right":
        return [0, -12, 12, -24, 24].map((d) => make(cx + r + 5, cy + 4 + d, "start"))
    }
  })
}

type Geometry = {
  x: (v: number) => number
  yFor: (panel: number) => (v: number) => number
  tops: number[]
  panelHeight: number
  left: number
  right: number
}

function tagBox(layer: Extract<SchematicLayer, { t: "tag" }>, g: Geometry): Box {
  const cx = g.x(layer.at[0])
  const cy = g.yFor(layer.panel ?? 0)(layer.at[1])
  const w = textWidth(layer.text, 10.5) + 10
  const y0 = layer.pos === "above" ? cy - 26 : cy + 8
  const x0 = Math.min(Math.max(cx - w / 2, g.left), g.right - w)
  return { x0, y0, x1: x0 + w, y1: y0 + 18 }
}

function zoneRect(layer: Extract<SchematicLayer, { t: "zone" }>, g: Geometry): Box & { thin: boolean } {
  const panel = layer.panel ?? 0
  const top = g.tops[panel] ?? g.tops[0]
  const y = g.yFor(panel)
  const xa = layer.x ? g.x(layer.x[0]) : g.left
  const xb = layer.x ? g.x(layer.x[1]) : g.right
  const ya = layer.y ? y(layer.y[1]) : top
  const yb = layer.y ? y(layer.y[0]) : top + g.panelHeight
  const box = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: Math.min(ya, yb), y1: Math.max(ya, yb) }
  return { ...box, thin: Boolean(layer.y) && box.y1 - box.y0 < g.panelHeight * THIN_BAND }
}

/** Marks every label must keep clear of: lines, points, tags, bars, brackets and thin bands. */
function sceneMarks(layers: SchematicLayer[], g: Geometry): Pick<Scene, "boxes" | "segs"> {
  const boxes: Box[] = []
  const segs: Seg[] = []
  for (const layer of layers) {
    const y = g.yFor(layer.panel ?? 0)
    switch (layer.t) {
      case "line":
        layer.pts.slice(1).forEach((point, index) => segs.push([g.x(layer.pts[index][0]), y(layer.pts[index][1]), g.x(point[0]), y(point[1])]))
        break
      case "segment":
        segs.push([g.x(layer.from[0]), y(layer.from[1]), g.x(layer.to[0]), y(layer.to[1])])
        break
      case "point": {
        const r = POINT_RADIUS[layer.size ?? "m"] + 1
        const cx = g.x(layer.at[0])
        const cy = y(layer.at[1])
        boxes.push({ x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r })
        break
      }
      case "tag":
        boxes.push(tagBox(layer, g))
        break
      case "bracket": {
        const x0 = g.x(layer.x[0])
        const x1 = g.x(layer.x[1])
        const by = y(layer.y)
        segs.push([x0, by, x1, by], [x0, by - 5, x0, by], [x1, by - 5, x1, by])
        boxes.push(placementBox({ lines: [layer.label], x: (x0 + x1) / 2, y: by + 14, anchor: "middle", size: 10.5, gap: 13, className: "" }))
        break
      }
      case "bars":
        layer.x.forEach((value, index) => {
          const y0 = y(layer.base)
          const y1 = y(layer.base + (layer.h[index] ?? 0))
          boxes.push({ x0: g.x(value) - 1, x1: g.x(value) + 1, y0: Math.min(y0, y1), y1: Math.max(y0, y1) })
        })
        break
      case "zone": {
        const rect = zoneRect(layer, g)
        if (rect.thin) boxes.push(rect)
        break
      }
      case "text":
        break
    }
  }
  return { boxes, segs }
}

/**
 * Places every free label (text notes, point labels, zone labels) after the marks are known, each
 * at the cheapest of its candidate positions given the marks and the labels already placed.
 * Text notes go first since their position is authored, then point labels, then zone labels.
 */
function layoutLabels(layers: SchematicLayer[], g: Geometry, scene: Scene): Map<number, Placement> {
  const placed = new Map<number, Placement>()
  const commit = (index: number, placement: Placement) => {
    placed.set(index, placement)
    scene.boxes.push(placementBox(placement))
  }
  const plotWidth = g.right - g.left

  layers.forEach((layer, index) => {
    if (layer.t !== "text") return
    const anchor = layer.anchor ?? "middle"
    const tx = g.x(layer.at[0])
    const ty = g.yFor(layer.panel ?? 0)(layer.at[1])
    const className = cn(textFill(layer.tone), "text-[11px] font-semibold")
    const wraps = [wrapText(layer.text, plotWidth)]
    const narrower = wrapText(layer.text, Math.max(80, plotWidth * 0.55))
    if (narrower.length !== wraps[0].length) wraps.push(narrower)
    const make = (lines: string[], dy: number): Placement => {
      const w = Math.max(...lines.map((line) => layoutWidth(line, NOTE_SIZE)))
      return { lines, x: fitX(tx, w, anchor, g.left, g.right), y: ty + dy, anchor, size: NOTE_SIZE, gap: 13, className }
    }
    const steps = [[0, -13, 13], [-26, 26]]
    commit(index, choose(steps.flatMap((dys) => wraps.flatMap((lines) => dys.map((dy) => make(lines, dy)))), scene))
  })

  layers.forEach((layer, index) => {
    if (layer.t !== "point" || !layer.label) return
    const cx = g.x(layer.at[0])
    const cy = g.yFor(layer.panel ?? 0)(layer.at[1])
    const r = POINT_RADIUS[layer.size ?? "m"]
    const className = cn(textFill(layer.tone), "text-[11px] font-semibold")
    commit(index, choose(pointCandidates(layer.label, cx, cy, r, layer.pos ?? "above", className, g.left, g.right), scene))
  })

  // Full-height zones (phases of a cycle) share one row of labels, at the top or at the bottom.
  const phaseRows = new Map<number, number[]>()
  layers.forEach((layer, index) => {
    if (layer.t !== "zone" || !layer.label || layer.y) return
    const panel = layer.panel ?? 0
    phaseRows.set(panel, [...(phaseRows.get(panel) ?? []), index])
  })
  for (const [panel, indices] of phaseRows) {
    const top = g.tops[panel] ?? g.tops[0]
    const rows = { top: top + 13, bottom: top + g.panelHeight - 4 }
    const variants = (index: number, row: keyof typeof rows) => {
      const layer = layers[index] as Extract<SchematicLayer, { t: "zone" }>
      const rect = zoneRect(layer, g)
      const room = rect.x1 - rect.x0 - 8
      const label = layer.label as string
      const lines = layoutWidth(label, ZONE_SIZE) > room ? wrapText(label, room / 1.1, ZONE_SIZE, 2) : [label]
      const y = row === "top" ? rows.top : rows.bottom - (lines.length - 1) * 12
      const className = cn(textFill(layer.tone), "text-[10.5px] font-semibold")
      const at = { start: rect.x0 + 4, middle: (rect.x0 + rect.x1) / 2, end: rect.x1 - 4 }
      return (["start", "middle", "end"] as const).map((anchor): Placement => {
        const w = Math.max(...lines.map((line) => layoutWidth(line, ZONE_SIZE)))
        return { lines, x: fitX(at[anchor], w, anchor, g.left, g.right), y, anchor, size: ZONE_SIZE, gap: 12, className }
      })
    }
    const ALIGN = { start: 0, middle: 1, end: 2 } as const
    const configs: [keyof typeof rows, keyof typeof ALIGN | "mixed"][] = [
      ["top", "start"],
      ["top", "middle"],
      ["bottom", "middle"],
      ["top", "end"],
      ["bottom", "start"],
      ["bottom", "end"],
      ["top", "mixed"],
      ["bottom", "mixed"],
    ]
    let best: Placement[] = []
    let bestCost = Infinity
    configs.forEach(([row, align], rank) => {
      const trial: Scene = { ...scene, boxes: [...scene.boxes] }
      let cost = rank * 4
      const chosen = indices.map((index) => {
        const options = variants(index, row)
        const pick = align === "mixed" ? choose([options[1], options[0], options[2]], trial) : options[ALIGN[align]]
        cost += boxCost(placementBox(pick), trial)
        trial.boxes.push(placementBox(pick))
        return pick
      })
      if (cost < bestCost) {
        bestCost = cost
        best = chosen
      }
    })
    indices.forEach((index, k) => commit(index, best[k]))
  }

  // Bounded zones: inside when there is room, else beside the band, clear of the line through it.
  layers.forEach((layer, index) => {
    if (layer.t !== "zone" || !layer.label || !layer.y) return
    const rect = zoneRect(layer, g)
    const className = cn(textFill(layer.tone), "text-[10.5px] font-semibold")
    const w = layoutWidth(layer.label, ZONE_SIZE)
    const make = (x: number, y: number, anchor: Anchor): Placement => ({
      lines: [layer.label as string],
      x: fitX(x, w, anchor, g.left, g.right),
      y,
      anchor,
      size: ZONE_SIZE,
      gap: 12,
      className,
    })
    const mid = (rect.x0 + rect.x1) / 2
    const candidates: Placement[] = []
    if (rect.y1 - rect.y0 >= 18) candidates.push(make(rect.x0 + 4, rect.y0 + 13, "start"))
    for (const d of [0, 13, 26]) {
      for (const y of [rect.y1 + 12 + d, rect.y0 - 4 - d]) {
        candidates.push(make(mid, y, "start"), make(rect.x0, y, "start"), make(mid, y, "middle"), make(rect.x1, y, "end"))
      }
    }
    candidates.push(make(rect.x1 + 6, (rect.y0 + rect.y1) / 2 + 3.5, "start"), make(rect.x0 - 6, (rect.y0 + rect.y1) / 2 + 3.5, "end"))
    commit(index, choose(candidates, scene))
  })

  return placed
}

type Tick = { label: string; v: number }

/**
 * x tick labels that fit side by side: a label that would touch the previous one is skipped, and
 * the last tick is always kept (its neighbours give way instead).
 */
function thinXTicks(ticks: Tick[], x: (v: number) => number, width: number): (Tick & { cx: number })[] {
  const placed = ticks
    .map((tick) => {
      const w = layoutWidth(tick.label, TICK_SIZE)
      const cx = fitX(x(tick.v), w, "middle", 1, width - 1)
      return { ...tick, cx, x0: cx - w / 2, x1: cx + w / 2 }
    })
    .sort((a, b) => a.cx - b.cx)
  const kept: typeof placed = []
  for (const tick of placed) {
    const previous = kept[kept.length - 1]
    if (!previous || tick.x0 >= previous.x1 + 6) kept.push(tick)
  }
  const last = placed[placed.length - 1]
  if (last && kept[kept.length - 1] !== last) {
    while (kept.length && kept[kept.length - 1].x1 + 6 > last.x0) kept.pop()
    kept.push(last)
  }
  return kept.map(({ label, v, cx }) => ({ label, v, cx }))
}

/**
 * K5: a value-domain sketch (trend lines, support and resistance, divergence, cycles, payoff,
 * scatter). y grows upward. Optional stacked panels share the x domain. Axis arrows are drawn,
 * never typed. Free labels are laid out after the marks so none covers a mark or another label.
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
  const left = yTicks.length ? Math.max(...yTicks.map((tick) => textWidth(tick.label, TICK_SIZE))) + 12 : axes?.y ? 12 : 6
  const right = width - 8
  const titleTop = axes?.y?.title ? 18 : 6
  const panelHeight = panels.length > 1 ? (narrow ? 112 : 136) : narrow ? 190 : 224
  const panelGap = 22
  const tops = panels.map((_, index) => titleTop + index * (panelHeight + panelGap) + (panels[index].title ? 14 : 0))
  const plotBottom = tops[tops.length - 1] + panelHeight
  const x = (v: number) => left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * (right - left)
  const xTicks = thinXTicks(axes?.x?.ticks ?? [], x, width)
  const bottomPad = (xTicks.length ? 16 : 0) + (axes?.x?.title ? 18 : 0) + 6
  const height = plotBottom + bottomPad
  const yFor = (panel: number) => {
    const [lo, hi] = panelY[panel] ?? panelY[0]
    const top = tops[panel] ?? tops[0]
    return (v: number) => top + panelHeight - ((v - lo) / (hi - lo || 1)) * panelHeight
  }
  const arrowId = `${uid}-arrow`
  const geometry: Geometry = { x, yFor, tops, panelHeight, left, right }

  const marks = sceneMarks(model.layers, geometry)
  const fixedLabels: Placement[] = [
    ...xTicks.map((tick): Placement => ({ lines: [tick.label], x: tick.cx, y: plotBottom + 13, anchor: "middle", size: TICK_SIZE, gap: 13, className: "" })),
    ...yTicks.map((tick): Placement => ({ lines: [tick.label], x: left - 5, y: yFor(0)(tick.v) + 3.5, anchor: "end", size: TICK_SIZE, gap: 13, className: "" })),
    ...(axes?.y?.title ? [{ lines: [axes.y.title], x: left, y: 11, anchor: "start" as const, size: 11, gap: 13, className: "" }] : []),
    ...(axes?.x?.title ? [{ lines: [axes.x.title], x: right, y: height - 6, anchor: "end" as const, size: 11, gap: 13, className: "" }] : []),
    ...panels.flatMap((panel, index) => (panel.title ? [{ lines: [panel.title], x: left, y: tops[index] - 5, anchor: "start" as const, size: 11, gap: 13, className: "" }] : [])),
  ]
  if (axes?.x) marks.segs.push([left, plotBottom, right, plotBottom])
  if (axes?.y) marks.segs.push([left, plotBottom, left, titleTop])
  const scene: Scene = { boxes: [...marks.boxes, ...fixedLabels.map(placementBox)], segs: marks.segs, bounds: { x0: 1, y0: 1, x1: width - 1, y1: height - 1 } }
  const labels = layoutLabels(model.layers, geometry, scene)

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
        {xTicks.map((tick) => (
          <text key={tick.v} x={tick.cx} y={plotBottom + 13} textAnchor="middle" className={cn(LABEL_FILL, "text-[10.5px] tabular-nums")}>
            {tick.label}
          </text>
        ))}
        {axes?.x?.title && (
          <text x={right} y={height - 6} textAnchor="end" className={cn(LABEL_FILL, "text-[11px] font-semibold")}>
            {axes.x.title}
          </text>
        )}
        {model.layers.map((layer, index) => (
          <Layer key={index} layer={layer} geometry={geometry} arrowId={arrowId} hatchId={`${uid}-hatch-${index}`} />
        ))}
        {[...labels.entries()].map(([index, placement]) => (
          <PlacedText key={`label-${index}`} placement={placement} />
        ))}
      </svg>
    </div>
  )
}

function PlacedText({ placement }: { placement: Placement }) {
  const { lines, x, y, anchor, className, gap } = placement
  return (
    <text x={x} y={y} textAnchor={anchor} className={className}>
      {lines.length === 1
        ? lines[0]
        : lines.map((line, index) => (
            <tspan key={index} x={x} dy={index === 0 ? 0 : gap}>
              {line}
            </tspan>
          ))}
    </text>
  )
}

/** Shapes only: every text label of a layer is placed by `layoutLabels`. */
function Layer({ layer, geometry, arrowId, hatchId }: { layer: SchematicLayer; geometry: Geometry; arrowId: string; hatchId: string }) {
  const { x } = geometry
  const y = geometry.yFor(layer.panel ?? 0)
  switch (layer.t) {
    case "zone": {
      const rect = zoneRect(layer, geometry)
      const w = rect.x1 - rect.x0
      const h = rect.y1 - rect.y0
      if (!rect.thin) return <rect x={rect.x0} y={rect.y0} width={w} height={h} className={cn(TONE_FILL[layer.tone], "opacity-[0.12]")} />
      return (
        <g data-band="">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="1.6" className={TONE_STROKE[layer.tone]} />
            </pattern>
          </defs>
          <rect x={rect.x0} y={rect.y0} width={w} height={h} className={cn(TONE_FILL[layer.tone], "opacity-[0.16]")} />
          <rect x={rect.x0} y={rect.y0} width={w} height={h} fill={`url(#${hatchId})`} className="opacity-[0.55]" />
          {[rect.y0, rect.y1].map((edge) => (
            <line key={edge} x1={rect.x0} x2={rect.x1} y1={edge} y2={edge} strokeWidth="1" strokeDasharray={DASH} className={TONE_STROKE[layer.tone]} />
          ))}
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
        <circle
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth={ring ? 1.8 : 1}
          className={ring ? cn(TONE_STROKE[layer.tone], "fill-card") : cn(TONE_FILL[layer.tone], "stroke-card")}
        />
      )
    }
    case "tag": {
      const box = tagBox(layer, geometry)
      const w = box.x1 - box.x0
      return (
        <g>
          <rect x={box.x0} y={box.y0} width={w} height={18} rx="3" className={cn(TONE_FILL[layer.tone], "opacity-[0.16]")} />
          <rect x={box.x0} y={box.y0} width={w} height={18} rx="3" fill="none" strokeWidth="1" className={TONE_STROKE[layer.tone]} />
          <text x={box.x0 + w / 2} y={box.y0 + 12.5} textAnchor="middle" className={cn(textFill(layer.tone), "text-[10.5px] font-semibold")}>
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
    case "text":
      return null
  }
}
