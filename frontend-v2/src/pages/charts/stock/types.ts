/**
 * Wire types for the stock detail page (`/co-phieu/:symbol`).
 *
 * UI-facing shapes stay camelCase: the adapters in `api.ts` fold the backend's
 * mixed snake/camel payloads, so components never guess at key spellings.
 */

/* ── Overview ─────────────────────────────────────────────────────────────── */

/** Company profile + enriched 1Y/foreign trading fields (camelCase). */
export type CompanyProfile = {
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
export type FinancialRatioSnapshot = {
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

export type Shareholder = {
  ownerFullName: string
  percentage: number | null
  quantity: number | null
}

export type Manager = {
  fullName: string
  positionName: string
  percentage: number | null
}

export type StockOverviewData = {
  profile: CompanyProfile
  ratio: FinancialRatioSnapshot | null
  shareholders: Shareholder[]
  managers: Manager[]
}

/* ── Financial statements (KBS spreadsheet) ───────────────────────────────── */

export type FinReportType = "income_statement" | "balance_sheet" | "cash_flow"

export type KbsHead = {
  TermCode: string
  YearPeriod: number
  TermName: string
}

export type KbsRow = {
  Name: string
  NameEn?: string
  Levels?: number
  CssStyle?: string
  ChildTotal?: number
  ReportNormID?: number
  ParentReportNormID?: number
} & Record<string, unknown>

export type FinReport = {
  heads: KbsHead[]
  /** Section name → rows (kept as-is; the UI flattens). */
  sections: Record<string, KbsRow[]>
}

/** A single ratio row (loosely typed: the backend mixes snake/camel keys). */
export type RatioRow = Record<string, number | null | undefined>

/* ── BCTC forensic analysis ───────────────────────────────────────────────── */

export type BctcStatus = "green" | "amber" | "red" | "na"

export type BctcSnapshotCell = {
  key: string
  label: string
  unit: string
  value: number | null
  status: BctcStatus
}

/** One ratio row in a multi-period common-size table (values align to columns). */
export type CommonSizeTableRow = {
  key: string
  label: string
  emphasis: boolean
  unit: string
  values: (number | null)[]
}

/** Self-describing multi-period table (Module 2 Common-Size KQKD). */
export type CommonSizeTable = {
  columns: string[]
  rows: CommonSizeTableRow[]
}

/** One DuPont driver with its prior value, delta and contribution to ΔROE. */
export type DuPontDriver = {
  key: string
  label: string
  abbr: string
  /** `"x"` (hệ số) hoặc `"%"` (biên). */
  unit: string
  value: number | null
  prev: number | null
  delta: number | null
  /** Đóng góp (pp) vào thay đổi ROE; null khi không đủ dữ liệu. */
  contribution: number | null
}

/** DuPont 5-step decomposition (module `dupont`). */
export type DuPontData = {
  roe: number | null
  roe_prev: number | null
  roe_delta: number | null
  drivers: DuPontDriver[]
}

/** Multi-period working-capital-cycle row. */
export type WccRow = {
  key: string
  label: string
  values: (number | null)[]
}

/** Working-capital-cycle series (module `wcc`). */
export type WccSeries = {
  columns: string[]
  rows: WccRow[]
  latest: { dso: number | null; dio: number | null; dpo: number | null; ccc: number | null }
}

/** One line of the cash-flow waterfall. */
export type CfBridgeLine = {
  key: string
  label: string
  value: number | null
  kind: "base" | "add" | "sub" | "subtotal" | "total"
}

/** Cash-flow bridge (module `cf_bridge`). */
export type CfBridge = {
  lines: CfBridgeLine[]
  cfo_ni: number | null
  fcf_margin: number | null
  sloan_accrual: number | null
}

export type BctcModuleBlock = {
  id: string
  title: string
  type: string
  /**
   * Shape depends on `type`: `common_size_table` → CommonSizeTable; `dupont`
   * → DuPontData; `wcc` → WccSeries; `cf_bridge` → CfBridge; otherwise
   * (`ratios`/bank modules) a flat key→value record.
   */
  data: Record<string, number | null> | CommonSizeTable | DuPontData | WccSeries | CfBridge
}

export type BctcValuation = {
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

export type BctcPayload = {
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
export type BctcAi = {
  memo: string
  modules: Record<string, string>
}

/* ── AI Insight (6-layer) ─────────────────────────────────────────────────── */

export type InsightLayer = {
  label: string
  output: Record<string, unknown> | string | null
  status?: string
  score?: number
}

export type InsightRawInput = {
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

export type InsightResponse = {
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

/* ── AI Insight v2 (briefing data contract) ───────────────────────────────── */

/** Rich text fragment for narrative, diff, and observations. */
export type NarrativeFragment =
  | { type: "text"; content: string }
  | { type: "emphasis"; content: string; variant: "bull" | "bear" | "warn" | "info" }
  | { type: "number"; content: string }
  | { type: "highlight"; content: string }

/** Stock header with current price and metadata. */
export type StockHeader = {
  symbol: string
  sector: string
  indexGroup: string
  price: number
  changePercent: number
  high: number
  low: number
  volume: string
  isLive: boolean
}

/** L6 briefing card — the hero/main content. */
export type BriefingCard = {
  updatedAt: string
  trend: string
  status: string
  statusVariant: "bull" | "warn" | "bear" | "neutral"
  timeframe: string
  narrative: NarrativeFragment[]
  diff: { text: NarrativeFragment[]; hasChange: boolean; isFirstAnalysis: boolean }
  observations: {
    liquidity: NarrativeFragment[]
    moneyFlow: NarrativeFragment[]
    insider: NarrativeFragment[]
    news: NarrativeFragment[]
    supportResistance: NarrativeFragment[]
  }
  watchLevels: [
    { tag: string; description: string },
    { tag: string; description: string },
  ]
  recommendation:
    | "Chờ điểm mua"
    | "Có thể mua thử"
    | "Quan sát thêm"
    | "Nên giảm bớt"
    | "Bán bớt"
}

/** L1–L5 layer card (detail panel). */
export type LayerCard = {
  layerNum: "L1" | "L2" | "L3" | "L4" | "L5"
  layerName: string
  statusLabel: string
  statusLevel: 1 | 2 | 3 | 4 | 5
  fields: { label: string; value: NarrativeFragment[] }[]
  chart?: { title: string; data: Record<string, unknown> }
  diff: { text: NarrativeFragment[]; hasChange: boolean }
  /** Structured news — only present on L5. */
  news?: {
    material: { title: string; subtitle?: string; tag: string }[]
    filler: { title: string; tag: string }[]
  }
}

/** Complete v2 AI Insight response from the backend. */
export type AIInsightResponse = {
  symbol: string
  updatedAt: string
  header: StockHeader
  briefing: BriefingCard
  layers: { L1: LayerCard; L2: LayerCard; L3: LayerCard; L4: LayerCard; L5: LayerCard }
  rawInput: InsightRawInput
}
