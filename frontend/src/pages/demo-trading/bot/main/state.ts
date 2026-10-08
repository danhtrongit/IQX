import { formatDate } from "../format"
import type { BotConditions, BotConfigState } from "../types"

export type ChipTone = "good" | "info" | "danger" | "muted"
export type StateChip = { label: string; tone: ChipTone; detail: string | null }

const STATE_LABEL: Record<BotConfigState, string> = {
  waiting_for_conditions: "Chờ thiết lập điều kiện",
  buy_only: "Đã bật điều kiện Mua",
  sell_only: "Chỉ xét điều kiện Bán",
  buy_and_sell: "Đã bật Mua và Bán",
  error: "Lỗi cấu hình hoặc quyền",
}

const STATE_TONE: Record<BotConfigState, ChipTone> = {
  waiting_for_conditions: "info",
  buy_only: "good",
  sell_only: "info",
  buy_and_sell: "good",
  error: "danger",
}

export type SideBlock = { side: "buy" | "sell"; detail: string; indicatorIds: string[] }

/** The side errors of the effective config (permissions, validity, legacy review). */
export function sideBlocks(conditions: BotConditions | null | undefined): SideBlock[] {
  const errors = conditions?.errors
  if (!errors) return []
  return (["buy", "sell"] as const).flatMap((side) => {
    const block = errors[side]
    return block ? [{ side, detail: block.detail, indicatorIds: block.indicator_ids }] : []
  })
}

/**
 * The config state chip. It comes from the EFFECTIVE configuration the server computed,
 * never from saved switches, so a saved-but-pending revision does not read as "the Bot
 * is buying". Unknown states are shown as unknown, not as "waiting".
 */
export function configStateChip(conditions: BotConditions | null | undefined): StateChip {
  if (!conditions) return { label: "Chưa xác định điều kiện", tone: "muted", detail: null }
  const known = conditions.state in STATE_LABEL
  if (!known) return { label: conditions.state_label || "Chưa xác định điều kiện", tone: "muted", detail: null }
  const blocks = sideBlocks(conditions)
  return {
    label: STATE_LABEL[conditions.state],
    tone: STATE_TONE[conditions.state],
    detail: blocks.length > 0 ? blocks.map((block) => `${block.side === "buy" ? "Mua" : "Bán"}: ${block.detail}`).join(" · ") : null,
  }
}

/**
 * `bot.new_buys_enabled` of the overview (Bot SPEC 8.4 / 18.2). `null` while the server does not
 * say (no Bot account, older API): then the page shows no note rather than guessing.
 */
export function newBuysEnabledOf(overview: { bot?: unknown } | null | undefined): boolean | null {
  const bot = overview?.bot as { new_buys_enabled?: unknown } | null | undefined
  return typeof bot?.new_buys_enabled === "boolean" ? bot.new_buys_enabled : null
}

/** Shown under the conditions while real new buys are switched off (candidate order unconfirmed). */
export const NEW_BUYS_OFF_NOTE = "Chưa bật mua mới: thứ tự ứng viên chờ xác nhận. Bot vẫn xét Bán cho các mã đang giữ; các lượt Mua chỉ được ghi vào nhật ký là bỏ qua."

/**
 * The saved-vs-effective note under the condition cards, or `null` when nothing is
 * waiting. The session is the server's; with no trading calendar it is reported as such.
 */
export function pendingConfigNote(conditions: BotConditions | null | undefined): string | null {
  const pending = conditions?.pending
  if (!conditions || !pending) return null
  const when =
    pending.status === "calendar_unavailable" || !pending.effective_session
      ? "chưa xác định phiên bắt đầu vì thiếu lịch giao dịch"
      : `thay đổi bắt đầu từ phiên ${formatDate(pending.effective_session)}`
  return conditions.effective_revision === null
    ? `Đã lưu cấu hình bản ${pending.revision}. Chưa có bản nào đang hiệu lực; ${when}.`
    : `Đã lưu cấu hình bản ${pending.revision}. Bản ${conditions.effective_revision} vẫn đang có hiệu lực; ${when}.`
}
