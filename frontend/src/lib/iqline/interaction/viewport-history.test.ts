/** Phép tính viewport, giới hạn của từng chế độ, và ngăn xếp hoàn tác có giới hạn. */
import { describe, expect, it } from "vitest"

import { canRedo, canUndo, createHistory, createViewportOps, flashbackBounds, marketBounds, recordHistory, redoHistory, undoHistory } from "./index"

describe("viewport", () => {
  const ops = createViewportOps({ minFrom: 0, maxTo: 100, minSpan: 10, maxSpan: 100 })

  it("kẹp độ rộng và hai mép; giữ độ rộng khi chạm biên", () => {
    expect(ops.clamp({ from: -5, to: 25 })).toEqual({ from: 0, to: 30 })
    expect(ops.clamp({ from: 80, to: 120 })).toEqual({ from: 60, to: 100 })
    expect(ops.clamp({ from: 10, to: 12 })).toEqual({ from: 10, to: 20 })
    expect(ops.clamp({ from: 0, to: 500 })).toEqual({ from: 0, to: 100 })
    expect(ops.clamp({ from: Number.NaN, to: Number.NaN })).toEqual({ from: 0, to: 100 })
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
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, 100)).toEqual({ from: 45, to: 55 })
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, 0.0001)).toEqual({ from: 0, to: 100 })
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, Number.NaN)).toEqual({ from: 40, to: 60 })
    expect(ops.zoom({ from: 40, to: 60 }, 0.5, -1)).toEqual({ from: 40, to: 60 })
  })

  it("kéo giữ độ rộng và dừng ở biên", () => {
    expect(ops.pan({ from: 40, to: 60 }, 5)).toEqual({ from: 45, to: 65 })
    expect(ops.pan({ from: 40, to: 60 }, -500)).toEqual({ from: 0, to: 20 })
    expect(ops.pan({ from: 40, to: 60 }, 500)).toEqual({ from: 80, to: 100 })
    expect(ops.pan({ from: 40, to: 60 }, Number.NaN)).toEqual({ from: 40, to: 60 })
  })

  it("chế độ market chừa chỗ trống hai đầu; flashback bắt đầu ở warmup và hết ở ô cuối của trục", () => {
    expect(marketBounds({ barCount: 200 })).toEqual({ minFrom: -10, maxTo: 220, minSpan: 5, maxSpan: 230 })
    expect(flashbackBounds({ warmup: 40, totalSlots: 160 })).toEqual({ minFrom: 40, maxTo: 160, minSpan: 10, maxSpan: 120 })
  })

  it("biên suy biến (không còn ô nào) không sinh NaN", () => {
    const empty = createViewportOps(flashbackBounds({ warmup: 40, totalSlots: 40 }))
    const out = empty.clamp({ from: 0, to: 100 })
    expect(Number.isFinite(out.from) && Number.isFinite(out.to)).toBe(true)
    expect(out.from).toBe(40)
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
