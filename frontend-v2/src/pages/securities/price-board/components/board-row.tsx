import { memo } from "react"
import { EllipsisVertical, LineChart, ListPlus, ListX, SquareChartGantt, Wallet } from "lucide-react"
import { Link, useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { changeTone, fmtChange, fmtPercent, fmtPrice, fmtValueBil, fmtVolume, priceTone } from "../../market/format"
import type { DepthLevel, PriceBoardRow } from "../../market/types"
import { DepthCells, FlashCell } from "./flash-cell"

/** Left border that separates the bid / match / ask / foreign blocks. */
const BLOCK_BORDER = "border-l border-border"

export interface BoardRowProps {
  row: PriceBoardRow
  /** Whether the symbol is in the signed-in user's watchlist. */
  watched: boolean
  onOpen: (symbol: string) => void
  onToggleWatch: (symbol: string) => void
}

/**
 * One symbol row of the board. Memoized with a field-wise comparator so the
 * 500ms overlay flush only re-renders rows whose printed values changed.
 */
export const BoardRow = memo(function BoardRow({
  row,
  watched,
  onOpen,
  onToggleWatch,
}: BoardRowProps) {
  const [params] = useSearchParams()
  const chartParams = new URLSearchParams(params)
  chartParams.set("content", "chart")
  chartParams.set("symbol", row.symbol)
  const bid = row.bid
  const ask = row.ask

  return (
    <TableRow className="group cursor-pointer" onClick={() => onOpen(row.symbol)}>
      {/* Mã — sticky first column so the row stays identifiable while scrolling. */}
      <TableCell className="sticky left-0 z-10 bg-card px-2 py-1 font-bold group-hover:bg-muted">
        <Link
          to={`/co-phieu/${row.symbol}`}
          onClick={(event) => event.stopPropagation()}
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {row.symbol}
        </Link>
      </TableCell>

      <TableCell className={cn("px-2 py-1 text-right tabular-nums", "text-price-ceiling")}>
        {fmtPrice(row.ceilingPrice)}
      </TableCell>
      <TableCell className={cn("px-2 py-1 text-right tabular-nums", "text-price-floor")}>
        {fmtPrice(row.floorPrice)}
      </TableCell>
      <TableCell className={cn("px-2 py-1 text-right tabular-nums", "text-price-ref")}>
        {fmtPrice(row.referencePrice)}
      </TableCell>

      {/* Bên mua: Giá 3 → Giá 1 (giá tốt nhất sát cột khớp lệnh). */}
      <DepthCells level={bid[2]} row={row} priceClassName={BLOCK_BORDER} />
      <DepthCells level={bid[1]} row={row} />
      <DepthCells level={bid[0]} row={row} />

      {/* Khớp lệnh: Giá | KL | +/- | %. */}
      <FlashCell
        value={fmtPrice(row.closePrice)}
        numeric={row.closePrice}
        className={cn(BLOCK_BORDER, "font-bold", priceTone(row.closePrice, row))}
      />
      <FlashCell
        value={fmtVolume(row.lastMatchVolume)}
        numeric={row.lastMatchVolume ?? null}
        className={cn(priceTone(row.closePrice, row), "opacity-80")}
      />
      <TableCell className={cn("px-2 py-1 text-right tabular-nums", changeTone(row))}>
        {row.hasTraded ? fmtChange(row.priceChange) : "—"}
      </TableCell>
      <FlashCell
        value={row.hasTraded ? fmtPercent(row.percentChange) : "—"}
        numeric={row.hasTraded ? row.percentChange : null}
        className={changeTone(row)}
      />

      {/* Bên bán: Giá 1 → Giá 3. */}
      <DepthCells level={ask[0]} row={row} priceClassName={BLOCK_BORDER} />
      <DepthCells level={ask[1]} row={row} />
      <DepthCells level={ask[2]} row={row} />

      <FlashCell
        value={fmtVolume(row.totalVolume)}
        numeric={row.totalVolume}
        className={cn(BLOCK_BORDER, "text-muted-foreground")}
      />
      <TableCell className="px-2 py-1 text-right tabular-nums text-muted-foreground">
        {fmtValueBil(row.totalValue)}
      </TableCell>
      <FlashCell
        value={fmtPrice(row.highestPrice)}
        numeric={row.highestPrice}
        className={priceTone(row.highestPrice, row)}
      />
      <FlashCell
        value={fmtPrice(row.lowestPrice)}
        numeric={row.lowestPrice}
        className={priceTone(row.lowestPrice, row)}
      />

      {/* ĐTNN: khối ngoại mua / bán / room còn lại. */}
      <TableCell className={cn(BLOCK_BORDER, "px-2 py-1 text-right tabular-nums text-price-up")}>
        {fmtVolume(row.foreignBuy)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right tabular-nums text-price-down">
        {fmtVolume(row.foreignSell)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right tabular-nums text-muted-foreground">
        {fmtVolume(row.foreignRoom)}
      </TableCell>

      <TableCell
        className="px-1 py-1 text-right"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Thao tác với mã ${row.symbol}`}
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link to={`/co-phieu/${row.symbol}`}>
                <SquareChartGantt />
                Chi tiết cổ phiếu
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/demo-trading?${chartParams}`}>
                <LineChart />
                Xem biểu đồ
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/demo-trading?symbol=${row.symbol}&view=trading`}>
                <Wallet />
                Giao dịch demo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onToggleWatch(row.symbol)}>
              {watched ? <ListX /> : <ListPlus />}
              {watched ? "Bỏ khỏi danh mục" : "Thêm vào danh mục"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}, propsAreEqual)

function sameLevels(a: DepthLevel[], b: DepthLevel[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index].price !== b[index].price || a[index].volume !== b[index].volume) return false
  }
  return true
}

/** Compare only the fields this row prints, so untouched rows skip re-rendering. */
function propsAreEqual(previous: BoardRowProps, next: BoardRowProps): boolean {
  if (
    previous.watched !== next.watched ||
    previous.onOpen !== next.onOpen ||
    previous.onToggleWatch !== next.onToggleWatch
  ) {
    return false
  }
  const a = previous.row
  const b = next.row
  if (a === b) return true
  return (
    a.symbol === b.symbol &&
    a.ceilingPrice === b.ceilingPrice &&
    a.floorPrice === b.floorPrice &&
    a.referencePrice === b.referencePrice &&
    a.closePrice === b.closePrice &&
    a.lastMatchVolume === b.lastMatchVolume &&
    a.priceChange === b.priceChange &&
    a.percentChange === b.percentChange &&
    a.hasTraded === b.hasTraded &&
    a.totalVolume === b.totalVolume &&
    a.totalValue === b.totalValue &&
    a.highestPrice === b.highestPrice &&
    a.lowestPrice === b.lowestPrice &&
    a.foreignBuy === b.foreignBuy &&
    a.foreignSell === b.foreignSell &&
    a.foreignRoom === b.foreignRoom &&
    sameLevels(a.bid, b.bid) &&
    sameLevels(a.ask, b.ask)
  )
}
