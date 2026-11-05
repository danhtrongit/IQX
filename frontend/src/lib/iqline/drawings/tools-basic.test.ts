/**
 * Công cụ vẽ đợt 1: vị thế, vẽ tự do, chú thích, đo, hình. Hình học và nhãn, chọn hình, tay nắm, kéo tay nắm, số điểm thay đổi
 * (nét bút, đường gấp khúc), không lệch khi nạp thêm lịch sử và đổi khung, và qua bộ vẽ thật (`paint-contract.test.ts` chạy cả 13 công cụ).
 */
import { describe, expect, it } from "vitest"

import { BASIC_SAMPLE } from "./__fixtures__/basic-samples"
import { evenTimes, makeCoords } from "./__fixtures__/coords"
import {
  ALL_TOOLS,
  BASIC_TOOLS,
  DOCUMENT_POINT_BUDGET,
  FLASHBACK_TOOLS,
  PATH_MAX_POINTS,
  STROKE_MAX_POINTS,
  TOOL_SPECS,
  anchorCountOf,
  capPoints,
  clicksOf,
  drawingCommands,
  drawingsReducer,
  formatDuration,
  handleCommands,
  hitDrawing,
  hitHandle,
  isRenderable,
  isVariableTool,
  maxAnchorsOf,
  moveHandle,
  positionLabels,
  previewCommands,
  priceRangeLabel,
  roundAnchor,
  simplifyStroke,
  translateDrawing,
  variablePointCount,
  createDrawingsState,
  type BasicTool,
  type DrawingsState,
} from "./index"
import { paintScene } from "../render/paint"
import { COLOR_TOKENS } from "../render/palette"
import { DEFAULT_FONT_FAMILY, TextPainter } from "../render/text"
import { fakeContext, named } from "../render/test-support"
import type { Anchor, DrawCommand, Drawing } from "../types"

/** 10px mỗi phiên, tâm nến ở (phiên + 0,5) x 10; y = 300 - giá. */
const COORDS = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, plot: { left: 0, top: 0, right: 500, bottom: 300 }, price: { low: 0, high: 300 } })
const px = (session: number) => (session + 0.5) * 10
const py = (price: number) => 300 - price

function shape(id: string, tool: BasicTool, points: [number, number][] = BASIC_SAMPLE[tool], extra: Partial<Drawing> = {}): Drawing {
  return { id, tool, anchors: points.map(([session, price]): Anchor => ({ session, price })), style: { ...TOOL_SPECS[tool].defaultStyle }, ...extra }
}

const DAY_S = 86_400

/** Điểm neo gần đúng: giá đi qua `priceOfY` nên có sai số dấu phẩy động. */
function expectAnchor(anchor: Anchor, session: number, price: number) {
  expect("session" in anchor ? anchor.session : NaN).toBeCloseTo(session, 6)
  expect(anchor.price).toBeCloseTo(price, 6)
}

const textsOf = (commands: readonly DrawCommand[]) => commands.flatMap((command) => (command.op === "text" ? [command.text] : []))
const data = (command: DrawCommand) => ("data" in command ? Array.from(command.data.subarray(0, command.count)) : [])

describe("mô tả 13 công cụ đợt 1", () => {
  it("đủ 13 công cụ, nằm trong ALL_TOOLS, khớp bảng mô tả và không trùng", () => {
    expect(BASIC_TOOLS).toHaveLength(13)
    expect(new Set(BASIC_TOOLS).size).toBe(13)
    for (const tool of BASIC_TOOLS) {
      expect(ALL_TOOLS, tool).toContain(tool)
      expect(TOOL_SPECS[tool].tool).toBe(tool)
      expect(TOOL_SPECS[tool].label).not.toMatch(/[–—]/)
    }
  })

  it("số điểm neo, số lần bấm và số điểm tối đa của từng công cụ", () => {
    expect(Object.fromEntries(BASIC_TOOLS.map((tool) => [tool, anchorCountOf(tool)]))).toEqual({
      "long-position": 3,
      "short-position": 3,
      brush: 2,
      arrow: 2,
      "arrow-up": 1,
      "arrow-down": 1,
      "price-label": 1,
      callout: 2,
      "date-range": 2,
      "date-price-range": 2,
      ellipse: 2,
      triangle: 3,
      path: 2,
    })
    expect(clicksOf("long-position")).toBe(2)
    expect(clicksOf("short-position")).toBe(2)
    expect(clicksOf("triangle")).toBe(3)
    expect(BASIC_TOOLS.filter(isVariableTool)).toEqual(["brush", "path"])
    expect(maxAnchorsOf("brush")).toBe(STROKE_MAX_POINTS)
    expect(maxAnchorsOf("path")).toBe(PATH_MAX_POINTS)
    expect(maxAnchorsOf("trend")).toBe(2)
  })

  it("Flashback dùng cả 13 công cụ đợt 1 (nhãn khoảng thời gian chỉ có số nến: flashback-fairness.test.ts)", () => {
    for (const tool of BASIC_TOOLS) expect(FLASHBACK_TOOLS).toContain(tool)
  })

  it("màu mặc định là token thật, không dùng chart-3, chart-4 hay chart-7", () => {
    for (const tool of BASIC_TOOLS) {
      const { color } = TOOL_SPECS[tool].defaultStyle
      expect(COLOR_TOKENS, tool).toContain(color)
      expect(["chart-3", "chart-4", "chart-7"], tool).not.toContain(color)
    }
  })
})

describe("lệnh vẽ: hợp đồng chung", () => {
  it("mọi công cụ ra lệnh bọc trong clip, toạ độ hữu hạn, count là số phần tử dùng được của data", () => {
    for (const tool of BASIC_TOOLS) {
      const commands = drawingCommands([shape("a", tool, undefined, { text: "Ghi chú" })], COORDS)
      expect(commands[0], tool).toEqual({ op: "clip", x: 0, y: 0, width: 500, height: 300 })
      expect(commands.at(-1), tool).toEqual({ op: "unclip" })
      expect(commands.length, tool).toBeGreaterThan(2)
      for (const command of commands) {
        if ("data" in command) {
          expect(command.count, tool).toBeLessThanOrEqual(command.data.length)
          expect(command.count % (command.op === "lines" || command.op === "rects" ? 4 : 2), tool).toBe(0)
          expect(data(command).every(Number.isFinite), tool).toBe(true)
        }
        if (command.op === "circle") expect([command.x, command.y, command.radius].every(Number.isFinite)).toBe(true)
        if (command.op === "text") expect([command.x, command.y].every(Number.isFinite)).toBe(true)
      }
    }
  })

  it("mọi số trong lệnh vẽ là pixel thiết bị: dpr 2 nhân đôi toạ độ, độ dày và cỡ chữ", () => {
    for (const tool of BASIC_TOOLS) {
      const one = drawingCommands([shape("a", tool, undefined, { text: "Ghi chú" })], COORDS, { dpr: 1 })
      const two = drawingCommands([shape("a", tool, undefined, { text: "Ghi chú" })], COORDS, { dpr: 2 })
      expect(two.length, tool).toBe(one.length)
      one.forEach((command, index) => {
        const other = two[index]
        if ("data" in command && "data" in other) {
          expect(data(other), `${tool} #${index}`).toEqual(data(command).map((value) => value * 2))
          if ("width" in command && "width" in other) expect(other.width).toBeCloseTo(command.width * 2, 9)
        }
        if (command.op === "text" && other.op === "text") {
          expect(other.size).toBe((command.size ?? 0) * 2)
          expect(other.x).toBe(command.x * 2)
        }
        if (command.op === "circle" && other.op === "circle") expect(other.radius).toBe(command.radius * 2)
      })
    }
  })

  it("hình ẩn không vẽ; hình chưa đủ điểm neo hoặc khác loại điểm neo thì bỏ qua", () => {
    expect(drawingCommands([shape("a", "ellipse", undefined, { hidden: true })], COORDS)).toEqual([])
    expect(drawingCommands([shape("a", "triangle", [[6, 90], [22, 220]])], COORDS)).toEqual([])
    expect(drawingCommands([shape("a", "long-position", [[8, 150], [30, 120]])], COORDS)).toEqual([])
    const foreign: Drawing = { id: "x", tool: "arrow", anchors: [{ time: 1, price: 1 }, { time: 2, price: 2 }], style: TOOL_SPECS.arrow.defaultStyle }
    expect(drawingCommands([foreign], COORDS)).toEqual([])
  })

  it("không dùng dấu gạch dài và không lộ ngày trong chữ hiển thị", () => {
    const times = evenTimes(200)
    const timed = makeCoords({ times, viewport: { from: 0, to: 120 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
    for (const tool of BASIC_TOOLS) {
      const anchors = BASIC_SAMPLE[tool].map(([session, price]): Anchor => ({ time: times[session + 40], price }))
      const commands = drawingCommands([{ id: "a", tool, anchors, style: TOOL_SPECS[tool].defaultStyle, text: "Hỗ trợ" }], timed)
      for (const value of textsOf(commands)) {
        expect(value, tool).not.toMatch(/[–—]/)
        expect(value, tool).not.toMatch(/20\d\d/)
        expect(value, tool).not.toMatch(/\d{1,2}\/\d{1,2}/)
      }
    }
  })
})

describe("vị thế mua và bán", () => {
  const long = shape("l", "long-position")
  const short = shape("s", "short-position")
  const rects = (commands: DrawCommand[]) => commands.flatMap((command) => (command.op === "rects" ? [command] : []))

  it("vùng lời tô price-up, vùng lỗ tô price-down, mờ, đúng toạ độ giữa điểm vào, cắt lỗ và chốt lời", () => {
    const [up, down] = rects(drawingCommands([long], COORDS))
    expect(up).toMatchObject({ token: "price-up", alpha: 0.16, count: 4 })
    expect(data(up)).toEqual([px(8), py(210), px(30) - px(8), 60])
    expect(down).toMatchObject({ token: "price-down", alpha: 0.16 })
    expect(data(down)).toEqual([px(8), py(150), px(30) - px(8), 30])
    // Bán: chốt lời nằm dưới điểm vào, vẫn tô price-up.
    const [shortUp, shortDown] = rects(drawingCommands([short], COORDS))
    expect(data(shortUp)).toEqual([px(8), py(150), px(30) - px(8), 60])
    expect(data(shortDown)).toEqual([px(8), py(180), px(30) - px(8), 30])
    expect(shortUp.token).toBe("price-up")
    expect(shortDown.token).toBe("price-down")
  })

  it("nhãn hiện giá, phần trăm và tỷ lệ R:R", () => {
    expect(textsOf(drawingCommands([long], COORDS))).toEqual(["Chốt lời 210 (+40,00%)", "Cắt lỗ 120 (-20,00%)", "Mua 150 · R:R 2,00"])
    expect(textsOf(drawingCommands([short], COORDS))).toEqual(["Chốt lời 90 (+40,00%)", "Cắt lỗ 180 (-20,00%)", "Bán 150 · R:R 2,00"])
    const custom = textsOf(drawingCommands([long], COORDS, { formatPrice: (price) => `G${price}` }))
    expect(custom[0]).toBe("Chốt lời G210 (+40,00%)")
    expect(positionLabels(1, 100, 100, 130, String).ratio).toBeNull()
    expect(positionLabels(1, 100, 100, 130, String).entry).toContain("R:R -")
    expect(positionLabels(1, 100, 90, 130, String).ratio).toBeCloseTo(3, 9)
  })

  it("xem trước sau một cú bấm đã có đủ ba mức (cắt lỗ ở nửa khoảng cách, R:R = 2)", () => {
    const preview = previewCommands({ tool: "long-position", anchors: [{ session: 8, price: 150 }] }, { session: 30, price: 210 }, COORDS)
    expect(rects(preview)).toHaveLength(2)
    expect(textsOf(preview)).toContain("Cắt lỗ 120 (-20,00%)")
    expect(textsOf(preview)).toContain("Mua 150 · R:R 2,00")
    // Chỉ có tay nắm ở điểm đã bấm (điểm vào).
    expect(preview.filter((command) => command.op === "circle")).toHaveLength(2)
  })

  it("tay nắm: điểm vào, cắt lỗ và chốt lời; bắt đúng chỉ số; hình khoá không có tay nắm", () => {
    const handles = handleCommands(long, COORDS)
    expect(handles).toHaveLength(6)
    expect(handles.filter((command) => command.op === "circle" && command.fill).map((command) => command.op === "circle" && [command.x, command.y])).toEqual([
      [px(8), py(150)],
      [px(30), py(120)],
      [px(30), py(210)],
    ])
    expect(hitHandle(long, { x: px(8), y: py(150) }, COORDS)).toBe(0)
    expect(hitHandle(long, { x: px(30), y: py(120) + 2 }, COORDS)).toBe(1)
    expect(hitHandle(long, { x: px(30) - 1, y: py(210) }, COORDS)).toBe(2)
    expect(hitHandle(long, { x: 400, y: 20 }, COORDS)).toBeNull()
    expect(handleCommands({ ...long, locked: true }, COORDS)).toEqual([])
    expect(hitHandle({ ...long, locked: true }, { x: px(8), y: py(150) }, COORDS)).toBeNull()
  })

  it("kéo cắt lỗ và chốt lời của vị thế mua: không vượt qua điểm vào, kéo ngang đổi chung mép phải", () => {
    const stopUp = moveHandle(long, 1, { x: px(34), y: py(170) }, COORDS)
    expectAnchor(stopUp.anchors[1], 34, 150)
    expectAnchor(stopUp.anchors[2], 34, 210)
    const stopDown = moveHandle(long, 1, { x: px(30), y: py(100) }, COORDS)
    expectAnchor(stopDown.anchors[1], 30, 100)
    expectAnchor(stopDown.anchors[2], 30, 210)
    const targetDown = moveHandle(long, 2, { x: px(30), y: py(100) }, COORDS)
    expectAnchor(targetDown.anchors[2], 30, 150)
    const targetUp = moveHandle(long, 2, { x: px(30), y: py(260) }, COORDS)
    expectAnchor(targetUp.anchors[2], 30, 260)
    expectAnchor(targetUp.anchors[1], 30, 120)
    expect(targetUp.anchors[0]).toEqual(long.anchors[0])
  })

  it("kéo cắt lỗ và chốt lời của vị thế bán ngược lại; điểm vào luôn nằm giữa hai mức", () => {
    const stopDown = moveHandle(short, 1, { x: px(30), y: py(140) }, COORDS)
    expectAnchor(stopDown.anchors[1], 30, 150)
    const targetUp = moveHandle(short, 2, { x: px(30), y: py(200) }, COORDS)
    expectAnchor(targetUp.anchors[2], 30, 150)
    const entryHigh = moveHandle(long, 0, { x: px(12), y: py(290) }, COORDS)
    expectAnchor(entryHigh.anchors[0], 12, 210)
    const entryLow = moveHandle(long, 0, { x: px(12), y: py(10) }, COORDS)
    expectAnchor(entryLow.anchors[0], 12, 120)
    expect(moveHandle(long, 3, { x: 0, y: 0 }, COORDS)).toBe(long)
  })

  it("chọn hình: bấm trong vùng tô, trên đường vào; xa thì không", () => {
    expect(hitDrawing([long], { x: 200, y: py(180) }, COORDS)?.id).toBe("l")
    expect(hitDrawing([long], { x: 200, y: py(150) + 2 }, COORDS)?.id).toBe("l")
    expect(hitDrawing([long], { x: 450, y: py(150) }, COORDS)).toBeNull()
    expect(hitDrawing([long], { x: 200, y: py(250) }, COORDS)).toBeNull()
    expect(hitDrawing([{ ...long, hidden: true }], { x: 200, y: py(180) }, COORDS)).toBeNull()
  })

  it("kéo cả hình dịch cả ba mức cùng một khoảng", () => {
    const moved = translateDrawing(long, 50, -30, COORDS)
    ;[180, 150, 240].forEach((price, index) => expect(moved.anchors[index].price).toBeCloseTo(price, 6))
    ;[13, 35, 35].forEach((session, index) => expect("session" in moved.anchors[index] ? moved.anchors[index].session : NaN).toBeCloseTo(session, 6))
  })
})

describe("vẽ tự do", () => {
  it("bút vẽ: một đường gấp khúc qua mọi điểm", () => {
    const [, line] = drawingCommands([shape("b", "brush")], COORDS)
    expect(line).toMatchObject({ op: "polyline", token: "chart-1", count: BASIC_SAMPLE.brush.length * 2 })
    expect(data(line).slice(0, 4)).toEqual([px(4), py(100), px(7), py(130)])
  })

  it("mũi tên: thân đi từ điểm đầu tới đáy đầu mũi tên, đầu là hình tam giác đỉnh đúng điểm cuối", () => {
    const commands = drawingCommands([shape("a", "arrow")], COORDS)
    const body = commands.find((command) => command.op === "lines")!
    const head = commands.find((command) => command.op === "polygon")!
    expect(data(body).slice(0, 2)).toEqual([px(6), py(90)])
    expect(data(head).slice(0, 2)).toEqual([px(24), py(200)])
    expect(head.count).toBe(6)
    // Đáy của đầu mũi tên nằm trên thân.
    const [bx, by] = data(body).slice(2)
    expect((data(head)[2] + data(head)[4]) / 2).toBeCloseTo(bx, 6)
    expect((data(head)[3] + data(head)[5]) / 2).toBeCloseTo(by, 6)
    // Hai điểm trùng nhau thì không có gì để vẽ (không NaN).
    expect(drawingCommands([shape("z", "arrow", [[6, 90], [6, 90]])], COORDS)).toEqual([])
  })

  it("mũi tên lên có đỉnh ở điểm neo và thân phía dưới; mũi tên xuống ngược lại; một điểm", () => {
    const up = drawingCommands([shape("u", "arrow-up")], COORDS).find((command) => command.op === "polygon")!
    const down = drawingCommands([shape("d", "arrow-down")], COORDS).find((command) => command.op === "polygon")!
    expect(up).toMatchObject({ token: "price-up", alpha: 1 })
    expect(down).toMatchObject({ token: "price-down", alpha: 1 })
    const [ux, uy] = data(up)
    expect([ux, uy]).toEqual([px(12), py(120)])
    expect(Math.max(...data(up).filter((_, index) => index % 2 === 1))).toBeGreaterThan(uy)
    const [dx, dy] = data(down)
    expect([dx, dy]).toEqual([px(18), py(210)])
    expect(Math.min(...data(down).filter((_, index) => index % 2 === 1))).toBeLessThan(dy)
    expect(TOOL_SPECS["arrow-up"].anchorCount).toBe(1)
  })

  it("chọn hình: bút, mũi tên và hai dấu một điểm", () => {
    expect(hitDrawing([shape("b", "brush")], { x: (px(4) + px(7)) / 2, y: (py(100) + py(130)) / 2 + 3 }, COORDS)?.id).toBe("b")
    expect(hitDrawing([shape("b", "brush")], { x: 400, y: 100 }, COORDS)).toBeNull()
    expect(hitDrawing([shape("a", "arrow")], { x: (px(6) + px(24)) / 2, y: (py(90) + py(200)) / 2 }, COORDS)?.id).toBe("a")
    expect(hitDrawing([shape("u", "arrow-up")], { x: px(12), y: py(120) + 15 }, COORDS)?.id).toBe("u")
    expect(hitDrawing([shape("d", "arrow-down")], { x: px(18), y: py(210) - 15 }, COORDS)?.id).toBe("d")
    expect(hitDrawing([shape("u", "arrow-up")], { x: px(12) + 60, y: py(120) }, COORDS)).toBeNull()
  })

  it("nét bút có bốn tay nắm ở góc hộp bao, kéo góc co giãn cả nét quanh góc đối diện, số điểm giữ nguyên", () => {
    const brush = shape("b", "brush")
    expect(handleCommands(brush, COORDS).filter((command) => command.op === "circle" && command.fill)).toHaveLength(4)
    expect(hitHandle(brush, { x: px(4), y: py(230) }, COORDS)).toBe(0)
    expect(hitHandle(brush, { x: px(25), y: py(230) }, COORDS)).toBe(1)
    expect(hitHandle(brush, { x: px(25), y: py(100) }, COORDS)).toBe(2)
    expect(hitHandle(brush, { x: px(4), y: py(100) }, COORDS)).toBe(3)
    const scaled = moveHandle(brush, 2, { x: px(46), y: py(-30) }, COORDS)
    expect(scaled.anchors).toHaveLength(brush.anchors.length)
    // Góc trên trái đứng yên; điểm đầu (4, 100) nằm ở đáy hộp nên đi theo góc dưới phải.
    expect(scaled.anchors[0]).toEqual({ session: 4, price: -30 })
    expect(scaled.anchors.at(-1)).toEqual({ session: 46, price: 230 })
    const flat = shape("f", "brush", [[4, 100], [10, 100], [20, 100]])
    expect(moveHandle(flat, 2, { x: px(40), y: py(40) }, COORDS).anchors).toHaveLength(3)
  })
})

describe("chú thích", () => {
  it("nhãn giá: hộp token màu, chữ là giá qua formatPrice, mũi nhọn chỉ vào điểm", () => {
    const commands = drawingCommands([shape("p", "price-label")], COORDS, { formatPrice: (price) => `${price.toFixed(1)}đ` })
    expect(textsOf(commands)).toEqual(["160.0đ"])
    expect(commands.find((command) => command.op === "rects")).toMatchObject({ token: "chart-1", alpha: 1 })
    expect(commands.find((command) => command.op === "polygon")).toMatchObject({ token: "chart-1", count: 6 })
    // Chữ nền nằm trên hộp màu: dùng token background.
    expect(commands.find((command) => command.op === "text")).toMatchObject({ token: "background", tabular: true })
    expect(hitDrawing([shape("p", "price-label")], { x: px(14) + 20, y: py(160) }, COORDS)?.id).toBe("p")
    expect(hitDrawing([shape("p", "price-label")], { x: px(14) + 150, y: py(160) }, COORDS)).toBeNull()
  })

  it("nhãn giá gần mép phải thì lật sang trái điểm neo", () => {
    const edge = shape("p", "price-label", [[48, 160]])
    const box = drawingCommands([edge], COORDS).find((command) => command.op === "rects")!
    expect(data(box)[0] + data(box)[2]).toBeLessThanOrEqual(px(48))
  })

  it("hộp chú thích: chữ tự xuống dòng, đường chỉ vào điểm neo, rỗng thì hiện chữ gợi ý mờ", () => {
    const empty = drawingCommands([shape("c", "callout")], COORDS)
    expect(empty.find((command) => command.op === "text")).toMatchObject({ text: "Ghi chú", token: "muted-foreground" })
    const long = drawingCommands([shape("c", "callout", undefined, { text: "Vùng hỗ trợ mạnh sau ba lần chạm đáy liên tiếp trong tháng" })], COORDS)
    const lines = textsOf(long)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines.join(" ")).toContain("Vùng hỗ trợ")
    for (const command of long) if (command.op === "text") expect(command.token).toBe("foreground")
    // Điểm neo (10, 120) nằm ngoài hộp tâm (20, 200) nên có một đường nối và một chấm.
    expect(long.filter((command) => command.op === "circle")).toHaveLength(1)
    const connector = long.filter((command) => command.op === "lines").at(-1)!
    expect(data(connector).slice(2)).toEqual([px(10), py(120)])
  })

  it("hộp chú thích: chọn trong hộp và trên đường chỉ; kéo tay nắm đổi điểm chỉ hoặc vị trí hộp", () => {
    const callout = shape("c", "callout", undefined, { text: "Hỗ trợ" })
    expect(hitDrawing([callout], { x: px(20), y: py(200) }, COORDS)?.id).toBe("c")
    expect(hitDrawing([callout], { x: 300, y: py(20) }, COORDS)).toBeNull()
    expect(hitHandle(callout, { x: px(10), y: py(120) }, COORDS)).toBe(0)
    expect(hitHandle(callout, { x: px(20), y: py(200) }, COORDS)).toBe(1)
    expectAnchor(moveHandle(callout, 0, { x: px(5), y: py(80) }, COORDS).anchors[0], 5, 80)
  })
})

describe("đo", () => {
  const times = evenTimes(200)
  const timed = makeCoords({ times, viewport: { from: 0, to: 120 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
  const at = (index: number, price: number): Anchor => ({ time: times[index], price })

  it("khoảng thời gian: số nến và độ dài, không có ngày; ở Flashback chỉ có số nến", () => {
    const market = drawingCommands([{ id: "r", tool: "date-range", anchors: [at(20, 140), at(44, 170)], style: TOOL_SPECS["date-range"].defaultStyle }], timed)
    expect(textsOf(market)).toEqual(["24 nến · 24 ngày"])
    expect(textsOf(drawingCommands([shape("r", "date-range")], COORDS))).toEqual(["24 nến"])
  })

  it("khoảng giá và thời gian: khoảng giá, phần trăm, số nến, thời gian; số âm khi giá giảm", () => {
    const up = drawingCommands([shape("d", "date-price-range")], COORDS, { formatPrice: (price) => price.toFixed(0) })
    expect(textsOf(up)).toEqual(["+90 (+90,00%)", "24 nến"])
    const down = drawingCommands([shape("d", "date-price-range", [[6, 190], [30, 100]])], COORDS, { formatPrice: (price) => price.toFixed(0) })
    expect(textsOf(down)[0]).toBe("-90 (-47,37%)")
    const withTime = drawingCommands([{ id: "d", tool: "date-price-range", anchors: [at(20, 100), at(110, 190)], style: TOOL_SPECS["date-price-range"].defaultStyle }], timed)
    expect(textsOf(withTime)[1]).toBe("90 nến · 3 tháng")
    expect(priceRangeLabel({ price: 0 }, { price: 5 }, String)).toBe("+5 (0,00%)")
  })

  it("nhãn hai dòng: dòng giá tô price-up khi tăng, price-down khi giảm", () => {
    const tokenOf = (commands: DrawCommand[]) => commands.find((command) => command.op === "text")?.token
    expect(tokenOf(drawingCommands([shape("d", "date-price-range")], COORDS))).toBe("price-up")
    expect(tokenOf(drawingCommands([shape("d", "date-price-range", [[6, 190], [30, 100]])], COORDS))).toBe("price-down")
    expect(tokenOf(drawingCommands([shape("d", "date-price-range", [[6, 150], [30, 150]])], COORDS))).toBe("chart-1")
  })

  it("định dạng khoảng thời gian", () => {
    expect(formatDuration(0)).toBe("0 phút")
    expect(formatDuration(59)).toBe("1 phút")
    expect(formatDuration(1800)).toBe("30 phút")
    expect(formatDuration(3600)).toBe("1 giờ")
    expect(formatDuration(5400)).toBe("1 giờ 30 phút")
    expect(formatDuration(7199)).toBe("2 giờ")
    expect(formatDuration(86_400 * 3)).toBe("3 ngày")
    expect(formatDuration(86_400 * 3 + 3600 * 5)).toBe("3 ngày 5 giờ")
    expect(formatDuration(86_400 * 20)).toBe("20 ngày")
    expect(formatDuration(86_400 * 100)).toBe("3 tháng")
    expect(formatDuration(86_400 * 800)).toBe("2,2 năm")
  })

  it("chọn hình: khoảng thời gian bấm vào hai cạnh hoặc mũi tên; khoảng giá và thời gian bấm trong khung", () => {
    const range = shape("r", "date-range")
    expect(hitDrawing([range], { x: px(6), y: 40 }, COORDS)?.id).toBe("r")
    expect(hitDrawing([range], { x: px(30) + 2, y: 250 }, COORDS)?.id).toBe("r")
    expect(hitDrawing([range], { x: (px(6) + px(30)) / 2, y: (py(140) + py(170)) / 2 + 2 }, COORDS)?.id).toBe("r")
    expect(hitDrawing([range], { x: (px(6) + px(30)) / 2, y: 250 }, COORDS)).toBeNull()
    const box = shape("d", "date-price-range")
    expect(hitDrawing([box], { x: (px(6) + px(30)) / 2, y: (py(100) + py(190)) / 2 }, COORDS)?.id).toBe("d")
    expect(hitDrawing([box], { x: 450, y: 20 }, COORDS)).toBeNull()
  })

  it("thước đo cũ vẫn đo giá, phần trăm và số nến như trước", () => {
    expect(textsOf(drawingCommands([{ id: "m", tool: "measure", anchors: [at(20, 100), at(44, 120)], style: TOOL_SPECS.measure.defaultStyle }], timed))[0]).toContain("24 nến")
  })
})

describe("hình", () => {
  it("elip: 48 điểm trên đường elip trong hộp hai góc, tô nhạt", () => {
    const commands = drawingCommands([shape("e", "ellipse")], COORDS)
    const fill = commands.find((command) => command.op === "polygon")!
    const outline = commands.find((command) => command.op === "polyline")!
    expect(fill).toMatchObject({ token: "chart-2", alpha: 0.12, count: 96 })
    expect(outline.count).toBe(98)
    const points = data(fill)
    const cx = (px(6) + px(28)) / 2
    const cy = (py(90) + py(200)) / 2
    const rx = Math.abs(px(28) - px(6)) / 2
    const ry = Math.abs(py(200) - py(90)) / 2
    for (let i = 0; i < points.length; i += 2) expect(((points[i] - cx) / rx) ** 2 + ((points[i + 1] - cy) / ry) ** 2).toBeCloseTo(1, 9)
    const noFill = drawingCommands([{ ...shape("e", "ellipse"), style: { ...TOOL_SPECS.ellipse.defaultStyle, fill: false } }], COORDS)
    expect(noFill.some((command) => command.op === "polygon")).toBe(false)
  })

  it("tam giác: đa giác đúng ba đỉnh và viền khép kín; chưa đủ điểm thì chỉ có cạnh đã có", () => {
    const commands = drawingCommands([shape("t", "triangle")], COORDS)
    expect(data(commands.find((command) => command.op === "polygon")!)).toEqual([px(6), py(90), px(22), py(220), px(34), py(120)])
    expect(commands.find((command) => command.op === "polyline")!.count).toBe(8)
    const partial = previewCommands({ tool: "triangle", anchors: [{ session: 6, price: 90 }] }, { session: 22, price: 220 }, COORDS)
    expect(partial.filter((command) => command.op === "polyline")).toHaveLength(1)
    expect(partial.some((command) => command.op === "polygon")).toBe(false)
  })

  it("đường gấp khúc: một polyline qua mọi đỉnh, không khép kín", () => {
    const [, line] = drawingCommands([shape("p", "path")], COORDS)
    expect(line).toMatchObject({ op: "polyline", count: 8 })
    expect(data(line).slice(-2)).toEqual([px(27), py(210)])
  })

  it("chọn hình: elip và tam giác tô thì bấm trong cũng chọn; không tô thì chỉ bấm viền", () => {
    const ellipse = shape("e", "ellipse")
    expect(hitDrawing([ellipse], { x: (px(6) + px(28)) / 2, y: (py(90) + py(200)) / 2 }, COORDS)?.id).toBe("e")
    expect(hitDrawing([{ ...ellipse, style: { ...ellipse.style, fill: false } }], { x: (px(6) + px(28)) / 2, y: (py(90) + py(200)) / 2 }, COORDS)).toBeNull()
    expect(hitDrawing([ellipse], { x: px(28), y: (py(90) + py(200)) / 2 }, COORDS)?.id).toBe("e")
    expect(hitDrawing([ellipse], { x: px(6), y: py(90) }, COORDS)).toBeNull()
    const triangle = shape("t", "triangle")
    expect(hitDrawing([triangle], { x: (px(6) + px(22) + px(34)) / 3, y: (py(90) + py(220) + py(120)) / 3 }, COORDS)?.id).toBe("t")
    expect(hitDrawing([triangle], { x: 450, y: 20 }, COORDS)).toBeNull()
    expect(hitDrawing([shape("p", "path")], { x: (px(4) + px(12)) / 2, y: (py(80) + py(160)) / 2 + 3 }, COORDS)?.id).toBe("p")
  })

  it("kéo từng tay nắm đổi đúng điểm neo thứ đó (hình dùng cách chung)", () => {
    for (const tool of ["arrow", "callout", "date-range", "date-price-range", "ellipse", "triangle", "path", "price-label", "arrow-up", "arrow-down"] as const) {
      const drawing = shape("x", tool)
      const last = drawing.anchors.length - 1
      const moved = moveHandle(drawing, last, { x: px(40), y: py(60) }, COORDS)
      expectAnchor(moved.anchors[last], 40, 60)
      expect(moved.anchors.slice(0, last), tool).toEqual(drawing.anchors.slice(0, last))
    }
  })
})

describe("khoá, ẩn, nhân bản, lưu và nạp lại", () => {
  const ALL = BASIC_TOOLS.map((tool, index) => shape(`d${index + 1}`, tool))

  it("hình khoá không có tay nắm và không kéo được tay nắm, hình ẩn không chọn được", () => {
    for (const tool of BASIC_TOOLS) {
      const locked = { ...shape("a", tool), locked: true }
      expect(handleCommands(locked, COORDS), tool).toEqual([])
      expect(hitHandle(locked, { x: px(BASIC_SAMPLE[tool][0][0]), y: py(BASIC_SAMPLE[tool][0][1]) }, COORDS), tool).toBeNull()
      const state = drawingsReducer(createDrawingsState([locked]), { type: "set-anchors", id: "a", anchors: [...locked.anchors].reverse() })
      expect(state.shapes[0].anchors, tool).toEqual(locked.anchors)
      expect(hitDrawing([{ ...shape("a", tool), hidden: true }], { x: px(BASIC_SAMPLE[tool][0][0]), y: py(BASIC_SAMPLE[tool][0][1]) }, COORDS), tool).toBeNull()
    }
  })

  it("nhân bản giữ công cụ, điểm neo, kiểu và chữ; bản sao không khoá, không ẩn, đang được chọn", () => {
    let state = createDrawingsState(ALL.map((drawing) => ({ ...drawing, locked: true, hidden: true, text: "Ghi" })))
    for (const drawing of ALL) {
      state = drawingsReducer(state, { type: "duplicate", id: drawing.id })
      const copy = state.shapes.at(-1)!
      expect(copy.tool).toBe(drawing.tool)
      expect(copy.anchors).toEqual(drawing.anchors)
      expect(copy.text).toBe("Ghi")
      expect(copy.locked).toBeUndefined()
      expect(copy.hidden).toBeUndefined()
      expect(copy.id).not.toBe(drawing.id)
      expect(state.selectedId).toBe(copy.id)
    }
  })

  it("lưu rồi nạp lại qua JSON cho đúng lệnh vẽ cũ, kể cả điểm neo theo time", () => {
    const times = evenTimes(200)
    const timed = makeCoords({ times, viewport: { from: 0, to: 120 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
    const drawings: Drawing[] = BASIC_TOOLS.map((tool, index) => ({
      id: `d${index + 1}`,
      tool,
      anchors: BASIC_SAMPLE[tool].map(([session, price]): Anchor => ({ time: times[session + 40], price })),
      style: { ...TOOL_SPECS[tool].defaultStyle },
      text: "Ghi chú",
    }))
    const reloaded = JSON.parse(JSON.stringify(drawings)) as Drawing[]
    expect(reloaded).toEqual(drawings)
    expect(drawingCommands(reloaded, timed)).toEqual(drawingCommands(drawings, timed))
  })
})

describe("không lệch khi nạp thêm lịch sử và đổi khung", () => {
  const DAY = 86_400
  const START = 1_700_000_000
  const PLOT = { left: 0, top: 0, right: 600, bottom: 300 }
  const PRICE = { low: 0, high: 300 }
  const times = evenTimes(200, START, DAY)
  const older = evenTimes(100, START - 100 * DAY, DAY)
  const before = makeCoords({ times, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
  const after = makeCoords({ times: [...older, ...times], viewport: { from: 200, to: 260 }, plot: PLOT, price: PRICE })
  const drawingsOf = (): Drawing[] =>
    BASIC_TOOLS.map((tool, index) => ({
      id: `d${index + 1}`,
      tool,
      anchors: BASIC_SAMPLE[tool].map(([session, price]): Anchor => ({ time: times[session + 110], price })),
      style: { ...TOOL_SPECS[tool].defaultStyle },
      text: "Ghi chú",
    }))

  it("nạp 100 nến cũ: lệnh vẽ và tay nắm giống hệt nhau dù chỉ số của mọi nến đã đổi", () => {
    for (const drawing of drawingsOf()) {
      expect(drawingCommands([drawing], after), drawing.tool).toEqual(drawingCommands([drawing], before))
      expect(handleCommands(drawing, after), drawing.tool).toEqual(handleCommands(drawing, before))
    }
  })

  it("nạp 100 nến cũ: chọn hình và bắt tay nắm cho cùng kết quả ở cùng vị trí màn hình", () => {
    for (const drawing of drawingsOf()) {
      const first = drawing.anchors[0]
      const point = { x: before.xOfIndex(before.indexOfAnchor(first)!), y: before.yOfPrice(first.price) }
      expect(hitDrawing([drawing], point, after)?.id, drawing.tool).toBe(hitDrawing([drawing], point, before)?.id)
      expect(hitHandle(drawing, point, after), drawing.tool).toBe(hitHandle(drawing, point, before))
    }
  })

  it("kéo tay nắm sau khi nạp thêm cho cùng điểm neo (time) như trước khi nạp", () => {
    const drawing = drawingsOf().find((item) => item.tool === "long-position")!
    const target = { x: before.xOfIndex(before.indexOfAnchor(drawing.anchors[2])!) + 20, y: before.yOfPrice(270) }
    const a = moveHandle(drawing, 2, target, before)
    const b = moveHandle(drawing, 2, target, after)
    expect(a.anchors[2].price).toBeCloseTo(b.anchors[2].price, 6)
    const timeOf = (anchor: Anchor) => ("time" in anchor ? anchor.time : NaN)
    expect(timeOf(a.anchors[2])).toBeCloseTo(timeOf(b.anchors[2]), 3)
  })

  it("đổi khung (mỗi nến gấp đôi thời gian): hình nằm cùng chỗ theo thời gian; chỉ số nến trong nhãn đổi theo khung", () => {
    const weekly = evenTimes(100, START, 2 * DAY)
    const frame = makeCoords({ times: weekly, viewport: { from: 50, to: 80 }, plot: PLOT, price: PRICE })
    const reference = makeCoords({ times, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
    for (const drawing of drawingsOf()) {
      const a = drawingCommands([drawing], reference)
      const b = drawingCommands([drawing], frame)
      expect(b.length, drawing.tool).toBe(a.length)
      a.forEach((command, index) => {
        const other = b[index]
        if ("data" in command && "data" in other) {
          // Hình tròn của nét bút có thể lệch tối đa một phần nghìn pixel do làm tròn giây; vị trí còn lại giống nhau.
          data(command).forEach((value, k) => expect(data(other)[k], `${drawing.tool} #${index}`).toBeCloseTo(value, 3))
        }
      })
    }
    // Khoảng thời gian không đổi (cùng số giây) nhưng số nến giảm một nửa.
    const range = drawingsOf().find((item) => item.tool === "date-range")!
    const [dayly] = textsOf(drawingCommands([range], reference))
    const [fewer] = textsOf(drawingCommands([range], frame))
    expect(dayly).toBe("24 nến · 24 ngày")
    expect(fewer).toBe("12 nến · 24 ngày")
  })
})

describe("số điểm thay đổi: nét bút và đường gấp khúc", () => {
  const A = (n: number): Anchor => ({ session: n, price: 100 + n })
  const stroke = (count: number): Anchor[] => Array.from({ length: count }, (_, index) => A(index))
  const withTool = (tool: "brush" | "path"): DrawingsState => drawingsReducer(createDrawingsState(), { type: "tool", tool })

  it("bấm từng điểm chỉ gom vào pending, không tự hoàn tất, không chạm danh sách hình", () => {
    let state = withTool("path")
    for (let i = 0; i < 5; i++) state = drawingsReducer(state, { type: "anchor", anchor: A(i) })
    expect(state.shapes).toHaveLength(0)
    expect(state.pending?.anchors).toHaveLength(5)
    expect(state.tool).toBe("path")
  })

  it("hoàn tất tạo hình với đúng số điểm đã bấm (không cố định), chọn hình đó và về chế độ thường", () => {
    let state = withTool("path")
    for (let i = 0; i < 4; i++) state = drawingsReducer(state, { type: "anchor", anchor: A(i) })
    state = drawingsReducer(state, { type: "finish" })
    expect(state.shapes).toHaveLength(1)
    expect(state.shapes[0]).toMatchObject({ tool: "path", id: "d1" })
    expect(state.shapes[0].anchors).toHaveLength(4)
    expect(state.selectedId).toBe("d1")
    expect(state.tool).toBeNull()
    expect(state.pending).toBeNull()
  })

  it("chưa đủ hai điểm thì hoàn tất không có tác dụng; Esc huỷ hết", () => {
    let state = drawingsReducer(withTool("path"), { type: "anchor", anchor: A(0) })
    expect(drawingsReducer(state, { type: "finish" })).toBe(state)
    expect(drawingsReducer(state, { type: "finish", anchors: [A(0)] })).toBe(state)
    state = drawingsReducer(state, { type: "cancel" })
    expect(state.pending).toBeNull()
    expect(state.tool).toBeNull()
    expect(state.shapes).toHaveLength(0)
  })

  it("nét bút: hoàn tất bằng điểm đã giản lược; bấm lại (restart) bỏ điểm đang gom nhưng giữ công cụ", () => {
    let state = drawingsReducer(withTool("brush"), { type: "anchor", anchor: A(0) })
    state = drawingsReducer(state, { type: "restart" })
    expect(state.pending).toBeNull()
    expect(state.tool).toBe("brush")
    state = drawingsReducer(state, { type: "anchor", anchor: A(0) })
    state = drawingsReducer(state, { type: "anchor", anchor: A(9) })
    state = drawingsReducer(state, { type: "finish", anchors: [A(0), A(9)] })
    expect(state.shapes[0].anchors).toEqual([A(0), A(9)])
  })

  it("giới hạn: nét bút tối đa 160 điểm khi lưu, 2.000 điểm thô khi đang vẽ; đường gấp khúc tối đa 64", () => {
    let state = withTool("brush")
    for (let i = 0; i < 2500; i++) state = drawingsReducer(state, { type: "anchor", anchor: A(i) })
    expect(state.pending?.anchors).toHaveLength(2000)
    state = drawingsReducer(state, { type: "finish" })
    expect(state.shapes[0].anchors).toHaveLength(STROKE_MAX_POINTS)
    // Hai đầu được giữ, các điểm còn lại chia đều và tăng dần.
    expect(state.shapes[0].anchors[0]).toEqual(A(0))
    expect(state.shapes[0].anchors.at(-1)).toEqual(A(1999))
    let path = withTool("path")
    for (let i = 0; i < 100; i++) path = drawingsReducer(path, { type: "anchor", anchor: A(i) })
    expect(path.pending?.anchors).toHaveLength(PATH_MAX_POINTS)
    path = drawingsReducer(path, { type: "finish" })
    expect(path.shapes[0].anchors).toHaveLength(PATH_MAX_POINTS)
  })

  it("điểm neo của hình nhiều điểm được làm tròn để tài liệu nhỏ (giây nguyên, giá 4 chữ số lẻ)", () => {
    expect(roundAnchor({ time: 1_700_000_000.4, price: 27.123456 })).toEqual({ time: 1_700_000_000, price: 27.1235 })
    expect(roundAnchor({ session: 3.123456, price: 10.00004 })).toEqual({ session: 3.123, price: 10 })
    let state = drawingsReducer(withTool("path"), { type: "anchor", anchor: { session: 1.123456, price: 5.123456 } })
    state = drawingsReducer(state, { type: "anchor", anchor: { session: 2.987654, price: 6.987654 } })
    state = drawingsReducer(state, { type: "finish" })
    expect(state.shapes[0].anchors).toEqual([{ session: 1.123, price: 5.1235 }, { session: 2.988, price: 6.9877 }])
  })

  it("hạn mức điểm của tài liệu: vượt thì nét mới bị cắt, hết chỗ thì bỏ; bản sao cũng bị chặn", () => {
    const full = (index: number): Drawing => ({ id: `d${index}`, tool: "brush", anchors: stroke(STROKE_MAX_POINTS), style: { ...TOOL_SPECS.brush.defaultStyle } })
    const strokes = Math.floor(DOCUMENT_POINT_BUDGET / STROKE_MAX_POINTS)
    let state = createDrawingsState(Array.from({ length: strokes }, (_, index) => full(index + 1)))
    expect(variablePointCount(state.shapes)).toBe(strokes * STROKE_MAX_POINTS)
    const room = DOCUMENT_POINT_BUDGET - variablePointCount(state.shapes)
    expect(room).toBeGreaterThan(0)
    // Còn chỗ cho vài điểm: nét mới bị cắt xuống đúng chỗ còn lại.
    state = drawingsReducer(state, { type: "tool", tool: "brush" })
    for (let i = 0; i < 300; i++) state = drawingsReducer(state, { type: "anchor", anchor: A(i) })
    state = drawingsReducer(state, { type: "finish" })
    expect(state.shapes.at(-1)!.anchors).toHaveLength(room)
    expect(variablePointCount(state.shapes)).toBe(DOCUMENT_POINT_BUDGET)
    // Hết chỗ: hình đang vẽ bị bỏ, danh sách không đổi.
    const shapes = state.shapes
    state = drawingsReducer(state, { type: "tool", tool: "path" })
    state = drawingsReducer(state, { type: "anchor", anchor: A(0) })
    state = drawingsReducer(state, { type: "anchor", anchor: A(1) })
    state = drawingsReducer(state, { type: "finish" })
    expect(state.shapes).toBe(shapes)
    expect(state.pending).toBeNull()
    // Nhân bản nét lớn khi hết chỗ không có tác dụng; hình thường vẫn nhân bản được.
    expect(drawingsReducer(state, { type: "duplicate", id: "d1" }).shapes).toHaveLength(shapes.length)
  })

  it("tài liệu đầy hạn mức vẫn dưới 512 KB khi tuần tự hoá", () => {
    const strokes = Math.floor(DOCUMENT_POINT_BUDGET / STROKE_MAX_POINTS)
    const drawings: Drawing[] = Array.from({ length: strokes }, (_, index) => ({
      id: `d${index + 1}`,
      tool: "brush",
      anchors: Array.from({ length: STROKE_MAX_POINTS }, (_, k): Anchor => roundAnchor({ time: 1_700_000_000 + (index * 1000 + k) * 60 + 0.4, price: 27 + Math.sin(k) * 3.123456789 })),
      style: { ...TOOL_SPECS.brush.defaultStyle },
    }))
    const bytes = new TextEncoder().encode(JSON.stringify({ iqline: { version: 1, drawings, indicators: [], chartType: "candles" } })).length
    expect(bytes).toBeLessThan(300 * 1024)
  })

  it("kéo cả hình giữ nguyên số điểm; set-anchors làm tròn điểm của hình nhiều điểm", () => {
    const brush = shape("b", "brush")
    const moved = translateDrawing(brush, 13.37, 7.77, COORDS)
    expect(moved.anchors).toHaveLength(brush.anchors.length)
    const state = drawingsReducer(createDrawingsState([brush]), { type: "set-anchors", id: "b", anchors: moved.anchors })
    for (const anchor of state.shapes[0].anchors) {
      expect("session" in anchor && Math.round(anchor.session * 1000) / 1000).toBe("session" in anchor ? anchor.session : NaN)
      expect(Math.round(anchor.price * 1e4) / 1e4).toBe(anchor.price)
    }
    // Đổi số điểm thì bị từ chối như mọi hình.
    expect(drawingsReducer(state, { type: "set-anchors", id: "b", anchors: brush.anchors.slice(0, 3) })).toBe(state)
  })

  it("giản lược nét bút: đường thẳng còn hai đầu, đường cong giữ hình dạng, không vượt giới hạn, giữ nguyên khoá time", () => {
    const line = simplifyStroke(stroke(300).map((a) => ({ session: (a as { session: number }).session / 10, price: 100 })), COORDS)
    expect(line).toHaveLength(2)
    const wave: Anchor[] = Array.from({ length: 600 }, (_, index) => ({ session: index / 15, price: 150 + Math.sin(index / 20) * 100 }))
    const simple = simplifyStroke(wave, COORDS)
    expect(simple.length).toBeGreaterThan(8)
    expect(simple.length).toBeLessThanOrEqual(STROKE_MAX_POINTS)
    expect(simple[0]).toEqual(roundAnchor(wave[0]))
    expect(simple.at(-1)).toEqual(roundAnchor(wave.at(-1)!))
    // Mọi điểm gốc cách đường đã giản lược không quá vài pixel.
    const resolved = simple.map((anchor) => ({ x: px((anchor as { session: number }).session), y: py(anchor.price) }))
    const nearest = (x: number, y: number) => {
      let best = Infinity
      for (let i = 1; i < resolved.length; i++) {
        const a = resolved[i - 1]
        const b = resolved[i]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
      }
      return best
    }
    for (const anchor of wave) expect(nearest(px((anchor as { session: number }).session), py(anchor.price))).toBeLessThan(6)
    const times = evenTimes(200)
    const timed = makeCoords({ times, viewport: { from: 0, to: 120 }, plot: { left: 0, top: 0, right: 600, bottom: 300 }, price: { low: 0, high: 300 } })
    const timedWave: Anchor[] = Array.from({ length: 400 }, (_, index) => ({ time: times[10] + (index / 400) * 80 * DAY_S, price: 150 + Math.sin(index / 12) * 80 }))
    const timedSimple = simplifyStroke(timedWave, timed)
    for (const anchor of timedSimple) expect(Object.keys(anchor)).toEqual(["time", "price"])
    expect(timedSimple.length).toBeLessThanOrEqual(STROKE_MAX_POINTS)
  })

  it("capPoints giữ hai đầu và chia đều; ít hơn giới hạn thì giữ nguyên", () => {
    expect(capPoints([1, 2, 3], 5)).toEqual([1, 2, 3])
    const capped = capPoints(Array.from({ length: 1000 }, (_, index) => index), 11)
    expect(capped).toHaveLength(11)
    expect(capped[0]).toBe(0)
    expect(capped.at(-1)).toBe(999)
    expect([...capped].sort((a, b) => a - b)).toEqual(capped)
  })

  it("hình nhiều điểm đang vẽ: isRenderable chỉ cần từ hai điểm", () => {
    expect(isRenderable({ tool: "path", anchors: [A(0)], hidden: false })).toBe(false)
    expect(isRenderable({ tool: "path", anchors: stroke(30), hidden: false })).toBe(true)
  })

  it("xem trước đường gấp khúc: mọi đỉnh đã bấm cộng điểm con trỏ; xem trước nét bút chỉ có các điểm đã gom và không có tay nắm", () => {
    const pathPreview = previewCommands({ tool: "path", anchors: [{ session: 4, price: 80 }, { session: 12, price: 160 }] }, { session: 20, price: 100 }, COORDS)
    expect(pathPreview.find((command) => command.op === "polyline")!.count).toBe(6)
    expect(pathPreview.filter((command) => command.op === "circle")).toHaveLength(4)
    const brushPreview = previewCommands({ tool: "brush", anchors: stroke(40) }, { session: 45, price: 10 }, COORDS)
    expect(brushPreview.find((command) => command.op === "polyline")!.count).toBe(80)
    expect(brushPreview.filter((command) => command.op === "circle")).toHaveLength(0)
  })
})

describe("qua bộ vẽ thật (đủ mọi công cụ đợt 1)", () => {
  const PALETTE = Object.fromEntries(COLOR_TOKENS.map((token) => [token, "#123456"])) as Record<(typeof COLOR_TOKENS)[number], string>
  for (const tool of BASIC_TOOLS) {
    it(`${tool}: ra nét, mảng màu hoặc chữ trên canvas`, () => {
      const context = fakeContext()
      paintScene(context, drawingCommands([shape("a", tool, undefined, { text: "Ghi chú" })], COORDS), { palette: PALETTE, fontFamily: DEFAULT_FONT_FAMILY, defaultSize: 11, text: new TextPainter() })
      const painted = named(context, "stroke").length + named(context, "fill").length + named(context, "fillRect").length + named(context, "fillText").length
      expect(painted, tool).toBeGreaterThan(0)
    })
  }
})
