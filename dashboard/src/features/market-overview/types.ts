// ─── Market Overview types ──────────────────────────────
// Ported from dashboard-bak/src/features/market/types.ts. API (snake_case)
// response shapes + UI (camelCase) shapes consumed by the panels.

// ─── OHLCV ──────────────────────────────────────────────

export interface ApiOHLCV {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ─── Foreign Flow Top ────────────────────────────────────

export interface ApiForeignTopItem {
  symbol: string
  exchange: string
  company_name: string
  net_value_vnd: number
  buy_value_vnd: number
  sell_value_vnd: number
  match_price: number
  ref_price: number
}

export interface ApiForeignTopData {
  net_buy: ApiForeignTopItem[]
  net_sell: ApiForeignTopItem[]
  total_net_buy_vnd: number
  total_net_sell_vnd: number
  group: string
}

// ─── Proprietary Top ─────────────────────────────────────

export interface ApiProprietaryTopItem {
  ticker: string
  exchange: string
  company_name: string
  total_value_vnd: number
  total_volume: number
  match_price: number
  ref_price: number | null
}

export interface ApiProprietaryTopData {
  buy: ApiProprietaryTopItem[]
  sell: ApiProprietaryTopItem[]
  trading_date: string
}

// ─── Index Impact ────────────────────────────────────────

export interface ApiIndexImpactItem {
  symbol: string
  impact: number
  exchange: string
  company_name: string
  match_price: number
  ref_price: number
}

export interface ApiIndexImpactData {
  top_up: ApiIndexImpactItem[]
  top_down: ApiIndexImpactItem[]
  group: string
  time_frame: string
}

// ─── AI News (paginated) ─────────────────────────────────

export interface ApiAINewsItem {
  id: string
  slug: string
  ticker: string
  industry: string
  title: string
  short_content: string
  source_link: string
  image_url: string
  update_date: string
  source: string
  source_name: string
  sentiment: "Positive" | "Negative" | "Neutral"
  score: number
  topic_name?: string
  raw_type: string
}

export interface ApiAINewsResponse {
  data: ApiAINewsItem[]
  total_records: number
  kind: string
  page: number
  page_size: number
  source_url?: string
}

// ─── AI Analysis (POST endpoints) ───────────────────────

export interface ApiAIDashboardResponse {
  analysis: string
  model?: string
  language?: string
}

export interface ApiAIIndustryResponse {
  analysis: string
  icb_code?: number
  model?: string
  language?: string
}

export interface ApiAIIndustryBatchResponse {
  results: Array<ApiAIIndustryResponse & { icb_code: number; error?: string }>
}

// ─── Macro reports ──────────────────────────────────────

export interface ApiMacroGDPItem {
  report_data_id: number
  id: number
  year: number
  group_name: string
  group_id: number
  name: string
  unit: string
  value: number
  report_time: string
  source: string | null
}

export interface ApiMacroEconomyItem {
  report_data_id: number
  id: number
  year: number
  day: string // "/Date(1776877200000)/"
  group_name: string
  group_id: number
  name: string
  unit: string
  css_style: string
  type_id: number
  source: string | null
  value: number | null
  report_time: string // "23/04/2026"
}

// ─── Commodity ──────────────────────────────────────────

export interface ApiCommodityCatalogItem {
  code: string
  ticker: string
  name: string
}

// ─── Sectors ────────────────────────────────────────────

export interface ApiSectorInfoItem {
  icb_code: string
  market_cap: number
  last_close_index: number
  last_20_day_index: number[]
  percent_price_change_1d: number
  percent_price_change_1w: number
  percent_price_change_1m: number
  percent_price_change_6m: number
  percent_price_change_ytd: number
  percent_price_change_1y: number
}

export interface ApiSectorRankingValue {
  date: string
  value: number
  sector_trend?: "UP" | "DOWN"
  extreme_value?: number
  trend_start_value?: number
}

export interface ApiSectorRankingItem {
  icb_code: string
  values: ApiSectorRankingValue[]
}

export interface ApiSectorAllocationItem {
  icb_code: string
  icb_name?: string
  total_value_vnd: number
  [key: string]: unknown
}

export interface ApiIndustryRef {
  icb_code: string
  icb_name: string
  en_icb_name: string
  level: number
}

// ─── Google Sheets rows ─────────────────────────────────

export interface SheetRateRow {
  tenor: string
  today: string
  yesterday: string
  change: string
  todayNumeric: number | null
  yesterdayNumeric: number | null
  changeNumeric: number | null
}

export interface SheetFXRow {
  currency: string
  today: string
  yesterday: string
  change: string
  todayNumeric: number | null
  yesterdayNumeric: number | null
  changeNumeric: number | null
}

// ─── UI-level types used by panels ──────────────────────

export interface MarketIndexUI {
  value: number
  change: number
  changePercent: number
  volume: number
  value_traded: number
  advance: number
  decline: number
  unchanged: number
  ceiling: number
  floor: number
}

export interface MarketOverviewUI {
  vnindex: MarketIndexUI
  hnxindex: MarketIndexUI
  upcomindex: MarketIndexUI
  vn30: MarketIndexUI
  marketBreadth: {
    advance: number
    decline: number
    unchanged: number
    ceiling: number
    floor: number
  }
}

export interface ForeignFlowUI {
  buyValue: number
  sellValue: number
  netValue: number
  buyVolume: number
  sellVolume: number
  topBuy: { symbol: string; value: number; volume: number }[]
  topSell: { symbol: string; value: number; volume: number }[]
}

export interface ProprietaryTradingUI {
  buyValue: number
  sellValue: number
  netValue: number
  netSellValue: number
  topBuy: { symbol: string; value: number; volume: number }[]
  topSell: { symbol: string; value: number; volume: number }[]
}

export interface LeadingStockUI {
  symbol: string
  name: string
  price: number
  priceChange: number
  change: number
  volume: number
  contribution: number
}

export interface NewsItemUI {
  id: number
  title: string
  source: string
  time: string
  category: "macro" | "earnings" | "company" | "analysis" | "commodity"
  isHot: boolean
  slug?: string
  link?: string
  sentiment?: "Positive" | "Negative" | "Neutral"
  /** Badge label: topic_name → industry (non-OTHER) → ticker → category label */
  badgeLabel?: string
}

export interface OHLCVBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MacroIndicatorUI {
  name: string
  subtitle?: string
  value: string
  change: string
  trend: "up" | "down"
  sparkline?: number[]
}

export interface SectorDataUI {
  code: string
  name: string
  change: number
  volume: number
  marketCap: number
  totalValueVnd: number
  topStock: string
  topChange: number
  advance: number
  decline: number
  label: string
}

export interface SectorDailyFlowUI {
  date: string
  volume: number
  performance: number
  perfHistory?: number[]
  totalValueVnd?: number
}

export interface AIAnalysisUI {
  bullets: string[]
}

export interface CommodityUI {
  code: string
  name: string
  value: string
  unit: string
  change: string
  changePercent: number
  trend: "up" | "down"
  sparkline?: number[]
}

export interface IndustryOption {
  code: number
  name: string
}
