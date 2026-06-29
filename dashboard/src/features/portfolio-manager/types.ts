export interface PositionRow { ticker: string; sector: string; weight: number; pnl: number; low_confidence: boolean }
export interface AllocationRow { sector: string; weight: number; benchmark: number | null; active: number | null }
export interface CorrelationPair { a: string; b: string; value: number }
export interface ExcludedTicker { ticker: string; reason: string }
export interface AttributionRow { ticker: string; pnl: number; pct: number | null }
export interface WorstLoser { ticker: string; pnl_pct: number | null; periods_held: number }
export interface PrevAction { id: string; done: boolean; detail: string }

export interface AnalysisJSON {
  insufficient_data?: boolean
  reason?: string
  meta: { portfolio_id: string; date: string; mode: "first" | "full_changed" | "light_unchanged"; period: string; period_number: number }
  overview: { nav: number; cash_pct: number; n_positions: number; total_return: number; total_pnl: number; holding_months: number; positions: PositionRow[] }
  performance: { portfolio_return: number; benchmark_return: number; excess_return: number; max_drawdown: number; method: string }
  allocation: AllocationRow[]
  concentration: { top1: number; top3: number; effective_n: number; largest_sector: number }
  risk: { beta: number; volatility: number; tracking_error: number; correlation: CorrelationPair[]; excluded: ExcludedTicker[] }
  attribution: AttributionRow[]
  quality: { pe: number | null; pb: number | null; roe: number | null; dividend: number | null; sector_benchmark: { sector: string; your_return: number; industry_return: number; gap: number } | null }
  behavior: { avg_holding_days: number; losing_count: number; disposition_flag: boolean; worst_loser: WorstLoser | null }
  scores: { overall: number; prev_overall: number | null; pillars: { performance: number; risk: number; diversification: number; quality: number; discipline: number } }
  selected_insights: { id: string; data: Record<string, unknown> }[]
  progress: { prev_actions: PrevAction[] }
}

export interface NarrativeJSON {
  // Backend validator guarantees title/verdict/lede/layers(all 8)/actions/watch/closing.
  // progress_text is "" on the first report; insight/low_data_note may be absent/empty.
  title: string; verdict: string; lede: string; progress_text: string
  layers: { overview: string; performance: string; allocation: string; stress: string; risk: string; attribution: string; quality: string; behavior: string }
  insight?: { label: string; text: string }
  low_data_note?: string
  actions: { title: string; detail: string }[]
  watch: string; closing: string
}

export interface AnalyzeResponse {
  // NOTE: this top-level meta is the generator's meta, NOT analysis.meta.
  // period_number lives in analysis.meta.period_number — read it from there.
  analysis: AnalysisJSON
  narrative: NarrativeJSON | null
  meta: { valid: boolean; cached: boolean; insufficient?: boolean; model?: string }
}
