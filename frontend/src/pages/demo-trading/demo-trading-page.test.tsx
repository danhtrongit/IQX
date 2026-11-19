import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HeaderSearch } from "@/components/layout/header-search"
import { flashbackChrome, practiceChrome } from "@/config/chrome"
import { headerDestination } from "@/lib/header-navigation"
import { RailProvider } from "@/context/rail"
import { createFakeApi, createWorld } from "./bot/test-support"
import { FlashbackSectionPage, PracticePage } from "./demo-trading-page"
import { createFakeAcademyApi } from "@/pages/academy/test-api"
import { workspaceLoader } from "./workspace-url"
import { workspaceMemory } from "./workspace-sections"
import { createDojoBackend, type DojoBackend } from "./candle-dojo/dojo-test-support"
import { createShopBackend, type ShopBackend } from "./shop/shop-test-support"
import { resetEnsuredWorkspaces } from "./workspace/workspace-api"

let shopBackend: ShopBackend
let dojoBackend: DojoBackend

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  mascot: "bach_ho" as string | null,
  workspaceStatus: 200,
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-new" },
    isAuthenticated: true,
    isLoading: false,
    isPremium: false,
    sessionError: null,
    sessionExpired: false,
    openAuth: vi.fn(),
  }),
}))

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  errorMessage: (error: unknown) => String(error),
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock("@/pages/charts/chart-page", () => ({ ChartPage: () => <div data-testid="chart-stub" /> }))

vi.mock("./journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: ({ mascotId, state }: { mascotId: string; state: string }) => (
    <div data-testid="mascot-2d" data-mascot={mascotId} data-state={state} />
  ),
}))

const account = {
  id: "acc-1", user_id: "user-new", status: "active", initial_cash_vnd: 100_000_000, cash_available_vnd: 100_000_000,
  cash_reserved_vnd: 0, cash_pending_vnd: 0, total_cash_vnd: 100_000_000, activated_at: "2026-10-01T00:00:00Z", reset_at: null, created_at: "2026-10-01T00:00:00Z",
}

let botApi = createFakeApi(createWorld())
const academy = vi.hoisted(() => ({ handler: undefined as undefined | ((path: string, init?: RequestInit) => Promise<unknown>) }))

async function respond(path: string, init?: RequestInit): Promise<unknown> {
  const { ApiError } = await import("@/lib/api")
  if (path === "/workspace/ensure") {
    if (mocks.workspaceStatus === 404) throw new ApiError("Not found", 404)
    return { data: { ok: true } }
  }
  if (path === "/workspace/state") {
    if (mocks.workspaceStatus === 404) throw new ApiError("Not found", 404)
    return { data: { active_mascot: mocks.mascot ? { mascot_id: mocks.mascot } : null } }
  }
  if (path === "/shop" || path.startsWith("/shop/")) return shopBackend.handle(path, init)
  if (path.startsWith("/candle-dojo")) return dojoBackend.handle(path, init)
  // The catalog, progress and items of the Học viện tool (the Shop reads the same progress route).
  if (path.startsWith("/academy") && academy.handler) return academy.handler(path, init)
  if (path === "/virtual-trading/account") return account
  if (path === "/virtual-trading/portfolio") {
    return { account, positions: [], total_market_value_vnd: 0, nav_vnd: 100_000_000, total_unrealized_pnl_vnd: 0, return_pct: 0, refresh_warnings: [] }
  }
  if (path === "/virtual-trading/refresh") return { orders_filled: 0, orders_expired: 0, settlements_settled: 0, warnings: [] }
  if (path === "/bot" || path.startsWith("/bot/") || path.startsWith("/strategy/")) {
    // The Bot tool's own reads (overview, positions, journal, universe, registry, shared config).
    return botApi(path, init)
  }
  if (path.startsWith("/cap5/san-ma")) throw new ApiError("Not found", 404)
  if (path === "/watchlists") return { data: [] }
  if (path.startsWith("/instruments")) {
    return { data: [{ symbol: "VCB", name: "NH TMCP Ngoại thương Việt Nam", exchange: "HOSE" }] }
  }
  // Dashboard phân tích: ngành của mã, thiết lập theo ngành, danh mục và số liệu theo khuôn.
  if (path.startsWith("/dashboard/industry/")) {
    return { symbol: "FPT", nganh: "thuong", label: "Doanh nghiệp sản xuất" }
  }
  if (path === "/dashboard/settings") {
    const own = { charts: ["ROE"], per: "q", nks: {} }
    return { thuong: own, nh: own, ck: own, bh: own }
  }
  if (path === "/dashboard/catalog") {
    return {
      industries: [
        {
          nganh: "thuong",
          label: "Doanh nghiệp sản xuất",
          total: 1,
          default_charts: ["ROE"],
          chapters: [
            {
              chapter: "Chỉ tiêu chung",
              academy_chapter: 8,
              groups: [{ group: "Hiệu quả", items: [{ name: "ROE", metric_key: "roe", kind: "B" }] }],
            },
          ],
        },
      ],
    }
  }
  if (path.startsWith("/fundamental/")) return { symbol: "FPT", nganh: "thuong", per: "q", charts: {} }
  if (path.startsWith("/valuation/")) return { symbol: "FPT", nganh: "thuong", dates: [], charts: {} }
  return {}
}

function paths() {
  return mocks.api.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${String(path)}`)
}

async function renderPage(initial: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/luyen-tap",
        loader: workspaceLoader,
        handle: { chrome: practiceChrome },
        element: <RailProvider><HeaderSearch /><PracticePage /></RailProvider>,
      },
      {
        path: "/flashback",
        loader: workspaceLoader,
        handle: { chrome: flashbackChrome },
        element: <RailProvider><HeaderSearch /><FlashbackSectionPage /></RailProvider>,
      },
      { path: "/demo-trading", loader: workspaceLoader },
    ],
    { initialEntries: [initial] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  // The route loader runs first, so the workspace appears a tick after render.
  await screen.findByRole("navigation", { name: "Công cụ theo trang" })
  return { router, ...view }
}

const rail = () => screen.getByRole("navigation", { name: "Công cụ theo trang" })
const panel = () => screen.getByRole("complementary")
const frame = () => screen.getByTestId("workspace-frame")

beforeEach(() => {
  workspaceMemory.reset()
  mocks.api.mockReset()
  mocks.api.mockImplementation(respond)
  botApi = createFakeApi(createWorld())
  shopBackend = createShopBackend({ balance: 300, lessons: 3 })
  dojoBackend = createDojoBackend({ belt: 0 })
  mocks.mascot = "bach_ho"
  mocks.workspaceStatus = 200
  academy.handler = createFakeAcademyApi().handler
  resetEnsuredWorkspaces()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const where = (router: { state: { location: { pathname: string; search: string } } }) => `${router.state.location.pathname}${router.state.location.search}`
const pressed = () => within(rail()).getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.textContent)
const tradingTabs = () => within(panel()).getByRole("tablist", { name: "Giao dịch" })
/** Giao dịch tabs whose content is on screen (the others stay mounted but hidden). */
const shownTradingPanels = () => [...panel().querySelectorAll<HTMLElement>("[data-trading-panel]")].filter((node) => !node.hidden).map((node) => node.dataset.tradingPanel)
const PRACTICE_RAIL = ["Candle Dojo", "Học viện", "Bot", "Giao dịch", "Dashboard phân tích"]

describe("LUYỆN TẬP for a brand-new user", () => {
  it("opens on Candle Dojo with the LUYỆN TẬP rail, full width and nothing locked", async () => {
    const { router } = await renderPage("/luyen-tap")
    const buttons = within(rail()).getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(PRACTICE_RAIL)
    expect(buttons.every((button) => !button.hasAttribute("disabled"))).toBe(true)
    expect(rail().querySelector("svg.lucide-lock-keyhole, svg.lucide-lock")).toBeNull()
    expect(await screen.findByTestId("dojo-home")).toBeTruthy()
    expect(pressed()).toEqual(["Candle Dojo"])
    expect(frame().getAttribute("data-panel-hidden")).toBe("true")
    expect(screen.queryByRole("tablist", { name: "Nội dung giao dịch" })).toBeNull()
    expect(router.state.location.pathname).toBe("/luyen-tap")
  })

  it("Giao dịch: Biểu đồ · Bảng giá · Thị trường in the main area and one Giao dịch panel with three tabs (N03)", async () => {
    await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh")
    expect(pressed()).toEqual(["Giao dịch"])
    const tabs = screen.getByRole("tablist", { name: "Nội dung giao dịch" })
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Biểu đồ", "Bảng giá", "Thị trường"])
    expect(within(tabs).getByRole("tab", { name: "Biểu đồ" }).getAttribute("aria-selected")).toBe("true")
    expect(await screen.findByTestId("chart-stub")).toBeTruthy()

    expect(panel().getAttribute("aria-label")).toBe("Giao dịch")
    expect(within(panel()).getByRole("heading", { name: "Giao dịch" })).toBeTruthy()
    const panelTabs = within(tradingTabs()).getAllByRole("tab")
    expect(panelTabs.map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([
      ["Đặt lệnh", "true"], ["Danh mục", "false"], ["Tin tức", "false"],
    ])
    expect(within(panel()).getByLabelText(/Khối lượng/)).toBeTruthy()
  })

  it("opens Học viện with no tabs and no page heading", async () => {
    await renderPage("/luyen-tap?tool=hoc-vien")
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual(PRACTICE_RAIL)
    expect(document.body.textContent).not.toMatch(/Mở khóa|Cấp \d|trứng|Hành trình/i)
    expect(pressed()).toEqual(["Học viện"])
    expect(within(panel()).getByRole("heading", { name: "Học viện" })).toBeTruthy()
    expect(await within(panel()).findByText("116 bài học")).toBeTruthy()
    expect(await within(panel()).findByText("Chương 1 · Nền tảng")).toBeTruthy()
    expect(within(panel()).getByRole("progressbar", { name: "Tiến độ học tập" })).toBeTruthy()
    expect(await within(panel()).findByRole("button", { name: "Học bài Bài học 1.1" })).toBeTruthy()
    expect(screen.queryByRole("tablist", { name: "Nội dung giao dịch" })).toBeNull()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByTestId("chart-stub")).toBeNull()
  })

  it("shows the default mascot stage, never an egg, and never calls the retired journey endpoints", async () => {
    mocks.mascot = null
    await renderPage("/luyen-tap?tool=hoc-vien")
    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho"))
    expect(screen.getByRole("heading", { level: 2, name: "Bạch Hổ" })).toBeTruthy()
    expect(screen.queryByLabelText(/Trứng linh thú/)).toBeNull()
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot|\/learning-plan/.test(call))).toEqual([])
  })

  it("draws the active mascot reported by the workspace state", async () => {
    mocks.mascot = "phung_hoang"
    await renderPage("/luyen-tap?tool=hoc-vien")
    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("phung_hoang"))
  })

  it("still renders with Bạch Hổ while the workspace routes are not deployed (404)", async () => {
    mocks.workspaceStatus = 404
    await renderPage("/luyen-tap?tool=hoc-vien")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("calls POST /workspace/ensure exactly once, not on later renders or tool changes", async () => {
    const user = userEvent.setup()
    const { unmount } = await renderPage("/luyen-tap?tool=hoc-vien")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    await user.click(within(rail()).getByRole("button", { name: "Học viện" }))
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
    unmount()

    await renderPage("/flashback?tool=shop")
    await waitFor(() => expect(screen.getByRole("heading", { name: "Linh thú" })).toBeTruthy())
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
  })

  it("maps a legacy /demo-trading?view=journey link onto Học viện without any hatch or placement call", async () => {
    const { router } = await renderPage("/demo-trading?view=journey&content=journey&symbol=FPT")
    await waitFor(() => expect(where(router)).toBe("/luyen-tap?tool=hoc-vien&symbol=FPT"))
    expect(pressed()).toEqual(["Học viện"])
    expect(await within(panel()).findByText("116 bài học")).toBeTruthy()
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot/.test(call))).toEqual([])
  })

  it("opens the Bot tool on request with its own panel", async () => {
    const user = userEvent.setup()
    await renderPage("/luyen-tap?tool=hoc-vien")
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    await waitFor(() => expect(within(panel()).getByRole("heading", { name: "Bot" })).toBeTruthy(), { timeout: 5000 })
    await waitFor(() => expect(within(panel()).getAllByRole("article")).toHaveLength(16))
    expect(panel().textContent).not.toMatch(/Chương|Đã mở|đã mở/)
    expect(await screen.findByTestId("bot-state-chip")).toBeTruthy()
    expect(screen.getByText("Vốn Bot ban đầu")).toBeTruthy()
  })
})

describe("LUYỆN TẬP → Giao dịch panel (layout v1.3 §3)", () => {
  it("a tab replaces the whole panel content, one tab at a time, in the URL (N04)", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT")
    await user.click(within(tradingTabs()).getByRole("tab", { name: "Danh mục" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT")
    await waitFor(() => expect(within(tradingTabs()).getByRole("tab", { name: "Danh mục" }).getAttribute("aria-selected")).toBe("true"))
    expect(shownTradingPanels()).toEqual(["danh-muc"])
    expect(await within(panel()).findByText("Theo dõi")).toBeTruthy()

    await user.click(within(tradingTabs()).getByRole("tab", { name: "Tin tức" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&symbol=FPT")
    expect(await within(panel()).findByRole("button", { name: "Làm mới tin tức" })).toBeTruthy()
    await waitFor(() => expect(shownTradingPanels()).toEqual(["tin-tuc"]))
    expect(within(panel()).getAllByRole("heading", { name: "Giao dịch" })).toHaveLength(1)
  })

  it("arrow keys move between the tabs", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh")
    within(tradingTabs()).getByRole("tab", { name: "Đặt lệnh" }).focus()
    await user.keyboard("{ArrowRight}")
    expect(new URLSearchParams(router.state.location.search).get("tab")).toBe("danh-muc")
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Danh mục"))
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true")
    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Đặt lệnh"))
    await user.keyboard("{ArrowLeft}")
    expect(new URLSearchParams(router.state.location.search).get("tab")).toBe("tin-tuc")
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Tin tức"))
  })

  it("keeps the order being typed across tab switches and a panel collapse (N05, N06)", async () => {
    const user = userEvent.setup()
    await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT")
    const quantity = await within(panel()).findByLabelText(/Khối lượng/)
    await user.clear(quantity)
    await user.type(quantity, "700")
    await user.click(within(tradingTabs()).getByRole("tab", { name: "Danh mục" }))
    await waitFor(() => expect(shownTradingPanels()).toEqual(["danh-muc"]))
    await user.click(within(tradingTabs()).getByRole("tab", { name: "Đặt lệnh" }))
    expect((await within(panel()).findByLabelText(/Khối lượng/) as HTMLInputElement).value).toBe("700")

    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(workspaceMemory.get().practice?.collapsedTool).toBe("giao-dich")
    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect((within(panel()).getByLabelText(/Khối lượng/) as HTMLInputElement).value).toBe("700")
  })

  it("collapsing and reopening Giao dịch comes back on the same tab (N06)", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=tin-tuc")
    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(pressed()).toEqual([])
    expect(screen.getByRole("complementary", { hidden: true }).hasAttribute("inert")).toBe(true)
    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(pressed()).toEqual(["Giao dịch"])
    expect(new URLSearchParams(router.state.location.search).get("tab")).toBe("tin-tuc")
  })

  it("a link inside Danh mục opens the Đặt lệnh tab (N07)", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT")
    await user.click(await within(panel()).findByRole("tab", { name: /Nắm giữ/ }))
    await user.click(await within(panel()).findByRole("button", { name: "Sang Đặt lệnh" }))
    await waitFor(() => expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"))
    expect(await within(panel()).findByLabelText(/Khối lượng/)).toBeTruthy()
  })

  it("another tool switches without collapsing and Giao dịch comes back with its tabs", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=danh-muc&content=board&symbol=FPT")
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    expect(where(router)).toBe("/luyen-tap?tool=bot&symbol=FPT")
    await waitFor(() => expect(pressed()).toEqual(["Bot"]))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(screen.queryByRole("tablist", { name: "Nội dung giao dịch" })).toBeNull()
    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&symbol=FPT&tab=danh-muc&content=board")
    await waitFor(() => expect(pressed()).toEqual(["Giao dịch"]))
  })

  it("selecting a main tab only changes the content param", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT")
    await user.click(screen.getByRole("tab", { name: "Thị trường" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT&content=market")
    await user.click(screen.getByRole("tab", { name: "Biểu đồ" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=danh-muc&symbol=FPT")
  })
})

describe("LUYỆN TẬP layout behaviour", () => {
  it.each([
    ["/demo-trading?view=hunt&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/demo-trading?view=portfolio&content=board", "/luyen-tap?tool=giao-dich&tab=danh-muc&content=board"],
    ["/demo-trading?content=ai-analysis&analysis=stock&symbol=FPT", "/luyen-tap?tool=giao-dich&tab=dat-lenh&symbol=FPT"],
    ["/demo-trading?view=bot&content=board", "/luyen-tap?tool=bot"],
    ["/demo-trading?content=dashboard&symbol=FPT", "/luyen-tap?tool=phan-tich&symbol=FPT"],
    ["/demo-trading?view=shop", "/flashback?tool=shop"],
    ["/luyen-tap?tool=giao-dich", "/luyen-tap?tool=giao-dich&tab=dat-lenh"],
  ])("rewrites %s to %s before the workspace renders (N19)", async (initial, expected) => {
    const { router } = await renderPage(initial)
    expect(where(router)).toBe(expected)
  })

  it("never shows Insight, Shop or Flashback in the LUYỆN TẬP rail (N02, N09)", async () => {
    await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh")
    expect(within(rail()).queryByRole("button", { name: /Insight|Shop|Flashback|Săn mã|Mẫu nến|Đặt lệnh|Danh mục|Tin tức/ })).toBeNull()
  })

  it("Dashboard phân tích fills the main area with the main tabs and no panel; a tab opens Giao dịch", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=phan-tich&symbol=FPT")
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })).toBeTruthy()
    expect(pressed()).toEqual(["Dashboard phân tích"])
    expect(frame().getAttribute("data-panel-hidden")).toBe("true")
    const tabs = screen.getByRole("tablist", { name: "Nội dung giao dịch" })
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "false"])
    // A second click changes nothing: the tool has no panel.
    await user.click(within(rail()).getByRole("button", { name: "Dashboard phân tích" }))
    expect(where(router)).toBe("/luyen-tap?tool=phan-tich&symbol=FPT")

    await user.click(within(tabs).getByRole("tab", { name: "Bảng giá" }))
    expect(where(router)).toBe("/luyen-tap?tool=giao-dich&symbol=FPT&tab=dat-lenh&content=board")
    await waitFor(() => expect(pressed()).toEqual(["Giao dịch"]))
  })

  it("Học viện collapses on a second click and its collapsed state is its own", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=hoc-vien&symbol=FPT")
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    expect(where(router)).toBe("/luyen-tap?tool=bot&symbol=FPT")
    await waitFor(() => expect(pressed()).toEqual(["Bot"]))
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(workspaceMemory.get().practice?.collapsedTool).toBe("bot")
    await user.click(within(rail()).getByRole("button", { name: "Học viện" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
  })

  it("puts the long-form tools in a bar above the main area on phones; the bar opens the layer", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: (query === "(max-width: 900px)" || query === "(max-width: 767px)"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    const user = userEvent.setup()
    const { unmount } = await renderPage("/luyen-tap?tool=hoc-vien")
    expect(frame().getAttribute("data-rail")).toBe("bar")
    expect(screen.getByRole("main").firstElementChild).toBe(rail())
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual(PRACTICE_RAIL)
    const toggle = within(rail()).getByRole("button", { name: "Học viện" })
    expect(toggle.getAttribute("aria-controls")).toBe(panel().id)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    await user.click(toggle)
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    await user.click(toggle)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    unmount()

    // Giao dịch keeps the rail column; its tabs switch inside the layer (N21).
    await renderPage("/luyen-tap?tool=giao-dich&tab=dat-lenh")
    expect(frame().getAttribute("data-rail")).toBe("column")
    expect(rail().classList.contains("workspace-rail")).toBe(true)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    await user.click(within(tradingTabs()).getByRole("tab", { name: "Tin tức" }))
    await waitFor(() => expect(within(tradingTabs()).getByRole("tab", { name: "Tin tức" }).getAttribute("aria-selected")).toBe("true"))
    expect(frame().getAttribute("data-panel-open")).toBe("true")
  })

  it("updates the active symbol from HeaderSearch without leaving Dashboard phân tích", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=phan-tich&symbol=FPT")
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Tìm mã cổ phiếu" }))
    await user.type(screen.getByRole("combobox", { name: "Tìm mã hoặc tên công ty" }), "VCB")
    await user.click(await screen.findByRole("option", { name: /VCB/ }))
    expect(where(router)).toBe("/luyen-tap?tool=phan-tich&symbol=VCB")
  })

  it("remembers each section's own params in session memory", async () => {
    await renderPage("/luyen-tap?tool=giao-dich&tab=tin-tuc&content=market&symbol=FPT")
    expect(workspaceMemory.get().practice).toMatchObject({ params: "tool=giao-dich&tab=tin-tuc&content=market", lastTab: "market", tradingTab: "tin-tuc" })
    expect(workspaceMemory.get().flashback).toBeUndefined()
  })
})

describe("Candle Dojo in LUYỆN TẬP", () => {
  it("opens as one screen without a panel, and a task hides the rail until it ends", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=hoc-vien")
    await user.click(within(rail()).getByRole("button", { name: "Candle Dojo" }))
    expect(where(router)).toBe("/luyen-tap?tool=candle-dojo")
    expect(await screen.findByTestId("dojo-home")).toBeTruthy()
    await waitFor(() => expect(pressed()).toEqual(["Candle Dojo"]))
    expect(frame().getAttribute("data-panel-hidden")).toBe("true")
    expect(frame().getAttribute("data-rail-hidden")).toBe("false")

    await user.click(document.querySelector("[data-intro='anatomy']") as HTMLElement)
    expect(await screen.findByTestId("dojo-intro")).toBeTruthy()
    expect(frame().getAttribute("data-rail-hidden")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Thoát nhập môn" }))
    expect(await screen.findByTestId("dojo-home")).toBeTruthy()
    expect(within(rail()).getByRole("button", { name: "Candle Dojo" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("the Thẻ nến block opens FLASHBACK → Shop with its panel", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=candle-dojo&symbol=FPT")
    await screen.findByTestId("dojo-home")
    await user.click(screen.getByRole("button", { name: "Mở Shop › Thẻ nến" }))
    await waitFor(() => expect(where(router)).toBe("/flashback?tool=shop&symbol=FPT"))
    await waitFor(() => expect(pressed()).toEqual(["Shop"]))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
  })
})

describe("FLASHBACK section", () => {
  it("lists Flashback · Shop and opens the lobby full width (N10)", async () => {
    await renderPage("/flashback")
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Flashback", "Shop"])
    expect(pressed()).toEqual(["Flashback"])
    expect(frame().getAttribute("data-panel-hidden")).toBe("true")
  })

  it("Shop has Linh thú and Thẻ nến, no Premium and no xu ↔ Demo cash exchange (N12, N15)", async () => {
    await renderPage("/flashback?tool=shop")
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
    expect((await within(panel()).findByTestId("shop-balance")).textContent).toBe("300")
    expect(document.body.textContent).not.toMatch(/Premium|Đổi xu|tiền Demo/)
    expect(within(panel()).getByRole("button", { name: /Vào Học viện/ })).toBeTruthy()
  })

  it("the Shop's Học viện link opens LUYỆN TẬP → Học viện", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/flashback?tool=shop&symbol=FPT")
    await user.click(await within(panel()).findByRole("button", { name: /Vào Học viện/ }))
    await waitFor(() => expect(where(router)).toBe("/luyen-tap?tool=hoc-vien&symbol=FPT"))
    await waitFor(() => expect(pressed()).toEqual(["Học viện"]))
  })

  it("each section keeps its tool, Giao dịch tab and collapsed panel across switches (N18)", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/luyen-tap?tool=giao-dich&tab=tin-tuc&symbol=FPT")
    await user.click(within(rail()).getByRole("button", { name: "Giao dịch" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")

    await act(() => router.navigate(headerDestination("/flashback", router.state.location, workspaceMemory.get()), { state: { workspaceSection: true } }))
    await waitFor(() => expect(router.state.location.pathname).toBe("/flashback"))
    await user.click(await within(rail()).findByRole("button", { name: "Shop" }))
    await waitFor(() => expect(pressed()).toEqual(["Shop"]))
    await user.click(within(rail()).getByRole("button", { name: "Shop" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")

    await act(() => router.navigate(headerDestination("/luyen-tap", router.state.location, workspaceMemory.get()), { state: { workspaceSection: true } }))
    await waitFor(() => expect(where(router)).toBe("/luyen-tap?tool=giao-dich&tab=tin-tuc&symbol=FPT"))
    await waitFor(() => expect(within(rail()).getByRole("button", { name: "Giao dịch" })).toBeTruthy())
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")

    await act(() => router.navigate(headerDestination("/flashback", router.state.location, workspaceMemory.get()), { state: { workspaceSection: true } }))
    await waitFor(() => expect(where(router)).toBe("/flashback?tool=shop&symbol=FPT"))
    await waitFor(() => expect(within(rail()).getByRole("button", { name: "Shop" })).toBeTruthy())
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
  })
})
