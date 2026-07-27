// BacktestLab.test.tsx — Backtester tour wiring (T3, docs/superpowers/plans/
// 2026-07-27-feature-tours.md)
//
// PREMIUM tour, same rationale as `alerts/AlertsPage.test.tsx`: the launch
// button gates on an explicit `usePremiumStatus()` check inside `BacktestLab`
// itself (not just the ambient `PremiumGate` on `/chien-luoc`, which still
// renders blurred children for free users). `isPremium` and the presence of a
// run result vary across tests, so each test does `vi.resetModules()` +
// `vi.doMock` + a dynamic `import()` (established pattern, see
// `trading/TradingPanel.cap0Gate.test.tsx`).
//
// Per the plan, the tour does NOT auto-run a backtest (preload is fragile) —
// `ConfigBar`/`FactorLibrary`/`SignalPanels`/`RiskConfig`/`SymbolInfoBox` are
// kept REAL (grounded targets always present), but the "Đọc kết quả" steps
// (10-13) target `ResultsView`'s real sub-elements, which only mount once
// `run.data` exists. Two scenarios are covered: (a) no run yet — the tour
// must still step through all 14 stops without crashing (the engine's
// existing "target not found → centered tooltip" fallback, already exercised
// by `TourOverlay.test.tsx`'s panel-switch-race test, absorbs this); (b) a run
// present — the 4 grounded result ids actually resolve in the DOM.
import { act, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { backtesterTour } from "@/features/tour/configs/backtesterTour"
import type { CatalogResponse, RunResult } from "./types"

const STORAGE_KEY = "iqx_tour_backtester"

vi.mock("@/features/stock/hooks", () => ({ useStockOverview: () => ({ data: undefined }) }))
vi.mock("@/features/market-data", () => ({ usePrice: () => ({ data: undefined }) }))

const catalogFixture: CatalogResponse = {
  factors: {
    buy: [
      {
        group: "B1",
        group_label: "Xu hướng tăng",
        factors: [
          {
            id: "f_buy",
            label: "MA20",
            side: "buy",
            group: "B1",
            group_label: "",
            kind: "bin",
            indicator: "ma_20",
            op: ">",
            default: null,
            editable: false,
            min: null,
            max: null,
            step: null,
            unit: "",
            is_percent: false,
            desc: "",
          },
        ],
      },
    ],
    sell: [
      {
        group: "S1",
        group_label: "Xu hướng đảo",
        factors: [
          {
            id: "f_sell",
            label: "RSI 14",
            side: "sell",
            group: "S1",
            group_label: "",
            kind: "num",
            indicator: "rsi_14",
            op: ">",
            default: 70,
            editable: true,
            min: 60,
            max: 80,
            step: 1,
            unit: "",
            is_percent: false,
            desc: "",
          },
        ],
      },
    ],
    count: 2,
  },
  templates: [
    {
      key: "momentum_cross",
      name: "Giao cắt động lượng",
      description: "RSI(14)<30 VÀ MACD cắt lên",
      config: {
        buy: { logic: "AND", factors: [] },
        sell: { logic: "OR", factors: [] },
        risk: {
          stop_loss: "fixed",
          stop_atr_mult: 2,
          stop_fixed_pct: 0.05,
          take_profit_pct: 0.15,
          max_holding: 60,
          position_size: "half",
          position_fixed_amount: 10_000_000,
          fee: "standard",
        },
      },
    },
  ],
  risk_presets: { stop_loss: [], take_profit: [], position_size: [], fee: [] },
}

const runResultFixture: RunResult = {
  meta: { symbol: "FPT", start: "2020-01-01", end: "2024-01-01", n_sessions: 700, capital: 100_000_000 },
  kpis: {
    cagr: 0.12,
    sharpe: 0.8,
    sharpe_ci: [0.2, 1.1],
    max_drawdown: -0.18,
    dd_recovery_sessions: 40,
    win_rate: 0.5,
    n_trades: 10,
    n_wins: 5,
    avg_hold: 15,
    net_return: 0.4,
    buy_hold_return: 0.3,
    n_sessions: 700,
  },
  equity_curve: [
    { date: "2020-01-02", strategy: 100, buy_hold: 100, vnindex: 100 },
    { date: "2024-01-01", strategy: 140, buy_hold: 130, vnindex: 120 },
  ],
  trades: [
    {
      idx: 1,
      entry_date: "2020-02-01",
      entry_price: 20,
      exit_date: "2020-03-01",
      exit_price: 22,
      hold: 20,
      pnl_pct: 0.1,
      trigger: "RSI>70",
      entry_trigger: "RSI<30",
    },
  ],
}

function mockHooks(opts: { runData?: RunResult }) {
  vi.doMock("./hooks", () => ({
    useCatalog: () => ({ data: catalogFixture, isLoading: false, isError: false }),
    useRunBacktest: () => ({ mutate: vi.fn(), isPending: false, data: opts.runData }),
    useStrategies: () => ({ data: [] }),
    useSaveStrategy: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteStrategy: () => ({ mutate: vi.fn(), isPending: false }),
  }))
}

async function renderBacktestLab(opts: { isPremium: boolean; runData?: RunResult }) {
  vi.resetModules()
  window.localStorage.removeItem(STORAGE_KEY)
  vi.doMock("@/features/premium", () => ({
    usePremiumStatus: () => ({ isPremium: opts.isPremium, isLoading: false }),
  }))
  mockHooks({ runData: opts.runData })
  const { BacktestLab } = await import("./BacktestLab")
  return render(<BacktestLab />)
}

describe("BacktestLab — Backtester tour wiring", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("hides the launch button for non-premium users", async () => {
    await renderBacktestLab({ isPremium: false })
    expect(screen.queryByText("Xem hướng dẫn")).not.toBeInTheDocument()
  })

  it("shows the launch button for premium users and starts the tour on click", async () => {
    await renderBacktestLab({ isPremium: true })
    expect(screen.getByText("Xem hướng dẫn")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Xem hướng dẫn"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(backtesterTour.steps[0].title)).toBeInTheDocument()
    expect(screen.getByText(`ĐIỂM 1/${backtesterTour.steps.length}`)).toBeInTheDocument()
  })

  it("grounds the strategy-building targets (steps 2-9) — always present, no run needed", async () => {
    const { container } = await renderBacktestLab({ isPremium: true })
    for (const id of [
      "tour-backtester-load-template",
      "tour-backtester-factor-library",
      "tour-backtester-config-bar",
      "tour-backtester-symbol-info",
      "tour-backtester-buy",
      "tour-backtester-sell",
      "tour-backtester-risk",
      "tour-backtester-run",
      "tour-backtester-save-alert",
    ]) {
      expect(container.querySelector(`[data-tour-id="${id}"]`)).not.toBeNull()
    }
  })

  it("without a run yet, stepping through all 14 stops never crashes (results steps gracefully fall back)", async () => {
    await renderBacktestLab({ isPremium: true, runData: undefined })
    // Fake timers: the engine's `busy` gate (Global Constraints: "cờ busy chặn
    // double-click") only clears ~380ms after each step change (TourOverlay's
    // TRANSITION_MS) — a rapid synchronous loop of "Tiếp theo →" clicks needs
    // to flush that real-timer window between clicks, same pattern as
    // `TourOverlay.test.tsx`'s `settle()` helper.
    vi.useFakeTimers()
    fireEvent.click(screen.getByText("Xem hướng dẫn"))

    for (let i = 0; i < backtesterTour.steps.length - 1; i++) {
      expect(screen.getByText(backtesterTour.steps[i].title)).toBeInTheDocument()
      fireEvent.click(screen.getByText("Tiếp theo →"))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
    }
    expect(screen.getByText(backtesterTour.steps[backtesterTour.steps.length - 1].title)).toBeInTheDocument()
    expect(screen.getByText("Hoàn thành ✓")).toBeInTheDocument()
  })

  it("with a run present, the results steps (10-13) ground onto real ResultsView elements", async () => {
    const { container } = await renderBacktestLab({ isPremium: true, runData: runResultFixture })
    for (const id of [
      "tour-backtester-results-header",
      "tour-backtester-kpi-grid",
      "tour-backtester-equity-chart",
      "tour-backtester-trades-table",
    ]) {
      expect(container.querySelector(`[data-tour-id="${id}"]`)).not.toBeNull()
    }
  })
})

describe("backtesterTour config", () => {
  it("has 12-14 steps (spec `IQX-Tour-Backtester.md` v1.0's 14 stops, budget ~12-14)", () => {
    expect(backtesterTour.steps.length).toBeGreaterThanOrEqual(12)
    expect(backtesterTour.steps.length).toBeLessThanOrEqual(14)
  })

  it("every step has a targetId (no auto-preload — nothing is `centered` purely for lack of a target)", () => {
    for (const step of backtesterTour.steps) {
      expect(step.targetId).toBeTruthy()
    }
  })

  it("FAITHFULNESS: no step body references a max-drawdown tile (KpiGrid renders only 6 tiles, no drawdown)", () => {
    for (const step of backtesterTour.steps) {
      expect(step.body.toLowerCase()).not.toContain("sụt giảm sâu nhất")
      expect(step.body.toLowerCase()).not.toContain("drawdown")
    }
  })

  it("the 'Đọc kết quả' steps (results header/KPI/equity/trades) tell the user to run a backtest first (no preload)", () => {
    const resultTargetIds = [
      "tour-backtester-results-header",
      "tour-backtester-kpi-grid",
      "tour-backtester-equity-chart",
      "tour-backtester-trades-table",
    ]
    const resultSteps = backtesterTour.steps.filter((s) => resultTargetIds.includes(s.targetId ?? ""))
    expect(resultSteps).toHaveLength(4)
    for (const step of resultSteps) {
      expect(step.body).toMatch(/Chạy backtest/i)
    }
  })

  it("first step targets the shared StrategyPage tab bar", () => {
    expect(backtesterTour.steps[0].targetId).toBe("tour-strategy-tabs")
  })
})
