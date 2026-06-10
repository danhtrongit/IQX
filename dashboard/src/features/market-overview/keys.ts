/**
 * Feature-local query keys for the market-overview page. Leaves are `readonly`
 * tuples (or functions returning them) per the foundation key convention.
 * TanStack Query dedupes concurrent fetches that share a key, replacing the old
 * manual `request-dedupe` helper used by `dashboard-bak`.
 */
export const marketOverviewKeys = {
  all: ["market-overview"] as const,
  overview: () => ["market-overview", "overview"] as const,
  vnindexOhlcv: () => ["market-overview", "vnindex-ohlcv"] as const,
  foreignFlow: () => ["market-overview", "foreign-flow"] as const,
  proprietary: () => ["market-overview", "proprietary"] as const,
  leadingStocks: () => ["market-overview", "leading-stocks"] as const,
  macro: () => ["market-overview", "macro"] as const,
  sectorInfo: () => ["market-overview", "sector-info"] as const,
  industryRef: () => ["market-overview", "industry-ref"] as const,
  sectorRanking: () => ["market-overview", "sector-ranking"] as const,
  sectorAllocation: () => ["market-overview", "sector-allocation"] as const,
  sectorData: () => ["market-overview", "sector-data"] as const,
  sectorDailyFlow: () => ["market-overview", "sector-daily-flow"] as const,
  industryList: () => ["market-overview", "industry-list"] as const,
  commodities: () => ["market-overview", "commodities"] as const,
  interbank: () => ["market-overview", "interbank"] as const,
  bondYields: () => ["market-overview", "bond-yields"] as const,
  fxRates: () => ["market-overview", "fx-rates"] as const,
  aiMarket: () => ["market-overview", "ai-market"] as const,
  aiIndustryBatch: (codes: number[]) =>
    ["market-overview", "ai-industry-batch", [...codes].sort((a, b) => a - b)] as const,
  aiIndustry: (code: number) => ["market-overview", "ai-industry", code] as const,
  news: (kind: string, topic: string | undefined, page: number, pageSize: number) =>
    ["market-overview", "news", kind, topic ?? null, page, pageSize] as const,
} as const
