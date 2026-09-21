export type DecimalValue = string | number

export type BotRunStatus = "idle" | "running" | "succeeded" | "failed"
export type BotJournalAction = "buy" | "sell" | "hold" | "skip" | "issue"
export type BotJournalKind = "execution" | "decision" | "issue"

export interface BotIssue {
  code: string
  symbol: string | null
  detail: string | null
}

export interface BotStrategySummary {
  strategyId: "iqx_standard" | string
  strategyVersion: number
  executionModel: "same_session_close" | string
  initialCashVnd: DecimalValue
  activatedAt: string | null
}

export interface BotAccountSummary {
  cashVnd: DecimalValue | null
  marketValueVnd: DecimalValue | null
  navVnd: DecimalValue | null
  pnlTotalNetVnd: DecimalValue | null
  returnTotal: DecimalValue | null
  valuationComplete: boolean
  asOf: string | null
}

export interface BotRunSummary {
  status: BotRunStatus
  latestRunId: string | null
  lastUpdatedAt: string | null
  processedUnseenSessions: number
  issues: BotIssue[]
}

export interface BotOverview {
  eligible: boolean
  currentLevel: number
  cap6GraduatedAt: string | null
  disclosure: string
  bot: BotStrategySummary | null
  account: BotAccountSummary | null
  botRun: BotRunSummary
}

export interface BotPosition {
  id: string
  symbol: string
  sectorName: string | null
  qtyOpen: number
  entryPriceVnd: DecimalValue
  closePriceVnd: DecimalValue | null
  marketValueVnd: DecimalValue | null
  weight: DecimalValue | null
  stopLossVnd: DecimalValue
  takeProfitVnd: DecimalValue
  amplitudeAtEntryVnd: DecimalValue
  pnlVnd: DecimalValue | null
  pnlPct: DecimalValue | null
  filterIds: string[]
  openedSession: string
  amplitudeSourceRef: string | null
  closeSourceRef: string | null
  valuationComplete: boolean
}

export interface BotJournalEntry {
  id: string
  runId: string | null
  kind: BotJournalKind
  action: BotJournalAction
  symbol: string | null
  tradingDate: string
  executedAt: string | null
  qty: number | null
  priceVnd: DecimalValue | null
  thresholdVnd: DecimalValue | null
  grossValueVnd: DecimalValue | null
  feeVnd: DecimalValue | null
  taxVnd: DecimalValue | null
  supportingCount: number | null
  filterIds: string[]
  reasonCode: string | null
  reason: string | null
  issue: BotIssue | null
}

export interface BotJournalPage {
  items: BotJournalEntry[]
  nextCursor: string | null
  issues: BotIssue[]
}

export interface BotPerformancePoint {
  tradingDate: string
  navVnd: DecimalValue | null
  botReturn: DecimalValue | null
  vnindexReturn: DecimalValue | null
}

export interface BotPerformance {
  baseDate: string | null
  navBaseVnd: DecimalValue | null
  vnindexBase: DecimalValue | null
  comparisonAvailable: boolean
  valuationComplete: boolean
  points: BotPerformancePoint[]
}
