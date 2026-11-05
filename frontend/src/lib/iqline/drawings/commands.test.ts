/** Dựng lệnh vẽ: lệnh theo pixel thiết bị, cắt trong khung, màu là tên token, nhãn theo formatPrice. */
import { describe, expect, it } from "vitest"

import { makeCoords } from "./__fixtures__/coords"
import { ADVANCED_SAMPLE } from "./__fixtures__/advanced-samples"
import { BASIC_SAMPLE } from "./__fixtures__/basic-samples"
import { ALL_TOOLS, TOOL_SPECS, FIB_FORBIDDEN_TOKENS, drawingCommands, handleCommands, measureLabel, previewCommands } from "./index"
import type { Anchor, DrawCommand, Drawing, DrawingTool } from "../types"

const COORDS = makeCoords({
  mode: "session",
  viewport: { from: -0.5, to: 49.5 },
  plot: { left: 0, top: 0, right: 500, bottom: 300 },
  price: { low: 0, high: 300 },
})
// 10px mỗi phiên, tâm nến ở (index + 0.5) x 10; y = 300 - giá.

function shape(id: string, tool: DrawingTool, points: [number, number][], extra: Partial<Drawing> = {}): Drawing {
  return { id, tool, anchors: points.map(([session, price]): Anchor => ({ session, price })), style: { ...TOOL_SPECS[tool].defaultStyle }, ...extra }
}

const SAMPLE: Record<DrawingTool, [number, number][]> = {
  trend: [[5, 100], [30, 200]],
  ray: [[5, 100], [30, 200]],
  extended: [[5, 100], [30, 200]],
  horizontal: [[10, 150]],
  "horizontal-ray": [[10, 150]],
  vertical: [[10, 150]],
  channel: [[5, 100], [30, 150], [15, 200]],
  "fib-retracement": [[5, 100], [30, 200]],
  "fib-extension": [[5, 100], [20, 200], [30, 150]],
  rectangle: [[5, 100], [30, 200]],
  "elliott-5": [[2, 100], [8, 160], [12, 130], [22, 220], [28, 180], [40, 260]],
  "elliott-abc": [[2, 100], [10, 220], [18, 160], [30, 250]],
  note: [[10, 150]],
  measure: [[5, 100], [30, 200]],
  // Đợt 2: điểm mẫu dùng chung (tools-advanced.ts).
  ...ADVANCED_SAMPLE,
  // Đợt 1: điểm mẫu dùng chung (tools-basic.ts).
  ...BASIC_SAMPLE,
}

const tokensOf = (commands: DrawCommand[]) => commands.flatMap((command) => ("token" in command ? [command.token] : []))

describe("lệnh vẽ", () => {
  it("không có hình thì không có lệnh nào", () => {
    expect(drawingCommands([], COORDS)).toEqual([])
    expect(drawingCommands([shape("a", "trend", SAMPLE.trend, { hidden: true })], COORDS)).toEqual([])
  })

  it("mỗi công cụ cho ra lệnh vẽ bọc trong clip theo khung vẽ, toạ độ hữu hạn", () => {
    for (const tool of ALL_TOOLS) {
      const commands = drawingCommands([shape("a", tool, SAMPLE[tool], { text: "Ghi chú" })], COORDS)
      expect(commands[0], tool).toEqual({ op: "clip", x: 0, y: 0, width: 500, height: 300 })
      expect(commands.at(-1), tool).toEqual({ op: "unclip" })
      expect(commands.length, tool).toBeGreaterThan(2)
      for (const command of commands) {
        if ("data" in command) expect([...command.data.subarray(0, command.count)].every(Number.isFinite), tool).toBe(true)
      }
    }
  })

  it("đường xu hướng: một đoạn đúng toạ độ, màu là tên token, độ dày theo style", () => {
    const [, line] = drawingCommands([shape("a", "trend", [[5, 100], [30, 200]])], COORDS)
    expect(line).toMatchObject({ op: "lines", token: "chart-2", count: 4 })
    expect(line.op === "lines" && Array.from(line.data)).toEqual([55, 200, 305, 100])
    expect(line.op === "lines" && line.width).toBe(1.7)
  })

  it("nhân theo dpr: toạ độ, độ dày, nét đứt và clip", () => {
    const drawing = shape("a", "trend", [[5, 100], [30, 200]])
    drawing.style = { ...drawing.style, dash: "dashed" }
    const commands = drawingCommands([drawing], COORDS, { dpr: 2 })
    expect(commands[0]).toEqual({ op: "clip", x: 0, y: 0, width: 1000, height: 600 })
    const line = commands[1]
    expect(line.op === "lines" && Array.from(line.data)).toEqual([110, 400, 610, 200])
    expect(line.op === "lines" && line.width).toBeCloseTo(3.4, 6)
    expect(line.op === "lines" && line.dash).toEqual([12, 8])
  })

  it("hình đang chọn vẽ đậm hơn", () => {
    const drawing = shape("a", "trend", SAMPLE.trend)
    const plain = drawingCommands([drawing], COORDS)[1]
    const picked = drawingCommands([drawing], COORDS, { selectedId: "a" })[1]
    expect(plain.op === "lines" && picked.op === "lines" && picked.width > plain.width).toBe(true)
  })

  it("tia và đường kéo dài chạm biên khung vẽ, đường ngang kéo hết bề ngang kèm nhãn giá", () => {
    const ray = drawingCommands([shape("a", "ray", [[5, 100], [30, 200]])], COORDS)[1]
    expect(ray.op === "lines" && ray.data[2]).toBe(500)
    const extended = drawingCommands([shape("a", "extended", [[5, 100], [30, 200]])], COORDS)[1]
    expect(extended.op === "lines" && extended.data[0]).toBe(0)
    expect(extended.op === "lines" && extended.data[2]).toBe(500)
    const horizontal = drawingCommands([shape("a", "horizontal", [[10, 150]])], COORDS, { formatPrice: (price) => `G${price}` })
    expect(horizontal[1].op === "lines" && Array.from(horizontal[1].data)).toEqual([0, 150, 500, 150])
    expect(horizontal.find((command) => command.op === "text")).toMatchObject({ text: "G150", align: "right" })
  })

  it("Fibonacci: bảy mức, nhãn đi qua formatPrice, vùng 38,2 đến 61,8% tô nhạt, không có màu cấm", () => {
    const commands = drawingCommands([shape("f", "fib-retracement", [[5, 100], [30, 200]])], COORDS, { formatPrice: (price) => price.toFixed(1) })
    const labels = commands.flatMap((command) => (command.op === "text" ? [command.text] : []))
    expect(labels).toHaveLength(7)
    expect(labels[0]).toBe("0% · 200.0")
    expect(labels[4]).toBe("61,8% · 138.2")
    expect(labels[6]).toBe("100% · 100.0")
    const zone = commands.find((command) => command.op === "rects")
    expect(zone).toMatchObject({ token: "chart-1", alpha: 0.1, count: 4 })
    for (const token of tokensOf(commands)) expect(FIB_FORBIDDEN_TOKENS).not.toContain(token)
    expect(commands.filter((command) => command.op === "lines")).toHaveLength(8)
  })

  it("Fibonacci: khoảng giá bình thường thì mọi nhãn cùng một cột; khoảng giá hẹp thì nhãn dời sang phải, không đè nhau", () => {
    const labelsOf = (commands: DrawCommand[]) => commands.flatMap((command) => (command.op === "text" ? [command] : []))
    const wide = labelsOf(drawingCommands([shape("f", "fib-retracement", [[5, 100], [30, 200]])], COORDS))
    expect(new Set(wide.map((label) => label.x)).size).toBe(1)

    // Chênh 20 đơn vị giá = 20px cho bảy mức: nhiều mức sát nhau hơn một dòng chữ (11px).
    const narrow = labelsOf(drawingCommands([shape("f", "fib-retracement", [[5, 100], [30, 120]])], COORDS))
    expect(narrow).toHaveLength(7)
    expect(new Set(narrow.map((label) => label.x)).size).toBeGreaterThan(1)
    // Hộp sát chữ thật (cỡ 11px: chữ số cao 8px trên đường cơ sở, dấu phẩy xuống 2px).
    const boxes = narrow.map((label) => ({ l: label.x, r: label.x + label.text.length * 6.6, t: label.y - 8, b: label.y + 2 }))
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const overlap = boxes[a].l < boxes[b].r && boxes[b].l < boxes[a].r && boxes[a].t < boxes[b].b && boxes[b].t < boxes[a].b
        expect(overlap, `${narrow[a].text} với ${narrow[b].text}`).toBe(false)
      }
    }
    // Nhãn vẫn nằm trong khung vẽ và vẫn đủ bảy mức.
    for (const label of narrow) expect(label.x).toBeLessThan(500)
  })

  it("Fibonacci mở rộng chỉ có mức khi đủ ba điểm; thước đo ghi chênh lệch, phần trăm và số nến", () => {
    const partial = previewCommands({ tool: "fib-extension", anchors: [{ session: 5, price: 100 }, { session: 20, price: 200 }] }, null, COORDS)
    expect(partial.some((command) => command.op === "text")).toBe(false)
    const full = drawingCommands([shape("e", "fib-extension", SAMPLE["fib-extension"])], COORDS)
    expect(full.filter((command) => command.op === "text")).toHaveLength(7)
    expect(measureLabel({ price: 100, index: 5 }, { price: 124.8, index: 30 }, (price) => price.toFixed(1))).toBe("+24.8 (+24,80%) · 25 nến")
    expect(measureLabel({ price: 200, index: 30 }, { price: 150, index: 10 }, (price) => String(price))).toBe("-50 (-25,00%) · 20 nến")
    const measure = drawingCommands([shape("m", "measure", SAMPLE.measure)], COORDS)
    expect(measure.find((command) => command.op === "text")).toMatchObject({ text: expect.stringContaining("25 nến"), tabular: true })
  })

  it("sóng Elliott có nhãn đúng số sóng; ghi chú chỉ có chữ khi có nội dung", () => {
    const five = drawingCommands([shape("w", "elliott-5", SAMPLE["elliott-5"])], COORDS)
    expect(five.flatMap((command) => (command.op === "text" ? [command.text] : []))).toEqual(["1", "2", "3", "4", "5"])
    const abc = drawingCommands([shape("w", "elliott-abc", SAMPLE["elliott-abc"])], COORDS)
    expect(abc.flatMap((command) => (command.op === "text" ? [command.text] : []))).toEqual(["A", "B", "C"])
    const empty = drawingCommands([shape("n", "note", SAMPLE.note)], COORDS)
    expect(empty.some((command) => command.op === "text")).toBe(false)
    const withText = drawingCommands([shape("n", "note", SAMPLE.note, { text: "Hỗ trợ" })], COORDS)
    expect(withText.find((command) => command.op === "text")).toMatchObject({ text: "Hỗ trợ", token: "foreground" })
  })

  it("hình chưa đủ điểm neo hoặc có điểm neo khác loại thì bỏ qua", () => {
    expect(drawingCommands([shape("c", "channel", [[5, 100], [30, 150]])], COORDS)).toEqual([])
    const foreign: Drawing = { id: "x", tool: "trend", anchors: [{ time: 1, price: 1 }, { time: 2, price: 2 }], style: TOOL_SPECS.trend.defaultStyle }
    expect(drawingCommands([foreign], COORDS)).toEqual([])
  })

  it("không dùng dấu gạch dài trong chữ hiển thị", () => {
    for (const tool of ALL_TOOLS) {
      const texts = drawingCommands([shape("a", tool, SAMPLE[tool], { text: "x" })], COORDS).flatMap((command) => (command.op === "text" ? [command.text] : []))
      for (const value of texts) expect(value).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe("tay nắm và bản xem trước", () => {
  it("hình đang chọn có hai vòng tròn mỗi điểm neo (nền và viền); hình khoá không có tay nắm", () => {
    const drawing = shape("a", "trend", SAMPLE.trend)
    const handles = handleCommands(drawing, COORDS)
    expect(handles).toHaveLength(4)
    expect(handles[0]).toMatchObject({ op: "circle", token: "background", fill: true, x: 55, y: 200 })
    expect(handles[1]).toMatchObject({ op: "circle", token: "chart-2", fill: false })
    expect(handleCommands({ ...drawing, locked: true }, COORDS)).toEqual([])
    expect(handleCommands(null, COORDS)).toEqual([])
  })

  it("xem trước: các điểm đã bấm cộng điểm con trỏ, tay nắm chỉ ở điểm đã bấm", () => {
    const commands = previewCommands({ tool: "trend", anchors: [{ session: 5, price: 100 }] }, { session: 30, price: 200 }, COORDS)
    expect(commands.filter((command) => command.op === "lines")).toHaveLength(1)
    expect(commands.filter((command) => command.op === "circle")).toHaveLength(2)
    expect(previewCommands(null, null, COORDS)).toEqual([])
    expect(previewCommands({ tool: "trend", anchors: [] }, null, COORDS)).toEqual([])
  })
})
