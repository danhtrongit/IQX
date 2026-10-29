/**
 * Pure helpers of the practice screen: form state (text inputs), client validation that mirrors the
 * server rules, labels, replay frames and number formatting. Nothing here touches React or the
 * network, so it is unit-tested directly.
 *
 * Row-based indicators (SPEC V3) are edited as condition rows, with the row type, text drafts and
 * validation of the Bot form (`bot/config`). Volume keeps its side-level params and rule operators.
 */
import { draftRow, rowFromDraft, type DraftRow } from "@/pages/demo-trading/bot/config/draft"
import { rowSentence, ruleOpLabel } from "@/pages/demo-trading/bot/config/labels"
import type { RowDefinition } from "@/pages/demo-trading/bot/config/types"
import { validateSideRows } from "@/pages/demo-trading/bot/config/validate"

import {
  HOLD_MAX,
  HOLD_MIN,
  isParamsConfig,
  isParamsForm,
  isRowsConfig,
  isRowsForm,
  type PracticeConfig,
  type PracticeForm,
  type PracticeFormField,
  type PracticeFormRule,
  type PracticeOp,
  type PracticeOperand,
  type PracticeParamsForm,
  type PracticeParamsSideConfig,
  type PracticePreviewBody,
  type PracticeRowConfig,
  type PracticeRowsConfig,
  type PracticeRun,
  type PracticeSell,
  type PracticeTrade,
  type Side,
} from "./practice-api"
import { legacyParamMeta, legacyRuleLabel, type ParamMeta } from "./practice-legacy"

export const SIDES: readonly Side[] = ["buy", "sell"]
export const SIDE_LABEL: Record<Side, string> = { buy: "Mua", sell: "Bán" }

const STEP_TOLERANCE = 1e-6

// ---------------------------------------------------------------- number formatting

const intFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const decFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const pctFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })
const signedIntFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0, signDisplay: "exceptZero" })

/** Typographic minus (U+2212) like the approved sample, instead of the hyphen Intl emits. */
const trueMinus = (text: string): string => text.replace("-", "−")

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
  /** Condition rows in registry order (row-based indicators): each row's switch and values as typed. Empty otherwise. */
  rows: DraftRow[]
  /** Volume, or a config locked before SPEC V3: raw text of every side-level parameter (so "" and "1." can be typed). */
  params: Record<string, string>
  ops: Record<string, PracticeOp>
  rules_enabled?: Record<string, boolean>
}
export type PracticeFormState = {
  /** The shape of the config the form was made from: condition rows, or side-level params. */
  model: "rows" | "params"
  buy: SideFormState
  sell: SideFormState
  hold: string
}

/** The stored rows of a tab laid out in registry order; a row the config lacks reads as an empty row that is off. */
function rowsToForm(rules: readonly PracticeRowConfig[], definitions: readonly RowDefinition[] | null): DraftRow[] {
  if (!definitions) return rules.map(draftRow)
  return definitions.map((definition) => {
    const stored = rules.find((rule) => rule.id === definition.id)
    return stored ? draftRow(stored) : { id: definition.id, enabled: false, values: {} }
  })
}

function sideToForm(side: PracticeConfig["buy"], definitions: readonly RowDefinition[] | null): SideFormState {
  if ("rules" in side) return { enabled: side.enabled, rows: rowsToForm(side.rules, definitions), params: {}, ops: {} }
  return {
    enabled: side.enabled,
    rows: [],
    params: Object.fromEntries(Object.entries(side.params).map(([key, value]) => [key, String(value)])),
    ops: { ...side.ops },
    ...(side.rules_enabled ? { rules_enabled: { ...side.rules_enabled } } : {}),
  }
}

/**
 * Form state of a config. `spec` lays the rows out in registry order; a config in the other
 * format (a run locked before SPEC V3) keeps its own shape and is only shown, never edited.
 */
export function toFormState(config: PracticeConfig, spec: PracticeForm | null): PracticeFormState {
  const definitions = spec && isRowsForm(spec) ? spec.rows : null
  return {
    model: isRowsConfig(config) ? "rows" : "params",
    buy: sideToForm(config.buy, definitions),
    sell: sideToForm(config.sell, definitions),
    hold: String(config.hold_max_sessions),
  }
}

/** Plain number from an input text; null when empty or not a finite number. */
export function parseNumberText(text: string | undefined): number | null {
  if (text === undefined) return null
  const trimmed = text.trim()
  if (trimmed === "") return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

function paramsSideToConfig(side: SideFormState, fields: readonly PracticeFormField[]): PracticeParamsSideConfig | null {
  const params: Record<string, number> = {}
  for (const field of fields) {
    const value = parseNumberText(side.params[field.key])
    if (value === null) return null
    params[field.key] = value
  }
  return {
    enabled: side.enabled,
    params,
    ops: { ...side.ops },
    ...(side.rules_enabled ? { rules_enabled: { ...side.rules_enabled } } : {}),
  }
}

/** Params of one side as numbers, or null while any input is empty/not numeric. */
export function sideParams(side: SideFormState, fields: readonly PracticeFormField[]): Record<string, number> | null {
  return paramsSideToConfig(side, fields)?.params ?? null
}

/** The stored rows of a tab, or null while any number is empty or not numeric (nothing is guessed). */
function rowsSideToConfig(side: SideFormState, definitions: readonly RowDefinition[]): PracticeRowsConfig["buy"] | null {
  const rules: PracticeRowConfig[] = []
  for (const [index, definition] of definitions.entries()) {
    const row = side.rows[index]
    if (!row) return null
    const stored = rowFromDraft(definition, row)
    if (definition.fields.some((field) => field.type !== "enum" && !finite(stored[field.key] as number))) return null
    rules.push(stored)
  }
  return { enabled: side.enabled, rules }
}

/** Numeric config for the API; null while any input is unparseable (nothing is clamped or guessed). */
export function toConfig(form: PracticeFormState, spec: PracticeForm): PracticeConfig | null {
  const hold = parseNumberText(form.hold)
  if (hold === null) return null
  if (isRowsForm(spec)) {
    if (form.model !== "rows") return null
    const buy = rowsSideToConfig(form.buy, spec.rows)
    const sell = rowsSideToConfig(form.sell, spec.rows)
    return buy && sell ? { buy, sell, hold_max_sessions: hold } : null
  }
  if (form.model !== "params") return null
  const buy = paramsSideToConfig(form.buy, spec.buy.fields)
  const sell = paramsSideToConfig(form.sell, spec.sell.fields)
  return buy && sell ? { buy, sell, hold_max_sessions: hold } : null
}

/**
 * The rows the chart preview sends for one tab: every row, registry order. A row that is OFF is
 * never drawn nor validated by the server, so a half-edited one is sent with its registry default
 * instead of blocking the chart of the rows that are ON. A row that is ON must be complete.
 */
function previewRows(side: SideFormState, definitions: readonly RowDefinition[], which: Side): PracticeRowConfig[] | null {
  const rules: PracticeRowConfig[] = []
  for (const [index, definition] of definitions.entries()) {
    const row = side.rows[index] ?? { id: definition.id, enabled: false, values: {} }
    const stored = rowFromDraft(definition, row)
    for (const field of definition.fields) {
      if (field.type === "enum" || finite(stored[field.key] as number)) continue
      const fallback = definition[which][field.key]
      if (row.enabled || fallback === undefined) return null
      stored[field.key] = fallback
    }
    rules.push(stored)
  }
  return rules
}

/** Body of the chart preview for the form as it stands; null while something the chart draws is incomplete. */
export function previewBodyOf(form: PracticeFormState, spec: PracticeForm): PracticePreviewBody | null {
  if (isRowsForm(spec)) {
    if (form.model !== "rows") return null
    const buy = previewRows(form.buy, spec.rows, "buy")
    const sell = previewRows(form.sell, spec.rows, "sell")
    return buy && sell ? { buy_rows: buy, sell_rows: sell } : null
  }
  if (form.model !== "params") return null
  const buy = sideParams(form.buy, spec.buy.fields)
  const sell = sideParams(form.sell, spec.sell.fields)
  return buy && sell ? { buy_params: buy, sell_params: sell } : null
}

const sortedEntries = <T>(record: Record<string, T>): Array<[string, T]> =>
  Object.entries(record).sort(([a], [b]) => a.localeCompare(b))

/** Stable text of a config (key order independent) used to compare drafts and key idempotency. */
export function configSignature(config: PracticeConfig): string {
  const side = (value: PracticeConfig["buy"]) => {
    if ("rules" in value) {
      return {
        enabled: value.enabled,
        rules: value.rules.map(({ id, enabled, ...values }) => ({ id, enabled, values: Object.fromEntries(sortedEntries(values)) })),
      }
    }
    return {
      enabled: value.enabled,
      params: Object.fromEntries(sortedEntries(value.params)),
      ops: Object.fromEntries(sortedEntries(value.ops)),
      ...(value.rules_enabled ? { rules_enabled: Object.fromEntries(sortedEntries(value.rules_enabled)) } : {}),
    }
  }
  return JSON.stringify({ buy: side(config.buy), sell: side(config.sell), hold: config.hold_max_sessions })
}

/**
 * "Mặc định": the rows (or, for Volume, the params and operators) of this side go back to the
 * registry defaults. `enabled`, the other side and the hold time stay.
 */
export function resetSide(form: PracticeFormState, spec: PracticeForm, side: Side): PracticeFormState {
  const defaults = toFormState(spec.defaults, spec)
  if (defaults.model !== form.model) return form
  return { ...form, [side]: { ...defaults[side], enabled: form[side].enabled } }
}

// ---------------------------------------------------------------- validation

export type PracticeIssue = {
  path: string
  side: Side | null
  message: string
  /** Condition rows: the 1-based row number the message is about, and the field to flag. */
  row?: number
  field?: string
}
export type PracticeFormValidation = {
  valid: boolean
  issues: PracticeIssue[]
  byPath: Record<string, string>
  sideHasIssue: Record<Side, boolean>
  /** True when everything the chart draws is valid (the rows that are ON, or Volume's params): enough for a chart preview. */
  previewReady: boolean
  holdError: string | null
  buyOff: boolean
}

export const HOLD_ERROR = `Nhập số phiên nguyên từ ${HOLD_MIN} đến ${intFormat.format(HOLD_MAX)}.`
export const FORMAT_ERROR = "Định dạng điều kiện cũ, chỉ để xem lại."

function validateSideParams(side: Side, form: SideFormState, spec: PracticeParamsForm, issues: PracticeIssue[]): void {
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

/**
 * Both tabs are checked before Start, every row included whatever its switch (SPEC V3 §4); the
 * messages are the server's (`Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.`). Nothing the
 * user typed is repaired.
 */
export function validatePracticeForm(form: PracticeFormState, spec: PracticeForm): PracticeFormValidation {
  const issues: PracticeIssue[] = []
  let previewReady = false
  if (isRowsForm(spec) && form.model === "rows") {
    previewReady = true
    for (const side of SIDES) {
      for (const error of validateSideRows(spec.indicator_id, spec.rows, side, form[side].rows)) {
        issues.push({ path: `${side}.rules.${error.row - 1}.${error.field}`, side, message: error.message, row: error.row, field: error.field })
        // The chart draws the rows that are ON only: a half-edited row that is OFF never blocks it (it still blocks Start).
        if (form[side].rows[error.row - 1]?.enabled !== false) previewReady = false
      }
    }
  } else if (isParamsForm(spec) && form.model === "params") {
    for (const side of SIDES) validateSideParams(side, form[side], spec, issues)
    previewReady = issues.length === 0
  } else {
    // A config in the other format (a run locked before SPEC V3) is shown as it was, never started again.
    issues.push({ path: "format", side: null, message: FORMAT_ERROR })
  }
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
    previewReady,
    holdError,
    buyOff,
  }
}

// ---------------------------------------------------------------- labels

const num = (value: number | null): string =>
  value === null ? "?" : Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)

/** Label of a rule operand with the params of the side being edited (Volume's rule templates). */
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
  if ("offset_param" in operand && operand.offset_param) {
    return `so với tại t − ${p(operand.offset_param)}`
  }
  const suffix = operand.offset === -1 ? " phiên trước" : ""
  const labels: Record<string, string> = {
    close: "Giá đóng cửa",
    volume: "Khối lượng",
    value: indicator.name,
    threshold: `${p("mult")} × TB ${p("lookback")} phiên`,
  }
  return `${labels[operand.key] ?? operand.key}${suffix}`
}

/** Operator text of a stored code (Volume's selects and the evidence of a run): the Bot form's wording. */
export { ruleOpLabel }

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

/**
 * Label and unit of a side param: from the live form when the indicator still has one (Volume),
 * from the labels of the old forms for a run locked before SPEC V3.
 */
export function paramMeta(indicatorId: string, spec: PracticeForm | null, side: Side, key: string): ParamMeta {
  if (spec && isParamsForm(spec)) {
    const field = spec[side].fields.find((item) => item.key === key)
    if (field) return { label: field.label, unit: field.unit }
  }
  return legacyParamMeta(indicatorId, key) ?? { label: key, unit: "" }
}

/** `Điều kiện 2: >` lines of a side locked before SPEC V3, in rule order. */
export function legacySideEntries(
  indicatorId: string,
  spec: PracticeForm | null,
  side: Side,
  form: SideFormState,
): Array<{ label: string; value: string }> {
  const params = Object.entries(form.params).map(([key, text]) => {
    const meta = paramMeta(indicatorId, spec, side, key)
    return { label: meta.label, value: `${text}${meta.unit ? ` ${meta.unit}` : ""}` }
  })
  const ops = Object.entries(form.ops).map(([ruleId, op]) => ({ label: legacyRuleLabel(ruleId), value: ruleOpLabel(op) }))
  return [...params, ...ops]
}

function sideSummary(side: PracticeConfig["buy"], spec: PracticeForm | null): string {
  if (!side.enabled) return "Tắt"
  if ("rules" in side) {
    const definitions = spec && isRowsForm(spec) ? spec.rows : []
    const sentences = side.rules
      .filter((row) => row.enabled)
      .map((row) => {
        const definition = definitions.find((item) => item.id === row.id)
        return definition ? rowSentence(definition, row) : row.id
      })
    return sentences.length > 0 ? sentences.join(" và ") : "Không có điều kiện nào được bật"
  }
  return `${Object.values(side.params).join(" / ")} · ${Object.values(side.ops).map(ruleOpLabel).join(" · ")}`
}

/** "Mua: RSI 14 < 30 | Bán: Tắt" style summary of one locked config (history list). */
export function configSummary(config: PracticeConfig, spec: PracticeForm | null): string {
  return SIDES.map((side) => `${SIDE_LABEL[side]}: ${sideSummary(config[side], spec)}`).join(" | ")
}

/** True for a config in the format before SPEC V3 under an indicator that now has condition rows. */
export function isLegacyFor(config: PracticeConfig, spec: PracticeForm | null): boolean {
  return !!spec && isRowsForm(spec) && isParamsConfig(config)
}

// ---------------------------------------------------------------- replay frames

export type TradeRowView = {
  trade: PracticeTrade
  /** Still held at the displayed frame (shows "Đang giữ" and a provisional P/L). */
  holding: boolean
  /**
   * The sell leg once it has happened at the displayed frame; null while the position is held.
   * Read the sell from here, never from `trade.sell`, which already holds a later session.
   */
  sell: PracticeSell | null
  sellSession: number | null
  sellPrice: number | null
  heldSessions: number
  pnlVnd: number
  pnlRatio: number
  provisional: boolean
  /** Valuation of a position held at this frame: the close of the displayed session, never a later one. */
  mark: { session: number; price: number; marketValue: number } | null
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
 * At the last session the server's own KPIs and trades are used verbatim. Before it, a trade that
 * is still held exposes neither its later sell nor the valuation of the last session (SPEC V3 §5).
 */
export function frameAt(run: PracticeRun, revealed: number): PracticeFrame | null {
  const result = run.result
  if (!result) return null
  const last = result.last_session
  const complete = revealed >= last
  const rowOf = (trade: PracticeTrade): TradeRowView | null => {
    if (complete) {
      const sell = trade.status === "closed" ? trade.sell : null
      return {
        trade,
        holding: sell === null,
        sell,
        sellSession: sell?.session ?? null,
        sellPrice: sell?.price ?? null,
        heldSessions: trade.holding_sessions,
        pnlVnd: trade.pnl_vnd,
        pnlRatio: trade.pnl_ratio,
        provisional: sell === null,
        mark: sell === null && trade.mark ? { session: trade.mark.session, price: trade.mark.price, marketValue: trade.mark.market_value } : null,
      }
    }
    if (trade.buy.session > revealed) return null
    if (trade.sell && trade.sell.session <= revealed) {
      return {
        trade,
        holding: false,
        sell: trade.sell,
        sellSession: trade.sell.session,
        sellPrice: trade.sell.price,
        heldSessions: trade.holding_sessions,
        pnlVnd: trade.pnl_vnd,
        pnlRatio: trade.pnl_ratio,
        provisional: false,
        mark: null,
      }
    }
    const close = closeAt(run, revealed)
    const pnl = close === null ? 0 : trade.qty * close - trade.buy.total_cost
    return {
      trade,
      holding: true,
      sell: null,
      sellSession: null,
      sellPrice: null,
      heldSessions: Math.max(0, revealed - trade.buy.session),
      pnlVnd: pnl,
      pnlRatio: trade.buy.total_cost > 0 ? pnl / trade.buy.total_cost : 0,
      provisional: true,
      mark: close === null ? null : { session: revealed, price: close, marketValue: trade.qty * close },
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

