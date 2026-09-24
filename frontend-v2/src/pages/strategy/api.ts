/**
 * Tầng dữ liệu của trang Chiến lược — backtest + cảnh báo, gọi REST thật của
 * backend-v2 qua shared API boundary:
 *
 * - `GET  /backtest/catalog` — thư viện chỉ tiêu, mẫu chiến lược, preset rủi ro
 * - `POST /backtest/run` — KPI + đường vốn + lịch sử lệnh (đồng bộ, trần 60s)
 * - `GET/POST/PUT/DELETE /backtest/strategies[/{id}]` — chiến lược đã lưu
 * - `GET  /alerts/signals`, `GET/POST/PUT/DELETE /alerts/rules[/{id}]`
 * - `GET  /alerts/events` — lịch sử tín hiệu đã bắn (50 gần nhất)
 * - `GET/POST/DELETE /alerts/telegram[/link]` — kết nối Telegram
 *
 * Mọi endpoint đều premium-gated ở server; payload là snake_case và tiền theo
 * VND. Giá trị upstream không có thì giữ `null` (UI render "—"), không ép về 0.
 */
import { api as sharedApi, ApiError } from "@/lib/api"
import {
  DEFAULT_RISK,
  type AlertEvent,
  type AlertSignal,
  type Catalog,
  type Combination,
  type Condition,
  type CreateRuleBody,
  type EquityPoint,
  type Factor,
  type FactorGroup,
  type Kpis,
  type Logic,
  type RiskInput,
  type RiskPresetOption,
  type RiskPresets,
  type RunRequest,
  type RunResult,
  type SavedStrategy,
  type Side,
  type StrategyConfig,
  type StrategySideConfig,
  type TelegramLink,
  type TelegramStatus,
  type Trade,
  type UpdateRuleBody,
  type UserAlertRule,
} from "./types"

type Raw = Record<string, unknown>

/** Shared v2 HTTP boundary returns the resource in `data` for enveloped routes.
 * Older compatible routes return the resource directly; accept both without
 * weakening error handling or manufacturing defaults. */
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const payload = await sharedApi<unknown>(path, options)
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

/** Trần thời gian một lần chạy backtest — giữ nguyên 60s của bản dashboard cũ. */
export const RUN_TIMEOUT_MS = 60_000

/* ── Đọc payload ─────────────────────────────────────────────────────────── */

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  if (typeof value === "number") return String(value)
  return null
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

/** Mảng bản ghi trong payload: mảng trần, `{items}`, rồi `{data}`. */
function rows(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[]
  const wrapped = record(payload)
  if (!wrapped) return []
  const items = wrapped.items ?? wrapped.data
  return Array.isArray(items) ? (items as Raw[]) : []
}

function side(value: unknown): Side {
  return value === "sell" ? "sell" : "buy"
}

function logic(value: unknown): Logic {
  return value === "OR" ? "OR" : "AND"
}

/* ── Backtest: thư viện chỉ tiêu ─────────────────────────────────────────── */

function toFactor(raw: Raw): Factor | null {
  const id = str(raw.id)
  const indicator = str(raw.indicator)
  if (!id || !indicator) return null
  const fallback = raw.default
  return {
    id,
    label: str(raw.label) ?? indicator,
    side: side(raw.side),
    group: str(raw.group) ?? "",
    groupLabel: str(raw.group_label) ?? "",
    kind: raw.kind === "num" ? "num" : "bin",
    indicator,
    op: str(raw.op) ?? "",
    default:
      typeof fallback === "number" || typeof fallback === "string" ? fallback : null,
    editable: bool(raw.editable) ?? false,
    min: num(raw.min),
    max: num(raw.max),
    step: num(raw.step),
    unit: str(raw.unit) ?? "",
    isPercent: bool(raw.is_percent) ?? false,
    desc: str(raw.desc) ?? "",
  }
}

function toFactorGroups(payload: unknown): FactorGroup[] {
  return rows(payload).flatMap((raw) => {
    const group = str(raw.group)
    if (!group) return []
    return [
      {
        group,
        groupLabel: str(raw.group_label) ?? "",
        factors: rows(raw.factors).flatMap((item) => {
          const factor = toFactor(item)
          return factor ? [factor] : []
        }),
      },
    ]
  })
}

function toRiskPresetOptions(payload: unknown): RiskPresetOption[] {
  return rows(payload).flatMap((raw) => {
    const label = str(raw.label)
    if (!label) return []
    const value = raw.value
    return [
      {
        value:
          typeof value === "string" || typeof value === "number" ? value : null,
        label,
        ...(num(raw.mult) !== null ? { mult: num(raw.mult) as number } : {}),
        ...(num(raw.pct) !== null ? { pct: num(raw.pct) as number } : {}),
        ...(num(raw.amount) !== null ? { amount: num(raw.amount) as number } : {}),
      },
    ]
  })
}

function toRiskPresets(payload: unknown): RiskPresets {
  const raw = record(payload) ?? {}
  return {
    stopLoss: toRiskPresetOptions(raw.stop_loss),
    takeProfit: toRiskPresetOptions(raw.take_profit),
    positionSize: toRiskPresetOptions(raw.position_size),
    fee: toRiskPresetOptions(raw.fee),
  }
}

/* ── Backtest: cấu hình chiến lược ───────────────────────────────────────── */

function toRiskInput(payload: unknown): RiskInput {
  const raw = record(payload) ?? {}
  const stopLoss = raw.stop_loss
  const positionSize = raw.position_size
  const fee = raw.fee
  return {
    stopLoss:
      stopLoss === "none" || stopLoss === "fixed" || stopLoss === "atr"
        ? stopLoss
        : DEFAULT_RISK.stopLoss,
    stopAtrMult: num(raw.stop_atr_mult) ?? DEFAULT_RISK.stopAtrMult,
    stopFixedPct: num(raw.stop_fixed_pct) ?? DEFAULT_RISK.stopFixedPct,
    takeProfitPct: num(raw.take_profit_pct),
    maxHolding: num(raw.max_holding),
    positionSize:
      positionSize === "all" ||
      positionSize === "half" ||
      positionSize === "quarter" ||
      positionSize === "tenth" ||
      positionSize === "fixed"
        ? positionSize
        : DEFAULT_RISK.positionSize,
    positionFixedAmount: num(raw.position_fixed_amount) ?? DEFAULT_RISK.positionFixedAmount,
    fee:
      fee === "standard" || fee === "low" || fee === "none" ? fee : DEFAULT_RISK.fee,
  }
}

function toStrategySideConfig(payload: unknown): StrategySideConfig {
  const raw = record(payload) ?? {}
  return {
    logic: logic(raw.logic),
    factors: rows(raw.factors).flatMap((item) => {
      const id = str(item.id)
      if (!id) return []
      const value = num(item.value)
      return [value === null ? { id } : { id, value }]
    }),
  }
}

function toStrategyConfig(payload: unknown): StrategyConfig {
  const raw = record(payload) ?? {}
  return {
    buy: toStrategySideConfig(raw.buy),
    sell: toStrategySideConfig(raw.sell),
    risk: toRiskInput(raw.risk),
  }
}

function toCatalog(payload: unknown): Catalog {
  const raw = record(payload) ?? {}
  const factors = record(raw.factors) ?? {}
  return {
    factors: {
      buy: toFactorGroups(factors.buy),
      sell: toFactorGroups(factors.sell),
      count: num(factors.count) ?? 0,
    },
    templates: rows(raw.templates).flatMap((item) => {
      const key = str(item.key)
      const name = str(item.name)
      if (!key || !name) return []
      return [
        {
          key,
          name,
          description: str(item.description) ?? "",
          config: toStrategyConfig(item.config),
        },
      ]
    }),
    riskPresets: toRiskPresets(raw.risk_presets),
  }
}

/* ── Backtest: kết quả chạy ──────────────────────────────────────────────── */

function toKpis(payload: unknown): Kpis {
  const raw = record(payload) ?? {}
  const ci = Array.isArray(raw.sharpe_ci) ? raw.sharpe_ci : []
  return {
    cagr: num(raw.cagr),
    sharpe: num(raw.sharpe),
    sharpeCi: [num(ci[0]), num(ci[1])],
    maxDrawdown: num(raw.max_drawdown),
    ddRecoverySessions: num(raw.dd_recovery_sessions),
    winRate: num(raw.win_rate),
    nTrades: num(raw.n_trades) ?? 0,
    nWins: num(raw.n_wins) ?? 0,
    avgHold: num(raw.avg_hold),
    netReturn: num(raw.net_return),
    buyHoldReturn: num(raw.buy_hold_return),
    nSessions: num(raw.n_sessions) ?? 0,
  }
}

function toEquityCurve(payload: unknown): EquityPoint[] {
  return rows(payload).flatMap((raw) => {
    const date = str(raw.date)
    const strategy = num(raw.strategy)
    const buyHold = num(raw.buy_hold)
    if (!date || strategy === null || buyHold === null) return []
    const vnindex = num(raw.vnindex)
    return [vnindex === null ? { date, strategy, buyHold } : { date, strategy, buyHold, vnindex }]
  })
}

function toTrades(payload: unknown): Trade[] {
  return rows(payload).flatMap((raw) => {
    const entryDate = str(raw.entry_date)
    const exitDate = str(raw.exit_date)
    if (!entryDate || !exitDate) return []
    return [
      {
        idx: num(raw.idx) ?? 0,
        entryDate,
        entryPrice: num(raw.entry_price) ?? 0,
        exitDate,
        exitPrice: num(raw.exit_price) ?? 0,
        hold: num(raw.hold) ?? 0,
        pnlPct: num(raw.pnl_pct) ?? 0,
        trigger: str(raw.trigger) ?? "—",
        entryTrigger: str(raw.entry_trigger) ?? "—",
      },
    ]
  })
}

function toRunResult(payload: unknown): RunResult {
  const raw = record(payload) ?? {}
  const meta = record(raw.meta) ?? {}
  return {
    meta: {
      symbol: str(meta.symbol) ?? "—",
      start: str(meta.start) ?? "",
      end: str(meta.end) ?? "",
      nSessions: num(meta.n_sessions) ?? 0,
      capital: num(meta.capital) ?? 0,
    },
    kpis: toKpis(raw.kpis),
    equityCurve: toEquityCurve(raw.equity_curve),
    trades: toTrades(raw.trades),
  }
}

function toSavedStrategy(payload: unknown): SavedStrategy | null {
  const raw = record(payload)
  const id = raw ? str(raw.id) : null
  const name = raw ? str(raw.name) : null
  if (!raw || !id || !name) return null
  return {
    id,
    name,
    symbol: str(raw.symbol),
    config: toStrategyConfig(raw.config),
    createdAt: str(raw.created_at) ?? "",
    updatedAt: str(raw.updated_at) ?? "",
  }
}

/* ── Ghi payload (camelCase → snake_case) ────────────────────────────────── */

function toConfigPayload(config: StrategyConfig) {
  const sidePayload = (config: StrategySideConfig) => ({
    logic: config.logic,
    factors: config.factors.map((factor) =>
      factor.value === undefined ? { id: factor.id } : { id: factor.id, value: factor.value },
    ),
  })
  return {
    buy: sidePayload(config.buy),
    sell: sidePayload(config.sell),
    risk: {
      stop_loss: config.risk.stopLoss,
      stop_atr_mult: config.risk.stopAtrMult,
      stop_fixed_pct: config.risk.stopFixedPct,
      take_profit_pct: config.risk.takeProfitPct,
      max_holding: config.risk.maxHolding,
      position_size: config.risk.positionSize,
      position_fixed_amount: config.risk.positionFixedAmount,
      fee: config.risk.fee,
    },
  }
}

/* ── Backtest API ────────────────────────────────────────────────────────── */

/** `GET /backtest/catalog` — premium. */
export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  return toCatalog(await api<Raw>("/backtest/catalog", { signal }))
}

/**
 * `POST /backtest/run` — premium, đồng bộ và có thể chạy vài chục giây.
 * Vượt trần 60s thì dừng và báo rõ, thay vì treo vô hạn.
 */
export async function runBacktest(request: RunRequest): Promise<RunResult> {
  try {
    const payload = await api<Raw>("/backtest/run", {
      method: "POST",
      body: JSON.stringify({
        symbol: request.symbol,
        start: request.start,
        end: request.end,
        capital: request.capital,
        ...toConfigPayload(request),
      }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    })
    return toRunResult(payload)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError(
        "Backtest chạy quá 60 giây nên đã dừng. Thu hẹp khoảng thời gian hoặc bớt điều kiện rồi thử lại.",
        408,
      )
    }
    throw error
  }
}

/** `GET /backtest/strategies` — chiến lược đã lưu của user hiện tại. */
export async function fetchStrategies(signal?: AbortSignal): Promise<SavedStrategy[]> {
  const payload = await api<unknown>("/backtest/strategies", { signal })
  return rows(payload).flatMap((raw) => {
    const strategy = toSavedStrategy(raw)
    return strategy ? [strategy] : []
  })
}

/** `POST /backtest/strategies` — 409 khi trùng tên. */
export async function createStrategy(body: {
  name: string
  symbol?: string | null
  config: StrategyConfig
}): Promise<SavedStrategy> {
  const payload = await api<Raw>("/backtest/strategies", {
    method: "POST",
    body: JSON.stringify({
      name: body.name,
      symbol: body.symbol ?? null,
      config: toConfigPayload(body.config),
    }),
  })
  const strategy = toSavedStrategy(payload)
  if (!strategy) throw new ApiError("Máy chủ trả về chiến lược không hợp lệ.", 500)
  return strategy
}

/** `DELETE /backtest/strategies/{id}` — 204. */
export async function deleteStrategy(id: string): Promise<void> {
  await api<unknown>(`/backtest/strategies/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/* ── Cảnh báo API ────────────────────────────────────────────────────────── */

function toCombination(payload: unknown): Combination | null {
  const raw = record(payload)
  if (!raw) return null
  const conditions = rows(raw.conditions).flatMap((item) => {
    const indicator = str(item.indicator)
    const op = str(item.op)
    if (!indicator || !op) return []
    const value = item.value
    const condition: Condition = {
      indicator,
      op,
      value:
        typeof value === "number" || typeof value === "string" ? value : null,
    }
    if (item.join === "AND" || item.join === "OR") condition.join = item.join
    return [condition]
  })
  return { logic: logic(raw.logic), conditions }
}

function toAlertSignal(raw: Raw): AlertSignal | null {
  const key = str(raw.key)
  const taName = str(raw.ta_name)
  if (!key || !taName) return null
  return {
    key,
    side: side(raw.side),
    taName,
    messageTitle: str(raw.message_title) ?? "",
    combination: toCombination(raw.combination),
    isEnabled: bool(raw.is_enabled) ?? true,
    sortOrder: num(raw.sort_order) ?? 0,
  }
}

function toUserAlertRule(raw: Raw): UserAlertRule | null {
  const id = str(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  return {
    id,
    name,
    side: side(raw.side),
    baseSignalKey: str(raw.base_signal_key),
    combination: toCombination(raw.combination),
    isEnabled: bool(raw.is_enabled) ?? true,
    createdAt: str(raw.created_at) ?? "",
    updatedAt: str(raw.updated_at) ?? "",
  }
}

/** `GET /alerts/signals` — 10 preset đang bật. */
export async function fetchSignals(signal?: AbortSignal): Promise<AlertSignal[]> {
  const payload = await api<unknown>("/alerts/signals", { signal })
  return rows(payload).flatMap((raw) => {
    const item = toAlertSignal(raw)
    return item ? [item] : []
  })
}

/** `GET /alerts/rules` — cảnh báo của user hiện tại (mới nhất cuối). */
export async function fetchRules(signal?: AbortSignal): Promise<UserAlertRule[]> {
  const payload = await api<unknown>("/alerts/rules", { signal })
  return rows(payload).flatMap((raw) => {
    const item = toUserAlertRule(raw)
    return item ? [item] : []
  })
}

/** `POST /alerts/rules` — theo preset (`signal_key`) hoặc tùy chỉnh. */
export async function createRule(body: CreateRuleBody): Promise<UserAlertRule> {
  const payload = await api<Raw>("/alerts/rules", {
    method: "POST",
    body: JSON.stringify({
      ...(body.signalKey !== undefined ? { signal_key: body.signalKey } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.side !== undefined ? { side: body.side } : {}),
      ...(body.combination !== undefined ? { combination: body.combination } : {}),
      ...(body.isEnabled !== undefined ? { is_enabled: body.isEnabled } : {}),
    }),
  })
  const rule = toUserAlertRule(payload)
  if (!rule) throw new ApiError("Máy chủ trả về cảnh báo không hợp lệ.", 500)
  return rule
}

/** `PUT /alerts/rules/{id}` — bật/tắt, đổi tên hoặc đổi tổ hợp điều kiện. */
export async function updateRule(id: string, body: UpdateRuleBody): Promise<UserAlertRule> {
  const payload = await api<Raw>(`/alerts/rules/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.combination !== undefined ? { combination: body.combination } : {}),
      ...(body.isEnabled !== undefined ? { is_enabled: body.isEnabled } : {}),
    }),
  })
  const rule = toUserAlertRule(payload)
  if (!rule) throw new ApiError("Máy chủ trả về cảnh báo không hợp lệ.", 500)
  return rule
}

/** `DELETE /alerts/rules/{id}` — 204 kể cả khi không còn tồn tại. */
export async function deleteRule(id: string): Promise<void> {
  await api<unknown>(`/alerts/rules/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/** `GET /alerts/events` — 50 tín hiệu đã bắn gần nhất. */
export async function fetchEvents(signal?: AbortSignal): Promise<AlertEvent[]> {
  const payload = await api<unknown>("/alerts/events", { signal })
  return rows(payload).flatMap((raw) => {
    const id = str(raw.id)
    const symbol = str(raw.symbol)
    const firedAt = str(raw.fired_at)
    if (!id || !symbol || !firedAt) return []
    return [
      {
        id,
        symbol,
        signalKey: str(raw.signal_key),
        sessionDate: str(raw.session_date) ?? "",
        firedAt,
        price: num(raw.price),
        delivered: bool(raw.delivered) ?? false,
      },
    ]
  })
}

/** `GET /alerts/telegram` — trạng thái kết nối Telegram của user. */
export async function fetchTelegramStatus(signal?: AbortSignal): Promise<TelegramStatus> {
  const raw = record(await api<Raw>("/alerts/telegram", { signal })) ?? {}
  return {
    linked: bool(raw.linked) ?? false,
    linkedAt: str(raw.linked_at),
    botUsername: str(raw.bot_username),
  }
}

/** `POST /alerts/telegram/link` — 503 khi hệ thống chưa cấu hình bot. */
export async function createTelegramLink(): Promise<TelegramLink> {
  const raw = record(await api<Raw>("/alerts/telegram/link", { method: "POST" })) ?? {}
  return { deepLink: str(raw.deep_link) ?? "", token: str(raw.token) ?? "" }
}

/** `DELETE /alerts/telegram` — 204. */
export async function unlinkTelegram(): Promise<void> {
  await api<unknown>("/alerts/telegram", { method: "DELETE" })
}
