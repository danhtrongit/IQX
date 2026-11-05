/**
 * Chuyển layout TradingView đã lưu (`widget.save`) sang `ChartDocument` của IQLine (docs/iqline-design.md §11).
 * Hàm thuần: không ném lỗi với layout hỏng, không sửa dữ liệu vào, không chạm DOM.
 *
 * Cấu trúc đọc: `charts[].panes[].sources[]`. Mỗi nguồn có `type` ("MainSeries", "Study", "LineTool..."). Hình vẽ có
 * `points[]` gồm `time_t` (Unix giây), `offset` (số nến lệch so với nến tại `time_t`, dùng cho điểm ở vùng tương lai) và
 * `price`; chỉ báo có `metaInfo` và `state.inputs`. Phần đọc được dung sai: khoá nào thiếu thì bỏ qua chứ không báo lỗi.
 */
import type { ChartDocument, ChartIndicatorInput, ChartType, Drawing, DrawingStyle, DrawingTool, IndicatorParams } from "../types"
import { TOOL_SPECS } from "./tools"

/** Giới hạn kích thước `state` của endpoint `/chart-drawings/{symbol}` (§11). */
export const MAX_STATE_BYTES = 512 * 1024

export type TradingViewConversion = {
  document: ChartDocument
  convertedDrawings: number
  convertedIndicators: number
  /** Hình vẽ không chuyển được (loại không có trong 14 công cụ, hoặc điểm neo hỏng). */
  skippedDrawings: number
  /** Chỉ báo không chuyển được (ví dụ Ichimoku Cloud, Volatility O-H-L-C). */
  skippedIndicators: number
  /** Số nguồn bỏ qua theo tên loại, để báo người dùng "N hình vẽ không chuyển được sang IQLine". */
  skippedByType: Record<string, number>
  /** True nếu `charts` gốc bị bỏ vì tổng kích thước vượt 512 KB. */
  chartsDropped: boolean
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

// ------------------------------------------------------------------ khung thời gian

const DAY = 86_400
/** Giờ Việt Nam (UTC+7), để biết thứ trong tuần của một mốc thời gian. */
const VN_OFFSET = 7 * 3600
/** Offset lớn hơn mức này là dữ liệu hỏng, không phải điểm neo thật. */
const MAX_OFFSET = 100_000

/**
 * Bước của một khung thời gian tính bằng giây: "1", "5", "15", "30", "60" và số phút bất kỳ; "D", "W", "M" kèm hệ số
 * tuỳ chọn ("2D"). Tháng tính 30 ngày. Khung không nhận ra (giây, tick) trả về null.
 */
export function intervalStepSeconds(interval: string): number | null {
  const trimmed = interval.trim().toUpperCase()
  if (/^\d+$/.test(trimmed)) {
    const minutes = Number(trimmed)
    return minutes > 0 ? minutes * 60 : null
  }
  const match = /^(\d+)?([DWM])$/.exec(trimmed)
  if (!match) return null
  const factor = match[1] ? Number(match[1]) : 1
  if (factor <= 0) return null
  return factor * (match[2] === "D" ? DAY : match[2] === "W" ? 7 * DAY : 30 * DAY)
}

function isWeekend(time: number): boolean {
  const day = new Date((time + VN_OFFSET) * 1000).getUTCDay()
  return day === 0 || day === 6
}

/** Cộng `bars` ngày giao dịch (bỏ thứ bảy, chủ nhật) vào một mốc thời gian. */
function addTradingDays(time: number, bars: number): number {
  const direction = bars < 0 ? -1 : 1
  const count = Math.abs(bars)
  const weeks = Math.floor(count / 5)
  let result = time + direction * weeks * 7 * DAY
  for (let i = 0; i < count - weeks * 5; i++) {
    result += direction * DAY
    while (isWeekend(result)) result += direction * DAY
  }
  return result
}

/** `time_t` cộng `offset` nến của khung `interval`. Khung ngày bỏ cuối tuần; khung khác cộng đúng bước của khung. */
function shiftByBars(timeT: number, offset: number, interval: string): number | null {
  if (offset === 0) return timeT
  if (Math.abs(offset) > MAX_OFFSET) return null
  const step = intervalStepSeconds(interval)
  if (step === null) return timeT
  if (interval.trim().toUpperCase() === "D") return addTradingDays(timeT, Math.round(offset))
  return timeT + offset * step
}

// ------------------------------------------------------------------ hình vẽ

const DRAWING_TOOLS: Readonly<Record<string, DrawingTool>> = {
  LineToolTrendLine: "trend",
  LineToolPriceRange: "measure",
  LineToolRectangle: "rectangle",
}

function styleFor(tool: DrawingTool, state: UnknownRecord | null): DrawingStyle {
  const style: DrawingStyle = { ...TOOL_SPECS[tool].defaultStyle }
  if (!state) return style
  const width = finite(state.linewidth)
  if (width !== null && width >= 1) style.width = Math.min(4, width)
  const lineStyle = finite(state.linestyle)
  if (lineStyle !== null && lineStyle > 0) style.dash = "dashed"
  if (tool === "rectangle" && state.fillBackground === false) style.fill = false
  return style
}

function convertDrawing(source: UnknownRecord, tool: DrawingTool, fallbackInterval: string, id: string): Drawing | null {
  const state = isRecord(source.state) ? source.state : null
  const rawPoints = Array.isArray(source.points) ? source.points : state && Array.isArray(state.points) ? state.points : null
  const required = TOOL_SPECS[tool].anchorCount
  if (!rawPoints || rawPoints.length < required) return null
  const sourceInterval = text(source.interval) ?? (state ? text(state.interval) : null)
  const anchors: Drawing["anchors"] = []
  for (const raw of rawPoints.slice(0, required)) {
    if (!isRecord(raw)) return null
    const timeT = finite(raw.time_t)
    const price = finite(raw.price)
    if (timeT === null || price === null) return null
    const offset = raw.offset === undefined ? 0 : finite(raw.offset)
    if (offset === null) return null
    const time = shiftByBars(timeT, offset, text(raw.interval) ?? sourceInterval ?? fallbackInterval)
    if (time === null) return null
    anchors.push({ time, price })
  }
  const drawing: Drawing = { id, tool, anchors, style: styleFor(tool, state) }
  if (state?.frozen === true) drawing.locked = true
  if (state?.visible === false || source.visible === false) drawing.hidden = true
  return drawing
}

// ------------------------------------------------------------------ chỉ báo

type StudyRule = {
  /** Tên đã chuẩn hoá (chữ thường, bỏ phần sau "@" và mọi ký tự không phải chữ số). */
  names: readonly string[]
  id: string
  /** Khoá tham số IQLine -> các khoá đầu vào có thể có trong TradingView, thử lần lượt, chỉ nhận số dương. */
  params: Readonly<Record<string, readonly string[]>>
}

/**
 * Bảng chỉ báo (§11). `id` là id trong sổ chỉ báo của IQLine; khoá tham số theo danh mục Flashback
 * (`period`, `k`, `fast`, `slow`, `signal`, `lookback`). BB Width và Volume Profile là chỉ báo mới của `market`,
 * id `bb_width` và `volume_profile` cần khớp với `registerIndicator`.
 */
export const STUDY_RULES: readonly StudyRule[] = [
  { names: ["volume"], id: "volume", params: { lookback: ["maLength"] } },
  { names: ["rsi", "relativestrengthindex"], id: "rsi", params: { period: ["length", "in_0"] } },
  { names: ["ma", "sma", "movingaverage", "simplemovingaverage"], id: "ma", params: { period: ["length", "in_0"] } },
  { names: ["maexp", "ema", "movingaverageexponential", "exponentialmovingaverage"], id: "ema", params: { period: ["length", "in_0"] } },
  { names: ["bb", "bollingerbands"], id: "bollinger", params: { period: ["length", "in_0"], k: ["mult", "in_1"] } },
  { names: ["bbw", "bbwidth", "bollingerbandwidth", "bollingerbandswidth"], id: "bb_width", params: { period: ["length", "in_0"], k: ["mult", "in_1"] } },
  { names: ["macd", "movingaverageconvergencedivergence"], id: "macd", params: { fast: ["fast_length", "in_0"], slow: ["slow_length", "in_1"], signal: ["signal_length", "in_2", "in_3"] } },
  { names: ["dc", "donch", "donchian", "donchianchannels"], id: "donchian", params: { period: ["length", "in_0"] } },
  { names: ["cmf", "chaikinmoneyflow"], id: "cmf", params: { period: ["length", "in_0"] } },
  { names: ["vbpvisible", "volumeprofilevisiblerange"], id: "volume_profile", params: {} },
]

function normalizeName(value: string): string {
  const at = value.indexOf("@")
  return (at >= 0 ? value.slice(0, at) : value).toLowerCase().replace(/[^a-z0-9]/g, "")
}

function studyMeta(source: UnknownRecord): UnknownRecord | null {
  if (isRecord(source.metaInfo)) return source.metaInfo
  const state = isRecord(source.state) ? source.state : null
  return state && isRecord(state.metaInfo) ? state.metaInfo : null
}

/** Mọi tên có thể dùng để nhận ra chỉ báo, đã chuẩn hoá. */
function studyNames(meta: UnknownRecord | null): string[] {
  if (!meta) return []
  return [meta.id, meta.shortDescription, meta.description].flatMap((value) => {
    const raw = text(value)
    return raw ? [normalizeName(raw)] : []
  })
}

function studyLabel(source: UnknownRecord, meta: UnknownRecord | null): string {
  const raw = (meta && (text(meta.description) ?? text(meta.shortDescription) ?? text(meta.id))) ?? text(source.type) ?? "Study"
  const at = raw.indexOf("@")
  return at > 0 ? raw.slice(0, at) : raw
}

function studyParams(rule: StudyRule, source: UnknownRecord): IndicatorParams {
  const state = isRecord(source.state) ? source.state : null
  const inputs = state && isRecord(state.inputs) ? state.inputs : null
  const params: IndicatorParams = {}
  if (!inputs) return params
  for (const [key, candidates] of Object.entries(rule.params)) {
    for (const name of candidates) {
      const value = finite(inputs[name])
      if (value !== null && value > 0) {
        params[key] = value
        break
      }
    }
  }
  return params
}

// ------------------------------------------------------------------ kiểu biểu đồ

/** `style` của MainSeries: 0 thanh OHLC, 1 nến, 2 đường, 3 vùng, 8 Heikin Ashi, 9 nến rỗng; còn lại về nến. */
const CHART_TYPES: Readonly<Record<number, ChartType>> = { 0: "ohlc", 1: "candles", 2: "line", 3: "area", 8: "heikin-ashi", 9: "hollow" }

// ------------------------------------------------------------------ chuyển đổi

function utf8Bytes(value: string): number {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/** Tài liệu quá 512 KB, hoặc không tuần tự hoá được (vòng tham chiếu), thì phải bỏ `charts`. */
function exceedsLimit(document: ChartDocument): boolean {
  try {
    return utf8Bytes(JSON.stringify(document)) > MAX_STATE_BYTES
  } catch {
    return true
  }
}

function emptyConversion(charts?: unknown[]): TradingViewConversion {
  const document: ChartDocument = { iqline: { version: 1, drawings: [], indicators: [], chartType: "candles" } }
  if (charts) document.charts = charts
  return { document, convertedDrawings: 0, convertedIndicators: 0, skippedDrawings: 0, skippedIndicators: 0, skippedByType: {}, chartsDropped: false }
}

type Tally = Pick<TradingViewConversion, "skippedByType"> & { drawings: number; indicators: number }

function skip(tally: Tally, kind: "drawings" | "indicators", name: string): void {
  tally[kind] += 1
  tally.skippedByType[name] = (tally.skippedByType[name] ?? 0) + 1
}

function convert(charts: unknown[]): TradingViewConversion {
  const drawings: Drawing[] = []
  const indicators: ChartIndicatorInput[] = []
  const tally: Tally = { drawings: 0, indicators: 0, skippedByType: {} }
  let chartType: ChartType = "candles"
  let chartTypeFound = false
  let counter = 0

  charts.forEach((chart, chartIndex) => {
    if (!isRecord(chart) || !Array.isArray(chart.panes)) return
    // IQLine có một biểu đồ: chỉ biểu đồ đầu tiên được chuyển, nguồn của các biểu đồ sau được tính là bỏ qua.
    const primary = chartIndex === 0
    const panes = chart.panes.filter((pane): pane is UnknownRecord => isRecord(pane) && Array.isArray(pane.sources))
    const mainSource = panes.flatMap((pane) => (pane.sources as unknown[]).filter(isRecord)).find((source) => source.type === "MainSeries")
    const mainState = mainSource && isRecord(mainSource.state) ? mainSource.state : null
    const mainInterval = (mainState && text(mainState.interval)) ?? "D"
    if (primary && mainState && !chartTypeFound) {
      const style = finite(mainState.style)
      if (style !== null) chartType = CHART_TYPES[style] ?? "candles"
      chartTypeFound = true
    }

    for (const pane of panes) {
      const sources = (pane.sources as unknown[]).filter(isRecord)
      const hasMainSeries = sources.some((source) => source.type === "MainSeries")
      for (const source of sources) {
        const type = text(source.type)
        if (!type || type === "MainSeries") continue
        counter += 1
        if (type.startsWith("LineTool")) {
          const tool = DRAWING_TOOLS[type]
          // Hình trên ô chỉ báo dùng đơn vị của chỉ báo, không đặt lên ô giá được.
          if (!primary || !hasMainSeries || !tool) {
            skip(tally, "drawings", type)
            continue
          }
          const id = `tv-${text(source.id) ?? counter}`
          const drawing = convertDrawing(source, tool, mainInterval, id)
          if (drawing) drawings.push(drawing)
          else skip(tally, "drawings", type)
          continue
        }
        if (type !== "Study") continue
        const meta = studyMeta(source)
        if (meta && meta.is_hidden_study === true) continue
        if (!primary) {
          skip(tally, "indicators", studyLabel(source, meta))
          continue
        }
        const names = studyNames(meta)
        const rule = STUDY_RULES.find((candidate) => candidate.names.some((name) => names.includes(name)))
        if (!rule) {
          skip(tally, "indicators", studyLabel(source, meta))
          continue
        }
        const inputState = isRecord(source.state) ? source.state : null
        const indicator: ChartIndicatorInput = { key: `tv-${text(source.id) ?? counter}`, id: rule.id, params: studyParams(rule, source) }
        if (inputState?.visible === false || source.visible === false) indicator.hidden = true
        indicators.push(indicator)
      }
    }
  })

  const document: ChartDocument = { iqline: { version: 1, drawings, indicators, chartType }, charts }
  const chartsDropped = exceedsLimit(document)
  if (chartsDropped) delete document.charts
  return {
    document,
    convertedDrawings: drawings.length,
    convertedIndicators: indicators.length,
    skippedDrawings: tally.drawings,
    skippedIndicators: tally.indicators,
    skippedByType: tally.skippedByType,
    chartsDropped,
  }
}

/**
 * `fromTradingViewLayout(state)`: đọc hình vẽ và chỉ báo từ layout TradingView theo bảng ở §11.
 * Luôn trả về kết quả; layout không đọc được cho ra tài liệu rỗng. `charts` gốc được giữ nguyên (cùng tham chiếu) để quay
 * lại TradingView không mất dữ liệu, trừ khi cả tài liệu vượt 512 KB thì bỏ `charts` và `chartsDropped` là true.
 */
export function fromTradingViewLayout(state: unknown): TradingViewConversion {
  try {
    if (!isRecord(state) || !Array.isArray(state.charts)) return emptyConversion()
    return convert(state.charts)
  } catch {
    return emptyConversion()
  }
}
