/**
 * Bộ giảm chạy với phép đổi toạ độ THẬT của `scene/` và `core/` (không phải bản giả của test): mỗi lần giảm xong thì dựng lại khung
 * theo viewport mới, đúng cách lớp `react/` sẽ làm. Kiểm tra hai bên cùng một quy ước chỉ số.
 */
import { describe, expect, it } from "vitest"

import { drawingCommands } from "../drawings"
import { indexAtPointer } from "../scene/builder"
import { createChartData, type ChartData, type ChartFrame } from "../scene/model"
import { flashbackInput, frameOf, makeTimedBars, marketInput } from "../scene/test-support"
import type { Bar, TimedBar } from "../types"
import { fitViewport, shiftForPrepend } from "../core/viewport"
import { createInteractionState, flashbackConfig, interactionReducer, limitsOf, manualPriceRange, marketConfig } from "./index"
import type { InteractionAction, InteractionConfig, InteractionState } from "./index"

function session(data: ChartData, config: InteractionConfig) {
  let state = createInteractionState(config)
  const frame = (): ChartFrame => frameOf(data, { viewport: state.viewport })
  return {
    get state() {
      return state
    },
    get frame() {
      return frame()
    },
    send(action: InteractionAction): InteractionState {
      const current = frame()
      state = interactionReducer(state, action, { config, coords: current.price.coords, bars: data.raw as readonly Bar[] })
      return state
    },
    /** Điểm giữa theo chiều dọc của ô giá, tại `x`. */
    at(x: number, over: object = {}) {
      const { box } = frame().price
      return { pointerId: 1, pointerType: "mouse" as const, x, y: box.top + box.height / 2, target: { region: "plot" as const, paneKind: "price" as const, paneKey: "price" }, ...over }
    },
  }
}

describe("flashback với scene thật", () => {
  const data = createChartData(flashbackInput({ warmup: 10, totalSlots: 90 })) // 70 nến, 60 hiện, 90 ô
  const config = flashbackConfig({ warmup: 10, barCount: 70, totalSlots: 90 })

  it("khung mặc định của cấu hình chính là khung vừa khít mọi ô của scene", () => {
    expect(data.count).toBe(60)
    expect(data.slots).toBe(90)
    const s = session(data, config)
    expect(s.state.viewport).toEqual({ from: -0.5, to: 89.5 })
    expect(s.frame.visible).toEqual({ first: 0, last: 59 })
    expect(config.readable).toEqual({ first: 0, last: 59 })
  })

  it("crosshair của bộ giảm khớp `indexAtPointer` của scene trên mọi vị trí con trỏ, ở mọi mức kéo", () => {
    const s = session(data, config)
    for (const viewport of [{ from: -0.5, to: 89.5 }, { from: 20, to: 70 }, { from: 40.3, to: 80.3 }]) {
      s.send({ type: "set-viewport", viewport })
      for (let x = 0; x <= s.frame.plot.right; x += 7) {
        s.send({ type: "pointer-move", pointer: s.at(x) })
        const expected = indexAtPointer(s.frame, { x, y: 100 })
        expect(s.state.crosshair?.bar ?? null, `x=${x} viewport=${viewport.from}`).toBe(expected)
      }
    }
  })

  it("không kéo qua nến đầu và không quá ô cuối, ở mọi cỡ zoom", () => {
    const s = session(data, config)
    s.send({ type: "wheel", wheel: { x: 300, y: 100, deltaX: 0, deltaY: -800, ctrlKey: true, target: s.at(300).target } })
    const span = s.state.viewport.to - s.state.viewport.from
    expect(span).toBeLessThan(90)
    s.send({ type: "pointer-down", pointer: s.at(100) })
    s.send({ type: "pointer-move", pointer: s.at(1e6) })
    expect(s.state.viewport.from).toBe(-0.5)
    s.send({ type: "pointer-up", pointer: s.at(1e6) })
    s.send({ type: "pointer-down", pointer: s.at(600) })
    s.send({ type: "pointer-move", pointer: s.at(-1e6) })
    expect(s.state.viewport.to).toBe(89.5)
    // Cạnh trái của khung thật luôn là mép trái của ô 0: không có phần nào của trục nằm trước nến đầu.
    expect(s.frame.price.coords.xOfIndex(-0.5)).toBeLessThanOrEqual(s.frame.plot.left + 1e-6)
  })

  it("hình vẽ: neo theo phiên trong [0, ô cuối], và lệnh vẽ của scene thật toàn số hữu hạn", () => {
    const s = session(data, config)
    s.send({ type: "tool", tool: "trend" })
    for (const x of [30, 600]) {
      s.send({ type: "pointer-down", pointer: s.at(x) })
      s.send({ type: "pointer-up", pointer: s.at(x) })
    }
    const [drawing] = s.state.drawings.shapes
    expect(drawing.anchors.every((a) => "session" in a && a.session >= 0 && a.session <= 89)).toBe(true)
    const commands = drawingCommands(s.state.drawings.shapes, s.frame.price.coords, { dpr: 1 })
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) if ("data" in command) for (let i = 0; i < command.count; i++) expect(Number.isFinite(command.data[i])).toBe(true)
  })
})

describe("market với scene thật", () => {
  const BARS = 200
  const build = (bars: readonly TimedBar[]) => createChartData(marketInput({ bars: [...bars], count: bars.length }))

  it("mở ở khung vừa khít của core, kéo ra khoảng trống bên phải được nhưng không vô hạn", () => {
    const data = build(makeTimedBars(BARS))
    const frame = frameOf(data, { viewport: { from: -0.5, to: BARS - 0.5 } })
    const width = frame.plot.right - frame.plot.left
    const spec = marketConfig({ barCount: BARS, defaultViewport: { from: 140, to: BARS + 10 } }).viewport
    const limits = limitsOf(spec, width)
    expect(fitViewport(limits)).toEqual({ from: -10.5, to: BARS + 19.5 })
    const s = session(data, marketConfig({ barCount: BARS, defaultViewport: { from: 140, to: BARS + 10 } }))
    s.send({ type: "pan", bars: 1e6 })
    expect(s.state.viewport.to).toBe(BARS + 19.5)
    s.send({ type: "pan", bars: -1e6 })
    expect(s.state.viewport.from).toBe(-10.5)
  })

  it("trong khoảng trống bên phải vẫn có crosshair (không có nến để đọc), scene tự ngoại suy chỉ số cho nhãn thời gian", () => {
    const data = build(makeTimedBars(BARS))
    const s = session(data, marketConfig({ barCount: BARS, defaultViewport: { from: 150, to: BARS + 15 } }))
    const x = s.frame.price.coords.xOfIndex(BARS + 5)
    s.send({ type: "pointer-move", pointer: s.at(x) })
    expect(s.state.crosshair).toMatchObject({ bar: null, source: "pointer" })
    expect(indexAtPointer(s.frame, { x, y: 100 })).toBe(BARS + 5)
    // Còn trong dải nến thì hai bên trùng nhau.
    const inside = s.frame.price.coords.xOfIndex(BARS - 3)
    s.send({ type: "pointer-move", pointer: s.at(inside) })
    expect(s.state.crosshair?.bar).toBe(BARS - 3)
    expect(indexAtPointer(s.frame, { x: inside, y: 100 })).toBe(BARS - 3)
  })

  it("hình neo theo thời gian đứng yên khi nạp thêm lịch sử phía trước (neo là time, không phải chỉ số)", () => {
    const all = makeTimedBars(BARS)
    const recent = all.slice(50)
    const s = session(build(recent), marketConfig({ barCount: recent.length, defaultViewport: { from: 0, to: recent.length - 0.5 } }))
    s.send({ type: "tool", tool: "trend" })
    for (const x of [100, 400]) {
      s.send({ type: "pointer-down", pointer: s.at(x) })
      s.send({ type: "pointer-up", pointer: s.at(x) })
    }
    const drawing = s.state.drawings.shapes[0]
    expect(drawing.anchors.every((a) => "time" in a)).toBe(true)
    const before = drawing.anchors.map((a) => s.frame.price.coords.indexOfAnchor(a))

    // Nạp thêm 50 nến cũ hơn: dữ liệu mới, viewport dời theo `shiftForPrepend`, hình giữ nguyên.
    const next = build(all)
    const shifted = shiftForPrepend(s.state.viewport, 50)
    const frame = frameOf(next, { viewport: shifted })
    const after = drawing.anchors.map((a) => frame.price.coords.indexOfAnchor(a))
    expect(after.map((v) => v! - 50)).toEqual(before.map((v) => expect.closeTo(v!, 6)))
    // Cùng vị trí trên màn hình trước và sau khi nạp thêm.
    const xs = drawing.anchors.map((a) => s.frame.price.coords.xOfIndex(s.frame.price.coords.indexOfAnchor(a)!))
    const xsAfter = drawing.anchors.map((a) => frame.price.coords.xOfIndex(frame.price.coords.indexOfAnchor(a)!))
    xsAfter.forEach((x, i) => expect(x).toBeCloseTo(xs[i], 6))
  })

  it("nhấp trên nến nào thì hút OHLC của nến đó (chỉ số của scene khớp `raw`)", () => {
    const bars = makeTimedBars(60)
    const data = build(bars)
    const s = session(data, marketConfig({ barCount: 60, defaultViewport: { from: -0.5, to: 59.5 } }))
    s.send({ type: "magnet", on: true })
    s.send({ type: "tool", tool: "horizontal" })
    const x = s.frame.price.coords.xOfIndex(30)
    const y = s.frame.price.coords.yOfPrice(bars[30].high) - 3
    s.send({ type: "pointer-down", pointer: { ...s.at(x), y } })
    s.send({ type: "pointer-up", pointer: { ...s.at(x), y } })
    const [anchor] = s.state.drawings.shapes[0].anchors
    expect((anchor as { price: number }).price).toBeCloseTo(bars[30].high, 6)
  })

  it("kéo trục giá đổi hệ số, và `manualPriceRange` biến hệ số thành dải giá của scene (tâm giữ nguyên)", () => {
    const data = build(makeTimedBars(60))
    const s = session(data, marketConfig({ barCount: 60, defaultViewport: { from: -0.5, to: 59.5 } }))
    const axis = { region: "price-axis" as const, paneKind: "price" as const, paneKey: "price" }
    const auto = s.frame.price.range
    expect(manualPriceRange(auto, s.state.priceScale.price)).toBeNull()
    s.send({ type: "pointer-down", pointer: s.at(760, { target: axis }) })
    s.send({ type: "pointer-move", pointer: s.at(760, { target: axis, y: s.at(760).y + 80 }) })
    s.send({ type: "pointer-up", pointer: s.at(760, { target: axis, y: s.at(760).y + 80 }) })
    const factor = s.state.priceScale.price
    expect(factor).toBeDefined()
    expect(factor).not.toBe(1)
    const manual = manualPriceRange(auto, factor)!
    expect(manual.high - manual.low).toBeCloseTo((auto.high - auto.low) * factor!, 6)
    expect((manual.high + manual.low) / 2).toBeCloseTo((auto.high + auto.low) / 2, 6)
    const framed = frameOf(data, { viewport: s.state.viewport, manualPriceRange: manual })
    expect(framed.price.range.high - framed.price.range.low).toBeCloseTo(manual.high - manual.low, 6)
  })
})
