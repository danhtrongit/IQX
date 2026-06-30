import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { SymbolContextHeader } from "./SymbolContextHeader"

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }),
}))
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({
    data: {
      symbol: "HPG", exchange: "HOSE",
      ceilingPrice: 29.75, floorPrice: 25.85, referencePrice: 27.8,
      openPrice: 28, closePrice: 28.45, highestPrice: 28.6, lowestPrice: 27.9,
      priceChange: 0.65, percentChange: 2.34, hasTraded: true,
      totalVolume: 24_500_000, totalValue: 695_000_000_000,
      bid: [], ask: [], foreignBuy: 50_000_000_000, foreignSell: 10_800_000_000, foreignRoom: null,
    },
    isLoading: false,
  }),
  useSymbolSearch: () => ({ results: [], isFetching: false }),
}))

describe("SymbolContextHeader", () => {
  it("renders the shared-context label, symbol, price and change", () => {
    render(<SymbolContextHeader />)
    expect(screen.getByText(/DÙNG CHUNG CHO MỌI TAB/)).toBeInTheDocument()
    expect(screen.getByText("HPG")).toBeInTheDocument()
    expect(screen.getByText("28.450")).toBeInTheDocument() // closePrice ×1000
    expect(screen.getByText(/\+2[.,]34%/)).toBeInTheDocument()
  })

  it("shows the Trần / TC / Sàn mini-stat labels", () => {
    render(<SymbolContextHeader />)
    expect(screen.getByText("Trần")).toBeInTheDocument()
    expect(screen.getByText("TC")).toBeInTheDocument()
    expect(screen.getByText("Sàn")).toBeInTheDocument()
  })
})
