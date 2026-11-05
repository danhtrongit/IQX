/**
 * Giá trị tại một chỉ số cho crosshair và chú giải nổi (DOM). Thuần.
 *
 * Luật Flashback (docs/iqline-design.md §12): ô tương lai không có nến nên trả null, không bao giờ đọc được
 * giá trị ở đó; nến warmup đã bị cắt khỏi `ChartData` nên cũng không đọc được.
 */
import type { Bar, ColorToken } from "../types"
import type { ChartData } from "./model"

export type SeriesValue = {
  indicatorKey: string
  paneKey: string
  seriesKey: string
  label: string
  token: ColorToken
  value: number | null
}

export type IndexValues = {
  index: number
  /** Nến thật (không phải Heikin Ashi). */
  bar: Bar
  previousClose: number | null
  change: number | null
  changePct: number | null
  /** Unix giây của nến (`market`); null ở `flashback`, nơi không có thời gian thật. */
  time: number | null
  series: SeriesValue[]
}

/** Null khi `index` ngoài các nến thật (ô tương lai, trước nến đầu) hoặc không phải số. */
export function valuesAtIndex(data: ChartData, index: number): IndexValues | null {
  if (!Number.isFinite(index)) return null
  const at = Math.round(index)
  if (at < 0 || at >= data.count) return null
  const bar = data.raw[at]
  const previousClose = at > 0 ? data.raw[at - 1].close : null
  const change = previousClose === null ? null : bar.close - previousClose
  const series: SeriesValue[] = []
  for (const indicator of data.indicators) {
    for (const line of indicator.plot.series) {
      series.push({ indicatorKey: indicator.key, paneKey: indicator.paneKey, seriesKey: line.key, label: line.label, token: line.color, value: line.values[at] ?? null })
    }
    const histogram = indicator.plot.histogram
    if (histogram) {
      const value = histogram.values[at] ?? null
      series.push({
        indicatorKey: indicator.key,
        paneKey: indicator.paneKey,
        seriesKey: "histogram",
        label: indicator.name,
        token: value !== null && value < 0 ? histogram.downToken : histogram.upToken,
        value,
      })
    }
  }
  return {
    index: at,
    bar,
    previousClose,
    change,
    changePct: change !== null && previousClose ? (change / previousClose) * 100 : null,
    time: data.timeScale.kind === "market" ? data.timeScale.timeOfIndex(at) : null,
    series,
  }
}
