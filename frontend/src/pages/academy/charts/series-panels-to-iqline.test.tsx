import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { staticLegend, buildStaticCrosshair, buildStaticScene, layoutStatic, staticReadout } from "@/lib/iqline/scene/static"
import type { StaticPanel } from "@/lib/iqline/static-types"
import type { ColorToken, DrawCommand } from "@/lib/iqline/types"
import { CHARTS, mockReaderWidth } from "../blocks/test-blocks"
import type { ChartModel, LessonContent } from "../content-types"
import { seriesPanelsReadout, type SeriesPanelsModel } from "./chart-math"
import { SeriesPanelsChart } from "./series-panels-chart"
import { seriesPanelsToIQLine } from "./series-panels-to-iqline"

/** Mọi `series_panels` thật của Học viện: 96 biểu đồ trong 29 bài (cả những biểu đồ nằm trong `compare`). */
type LessonFile = Pick<LessonContent, "id" | "charts">
const lessonFiles = import.meta.glob("../../../../../backend/src/modules/academy/content/v4/lessons/*.vi.json", { eager: true, import: "default" }) as Record<string, LessonFile>

function panelsModels(model: ChartModel): SeriesPanelsModel[] {
  if (model.kind === "series_panels") return [model]
  if (model.kind === "compare") return model.items.flatMap((item) => panelsModels(item.model))
  return []
}

const real = Object.values(lessonFiles)
  .sort((a, b) => a.id.localeCompare(b.id))
  .flatMap((lesson) => Object.entries(lesson.charts).flatMap(([id, model]) => panelsModels(model).map((chart, index) => ({ lessonId: lesson.id, id: index === 0 ? id : `${id}#${index}`, model: chart }))))

const sample = CHARTS["c4l7-g6"] as SeriesPanelsModel

/** Mẫu có đủ mọi loại trường của `series_panels`, kể cả những loại bài học thật dùng ít. */
const everything: SeriesPanelsModel = {
  kind: "series_panels",
  alt: "Mẫu đủ trường",
  x: {
    start: 10,
    end: 17,
    ticks: ["", "T2", "T3", "", "T5", "T6", "T7", "CN"],
    shade: [
      { from: 11, to: 13, tone: "warn", label: "Tích lũy" },
      { from: 15, to: 16, tone: "p3" },
    ],
  },
  marks: [{ i: 12, label: "Mốc" }],
  points: [
    { i: 12, panel: 0, value: 10.5, tone: "pos", shape: "dot", label: "Mua", pos: "below" },
    { i: 14, panel: 0, value: 11, tone: "p3", shape: "ring", label: "Xám" },
    { i: 15, panel: 1, value: 40, tone: "neg" },
  ],
  panels: [
    {
      title: "Giá",
      bounds: [8, 14],
      ticks: [8, 10, 12, 14],
      digits: 1,
      levels: [
        { value: 12, role: "buy", label: "Mua" },
        { value: 11, role: "sell" },
        { value: 10, role: "neutral", label: "Trung tính" },
        { value: 9, role: "avg", label: "Trung bình" },
      ],
      zones: [
        { from: 9, to: 10, tone: "pos", label: "Vùng mua" },
        { from: 12, to: 13, tone: "neutral" },
      ],
      band: { upper: [12, 12, 12, 12, 12, 12, 12, 12], lower: [9, 9, 9, null, 9, 9, 9, 9], tone: "p2" },
      candles: {
        open: [10, 10.5, 10.8, 10.4, 10.9, 11, 11.2, 11.1],
        high: [10.6, 11, 11.2, 11, 11.4, 11.6, 11.8, 11.5],
        low: [9.8, 10.2, 10.3, 10.1, 10.6, 10.8, 11, 10.9],
        close: [10.5, 10.8, 10.4, 10.9, 11, 11.2, 11.1, 11.4],
      },
      series: [
        { name: "MA", role: "p1", dash: true, width: 2, values: [10, 10.2, 10.4, 10.5, null, 10.8, 10.9, 11] },
        { name: "Giá", role: "price", values: [10.5, 10.8, 10.4, 10.9, 11, 11.2, 11.1, 11.4] },
        { name: "Cam", role: "p5", values: [10, 10, 10, 10, 10, 10, 10, 10] },
      ],
      segments: [{ from: [11, 10.2], to: [14, 10.9], tone: "p5", dash: true, extend: 2 }, { from: [10, 9.5], to: [12, 9.5], tone: "warn" }],
      fib: { lo: { i: 11, v: 9.5 }, hi: { i: 16, v: 11.8 }, dir: "down", levels: [0, 0.382, 0.618, 1], zone: [0.382, 0.618] },
      notes: [{ i: 13, value: 10.1, text: "Cắt lỗ", tone: "neg" }, { i: 16, value: 11.7, text: "Không sắc thái" }],
    },
    {
      title: "Khối lượng",
      nonnegative: true,
      zero: true,
      series: [
        { name: "TB", role: "p4", values: [30, 31, 32, 33, 34, 35, 36, 37] },
        { name: "KL", role: "p2", values: [28, 33, 31, 35, 33, 36, 34, 39] },
      ],
      fill_between: { a: 0, b: 1, above: "pos", below: "neg" },
      bars: { name: "Khối lượng", values: [28, 33, null, 35, 33, 36, 34, 39], colors: ["pos", "neg", "neutral", "pos", "pos", "neg", "neutral", "pos"] },
    },
  ],
}

describe("seriesPanelsToIQLine: không mất trường nào", () => {
  it("giữ nguyên mọi mảng số liệu và chú thích của mẫu có đủ loại", () => {
    const panels = seriesPanelsToIQLine(everything)
    expect(panels).toHaveLength(2)
    const [price, volume] = panels
    // Khung dùng chung, cùng một đối tượng cho mọi ô.
    expect(price.frame).toBe(volume.frame)
    expect(price.frame).toMatchObject({ start: 10, end: 17, ticks: everything.x.ticks, axes: true, alt: "Mẫu đủ trường" })
    expect(price.frame.marks).toEqual([{ i: 12, label: "Mốc" }])
    expect(price.frame.shade).toEqual([
      { from: 11, to: 13, token: "chart-2", label: "Tích lũy", labelToken: "chart-2" },
      { from: 15, to: 16, token: "chart-5", labelToken: "academy-label" },
    ])
    // Ô giá.
    const source = everything.panels[0]
    expect(price.title).toBe("Giá")
    expect(price.bounds).toEqual([8, 14])
    expect(price.ticks).toEqual([8, 10, 12, 14])
    expect(price.digits).toBe(1)
    expect(price.candles).toEqual(source.candles)
    expect(price.band).toEqual({ upper: source.band?.upper, lower: source.band?.lower, token: "chart-2" })
    expect(price.series.map((series) => [series.name, series.token, series.dash, series.width])).toEqual([
      ["MA", "chart-1", true, 2],
      ["Giá", "foreground", undefined, undefined],
      ["Cam", "s2", undefined, undefined],
    ])
    expect(price.series.map((series) => series.values)).toEqual(source.series.map((series) => series.values))
    expect(price.levels?.map((level) => [level.value, level.role, level.label, level.token, level.labelToken])).toEqual([
      [12, "buy", "Mua", "price-up", "price-up"],
      [11, "sell", undefined, "price-down", "price-down"],
      [10, "neutral", "Trung tính", "chart-5", "academy-label"],
      [9, "avg", "Trung bình", "chart-2", "chart-2"],
    ])
    expect(price.zones).toEqual([
      { from: 9, to: 10, token: "price-up", label: "Vùng mua", labelToken: "price-up" },
      { from: 12, to: 13, token: "border", labelToken: "academy-label" },
    ])
    expect(price.segments).toEqual([
      { from: [11, 10.2], to: [14, 10.9], token: "s2", dash: true, extend: 2 },
      { from: [10, 9.5], to: [12, 9.5], token: "chart-2" },
    ])
    expect(price.fib).toEqual({ lo: { i: 11, v: 9.5 }, hi: { i: 16, v: 11.8 }, dir: "down", levels: [0, 0.382, 0.618, 1], zone: [0.382, 0.618], token: "chart-2" })
    expect(price.notes).toEqual([
      { i: 13, value: 10.1, text: "Cắt lỗ", token: "price-down" },
      { i: 16, value: 11.7, text: "Không sắc thái", token: "academy-label" },
    ])
    expect(price.points).toEqual([
      { i: 12, value: 10.5, token: "price-up", labelToken: "price-up", shape: "dot", label: "Mua", pos: "below" },
      { i: 14, value: 11, token: "chart-5", labelToken: "academy-label", shape: "ring", label: "Xám" },
    ])
    // Ô khối lượng.
    expect(volume.nonnegative).toBe(true)
    expect(volume.zero).toBe(true)
    expect(volume.fill_between).toEqual({ a: 0, b: 1, aboveToken: "price-up", belowToken: "price-down" })
    expect(volume.bars).toEqual({
      name: "Khối lượng",
      values: [28, 33, null, 35, 33, 36, 34, 39],
      tokens: ["price-up", "price-down", "chart-5", "price-up", "price-up", "price-down", "chart-5", "price-up"],
    })
    expect(volume.series.map((series) => series.token)).toEqual(["chart-7", "chart-2"])
    expect(volume.points).toEqual([{ i: 15, value: 40, token: "price-down", labelToken: "price-down" }])
    expect(volume.candles).toBeUndefined()
    expect(volume.band).toBeUndefined()
  })

  it("không thêm trường rỗng: ô tối giản chỉ có tiêu đề, khung và chuỗi", () => {
    const [panel] = seriesPanelsToIQLine({
      kind: "series_panels",
      x: { start: 0, end: 1 },
      marks: [],
      panels: [{ title: "", series: [{ name: "A", role: "p1", values: [1, 2] }] }],
    })
    expect(Object.keys(panel).sort()).toEqual(["frame", "series", "title"])
    expect(panel.frame).toEqual({ start: 0, end: 1, marks: [], axes: true })
  })

  it("axes: false là hình thu nhỏ", () => {
    const [thumb] = seriesPanelsToIQLine(CHARTS["c4l1-g4"] as SeriesPanelsModel)
    expect(thumb.frame.axes).toBe(false)
    expect(thumb.candles?.close).toHaveLength(10)
  })

  it("không dùng màu xám cho chữ và không dùng muted-foreground", () => {
    const textTokens = (panels: StaticPanel[]) =>
      panels.flatMap((panel) => [
        ...(panel.frame.shade ?? []).map((shade) => shade.labelToken),
        ...(panel.levels ?? []).map((level) => level.labelToken),
        ...(panel.zones ?? []).map((zone) => zone.labelToken),
        ...(panel.notes ?? []).map((note) => note.token),
        ...(panel.points ?? []).map((point) => point.labelToken),
      ])
    for (const { model } of real) for (const token of textTokens(seriesPanelsToIQLine(model))) expect(["muted-foreground", "chart-5", "border"]).not.toContain(token)
  })
})

describe("96 series_panels thật của Học viện", () => {
  it("đếm được đủ 96 biểu đồ trong 29 bài", () => {
    expect(real).toHaveLength(96)
    expect(new Set(real.map((chart) => chart.lessonId)).size).toBe(29)
  })

  it.each(real.map((chart) => [chart.lessonId, chart.id, chart.model] as const))("%s %s: chuyển đủ trường, dựng cảnh, crosshair và chú giải", (_, __, model) => {
    const panels = seriesPanelsToIQLine(model)
    expect(panels).toHaveLength(model.panels.length)
    // Đủ trường: số lượng từng loại khớp nguồn.
    model.panels.forEach((source, index) => {
      const panel = panels[index]
      expect(panel.series).toHaveLength(source.series.length)
      expect(panel.candles?.close).toEqual(source.candles?.close)
      expect(panel.bars?.values).toEqual(source.bars?.values)
      expect(panel.bars?.tokens.length).toBe(source.bars?.colors.length)
      expect(panel.band?.upper).toEqual(source.band?.upper)
      expect(panel.levels?.length).toBe(source.levels?.length)
      expect(panel.zones?.length).toBe(source.zones?.length)
      expect(panel.segments?.length).toBe(source.segments?.length)
      expect(panel.notes?.length).toBe(source.notes?.length)
      expect(panel.fib?.levels).toEqual(source.fib?.levels)
      expect(panel.fill_between !== undefined).toBe(source.fill_between !== undefined)
      expect(panel.bounds).toEqual(source.bounds)
      expect(panel.ticks).toEqual(source.ticks)
      expect(panel.digits).toBe(source.digits)
    })
    expect(panels.reduce((sum, panel) => sum + (panel.points?.length ?? 0), 0)).toBe(model.points?.length ?? 0)
    expect(panels[0].frame.marks).toHaveLength(model.marks.length)
    expect(panels[0].frame.shade?.length).toBe(model.x.shade?.length)

    for (const [width, dpr] of [[358, 1], [760, 2]] as const) {
      const scene = buildStaticScene(panels, { width, dpr }, {})
      expect(scene.length).toBeGreaterThan(0)
      assertWellFormed(scene)
      const crosshair = buildStaticCrosshair(panels, { width, dpr }, {}, 1)
      if (model.axes === false) expect(crosshair).toBeNull()
      else {
        expect(crosshair?.readout.map((row) => [row.name, row.value, row.digits])).toEqual(seriesPanelsReadout(model, 1).map((row) => [row.name, row.value, row.digits]))
        assertWellFormed(crosshair?.scene ?? [])
        expect(staticLegend(panels).length).toBeGreaterThan(0)
      }
    }
  })
})

/** Mọi số hữu hạn, clip và unclip cân nhau, dữ liệu đủ `count`, không có token ngoài danh sách. */
const TOKENS: readonly ColorToken[] = ["background", "card", "s2", "foreground", "border", "muted-foreground", "academy-label", "price-up", "price-down", "price-ref", "price-ceiling", "price-floor", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"]
function assertWellFormed(scene: readonly DrawCommand[]) {
  let depth = 0
  for (const command of scene) {
    if (command.op === "clip") depth += 1
    else if (command.op === "unclip") depth -= 1
    expect(depth).toBeGreaterThanOrEqual(0)
    if ("token" in command) {
      expect(TOKENS).toContain(command.token)
      expect(command.token).not.toBe("muted-foreground")
    }
    if (command.op === "rects") {
      expect(command.data.length).toBeGreaterThanOrEqual(command.count)
      expect(command.count % 4).toBe(0)
      expect(command.count).toBeGreaterThan(0)
    }
    if (command.op === "lines") expect(command.data.length).toBeGreaterThanOrEqual(command.count)
    if (command.op === "polyline" || command.op === "polygon") expect(command.data.length).toBeGreaterThanOrEqual(command.count)
    if ("data" in command) for (const value of command.data) expect(Number.isFinite(value)).toBe(true)
    if (command.op === "text") for (const value of [command.x, command.y]) expect(Number.isFinite(value)).toBe(true)
  }
  expect(depth).toBe(0)
}

/** So với biểu đồ SVG đang chạy: cùng chiều cao, cùng các dòng chữ. */
describe("tương đương trực quan với series-panels-chart.tsx", () => {
  let restore: (() => void) | null = null
  afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  function svgOf(model: SeriesPanelsModel, width: number) {
    restore = mockReaderWidth(width)
    const { container } = render(<SeriesPanelsChart model={model} label="x" />)
    const svg = container.querySelector("svg[viewBox]") as SVGSVGElement
    const [, , , height] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number)
    const lines: string[] = []
    const placed: string[] = []
    const ALIGN = { start: "left", middle: "center", end: "right" } as const
    svg.querySelectorAll("text").forEach((node) => {
      const align = ALIGN[(node.getAttribute("text-anchor") ?? "start") as keyof typeof ALIGN]
      const spans = [...node.querySelectorAll("tspan")]
      if (spans.length) {
        let y = Number(node.getAttribute("y"))
        for (const span of spans) {
          y += Number(span.getAttribute("dy") ?? 0)
          lines.push(span.textContent ?? "")
          placed.push(`${span.textContent}|${align}|${Number(span.getAttribute("x")).toFixed(2)}|${y.toFixed(2)}`)
        }
      } else {
        lines.push(node.textContent ?? "")
        placed.push(`${node.textContent}|${align}|${Number(node.getAttribute("x")).toFixed(2)}|${Number(node.getAttribute("y")).toFixed(2)}`)
      }
    })
    restore()
    restore = null
    cleanup()
    const rectKey = (node: Element) => ["x", "y", "width", "height"].map((name) => Number(node.getAttribute(name)).toFixed(2)).join(",")
    const rects = (pattern: RegExp) => [...svg.querySelectorAll("rect")].filter((node) => pattern.test(node.getAttribute("class") ?? "")).map(rectKey)
    const fixed = (values: number[]) => values.map((value) => value.toFixed(2)).join(",")
    const pointsOf = (d: string) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].flatMap((match) => [Number(match[1]), Number(match[2])])
    const paths = [...svg.querySelectorAll("path")].map((node) => ({ d: node.getAttribute("d") ?? "", stroked: node.getAttribute("fill") === "none" }))
    return {
      height,
      lines,
      placed,
      segments: [...svg.querySelectorAll("line")].map((node) => fixed(["x1", "y1", "x2", "y2"].map((name) => Number(node.getAttribute(name))))),
      polylines: paths.filter((path) => path.stroked).flatMap((path) => path.d.split("M").filter(Boolean).map(pointsOf)).filter((points) => points.length >= 4).map(fixed),
      polygons: paths.filter((path) => !path.stroked).flatMap((path) => path.d.split("Z").filter((part) => part.includes("M")).map(pointsOf)).map(fixed),
      circles: [...svg.querySelectorAll("circle")].map((node) => fixed(["cx", "cy", "r"].map((name) => Number(node.getAttribute(name))))),
      shades: rects(/opacity-\[0\.1\]/).map((key) => `0.1|${key}`).concat(rects(/opacity-\[0\.14\]/).map((key) => `0.14|${key}`)),
      candleBodies: rects(/^fill-price-(up|down)$/),
      bars: rects(/fill-(price-up|price-down|chart-5) opacity-\[?0?\.?75/),
    }
  }

  /**
   * Số đo của SVG cũ: 0,56em cho chữ thường, 0,6em cho nhãn chú thích đậm, riêng nhãn nền (đậm 10,5px) vẫn 0,56em.
   * Dùng số đo này thì bố cục khớp SVG từng điểm ảnh; số đo mặc định `estimateText` chỉ lệch ở nhãn nền đậm.
   */
  const legacyMeasure = (text: string, size: number, weight = 400) => text.length * size * (weight >= 600 && size !== 10.5 ? 0.6 : 0.56)
  const sceneLines = (scene: readonly DrawCommand[]) => scene.flatMap((command) => (command.op === "text" ? [command.text] : []))
  const scenePlaced = (scene: readonly DrawCommand[]) =>
    scene.flatMap((command) => (command.op === "text" ? [`${command.text}|${command.align}|${command.x.toFixed(2)}|${command.y.toFixed(2)}`] : []))

  it.each([358, 760])("chiều cao bố cục khớp SVG ở %ipx trên mọi biểu đồ thật", (width) => {
    const mismatches: string[] = []
    for (const chart of real) {
      const layout = layoutStatic(seriesPanelsToIQLine(chart.model), { width })
      const { height } = svgOf(chart.model, width)
      if (Math.abs(layout.height - height) > 0.001) mismatches.push(`${chart.lessonId} ${chart.id}: ${layout.height} khác ${height}`)
    }
    expect(mismatches).toEqual([])
  })

  it.each([358, 760])("in cùng tập dòng chữ với SVG ở %ipx (nhãn tiêu đề, trục, nền, mốc, điểm, ghi chú, mức, vùng, Fibonacci)", (width) => {
    const differing: string[] = []
    for (const chart of real) {
      const scene = buildStaticScene(seriesPanelsToIQLine(chart.model), { width, dpr: 1 }, {})
      const a = sceneLines(scene).sort()
      const b = svgOf(chart.model, width).lines.sort()
      if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(`${chart.lessonId} ${chart.id}`)
    }
    expect(differing).toEqual([])
  })

  it.each([358, 760])("đặt từng dòng chữ đúng vị trí và cách căn như SVG ở %ipx", (width) => {
    const differing: string[] = []
    for (const chart of real) {
      const scene = buildStaticScene(seriesPanelsToIQLine(chart.model), { width, dpr: 1 }, { measureText: legacyMeasure })
      const a = scenePlaced(scene).sort()
      const b = svgOf(chart.model, width).placed.sort()
      if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(`${chart.lessonId} ${chart.id}: ${a.filter((line) => !b.includes(line)).slice(0, 2).join(" ; ")} // ${b.filter((line) => !a.includes(line)).slice(0, 2).join(" ; ")}`)
    }
    expect(differing).toEqual([])
  })

  it.each([358, 760])("thân nến và cột có cùng toạ độ với SVG ở %ipx", (width) => {
    const differing: string[] = []
    let compared = 0
    for (const chart of real) {
      const scene = buildStaticScene(seriesPanelsToIQLine(chart.model), { width, dpr: 1 }, {})
      const rectsOf = (alpha: number | undefined, tokens: readonly string[]) =>
        scene.flatMap((command) => {
          if (command.op !== "rects" || command.alpha !== alpha || !tokens.includes(command.token)) return []
          return Array.from({ length: command.count / 4 }, (_, k) => [...command.data.slice(k * 4, k * 4 + 4)].map((value) => value.toFixed(2)).join(","))
        })
      const svg = svgOf(chart.model, width)
      const bodies = rectsOf(undefined, ["price-up", "price-down"]).sort()
      const bars = rectsOf(0.75, ["price-up", "price-down", "chart-5"]).sort()
      compared += bodies.length + bars.length
      if (JSON.stringify(bodies) !== JSON.stringify(svg.candleBodies.sort())) differing.push(`${chart.lessonId} ${chart.id} nến`)
      if (JSON.stringify(bars) !== JSON.stringify(svg.bars.sort())) differing.push(`${chart.lessonId} ${chart.id} cột`)
    }
    expect(differing).toEqual([])
    // Không rỗng: 40 biểu đồ có nến và 20 có cột, mỗi biểu đồ vài chục phần tử.
    expect(compared).toBeGreaterThan(1500)
  })

  it.each([358, 760])("đường chuỗi, dải, mức, đoạn, Fibonacci, vùng và dấu có cùng toạ độ với SVG ở %ipx", (width) => {
    const differing: string[] = []
    let compared = 0
    const fixed = (values: ArrayLike<number>) => Array.from(values, (value) => value.toFixed(2)).join(",")
    for (const chart of real) {
      const panels = seriesPanelsToIQLine(chart.model)
      const scene = buildStaticScene(panels, { width, dpr: 1 }, {})
      const svg = svgOf(chart.model, width)
      const segments = scene.flatMap((command) => {
        if (command.op !== "lines") return []
        return Array.from({ length: command.count / 4 }, (_, k) => fixed(command.data.slice(k * 4, k * 4 + 4)))
      })
      const polylines = scene.flatMap((command) => (command.op === "polyline" ? [fixed(command.data.slice(0, command.count))] : []))
      const polygons = scene.flatMap((command) => (command.op === "polygon" ? [fixed(command.data.slice(0, command.count))] : []))
      const circles = scene.flatMap((command) => (command.op === "circle" && command.token !== "card" ? [fixed([command.x, command.y, command.radius])] : []))
      const shades = scene.flatMap((command) => {
        if (command.op !== "rects" || (command.alpha !== 0.1 && command.alpha !== 0.14)) return []
        return Array.from({ length: command.count / 4 }, (_, k) => `${command.alpha}|${fixed(command.data.slice(k * 4, k * 4 + 4))}`)
      })
      const same = (name: string, ours: string[], theirs: string[]) => {
        compared += ours.length
        if (JSON.stringify([...ours].sort()) !== JSON.stringify([...theirs].sort())) differing.push(`${chart.lessonId} ${chart.id}: ${name} ${ours.length} khác ${theirs.length}`)
      }
      // Hình thu nhỏ vẽ khung viền bằng bốn đoạn thay cho một hình chữ nhật: chỉ so các loại còn lại.
      if (chart.model.axes !== false) same("đoạn thẳng", segments, svg.segments)
      same("đường gấp khúc", polylines, svg.polylines)
      same("đa giác", polygons, svg.polygons)
      same("dấu", circles, svg.circles)
      same("vùng mờ", shades, svg.shades)
    }
    expect(differing).toEqual([])
    // Không rỗng: hàng nghìn phần tử qua so sánh.
    expect(compared).toBeGreaterThan(3000)
  })

  it("giá trị crosshair khớp bảng đọc của SVG", () => {
    const panels = seriesPanelsToIQLine(sample)
    const rows = staticReadout(panels, 3)
    expect(rows.map((row) => [row.name, row.value, row.digits])).toEqual(seriesPanelsReadout(sample, 3).map((row) => [row.name, row.value, row.digits]))
  })
})
