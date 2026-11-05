/** Cầu nối viewport với `core/viewport.ts`, giới hạn của từng chế độ, và ngăn xếp hoàn tác có giới hạn. */
import { describe, expect, it } from "vitest"

import { fitViewport } from "../core/viewport"
import {
  canRedo,
  canUndo,
  createHistory,
  flashbackConfig,
  limitsOf,
  manualPriceRange,
  marketConfig,
  opsFor,
  recordHistory,
  redoHistory,
  staticConfig,
  undoHistory,
} from "./index"

describe("viewport theo core", () => {
  // 100 ô, không chừa trống: giới hạn [-0,5; 99,5]; số nến hiện tối thiểu = 400 / 40 = 10.
  const spec = { slots: 100, leftPad: 0, rightPad: 0 }
  const ops = opsFor(spec, 400)

  it("giới hạn lấy từ core: số nguyên là tâm nến, vừa khít là {-0,5, n - 0,5}", () => {
    expect(limitsOf(spec, 400)).toMatchObject({ min: -0.5, max: 99.5, minSpan: 10, maxSpan: 100 })
    expect(fitViewport(limitsOf(spec, 400))).toEqual({ from: -0.5, to: 99.5 })
  })

  it("kẹp độ rộng và hai mép; giữ độ rộng khi chạm biên", () => {
    expect(ops.clamp({ from: -5, to: 25 })).toEqual({ from: -0.5, to: 29.5 })
    expect(ops.clamp({ from: 80, to: 120 })).toEqual({ from: 59.5, to: 99.5 })
    expect(ops.clamp({ from: 10, to: 12 })).toEqual({ from: 10, to: 20 })
    expect(ops.clamp({ from: 0, to: 500 })).toEqual({ from: -0.5, to: 99.5 })
  })

  it("viewport hỏng không sinh NaN: coi như nhìn hết trục", () => {
    expect(ops.clamp({ from: Number.NaN, to: Number.NaN })).toEqual({ from: -0.5, to: 99.5 })
    expect(ops.clamp({ from: 50, to: 10 })).toEqual({ from: -0.5, to: 99.5 })
    expect(ops.pan({ from: Number.NaN, to: 1 }, 5)).toEqual({ from: -0.5, to: 99.5 })
  })

  it("zoom giữ nguyên chỉ số tại vị trí đã chọn", () => {
    const next = ops.zoom({ from: 20, to: 80 }, 0.25, 2)
    expect(next.to - next.from).toBeCloseTo(30, 9)
    expect(next.from + 0.25 * 30).toBeCloseTo(20 + 0.25 * 60, 9)
    const out = ops.zoom({ from: 40, to: 60 }, 1, 0.5)
    expect(out.to).toBeCloseTo(60, 9)
    expect(out.to - out.from).toBeCloseTo(40, 9)
  })

  it("zoom không vượt giới hạn độ rộng; hệ số hỏng thì giữ nguyên", () => {
    const near = ops.zoom({ from: 40, to: 60 }, 0.5, 100)
    expect(near.to - near.from).toBeCloseTo(10, 9)
    expect(near.from + 5).toBeCloseTo(50, 9)
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, 0.0001)).toEqual({ from: -0.5, to: 99.5 })
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, Number.NaN)).toEqual({ from: 40, to: 60 })
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, -1)).toEqual({ from: 40, to: 60 })
  })

  it("kéo giữ độ rộng và dừng ở biên", () => {
    expect(ops.pan({ from: 40, to: 60 }, 5)).toEqual({ from: 45, to: 65 })
    expect(ops.pan({ from: 40, to: 60 }, -500)).toEqual({ from: -0.5, to: 19.5 })
    expect(ops.pan({ from: 40, to: 60 }, 500)).toEqual({ from: 79.5, to: 99.5 })
    expect(ops.pan({ from: 40, to: 60 }, Number.NaN)).toEqual({ from: 40, to: 60 })
  })

  it("cấu hình từng chế độ: market chừa chỗ trống hai đầu, flashback và static không chừa", () => {
    expect(marketConfig({ barCount: 200, defaultViewport: { from: 140, to: 200 } }).viewport).toEqual({ slots: 200, leftPad: 10, rightPad: 20 })
    expect(marketConfig({ barCount: 200, defaultViewport: { from: 140, to: 200 }, leftPad: 3, rightPad: 7 }).viewport).toEqual({ slots: 200, leftPad: 3, rightPad: 7 })
    expect(flashbackConfig({ warmup: 40, barCount: 100, totalSlots: 160 }).viewport).toEqual({ slots: 160, leftPad: 0, rightPad: 0 })
    expect(staticConfig({ barCount: 30, viewport: { from: -0.5, to: 29.5 } }).viewport).toEqual({ slots: 30, leftPad: 0, rightPad: 0 })
  })

  it("trục ô suy biến (không còn ô nào) không sinh NaN", () => {
    const empty = opsFor({ slots: 0, leftPad: 0, rightPad: 0 }, 400)
    const out = empty.clamp({ from: 0, to: 100 })
    expect(Number.isFinite(out.from) && Number.isFinite(out.to)).toBe(true)
  })
})

describe("co giãn trục giá tay", () => {
  const auto = { low: 90, high: 110 }
  it("hệ số bằng 1 hoặc vắng mặt thì để tự co giãn (null)", () => {
    expect(manualPriceRange(auto, undefined)).toBeNull()
    expect(manualPriceRange(auto, 1)).toBeNull()
    expect(manualPriceRange(auto, Number.NaN)).toBeNull()
    expect(manualPriceRange(auto, 0)).toBeNull()
  })
  it("hệ số nhân khoảng giá quanh tâm: lớn hơn 1 thu nhỏ biểu đồ, nhỏ hơn 1 phóng to", () => {
    expect(manualPriceRange(auto, 2)).toEqual({ low: 80, high: 120 })
    expect(manualPriceRange(auto, 0.5)).toEqual({ low: 95, high: 105 })
  })
})

describe("hoàn tác và làm lại", () => {
  it("ghi, lùi, tiến theo đúng thứ tự", () => {
    let history = createHistory<string>()
    history = recordHistory(history, "a")
    history = recordHistory(history, "b")
    const first = undoHistory(history, "c")
    expect(first?.value).toBe("b")
    const second = undoHistory(first!.history, "b")
    expect(second?.value).toBe("a")
    const redo = redoHistory(second!.history, "a")
    expect(redo?.value).toBe("b")
    expect(redoHistory(redo!.history, "b")?.value).toBe("c")
  })

  it("hết bước thì trả về null; canUndo và canRedo đúng", () => {
    const empty = createHistory<number>()
    expect(undoHistory(empty, 1)).toBeNull()
    expect(redoHistory(empty, 1)).toBeNull()
    expect(canUndo(empty)).toBe(false)
    const one = recordHistory(empty, 1)
    expect(canUndo(one)).toBe(true)
    expect(canRedo(undoHistory(one, 2)!.history)).toBe(true)
  })

  it("sửa mới sau khi hoàn tác xoá các bước làm lại", () => {
    let history = recordHistory(createHistory<string>(), "a")
    history = undoHistory(history, "b")!.history
    expect(canRedo(history)).toBe(true)
    history = recordHistory(history, "x")
    expect(canRedo(history)).toBe(false)
  })

  it("ngăn xếp có giới hạn: bước cũ nhất bị bỏ", () => {
    let history = createHistory<number>(3)
    for (let i = 1; i <= 5; i++) history = recordHistory(history, i)
    expect(history.past).toEqual([3, 4, 5])
    let present = 6
    const seen: number[] = []
    for (let step = undoHistory(history, present); step; step = undoHistory(step.history, present)) {
      seen.push(step.value)
      present = step.value
    }
    expect(seen).toEqual([5, 4, 3])
  })

  it("giới hạn tối thiểu là một bước", () => {
    expect(createHistory(0).limit).toBe(1)
  })
})
