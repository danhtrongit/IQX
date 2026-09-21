import { api, unwrap, type MarketDataResponse } from "@/shared/http/client"
import type {
  BotAccountSummary,
  BotIssue,
  BotJournalAction,
  BotJournalEntry,
  BotJournalKind,
  BotJournalPage,
  BotOverview,
  BotPerformance,
  BotPerformancePoint,
  BotPosition,
  BotRunStatus,
  BotStrategySummary,
  DecimalValue,
} from "./types"

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function decimal(value: unknown): DecimalValue | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return value
  return null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function parseIssue(value: unknown): BotIssue | null {
  const raw = record(value)
  const code = text(raw?.code)
  if (!raw || !code) return null
  return { code, symbol: text(raw.symbol), detail: text(raw.detail) }
}

function requiredText(value: unknown, field: string): string {
  const parsed = text(value)
  if (!parsed) throw new Error(`Bot API thiếu trường ${field}`)
  return parsed
}

function requiredDecimal(value: unknown, field: string): DecimalValue {
  const parsed = decimal(value)
  if (parsed === null) throw new Error(`Bot API thiếu trường số ${field}`)
  return parsed
}

function parseStrategy(value: unknown): BotStrategySummary | null {
  const raw = record(value)
  if (!raw) return null
  return {
    strategyId: requiredText(raw.strategy_id, "bot.strategy_id"),
    strategyVersion: number(raw.strategy_version) ?? 0,
    executionModel: requiredText(raw.execution_model, "bot.execution_model"),
    initialCashVnd: requiredDecimal(raw.initial_cash_vnd, "bot.initial_cash_vnd"),
    activatedAt: text(raw.activated_at),
  }
}

function parseAccount(value: unknown): BotAccountSummary | null {
  const raw = record(value)
  if (!raw) return null
  return {
    cashVnd: decimal(raw.cash_vnd),
    marketValueVnd: decimal(raw.market_value_vnd),
    navVnd: decimal(raw.nav_vnd),
    pnlTotalNetVnd: decimal(raw.pnl_total_net_vnd ?? raw.pnl_total_net),
    returnTotal: decimal(raw.return_total),
    valuationComplete: boolean(raw.valuation_complete),
    asOf: text(raw.as_of ?? raw.as_of_session ?? raw.trading_date),
  }
}

const RUN_STATUSES = new Set<BotRunStatus>(["idle", "running", "succeeded", "failed"])

function parseRun(value: unknown): BotOverview["botRun"] {
  const raw = record(value)
  const status = text(raw?.status) as BotRunStatus | null
  if (!raw || !status || !RUN_STATUSES.has(status)) {
    throw new Error("Bot API thiếu trạng thái vận hành hợp lệ")
  }
  return {
    status,
    latestRunId: text(raw.latest_run_id),
    lastUpdatedAt: text(raw.last_updated_at),
    processedUnseenSessions: number(raw.processed_unseen_sessions) ?? 0,
    issues: Array.isArray(raw.issues)
      ? raw.issues.map(parseIssue).filter((issue): issue is BotIssue => issue !== null)
      : [],
  }
}

export function adaptBotOverview(payload: unknown): BotOverview {
  const raw = record(unwrap(payload as MarketDataResponse<unknown>))
  if (!raw) throw new Error("Bot API trả về dữ liệu không hợp lệ")
  const level = number(raw.current_level)
  if (level === null) throw new Error("Bot API thiếu cấp hành trình hiện tại")
  return {
    eligible: boolean(raw.eligible),
    currentLevel: level,
    cap6GraduatedAt: text(raw.cap6_graduated_at),
    disclosure: requiredText(raw.disclosure, "disclosure"),
    bot: parseStrategy(raw.bot),
    account: parseAccount(raw.account ?? raw.bot_account),
    botRun: parseRun(raw.bot_run),
  }
}

function adaptPosition(value: unknown): BotPosition {
  const raw = record(value)
  if (!raw) throw new Error("Bot API có vị thế không hợp lệ")
  const symbol = requiredText(raw.symbol, "positions.symbol").toUpperCase()
  const qty = number(raw.qty_open ?? raw.qty ?? raw.quantity)
  if (qty === null) throw new Error(`Bot API thiếu khối lượng của ${symbol}`)
  return {
    id: text(raw.id) ?? `${symbol}-${requiredText(raw.opened_session, "positions.opened_session")}`,
    symbol,
    sectorName: text(raw.sector_name ?? raw.sector),
    qtyOpen: qty,
    entryPriceVnd: requiredDecimal(raw.entry_price_vnd, "positions.entry_price_vnd"),
    closePriceVnd: decimal(raw.close_price_vnd ?? raw.current_close_vnd),
    marketValueVnd: decimal(raw.market_value_vnd),
    weight: decimal(raw.weight ?? raw.weight_pct),
    stopLossVnd: requiredDecimal(raw.stop_loss_vnd, "positions.stop_loss_vnd"),
    takeProfitVnd: requiredDecimal(raw.take_profit_vnd, "positions.take_profit_vnd"),
    amplitudeAtEntryVnd: requiredDecimal(
      raw.amplitude_at_entry_vnd,
      "positions.amplitude_at_entry_vnd",
    ),
    pnlVnd: decimal(raw.pnl_vnd ?? raw.unrealized_pnl_net_vnd ?? raw.unrealized_pnl_vnd),
    pnlPct: decimal(raw.pnl_pct ?? raw.unrealized_pnl_pct),
    filterIds: stringArray(raw.filter_ids),
    openedSession: requiredText(raw.opened_session, "positions.opened_session"),
    amplitudeSourceRef: text(raw.amplitude_source_ref),
    closeSourceRef: text(raw.close_source_ref),
    valuationComplete: boolean(raw.valuation_complete, decimal(raw.close_price_vnd) !== null),
  }
}

export function adaptBotPositions(payload: unknown): BotPosition[] {
  const unwrapped = unwrap(payload as MarketDataResponse<unknown>)
  const raw = record(unwrapped)
  const items = Array.isArray(unwrapped) ? unwrapped : raw?.items ?? raw?.positions
  if (!Array.isArray(items)) throw new Error("Bot API trả về danh mục không hợp lệ")
  return items.map((item) => {
    const position = adaptPosition(item)
    if (!Array.isArray(unwrapped)) {
      const itemRaw = record(item)
      if (typeof itemRaw?.valuation_complete !== "boolean") {
        position.valuationComplete = boolean(raw?.valuation_complete)
      }
    }
    return position
  })
}

const JOURNAL_ACTIONS = new Set<BotJournalAction>(["buy", "sell", "hold", "skip", "issue"])
const JOURNAL_KINDS = new Set<BotJournalKind>(["execution", "decision", "issue"])

function adaptJournalEntry(value: unknown): BotJournalEntry {
  const raw = record(value)
  if (!raw) throw new Error("Bot API có dòng nhật ký không hợp lệ")
  const execution = record(raw.execution)
  const rawKind = text(raw.kind ?? raw.entry_type) ?? (execution ? "execution" : null)
  const rawAction = text(raw.action ?? raw.side)
  const kind: BotJournalKind = rawKind && JOURNAL_KINDS.has(rawKind as BotJournalKind)
    ? (rawKind as BotJournalKind)
    : rawAction === "issue"
      ? "issue"
      : rawAction === "buy" || rawAction === "sell"
        ? "execution"
        : "decision"
  const action = rawAction as BotJournalAction | null
  if (!action || !JOURNAL_ACTIONS.has(action)) throw new Error("Bot API có hành động nhật ký không hợp lệ")
  const issue = parseIssue(raw.issue)
  return {
    id: requiredText(raw.id, "journal.id"),
    runId: text(raw.run_id),
    kind,
    action,
    symbol: text(raw.symbol)?.toUpperCase() ?? null,
    tradingDate: requiredText(raw.trading_date ?? raw.signal_session, "journal.trading_date"),
    executedAt: text(raw.executed_at ?? raw.created_at),
    qty: number(raw.qty ?? execution?.qty),
    priceVnd: decimal(raw.price_vnd ?? execution?.price_vnd),
    thresholdVnd: decimal(raw.threshold_vnd),
    grossValueVnd: decimal(raw.gross_value_vnd ?? execution?.gross_value_vnd),
    feeVnd: decimal(raw.fee_vnd ?? execution?.fee_vnd),
    taxVnd: decimal(raw.tax_vnd ?? execution?.tax_vnd),
    supportingCount: number(raw.supporting_count),
    filterIds: stringArray(raw.filter_ids),
    reasonCode: text(raw.reason_code ?? issue?.code),
    reason: text(raw.reason ?? issue?.detail),
    issue,
  }
}

export function adaptBotJournal(payload: unknown): BotJournalPage {
  const unwrapped = unwrap(payload as MarketDataResponse<unknown>)
  const raw = record(unwrapped)
  const items = Array.isArray(unwrapped) ? unwrapped : raw?.items ?? raw?.journal
  if (!Array.isArray(items)) throw new Error("Bot API trả về nhật ký không hợp lệ")
  return {
    items: items.map(adaptJournalEntry),
    nextCursor: text(raw?.next_cursor),
    issues: Array.isArray(raw?.issues)
      ? raw.issues.map(parseIssue).filter((issue): issue is BotIssue => issue !== null)
      : [],
  }
}

function adaptPerformancePoint(value: unknown): BotPerformancePoint {
  const raw = record(value)
  if (!raw) throw new Error("Bot API có điểm hiệu suất không hợp lệ")
  return {
    tradingDate: requiredText(raw.trading_date ?? raw.date, "performance.trading_date"),
    navVnd: decimal(raw.nav_vnd),
    botReturn: decimal(raw.bot_return ?? raw.bot_return_since_base),
    vnindexReturn: decimal(raw.vnindex_return ?? raw.index_return_since_base),
  }
}

export function adaptBotPerformance(payload: unknown): BotPerformance {
  const unwrapped = unwrap(payload as MarketDataResponse<unknown>)
  const raw = record(unwrapped)
  if (!raw) throw new Error("Bot API trả về hiệu suất không hợp lệ")
  const points = raw.points ?? raw.series
  if (!Array.isArray(points)) throw new Error("Bot API thiếu chuỗi hiệu suất")
  const base = record(raw.base ?? raw.bot_base)
  const adaptedPoints = points.map(adaptPerformancePoint)
  return {
    baseDate: text(raw.base_date ?? base?.trading_date),
    navBaseVnd: decimal(raw.nav_base_vnd ?? base?.bot_nav_vnd),
    vnindexBase: decimal(raw.vnindex_base ?? base?.vnindex_value),
    comparisonAvailable: boolean(raw.comparison_available),
    valuationComplete: boolean(
      raw.valuation_complete,
      points.every((point) => boolean(record(point)?.valuation_complete)),
    ),
    points: adaptedPoints,
  }
}

export const botApi = {
  getOverview: async (): Promise<BotOverview> =>
    adaptBotOverview(await api.get("bot").json<unknown>()),

  getPositions: async (): Promise<BotPosition[]> =>
    adaptBotPositions(await api.get("bot/positions").json<unknown>()),

  getJournal: async (cursor?: string): Promise<BotJournalPage> =>
    adaptBotJournal(
      await api.get("bot/journal", { searchParams: cursor ? { cursor } : undefined }).json<unknown>(),
    ),

  getPerformance: async (from?: string, to?: string): Promise<BotPerformance> => {
    const searchParams: Record<string, string> = {}
    if (from) searchParams.from = from
    if (to) searchParams.to = to
    return adaptBotPerformance(
      await api.get("bot/performance", {
        searchParams: Object.keys(searchParams).length ? searchParams : undefined,
      }).json<unknown>(),
    )
  },
}
