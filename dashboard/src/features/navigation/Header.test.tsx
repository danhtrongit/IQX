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
  it('has a single flat "Chiến lược" item pointing to /chien-luoc (no children)', () => {
    const item = NAV_ITEMS.find((i) => i.label === "Chiến lược")
    expect(item).toBeDefined()
    expect(item).toEqual({ label: "Chiến lược", href: "/chien-luoc" })
    // Must not have children
    expect(item).not.toHaveProperty("children")
  })

  it('no flat "/backtest" or "/canh-bao" nav items remain', () => {
    const stale = NAV_ITEMS.filter(
      (item) =>
        "href" in item &&
        (item.href === "/backtest" || item.href === "/canh-bao"),
    )
    expect(stale).toHaveLength(0)
  })
})

describe("Header – Biểu đồ replaces Thị trường", () => {
  it('renders "Biểu đồ" in the nav', () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>
    )
    expect(screen.getByText("Biểu đồ")).toBeInTheDocument()
  })

  it('does NOT render "Thị trường" anywhere', () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>
    )
    expect(screen.queryByText("Thị trường")).not.toBeInTheDocument()
  })
})

describe("Header – renders Chiến lược in desktop nav", () => {
  it('shows "Chiến lược" button in the desktop nav at /chien-luoc', () => {
    render(
      <MemoryRouter initialEntries={["/chien-luoc"]}>
        <Header />
      </MemoryRouter>
    )
    const triggers = screen.getAllByRole("button", { name: /Chiến lược/i })
    expect(triggers.length).toBeGreaterThanOrEqual(1)
  })

  it('"Chiến lược" button is active (primary color) when pathname starts with /chien-luoc', () => {
    render(
      <MemoryRouter initialEntries={["/chien-luoc"]}>
        <Header />
      </MemoryRouter>
    )
    const trigger = screen.getAllByRole("button", { name: /Chiến lược/i })[0]
    expect(trigger).toHaveStyle({ color: "rgb(var(--primary-6))" })
  })
})
