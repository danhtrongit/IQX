import { render, screen, fireEvent } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★★ Cụm tóm tắt mã đang xem (logo · mã · giá · %) ở đầu `MarketBar` là một
 * `<button>` `navigate('/co-phieu/:sym')`. `MarketBar` render trên CẢ 9 trang
 * cấp, ngay dưới `Header` — user bấm vào nó vì tưởng là chrome của terminal và
 * bị ném khỏi `/dau-truong`.
 *
 * Cùng khuôn `CenterPanel.symbolChange` / `WatchlistPanel.onRowSelect`: trang
 * cấp truyền `onSymbolClick`, không prop thì /bieu-do & /co-phieu giữ nguyên.
 */

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))

const priceData = {
  symbol: "VNM",
  exchange: "HOSE",
  closePrice: 62.4,
  openPrice: 62.0,
  highestPrice: 63.0,
  lowestPrice: 61.5,
  referencePrice: 61.8,
  ceilingPrice: 67.9,
  floorPrice: 59.3,
  priceChange: 0.6,
  percentChange: 0.97,
  hasTraded: true,
  totalVolume: 1_000_000,
  totalValue: 62_400_000_000,
}
vi.mock("@/features/market-data", () => ({
  useIndices: () => ({ indices: [] }),
  usePrice: () => ({ data: priceData }),
  usePreviousSessionChange: () => 0,
}))
vi.mock("@/shared/contexts/symbol-context", () => ({
  useSymbol: () => ({ symbol: "VNM", setSymbol: vi.fn() }),
}))
vi.mock("@/shared/lib/market-symbols", () => ({ isKnownIndexSymbol: () => false }))
vi.mock("./StockLogo", () => ({ StockLogo: () => null }))
vi.mock("./icons", () => ({ IconTrendingUp: () => null, IconTrendingDown: () => null }))

import { MarketBar } from "./MarketBar"

/** Nút tóm tắt là nút duy nhất chứa mã đang xem. */
function summaryButton() {
  return screen.getAllByRole("button").find((b) => b.textContent?.includes("VNM"))!
}

describe("MarketBar — onSymbolClick", () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it("★★ TRONG trang cấp (có onSymbolClick): bấm cụm giá KHÔNG navigate, gọi handler của trang", () => {
    const onSymbolClick = vi.fn()
    render(<MarketBar onSymbolClick={onSymbolClick} />)

    fireEvent.click(summaryButton())

    expect(onSymbolClick).toHaveBeenCalledWith("VNM")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ NGOÀI trang cấp (không prop): /bieu-do & /co-phieu giữ nguyên navigate", () => {
    render(<MarketBar />)

    fireEvent.click(summaryButton())

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })
})
