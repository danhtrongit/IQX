/**
 * Bộ giảm trạng thái của tương tác: zoom, kéo, co giãn trục, crosshair, công cụ vẽ, cử chỉ chạm, phím tắt, hoàn tác.
 * Thuần: không DOM, không đồng hồ. Mọi khác biệt giữa `market`, `flashback` và `static` nằm ở `InteractionConfig`.
 *
 * Quy ước kéo: mọi phép kéo tính lại từ điểm bắt đầu (`startViewport`, hình gốc) chứ không cộng dồn từng bước, nên sự kiện
 * đến chậm hay dồn lại cũng không làm lệch. Hoàn tác ghi nhận một bước cho mỗi lần sửa hình, kể cả cả cú kéo.
 */
import type { Anchor, Drawing } from "../types"
import {
  TOOL_SPECS,
  anchorFromPoint,
  drawingsReducer,
  hitDrawing,
  hitHandle,
  moveHandle,
  normalizeMagnet,
  simplifyStroke,
  translateDrawing,
  type AnchorOptions,
  type DrawingsState,
  type PendingDrawing,
} from "../drawings"
import { DRAW_DRAG_SLOP, LONG_PRESS_SLOP, ZOOM_STEP, pinchViewport, wheelIntent, wheelPanBars, wheelZoomFactor } from "./gestures"
import { recordHistory, redoHistory, undoHistory } from "./history"
import { keyToAction } from "./keyboard"
import { opsFor, type ViewportOps } from "./viewport-ops"
import type {
  Crosshair,
  CursorHint,
  DragState,
  InteractionAction,
  InteractionEnv,
  InteractionState,
  PinchState,
  PointerInput,
} from "./types"
import type { Viewport } from "../types"

/** Kéo trên trục thời gian hoặc trục giá: mỗi pixel đổi tỷ lệ theo hệ số mũ này. */
const AXIS_DRAG_RATE = 0.005
const PRICE_SCALE_MIN = 0.1
const PRICE_SCALE_MAX = 10
/** Nét bút: khoảng cách tối thiểu (pixel) giữa hai điểm thô liên tiếp. */
const STROKE_MIN_STEP = 2
/** Đường gấp khúc: bấm gần đỉnh trước hơn chừng này thì không tính là đỉnh mới (hai lần bấm của nhấp đúp). */
const DUPLICATE_POINT_SLOP = 4

const plotWidth = (env: InteractionEnv) => Math.max(env.coords.plot.right - env.coords.plot.left, 1)
const canDraw = (env: InteractionEnv) => env.config.allowedTools.length > 0
/** Phép tính viewport theo bề rộng khung vẽ hiện tại (giới hạn zoom của `core` tính theo pixel). */
const opsOf = (env: InteractionEnv): ViewportOps => opsFor(env.config.viewport, plotWidth(env))

function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.from === b.from && a.to === b.to
}

function withViewport(state: InteractionState, viewport: Viewport): InteractionState {
  return sameViewport(state.viewport, viewport) ? state : { ...state, viewport }
}

function anchorOptions(state: InteractionState, env: InteractionEnv): AnchorOptions {
  return {
    snap:
      state.magnet !== "off" && env.bars
        ? { bars: env.bars, tolerance: env.config.snapTolerance, strength: state.magnet, readable: env.config.readable, clampOutside: env.config.crosshairBeyondData }
        : undefined,
    indexRange: env.config.anchorRange ?? undefined,
  }
}

function pointAnchor(state: InteractionState, p: PointerInput, env: InteractionEnv): Anchor {
  return anchorFromPoint(p, env.coords, anchorOptions(state, env))
}

/** Điểm của nét bút: không hút vào OHLC (nét vẽ tay), kẹp trong khung vẽ để kéo ra ngoài vẫn cho nét hợp lệ. */
function strokePoint(p: { x: number; y: number }, env: InteractionEnv): { x: number; y: number } {
  const { plot } = env.coords
  return { x: Math.min(plot.right, Math.max(plot.left, p.x)), y: Math.min(plot.bottom, Math.max(plot.top, p.y)) }
}

function strokeAnchor(p: { x: number; y: number }, env: InteractionEnv): Anchor {
  return anchorFromPoint(strokePoint(p, env), env.coords, { indexRange: env.config.anchorRange ?? undefined })
}

function repeatsLastPoint(pending: PendingDrawing | null, p: PointerInput, env: InteractionEnv): boolean {
  const last = pending?.anchors.at(-1)
  if (!last) return false
  const index = env.coords.indexOfAnchor(last)
  if (index === null) return false
  return Math.hypot(p.x - env.coords.xOfIndex(index), p.y - env.coords.yOfPrice(last.price)) < DUPLICATE_POINT_SLOP
}

/** Đưa trạng thái hình mới vào; ghi một bước hoàn tác nếu danh sách hình đổi. */
function applyDrawings(state: InteractionState, drawings: DrawingsState, env: InteractionEnv): InteractionState {
  const changed = drawings.shapes !== state.drawings.shapes
  return {
    ...state,
    drawings,
    history: changed && env.config.history ? recordHistory(state.history, state.drawings.shapes) : state.history,
    preview: drawings.pending ? state.preview : null,
  }
}

/** Chốt một cú kéo hình: ghi bước hoàn tác nếu hình thực sự đổi. */
function commitDrag(state: InteractionState, before: readonly Drawing[], env: InteractionEnv): InteractionState {
  if (state.drawings.shapes === before || !env.config.history) return state
  return { ...state, history: recordHistory(state.history, before) }
}

function setShapes(state: InteractionState, id: string, anchors: readonly Anchor[]): InteractionState {
  const drawings = drawingsReducer(state.drawings, { type: "set-anchors", id, anchors })
  return drawings === state.drawings ? state : { ...state, drawings }
}

// ------------------------------------------------------------------ crosshair và con trỏ

function crosshairAt(p: PointerInput, source: Crosshair["source"], env: InteractionEnv): Crosshair | null {
  const { config, coords } = env
  if (p.target.region !== "plot") return null
  const bar = Math.round(coords.indexOfX(p.x))
  const readable = config.readable
  const inRange = readable !== null && bar >= readable.first && bar <= readable.last
  // Flashback: ô tương lai và warmup không có crosshair nên không có gì để đọc (§12).
  if (!inRange) return config.crosshairBeyondData ? { x: p.x, y: p.y, paneKey: p.target.paneKey, bar: null, source } : null
  return { x: p.x, y: p.y, paneKey: p.target.paneKey, bar, source }
}

function withCrosshair(state: InteractionState, p: PointerInput, source: Crosshair["source"], env: InteractionEnv): InteractionState {
  if (p.target.region === "none") return state.crosshair ? { ...state, crosshair: null } : state
  // Con trỏ trên trục: giữ crosshair như cũ.
  if (p.target.region !== "plot") return state
  return { ...state, crosshair: crosshairAt(p, source, env) }
}

function cursorFor(state: InteractionState, p: PointerInput | null, env: InteractionEnv): CursorHint {
  const { drag } = state
  if (drag) {
    if (drag.kind === "scale-price") return "ns-resize"
    if (drag.kind === "scale-time") return "ew-resize"
    return drag.kind === "draw" || drag.kind === "stroke" || drag.kind === "crosshair" ? "crosshair" : "grabbing"
  }
  if (!p) return "default"
  if (p.target.region === "price-axis") return env.config.axisScaling ? "ns-resize" : "default"
  if (p.target.region === "time-axis") return env.config.axisScaling ? "ew-resize" : "default"
  if (state.drawings.tool) return "crosshair"
  if (p.target.region === "plot" && p.target.paneKind === "price" && canDraw(env)) {
    const selected = state.drawings.shapes.find((shape) => shape.id === state.drawings.selectedId)
    if (hitHandle(selected, p, env.coords) !== null || hitDrawing(state.drawings.shapes, p, env.coords)) return "pointer"
  }
  return "default"
}

// ------------------------------------------------------------------ chạm hai ngón

function touchPair(state: InteractionState, ids: readonly [number, number]): [PointerInput, PointerInput] | null {
  const a = state.touches[ids[0]]
  const b = state.touches[ids[1]]
  return a && b ? [a.pointer, b.pointer] : null
}

function startPinch(state: InteractionState, env: InteractionEnv): InteractionState {
  // Ngón thứ hai chạm xuống giữa lúc đang kéo bút: bỏ nét dở thay vì để điểm treo.
  if (state.drag?.kind === "stroke") state = { ...state, drawings: drawingsReducer(state.drawings, { type: "restart" }) }
  if (!env.config.zoom || env.config.mode === "static") return { ...state, drag: null }
  const ids = Object.keys(state.touches).map(Number).slice(0, 2) as [number, number]
  const pair = touchPair(state, ids)
  if (!pair) return state
  const [a, b] = pair
  const centerX = (a.x + b.x) / 2
  const pinch: PinchState = {
    ids,
    startDistance: Math.hypot(a.x - b.x, a.y - b.y),
    startViewport: state.viewport,
    startRatio: Math.min(1, Math.max(0, (centerX - env.coords.plot.left) / plotWidth(env))),
    startCenterX: centerX,
  }
  return { ...state, pinch, drag: null, crosshair: null }
}

function applyPinch(state: InteractionState, env: InteractionEnv): InteractionState {
  const { pinch } = state
  if (!pinch) return state
  const pair = touchPair(state, pinch.ids)
  if (!pair) return state
  const [a, b] = pair
  const viewport = pinchViewport(pinch, { distance: Math.hypot(a.x - b.x, a.y - b.y) }, (a.x + b.x) / 2, plotWidth(env), opsOf(env))
  return withViewport(state, viewport)
}

// ------------------------------------------------------------------ con trỏ

function plotDown(state: InteractionState, p: PointerInput, env: InteractionEnv): InteractionState {
  const { config, coords } = env
  const inPricePane = p.target.paneKind === "price"
  if (canDraw(env) && inPricePane) {
    const { drawings } = state
    if (drawings.tool) {
      const variable = TOOL_SPECS[drawings.pending?.tool ?? drawings.tool].variable
      if (variable?.stroke) {
        // Nét bút: nhấn là điểm đầu, kéo thêm điểm, thả là xong (pointerUp).
        const started = drawingsReducer(drawingsReducer(drawings, { type: "restart" }), { type: "anchor", anchor: strokeAnchor(p, env) })
        return { ...state, drawings: started, preview: null, drag: { kind: "stroke", pointerId: p.pointerId, lastX: p.x, lastY: p.y } }
      }
      // Đường gấp khúc: hai lần bấm của nhấp đúp không tạo thêm đỉnh trùng.
      if (variable && repeatsLastPoint(drawings.pending, p, env)) return state
      // Đang vẽ: mỗi lần bấm là một điểm neo. Chưa đủ điểm thì chờ điểm kế, kéo rồi thả cũng chốt được điểm cuối.
      const anchor = pointAnchor(state, p, env)
      const next = applyDrawings(state, drawingsReducer(drawings, { type: "anchor", anchor }), env)
      return next.drawings.pending
        ? { ...next, preview: anchor, drag: { kind: "draw", pointerId: p.pointerId, startX: p.x, startY: p.y } }
        : { ...next, preview: null, drag: null }
    }
    const selected = drawings.shapes.find((shape) => shape.id === drawings.selectedId)
    const handle = hitHandle(selected, p, coords)
    if (selected && handle !== null) {
      return { ...state, drag: { kind: "handle", pointerId: p.pointerId, id: selected.id, handle, before: drawings.shapes } }
    }
    const hit = hitDrawing(drawings.shapes, p, coords)
    if (hit) {
      const picked = { ...state, drawings: drawingsReducer(drawings, { type: "select", id: hit.id }) }
      if (hit.locked) return picked
      return { ...picked, drag: { kind: "move", pointerId: p.pointerId, id: hit.id, origin: hit, startX: p.x, startY: p.y, before: drawings.shapes } }
    }
    if (drawings.selectedId !== null) state = { ...state, drawings: drawingsReducer(drawings, { type: "select", id: null }) }
  } else if (canDraw(env) && state.drawings.tool) {
    // Công cụ đang bật mà bấm ngoài ô giá: không làm gì, cũng không kéo biểu đồ.
    return state
  }
  if (!config.pan) return state
  return { ...state, drag: { kind: "pan", pointerId: p.pointerId, startX: p.x, startViewport: state.viewport } }
}

function pointerDown(state: InteractionState, p: PointerInput, env: InteractionEnv): InteractionState {
  const { config } = env
  if (p.pointerType !== "touch" && (p.button ?? 0) !== 0) return state
  let next = state
  if (p.pointerType === "touch") {
    const touches = { ...state.touches, [p.pointerId]: { pointer: p, startX: p.x, startY: p.y } }
    // Chạm mới tắt crosshair do nhấn giữ lần trước.
    next = { ...state, touches, crosshair: state.crosshair?.source === "touch" ? null : state.crosshair }
    const count = Object.keys(touches).length
    if (count === 2) return startPinch(next, env)
    if (count > 2) return next
  }
  if (config.mode === "static") return next
  const { region } = p.target
  if (region === "time-axis" || region === "price-axis") {
    if (!config.axisScaling) return next
    const drag: DragState =
      region === "time-axis"
        ? { kind: "scale-time", pointerId: p.pointerId, startX: p.x, startViewport: next.viewport }
        : { kind: "scale-price", pointerId: p.pointerId, paneKey: p.target.paneKey, startY: p.y, startScale: next.priceScale[p.target.paneKey] ?? 1 }
    return { ...next, drag, cursor: cursorFor({ ...next, drag }, p, env) }
  }
  if (region !== "plot") return next
  const down = plotDown(next, p, env)
  return { ...down, cursor: cursorFor(down, p, env) }
}

function applyDrag(state: InteractionState, drag: DragState, p: PointerInput, env: InteractionEnv): InteractionState {
  const { config, coords } = env
  switch (drag.kind) {
    case "pan": {
      const span = drag.startViewport.to - drag.startViewport.from
      const moved = withViewport(state, opsOf(env).pan(drag.startViewport, (-(p.x - drag.startX) * span) / plotWidth(env)))
      return p.pointerType === "touch" ? moved : withCrosshair(moved, p, "pointer", env)
    }
    case "scale-time":
      // Kéo sang phải thu nhỏ, sang trái phóng to; mép phải (nến mới nhất) đứng yên.
      return withViewport(state, opsOf(env).zoom(drag.startViewport, 1, Math.exp(-(p.x - drag.startX) * AXIS_DRAG_RATE)))
    case "scale-price": {
      // Kéo xuống thu nhỏ (khoảng giá rộng ra), kéo lên phóng to.
      const scale = Math.min(PRICE_SCALE_MAX, Math.max(PRICE_SCALE_MIN, drag.startScale * Math.exp((p.y - drag.startY) * AXIS_DRAG_RATE)))
      return { ...state, priceScale: { ...state.priceScale, [drag.paneKey]: scale } }
    }
    case "handle": {
      const shape = state.drawings.shapes.find((candidate) => candidate.id === drag.id)
      if (!shape) return state
      const moved = moveHandle(shape, drag.handle, p, coords, anchorOptions(state, env))
      return withCrosshair(setShapes(state, drag.id, moved.anchors), p, "pointer", env)
    }
    case "move": {
      const moved = translateDrawing(drag.origin, p.x - drag.startX, p.y - drag.startY, coords, config.anchorRange ?? undefined)
      return setShapes(state, drag.id, moved.anchors)
    }
    case "draw":
      return { ...state, preview: pointAnchor(state, p, env) }
    case "stroke": {
      const at = strokePoint(p, env)
      if (Math.hypot(at.x - drag.lastX, at.y - drag.lastY) < STROKE_MIN_STEP) return state
      const drawings = drawingsReducer(state.drawings, { type: "anchor", anchor: strokeAnchor(at, env) })
      return { ...state, drawings, drag: { ...drag, lastX: at.x, lastY: at.y } }
    }
    case "crosshair":
      return withCrosshair(state, p, "touch", env)
  }
}

function pointerMove(state: InteractionState, p: PointerInput, env: InteractionEnv): InteractionState {
  let next = state
  const known = p.pointerType === "touch" ? state.touches[p.pointerId] : undefined
  if (known) {
    next = { ...state, touches: { ...state.touches, [p.pointerId]: { ...known, pointer: p } } }
    if (next.pinch?.ids.includes(p.pointerId)) return applyPinch(next, env)
  }
  const { drag } = next
  if (drag && drag.pointerId === p.pointerId) {
    const moved = applyDrag(next, drag, p, env)
    return moved.cursor === cursorFor(moved, p, env) ? moved : { ...moved, cursor: cursorFor(moved, p, env) }
  }
  if (p.pointerType === "touch") return next
  if (env.config.mode === "static" && p.target.region !== "plot") return withCrosshair(next, p, "pointer", env)
  let hovered = withCrosshair(next, p, "pointer", env)
  if (hovered.drawings.pending && p.target.region === "plot" && p.target.paneKind === "price") hovered = { ...hovered, preview: pointAnchor(hovered, p, env) }
  return { ...hovered, cursor: cursorFor(hovered, p, env) }
}

function withoutTouch(touches: InteractionState["touches"], id: number): InteractionState["touches"] {
  const copy = { ...touches }
  delete copy[id]
  return copy
}

function pointerUp(state: InteractionState, p: PointerInput, env: InteractionEnv): InteractionState {
  let next = state
  if (p.pointerType === "touch") {
    next = { ...state, touches: withoutTouch(state.touches, p.pointerId) }
    if (state.pinch?.ids.includes(p.pointerId)) next = { ...next, pinch: null, drag: null }
  }
  const { drag } = next
  if (!drag || drag.pointerId !== p.pointerId) return next
  next = { ...next, drag: null }
  switch (drag.kind) {
    case "handle":
    case "move":
      return commitDrag(next, drag.before, env)
    case "stroke": {
      // Thả bút: giản lược các điểm thô rồi chốt. Bấm một cái mà không kéo thì bỏ nét, giữ công cụ.
      // Điểm thả cũng là một điểm của nét nếu đã rời điểm cuối.
      const tail = Math.hypot(p.x - drag.lastX, p.y - drag.lastY) >= 1 ? drawingsReducer(next.drawings, { type: "anchor", anchor: strokeAnchor(p, env) }) : next.drawings
      const { pending } = tail
      if (!pending || pending.anchors.length < 2) return { ...next, drawings: drawingsReducer(tail, { type: "restart" }), preview: null }
      const done = applyDrawings({ ...next, drawings: tail }, drawingsReducer(tail, { type: "finish", anchors: simplifyStroke(pending.anchors, env.coords) }), env)
      return { ...done, preview: null }
    }
    case "draw": {
      // Kéo từ điểm đầu rồi thả: điểm thả là điểm neo kế tiếp.
      if (!next.drawings.pending || Math.hypot(p.x - drag.startX, p.y - drag.startY) < DRAW_DRAG_SLOP) return next
      const anchor = pointAnchor(next, p, env)
      const done = applyDrawings(next, drawingsReducer(next.drawings, { type: "anchor", anchor }), env)
      return done.drawings.pending ? { ...done, preview: anchor } : { ...done, preview: null }
    }
    default:
      return next
  }
}

function pointerCancel(state: InteractionState, pointerId: number): InteractionState {
  let next = state
  if (state.touches[pointerId]) next = { ...next, touches: withoutTouch(state.touches, pointerId) }
  if (next.pinch?.ids.includes(pointerId)) next = { ...next, pinch: null }
  const { drag } = next
  if (!drag || drag.pointerId !== pointerId) return next
  next = { ...next, drag: null }
  // Huỷ giữa chừng thì trả hình về như trước khi kéo; nét bút dở thì bỏ.
  if (drag.kind === "handle" || drag.kind === "move") return { ...next, drawings: { ...next.drawings, shapes: drag.before } }
  if (drag.kind === "stroke") return { ...next, drawings: drawingsReducer(next.drawings, { type: "restart" }), preview: null }
  return next
}

function resetView(state: InteractionState, env: InteractionEnv): InteractionState {
  if (env.config.mode === "static") return state
  return { ...withViewport(state, opsOf(env).clamp(env.config.defaultViewport)), priceScale: {} }
}

function doubleClick(state: InteractionState, p: PointerInput, env: InteractionEnv): InteractionState {
  const { config } = env
  // Nhấp đúp khi đang vẽ đường gấp khúc là hoàn tất hình (đỉnh cuối là điểm nhấp đầu tiên của nhấp đúp).
  const pending = state.drawings.pending
  if (pending && canDraw(env) && TOOL_SPECS[pending.tool].variable && !TOOL_SPECS[pending.tool].variable?.stroke) {
    const drawings = drawingsReducer(state.drawings, { type: "finish" })
    return drawings === state.drawings ? state : { ...applyDrawings(state, drawings, env), preview: null }
  }
  switch (p.target.region) {
    case "price-axis": {
      if (!config.axisScaling || !(p.target.paneKey in state.priceScale)) return state
      const priceScale = { ...state.priceScale }
      delete priceScale[p.target.paneKey]
      return { ...state, priceScale }
    }
    case "time-axis":
      return config.zoom || config.pan ? resetView(state, env) : state
    case "plot": {
      if (!config.doubleClickPlotResets || state.drawings.tool) return state
      const onShape = canDraw(env) && p.target.paneKind === "price" && hitDrawing(state.drawings.shapes, p, env.coords) !== null
      return onShape ? state : resetView(state, env)
    }
    default:
      return state
  }
}

function longPress(state: InteractionState, pointerId: number, env: InteractionEnv): InteractionState {
  const touch = state.touches[pointerId]
  if (!touch || Object.keys(state.touches).length !== 1 || state.pinch) return state
  if (Math.hypot(touch.pointer.x - touch.startX, touch.pointer.y - touch.startY) > LONG_PRESS_SLOP) return state
  if ((state.drag && state.drag.kind !== "pan") || state.drawings.tool) return state
  const crosshair = crosshairAt(touch.pointer, "touch", env)
  if (!crosshair && touch.pointer.target.region !== "plot") return state
  return { ...state, drag: { kind: "crosshair", pointerId }, crosshair, cursor: "crosshair" }
}

// ------------------------------------------------------------------ con lăn, phím

function wheel(state: InteractionState, input: Extract<InteractionAction, { type: "wheel" }>["wheel"], env: InteractionEnv): InteractionState {
  const { config, coords } = env
  const intent = wheelIntent(input, config)
  if (intent === "none") return state
  if (intent === "pan") return withViewport(state, opsOf(env).pan(state.viewport, wheelPanBars(input, state.viewport, plotWidth(env))))
  const ratio = (input.x - coords.plot.left) / plotWidth(env)
  return withViewport(state, opsOf(env).zoom(state.viewport, ratio, wheelZoomFactor(input)))
}

function moveCrosshair(state: InteractionState, bars: number, env: InteractionEnv): InteractionState {
  const { config, coords } = env
  const readable = config.readable
  if (!readable) return state
  const bound = (value: number) => Math.min(readable.last, Math.max(readable.first, value))
  // Lần bấm đầu chỉ hiện crosshair ở nến cuối nhìn thấy trọn; các lần sau mới dịch.
  const previous = state.crosshair?.bar
  const bar = previous == null ? bound(Math.floor(state.viewport.to - 0.5)) : bound(previous + bars)
  let viewport = state.viewport
  if (config.pan) {
    // Nến `i` chiếm [i - 0.5, i + 0.5]: kéo viewport tới khi nến hiện trọn.
    const ops = opsOf(env)
    if (bar - 0.5 < viewport.from) viewport = ops.pan(viewport, bar - 0.5 - viewport.from)
    else if (bar + 0.5 > viewport.to) viewport = ops.pan(viewport, bar + 0.5 - viewport.to)
  }
  const close = env.bars?.[bar]?.close
  const y = close !== undefined ? coords.yOfPrice(close) : (state.crosshair?.y ?? (coords.plot.top + coords.plot.bottom) / 2)
  // `x` tính theo viewport MỚI (coords còn là của viewport cũ).
  const x = coords.plot.left + ((bar - viewport.from) / (viewport.to - viewport.from)) * plotWidth(env)
  const crosshair: Crosshair = { x, y, paneKey: state.crosshair?.paneKey ?? "price", bar, source: "keyboard" }
  return { ...withViewport(state, viewport), crosshair }
}

function restore(state: InteractionState, result: { history: InteractionState["history"]; value: readonly Drawing[] }): InteractionState {
  const { drawings } = state
  const stillThere = result.value.some((shape) => shape.id === drawings.selectedId)
  return {
    ...state,
    history: result.history,
    drawings: { ...drawings, shapes: result.value, tool: null, pending: null, selectedId: stillThere ? drawings.selectedId : null },
    drag: null,
    preview: null,
  }
}

export function interactionReducer(state: InteractionState, action: InteractionAction, env: InteractionEnv): InteractionState {
  const { config } = env
  switch (action.type) {
    case "pointer-down":
      return pointerDown(state, action.pointer, env)
    case "pointer-move":
      return pointerMove(state, action.pointer, env)
    case "pointer-up":
      return pointerUp(state, action.pointer, env)
    case "pointer-cancel":
      return pointerCancel(state, action.pointerId)
    case "pointer-leave":
      return state.crosshair?.source === "pointer" || state.cursor !== "default" ? { ...state, crosshair: state.crosshair?.source === "pointer" ? null : state.crosshair, cursor: "default" } : state
    case "double-click":
      return doubleClick(state, action.pointer, env)
    case "long-press":
      return longPress(state, action.pointerId, env)
    case "wheel":
      return wheel(state, action.wheel, env)
    case "key": {
      const mapped = keyToAction(action.key, config, state)
      return mapped ? interactionReducer(state, mapped, env) : state
    }
    case "zoom":
      return config.zoom ? withViewport(state, opsOf(env).zoom(state.viewport, 0.5, action.direction === "in" ? ZOOM_STEP : 1 / ZOOM_STEP)) : state
    case "pan":
      return config.pan ? withViewport(state, opsOf(env).pan(state.viewport, action.bars)) : state
    case "reset":
      return resetView(state, env)
    case "set-viewport":
      return config.mode === "static" ? state : withViewport(state, opsOf(env).clamp(action.viewport))
    case "reset-price-scale": {
      if (!(action.paneKey in state.priceScale)) return state
      const priceScale = { ...state.priceScale }
      delete priceScale[action.paneKey]
      return { ...state, priceScale }
    }
    case "tool": {
      if (!canDraw(env) || (action.tool !== null && !config.allowedTools.includes(action.tool))) return state
      const drawings = drawingsReducer(state.drawings, { type: "tool", tool: action.tool })
      return { ...state, drawings, drag: null, preview: null }
    }
    case "magnet": {
      const magnet = normalizeMagnet(action.on)
      return state.magnet === magnet ? state : { ...state, magnet }
    }
    case "undo": {
      const result = config.history ? undoHistory(state.history, state.drawings.shapes) : null
      return result ? restore(state, result) : state
    }
    case "redo": {
      const result = config.history ? redoHistory(state.history, state.drawings.shapes) : null
      return result ? restore(state, result) : state
    }
    case "drawing": {
      const inner = action.action
      if (!canDraw(env) || inner.type === "tool" || inner.type === "anchor" || inner.type === "load") return state
      const drawings = drawingsReducer(state.drawings, inner)
      return drawings === state.drawings ? state : applyDrawings(state, drawings, env)
    }
    case "set-drawings":
      return canDraw(env)
        ? { ...state, drawings: drawingsReducer(state.drawings, { type: "load", drawings: action.drawings }), history: { ...state.history, past: [], future: [] }, drag: null, preview: null }
        : state
    case "move-crosshair":
      return moveCrosshair(state, action.bars, env)
    case "clear-crosshair":
      return state.crosshair ? { ...state, crosshair: null } : state
  }
}
