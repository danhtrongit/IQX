/**
 * Readable (Vietnamese) labels of rule operands for the 16 indicators, ported
 * from the approved Bot mockup (`operandLabel`). Param operands show the value
 * of the side being edited or shown.
 */
import { formatNum } from "../format"
import type { Operand, Rule, RuleOp, TechnicalIndicator } from "./types"

type Params = Record<string, number | undefined>

function paramText(value: number | undefined): string {
  return value === undefined ? "—" : formatNum(value)
}

/** Name of the `value` series of an indicator. */
function valueName(indicator: TechnicalIndicator, params: Params): string {
  switch (indicator.id) {
    case "ma": return `SMA ${paramText(params.period)}`
    case "ema": return `EMA ${paramText(params.period)}`
    case "stochastic": return "%K"
    case "cmf": return "CMF"
    case "williams_r": return "Williams %R"
    case "volume": return "Khối lượng"
    default: return indicator.name
  }
}

function seriesName(key: string, indicator: TechnicalIndicator, params: Params): string {
  switch (key) {
    case "close": return "Giá đóng cửa"
    case "volume": return "Khối lượng"
    case "value": return valueName(indicator, params)
    case "signal": return indicator.id === "stochastic" ? "%D" : "Đường tín hiệu"
    case "plus": return "+DI"
    case "minus": return "−DI"
    case "fast": return `SMA ${paramText(params.fast)}`
    case "slow": return `SMA ${paramText(params.slow)}`
    case "upper": return "Dải trên"
    case "lower": return "Dải dưới"
    case "baseline": return `SMA ${paramText(params.baseline)} của OBV`
    case "threshold": return `${paramText(params.mult)} × TB ${paramText(params.lookback)} phiên`
    default: return key
  }
}

/** An operand or the interval (`lower`/`upper`) of a membership rule. */
type AnyOperand = { kind?: string; key?: string; offset?: number; value?: number; lower?: Operand; upper?: Operand }

export function operandLabel(operand: Operand | AnyOperand, indicator: TechnicalIndicator, params: Params): string {
  const node = operand as AnyOperand
  if (node.kind === "param") {
    const unit = indicator.fields.find((field) => field.key === node.key)?.unit
    return `${paramText(params[node.key ?? ""])}${unit ? ` ${unit}` : ""}`
  }
  if (node.kind === "constant") return formatNum(node.value)
  if (node.kind === "series") {
    return `${seriesName(node.key ?? "", indicator, params)}${node.offset === -1 ? " phiên trước" : ""}`
  }
  if (node.lower && node.upper) return indicator.id === "bollinger" ? "Dải Bollinger" : `khoảng (${operandLabel(node.lower, indicator, params)}; ${operandLabel(node.upper, indicator, params)})`
  return "—"
}

/** `Giá đóng cửa > SMA 20` (cross rules are prefixed by the caller with the cross label). */
export function ruleLine(rule: Rule, op: RuleOp, indicator: TechnicalIndicator, params: Params): string {
  return `${operandLabel(rule.lhs, indicator, params)} ${op} ${operandLabel(rule.rhs, indicator, params)}`
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
