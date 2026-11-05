import { describe, expect, it } from "vitest"

import { createPaneCoords } from "./coords"
import { toHeikinAshi } from "./heikin-ashi"
import { createPriceScale, logRange, priceRange, shiftPriceRange, zoomPriceRange } from "./price-scale"
import { ICT_OFFSET, daysFromCivil } from "./calendar"
import { decimalsForStep, formatCompact, formatPercentAxis, formatVi, marketTimeTicks, niceStep, priceTicks, sessionTicks } from "./ticks"
import { createMarketTimeScale, createSessionTimeScale } from "./time-scale"

const ict = (year: number, month: number, day: number, hour = 0, minute = 0) => daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 - ICT_OFFSET

describe("thang giá tuyến tính, log, phần trăm", () => {
  const range = { low: 90, high: 130 }

  it("tuyến tính: đổi qua lại, giá cao ở đỉnh khung", () => {
    const scale = createPriceScale({ mode: "linear", range, top: 10, height: 400 })
    expect(scale.yOf(130)).toBe(10)
    expect(scale.yOf(90)).toBe(410)
    expect(scale.priceOf(scale.yOf(111.5))).toBeCloseTo(111.5)
  })

  it("log: khoảng cách theo tỷ lệ, 100 là trung điểm hình học của 50 và 200", () => {
    const scale = createPriceScale({ mode: "log", range: { low: 50, high: 200 }, top: 0, height: 300 })
    expect(scale.yOf(100)).toBeCloseTo(150)
    expect(scale.priceOf(scale.yOf(73.3))).toBeCloseTo(73.3)
  })

  it("log không vỡ khi giá thấp bằng 0 hoặc âm", () => {
    const scale = createPriceScale({ mode: "log", range: { low: 0, high: 100 }, top: 0, height: 300 })
    expect(Number.isFinite(scale.yOf(50))).toBe(true)
    expect(Number.isFinite(scale.yOf(0))).toBe(true)
  })

  it("phần trăm: giá trị trục là chênh lệch so với giá gốc, vị trí vẫn theo giá thật", () => {
    const scale = createPriceScale({ mode: "percent", range, base: 100, top: 0, height: 400 })
    expect(scale.axisValue(110)).toBeCloseTo(10)
    expect(scale.priceOfAxis(-5)).toBeCloseTo(95)
    const linear = createPriceScale({ mode: "linear", range, top: 0, height: 400 })
    expect(scale.yOf(110)).toBeCloseTo(linear.yOf(110))
  })

  it("dải giá suy biến (cao bằng thấp) vẫn dựng được thang", () => {
    const scale = createPriceScale({ mode: "linear", range: { low: 5, high: 5 }, top: 0, height: 100 })
    expect(scale.high).toBeGreaterThan(scale.low)
  })

  it("kéo tay trục giá: zoom giữ điểm neo, dịch theo giá", () => {
    const zoomed = zoomPriceRange({ low: 100, high: 120 }, 0.5, 0.25)
    expect(zoomed.high - zoomed.low).toBeCloseTo(10)
    expect(zoomed.high - 0.25 * 10).toBeCloseTo(120 - 0.25 * 20)
    expect(shiftPriceRange({ low: 100, high: 120 }, 3)).toEqual({ low: 103, high: 123 })
  })

  it("dải log chừa 6% theo tỷ lệ, không âm", () => {
    const range = logRange([{ high: 200, low: 50 }], 0)
    expect(range.low).toBeLessThan(50)
    expect(range.low).toBeGreaterThan(0)
    expect(Math.log(range.high / 200)).toBeCloseTo(Math.log(50 / range.low))
  })

  it("dải giá không đọc quá last (nến tương lai không kéo giãn trục)", () => {
    const bars = [{ high: 110, low: 100 }, { high: 120, low: 105 }, { high: 9999, low: 1 }]
    expect(priceRange(bars, 1).high).toBeLessThan(200)
  })
})

describe("vạch chia trục giá", () => {
  it("tuyến tính: bội của bước 1-2-5 nằm trong dải", () => {
    const scale = createPriceScale({ mode: "linear", range: { low: 91.3, high: 128.7 }, top: 0, height: 360 })
    const ticks = priceTicks(scale, 6)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    for (const tick of ticks) {
      expect(tick.price).toBeGreaterThanOrEqual(scale.low)
      expect(tick.price).toBeLessThanOrEqual(scale.high)
      expect(tick.price % tick.step).toBeCloseTo(0, 6)
    }
  })

  it("phần trăm: vạch ở bội của bước phần trăm, vị trí theo giá tương ứng", () => {
    const scale = createPriceScale({ mode: "percent", range: { low: 95, high: 112 }, base: 100, top: 0, height: 300 })
    const ticks = priceTicks(scale, 5)
    expect(ticks.some((tick) => tick.value === 0 && Math.abs(tick.price - 100) < 1e-9)).toBe(true)
  })

  it("log dải rộng: các mức 1-2-5 nhân luỹ thừa 10", () => {
    const scale = createPriceScale({ mode: "log", range: { low: 8, high: 1200 }, top: 0, height: 400 })
    const prices = priceTicks(scale, 6).map((tick) => tick.price)
    for (const price of prices) expect([1, 2, 5]).toContain(price / 10 ** Math.floor(Math.log10(price)))
    expect(prices).toContain(10)
    expect(prices).toContain(100)
  })

  it("log dải hẹp dùng bước tuyến tính", () => {
    const scale = createPriceScale({ mode: "log", range: { low: 25, high: 30 }, top: 0, height: 400 })
    const prices = priceTicks(scale, 6).map((tick) => tick.price)
    expect(prices.length).toBeGreaterThan(2)
    expect(prices.every((price) => price >= 25 && price <= 30)).toBe(true)
  })

  it("định dạng kiểu Việt Nam", () => {
    expect(formatVi(1234567.5, 1)).toBe("1.234.567,5")
    expect(formatVi(-0.004, 2)).toBe("0,00")
    expect(decimalsForStep(0.05)).toBe(2)
    expect(decimalsForStep(5)).toBe(0)
    expect(formatPercentAxis(2.5, 0.5)).toBe("+2,5%")
    expect(formatPercentAxis(-1, 1)).toBe("-1%")
    expect(formatCompact(1_250_000)).toBe("1,3M")
    expect(formatCompact(850_000)).toBe("850K")
    expect(niceStep(30, 5)).toBe(5)
    expect(niceStep(37, 5)).toBe(10)
  })
})

describe("nhãn trục thời gian market", () => {
  // 3 ngày khung 5 phút, mỗi ngày 51 nến.
  const times: number[] = []
  for (const day of [5, 6, 9]) for (let slot = 0; slot < 51; slot += 1) times.push(ict(2026, 11, day, 9, 0) + (slot < 30 ? slot * 300 : 3 * 3600 + (slot - 30) * 300 + 0))
  const scale = createMarketTimeScale(times, "5")

  it("đổi ngày có nhãn dd/MM, trong ngày có nhãn giờ, các nhãn cách nhau đủ xa", () => {
    const ticks = marketTimeTicks(scale, { from: -0.5, to: times.length - 0.5 }, 900, 72)
    const labels = ticks.map((tick) => tick.label)
    expect(labels).toContain("06/11")
    expect(labels).toContain("09/11")
    for (let index = 1; index < ticks.length; index += 1) expect((ticks[index].index - ticks[index - 1].index) * (900 / times.length)).toBeGreaterThanOrEqual(72 - 1e-6)
  })

  it("zoom gần thì hiện giờ", () => {
    const ticks = marketTimeTicks(scale, { from: 2.5, to: 28.5 }, 900, 72)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.every((tick) => /^\d\d:\d\d$/.test(tick.label))).toBe(true)
  })

  it("vùng ngoại suy sau nến cuối cũng có nhãn", () => {
    const ticks = marketTimeTicks(scale, { from: times.length - 40, to: times.length + 60 }, 900, 72)
    expect(ticks.some((tick) => tick.index >= times.length)).toBe(true)
  })

  it("khung ngày: đổi tháng ghi Th{tháng}, đổi năm ghi năm", () => {
    const days: number[] = []
    for (let day = 0; day < 120; day += 1) days.push(daysFromCivil(2025, 11, 1) * 86400 + day * 86400)
    const daily = createMarketTimeScale(days, "D")
    const labels = marketTimeTicks(daily, { from: -0.5, to: days.length - 0.5 }, 1000, 60).map((tick) => tick.label)
    expect(labels).toContain("2026")
    expect(labels.some((label) => /^Th\d+$/.test(label))).toBe(true)
  })
})

describe("nhãn trục theo phiên (Flashback)", () => {
  it("bước nguyên 1-2-5, chỉ trong các ô có thật, nhãn do formatX", () => {
    const ticks = sessionTicks({ from: -0.5, to: 89.5 }, 90, 900, (session) => `Phiên ${session + 1}`, 76)
    expect(ticks.length).toBeGreaterThan(2)
    expect(ticks[0].label).toBe(`Phiên ${ticks[0].index + 1}`)
    expect(ticks.every((tick) => tick.index >= 0 && tick.index < 90)).toBe(true)
  })

  it("không có phiên nào quá totalSlots", () => {
    const scale = createSessionTimeScale(40, 90)
    expect(scale.slots).toBe(90)
    const ticks = sessionTicks({ from: 60, to: 120 }, 90, 900, String)
    expect(Math.max(...ticks.map((tick) => tick.index))).toBeLessThan(90)
  })
})

describe("Heikin Ashi", () => {
  const bars = [
    { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 2, open: 11, high: 14, low: 10, close: 13, volume: 200 },
    { time: 3, open: 13, high: 13.5, low: 8, close: 9, volume: 300 },
  ]

  it("công thức: close trung bình OHLC, open trung bình nến HA trước, nến đầu (O+C)/2", () => {
    const ha = toHeikinAshi(bars)
    expect(ha[0].close).toBeCloseTo((10 + 12 + 9 + 11) / 4)
    expect(ha[0].open).toBeCloseTo(10.5)
    expect(ha[1].open).toBeCloseTo((ha[0].open + ha[0].close) / 2)
    expect(ha[1].close).toBeCloseTo((11 + 14 + 10 + 13) / 4)
    for (const bar of ha) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
    }
  })

  it("không đổi dữ liệu gốc, giữ time và khối lượng", () => {
    const copy = JSON.parse(JSON.stringify(bars))
    const ha = toHeikinAshi(bars)
    expect(bars).toEqual(copy)
    expect(ha.map((bar) => bar.time)).toEqual([1, 2, 3])
    expect(ha.map((bar) => bar.volume)).toEqual([100, 200, 300])
  })

  it("rỗng thì rỗng", () => {
    expect(toHeikinAshi([])).toEqual([])
  })
})

describe("PaneCoords", () => {
  const plot = { left: 0, top: 20, right: 800, bottom: 420 }
  const viewport = { from: -0.5, to: 99.5 }
  const priceScale = createPriceScale({ mode: "linear", range: { low: 90, high: 130 }, top: 20, height: 400 })

  it("market: chỉ số là tâm nến, neo theo time, đổi qua lại", () => {
    const times = Array.from({ length: 100 }, (_, index) => ict(2026, 11, 5, 9, 0) + index * 300)
    const coords = createPaneCoords({ viewport, plot, timeScale: createMarketTimeScale(times, "5"), priceScale })
    expect(coords.xOfIndex(0)).toBeCloseTo(4)
    expect(coords.xOfIndex(99)).toBeCloseTo(796)
    expect(Math.round(coords.indexOfX(coords.xOfIndex(42) + 2))).toBe(42)
    expect(coords.indexOfAnchor({ time: times[10], price: 100 })).toBe(10)
    expect(coords.anchorAt(10, 100)).toEqual({ time: times[10], price: 100 })
    expect(coords.priceOfY(coords.yOfPrice(105.5))).toBeCloseTo(105.5)
    expect(coords.plot).toBe(plot)
  })

  it("flashback: neo theo session, không nhận neo theo time", () => {
    const coords = createPaneCoords({ viewport, plot, timeScale: createSessionTimeScale(60, 100), priceScale })
    expect(coords.indexOfAnchor({ session: 5, price: 1 })).toBe(5)
    expect(coords.indexOfAnchor({ time: 5, price: 1 })).toBeNull()
    expect(coords.anchorAt(7.5, 100)).toEqual({ session: 7.5, price: 100 })
  })
})
