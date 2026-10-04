import { render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it } from "vitest"

import { BacktestResults } from "./results"
import { toReturnSeries } from "./series"
import { runResult, trade } from "./test-fixtures"

beforeAll(() => {
  // jsdom has no ResizeObserver (Radix ScrollArea / Recharts container).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe("Backtest v2 results", () => {
  it("renders null KPIs as — and never as 0", () => {
    const result = runResult({
      kpis: {
        net_return: 10,
        cagr: null,
        max_drawdown: null,
        n_trades: 0,
        n_wins: 0,
        win_rate: null,
        buy_hold_return: 5,
        market_return: null,
        profit_factor: null,
      },
      trades: [],
    })
    render(<BacktestResults result={result} symbol="FPT" currentRevision={3} />)
    const cards = screen.getAllByTestId("kpi")
    const value = (label: string) => {
      const card = cards.find((item) => within(item).queryByText(label))
      return card?.lastElementChild?.textContent
    }
    expect(value("CAGR")).toBe("—")
    expect(value("Sụt giảm lớn nhất")).toBe("—")
    expect(value("Tỷ lệ thắng")).toBe("—")
    expect(value("Profit factor")).toBe("—")
    expect(value("VN-Index")).toBe("—")
    expect(value("Tổng lợi nhuận")).toBe("+10,00%")
  })

  it("starts the equity series at the 0% initial point before the first fee", () => {
    const series = toReturnSeries(runResult())
    expect(series[0]).toMatchObject({ strategy: 0, buy_hold: 0, vnindex: 0 })
    // The first post-fee bar is not rebased to 0.
    expect(series[1]!.strategy).toBe(-0.15)
    // The last point matches the KPI of the same series.
    expect(series.at(-1)).toMatchObject({ strategy: 10, buy_hold: 5, vnindex: 2 })
  })

  it("keeps VN-Index missing (null) instead of drawing a wrong baseline", () => {
    const base = runResult()
    const series = toReturnSeries({
      initial: { ...base.initial, market_pct: null },
      curve: base.curve.map((point) => ({ ...point, market_pct: null })),
    })
    expect(series.every((point) => point.vnindex === null)).toBe(true)
  })

  it("renders every closed trade (40 trades → 40 rows) with signal and execution dates", () => {
    const trades = Array.from({ length: 40 }, (_, index) => trade(index + 1))
    render(<BacktestResults result={runResult({ trades })} symbol="FPT" currentRevision={3} />)
    expect(screen.getAllByTestId("trade-row")).toHaveLength(40)
    expect(screen.getByText("40 / 40 giao dịch đã đóng")).toBeTruthy()
    const first = screen.getAllByTestId("trade-row")[0]!
    expect(within(first).getByText("02/01/2024")).toBeTruthy()
    expect(within(first).getByText("03/01/2024")).toBeTruthy()
    expect(within(first).getByText("Hợp lưu Bán")).toBeTruthy()
  })

  it("shows the open position, canceled end-of-range orders and the run snapshot", () => {
    const result = runResult({
      open_position: {
        qty: 5500,
        price: 39000,
        cost: 214_800_000,
        index: 2,
        date: "2024-01-04",
        signal_date: "2024-01-03",
        last_price: 39540,
        market_value: 217_470_000,
        unrealized_pnl: 2_670_000,
      },
      canceled: [{ reason: "end_of_range", action: "sell", signalIndex: 2 }],
    })
    render(<BacktestResults result={result} symbol="FPT" currentRevision={4} />)
    expect(screen.getByTestId("open-position").textContent).toContain("5.500 cổ phiếu")
    expect(screen.getByTestId("canceled-orders").textContent).toContain("1 lệnh chờ bị hủy")
    const snapshot = screen.getByTestId("snapshot")
    expect(snapshot.textContent).toContain("#3")
    expect(snapshot.textContent).toContain("hash-3")
    expect(snapshot.textContent).toContain("Mở cửa phiên kế tiếp")
    expect(snapshot.textContent).toContain("Phí mua 0,15%, phí/thuế bán 0,25%")
    expect(screen.getByText("Cấu hình đã lưu hiện tại là #4")).toBeTruthy()
  })
})
