/**
 * Ghi nhớ kết quả chỉ báo (docs/iqline-design.md §9, "Cần sửa khi chuyển").
 *
 * Khoá ghi nhớ là `(id, tham số, màu)`, và mỗi mục nhớ độ dài dữ liệu cùng chữ ký của vài nến, nên:
 *
 * - zoom, kéo, đổi crosshair (cùng dữ liệu): trả về đúng đối tượng cũ, không tính lại;
 * - nến cuối đổi giá hoặc có nến mới nối thêm: chỉ tính lại phần đuôi nếu chỉ báo khai báo `tailMemory` (công thức
 *   cửa sổ hữu hạn như SMA, Bollinger, Stochastic), còn lại (EMA, RSI, MACD, DMI, ATR, ADX, Keltner, OBV, SAR... phụ
 *   thuộc cả chuỗi) thì tính lại cả chuỗi;
 * - độ dài giảm, hoặc nến đầu, nến giữa, nến áp chót khác chữ ký cũ (nạp thêm lịch sử về phía trước, đổi mã hay khung):
 *   tính lại cả chuỗi.
 *
 * Hợp đồng với người gọi: ngoài nến cuối, chỉ có thể thêm nến ở cuối hoặc thay cả bộ dữ liệu. Ba nến mẫu chỉ là lưới
 * an toàn, không thay được việc gọi `clear()` khi đổi mã hoặc khung. Cache mỗi biểu đồ một cái, không dùng chung.
 */
import type { Bar, ChartIndicatorInput, ColorToken, IndicatorParams, IndicatorPlot, IndicatorSeries } from "../types"
import { computeVolumeProfile, DEFAULT_PROFILE_ROWS, type ProfileRange } from "./volume-profile"
import { getIndicator, indicatorTailMemory, paramsKey, resolveIndicatorParams, validateIndicatorParams } from "./registry"

/** Thứ tự màu chỉ báo theo `DESIGN.md`: `chart-1, chart-6, chart-8, chart-2, chart-5`. */
export const DEFAULT_PALETTE: readonly ColorToken[] = ["chart-1", "chart-6", "chart-8", "chart-2", "chart-5"]

export type IndicatorCacheStats = {
  /** Trả về kết quả cũ, không tính gì. */
  hits: number
  /** Chỉ tính lại phần đuôi. */
  tails: number
  /** Tính lại cả chuỗi (lần đầu, hoặc công thức không cho tính đuôi, hoặc dữ liệu đổi). */
  fulls: number
}

export type IndicatorCache = {
  /** Kết quả của một chỉ báo; `null` nếu id lạ hoặc tham số sai (dùng `validateIndicatorParams` để biết lý do). */
  get(input: Pick<ChartIndicatorInput, "id" | "params">, bars: readonly Bar[], palette?: readonly ColorToken[]): IndicatorPlot | null
  /** Volume Profile cho các nến trong viewport; nhớ lần tính gần nhất. */
  profile(bars: readonly Bar[], range: ProfileRange, rows?: number): IndicatorPlot
  clear(): void
  readonly stats: IndicatorCacheStats
}

type Signature = readonly [number, number, number, number, number]
type Probes = { first: Signature; middle: Signature; middleIndex: number; beforeLast: Signature | null; last: Signature }
type Cached = { length: number; probes: Probes; plot: IndicatorPlot }

const signatureOf = (bar: Bar): Signature => [bar.open, bar.high, bar.low, bar.close, bar.volume]
const sameSignature = (a: Signature, b: Signature): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4]
const matches = (bar: Bar | undefined, signature: Signature | null): boolean => bar !== undefined && signature !== null && sameSignature(signatureOf(bar), signature)

function probesOf(bars: readonly Bar[]): Probes {
  const length = bars.length
  const middleIndex = length >> 1
  return {
    first: signatureOf(bars[0]),
    middle: signatureOf(bars[middleIndex]),
    middleIndex,
    beforeLast: length >= 2 ? signatureOf(bars[length - 2]) : null,
    last: signatureOf(bars[length - 1]),
  }
}

/** Phần đã biết của dữ liệu cũ (mọi nến trừ nến cuối cũ) còn nguyên? */
function prefixUnchanged(bars: readonly Bar[], cached: Cached): boolean {
  const { probes, length } = cached
  if (bars.length < length) return false
  // Dữ liệu một nến: nến đầu cũng là nến cuối, được phép đổi.
  if (length > 1 && !matches(bars[0], probes.first)) return false
  // Nến giữa của dữ liệu cũ; nếu nó chính là nến cuối cũ thì nến đó được phép đổi nên bỏ qua.
  if (probes.middleIndex < length - 1 && !matches(bars[probes.middleIndex], probes.middle)) return false
  return length < 2 || matches(bars[length - 2], probes.beforeLast)
}

function mergeValues(previous: readonly (number | null)[], fresh: readonly (number | null)[], from: number, start: number): (number | null)[] {
  const out = previous.slice(0, from)
  for (let index = from - start; index < fresh.length; index += 1) out.push(fresh[index])
  return out
}

/**
 * Ghép phần đuôi vừa tính vào kết quả cũ. `from` là chỉ số nến đầu tiên có thể đã đổi, `start` là chỉ số nến đầu của
 * lát cắt đã tính. Trả về `null` nếu hai kết quả không cùng hình dạng (người gọi sẽ tính lại cả chuỗi).
 */
function splice(previous: IndicatorPlot, fresh: IndicatorPlot, from: number, start: number, length: number): IndicatorPlot | null {
  if (fresh.markers || previous.markers || fresh.profile) return null
  if (previous.series.length !== fresh.series.length || !previous.histogram !== !fresh.histogram) return null
  const series: IndicatorSeries[] = []
  for (let index = 0; index < fresh.series.length; index += 1) {
    const before = previous.series[index]
    const after = fresh.series[index]
    if (before.key !== after.key || before.values.length < from || after.values.length !== length - start) return null
    series.push({ ...after, values: mergeValues(before.values, after.values, from, start) })
  }
  const histogram = fresh.histogram && previous.histogram ? { ...fresh.histogram, values: mergeValues(previous.histogram.values, fresh.histogram.values, from, start) } : undefined
  if (histogram && fresh.histogram && fresh.histogram.values.length !== length - start) return null
  return { ...fresh, series, ...(histogram ? { histogram } : {}) }
}

export function createIndicatorCache(options: { maxEntries?: number } = {}): IndicatorCache {
  const maxEntries = Math.max(1, options.maxEntries ?? 64)
  const entries = new Map<string, Cached>()
  const stats: IndicatorCacheStats = { hits: 0, tails: 0, fulls: 0 }
  let profileMemo: { key: string; plot: IndicatorPlot } | null = null

  function remember(key: string, cached: Cached): void {
    entries.delete(key)
    entries.set(key, cached)
    if (entries.size > maxEntries) {
      const oldest = entries.keys().next()
      if (!oldest.done) entries.delete(oldest.value)
    }
  }

  function computeTail(id: string, params: IndicatorParams, palette: readonly ColorToken[], bars: readonly Bar[], cached: Cached): IndicatorPlot | null {
    const definition = getIndicator(id)
    const memory = indicatorTailMemory(id, params)
    if (!definition || memory === null) return null
    const from = cached.length - 1
    const start = Math.max(0, from - memory)
    // Lát cắt bắt đầu từ nến đầu thì tính cả chuỗi cũng chỉ vậy.
    if (start === 0) return null
    const fresh = definition.compute(bars.slice(start), params, palette)
    return splice(cached.plot, fresh, from, start, bars.length)
  }

  return {
    get(input, bars, palette = DEFAULT_PALETTE) {
      const definition = getIndicator(input.id)
      if (!definition) return null
      const params = resolveIndicatorParams(input.id, input.params)
      if (!params) return null
      const key = `${paramsKey(input.id, params)}|${palette.join(",")}`
      const cached = entries.get(key)
      if (!cached && validateIndicatorParams(input.id, input.params)) return null
      if (bars.length === 0) return definition.compute(bars, params, palette)

      if (cached && prefixUnchanged(bars, cached)) {
        if (bars.length === cached.length && matches(bars[bars.length - 1], cached.probes.last)) {
          stats.hits += 1
          remember(key, cached)
          return cached.plot
        }
        const tail = computeTail(input.id, params, palette, bars, cached)
        if (tail) {
          stats.tails += 1
          remember(key, { length: bars.length, probes: probesOf(bars), plot: tail })
          return tail
        }
      }
      stats.fulls += 1
      const plot = definition.compute(bars, params, palette)
      remember(key, { length: bars.length, probes: probesOf(bars), plot })
      return plot
    },

    profile(bars, range, rows = DEFAULT_PROFILE_ROWS) {
      const length = bars.length
      const key = length ? `${length}|${rows}|${Math.ceil(range.from)}|${Math.floor(range.to)}|${signatureOf(bars[0]).join(",")}|${signatureOf(bars[length - 1]).join(",")}` : "empty"
      if (profileMemo?.key === key) return profileMemo.plot
      const plot = computeVolumeProfile(bars, range, rows)
      profileMemo = { key, plot }
      return plot
    },

    clear() {
      entries.clear()
      profileMemo = null
    },

    get stats() {
      return { ...stats }
    },
  }
}
