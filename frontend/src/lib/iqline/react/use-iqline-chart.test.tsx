import { act, render } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TOOL_SPECS } from "../drawings"
import { makeTimedBars } from "../scene/test-support"
import type { Drawing, TimedBar } from "../types"
import { IQLineCanvasView } from "./IQLineCanvas"
import { installCanvasEnv, type CanvasEnv } from "./test-env"
import { defaultVisible, useIQLineChart, type IQLineChart, type MarketChartOptions } from "./use-iqline-chart"

let env: CanvasEnv
beforeEach(() => {
  env = installCanvasEnv()
})
afterEach(() => vi.unstubAllGlobals())

const ALL = makeTimedBars(260, "D")
let chart: IQLineChart

function Harness(props: Partial<MarketChartOptions> & { bars: readonly TimedBar[] }) {
  const current = useIQLineChart({ mode: "market", theme: "dark", interval: "D", ...props })
  // Test đọc kết quả mới nhất của hook từ bên ngoài; gán trong effect (không gán lúc render).
  useEffect(() => {
    chart = current
  })
  return <IQLineCanvasView chart={current} />
}

const trend = (id: string): Drawing => ({ id, tool: "trend", anchors: [{ time: ALL[200].time, price: 100 }, { time: ALL[230].time, price: 110 }], style: { ...TOOL_SPECS.trend.defaultStyle } })

function setup(initial: readonly TimedBar[], extra: Partial<MarketChartOptions> = {}) {
  const view = render(<Harness bars={initial} resetKey="FPT|D" documentKey="FPT" {...extra} />)
  env.measure(900, 600)
  const update = (props: Partial<MarketChartOptions> & { bars: readonly TimedBar[] }) => view.rerender(<Harness resetKey="FPT|D" documentKey="FPT" {...extra} {...props} />)
  return { ...view, update }
}

describe("useIQLineChart: viewport", () => {
  it("chưa có nến thì chưa có khung hình; có nến và đã đo thì chọn khung mặc định cuối dữ liệu", () => {
    const { update } = setup([])
    expect(chart.frame).not.toBeNull()
    expect(chart.data.count).toBe(0)
    update({ bars: ALL.slice(0, 200) })
    expect(chart.data.count).toBe(200)
    expect(chart.viewport.to).toBeGreaterThan(199)
    expect(chart.viewport.to - chart.viewport.from).toBeCloseTo(120, 0)
  })

  it("nạp thêm lịch sử vào đầu dịch viewport đúng số nến để hình đứng yên", () => {
    const { update } = setup(ALL.slice(60, 200))
    const before = chart.viewport
    update({ bars: ALL.slice(30, 200) })
    expect(chart.viewport.from).toBeCloseTo(before.from + 30)
    expect(chart.viewport.to).toBeCloseTo(before.to + 30)
  })

  it("nến mới ở cuối: đang xem tới nến cuối thì đi theo, đã kéo đi chỗ khác thì đứng yên", () => {
    const { update } = setup(ALL.slice(0, 200))
    const before = chart.viewport
    update({ bars: ALL.slice(0, 201) })
    expect(chart.viewport.to).toBeCloseTo(before.to + 1)
    act(() => chart.controller.dispatch({ type: "pan", bars: -60 }))
    const panned = chart.viewport
    update({ bars: ALL.slice(0, 202) })
    expect(chart.viewport).toEqual(panned)
  })

  it("đổi resetKey (mã hoặc khung) về viewport mặc định của dữ liệu mới", () => {
    const { update } = setup(ALL.slice(0, 200))
    act(() => chart.controller.dispatch({ type: "pan", bars: -80 }))
    expect(chart.viewport.to).toBeLessThan(150)
    update({ bars: ALL.slice(0, 240), resetKey: "VN30|D" })
    expect(chart.viewport.to).toBeGreaterThan(239)
  })

  it("nút về mặc định (reset) đưa viewport về khung mặc định của cấu hình", () => {
    setup(ALL.slice(0, 200))
    const initial = chart.viewport
    act(() => chart.controller.dispatch({ type: "pan", bars: -50 }))
    act(() => chart.controller.dispatch({ type: "reset" }))
    expect(chart.viewport.from).toBeCloseTo(initial.from)
    expect(chart.viewport.to).toBeCloseTo(initial.to)
  })
})

describe("useIQLineChart: hình vẽ và vòng đời", () => {
  it("đổi resetKey giữ hình vẽ; đổi documentKey bỏ hình và lịch sử hoàn tác", () => {
    const { update } = setup(ALL.slice(0, 250))
    act(() => chart.controller.dispatch({ type: "set-drawings", drawings: [trend("d1")] }))
    update({ bars: ALL.slice(0, 250), resetKey: "FPT|5" })
    expect(chart.state.drawings.shapes).toHaveLength(1)
    update({ bars: ALL.slice(0, 250), resetKey: "VN30|5", documentKey: "VN30" })
    expect(chart.state.drawings.shapes).toHaveLength(0)
    expect(chart.canUndo).toBe(false)
  })

  it("onDrawingsChange chạy khi người dùng sửa và khi hoàn tác, không chạy khi nạp từ kho", () => {
    const onDrawingsChange = vi.fn()
    setup(ALL.slice(0, 250), { onDrawingsChange })
    act(() => chart.controller.dispatch({ type: "set-drawings", drawings: [trend("d1")] }))
    expect(onDrawingsChange).not.toHaveBeenCalled()
    act(() => chart.controller.dispatch({ type: "drawing", action: { type: "remove", id: "d1" } }))
    expect(onDrawingsChange).toHaveBeenLastCalledWith([])
    act(() => chart.controller.dispatch({ type: "undo" }))
    expect(onDrawingsChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: "d1" })])
  })

  it("đổi hàm callback không dựng lại canvas", () => {
    const view = setup(ALL.slice(0, 250), { onDrawingsChange: vi.fn(), onViewportChange: vi.fn() })
    const canvas = view.container.querySelector('canvas[data-iqline-layer="top"]')
    view.update({ bars: ALL.slice(0, 250), onDrawingsChange: vi.fn(), onViewportChange: vi.fn(), onMarkClick: vi.fn() })
    expect(view.container.querySelector('canvas[data-iqline-layer="top"]')).toBe(canvas)
    expect(view.container.querySelectorAll("canvas")).toHaveLength(4)
  })

  it("callback mới nhất là cái được gọi", () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = setup(ALL.slice(0, 250), { onViewportChange: first })
    view.update({ bars: ALL.slice(0, 250), onViewportChange: second })
    act(() => chart.controller.dispatch({ type: "pan", bars: -5 }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("đổi giao diện không đổi viewport, hình vẽ hay công cụ đang chọn", () => {
    const view = setup(ALL.slice(0, 250))
    act(() => chart.controller.dispatch({ type: "set-drawings", drawings: [trend("d1")] }))
    act(() => chart.controller.dispatch({ type: "tool", tool: "horizontal" }))
    act(() => chart.controller.dispatch({ type: "pan", bars: -20 }))
    const { viewport } = chart
    view.update({ bars: ALL.slice(0, 250), theme: "light" })
    expect(chart.viewport).toEqual(viewport)
    expect(chart.state.drawings.shapes).toHaveLength(1)
    expect(chart.state.drawings.tool).toBe("horizontal")
  })
})

describe("useIQLineChart: chỉ báo và dữ liệu", () => {
  it("chỉ tính lại chỉ báo khi đầu vào đổi, không tính lại khi zoom hay kéo", () => {
    const view = setup(ALL.slice(0, 250), { indicatorInputs: [{ key: "ema", id: "ema", params: { period: 20 } }] })
    const before = chart.data
    act(() => chart.controller.dispatch({ type: "pan", bars: -10 }))
    act(() => chart.controller.dispatch({ type: "zoom", direction: "in" }))
    expect(chart.data).toBe(before)
    view.update({ bars: ALL.slice(0, 250), indicatorInputs: [{ key: "ema", id: "ema", params: { period: 21 } }] })
    expect(chart.data).not.toBe(before)
    expect(chart.data.indicators[0].name).toBe("EMA (21)")
  })

  it("Volume Profile tính theo viewport: đổi khung nhìn thì đổi profile, không đổi thì giữ nguyên", () => {
    setup(ALL.slice(0, 250), { indicatorInputs: [{ key: "vp", id: "volume_profile", params: {} }] })
    const first = chart.data.indicators[0].plot
    expect(first.profile?.rows.length).toBeGreaterThan(0)
    act(() => chart.controller.dispatch({ type: "pan", bars: -40 }))
    expect(chart.data.indicators[0].plot).not.toBe(first)
  })

  it("giá trị của chú giải theo nến cuối khi không có crosshair, theo nến dưới con trỏ khi có", () => {
    setup(ALL.slice(0, 250))
    expect(chart.values?.index).toBe(249)
    const frame = chart.controller.getFrame()!
    act(() =>
      chart.controller.dispatch({
        type: "pointer-move",
        pointer: { pointerId: 1, pointerType: "mouse", x: frame.price.coords.xOfIndex(240), y: 50, target: chart.controller.targetAt(frame.price.coords.xOfIndex(240), 50) },
      }),
    )
    expect(chart.values?.index).toBe(240)
  })

  it("onCrosshairChange chỉ chạy khi đổi nến", () => {
    const onCrosshairChange = vi.fn()
    setup(ALL.slice(0, 250), { onCrosshairChange })
    const frame = chart.controller.getFrame()!
    const move = (index: number, dx = 0) => {
      const x = frame.price.coords.xOfIndex(index) + dx
      act(() => chart.controller.dispatch({ type: "pointer-move", pointer: { pointerId: 1, pointerType: "mouse", x, y: 50, target: chart.controller.targetAt(x, 50) } }))
    }
    move(240)
    move(240, 1)
    expect(onCrosshairChange).toHaveBeenCalledTimes(1)
    move(241)
    expect(onCrosshairChange).toHaveBeenCalledTimes(2)
    act(() => chart.controller.dispatch({ type: "pointer-leave" }))
    expect(onCrosshairChange).toHaveBeenLastCalledWith(null)
  })
})

describe("ChartController", () => {
  it("phím tắt: trả true khi đã xử lý; phím lạ trả false", () => {
    setup(ALL.slice(0, 250))
    expect(chart.controller.key({ key: "+" })).toBe(true)
    expect(chart.controller.key({ key: "q" })).toBe(false)
  })

  it("con lăn trên khung vẽ zoom và trả true; ngoài biểu đồ trả false", () => {
    setup(ALL.slice(0, 250))
    const before = chart.viewport
    const frame = chart.controller.getFrame()!
    let handled = false
    act(() => void (handled = chart.controller.wheel({ x: frame.price.coords.xOfIndex(200), y: 100, deltaX: 0, deltaY: -100 })))
    expect(handled).toBe(true)
    expect(chart.viewport).not.toEqual(before)
    act(() => void (handled = chart.controller.wheel({ x: -10, y: -10, deltaX: 0, deltaY: -100 })))
    expect(handled).toBe(false)
  })

  it("kéo đổi chiều cao ô: cập nhật bố cục và báo ra ngoài", () => {
    const onPaneHeightsChange = vi.fn()
    setup(ALL.slice(0, 250), { indicatorInputs: [{ key: "rsi", id: "rsi", params: {} }], onPaneHeightsChange })
    const before = chart.controller.getFrame()!.panes.map((pane) => pane.box.height)
    act(() => chart.controller.setPaneHeights({ irsi: 200 }))
    expect(onPaneHeightsChange).toHaveBeenCalledWith({ irsi: 200 })
    expect(chart.controller.getFrame()!.panes.map((pane) => pane.box.height)).not.toEqual(before)
  })

  it("ảnh chụp ghép bốn lớp trên nền đã cho", async () => {
    const view = setup(ALL.slice(0, 250))
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })))
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob)
    env.context.calls.length = 0
    const blob = await chart.controller.snapshot("rgb(1, 2, 3)")
    expect(blob.type).toBe("image/png")
    const calls = env.context.calls.map((call) => call[0])
    expect(calls.filter((name) => name === "drawImage")).toHaveLength(4)
    expect(calls.indexOf("fillRect")).toBeLessThan(calls.indexOf("drawImage"))
    view.unmount()
    await expect(chart.controller.snapshot("#fff")).rejects.toThrow()
  })
})

describe("defaultVisible", () => {
  it("máy tính giữ 120 nến, màn hình hẹp hiện ít hơn để nến còn có thân", () => {
    expect(defaultVisible(850)).toBe(120)
    expect(defaultVisible(230)).toBe(46)
    expect(defaultVisible(1)).toBe(20)
  })
})
