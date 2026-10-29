/**
 * Readable (Vietnamese) text of the conditions.
 *
 * Row conditions (15 indicators) are their registry sentence with the row's own values in place
 * of the `{field}` slots (`RSI 14 < 30`, `Giá cắt lên SMA 20`). Volume keeps its rule templates,
 * read through `operandLabel` with the side's params.
 */
import { formatNum } from "../format"
import type { Operand, ParamsIndicator, RegistryField, Rule, RowDefinition, RowField, RuleOp, Side } from "./types"
import { SIDE_LABEL } from "./validate"

/* ── Row sentences ──────────────────────────────────────────────────────── */

export type SentencePart = { text: string } | { field: string }

/** Split a row sentence into fixed text and `{field}` slots, in order (same split as the server). */
export function sentenceParts(sentence: string): SentencePart[] {
  const parts: SentencePart[] = []
  let last = 0
  for (const match of sentence.matchAll(/\{([a-z_]+)\}/g)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: sentence.slice(last, index) })
    parts.push({ field: match[1] as string })
    last = index + match[0].length
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last) })
  return parts
}

/** Shown text of one value: the option label of an enum code, the number as stored otherwise. */
export function fieldValueText(field: RowField | undefined, value: unknown): string {
  if (value === undefined || value === null || value === "") return "?"
  if (field?.type === "enum") return field.options.find((option) => option.value === value)?.label ?? String(value)
  return String(value)
}

/**
 * Row text with its values, e.g. `RSI 14 < 30`, `CMF 20 cắt lên -0.05`, `ROC 20 cắt lên 5 %`
 * (numbers exactly as stored, enum codes by their label, a missing value as `?`).
 */
export function rowSentence(definition: RowDefinition, values: Readonly<Record<string, unknown>>): string {
  return definition.sentence.replace(/\{([a-z_]+)\}/g, (_match, key: string) =>
    fieldValueText(definition.fields.find((field) => field.key === key), values[key]),
  )
}

/** `Chu kỳ RSI (dòng 1, Mua)`: the field's registry label, made unique per row and tab. */
export function fieldAriaLabel(field: Pick<RowField, "label">, side: Side, row: number): string {
  return `${field.label} (dòng ${row}, ${SIDE_LABEL[side]})`
}

/** `Bật điều kiện 1 (Mua)` */
export function rowSwitchLabel(side: Side, row: number): string {
  return `Bật điều kiện ${row} (${SIDE_LABEL[side]})`
}

/** `2/3 điều kiện được bật · Các điều kiện đang bật phải đồng thời thỏa mãn` */
export function enabledCountText(rows: readonly { enabled: boolean }[]): string {
  const on = rows.filter((row) => row.enabled).length
  return `${on}/${rows.length} điều kiện được bật${rows.length > 1 ? " · Các điều kiện đang bật phải đồng thời thỏa mãn" : ""}`
}

/* ── Volume rule templates ──────────────────────────────────────────────── */

type Params = Record<string, number | undefined>
type OperandIndicator = Pick<ParamsIndicator, "id" | "name"> & { fields?: readonly RegistryField[] }

function paramText(value: number | undefined): string {
  return value === undefined ? "—" : formatNum(value)
}

function seriesName(key: string, indicator: OperandIndicator, params: Params): string {
  switch (key) {
    case "close": return "Giá đóng cửa"
    case "volume": return "Khối lượng"
    case "value": return indicator.id === "volume" ? "Khối lượng" : indicator.name
    case "threshold": return `${paramText(params.mult)} × TB ${paramText(params.lookback)} phiên`
    default: return key
  }
}

/** An operand or the interval (`lower`/`upper`) of a membership rule. */
type AnyOperand = {
  kind?: string
  key?: string
  offset?: number
  offset_param?: string
  value?: number
  lower?: Operand
  upper?: Operand
}

export function operandLabel(operand: Operand | AnyOperand, indicator: OperandIndicator, params: Params): string {
  const node = operand as AnyOperand
  if (node.kind === "param") {
    const unit = indicator.fields?.find((field) => field.key === node.key)?.unit
    return `${paramText(params[node.key ?? ""])}${unit ? ` ${unit}` : ""}`
  }
  if (node.kind === "constant") return formatNum(node.value)
  if (node.kind === "series") {
    if (node.offset_param) return `so với tại t − ${paramText(params[node.offset_param])}`
    return `${seriesName(node.key ?? "", indicator, params)}${node.offset === -1 ? " phiên trước" : ""}`
  }
  if (node.lower && node.upper) return `khoảng (${operandLabel(node.lower, indicator, params)}; ${operandLabel(node.upper, indicator, params)})`
  return "—"
}

const NAMED_OP_LABELS: Record<string, string> = {
  cross_up: "cắt lên",
  cross_down: "cắt xuống",
  reenter_lower: "quay vào dải từ dưới",
  reenter_upper: "quay vào dải từ trên",
  break_upper: "vượt dải trên",
  break_lower: "phá dải dưới",
  cross_up_middle: "cắt lên dải giữa",
  cross_down_middle: "cắt xuống dải giữa",
  break_high: "vượt đỉnh",
  break_low: "phá đáy",
}

/** Label of a stored operator code (evidence, Volume selects). */
export function ruleOpLabel(op: string): string {
  return NAMED_OP_LABELS[op] ?? op
}

/** `Giá đóng cửa > Giá đóng cửa phiên trước` (cross rules are prefixed by the caller with the cross label). */
export function ruleLine(rule: Rule, op: RuleOp, indicator: OperandIndicator, params: Params): string {
  return `${operandLabel(rule.lhs, indicator, params)} ${ruleOpLabel(op)} ${operandLabel(rule.rhs, indicator, params)}`
}

export const CROSS_LABEL = "Giao cắt giữa hai phiên"

/** Param numbers from the text a user typed; invalid text is `undefined` (shown as "—"). */
export function numericParams(params: Record<string, string>): Params {
  return Object.fromEntries(
    Object.entries(params).map(([key, text]) => {
      const value = text.trim() === "" ? Number.NaN : Number(text)
      return [key, Number.isFinite(value) ? value : undefined]
    }),
  )
}
