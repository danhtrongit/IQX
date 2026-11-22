/**
 * In-memory fake of the Bot và Chiến lược v2.0 routes tab Backtest calls (PLAN §6.1, §6.2), for vitest and the
 * Playwright page fake (through `createStrategyApi`). Never imported by production code.
 * Hand-typed per PLAN §6; switch to generated types after contracts regen. The world keeps the view shapes
 * (`RunView`, `RunListItem`) and answers with the wire shapes of the backend zod schemas (`Wire*`).
 */
import type { IndicatorConfig } from "@/pages/demo-trading/bot/config/types"

import type {
  ClosedTrade,
  RunListItem,
  RunRequest,
  RunView,
  StoreMeta,
  StrategyContent,
  StrategyItem,
  StrategyView,
  UniverseOptions,
  VersionDetail,
  VersionItem,
  WireRun,
  WireRunListItem,
  WireTrade,
} from "./api"
import type { BotSchedule, ScheduleImpact as DueImpact } from "../shared/bot-schedule"

export const V2_T0 = "2026-10-08T03:00:00.000Z"
export const VN30_SYMBOLS = ["ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "MBB", "MSN", "MWG", "PLX", "POW", "SAB", "SHB", "SSB", "SSI", "STB", "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE"]
export const VN100_SYMBOLS = [...VN30_SYMBOLS, "CMG", "DGC", "DIG", "DXG", "GEX", "HCM", "KDH", "NLG", "PDR", "VND"]

export type V2Strategy = { item: StrategyItem; versions: (VersionDetail & { universe_label: string; max_holding: number })[] }

export type BacktestV2World = {
  storeMeta: StoreMeta
  universeOptions: UniverseOptions
  strategies: V2Strategy[]
  strategyLimit: number
  v2Runs: Map<string, RunView>
  v2RunList: RunListItem[]
  v2RunCount: number
  /** Closed trades of the next run (half of them sold by Giữ tối đa). */
  v2NextTrades: number
  schedule: BotSchedule
  /** Positions that become due when the Bot changes strategy (§6.5); empty = none. */
  dueImpact: DueImpact
  iqxVersions: Record<string, { version: number; published_at: string; reason: string }[]>
  /** Answer the next v2 run with this error (code, status). */
  v2RunError: { status: number; code: string; message: string } | null
}

const SCHEDULE_CONTENT = { universe: { type: "vn30" as const }, indicators: {}, max_holding: 30 }

export function createBacktestV2World(partial: Partial<BacktestV2World> = {}): BacktestV2World {
  return {
    storeMeta: {
      data_store: "flashback_vn100",
      data_as_of: "2026-10-07",
      earliest_start: "2019-01-02",
      price_unit: "VND",
      adjusted: true,
      sessions: 2400,
      default_start: "2024-10-07",
      default_end: "2026-10-07",
      max_range_days: 3653,
    },
    universeOptions: {
      vn30: { symbols: VN30_SYMBOLS },
      vn100: { symbols: VN100_SYMBOLS },
      saved_lists: [{ id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", name: "Tăng trưởng Q3", symbols_total: 5, symbols_kept: ["FPT", "HPG", "MBB", "CMG"], excluded: ["XYZ"] }],
    },
    strategies: [],
    strategyLimit: 20,
    v2Runs: new Map(),
    v2RunList: [],
    v2RunCount: 0,
    v2NextTrades: 4,
    schedule: {
      last: { session_date: "2026-10-07", source: "iqx", id: "iqx-none", name: "VN30 · Xu hướng", version: 1, version_label: "v1", hidden: false, content: SCHEDULE_CONTENT },
      next: { session_date: "2026-10-08", source: "iqx", id: "iqx-none", name: "VN30 · Xu hướng", version: 1, version_label: "v1", hidden: false, content: SCHEDULE_CONTENT, follow_latest: false, cutoff_at: "2026-10-08T07:45:00.000Z" },
      iqx_update: null,
    },
    dueImpact: { next_session: "2026-10-08", n_current: 30, n_new: 30, positions: [] },
    iqxVersions: {},
    v2RunError: null,
    ...partial,
  }
}

type FakeError = new (message: string, status: number, body: { code: string; details?: unknown }) => Error

const universeLabelOf = (content: StrategyContent) =>
  content.universe.type === "saved_list" ? `${content.universe.list_name} (${content.universe.symbols.length} mã)` : content.universe.type === "vn100" ? "VN100" : "VN30"

function symbolsOf(world: BacktestV2World, content: StrategyContent): string[] {
  const universe = content.universe
  if (universe.type === "saved_list") return universe.symbols
  return universe.type === "vn100" ? world.universeOptions.vn100.symbols : world.universeOptions.vn30.symbols
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** A deterministic basket run: a gentle curve, `trades` closed trades on the first symbols, one open position. */
export function v2RunView(options: { id: string; content: StrategyContent; start: string; end: string; symbols: string[]; trades: number; ref: RunView["snapshot"]["strategy_ref"]; label?: string; versionLabel?: string | null }): RunView {
  const { content, start, end, symbols } = options
  const points = 30
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000))
  const curve = Array.from({ length: points }, (_unused, index) => {
    const date = index === points - 1 ? end : addDays(start, Math.floor((span * index) / (points - 1)))
    return { date, strategy: +(index * 0.6).toFixed(2), basket: +(index * 0.4).toFixed(2), vnindex: +(index * 0.3).toFixed(2) }
  })
  const trades = buildTrades(symbols, content, curve, options.trades)
  return {
    run_id: options.id,
    status: "succeeded",
    created_at: V2_T0,
    strategy_label: options.label ?? null,
    version_label: options.versionLabel ?? null,
    snapshot: {
      strategy_ref: options.ref,
      universe_label: universeLabelOf(content),
      content,
      config_hash: "h",
      universe_resolved: symbols,
      excluded_symbols: [],
      data_store: "vn100",
      data_as_of: "2026-10-07",
      price_unit: "VND",
      adjusted: true,
      rules_version: "iqx-bot-v2.0",
      warnings: content.universe.type === "saved_list" ? [{ code: "UNIVERSE_SNAPSHOT", message: "Danh mục đã lưu: danh sách mã được chép vào chiến lược khi lưu và dùng cho cả quá khứ." }] : [{ code: "UNIVERSE_CURRENT_MEMBERS", message: "Rổ dùng thành phần hiện tại cho cả quá khứ (chưa có dữ liệu thành phần rổ theo thời điểm). Kết quả có thể đẹp hơn thực tế." }],
      start,
      end,
      sessions: 480,
      capital: 100_000_000,
    },
    kpis: { total_return: 17.4, annualized_return: 8.4, max_drawdown: -6.2, closed_trades: trades.length, win_rate: trades.length ? 62.5 : null, basket_buy_hold: 11.6, vnindex: 8.7 },
    curve,
    per_symbol: [...new Set(trades.map((trade) => trade.symbol))].map((symbol) => ({ symbol, closed_trades: trades.filter((trade) => trade.symbol === symbol).length, wins: 1, realized_pnl: 400_000, unrealized_pnl: null, contribution_pct: 0.4 })),
    open_positions: symbols.length > 3 ? [{ symbol: symbols[3]!, entry_date: curve[points - 4]!.date, entry_price: 30_000, quantity: 300, last_price: 31_000, held_sessions: 3, max_holding: content.max_holding, unrealized_pnl: 300_000, unrealized_pct: 3.3 }] : [],
    final_cash: 81_000_000,
    skipped_orders: { counts: { session_buy_limit: 3 }, total: 3, items: [{ date: curve[2]!.date, symbol: symbols[4] ?? "VNM", code: "session_buy_limit", reason: "Quá 2 lệnh mua/phiên" }] },
    basket_buy_hold: { return_pct: 11.6 },
    trades_total: trades.length,
    time_exit_count: trades.filter((trade) => trade.exit_reason === "max_holding").length,
    trades,
  }
}

const money = (value: number | null | undefined) => String(Math.round(value ?? 0))

function wireTrade(trade: ClosedTrade): WireTrade {
  const gross = trade.exit_price * trade.quantity
  return {
    symbol: trade.symbol,
    qty: trade.quantity,
    entry_session: trade.entry_date,
    entry_price_vnd: money(trade.entry_price),
    entry_cost_vnd: money(trade.entry_price * trade.quantity),
    exit_session: trade.exit_date,
    price_vnd: money(trade.exit_price),
    gross_vnd: money(gross),
    fee_vnd: "0",
    tax_vnd: "0",
    net_vnd: money(gross),
    pnl_vnd: money(trade.pnl),
    pnl_pct: trade.pnl_pct,
    exit_reason: trade.exit_reason,
    exit_reasons: trade.exit_reasons,
    holding_sessions: trade.holding_sessions,
    counted_sessions: trade.holding_sessions,
    max_holding_at_exit: trade.max_holding_at_exit,
  }
}

/** The view run as `GET /strategy/backtests/:id` answers it. */
export function wireRun(run: RunView): WireRun {
  const { snapshot } = run
  return {
    run_id: run.run_id,
    status: run.status,
    legacy: false,
    trial: run.trial ?? false,
    created_at: run.created_at,
    snapshot: {
      strategy_ref: snapshot.strategy_ref,
      strategy_label: run.strategy_label ?? "Bản nháp",
      version_label: run.version_label ?? null,
      result_label: `Kết quả · ${run.strategy_label ?? "Bản nháp"}`,
      subtitle: "",
      content: snapshot.content as unknown as Record<string, unknown>,
      config_hash: "a".repeat(64),
      universe_label: snapshot.universe_label,
      universe_resolved: snapshot.universe_resolved,
      excluded_symbols: snapshot.excluded_symbols,
      requested_start: snapshot.start,
      requested_end: snapshot.end,
      data_store: snapshot.data_store,
      data_as_of: snapshot.data_as_of,
      data_hash: "d",
      price_unit: "VND",
      adjusted: snapshot.adjusted,
      rules_version: snapshot.rules_version,
      fee_rules: { buy_fee_bps: 15, sell_fee_bps: 15, sell_tax_bps: 10, lot_size: 100 },
      initial_cash_vnd: money(snapshot.capital),
      warnings: snapshot.warnings,
    },
    result: {
      sessions: snapshot.sessions,
      start_session: snapshot.start,
      end_session: snapshot.end,
      initial_cash_vnd: money(snapshot.capital),
      final_nav_vnd: money(snapshot.capital * (1 + run.kpis.total_return / 100)),
      cash_end_vnd: money(run.final_cash),
      kpis: {
        total_return_pct: run.kpis.total_return,
        annualized_return_pct: run.kpis.annualized_return,
        max_drawdown_pct: run.kpis.max_drawdown,
        closed_trades: run.kpis.closed_trades,
        win_rate_pct: run.kpis.win_rate,
        basket_buy_hold_pct: run.kpis.basket_buy_hold ?? 0,
        vnindex_pct: run.kpis.vnindex,
      },
      curve: run.curve.map((point) => ({ date: point.date, nav_vnd: money(snapshot.capital * (1 + point.strategy / 100)), strategy: point.strategy, basket: point.basket ?? 0, vnindex: point.vnindex })),
      trades: run.trades.map(wireTrade),
      time_exits: run.time_exit_count,
      per_symbol: run.per_symbol.map((row) => ({ symbol: row.symbol, closed_trades: row.closed_trades, wins: row.wins, realized_pnl_vnd: money(row.realized_pnl), unrealized_pnl_vnd: money(row.unrealized_pnl), contribution_pct: row.contribution_pct })),
      open_positions: run.open_positions.map((row) => ({
        symbol: row.symbol,
        entry_session: row.entry_date,
        entry_price_vnd: money(row.entry_price),
        qty: row.quantity,
        last_close_vnd: money(row.last_price),
        holding_sessions: row.held_sessions,
        counted_sessions: row.held_sessions,
        max_holding: row.max_holding,
        unrealized_pnl_vnd: money(row.unrealized_pnl),
        unrealized_pct: row.unrealized_pct,
      })),
      skipped_orders: {
        counts: { session_buy_limit: run.skipped_orders.total ?? run.skipped_orders.items.length },
        total: run.skipped_orders.total ?? run.skipped_orders.items.length,
        items: run.skipped_orders.items.map((item) => ({ date: item.date, symbol: item.symbol, code: item.code ?? "session_buy_limit", message: item.reason })),
      },
      basket_buy_hold: { symbols: snapshot.universe_resolved, return_pct: run.basket_buy_hold?.return_pct ?? 0 },
    },
    legacy_view: null,
    error: null,
  }
}

function wireListItem(item: RunListItem): WireRunListItem {
  const { total_return, max_drawdown, closed_trades } = item.kpis
  return {
    run_id: item.run_id,
    created_at: item.created_at,
    legacy: item.legacy,
    status: item.status ?? "succeeded",
    strategy_source: item.legacy ? null : (item.strategy_source ?? null),
    strategy_id: item.strategy_id ?? null,
    strategy_version: null,
    strategy_label: item.strategy_label,
    version_label: item.version_label,
    universe_label: item.universe_label,
    start: item.start,
    end: item.end,
    config_hash: "a".repeat(64),
    kpis: total_return === null ? null : { total_return_pct: total_return, max_drawdown_pct: max_drawdown ?? 0, closed_trades: closed_trades ?? 0 },
  }
}

/** Handles a v2 route, or returns `undefined` so the caller goes on with the older fakes. */
export function handleBacktestV2(
  world: BacktestV2World & { iqx: { strategy: { id: string; version: number; content: { name: string; definition: unknown } }[] } },
  request: { method: string; segments: string[]; search: URLSearchParams; body: Record<string, unknown> | null },
  ApiError: FakeError,
): { value: unknown } | undefined {
  const { method, segments, search, body } = request
  const ok = (value: unknown) => ({ value: structuredClone(value) })
  const path = segments.join("/")
  const strategyOf = (id: string) => {
    const found = world.strategies.find((entry) => entry.item.id === id)
    if (!found) throw new ApiError("Không tìm thấy chiến lược", 404, { code: "STRATEGY_NOT_FOUND" })
    return found
  }
  const isOnBot = (id: string) => [world.schedule.last, world.schedule.next].some((entry) => entry?.source === "user" && entry.id === id)
  const nameOf = (source: string | null | undefined, id: string | null | undefined) =>
    source === "user" ? (world.strategies.find((entry) => entry.item.id === id)?.item.name ?? null) : (world.iqx.strategy.find((entry) => entry.id === id)?.content.name ?? null)

  /** §6.5: a change of the Bot's next strategy with due positions needs their symbols in `confirm_due_positions`. */
  function checkDue(confirm: unknown) {
    const due = world.dueImpact.positions
    if (due.length === 0) return
    const sent = Array.isArray(confirm) ? (confirm as string[]) : null
    if (!sent) throw new ApiError("Cần xác nhận các vị thế đến hạn.", 422, { code: "DUE_CONFIRM_REQUIRED", details: world.dueImpact })
    if (sent.slice().sort().join(",") !== due.map((item) => item.symbol).sort().join(",")) {
      throw new ApiError("Danh sách vị thế đến hạn đã thay đổi.", 409, { code: "DUE_POSITIONS_CHANGED", details: world.dueImpact })
    }
  }
  function setNext(source: "user" | "iqx", id: string, version: number | null, versionLabel: string | null) {
    const next = world.schedule.next
    world.schedule = {
      ...world.schedule,
      next: { session_date: next.session_date, follow_latest: source === "user", cutoff_at: next.cutoff_at, source, id, version: version ?? 1, version_label: versionLabel ?? "", name: nameOf(source, id) ?? "", hidden: false, content: SCHEDULE_CONTENT },
    }
  }
  function applyNext(id: string, version: Pick<VersionDetail, "version" | "created_at">) {
    if (body?.apply_next !== true && !(world.schedule.next.source === "user" && world.schedule.next.id === id)) return
    if (body?.apply_next === true) checkDue(body.confirm_due_positions)
    setNext("user", id, version.version, `bản ${version.created_at.slice(8, 10)}/${version.created_at.slice(5, 7)}`)
  }
  function addVersion(entry: V2Strategy, content: StrategyContent, note: string | null): V2Strategy["versions"][number] {
    const number = entry.versions.length + 1
    const created_at = new Date(Date.parse(V2_T0) + number * 60_000).toISOString()
    const versionLabel = `bản ${created_at.slice(8, 10)}/${created_at.slice(5, 7)} ${created_at.slice(11, 16)}`
    const version = { strategy_id: entry.item.id, name: entry.item.name, version: number, version_label: versionLabel, content, config_hash: `h${number}`, created_at, note, from_run_id: typeof body?.from_run_id === "string" ? body.from_run_id : null, universe_label: universeLabelOf(content), max_holding: content.max_holding }
    entry.versions.push(version)
    entry.item = { ...entry.item, latest_version: number, latest_saved_at: created_at, universe_label: universeLabelOf(content), universe_count: symbolsOf(world, content).length }
    return version
  }
  const versionItem = (entry: V2Strategy, version: V2Strategy["versions"][number]): VersionItem => ({
    version: version.version,
    created_at: version.created_at,
    version_label: version.version_label,
    from_run_id: version.from_run_id,
    note: version.note,
    universe_label: version.universe_label,
    max_holding: version.max_holding,
    on_bot: {
      last: world.schedule.last?.source === "user" && world.schedule.last.id === entry.item.id && world.schedule.last.version === version.version,
      next: world.schedule.next.source === "user" && world.schedule.next.id === entry.item.id && world.schedule.next.version === version.version,
    },
  })
  const strategyView = (entry: V2Strategy): StrategyView => ({ id: entry.item.id, name: entry.item.name, latest_version: entry.item.latest_version, sell_only: entry.item.sell_only, created_at: V2_T0, updated_at: entry.item.latest_saved_at })
  const detailOf = (version: V2Strategy["versions"][number]): VersionDetail => {
    return { strategy_id: version.strategy_id, name: version.name, version: version.version, version_label: version.version_label, content: version.content, config_hash: version.config_hash, created_at: version.created_at, note: version.note, from_run_id: version.from_run_id }
  }
  const listItem = (entry: V2Strategy): StrategyItem => ({
    ...entry.item,
    on_bot: {
      last: world.schedule.last?.source === "user" && world.schedule.last.id === entry.item.id,
      next: world.schedule.next.source === "user" && world.schedule.next.id === entry.item.id,
    },
  })
  function requireRun(content: StrategyContent) {
    const run = world.v2Runs.get(String(body?.from_run_id))
    if (!run || JSON.stringify(run.snapshot.content) !== JSON.stringify(content)) throw new ApiError("Bấm Chạy trước khi Lưu.", 422, { code: "RUN_REQUIRED" })
  }

  if (path === "strategy/store/meta" && method === "GET") return ok(world.storeMeta)
  if (path === "strategy/universe-options" && method === "GET") return ok(world.universeOptions)
  if (path === "bot/schedule" && method === "GET") return ok(world.schedule)
  if (path === "bot/schedule/next/impact" && method === "GET") return ok(world.dueImpact)
  if (path === "bot/schedule/next" && method === "PUT") {
    checkDue(body?.confirm_due_positions)
    const source = body?.source as "user" | "iqx"
    const id = String(body?.id)
    const version = source === "user" ? (strategyOf(id).versions.at(-1)?.version ?? null) : (world.iqx.strategy.find((item) => item.id === id)?.version ?? null)
    setNext(source, id, version, source === "iqx" ? `v${version}` : null)
    return ok(world.schedule)
  }

  if (path === "strategy/strategies" && method === "GET") return ok({ items: world.strategies.map(listItem), limit: world.strategyLimit })
  if (path === "strategy/strategies" && method === "POST") {
    const name = String(body?.name ?? "").trim()
    const content = body?.content as StrategyContent
    if (world.strategies.length >= world.strategyLimit) throw new ApiError("Đã đủ chiến lược.", 409, { code: "STRATEGY_LIMIT" })
    if (world.strategies.some((entry) => entry.item.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) throw new ApiError("Tên đã có.", 409, { code: "STRATEGY_NAME_TAKEN" })
    requireRun(content)
    const id = `a2000000-0000-4000-8000-${String(world.strategies.length + 1).padStart(12, "0")}`
    const entry: V2Strategy = { item: { id, name, latest_version: 0, latest_saved_at: V2_T0, universe_label: "", universe_count: 0, sell_only: false, on_bot: { last: false, next: false } }, versions: [] }
    const version = addVersion(entry, content, null)
    if (body?.apply_next === true) checkDue(body.confirm_due_positions)
    world.strategies.push(entry)
    if (body?.apply_next === true) applyNext(id, version)
    return ok({ strategy: strategyView(entry), version: detailOf(version), schedule: null })
  }
  if (segments[0] === "strategy" && segments[1] === "strategies" && segments[2]) {
    const entry = strategyOf(segments[2])
    if (segments.length === 3 && method === "DELETE") {
      if (isOnBot(entry.item.id)) throw new ApiError("Đang dùng trên Bot.", 409, { code: "STRATEGY_IN_USE" })
      world.strategies = world.strategies.filter((item) => item !== entry)
      return ok(undefined)
    }
    if (segments[3] === "versions" && segments.length === 4 && method === "GET") {
      return ok({ strategy_id: entry.item.id, name: entry.item.name, latest_version: entry.item.latest_version, items: entry.versions.map((version) => versionItem(entry, version)).reverse() })
    }
    if (segments[3] === "versions" && segments.length === 4 && method === "POST") {
      if (body?.expected_latest_version !== entry.item.latest_version) throw new ApiError("Đã có bản mới hơn.", 409, { code: "STRATEGY_VERSION_CONFLICT" })
      const content = body?.content as StrategyContent
      requireRun(content)
      if (body?.apply_next === true) checkDue(body.confirm_due_positions)
      const version = addVersion(entry, content, null)
      applyNext(entry.item.id, version)
      return ok({ strategy: strategyView(entry), version: detailOf(version), schedule: null })
    }
    if (segments[3] === "versions" && segments[4]) {
      const version = entry.versions.find((item) => item.version === Number(segments[4]))
      if (!version) throw new ApiError("Không tìm thấy bản", 404, { code: "STRATEGY_VERSION_NOT_FOUND" })
      if (segments.length === 5 && method === "GET") return ok(detailOf(version))
      if (segments[5] === "restore" && method === "POST") {
        if (body?.expected_latest_version !== entry.item.latest_version) throw new ApiError("Đã có bản mới hơn.", 409, { code: "STRATEGY_VERSION_CONFLICT" })
        if (body?.apply_next === true) checkDue(body.confirm_due_positions)
        const restored = addVersion(entry, structuredClone(version.content), `Khôi phục từ bản ${version.created_at.slice(8, 10)}/${version.created_at.slice(5, 7)}`)
        applyNext(entry.item.id, restored)
        return ok({ strategy: strategyView(entry), version: detailOf(restored), schedule: null })
      }
    }
  }

  if (segments[0] === "strategy" && segments[1] === "iqx-templates" && segments[2] && segments[3] === "versions") {
    const item = world.iqx.strategy.find((entry) => entry.id === segments[2])
    const versions = world.iqxVersions[segments[2]] ?? (item ? [{ version: item.version, published_at: V2_T0, reason: "Bản đầu" }] : [])
    const current = item?.version ?? versions.at(-1)?.version ?? 1
    const onBot = {
      last: world.schedule.last?.source === "iqx" && world.schedule.last.id === segments[2],
      next: world.schedule.next.source === "iqx" && world.schedule.next.id === segments[2],
    }
    if (segments.length === 4 && method === "GET") {
      const items = versions.map((version) => ({ ...version, current: version.version === current })).reverse()
      return ok({ id: segments[2], slug: segments[2], name: item?.content.name ?? "", current_version: current, hidden: !item, on_bot: onBot, items })
    }
    if (segments.length === 5 && method === "GET") {
      if (!item) throw new ApiError("Không tìm thấy", 404, { code: "IQX_TEMPLATE_NOT_FOUND" })
      const definition = item.content.definition as { universe?: { type: "vn30" | "vn100" } | null; max_holding?: number | null; indicators: Record<string, IndicatorConfig> }
      const published = versions.find((version) => version.version === Number(segments[4]))
      return ok({
        id: item.id,
        slug: item.id,
        version: Number(segments[4]),
        current_version: current,
        hidden: false,
        published_at: published?.published_at ?? V2_T0,
        reason: published?.reason ?? "Bản đầu",
        content: item.content,
        strategy_content: { universe: definition.universe ?? { type: "vn30" }, indicators: definition.indicators, max_holding: definition.max_holding ?? 30 },
      })
    }
  }

  if (path === "strategy/backtests" && method === "POST" && body && "strategy" in body) {
    if (world.v2RunError) {
      const error = world.v2RunError
      world.v2RunError = null
      throw new ApiError(error.message, error.status, { code: error.code })
    }
    const sent = body as unknown as RunRequest
    world.v2RunCount += 1
    const id = `b2000000-0000-4000-8000-${String(world.v2RunCount).padStart(12, "0")}`
    let content: StrategyContent
    let label: string
    let versionLabel: string | null = null
    const ref = sent.strategy
    if (ref.source === "draft") {
      content = ref.content
      label = ref.base ? `Bản nháp · sửa từ ${nameOf("user", ref.base.id) ?? "chiến lược"}` : "Bản nháp"
    } else if (ref.source === "user") {
      const entry = strategyOf(ref.id)
      const version = ref.version ?? entry.item.latest_version
      content = entry.versions.find((item) => item.version === version)!.content
      label = entry.item.name
      versionLabel = `bản ${version}`
    } else {
      const item = world.iqx.strategy.find((entry) => entry.id === ref.id)
      if (!item) throw new ApiError("Không tìm thấy", 404, { code: "IQX_TEMPLATE_NOT_FOUND" })
      const definition = item.content.definition as { universe?: StrategyContent["universe"] | null; max_holding?: number | null; indicators: Record<string, IndicatorConfig> }
      content = { universe: definition.universe ?? { type: "vn30" }, max_holding: definition.max_holding ?? 30, indicators: definition.indicators }
      label = `Chiến lược IQX · ${item.content.name}`
      versionLabel = `v${ref.version ?? item.version}`
    }
    const symbols = symbolsOf(world, content)
    if (symbols.length === 0) throw new ApiError("Danh mục này không có mã nào thuộc VN100.", 422, { code: "UNIVERSE_EMPTY" })
    const strategyRef = ref.source === "draft" ? { source: "draft" as const, id: ref.base?.id ?? null, version: ref.base?.version ?? null } : { source: ref.source, id: ref.id, version: ref.version ?? null }
    const run = v2RunView({ id, content, start: sent.start, end: sent.end, symbols, trades: world.v2NextTrades, ref: strategyRef, label, versionLabel })
    if (sent.trial === true) return ok({ ...wireRun(run), trial: true })
    world.v2Runs.set(id, run)
    world.v2RunList.unshift({
      run_id: id,
      created_at: run.created_at,
      legacy: false,
      strategy_source: ref.source,
      strategy_id: ref.source === "draft" ? (ref.base?.id ?? null) : ref.id,
      strategy_label: label,
      version_label: versionLabel,
      universe_label: universeLabelOf(content),
      start: sent.start,
      end: sent.end,
      kpis: { total_return: run.kpis.total_return, max_drawdown: run.kpis.max_drawdown, closed_trades: run.kpis.closed_trades },
    })
    return ok(wireRun(run))
  }
  if (path === "strategy/backtests" && method === "GET" && (search.has("strategy_source") || world.v2RunList.length > 0)) {
    const source = search.get("strategy_source")
    const id = search.get("strategy_id")
    const items = world.v2RunList.filter((item) => item.legacy || !source || ((item.strategy_source === source || (source === "draft" && item.strategy_source === "draft")) && (item.strategy_id ?? null) === (id || null)))
    return ok({ items: items.map(wireListItem) })
  }
  if (segments[0] === "strategy" && segments[1] === "backtests" && segments[2] && world.v2Runs.has(segments[2])) {
    const run = world.v2Runs.get(segments[2])!
    if (segments.length === 3 && method === "GET") return ok(wireRun(run))
    if (segments[3] === "trades" && method === "GET") {
      const offset = Number(search.get("offset") ?? 0)
      const limit = Number(search.get("limit") ?? 20)
      return ok({ run_id: run.run_id, total: run.trades.length, offset, limit, time_exits: run.time_exit_count, items: run.trades.slice(offset, offset + limit).map(wireTrade) })
    }
  }
  // Daily closes for the Biểu đồ mã (the run's markers are drawn over them).
  if (segments[0] === "market-data" && segments[1] === "quotes" && segments[3] === "ohlcv" && method === "GET") {
    const start = search.get("start") ?? "2024-10-07"
    return ok({ data: Array.from({ length: 30 }, (_unused, index) => ({ time: addDays(start, index * 20), close: 50_000 + index * 300 })) })
  }
  return undefined
}

/** Closed trades of a fake run (one builder, so the run, the pages and the symbol chart agree). */
function buildTrades(symbols: string[], content: StrategyContent, curve: { date: string }[], count: number): ClosedTrade[] {
  const points = curve.length
  return Array.from({ length: count }, (_unused, index) => {
    const timeExit = index % 2 === 1
    return {
      symbol: symbols[index % Math.max(1, Math.min(3, symbols.length))] ?? "FPT",
      entry_date: curve[Math.min(points - 3, index * 2)]!.date,
      entry_price: 50_000 + index * 1000,
      quantity: 200,
      exit_date: curve[Math.min(points - 2, index * 2 + 1)]!.date,
      exit_price: 52_000 + index * 1000,
      holding_sessions: timeExit ? content.max_holding : 5,
      exit_reason: timeExit ? ("max_holding" as const) : ("indicator" as const),
      exit_reasons: timeExit ? ["max_holding" as const] : ["indicator" as const],
      max_holding_at_exit: content.max_holding,
      pnl: 400_000,
      pnl_pct: 4,
    }
  })
}
