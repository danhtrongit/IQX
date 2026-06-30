import React from "react"
import { render, screen, act } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Use vi.hoisted so these values are available when vi.mock factories run.
const { mockInitialSymbol, mockPersistLastViewedSymbol } = vi.hoisted(() => ({
  mockInitialSymbol: vi.fn(() => "HPG"),
  mockPersistLastViewedSymbol: vi.fn(),
}))

vi.mock("./useInitialSymbol", () => ({
  useInitialSymbol: () => mockInitialSymbol(),
  persistLastViewedSymbol: mockPersistLastViewedSymbol,
}))
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => true }))
vi.mock("@/features/market-overview/daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div>MARKET_DAILY</div> }))
vi.mock("./HomeSidePanel", () => ({ HomeSidePanel: ({ active }: { active: string }) => <div>SIDE_{active}</div> }))
vi.mock("./HomeIconRail", () => ({ HomeIconRail: ({ active }: { active: string }) => <div>RAIL_{active}</div> }))

// Mock SymbolProvider so we can observe which symbol prop it received.
// Renders a data-testid attribute with the symbol value so assertions can inspect it.
vi.mock("@/shared/contexts/symbol-context", () => ({
  SymbolProvider: ({ symbol, children }: { symbol: string; children: React.ReactNode }) => (
    <div data-testid="symbol-provider" data-symbol={symbol}>{children}</div>
  ),
  useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }),
  isIndexSymbol: () => false,
}))

import { HomeWorkspace } from "./HomeWorkspace"

describe("HomeWorkspace", () => {
  beforeEach(() => {
    mockInitialSymbol.mockReturnValue("HPG")
    mockPersistLastViewedSymbol.mockClear()
  })

  it("renders the market content, side panel, and rail with the default tab", () => {
    render(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    expect(screen.getByText("MARKET_DAILY")).toBeInTheDocument()
    expect(screen.getByText("SIDE_order")).toBeInTheDocument()
    expect(screen.getByText("RAIL_order")).toBeInTheDocument()
  })

  it("freezes the initial symbol — does NOT reset when useInitialSymbol returns a different value on re-render", () => {
    // First render: useInitialSymbol returns "VNINDEX"
    mockInitialSymbol.mockReturnValue("VNINDEX")
    const { rerender } = render(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    const provider = screen.getByTestId("symbol-provider")
    expect(provider.getAttribute("data-symbol")).toBe("VNINDEX")

    // Simulate watchlist resolving — useInitialSymbol now returns "FPT"
    mockInitialSymbol.mockReturnValue("FPT")
    act(() => {
      rerender(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    })

    // The symbol prop on SymbolProvider must stay frozen at "VNINDEX"
    expect(screen.getByTestId("symbol-provider").getAttribute("data-symbol")).toBe("VNINDEX")
  })

  it("calls persistLastViewedSymbol with the active symbol when WorkspaceBody mounts", () => {
    mockInitialSymbol.mockReturnValue("HPG")
    render(<MemoryRouter><HomeWorkspace /></MemoryRouter>)
    expect(mockPersistLastViewedSymbol).toHaveBeenCalledWith("HPG")
  })
})
