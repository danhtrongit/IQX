/**
 * Bộ điều khiển dùng chung của IQLine (docs/iqline-design.md §6, §7): nối dữ liệu, chỉ báo, `interactionReducer` và hình vẽ với bốn lớp
 * canvas. `market` và `flashback` cùng dùng hook này; mọi khác biệt giữa hai chế độ nằm ở `InteractionConfig` và ở các tuỳ chọn, trong
 * hook không có gì riêng của một trang.
 *
 * Cách dùng:
 *
 * ```tsx
 * const chart = useIQLineChart({ mode: "market", theme, bars, interval, indicatorInputs, resetKey, documentKey, ... })
 * return (
 *   <div className="relative size-full">
 *     <IQLineCanvasView chart={chart} />                   // bốn lớp canvas, nhận con trỏ, chạm, phím
 *     <div className="pointer-events-none absolute inset-0"> // chú giải DOM nằm NGOÀI khung role="img"
 *       <ChartLegend chart={chart} ... />
 *     </div>
 *   </div>
 * )
 * ```
 *
 * Luồng dữ liệu: `props -> indicatorInputs -> (cache) -> ChartData -> createFrame(state.viewport, state.priceScale) -> ChartFrame`.
 * Mỗi sự kiện gọi `chart.controller.dispatch(action)`: bộ giảm chạy với `{ config, coords: frame.price.coords, bars: data.raw }`, rồi
 * khung hình được dựng lại ngay theo `state.viewport` (để sự kiện kế tiếp đọc toạ độ đúng) và chỉ những lớp canvas bị ảnh hưởng được vẽ
 * lại. React render sau đó chỉ để cập nhật DOM (chú giải, thanh công cụ).
 *
 * Quy tắc vòng đời: đổi `resetKey` (mã hoặc khung) thì về viewport mặc định và giữ hình vẽ; đổi `documentKey` (mã) thì bỏ hình và
 * lịch sử hoàn tác. Callback nằm trong ref nên đổi hàm không dựng lại gì. Đổi `theme` chỉ đọc lại token màu.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"

import { NARROW_WIDTH } from "../core/layout"
import { clampViewport, defaultViewport, followAppend, prependedCount, shiftForPrepend, viewportLimits } from "../core/viewport"
import { canRedo, canUndo, createInteractionState, flashbackConfig, interactionReducer, keyToAction, marketConfig, wheelIntent, limitsOf } from "../interaction"
import type { InteractionAction, InteractionConfig, InteractionState, PointerTarget } from "../interaction"
import { createIndicatorCache, VOLUME_PROFILE_ID, type IndicatorCache } from "../indicators"
import { indicatorPalette } from "../scene/colors"
import type { PriceLevels } from "../scene/colors"
import { SceneBuilder } from "../scene/builder"
import { createChartData, naturalHeight, type ChartData, type ChartDataInput, type ChartFrame, type SceneIndicator } from "../scene/model"
import { valuesAtIndex, type IndexValues } from "../scene/values"
import { resolveDpr, type CanvasStack } from "../render/canvas-stack"
import type { AiOverlay, Bar, ChartIndicatorInput, ChartMark, ChartMode, ChartType, Interval, Layer, PaneCoords, PriceScaleMode, Scene, SessionMarker, TimedBar, Viewport } from "../types"
import { AXIS_RIGHT, buildFrame, layerScene, sceneIndicatorsFor, targetAt, type FrameInputs } from "./chart-helpers"

export { AXIS_RIGHT } from "./chart-helpers"

/** Số nến mặc định hiện ở `market` và số ô trống chừa bên phải. */
export const DEFAULT_VISIBLE = 120
const DEFAULT_RIGHT_PAD = 5
/** `market` cho kéo ra khoảng trống hai đầu; `flashback` không. */
export const MARKET_LEFT_PAD = 10
export const MARKET_RIGHT_PAD = 50

type Size = { width: number; height: number; dpr: number }

type ChartCommon = {
  theme: "light" | "dark"
  chartType?: ChartType
  priceScaleMode?: PriceScaleMode
  /** Chỉ báo đã tính sẵn cho scene; nếu có thì bỏ qua `indicatorInputs`. */
  indicators?: readonly SceneIndicator[]
  /** Chỉ báo đầu vào: hook tính (có ghi nhớ), Volume Profile tính theo viewport. Flashback bỏ qua chỉ báo chỉ có ở `market`. */
  indicatorInputs?: readonly ChartIndicatorInput[]
  /** Đổi giá trị này khi đổi mã hoặc khung để về viewport mặc định thay vì giữ vị trí cũ. Hình vẽ được giữ. */
  resetKey?: string
  /** Đổi giá trị này khi đổi mã để bỏ hình vẽ và lịch sử hoàn tác của mã cũ. */
  documentKey?: string
  /** Chiều cao ô đã kéo đổi (khoá ô: `v`, `i{khoá}`). Bỏ qua thì hook tự giữ. */
  paneHeights?: Readonly<Record<string, number>>
  onPaneHeightsChange?: (heights: Record<string, number>) => void
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  interaction?: { zoom?: boolean; pan?: boolean }
  /** Lớp AI vẽ dưới hình của người dùng. */
  overlays?: readonly AiOverlay[]
  /** Lớp hình vẽ bổ sung do bên dùng dựng từ `frame.price.coords`; vẽ sau hình của người dùng. */
  renderDrawings?: (frame: ChartFrame) => Scene
  /** Đổi giá trị này để vẽ lại lớp hình vẽ khi `renderDrawings` vẫn là hàm cũ. */
  drawingsVersion?: number
  onViewportChange?: (viewport: Viewport) => void
  /** Hình vẽ đổi do người dùng (vẽ, kéo, xoá, hoàn tác). KHÔNG gọi khi nạp từ kho (`set-drawings`). */
  onDrawingsChange?: (drawings: InteractionState["drawings"]["shapes"]) => void
  /** Giá trị tại nến dưới crosshair (cho chú giải DOM); null khi crosshair rời hoặc ở ô tương lai. Chỉ gọi khi đổi nến. */
  onCrosshairChange?: (values: IndexValues | null) => void
  /** Có cho kéo đổi chiều cao ô không (chỉ `market`); mặc định có. */
  resizablePanes?: boolean
  className?: string
  ariaLabel?: string
}

export type MarketChartOptions = ChartCommon & {
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
  pageNarrow?: never
  indicatorTitle?: never
}

export type FlashbackChartOptions = ChartCommon & {
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
  /** Cửa sổ hẹp (trang dùng bố cục điện thoại): chiều cao các ô theo cột điện thoại dù biểu đồ rộng hơn `NARROW_WIDTH`. */
  pageNarrow?: boolean
  /** Đổi tên hiển thị của chỉ báo ("RSI 14" của Flashback thay vì "RSI (14)"); bỏ trống thì theo `indicatorTitle`. */
  indicatorTitle?: (input: ChartIndicatorInput, fallback: string) => string
  interval?: never
  priceLevels?: never
  marks?: never
  onMarkClick?: never
}

export type IQLineChartOptions = MarketChartOptions | FlashbackChartOptions

/** Mọi thứ cần cho sự kiện kế tiếp, đọc qua ref để không phải đăng ký lại bộ lắng nghe. */
type Live = {
  options: IQLineChartOptions
  config: InteractionConfig
  data: ChartData
  size: Size
  height: number
  heights: Readonly<Record<string, number>>
  state: InteractionState
  frame: ChartFrame | null
}

/** Phép đổi toạ độ giả khi chưa đo được kích thước, đủ cho các hành động không cần toạ độ (đổi công cụ, nạp hình, hoàn tác). */
const STUB_COORDS: PaneCoords = {
  xOfIndex: (index) => index,
  indexOfX: (x) => x,
  yOfPrice: (price) => price,
  priceOfY: (y) => y,
  indexOfAnchor: () => null,
  anchorAt: (index, price) => ({ session: index, price }),
  plot: { left: 0, top: 0, right: 1, bottom: 1 },
}

const ALL_LAYERS: readonly Layer[] = ["base", "data", "drawings", "top"]

/** API ổn định (không đổi giữa các lần render) cho lớp view và cho bên dùng bên ngoài. */
export type ChartController = {
  /** Gửi một hành động vào `interactionReducer` với môi trường mới nhất. */
  dispatch(action: InteractionAction): void
  getState(): InteractionState
  /** Khung hình mới nhất, đã dựng lại sau mỗi lần giảm; null khi chưa đo được kích thước. */
  getFrame(): ChartFrame | null
  getConfig(): InteractionConfig | null
  getOptions(): IQLineChartOptions | null
  /** Vùng dưới một điểm (CSS pixel trong canvas). */
  targetAt(x: number, y: number): PointerTarget
  /** Phím tắt: trả true nếu đã xử lý (bên gọi `preventDefault`). Bên gọi tự bỏ qua phím gõ trong ô nhập. */
  key(key: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }): boolean
  /** Con lăn: trả true nếu đã xử lý (bên gọi `preventDefault`); false là để trang cuộn. */
  wheel(input: { x: number; y: number; deltaX: number; deltaY: number; deltaMode?: 0 | 1 | 2; ctrlKey?: boolean; shiftKey?: boolean }): boolean
  /** Kéo đổi chiều cao các ô (`market`). */
  setPaneHeights(heights: Record<string, number>): void
  /** Gắn hoặc gỡ bộ bốn lớp canvas; lớp view gọi. */
  attach(stack: CanvasStack | null): void
  /** Dựng cảnh một lớp từ trạng thái mới nhất; lớp view đưa vào `createCanvasStack`. */
  buildLayer(layer: Layer): Scene | null
  invalidate(...layers: Layer[]): void
  /** Đọc lại token màu (đổi giao diện sáng tối) rồi vẽ lại mọi lớp. */
  refreshPalette(): void
  /** Đặt kích thước canvas (xoá nội dung nên vẽ lại mọi lớp). */
  resize(width: number, height: number, dpr: number): void
  /** `touch-action` và (nếu không null) con trỏ của canvas nhận sự kiện. */
  setCanvasStyle(touchAction: "none" | "pan-y", cursor: string | null): void
  /** Ảnh PNG của bốn lớp canvas chồng lên nền `background` (màu CSS). Từ chối nếu canvas chưa gắn. */
  snapshot(background: string): Promise<Blob>
}

export type IQLineChart = {
  readonly mode: ChartMode
  /** Gắn vào khung chứa của `IQLineCanvasView` để đo kích thước. */
  readonly hostRef: RefObject<HTMLDivElement | null>
  readonly controller: ChartController
  readonly data: ChartData
  readonly frame: ChartFrame | null
  readonly state: InteractionState
  readonly config: InteractionConfig
  readonly size: Size
  /** Chiều cao canvas (CSS pixel): `market` theo khung chứa, `flashback` theo `chartLayout`. */
  readonly height: number
  readonly viewport: Viewport
  /** Giá trị tại nến dưới crosshair, hoặc nến cuối khi không có crosshair; null khi chưa có nến. */
  readonly values: IndexValues | null
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly options: IQLineChartOptions
}

function resetState(previous: InteractionState, config: InteractionConfig, keepDrawings: boolean): InteractionState {
  return { ...createInteractionState(config, keepDrawings ? previous.drawings.shapes : []), magnet: previous.magnet }
}

export function useIQLineChart(options: IQLineChartOptions): IQLineChart {
  const { mode, theme } = options
  const market = mode === "market"
  const hostRef = useRef<HTMLDivElement>(null)
  const [builder] = useState(() => new SceneBuilder())
  const [size, setSize] = useState<Size>({ width: 0, height: 0, dpr: 1 })
  const [heightsState, setHeightsState] = useState<Record<string, number>>({})

  const bars = options.bars
  const warmup = options.mode === "flashback" ? Math.max(0, Math.floor(options.warmup)) : 0
  const totalSlots = options.mode === "flashback" ? options.totalSlots : 0
  const realCount = Math.max(0, bars.length - warmup)
  const plotWidth = Math.max(1, size.width - AXIS_RIGHT)
  const zoomOption = options.interaction?.zoom
  const panOption = options.interaction?.pan

  const config = useMemo<InteractionConfig>(() => {
    if (!market) return flashbackConfig({ warmup, barCount: bars.length, totalSlots, zoom: zoomOption, pan: panOption })
    const limits = viewportLimits({ slots: realCount, leftPad: MARKET_LEFT_PAD, rightPad: MARKET_RIGHT_PAD, plotWidth })
    const initial = clampViewport(defaultViewport({ slots: realCount, visible: Math.min(DEFAULT_VISIBLE, Math.max(1, realCount)), rightPad: DEFAULT_RIGHT_PAD }, limits), limits)
    const base = marketConfig({ barCount: realCount, defaultViewport: initial, leftPad: MARKET_LEFT_PAD, rightPad: MARKET_RIGHT_PAD })
    return { ...base, zoom: zoomOption ?? true, pan: panOption ?? true }
  }, [market, warmup, bars.length, totalSlots, realCount, plotWidth, zoomOption, panOption])

  const [state, setState] = useState<InteractionState>(() => createInteractionState(config))
  const [controller] = useState<InternalController>(() => createController({ builder, setState, setHeightsState }))

  // ---- đổi mã hoặc khung, nạp thêm lịch sử, nến mới: điều chỉnh viewport ngay trong lượt render, trước khi vẽ.
  const first = market && realCount > 0 ? (bars[0] as TimedBar).time : null
  const sessionKey = `${options.resetKey ?? ""}|${mode}|${options.interval ?? ""}`
  const [session, setSession] = useState<{ key: string; document: string | undefined; seeded: boolean; first: number | null; count: number; cache: IndicatorCache }>(() => ({
    key: sessionKey,
    document: options.documentKey,
    seeded: false,
    first: null,
    count: 0,
    cache: createIndicatorCache(),
  }))
  if (session.key !== sessionKey || session.document !== options.documentKey) {
    const keepDrawings = session.document === options.documentKey
    setSession({ key: sessionKey, document: options.documentKey, seeded: false, first: null, count: 0, cache: createIndicatorCache() })
    setState((previous) => resetState(previous, config, keepDrawings))
  } else if (!session.seeded) {
    if (size.width > 0 && realCount > 0) {
      setSession({ ...session, seeded: true, first, count: realCount })
      setState((previous) => ({ ...previous, viewport: config.defaultViewport }))
    }
  } else if (session.first !== first || session.count !== realCount) {
    const times = market ? (bars as readonly TimedBar[]).map((bar) => bar.time) : []
    const added = market ? prependedCount(session.first, times) : 0
    const limits = limitsOf(config.viewport, plotWidth)
    setSession({ ...session, first, count: realCount })
    setState((previous) => {
      let viewport = previous.viewport
      if (added > 0) viewport = shiftForPrepend(viewport, added)
      else if (session.first === first) viewport = followAppend(viewport, session.count, realCount)
      return { ...previous, viewport: clampViewport(viewport, limits) }
    })
  }

  // ---- dữ liệu: chỉ tính lại khi dữ liệu hoặc kiểu hiển thị đổi, không tính lại khi zoom và kéo (trừ Volume Profile, theo viewport).
  const inputs = options.indicatorInputs
  const precomputed = options.indicators
  const priceLevels = options.mode === "market" ? options.priceLevels : undefined
  const palette = useMemo(() => indicatorPalette(priceLevels), [priceLevels])
  const { cache } = session
  const hasProfile = (inputs ?? []).some((input) => input.id === VOLUME_PROFILE_ID && !input.hidden)
  const profileFrom = hasProfile ? Math.ceil(state.viewport.from) : 0
  const profileTo = hasProfile ? Math.floor(state.viewport.to) : 0
  const titleOf = options.mode === "flashback" ? options.indicatorTitle : undefined
  const sceneIndicators = useMemo(
    () =>
      precomputed ??
      sceneIndicatorsFor(inputs ?? [], bars, cache, palette, { profile: hasProfile ? { from: profileFrom, to: profileTo } : null, flashback: !market, titleOf }),
    [precomputed, inputs, bars, cache, palette, hasProfile, profileFrom, profileTo, market, titleOf],
  )
  const chartType = options.chartType ?? "candles"
  const marks = options.mode === "market" ? options.marks : undefined
  const markers = options.mode === "flashback" ? options.markers : undefined
  const divider = options.mode === "flashback" ? options.divider : undefined
  const interval = options.interval
  const data = useMemo(() => {
    const common = { chartType, indicators: sceneIndicators }
    const input: ChartDataInput = market
      ? { ...common, mode: "market", bars: bars as readonly TimedBar[], interval: interval as Interval, priceLevels, marks }
      : { ...common, mode: "flashback", bars, warmup, totalSlots, markers, divider }
    return createChartData(input)
  }, [market, bars, interval, warmup, totalSlots, chartType, sceneIndicators, priceLevels, marks, markers, divider])

  const paneHeights = options.paneHeights ?? heightsState
  const available = options.mode === "flashback" ? options.available : undefined
  const pageNarrow = options.mode === "flashback" ? options.pageNarrow === true : false
  const mobile = size.width < NARROW_WIDTH || pageNarrow
  const height = market ? size.height : naturalHeight(data, { width: size.width, available: available ?? null, paneHeights, mobile })
  const priceScaleMode = options.priceScaleMode ?? "linear"
  const { labelToken, formatPrice } = options
  const formatX = options.mode === "flashback" ? options.formatX : undefined
  const frame = useMemo(
    () => buildFrame(data, state.viewport, state.priceScale, { width: size.width, height, dpr: size.dpr, priceScaleMode, paneHeights, labelToken, formatPrice, formatX, mobile: market ? undefined : mobile }),
    [data, state.viewport, state.priceScale, size.width, size.dpr, height, priceScaleMode, paneHeights, labelToken, formatPrice, formatX, market, mobile],
  )

  // Trình xử lý sự kiện đọc trạng thái mới nhất qua ref; ghi ref chỉ trong effect và trong trình xử lý.
  useLayoutEffect(() => {
    controller.sync({ options, config, data, size, height, heights: paneHeights, state, frame })
  })

  // ---- đo kích thước khung chứa
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const measure = (entry?: ResizeObserverEntry) => {
      const box = entry?.contentRect
      const width = Math.round(box?.width ?? host.clientWidth)
      const nextHeight = Math.round(box?.height ?? host.clientHeight)
      const dpr = resolveDpr(undefined)
      setSize((previous) => (previous.width === width && previous.height === nextHeight && previous.dpr === dpr ? previous : { width, height: nextHeight, dpr }))
    }
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => measure(entries[0]))
    observer?.observe(host)
    measure()
    return () => observer?.disconnect()
  }, [])

  // ---- đầu vào đổi (dữ liệu, kích thước, giao diện, hình AI) thì vẽ lại; tương tác đã tự vẽ lại lớp bị ảnh hưởng.
  useEffect(() => {
    controller.invalidate()
  }, [controller, frame, data])
  useEffect(() => {
    controller.refreshPalette()
  }, [controller, theme])
  const overlays = options.overlays
  const renderDrawingsProp = options.renderDrawings
  const drawingsVersion = options.drawingsVersion
  useEffect(() => {
    controller.invalidate("drawings")
  }, [controller, overlays, renderDrawingsProp, drawingsVersion])

  const crosshairBar = state.crosshair?.bar ?? null
  const values = useMemo(() => valuesAtIndex(data, crosshairBar ?? data.count - 1), [data, crosshairBar])

  return {
    mode,
    hostRef,
    controller,
    data,
    frame,
    state,
    config,
    size,
    height,
    viewport: state.viewport,
    values,
    canUndo: canUndo(state.history),
    canRedo: canRedo(state.history),
    options,
  }
}

function frameInputsOf(l: Live): FrameInputs {
  return {
    width: l.size.width,
    height: l.height,
    dpr: l.size.dpr,
    priceScaleMode: l.options.priceScaleMode ?? "linear",
    paneHeights: l.heights,
    labelToken: l.options.labelToken,
    formatPrice: l.options.formatPrice,
    formatX: l.options.mode === "flashback" ? l.options.formatX : undefined,
    mobile: l.options.mode === "flashback" ? l.size.width < NARROW_WIDTH || l.options.pageNarrow === true : undefined,
  }
}

type ControllerDeps = {
  builder: SceneBuilder
  setState: Dispatch<SetStateAction<InteractionState>>
  setHeightsState: Dispatch<SetStateAction<Record<string, number>>>
}

/** Bộ điều khiển kèm phần chỉ hook được gọi: đồng bộ môi trường mới nhất sau mỗi lần render. */
type InternalController = ChartController & { sync(next: Live): void }

function createController({ builder, setState, setHeightsState }: ControllerDeps): InternalController {
  let current: Live | null = null
  let stack: CanvasStack | null = null
  const envOf = (l: Live) => ({ config: l.config, coords: l.frame?.price.coords ?? STUB_COORDS, bars: l.data.raw })

  const controller: InternalController = {
    sync(next) {
      current = next
    },
    dispatch(action) {
      const l = current
      if (!l) return
      const previous = l.state
      const next = interactionReducer(previous, action, envOf(l))
      if (next === previous) return
      l.state = next
      const layers = new Set<Layer>()
      const viewChanged = next.viewport !== previous.viewport || next.priceScale !== previous.priceScale
      if (viewChanged) {
        l.frame = buildFrame(l.data, next.viewport, next.priceScale, frameInputsOf(l))
        for (const layer of ALL_LAYERS) layers.add(layer)
      }
      const shapesChanged = next.drawings.shapes !== previous.drawings.shapes
      const selectionChanged = next.drawings.selectedId !== previous.drawings.selectedId
      if (shapesChanged || selectionChanged) layers.add("drawings")
      if (shapesChanged || selectionChanged || next.crosshair !== previous.crosshair || next.preview !== previous.preview || next.drawings.pending !== previous.drawings.pending) layers.add("top")
      if (layers.size > 0) stack?.invalidate(...layers)
      setState(next)

      const { options } = l
      if (next.viewport !== previous.viewport) options.onViewportChange?.(next.viewport)
      if (shapesChanged && action.type !== "set-drawings") options.onDrawingsChange?.(next.drawings.shapes)
      const bar = next.crosshair?.bar ?? null
      if (bar !== (previous.crosshair?.bar ?? null)) options.onCrosshairChange?.(bar === null ? null : valuesAtIndex(l.data, bar))
    },
    getState: () => current?.state ?? createInteractionState({ defaultViewport: { from: 0, to: 1 }, historyLimit: 1 }),
    getFrame: () => current?.frame ?? null,
    getConfig: () => current?.config ?? null,
    getOptions: () => current?.options ?? null,
    targetAt(x, y) {
      const frame = current?.frame
      return frame ? targetAt(frame, x, y) : { region: "none", paneKey: "p", paneKind: "price" }
    },
    key(key) {
      const l = current
      if (!l) return false
      const action = keyToAction(key, l.config, l.state)
      if (!action) return false
      controller.dispatch(action)
      return true
    },
    wheel(input) {
      const l = current
      if (!l?.frame) return false
      const target = targetAt(l.frame, input.x, input.y)
      if (wheelIntent({ ...input, target }, l.config) === "none") return false
      controller.dispatch({ type: "wheel", wheel: { ...input, target } })
      return true
    },
    setPaneHeights(heights) {
      const l = current
      if (!l) return
      l.heights = heights
      if (l.options.paneHeights === undefined) setHeightsState(heights)
      l.frame = buildFrame(l.data, l.state.viewport, l.state.priceScale, frameInputsOf(l))
      stack?.invalidate()
      l.options.onPaneHeightsChange?.(heights)
    },
    attach(next) {
      stack = next
      stack?.invalidate()
    },
    buildLayer(layer) {
      const l = current
      if (!l?.frame) return null
      const scene = layerScene(builder, layer, { frame: l.frame, state: l.state, overlays: l.options.overlays, formatPrice: l.options.formatPrice })
      if (layer === "drawings" && l.options.renderDrawings) return [...scene, ...l.options.renderDrawings(l.frame)]
      return scene
    },
    invalidate(...layers) {
      stack?.invalidate(...layers)
    },
    refreshPalette() {
      stack?.refreshPalette()
    },
    resize(width, height, dpr) {
      stack?.resize(width, height, dpr)
    },
    snapshot(background) {
      const source = stack
      if (!source) return Promise.reject(new Error("Biểu đồ chưa sẵn sàng."))
      const { base } = source.canvases
      const out = document.createElement("canvas")
      out.width = base.width
      out.height = base.height
      const context = out.getContext("2d")
      if (!context) return Promise.reject(new Error("Không tạo được ảnh."))
      context.fillStyle = background
      context.fillRect(0, 0, out.width, out.height)
      for (const layer of ALL_LAYERS) context.drawImage(source.canvases[layer], 0, 0)
      return new Promise((resolve, reject) => out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không tạo được ảnh."))), "image/png"))
    },
    setCanvasStyle(touchAction, cursor) {
      const canvas = stack?.interactive
      if (!canvas) return
      canvas.style.touchAction = touchAction
      if (cursor !== null) canvas.style.cursor = cursor
    },
  }
  return controller
}
