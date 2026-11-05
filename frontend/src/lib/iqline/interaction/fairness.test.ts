/**
 * Luật công bằng của Flashback (docs/iqline-design.md §12) và chế độ `static` chỉ có crosshair (§7, §13).
 * Đây là ràng buộc của game: kéo không qua warmup hay vào tương lai, crosshair không đọc được ô tương lai.
 */
import { describe, expect, it } from "vitest"

import { harness, ptr, target, touch } from "./__fixtures__/harness"
import { flashbackConfig, staticConfig, wheelIntent } from "./index"

const WARMUP = 20
const OPENED = 60 // nến đã mở, gồm cả warmup: phiên 20 đến 59 là nến thấy được
const SLOTS = 100 // ô trên trục; phiên 60 đến 99 là tương lai

function flashback(input: { zoom?: boolean; pan?: boolean } = {}) {
  return harness(flashbackConfig({ warmup: WARMUP, barCount: OPENED, totalSlots: SLOTS, ...input }), { kind: "session", barCount: OPENED })
}

const ctrlWheel = (deltaY: number, x = 250) => ({ type: "wheel" as const, wheel: { x, y: 100, deltaX: 0, deltaY, ctrlKey: true, target: target() } })

describe("flashback: viewport không qua warmup hay vào tương lai", () => {
  it("mở ra đúng khung mặc định: từ phiên đầu tiên sau warmup tới ô cuối của trục", () => {
    expect(flashback().state.viewport).toEqual({ from: WARMUP, to: SLOTS })
  })

  it("kéo hết cỡ về bên trái không bao giờ qua warmup, hết cỡ về bên phải không qua ô cuối", () => {
    const h = flashback()
    h.send(ctrlWheel(-500))
    const span = h.state.viewport.to - h.state.viewport.from
    expect(span).toBeLessThan(SLOTS - WARMUP)

    // Kéo chuột sang phải thật xa: viewport về trái.
    h.send({ type: "pointer-down", pointer: ptr(0, 100) })
    h.send({ type: "pointer-move", pointer: ptr(1_000_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(1_000_000, 100) })
    expect(h.state.viewport.from).toBe(WARMUP)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(span, 9)

    h.send({ type: "pointer-down", pointer: ptr(500, 100) })
    h.send({ type: "pointer-move", pointer: ptr(-1_000_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(-1_000_000, 100) })
    expect(h.state.viewport.to).toBe(SLOTS)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(span, 9)
  })

  it("phím mũi tên và lăn ngang cũng dừng ở biên", () => {
    const h = flashback()
    h.send(ctrlWheel(-500))
    for (let i = 0; i < 100; i++) h.send({ type: "key", key: { key: "ArrowLeft", shiftKey: true } })
    expect(h.state.viewport.from).toBe(WARMUP)
    for (let i = 0; i < 100; i++) h.send({ type: "key", key: { key: "ArrowRight", shiftKey: true } })
    expect(h.state.viewport.to).toBe(SLOTS)
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: -1e7, deltaY: 0, target: target() } })
    expect(h.state.viewport.from).toBe(WARMUP)
  })

  it("thu nhỏ hết cỡ cũng không lộ warmup: độ rộng không quá số ô thấy được", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    for (let i = 0; i < 60; i++) h.send(ctrlWheel(300))
    expect(h.state.viewport).toEqual({ from: WARMUP, to: SLOTS })
    h.send({ type: "key", key: { key: "-" } })
    expect(h.state.viewport).toEqual({ from: WARMUP, to: SLOTS })
  })

  it("viewport đặt từ bên ngoài, hoặc chụm hai ngón, cũng bị kẹp", () => {
    const h = flashback()
    h.send({ type: "set-viewport", viewport: { from: 0, to: 60 } })
    expect(h.state.viewport.from).toBe(WARMUP)
    h.send({ type: "set-viewport", viewport: { from: 90, to: 150 } })
    expect(h.state.viewport.to).toBe(SLOTS)
    expect(h.state.viewport.from).toBeGreaterThanOrEqual(WARMUP)

    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "pointer-down", pointer: touch(2, 400, 100) })
    h.send({ type: "pointer-move", pointer: touch(1, 240, 100) })
    h.send({ type: "pointer-move", pointer: touch(2, 260, 100) })
    expect(h.state.viewport.from).toBeGreaterThanOrEqual(WARMUP)
    expect(h.state.viewport.to).toBeLessThanOrEqual(SLOTS)
  })

  it("nút và nhấp đúp về khung mặc định; nhấp đúp lên hình vẽ thì không về", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    h.send({ type: "double-click", pointer: ptr(250, 100) })
    expect(h.state.viewport).toEqual({ from: WARMUP, to: SLOTS })
    h.send(ctrlWheel(-300))
    h.send({ type: "reset" })
    expect(h.state.viewport).toEqual({ from: WARMUP, to: SLOTS })
  })
})

describe("flashback: zoom bằng Ctrl + lăn, không co giãn trục, không hoàn tác", () => {
  it("lăn chuột thường không zoom (để trang cuộn); Ctrl + lăn mới zoom", () => {
    const h = flashback()
    const wheel = { x: 250, y: 100, deltaX: 0, deltaY: -100, target: target() }
    expect(wheelIntent(wheel, h.config)).toBe("none")
    h.send({ type: "wheel", wheel })
    expect(h.state.viewport).toEqual({ from: WARMUP, to: SLOTS })
    expect(wheelIntent({ ...wheel, ctrlKey: true }, h.config)).toBe("zoom")
    h.send(ctrlWheel(-100))
    expect(h.state.viewport.to - h.state.viewport.from).toBeLessThan(SLOTS - WARMUP)
  })

  it("lăn ngang vẫn kéo được; tắt `interaction.zoom` hoặc `pan` thì không zoom hoặc không kéo", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    const zoomed = h.state.viewport
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: 50, deltaY: 0, target: target() } })
    expect(h.state.viewport.from).toBeGreaterThan(zoomed.from)

    const noZoom = flashback({ zoom: false })
    noZoom.send(ctrlWheel(-300))
    noZoom.send({ type: "key", key: { key: "+" } })
    expect(noZoom.state.viewport).toEqual({ from: WARMUP, to: SLOTS })

    const noPan = flashback({ pan: false })
    noPan.send(ctrlWheel(-300))
    const before = noPan.state.viewport
    noPan.send({ type: "pointer-down", pointer: ptr(100, 100) })
    noPan.send({ type: "pointer-move", pointer: ptr(300, 100) })
    noPan.send({ type: "key", key: { key: "ArrowLeft" } })
    expect(noPan.state.viewport).toBe(before)
    expect(noPan.state.drag).toBeNull()
  })

  it("kéo trên trục không co giãn gì", () => {
    const h = flashback()
    h.send({ type: "pointer-down", pointer: ptr(490, 100, { target: target("price-axis") }) })
    h.send({ type: "pointer-move", pointer: ptr(490, 200, { target: target("price-axis") }) })
    expect(h.state.drag).toBeNull()
    expect(h.state.priceScale).toEqual({})
    h.send({ type: "pointer-down", pointer: ptr(250, 290, { target: target("time-axis") }) })
    expect(h.state.drag).toBeNull()
  })

  it("không hoàn tác và làm lại", () => {
    const h = flashback()
    h.send({ type: "tool", tool: "trend" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-up", pointer: ptr(100, 100) })
    h.send({ type: "pointer-down", pointer: ptr(300, 150) })
    h.send({ type: "pointer-up", pointer: ptr(300, 150) })
    expect(h.state.drawings.shapes).toHaveLength(1)
    expect(h.state.history.past).toHaveLength(0)
    h.send({ type: "key", key: { key: "z", ctrlKey: true } })
    h.send({ type: "undo" })
    expect(h.state.drawings.shapes).toHaveLength(1)
  })
})

describe("flashback: ba công cụ, điểm neo theo phiên", () => {
  it("chỉ nhận trend, fib-retracement và horizontal", () => {
    const h = flashback()
    for (const tool of ["ray", "extended", "channel", "fib-extension", "rectangle", "elliott-5", "note", "measure", "vertical", "horizontal-ray", "elliott-abc"] as const) {
      h.send({ type: "tool", tool })
      expect(h.state.drawings.tool, tool).toBeNull()
    }
    for (const tool of ["trend", "fib-retracement", "horizontal"] as const) {
      h.send({ type: "tool", tool })
      expect(h.state.drawings.tool, tool).toBe(tool)
      h.send({ type: "tool", tool: null })
    }
  })

  it("điểm neo vẽ ra là {session, price}, không có trường thời gian, và không rơi vào warmup hay ngoài trục", () => {
    const h = flashback()
    h.send({ type: "tool", tool: "trend" })
    // x = 0 là ở trái cùng của khung (đúng vùng warmup nếu viewport lùi), x lớn hơn khung là ngoài ô cuối.
    h.send({ type: "pointer-down", pointer: ptr(2, 100) })
    h.send({ type: "pointer-up", pointer: ptr(2, 100) })
    h.send({ type: "pointer-down", pointer: ptr(10_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(10_000, 100) })
    const [drawing] = h.state.drawings.shapes
    for (const anchor of drawing.anchors) {
      expect(Object.keys(anchor).sort()).toEqual(["price", "session"])
      const session = (anchor as { session: number }).session
      expect(session).toBeGreaterThanOrEqual(WARMUP)
      expect(session).toBeLessThanOrEqual(SLOTS - 1)
    }
    expect(JSON.stringify(drawing)).not.toContain("time")
  })

  it("kéo cả hình không đưa điểm neo ra ngoài [warmup, ô cuối]", () => {
    const h = flashback()
    h.send({ type: "tool", tool: "trend" })
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-up", pointer: ptr(100, 100) })
    h.send({ type: "pointer-down", pointer: ptr(300, 150) })
    h.send({ type: "pointer-up", pointer: ptr(300, 150) })
    h.send({ type: "pointer-down", pointer: ptr(200, 125) })
    h.send({ type: "pointer-move", pointer: ptr(200 - 100_000, 125) })
    h.send({ type: "pointer-up", pointer: ptr(200 - 100_000, 125) })
    const sessions = h.state.drawings.shapes[0].anchors.map((anchor) => (anchor as { session: number }).session)
    expect(Math.min(...sessions)).toBeCloseTo(WARMUP, 9)
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-move", pointer: ptr(100 + 100_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(100 + 100_000, 100) })
    const after = h.state.drawings.shapes[0].anchors.map((anchor) => (anchor as { session: number }).session)
    expect(Math.max(...after)).toBeLessThanOrEqual(SLOTS - 1)
  })
})

describe("flashback: crosshair không đọc được ô tương lai", () => {
  // Khung mặc định {20, 100} trên 500px: 6,25px mỗi ô; tâm ô i ở (i - 20 + 0.5) x 6,25.
  const xOfSlot = (slot: number) => (slot - WARMUP + 0.5) * 6.25

  it("trên nến đã mở thì đọc được đúng nến đó", () => {
    const h = flashback()
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(59), 100) })
    expect(h.state.crosshair).toMatchObject({ bar: 59, source: "pointer" })
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(WARMUP), 100) })
    expect(h.state.crosshair?.bar).toBe(WARMUP)
  })

  it("trên ô tương lai, từ ô đầu tiên chưa mở tới ô cuối, thì không có crosshair", () => {
    const h = flashback()
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(59), 100) })
    for (const slot of [60, 61, 80, 99]) {
      h.send({ type: "pointer-move", pointer: ptr(xOfSlot(slot), 100) })
      expect(h.state.crosshair, `ô ${slot}`).toBeNull()
    }
    h.send({ type: "pointer-move", pointer: ptr(499, 100) })
    expect(h.state.crosshair).toBeNull()
  })

  it("khi khung đã được kéo, ranh giới tương lai vẫn đúng theo số phiên chứ không theo vị trí màn hình", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    h.send({ type: "set-viewport", viewport: { from: 40, to: 80 } })
    const px = 500 / 40
    h.send({ type: "pointer-move", pointer: ptr((59 - 40 + 0.5) * px, 100) })
    expect(h.state.crosshair?.bar).toBe(59)
    h.send({ type: "pointer-move", pointer: ptr((60 - 40 + 0.5) * px, 100) })
    expect(h.state.crosshair).toBeNull()
  })

  it("crosshair bàn phím không đi quá nến đã mở cuối cùng, cũng không lùi vào warmup", () => {
    const h = flashback()
    h.send({ type: "key", key: { key: "ArrowRight", altKey: true } })
    expect(h.state.crosshair?.bar).toBe(59)
    for (let i = 0; i < 20; i++) h.send({ type: "key", key: { key: "ArrowRight", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(59)
    for (let i = 0; i < 20; i++) h.send({ type: "key", key: { key: "ArrowLeft", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(WARMUP)
  })

  it("nhấn giữ trên ô tương lai (điện thoại) không bật crosshair", () => {
    const h = flashback()
    h.send({ type: "pointer-down", pointer: touch(1, xOfSlot(80), 100) })
    h.send({ type: "long-press", pointerId: 1 })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "pointer-down", pointer: touch(2, xOfSlot(40), 100) })
    h.send({ type: "pointer-up", pointer: touch(2, xOfSlot(40), 100) })
    h.send({ type: "pointer-up", pointer: touch(1, xOfSlot(80), 100) })
    h.send({ type: "pointer-down", pointer: touch(3, xOfSlot(40), 100) })
    h.send({ type: "long-press", pointerId: 3 })
    expect(h.state.crosshair?.bar).toBe(40)
  })

  it("chưa mở nến nào sau warmup thì không có gì để đọc", () => {
    const h = harness(flashbackConfig({ warmup: WARMUP, barCount: WARMUP, totalSlots: SLOTS }), { kind: "session", barCount: WARMUP })
    h.send({ type: "pointer-move", pointer: ptr(10, 100) })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "key", key: { key: "ArrowLeft", altKey: true } })
    expect(h.state.crosshair).toBeNull()
  })
})

describe("static chỉ có crosshair", () => {
  const BARS = 40
  function fixed() {
    return harness(staticConfig({ barCount: BARS, viewport: { from: 0, to: BARS } }), { kind: "session", barCount: BARS })
  }

  it("di chuột cho crosshair; ô ngoài nến không đọc được", () => {
    const h = fixed()
    h.send({ type: "pointer-move", pointer: ptr(250, 100) })
    expect(h.state.crosshair).toMatchObject({ bar: 20 })
    h.send({ type: "pointer-leave" })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "pointer-move", pointer: ptr(250, 100, { target: target("none") }) })
    expect(h.state.crosshair).toBeNull()
  })

  it("không zoom, không kéo, không co giãn trục, không đặt lại", () => {
    const h = fixed()
    const start = h.state.viewport
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: 0, deltaY: -500, ctrlKey: true, target: target() } })
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: -500, deltaY: 0, target: target() } })
    h.send({ type: "key", key: { key: "+" } })
    h.send({ type: "pointer-down", pointer: ptr(250, 100) })
    h.send({ type: "pointer-move", pointer: ptr(100, 100) })
    h.send({ type: "pointer-up", pointer: ptr(100, 100) })
    h.send({ type: "pointer-down", pointer: ptr(490, 100, { target: target("price-axis") }) })
    h.send({ type: "pointer-move", pointer: ptr(490, 200, { target: target("price-axis") }) })
    h.send({ type: "set-viewport", viewport: { from: 10, to: 20 } })
    expect(h.state.viewport).toEqual(start)
    expect(h.state.drag).toBeNull()
    expect(h.state.priceScale).toEqual({})
  })

  it("không có công cụ vẽ: chọn công cụ, thao tác hình, nạp hình đều bị bỏ qua", () => {
    const h = fixed()
    const start = h.state
    h.send({ type: "tool", tool: "trend" })
    expect(h.state.drawings.tool).toBeNull()
    h.send({ type: "set-drawings", drawings: [{ id: "d1", tool: "trend", anchors: [{ session: 1, price: 1 }, { session: 2, price: 2 }], style: { color: "chart-2", width: 1 } }] })
    expect(h.state.drawings.shapes).toEqual([])
    h.send({ type: "drawing", action: { type: "clear" } })
    h.send({ type: "key", key: { key: "Delete" } })
    expect(h.state.drawings).toBe(start.drawings)
  })

  it("chụm hai ngón không zoom; nhấn giữ bật crosshair; mũi tên đi từng nến", () => {
    const h = fixed()
    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "pointer-down", pointer: touch(2, 300, 100) })
    h.send({ type: "pointer-move", pointer: touch(2, 450, 100) })
    expect(h.state.viewport).toEqual({ from: 0, to: BARS })
    h.send({ type: "pointer-up", pointer: touch(2, 450, 100) })
    h.send({ type: "pointer-up", pointer: touch(1, 100, 100) })

    h.send({ type: "pointer-down", pointer: touch(3, 250, 100) })
    h.send({ type: "long-press", pointerId: 3 })
    expect(h.state.crosshair).toMatchObject({ bar: 20, source: "touch" })
    h.send({ type: "pointer-move", pointer: touch(3, 275, 100) })
    expect(h.state.crosshair?.bar).toBe(22)
    h.send({ type: "pointer-up", pointer: touch(3, 275, 100) })

    h.send({ type: "key", key: { key: "ArrowLeft" } })
    expect(h.state.crosshair).toMatchObject({ bar: 21, source: "keyboard" })
    expect(h.state.viewport).toEqual({ from: 0, to: BARS })
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.crosshair).toBeNull()
  })
})
