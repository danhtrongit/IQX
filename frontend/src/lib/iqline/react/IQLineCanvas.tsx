/**
 * Lớp view của IQLine (docs/iqline-design.md §6-§7): bốn lớp canvas, đổi sự kiện DOM (con trỏ, chạm, con lăn, phím) sang hành động
 * của `interactionReducer` qua `chart.controller`, và kéo đường ngăn để đổi chiều cao ô (`market`). Mọi tính toán nằm ở
 * `use-iqline-chart.ts`, `core/`, `scene/` và `interaction/`; component này không giữ trạng thái nào.
 *
 * `IQLineCanvas` là dạng gọn: tự gọi `useIQLineChart` rồi dựng `IQLineCanvasView`. Trang cần chú giải, thanh công cụ hay hộp thoại thì
 * gọi hook riêng và dùng `IQLineCanvasView` (xem `IQLine.tsx`).
 *
 * Chạm: `touch-action: pan-y` để vuốt dọc cuộn trang; vuốt ngang một ngón là kéo, hai ngón là chụm để zoom, nhấn giữ `LONG_PRESS_MS` rồi
 * kéo là crosshair. Đang chọn công cụ vẽ thì `touch-action: none` (như Flashback hiện tại).
 */
import { useEffect, useRef } from "react"

import { findPaneBoundary, resizePanes, type ChartLayout } from "../core/layout"
import { LONG_PRESS_MS, LONG_PRESS_SLOP, type CursorHint, type PointerInput, type PointerKind } from "../interaction"
import { createCanvasStack } from "../render/canvas-stack"
import { MARK_RADIUS, markPositions } from "../scene/marks"
import type { ChartType } from "../types"
import { useIQLineChart, type IQLineChart, type IQLineChartOptions } from "./use-iqline-chart"

export { AXIS_RIGHT } from "./chart-helpers"
export type { FlashbackChartOptions as FlashbackCanvasProps, IQLineChartOptions as IQLineCanvasProps, MarketChartOptions as MarketCanvasProps } from "./use-iqline-chart"

/** Kéo quá ngần này pixel thì coi là kéo chứ không phải bấm. */
const CLICK_SLOP = 4

const CHART_TYPE_LABEL: Record<ChartType, string> = {
  candles: "nến",
  hollow: "nến rỗng",
  ohlc: "thanh OHLC",
  line: "đường",
  area: "vùng",
  "heikin-ashi": "Heikin Ashi",
}

const CURSOR: Record<CursorHint, string> = {
  default: "crosshair",
  crosshair: "crosshair",
  pointer: "pointer",
  grabbing: "grabbing",
  "ns-resize": "ns-resize",
  "ew-resize": "ew-resize",
}

const kindOf = (type: string | undefined): PointerKind => (type === "touch" ? "touch" : type === "pen" ? "pen" : "mouse")

type PaneDrag = { boundary: number; y: number; layout: ChartLayout }

export function IQLineCanvasView({ chart }: { chart: IQLineChart }) {
  const { controller, hostRef, mode, options } = chart
  const hoverBoundary = useRef(false)

  // ---- bốn lớp canvas và sự kiện; chỉ tạo một lần, trạng thái mới nhất đi qua `controller`.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const stack = createCanvasStack(host, { build: (layer) => controller.buildLayer(layer) })
    controller.attach(stack)
    const canvas = stack.interactive

    let paneDrag: PaneDrag | null = null
    let press: { id: number; x: number; y: number; moved: number } | null = null
    let longPress: ReturnType<typeof setTimeout> | undefined
    const touchIds = new Set<number>()

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const pointerOf = (event: PointerEvent | MouseEvent, point: { x: number; y: number }): PointerInput => ({
      pointerId: (event as PointerEvent).pointerId ?? 1,
      pointerType: kindOf((event as PointerEvent).pointerType),
      x: point.x,
      y: point.y,
      target: controller.targetAt(point.x, point.y),
      button: event.button,
    })
    const applyCursor = () => {
      canvas.style.cursor = hoverBoundary.current ? "ns-resize" : CURSOR[controller.getState().cursor]
    }
    const clearLongPress = () => {
      clearTimeout(longPress)
      longPress = undefined
    }

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && event.button > 0) return
      host.focus({ preventScroll: true })
      const point = local(event)
      const frame = controller.getFrame()
      const live = controller.getOptions()
      const resizable = live?.mode === "market" && live.resizablePanes !== false
      if (resizable && frame && point.x <= frame.plot.right && controller.getState().drawings.tool === null) {
        const boundary = findPaneBoundary(frame.layout, point.y)
        if (boundary !== null) {
          paneDrag = { boundary, y: point.y, layout: frame.layout }
          canvas.setPointerCapture?.(event.pointerId)
          return
        }
      }
      press = { id: event.pointerId ?? 1, x: point.x, y: point.y, moved: 0 }
      if (event.pointerType === "touch") {
        touchIds.add(event.pointerId)
        clearLongPress()
        if (touchIds.size === 1) {
          const id = event.pointerId
          longPress = setTimeout(() => {
            controller.dispatch({ type: "long-press", pointerId: id })
            applyCursor()
          }, LONG_PRESS_MS)
        }
      }
      controller.dispatch({ type: "pointer-down", pointer: pointerOf(event, point) })
      canvas.setPointerCapture?.(event.pointerId)
      applyCursor()
    }

    const onMove = (event: PointerEvent) => {
      const point = local(event)
      if (paneDrag) {
        controller.setPaneHeights(resizePanes(paneDrag.layout, paneDrag.boundary, point.y - paneDrag.y))
        return
      }
      if (press && press.id === (event.pointerId ?? 1)) {
        press.moved = Math.max(press.moved, Math.hypot(point.x - press.x, point.y - press.y))
        if (press.moved > LONG_PRESS_SLOP) clearLongPress()
      }
      if (!press) {
        const frame = controller.getFrame()
        const live = controller.getOptions()
        const resizable = live?.mode === "market" && live.resizablePanes !== false
        hoverBoundary.current = Boolean(resizable && frame && point.x <= frame.plot.right && controller.getState().drawings.tool === null && findPaneBoundary(frame.layout, point.y) !== null)
      }
      controller.dispatch({ type: "pointer-move", pointer: pointerOf(event, point) })
      applyCursor()
    }

    const onUp = (event: PointerEvent) => {
      clearLongPress()
      touchIds.delete(event.pointerId)
      canvas.releasePointerCapture?.(event.pointerId)
      if (paneDrag) {
        paneDrag = null
        return
      }
      const point = local(event)
      const current = press
      press = null
      if (event.type === "pointercancel") controller.dispatch({ type: "pointer-cancel", pointerId: event.pointerId ?? 1 })
      else controller.dispatch({ type: "pointer-up", pointer: pointerOf(event, point) })
      applyCursor()
      const frame = controller.getFrame()
      const live = controller.getOptions()
      if (current && current.moved < CLICK_SLOP && event.type !== "pointercancel" && frame && live?.mode === "market" && live.onMarkClick && controller.getState().drawings.tool === null) {
        const hit = markPositions(frame).find((mark) => Math.hypot(mark.x - point.x, mark.y - point.y) <= MARK_RADIUS + 3)
        if (hit) live.onMarkClick(hit.id)
      }
    }

    const onLeave = () => {
      hoverBoundary.current = false
      controller.dispatch({ type: "pointer-leave" })
      applyCursor()
    }

    const onDouble = (event: MouseEvent) => {
      controller.dispatch({ type: "double-click", pointer: pointerOf(event, local(event)) })
    }

    const onWheel = (event: WheelEvent) => {
      const point = local(event)
      const handled = controller.wheel({
        x: point.x,
        y: point.y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode === 1 || event.deltaMode === 2 ? event.deltaMode : 0,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      })
      if (handled) event.preventDefault()
    }

    // Đang kéo crosshair bằng ngón tay hoặc đang vẽ thì không để trang cuộn theo.
    const onTouchMove = (event: TouchEvent) => {
      const state = controller.getState()
      if (event.cancelable && (state.drag?.kind === "crosshair" || state.drag?.kind === "draw" || state.drawings.tool !== null)) event.preventDefault()
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return
      if (controller.key({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey })) event.preventDefault()
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("dblclick", onDouble)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("touchmove", onTouchMove, { passive: false })
    host.addEventListener("keydown", onKey)

    return () => {
      clearLongPress()
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("dblclick", onDouble)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("touchmove", onTouchMove)
      host.removeEventListener("keydown", onKey)
      controller.attach(null)
      stack.destroy()
    }
  }, [controller, hostRef])

  // ---- đổi kích thước canvas (xoá nội dung nên vẽ lại mọi lớp).
  const { width, dpr } = chart.size
  const { height } = chart
  const hasFrame = chart.frame !== null
  useEffect(() => {
    if (hasFrame) controller.resize(width, height, dpr)
  }, [controller, hasFrame, width, height, dpr])

  // ---- con trỏ và cử chỉ theo trạng thái.
  const { cursor, drawings, drag } = chart.state
  const drawingActive = drawings.tool !== null || drag?.kind === "draw"
  useEffect(() => {
    controller.setCanvasStyle(drawingActive ? "none" : "pan-y", hoverBoundary.current ? null : CURSOR[cursor])
  }, [controller, cursor, drawingActive])

  const label = options.ariaLabel ?? `Biểu đồ ${CHART_TYPE_LABEL[options.chartType ?? "candles"]}${mode === "flashback" ? " Flashback" : ""}`
  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      data-iqline-mode={mode}
      className={options.className}
      style={{ position: "relative", width: "100%", height: mode === "flashback" ? chart.height || undefined : "100%", minHeight: mode === "flashback" ? chart.height || undefined : undefined, outline: "none" }}
    />
  )
}

/** Dạng gọn: biểu đồ không có chú giải, thanh công cụ hay hộp thoại. */
export function IQLineCanvas(props: IQLineChartOptions) {
  const chart = useIQLineChart(props)
  return <IQLineCanvasView chart={chart} />
}
