/**
 * Công cụ vẽ đợt 1 qua bộ giảm tương tác: nét bút kéo thả, đường gấp khúc (nhấp đúp, Enter, Esc), vị thế hai cú bấm và kéo tay nắm,
 * hoàn tác, khoá, Flashback chỉ có ba công cụ cũ, và nam châm ba mức (tắt, yếu, mạnh).
 */
import { describe, expect, it } from "vitest"

import { barsOf, harness, PLOT, ptr, touch, type Harness } from "./__fixtures__/harness"
import { createInteractionState, flashbackConfig, marketConfig } from "./index"
import { STROKE_MAX_POINTS } from "../drawings"
import type { Anchor, Drawing } from "../types"

const BARS = 300
const VIEW = { from: 240, to: 300 }

function market(bars = barsOf(BARS)) {
  return harness(marketConfig({ barCount: BARS, defaultViewport: VIEW }), { kind: "market", barCount: BARS, bars })
}

function click(h: Harness, x: number, y: number) {
  h.send({ type: "pointer-down", pointer: ptr(x, y) })
  h.send({ type: "pointer-up", pointer: ptr(x, y) })
}

const shapes = (h: Harness): readonly Drawing[] => h.state.drawings.shapes
const priceOf = (anchor: Anchor) => anchor.price
/** y của giá theo khoảng giá 0-100 trên khung cao 300. */
const yOf = (price: number) => ((100 - price) / 100) * PLOT.bottom

describe("nét bút: nhấn, kéo, thả", () => {
  function drag(h: Harness, points: [number, number][], type: "mouse" | "touch" = "mouse") {
    const make = type === "mouse" ? ptr : (x: number, y: number) => touch(1, x, y)
    const [first, ...rest] = points
    h.send({ type: "pointer-down", pointer: make(first[0], first[1]) })
    for (const [x, y] of rest) h.send({ type: "pointer-move", pointer: make(x, y) })
    const last = points.at(-1)!
    h.send({ type: "pointer-up", pointer: make(last[0], last[1]) })
  }

  it("kéo dọc theo đường cong tạo một hình bút với số điểm thay đổi, đã giản lược, và hình đang chọn", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    const points: [number, number][] = Array.from({ length: 150 }, (_, index) => [50 + index * 2.5, 150 + Math.sin(index / 12) * 70])
    drag(h, points)
    expect(shapes(h)).toHaveLength(1)
    const [brush] = shapes(h)
    expect(brush.tool).toBe("brush")
    expect(brush.anchors.length).toBeGreaterThan(8)
    expect(brush.anchors.length).toBeLessThan(150)
    expect(brush.anchors.length).toBeLessThanOrEqual(STROKE_MAX_POINTS)
    expect(h.state.drawings.selectedId).toBe(brush.id)
    expect(h.state.drawings.tool).toBeNull()
    expect(h.state.drawings.pending).toBeNull()
    expect(h.state.drag).toBeNull()
    expect(h.state.preview).toBeNull()
  })

  it("điểm đầu và điểm thả được giữ; đường thẳng chỉ còn hai điểm", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    drag(h, Array.from({ length: 80 }, (_, index): [number, number] => [100 + index * 3, 120]))
    expect(shapes(h)[0].anchors).toHaveLength(2)
    const [a, b] = shapes(h)[0].anchors.map((anchor) => h.coords().xOfIndex(h.coords().indexOfAnchor(anchor)!))
    expect(a).toBeCloseTo(100, 0)
    expect(b).toBeCloseTo(100 + 79 * 3, 0)
  })

  it("trong lúc kéo hình chưa vào danh sách (chưa ghi hoàn tác); thả mới chốt đúng một bước hoàn tác", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    for (let i = 1; i <= 20; i++) h.send({ type: "pointer-move", pointer: ptr(100 + i * 5, 100 + i * 3) })
    expect(shapes(h)).toHaveLength(0)
    expect(h.state.drawings.pending?.anchors.length).toBeGreaterThan(10)
    expect(h.state.drag?.kind).toBe("stroke")
    expect(h.state.history.past).toHaveLength(0)
    h.send({ type: "pointer-up", pointer: ptr(200, 160) })
    expect(shapes(h)).toHaveLength(1)
    expect(h.state.history.past).toHaveLength(1)
    h.send({ type: "undo" })
    expect(shapes(h)).toHaveLength(0)
    h.send({ type: "redo" })
    expect(shapes(h)).toHaveLength(1)
  })

  it("bấm một cái không kéo thì bỏ nét và vẫn ở công cụ bút", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    click(h, 120, 120)
    expect(shapes(h)).toHaveLength(0)
    expect(h.state.drawings.tool).toBe("brush")
    expect(h.state.drawings.pending).toBeNull()
  })

  it("nét bút không bị hút vào OHLC dù bật nam châm mạnh", () => {
    const h = market()
    h.send({ type: "magnet", on: "strong" })
    h.send({ type: "tool", tool: "brush" })
    drag(h, [[100, 20], [140, 60], [180, 20], [220, 60]])
    const prices = shapes(h)[0].anchors.map(priceOf)
    for (const price of prices) expect([44, 48, 52, 56]).not.toContain(price)
  })

  it("kéo ra ngoài khung vẽ vẫn cho nét hợp lệ (kẹp trong khung)", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    drag(h, [[400, 100], [480, 100], [560, 100], [700, 20], [700, -50]])
    const [brush] = shapes(h)
    for (const anchor of brush.anchors) expect(Number.isFinite(h.coords().indexOfAnchor(anchor))).toBe(true)
    const xs = brush.anchors.map((anchor) => h.coords().xOfIndex(h.coords().indexOfAnchor(anchor)!))
    expect(Math.max(...xs)).toBeLessThanOrEqual(PLOT.right + 0.5)
  })

  it("bằng ngón tay: vẽ được; ngón thứ hai chạm xuống thì bỏ nét dở", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    drag(h, [[100, 100], [140, 140], [180, 110], [220, 150]], "touch")
    expect(shapes(h)).toHaveLength(1)
    const again = market()
    again.send({ type: "tool", tool: "brush" })
    again.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    again.send({ type: "pointer-move", pointer: touch(1, 140, 140) })
    expect(again.state.drawings.pending?.anchors.length).toBe(2)
    again.send({ type: "pointer-down", pointer: touch(2, 300, 100) })
    expect(again.state.drawings.pending).toBeNull()
    expect(again.state.drag).toBeNull()
    expect(again.state.pinch).not.toBeNull()
    expect(shapes(again)).toHaveLength(0)
  })

  it("huỷ con trỏ hoặc Esc giữa chừng bỏ nét, không để lại hình", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-move", pointer: ptr(160, 160) })
    h.send({ type: "pointer-cancel", pointerId: 1 })
    expect(h.state.drawings.pending).toBeNull()
    expect(shapes(h)).toHaveLength(0)
    h.send({ type: "tool", tool: "brush" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-move", pointer: ptr(160, 160) })
    h.send({ type: "key", key: { key: "Escape" } })
    h.send({ type: "pointer-move", pointer: ptr(200, 100) })
    h.send({ type: "pointer-up", pointer: ptr(200, 100) })
    expect(shapes(h)).toHaveLength(0)
  })

  it("chọn, kéo cả nét và kéo tay nắm góc để co giãn; mỗi lần kéo một bước hoàn tác, số điểm không đổi", () => {
    const h = market()
    h.send({ type: "tool", tool: "brush" })
    drag(h, Array.from({ length: 40 }, (_, index): [number, number] => [100 + index * 4, 150 + Math.sin(index / 5) * 50]))
    const original = shapes(h)[0].anchors
    const before = h.state.history.past.length
    // Kéo cả nét: bấm vào đoạn đầu rồi kéo.
    const start = h.coords()
    const p0 = { x: start.xOfIndex(start.indexOfAnchor(original[0])!), y: start.yOfPrice(original[0].price) }
    h.send({ type: "pointer-down", pointer: ptr(p0.x, p0.y + 1) })
    h.send({ type: "pointer-move", pointer: ptr(p0.x + 40, p0.y + 31) })
    h.send({ type: "pointer-up", pointer: ptr(p0.x + 40, p0.y + 31) })
    expect(shapes(h)[0].anchors).toHaveLength(original.length)
    expect(shapes(h)[0].anchors[0]).not.toEqual(original[0])
    expect(h.state.history.past).toHaveLength(before + 1)
    // Kéo tay nắm góc dưới phải ra xa.
    const moved = shapes(h)[0].anchors
    const coords = h.coords()
    const xy = moved.map((anchor) => ({ x: coords.xOfIndex(coords.indexOfAnchor(anchor)!), y: coords.yOfPrice(anchor.price) }))
    const corner = { x: Math.max(...xy.map((point) => point.x)), y: Math.max(...xy.map((point) => point.y)) }
    h.send({ type: "pointer-down", pointer: ptr(corner.x, corner.y) })
    expect(h.state.drag?.kind).toBe("handle")
    h.send({ type: "pointer-move", pointer: ptr(corner.x + 60, corner.y + 20) })
    h.send({ type: "pointer-up", pointer: ptr(corner.x + 60, corner.y + 20) })
    expect(shapes(h)[0].anchors).toHaveLength(original.length)
    expect(h.state.history.past).toHaveLength(before + 2)
    h.send({ type: "undo" })
    expect(shapes(h)[0].anchors).toEqual(moved)
  })
})

describe("đường gấp khúc: bấm từng đỉnh", () => {
  const vertices: [number, number][] = [[100, 200], [160, 100], [220, 170], [280, 80]]

  function drawPath(h: Harness, count: number) {
    h.send({ type: "tool", tool: "path" })
    for (const [x, y] of vertices.slice(0, count)) click(h, x, y)
  }

  it("mỗi cú bấm thêm một đỉnh, chưa hoàn tất; xem trước có đường theo con trỏ", () => {
    const h = market()
    drawPath(h, 3)
    expect(shapes(h)).toHaveLength(0)
    expect(h.state.drawings.pending?.anchors).toHaveLength(3)
    h.send({ type: "pointer-move", pointer: ptr(300, 60) })
    expect(h.state.preview).not.toBeNull()
  })

  it("nhấp đúp hoàn tất: đỉnh cuối là điểm nhấp đầu tiên của nhấp đúp, không thêm đỉnh trùng", () => {
    const h = market()
    drawPath(h, 4)
    // Lần nhấn thứ hai của nhấp đúp ở cùng chỗ: không tạo thêm đỉnh.
    h.send({ type: "pointer-down", pointer: ptr(280, 80) })
    h.send({ type: "pointer-up", pointer: ptr(280, 80) })
    h.send({ type: "double-click", pointer: ptr(280, 80) })
    expect(shapes(h)).toHaveLength(1)
    expect(shapes(h)[0]).toMatchObject({ tool: "path", id: "d1" })
    expect(shapes(h)[0].anchors).toHaveLength(4)
    expect(h.state.drawings.pending).toBeNull()
    expect(h.state.drawings.selectedId).toBe("d1")
    expect(h.state.history.past).toHaveLength(1)
  })

  it("Enter hoàn tất; chưa đủ hai đỉnh thì Enter không làm gì và vẫn đang vẽ", () => {
    const h = market()
    drawPath(h, 1)
    h.send({ type: "key", key: { key: "Enter" } })
    expect(shapes(h)).toHaveLength(0)
    expect(h.state.drawings.pending).not.toBeNull()
    click(h, 160, 100)
    click(h, 220, 170)
    h.send({ type: "key", key: { key: "Enter" } })
    expect(shapes(h)).toHaveLength(1)
    expect(shapes(h)[0].anchors).toHaveLength(3)
    // Enter khi không vẽ gì không có tác dụng.
    expect(h.send({ type: "key", key: { key: "Enter" } })).toBe(h.state)
  })

  it("Esc huỷ cả đường đang vẽ", () => {
    const h = market()
    drawPath(h, 3)
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.drawings.pending).toBeNull()
    expect(h.state.drawings.tool).toBeNull()
    expect(shapes(h)).toHaveLength(0)
  })

  it("nhấp đúp khi chưa đủ hai đỉnh không hoàn tất; nhấp đúp ngoài lúc vẽ vẫn như cũ", () => {
    const h = market()
    drawPath(h, 1)
    h.send({ type: "double-click", pointer: ptr(100, 200) })
    expect(shapes(h)).toHaveLength(0)
    expect(h.state.drawings.pending).not.toBeNull()
  })

  it("tối đa 64 đỉnh: bấm thêm không làm hình dài hơn", () => {
    const h = market()
    h.send({ type: "tool", tool: "path" })
    for (let i = 0; i < 80; i++) click(h, 20 + (i % 40) * 11, 40 + ((i * 37) % 200))
    h.send({ type: "key", key: { key: "Enter" } })
    expect(shapes(h)[0].anchors).toHaveLength(64)
  })

  it("hình xong chọn được, kéo từng đỉnh bằng tay nắm", () => {
    const h = market()
    drawPath(h, 4)
    h.send({ type: "key", key: { key: "Enter" } })
    const before = shapes(h)[0].anchors
    h.send({ type: "pointer-down", pointer: ptr(220, 170) })
    expect(h.state.drag).toMatchObject({ kind: "handle", handle: 2 })
    h.send({ type: "pointer-move", pointer: ptr(240, 120) })
    h.send({ type: "pointer-up", pointer: ptr(240, 120) })
    const after = shapes(h)[0].anchors
    expect(after).toHaveLength(4)
    expect(after[2]).not.toEqual(before[2])
    expect(after[0]).toEqual(before[0])
    expect(after[3]).toEqual(before[3])
  })
})

describe("vị thế: hai cú bấm, ba mức, kéo từng mức", () => {
  function drawn(tool: "long-position" | "short-position" = "long-position") {
    const h = market()
    h.send({ type: "tool", tool })
    click(h, 100, yOf(50))
    expect(shapes(h)).toHaveLength(0)
    click(h, 300, yOf(80))
    return h
  }

  it("bấm điểm vào rồi điểm chốt lời tạo ra hình đủ ba mức, cắt lỗ ở nửa khoảng cách (R:R = 2), hình được chọn", () => {
    const h = drawn()
    expect(shapes(h)).toHaveLength(1)
    const [entry, stop, target] = shapes(h)[0].anchors.map(priceOf)
    expect(entry).toBeCloseTo(50, 6)
    expect(target).toBeCloseTo(80, 6)
    expect(stop).toBeCloseTo(35, 6)
    expect(h.state.drawings.selectedId).toBe("d1")
    // Cắt lỗ và chốt lời cùng thời điểm (mép phải chung).
    const [, a, b] = shapes(h)[0].anchors
    expect("time" in a && "time" in b && a.time === b.time).toBe(true)
  })

  it("vị thế bán: cắt lỗ ở trên điểm vào, chốt lời ở dưới", () => {
    const h = drawn("short-position")
    const [entry, stop, target] = shapes(h)[0].anchors.map(priceOf)
    expect(stop).toBeGreaterThan(entry)
    expect(target).toBeLessThan(entry)
    expect(target).toBeCloseTo(20, 6)
    expect(stop).toBeCloseTo(65, 6)
  })

  it("kéo tay nắm chốt lời đổi đúng giá chốt lời; một bước hoàn tác; hình khoá thì không kéo được", () => {
    const h = drawn()
    const coords = h.coords()
    const [, stop, target] = shapes(h)[0].anchors
    const handle = { x: coords.xOfIndex(coords.indexOfAnchor(stop)!), y: coords.yOfPrice(target.price) }
    const created = h.state.history.past.length
    h.send({ type: "pointer-down", pointer: ptr(handle.x, handle.y) })
    expect(h.state.drag).toMatchObject({ kind: "handle", handle: 2 })
    h.send({ type: "pointer-move", pointer: ptr(handle.x, yOf(95)) })
    h.send({ type: "pointer-up", pointer: ptr(handle.x, yOf(95)) })
    const next = shapes(h)[0].anchors
    expect(next[2].price).toBeCloseTo(95, 6)
    expect(next[1].price).toBeCloseTo(35, 6)
    expect(next[0].price).toBeCloseTo(50, 6)
    expect(h.state.history.past).toHaveLength(created + 1)
    h.send({ type: "undo" })
    expect(shapes(h)[0].anchors[2].price).toBeCloseTo(80, 6)
    h.send({ type: "drawing", action: { type: "lock", id: "d1" } })
    h.send({ type: "pointer-down", pointer: ptr(handle.x, handle.y) })
    expect(h.state.drag).toBeNull()
  })

  it("kéo cả hình dịch ba mức cùng nhau", () => {
    const h = drawn()
    const before = shapes(h)[0].anchors.map(priceOf)
    h.send({ type: "pointer-down", pointer: ptr(200, yOf(65)) })
    expect(h.state.drag?.kind).toBe("move")
    h.send({ type: "pointer-move", pointer: ptr(200, yOf(65) - 30) })
    h.send({ type: "pointer-up", pointer: ptr(200, yOf(65) - 30) })
    const after = shapes(h)[0].anchors.map(priceOf)
    const delta = after[0] - before[0]
    expect(delta).toBeCloseTo(10, 6)
    expect(after[1] - before[1]).toBeCloseTo(delta, 6)
    expect(after[2] - before[2]).toBeCloseTo(delta, 6)
  })
})

describe("công cụ đợt 1 khác", () => {
  it("công cụ một điểm vẽ ngay (nhãn giá, mũi tên lên và xuống); hai điểm cần hai cú bấm (mũi tên, hộp chú thích, đo, elip)", () => {
    const h = market()
    for (const tool of ["price-label", "arrow-up", "arrow-down"] as const) {
      h.send({ type: "tool", tool })
      click(h, 120, 120)
    }
    expect(shapes(h).map((shape) => shape.tool)).toEqual(["price-label", "arrow-up", "arrow-down"])
    for (const tool of ["arrow", "callout", "date-range", "date-price-range", "ellipse"] as const) {
      h.send({ type: "tool", tool })
      click(h, 150, 100)
      click(h, 250, 180)
    }
    expect(shapes(h)).toHaveLength(8)
    h.send({ type: "tool", tool: "triangle" })
    click(h, 150, 100)
    click(h, 250, 180)
    expect(shapes(h)).toHaveLength(8)
    click(h, 330, 120)
    expect(shapes(h)).toHaveLength(9)
  })

  it("nhấn giữ ở điểm đầu, kéo tới điểm cuối rồi thả cũng vẽ xong mũi tên và elip", () => {
    const h = market()
    h.send({ type: "tool", tool: "arrow" })
    h.send({ type: "pointer-down", pointer: ptr(100, 200) })
    h.send({ type: "pointer-move", pointer: ptr(250, 100) })
    h.send({ type: "pointer-up", pointer: ptr(250, 100) })
    expect(shapes(h)[0].tool).toBe("arrow")
  })

  it("khoá, ẩn và nhân bản hoạt động với mọi công cụ mới qua hành động `drawing`", () => {
    const h = market()
    h.send({ type: "tool", tool: "callout" })
    click(h, 150, 100)
    click(h, 250, 180)
    h.send({ type: "drawing", action: { type: "text", id: "d1", text: "Hỗ trợ" } })
    h.send({ type: "drawing", action: { type: "duplicate", id: "d1" } })
    expect(shapes(h)).toHaveLength(2)
    expect(shapes(h)[1]).toMatchObject({ tool: "callout", text: "Hỗ trợ" })
    h.send({ type: "drawing", action: { type: "lock", id: "d1" } })
    h.send({ type: "drawing", action: { type: "text", id: "d1", text: "Sửa" } })
    expect(shapes(h)[0].text).toBe("Hỗ trợ")
    h.send({ type: "drawing", action: { type: "hide", id: "d2" } })
    expect(shapes(h)[1].hidden).toBe(true)
  })
})

describe("Flashback dùng cả công cụ đợt 1", () => {
  it("13 công cụ đợt 1 và ba công cụ cũ đều bật được", () => {
    const config = flashbackConfig({ warmup: 0, barCount: 60, totalSlots: 80 })
    const h = harness(config, { kind: "session", barCount: 60 })
    for (const tool of ["long-position", "short-position", "brush", "arrow", "arrow-up", "arrow-down", "price-label", "callout", "date-range", "date-price-range", "ellipse", "triangle", "path", "trend", "fib-retracement", "horizontal"] as const) {
      h.send({ type: "tool", tool })
      expect(h.state.drawings.tool, tool).toBe(tool)
      h.send({ type: "tool", tool: null })
    }
  })
})

describe("nam châm: tắt, yếu, mạnh", () => {
  // Khoảng giá 0-100 trên khung 300px: 56 ở y = 132, 52 ở 144, 48 ở 156, 44 ở 168.
  const bars = barsOf(BARS, { open: 48, high: 56, low: 44, close: 52 })
  const anchorAfterClick = (mode: boolean | "off" | "weak" | "strong" | undefined, x: number, y: number) => {
    const h = market(bars)
    if (mode !== undefined) h.send({ type: "magnet", on: mode })
    h.send({ type: "tool", tool: "horizontal" })
    click(h, x, y)
    return shapes(h)[0].anchors[0]
  }

  it("trạng thái ban đầu là tắt; hành động nhận boolean của layout cũ (true thành yếu) và ba chế độ", () => {
    expect(createInteractionState({ defaultViewport: VIEW, historyLimit: 10 }).magnet).toBe("off")
    expect(createInteractionState({ defaultViewport: VIEW, historyLimit: 10 }, [], true).magnet).toBe("weak")
    expect(createInteractionState({ defaultViewport: VIEW, historyLimit: 10 }, [], false).magnet).toBe("off")
    expect(createInteractionState({ defaultViewport: VIEW, historyLimit: 10 }, [], "strong").magnet).toBe("strong")
    expect(createInteractionState({ defaultViewport: VIEW, historyLimit: 10 }, [], "bậy").magnet).toBe("off")
    const h = market()
    expect(h.send({ type: "magnet", on: true }).magnet).toBe("weak")
    expect(h.send({ type: "magnet", on: "strong" }).magnet).toBe("strong")
    expect(h.send({ type: "magnet", on: false }).magnet).toBe("off")
    // Cùng giá trị thì trạng thái không đổi tham chiếu.
    const same = h.state
    expect(h.send({ type: "magnet", on: false })).toBe(same)
  })

  it("tắt: điểm neo đúng chỗ con trỏ, kể cả sát một giá OHLC", () => {
    const anchor = anchorAfterClick(undefined, 100, 134)
    expect(anchor.price).toBeCloseTo(100 - (134 / 300) * 100, 6)
    expect(anchorAfterClick("off", 100, 100).price).toBeCloseTo(100 - (100 / 300) * 100, 6)
  })

  it("yếu: chỉ hút khi con trỏ trong ngưỡng (12px) của một giá O, H, L, C", () => {
    expect(anchorAfterClick("weak", 100, 135).price).toBe(56)
    expect(anchorAfterClick(true, 100, 135).price).toBe(56)
    expect(anchorAfterClick("weak", 100, 168 + 11).price).toBe(44)
    // Xa hơn ngưỡng thì giữ nguyên giá tại con trỏ.
    expect(anchorAfterClick("weak", 100, 100).price).toBeCloseTo(100 - (100 / 300) * 100, 6)
    expect(anchorAfterClick("weak", 100, 200).price).toBeCloseTo(100 - (200 / 300) * 100, 6)
  })

  it("mạnh: luôn hút về giá O, H, L, C gần nhất của nến gần nhất, không cần trong ngưỡng", () => {
    expect(anchorAfterClick("strong", 100, 100).price).toBe(56)
    expect(anchorAfterClick("strong", 100, 20).price).toBe(56)
    expect(anchorAfterClick("strong", 100, 200).price).toBe(44)
    expect(anchorAfterClick("strong", 100, 290).price).toBe(44)
    expect(anchorAfterClick("strong", 100, 150).price).toBe(52)
    expect(anchorAfterClick("strong", 100, 160).price).toBe(48)
  })

  it("mạnh hút về nến gần nhất kể cả khi con trỏ ở ngoài vùng có nến; yếu thì không", () => {
    // Nến cuối là 299; x = 499 ứng với chỉ số 299,88 làm tròn thành 300, ngoài vùng có nến.
    expect(anchorAfterClick("strong", 499, 100).price).toBe(56)
    expect(anchorAfterClick("weak", 499, 135).price).toBeCloseTo(100 - (135 / 300) * 100, 6)
  })

  it("mạnh chọn nến theo chỉ số gần nhất: nến có giá khác nhau thì hút về giá của đúng nến đó", () => {
    const varied = barsOf(BARS).map((bar, index) => (index === 270 ? { ...bar, high: 90, low: 10, open: 30, close: 70 } : bar))
    const h = market(varied)
    h.send({ type: "magnet", on: "strong" })
    h.send({ type: "tool", tool: "horizontal" })
    // Nến 270 có tâm ở x = (270 - 240) / 60 x 500 = 250; giá 90 ở y = 30, giá 70 ở y = 90: bấm ở y = 50 thì gần 90 hơn.
    click(h, 254, 50)
    expect(shapes(h)[0].anchors[0].price).toBe(90)
  })

  it("áp dụng cả khi kéo tay nắm: yếu không hút khi ở xa, mạnh hút", () => {
    for (const [mode, expected] of [["weak", null], ["strong", 56]] as const) {
      const h = market(bars)
      h.send({ type: "tool", tool: "trend" })
      click(h, 100, 200)
      click(h, 300, 250)
      h.send({ type: "magnet", on: mode })
      const coords = h.coords()
      const [, end] = shapes(h)[0].anchors
      const handle = { x: coords.xOfIndex(coords.indexOfAnchor(end)!), y: coords.yOfPrice(end.price) }
      h.send({ type: "pointer-down", pointer: ptr(handle.x, handle.y) })
      h.send({ type: "pointer-move", pointer: ptr(handle.x, 60) })
      h.send({ type: "pointer-up", pointer: ptr(handle.x, 60) })
      const price = shapes(h)[0].anchors[1].price
      if (expected === null) expect(price).toBeCloseTo(100 - (60 / 300) * 100, 6)
      else expect(price).toBe(expected)
    }
  })

  it("Flashback giữ nguyên: nam châm yếu hút theo ngưỡng, không hút khi ở xa", () => {
    const config = flashbackConfig({ warmup: 0, barCount: 60, totalSlots: 80 })
    const h = harness(config, { kind: "session", barCount: 60, bars: barsOf(60, { open: 48, high: 56, low: 44, close: 52 }) })
    h.send({ type: "magnet", on: true })
    h.send({ type: "tool", tool: "horizontal" })
    h.send({ type: "pointer-down", pointer: ptr(100, 135) })
    h.send({ type: "pointer-up", pointer: ptr(100, 135) })
    expect(h.state.drawings.shapes[0].anchors[0].price).toBe(56)
    h.send({ type: "tool", tool: "horizontal" })
    h.send({ type: "pointer-down", pointer: ptr(100, 60) })
    h.send({ type: "pointer-up", pointer: ptr(100, 60) })
    expect(h.state.drawings.shapes[1].anchors[0].price).toBeCloseTo(100 - (60 / 300) * 100, 6)
  })
})
