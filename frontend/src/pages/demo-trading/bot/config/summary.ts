import { formatDate, formatNum } from "../format"
import { sideField } from "./draft"
import { CROSS_LABEL, ruleLine, rowSentence } from "./labels"
import { isParamsSide, isRowsIndicator, type Side, type SharedConfig, type SharedConfigState, type TechnicalIndicator } from "./types"

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

export type ConfigRevision = { revision: number; config: SharedConfig; session: string | null }

/**
 * The configuration the Bot uses today. `state.config` is the latest SAVED revision (what the
 * form edits), which can be newer than the one in force, so the conditions the Bot follows
 * come from `state.effective`. A response without the field falls back to the saved config
 * only when no newer revision can be waiting.
 */
export function effectiveConfigOf(state: SharedConfigState | undefined): ConfigRevision | null {
  if (!state) return null
  if (state.effective !== undefined) {
    return state.effective ? { revision: state.effective.revision, config: state.effective.config, session: state.effective.effective_session } : null
  }
  return state.effective_revision !== null && state.effective_revision === state.saved_revision
    ? { revision: state.saved_revision, config: state.config, session: state.effective_session }
    : null
}

export type PendingConfig = ConfigRevision & { calendarUnavailable: boolean }

/**
 * The saved revision that does not count yet, or `null` when the latest saved revision is the
 * one in force (or has the same content as it). `session` is the first trading session it counts from.
 */
export function pendingConfigOf(state: SharedConfigState | undefined): PendingConfig | null {
  if (!state || state.saved_revision === 0) return null
  if (state.effective === undefined && state.effective_revision === state.saved_revision) return null
  const effective = state.effective ?? null
  if (effective && (effective.revision >= state.saved_revision || effective.config_hash === state.config_hash)) return null
  if (state.status === "effective") return null
  return {
    revision: state.saved_revision,
    config: state.config,
    session: state.status === "calendar_unavailable" ? null : state.effective_session,
    calendarUnavailable: state.status === "calendar_unavailable" || !state.effective_session,
  }
}

/** `Chờ hiệu lực từ phiên 09/10/2026`; never a guessed session when the trading calendar is missing. */
export function pendingStartText(pending: Pick<PendingConfig, "session" | "calendarUnavailable">): string {
  return pending.calendarUnavailable || !pending.session
    ? "Chờ hiệu lực · chưa xác định phiên bắt đầu vì thiếu lịch giao dịch"
    : `Chờ hiệu lực từ phiên ${formatDate(pending.session)}`
}

export type ConditionItem = {
  id: string
  name: string
  /** Volume only: `Số phiên tham chiếu 20 phiên` style parameter chips (rows carry their own values). */
  params: string[]
  /** The enabled conditions: row sentences with their values (`RSI 14 < 30`); Volume rule lines. */
  rules: string[]
}

/** Indicators with master ON, the given side ON and at least one enabled condition, in registry order, in readable form. */
export function activeConditions(config: SharedConfig | undefined, side: Side, indicators: readonly TechnicalIndicator[]): ConditionItem[] {
  if (!config) return []
  return indicators.flatMap((indicator): ConditionItem[] => {
    const saved = config.indicators[indicator.id]
    if (!saved?.master_enabled || !saved[side]?.enabled) return []
    const sideConfig = saved[side]
    if (isRowsIndicator(indicator)) {
      if (isParamsSide(sideConfig)) return []
      const rules = sideConfig.rules.flatMap((row) => {
        if (row.enabled === false) return []
        const definition = indicator.rows.find((item) => item.id === row.id)
        return [definition ? rowSentence(definition, row) : row.id]
      })
      return rules.length > 0 ? [{ id: indicator.id, name: indicator.name, params: [], rules }] : []
    }
    if (!isParamsSide(sideConfig)) return []
    const activeRules = sideConfig.rules.filter((rule) => rule.enabled !== false)
    if (activeRules.length === 0) return []
    const params = indicator.fields.flatMap((field) => {
      const meta = sideField(indicator, side, field.key)
      const value = sideConfig.params[field.key]
      return meta && value !== undefined ? [`${meta.label} ${formatNum(value)}${meta.unit ? ` ${meta.unit}` : ""}`] : []
    })
    const rules = activeRules.map((rule) => {
      const line = ruleLine(rule, rule.op, indicator, sideConfig.params)
      return rule.kind === "cross" ? `${CROSS_LABEL}: ${line}` : line
    })
    return [{ id: indicator.id, name: indicator.name, params, rules }]
  })
}
