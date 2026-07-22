import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"

// ─── Mock all hooks Header depends on ────────────────────────────────────────
vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
    setShowAuthModal: vi.fn(),
    setAuthModalTab: vi.fn(),
  }),
}))

vi.mock("@/features/premium", () => ({
  usePremiumStatus: () => ({ isPremium: false, isTrial: false }),
}))

vi.mock("@/shared/theme/ThemeProvider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}))

// ─── Mock SymbolSearch (has its own data dependencies) ───────────────────────
vi.mock("./SymbolSearch", () => ({
  SymbolSearch: () => null,
}))

// Import after mocks
import { Header, NAV_ITEMS } from "./Header"

describe("Header – NAV_ITEMS structure", () => {
  it('has a single "Demo Trading" item pointing to /dau-truong', () => {
    const item = NAV_ITEMS.find((i) => i.label === "Demo Trading")
    expect(item).toBeDefined()
    expect(item).toEqual({ label: "Demo Trading", href: "/dau-truong" })
  })

  it('has exactly the 4 expected items in order: Trang chủ · Demo Trading · Kiến thức · Giới thiệu', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Trang chủ",
      "Demo Trading",
      "Kiến thức",
      "Giới thiệu",
    ])
  })

  it('does NOT contain the retired "Biểu đồ" / "Bảng giá" / "Cổ phiếu" / "Chiến lược" entries', () => {
    const retiredLabels = ["Biểu đồ", "Bảng giá", "Cổ phiếu", "Chiến lược"]
    const survivors = NAV_ITEMS.filter((item) => retiredLabels.includes(item.label))
    expect(survivors).toHaveLength(0)
  })

  it('no stale "/backtest" or "/canh-bao" nav items remain', () => {
    const stale = NAV_ITEMS.filter(
      (item) => item.href === "/backtest" || item.href === "/canh-bao",
    )
    expect(stale).toHaveLength(0)
  })
})

describe("Header – Demo Trading nav", () => {
  it('renders "Demo Trading" in the nav', () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>
    )
    expect(screen.getByText("Demo Trading")).toBeInTheDocument()
  })

  it('does NOT render any of the retired labels', () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>
    )
    expect(screen.queryByText("Biểu đồ")).not.toBeInTheDocument()
    expect(screen.queryByText("Bảng giá")).not.toBeInTheDocument()
    expect(screen.queryByText("Cổ phiếu")).not.toBeInTheDocument()
    expect(screen.queryByText("Chiến lược")).not.toBeInTheDocument()
  })

  it('shows "Demo Trading" button in the desktop nav, active (primary color) at /dau-truong', () => {
    render(
      <MemoryRouter initialEntries={["/dau-truong"]}>
        <Header />
      </MemoryRouter>
    )
    const triggers = screen.getAllByRole("button", { name: /Demo Trading/i })
    expect(triggers.length).toBeGreaterThanOrEqual(1)
    expect(triggers[0]).toHaveStyle({ color: "rgb(var(--primary-6))" })
  })
})
