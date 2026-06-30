// HomeSidePanel.test.tsx
import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

vi.mock("./SymbolContextHeader", () => ({ SymbolContextHeader: () => <div>SYMBOL_HEADER</div> }))
vi.mock("@/features/trading", () => ({ TradingPanel: () => <div>TRADING</div> }))
vi.mock("@/features/watchlist", () => ({ WatchlistPanel: () => <div>WATCHLIST</div> }))
vi.mock("@/features/news", () => ({ NewsFeedPanel: () => <div>NEWS</div> }))
vi.mock("@/features/patterns", () => ({ AIPatternPanel: () => <div>PATTERNS</div> }))
vi.mock("@/features/premium", () => ({ PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: () => false }))
vi.mock("./PhanTichLauncher", () => ({ PhanTichLauncher: () => <div>PHANTICH</div>, SelectStockEmptyState: () => <div>EMPTY</div> }))
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }) }))
import { HomeSidePanel } from "./HomeSidePanel"

describe("HomeSidePanel", () => {
  it("keeps the symbol header mounted and switches the tab body", () => {
    const { rerender } = render(<HomeSidePanel active="order" />)
    expect(screen.getByText("SYMBOL_HEADER")).toBeInTheDocument()
    expect(screen.getByText("TRADING")).toBeInTheDocument()
    rerender(<HomeSidePanel active="news" />)
    expect(screen.getByText("SYMBOL_HEADER")).toBeInTheDocument()
    expect(screen.getByText("NEWS")).toBeInTheDocument()
    expect(screen.queryByText("TRADING")).not.toBeInTheDocument()
  })
})
