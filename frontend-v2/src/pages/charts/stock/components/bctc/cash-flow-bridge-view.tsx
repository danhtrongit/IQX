import { cn } from "@/lib/utils"

import { fmtNumber } from "../../format"
import type { CfBridge, CfBridgeLine } from "../../types"

/** Raw VND → tỷ đồng integer (the waterfall is shown in tỷ). */
function ty(value: number | null): string {
  return value == null ? "—" : fmtNumber(value / 1e9, 0)
}

/** Signed tỷ for the +/− adjustment lines, e.g. +2,180 / −580. */
function tySigned(value: number | null): string {
  if (value == null) return "—"
  const amount = value / 1e9
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : ""
  return `${sign}${fmtNumber(Math.abs(amount), 0)}`
}

function rowClass(kind: CfBridgeLine["kind"], value: number | null): string {
  if (kind === "subtotal" || kind === "total") return "bg-primary/10 font-bold"
  if (kind === "sub" || (kind === "add" && value != null && value < 0)) return "bg-price-down/5"
  return ""
}

function valueClass(kind: CfBridgeLine["kind"], value: number | null): string {
  if (kind === "subtotal" || kind === "total") return "text-foreground"
  if (kind === "sub" || (value != null && value < 0)) return "text-price-down"
  if (kind === "add") return "text-price-up"
  return "text-muted-foreground"
}

/**
 * Cash-flow bridge: single-period waterfall NI → (+Khấu hao +Dự phòng ±ΔVLĐ) →
 * CFO → (−CapEx) → FCF. Adjustment lines are signed/coloured; CFO & FCF bold.
 */
export function CashFlowBridgeView({ data }: { data: CfBridge }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {data.lines.map((line) => (
            <tr
              key={line.key}
              className={cn(
                "border-b border-border/60 last:border-0",
                rowClass(line.kind, line.value),
              )}
            >
              <td className="px-3 py-2 text-left">{line.label}</td>
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  valueClass(line.kind, line.value),
                )}
              >
                {line.kind === "add" ? tySigned(line.value) : ty(line.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
