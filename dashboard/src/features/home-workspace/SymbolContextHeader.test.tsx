import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, beforeEach, vi } from "vitest"

const UP = {
  symbol: "HPG", exchange: "HOSE",
  ceilingPrice: 29.75, floorPrice: 25.85, referencePrice: 27.8,
  openPrice: 28, closePrice: 28.45, highestPrice: 28.6, lowestPrice: 27.9,
  priceChange: 0.65, percentChange: 2.34, hasTraded: true,
  totalVolume: 24_500_000, totalValue: 695_000_000_000,
  bid: [], ask: [], foreignBuy: 50_000_000_000, foreignSell: 10_800_000_000, foreignRoom: null,
}
const DOWN = {
  ...UP, closePrice: 27.15, priceChange: -0.65, percentChange: -2.34,
}
const FLAT = {
  ...UP, closePrice: 27.8, priceChange: 0, percentChange: 0,
}

const h = vi.hoisted(() => ({ data: null as Record<string, unknown> | null }))

vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "HPG", setSymbol: vi.fn() }),
}))
vi.mock("@/features/market-data", () => ({
  usePrice: () => ({ data: h.data, isLoading: false }),
  useSymbolSearch: () => ({ results: [], isFetching: false }),
}))

import { SymbolContextHeader } from "./SymbolContextHeader"

describe("SymbolContextHeader", () => {
  beforeEach(() => {
    h.data = UP
  })

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

  it("renders a negative change as a magnitude (not '—') for a losing stock", () => {
    h.data = DOWN
    const { container } = render(<SymbolContextHeader />)
    // priceChange -0.65 → ▼ -650 (sign from arrow + prefix; magnitude formatted)
    expect(container.textContent).toContain("▼ -650")
    expect(container.textContent).not.toContain("▼ —")
  })

  it("flat stock (priceChange 0) shows neutral '■ 0' and no '▲ +—' or '—'", () => {
    h.data = FLAT
    const { container } = render(<SymbolContextHeader />)
    // Must NOT show the up-arrow format that previously produced '▲ +—'
    expect(container.textContent).not.toContain("▲ +—")
    // Must NOT have a dash placeholder for the change amount
    expect(container.textContent).not.toMatch(/[▲▼] [+-]—/)
    // Must show a '0' literal for the change amount
    expect(container.textContent).toContain("0")
    // Must show the neutral marker ■
    expect(container.textContent).toContain("■")
  })
})
