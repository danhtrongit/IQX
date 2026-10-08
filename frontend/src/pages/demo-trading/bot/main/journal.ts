import type { BotJournalItem } from "../types"

export type SessionLog = {
  date: string
  /** Buy source of that session: `VN30` or `Danh mục riêng · bản n`. */
  source: string
  /** Config revision the session's decisions used, when the server recorded one. */
  revision: number | null
  buys: number
  sells: number
  reasons: { label: string; count: number }[]
  decisions: BotJournalItem[]
}

export function decisionLabel(item: BotJournalItem): string {
  return item.reason_label ?? item.reason
}

export function sourceLabel(kind: string | null | undefined, revision: number | null | undefined): string {
  if (kind === "vn30") return "VN30"
  if (kind === "custom") return revision ? `Danh mục riêng · bản ${revision}` : "Danh mục riêng"
  return "—"
}

/** One log row per trading session, newest first, from decisions that arrive newest first. */
export function groupJournal(items: readonly BotJournalItem[]): SessionLog[] {
  const sessions = new Map<string, BotJournalItem[]>()
  for (const item of items) {
    const list = sessions.get(item.trading_date) ?? []
    list.push(item)
    sessions.set(item.trading_date, list)
  }
  return [...sessions.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, decisions]) => {
      const counts = new Map<string, number>()
      for (const decision of decisions) {
        if (decision.action === "buy" || decision.action === "sell") continue
        const label = decisionLabel(decision)
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      const first = decisions.find((decision) => decision.universe_kind !== null) ?? decisions[0]
      return {
        date,
        source: sourceLabel(first?.universe_kind, first?.universe_revision),
        revision: decisions.find((decision) => decision.decision_config_revision !== null)?.decision_config_revision ?? null,
        buys: decisions.filter((decision) => decision.action === "buy").length,
        sells: decisions.filter((decision) => decision.action === "sell").length,
        reasons: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
        decisions,
      }
    })
}

/** `Mua 1 · Bán 0 · Điều kiện Mua chưa đạt ×28` style summary of one session. */
export function sessionSummary(log: SessionLog, maxReasons = 2): string {
  const parts: string[] = []
  if (log.buys > 0) parts.push(`Mua ${log.buys}`)
  if (log.sells > 0) parts.push(`Bán ${log.sells}`)
  for (const reason of log.reasons.slice(0, maxReasons)) parts.push(reason.count > 1 ? `${reason.label} ×${reason.count}` : reason.label)
  const rest = log.reasons.length - maxReasons
  if (rest > 0) parts.push(`+${rest} lý do khác`)
  return parts.length > 0 ? parts.join(" · ") : "Không có quyết định"
}
