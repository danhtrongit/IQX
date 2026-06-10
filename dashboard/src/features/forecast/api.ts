import { api } from "@/shared/http/client"

/* ── Types ──────────────────────────────────────────────────────────────── */

export type ForecastHorizon = "3" | "5" | "10"

export interface ForecastItem {
  rank: number
  symbol: string
  /** Fractional return (0.04 = +4%). */
  expectedReturn: number
  /** Projected price target in VND (from the Du_Bao sheet); null if missing. */
  projectedPrice: number | null
  /** Probability of an upward move (0..1) — null for the Du_Bao list. */
  upProbability: number | null
}

interface ForecastRankingResponse {
  horizon: string
  horizonDays: number
  count: number
  items: ForecastItem[]
}

/** One of the 5 AI insight layers (raw output bag). */
export interface InsightLayer {
  label: string
  output: Record<string, unknown> | null
  status?: string
  score?: number
}

export interface InsightData {
  symbol: string
  layers: Record<string, InsightLayer>
}

/** Latest financial-ratio snapshot used by the BCTC rail. */
export interface FinancialRatio {
  pe: number | null
  pb: number | null
  eps: number | null
  bvps: number | null
  roe: number | null
  roa: number | null
  de: number | null
}

export interface CompanyMeta {
  name: string
  exchange: string
}

export type PatternSignal = "bullish" | "bearish" | "neutral"
export type PatternKind = "candles" | "charts"

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

interface PatternResponse {
  symbol: string
  kind: PatternKind
  items: PatternItem[]
  count: number
}

export interface ForecastPatterns {
  candles: PatternItem | null
  charts: PatternItem | null
}

/* ── Endpoint functions ─────────────────────────────────────────────────── */

/** GET ai/forecast/ranking — AI profit-forecast ranking for a horizon. */
export async function fetchForecastRanking(
  horizon: ForecastHorizon,
  limit: number,
): Promise<ForecastItem[]> {
  const res = await api
    .get("ai/forecast/ranking", { searchParams: { horizon, limit } })
    .json<ForecastRankingResponse>()
  return res.items ?? []
}

/** GET ai/insight/{symbol} — the 5-layer AI insight bag. */
export async function fetchInsight(symbol: string): Promise<InsightData> {
  const res = await api
    .get(`ai/insight/${symbol.toUpperCase()}`)
    .json<{ data?: InsightData; message?: string }>()
  if (!res?.data) {
    throw new Error(res?.message || "Không có dữ liệu AI Insight")
  }
  return res.data
}

/** GET market-data/fundamentals/{symbol}/ratio — latest quarterly ratios. */
export async function fetchFinancialRatio(symbol: string): Promise<FinancialRatio> {
  const res = await api
    .get(`market-data/fundamentals/${symbol}/ratio`, { searchParams: { period: "Q" } })
    .json<Record<string, unknown>>()
  const data = (res?.data ?? res) as Record<string, unknown>
  const arr = Array.isArray(data) ? data : (data?.ratio as unknown[])
  const latest = (Array.isArray(arr) ? arr[0] : arr) as Record<string, unknown> | undefined
  if (!latest) throw new Error("Không có chỉ số tài chính")
  return {
    pe: (latest.pe as number) ?? null,
    pb: (latest.pb as number) ?? null,
    eps: (latest.eps as number) ?? null,
    bvps: (latest.bvps as number) ?? null,
    roe: (latest.roe as number) ?? null,
    roa: (latest.roa as number) ?? null,
    de:
      ((latest.debt_to_equity ?? latest.de ?? latest.debtToEquity) as number) ?? null,
  }
}

/** GET market-data/company/{symbol}/overview — name + exchange for the header. */
export async function fetchCompanyMeta(symbol: string): Promise<CompanyMeta> {
  const res = await api
    .get(`market-data/company/${symbol}/overview`)
    .json<Record<string, unknown>>()
  const d = (res?.data ?? res ?? {}) as Record<string, unknown>
  return {
    name:
      ((d.organ_name ?? d.organName ?? d.organ_short_name ?? d.organShortName) as string) || "",
    exchange: (d.exchange as string) || "",
  }
}

/** GET ai/patterns/{candles,charts} — first detected pattern of each kind. */
export async function fetchPatterns(symbol: string): Promise<ForecastPatterns> {
  const [candlesRes, chartsRes] = await Promise.all([
    api
      .get("ai/patterns/candles", { searchParams: { symbol } })
      .json<PatternResponse>()
      .catch(() => null),
    api
      .get("ai/patterns/charts", { searchParams: { symbol } })
      .json<PatternResponse>()
      .catch(() => null),
  ])
  return {
    candles: candlesRes?.items?.[0] ?? null,
    charts: chartsRes?.items?.[0] ?? null,
  }
}
