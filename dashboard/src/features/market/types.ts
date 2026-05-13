// ─── API Response Types ─────────────────────────────────
// Maps to IQX backend response shapes

/** Generic wrapper for `{ data, source_url }` responses */
export interface ApiDataResponse<T> {
  data: T;
  source_url?: string;
}

/** Generic wrapper for `{ data, meta }` responses */
export interface ApiMetaResponse<T> {
  data: T;
  meta?: {
    source?: string;
    source_priority?: number;
    fallback_used?: boolean;
    as_of?: string;
    raw_endpoint?: string;
  };
}

// ─── Market Index ────────────────────────────────────────

export interface ApiMarketIndex {
  symbol: string;
  board: string;
  price: number;
  ref_price: number;
  change: number;
  change_percent: number;
  total_shares: number;
  total_value_million_vnd: number;
  total_stock_increase: number;
  total_stock_decline: number;
  total_stock_no_change: number;
  total_stock_ceiling: number;
  total_stock_floor: number;
  time: string;
}

// ─── OHLCV ──────────────────────────────────────────────

export interface ApiOHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Foreign Flow Top ────────────────────────────────────

export interface ApiForeignTopItem {
  symbol: string;
  exchange: string;
  company_name: string;
  net_value_vnd: number;
  buy_value_vnd: number;
  sell_value_vnd: number;
  match_price: number;
  ref_price: number;
}

export interface ApiForeignTopData {
  net_buy: ApiForeignTopItem[];
  net_sell: ApiForeignTopItem[];
  total_net_buy_vnd: number;
  total_net_sell_vnd: number;
  group: string;
}

// ─── Proprietary Top ─────────────────────────────────────

export interface ApiProprietaryTopItem {
  ticker: string;
  exchange: string;
  company_name: string;
  total_value_vnd: number;
  total_volume: number;
  match_price: number;
  ref_price: number | null;
}

export interface ApiProprietaryTopData {
  buy: ApiProprietaryTopItem[];
  sell: ApiProprietaryTopItem[];
  trading_date: string;
}

// ─── Index Impact ────────────────────────────────────────

export interface ApiIndexImpactItem {
  symbol: string;
  impact: number;
  exchange: string;
  company_name: string;
  match_price: number;
  ref_price: number;
}

export interface ApiIndexImpactData {
  top_up: ApiIndexImpactItem[];
  top_down: ApiIndexImpactItem[];
  group: string;
  time_frame: string;
}

// ─── News ────────────────────────────────────────────────

export interface ApiNewsItem {
  title: string;
  link: string;
  description: string;
  pub_date: string;
  image_url: string;
  site: string;
}

// ─── AI News (paginated) ─────────────────────────────────

export interface ApiAINewsItem {
  id: string;
  slug: string;
  ticker: string;
  industry: string;
  title: string;
  short_content: string;
  source_link: string;
  image_url: string;
  update_date: string;
  source: string;
  source_name: string;
  sentiment: "Positive" | "Negative" | "Neutral";
  score: number;
  topic_name?: string;
  raw_type: string;
}

export interface ApiAINewsResponse {
  data: ApiAINewsItem[];
  total_records: number;
  kind: string;
  page: number;
  page_size: number;
  source_url?: string;
}

// ─── AI Analysis (POST endpoints) ───────────────────────

export interface ApiAIDashboardResponse {
  analysis: string;
  model?: string;
  language?: string;
}

export interface ApiAIIndustryResponse {
  analysis: string;
  icb_code?: number;
  model?: string;
  language?: string;
}

/** Batch industry analysis response from POST /ai/industry/analyze-batch */
export interface ApiAIIndustryBatchResponse {
  results: Array<ApiAIIndustryResponse & { icb_code: number; error?: string }>;
}

// ─── Macro GDP ──────────────────────────────────────────

export interface ApiMacroGDPItem {
  report_data_id: number;
  id: number;
  year: number;
  group_name: string;
  group_id: number;
  name: string;
  unit: string;
  value: number;
  report_time: string;
  source: string | null;
}

// ─── Macro Economy Reports (interest_rate, exchange_rate) ──

export interface ApiMacroEconomyItem {
  report_data_id: number;
  id: number;
  year: number;
  day: string; // "/Date(1776877200000)/"
  group_name: string;
  group_id: number;
  name: string;
  unit: string;
  css_style: string;
  type_id: number;
  source: string | null;
  value: number | null;
  report_time: string; // "23/04/2026"
}

// ─── Commodity Catalog ──────────────────────────────────

export interface ApiCommodityCatalogItem {
  code: string;
  ticker: string;
  name: string;
}

// ─── Commodity OHLCV (same shape as market OHLCV) ───────
// Uses ApiOHLCV from above

// ─── Sector Information ─────────────────────────────────

export interface ApiSectorInfoItem {
  icb_code: string;
  market_cap: number;
  last_close_index: number;
  last_20_day_index: number[];
  percent_price_change_1d: number;
  percent_price_change_1w: number;
  percent_price_change_1m: number;
  percent_price_change_6m: number;
  percent_price_change_ytd: number;
  percent_price_change_1y: number;
}

// ─── Sector Ranking ─────────────────────────────────────

export interface ApiSectorRankingValue {
  date: string;
  value: number;
  sector_trend?: "UP" | "DOWN";
  extreme_value?: number;
  trend_start_value?: number;
}

export interface ApiSectorRankingItem {
  icb_code: string;
  values: ApiSectorRankingValue[];
}

// ─── Sector Allocation ──────────────────────────────────

export interface ApiSectorAllocationItem {
  icb_code: string;
  icb_name?: string;
  total_value_vnd: number;
  [key: string]: unknown;
}

// ─── Industry Reference ─────────────────────────────────

export interface ApiIndustryRef {
  icb_code: string;
  icb_name: string;
  en_icb_name: string;
  level: number;
}

// ─── UI-level types used by panels ───────────────────────

export interface MarketIndexUI {
  value: number;
  change: number;
  changePercent: number;
  volume: number;
  value_traded: number;
  advance: number;
  decline: number;
  unchanged: number;
  ceiling: number;
  floor: number;
}

export interface MarketOverviewUI {
  vnindex: MarketIndexUI;
  hnxindex: MarketIndexUI;
  upcomindex: MarketIndexUI;
  vn30: MarketIndexUI;
  marketBreadth: {
    advance: number;
    decline: number;
    unchanged: number;
    ceiling: number;
    floor: number;
  };
}

export interface ForeignFlowUI {
  buyValue: number;
  sellValue: number;
  netValue: number;
  buyVolume: number;
  sellVolume: number;
  topBuy: { symbol: string; value: number; volume: number }[];
  topSell: { symbol: string; value: number; volume: number }[];
}

export interface ProprietaryTradingUI {
  buyValue: number;
  sellValue: number;
  netValue: number;
  netSellValue: number;
  topBuy: { symbol: string; value: number; volume: number }[];
  topSell: { symbol: string; value: number; volume: number }[];
}

export interface LeadingStockUI {
  symbol: string;
  name: string;
  price: number;
  priceChange: number;
  change: number;
  volume: number;
  contribution: number;
}

export interface NewsItemUI {
  id: number;
  title: string;
  source: string;
  time: string;
  category: 'macro' | 'earnings' | 'company' | 'analysis' | 'commodity';
  isHot: boolean;
  slug?: string;
  link?: string;
  sentiment?: 'Positive' | 'Negative' | 'Neutral';
  /** Badge label: topic_name → industry (non-OTHER) → ticker → category label */
  badgeLabel?: string;
}

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacroIndicatorUI {
  name: string;
  /** Data period subtitle, e.g. "Quý I/2025", "Tháng 4/2025", "YoY" */
  subtitle?: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  /** Historical values for sparkline chart (oldest → newest) */
  sparkline?: number[];
}

export interface SectorDataUI {
  code: string;
  name: string;
  change: number;
  volume: number;
  marketCap: number;
  /** GTGD in VND from sector allocation */
  totalValueVnd: number;
  topStock: string;
  topChange: number;
  advance: number;
  decline: number;
  label: string;
}

export interface SectorDailyFlowUI {
  date: string;
  volume: number;
  performance: number;
  /** Performance history (last 20 days index) for sparkline */
  perfHistory?: number[];
  /** GTGD snapshot in VND */
  totalValueVnd?: number;
}

export interface AIAnalysisUI {
  bullets: string[];
}

// ─── Commodity UI ───────────────────────────────────────

export interface CommodityUI {
  code: string;
  name: string;
  value: string;
  unit: string;
  change: string;
  changePercent: number;
  trend: 'up' | 'down';
  /** Historical close prices for sparkline chart (oldest → newest) */
  sparkline?: number[];
}

// ─── Interbank Rate UI ──────────────────────────────────

export interface InterbankRateUI {
  tenor: string;
  rate: number;
  change: number;
  sparkline: number[];
}

// ─── FX Rate UI ─────────────────────────────────────────

export interface FXRateUI {
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  flag: string;
  sparkline: number[];
  isLive: boolean;
}

// ─── Google Sheets Row Types ─────────────────────────────

/** Row from /market-data/sheets/vnd or /sheets/tpcp */
export interface SheetRateRow {
  tenor: string;
  today: string;
  yesterday: string;
  change: string;
  todayNumeric: number | null;
  yesterdayNumeric: number | null;
  changeNumeric: number | null;
}

/** Row from /market-data/sheets/tygia */
export interface SheetFXRow {
  currency: string;
  today: string;
  yesterday: string;
  change: string;
  todayNumeric: number | null;
  yesterdayNumeric: number | null;
  changeNumeric: number | null;
}
