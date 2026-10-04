import { render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import type { EquityPoint, RunResult, Trade } from "../types"
import { downsampleEquity, toPctSeries } from "./equity-series"
import { ResultsView, TradesTable } from "./results-view"

beforeAll(() => {
  // jsdom has no ResizeObserver (Recharts container).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const legacyTrade = (idx: number): Trade => ({
  idx,
  entryDate: "2024-01-02",
  entryPrice: 100,
  exitDate: "2024-01-05",
  exitPrice: 110,
  hold: 3,
  pnlPct: 0.1,
  trigger: "RSI > 70",
  entryTrigger: "RSI < 30",
})

describe("legacy results view (keep_legacy display fixes)", () => {
  it("turns base-100 indices into return % from an explicit 0% point, never rebased on the first post-fee bar", () => {
    const curve: EquityPoint[] = [
      { date: "2024-01-02", strategy: 99.85, buyHold: 100, vnindex: 100 },
      { date: "2024-01-03", strategy: 105, buyHold: 102, vnindex: 101 },
      { date: "2024-01-04", strategy: 112, buyHold: 104 },
    ]
    const series = toPctSeries(curve)
    expect(series[0]).toEqual({
      date: "2024-01-02",
      strategy: 0,
      buy_hold: 0,
      vnindex: 0,
    })
    expect(series[1]!.strategy).toBeCloseTo(-0.15)
    expect(series.at(-1)!.strategy).toBeCloseTo(12)
    expect(series.at(-1)!.buy_hold).toBeCloseTo(4)
    expect(series).toHaveLength(curve.length + 1)
  })

  it("downsampling keeps the last point so the line ends on the KPI", () => {
    const curve: EquityPoint[] = Array.from({ length: 1001 }, (_, index) => ({
      date: `d${index}`,
      strategy: 100 + index,
      buyHold: 100,
    }))
    const thin = downsampleEquity(curve)
    expect(thin.length).toBeLessThanOrEqual(401)
    expect(thin.at(-1)).toBe(curve.at(-1))
  })

  it("renders the full trade list (40 trades → 40 rows, no 12-row cap)", () => {
    render(
      <TradesTable
        trades={Array.from({ length: 40 }, (_, index) =>
          legacyTrade(index + 1)
        )}
      />
    )
    expect(screen.getAllByTestId("legacy-trade-row")).toHaveLength(40)
    expect(screen.queryByText("Xem tất cả")).toBeNull()
  })

  it("renders null KPIs as —", () => {
    const result: RunResult = {
      meta: {
        symbol: "FPT",
        start: "2024-01-02",
        end: "2024-01-04",
        nSessions: 0,
        capital: 100_000_000,
      },
      kpis: {
        cagr: null,
        sharpe: null,
        sharpeCi: [null, null],
        maxDrawdown: null,
        ddRecoverySessions: null,
        winRate: null,
        nTrades: 0,
        nWins: 0,
        avgHold: null,
        netReturn: null,
        buyHoldReturn: null,
        nSessions: 0,
      },
      equityCurve: [],
      trades: [],
    }
    render(
      <TooltipProvider>
        <ResultsView result={result} />
      </TooltipProvider>
    )
    const value = (label: string) =>
      screen.getByText(label).nextElementSibling?.textContent
    expect(value("Lãi trung bình mỗi năm")).toBe("—")
    expect(value("Tổng lãi sau phí + thuế")).toBe("—")
    expect(value("Lãi nếu chỉ mua và giữ")).toBe("—")
    expect(value("Sharpe ratio")).toBe("—")
    expect(value("Tỷ lệ lệnh bán có lãi")).toBe("—")
    expect(value("Số phiên giữ trung bình")).toBe("—")
  })
})
