/**
 * Chuỗi chỉ báo vẽ lệch (`IndicatorSeries.offset`), mây giữa hai chuỗi (`IndicatorPlot.cloud`) và đường bậc (`style: "step"`),
 * dùng cho Ichimoku và Pivot Points (docs/iqline-design.md §9): vẽ đúng vào vùng ngoại suy sau nến cuối, không kéo giãn trục giá,
 * không phá `valuesAtIndex`.
 */
import { describe, expect, it } from "vitest"

import { computeIndicator, DEFAULT_PALETTE } from "../indicators"
import { ichimoku } from "../indicators/series-extra"
import { columnsOf } from "../indicators/series"
import type { DrawCommand, IndicatorPlot, IndicatorSeries } from "../types"
import { valuesAtIndex } from "./values"
import { build, makeTimedBars, marketInput, ops, series as makeSeries } from "./test-support"
import type { SceneIndicator } from "./model"

const COUNT = 60
const bars = makeTimedBars(COUNT, "D")
const FUTURE = 15
/** Viewport nhìn hết nến và `FUTURE` ô trống sau nến cuối. */
const WITH_FUTURE = { from: -0.5, to: COUNT - 0.5 + FUTURE }

const over = (key: string, ...lines: IndicatorSeries[]): SceneIndicator => ({ key, name: key, plot: { kind: "over", series: lines } })
const around = (value: number) => bars.map((bar) => bar.close + value)

function polylineOf(scene: readonly DrawCommand[], token: string): number[][] {
  return scene
    .filter((command): command is Extract<DrawCommand, { op: "polyline" }> => command.op === "polyline" && command.token === token)
    .map((command) => Array.from(command.data.subarray(0, command.count)))
}

describe("chuỗi lệch về tương lai (offset dương)", () => {
  const values = bars.map((_, index) => 100 + index * 0.1)
  const indicators = [over("ich", makeSeries("a", values, "chart-8", { offset: 5 }))]

  it("giá trị của nến j được vẽ ở chỉ số j + offset, kể cả vùng ngoại suy sau nến cuối", () => {
    const out = build(marketInput({ bars, interval: "D", indicators }), { viewport: WITH_FUTURE })
    const [line] = polylineOf(out.scene(), "chart-8")
    const coords = out.frame.price.coords
    expect(line[0]).toBeCloseTo(coords.xOfIndex(5), 6)
    expect(line[1]).toBeCloseTo(coords.yOfPrice(values[0]), 6)
    expect(line[line.length - 2]).toBeCloseTo(coords.xOfIndex(COUNT - 1 + 5), 6)
    expect(line[line.length - 1]).toBeCloseTo(coords.yOfPrice(values[COUNT - 1]), 6)
    expect(line).toHaveLength((COUNT - 1 + 5 - 5 + 1) * 2)
    // điểm cuối nằm sau nến cuối: đúng vùng ngoại suy
    expect(coords.xOfIndex(COUNT - 1 + 5)).toBeGreaterThan(coords.xOfIndex(COUNT - 1))
  })

  it("viewport không nhìn tới tương lai thì chỉ vẽ tới nến cuối, phần lệch không tràn ra ngoài khung", () => {
    const out = build(marketInput({ bars, interval: "D", indicators }))
    const [line] = polylineOf(out.scene(), "chart-8")
    const coords = out.frame.price.coords
    expect(line[line.length - 2]).toBeLessThanOrEqual(coords.xOfIndex(COUNT - 1) + 1e-6)
    expect(line[0]).toBeCloseTo(coords.xOfIndex(5), 6)
  })

  it("trục giá không bị kéo giãn: đường lệch rất cao ở tương lai không đổi dải giá của ô giá", () => {
    const huge = bars.map((_, index) => 10_000 + index)
    const base = build(marketInput({ bars, interval: "D" }), { viewport: WITH_FUTURE })
    const stretched = build(marketInput({ bars, interval: "D", indicators: [over("ich", makeSeries("a", huge, "chart-8", { offset: 5 }))] }), { viewport: WITH_FUTURE })
    expect(stretched.frame.price.range).toEqual(base.frame.price.range)
    expect(stretched.frame.panes).toHaveLength(base.frame.panes.length)
  })

  it("ô riêng: dải giá lấy theo các giá trị đang nằm trong khoảng nhìn thấy sau khi dời", () => {
    const early = bars.map((_, index) => (index < 5 ? 1_000 : 10))
    // offset 5 đẩy 5 giá trị đầu (1.000) sang các nến 5..9; xem cửa sổ chỉ gồm nến 20..59 thì các giá trị đó ra ngoài khung.
    const out = build(marketInput({ bars, interval: "D", indicators: [{ key: "p", name: "p", plot: { kind: "pane", series: [makeSeries("a", early, "chart-1", { offset: 5 })] } }] }), { viewport: { from: 19.5, to: COUNT - 0.5 } })
    const pane = out.frame.panes.find((item) => item.box.kind === "indicator")!
    expect(pane.range.high).toBeLessThan(100)
    const shownEarly = build(marketInput({ bars, interval: "D", indicators: [{ key: "p", name: "p", plot: { kind: "pane", series: [makeSeries("a", early, "chart-1", { offset: 5 })] } }] }), { viewport: { from: -0.5, to: 30 } })
    expect(shownEarly.frame.panes.find((item) => item.box.kind === "indicator")!.range.high).toBeGreaterThan(900)
  })

  it("không có lệnh vẽ nào chứa toạ độ không hữu hạn, kể cả khi toàn bộ chuỗi nằm ngoài khung", () => {
    const out = build(marketInput({ bars, interval: "D", indicators: [over("ich", makeSeries("a", values, "chart-8", { offset: 500 }))] }), { viewport: WITH_FUTURE })
    for (const command of out.scene()) {
      if (!("data" in command)) continue
      for (let index = 0; index < command.count; index += 1) expect(Number.isFinite(command.data[index])).toBe(true)
    }
    expect(polylineOf(out.scene(), "chart-8")).toHaveLength(0)
  })
})

describe("chuỗi lệch về quá khứ (offset âm, như Chikou)", () => {
  const values = bars.map((_, index) => 100 + index * 0.1)

  it("giá trị của nến j được vẽ ở chỉ số j - 5; nến cuối của chuỗi dừng ở COUNT - 6", () => {
    const out = build(marketInput({ bars, interval: "D", indicators: [over("ich", makeSeries("a", values, "chart-8", { offset: -5 }))] }))
    const [line] = polylineOf(out.scene(), "chart-8")
    const coords = out.frame.price.coords
    expect(line[0]).toBeCloseTo(coords.xOfIndex(0), 6)
    expect(line[1]).toBeCloseTo(coords.yOfPrice(values[5]), 6)
    expect(line[line.length - 2]).toBeCloseTo(coords.xOfIndex(COUNT - 1 - 5), 6)
    expect(line[line.length - 1]).toBeCloseTo(coords.yOfPrice(values[COUNT - 1]), 6)
  })

  it("không để lại đoạn nào ở 5 nến cuối", () => {
    const out = build(marketInput({ bars, interval: "D", indicators: [over("ich", makeSeries("a", values, "chart-8", { offset: -5 }))] }), { viewport: WITH_FUTURE })
    const [line] = polylineOf(out.scene(), "chart-8")
    expect(line[line.length - 2]).toBeLessThan(out.frame.price.coords.xOfIndex(COUNT - 1))
  })
})

describe("giá trị ở crosshair và chú giải khi có chuỗi lệch", () => {
  const values = bars.map((_, index) => index)
  const lagging = makeSeries("lag", values, "chart-1", { offset: 5 })
  const leading = makeSeries("lead", values, "chart-6", { offset: -5 })
  const plain = makeSeries("plain", values, "chart-8")
  const { data } = build(marketInput({ bars, interval: "D", indicators: [over("ich", lagging, leading, plain)] }))

  it("dưới nến i đọc giá trị tính từ nến i - offset, ra ngoài chuỗi thì null", () => {
    const at = (index: number) => Object.fromEntries(valuesAtIndex(data, index)!.series.map((item) => [item.seriesKey, item.value]))
    expect(at(10)).toEqual({ lag: 5, lead: 15, plain: 10 })
    expect(at(2)).toEqual({ lag: null, lead: 7, plain: 2 })
    expect(at(COUNT - 1)).toEqual({ lag: COUNT - 6, lead: null, plain: COUNT - 1 })
    // nến cuối còn đọc được Chikou là COUNT - 6 (chuỗi gốc dừng ở nến COUNT - 1)
    expect(at(COUNT - 6)).toEqual({ lag: COUNT - 11, lead: COUNT - 1, plain: COUNT - 6 })
    expect(at(COUNT - 5).lead).toBeNull()
  })

  it("ô tương lai vẫn không đọc được gì (hợp đồng cũ của valuesAtIndex không đổi)", () => {
    expect(valuesAtIndex(data, COUNT)).toBeNull()
    expect(valuesAtIndex(data, COUNT + 3)).toBeNull()
    expect(valuesAtIndex(data, -1)).toBeNull()
  })

  it("chuỗi không có offset đọc như cũ", () => {
    const { data: legacy } = build(marketInput({ bars, interval: "D", indicators: [over("ma", plain)] }))
    expect(valuesAtIndex(legacy, 7)?.series[0]).toMatchObject({ seriesKey: "plain", value: 7 })
  })
})

describe("mây giữa hai chuỗi", () => {
  const cloud = { a: "a", b: "b", upToken: "price-up", downToken: "price-down" } as const
  const withCloud = (a: (number | null)[], b: (number | null)[], extra: { aOffset?: number; bOffset?: number } = {}): SceneIndicator => ({
    key: "cloud",
    name: "cloud",
    plot: { kind: "over", series: [makeSeries("a", a, "chart-1", { offset: extra.aOffset }), makeSeries("b", b, "chart-5", { offset: extra.bOffset })], cloud } as IndicatorPlot,
  })
  const polygons = (scene: readonly DrawCommand[]) => ops(scene, "polygon").filter((command) => command.op === "polygon" && (command.token === "price-up" || command.token === "price-down")) as Extract<DrawCommand, { op: "polygon" }>[]
  const level = bars.map((bar) => bar.close)

  it("a luôn trên b: một đa giác price-up, mờ một màu phẳng, đủ đỉnh hai biên", () => {
    const out = build(marketInput({ bars, interval: "D", indicators: [withCloud(around(3), level)] }))
    const found = polygons(out.scene())
    expect(found).toHaveLength(1)
    expect(found[0].token).toBe("price-up")
    expect(found[0].alpha).toBeGreaterThan(0)
    expect(found[0].alpha).toBeLessThan(0.3)
    expect(found[0].count).toBe(COUNT * 2 * 2)
  })

  it("a dưới b: price-down; bằng nhau: price-up (a >= b)", () => {
    expect(polygons(build(marketInput({ bars, interval: "D", indicators: [withCloud(around(-3), level)] })).scene())[0].token).toBe("price-down")
    expect(polygons(build(marketInput({ bars, interval: "D", indicators: [withCloud(level, level)] })).scene())[0].token).toBe("price-up")
  })

  it("hai chuỗi cắt nhau: tách đúng ở giao điểm, mỗi nửa một màu, không có tam giác sai màu", () => {
    // a đi từ trên xuống dưới b giữa nến 9 và 10; b đứng yên ở 100.
    const a = bars.map((_, index) => (index < 10 ? 102 : 98))
    const b = bars.map(() => 100)
    const out = build(marketInput({ bars, interval: "D", indicators: [withCloud(a, b)] }))
    const found = polygons(out.scene())
    expect(found.map((item) => item.token)).toEqual(["price-up", "price-down"])
    const coords = out.frame.price.coords
    const crossX = coords.xOfIndex(9.5)
    const crossY = coords.yOfPrice(100)
    const first = Array.from(found[0].data.subarray(0, found[0].count))
    const second = Array.from(found[1].data.subarray(0, found[1].count))
    // đa giác đầu: 11 đỉnh biên a (nến 0..9 và giao điểm) rồi 10 đỉnh biên b ngược lại
    expect(first).toHaveLength(21 * 2)
    expect(first[20]).toBeCloseTo(crossX, 6)
    expect(first[21]).toBeCloseTo(crossY, 6)
    // đa giác sau bắt đầu ở đúng giao điểm đó
    expect(second[0]).toBeCloseTo(crossX, 6)
    expect(second[1]).toBeCloseTo(crossY, 6)
    // giao điểm, 50 đỉnh biên a (nến 10..59) rồi 50 đỉnh biên b ngược lại
    expect(second).toHaveLength(101 * 2)
  })

  it("chỗ thiếu giá trị ngắt mây thành hai đa giác riêng", () => {
    const a = around(3).map((value, index) => (index === 20 ? null : value))
    const out = build(marketInput({ bars, interval: "D", indicators: [withCloud(a, level)] }))
    expect(polygons(out.scene())).toHaveLength(2)
  })

  it("mây của chuỗi lệch nằm ở chỉ số đã dời, kể cả vùng ngoại suy", () => {
    const out = build(marketInput({ bars, interval: "D", indicators: [withCloud(around(3), level, { aOffset: 4, bOffset: 4 })] }), { viewport: WITH_FUTURE })
    const [found] = polygons(out.scene())
    const coords = out.frame.price.coords
    expect(found.data[0]).toBeCloseTo(coords.xOfIndex(4), 6)
    // đỉnh cuối của biên a (trước các đỉnh biên b ngược) ở chỉ số COUNT - 1 + 4
    const aPoints = found.count / 4
    expect(found.data[(aPoints - 1) * 2]).toBeCloseTo(coords.xOfIndex(COUNT - 1 + 4), 6)
  })

  it("chỉ báo ẩn thì không vẽ mây", () => {
    const hidden = { ...withCloud(around(3), level), hidden: true }
    expect(polygons(build(marketInput({ bars, interval: "D", indicators: [hidden] })).scene())).toHaveLength(0)
  })

  it("rất nhiều nến (mỗi nến hẹp dưới 1px) bỏ mây như các vùng tô khác và không lỗi", () => {
    const many = makeTimedBars(3000, "D")
    const out = build(marketInput({ bars: many, interval: "D", indicators: [withCloud(many.map((bar) => bar.close + 3), many.map((bar) => bar.close))] }))
    expect(polygons(out.scene())).toHaveLength(0)
  })

  it("không có mây nếu plot không khai báo cloud, và khoá trỏ tới chuỗi không có thì bỏ qua", () => {
    const plain: SceneIndicator = { key: "x", name: "x", plot: { kind: "over", series: [makeSeries("a", around(3)), makeSeries("b", level)] } }
    expect(polygons(build(marketInput({ bars, interval: "D", indicators: [plain] })).scene())).toHaveLength(0)
    const broken: SceneIndicator = { key: "y", name: "y", plot: { kind: "over", series: [makeSeries("a", around(3))], cloud: { ...cloud, b: "khong-co" } } }
    expect(() => build(marketInput({ bars, interval: "D", indicators: [broken] })).scene()).not.toThrow()
  })
})

describe("đường bậc (Pivot Points)", () => {
  const step = (values: (number | null)[]): SceneIndicator => over("pv", makeSeries("pp", values, "chart-8", { style: "step" }))
  const segmentsOf = (scene: readonly DrawCommand[]): number[][] => {
    const found = scene.find((command): command is Extract<DrawCommand, { op: "lines" }> => command.op === "lines" && command.token === "chart-8")
    if (!found) return []
    const out: number[][] = []
    for (let index = 0; index < found.count; index += 4) out.push(Array.from(found.data.subarray(index, index + 4)))
    return out
  }

  it("mỗi đoạn cùng giá trị là một đoạn ngang; đổi mức không nối chéo, chỗ thiếu giá trị ngắt đoạn", () => {
    const values = bars.map((_, index) => (index < 3 ? 100 : index < 5 ? 105 : index === 5 ? null : 105))
    const out = build(marketInput({ bars, interval: "D", indicators: [step(values)] }))
    const segments = segmentsOf(out.scene())
    expect(segments).toHaveLength(3)
    const half = out.frame.barPx / 2
    const coords = out.frame.price.coords
    // đoạn 0: nến 0..2 mức 100, từ mép trái nến 0 tới mép phải nến 2, nằm ngang
    expect(segments[0][0]).toBeCloseTo(coords.xOfIndex(0) - half, 6)
    expect(segments[0][2]).toBeCloseTo(coords.xOfIndex(2) + half, 6)
    expect(segments[0][1]).toBe(segments[0][3])
    expect(segments[0][1]).toBe(Math.round(coords.yOfPrice(100)))
    // đoạn 1 mức 105 ở nến 3..4, đoạn 2 mức 105 từ nến 6 tới hết
    expect(segments[1][1]).toBe(Math.round(coords.yOfPrice(105)))
    expect(segments[1][2]).toBeCloseTo(coords.xOfIndex(4) + half, 6)
    expect(segments[2][0]).toBeCloseTo(coords.xOfIndex(6) - half, 6)
    expect(segments[2][2]).toBeCloseTo(coords.xOfIndex(COUNT - 1) + half, 6)
  })

  it("chuỗi toàn null không sinh lệnh nào", () => {
    expect(segmentsOf(build(marketInput({ bars, interval: "D", indicators: [step(bars.map(() => null))] })).scene())).toHaveLength(0)
  })
})

describe("Ichimoku thật trong scene", () => {
  const long = makeTimedBars(200, "D")
  const plot = computeIndicator({ id: "ichimoku", params: {} }, long, DEFAULT_PALETTE)!
  const indicators: SceneIndicator[] = [{ key: "ichimoku", id: "ichimoku", name: "Ichimoku Cloud", plot }]

  it("vẽ Senkou vào vùng ngoại suy, mây có cả hai màu hoặc một màu, mọi toạ độ hữu hạn và trục giá không đổi", () => {
    const viewport = { from: 140, to: 200 - 0.5 + 30 }
    const out = build(marketInput({ bars: long, interval: "D", indicators }), { viewport })
    const base = build(marketInput({ bars: long, interval: "D" }), { viewport })
    expect(out.frame.price.range).toEqual(base.frame.price.range)
    const scene = out.scene()
    for (const command of scene) {
      if (!("data" in command)) continue
      for (let index = 0; index < command.count; index += 1) expect(Number.isFinite(command.data[index])).toBe(true)
    }
    const cloudPolygons = ops(scene, "polygon").filter((command) => command.op === "polygon" && (command.token === "price-up" || command.token === "price-down"))
    expect(cloudPolygons.length).toBeGreaterThan(0)
    // Senkou A vẽ tới chỉ số 199 + 26 = 225, sau nến cuối (199): có đỉnh nằm ở vùng ngoại suy
    const coords = out.frame.price.coords
    const lastBarX = coords.xOfIndex(199)
    const senkouA = scene.filter((command): command is Extract<DrawCommand, { op: "polyline" }> => command.op === "polyline" && command.token === plot.series.find((item) => item.key === "senkou_a")!.color)
    expect(senkouA.some((command) => command.data[command.count - 2] > lastBarX + 20)).toBe(true)
  })

  it("giá trị dưới nến cuối khớp công thức: Senkou A của nến cuối là Senkou A tính từ nến cách 26 nến; Chikou là giá đóng cửa 26 nến sau", () => {
    const { data } = build(marketInput({ bars: long, interval: "D", indicators }))
    const lines = ichimoku(columnsOf(long), 9, 26, 52)
    const at = Object.fromEntries(valuesAtIndex(data, 199)!.series.map((item) => [item.seriesKey, item.value]))
    expect(at.senkou_a).toBeCloseTo(lines.senkouA[199 - 26]!, 9)
    expect(at.senkou_b).toBeCloseTo(lines.senkouB[199 - 26]!, 9)
    expect(at.tenkan).toBeCloseTo(lines.tenkan[199]!, 9)
    expect(at.chikou).toBeNull()
    const earlier = Object.fromEntries(valuesAtIndex(data, 100)!.series.map((item) => [item.seriesKey, item.value]))
    expect(earlier.chikou).toBeCloseTo(long[126].close, 9)
  })
})
