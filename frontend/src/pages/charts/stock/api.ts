/**
 * Stock detail data layer — every call hits a real backend route:
 *
 * - `GET  /market-data/company/{symbol}/overview|shareholders|officers`
 * - `GET  /market-data/fundamentals/{symbol}/ratio` (`?period=Q|Y`)
 * - `GET  /market-data/fundamentals/{symbol}/{report_type}` (`?term_type&page_size`)
 * - `GET  /market-data/bctc/{symbol}` (`?term_type`) — forensic analysis
 * - `GET  /ai/bctc/{symbol}` (`?term_type`) — premium AI memo
 * - `POST /ai/insight/analyze` — premium 6-layer AI Insight v2
 *
 * Backend payloads mix snake_case and camelCase (and some sources change keys
 * between releases), so each adapter reads every documented spelling and leaves
 * a missing field `null` — the UI renders "—" instead of inventing a number.
 */
import { api } from "@/lib/api"

import type {
  AIInsightResponse,
  BctcAi,
  BctcPayload,
  CompanyProfile,
  FinReport,
  FinReportType,
  FinancialRatioSnapshot,
  Manager,
  RatioRow,
  Shareholder,
  StockOverviewData,
} from "./types"
import { normalizeAIInsightResponse } from "./insight/normalize-insight"

type Raw = Record<string, unknown>

/** Unwrap the `{ data, meta }` envelope, tolerating already-unwrapped payloads. */
function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data?: unknown }).data
  }
  return payload
}

function num(raw: Raw, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value)
    }
  }
  return null
}

function str(raw: Raw, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key]
    if (value != null && value !== "") return String(value)
  }
  return ""
}

/** Pull a value array out of the assorted shapes the ratio endpoint returns. */
function asRatioArray(payload: unknown): RatioRow[] {
  if (Array.isArray(payload)) return payload as RatioRow[]
  if (payload && typeof payload === "object") {
    const rows = (payload as Raw).ratio
    if (Array.isArray(rows)) return rows as RatioRow[]
  }
  return []
}

function adaptProfile(raw: Raw): CompanyProfile {
  return {
    organName: str(raw, "organ_name", "organName"),
    organShortName: str(raw, "organ_short_name", "organShortName"),
    companyProfile: str(raw, "company_profile", "companyProfile"),
    exchange: str(raw, "exchange"),
    icbName2: str(raw, "icb_name_2", "icbName2"),
    icbName3: str(raw, "icb_name_3", "icbName3"),
    icbName4: str(raw, "icb_name_4", "icbName4"),
    issueShare: num(raw, "issue_share", "issueShare", "outstanding_shares"),
    highestPrice1Year: num(raw, "highest_price_1y", "highestPrice1Year") ?? 0,
    lowestPrice1Year: num(raw, "lowest_price_1y", "lowestPrice1Year") ?? 0,
    foreignCurrentRoom: num(raw, "foreign_current_room", "foreignCurrentRoom"),
    foreignCurrentPercent: num(raw, "foreign_current_percent", "foreignCurrentPercent"),
    averageMatchVolume2Week: num(
      raw,
      "average_match_volume_2_week",
      "averageMatchVolume2Week",
    ),
  }
}

function adaptRatioSnapshot(raw: Raw): FinancialRatioSnapshot {
  return {
    yearReport: num(raw, "year_report", "yearReport"),
    revenue: num(raw, "revenue", "totalOperatingIncome", "total_operating_income"),
    revenueGrowth: num(raw, "revenue_growth", "revenueGrowth"),
    netProfit: num(
      raw,
      "net_profit",
      "netProfit",
      "profitAfterTax",
      "profit_after_tax",
      "net_profit_after_tax",
    ),
    netProfitGrowth: num(raw, "net_profit_growth", "netProfitGrowth"),
    roe: num(raw, "roe"),
    roa: num(raw, "roa"),
    pe: num(raw, "pe"),
    pb: num(raw, "pb"),
    eps: num(raw, "eps"),
    bvps: num(raw, "bvps"),
    currentRatio: num(raw, "current_ratio", "currentRatio"),
    grossMargin: num(raw, "gross_margin", "grossMargin"),
    netProfitMargin: num(
      raw,
      "net_profit_margin",
      "netProfitMargin",
      "afterTaxProfitMargin",
      "after_tax_profit_margin",
    ),
    de: num(raw, "debt_to_equity", "de", "debtToEquity"),
    dividend: num(raw, "dividend", "dividend_yield"),
    marketCap: num(raw, "market_cap", "marketCap"),
  }
}

function adaptShareholder(raw: Raw): Shareholder {
  return {
    ownerFullName: str(raw, "owner_full_name", "ownerFullName", "name"),
    percentage: num(raw, "ownership_percentage", "percentage", "ownership_pct"),
    quantity: num(raw, "shares_owned", "quantity", "no_of_shares"),
  }
}

function adaptManager(raw: Raw): Manager {
  return {
    fullName: str(raw, "full_name", "fullName", "name"),
    positionName: str(raw, "position_name", "positionName", "position"),
    percentage: num(raw, "percentage", "ownership_pct"),
  }
}

export const stockApi = {
  /**
   * Composite overview: company profile (server-side enriched with VCI/KBS
   * details + 1Y trading), latest quarterly ratio, shareholders, officers.
   * Each leg degrades to `null`/`[]` on its own — one upstream outage must not
   * blank the whole tab.
   */
  getOverview: async (symbol: string): Promise<StockOverviewData> => {
    const code = symbol.toUpperCase()
    const [overviewRes, ratioRes, shareholderRes, managerRes] = await Promise.all([
      api<unknown>(`/market-data/company/${code}/overview`).catch(() => null),
      api<unknown>(`/market-data/fundamentals/${code}/ratio?period=Q`).catch(() => null),
      api<unknown>(`/market-data/company/${code}/shareholders`).catch(() => null),
      api<unknown>(`/market-data/company/${code}/officers`).catch(() => null),
    ])

    const profileRaw = (unwrap(overviewRes) ?? {}) as Raw
    const ratioRows = asRatioArray(unwrap(ratioRes))
    const shareholders = unwrap(shareholderRes)
    const managers = unwrap(managerRes)

    return {
      profile: adaptProfile(profileRaw),
      ratio: ratioRows[0] ? adaptRatioSnapshot(ratioRows[0] as Raw) : null,
      shareholders: Array.isArray(shareholders)
        ? (shareholders as Raw[]).map(adaptShareholder)
        : [],
      managers: Array.isArray(managers) ? (managers as Raw[]).map(adaptManager) : [],
    }
  },

  /** KBS spreadsheet report (income/balance/cash-flow) for `periodCount` periods. */
  getReport: async (
    symbol: string,
    type: FinReportType,
    termType: number,
    periodCount: number,
    signal?: AbortSignal,
  ): Promise<FinReport | null> => {
    const payload = await api<unknown>(
      `/market-data/fundamentals/${symbol.toUpperCase()}/${type}?term_type=${termType}&page_size=${periodCount}`,
      { signal },
    )
    const data = unwrap(payload) as Raw | null
    if (data && data.Head && data.Content) {
      return {
        heads: data.Head as FinReport["heads"],
        sections: data.Content as FinReport["sections"],
      }
    }
    return null
  },

  /** Raw ratio rows (newest → oldest) for the ratio charts + table. */
  getRatios: async (
    symbol: string,
    period: "Q" | "Y",
    signal?: AbortSignal,
  ): Promise<RatioRow[]> => {
    const payload = await api<unknown>(
      `/market-data/fundamentals/${symbol.toUpperCase()}/ratio?period=${period}`,
      { signal },
    )
    return asRatioArray(unwrap(payload))
  },

  /** Forensic BCTC analysis (snapshot, modules, trinity, valuation). */
  getBctc: async (symbol: string, termType = 1, signal?: AbortSignal): Promise<BctcPayload> => {
    const payload = await api<unknown>(
      `/market-data/bctc/${symbol.toUpperCase()}?term_type=${termType}`,
      { signal },
    )
    return unwrap(payload) as BctcPayload
  },

  /** Premium: AI memo + per-module notes for the BCTC analysis. */
  getBctcAi: async (symbol: string, termType = 1, signal?: AbortSignal): Promise<BctcAi | null> => {
    const payload = await api<{ data?: { analysis?: BctcAi }; analysis?: BctcAi }>(
      `/ai/bctc/${symbol.toUpperCase()}?term_type=${termType}`,
      { signal },
    )
    return payload?.data?.analysis ?? payload?.analysis ?? null
  },

  /**
   * Premium: 6-layer AI Insight v2. `include_payload` makes the response carry
   * the raw inputs, which is what the L1–L5 detail charts render.
   */
  analyzeInsight: async (symbol: string, signal?: AbortSignal): Promise<AIInsightResponse> => {
    const payload = await api<unknown>(
      "/ai/insight/analyze",
      {
        method: "POST",
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          language: "vi",
          include_payload: true,
        }),
        signal,
      },
    )
    return normalizeAIInsightResponse(payload)
  },
}
