import { describe, expect, it } from "vitest"

import {
  outOfSampleReports,
  parseSymbols,
  parseValueList,
  researchPayload,
  sensitivityRows,
  systemSummary,
  walkForwardWindows,
} from "./research"
import { runResult } from "./test-fixtures"
import type { BacktestRunResponse } from "./types"

function response(extra: Partial<BacktestRunResponse>): BacktestRunResponse {
  return { run_id: "run-1", status: "succeeded", result: runResult(), ...extra }
}

describe("Backtest v2 research readers", () => {
  it("returns every sensitivity candidate in order, invalid ones flagged, missing KPIs null", () => {
    const payload = researchPayload(
      response({
        research_result: {
          candidates: [
            { value: 10, config_hash: "h10", ok: true, error: null, kpis: { net_return: 4.5, max_drawdown: -2 }, n_trades: 3 },
            { value: 20, config_hash: "h20", ok: true, error: null, kpis: { net_return: null, max_drawdown: null }, n_trades: 0 },
            { value: 999, config_hash: null, ok: false, error: { message: "Ngoài phạm vi" }, kpis: null, n_trades: null },
          ],
        },
      }),
    )
    const rows = sensitivityRows(payload)
    expect(rows.map((row) => row.value)).toEqual([10, 20, 999])
    expect(rows[0]).toMatchObject({ ok: true, net_return: 4.5, n_trades: 3, config_hash: "h10" })
    expect(rows[1]).toMatchObject({ ok: true, net_return: null, max_drawdown: null })
    expect(rows[2]).toMatchObject({ ok: false, error: "Ngoài phạm vi" })
  })

  it("reads out-of-sample as two separate reports and walk-forward as independent windows", () => {
    const oos = outOfSampleReports({
      train: { kpis: { net_return: 8, max_drawdown: -4, n_trades: 5 }, snapshot: { actual_start: "2020-01-02", actual_end: "2022-12-30" } },
      test: { kpis: { net_return: -1, max_drawdown: -6, n_trades: 2 }, snapshot: { actual_start: "2023-01-03", actual_end: "2024-12-31" } },
      attempt: 1,
    })
    expect(oos.map((report) => [report.label, report.net_return])).toEqual([
      ["Trước mốc chia", 8],
      ["Sau mốc chia", -1],
    ])

    const windows = walkForwardWindows({
      windows: [
        { train_start: "2020-01-02", train_end: "2020-12-31", test_start: "2021-01-04", test_end: "2021-06-30", selected: 20, train_return: 5, test_return: 1.2, n_trades: 2, status: "ok" },
        { train_start: "2020-07-01", train_end: "2021-06-30", test_start: "2021-07-01", test_end: "2021-12-31", selected: null, status: "no_eligible_candidate" },
      ],
    })
    expect(windows).toHaveLength(2)
    expect(windows[1]).toMatchObject({ selected: null, test_return: null, status: "no_eligible_candidate" })
  })

  it("reads system_result as one shared ledger", () => {
    const summary = systemSummary(
      response({
        system_result: {
          curve: [],
          trades: [{ symbol: "FPT" }, { symbol: "VNM" }],
          positions_open: [{ symbol: "HPG", qty: 1000, market_value: 25_000_000, unrealized_pnl: 500_000 }],
          kpis: { net_return: 12, n_trades: 2 },
          ledger_size: 6,
          applied: ["portfolio", "max_positions"],
        },
      }),
    )
    expect(summary).toMatchObject({ ledger_size: 6, trades: 2, applied: ["portfolio", "max_positions"] })
    expect(summary?.kpis.net_return).toBe(12)
    expect(summary?.positions_open[0]?.symbol).toBe("HPG")
    expect(systemSummary(response({}))).toBeNull()
  })

  it("parses candidate value lists and symbol lists strictly", () => {
    expect(parseValueList("10, 20;30 40")).toEqual([10, 20, 30, 40])
    expect(parseValueList("10, abc")).toBeNull()
    expect(parseValueList("  ")).toBeNull()
    expect(parseSymbols("fpt, vnm hpg,FPT")).toEqual(["FPT", "VNM", "HPG"])
  })
})
