/**
 * Bộ giảm trạng thái của hình vẽ (chuyển từ flashback-drawings.ts): công cụ đang bật, điểm neo đang chờ, hình đang chọn,
 * khoá, ẩn, nhân bản và danh sách hình. Không biết toạ độ màn hình: điểm neo do nơi gọi tạo bằng `anchorFromPoint`.
 * Hoàn tác và làm lại nằm ở `interaction/`, không nằm ở đây.
 */
import type { Anchor, Drawing, DrawingStyle, DrawingTool } from "../types"
import { TOOL_SPECS, clicksOf, maxAnchorsOf } from "./tools"
import { DOCUMENT_POINT_BUDGET, capPoints, roundAnchor } from "./tools-basic"

export type PendingDrawing = { tool: DrawingTool; anchors: readonly Anchor[] }

export type DrawingsState = {
  /** Thứ tự vẽ: hình sau nằm trên hình trước. */
  shapes: readonly Drawing[]
  nextId: number
  /** Công cụ đang bật (nút sáng, con trỏ dấu cộng); null là chế độ bình thường. */
  tool: DrawingTool | null
  /** Các điểm đã bấm, đang chờ đủ số điểm neo. */
  pending: PendingDrawing | null
  selectedId: string | null
}

export const INITIAL_DRAWINGS: DrawingsState = { shapes: [], nextId: 1, tool: null, pending: null, selectedId: null }

export type DrawingsAction =
  | { type: "tool"; tool: DrawingTool | null }
  /**
   * Thêm một điểm neo cho hình đang vẽ; đủ số lần bấm thì hình hoàn tất. Công cụ nhiều điểm (nét bút, đường gấp khúc) chỉ gom điểm
   * vào `pending`, hoàn tất bằng `finish`.
   */
  | { type: "anchor"; anchor: Anchor }
  /**
   * Hoàn tất hình nhiều điểm đang vẽ (nhấp đúp, Enter, nút Xong, thả bút). `anchors` thay các điểm đang gom (nét bút đã giản lược).
   * Chưa đủ điểm tối thiểu hoặc hết hạn mức điểm của tài liệu thì giữ nguyên trạng thái.
   */
  | { type: "finish"; anchors?: readonly Anchor[] }
  /** Bỏ các điểm đang gom nhưng giữ công cụ (bấm bút một cái mà không kéo). */
  | { type: "restart" }
  | { type: "cancel" }
  | { type: "select"; id: string | null }
  /** Thay toàn bộ điểm neo (kéo tay nắm hoặc kéo cả hình). Bỏ qua hình khoá. */
  | { type: "set-anchors"; id: string; anchors: readonly Anchor[] }
  | { type: "remove"; id: string }
  /** Xoá mọi hình không khoá. */
  | { type: "clear" }
  /** `locked` bỏ trống thì đảo trạng thái. */
  | { type: "lock"; id: string; locked?: boolean }
  | { type: "hide"; id: string; hidden?: boolean }
  | { type: "set-all-hidden"; hidden: boolean }
  /** Nhân bản; `anchors` là vị trí của bản sao (bỏ trống thì trùng bản gốc). Bản sao không khoá và đang được chọn. */
  | { type: "duplicate"; id: string; anchors?: readonly Anchor[] }
  | { type: "style"; id: string; style: Partial<DrawingStyle> }
  | { type: "text"; id: string; text: string }
  /** Nạp hình từ kho lưu trữ; xoá lựa chọn và hình đang vẽ dở. */
  | { type: "load"; drawings: readonly Drawing[] }

const ID_PATTERN = /^d(\d+)$/

/** Số điểm neo đang dùng bởi các hình nhiều điểm (nét bút, đường gấp khúc), tính vào hạn mức của tài liệu. */
export function variablePointCount(shapes: readonly Pick<Drawing, "tool" | "anchors">[]): number {
  let total = 0
  for (const shape of shapes) if (TOOL_SPECS[shape.tool].variable) total += shape.anchors.length
  return total
}

/** Số thứ tự kế tiếp, lớn hơn mọi ID dạng `d<số>` đang có. */
export function nextIdFor(shapes: readonly Drawing[]): number {
  let max = 0
  for (const shape of shapes) {
    const match = ID_PATTERN.exec(shape.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

export function createDrawingsState(shapes: readonly Drawing[] = []): DrawingsState {
  return { ...INITIAL_DRAWINGS, shapes, nextId: nextIdFor(shapes) }
}

function freshId(state: DrawingsState): { id: string; nextId: number } {
  let n = state.nextId
  const taken = new Set(state.shapes.map((shape) => shape.id))
  while (taken.has(`d${n}`)) n++
  return { id: `d${n}`, nextId: n + 1 }
}

function mapShape(state: DrawingsState, id: string, update: (shape: Drawing) => Drawing): DrawingsState {
  let changed = false
  const shapes = state.shapes.map((shape) => {
    if (shape.id !== id) return shape
    const next = update(shape)
    if (next !== shape) changed = true
    return next
  })
  return changed ? { ...state, shapes } : state
}

/** Thêm hình mới đã đủ điểm neo. Vẽ xong tự về chế độ bình thường, hình vừa vẽ ở trạng thái đang chọn (v2.1 §7.2). */
function complete(state: DrawingsState, tool: DrawingTool, anchors: readonly Anchor[]): DrawingsState {
  const { id, nextId } = freshId(state)
  const drawing: Drawing = { id, tool, anchors: anchors.slice(0, maxAnchorsOf(tool)), style: { ...TOOL_SPECS[tool].defaultStyle } }
  return { shapes: [...state.shapes, drawing], nextId, tool: null, pending: null, selectedId: id }
}

export function drawingsReducer(state: DrawingsState, action: DrawingsAction): DrawingsState {
  switch (action.type) {
    case "tool": {
      // Bấm lại nút đang sáng thì huỷ vẽ (v2.1 §7.2). Bật công cụ thì bỏ chọn hình.
      const tool = action.tool === state.tool ? null : action.tool
      return { ...state, tool, pending: null, selectedId: tool ? null : state.selectedId }
    }
    case "anchor": {
      if (!state.tool) return state
      const tool = state.pending?.tool ?? state.tool
      const spec = TOOL_SPECS[tool]
      const prior = state.pending?.anchors ?? []
      if (spec.variable) {
        // Hình nhiều điểm không tự hoàn tất: quá hạn mức điểm khi đang vẽ thì bỏ qua điểm mới.
        return prior.length >= spec.variable.pendingMax ? state : { ...state, pending: { tool, anchors: [...prior, action.anchor] } }
      }
      const clicked = [...prior, action.anchor]
      if (clicked.length < clicksOf(tool)) return { ...state, pending: { tool, anchors: clicked } }
      return complete(state, tool, spec.expand ? spec.expand(clicked) : clicked)
    }
    case "finish": {
      const { pending } = state
      if (!pending) return state
      const spec = TOOL_SPECS[pending.tool]
      if (!spec.variable) return state
      const source = action.anchors ?? pending.anchors
      const room = DOCUMENT_POINT_BUDGET - variablePointCount(state.shapes)
      const limit = Math.min(spec.variable.max, room)
      if (source.length < spec.anchorCount) return state
      // Hết hạn mức điểm của tài liệu: bỏ hình đang vẽ thay vì làm tài liệu vượt giới hạn lưu.
      if (limit < spec.anchorCount) return { ...state, pending: null }
      return complete(state, pending.tool, capPoints(source, limit).map(roundAnchor))
    }
    case "restart":
      return state.pending === null ? state : { ...state, pending: null }
    case "cancel":
      return state.tool === null && state.pending === null ? state : { ...state, tool: null, pending: null }
    case "select": {
      const id = action.id !== null && state.shapes.some((shape) => shape.id === action.id) ? action.id : null
      return state.selectedId === id ? state : { ...state, selectedId: id }
    }
    case "set-anchors":
      return mapShape(state, action.id, (shape) =>
        shape.locked || action.anchors.length !== shape.anchors.length ? shape : { ...shape, anchors: TOOL_SPECS[shape.tool].variable ? action.anchors.map(roundAnchor) : [...action.anchors] },
      )
    case "remove": {
      const target = state.shapes.find((shape) => shape.id === action.id)
      if (!target || target.locked) return state
      return { ...state, shapes: state.shapes.filter((shape) => shape.id !== action.id), selectedId: state.selectedId === action.id ? null : state.selectedId }
    }
    case "clear": {
      const shapes = state.shapes.filter((shape) => shape.locked)
      if (shapes.length === state.shapes.length) return { ...state, pending: null }
      const keep = shapes.some((shape) => shape.id === state.selectedId)
      return { ...state, shapes, selectedId: keep ? state.selectedId : null, pending: null }
    }
    case "lock":
      return mapShape(state, action.id, (shape) => {
        const locked = action.locked ?? !shape.locked
        return Boolean(shape.locked) === locked ? shape : { ...shape, locked }
      })
    case "hide":
      return mapShape(state, action.id, (shape) => {
        const hidden = action.hidden ?? !shape.hidden
        return Boolean(shape.hidden) === hidden ? shape : { ...shape, hidden }
      })
    case "set-all-hidden": {
      if (state.shapes.every((shape) => Boolean(shape.hidden) === action.hidden)) return state
      return { ...state, shapes: state.shapes.map((shape) => (Boolean(shape.hidden) === action.hidden ? shape : { ...shape, hidden: action.hidden })) }
    }
    case "duplicate": {
      const source = state.shapes.find((shape) => shape.id === action.id)
      if (!source) return state
      // Bản sao của nét bút hay đường gấp khúc cũng tính vào hạn mức điểm của tài liệu.
      if (TOOL_SPECS[source.tool].variable && variablePointCount(state.shapes) + source.anchors.length > DOCUMENT_POINT_BUDGET) return state
      const { id, nextId } = freshId(state)
      const copy: Drawing = { ...source, id, anchors: [...(action.anchors ?? source.anchors)], style: { ...source.style } }
      delete copy.locked
      delete copy.hidden
      return { ...state, shapes: [...state.shapes, copy], nextId, selectedId: id }
    }
    case "style":
      return mapShape(state, action.id, (shape) => (shape.locked ? shape : { ...shape, style: { ...shape.style, ...action.style } }))
    case "text":
      return mapShape(state, action.id, (shape) => (shape.locked || shape.text === action.text ? shape : { ...shape, text: action.text }))
    case "load":
      return { ...state, shapes: action.drawings, nextId: Math.max(state.nextId, nextIdFor(action.drawings)), pending: null, selectedId: null, tool: null }
  }
}

/** Nút Xoá (v2.1 §7.4): xoá hình đang chọn; không chọn hình nào thì xoá hết; chưa có hình thì chỉ báo. Hình khoá không bị xoá. */
export function clearOutcome(state: Pick<DrawingsState, "shapes" | "selectedId">): { action: DrawingsAction | null; message: string } {
  const selected = state.shapes.find((shape) => shape.id === state.selectedId)
  if (selected) {
    return selected.locked
      ? { action: null, message: "Hình vẽ đang khoá" }
      : { action: { type: "remove", id: selected.id }, message: "Đã xoá hình vẽ" }
  }
  const removable = state.shapes.filter((shape) => !shape.locked)
  if (removable.length > 0) return { action: { type: "clear" }, message: `Đã xoá ${removable.length} hình vẽ` }
  return { action: null, message: state.shapes.length > 0 ? "Hình vẽ đang khoá" : "Chưa có hình vẽ" }
}

export type DrawingListEntry = {
  id: string
  tool: DrawingTool
  label: string
  locked: boolean
  hidden: boolean
  selected: boolean
}

/** Danh sách hình cho bảng "Danh sách hình vẽ": hình trên cùng trước (mặc định), hoặc theo thứ tự vẽ. */
export function listDrawings(state: Pick<DrawingsState, "shapes" | "selectedId">, order: "top-first" | "creation" = "top-first"): DrawingListEntry[] {
  const entries = state.shapes.map((shape): DrawingListEntry => {
    const base = TOOL_SPECS[shape.tool].label
    return {
      id: shape.id,
      tool: shape.tool,
      label: shape.text ? `${base}: ${shape.text}` : base,
      locked: Boolean(shape.locked),
      hidden: Boolean(shape.hidden),
      selected: shape.id === state.selectedId,
    }
  })
  return order === "top-first" ? entries.reverse() : entries
}
