/**
 * Fakes shared by the Bot tests: a registry of the 16 indicators (real shape, simplified
 * rules except for the interesting ones) and a stateful in-memory fake of the v2 routes the
 * Bot tool calls. Not imported by production code.
 */
import type {
  BotConditions,
  BotOverview,
  BotPosition,
  BotSession,
  BotSessionDecision,
  BotTrade,
  SavedList,
  UniverseRequest,
  UniverseState,
} from "./types"
import type { CrossField, IndicatorConfig, RegistryField, Rule, SharedConfigState, TechnicalIndicator, TechnicalRegistry } from "./config/types"

export class FakeApiError extends Error {
  status: number
  code?: string
  details?: unknown
  constructor(message: string, status: number, options?: { code?: string; details?: unknown }) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = options?.code
    this.details = options?.details
  }
}

/* ── Registry ───────────────────────────────────────────────────────────── */

const field = (key: string, label: string, min: number, max: number, step = 1, unit = "phiên", type: RegistryField["type"] = "integer"): RegistryField => ({
  key, label, type, min, max, step, unit, api_scale: 1, wire_unit: unit,
})
const series = (key: string, offset = 0) => ({ kind: "series" as const, key, offset })
const compare = (id: string, lhs: ReturnType<typeof series> | { kind: "param"; key: string }, op: ">" | "<", rhs: ReturnType<typeof series> | { kind: "param"; key: string }): Rule => ({
  id, kind: "compare", lhs, op, rhs, allowed_ops: [">", "<"],
})

type IndicatorOptions = {
  family?: "state" | "event"
  /** Published `validation.cross_fields`; none when omitted (as for most indicators). */
  crossFields?: CrossField[]
  buyOverrides?: Record<string, Partial<RegistryField>>
  sellOverrides?: Record<string, Partial<RegistryField>>
  sellParams?: Record<string, number>
}

function indicator(
  id: string, name: string, chapter: number, lessonNumber: number,
  fields: RegistryField[], params: Record<string, number>,
  buyRules: Rule[], sellRules: Rule[],
  options: IndicatorOptions = {},
): TechnicalIndicator {
  return {
    id, name, chapter, lesson_id: `ch${String(chapter).padStart(2, "0")}-l${String(lessonNumber).padStart(2, "0")}`,
    family: options.family ?? "state", formula: "", availability: "ohlcv", fields, learned: false,
    validation: { cross_fields: options.crossFields ?? [] },
    buy: { enabled: false, params: { ...params }, rules: buyRules, ...(options.buyOverrides ? { field_overrides: options.buyOverrides } : {}) },
    sell: { enabled: false, params: { ...(options.sellParams ?? params) }, rules: sellRules, ...(options.sellOverrides ? { field_overrides: options.sellOverrides } : {}) },
  }
}

const simple = (id: string, name: string, chapter: number, lessonNumber: number) =>
  indicator(id, name, chapter, lessonNumber, [field("period", "Chu kỳ", 5, 100)], { period: 20 },
    [compare("r1", series("close"), ">", series("value"))], [compare("r1", series("close"), "<", series("value"))])

export function buildRegistry(): TechnicalIndicator[] {
  const bollingerBuy: Rule[] = [
    compare("r1", series("close", -1), "<", series("lower", -1)),
    { id: "r2", kind: "membership", lhs: series("close"), op: "∈", rhs: { kind: "interval", lower: series("lower"), upper: series("upper"), bounds: "open" }, allowed_ops: ["∈", "∉"] },
    compare("r3", series("close"), ">", series("close", -1)),
  ]
  const bollingerSell: Rule[] = [
    compare("r1", series("close", -1), ">", series("upper", -1)),
    { id: "r2", kind: "membership", lhs: series("close"), op: "∈", rhs: { kind: "interval", lower: series("lower"), upper: series("upper"), bounds: "open" }, allowed_ops: ["∈", "∉"] },
    compare("r3", series("close"), "<", series("close", -1)),
  ]
  return [
    indicator("rsi", "RSI", 1, 1, [field("period", "Chu kỳ RSI", 5, 50), field("level", "Ngưỡng RSI", 10, 90, 1, "")], { period: 14, level: 30 },
      [compare("r1", series("value", -1), "<", { kind: "param", key: "level" }), compare("r2", series("value"), ">", series("value", -1))],
      [compare("r1", series("value", -1), ">", { kind: "param", key: "level" }), compare("r2", series("value"), "<", series("value", -1))],
      { sellParams: { period: 14, level: 70 }, buyOverrides: { level: { label: "Ngưỡng quá bán", min: 10, max: 49 } }, sellOverrides: { level: { label: "Ngưỡng quá mua", min: 51, max: 90 } } }),
    indicator("macd", "MACD", 1, 2, [field("fast", "Chu kỳ EMA nhanh", 2, 50), field("slow", "Chu kỳ EMA chậm", 5, 100), field("signal", "Chu kỳ đường tín hiệu", 2, 30)], { fast: 12, slow: 26, signal: 9 },
      [compare("r1", series("value"), ">", series("signal"))], [compare("r1", series("value"), "<", series("signal"))],
      { crossFields: [{ left: "fast", op: "<", right: "slow" }] }),
    indicator("ma", "MA / SMA", 1, 3, [field("period", "Chu kỳ SMA", 5, 200)], { period: 20 },
      [compare("r1", series("close"), ">", series("value"))], [compare("r1", series("close"), "<", series("value"))]),
    indicator("bollinger", "Bollinger Bands", 1, 4, [field("period", "Chu kỳ Bollinger", 10, 100), field("k", "Hệ số dải", 1, 3.5, 0.1, "", "number")], { period: 20, k: 2 }, bollingerBuy, bollingerSell),
    indicator("volume", "Khối lượng", 1, 5, [field("lookback", "Số phiên tham chiếu", 5, 100), field("mult", "Hệ số khối lượng", 0.5, 3, 0.1, "lần", "number")], { lookback: 20, mult: 1 },
      [compare("r1", series("close"), ">", series("close", -1)), compare("r2", series("volume"), ">", series("threshold"))],
      [compare("r1", series("close"), "<", series("close", -1)), compare("r2", series("volume"), ">", series("threshold"))]),
    simple("ema", "EMA", 5, 1),
    indicator("ma_cross", "MA Cross", 5, 2, [field("fast", "Chu kỳ SMA nhanh", 5, 100), field("slow", "Chu kỳ SMA chậm", 10, 250)], { fast: 20, slow: 50 },
      [{ id: "r1", kind: "cross", lhs: series("fast"), op: ">", rhs: series("slow"), allowed_ops: [">", "<"] }],
      [{ id: "r1", kind: "cross", lhs: series("fast"), op: "<", rhs: series("slow"), allowed_ops: [">", "<"] }],
      { family: "event", crossFields: [{ left: "fast", op: "<", right: "slow" }] }),
    simple("dmi", "DMI", 5, 3),
    simple("stochastic", "Stochastic", 5, 4),
    simple("cci", "CCI", 5, 5),
    simple("obv", "OBV", 7, 1),
    simple("mfi", "MFI", 7, 2),
    simple("cmf", "Chaikin Money Flow", 7, 3),
    simple("donchian", "Donchian Channel", 10, 1),
    simple("roc", "ROC", 10, 2),
    simple("williams_r", "Williams %R", 10, 3),
  ]
}

export function registryFor(granted: readonly string[]): TechnicalRegistry {
  return {
    calculation_version: "iqx-ta-2.0",
    rule_version: "iqx-rules-3.0",
    indicators: buildRegistry().map((entry) => ({ ...entry, learned: granted.includes(entry.id) })),
  }
}

/* ── World ──────────────────────────────────────────────────────────────── */

export type Call = { method: string; path: string; body: Record<string, unknown> | null; query?: string }

export type World = {
  granted: string[]
  savedRevision: number
  effectiveRevision: number | null
  /** Session from which the LATEST SAVED revision counts. */
  effectiveSession: string | null
  status: "pending" | "effective" | "calendar_unavailable"
  /** The latest saved config (what the form edits). */
  indicators: Record<string, IndicatorConfig>
  /** Config of the effective revision when it is an older one than the saved config; the saved config otherwise. */
  effectiveIndicators: Record<string, IndicatorConfig> | null
  /** Leave `effective` out of the shared-config response, as a backend from before it existed would. */
  omitEffective: boolean
  universe: UniverseState
  lists: SavedList[]
  positions: BotPosition[]
  /** Closed round trips, newest first. */
  trades: BotTrade[]
  /** One row per session, newest first. */
  sessions: BotSession[]
  /** Decisions per session date. */
  decisions: Record<string, BotSessionDecision[]>
  conditions: BotConditions | null
  /** When set, applying a list is refused with these symbols (422 `UNIVERSE_SYMBOLS_INVALID`). */
  invalidSymbols: { symbol: string; reason: string }[] | null
  /** `bot.new_buys_enabled` of the overview; `null` leaves it out like an older API. */
  newBuysEnabled: boolean | null
  /** Per-route replacements: `"PATCH /strategy/shared-config"` -> handler (may throw). */
  override: Record<string, (body: Record<string, unknown> | null) => unknown>
  calls: Call[]
}

export const VN30 = ["ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "MBB", "MSN", "MWG", "PLX", "POW", "SAB", "SHB", "SSB", "SSI", "STB", "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE"]

export function request(partial: Partial<UniverseRequest> & Pick<UniverseRequest, "kind" | "name" | "revision">): UniverseRequest {
  return {
    cancelled_at: null, effective_session: "2026-10-09", list_as_of: null, provenance: {}, requested_at: "2026-10-08T03:00:00Z",
    saved_list_id: null, status: "pending", superseded_by: null, symbol_count: 4, ...partial,
  }
}

export function universeState(partial: Partial<UniverseState> = {}): UniverseState {
  return {
    revision: 0,
    server_date: "2026-10-08",
    effective: {
      ...request({ kind: "vn30", name: "VN30", revision: 0, status: "implicit", effective_session: null, symbol_count: 30 }),
      symbols: VN30.map((symbol) => ({ symbol, name: `${symbol} Corp`, exchange: "HOSE" })),
      membership_session: "2026-10-08",
      unavailable_reason: null,
    },
    pending: null,
    history: [],
    ...partial,
  }
}

/**
 * A list saved from a stored Bộ lọc result (`result_snapshot_id` set), which the Bot may use.
 * Pass `{ declared: true }` for a client-declared list (POST /strategy/lists): no result evidence.
 */
export function savedList(id: string, name: string, tickers: string[], options: { declared?: boolean } = {}): SavedList {
  return {
    id, name, tickers, as_of: "2026-10-06", data_source: "screener", filter_id: null, filter_version: null,
    kind: "static_retrospective", scope: {}, created_at: "2026-10-06T00:00:00Z",
    provenance: null, result_snapshot_id: options.declared ? null : `snapshot-${id}`, run_id: null, visibility: "saved",
  }
}

export function createWorld(partial: Partial<World> = {}): World {
  const registry = buildRegistry()
  const indicators = Object.fromEntries(
    registry.map((entry) => [entry.id, {
      master_enabled: false,
      buy: { enabled: entry.buy.enabled, params: { ...entry.buy.params }, rules: structuredClone(entry.buy.rules) },
      sell: { enabled: entry.sell.enabled, params: { ...entry.sell.params }, rules: structuredClone(entry.sell.rules) },
    } satisfies IndicatorConfig]),
  )
  return {
    granted: ["rsi", "macd", "ma", "bollinger", "volume"],
    savedRevision: 0, effectiveRevision: null, effectiveSession: null, status: "pending",
    indicators, effectiveIndicators: null, omitEffective: false, universe: universeState(), lists: [], positions: [],
    trades: [], sessions: [], decisions: {}, conditions: null, invalidSymbols: null, newBuysEnabled: true,
    override: {}, calls: [], ...partial,
  }
}

function overview(world: World): BotOverview {
  const conditions: BotConditions = world.conditions ?? {
    state: "waiting_for_conditions", state_label: "Chờ thiết lập điều kiện",
    has_active_buy: false, has_active_sell: false, buy_condition_count: 0, sell_condition_count: 0,
    buy_status: "inactive", sell_status: "inactive", errors: { buy: null, sell: null },
    saved_revision: world.savedRevision || null, effective_revision: world.effectiveRevision, effective_session: world.effectiveSession,
    config_status: world.savedRevision === 0 ? "none" : "effective", pending: null, open_positions: world.positions.length,
  }
  return {
    eligible: true,
    disclosure: "Mô phỏng theo giá đóng cửa, không phải khuyến nghị đầu tư.",
    bot: {
      activated_at: "2026-10-01T00:00:00Z", candidate_order: "gtgd20_desc_symbol_asc", candidate_order_owner_confirmation: "pending",
      execution_model: "same_session_close", initial_cash_vnd: "100000000", policy_version: "iqx-bot-v1.0", strategy_id: "iqx_standard", strategy_version: 1,
      ...(world.newBuysEnabled === null ? {} : { new_buys_enabled: world.newBuysEnabled }),
      // An older API without the flag is simulated by leaving it out.
    } as BotOverview["bot"],
    conditions,
    account: { as_of_session: "2026-10-07", cash_vnd: "100000000", market_value_vnd: "0", nav_vnd: "100000000", pnl_total_net_vnd: "0", return_total: "0", valuation_complete: true },
    bot_run: { issues: [], last_updated_at: null, latest_run_id: null, processed_unseen_sessions: 0, status: "idle" },
  }
}

/** A hash that follows the content, like the server's: equal configs hash equal whatever their revision. */
function contentHash(indicators: Record<string, IndicatorConfig>): string {
  const text = JSON.stringify(indicators)
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = (hash * 33 + text.charCodeAt(index)) % 2147483647
  return `sha-${hash}`
}

function sharedConfig(world: World): SharedConfigState {
  const inForce = world.effectiveRevision
  const state: SharedConfigState = {
    saved_revision: world.savedRevision,
    effective_revision: inForce,
    effective_session: world.effectiveSession,
    status: world.status,
    config: { schema_version: "3.0", revision: world.savedRevision, rule_version: "iqx-rules-3.0", indicators: world.indicators },
    config_hash: contentHash(world.indicators),
    registry_version: "iqx-ta-2.0",
    granted_indicators: world.granted,
    legacy: null,
  }
  if (world.omitEffective) return state
  return {
    ...state,
    effective: inForce === null
      ? null
      : {
          revision: inForce,
          effective_session: "2026-10-01",
          config_hash: contentHash(world.effectiveIndicators ?? world.indicators),
          config: { schema_version: "3.0", revision: inForce, rule_version: "iqx-rules-3.0", indicators: world.effectiveIndicators ?? world.indicators },
          legacy: null,
        },
  }
}

/**
 * The fake `api(path, init)`: JSON bodies in, plain objects out, `FakeApiError` on refusals.
 * Responses are cloned so a later change to the world never mutates data the client holds.
 */
export function createFakeApi(world: World) {
  const handle = route(world)
  return async (path: string, init?: RequestInit): Promise<unknown> => structuredClone(await handle(path, init))
}

function route(world: World) {
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = init?.method ?? "GET"
    const url = new URL(path, "http://test")
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    world.calls.push({ method, path: url.pathname, body, query: url.search })
    const key = `${method} ${url.pathname}`
    const override = world.override[key]
    if (override) return override(body)
    const sessionDate = /^\/bot\/journal\/sessions\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname)?.[1]
    if (method === "GET" && sessionDate) {
      const session = world.sessions.find((item) => item.session === sessionDate)
      if (!session) throw new FakeApiError("Không có phiên này.", 404, { code: "NOT_FOUND" })
      return { session, ...page(world.decisions[sessionDate] ?? [], url, (decision) => decision.id) }
    }
    switch (key) {
      case "GET /bot": return overview(world)
      case "GET /bot/positions": return { items: world.positions, valuation_complete: true, as_of_session: "2026-10-07" }
      case "GET /bot/trades": return page(world.trades, url, (trade) => trade.id)
      case "GET /bot/journal/sessions": return page(world.sessions, url, (session) => session.session)
      case "GET /bot/universe": return world.universe
      case "GET /strategy/lists": return { items: world.lists }
      case "GET /strategy/registry/technical": return registryFor(world.granted)
      case "GET /strategy/shared-config": return sharedConfig(world)
      case "PATCH /strategy/shared-config": {
        if (body?.expected_revision !== world.savedRevision) {
          throw new FakeApiError("Cấu hình đã được lưu ở nơi khác. Tải lại để xem bản mới nhất.", 409, {
            code: "REVISION_CONFLICT",
            details: [{ field: "expected_revision", current_revision: world.savedRevision }],
          })
        }
        Object.assign(world.indicators, body?.indicators as Record<string, IndicatorConfig>)
        world.savedRevision += 1
        world.effectiveSession = "2026-10-09"
        world.status = "pending"
        return { revision: world.savedRevision, config: sharedConfig(world).config, config_hash: contentHash(world.indicators), effective_session: "2026-10-09", status: "pending" }
      }
      case "POST /bot/universe/apply-list": {
        assertUniverseRevision(world, body?.expected_revision)
        if (world.invalidSymbols) throw new FakeApiError("Một số mã không hợp lệ cho nguồn mua của Bot.", 422, { code: "UNIVERSE_SYMBOLS_INVALID", details: world.invalidSymbols })
        const list = world.lists.find((item) => item.id === body?.list_id)
        const symbols = body?.symbols as string[]
        return requestUniverse(world, request({ kind: "custom", name: list?.name ?? "Danh mục", revision: world.universe.revision + 1, symbol_count: symbols.length, saved_list_id: list?.id ?? null }))
      }
      case "POST /bot/universe/revert-vn30": {
        assertUniverseRevision(world, body?.expected_revision)
        const latest = world.universe.pending ?? world.universe.effective
        if (latest.kind === "vn30") throw new FakeApiError("Nguồn mua đã là VN30.", 409, { code: "ALREADY_VN30" })
        return requestUniverse(world, request({ kind: "vn30", name: "VN30", revision: world.universe.revision + 1, symbol_count: 30 }))
      }
      case "POST /bot/universe/pending/cancel": {
        assertUniverseRevision(world, body?.expected_revision)
        const pending = world.universe.pending
        if (!pending) throw new FakeApiError("Thay đổi đã có hiệu lực.", 409, { code: "PENDING_ALREADY_EFFECTIVE" })
        world.universe = { ...world.universe, pending: null }
        return { request: { ...pending, status: "cancelled" }, state: world.universe }
      }
      default: throw new FakeApiError(`unhandled ${key}`, 404)
    }
  }
}

/** A cursor page of `items`: the cursor is the key of the last item of the previous page, like the API's. */
function page<T>(items: readonly T[], url: URL, keyOf: (item: T) => string): { items: T[]; next_cursor: string | null } {
  const limit = Number(url.searchParams.get("limit") ?? 30)
  const cursor = url.searchParams.get("cursor")
  const start = cursor ? items.findIndex((item) => keyOf(item) === cursor) + 1 : 0
  const slice = items.slice(start, start + limit)
  const last = slice.at(-1)
  return { items: [...slice], next_cursor: last && start + limit < items.length ? keyOf(last) : null }
}

function assertUniverseRevision(world: World, expected: unknown) {
  if (expected !== world.universe.revision) {
    throw new FakeApiError("Nguồn mua đã được thay đổi ở nơi khác.", 409, {
      code: "REVISION_CONFLICT",
      details: [{ field: "expected_revision", current_revision: world.universe.revision }],
    })
  }
}

function requestUniverse(world: World, created: UniverseRequest) {
  world.universe = { ...world.universe, revision: created.revision, pending: created }
  return { request: created, state: world.universe }
}

export function callsTo(world: World, method: string, path: string): Call[] {
  return world.calls.filter((call) => call.method === method && call.path === path)
}

/* ── Builders of the read models ────────────────────────────────────────── */

/** A closed trade: FPT, 300 CP bought at 98.500 and sold at 101.200, +807.000 đ (+2,73%). */
export function tradeFixture(partial: Partial<BotTrade> & Pick<BotTrade, "id">): BotTrade {
  return {
    symbol: "FPT",
    buy: {
      execution_id: "e-buy", decision_id: "d-buy", session: "2026-10-01", executed_at: "2026-10-01T07:30:00Z", price_vnd: "98500", qty: 300,
      gross_value_vnd: "29550000", fee_vnd: "44325", total_vnd: "29594325", decision_config_revision: 3,
      entry_source_snapshot: { kind: "vn30", name: "VN30", revision: 0 }, reason_code: "buy_all_conditions_met", reason_label: "Mua theo điều kiện Mua", reason: "raw buy",
    },
    sell: {
      execution_id: "e-sell", decision_id: "d-sell", session: "2026-10-07", executed_at: "2026-10-07T07:30:00Z", price_vnd: "101200", qty: 300,
      gross_value_vnd: "30360000", fee_vnd: "45540", tax_vnd: "30360", net_vnd: "30284100", decision_config_revision: 4,
      reason_code: "sell_all_conditions_met", reason_label: "Bán theo điều kiện Bán", reason: "raw sell",
    },
    realized_pnl_vnd: "689775",
    realized_pnl_pct: "2.330782",
    holding_sessions: 4,
    holding_days: 6,
    legacy_amplitude_at_entry_vnd: null, legacy_amplitude_source_ref: null, legacy_filter_ids: [], legacy_stop_loss_vnd: null, legacy_take_profit_vnd: null,
    ...partial,
  }
}

/** One session row: a normal VN30 run on config revision 3 with nothing traded. */
export function sessionFixture(partial: Partial<BotSession> & Pick<BotSession, "session">): BotSession {
  return {
    run_id: `run-${partial.session}`, run_status: "succeeded", started_at: `${partial.session}T10:00:00Z`, completed_at: `${partial.session}T10:05:00Z`,
    policy_version: "iqx-bot-v1.0", universe: { kind: "vn30", name: "VN30", revision: 0 }, config_revision: 3,
    counts: { buy: 0, sell: 0, hold: 0, skip: 0, total: 0 }, reasons: [], nav_end_vnd: "100000000", cash_end_vnd: "100000000", valuation_complete: true, issues: [],
    ...partial,
  }
}

/** One decision of a session. */
export function decisionFixture(partial: Partial<BotSessionDecision> & Pick<BotSessionDecision, "id" | "trading_date" | "action">): BotSessionDecision {
  return {
    run_id: `run-${partial.trading_date}`, reason_code: "buy_not_met", reason_label: "Điều kiện Mua chưa đạt", reason: "raw reason", execution: null, symbol: "HPG",
    in_universe: true, universe_kind: "vn30", universe_revision: 0, policy_version: "iqx-bot-v1.0", decision_config_revision: 3, condition_snapshot: null,
    rank_tuple: null, legacy_filter_ids: [], legacy_threshold_vnd: null, source_refs: {}, created_at: `${partial.trading_date}T10:00:00Z`,
    ...partial,
  }
}
