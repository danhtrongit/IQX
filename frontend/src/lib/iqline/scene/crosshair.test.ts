import { describe, expect, it } from "vitest"

import { indexAtPointer } from "./builder"
import { valuesAtIndex } from "./values"
import { build, flashbackInput, makeTimedBarsCache, marketInput, movingAverage, overlay, rectsOf, texts } from "./test-support"
import { ict } from "./test-support"

describe("giá trị tại một chỉ số (crosshair và chú giải)", () => {
  it("market: nến thật, thay đổi so với nến trước, thời gian và giá trị chỉ báo", () => {
    const bars = makeTimedBarsCache()
    const ma = overlay("ma5", bars, 5)
    const { data } = build(marketInput({ bars, indicators: [ma] }))
    const values = valuesAtIndex(data, 30)
    expect(values?.bar.close).toBe(bars[30].close)
    expect(values?.previousClose).toBe(bars[29].close)
    expect(values?.change).toBeCloseTo(bars[30].close - bars[29].close)
    expect(values?.changePct).toBeCloseTo(((bars[30].close - bars[29].close) / bars[29].close) * 100)
    expect(values?.time).toBe(bars[30].time)
    expect(values?.series[0]).toMatchObject({ indicatorKey: "ma5", seriesKey: "ma", value: movingAverage(bars, 5)[30] })
    expect(valuesAtIndex(data, 2)?.series[0].value).toBeNull()
  })

  it("nến Heikin Ashi: chú giải vẫn đọc giá thật", () => {
    const bars = makeTimedBarsCache()
    const { data } = build(marketInput({ bars, chartType: "heikin-ashi" }))
    expect(valuesAtIndex(data, 50)?.bar.close).toBe(bars[50].close)
  })

  it("market: ô trống sau nến cuối và trước nến đầu không có giá trị; chỉ số lẻ làm tròn về nến gần nhất", () => {
    const { data } = build(marketInput())
    expect(valuesAtIndex(data, data.count)).toBeNull()
    expect(valuesAtIndex(data, -1)).toBeNull()
    expect(valuesAtIndex(data, 10.4)?.index).toBe(10)
    expect(valuesAtIndex(data, 10.6)?.index).toBe(11)
  })

  it("histogram được đọc với màu theo dấu", () => {
    const bars = makeTimedBarsCache()
    const values = bars.map((_, index) => (index % 2 === 0 ? 2 : -2))
    const { data } = build(marketInput({ bars, indicators: [{ key: "h", name: "MACD", plot: { kind: "pane", series: [], histogram: { values, upToken: "price-up", downToken: "price-down" } } }] }))
    expect(valuesAtIndex(data, 4)?.series[0]).toMatchObject({ seriesKey: "histogram", token: "price-up", value: 2 })
    expect(valuesAtIndex(data, 5)?.series[0]).toMatchObject({ token: "price-down", value: -2 })
  })
})

describe("crosshair (lớp trên cùng)", () => {
  it("market: vạch dọc căn giữa nến qua mọi ô, vạch ngang theo con trỏ, nhãn giá ở trục phải và nhãn thời gian ở đáy", () => {
    const out = build(marketInput())
    const x = out.frame.price.coords.xOfIndex(40) + 1.2
    const y = out.frame.price.box.top + 100
    const scene = out.top({ x, y })
    const lines = scene.find((command) => command.op === "lines")
    if (!lines || lines.op !== "lines") throw new Error("thiếu vạch")
    expect(lines.dash).toBeDefined()
    expect(lines.data[0]).toBe(Math.round(out.frame.price.coords.xOfIndex(40)))
    expect(lines.count).toBe(out.frame.panes.length * 4 + 4)
    expect(Array.from(lines.data.subarray(lines.count - 4, lines.count))).toEqual([0, y, out.frame.plot.right, y])
    const labels = texts(scene)
    expect(labels).toHaveLength(2)
    expect(labels[1].text).toBe("05/11/2026 12:20")
    expect(rectsOf(scene, "foreground")).toHaveLength(2)
    expect(labels.every((label) => label.token === "background")).toBe(true)
  })

  it("chỉ số được chọn theo nến dưới con trỏ, kể cả giữa hai nến", () => {
    const out = build(marketInput())
    const between = (out.frame.price.coords.xOfIndex(10) + out.frame.price.coords.xOfIndex(11)) / 2 - 0.01
    expect(indexAtPointer(out.frame, { x: between, y: 10 })).toBe(10)
    expect(indexAtPointer(out.frame, { x: out.frame.plot.right + 5, y: 10 })).toBeNull()
  })

  it("market: ô trống sau nến cuối vẫn có crosshair, nhãn thời gian là phần ngoại suy theo phiên", () => {
    const bars = makeTimedBarsCache()
    const out = build(marketInput({ bars }), { viewport: { from: 80, to: 160 } })
    const futureIndex = bars.length + 3
    const scene = out.top({ x: out.frame.price.coords.xOfIndex(futureIndex), y: out.frame.price.box.top + 50 })
    expect(scene.length).toBeGreaterThan(0)
    const timeLabel = texts(scene).at(-1)!.text
    // 120 nến 5 phút từ 09:00: nến cuối 09:00 + 119 * 5 phút rơi vào khung sáng và chiều; ô thứ ba sau nến cuối.
    expect(timeLabel).toMatch(/^\d\d\/\d\d\/2026 \d\d:\d\d$/)
    expect(valuesAtIndex(out.data, futureIndex)).toBeNull()
    expect(ict(2026, 11, 5, 9)).toBeLessThan(out.data.timeScale.kind === "market" ? out.data.timeScale.timeOfIndex(futureIndex) : 0)
  })

  it("thang phần trăm: nhãn giá ở trục phải là phần trăm", () => {
    const out = build(marketInput(), { priceScaleMode: "percent" })
    const scene = out.top({ x: 300, y: out.frame.price.box.top + 60 })
    expect(texts(scene)[0].text).toMatch(/%$/)
  })

  it("không có con trỏ thì không có gì để vẽ", () => {
    expect(build(marketInput()).top(null)).toEqual([])
  })

  it("nhãn thời gian không tràn ra ngoài canvas", () => {
    const out = build(marketInput())
    const scene = out.top({ x: 2, y: 50 })
    const box = scene.filter((command) => command.op === "rects")[1]
    if (!box || box.op !== "rects") throw new Error("thiếu nhãn")
    expect(box.data[0]).toBeGreaterThanOrEqual(0)
    expect(box.data[0] + box.data[2]).toBeLessThanOrEqual(out.frame.view.geometry.width)
  })

  it("flashback dùng formatX cho nhãn đáy, không có ngày", () => {
    const out = build(flashbackInput(), { formatX: (session) => `Phiên ${session + 1}` })
    const scene = out.top({ x: out.frame.price.coords.xOfIndex(7), y: out.frame.price.box.top + 20 })
    expect(texts(scene).at(-1)!.text).toBe("Phiên 8")
  })
})
