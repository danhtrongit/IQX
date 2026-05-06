import { describe, expect, it } from "vitest"
import { normalizePortfolioItem } from "../src/components/watchlist/portfolio-utils"

describe("normalizePortfolioItem", () => {
  it("maps backend avgBuyPrice into a numeric avgPrice for holdings UI", () => {
    const item = normalizePortfolioItem({
      symbol: "VIC",
      quantity: 100,
      avgBuyPrice: "153100",
      currentPrice: 157100,
      totalValue: 15710000,
      pnl: 400000,
      pnlPercent: 2.61,
    })

    expect(item.avgPrice).toBe(153100)
  })
})
