// ─── IQX Market API Client ──────────────────────────────
// Uses fetch, reads base URL from env, handles errors gracefully.

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

interface FetchResult<T> {
  ok: true;
  data: T;
  sourceUrl?: string;
}

interface FetchError {
  ok: false;
  error: string;
}

export type ApiResult<T> = FetchResult<T> | FetchError;

/**
 * Generic fetcher that wraps `fetch` with timeout, error handling,
 * and automatic JSON parsing.
 */
export async function apiFetch<T>(
  path: string,
  opts?: {
    timeout?: number;
    params?: Record<string, string>;
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<ApiResult<T>> {
  const { timeout = 8_000, params, method = "GET", body } = opts ?? {};
  let urlStr = `${BASE_URL}${path}`;
  if (params) {
    const sp = new URLSearchParams(params);
    urlStr += `?${sp.toString()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const fetchOpts: RequestInit = {
      signal: controller.signal,
      method,
      headers,
    };

    if (method === "POST" && body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(urlStr, fetchOpts);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const json = await res.json();

    // Handle `{ data, source_url }` and `{ data, meta }` wrappers
    if (json && typeof json === "object" && "data" in json) {
      return {
        ok: true,
        data: json.data as T,
        sourceUrl: json.source_url ?? json.meta?.raw_endpoint,
      };
    }

    // Plain response (AI analysis returns { analysis, ... })
    return { ok: true, data: json as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timeout" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetcher for paginated endpoints that return { data, total_records, page, page_size }
 * Returns the full response object (not just .data).
 */
export async function apiFetchPaginated<T>(
  path: string,
  opts?: {
    timeout?: number;
    params?: Record<string, string>;
  },
): Promise<ApiResult<T>> {
  const { timeout = 8_000, params } = opts ?? {};
  let urlStr = `${BASE_URL}${path}`;
  if (params) {
    const sp = new URLSearchParams(params);
    urlStr += `?${sp.toString()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const json = await res.json();
    return { ok: true, data: json as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timeout" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Endpoint helpers ────────────────────────────────────

import type {
  ApiMarketIndex,
  ApiOHLCV,
  ApiForeignTopData,
  ApiProprietaryTopData,
  ApiIndexImpactData,
  ApiNewsItem,
  ApiAINewsResponse,
  ApiAIDashboardResponse,
  ApiAIIndustryResponse,
  ApiAIIndustryBatchResponse,
  ApiMacroGDPItem,
  ApiMacroEconomyItem,
  ApiCommodityCatalogItem,
  ApiSectorInfoItem,
  ApiSectorRankingItem,
  ApiSectorAllocationItem,
  ApiIndustryRef,
  SheetRateRow,
  SheetFXRow,
} from "./types";

export const marketApi = {
  /** GET /market-data/overview/market-index */
  getMarketIndex: () =>
    apiFetch<ApiMarketIndex[]>("/market-data/overview/market-index"),

  /** GET /market-data/quotes/{symbol}/ohlcv */
  getOHLCV: (symbol: string = "VNINDEX", opts?: { start?: string; end?: string; interval?: string }) => {
    const params: Record<string, string> = {};
    if (opts?.start) params.start = opts.start;
    if (opts?.end) params.end = opts.end;
    if (opts?.interval) params.interval = opts.interval;
    return apiFetch<ApiOHLCV[]>(`/market-data/quotes/${symbol}/ohlcv`, {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
  },

  /** GET /market-data/overview/foreign/top */
  getForeignTop: () =>
    apiFetch<ApiForeignTopData>("/market-data/overview/foreign/top"),

  /** GET /market-data/overview/proprietary/top */
  getProprietaryTop: () =>
    apiFetch<ApiProprietaryTopData>("/market-data/overview/proprietary/top"),

  /** GET /market-data/overview/index-impact */
  getIndexImpact: () =>
    apiFetch<ApiIndexImpactData>("/market-data/overview/index-impact"),

  /** GET /market-data/news/latest */
  getNews: () => apiFetch<ApiNewsItem[]>("/market-data/news/latest"),

  /** GET /market-data/news/ai (paginated, supports kind=business|topic|exchange) */
  getAINews: (opts: {
    kind?: string;
    page?: number;
    pageSize?: number;
    topic?: string;
  } = {}) => {
    const { kind = "business", page = 1, pageSize = 10, topic } = opts;
    const params: Record<string, string> = {
      kind,
      page: String(page),
      page_size: String(pageSize),
    };
    if (topic) params.topic = topic;
    return apiFetchPaginated<ApiAINewsResponse>("/market-data/news/ai", { params });
  },

  /** GET /market-data/news/ai/catalogs */
  getAINewsCatalogs: () =>
    apiFetch<{ topics?: Array<{ slug: string; name: string }>; sources?: unknown[]; industries?: unknown[] }>(
      "/market-data/news/ai/catalogs",
    ),

  /** POST /ai/dashboard/analyze */
  getAIDashboard: () =>
    apiFetch<ApiAIDashboardResponse>("/ai/dashboard/analyze", {
      method: "POST",
      body: { language: "vi", include_payload: false },
      timeout: 120_000, // AI analysis can take longer
    }),

  /** POST /ai/industry/analyze */
  getAIIndustry: (icbCode: number) =>
    apiFetch<ApiAIIndustryResponse>("/ai/industry/analyze", {
      method: "POST",
      body: { icb_code: icbCode, language: "vi", include_payload: false },
      timeout: 120_000,
    }),

  /** POST /ai/industry/analyze-batch */
  getAIIndustryBatch: (icbCodes: number[]) =>
    apiFetch<ApiAIIndustryBatchResponse>("/ai/industry/analyze-batch", {
      method: "POST",
      body: { icb_codes: icbCodes, language: "vi", include_payload: false },
      timeout: 180_000, // batch may take longer
    }),

  /** GET /market-data/macro/economy/gdp */
  getMacroGDP: () =>
    apiFetch<ApiMacroGDPItem[]>("/market-data/macro/economy/gdp"),

  /** GET /market-data/sectors/information */
  getSectorInfo: (icbLevel: number = 1) =>
    apiFetch<ApiSectorInfoItem[]>("/market-data/sectors/information", {
      params: { icb_level: String(icbLevel) },
    }),

  /** GET /market-data/sectors/ranking */
  getSectorRanking: (icbLevel: number = 1) =>
    apiFetch<ApiSectorRankingItem[]>("/market-data/sectors/ranking", {
      params: { icb_level: String(icbLevel), adtv: "3", value: "3" },
    }),

  /** GET /market-data/overview/sectors/allocation */
  getSectorAllocation: (group: string = "ALL", timeFrame: string = "ONE_DAY") =>
    apiFetch<ApiSectorAllocationItem[]>("/market-data/overview/sectors/allocation", {
      params: { group, time_frame: timeFrame },
    }),

  /** GET /market-data/reference/industries */
  getIndustryRef: () =>
    apiFetch<ApiIndustryRef[]>("/market-data/reference/industries"),

  // ─── Commodity endpoints ─────────────────────────────────

  /** GET /market-data/macro/commodities (catalog list) */
  getCommodityCatalog: () =>
    apiFetch<ApiCommodityCatalogItem[]>("/market-data/macro/commodities"),

  /** GET /market-data/macro/commodities/{code}?interval=1d (OHLCV) */
  getCommodityOHLCV: (code: string) =>
    apiFetch<ApiOHLCV[]>(`/market-data/macro/commodities/${code}`, {
      params: { interval: "1d" },
    }),

  // ─── Macro economy endpoints ─────────────────────────────

  /** GET /market-data/macro/economy/interest_rate */
  getInterbankRates: () =>
    apiFetch<ApiMacroEconomyItem[]>("/market-data/macro/economy/interest_rate", {
      params: { period: "day", start_year: String(new Date().getFullYear()) },
    }),

  /** GET /market-data/macro/economy/exchange_rate */
  getExchangeRate: () =>
    apiFetch<ApiMacroEconomyItem[]>("/market-data/macro/economy/exchange_rate", {
      params: { period: "day", start_year: String(new Date().getFullYear()) },
    }),

  /** GET /market-data/macro/economy/{indicator} */
  getMacroIndicator: (indicator: string) =>
    apiFetch<ApiMacroGDPItem[]>(`/market-data/macro/economy/${indicator}`),

  // ─── Google Sheets endpoints ──────────────────────────────

  /** GET /market-data/sheets/vnd */
  getSheetsVND: () =>
    apiFetch<SheetRateRow[]>("/market-data/sheets/vnd"),

  /** GET /market-data/sheets/tpcp */
  getSheetsTpcp: () =>
    apiFetch<SheetRateRow[]>("/market-data/sheets/tpcp"),

  /** GET /market-data/sheets/tygia */
  getSheetsTygia: () =>
    apiFetch<SheetFXRow[]>("/market-data/sheets/tygia"),
};
