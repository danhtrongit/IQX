/**
 * Pure helpers of the practice screen: form state (text inputs), client validation that mirrors the
 * server rules, operand labels, replay frames and number formatting. Nothing here touches React or
 * the network, so it is unit-tested directly.
 */
import {
  HOLD_MAX,
  HOLD_MIN,
  type PracticeConfig,
  type PracticeForm,
  type PracticeFormField,
  type PracticeFormRule,
  type PracticeOp,
  type PracticeOperand,
  type PracticeRun,
  type PracticeSideConfig,
  type PracticeTrade,
  type Side,
} from "./practice-api"

export const SIDES: readonly Side[] = ["buy", "sell"]
export const SIDE_LABEL: Record<Side, string> = { buy: "Mua", sell: "Bán" }

const STEP_TOLERANCE = 1e-6

// ---------------------------------------------------------------- number formatting

const intFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const decFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const pctFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })
const signedIntFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0, signDisplay: "exceptZero" })

/** Typographic minus (U+2212) like the approved sample, instead of the hyphen Intl emits. */
const trueMinus = (text: string): string => text.replace("-", "\u2212")

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value)

export const formatInt = (value: number | null | undefined): string => (finite(value) ? intFormat.format(value) : "—")
export const formatDec = (value: number | null | undefined): string => (finite(value) ? decFormat.format(value) : "—")
/** Ratio (0.05) -> "+5,00%"; null -> "—" (never a fake 0%). */
export const formatRatioPercent = (ratio: number | null | undefined): string =>
  finite(ratio) ? `${trueMinus(pctFormat.format(ratio * 100))}%` : "—"
export const formatSignedMoney = (vnd: number | null | undefined): string =>
  finite(vnd) ? `${trueMinus(signedIntFormat.format(vnd))} đ` : "—"
export const formatMoneyVnd = (vnd: number | null | undefined): string => (finite(vnd) ? `${intFormat.format(vnd)} đ` : "—")

export type Tone = "up" | "down" | "flat"
export const toneOf = (value: number | null | undefined): Tone => (!finite(value) || value === 0 ? "flat" : value > 0 ? "up" : "down")
export const TONE_CLASS: Record<Tone, string> = { up: "text-price-up", down: "text-price-down", flat: "text-foreground" }

/** Session label; session 0 is the last observed one, earlier ones are negative. */
export const sessionLabel = (session: number): string => `Phiên ${session}`

// ---------------------------------------------------------------- form state

export type SideFormState = {
  enabled: boolean
  /** Raw text of every parameter input (so "" and "1." can be typed). */
  params: Record<string, string>
  ops: Record<string, PracticeOp>
}
export type PracticeFormState = { buy: SideFormState; sell: SideFormState; hold: string }

const sideToForm = (side: PracticeSideConfig): SideFormState => ({
  enabled: side.enabled,
  params: Object.fromEntries(Object.entries(side.params).map(([key, value]) => [key, String(value)])),
  ops: { ...side.ops },
})

export const toFormState = (config: PracticeConfig): PracticeFormState => ({
  buy: sideToForm(config.buy),
  sell: sideToForm(config.sell),
  hold: String(config.hold_max_sessions),
})

/** Plain number from an input text; null when empty or not a finite number. */
export function parseNumberText(text: string | undefined): number | null {
  if (text === undefined) return null
  const trimmed = text.trim()
  if (trimmed === "") return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function sideToConfig(side: SideFormState, fields: readonly PracticeFormField[]): PracticeSideConfig | null {
  const params: Record<string, number> = {}
  for (const field of fields) {
    const value = parseNumberText(side.params[field.key])
    if (value === null) return null
    params[field.key] = value
  }
  return { enabled: side.enabled, params, ops: { ...side.ops } }
}

/** Params of one side as numbers, or null while any input is empty/not numeric. */
export function sideParams(side: SideFormState, fields: readonly PracticeFormField[]): Record<string, number> | null {
  return sideToConfig(side, fields)?.params ?? null
}

/** Numeric config for the API; null while any input is unparseable (nothing is clamped or guessed). */
export function toConfig(form: PracticeFormState, spec: PracticeForm): PracticeConfig | null {
  const buy = sideToConfig(form.buy, spec.buy.fields)
  const sell = sideToConfig(form.sell, spec.sell.fields)
  const hold = parseNumberText(form.hold)
  if (!buy || !sell || hold === null) return null
  return { buy, sell, hold_max_sessions: hold }
}

/** Stable text of a config (key order independent) used to compare drafts and key idempotency. */
export function configSignature(config: PracticeConfig): string {
  const side = (value: PracticeSideConfig) => ({
    enabled: value.enabled,
    params: Object.fromEntries(Object.entries(value.params).sort(([a], [b]) => a.localeCompare(b))),
    ops: Object.fromEntries(Object.entries(value.ops).sort(([a], [b]) => a.localeCompare(b))),
  })
  return JSON.stringify({ buy: side(config.buy), sell: side(config.sell), hold: config.hold_max_sessions })
}

/** "Mặc định": only the params and operators of this side; `enabled`, the other side and the hold time stay. */
export function resetSide(form: PracticeFormState, spec: PracticeForm, side: Side): PracticeFormState {
  const defaults = toFormState(spec.defaults)
  return { ...form, [side]: { enabled: form[side].enabled, params: defaults[side].params, ops: defaults[side].ops } }
}

// ---------------------------------------------------------------- validation

export type PracticeIssue = { path: string; side: Side | null; message: string }
export type PracticeFormValidation = {
  valid: boolean
  issues: PracticeIssue[]
  byPath: Record<string, string>
  sideHasIssue: Record<Side, boolean>
  /** True when every parameter of both sides is a valid number (enough for a chart preview). */
  paramsValid: boolean
  holdError: string | null
  buyOff: boolean
}

export const HOLD_ERROR = `Nhập số phiên nguyên từ ${HOLD_MIN} đến ${intFormat.format(HOLD_MAX)}.`

function validateSideParams(side: Side, form: SideFormState, spec: PracticeForm, issues: PracticeIssue[]): void {
  const sideSpec = spec[side]
  const label = SIDE_LABEL[side]
  const numbers: Record<string, number> = {}
  for (const field of sideSpec.fields) {
    const path = `${side}.params.${field.key}`
    const value = parseNumberText(form.params[field.key])
    if (value === null) {
      issues.push({ path, side, message: `${label}: ${field.label} phải là một số.` })
      continue
    }
    numbers[field.key] = value
    if (field.type === "integer" && !Number.isInteger(value)) {
      issues.push({ path, side, message: `${label}: ${field.label} phải là số nguyên.` })
      continue
    }
    if (value < field.min || value > field.max) {
      issues.push({ path, side, message: `${label}: ${field.label} phải trong khoảng ${formatDec(field.min)}–${formatDec(field.max)}.` })
      continue
    }
    const steps = (value - field.min) / field.step
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
      issues.push({ path, side, message: `${label}: ${field.label} phải theo bước ${formatDec(field.step)}.` })
    }
  }
  for (const cross of spec.cross_fields) {
    const left = numbers[cross.left]
    const right = numbers[cross.right]
    if (left === undefined || right === undefined) continue
    if (cross.op === "<" ? left < right : left > right) continue
    const leftLabel = sideSpec.fields.find((field) => field.key === cross.left)?.label ?? cross.left
    const rightLabel = sideSpec.fields.find((field) => field.key === cross.right)?.label ?? cross.right
    issues.push({
      path: `${side}.params.${cross.left}`,
      side,
      message: `${label}: ${leftLabel} phải ${cross.op === "<" ? "nhỏ hơn" : "lớn hơn"} ${rightLabel}.`,
    })
  }
  for (const rule of sideSpec.rules) {
    const op = form.ops[rule.rule_id]
    if (!op || !rule.allowed_ops.includes(op)) {
      issues.push({ path: `${side}.ops.${rule.rule_id}`, side, message: `${label}: chọn dấu cho điều kiện ${rule.rule_id}.` })
    }
  }
}

export function validatePracticeForm(form: PracticeFormState, spec: PracticeForm): PracticeFormValidation {
  const issues: PracticeIssue[] = []
  for (const side of SIDES) validateSideParams(side, form[side], spec, issues)
  const paramIssues = issues.length
  const hold = parseNumberText(form.hold)
  const holdError = hold === null || !Number.isInteger(hold) || hold < HOLD_MIN || hold > HOLD_MAX ? HOLD_ERROR : null
  if (holdError) issues.push({ path: "hold_max_sessions", side: null, message: holdError })
  const buyOff = !form.buy.enabled
  if (buyOff) issues.push({ path: "buy.enabled", side: "buy", message: "Bật điều kiện Mua để bắt đầu." })
  const byPath: Record<string, string> = {}
  for (const issue of issues) if (!(issue.path in byPath)) byPath[issue.path] = issue.message
  return {
    valid: issues.length === 0,
    issues,
    byPath,
    sideHasIssue: {
      buy: issues.some((issue) => issue.side === "buy" && issue.path !== "buy.enabled"),
      sell: issues.some((issue) => issue.side === "sell"),
    },
    paramsValid: paramIssues === 0,
    holdError,
    buyOff,
  }
}

// ---------------------------------------------------------------- labels

const num = (value: number | null): string =>
  value === null ? "?" : Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)

/** Label of a rule operand with the params of the side being edited (port of the server labels). */
export function operandLabel(
  operand: PracticeOperand,
  indicator: { id: string; name: string },
  fields: readonly PracticeFormField[],
  params: Record<string, string>,
): string {
  const p = (key: string): string => num(parseNumberText(params[key]))
  if (operand.kind === "param") {
    const unit = fields.find((field) => field.key === operand.key)?.unit
    return `${p(operand.key)}${unit ? ` ${unit}` : ""}`
  }
  if (operand.kind === "constant") return String(operand.value)
  const suffix = operand.offset === -1 ? " phiên trước" : ""
  const valueLabel = ((): string => {
    switch (indicator.id) {
      case "ma":
        return `SMA ${p("period")}`
      case "ema":
        return `EMA ${p("period")}`
      case "stochastic":
        return "%K"
      case "cmf":
        return "CMF"
      case "williams_r":
        return "Williams %R"
      case "volume":
        return "Khối lượng"
      default:
        return indicator.name
    }
  })()
  const labels: Record<string, string> = {
    close: "Giá đóng cửa",
    volume: "Khối lượng",
    value: valueLabel,
    signal: indicator.id === "stochastic" ? "%D" : "Đường tín hiệu",
    histogram: "Histogram",
    plus: "+DI",
    minus: "−DI",
    fast: `SMA ${p("fast")}`,
    slow: `SMA ${p("slow")}`,
    upper: "Dải trên",
    middle: "Đường giữa",
    lower: "Dải dưới",
    baseline: `SMA ${p("baseline")} của OBV`,
    threshold: `${p("mult")} × TB ${p("lookback")} phiên`,
  }
  return `${labels[operand.key] ?? operand.key}${suffix}`
}

export function ruleSideLabels(
  rule: PracticeFormRule,
  indicator: { id: string; name: string },
  fields: readonly PracticeFormField[],
  params: Record<string, string>,
): { left: string; right: string } {
  const left = operandLabel(rule.lhs, indicator, fields, params)
  const rhs = rule.rhs
  if ("lower" in rhs) {
    return { left, right: `(${operandLabel(rhs.lower, indicator, fields, params)}; ${operandLabel(rhs.upper, indicator, fields, params)})` }
  }
  return { left, right: operandLabel(rhs, indicator, fields, params) }
}

/** "Mua: 14 / 30 · < · >" style summary of one locked config (history list). */
export function configSummary(config: PracticeConfig): string {
  return SIDES.map((side) => {
    const value = config[side]
    return `${SIDE_LABEL[side]}: ${value.enabled ? `${Object.values(value.params).join(" / ")} · ${Object.values(value.ops).join(" · ")}` : "Tắt"}`
  }).join(" | ")
}

// ---------------------------------------------------------------- replay frames

export type TradeRowView = {
  trade: PracticeTrade
  /** Still held at the displayed frame (shows "Đang giữ" and a provisional P/L). */
  holding: boolean
  sellSession: number | null
  sellPrice: number | null
  heldSessions: number
  pnlVnd: number
  pnlRatio: number
  provisional: boolean
}

export type PracticeFrame = {
  revealed: number
  complete: boolean
  totalReturn: number | null
  buyCount: number
  closedCount: number
  rows: TradeRowView[]
}

function closeAt(run: PracticeRun, session: number): number | null {
  const chart = run.chart
  if (!chart) return null
  const value = chart.bars.close[session - chart.first_session]
  return finite(value) ? value : null
}

/**
 * Results as they stand after `revealed` sessions of the replay. Everything comes from the locked
 * server result (events, NAV and the candles already delivered); nothing is recomputed from the form.
 * At the last session the server's own KPIs and trades are used verbatim.
 */
export function frameAt(run: PracticeRun, revealed: number): PracticeFrame | null {
  const result = run.result
  if (!result) return null
  const last = result.last_session
  const complete = revealed >= last
  const rowOf = (trade: PracticeTrade): TradeRowView | null => {
    if (complete) {
      const closed = trade.status === "closed" && trade.sell !== null
      return {
        trade,
        holding: !closed,
        sellSession: trade.sell?.session ?? null,
        sellPrice: trade.sell?.price ?? null,
        heldSessions: trade.holding_sessions,
        pnlVnd: trade.pnl_vnd,
        pnlRatio: trade.pnl_ratio,
        provisional: !closed,
      }
    }
    if (trade.buy.session > revealed) return null
    if (trade.sell && trade.sell.session <= revealed) {
      return {
        trade,
        holding: false,
        sellSession: trade.sell.session,
        sellPrice: trade.sell.price,
        heldSessions: trade.holding_sessions,
        pnlVnd: trade.pnl_vnd,
        pnlRatio: trade.pnl_ratio,
        provisional: false,
      }
    }
    const close = closeAt(run, revealed)
    const pnl = close === null ? 0 : trade.qty * close - trade.buy.total_cost
    return {
      trade,
      holding: true,
      sellSession: null,
      sellPrice: null,
      heldSessions: Math.max(0, revealed - trade.buy.session),
      pnlVnd: pnl,
      pnlRatio: trade.buy.total_cost > 0 ? pnl / trade.buy.total_cost : 0,
      provisional: true,
    }
  }
  const rows = result.trades.map(rowOf).filter((row): row is TradeRowView => row !== null)
  const closedCount = rows.filter((row) => !row.holding).length
  if (complete) {
    return { revealed, complete, totalReturn: result.kpis.total_return, buyCount: result.kpis.buy_count, closedCount, rows }
  }
  const capital = result.kpis.capital_initial
  const nav = revealed >= 1 ? result.nav[revealed - 1] : capital
  return {
    revealed,
    complete,
    totalReturn: finite(nav) && capital > 0 ? nav / capital - 1 : null,
    buyCount: result.events.filter((event) => event.side === "buy" && event.session <= revealed).length,
    closedCount,
    rows,
  }
}

export const PENDING_REASON: Record<"indicator" | "max_holding" | "buy_signal", (name: string) => string> = {
  buy_signal: () => "Lệnh Mua theo điều kiện",
  indicator: (name) => `Lệnh Bán theo điều kiện ${name}`,
  max_holding: () => "Lệnh Bán do hết thời gian giữ",
}
