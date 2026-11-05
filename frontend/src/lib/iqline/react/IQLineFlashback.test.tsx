/**
 * `<IQLineFlashback />` (docs/iqline-design.md §12): ghép chú giải nổi, nút zoom, hình vẽ theo ván và các luật công bằng.
 * Canvas là canvas giả (jsdom không có Canvas 2D); luật ở tầng scene đã có test riêng, ở đây kiểm tra thứ người chơi thật sự
 * nhìn thấy và chạm vào: DOM do IQLine sinh ra, hành động đi qua `SessionDrawingController`, giới hạn zoom và kéo.
 */
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { named } from "../render/test-support"
import { makeBars } from "../scene/test-support"
import type { Bar, ChartIndicatorInput } from "../types"
import { IQLineFlashback, type IQLineFlashbackProps } from "./IQLineFlashback"
import { createSessionDrawings, type SessionDrawingController } from "./session-drawings"
import { installCanvasEnv, type CanvasEnv } from "./test-env"

let env: CanvasEnv
beforeEach(() => {
  env = installCanvasEnv()
})
afterEach(() => vi.unstubAllGlobals())

const WARMUP = 10
const COUNT = 60
const SLOTS = 90
/** Bề rộng khung chứa của test: khung vẽ rộng 900 - 62 = 838px cho 90 ô. */
const WIDTH = 900

const formatX = (session: number) => `Phiên ${session}`
const bars = (): Bar[] => makeBars(WARMUP + COUNT)

function setup(overrides: Partial<IQLineFlashbackProps> = {}, width = WIDTH) {
  const drawings = overrides.drawings ?? createSessionDrawings()
  const props: IQLineFlashbackProps = { mode: "flashback", theme: "dark", bars: bars(), warmup: WARMUP, totalSlots: SLOTS, formatX, indicators: [], drawings, ...overrides }
  const view = render(<IQLineFlashback {...props} />)
  env.measure(width, 700)
  env.flush()
  return { ...view, drawings, props }
}

/** Canvas vẽ số theo từng ký tự (căn số tabular), nên ghép các ký tự liền nhau cùng dòng thành một chuỗi để so với nhãn thật. */
function drawnTexts(context: typeof env.context): string[] {
  const out: string[] = []
  let current = ""
  let last: { x: number; y: number } | null = null
  for (const call of named(context, "fillText")) {
    const text = String(call[1])
    const x = Number(call[2])
    const y = Number(call[3])
    if (last && y === last.y && x > last.x && x - last.x < 16) current += text
    else {
      if (current) out.push(current)
      current = text
    }
    last = { x, y }
  }
  if (current) out.push(current)
  return out
}
const topCanvas = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
const root = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-iqline-root="flashback"]')!
const viewport = (container: HTMLElement) => root(container).dataset.viewport!.split(",").map(Number)
const slotX = (index: number, width = WIDTH) => ((index + 0.5) * (width - 62)) / SLOTS
const move = (canvas: HTMLElement, x: number, y = 100) => act(() => void canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true })))
const wheel = (canvas: HTMLElement, init: WheelEventInit) => {
  const event = new WheelEvent("wheel", { clientX: 300, clientY: 100, cancelable: true, bubbles: true, ...init })
  act(() => void canvas.dispatchEvent(event))
  return event
}
const down = (canvas: HTMLElement, x: number, y: number) => act(() => void canvas.dispatchEvent(new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, button: 0 })))
const up = (canvas: HTMLElement, x: number, y: number) => act(() => void canvas.dispatchEvent(new MouseEvent("pointerup", { clientX: x, clientY: y, bubbles: true, button: 0 })))
const click = (canvas: HTMLElement, x: number, y: number) => {
  down(canvas, x, y)
  up(canvas, x, y)
}
const rsi = (extra: Partial<ChartIndicatorInput> = {}): ChartIndicatorInput => ({ key: "r1", id: "rsi", params: { period: 14 }, ...extra })
const ma = (key = "m1", extra: Partial<ChartIndicatorInput> = {}): ChartIndicatorInput => ({ key, id: "ma", params: { period: 20 }, ...extra })

describe("IQLineFlashback: vỏ và chú giải nổi", () => {
  it("canvas nằm trong khung role img; chú giải DOM nằm ngoài khung đó", () => {
    const { container } = setup()
    const chart = screen.getByRole("img", { name: "Biểu đồ nến Flashback" })
    expect(chart.querySelectorAll("canvas")).toHaveLength(4)
    const legend = screen.getByRole("group", { name: "Chú giải biểu đồ" })
    expect(chart.contains(legend)).toBe(false)
    expect(root(container).contains(legend)).toBe(true)
    expect(chart.parentElement).toBe(root(container))
  })

  it("chưa đo được bề rộng thì chưa có chú giải và chưa vẽ gì", () => {
    render(<IQLineFlashback mode="flashback" theme="dark" bars={bars()} warmup={WARMUP} totalSlots={SLOTS} formatX={formatX} indicators={[]} drawings={createSessionDrawings()} />)
    env.flush()
    expect(screen.queryByRole("group", { name: "Chú giải biểu đồ" })).toBeNull()
    expect(named(env.context, "fillRect")).toHaveLength(0)
  })

  it("hiện nhãn phiên, O H L C và % đổi của nến cuối; ô khối lượng có dòng Khối lượng", () => {
    setup()
    expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(COUNT - 1))
    const price = document.querySelector('[data-pane="price"]')!
    expect(price.textContent).toMatch(/O.*H.*L.*C.*%/)
    expect(document.querySelector('[data-pane="volume"]')!.textContent).toContain("Khối lượng")
  })

  it("chiều cao ô v2.3: máy tính giá 320, khối lượng 80; điện thoại giá 240, khối lượng 64", () => {
    const desktop = setup()
    expect(document.querySelector('[data-pane="price"]')!.getAttribute("data-plot-height")).toBe("320")
    expect(document.querySelector('[data-pane="volume"]')!.getAttribute("data-plot-height")).toBe("80")
    expect(root(desktop.container).dataset.narrow).toBe("false")
    desktop.unmount()
    setup({}, 390)
    expect(document.querySelector('[data-pane="price"]')!.getAttribute("data-plot-height")).toBe("240")
    expect(document.querySelector('[data-pane="volume"]')!.getAttribute("data-plot-height")).toBe("64")
  })

  it("`available` cho ô giá lấy phần còn lại nhưng không dưới 320px; cửa sổ hẹp (`pageNarrow`) dùng chiều cao điện thoại", () => {
    const tall = setup({ available: 900 })
    expect(Number(document.querySelector('[data-pane="price"]')!.getAttribute("data-plot-height"))).toBe(900 - 4 - 22 - 80 - 10)
    expect(root(tall.container).dataset.chartHeight).toBe("900")
    tall.unmount()
    const short = setup({ available: 300 })
    expect(document.querySelector('[data-pane="price"]')!.getAttribute("data-plot-height")).toBe("320")
    short.unmount()
    const narrow = setup({ pageNarrow: true, available: 900 })
    expect(document.querySelector('[data-pane="price"]')!.getAttribute("data-plot-height")).toBe("240")
    expect(document.querySelector('[data-pane="volume"]')!.getAttribute("data-plot-height")).toBe("64")
    expect(root(narrow.container).dataset.narrow).toBe("false")
  })

  it("chỉ báo trên ô giá thêm dòng chú giải nhưng không đổi chiều cao ô; chỉ báo riêng thêm ô 100px", () => {
    const { rerender, props } = setup({ indicators: [ma("m1"), ma("m2")] })
    const price = () => document.querySelector('[data-pane="price"]')!
    expect(price().getAttribute("data-legend-height")).toBe(String(3 * 24))
    expect(price().getAttribute("data-plot-height")).toBe("320")
    expect(document.querySelectorAll('[data-pane="indicator"]')).toHaveLength(0)
    rerender(<IQLineFlashback {...props} indicators={[ma("m1"), ma("m2"), rsi()]} />)
    env.measure(WIDTH, 700)
    const panes = document.querySelectorAll('[data-pane="indicator"]')
    expect(panes).toHaveLength(1)
    expect(panes[0].getAttribute("data-plot-height")).toBe("100")
    expect(panes[0].querySelectorAll("button")).toHaveLength(3)
  })

  it("chỉ báo chỉ có ở market (ATR) và Volume Profile bị bỏ qua ở Flashback", () => {
    setup({ indicators: [{ key: "a", id: "atr", params: { period: 14 } }, { key: "v", id: "vp_visible", params: {} }, ma()] })
    expect(document.querySelectorAll("[data-legend-row]")).toHaveLength(1)
  })

  it("tên chỉ báo theo `indicatorTitle` và giá trị chỉ báo theo định dạng cũ (hai chữ số thập phân, dấu %)", () => {
    setup({ indicators: [rsi()], indicatorTitle: (input) => `RSI ${String(input.params.period)}` })
    const row = document.querySelector('[data-legend-row="r1"]')!
    expect(row.textContent).toMatch(/^RSI 14\d+,\d{2}%/)
    expect(within(row as HTMLElement).getByRole("button", { name: "Ẩn RSI 14" })).toBeTruthy()
    expect(within(row as HTMLElement).getByRole("button", { name: "Cài đặt RSI 14" })).toBeTruthy()
    expect(within(row as HTMLElement).getByRole("button", { name: "Xóa RSI 14" })).toBeTruthy()
  })

  it("nút Ẩn, Hiện và Xóa gọi onIndicatorsChange với danh sách mới; nút Cài đặt báo khoá chỉ báo", async () => {
    const user = userEvent.setup()
    const onIndicatorsChange = vi.fn()
    const onIndicatorSettings = vi.fn()
    const indicators = [ma("m1"), rsi()]
    setup({ indicators, onIndicatorsChange, onIndicatorSettings })
    await user.click(screen.getByRole("button", { name: /^Ẩn MA/ }))
    expect(onIndicatorsChange).toHaveBeenLastCalledWith([{ ...indicators[0], hidden: true }, indicators[1]])
    await user.click(screen.getByRole("button", { name: /^Xóa RSI/ }))
    expect(onIndicatorsChange).toHaveBeenLastCalledWith([indicators[0]])
    await user.click(screen.getByRole("button", { name: /^Cài đặt RSI/ }))
    expect(onIndicatorSettings).toHaveBeenCalledWith("r1")
  })

  it("điện thoại: chạm dòng chú giải thì hiện nút của dòng đó, chạm dòng khác thì chuyển, chạm ra ngoài thì ẩn", async () => {
    const user = userEvent.setup()
    setup({ indicators: [rsi(), { key: "r2", id: "mfi", params: {} }], pageNarrow: true })
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-legend-row]"))
    const shown = () => rows().filter((row) => row.querySelector("[data-legend-buttons]")?.classList.contains("flex")).length
    expect(shown()).toBe(0)
    await user.click(rows()[0])
    expect(rows()[0].getAttribute("data-active")).toBe("true")
    expect(shown()).toBe(1)
    await user.click(rows()[1])
    expect(rows()[0].getAttribute("data-active")).toBeNull()
    expect(shown()).toBe(1)
    await user.click(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }))
    expect(shown()).toBe(0)
  })

  it("chữ chú giải dùng lớp fb-legend (viền cùng màu nền, không ô nền) và cỡ 12,5px đậm", () => {
    setup({ indicators: [ma()] })
    const lines = document.querySelectorAll(".fb-legend")
    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const line of lines) {
      expect(line.className).toContain("text-[12.5px]")
      expect(line.className).toContain("font-bold")
      expect(line.className).not.toMatch(/\bbg-/)
    }
  })

  it("vẽ nến, khối lượng và trục ngang bằng nhãn của formatX", () => {
    setup()
    expect(named(env.context, "fillRect").length).toBeGreaterThan(100)
    expect(drawnTexts(env.context).some((label) => /^Phiên \d+$/.test(label))).toBe(true)
  })
})

describe("IQLineFlashback: nhãn trục như SVG, nến lịch sử mờ, nút cho máy cảm ứng (đối chiếu Flashback v2.3)", () => {
  const axisLabels = (narrow: boolean) =>
    narrow
      ? [
          { index: 0, label: "Lịch sử", anchor: "start" as const },
          { index: 60, label: "Phiên 1", anchor: "middle" as const },
          { index: 89, label: "Phiên 30", anchor: "end" as const },
        ]
      : [
          { index: 0, label: "Lịch sử 60 phiên", anchor: "start" as const },
          { index: 60, label: "Phiên 1", anchor: "middle" as const },
          { index: 74, label: "Phiên 15", anchor: "middle" as const },
          { index: 89, label: "Phiên 30", anchor: "end" as const },
        ]

  it("khung mặc định: nhãn của trang ('Lịch sử 60 phiên', 'Phiên 1', phiên giữa, 'Phiên 30'); điện thoại rút gọn", () => {
    const desktop = setup({ axisLabels, divider: 60 })
    const labels = drawnTexts(env.context)
    for (const label of ["Lịch sử 60 phiên", "Phiên 1", "Phiên 15", "Phiên 30"]) expect(labels).toContain(label)
    desktop.unmount()
    env.context.calls.length = 0
    setup({ axisLabels, divider: 60 }, 390)
    const phone = drawnTexts(env.context)
    expect(phone).toContain("Lịch sử")
    expect(phone).not.toContain("Lịch sử 60 phiên")
  })

  it("zoom thì nhãn cố định nhường chỗ cho nhãn theo phiên; Về khung mặc định trả nhãn cố định lại", async () => {
    const user = userEvent.setup()
    setup({ axisLabels, divider: 60 })
    env.context.calls.length = 0
    await user.click(screen.getByRole("button", { name: "Phóng to biểu đồ" }))
    env.flush()
    expect(drawnTexts(env.context)).not.toContain("Lịch sử 60 phiên")
    env.context.calls.length = 0
    await user.click(screen.getByRole("button", { name: "Về khung mặc định" }))
    env.flush()
    expect(drawnTexts(env.context)).toContain("Lịch sử 60 phiên")
  })

  it("có vạch ngăn thì nến lịch sử vẽ mờ 0.75 và khối lượng 0.45/0.7; không có vạch ngăn thì không mờ", () => {
    // Bốn mươi nến lịch sử và hai mươi nến đã chơi; 0.4 là mặt nạ phần chưa mở.
    setup({ divider: 40 })
    const alphas = new Set(named(env.context, "set globalAlpha").map((call) => call[1]))
    expect([...alphas].sort()).toEqual([0.4, 0.45, 0.7, 0.75, 1].sort())
    env.context.calls.length = 0
    document.body.innerHTML = ""
    setup({})
    expect(new Set(named(env.context, "set globalAlpha").map((call) => call[1]))).toEqual(new Set([0.4, 0.55, 1]))
  })

  it("máy tính: nút zoom chỉ hiện khi rê chuột hoặc đã zoom; điện thoại: luôn hiện, to 36px, vẫn có nút Về khung mặc định", () => {
    const desktop = setup()
    const group = () => screen.getByTestId("flashback-zoom-controls")
    expect(group().className).toContain("opacity-0")
    expect(screen.getByRole("button", { name: "Phóng to biểu đồ" }).className).toContain("size-6")
    desktop.unmount()
    setup({ pageNarrow: true })
    expect(group().className).not.toContain("opacity-0")
    expect(group().className).toContain("opacity-100")
    for (const name of ["Thu nhỏ biểu đồ", "Phóng to biểu đồ", "Về khung mặc định"]) expect(screen.getByRole("button", { name }).className).toContain("size-9")
    // Ở khung mặc định nút Về khung mặc định chưa dùng được, nhưng vẫn hiện để người chơi biết có đường về.
    expect((screen.getByRole("button", { name: "Về khung mặc định" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("điện thoại: ba nút của dòng chú giải nằm ở dòng riêng dưới tên chỉ báo, không cùng dòng với giá trị", async () => {
    const user = userEvent.setup()
    setup({ indicators: [ma()], pageNarrow: true })
    const row = document.querySelector<HTMLElement>("[data-legend-row]")!
    const buttons = row.querySelector<HTMLElement>("[data-legend-buttons]")!
    expect(row.children).toHaveLength(2)
    expect(row.children[0].contains(buttons)).toBe(false)
    expect(row.children[1]).toBe(buttons)
    expect(buttons.classList.contains("flex")).toBe(false)
    await user.click(row)
    expect(buttons.classList.contains("flex")).toBe(true)
    for (const button of buttons.querySelectorAll("button")) expect(button.className).toContain("size-8")
    // Máy tính: cùng dòng với tên và giá trị.
    document.body.innerHTML = ""
  })

  it("máy tính: ba nút cùng dòng với tên chỉ báo", () => {
    setup({ indicators: [ma()] })
    const row = document.querySelector<HTMLElement>("[data-legend-row]")!
    expect(row.children).toHaveLength(1)
    expect(row.children[0].contains(row.querySelector("[data-legend-buttons]"))).toBe(true)
  })
})

describe("IQLineFlashback: luật công bằng (§12) ở DOM và crosshair", () => {
  /** Dữ liệu thô như server có thể gửi nhầm: thêm ngày, mã, và nến warmup cực đoan. */
  function leakyBars(): Bar[] {
    return makeBars(WARMUP + COUNT).map((bar, index) => ({
      ...bar,
      ...(index < WARMUP ? { open: 1e6, high: 2e6, low: 0.001, close: 1.5e6, volume: 9e9 } : {}),
      time: 1_700_000_000 + index * 86_400,
      date: "2026-10-05",
      symbol: "VNM",
    })) as Bar[]
  }

  const SYMBOL = /\b(VNM|FPT|HPG|VCB|VIC)\b/
  const DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b(19|20)\d{2}\b|T\d{2}:\d{2}|Thg|tháng \d/i

  /** Mọi chữ và mọi thuộc tính của cây DOM dưới `node`, kể cả aria-label, title, data-*, class và id. */
  function surface(node: Element): string[] {
    const out: string[] = []
    const visit = (element: Element) => {
      // `xmlns` của biểu tượng SVG có "2000" và dữ liệu đường vẽ `d` chỉ là toạ độ: không phải chữ người dùng đọc.
      for (const attribute of Array.from(element.attributes)) if (attribute.name !== "xmlns" && attribute.name !== "d") out.push(`${attribute.name}=${attribute.value}`)
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) out.push(child.textContent ?? "")
        else if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element)
      }
    }
    visit(node)
    return out
  }

  it("DOM và aria-label không lộ ngày hay tên mã, kể cả khi dữ liệu thô có trường time, date, symbol", () => {
    const { container } = setup({ bars: leakyBars(), indicators: [ma(), rsi()], markers: [{ session: 30, side: "buy" }, { session: 45, side: "sell" }] })
    move(topCanvas(container), slotX(30))
    const text = surface(root(container)).join("\n")
    expect(text).not.toMatch(SYMBOL)
    expect(text).not.toMatch(DATE)
    expect(text).not.toMatch(/\btime\b|\bdate\b|\bsymbol\b/i)
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Biểu đồ nến Flashback")
  })

  it("chữ vẽ trên canvas cũng không có ngày hay tên mã, ở mọi vị trí crosshair", () => {
    const { container } = setup({ bars: leakyBars(), indicators: [ma()] })
    for (const index of [0, 20, 59, 60, 75, 89]) {
      move(topCanvas(container), slotX(index))
      env.flush()
    }
    const labels = drawnTexts(env.context)
    expect(labels.length).toBeGreaterThan(10)
    for (const label of labels) {
      expect(label).not.toMatch(SYMBOL)
      expect(label).not.toMatch(DATE)
    }
  })

  it("nến warmup không có trong chú giải, kể cả giá trị cực đoan của chúng", () => {
    setup({ bars: leakyBars(), indicators: [ma()] })
    const text = document.body.textContent ?? ""
    expect(text).not.toContain("9.000.000.000")
    expect(text).not.toMatch(/1\.500\.000|2\.000\.000/)
  })

  it("crosshair ở ô tương lai không vẽ gì và chú giải vẫn là nến cuối; ở nến đã mở thì chú giải đổi theo", () => {
    const { container } = setup()
    const top = topCanvas(container)
    move(top, slotX(20))
    expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(20))
    env.context.calls.length = 0
    move(top, slotX(COUNT + 10))
    env.flush()
    expect(named(env.context, "fillText")).toHaveLength(0)
    expect(named(env.context, "fillRect")).toHaveLength(0)
    expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(COUNT - 1))
    for (const index of [COUNT, COUNT + 1, SLOTS - 1]) {
      move(top, slotX(index))
      expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(COUNT - 1))
    }
    env.context.calls.length = 0
    move(top, slotX(COUNT - 1))
    env.flush()
    expect(named(env.context, "fillText").length).toBeGreaterThan(0)
  })

  it("phím mũi tên không đưa crosshair ra ngoài nến đã mở", () => {
    const { container } = setup({ interaction: { pan: false } })
    const host = screen.getByRole("img")
    for (let step = 0; step < 200; step += 1) act(() => void host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true })))
    expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(COUNT - 1))
    for (let step = 0; step < 200; step += 1) act(() => void host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true })))
    expect(screen.getByTestId("flashback-session").textContent).toBe(formatX(0))
    expect(root(container)).toBeTruthy()
  })
})

describe("IQLineFlashback: zoom và kéo trong giới hạn nến đã mở (§12)", () => {
  it("mở với đúng khung mặc định: nhìn hết mọi ô của trục", () => {
    const { container } = setup()
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    expect(root(container).querySelector('[data-testid="flashback-zoom-controls"]')!.getAttribute("data-zoomed")).toBe("false")
  })

  it("lăn chuột thường để trang cuộn (không chặn, không zoom); Ctrl + lăn zoom quanh con trỏ và chặn cuộn trang", () => {
    const { container } = setup()
    const top = topCanvas(container)
    const plain = wheel(top, { deltaY: -300 })
    expect(plain.defaultPrevented).toBe(false)
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    const zoom = wheel(top, { deltaY: -300, ctrlKey: true })
    expect(zoom.defaultPrevented).toBe(true)
    const [from, to] = viewport(container)
    expect(to - from).toBeLessThan(SLOTS)
    expect(root(container).querySelector('[data-testid="flashback-zoom-controls"]')!.getAttribute("data-zoomed")).toBe("true")
  })

  it("không zoom ra ngoài trục và không kéo qua warmup hay quá ô cuối, dù kéo hay lăn rất mạnh", () => {
    const { container } = setup()
    const top = topCanvas(container)
    for (let step = 0; step < 40; step += 1) wheel(top, { deltaY: 3000, ctrlKey: true })
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    for (let step = 0; step < 6; step += 1) wheel(top, { deltaY: -3000, ctrlKey: true })
    // Kéo hết về bên trái, rồi hết về bên phải.
    for (let step = 0; step < 30; step += 1) wheel(top, { deltaX: -2000, deltaY: 0 })
    expect(viewport(container)[0]).toBe(-0.5)
    for (let step = 0; step < 60; step += 1) wheel(top, { deltaX: 2000, deltaY: 0 })
    expect(viewport(container)[1]).toBe(SLOTS - 0.5)
    // Kéo chuột cũng bị chặn ở cùng hai biên (mỗi lần kéo 700px đi được chừng 17 nến).
    for (let step = 0; step < 12; step += 1) {
      down(top, 100, 100)
      move(top, 800, 100)
      up(top, 800, 100)
    }
    expect(viewport(container)[0]).toBe(-0.5)
    down(top, 800, 100)
    move(top, -4000, 100)
    up(top, -4000, 100)
    expect(viewport(container)[1]).toBe(SLOTS - 0.5)
  })

  it("nến warmup không có trong dải nhìn thấy: sau khi kéo hết về trái, nến đầu tiên là nến sau warmup", () => {
    const poisoned = makeBars(WARMUP + COUNT).map((bar, index) => (index < WARMUP ? { open: 1e6, high: 2e6, low: 0.001, close: 1.5e6, volume: 9e9 } : bar))
    const { container } = setup({ bars: poisoned })
    const top = topCanvas(container)
    for (let step = 0; step < 6; step += 1) wheel(top, { deltaY: -3000, ctrlKey: true })
    for (let step = 0; step < 30; step += 1) wheel(top, { deltaX: -2000, deltaY: 0 })
    env.flush()
    move(top, slotX(0, WIDTH) * 0 + 6, 100)
    const price = document.querySelector('[data-pane="price"]')!.textContent ?? ""
    expect(price).not.toMatch(/1\.500\.000|2\.000\.000/)
    // Trục giá chỉ theo nến đã mở: không nhãn nào lớn như giá của warmup.
    expect(drawnTexts(env.context).some((label) => /^\d{1,3}(\.\d{3}){2,}/.test(label))).toBe(false)
  })

  it("nút Về khung mặc định và nhấp đúp vào biểu đồ đưa về khung mặc định; nút bị khoá khi đang ở khung đó", async () => {
    const user = userEvent.setup()
    const { container } = setup()
    const top = topCanvas(container)
    const fit = screen.getByRole("button", { name: "Về khung mặc định" }) as HTMLButtonElement
    expect(fit.disabled).toBe(true)
    wheel(top, { deltaY: -400, ctrlKey: true })
    expect(fit.disabled).toBe(false)
    await user.click(fit)
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    wheel(top, { deltaY: -400, ctrlKey: true })
    expect(viewport(container)[1] - viewport(container)[0]).toBeLessThan(SLOTS)
    act(() => void top.dispatchEvent(new MouseEvent("dblclick", { clientX: 300, clientY: 100, bubbles: true })))
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
  })

  it("nút Phóng to và Thu nhỏ đổi khung; phím + và - khi biểu đồ có focus", async () => {
    const user = userEvent.setup()
    const { container } = setup()
    await user.click(screen.getByRole("button", { name: "Phóng to biểu đồ" }))
    const zoomed = viewport(container)
    expect(zoomed[1] - zoomed[0]).toBeLessThan(SLOTS)
    await user.click(screen.getByRole("button", { name: "Thu nhỏ biểu đồ" }))
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    const host = screen.getByRole("img")
    act(() => void host.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })))
    expect(viewport(container)[1] - viewport(container)[0]).toBeLessThan(SLOTS)
  })

  it("`interaction` tắt zoom hoặc kéo thì Ctrl + lăn và kéo không làm gì, không có nút phóng thu", () => {
    const { container } = setup({ interaction: { zoom: false, pan: false } })
    expect(wheel(topCanvas(container), { deltaY: -400, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(viewport(container)).toEqual([-0.5, SLOTS - 0.5])
    expect(screen.queryByRole("button", { name: "Phóng to biểu đồ" })).toBeNull()
    expect(screen.queryByRole("group", { name: "Thu phóng biểu đồ" })).toBeNull()
  })

  it("thêm nến mới khi đang zoom ở mép phải thì khung đi theo nến mới", () => {
    const { container, rerender, props } = setup({ bars: makeBars(WARMUP + 30) })
    const top = topCanvas(container)
    for (let step = 0; step < 6; step += 1) wheel(top, { deltaY: -3000, ctrlKey: true })
    for (let step = 0; step < 40; step += 1) wheel(top, { deltaX: 2000, deltaY: 0 })
    const before = viewport(container)
    rerender(<IQLineFlashback {...props} bars={makeBars(WARMUP + 31)} />)
    env.measure(WIDTH, 700)
    const after = viewport(container)
    expect(after[1]).toBeGreaterThanOrEqual(before[1])
    expect(after[1] - after[0]).toBeCloseTo(before[1] - before[0], 6)
  })
})

describe("IQLineFlashback: hình vẽ theo ván", () => {
  /** Hai điểm trong khung giá (ô giá nằm ở y từ 4 đến 324). */
  const A = { x: slotX(10), y: 120 }
  const B = { x: slotX(40), y: 200 }
  const snapshot = (drawings: SessionDrawingController) => drawings.getSnapshot()

  function drawTrend(drawings: SessionDrawingController, canvas: HTMLElement) {
    act(() => drawings.toggleTool("trend"))
    click(canvas, A.x, A.y)
    click(canvas, B.x, B.y)
  }

  it("chỉ ba công cụ: xu hướng, Fibonacci thoái lui, đường ngang; công cụ khác bị bỏ qua", () => {
    const { container, drawings } = setup()
    act(() => drawings.toggleTool("trend"))
    expect(snapshot(drawings).tool).toBe("trend")
    act(() => drawings.toggleTool("fib-retracement"))
    expect(snapshot(drawings).tool).toBe("fib-retracement")
    act(() => drawings.toggleTool("horizontal"))
    expect(snapshot(drawings).tool).toBe("horizontal")
    act(() => drawings.toggleTool("horizontal"))
    expect(snapshot(drawings).tool).toBeNull()
    for (const tool of ["rectangle", "ray", "extended", "channel", "fib-extension", "elliott-5", "note", "measure", "vertical"] as const) {
      act(() => drawings.toggleTool(tool))
      expect(snapshot(drawings).tool).toBeNull()
    }
    expect(topCanvas(container)).toBeTruthy()
  })

  it("bấm lại công cụ đang sáng thì huỷ; vẽ xong tự về chế độ bình thường và hình đang được chọn", () => {
    const { container, drawings } = setup()
    act(() => drawings.toggleTool("trend"))
    act(() => drawings.toggleTool("trend"))
    expect(snapshot(drawings).tool).toBeNull()
    drawTrend(drawings, topCanvas(container))
    const state = snapshot(drawings)
    expect(state.tool).toBeNull()
    expect(state.shapes).toHaveLength(1)
    expect(state.selectedId).toBe(state.shapes[0].id)
    expect(state.shapes[0].tool).toBe("trend")
  })

  it("điểm neo chỉ có session và giá, không có thời gian; session nằm trong các ô của trục", () => {
    const { container, drawings } = setup()
    drawTrend(drawings, topCanvas(container))
    const [a, b] = snapshot(drawings).shapes[0].anchors
    expect(Object.keys(a).sort()).toEqual(["price", "session"])
    expect(Math.round((a as { session: number }).session)).toBe(10)
    expect(Math.round((b as { session: number }).session)).toBe(40)
    // Bấm sát mép phải của khung vẽ (ô cuối là tương lai): neo bị kẹp vào các ô của trục, không có phiên nào nằm ngoài trục.
    act(() => drawings.toggleTool("trend"))
    click(topCanvas(container), WIDTH - 64, 150)
    click(topCanvas(container), WIDTH - 64, 250)
    const edge = snapshot(drawings).shapes.at(-1)!.anchors as { session: number }[]
    for (const anchor of edge) {
      expect(anchor.session).toBeGreaterThanOrEqual(0)
      expect(anchor.session).toBeLessThanOrEqual(SLOTS - 1)
    }
  })

  it("Fibonacci thoái lui cần hai điểm; đường ngang một điểm; chỉ vẽ được trên khung giá", () => {
    const { container, drawings } = setup()
    const top = topCanvas(container)
    act(() => drawings.toggleTool("horizontal"))
    click(top, 200, 600)
    expect(snapshot(drawings).shapes).toHaveLength(0)
    click(top, 200, 150)
    expect(snapshot(drawings).shapes.map((shape) => shape.tool)).toEqual(["horizontal"])
    act(() => drawings.toggleTool("fib-retracement"))
    click(top, A.x, A.y)
    expect(snapshot(drawings).pending).toBe(true)
    click(top, B.x, B.y)
    expect(snapshot(drawings).shapes.map((shape) => shape.tool)).toEqual(["horizontal", "fib-retracement"])
  })

  it("vẽ bằng cách nhấn giữ ở điểm đầu, kéo rồi thả ở điểm cuối", () => {
    const { container, drawings } = setup()
    const top = topCanvas(container)
    act(() => drawings.toggleTool("trend"))
    down(top, A.x, A.y)
    move(top, 200, 160)
    up(top, B.x, B.y)
    expect(snapshot(drawings).shapes).toHaveLength(1)
  })

  it("Esc huỷ lúc đang vẽ; Delete xoá hình đang chọn; nút Xoá: hình đang chọn, không thì tất cả", () => {
    const { container, drawings } = setup()
    const top = topCanvas(container)
    act(() => drawings.toggleTool("trend"))
    click(top, A.x, A.y)
    expect(snapshot(drawings).pending).toBe(true)
    act(() => drawings.cancel())
    expect(snapshot(drawings)).toMatchObject({ tool: null, pending: false })
    expect(snapshot(drawings).shapes).toHaveLength(0)

    drawTrend(drawings, top)
    act(() => void drawings.removeSelected())
    expect(snapshot(drawings).shapes).toHaveLength(0)
    expect(drawings.removeSelected()).toBe(false)

    drawTrend(drawings, top)
    drawTrend(drawings, top)
    expect(snapshot(drawings).shapes).toHaveLength(2)
    // Bỏ chọn rồi bấm Xoá: xoá tất cả.
    click(top, 600, 300)
    expect(snapshot(drawings).selectedId).toBeNull()
    let message = ""
    act(() => void (message = drawings.clear().message))
    expect(message).toBe("Đã xoá 2 hình vẽ")
    expect(snapshot(drawings).shapes).toHaveLength(0)
    expect(drawings.clear().message).toBe("Chưa có hình vẽ")
  })

  it("hình giữ nguyên khi biểu đồ dựng lại với cùng controller; controller mới (ván mới) thì không có hình", () => {
    const first = setup()
    drawTrend(first.drawings, topCanvas(first.container))
    expect(snapshot(first.drawings).shapes).toHaveLength(1)
    first.unmount()
    const again = setup({ drawings: first.drawings })
    expect(snapshot(again.drawings).shapes).toHaveLength(1)
    // Hình được vẽ lại: có nét trên canvas hình vẽ.
    expect(named(env.context, "stroke").length + named(env.context, "lineTo").length).toBeGreaterThan(0)
    again.unmount()
    const fresh = setup({ drawings: createSessionDrawings() })
    expect(snapshot(fresh.drawings).shapes).toHaveLength(0)
  })

  it("đang chọn công cụ vẽ thì canvas không cho trang cuộn (touch-action none), thôi chọn thì pan-y", () => {
    const { container, drawings } = setup()
    const top = topCanvas(container)
    expect(top.style.touchAction).toBe("pan-y")
    act(() => drawings.toggleTool("trend"))
    expect(top.style.touchAction).toBe("none")
    act(() => drawings.toggleTool("trend"))
    expect(top.style.touchAction).toBe("pan-y")
  })

  it("chọn hình bằng cách bấm vào nó, bỏ chọn bằng cách bấm chỗ trống; kéo hình đổi điểm neo", () => {
    const { container, drawings } = setup()
    const top = topCanvas(container)
    drawTrend(drawings, top)
    click(top, 600, 300)
    expect(snapshot(drawings).selectedId).toBeNull()
    click(top, (A.x + B.x) / 2, (A.y + B.y) / 2)
    expect(snapshot(drawings).selectedId).toBe(snapshot(drawings).shapes[0].id)
    const before = snapshot(drawings).shapes[0].anchors
    down(top, (A.x + B.x) / 2, (A.y + B.y) / 2)
    move(top, (A.x + B.x) / 2 + 60, (A.y + B.y) / 2 + 20)
    up(top, (A.x + B.x) / 2 + 60, (A.y + B.y) / 2 + 20)
    expect(snapshot(drawings).shapes[0].anchors).not.toEqual(before)
  })
})
