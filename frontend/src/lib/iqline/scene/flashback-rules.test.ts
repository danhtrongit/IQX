/**
 * Luật công bằng của chế độ Flashback (docs/iqline-design.md §12). Các test này là ràng buộc của game: nếu
 * một test ở đây phải sửa để qua, hãy hỏi lại vì sao.
 */
import { describe, expect, it } from "vitest"

import { clampViewport, panViewport, viewportLimits, visibleIndexRange, zoomViewport } from "../core/viewport"
import { createChartData, createFrame, naturalHeight } from "./model"
import { indexAtPointer, SceneBuilder } from "./builder"
import { valuesAtIndex } from "./values"
import { build, flashbackInput, frameOf, makeBars, ops, rectsOf, series, texts } from "./test-support"
import type { Bar, IndicatorPlot } from "../types"

const WARMUP = 10
const COUNT = 60
const SLOTS = 90

/** Nến warmup với giá cực đoan, để mọi rò rỉ đều lộ ra. */
function poisonedBars(): Bar[] {
  const real = makeBars(COUNT + WARMUP)
  return real.map((bar, index) => (index < WARMUP ? { open: 1e6, high: 2e6, low: 0.001, close: 1.5e6, volume: 9e9 } : bar))
}

const input = (extra: Parameters<typeof flashbackInput>[0] = {}) => flashbackInput({ bars: poisonedBars(), warmup: WARMUP, totalSlots: SLOTS, ...extra })

describe("Flashback: nến warmup không vẽ và không kéo tới được", () => {
  it("ChartData không giữ nến warmup: nến đầu tiên là nến sau warmup", () => {
    const bars = poisonedBars()
    const data = createChartData(input())
    expect(data.count).toBe(COUNT)
    expect(data.raw[0]).toEqual({ open: bars[WARMUP].open, high: bars[WARMUP].high, low: bars[WARMUP].low, close: bars[WARMUP].close, volume: bars[WARMUP].volume })
    expect(data.raw.every((bar) => bar.high < 1e5)).toBe(true)
    expect(data.bars.every((bar) => bar.volume < 1e6)).toBe(true)
  })

  it("trục giá và khối lượng không bị warmup kéo giãn, kể cả khi nhìn hết về bên trái", () => {
    const data = createChartData(input())
    const frame = frameOf(data, { viewport: { from: -0.5, to: SLOTS - 0.5 } })
    expect(frame.price.range.high).toBeLessThan(1000)
    expect(frame.price.range.low).toBeGreaterThan(0)
    expect(frame.panes[1].range.high).toBeLessThan(1e6)
  })

  it("không kéo, không zoom ra khỏi các ô thật: biên trái là nến đầu sau warmup", () => {
    const limits = viewportLimits({ slots: SLOTS, leftPad: 0, rightPad: 0, plotWidth: 738 })
    let view = { from: 20, to: 50 }
    for (let step = 0; step < 50; step += 1) view = panViewport(view, -100, limits)
    expect(view.from).toBe(-0.5)
    expect(visibleIndexRange(view, COUNT)?.first).toBe(0)
    expect(zoomViewport(view, 1e6, 10, limits).from).toBe(-0.5)
    expect(clampViewport({ from: -50, to: -10 }, limits).from).toBe(-0.5)
    // Và cũng không quá phía phải của trục.
    expect(panViewport({ from: 20, to: 50 }, 1e6, limits).to).toBe(SLOTS - 0.5)
  })

  it("scene dữ liệu không có hình nào ở bên trái nến đầu tiên", () => {
    const out = build(input(), { viewport: { from: -0.5, to: SLOTS - 0.5 } })
    const firstX = out.frame.price.coords.xOfIndex(0)
    const bodies = [...rectsOf(out.scene(), "price-up"), ...rectsOf(out.scene(), "price-down")]
    expect(bodies.length).toBeGreaterThan(COUNT)
    expect(Math.min(...bodies.map((rect) => rect[0]))).toBeGreaterThanOrEqual(firstX - out.frame.barPx)
  })

  it("chỉ báo tính trên cả warmup được cắt đúng số nến, giá trị khớp từng nến sau warmup", () => {
    const bars = poisonedBars()
    const values = bars.map((_, index) => index * 1.5)
    const plot: IndicatorPlot = {
      kind: "pane",
      series: [series("x", values)],
      histogram: { values, upToken: "price-up", downToken: "price-down" },
      markers: [
        { index: 3, token: "chart-1" },
        { index: WARMUP + 7, token: "chart-2" },
      ],
    }
    const data = createChartData(input({ indicators: [{ key: "x", name: "X", plot }] }))
    const prepared = data.indicators[0].plot
    expect(prepared.series[0].values).toHaveLength(COUNT)
    expect(prepared.series[0].values[0]).toBe(values[WARMUP])
    expect(prepared.histogram?.values[5]).toBe(values[WARMUP + 5])
    expect(prepared.markers).toEqual([{ index: 7, token: "chart-2" }])
  })

  it("trục chỉ báo ô riêng cũng không đọc warmup", () => {
    const bars = poisonedBars()
    const plot: IndicatorPlot = { kind: "pane", series: [series("x", bars.map((_, index) => (index < WARMUP ? 1e9 : 40 + (index % 9))))] }
    const frame = frameOf(createChartData(input({ indicators: [{ key: "x", name: "X", plot }] })))
    expect(frame.panes[2].range.high).toBeLessThan(100)
  })
})

describe("Flashback: không có thời gian thật", () => {
  it("dù đầu vào có trường time, dữ liệu bên trong và giá trị đọc ra không có thời gian", () => {
    const withTime = poisonedBars().map((bar, index) => ({ ...bar, time: 1_700_000_000 + index * 86400 }))
    const data = createChartData(input({ bars: withTime }))
    expect(data.raw.every((bar) => !("time" in bar))).toBe(true)
    expect(valuesAtIndex(data, 5)?.time).toBeNull()
    expect(data.timeScale.kind).toBe("session")
  })

  it("trục ngang chỉ có nhãn do formatX, không có ngày", () => {
    const out = build(input(), { formatX: (session) => `Phiên ${session}`, labelToken: "academy-label" })
    const baseline = out.frame.view.geometry.height - out.frame.view.geometry.axisBottom + 15
    const axis = texts(out.base()).filter((command) => command.y === baseline)
    expect(axis.length).toBeGreaterThan(2)
    expect(axis.every((command) => /^Phiên \d+$/.test(command.text))).toBe(true)
    // Crosshair cũng chỉ dùng formatX.
    const crosshair = texts(out.top({ x: out.frame.price.coords.xOfIndex(20), y: 100 }))
    expect(crosshair.some((command) => command.text === "Phiên 20")).toBe(true)
  })

  it("neo chỉ theo session; không đổi được neo theo time", () => {
    const frame = frameOf(createChartData(input()))
    expect(frame.price.coords.indexOfAnchor({ time: 1, price: 1 })).toBeNull()
    expect(frame.price.coords.indexOfAnchor({ session: 12, price: 1 })).toBe(12)
    expect(frame.price.coords.anchorAt(12, 100)).toEqual({ session: 12, price: 100 })
  })
})

describe("Flashback: ô tương lai không đọc được", () => {
  const data = createChartData(input())

  it("giá trị tại ô tương lai, ô âm hoặc ngoài trục là null; nến cuối đọc được", () => {
    expect(valuesAtIndex(data, COUNT)).toBeNull()
    expect(valuesAtIndex(data, SLOTS - 1)).toBeNull()
    expect(valuesAtIndex(data, -1)).toBeNull()
    expect(valuesAtIndex(data, Number.NaN)).toBeNull()
    expect(valuesAtIndex(data, COUNT - 1)?.bar).toEqual(data.raw[COUNT - 1])
    expect(valuesAtIndex(data, 0)?.previousClose).toBeNull()
  })

  it("giá trị chỉ báo ở ô tương lai cũng null", () => {
    const values = poisonedBars().map((_, index) => index)
    const plot: IndicatorPlot = { kind: "over", series: [series("x", values)] }
    const withIndicator = createChartData(input({ indicators: [{ key: "x", name: "X", plot }] }))
    expect(valuesAtIndex(withIndicator, COUNT - 1)?.series[0].value).toBe(values[WARMUP + COUNT - 1])
    expect(valuesAtIndex(withIndicator, COUNT)).toBeNull()
  })

  it("crosshair ở ô tương lai không vẽ gì, không có chữ", () => {
    const frame = frameOf(data)
    const builder = new SceneBuilder()
    const futureX = frame.price.coords.xOfIndex(COUNT + 5)
    expect(indexAtPointer(frame, { x: futureX, y: 100 })).toBeNull()
    expect(builder.top(frame, { x: futureX, y: 100 })).toEqual([])
    const pastX = frame.price.coords.xOfIndex(COUNT - 1)
    expect(builder.top(frame, { x: pastX, y: 100 }).length).toBeGreaterThan(0)
  })

  it("không hình nào của nến, khối lượng, chỉ báo nằm ở bên phải nến cuối", () => {
    const values = poisonedBars().map((_, index) => 50 + (index % 5))
    const plot: IndicatorPlot = { kind: "over", series: [series("x", values)] }
    const out = build(input({ indicators: [{ key: "x", name: "X", plot }] }))
    const limit = out.frame.price.coords.xOfIndex(COUNT - 1) + out.frame.barPx
    const scene = out.scene()
    for (const command of scene) {
      if (command.op === "rects") {
        for (let index = 0; index < command.count; index += 4) {
          if (command.token === "chart-1" && command.count === 4 && command.data[0] > out.frame.plot.right) continue // nhãn giá trục phải
          expect(command.data[index]).toBeLessThanOrEqual(limit)
        }
      }
      if (command.op === "polyline") for (let index = 0; index < command.count; index += 2) expect(command.data[index]).toBeLessThanOrEqual(limit)
    }
  })

  it("mặt nạ tương lai phủ đúng phần sau nến cuối, đủ các ô", () => {
    const out = build(input())
    const mask = out.base().find((command) => command.op === "rects" && command.alpha === 0.4)
    if (!mask || mask.op !== "rects") throw new Error("thiếu mặt nạ")
    expect(mask.data[0]).toBeGreaterThanOrEqual(out.frame.price.coords.xOfIndex(COUNT - 1))
    expect(mask.count).toBe(out.frame.panes.length * 4)
  })

  it("tổng số ô trên trục không bao giờ nhỏ hơn số nến đã mở", () => {
    const tight = createChartData(input({ totalSlots: 5 }))
    expect(tight.slots).toBe(COUNT)
  })
})

describe("Flashback: chiều cao ô v2.3", () => {
  it("canvas dài theo chartLayout; thêm ô chỉ báo thì dài thêm 100px + khoảng cách", () => {
    const base = createChartData(input())
    const plot: IndicatorPlot = { kind: "pane", series: [series("x", poisonedBars().map(() => 1))] }
    const one = createChartData(input({ indicators: [{ key: "x", name: "X", plot }] }))
    const zero = naturalHeight(base, { width: 800, available: 300 })
    const withPane = naturalHeight(one, { width: 800, available: 300 })
    expect(withPane - zero).toBe(100 + 10)
    const frame = createFrame(one, { viewport: { from: -0.5, to: SLOTS - 0.5 }, priceScaleMode: "linear", geometry: { width: 800, height: withPane, dpr: 1, axisRight: 62, axisBottom: 22 } })
    expect(frame.layout.height).toBe(withPane)
    expect(frame.layout.panes.map((pane) => pane.height)).toEqual([320, 80, 100])
  })

  it("scene chỉ có hai nhóm clip (giá, khối lượng) khi chưa có chỉ báo riêng", () => {
    const scene = build(input()).scene()
    expect(ops(scene, "clip")).toHaveLength(2)
  })
})
