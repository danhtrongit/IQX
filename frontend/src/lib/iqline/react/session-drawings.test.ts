import { describe, expect, it, vi } from "vitest"

import type { Drawing } from "../types"
import { createSessionDrawings } from "./session-drawings"

const shape = (id: string): Drawing => ({ id, tool: "trend", anchors: [{ session: 1, price: 100 }, { session: 5, price: 110 }], style: { color: "chart-1", width: 1.5 } }) as Drawing

describe("SessionDrawingController", () => {
  it("bắt đầu rỗng; không có biểu đồ gắn thì mọi thao tác bị bỏ qua và không báo lỗi", () => {
    const drawings = createSessionDrawings()
    expect(drawings.getSnapshot()).toEqual({ tool: null, selectedId: null, shapes: [], pending: false })
    drawings.toggleTool("trend")
    drawings.cancel()
    expect(drawings.removeSelected()).toBe(false)
    expect(drawings.clear().message).toBe("Chưa có hình vẽ")
  })

  it("report đổi snapshot và báo người nghe; báo lại trạng thái y hệt thì không báo thêm", () => {
    const drawings = createSessionDrawings()
    const listener = vi.fn()
    const off = drawings.subscribe(listener)
    const shapes = [shape("d1")]
    drawings.report({ tool: null, selectedId: "d1", shapes, pending: null })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(drawings.getSnapshot()).toMatchObject({ selectedId: "d1", pending: false })
    drawings.report({ tool: null, selectedId: "d1", shapes, pending: null })
    expect(listener).toHaveBeenCalledTimes(1)
    drawings.report({ tool: "trend", selectedId: "d1", shapes, pending: { tool: "trend", anchors: [] } as never })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(drawings.getSnapshot()).toMatchObject({ tool: "trend", pending: true })
    off()
    drawings.report({ tool: null, selectedId: null, shapes: [], pending: null })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("thao tác của trang đi qua sink của biểu đồ: công cụ, huỷ, xoá hình chọn, nút Xoá", () => {
    const drawings = createSessionDrawings()
    const dispatch = vi.fn()
    drawings.attach({ dispatch })
    drawings.toggleTool("fib-retracement")
    expect(dispatch).toHaveBeenLastCalledWith({ type: "tool", tool: "fib-retracement" })
    // Không đang vẽ và không có công cụ thì Esc không gửi gì.
    dispatch.mockClear()
    drawings.cancel()
    expect(dispatch).not.toHaveBeenCalled()
    drawings.report({ tool: "trend", selectedId: null, shapes: [], pending: null })
    drawings.cancel()
    expect(dispatch).toHaveBeenLastCalledWith({ type: "drawing", action: { type: "cancel" } })
    drawings.report({ tool: null, selectedId: "d1", shapes: [shape("d1"), shape("d2")], pending: null })
    expect(drawings.removeSelected()).toBe(true)
    expect(dispatch).toHaveBeenLastCalledWith({ type: "drawing", action: { type: "remove", id: "d1" } })
    expect(drawings.clear().message).toBe("Đã xoá hình vẽ")
    drawings.report({ tool: null, selectedId: null, shapes: [shape("d1"), shape("d2")], pending: null })
    expect(drawings.clear().message).toBe("Đã xoá 2 hình vẽ")
  })

  it("gắn lại vào biểu đồ mới thì nạp lại các hình đã giữ; gỡ ra thì không còn gửi hành động", () => {
    const drawings = createSessionDrawings()
    const shapes = [shape("d1")]
    drawings.report({ tool: null, selectedId: null, shapes, pending: null })
    const first = vi.fn()
    drawings.attach({ dispatch: first })
    expect(first).toHaveBeenCalledWith({ type: "set-drawings", drawings: shapes })
    drawings.attach(null)
    drawings.toggleTool("trend")
    expect(first).toHaveBeenCalledTimes(1)
  })
})
