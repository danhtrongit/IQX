import { TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { fmtPrice, fmtVolume, priceTone } from "../../market/format"
import type { DepthLevel, PriceBoardRow } from "../../market/types"

/** Price updates replace the printed number without animating the board surface. */
export function FlashCell({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  return (
    <TableCell className={cn("px-2 py-1 text-right tabular-nums", className)}>
      {value}
    </TableCell>
  )
}

/**
 * One order-book depth level → price + volume cells. The volume cell carries the
 * same tone as its price, dimmed (iBoard convention).
 */
export function DepthCells({
  level,
  row,
  priceClassName,
}: {
  level: DepthLevel | undefined
  row: PriceBoardRow
  priceClassName?: string
}) {
  const price = level?.price ?? 0
  const has = price > 0
  const tone = has ? priceTone(price, row) : "text-muted-foreground"
  return (
    <>
      <FlashCell
        value={has ? fmtPrice(price) : "—"}
        className={cn("font-medium", tone, priceClassName)}
      />
      <FlashCell
        value={has ? fmtVolume(level?.volume) : "—"}
        className={cn(tone, "opacity-80")}
      />
    </>
  )
}
