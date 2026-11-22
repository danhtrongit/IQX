/**
 * Backtest helpers over the Bot's Lịch phiên (`../shared/bot-schedule`, spec v2.0 §4.2–§4.4.2, §6.5):
 * the "Đang chạy trên Bot" / "Phiên tới" tags and the due list a save answer carries.
 */
import { duePositionsOf, hasStrategy, type BotSchedule, type ScheduleEntry, type ScheduleImpact, type StrategySource } from "../shared/bot-schedule"
import { errorDetails } from "../shared/errors"

/** "▶ Đang chạy trên Bot" / "→ Phiên tới" of one strategy (and one version when given). */
export function botTags(schedule: BotSchedule | undefined, ref: { source: StrategySource; id: string; version?: number }) {
  if (!schedule) return { running: false, next: false }
  const matches = (entry: ScheduleEntry | null | undefined) =>
    hasStrategy(entry) && entry.source === ref.source && entry.id === ref.id && (ref.version === undefined || entry.version === ref.version)
  const running = matches(schedule.last)
  const last = schedule.last
  const next = schedule.next
  const sameAsLast = hasStrategy(last) && hasStrategy(next) && last.source === next.source && last.id === next.id && last.version === next.version
  return { running, next: matches(next) && !(running && sameAsLast) }
}

/** The due list of a 422 `DUE_CONFIRM_REQUIRED` / 409 `DUE_POSITIONS_CHANGED` with its session and Giữ tối đa. */
export function dueImpactOf(error: unknown): ScheduleImpact | null {
  const positions = duePositionsOf(error)
  if (!positions) return null
  const source = errorDetails(error).find((item) => typeof item.next_session === "string" || typeof item.n_new === "number") ?? {}
  return {
    next_session: typeof source.next_session === "string" ? source.next_session : "",
    n_current: typeof source.n_current === "number" ? source.n_current : 0,
    n_new: typeof source.n_new === "number" ? source.n_new : 0,
    positions,
  }
}
