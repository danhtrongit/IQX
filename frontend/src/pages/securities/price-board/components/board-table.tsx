import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { useSearchParams } from "react-router"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { PriceBoardRow } from "../../market/types"
import { boardChartHref } from "../board-routing"
import { BoardRow } from "./board-row"
import { FALLBACK_ROW_HEIGHT, OVERSCAN, WINDOW_THRESHOLD, visibleRange } from "./window-range"

/** Mã + Trần/Sàn/TC + 6 bid + 4 match + 6 ask + 4 totals + 3 foreign + thao tác. */
const COLUMN_COUNT = 28
/** Rows painted before the viewport has been measured. */
const INITIAL_ROWS = 60

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
  const [params] = useSearchParams()
  const paramsKey = params.toString()
  const chartHref = useCallback(
    (symbol: string) => boardChartHref(new URLSearchParams(paramsKey), symbol),
    [paramsKey],
  )

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLTableSectionElement | null>(null)
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const setViewport = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node
    setViewportEl(node)
  }, [])
  const [scroll, setScroll] = useState({ top: 0, height: 0 })
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT)
  const windowed = rows.length > WINDOW_THRESHOLD
  const hasRows = rows.length > 0

  useEffect(() => {
    if (!windowed || !viewportEl) return
    let frame = 0
    const sync = () => {
      frame = 0
      setScroll((prev) =>
        prev.top === viewportEl.scrollTop && prev.height === viewportEl.clientHeight
          ? prev
          : { top: viewportEl.scrollTop, height: viewportEl.clientHeight },
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync)
    }
    sync()
    viewportEl.addEventListener("scroll", schedule, { passive: true })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    observer?.observe(viewportEl)
    return () => {
      viewportEl.removeEventListener("scroll", schedule)
      observer?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [windowed, viewportEl])

  // Measure the first real body row (skip spacers) once windowing is active.
  useEffect(() => {
    if (!windowed) return
    const first = bodyRef.current?.querySelector<HTMLElement>("tr:not([aria-hidden])")
    const height = first?.getBoundingClientRect().height ?? 0
    if (height > 0) setRowHeight((prev) => (Math.abs(prev - height) < 0.5 ? prev : height))
  }, [windowed, hasRows])

  const range = useMemo(() => {
    if (!windowed) return { start: 0, end: rows.length }
    // Not measured yet: paint one screenful instead of the whole tab.
    if (scroll.height <= 0) return { start: 0, end: Math.min(rows.length, INITIAL_ROWS) }
    return visibleRange(scroll.top, scroll.height, rowHeight, rows.length, OVERSCAN)
  }, [windowed, scroll, rowHeight, rows.length])
  const visibleRows = range.start === 0 && range.end >= rows.length ? rows : rows.slice(range.start, range.end)
  const topSpace = range.start * rowHeight
  const bottomSpace = Math.max(0, rows.length - range.end) * rowHeight

  return (
    <ScrollArea
      viewportRef={setViewport}
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
        <TableBody ref={bodyRef}>
          {rows.length > 0 ? (
            <>
              {topSpace > 0 && <tr aria-hidden style={{ height: topSpace }}><td colSpan={COLUMN_COUNT} style={{ height: topSpace, padding: 0, border: 0 }} /></tr>}
              {visibleRows.map((row) => (
              <BoardRow
                key={row.symbol}
                row={row}
                watched={watchedSymbols.has(row.symbol)}
                onOpen={onOpen}
                onToggleWatch={onToggleWatch}
                chartHref={chartHref}
              />
              ))}
              {bottomSpace > 0 && <tr aria-hidden style={{ height: bottomSpace }}><td colSpan={COLUMN_COUNT} style={{ height: bottomSpace, padding: 0, border: 0 }} /></tr>}
            </>
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
