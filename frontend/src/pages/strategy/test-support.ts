/**
 * Fakes shared by the Chiến lược tests (never imported by production code): typed fixtures built
 * from the generated contract and a stateful in-memory fake of the v2 routes the page calls.
 * Shared-config, registry, saved lists and the Bot universe come from the Bot test fake.
 */
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

import { createFakeApi as createBotApi, createWorld as createBotWorld, FakeApiError, registryFor, VN30, type World as BotWorld } from "../demo-trading/bot/test-support"
import type { IndicatorConfig } from "../demo-trading/bot/config/types"

export { FakeApiError }

type Alert = ApiResponseFor<"GET /api/v2/strategy/alerts">["items"][number]
type AlertDetailView = ApiResponseFor<"GET /api/v2/strategy/alerts/{alertId}">
type AlertEventView = ApiResponseFor<"GET /api/v2/strategy/alerts/events">["items"][number]
type RunView = ApiResponseFor<"GET /api/v2/strategy/backtests/{id}">
type RunSummaryView = ApiResponseFor<"GET /api/v2/strategy/backtests">["items"][number]
type TradesView = ApiResponseFor<"GET /api/v2/strategy/backtests/{id}/trades">
type TradeView = TradesView["items"][number]
export type MetricView = ApiResponseFor<"GET /api/v2/strategy/screener/metrics">[number]
type RunBody = ApiRequestFor<"POST /api/v2/strategy/screener/run">["body"]
type Definition = Extract<RunBody, { schema_version: "4.0" }>
type ResultPage = ApiResponseFor<"GET /api/v2/strategy/screener/results/{resultId}">
type ResultRowView = ResultPage["results"][number]
type CellView = ResultRowView["metrics"][string]
type TechCellView = ResultRowView["technical"][string]
type FilterView = ApiResponseFor<"GET /api/v2/strategy/filters">["items"][number]
type ListView = ApiResponseFor<"GET /api/v2/strategy/lists">["items"][number]
type SnapshotView = ApiResponseFor<"GET /api/v2/strategy/result-snapshots/{snapshotId}">
type RevisionView = ApiResponseFor<"GET /api/v2/strategy/shared-config/revisions">[number]

export const T0 = "2026-10-08T03:00:00.000Z"
export const ALERT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
export const RUN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
export const LIST_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"

/* ── Alerts ─────────────────────────────────────────────────────────────── */

const sideDetail = (ids: string[]) => ({ valid: ids.length > 0, watched: ids.length > 0, indicator_ids: ids })

export function alertView(partial: Partial<Alert> & { id?: string } = {}): Alert {
  return {
    id: ALERT_ID,
    name: "Theo dõi xu hướng",
    enabled: true,
    status: "watching",
    current_version: 1,
    observation_started_at: T0,
    paused_at: null,
    created_at: T0,
    updated_at: T0,
    last_check: { session: "2026-10-07", evaluated_at: T0, pairs_expected: 4, pairs_checked: 4, satisfied: 1, not_satisfied: 3, unknown: 0, blocked: 0 },
    version: {
      version: 1,
      source: { kind: "shared_config", revision: 3, saved_at: T0, stored_config_hash: "h3" },
      config_hash: "a".repeat(64),
      schema_version: "3.0",
      rule_version: "iqx-rules-3.0",
      calculation_version: "iqx-ta-2.0",
      scope: { kind: "symbols" },
      symbols: ["FPT", "VNM"],
      sides: ["buy", "sell"],
      sides_detail: { buy: sideDetail(["macd", "ma"]), sell: sideDetail(["macd"]) },
      definition_hash: "d".repeat(64),
      created_at: T0,
    },
    ...partial,
  } as Alert
}

export function alertDetail(alert: Alert): AlertDetailView {
  return { ...alert, versions: [alert.version] }
}

export function eventView(partial: Partial<AlertEventView> = {}): AlertEventView {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    alert_id: ALERT_ID,
    alert_version: 1,
    alert_name: "Theo dõi xu hướng",
    symbol: "HPG",
    side: "buy",
    side_label: "Mua",
    signal_session: "2026-10-07",
    event_kind: "new_signal",
    event_kind_label: "Tín hiệu mới: trước đó chưa thỏa điều kiện",
    message: "Thỏa điều kiện Mua",
    evaluated_at: T0,
    data_version: "vci-2026-10-07",
    config_hash: "a".repeat(64),
    rule_version: "iqx-rules-4.0",
    calculation_version: "iqx-ta-2.0",
    previous_valid_result: false,
    previous_valid_session: "2026-10-06",
    created_at: T0,
    evidence: {
      session: "2026-10-07",
      bar: { date: "2026-10-07", open: 27000, high: 27800, low: 26900, close: 27650, volume: 12_500_000 },
      indicator_ids: ["macd"],
      rules: [{
        id: "macd.signal", indicator: "macd", side: "buy", op: "cross_up", lhs: 0.42, rhs: 0.31, previous_lhs: 0.2, previous_rhs: 0.3, result: true, missing: false,
        values: { fast: 12, slow: 26, op: "cross_up", signal: 9 },
      }],
    },
    ...partial,
  }
}

/** Evidence of an event recorded before SPEC V3: rule ids `r1`…, one param set per indicator. */
export const LEGACY_EVIDENCE: AlertEventView["evidence"] = {
  session: "2026-10-07",
  bar: { date: "2026-10-07", open: 27000, high: 27800, low: 26900, close: 27650, volume: 12_500_000 },
  indicator_ids: ["macd"],
  indicator_params: { macd: { fast: 12, slow: 26, signal: 9 } },
  rules: [{ id: "r1", indicator: "macd", side: "buy", op: ">", lhs: 0.42, rhs: 0.31, result: true, missing: false }],
}

/* ── Backtest ───────────────────────────────────────────────────────────── */

const rule = (side: "buy" | "sell", op: ">" | "<", lhs: number, rhs: number) => ({ id: "r1", indicator: "macd", side, op, lhs, rhs, result: true, missing: false })
const evidence = (side: "buy" | "sell", op: ">" | "<", lhs: number, rhs: number) => ({ indicator_ids: ["macd"], rules: [rule(side, op, lhs, rhs)] })

export function tradeView(number: number, partial: Partial<TradeView> = {}): TradeView {
  return {
    number,
    qty: 1000,
    entry_date: `2025-0${(number % 9) + 1}-10`,
    entry_signal_date: `2025-0${(number % 9) + 1}-09`,
    entry_price: 20_000 + number * 10,
    exit_date: `2025-0${(number % 9) + 1}-25`,
    exit_signal_date: `2025-0${(number % 9) + 1}-24`,
    exit_price: 21_000 + number * 10,
    hold: 10,
    pnl: 900_000,
    pnl_pct: 4.5,
    exit_reason: "sell_consensus",
    entry_fee: 30_000,
    entry_total: 20_030_000 + number * 10_000,
    exit_gross: 21_000_000,
    exit_fee_tax: 52_500,
    exit_net: 20_947_500,
    outcome: "win",
    entry_conditions: evidence("buy", ">", 0.4, 0.3),
    exit_conditions: evidence("sell", "<", 0.1, 0.2),
    ...partial,
  }
}

export function runResponse(options: { start?: string; end?: string; capital?: number; trades?: number; open?: boolean; pending?: boolean; execution?: "next_open" | "same_close"; id?: string; symbol?: string; revision?: number; marketAvailable?: boolean } = {}): RunView {
  const count = options.trades ?? 3
  const execution = options.execution ?? "next_open"
  const trades = Array.from({ length: count }, (_unused, index) => tradeView(index + 1))
  const open = options.open
    ? {
        qty: 3100, price: 48_940, cost: 151_714_000, index: 480, date: "2025-11-27", signal_date: "2025-11-26", last_price: 55_130, market_value: 170_903_000, unrealized_pnl: 18_961_429,
        unrealized_pnl_basis: "market_value_at_last_close_minus_entry_total_before_sell_costs" as const, entry_conditions: evidence("buy", ">", 0.4, 0.3),
      }
    : null
  const pending = options.pending ? [{ action: "buy" as const, signal_date: "2025-12-31", reason: "end_of_range" as const, note: "Không còn phiên trong khoảng để khớp.", evidence: evidence("buy", ">", 0.4, 0.3) }] : []
  const market = options.marketAvailable !== false
  const point = (date: string, strategy: number, hold: number, vn: number | null) => ({ date, value: 100_000_000 * (1 + strategy / 100), return_pct: strategy, buy_hold_pct: hold, market_pct: vn })
  const curve = [point("2024-01-02", 0, 0, market ? 0 : null), point("2024-06-03", 12.5, 4.2, market ? 3.1 : null), point("2024-12-31", -3, 6.1, market ? 5 : null), point("2025-12-31", 74.2, 15.3, market ? 10.4 : null)]
  const snapshot = {
    config: { schema_version: "3.0", indicators: { macd: { master_enabled: true, buy: { enabled: true, params: { fast: 12, slow: 26, signal: 9 }, rules: [] }, sell: { enabled: true, params: { fast: 12, slow: 26, signal: 9 }, rules: [] } } } },
    options: { capital: options.capital ?? 100_000_000, fee_buy: 0.0015, fee_sell: 0.0025, lot: 100, execution, min_held_bars: 2, start: options.start ?? "2024-01-02", end: options.end ?? "2025-12-31" },
    actual_start: options.start ?? "2024-01-02", actual_end: options.end ?? "2025-12-31", bar_count: 500, shared_revision: options.revision ?? 3, revision_saved_at: T0, config_hash: "c".repeat(64),
    symbol: options.symbol ?? "FPT", requested_start: options.start ?? "2024-01-02", requested_end: options.end ?? "2025-12-31", data_source: "VCI", data_source_priority: 1, adjusted: true, skipped_rows: 0, data_hash: "f".repeat(64),
    benchmark: { symbol: "VNINDEX" as const, available: market, source: market ? "VCI" : null }, warmup_sessions_requested: 200, warmup_bars: 200, fee_preset: "standard" as const, fees: { buy: 0.0015, sell: 0.0025 }, lot_size: 100,
    execution, capital: options.capital ?? 100_000_000, execution_profile: "CLEAN_TECH_2.0" as const,
    profile: { stop_loss: "none" as const, take_profit_pct: null, max_holding: null, trailing: "none" as const, position_size: "all_cash" as const, lot_size: 100, min_held_bars: 2 },
    slippage: "not_modelled" as const, open_position_policy: "mark_to_market_last_close" as const,
    simulation: {
      contract: "iqx-strategy-backtest-1.0" as const, execution, execution_label: execution === "same_close" ? "Đóng cửa cùng phiên" : "Mở cửa phiên kế tiếp",
      fill_price: execution === "same_close" ? "Khớp tại giá đóng cửa của phiên có tín hiệu" : "Khớp tại giá mở cửa của phiên giao dịch kế tiếp",
      caveat: execution === "same_close" ? "Quy ước mô phỏng, không chứng minh có thể đặt lệnh khớp đúng giá đóng cửa." : "Tín hiệu cuối kỳ chưa có phiên khớp được giữ là chưa khớp.", signal_after_open_fill: true,
      position_policy: "single_symbol_long_only_one_position" as const, sizing: "all_available_cash_including_buy_fee_rounded_down_to_lot" as const, exits: "none: no stop, take-profit, trailing or max holding" as const,
      min_held_bars: 2, min_held_bars_status: "carried_over_from_reference_engine_pending_product_decision" as const, fee_model: "buy_fee_on_value; sell_fee_and_tax_as_one_combined_rate" as const,
      settlement: "not_modelled" as const, liquidity: "not_modelled" as const, slippage: "not_modelled" as const, price_adjustment: "provider_adjusted" as const, annualization_sessions: 252 as const, buy_hold_basis: "close_ratio_before_fees_and_dividends" as const,
    },
    versions: { schema_version: "3.0", calculation_version: "iqx-ta-2.0", rule_version: "iqx-rules-3.0", engine_version: "iqx-backtest-2.0", formula_version: "iqx-formula-2.0" },
    data_warnings: [], research: null, system: null,
  }
  const counts = { buy_count: count + (open ? 1 : 0), closed_trade_count: count, open_position_count: open ? 1 : 0, pending_order_count: pending.length }
  return {
    run_id: options.id ?? RUN_ID, status: "succeeded", kind: "single", shared_revision: options.revision ?? 3, created_at: T0, request: {}, snapshot, research_result: null, system_result: null, data_warnings: [], error: null,
    result: {
      schema_version: "3.0", engine_version: "iqx-backtest-2.0", calculation_version: "iqx-ta-2.0", rule_version: "iqx-rules-3.0", formula_version: "iqx-formula-2.0",
      profile: snapshot.profile, snapshot, initial: curve[0]!, curve: curve.slice(1), trades, open_position: open, cash: 0, canceled: [], contract: "iqx-strategy-backtest-1.0",
      kpis: { total_return_pct: 74.2, annualized_return_pct: 30.7, max_drawdown_pct: -10.6, closed_trade_count: count, win_rate_pct: count > 0 ? 66.7 : null, buy_hold_return_pct: 15.3 },
      kpi_basis: {}, counts, supplementary: { winning_trade_count: Math.round(count * 0.667), profit_factor: 1.8 },
      chart: {
        title: "Lợi nhuận danh mục (%)", unit: "percent_points", baseline_field: "initial", point_count: 4,
        series: [
          { id: "strategy", label: "Danh mục chiến lược", field: "return_pct", available: true, end_value_pct: 74.2, unavailable_reason: null },
          { id: "buy_hold", label: "Mua và giữ FPT", field: "buy_hold_pct", available: true, end_value_pct: 15.3, unavailable_reason: null },
          { id: "market", label: "VN-Index", field: "market_pct", available: market, end_value_pct: market ? 10.4 : null, unavailable_reason: market ? null : "Thiếu dữ liệu VN-Index cùng ngày gốc" },
        ],
      },
      pending_orders: pending,
    },
  } as unknown as RunView
}

export function tradesPage(run: RunView, page: number, limit: number, total: number): TradesView {
  const items = Array.from({ length: Math.max(0, Math.min(limit, total - page * limit)) }, (_unused, index) => tradeView(page * limit + index + 1))
  return {
    run_id: run.run_id, total, offset: page * limit, limit,
    counts: { buy_count: total, closed_trade_count: total, open_position_count: 0, pending_order_count: 0 },
    items, open_position: run.result?.open_position ?? null, pending_orders: run.result?.pending_orders ?? [],
  }
}

export function runSummary(partial: Partial<RunSummaryView> = {}): RunSummaryView {
  return {
    run_id: RUN_ID, kind: "single", status: "succeeded", shared_revision: 3, symbol: "FPT", start: "2024-01-02", end: "2025-12-31", created_at: T0, config_hash: "c".repeat(64),
    kpis: { total_return_pct: 74.2, annualized_return_pct: 30.7, max_drawdown_pct: -10.6, closed_trade_count: 13, win_rate_pct: 53.8, buy_hold_return_pct: 15.3 }, error_code: null, ...partial,
  }
}

/* ── Screener ───────────────────────────────────────────────────────────── */

const period = (id: "quarter" | "ttm" | "year" | "three_year", label: string) => ({ id, label })
const QTY: MetricView["allowed_periods"] = [period("quarter", "Quý gần nhất"), period("ttm", "Bốn quý gần nhất"), period("year", "Năm tài chính gần nhất")]
const TTM_FIRST: MetricView["allowed_periods"] = [period("ttm", "Bốn quý gần nhất"), period("quarter", "Quý gần nhất"), period("year", "Năm tài chính gần nhất")]
const ROE: MetricView["allowed_periods"] = [period("ttm", "Bốn quý gần nhất"), period("year", "Năm tài chính gần nhất")]

function metric(partial: Partial<MetricView> & Pick<MetricView, "id" | "name" | "lesson_id">): MetricView {
  return {
    unit: "%", api_unit: "ratio", period: "Quý gần nhất", default_period: "quarter", allowed_periods: QTY, readiness: "ready", applicability: "all", operators: [">", "<"], learned: true, supported: true, unsupported_reason: null, ...partial,
  }
}

export function metricsFixture(learned: readonly string[] = ["revenue_yoy", "profit_yoy", "eps_yoy", "gross_margin", "net_margin", "roe", "roic"]): MetricView[] {
  const all: MetricView[] = [
    metric({ id: "revenue_yoy", name: "Tăng trưởng doanh thu YoY", lesson_id: "ch08-l01" }),
    metric({ id: "profit_yoy", name: "Tăng trưởng LNST YoY", lesson_id: "ch08-l02" }),
    metric({ id: "eps_yoy", name: "Tăng trưởng EPS YoY", lesson_id: "ch08-l03", readiness: "data_unavailable", supported: false, unsupported_reason: "Nguồn dữ liệu hiện tại chưa có EPS điều chỉnh tách/thưởng cổ phiếu." }),
    metric({ id: "gross_margin", name: "Biên lợi nhuận gộp", lesson_id: "ch08-l04", default_period: "ttm", allowed_periods: TTM_FIRST, applicability: "non_financial" }),
    metric({ id: "net_margin", name: "Biên lợi nhuận ròng", lesson_id: "ch08-l05", default_period: "ttm", allowed_periods: TTM_FIRST }),
    metric({ id: "roe", name: "ROE", lesson_id: "ch08-l06", default_period: "ttm", allowed_periods: ROE }),
    metric({ id: "roa", name: "ROA", lesson_id: "ch09-l01", default_period: "ttm", allowed_periods: ROE }),
    metric({ id: "roic", name: "ROIC", lesson_id: "ch09-l02", default_period: "ttm", allowed_periods: ROE, readiness: "definition_pending", supported: false, unsupported_reason: "Chưa có thuế suất chuẩn hóa; không tự ước lượng NOPAT." }),
  ]
  return all.map((item) => ({ ...item, learned: learned.includes(item.id) }))
}

type Base = Record<string, Record<string, number | "missing" | "na" | "base">>
const BASE: Base = {
  FPT: { revenue_yoy: 0.2, profit_yoy: 0.28, gross_margin: 0.21, net_margin: 0.12, roe: 0.25 },
  HPG: { revenue_yoy: 0.44, profit_yoy: 0.47, gross_margin: 0.15, net_margin: 0.08, roe: 0.158 },
  MBB: { revenue_yoy: 0.18, profit_yoy: 0.189, gross_margin: "na", net_margin: "na", roe: 0.231 },
  CMG: { revenue_yoy: 0.2, profit_yoy: 0.05, gross_margin: 0.27, net_margin: 0.09, roe: 0.172 },
  XYZ: { revenue_yoy: "missing", profit_yoy: "missing", gross_margin: "missing", net_margin: "missing", roe: "missing" },
  NEG: { revenue_yoy: 0.1, profit_yoy: "base", gross_margin: 0.1, net_margin: 0.1, roe: 0.2 },
}
const PERIOD_FACTOR: Record<string, number> = { quarter: 1, ttm: 0.9, year: 0.8, three_year: 1 }
const PERIOD_LABEL: Record<string, string> = { quarter: "Q3/2025", ttm: "4 quý đến Q3/2025", year: "Năm 2024", three_year: "Ba năm 2022-2024" }

function cell(symbol: string, metricId: string, periodMode: "quarter" | "ttm" | "year" | "three_year", unit: ApiUnit): CellView {
  const raw = (BASE[symbol] ?? BASE.FPT)?.[metricId]
  const common = { metric_id: metricId, period_mode: periodMode, unit, actual_period_label: raw === "missing" ? null : PERIOD_LABEL[periodMode]!, comparison_period_label: metricId.endsWith("_yoy") ? "Q3/2024" : null, published_at: "2025-10-20", available_at: "2025-10-21", source_revision: "vci-2025-10-20", components: [{ label: PERIOD_LABEL[periodMode]!, published_at: "2025-10-20", updated_at: "2025-10-21" }] }
  if (raw === "missing" || raw === undefined) return { ...common, status: "missing", value: null, reason: "Thiếu dữ liệu đầu vào", reason_code: "missing_input", actual_period_label: null } as CellView
  if (raw === "na") return { ...common, status: "not_applicable", value: null, reason: "Không áp dụng cho ngân hàng, bảo hiểm, chứng khoán", reason_code: "financial_sector" } as CellView
  if (raw === "base") return { ...common, status: "insufficient_base", value: null, reason: "Kỳ gốc không dương", reason_code: "non_positive_base" } as CellView
  return { ...common, status: "ok", value: Number((raw * PERIOD_FACTOR[periodMode]!).toFixed(6)) } as CellView
}
type ApiUnit = MetricView["api_unit"]

/** A company of the fake market: the figures of session T (price in nghìn đồng, vốn hóa and GTGD in tỷ đồng) and its RSI. */
export type Company = {
  name: string
  sector: string
  exchange: "HOSE" | "HNX" | "UPCOM"
  group: "thuong" | "nh" | "ck" | "bh"
  baskets: string[]
  price: number
  change: number
  cap: number
  avg: number
  /** RSI at T and one session earlier; `null`: a new listing without enough history (NO_SIGNAL). */
  rsi: number | null
  rsiBefore: number | null
}

export const COMPANIES: Record<string, Company> = {
  FPT: { name: "CTCP FPT", sector: "Công nghệ", exchange: "HOSE", group: "thuong", baskets: ["VN30", "VN100"], price: 124.5, change: 1.23, cap: 183000, avg: 480.5, rsi: 63.7, rsiBefore: 55.2 },
  HPG: { name: "CTCP Tập đoàn Hòa Phát", sector: "Sản xuất", exchange: "HOSE", group: "thuong", baskets: ["VN30", "VN100"], price: 27.4, change: -0.55, cap: 175000, avg: 620.1, rsi: 28.4, rsiBefore: 33 },
  MBB: { name: "Ngân hàng TMCP Quân Đội", sector: "Ngân hàng", exchange: "HOSE", group: "nh", baskets: ["VN30", "VN100"], price: 24.1, change: 0.42, cap: 125000, avg: 300, rsi: 45, rsiBefore: 44 },
  CMG: { name: "CTCP Tập đoàn Công nghệ CMC", sector: "Công nghệ", exchange: "HOSE", group: "thuong", baskets: ["VN100"], price: 52.3, change: 2.1, cap: 12000, avg: 85, rsi: 71.2, rsiBefore: 69 },
  XYZ: { name: "CTCP Thiếu dữ liệu", sector: "Bán lẻ", exchange: "HNX", group: "thuong", baskets: [], price: 8.2, change: 1.35, cap: 400, avg: 3.4, rsi: null, rsiBefore: null },
  NEG: { name: "CTCP Lợi nhuận âm", sector: "Sản xuất", exchange: "UPCOM", group: "thuong", baskets: [], price: 3.1, change: -1.5, cap: 90, avg: 0.4, rsi: 55, rsiBefore: 50 },
}

const companyOf = (symbol: string): Company =>
  COMPANIES[symbol] ?? { name: `CTCP ${symbol}`, sector: "Công nghệ", exchange: "HOSE", group: "thuong", baskets: [], price: 10, change: 0, cap: 1000, avg: 10, rsi: 50, rsiBefore: 49 }

const SESSION = "2026-10-07"
const fixedVi = (value: number, decimals: number) => value.toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** Step 1, Thị trường: the six items are AND, the choices inside one item are OR; a blank item filters nothing. */
function inMarketScope(company: Company, market: Definition["market"]): boolean {
  const exchanges = (market.exchanges ?? []).map((value) => (value === "HSX" ? "HOSE" : value))
  if (exchanges.length > 0 && !exchanges.includes(company.exchange)) return false
  const baskets = market.baskets ?? []
  if (baskets.length > 0 && !baskets.some((basket) => company.baskets.includes(basket))) return false
  const groups = market.statement_groups ?? []
  if (groups.length > 0 && !groups.includes(company.group)) return false
  const { min: capMin, max: capMax } = market.market_cap
  if ((capMin !== null && company.cap < capMin) || (capMax !== null && company.cap > capMax)) return false
  const { min: priceMin, max: priceMax } = market.close_price
  if ((priceMin !== null && company.price < priceMin) || (priceMax !== null && company.price > priceMax)) return false
  return market.avg_value.min === null || company.avg >= market.avg_value.min
}

const NO_SIGNAL_REASON = "Chưa đủ số phiên giao dịch để tính chỉ báo ở điều kiện này. Không được coi là đạt."

function technicalCell(key: string, indicator: string, rowId: string, label: string, partial: Partial<TechCellView>): TechCellView {
  return { key, indicator, row_id: rowId, label, status: "ok", result: true, op: ">", value: 1, value2: null, value3: null, display: "1,0", sort_value: 1, previous: null, lag: null, params: {}, ...partial } as TechCellView
}

/** The technical cell of every SWITCHED-ON row of the definition, at session T. Only RSI has real numbers; the others are always true. */
export function technicalCellsFor(symbol: string, items: NonNullable<Definition["technical"]>): Record<string, TechCellView> {
  const company = companyOf(symbol)
  const cells: Record<string, TechCellView> = {}
  const missing = (key: string, indicator: string, rowId: string, label: string, params: TechCellView["params"] = {}, lag: number | null = null) =>
    technicalCell(key, indicator, rowId, label, { status: "missing", result: null, op: null, value: null, display: null, sort_value: null, params, lag, reason: NO_SIGNAL_REASON, reason_code: "insufficient_price_history" })
  for (const item of items) {
    if (item.indicator === "volume") {
      const volume = item as { sessions: number; factor: number; ops: [string, string] }
      const params = { lookback: volume.sessions, mult: volume.factor }
      const label = `KL / ${String(volume.factor).replace(".", ",")}×TB${volume.sessions} (nghìn cp)`
      if (company.rsi === null) {
        cells["volume.r1"] = missing("volume.r1", "volume", "r1", "Giá nay / trước", params, 1)
        cells["volume.r2"] = missing("volume.r2", "volume", "r2", label, params)
        continue
      }
      cells["volume.r1"] = technicalCell("volume.r1", "volume", "r1", "Giá nay / trước", { op: volume.ops[0], display: `${fixedVi(company.price, 2)} / ${fixedVi(company.price - 1, 2)}`, value: company.price, value2: company.price - 1, sort_value: company.price / (company.price - 1), lag: 1, params })
      cells["volume.r2"] = technicalCell("volume.r2", "volume", "r2", label, { op: volume.ops[1], display: "230 / 189", value: 230, value2: 189, sort_value: 230 / 189, params })
      continue
    }
    for (const rule of (item as { rules: Array<Record<string, number | string | boolean>> }).rules) {
      if (rule.enabled !== true) continue
      const rowId = String(rule.id)
      const params = Object.fromEntries(Object.entries(rule).filter(([field, value]) => field !== "id" && field !== "enabled" && typeof value !== "boolean")) as Record<string, number | string>
      if (rowId === "rsi.level") {
        const label = `RSI${params.period}`
        if (company.rsi === null) { cells[rowId] = missing(rowId, "rsi", rowId, label, params); continue }
        const threshold = Number(params.threshold)
        const result = params.op === "<" ? company.rsi < threshold : params.op === ">" ? company.rsi > threshold : false
        cells[rowId] = technicalCell(rowId, "rsi", rowId, label, {
          result, op: String(params.op), value: company.rsi, display: fixedVi(company.rsi, 1), sort_value: company.rsi, params,
          previous: { value: company.rsiBefore, value2: null, value3: null, display: company.rsiBefore === null ? null : fixedVi(company.rsiBefore, 1) },
        })
        continue
      }
      if (rowId === "rsi.trend") {
        const label = `RSI${params.period} nay / ${params.period} phiên trước`
        if (company.rsi === null || company.rsiBefore === null) { cells[rowId] = missing(rowId, "rsi", rowId, label, params, Number(params.period)); continue }
        cells[rowId] = technicalCell(rowId, "rsi", rowId, label, {
          result: params.dir === "up" ? company.rsi > company.rsiBefore : company.rsi < company.rsiBefore, op: ">", value: company.rsi, value2: company.rsiBefore,
          display: `${fixedVi(company.rsi, 1)} / ${fixedVi(company.rsiBefore, 1)}`, sort_value: company.rsi - company.rsiBefore, lag: Number(params.period), params,
        })
        continue
      }
      const label = `${String(item.indicator).toUpperCase()} ${rowId.split(".")[1] ?? rowId}`
      cells[rowId] = company.rsi === null ? missing(rowId, String(item.indicator), rowId, label, params) : technicalCell(rowId, String(item.indicator), rowId, label, { params })
    }
  }
  return cells
}

const exceptionOf = (cells: Record<string, TechCellView>) => Object.values(cells).some((item) => item.status !== "ok")

function rowFor(symbol: string, definition: Definition, metrics: MetricView[]): ResultRowView {
  const company = companyOf(symbol)
  const technical = technicalCellsFor(symbol, definition.technical ?? [])
  const technicalOk = Object.values(technical).every((item) => item.result === true)
  const byId = new Map(metrics.map((item) => [item.id as string, item]))
  const specs = [...definition.rules.map((rule) => ({ id: rule.metric_id as string, period: rule.period })), ...(definition.columns ?? []).map((column) => ({ id: column.metric_id as string, period: column.period }))]
  // Step 2 runs only for companies that survived step 1; the others carry no fundamental figure.
  const cells: Record<string, CellView> = {}
  if (technicalOk) for (const spec of specs) cells[spec.id] = cell(symbol, spec.id, spec.period, byId.get(spec.id)?.api_unit ?? "ratio")
  const fundamentalOk = technicalOk && definition.rules.every((rule) => {
    const value = cells[rule.metric_id]
    if (!value || value.status !== "ok" || value.value === null) return false
    return rule.operator === ">" ? value.value > rule.value : value.value < rule.value
  })
  return {
    symbol, name: company.name, sector: company.sector, exchange: company.exchange, group: company.group, passed: technicalOk && fundamentalOk, metrics: cells, technical,
    market: { price: company.price, change_pct: company.change, market_cap: company.cap, avg_value: company.avg },
  } as ResultRowView
}

const SORT_TEXT = new Set(["symbol", "name", "exchange", "group"])

/** Server-side order of the whole result (spec §4.3): blank or not ok last whatever the direction, ties by Mã A→Z. */
export function sortRows(rows: ResultRowView[], key: string | null, order: string | null): ResultRowView[] {
  const sortKey = key ?? "symbol"
  const direction = order === "desc" ? -1 : 1
  const valueOf = (row: ResultRowView): string | number | null => {
    if (SORT_TEXT.has(sortKey)) return String(row[sortKey as "symbol" | "name" | "exchange" | "group"] ?? "")
    if (sortKey === "price" || sortKey === "change_pct" || sortKey === "market_cap" || sortKey === "avg_value") return row.market[sortKey]
    if (sortKey.startsWith("metric:")) { const item = row.metrics[sortKey.slice(7)]; return item && item.status === "ok" ? item.value : null }
    if (sortKey.startsWith("tech:")) { const item = row.technical[sortKey.slice(5)]; return item && item.status === "ok" ? item.sort_value : null }
    return null
  }
  return [...rows].sort((a, b) => {
    const left = valueOf(a)
    const right = valueOf(b)
    if (left === null && right !== null) return 1
    if (left !== null && right === null) return -1
    if (left !== null && right !== null && left !== right) {
      const compared = typeof left === "string" ? left.localeCompare(String(right), "vi") : (left as number) - (right as number)
      if (compared !== 0) return compared * direction
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
  })
}

export const SYMBOLS = ["CMG", "FPT", "HPG", "MBB", "NEG", "XYZ"]

/* ── World ──────────────────────────────────────────────────────────────── */

export type StrategyWorld = BotWorld & {
  alerts: Alert[]
  events: AlertEventView[]
  revisions: RevisionView[]
  runs: RunSummaryView[]
  runResponses: Map<string, RunView>
  /** How many closed trades the next run produces. */
  nextTrades: number
  nextOpen: boolean
  nextPending: boolean
  marketAvailable: boolean
  metrics: MetricView[]
  screenerRuns: Map<string, { header: Omit<ResultPage, "results" | "total" | "offset" | "limit" | "result_id">; rows: ResultRowView[] }>
  filters: FilterView[]
  snapshots: SnapshotView[]
  /** Extra passing companies (SYM001...) added to the universe, to exercise paging. */
  extraCompanies: number
  /** The next runs answer 503 `MARKET_DATA_UNAVAILABLE`. */
  marketDataUnavailable: boolean
  /** The next runs say that more companies than the fundamental cap survived Thị trường and Kỹ thuật. */
  truncated: boolean
  /** Baskets the fake has no membership of at session T. */
  basketsUnavailable: string[]
  /** Delay (ms) before a screener run answers, per call index, to reproduce out-of-order responses. */
  runDelay: (index: number) => number
  runCount: number
}

export function createStrategyWorld(partial: Partial<StrategyWorld> = {}): StrategyWorld {
  const base = createBotWorld({ granted: ["rsi", "macd", "ma", "bollinger", "volume"] })
  return {
    ...base,
    savedRevision: 3,
    effectiveRevision: 2,
    effectiveSession: "2026-10-09",
    status: "pending",
    alerts: [], events: [],
    revisions: [3, 2, 1].map((revision) => ({ revision, saved_at: T0, config_hash: `h${revision}`, effective_session: "2026-10-09", status: "effective" as const, legacy: false, outdated: false })),
    runs: [], runResponses: new Map(), nextTrades: 3, nextOpen: false, nextPending: false, marketAvailable: true,
    metrics: metricsFixture(), screenerRuns: new Map(), filters: [], snapshots: [], extraCompanies: 0, marketDataUnavailable: false, truncated: false, basketsUnavailable: [], runDelay: () => 0, runCount: 0,
    ...partial,
  }
}

const url = (path: string) => new URL(path, "http://test")
const notFound = (code: string, message: string) => new FakeApiError(message, 404, { code })

function activeIds(world: StrategyWorld, side: "buy" | "sell"): string[] {
  return Object.entries(world.indicators as Record<string, IndicatorConfig>)
    .filter(([, config]) => config.master_enabled && config[side].enabled)
    .map(([id]) => id)
}

/** The fake `api(path, init)` of every route the Chiến lược page calls; the rest goes to the Bot fake. */
export function createStrategyApi(world: StrategyWorld) {
  const bot = createBotApi(world)
  const results = (id: string) => world.screenerRuns.get(id)
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = init?.method ?? "GET"
    const target = url(path)
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    const key = `${method} ${target.pathname}`
    const override = world.override[key]
    if (override) {
      world.calls.push({ method, path: target.pathname, body })
      return structuredClone(override(body))
    }
    const done = (value: unknown, record = true) => {
      if (record) world.calls.push({ method, path: target.pathname, body, query: target.search })
      return structuredClone(value)
    }
    const segments = target.pathname.split("/").filter(Boolean)

    switch (key) {
      case "GET /instruments": {
        const q = (target.searchParams.get("q") ?? "").toUpperCase()
        const catalog = [{ symbol: "FPT", name: "CTCP FPT", exchange: "HOSE", icbLv1: "Công nghệ" }, { symbol: "VNM", name: "CTCP Sữa Việt Nam", exchange: "HOSE", icbLv1: "Thực phẩm" }, { symbol: "HPG", name: "CTCP Tập đoàn Hòa Phát", exchange: "HOSE", icbLv1: "Tài nguyên" }]
        return done({ data: catalog.filter((item) => item.symbol.includes(q)) }, false)
      }
      case "POST /market-data/trading/price-board": {
        const symbols = (body?.symbols as string[] | undefined) ?? []
        return done(symbols.map((symbol) => ({ symbol, close_price: 62000, reference_price: 61500 })), false)
      }
      case "GET /strategy/alerts": return done({ items: world.alerts })
      case "POST /strategy/alerts": {
        const source = body?.source as { kind: string; revision?: number; run_id?: string }
        const sides = body?.sides as ("buy" | "sell")[]
        const scope = body?.scope as { kind: "symbols"; symbols: string[] } | { kind: "saved_list"; list_id: string; symbols?: string[] }
        if (world.alerts.some((alert) => alert.name === body?.name)) throw new FakeApiError("Tên cảnh báo đã tồn tại.", 409, { code: "ALERT_NAME_TAKEN" })
        const list = scope.kind === "saved_list" ? world.lists.find((item) => item.id === scope.list_id) : null
        const symbols = scope.kind === "symbols" ? scope.symbols : (scope.symbols ?? list?.tickers ?? [])
        const created = alertView({
          id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(world.alerts.length + 2).padStart(12, "0")}`,
          name: String(body?.name), enabled: body?.enabled !== false, status: body?.enabled === false ? "paused" : "unchecked",
          version: {
            ...alertView().version,
            source: source.kind === "shared_config"
              ? { kind: "shared_config", revision: source.revision ?? 1, saved_at: T0, stored_config_hash: "h" }
              : { kind: "backtest_run", run_id: source.run_id ?? RUN_ID, shared_revision: 3, symbol: "FPT", start: "2024-01-02", end: "2025-12-31", run_created_at: T0 },
            scope: scope.kind === "symbols" ? { kind: "symbols" } : { kind: "saved_list", list_id: scope.list_id, list_version: 1, list_name: list?.name ?? "Danh mục", list_as_of: "2026-10-06", list_ticker_count: list?.tickers.length ?? symbols.length },
            symbols, sides,
          },
        })
        world.alerts.push(created)
        return done(alertDetail(created))
      }
      case "POST /strategy/alerts/source-preview": {
        const source = body?.source as { kind: "shared_config"; revision: number } | { kind: "backtest_run"; run_id: string }
        const buy = activeIds(world, "buy")
        const sell = activeIds(world, "sell")
        return done({
          source: source.kind === "shared_config" ? { kind: "shared_config", revision: source.revision, saved_at: T0, stored_config_hash: "h" } : { kind: "backtest_run", run_id: source.run_id, shared_revision: 3, symbol: "FPT", start: "2024-01-02", end: "2025-12-31", run_created_at: T0 },
          config_hash: "h", rule_version: "iqx-rules-3.0", calculation_version: "iqx-ta-2.0",
          sides_detail: { buy: sideDetail(buy), sell: sideDetail(sell) }, suggested_symbol: source.kind === "backtest_run" ? "FPT" : null,
        })
      }
      case "GET /strategy/alerts/events": {
        const side = target.searchParams.get("side")
        const offset = Number(target.searchParams.get("offset") ?? 0)
        const limit = Number(target.searchParams.get("limit") ?? 50)
        const items = world.events.filter((event) => !side || event.side === side)
        return done({ items: items.slice(offset, offset + limit), total: items.length, offset, limit })
      }
      case "GET /strategy/backtests": return done({ items: world.runs })
      case "POST /strategy/backtests": {
        world.runCount += 1
        const assumptions = (body?.assumptions ?? {}) as { execution?: "next_open" | "same_close"; capital?: number }
        const run = runResponse({ trades: world.nextTrades, open: world.nextOpen, pending: world.nextPending, execution: assumptions.execution, symbol: String(body?.symbol), start: String(body?.start), end: String(body?.end), capital: Number(assumptions.capital ?? 100_000_000), revision: Number(body?.shared_revision), marketAvailable: world.marketAvailable, id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(world.runCount).padStart(12, "0")}` })
        world.runResponses.set(run.run_id, run)
        world.runs.unshift(runSummary({ run_id: run.run_id, symbol: String(body?.symbol) }))
        return done(run)
      }
      case "GET /strategy/shared-config/revisions": return done(world.revisions)
      case "GET /strategy/screener/metrics": return done(world.metrics)
      case "POST /strategy/screener/run": {
        const index = world.runCount
        world.runCount += 1
        world.calls.push({ method, path: target.pathname, body })
        const delay = world.runDelay(index)
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
        const definition = body as unknown as Definition
        if (definition.schema_version !== "4.0") throw new FakeApiError("Định nghĩa bộ lọc không hợp lệ.", 422, { code: "VALIDATION_ERROR" })
        if (definition.market.needs_review === "sector") throw new FakeApiError(`Chọn lại ngành: ngành ICB “${definition.market.legacy_sector ?? ""}” của bộ lọc cũ không còn được hỗ trợ.`, 422, { code: "SECTOR_REVIEW_REQUIRED" })
        if (world.marketDataUnavailable) throw new FakeApiError("Chưa có dữ liệu giá ngày đã chốt. Hãy thử lại sau.", 503, { code: "MARKET_DATA_UNAVAILABLE" })
        const universe = [...SYMBOLS, ...Array.from({ length: world.extraCompanies }, (_unused, index) => `SYM${String(index + 1).padStart(3, "0")}`)]
        const scoped = universe.filter((symbol) => inMarketScope(companyOf(symbol), definition.market)).sort()
        const rows = scoped.map((symbol) => rowFor(symbol, definition, world.metrics))
        const needsFundamentals = definition.rules.length > 0 || (definition.columns ?? []).length > 0
        const passed = rows.filter((row) => row.passed).length
        const withExceptions = rows.filter((row) => exceptionOf(row.technical) || (Object.keys(row.metrics).length > 0 && definition.rules.some((rule) => row.metrics[rule.metric_id]?.status !== "ok"))).length
        const resultId = `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, "0")}`
        const specs = [...definition.rules.map((rule) => ({ ...rule, role: "condition" as const })), ...(definition.columns ?? []).map((column) => ({ metric_id: column.metric_id, period: column.period, role: "reference" as const }))]
        const technicalColumns = [...new Set(rows.flatMap((row) => Object.keys(row.technical)))]
        const technicalOf = (key: string) => rows.map((row) => row.technical[key]).find(Boolean)!
        const tally = (values: string[]) => values.reduce<Record<string, number>>((acc, value) => { acc[value] = (acc[value] ?? 0) + 1; return acc }, {})
        const header = {
          schema_version: "4.0" as const, data_mode: "latest_disclosed" as const, as_of: T0, session_date: SESSION, price_source: "DNSE (giá điều chỉnh)", definition, legacy_review: null, data_source: "VCI", calculation_version: "iqx-fund-2.0+tech-1.0", registry_version: "iqx-fund-registry-2.1",
          universe_truncated: world.truncated, fundamental_candidates: needsFundamentals ? (world.truncated ? 812 : rows.filter((row) => Object.keys(row.metrics).length > 0).length) : null,
          provenance_notes: { period_dates: "not_provided_by_source" as const, report_scope: "not_provided_by_source" as const, availability_rule: "Báo cáo chỉ được dùng từ ngày làm việc sau ngày công bố." },
          counts: { universe: rows.length, passed, failed_threshold: rows.length - passed - withExceptions, with_required_exceptions: withExceptions, missing: rows.filter((row) => Object.values(row.metrics).some((item) => item.status === "missing")).length },
          data_quality: {
            market: { universe: universe.length, in_scope: rows.length, excluded_missing: { exchange: 0, basket: 0, statement_group: 0, market_cap: 0, avg_value: 0, close_price: 0 }, baskets_unavailable: world.basketsUnavailable, without_session_bar: 0 },
            metrics: specs.map((spec) => ({ metric_id: spec.metric_id, period_mode: spec.period, role: spec.role, by_status: tally(rows.filter((row) => Object.keys(row.metrics).length > 0).map((row) => row.metrics[spec.metric_id]?.status ?? "missing")), by_reason: {} })),
            technical: technicalColumns.map((key) => {
              const sample = technicalOf(key)
              const statuses = rows.map((row) => row.technical[key]?.status ?? "missing")
              return { key, indicator: sample.indicator, row_id: sample.row_id, label: sample.label, by_status: tally(statuses), by_reason: statuses.includes("missing") ? { insufficient_price_history: statuses.filter((status) => status === "missing").length } : {} }
            }),
          },
        }
        world.screenerRuns.set(resultId, { header: header as never, rows })
        return structuredClone({ result_id: resultId, ...header, results: rows })
      }
      case "POST /strategy/filters": {
        const created = { id: `f0000000-0000-4000-8000-${String(world.filters.length + 1).padStart(12, "0")}`, name: String(body?.name), current_version: 1, version: 1, definition: body?.definition as Definition, stored_schema_version: "4.0", legacy_review: null, sector_review: null, definition_hash: "h", created_at: T0, updated_at: T0 } as FilterView
        world.filters.push(created)
        return done({ ...created, versions: [{ version: 1, definition_hash: "h", created_at: T0 }] })
      }
      case "GET /strategy/filters": return done({ items: world.filters })
      case "GET /strategy/lists": {
        const internal = target.searchParams.get("include_internal") === "true"
        return done({ items: world.lists.filter((list) => internal || list.visibility === "saved") })
      }
      case "POST /strategy/lists/from-result": {
        const stored = results(String(body?.run_id))
        if (!stored) throw notFound("SCREENER_RESULT_NOT_FOUND", "Không tìm thấy kết quả lọc")
        const selection = body?.selection as { mode: "all" } | { mode: "subset"; symbols: string[] }
        const passed = stored.rows.filter((row) => row.passed).map((row) => row.symbol)
        const tickers = selection.mode === "all" ? passed : selection.symbols
        const bad = tickers.filter((symbol) => !passed.includes(symbol))
        if (bad.length) throw new FakeApiError("Có mã không thuộc tập kết quả đã đạt.", 422, { code: "SELECTION_INVALID", details: bad.map((symbol) => ({ symbol, reason: "not_passed" })) })
        const created: ListView = {
          id: `c0000000-0000-4000-8000-${String(world.lists.length + 1).padStart(12, "0")}`, name: String(body?.name), kind: "static_retrospective", filter_id: (body?.filter_id as string | undefined) ?? null, filter_version: (body?.filter_version as number | undefined) ?? null,
          tickers, as_of: "2026-10-08", data_source: "VCI", scope: { market: stored.header.definition.market, session_date: stored.header.session_date, source: "filter_result" }, visibility: (body?.visibility as "saved" | "internal") ?? "saved", result_snapshot_id: null, run_id: String(body?.run_id),
          provenance: { kind: "filter_result", criteria: { market: stored.header.definition.market, technical: stored.header.definition.technical ?? [], rules: stored.header.definition.rules, columns: stored.header.definition.columns ?? [], data_mode: "latest_disclosed" }, session_date: stored.header.session_date }, created_at: T0,
        }
        world.lists.push(created)
        return done(created)
      }
      case "POST /strategy/result-snapshots": {
        const stored = results(String(body?.run_id))
        if (!stored) throw notFound("SCREENER_RESULT_NOT_FOUND", "Không tìm thấy kết quả lọc")
        const selection = body?.selection as { mode: "all" } | { mode: "subset"; symbols: string[] }
        const passed = stored.rows.filter((row) => row.passed)
        const rows = selection.mode === "all" ? passed : passed.filter((row) => selection.symbols.includes(row.symbol))
        const created = {
          id: `50000000-0000-4000-8000-${String(world.snapshots.length + 1).padStart(12, "0")}`, name: String(body?.name), visibility: "saved" as const, run_id: String(body?.run_id), filter_id: null, filter_version: null, definition_hash: "h", as_of: T0, run_at: T0,
          data_source: "VCI", calculation_version: "iqx-fund-2.0+tech-1.0", registry_version: "iqx-fund-registry-2.1", session_date: stored.header.session_date, selection: selection.mode === "all" ? { mode: "all" as const, symbols: [] } : selection, symbols: rows.map((row) => row.symbol), totals: {}, row_count: rows.length, created_at: T0,
          definition: stored.header.definition, rows: rows as unknown as Record<string, unknown>[],
        } as SnapshotView
        world.snapshots.push(created)
        return done(created)
      }
      case "GET /strategy/result-snapshots": return done({ items: world.snapshots })
      default: break
    }

    // Parameterised routes.
    if (segments[0] === "strategy" && segments[1] === "alerts" && segments.length === 3 && segments[2] !== "events") {
      const alert = world.alerts.find((item) => item.id === segments[2])
      if (!alert) throw notFound("ALERT_NOT_FOUND", "Không tìm thấy cảnh báo")
      if (method === "GET") return done(alertDetail(alert))
      if (method === "DELETE") { world.alerts = world.alerts.filter((item) => item.id !== alert.id); return done(undefined) }
      if (method === "PATCH") {
        const next = { ...alert, version: { ...alert.version } } as Alert
        if (typeof body?.name === "string") next.name = body.name
        if (typeof body?.enabled === "boolean") { next.enabled = body.enabled; next.status = body.enabled ? "unchecked" : "paused"; next.paused_at = body.enabled ? null : T0 }
        if (body?.sides || body?.scope || body?.source) {
          if (body.expected_version !== alert.current_version) throw new FakeApiError("Phiên bản cảnh báo đã thay đổi.", 409, { code: "ALERT_VERSION_CONFLICT" })
          next.current_version = alert.current_version + 1
          next.version.version = next.current_version
          if (body.sides) next.version.sides = body.sides as ("buy" | "sell")[]
          const scope = body.scope as { kind: "symbols"; symbols: string[] } | undefined
          if (scope?.kind === "symbols") { next.version.symbols = scope.symbols; next.version.scope = { kind: "symbols" } }
        }
        world.alerts = world.alerts.map((item) => (item.id === alert.id ? next : item))
        return done(alertDetail(next))
      }
    }
    if (segments[0] === "strategy" && segments[1] === "backtests" && segments.length >= 3) {
      const run = world.runResponses.get(segments[2]!)
      if (!run) throw notFound("BACKTEST_RUN_NOT_FOUND", "Không tìm thấy kết quả backtest.")
      if (segments[3] === "trades") {
        const offset = Number(target.searchParams.get("offset") ?? 0)
        const limit = Number(target.searchParams.get("limit") ?? 100)
        return done(tradesPage(run, offset / limit, limit, run.result?.counts.closed_trade_count ?? 0))
      }
      return done(run)
    }
    if (segments[0] === "strategy" && segments[1] === "screener" && segments[2] === "results") {
      const stored = results(segments[3]!)
      if (!stored) throw notFound("SCREENER_RESULT_NOT_FOUND", "Không tìm thấy kết quả lọc")
      const offset = Number(target.searchParams.get("offset") ?? 0)
      const limit = Number(target.searchParams.get("limit") ?? 100)
      const filtered = target.searchParams.get("passed_only") === "true" ? stored.rows.filter((row) => row.passed) : stored.rows
      const rows = sortRows(filtered, target.searchParams.get("sort"), target.searchParams.get("order"))
      return done({ result_id: segments[3], ...stored.header, total: rows.length, offset, limit, results: rows.slice(offset, offset + limit) })
    }
    if (segments[0] === "strategy" && segments[1] === "filters" && segments.length === 3) {
      const filter = world.filters.find((item) => item.id === segments[2])
      if (!filter) throw notFound("FILTER_NOT_FOUND", "Không tìm thấy bộ lọc")
      if (method === "DELETE") { world.filters = world.filters.filter((item) => item.id !== filter.id); return done(undefined) }
      if (method === "PUT") {
        const next = { ...filter, name: String(body?.name ?? filter.name), definition: body?.definition as Definition, current_version: filter.current_version + 1, version: filter.current_version + 1 } as FilterView
        world.filters = world.filters.map((item) => (item.id === filter.id ? next : item))
        return done({ ...next, versions: [] })
      }
      return done({ ...filter, versions: [] })
    }
    if (segments[0] === "strategy" && segments[1] === "lists" && segments.length === 3 && method === "DELETE") {
      world.calls.push({ method, path: target.pathname, body })
      const list = world.lists.find((item) => item.id === segments[2])
      if (!list) throw notFound("LIST_NOT_FOUND", "Không tìm thấy danh sách")
      const universe = world.universe
      const usage = [universe.effective.saved_list_id === list.id ? { role: "effective", revision: universe.effective.revision, status: universe.effective.status, effective_session: universe.effective.effective_session, source_name: universe.effective.name, saved_list_id: list.id } : null, universe.pending?.saved_list_id === list.id ? { role: "pending", revision: universe.pending.revision, status: universe.pending.status, effective_session: universe.pending.effective_session, source_name: universe.pending.name, saved_list_id: list.id } : null].filter(Boolean)
      if (usage.length > 0) throw new FakeApiError("Danh mục đang là nguồn mua của Bot (hoặc đang chờ hiệu lực).", 409, { code: "LIST_IN_USE_BY_BOT", details: usage })
      world.lists = world.lists.filter((item) => item.id !== list.id)
      return structuredClone(undefined)
    }
    if (segments[0] === "strategy" && segments[1] === "lists" && segments.length === 3 && method === "GET") {
      const list = world.lists.find((item) => item.id === segments[2])
      if (!list) throw notFound("LIST_NOT_FOUND", "Không tìm thấy danh sách")
      return done(list)
    }
    if (segments[0] === "strategy" && segments[1] === "result-snapshots" && segments.length === 3) {
      const snapshot = world.snapshots.find((item) => item.id === segments[2])
      if (!snapshot) throw notFound("RESULT_SNAPSHOT_NOT_FOUND", "Không tìm thấy kết quả đã lưu")
      if (method === "DELETE") { world.snapshots = world.snapshots.filter((item) => item.id !== snapshot.id); return done(undefined) }
      return done(snapshot)
    }
    return bot(path, init)
  }
}

export { registryFor, VN30 }
