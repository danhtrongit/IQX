import { formatDate, formatNum } from "../format"
import { sideField } from "./draft"
import { CROSS_LABEL, ruleLine } from "./labels"
import type { Side, SharedConfig, SharedConfigState, TechnicalIndicator } from "./types"

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
