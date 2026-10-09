import type { BotSession, BotSessionDecision } from "../types"
import { sourceText } from "./source"

export const ACTION_LABEL: Record<BotSessionDecision["action"], string> = { buy: "Mua", sell: "Bán", hold: "Giữ", skip: "Bỏ qua" }

/** The server's label for a decision or a reason group; its raw code or text when no label exists. */
export function reasonLabel(reason: { reason_label: string | null }, fallback: string): string {
  return reason.reason_label?.trim() || fallback
}

/** Buy source of the session: `VN30` or `<list name> · bản n`; `—` for a run from before sources existed. */
export function sessionSource(session: Pick<BotSession, "universe">): string {
  const universe = session.universe
  return universe ? sourceText(universe.kind, universe.name, universe.revision) : "—"
}

/** What a run that did not simply succeed means to the reader; `null` for a normal session. */
export function runStatusNote(status: BotSession["run_status"]): string | null {
  if (status === "running") return "Đang xử lý"
  if (status === "failed") return "Lỗi xử lý"
  return null
}

/**
 * `Mua 1 · Bán 0 · Điều kiện Mua chưa đạt ×28` style summary of one session, from the
 * server's counts and reason groups. Buys and sells are the counts; the reason groups
 * add why the other decisions were not trades, largest first.
 */
export function sessionSummary(session: Pick<BotSession, "counts" | "reasons">, maxReasons = 2): string {
  const parts: string[] = []
  if (session.counts.buy > 0) parts.push(`Mua ${session.counts.buy}`)
  if (session.counts.sell > 0) parts.push(`Bán ${session.counts.sell}`)
  const byLabel = new Map<string, number>()
  for (const reason of session.reasons) {
    if (reason.action === "buy" || reason.action === "sell") continue
    const label = reasonLabel(reason, reason.reason_code)
    byLabel.set(label, (byLabel.get(label) ?? 0) + reason.count)
  }
  const groups = [...byLabel.entries()].sort((a, b) => b[1] - a[1])
  for (const [label, count] of groups.slice(0, maxReasons)) parts.push(count > 1 ? `${label} ×${count}` : label)
  const rest = groups.length - maxReasons
  if (rest > 0) parts.push(`+${rest} lý do khác`)
  return parts.length > 0 ? parts.join(" · ") : "Không có quyết định"
}
