/**
 * Vỏ React tối thiểu của IQLine (docs/iqline-design.md §6-§7): bốn lớp canvas, `ResizeObserver`, DPR, và vừa đủ
 * tương tác để chạy demo (crosshair, lăn chuột để zoom, kéo để di chuyển, kéo đường ngăn để đổi chiều cao ô, nhấp
 * đúp để về khung mặc định, phím mũi tên và +/-). Chưa có thanh công cụ, hộp thoại, chú giải DOM hay công cụ vẽ.
 *
 * Mọi tính toán hình học nằm ở `core/` và `scene/`; component này chỉ giữ trạng thái viewport, đo kích thước và gọi
 * `render/`. Di chuột không render lại React: con trỏ nằm trong ref và chỉ lớp trên cùng được vẽ lại.
 */
import { useEffect, useMemo, useRef, useState } from "react"

import { AXIS_HEIGHT, findPaneBoundary, resizePanes } from "../core/layout"
import {
  clampViewport,
  defaultViewport,
  fitViewport,
  followAppend,
  panViewport,
  panViewportByPixels,
  prependedCount,
  shiftForPrepend,
  viewportLimits,
  zoomViewport,
} from "../core/viewport"
import { createCanvasStack, resolveDpr, type CanvasStack } from "../render/canvas-stack"
import { SceneBuilder, indexAtPointer, type Pointer } from "../scene/builder"
import { markPositions, MARK_RADIUS } from "../scene/marks"
import {
  createChartData,
  createFrame,
  naturalHeight,
  type ChartDataInput,
  type ChartFrame,
  type SceneIndicator,
} from "../scene/model"
import type { PriceLevels } from "../scene/colors"
import { valuesAtIndex, type IndexValues } from "../scene/values"
import type { Bar, ChartMark, ChartType, Interval, PriceScaleMode, Scene, SessionMarker, TimedBar, Viewport } from "../types"

/** Độ rộng cột giá bên phải (CSS pixel), như `PAD_RIGHT` của biểu đồ Flashback hiện tại. */
export const AXIS_RIGHT = 62
/** Số nến mặc định hiện ở `market` và số ô trống chừa bên phải. */
const DEFAULT_VISIBLE = 120
const DEFAULT_RIGHT_PAD = 5
/** `market` cho kéo ra khoảng trống hai đầu; `flashback` không. */
const MARKET_LEFT_PAD = 10
const MARKET_RIGHT_PAD = 50
const WHEEL_SENSITIVITY = 0.0015
const KEY_ZOOM = 1.25
/** Kéo quá ngần này pixel thì coi là kéo chứ không phải bấm. */
const CLICK_SLOP = 4

type CanvasCommon = {
  theme: "light" | "dark"
  chartType?: ChartType
  priceScaleMode?: PriceScaleMode
  indicators?: readonly SceneIndicator[]
  /** Đổi giá trị này khi đổi mã hoặc khung để về viewport mặc định thay vì giữ vị trí cũ. */
  resetKey?: string
  /** Viewport điều khiển từ ngoài; bỏ qua thì component tự giữ. */
  viewport?: Viewport | null
  onViewportChange?: (viewport: Viewport) => void
  /** Chiều cao ô đã kéo đổi (khoá ô: `v`, `i{khoá}`). */
  paneHeights?: Readonly<Record<string, number>>
  onPaneHeightsChange?: (heights: Record<string, number>) => void
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  interaction?: { zoom?: boolean; pan?: boolean }
  /** Lớp hình vẽ do `drawings/` dựng từ `frame.price.coords`; gọi lại mỗi khi lớp này cần vẽ. */
  renderDrawings?: (frame: ChartFrame) => Scene
  /** Đổi giá trị này để vẽ lại lớp hình vẽ khi hình thay đổi mà `renderDrawings` vẫn là hàm cũ. */
  drawingsVersion?: number
  /** Giá trị tại nến dưới con trỏ (cho chú giải DOM); null khi con trỏ rời hoặc ở ô tương lai. */
  onCrosshairChange?: (values: IndexValues | null) => void
  className?: string
  ariaLabel?: string
}

export type MarketCanvasProps = CanvasCommon & {
  mode: "market"
  bars: readonly TimedBar[]
  interval: Interval
  priceLevels?: PriceLevels
  marks?: readonly ChartMark[]
  onMarkClick?: (id: string | number) => void
  warmup?: never
  totalSlots?: never
  formatX?: never
  markers?: never
  divider?: never
  available?: never
}

export type FlashbackCanvasProps = CanvasCommon & {
  mode: "flashback"
  /** Toàn bộ nến đã mở, gồm `warmup` nến đầu chỉ để tính chỉ báo. Không có trường thời gian. */
  bars: readonly Bar[]
  warmup: number
  totalSlots: number
  formatX: (session: number) => string
  markers?: readonly SessionMarker[]
  divider?: number
  /** Chiều cao màn hình còn trống cho biểu đồ (null khi chưa đo): ô giá lấy phần còn lại. */
  available?: number | null
  interval?: never
  priceLevels?: never
  marks?: never
  onMarkClick?: never
}

export type IQLineCanvasProps = MarketCanvasProps | FlashbackCanvasProps

type Size = { width: number; height: number; dpr: number }

const CHART_TYPE_LABEL: Record<ChartType, string> = {
  candles: "nến",
  hollow: "nến rỗng",
  ohlc: "thanh OHLC",
  line: "đường",
  area: "vùng",
  "heikin-ashi": "Heikin Ashi",
}

/** Mọi thứ cần cho khung hình kế tiếp, để trình xử lý sự kiện đọc mà không phải đăng ký lại. */
type Live = {
  frame: ChartFrame | null
  viewport: Viewport | null
  limits: ReturnType<typeof viewportLimits> | null
  fit: Viewport | null
  props: IQLineCanvasProps
  commitViewport: (viewport: Viewport) => void
  commitHeights: (heights: Record<string, number>) => void
}

export function IQLineCanvas(props: IQLineCanvasProps) {
  const {
    mode,
    bars,
    interval,
    warmup,
    totalSlots,
    theme,
    chartType = "candles",
    priceScaleMode = "linear",
    indicators,
    priceLevels,
    marks,
    markers,
    divider,
    available,
    resetKey,
    labelToken,
    formatPrice,
    formatX,
    paneHeights: controlledHeights,
    viewport: controlledViewport,
    className,
    ariaLabel,
  } = props

  const hostRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<CanvasStack | null>(null)
  const liveRef = useRef<Live | null>(null)
  const pointerRef = useRef<Pointer | null>(null)
  const lastIndexRef = useRef<number | null>(null)
  const [builder] = useState(() => new SceneBuilder())
  const [size, setSize] = useState<Size>({ width: 0, height: 0, dpr: 1 })
  const [viewportState, setViewportState] = useState<Viewport | null>(null)
  const [heightsState, setHeightsState] = useState<Record<string, number>>({})
  const [tracked, setTracked] = useState<{ resetKey: string | undefined; mode: string; interval: string | undefined; first: number | null; count: number }>({
    resetKey,
    mode,
    interval,
    first: null,
    count: 0,
  })

  // ---- dữ liệu: chỉ tính lại khi dữ liệu hoặc kiểu hiển thị đổi, không tính lại khi zoom và kéo.
  const data = useMemo(() => {
    const common = { chartType, indicators: indicators ?? [] }
    const input: ChartDataInput =
      mode === "market"
        ? { ...common, mode, bars: bars as readonly TimedBar[], interval: interval as Interval, priceLevels, marks }
        : { ...common, mode, bars, warmup: warmup as number, totalSlots: totalSlots as number, markers, divider }
    return createChartData(input)
  }, [mode, bars, interval, warmup, totalSlots, chartType, indicators, priceLevels, marks, markers, divider])

  const plotWidth = Math.max(1, size.width - AXIS_RIGHT)
  const market = mode === "market"
  const limits = useMemo(
    () => viewportLimits({ slots: data.slots, leftPad: market ? MARKET_LEFT_PAD : 0, rightPad: market ? MARKET_RIGHT_PAD : 0, plotWidth }),
    [data.slots, market, plotWidth],
  )
  const fit = useMemo(() => fitViewport(limits), [limits])
  const initial = useMemo(
    () => (market ? defaultViewport({ slots: data.slots, visible: Math.min(DEFAULT_VISIBLE, Math.max(1, data.count)), rightPad: DEFAULT_RIGHT_PAD }, limits) : fit),
    [market, data.slots, data.count, limits, fit],
  )

  // ---- nạp thêm lịch sử, nến mới, đổi mã hoặc khung: điều chỉnh viewport ngay trong lượt render, trước khi vẽ.
  const first = data.timeScale.kind === "market" && data.count > 0 ? data.timeScale.times[0] : null
  if (tracked.resetKey !== resetKey || tracked.mode !== mode || tracked.interval !== interval || tracked.first !== first || tracked.count !== data.count) {
    const sameSeries = tracked.resetKey === resetKey && tracked.mode === mode && tracked.interval === interval
    setTracked({ resetKey, mode, interval, first, count: data.count })
    if (!sameSeries) {
      setViewportState(null)
    } else if (viewportState) {
      const added = data.timeScale.kind === "market" ? prependedCount(tracked.first, data.timeScale.times) : 0
      if (added > 0) setViewportState(shiftForPrepend(viewportState, added))
      else if (tracked.first === first) setViewportState(followAppend(viewportState, tracked.count, data.count))
    }
  }

  const rawViewport = controlledViewport ?? viewportState ?? initial
  const viewport = useMemo(() => clampViewport(rawViewport, limits), [rawViewport, limits])
  const paneHeights = controlledHeights ?? heightsState

  const height = mode === "flashback" ? naturalHeight(data, { width: size.width, available: available ?? null, paneHeights }) : size.height
  const frame = useMemo(
    () =>
      size.width > 0 && height > 0
        ? createFrame(data, {
            viewport,
            geometry: { width: size.width, height, dpr: size.dpr, axisRight: AXIS_RIGHT, axisBottom: AXIS_HEIGHT },
            priceScaleMode,
            paneHeights,
            labelToken,
            formatPrice,
            formatX,
          })
        : null,
    [data, viewport, size.width, size.dpr, height, priceScaleMode, paneHeights, labelToken, formatPrice, formatX],
  )

  const onViewportChange = props.onViewportChange
  const onPaneHeightsChange = props.onPaneHeightsChange
  const controlled = controlledViewport !== undefined && controlledViewport !== null
  const controlledHeightsSet = controlledHeights !== undefined

  // Trình xử lý sự kiện đọc trạng thái mới nhất qua ref; ghi ref chỉ trong effect.
  useEffect(() => {
    liveRef.current = {
      frame,
      viewport,
      limits,
      fit,
      props,
      commitViewport: (next) => {
        if (liveRef.current) liveRef.current.viewport = next
        if (!controlled) setViewportState(next)
        onViewportChange?.(next)
      },
      commitHeights: (next) => {
        if (!controlledHeightsSet) setHeightsState(next)
        onPaneHeightsChange?.(next)
      },
    }
  })

  // ---- tạo bốn lớp canvas, theo dõi kích thước, gắn tương tác.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const stack = createCanvasStack(host, {
      build: (layer) => {
        const live = liveRef.current
        const current = live?.frame
        if (!live || !current) return null
        if (layer === "base") return builder.base(current)
        if (layer === "data") return builder.data(current)
        if (layer === "top") return builder.top(current, pointerRef.current)
        return live.props.renderDrawings ? live.props.renderDrawings(current) : builder.drawings()
      },
    })
    stackRef.current = stack

    const measure = (entry?: ResizeObserverEntry) => {
      const box = entry?.contentRect
      const width = Math.round(box?.width ?? host.clientWidth)
      const nextHeight = Math.round(box?.height ?? host.clientHeight)
      setSize((previous) => {
        const dpr = resolveDpr(undefined)
        return previous.width === width && previous.height === nextHeight && previous.dpr === dpr ? previous : { width, height: nextHeight, dpr }
      })
    }
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => measure(entries[0]))
    observer?.observe(host)

    const canvas = stack.interactive
    let drag: { kind: "pan"; x: number; moved: number } | { kind: "pane"; boundary: number; y: number; layout: ChartFrame["layout"] } | null = null
    let pressed = false

    const local = (event: { clientX: number; clientY: number }): Pointer => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const announce = (point: Pointer | null) => {
      const live = liveRef.current
      const callback = live?.props.onCrosshairChange
      if (!callback || !live?.frame) return
      const index = point ? indexAtPointer(live.frame, point) : null
      if (index === lastIndexRef.current) return
      lastIndexRef.current = index
      callback(index === null ? null : valuesAtIndex(live.frame.data, index))
    }

    const onMove = (event: PointerEvent) => {
      const live = liveRef.current
      if (!live?.frame || !live.viewport || !live.limits) return
      const point = local(event)
      if (drag?.kind === "pan") {
        if (live.props.interaction?.pan === false) return
        const dx = point.x - drag.x
        drag.moved += Math.abs(dx)
        drag.x = point.x
        live.commitViewport(panViewportByPixels(live.viewport, dx, live.frame.plot.width, live.limits))
        return
      }
      if (drag?.kind === "pane") {
        live.commitHeights(resizePanes(drag.layout, drag.boundary, point.y - drag.y))
        return
      }
      pointerRef.current = point
      canvas.style.cursor = findPaneBoundary(live.frame.layout, point.y) !== null ? "ns-resize" : "crosshair"
      announce(point)
      stack.invalidate("top")
    }

    const onDown = (event: PointerEvent) => {
      const live = liveRef.current
      if (!live?.frame || event.button > 0) return
      const point = local(event)
      pressed = true
      const boundary = live.props.mode === "market" ? findPaneBoundary(live.frame.layout, point.y) : null
      drag = boundary !== null ? { kind: "pane", boundary, y: point.y, layout: live.frame.layout } : { kind: "pan", x: point.x, moved: 0 }
      canvas.setPointerCapture?.(event.pointerId)
      if (drag.kind === "pan") canvas.style.cursor = "grabbing"
    }

    const onUp = (event: PointerEvent) => {
      const live = liveRef.current
      const wasClick = drag?.kind === "pan" && drag.moved < CLICK_SLOP
      drag = null
      if (!pressed) return
      pressed = false
      canvas.style.cursor = "crosshair"
      canvas.releasePointerCapture?.(event.pointerId)
      if (wasClick && live?.frame && live.props.mode === "market" && live.props.onMarkClick) {
        const point = local(event)
        const hit = markPositions(live.frame).find((mark) => Math.hypot(mark.x - point.x, mark.y - point.y) <= MARK_RADIUS + 3)
        if (hit) live.props.onMarkClick(hit.id)
      }
    }

    const onLeave = () => {
      if (drag) return
      pointerRef.current = null
      announce(null)
      stack.invalidate("top")
    }

    const onWheel = (event: WheelEvent) => {
      const live = liveRef.current
      if (!live?.frame || !live.viewport || !live.limits) return
      const { interaction } = live.props
      // `market` dùng con lăn để zoom; `flashback` cho trang cuộn nên chỉ zoom khi giữ Ctrl (docs/iqline-design.md §7).
      if (live.props.mode === "flashback" && !event.ctrlKey) return
      if (interaction?.zoom === false) return
      event.preventDefault()
      const point = local(event)
      const anchor = live.frame.price.coords.indexOfX(point.x)
      live.commitViewport(zoomViewport(live.viewport, Math.exp(event.deltaY * WHEEL_SENSITIVITY), anchor, live.limits))
    }

    const onDouble = () => {
      const live = liveRef.current
      if (live?.fit && live.limits) live.commitViewport(live.props.mode === "market" ? clampViewport(defaultViewport({ slots: live.frame?.data.slots ?? 0, visible: DEFAULT_VISIBLE, rightPad: DEFAULT_RIGHT_PAD }, live.limits), live.limits) : live.fit)
    }

    const onKey = (event: KeyboardEvent) => {
      const live = liveRef.current
      if (!live?.viewport || !live.limits || !live.frame) return
      const span = live.viewport.to - live.viewport.from
      const anchor = (live.viewport.from + live.viewport.to) / 2
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (live.props.interaction?.pan === false) return
        event.preventDefault()
        live.commitViewport(panViewport(live.viewport, (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? Math.max(1, span / 4) : 1), live.limits))
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        if (live.props.interaction?.zoom === false) return
        event.preventDefault()
        live.commitViewport(zoomViewport(live.viewport, event.key === "-" ? KEY_ZOOM : 1 / KEY_ZOOM, anchor, live.limits))
      }
    }

    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("dblclick", onDouble)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    host.addEventListener("keydown", onKey)

    return () => {
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("dblclick", onDouble)
      canvas.removeEventListener("wheel", onWheel)
      host.removeEventListener("keydown", onKey)
      observer?.disconnect()
      stack.destroy()
      stackRef.current = null
    }
    // Chỉ tạo một lần; trạng thái mới nhất đi qua `liveRef`.
  }, [builder])

  // ---- đầu vào đổi thì đặt lại kích thước và yêu cầu vẽ lại mọi lớp (gom vào một rAF trong CanvasStack).
  useEffect(() => {
    const stack = stackRef.current
    if (!stack || !frame) return
    stack.resize(size.width, height, size.dpr)
  }, [frame, size.width, size.dpr, height])

  useEffect(() => {
    stackRef.current?.invalidate("drawings")
  }, [props.renderDrawings, props.drawingsVersion, frame])

  useEffect(() => {
    stackRef.current?.refreshPalette()
  }, [theme])

  const label = ariaLabel ?? `Biểu đồ ${CHART_TYPE_LABEL[chartType]}${mode === "flashback" ? " Flashback" : ""}`
  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      tabIndex={0}
      data-iqline-mode={mode}
      className={className}
      style={{ position: "relative", width: "100%", height: mode === "flashback" ? height || undefined : "100%", minHeight: mode === "flashback" ? height || undefined : undefined, outline: "none" }}
    />
  )
}
