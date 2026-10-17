/**
 * Collision-aware placement of the text annotations of a series_panels chart (point labels, notes, level, zone and
 * Fibonacci labels, shade labels). Each label offers candidate positions in order of preference; the first one that
 * stays inside the plot and clears the series, the markers and the labels already placed wins. When none is clear the
 * least bad one is used, so a label is never dropped.
 */

export type Anchor = "start" | "middle" | "end"
export type Box = { l: number; t: number; r: number; b: number }
/** `lines` overrides the request's lines at this position (a wrapped variant of a long label). */
export type Candidate = { x: number; y: number; anchor: Anchor; lines?: string[] }
/** A line the labels should not sit on. `owner` lets a label ignore its own line (a level label beside its level). */
export type Segment = { x1: number; y1: number; x2: number; y2: number; weight: number; owner?: string }
export type Obstacle = { box: Box; weight: number; owner?: string }

/** `lines` (default `[text]`) are drawn one under the other, the first baseline at the candidate's y. */
export type LabelRequest = { key: string; text: string; size: number; candidates: Candidate[]; owner?: string; lines?: string[] }
export type PlacedLabel = { key: string; text: string; lines: string[]; size: number; x: number; y: number; anchor: Anchor; box: Box }

/** Line height of a wrapped annotation, in multiples of the font size. */
export const LINE_HEIGHT = 1.2
/** Glyph width used for placement: a little wider than the 0.56em estimate, since annotations are often semibold. */
const GLYPH = 0.6
const PAD = 2

/** Width estimate of one annotation line, as used for placement. */
export function annotationWidth(text: string, size: number): number {
  return text.length * size * GLYPH
}

/** Box of a text (one or more lines) drawn with its first baseline at y. */
export function labelBox(text: string | readonly string[], size: number, x: number, y: number, anchor: Anchor, pad = PAD): Box {
  const lines = typeof text === "string" ? [text] : text
  const w = Math.max(0, ...lines.map((line) => annotationWidth(line, size)))
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2
  const extra = (lines.length - 1) * size * LINE_HEIGHT
  return { l: left - pad, r: left + w + pad, t: y - size * 0.8 - pad / 2, b: y + extra + size * 0.22 + pad / 2 }
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
  return w > 0 && h > 0 ? w * h : 0
}

/** Whether the segment crosses or lies inside the box (Liang-Barsky clipping). */
export function segmentHitsBox(s: Pick<Segment, "x1" | "y1" | "x2" | "y2">, box: Box): boolean {
  if (Math.max(s.x1, s.x2) < box.l || Math.min(s.x1, s.x2) > box.r) return false
  if (Math.max(s.y1, s.y2) < box.t || Math.min(s.y1, s.y2) > box.b) return false
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, s.x1 - box.l) && clip(dx, box.r - s.x1) && clip(-dy, s.y1 - box.t) && clip(dy, box.b - s.y1)
}

/** Segments of a polyline through the given points; a null point breaks the line. */
export function polylineSegments(points: readonly ([number, number] | null)[], weight: number, owner?: string): Segment[] {
  const segments: Segment[] = []
  for (let k = 1; k < points.length; k += 1) {
    const a = points[k - 1]
    const b = points[k]
    if (a && b) segments.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], weight, owner })
  }
  return segments
}

export type PlacementScene = { bounds: Box; segments: Segment[]; obstacles: Obstacle[] }

/** Cost of a label box: other labels and leaving the plot weigh most, then the series, then soft lines and marks. */
function cost(box: Box, owner: string | undefined, scene: PlacementScene, placed: PlacedLabel[]): number {
  let total = 0
  for (const other of placed) if (boxesOverlap(box, other.box)) total += 1000 + overlapArea(box, other.box)
  const { bounds } = scene
  const outside = Math.max(0, bounds.l - box.l) + Math.max(0, box.r - bounds.r) + Math.max(0, bounds.t - box.t) + Math.max(0, box.b - bounds.b)
  if (outside > 0) total += 500 + outside * 10
  for (const segment of scene.segments) {
    if (owner !== undefined && segment.owner === owner) continue
    if (segmentHitsBox(segment, box)) total += segment.weight
  }
  for (const obstacle of scene.obstacles) {
    if (owner !== undefined && obstacle.owner === owner) continue
    if (boxesOverlap(box, obstacle.box)) total += obstacle.weight
  }
  return total
}

function labelCost(box: Box, placed: PlacedLabel[]): number {
  let total = 0
  for (const other of placed) if (boxesOverlap(box, other.box)) total += 1000 + overlapArea(box, other.box)
  return total
}

/**
 * Greedy placement: each label takes its first candidate with the lowest cost given the labels placed before it, so
 * earlier requests (the most important labels) get the best spots. When that leaves a conflict, the greedy pass is
 * retried with each label moved to the front and the layout with the lowest total cost wins (one label giving way
 * often frees the spot two others were fighting over). Labels come back in request order.
 */
export function placeLabels(requests: LabelRequest[], scene: PlacementScene): PlacedLabel[] {
  // The cost against the scene does not depend on the order: compute it once per candidate.
  const options = requests.map((request) => {
    const fallback = request.lines ?? [request.text]
    return request.candidates.map((candidate) => {
      const lines = candidate.lines ?? fallback
      const box = labelBox(lines, request.size, candidate.x, candidate.y, candidate.anchor)
      const label: PlacedLabel = { key: request.key, text: request.text, size: request.size, x: candidate.x, y: candidate.y, anchor: candidate.anchor, lines, box }
      return { label, base: cost(box, request.owner, scene, []) }
    })
  })
  const greedy = (order: number[]) => {
    const placed: PlacedLabel[] = []
    const byRequest = new Map<number, PlacedLabel>()
    let total = 0
    for (const index of order) {
      let best: PlacedLabel | null = null
      let bestCost = Infinity
      for (const option of options[index]) {
        if (option.base >= bestCost) continue
        const c = option.base + labelCost(option.label.box, placed)
        if (c < bestCost) {
          bestCost = c
          best = option.label
          if (c === 0) break
        }
      }
      if (!best) continue
      placed.push(best)
      byRequest.set(index, best)
      total += bestCost
    }
    return { total, labels: requests.flatMap((_, index) => byRequest.get(index) ?? []) }
  }
  const natural = requests.map((_, index) => index)
  let best = greedy(natural)
  for (let first = 1; first < requests.length && best.total > 0; first += 1) {
    const attempt = greedy([first, ...natural.filter((index) => index !== first)])
    if (attempt.total < best.total) best = attempt
  }
  return best.labels
}

/* ------------------------------------------------------------------ candidate generators */

export type Side = "above" | "below" | "left" | "right"

/**
 * Positions around a marker at (cx, cy): the preferred side first, then the other sides, each at the corner
 * variants (a label above may hang to the right or the left of the marker), then the same farther out.
 */
export function aroundPoint(cx: number, cy: number, gap: number, size: number, prefer: Side = "above", lineCount = 1): Candidate[] {
  const extra = (lineCount - 1) * size * LINE_HEIGHT
  const sides: Side[] = [prefer, ...(["above", "below", "right", "left"] as Side[]).filter((side) => side !== prefer)]
  const candidates: Candidate[] = []
  for (const ring of [0, 1, 2, 3]) {
    const g = gap + ring * (size + 2)
    for (const side of sides) {
      if (side === "above") {
        const y = cy - g - extra
        candidates.push({ x: cx, y, anchor: "middle" }, { x: cx + 2, y, anchor: "start" }, { x: cx - 2, y, anchor: "end" })
      } else if (side === "below") {
        const y = cy + g + size * 0.8
        candidates.push({ x: cx, y, anchor: "middle" }, { x: cx + 2, y, anchor: "start" }, { x: cx - 2, y, anchor: "end" })
      } else {
        const x = side === "right" ? cx + g : cx - g
        const anchor: Anchor = side === "right" ? "start" : "end"
        const mid = cy + size * 0.32 - extra / 2
        candidates.push({ x, y: mid, anchor }, { x, y: mid - size * 0.7, anchor }, { x, y: mid + size * 0.7, anchor })
      }
    }
  }
  return candidates
}

/**
 * Positions beside a horizontal line at y spanning [left, right]: right above and below the line at the preferred
 * end, the other end and evenly spread positions in between, then a little farther from the line.
 */
export function alongLine(y: number, left: number, right: number, size: number, prefer: "start" | "end" = "start", lineCount = 1): Candidate[] {
  const extra = (lineCount - 1) * size * LINE_HEIGHT
  const inset = 4
  const ends: Candidate[] = [
    { x: left + inset, y: 0, anchor: "start" },
    { x: right - inset, y: 0, anchor: "end" },
  ]
  if (prefer === "end") ends.reverse()
  const inner: Candidate[] = [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875].map((f) => ({ x: left + (right - left) * f, y: 0, anchor: "middle" }))
  const xs = [...ends, ...inner]
  const candidates: Candidate[] = []
  for (const ring of [0, 1, 2]) {
    const above = y - 4 - ring * (size + 1) - extra
    const below = y + size * 0.8 + 4 + ring * (size + 1)
    for (const position of xs) {
      candidates.push({ ...position, y: above }, { ...position, y: below })
    }
  }
  return candidates
}

/** Positions for a zone label: inside the band at its top or bottom edge, then just outside it. */
export function inZone(top: number, bottom: number, left: number, right: number, size: number, lineCount = 1): Candidate[] {
  const extra = (lineCount - 1) * size * LINE_HEIGHT
  const inset = 4
  const xs: Candidate[] = [
    { x: left + inset, y: 0, anchor: "start" },
    { x: right - inset, y: 0, anchor: "end" },
    { x: (left + right) / 2, y: 0, anchor: "middle" },
    { x: left + (right - left) * 0.25, y: 0, anchor: "middle" },
    { x: left + (right - left) * 0.75, y: 0, anchor: "middle" },
  ]
  const ys = [
    top + size * 0.8 + 3,
    bottom - 4 - extra,
    top - 4 - extra,
    bottom + size * 0.8 + 4,
    top - 4 - (size + 1) - extra,
    bottom + size * 0.8 + 4 + size + 1,
  ]
  return ys.flatMap((y) => xs.map((position) => ({ ...position, y })))
}

/**
 * Lays labels centred over x spans out in rows (shade labels above the plot): a label moves along its span to
 * clear the previous one, else drops to the next row. Returns the row and the clamped centre of each label.
 */
export function stackRowLabels(
  labels: { text: string; size: number; center: number; min: number; max: number }[],
  width: number,
  gap = 6,
): { row: number; x: number }[] {
  const rows: Box[][] = []
  return labels.map((label) => {
    const w = label.text.length * label.size * 0.56
    const clamp = (center: number) => Math.min(Math.max(center, w / 2), width - w / 2)
    for (let row = 0; ; row += 1) {
      const used = (rows[row] ??= [])
      const fits = (center: number) => used.every((box) => center - w / 2 >= box.r + gap || center + w / 2 <= box.l - gap)
      let center = clamp(label.center)
      if (!fits(center)) {
        const blocker = used.reduce((r, box) => Math.max(r, box.r), -Infinity)
        const shifted = clamp(blocker + gap + w / 2)
        if (shifted <= Math.max(label.max, label.center) && fits(shifted)) center = shifted
        else continue
      }
      used.push({ l: center - w / 2, r: center + w / 2, t: 0, b: 0 })
      return { row, x: center }
    }
  })
}
