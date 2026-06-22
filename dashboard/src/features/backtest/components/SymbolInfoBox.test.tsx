import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SymbolInfoBox } from "./SymbolInfoBox"

vi.mock("@/features/stock/hooks", () => ({
  useStockOverview: () => ({
    data: {
      profile: {
        organName: "CTCP FPT",
        exchange: "HOSE",
        icbName3: "Công nghệ thông tin",
        icbName4: "",
      },
    },
    isLoading: false,
  }),
}))

vi.mock("@/features/market-data/hooks", () => ({
  usePrice: () => ({
    data: { closePrice: 142500, percentChange: 1.78 },
    isLoading: false,
  }),
}))

describe("SymbolInfoBox", () => {
  it("renders nothing when symbol is empty", () => {
    const { container } = render(<SymbolInfoBox symbol="" meta={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders company name and exchange", () => {
    render(<SymbolInfoBox symbol="FPT" meta={null} />)
    expect(screen.getByText(/CTCP FPT/)).toBeInTheDocument()
    expect(screen.getByText(/HOSE/)).toBeInTheDocument()
  })

  it("renders icbName3 industry", () => {
    render(<SymbolInfoBox symbol="FPT" meta={null} />)
    expect(screen.getByText(/Công nghệ thông tin/)).toBeInTheDocument()
  })

  it("renders price with + sign and text-up class for positive percent", () => {
    render(<SymbolInfoBox symbol="FPT" meta={null} />)
    // Price formatted
    expect(screen.getByText(/142\.500/)).toBeInTheDocument()
    // Percent with + sign inside a text-up element
    const pctEl = screen.getByText(/\+1\.78%/)
    expect(pctEl.closest("[class]")?.className ?? pctEl.className).toMatch(/text-up/)
  })

  it("omits data row when meta is null", () => {
    render(<SymbolInfoBox symbol="FPT" meta={null} />)
    expect(screen.queryByText(/Dữ liệu/)).toBeNull()
  })

  it("renders meta row when meta is provided", () => {
    const meta = { symbol: "FPT", start: "2020-01-02", end: "2024-12-31", n_sessions: 1200, capital: 100_000_000 }
    render(<SymbolInfoBox symbol="FPT" meta={meta} />)
    expect(screen.getByText(/Dữ liệu/)).toBeInTheDocument()
    expect(screen.getByText(/1200 phiên/)).toBeInTheDocument()
    expect(screen.getByText(/02\/01\/2020/)).toBeInTheDocument()
    expect(screen.getByText(/31\/12\/2024/)).toBeInTheDocument()
  })
})
