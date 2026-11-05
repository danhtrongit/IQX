import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeContext, named, type FakeContext } from "../render/test-support"
import { ict, makeBars, makeTimedBars } from "../scene/test-support"
import type { IndexValues } from "../scene/values"
import type { TimedBar, Viewport } from "../types"
import { AXIS_RIGHT, IQLineCanvas, type IQLineCanvasProps } from "./IQLineCanvas"

let context: FakeContext
let frames: FrameRequestCallback[]
let observers: { callback: ResizeObserverCallback; disconnected: boolean }[]

beforeEach(() => {
  frames = []
  observers = []
  context = fakeContext()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { callback: ResizeObserverCallback; disconnected: boolean }
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, disconnected: false }
        observers.push(this.entry)
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const measure = (width: number, height: number) =>
  act(() => {
    for (const observer of observers) observer.callback([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
  })

const flush = () =>
  act(() => {
    const pending = frames.splice(0)
    pending.forEach((callback) => callback(0))
  })

const marketProps = (overrides: Partial<Extract<IQLineCanvasProps, { mode: "market" }>> = {}): IQLineCanvasProps => ({
  mode: "market",
  theme: "dark",
  bars: makeTimedBars(300),
  interval: "5",
  ...overrides,
})

const flashbackProps = (overrides: Partial<Extract<IQLineCanvasProps, { mode: "flashback" }>> = {}): IQLineCanvasProps => ({
  mode: "flashback",
  theme: "dark",
  bars: makeBars(70),
  warmup: 10,
  totalSlots: 90,
  formatX: (session) => `Phiên ${session}`,
  ...overrides,
})

const top = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
const move = (canvas: HTMLElement, x: number, y = 100) => act(() => void canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true })))

describe("IQLineCanvas: vỏ React tối thiểu", () => {
  it("dựng bốn lớp canvas trong một khung có role img và nhãn tiếp cận", () => {
    const { container } = render(<IQLineCanvas {...marketProps()} />)
    expect([...container.querySelectorAll("canvas")].map((canvas) => canvas.dataset.iqlineLayer)).toEqual(["base", "data", "drawings", "top"])
    const host = container.firstElementChild as HTMLElement
    expect(host.getAttribute("role")).toBe("img")
    expect(host.getAttribute("aria-label")).toBe("Biểu đồ nến")
    expect(host.tabIndex).toBe(0)
  })

  it("theo kích thước đo được: canvas nhân DPR (giới hạn 2), rồi vẽ nến và trục trong một rAF", () => {
    vi.stubGlobal("devicePixelRatio", 3)
    const { container } = render(<IQLineCanvas {...marketProps()} />)
    measure(600, 400)
    const canvases = [...container.querySelectorAll("canvas")]
    expect(canvases.every((canvas) => canvas.width === 1200 && canvas.height === 800)).toBe(true)
    expect(frames).toHaveLength(1)
    flush()
    expect(named(context, "fillRect").length).toBeGreaterThan(100)
    expect(named(context, "fillText").length).toBeGreaterThan(3)
  })

  it("chưa đo được kích thước thì chưa vẽ gì", () => {
    render(<IQLineCanvas {...marketProps()} />)
    flush()
    expect(named(context, "fillRect")).toHaveLength(0)
  })

  it("gỡ ra thì bỏ canvas và ngắt ResizeObserver", () => {
    const { container, unmount } = render(<IQLineCanvas {...marketProps()} />)
    measure(600, 400)
    unmount()
    expect(container.querySelectorAll("canvas")).toHaveLength(0)
    expect(observers.every((observer) => observer.disconnected)).toBe(true)
  })

  it("di chuột chỉ vẽ lại lớp trên cùng và báo giá trị tại nến dưới con trỏ", () => {
    const onCrosshairChange = vi.fn<(values: IndexValues | null) => void>()
    const { container } = render(<IQLineCanvas {...marketProps({ onCrosshairChange })} />)
    measure(800, 500)
    flush()
    const before = named(context, "fillRect").length
    move(top(container), 300)
    expect(frames).toHaveLength(1)
    expect(onCrosshairChange).toHaveBeenCalledTimes(1)
    const values = onCrosshairChange.mock.calls[0][0]
    expect(values?.time).toBeGreaterThan(ict(2026, 11, 5))
    flush()
    // Lớp dữ liệu không bị vẽ lại: chỉ thêm vài hình của nhãn crosshair.
    expect(named(context, "fillRect").length - before).toBeLessThan(10)
    // Cùng nến thì không báo lại.
    move(top(container), 301)
    expect(onCrosshairChange).toHaveBeenCalledTimes(1)
    act(() => void top(container).dispatchEvent(new MouseEvent("pointerleave")))
    expect(onCrosshairChange).toHaveBeenLastCalledWith(null)
  })

  it("market: lăn chuột zoom quanh con trỏ, kẹp trong giới hạn, chặn cuộn trang", () => {
    const onViewportChange = vi.fn<(viewport: Viewport) => void>()
    const { container } = render(<IQLineCanvas {...marketProps({ onViewportChange })} />)
    measure(800, 500)
    const event = new WheelEvent("wheel", { deltaY: -200, clientX: 300, clientY: 100, cancelable: true, bubbles: true })
    act(() => void top(container).dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    const next = onViewportChange.mock.calls[0][0]
    expect(next.to - next.from).toBeLessThan(120)
    for (let index = 0; index < 60; index += 1) act(() => void top(container).dispatchEvent(new WheelEvent("wheel", { deltaY: 3000, clientX: 300, cancelable: true })))
    const widest = onViewportChange.mock.calls.at(-1)![0]
    expect(widest.to - widest.from).toBeCloseTo(300 + 10 + 50 + 0, 0)
  })

  it("flashback: con lăn không zoom (để trang cuộn), Ctrl + lăn thì zoom trong các ô thật", () => {
    const onViewportChange = vi.fn<(viewport: Viewport) => void>()
    const { container } = render(<IQLineCanvas {...flashbackProps({ onViewportChange })} />)
    measure(800, 400)
    const plain = new WheelEvent("wheel", { deltaY: -200, clientX: 300, cancelable: true })
    act(() => void top(container).dispatchEvent(plain))
    expect(plain.defaultPrevented).toBe(false)
    expect(onViewportChange).not.toHaveBeenCalled()
    const ctrl = new WheelEvent("wheel", { deltaY: -400, ctrlKey: true, clientX: 300, cancelable: true })
    act(() => void top(container).dispatchEvent(ctrl))
    expect(ctrl.defaultPrevented).toBe(true)
    const zoomed = onViewportChange.mock.calls[0][0]
    expect(zoomed.from).toBeGreaterThanOrEqual(-0.5)
    expect(zoomed.to).toBeLessThanOrEqual(89.5)
    // Zoom ra hết cỡ cũng không vượt khỏi trục.
    for (let index = 0; index < 40; index += 1) act(() => void top(container).dispatchEvent(new WheelEvent("wheel", { deltaY: 4000, ctrlKey: true, clientX: 10, cancelable: true })))
    expect(onViewportChange.mock.calls.at(-1)![0]).toEqual({ from: -0.5, to: 89.5 })
  })

  it("flashback tắt zoom và kéo theo tuỳ chọn interaction", () => {
    const onViewportChange = vi.fn<(viewport: Viewport) => void>()
    const { container } = render(<IQLineCanvas {...flashbackProps({ onViewportChange, interaction: { zoom: false, pan: false } })} />)
    measure(800, 400)
    act(() => void top(container).dispatchEvent(new WheelEvent("wheel", { deltaY: -400, ctrlKey: true, cancelable: true })))
    act(() => void top(container).dispatchEvent(new MouseEvent("pointerdown", { clientX: 200, clientY: 100 })))
    move(top(container), 150)
    expect(onViewportChange).not.toHaveBeenCalled()
  })

  it("flashback: con trỏ ở ô tương lai không báo giá trị nào", () => {
    const onCrosshairChange = vi.fn<(values: IndexValues | null) => void>()
    const { container } = render(<IQLineCanvas {...flashbackProps({ onCrosshairChange })} />)
    measure(800, 400)
    // 60 nến thật trên 90 ô, trục rộng 738px: ô 75 nằm ở khoảng x = 620.
    move(top(container), 620)
    expect(onCrosshairChange).not.toHaveBeenCalled()
    move(top(container), 300)
    expect(onCrosshairChange).toHaveBeenCalledTimes(1)
    expect(onCrosshairChange.mock.calls[0][0]?.time).toBeNull()
    move(top(container), 700)
    expect(onCrosshairChange).toHaveBeenLastCalledWith(null)
  })

  it("kéo chuột di chuyển viewport; nhấp đúp vào trục thời gian về khung mặc định (nhấp đúp vào khung vẽ thì không)", () => {
    const onViewportChange = vi.fn<(viewport: Viewport) => void>()
    const { container } = render(<IQLineCanvas {...marketProps({ onViewportChange })} />)
    measure(800, 500)
    const canvas = top(container)
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: 400, clientY: 100 })))
    move(canvas, 480)
    const dragged = onViewportChange.mock.calls[0][0]
    // Kéo sang phải 80px thì xem phần cũ hơn.
    const initial = { from: 300 - 0.5 + 5 - 120, to: 300 - 0.5 + 5 }
    expect(dragged.from).toBeLessThan(initial.from)
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: 480, clientY: 100 })))
    const calls = onViewportChange.mock.calls.length
    act(() => void canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 480, clientY: 100, bubbles: true })))
    expect(onViewportChange.mock.calls.length).toBe(calls)
    act(() => void canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 480, clientY: 495, bubbles: true })))
    const reset = onViewportChange.mock.calls.at(-1)![0]
    expect(reset.from).toBeCloseTo(initial.from)
    expect(reset.to).toBeCloseTo(initial.to)
  })

  it("phím mũi tên di chuyển, +/- zoom (khi khung có focus)", () => {
    const onViewportChange = vi.fn<(viewport: Viewport) => void>()
    const { container } = render(<IQLineCanvas {...marketProps({ onViewportChange })} />)
    measure(800, 500)
    const host = container.firstElementChild as HTMLElement
    act(() => void host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })))
    const moved = onViewportChange.mock.calls[0][0]
    expect(moved.to).toBeCloseTo(300 - 0.5 + 5 - 1)
    act(() => void host.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true })))
    const zoomed = onViewportChange.mock.calls[1][0]
    expect(zoomed.to - zoomed.from).toBeLessThan(120)
  })

  it("nạp thêm lịch sử: hình trên màn hình đứng yên (viewport dịch đúng số nến chèn vào đầu)", () => {
    const onCrosshairChange = vi.fn<(values: IndexValues | null) => void>()
    const all = makeTimedBars(400)
    const props = (bars: TimedBar[]) => marketProps({ bars, onCrosshairChange })
    const { container, rerender } = render(<IQLineCanvas {...props(all.slice(100))} />)
    measure(800, 500)
    move(top(container), 300)
    const before = onCrosshairChange.mock.calls.at(-1)![0]!.time
    rerender(<IQLineCanvas {...props(all)} />)
    // Cùng vị trí chuột sau khi nạp: vẫn là nến cũ, không nhảy.
    onCrosshairChange.mockClear()
    move(top(container), 301)
    move(top(container), 300)
    expect(onCrosshairChange.mock.calls.at(-1)![0]!.time).toBe(before)
  })

  it("đổi mã (resetKey) thì về viewport mặc định, dù đang zoom", () => {
    const onCrosshairChange = vi.fn<(values: IndexValues | null) => void>()
    const bars = makeTimedBars(300)
    const { container, rerender } = render(<IQLineCanvas {...marketProps({ bars, resetKey: "VCB", onCrosshairChange })} />)
    measure(800, 500)
    move(top(container), 300)
    const initial = onCrosshairChange.mock.calls.at(-1)![0]!.time
    for (let index = 0; index < 5; index += 1) act(() => void top(container).dispatchEvent(new WheelEvent("wheel", { deltaY: -600, clientX: 700, cancelable: true })))
    move(top(container), 301)
    move(top(container), 300)
    expect(onCrosshairChange.mock.calls.at(-1)![0]!.time).not.toBe(initial)
    rerender(<IQLineCanvas {...marketProps({ bars, resetKey: "FPT", onCrosshairChange })} />)
    move(top(container), 301)
    move(top(container), 300)
    expect(onCrosshairChange.mock.calls.at(-1)![0]!.time).toBe(initial)
  })

  it("bấm vào chấm tin AI báo id; bấm chỗ khác thì không", () => {
    const bars = makeTimedBars(300)
    const onMarkClick = vi.fn()
    const { container } = render(<IQLineCanvas {...marketProps({ bars, onMarkClick, marks: [{ id: "n1", time: bars[299].time, label: "B", token: "price-up" }] })} />)
    measure(800, 500)
    // Nến cuối: tâm ở x = (299 - (initial.from)) * barPx; initial.to = 304.5, 120 nến trên 738px.
    const barPx = (800 - AXIS_RIGHT) / 120
    const x = (299 - (304.5 - 120)) * barPx
    // Ô giá cao 500 - 4 - 22 - 80 - 10 = 384, bắt đầu ở y = 4; chấm tin cách đáy ô 12px.
    const y = 4 + 384 - 12 - 7
    const canvas = top(container)
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y })))
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y })))
    expect(onMarkClick).toHaveBeenCalledWith("n1")
    onMarkClick.mockClear()
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: 50, clientY: 50 })))
    act(() => void canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: 50, clientY: 50 })))
    expect(onMarkClick).not.toHaveBeenCalled()
  })

  it("lớp hình vẽ gọi renderDrawings với khung hình hiện tại", () => {
    const renderDrawings = vi.fn(() => [])
    render(<IQLineCanvas {...marketProps({ renderDrawings })} />)
    measure(800, 500)
    flush()
    expect(renderDrawings).toHaveBeenCalled()
    const frame = (renderDrawings.mock.calls[0] as unknown as [{ price: { coords: { plot: { right: number } } } }])[0]
    expect(frame.price.coords.plot.right).toBe(800 - AXIS_RIGHT)
  })

  it("flashback dài theo chartLayout, không theo khung chứa", () => {
    const { container } = render(<IQLineCanvas {...flashbackProps()} />)
    measure(800, 50)
    const host = container.firstElementChild as HTMLElement
    // Ô giá 320 + khoảng cách 10 + khối lượng 80 + chừa đầu 4 + trục 22.
    expect(host.style.height).toBe("436px")
  })
})
