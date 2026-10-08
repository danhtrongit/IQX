import { formatDate, formatNum } from "../format"
import { sideField } from "./draft"
import { CROSS_LABEL, ruleLine } from "./labels"
import type { Side, SharedConfig, TechnicalIndicator } from "./types"

/**
 * When a saved revision starts to count, in the words of Bot SPEC §6.3/§7.4:
 * the first trading session dated after the save date. Nothing is guessed when the
 * trading calendar is missing.
 */
export function effectiveText(status: string | null | undefined, session: string | null | undefined): string | null {
  if (status === "calendar_unavailable") return "Chưa xác định phiên hiệu lực vì thiếu lịch giao dịch"
  if (!session) return null
  return status === "effective" ? `Đang có hiệu lực từ phiên ${formatDate(session)}` : `Có hiệu lực từ phiên ${formatDate(session)}`
}

export type ConditionItem = {
  id: string
  name: string
  /** `Chu kỳ RSI 14` style parameter chips. */
  params: string[]
  /** Rule lines with the operator in use, `Giao cắt giữa hai phiên: ` already prefixed. */
  rules: string[]
}

/** Indicators with master ON and the given side ON, in registry order, in readable form. */
export function activeConditions(config: SharedConfig | undefined, side: Side, indicators: readonly TechnicalIndicator[]): ConditionItem[] {
  if (!config) return []
  return indicators.flatMap((indicator): ConditionItem[] => {
    const saved = config.indicators[indicator.id]
    if (!saved?.master_enabled || !saved[side].enabled) return []
    const sideConfig = saved[side]
    const params = indicator.fields.flatMap((field) => {
      const meta = sideField(indicator, side, field.key)
      const value = sideConfig.params[field.key]
      return meta && value !== undefined ? [`${meta.label} ${formatNum(value)}${meta.unit ? ` ${meta.unit}` : ""}`] : []
    })
    const rules = sideConfig.rules.map((rule) => {
      const line = ruleLine(rule, rule.op, indicator, sideConfig.params)
      return rule.kind === "cross" ? `${CROSS_LABEL}: ${line}` : line
    })
    return [{ id: indicator.id, name: indicator.name, params, rules }]
  })
}
