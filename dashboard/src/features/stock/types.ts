/**
 * Types for the stock detail feature (`/co-phieu/:symbol`).
 * Adapted from `dashboard-bak/src/components/stock/*`. UI stays camelCase;
 * adapters in `api.ts` fold the backend's mixed snake/camel payloads.
 */

/* ── Overview ─────────────────────────────────────────────────────────────── */

/** Company profile + enriched 1Y/foreign trading fields (camelCase). */
export interface CompanyProfile {
  organName: string
  organShortName: string
  companyProfile: string
  exchange: string
  icbName2: string
  icbName3: string
  icbName4: string
  issueShare: number | null
  highestPrice1Year: number
  lowestPrice1Year: number
  foreignCurrentRoom: number | null
  foreignCurrentPercent: number | null
  averageMatchVolume2Week: number | null
}

/** Latest financial ratio snapshot used in the overview valuation/profit blocks. */
export interface FinancialRatioSnapshot {
  yearReport: number | null
  revenue: number | null
  revenueGrowth: number | null
  netProfit: number | null
  netProfitGrowth: number | null
  roe: number | null
  roa: number | null
  pe: number | null
  pb: number | null
  eps: number | null
  bvps: number | null
  currentRatio: number | null
  grossMargin: number | null
  netProfitMargin: number | null
  de: number | null
  dividend: number | null
  marketCap: number | null
}

export interface Shareholder {
  ownerFullName: string
  percentage: number | null
  quantity: number | null
}

export interface Manager {
  fullName: string
  positionName: string
  percentage: number | null
}

export interface StockOverviewData {
  profile: CompanyProfile
  ratio: FinancialRatioSnapshot | null
  shareholders: Shareholder[]
  managers: Manager[]
}

/* ── Financial statements (KBS spreadsheet) ───────────────────────────────── */

export type FinReportType = "income_statement" | "balance_sheet" | "cash_flow"

export interface KbsHead {
  TermCode: string
  YearPeriod: number
  TermName: string
}

export interface KbsRow {
  Name: string
  NameEn?: string
  Levels?: number
  CssStyle?: string
  ChildTotal?: number
  ReportNormID?: number
  ParentReportNormID?: number
  [key: string]: unknown
}

export interface FinReport {
  heads: KbsHead[]
  /** Section name → rows (kept as-is; UI flattens). */
  sections: Record<string, KbsRow[]>
}

/** A single ratio row (loosely typed: backend mixes snake/camel keys). */
export type RatioRow = Record<string, number | null | undefined>

/* ── BCTC forensic analysis ───────────────────────────────────────────────── */

export type BctcStatus = "green" | "amber" | "red" | "na"

export interface BctcSnapshotCell {
  key: string
  label: string
  unit: string
  value: number | null
  status: BctcStatus
}

/** One ratio row in a multi-period common-size table (values align to columns). */
export interface CommonSizeTableRow {
  key: string
  label: string
  emphasis: boolean
  unit: string
  values: (number | null)[]
}

/** Self-describing multi-period table (Module 2 Common-Size KQKD). */
export interface CommonSizeTable {
  columns: string[]
  rows: CommonSizeTableRow[]
}

export interface BctcModuleBlock {
  id: string
  title: string
  type: string
  /** `ratios`/`bridge` → flat key→value; `common_size_table` → CommonSizeTable. */
  data: Record<string, number | null> | CommonSizeTable
}

export interface BctcValuation {
  pe_band?: { bear: number; base: number; bull: number } | null
  rim?: number | null
  book_floor?: number | null
  justified_pb?: number | null
  fair_value?: number | null
  roe_sustainable?: number | null
  summary?: { bear: number | null; base: number | null; bull: number | null } | null
  nim_cor_matrix?: {
    rows: { nim: number | null; cells: { cor: number | null; justified_pb: number | null }[] }[]
  }
}

export interface BctcPayload {
  template: "A" | "B"
  sector: string
  periods: string[]
  snapshot: BctcSnapshotCell[]
  modules: BctcModuleBlock[]
  forensic: { green: string[]; red: string[] }
  flags: { level: string; code: string; message: string }[]
  trinity?: {
    altman_z: number | null
    piotroski_f?: { score: number | null }
    beneish_m: number | null
  }
  subsector?: { label: string; metrics: Record<string, number | null> } | null
  blind_spots?: string[]
  valuation?: BctcValuation | null
}

/** AI memo + per-module notes overlaid on the BCTC analysis. */
export interface BctcAi {
  memo: string
  modules: Record<string, string>
}

/* ── AI Insight (6-layer) ─────────────────────────────────────────────────── */

export interface InsightLayer {
  label: string
  output: Record<string, unknown> | string | null
  status?: string
  score?: number
}

export interface InsightRawInput {
  trend: {
    realtime: Record<string, unknown> | null
    ohlcv: Record<string, unknown>[]
    computed: {
      ma10: number
      ma20: number
      volMa10: number
      volMa20: number
      latestClose: number
    }
  }
  liquidity: {
    latest: Record<string, unknown> | null
    avg30: Record<string, unknown> | null
    history: Record<string, unknown>[]
  }
  moneyFlow: { foreign: Record<string, unknown>[]; proprietary: Record<string, unknown>[] }
  insider: { transactions: Record<string, unknown>[] }
  news: { items: Record<string, unknown>[]; tickerScore: Record<string, unknown> | null }
}

export interface InsightResponse {
  symbol: string
  timestamp: string
  layers: Record<string, InsightLayer>
  rawInput: InsightRawInput
  dataSummary: Record<string, unknown>
  summary?: {
    trend: string
    state: string
    action: string
    confidence: number
    reversalProbability: number
    totalPower?: number
  }
}
