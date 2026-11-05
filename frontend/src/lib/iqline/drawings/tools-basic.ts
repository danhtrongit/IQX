/**
 * Công cụ vẽ đợt 1 (docs/iqline-design.md §10): vị thế, vẽ tự do, chú thích, đo và hình.
 *
 * Mô tả, dựng lệnh vẽ, chọn hình, vị trí tay nắm và kéo tay nắm của 13 công cụ nằm cả ở đây để không đụng file của đợt khác. Các file
 * chung (`tools.ts`, `commands.ts`, `hit-test.ts`, `edit.ts`) chỉ gọi vào bằng `isBasicTool`, một type guard: nhánh còn lại của
 * `switch` ở đó vẫn được TypeScript kiểm tra đủ công cụ.
 *
 * Quy ước như `commands.ts`: `ScreenAnchor` tính theo CSS pixel, lệnh vẽ tính theo pixel thiết bị (nhân `dpr`), `count` là số phần tử dùng được
 * trong `data` (số thực), chữ dùng đường cơ sở tại `y`. Màu chỉ là tên token. Phẳng hoàn toàn: không glow, không gradient.
 *
 * File này KHÔNG nạp giá trị nào từ `tools.ts`, `commands.ts` hay `edit.ts` (chỉ nạp kiểu) để không tạo vòng nạp.
 */
import { wrapText, estimateText } from "../labels/text"
import type { Anchor, ColorToken, DrawCommand, Drawing, DrawingStyle, DrawingTool, PaneCoords } from "../types"
import { defaultFormatPrice } from "./fib"
import { distanceToRect, distanceToSegment, resolveAnchors, type ScreenAnchor, type ScreenPoint } from "./geometry"
import type { ToolSpec } from "./tools"

export type BasicTool =
  | "long-position"
  | "short-position"
  | "brush"
  | "arrow"
  | "arrow-up"
  | "arrow-down"
  | "price-label"
  | "callout"
  | "date-range"
  | "date-price-range"
  | "ellipse"
  | "triangle"
  | "path"

/** Thứ tự hiện trong menu của từng nhóm. */
export const BASIC_TOOLS: readonly BasicTool[] = [
  "long-position",
  "short-position",
  "brush",
  "arrow",
  "arrow-up",
  "arrow-down",
  "price-label",
  "callout",
  "date-range",
  "date-price-range",
  "ellipse",
  "triangle",
  "path",
]

const BASIC_SET: ReadonlySet<string> = new Set(BASIC_TOOLS)

export function isBasicTool(tool: DrawingTool): tool is BasicTool {
  return BASIC_SET.has(tool)
}

// ------------------------------------------------------------------ giới hạn và mô tả

/** Số điểm tối đa của một nét bút sau khi giản lược; 160 điểm lưu khoảng 6 KB. */
export const STROKE_MAX_POINTS = 160
/** Số điểm thô tối đa trong lúc đang kéo bút (chưa giản lược). */
export const STROKE_RAW_MAX = 2000
/** Số đỉnh tối đa của đường gấp khúc. */
export const PATH_MAX_POINTS = 64
/**
 * Tổng số điểm neo của mọi nét bút và đường gấp khúc trong một tài liệu. Một điểm lưu tối đa chừng 62 byte (đã làm tròn), nên 6.000
 * điểm là dưới 380 KB, chừa chỗ cho phần còn lại của tài liệu trong giới hạn 512 KB (`MAX_STATE_BYTES`).
 */
export const DOCUMENT_POINT_BUDGET = 6000
/** Tỷ lệ lời/lỗ mặc định của vị thế mới: chốt lời xa gấp đôi cắt lỗ. */
export const POSITION_DEFAULT_RR = 2

/** Làm tròn điểm neo trước khi lưu: giây nguyên, giá 4 chữ số lẻ, phiên 3 chữ số lẻ (đủ chính xác cho điểm vẽ tay). */
export function roundAnchor(anchor: Anchor): Anchor {
  const price = Math.round(anchor.price * 1e4) / 1e4
  return "time" in anchor ? { time: Math.round(anchor.time), price } : { session: Math.round(anchor.session * 1e3) / 1e3, price }
}

const withPrice = (anchor: Anchor, price: number): Anchor => ("time" in anchor ? { time: anchor.time, price } : { session: anchor.session, price })

/** Vị thế: bấm điểm vào rồi bấm điểm chốt lời; cắt lỗ tự đặt ở nửa khoảng cách, phía ngược lại (R:R = 2). Kéo tay nắm để đổi từng mức. */
function positionExpand(direction: 1 | -1) {
  return (clicks: readonly Anchor[]): Anchor[] => {
    const [entry, click] = clicks
    const reward = Math.max(Math.abs(click.price - entry.price), Math.abs(entry.price) * 0.005, 1e-6)
    return [entry, withPrice(click, entry.price - (direction * reward) / POSITION_DEFAULT_RR), withPrice(click, entry.price + direction * reward)]
  }
}

function make(tool: BasicTool, label: string, group: ToolSpec["group"], anchorCount: number, style: Partial<DrawingStyle>, extra: Partial<ToolSpec> = {}): ToolSpec {
  return { tool, label, group, anchorCount, defaultStyle: { color: "chart-2", width: 1.7, dash: "solid", ...style }, ...extra }
}

export const BASIC_TOOL_SPECS: Readonly<Record<BasicTool, ToolSpec>> = {
  "long-position": make("long-position", "Vị thế mua", "position", 3, { color: "chart-5", fill: true }, { clicks: 2, expand: positionExpand(1) }),
  "short-position": make("short-position", "Vị thế bán", "position", 3, { color: "chart-5", fill: true }, { clicks: 2, expand: positionExpand(-1) }),
  brush: make("brush", "Bút vẽ", "freehand", 2, { color: "chart-1", width: 2 }, { variable: { max: STROKE_MAX_POINTS, pendingMax: STROKE_RAW_MAX, stroke: true } }),
  arrow: make("arrow", "Mũi tên", "freehand", 2, { color: "chart-1", width: 2 }),
  "arrow-up": make("arrow-up", "Mũi tên lên", "freehand", 1, { color: "price-up" }),
  "arrow-down": make("arrow-down", "Mũi tên xuống", "freehand", 1, { color: "price-down" }),
  "price-label": make("price-label", "Nhãn giá", "annotation", 1, { color: "chart-1" }),
  callout: make("callout", "Hộp chú thích", "annotation", 2, { color: "chart-1", fill: true }),
  "date-range": make("date-range", "Khoảng thời gian", "measure", 2, { color: "chart-1", fill: true }),
  "date-price-range": make("date-price-range", "Khoảng giá và thời gian", "measure", 2, { color: "chart-1", fill: true }),
  ellipse: make("ellipse", "Hình elip", "shape", 2, { fill: true }),
  triangle: make("triangle", "Hình tam giác", "shape", 3, { fill: true }),
  path: make("path", "Đường gấp khúc", "shape", 2, {}, { variable: { max: PATH_MAX_POINTS, pendingMax: PATH_MAX_POINTS } }),
}

// ------------------------------------------------------------------ dựng lệnh vẽ

export type BasicCtx = {
  coords: PaneCoords
  plot: PaneCoords["plot"]
  dpr: number
  format: (price: number) => string
  selected: boolean
}

type Segment = readonly [number, number, number, number]

const FILL_ALPHA = 0.12
const POSITION_ALPHA = 0.16
const DASH: readonly number[] = [6, 4]
const SELECT_EXTRA_WIDTH = 0.9
const LABEL_SIZE = 11
const LABEL_WEIGHT = 600
/** Bề rộng chữ ước lượng cộng lề, dùng để dựng hộp quanh chữ. */
const textWidth = (value: string): number => estimateText(value, LABEL_SIZE, LABEL_WEIGHT)

function dashOf(style: DrawingStyle): readonly number[] | undefined {
  return style.dash === "dashed" ? DASH : undefined
}

function widthOf(style: DrawingStyle, ctx: BasicCtx): number {
  return style.width + (ctx.selected ? SELECT_EXTRA_WIDTH : 0)
}

function lines(token: ColorToken, width: number, segments: readonly Segment[], dpr: number, dash?: readonly number[], alpha?: number): DrawCommand[] {
  if (segments.length === 0) return []
  const data = new Float64Array(segments.length * 4)
  segments.forEach((segment, index) => {
    for (let k = 0; k < 4; k++) data[index * 4 + k] = segment[k] * dpr
  })
  return [{ op: "lines", token, alpha, width: width * dpr, dash: dash ? dash.map((value) => value * dpr) : undefined, data, count: data.length }]
}

function xy(points: readonly ScreenPoint[], dpr: number): Float64Array {
  const data = new Float64Array(points.length * 2)
  points.forEach((point, index) => {
    data[index * 2] = point.x * dpr
    data[index * 2 + 1] = point.y * dpr
  })
  return data
}

function polyline(token: ColorToken, width: number, points: readonly ScreenPoint[], dpr: number, dash?: readonly number[]): DrawCommand[] {
  if (points.length < 2) return []
  const data = xy(points, dpr)
  return [{ op: "polyline", token, width: width * dpr, dash: dash ? dash.map((value) => value * dpr) : undefined, data, count: data.length }]
}

function polygon(token: ColorToken, alpha: number, points: readonly ScreenPoint[], dpr: number): DrawCommand[] {
  if (points.length < 3) return []
  const data = xy(points, dpr)
  return [{ op: "polygon", token, alpha, data, count: data.length }]
}

function rect(token: ColorToken, alpha: number, x: number, y: number, width: number, height: number, dpr: number): DrawCommand[] {
  if (!(width > 0) || !(height > 0)) return []
  return [{ op: "rects", token, alpha, data: Float64Array.of(x * dpr, y * dpr, width * dpr, height * dpr), count: 4 }]
}

function label(token: ColorToken, value: string, x: number, y: number, align: "left" | "right" | "center", dpr: number, tabular = true): DrawCommand[] {
  if (!value) return []
  return [{ op: "text", token, text: value, x: x * dpr, y: y * dpr, align, size: LABEL_SIZE * dpr, weight: LABEL_WEIGHT, tabular }]
}

function dot(token: ColorToken, x: number, y: number, radius: number, dpr: number): DrawCommand {
  return { op: "circle", token, x: x * dpr, y: y * dpr, radius: radius * dpr, fill: true }
}

function closed(points: readonly ScreenPoint[]): ScreenPoint[] {
  return points.length > 0 ? [...points, points[0]] : []
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

// ---- số liệu hiển thị

function signedPercent(percent: number): string {
  const text = Math.abs(percent).toFixed(2).replace(".", ",")
  return `${percent > 0 ? "+" : percent < 0 ? "-" : ""}${text}%`
}

function signedPrice(delta: number, format: (price: number) => string): string {
  return `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${format(Math.abs(delta))}`
}

/**
 * Khoảng thời gian dạng chữ ("3 giờ 15 phút", "16 ngày", "5 tháng", "1,5 năm"). Chỉ là KHOẢNG, không bao giờ là ngày: `flashback` không
 * có `time` nên không có gì để lộ, và `market` cũng chỉ hiện độ dài.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 3600) return `${Math.round(total / 60)} phút`
  if (total < 86_400) {
    const hours = Math.floor(total / 3600)
    const minutes = Math.round((total % 3600) / 60)
    return minutes > 0 && minutes < 60 ? `${hours} giờ ${minutes} phút` : `${hours + (minutes === 60 ? 1 : 0)} giờ`
  }
  const days = Math.floor(total / 86_400)
  if (days < 90) {
    const hours = Math.floor((total % 86_400) / 3600)
    return days < 10 && hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`
  }
  const months = days / 30.4375
  if (months < 24) return `${Math.round(months)} tháng`
  return `${(days / 365.25).toFixed(1).replace(".", ",")} năm`
}

/** Số nến giữa hai điểm neo: luôn là số nguyên không âm. */
export function barCount(a: Pick<ScreenAnchor, "index">, b: Pick<ScreenAnchor, "index">): number {
  return Math.round(Math.abs(b.index - a.index))
}

/** Thời gian giữa hai điểm neo theo giây (Unix); null ở `flashback` (neo theo phiên, không có thời gian thật). */
function elapsedSeconds(a: ScreenAnchor, b: ScreenAnchor, coords: PaneCoords): number | null {
  const first = coords.anchorAt(a.index, a.price)
  const second = coords.anchorAt(b.index, b.price)
  if (!("time" in first) || !("time" in second)) return null
  const seconds = Math.abs(second.time - first.time)
  return Number.isFinite(seconds) ? seconds : null
}

/** "12 nến · 16 ngày"; ở `flashback` chỉ có số nến. */
export function rangeLabel(a: ScreenAnchor, b: ScreenAnchor, coords: PaneCoords): string {
  const bars = `${barCount(a, b)} nến`
  const seconds = elapsedSeconds(a, b, coords)
  return seconds === null ? bars : `${bars} · ${formatDuration(seconds)}`
}

/** "+1.230 (+4,80%)" của khoảng giá từ `a` đến `b`. */
export function priceRangeLabel(a: Pick<ScreenAnchor, "price">, b: Pick<ScreenAnchor, "price">, format: (price: number) => string): string {
  const delta = b.price - a.price
  const percent = a.price !== 0 ? (delta / Math.abs(a.price)) * 100 : 0
  return `${signedPrice(delta, format)} (${signedPercent(percent)})`
}

// ---- vị thế

export type PositionLevels = { left: number; right: number; entry: ScreenAnchor; stop: ScreenAnchor; target: ScreenAnchor }

export function positionLevels(points: readonly ScreenAnchor[]): PositionLevels | null {
  if (points.length < 3) return null
  const [entry, stop, target] = points
  return { left: Math.min(entry.x, stop.x), right: Math.max(entry.x, stop.x), entry, stop, target }
}

/** Nhãn của ba mức: giá, phần trăm so với điểm vào và R:R. `direction` 1 là mua, -1 là bán. */
export function positionLabels(direction: 1 | -1, entry: number, stop: number, target: number, format: (price: number) => string): { target: string; stop: string; entry: string; ratio: number | null } {
  const percentOf = (price: number) => (entry !== 0 ? ((direction * (price - entry)) / Math.abs(entry)) * 100 : 0)
  const risk = Math.abs(entry - stop)
  const ratio = risk > 0 ? Math.abs(target - entry) / risk : null
  const ratioText = ratio === null ? "-" : ratio.toFixed(2).replace(".", ",")
  return {
    target: `Chốt lời ${format(target)} (${signedPercent(percentOf(target))})`,
    stop: `Cắt lỗ ${format(stop)} (${signedPercent(percentOf(stop))})`,
    entry: `${direction === 1 ? "Mua" : "Bán"} ${format(entry)} · R:R ${ratioText}`,
    ratio,
  }
}

/** Dòng chữ của một mức đặt trong vùng tô nếu đủ cao, không thì đặt ngoài đường. `edge` là đường của mức, `base` là đường điểm vào. */
function zoneLabelY(edge: number, base: number): number {
  const roomy = Math.abs(edge - base) >= 22
  const edgeIsTop = edge < base
  if (roomy) return edgeIsTop ? edge + 14 : edge - 5
  return edgeIsTop ? edge - 5 : edge + 14
}

function positionCommands(direction: 1 | -1, points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  const levels = positionLevels(points)
  if (!levels) return []
  const { left, right, entry, stop, target } = levels
  const { dpr, plot } = ctx
  const width = widthOf(style, ctx)
  const top = Math.min(entry.y, stop.y, target.y)
  const bottom = Math.max(entry.y, stop.y, target.y)
  const texts = positionLabels(direction, entry.price, stop.price, target.price, ctx.format)
  const textX = Math.max(left, plot.left) + 6
  const entryY = target.y < entry.y ? entry.y - 5 : entry.y + 14
  return [
    ...(style.fill
      ? [
          ...rect("price-up", POSITION_ALPHA, left, Math.min(entry.y, target.y), right - left, Math.abs(entry.y - target.y), dpr),
          ...rect("price-down", POSITION_ALPHA, left, Math.min(entry.y, stop.y), right - left, Math.abs(entry.y - stop.y), dpr),
        ]
      : []),
    ...lines(style.color, 1, [[left, top, left, bottom], [right, top, right, bottom]], dpr, undefined, 0.55),
    ...lines("price-up", width, [[left, target.y, right, target.y]], dpr, dashOf(style)),
    ...lines("price-down", width, [[left, stop.y, right, stop.y]], dpr, dashOf(style)),
    ...lines(style.color, width, [[left, entry.y, right, entry.y]], dpr, dashOf(style)),
    ...label("price-up", texts.target, textX, zoneLabelY(target.y, entry.y), "left", dpr),
    ...label("price-down", texts.stop, textX, zoneLabelY(stop.y, entry.y), "left", dpr),
    ...label("foreground", texts.entry, textX, entryY, "left", dpr),
  ]
}

// ---- nét bút, đường gấp khúc

function strokeCommands(points: readonly ScreenPoint[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  return polyline(style.color, widthOf(style, ctx), points, ctx.dpr, dashOf(style))
}

// ---- mũi tên

function arrowHead(tip: ScreenPoint, from: ScreenPoint, size: number): ScreenPoint[] | null {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const length = Math.hypot(dx, dy)
  if (length < 1) return null
  const ux = dx / length
  const uy = dy / length
  const head = Math.min(size, length * 0.6)
  const baseX = tip.x - ux * head
  const baseY = tip.y - uy * head
  const half = head * 0.42
  return [tip, { x: baseX - uy * half, y: baseY + ux * half }, { x: baseX + uy * half, y: baseY - ux * half }]
}

function arrowCommands(points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const [from, tip] = points
  const head = arrowHead(tip, from, 9 + widthOf(style, ctx) * 2.2)
  if (!head) return []
  // Thân dừng ở đáy đầu mũi tên để đầu cùn của nét không nhô ra ngoài mũi.
  const baseX = (head[1].x + head[2].x) / 2
  const baseY = (head[1].y + head[2].y) / 2
  return [...lines(style.color, widthOf(style, ctx), [[from.x, from.y, baseX, baseY]], ctx.dpr, dashOf(style)), ...polygon(style.color, 1, head, ctx.dpr)]
}

/** Hình mũi tên một điểm, đỉnh ở gốc toạ độ. `direction` 1: thân nằm dưới đỉnh (mũi tên lên); -1: thân nằm trên đỉnh (mũi tên xuống). */
export function markerShape(direction: 1 | -1, scale: number): ScreenPoint[] {
  const base: [number, number][] = [[0, 0], [8, 9], [3.5, 9], [3.5, 20], [-3.5, 20], [-3.5, 9], [-8, 9]]
  return base.map(([x, y]) => ({ x: x * scale, y: y * scale * direction }))
}

const markerScale = (style: DrawingStyle): number => clamp(style.width / 1.7, 0.7, 1.8)

function markerPoints(tool: "arrow-up" | "arrow-down", anchor: ScreenPoint, style: DrawingStyle): ScreenPoint[] {
  // Mũi tên lên: đỉnh ở điểm neo, thân phía dưới (y tăng xuống dưới).
  return markerShape(tool === "arrow-up" ? 1 : -1, markerScale(style)).map((point) => ({ x: anchor.x + point.x, y: anchor.y + point.y }))
}

// ---- nhãn giá

const TAG_HEIGHT = 18
const TAG_GAP = 7

type Tag = { left: number; right: number; top: number; bottom: number; flip: boolean }

function tagLayout(anchor: ScreenPoint, text: string, plot: PaneCoords["plot"]): Tag {
  const width = textWidth(text) + 12
  const flip = anchor.x + TAG_GAP + width > plot.right && anchor.x - TAG_GAP - width >= plot.left
  const left = flip ? anchor.x - TAG_GAP - width : anchor.x + TAG_GAP
  return { left, right: left + width, top: anchor.y - TAG_HEIGHT / 2, bottom: anchor.y + TAG_HEIGHT / 2, flip }
}

function priceLabelCommands(anchor: ScreenAnchor, style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  const text = ctx.format(anchor.price)
  const tag = tagLayout(anchor, text, ctx.plot)
  const edge = tag.flip ? tag.right : tag.left
  const tip = tag.flip ? edge + 5 : edge - 5
  return [
    ...rect(style.color, 1, tag.left, tag.top, tag.right - tag.left, TAG_HEIGHT, ctx.dpr),
    ...polygon(style.color, 1, [{ x: tip, y: anchor.y }, { x: edge, y: anchor.y - 4.5 }, { x: edge, y: anchor.y + 4.5 }], ctx.dpr),
    dot(style.color, anchor.x, anchor.y, ctx.selected ? 3.5 : 2.5, ctx.dpr),
    ...label("background", text, tag.left + 6, anchor.y + 4, "left", ctx.dpr),
  ]
}

// ---- hộp chú thích

const CALLOUT_LINE = 14
const CALLOUT_PAD_X = 7
const CALLOUT_PAD_Y = 5
const CALLOUT_MAX_WIDTH = 160
const CALLOUT_MIN_WIDTH = 56
export const CALLOUT_PLACEHOLDER = "Ghi chú"

type Callout = { left: number; top: number; right: number; bottom: number; lines: string[] }

function calloutLayout(center: ScreenPoint, text: string | undefined): Callout {
  const value = text?.trim() ? text.trim() : CALLOUT_PLACEHOLDER
  const lines = wrapText(value, CALLOUT_MAX_WIDTH, LABEL_SIZE, 3, estimateText, LABEL_WEIGHT)
  const inner = Math.max(0, ...lines.map(textWidth))
  const width = Math.max(CALLOUT_MIN_WIDTH, inner + CALLOUT_PAD_X * 2)
  const height = lines.length * CALLOUT_LINE + CALLOUT_PAD_Y * 2 - 2
  return { left: center.x - width / 2, right: center.x + width / 2, top: center.y - height / 2, bottom: center.y + height / 2, lines }
}

function calloutCommands(points: readonly ScreenAnchor[], style: DrawingStyle, text: string | undefined, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const [target, center] = points
  const box = calloutLayout(center, text)
  const { dpr } = ctx
  const width = widthOf(style, ctx)
  const edge = { x: clamp(target.x, box.left, box.right), y: clamp(target.y, box.top, box.bottom) }
  const outside = target.x < box.left || target.x > box.right || target.y < box.top || target.y > box.bottom
  // Chưa có chữ thì hiện chữ gợi ý bằng màu mờ để hộp không trống và không giống chữ thật.
  const ink: ColorToken = text?.trim() ? "foreground" : "muted-foreground"
  return [
    ...rect("background", 0.92, box.left, box.top, box.right - box.left, box.bottom - box.top, dpr),
    ...(style.fill ? rect(style.color, FILL_ALPHA, box.left, box.top, box.right - box.left, box.bottom - box.top, dpr) : []),
    ...lines(style.color, width, [[box.left, box.top, box.right, box.top], [box.right, box.top, box.right, box.bottom], [box.right, box.bottom, box.left, box.bottom], [box.left, box.bottom, box.left, box.top]], dpr, dashOf(style)),
    ...(outside ? lines(style.color, width, [[edge.x, edge.y, target.x, target.y]], dpr) : []),
    dot(style.color, target.x, target.y, 3.5, dpr),
    ...box.lines.flatMap((line, index) => label(ink, line, box.left + CALLOUT_PAD_X, box.top + CALLOUT_PAD_Y + 10 + index * CALLOUT_LINE, "left", dpr, false)),
  ]
}

// ---- đo

function arrowSegments(from: ScreenPoint, to: ScreenPoint, size: number): Segment[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length < 1) return []
  const head = Math.min(size, length / 2)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const barb = (turn: number): Segment => [to.x, to.y, to.x - head * Math.cos(angle + turn), to.y - head * Math.sin(angle + turn)]
  return [[from.x, from.y, to.x, to.y], barb(0.45), barb(-0.45)]
}

function dateRangeCommands(points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const [a, b] = points
  const { plot, dpr } = ctx
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const width = widthOf(style, ctx)
  const midY = clamp((a.y + b.y) / 2, plot.top + 18, plot.bottom - 8)
  return [
    ...(style.fill ? rect(style.color, 0.08, left, plot.top, right - left, plot.bottom - plot.top, dpr) : []),
    ...lines(style.color, 1, [[left, plot.top, left, plot.bottom], [right, plot.top, right, plot.bottom]], dpr, DASH, 0.7),
    ...lines(style.color, width, [...arrowSegments({ x: left, y: midY }, { x: right, y: midY }, 7), ...arrowSegments({ x: right, y: midY }, { x: left, y: midY }, 7)], dpr),
    ...label(style.color, rangeLabel(a, b, ctx.coords), (left + right) / 2, midY - 6, "center", dpr),
  ]
}

function dateRangeDistance(points: readonly ScreenAnchor[], point: ScreenPoint, plot: PaneCoords["plot"]): number {
  const [a, b] = points
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  if (point.y < plot.top || point.y > plot.bottom) return Infinity
  const midY = clamp((a.y + b.y) / 2, plot.top + 18, plot.bottom - 8)
  const edge = Math.min(Math.abs(point.x - left), Math.abs(point.x - right))
  const arrow = distanceToSegment(point, { x: left, y: midY }, { x: right, y: midY })
  return Math.min(edge, arrow)
}

function datePriceRangeCommands(points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const [a, b] = points
  const { plot, dpr } = ctx
  const left = Math.min(a.x, b.x)
  const right = Math.max(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const bottom = Math.max(a.y, b.y)
  const width = widthOf(style, ctx)
  const midX = (left + right) / 2
  const midY = (top + bottom) / 2
  const delta = b.price - a.price
  const deltaToken: ColorToken = delta > 0 ? "price-up" : delta < 0 ? "price-down" : style.color
  // Nhãn hai dòng nằm trên cạnh trên; hết chỗ thì xuống dưới cạnh dưới.
  const above = top - 22 >= plot.top + 2
  const firstY = above ? top - 20 : bottom + 14
  return [
    ...(style.fill ? rect(style.color, 0.1, left, top, right - left, bottom - top, dpr) : []),
    ...lines(style.color, width, [[left, top, right, top], [right, top, right, bottom], [right, bottom, left, bottom], [left, bottom, left, top]], dpr, dashOf(style)),
    ...lines(style.color, 1, [...arrowSegments({ x: left, y: midY }, { x: right, y: midY }, 7), ...arrowSegments({ x: midX, y: a.y }, { x: midX, y: b.y }, 7)], dpr, undefined, 0.8),
    ...label(deltaToken, priceRangeLabel(a, b, ctx.format), midX, firstY, "center", dpr),
    ...label(style.color, rangeLabel(a, b, ctx.coords), midX, firstY + 14, "center", dpr),
  ]
}

// ---- hình

const ELLIPSE_STEPS = 48

function ellipsePoints(a: ScreenPoint, b: ScreenPoint): ScreenPoint[] {
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.abs(b.x - a.x) / 2
  const ry = Math.abs(b.y - a.y) / 2
  return Array.from({ length: ELLIPSE_STEPS }, (_, step) => {
    const angle = (step / ELLIPSE_STEPS) * Math.PI * 2
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
}

function ellipseCommands(points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const ring = ellipsePoints(points[0], points[1])
  return [...(style.fill ? polygon(style.color, FILL_ALPHA, ring, ctx.dpr) : []), ...polyline(style.color, widthOf(style, ctx), closed(ring), ctx.dpr, dashOf(style))]
}

function triangleCommands(points: readonly ScreenAnchor[], style: DrawingStyle, ctx: BasicCtx): DrawCommand[] {
  if (points.length < 2) return []
  const outline = points.length >= 3 ? closed(points) : [...points]
  return [...(style.fill ? polygon(style.color, FILL_ALPHA, points, ctx.dpr) : []), ...polyline(style.color, widthOf(style, ctx), outline, ctx.dpr, dashOf(style))]
}

// ------------------------------------------------------------------ vào chung

/** Lệnh vẽ của một công cụ đợt 1; chịu được hình chưa đủ điểm neo (bản xem trước). */
export function basicShapeCommands(tool: BasicTool, points: readonly ScreenAnchor[], style: DrawingStyle, text: string | undefined, ctx: BasicCtx): DrawCommand[] {
  const [p0] = points
  switch (tool) {
    case "long-position":
      return positionCommands(1, points, style, ctx)
    case "short-position":
      return positionCommands(-1, points, style, ctx)
    case "brush":
    case "path":
      return strokeCommands(points, style, ctx)
    case "arrow":
      return arrowCommands(points, style, ctx)
    case "arrow-up":
    case "arrow-down":
      return p0 ? polygon(style.color, 1, markerPoints(tool, p0, style), ctx.dpr) : []
    case "price-label":
      return p0 ? priceLabelCommands(p0, style, ctx) : []
    case "callout":
      return calloutCommands(points, style, text, ctx)
    case "date-range":
      return dateRangeCommands(points, style, ctx)
    case "date-price-range":
      return datePriceRangeCommands(points, style, ctx)
    case "ellipse":
      return ellipseCommands(points, style, ctx)
    case "triangle":
      return triangleCommands(points, style, ctx)
  }
}

// ------------------------------------------------------------------ chọn hình

function minDistanceToPolyline(point: ScreenPoint, points: readonly ScreenPoint[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(point, points[i - 1], points[i]))
  return best
}

function insidePolygon(point: ScreenPoint, ring: readonly ScreenPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Khoảng cách tới viền đa giác; 0 khi ở trong và `filled`. */
export function distanceToPolygon(point: ScreenPoint, ring: readonly ScreenPoint[], filled: boolean): number {
  if (filled && insidePolygon(point, ring)) return 0
  return minDistanceToPolyline(point, closed(ring))
}

/** Khoảng cách từ điểm bấm tới hình đợt 1 (Infinity nếu hình chưa đủ điểm). */
export function basicDistance(tool: BasicTool, drawing: Drawing, points: readonly ScreenAnchor[], point: ScreenPoint, coords: PaneCoords): number {
  const [p0, p1] = points
  const filled = drawing.style.fill === true
  switch (tool) {
    case "long-position":
    case "short-position": {
      const levels = positionLevels(points)
      if (!levels) return Infinity
      const { left, right, entry, stop, target } = levels
      const top = Math.min(stop.y, target.y, entry.y)
      const bottom = Math.max(stop.y, target.y, entry.y)
      const box = distanceToRect(point, { x: left, y: top }, { x: right, y: bottom }, filled)
      return Math.min(box, distanceToSegment(point, { x: left, y: entry.y }, { x: right, y: entry.y }))
    }
    case "brush":
    case "path":
      return minDistanceToPolyline(point, points)
    case "arrow":
      return p1 ? distanceToSegment(point, p0, p1) : Infinity
    case "arrow-up":
    case "arrow-down":
      return distanceToPolygon(point, markerPoints(tool, p0, drawing.style), true)
    case "price-label": {
      // Hộp nhãn giá phụ thuộc chữ; chọn hình dùng định dạng mặc định, sai khác với `formatPrice` của bên dùng chỉ là vài pixel.
      const tag = tagLayout(p0, defaultFormatPrice(p0.price), coords.plot)
      return Math.min(distanceToRect(point, { x: tag.left, y: tag.top }, { x: tag.right, y: tag.bottom }, true), Math.hypot(point.x - p0.x, point.y - p0.y))
    }
    case "callout": {
      if (!p1) return Infinity
      const box = calloutLayout(p1, drawing.text)
      const edge = { x: clamp(p0.x, box.left, box.right), y: clamp(p0.y, box.top, box.bottom) }
      return Math.min(distanceToRect(point, { x: box.left, y: box.top }, { x: box.right, y: box.bottom }, true), distanceToSegment(point, edge, p0))
    }
    case "date-range":
      return p1 ? dateRangeDistance(points, point, coords.plot) : Infinity
    case "date-price-range":
      return p1 ? distanceToRect(point, p0, p1, filled) : Infinity
    case "ellipse": {
      if (!p1) return Infinity
      const ring = ellipsePoints(p0, p1)
      return distanceToPolygon(point, ring, filled)
    }
    case "triangle":
      return points.length >= 3 ? distanceToPolygon(point, points, filled) : Infinity
  }
}

// ------------------------------------------------------------------ tay nắm

/** Bốn góc của hộp bao nét bút: trên trái, trên phải, dưới phải, dưới trái. */
export function strokeCorners(points: readonly ScreenPoint[]): ScreenPoint[] {
  if (points.length === 0) return []
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of points) {
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
    top = Math.min(top, point.y)
    bottom = Math.max(bottom, point.y)
  }
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
}

/**
 * Vị trí tay nắm khi KHÁC vị trí các điểm neo: vị thế (điểm vào, cắt lỗ và chốt lời ở mép phải) và nét bút (bốn góc hộp bao, để
 * co giãn cả nét). Công cụ khác trả null, tay nắm nằm đúng ở các điểm neo.
 */
export function basicHandlePoints(tool: BasicTool, points: readonly ScreenAnchor[]): ScreenPoint[] | null {
  if (tool === "long-position" || tool === "short-position") {
    const levels = positionLevels(points)
    if (!levels) return null
    const { entry, stop, target } = levels
    return [{ x: entry.x, y: entry.y }, { x: stop.x, y: stop.y }, { x: stop.x, y: target.y }]
  }
  if (tool === "brush") return strokeCorners(points)
  return null
}

/**
 * Kéo tay nắm của công cụ có tay nắm riêng; null thì nơi gọi dùng cách chung (đổi đúng điểm neo thứ `handle`).
 *
 * - Vị thế: điểm vào kéo đi mọi hướng nhưng giá nằm giữa cắt lỗ và chốt lời; cắt lỗ và chốt lời kéo ngang đổi chung mép phải, kéo dọc
 *   đổi giá của riêng mức đó (mua: cắt lỗ không cao hơn điểm vào, chốt lời không thấp hơn; bán thì ngược lại).
 * - Nét bút: kéo góc để co giãn cả nét quanh góc đối diện.
 *
 * `anchor` là điểm neo tại con trỏ (đã hút vào OHLC nếu bật nam châm).
 */
export function moveBasicHandle(tool: BasicTool, drawing: Drawing, handle: number, point: ScreenPoint, anchor: Anchor, coords: PaneCoords): Drawing | null {
  if (tool === "long-position" || tool === "short-position") {
    if (drawing.anchors.length < 3 || !Number.isInteger(handle) || handle < 0 || handle > 2) return drawing
    const direction = tool === "long-position" ? 1 : -1
    const [entry, stop, target] = drawing.anchors
    if (handle === 0) return { ...drawing, anchors: [withPrice(anchor, clamp(anchor.price, Math.min(stop.price, target.price), Math.max(stop.price, target.price))), stop, target] }
    // Mua: cắt lỗ không cao hơn điểm vào, chốt lời không thấp hơn. Bán thì ngược lại.
    if (handle === 1) {
      const price = direction === 1 ? Math.min(anchor.price, entry.price) : Math.max(anchor.price, entry.price)
      return { ...drawing, anchors: [entry, withPrice(anchor, price), withPrice(anchor, target.price)] }
    }
    const price = direction === 1 ? Math.max(anchor.price, entry.price) : Math.min(anchor.price, entry.price)
    return { ...drawing, anchors: [entry, withPrice(anchor, stop.price), withPrice(anchor, price)] }
  }
  if (tool === "brush") return scaleStroke(drawing, handle, point, coords)
  return null
}

function scaleStroke(drawing: Drawing, handle: number, point: ScreenPoint, coords: PaneCoords): Drawing {
  const resolved = resolveAnchors(drawing.anchors, coords)
  if (!resolved || !Number.isInteger(handle) || handle < 0 || handle > 3) return drawing
  const corners = strokeCorners(resolved)
  const corner = corners[handle]
  const fixed = corners[(handle + 2) % 4]
  const MIN_EXTENT = 4
  const scale = (current: number, target: number, origin: number): number => {
    const extent = current - origin
    if (Math.abs(extent) < 1) return 1
    const next = target - origin
    const bounded = Math.abs(next) < MIN_EXTENT ? Math.sign(extent) * MIN_EXTENT : next
    return bounded / extent
  }
  const sx = scale(corner.x, point.x, fixed.x)
  const sy = scale(corner.y, point.y, fixed.y)
  const anchors = resolved.map((entry) => {
    const x = fixed.x + (entry.x - fixed.x) * sx
    const y = fixed.y + (entry.y - fixed.y) * sy
    return roundAnchor(coords.anchorAt(coords.indexOfX(x), coords.priceOfY(y)))
  })
  return { ...drawing, anchors }
}

// ------------------------------------------------------------------ giản lược nét bút

function simplifyIndices(points: readonly ScreenPoint[], tolerance: number): number[] {
  const count = points.length
  if (count <= 2) return points.map((_, index) => index)
  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number]
    let worst = -1
    let farthest = tolerance
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(points[i], points[first], points[last])
      if (distance > farthest) {
        farthest = distance
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([first, worst], [worst, last])
    }
  }
  const kept: number[] = []
  keep.forEach((flag, index) => flag && kept.push(index))
  return kept
}

/** Bỏ bớt chỉ số cho đủ `limit`, giữ hai đầu, chia đều. */
function thin(indices: readonly number[], limit: number): number[] {
  if (indices.length <= limit) return [...indices]
  const out: number[] = []
  for (let k = 0; k < limit; k++) out.push(indices[Math.round((k * (indices.length - 1)) / (limit - 1))])
  return out
}

/** Giữ tối đa `limit` điểm (chia đều, giữ hai đầu) mà không cần toạ độ màn hình. */
export function capPoints<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items]
  return thin(items.map((_, index) => index), Math.max(2, limit)).map((index) => items[index])
}

/**
 * Giản lược nét bút (Ramer-Douglas-Peucker trên toạ độ màn hình, dung sai bắt đầu 1px và tăng dần) tới tối đa `limit` điểm, rồi làm tròn
 * để tài liệu nhỏ. Điểm giữ lại là điểm neo gốc (khoá `time` hay `session` nguyên vẹn), không dựng lại từ pixel.
 */
export function simplifyStroke(anchors: readonly Anchor[], coords: PaneCoords, limit: number = STROKE_MAX_POINTS): Anchor[] {
  const resolved = resolveAnchors(anchors, coords)
  if (!resolved) return capPoints(anchors, limit).map(roundAnchor)
  let tolerance = 1
  let kept = simplifyIndices(resolved, tolerance)
  while (kept.length > limit && tolerance < 128) {
    tolerance *= 1.5
    kept = simplifyIndices(resolved, tolerance)
  }
  return thin(kept, limit).map((index) => roundAnchor(anchors[index]))
}
