/**
 * Chiến lược + Backtest theo rổ (update 22-11, spec Bot và Chiến lược v2.0 §4, §10.3).
 *
 * Hand-typed per PLAN §6; switch to generated types after contracts regen. The wire types (`Wire*` and the
 * request/response types used as is) mirror the zod schemas of
 * `backend/src/modules/strategies/strategies.schemas.ts`,
 * `backend/src/modules/strategy-backtests/strategy-backtests.schemas.ts` and
 * `backend/src/modules/iqx-templates/iqx-templates.schemas.ts`. The backtest calls map the wire run to the
 * view the tab renders (money as number VND, percent values in percentage points: 12.3 = 12,3%).
 * Paths are relative to `/api/v2`.
 */
import { api, ApiError } from "@/lib/api"
import type { IndicatorConfig } from "@/pages/demo-trading/bot/config/types"

/* ── Strategy content (§10.2, D14) ─────────────────────────────────────── */

export type BasketUniverse = { type: "vn30" | "vn100" }
/** Danh mục đã lưu: the symbols are COPIED into the version when it is saved (already filtered to VN100). */
export type SavedListUniverse = { type: "saved_list"; list_id: string; list_name: string; symbols: string[] }
export type Universe = BasketUniverse | SavedListUniverse
/** `list_id` of a basket that is not a saved list: the result of a Bộ lọc run (§13). */
export const FILTER_RESULT_LIST_ID = "bo-loc"

export type StrategyContent = {
  universe: Universe
  /** V3 per-indicator map: only the indicators with a side in use. */
  indicators: Record<string, IndicatorConfig>
  max_holding: number
  /** Only strategies converted from an old Bot config that had no Mua row (§11). */
  sell_only?: boolean
}

export type StrategySource = "iqx" | "user"
export type OnBot = { last: boolean; next: boolean }

/* ── Store and universes ───────────────────────────────────────────────── */

export type StoreMeta = {
  data_store: string
  data_as_of: string | null
  earliest_start: string | null
  price_unit: "VND"
  adjusted: boolean
  sessions: number
  /** Default range of the form: `Đến ngày` = data_as_of, `Từ ngày` 2 years back (bounded). */
  default_start: string | null
  default_end: string | null
  max_range_days: number
}

export type SavedListOption = { id: string; name: string; symbols_total: number; symbols_kept: string[]; excluded: string[] }
export type UniverseOptions = { vn30: { symbols: string[] }; vn100: { symbols: string[] }; saved_lists: SavedListOption[] }

/* ── User strategies (§6.1) ────────────────────────────────────────────── */

export type StrategyItem = {
  id: string
  name: string
  latest_version: number
  latest_saved_at: string
  universe_label: string
  universe_count: number | null
  sell_only: boolean
  on_bot: OnBot
}
export type StrategyList = { items: StrategyItem[]; limit: number }

export type VersionItem = {
  version: number
  created_at: string
  /** `bản dd/mm HH:mm` (giờ Việt Nam). */
  version_label: string
  note: string | null
  universe_label: string
  max_holding: number
  from_run_id: string | null
  on_bot: OnBot
}
export type VersionList = { strategy_id: string; name: string; latest_version: number; items: VersionItem[] }
export type VersionDetail = {
  strategy_id: string
  name: string
  version: number
  version_label: string
  content: StrategyContent
  config_hash: string
  created_at: string
  note: string | null
  from_run_id: string | null
}
export type StrategyView = { id: string; name: string; latest_version: number; sell_only: boolean; created_at: string; updated_at: string }

/** Apply to the Bot's next session in the same request (§4.4.2, §6.5). */
export type ApplyNext = { apply_next?: boolean; expected_next_session?: string; confirm_due_positions?: string[] }

/** POST /strategies, POST …/versions, POST …/restore; `schedule` is the Bot's answer when applied. */
export type SaveResult = { strategy: StrategyView; version: VersionDetail; schedule: unknown }

/* ── IQX (user list) ───────────────────────────────────────────────────── */

export type IqxVersionItem = { version: number; published_at: string; reason: string; current: boolean }
export type IqxVersionList = { id: string; slug: string; name: string; current_version: number; hidden: boolean; on_bot: OnBot; items: IqxVersionItem[] }
export type IqxVersionDetail = {
  id: string
  slug: string
  version: number
  current_version: number
  hidden: boolean
  published_at: string
  reason: string
  /** As published (v1 rows have no `definition.universe`). */
  content: Record<string, unknown>
  /** Content as the rules run it (v1 rows without a basket read as VN30). */
  strategy_content: { universe: BasketUniverse; indicators: Record<string, IndicatorConfig>; max_holding: number }
}

/* ── Backtests: request ────────────────────────────────────────────────── */

export type StrategyRef = { source: "iqx"; id: string; version?: number } | { source: "user"; id: string; version?: number }
export type RunStrategy = StrategyRef | { source: "draft"; content: StrategyContent; base?: { id: string; version: number } | null }
/** `trial`: Quản trị › Mẫu IQX "Chạy để thử" (§7.2), draft only, the run is not stored. */
export type RunRequest = { idempotency_key: string; strategy: RunStrategy; start: string; end: string; trial?: boolean }

/* ── Backtests: view ───────────────────────────────────────────────────── */

export type RunWarning = { code: string; message: string; symbols?: string[] }

export type RunSnapshot = {
  strategy_ref: { source: StrategySource | "draft"; id: string | null; version: number | null }
  universe_label: string
  content: StrategyContent
  config_hash: string
  universe_resolved: string[]
  excluded_symbols: string[]
  data_store: string
  data_as_of: string
  price_unit: string
  adjusted: boolean
  rules_version: string
  fee_rules?: { buy_fee_bps: number; sell_fee_bps: number; sell_tax_bps: number; lot_size: number }
  warnings: RunWarning[]
  start: string
  end: string
  sessions: number
  capital: number
}

export type RunKpis = {
  total_return: number
  annualized_return: number | null
  max_drawdown: number
  closed_trades: number
  win_rate: number | null
  basket_buy_hold: number | null
  vnindex: number | null
}

export type CurvePoint = { date: string; strategy: number; basket: number | null; vnindex: number | null }

export type PerSymbol = { symbol: string; closed_trades: number; wins: number; realized_pnl: number; unrealized_pnl: number | null; contribution_pct: number }

export type OpenPosition = {
  symbol: string
  entry_date: string
  entry_price: number
  quantity: number
  last_price: number
  /** Sessions that count toward Giữ tối đa. */
  held_sessions: number
  max_holding: number
  unrealized_pnl: number
  unrealized_pct: number
}

export type SkipCode = "session_buy_limit" | "insufficient_cash" | "budget_below_lot" | "symbol_cap"
export type SkippedOrder = { date: string; symbol: string; code?: SkipCode; reason: string }

export type ExitReason = "indicator" | "max_holding"

export type ClosedTrade = {
  symbol: string
  entry_date: string
  entry_price: number
  quantity: number
  exit_date: string
  exit_price: number
  holding_sessions: number
  exit_reason: ExitReason
  exit_reasons: ExitReason[]
  max_holding_at_exit: number
  pnl: number
  pnl_pct: number
}

export type RunView = {
  run_id: string
  status: "succeeded" | "failed"
  created_at: string
  legacy?: boolean
  trial?: boolean
  strategy_label?: string | null
  version_label?: string | null
  /** `Kết quả · {label}` (§4.7). */
  result_label?: string | null
  error?: { code?: string; message: string } | null
  snapshot: RunSnapshot
  kpis: RunKpis
  curve: CurvePoint[]
  per_symbol: PerSymbol[]
  open_positions: OpenPosition[]
  final_cash: number
  skipped_orders: { counts: Record<string, number>; total?: number; items: SkippedOrder[] }
  basket_buy_hold: { return_pct: number } | null
  trades_total: number
  time_exit_count: number
  /** Every closed trade of the run (the Biểu đồ mã reads its symbol from it). */
  trades: ClosedTrade[]
}

export type TradesPage = { total: number; offset: number; limit: number; items: ClosedTrade[]; time_exit_count?: number }

export type RunListItem = {
  run_id: string
  created_at: string
  legacy: boolean
  status?: "succeeded" | "failed"
  strategy_source?: StrategySource | "draft" | null
  strategy_id?: string | null
  strategy_label: string
  version_label: string | null
  universe_label: string
  start: string | null
  end: string | null
  kpis: { total_return: number | null; max_drawdown: number | null; closed_trades: number | null }
}

/** Closes of one symbol over the run range, with the run's trades on it (Biểu đồ mã §4.7). */
export type SymbolChart = { symbol: string; closes: { date: string; close: number }[]; trades: ClosedTrade[]; open_position: OpenPosition | null }

/* ── Backtests: wire (strategy-backtests.schemas.ts) ───────────────────── */

/** VND as a decimal string. */
type Money = string

export type WireTrade = {
  symbol: string
  qty: number
  entry_session: string
  entry_price_vnd: Money
  entry_cost_vnd: Money
  exit_session: string
  price_vnd: Money
  gross_vnd: Money
  fee_vnd: Money
  tax_vnd: Money
  net_vnd: Money
  pnl_vnd: Money
  pnl_pct: number
  exit_reason: ExitReason
  exit_reasons: ExitReason[]
  holding_sessions: number
  counted_sessions: number
  max_holding_at_exit: number
}

export type WireSnapshot = {
  strategy_ref: { source: StrategySource | "draft"; id: string | null; version: number | null }
  strategy_label: string
  version_label: string | null
  result_label: string
  subtitle: string
  content: Record<string, unknown>
  config_hash: string
  universe_label: string
  universe_resolved: string[]
  excluded_symbols: string[]
  requested_start: string
  requested_end: string
  data_store: string
  data_as_of: string | null
  data_hash: string
  price_unit: "VND"
  adjusted: boolean
  rules_version: string
  fee_rules: { buy_fee_bps: number; sell_fee_bps: number; sell_tax_bps: number; lot_size: number }
  initial_cash_vnd: Money
  warnings: RunWarning[]
}

export type WireResult = {
  sessions: number
  start_session: string | null
  end_session: string | null
  initial_cash_vnd: Money
  final_nav_vnd: Money
  cash_end_vnd: Money
  kpis: {
    total_return_pct: number
    annualized_return_pct: number | null
    max_drawdown_pct: number
    closed_trades: number
    win_rate_pct: number | null
    basket_buy_hold_pct: number
    vnindex_pct: number | null
  }
  curve: { date: string; nav_vnd: Money; strategy: number; basket: number; vnindex: number | null }[]
  trades: WireTrade[]
  time_exits: number
  per_symbol: { symbol: string; closed_trades: number; wins: number; realized_pnl_vnd: Money; unrealized_pnl_vnd: Money; contribution_pct: number }[]
  open_positions: {
    symbol: string
    entry_session: string
    entry_price_vnd: Money
    qty: number
    last_close_vnd: Money
    holding_sessions: number
    counted_sessions: number
    max_holding: number
    unrealized_pnl_vnd: Money
    unrealized_pct: number
  }[]
  skipped_orders: { counts: Partial<Record<SkipCode, number>>; total: number; items: { date: string; symbol: string; code: SkipCode; message: string }[] }
  basket_buy_hold: { symbols: string[]; return_pct: number }
}

export type WireRun = {
  run_id: string
  status: "succeeded" | "failed"
  legacy: boolean
  trial: boolean
  created_at: string
  snapshot: WireSnapshot | null
  result: WireResult | null
  legacy_view: {
    kind: string
    symbol: string | null
    start: string | null
    end: string | null
    kpis: { total_return_pct: number; max_drawdown_pct: number; closed_trades: number } | null
    note: string
  } | null
  error: { status: number; code: string; message: string; details?: unknown[] } | null
}

export type WireRunListItem = {
  run_id: string
  created_at: string
  legacy: boolean
  status: "succeeded" | "failed"
  strategy_source: StrategySource | "draft" | null
  strategy_id: string | null
  strategy_version: number | null
  strategy_label: string
  version_label: string | null
  universe_label: string
  start: string | null
  end: string | null
  config_hash: string
  kpis: { total_return_pct: number; max_drawdown_pct: number; closed_trades: number } | null
}

export type WireTradesPage = { run_id: string; total: number; offset: number; limit: number; time_exits: number; items: WireTrade[] }

/* ── Wire → view ───────────────────────────────────────────────────────── */

const vnd = (value: Money | null | undefined) => (value == null ? 0 : Number(value))

export function toClosedTrade(trade: WireTrade): ClosedTrade {
  return {
    symbol: trade.symbol,
    entry_date: trade.entry_session,
    entry_price: vnd(trade.entry_price_vnd),
    quantity: trade.qty,
    exit_date: trade.exit_session,
    exit_price: vnd(trade.price_vnd),
    holding_sessions: trade.holding_sessions,
    exit_reason: trade.exit_reason,
    exit_reasons: trade.exit_reasons,
    max_holding_at_exit: trade.max_holding_at_exit,
    pnl: vnd(trade.pnl_vnd),
    pnl_pct: trade.pnl_pct,
  }
}

/** A stored run as the tab renders it; a failed or legacy run (no snapshot/result) rejects like an API error. */
export function toRunView(run: WireRun): RunView {
  const { snapshot, result } = run
  if (run.status === "failed" || !snapshot || !result) {
    const error = run.error
    throw new ApiError(error?.message ?? "Lần chạy này không có kết quả để xem.", error?.status ?? 422, {
      code: error?.code ?? (run.legacy ? "LEGACY_RUN" : "RUN_FAILED"),
      details: error?.details,
    })
  }
  const trades = result.trades.map(toClosedTrade)
  return {
    run_id: run.run_id,
    status: run.status,
    created_at: run.created_at,
    legacy: run.legacy,
    trial: run.trial,
    strategy_label: snapshot.strategy_label,
    version_label: snapshot.version_label,
    result_label: snapshot.result_label,
    error: null,
    snapshot: {
      strategy_ref: snapshot.strategy_ref,
      universe_label: snapshot.universe_label,
      content: snapshot.content as unknown as StrategyContent,
      config_hash: snapshot.config_hash,
      universe_resolved: snapshot.universe_resolved,
      excluded_symbols: snapshot.excluded_symbols,
      data_store: snapshot.data_store,
      data_as_of: snapshot.data_as_of ?? "",
      price_unit: snapshot.price_unit,
      adjusted: snapshot.adjusted,
      rules_version: snapshot.rules_version,
      fee_rules: snapshot.fee_rules,
      warnings: snapshot.warnings,
      start: snapshot.requested_start,
      end: snapshot.requested_end,
      sessions: result.sessions,
      capital: vnd(snapshot.initial_cash_vnd),
    },
    kpis: {
      total_return: result.kpis.total_return_pct,
      annualized_return: result.kpis.annualized_return_pct,
      max_drawdown: result.kpis.max_drawdown_pct,
      closed_trades: result.kpis.closed_trades,
      win_rate: result.kpis.win_rate_pct,
      basket_buy_hold: result.kpis.basket_buy_hold_pct,
      vnindex: result.kpis.vnindex_pct,
    },
    curve: result.curve.map((point) => ({ date: point.date, strategy: point.strategy, basket: point.basket, vnindex: point.vnindex })),
    per_symbol: result.per_symbol.map((row) => ({
      symbol: row.symbol,
      closed_trades: row.closed_trades,
      wins: row.wins,
      realized_pnl: vnd(row.realized_pnl_vnd),
      unrealized_pnl: vnd(row.unrealized_pnl_vnd),
      contribution_pct: row.contribution_pct,
    })),
    open_positions: result.open_positions.map((row) => ({
      symbol: row.symbol,
      entry_date: row.entry_session,
      entry_price: vnd(row.entry_price_vnd),
      quantity: row.qty,
      last_price: vnd(row.last_close_vnd),
      held_sessions: row.counted_sessions,
      max_holding: row.max_holding,
      unrealized_pnl: vnd(row.unrealized_pnl_vnd),
      unrealized_pct: row.unrealized_pct,
    })),
    final_cash: vnd(result.cash_end_vnd),
    skipped_orders: {
      counts: result.skipped_orders.counts as Record<string, number>,
      total: result.skipped_orders.total,
      items: result.skipped_orders.items.map((item) => ({ date: item.date, symbol: item.symbol, code: item.code, reason: item.message })),
    },
    basket_buy_hold: { return_pct: result.basket_buy_hold.return_pct },
    trades_total: trades.length,
    time_exit_count: result.time_exits,
    trades,
  }
}

export function toRunListItem(item: WireRunListItem): RunListItem {
  return {
    run_id: item.run_id,
    created_at: item.created_at,
    legacy: item.legacy,
    status: item.status,
    strategy_source: item.strategy_source,
    strategy_id: item.strategy_id,
    strategy_label: item.strategy_label,
    version_label: item.version_label,
    universe_label: item.universe_label,
    start: item.start,
    end: item.end,
    kpis: {
      total_return: item.kpis?.total_return_pct ?? null,
      max_drawdown: item.kpis?.max_drawdown_pct ?? null,
      closed_trades: item.kpis?.closed_trades ?? null,
    },
  }
}

export const TRADES_PAGE_SIZE = 20
/** A basket run is synchronous on the server (30 s executor budget); past this the page stops waiting. */
export const RUN_TIMEOUT_MS = 120_000
export const STRATEGY_LIMIT = 20

/* ── Calls ─────────────────────────────────────────────────────────────── */

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) })
const enc = encodeURIComponent

export const fetchStoreMeta = (signal?: AbortSignal) => api<StoreMeta>("/strategy/store/meta", { signal })
export const fetchUniverseOptions = (signal?: AbortSignal) => api<UniverseOptions>("/strategy/universe-options", { signal })

export const fetchStrategies = (signal?: AbortSignal) => api<StrategyList>("/strategy/strategies", { signal })
export const fetchVersions = (id: string, signal?: AbortSignal) => api<VersionList>(`/strategy/strategies/${enc(id)}/versions`, { signal })
export const fetchVersion = (id: string, version: number, signal?: AbortSignal) => api<VersionDetail>(`/strategy/strategies/${enc(id)}/versions/${version}`, { signal })

export const createStrategy = (body: { name: string; content: StrategyContent; from_run_id: string } & ApplyNext) => api<SaveResult>("/strategy/strategies", json(body))
export const createVersion = (id: string, body: { content: StrategyContent; from_run_id: string; expected_latest_version: number } & ApplyNext) =>
  api<SaveResult>(`/strategy/strategies/${enc(id)}/versions`, json(body))
export const restoreVersion = (id: string, version: number, body: { expected_latest_version: number } & ApplyNext) =>
  api<SaveResult>(`/strategy/strategies/${enc(id)}/versions/${version}/restore`, json(body))
export const deleteStrategy = (id: string) => api<void>(`/strategy/strategies/${enc(id)}`, { method: "DELETE" })

export const fetchIqxVersions = (id: string, signal?: AbortSignal) => api<IqxVersionList>(`/strategy/iqx-templates/${enc(id)}/versions`, { signal })
export const fetchIqxVersion = (id: string, version: number, signal?: AbortSignal) => api<IqxVersionDetail>(`/strategy/iqx-templates/${enc(id)}/versions/${version}`, { signal })

export const runBacktest = async (body: RunRequest, signal?: AbortSignal) => toRunView(await api<WireRun>("/strategy/backtests", { ...json(body), signal }))
export const fetchRun = async (id: string, signal?: AbortSignal) => toRunView(await api<WireRun>(`/strategy/backtests/${enc(id)}`, { signal }))

export async function fetchRuns(filter: { source?: StrategySource | "draft"; id?: string | null; limit?: number }, signal?: AbortSignal): Promise<{ items: RunListItem[] }> {
  const query = new URLSearchParams({ limit: String(Math.min(100, filter.limit ?? 50)) })
  if (filter.source) query.set("strategy_source", filter.source)
  if (filter.id) query.set("strategy_id", filter.id)
  const wire = await api<{ items: WireRunListItem[] }>(`/strategy/backtests?${query.toString()}`, { signal })
  return { items: wire.items.map(toRunListItem) }
}

export async function fetchTrades(id: string, page: number, signal?: AbortSignal): Promise<TradesPage> {
  const wire = await api<WireTradesPage>(`/strategy/backtests/${enc(id)}/trades?offset=${page * TRADES_PAGE_SIZE}&limit=${TRADES_PAGE_SIZE}`, { signal })
  return { total: wire.total, offset: wire.offset, limit: wire.limit, items: wire.items.map(toClosedTrade), time_exit_count: wire.time_exits }
}

function closeOf(bar: unknown): { date: string; close: number } | null {
  if (!bar || typeof bar !== "object") return null
  const row = bar as Record<string, unknown>
  const close = Number(row.close ?? row.close_price)
  const raw = row.time ?? row.date ?? row.trading_date ?? row.timestamp
  const date = typeof raw === "string" ? raw.slice(0, 10) : typeof raw === "number" ? new Date(raw < 1e12 ? raw * 1000 : raw).toISOString().slice(0, 10) : null
  return date && Number.isFinite(close) && close > 0 ? { date, close } : null
}

/**
 * Biểu đồ mã (§4.7): the run's own trades and open position of `symbol` over the market daily closes of the
 * run range. The backtest API has no per-symbol price route, so the closes are best effort (none = markers only).
 */
export async function fetchSymbolChart(run: RunView, symbol: string, signal?: AbortSignal): Promise<SymbolChart> {
  const params = new URLSearchParams({ start: run.snapshot.start, end: run.snapshot.end, interval: "1D" })
  let closes: SymbolChart["closes"] = []
  try {
    const payload = await api<unknown>(`/market-data/quotes/${enc(symbol)}/ohlcv?${params.toString()}`, { signal })
    const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null
    const rows: unknown[] = Array.isArray(payload) ? payload : Array.isArray(record?.data) ? record.data : Array.isArray(record?.items) ? record.items : []
    closes = rows.map(closeOf).filter((item): item is { date: string; close: number } => item !== null)
  } catch (error) {
    if (signal?.aborted) throw error
  }
  return {
    symbol,
    closes,
    trades: run.trades.filter((trade) => trade.symbol === symbol),
    open_position: run.open_positions.find((item) => item.symbol === symbol) ?? null,
  }
}
