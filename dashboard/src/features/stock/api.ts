import { api, unwrap } from "@/shared/http/client"
import type {
  BctcAi,
  BctcPayload,
  CompanyProfile,
  FinancialRatioSnapshot,
  FinReport,
  FinReportType,
  InsightResponse,
  Manager,
  RatioRow,
  Shareholder,
  StockOverviewData,
} from "./types"

/* ── helpers ──────────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>

function num(raw: Raw, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v)
  }
  return null
}

function str(raw: Raw, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== "") return String(v)
  }
  return ""
}

/** Pull a value array out of the assorted shapes the ratio endpoint returns. */
function asRatioArray(d: unknown): RatioRow[] {
  if (Array.isArray(d)) return d as RatioRow[]
  if (d && typeof d === "object" && Array.isArray((d as Raw).ratio)) {
    return (d as Raw).ratio as RatioRow[]
  }
  return []
}

/* ── adapters ─────────────────────────────────────────────────────────────── */

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
    averageMatchVolume2Week: num(raw, "average_match_volume_2_week", "averageMatchVolume2Week"),
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

/* ── API ──────────────────────────────────────────────────────────────────── */

export const stockApi = {
  /**
   * Composite overview: company profile (already enriched server-side with
   * VCI/KBS details + 1Y trading), latest quarterly ratio, shareholders,
   * officers. Mirrors the four parallel fetches in the bak StockOverview.
   */
  getOverview: async (symbol: string): Promise<StockOverviewData> => {
    const s = symbol.toUpperCase()
    const [overviewRes, ratioRes, shRes, mgRes] = await Promise.all([
      api.get(`market-data/company/${s}/overview`).json<unknown>().catch(() => null),
      api
        .get(`market-data/fundamentals/${s}/ratio`, { searchParams: { period: "Q" } })
        .json<unknown>()
        .catch(() => null),
      api.get(`market-data/company/${s}/shareholders`).json<unknown>().catch(() => null),
      api.get(`market-data/company/${s}/officers`).json<unknown>().catch(() => null),
    ])

    const profileRaw = (unwrap(overviewRes as never) ?? {}) as Raw
    const ratioArr = asRatioArray(unwrap(ratioRes as never))
    const shArr = unwrap(shRes as never)
    const mgArr = unwrap(mgRes as never)

    return {
      profile: adaptProfile(profileRaw),
      ratio: ratioArr[0] ? adaptRatioSnapshot(ratioArr[0] as Raw) : null,
      shareholders: Array.isArray(shArr) ? (shArr as Raw[]).map(adaptShareholder) : [],
      managers: Array.isArray(mgArr) ? (mgArr as Raw[]).map(adaptManager) : [],
    }
  },

  /** KBS spreadsheet report (income/balance/cashflow) for `periodCount` periods. */
  getReport: async (
    symbol: string,
    type: FinReportType,
    termType: number,
    periodCount: number,
  ): Promise<FinReport | null> => {
    const res = await api
      .get(`market-data/fundamentals/${symbol.toUpperCase()}/${type}`, {
        searchParams: { term_type: termType, page_size: periodCount },
      })
      .json<unknown>()
    const d = unwrap(res as never) as Raw | null
    if (d && d.Head && d.Content) {
      return { heads: d.Head as FinReport["heads"], sections: d.Content as FinReport["sections"] }
    }
    return null
  },

  /** Raw ratio rows (newest → oldest) for the ratios sub-tab charts + table. */
  getRatios: async (symbol: string, period: "Q" | "Y"): Promise<RatioRow[]> => {
    const res = await api
      .get(`market-data/fundamentals/${symbol.toUpperCase()}/ratio`, {
        searchParams: { period },
      })
      .json<unknown>()
    return asRatioArray(unwrap(res as never))
  },

  /** Forensic BCTC analysis (snapshot, modules, trinity, valuation). */
  getBctc: async (symbol: string, termType = 1): Promise<BctcPayload> => {
    const res = await api
      .get(`market-data/bctc/${symbol.toUpperCase()}`, { searchParams: { term_type: termType } })
      .json<unknown>()
    return unwrap(res as never) as BctcPayload
  },

  /** Premium: AI memo + per-module notes for the BCTC analysis. */
  getBctcAi: async (symbol: string, termType = 1): Promise<BctcAi | null> => {
    const res = await api
      .get(`ai/bctc/${symbol.toUpperCase()}`, { searchParams: { term_type: termType } })
      .json<{ data?: { analysis?: BctcAi }; analysis?: BctcAi }>()
    return res?.data?.analysis ?? res?.analysis ?? null
  },

  /**
   * Premium: 6-layer AI insight. Uses the POST endpoint (premium-gated) with
   * `include_payload` so the detail panels can render the raw-input charts.
   */
  analyzeInsight: async (symbol: string): Promise<InsightResponse> => {
    const res = await api
      .post("ai/insight/analyze", {
        json: { symbol: symbol.toUpperCase(), language: "vi", include_payload: true },
        timeout: 120_000,
      })
      .json<{ data?: InsightResponse } | InsightResponse>()
    return (unwrap(res as never) ?? res) as InsightResponse
  },
}
