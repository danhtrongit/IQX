import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { demoChrome } from "@/config/chrome"
import { RailProvider } from "@/context/rail"
import { createFakeApi, createWorld } from "./bot/test-support"
import { DemoTradingPage } from "./demo-trading-page"
import { createFakeAcademyApi } from "@/pages/academy/test-api"
import { demoTradingLoader } from "./workspace-url"
import { workspaceMemory } from "./workspace-sections"
import { createShopBackend, type ShopBackend } from "./shop/shop-test-support"
import { resetEnsuredWorkspaces } from "./workspace/workspace-api"

let shopBackend: ShopBackend

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
  void init
  return {}
}

function paths() {
  return mocks.api.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${String(path)}`)
}

async function renderPage(initial: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/demo-trading",
        loader: demoTradingLoader,
        handle: { chrome: demoChrome },
        element: <RailProvider><DemoTradingPage /></RailProvider>,
      },
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

describe("DemoTradingPage for a brand-new user", () => {
  it("opens on Đặt lệnh in DEMO TRADING with the section's rail and nothing locked", async () => {
    await renderPage("/demo-trading")

    const buttons = within(rail()).getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(["Đặt lệnh", "Danh mục", "Tin tức", "Insight"])
    expect(buttons.every((button) => !button.hasAttribute("disabled"))).toBe(true)
    expect(rail().querySelector("svg.lucide-lock-keyhole, svg.lucide-lock")).toBeNull()
    expect(document.body.textContent).not.toMatch(/Mở khóa|Cấp \d|trứng|Hành trình/i)

    expect(within(rail()).getByRole("button", { name: "Đặt lệnh" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(panel()).getByRole("heading", { name: "Đặt lệnh" })).toBeTruthy()
    // Biểu đồ is the default tab; there is no overview tab any more.
    const tabs = screen.getByRole("tablist", { name: "Nội dung demo trading" })
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Biểu đồ", "Bảng giá", "Thị trường"])
    expect(within(tabs).getByRole("tab", { name: "Biểu đồ" }).getAttribute("aria-selected")).toBe("true")
    expect(within(tabs).queryByRole("tab", { name: "Tổng quan" })).toBeNull()
    expect(await screen.findByTestId("chart-stub")).toBeTruthy()
  })

  it("opens HỌC VIỆN on the Học viện tool with no tabs and no page heading", async () => {
    await renderPage("/demo-trading?view=academy")

    const buttons = within(rail()).getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(["Học viện", "Bot", "Shop"])
    expect(buttons.every((button) => !button.hasAttribute("disabled"))).toBe(true)
    expect(document.body.textContent).not.toMatch(/Mở khóa|Cấp \d|trứng|Hành trình/i)

    expect(within(rail()).getByRole("button", { name: "Học viện" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(panel()).getByRole("heading", { name: "Học viện" })).toBeTruthy()
    expect(within(panel()).getByText("43 bài học")).toBeTruthy()
    // The panel lists the real catalog and the learner's progress.
    expect(await within(panel()).findByText("Chương 1 · Nền tảng")).toBeTruthy()
    expect(within(panel()).getByRole("progressbar", { name: "Tiến độ học tập" })).toBeTruthy()
    expect(await within(panel()).findByRole("button", { name: /^Học bài/ })).toBeTruthy()
    expect(screen.queryByTestId("academy-empty")).toBeNull()
    // The main area is the tool's own view: no tablist, no page heading block.
    expect(screen.queryByRole("tablist", { name: "Nội dung demo trading" })).toBeNull()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByTestId("chart-stub")).toBeNull()
    // Wide screens have no panel button in the main area: the rail shows and hides the panel.
    expect(within(screen.getByRole("main")).queryByRole("button", { name: "Học viện" })).toBeNull()
  })

  it("shows the default mascot stage, never an egg, and never calls the retired journey endpoints", async () => {
    mocks.mascot = null
    await renderPage("/demo-trading?view=academy")

    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho"))
    expect(screen.getByRole("heading", { level: 2, name: "Bạch Hổ" })).toBeTruthy()
    expect(screen.queryByLabelText(/Trứng linh thú/)).toBeNull()
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot|\/learning-plan/.test(call))).toEqual([])
  })

  it("draws the active mascot reported by the workspace state", async () => {
    mocks.mascot = "phung_hoang"
    await renderPage("/demo-trading?view=academy")
    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("phung_hoang"))
    expect(screen.getByRole("heading", { level: 2, name: "Phụng Hoàng" })).toBeTruthy()
  })

  it("still renders with Bạch Hổ while the workspace routes are not deployed (404)", async () => {
    mocks.workspaceStatus = 404
    await renderPage("/demo-trading?view=academy")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("calls POST /workspace/ensure exactly once, not on later renders or tool changes", async () => {
    const user = userEvent.setup()
    const { unmount } = await renderPage("/demo-trading?view=academy")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    await user.click(within(rail()).getByRole("button", { name: "Shop" }))
    await user.click(within(rail()).getByRole("button", { name: "Học viện" }))
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
    expect(paths().filter((call) => call.startsWith("GET /workspace/ensure"))).toEqual([])
    unmount()

    await renderPage("/demo-trading?view=shop")
    await waitFor(() => expect(screen.getByRole("heading", { name: "Linh thú" })).toBeTruthy())
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
  })

  it("ensures the workspace whichever main tab is opened first", async () => {
    await renderPage("/demo-trading?content=board")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
  })

  it("maps a legacy ?view=journey link onto the Học viện tool without any hatch or placement call", async () => {
    const { router } = await renderPage("/demo-trading?view=journey&content=journey&symbol=FPT")
    await waitFor(() => expect(router.state.location.search).toBe("?view=academy&symbol=FPT"))
    expect(within(rail()).getByRole("button", { name: "Học viện" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(panel()).getByText("43 bài học")).toBeTruthy()
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot/.test(call))).toEqual([])
  })

  it("opens every tool on request: none of them asks for a level", async () => {
    const user = userEvent.setup()
    await renderPage("/demo-trading?view=academy")

    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    await waitFor(() => expect(within(panel()).getByRole("heading", { name: "Bot" })).toBeTruthy())
    // The Bot panel: buy source card, search and the 16 indicators; main: KPIs and the mascot with the config state.
    await waitFor(() => expect(within(panel()).getAllByRole("article")).toHaveLength(16))
    expect(within(panel()).getByText("5 / 16 chỉ báo đã mở")).toBeTruthy()
    expect(within(panel()).getByRole("region", { name: "Danh mục mua mới" })).toBeTruthy()
    expect(within(panel()).getByRole("searchbox", { name: "Tìm chỉ báo" })).toBeTruthy()
    expect(await screen.findByTestId("bot-state-chip")).toBeTruthy()
    expect(screen.getByText("Vốn Bot ban đầu")).toBeTruthy()
    expect(panel().textContent).not.toMatch(/tốt nghiệp|Cấp \d|trứng/i)

    await user.click(within(rail()).getByRole("button", { name: "Shop" }))
    expect(await within(panel()).findByRole("heading", { name: "Shop" })).toBeTruthy()
    expect(await screen.findByRole("heading", { name: "Linh thú" })).toBeTruthy()
    expect((await within(panel()).findByTestId("shop-balance")).textContent).toBe("300")
    expect(within(panel()).getByRole("button", { name: /Vào Học viện/ })).toBeTruthy()
  })
})

describe("DemoTradingPage layout v1.2 behaviour", () => {
  const pressed = () => within(rail()).getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.textContent)

  it.each([
    ["/demo-trading?view=hunt&symbol=FPT", "?view=trading&symbol=FPT"],
    ["/demo-trading?view=patterns&content=board", "?view=trading"],
    ["/demo-trading?content=overview", ""],
    ["/demo-trading?content=ai-analysis&analysis=stock&symbol=FPT", "?content=insight&symbol=FPT"],
    ["/demo-trading?view=bot&content=board", "?view=bot"],
  ])("rewrites the legacy link %s to %s before the workspace renders", async (initial, expected) => {
    const { router } = await renderPage(initial)
    expect(router.state.location.search).toBe(expected)
  })

  it("lists the DEMO TRADING tools only and opens each tool's panel", async () => {
    const user = userEvent.setup()
    await renderPage("/demo-trading")
    await user.click(within(rail()).getByRole("button", { name: "Danh mục" }))
    expect(await within(panel()).findByRole("heading", { name: "Danh mục" })).toBeTruthy()
    await user.click(within(rail()).getByRole("button", { name: "Tin tức" }))
    expect(await within(panel()).findByRole("heading", { name: "Tin tức" })).toBeTruthy()
    expect(pressed()).toEqual(["Tin tức"])
    expect(within(rail()).queryByRole("button", { name: /Săn mã|Mẫu nến|Bot|Shop|Học viện/ })).toBeNull()
  })

  it("collapses the panel on a second click of the active tool and brings it back with another", async () => {
    const user = userEvent.setup()
    await renderPage("/demo-trading")
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(pressed()).toEqual(["Đặt lệnh"])

    await user.click(within(rail()).getByRole("button", { name: "Đặt lệnh" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(pressed()).toEqual([])
    // The panel stays mounted, only inert.
    expect(screen.getByRole("complementary", { hidden: true }).hasAttribute("inert")).toBe(true)
    expect(workspaceMemory.get().demo?.collapsedTool).toBe("trading")

    await user.click(within(rail()).getByRole("button", { name: "Danh mục" }))
    await waitFor(() => expect(pressed()).toEqual(["Danh mục"]))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
    expect(workspaceMemory.get().demo?.collapsedTool).toBeNull()
  })

  it("Insight replaces the tabs with the stock view and a second click returns to the last tab", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/demo-trading?content=board&symbol=FPT")
    expect(screen.getByRole("tab", { name: "Bảng giá" }).getAttribute("aria-selected")).toBe("true")

    await user.click(within(rail()).getByRole("button", { name: "Insight" }))
    expect(router.state.location.search).toBe("?content=insight&symbol=FPT")
    // No tab is selected while Insight is shown, and its panel is collapsed.
    await waitFor(() => expect(pressed()).toEqual(["Insight"]))
    const tabs = within(screen.getByRole("tablist", { name: "Nội dung demo trading" })).getAllByRole("tab")
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "false"])
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")

    await user.click(within(rail()).getByRole("button", { name: "Insight" }))
    expect(router.state.location.search).toBe("?content=board&symbol=FPT")
    await waitFor(() => expect(screen.getByRole("tab", { name: "Bảng giá" }).getAttribute("aria-selected")).toBe("true"))
    // Leaving Insight does not open the panel again by itself.
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(pressed()).toEqual([])
  })

  it("picking a panel tool while Insight is shown returns to the tab it replaced", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/demo-trading?content=market")
    await user.click(within(rail()).getByRole("button", { name: "Insight" }))
    expect(router.state.location.search).toBe("?content=insight")
    await user.click(within(rail()).getByRole("button", { name: "Tin tức" }))
    expect(router.state.location.search).toBe("?content=market&view=news")
    await waitFor(() => expect(pressed()).toEqual(["Tin tức"]))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("false")
  })

  it("selecting a tab only changes the content param", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/demo-trading?view=portfolio&symbol=FPT")
    await user.click(screen.getByRole("tab", { name: "Thị trường" }))
    expect(router.state.location.search).toBe("?view=portfolio&symbol=FPT&content=market")
    await user.click(screen.getByRole("tab", { name: "Biểu đồ" }))
    expect(router.state.location.search).toBe("?view=portfolio&symbol=FPT")
  })

  it("HỌC VIỆN switches tools through its own rail and keeps the main area free of tabs", async () => {
    const user = userEvent.setup()
    const { router } = await renderPage("/demo-trading?view=academy&symbol=FPT")
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    expect(router.state.location.search).toBe("?view=bot&symbol=FPT")
    await waitFor(() => expect(pressed()).toEqual(["Bot"]))
    expect(screen.queryByRole("tablist", { name: "Nội dung demo trading" })).toBeNull()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    await user.click(within(rail()).getByRole("button", { name: "Bot" }))
    expect(frame().getAttribute("data-panel-collapsed")).toBe("true")
    expect(pressed()).toEqual([])
    expect(workspaceMemory.get().academy?.collapsedTool).toBe("bot")
  })

  it("remembers each section's own params in session memory", async () => {
    await renderPage("/demo-trading?view=portfolio&content=market&symbol=FPT")
    expect(workspaceMemory.get().demo).toMatchObject({ params: "view=portfolio&content=market", lastTab: "market" })
    expect(workspaceMemory.get().academy).toBeUndefined()
  })

  it("puts HỌC VIỆN's tools in a bar above the lesson on narrow screens; the bar opens the layer", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 900px)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    const user = userEvent.setup()
    const { unmount } = await renderPage("/demo-trading?view=academy")
    // The article keeps the full phone width: no rail column, the tools sit at the top of main.
    expect(frame().getAttribute("data-rail")).toBe("bar")
    expect(frame().querySelector(".workspace-rail")).toBeNull()
    expect(screen.getByRole("main").firstElementChild).toBe(rail())
    expect(within(rail()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Học viện", "Bot", "Shop"])
    expect(within(screen.getByRole("main")).getAllByRole("button", { name: "Học viện" })).toHaveLength(1)
    const toggle = within(rail()).getByRole("button", { name: "Học viện" })
    expect(toggle.getAttribute("aria-controls")).toBe(panel().id)
    expect(screen.queryByRole("tablist", { name: "Nội dung demo trading" })).toBeNull()
    // A direct link to a tool shows its layer.
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    await user.click(toggle)
    expect(frame().getAttribute("data-panel-open")).toBe("false")
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    await user.click(toggle)
    expect(frame().getAttribute("data-panel-open")).toBe("true")
    unmount()
  })

  it("keeps the rail column of DEMO TRADING on narrow screens", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 900px)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    await renderPage("/demo-trading?view=trading")
    expect(frame().getAttribute("data-rail")).toBe("column")
    expect(rail().classList.contains("workspace-rail")).toBe(true)
  })
})
