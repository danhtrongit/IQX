import { useEffect, useRef, useState } from "react"

import { TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { fmtPrice, fmtVolume, priceTone } from "../../market/format"
import type { DepthLevel, PriceBoardRow } from "../../market/types"

/** Flash window — long enough to read on a busy board, short enough not to smear. */
const FLASH_MS = 600

type FlashDirection = "up" | "down" | "neutral"

const FLASH_CLASS: Record<FlashDirection, string> = {
  up: "bg-price-up/15",
  down: "bg-price-down/15",
  neutral: "bg-muted",
}

/**
 * Table cell that tints its background when the printed value changes. The tint
 * direction comes from the optional `numeric` value (non-numeric changes tint
 * neutral). A change while a flash is still running restarts the window.
 */
export function FlashCell({
  value,
  numeric,
  className,
}: {
  value: string
  numeric?: number | null
  className?: string
}) {
  const previous = useRef<{ text: string; numeric: number | null }>({
    text: value,
    numeric: numeric ?? null,
  })
  const [flash, setFlash] = useState<FlashDirection | null>(null)

  useEffect(() => {
    const last = previous.current
    if (last.text === value) return
    const next = numeric ?? null
    const direction: FlashDirection =
      next !== null && last.numeric !== null && next !== last.numeric
        ? next > last.numeric
          ? "up"
          : "down"
        : "neutral"
    previous.current = { text: value, numeric: next }
    setFlash(direction)
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [value, numeric])

  return (
    <TableCell
      className={cn(
        "px-2 py-1 text-right tabular-nums transition-colors duration-300",
        className,
        flash && FLASH_CLASS[flash],
      )}
    >
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
        numeric={has ? price : null}
        className={cn("font-medium", tone, priceClassName)}
      />
      <FlashCell
        value={has ? fmtVolume(level?.volume) : "—"}
        numeric={has ? (level?.volume ?? null) : null}
        className={cn(tone, "opacity-80")}
      />
    </>
  )
}
