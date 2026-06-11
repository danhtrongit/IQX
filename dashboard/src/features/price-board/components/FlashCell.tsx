import { useEffect, useState } from "react"
import { cn } from "@/shared/lib/cn"
import { fmtK, fmtVol, priceTone } from "./format"
import type { PriceBoardData } from "@/features/market-data"

/** Flash duration must match the board-flash-* keyframes in index.css. */
const FLASH_MS = 600

type FlashDir = "up" | "down" | "neutral"

const FLASH_CLASS: Record<FlashDir, string> = {
  up: "board-flash-up",
  down: "board-flash-down",
  neutral: "board-flash-neutral",
}

/**
 * Table cell that flashes its background when the displayed value changes.
 * Direction (up/down) comes from the optional `numeric` value; non-numeric
 * changes flash neutral. Uses the render-phase "adjust state on prop change"
 * pattern (no effect-driven setState) + a keyed remount so consecutive
 * changes restart the CSS animation.
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
  const [prev, setPrev] = useState<{ v: string; n: number | null }>({
    v: value,
    n: numeric ?? null,
  })
  const [flash, setFlash] = useState<{ dir: FlashDir; seq: number } | null>(null)

  if (prev.v !== value) {
    const n = numeric ?? null
    const dir: FlashDir =
      n != null && prev.n != null && n !== prev.n
        ? n > prev.n
          ? "up"
          : "down"
        : "neutral"
    setPrev({ v: value, n })
    setFlash((f) => ({ dir, seq: (f?.seq ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  return (
    <td
      key={flash?.seq ?? 0}
      className={cn(
        "px-2 py-1 text-right tabular-nums",
        className,
        flash && FLASH_CLASS[flash.dir],
      )}
    >
      {value}
    </td>
  )
}

/**
 * One order-book depth level → price + volume cells. The volume cell is
 * tinted with the same tone as its price, dimmed (iBoard style).
 */
export function DepthCells({
  level,
  p,
  priceClassName,
}: {
  level?: { price: number; volume: number }
  p: PriceBoardData
  priceClassName?: string
}) {
  const price = level?.price ?? 0
  const has = price > 0
  const tone = has ? priceTone(price, p) : "text-[var(--color-text-3)]"
  return (
    <>
      <FlashCell
        value={has ? fmtK(price) : "—"}
        numeric={has ? price : null}
        className={cn("font-medium", tone, priceClassName)}
      />
      <FlashCell
        value={has ? fmtVol(level?.volume) : "—"}
        numeric={has ? level?.volume ?? null : null}
        className={cn(tone, "opacity-80")}
      />
    </>
  )
}
