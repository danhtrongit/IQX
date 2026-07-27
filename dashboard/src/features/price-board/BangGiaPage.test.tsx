// BangGiaPage.test.tsx — feature-tour wiring (T1, docs/superpowers/plans/2026-07-27-feature-tours.md)
//
// Only the tour wiring is under test here: the data-fetching hooks
// (auth/market-data/stock-directory/watchlist) are stubbed to keep the page
// rendering fast and deterministic, same approach as
// `features/cap0/Cap0TradingPage.test.tsx` (stub the heavy children, keep the
// real thing you're testing). `IndexStrip`/`IndexSummaryTable` are stubbed
// outright since their internals need a `QueryClientProvider` this test
// doesn't set up — irrelevant to the tour-wiring behaviour under test.
// `BoardToolbar`/`BoardTable` are left REAL: the launch button lives inside
// `BoardToolbar`, and the tour's later steps target real `BoardTable` header
// cells.
import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { bangGiaTour } from "@/features/tour/configs/bangGiaTour"
import BangGiaPage from "./BangGiaPage"

vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: false }) }))
vi.mock("@/features/stock-directory/hooks", () => ({
  useGroups: () => ({ tickers: [], isLoading: false }),
}))
vi.mock("@/features/watchlist", () => ({ useWatchlist: () => ({ data: [] }) }))
vi.mock("@/features/market-data", () => ({
  usePrices: () => ({ priceMap: {} }),
  useRealtimeStatus: () => false,
}))
vi.mock("./components/IndexStrip", () => ({
  IndexStrip: () => <div data-testid="index-strip-stub" />,
}))
vi.mock("./components/IndexSummaryTable", () => ({
  IndexSummaryTable: () => <div data-testid="index-summary-stub" />,
}))

const STORAGE_KEY = "iqx_tour_banggia"

function renderPage() {
  return render(
    <MemoryRouter>
      <BangGiaPage />
    </MemoryRouter>,
  )
}

describe("BangGiaPage — Bảng giá tour wiring", () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
  })

  it("shows the 'Xem hướng dẫn' launch button in the toolbar", () => {
    renderPage()
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()
  })

  it("does not render the tour overlay before the button is clicked", () => {
    renderPage()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("clicking the launch button starts the tour and renders step 1", () => {
    renderPage()
    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(bangGiaTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${bangGiaTour.steps.length}`)).toBeInTheDocument()
  })
})
