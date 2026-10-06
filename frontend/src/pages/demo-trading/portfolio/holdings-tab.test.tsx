import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  TradingPortfolio,
  TradingPosition,
} from "@/pages/demo-trading/types"
import { HoldingsTab } from "./holdings-tab"

const mocks = vi.hoisted(() => ({
  useTradingPortfolio: vi.fn(),
}))

vi.mock("@/hooks/use-trading", () => ({
  useTradingPortfolio: mocks.useTradingPortfolio,
}))

function portfolio(
  overrides: Partial<TradingPortfolio> = {}
): TradingPortfolio {
  return {
    account: {
      id: "acc-1",
      user_id: "user-a",
      status: "active",
      initial_cash_vnd: 100_000_000,
      cash_available_vnd: 50_000_000,
      cash_reserved_vnd: 0,
      cash_pending_vnd: 0,
      total_cash_vnd: 50_000_000,
      activated_at: "2026-01-01T00:00:00Z",
      reset_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    positions: [],
    total_market_value_vnd: 0,
    nav_vnd: 50_000_000,
    total_unrealized_pnl_vnd: 0,
    return_pct: 0,
    refresh_warnings: [],
    ...overrides,
  }
}

function position(overrides: Partial<TradingPosition> = {}): TradingPosition {
  return {
    symbol: "BFC",
    quantity_total: 100,
    quantity_sellable: 100,
    quantity_pending: 0,
    quantity_reserved: 0,
    avg_cost_vnd: 45_900,
    current_price_vnd: 46_000,
    market_value_vnd: 4_600_000,
    unrealized_pnl_vnd: 10_000,
    active_plan_buy_order_id: null,
    active_original_stop_vnd: null,
    active_original_take_profit_vnd: null,
    active_dynamic_stop_vnd: null,
    ...overrides,
  }
}

function renderTab(
  value: TradingPortfolio,
  filter: "all" | "profit" | "loss" = "all"
) {
  mocks.useTradingPortfolio.mockReturnValue({
    data: value,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })
  return render(
    <HoldingsTab
      filter={filter}
      symbol=""
      onSymbolChange={vi.fn()}
      onNavigate={vi.fn()}
    />
  )
}

beforeEach(() => {
  mocks.useTradingPortfolio.mockReset()
})

describe("HoldingsTab dividends", () => {
  it("hides the rights block and shows no badges on a legacy payload", () => {
    renderTab(portfolio({ positions: [position()] }))

    expect(screen.queryByText("Quyền chờ nhận")).toBeNull()
    expect(screen.queryByText(/chờ nhận/)).toBeNull()
    expect(screen.queryByText(/CP chờ về/)).toBeNull()
  })

  it("shows a cash-only block and a cash badge", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 400_000,
          pending_stock_dividend_quantity: 0,
        },
        positions: [position({ pending_cash_dividend_vnd: 400_000 })],
      })
    )

    expect(screen.getByText("Quyền chờ nhận")).toBeTruthy()
    expect(screen.getByText("400.000 đ tiền mặt")).toBeTruthy()
    expect(screen.getByText("400.000 đ chờ nhận")).toBeTruthy()
    expect(screen.queryByText(/CP chờ về/)).toBeNull()
  })

  it("shows a stock-only block, a stock badge and the info line", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 0,
          pending_stock_dividend_quantity: 280,
        },
        positions: [
          position({
            symbol: "HTN",
            quantity_total: 1_680,
            quantity_sellable: 1_400,
            quantity_pending: 280,
            pending_stock_dividend_quantity: 280,
          }),
        ],
      })
    )

    expect(screen.getByText("280 cổ phiếu")).toBeTruthy()
    const row = screen.getByText("280 CP chờ về").closest("li")
    expect(row).not.toBeNull()
    expect(row?.textContent).toContain("SL 1.680 · Khả dụng 1.400 · Chờ về 280")
    expect(screen.queryByText(/tiền mặt/)).toBeNull()
  })

  it("shows the mixed block and both badges on one row", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 2_000_000,
          pending_stock_dividend_quantity: 280,
        },
        positions: [
          position({
            symbol: "HTN",
            pending_cash_dividend_vnd: 2_000_000,
            pending_stock_dividend_quantity: 280,
          }),
        ],
      })
    )

    expect(screen.getByText("2.000.000 đ tiền mặt · 280 cổ phiếu")).toBeTruthy()
    const row = screen.getByText("280 CP chờ về").closest("li")
    expect(row).not.toBeNull()
    expect(
      within(row as HTMLElement).getByText("2.000.000 đ chờ nhận")
    ).toBeTruthy()
  })

  it("renders the block after the four tiles and before the holdings list", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 400_000,
          pending_stock_dividend_quantity: 0,
        },
        positions: [position({ pending_cash_dividend_vnd: 400_000 })],
      })
    )

    const firstTile = screen.getByText("Tổng tài sản (NAV)")
    const block = screen.getByText("Quyền chờ nhận")
    const list = screen.getByRole("list")

    expect(
      firstTile.compareDocumentPosition(block) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      block.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("keeps the portfolio totals independent of the profit/loss filter", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 400_000,
          pending_stock_dividend_quantity: 0,
        },
        positions: [
          position({
            symbol: "BFC",
            unrealized_pnl_vnd: -5_000,
            pending_cash_dividend_vnd: 400_000,
          }),
        ],
      }),
      "profit"
    )

    expect(screen.getByText("Không có mã phù hợp bộ lọc")).toBeTruthy()
    expect(screen.getByText("400.000 đ tiền mặt")).toBeTruthy()
    expect(screen.queryByText("400.000 đ chờ nhận")).toBeNull()
  })

  it("renders a zero-quantity position with pending cash without crashing", () => {
    renderTab(
      portfolio({
        pending_rights: {
          pending_cash_dividend_vnd: 400_000,
          pending_stock_dividend_quantity: 0,
        },
        positions: [
          position({
            quantity_total: 0,
            quantity_sellable: 0,
            current_price_vnd: null,
            market_value_vnd: null,
            unrealized_pnl_vnd: null,
            pending_cash_dividend_vnd: 400_000,
          }),
        ],
      })
    )

    expect(screen.getByText("BFC")).toBeTruthy()
    expect(screen.getByText("400.000 đ chờ nhận")).toBeTruthy()
  })
})
