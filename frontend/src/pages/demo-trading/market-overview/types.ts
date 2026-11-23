export const WIDGET_SLUGS = [
  "index_chart",
  "market_breadth",
  "market_liquidity",
  "foreign_flow",
  "vnindex_impact",
  "market_heatmap",
  "featured_stocks",
  "sector_performance",
  "sector_rotation",
  "derivatives_summary",
  "vn30f_vs_vn30",
  "futures_table",
  "world_indices",
  "commodities_fx",
  "events_calendar",
  "market_news",
] as const

export type WidgetSlug = (typeof WIDGET_SLUGS)[number]

export type CatalogGroupId =
  | "indices"
  | "stocks"
  | "sectors"
  | "derivatives"
  | "global"
  | "events_news"

export interface CatalogGroup {
  readonly id: CatalogGroupId
  readonly label: string
}

export type ExchangeCode = "HOSE" | "HNX" | "UPCOM"
export type IndexChartSymbol = "VNINDEX" | "VN30" | "HNX" | "UPCOM" | "VN30F1M"
export type IndexChartRange = "intraday" | "3m" | "1y"
export type ForeignFlowType = "foreign" | "prop"
export type HeatmapView = "stock" | "sector"
export type HeatmapSizeBy = "market_cap" | "value"
export type FeaturedStocksTab = "gainers" | "losers" | "liquidity" | "foreign" | "volume_spike"
export type SectorPerfRange = "1d" | "1w" | "1m" | "ytd"
export type SectorPerfTab = "price" | "flow"
export type Vn30fRange = "intraday" | "1m" | "3m"
export type CommoditiesTab = "energy_metals" | "agriculture" | "gold_fx"
export type EventsFilter = "all" | "cash_dividend" | "other"
export type FuturesUnderlying = "VN30" | "VN100"
export type FuturesMaturity = "1M" | "2M" | "1Q" | "2Q"
export type RrgQuadrant = "leading" | "weakening" | "lagging" | "improving"
export type PriceTone = "ce" | "fl" | "up" | "dn" | "ref"
export type SignedTone = "up" | "dn" | "ref"

export interface WidgetStateMap {
  index_chart: {
    index: IndexChartSymbol
    range: IndexChartRange
  }
  market_breadth: Record<string, never>
  market_liquidity: Record<string, never>
  foreign_flow: {
    exchange: ExchangeCode
    type: ForeignFlowType
  }
  vnindex_impact: Record<string, never>
  market_heatmap: {
    view: HeatmapView
    sizeBy: HeatmapSizeBy
  }
  featured_stocks: {
    tab: FeaturedStocksTab
  }
  sector_performance: {
    range: SectorPerfRange
    tab: SectorPerfTab
  }
  sector_rotation: Record<string, never>
  derivatives_summary: Record<string, never>
  vn30f_vs_vn30: {
    range: Vn30fRange
  }
  futures_table: Record<string, never>
  world_indices: Record<string, never>
  commodities_fx: {
    tab: CommoditiesTab
  }
  events_calendar: {
    filter: EventsFilter
  }
  market_news: Record<string, never>
}

export interface GridRect {
  x: number
  y: number
  w: number
  h: number
}

export type GridItem<W extends WidgetSlug = WidgetSlug> = W extends WidgetSlug
  ? {
      uid: string
      widget: W
      x: number
      y: number
      w: number
      h: number
      state: Partial<WidgetStateMap[W]>
    }
  : never

export interface OverviewPage {
  version: number
  id: string
  name: string
  order: number
  items: GridItem[]
  updatedAt: string
  readonly?: boolean
}

export type WidgetMeta<W extends WidgetSlug = WidgetSlug> = W extends WidgetSlug
  ? {
      readonly id: W
      readonly title: string
      readonly group: CatalogGroupId
      readonly defaultW: number
      readonly defaultH: number
      readonly minW: number
      readonly minH: number
      readonly inMarketTemplate: boolean
      readonly defaultState: Readonly<WidgetStateMap[W]>
      readonly keywords: readonly string[]
    }
  : never

export interface EmptyHole extends GridRect {
  isEnd?: boolean
}

/* ================= 16 WIDGET DATA PAYLOADS ================= */

export interface IndexCardItem {
  code: IndexChartSymbol
  name: string
  price: number
  refPrice: number
  change: number
  changePct: number
  volume: number | null
  valueBillion: number | null
  volumeUnit?: "shares" | "contracts"
  sparkline: number[]
}

export interface IndexChartPoint {
  time: string
  timestamp?: number
  value: number
  volume: number | null
}

export interface IndexChartData {
  selectedIndex: IndexChartSymbol
  range: IndexChartRange
  sessionDate: string
  isMarketOpen: boolean
  cards: IndexCardItem[]
  series: IndexChartPoint[]
  refPrice: number | null
}

export interface MarketBreadthExchange {
  exchange: ExchangeCode
  advancing: number
  unchanged: number
  declining: number
  ceiling: number
  floor: number
  total: number
}

export interface MarketBreadthData {
  sessionDate: string
  exchanges: MarketBreadthExchange[]
}

export interface MarketLiquidityPoint {
  time: string
  timestamp?: number
  todayBillion: number | null
  prevSessionBillion: number | null
  avg20Billion: number | null
}

export interface MarketLiquidityData {
  exchange: "HOSE"
  sessionDate: string
  currentValueBillion: number
  pctVsPrevSameTime: number | null
  pctVsAvg20SameTime: number | null
  series: MarketLiquidityPoint[]
}

export interface ForeignFlowSession {
  date: string
  netValueBillion: number
  buyValueBillion: number
  sellValueBillion: number
}

export interface ForeignFlowTicker {
  symbol: string
  netValueBillion: number
  price?: number
  refPrice?: number
}

export interface ForeignFlowData {
  exchange: ExchangeCode
  type: ForeignFlowType
  sessionDate: string
  isEodOnly: boolean
  supported: boolean
  netValueBillion: number
  buyValueBillion: number
  sellValueBillion: number
  sessions: ForeignFlowSession[]
  topBuy: ForeignFlowTicker[]
  topSell: ForeignFlowTicker[]
}

export interface VnIndexImpactItem {
  symbol: string
  companyName?: string
  impact: number
  price: number
  refPrice: number
  changePct: number
}

export interface VnIndexImpactData {
  sessionDate: string
  indexChange: number
  totalPositiveImpact: number
  totalNegativeImpact: number
  gainers: VnIndexImpactItem[]
  decliners: VnIndexImpactItem[]
}

export interface HeatmapStockItem {
  symbol: string
  sectorCode: string
  sectorName: string
  exchange: ExchangeCode
  price: number
  refPrice: number
  ceilingPrice: number
  floorPrice: number
  changePct: number
  isCeiling: boolean
  isFloor: boolean
  marketCapBillion: number
  valueBillion: number
  volume: number
}

export interface HeatmapSectorGroup {
  icbCode: string
  name: string
  marketCapBillion: number
  valueBillion: number
  changePct: number
  stocks: HeatmapStockItem[]
}

export interface MarketHeatmapData {
  sessionDate: string
  view: HeatmapView
  sizeBy: HeatmapSizeBy
  sectors: HeatmapSectorGroup[]
}

export interface FeaturedStockItem {
  symbol: string
  exchange: ExchangeCode
  price: number
  refPrice: number
  ceilingPrice: number
  floorPrice: number
  changePct: number
  isCeiling: boolean
  isFloor: boolean
  valueBillion: number
  foreignNetBillion: number | null
  volumeRatio20d: number | null
}

export interface FeaturedStocksData {
  sessionDate: string
  tab: FeaturedStocksTab
  items: FeaturedStockItem[]
}

export interface SectorPerformanceItem {
  icbCode: string
  name: string
  changePct: number
  advancing: number
  declining: number
  unchanged: number
  valueBillion: number
  valueSharePct: number
  valueVsAvg20Ratio: number | null
}

export interface SectorPerformanceData {
  sessionDate: string
  range: SectorPerfRange
  tab: SectorPerfTab
  sectors: SectorPerformanceItem[]
}

export interface RrgPoint {
  date: string
  rsRatio: number
  rsMomentum: number
}

export interface RrgSectorTrail {
  icbCode: string
  name: string
  quadrant: RrgQuadrant
  points: RrgPoint[]
}

export interface RrgDomain {
  minRatio: number
  maxRatio: number
  minMomentum: number
  maxMomentum: number
}

export interface SectorRotationData {
  asOfDate: string
  benchmark: "VNINDEX"
  domain?: RrgDomain
  sectors: RrgSectorTrail[]
}

export interface DerivativesSummaryData {
  sessionDate: string
  contractCode: string
  vn30fPrice: number
  vn30fRefPrice: number
  vn30fChangePct: number
  vn30Price: number
  vn30RefPrice: number
  vn30ChangePct: number
  basis: number
  volumeContracts: number
  valueBillion: number
  foreignNetContracts: number
  expiryDate: string
  remainingSessions: number
}

export interface Vn30fComparisonPoint {
  time: string
  timestamp?: number
  vn30: number | null
  vn30f: number | null
  basis: number | null
}

export interface Vn30fVsVn30Data {
  sessionDate: string
  range: Vn30fRange
  latestVn30: number
  latestVn30f: number
  latestBasis: number
  points: Vn30fComparisonPoint[]
}

export interface FuturesContractRow {
  code: string
  displayCode: string
  underlying: FuturesUnderlying
  maturity: FuturesMaturity
  expiryDate: string
  remainingSessions: number
  price: number
  refPrice: number
  changePct: number
  basis: number
  volumeContracts: number
  valueBillion: number
  foreignNetBillion: number
}

export interface FuturesContractGroup {
  underlying: FuturesUnderlying
  spotPrice: number
  contracts: FuturesContractRow[]
}

export interface FuturesTableData {
  sessionDate: string
  groups: FuturesContractGroup[]
}

export interface WorldIndexItem {
  code: string
  name: string
  region: string
  isClosed: boolean
  price: number
  changePct: number
  updatedAt: string
}

export interface WorldIndicesData {
  updatedAt: string
  items: WorldIndexItem[]
}

export interface CommodityFxItem {
  code: string
  name: string
  unit: string
  price: number
  decimals?: number
  changePct: number
  mappedSectorName: string | null
  mappedSectorChangePct: number | null
  updatedAt: string
}

export interface CommoditiesFxData {
  tab: CommoditiesTab
  updatedAt: string
  items: CommodityFxItem[]
}

export type CorporateEventType =
  | "cash_dividend"
  | "stock_dividend"
  | "bonus_shares"
  | "rights_issue"
  | "agm"
  | "other"

export interface CorporateEventItem {
  id: string
  exDate: string
  symbol: string
  price: number | null
  refPrice: number | null
  ceilingPrice?: number | null
  floorPrice?: number | null
  type: CorporateEventType
  title: string
  cashPerShareVnd: number | null
  dividendYieldPct: number | null
}

export interface EventsCalendarData {
  filter: EventsFilter
  fromDate: string
  toDate: string
  items: CorporateEventItem[]
}

export interface MarketNewsItem {
  id: string
  slug?: string
  category: string
  title: string
  publishedAt: string
  source?: string
  url?: string | null
  symbols?: string[]
}

export interface MarketNewsData {
  updatedAt: string
  enabled: boolean
  items: MarketNewsItem[]
}

export interface WidgetDataMap {
  index_chart: IndexChartData
  market_breadth: MarketBreadthData
  market_liquidity: MarketLiquidityData
  foreign_flow: ForeignFlowData
  vnindex_impact: VnIndexImpactData
  market_heatmap: MarketHeatmapData
  featured_stocks: FeaturedStocksData
  sector_performance: SectorPerformanceData
  sector_rotation: SectorRotationData
  derivatives_summary: DerivativesSummaryData
  vn30f_vs_vn30: Vn30fVsVn30Data
  futures_table: FuturesTableData
  world_indices: WorldIndicesData
  commodities_fx: CommoditiesFxData
  events_calendar: EventsCalendarData
  market_news: MarketNewsData
}

export interface WidgetSnapshotResponse<W extends WidgetSlug = WidgetSlug> {
  widget: W
  fetchedAt: string
  sessionDate: string
  stale?: boolean
  data: WidgetDataMap[W]
}
