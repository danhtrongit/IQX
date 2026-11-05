/**
 * Dựng lệnh vẽ (`DrawCommand[]`) từ hình vẽ và phép đổi toạ độ của ô giá. Hàm thuần, không chạm DOM.
 *
 * Quy ước: `PaneCoords` tính theo CSS pixel, còn lệnh vẽ tính theo pixel thiết bị nên mọi toạ độ, độ dày, bán kính,
 * nét đứt và cỡ chữ đều nhân với `dpr` (mặc định 1). `count` của mỗi lệnh là số phần tử dùng được trong `data` (số thực), đúng hợp đồng của `DrawCommand` và của `paintScene`:
 * 4 cho mỗi đoạn hoặc hình chữ nhật, 2 cho mỗi đỉnh.
 * Chữ dùng đường cơ sở (baseline) tại `y`.
 */
import { annotationWidth, placeLabels, type LabelRequest } from "../labels/placement"
import type { Anchor, ColorToken, DrawCommand, Drawing, DrawingStyle, DrawingTool, PaneCoords } from "../types"
import {
  FIB_EXTENSION_LEVELS,
  FIB_RETRACEMENT_LEVELS,
  FIB_ZONE,
  FIB_ZONE_TOKEN,
  defaultFormatPrice,
  fibExtensionPrice,
  fibLabel,
  fibRetracementPrice,
  type FibLevel,
} from "./fib"
import { clipLine, resolveAnchors, type ScreenAnchor, type ScreenPoint } from "./geometry"
import type { PendingDrawing } from "./state"
import { advancedCommands } from "./tools-advanced"
import { TOOL_SPECS } from "./tools"
import { basicHandlePoints, basicShapeCommands, isBasicTool } from "./tools-basic"

export type DrawingRenderOptions = {
  /** Định dạng giá của nhãn; mặc định theo vi-VN. */
  formatPrice?: (price: number) => string
  dpr?: number
  /** Hình đang chọn được vẽ đậm hơn. */
  selectedId?: string | null
}

const FILL_ALPHA = 0.12
const ZONE_ALPHA = 0.1
const DASH: readonly number[] = [6, 4]
const SELECT_EXTRA_WIDTH = 0.9
const HANDLE_DRAW_RADIUS = 5

type Segment = readonly [number, number, number, number]

type Ctx = {
  coords: PaneCoords
  plot: PaneCoords["plot"]
  dpr: number
  format: (price: number) => string
  selected: boolean
}

function dashOf(style: DrawingStyle): readonly number[] | undefined {
  return style.dash === "dashed" ? DASH : undefined
}

function lines(token: ColorToken, width: number, segments: readonly Segment[], dpr: number, dash?: readonly number[]): DrawCommand[] {
  if (segments.length === 0) return []
  const data = new Float64Array(segments.length * 4)
  segments.forEach((segment, index) => {
    for (let k = 0; k < 4; k++) data[index * 4 + k] = segment[k] * dpr
  })
  return [{ op: "lines", token, width: width * dpr, dash: dash ? dash.map((value) => value * dpr) : undefined, data, count: data.length }]
}

function polyline(token: ColorToken, width: number, points: readonly ScreenPoint[], dpr: number): DrawCommand[] {
  if (points.length < 2) return []
  const data = new Float64Array(points.length * 2)
  points.forEach((point, index) => {
    data[index * 2] = point.x * dpr
    data[index * 2 + 1] = point.y * dpr
  })
  return [{ op: "polyline", token, width: width * dpr, data, count: data.length }]
}

function polygon(token: ColorToken, alpha: number, points: readonly ScreenPoint[], dpr: number): DrawCommand[] {
  if (points.length < 3) return []
  const data = new Float64Array(points.length * 2)
  points.forEach((point, index) => {
    data[index * 2] = point.x * dpr
    data[index * 2 + 1] = point.y * dpr
  })
  return [{ op: "polygon", token, alpha, data, count: data.length }]
}

function rect(token: ColorToken, alpha: number, x: number, y: number, width: number, height: number, dpr: number): DrawCommand[] {
  if (width <= 0 || height <= 0) return []
  return [{ op: "rects", token, alpha, data: Float64Array.of(x * dpr, y * dpr, width * dpr, height * dpr), count: 4 }]
}

function text(
  token: ColorToken,
  value: string,
  x: number,
  y: number,
  align: "left" | "right" | "center",
  dpr: number,
  tabular = false,
): DrawCommand[] {
  if (!value) return []
  return [{ op: "text", token, text: value, x: x * dpr, y: y * dpr, align, size: 11 * dpr, weight: 600, tabular }]
}

function widthOf(style: DrawingStyle, ctx: Ctx): number {
  return style.width + (ctx.selected ? SELECT_EXTRA_WIDTH : 0)
}

/** Cỡ chữ của nhãn mức Fibonacci (CSS pixel), khớp `text()`. */
const FIB_LABEL_SIZE = 11
/** Số cột tối đa mà nhãn được dời sang phải khi các mức quá sát nhau. */
const FIB_LABEL_COLUMNS = 7

function fibLevels(
  levels: readonly FibLevel[],
  priceAt: (level: number) => number,
  left: number,
  style: DrawingStyle,
  ctx: Ctx,
): DrawCommand[] {
  const out: DrawCommand[] = []
  const base = style.width * 0.65 + (ctx.selected ? 0.7 : 0)
  const rows: { token: ColorToken; y: number; label: string }[] = []
  for (const { level, token } of levels) {
    const price = priceAt(level)
    const y = ctx.coords.yOfPrice(price)
    if (!Number.isFinite(y)) continue
    out.push(...lines(token, base, [[left, y, ctx.plot.right, y]], ctx.dpr))
    rows.push({ token, y, label: fibLabel(level, price, ctx.format) })
  }
  // Khoảng giá hẹp thì các mức sát nhau hơn một dòng chữ: nhãn nào đè lên nhãn đứng trước thì dời sang cột bên phải (vẫn nằm trên
  // đường của nó). Khoảng giá bình thường thì mọi nhãn ở cột đầu như cũ.
  const step = Math.max(0, ...rows.map((row) => annotationWidth(row.label, FIB_LABEL_SIZE, undefined, 600))) + 10
  const requests: LabelRequest[] = rows.map((row, index) => ({
    key: String(index),
    text: row.label,
    size: FIB_LABEL_SIZE,
    weight: 600,
    candidates: Array.from({ length: FIB_LABEL_COLUMNS }, (_, column) => ({ x: left + 4 + column * step, y: row.y - 3, anchor: "start" as const })),
  }))
  const { plot } = ctx
  const placed = placeLabels(requests, { bounds: { l: plot.left, t: plot.top, r: plot.right, b: plot.bottom }, segments: [], obstacles: [], pad: 0 })
  for (const label of placed) out.push(...text(rows[Number(label.key)].token, label.text, label.x, label.y, "left", ctx.dpr, true))
  return out
}

function signed(value: number, text: string): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${text}`
}

/** Nhãn của thước đo: "+1.230 (+4,80%) · 12 nến". */
export function measureLabel(a: Pick<ScreenAnchor, "price" | "index">, b: Pick<ScreenAnchor, "price" | "index">, format: (price: number) => string): string {
  const delta = b.price - a.price
  const percent = a.price !== 0 ? (delta / Math.abs(a.price)) * 100 : 0
  const bars = Math.round(Math.abs(b.index - a.index))
  const percentText = Math.abs(percent).toFixed(2).replace(".", ",")
  return `${signed(delta, format(Math.abs(delta)))} (${signed(percent, percentText)}%) · ${bars} nến`
}

function elliottLabels(points: readonly ScreenAnchor[], names: readonly string[], style: DrawingStyle, ctx: Ctx): DrawCommand[] {
  const out: DrawCommand[] = []
  for (let i = 1; i < points.length && i - 1 < names.length; i++) {
    const rising = points[i].y <= points[i - 1].y
    out.push(...text(style.color, names[i - 1], points[i].x, points[i].y + (rising ? -8 : 15), "center", ctx.dpr))
  }
  return out
}

/** Lệnh vẽ của một hình, chịu được hình chưa đủ điểm neo (bản xem trước khi đang vẽ). */
function shapeCommands(tool: DrawingTool, points: readonly ScreenAnchor[], style: DrawingStyle, noteText: string | undefined, ctx: Ctx): DrawCommand[] {
  // Đợt 1 (vị thế, vẽ tự do, chú thích, đo, hình): nằm trọn trong tools-basic.ts. Type guard thu hẹp `tool` cho `switch` bên dưới.
  if (isBasicTool(tool)) return basicShapeCommands(tool, points, style, noteText, ctx)
  const { plot, dpr } = ctx
  const dash = dashOf(style)
  const width = widthOf(style, ctx)
  const [p0, p1, p2] = points
  switch (tool) {
    case "trend":
      return p1 ? lines(style.color, width, [[p0.x, p0.y, p1.x, p1.y]], dpr, dash) : []
    case "ray":
    case "extended": {
      if (!p1) return []
      const clipped = clipLine(p0, p1, plot, tool === "ray" ? "forward" : "both")
      return clipped ? lines(style.color, width, [clipped], dpr, dash) : []
    }
    case "horizontal":
      return [
        ...lines(style.color, width, [[plot.left, p0.y, plot.right, p0.y]], dpr, dash),
        ...text(style.color, ctx.format(p0.price), plot.right - 6, p0.y - 4, "right", dpr, true),
      ]
    case "horizontal-ray":
      return p0.x > plot.right
        ? []
        : [
            ...lines(style.color, width, [[Math.max(p0.x, plot.left), p0.y, plot.right, p0.y]], dpr, dash),
            ...text(style.color, ctx.format(p0.price), plot.right - 6, p0.y - 4, "right", dpr, true),
          ]
    case "vertical":
      return lines(style.color, width, [[p0.x, plot.top, p0.x, plot.bottom]], dpr, dash)
    case "channel": {
      if (!p1) return []
      const main: Segment = [p0.x, p0.y, p1.x, p1.y]
      if (!p2) return lines(style.color, width, [main], dpr, dash)
      // Đường song song đi qua điểm thứ ba: dịch dọc, hoặc dịch ngang khi đường gốc thẳng đứng.
      const run = p1.x - p0.x
      const shift: ScreenPoint = run === 0 ? { x: p2.x - p0.x, y: 0 } : { x: 0, y: p2.y - (p0.y + ((p2.x - p0.x) * (p1.y - p0.y)) / run) }
      const second: Segment = [p0.x + shift.x, p0.y + shift.y, p1.x + shift.x, p1.y + shift.y]
      return [
        ...(style.fill
          ? polygon(style.color, FILL_ALPHA, [{ x: main[0], y: main[1] }, { x: main[2], y: main[3] }, { x: second[2], y: second[3] }, { x: second[0], y: second[1] }], dpr)
          : []),
        ...lines(style.color, width, [main, second], dpr, dash),
      ]
    }
    case "fib-retracement": {
      if (!p1) return []
      const left = Math.min(p0.x, p1.x)
      const priceAt = (level: number) => fibRetracementPrice(p0.price, p1.price, level)
      const zoneA = ctx.coords.yOfPrice(priceAt(FIB_ZONE[0]))
      const zoneB = ctx.coords.yOfPrice(priceAt(FIB_ZONE[1]))
      return [
        ...rect(FIB_ZONE_TOKEN, ZONE_ALPHA, left, Math.min(zoneA, zoneB), plot.right - left, Math.abs(zoneA - zoneB), dpr),
        ...lines(style.color, 1, [[p0.x, p0.y, p1.x, p1.y]], dpr, DASH),
        ...fibLevels(FIB_RETRACEMENT_LEVELS, priceAt, left, style, ctx),
      ]
    }
    case "fib-extension": {
      if (!p1) return []
      const connectors: Segment[] = [[p0.x, p0.y, p1.x, p1.y]]
      if (p2) connectors.push([p1.x, p1.y, p2.x, p2.y])
      return [
        ...lines(style.color, 1, connectors, dpr, DASH),
        ...(p2 ? fibLevels(FIB_EXTENSION_LEVELS, (level) => fibExtensionPrice(p0.price, p1.price, p2.price, level), Math.min(p1.x, p2.x), style, ctx) : []),
      ]
    }
    case "rectangle": {
      if (!p1) return []
      const left = Math.min(p0.x, p1.x)
      const right = Math.max(p0.x, p1.x)
      const top = Math.min(p0.y, p1.y)
      const bottom = Math.max(p0.y, p1.y)
      return [
        ...(style.fill ? rect(style.color, FILL_ALPHA, left, top, right - left, bottom - top, dpr) : []),
        ...lines(style.color, width, [[left, top, right, top], [right, top, right, bottom], [right, bottom, left, bottom], [left, bottom, left, top]], dpr, dash),
      ]
    }
    case "elliott-5":
      return [...polyline(style.color, width, points, dpr), ...elliottLabels(points, ["1", "2", "3", "4", "5"], style, ctx)]
    case "elliott-abc":
      return [...polyline(style.color, width, points, dpr), ...elliottLabels(points, ["A", "B", "C"], style, ctx)]
    case "note":
      return [
        { op: "circle", token: style.color, x: p0.x * dpr, y: p0.y * dpr, radius: 3.5 * dpr, fill: true },
        ...text(style.color, noteText ?? "", p0.x + 8, p0.y + 4, "left", dpr),
      ]
    case "measure": {
      if (!p1) return []
      const left = Math.min(p0.x, p1.x)
      const right = Math.max(p0.x, p1.x)
      const top = Math.min(p0.y, p1.y)
      const bottom = Math.max(p0.y, p1.y)
      const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
      const head = (turn: number): Segment => [p1.x, p1.y, p1.x - 8 * Math.cos(angle + turn), p1.y - 8 * Math.sin(angle + turn)]
      const labelY = Math.min(Math.max(top - 6, plot.top + 12), plot.bottom - 4)
      return [
        ...(style.fill ? rect(style.color, ZONE_ALPHA, left, top, right - left, bottom - top, dpr) : []),
        ...lines(style.color, width, [[p0.x, p0.y, p1.x, p1.y], head(0.45), head(-0.45)], dpr),
        ...text(style.color, measureLabel(p0, p1, ctx.format), (left + right) / 2, labelY, "center", dpr, true),
      ]
    }
    // Đợt 2 (Fibonacci, Pitchfork, Gann, mẫu hình): hình học nằm trọn trong tools-advanced.ts.
    case "fib-time-zones":
    case "fib-fan":
    case "fib-channel":
    case "pitchfork":
    case "gann-fan":
    case "gann-box":
    case "xabcd":
    case "head-shoulders":
    case "triangle-pattern":
      return advancedCommands(tool, points, style, ctx)
  }
}

function contextOf(coords: PaneCoords, options: DrawingRenderOptions, selected: boolean): Ctx {
  return { coords, plot: coords.plot, dpr: options.dpr ?? 1, format: options.formatPrice ?? defaultFormatPrice, selected }
}

function clipOf(coords: PaneCoords, dpr: number): DrawCommand {
  const { plot } = coords
  return { op: "clip", x: plot.left * dpr, y: plot.top * dpr, width: (plot.right - plot.left) * dpr, height: (plot.bottom - plot.top) * dpr }
}

/** Hình đủ điểm neo và không ẩn thì được vẽ và được chọn. */
export function isRenderable(drawing: Pick<Drawing, "tool" | "anchors" | "hidden">): boolean {
  return !drawing.hidden && drawing.anchors.length >= TOOL_SPECS[drawing.tool].anchorCount
}

/** Lệnh vẽ cho lớp "drawings": mọi hình hiện, cắt trong khung vẽ. Hình không đổi được toạ độ thì bỏ qua. */
export function drawingCommands(drawings: readonly Drawing[], coords: PaneCoords, options: DrawingRenderOptions = {}): DrawCommand[] {
  const body: DrawCommand[] = []
  for (const drawing of drawings) {
    if (!isRenderable(drawing)) continue
    const points = resolveAnchors(drawing.anchors, coords)
    if (!points) continue
    const ctx = contextOf(coords, options, drawing.id === options.selectedId)
    body.push(...shapeCommands(drawing.tool, points, drawing.style, drawing.text, ctx))
  }
  if (body.length === 0) return []
  return [clipOf(coords, options.dpr ?? 1), ...body, { op: "unclip" }]
}

function handleCircles(points: readonly ScreenPoint[], color: ColorToken, dpr: number): DrawCommand[] {
  return points.flatMap((point): DrawCommand[] => [
    { op: "circle", token: "background", x: point.x * dpr, y: point.y * dpr, radius: HANDLE_DRAW_RADIUS * dpr, fill: true },
    { op: "circle", token: color, x: point.x * dpr, y: point.y * dpr, radius: HANDLE_DRAW_RADIUS * dpr, fill: false, width: 2 * dpr },
  ])
}

/** Tay nắm của hình đang chọn, cho lớp "top". Hình khoá không có tay nắm. */
export function handleCommands(drawing: Drawing | null | undefined, coords: PaneCoords, options: DrawingRenderOptions = {}): DrawCommand[] {
  if (!drawing || drawing.locked || !isRenderable(drawing)) return []
  const points = resolveAnchors(drawing.anchors, coords)
  if (!points) return []
  const own = isBasicTool(drawing.tool) ? basicHandlePoints(drawing.tool, points) : null
  return handleCircles(own ?? points, drawing.style.color, options.dpr ?? 1)
}

/** Bản xem trước khi đang vẽ: các điểm đã bấm cộng điểm con trỏ, kèm tay nắm ở các điểm đã bấm. Cho lớp "top". */
export function previewCommands(
  pending: PendingDrawing | null | undefined,
  cursor: Anchor | null | undefined,
  coords: PaneCoords,
  options: DrawingRenderOptions = {},
): DrawCommand[] {
  if (!pending) return []
  const spec = TOOL_SPECS[pending.tool]
  const needed = spec.clicks ?? spec.anchorCount
  // Hình nhiều điểm: mọi điểm đã gom cộng điểm con trỏ (trừ nét bút, đang kéo thì chỉ có các điểm đã gom).
  let anchors = spec.variable
    ? [...pending.anchors, ...(cursor && !spec.variable.stroke ? [cursor] : [])]
    : (cursor ? [...pending.anchors, cursor] : [...pending.anchors]).slice(0, needed)
  if (anchors.length === 0) return []
  if (!spec.variable && spec.expand && anchors.length >= needed) anchors = spec.expand(anchors)
  const points = resolveAnchors(anchors, coords)
  if (!points) return []
  const ctx = contextOf(coords, options, false)
  const body = shapeCommands(pending.tool, points, spec.defaultStyle, undefined, ctx)
  // Nét bút đang kéo có hàng trăm điểm: không vẽ tay nắm cho từng điểm.
  const placed = spec.variable?.stroke ? [] : points.slice(0, pending.anchors.length)
  return [
    ...(body.length > 0 ? [clipOf(coords, ctx.dpr), ...body, { op: "unclip" } as DrawCommand] : []),
    ...handleCircles(placed, spec.defaultStyle.color, ctx.dpr),
  ]
}
