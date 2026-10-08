import { formatNum } from "../format"
import type { BotSessionDecision } from "../types"

export type EvidenceLine = { key: string; text: string; outcome: "met" | "not_met" | "missing" }

type RawRule = {
  id?: unknown
  indicator?: unknown
  side?: unknown
  op?: unknown
  lhs?: unknown
  rhs?: unknown
  rhs_lower?: unknown
  rhs_upper?: unknown
  result?: unknown
  missing?: unknown
}

const num = (value: unknown): string => (typeof value === "number" ? formatNum(value) : "—")

/**
 * Rule evidence frozen with a decision (`condition_snapshot.rules`): the values the
 * Bot compared and whether the rule held. Missing data is "thiếu dữ liệu", never "không đạt".
 */
export function evidenceLines(item: Pick<BotSessionDecision, "condition_snapshot">, names: Readonly<Record<string, string>>): EvidenceLine[] {
  const rules = item.condition_snapshot?.rules
  if (!Array.isArray(rules)) return []
  return rules.flatMap((raw, index): EvidenceLine[] => {
    if (!raw || typeof raw !== "object") return []
    const rule = raw as RawRule
    const indicator = typeof rule.indicator === "string" ? (names[rule.indicator] ?? rule.indicator) : "—"
    const op = typeof rule.op === "string" ? rule.op : "?"
    const right = rule.rhs_lower !== undefined && rule.rhs_upper !== undefined ? `(${num(rule.rhs_lower)}; ${num(rule.rhs_upper)})` : num(rule.rhs)
    const outcome = rule.missing === true || typeof rule.result !== "boolean" ? "missing" : rule.result ? "met" : "not_met"
    const verdict = outcome === "met" ? "đạt" : outcome === "not_met" ? "không đạt" : "thiếu dữ liệu"
    const side = rule.side === "buy" ? "Mua" : rule.side === "sell" ? "Bán" : ""
    return [{ key: `${String(rule.id ?? index)}-${index}`, text: `${side ? `${side} · ` : ""}${indicator} ${typeof rule.id === "string" ? rule.id : ""}: ${num(rule.lhs)} ${op} ${right} — ${verdict}`.replace(/\s+:/, ":"), outcome }]
  })
}
