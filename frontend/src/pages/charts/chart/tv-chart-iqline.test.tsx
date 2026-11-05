/**
 * TradingView và IQLine dùng chung một bản ghi hình vẽ theo mã (docs/iqline-design.md §11). TradingView phải nhận `state` có thêm khoá
 * `iqline` mà không hỏng, và khi nó ghi lại (`widget.save` trả về trạng thái không có khoá đó) thì phần của IQLine không bị mất.
 */
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { carryIQLineState, type DrawingPersistence } from "./drawing-persistence"
import { TVChart } from "./tv-chart"

const mocks = vi.hoisted(() => ({ loadChartingLibrary: vi.fn() }))

vi.mock("./tradingview", async (importOriginal) => ({ ...(await importOriginal<typeof import("./tradingview")>()), loadChartingLibrary: mocks.loadChartingLibrary }))

const IQLINE = { version: 1, drawings: [{ id: "d1", tool: "trend" }], indicators: [{ key: "volume", id: "volume", params: {} }], chartType: "candles" }

type FakeWidget = {
  options: Record<string, unknown>
  handlers: Map<string, () => void>
  saved: ((state: Record<string, unknown>) => void) | null
}
const widgets: FakeWidget[] = []

beforeEach(() => {
  widgets.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  mocks.loadChartingLibrary.mockResolvedValue({
    widget: class {
      private readonly info: FakeWidget
      constructor(options: Record<string, unknown>) {
        this.info = { options, handlers: new Map(), saved: null }
        widgets.push(this.info)
      }
      onChartReady(callback: () => void) {
        callback()
      }
      activeChart() {
        return { onSymbolChanged: () => ({ subscribe: vi.fn() }), symbolExt: () => ({ symbol: "FPT" }) }
      }
      subscribe(event: string, handler: () => void) {
        this.info.handlers.set(event, handler)
      }
      save(callback: (state: Record<string, unknown>) => void) {
        callback({ charts: [{ panes: [] }] })
      }
      applyOverrides() {}
      changeTheme() {}
      remove() {}
    },
  })
})
afterEach(() => vi.restoreAllMocks())

function persistence(stored: Record<string, unknown> | null): DrawingPersistence & { saved: ReturnType<typeof vi.fn> } {
  const saved = vi.fn()
  return { load: vi.fn(async () => stored), save: saved, saved } as never
}

describe("TradingView với khoá iqline trong state", () => {
  it("nhận saved_data có thêm khoá iqline (phần của TradingView vẫn nguyên)", async () => {
    const stored = { charts: [{ panes: [] }], iqline: IQLINE }
    render(<TVChart symbol="FPT" interval="D" theme="dark" persistence={persistence(stored)} />)
    await waitFor(() => expect(widgets).toHaveLength(1))
    const savedData = widgets[0].options.saved_data as Record<string, unknown>
    expect(savedData).toEqual(stored)
    expect(savedData.iqline).toEqual(IQLINE)
    expect(Array.isArray(savedData.charts)).toBe(true)
  })

  it("lần ghi tiếp theo của TradingView giữ lại phần iqline đã nạp", async () => {
    const persist = persistence({ charts: [{ panes: [] }], iqline: IQLINE })
    render(<TVChart symbol="FPT" interval="D" theme="dark" persistence={persist} />)
    await waitFor(() => expect(widgets).toHaveLength(1))
    await waitFor(() => expect(widgets[0].handlers.has("drawing_event")).toBe(true))
    widgets[0].handlers.get("drawing_event")!()
    await waitFor(() => expect(persist.saved).toHaveBeenCalled(), { timeout: 3000 })
    expect(persist.saved).toHaveBeenCalledWith("FPT", { charts: [{ panes: [] }], iqline: IQLINE })
  })

  it("mã chưa có phần iqline thì không thêm khoá thừa", async () => {
    const persist = persistence({ charts: [{ panes: [] }] })
    render(<TVChart symbol="FPT" interval="D" theme="dark" persistence={persist} />)
    await waitFor(() => expect(widgets).toHaveLength(1))
    await waitFor(() => expect(widgets[0].handlers.has("drawing_event")).toBe(true))
    widgets[0].handlers.get("drawing_event")!()
    await waitFor(() => expect(persist.saved).toHaveBeenCalled(), { timeout: 3000 })
    expect(persist.saved.mock.calls[0][1]).toEqual({ charts: [{ panes: [] }] })
    expect("iqline" in (persist.saved.mock.calls[0][1] as object)).toBe(false)
  })
})

describe("carryIQLineState", () => {
  it("gắn lại phần iqline vào state mới", () => {
    expect(carryIQLineState({ charts: [] }, IQLINE)).toEqual({ charts: [], iqline: IQLINE })
  })
  it("không có gì để gắn thì trả đúng state cũ", () => {
    const state = { charts: [] }
    expect(carryIQLineState(state, undefined)).toBe(state)
    expect(carryIQLineState(state, null)).toBe(state)
  })
})
