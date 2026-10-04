/**
 * Readers for the research / portfolio payloads of `POST /strategy/backtests`.
 *
 * The engine (quant/v2/advanced) returns the whole candidate region for
 * sensitivity, two separate reports for out-of-sample and independently
 * funded windows for walk-forward. Readers accept the documented field names
 * and never invent values: anything absent stays `null` and renders "—".
 */
import type { BacktestRunResponse, Kpis } from "./types"

type Raw = Record<string, unknown>

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function kpisOf(value: unknown): Partial<Kpis> {
  return (record(value) ?? {}) as Partial<Kpis>
}

export function researchPayload(response: BacktestRunResponse): Raw | null {
  return record(response.research_result) ?? record(record(response.result)?.research_result)
}

export type SensitivityRow = {
  value: number | null
  ok: boolean
  error: string | null
  config_hash: string | null
  net_return: number | null
  max_drawdown: number | null
  n_trades: number | null
}

export function sensitivityRows(payload: Raw | null): SensitivityRow[] {
  if (!payload) return []
  const list = [payload.candidates, payload.results, payload.rows].find(Array.isArray) as unknown[] | undefined
  return (list ?? []).flatMap((item) => {
    const row = record(item)
    if (!row) return []
    const kpis = kpisOf(row.kpis)
    const error = record(row.error)
    return [
      {
        value: num(row.value),
        ok: row.ok !== false && !row.error,
        error: str(row.error) ?? str(error?.message) ?? null,
        config_hash: str(row.config_hash),
        net_return: num(kpis.net_return),
        max_drawdown: num(kpis.max_drawdown),
        n_trades: num(row.n_trades) ?? num(kpis.n_trades),
      },
    ]
  })
}

export type SegmentReport = {
  label: string
  start: string | null
  end: string | null
  net_return: number | null
  max_drawdown: number | null
  n_trades: number | null
}

function segment(label: string, value: unknown): SegmentReport | null {
  const report = record(value)
  if (!report) return null
  const kpis = kpisOf(report.kpis)
  const snapshot = record(report.snapshot) ?? {}
  return {
    label,
    start: str(snapshot.actual_start) ?? str(report.start),
    end: str(snapshot.actual_end) ?? str(report.end),
    net_return: num(kpis.net_return),
    max_drawdown: num(kpis.max_drawdown),
    n_trades: num(kpis.n_trades),
  }
}

export function outOfSampleReports(payload: Raw | null): SegmentReport[] {
  if (!payload) return []
  return [
    segment("Trước mốc chia", payload.train ?? payload.in_sample),
    segment("Sau mốc chia", payload.test ?? payload.out_of_sample),
  ].filter((item): item is SegmentReport => item !== null)
}

export type WalkForwardWindow = {
  train_start: string | null
  train_end: string | null
  test_start: string | null
  test_end: string | null
  selected: number | null
  train_return: number | null
  test_return: number | null
  n_trades: number | null
  status: string | null
}

export function walkForwardWindows(payload: Raw | null): WalkForwardWindow[] {
  const list = payload && Array.isArray(payload.windows) ? payload.windows : []
  return list.flatMap((item) => {
    const row = record(item)
    if (!row) return []
    return [
      {
        train_start: str(row.train_start),
        train_end: str(row.train_end),
        test_start: str(row.test_start),
        test_end: str(row.test_end),
        selected: num(row.selected),
        train_return: num(row.train_return),
        test_return: num(row.test_return),
        n_trades: num(row.n_trades),
        status: str(row.status),
      },
    ]
  })
}

export type SystemSummary = {
  kpis: Partial<Kpis>
  ledger_size: number | null
  applied: string[]
  trades: number
  positions_open: { symbol: string; qty: number | null; market_value: number | null; unrealized_pnl: number | null }[]
}

/** `system_result` (CONTRACTS §4.1): one shared ledger — never per-symbol averages. */
export function systemSummary(response: BacktestRunResponse): SystemSummary | null {
  const system = record(response.system_result) ?? record(record(response.result)?.system_result)
  if (!system) return null
  const positions = Array.isArray(system.positions_open) ? system.positions_open : []
  return {
    kpis: kpisOf(system.kpis),
    ledger_size: num(system.ledger_size),
    applied: Array.isArray(system.applied) ? system.applied.filter((item): item is string => typeof item === "string") : [],
    trades: Array.isArray(system.trades) ? system.trades.length : 0,
    positions_open: positions.flatMap((item) => {
      const row = record(item)
      const symbol = row ? str(row.symbol) : null
      if (!row || !symbol) return []
      return [{ symbol, qty: num(row.qty), market_value: num(row.market_value), unrealized_pnl: num(row.unrealized_pnl) }]
    }),
  }
}

/** "10, 20, 30" → [10, 20, 30]; null when any entry is not a finite number. */
export function parseValueList(input: string): number[] | null {
  const parts = input
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const values = parts.map(Number)
  return values.every(Number.isFinite) ? values : null
}

/** "fpt, vnm hpg" → ["FPT", "VNM", "HPG"] (unique, upper-case). */
export function parseSymbols(input: string): string[] {
  return [...new Set(input.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean))]
}
