/** Chọn hình, tay nắm, hút vào OHLC, kéo tay nắm và kéo cả hình. */
import { describe, expect, it } from "vitest"

import { makeCoords } from "./__fixtures__/coords"
import {
  anchorFromPoint,
  distanceToSegment,
  hitDrawing,
  hitHandle,
  moveHandle,
  resolveAnchors,
  snapToOhlc,
  translateDrawing,
  clipLine,
} from "./index"
import type { Anchor, Bar, Drawing, DrawingStyle, DrawingTool } from "../types"
import { TOOL_SPECS } from "./tools"

/** 10px mỗi phiên (tâm nến ở index + 0.5), giá trên cao: y = 1000 - giá. */
const COORDS = makeCoords({
  mode: "session",
  viewport: { from: 0, to: 40 },
  plot: { left: 0, top: 0, right: 400, bottom: 1000 },
  price: { low: 0, high: 1000 },
})
const px = (session: number) => (session + 0.5) * 10

function shape(id: string, tool: DrawingTool, points: [number, number][], extra: Partial<Drawing> = {}): Drawing {
  const anchors: Anchor[] = points.map(([session, price]) => ({ session, price }))
  const style: DrawingStyle = { ...TOOL_SPECS[tool].defaultStyle }
  return { id, tool, anchors, style, ...extra }
}

describe("chọn hình", () => {
  it("khoảng cách tới đoạn thẳng: trên đoạn là 0, ngoài đầu mút là khoảng cách tới đầu mút", () => {
    const from = { x: 0, y: 0 }
    const to = { x: 10, y: 0 }
    expect(distanceToSegment({ x: 5, y: 0 }, from, to)).toBe(0)
    expect(distanceToSegment({ x: 5, y: 4 }, from, to)).toBe(4)
    expect(distanceToSegment({ x: 13, y: 4 }, from, to)).toBe(5)
    expect(distanceToSegment({ x: 3, y: 4 }, from, from)).toBe(5)
  })

  it("bấm gần đường xu hướng trong 7px thì chọn, xa hơn thì không", () => {
    const line = shape("a", "trend", [[10, 500], [30, 500]])
    expect(hitDrawing([line], { x: 200, y: 505 }, COORDS)?.id).toBe("a")
    expect(hitDrawing([line], { x: 200, y: 493 }, COORDS)?.id).toBe("a")
    expect(hitDrawing([line], { x: 200, y: 520 }, COORDS)).toBeNull()
    expect(hitDrawing([line], { x: 330, y: 500 }, COORDS)).toBeNull()
  })

  it("Fibonacci được chọn khi bấm gần một mức ngang, từ điểm bên trái tới mép phải khung giá", () => {
    const drawing = shape("f", "fib-retracement", [[10, 300], [30, 200]])
    // Mức 50% ở giá 250, tức y = 750.
    expect(hitDrawing([drawing], { x: 380, y: 752 }, COORDS)?.id).toBe("f")
    expect(hitDrawing([drawing], { x: 380, y: 900 }, COORDS)).toBeNull()
    expect(hitDrawing([drawing], { x: 420, y: 752 }, COORDS)).toBeNull()
    expect(hitDrawing([drawing], { x: 20, y: 752 }, COORDS)).toBeNull()
  })

  it("nhiều hình cùng khoảng cách thì hình vẽ sau nằm trên; hình gần hơn được chọn trước", () => {
    const first = shape("1", "trend", [[10, 500], [30, 500]])
    const second = shape("2", "trend", [[10, 500], [30, 500]])
    expect(hitDrawing([first, second], { x: 200, y: 500 }, COORDS)?.id).toBe("2")
    const near = shape("n", "trend", [[10, 500], [30, 500]])
    const far = shape("m", "trend", [[10, 504], [30, 504]])
    expect(hitDrawing([near, far], { x: 200, y: 500 }, COORDS)?.id).toBe("n")
  })

  it("hình ẩn không được chọn", () => {
    const line = shape("a", "trend", [[10, 500], [30, 500]], { hidden: true })
    expect(hitDrawing([line], { x: 200, y: 500 }, COORDS)).toBeNull()
  })

  it("tia, đường kéo dài, đường ngang, tia ngang và đường dọc", () => {
    const ray = shape("r", "ray", [[10, 500], [20, 400]])
    // Tia đi tiếp về phía phải xuống dưới: tại x = 305 (session 30) giá 300, y = 700.
    expect(hitDrawing([ray], { x: 305, y: 700 }, COORDS)?.id).toBe("r")
    expect(hitDrawing([ray], { x: 5, y: 600 }, COORDS)).toBeNull()
    const extended = shape("e", "extended", [[10, 500], [20, 400]])
    expect(hitDrawing([extended], { x: 5, y: 400 }, COORDS)?.id).toBe("e")
    const horizontal = shape("h", "horizontal", [[10, 300]])
    expect(hitDrawing([horizontal], { x: 5, y: 700 }, COORDS)?.id).toBe("h")
    expect(hitDrawing([horizontal], { x: 399, y: 703 }, COORDS)?.id).toBe("h")
    expect(hitDrawing([horizontal], { x: 200, y: 750 }, COORDS)).toBeNull()
    const horizontalRay = shape("hr", "horizontal-ray", [[10, 300]])
    expect(hitDrawing([horizontalRay], { x: 300, y: 700 }, COORDS)?.id).toBe("hr")
    expect(hitDrawing([horizontalRay], { x: 50, y: 700 }, COORDS)).toBeNull()
    const vertical = shape("v", "vertical", [[10, 300]])
    expect(hitDrawing([vertical], { x: px(10) + 3, y: 10 }, COORDS)?.id).toBe("v")
    expect(hitDrawing([vertical], { x: px(10) + 30, y: 10 }, COORDS)).toBeNull()
  })

  it("kênh song song chọn được trên cả hai đường", () => {
    const channel = shape("c", "channel", [[5, 500], [25, 500], [15, 400]])
    expect(hitDrawing([channel], { x: 200, y: 500 }, COORDS)?.id).toBe("c")
    expect(hitDrawing([channel], { x: 200, y: 600 }, COORDS)?.id).toBe("c")
    expect(hitDrawing([channel], { x: 200, y: 550 }, COORDS)).toBeNull()
  })

  it("hình chữ nhật: viền, hoặc cả bên trong khi tô nền; thước đo, sóng Elliott và ghi chú", () => {
    const filled = shape("f", "rectangle", [[5, 600], [25, 400]])
    expect(hitDrawing([filled], { x: 150, y: 500 }, COORDS)?.id).toBe("f")
    const hollow = shape("h", "rectangle", [[5, 600], [25, 400]])
    hollow.style = { ...hollow.style, fill: false }
    expect(hitDrawing([hollow], { x: 150, y: 500 }, COORDS)).toBeNull()
    expect(hitDrawing([hollow], { x: 150, y: 402 }, COORDS)?.id).toBe("h")

    const wave = shape("w", "elliott-abc", [[2, 300], [8, 500], [14, 380], [20, 600]])
    expect(hitDrawing([wave], { x: px(8), y: 500 }, COORDS)?.id).toBe("w")
    expect(hitDrawing([wave], { x: px(8), y: 800 }, COORDS)).toBeNull()

    const note = shape("n", "note", [[10, 500]], { text: "Hỗ trợ" })
    expect(hitDrawing([note], { x: px(10) + 3, y: 505 }, COORDS)?.id).toBe("n")

    const measure = shape("m", "measure", [[5, 600], [25, 400]])
    expect(hitDrawing([measure], { x: 150, y: 500 }, COORDS)?.id).toBe("m")
  })

  it("hình có điểm neo không đổi được (khác loại với chế độ) thì không được chọn", () => {
    const foreign: Drawing = { id: "x", tool: "trend", anchors: [{ time: 1, price: 1 }, { time: 2, price: 2 }], style: TOOL_SPECS.trend.defaultStyle }
    expect(resolveAnchors(foreign.anchors, COORDS)).toBeNull()
    expect(hitDrawing([foreign], { x: 0, y: 0 }, COORDS, 1e9)).toBeNull()
  })
})

describe("tay nắm", () => {
  it("bắt điểm neo gần nhất trong 9px, ngoài đó thì không", () => {
    const line = shape("a", "trend", [[10, 500], [30, 400]])
    expect(hitHandle(line, { x: px(10) + 5, y: 495 }, COORDS)).toBe(0)
    expect(hitHandle(line, { x: px(30) - 4, y: 604 }, COORDS)).toBe(1)
    expect(hitHandle(line, { x: 200, y: 550 }, COORDS)).toBeNull()
    expect(hitHandle(null, { x: 0, y: 0 }, COORDS)).toBeNull()
  })

  it("hình ba điểm có ba tay nắm; hình khoá thì không có tay nắm", () => {
    const channel = shape("c", "channel", [[5, 500], [25, 500], [15, 400]])
    expect(hitHandle(channel, { x: px(15), y: 600 }, COORDS)).toBe(2)
    expect(hitHandle({ ...channel, locked: true }, { x: px(15), y: 600 }, COORDS)).toBeNull()
  })
})

describe("hút vào OHLC", () => {
  const bars: Bar[] = Array.from({ length: 40 }, () => ({ open: 480, high: 560, low: 440, close: 520, volume: 1 }))

  it("hút vào giá O, H, L hoặc C gần nhất khi trong 12px, chỉ số thành số nguyên", () => {
    // Nến 10 có tâm x = 105; giá cao 560 là y = 440.
    expect(snapToOhlc({ x: 107, y: 447 }, COORDS, bars)).toEqual({ index: 10, price: 560, field: "high" })
    expect(snapToOhlc({ x: 107, y: 552 }, COORDS, bars)).toEqual({ index: 10, price: 440, field: "low" })
    expect(snapToOhlc({ x: 107, y: 478 }, COORDS, bars)).toEqual({ index: 10, price: 520, field: "close" })
  })

  it("xa hơn 12px, hoặc ngoài vùng có nến thì không hút", () => {
    expect(snapToOhlc({ x: 107, y: 300 }, COORDS, bars)).toBeNull()
    expect(snapToOhlc({ x: 107, y: 447 }, COORDS, bars.slice(0, 5))).toBeNull()
    expect(snapToOhlc({ x: 107, y: 447 }, COORDS, [])).toBeNull()
  })

  it("anchorFromPoint: có hút thì dùng giá OHLC, không thì dùng đúng điểm bấm", () => {
    expect(anchorFromPoint({ x: 107, y: 447 }, COORDS, { snap: { bars } })).toEqual({ session: 10, price: 560 })
    const free = anchorFromPoint({ x: 107, y: 447 }, COORDS)
    expect("session" in free && free.session).toBeCloseTo(10.2, 6)
    expect(free.price).toBeCloseTo(553, 6)
  })

  it("giới hạn chỉ số của điểm neo (Flashback không vẽ vào warmup)", () => {
    const left = anchorFromPoint({ x: 3, y: 500 }, COORDS, { indexRange: { min: 5, max: 39 } })
    expect(left).toEqual({ session: 5, price: 500 })
    const right = anchorFromPoint({ x: 399, y: 500 }, COORDS, { indexRange: { min: 5, max: 20 } })
    expect(right).toEqual({ session: 20, price: 500 })
  })
})

describe("kéo tay nắm và kéo cả hình", () => {
  it("kéo một tay nắm chỉ đổi điểm neo đó, giữ nguyên các điểm còn lại", () => {
    const line = shape("a", "trend", [[10, 500], [30, 400]])
    const moved = moveHandle(line, 1, { x: px(35), y: 300 }, COORDS)
    expect(moved.anchors[0]).toBe(line.anchors[0])
    expect(moved.anchors[1]).toEqual({ session: 35, price: 700 })
    expect(moveHandle(line, 5, { x: 0, y: 0 }, COORDS)).toBe(line)
  })

  it("kéo cả hình dịch mọi điểm neo cùng một đoạn trên màn hình", () => {
    const line = shape("a", "trend", [[10, 500], [30, 400]])
    const moved = translateDrawing(line, 50, -20, COORDS)
    expect(moved.anchors[0]).toEqual({ session: 15, price: 520 })
    expect(moved.anchors[1]).toEqual({ session: 35, price: 420 })
    expect(moved.id).toBe("a")
  })

  it("có giới hạn chỉ số thì cả hình dừng ở biên mà không bị méo", () => {
    const line = shape("a", "trend", [[10, 500], [30, 400]])
    const moved = translateDrawing(line, 1000, 0, COORDS, { min: 0, max: 35 })
    expect(moved.anchors[1]).toEqual({ session: 35, price: 400 })
    expect(moved.anchors[0]).toEqual({ session: 15, price: 500 })
  })
})

describe("cắt đường theo khung", () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 100 }
  it("đường kéo dài hai phía chạm hai biên, tia chỉ kéo về một phía, đoạn thì giữ nguyên", () => {
    expect(clipLine({ x: 40, y: 50 }, { x: 60, y: 50 }, rect, "both")).toEqual([0, 50, 100, 50])
    expect(clipLine({ x: 40, y: 50 }, { x: 60, y: 50 }, rect, "forward")).toEqual([40, 50, 100, 50])
    expect(clipLine({ x: 40, y: 50 }, { x: 60, y: 50 }, rect, "none")).toEqual([40, 50, 60, 50])
  })
  it("ngoài khung hoặc trùng điểm thì không có đoạn nào", () => {
    expect(clipLine({ x: 200, y: 200 }, { x: 300, y: 200 }, rect, "none")).toBeNull()
    expect(clipLine({ x: 5, y: 5 }, { x: 5, y: 5 }, rect, "both")).toBeNull()
    expect(clipLine({ x: 150, y: 50 }, { x: 160, y: 50 }, rect, "forward")).toBeNull()
  })
})
