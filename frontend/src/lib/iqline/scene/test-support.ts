/** Dữ liệu mẫu và bộ đọc lệnh vẽ cho test scene. Không dùng ngoài test. */
import { ICT_OFFSET, daysFromCivil } from "../core/calendar"
import type { Bar, ChartType, DrawCommand, Geometry, IndicatorPlot, Interval, PriceScaleMode, TimedBar, Viewport } from "../types"
import { SceneBuilder, type Pointer } from "./builder"
import { createChartData, createFrame, type ChartData, type ChartDataInput, type ChartFrame, type SceneIndicator, type ViewState } from "./model"
import type { PriceLevels } from "./colors"

export const ict = (year: number, month: number, day: number, hour = 0, minute = 0) => daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 - ICT_OFFSET

/** Dãy giá giả lập có xu hướng và biên độ khác nhau, xác định theo chỉ số. */
export function makeBars(count: number, start = 100): Bar[] {
  const bars: Bar[] = []
  let close = start
  for (let index = 0; index < count; index += 1) {
    const open = close
    const delta = Math.sin(index * 0.7) * 2 + Math.cos(index * 0.31) * 1.5
    close = Math.max(1, open + delta)
    bars.push({ open, high: Math.max(open, close) + 1 + (index % 3) * 0.3, low: Math.min(open, close) - 1 - (index % 4) * 0.2, close, volume: 1000 + ((index * 37) % 900) })
  }
  return bars
}

export function makeTimedBars(count: number, interval: Interval = "5"): TimedBar[] {
  const step = interval === "D" ? 86400 : Number(interval) * 60
  return makeBars(count).map((bar, index) => ({ ...bar, time: ict(2026, 11, 5, 9, 0) + index * step }))
}

export const GEOMETRY: Geometry = { width: 800, height: 600, dpr: 1, axisRight: 62, axisBottom: 22 }

export function series(key: string, values: (number | null)[], color: IndicatorPlot["series"][number]["color"] = "chart-1", extra: Partial<IndicatorPlot["series"][number]> = {}) {
  return { key, label: key.toUpperCase(), values, color, ...extra }
}

export function movingAverage(bars: readonly Bar[], period: number): (number | null)[] {
  return bars.map((_, index) => (index < period - 1 ? null : bars.slice(index - period + 1, index + 1).reduce((sum, bar) => sum + bar.close, 0) / period))
}

export function overlay(key: string, bars: readonly Bar[], period: number, color: IndicatorPlot["series"][number]["color"] = "chart-1", id = "ma"): SceneIndicator {
  return { key, id, name: `MA ${period}`, plot: { kind: "over", series: [series("ma", movingAverage(bars, period), color, { label: `MA ${period}` })] } }
}

export function marketInput(overrides: Partial<Extract<ChartDataInput, { mode: "market" }>> & { count?: number } = {}): ChartDataInput {
  const { count = 120, ...rest } = overrides
  return { mode: "market", chartType: "candles", bars: makeTimedBars(count), interval: "5", indicators: [], ...rest }
}

export function flashbackInput(overrides: Partial<Extract<ChartDataInput, { mode: "flashback" }>> = {}): ChartDataInput {
  return { mode: "flashback", chartType: "candles", bars: makeBars(70), warmup: 10, totalSlots: 90, indicators: [], ...overrides }
}

export type FrameOptions = Partial<Omit<ViewState, "viewport" | "geometry">> & { viewport?: Viewport; geometry?: Partial<Geometry>; priceScaleMode?: PriceScaleMode }

export function frameOf(data: ChartData, options: FrameOptions = {}): ChartFrame {
  const viewport = options.viewport ?? { from: -0.5, to: data.slots - 0.5 }
  return createFrame(data, { priceScaleMode: "linear", ...options, viewport, geometry: { ...GEOMETRY, ...options.geometry } })
}

export function build(input: ChartDataInput, options: FrameOptions = {}) {
  const data = createChartData(input)
  const frame = frameOf(data, options)
  const builder = new SceneBuilder()
  return {
    data,
    frame,
    base: () => builder.base(frame),
    scene: () => builder.data(frame),
    top: (pointer: Pointer | null) => builder.top(frame, pointer),
  }
}

export function ops(scene: readonly DrawCommand[], op: DrawCommand["op"]) {
  return scene.filter((command) => command.op === op)
}

export function tokens(scene: readonly DrawCommand[], op?: DrawCommand["op"]): string[] {
  return scene.filter((command) => (op ? command.op === op : "token" in command)).map((command) => ("token" in command ? command.token : ""))
}

/** Danh sách [x, y, w, h] của các lệnh `rects` theo token. */
export function rectsOf(scene: readonly DrawCommand[], token: string): number[][] {
  const out: number[][] = []
  for (const command of scene) {
    if (command.op !== "rects" || command.token !== token) continue
    for (let index = 0; index < command.count; index += 4) out.push(Array.from(command.data.subarray(index, index + 4)))
  }
  return out
}

export function texts(scene: readonly DrawCommand[]) {
  return scene.filter((command): command is Extract<DrawCommand, { op: "text" }> => command.op === "text")
}

/** Ảnh chụp có thể so sánh: mảng số được cắt theo `count`. */
export function snapshot(scene: readonly DrawCommand[]): unknown {
  return scene.map((command) => {
    if ("data" in command) return { ...command, data: Array.from(command.data.subarray(0, command.count)) }
    return command
  })
}

export type { ChartType, PriceLevels }

let cachedBars: TimedBar[] | null = null
/** Dữ liệu cố định dùng chung cho các test cần tham chiếu thời gian của nến. */
export function makeTimedBarsCache(): TimedBar[] {
  cachedBars ??= makeTimedBars(120)
  return cachedBars
}

/** Hai ngày giao dịch liên tiếp cộng một ngày sau đó, khung 5 phút, để thử vạch ngăn ngày. */
export function makeTimedBars2(): TimedBar[] {
  const bars: TimedBar[] = []
  const base = makeBars(150)
  let index = 0
  for (const day of [5, 6, 9]) {
    for (let slot = 0; slot < 50; slot += 1) {
      bars.push({ ...base[index], time: ict(2026, 11, day, 9, 0) + slot * 300 })
      index += 1
    }
  }
  return bars
}
