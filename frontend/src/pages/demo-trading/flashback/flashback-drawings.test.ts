/**
 * Công cụ vẽ của Flashback (spec v2.1 §7): mức Fibonacci, nhãn, chọn hình, tay nắm và bộ giảm trạng thái.
 */
import { describe, expect, it } from "vitest"

import {
  FIB_LEVELS,
  INITIAL_DRAWINGS,
  anchors,
  clearOutcome,
  distanceToSegment,
  drawingsReducer,
  fibLabel,
  fibPrice,
  hitDrawing,
  hitHandle,
  type Drawing,
  type DrawingMap,
  type DrawingsState,
} from "./flashback-drawings"

/** Phép đổi giả: 10px mỗi phiên, giá trên cao (1 giá = 1px, 100 ở đáy). */
const MAP: DrawingMap = { x: (session) => session * 10, y: (price) => 1000 - price, right: 400 }

const trend = (id: number, a: [number, number], b: [number, number]): Drawing => ({
  id,
  kind: "trend",
  a: { session: a[0], price: a[1] },
  b: { session: b[0], price: b[1] },
})
const fib = (id: number, a: [number, number], b: [number, number]): Drawing => ({ ...trend(id, a, b), kind: "fib" })

function run(actions: Parameters<typeof drawingsReducer>[1][], from: DrawingsState = INITIAL_DRAWINGS): DrawingsState {
  return actions.reduce(drawingsReducer, from)
}

describe("Fibonacci thoái lui (§7.3)", () => {
  it("đúng 7 mức: 0, 23,6, 38,2, 50, 61,8, 78,6 và 100%", () => {
    expect(FIB_LEVELS.map((entry) => entry.level)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1])
  })

  it("giá tại mức L = giá cuối − (giá cuối − giá đầu) × L: điểm đầu là 100%, điểm cuối là 0%", () => {
    const drawing = fib(1, [10, 30_000], [40, 25_000])
    expect(fibPrice(drawing, 0)).toBe(25_000)
    expect(fibPrice(drawing, 1)).toBe(30_000)
    expect(fibPrice(drawing, 0.5)).toBe(27_500)
    expect(fibPrice(drawing, 0.618)).toBeCloseTo(28_090, 6)
    expect(fibPrice(drawing, 0.382)).toBeCloseTo(26_910, 6)
  })

  it("vẽ từ đỉnh xuống đáy cũng đúng công thức", () => {
    const drawing = fib(1, [10, 25_000], [40, 30_000])
    expect(fibPrice(drawing, 0)).toBe(30_000)
    expect(fibPrice(drawing, 1)).toBe(25_000)
    expect(fibPrice(drawing, 0.618)).toBeCloseTo(30_000 - 5_000 * 0.618, 6)
  })

  it('nhãn "61,8% · 25.630"; mức 0, 50 và 100 không có số lẻ', () => {
    expect(fibLabel(0.618, 25_630)).toBe("61,8% · 25.630")
    expect(fibLabel(0.236, 26_000)).toBe("23,6% · 26.000")
    expect(fibLabel(0.382, 26_000)).toBe("38,2% · 26.000")
    expect(fibLabel(0.786, 26_000)).toBe("78,6% · 26.000")
    expect(fibLabel(0, 25_000)).toBe("0% · 25.000")
    expect(fibLabel(0.5, 27_500)).toBe("50% · 27.500")
    expect(fibLabel(1, 30_000)).toBe("100% · 30.000")
  })
})

describe("chọn hình và tay nắm", () => {
  it("khoảng cách tới đoạn thẳng: trên đoạn là 0, ngoài đầu mút là khoảng cách tới đầu mút", () => {
    const from = { x: 0, y: 0 }
    const to = { x: 10, y: 0 }
    expect(distanceToSegment({ x: 5, y: 0 }, from, to)).toBe(0)
    expect(distanceToSegment({ x: 5, y: 4 }, from, to)).toBe(4)
    expect(distanceToSegment({ x: 13, y: 4 }, from, to)).toBe(5)
    expect(distanceToSegment({ x: 3, y: 4 }, from, from)).toBe(5)
  })

  it("bấm gần đường xu hướng trong 7px thì chọn, xa hơn thì không", () => {
    const line = trend(1, [10, 500], [30, 500])
    // Đường nằm ngang ở y = 500 từ x = 100 tới x = 300.
    expect(hitDrawing([line], { x: 200, y: 505 }, MAP)?.id).toBe(1)
    expect(hitDrawing([line], { x: 200, y: 493 }, MAP)?.id).toBe(1)
    expect(hitDrawing([line], { x: 200, y: 520 }, MAP)).toBeNull()
    expect(hitDrawing([line], { x: 330, y: 500 }, MAP)).toBeNull()
  })

  it("Fibonacci được chọn khi bấm gần một mức ngang, từ điểm bên trái tới mép phải khung giá", () => {
    const drawing = fib(2, [10, 300], [30, 200])
    // Mức 50% ở giá 250, tức y = 750; kéo dài tới x = 400 (mép phải). Các mức nằm trong y = 700 tới 800.
    expect(hitDrawing([drawing], { x: 380, y: 752 }, MAP)?.id).toBe(2)
    expect(hitDrawing([drawing], { x: 380, y: 900 }, MAP)).toBeNull()
    // Bên phải mép khung giá và bên trái điểm đầu thì không phải của hình.
    expect(hitDrawing([drawing], { x: 420, y: 752 }, MAP)).toBeNull()
    expect(hitDrawing([drawing], { x: 20, y: 752 }, MAP)).toBeNull()
  })

  it("nhiều hình cùng khoảng cách thì hình vẽ sau nằm trên", () => {
    const first = trend(1, [10, 500], [30, 500])
    const second = trend(2, [10, 500], [30, 500])
    expect(hitDrawing([first, second], { x: 200, y: 500 }, MAP)?.id).toBe(2)
  })

  it("hình gần hơn được chọn trước dù vẽ trước", () => {
    const near = trend(1, [10, 500], [30, 500])
    const far = trend(2, [10, 504], [30, 504])
    expect(hitDrawing([near, far], { x: 200, y: 500 }, MAP)?.id).toBe(1)
  })

  it("tay nắm: bắt điểm đầu hoặc điểm cuối trong 9px, ngoài đó thì không", () => {
    const line = trend(1, [10, 500], [30, 400])
    const { a, b } = anchors(line, MAP)
    expect(hitHandle(line, { x: a.x + 5, y: a.y - 5 }, MAP)).toBe("a")
    expect(hitHandle(line, { x: b.x - 4, y: b.y + 4 }, MAP)).toBe("b")
    expect(hitHandle(line, { x: 200, y: 450 }, MAP)).toBeNull()
    expect(hitHandle(null, { x: a.x, y: a.y }, MAP)).toBeNull()
  })
})

describe("trạng thái hình vẽ (§7.2, §7.4)", () => {
  const A = { session: 5, price: 100 }
  const B = { session: 25, price: 80 }

  it("bấm công cụ thì bật, bấm lại công cụ đang sáng thì huỷ", () => {
    expect(run([{ type: "tool", tool: "trend" }]).tool).toBe("trend")
    expect(run([{ type: "tool", tool: "trend" }, { type: "tool", tool: "trend" }]).tool).toBeNull()
    expect(run([{ type: "tool", tool: "trend" }, { type: "tool", tool: "fib" }]).tool).toBe("fib")
  })

  it("bấm điểm đầu rồi điểm cuối: vẽ xong tự về chế độ bình thường và hình vừa vẽ đang được chọn", () => {
    const state = run([{ type: "tool", tool: "fib" }, { type: "start", a: A }])
    expect(state.pending).toEqual({ kind: "fib", a: A })
    const done = drawingsReducer(state, { type: "finish", b: B })
    expect(done.tool).toBeNull()
    expect(done.pending).toBeNull()
    expect(done.shapes).toEqual([{ id: 1, kind: "fib", a: A, b: B }])
    expect(done.selectedId).toBe(1)
  })

  it("không có công cụ thì không bắt đầu vẽ; không có điểm đầu thì không kết thúc", () => {
    expect(drawingsReducer(INITIAL_DRAWINGS, { type: "start", a: A })).toBe(INITIAL_DRAWINGS)
    expect(drawingsReducer(INITIAL_DRAWINGS, { type: "finish", b: B })).toBe(INITIAL_DRAWINGS)
  })

  it("Esc huỷ vẽ: bỏ công cụ và điểm đầu đang chờ, giữ các hình đã có", () => {
    const drawn = run([{ type: "tool", tool: "trend" }, { type: "start", a: A }, { type: "finish", b: B }])
    const state = run([{ type: "tool", tool: "trend" }, { type: "start", a: A }, { type: "cancel" }], drawn)
    expect(state.tool).toBeNull()
    expect(state.pending).toBeNull()
    expect(state.shapes).toHaveLength(1)
    expect(drawingsReducer(INITIAL_DRAWINGS, { type: "cancel" })).toBe(INITIAL_DRAWINGS)
  })

  it("mỗi hình một ID mới; chọn, kéo tay nắm sửa đúng đầu và bỏ chọn khi bấm chỗ trống", () => {
    let state = run([
      { type: "tool", tool: "trend" },
      { type: "start", a: A },
      { type: "finish", b: B },
      { type: "tool", tool: "fib" },
      { type: "start", a: A },
      { type: "finish", b: B },
    ])
    expect(state.shapes.map((shape) => shape.id)).toEqual([1, 2])
    expect(state.selectedId).toBe(2)

    state = drawingsReducer(state, { type: "select", id: 1 })
    expect(state.selectedId).toBe(1)
    state = drawingsReducer(state, { type: "move", id: 1, handle: "b", point: { session: 30, price: 70 } })
    expect(state.shapes[0].b).toEqual({ session: 30, price: 70 })
    expect(state.shapes[0].a).toEqual(A)
    expect(state.shapes[1].b).toEqual(B)
    state = drawingsReducer(state, { type: "select", id: null })
    expect(state.selectedId).toBeNull()
  })

  it("xoá một hình bỏ luôn lựa chọn nếu hình đó đang được chọn", () => {
    const state = run([{ type: "tool", tool: "trend" }, { type: "start", a: A }, { type: "finish", b: B }])
    const removed = drawingsReducer(state, { type: "remove", id: 1 })
    expect(removed.shapes).toEqual([])
    expect(removed.selectedId).toBeNull()
  })

  it("nút Xoá: đang chọn hình thì xoá hình đó, không thì xoá hết, chưa có hình thì chỉ báo", () => {
    const empty = clearOutcome(INITIAL_DRAWINGS)
    expect(empty).toEqual({ action: null, message: "Chưa có hình vẽ" })

    const two = run([
      { type: "tool", tool: "trend" },
      { type: "start", a: A },
      { type: "finish", b: B },
      { type: "tool", tool: "fib" },
      { type: "start", a: A },
      { type: "finish", b: B },
    ])
    const selected = clearOutcome(two)
    expect(selected.message).toBe("Đã xoá hình vẽ")
    expect(selected.action).toEqual({ type: "remove", id: 2 })

    const unselected = clearOutcome(drawingsReducer(two, { type: "select", id: null }))
    expect(unselected.message).toBe("Đã xoá 2 hình vẽ")
    expect(unselected.action).toEqual({ type: "clear" })
    expect(drawingsReducer(two, { type: "clear" }).shapes).toEqual([])
  })
})
