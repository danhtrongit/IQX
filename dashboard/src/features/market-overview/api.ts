// ─── Market Overview API client ─────────────────────────
// Ported from dashboard-bak/src/features/market/api.ts (raw fetch) onto the
// single shared `api` ky client. All market endpoints return `{ data, meta }`
// (or `{ data, source_url }`); `unwrap` strips the envelope. AI POST endpoints
// return a bare object (no envelope) — `unwrap` tolerates that too.

import { api, unwrap } from "@/shared/http/client"
import type {
  ApiOHLCV,
  ApiForeignTopData,
  ApiProprietaryTopData,
  ApiIndexImpactData,
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
} from "./types"

/** GET an envelope endpoint and unwrap to `T`. */
async function getData<T>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T> {
  const res = await api
    .get(path, searchParams ? { searchParams } : undefined)
    .json<unknown>()
  return unwrap<T>(res as never)
}

/** POST a JSON body to an AI endpoint and return the (un-enveloped) payload. */
async function postData<T>(path: string, json: unknown, timeout?: number): Promise<T> {
  const res = await api
    .post(path, { json, ...(timeout ? { timeout } : {}) })
    .json<unknown>()
  return unwrap<T>(res as never)
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`

/** Symbols requested from the market-index endpoint (incl. VN30 for breadth). */
const INDEX_REQUEST_SYMBOLS = ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]

export const marketOverviewApi = {
  /**
   * GET market-data/overview/market-index — raw market-index rows (snake_case)
   * incl. breadth/volume. Adapted by `adaptMarketOverview`. (The slimmed
   * `IndexData[]` lives in @/features/market-data; the page needs full breadth.)
   */
  getMarketIndex: () =>
    getData<Record<string, unknown>[]>("market-data/overview/market-index", {
      symbols: INDEX_REQUEST_SYMBOLS.join(","),
    }),

  /** GET market-data/quotes/{symbol}/ohlcv */
  getOHLCV: (
    symbol = "VNINDEX",
    opts?: { start?: string; end?: string; interval?: string },
  ) => {
    const params: Record<string, string> = {}
    if (opts?.start) params.start = opts.start
    if (opts?.end) params.end = opts.end
    if (opts?.interval) params.interval = opts.interval
    return getData<ApiOHLCV[]>(
      `market-data/quotes/${symbol}/ohlcv`,
      Object.keys(params).length ? params : undefined,
    )
  },

  /** Last ~1 month of VNINDEX daily candles. */
  getVNIndexOHLCV: () => {
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 1)
    return marketOverviewApi.getOHLCV("VNINDEX", {
      start: fmtDate(start),
      end: fmtDate(end),
      interval: "1D",
    })
  },

  /** GET market-data/overview/foreign/top */
  getForeignTop: () =>
    getData<ApiForeignTopData>("market-data/overview/foreign/top"),

  /** GET market-data/overview/proprietary/top */
  getProprietaryTop: () =>
    getData<ApiProprietaryTopData>("market-data/overview/proprietary/top"),

  /** GET market-data/overview/index-impact */
  getIndexImpact: () =>
    getData<ApiIndexImpactData>("market-data/overview/index-impact"),

  /** GET market-data/news/ai (paginated; kind=business|topic|exchange). */
  getAINews: (
    opts: { kind?: string; page?: number; pageSize?: number; topic?: string } = {},
  ) => {
    const { kind = "business", page = 1, pageSize = 10, topic } = opts
    const params: Record<string, string> = {
      kind,
      page: String(page),
      page_size: String(pageSize),
    }
    if (topic) params.topic = topic
    // Paginated endpoint returns the full object (not an envelope).
    return api
      .get("market-data/news/ai", { searchParams: params })
      .json<ApiAINewsResponse>()
  },

  /** POST ai/dashboard/analyze (AI; long timeout). */
  getAIDashboard: () =>
    postData<ApiAIDashboardResponse>(
      "ai/dashboard/analyze",
      { language: "vi", include_payload: false },
      120_000,
    ),

  /** POST ai/industry/analyze */
  getAIIndustry: (icbCode: number) =>
    postData<ApiAIIndustryResponse>(
      "ai/industry/analyze",
      { icb_code: icbCode, language: "vi", include_payload: false },
      120_000,
    ),

  /** POST ai/industry/analyze-batch */
  getAIIndustryBatch: (icbCodes: number[]) =>
    postData<ApiAIIndustryBatchResponse>(
      "ai/industry/analyze-batch",
      { icb_codes: icbCodes, language: "vi", include_payload: false },
      180_000,
    ),

  /** GET market-data/macro/economy/gdp */
  getMacroGDP: () =>
    getData<ApiMacroGDPItem[]>("market-data/macro/economy/gdp"),

  /** GET market-data/macro/economy/{indicator} */
  getMacroIndicator: (indicator: string) =>
    getData<ApiMacroGDPItem[]>(`market-data/macro/economy/${indicator}`),

  /** GET market-data/sectors/information */
  getSectorInfo: (icbLevel = 1) =>
    getData<ApiSectorInfoItem[]>("market-data/sectors/information", {
      icb_level: String(icbLevel),
    }),

  /** GET market-data/sectors/ranking */
  getSectorRanking: (icbLevel = 1) =>
    getData<ApiSectorRankingItem[]>("market-data/sectors/ranking", {
      icb_level: String(icbLevel),
      adtv: "3",
      value: "3",
    }),

  /** GET market-data/overview/sectors/allocation */
  getSectorAllocation: (group = "ALL", timeFrame = "ONE_DAY") =>
    getData<ApiSectorAllocationItem[]>("market-data/overview/sectors/allocation", {
      group,
      time_frame: timeFrame,
    }),

  /** GET market-data/reference/industries */
  getIndustryRef: () =>
    getData<ApiIndustryRef[]>("market-data/reference/industries"),

  /** GET market-data/macro/commodities (catalog list) */
  getCommodityCatalog: () =>
    getData<ApiCommodityCatalogItem[]>("market-data/macro/commodities"),

  /** GET market-data/macro/commodities/{code}?interval=1d (OHLCV) */
  getCommodityOHLCV: (code: string) =>
    getData<ApiOHLCV[]>(`market-data/macro/commodities/${code}`, {
      interval: "1d",
    }),

  /** GET market-data/macro/economy/interest_rate */
  getInterbankRates: () =>
    getData<ApiMacroEconomyItem[]>("market-data/macro/economy/interest_rate", {
      period: "day",
      start_year: String(new Date().getFullYear()),
    }),

  /** GET market-data/macro/economy/exchange_rate */
  getExchangeRate: () =>
    getData<ApiMacroEconomyItem[]>("market-data/macro/economy/exchange_rate", {
      period: "day",
      start_year: String(new Date().getFullYear()),
    }),

  /** GET market-data/sheets/vnd (interbank rates) */
  getSheetsVND: () => getData<SheetRateRow[]>("market-data/sheets/vnd"),

  /** GET market-data/sheets/tpcp (government bond yields) */
  getSheetsTpcp: () => getData<SheetRateRow[]>("market-data/sheets/tpcp"),

  /** GET market-data/sheets/tygia (FX rates) */
  getSheetsTygia: () => getData<SheetFXRow[]>("market-data/sheets/tygia"),
}
