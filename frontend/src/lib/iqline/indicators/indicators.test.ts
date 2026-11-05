import { describe, expect, it } from "vitest"
import type { Bar, ColorToken, IndicatorPlot } from "../types"
import { atr } from "./legacy-series"
import { cmf, columnsOf, ema, obv, rsi, slidingExtreme, sma, volumeThreshold } from "./series"
import { computeIndicator, listIndicators } from "./index"
import { GOLDEN, goldenBars, isClose } from "./test-support"

const BARS = goldenBars()
const PROFILE_ID = "volume_profile"
const formulaIndicators = () => listIndicators().filter((definition) => definition.id !== PROFILE_ID)
const bar = (open: number, high: number, low: number, close: number, volume: number): Bar => ({ open, high, low, close, volume })

function plotOf(id: string, params: Record<string, number> = {}, palette?: readonly ColorToken[], bars: readonly Bar[] = BARS): IndicatorPlot {
  const plot = computeIndicator({ id, params }, bars, palette)
  if (!plot) throw new Error(`Không tính được ${id}`)
  return plot
}
const seriesOf = (plot: IndicatorPlot, key: string) => {
  const found = plot.series.find((series) => series.key === key)
  if (!found) throw new Error(`Thiếu chuỗi ${key}`)
  return found
}

/** Bộ số giả ngẫu nhiên cố định cho test so với cách tính ngây thơ. */
function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe("công thức cơ bản, tính tay", () => {
  it("SMA và EMA (khởi tạo bằng SMA của N giá trị đầu)", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
    expect(ema([2, 4, 6, 8], 2)[1]).toBe(3)
    expect(ema([2, 4, 6, 8], 2)[2]).toBeCloseTo(5, 12)
  })

  it("RSI Wilder: chuỗi chỉ tăng là 100, chuỗi tăng giảm xen kẽ có giá trị đã tính tay", () => {
    expect(rsi(Array.from({ length: 20 }, (_, index) => index + 1), 14).slice(14)).toEqual([100, 100, 100, 100, 100, 100])
    const values = rsi([10, 11, 10, 11, 10], 2)
    expect(values[0]).toBeNull()
    expect(values[1]).toBeNull()
    expect(values[2]).toBeCloseTo(50, 12)
    expect(values[3]).toBeCloseTo(75, 12)
    expect(values[4]).toBeCloseTo(37.5, 12)
  })

  it("Donchian 5 trên nến dài: biên trên tại nến i là cao nhất của i-5..i-1", () => {
    const upper = seriesOf(plotOf("donchian", { period: 5 }), "upper").values
    for (let index = 5; index < 40; index += 1) expect(upper[index]).toBe(Math.max(...BARS.slice(index - 5, index).map((item) => item.high)))
    expect(upper[4]).toBeNull()
  })

  it("Bollinger trên chuỗi hằng: cả ba đường bằng nhau", () => {
    const bars = Array.from({ length: 30 }, () => bar(5, 5, 5, 5, 10))
    const plot = plotOf("bollinger", { period: 10, k: 2 }, undefined, bars)
    for (const key of ["upper", "lower", "middle"]) expect(seriesOf(plot, key).values.slice(9).every((value) => value === 5)).toBe(true)
  })

  it("ATR Wilder: TR cần đóng cửa trước, ATR đầu là trung bình N TR", () => {
    const bars = [bar(10, 11, 9, 10, 1), bar(10, 12, 10, 11, 1), bar(11, 13, 10, 12, 1), bar(12, 12, 11, 11, 1)]
    // TR1 = 2, TR2 = 3, TR3 = 1; ATR(2) tại nến 2 = 2.5, tại nến 3 = (2.5 + 1) / 2
    expect(atr(bars, 2)).toEqual([null, null, 2.5, 1.75])
  })

  it("OBV: cộng khi tăng, trừ khi giảm, giữ khi bằng", () => {
    const bars = [bar(10, 10, 10, 10, 100), bar(10, 11, 10, 11, 200), bar(11, 11, 11, 11, 300), bar(11, 11, 9, 9, 400)]
    expect(obv(columnsOf(bars), 2).obv).toEqual([0, 200, 200, -200])
    expect(obv(columnsOf([]), 2).obv).toEqual([])
  })

  it("CMF: dòng tiền (2C-H-L)/(H-L) nhân khối lượng chia tổng khối lượng", () => {
    const bars = [bar(10, 12, 8, 11, 100), bar(10, 12, 8, 9, 300)]
    // nến 1: (22-20)/4 = 0.5, flow 50; nến 2: (18-20)/4 = -0.5, flow -150; CMF = -100 / 400
    expect(cmf(columnsOf(bars), 2)).toEqual([null, -0.25])
  })

  it("Volume: trung bình các phiên TRƯỚC nhân hệ số, không gồm phiên đang xét", () => {
    const volume = [100, 200, 300, 400, 500, 600]
    expect(volumeThreshold(volume, 3, 1)).toEqual([null, null, null, 200, 300, 400])
    expect(volumeThreshold(volume, 3, 1.5)[3]).toBe(300)
  })
})

describe("cửa sổ trượt thay cho slice và quét lặp", () => {
  it("ngưỡng Volume bằng cách tính slice gốc của Flashback", () => {
    const next = lcg(7)
    const volume = Array.from({ length: 400 }, () => Math.round(next() * 1e6))
    for (const lookback of [5, 20, 100]) {
      const naive = volume.map((_, index) => (index < lookback ? null : 1.3 * (volume.slice(index - lookback, index).reduce((sum, value) => sum + value, 0) / lookback)))
      const fast = volumeThreshold(volume, lookback, 1.3)
      fast.forEach((value, index) => {
        if (naive[index] === null) expect(value).toBeNull()
        else expect(isClose(value!, naive[index]!, 1e-12)).toBe(true)
      })
    }
  })

  it("cực trị trượt bằng cách quét lặp, kể cả khi có giá trị bằng nhau", () => {
    const next = lcg(11)
    const values = Array.from({ length: 300 }, () => Math.round(next() * 20))
    for (const window of [1, 2, 5, 17, 300]) {
      const max = slidingExtreme(values, window, true)
      const min = slidingExtreme(values, window, false)
      values.forEach((_, index) => {
        if (index < window - 1) {
          expect(max[index]).toBeNull()
          return
        }
        const part = values.slice(index - window + 1, index + 1)
        expect(max[index]).toBe(Math.max(...part))
        expect(min[index]).toBe(Math.min(...part))
      })
    }
  })

  it("Volume trên 50.000 nến chạy nhanh (không còn slice trong vòng lặp)", () => {
    const next = lcg(3)
    const bars = Array.from({ length: 50_000 }, () => bar(10, 11, 9, 10, Math.round(next() * 1e6)))
    const started = performance.now()
    const plot = plotOf("volume", { lookback: 100, mult: 1 }, undefined, bars)
    expect(performance.now() - started).toBeLessThan(500)
    expect(seriesOf(plot, "threshold").values).toHaveLength(50_000)
  })
})

describe("hình dạng kết quả của cả 24 chỉ báo", () => {
  it("không ném lỗi và mỗi chuỗi dài đúng bằng số nến, với 0, 1, 2, 3, 10 và 60 nến", () => {
    for (const definition of formulaIndicators()) {
      for (const count of [0, 1, 2, 3, 10, 60]) {
        const bars = goldenBars(count)
        const plot = definition.compute(bars, {}, ["chart-1", "chart-6"])
        expect(plot.kind, definition.id).toBe(definition.kind)
        for (const series of plot.series) expect(series.values, `${definition.id}.${series.key} @${count}`).toHaveLength(count)
        if (plot.histogram) expect(plot.histogram.values, `${definition.id} histogram @${count}`).toHaveLength(count)
      }
    }
  })

  it("mọi giá trị là số hữu hạn hoặc null, không có NaN hay Infinity", () => {
    for (const definition of formulaIndicators()) {
      const plot = definition.compute(BARS, {}, ["chart-1"])
      const all = [...plot.series.map((series) => series.values), ...(plot.histogram ? [plot.histogram.values] : [])]
      for (const values of all) expect(values.every((value) => value === null || Number.isFinite(value)), definition.id).toBe(true)
    }
  })

  it("mọi chuỗi có khoá và nhãn, khoá không trùng trong một chỉ báo", () => {
    for (const definition of formulaIndicators()) {
      const plot = definition.compute(BARS, {}, ["chart-1"])
      expect(plot.series.length, definition.id).toBeGreaterThan(0)
      const keys = plot.series.map((series) => series.key)
      expect(new Set(keys).size, definition.id).toBe(keys.length)
      for (const series of plot.series) expect(series.label.length, `${definition.id}.${series.key}`).toBeGreaterThan(0)
    }
  })

  it("chỉ báo có đủ dữ liệu thì có giá trị ở nến cuối", () => {
    for (const definition of formulaIndicators()) {
      const plot = definition.compute(BARS, {}, ["chart-1"])
      const last = BARS.length - 1
      expect(
        plot.series.some((series) => series.values[last] !== null),
        definition.id,
      ).toBe(true)
    }
  })
})

describe("màu theo token và bảng màu truyền vào", () => {
  const tokensOf = (plot: IndicatorPlot): string[] => [
    ...plot.series.map((series) => series.color),
    ...(plot.histogram ? [plot.histogram.upToken, plot.histogram.downToken] : []),
  ]

  it("không bao giờ có var(--x) hay màu thô", () => {
    for (const definition of formulaIndicators()) {
      const text = JSON.stringify(definition.compute(goldenBars(40), {}, ["chart-1", "chart-6", "chart-8"]))
      expect(text, definition.id).not.toContain("var(")
      expect(text, definition.id).not.toMatch(/#[0-9a-f]{3,6}\b/i)
      expect(text, definition.id).not.toMatch(/rgb|hsl|oklch/)
    }
  })

  it("chuỗi lấy màu từ bảng màu, vòng lại khi hết; chỉ +DI/-DI và histogram MACD dùng price-up/price-down", () => {
    const palette: ColorToken[] = ["chart-1", "chart-2", "chart-5"]
    for (const definition of formulaIndicators()) {
      const plot = definition.compute(BARS, {}, palette)
      for (const token of tokensOf(plot)) {
        if (token === "price-up" || token === "price-down") {
          expect(["dmi", "macd"], definition.id).toContain(definition.id)
          continue
        }
        expect(palette, `${definition.id}: ${token}`).toContain(token)
      }
    }
  })

  it("bảng màu khi có đường trần sàn (chart-1, chart-2, chart-5) không để lọt chart-6, 7, 8", () => {
    for (const definition of formulaIndicators()) {
      const tokens = tokensOf(definition.compute(BARS, {}, ["chart-1", "chart-2", "chart-5"]))
      for (const token of tokens) expect(["chart-6", "chart-7", "chart-8"], `${definition.id}: ${token}`).not.toContain(token)
    }
  })

  it("chart-7 chỉ dành cho lớp AI nên không chỉ báo nào tự dùng", () => {
    for (const definition of formulaIndicators()) {
      expect(tokensOf(definition.compute(BARS, {}, ["chart-1", "chart-6", "chart-8", "chart-2", "chart-5"])), definition.id).not.toContain("chart-7")
    }
  })

  it("thứ tự mặc định chart-1, chart-6: đường chính trước, đường phụ sau (MA Cross, Bollinger)", () => {
    const cross = plotOf("ma_cross")
    expect(cross.series.map((series) => series.color)).toEqual(["chart-1", "chart-6"])
    const bands = plotOf("bollinger")
    expect(Object.fromEntries(bands.series.map((series) => [series.key, series.color]))).toEqual({ upper: "chart-6", lower: "chart-6", middle: "chart-1" })
  })

  it("bảng màu rỗng không làm hỏng: rơi về chart-1", () => {
    const plot = plotOf("ema", {}, [])
    expect(plot.series[0].color).toBe("chart-1")
  })

  it("+DI/-DI và histogram MACD giữ price-up, price-down", () => {
    const dmi = plotOf("dmi")
    expect(Object.fromEntries(dmi.series.map((series) => [series.key, series.color]))).toEqual({ plus: "price-up", minus: "price-down" })
    expect(plotOf("macd").histogram).toMatchObject({ upToken: "price-up", downToken: "price-down" })
  })
})

describe("cấu trúc vẽ của từng nhóm chỉ báo", () => {
  it("RSI, Stochastic, MFI, Williams %R: miền cố định, hai ngưỡng và dải ngưỡng", () => {
    const rsiPlot = plotOf("rsi", { lower: 25, upper: 75 })
    expect(rsiPlot.range).toEqual([0, 100])
    expect(rsiPlot.levels).toEqual([
      { key: "lower", value: 25, label: "Ngưỡng dưới" },
      { key: "upper", value: 75, label: "Ngưỡng trên" },
    ])
    expect(rsiPlot.levelBand).toEqual({ lower: 25, upper: 75 })
    expect(plotOf("stochastic").range).toEqual([0, 100])
    expect(plotOf("mfi").range).toEqual([0, 100])
    expect(plotOf("williams_r").range).toEqual([-100, 0])
    expect(plotOf("williams_r").levelBand).toEqual({ lower: -80, upper: -20 })
  })

  it("MACD, CCI, ROC, CMF vẽ vạch 0; MACD có histogram", () => {
    for (const id of ["macd", "cci", "roc", "cmf"]) expect(plotOf(id).zero, id).toBe(true)
    expect(plotOf("macd").histogram?.values).toHaveLength(BARS.length)
    expect(plotOf("cmf", { level: 0.1 }).levels).toEqual([{ key: "level", value: 0.1, label: "Ngưỡng" }])
    expect(plotOf("cci").levelBand).toEqual({ lower: -100, upper: 100 })
  })

  it("MA Cross khoanh giao cắt giữa hai chuỗi có thật", () => {
    const plot = plotOf("ma_cross", { fast: 5, slow: 21 })
    expect(plot.cross).toEqual(["fast", "slow"])
    for (const key of plot.cross!) expect(plot.series.some((series) => series.key === key)).toBe(true)
    expect(seriesOf(plot, "fast").label).toBe("MA 5")
    expect(seriesOf(plot, "slow").label).toBe("MA 21")
  })

  it("Volume vẽ ở ô khối lượng; Parabolic SAR vẽ chấm; Relative Volume có vạch 1", () => {
    expect(plotOf("volume").kind).toBe("vol")
    expect(plotOf("psar").series[0].style).toBe("dots")
    expect(plotOf("relative_volume").levels).toEqual([{ key: "one", value: 1, label: "1,0" }])
  })

  it("ngưỡng Volume = mult nhân trung bình lookback phiên trước (kiểm trực tiếp trên nến mẫu)", () => {
    const values = seriesOf(plotOf("volume", { lookback: 10, mult: 1.5 }), "threshold").values
    const index = 100
    const mean = BARS.slice(index - 10, index).reduce((sum, item) => sum + item.volume, 0) / 10
    expect(values[index]).toBeCloseTo(1.5 * mean, 6)
    expect(values[9]).toBeNull()
    expect(values[10]).not.toBeNull()
  })

  it("nhãn có chu kỳ cho MA và EMA", () => {
    expect(plotOf("ma", { period: 50 }).series[0].label).toBe("MA 50")
    expect(plotOf("ema", { period: 12 }).series[0].label).toBe("EMA 12")
  })

  it("danh mục dữ liệu mẫu có phiên kịch trần/sàn nên các chỉ báo xử lý nến phẳng mà không lỗi", () => {
    const flat = GOLDEN.bars.map((item, index) => (item.high === item.low ? index : -1)).filter((index) => index >= 0)
    expect(flat.length).toBeGreaterThanOrEqual(5)
    for (const definition of formulaIndicators()) expect(() => definition.compute(BARS, {}, ["chart-1"])).not.toThrow()
  })
})

describe("chỗ lệch lý thuyết với backend mà bộ mẫu không chạm tới", () => {
  it("ngưỡng Volume khi cả cửa sổ khối lượng bằng 0: frontend cho 0 (backend cho null)", () => {
    const bars = Array.from({ length: 12 }, () => bar(10, 10, 10, 10, 0))
    const values = seriesOf(plotOf("volume", { lookback: 5, mult: 1 }, undefined, bars), "threshold").values
    expect(values.slice(5)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})
