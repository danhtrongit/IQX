/**
 * Dựng cảnh của chế độ `static` (Học viện, docs/iqline-design.md §13): hàm thuần `(panels, geometry, options) -> Scene`.
 * Số liệu đã tính sẵn nên không có công thức chỉ báo ở đây. Bố cục và thang giá riêng, tự chứa, giữ đúng kích
 * thước, khoảng đệm và cách đặt nhãn của biểu đồ SVG `series-panels-chart.tsx` mà nó thay.
 *
 * Đơn vị: `layoutStatic` tính theo CSS pixel (cho tương tác và chú giải DOM); mọi lệnh vẽ trong `Scene` đã nhân
 * `geometry.dpr` (toạ độ, độ dày nét, nét đứt, bán kính và cỡ chữ), theo hợp đồng ở `types.ts`. Với chữ,
 * `y` là đường cơ sở. Màu chữ luôn là `academy-label` (hoặc màu ngữ nghĩa), không bao giờ token chữ xám của giao diện chung.
 */
import {
  LINE_HEIGHT,
  alongLine,
  annotationWidth,
  aroundPoint,
  inZone,
  placeLabels,
  polylineSegments,
  stackRowLabels,
  type Box,
  type Candidate,
  type LabelAnchor,
  type LabelRequest,
  type Obstacle,
  type PlacedLabel,
  type Segment,
} from "../labels/placement"
import { estimateText, thinAxisLabels, wrapText, type MeasureText } from "../labels/text"
import type {
  StaticFib,
  StaticFrame,
  StaticLegendEntry,
  StaticPanel,
  StaticPoint,
  StaticValues,
} from "../static-types"
import type { ColorToken, DrawCommand, Geometry, Scene, TextAlign } from "../types"

/** Dưới bề rộng này biểu đồ dùng bản hẹp: lề phải nhỏ hơn, các ô thấp hơn. */
export const STATIC_NARROW_WIDTH = 400

/** Màu chữ trung tính (nhãn trục, tiêu đề ô, nhãn không có sắc thái). */
const LABEL_TOKEN: ColorToken = "academy-label"
const SERIES_DASH: readonly number[] = [5, 4]

export type StaticPriceLevels = { reference?: number; ceiling?: number; floor?: number }

export type StaticSceneOptions = {
  /** Đo chữ (CSS pixel). Không truyền thì dùng `estimateText`. Adapter Canvas truyền `ctx.measureText`. */
  measureText?: MeasureText
  /**
   * Đường giá tham chiếu, trần, sàn vẽ trên ô giá (ô có nến, hoặc ô đầu). Khi có trần hoặc sàn, bảng màu đổi theo
   * §7: `chart-6`, `chart-7`, `chart-8` không dùng cho chuỗi khác mà đổi sang `chart-1`, `chart-2`, `chart-5`.
   */
  priceLevels?: StaticPriceLevels
}

export type StaticPanelLayout = {
  index: number
  /** Mép trên và dưới vùng vẽ của ô (đã trừ hàng tiêu đề). */
  top: number
  bottom: number
  lo: number
  hi: number
  /** Các vạch lưới nằm trong [lo, hi]; rỗng ở hình thu nhỏ. */
  ticks: number[]
  digits: number
  /** Có vẽ đường đáy: ô cuối có trục x mà vạch lưới thấp nhất cách đáy xa. */
  baseline: boolean
  yOfValue(value: number): number
  valueOfY(y: number): number
}

/** Bố cục theo CSS pixel. `geometry.height`, `axisRight` và `axisBottom` không dùng: chiều cao suy ra từ nội dung. */
export type StaticLayout = {
  width: number
  height: number
  thumbnail: boolean
  narrow: boolean
  /** Số quan sát trong cửa sổ. */
  count: number
  left: number
  right: number
  /** Bề rộng một quan sát. */
  step: number
  topPad: number
  hasTicks: boolean
  xAxisRow: number
  /** Vùng nhận con trỏ: toàn bộ chiều ngang vùng vẽ, từ hàng nhãn nền tới trục x. */
  plot: { left: number; top: number; right: number; bottom: number }
  panels: StaticPanelLayout[]
  frame: StaticFrame
  /** Đổi màu theo bảng màu hiện hành (đổi khi biểu đồ có trần hoặc sàn). */
  paint(token: ColorToken): ColorToken
  /** Tâm của quan sát thứ k trong cửa sổ. */
  xOfIndex(k: number): number
  /** Quan sát dưới toạ độ x, kẹp vào [0, count - 1]. */
  indexOfX(x: number): number
  /** Chú giải nổi nằm bên trái con trỏ khi con trỏ ở nửa phải biểu đồ. */
  tooltipSide(index: number): "left" | "right"
  measure: MeasureText
  shadeLabels: { text: string; token: ColorToken; row: number; x: number }[]
}

export type StaticReadoutRow = { name: string; value: number | null; digits: number; token: ColorToken | null }

export type StaticCrosshair = {
  index: number
  /** Toạ độ x (CSS pixel) của đường dọc. */
  x: number
  /** "Phiên n" hoặc nhãn trục x của quan sát. */
  label: string
  readout: StaticReadoutRow[]
  /** Lớp trên cùng: đường dọc và chấm trên từng chuỗi. */
  scene: Scene
}

/* ------------------------------------------------------------------ số liệu và định dạng */

const isNumber = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value)

const formatters = new Map<number, Intl.NumberFormat>()

/** Số kiểu vi-VN với số chữ số thập phân cố định; "Không có" khi thiếu số liệu (không bao giờ là 0). */
export function formatStaticValue(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return "Không có"
  let formatter = formatters.get(digits)
  if (!formatter) {
    formatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(digits, formatter)
  }
  return formatter.format(value)
}

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 })

/** Các vạch "đẹp" cách đều phủ [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo]
  const raw = (hi - lo) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
  const first = Math.ceil(lo / step - 1e-9) * step
  const ticks: number[] = []
  for (let value = first; value <= hi + step * 1e-9; value += step) ticks.push(Math.abs(value) < step * 1e-9 ? 0 : value)
  return ticks
}

function hasLevelLines(levels: StaticPriceLevels | undefined): boolean {
  return levels !== undefined && (isNumber(levels.reference) || isNumber(levels.ceiling) || isNumber(levels.floor))
}

/** Ô nhận các đường giá tham chiếu, trần, sàn: ô có nến đầu tiên, nếu không thì ô đầu. */
function priceLevelPanel(panels: readonly StaticPanel[]): number {
  const withCandles = panels.findIndex((panel) => panel.candles)
  return withCandles >= 0 ? withCandles : 0
}

/** Khoảng giá của ô: `bounds` tường minh, không thì khoảng dữ liệu đệm 12%. */
export function staticPanelRange(panel: StaticPanel, extra: readonly number[] = []): [number, number] {
  if (panel.bounds) return [panel.bounds[0], panel.bounds[1]]
  const values = [
    ...panel.series.flatMap((series) => series.values.filter(isNumber)),
    ...(panel.candles ? [...panel.candles.high, ...panel.candles.low].filter(isNumber) : []),
    ...(panel.bars ? [...panel.bars.values.filter(isNumber), 0] : []),
    ...(panel.band ? [...panel.band.upper, ...panel.band.lower].filter(isNumber) : []),
    ...(panel.zero ? [0] : []),
    ...(panel.levels ?? []).map((level) => level.value),
    ...extra,
  ]
  if (values.length === 0) return [0, 1]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-6)
  lo -= span * 0.12
  hi += span * 0.12
  if (panel.nonnegative && lo < 0) lo = 0
  return [lo, hi]
}

function fibPrice(fib: StaticFib, level: number): number {
  return fib.dir === "up" ? fib.hi.v - (fib.hi.v - fib.lo.v) * level : fib.lo.v + (fib.hi.v - fib.lo.v) * level
}

/** Fibonacci không dùng `chart-3`, `chart-4` (cùng màu tăng giảm) và `chart-7` (dành cho lớp AI). */
const FIB_FORBIDDEN: readonly ColorToken[] = ["chart-3", "chart-4", "chart-7"]
const FIB_FALLBACK: ColorToken = "chart-2"
export function fibToken(token: ColorToken): ColorToken {
  return FIB_FORBIDDEN.includes(token) ? FIB_FALLBACK : token
}

/* ------------------------------------------------------------------ bảng màu */

const RESTRICTED: readonly ColorToken[] = ["chart-6", "chart-7", "chart-8"]
const ALLOWED: readonly ColorToken[] = ["chart-1", "chart-2", "chart-5"]

/** Mọi token mà các ô dùng, theo thứ tự gặp; `lines` là các màu đường (chuỗi, dải, đoạn, Fibonacci). */
function usedTokens(panels: readonly StaticPanel[]): { all: ColorToken[]; lines: ColorToken[] } {
  const all: ColorToken[] = []
  const lines: ColorToken[] = []
  const add = (token: ColorToken | undefined, line = false) => {
    if (!token) return
    all.push(token)
    if (line) lines.push(token)
  }
  const frame = panels[0]?.frame
  for (const shade of frame?.shade ?? []) {
    add(shade.token)
    add(shade.labelToken)
  }
  for (const panel of panels) {
    for (const series of panel.series) add(series.token, true)
    add(panel.band?.token, true)
    add(panel.fill_between?.aboveToken)
    add(panel.fill_between?.belowToken)
    panel.bars?.tokens.forEach((token) => add(token))
    if (panel.fib) add(fibToken(panel.fib.token), true)
    for (const segment of panel.segments ?? []) add(segment.token, true)
    for (const level of panel.levels ?? []) {
      add(level.token, true)
      add(level.labelToken)
    }
    for (const zone of panel.zones ?? []) {
      add(zone.token)
      add(zone.labelToken)
    }
    for (const note of panel.notes ?? []) add(note.token)
    for (const point of panel.points ?? []) {
      add(point.token)
      add(point.labelToken)
    }
  }
  return { all, lines }
}

/**
 * Bảng màu của biểu đồ (§7). Không có trần hoặc sàn: giữ nguyên. Có trần hoặc sàn: `chart-6`, `chart-7`, `chart-8`
 * không dùng cho chuỗi khác, nên mỗi token bị cấm được đổi sang `chart-1`, `chart-2` hoặc `chart-5` chưa có đường
 * nào trong biểu đồ dùng (theo thứ tự gặp); hết màu thì quay vòng.
 */
export function resolveStaticPalette(panels: readonly StaticPanel[], priceLevels?: StaticPriceLevels): (token: ColorToken) => ColorToken {
  const restricted = isNumber(priceLevels?.ceiling) || isNumber(priceLevels?.floor)
  if (!restricted) return (token) => token
  const { all, lines } = usedTokens(panels)
  const taken = new Set<ColorToken>(lines.filter((token) => !RESTRICTED.includes(token)))
  const map = new Map<ColorToken, ColorToken>()
  for (const token of all) {
    if (!RESTRICTED.includes(token) || map.has(token)) continue
    const free = ALLOWED.find((candidate) => !taken.has(candidate))
    const pick = free ?? ALLOWED[map.size % ALLOWED.length]
    taken.add(pick)
    map.set(token, pick)
  }
  return (token) => map.get(token) ?? token
}

/* ------------------------------------------------------------------ bố cục */

function panelHeights(count: number, narrow: boolean, thumbnail: boolean, width: number): number[] {
  // Hình thu nhỏ giữ tỷ lệ khoảng 760x260 của bản mẫu khi vẽ một mình, và cao 96px khi nằm trong lưới điện thoại.
  if (thumbnail) {
    const scale = Math.max(1, (width * 0.32) / 96)
    return Array.from({ length: count }, (_, index) => Math.round((index === 0 ? 96 : 40) * scale))
  }
  if (count === 1) return [narrow ? 200 : 236]
  return Array.from({ length: count }, (_, index) => (index === 0 ? (narrow ? 176 : 204) : narrow ? 104 : 118))
}

const X_AXIS_ROW = 20
const PANEL_TITLE_ROW = 20
const PANEL_BARE_ROW = 8

const EMPTY_FRAME: StaticFrame = { start: 0, end: -1, marks: [], axes: true }

/** Bố cục của biểu đồ theo CSS pixel. Hàm thuần, gọi lại mỗi khi đổi bề rộng hoặc số liệu. */
export function layoutStatic(panels: readonly StaticPanel[], geometry: Pick<Geometry, "width">, options: StaticSceneOptions = {}): StaticLayout {
  const frame = panels[0]?.frame ?? EMPTY_FRAME
  const measure = options.measureText ?? estimateText
  const width = Math.max(1, geometry.width)
  const thumbnail = !frame.axes
  const narrow = width < STATIC_NARROW_WIDTH
  const count = Math.max(0, frame.end - frame.start + 1)
  const hasTicks = !thumbnail && (frame.ticks?.some(Boolean) ?? false)
  const withShadeLabels = !thumbnail && (frame.shade?.some((shade) => shade.label) ?? false)
  const left = thumbnail ? 2 : 6
  const right = Math.max(left + 1, width - (thumbnail ? 2 : narrow ? 42 : 52))
  const step = count > 0 ? (right - left) / count : right - left
  const xOfIndex = (k: number) => left + (k + 0.5) * step
  const xi = (i: number) => xOfIndex(i - frame.start)
  const paint = resolveStaticPalette(panels, options.priceLevels)
  const heights = panelHeights(panels.length, narrow, thumbnail, width)

  // Nhãn nền nằm ở các hàng phía trên khung vẽ; nhãn sẽ đè nhãn bên cạnh thì hạ xuống hàng kế.
  const labelled = withShadeLabels ? (frame.shade ?? []).flatMap((shade) => (shade.label ? [{ ...shade, label: shade.label }] : [])) : []
  const shadeRows = stackRowLabels(
    labelled.map((shade) => ({
      text: shade.label,
      size: 10.5,
      weight: 600,
      center: (xi(shade.from) + xi(shade.to)) / 2,
      min: xi(shade.from) - step / 2,
      max: xi(shade.to) + step / 2,
    })),
    width,
    6,
    measure,
  )
  const shadeRowCount = Math.max(0, ...shadeRows.map((row) => row.row + 1))
  const topPad = shadeRowCount ? 18 + (shadeRowCount - 1) * 14 : frame.marks.length ? 16 : 0
  // Ô không có tiêu đề vẫn chừa lề nhỏ để nhãn vạch trên cùng không bị cắt.
  const titleRows = panels.map((panel) => (thumbnail ? 0 : panel.title ? PANEL_TITLE_ROW : PANEL_BARE_ROW))
  const panelGap = thumbnail ? 4 : 8
  const levelPanel = hasLevelLines(options.priceLevels) ? priceLevelPanel(panels) : -1
  const panelLayouts: StaticPanelLayout[] = []
  let cursorY = topPad
  panels.forEach((panel, index) => {
    const top = cursorY + titleRows[index]
    const bottom = top + heights[index]
    cursorY = bottom + (index < panels.length - 1 ? panelGap : 0)
    const extra = index === levelPanel ? priceLevelValues(options.priceLevels) : []
    const [lo, hi] = staticPanelRange(panel, extra)
    const yOfValue = (value: number) => bottom - ((value - lo) / (hi - lo || 1)) * (bottom - top)
    const valueOfY = (y: number) => lo + ((bottom - y) / (bottom - top || 1)) * (hi - lo || 1)
    const allTicks = thumbnail ? [] : panel.ticks ? [...panel.ticks] : niceTicks(lo, hi, index === 0 ? 4 : 2)
    const ticks = allTicks.filter((tick) => tick >= lo && tick <= hi)
    const digits = panel.digits ?? (Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi - lo) < 50 ? 1 : 0)
    // Ô cuối đóng bằng đường đáy khi vạch lưới thấp nhất cách đáy xa (cận tường minh dưới vạch thấp nhất).
    const lowestGrid = Math.max(top, ...ticks.map(yOfValue))
    const baseline = hasTicks && index === panels.length - 1 && bottom - lowestGrid > 16
    panelLayouts.push({ index, top, bottom, lo, hi, ticks, digits, baseline, yOfValue, valueOfY })
  })
  const height = cursorY + (hasTicks ? X_AXIS_ROW : thumbnail ? 0 : 6)
  return {
    width,
    height,
    thumbnail,
    narrow,
    count,
    left,
    right,
    step,
    topPad,
    hasTicks,
    xAxisRow: X_AXIS_ROW,
    plot: { left, top: topPad, right, bottom: Math.max(topPad, height - (hasTicks ? X_AXIS_ROW : 0)) },
    panels: panelLayouts,
    frame,
    paint,
    xOfIndex,
    indexOfX: (x) => Math.max(0, Math.min(count - 1, Math.floor((x - left) / step))),
    tooltipSide: (index) => (xOfIndex(index) > width * 0.55 ? "left" : "right"),
    measure,
    shadeLabels: labelled.map((shade, index) => ({ text: shade.label, token: paint(shade.labelToken ?? LABEL_TOKEN), row: shadeRows[index].row, x: shadeRows[index].x })),
  }
}

function priceLevelValues(levels: StaticPriceLevels | undefined): number[] {
  return [levels?.reference, levels?.ceiling, levels?.floor].filter(isNumber)
}

/* ------------------------------------------------------------------ bộ phát lệnh */

type Emitter = ReturnType<typeof createEmitter>

/** Gom lệnh vẽ và đổi sang pixel thiết bị (nhân dpr). Bỏ qua lệnh rỗng. */
function createEmitter(dpr: number) {
  const commands: DrawCommand[] = []
  const scaled = (list: readonly number[]) => Float64Array.from(list, (value) => value * dpr)
  const dashed = (dash?: readonly number[]) => dash?.map((value) => value * dpr)
  return {
    commands,
    rects(token: ColorToken, alpha: number | undefined, list: readonly number[]) {
      if (list.length >= 4) commands.push({ op: "rects", token, alpha, data: scaled(list), count: list.length / 4 })
    },
    lines(token: ColorToken, width: number, dash: readonly number[] | undefined, list: readonly number[]) {
      if (list.length >= 4) commands.push({ op: "lines", token, width: width * dpr, dash: dashed(dash), data: scaled(list), count: list.length / 4 })
    },
    polyline(token: ColorToken, width: number, dash: readonly number[] | undefined, list: readonly number[]) {
      if (list.length >= 4) commands.push({ op: "polyline", token, width: width * dpr, dash: dashed(dash), data: scaled(list), count: list.length / 2 })
    },
    polygon(token: ColorToken, alpha: number, list: readonly number[]) {
      if (list.length >= 6) commands.push({ op: "polygon", token, alpha, data: scaled(list), count: list.length / 2 })
    },
    circle(token: ColorToken, x: number, y: number, radius: number, fill: boolean, width?: number) {
      commands.push({ op: "circle", token, x: x * dpr, y: y * dpr, radius: radius * dpr, fill, width: width === undefined ? undefined : width * dpr })
    },
    text(token: ColorToken, text: string, x: number, y: number, align: TextAlign, size: number, weight: 400 | 500 | 600, tabular = false) {
      commands.push({ op: "text", token, text, x: x * dpr, y: y * dpr, align, size: size * dpr, weight, tabular })
    },
    clip(x: number, y: number, width: number, height: number) {
      commands.push({ op: "clip", x: x * dpr, y: y * dpr, width: width * dpr, height: height * dpr })
    },
    unclip() {
      commands.push({ op: "unclip" })
    },
  }
}

const ANCHOR_ALIGN: Record<LabelAnchor, TextAlign> = { start: "left", middle: "center", end: "right" }

/** Các đoạn liên tục của một chuỗi (giá trị thiếu làm đứt), mỗi đoạn là danh sách x,y; bỏ đoạn chỉ có một điểm. */
function lineRuns(values: StaticValues, x: (k: number) => number, y: (v: number) => number): number[][] {
  const runs: number[][] = []
  let run: number[] = []
  const flush = () => {
    if (run.length >= 4) runs.push(run)
    run = []
  }
  values.forEach((value, k) => {
    if (!isNumber(value)) return flush()
    run.push(x(k), y(value))
  })
  flush()
  return runs
}

/** Các đa giác kín giữa hai chuỗi, tách ở chỗ thiếu số liệu hoặc khi `include` sai; bỏ đoạn chỉ có một quan sát. */
function areaRuns(upper: StaticValues, lower: StaticValues, x: (k: number) => number, y: (v: number) => number, include: (k: number) => boolean = () => true): number[][] {
  const polygons: number[][] = []
  let start = -1
  const flush = (end: number) => {
    if (start >= 0 && end > start) {
      const polygon: number[] = []
      for (let k = start; k <= end; k += 1) polygon.push(x(k), y(upper[k] as number))
      for (let k = end; k >= start; k -= 1) polygon.push(x(k), y(lower[k] as number))
      polygons.push(polygon)
    }
    start = -1
  }
  upper.forEach((value, k) => {
    if (isNumber(value) && isNumber(lower[k]) && include(k)) {
      if (start < 0) start = k
    } else flush(k - 1)
  })
  flush(upper.length - 1)
  return polygons
}

/** Gom các phần tử cùng token giữ thứ tự gặp đầu tiên của token. */
function groupByToken<T>(items: readonly T[], tokenOf: (item: T) => ColorToken): Map<ColorToken, T[]> {
  const groups = new Map<ColorToken, T[]>()
  for (const item of items) {
    const token = tokenOf(item)
    const group = groups.get(token)
    if (group) group.push(item)
    else groups.set(token, [item])
  }
  return groups
}

/* ------------------------------------------------------------------ đặt nhãn của một ô */

// Trọng số đặt nhãn: thứ nhãn được phép đè lên, từ tệ nhất tới chịu được nhất.
const MARKER_WEIGHT = 300
const PRICE_WEIGHT = 60
const SERIES_WEIGHT = 40
const CANDLE_WEIGHT = 40
const SEGMENT_WEIGHT = 30
const LEVEL_WEIGHT = 25
const BAR_WEIGHT = 20
const SOFT_WEIGHT = 10

const pointRadius = (point: StaticPoint) => (point.shape === "ring" ? 5 : 3.5)

type PanelLabel = PlacedLabel & { token: ColorToken; tabular: boolean }

/**
 * Nhãn chữ của một ô (nhãn điểm, ghi chú, mức, vùng, Fibonacci), đặt sao cho nằm trong khung vẽ và tránh chuỗi số
 * liệu, nến, cột, dấu và nhau. Nhãn quá rộng so với khung thì ngắt dòng.
 */
function placePanelLabels(panels: readonly StaticPanel[], layout: StaticLayout, panelIndex: number, priceLevels: StaticPriceLevels | undefined): PanelLabel[] {
  const panel = panels[panelIndex]
  const pl = layout.panels[panelIndex]
  const { frame, measure, paint, left: x0, right: x1, thumbnail, step } = layout
  const { top, bottom, yOfValue: y } = pl
  const x = layout.xOfIndex
  const xi = (i: number) => x(i - frame.start)
  const candleWidth = Math.max(1, Math.min(14, step * 0.62))
  const barWidth = Math.max(1, Math.min(12, step * 0.7))
  const points = panel.points ?? []
  const requests: (LabelRequest & { token: ColorToken; tabular: boolean })[] = []
  const plotWidth = x1 - x0

  // Vị trí ứng viên của một nhãn: một dòng trước (ngắt dòng khi rộng hơn khung vẽ), rồi với nhãn dài thì chính các vị
  // trí đó với chữ tách làm hai dòng.
  const variants = (text: string, size: number, weight: number, positions: (lineCount: number) => Candidate[]): Candidate[] => {
    const width = annotationWidth(text, size, measure, weight)
    const first = width <= plotWidth - 8 ? [text] : wrapText(text, plotWidth - 8, size, 3, measure, weight)
    const candidates = positions(first.length).map((candidate) => ({ ...candidate, lines: first }))
    if (first.length === 1 && width > plotWidth * 0.4) {
      const halves = wrapText(text, (width * (Math.ceil(text.length / 2) + 3)) / text.length, size, 2, measure, weight)
      if (halves.length === 2) candidates.push(...positions(2).map((candidate) => ({ ...candidate, lines: halves })))
    }
    return candidates
  }

  points.forEach((point, index) => {
    if (!point.label) return
    requests.push({
      key: `point-${index}`,
      text: point.label,
      size: 11,
      weight: 600,
      candidates: variants(point.label, 11, 600, (lines) => aroundPoint(xi(point.i), y(point.value), pointRadius(point) + 5, 11, point.pos ?? "above", lines)),
      token: paint(point.labelToken),
      tabular: false,
    })
  })
  if (!thumbnail) {
    panel.notes?.forEach((note, index) => {
      requests.push({
        key: `note-${index}`,
        text: note.text,
        size: 11,
        weight: 600,
        candidates: variants(note.text, 11, 600, (lines) => aroundPoint(xi(note.i), y(note.value), 6, 11, "above", lines)),
        token: paint(note.token),
        tabular: false,
      })
    })
    panel.levels?.forEach((level, index) => {
      if (!level.label) return
      requests.push({
        key: `level-${index}`,
        owner: `level-${index}`,
        text: level.label,
        size: 10.5,
        candidates: variants(level.label, 10.5, 400, (lines) => alongLine(y(level.value), x0, x1, 10.5, "start", lines)),
        token: paint(level.labelToken),
        tabular: false,
      })
    })
    panel.zones?.forEach((zone, index) => {
      if (!zone.label) return
      const zoneTop = y(Math.max(zone.from, zone.to))
      const zoneBottom = y(Math.min(zone.from, zone.to))
      requests.push({
        key: `zone-${index}`,
        text: zone.label,
        size: 10.5,
        candidates: variants(zone.label, 10.5, 400, (lines) => inZone(zoneTop, zoneBottom, x0, x1, 10.5, lines)),
        token: paint(zone.labelToken),
        tabular: false,
      })
    })
    const fib = panel.fib
    if (fib) {
      const from = xi(Math.min(fib.lo.i, fib.hi.i))
      fib.levels.forEach((level) => {
        requests.push({
          key: `fib-${level}`,
          owner: `fib-${level}`,
          text: percent.format(level),
          size: 10.5,
          candidates: alongLine(y(fibPrice(fib, level)), from, x1, 10.5, "end"),
          token: paint(fibToken(fib.token)),
          tabular: true,
        })
      })
    }
  }
  if (requests.length === 0) return []

  const segments: Segment[] = []
  const obstacles: Obstacle[] = []
  const series = (values: StaticValues, weight: number) =>
    segments.push(...polylineSegments(values.map((value, k) => (isNumber(value) ? [x(k), y(value)] : null)), weight))
  for (const line of panel.series) series(line.values, line.token === "foreground" ? PRICE_WEIGHT : SERIES_WEIGHT)
  if (panel.band) {
    series(panel.band.upper, LEVEL_WEIGHT)
    series(panel.band.lower, LEVEL_WEIGHT)
  }
  const horizontal = (value: number, from: number, weight: number, owner?: string) =>
    segments.push({ x1: from, y1: y(value), x2: x1, y2: y(value), weight, owner })
  panel.levels?.forEach((level, index) => horizontal(level.value, x0, LEVEL_WEIGHT, `level-${index}`))
  if (panelIndex === priceLevelPanel(panels)) for (const value of priceLevelValues(priceLevels)) horizontal(value, x0, LEVEL_WEIGHT)
  if (panel.fib) {
    const fib = panel.fib
    const from = xi(Math.min(fib.lo.i, fib.hi.i))
    fib.levels.forEach((level) => horizontal(fibPrice(fib, level), from, LEVEL_WEIGHT, `fib-${level}`))
  }
  if (panel.zero) horizontal(0, x0, SOFT_WEIGHT)
  panel.segments?.forEach((segment) => {
    const [fi, fv] = segment.from
    const [ti, tv] = segment.to
    const slope = ti === fi ? 0 : (tv - fv) / (ti - fi)
    const extend = segment.extend ?? 0
    segments.push({ x1: xi(fi), y1: y(fv), x2: xi(ti + extend), y2: y(tv + slope * extend), weight: SEGMENT_WEIGHT })
  })
  for (const mark of frame.marks) segments.push({ x1: xi(mark.i), y1: top, x2: xi(mark.i), y2: bottom, weight: SOFT_WEIGHT })
  const candles = panel.candles
  candles?.close.forEach((_, k) => {
    const high = candles.high[k]
    const low = candles.low[k]
    if (!isNumber(high) || !isNumber(low)) return
    obstacles.push({ box: { l: x(k) - candleWidth / 2, r: x(k) + candleWidth / 2, t: y(high), b: y(low) }, weight: CANDLE_WEIGHT })
  })
  if (panel.bars) {
    const base = pl.lo > 0 ? pl.lo : pl.hi < 0 ? pl.hi : 0
    panel.bars.values.forEach((value, k) => {
      if (!isNumber(value)) return
      obstacles.push({
        box: { l: x(k) - barWidth / 2, r: x(k) + barWidth / 2, t: Math.min(y(base), y(value)), b: Math.max(y(base), y(value)) },
        weight: BAR_WEIGHT,
      })
    })
  }
  for (const point of points) {
    const r = pointRadius(point) + 1
    const cx = xi(point.i)
    const cy = y(point.value)
    obstacles.push({ box: { l: cx - r, r: cx + r, t: cy - r, b: cy + r }, weight: MARKER_WEIGHT })
  }

  const bounds: Box = { l: x0, r: x1, t: top, b: bottom }
  const placed = placeLabels(requests, { bounds, segments, obstacles, measure })
  const extras = new Map(requests.map((request) => [request.key, request]))
  return placed.map((label) => ({ ...label, token: extras.get(label.key)?.token ?? LABEL_TOKEN, tabular: extras.get(label.key)?.tabular ?? false }))
}

/* ------------------------------------------------------------------ dựng cảnh */

function emitPanelFrame(out: Emitter, layout: StaticLayout, panel: StaticPanel, pl: StaticPanelLayout) {
  const { left: x0, right: x1, thumbnail } = layout
  const y = pl.yOfValue
  if (!thumbnail && panel.title) out.text(LABEL_TOKEN, panel.title, x0, pl.top - 7, "left", 11, 600)
  const grid: number[] = []
  for (const tick of pl.ticks) grid.push(x0, y(tick), x1, y(tick))
  out.lines("border", 0.8, undefined, grid)
  for (const tick of pl.ticks) out.text(LABEL_TOKEN, formatStaticValue(tick, pl.digits), x1 + 6, y(tick) + 3.5, "left", 10.5, 400, true)
  if (thumbnail) {
    const { top, bottom } = pl
    out.lines("border", 0.8, undefined, [x0, top, x1, top, x1, top, x1, bottom, x1, bottom, x0, bottom, x0, bottom, x0, top])
  }
  if (pl.baseline) out.lines("border", 1, undefined, [x0, pl.bottom, x1, pl.bottom])
}

function emitPanelData(out: Emitter, layout: StaticLayout, panel: StaticPanel, pl: StaticPanelLayout, levelLines: StaticPriceLevels | null) {
  const { left: x0, right: x1, step, frame, paint, thumbnail } = layout
  const { top, bottom, lo, hi, yOfValue: y } = pl
  const x = layout.xOfIndex
  const xi = (i: number) => x(i - frame.start)
  const candleWidth = Math.max(1, Math.min(14, step * 0.62))
  const barWidth = Math.max(1, Math.min(12, step * 0.7))

  out.clip(x0, top - 2, x1 - x0, bottom - top + 4)

  // Nền theo chiều ngang, rồi vùng giá.
  const shaded = (frame.shade ?? []).map((shade) => ({ token: paint(shade.token), rect: [xi(shade.from) - step / 2, top, Math.max(1, xi(shade.to) - xi(shade.from) + step), bottom - top] }))
  for (const [token, group] of groupByToken(shaded, (item) => item.token)) out.rects(token, 0.1, group.flatMap((item) => item.rect))
  const zones = (panel.zones ?? []).map((zone) => ({ token: paint(zone.token), rect: [x0, y(Math.max(zone.from, zone.to)), x1 - x0, Math.abs(y(zone.from) - y(zone.to))] }))
  for (const [token, group] of groupByToken(zones, (item) => item.token)) out.rects(token, 0.1, group.flatMap((item) => item.rect))
  if (panel.zero && lo < 0 && hi > 0) out.lines("chart-5", 1, undefined, [x0, y(0), x1, y(0)])

  if (panel.band) {
    const token = paint(panel.band.token)
    for (const polygon of areaRuns(panel.band.upper, panel.band.lower, x, y)) out.polygon(token, 0.12, polygon)
    // Hai mép dải (dải Bollinger trên và dưới) là hai đường riêng, không chỉ là phần tô.
    for (const edge of [panel.band.upper, panel.band.lower]) for (const run of lineRuns(edge, x, y)) out.polyline(token, thumbnail ? 1 : 1.3, undefined, run)
  }
  const fill = panel.fill_between
  const fillA = fill ? panel.series[fill.a] : undefined
  const fillB = fill ? panel.series[fill.b] : undefined
  if (fill && fillA && fillB) {
    const above = (k: number) => {
      const a = fillA.values[k]
      const b = fillB.values[k]
      return isNumber(a) && isNumber(b) && a >= b
    }
    const below = (k: number) => {
      const a = fillA.values[k]
      const b = fillB.values[k]
      return isNumber(a) && isNumber(b) && a < b
    }
    for (const polygon of areaRuns(fillA.values, fillB.values, x, y, above)) out.polygon(paint(fill.aboveToken), 0.18, polygon)
    for (const polygon of areaRuns(fillA.values, fillB.values, x, y, below)) out.polygon(paint(fill.belowToken), 0.18, polygon)
  }

  const fib = panel.fib
  if (fib) {
    const token = paint(fibToken(fib.token))
    const from = xi(Math.min(fib.lo.i, fib.hi.i))
    if (fib.zone) {
      const za = y(fibPrice(fib, fib.zone[0]))
      const zb = y(fibPrice(fib, fib.zone[1]))
      out.rects(token, 0.14, [from, Math.min(za, zb), Math.max(0, x1 - from), Math.abs(za - zb)])
    }
    const lines: number[] = []
    for (const level of fib.levels) {
      const ly = y(fibPrice(fib, level))
      lines.push(from, ly, x1, ly)
    }
    out.lines(token, 0.9, [3, 3], lines)
  }
  for (const level of panel.levels ?? []) out.lines(paint(level.token), 1, [4, 4], [x0, y(level.value), x1, y(level.value)])
  if (levelLines) {
    const reference: [number | undefined, ColorToken][] = [
      [levelLines.reference, "price-ref"],
      [levelLines.ceiling, "price-ceiling"],
      [levelLines.floor, "price-floor"],
    ]
    for (const [value, token] of reference) if (isNumber(value) && value >= lo && value <= hi) out.lines(token, 1, [4, 4], [x0, y(value), x1, y(value)])
  }

  const bars = panel.bars
  if (bars) {
    const base = lo > 0 ? lo : hi < 0 ? hi : 0
    const items = bars.values.flatMap((value, k) =>
      isNumber(value)
        ? [{ token: paint(bars.tokens[k] ?? "chart-5"), rect: [x(k) - barWidth / 2, Math.min(y(base), y(value)), barWidth, Math.max(0.8, Math.abs(y(value) - y(base)))] }]
        : [],
    )
    for (const [token, group] of groupByToken(items, (item) => item.token)) out.rects(token, 0.75, group.flatMap((item) => item.rect))
  }
  const candles = panel.candles
  if (candles) {
    const wicks: Record<"price-up" | "price-down", number[]> = { "price-up": [], "price-down": [] }
    const bodies: Record<"price-up" | "price-down", number[]> = { "price-up": [], "price-down": [] }
    candles.close.forEach((close, k) => {
      const open = candles.open[k]
      const high = candles.high[k]
      const low = candles.low[k]
      if (!isNumber(open) || !isNumber(close) || !isNumber(high) || !isNumber(low)) return
      const token = close >= open ? "price-up" : "price-down"
      wicks[token].push(x(k), y(high), x(k), y(low))
      bodies[token].push(x(k) - candleWidth / 2, y(Math.max(open, close)), candleWidth, Math.max(1, Math.abs(y(open) - y(close))))
    })
    for (const token of ["price-up", "price-down"] as const) {
      out.lines(token, 1, undefined, wicks[token])
      out.rects(token, undefined, bodies[token])
    }
  }
  for (const series of panel.series) {
    const width = series.width ?? (series.token === "foreground" ? 1.6 : 1.5)
    for (const run of lineRuns(series.values, x, y)) out.polyline(paint(series.token), width, series.dash ? SERIES_DASH : undefined, run)
  }
  for (const segment of panel.segments ?? []) {
    const [fi, fv] = segment.from
    const [ti, tv] = segment.to
    const slope = ti === fi ? 0 : (tv - fv) / (ti - fi)
    const extend = segment.extend ?? 0
    out.lines(paint(segment.token), 1.5, segment.dash ? SERIES_DASH : undefined, [xi(fi), y(fv), xi(ti + extend), y(tv + slope * extend)])
  }
  const marks: number[] = []
  for (const mark of frame.marks) marks.push(xi(mark.i), top, xi(mark.i), bottom)
  out.lines("chart-5", 0.8, [3, 4], marks)
  out.unclip()
}

function emitPoint(out: Emitter, layout: StaticLayout, point: StaticPoint, pl: StaticPanelLayout) {
  const cx = layout.xOfIndex(point.i - layout.frame.start)
  const cy = pl.yOfValue(point.value)
  const token = layout.paint(point.token)
  if (point.shape === "ring") out.circle(token, cx, cy, pointRadius(point), false, 1.8)
  else {
    out.circle(token, cx, cy, pointRadius(point), true)
    out.circle("background", cx, cy, pointRadius(point), false, 1)
  }
}

/**
 * Cảnh tĩnh của biểu đồ: lưới, trục, số liệu, chú thích và nhãn (lớp nền và dữ liệu). Crosshair nằm ở
 * `buildStaticCrosshair`. Hàm thuần: cùng đầu vào cho cùng danh sách lệnh.
 */
export function buildStaticScene(panels: readonly StaticPanel[], geometry: Pick<Geometry, "width" | "dpr">, options: StaticSceneOptions = {}): Scene {
  const layout = layoutStatic(panels, geometry, options)
  if (layout.count === 0) return []
  const out = createEmitter(geometry.dpr > 0 ? geometry.dpr : 1)
  const { frame, thumbnail, hasTicks, measure } = layout
  const levelPanel = hasLevelLines(options.priceLevels) ? priceLevelPanel(panels) : -1

  panels.forEach((panel, index) => {
    const pl = layout.panels[index]
    emitPanelFrame(out, layout, panel, pl)
    emitPanelData(out, layout, panel, pl, index === levelPanel ? (options.priceLevels ?? null) : null)
    for (const point of panel.points ?? []) emitPoint(out, layout, point, pl)
    for (const label of placePanelLabels(panels, layout, index, options.priceLevels)) {
      const align = ANCHOR_ALIGN[label.anchor]
      const weight = label.weight === 600 ? 600 : label.weight === 500 ? 500 : 400
      label.lines.forEach((line, lineIndex) => out.text(label.token, line, label.x, label.y + lineIndex * label.size * LINE_HEIGHT, align, label.size, weight, label.tabular))
    }
  })

  for (const shade of layout.shadeLabels) out.text(shade.token, shade.text, shade.x, 12 + shade.row * 14, "center", 10.5, 600)
  for (const mark of frame.marks) out.text(layout.paint("chart-1"), mark.label, layout.xOfIndex(mark.i - frame.start), layout.topPad - 4, "center", 11, 600)
  if (hasTicks && !thumbnail) {
    const ticks = thinAxisLabels(
      (frame.ticks ?? []).flatMap((text, k) => {
        if (!text) return []
        const half = measure(text, 10.5) / 2
        return [{ index: k, text, anchor: "middle" as const, at: Math.min(Math.max(layout.xOfIndex(k), half + 1), layout.width - half - 1) }]
      }),
      10.5,
      6,
      measure,
    )
    for (const tick of ticks) out.text(LABEL_TOKEN, tick.text, tick.at, layout.height - 5, "center", 10.5, 400, true)
  }
  return out.commands
}

/* ------------------------------------------------------------------ crosshair và chú giải */

/** Nhãn của quan sát thứ k trong cửa sổ: nhãn trục x nếu có, không thì "Phiên n". */
export function staticObservationLabel(frame: StaticFrame, k: number): string {
  const tick = frame.ticks?.[k]
  return tick ? tick : `Phiên ${frame.start + k + 1}`
}

/** Một dòng đọc cho mỗi nến (mở, cao, thấp, đóng), chuỗi và cột của mọi ô tại vị trí k. Thiếu số liệu là `null`. */
export function staticReadout(panels: readonly StaticPanel[], k: number): StaticReadoutRow[] {
  return panels.flatMap((panel) => {
    const digits = panel.digits ?? 2
    return [
      ...(panel.candles
        ? [
            { name: "Mở cửa", value: panel.candles.open[k] ?? null, digits, token: null },
            { name: "Cao nhất", value: panel.candles.high[k] ?? null, digits, token: null },
            { name: "Thấp nhất", value: panel.candles.low[k] ?? null, digits, token: null },
            { name: "Đóng cửa", value: panel.candles.close[k] ?? null, digits, token: null },
          ]
        : []),
      ...panel.series.map((series) => ({ name: series.name, value: series.values[k] ?? null, digits, token: series.token })),
      ...(panel.bars ? [{ name: panel.bars.name, value: panel.bars.values[k] ?? null, digits, token: panel.bars.tokens[k] ?? null }] : []),
    ]
  })
}

/** Câu đọc cho trình đọc màn hình: "Phiên 71: Mở cửa 50,0, ...". */
export function staticReadoutText(panels: readonly StaticPanel[], k: number): string {
  const frame = panels[0]?.frame
  if (!frame) return ""
  return `${staticObservationLabel(frame, k)}: ${staticReadout(panels, k)
    .map((row) => `${row.name} ${formatStaticValue(row.value, row.digits)}`)
    .join(", ")}`
}

/**
 * Crosshair tại quan sát `index` (kẹp vào cửa sổ): lớp trên cùng gồm đường dọc và chấm trên từng chuỗi, cùng giá
 * trị cho chú giải đọc. Trả về `null` với hình thu nhỏ (không có crosshair) hoặc khi không có ô.
 */
export function buildStaticCrosshair(panels: readonly StaticPanel[], geometry: Pick<Geometry, "width" | "dpr">, options: StaticSceneOptions, index: number): StaticCrosshair | null {
  const layout = layoutStatic(panels, geometry, options)
  if (layout.count === 0 || layout.thumbnail) return null
  const k = Math.max(0, Math.min(layout.count - 1, Math.round(index)))
  const out = createEmitter(geometry.dpr > 0 ? geometry.dpr : 1)
  const x = layout.xOfIndex(k)
  panels.forEach((panel, panelIndex) => {
    const pl = layout.panels[panelIndex]
    const dots = panel.series.flatMap((series) => {
      const value = series.values[k]
      return isNumber(value) ? [{ token: layout.paint(series.token), y: pl.yOfValue(value) }] : []
    })
    if (dots.length === 0) return
    out.clip(layout.left, pl.top - 2, layout.right - layout.left, pl.bottom - pl.top + 4)
    for (const dot of dots) {
      out.circle(dot.token, x, dot.y, 3.5, true)
      out.circle("background", x, dot.y, 3.5, false, 1)
    }
    out.unclip()
  })
  out.lines("foreground", 1, [3, 3], [x, layout.plot.top, x, layout.plot.bottom])
  return { index: k, x, label: staticObservationLabel(layout.frame, k), readout: staticReadout(panels, k), scene: out.commands }
}

/** Chú giải của biểu đồ: nến, chuỗi, cột; bỏ trùng nhãn. Rỗng với hình thu nhỏ. */
export function staticLegend(panels: readonly StaticPanel[]): StaticLegendEntry[] {
  if (panels.length === 0 || !panels[0].frame.axes) return []
  const entries: StaticLegendEntry[] = panels.flatMap((panel) => [
    ...(panel.candles ? [{ label: "Nến giá", token: "price-up" as ColorToken, shape: "bar" as const, dash: false }] : []),
    ...panel.series.map((series) => ({ label: series.name, token: series.token, shape: "line" as const, dash: series.dash === true })),
    ...(panel.bars ? [{ label: panel.bars.name, token: "chart-5" as ColorToken, shape: "bar" as const, dash: false }] : []),
  ])
  return entries.filter((entry, index) => entries.findIndex((other) => other.label === entry.label) === index)
}
