/** Test fixtures for Backtest v2 (registry templates follow technical-registry.json). */
import type { IndicatorConfig, SharedConfigState, TechnicalIndicator, TechnicalRegistry } from "@/lib/shared-config"

import type { ClosedTrade, RunResult } from "./types"

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const MA: TechnicalIndicator = {
  id: "ma",
  name: "MA / SMA",
  chapter: 1,
  lesson_id: "ch01-l03",
  family: "state",
  formula: "SMA(N)",
  availability: "ohlcv",
  fields: [{ key: "period", label: "Chu kỳ SMA", type: "integer", min: 5, max: 200, step: 1, unit: "phiên", api_scale: 1, wire_unit: "phiên" }],
  buy: {
    enabled: true,
    params: { period: 20 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "close", offset: 0 }, op: ">", rhs: { kind: "series", key: "value", offset: 0 }, allowed_ops: [">", "<"] },
    ],
  },
  sell: {
    enabled: true,
    params: { period: 20 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "close", offset: 0 }, op: "<", rhs: { kind: "series", key: "value", offset: 0 }, allowed_ops: [">", "<"] },
    ],
  },
  learned: true,
}

export const RSI: TechnicalIndicator = {
  id: "rsi",
  name: "RSI",
  chapter: 1,
  lesson_id: "ch01-l05",
  family: "state",
  formula: "RSI(N)",
  availability: "ohlcv",
  fields: [
    { key: "period", label: "Chu kỳ RSI", type: "integer", min: 2, max: 100, step: 1, unit: "phiên", api_scale: 1, wire_unit: "phiên" },
    { key: "level", label: "Ngưỡng", type: "number", min: 0, max: 100, step: 1, unit: "", api_scale: 1, wire_unit: "" },
  ],
  buy: {
    enabled: true,
    params: { period: 14, level: 30 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: 0 }, op: "<", rhs: { kind: "param", key: "level" }, allowed_ops: [">", "<"] },
    ],
  },
  sell: {
    enabled: true,
    params: { period: 14, level: 70 },
    rules: [
      { id: "r1", kind: "compare", lhs: { kind: "series", key: "value", offset: 0 }, op: ">", rhs: { kind: "param", key: "level" }, allowed_ops: [">", "<"] },
    ],
  },
  learned: true,
}

/** Not learned: must never be listed. */
export const MACD: TechnicalIndicator = { ...clone(MA), id: "macd", name: "MACD", lesson_id: "ch01-l06", learned: false }

export const REGISTRY: TechnicalRegistry = {
  calculation_version: "iqx-ta-2.0",
  rule_version: "iqx-rules-2.0",
  indicators: [MA, RSI, MACD],
}

function fromTemplate(entry: TechnicalIndicator, master: boolean): IndicatorConfig {
  return {
    master_enabled: master,
    buy: { enabled: entry.buy.enabled, params: clone(entry.buy.params), rules: clone(entry.buy.rules) },
    sell: { enabled: entry.sell.enabled, params: clone(entry.sell.params), rules: clone(entry.sell.rules) },
  }
}

export function sharedState(overrides: Partial<SharedConfigState> = {}): SharedConfigState {
  return {
    saved_revision: 3,
    effective_revision: 2,
    effective_session: "2026-05-05",
    status: "pending",
    config: {
      schema_version: "2.0",
      revision: 3,
      rule_version: "iqx-rules-2.0",
      indicators: { ma: fromTemplate(MA, true), rsi: fromTemplate(RSI, false), macd: fromTemplate(MACD, false) },
    },
    config_hash: "hash-3",
    registry_version: "iqx-ta-2.0",
    granted_indicators: ["ma", "rsi"],
    ...overrides,
  }
}

export function trade(number: number): ClosedTrade {
  return {
    number,
    qty: 1000,
    entry_date: "2024-01-03",
    entry_signal_date: "2024-01-02",
    entry_price: 30000,
    exit_date: "2024-01-10",
    exit_signal_date: "2024-01-09",
    exit_price: 31000,
    hold: 5,
    pnl: 1000000,
    pnl_pct: 3.2,
    exit_reason: "sell_consensus",
  }
}

export function runResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    schema_version: "2.0",
    engine_version: "iqx-engine-2.0",
    calculation_version: "iqx-ta-2.0",
    rule_version: "iqx-rules-2.0",
    formula_version: "iqx-kpi-2.0",
    profile: { stop_loss: "none", take_profit_pct: null, max_holding: null, trailing: "none", position_size: "all_cash", lot_size: 100, min_held_bars: 2 },
    snapshot: {
      config: sharedState().config,
      options: { capital: 100_000_000, fee_buy: 0.0015, fee_sell: 0.0025, lot: 100, execution: "next_open", min_held_bars: 2, start: "2024-01-01", end: "2024-03-01" },
      actual_start: "2024-01-02",
      actual_end: "2024-03-01",
      bar_count: 3,
      shared_revision: 3,
      config_hash: "hash-3",
    },
    initial: { date: "2024-01-02", value: 100_000_000, return_pct: 0, buy_hold_pct: 0, market_pct: 0, phase: "before_first_execution" },
    curve: [
      { date: "2024-01-02", value: 99_850_000, return_pct: -0.15, buy_hold_pct: 0, market_pct: 0 },
      { date: "2024-01-03", value: 104_000_000, return_pct: 4, buy_hold_pct: 2.5, market_pct: 1 },
      { date: "2024-01-04", value: 110_000_000, return_pct: 10, buy_hold_pct: 5, market_pct: 2 },
    ],
    trades: [trade(1)],
    open_position: null,
    cash: 110_000_000,
    canceled: [],
    kpis: {
      net_return: 10,
      cagr: 12.5,
      max_drawdown: -3.2,
      n_trades: 1,
      n_wins: 1,
      win_rate: 100,
      buy_hold_return: 5,
      market_return: 2,
      profit_factor: null,
    },
    ...overrides,
  }
}
