import { describe, expect, it } from "vitest"

import { createIndicatorCache } from "../indicators"
import { createChartData } from "../scene/model"
import { frameOf, makeTimedBars, marketInput } from "../scene/test-support"
import type { ChartIndicatorInput } from "../types"
import { buildFrame, indicatorTitle, layerScene, sceneIndicatorsFor, targetAt } from "./chart-helpers"
import { SceneBuilder } from "../scene/builder"
import { createInteractionState, marketConfig } from "../interaction"
import { indicatorPalette } from "../scene/colors"

const bars = makeTimedBars(200, "D")
const palette = indicatorPalette()
const input = (id: string, params: ChartIndicatorInput["params"] = {}, extra: Partial<ChartIndicatorInput> = {}): ChartIndicatorInput => ({ key: `${id}-1`, id, params, ...extra })

describe("indicatorTitle", () => {
  const specs = [
    { key: "period", default: 14 },
    { key: "lower", default: 30 },
    { key: "upper", default: 70 },
  ]
  it("chỉ ghi tham số chính, bỏ ngưỡng", () => {
    expect(indicatorTitle({ name: "RSI" }, { params: {} }, specs)).toBe("RSI (14)")
    expect(indicatorTitle({ name: "RSI" }, { params: { period: 21 } }, specs)).toBe("RSI (21)")
  })
  it("nhiều tham số chính thì cách nhau bằng dấu phẩy; không có thì chỉ có tên", () => {
    expect(indicatorTitle({ name: "MACD" }, { params: {} }, [{ key: "fast", default: 12 }, { key: "slow", default: 26 }, { key: "signal", default: 9 }])).toBe("MACD (12, 26, 9)")
    expect(indicatorTitle({ name: "OBV" }, { params: {} }, [])).toBe("OBV")
  })
})

describe("sceneIndicatorsFor", () => {
  it("tính chỉ báo, đặt tên kèm tham số và giữ trạng thái ẩn", () => {
    const [rsi] = sceneIndicatorsFor([input("rsi", { period: 9 }, { hidden: true })], bars, createIndicatorCache(), palette, { profile: null })
    expect(rsi).toMatchObject({ key: "rsi-1", id: "rsi", name: "RSI (9)", hidden: true })
    expect(rsi.plot.series[0].values).toHaveLength(bars.length)
  })

  it("bỏ qua id lạ và tham số sai thay vì làm hỏng biểu đồ", () => {
    const out = sceneIndicatorsFor([input("khong-co"), input("rsi", { period: -5 }), input("ema", { period: 20 })], bars, createIndicatorCache(), palette, { profile: null })
    expect(out.map((item) => item.id)).toEqual(["ema"])
  })

  it("Flashback chỉ nhận chỉ báo có cờ flashback", () => {
    const out = sceneIndicatorsFor([input("rsi"), input("psar")], bars, createIndicatorCache(), palette, { profile: null, flashback: true })
    expect(out.map((item) => item.id)).toEqual(["rsi"])
  })

  it("Volume Profile tính theo khoảng đang thấy và dùng lại kết quả khi khoảng không đổi", () => {
    const cache = createIndicatorCache()
    const profile = input("volume_profile", { rows: 24 })
    const a = sceneIndicatorsFor([profile], bars, cache, palette, { profile: { from: 100, to: 160 } })[0]
    const b = sceneIndicatorsFor([profile], bars, cache, palette, { profile: { from: 100, to: 160 } })[0]
    const c = sceneIndicatorsFor([profile], bars, cache, palette, { profile: { from: 120, to: 180 } })[0]
    expect(a.plot.profile?.rows).toHaveLength(24)
    expect(b.plot).toBe(a.plot)
    expect(c.plot).not.toBe(a.plot)
  })

  it("Volume Profile ẩn hoặc chưa có viewport thì không tính", () => {
    const cache = createIndicatorCache()
    expect(sceneIndicatorsFor([input("volume_profile")], bars, cache, palette, { profile: null })[0].plot.profile?.rows).toEqual([])
    expect(sceneIndicatorsFor([input("volume_profile", {}, { hidden: true })], bars, cache, palette, { profile: { from: 0, to: 50 } })[0].plot.profile?.rows).toEqual([])
  })
})

describe("targetAt", () => {
  const frame = frameOf(createChartData(marketInput({ count: 120 })))
  const { plot, panes } = frame
  const first = panes[0].box

  it("khung vẽ, trục giá, trục thời gian và ngoài biểu đồ", () => {
    expect(targetAt(frame, plot.left + 10, first.top + 10)).toMatchObject({ region: "plot", paneKind: "price" })
    expect(targetAt(frame, plot.right + 10, first.top + 10)).toMatchObject({ region: "price-axis", paneKey: first.key })
    expect(targetAt(frame, plot.left + 10, frame.view.geometry.height - 4)).toMatchObject({ region: "time-axis" })
    expect(targetAt(frame, -5, 10)).toMatchObject({ region: "none" })
    expect(targetAt(frame, plot.left + 10, frame.view.geometry.height + 5)).toMatchObject({ region: "none" })
  })

  it("khoảng hở giữa hai ô tính vào ô gần nhất; trục giá của ô phụ không kéo được", () => {
    const withVolume = frameOf(createChartData(marketInput({ count: 120, indicators: [{ key: "v", id: "volume", name: "Khối lượng", plot: { kind: "vol", series: [] } }] })))
    const [price, volume] = withVolume.panes
    const gap = price.box.top + price.box.height + 2
    expect(targetAt(withVolume, withVolume.plot.left + 5, gap)).toMatchObject({ region: "plot", paneKey: price.box.key })
    expect(targetAt(withVolume, withVolume.plot.right + 5, volume.box.top + 5)).toMatchObject({ region: "none" })
  })
})

describe("buildFrame và layerScene", () => {
  const data = createChartData(marketInput({ count: 150 }))
  const config = marketConfig({ barCount: 150, defaultViewport: { from: 30, to: 155 } })
  const state = createInteractionState(config)
  const inputs = { width: 800, height: 500, dpr: 1, priceScaleMode: "linear" as const }

  it("null khi chưa đo được kích thước", () => {
    expect(buildFrame(data, state.viewport, state.priceScale, { ...inputs, width: 0 })).toBeNull()
  })

  it("hệ số kéo tay trục giá đổi dải giá của khung", () => {
    const auto = buildFrame(data, state.viewport, state.priceScale, inputs)!
    const stretched = buildFrame(data, state.viewport, { p: 2 }, inputs)!
    const span = (frame: typeof auto) => frame.price.range.high - frame.price.range.low
    expect(span(stretched)).toBeGreaterThan(span(auto))
  })

  it("bốn lớp đều dựng được cảnh; lớp hình vẽ trống khi không có hình", () => {
    const frame = buildFrame(data, state.viewport, state.priceScale, inputs)!
    const builder = new SceneBuilder()
    expect(layerScene(builder, "base", { frame, state }).length).toBeGreaterThan(0)
    expect(layerScene(builder, "data", { frame, state }).length).toBeGreaterThan(0)
    expect(layerScene(builder, "drawings", { frame, state })).toEqual([])
    expect(layerScene(builder, "top", { frame, state })).toEqual([])
  })

  it("lớp AI vẽ dưới hình người dùng, trong khung vẽ", () => {
    const frame = buildFrame(data, state.viewport, state.priceScale, inputs)!
    const mid = (frame.price.range.low + frame.price.range.high) / 2
    const scene = layerScene(new SceneBuilder(), "drawings", { frame, state, overlays: [{ id: "l", kind: "level", price: mid, label: "Kháng cự" }] })
    expect(scene[0]).toMatchObject({ op: "clip" })
    expect(scene.some((command) => command.op === "lines" && command.token === "chart-7")).toBe(true)
    expect(scene.at(-1)).toEqual({ op: "unclip" })
  })
})
