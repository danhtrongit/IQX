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

vi.mock("@/shared/contexts/market-modal-context", () => ({
  useMarketModal: () => ({ isOpen: false, openMarketModal: vi.fn() }),
}))

// ─── Mock SymbolSearch (has its own data dependencies) ───────────────────────
vi.mock("./SymbolSearch", () => ({
  SymbolSearch: () => null,
}))

// Import after mocks
import { Header, NAV_ITEMS } from "./Header"

describe("Header – NAV_ITEMS structure", () => {
  it('has a "Chiến lược" group containing Cảnh báo and Backtest', () => {
    const group = NAV_ITEMS.find(
      (item) => "children" in item && item.label === "Chiến lược"
    )
    expect(group).toBeDefined()
    expect(group).toHaveProperty("children")
    if (!group || !("children" in group)) return

    const { children } = group
    expect(children).toHaveLength(2)
    // Cảnh báo must be first (default)
    expect(children[0]).toEqual({ label: "Cảnh báo", href: "/canh-bao" })
    // Backtest second
    expect(children[1]).toEqual({ label: "Backtest", href: "/backtest" })
  })

  it('no flat "Backtest" or "Cảnh báo" items remain at top level', () => {
    const flat = NAV_ITEMS.filter(
      (item) => !("children" in item) && (item.label === "Backtest" || item.label === "Cảnh báo")
    )
    expect(flat).toHaveLength(0)
  })
})

describe("Header – renders Chiến lược trigger in desktop nav", () => {
  it('shows "Chiến lược" button in the desktop nav at /backtest', () => {
    render(
      <MemoryRouter initialEntries={["/backtest"]}>
        <Header />
      </MemoryRouter>
    )
    // The desktop nav renders a "Chiến lược" button (trigger for the dropdown)
    const triggers = screen.getAllByRole("button", { name: /Chiến lược/i })
    expect(triggers.length).toBeGreaterThanOrEqual(1)
  })

  it('"Chiến lược" button is active (primary color) when pathname is /backtest', () => {
    render(
      <MemoryRouter initialEntries={["/backtest"]}>
        <Header />
      </MemoryRouter>
    )
    const trigger = screen.getAllByRole("button", { name: /Chiến lược/i })[0]
    // Active style sets color to rgb(var(--primary-6))
    expect(trigger).toHaveStyle({ color: "rgb(var(--primary-6))" })
  })
})
