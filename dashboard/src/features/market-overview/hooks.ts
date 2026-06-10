// ─── TanStack Query hooks for the market-overview page ──
// One hook per data source. Replaces dashboard-bak's reducer + request-dedupe
// machinery: shared query keys give automatic in-flight dedupe (e.g. sector
// info / industry ref / allocation are reused across sector-data and
// sector-daily-flow), and `staleTime` controls re-fetch cadence.

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { marketOverviewApi } from "./api"
import { marketOverviewKeys } from "./keys"
import {
  adaptMarketOverview,
  adaptOHLCV,
  adaptForeignFlow,
  adaptProprietaryTrading,
  adaptLeadingStocks,
  adaptAINews,
  adaptAIAnalysis,
  adaptMacroGDP,
  adaptMacroFromMultiple,
  adaptSectorData,
  adaptSectorDailyFlow,
  adaptIndustryList,
  buildIndustryMap,
  adaptCommodityFromOHLCV,
  adaptInterbankRates,
  type InterbankRateUI,
} from "./adapters"
import type {
  MarketOverviewUI,
  OHLCVBar,
  ForeignFlowUI,
  ProprietaryTradingUI,
  LeadingStockUI,
  NewsItemUI,
  MacroIndicatorUI,
  SectorDataUI,
  SectorDailyFlowUI,
  AIAnalysisUI,
  CommodityUI,
  SheetRateRow,
  SheetFXRow,
  IndustryOption,
  ApiMacroGDPItem,
  ApiCommodityCatalogItem,
} from "./types"

// Cadences (ms). Market data refreshes on the minute; macro/sheets are slow.
const FAST = 60_000
const MED = 5 * 60_000
const SLOW = 30 * 60_000

const emptyOverview: MarketOverviewUI = {
  vnindex: { value: 0, change: 0, changePercent: 0, volume: 0, value_traded: 0, advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 },
  hnxindex: { value: 0, change: 0, changePercent: 0, volume: 0, value_traded: 0, advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 },
  upcomindex: { value: 0, change: 0, changePercent: 0, volume: 0, value_traded: 0, advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 },
  vn30: { value: 0, change: 0, changePercent: 0, volume: 0, value_traded: 0, advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 },
  marketBreadth: { advance: 0, decline: 0, unchanged: 0, ceiling: 0, floor: 0 },
}

// ─── Market overview (VNINDEX + breadth) ────────────────

export function useMarketOverview() {
  const query = useQuery<MarketOverviewUI>({
    queryKey: marketOverviewKeys.overview(),
    queryFn: async () => {
      const data = await marketOverviewApi.getMarketIndex()
      return adaptMarketOverview(data)
    },
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return { data: query.data ?? emptyOverview, loading: query.isLoading }
}

// ─── VNINDEX OHLCV ──────────────────────────────────────

export function useVNIndexOHLCV() {
  const query = useQuery<OHLCVBar[]>({
    queryKey: marketOverviewKeys.vnindexOhlcv(),
    queryFn: async () => adaptOHLCV(await marketOverviewApi.getVNIndexOHLCV()),
    staleTime: FAST,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Foreign flow ───────────────────────────────────────

const emptyFlow: ForeignFlowUI = {
  buyValue: 0, sellValue: 0, netValue: 0, buyVolume: 0, sellVolume: 0, topBuy: [], topSell: [],
}

export function useForeignFlow() {
  const query = useQuery<ForeignFlowUI>({
    queryKey: marketOverviewKeys.foreignFlow(),
    queryFn: async () => adaptForeignFlow(await marketOverviewApi.getForeignTop()),
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return { data: query.data ?? emptyFlow, loading: query.isLoading }
}

// ─── Proprietary trading ────────────────────────────────

const emptyProp: ProprietaryTradingUI = {
  buyValue: 0, sellValue: 0, netValue: 0, netSellValue: 0, topBuy: [], topSell: [],
}

export function useProprietaryTrading() {
  const query = useQuery<ProprietaryTradingUI>({
    queryKey: marketOverviewKeys.proprietary(),
    queryFn: async () => adaptProprietaryTrading(await marketOverviewApi.getProprietaryTop()),
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return { data: query.data ?? emptyProp, loading: query.isLoading }
}

// ─── Leading stocks (index impact) ──────────────────────

export function useLeadingStocks() {
  const query = useQuery<LeadingStockUI[]>({
    queryKey: marketOverviewKeys.leadingStocks(),
    queryFn: async () => adaptLeadingStocks(await marketOverviewApi.getIndexImpact()),
    staleTime: FAST,
    refetchInterval: FAST,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Macro indicators (6 indicators in parallel, GDP fallback) ─

const MACRO_INDICATORS = ["gdp", "cpi", "fdi", "industrial_production", "export_import", "retail"]

export function useMacroIndicators() {
  const query = useQuery<MacroIndicatorUI[]>({
    queryKey: marketOverviewKeys.macro(),
    queryFn: async () => {
      const settled = await Promise.allSettled(
        MACRO_INDICATORS.map((k) => marketOverviewApi.getMacroIndicator(k)),
      )
      const success: { key: string; data: ApiMacroGDPItem[] }[] = []
      settled.forEach((r, i) => {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          success.push({ key: MACRO_INDICATORS[i], data: r.value })
        }
      })

      if (success.length > 0) {
        const adapted = adaptMacroFromMultiple(success)
        if (adapted.length >= 3) return adapted
        // Supplement with GDP-only adapter when we got too few series.
        const gdpResult = success.find((r) => r.key === "gdp")
        if (gdpResult) {
          const gdpOnly = adaptMacroGDP(gdpResult.data)
          if (gdpOnly.length > adapted.length) return gdpOnly
        }
        if (adapted.length > 0) return adapted
      }

      // Single GDP fallback.
      const gdp = await marketOverviewApi.getMacroGDP()
      return adaptMacroGDP(gdp)
    },
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Shared sector building blocks (deduped by query key) ─

function useSectorInfoQuery() {
  return useQuery({
    queryKey: marketOverviewKeys.sectorInfo(),
    queryFn: () => marketOverviewApi.getSectorInfo(1),
    staleTime: MED,
  })
}

function useIndustryRefQuery() {
  return useQuery({
    queryKey: marketOverviewKeys.industryRef(),
    queryFn: () => marketOverviewApi.getIndustryRef(),
    staleTime: SLOW,
  })
}

function useSectorRankingQuery() {
  return useQuery({
    queryKey: marketOverviewKeys.sectorRanking(),
    queryFn: () => marketOverviewApi.getSectorRanking(1),
    staleTime: MED,
  })
}

function useSectorAllocationQuery() {
  return useQuery({
    queryKey: marketOverviewKeys.sectorAllocation(),
    queryFn: () => marketOverviewApi.getSectorAllocation("ALL", "ONE_DAY"),
    staleTime: MED,
  })
}

// ─── Sector data table ──────────────────────────────────

export function useSectorData() {
  const info = useSectorInfoQuery()
  const ref = useIndustryRefQuery()
  const ranking = useSectorRankingQuery()
  const alloc = useSectorAllocationQuery()

  const data = useMemo<SectorDataUI[]>(() => {
    if (!info.data || !ref.data) return []
    const industryMap = buildIndustryMap(ref.data)
    return adaptSectorData(info.data, industryMap, ranking.data, alloc.data)
  }, [info.data, ref.data, ranking.data, alloc.data])

  return { data, loading: info.isLoading || ref.isLoading }
}

// ─── Sector daily flow (bubble chart) ───────────────────

export function useSectorDailyFlow() {
  const info = useSectorInfoQuery()
  const ref = useIndustryRefQuery()
  const alloc = useSectorAllocationQuery()

  const data = useMemo<SectorDailyFlowUI[]>(() => {
    if (!info.data || !ref.data) return []
    const industryMap = buildIndustryMap(ref.data)
    return adaptSectorDailyFlow(info.data, industryMap, alloc.data)
  }, [info.data, ref.data, alloc.data])

  return { data, loading: info.isLoading || ref.isLoading }
}

// ─── Industry list (for AI sector selector) ─────────────

export function useIndustryList() {
  const query = useQuery<IndustryOption[]>({
    queryKey: marketOverviewKeys.industryList(),
    queryFn: async () => adaptIndustryList(await marketOverviewApi.getIndustryRef()),
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Commodities ────────────────────────────────────────

const PRIORITY_CODES = ["gold_global", "oil_crude", "gas_natural", "iron_ore", "steel_hrc"]

export function useCommodities() {
  const query = useQuery<CommodityUI[]>({
    queryKey: marketOverviewKeys.commodities(),
    queryFn: async () => {
      const catalog = await marketOverviewApi.getCommodityCatalog().catch(() => [])
      const nameMap = new Map<string, string>()
      for (const item of (catalog as ApiCommodityCatalogItem[]) ?? []) {
        nameMap.set(item.code, item.name)
      }

      const settled = await Promise.allSettled(
        PRIORITY_CODES.map((code) => marketOverviewApi.getCommodityOHLCV(code)),
      )
      const commodities: CommodityUI[] = []
      settled.forEach((r, i) => {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          const code = PRIORITY_CODES[i]
          const adapted = adaptCommodityFromOHLCV(code, nameMap.get(code) ?? code, r.value)
          if (adapted) commodities.push(adapted)
        }
      })
      return commodities
    },
    staleTime: MED,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Interbank rates (Google Sheets VND) ────────────────

export function useInterbankRates() {
  const query = useQuery<SheetRateRow[]>({
    queryKey: marketOverviewKeys.interbank(),
    queryFn: () => marketOverviewApi.getSheetsVND(),
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Bond yields (Google Sheets TPCP) ───────────────────

export function useBondYields() {
  const query = useQuery<SheetRateRow[]>({
    queryKey: marketOverviewKeys.bondYields(),
    queryFn: () => marketOverviewApi.getSheetsTpcp(),
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── FX rates (Google Sheets TYGIA) ─────────────────────

export function useFXRates() {
  const query = useQuery<SheetFXRow[]>({
    queryKey: marketOverviewKeys.fxRates(),
    queryFn: () => marketOverviewApi.getSheetsTygia(),
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── Interbank rates derived from macro economy (alt) ───
// (kept available if the sheets endpoint is unavailable)

export function useMacroInterbankRates() {
  const query = useQuery<InterbankRateUI[]>({
    queryKey: [...marketOverviewKeys.interbank(), "macro"],
    queryFn: async () => adaptInterbankRates(await marketOverviewApi.getInterbankRates()),
    staleTime: SLOW,
  })
  return { data: query.data ?? [], loading: query.isLoading }
}

// ─── AI market analysis ─────────────────────────────────

const emptyAI: AIAnalysisUI = { bullets: [] }

export function useAIMarketAnalysis() {
  const query = useQuery<AIAnalysisUI>({
    queryKey: marketOverviewKeys.aiMarket(),
    queryFn: async () => adaptAIAnalysis(await marketOverviewApi.getAIDashboard()),
    staleTime: SLOW,
    retry: 1,
  })
  return { data: query.data ?? emptyAI, loading: query.isLoading }
}

// ─── AI sector analysis (batch prefetch + per-code cache) ─

interface AISectorResult {
  data: AIAnalysisUI
  loading: boolean
  /** True while the initial batch is still resolving. */
  batchLoading: boolean
}

/**
 * Batch-aware sector analysis. On mount it requests up to 20 level-1 industries
 * in one POST /ai/industry/analyze-batch (cached under one query key), so
 * switching the selected ICB code is instant. If a code wasn't in the batch
 * result, a single-code query fills it in.
 */
export function useAISectorAnalysisBatch(
  industries: IndustryOption[],
  selectedICB: number,
): AISectorResult {
  const codes = useMemo(() => industries.slice(0, 20).map((i) => i.code), [industries])

  const batch = useQuery<Record<number, AIAnalysisUI>>({
    queryKey: marketOverviewKeys.aiIndustryBatch(codes),
    queryFn: async () => {
      const res = await marketOverviewApi.getAIIndustryBatch(codes)
      const map: Record<number, AIAnalysisUI> = {}
      for (const item of res.results ?? []) {
        if (!item.error && item.analysis) map[item.icb_code] = adaptAIAnalysis(item)
      }
      return map
    },
    enabled: codes.length > 0,
    staleTime: SLOW,
    retry: 1,
  })

  const batchMap = batch.data
  const inBatch = !!batchMap && selectedICB in batchMap

  // Fallback single fetch only when the batch finished and lacks this code.
  const single = useQuery<AIAnalysisUI>({
    queryKey: marketOverviewKeys.aiIndustry(selectedICB),
    queryFn: async () => adaptAIAnalysis(await marketOverviewApi.getAIIndustry(selectedICB)),
    enabled: !!batchMap && !inBatch && selectedICB > 0,
    staleTime: SLOW,
    retry: 1,
  })

  if (!batchMap) {
    return { data: emptyAI, loading: true, batchLoading: batch.isLoading }
  }
  if (inBatch) {
    return { data: batchMap[selectedICB], loading: false, batchLoading: false }
  }
  return {
    data: single.data ?? emptyAI,
    loading: single.isLoading,
    batchLoading: false,
  }
}

// ─── Paginated market news ──────────────────────────────

interface PaginatedNewsResult {
  data: NewsItemUI[]
  loading: boolean
  page: number
  totalPages: number
  totalRecords: number
  setPage: (page: number) => void
}

export function usePaginatedNews(
  opts: { pageSize?: number; kind?: string; topic?: string } = {},
): PaginatedNewsResult {
  const { pageSize = 8, kind = "topic", topic } = opts
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: marketOverviewKeys.news(kind, topic, page, pageSize),
    queryFn: () => marketOverviewApi.getAINews({ kind, page, pageSize, topic }),
    placeholderData: (prev) => prev,
    staleTime: FAST,
  })

  const response = query.data
  const items = useMemo(
    () => (response?.data ? adaptAINews(response.data) : []),
    [response],
  )
  const totalRecords = response?.total_records ?? 0

  return {
    data: items,
    loading: query.isLoading,
    page,
    totalPages: Math.ceil(totalRecords / pageSize),
    totalRecords,
    setPage,
  }
}
