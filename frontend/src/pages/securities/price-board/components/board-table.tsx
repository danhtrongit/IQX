import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { PriceBoardRow } from "../../market/types"
import { BoardRow } from "./board-row"

/** Mã + Trần/Sàn/TC + 6 bid + 4 match + 6 ask + 4 totals + 3 foreign + thao tác. */
const COLUMN_COUNT = 28

const HEAD_CELL =
  "sticky top-0 z-20 h-7 bg-card px-2 text-right align-middle text-xs font-medium whitespace-nowrap text-muted-foreground"
const HEAD_CELL_SECOND_ROW = cn(HEAD_CELL, "top-7")
const HEAD_GROUP =
  "sticky top-0 z-20 h-7 border-l border-border bg-card px-2 text-center align-middle text-xs font-medium whitespace-nowrap text-muted-foreground"
const HEAD_CORNER =
  "sticky top-0 left-0 z-30 h-7 bg-card px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground"

export interface BoardTableProps {
  rows: PriceBoardRow[]
  isLoading: boolean
  error: Error | null
  emptyHint: string
  /** Real action for the empty state (e.g. opening the sign-in dialog). */
  emptyAction?: { label: string; onClick: () => void }
  onOpen: (symbol: string) => void
  watchedSymbols: Set<string>
  onToggleWatch: (symbol: string) => void
}

/**
 * The dense board grid: two sticky header rows plus a sticky "Mã" column inside
 * a custom ScrollArea, so both axes stay usable on a 28-column, hundreds-row
 * board. Sticky cells carry the card background so scrolled content never bleeds
 * through them.
 */
export function BoardTable({
  rows,
  isLoading,
  error,
  emptyHint,
  emptyAction,
  onOpen,
  watchedSymbols,
  onToggleWatch,
}: BoardTableProps) {
  return (
    <ScrollArea
      className="min-h-[280px] flex-1 rounded-lg border border-border bg-card"
      orientation="both"
      // The ScrollArea content box is `display: table`, which wraps a real table
      // in an anonymous cell and makes `position: sticky` unreliable — restore a
      // plain block so the header cells stick to the viewport.
      viewportClassName="[&>div:first-child]:block!"
    >
      <table className="w-full min-w-[1440px] border-collapse text-xs">
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            <TableHead rowSpan={2} className={HEAD_CORNER} data-tour-id="tour-banggia-col-symbol">
              Mã
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL} data-tour-id="tour-banggia-col-price-bands">
              Trần
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              Sàn
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              TC
            </TableHead>
            <TableHead
              colSpan={6}
              className={cn(HEAD_GROUP, "text-price-up")}
              data-tour-id="tour-banggia-bid"
            >
              Bên mua
            </TableHead>
            <TableHead colSpan={4} className={HEAD_GROUP} data-tour-id="tour-banggia-match">
              Khớp lệnh
            </TableHead>
            <TableHead
              colSpan={6}
              className={cn(HEAD_GROUP, "text-price-down")}
              data-tour-id="tour-banggia-ask"
            >
              Bên bán
            </TableHead>
            <TableHead rowSpan={2} className={cn(HEAD_CELL, "border-l border-border")}>
              Tổng KL
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              GT (tỷ)
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              Cao
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              Thấp
            </TableHead>
            <TableHead
              colSpan={3}
              className={HEAD_GROUP}
              data-tour-id="tour-banggia-foreign"
            >
              ĐTNN
            </TableHead>
            <TableHead rowSpan={2} className={HEAD_CELL}>
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
          <TableRow className="border-b border-border hover:bg-transparent">
            <TableHead className={cn(HEAD_CELL_SECOND_ROW, "border-l border-border")}>Giá 3</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Giá 2</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Giá 1</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={cn(HEAD_CELL_SECOND_ROW, "border-l border-border")}>Giá</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>+/-</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>%</TableHead>
            <TableHead className={cn(HEAD_CELL_SECOND_ROW, "border-l border-border")}>Giá 1</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Giá 2</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Giá 3</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>KL</TableHead>
            <TableHead className={cn(HEAD_CELL_SECOND_ROW, "border-l border-border")}>Mua</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Bán</TableHead>
            <TableHead className={HEAD_CELL_SECOND_ROW}>Room</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <BoardRow
                key={row.symbol}
                row={row}
                watched={watchedSymbols.has(row.symbol)}
                onOpen={onOpen}
                onToggleWatch={onToggleWatch}
              />
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMN_COUNT} className="px-3 py-12 text-center">
                {isLoading ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    Đang tải bảng giá…
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-3">
                    <span className="text-muted-foreground">
                      {error ? `Không tải được dữ liệu giá: ${error.message}` : emptyHint}
                    </span>
                    {emptyAction && (
                      <Button variant="outline" size="sm" onClick={emptyAction.onClick}>
                        {emptyAction.label}
                      </Button>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
    </ScrollArea>
  )
}
