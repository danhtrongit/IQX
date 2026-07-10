import React from "react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeWorkspace } from "./HomeWorkspace"

vi.mock("@/features/market-overview/HomeMarketView", () => ({ HomeMarketView: () => <div data-testid="market-view" /> }))
vi.mock("./StockAnalysisView", () => ({ StockAnalysisView: () => <div data-testid="stock-view" /> }))
vi.mock("./FinancialAnalysisView", () => ({ FinancialAnalysisView: () => <div data-testid="financial-view" /> }))

const mq = vi.hoisted(() => ({ desktop: true }))
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => mq.desktop }))

beforeEach(() => { mq.desktop = true })

describe("HomeWorkspace (3-view switch)", () => {
  it("mặc định render market view + rail 3 tab", () => {
    render(<HomeWorkspace />)
    expect(screen.getByTestId("market-view")).toBeInTheDocument()
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.queryByTestId("stock-view")).not.toBeInTheDocument()
  })
  it("click tab Cổ phiếu → stock view; market ẩn", () => {
    render(<HomeWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: /cổ phiếu/i }))
    expect(screen.getByTestId("stock-view")).toBeInTheDocument()
    expect(screen.queryByTestId("market-view")).not.toBeInTheDocument()
  })
  it("click tab BCTC → financial view", () => {
    render(<HomeWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: /BCTC/i }))
    expect(screen.getByTestId("financial-view")).toBeInTheDocument()
  })
  it("mobile: vẫn render đủ 3 tab (bottom bar)", () => {
    mq.desktop = false
    render(<HomeWorkspace />)
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getByTestId("market-view")).toBeInTheDocument()
  })
})
