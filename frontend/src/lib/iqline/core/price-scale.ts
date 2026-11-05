/**
 * Thang giá (docs/iqline-design.md §7), luật Flashback v2.3 §3 áp dụng cho cả `market`:
 * trục theo nến đang hiện, chừa 6% mỗi đầu, đường chỉ báo không kéo giãn trục, đường ngoài khung có nhãn
 * ở mép phải. Tuyến tính, log và phần trăm đều là phép đổi toạ độ; hình vẽ vẫn neo theo giá thật.
 */
import type { PriceScaleMode } from "../types"

/** Biên trên và dưới của trục giá (v2.3 §3): chừa 6% khoảng giá ở mỗi đầu. */
export const PRICE_PADDING = 0.06

export type PriceRange = { low: number; high: number }

/**
 * Trục giá theo giá cao nhất và thấp nhất của các nến từ `first` đến `last` (gồm cả hai); đường chỉ báo
 * không kéo giãn trục. Nến vượt quá `bars.length` bị bỏ qua.
 */
export function priceRange(bars: readonly { high: number; low: number }[], last: number, first = 0): PriceRange {
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let index = Math.max(0, first); index <= last && index < bars.length; index += 1) {
    low = Math.min(low, bars[index].low)
    high = Math.max(high, bars[index].high)
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { low: 0, high: 1 }
  const padding = (high - low) * PRICE_PADDING || high * 0.01 || 1
  return { low: low - padding, high: high + padding }
}

/** Biên log: chừa 6% theo tỷ lệ, không để giá thấp xuống dưới hoặc bằng 0. */
export function logRange(bars: readonly { high: number; low: number }[], last: number, first = 0): PriceRange {
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (let index = Math.max(0, first); index <= last && index < bars.length; index += 1) {
    if (bars[index].low > 0) low = Math.min(low, bars[index].low)
    high = Math.max(high, bars[index].high)
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= 0) return { low: 1, high: 10 }
  const span = Math.log(high) - Math.log(low)
  const padding = span * PRICE_PADDING || 0.01
  return { low: Math.exp(Math.log(low) - padding), high: Math.exp(Math.log(high) + padding) }
}

/**
 * Chừa 6% ở mỗi đầu cho một dải đã biết cao và thấp nhất. Tuyến tính và phần trăm chừa theo giá, log chừa theo
 * tỷ lệ (không để giá thấp xuống dưới 0). Dải suy biến (cao bằng thấp) chừa 1% giá, tối thiểu 1.
 */
export function padPriceRange(low: number, high: number, mode: PriceScaleMode): PriceRange {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { low: 0, high: 1 }
  if (mode === "log" && low > 0) {
    const padding = (Math.log(high) - Math.log(low)) * PRICE_PADDING || 0.01
    return { low: Math.exp(Math.log(low) - padding), high: Math.exp(Math.log(high) + padding) }
  }
  const padding = (high - low) * PRICE_PADDING || high * 0.01 || 1
  return { low: low - padding, high: high + padding }
}

export type PriceScale = {
  mode: PriceScaleMode
  low: number
  high: number
  /** Giá gốc của chế độ phần trăm (đóng cửa nến đầu tiên đang hiện); 0 ở hai chế độ kia. */
  base: number
  /** Toạ độ CSS pixel của khung. */
  top: number
  height: number
  yOf(price: number): number
  priceOf(y: number): number
  /** Giá trị trên trục: giá, hoặc phần trăm so với `base`. */
  axisValue(price: number): number
  /** Ngược lại của `axisValue`. */
  priceOfAxis(value: number): number
}

/** Phạm vi giá bắt buộc dương cho log. */
const MIN_LOG = 1e-9

export function createPriceScale(input: { mode: PriceScaleMode; range: PriceRange; base?: number; top: number; height: number }): PriceScale {
  const { mode, top, height } = input
  const base = mode === "percent" ? input.base || 1 : 0
  let { low, high } = input.range
  if (mode === "log") {
    low = Math.max(low, MIN_LOG)
    high = Math.max(high, low * 1.0001)
  } else if (!(high > low)) {
    high = low + 1
  }
  if (mode === "log") {
    const logLow = Math.log(low)
    const logHigh = Math.log(high)
    const k = height / (logHigh - logLow)
    return {
      mode,
      low,
      high,
      base,
      top,
      height,
      yOf: (price) => top + (logHigh - Math.log(Math.max(price, MIN_LOG))) * k,
      priceOf: (y) => Math.exp(logHigh - (y - top) / k),
      axisValue: (price) => price,
      priceOfAxis: (value) => value,
    }
  }
  const k = height / (high - low)
  return {
    mode,
    low,
    high,
    base,
    top,
    height,
    yOf: (price) => top + (high - price) * k,
    priceOf: (y) => high - (y - top) / k,
    axisValue: mode === "percent" ? (price) => (price / base - 1) * 100 : (price) => price,
    priceOfAxis: mode === "percent" ? (value) => base * (1 + value / 100) : (value) => value,
  }
}

/** Phóng to hoặc thu nhỏ trục giá quanh một điểm (kéo tay trên trục giá); `fraction` là vị trí 0 (đỉnh) đến 1 (đáy). */
export function zoomPriceRange(range: PriceRange, factor: number, fraction: number): PriceRange {
  const span = range.high - range.low
  const next = span * factor
  const anchor = range.high - fraction * span
  return { low: anchor - (1 - fraction) * next, high: anchor + fraction * next }
}

/** Kéo trục giá theo số giá (dương là xem phía giá cao hơn). */
export function shiftPriceRange(range: PriceRange, delta: number): PriceRange {
  return { low: range.low + delta, high: range.high + delta }
}

export type OffscaleLabel<C = string> = { key: string; text: string; color: C; side: "above" | "below"; y: number }

/**
 * Nhãn mép phải cho đường dạng MA nằm ngoài khung ở phiên đang mở (v2.3 §3): "{tên} {giá trị} ↑/↓".
 * Nhãn phía trên xếp từ đỉnh khung xuống, phía dưới xếp từ đáy lên, cách nhau một dòng nên không đè nhau.
 */
export function offscaleLabels<C = string>(
  lines: readonly { key: string; name: string; value: number | null; color: C }[],
  range: PriceRange,
  pane: { top: number; height: number },
  format: (value: number) => string,
  rowHeight = 16,
): OffscaleLabel<C>[] {
  const labels: OffscaleLabel<C>[] = []
  let above = 0
  let below = 0
  for (const line of lines) {
    if (line.value == null || !Number.isFinite(line.value)) continue
    if (line.value > range.high) {
      labels.push({ key: line.key, text: `${line.name} ${format(line.value)} ↑`, color: line.color, side: "above", y: pane.top + rowHeight * (above + 0.5) })
      above += 1
    } else if (line.value < range.low) {
      labels.push({ key: line.key, text: `${line.name} ${format(line.value)} ↓`, color: line.color, side: "below", y: pane.top + pane.height - rowHeight * (below + 0.5) })
      below += 1
    }
  }
  return labels
}
