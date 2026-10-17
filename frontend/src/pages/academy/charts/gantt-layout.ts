import { textWidth, wrapText, type GanttModel } from "./chart-math"
import { NARROW_CHART_WIDTH } from "./use-chart-width"

/* Geometry of the K6a gantt chart, kept apart from the component so it can be unit tested. */

export type GanttRow = GanttModel["rows"][number]
type GanttMarker = NonNullable<GanttRow["markers"]>[number]

export const BAR_HEIGHT = 22
export const ROW_GAP = 10
export const NOTE_SIZE = 11
export const NOTE_LINE = 13
const HEADER_SIZE = 10.5
const PILL_SIZE = 11
/** Smallest size a column header shrinks to before it is allowed to touch its neighbour. */
const HEADER_MIN_SIZE = 8
/** A note beside the last marker needs at least this much room, or it goes under the row. */
const NOTE_MIN_SIDE = 72

/**
 * Semibold labels run wider than the 0.56em average `textWidth` assumes (wide glyphs like "m", "N",
 * capitals, stacked Vietnamese diacritics), so fit checks for bold text use a safer per-glyph width.
 */
const BOLD_EM = 0.66
export const boldWidth = (text: string, size: number) => text.length * size * BOLD_EM
/** `wrapText` budgets 0.56em per glyph; scale the width it is given so its lines fit at `BOLD_EM`. */
const wrapBold = (text: string, maxWidth: number, size: number, maxLines: number) => wrapText(text, (maxWidth * 0.56) / BOLD_EM, size, maxLines)

/**
 * Column headers at the largest size (10.5px down to 8px) where every label fits its column, on one
 * line or wrapped onto two. Below that the smallest size is used, wrapped.
 */
export function fitColumnHeaders(labels: readonly string[], columnWidth: number) {
  const room = columnWidth - 3
  const linesAt = (size: number) => labels.map((label) => (boldWidth(label, size) <= room ? [label] : wrapBold(label, room, size, 2)))
  for (let size = HEADER_SIZE; size > HEADER_MIN_SIZE; size -= 0.5) {
    const lines = linesAt(size)
    if (lines.every((group) => group.every((line) => boldWidth(line, size) <= room))) return { size, lines }
  }
  return { size: HEADER_MIN_SIZE, lines: linesAt(HEADER_MIN_SIZE) }
}

/**
 * Width of the row-name column. Wide charts keep names on one line (up to 96px); narrow ones let a
 * name wrap onto two lines so the day/time columns get the room.
 */
export function rowNameWidth(names: readonly string[], width: number) {
  if (width >= NARROW_CHART_WIDTH) return Math.min(96, Math.max(56, width * 0.22, ...names.map((name) => Math.min(textWidth(name) + 8, 96))))
  const need = (name: string) => {
    for (let w = 40; w < 96; w += 2) {
      if (wrapText(name, w, 11, 2).every((line) => boldWidth(line, 11) * 0.95 <= w)) return w
    }
    return 96
  }
  return Math.max(44, ...names.map(need))
}

/**
 * A row whose bars are all muted and that carries markers is a span between dates (the T+2
 * calendar): the markers are drawn as pills on the row and the muted bar as a dashed connector, the
 * way the mockup draws it, instead of a grey bar that disappears on a dark card.
 */
export const isSpanRow = (row: GanttRow) => Boolean(row.markers?.length) && row.segments.every((segment) => segment.muted)

export type PillBox = { marker: GanttMarker; cx: number; x: number; w: number }

/**
 * Pills centred on their date, kept inside [minX, maxX] and nudged apart left to right so two
 * neighbouring pills never print on top of each other (spec §5: no overlapping text at 390px).
 */
export function layoutPills(markers: readonly GanttMarker[], at: (v: number) => number, minX: number, maxX: number, gap = 3): PillBox[] {
  const boxes = markers
    .map((marker) => {
      const w = Math.max(BAR_HEIGHT, textWidth(marker.text, PILL_SIZE) + 12)
      const cx = at(marker.at)
      return { marker, cx, x: cx - w / 2, w }
    })
    .sort((a, b) => a.cx - b.cx)
  for (const box of boxes) box.x = Math.min(Math.max(box.x, minX), maxX - box.w)
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]
    boxes[index].x = Math.max(boxes[index].x, previous.x + previous.w + gap)
  }
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const next = boxes[index + 1]
    const limit = next ? next.x - gap : maxX
    if (boxes[index].x + boxes[index].w > limit) boxes[index].x = limit - boxes[index].w
  }
  return boxes
}

/** Where a row's note goes: beside its last pill when there is room, otherwise under the row. */
export function placeNote(row: GanttRow, pills: PillBox[], width: number, left: number) {
  if (!row.note) return null
  const lastPill = pills[pills.length - 1]
  if (lastPill) {
    const sideX = lastPill.x + lastPill.w + 8
    const room = width - 4 - sideX
    if (room >= NOTE_MIN_SIDE) {
      const lines = wrapText(row.note, room, NOTE_SIZE, 3)
      if (lines.every((line) => textWidth(line, NOTE_SIZE) <= room)) return { side: true as const, x: sideX, lines }
    }
    return { side: false as const, x: Math.min(left, lastPill.x), lines: wrapText(row.note, width - 4 - Math.min(left, lastPill.x), NOTE_SIZE) }
  }
  return { side: false as const, x: 0, lines: wrapText(row.note, width - 12, NOTE_SIZE) }
}
