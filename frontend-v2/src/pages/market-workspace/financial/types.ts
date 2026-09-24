/**
 * Types for the BCTC storytelling dashboard — a faithful mirror of the backend
 * contract:
 *  - `BctcDashboardData` ← `compute_dashboard` (compute.py `assemble_dashboard`)
 *  - `BctcNarrative`     ← the AI narrative (`ai/bctc-dashboard/{symbol}` →
 *    `{data: {verdict_oneliner, story, blocks{...}}}`, schema in
 *    SYSTEM_PROMPT_ai_generate.md / narrative_validator.py)
 *
 * Everything the compute layer can leave `None` is typed `| null` here (peer
 * medians / radar scores / colours arrive from the B3 benchmark layer, which is
 * best-effort and may be absent).
 */

export type BctcTemplate = "A" | "B"

/* ── KHỐI 0 · hero + radar ─────────────────────────────────────────────────── */

export interface BctcHero {
  ticker: string
  name: string | null
  exchange: string | null
  sector: string | null
  price: number | null
  fair_value: number | null
  upside_pct: number | null
}

export interface BctcRadarDim {
  key: string
  label: string
  /** 0–100, filled by the B3 threshold layer (null in the B1 shape) */
  score: number | null
  /** good | warn | bad — colour band from B3 (null in the B1 shape) */
  band: string | null
  /** deterministic display string, e.g. "24.1%" */
  value_label: string | null
  value: number | null
}

export interface BctcRadar {
  dims: BctcRadarDim[]
}

/* ── shared metric ─────────────────────────────────────────────────────────── */

export interface BctcMetric {
  key: string
  label: string
  value: number | null
  /** "%" | "x" — present on business/cashflow/health metrics (via `_metric`) */
  unit?: string
  peer_median: number | null
  /** green | amber | red — from B3 (absent on valuation metrics) */
  color?: string | null
}

/* ── KHỐI 3 · bức tranh tài chính ──────────────────────────────────────────── */

export interface BctcStackedYear {
  year: number
  equity: number | null
  other_liab: number | null
  debt: number | null
}

export interface BctcGrowthSource {
  label: string
  amount: number | null
  pct: number | null
}

export interface BctcTotal {
  label: string
  value: number | null
  mult: number | null
}

export interface BctcAssetSlice {
  label: string
  pct: number | null
}

export interface BctcFinancialBlock {
  stacked_abs: BctcStackedYear[]
  growth_sources: BctcGrowthSource[]
  totals: BctcTotal[]
  asset_mix: BctcAssetSlice[]
}

/* ── KHỐI 4 · kinh doanh (A) / kiếm tiền (B) ───────────────────────────────── */

export interface BctcRevenueYear {
  year: number
  revenue: number | null
  gross_margin: number | null
  net_margin: number | null
}

export interface BctcNimYear {
  year: number
  nim: number | null
}

export interface BctcMixSlice {
  label: string
  pct: number | null
}

export interface BctcEarningsQuality {
  core_pct: number | null
  oneoff_pct: number | null
  peer_median: number | null
}

export interface BctcBusinessBlockA {
  revenue_series: BctcRevenueYear[]
  metrics: BctcMetric[]
  earnings_quality: BctcEarningsQuality
}

export interface BctcBusinessBlockB {
  revenue_series: BctcRevenueYear[]
  metrics: BctcMetric[]
  nim_series: BctcNimYear[]
  income_mix: BctcMixSlice[]
}

/* ── KHỐI 5 · tiền có thật (A) / vận hành (B) ──────────────────────────────── */

export interface BctcProfitCashYear {
  year: number
  profit: number | null
  cfo: number | null
}

export interface BctcWaterfallLine {
  label: string
  value: number | null
  kind: "base" | "delta"
}

export interface BctcCashflowBlockA {
  profit_vs_cash: BctcProfitCashYear[]
  metrics: BctcMetric[]
  waterfall: BctcWaterfallLine[]
}

export interface BctcCirYear {
  year: number
  cir: number | null
}

export interface BctcCashflowBlockB {
  cir_series: BctcCirYear[]
  metrics: BctcMetric[]
  ppop: number | null
}

/* ── KHỐI 2 · định giá ─────────────────────────────────────────────────────── */

export interface BctcValMethod {
  name: string
  bear: number | null
  base: number | null
  bull: number | null
}

export interface BctcValuationBlock {
  methods: BctcValMethod[]
  current_price: number | null
  fair_median: number | null
  upside_pct: number | null
  metrics: BctcMetric[]
}

/* ── KHỐI 6 · sức khỏe (A) / chất lượng tài sản (B) ────────────────────────── */

export interface BctcPeerRow {
  label: string
  value: number | null
}

export interface BctcSeriesRow {
  year: number
  value: number | null
}

export interface BctcHealthSub {
  series: BctcSeriesRow[]
  peer: BctcPeerRow[]
}

export interface BctcChecklistItem {
  label: string
  ok: boolean
}

export interface BctcHealthSubC {
  series: Array<{ year: number; company: number | null; peer: number | null }>
  checklist: BctcChecklistItem[]
}

export interface BctcHealthBlockA {
  sub_a: BctcHealthSub
  sub_b: BctcHealthSub
  sub_c: BctcHealthSubC
}

export interface BctcHealthBlockB {
  sub_a: BctcHealthSub
  sub_b: BctcHealthSub
}

/* ── KHỐI 7 · cổ tức ───────────────────────────────────────────────────────── */

export interface BctcDividendBlock {
  series: BctcSeriesRow[]
  yield: number | null
  payout: number | null
  form: string
}

/* ── blocks + meta + root ──────────────────────────────────────────────────── */

export interface BctcBlocks {
  financial: BctcFinancialBlock
  business: BctcBusinessBlockA | BctcBusinessBlockB
  cashflow: BctcCashflowBlockA | BctcCashflowBlockB
  valuation: BctcValuationBlock
  health: BctcHealthBlockA | BctcHealthBlockB
  dividend: BctcDividendBlock
}

export interface BctcMeta {
  periods: string[]
  is_estimated_fields: string[]
  peer_count: number
  peer_asof: string | null
  disclaimers: string[]
}

export interface BctcDashboardData {
  template: BctcTemplate
  sub_sector: string | null
  hero: BctcHero
  radar: BctcRadar
  blocks: BctcBlocks
  meta: BctcMeta
}

/* ── AI narrative ──────────────────────────────────────────────────────────── */

export interface BctcStory {
  lead: string
  paragraphs: string[]
  strengths: string[]
  watchlist: string[]
}

/**
 * A per-block narrative entry. Simple blocks carry only `answer`; the health /
 * asset_quality block also carries `sub` (a→c for A, a/b for B). Kept loose so a
 * single accessor works across both template shapes.
 */
export interface BctcNarrativeBlock {
  answer?: string
  sub?: Record<string, string>
}

export interface BctcNarrative {
  verdict_oneliner?: string
  story?: BctcStory
  /**
   * Keys follow the template: A → valuation/financial/business/cashflow/health/
   * dividend; B → …/earning/efficiency/asset_quality/…
   */
  blocks?: Record<string, BctcNarrativeBlock>
}
