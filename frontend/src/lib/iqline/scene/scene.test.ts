import { describe, expect, it } from "vitest"

import { build, flashbackInput, makeBars, makeTimedBars2, makeTimedBarsCache, marketInput, movingAverage, ops, overlay, rectsOf, series, snapshot, texts, tokens } from "./test-support"
import { INDICATOR_PALETTE, LEVELS_PALETTE, indicatorPalette } from "./colors"
import type { ChartType, IndicatorPlot } from "../types"
import type { SceneIndicator } from "./model"

const CHART_TYPES: ChartType[] = ["candles", "hollow", "ohlc", "line", "area", "heikin-ashi"]

describe("scene: sáu kiểu hiển thị", () => {
  it.each(CHART_TYPES)("%s: có lệnh vẽ cho ô giá, cắt theo ô và cân bằng clip", (chartType) => {
    const scene = build(marketInput({ chartType })).scene()
    expect(ops(scene, "clip").length).toBe(ops(scene, "unclip").length)
    expect(ops(scene, "clip").length).toBe(2)
    const price = scene.slice(1, scene.findIndex((command) => command.op === "unclip"))
    expect(price.length).toBeGreaterThan(0)
  })

  it.each(["candles", "hollow", "ohlc", "heikin-ashi"] as ChartType[])("%s: nến chỉ dùng price-up và price-down (không dùng màu chart)", (chartType) => {
    const scene = build(marketInput({ chartType })).scene()
    const price = scene.slice(1, scene.findIndex((command) => command.op === "unclip"))
    const used = new Set(tokens(price).filter((token) => token !== "chart-1"))
    expect([...used].every((token) => token === "price-up" || token === "price-down")).toBe(true)
    expect(used.size).toBe(2)
  })

  it("nến: thân và bấc đủ số lượng, nến tăng ở price-up, nến giảm ở price-down", () => {
    const { data, scene } = (() => {
      const out = build(marketInput({ count: 40 }))
      return { data: out.data, scene: out.scene() }
    })()
    const ups = data.raw.filter((bar) => bar.close >= bar.open).length
    const wicks = rectsOf(scene, "price-up").length + rectsOf(scene, "price-down").length
    // Mỗi nến một bấc và một thân; khối lượng cũng dùng hai token này.
    expect(wicks).toBeGreaterThanOrEqual(80 + 40)
    expect(rectsOf(scene, "price-up").length).toBeGreaterThanOrEqual(ups * 2)
  })

  it("nến rỗng: nến tăng chỉ có viền (bốn cạnh), nến giảm tô đặc", () => {
    const bars = [
      { open: 100, high: 110, low: 95, close: 105, volume: 1 },
      { open: 105, high: 108, low: 90, close: 92, volume: 1 },
    ]
    const timed = bars.map((bar, index) => ({ ...bar, time: 1_700_000_000 + index * 300 }))
    const scene = build({ mode: "market", chartType: "hollow", bars: timed, interval: "5", indicators: [] }, { viewport: { from: -0.5, to: 1.5 } }).scene()
    const price = scene.slice(1, scene.findIndex((command) => command.op === "unclip"))
    const upRects = rectsOf(price, "price-up")
    const downRects = rectsOf(price, "price-down")
    // price-up: một bấc + bốn cạnh viền; price-down: một bấc + một thân đặc.
    expect(upRects).toHaveLength(5)
    expect(downRects).toHaveLength(2)
  })

  it("OHLC: mỗi thanh có thân dọc và hai vạch open, close", () => {
    const scene = build(marketInput({ chartType: "ohlc", count: 30 })).scene()
    const price = scene.slice(1, scene.findIndex((command) => command.op === "unclip"))
    expect(rectsOf(price, "price-up").length + rectsOf(price, "price-down").length).toBe(30 * 3)
  })

  it("đường: một polyline chart-1 qua giá đóng cửa; vùng: thêm polygon một màu mờ, không gradient", () => {
    const line = build(marketInput({ chartType: "line" })).scene()
    const polylines = ops(line, "polyline")
    expect(polylines).toHaveLength(1)
    expect(tokens(polylines)).toEqual(["chart-1"])
    const area = build(marketInput({ chartType: "area" })).scene()
    const polygons = ops(area, "polygon")
    expect(polygons).toHaveLength(1)
    expect(polygons[0]).toMatchObject({ token: "chart-1", alpha: 0.15 })
  })

  it("Heikin Ashi vẽ nến đã đổi nhưng khối lượng và chú giải theo nến thật", () => {
    const out = build(marketInput({ chartType: "heikin-ashi" }))
    expect(out.data.bars).not.toBe(out.data.raw)
    expect(out.data.bars[5].close).not.toBe(out.data.raw[5].close)
    expect(out.data.raw[5].close).toBe(makeBars(120)[5].close)
  })

  it("gộp theo cột pixel khi nến hẹp dưới 1px: số hình bị chặn theo bề rộng, không theo số nến", () => {
    const merged = build(marketInput({ count: 20_000 }), { viewport: { from: -0.5, to: 19_999.5 }, geometry: { width: 800 } })
    const scene = merged.scene()
    const price = scene.slice(1, scene.findIndex((command) => command.op === "unclip"))
    const rects = rectsOf(price, "price-up").length + rectsOf(price, "price-down").length
    expect(rects).toBeLessThanOrEqual(740 + 2)
    expect(merged.frame.barPx).toBeLessThan(1)
  })

  it("bỏ tô vùng khi đang gộp nến", () => {
    const area: IndicatorPlot = { kind: "over", series: [series("u", makeBars(20_000).map((bar) => bar.high), "chart-1", { style: "area" }), series("l", makeBars(20_000).map((bar) => bar.low), "chart-1", { style: "area" })] }
    const scene = build(marketInput({ count: 20_000, indicators: [{ key: "bb", name: "BB", plot: area }] }), { viewport: { from: -0.5, to: 19_999.5 } }).scene()
    expect(ops(scene, "polygon")).toHaveLength(0)
    const zoomed = build(marketInput({ count: 200, indicators: [{ key: "bb", name: "BB", plot: { kind: "over", series: [series("u", makeBars(200).map((bar) => bar.high), "chart-1", { style: "area" }), series("l", makeBars(200).map((bar) => bar.low), "chart-1", { style: "area" })] } }] })).scene()
    expect(ops(zoomed, "polygon")).toHaveLength(1)
  })

  it("lệnh vẽ tính theo pixel thiết bị: dpr 2 nhân đôi toạ độ", () => {
    const one = build(marketInput({ count: 30, chartType: "line" })).scene()
    const two = build(marketInput({ count: 30, chartType: "line" }), { geometry: { dpr: 2 } }).scene()
    const a = ops(one, "polyline")[0]
    const b = ops(two, "polyline")[0]
    if (a.op !== "polyline" || b.op !== "polyline") throw new Error("thiếu polyline")
    expect(b.data[0]).toBeCloseTo(a.data[0] * 2)
    expect(b.data[1]).toBeCloseTo(a.data[1] * 2)
  })

  it("thuần: cùng đầu vào cho cùng danh sách lệnh", () => {
    const input = marketInput({ indicators: [overlay("ma20", makeBars(120), 20)] })
    expect(snapshot(build(input).scene())).toEqual(snapshot(build(input).scene()))
    expect(snapshot(build(input).base())).toEqual(snapshot(build(input).base()))
  })
})

describe("scene: khối lượng và chỉ báo", () => {
  it("khối lượng: cột price-up và price-down mờ, trong ô khối lượng", () => {
    const out = build(marketInput({ count: 50 }))
    const scene = out.scene()
    const volumePane = out.frame.panes[1]
    const volumeRects = scene.filter((command) => command.op === "rects" && command.alpha === 0.55)
    expect(tokens(volumeRects).sort()).toEqual(["price-down", "price-up"])
    for (const command of volumeRects) {
      if (command.op !== "rects") continue
      for (let index = 0; index < command.count; index += 4) {
        const y = command.data[index + 1]
        const height = command.data[index + 3]
        expect(y).toBeGreaterThanOrEqual(volumePane.box.top - 1)
        expect(y + height).toBeLessThanOrEqual(volumePane.box.top + volumePane.box.height + 1)
      }
    }
  })

  it("MA trên ô giá không kéo giãn trục giá (v2.3 §3)", () => {
    const bars = makeBars(120)
    const far = { kind: "over" as const, series: [series("x", bars.map(() => 10_000), "chart-6")] }
    const plain = build(marketInput())
    const withFar = build(marketInput({ indicators: [{ key: "far", name: "FAR", plot: far }] }))
    expect(withFar.frame.price.range).toEqual(plain.frame.price.range)
  })

  it("đường tuyến tính ngoài khung có nhãn mép phải kèm mũi tên", () => {
    const bars = makeBars(120)
    const above: SceneIndicator = { key: "m1", id: "ma", name: "MA 5", plot: { kind: "over", series: [series("ma", bars.map(() => 10_000), "chart-1", { label: "MA 5" })] } }
    const below: SceneIndicator = { key: "m2", id: "ema", name: "EMA 50", plot: { kind: "over", series: [series("ema", bars.map(() => 1), "chart-2", { label: "EMA 50" })] } }
    const scene = build(marketInput({ indicators: [above, below] })).scene()
    const labels = texts(scene).filter((command) => command.text.includes("↑") || command.text.includes("↓"))
    expect(labels.map((command) => command.text.slice(0, 5))).toEqual(["MA 5 ", "EMA 5"])
    expect(labels.map((command) => command.token)).toEqual(["chart-1", "chart-2"])
  })

  it("chỉ báo ẩn không vẽ đường; chỉ báo ô riêng ẩn vẫn giữ ngưỡng", () => {
    const bars = makeBars(120)
    const visible = build(marketInput({ indicators: [overlay("ma20", bars, 20)] })).scene()
    const hidden = build(marketInput({ indicators: [{ ...overlay("ma20", bars, 20), hidden: true }] })).scene()
    expect(ops(visible, "polyline").length).toBeGreaterThan(ops(hidden, "polyline").length)
    const rsi: IndicatorPlot = { kind: "pane", series: [series("rsi", bars.map((_, index) => 50 + Math.sin(index / 5) * 20))], range: [0, 100], levels: [{ key: "l", value: 30, label: "30" }, { key: "u", value: 70, label: "70" }], levelBand: { lower: 30, upper: 70 } }
    const shown = build(marketInput({ indicators: [{ key: "rsi", name: "RSI", plot: rsi }] })).scene()
    const off = build(marketInput({ indicators: [{ key: "rsi", name: "RSI", plot: rsi, hidden: true }] })).scene()
    expect(ops(shown, "polyline").length).toBe(1)
    expect(ops(off, "polyline").length).toBe(0)
    expect(ops(off, "lines").some((command) => command.op === "lines" && command.token === "chart-5" && command.dash)).toBe(true)
  })

  it("RSI: dải 30-70, ngưỡng nét đứt có nhãn, đường cắt trong ô riêng; trục cố định 0-100", () => {
    const bars = makeBars(120)
    const rsi: IndicatorPlot = { kind: "pane", series: [series("rsi", bars.map((_, index) => 50 + Math.sin(index / 5) * 20))], range: [0, 100], levels: [{ key: "l", value: 30, label: "30" }, { key: "u", value: 70, label: "70" }], levelBand: { lower: 30, upper: 70 } }
    const out = build(marketInput({ indicators: [{ key: "rsi", name: "RSI", plot: rsi }] }))
    const pane = out.frame.panes[2]
    expect(pane.range).toEqual({ low: 0, high: 100 })
    const scene = out.scene()
    expect(texts(scene).map((command) => command.text)).toEqual(expect.arrayContaining(["30", "70"]))
    const band = scene.find((command) => command.op === "rects" && command.alpha === 0.07)
    expect(band).toBeDefined()
  })

  it("MACD: histogram theo upToken/downToken, vạch 0, trục theo cả histogram", () => {
    const bars = makeBars(120)
    const values = bars.map((_, index) => Math.sin(index / 4) * 3)
    const macd: IndicatorPlot = {
      kind: "pane",
      series: [series("macd", values.map((value) => value * 0.8)), series("signal", values.map((value) => value * 0.6), "chart-2")],
      histogram: { values, upToken: "price-up", downToken: "price-down" },
      zero: true,
    }
    const out = build(marketInput({ indicators: [{ key: "macd", name: "MACD", plot: macd }] }))
    const pane = out.frame.panes[2]
    expect(pane.range.high).toBeGreaterThan(3)
    expect(pane.range.low).toBeLessThan(-3)
    const scene = out.scene()
    expect(scene.some((command) => command.op === "rects" && command.alpha === 0.6 && command.token === "price-up")).toBe(true)
    expect(scene.some((command) => command.op === "rects" && command.alpha === 0.6 && command.token === "price-down")).toBe(true)
    expect(scene.some((command) => command.op === "lines" && command.token === "border")).toBe(true)
  })

  it("chuỗi dash có nét đứt, dots là chấm vuông, hai chuỗi area tô dải giữa chúng", () => {
    const bars = makeBars(120)
    const plot: IndicatorPlot = {
      kind: "over",
      series: [
        series("a", movingAverage(bars, 5), "chart-1", { style: "dash" }),
        series("b", movingAverage(bars, 8), "chart-2", { style: "dots" }),
        series("u", bars.map((bar) => bar.high + 2), "chart-5", { style: "area" }),
        series("l", bars.map((bar) => bar.low - 2), "chart-5", { style: "area" }),
      ],
    }
    const scene = build(marketInput({ indicators: [{ key: "x", name: "X", plot }] })).scene()
    expect(ops(scene, "polyline").some((command) => command.op === "polyline" && command.dash !== undefined)).toBe(true)
    expect(rectsOf(scene, "chart-2").length).toBeGreaterThan(50)
    expect(ops(scene, "polygon")).toHaveLength(1)
  })

  it("Volume Profile: cột ngang price-up và price-down trên ô giá, ở mép trái", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ low: 100 + index, high: 101 + index, up: 0.4, down: 0.3 }))
    const plot: IndicatorPlot = { kind: "over", series: [], profile: { rows } }
    const out = build(marketInput({ indicators: [{ key: "vp", name: "VP", plot }] }))
    const scene = out.scene()
    const up = scene.filter((command) => command.op === "rects" && command.alpha === 0.35 && command.token === "price-up")
    expect(up).toHaveLength(1)
    const rects = rectsOf(scene, "price-up").filter((rect) => rect[0] === 0)
    expect(rects.length).toBeGreaterThan(0)
  })

  it("markers do chỉ báo cung cấp được vẽ thành chấm; MA Cross tự khoanh điểm cắt", () => {
    const bars = makeBars(120)
    const fast = movingAverage(bars, 5)
    const slow = movingAverage(bars, 20)
    const cross: IndicatorPlot = { kind: "over", series: [series("f", fast), series("s", slow, "chart-2")], cross: ["f", "s"] }
    const autoScene = build(marketInput({ indicators: [{ key: "x", name: "X", plot: cross }] })).scene()
    const rings = ops(autoScene, "circle")
    expect(rings.length).toBeGreaterThan(0)
    expect(rings.every((command) => command.op === "circle" && !command.fill && (command.token === "price-up" || command.token === "price-down"))).toBe(true)
    const explicit: IndicatorPlot = { kind: "over", series: [series("f", fast)], markers: [{ index: 30, token: "chart-2", label: "B" }] }
    const scene = build(marketInput({ indicators: [{ key: "y", name: "Y", plot: explicit }] })).scene()
    expect(ops(scene, "circle")).toHaveLength(1)
    expect(texts(scene).some((command) => command.text === "B")).toBe(true)
  })
})

describe("scene: đường tham chiếu, trần, sàn và đánh dấu", () => {
  it("vạch đứt price-ref, price-ceiling, price-floor và nhãn ở trục phải", () => {
    const bars = makeBars(120)
    const mid = bars[119].close
    const priceLevels = { reference: mid, ceiling: mid + 3, floor: mid - 3 }
    const scene = build(marketInput({ priceLevels })).scene()
    for (const token of ["price-ref", "price-ceiling", "price-floor"]) {
      expect(scene.some((command) => command.op === "lines" && command.token === token && command.dash)).toBe(true)
      expect(texts(scene).some((command) => command.token === token)).toBe(true)
    }
  })

  it("vạch ngoài khung nhìn không được vẽ", () => {
    const scene = build(marketInput({ priceLevels: { ceiling: 99_999 } })).scene()
    expect(scene.some((command) => command.op === "lines" && command.token === "price-ceiling")).toBe(false)
  })

  it("tin AI (market): chấm theo token sắc thái ở đúng nến, tin cùng nến xếp chồng", () => {
    const bars = makeTimedBarsCache()
    const marks = [
      { id: 1, time: bars[40].time, label: "B", token: "price-up" as const },
      { id: 2, time: bars[40].time, label: "S", token: "price-down" as const },
      { id: 3, time: bars[10].time, label: "N", token: "chart-5" as const },
    ]
    const out = build(marketInput({ bars, marks }))
    const circles = ops(out.scene(), "circle")
    expect(circles).toHaveLength(3)
    const stacked = circles.filter((command) => command.op === "circle" && Math.abs(command.x - out.frame.price.coords.xOfIndex(40)) < 1)
    expect(stacked).toHaveLength(2)
    expect(new Set(stacked.map((command) => (command.op === "circle" ? command.y : 0))).size).toBe(2)
  })

  it("điểm đặt lệnh Flashback: mua tam giác lên price-up, bán tam giác xuống price-down, đóng là vòng", () => {
    const markers = [
      { session: 20, side: "buy" as const },
      { session: 30, side: "sell" as const },
      { session: 40, side: "close" as const, price: 105 },
    ]
    const scene = build(flashbackInput({ markers })).scene()
    const polygons = ops(scene, "polygon")
    expect(tokens(polygons).sort()).toEqual(["price-down", "price-up"])
    expect(ops(scene, "circle")).toHaveLength(1)
  })
})

describe("scene: lưới, trục và mặt nạ tương lai", () => {
  it("nhãn trục dùng labelToken: Flashback và Học viện academy-label, nơi khác muted-foreground", () => {
    const market = build(marketInput()).base()
    expect(new Set(texts(market).map((command) => command.token))).toEqual(new Set(["muted-foreground"]))
    const flash = build(flashbackInput(), { labelToken: "academy-label", formatX: (session) => `Phiên ${session}` }).base()
    expect(new Set(texts(flash).filter((command) => command.text !== "?").map((command) => command.token))).toEqual(new Set(["academy-label"]))
  })

  it("lưới dùng token border, nhãn trục 11px nhân dpr, số căn đều", () => {
    const scene = build(marketInput(), { geometry: { dpr: 2 } }).base()
    expect(scene.some((command) => command.op === "lines" && command.token === "border")).toBe(true)
    const axis = texts(scene).filter((command) => command.tabular)
    expect(axis.length).toBeGreaterThan(3)
    expect(axis.every((command) => command.size === 22)).toBe(true)
  })

  it("mặt nạ tương lai: chỉ ở Flashback, phủ từ ô đầu tiên chưa mở tới hết trục, mọi ô, kèm dấu hỏi", () => {
    const out = build(flashbackInput())
    const scene = out.base()
    const mask = scene.find((command) => command.op === "rects" && command.alpha === 0.4)
    if (!mask || mask.op !== "rects") throw new Error("thiếu mặt nạ")
    expect(mask.count).toBe(out.frame.panes.length * 4)
    const firstFutureEdge = out.frame.price.coords.xOfIndex(out.data.count - 0.5)
    expect(mask.data[0]).toBeCloseTo(firstFutureEdge, 0)
    expect(texts(scene).some((command) => command.text === "?")).toBe(true)
    const market = build(marketInput()).base()
    expect(market.some((command) => command.op === "rects" && command.alpha === 0.4)).toBe(false)
  })

  it("không có mặt nạ khi mọi ô đã mở", () => {
    const scene = build(flashbackInput({ bars: makeBars(100), warmup: 10, totalSlots: 90 })).base()
    expect(scene.some((command) => command.op === "rects" && command.alpha === 0.4)).toBe(false)
  })

  it("vạch đứt giữa phần xem và phần chơi (Flashback)", () => {
    const out = build(flashbackInput({ divider: 30 }))
    const dashed = out.base().filter((command) => command.op === "lines" && command.dash)
    expect(dashed).toHaveLength(1)
    const line = dashed[0]
    if (line.op !== "lines") throw new Error("thiếu vạch")
    expect(line.count).toBe(4)
    expect(line.data[0]).toBeCloseTo(out.frame.price.coords.xOfIndex(29.5), 0)
  })

  it("market khung trong ngày: vạch ngăn đứt khi nhảy ngày, nhãn đổi ngày dd/MM", () => {
    const bars = makeTimedBars2()
    const scene = build(marketInput({ bars })).base()
    expect(scene.some((command) => command.op === "lines" && command.dash)).toBe(true)
    expect(texts(scene).some((command) => /^\d\d\/\d\d$/.test(command.text))).toBe(true)
  })

  it("thang phần trăm: nhãn trục có dấu %, thang log vẫn có vạch", () => {
    const percent = build(marketInput(), { priceScaleMode: "percent" }).base()
    expect(texts(percent).some((command) => command.text.endsWith("%"))).toBe(true)
    const log = build(marketInput(), { priceScaleMode: "log" })
    expect(log.frame.price.scale.mode).toBe("log")
    expect(texts(log.base()).length).toBeGreaterThan(3)
  })

  it("nhãn lưới nhường chỗ cho nhãn giá đóng cửa (không đè nhau)", () => {
    const out = build(marketInput())
    const closeY = out.frame.price.scale.yOf(out.data.raw[out.data.count - 1].close)
    const labels = texts(out.base()).filter((command) => command.x > out.frame.plot.right && Math.abs(command.y - 4 - closeY) < 14)
    expect(labels).toHaveLength(0)
  })

  it("formatPrice của trang được dùng cho nhãn trục giá", () => {
    const scene = build(marketInput(), { formatPrice: (price) => `${price.toFixed(1)}đ` }).base()
    expect(texts(scene).some((command) => command.text.endsWith("đ"))).toBe(true)
  })
})

describe("scene: quy tắc màu (docs/iqline-design.md §7)", () => {
  it("bảng màu chỉ báo theo thứ tự chart-1, 6, 8, 2, 5; có trần hoặc sàn thì chart-1, 2, 5", () => {
    expect(indicatorPalette()).toEqual(["chart-1", "chart-6", "chart-8", "chart-2", "chart-5"])
    expect(indicatorPalette({ reference: 10 })).toEqual(INDICATOR_PALETTE)
    expect(indicatorPalette({ ceiling: 11 })).toEqual(["chart-1", "chart-2", "chart-5"])
    expect(indicatorPalette({ floor: 9 })).toEqual(LEVELS_PALETTE)
  })

  it("có trần hoặc sàn: không lệnh nào dùng chart-6, 7, 8 dù chỉ báo tính bằng bảng màu cũ", () => {
    const bars = makeBars(120)
    const indicators = [overlay("a", bars, 5, "chart-1"), overlay("b", bars, 10, "chart-6"), overlay("c", bars, 20, "chart-8"), overlay("d", bars, 30, "chart-7")]
    const mid = bars[119].close
    const scene = build(marketInput({ indicators, priceLevels: { ceiling: mid + 3, floor: mid - 3 } })).scene()
    const used = new Set(tokens(scene))
    for (const forbidden of ["chart-6", "chart-7", "chart-8"]) expect(used.has(forbidden)).toBe(false)
    expect(used.has("chart-1")).toBe(true)
  })

  it("không có trần sàn: chart-6, 8 giữ nguyên nhưng chart-7 vẫn bị chặn (dành cho AI)", () => {
    const bars = makeBars(120)
    const scene = build(marketInput({ indicators: [overlay("a", bars, 5, "chart-6"), overlay("b", bars, 10, "chart-7")] })).scene()
    const used = new Set(tokens(scene))
    expect(used.has("chart-6")).toBe(true)
    expect(used.has("chart-7")).toBe(false)
  })

  it("nến và khối lượng không bao giờ dùng màu chart, kể cả khi có chỉ báo", () => {
    const bars = makeBars(120)
    const scene = build(marketInput({ indicators: [overlay("a", bars, 5, "chart-6")] })).scene()
    const rects = scene.filter((command) => command.op === "rects")
    // Ngoại lệ duy nhất là nhãn giá đóng cửa ở trục phải (chart-1, một hình).
    expect(tokens(rects).filter((token) => token !== "price-up" && token !== "price-down")).toEqual(["chart-1"])
    expect(rectsOf(scene, "chart-1")).toHaveLength(1)
  })
})
