/**
 * Công cụ vẽ trên biểu đồ Flashback (spec v2.1 §7): Đường xu hướng và Fibonacci thoái lui.
 *
 * Toàn bộ là phép tính thuần, không React, không DOM: mức Fibonacci, nhãn, chọn hình bằng chuột,
 * kéo tay nắm và bộ giảm trạng thái của hình vẽ. Điểm neo của hình là (phiên, giá) chứ không phải
 * toạ độ màn hình, nên hình đi theo dữ liệu khi biểu đồ đổi tỷ lệ hoặc có phiên mới. Hình chỉ nằm ở
 * trình duyệt của từng người: giữ trong suốt ván, mất khi sang ván mới, không gửi server.
 */
import { formatNumber } from "./flashback-model"

export type DrawingTool = "trend" | "fib"
/** Chỉ số nến trong biểu đồ (0 là nến xem đầu tiên, có thể lẻ) và giá. */
export type DrawingPoint = { session: number; price: number }
export type DrawingHandle = "a" | "b"

/** `a` là điểm bấm đầu tiên (100% của Fibonacci), `b` là điểm cuối (0%). */
export type Drawing = { id: number; kind: DrawingTool; a: DrawingPoint; b: DrawingPoint }

/** 7 mức Fibonacci thoái lui, mỗi mức một màu (màu biểu đồ, không dùng màu thị trường cho giá). */
export const FIB_LEVELS: readonly { level: number; color: string }[] = [
  { level: 0, color: "var(--chart-5)" },
  { level: 0.236, color: "var(--chart-4)" },
  { level: 0.382, color: "var(--chart-2)" },
  { level: 0.5, color: "var(--chart-3)" },
  { level: 0.618, color: "var(--chart-1)" },
  { level: 0.786, color: "var(--chart-7)" },
  { level: 1, color: "var(--chart-5)" },
]

/** Vùng 38,2 đến 61,8% được tô nhạt. */
export const FIB_ZONE = [0.382, 0.618] as const

export const TREND_COLOR = "var(--chart-2)"

/** Giá tại mức L = Giá cuối − (Giá cuối − Giá đầu) × L (v2.1 §7.3). */
export function fibPrice(drawing: Pick<Drawing, "a" | "b">, level: number): number {
  return drawing.b.price - (drawing.b.price - drawing.a.price) * level
}

/** "61,8% · 25.630": mức 0, 50 và 100 không có số lẻ; còn lại một chữ số thập phân. */
export function fibLabel(level: number, price: number): string {
  const percent = Math.round(level * 1000) / 10
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(".", ",")
  return `${text}% · ${formatNumber(price)}`
}

/** Phép đổi giữa (phiên, giá) và toạ độ SVG của khung giá, do biểu đồ cung cấp. */
export type DrawingMap = {
  x: (session: number) => number
  y: (price: number) => number
  /** Mép phải của khung giá: Fibonacci kéo tới đây. */
  right: number
}

export type ScreenPoint = { x: number; y: number }

/** Khoảng cách từ một điểm tới đoạn thẳng. */
export function distanceToSegment(point: ScreenPoint, from: ScreenPoint, to: ScreenPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

/** Toạ độ màn hình của hai điểm neo. */
export function anchors(drawing: Drawing, map: DrawingMap): { a: ScreenPoint; b: ScreenPoint } {
  return {
    a: { x: map.x(drawing.a.session), y: map.y(drawing.a.price) },
    b: { x: map.x(drawing.b.session), y: map.y(drawing.b.price) },
  }
}

/** Sai số khi chọn hình bằng chuột hoặc ngón tay, tính bằng pixel. */
export const HIT_TOLERANCE = 7
/** Bán kính bắt tay nắm. */
export const HANDLE_RADIUS = 9

/** Khoảng cách từ một điểm tới hình (đường nét hoặc các mức ngang của Fibonacci). */
export function distanceToDrawing(drawing: Drawing, point: ScreenPoint, map: DrawingMap): number {
  const { a, b } = anchors(drawing, map)
  if (drawing.kind === "trend") return distanceToSegment(point, a, b)
  const left = Math.min(a.x, b.x)
  const connector = distanceToSegment(point, a, b)
  if (point.x < left - 4 || point.x > map.right) return connector
  const lines = FIB_LEVELS.map((entry) => Math.abs(point.y - map.y(fibPrice(drawing, entry.level))))
  return Math.min(connector, ...lines)
}

/** Hình gần điểm bấm nhất trong sai số; hình vẽ sau nằm trên hình vẽ trước khi cùng khoảng cách. */
export function hitDrawing(
  drawings: readonly Drawing[],
  point: ScreenPoint,
  map: DrawingMap,
  tolerance: number = HIT_TOLERANCE,
): Drawing | null {
  let best: Drawing | null = null
  let bestDistance = tolerance
  for (const drawing of drawings) {
    const distance = distanceToDrawing(drawing, point, map)
    if (distance <= bestDistance) {
      best = drawing
      bestDistance = distance
    }
  }
  return best
}

/** Tay nắm của hình đang chọn nằm dưới điểm bấm (nếu có). */
export function hitHandle(
  drawing: Drawing | null | undefined,
  point: ScreenPoint,
  map: DrawingMap,
  radius: number = HANDLE_RADIUS,
): DrawingHandle | null {
  if (!drawing) return null
  const { a, b } = anchors(drawing, map)
  const distanceA = Math.hypot(point.x - a.x, point.y - a.y)
  const distanceB = Math.hypot(point.x - b.x, point.y - b.y)
  if (distanceA > radius && distanceB > radius) return null
  return distanceA <= distanceB ? "a" : "b"
}

// ------------------------------------------------------------------ trạng thái

export type DrawingsState = {
  shapes: readonly Drawing[]
  nextId: number
  /** Công cụ đang bật (nút sáng, con trỏ dấu cộng); null là chế độ bình thường. */
  tool: DrawingTool | null
  /** Điểm đầu đã bấm, đang chờ điểm cuối. */
  pending: { kind: DrawingTool; a: DrawingPoint } | null
  selectedId: number | null
}

export const INITIAL_DRAWINGS: DrawingsState = { shapes: [], nextId: 1, tool: null, pending: null, selectedId: null }

export type DrawingsAction =
  | { type: "tool"; tool: DrawingTool | null }
  | { type: "start"; a: DrawingPoint }
  | { type: "finish"; b: DrawingPoint }
  | { type: "cancel" }
  | { type: "select"; id: number | null }
  | { type: "move"; id: number; handle: DrawingHandle; point: DrawingPoint }
  | { type: "remove"; id: number }
  | { type: "clear" }

export function drawingsReducer(state: DrawingsState, action: DrawingsAction): DrawingsState {
  switch (action.type) {
    case "tool":
      // Bấm lại nút đang sáng thì huỷ vẽ (v2.1 §7.2).
      return { ...state, tool: action.tool === state.tool ? null : action.tool, pending: null }
    case "start":
      return state.tool ? { ...state, pending: { kind: state.tool, a: action.a } } : state
    case "finish": {
      if (!state.pending) return state
      const drawing: Drawing = { id: state.nextId, kind: state.pending.kind, a: state.pending.a, b: action.b }
      // Vẽ xong tự về chế độ bình thường, hình vừa vẽ ở trạng thái đang chọn (v2.1 §7.2).
      return { shapes: [...state.shapes, drawing], nextId: state.nextId + 1, tool: null, pending: null, selectedId: drawing.id }
    }
    case "cancel":
      return state.tool === null && state.pending === null ? state : { ...state, tool: null, pending: null }
    case "select":
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id }
    case "move":
      return {
        ...state,
        shapes: state.shapes.map((shape) => (shape.id === action.id ? { ...shape, [action.handle]: action.point } : shape)),
      }
    case "remove":
      return {
        ...state,
        shapes: state.shapes.filter((shape) => shape.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      }
    case "clear":
      return { ...state, shapes: [], selectedId: null, pending: null }
  }
}

/** Nút Xoá (v2.1 §7.4): xoá hình đang chọn; không chọn hình nào thì xoá hết; chưa có hình thì chỉ báo. */
export function clearOutcome(state: Pick<DrawingsState, "shapes" | "selectedId">): {
  action: DrawingsAction | null
  message: string
} {
  if (state.selectedId !== null && state.shapes.some((shape) => shape.id === state.selectedId)) {
    return { action: { type: "remove", id: state.selectedId }, message: "Đã xoá hình vẽ" }
  }
  if (state.shapes.length > 0) return { action: { type: "clear" }, message: `Đã xoá ${state.shapes.length} hình vẽ` }
  return { action: null, message: "Chưa có hình vẽ" }
}
