import { describe, expect, it } from "vitest"

import type { StaticFrame, StaticPanel } from "../static-types"
import type { ColorToken, DrawCommand } from "../types"
import {
  buildStaticCrosshair,
  buildStaticScene,
  fibToken,
  layoutStatic,
  niceTicks,
  resolveStaticPalette,
  staticLegend,
  staticObservationLabel,
  staticReadout,
  staticReadoutText,
} from "./static"

const range = (n: number, f: (k: number) => number) => Array.from({ length: n }, (_, k) => Math.round(f(k) * 100) / 100)

const frame = (overrides: Partial<StaticFrame> = {}): StaticFrame => ({ start: 70, end: 99, marks: [], axes: true, ...overrides })
const closes = range(30, (k) => 50 + Math.sin(k / 3) * 4 + k * 0.2)

/** Hai ô: giá (nến, dải, vùng, mức, đoạn, Fibonacci, ghi chú) và MACD (đường, tô giữa, cột). */
function sample(shared: StaticFrame = frame({ shade: [{ from: 72, to: 76, token: "price-up", label: "Tích lũy", labelToken: "price-up" }], marks: [{ i: 80, label: "A" }] })): StaticPanel[] {
  const histogram = range(30, (k) => Math.sin(k / 4) - Math.sin((k - 2) / 4))
  return [
    {
      frame: shared,
      title: "Giá",
      digits: 1,
      candles: { open: closes.map((c) => c - 0.5), high: closes.map((c) => c + 1), low: closes.map((c) => c - 1.2), close: closes },
      series: [
        { name: "Giá", token: "foreground", width: 2, values: closes },
        { name: "MA20", token: "chart-1", dash: true, values: range(30, (k) => 50 + k * 0.2) },
      ],
      band: { upper: closes.map((c) => c + 2), lower: closes.map((c) => c - 2), token: "chart-1" },
      zones: [{ from: 52, to: 54, token: "chart-2", label: "Vùng cản", labelToken: "chart-2" }],
      levels: [{ value: 55, role: "sell", token: "price-down", label: "Kháng cự", labelToken: "price-down" }],
      segments: [{ from: [75, 50], to: [85, 53], token: "price-up", extend: 5, dash: true }],
      fib: { lo: { i: 72, v: 48 }, hi: { i: 90, v: 56 }, dir: "up", levels: [0, 0.382, 0.5, 0.618, 1], zone: [0.5, 0.618], token: "chart-2" },
      notes: [{ i: 95, value: 49, text: "Cắt lỗ", token: "price-down" }],
      points: [{ i: 85, value: closes[15], token: "price-up", labelToken: "price-up", label: "Mua", pos: "above" }],
    },
    {
      frame: shared,
      title: "MACD (12, 26, 9)",
      zero: true,
      series: [
        { name: "MACD", token: "chart-1", values: range(30, (k) => Math.sin(k / 4)) },
        { name: "Đường tín hiệu", token: "chart-2", values: range(30, (k) => Math.sin((k - 2) / 4)) },
      ],
      fill_between: { a: 0, b: 1, aboveToken: "price-up", belowToken: "price-down" },
      bars: { name: "Histogram", values: histogram, tokens: histogram.map((v) => (v >= 0 ? "price-up" : "price-down")) },
      points: [{ i: 85, value: 0.3, token: "price-up", labelToken: "price-up", shape: "ring" }],
    },
  ]
}

const geometry = { width: 580, dpr: 1 }
const ops = (scene: readonly DrawCommand[]) => scene.map((command) => command.op)
const texts = (scene: readonly DrawCommand[]) => scene.flatMap((command) => (command.op === "text" ? [command] : []))
const tokensOf = (scene: readonly DrawCommand[]) => new Set(scene.flatMap((command) => ("token" in command ? [command.token] : [])))

describe("layoutStatic: bố cục giữ đúng kích thước của biểu đồ SVG", () => {
  it("một ô có tiêu đề: lề 6, lề phải 52, ô cao 236, hàng tiêu đề 20, đáy 6", () => {
    const layout = layoutStatic([{ frame: frame(), title: "Giá", series: [{ name: "A", token: "chart-1", values: closes }] }], geometry)
    expect(layout).toMatchObject({ width: 580, left: 6, right: 528, count: 30, narrow: false, thumbnail: false, topPad: 0, hasTicks: false })
    expect(layout.panels[0]).toMatchObject({ top: 20, bottom: 256 })
    expect(layout.height).toBe(262)
    expect(layout.step).toBeCloseTo((528 - 6) / 30, 10)
  })

  it("hai ô: ô đầu cao 204, ô sau cao 118, khoảng cách 8, nhãn nền và mốc đẩy phần đầu xuống", () => {
    const layout = layoutStatic(sample(), geometry)
    expect(layout.topPad).toBe(18)
    expect(layout.panels.map((panel) => [panel.top, panel.bottom])).toEqual([
      [38, 242],
      [270, 388],
    ])
    expect(layout.height).toBe(394)
  })

  it("điện thoại hẹp: lề phải 42, ô thấp hơn", () => {
    const layout = layoutStatic(sample(), { width: 358 })
    expect(layout.narrow).toBe(true)
    expect(layout.right).toBe(316)
    expect(layout.panels.map((panel) => panel.bottom - panel.top)).toEqual([176, 104])
  })

  it("trục x có nhãn thêm một hàng 20 và nhãn nền xếp hàng khi đè nhau", () => {
    const ticks = range(30, (k) => k).map((k) => (k % 10 === 0 ? `T${k}` : ""))
    const base = layoutStatic(sample(frame({ ticks })), geometry)
    expect(base.hasTicks).toBe(true)
    expect(base.height).toBe(layoutStatic(sample(frame()), geometry).height + 20 - 6)
    const crowded = frame({
      shade: [
        { from: 80, to: 81, token: "price-up", label: "Phân phối", labelToken: "price-up" },
        { from: 81, to: 82, token: "price-down", label: "Giảm giá", labelToken: "price-down" },
      ],
    })
    const layout = layoutStatic(sample(crowded), { width: 260 })
    expect(new Set(layout.shadeLabels.map((label) => label.row)).size).toBeGreaterThan(1)
    expect(layout.topPad).toBe(18 + 14)
  })

  it("hình thu nhỏ: không tiêu đề, không lưới, ô thấp theo tỷ lệ 96px", () => {
    const thumb: StaticPanel = { frame: frame({ axes: false, start: 0, end: 9 }), title: "", series: [], candles: { open: range(10, (k) => 10 + k), high: range(10, (k) => 12 + k), low: range(10, (k) => 9 + k), close: range(10, (k) => 11 + k) } }
    const layout = layoutStatic([thumb], { width: 580 })
    expect(layout.thumbnail).toBe(true)
    expect(layout.left).toBe(2)
    expect(layout.right).toBe(578)
    expect(layout.panels[0].ticks).toEqual([])
    expect(layout.panels[0].bottom - layout.panels[0].top).toBe(Math.round(96 * ((580 * 0.32) / 96)))
    expect(layout.height).toBe(layout.panels[0].bottom)
  })

  it("không có ô thì bố cục và cảnh rỗng", () => {
    expect(layoutStatic([], geometry).count).toBe(0)
    expect(buildStaticScene([], geometry)).toEqual([])
    expect(buildStaticCrosshair([], geometry, {}, 0)).toBeNull()
  })

  it("đổi toạ độ hai chiều và chọn quan sát dưới con trỏ", () => {
    const layout = layoutStatic(sample(), geometry)
    for (const k of [0, 7, 29]) expect(layout.indexOfX(layout.xOfIndex(k))).toBe(k)
    expect(layout.indexOfX(-50)).toBe(0)
    expect(layout.indexOfX(9999)).toBe(29)
    const panel = layout.panels[0]
    expect(panel.valueOfY(panel.yOfValue(52.5))).toBeCloseTo(52.5, 8)
    expect(layout.tooltipSide(2)).toBe("right")
    expect(layout.tooltipSide(28)).toBe("left")
  })

  it("nhãn vạch lưới: nằm trong khoảng giá, ô cuối đóng bằng đường đáy khi cận tường minh thấp hơn vạch thấp nhất", () => {
    const shared = frame({ ticks: range(30, (k) => k).map((k) => (k % 10 === 0 ? `T${k}` : "")) })
    const panels: StaticPanel[] = [
      { frame: shared, title: "", series: [{ name: "A", token: "chart-1", values: range(30, (k) => 10 + k) }], bounds: [0, 100], ticks: [60, 80] },
    ]
    const layout = layoutStatic(panels, geometry)
    expect(layout.panels[0].ticks).toEqual([60, 80])
    expect(layout.panels[0].baseline).toBe(true)
  })
})

describe("niceTicks", () => {
  it("giữ hành vi của biểu đồ SVG", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(niceTicks(3, 3)).toEqual([3])
  })
})

describe("buildStaticScene: danh sách lệnh", () => {
  it("thứ tự trong một ô: tiêu đề, lưới, nhãn vạch, clip, dữ liệu, unclip, dấu, nhãn chú thích", () => {
    const scene = buildStaticScene([{ frame: frame({ start: 0, end: 4 }), title: "Giá", digits: 0, bounds: [0, 10], ticks: [0, 5, 10], series: [{ name: "A", token: "chart-1", values: [1, 2, 3, 4, 5] }] }], geometry)
    expect(ops(scene)).toEqual(["text", "lines", "text", "text", "text", "clip", "polyline", "unclip"])
    const [title, grid, ...rest] = scene
    expect(title).toMatchObject({ op: "text", token: "academy-label", text: "Giá", align: "left", size: 11, weight: 600, x: 6 })
    expect(grid).toMatchObject({ op: "lines", token: "border", width: 0.8, count: 12 })
    expect(rest.slice(0, 3).map((command) => command.op === "text" && [command.text, command.align, command.tabular])).toEqual([
      ["0", "left", true],
      ["5", "left", true],
      ["10", "left", true],
    ])
    expect(scene[6]).toMatchObject({ op: "polyline", token: "chart-1", width: 1.5, count: 10 })
  })

  it("nến: râu và thân theo price-up và price-down, bề rộng thân theo bước, thân tối thiểu 1px", () => {
    const candles = { open: [10, 12], high: [13, 13], low: [9, 9], close: [12, 10] }
    const scene = buildStaticScene([{ frame: frame({ start: 0, end: 1 }), title: "", bounds: [8, 14], series: [], candles }], geometry)
    const bodies = scene.flatMap((command) => (command.op === "rects" ? [command] : []))
    expect(bodies.map((command) => [command.token, command.count, command.alpha])).toEqual([
      ["price-up", 4, undefined],
      ["price-down", 4, undefined],
    ])
    const wicks = scene.flatMap((command) => (command.op === "lines" && (command.token === "price-up" || command.token === "price-down") ? [command] : []))
    expect(wicks.map((command) => [command.token, command.width, command.count])).toEqual([
      ["price-up", 1, 4],
      ["price-down", 1, 4],
    ])
    // Nến thiếu số liệu bị bỏ cả râu lẫn thân.
    const gap = buildStaticScene([{ frame: frame({ start: 0, end: 1 }), title: "", bounds: [8, 14], series: [], candles: { ...candles, high: [13, null] } }], geometry)
    expect(gap.filter((command) => command.op === "rects" && command.token === "price-down")).toHaveLength(0)
  })

  it("giá trị thiếu làm đứt đường: mỗi đoạn liên tục là một polyline, đoạn một điểm bị bỏ", () => {
    const scene = buildStaticScene([{ frame: frame({ start: 0, end: 7 }), title: "", series: [{ name: "A", token: "chart-1", values: [1, 2, 3, null, 5, null, 7, 8] }] }], geometry)
    const lines = scene.flatMap((command) => (command.op === "polyline" ? [command.count] : []))
    expect(lines).toEqual([6, 4])
  })

  it("dải có hai mép là hai đường riêng cộng phần tô một màu", () => {
    const scene = buildStaticScene([{ frame: frame({ start: 0, end: 3 }), title: "", series: [], band: { upper: [5, 6, 7, 8], lower: [1, 2, 3, 4], token: "chart-1" } }], geometry)
    expect(scene.flatMap((command) => (command.op === "polygon" ? [[command.token, command.alpha, command.count]] : []))).toEqual([["chart-1", 0.12, 16]])
    expect(scene.filter((command) => command.op === "polyline" && command.token === "chart-1")).toHaveLength(2)
  })

  it("tô giữa hai chuỗi đổi màu theo dấu của a - b", () => {
    const scene = buildStaticScene(
      [
        {
          frame: frame({ start: 0, end: 5 }),
          title: "",
          series: [
            { name: "a", token: "chart-1", values: [2, 3, 4, 1, 0, 1] },
            { name: "b", token: "chart-2", values: [1, 1, 1, 2, 2, 2] },
          ],
          fill_between: { a: 0, b: 1, aboveToken: "price-up", belowToken: "price-down" },
        },
      ],
      geometry,
    )
    const fills = scene.flatMap((command) => (command.op === "polygon" ? [[command.token, command.alpha]] : []))
    expect(fills).toEqual([
      ["price-up", 0.18],
      ["price-down", 0.18],
    ])
  })

  it("cột tô một màu theo từng cột, nhóm theo token, trong suốt 0,75", () => {
    const scene = buildStaticScene(sample(), geometry)
    const bars = scene.flatMap((command) => (command.op === "rects" && command.alpha === 0.75 ? [[command.token, command.count]] : []))
    expect(bars.reduce((sum, [, count]) => sum + (count as number), 0)).toBe(30 * 4)
    expect(new Set(bars.map(([token]) => token))).toEqual(new Set(["price-up", "price-down"]))
  })

  it("mọi nhãn chữ trong khung vẽ, không nhãn nào đè nhau, đủ nhãn của đề bài", () => {
    for (const width of [358, 580, 760]) {
      const scene = buildStaticScene(sample(), { width, dpr: 1 })
      const labels = texts(scene)
      for (const expected of ["Giá", "MACD (12, 26, 9)", "61,8%", "Cắt lỗ", "Mua", "Tích lũy", "Kháng cự", "Vùng cản", "A"]) expect(labels.map((label) => label.text)).toContain(expected)
      const layout = layoutStatic(sample(), { width })
      const annotations = labels
        .filter((label) => ["Cắt lỗ", "Mua", "Kháng cự", "Vùng cản", "61,8%"].includes(label.text))
        .map((label) => {
          const size = label.size ?? 11
          const w = label.text.length * size * 0.6
          const l = label.align === "left" ? label.x : label.align === "right" ? label.x - w : label.x - w / 2
          return { text: label.text, l, r: l + w, t: label.y - size * 0.8, b: label.y + size * 0.2 }
        })
      expect(annotations).toHaveLength(5)
      for (const box of annotations) {
        expect(box.l).toBeGreaterThanOrEqual(layout.left - 3)
        expect(box.r).toBeLessThanOrEqual(layout.right + 3)
      }
      for (let a = 0; a < annotations.length; a += 1)
        for (let b = a + 1; b < annotations.length; b += 1) {
          const [p, q] = [annotations[a], annotations[b]]
          expect(p.l < q.r - 0.5 && q.l < p.r - 0.5 && p.t < q.b - 0.5 && q.t < p.b - 0.5, `${p.text} | ${q.text} ở ${width}px`).toBe(false)
        }
    }
  })

  it("clip và unclip luôn cân nhau, đúng một cặp cho mỗi ô", () => {
    const scene = buildStaticScene(sample(), geometry)
    expect(scene.filter((command) => command.op === "clip")).toHaveLength(2)
    expect(scene.filter((command) => command.op === "unclip")).toHaveLength(2)
    let depth = 0
    for (const command of scene) {
      depth += command.op === "clip" ? 1 : command.op === "unclip" ? -1 : 0
      expect(depth).toBeGreaterThanOrEqual(0)
      expect(depth).toBeLessThanOrEqual(1)
    }
  })

  it("hình thu nhỏ chỉ vẽ số liệu: khung viền, không chữ trục, không tiêu đề", () => {
    const thumb: StaticPanel = { frame: frame({ axes: false, start: 0, end: 4 }), title: "Bị bỏ", series: [{ name: "A", token: "chart-1", values: [1, 2, 3, 4, 5] }] }
    const scene = buildStaticScene([thumb], geometry)
    expect(texts(scene)).toHaveLength(0)
    expect(scene[0]).toMatchObject({ op: "lines", token: "border", count: 16 })
  })

  it("hàm thuần: cùng đầu vào cho cùng danh sách lệnh và không sửa dữ liệu vào", () => {
    const panels = sample()
    const snapshot = JSON.stringify(panels)
    const a = buildStaticScene(panels, geometry)
    const b = buildStaticScene(panels, geometry)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(panels)).toBe(snapshot)
  })

  it("nhân dpr: toạ độ, độ dày nét, nét đứt, bán kính và cỡ chữ đều theo pixel thiết bị", () => {
    const one = buildStaticScene(sample(), { width: 580, dpr: 1 })
    const two = buildStaticScene(sample(), { width: 580, dpr: 2 })
    expect(ops(two)).toEqual(ops(one))
    one.forEach((command, index) => {
      const other = two[index]
      if ("data" in command && "data" in other) {
        expect(other.count).toBe(command.count)
        command.data.forEach((value, k) => expect(other.data[k]).toBeCloseTo(value * 2, 9))
      }
      if (command.op === "lines" || command.op === "polyline") {
        expect((other as typeof command).width).toBeCloseTo(command.width * 2, 9)
        expect((other as typeof command).dash).toEqual(command.dash?.map((value) => value * 2))
      }
      if (command.op === "text") {
        expect((other as typeof command).size).toBe((command.size ?? 0) * 2)
        expect((other as typeof command).x).toBeCloseTo(command.x * 2, 9)
        expect((other as typeof command).y).toBeCloseTo(command.y * 2, 9)
      }
      if (command.op === "circle") expect((other as typeof command).radius).toBe(command.radius * 2)
    })
  })

  it("đo chữ qua measureText truyền vào: chữ rộng hơn thì nhãn dài phải ngắt dòng", () => {
    const panels: StaticPanel[] = [
      {
        frame: frame({ start: 0, end: 9 }),
        title: "",
        series: [{ name: "A", token: "chart-1", values: range(10, (k) => 10 + k) }],
        notes: [{ i: 4, value: 14, text: "Nhãn khá dài để thử ngắt dòng tự động", token: "price-down" }],
      },
    ]
    const normal = texts(buildStaticScene(panels, { width: 320, dpr: 1 })).filter((label) => label.token === "price-down")
    const wide = texts(buildStaticScene(panels, { width: 320, dpr: 1 }, { measureText: (text, size) => text.length * size * 1.4 })).filter((label) => label.token === "price-down")
    expect(wide.length).toBeGreaterThan(normal.length)
  })
})

describe("màu theo DESIGN.md và §7", () => {
  it("chữ dùng academy-label hoặc màu ngữ nghĩa, không bao giờ muted-foreground", () => {
    for (const width of [358, 760]) {
      const scene = buildStaticScene(sample(), { width, dpr: 1 })
      const crosshair = buildStaticCrosshair(sample(), { width, dpr: 1 }, {}, 4)
      for (const command of [...scene, ...(crosshair?.scene ?? [])]) if ("token" in command) expect(command.token).not.toBe("muted-foreground")
      const neutral = texts(scene).filter((label) => ["Giá", "MACD (12, 26, 9)", "0", "5"].includes(label.text))
      expect(neutral.length).toBeGreaterThan(0)
      for (const label of neutral) expect(label.token).toBe("academy-label")
    }
  })

  it("mã nguồn của static không nhắc tới muted-foreground, pages hay DOM", () => {
    const sources = Object.values(import.meta.glob(["./static.ts", "../static-types.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    expect(sources).toHaveLength(2)
    for (const source of sources) {
      expect(source).not.toContain("muted-foreground")
      expect(source).not.toMatch(/from\s+["'][^"']*pages\//)
      expect(source).not.toMatch(/\b(document|window|HTMLElement|getComputedStyle)\b/)
      expect(source).not.toMatch(/gradient/i)
    }
  })

  it("Fibonacci không bao giờ dùng chart-3, chart-4, chart-7", () => {
    expect(fibToken("chart-3")).toBe("chart-2")
    expect(fibToken("chart-4")).toBe("chart-2")
    expect(fibToken("chart-7")).toBe("chart-2")
    expect(fibToken("chart-2")).toBe("chart-2")
    for (const forbidden of ["chart-3", "chart-4", "chart-7"] as ColorToken[]) {
      const panels = sample()
      const fib = { ...panels[0].fib!, token: forbidden }
      const scene = buildStaticScene([{ ...panels[0], fib, series: [], band: undefined, levels: undefined, zones: undefined, segments: undefined, notes: undefined, points: undefined, candles: undefined }], geometry)
      expect(tokensOf(scene)).not.toContain("chart-3")
      expect(tokensOf(scene)).not.toContain("chart-4")
      expect(tokensOf(scene)).not.toContain("chart-7")
      expect(tokensOf(scene)).toContain("chart-2")
    }
    // Nhãn phần trăm Fibonacci cũng cùng màu.
    const fibLabels = texts(buildStaticScene(sample(), geometry)).filter((label) => label.text.endsWith("%"))
    expect(fibLabels.map((label) => label.token)).toEqual(Array(5).fill("chart-2"))
  })

  const colourful = (): StaticPanel[] => [
    {
      frame: frame({ start: 0, end: 5, shade: [{ from: 1, to: 2, token: "chart-8", label: "Nền", labelToken: "chart-8" }] }),
      title: "Giá",
      candles: { open: [10, 11, 12, 11, 12, 13], high: [11, 12, 13, 12, 13, 14], low: [9, 10, 11, 10, 11, 12], close: [11, 12, 11, 12, 13, 12] },
      series: [
        { name: "Giá", token: "foreground", values: [10, 11, 12, 11, 12, 13] },
        { name: "MA", token: "chart-1", values: [10, 10, 11, 11, 12, 12] },
        { name: "Ngoài", token: "chart-6", values: [9, 9, 10, 10, 11, 11] },
        { name: "AI", token: "chart-7", values: [11, 11, 11, 12, 12, 12] },
        { name: "Cam", token: "chart-8", values: [10, 10, 10, 10, 10, 10] },
      ],
    },
  ]

  it("có trần hoặc sàn thì chart-6, chart-7, chart-8 không dùng cho chuỗi khác, đổi sang chart-1, chart-2, chart-5", () => {
    const normal = buildStaticScene(colourful(), geometry)
    for (const token of ["chart-6", "chart-7", "chart-8"] as const) expect(tokensOf(normal)).toContain(token)
    for (const priceLevels of [{ ceiling: 14.4 }, { floor: 9.2 }, { ceiling: 14.4, floor: 9.2, reference: 12 }]) {
      const scene = buildStaticScene(colourful(), geometry, { priceLevels })
      for (const token of ["chart-6", "chart-7", "chart-8"] as const) expect(tokensOf(scene), JSON.stringify(priceLevels)).not.toContain(token)
      // Ba chuỗi bị cấm nhận ba màu khác nhau và khác chuỗi chart-1 đã có.
      const lineTokens = scene.flatMap((command) => (command.op === "polyline" ? [command.token] : []))
      expect(new Set(lineTokens).size).toBe(4)
      expect(new Set(lineTokens)).toEqual(new Set(["foreground", "chart-1", "chart-2", "chart-5"]))
      expect(tokensOf(buildStaticCrosshair(colourful(), geometry, { priceLevels }, 2)?.scene ?? [])).not.toContain("chart-8")
    }
  })

  it("tham chiếu thôi (không trần, sàn) thì giữ bảng màu và vẽ đường price-ref", () => {
    const scene = buildStaticScene(colourful(), geometry, { priceLevels: { reference: 12 } })
    expect(tokensOf(scene)).toContain("chart-6")
    expect(tokensOf(scene)).toContain("price-ref")
    expect(resolveStaticPalette(colourful(), { reference: 12 })("chart-7")).toBe("chart-7")
    expect(resolveStaticPalette(colourful())("chart-7")).toBe("chart-7")
  })

  it("trần, sàn, tham chiếu vẽ thành đường nét đứt đúng token và nằm trong khoảng giá", () => {
    const scene = buildStaticScene(colourful(), geometry, { priceLevels: { reference: 12, ceiling: 14.4, floor: 9.2 } })
    const dashed = scene.flatMap((command) => (command.op === "lines" && command.dash ? [command.token] : []))
    expect(dashed).toEqual(expect.arrayContaining(["price-ref", "price-ceiling", "price-floor"]))
    // Khoảng giá của ô giá mở rộng để chứa trần và sàn.
    const layout = layoutStatic(colourful(), geometry, { priceLevels: { ceiling: 14.4, floor: 9.2 } })
    expect(layout.panels[0].hi).toBeGreaterThan(14.4)
    expect(layout.panels[0].lo).toBeLessThan(9.2)
  })

  it("phẳng hoàn toàn: chỉ có nét liền hoặc đứt, tô một màu với độ mờ, không có lệnh nào khác", () => {
    const allowed = new Set(["rects", "lines", "polyline", "polygon", "circle", "text", "clip", "unclip"])
    const scene = [...buildStaticScene(sample(), geometry), ...(buildStaticCrosshair(sample(), geometry, {}, 3)?.scene ?? [])]
    for (const command of scene) expect(allowed.has(command.op)).toBe(true)
    // Vùng mờ: tô nền, vùng giá, dải, tô giữa, Fibonacci và cột có độ mờ cố định, nhỏ hơn 1.
    for (const command of scene) if (command.op === "rects" || command.op === "polygon") if (command.alpha !== undefined) expect(command.alpha).toBeLessThanOrEqual(0.75)
  })
})

describe("crosshair và chú giải", () => {
  it("trả giá trị tại chỉ số cho chú giải đọc, theo từng nến, chuỗi và cột", () => {
    const panels = sample()
    const crosshair = buildStaticCrosshair(panels, geometry, {}, 3)
    expect(crosshair).not.toBeNull()
    expect(crosshair?.index).toBe(3)
    expect(crosshair?.label).toBe("Phiên 74")
    expect(crosshair?.readout.map((row) => row.name)).toEqual(["Mở cửa", "Cao nhất", "Thấp nhất", "Đóng cửa", "Giá", "MA20", "MACD", "Đường tín hiệu", "Histogram"])
    expect(crosshair?.readout.find((row) => row.name === "Đóng cửa")?.value).toBe(closes[3])
    expect(crosshair?.readout.find((row) => row.name === "Giá")?.digits).toBe(1)
    expect(crosshair?.readout.find((row) => row.name === "MACD")?.digits).toBe(2)
    expect(staticReadout(panels, 3)).toEqual(crosshair?.readout)
    expect(staticReadoutText(panels, 0)).toMatch(/^Phiên 71: Mở cửa/)
    expect(staticReadoutText(panels, 29)).toContain("Histogram")
  })

  it("đường dọc ở tâm quan sát, trải từ hàng nhãn nền tới trục x; chấm trên từng chuỗi có số liệu", () => {
    const panels = sample()
    const layout = layoutStatic(panels, geometry)
    const crosshair = buildStaticCrosshair(panels, geometry, {}, 10)
    expect(crosshair?.x).toBeCloseTo(layout.xOfIndex(10), 10)
    const line = crosshair?.scene.find((command) => command.op === "lines")
    expect(line).toMatchObject({ token: "foreground", width: 1, dash: [3, 3], count: 4 })
    if (line?.op === "lines") expect([...line.data]).toEqual([layout.xOfIndex(10), layout.plot.top, layout.xOfIndex(10), layout.plot.bottom])
    const dots = crosshair?.scene.flatMap((command) => (command.op === "circle" && command.fill ? [command] : [])) ?? []
    // 2 chuỗi ở ô giá, 2 ở ô MACD.
    expect(dots).toHaveLength(4)
    expect(crosshair?.scene.filter((command) => command.op === "clip")).toHaveLength(2)
  })

  it("kẹp chỉ số vào cửa sổ; thiếu số liệu thì không có chấm và giá trị null, không phải 0", () => {
    const panels: StaticPanel[] = [{ frame: frame({ start: 0, end: 3 }), title: "", series: [{ name: "A", token: "chart-1", values: [1, null, 3, 4] }] }]
    expect(buildStaticCrosshair(panels, geometry, {}, -5)?.index).toBe(0)
    expect(buildStaticCrosshair(panels, geometry, {}, 99)?.index).toBe(3)
    const gap = buildStaticCrosshair(panels, geometry, {}, 1)
    expect(gap?.readout[0].value).toBeNull()
    expect(gap?.scene.some((command) => command.op === "circle")).toBe(false)
    expect(staticReadoutText(panels, 1)).toBe("Phiên 2: A Không có")
  })

  it("nhãn trục x thay cho 'Phiên n' khi có", () => {
    expect(staticObservationLabel(frame({ ticks: ["", "T2"], start: 5 }), 1)).toBe("T2")
    expect(staticObservationLabel(frame({ ticks: ["", "T2"], start: 5 }), 0)).toBe("Phiên 6")
  })

  it("hình thu nhỏ không có crosshair", () => {
    expect(buildStaticCrosshair([{ frame: frame({ axes: false }), title: "", series: [{ name: "A", token: "chart-1", values: closes }] }], geometry, {}, 2)).toBeNull()
  })

  it("chú giải: nến, chuỗi, cột; bỏ trùng nhãn; rỗng với hình thu nhỏ", () => {
    expect(staticLegend(sample())).toEqual([
      { label: "Nến giá", token: "price-up", shape: "bar", dash: false },
      { label: "Giá", token: "foreground", shape: "line", dash: false },
      { label: "MA20", token: "chart-1", shape: "line", dash: true },
      { label: "MACD", token: "chart-1", shape: "line", dash: false },
      { label: "Đường tín hiệu", token: "chart-2", shape: "line", dash: false },
      { label: "Histogram", token: "chart-5", shape: "bar", dash: false },
    ])
    expect(staticLegend([{ frame: frame({ axes: false }), title: "", series: [{ name: "A", token: "chart-1", values: closes }] }])).toEqual([])
    const twice = sample()
    twice[1] = { ...twice[1], series: [{ name: "Giá", token: "chart-1", values: closes }] }
    expect(staticLegend(twice).filter((entry) => entry.label === "Giá")).toHaveLength(1)
  })
})
