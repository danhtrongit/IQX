import { operandLabel } from "@/pages/demo-trading/bot/config/labels"
import type { TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { resultText } from "./evidence"
import { fmtNumber } from "./format"

const TH = "px-3 py-2 text-left text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase"

/** One rule as recorded when it was evaluated (alert signal or backtest fill). */
export type RuleEvidence = {
  id: string
  indicator: string
  side: "buy" | "sell"
  op: string
  lhs: number | null
  rhs: number | null
  rhs_lower?: number | null
  rhs_upper?: number | null
  result: boolean | null
  missing: boolean
  previous_lhs?: number | null
  previous_rhs?: number | null
}

/** Operand names come from the registry rule with the same id; the numbers are the recorded ones. */
function labelsOf(
  rule: RuleEvidence,
  indicators: readonly TechnicalIndicator[],
  params: Record<string, number> | undefined,
): { name: string; left: string; right: string } {
  const indicator = indicators.find((item) => item.id === rule.indicator)
  const definition = indicator?.[rule.side].rules.find((item) => item.id === rule.id)
  if (!indicator || !definition) return { name: rule.indicator.toUpperCase(), left: "Vế trái", right: "Vế phải" }
  return {
    name: indicator.name,
    left: operandLabel(definition.lhs, indicator, params ?? {}),
    right: operandLabel(definition.rhs, indicator, params ?? {}),
  }
}

/**
 * Left value, operator, right value and result of every rule, exactly as stored. Missing data is
 * shown as missing, never as a number or a pass.
 */
export function EvidenceTable({
  rules,
  indicators,
  paramsFor,
  label,
}: {
  rules: readonly RuleEvidence[]
  indicators: readonly TechnicalIndicator[]
  paramsFor: (rule: RuleEvidence) => Record<string, number> | undefined
  label: string
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[520px] border-collapse text-xs" aria-label={label}>
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className={TH}>Chỉ báo</th>
            <th scope="col" className={TH}>Vế trái</th>
            <th scope="col" className={`${TH} text-center`}>Dấu</th>
            <th scope="col" className={TH}>Vế phải</th>
            <th scope="col" className={TH}>Kết quả</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rules.map((rule) => {
            const labels = labelsOf(rule, indicators, paramsFor(rule))
            const interval = rule.op === "∈" || rule.op === "∉"
            return (
              <tr key={`${rule.indicator}-${rule.side}-${rule.id}`} className="align-top">
                <td className="px-3 py-2 font-medium">{labels.name}</td>
                <td className="px-3 py-2">
                  {labels.left}
                  <strong className="block tabular-nums">{rule.missing ? "Thiếu dữ liệu" : fmtNumber(rule.lhs, 4)}</strong>
                  {rule.previous_lhs != null && <small className="block text-muted-foreground">Phiên trước: {fmtNumber(rule.previous_lhs, 4)}</small>}
                </td>
                <td className="px-3 py-2 text-center text-base font-bold text-primary">{rule.op}</td>
                <td className="px-3 py-2">
                  {labels.right}
                  <strong className="block tabular-nums">
                    {rule.missing ? "Thiếu dữ liệu" : interval ? `${fmtNumber(rule.rhs_lower, 4)} … ${fmtNumber(rule.rhs_upper, 4)}` : fmtNumber(rule.rhs, 4)}
                  </strong>
                  {rule.previous_rhs != null && <small className="block text-muted-foreground">Phiên trước: {fmtNumber(rule.previous_rhs, 4)}</small>}
                </td>
                <td className="px-3 py-2 font-medium">{resultText(rule.result)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
