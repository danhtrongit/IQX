// ─── React hooks for market data ────────────────────────
// API-backed hooks show loading/error states (no mock fallback).
// Mock fallback only for cards without a backend endpoint (e.g. BondYields).
// Demo mode: set VITE_ENABLE_DEMO_DATA=true to force mock data on all cards.

import { useReducer, useEffect, useCallback, useState } from "react";
import { marketApi } from "./api";
import { dedupeRequest, clearRequestCache } from "./request-dedupe";
import {
  adaptMarketOverview,
  adaptOHLCV,
  adaptForeignFlow,
  adaptProprietaryTrading,
  adaptLeadingStocks,
  adaptNews,
  adaptAINews,
  adaptAIAnalysis,
  adaptMacroGDP,
  adaptMacroFromMultiple,
  adaptSectorData,
  adaptSectorDailyFlow,
  buildIndustryMap,
  adaptCommodityFromOHLCV,
} from "./adapters";
import {
  mockMarketOverview,
  mockVNIndexOHLCV,
  mockForeignFlow,
  mockProprietaryTrading,
  mockLeadingStocks,
  mockNews,
  mockAIAnalysis,
  mockMacroIndicators,
  mockSectorData,
  mockSectorDailyFlow,
  mockCommodities,
} from "./mock-data";
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
  ApiAINewsResponse,
  ApiOHLCV,
  ApiMacroGDPItem,
  ApiCommodityCatalogItem,
  ApiIndustryRef,
  ApiSectorAllocationItem,
  SheetRateRow,
  SheetFXRow,
} from "./types";

type Source = "live" | "mock";

/** Whether demo mode is enabled via env var */
const DEMO_MODE = import.meta.env.VITE_ENABLE_DEMO_DATA === "true";

interface HookResult<T> {
  data: T;
  source: Source;
  loading: boolean;
  refresh: () => void;
}

// ─── Generic async data hook ─────────────────────────────

interface DataState<T> {
  data: T;
  source: Source;
  loading: boolean;
  fetchKey: number;
}

type DataAction<T> =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; data: T }
  | { type: "FETCH_FALLBACK" }
  | { type: "FETCH_ERROR" }
  | { type: "REFRESH" };

function createReducer<T>(fallback: T, emptyState: T) {
  return function reducer(state: DataState<T>, action: DataAction<T>): DataState<T> {
    switch (action.type) {
      case "REFRESH":
        return { ...state, loading: true, fetchKey: state.fetchKey + 1 };
      case "FETCH_START":
        return { ...state, loading: true };
      case "FETCH_SUCCESS":
        return { ...state, data: action.data, source: "live", loading: false };
      case "FETCH_FALLBACK":
        return { data: fallback, source: "mock", loading: false, fetchKey: state.fetchKey };
      case "FETCH_ERROR":
        // Show empty state, not mock data
        return { data: emptyState, source: "live", loading: false, fetchKey: state.fetchKey };
      default:
        return state;
    }
  };
}

/**
 * useApiData — generic hook for API-backed cards.
 *
 * - On success: shows live data.
 * - On error: shows empty state (NOT mock data), unless demo mode is on.
 * - Demo mode (VITE_ENABLE_DEMO_DATA=true): falls back to mock like before.
 *
 * @param useMockFallback - If true, always use mock on error (for cards without API).
 */
function useApiData<TRaw, TUI>(
  fetcher: () => Promise<{ ok: boolean; data?: TRaw }>,
  adapter: (raw: TRaw) => TUI,
  fallback: TUI,
  validator?: (adapted: TUI) => boolean,
  useMockFallback: boolean = false,
): HookResult<TUI> {
  const shouldUseMock = DEMO_MODE || useMockFallback;
  // Empty state = fallback for mock-only cards, empty for API-backed
  const emptyState = shouldUseMock ? fallback : fallback;
  const reducer = createReducer(fallback, emptyState);
  const [state, dispatch] = useReducer(reducer, {
    data: shouldUseMock ? fallback : emptyState,
    source: shouldUseMock ? "mock" : "live",
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const res = await fetcher();
      if (cancelled) return;

      if (res.ok && res.data !== undefined) {
        try {
          const adapted = adapter(res.data as TRaw);
          if (validator && !validator(adapted)) {
            dispatch({ type: shouldUseMock ? "FETCH_FALLBACK" : "FETCH_ERROR" });
          } else {
            dispatch({ type: "FETCH_SUCCESS", data: adapted });
          }
        } catch {
          dispatch({ type: shouldUseMock ? "FETCH_FALLBACK" : "FETCH_ERROR" });
        }
      } else {
        dispatch({ type: shouldUseMock ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── Deduplicated fetcher helpers ────────────────────────
// These wrap marketApi calls with deduplication so multiple hooks
// calling the same endpoint share a single in-flight request.

const dedupedGetSectorInfo = () =>
  dedupeRequest("sectorInfo:1", () => marketApi.getSectorInfo(1));

const dedupedGetIndustryRef = () =>
  dedupeRequest("industryRef", () => marketApi.getIndustryRef());

const dedupedGetSectorRanking = () =>
  dedupeRequest("sectorRanking:1", () => marketApi.getSectorRanking(1));

const dedupedGetMarketIndex = () =>
  dedupeRequest("marketIndex", () => marketApi.getMarketIndex());

const dedupedGetForeignTop = () =>
  dedupeRequest("foreignTop", () => marketApi.getForeignTop());

const dedupedGetSectorAllocation = () =>
  dedupeRequest("sectorAlloc", () => marketApi.getSectorAllocation("ALL", "ONE_DAY"));

// ─── useMarketOverview ───────────────────────────────────

export function useMarketOverview(): HookResult<MarketOverviewUI> {
  return useApiData(
    dedupedGetMarketIndex,
    adaptMarketOverview,
    mockMarketOverview,
    (data) => data.vnindex.value > 0,
  );
}

// ─── useVNIndexOHLCV ─────────────────────────────────────

export function useVNIndexOHLCV(): HookResult<OHLCVBar[]> {
  return useApiData(
    () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return marketApi.getOHLCV("VNINDEX", {
        start: fmt(start),
        end: fmt(end),
        interval: "1D",
      });
    },
    adaptOHLCV,
    mockVNIndexOHLCV,
    (data) => Array.isArray(data) && data.length > 0,
  );
}

// ─── useForeignFlow ──────────────────────────────────────

export function useForeignFlow(): HookResult<ForeignFlowUI> {
  return useApiData(
    dedupedGetForeignTop,
    adaptForeignFlow,
    mockForeignFlow,
  );
}

// ─── useProprietaryTrading ───────────────────────────────

export function useProprietaryTrading(): HookResult<ProprietaryTradingUI> {
  return useApiData(
    () => marketApi.getProprietaryTop(),
    adaptProprietaryTrading,
    mockProprietaryTrading,
  );
}

// ─── useLeadingStocks ────────────────────────────────────

export function useLeadingStocks(): HookResult<LeadingStockUI[]> {
  return useApiData(
    () => marketApi.getIndexImpact(),
    adaptLeadingStocks,
    mockLeadingStocks,
    (data) => data.length > 0,
  );
}

// ─── useNews ─────────────────────────────────────────────

const mockNewsUI: NewsItemUI[] = mockNews.map((item) => ({
  ...item,
  link: undefined,
}));

export function useNews(): HookResult<NewsItemUI[]> {
  return useApiData(
    () => marketApi.getNews(),
    adaptNews,
    mockNewsUI,
    (data) => data.length > 0,
  );
}

// ─── usePaginatedNews ────────────────────────────────────

const _emptyNewsArr: NewsItemUI[] = [];

interface PaginatedNewsResult {
  data: NewsItemUI[];
  source: Source;
  loading: boolean;
  page: number;
  totalPages: number;
  totalRecords: number;
  setPage: (page: number) => void;
  refresh: () => void;
}

export function usePaginatedNews(opts: {
  pageSize?: number;
  kind?: string;
  topic?: string;
} = {}): PaginatedNewsResult {
  const { pageSize = 10, kind = "business", topic } = opts;
  const [page, setPage] = useState(1);
  const [fetchKey, setFetchKey] = useState(0);
  const [state, setState] = useState<{
    data: NewsItemUI[];
    source: Source;
    loading: boolean;
    totalPages: number;
    totalRecords: number;
  }>({
    data: DEMO_MODE ? mockNewsUI : _emptyNewsArr,
    source: DEMO_MODE ? "mock" : "live",
    loading: true,
    totalPages: DEMO_MODE ? 1 : 0,
    totalRecords: DEMO_MODE ? mockNewsUI.length : 0,
  });

  const refresh = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState((s) => ({ ...s, loading: true }));
      const res = await marketApi.getAINews({ kind, page, pageSize, topic });

      if (cancelled) return;

      if (res.ok && res.data) {
        try {
          const response = res.data as ApiAINewsResponse;
          const items = adaptAINews(response.data ?? []);
          if (items.length > 0) {
            setState({
              data: items,
              source: "live",
              loading: false,
              totalRecords: response.total_records ?? 0,
              totalPages: Math.ceil((response.total_records ?? 0) / pageSize),
            });
            return;
          }
        } catch {
          // fallthrough
        }
      }

      // Error/empty: show mock only in demo mode
      if (DEMO_MODE) {
        setState({
          data: mockNewsUI,
          source: "mock",
          loading: false,
          totalPages: 1,
          totalRecords: mockNewsUI.length,
        });
      } else {
        setState({
          data: _emptyNewsArr,
          source: "live",
          loading: false,
          totalPages: 0,
          totalRecords: 0,
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, kind, topic, fetchKey]);

  return {
    data: state.data,
    source: state.source,
    loading: state.loading,
    page,
    totalPages: state.totalPages,
    totalRecords: state.totalRecords,
    setPage,
    refresh,
  };
}

// ─── useAIAnalysis ───────────────────────────────────────

const emptyAIAnalysis: AIAnalysisUI = { bullets: [] };

export function useAIMarketAnalysis(): HookResult<AIAnalysisUI> {
  return useApiData(
    () => marketApi.getAIDashboard(),
    adaptAIAnalysis,
    DEMO_MODE ? { bullets: mockAIAnalysis.market } : emptyAIAnalysis,
  );
}

export function useAISectorAnalysis(icbCode: number = 8300): HookResult<AIAnalysisUI> {
  const fallback = DEMO_MODE ? { bullets: mockAIAnalysis.sector } : emptyAIAnalysis;
  const reducer = createReducer(fallback, emptyAIAnalysis);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: DEMO_MODE ? "mock" as Source : "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      dispatch({ type: "FETCH_START" });
      const res = await marketApi.getAIIndustry(icbCode);
      if (cancelled) return;

      if (res.ok && res.data) {
        try {
          const adapted = adaptAIAnalysis(res.data);
          if (adapted.bullets.length > 0) {
            dispatch({ type: "FETCH_SUCCESS", data: adapted });
            return;
          }
        } catch {
          // fallthrough
        }
      }
      dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [icbCode, state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useAISectorAnalysisBatch (batch prefetch) ──────────

import type { ApiAIIndustryBatchResponse } from "./types";

interface BatchSectorResult {
  /** Analysis for the currently selected ICB code */
  data: AIAnalysisUI;
  source: Source;
  /** True only on the initial batch load; switching industries is instant */
  loading: boolean;
  /** Whether the batch is still loading (show "Đang phân tích các ngành...") */
  batchLoading: boolean;
  refresh: () => void;
}

/**
 * Batch-aware sector analysis hook.
 *
 * - On mount, fetches all level-1 industries in one POST /ai/industry/analyze-batch.
 * - Stores results in memory Map<icb_code, AIAnalysisUI>.
 * - Switching selectedICB is instant (no network call).
 * - If a code wasn't in the batch, falls back to single endpoint and caches locally.
 */
export function useAISectorAnalysisBatch(
  industries: { code: number; name: string }[],
  selectedICB: number,
): BatchSectorResult {
  // Cache stored as state so render can access it without refs
  const [analysisMap, setAnalysisMap] = useState<Record<number, AIAnalysisUI>>({});
  const [errorCodes, setErrorCodes] = useState<Record<number, true>>({});
  // Whether the initial batch has completed
  const [batchDone, setBatchDone] = useState(false);
  const [batchLoading, setBatchLoading] = useState(true);
  // Bump to force re-fetch
  const [fetchKey, setFetchKey] = useState(0);

  const refresh = useCallback(() => {
    setAnalysisMap({});
    setErrorCodes({});
    setBatchDone(false);
    setBatchLoading(true);
    setFetchKey((k) => k + 1);
  }, []);

  // ── Batch fetch on mount / when industries load ──────
  useEffect(() => {
    if (industries.length === 0) return;
    let cancelled = false;

    async function runBatch() {
      setBatchLoading(true);
      // Take up to 20 level-1 codes (backend limit)
      const codes = industries.slice(0, 20).map((i) => i.code);
      const dedupeKey = `aiBatch:${[...codes].sort().join(",")}`;

      try {
        const res = await dedupeRequest(dedupeKey, () =>
          marketApi.getAIIndustryBatch(codes),
        );

        if (cancelled) return;

        if (res.ok && res.data) {
          const batchData = res.data as ApiAIIndustryBatchResponse;
          const newMap: Record<number, AIAnalysisUI> = {};
          const newErrors: Record<number, true> = {};
          for (const item of batchData.results ?? []) {
            if (item.error || !item.analysis) {
              newErrors[item.icb_code] = true;
            } else {
              newMap[item.icb_code] = adaptAIAnalysis(item);
            }
          }
          setAnalysisMap(newMap);
          setErrorCodes(newErrors);
        }
      } catch {
        // batch failed entirely; individual fallbacks will kick in
      }

      if (!cancelled) {
        setBatchDone(true);
        setBatchLoading(false);
      }
    }

    runBatch();
    return () => {
      cancelled = true;
    };
  }, [industries, fetchKey]);

  // ── Fallback: fetch single code not in batch ─────────
  useEffect(() => {
    if (!batchDone) return;
    // Already in cache or known error → no fetch needed
    if (analysisMap[selectedICB] || errorCodes[selectedICB]) return;

    let cancelled = false;

    async function fetchSingle() {
      const res = await marketApi.getAIIndustry(selectedICB);
      if (cancelled) return;

      if (res.ok && res.data) {
        try {
          const adapted = adaptAIAnalysis(res.data);
          if (adapted.bullets.length > 0) {
            setAnalysisMap((prev) => ({ ...prev, [selectedICB]: adapted }));
            return;
          }
        } catch {
          // fallthrough
        }
      }
      setErrorCodes((prev) => ({ ...prev, [selectedICB]: true }));
    }

    fetchSingle();
    return () => {
      cancelled = true;
    };
  }, [selectedICB, batchDone, analysisMap, errorCodes]);

  // ── Derive current result synchronously from state ───
  let data: AIAnalysisUI = emptyAIAnalysis;
  let loading = true;
  const source: Source = "live";

  if (!batchDone) {
    loading = true;
  } else if (analysisMap[selectedICB]) {
    data = analysisMap[selectedICB];
    loading = false;
  } else if (errorCodes[selectedICB]) {
    data = emptyAIAnalysis;
    loading = false;
  } else {
    // Fallback single fetch is in progress
    loading = true;
  }

  return { data, source, loading, batchLoading, refresh };
}

// ─── useMacroIndicators (expanded) ──────────────────────

export function useMacroIndicators(): HookResult<MacroIndicatorUI[]> {
  const fallback = DEMO_MODE ? mockMacroIndicators : [];
  const reducer = createReducer(mockMacroIndicators, []);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: DEMO_MODE ? "mock" as Source : "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const INDICATORS = ["gdp", "cpi", "fdi", "industrial_production", "export_import", "retail"];

    async function run() {
      try {
        const results = await Promise.allSettled(
          INDICATORS.map((key) => marketApi.getMacroIndicator(key)),
        );

        if (cancelled) return;

        const successResults: { key: string; data: ApiMacroGDPItem[] }[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value.ok && r.value.data) {
            successResults.push({ key: INDICATORS[i], data: r.value.data });
          }
        });

        if (successResults.length > 0) {
          const adapted = adaptMacroFromMultiple(successResults);
          if (adapted.length > 0) {
            // If we got fewer than expected, supplement with GDP-only adapter
            if (adapted.length < 3) {
              const gdpResult = successResults.find((r) => r.key === "gdp");
              if (gdpResult) {
                const gdpOnly = adaptMacroGDP(gdpResult.data);
                if (gdpOnly.length > adapted.length) {
                  dispatch({ type: "FETCH_SUCCESS", data: gdpOnly });
                  return;
                }
              }
            }
            dispatch({ type: "FETCH_SUCCESS", data: adapted });
            return;
          }
        }

        // Single GDP fallback
        const gdpRes = await marketApi.getMacroGDP();
        if (cancelled) return;
        if (gdpRes.ok && gdpRes.data) {
          const gdpAdapted = adaptMacroGDP(gdpRes.data);
          if (gdpAdapted.length > 0) {
            dispatch({ type: "FETCH_SUCCESS", data: gdpAdapted });
            return;
          }
        }

        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      } catch {
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useSectorData (with ranking + dedupe) ──────────────

export function useSectorData(): HookResult<SectorDataUI[]> {
  const fallback = DEMO_MODE ? mockSectorData : [];
  const reducer = createReducer(mockSectorData, []);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: DEMO_MODE ? "mock" as Source : "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    clearRequestCache();
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Uses deduplicated fetchers — shared with useSectorDailyFlow
        const [sectorRes, refRes, rankRes, allocRes] = await Promise.all([
          dedupedGetSectorInfo(),
          dedupedGetIndustryRef(),
          dedupedGetSectorRanking(),
          dedupedGetSectorAllocation(),
        ]);

        if (cancelled) return;

        if (sectorRes.ok && sectorRes.data && refRes.ok && refRes.data) {
          const industryMap = buildIndustryMap(refRes.data);
          const ranking = rankRes.ok ? rankRes.data : undefined;
          const allocation = allocRes.ok ? (allocRes.data as ApiSectorAllocationItem[]) : undefined;
          const adapted = adaptSectorData(sectorRes.data, industryMap, ranking, allocation);
          if (adapted.length > 0) {
            dispatch({ type: "FETCH_SUCCESS", data: adapted });
            return;
          }
        }
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      } catch {
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useSectorDailyFlow (dedupe) ─────────────────────────

export function useSectorDailyFlow(): HookResult<SectorDailyFlowUI[]> {
  const fallback = DEMO_MODE ? mockSectorDailyFlow : [];
  const reducer = createReducer(mockSectorDailyFlow, []);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: DEMO_MODE ? "mock" as Source : "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    clearRequestCache();
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Uses deduplicated fetchers — shared with useSectorData
        const [sectorRes, refRes, allocRes] = await Promise.all([
          dedupedGetSectorInfo(),
          dedupedGetIndustryRef(),
          dedupedGetSectorAllocation(),
        ]);

        if (cancelled) return;

        if (sectorRes.ok && sectorRes.data && refRes.ok && refRes.data) {
          const industryMap = buildIndustryMap(refRes.data);
          const allocation = allocRes.ok ? (allocRes.data as ApiSectorAllocationItem[]) : undefined;
          const adapted = adaptSectorDailyFlow(sectorRes.data, industryMap, allocation);
          if (adapted.length > 0) {
            dispatch({ type: "FETCH_SUCCESS", data: adapted });
            return;
          }
        }
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      } catch {
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useCommodities ──────────────────────────────────────

const PRIORITY_CODES = ["gold_global", "oil_crude", "gas_natural", "iron_ore", "steel_hrc"];

const mockCommoditiesUI: CommodityUI[] = mockCommodities.map((c) => ({
  code: c.name.toLowerCase().replace(/\s/g, "_"),
  name: c.name,
  value: c.value,
  unit: c.unit,
  change: c.change,
  changePercent: c.changePercent,
  trend: c.trend,
}));

export function useCommodities(): HookResult<CommodityUI[]> {
  const fallback = DEMO_MODE ? mockCommoditiesUI : [];
  const reducer = createReducer(mockCommoditiesUI, []);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: DEMO_MODE ? "mock" as Source : "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1. Get catalog to find names
        const catalogRes = await marketApi.getCommodityCatalog();
        if (cancelled) return;

        const nameMap = new Map<string, string>();
        if (catalogRes.ok && catalogRes.data) {
          for (const item of catalogRes.data as ApiCommodityCatalogItem[]) {
            nameMap.set(item.code, item.name);
          }
        }

        // 2. Fetch OHLCV for each priority code in parallel
        const ohlcvResults = await Promise.allSettled(
          PRIORITY_CODES.map((code) => marketApi.getCommodityOHLCV(code)),
        );

        if (cancelled) return;

        const commodities: CommodityUI[] = [];
        ohlcvResults.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value.ok && r.value.data) {
            const code = PRIORITY_CODES[i];
            const name = nameMap.get(code) ?? code;
            const adapted = adaptCommodityFromOHLCV(
              code,
              name,
              r.value.data as ApiOHLCV[],
            );
            if (adapted) {
              commodities.push(adapted);
            }
          }
        });

        if (commodities.length > 0) {
          dispatch({ type: "FETCH_SUCCESS", data: commodities });
        } else {
          dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
        }
      } catch {
        dispatch({ type: DEMO_MODE ? "FETCH_FALLBACK" : "FETCH_ERROR" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useInterbankRates (Google Sheets VND) ───────────────

export function useInterbankRates(): HookResult<SheetRateRow[]> {
  const fallback: SheetRateRow[] = [];
  const reducer = createReducer(fallback, fallback);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await marketApi.getSheetsVND();
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        dispatch({ type: "FETCH_SUCCESS", data: res.data });
      } else {
        dispatch({ type: "FETCH_ERROR" });
      }
    }
    run();
    return () => { cancelled = true; };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useBondYields (Google Sheets TPCP) ──────────────────

export function useBondYields(): HookResult<SheetRateRow[]> {
  const fallback: SheetRateRow[] = [];
  const reducer = createReducer(fallback, fallback);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await marketApi.getSheetsTpcp();
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        dispatch({ type: "FETCH_SUCCESS", data: res.data });
      } else {
        dispatch({ type: "FETCH_ERROR" });
      }
    }
    run();
    return () => { cancelled = true; };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useFXRates (Google Sheets TYGIA) ────────────────────

export function useFXRates(): HookResult<SheetFXRow[]> {
  const fallback: SheetFXRow[] = [];
  const reducer = createReducer(fallback, fallback);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: "live" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const res = await marketApi.getSheetsTygia();
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
        dispatch({ type: "FETCH_SUCCESS", data: res.data });
      } else {
        dispatch({ type: "FETCH_ERROR" });
      }
    }
    run();
    return () => { cancelled = true; };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}

// ─── useIndustryList (for AI sector selector) ────────────

export function useIndustryList(): HookResult<{ code: number; name: string }[]> {
  const fallback: { code: number; name: string }[] = [];
  const reducer = createReducer(fallback, fallback);
  const [state, dispatch] = useReducer(reducer, {
    data: fallback,
    source: "mock" as Source,
    loading: true,
    fetchKey: 0,
  });

  const refresh = useCallback(() => {
    dispatch({ type: "REFRESH" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Deduplicated with other hooks using industryRef
      const res = await dedupedGetIndustryRef();
      if (cancelled) return;

      if (res.ok && res.data) {
        const level1 = (res.data as ApiIndustryRef[])
          .filter((d) => d.level === 1)
          .map((d) => ({ code: Number(d.icb_code), name: d.icb_name }))
          .sort((a, b) => a.name.localeCompare(b.name, "vi"));
        if (level1.length > 0) {
          dispatch({ type: "FETCH_SUCCESS", data: level1 });
          return;
        }
      }
      dispatch({ type: "FETCH_ERROR" });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.fetchKey]);

  return { data: state.data, source: state.source, loading: state.loading, refresh };
}
