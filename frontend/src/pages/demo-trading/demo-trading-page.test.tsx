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
  if (path === "/shop" || path.startsWith("/shop/") || path === "/academy/progress") return shopBackend.handle(path, init)
  // The catalog and the lessons of the Học viện tool (progress above is the Shop test double's).
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

beforeEach(() => {
  mocks.api.mockReset()
  mocks.api.mockImplementation(respond)
  botApi = createFakeApi(createWorld())
  shopBackend = createShopBackend({ balance: 300, lessons: 3 })
  mocks.mascot = "bach_ho"
  mocks.workspaceStatus = 200
  academy.handler = createFakeAcademyApi().handler
  resetEnsuredWorkspaces()
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
  it("opens on Học viện with every tool available, in rail order, and nothing locked", async () => {
    await renderPage("/demo-trading")

    const buttons = within(rail()).getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Học viện", "Đặt lệnh", "Danh mục", "Bot", "Shop", "Săn mã", "Tin tức", "Mẫu nến",
    ])
    expect(buttons.every((button) => !button.hasAttribute("disabled"))).toBe(true)
    expect(rail().querySelector("svg.lucide-lock-keyhole, svg.lucide-lock")).toBeNull()
    expect(document.body.textContent).not.toMatch(/Mở khóa|Cấp \d|trứng|Hành trình/i)

    expect(within(rail()).getByRole("button", { name: "Học viện" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(panel()).getByRole("heading", { name: "Học viện" })).toBeTruthy()
    expect(within(panel()).getByText("13 chương · 71 bài học")).toBeTruthy()
    // The panel lists the real catalog and the learner's progress; the left area keeps the mascot stage.
    expect(await within(panel()).findByText("CHƯƠNG 1")).toBeTruthy()
    expect(within(panel()).getByRole("progressbar", { name: "Tiến độ học tập" })).toBeTruthy()
    expect(within(panel()).getAllByRole("button", { name: /^Xem bài/ }).length).toBeGreaterThan(0)
    expect(screen.queryByTestId("academy-empty")).toBeNull()
    expect(screen.getByRole("heading", { level: 1, name: "Học viện" })).toBeTruthy()
  })

  it("shows the default mascot stage, never an egg, and never calls the retired journey endpoints", async () => {
    mocks.mascot = null
    await renderPage("/demo-trading")

    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho"))
    expect(screen.getByRole("heading", { level: 2, name: "Bạch Hổ" })).toBeTruthy()
    expect(screen.queryByLabelText(/Trứng linh thú/)).toBeNull()
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot|\/learning-plan/.test(call))).toEqual([])
  })

  it("draws the active mascot reported by the workspace state", async () => {
    mocks.mascot = "phung_hoang"
    await renderPage("/demo-trading")
    await waitFor(() => expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("phung_hoang"))
    expect(screen.getByRole("heading", { level: 2, name: "Phụng Hoàng" })).toBeTruthy()
  })

  it("still renders with Bạch Hổ while the workspace routes are not deployed (404)", async () => {
    mocks.workspaceStatus = 404
    await renderPage("/demo-trading")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe("bach_ho")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("calls POST /workspace/ensure exactly once, not on later renders or tool changes", async () => {
    const user = userEvent.setup()
    const { unmount } = await renderPage("/demo-trading")
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

  it("ensures the workspace even when the first tab opened is not the overview", async () => {
    await renderPage("/demo-trading?content=chart")
    await screen.findByTestId("chart-stub")
    await waitFor(() => expect(paths()).toContain("GET /workspace/state"))
    expect(paths().filter((call) => call === "POST /workspace/ensure")).toHaveLength(1)
  })

  it("maps a legacy ?view=journey link onto the Học viện tool without any hatch or placement call", async () => {
    const { router } = await renderPage("/demo-trading?view=journey&content=journey&symbol=FPT")
    await waitFor(() => expect(router.state.location.search).toBe("?view=academy&symbol=FPT"))
    expect(within(rail()).getByRole("button", { name: "Học viện" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(panel()).getByText("13 chương · 71 bài học")).toBeTruthy()
    expect(paths().filter((call) => /\/cap\d|\/journey|\/bot\/mascot/.test(call))).toEqual([])
  })

  it("opens every tool on request: none of them asks for a level", async () => {
    const user = userEvent.setup()
    await renderPage("/demo-trading")

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

    await user.click(within(rail()).getByRole("button", { name: "Săn mã" }))
    expect(await within(panel()).findByRole("heading", { name: "Săn mã" })).toBeTruthy()
    expect(within(panel()).getAllByRole("button", { name: /gom|đột biến|Vượt đỉnh|Tăng mạnh/ })).toHaveLength(5)
    expect(panel().textContent).not.toMatch(/Cấp 5|Lão luyện|Mở khóa/)
  })
})
