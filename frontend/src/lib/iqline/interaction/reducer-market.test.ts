/** Tương tác của `market`: zoom, kéo, co giãn trục, crosshair, công cụ vẽ, hoàn tác, cử chỉ chạm (§7). */
import { describe, expect, it } from "vitest"

import { evenTimes } from "../drawings/__fixtures__/coords"
import { barsOf, harness, PLOT, ptr, target, touch } from "./__fixtures__/harness"
import { marketConfig } from "./index"
import type { Anchor } from "../types"

const BARS = 300
const VIEW = { from: 240, to: 300 }
const width = PLOT.right - PLOT.left

function market(options: { historyLimit?: number } = {}) {
  return harness(marketConfig({ barCount: BARS, defaultViewport: VIEW, historyLimit: options.historyLimit }), { kind: "market", barCount: BARS })
}

const wheelAt = (x: number, deltaY: number, over: Record<string, unknown> = {}) => ({ x, y: 100, deltaX: 0, deltaY, target: target(), ...over })

describe("zoom bằng con lăn và phím", () => {
  it("lăn lên phóng to, lăn xuống thu nhỏ, và chỉ số dưới con trỏ đứng yên", () => {
    const h = market()
    const before = h.state.viewport
    const pivotBefore = before.from + 0.25 * (before.to - before.from)
    h.send({ type: "wheel", wheel: wheelAt(125, -100) })
    const zoomed = h.state.viewport
    expect(zoomed.to - zoomed.from).toBeLessThan(60)
    expect(zoomed.from + 0.25 * (zoomed.to - zoomed.from)).toBeCloseTo(pivotBefore, 9)
    h.send({ type: "wheel", wheel: wheelAt(125, 100) })
    expect(h.state.viewport.to - h.state.viewport.from).toBeGreaterThan(zoomed.to - zoomed.from)
  })

  it("Ctrl + lăn (chụm trên bàn di chuột) cũng zoom và nhạy hơn lăn thường", () => {
    const plain = market()
    const pinch = market()
    plain.send({ type: "wheel", wheel: wheelAt(250, -10) })
    pinch.send({ type: "wheel", wheel: wheelAt(250, -10, { ctrlKey: true }) })
    expect(pinch.state.viewport.to - pinch.state.viewport.from).toBeLessThan(plain.state.viewport.to - plain.state.viewport.from)
  })

  it("lăn ngang hoặc Shift + lăn là kéo, không zoom", () => {
    const h = market()
    h.send({ type: "wheel", wheel: wheelAt(250, 0, { deltaX: -100 }) })
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(60, 9)
    expect(h.state.viewport.from).toBeCloseTo(240 - (100 * 60) / width, 9)
    const shifted = market()
    shifted.send({ type: "wheel", wheel: wheelAt(250, -100, { shiftKey: true }) })
    expect(shifted.state.viewport.to - shifted.state.viewport.from).toBeCloseTo(60, 9)
    expect(shifted.state.viewport.from).toBeLessThan(240)
  })

  it("zoom dừng ở độ rộng tối thiểu", () => {
    const h = market()
    for (let i = 0; i < 80; i++) h.send({ type: "wheel", wheel: wheelAt(250, -300) })
    // Tối thiểu theo core: plotWidth / 40 = 12,5 nến.
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(12.5, 9)
  })

  it("phím + và - zoom quanh tâm, về đúng độ rộng cũ sau một vòng", () => {
    const h = market()
    h.send({ type: "key", key: { key: "+" } })
    const span = h.state.viewport.to - h.state.viewport.from
    expect(span).toBeCloseTo(50, 9)
    expect((h.state.viewport.from + h.state.viewport.to) / 2).toBeCloseTo(270, 9)
    h.send({ type: "key", key: { key: "-" } })
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(60, 9)
  })
})

describe("kéo", () => {
  it("kéo chuột trên khung vẽ dịch viewport theo pixel, tính từ điểm bắt đầu nên không cộng dồn sai", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: ptr(250, 100) })
    expect(h.state.drag?.kind).toBe("pan")
    h.send({ type: "pointer-move", pointer: ptr(300, 100) })
    h.send({ type: "pointer-move", pointer: ptr(350, 100) })
    h.send({ type: "pointer-move", pointer: ptr(350, 100) })
    expect(h.state.viewport.from).toBeCloseTo(240 - (100 * 60) / width, 9)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(60, 9)
    h.send({ type: "pointer-up", pointer: ptr(350, 100) })
    expect(h.state.drag).toBeNull()
  })

  it("kéo bàn phím: mũi tên dịch 1 nến, Shift dịch 10 nến, dừng ở biên", () => {
    const h = market()
    h.send({ type: "key", key: { key: "ArrowLeft" } })
    expect(h.state.viewport.from).toBe(239)
    h.send({ type: "key", key: { key: "ArrowLeft", shiftKey: true } })
    expect(h.state.viewport.from).toBe(229)
    for (let i = 0; i < 40; i++) h.send({ type: "key", key: { key: "ArrowRight", shiftKey: true } })
    expect(h.state.viewport.to).toBe(319.5)
  })

  it("kéo ở ô khác (khối lượng, chỉ báo) cũng kéo biểu đồ", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: ptr(250, 100, { target: target("plot", "volume") }) })
    h.send({ type: "pointer-move", pointer: ptr(300, 100, { target: target("plot", "volume") }) })
    expect(h.state.viewport.from).toBeLessThan(240)
  })

  it("chuột phải không kéo", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: ptr(250, 100, { button: 2 }) })
    expect(h.state.drag).toBeNull()
  })

  it("viewport từ bên ngoài (nạp thêm lịch sử) vẫn bị kẹp theo giới hạn", () => {
    const h = market()
    h.send({ type: "set-viewport", viewport: { from: 500, to: 560 } })
    expect(h.state.viewport).toEqual({ from: 259.5, to: 319.5 })
  })
})

describe("co giãn trục (chỉ market)", () => {
  it("kéo trên trục thời gian đổi độ rộng, mép phải đứng yên", () => {
    const h = harness(marketConfig({ barCount: BARS, defaultViewport: { from: 200, to: 300 } }), { kind: "market", barCount: BARS })
    h.send({ type: "pointer-down", pointer: ptr(400, 290, { target: target("time-axis") }) })
    expect(h.state.drag?.kind).toBe("scale-time")
    h.send({ type: "pointer-move", pointer: ptr(300, 290, { target: target("time-axis") }) })
    expect(h.state.viewport.to).toBeCloseTo(300, 9)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(100 / Math.exp(0.5), 6)
    h.send({ type: "pointer-up", pointer: ptr(300, 290, { target: target("time-axis") }) })
  })

  it("kéo trên trục giá đặt hệ số co giãn của ô đó, có chặn trên và dưới; nhấp đúp về tự động", () => {
    const h = market()
    const axis = target("price-axis")
    h.send({ type: "pointer-down", pointer: ptr(490, 100, { target: axis }) })
    h.send({ type: "pointer-move", pointer: ptr(490, 200, { target: axis }) })
    expect(h.state.priceScale.price).toBeCloseTo(Math.exp(0.5), 9)
    h.send({ type: "pointer-move", pointer: ptr(490, -5000, { target: axis }) })
    expect(h.state.priceScale.price).toBe(0.1)
    h.send({ type: "pointer-up", pointer: ptr(490, 100, { target: axis }) })
    h.send({ type: "double-click", pointer: ptr(490, 100, { target: axis }) })
    expect(h.state.priceScale).toEqual({})
  })

  it("về khung mặc định: nhấp đúp vào trục thời gian, hoặc hành động reset, đưa cả viewport và trục giá về mặc định", () => {
    const h = market()
    h.send({ type: "wheel", wheel: wheelAt(250, -300) })
    h.send({ type: "pointer-down", pointer: ptr(490, 100, { target: target("price-axis") }) })
    h.send({ type: "pointer-move", pointer: ptr(490, 150, { target: target("price-axis") }) })
    h.send({ type: "pointer-up", pointer: ptr(490, 150, { target: target("price-axis") }) })
    h.send({ type: "double-click", pointer: ptr(250, 290, { target: target("time-axis") }) })
    expect(h.state.viewport).toEqual(VIEW)
    expect(h.state.priceScale).toEqual({})
    h.send({ type: "wheel", wheel: wheelAt(250, -300) })
    h.send({ type: "reset" })
    expect(h.state.viewport).toEqual(VIEW)
  })

  it("nhấp đúp vào khung vẽ của market không đổi viewport (dành cho mở cài đặt hình)", () => {
    const h = market()
    h.send({ type: "wheel", wheel: wheelAt(250, -300) })
    const zoomed = h.state.viewport
    h.send({ type: "double-click", pointer: ptr(250, 100) })
    expect(h.state.viewport).toBe(zoomed)
  })
})

describe("crosshair", () => {
  it("di chuột trên khung vẽ cho nến dưới con trỏ, đọc được", () => {
    const h = market()
    h.send({ type: "pointer-move", pointer: ptr(250, 100) })
    // 8,33px mỗi nến, tâm nến i ở (i - 240 + 0.5) x 8,33: x = 250 là chỉ số 240 + 250/8,33 - 0.5 = 269,5, làm tròn 270.
    expect(h.state.crosshair).toMatchObject({ bar: 270, paneKey: "price", source: "pointer", x: 250, y: 100 })
  })

  it("ở ô chưa có nến (vùng trống bên phải) vẫn có crosshair nhưng không có nến nào để đọc", () => {
    const h = market()
    h.send({ type: "set-viewport", viewport: { from: 280, to: 320 } })
    h.send({ type: "pointer-move", pointer: ptr(490, 100) })
    expect(h.state.crosshair).toMatchObject({ bar: null, x: 490 })
  })

  it("ra khỏi biểu đồ thì tắt; trên trục thì giữ nguyên; khỏi vùng thì tắt", () => {
    const h = market()
    h.send({ type: "pointer-move", pointer: ptr(250, 100) })
    const shown = h.state.crosshair
    h.send({ type: "pointer-move", pointer: ptr(490, 100, { target: target("price-axis") }) })
    expect(h.state.crosshair).toBe(shown)
    h.send({ type: "pointer-move", pointer: ptr(250, 100, { target: target("none") }) })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "pointer-move", pointer: ptr(250, 100) })
    h.send({ type: "pointer-leave" })
    expect(h.state.crosshair).toBeNull()
  })

  it("Alt + mũi tên di chuyển crosshair từng nến và kéo viewport theo khi nó ra ngoài", () => {
    const h = market()
    h.send({ type: "key", key: { key: "ArrowLeft", altKey: true } })
    expect(h.state.crosshair).toMatchObject({ bar: 299, source: "keyboard" })
    h.send({ type: "key", key: { key: "ArrowLeft", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(289)
    for (let i = 0; i < 6; i++) h.send({ type: "key", key: { key: "ArrowLeft", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(229)
    expect(h.state.viewport.from).toBeLessThanOrEqual(229)
    for (let i = 0; i < 40; i++) h.send({ type: "key", key: { key: "ArrowRight", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(299)
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.crosshair).toBeNull()
  })
})

describe("công cụ vẽ", () => {
  const click = (h: ReturnType<typeof market>, x: number, y: number) => {
    h.send({ type: "pointer-down", pointer: ptr(x, y) })
    h.send({ type: "pointer-up", pointer: ptr(x, y) })
  }

  it("chọn công cụ rồi bấm hai điểm: vẽ xong về chế độ bình thường, hình được chọn, điểm neo là time và price", () => {
    const h = market()
    h.send({ type: "tool", tool: "trend" })
    expect(h.state.drawings.tool).toBe("trend")
    click(h, 100, 100)
    expect(h.state.drawings.pending?.anchors).toHaveLength(1)
    expect(h.state.drag).toBeNull()
    h.send({ type: "pointer-move", pointer: ptr(300, 200) })
    expect(h.state.preview).not.toBeNull()
    click(h, 300, 200)
    const [drawing] = h.state.drawings.shapes
    expect(drawing).toMatchObject({ id: "d1", tool: "trend" })
    expect(drawing.anchors.every((anchor) => Object.keys(anchor).join() === "time,price")).toBe(true)
    expect(h.state.drawings.tool).toBeNull()
    expect(h.state.drawings.selectedId).toBe("d1")
    expect(h.state.preview).toBeNull()
  })

  it("nhấn giữ ở điểm đầu, kéo tới điểm cuối rồi thả cũng vẽ xong", () => {
    const h = market()
    h.send({ type: "tool", tool: "fib-retracement" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    expect(h.state.drag?.kind).toBe("draw")
    h.send({ type: "pointer-move", pointer: ptr(250, 180) })
    h.send({ type: "pointer-up", pointer: ptr(250, 180) })
    expect(h.state.drawings.shapes).toHaveLength(1)
    expect(h.state.drawings.shapes[0].tool).toBe("fib-retracement")
  })

  it("thả gần điểm đầu (nhỏ hơn 6px) thì chỉ là bấm: vẫn chờ điểm kế", () => {
    const h = market()
    h.send({ type: "tool", tool: "trend" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-up", pointer: ptr(103, 102) })
    expect(h.state.drawings.shapes).toHaveLength(0)
    expect(h.state.drawings.pending).not.toBeNull()
  })

  it("công cụ ba điểm cần ba điểm; công cụ một điểm vẽ ngay; bấm ngoài ô giá khi đang vẽ không làm gì", () => {
    const h = market()
    h.send({ type: "tool", tool: "channel" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100, { target: target("plot", "volume") }) })
    expect(h.state.drawings.pending).toBeNull()
    expect(h.state.drag).toBeNull()
    click(h, 100, 100)
    click(h, 200, 100)
    expect(h.state.drawings.shapes).toHaveLength(0)
    click(h, 150, 160)
    expect(h.state.drawings.shapes).toHaveLength(1)
    h.send({ type: "tool", tool: "horizontal" })
    click(h, 100, 150)
    expect(h.state.drawings.shapes).toHaveLength(2)
  })

  it("Esc huỷ vẽ, rồi bỏ chọn", () => {
    const h = market()
    h.send({ type: "tool", tool: "trend" })
    click(h, 100, 100)
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.drawings.tool).toBeNull()
    expect(h.state.drawings.pending).toBeNull()
    expect(h.state.preview).toBeNull()
    h.send({ type: "tool", tool: "trend" })
    click(h, 100, 100)
    click(h, 200, 150)
    expect(h.state.drawings.selectedId).toBe("d1")
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.drawings.selectedId).toBeNull()
  })

  it("hút vào OHLC khi bật: giá của điểm neo là giá O, H, L hoặc C", () => {
    const bars = barsOf(BARS, { open: 48, high: 56, low: 44, close: 52 })
    const h = harness(marketConfig({ barCount: BARS, defaultViewport: VIEW }), { kind: "market", barCount: BARS, bars })
    h.send({ type: "magnet", on: true })
    h.send({ type: "tool", tool: "horizontal" })
    // Giá 56 ở y = 300 x (100 - 56) / 100 = 132; bấm ở y = 135.
    click(h, 100, 135)
    const anchor = h.state.drawings.shapes[0].anchors[0] as Anchor
    expect(anchor.price).toBe(56)
    expect(Number.isInteger((anchor as { time: number }).time - evenTimes(BARS)[0])).toBe(true)
  })

  function drawn() {
    const h = market()
    h.send({ type: "tool", tool: "trend" })
    click(h, 100, 100)
    click(h, 300, 200)
    return h
  }

  it("chọn hình bằng cách bấm vào, bấm chỗ trống thì bỏ chọn và kéo biểu đồ", () => {
    const h = drawn()
    h.send({ type: "drawing", action: { type: "select", id: null } })
    click(h, 200, 150)
    expect(h.state.drawings.selectedId).toBe("d1")
    h.send({ type: "pointer-down", pointer: ptr(400, 30) })
    expect(h.state.drawings.selectedId).toBeNull()
    expect(h.state.drag?.kind).toBe("pan")
  })

  it("kéo tay nắm sửa đúng đầu, giữ nguyên đầu kia, và cả cú kéo là một bước hoàn tác", () => {
    const h = drawn()
    const original = h.state.drawings.shapes[0].anchors
    const coords = h.coords()
    const end = { x: coords.xOfIndex(coords.indexOfAnchor(original[1]) ?? 0), y: coords.yOfPrice(original[1].price) }
    h.send({ type: "pointer-down", pointer: ptr(end.x + 2, end.y + 2) })
    expect(h.state.drag).toMatchObject({ kind: "handle", handle: 1 })
    h.send({ type: "pointer-move", pointer: ptr(end.x + 40, end.y - 30) })
    h.send({ type: "pointer-move", pointer: ptr(end.x + 80, end.y - 60) })
    h.send({ type: "pointer-up", pointer: ptr(end.x + 80, end.y - 60) })
    const moved = h.state.drawings.shapes[0].anchors
    expect(moved[0]).toBe(original[0])
    expect(moved[1]).not.toEqual(original[1])
    expect(h.state.history.past).toHaveLength(2)
    h.send({ type: "undo" })
    expect(h.state.drawings.shapes[0].anchors).toEqual(original)
    h.send({ type: "redo" })
    expect(h.state.drawings.shapes[0].anchors).toEqual(moved)
  })

  it("kéo cả hình dịch mọi điểm neo; hình khoá không kéo được nhưng vẫn chọn được", () => {
    const h = drawn()
    const original = h.state.drawings.shapes[0].anchors
    h.send({ type: "pointer-down", pointer: ptr(200, 150) })
    expect(h.state.drag?.kind).toBe("move")
    h.send({ type: "pointer-move", pointer: ptr(240, 170) })
    h.send({ type: "pointer-up", pointer: ptr(240, 170) })
    const shifted = h.state.drawings.shapes[0].anchors
    expect(shifted[0]).not.toEqual(original[0])
    expect(shifted[1]).not.toEqual(original[1])

    h.send({ type: "drawing", action: { type: "lock", id: "d1" } })
    h.send({ type: "drawing", action: { type: "select", id: null } })
    h.send({ type: "pointer-down", pointer: ptr(240, 170) })
    expect(h.state.drawings.selectedId).toBe("d1")
    expect(h.state.drag).toBeNull()
  })

  it("huỷ cú kéo giữa chừng (pointer-cancel) trả hình về như cũ, không ghi bước hoàn tác", () => {
    const h = drawn()
    const original = h.state.drawings.shapes[0]
    const steps = h.state.history.past.length
    h.send({ type: "pointer-down", pointer: ptr(200, 150) })
    h.send({ type: "pointer-move", pointer: ptr(260, 180) })
    expect(h.state.drawings.shapes[0]).not.toBe(original)
    h.send({ type: "pointer-cancel", pointerId: 1 })
    expect(h.state.drawings.shapes[0]).toBe(original)
    expect(h.state.history.past).toHaveLength(steps)
  })

  it("Delete xoá hình đang chọn và hoàn tác được; hình ẩn không bị chọn bằng chuột", () => {
    const h = drawn()
    h.send({ type: "key", key: { key: "Delete" } })
    expect(h.state.drawings.shapes).toHaveLength(0)
    h.send({ type: "key", key: { key: "z", ctrlKey: true } })
    expect(h.state.drawings.shapes).toHaveLength(1)
    h.send({ type: "drawing", action: { type: "hide", id: "d1" } })
    h.send({ type: "drawing", action: { type: "select", id: null } })
    click(h, 200, 150)
    expect(h.state.drawings.selectedId).toBeNull()
  })

  it("khoá, ẩn, nhân bản đi qua `drawing` và đều hoàn tác được", () => {
    const h = drawn()
    h.send({ type: "drawing", action: { type: "duplicate", id: "d1" } })
    expect(h.state.drawings.shapes).toHaveLength(2)
    h.send({ type: "undo" })
    expect(h.state.drawings.shapes).toHaveLength(1)
    h.send({ type: "drawing", action: { type: "lock", id: "d1" } })
    expect(h.state.drawings.shapes[0].locked).toBe(true)
    h.send({ type: "undo" })
    expect(h.state.drawings.shapes[0].locked).toBeUndefined()
  })

  it("`drawing` không cho lách công cụ hay điểm neo; `tool` ngoài danh sách bị bỏ qua", () => {
    const h = market()
    const before = h.state
    expect(h.send({ type: "drawing", action: { type: "tool", tool: "trend" } })).toBe(before)
    expect(h.send({ type: "drawing", action: { type: "anchor", anchor: { time: 1, price: 1 } } })).toBe(before)
    expect(h.send({ type: "drawing", action: { type: "load", drawings: [] } })).toBe(before)
  })

  it("hoàn tác có giới hạn bước; làm lại bị xoá khi có sửa mới; nạp từ kho lưu trữ xoá lịch sử", () => {
    const h = market({ historyLimit: 3 })
    h.send({ type: "set-drawings", drawings: [{ id: "d1", tool: "trend", anchors: [{ time: 1, price: 1 }, { time: 2, price: 2 }], style: { color: "chart-2", width: 1 } }] })
    for (let i = 0; i < 5; i++) h.send({ type: "drawing", action: { type: "lock", id: "d1" } })
    expect(h.state.history.past).toHaveLength(3)
    for (let i = 0; i < 10; i++) h.send({ type: "undo" })
    expect(h.state.history.past).toHaveLength(0)
    expect(h.state.history.future).toHaveLength(3)
    h.send({ type: "drawing", action: { type: "hide", id: "d1" } })
    expect(h.state.history.future).toHaveLength(0)
    h.send({ type: "set-drawings", drawings: [] })
    expect(h.state.history.past).toHaveLength(0)
    expect(h.state.drawings.shapes).toHaveLength(0)
  })

  it("con trỏ đổi theo ngữ cảnh: dấu cộng khi đang vẽ, tay khi đang trên hình, thay đổi kích thước trên trục", () => {
    const h = drawn()
    h.send({ type: "drawing", action: { type: "select", id: null } })
    h.send({ type: "pointer-move", pointer: ptr(200, 150) })
    expect(h.state.cursor).toBe("pointer")
    h.send({ type: "pointer-move", pointer: ptr(400, 20) })
    expect(h.state.cursor).toBe("default")
    h.send({ type: "pointer-move", pointer: ptr(490, 100, { target: target("price-axis") }) })
    expect(h.state.cursor).toBe("ns-resize")
    h.send({ type: "pointer-move", pointer: ptr(100, 290, { target: target("time-axis") }) })
    expect(h.state.cursor).toBe("ew-resize")
    h.send({ type: "tool", tool: "trend" })
    h.send({ type: "pointer-move", pointer: ptr(100, 100) })
    expect(h.state.cursor).toBe("crosshair")
  })
})

describe("cử chỉ chạm", () => {
  it("vuốt ngang một ngón kéo biểu đồ", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "pointer-move", pointer: touch(1, 200, 104) })
    expect(h.state.viewport.from).toBeCloseTo(240 - (100 * 60) / width, 9)
    h.send({ type: "pointer-up", pointer: touch(1, 200, 104) })
    expect(h.state.drag).toBeNull()
    expect(h.state.touches).toEqual({})
  })

  it("chụm hai ngón zoom: dang ra phóng to, cụm lại thu nhỏ, điểm giữa đứng yên", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: touch(1, 200, 100) })
    h.send({ type: "pointer-down", pointer: touch(2, 300, 100) })
    expect(h.state.pinch).not.toBeNull()
    expect(h.state.drag).toBeNull()
    const centerIndex = 240 + (250 / width) * 60
    h.send({ type: "pointer-move", pointer: touch(1, 150, 100) })
    h.send({ type: "pointer-move", pointer: touch(2, 350, 100) })
    const span = h.state.viewport.to - h.state.viewport.from
    expect(span).toBeCloseTo(30, 6)
    expect(h.state.viewport.from + (250 / width) * span).toBeCloseTo(centerIndex, 6)
    h.send({ type: "pointer-move", pointer: touch(1, 240, 100) })
    h.send({ type: "pointer-move", pointer: touch(2, 260, 100) })
    expect(h.state.viewport.to - h.state.viewport.from).toBeGreaterThan(60)
    h.send({ type: "pointer-up", pointer: touch(2, 260, 100) })
    expect(h.state.pinch).toBeNull()
    h.send({ type: "pointer-move", pointer: touch(1, 300, 100) })
    h.send({ type: "pointer-up", pointer: touch(1, 300, 100) })
  })

  it("nhấn giữ bật crosshair, kéo thì crosshair đi theo chứ biểu đồ không bị kéo, thả ra vẫn giữ tới lần chạm kế", () => {
    const h = market()
    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "long-press", pointerId: 1 })
    expect(h.state.drag).toEqual({ kind: "crosshair", pointerId: 1 })
    expect(h.state.crosshair).toMatchObject({ source: "touch" })
    const start = h.state.crosshair?.bar
    const viewport = h.state.viewport
    h.send({ type: "pointer-move", pointer: touch(1, 220, 110) })
    expect(h.state.crosshair?.bar).toBeGreaterThan(start ?? 0)
    expect(h.state.viewport).toBe(viewport)
    h.send({ type: "pointer-up", pointer: touch(1, 220, 110) })
    expect(h.state.crosshair).not.toBeNull()
    h.send({ type: "pointer-down", pointer: touch(1, 50, 50) })
    expect(h.state.crosshair).toBeNull()
  })

  it("nhấn giữ bị bỏ qua nếu ngón đã kéo xa, có ngón thứ hai, hoặc đang vẽ", () => {
    const moved = market()
    moved.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    moved.send({ type: "pointer-move", pointer: touch(1, 130, 100) })
    moved.send({ type: "long-press", pointerId: 1 })
    expect(moved.state.crosshair).toBeNull()
    expect(moved.state.drag?.kind).toBe("pan")

    const two = market()
    two.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    two.send({ type: "pointer-down", pointer: touch(2, 300, 100) })
    two.send({ type: "long-press", pointerId: 1 })
    expect(two.state.crosshair).toBeNull()

    const drawing = market()
    drawing.send({ type: "tool", tool: "trend" })
    drawing.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    drawing.send({ type: "long-press", pointerId: 1 })
    expect(drawing.state.crosshair).toBeNull()
    expect(drawing.state.drag?.kind).toBe("draw")
  })

  it("đang chọn công cụ vẽ thì chạm là đặt điểm neo, không kéo biểu đồ", () => {
    const h = market()
    h.send({ type: "tool", tool: "trend" })
    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "pointer-move", pointer: touch(1, 300, 200) })
    h.send({ type: "pointer-up", pointer: touch(1, 300, 200) })
    expect(h.state.drawings.shapes).toHaveLength(1)
    expect(h.state.viewport).toEqual(VIEW)
  })
})
