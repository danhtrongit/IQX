import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { demoChrome } from "@/config/chrome"
import { RailProvider } from "@/context/rail"
import { DemoTradingPage } from "../demo-trading-page"
import { demoTradingLoader } from "../workspace-url"
import { resetEnsuredWorkspaces } from "../workspace/workspace-api"
import { createBackend, type FakeBackend } from "./practice.backend"

const mocks = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
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
  apiResponse: vi.fn(),
  errorMessage: (error: unknown) => String(error),
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    details?: unknown
    constructor(message: string, status: number, options?: string | { code?: string; details?: unknown }) {
      super(message)
      this.status = status
      const values = typeof options === "string" ? { code: options } : options
      this.code = values?.code
      this.details = values?.details
    }
  },
}))

vi.mock("@/pages/charts/chart-page", () => ({ ChartPage: () => <div data-testid="chart-stub" /> }))
vi.mock("./../journey/mascot-2d/Mascot2DStage", () => ({ Mascot2DStage: () => <div data-testid="mascot-2d" /> }))

let backend: FakeBackend

async function respond(path: string, init?: RequestInit): Promise<unknown> {
  if (path.startsWith("/practice/")) return backend.api(path, init)
  const { ApiError } = await import("@/lib/api")
  if (path === "/workspace/ensure") return { data: { ok: true } }
  if (path === "/workspace/state") return { data: { active_mascot: { mascot_id: "bach_ho" } } }
  if (path === "/watchlists") return { data: [] }
  throw new ApiError("Not found", 404)
}

async function renderPage(initial: string) {
  const router = createMemoryRouter(
    [{ path: "/demo-trading", loader: demoTradingLoader, handle: { chrome: demoChrome }, element: <RailProvider><DemoTradingPage /></RailProvider> }],
    { initialEntries: [initial] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole("navigation", { name: "Công cụ theo trang" })
  return router
}

beforeEach(() => {
  backend = createBackend()
  mocks.api.mockReset()
  mocks.api.mockImplementation(respond)
  resetEnsuredWorkspaces()
  window.localStorage.clear()
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => vi.unstubAllGlobals())

describe("/demo-trading?view=bot&practice=<id>", () => {
  it("renders the practice in the main area and the right panel, and Về Bot drops only the practice param", async () => {
    const user = userEvent.setup()
    const router = await renderPage("/demo-trading?view=bot&practice=rsi&symbol=FPT")
    const panel = within(screen.getByRole("complementary"))
    expect(await panel.findByRole("heading", { name: "Luyện tập RSI" })).toBeTruthy()
    expect(await screen.findByRole("heading", { level: 1, name: "Luyện tập RSI" })).toBeTruthy()
    expect(await screen.findByTestId("practice-chart")).toBeTruthy()
    expect(panel.getByText("Lượt 01 / 30 · Điều kiện Mua / Bán")).toBeTruthy()
    // The rail still marks Bot as the active tool.
    expect(within(screen.getByRole("navigation", { name: "Công cụ theo trang" })).getByRole("button", { name: "Bot" }).getAttribute("aria-pressed")).toBe("true")

    await user.click(screen.getAllByRole("button", { name: "Về Bot" })[0])
    await waitFor(() => expect(router.state.location.search).toBe("?view=bot&symbol=FPT"))
    await waitFor(() => expect(screen.queryByTestId("practice-main")).toBeNull())
    expect(screen.queryByRole("heading", { name: "Luyện tập RSI" })).toBeNull()
  })

  it("an unknown or malformed indicator never reaches the practice routes with a bad id", async () => {
    await renderPage("/demo-trading?view=bot&practice=../../etc")
    expect(screen.queryByTestId("practice-main")).toBeNull()
    expect(mocks.api.mock.calls.some(([path]) => String(path).startsWith("/practice/"))).toBe(false)
  })

  it("the practice param is ignored outside the Bot tool", async () => {
    await renderPage("/demo-trading?view=trading&practice=rsi")
    expect(screen.queryByTestId("practice-main")).toBeNull()
    expect(mocks.api.mock.calls.some(([path]) => String(path).startsWith("/practice/"))).toBe(false)
  })
})
