import { memo } from "react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { changeTone, DASH, fmtChange, fmtPercent, fmtPrice, priceTone } from "../../market/format"
import type { PriceBoardRow } from "../../market/types"
import { industryOf, type DirectorySymbol } from "../types"
import { SymbolMark } from "./symbol-mark"

export interface DirectoryRowProps {
  item: DirectorySymbol
  /** Live row for this symbol, or undefined while its first quote is in flight. */
  price: PriceBoardRow | undefined
  onOpen: (symbol: string) => void
}

/** One directory row: identity, company, industry and the live quote columns. */
export const DirectoryRow = memo(function DirectoryRow({ item, price, onOpen }: DirectoryRowProps) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onOpen(item.symbol)}>
      <TableCell className="px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <SymbolMark symbol={item.symbol} logoUrl={item.logoUrl} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                to={`/co-phieu/${item.symbol}`}
                onClick={(event) => event.stopPropagation()}
                className="rounded-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {item.symbol}
              </Link>
              {item.exchange && (
                <Badge variant="outline" className="h-4 px-1.5 text-xs font-medium">
                  {item.exchange}
                </Badge>
              )}
            </div>
            <p className="max-w-[200px] truncate text-xs text-muted-foreground">
              {item.shortName ?? item.name ?? DASH}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[320px] truncate px-3 py-1.5 text-muted-foreground">
        {item.name ?? item.shortName ?? DASH}
      </TableCell>
      <TableCell className="max-w-[200px] truncate px-3 py-1.5 text-xs text-muted-foreground">
        {industryOf(item)}
      </TableCell>
      <TableCell
        className={cn(
          "px-3 py-1.5 text-right font-medium tabular-nums",
          price ? priceTone(price.closePrice, price) : "text-muted-foreground",
        )}
      >
        {price ? fmtPrice(price.closePrice) : DASH}
      </TableCell>
      <TableCell
        className={cn(
          "px-3 py-1.5 text-right tabular-nums",
          price ? changeTone(price) : "text-muted-foreground",
        )}
      >
        {price ? `${fmtChange(price.priceChange)} (${fmtPercent(price.percentChange)})` : DASH}
      </TableCell>
    </TableRow>
  )
}, propsAreEqual)

/** Compare only what the row prints so unchanged quotes skip re-rendering. */
function propsAreEqual(previous: DirectoryRowProps, next: DirectoryRowProps): boolean {
  if (previous.item !== next.item || previous.onOpen !== next.onOpen) return false
  const a = previous.price
  const b = next.price
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.closePrice === b.closePrice &&
    a.priceChange === b.priceChange &&
    a.percentChange === b.percentChange &&
    a.hasTraded === b.hasTraded &&
    a.referencePrice === b.referencePrice &&
    a.ceilingPrice === b.ceilingPrice &&
    a.floorPrice === b.floorPrice
  )
}
