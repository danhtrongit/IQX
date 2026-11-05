/**
 * Mô hình dữ liệu và khung hình của scene. Hai bước tách nhau để zoom và kéo không tính lại dữ liệu:
 *
 * 1. `createChartData` đổi đầu vào của trang thành `ChartData` bất biến: đổi kiểu Heikin Ashi, thang thời gian,
 *    chỉ báo đã cắt warmup và đã kiểm màu. Chỉ chạy lại khi dữ liệu đổi.
 * 2. `createFrame` ghép `ChartData` với viewport, kích thước và chế độ thang giá thành `ChartFrame`: bố cục ô,
 *    dải giá từng ô và `PaneCoords`. Chạy mỗi khung hình, chỉ quét các nến đang hiện.
 *
 * Quy ước chỉ số (docs/iqline-design.md §7): số nguyên là tâm nến. Ở `flashback`, chỉ số là số phiên và phần
 * warmup đã bị cắt khỏi `ChartData`: không có đường nào để vẽ, kéo tới hay đọc giá trị của nến warmup.
 */
import { createPaneCoords } from "../core/coords"
import { toHeikinAshi } from "../core/heikin-ashi"
import { chartLayout, NARROW_WIDTH, type ChartLayout, type PaneBox } from "../core/layout"
import { createPriceScale, padPriceRange, type PriceRange, type PriceScale } from "../core/price-scale"
import { createMarketTimeScale, createSessionTimeScale, type MarketTimeScale, type SessionTimeScale } from "../core/time-scale"
import { visibleIndexRange } from "../core/viewport"
import type {
  SessionAxisLabel,
  Bar,
  ChartMark,
  ChartType,
  Geometry,
  IndicatorPlot,
  Interval,
  PaneCoords,
  PriceScaleMode,
  SessionMarker,
  TimedBar,
  Viewport,
} from "../types"
import { createSeriesColors, labelColorToken, type PriceLevels } from "./colors"

export type SceneIndicator = {
  key: string
  /** Mã chỉ báo trong danh mục (`ma`, `ema`, `ma_cross`...); các chỉ báo dạng MA có nhãn mép phải khi ra ngoài khung. */
  id?: string
  /** Tên hiển thị, dùng cho nhãn ngoài khung. */
  name: string
  plot: IndicatorPlot
  hidden?: boolean
}

type CommonInput = { chartType: ChartType; indicators: readonly SceneIndicator[] }

export type MarketDataInput = CommonInput & {
  mode: "market"
  bars: readonly TimedBar[]
  interval: Interval
  priceLevels?: PriceLevels
  marks?: readonly ChartMark[]
}

export type FlashbackDataInput = CommonInput & {
  mode: "flashback"
  /** Toàn bộ nến đã mở, gồm `warmup` nến đầu chỉ để tính chỉ báo. */
  bars: readonly Bar[]
  warmup: number
  /** Tổng số ô trên trục (không tính warmup); phần dư sau nến đã mở là tương lai. */
  totalSlots: number
  markers?: readonly SessionMarker[]
  /** Chỉ số ô bắt đầu phần chơi: vạch đứt ngăn giữa phần xem và phần chơi. */
  divider?: number
}

export type ChartDataInput = MarketDataInput | FlashbackDataInput

export type PreparedIndicator = {
  key: string
  id?: string
  name: string
  hidden: boolean
  /** `p` (ô giá), `v` (ô khối lượng) hoặc `i{khoá}` (ô riêng). */
  paneKey: string
  /** Đã cắt warmup và đã đổi màu cấm. */
  plot: IndicatorPlot
}

export type ChartData = {
  mode: "market" | "flashback"
  chartType: ChartType
  /** Số nến thật (không tính warmup). */
  count: number
  /** Số ô trên trục: `market` là số nến; `flashback` là `totalSlots`. */
  slots: number
  /** Nến dùng để vẽ giá (đã đổi Heikin Ashi nếu cần). */
  bars: readonly Bar[]
  /** Nến thật: khối lượng, chú giải, crosshair. */
  raw: readonly Bar[]
  timeScale: MarketTimeScale | SessionTimeScale
  interval: Interval | null
  indicators: readonly PreparedIndicator[]
  priceLevels: PriceLevels
  marks: readonly ChartMark[]
  markers: readonly SessionMarker[]
  divider: number | null
}

const pickBar = (bar: Bar): Bar => ({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })

/** Cắt `warmup` phần tử đầu của mọi chuỗi trong plot và dời chỉ số của markers. */
function trimPlot(plot: IndicatorPlot, warmup: number): IndicatorPlot {
  if (warmup <= 0) return plot
  return {
    ...plot,
    series: plot.series.map((series) => ({ ...series, values: series.values.slice(warmup) })),
    histogram: plot.histogram ? { ...plot.histogram, values: plot.histogram.values.slice(warmup) } : undefined,
    markers: plot.markers?.filter((marker) => marker.index >= warmup).map((marker) => ({ ...marker, index: marker.index - warmup })),
  }
}

export function createChartData(input: ChartDataInput): ChartData {
  const warmup = input.mode === "flashback" ? Math.max(0, Math.floor(input.warmup)) : 0
  const raw: readonly Bar[] =
    input.mode === "flashback" ? input.bars.slice(warmup).map(pickBar) : input.bars
  const count = raw.length
  const bars = input.chartType === "heikin-ashi" ? toHeikinAshi(raw) : raw

  const priceLevels = input.mode === "market" ? (input.priceLevels ?? {}) : {}
  const resolveColor = createSeriesColors(priceLevels)
  const indicators = input.indicators.map<PreparedIndicator>((indicator) => {
    const trimmed = trimPlot(indicator.plot, warmup)
    const plot: IndicatorPlot = { ...trimmed, series: trimmed.series.map((series) => ({ ...series, color: resolveColor(series.color) })) }
    return {
      key: indicator.key,
      id: indicator.id,
      name: indicator.name,
      hidden: indicator.hidden === true,
      paneKey: plot.kind === "over" ? "p" : plot.kind === "vol" ? "v" : `i${indicator.key}`,
      plot,
    }
  })

  if (input.mode === "flashback") {
    return {
      mode: "flashback",
      chartType: input.chartType,
      count,
      slots: Math.max(count, input.totalSlots),
      bars,
      raw,
      timeScale: createSessionTimeScale(count, input.totalSlots),
      interval: null,
      indicators,
      priceLevels,
      marks: [],
      markers: input.markers ?? [],
      divider: input.divider ?? null,
    }
  }
  return {
    mode: "market",
    chartType: input.chartType,
    count,
    slots: count,
    bars,
    raw,
    timeScale: createMarketTimeScale(
      raw.map((bar) => (bar as TimedBar).time),
      input.interval,
    ),
    interval: input.interval,
    indicators,
    priceLevels,
    marks: input.marks ?? [],
    markers: [],
    divider: null,
  }
}

// -------------------------------------------------------------------------------------------- khung hình

export type ViewState = {
  viewport: Viewport
  /** CSS pixel; `height` là chiều cao canvas. Ở `flashback` bằng `chartLayout(...).height`. */
  geometry: Geometry
  priceScaleMode: PriceScaleMode
  /** Chiều cao ô đã kéo đổi, theo khoá ô. */
  paneHeights?: Readonly<Record<string, number>>
  /** Dải giá kéo tay của ô giá (đang tắt tự co giãn). */
  manualPriceRange?: PriceRange | null
  /** Bố cục điện thoại; mặc định theo độ rộng. */
  mobile?: boolean
  /** Ô giá tối thiểu; mặc định 160 ở `market`, 320 (điện thoại 240) ở `flashback`. */
  priceMin?: number
  formatPrice?: (price: number) => string
  /** Nhãn trục ngang của `flashback`: số phiên sang chữ ("Phiên 3"). */
  formatX?: (session: number) => string
  /**
   * Nhãn cố định của trục ngang khi đang nhìn hết mọi ô (khung mặc định); `narrow` là biểu đồ hẹp hơn `NARROW_WIDTH`. Đã zoom hoặc
   * kéo thì bỏ nhãn này và dùng nhãn theo `formatX`.
   */
  axisLabels?: (narrow: boolean) => readonly SessionAxisLabel[]
  labelToken?: "muted-foreground" | "academy-label"
}

export type PaneFrame = {
  box: PaneBox
  /** Dải giá của ô (đã chừa 6% ở ô giá). */
  range: PriceRange
  scale: PriceScale
  coords: PaneCoords
  /** Chỉ báo vẽ trong ô này, theo thứ tự đầu vào. */
  indicators: readonly PreparedIndicator[]
}

export type ChartFrame = {
  data: ChartData
  view: ViewState
  layout: ChartLayout
  panes: readonly PaneFrame[]
  /** Ô giá, luôn là ô đầu tiên. */
  price: PaneFrame
  plot: { left: number; right: number; width: number }
  /** Bề rộng một nến theo CSS pixel. */
  barPx: number
  /** Dải nến thật còn thấy, null nếu viewport chỉ có ô trống. */
  visible: { first: number; last: number } | null
  labelToken: ReturnType<typeof labelColorToken>
}

const LEFT_MARGIN = 0
/** Ô giá tối thiểu của `market`: nhỏ để vừa các khung chứa thấp, người dùng kéo đổi các ô khác. */
export const MARKET_PRICE_MIN = 160

/** `offset`: chuỗi được vẽ lệch (xem `IndicatorSeries.offset`), nên chỉ lấy các giá trị đang nằm trong khoảng nhìn thấy. */
function seriesExtent(values: readonly (number | null)[], first: number, last: number, extent: { low: number; high: number }, offset = 0) {
  const end = Math.min(last - offset, values.length - 1)
  for (let index = Math.max(0, first - offset); index <= end; index += 1) {
    const value = values[index]
    if (value == null || !Number.isFinite(value)) continue
    if (value < extent.low) extent.low = value
    if (value > extent.high) extent.high = value
  }
}

/** Dải giá thô (chưa chừa) của ô giá theo nến đang hiện; đường chỉ báo không kéo giãn trục (v2.3 §3). */
function priceExtent(data: ChartData, first: number, last: number): PriceRange {
  const closeOnly = data.chartType === "line" || data.chartType === "area"
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let index = first; index <= last; index += 1) {
    const bar = data.bars[index]
    const bottom = closeOnly ? bar.close : bar.low
    const top = closeOnly ? bar.close : bar.high
    if (bottom < low) low = bottom
    if (top > high) high = top
  }
  return { low, high }
}

function indicatorRange(indicator: PreparedIndicator, first: number, last: number): PriceRange {
  const { plot } = indicator
  if (plot.range) return { low: plot.range[0], high: plot.range[1] }
  const extent = { low: Number.POSITIVE_INFINITY, high: Number.NEGATIVE_INFINITY }
  for (const series of plot.series) seriesExtent(series.values, first, last, extent, series.offset ?? 0)
  if (plot.histogram) seriesExtent(plot.histogram.values, first, last, extent)
  for (const level of plot.levels ?? []) {
    extent.low = Math.min(extent.low, level.value)
    extent.high = Math.max(extent.high, level.value)
  }
  if (plot.zero) {
    extent.low = Math.min(extent.low, 0)
    extent.high = Math.max(extent.high, 0)
  }
  if (!Number.isFinite(extent.low) || !Number.isFinite(extent.high) || extent.low > extent.high) return { low: -1, high: 1 }
  const padding = (extent.high - extent.low) * 0.08 || 1
  return { low: extent.low - padding, high: extent.high + padding }
}

function volumeRange(data: ChartData, indicators: readonly PreparedIndicator[], first: number, last: number): PriceRange {
  let high = 0
  for (let index = first; index <= last; index += 1) high = Math.max(high, data.raw[index].volume)
  const extent = { low: 0, high }
  for (const indicator of indicators) if (!indicator.hidden) for (const series of indicator.plot.series) seriesExtent(series.values, first, last, extent, series.offset ?? 0)
  return { low: 0, high: extent.high || 1 }
}

export function createFrame(data: ChartData, view: ViewState): ChartFrame {
  const { geometry, viewport } = view
  const mobile = view.mobile ?? geometry.width < NARROW_WIDTH
  const narrow = geometry.width < NARROW_WIDTH
  const fill = data.mode === "market"
  const indicators = data.indicators
  const ownPanes = indicators.filter((indicator) => indicator.plot.kind === "pane")

  const layout = chartLayout({
    narrow,
    mobile,
    overlayCount: indicators.filter((indicator) => indicator.plot.kind === "over").length,
    volumeCount: indicators.filter((indicator) => indicator.plot.kind === "vol").length,
    indicatorKeys: ownPanes.map((indicator) => indicator.key),
    available: geometry.height,
    paneHeights: view.paneHeights,
    priceMin: view.priceMin ?? (fill ? MARKET_PRICE_MIN : undefined),
    fill,
  })

  const plotRight = Math.max(LEFT_MARGIN + 1, geometry.width - geometry.axisRight)
  const span = viewport.to - viewport.from
  const barPx = (plotRight - LEFT_MARGIN) / span
  const visible = visibleIndexRange(viewport, data.count)
  // Không có nến nào thấy được (kéo ra vùng trống): lấy nến cuối để thang giá vẫn có nghĩa.
  const range = visible ?? (data.count > 0 ? { first: data.count - 1, last: data.count - 1 } : null)

  const panes: PaneFrame[] = layout.panes.map((box) => {
    const paneIndicators = indicators.filter((indicator) => indicator.paneKey === box.key)
    let mode: PriceScaleMode = "linear"
    let base = 0
    let paneRange: PriceRange
    if (!range) {
      paneRange = { low: 0, high: 1 }
    } else if (box.kind === "price") {
      mode = view.priceScaleMode
      if (view.manualPriceRange) {
        paneRange = view.manualPriceRange
      } else {
        const extent = priceExtent(data, range.first, range.last)
        paneRange = padPriceRange(extent.low, extent.high, mode)
      }
      base = data.bars[range.first]?.close ?? 1
    } else if (box.kind === "volume") {
      paneRange = volumeRange(data, paneIndicators, range.first, range.last)
    } else {
      paneRange = indicatorRange(paneIndicators[0], range.first, range.last)
    }
    const scale = createPriceScale({ mode, range: paneRange, base, top: box.top, height: box.height })
    const coords = createPaneCoords({
      viewport,
      plot: { left: LEFT_MARGIN, top: box.top, right: plotRight, bottom: box.top + box.height },
      timeScale: data.timeScale,
      priceScale: scale,
    })
    return { box, range: { low: scale.low, high: scale.high }, scale, coords, indicators: paneIndicators }
  })

  return {
    data,
    view,
    layout,
    panes,
    price: panes[0],
    plot: { left: LEFT_MARGIN, right: plotRight, width: plotRight - LEFT_MARGIN },
    barPx,
    visible,
    labelToken: labelColorToken(view.labelToken),
  }
}

/** Chiều cao cần cho canvas (CSS pixel) ở `flashback`, nơi biểu đồ tự quyết chiều cao theo `chartLayout`. */
export function naturalHeight(data: Pick<ChartData, "indicators">, input: { width: number; available: number | null; mobile?: boolean; paneHeights?: Readonly<Record<string, number>> }): number {
  const mobile = input.mobile ?? input.width < NARROW_WIDTH
  return chartLayout({
    narrow: input.width < NARROW_WIDTH,
    mobile,
    overlayCount: data.indicators.filter((indicator) => indicator.plot.kind === "over").length,
    volumeCount: data.indicators.filter((indicator) => indicator.plot.kind === "vol").length,
    indicatorKeys: data.indicators.filter((indicator) => indicator.plot.kind === "pane").map((indicator) => indicator.key),
    available: input.available,
    paneHeights: input.paneHeights,
  }).height
}

