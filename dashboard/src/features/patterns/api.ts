import { api } from "@/shared/http/client"

export type PatternKind = "candles" | "charts"
export type PatternSignal = "bullish" | "bearish" | "neutral"

/** A single AI-detected candlestick / chart pattern. */
export interface PatternItem {
  symbol: string
  name: string
  signal: PatternSignal
  signalLabel: string | null
  state: string | null
  meaning: string | null
  action: string | null
  illustration: string | null
}

export interface PatternResponse {
  symbol: string
  kind: PatternKind
  items: PatternItem[]
  count: number
}

/**
 * GET ai/patterns/{candles|charts}?symbol=… — premium-gated AI pattern
 * recognition for the active symbol. Returns the detected patterns in
 * descending relevance order (the first is the "headline" pattern).
 */
export async function fetchPatterns(
  kind: PatternKind,
  symbol: string,
  signal?: AbortSignal,
): Promise<PatternItem[]> {
  const res = await api
    .get(`ai/patterns/${kind}`, { searchParams: { symbol }, signal })
    .json<PatternResponse>()
  return res.items ?? []
}

export const patternsApi = { fetchPatterns }
