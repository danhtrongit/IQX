/**
 * 16 chỉ báo đợt 2 (docs/iqline-design.md §9): giá trị tính tay trên chuỗi ngắn, khoá `tailMemory`, trường hợp suy biến và chỉ báo cần
 * thời gian. KHÔNG có công thức backend để đối chiếu và chưa đối chiếu nguồn ngoài (TradingView...): các số "tính tay" ở đây chỉ chứng
 * minh code làm đúng định nghĩa công khai ghi trong `series-extra.ts`.
 */
import { describe, expect, it } from "vitest"
import type { Bar, IndicatorContext, IndicatorPlot, Interval } from "../types"
import { computeIndicator, createIndicatorCache, DEFAULT_PALETTE, getIndicator, indicatorTailMemory, listIndicators, resolveIndicatorParams, validateIndicatorParams } from "./index"
import { autoPivotUnit, autoVwapUnit, ictDayNumber, isIntradayInterval, periodKey } from "./periods"
import { aroon, accumulationDistribution, awesomeOscillator, envelope, hma, ichimoku, momentum, pivotPoints, standardDeviation, superTrend, trix, ultimateOscillator, volatilityOhlc, vwap, vwma, wma } from "./series-extra"
import { columnsOf } from "./series"
import { contextFor, goldenBars, ictMidnight, isClose, timesFor } from "./test-support"

const bar = (open: number, high: number, low: number, close: number, volume = 100): Bar => ({ open, high, low, close, volume })
/** Nến chỉ quan tâm giá cao, thấp (đóng ở giữa): đủ cho Aroon, Ichimoku. */
const hl = (high: number, low: number, volume = 100): Bar => bar((high + low) / 2, high, low, (high + low) / 2, volume)

const NEW_IDS = ["ichimoku", "vwap", "supertrend", "wma", "hma", "vwma", "envelope", "pivot_points", "aroon", "trix", "ultimate_oscillator", "awesome_oscillator", "momentum", "std_dev", "accum_dist", "volatility_ohlc"]
const TIMED = new Set(["vwap", "pivot_points"])

function plotOf(id: string, params: Record<string, number | string> = {}, bars: readonly Bar[] = goldenBars(), context?: IndicatorContext): IndicatorPlot {
  const plot = computeIndicator({ id, params }, bars, DEFAULT_PALETTE, context ?? contextFor(bars.length))
  if (!plot) throw new Error(`Không tính được ${id}`)
  return plot
}
const seriesOf = (plot: IndicatorPlot, key: string) => {
  const found = plot.series.find((item) => item.key === key)
  if (!found) throw new Error(`Thiếu chuỗi ${key}`)
  return found
}

/** So hai chuỗi có sai số nhỏ; `null` phải trùng chỗ. */
function expectClose(actual: readonly (number | null)[], expected: readonly (number | null)[], digits = 9): void {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => {
    if (value === null) expect(actual[index], `[${index}]`).toBeNull()
    else {
      expect(actual[index], `[${index}]`).not.toBeNull()
      expect(actual[index]!, `[${index}]`).toBeCloseTo(value, digits)
    }
  })
}

// ---------------------------------------------------------------- tính tay

describe("trung bình động, tính tay", () => {
  it("WMA: trọng số N cho nến mới nhất xuống 1 cho nến xa nhất, chia N(N+1)/2", () => {
    // WMA(3) của 1..5: (3x3 + 2x2 + 1x1) / 6 = 14/6, rồi 20/6, 26/6
    expectClose(wma([1, 2, 3, 4, 5], 3), [null, null, 14 / 6, 20 / 6, 26 / 6])
    // chuỗi tuyến tính độ dốc 1: WMA = giá - (N-1)/3
    expectClose(wma([10, 11, 12, 13], 4), [null, null, null, 13 - 1])
    expectClose(wma([7, 7, 7, 7], 3), [null, null, 7, 7])
  })

  it("WMA: một giá trị thiếu làm null cả cửa sổ chứa nó", () => {
    expectClose(wma([1, null, 3, 4, 5], 2), [null, null, null, (2 * 4 + 1 * 3) / 3, (2 * 5 + 1 * 4) / 3])
  })

  it("HMA: chuỗi tuyến tính được bám sát không trễ; chuỗi lũy thừa tính tay", () => {
    // HMA(4): WMA(2 x WMA(x,2) - WMA(x,4), 2). Với x tuyến tính kết quả đúng bằng x tại các nến đủ dữ liệu.
    expectClose(hma([1, 2, 3, 4, 5, 6, 7, 8], 4), [null, null, null, null, 5, 6, 7, 8])
    // [2, 4, 8, 16, 32]: raw = 2 x WMA2 - WMA4 = 50,6/3 (nến 3) và 101,2/3 (nến 4); HMA = (2 x 101,2/3 + 50,6/3) / 3 = 253/9
    expectClose(hma([2, 4, 8, 16, 32], 4), [null, null, null, null, 253 / 9])
  })

  it("VWMA: tổng(giá x khối lượng) / tổng(khối lượng); khối lượng 0 cả cửa sổ là null", () => {
    expectClose(vwma([10, 20, 30], [1, 1, 2], 2), [null, 15, (20 + 60) / 3])
    expectClose(vwma([10, 20, 30], [0, 0, 0], 2), [null, null, null])
  })

  it("Envelope: đường giữa SMA hoặc EMA, hai dải lệch đúng tỷ lệ phần trăm", () => {
    const sma = envelope([10, 20, 30], 2, 10, "sma")
    expectClose(sma.middle, [null, 15, 25])
    expectClose(sma.upper, [null, 16.5, 27.5])
    expectClose(sma.lower, [null, 13.5, 22.5])
    // EMA(2), hệ số 2/3: nến 1 là SMA(10,20) = 15, nến 2 là 30 x 2/3 + 15 / 3 = 25
    const exp = envelope([10, 20, 30], 2, 20, "ema")
    expectClose(exp.middle, [null, 15, 25])
    expectClose(exp.upper, [null, 18, 30])
    expectClose(exp.lower, [null, 12, 20])
  })

  it("nguồn giá: hl2, hlc3, ohlc4 và open, high, low", () => {
    const bars = [bar(10, 14, 8, 12)]
    const cols = columnsOf(bars)
    const at = (source: string) => plotOf("wma", { period: 2, source }, [bar(10, 14, 8, 12), bar(10, 14, 8, 12)]).series[0].values[1]
    expect(at("close")).toBe(12)
    expect(at("open")).toBe(10)
    expect(at("high")).toBe(14)
    expect(at("low")).toBe(8)
    expect(at("hl2")).toBe(11)
    expect(at("hlc3")).toBeCloseTo((14 + 8 + 12) / 3, 12)
    expect(at("ohlc4")).toBeCloseTo((10 + 14 + 8 + 12) / 4, 12)
    expect(cols.close).toEqual([12])
  })
})

describe("động lượng và biến động, tính tay", () => {
  it("Momentum: giá hiện tại trừ giá cách N nến", () => {
    expectClose(momentum([1, 3, 6, 10], 2), [null, null, 5, 7])
  })

  it("Standard Deviation: độ lệch chuẩn tổng thể (chia N); chuỗi hằng là 0", () => {
    // [2, 4, 6]: trung bình 4, tổng bình phương lệch 8, căn(8/3)
    expectClose(standardDeviation([2, 4, 6], 3), [null, null, Math.sqrt(8 / 3)])
    expectClose(standardDeviation([5, 5, 5, 5], 3), [null, null, 0, 0])
  })

  it("Aroon: 100 x (N - số nến từ đỉnh hoặc đáy) / N trong cửa sổ N + 1 nến", () => {
    const columns = columnsOf([hl(1, 1), hl(3, 1), hl(2, 1), hl(2, 0), hl(1, 2)])
    const { up, down } = aroon(columns, 3)
    // nến 3: cửa sổ 0..3, đỉnh 3 ở nến 1 (cách 2), đáy 0 ở nến 3 (cách 0)
    expectClose(up, [null, null, null, (100 * (3 - 2)) / 3, 0])
    expectClose(down, [null, null, null, 100, (100 * (3 - 1)) / 3])
  })

  it("Aroon: đỉnh bằng nhau lấy nến gần nhất", () => {
    const { up } = aroon(columnsOf([hl(3, 1), hl(1, 0.5), hl(3, 1)]), 2)
    expectClose(up, [null, null, 100])
  })

  it("TRIX: tốc độ thay đổi 1 nến theo % của EMA ba lần", () => {
    // chu kỳ 1: EMA là chính giá nên TRIX là % thay đổi từng nến
    expectClose(trix([100, 110, 121], 1), [null, 10, 10])
    // chu kỳ 2 trên 1..6: EMA ba lần = 2,5; 3,5; 4,5 ở nến 3, 4, 5 nên TRIX = 100 x 1/2,5 = 40 và 100 x 1/3,5
    expectClose(trix([1, 2, 3, 4, 5, 6], 2), [null, null, null, null, 40, 100 / 3.5])
  })

  it("Ultimate Oscillator: 100 x (4A ngắn + 2A vừa + A dài) / 7, A = tổng BP / tổng TR", () => {
    const columns = columnsOf([bar(10, 10, 10, 10), bar(10, 12, 9, 11), bar(11, 13, 10, 12), bar(12, 12, 8, 9)])
    // BP = đóng - min(thấp, đóng trước): 2, 2, 1. TR = max(cao, đóng trước) - min(thấp, đóng trước): 3, 3, 4.
    // nến 3: A1 = 1/4, A2 = 3/7, A3 = 5/10
    expectClose(ultimateOscillator(columns, 1, 2, 3), [null, null, null, (100 * (4 * 0.25 + 2 * (3 / 7) + 0.5)) / 7])
  })

  it("Awesome Oscillator: SMA nhanh trừ SMA chậm của trung điểm (cao + thấp) / 2", () => {
    const mids = [1, 4, 9, 16]
    const columns = columnsOf(mids.map((mid) => hl(mid + 1, mid - 1)))
    // nến 2: SMA2 = 6,5 và SMA3 = 14/3; nến 3: SMA2 = 12,5 và SMA3 = 29/3
    expectClose(awesomeOscillator(columns, 2, 3), [null, null, 6.5 - 14 / 3, 12.5 - 29 / 3])
  })

  it("Accumulation/Distribution: cộng dồn hệ số dòng tiền x khối lượng; nến cao = thấp đóng góp 0", () => {
    const columns = columnsOf([bar(10, 12, 8, 11, 100), bar(10, 12, 8, 9, 300), bar(10, 10, 10, 10, 500), bar(8, 10, 6, 10, 200)])
    // +0,5 x 100 = 50; -0,5 x 300 = -150; phẳng 0; +1 x 200
    expect(accumulationDistribution(columns)).toEqual([50, -100, -100, 100])
  })

  it("Volatility O-H-L-C: ước lượng Garman-Klass, theo nến và quy năm", () => {
    const bars = [bar(100, 110, 100, 110)]
    // ln(110/100) = 0,09531; g = 0,5 x 0,009084 - (2 ln 2 - 1) x 0,009084 = 0,0010329; căn x 100 = 3,2139
    expectClose(volatilityOhlc(bars, 1, 1), [3.2139], 3)
    expectClose(volatilityOhlc(bars, 1, 252), [3.2139 * Math.sqrt(252)], 2)
    // trung bình của hai nến, nến thứ hai phẳng (g = 0): căn(g / 2)
    expectClose(volatilityOhlc([bars[0], bar(5, 5, 5, 5)], 2, 1), [null, 3.2139 / Math.sqrt(2)], 3)
  })

  it("Volatility O-H-L-C: nến không hợp lệ (giá thấp 0, cao thấp không bao nến) làm null cả cửa sổ", () => {
    const values = volatilityOhlc([bar(1, 2, 0, 1), bar(100, 110, 100, 110), bar(100, 110, 100, 110)], 2, 1)
    expect(values[1]).toBeNull()
    expect(values[2]).not.toBeNull()
    expect(volatilityOhlc([bar(100, 90, 95, 100)], 1, 1)).toEqual([null])
  })
})

describe("Ichimoku, tính tay", () => {
  const bars = [hl(10, 8), hl(12, 9), hl(11, 7), hl(14, 10), hl(13, 9)]
  const lines = ichimoku(columnsOf(bars), 2, 3, 4)

  it("Tenkan, Kijun là trung điểm đỉnh đáy 2 và 3 nến; Senkou A là trung bình hai đường; Senkou B là trung điểm 4 nến", () => {
    expectClose(lines.tenkan, [null, 10, 9.5, 10.5, 11.5])
    expectClose(lines.kijun, [null, null, 9.5, 10.5, 10.5])
    expectClose(lines.senkouA, [null, null, 9.5, 10.5, 11])
    expectClose(lines.senkouB, [null, null, null, 10.5, 10.5])
    expect(lines.chikou).toEqual(bars.map((item) => item.close))
  })

  it("chỉ báo: chuỗi dài đúng số nến, Senkou dời về tương lai, Chikou về quá khứ, và có mây giữa hai Senkou", () => {
    const plot = plotOf("ichimoku", { conversion: 2, base: 3, spanB: 4, displacement: 2 }, bars)
    for (const item of plot.series) expect(item.values).toHaveLength(bars.length)
    expect(Object.fromEntries(plot.series.map((item) => [item.key, item.offset ?? 0]))).toEqual({ tenkan: 0, kijun: 0, senkou_a: 2, senkou_b: 2, chikou: -2 })
    expect(plot.cloud).toEqual({ a: "senkou_a", b: "senkou_b", upToken: "price-up", downToken: "price-down" })
    expect(plot.kind).toBe("over")
  })

  it("Senkou lấy màu bảng, không phải price-up/price-down (màu tăng giảm chỉ dành cho mây)", () => {
    const plot = plotOf("ichimoku", {}, goldenBars())
    for (const key of ["tenkan", "kijun", "senkou_a", "senkou_b", "chikou"]) expect(["price-up", "price-down"], key).not.toContain(seriesOf(plot, key).color)
  })

  it("kijun không nhỏ hơn tenkan không bị ép (Ichimoku cho phép thử mọi chu kỳ), nhưng chu kỳ ngoài miền bị từ chối", () => {
    expect(validateIndicatorParams("ichimoku", { conversion: 20, base: 10 })).toBeNull()
    expect(validateIndicatorParams("ichimoku", { displacement: 0 })).not.toBeNull()
    expect(validateIndicatorParams("ichimoku", { spanB: 500 })).not.toBeNull()
  })
})

describe("SuperTrend, tính tay", () => {
  // ATR(1) bằng chính TR. Hệ số 1. Các nến theo thứ tự: khởi đầu, tăng, tăng, sập (đảo chiều), giảm, hồi (đảo chiều lên).
  const bars = [bar(10, 11, 9, 10), bar(10, 12, 10, 11.5), bar(11.5, 13, 11, 12.5), bar(12.5, 12.5, 8, 8.5), bar(8.5, 9, 7, 7.5), bar(7.5, 11, 7.5, 10.5)]
  const { up, down } = superTrend(bars, 1, 1)

  it("đang tăng thì đường là dải dưới, đang giảm thì đường là dải trên, và mỗi nến chỉ có một trong hai", () => {
    expectClose(up, [null, 9, 10, null, null, 6])
    expectClose(down, [null, null, null, 13, 10, null])
    up.forEach((value, index) => expect(value === null && down[index] === null, `nến ${index}`).toBe(index === 0))
  })

  it("dải dưới chỉ được nâng lên và dải trên chỉ được hạ xuống khi chưa đảo chiều", () => {
    // Nến 2: dải thô dưới là 10 > 9 nên nâng lên 10; dải trên thô 14 > 13 nên giữ 13 (nến 3 đảo chiều dùng đúng 13).
    expect(up[2]).toBe(10)
    expect(down[3]).toBe(13)
    // Nến 4: dải thô trên 10 < 13 nên hạ xuống 10.
    expect(down[4]).toBe(10)
  })

  it("nến hỏng đặt lại xu hướng thay vì ném lỗi", () => {
    const broken = [...bars.slice(0, 3), bar(Number.NaN, Number.NaN, Number.NaN, Number.NaN), ...bars.slice(3)]
    const result = superTrend(broken, 1, 1)
    expect(result.up).toHaveLength(broken.length)
    expect(result.up[3]).toBeNull()
    expect(result.down[3]).toBeNull()
  })

  it("chỉ báo có hai chuỗi tăng và giảm màu price-up, price-down", () => {
    const plot = plotOf("supertrend")
    expect(plot.series.map((item) => [item.key, item.color])).toEqual([
      ["up", "price-up"],
      ["down", "price-down"],
    ])
  })
})

// ---------------------------------------------------------------- theo thời gian

describe("kỳ theo lịch (giờ Việt Nam)", () => {
  it("ngày đổi lúc nửa đêm giờ Việt Nam, không phải nửa đêm UTC", () => {
    const evening = ictMidnight(2026, 1, 5) + 23.5 * 3600 // 23:30 ICT = 16:30 UTC
    const after = ictMidnight(2026, 1, 6) + 0.5 * 3600 // 00:30 ICT ngày sau = 17:30 UTC
    expect(periodKey(evening, "day")).not.toBe(periodKey(after, "day"))
    expect(periodKey(ictMidnight(2026, 1, 5) + 1, "day")).toBe(periodKey(evening, "day"))
  })

  it("tuần bắt đầu thứ hai: thứ hai đến chủ nhật cùng kỳ, thứ hai kế tiếp là kỳ mới", () => {
    const monday = ictMidnight(2026, 1, 5)
    const keys = Array.from({ length: 8 }, (_, day) => periodKey(monday + day * 86_400 + 9 * 3600, "week"))
    expect(new Set(keys.slice(0, 7)).size).toBe(1)
    expect(keys[7]).toBe(keys[0] + 1)
  })

  it("tháng và năm theo lịch dương, kể cả mốc năm mới giờ Việt Nam", () => {
    expect(periodKey(ictMidnight(2026, 1, 31) + 3600, "month")).not.toBe(periodKey(ictMidnight(2026, 2, 1) + 3600, "month"))
    expect(periodKey(ictMidnight(2026, 1, 1) + 3600, "month")).toBe(periodKey(ictMidnight(2026, 1, 31) + 3600, "month"))
    // 17:00 UTC ngày 31/12/2025 là 00:00 ngày 1/1/2026 giờ Việt Nam
    expect(periodKey(Date.UTC(2025, 11, 31, 17, 0) / 1000, "year")).toBe(periodKey(ictMidnight(2026, 6, 1), "year"))
    expect(periodKey(Date.UTC(2025, 11, 31, 16, 59) / 1000, "year")).not.toBe(periodKey(ictMidnight(2026, 6, 1), "year"))
    expect(ictDayNumber(ictMidnight(2026, 1, 1))).toBe(20_454)
  })

  it("kỳ tự động theo khung: VWAP đặt lại theo phiên ở khung phút, theo tháng ở khung ngày, theo năm ở tuần và tháng", () => {
    for (const interval of ["1", "5", "15", "30", "60"] as Interval[]) {
      expect(isIntradayInterval(interval)).toBe(true)
      expect(autoVwapUnit(interval)).toBe("day")
    }
    expect(autoVwapUnit("D")).toBe("month")
    expect(autoVwapUnit("W")).toBe("year")
    expect(autoVwapUnit("M")).toBe("year")
    expect(isIntradayInterval("D")).toBe(false)
  })

  it("kỳ tự động của Pivot Points: 1 đến 15 phút theo ngày, 30 và 60 phút theo tuần, ngày theo tháng, tuần và tháng theo năm", () => {
    expect(["1", "5", "15"].map((interval) => autoPivotUnit(interval as Interval))).toEqual(["day", "day", "day"])
    expect(["30", "60"].map((interval) => autoPivotUnit(interval as Interval))).toEqual(["week", "week"])
    expect(autoPivotUnit("D")).toBe("month")
    expect(autoPivotUnit("W")).toBe("year")
    expect(autoPivotUnit("M")).toBe("year")
  })

  it("dữ liệu mẫu: thời gian tăng dần, bỏ cuối tuần, đúng phiên", () => {
    const times = timesFor(120, "5")
    expect(times.every((time, index) => index === 0 || time > times[index - 1])).toBe(true)
    // phiên sáng 09:00 đến 11:30 là 30 nến 5 phút, phiên chiều 13:00 đến 14:45 là 21 nến
    expect(times.slice(0, 51).filter((time) => time < ictMidnight(2026, 1, 5) + 12 * 3600)).toHaveLength(30)
  })
})

describe("VWAP, tính tay", () => {
  // Hai nến ngày 5/1 (giá điển hình 10 và 12), một nến ngày 6/1 (giá điển hình 9).
  const day1 = ictMidnight(2026, 1, 5)
  const day2 = ictMidnight(2026, 1, 6)
  const bars = [bar(10, 12, 8, 10, 100), bar(12, 14, 10, 12, 300), bar(9, 9, 9, 9, 50)]
  const times = [day1 + 9 * 3600, day1 + 9.5 * 3600, day2 + 9 * 3600]

  it("khung trong ngày: cộng dồn (giá điển hình x khối lượng) / khối lượng, đặt lại mỗi phiên", () => {
    expectClose(vwap(columnsOf(bars), times, "day"), [10, (10 * 100 + 12 * 300) / 400, 9])
  })

  it("kỳ dài hơn không đặt lại giữa hai ngày cùng tuần", () => {
    const values = vwap(columnsOf(bars), times, "week")
    expect(values[1]).toBeCloseTo(11.5, 12)
    expect(values[2]).toBeCloseTo((10 * 100 + 12 * 300 + 9 * 50) / 450, 12)
  })

  it("khối lượng 0 đầu phiên cho null tới khi có khối lượng, không NaN", () => {
    const zero = [bar(10, 12, 8, 10, 0), bar(12, 14, 10, 12, 300)]
    expect(vwap(columnsOf(zero), times.slice(0, 2), "day")).toEqual([null, 12])
  })

  it("chỉ báo: đặt lại theo phiên ở khung 5 phút, nhãn nói rõ kỳ; khung ngày mặc định theo tháng và nhãn là tháng", () => {
    const intraday = plotOf("vwap", {}, bars, { times, interval: "5" })
    expect(intraday.series[0].label).toBe("VWAP theo phiên")
    expectClose(intraday.series[0].values, [10, 11.5, 9])
    const daily = plotOf("vwap", {}, bars, { times, interval: "D" })
    expect(daily.series[0].label).toBe("VWAP theo tháng")
    expect(daily.series[0].values[2]).toBeCloseTo((10 * 100 + 12 * 300 + 9 * 50) / 450, 12)
    // ghi đè kỳ: khung ngày nhưng tự chọn theo ngày
    expectClose(plotOf("vwap", { anchor: "day" }, bars, { times, interval: "D" }).series[0].values, [10, 11.5, 9])
  })
})

describe("Pivot Points Standard, tính tay", () => {
  // Ngày 1 (hai nến đầu): cao 14, thấp 8, đóng 13, P = 35/3. Ngày 2 (nến 2 và 3): cao 20, thấp 11, đóng 16 (đóng của nến cuối ngày), P = 47/3.
  const day1 = ictMidnight(2026, 1, 5)
  const day2 = ictMidnight(2026, 1, 6)
  const day3 = ictMidnight(2026, 1, 7)
  const bars = [bar(10, 12, 8, 10), bar(10, 14, 9, 13), bar(13, 13.5, 11, 12), bar(16, 20, 15, 16), bar(16, 17, 16, 16)]
  const times = [day1 + 9 * 3600, day1 + 10 * 3600, day2 + 9 * 3600, day2 + 10 * 3600, day3 + 9 * 3600]
  const levels = pivotPoints(columnsOf(bars), times, "day")

  it("mức của kỳ này tính từ cao, thấp, đóng của kỳ trước; kỳ đầu tiên không có", () => {
    const p = 35 / 3
    const q = (20 + 11 + 16) / 3
    expectClose(levels.pp, [null, null, p, p, q])
    expectClose(levels.r1, [null, null, 2 * p - 8, 2 * p - 8, 2 * q - 11])
    expectClose(levels.s1, [null, null, 2 * p - 14, 2 * p - 14, 2 * q - 20])
    expectClose(levels.r2.slice(4), [q + (20 - 11)])
    expectClose(levels.s3.slice(4), [11 - 2 * (20 - q)])
    expectClose(levels.r2.slice(2, 3), [p + (14 - 8)])
    expectClose(levels.s2.slice(2, 3), [p - (14 - 8)])
    expectClose(levels.r3.slice(2, 3), [14 + 2 * (p - 8)])
    expectClose(levels.s3.slice(2, 3), [8 - 2 * (14 - p)])
  })

  it("ngày 1 lấy cao nhất 14, thấp nhất 8 và đóng cửa của nến cuối (13) dù nến đầu cao hơn đóng", () => {
    // Nếu lấy nhầm đóng nến đầu (10) thì P = 32/3.
    expect(levels.pp[2]).toBeCloseTo(35 / 3, 12)
  })

  it("trong một kỳ mọi nến có cùng mức", () => {
    expect(levels.pp[2]).toBe(levels.pp[3])
    expect(levels.r3[2]).toBe(levels.r3[3])
  })

  it("chỉ báo có đủ 7 mức, vẽ dạng bậc theo kỳ, và nhãn kỳ theo khung", () => {
    const plot = plotOf("pivot_points", { timeframe: "day" }, bars, { times, interval: "5" })
    expect(plot.series.map((item) => item.key)).toEqual(["r3", "r2", "r1", "pp", "s1", "s2", "s3"])
    for (const item of plot.series) expect(item.style).toBe("step")
    // timeframe tự động ở khung ngày là tháng: cả 3 ngày cùng một tháng nên không có kỳ trước, mọi mức null
    const monthly = plotOf("pivot_points", {}, bars, { times, interval: "D" })
    expect(monthly.series.every((item) => item.values.every((value) => value === null))).toBe(true)
  })

  it("kỳ tuần: nến thứ hai đầu tuần mới dùng cao, thấp, đóng của cả tuần trước", () => {
    const monday = ictMidnight(2026, 1, 5)
    const weekBars = [bar(10, 12, 8, 10), bar(10, 15, 9, 14), bar(14, 16, 13, 15), bar(15, 17, 12, 16)]
    const weekTimes = [monday + 9 * 3600, monday + 4 * 86_400 + 9 * 3600, monday + 7 * 86_400 + 9 * 3600, monday + 8 * 86_400 + 9 * 3600]
    const weekly = pivotPoints(columnsOf(weekBars), weekTimes, "week")
    // tuần 1: cao 15, thấp 8, đóng 14 -> P = 37/3
    expectClose(weekly.pp, [null, null, 37 / 3, 37 / 3])
  })
})

describe("chỉ báo cần thời gian khi thiếu hoặc lệch context", () => {
  it("không có context thì trả biểu đồ rỗng, không đoán thời gian (Flashback không có đường đọc thời gian)", () => {
    for (const id of TIMED) {
      const plot = computeIndicator({ id, params: {} }, goldenBars(60), DEFAULT_PALETTE)
      expect(plot?.series, id).toEqual([])
      expect(plot?.kind, id).toBe("over")
    }
  })

  it("context lệch độ dài với nến cũng cho biểu đồ rỗng", () => {
    for (const id of TIMED) {
      const plot = computeIndicator({ id, params: {} }, goldenBars(60), DEFAULT_PALETTE, contextFor(59))
      expect(plot?.series, id).toEqual([])
    }
  })

  it("cả hai chỉ báo cần thời gian đều flashback: false", () => {
    for (const id of TIMED) expect(getIndicator(id)?.flashback, id).toBe(false)
  })

  it("chỉ báo không cần thời gian bỏ qua context", () => {
    const withContext = computeIndicator({ id: "wma", params: {} }, goldenBars(60), DEFAULT_PALETTE, contextFor(60))
    const without = computeIndicator({ id: "wma", params: {} }, goldenBars(60), DEFAULT_PALETTE)
    expect(withContext).toEqual(without)
  })

  it("bộ nhớ đệm: cùng dữ liệu và khung thì trúng, đổi khung hay thời gian thì tính lại", () => {
    const cache = createIndicatorCache()
    const bars = goldenBars(80)
    const input = { id: "vwap", params: {} }
    const intraday = contextFor(80, "5")
    const first = cache.get(input, bars, DEFAULT_PALETTE, intraday)
    expect(cache.get(input, bars, DEFAULT_PALETTE, intraday)).toBe(first)
    expect(cache.stats).toEqual({ hits: 1, tails: 0, fulls: 1 })
    const daily = cache.get(input, bars, DEFAULT_PALETTE, contextFor(80, "D"))
    expect(daily).not.toBe(first)
    expect(daily?.series[0].label).not.toBe(first?.series[0].label)
    // cùng độ dài, cùng khung nhưng thời gian khác (đổi mã): tính lại
    const shifted: IndicatorContext = { times: intraday.times.map((time) => time + 86_400 * 30), interval: "5" }
    expect(cache.get(input, bars, DEFAULT_PALETTE, shifted)).not.toBe(first)
    // không có context: rỗng và không ghi nhớ gì thêm
    const before = cache.stats
    expect(cache.get(input, bars, DEFAULT_PALETTE)?.series).toEqual([])
    expect(cache.stats).toEqual(before)
  })
})

// ---------------------------------------------------------------- tailMemory

/** Hai kết quả cùng khoá, offset, độ dài; số bằng nhau trong sai số, null trùng chỗ. */
function expectSamePlot(actual: IndicatorPlot | null, expected: IndicatorPlot | null, label: string): void {
  expect(actual, label).not.toBeNull()
  expect(expected, label).not.toBeNull()
  if (!actual || !expected) return
  expect(actual.series.map((item) => [item.key, item.offset ?? 0, item.style ?? "line"]), label).toEqual(expected.series.map((item) => [item.key, item.offset ?? 0, item.style ?? "line"]))
  const pairs: [string, readonly (number | null)[], readonly (number | null)[]][] = actual.series.map((item, index) => [item.key, item.values, expected.series[index].values])
  if (actual.histogram || expected.histogram) pairs.push(["histogram", actual.histogram?.values ?? [], expected.histogram?.values ?? []])
  for (const [key, a, b] of pairs) {
    expect(a.length, `${label}.${key} độ dài`).toBe(b.length)
    for (let index = 0; index < b.length; index += 1) {
      const x = a[index]
      const y = b[index]
      if (x === null || y === null) expect(x, `${label}.${key}[${index}]`).toBe(y)
      else if (!isClose(x, y, 1e-9)) expect(x, `${label}.${key}[${index}]`).toBeCloseTo(y, 9)
    }
  }
  expect(actual.cloud, label).toEqual(expected.cloud)
  expect(actual.range, label).toEqual(expected.range)
  expect(actual.levels, label).toEqual(expected.levels)
}

const ALL = goldenBars()
/** Đổi nến cuối (nến đang chạy): giá, biên độ và khối lượng. */
function revise(bars: readonly Bar[], factor: number): Bar[] {
  const last = bars[bars.length - 1]
  const price = last.close * factor
  return [...bars.slice(0, -1), { open: last.open, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, volume: Math.round(last.volume * (1 + (factor - 1) * 10)) }]
}

/** Bộ tham số khác mặc định cho từng chỉ báo, để khoá `tailMemory` được kiểm trên cả chu kỳ ngắn lẫn dài. */
const PARAM_SETS: Record<string, Record<string, number | string>[]> = {
  ichimoku: [{}, { conversion: 4, base: 8, spanB: 16, displacement: 8 }],
  supertrend: [{}, { period: 3, multiplier: 1.5 }],
  wma: [{}, { period: 5, source: "hl2" }],
  hma: [{}, { period: 16 }, { period: 5, source: "ohlc4" }],
  vwma: [{}, { period: 7, source: "hlc3" }],
  envelope: [{}, { period: 10, percent: 3, basis: "ema" }, { period: 6, percent: 2.5, basis: "sma", source: "high" }],
  aroon: [{}, { period: 5 }],
  trix: [{}, { period: 5 }],
  ultimate_oscillator: [{}, { short: 3, mid: 6, long: 12 }],
  awesome_oscillator: [{}, { fast: 3, slow: 8 }],
  momentum: [{}, { period: 4 }],
  std_dev: [{}, { period: 7, source: "low" }],
  accum_dist: [{}],
  volatility_ohlc: [{}, { period: 4, periodsPerYear: 1 }],
}

/** Chỉ báo cửa sổ hữu hạn (khai báo `tailMemory`): giá trị tại nến i chỉ phụ thuộc các nến i - m .. i. */
function windowedCases(): { id: string; params: Record<string, number | string> }[] {
  return Object.entries(PARAM_SETS).flatMap(([id, sets]) =>
    sets.flatMap((params) => {
      const resolved = resolveIndicatorParams(id, params)
      return resolved && indicatorTailMemory(id, resolved) !== null ? [{ id, params }] : []
    }),
  )
}

describe("khoá tailMemory của chỉ báo đợt 2", () => {
  it("cửa sổ hữu hạn khai báo bộ nhớ, đệ quy và theo thời gian thì không", () => {
    const memory = (id: string, params: Record<string, number | string> = {}) => indicatorTailMemory(id, resolveIndicatorParams(id, params)!)
    // cửa sổ N nến
    expect(memory("wma", { period: 9 })).toBe(8)
    expect(memory("vwma", { period: 20 })).toBe(19)
    expect(memory("std_dev", { period: 20 })).toBe(19)
    expect(memory("awesome_oscillator")).toBe(33)
    expect(memory("momentum", { period: 10 })).toBe(10)
    expect(memory("aroon", { period: 25 })).toBe(25)
    expect(memory("ultimate_oscillator")).toBe(28)
    expect(memory("volatility_ohlc", { period: 10 })).toBe(9)
    expect(memory("envelope", { period: 20, basis: "sma" })).toBe(19)
    expect(memory("ichimoku")).toBe(51)
    // HMA: nến i cần cửa sổ căn(N) của chuỗi thô, mỗi phần tử thô cần N nến: N + căn(N) - 2
    expect(memory("hma", { period: 9 })).toBe(9 + 3 - 2)
    expect(memory("hma", { period: 16 })).toBe(16 + 4 - 2)
    // đệ quy: cần cả chuỗi
    for (const id of ["supertrend", "trix", "accum_dist"]) expect(memory(id), id).toBeNull()
    expect(memory("envelope", { basis: "ema" })).toBeNull()
    // theo thời gian: kỳ dài tuỳ ý
    for (const id of TIMED) expect(memory(id), id).toBeNull()
  })

  it("giá trị ở nến cuối chỉ phụ thuộc đúng m + 1 nến cuối: tính trên lát cắt đó ra cùng giá trị (không khai báo thiếu)", () => {
    for (const { id, params } of windowedCases()) {
      const resolved = resolveIndicatorParams(id, params)!
      const memory = indicatorTailMemory(id, resolved)!
      for (const end of [140, 200, 239]) {
        const bars = ALL.slice(0, end + 1)
        if (bars.length <= memory + 1) continue
        const full = computeIndicator({ id, params }, bars)!
        const slice = computeIndicator({ id, params }, bars.slice(bars.length - 1 - memory))!
        for (const item of full.series) {
          const tail = slice.series.find((other) => other.key === item.key)!
          const expected = item.values[item.values.length - 1]
          const actual = tail.values[tail.values.length - 1]
          if (expected === null) expect(actual, `${id} ${JSON.stringify(params)} ${item.key} @${end}`).toBeNull()
          else expect(actual, `${id} ${JSON.stringify(params)} ${item.key} @${end}`).toBeCloseTo(expected, 9)
        }
        if (full.histogram) {
          const expected = full.histogram.values[full.histogram.values.length - 1]
          const actual = slice.histogram!.values[slice.histogram!.values.length - 1]
          if (expected === null) expect(actual, `${id} histogram`).toBeNull()
          else expect(actual, `${id} histogram`).toBeCloseTo(expected, 9)
        }
      }
    }
  })

  it("bước qua từng nến (nối thêm một nến, đổi nến cuối) luôn bằng tính lại từ đầu, với mọi bộ tham số", () => {
    for (const [id, sets] of Object.entries(PARAM_SETS)) {
      for (const params of sets) {
        const input = { id, params }
        const cache = createIndicatorCache()
        const start = 120
        expectSamePlot(cache.get(input, ALL.slice(0, start)), computeIndicator(input, ALL.slice(0, start)), `${id} đầu`)
        // nến cuối đang chạy
        for (const factor of [1.02, 0.96, 1.04, 1]) {
          const bars = revise(ALL.slice(0, start), factor)
          expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), `${id} ${JSON.stringify(params)} nến cuối x${factor}`)
        }
        // nối từng nến, thỉnh thoảng đổi nến cuối
        for (let length = start + 1; length <= start + 60; length += 1) {
          const bars = ALL.slice(0, length)
          expectSamePlot(cache.get(input, bars), computeIndicator(input, bars), `${id} ${JSON.stringify(params)} nối tới ${length}`)
          if (length % 4 === 0) {
            const edited = revise(bars, 1.03)
            expectSamePlot(cache.get(input, edited), computeIndicator(input, edited), `${id} ${JSON.stringify(params)} đổi nến cuối ở ${length}`)
          }
        }
        // nối nhiều nến một lần
        const jump = ALL.slice(0, start + 100)
        expectSamePlot(cache.get(input, jump), computeIndicator(input, jump), `${id} nhảy +40`)
      }
    }
  })

  it("chỉ báo cửa sổ hữu hạn thật sự đi đường đuôi, chỉ báo đệ quy thì không", () => {
    for (const { id, params } of windowedCases()) {
      const cache = createIndicatorCache()
      const input = { id, params }
      cache.get(input, ALL.slice(0, 200))
      cache.get(input, revise(ALL.slice(0, 200), 1.02))
      expect(cache.stats.tails, `${id} ${JSON.stringify(params)}`).toBe(1)
    }
    for (const id of ["supertrend", "trix", "accum_dist"]) {
      const cache = createIndicatorCache()
      cache.get({ id, params: {} }, ALL.slice(0, 200))
      cache.get({ id, params: {} }, revise(ALL.slice(0, 200), 1.02))
      expect(cache.stats, id).toEqual({ hits: 0, tails: 0, fulls: 2 })
    }
  })

  it("chuỗi lệch (Ichimoku) vẫn giữ offset và mây sau khi ghép đuôi", () => {
    const cache = createIndicatorCache()
    const input = { id: "ichimoku", params: {} }
    cache.get(input, ALL.slice(0, 150))
    const plot = cache.get(input, ALL.slice(0, 151))!
    expect(cache.stats.tails).toBe(1)
    expect(Object.fromEntries(plot.series.map((item) => [item.key, item.offset ?? 0]))).toEqual({ tenkan: 0, kijun: 0, senkou_a: 26, senkou_b: 26, chikou: -26 })
    expect(plot.cloud?.a).toBe("senkou_a")
    for (const item of plot.series) expect(item.values).toHaveLength(151)
  })
})

// ---------------------------------------------------------------- suy biến

describe("trường hợp suy biến: không bao giờ NaN hay Infinity, độ dài chuỗi bằng số nến", () => {
  const flat = (count: number): Bar[] => Array.from({ length: count }, () => bar(10, 10, 10, 10, 100))
  const noVolume = (count: number): Bar[] => goldenBars(count).map((item) => ({ ...item, volume: 0 }))
  const limitMoves = (count: number): Bar[] =>
    Array.from({ length: count }, (_, index) => {
      const price = 10 * 1.07 ** index
      return index % 2 === 0 ? bar(price, price, price, price, 50) : bar(price, price * 1.07, price, price * 1.07, 80)
    })
  const crash = (count: number): Bar[] => Array.from({ length: count }, (_, index) => bar(1000 / 2 ** index, 1000 / 2 ** index, 1000 / 2 ** (index + 1), 1000 / 2 ** (index + 1), 10))
  const dirty = (count: number): Bar[] =>
    goldenBars(count).map((item, index) => (index === 7 ? { open: Number.NaN, high: Number.POSITIVE_INFINITY, low: Number.NaN, close: Number.NaN, volume: Number.NaN } : item))

  const scenarios: [string, (count: number) => Bar[]][] = [
    ["giá đứng yên (cao = thấp = mở = đóng)", flat],
    ["khối lượng bằng 0", noVolume],
    ["kịch trần liên tục xen nến phẳng", limitMoves],
    ["giá giảm một nửa mỗi nến", crash],
    ["nến có NaN và Infinity", dirty],
  ]

  for (const id of NEW_IDS) {
    it(`${id}: mọi tình huống cho số hữu hạn hoặc null, đúng độ dài`, () => {
      for (const [name, make] of scenarios) {
        for (const count of [0, 1, 2, 5, 40, 120]) {
          const bars = make(count)
          const plot = computeIndicator({ id, params: {} }, bars, DEFAULT_PALETTE, contextFor(count))!
          expect(plot, `${id} ${name} @${count}`).not.toBeNull()
          const lists = [...plot.series.map((item) => item.values), ...(plot.histogram ? [plot.histogram.values] : [])]
          for (const values of lists) {
            expect(values, `${id} ${name} @${count} độ dài`).toHaveLength(count)
            expect(values.every((value) => value === null || Number.isFinite(value)), `${id} ${name} @${count} hữu hạn`).toBe(true)
          }
        }
      }
    })
  }

  it("giá đứng yên: TRIX, Momentum, Standard Deviation, Aroon cho 0 hoặc giá trị định nghĩa, Ultimate Oscillator và Volatility không NaN", () => {
    const bars = flat(80)
    const last = (id: string, key: string) => seriesOf(plotOf(id, {}, bars), key).values.at(-1)
    expect(last("trix", "trix")).toBe(0)
    expect(last("momentum", "momentum")).toBe(0)
    expect(last("std_dev", "std_dev")).toBe(0)
    expect(last("volatility_ohlc", "volatility")).toBe(0)
    expect(last("ultimate_oscillator", "uo")).toBeNull()
    expect(last("accum_dist", "ad")).toBe(0)
    // Aroon: mọi nến bằng nhau nên đỉnh và đáy đều là nến gần nhất
    expect(last("aroon", "up")).toBe(100)
    expect(last("aroon", "down")).toBe(100)
  })

  it("khối lượng bằng 0: VWMA và VWAP là null thay vì chia cho 0", () => {
    const bars = noVolume(60)
    expect(seriesOf(plotOf("vwma", {}, bars), "vwma").values.every((value) => value === null)).toBe(true)
    expect(seriesOf(plotOf("vwap", {}, bars), "vwap").values.every((value) => value === null)).toBe(true)
  })
})

// ---------------------------------------------------------------- cấu trúc từng chỉ báo

describe("cấu trúc vẽ và tham số của 16 chỉ báo", () => {
  it("đều đăng ký, mặc định hợp lệ, đúng nơi vẽ và có tên tiếng Việt cho mọi tham số", () => {
    const kinds: Record<string, "over" | "pane"> = {
      ichimoku: "over", vwap: "over", supertrend: "over", wma: "over", hma: "over", vwma: "over", envelope: "over", pivot_points: "over",
      aroon: "pane", trix: "pane", ultimate_oscillator: "pane", awesome_oscillator: "pane", momentum: "pane", std_dev: "pane", accum_dist: "pane", volatility_ohlc: "pane",
    }
    expect(Object.keys(kinds).sort()).toEqual([...NEW_IDS].sort())
    for (const id of NEW_IDS) {
      const definition = getIndicator(id)!
      expect(definition.kind, id).toBe(kinds[id])
      expect(definition.flashback, id).toBe(false)
      expect(validateIndicatorParams(id, {}), id).toBeNull()
      for (const spec of definition.params) expect(spec.label, `${id}.${spec.key}`).toBeTruthy()
    }
    expect(listIndicators().filter((definition) => NEW_IDS.includes(definition.id))).toHaveLength(16)
  })

  it("tham số chuỗi (nguồn giá, kỳ, loại đường giữa) chỉ nhận giá trị trong options và có nhãn", () => {
    expect(validateIndicatorParams("wma", { source: "hl2" })).toBeNull()
    expect(validateIndicatorParams("wma", { source: "vwap" })).toMatch(/một trong/)
    expect(validateIndicatorParams("wma", { source: 5 })).toMatch(/chuỗi/)
    expect(validateIndicatorParams("vwap", { anchor: "week" })).toBeNull()
    expect(validateIndicatorParams("vwap", { anchor: "hour" })).toMatch(/một trong/)
    expect(validateIndicatorParams("envelope", { basis: "wma" })).toMatch(/một trong/)
    const source = getIndicator("wma")!.params.find((spec) => spec.key === "source")!
    for (const option of source.options!) expect(source.optionLabels?.[option], option).toBeTruthy()
    const anchor = getIndicator("vwap")!.params.find((spec) => spec.key === "anchor")!
    expect(anchor.optionLabels?.auto).toBe("Tự động theo khung")
  })

  it("ràng buộc giữa các tham số: Awesome Oscillator nhanh < chậm, Ultimate Oscillator ngắn < vừa < dài, ngưỡng dưới < trên", () => {
    expect(validateIndicatorParams("awesome_oscillator", { fast: 34, slow: 5 })).toMatch(/nhỏ hơn/)
    expect(validateIndicatorParams("ultimate_oscillator", { short: 14, mid: 14 })).toMatch(/nhỏ hơn/)
    expect(validateIndicatorParams("ultimate_oscillator", { lower: 80, upper: 70 })).toMatch(/nhỏ hơn/)
    expect(validateIndicatorParams("ultimate_oscillator", {})).toBeNull()
  })

  it("Aroon và Ultimate Oscillator có miền 0-100; Awesome Oscillator và TRIX có vạch 0; Awesome Oscillator chỉ có histogram", () => {
    expect(plotOf("aroon").range).toEqual([0, 100])
    expect(plotOf("ultimate_oscillator").range).toEqual([0, 100])
    expect(plotOf("ultimate_oscillator").levelBand).toEqual({ lower: 30, upper: 70 })
    expect(plotOf("trix").zero).toBe(true)
    const ao = plotOf("awesome_oscillator")
    expect(ao.zero).toBe(true)
    expect(ao.series).toEqual([])
    expect(ao.histogram).toMatchObject({ upToken: "price-up", downToken: "price-down" })
    expect(ao.histogram?.values).toHaveLength(goldenBars().length)
  })

  it("Envelope có ba chuỗi (trên, dưới, giữa) và nhãn; Pivot Points 7 mức vẽ bậc; WMA, HMA, VWMA nhãn có chu kỳ", () => {
    expect(plotOf("envelope").series.map((item) => item.key)).toEqual(["upper", "lower", "middle"])
    expect(plotOf("wma", { period: 12 }).series[0].label).toBe("WMA 12")
    expect(plotOf("hma", { period: 21 }).series[0].label).toBe("HMA 21")
    expect(plotOf("vwma", { period: 30 }).series[0].label).toBe("VWMA 30")
    expect(plotOf("momentum", { period: 7 }).series[0].label).toBe("Mom 7")
  })

  it("nguồn giá đổi kết quả: WMA trên hl2 khác trên close", () => {
    const close = seriesOf(plotOf("wma", { period: 9 }), "wma").values
    const hl2 = seriesOf(plotOf("wma", { period: 9, source: "hl2" }), "wma").values
    expect(hl2.at(-1)).not.toBe(close.at(-1))
  })

  it("Ichimoku mặc định 9, 26, 52 và dời 26 như định nghĩa gốc", () => {
    const defaults = Object.fromEntries(getIndicator("ichimoku")!.params.map((spec) => [spec.key, spec.default]))
    expect(defaults).toEqual({ conversion: 9, base: 26, spanB: 52, displacement: 26 })
  })

  it("mặc định theo định nghĩa công khai: SuperTrend 10 x 3, Aroon 25, TRIX 18, UO 7 14 28, AO 5 34, Momentum 10, StdDev 20, Volatility 10 và 252", () => {
    const defaults = (id: string) => Object.fromEntries(getIndicator(id)!.params.map((spec) => [spec.key, spec.default]))
    expect(defaults("supertrend")).toEqual({ period: 10, multiplier: 3 })
    expect(defaults("aroon")).toEqual({ period: 25 })
    expect(defaults("trix")).toMatchObject({ period: 18 })
    expect(defaults("ultimate_oscillator")).toMatchObject({ short: 7, mid: 14, long: 28 })
    expect(defaults("awesome_oscillator")).toEqual({ fast: 5, slow: 34 })
    expect(defaults("momentum")).toMatchObject({ period: 10 })
    expect(defaults("std_dev")).toMatchObject({ period: 20 })
    expect(defaults("volatility_ohlc")).toEqual({ period: 10, periodsPerYear: 252 })
  })
})
