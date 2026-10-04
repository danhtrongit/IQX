/**
 * Legacy lab equity curve → return % series (BACKTEST-RETROFIT §7).
 *
 * The legacy engine sends base-100 indices: `strategy` = NAV/V0 × 100,
 * `buy_hold` = close/close₀ × 100, `vnindex` = index/index₀ × 100. Return % is
 * therefore `index − 100` — never rebased on the first (post-fee) point — and
 * the series starts with an explicit 0% point (state before the first fee).
 */
import type { EquityPoint } from "../types"

export type PctPoint = { date: string; strategy: number; buy_hold: number; vnindex?: number }

/** Keeps first and last points so the end of every line matches its KPI. */
export function downsampleEquity(points: EquityPoint[], max = 400): EquityPoint[] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, index) => index % step === 0)
  const last = points[points.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export function toPctSeries(points: EquityPoint[]): PctPoint[] {
  if (points.length === 0) return []
  const hasVnindex = points.some((point) => point.vnindex != null)
  const initial: PctPoint = { date: points[0]!.date, strategy: 0, buy_hold: 0, ...(hasVnindex ? { vnindex: 0 } : {}) }
  return [
    initial,
    ...points.map((point) => {
      const row: PctPoint = { date: point.date, strategy: point.strategy - 100, buy_hold: point.buyHold - 100 }
      if (point.vnindex != null) row.vnindex = point.vnindex - 100
      return row
    }),
  ]
}
