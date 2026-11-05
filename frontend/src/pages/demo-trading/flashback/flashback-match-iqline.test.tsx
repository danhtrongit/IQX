/**
 * Biểu đồ của màn chơi Flashback trên hai đường vẽ (docs/iqline-design.md GĐ 5): biểu đồ SVG cũ (mặc định) và IQLine (`?iqline=1`).
 *
 * Phần 1 chạy cùng một bộ kiểm tra cho cả hai đường: chiều cao các ô theo v2.3 §2, chú giải nổi, thêm, ẩn, cài đặt, xóa chỉ báo,
 * phiên tiếp. Phần 2 chỉ cho IQLine: công tắc, thanh công cụ ba nút, hình vẽ qua con trỏ trên canvas, trần 12 chỉ báo, và
 * luật công bằng (§12) ở mức trang: DOM của biểu đồ không có ngày thật hay tên mã. Phần 3 kiểm tra nhãn trục "Lịch sử n phiên" và độ mờ nến lịch sử giống bản SVG.
 * Các test chỉ có ở SVG (nhãn trục đọc từ DOM SVG, công cụ vẽ trên SVG) vẫn nằm ở `flashback-match.test.tsx` và `flashback-match-v21.test.tsx`.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ALL_TOOLS, TOOL_SPECS } from "@/lib/iqline/drawings"
import { named } from "@/lib/iqline/render/test-support"
import { installCanvasEnv, type CanvasEnv } from "@/lib/iqline/react/test-env"

import { AXIS_HEIGHT, CHART_TOP, PANE_GAP } from "./flashback-chart-layout"
import { FlashbackMain } from "./flashback-main"
import { FlashbackPanel } from "./flashback-panel"
import { FlashbackProvider } from "./flashback-provider"
import { INDICATOR_METAS, ME, MINH, createFlashbackBackend, type BackendOptions, type FlashbackBackend } from "./flashback-test-support"
import { CHART_BOTTOM_RESERVE } from "./use-chart-fit"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  openAuth: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isAuthenticated: true, openAuth: mocks.openAuth }),
}))
// Biểu đồ IQLine hỏi giao diện sáng hay tối; test không có ThemeProvider.
vi.mock("@/hooks/use-resolved-theme", () => ({ useResolvedTheme: () => "dark" }))
vi.mock("../shop/use-shop", () => ({ useShopState: () => ({ data: { wallet: { balance: 5_000 } } }) }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("./flashback-model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./flashback-model")>()),
  RESULT_LOCK_SECONDS: 0,
}))

let backend: FlashbackBackend
let env: CanvasEnv

function setup(options: BackendOptions = {}) {
  backend = createFlashbackBackend({ room: { status: "playing", owner: ME, members: [ME, MINH] }, ...options })
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
  return backend
}

function renderGame() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FlashbackProvider>
        <FlashbackMain />
        <FlashbackPanel />
      </FlashbackProvider>
    </QueryClientProvider>,
  )
}

/** jsdom không có `matchMedia`: trang chỉ hỏi `(min-width: 640px)` để biết có đặt ba công cụ cũ làm yêu thích mặc định hay không. */
function stubMedia(wide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide && query.includes("min-width: 640px"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

/** jsdom không có bố cục: bề rộng khung chứa của biểu đồ là giá trị giả này. */
function stubChartWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width })
}
const ORIGINAL_INNER_HEIGHT = window.innerHeight
function stubViewportHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height })
}

async function findGame() {
  await screen.findByTestId("flashback-clock")
  // Gói IQLine tải chậm (cả thanh công cụ đầy đủ): lần đầu vitest phải biên dịch nó nên chờ lâu hơn mặc định 1 giây.
  await waitFor(() => expect(screen.getByTestId("flashback-session")).toBeTruthy(), { timeout: 8000 })
}

type User = ReturnType<typeof userEvent.setup>
const nextButton = () => screen.getByTestId("flashback-next")
const tiles = () => screen.getByRole("region", { name: "Số liệu ván chơi" })
const tileValue = (label: string) => within(tiles()).getByText(label).nextElementSibling?.textContent
const chartRoot = () => screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).parentElement!
const chartHeight = () => Number(chartRoot().getAttribute("data-chart-height"))
const panes = (name: string) => Array.from(document.querySelectorAll(`[data-pane="${name}"]`))
const plot = (name: string, index = 0) => Number(panes(name)[index].getAttribute("data-plot-height"))

beforeEach(() => {
  mocks.api.mockReset()
  for (const fn of Object.values(mocks.toast)) fn.mockReset()
  window.localStorage.clear()
  env = installCanvasEnv()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
  stubViewportHeight(ORIGINAL_INNER_HEIGHT)
  window.history.replaceState(null, "", "/")
})

// ------------------------------------------------------------------ cùng một bộ kiểm tra cho hai đường vẽ

describe.each([
  { name: "SVG (mặc định)", search: "" },
  { name: "IQLine (?iqline=1)", search: "?iqline=1" },
])("Flashback, đường vẽ $name", ({ search }) => {
  beforeEach(() => window.history.replaceState(null, "", `/${search}`))

  const addIndicator = async (user: User, name: string) => {
    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    const picker = await screen.findByTestId("indicator-picker")
    await user.click(within(picker).getByRole("button", { name: new RegExp(`^${name}`) }))
    await waitFor(() => expect(screen.queryByTestId("indicator-picker")).toBeNull())
  }

  it("điện thoại: nhãn phiên, giá 240px, khối lượng 64px, đánh dấu hẹp (spec v2.3 §2)", async () => {
    stubChartWidth(390)
    stubViewportHeight(900)
    setup()
    renderGame()
    await findGame()
    expect(chartRoot().getAttribute("data-narrow")).toBe("true")
    expect(plot("price")).toBe(240)
    expect(plot("volume")).toBe(64)
    expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 0")
  })

  it("máy tính: gói gọn trong màn hình, khối lượng 80px, ô giá lấy phần còn lại", async () => {
    stubChartWidth(1000)
    stubViewportHeight(900)
    setup()
    renderGame()
    await findGame()
    expect(chartRoot().getAttribute("data-narrow")).toBe("false")
    const available = 900 - CHART_BOTTOM_RESERVE
    expect(chartHeight()).toBe(available)
    expect(plot("volume")).toBe(80)
    expect(plot("price")).toBe(available - CHART_TOP - AXIS_HEIGHT - 80 - PANE_GAP)
  })

  it("máy tính: màn hình thấp thì ô giá không dưới 320px", async () => {
    stubChartWidth(1000)
    stubViewportHeight(300)
    setup()
    renderGame()
    await findGame()
    expect(plot("price")).toBe(320)
    expect(plot("volume")).toBe(80)
  })

  it("cửa sổ hẹp dù biểu đồ rộng: dùng chiều cao điện thoại (giá 240px)", async () => {
    stubChartWidth(700)
    stubViewportHeight(900)
    vi.stubGlobal("innerWidth", 800)
    setup()
    renderGame()
    await findGame()
    expect(plot("price")).toBe(240)
    expect(plot("volume")).toBe(64)
  })

  it("số phiên xem và chơi theo đúng phòng: 45 xem, 40 chơi", async () => {
    stubChartWidth(1000)
    setup({ room: { status: "playing", owner: ME, members: [ME, MINH], settings: { view_bars: 45, play_bars: 40 } } })
    renderGame()
    await findGame()
    expect(tileValue("Phiên")).toBe("0 / 40")
    expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 0")
  })

  it("Phiên tiếp mở thêm đúng một nến: nhãn phiên và số liệu đổi theo", async () => {
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await user.click(nextButton())
    await waitFor(() => expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 1"))
    expect(tileValue("Phiên")).toBe("1 / 30")
  })

  it("thêm chỉ báo riêng: ô khối lượng và ô chỉ báo cao cố định, ô giá nhường phần còn lại tới 320px", async () => {
    stubChartWidth(1000)
    stubViewportHeight(900)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const base = chartHeight()
    expect(base).toBe(900 - CHART_BOTTOM_RESERVE)
    expect(panes("indicator")).toHaveLength(0)

    await addIndicator(user, "RSI")
    expect(panes("indicator")).toHaveLength(1)
    expect(panes("indicator")[0].querySelectorAll("button")).toHaveLength(3)
    expect(plot("indicator")).toBe(100)
    expect(plot("volume")).toBe(80)
    expect(chartHeight()).toBe(base)

    await addIndicator(user, "MACD")
    expect(panes("indicator")).toHaveLength(2)
    expect(plot("indicator", 1)).toBe(100)
    expect(plot("price")).toBeGreaterThanOrEqual(320)
  })

  it("máy tính bật 5 chỉ báo riêng: ô giá vẫn 320px, biểu đồ dài thêm xuống dưới", async () => {
    stubChartWidth(1000)
    stubViewportHeight(900)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const base = chartHeight()
    for (const name of ["RSI", "MACD", "Stochastic", "CCI", "ROC"]) await addIndicator(user, name)
    expect(panes("indicator")).toHaveLength(5)
    expect(chartHeight()).toBeGreaterThan(base)
    expect(plot("price")).toBe(320)
    expect(plot("volume")).toBe(80)
    for (const pane of panes("indicator")) expect(pane.getAttribute("data-plot-height")).toBe("100")
  })

  it("điện thoại: mỗi ô chỉ báo thêm 84px, ô giá và khối lượng giữ nguyên", async () => {
    stubChartWidth(390)
    stubViewportHeight(900)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const before = chartHeight()
    await addIndicator(user, "RSI")
    expect(chartHeight()).toBe(before + 84 + PANE_GAP)
    expect(plot("price")).toBe(240)
    expect(plot("volume")).toBe(64)
    expect(plot("indicator")).toBe(84)
  })

  it("điện thoại: chạm dòng chú giải thì hiện nút của dòng đó, chạm dòng khác thì chuyển, chạm ra ngoài thì ẩn", async () => {
    stubChartWidth(390)
    stubViewportHeight(900)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    await addIndicator(user, "RSI")
    await addIndicator(user, "MACD")
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-legend-row]"))
    const shown = () => rows().filter((row) => row.querySelector("[data-legend-buttons]")?.classList.contains("flex")).length
    expect(shown()).toBe(0)
    await user.click(rows()[0])
    expect(rows()[0].getAttribute("data-active")).toBe("true")
    expect(shown()).toBe(1)
    await user.click(rows()[1])
    expect(rows()[0].getAttribute("data-active")).toBeNull()
    expect(rows()[1].getAttribute("data-active")).toBe("true")
    expect(shown()).toBe(1)
    await user.click(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }))
    expect(shown()).toBe(0)
  })

  it("thêm MA và Bollinger: chiều cao các ô không đổi, chú giải thêm dòng nhưng không trừ phần vẽ (nghiệm thu 1)", async () => {
    stubChartWidth(1000)
    stubViewportHeight(900)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const price = plot("price")
    const base = chartHeight()
    expect(panes("price")[0].getAttribute("data-legend-height")).toBe("24")
    expect(panes("volume")[0].getAttribute("data-legend-height")).toBe("24")

    await addIndicator(user, "MA / SMA")
    await addIndicator(user, "Bollinger")
    expect(panes("price")[0].getAttribute("data-legend-height")).toBe(String(3 * 24))
    expect(plot("price")).toBe(price)
    expect(chartHeight()).toBe(base)
    expect(panes("indicator")).toHaveLength(0)

    await addIndicator(user, "Khối lượng")
    expect(panes("volume")[0].getAttribute("data-legend-height")).toBe("48")
    expect(plot("volume")).toBe(80)
  })

  it("ẩn, cài đặt và xóa một chỉ báo; chỉ báo được nhớ trong trình duyệt", async () => {
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    const { unmount } = renderGame()
    await findGame()
    await addIndicator(user, "RSI")

    await user.click(screen.getByRole("button", { name: "Ẩn RSI 14" }))
    expect(screen.getByRole("button", { name: "Hiện RSI 14" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Hiện RSI 14" }))

    await user.click(screen.getByRole("button", { name: "Cài đặt RSI 14" }))
    const settings = within(await screen.findByTestId("indicator-settings"))
    const period = settings.getByLabelText("Chu kỳ RSI")
    await user.clear(period)
    await user.type(period, "3")
    await user.click(settings.getByRole("button", { name: "OK" }))
    expect(settings.getByRole("alert").textContent).toBe("Chu kỳ RSI phải từ 5 đến 50")
    await user.clear(period)
    await user.type(period, "20")
    await user.click(settings.getByRole("button", { name: "OK" }))
    await screen.findByRole("button", { name: "Cài đặt RSI 20" })

    unmount()
    setup()
    renderGame()
    await findGame()
    expect(await screen.findByRole("button", { name: "Cài đặt RSI 20" })).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Xóa RSI 20" }))
    await waitFor(() => expect(panes("indicator")).toHaveLength(0))
  })
})

// ------------------------------------------------------------------ chỉ có IQLine

describe("Flashback: công tắc ?iqline=1", () => {
  it("mặc định là biểu đồ SVG: không có canvas IQLine và không có nút phóng thu", async () => {
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    expect(document.querySelector("canvas")).toBeNull()
    expect(document.querySelector("[data-iqline-root]")).toBeNull()
    expect(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).tagName.toLowerCase()).toBe("svg")
    expect(screen.queryByTestId("flashback-draw-horizontal")).toBeNull()
  })

  it("?iqline=1 dùng IQLine: bốn lớp canvas, không còn SVG biểu đồ", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    const chart = screen.getByRole("img", { name: "Biểu đồ nến Flashback" })
    expect(chart.getAttribute("data-iqline-mode")).toBe("flashback")
    expect([...chart.querySelectorAll("canvas")].map((canvas) => canvas.dataset.iqlineLayer)).toEqual(["base", "data", "drawings", "top"])
    expect(chart.tagName.toLowerCase()).not.toBe("svg")
    expect(screen.getByRole("group", { name: "Chú giải biểu đồ" })).toBeTruthy()
  })

  it("tham số khác (iqline=0, iqline=true) vẫn là biểu đồ SVG", async () => {
    window.history.replaceState(null, "", "/?iqline=0")
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    expect(document.querySelector("[data-iqline-root]")).toBeNull()
  })
})

describe("Flashback IQLine: công cụ vẽ", () => {
  /** Khung giá trải từ y = 4 tới y = 324 (máy tính, màn hình thấp). 90 ô trên trục rộng 938px: một ô rộng chừng 10,4px. */
  const SLOT = (1000 - 62) / 90
  const at = (session: number, y: number) => ({ x: (session + 0.5) * SLOT, y })
  const A = at(20, 120)
  const B = at(50, 200)

  const top = () => document.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
  // Máy chưa lưu yêu thích nào và cửa sổ rộng (>= 640px): ba công cụ cũ là yêu thích mặc định, bấm một lần như trước.
  const trend = () => screen.getByRole("button", { name: "Đường xu hướng" })
  const fib = () => screen.getByRole("button", { name: "Fibonacci thoái lui" })
  const horizontal = () => screen.getByRole("button", { name: "Đường ngang" })
  const clear = () => screen.getByTestId("flashback-draw-clear")
  const groupButtons = () => within(screen.getByRole("toolbar", { name: "Công cụ vẽ" })).getAllByRole("button").filter((button) => button.dataset.toolGroup)
  /** Các lệnh vẽ đường thẳng trên lớp hình vẽ của canvas giả: mỗi hình chọn hoặc không có đúng một đường nối hai neo. */
  const strokes = () => env.context.calls.filter((call) => call[0] === "stroke").length

  function pointer(type: "pointerdown" | "pointermove" | "pointerup", point: { x: number; y: number }) {
    fireEvent(top(), new MouseEvent(type, { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 0 }))
    env.flush()
  }
  function clickAt(point: { x: number; y: number }) {
    pointer("pointerdown", point)
    pointer("pointerup", point)
  }

  async function playing(wide = true) {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    stubViewportHeight(300)
    stubMedia(wide)
    setup()
    const user = userEvent.setup()
    renderGame()
    await findGame()
    env.measure(1000, 700)
    env.flush()
    return user
  }

  it("thanh công cụ có bảy nhóm, ba công cụ cũ là yêu thích mặc định, nam châm, danh sách hình vẽ và Xoá, cùng hàng với nút Các chỉ báo; không có nút Con trỏ", async () => {
    await playing()
    const toolbar = screen.getByRole("toolbar", { name: "Công cụ vẽ" })
    expect(groupButtons().map((button) => button.dataset.toolGroup)).toEqual(["line", "fib", "pitchfork", "pattern", "shape", "position", "annotation"])
    expect(within(toolbar).getAllByRole("button").filter((button) => button.dataset.favoriteTool).map((button) => button.dataset.favoriteTool)).toEqual(["trend", "fib-retracement", "horizontal"])
    const extras = screen.getByRole("toolbar", { name: "Nam châm và danh sách hình vẽ" })
    expect(within(extras).getByRole("button", { name: /^Nam châm/ })).toBeTruthy()
    expect(within(extras).getByRole("button", { name: "Danh sách hình vẽ" })).toBeTruthy()
    expect(within(extras).getByTestId("flashback-draw-clear")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /con trỏ/i })).toBeNull()
    const row = screen.getByTestId("flashback-draw-toolbar")
    for (const part of [toolbar, extras, screen.getByRole("button", { name: "Các chỉ báo" })]) expect(row.contains(part)).toBe(true)
  })

  it("điện thoại (< 640px): không có yêu thích mặc định, bảy nhóm vẫn đủ; nút Xoá ở cùng cụm với nam châm", async () => {
    await playing(false)
    expect(document.querySelector("[data-favorites]")).toBeNull()
    expect(groupButtons()).toHaveLength(7)
    // Hàng dưới (bảy nhóm) xuống dòng riêng, hàng trên có nút chỉ báo, nam châm, danh sách và Xoá (xếp bằng lớp max-sm của trang).
    const toolbar = screen.getByRole("toolbar", { name: "Công cụ vẽ" })
    expect(toolbar.className).toContain("max-sm:order-last")
    expect(toolbar.className).toContain("max-sm:basis-full")
    expect(screen.getByRole("toolbar", { name: "Nam châm và danh sách hình vẽ" }).className).toContain("max-sm:ml-auto")
  })

  it("menu của bảy nhóm liệt kê đủ 36 công cụ, mỗi công cụ đúng một lần, và chọn được từng công cụ", async () => {
    const user = await playing()
    const names: string[] = []
    for (const group of groupButtons()) {
      await user.click(group)
      const items = screen.getAllByRole("menuitem")
      names.push(...items.map((item) => item.textContent ?? ""))
      await user.keyboard("{Escape}")
    }
    expect(names).toHaveLength(36)
    expect(names.sort()).toEqual(ALL_TOOLS.map((tool) => TOOL_SPECS[tool].label).sort())
    // Chọn một công cụ ở nhóm "Vị thế và đo": nút nhóm sáng, chọn lại thì tắt.
    await user.click(groupButtons().find((button) => button.dataset.toolGroup === "position")!)
    await user.click(screen.getByRole("menuitem", { name: "Vị thế mua" }))
    expect(screen.getByRole("button", { name: "Vị thế và đo: Vị thế mua" }).getAttribute("aria-pressed")).toBe("true")
    expect(top().style.touchAction).toBe("none")
  })

  it("vị thế mua: hai cú bấm đặt đủ ba mức, thanh kiểu nổi trong khung biểu đồ; Delete xoá hình", async () => {
    const user = await playing()
    await user.click(groupButtons().find((button) => button.dataset.toolGroup === "position")!)
    await user.click(screen.getByRole("menuitem", { name: "Vị thế mua" }))
    const before = strokes()
    clickAt(A)
    expect(screen.queryByRole("toolbar", { name: /^Kiểu của/ })).toBeNull()
    clickAt(B)
    expect(strokes()).toBeGreaterThan(before)
    const bar = screen.getByRole("toolbar", { name: "Kiểu của Vị thế mua" })
    // Thanh kiểu nằm trong khung của biểu đồ (không đè lên nút Mua, Bán, Phiên tiếp bên ngoài khung).
    expect(top().closest("[data-iqline-root]")!.parentElement!.contains(bar)).toBe(true)
    expect(within(bar).getByRole("button", { name: "Nhân bản hình" })).toBeTruthy()
    await user.keyboard("{Delete}")
    expect(screen.queryByRole("toolbar", { name: /^Kiểu của/ })).toBeNull()
  })

  it("đường gấp khúc: có thanh Xong và Huỷ trên điện thoại không có phím Enter; Xong chốt hình", async () => {
    const user = await playing()
    await user.click(groupButtons().find((button) => button.dataset.toolGroup === "shape")!)
    await user.click(screen.getByRole("menuitem", { name: "Đường gấp khúc" }))
    clickAt(A)
    clickAt(at(35, 160))
    const done = screen.getByRole("toolbar", { name: "Hoàn tất Đường gấp khúc" })
    expect(within(done).getByText(/2 điểm/)).toBeTruthy()
    await user.click(within(done).getByRole("button", { name: /Xong/ }))
    expect(screen.queryByRole("toolbar", { name: /^Hoàn tất/ })).toBeNull()
    expect(screen.getByRole("toolbar", { name: "Kiểu của Đường gấp khúc" })).toBeTruthy()
  })

  it("nam châm: chọn mức Mạnh thì nút đổi theo và được nhớ cho lần sau", async () => {
    const user = await playing()
    const extras = () => within(screen.getByRole("toolbar", { name: "Nam châm và danh sách hình vẽ" }))
    expect(extras().getByRole("button", { name: /^Nam châm/ }).getAttribute("data-magnet")).toBe("off")
    await user.click(extras().getByRole("button", { name: /^Nam châm/ }))
    await user.click(screen.getByRole("menuitemradio", { name: /^Mạnh/ }))
    expect(extras().getByRole("button", { name: /^Nam châm/ }).getAttribute("data-magnet")).toBe("strong")
    expect(window.localStorage.getItem("iqx.iqline_magnet_v1")).toBe('"strong"')
  })

  it("công cụ đang bật thì nút sáng, bấm lại thì huỷ, chọn công cụ khác thì chuyển; canvas chặn cuộn trang khi đang vẽ", async () => {
    const user = await playing()
    expect(trend().getAttribute("aria-pressed")).toBe("false")
    expect(top().style.touchAction).toBe("pan-y")
    await user.click(trend())
    expect(trend().getAttribute("aria-pressed")).toBe("true")
    expect(top().style.touchAction).toBe("none")
    await user.click(trend())
    expect(trend().getAttribute("aria-pressed")).toBe("false")
    expect(top().style.touchAction).toBe("pan-y")
    await user.click(trend())
    await user.click(fib())
    expect(trend().getAttribute("aria-pressed")).toBe("false")
    expect(fib().getAttribute("aria-pressed")).toBe("true")
    await user.click(horizontal())
    expect(fib().getAttribute("aria-pressed")).toBe("false")
    expect(horizontal().getAttribute("aria-pressed")).toBe("true")
  })

  it("đường xu hướng: bấm điểm đầu rồi điểm cuối, vẽ xong tự về chế độ bình thường và có nét vẽ trên canvas", async () => {
    const user = await playing()
    await user.click(trend())
    const before = strokes()
    clickAt(A)
    expect(trend().getAttribute("aria-pressed")).toBe("true")
    pointer("pointermove", at(35, 140))
    clickAt(B)
    expect(trend().getAttribute("aria-pressed")).toBe("false")
    expect(strokes()).toBeGreaterThan(before)
  })

  it("chỉ vẽ được trên khung giá: bấm ở ô khối lượng thì bỏ qua", async () => {
    const user = await playing()
    await user.click(trend())
    clickAt({ x: 200, y: 360 })
    expect(trend().getAttribute("aria-pressed")).toBe("true")
    clickAt(A)
    // Bấm ở ô khối lượng lúc đang chờ điểm cuối cũng không chốt hình.
    clickAt({ x: 300, y: 360 })
    expect(trend().getAttribute("aria-pressed")).toBe("true")
  })

  it("Esc huỷ lúc đang vẽ: bỏ công cụ và điểm đầu", async () => {
    const user = await playing()
    await user.click(fib())
    clickAt(A)
    await user.keyboard("{Escape}")
    expect(fib().getAttribute("aria-pressed")).toBe("false")
  })

  it("nút Xoá: chưa có hình thì báo Chưa có hình vẽ; có hình đang chọn thì xoá hình đó; không chọn thì xoá hết", async () => {
    const user = await playing()
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenCalledWith("Chưa có hình vẽ")

    for (const tool of [trend, fib, horizontal]) {
      await user.click(tool())
      clickAt(A)
      if (tool !== horizontal) clickAt(B)
    }
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá hình vẽ")
    // Bỏ chọn bằng cách bấm chỗ trống ở xa các hình, rồi Xoá hết hai hình còn lại.
    clickAt(at(80, 300))
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá 2 hình vẽ")
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Chưa có hình vẽ")
  })

  it("Delete và Backspace xoá hình đang chọn; gõ trong ô nhập thì không xoá", async () => {
    const user = await playing()
    await user.click(trend())
    clickAt(A)
    clickAt(B)
    const qty = within(screen.getByRole("region", { name: "Đặt lệnh" })).getByLabelText("Số cổ phiếu")
    await user.type(qty, "12{Backspace}")
    expect((qty as HTMLInputElement).value).toBe("1")
    await user.click(clear())
    // Nút Xoá khi còn hình đang chọn xoá đúng hình đó: nếu Backspace ở ô nhập đã xoá nó thì đây là "Chưa có hình vẽ".
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá hình vẽ")

    await user.click(trend())
    clickAt(A)
    clickAt(B)
    await user.click(document.body)
    await user.keyboard("{Delete}")
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Chưa có hình vẽ")
  })

  it("hình vẽ chỉ ở trình duyệt: không có lời gọi nào tới server", async () => {
    const user = await playing()
    const before = backend.calls.length
    for (const tool of [trend, fib]) {
      await user.click(tool())
      clickAt(A)
      clickAt(B)
    }
    await user.click(clear())
    expect(backend.calls.slice(before).filter((call) => call.method !== "GET")).toHaveLength(0)
    expect(backend.calls.slice(before).some((call) => /draw|shape|fib|trend/i.test(call.path))).toBe(false)
  })

  it("Xem lại biểu đồ giữ hình vẽ; sang ván mới thì hình vẽ bắt đầu lại", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    stubViewportHeight(300)
    stubMedia(true)
    setup({ match: { status: "ended", finished: true, step: 30, rivals: [{ person: MINH, pnl: 2, finished: true }] } })
    const user = userEvent.setup()
    renderGame()
    const dialog = within(await screen.findByTestId("flashback-result"))
    await user.click(dialog.getByRole("button", { name: "Xem lại biểu đồ" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())
    env.measure(1000, 700)
    env.flush()

    await user.click(trend())
    clickAt(A)
    clickAt(B)
    // Mở lại kết quả rồi xem lại: hình vẫn còn, nên nút Xoá xoá một hình.
    await user.click(screen.getByTestId("flashback-next"))
    const again = within(await screen.findByTestId("flashback-result"))
    await user.click(again.getByRole("button", { name: "Xem lại biểu đồ" }))
    await waitFor(() => expect(screen.queryByTestId("flashback-result")).toBeNull())
    await user.click(clear())
    expect(mocks.toast.info).toHaveBeenLastCalledWith("Đã xoá hình vẽ")
  })
})

describe("Flashback IQLine: trần chỉ báo và dấu lệnh", () => {
  it("đã có 12 chỉ báo thì chọn thêm bị từ chối kèm thông báo, danh sách không đổi", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    const stored = Array.from({ length: 12 }, (_, index) => ({ id: INDICATOR_METAS[index % INDICATOR_METAS.length].id, params: {} }))
    // Tham số rỗng bị coi là sai: chỉ báo dùng tham số mặc định, vẫn là 12 chỉ báo.
    window.localStorage.setItem("iqx.flashback.indicators.v2", JSON.stringify(stored))
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    const rows = () => document.querySelectorAll("[data-legend-row]").length
    expect(rows()).toBe(12)
    await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
    const picker = await screen.findByTestId("indicator-picker")
    await user.click(within(picker).getByRole("button", { name: /^RSI/ }))
    await waitFor(() => expect(screen.queryByTestId("indicator-picker")).toBeNull())
    expect(mocks.toast.info).toHaveBeenCalledWith("Tối đa 12 chỉ báo")
    expect(rows()).toBe(12)
    expect(JSON.parse(window.localStorage.getItem("iqx.flashback.indicators.v2") ?? "[]")).toHaveLength(12)
  })
})

describe("Flashback IQLine: luật công bằng (§12) ở DOM của trang", () => {
  it("DOM của biểu đồ không có ngày thật, tên mã, thời gian hay dữ liệu của phiên chưa mở", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    const user = userEvent.setup()
    setup()
    renderGame()
    await findGame()
    for (const name of ["RSI", "MA / SMA"]) {
      await user.click(screen.getByRole("button", { name: "Các chỉ báo" }))
      const picker = await screen.findByTestId("indicator-picker")
      await user.click(within(picker).getByRole("button", { name: new RegExp(`^${name}`) }))
      await waitFor(() => expect(screen.queryByTestId("indicator-picker")).toBeNull())
    }
    const root = document.querySelector("[data-iqline-root]")!
    const surface: string[] = []
    const visit = (element: Element) => {
      // Không xét thuộc tính chỉ để kiểm thử hay tạo kiểu: `data-testid`, `class`, `style`, `xmlns` và dữ liệu đường vẽ `d`.
      for (const attribute of Array.from(element.attributes)) {
        if (["xmlns", "d", "data-testid", "class", "style"].includes(attribute.name)) continue
        surface.push(`${attribute.name}=${attribute.value}`)
      }
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) surface.push(child.textContent ?? "")
        else if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element)
      }
    }
    visit(root)
    const text = surface.join("\n")
    expect(text).not.toMatch(/\b(VNM|FPT|HPG|VCB|VIC)\b/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b(19|20)\d{2}\b|T\d{2}:\d{2}/)
    expect(text).not.toMatch(/\bsession\b|\bdate\b|\bsymbol\b|\btime\b/i)
    expect(screen.getByRole("img", { name: "Biểu đồ nến Flashback" }).getAttribute("aria-label")).toBe("Biểu đồ nến Flashback")
  })

  it("nhãn phiên trên chú giải là Phiên n hoặc n phiên trước, không bao giờ là ngày; ở nến cuối là Phiên 0 khi chưa chơi", async () => {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(1000)
    setup()
    renderGame()
    await findGame()
    expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 0")
    const top = document.querySelector<HTMLCanvasElement>('canvas[data-iqline-layer="top"]')!
    act(() => void top.dispatchEvent(new MouseEvent("pointermove", { clientX: 5 * ((1000 - 62) / 90), clientY: 100, bubbles: true })))
    expect(screen.getByTestId("flashback-session").textContent).toMatch(/^\d+ phiên trước$/)
    // Rê vào phần phiên chưa mở: chú giải trở về nến cuối, không đọc được tương lai.
    act(() => void top.dispatchEvent(new MouseEvent("pointermove", { clientX: 80 * ((1000 - 62) / 90), clientY: 100, bubbles: true })))
    expect(screen.getByTestId("flashback-session").textContent).toBe("Phiên 0")
  })
})

describe("Flashback IQLine: trục ngang và độ mờ như biểu đồ SVG (v2.3)", () => {
  /** Canvas vẽ số từng ký tự: ghép các ký tự liền nhau cùng dòng lại thành nhãn. */
  function drawnTexts(): string[] {
    const out: string[] = []
    let current = ""
    let last: { x: number; y: number } | null = null
    for (const call of named(env.context, "fillText")) {
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

  async function open(width: number, extra: Parameters<typeof setup>[0] = {}) {
    window.history.replaceState(null, "", "/?iqline=1")
    stubChartWidth(width)
    stubViewportHeight(900)
    setup(extra)
    renderGame()
    await findGame()
    env.measure(width, 700)
    env.flush()
  }

  it("máy tính: nhãn Lịch sử 60 phiên, Phiên 1, Phiên 15, Phiên 30 như bản SVG", async () => {
    await open(1000)
    for (const label of ["Lịch sử 60 phiên", "Phiên 1", "Phiên 15", "Phiên 30"]) expect(drawnTexts()).toContain(label)
  })

  it("điện thoại: nhãn rút gọn, bỏ nhãn giữa", async () => {
    await open(390)
    const labels = drawnTexts()
    expect(labels).toContain("Lịch sử")
    expect(labels).not.toContain("Lịch sử 60 phiên")
    expect(labels).not.toContain("Phiên 15")
    for (const label of ["Phiên 1", "Phiên 30"]) expect(labels).toContain(label)
  })

  it("số phiên theo đúng phòng: 45 xem, 40 chơi thì trục ghi Lịch sử 45 phiên và Phiên 40", async () => {
    await open(1000, { room: { status: "playing", owner: ME, members: [ME, MINH], settings: { view_bars: 45, play_bars: 40 } } })
    for (const label of ["Lịch sử 45 phiên", "Phiên 1", "Phiên 20", "Phiên 40"]) expect(drawnTexts()).toContain(label)
  })

  it("nến lịch sử mờ 0.75 và khối lượng lịch sử 0.45 như bản SVG", async () => {
    await open(1000)
    const alphas = new Set(named(env.context, "set globalAlpha").map((call) => call[1]))
    expect(alphas.has(0.75)).toBe(true)
    expect(alphas.has(0.45)).toBe(true)
  })
})
