/**
 * Phần thuần của bộ điều khiển biểu đồ (không React, không DOM): đổi chỉ báo đầu vào sang chỉ báo của scene, dựng khung hình từ
 * trạng thái tương tác, xác định vùng dưới con trỏ, dựng lớp hình vẽ và lớp trên cùng. Tách ra để test không cần dựng component.
 */
import { AXIS_HEIGHT } from "../core/layout"
import { aiOverlayCommands, drawingCommands, handleCommands, previewCommands } from "../drawings"
import { getIndicator, VOLUME_PROFILE_ID, DEFAULT_PROFILE_ROWS, type IndicatorCache, type ProfileRange } from "../indicators"
import type { InteractionState, PointerTarget } from "../interaction"
import { manualPriceRange } from "../interaction"
import { SceneBuilder, type Pointer } from "../scene/builder"
import { createFrame, type ChartData, type ChartFrame, type SceneIndicator, type ViewState } from "../scene/model"
import type { AiOverlay, SessionAxisLabel, Bar, ChartIndicatorInput, ColorToken, IndicatorDefinition, IndicatorPlot, Layer, PriceScaleMode, Scene } from "../types"

/** Độ rộng cột giá bên phải (CSS pixel), như `PAD_RIGHT` của biểu đồ Flashback hiện tại. */
export const AXIS_RIGHT = 62

/** Tham số không nằm trong tên chỉ báo: ngưỡng và hệ số phụ ("RSI (14)", không phải "RSI (14, 30, 70)"). */
const TITLE_SKIP: ReadonlySet<string> = new Set(["lower", "upper", "level", "baseline", "mult"])

/** Tên hiển thị của một chỉ báo kèm tham số chính: "RSI (14)", "MACD (12, 26, 9)". */
export function indicatorTitle(definition: Pick<IndicatorDefinition, "name">, input: Pick<ChartIndicatorInput, "params">, defaults: readonly { key: string; default: unknown }[] = []): string {
  const values = defaults.flatMap((spec) => {
    if (TITLE_SKIP.has(spec.key)) return []
    const value = input.params[spec.key] ?? spec.default
    return typeof value === "number" ? [String(value)] : []
  })
  return values.length > 0 ? `${definition.name} (${values.join(", ")})` : definition.name
}

/**
 * Chỉ báo đầu vào sang chỉ báo của scene. Id lạ, tham số sai và chỉ báo không có ở chế độ này bị bỏ qua (một layout lưu hỏng không được
 * làm hỏng biểu đồ). Volume Profile tính theo viewport qua `cache.profile`: cùng khoảng nguyên thì trả đúng đối tượng cũ.
 */
export function sceneIndicatorsFor(
  inputs: readonly ChartIndicatorInput[],
  bars: readonly Bar[],
  cache: IndicatorCache,
  palette: readonly ColorToken[],
  options: { profile: ProfileRange | null; flashback?: boolean; /** Đổi tên hiển thị (Flashback giữ tên "RSI 14" của bản SVG cũ); mặc định `indicatorTitle`. */ titleOf?: (input: ChartIndicatorInput, fallback: string) => string },
): SceneIndicator[] {
  const out: SceneIndicator[] = []
  for (const input of inputs) {
    const definition = getIndicator(input.id)
    if (!definition) continue
    if (options.flashback && !definition.flashback) continue
    let plot: IndicatorPlot | null
    if (input.id === VOLUME_PROFILE_ID) {
      const rows = typeof input.params.rows === "number" ? input.params.rows : DEFAULT_PROFILE_ROWS
      plot = options.profile && !input.hidden ? cache.profile(bars, options.profile, rows) : { kind: "over", series: [], profile: { rows: [] } }
    } else {
      plot = cache.get(input, bars, palette)
    }
    if (!plot) continue
    const title = indicatorTitle(definition, input, definition.params)
    out.push({ key: input.key, id: input.id, name: options.titleOf ? options.titleOf(input, title) : title, plot, hidden: input.hidden === true })
  }
  return out
}

export type FrameInputs = {
  width: number
  height: number
  dpr: number
  priceScaleMode: PriceScaleMode
  paneHeights?: Readonly<Record<string, number>>
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  formatX?: (session: number) => string
  /** Nhãn cố định của trục ngang ở khung mặc định (xem `ViewState.axisLabels`). */
  axisLabels?: (narrow: boolean) => readonly SessionAxisLabel[]
  /** Bố cục điện thoại do trang quyết (cửa sổ hẹp dù biểu đồ rộng); bỏ trống thì theo độ rộng biểu đồ. */
  mobile?: boolean
}

/**
 * Khung hình từ dữ liệu và trạng thái tương tác: viewport, và hệ số kéo tay trục giá của ô giá (`priceScale.p`) đổi sang dải giá
 * thủ công qua `manualPriceRange`. Null khi chưa đo được kích thước.
 */
export function buildFrame(data: ChartData, viewport: InteractionState["viewport"], priceScale: InteractionState["priceScale"], inputs: FrameInputs): ChartFrame | null {
  if (inputs.width <= 0 || inputs.height <= 0) return null
  const view: ViewState = {
    viewport,
    geometry: { width: inputs.width, height: inputs.height, dpr: inputs.dpr, axisRight: AXIS_RIGHT, axisBottom: AXIS_HEIGHT },
    priceScaleMode: inputs.priceScaleMode,
    paneHeights: inputs.paneHeights,
    labelToken: inputs.labelToken,
    formatPrice: inputs.formatPrice,
    formatX: inputs.formatX,
    axisLabels: inputs.axisLabels,
    mobile: inputs.mobile,
  }
  const auto = createFrame(data, view)
  const manual = manualPriceRange(auto.price.range, priceScale.p)
  return manual ? createFrame(data, { ...view, manualPriceRange: manual }) : auto
}

/**
 * Vùng dưới con trỏ, để bộ giảm trạng thái biết đang ở khung vẽ của ô nào, trục giá, trục thời gian hay ngoài biểu đồ. Khoảng cách giữa
 * hai ô tính vào ô gần nhất (con trỏ đi qua đó không làm crosshair nhấp nháy). Chỉ ô giá có trục giá kéo được.
 */
export function targetAt(frame: ChartFrame, x: number, y: number): PointerTarget {
  const { panes, plot, view } = frame
  const none: PointerTarget = { region: "none", paneKey: "p", paneKind: "price" }
  const last = panes[panes.length - 1]
  const bottom = last.box.top + last.box.height
  if (x < 0 || x > view.geometry.width || y < 0 || y > view.geometry.height) return none
  if (y > bottom) return x <= plot.right ? { region: "time-axis", paneKey: last.box.key, paneKind: last.box.kind } : none
  let pane = panes.find((candidate) => y >= candidate.box.top && y <= candidate.box.top + candidate.box.height)
  if (!pane) {
    let best = Number.POSITIVE_INFINITY
    for (const candidate of panes) {
      const gap = y < candidate.box.top ? candidate.box.top - y : y - (candidate.box.top + candidate.box.height)
      if (gap < best) {
        best = gap
        pane = candidate
      }
    }
  }
  if (!pane) return none
  if (x <= plot.right) return { region: "plot", paneKey: pane.box.key, paneKind: pane.box.kind }
  return pane.box.kind === "price" ? { region: "price-axis", paneKey: pane.box.key, paneKind: pane.box.kind } : none
}

export type LayerSources = {
  frame: ChartFrame
  state: InteractionState
  overlays?: readonly AiOverlay[]
  formatPrice?: (price: number) => string
}

/** Lớp hình vẽ: lớp AI ở dưới, hình của người dùng ở trên. Chỉ ô giá có hình vẽ. */
export function drawingsScene({ frame, state, overlays, formatPrice }: LayerSources): Scene {
  const coords = frame.price.coords
  const dpr = frame.view.geometry.dpr
  const options = { dpr, formatPrice, selectedId: state.drawings.selectedId }
  return [...aiOverlayCommands(overlays ?? [], coords, { dpr, formatPrice }), ...drawingCommands(state.drawings.shapes, coords, options)]
}

/** Lớp trên cùng: crosshair, bản xem trước khi đang vẽ và tay nắm của hình đang chọn. */
export function topScene(builder: SceneBuilder, { frame, state, formatPrice }: LayerSources): Scene {
  const scene: Scene = []
  const pointer: Pointer | null = state.crosshair ? { x: state.crosshair.x, y: state.crosshair.y } : null
  if (pointer) scene.push(...builder.top(frame, pointer))
  const coords = frame.price.coords
  const options = { dpr: frame.view.geometry.dpr, formatPrice, selectedId: state.drawings.selectedId }
  if (state.drawings.pending) scene.push(...previewCommands(state.drawings.pending, state.preview, coords, options))
  const selected = state.drawings.selectedId === null ? undefined : state.drawings.shapes.find((shape) => shape.id === state.drawings.selectedId)
  scene.push(...handleCommands(selected, coords, options))
  return scene
}

export function layerScene(builder: SceneBuilder, layer: Layer, sources: LayerSources): Scene {
  switch (layer) {
    case "base":
      return builder.base(sources.frame)
    case "data":
      return builder.data(sources.frame)
    case "drawings":
      return drawingsScene(sources)
    case "top":
      return topScene(builder, sources)
  }
}
