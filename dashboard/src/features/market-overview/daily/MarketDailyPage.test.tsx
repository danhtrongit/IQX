import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Stub the data hook + heavy children so the page renders in isolation.
vi.mock("./useDailyMarketAnalysis", () => ({
  useDailyMarketAnalysis: () => ({ data: { charts: null }, isLoading: false, isError: false }),
}))
vi.mock("./MarketAnalysisArticle", () => ({ MarketAnalysisArticle: () => <div>ARTICLE</div> }))
vi.mock("./MarketPulseBar", () => ({ MarketPulseBar: () => <div>PULSE</div> }))
vi.mock("./MarketTakeaway", () => ({ MarketTakeaway: () => <div>TAKEAWAY</div> }))

import { MarketDailyPage } from "./MarketDailyPage"

describe("MarketDailyPage", () => {
  it("renders the daily analysis content as a page", () => {
    render(<MarketDailyPage />)
    expect(screen.getByText("ARTICLE")).toBeInTheDocument()
    expect(screen.getByText("PULSE")).toBeInTheDocument()
    expect(screen.getByText("TAKEAWAY")).toBeInTheDocument()
  })
})
