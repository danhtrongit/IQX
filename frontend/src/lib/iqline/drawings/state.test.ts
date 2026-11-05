/** Bộ giảm trạng thái hình vẽ: công cụ, điểm neo chờ, chọn, khoá, ẩn, nhân bản, danh sách (v2.1 §7.2, §7.4). */
import { describe, expect, it } from "vitest"

import { INITIAL_DRAWINGS, clearOutcome, createDrawingsState, drawingsReducer, listDrawings, nextIdFor, type DrawingsAction, type DrawingsState } from "./index"
import type { Anchor, Drawing } from "../types"
import { TOOL_SPECS } from "./tools"

const A: Anchor = { session: 5, price: 100 }
const B: Anchor = { session: 25, price: 80 }
const C: Anchor = { session: 15, price: 90 }

function run(actions: DrawingsAction[], from: DrawingsState = INITIAL_DRAWINGS): DrawingsState {
  return actions.reduce(drawingsReducer, from)
}

const draw = (tool: Drawing["tool"], ...anchors: Anchor[]): DrawingsAction[] => [
  { type: "tool", tool },
  ...anchors.map((anchor): DrawingsAction => ({ type: "anchor", anchor })),
]

describe("công cụ và điểm neo", () => {
  it("bấm công cụ thì bật, bấm lại công cụ đang sáng thì huỷ, bấm công cụ khác thì đổi", () => {
    expect(run([{ type: "tool", tool: "trend" }]).tool).toBe("trend")
    expect(run([{ type: "tool", tool: "trend" }, { type: "tool", tool: "trend" }]).tool).toBeNull()
    expect(run([{ type: "tool", tool: "trend" }, { type: "tool", tool: "fib-retracement" }]).tool).toBe("fib-retracement")
  })

  it("công cụ hai điểm: bấm điểm đầu rồi điểm cuối, vẽ xong tự về chế độ bình thường và hình vừa vẽ đang được chọn", () => {
    const waiting = run(draw("fib-retracement", A))
    expect(waiting.pending).toEqual({ tool: "fib-retracement", anchors: [A] })
    const done = drawingsReducer(waiting, { type: "anchor", anchor: B })
    expect(done.tool).toBeNull()
    expect(done.pending).toBeNull()
    expect(done.shapes).toEqual([{ id: "d1", tool: "fib-retracement", anchors: [A, B], style: TOOL_SPECS["fib-retracement"].defaultStyle }])
    expect(done.selectedId).toBe("d1")
  })

  it("công cụ một điểm vẽ xong ngay khi bấm; công cụ ba điểm cần đủ ba lần bấm; Elliott 5 sóng cần sáu", () => {
    expect(run(draw("horizontal", A)).shapes).toHaveLength(1)
    expect(run(draw("channel", A, B)).shapes).toHaveLength(0)
    expect(run(draw("channel", A, B, C)).shapes).toHaveLength(1)
    const points = Array.from({ length: 6 }, (_, i): Anchor => ({ session: i * 3, price: 100 + i }))
    expect(run(draw("elliott-5", ...points.slice(0, 5))).shapes).toHaveLength(0)
    expect(run(draw("elliott-5", ...points)).shapes[0].anchors).toHaveLength(6)
  })

  it("không có công cụ thì bấm điểm neo không làm gì", () => {
    expect(drawingsReducer(INITIAL_DRAWINGS, { type: "anchor", anchor: A })).toBe(INITIAL_DRAWINGS)
  })

  it("Esc huỷ vẽ: bỏ công cụ và điểm đang chờ, giữ các hình đã có", () => {
    const drawn = run(draw("trend", A, B))
    const state = run([...draw("trend", A), { type: "cancel" }], drawn)
    expect(state.tool).toBeNull()
    expect(state.pending).toBeNull()
    expect(state.shapes).toHaveLength(1)
    expect(drawingsReducer(INITIAL_DRAWINGS, { type: "cancel" })).toBe(INITIAL_DRAWINGS)
  })

  it("hình mới có kiểu mặc định riêng, sửa kiểu của hình này không đổi kiểu mặc định", () => {
    const state = run(draw("trend", A, B))
    const edited = drawingsReducer(state, { type: "style", id: "d1", style: { width: 3, color: "chart-5" } })
    expect(edited.shapes[0].style).toMatchObject({ width: 3, color: "chart-5" })
    expect(TOOL_SPECS.trend.defaultStyle.color).toBe("chart-2")
  })
})

describe("chọn, kéo, xoá", () => {
  const two = (): DrawingsState => run([...draw("trend", A, B), ...draw("fib-retracement", A, B)])

  it("mỗi hình một ID mới; chọn và đặt lại điểm neo; chọn ID không có thì bỏ chọn", () => {
    let state = two()
    expect(state.shapes.map((shape) => shape.id)).toEqual(["d1", "d2"])
    expect(state.selectedId).toBe("d2")
    state = drawingsReducer(state, { type: "select", id: "d1" })
    expect(state.selectedId).toBe("d1")
    state = drawingsReducer(state, { type: "set-anchors", id: "d1", anchors: [A, { session: 30, price: 70 }] })
    expect(state.shapes[0].anchors[1]).toEqual({ session: 30, price: 70 })
    expect(state.shapes[1].anchors[1]).toEqual(B)
    expect(drawingsReducer(state, { type: "select", id: "khong-co" }).selectedId).toBeNull()
    expect(drawingsReducer(state, { type: "select", id: null }).selectedId).toBeNull()
  })

  it("không đổi số điểm neo của hình đã có", () => {
    const state = two()
    expect(drawingsReducer(state, { type: "set-anchors", id: "d1", anchors: [A] })).toBe(state)
  })

  it("xoá một hình bỏ luôn lựa chọn nếu hình đó đang được chọn", () => {
    const removed = drawingsReducer(two(), { type: "remove", id: "d2" })
    expect(removed.shapes.map((shape) => shape.id)).toEqual(["d1"])
    expect(removed.selectedId).toBeNull()
  })

  it("nút Xoá: đang chọn hình thì xoá hình đó, không thì xoá hết, chưa có hình thì chỉ báo", () => {
    expect(clearOutcome(INITIAL_DRAWINGS)).toEqual({ action: null, message: "Chưa có hình vẽ" })
    const selected = clearOutcome(two())
    expect(selected).toEqual({ action: { type: "remove", id: "d2" }, message: "Đã xoá hình vẽ" })
    const unselected = clearOutcome(drawingsReducer(two(), { type: "select", id: null }))
    expect(unselected).toEqual({ action: { type: "clear" }, message: "Đã xoá 2 hình vẽ" })
    expect(drawingsReducer(two(), { type: "clear" }).shapes).toEqual([])
  })
})

describe("khoá, ẩn, nhân bản, danh sách", () => {
  const base = (): DrawingsState => run(draw("trend", A, B))

  it("khoá: không kéo, không sửa kiểu, không xoá lẻ, không bị xoá hàng loạt; mở khoá thì sửa lại được", () => {
    const locked = drawingsReducer(base(), { type: "lock", id: "d1" })
    expect(locked.shapes[0].locked).toBe(true)
    expect(drawingsReducer(locked, { type: "set-anchors", id: "d1", anchors: [B, A] })).toBe(locked)
    expect(drawingsReducer(locked, { type: "style", id: "d1", style: { width: 4 } })).toBe(locked)
    expect(drawingsReducer(locked, { type: "remove", id: "d1" })).toBe(locked)
    expect(drawingsReducer(locked, { type: "clear" }).shapes).toHaveLength(1)
    expect(clearOutcome(locked).message).toBe("Hình vẽ đang khoá")
    const unlocked = drawingsReducer(locked, { type: "lock", id: "d1" })
    expect(unlocked.shapes[0].locked).toBe(false)
    expect(drawingsReducer(unlocked, { type: "remove", id: "d1" }).shapes).toEqual([])
  })

  it("ẩn từng hình hoặc tất cả; đặt lại đúng trạng thái đang có thì giữ nguyên tham chiếu", () => {
    const hidden = drawingsReducer(base(), { type: "hide", id: "d1" })
    expect(hidden.shapes[0].hidden).toBe(true)
    expect(drawingsReducer(hidden, { type: "hide", id: "d1", hidden: true })).toBe(hidden)
    expect(drawingsReducer(hidden, { type: "set-all-hidden", hidden: false }).shapes[0].hidden).toBe(false)
    expect(drawingsReducer(base(), { type: "set-all-hidden", hidden: true }).shapes[0].hidden).toBe(true)
  })

  it("nhân bản: ID mới, đúng vị trí đưa vào, không mang trạng thái khoá và ẩn, được chọn", () => {
    const source = drawingsReducer(drawingsReducer(base(), { type: "lock", id: "d1" }), { type: "hide", id: "d1" })
    const moved: Anchor[] = [{ session: 10, price: 100 }, { session: 30, price: 80 }]
    const copied = drawingsReducer(source, { type: "duplicate", id: "d1", anchors: moved })
    expect(copied.shapes).toHaveLength(2)
    const copy = copied.shapes[1]
    expect(copy.id).toBe("d2")
    expect(copy.anchors).toEqual(moved)
    expect(copy.locked).toBeUndefined()
    expect(copy.hidden).toBeUndefined()
    expect(copy.style).toEqual(source.shapes[0].style)
    expect(copy.style).not.toBe(source.shapes[0].style)
    expect(copied.selectedId).toBe("d2")
    expect(drawingsReducer(source, { type: "duplicate", id: "khong-co" })).toBe(source)
  })

  it("danh sách hình: hình trên cùng trước, kèm nhãn, khoá, ẩn, đang chọn", () => {
    let state = run([...draw("trend", A, B), ...draw("note", A)])
    state = drawingsReducer(state, { type: "text", id: "d2", text: "Hỗ trợ" })
    state = drawingsReducer(state, { type: "lock", id: "d1" })
    expect(listDrawings(state)).toEqual([
      { id: "d2", tool: "note", label: "Ghi chú: Hỗ trợ", locked: false, hidden: false, selected: true },
      { id: "d1", tool: "trend", label: "Đường xu hướng", locked: true, hidden: false, selected: false },
    ])
    expect(listDrawings(state, "creation").map((entry) => entry.id)).toEqual(["d1", "d2"])
  })

  it("nạp từ kho lưu trữ: ID mới không trùng ID đã nạp, xoá lựa chọn và hình đang vẽ dở", () => {
    const saved: Drawing[] = [
      { id: "d7", tool: "trend", anchors: [A, B], style: TOOL_SPECS.trend.defaultStyle },
      { id: "tv-abc", tool: "rectangle", anchors: [A, B], style: TOOL_SPECS.rectangle.defaultStyle },
    ]
    expect(nextIdFor(saved)).toBe(8)
    const loaded = drawingsReducer(run(draw("trend", A)), { type: "load", drawings: saved })
    expect(loaded.pending).toBeNull()
    expect(loaded.tool).toBeNull()
    expect(loaded.selectedId).toBeNull()
    const added = run(draw("horizontal", A), loaded)
    expect(added.shapes.at(-1)?.id).toBe("d8")
    expect(createDrawingsState(saved).nextId).toBe(8)
  })
})
