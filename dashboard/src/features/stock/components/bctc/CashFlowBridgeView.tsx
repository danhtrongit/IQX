import { fmtNumber } from "../../format"
import type { CfBridge, CfBridgeLine } from "../../types"

/** Raw VND → tỷ đồng integer (waterfall is shown in tỷ). */
function ty(v: number | null): string {
  return v == null ? "—" : fmtNumber(v / 1e9, 0)
}

/** Signed tỷ for the +/− adjustment lines, e.g. +2,180 / −580. */
function tySigned(v: number | null): string {
  if (v == null) return "—"
  const n = v / 1e9
  const sign = n > 0 ? "+" : n < 0 ? "−" : ""
  return `${sign}${fmtNumber(Math.abs(n), 0)}`
}

function rowClass(kind: CfBridgeLine["kind"], value: number | null): string {
  if (kind === "subtotal" || kind === "total") {
    return "bg-[rgb(var(--primary-6))]/8 font-bold text-[var(--color-text-1)]"
  }
  if (kind === "sub" || (kind === "add" && value != null && value < 0)) {
    return "bg-down/5"
  }
  return ""
}

function valueClass(kind: CfBridgeLine["kind"], value: number | null): string {
  if (kind === "subtotal" || kind === "total") return "text-[var(--color-text-1)]"
  if (kind === "sub" || (value != null && value < 0)) return "text-down"
  if (kind === "add") return "text-up"
  return "text-[var(--color-text-2)]"
}

/**
 * Cash-flow bridge: single-period waterfall NI → (+Khấu hao +Dự phòng ±ΔVLĐ) →
 * CFO → (−CapEx) → FCF. Adjustment lines are signed/colored; CFO & FCF are bold.
 */
export function CashFlowBridgeView({ data }: { data: CfBridge }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-1)]">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {data.lines.map((line) => {
            const signed = line.kind === "add"
            return (
              <tr
                key={line.key}
                className={`border-b border-[var(--color-border-1)] last:border-0 ${rowClass(
                  line.kind,
                  line.value,
                )}`}
              >
                <td className="px-3 py-2 text-left">{line.label}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${valueClass(line.kind, line.value)}`}
                >
                  {signed ? tySigned(line.value) : ty(line.value)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
