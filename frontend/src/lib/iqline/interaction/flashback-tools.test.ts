/**
 * Flashback dùng đủ 36 công cụ qua bộ giảm tương tác (docs/iqline-design.md §10, §12): vẽ từng công cụ bằng chuột kể cả kéo sang ô tương lai,
 * nam châm chỉ hút vào nến đã mở, và không có đường nào đưa dữ liệu của nến chưa mở vào hình vẽ. Ràng buộc của game.
 *
 * Mô phỏng lỗi tệ nhất: mảng nến của môi trường (`bars`) bị lẫn thêm 30 nến "tương lai" có giá cực đoan. Bộ giảm vẫn không được hút vào chúng.
 */
import { describe, expect, it } from "vitest"

import { ALL_TOOLS, TOOL_SPECS, clicksOf, drawingCommands, previewCommands } from "../drawings"
import type { Anchor, Bar, Drawing, DrawingTool } from "../types"
import { barsOf, harness, PLOT, ptr, type Harness } from "./__fixtures__/harness"
import { flashbackConfig } from "./index"

const WARMUP = 20
const OPENED = 60 // gồm warmup
const SHOWN = OPENED - WARMUP // nến thấy được: phiên 0 đến 39
const SLOTS = 80 // phiên 40 đến 79 là tương lai
const SLOT_PX = (PLOT.right - PLOT.left) / SLOTS

/** Giá cực đoan của "nến tương lai" lẫn vào môi trường; không giá nào trùng giá người chơi bấm hay giá của nến thật (44, 48, 52, 56). */
const FUTURE: Partial<Bar> = { open: 7, high: 97, low: 3, close: 91 }
const FUTURE_PRICES = [7, 97, 3, 91]
const SHOWN_PRICES = [44, 48, 52, 56]

const xOf = (session: number) => (session + 0.5) * SLOT_PX
/** Khoảng giá của khung thử là 0 đến 100 trên 300px. */
const yOf = (price: number) => ((100 - price) / 100) * PLOT.bottom

function flashback(options: { leaked?: boolean } = {}): Harness {
  const bars = options.leaked ? [...barsOf(SHOWN), ...barsOf(30, FUTURE)] : barsOf(SHOWN)
  return harness(flashbackConfig({ warmup: WARMUP, barCount: OPENED, totalSlots: SLOTS }), { kind: "session", barCount: SHOWN, bars })
}

function click(h: Harness, session: number, price: number) {
  h.send({ type: "pointer-down", pointer: ptr(xOf(session), yOf(price)) })
  h.send({ type: "pointer-up", pointer: ptr(xOf(session), yOf(price)) })
}

const shapes = (h: Harness): readonly Drawing[] => h.state.drawings.shapes
const sessionOf = (anchor: Anchor) => (anchor as { session: number }).session

/** Các phiên người chơi bấm lần lượt: nến đã mở, rồi ô tương lai, rồi sát mép phải của trục. */
const SLOTS_CLICKED = [6, 22, 38, 52, 66, 79, 30, 12]
const PRICES_CLICKED = [30, 45, 62, 21, 78, 33, 85, 14]

/** Vẽ một công cụ bằng chuột; trả về các điểm đã bấm. */
function draw(h: Harness, tool: DrawingTool): { session: number; price: number }[] {
  const spec = TOOL_SPECS[tool]
  h.send({ type: "tool", tool })
  const clicked: { session: number; price: number }[] = []
  if (spec.variable?.stroke) {
    // Nét bút: kéo từ nến đã mở vào ô tương lai.
    const path = Array.from({ length: 24 }, (_, index) => ({ session: 8 + index * 3, price: 40 + Math.sin(index / 3) * 25 }))
    h.send({ type: "pointer-down", pointer: ptr(xOf(path[0].session), yOf(path[0].price)) })
    for (const point of path.slice(1)) h.send({ type: "pointer-move", pointer: ptr(xOf(point.session), yOf(point.price)) })
    h.send({ type: "pointer-up", pointer: ptr(xOf(path.at(-1)!.session), yOf(path.at(-1)!.price)) })
    return path
  }
  const count = spec.variable ? 5 : clicksOf(tool)
  for (let index = 0; index < count; index += 1) {
    const point = { session: SLOTS_CLICKED[index], price: PRICES_CLICKED[index] }
    click(h, point.session, point.price)
    clicked.push(point)
  }
  if (spec.variable) h.send({ type: "key", key: { key: "Enter" } })
  return clicked
}

describe("Flashback: vẽ từng công cụ trong số 36 bằng chuột", () => {
  for (const tool of ALL_TOOLS) {
    it(`${tool}: hình hoàn tất, điểm neo chỉ có session và giá trong các ô của trục, không hút vào nến chưa mở`, () => {
      const h = flashback({ leaked: true })
      h.send({ type: "magnet", on: "strong" })
      const clicked = draw(h, tool)
      expect(shapes(h), "một hình").toHaveLength(1)
      const [shape] = shapes(h)
      expect(shape.tool).toBe(tool)
      for (const anchor of shape.anchors) {
        expect(Object.keys(anchor).sort()).toEqual(["price", "session"])
        expect(Number.isFinite(sessionOf(anchor)) && Number.isFinite(anchor.price)).toBe(true)
        expect(sessionOf(anchor)).toBeGreaterThanOrEqual(0)
        expect(sessionOf(anchor)).toBeLessThanOrEqual(SLOTS - 1)
        // Không điểm nào lấy giá của nến tương lai lẫn trong môi trường.
        for (const poisoned of FUTURE_PRICES) expect(Math.abs(anchor.price - poisoned), `${tool}: giá ${anchor.price}`).toBeGreaterThan(0.01)
      }
      expect(JSON.stringify(shape.anchors)).not.toMatch(/time|date|symbol/i)
      // Công cụ bấm từng điểm (không nét bút, không công cụ tự dựng thêm điểm): điểm bấm ở ô tương lai giữ nguyên chỗ bấm, điểm ở nến đã mở hút vào OHLC.
      if (!TOOL_SPECS[tool].variable && !TOOL_SPECS[tool].expand) {
        shape.anchors.forEach((anchor, index) => {
          const point = clicked[index]
          if (point.session >= SHOWN) {
            expect(sessionOf(anchor)).toBeCloseTo(Math.min(point.session, SLOTS - 1), 3)
            expect(anchor.price).toBeCloseTo(point.price, 3)
          } else {
            expect(SHOWN_PRICES, `${tool}: điểm ${index}`).toContain(anchor.price)
            expect(sessionOf(anchor)).toBeCloseTo(point.session, 3)
          }
        })
      }
    })
  }

  it("mọi công cụ đã vẽ ra lệnh vẽ và chữ không có ngày, kể cả khi hình ở ô tương lai", () => {
    for (const tool of ALL_TOOLS) {
      const h = flashback()
      draw(h, tool)
      const commands = drawingCommands(shapes(h), h.coords())
      expect(commands.length, tool).toBeGreaterThan(0)
      for (const command of commands) if (command.op === "text") expect(command.text, `${tool}: ${command.text}`).not.toMatch(/ngày|tuần|tháng|năm|giờ|phút|\d{4}-\d{2}|\d{1,2}\/\d{1,2}/)
    }
  })

  it("vị thế mua kéo sang tương lai: rộng tới ô tương lai nhưng giá chốt lời và cắt lỗ chỉ tính từ điểm vào và điểm bấm", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "tool", tool: "long-position" })
    click(h, 30, 50)
    click(h, 70, 62)
    const [shape] = shapes(h)
    expect(shape.anchors).toHaveLength(3)
    const [entry, stop, target] = shape.anchors
    expect(sessionOf(stop)).toBeCloseTo(70, 3)
    expect(sessionOf(target)).toBeCloseTo(70, 3)
    expect(target.price).toBeCloseTo(62, 3)
    expect(stop.price).toBeCloseTo(entry.price - (62 - entry.price) / 2, 3)
  })
})

describe("Flashback: nam châm chỉ hút vào nến đã mở", () => {
  it("Mạnh ở ô tương lai: không hút (điểm giữ đúng chỗ bấm), kể cả khi môi trường lẫn nến tương lai ở ngay đó", () => {
    for (const leaked of [false, true]) {
      const h = flashback({ leaked })
      h.send({ type: "magnet", on: "strong" })
      h.send({ type: "tool", tool: "trend" })
      click(h, 55, 90.5)
      click(h, 75, 5)
      const [first, second] = shapes(h)[0].anchors
      expect(sessionOf(first)).toBeCloseTo(55, 3)
      expect(first.price).toBeCloseTo(90.5, 3)
      expect(sessionOf(second)).toBeCloseTo(75, 3)
      expect(second.price).toBeCloseTo(5, 3)
    }
  })

  it("Mạnh trên nến đã mở: hút về giá O, H, L, C gần nhất của đúng nến dưới con trỏ", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "magnet", on: "strong" })
    h.send({ type: "tool", tool: "trend" })
    click(h, 10, 53.5)
    click(h, 20, 95)
    const [first, second] = shapes(h)[0].anchors
    expect(sessionOf(first)).toBe(10)
    expect(first.price).toBe(52)
    expect(sessionOf(second)).toBe(20)
    expect(second.price).toBe(56)
  })

  it("Mạnh ở nến đã mở cuối cùng (phiên 39) vẫn hút; qua nửa ô sang phiên 40 là tương lai nên không hút", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "magnet", on: "strong" })
    h.send({ type: "tool", tool: "trend" })
    click(h, 39, 70)
    // Chỉ số 39,4 làm tròn về nến cuối; 39,6 làm tròn sang ô tương lai đầu tiên.
    h.send({ type: "pointer-down", pointer: ptr((39.4 + 0.5) * SLOT_PX, yOf(10)) })
    h.send({ type: "pointer-up", pointer: ptr((39.4 + 0.5) * SLOT_PX, yOf(10)) })
    h.send({ type: "tool", tool: "horizontal" })
    h.send({ type: "pointer-down", pointer: ptr((39.6 + 0.5) * SLOT_PX, yOf(12.5)) })
    h.send({ type: "pointer-up", pointer: ptr((39.6 + 0.5) * SLOT_PX, yOf(12.5)) })
    const [trend, horizontal] = shapes(h)
    expect(sessionOf(trend.anchors[0])).toBe(39)
    expect(trend.anchors[0].price).toBe(56)
    expect(sessionOf(trend.anchors[1])).toBe(39)
    expect(trend.anchors[1].price).toBe(44)
    expect(horizontal.anchors[0].price).toBeCloseTo(12.5, 3)
  })

  it("Yếu: chỉ hút khi trong ngưỡng và chỉ trên nến đã mở; ở ô tương lai không hút dù gần giá của nến lẫn vào", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "magnet", on: "weak" })
    h.send({ type: "tool", tool: "trend" })
    click(h, 10, 53.5) // cách giá đóng 52 là 1,5 đơn vị = 4,5px, trong ngưỡng 12px
    click(h, 55, 90.5) // gần giá đóng 91 của nến lẫn vào, nhưng là ô tương lai
    const [first, second] = shapes(h)[0].anchors
    expect(first.price).toBe(52)
    expect(second.price).toBeCloseTo(90.5, 3)
  })

  it("Tắt: giữ đúng chỗ bấm ở cả nến đã mở", () => {
    const h = flashback()
    h.send({ type: "tool", tool: "trend" })
    click(h, 10, 53.5)
    click(h, 20, 95)
    const [first, second] = shapes(h)[0].anchors
    expect(first.price).toBeCloseTo(53.5, 3)
    expect(second.price).toBeCloseTo(95, 3)
  })

  it("kéo tay nắm vào ô tương lai với nam châm Mạnh: tay nắm đứng đúng chỗ thả, không nhảy về nến cuối", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "tool", tool: "trend" })
    click(h, 10, 40)
    click(h, 25, 60)
    h.send({ type: "magnet", on: "strong" })
    const end = ptr(xOf(25), yOf(60))
    h.send({ type: "pointer-down", pointer: end })
    h.send({ type: "pointer-move", pointer: ptr(xOf(60), yOf(33)) })
    h.send({ type: "pointer-move", pointer: ptr(xOf(70), yOf(33)) })
    h.send({ type: "pointer-up", pointer: ptr(xOf(70), yOf(33)) })
    const [, moved] = shapes(h)[0].anchors
    expect(sessionOf(moved)).toBeCloseTo(70, 3)
    expect(moved.price).toBeCloseTo(33, 3)
  })
})

describe("Flashback: con trỏ ở ô tương lai lúc đang vẽ không đọc được gì", () => {
  it("không có crosshair ở ô tương lai dù công cụ đang bật; điểm xem trước chỉ là chỗ con trỏ", () => {
    const h = flashback({ leaked: true })
    h.send({ type: "magnet", on: "strong" })
    h.send({ type: "tool", tool: "date-price-range" })
    click(h, 10, 50)
    for (const session of [SHOWN, SHOWN + 5, SLOTS - 1]) {
      h.send({ type: "pointer-move", pointer: ptr(xOf(session), yOf(77)) })
      expect(h.state.crosshair, `phiên ${session}`).toBeNull()
      expect(h.state.preview).toEqual({ session, price: expect.closeTo(77, 3) })
    }
    // Ở nến đã mở thì có crosshair và đọc được nến đó.
    h.send({ type: "pointer-move", pointer: ptr(xOf(20), yOf(77)) })
    expect(h.state.crosshair?.bar).toBe(20)
  })

  it("xem trước kéo khoảng thời gian và khoảng giá qua ô tương lai: nhãn chỉ có giá và số nến, không có ngày", () => {
    for (const tool of ["date-range", "date-price-range", "measure", "fib-time-zones"] as const) {
      const h = flashback()
      h.send({ type: "tool", tool })
      click(h, 30, 50)
      h.send({ type: "pointer-move", pointer: ptr(xOf(70), yOf(60)) })
      const { pending, preview } = { pending: h.state.drawings.pending, preview: h.state.preview }
      expect(pending?.anchors, tool).toHaveLength(1)
      expect(preview, tool).not.toBeNull()
      const texts = previewCommands(pending, preview, h.coords()).flatMap((command) => (command.op === "text" ? [command.text] : []))
      if (tool !== "fib-time-zones") expect(texts.some((text) => /40 nến$/.test(text)), `${tool}: ${texts.join(" | ")}`).toBe(true)
      for (const text of texts) expect(text).not.toMatch(/ngày|tuần|tháng|năm|giờ|phút|\d{4}-\d{2}|\d{1,2}\/\d{1,2}/)
    }
  })
})
