/**
 * Chín công cụ vẽ đợt 2 (tools-advanced.ts): hình học với giá trị tính tay, chọn hình, tay nắm, kéo, thang log và phần trăm,
 * điểm neo theo `time`, vùng tương lai, các trường hợp suy biến, lưu và nạp lại.
 */
import { describe, expect, it } from "vitest"

import { createPaneCoords } from "../core/coords"
import { createPriceScale } from "../core/price-scale"
import { createMarketTimeScale, createSessionTimeScale } from "../core/time-scale"
import { paintScene } from "../render/paint"
import { COLOR_TOKENS } from "../render/palette"
import { fakeContext, named } from "../render/test-support"
import { DEFAULT_FONT_FAMILY, TextPainter } from "../render/text"
import type { Anchor, ColorToken, DrawCommand, Drawing, PaneCoords, PriceScaleMode } from "../types"
import { ADVANCED_SAMPLE } from "./__fixtures__/advanced-samples"
import { evenTimes, makeCoords } from "./__fixtures__/coords"
import {
  ADVANCED_TOOLS,
  ALL_TOOLS,
  FIB_FORBIDDEN_TOKENS,
  FIB_SEQUENCE,
  FLASHBACK_TOOLS,
  GANN_ANGLES,
  GANN_BOX_LEVELS,
  INITIAL_DRAWINGS,
  TOOL_SPECS,
  anchorCountOf,
  clipLine,
  createDrawingsState,
  distanceToDrawing,
  drawingCommands,
  drawingsReducer,
  fibTimeZonePositions,
  handleCommands,
  hitDrawing,
  hitHandle,
  isDrawingTool,
  moveHandle,
  previewCommands,
  ratioText,
  resolveAnchors,
  translateDrawing,
  xabcdRatios,
  type AdvancedTool,
} from "./index"
import { fibFanPrice, gannDirection } from "./tools-advanced"

/** 10px mỗi phiên, tâm nến ở (phiên + 0,5) x 10; y = 300 - giá. Khung vẽ 500 x 300. */
const COORDS = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, plot: { left: 0, top: 0, right: 500, bottom: 300 }, price: { low: 0, high: 300 } })
const px = (session: number) => (session + 0.5) * 10
const py = (price: number) => 300 - price

const drawingOf = (tool: AdvancedTool, points: [number, number][] = ADVANCED_SAMPLE[tool], extra: Partial<Drawing> = {}): Drawing => ({
  id: "d1",
  tool,
  anchors: points.map(([session, price]): Anchor => ({ session, price })),
  style: { ...TOOL_SPECS[tool].defaultStyle },
  ...extra,
})

type Lines = Extract<DrawCommand, { op: "lines" }>
const linesOf = (commands: readonly DrawCommand[]): Lines[] => commands.filter((command): command is Lines => command.op === "lines")
const segmentsOf = (commands: readonly DrawCommand[]): number[][] =>
  linesOf(commands).flatMap((command) => Array.from({ length: command.count / 4 }, (_, index) => Array.from(command.data.subarray(index * 4, index * 4 + 4))))
const textsOf = (commands: readonly DrawCommand[]): string[] => commands.flatMap((command) => (command.op === "text" ? [command.text] : []))
/** Chỉ các nét liền (không nét đứt): bỏ đường nối phụ vẽ nét đứt. */
const solidSegmentsOf = (commands: readonly DrawCommand[]): number[][] => segmentsOf(linesOf(commands).filter((command) => !command.dash))
const hasSegment = (segments: number[][], expected: number[], digits = 6) =>
  segments.some((segment) => segment.length === 4 && segment.every((value, index) => Math.abs(value - expected[index]) < 10 ** -digits))

function allFinite(commands: readonly DrawCommand[]): boolean {
  return commands.every((command) => {
    if ("data" in command) return Array.from(command.data.subarray(0, command.count)).every(Number.isFinite)
    if (command.op === "circle") return Number.isFinite(command.x) && Number.isFinite(command.y) && Number.isFinite(command.radius)
    if (command.op === "text") return Number.isFinite(command.x) && Number.isFinite(command.y)
    if (command.op === "clip") return [command.x, command.y, command.width, command.height].every(Number.isFinite)
    return true
  })
}

describe("mô tả chín công cụ", () => {
  const COUNTS: Record<AdvancedTool, number> = {
    "fib-time-zones": 2,
    "fib-fan": 2,
    "fib-channel": 3,
    pitchfork: 3,
    "gann-fan": 2,
    "gann-box": 2,
    xabcd: 5,
    "head-shoulders": 7,
    "triangle-pattern": 4,
  }

  it("đủ chín công cụ, số điểm neo đúng, nằm trong ALL_TOOLS và không trùng công cụ cũ", () => {
    expect([...ADVANCED_TOOLS].sort()).toEqual(Object.keys(COUNTS).sort())
    for (const tool of ADVANCED_TOOLS) {
      expect(isDrawingTool(tool), tool).toBe(true)
      expect(anchorCountOf(tool), tool).toBe(COUNTS[tool])
      expect(ADVANCED_SAMPLE[tool], tool).toHaveLength(COUNTS[tool])
      expect(ALL_TOOLS.filter((item) => item === tool), tool).toHaveLength(1)
    }
    expect(new Set(ALL_TOOLS).size).toBe(ALL_TOOLS.length)
  })

  it("nhóm: Fibonacci cho ba công cụ Fibonacci, Pitchfork và Gann, Mẫu hình", () => {
    const groups = Object.fromEntries(ADVANCED_TOOLS.map((tool) => [tool, TOOL_SPECS[tool].group]))
    expect(groups).toEqual({
      "fib-time-zones": "fib",
      "fib-fan": "fib",
      "fib-channel": "fib",
      pitchfork: "pitchfork",
      "gann-fan": "pitchfork",
      "gann-box": "pitchfork",
      xabcd: "pattern",
      "head-shoulders": "pattern",
      "triangle-pattern": "pattern",
    })
  })

  it("nhãn không có dấu gạch dài; màu mặc định không phải chart-3, chart-4, chart-7", () => {
    for (const tool of ADVANCED_TOOLS) {
      expect(TOOL_SPECS[tool].label).not.toMatch(/[–—]/)
      expect(FIB_FORBIDDEN_TOKENS).not.toContain(TOOL_SPECS[tool].defaultStyle.color)
    }
  })

  it("Flashback dùng cả chín công cụ đợt 2 (vùng thời gian chỉ ghi số đơn vị, không có ngày: flashback-fairness.test.ts)", () => {
    for (const tool of ADVANCED_TOOLS) expect(FLASHBACK_TOOLS).toContain(tool)
  })

  it("mọi màu trong lệnh vẽ là token hợp lệ và không dùng chart-3, chart-4, chart-7", () => {
    const valid = new Set<string>(COLOR_TOKENS)
    for (const tool of ADVANCED_TOOLS) {
      const commands = [...drawingCommands([drawingOf(tool)], COORDS), ...handleCommands(drawingOf(tool), COORDS)]
      for (const command of commands) {
        if (!("token" in command)) continue
        expect(valid.has(command.token), `${tool}: ${command.token}`).toBe(true)
        expect(FIB_FORBIDDEN_TOKENS, `${tool}: ${command.token}`).not.toContain(command.token)
      }
    }
  })
})

describe("Fibonacci vùng thời gian", () => {
  it("dãy 0, 1, 2, 3, 5, 8, 13, 21 và cứ thế (mỗi số là tổng hai số trước, từ 1, 2)", () => {
    expect(FIB_SEQUENCE.slice(0, 9)).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34])
    for (let i = 3; i < FIB_SEQUENCE.length; i++) expect(FIB_SEQUENCE[i]).toBe(FIB_SEQUENCE[i - 1] + FIB_SEQUENCE[i - 2])
  })

  it("vạch ở x0 + F(n) x (x1 - x0), dừng khi ra khỏi khung bên phải", () => {
    // Đơn vị 30px từ x = 55: 55, 85, 115, 145, 205, 295, 445; vạch 21 ở 685 đã ngoài khung.
    expect(fibTimeZonePositions(55, 85, 0, 500)).toEqual([
      { n: 0, x: 55 },
      { n: 1, x: 85 },
      { n: 2, x: 115 },
      { n: 3, x: 145 },
      { n: 5, x: 205 },
      { n: 8, x: 295 },
      { n: 13, x: 445 },
    ])
  })

  it("kéo về bên trái thì các vạch đi về bên trái; đơn vị 0 chỉ còn vạch 0", () => {
    expect(fibTimeZonePositions(445, 415, 0, 500).map((entry) => entry.x)).toEqual([445, 415, 385, 355, 295, 205, 55])
    expect(fibTimeZonePositions(200, 200, 0, 500)).toEqual([{ n: 0, x: 200 }])
  })

  it("điểm đầu nằm bên trái khung thì chỉ giữ vạch trong khung", () => {
    // Vạch 5, 8, 13 ở x = 50, 140, 290; vạch 3 ở x = -10 đã ngoài khung bên trái, vạch 21 ở 530 ngoài khung bên phải.
    expect(fibTimeZonePositions(-100, -70, 0, 500)).toEqual([{ n: 5, x: 50 }, { n: 8, x: 140 }, { n: 13, x: 290 }])
  })

  it("lệnh vẽ: mỗi vạch là một đường dọc suốt khung vẽ, mỗi vạch có nhãn số Fibonacci", () => {
    const drawing = drawingOf("fib-time-zones", [[5, 100], [8, 150]])
    const commands = drawingCommands([drawing], COORDS)
    const segments = segmentsOf(commands)
    for (const x of [55, 85, 115, 145, 205, 295, 445]) expect(hasSegment(segments, [x, 0, x, 300]), `x = ${x}`).toBe(true)
    expect(textsOf(commands)).toEqual(["0", "1", "2", "3", "5", "8", "13"])
  })

  it("vùng tương lai tính được: điểm thứ hai sau nến cuối vẫn cho vạch đúng chỗ nhờ ngoại suy của thang thời gian", () => {
    const times = evenTimes(100)
    const scale = createMarketTimeScale(times, "D")
    // Chỉ số 120 và 130 đều sau nến cuối (99): thời gian do thang ngoại suy sinh ra (bỏ cuối tuần).
    const anchors = [scale.anchorAt(120, 10), scale.anchorAt(130, 20)]
    const coords = createPaneCoords({ viewport: { from: 80, to: 280 }, plot: { left: 0, top: 0, right: 1000, bottom: 300 }, timeScale: scale, priceScale: createPriceScale({ mode: "linear", range: { low: 0, high: 30 }, top: 0, height: 300 }) })
    const drawing: Drawing = { id: "z", tool: "fib-time-zones", anchors, style: { ...TOOL_SPECS["fib-time-zones"].defaultStyle } }
    const segments = segmentsOf(drawingCommands([drawing], coords))
    // Một chỉ số 5px: vạch n ở chỉ số 120 + 10 F(n).
    // Viewport tới chỉ số 280: vạch 13 ở chỉ số 250 còn trong khung, vạch 21 ở 330 thì không.
    for (const n of [0, 1, 2, 3, 5, 8, 13]) {
      const x = coords.xOfIndex(120 + 10 * n)
      expect(hasSegment(segments, [x, 0, x, 300], 3), `n = ${n}`).toBe(true)
    }
  })
})

describe("Fibonacci quạt", () => {
  it("giá tia mức L tại đường dọc qua điểm thứ hai: a + (b - a) x L", () => {
    expect(fibFanPrice(100, 200, 0.382)).toBeCloseTo(138.2, 9)
    expect(fibFanPrice(100, 200, 0.5)).toBe(150)
    expect(fibFanPrice(100, 200, 0.618)).toBeCloseTo(161.8, 9)
    expect(fibFanPrice(200, 100, 0.5)).toBe(150)
    expect(fibFanPrice(200, 100, 1)).toBe(100)
  })

  it("ba tia đi từ điểm đầu qua đường dọc, cắt ở mép phải khung; có thêm đường 100% nối hai điểm", () => {
    const commands = drawingCommands([drawingOf("fib-fan")], COORDS)
    const segments = segmentsOf(commands)
    // Điểm đầu (55, 200); điểm thứ hai (305, 100). Đường dọc x = 305: mức 38,2% ở giá 138,2 (y 161,8), 50% ở y 150, 61,8% ở y 138,2.
    // Tại x = 500 (t = 445 / 250 = 1,78): y = 200 - 38,2 x 1,78, 200 - 50 x 1,78 và 200 - 61,8 x 1,78.
    expect(hasSegment(segments, [55, 200, 500, 200 - 38.2 * 1.78])).toBe(true)
    expect(hasSegment(segments, [55, 200, 500, 200 - 50 * 1.78])).toBe(true)
    expect(hasSegment(segments, [55, 200, 500, 200 - 61.8 * 1.78])).toBe(true)
    expect(hasSegment(segments, [55, 200, 305, 100])).toBe(true)
    expect(textsOf(commands)).toEqual(expect.arrayContaining(["38,2%", "50%", "61,8%"]))
  })

  it("mỗi tia có độ dốc đúng tỷ lệ mức Fibonacci của khoảng dốc 100%", () => {
    const segments = segmentsOf(drawingCommands([drawingOf("fib-fan")], COORDS))
    const slopeOf = (target: number) => {
      const segment = segments.find((candidate) => candidate[0] === 55 && candidate[1] === 200 && Math.abs(candidate[2] - 500) < 1e-9 && Math.abs(candidate[3] - target) < 1e-6)!
      return (segment[3] - segment[1]) / (segment[2] - segment[0])
    }
    const full = (100 - 200) / (305 - 55)
    expect(slopeOf(200 - 38.2 * 1.78) / full).toBeCloseTo(0.382, 9)
    expect(slopeOf(200 - 50 * 1.78) / full).toBeCloseTo(0.5, 9)
    expect(slopeOf(200 - 61.8 * 1.78) / full).toBeCloseTo(0.618, 9)
  })
})

describe("Fibonacci kênh", () => {
  it("các đường song song với đường gốc, cách đều theo phần của khoảng tới điểm thứ ba", () => {
    // a (55, 200), b (305, 150), c (155, 100). Đường gốc tại x = 155 ở y 180, nên điểm c cách 80px: mức 1 dịch -80, mức 0,5 dịch -40.
    const commands = drawingCommands([drawingOf("fib-channel")], COORDS)
    const segments = segmentsOf(commands)
    expect(hasSegment(segments, [55, 200, 305, 150])).toBe(true)
    expect(hasSegment(segments, [55, 160, 305, 110])).toBe(true)
    expect(hasSegment(segments, [55, 120, 305, 70])).toBe(true)
    expect(hasSegment(segments, [55, 200 - 0.382 * 80, 305, 150 - 0.382 * 80])).toBe(true)
    expect(textsOf(commands)).toEqual(expect.arrayContaining(["0%", "23,6%", "38,2%", "50%", "61,8%", "78,6%", "100%"]))
  })

  it("đường qua điểm thứ ba đi đúng điểm đó; vùng tô nằm giữa mức 38,2 và 61,8%", () => {
    const commands = drawingCommands([drawingOf("fib-channel")], COORDS)
    const segments = segmentsOf(commands)
    const one = segments.find((segment) => Math.abs(segment[0] - 55) < 1e-9 && Math.abs(segment[1] - 120) < 1e-9)!
    expect(one[1] + ((155 - 55) * (one[3] - one[1])) / (one[2] - one[0])).toBeCloseTo(100, 9)
    const zone = commands.find((command) => command.op === "polygon")
    expect(zone).toMatchObject({ token: "chart-1", alpha: 0.1 })
    const data = Array.from((zone as Extract<DrawCommand, { op: "polygon" }>).data)
    expect(data).toEqual([55, 200 - 0.382 * 80, 305, 150 - 0.382 * 80, 305, 150 - 0.618 * 80, 55, 200 - 0.618 * 80].map((value) => expect.closeTo(value, 9)))
  })

  it("đường gốc thẳng đứng thì dịch ngang", () => {
    const drawing = drawingOf("fib-channel", [[5, 100], [5, 200], [15, 150]])
    const segments = segmentsOf(drawingCommands([drawing], COORDS))
    // Đường gốc x = 55, điểm thứ ba x = 155: mức 1 ở x = 155, mức 0,5 ở x = 105.
    expect(hasSegment(segments, [155, 200, 155, 100])).toBe(true)
    expect(hasSegment(segments, [105, 200, 105, 100])).toBe(true)
  })
})

describe("Pitchfork Andrews", () => {
  // p0 (55, 200), p1 (155, 100), p2 (255, 180); trung điểm p1-p2 là (205, 140), hướng (150, -60).
  it("đường giữa đi từ điểm đầu qua trung điểm đoạn hai - ba; hai nhánh xuất phát từ điểm hai và ba, song song với đường giữa", () => {
    const segments = segmentsOf(drawingCommands([drawingOf("pitchfork")], COORDS))
    expect(hasSegment(segments, [55, 200, 500, 200 - 60 * (445 / 150)])).toBe(true)
    expect(hasSegment(segments, [155, 100, 405, 0])).toBe(true)
    expect(hasSegment(segments, [255, 180, 500, 180 - 60 * (245 / 150)])).toBe(true)
  })

  it("ba tia cùng độ dốc và đường giữa đi qua trung điểm", () => {
    const rays = solidSegmentsOf(drawingCommands([drawingOf("pitchfork")], COORDS))
    const slopes = rays.map((segment) => (segment[3] - segment[1]) / (segment[2] - segment[0]))
    expect(rays).toHaveLength(3)
    for (const slope of slopes) expect(slope).toBeCloseTo(-60 / 150, 9)
    // Đường giữa tại x = 205 ở y 140.
    const median = rays.find((segment) => segment[0] === 55)!
    expect(median[1] + (205 - 55) * ((median[3] - median[1]) / (median[2] - median[0]))).toBeCloseTo(140, 9)
  })

  it("điểm hai trùng điểm ba (không có hướng) hoặc trung điểm trùng điểm đầu thì không có tia", () => {
    const same = drawingOf("pitchfork", [[5, 100], [15, 150], [15, 150]])
    expect(segmentsOf(drawingCommands([same], COORDS)).every((segment) => segment.every(Number.isFinite))).toBe(true)
    const onMid = drawingOf("pitchfork", [[15, 150], [10, 100], [20, 200]])
    expect(allFinite(drawingCommands([onMid], COORDS))).toBe(true)
  })
})

describe("Gann quạt", () => {
  it("chín góc 1x8, 1x4, 1x3, 1x2, 1x1, 2x1, 3x1, 4x1, 8x1, có nhãn", () => {
    expect(GANN_ANGLES.map((angle) => angle.label)).toEqual(["1x8", "1x4", "1x3", "1x2", "1x1", "2x1", "3x1", "4x1", "8x1"])
    expect(textsOf(drawingCommands([drawingOf("gann-fan")], COORDS)).sort()).toEqual(GANN_ANGLES.map((angle) => angle.label).sort())
  })

  it("hướng của góc time x price: độ dốc gấp price / time lần đường 1x1", () => {
    expect(gannDirection(100, -50, { time: 1, price: 2 })).toEqual({ x: 100, y: -100 })
    expect(gannDirection(100, -50, { time: 2, price: 1 })).toEqual({ x: 100, y: -25 })
    expect(gannDirection(100, -50, { time: 8, price: 1 })).toEqual({ x: 100, y: -6.25 })
    expect(gannDirection(100, -50, { time: 1, price: 8 })).toEqual({ x: 100, y: -400 })
  })

  it("đường 1x1 đi qua điểm thứ hai; các tia khác có đúng độ dốc tính tay", () => {
    // a (55, 200), b (155, 150): đường 1x1 hướng (100, -50), chạm mép trên y = 0 tại x = 455.
    const segments = segmentsOf(drawingCommands([drawingOf("gann-fan")], COORDS))
    expect(hasSegment(segments, [55, 200, 455, 0])).toBe(true)
    // 1x2: hướng (100, -100), chạm y = 0 tại x = 255. 1x8: (100, -400), chạm tại x = 105.
    expect(hasSegment(segments, [55, 200, 255, 0])).toBe(true)
    expect(hasSegment(segments, [55, 200, 105, 0])).toBe(true)
    // 2x1: hướng (100, -25), tại x = 500 (t = 4,45) y = 200 - 111,25. 8x1: (100, -6,25), y = 200 - 27,8125.
    expect(hasSegment(segments, [55, 200, 500, 200 - 25 * 4.45])).toBe(true)
    expect(hasSegment(segments, [55, 200, 500, 200 - 6.25 * 4.45])).toBe(true)
  })

  it("hai điểm thẳng đứng hoặc nằm ngang thì chỉ còn đường 1x1, không NaN", () => {
    for (const points of [[[5, 100], [5, 200]], [[5, 100], [15, 100]]] as [number, number][][]) {
      const commands = drawingCommands([drawingOf("gann-fan", points)], COORDS)
      expect(allFinite(commands)).toBe(true)
      expect(textsOf(commands).length).toBeLessThanOrEqual(1)
    }
  })
})

describe("Gann hộp", () => {
  // a (85, 210), b (305, 90): giá 90 -> 210 theo chiều dọc, 220px theo chiều ngang.
  it("mức 0; 0,25; 0,382; 0,5; 0,618; 0,75; 1 theo cả hai chiều", () => {
    expect(GANN_BOX_LEVELS).toEqual([0, 0.25, 0.382, 0.5, 0.618, 0.75, 1])
  })

  it("mức ngang tính theo giá, mức dọc theo chỉ số nến", () => {
    const segments = segmentsOf(drawingCommands([drawingOf("gann-box")], COORDS))
    // Giá = 90 + 120 L: 120, 135,84, 150, 164,16, 180. y = 300 - giá.
    for (const price of [90, 120, 135.84, 150, 164.16, 180, 210]) expect(hasSegment(segments, [85, py(price), 305, py(price)]), `giá ${price}`).toBe(true)
    // x = 85 + 220 L: 140, 169,04, 195, 220,96, 250.
    for (const x of [85, 140, 169.04, 195, 220.96, 250, 305]) expect(hasSegment(segments, [x, 90, x, 210]), `x ${x}`).toBe(true)
  })

  it("nhãn ngang ghi tỷ lệ và giá, nhãn dọc ghi tỷ lệ", () => {
    const texts = textsOf(drawingCommands([drawingOf("gann-box")], COORDS, { formatPrice: (price) => price.toFixed(2) }))
    expect(texts).toEqual(expect.arrayContaining(["0 · 90.00", "0,25 · 120.00", "0,382 · 135.84", "0,5 · 150.00", "0,618 · 164.16", "0,75 · 180.00", "1 · 210.00"]))
    // Hộp rộng 220px (dưới 240px) bỏ nhãn dọc cho khỏi chen nhau; hộp rộng hơn thì có đủ năm nhãn dọc.
    expect(texts).not.toContain("0,25")
    const wide = textsOf(drawingCommands([drawingOf("gann-box", [[2, 90], [40, 210]])], COORDS))
    expect(wide).toEqual(expect.arrayContaining(["0,25", "0,382", "0,5", "0,618", "0,75"]))
  })

  it("vẽ ngược (kéo từ phải xuống trái) cho cùng hình", () => {
    const forward = segmentsOf(drawingCommands([drawingOf("gann-box", [[8, 90], [30, 210]])], COORDS)).map((segment) => segment.map((value) => Math.round(value * 1e6) / 1e6).join()).sort()
    const reverse = segmentsOf(drawingCommands([drawingOf("gann-box", [[30, 210], [8, 90]])], COORDS)).map((segment) => segment.map((value) => Math.round(value * 1e6) / 1e6).join()).sort()
    // Mức giá nội suy từ điểm đầu nên cùng tập đường ngang và dọc; chỉ đường chéo đổi chiều.
    const grid = (list: string[]) => list.filter((entry) => { const [x1, y1, x2, y2] = entry.split(",").map(Number); return x1 === x2 || y1 === y2 })
    expect(grid(reverse)).toHaveLength(14)
    expect(grid(forward)).toHaveLength(14)
  })
})

describe("XABCD", () => {
  it("tỷ lệ theo giá tuyệt đối: Gartley có XAB 0,618, ABC 0,838, BCD 1,324, XAD 0,786", () => {
    const ratios = xabcdRatios([100, 200, 138.2, 190, 121.4])
    expect(ratios.xab).toBeCloseTo(0.618, 9)
    expect(ratios.abc).toBeCloseTo(51.8 / 61.8, 9)
    expect(ratios.bcd).toBeCloseTo(68.6 / 51.8, 9)
    expect(ratios.xad).toBeCloseTo(0.786, 9)
  })

  it("chiều lên hay xuống cho cùng tỷ lệ (dùng trị tuyệt đối)", () => {
    const down = xabcdRatios([300, 200, 261.8, 210, 278.6])
    expect(down.xab).toBeCloseTo(0.618, 9)
    expect(down.xad).toBeCloseTo(0.786, 9)
  })

  it("mẫu số bằng 0 (hai điểm cùng giá) cho null, không phải vô cực hay NaN", () => {
    expect(xabcdRatios([100, 100, 120, 110, 105])).toEqual({ xab: null, abc: 0.5, bcd: 0.5, xad: null })
    expect(xabcdRatios([100, 200, 200, 190, 121])).toMatchObject({ xab: 0, abc: null })
  })

  it("định dạng tỷ lệ: ba chữ số thập phân, bỏ số 0 thừa, dấu phẩy", () => {
    expect(ratioText(0.618)).toBe("0,618")
    expect(ratioText(1.27201)).toBe("1,272")
    expect(ratioText(2)).toBe("2")
    expect(ratioText(0.5)).toBe("0,5")
  })

  it("lệnh vẽ: nhãn X A B C D ở năm điểm, bốn tỷ lệ ở bốn đường nét đứt, đủ bốn cạnh và bốn đường nối", () => {
    const commands = drawingCommands([drawingOf("xabcd")], COORDS)
    const texts = textsOf(commands)
    for (const name of ["X", "A", "B", "C", "D"]) expect(texts).toContain(name)
    for (const ratio of ["0,618", "0,838", "1,324", "0,786"]) expect(texts).toContain(ratio)
    const segments = segmentsOf(commands)
    // X (45, 200), A (125, 100), B (205, 161,8), C (285, 110), D (385, 178,6).
    expect(hasSegment(segments, [px(4), py(100), px(12), py(200)])).toBe(true)
    expect(hasSegment(segments, [px(12), py(200), px(20), py(138.2)])).toBe(true)
    expect(hasSegment(segments, [px(20), py(138.2), px(28), py(190)])).toBe(true)
    expect(hasSegment(segments, [px(28), py(190), px(38), py(121.4)])).toBe(true)
    expect(hasSegment(segments, [px(4), py(100), px(20), py(138.2)])).toBe(true)
    expect(hasSegment(segments, [px(4), py(100), px(38), py(121.4)])).toBe(true)
  })

  it("nhãn đặt ở đỉnh nằm trên điểm, ở đáy nằm dưới điểm", () => {
    const labels = drawingCommands([drawingOf("xabcd")], COORDS).flatMap((command) => (command.op === "text" ? [command] : []))
    const a = labels.find((label) => label.text === "A")!
    const b = labels.find((label) => label.text === "B")!
    expect(a.y).toBeLessThan(py(200))
    expect(b.y).toBeGreaterThan(py(138.2) - 1)
  })

  it("chưa đủ năm điểm thì chưa có tỷ lệ (bản xem trước)", () => {
    const preview = previewCommands({ tool: "xabcd", anchors: ADVANCED_SAMPLE.xabcd.slice(0, 3).map(([session, price]) => ({ session, price })) }, { session: 28, price: 190 }, COORDS)
    expect(textsOf(preview).filter((text) => /\d/.test(text))).toEqual([])
  })
})

describe("Vai đầu vai", () => {
  it("bảy điểm: nhãn Vai trái, Đầu, Vai phải và Đường cổ", () => {
    const texts = textsOf(drawingCommands([drawingOf("head-shoulders")], COORDS))
    expect(texts).toEqual(expect.arrayContaining(["Vai trái", "Đầu", "Vai phải", "Đường cổ"]))
  })

  it("đường cổ nối hai đáy và kéo dài nét đứt tới điểm cuối với cùng độ dốc", () => {
    // p2 (135, 170), p4 (315, 172), p6 (445, 190): đường cổ tại x = 445 ở y 170 + 2 / 180 x 310.
    const commands = drawingCommands([drawingOf("head-shoulders")], COORDS)
    const segments = segmentsOf(commands)
    expect(hasSegment(segments, [px(13), py(130), px(31), py(128)])).toBe(true)
    expect(hasSegment(segments, [px(31), py(128), px(44), 170 + (2 / 180) * 310])).toBe(true)
  })

  it("hình ngược (đầu ngược xuống dưới đường cổ): nhãn Đường cổ nằm phía trên đường", () => {
    const inverse: [number, number][] = [[2, 220], [8, 150], [13, 190], [22, 100], [31, 192], [37, 145], [44, 210]]
    const label = drawingCommands([drawingOf("head-shoulders", inverse)], COORDS).flatMap((command) => (command.op === "text" ? [command] : [])).find((entry) => entry.text === "Đường cổ")!
    // Đường cổ ở khoảng y 110 trên màn hình, nhãn nằm trên (y nhỏ hơn).
    expect(label.y).toBeLessThan(py(191))
  })

  it("xem trước từng bước (một đến sáu điểm) không lỗi", () => {
    for (let count = 1; count <= 6; count++) {
      const anchors = ADVANCED_SAMPLE["head-shoulders"].slice(0, count).map(([session, price]) => ({ session, price }))
      expect(allFinite(previewCommands({ tool: "head-shoulders", anchors: anchors.slice(0, -1) }, anchors.at(-1), COORDS)), `${count} điểm`).toBe(true)
    }
  })
})

describe("Mẫu hình tam giác", () => {
  // A (35, 50), B (95, 240), C (225, 110), D (285, 190).
  it("hai đường hội tụ: A - C và B - D được kéo dài tới giao điểm khi giao điểm nằm phía trước", () => {
    const segments = segmentsOf(drawingCommands([drawingOf("triangle-pattern")], COORDS))
    const slopeUp = 60 / 190
    const slopeDown = -50 / 190
    const apexX = (240 - slopeDown * 95 - (50 - slopeUp * 35)) / (slopeUp - slopeDown)
    const apexY = 50 + slopeUp * (apexX - 35)
    expect(apexX).toBeCloseTo(390.45, 1)
    expect(hasSegment(segments, [35, 50, apexX, apexY], 4)).toBe(true)
    expect(hasSegment(segments, [95, 240, apexX, apexY], 4)).toBe(true)
  })

  it("nhãn A B C D", () => {
    expect(textsOf(drawingCommands([drawingOf("triangle-pattern")], COORDS)).sort()).toEqual(["A", "B", "C", "D"])
  })

  it("hai đường giãn ra (không hội tụ) thì chỉ vẽ tới C và D", () => {
    // A (35, 150), C (225, 110) đi xuống; B (95, 100), D (285, 60) đi lên: giãn ra.
    const diverging: [number, number][] = [[3, 150], [9, 200], [22, 190], [28, 240]]
    const segments = segmentsOf(drawingCommands([drawingOf("triangle-pattern", diverging)], COORDS))
    expect(hasSegment(segments, [px(3), py(150), px(22), py(190)])).toBe(true)
    expect(hasSegment(segments, [px(9), py(200), px(28), py(240)])).toBe(true)
  })
})

describe("chọn hình, tay nắm, kéo", () => {
  /** Điểm nằm trên một nét của hình (tính tay) và một điểm đủ xa mọi nét. */
  const ON_STROKE: Record<AdvancedTool, [number, number]> = {
    "fib-time-zones": [127, 150],
    "fib-fan": [180, 150],
    "fib-channel": [180, 95],
    pitchfork: [205, 140],
    "gann-fan": [155, 150],
    "gann-box": [200, 150],
    xabcd: [85, 150],
    "head-shoulders": [55, 165],
    "triangle-pattern": [130, 80],
  }
  const FAR: Record<AdvancedTool, [number, number]> = {
    "fib-time-zones": [155, 150],
    "fib-fan": [30, 20],
    "fib-channel": [180, 250],
    pitchfork: [30, 20],
    "gann-fan": [400, 290],
    "gann-box": [400, 150],
    xabcd: [450, 20],
    "head-shoulders": [480, 10],
    "triangle-pattern": [440, 30],
  }

  for (const tool of ADVANCED_TOOLS) {
    it(`${tool}: bấm trên nét thì chọn, bấm xa thì không; hình ẩn không được chọn`, () => {
      const drawing = drawingOf(tool)
      expect(hitDrawing([drawing], { x: ON_STROKE[tool][0], y: ON_STROKE[tool][1] }, COORDS)?.id, "trên nét").toBe("d1")
      expect(hitDrawing([drawing], { x: FAR[tool][0], y: FAR[tool][1] }, COORDS), "xa").toBeNull()
      expect(hitDrawing([{ ...drawing, hidden: true }], { x: ON_STROKE[tool][0], y: ON_STROKE[tool][1] }, COORDS)).toBeNull()
    })

    it(`${tool}: mỗi điểm neo có một tay nắm bắt được; hình khoá không có tay nắm`, () => {
      const drawing = drawingOf(tool)
      const points = resolveAnchors(drawing.anchors, COORDS)!
      expect(points).toHaveLength(anchorCountOf(tool))
      points.forEach((point, index) => {
        // Điểm neo trùng nhau về vị trí thì lấy điểm gần nhất, nên chỉ kiểm khi không bị điểm khác đè.
        const handle = hitHandle(drawing, { x: point.x + 2, y: point.y - 2 }, COORDS)
        expect(handle, `${tool} #${index}`).not.toBeNull()
        expect(points[handle!].x).toBeCloseTo(point.x, 6)
        expect(points[handle!].y).toBeCloseTo(point.y, 6)
      })
      expect(hitHandle({ ...drawing, locked: true }, { x: points[0].x, y: points[0].y }, COORDS)).toBeNull()
      expect(handleCommands(drawing, COORDS)).toHaveLength(anchorCountOf(tool) * 2)
      expect(handleCommands({ ...drawing, locked: true }, COORDS)).toEqual([])
    })

    it(`${tool}: kéo tay nắm chỉ đổi đúng điểm neo đó, các điểm khác giữ nguyên tham chiếu`, () => {
      const drawing = drawingOf(tool)
      for (let handle = 0; handle < anchorCountOf(tool); handle++) {
        const moved = moveHandle(drawing, handle, { x: 333, y: 77 }, COORDS)
        moved.anchors.forEach((anchor, index) => {
          if (index === handle) expect(anchor).toEqual({ session: expect.closeTo(32.8, 9), price: expect.closeTo(223, 9) })
          else expect(anchor).toBe(drawing.anchors[index])
        })
      }
    })

    it(`${tool}: kéo cả hình dịch mọi điểm neo đúng (dx, dy) trên màn hình`, () => {
      const drawing = drawingOf(tool)
      const moved = translateDrawing(drawing, 30, -20, COORDS)
      const before = resolveAnchors(drawing.anchors, COORDS)!
      const after = resolveAnchors(moved.anchors, COORDS)!
      after.forEach((point, index) => {
        expect(point.x).toBeCloseTo(before[index].x + 30, 6)
        expect(point.y).toBeCloseTo(before[index].y - 20, 6)
      })
    })
  }

  it("hình vẽ sau nằm trên hình vẽ trước khi chồng nhau", () => {
    const first = drawingOf("gann-fan", undefined, { id: "1" })
    const second = drawingOf("gann-fan", undefined, { id: "2" })
    expect(hitDrawing([first, second], { x: 155, y: 150 }, COORDS)?.id).toBe("2")
  })

  it("xem trước nhiều bước: các điểm đã bấm cộng điểm con trỏ, tay nắm chỉ ở điểm đã bấm", () => {
    for (const tool of ADVANCED_TOOLS) {
      const points = ADVANCED_SAMPLE[tool].map(([session, price]) => ({ session, price }))
      for (let placed = 1; placed < points.length; placed++) {
        const commands = previewCommands({ tool, anchors: points.slice(0, placed) }, points[placed], COORDS)
        expect(allFinite(commands), `${tool} ${placed}`).toBe(true)
        expect(commands.filter((command) => command.op === "circle"), `${tool} ${placed}`).toHaveLength(placed * 2)
      }
    }
  })
})

describe("thang log và phần trăm", () => {
  const PLOT = { left: 0, top: 0, right: 500, bottom: 300 }
  const coordsOf = (mode: PriceScaleMode): PaneCoords =>
    createPaneCoords({
      viewport: { from: -0.5, to: 49.5 },
      plot: PLOT,
      timeScale: createSessionTimeScale(50, 50),
      priceScale: createPriceScale({ mode, range: mode === "percent" ? { low: 20, high: 300 } : { low: 50, high: 300 }, base: 100, top: 0, height: 300 }),
    })
  const modes: PriceScaleMode[] = ["linear", "log", "percent"]

  it("hộp Gann: mức ngang là nội suy tuyến tính theo giá rồi mới đổi sang y, ở cả ba thang", () => {
    for (const mode of modes) {
      const coords = coordsOf(mode)
      const segments = segmentsOf(drawingCommands([drawingOf("gann-box")], coords))
      for (const level of [0, 0.25, 0.5, 0.75, 1]) {
        const y = coords.yOfPrice(90 + 120 * level)
        expect(hasSegment(segments, [px(8), y, px(30), y], 6), `${mode} mức ${level}`).toBe(true)
      }
    }
  })

  it("ở thang log mức 0,5 của hộp Gann lệch khỏi trung điểm màn hình (giá tuyến tính, y theo log), khác thang tuyến tính", () => {
    const log = coordsOf("log")
    const mid = (log.yOfPrice(90) + log.yOfPrice(210)) / 2
    expect(log.yOfPrice(150)).not.toBeCloseTo(mid, 1)
    const linear = coordsOf("linear")
    expect(linear.yOfPrice(150)).toBeCloseTo((linear.yOfPrice(90) + linear.yOfPrice(210)) / 2, 9)
  })

  it("kéo cả hình dịch mọi nét đúng (dx, dy) màn hình ở cả ba thang (hộp Gann, kênh Fibonacci, mẫu hình)", () => {
    for (const mode of modes) {
      const coords = coordsOf(mode)
      for (const tool of ["gann-box", "fib-channel", "xabcd", "head-shoulders"] as const) {
        const drawing = drawingOf(tool)
        const moved = translateDrawing(drawing, 40, -25, coords)
        // Chỉ so các đoạn không bị cắt theo khung: dịch hết khung thì mọi nét đều dịch đúng (dx, dy).
        const before = segmentsOf(drawingCommands([drawing], coords))
        const after = segmentsOf(drawingCommands([moved], coords))
        expect(after.length, `${mode} ${tool}`).toBe(before.length)
        before.forEach((segment, index) => {
          expect(after[index][0], `${mode} ${tool} x1`).toBeCloseTo(segment[0] + 40, 5)
          expect(after[index][1], `${mode} ${tool} y1`).toBeCloseTo(segment[1] - 25, 5)
          expect(after[index][2], `${mode} ${tool} x2`).toBeCloseTo(segment[2] + 40, 5)
          expect(after[index][3], `${mode} ${tool} y2`).toBeCloseTo(segment[3] - 25, 5)
        })
      }
    }
  })

  it("Pitchfork ở thang log: đường xiên tính trên toạ độ màn hình, đường giữa vẫn qua trung điểm màn hình của đoạn hai - ba và các nhánh song song trên màn hình", () => {
    const coords = coordsOf("log")
    const drawing = drawingOf("pitchfork")
    const [p0, p1, p2] = resolveAnchors(drawing.anchors, coords)!
    const rays = solidSegmentsOf(drawingCommands([drawing], coords))
    expect(rays).toHaveLength(3)
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const median = rays.find((segment) => Math.abs(segment[0] - p0.x) < 1e-9)!
    const cross = (median[2] - median[0]) * (mid.y - median[1]) - (median[3] - median[1]) * (mid.x - median[0])
    expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.hypot(median[2] - median[0], median[3] - median[1]) * 500)
    const direction = (segment: number[]) => Math.atan2(segment[3] - segment[1], segment[2] - segment[0])
    for (const ray of rays) expect(direction(ray)).toBeCloseTo(direction(median), 9)
  })

  it("quạt Fibonacci ở thang log: mức đo theo giá nên tia 50% đi qua điểm có y của giá trung bình", () => {
    const coords = coordsOf("log")
    const drawing = drawingOf("fib-fan")
    const [a, b] = resolveAnchors(drawing.anchors, coords)!
    const target = coords.yOfPrice(fibFanPrice(100, 200, 0.5))
    const ray = segmentsOf(drawingCommands([drawing], coords)).find((segment) => Math.abs(segment[0] - a.x) < 1e-9 && Math.abs((segment[3] - segment[1]) / (segment[2] - segment[0]) - (target - a.y) / (b.x - a.x)) < 1e-9)
    expect(ray).toBeDefined()
  })

  it("chọn hình ở thang log đúng chỗ đã vẽ", () => {
    const coords = coordsOf("log")
    const drawing = drawingOf("gann-box")
    const y = coords.yOfPrice(150)
    expect(hitDrawing([drawing], { x: 200, y }, coords)?.id).toBe("d1")
    // Giữa mức 0,5 (giá 150) và mức 0,382 (giá 135,84): ở thang log hai đường cách nhau 16,6px nên điểm giữa cách mỗi đường 8,3px, ngoài 7px.
    const between = (y + coords.yOfPrice(135.84)) / 2
    // x = 182 cách xa các đường dọc (169,04 và 195) và đường chéo.
    expect(hitDrawing([drawing], { x: 182, y: between }, coords)).toBeNull()
    expect(hitDrawing([drawing], { x: 200, y: coords.yOfPrice(135.84) }, coords)?.id).toBe("d1")
  })
})

describe("điểm neo giữ khoá `time`: không lệch khi nạp thêm lịch sử, đổi khung", () => {
  const START = 1_700_000_000
  const DAY = 86_400
  const PLOT = { left: 0, top: 0, right: 600, bottom: 300 }
  const PRICE = { low: 0, high: 300 }
  const times = evenTimes(200, START, DAY)
  const older = evenTimes(100, START - 100 * DAY, DAY)
  const before = makeCoords({ times, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
  const after = makeCoords({ times: [...older, ...times], viewport: { from: 200, to: 260 }, plot: PLOT, price: PRICE })

  const timed = (tool: AdvancedTool): Drawing => {
    // Trải điểm mẫu trên 40 nến quanh nến 110 đến 150, giữ nguyên giá.
    const base = ADVANCED_SAMPLE[tool]
    const span = Math.max(...base.map(([session]) => session)) || 1
    return {
      id: "t",
      tool,
      anchors: base.map(([session, price]) => ({ time: times[110 + Math.round((session / span) * 40)], price })),
      style: { ...TOOL_SPECS[tool].defaultStyle },
    }
  }

  for (const tool of ADVANCED_TOOLS) {
    it(`${tool}: lệnh vẽ, chọn hình và tay nắm y hệt trước và sau khi nạp 100 nến cũ`, () => {
      const drawing = timed(tool)
      expect(drawingCommands([drawing], after)).toEqual(drawingCommands([drawing], before))
      const points = resolveAnchors(drawing.anchors, before)!
      expect(hitHandle(drawing, { x: points[0].x + 1, y: points[0].y }, before)).toBe(hitHandle(drawing, { x: points[0].x + 1, y: points[0].y }, after))
      expect(distanceToDrawing(drawing, { x: 100, y: 100 }, after)).toBeCloseTo(distanceToDrawing(drawing, { x: 100, y: 100 }, before), 9)
    })
  }

  it("kéo tay nắm ở khung tuần giữ các điểm neo còn lại và cho điểm neo mới đúng thời điểm khi quay về khung ngày", () => {
    const daily = evenTimes(500, START, DAY)
    const weekly = evenTimes(100, START, 5 * DAY)
    const inDaily = makeCoords({ times: daily, viewport: { from: 100, to: 160 }, plot: PLOT, price: PRICE })
    const inWeekly = makeCoords({ times: weekly, viewport: { from: 20, to: 32 }, plot: PLOT, price: PRICE })
    const drawing: Drawing = { id: "t", tool: "xabcd", anchors: [110, 118, 126, 134, 142].map((index, i) => ({ time: daily[index], price: [100, 200, 138, 190, 121][i] })), style: { ...TOOL_SPECS.xabcd.defaultStyle } }
    const moved = moveHandle(drawing, 4, { x: inWeekly.xOfIndex(28.4), y: inWeekly.yOfPrice(80) }, inWeekly)
    for (let index = 0; index < 4; index++) expect(moved.anchors[index]).toBe(drawing.anchors[index])
    expect(Object.keys(moved.anchors[4])).toEqual(["time", "price"])
    expect(inDaily.indexOfAnchor(moved.anchors[4])).toBeCloseTo(142, 6)
  })

  it("vùng thời gian Fibonacci ở khung tuần: vạch nằm đúng thời điểm, x tỷ lệ với `time` chứ không với chỉ số ngày", () => {
    const daily = evenTimes(500, START, DAY)
    const weekly = evenTimes(100, START, 5 * DAY)
    const inDaily = makeCoords({ times: daily, viewport: { from: 100, to: 220 }, plot: PLOT, price: PRICE })
    const inWeekly = makeCoords({ times: weekly, viewport: { from: 20, to: 44 }, plot: PLOT, price: PRICE })
    const drawing: Drawing = { id: "z", tool: "fib-time-zones", anchors: [{ time: daily[110], price: 50 }, { time: daily[115], price: 60 }], style: { ...TOOL_SPECS["fib-time-zones"].defaultStyle } }
    // Mỗi đơn vị là 5 ngày. Vạch n ở ngày 110 + 5 F(n), tức tuần 22 + F(n).
    const dailyX = segmentsOf(drawingCommands([drawing], inDaily)).filter((segment) => segment[0] === segment[2]).map((segment) => segment[0])
    const weeklyX = segmentsOf(drawingCommands([drawing], inWeekly)).filter((segment) => segment[0] === segment[2]).map((segment) => segment[0])
    for (const n of [0, 1, 2, 3, 5, 8]) {
      expect(dailyX.some((x) => Math.abs(x - inDaily.xOfIndex(110 + 5 * n)) < 1e-6), `ngày n=${n}`).toBe(true)
      expect(weeklyX.some((x) => Math.abs(x - inWeekly.xOfIndex(22 + n)) < 1e-6), `tuần n=${n}`).toBe(true)
    }
  })
})

describe("trường hợp suy biến không sinh NaN", () => {
  const same = (tool: AdvancedTool, session: number, price: number): [number, number][] => ADVANCED_SAMPLE[tool].map(() => [session, price])
  const sameX = (tool: AdvancedTool): [number, number][] => ADVANCED_SAMPLE[tool].map(([, price]) => [12, price])
  const samePrice = (tool: AdvancedTool): [number, number][] => ADVANCED_SAMPLE[tool].map(([session]) => [session, 150])
  const nanPrice = (tool: AdvancedTool): [number, number][] => ADVANCED_SAMPLE[tool].map(([session], index) => [session, index === 1 ? Number.NaN : 100 + index * 10])

  const cases: [string, (tool: AdvancedTool) => [number, number][]][] = [
    ["mọi điểm trùng nhau", (tool) => same(tool, 10, 100)],
    ["mọi điểm cùng chỉ số nến (số nến 0)", sameX],
    ["mọi điểm cùng giá (khoảng giá 0)", samePrice],
  ]

  for (const [name, build] of cases) {
    for (const tool of ADVANCED_TOOLS) {
      it(`${tool}: ${name}`, () => {
        const drawing = drawingOf(tool, build(tool))
        const commands = drawingCommands([drawing], COORDS)
        expect(allFinite(commands)).toBe(true)
        expect(allFinite(handleCommands(drawing, COORDS))).toBe(true)
        const distance = distanceToDrawing(drawing, { x: 100, y: 100 }, COORDS)
        expect(Number.isNaN(distance)).toBe(false)
        expect(() => hitDrawing([drawing], { x: 100, y: 100 }, COORDS)).not.toThrow()
        const points = ADVANCED_SAMPLE[tool].length
        for (let placed = 1; placed < points; placed++) {
          const anchors = build(tool).slice(0, placed).map(([session, price]) => ({ session, price }))
          expect(allFinite(previewCommands({ tool, anchors }, { session: 20, price: 100 }, COORDS))).toBe(true)
        }
      })
    }
  }

  it("giá không hữu hạn: hình không được vẽ và không được chọn (như công cụ có sẵn)", () => {
    for (const tool of ADVANCED_TOOLS) {
      const drawing = drawingOf(tool, nanPrice(tool))
      expect(drawingCommands([drawing], COORDS), tool).toEqual([])
      expect(hitDrawing([drawing], { x: 100, y: 100 }, COORDS), tool).toBeNull()
    }
  })

  it("thang giá suy biến (khoảng giá 0 trên trục) cho y không hữu hạn: không NaN trong lệnh vẽ", () => {
    const flat = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, price: { low: 100, high: 100 } })
    for (const tool of ADVANCED_TOOLS) {
      expect(allFinite(drawingCommands([drawingOf(tool)], flat)), tool).toBe(true)
      expect(Number.isNaN(distanceToDrawing(drawingOf(tool), { x: 10, y: 10 }, flat)), tool).toBe(false)
    }
  })

  it("khung vẽ rộng 0: không NaN", () => {
    const empty = makeCoords({ mode: "session", viewport: { from: -0.5, to: 49.5 }, plot: { left: 100, top: 100, right: 100, bottom: 100 }, price: { low: 0, high: 300 } })
    for (const tool of ADVANCED_TOOLS) expect(allFinite(drawingCommands([drawingOf(tool)], empty)), tool).toBe(true)
  })

  it("clipLine không bị gọi với hướng 0: tia có hướng 0 bị bỏ", () => {
    expect(clipLine({ x: 1, y: 1 }, { x: 1, y: 1 }, { left: 0, top: 0, right: 10, bottom: 10 }, "forward")).toBeNull()
  })
})

describe("nhân theo dpr", () => {
  it("toạ độ, độ dày, nét đứt và cỡ chữ nhân với dpr, count vẫn là số phần tử dùng được", () => {
    const one = drawingCommands([drawingOf("gann-box")], COORDS)
    const two = drawingCommands([drawingOf("gann-box")], COORDS, { dpr: 2 })
    expect(two[0]).toEqual({ op: "clip", x: 0, y: 0, width: 1000, height: 600 })
    const firstLines = linesOf(one)[0]
    const firstLinesTwo = linesOf(two)[0]
    expect(firstLinesTwo.width).toBeCloseTo(firstLines.width * 2, 9)
    expect(Array.from(firstLinesTwo.data.subarray(0, firstLinesTwo.count))).toEqual(Array.from(firstLines.data.subarray(0, firstLines.count)).map((value) => value * 2))
    for (const command of two) {
      if ("data" in command) expect(command.count).toBeLessThanOrEqual(command.data.length)
      if (command.op === "text") expect(command.size).toBe(22)
    }
    const dashed = linesOf(two).find((command) => command.dash)
    expect(dashed?.dash).toEqual([12, 8])
  })

  it("độ dày tăng khi đang chọn", () => {
    const plain = linesOf(drawingCommands([drawingOf("pitchfork")], COORDS)).map((command) => command.width)
    const picked = linesOf(drawingCommands([drawingOf("pitchfork")], COORDS, { selectedId: "d1" })).map((command) => command.width)
    expect(Math.max(...picked)).toBeGreaterThan(Math.max(...plain))
  })
})

describe("qua bộ vẽ thật (paintScene)", () => {
  const PALETTE = Object.fromEntries(COLOR_TOKENS.map((token) => [token, "#123456"])) as Record<ColorToken, string>
  const paint = (scene: DrawCommand[]) => {
    const context = fakeContext()
    paintScene(context, scene, { palette: PALETTE, fontFamily: DEFAULT_FONT_FAMILY, defaultSize: 11, text: new TextPainter() })
    return context
  }

  for (const tool of ADVANCED_TOOLS) {
    it(`${tool}: ra nét và chữ thật, toạ độ đưa cho canvas hữu hạn`, () => {
      const context = paint(drawingCommands([drawingOf(tool, undefined, { text: "x" })], COORDS))
      expect(named(context, "stroke").length, tool).toBeGreaterThan(0)
      // Pitchfork Andrews không có nhãn chữ; tám công cụ còn lại đều có.
      if (tool !== "pitchfork") expect(named(context, "fillText").length, tool).toBeGreaterThan(0)
      const numbers = [...named(context, "moveTo"), ...named(context, "lineTo")].flatMap((call) => call.slice(1) as number[])
      expect(numbers.length).toBeGreaterThan(0)
      expect(numbers.every(Number.isFinite)).toBe(true)
    })

    it(`${tool}: bản xem trước và tay nắm cũng ra nét`, () => {
      const points = ADVANCED_SAMPLE[tool].map(([session, price]) => ({ session, price }))
      const context = paint(previewCommands({ tool, anchors: points.slice(0, -1) }, points.at(-1), COORDS))
      expect(named(context, "stroke").length + named(context, "fill").length, tool).toBeGreaterThan(0)
      expect(named(context, "arc").length).toBeGreaterThanOrEqual(points.length - 1)
    })
  }

  it("hình ở vùng nhỏ chỉ có vùng tô vẫn được vẽ (mảng màu của vai đầu vai và hộp Gann)", () => {
    for (const tool of ["head-shoulders", "gann-box", "pitchfork", "xabcd", "triangle-pattern", "fib-channel"] as const) {
      const context = paint(drawingCommands([drawingOf(tool)], COORDS))
      expect(named(context, "fill").length + named(context, "fillRect").length, tool).toBeGreaterThan(0)
    }
  })
})

describe("trạng thái: vẽ, khoá, ẩn, nhân bản, lưu và nạp lại", () => {
  function drawn(tool: AdvancedTool) {
    let state = drawingsReducer(INITIAL_DRAWINGS, { type: "tool", tool })
    const anchors = ADVANCED_SAMPLE[tool].map(([session, price]): Anchor => ({ session, price }))
    anchors.forEach((anchor, index) => {
      // Chưa bấm đủ thì hình chưa hoàn tất và công cụ vẫn bật.
      if (index < anchors.length - 1) expect(state.shapes).toHaveLength(0)
      state = drawingsReducer(state, { type: "anchor", anchor })
    })
    return state
  }

  for (const tool of ADVANCED_TOOLS) {
    it(`${tool}: bấm đủ ${anchorCountOf(tool)} điểm thì hoàn tất và đang chọn; khoá chặn kéo; ẩn; nhân bản; JSON giữ nguyên`, () => {
      let state = drawn(tool)
      expect(state.shapes).toHaveLength(1)
      expect(state.pending).toBeNull()
      expect(state.tool).toBeNull()
      const id = state.shapes[0].id
      expect(state.selectedId).toBe(id)
      expect(state.shapes[0].anchors).toHaveLength(anchorCountOf(tool))
      expect(state.shapes[0].style).toEqual(TOOL_SPECS[tool].defaultStyle)

      // Khoá: set-anchors và xoá bị bỏ qua.
      state = drawingsReducer(state, { type: "lock", id })
      const frozen = state.shapes[0]
      state = drawingsReducer(state, { type: "set-anchors", id, anchors: frozen.anchors.map((anchor) => ({ ...anchor, price: 1 })) })
      expect(state.shapes[0].anchors).toEqual(frozen.anchors)
      expect(drawingsReducer(state, { type: "remove", id }).shapes).toHaveLength(1)
      expect(hitHandle(state.shapes[0], { x: 0, y: 0 }, COORDS)).toBeNull()
      state = drawingsReducer(state, { type: "lock", id })

      // Ẩn: không vẽ.
      state = drawingsReducer(state, { type: "hide", id })
      expect(drawingCommands(state.shapes, COORDS)).toEqual([])
      state = drawingsReducer(state, { type: "hide", id })
      expect(drawingCommands(state.shapes, COORDS).length).toBeGreaterThan(0)

      // Nhân bản: bản sao có id mới, không khoá, không ẩn, cùng điểm neo; dời vị trí khi truyền anchors.
      state = drawingsReducer(state, { type: "lock", id })
      state = drawingsReducer(state, { type: "duplicate", id })
      expect(state.shapes).toHaveLength(2)
      const copy = state.shapes[1]
      expect(copy.id).not.toBe(id)
      expect(copy.locked).toBeUndefined()
      expect(copy.anchors).toEqual(state.shapes[0].anchors)
      expect(copy.anchors).not.toBe(state.shapes[0].anchors)
      const shifted = translateDrawing(state.shapes[0], 20, 10, COORDS)
      state = drawingsReducer(state, { type: "duplicate", id, anchors: shifted.anchors })
      expect(state.shapes[2].anchors).toEqual(shifted.anchors)

      // Lưu và nạp lại.
      const saved = JSON.parse(JSON.stringify(state.shapes)) as Drawing[]
      expect(saved).toEqual(state.shapes)
      const reloaded = drawingsReducer(createDrawingsState(), { type: "load", drawings: saved })
      expect(reloaded.shapes).toEqual(state.shapes)
      expect(drawingCommands(reloaded.shapes, COORDS)).toEqual(drawingCommands(state.shapes, COORDS))
    })
  }

  it("kiểu đổi được (màu, nét đứt, tô) và đi vào lệnh vẽ", () => {
    let state = drawn("pitchfork")
    const id = state.shapes[0].id
    state = drawingsReducer(state, { type: "style", id, style: { color: "chart-8", dash: "dashed", fill: false } })
    const commands = drawingCommands(state.shapes, COORDS)
    expect(commands.some((command) => command.op === "polygon")).toBe(false)
    expect(linesOf(commands).some((command) => command.token === "chart-8" && command.dash)).toBe(true)
  })
})
