import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Route, Routes } from "react-router"
import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"

import { LocationProbe } from "../demo-trading/bot/location-probe"
import { stubBrowser } from "../demo-trading/bot/test-render"
import { callsTo } from "../demo-trading/bot/test-support"
import { alertView, createStrategyApi, createStrategyWorld, type StrategyWorld } from "./test-support"
import { StrategyPage } from "./strategy-page"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  auth: { isAuthenticated: true, isPremium: true, isLoading: false, premiumLoading: false },
  openAuth: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: mocks.auth.isAuthenticated ? { id: "user-1" } : null, ...mocks.auth, openAuth: mocks.openAuth }),
}))
vi.mock("@/lib/api", async () => {
  const { FakeApiError: ApiError } = await import("./test-support")
  return { api: mocks.api, ApiError, errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)) }
})
vi.mock("sonner", () => ({ toast: mocks.toast }))

let world: StrategyWorld

beforeEach(() => {
  mocks.auth.isAuthenticated = true
  mocks.auth.isPremium = true
  world = createStrategyWorld()
  for (const id of ["macd", "ma"]) {
    const config = world.indicators[id]!
    config.master_enabled = true
    config.buy.enabled = true
    config.sell.enabled = true
  }
  world.alerts = [alertView()]
  mocks.api.mockReset()
  mocks.api.mockImplementation(createStrategyApi(world))
  stubBrowser()
})
afterEach(() => vi.unstubAllGlobals())

function renderPage(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/chien-luoc" element={<StrategyPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const selectedTab = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent
const location = () => screen.getByTestId("location").textContent

describe("routing", () => {
  it("offers Cảnh báo, Backtest and Bộ lọc and opens Cảnh báo by default", async () => {
    renderPage("/chien-luoc")
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Cảnh báo", "Backtest", "Bộ lọc"])
    expect(selectedTab()).toBe("Cảnh báo")
    expect(await screen.findByRole("heading", { name: "Cảnh báo đang theo dõi" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Điều kiện Mua" })).toBeNull()
  })

  it.each([
    ["?tab=canh-bao", "Cảnh báo", "Cảnh báo đang theo dõi"],
    ["?tab=backtest", "Backtest", "Điều kiện Mua"],
    ["?tab=bo-loc", "Bộ lọc", "Điều kiện lọc"],
  ])("opens the tab named by %s", async (search, tab, marker) => {
    renderPage(`/chien-luoc${search}`)
    expect(selectedTab()).toBe(tab)
    expect(await screen.findByRole("heading", { name: marker })).toBeTruthy()
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
  })

  it("falls back to the current default for an unknown tab and keeps every other parameter", async () => {
    renderPage("/chien-luoc?tab=khong-co&symbol=VNM&utm=x")
    expect(selectedTab()).toBe("Cảnh báo")
    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Backtest" }))
    expect(location()).toBe("/chien-luoc?tab=backtest&symbol=VNM&utm=x")
    expect(selectedTab()).toBe("Backtest")
  })

  it("opens the Backtest of the symbol in an old link (?symbol=) and runs on exactly that symbol", async () => {
    const user = userEvent.setup()
    renderPage("/chien-luoc?tab=backtest&symbol=vnm")
    await screen.findByRole("heading", { name: "Điều kiện Mua" })
    await user.click(await screen.findByRole("button", { name: "Chạy backtest" }))
    await screen.findByTestId("backtest-results")
    expect((callsTo(world, "POST", "/strategy/backtests")[0]!.body as { symbol: string }).symbol).toBe("VNM")
  })

  it("changing tab replaces the history entry instead of adding one", async () => {
    const user = userEvent.setup()
    renderPage("/chien-luoc?tab=canh-bao")
    await user.click(screen.getByRole("tab", { name: "Bộ lọc" }))
    expect(location()).toBe("/chien-luoc?tab=bo-loc")
    expect(await screen.findByRole("heading", { name: "Điều kiện lọc" })).toBeTruthy()
  })
})

describe("state across tabs", () => {
  it("keeps the Backtest form and result, and the filter draft, when going to another tab and back, without re-running anything", async () => {
    const user = userEvent.setup()
    renderPage("/chien-luoc?tab=backtest&symbol=FPT")
    await screen.findByRole("heading", { name: "Điều kiện Mua" })
    await user.selectOptions(screen.getByLabelText("Khớp lệnh"), "same_close")
    await user.click(screen.getByRole("button", { name: "Chạy backtest" }))
    await screen.findByTestId("backtest-results")

    await user.click(screen.getByRole("tab", { name: "Bộ lọc" }))
    await user.click(await screen.findByRole("button", { name: "Thêm ROE vào điều kiện lọc" }))
    expect(screen.getByTestId("rule-roe")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "Cảnh báo" }))
    expect(await screen.findByRole("heading", { name: "Cảnh báo đang theo dõi" })).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Backtest" }))
    expect((screen.getByLabelText("Khớp lệnh") as HTMLSelectElement).value).toBe("same_close")
    expect(screen.getByTestId("backtest-results")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Bộ lọc" }))
    expect(screen.getByTestId("rule-roe")).toBeTruthy()

    expect(callsTo(world, "POST", "/strategy/backtests")).toHaveLength(1)
    expect(callsTo(world, "POST", "/strategy/screener/run")).toHaveLength(0)
    expect(callsTo(world, "PATCH", "/strategy/shared-config")).toHaveLength(0)
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
  })

  it("does not load a tab until it is opened", async () => {
    renderPage("/chien-luoc?tab=canh-bao")
    await screen.findByRole("heading", { name: "Cảnh báo đang theo dõi" })
    await waitFor(() => expect(callsTo(world, "GET", "/strategy/alerts").length).toBeGreaterThanOrEqual(1))
    expect(callsTo(world, "GET", "/strategy/screener/metrics")).toHaveLength(0)
    expect(callsTo(world, "GET", "/strategy/backtests")).toHaveLength(0)
  })
})

describe("access", () => {
  it("asks a guest to sign in and renders none of the three tools", () => {
    mocks.auth.isAuthenticated = false
    renderPage("/chien-luoc?tab=backtest")
    expect(screen.getByText("Cần đăng nhập")).toBeTruthy()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(world.calls).toHaveLength(0)
  })

  it("explains the plan requirement instead of calling the premium routes", () => {
    mocks.auth.isPremium = false
    renderPage("/chien-luoc?tab=bo-loc")
    expect(screen.getByText("Cần gói Premium")).toBeTruthy()
    expect(within(document.body).getByRole("link", { name: "Xem gói Premium" })).toBeTruthy()
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(world.calls).toHaveLength(0)
  })
})
