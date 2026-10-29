import { operandLabel, ruleOpLabel, rowSentence } from "@/pages/demo-trading/bot/config/labels"
import { isRowsIndicator, type TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

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
  /** The row's own values when it was evaluated (SPEC V3 rows; Volume: its params). Absent on older evidence. */
  values?: Record<string, number | string>
}

type Labels = { name: string; condition: string | null; left: string; right: string }

const GENERIC = { left: "Vế trái", right: "Vế phải" }

/**
 * Names of one recorded rule, version-aware:
 * - a condition row (`rsi.level`) recorded with its `values` reads as the row sentence with
 *   those values (`RSI 14 < 30`), never with today's settings;
 * - a Volume rule reads its operands from the registry template with the recorded params;
 * - older evidence (rule ids `r1`…, recorded before SPEC V3) keeps what it stored: the indicator,
 *   the operator and the numbers, with the params it was evaluated with when they were kept.
 *   It is never relabelled through today's rows.
 */
function labelsOf(rule: RuleEvidence, indicators: readonly TechnicalIndicator[], params: Record<string, number> | undefined): Labels {
  const indicator = indicators.find((item) => item.id === rule.indicator)
  const name = indicator?.name ?? rule.indicator.toUpperCase()
  if (indicator && isRowsIndicator(indicator)) {
    const definition = indicator.rows.find((row) => row.id === rule.id)
    if (definition && rule.values) return { name, condition: rowSentence(definition, rule.values), ...GENERIC }
  } else if (indicator) {
    const definition = indicator[rule.side].rules.find((item) => item.id === rule.id)
    const recorded = (rule.values as Record<string, number> | undefined) ?? params
    if (definition && recorded) {
      return { name, condition: null, left: operandLabel(definition.lhs, indicator, recorded), right: operandLabel(definition.rhs, indicator, recorded) }
    }
  }
  const stored = rule.values ?? params
  const entries = stored ? Object.entries(stored) : []
  return {
    name,
    condition: entries.length > 0 ? `Tham số: ${entries.map(([key, value]) => `${key} ${typeof value === "number" ? fmtNumber(value) : value}`).join(" · ")}` : null,
    ...GENERIC,
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
  /** Params an older run or event recorded per indicator (before rows carried their own `values`). */
  paramsFor?: (rule: RuleEvidence) => Record<string, number> | undefined
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
            const labels = labelsOf(rule, indicators, paramsFor?.(rule))
            const interval = rule.op === "∈" || rule.op === "∉"
            return (
              <tr key={`${rule.indicator}-${rule.side}-${rule.id}`} className="align-top">
                <td className="px-3 py-2 font-medium">
                  {labels.name}
                  {labels.condition && <small className="block font-normal text-muted-foreground" data-testid="evidence-condition">{labels.condition}</small>}
                </td>
                <td className="px-3 py-2">
                  {labels.left}
                  <strong className="block tabular-nums">{rule.missing ? "Thiếu dữ liệu" : fmtNumber(rule.lhs, 4)}</strong>
                  {rule.previous_lhs != null && <small className="block text-muted-foreground">Phiên trước: {fmtNumber(rule.previous_lhs, 4)}</small>}
                </td>
                <td className="px-3 py-2 text-center text-xs font-bold text-primary">{ruleOpLabel(rule.op)}</td>
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
