import { describe, expect, it } from "vitest"
import type { Bar, IndicatorPlot } from "../types"
import { computeIndicator, createIndicatorCache, DEFAULT_PALETTE, indicatorTailMemory, listIndicators } from "./index"
import { contextFor, GOLDEN, goldenBars, inputOf, isClose } from "./test-support"

const ALL = goldenBars()
const TOLERANCE = 1e-9

/** Hai kết quả cùng khoá chuỗi, cùng chỗ null, và số lệch nhau không quá sai số tính tròn. */
function expectSamePlot(actual: IndicatorPlot | null, expected: IndicatorPlot | null, label: string): void {
  expect(actual, label).not.toBeNull()
  expect(expected, label).not.toBeNull()
  if (!actual || !expected) return
  expect(actual.kind, label).toBe(expected.kind)
  expect(actual.series.map((series) => series.key), label).toEqual(expected.series.map((series) => series.key))
  const pairs: [string, readonly (number | null)[], readonly (number | null)[]][] = actual.series.map((series, index) => [series.key, series.values, expected.series[index].values])
  if (actual.histogram || expected.histogram) pairs.push(["histogram", actual.histogram?.values ?? [], expected.histogram?.values ?? []])
  for (const [key, a, b] of pairs) {
    expect(a.length, `${label}.${key} độ dài`).toBe(b.length)
    for (let index = 0; index < b.length; index += 1) {
      const x = a[index]
      const y = b[index]
      if (x === null || y === null) {
        expect(x, `${label}.${key}[${index}]`).toBe(y)
      } else if (!isClose(x, y, TOLERANCE)) {
        expect(x, `${label}.${key}[${index}]`).toBeCloseTo(y, 9)
      }
    }
  }
  expect(actual.levels, label).toEqual(expected.levels)
  expect(actual.levelBand, label).toEqual(expected.levelBand)
  expect(actual.cross, label).toEqual(expected.cross)
  expect(actual.range, label).toEqual(expected.range)
  expect(actual.zero, label).toEqual(expected.zero)
}

/** Nến cuối đổi giá: đóng cửa và biên độ đổi, khối lượng đổi theo. */
function revise(bars: readonly Bar[], factor: number): Bar[] {
  const last = bars[bars.length - 1]
  const close = last.close * factor
  return [...bars.slice(0, -1), { open: last.open, high: Math.max(last.high, close), low: Math.min(last.low, close), close, volume: Math.round(last.volume * (1 + (factor - 1) * 10)) }]
}

describe("ghi nhớ theo (id, tham số, độ dài dữ liệu)", () => {
  it("cùng dữ liệu: trả về đúng đối tượng cũ, không tính lại (zoom, kéo, vẽ lại)", () => {
    const cache = createIndicatorCache()
    const input = { id: "rsi", params: { period: 14 } }
    const first = cache.get(input, ALL)
    expect(cache.get(input, ALL)).toBe(first)
    // mảng mới có cùng nội dung (dữ liệu dựng lại sau mỗi lần render) vẫn trúng
    expect(cache.get(input, [...ALL])).toBe(first)
    // thứ tự khoá tham số và tham số mặc định điền thiếu không đổi khoá
    expect(cache.get({ id: "rsi", params: { period: 14, lower: 30, upper: 70 } }, ALL)).toBe(first)
    expect(cache.get({ id: "rsi", params: {} }, ALL)).toBe(first)
    expect(cache.stats).toEqual({ hits: 4, tails: 0, fulls: 1 })
  })

  it("tham số khác hoặc bảng màu khác là mục khác", () => {
    const cache = createIndicatorCache()
    const a = cache.get({ id: "ma", params: { period: 20 } }, ALL)
    const b = cache.get({ id: "ma", params: { period: 50 } }, ALL)
    expect(b).not.toBe(a)
    const c = cache.get({ id: "ma", params: { period: 20 } }, ALL, ["chart-2"])
    expect(c).not.toBe(a)
    expect(c?.series[0].color).toBe("chart-2")
    expect(a?.series[0].color).toBe(DEFAULT_PALETTE[0])
    expect(cache.stats.fulls).toBe(3)
  })

  it("id lạ hoặc tham số sai cho null, không ném lỗi và không tính", () => {
    const cache = createIndicatorCache()
    expect(cache.get({ id: "khong-co", params: {} }, ALL)).toBeNull()
    expect(cache.get({ id: "ma", params: { period: 0 } }, ALL)).toBeNull()
    expect(cache.get({ id: "macd", params: { fast: 30, slow: 20 } }, ALL)).toBeNull()
    expect(cache.stats).toEqual({ hits: 0, tails: 0, fulls: 0 })
  })

  it("dữ liệu rỗng cho chuỗi rỗng", () => {
    const cache = createIndicatorCache()
    const plot = cache.get({ id: "ma", params: {} }, [])
    expect(plot?.series[0].values).toEqual([])
  })

  it("giới hạn số mục: mục dùng lâu nhất bị bỏ và phải tính lại", () => {
    const cache = createIndicatorCache({ maxEntries: 2 })
    const a = { id: "ma", params: { period: 10 } }
    const b = { id: "ma", params: { period: 20 } }
    const c = { id: "ma", params: { period: 30 } }
    cache.get(a, ALL)
    cache.get(b, ALL)
    cache.get(a, ALL) // a mới dùng, b cũ nhất
    cache.get(c, ALL) // đẩy b ra
    expect(cache.stats.fulls).toBe(3)
    cache.get(a, ALL)
    expect(cache.stats.fulls).toBe(3)
    cache.get(b, ALL)
    expect(cache.stats.fulls).toBe(4)
  })

  it("clear() xoá hết mục", () => {
    const cache = createIndicatorCache()
    const input = { id: "ma", params: {} }
    cache.get(input, ALL)
    cache.clear()
    cache.get(input, ALL)
    expect(cache.stats.fulls).toBe(2)
  })
})

describe("nến cuối đổi giá cho kết quả đúng", () => {
  it("MA 5 tính tay: nến cuối 30 đổi thành 40 thì MA cuối từ 28 thành 30, các điểm trước giữ nguyên", () => {
    const bars = Array.from({ length: 30 }, (_, index): Bar => ({ open: index + 1, high: index + 1, low: index + 1, close: index + 1, volume: 100 }))
    const cache = createIndicatorCache()
    const input = { id: "ma", params: { period: 5 } }
    const before = cache.get(input, bars)!
    expect(before.series[0].values.at(-1)).toBe(28)
    const edited = [...bars.slice(0, -1), { open: 30, high: 40, low: 30, close: 40, volume: 100 }]
    const after = cache.get(input, edited)!
    expect(after.series[0].values.at(-1)).toBe(30)
    expect(after.series[0].values.slice(0, -1)).toEqual(before.series[0].values.slice(0, -1))
    expect(after).not.toBe(before)
    expect(cache.stats).toEqual({ hits: 0, tails: 1, fulls: 1 })
    // kết quả cũ không bị sửa tại chỗ: người đang giữ nó (khung hình trước) không thấy đổi
    expect(before.series[0].values.at(-1)).toBe(28)
    // đổi lại giá cũ cho đúng giá trị cũ
    expect(cache.get(input, bars)!.series[0].values.at(-1)).toBe(28)
  })

  it("EMA 5 tính tay: nến cuối đổi giá thì tính lại cả chuỗi và ra đúng", () => {
    const bars = Array.from({ length: 12 }, (_, index): Bar => ({ open: 10, high: 10 + index, low: 9, close: 10 + index, volume: 100 }))
    const cache = createIndicatorCache()
    const input = { id: "ema", params: { period: 5 } }
    cache.get(input, bars)
    const edited = [...bars.slice(0, -1), { ...bars[11], close: 100, high: 100 }]
    const after = cache.get(input, edited)!
    expect(cache.stats).toEqual({ hits: 0, tails: 0, fulls: 2 })
    expectSamePlot(after, computeIndicator(input, edited), "ema")
    // EMA(5) hệ số 2/6: giá trị trước nến cuối + (100 - trước) / 3
    const previous = computeIndicator(input, bars.slice(0, 11))!.series[0].values.at(-1)!
    expect(after.series[0].values.at(-1)).toBeCloseTo(previous + (100 - previous) / 3, 12)
  })

  it("dữ liệu một nến và hai nến: nến cuối đổi vẫn đúng", () => {
    const cache = createIndicatorCache()
    const input = { id: "ma", params: {} }
    for (const length of [1, 2, 3]) {
      const bars = goldenBars(length)
      cache.get(input, bars)
      const edited = revise(bars, 1.04)
      expectSamePlot(cache.get(input, edited), computeIndicator(input, edited), `length ${length}`)
      expect(cache.get(input, bars)).not.toBeNull()
    }
  })

  it("nến cuối trở thành nến phẳng (kịch trần): Stochastic, CMF, Williams %R vẫn đúng", () => {
    const cache = createIndicatorCache()
    const base = ALL.slice(0, 150)
    const last = base[149]
    const flat = [...base.slice(0, -1), { open: last.close, high: last.close, low: last.close, close: last.close, volume: last.volume }]
    for (const id of ["stochastic", "cmf", "williams_r", "mfi", "cci"]) {
      const input = { id, params: {} }
      cache.get(input, base)
      expectSamePlot(cache.get(input, flat), computeIndicator(input, flat), id)
    }
  })

  it("mọi chỉ báo với mọi bộ tham số mẫu: đổi nến cuối nhiều lần, rồi nối thêm nến từng cái, luôn bằng tính lại từ đầu", () => {
    for (const testCase of GOLDEN.cases) {
      const input = inputOf(testCase)
      const cache = createIndicatorCache()
      const start = 150
      expectSamePlot(cache.get(input, ALL.slice(0, start)), computeIndicator(input, ALL.slice(0, start)), `${testCase.name} đầu`)
      // 1. nến cuối đang chạy: giá đổi liên tục, độ dài giữ nguyên
      for (const factor of [1.01, 0.97, 1.05, 1, 0.93]) {
        const bars = revise(ALL.slice(0, start), factor)
        expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), `${testCase.name} nến cuối x${factor}`)
      }
      // 2. nến mới nối thêm, mỗi lần một nến, nến cuối cũ có thể đã đổi
      for (let length = start + 1; length <= start + 25; length += 1) {
        const bars = ALL.slice(0, length)
        expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), `${testCase.name} nối tới ${length}`)
        if (length % 5 === 0) {
          const edited = revise(bars, 1.02)
          expectSamePlot(cache.get(input, edited), computeIndicator(input, edited), `${testCase.name} đổi nến cuối ở ${length}`)
        }
      }
      // 3. nối nhiều nến một lần
      const jump = ALL.slice(0, start + 60)
      expectSamePlot(cache.get(input, jump), computeIndicator(input, jump), `${testCase.name} nhảy +35`)
    }
  })

  it("lỗi tính tròn không cộng dồn qua hàng trăm lần cập nhật đuôi", () => {
    const cache = createIndicatorCache()
    const input = { id: "bollinger", params: { period: 20, k: 2 } }
    let bars = ALL.slice(0, 40)
    cache.get(input, bars)
    for (let step = 0; step < 200; step += 1) {
      const source = ALL[(40 + step) % ALL.length]
      bars = [...bars.slice(0, -1), { ...bars[bars.length - 1], close: bars[bars.length - 1].close * (1 + ((step % 7) - 3) / 400) }, source]
      cache.get(input, bars)
    }
    expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), "bollinger sau 200 lần")
    expect(cache.stats.tails).toBeGreaterThan(190)
  })
})

describe("khi nào tính phần đuôi, khi nào tính lại cả chuỗi", () => {
  it("công thức cửa sổ hữu hạn tính đuôi; công thức đệ quy và công thức theo thời gian tính lại cả chuỗi", () => {
    const windowed = ["volume", "ma", "bollinger", "ma_cross", "donchian", "stochastic", "cci", "roc", "williams_r", "mfi", "cmf", "bb_width", "relative_volume", "ichimoku", "wma", "hma", "vwma", "envelope", "aroon", "ultimate_oscillator", "awesome_oscillator", "momentum", "std_dev", "volatility_ohlc"]
    const recursive = ["ema", "rsi", "macd", "dmi", "obv", "atr", "atr_percent", "adx", "keltner", "psar", "supertrend", "trix", "accum_dist"]
    // Cần thời gian nến: kỳ có thể dài tuỳ ý nên không bao giờ tính đuôi.
    const timed = ["vwap", "pivot_points"]
    const context = contextFor(200)
    for (const id of [...windowed, ...recursive, ...timed]) {
      const cache = createIndicatorCache()
      const input = { id, params: {} }
      cache.get(input, ALL.slice(0, 200), DEFAULT_PALETTE, context)
      cache.get(input, revise(ALL.slice(0, 200), 1.03), DEFAULT_PALETTE, context)
      expect(cache.stats, id).toEqual(windowed.includes(id) ? { hits: 0, tails: 1, fulls: 1 } : { hits: 0, tails: 0, fulls: 2 })
    }
    expect(windowed.length + recursive.length + timed.length).toBe(listIndicators().length - 1)
  })

  it("số nến phía trước theo từng công thức", () => {
    expect(indicatorTailMemory("ma", { period: 20 })).toBe(19)
    expect(indicatorTailMemory("donchian", { period: 20 })).toBe(20)
    expect(indicatorTailMemory("volume", { lookback: 20, mult: 1 })).toBe(20)
    expect(indicatorTailMemory("stochastic", { k: 14, d: 3, smooth: 3 })).toBe(17)
    expect(indicatorTailMemory("ma_cross", { fast: 20, slow: 50 })).toBe(49)
    expect(indicatorTailMemory("ema", { period: 20 })).toBeNull()
    expect(indicatorTailMemory("khong-co", {})).toBeNull()
  })

  it("dữ liệu ngắn hơn bộ nhớ của công thức thì tính lại cả chuỗi và vẫn đúng", () => {
    const cache = createIndicatorCache()
    const input = { id: "ma", params: { period: 200 } }
    cache.get(input, ALL.slice(0, 100))
    const bars = revise(ALL.slice(0, 100), 1.05)
    expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), "ma 200")
    expect(cache.stats.tails).toBe(0)
  })
})

describe("dữ liệu đổi không theo kiểu nối đuôi thì tính lại cả chuỗi", () => {
  it("nạp thêm lịch sử về phía trước (nến đầu đổi)", () => {
    const cache = createIndicatorCache()
    const input = { id: "ma", params: { period: 10 } }
    cache.get(input, ALL.slice(60, 200))
    const longer = ALL.slice(40, 200)
    expectSamePlot(cache.get(input, longer), computeIndicator(input, longer), "prepend")
    expect(cache.stats).toEqual({ hits: 0, tails: 0, fulls: 2 })
  })

  it("dữ liệu ngắn lại", () => {
    const cache = createIndicatorCache()
    const input = { id: "ma", params: { period: 10 } }
    cache.get(input, ALL.slice(0, 200))
    expectSamePlot(cache.get(input, ALL.slice(0, 150)), computeIndicator(input, ALL.slice(0, 150)), "shrink")
    expect(cache.stats).toEqual({ hits: 0, tails: 0, fulls: 2 })
  })

  it("đổi mã: cùng độ dài nhưng toàn bộ nến khác", () => {
    const cache = createIndicatorCache()
    const input = { id: "rsi", params: {} }
    const other = ALL.slice(0, 200).map((item) => ({ ...item, open: item.open * 2, high: item.high * 2, low: item.low * 2, close: item.close * 2 }))
    cache.get(input, ALL.slice(0, 200))
    expectSamePlot(cache.get(input, other), computeIndicator(input, other), "đổi mã")
    expect(cache.stats.fulls).toBe(2)
  })

  it("một nến ở giữa bị sửa (nến áp chót hoặc nến giữa): không dùng lại đuôi sai", () => {
    for (const edit of [148, 75]) {
      const cache = createIndicatorCache()
      const input = { id: "ma", params: { period: 10 } }
      const base = ALL.slice(0, 150)
      cache.get(input, base)
      const changed = base.map((item, index) => (index === edit ? { ...item, close: item.close * 1.2, high: item.high * 1.2 } : item))
      expectSamePlot(cache.get(input, changed), computeIndicator(input, changed), `sửa nến ${edit}`)
      expect(cache.stats.tails).toBe(0)
    }
  })
})
