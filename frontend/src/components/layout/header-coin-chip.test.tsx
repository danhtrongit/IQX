import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiError, createShopBackend, type ShopBackend } from "@/pages/demo-trading/shop/shop-test-support"
import { HeaderCoinChip } from "./header-coin-chip"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: null as { id: string } | null,
}))

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: mocks.api }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user }) }))

let backend: ShopBackend

function renderChip(location = "/") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[location]}>
        <HeaderCoinChip />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.api.mockReset()
  mocks.user = { id: "user-1" }
  backend = createShopBackend({ balance: 1_250 })
  mocks.api.mockImplementation((path: string, init?: RequestInit) => backend.handle(path, init))
})

describe("header coin chip", () => {
  it("is hidden for guests and does not even ask the server for a balance", async () => {
    mocks.user = null
    renderChip()
    expect(screen.queryByTestId("header-coin-chip")).toBeNull()
    expect(document.body.textContent).toBe("")
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("shows the server's balance and opens the Shop tool", async () => {
    renderChip()
    const chip = await screen.findByRole("link", { name: "1.250 xu. Mở Shop" })
    expect(chip.getAttribute("href")).toBe("/demo-trading?view=shop")
    expect(chip.textContent).toContain("1.250")
    expect(chip.textContent).toContain("xu")
    expect(backend.callsTo("GET", "/shop")).toHaveLength(1)
  })

  it("keeps the selected symbol on the workspace and shows the Shop main view", async () => {
    renderChip("/demo-trading?view=hunt&symbol=FPT&content=chart")
    const chip = await screen.findByRole("link", { name: /Mở Shop/ })
    const target = new URL(chip.getAttribute("href") ?? "", "http://x")
    expect(target.pathname).toBe("/demo-trading")
    expect(target.searchParams.get("view")).toBe("shop")
    expect(target.searchParams.get("symbol")).toBe("FPT")
    expect(target.searchParams.has("content")).toBe(false)
  })

  it("never shows 0 xu while loading or when the read fails", async () => {
    backend.intercept((call) => call.path === "/shop", () => { throw apiError(503, "SERVICE_UNAVAILABLE", "x") })
    renderChip()
    const chip = screen.getByTestId("header-coin-chip")
    expect(chip.textContent).not.toMatch(/\b0\b/)
    await waitFor(() => expect(chip.getAttribute("aria-label")).toBe("Chưa tải được số dư xu. Mở Shop"))
    expect(chip.textContent).toContain("—")
    expect(chip.textContent).not.toMatch(/\b0\b/)
  })
})
