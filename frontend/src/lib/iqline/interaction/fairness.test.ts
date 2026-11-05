/**
 * Luật công bằng của Flashback (docs/iqline-design.md §12) và chế độ `static` chỉ có crosshair (§7, §13).
 * Đây là ràng buộc của game: kéo không qua warmup hay vào tương lai, crosshair không đọc được ô tương lai.
 */
import { describe, expect, it } from "vitest"

import { harness, ptr, target, touch } from "./__fixtures__/harness"
import { ALL_TOOLS } from "../drawings"
import { flashbackConfig, staticConfig, wheelIntent } from "./index"

/**
 * Chỉ số theo scene (`scene/model.ts`): warmup đã bị cắt, phiên 0 là nến đầu tiên được hiện. Warmup không có chỉ số nào nên
 * không kéo tới, không đọc, không neo hình vào được; ranh giới bên trái của trục là `FIRST` và không thể lùi qua.
 */
const WARMUP = 20
const OPENED = 60 // độ dài `FlashbackProps.bars`, gồm cả warmup
const SHOWN = OPENED - WARMUP // nến thấy được: phiên 0 đến 39
const SLOTS = 80 // ô trên trục (không tính warmup); phiên 40 đến 79 là tương lai
const FIRST = -0.5 // mép trái của ô đầu tiên
const LAST = SLOTS - 0.5 // mép phải của ô cuối
const FULL = { from: FIRST, to: LAST }

function flashback(input: { zoom?: boolean; pan?: boolean } = {}) {
  return harness(flashbackConfig({ warmup: WARMUP, barCount: OPENED, totalSlots: SLOTS, ...input }), { kind: "session", barCount: SHOWN })
}

const ctrlWheel = (deltaY: number, x = 250) => ({ type: "wheel" as const, wheel: { x, y: 100, deltaX: 0, deltaY, ctrlKey: true, target: target() } })

describe("flashback: viewport không qua warmup hay vào tương lai", () => {
  it("mở ra đúng khung mặc định: từ nến đầu tiên sau warmup tới ô cuối của trục, vừa khít", () => {
    expect(flashback().state.viewport).toEqual(FULL)
    expect(flashback().config.viewport).toEqual({ slots: SLOTS, leftPad: 0, rightPad: 0 })
  })

  it("kéo hết cỡ về bên trái không bao giờ qua warmup, hết cỡ về bên phải không qua ô cuối", () => {
    const h = flashback()
    h.send(ctrlWheel(-500))
    const span = h.state.viewport.to - h.state.viewport.from
    expect(span).toBeLessThan(SLOTS)

    // Kéo chuột sang phải thật xa: viewport về trái.
    h.send({ type: "pointer-down", pointer: ptr(0, 100) })
    h.send({ type: "pointer-move", pointer: ptr(1_000_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(1_000_000, 100) })
    expect(h.state.viewport.from).toBe(FIRST)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(span, 9)

    h.send({ type: "pointer-down", pointer: ptr(500, 100) })
    h.send({ type: "pointer-move", pointer: ptr(-1_000_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(-1_000_000, 100) })
    expect(h.state.viewport.to).toBe(LAST)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(span, 9)
  })

  it("phím mũi tên và lăn ngang cũng dừng ở biên", () => {
    const h = flashback()
    h.send(ctrlWheel(-500))
    for (let i = 0; i < 100; i++) h.send({ type: "key", key: { key: "ArrowLeft", shiftKey: true } })
    expect(h.state.viewport.from).toBe(FIRST)
    for (let i = 0; i < 100; i++) h.send({ type: "key", key: { key: "ArrowRight", shiftKey: true } })
    expect(h.state.viewport.to).toBe(LAST)
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: -1e7, deltaY: 0, target: target() } })
    expect(h.state.viewport.from).toBe(FIRST)
  })

  it("thu nhỏ hết cỡ cũng không lộ warmup: độ rộng không quá số ô thấy được", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    for (let i = 0; i < 60; i++) h.send(ctrlWheel(300))
    expect(h.state.viewport).toEqual(FULL)
    h.send({ type: "key", key: { key: "-" } })
    expect(h.state.viewport).toEqual(FULL)
  })

  it("viewport đặt từ bên ngoài, hoặc chụm hai ngón, cũng bị kẹp", () => {
    const h = flashback()
    h.send({ type: "set-viewport", viewport: { from: -20, to: 40 } })
    expect(h.state.viewport.from).toBe(FIRST)
    h.send({ type: "set-viewport", viewport: { from: 70, to: 130 } })
    expect(h.state.viewport.to).toBe(LAST)
    expect(h.state.viewport.from).toBeGreaterThanOrEqual(FIRST)

    h.send({ type: "pointer-down", pointer: touch(1, 100, 100) })
    h.send({ type: "pointer-down", pointer: touch(2, 400, 100) })
    h.send({ type: "pointer-move", pointer: touch(1, 240, 100) })
    h.send({ type: "pointer-move", pointer: touch(2, 260, 100) })
    expect(h.state.viewport.from).toBeGreaterThanOrEqual(FIRST)
    expect(h.state.viewport.to).toBeLessThanOrEqual(LAST)
  })

  it("nút và nhấp đúp về khung mặc định; nhấp đúp lên hình vẽ thì không về", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    h.send({ type: "double-click", pointer: ptr(250, 100) })
    expect(h.state.viewport).toEqual(FULL)
    h.send(ctrlWheel(-300))
    h.send({ type: "reset" })
    expect(h.state.viewport).toEqual(FULL)
  })
})

describe("flashback: zoom bằng lăn chuột, không co giãn trục, không hoàn tác", () => {
  it("lăn dọc zoom quanh con trỏ (không cần Ctrl); lăn ngoài khung vẽ thì để trang cuộn", () => {
    const h = flashback()
    expect(h.config.wheelNeedsCtrl).toBe(false)
    const wheel = { x: 250, y: 100, deltaX: 0, deltaY: -100, target: target() }
    expect(wheelIntent(wheel, h.config)).toBe("zoom")
    h.send({ type: "wheel", wheel })
    expect(h.state.viewport.to - h.state.viewport.from).toBeLessThan(SLOTS)
    expect(wheelIntent({ ...wheel, ctrlKey: true }, h.config)).toBe("zoom")
    expect(wheelIntent({ ...wheel, target: target("none") }, h.config)).toBe("none")
  })

  it("zoom quanh con trỏ: ô dưới con trỏ đứng yên; zoom ra hết cỡ về đúng khung mặc định, không rộng hơn trục", () => {
    const h = flashback()
    const before = h.coords().indexOfX(125)
    h.send({ type: "wheel", wheel: { x: 125, y: 100, deltaX: 0, deltaY: -300, target: target() } })
    expect(h.state.viewport.to - h.state.viewport.from).toBeLessThan(SLOTS)
    expect(h.coords().indexOfX(125)).toBeCloseTo(before, 6)
    for (let step = 0; step < 40; step += 1) h.send({ type: "wheel", wheel: { x: 125, y: 100, deltaX: 0, deltaY: 900, target: target() } })
    expect(h.state.viewport).toEqual(FULL)
  })

  it("Shift + lăn và lăn ngang là kéo, không zoom", () => {
    const h = flashback()
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: 0, deltaY: -400, target: target() } })
    const zoomed = h.state.viewport
    const width = zoomed.to - zoomed.from
    expect(wheelIntent({ deltaX: 0, deltaY: 120, shiftKey: true, target: target() }, h.config)).toBe("pan")
    h.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: 0, deltaY: 120, shiftKey: true, target: target() } })
    expect(h.state.viewport.from).toBeGreaterThan(zoomed.from)
    expect(h.state.viewport.to - h.state.viewport.from).toBeCloseTo(width, 9)
  })

  it("zoom bằng lăn không đưa khung ra ngoài các ô của trục, kể cả khi lăn sát mép", () => {
    const h = flashback()
    for (const x of [0, 5, 495, 500]) {
      for (let step = 0; step < 8; step += 1) h.send({ type: "wheel", wheel: { x, y: 100, deltaX: 0, deltaY: -600, target: target() } })
      expect(h.state.viewport.from).toBeGreaterThanOrEqual(FIRST)
      expect(h.state.viewport.to).toBeLessThanOrEqual(LAST)
      h.send({ type: "reset" })
    }
  })

  it("Học viện (`static`) và biểu đồ tắt zoom vẫn để trang cuộn: lăn dọc không đổi gì", () => {
    expect(wheelIntent({ deltaX: 0, deltaY: -100, target: target() }, staticConfig({ barCount: 40, viewport: { from: -0.5, to: 39.5 } }))).toBe("none")
    const noZoom = flashback({ zoom: false })
    expect(wheelIntent({ deltaX: 0, deltaY: -100, target: target() }, noZoom.config)).toBe("none")
    noZoom.send({ type: "wheel", wheel: { x: 250, y: 100, deltaX: 0, deltaY: -100, target: target() } })
    expect(noZoom.state.viewport).toEqual(FULL)
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
    expect(noZoom.state.viewport).toEqual(FULL)

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

describe("flashback: đủ 36 công cụ, điểm neo theo phiên", () => {
  it("nhận cả 36 công cụ và từ chối tên lạ", () => {
    const h = flashback()
    expect(h.config.allowedTools).toHaveLength(36)
    for (const tool of ALL_TOOLS) {
      h.send({ type: "tool", tool })
      expect(h.state.drawings.tool, tool).toBe(tool)
      h.send({ type: "tool", tool: null })
    }
    h.send({ type: "tool", tool: "khong-co" as never })
    expect(h.state.drawings.tool).toBeNull()
  })

  it("điểm neo vẽ ra là {session, price}, không có trường thời gian, và không rơi trước nến đầu hay ngoài trục", () => {
    const h = flashback()
    h.send({ type: "tool", tool: "trend" })
    // x = 2 là sát mép trái của khung (ô 0), x lớn hơn khung là ngoài ô cuối.
    h.send({ type: "pointer-down", pointer: ptr(2, 100) })
    h.send({ type: "pointer-up", pointer: ptr(2, 100) })
    h.send({ type: "pointer-down", pointer: ptr(10_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(10_000, 100) })
    const [drawing] = h.state.drawings.shapes
    for (const anchor of drawing.anchors) {
      expect(Object.keys(anchor).sort()).toEqual(["price", "session"])
      const session = (anchor as { session: number }).session
      expect(session).toBeGreaterThanOrEqual(0)
      expect(session).toBeLessThanOrEqual(SLOTS - 1)
    }
    expect(JSON.stringify(drawing)).not.toContain("time")
  })

  it("kéo cả hình không đưa điểm neo ra ngoài [0, ô cuối]", () => {
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
    expect(Math.min(...sessions)).toBeCloseTo(0, 9)
    h.send({ type: "pointer-down", pointer: ptr(100, 100) })
    h.send({ type: "pointer-move", pointer: ptr(100 + 100_000, 100) })
    h.send({ type: "pointer-up", pointer: ptr(100 + 100_000, 100) })
    const after = h.state.drawings.shapes[0].anchors.map((anchor) => (anchor as { session: number }).session)
    expect(Math.max(...after)).toBeLessThanOrEqual(SLOTS - 1)
  })
})

describe("flashback: crosshair không đọc được ô tương lai", () => {
  // Khung mặc định vừa khít 80 ô trên 500px: 6,25px mỗi ô; tâm ô i ở (i + 0,5) x 6,25.
  const xOfSlot = (slot: number) => (slot + 0.5) * 6.25

  it("trên nến đã mở thì đọc được đúng nến đó", () => {
    const h = flashback()
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(SHOWN - 1), 100) })
    expect(h.state.crosshair).toMatchObject({ bar: SHOWN - 1, source: "pointer" })
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(0), 100) })
    expect(h.state.crosshair?.bar).toBe(0)
  })

  it("trên ô tương lai, từ ô đầu tiên chưa mở tới ô cuối, thì không có crosshair", () => {
    const h = flashback()
    h.send({ type: "pointer-move", pointer: ptr(xOfSlot(SHOWN - 1), 100) })
    for (const slot of [SHOWN, SHOWN + 1, 60, SLOTS - 1]) {
      h.send({ type: "pointer-move", pointer: ptr(xOfSlot(slot), 100) })
      expect(h.state.crosshair, `ô ${slot}`).toBeNull()
    }
    h.send({ type: "pointer-move", pointer: ptr(499, 100) })
    expect(h.state.crosshair).toBeNull()
  })

  it("khi khung đã được kéo, ranh giới tương lai vẫn đúng theo số phiên chứ không theo vị trí màn hình", () => {
    const h = flashback()
    h.send(ctrlWheel(-300))
    h.send({ type: "set-viewport", viewport: { from: 20, to: 60 } })
    const px = 500 / 40
    h.send({ type: "pointer-move", pointer: ptr((SHOWN - 1 - 20) * px, 100) })
    expect(h.state.crosshair?.bar).toBe(SHOWN - 1)
    h.send({ type: "pointer-move", pointer: ptr((SHOWN - 20) * px, 100) })
    expect(h.state.crosshair).toBeNull()
  })

  it("crosshair bàn phím không đi quá nến đã mở cuối cùng, cũng không lùi trước nến đầu", () => {
    const h = flashback()
    h.send({ type: "key", key: { key: "ArrowRight", altKey: true } })
    expect(h.state.crosshair?.bar).toBe(SHOWN - 1)
    for (let i = 0; i < 20; i++) h.send({ type: "key", key: { key: "ArrowRight", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(SHOWN - 1)
    for (let i = 0; i < 20; i++) h.send({ type: "key", key: { key: "ArrowLeft", altKey: true, shiftKey: true } })
    expect(h.state.crosshair?.bar).toBe(0)
    expect(h.state.viewport.from).toBeGreaterThanOrEqual(FIRST)
  })

  it("nhấn giữ trên ô tương lai (điện thoại) không bật crosshair", () => {
    const h = flashback()
    h.send({ type: "pointer-down", pointer: touch(1, xOfSlot(60), 100) })
    h.send({ type: "long-press", pointerId: 1 })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "pointer-down", pointer: touch(2, xOfSlot(20), 100) })
    h.send({ type: "pointer-up", pointer: touch(2, xOfSlot(20), 100) })
    h.send({ type: "pointer-up", pointer: touch(1, xOfSlot(60), 100) })
    h.send({ type: "pointer-down", pointer: touch(3, xOfSlot(20), 100) })
    h.send({ type: "long-press", pointerId: 3 })
    expect(h.state.crosshair?.bar).toBe(20)
  })

  it("chưa mở nến nào sau warmup thì không có gì để đọc", () => {
    const h = harness(flashbackConfig({ warmup: WARMUP, barCount: WARMUP, totalSlots: SLOTS }), { kind: "session", barCount: 0 })
    h.send({ type: "pointer-move", pointer: ptr(10, 100) })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "key", key: { key: "ArrowLeft", altKey: true } })
    expect(h.state.crosshair).toBeNull()
  })
})

describe("static chỉ có crosshair", () => {
  const BARS = 40
  const FIXED = { from: -0.5, to: BARS - 0.5 }
  // 12,5px mỗi nến; tâm nến b ở (b + 0,5) x 12,5.
  const xOfBar = (bar: number) => (bar + 0.5) * 12.5
  function fixed() {
    return harness(staticConfig({ barCount: BARS, viewport: { from: -0.5, to: BARS - 0.5 } }), { kind: "session", barCount: BARS })
  }

  it("di chuột cho crosshair; ô ngoài nến không đọc được", () => {
    const h = fixed()
    h.send({ type: "pointer-move", pointer: ptr(xOfBar(20), 100) })
    expect(h.state.crosshair).toMatchObject({ bar: 20 })
    h.send({ type: "pointer-leave" })
    expect(h.state.crosshair).toBeNull()
    h.send({ type: "pointer-move", pointer: ptr(xOfBar(20), 100, { target: target("none") }) })
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
    expect(h.state.viewport).toEqual(FIXED)
    h.send({ type: "pointer-up", pointer: touch(2, 450, 100) })
    h.send({ type: "pointer-up", pointer: touch(1, 100, 100) })

    h.send({ type: "pointer-down", pointer: touch(3, xOfBar(20), 100) })
    h.send({ type: "long-press", pointerId: 3 })
    expect(h.state.crosshair).toMatchObject({ bar: 20, source: "touch" })
    h.send({ type: "pointer-move", pointer: touch(3, xOfBar(22), 100) })
    expect(h.state.crosshair?.bar).toBe(22)
    h.send({ type: "pointer-up", pointer: touch(3, xOfBar(22), 100) })

    h.send({ type: "key", key: { key: "ArrowLeft" } })
    expect(h.state.crosshair).toMatchObject({ bar: 21, source: "keyboard" })
    expect(h.state.viewport).toEqual(FIXED)
    h.send({ type: "key", key: { key: "Escape" } })
    expect(h.state.crosshair).toBeNull()
  })
})
