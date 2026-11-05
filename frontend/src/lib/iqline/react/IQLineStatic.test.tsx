import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fakeContext, named, type FakeContext } from "../render/test-support"
import { buildStaticScene, layoutStatic } from "../scene/static"
import type { StaticFrame, StaticPanel } from "../static-types"
import { IQLineStatic } from "./IQLineStatic"

let contexts: Record<string, FakeContext>
let probe: FakeContext
let frames: FrameRequestCallback[]
let observers: ResizeObserverCallback[]
let clientWidth: number
let restoreWidth: () => void

beforeEach(() => {
  frames = []
  observers = []
  clientWidth = 580
  probe = fakeContext()
  contexts = {}
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const layer = this.dataset.iqlineLayer
    if (!layer) return probe as never
    return (contexts[layer] ??= fakeContext()) as never
  })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => clientWidth })
  restoreWidth = () => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, "clientWidth", descriptor)
  }
})

afterEach(() => {
  restoreWidth()
  vi.unstubAllGlobals()
})

const flush = () =>
  act(() => {
    frames.splice(0).forEach((callback) => callback(0))
  })

const resize = (width: number) =>
  act(() => {
    clientWidth = width
    for (const callback of observers) callback([], {} as ResizeObserver)
  })

const range = (n: number, f: (k: number) => number) => Array.from({ length: n }, (_, k) => Math.round(f(k) * 100) / 100)
const closes = range(30, (k) => 50 + Math.sin(k / 3) * 4 + k * 0.2)
const frame = (overrides: Partial<StaticFrame> = {}): StaticFrame => ({ start: 70, end: 99, marks: [], axes: true, alt: "Giá và MACD", ...overrides })

function panels(shared: StaticFrame = frame({ shade: [{ from: 72, to: 76, token: "price-up", label: "Tích lũy", labelToken: "price-up" }] })): StaticPanel[] {
  return [
    {
      frame: shared,
      title: "Giá",
      digits: 1,
      candles: { open: closes.map((c) => c - 0.5), high: closes.map((c) => c + 1), low: closes.map((c) => c - 1.2), close: closes },
      series: [
        { name: "Giá", token: "foreground", values: closes },
        { name: "MA20", token: "chart-1", dash: true, values: range(30, (k) => 50 + k * 0.2) },
      ],
      notes: [{ i: 95, value: 49, text: "Cắt lỗ", token: "price-down" }],
      points: [{ i: 85, value: closes[15], token: "price-up", labelToken: "price-up", label: "Mua" }],
    },
    {
      frame: shared,
      title: "Khối lượng",
      series: [],
      bars: { name: "Khối lượng", values: range(30, (k) => 30 + (k % 5)), tokens: range(30, (k) => k).map((k) => (k % 2 ? "price-up" : "price-down")) },
    },
  ]
}

const top = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
const hostOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="img"]')!
const pointAt = (canvas: HTMLCanvasElement, x: number, y: number, name = "pointermove") => {
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 580, bottom: 400, width: 580, height: 400, x: 0, y: 0, toJSON: () => ({}) })
  act(() => void canvas.dispatchEvent(new MouseEvent(name, { clientX: x, clientY: y, bubbles: true })))
}

describe("IQLineStatic: khung và tiếp cận", () => {
  it("dựng bốn lớp canvas trong khung role img, nhãn lấy từ frame.alt, chiều cao theo layoutStatic", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    expect([...container.querySelectorAll("canvas")].map((canvas) => canvas.dataset.iqlineLayer)).toEqual(["base", "data", "drawings", "top"])
    const host = hostOf(container)
    expect(host.getAttribute("aria-label")).toBe("Giá và MACD")
    expect(host.getAttribute("tabindex")).toBe("0")
    expect(host.getAttribute("aria-describedby")).toBeTruthy()
    expect(host.style.height).toBe(`${layoutStatic(panels(), { width: 580 }).height}px`)
  })

  it("ariaLabel truyền vào thắng frame.alt", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" ariaLabel="Biểu đồ c4l7-g6" />)
    expect(hostOf(container).getAttribute("aria-label")).toBe("Biểu đồ c4l7-g6")
  })

  it("chiều cao đổi theo bề rộng đo được (bản hẹp thấp hơn)", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    const wide = hostOf(container).style.height
    resize(358)
    expect(hostOf(container).style.height).toBe(`${layoutStatic(panels(), { width: 358 }).height}px`)
    expect(hostOf(container).style.height).not.toBe(wide)
  })

  it("giữ bề rộng cũ khi khung chưa có bố cục (rộng 0)", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    const before = hostOf(container).style.height
    resize(0)
    expect(hostOf(container).style.height).toBe(before)
  })

  it("hình thu nhỏ (axes: false): không focus, không chú giải, không câu đọc, không nhận con trỏ", () => {
    const thumb: StaticPanel = { frame: frame({ axes: false, start: 0, end: 9 }), title: "", series: [], candles: { open: range(10, (k) => 10 + k), high: range(10, (k) => 12 + k), low: range(10, (k) => 9 + k), close: range(10, (k) => 11 + k) } }
    const { container } = render(<IQLineStatic panels={[thumb]} theme="light" />)
    expect(hostOf(container).getAttribute("tabindex")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("list")).toBeNull()
    expect(top(container).style.pointerEvents).toBe("none")
    pointAt(top(container), 100, 40)
    expect(container.querySelector("[data-iqline-tooltip]")).toBeNull()
  })
})

describe("IQLineStatic: chú giải DOM", () => {
  it("liệt kê nến, chuỗi và cột từ staticLegend, mỗi nhãn một lần", () => {
    render(<IQLineStatic panels={panels()} theme="light" />)
    const list = screen.getByRole("list", { name: "Chú giải" })
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Nến giá", "Giá", "MA20", "Khối lượng"])
  })

  it("tắt được, và không hiện khi chỉ có một dòng", () => {
    const { unmount } = render(<IQLineStatic panels={panels()} theme="light" legend={false} />)
    expect(screen.queryByRole("list")).toBeNull()
    unmount()
    render(<IQLineStatic panels={[{ frame: frame(), title: "", series: [{ name: "A", token: "chart-1", values: closes }] }]} theme="light" />)
    expect(screen.queryByRole("list")).toBeNull()
  })
})

describe("IQLineStatic: vẽ", () => {
  it("đo chữ bằng ctx.measureText của font thật (độ đậm và cỡ chữ của nhãn), trước khi vẽ", () => {
    render(<IQLineStatic panels={panels()} theme="light" />)
    const fonts = probe.calls.filter((call) => call[0] === "set font").map((call) => String(call[1]))
    expect(fonts.some((font) => font.startsWith("600 11px"))).toBe(true)
  })

  it("lớp base vẽ cảnh tĩnh qua paintScene: tiêu đề, số vạch, nến và cột đúng số lượng; lớp top chưa vẽ gì", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="dark" />)
    flush()
    const base = contexts.base
    const texts = named(base, "fillText").map((call) => call[1])
    for (const expected of ["Giá", "Khối lượng", "Mua", "Cắt lỗ", "Tích lũy"]) expect(texts).toContain(expected)
    // Số hình chữ nhật tô đúng bằng số trong cảnh (count là số thực, mỗi hình chữ nhật 4 số).
    const scene = buildStaticScene(panels(), { width: 580, dpr: 1 }, {})
    const rects = scene.flatMap((command) => (command.op === "rects" ? [command.count / 4] : [])).reduce((sum, value) => sum + value, 0)
    expect(rects).toBeGreaterThan(30)
    expect(named(base, "fillRect").length).toBeGreaterThanOrEqual(rects)
    expect(named(contexts.top, "stroke")).toHaveLength(0)
    expect(top(container).dataset.iqlineLayer).toBe("top")
  })

  it("đổi giao diện thì đọc lại màu và vẽ lại", () => {
    const { rerender } = render(<IQLineStatic panels={panels()} theme="light" />)
    flush()
    const before = named(contexts.base, "clearRect").length
    rerender(<IQLineStatic panels={panels()} theme="dark" />)
    flush()
    expect(named(contexts.base, "clearRect").length).toBeGreaterThan(before)
  })
})

describe("IQLineStatic: crosshair", () => {
  it("di chuột vẽ đường dọc ở lớp top và hiện chú giải nổi với giá trị tại nến", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    flush()
    const layout = layoutStatic(panels(), { width: 580 })
    pointAt(top(container), layout.xOfIndex(3), layout.plot.top + 10)
    flush()
    expect(named(contexts.top, "stroke").length).toBeGreaterThan(0)
    const tooltip = container.querySelector<HTMLElement>("[data-iqline-tooltip]")!
    expect(within(tooltip).getByText("Phiên 74")).toBeTruthy()
    expect(within(tooltip).getByText("Đóng cửa")).toBeTruthy()
    expect(tooltip.textContent).toContain("Khối lượng")
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 74: Mở cửa/)
    // Nửa trái: chú giải nổi nằm bên phải con trỏ.
    expect(tooltip.style.left).not.toBe("")
  })

  it("con trỏ ở nửa phải thì chú giải nổi chuyển sang bên trái", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    const layout = layoutStatic(panels(), { width: 580 })
    pointAt(top(container), layout.xOfIndex(28), layout.plot.top + 10)
    const tooltip = container.querySelector<HTMLElement>("[data-iqline-tooltip]")!
    expect(tooltip.style.right).not.toBe("")
    expect(tooltip.style.left).toBe("")
  })

  it("bỏ qua con trỏ ngoài vùng vẽ và xoá khi rời khung", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    pointAt(top(container), 570, 30)
    expect(container.querySelector("[data-iqline-tooltip]")).toBeNull()
    pointAt(top(container), 100, 30)
    expect(container.querySelector("[data-iqline-tooltip]")).not.toBeNull()
    pointAt(top(container), 100, 30, "pointerleave")
    expect(container.querySelector("[data-iqline-tooltip]")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("")
  })

  it("phím mũi tên, Home, End và Escape đọc từng quan sát", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    const host = hostOf(container)
    fireEvent.keyDown(host, { key: "Home" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 71: Mở cửa/)
    fireEvent.keyDown(host, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 72:/)
    fireEvent.keyDown(host, { key: "End" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 100:/)
    fireEvent.keyDown(host, { key: "ArrowRight" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 100:/)
    fireEvent.keyDown(host, { key: "Escape" })
    expect(screen.getByRole("status").textContent).toBe("")
    fireEvent.keyDown(host, { key: "ArrowLeft" })
    expect(screen.getByRole("status").textContent).toMatch(/^Phiên 100:/)
    fireEvent.blur(host)
    expect(screen.getByRole("status").textContent).toBe("")
  })

  it("không có zoom, kéo hay vẽ: con lăn và kéo không đổi gì", () => {
    const { container } = render(<IQLineStatic panels={panels()} theme="light" />)
    flush()
    const before = named(contexts.base, "clearRect").length
    const canvas = top(container)
    act(() => void canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true })))
    pointAt(canvas, 200, 40, "pointerdown")
    pointAt(canvas, 100, 40)
    flush()
    expect(named(contexts.base, "clearRect").length).toBe(before)
  })
})

describe("IQLineStatic: mã nguồn", () => {
  it("không dùng muted-foreground, màu thô hay import từ pages", () => {
    const sources = Object.values(import.meta.glob("./IQLineStatic.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    expect(sources).toHaveLength(1)
    expect(sources[0]).not.toContain("muted-foreground")
    expect(sources[0]).not.toMatch(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/)
    expect(sources[0]).not.toMatch(/from\s+["'][^"']*pages\//)
    expect(sources[0]).not.toMatch(/gradient/i)
  })
})
