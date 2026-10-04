/**
 * Chart series of a v2 run: the engine's 0% initial point (before the first
 * fee) followed by the full curve. Values are already percent units:
 * return % = (NAV/V0 − 1) × 100, buy & hold % and VN-Index % from the same
 * first session — one linear scale, never rebased on the first post-fee bar.
 */
import { fmtDate } from "./format"
import type { CurvePoint, RunResult } from "./types"

export type ReturnPoint = {
  date: string
  label: string
  strategy: number
  buy_hold: number
  vnindex: number | null
}

export function toReturnSeries(result: Pick<RunResult, "initial" | "curve">): ReturnPoint[] {
  const points: CurvePoint[] = [result.initial, ...(result.curve ?? [])].filter(Boolean)
  return points.map((point, index) => ({
    date: point.date,
    label: index === 0 ? `${fmtDate(point.date)} · trước giao dịch đầu` : fmtDate(point.date),
    strategy: point.return_pct,
    buy_hold: point.buy_hold_pct,
    vnindex: typeof point.market_pct === "number" && Number.isFinite(point.market_pct) ? point.market_pct : null,
  }))
}

/** Thin long curves for rendering only; the first (0%) and last (KPI) points are always kept. */
export function thinSeries<T>(points: T[], max = 600): T[] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, index) => index % step === 0)
  const last = points[points.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}
