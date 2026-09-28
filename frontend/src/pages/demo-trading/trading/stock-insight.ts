/**
 * AI Insight v2 (6 lớp) + BCTC định giá — wire shapes and the PURE readers
 * that turn them into the panel's verdicts.
 *
 * The panel never invents an AI verdict: every value here is read from a real
 * backend payload (`POST /ai/insight/analyze`, `GET /market-data/bctc-dashboard`).
 * When a layer's data is missing the readers return `null` and the UI says so —
 * "chưa đọc được" is not "trung tính".
 */
import type { Lop, Lop5Partial, LyDo, Verdict } from "./plan-math"
import { nhanDinhFromVerdict, verdictFromStatusLevel, verdictFromValuation } from "./plan-math"

/* ── wire shapes (structural subsets of the real payloads) ───────────────── */

export type NarrativeFragment = { type: string; content: string }

export type InsightLayerKey = "L1" | "L2" | "L3" | "L4" | "L5"

export type InsightLayerCard = {
  layerNum?: InsightLayerKey | string
  layerName?: string
  statusLabel?: string
  /** The 5-bậc scale the AI really produced (1 = rất yếu … 5 = rất mạnh). */
  statusLevel?: 1 | 2 | 3 | 4 | 5
  fields?: { label: string; value: NarrativeFragment[] }[]
}

export type StockInsight = {
  symbol: string
  updatedAt?: string
  layers: Partial<Record<InsightLayerKey, InsightLayerCard>>
  rawInput?: { trend?: { ohlcv?: { high?: number | null; low?: number | null; close?: number | null }[] } }
}

export type StockValuation = {
  methods: { name: string; bear: number | null; base: number | null; bull: number | null }[]
  current_price: number | null
  fair_median: number | null
  upside_pct: number | null
}

/** Which AI Insight layer backs each lý do (💎 Định giá uses BCTC instead). */
export const LAYER_BY_LY_DO: Partial<Record<LyDo, InsightLayerKey>> = {
  ky_thuat: "L1",
  dong_tien: "L3",
  noi_bo: "L4",
  tin_tuc: "L5",
}

/* ── narrative fragment readers ─────────────────────────────────────────── */

/** First numeric value in a fragment list (`[num]61.000[/num]` → 61000). */
export function extractNumberFromFragments(
  fragments: NarrativeFragment[] | null | undefined,
): number | null {
  if (!fragments || fragments.length === 0) return null
  const numberFragment = fragments.find((fragment) => fragment.type === "number")
  const candidates = numberFragment ? [numberFragment.content] : fragments.map((f) => f.content)
  for (const text of candidates) {
    const match = text.match(/\d[\d.,]*/)
    if (!match) continue
    const parsed = Number(match[0].replace(/[.,]/g, ""))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

/** L1's committed hỗ trợ/kháng cự marks, read from its own field labels. */
export function extractHoTroKhangCu(fields: InsightLayerCard["fields"]): {
  hoTro: number | null
  khangCu: number | null
} {
  const list = fields ?? []
  return {
    hoTro: extractNumberFromFragments(list.find((field) => field.label === "Hỗ trợ")?.value),
    khangCu: extractNumberFromFragments(list.find((field) => field.label === "Kháng cự")?.value),
  }
}

/** The up-to-five plain-text lines a layer shows in the AI Thanh tra card. */
export function insightLines(layer: InsightLayerCard): string[] {
  return (layer.fields ?? [])
    .slice(0, 5)
    .map((field) => `${field.label}: ${field.value.map((fragment) => fragment.content).join("")}`)
}

/** OHLCV bars the biên độ dao động calculation needs (full VND). */
export function ohlcvBars(insight: StockInsight | null | undefined) {
  return insight?.rawInput?.trend?.ohlcv ?? null
}

/* ── verdicts ───────────────────────────────────────────────────────────── */

/**
 * AI Thanh tra's read of one lý do's lớp. `null` when the layer's real data is
 * unavailable — the caller renders "không tải được", never a fabricated tier.
 */
export function verdictForLyDo(
  insight: StockInsight | null | undefined,
  lyDo: LyDo,
): { verdict: Verdict; lines: string[]; statusLabel: string | null } | null {
  const key = LAYER_BY_LY_DO[lyDo]
  if (!key) return null
  const layer = insight?.layers?.[key]
  if (!layer || layer.statusLevel == null) return null
  return {
    verdict: verdictFromStatusLevel(layer.statusLevel),
    lines: insightLines(layer),
    statusLabel: layer.statusLabel ?? null,
  }
}

/** Vùng giá trị + trung vị from BCTC KHỐI 02's real method rows. */
export function valuationRange(valuation: StockValuation | null | undefined): {
  rangeLow: number
  rangeHigh: number
  median: number
} | null {
  if (!valuation || valuation.fair_median == null) return null
  const bears = valuation.methods.map((method) => method.bear).filter((n): n is number => n != null)
  const bulls = valuation.methods.map((method) => method.bull).filter((n): n is number => n != null)
  return {
    rangeLow: bears.length > 0 ? Math.min(...bears) : valuation.fair_median * 0.85,
    rangeHigh: bulls.length > 0 ? Math.max(...bulls) : valuation.fair_median * 1.15,
    median: valuation.fair_median,
  }
}

/**
 * 💎 Định giá's verdict: price vs vùng giá trị. Prefers the LIVE board price
 * (the panel's own feed) and falls back to BCTC's end-of-day `current_price`
 * only while the live quote isn't ready yet.
 */
export function verdictForValuation(
  valuation: StockValuation | null | undefined,
  livePrice: number,
): Verdict | null {
  const range = valuationRange(valuation)
  if (!range) return null
  const price = livePrice > 0 ? livePrice : valuation?.current_price
  if (price == null || price <= 0) return null
  return verdictFromValuation({
    currentPrice: price,
    median: range.median,
    rangeLow: range.rangeLow,
    rangeHigh: range.rangeHigh,
  })
}

/**
 * The AI's own five-layer read, reduced to the 3 mức the đối chiếu uses.
 * A lớp with no readable data is simply absent (never guessed).
 */
export function aiFiveLayers(
  insight: StockInsight | null | undefined,
  valuation: StockValuation | null | undefined,
  livePrice: number,
): Lop5Partial {
  const result: Lop5Partial = {}
  const layerVerdicts: Partial<Record<Lop, Verdict | null>> = {
    ky_thuat: insight?.layers?.L1?.statusLevel != null ? verdictFromStatusLevel(insight.layers.L1.statusLevel) : null,
    dong_tien: insight?.layers?.L3?.statusLevel != null ? verdictFromStatusLevel(insight.layers.L3.statusLevel) : null,
    noi_bo: insight?.layers?.L4?.statusLevel != null ? verdictFromStatusLevel(insight.layers.L4.statusLevel) : null,
    tin_tuc: insight?.layers?.L5?.statusLevel != null ? verdictFromStatusLevel(insight.layers.L5.statusLevel) : null,
    dinh_gia: verdictForValuation(valuation, livePrice),
  }
  for (const [lop, verdict] of Object.entries(layerVerdicts) as [Lop, Verdict | null][]) {
    if (verdict != null) result[lop] = nhanDinhFromVerdict(verdict)
  }
  return result
}
