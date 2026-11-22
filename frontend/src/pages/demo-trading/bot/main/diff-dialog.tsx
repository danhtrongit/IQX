import { useMemo } from "react"

import { DIFF_SAME_TEXT, strategyDiff, type StrategyContent } from "@/pages/strategy/shared/strategy-diff"

import { useIndicatorRegistry } from "../api-v2"
import { DetailDialog } from "./detail-dialog"

/**
 * "Xem khác biệt" (§5.3): Rổ mã, Giữ tối đa and every Buy/Sell row removed (struck, red) or added
 * (green) from `fromLabel` to `toLabel`; `Hai bản giống nhau về điều kiện.` when nothing differs.
 */
export function DiffDialog({
  from,
  to,
  fromLabel,
  toLabel,
  onClose,
}: {
  from: StrategyContent
  to: StrategyContent
  fromLabel: string
  toLabel: string
  onClose: () => void
}) {
  const registry = useIndicatorRegistry(true)
  const lines = useMemo(() => strategyDiff(from, to, registry.data?.indicators ?? []), [from, to, registry.data])
  return (
    <DetailDialog title="Khác biệt giữa hai bản" description={`${fromLabel} → ${toLabel}`} rows={[]} onClose={onClose}>
      {lines.length === 0 ? (
        <p className="text-sm text-foreground">{DIFF_SAME_TEXT}</p>
      ) : (
        <ul aria-label="Các khác biệt" className="space-y-1.5 text-xs leading-5 text-foreground">
          {lines.map((line, index) => (
            <li key={`${line.field}-${index}`} className="break-words">
              <strong>{line.label}:</strong>{" "}
              {line.from !== null && <del className="text-price-down">{line.from}</del>}
              {line.from !== null && line.to !== null && " → "}
              {line.to !== null && <ins className="text-price-up no-underline">{line.to}</ins>}
            </li>
          ))}
        </ul>
      )}
    </DetailDialog>
  )
}
