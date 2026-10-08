import type { SharedConfig, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { TRADES_PAGE_SIZE, type ClosedTrade, type ConditionEvidence, type RunResponse, type RunResult, type TradesPage } from "./api"

export type ChartPoint = { date: string; strategy: number; buyHold: number; market: number | null }

/** The 0% starting point (before the first fee) followed by the complete curve, never down-sampled by KPIs. */
export function chartPoints(result: Pick<RunResult, "initial" | "curve">): ChartPoint[] {
  return [result.initial, ...result.curve].map((point) => ({
    date: point.date,
    strategy: point.return_pct,
    buyHold: point.buy_hold_pct,
    market: typeof point.market_pct === "number" && Number.isFinite(point.market_pct) ? point.market_pct : null,
  }))
}

/** Thin a long curve for drawing only; the first and the last point (which match the KPIs) are always kept. */
export function thinPoints<T>(points: readonly T[], max = 600): T[] {
  if (points.length <= max) return [...points]
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, index) => index % step === 0)
  const last = points[points.length - 1] as T
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** First page of the trade history taken from the run itself, so opening a run costs no extra request. */
export function tradesPageFromRun(run: RunResponse): TradesPage | undefined {
  const result = run.result
  if (!result) return undefined
  return {
    run_id: run.run_id,
    total: result.counts.closed_trade_count,
    offset: 0,
    limit: TRADES_PAGE_SIZE,
    counts: result.counts,
    items: result.trades.slice(0, TRADES_PAGE_SIZE),
    open_position: result.open_position,
    pending_orders: result.pending_orders,
  }
}

type SideParams = Record<string, number>

/** Params of one indicator side as pinned in the run's own config snapshot. */
export function snapshotParams(config: Record<string, unknown> | undefined, indicatorId: string, side: "buy" | "sell"): SideParams | undefined {
  const indicators = config?.indicators
  if (!indicators || typeof indicators !== "object") return undefined
  const entry = (indicators as Record<string, unknown>)[indicatorId]
  if (!entry || typeof entry !== "object") return undefined
  const sideConfig = (entry as Record<string, unknown>)[side]
  const params = sideConfig && typeof sideConfig === "object" ? (sideConfig as { params?: unknown }).params : undefined
  return params && typeof params === "object" ? (params as SideParams) : undefined
}

/** "Mua: MACD + MA / SMA · Bán: MACD" of the config a run pinned. */
export function configCaption(config: Record<string, unknown> | undefined, indicators: readonly TechnicalIndicator[]): string {
  const saved = (config as Partial<SharedConfig> | undefined)?.indicators
  if (!saved) return "Không có cấu hình đã ghim"
  const names = (side: "buy" | "sell") => {
    const used = indicators.filter((indicator) => saved[indicator.id]?.master_enabled && saved[indicator.id]?.[side]?.enabled).map((indicator) => indicator.name)
    return used.length > 0 ? used.join(" + ") : "không có"
  }
  return `Mua: ${names("buy")} · Bán: ${names("sell")}`
}

export function conditionNames(evidence: ConditionEvidence | null, indicators: readonly TechnicalIndicator[]): string {
  if (!evidence || evidence.indicator_ids.length === 0) return "—"
  return evidence.indicator_ids.map((id) => indicators.find((indicator) => indicator.id === id)?.name ?? id.toUpperCase()).join(" + ")
}

export const OUTCOME_LABEL: Record<ClosedTrade["outcome"], string> = { win: "Lãi", loss: "Lỗ", flat: "Hòa vốn" }

const EXIT_REASONS: Record<string, string> = {
  sell_signal: "Điều kiện Bán đạt",
  sell_consensus: "Điều kiện Bán đạt",
}

export function exitReasonLabel(reason: string): string {
  return EXIT_REASONS[reason] ?? reason
}
