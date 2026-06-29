import { describe, it, expect } from "vitest"
import type { AnalysisJSON, NarrativeJSON } from "./types"

const analysis: AnalysisJSON = {
  meta: { portfolio_id: "A-0412", date: "2026-06-23", mode: "full_changed", period: "kỳ 3", period_number: 3 },
  overview: { nav: 534000000, cash_pct: 0.092, n_positions: 7, total_return: 0.107, total_pnl: 52000000,
    holding_months: 7, positions: [{ ticker: "HPG", sector: "Thép", weight: 0.16, pnl: 38000000, low_confidence: false }] },
  performance: { portfolio_return: 0.107, benchmark_return: 0.072, excess_return: 0.035, max_drawdown: -0.09, method: "simple_inception" },
  allocation: [{ sector: "Ngân hàng", weight: 0.344, benchmark: 0.38, active: -0.036 }],
  concentration: { top1: 0.187, top3: 0.504, effective_n: 5.8, largest_sector: 0.344 },
  risk: { beta: 1.25, volatility: 0.21, tracking_error: 0.08, correlation: [{ a: "TCB", b: "MBB", value: 0.82 }], excluded: [{ ticker: "APG", reason: "low_liquidity_short_history" }] },
  attribution: [{ ticker: "HPG", pnl: 38000000, pct: 0.63 }],
  quality: { pe: 11.4, pb: 1.6, roe: 0.18, dividend: 0.02, sector_benchmark: null },
  behavior: { avg_holding_days: 48, losing_count: 3, disposition_flag: true, worst_loser: { ticker: "VND", pnl_pct: -0.15, periods_held: 3 } },
  scores: { overall: 3.5, prev_overall: 3.2, pillars: { performance: 4, risk: 3, diversification: 3, quality: 4, discipline: 2 } },
  selected_insights: [{ id: "sector_tilt", data: { sector: "Thép", ratio: 3.2, weight: 0.16 } }],
  progress: { prev_actions: [{ id: "trim_hpg", done: true, detail: "giảm 25%→16%" }] },
}

const narrative: NarrativeJSON = {
  title: "x", verdict: "y", lede: "z", progress_text: "",
  layers: { overview: "", performance: "", allocation: "", stress: "", risk: "", attribution: "", quality: "", behavior: "" },
  insight: { label: "l", text: "t" }, low_data_note: "",
  actions: [{ title: "a", detail: "Đưa tiền mặt lên 15,0%." }], watch: "w", closing: "c",
}

describe("contract types", () => {
  it("accepts the sample shapes", () => {
    expect(analysis.scores.overall).toBe(3.5)
    expect(narrative.actions[0].detail).toContain("15,0%")
  })
})
