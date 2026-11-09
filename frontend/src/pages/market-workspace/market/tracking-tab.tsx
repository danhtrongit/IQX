import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { Link } from "react-router"

import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { TrackingItem, TrackingSlot, TrackingSummary } from "./bulletin-api"
import {
  formatBulletinDate,
  formatBulletinDayMonth,
  formatBulletinNumber,
  formatSessionCount,
  formatSignedPercent,
} from "./bulletin-format"
import { useTracking } from "./bulletin-hooks"
import {
  DEFAULT_TRACKING_SORT,
  nextTrackingSort,
  sortTracking,
  type TrackingSort,
  type TrackingSortKey,
} from "./tracking-sort"
import { useWideScreen } from "./use-wide-screen"

const SLOT_FILTERS: { slot: TrackingSlot | null; label: string }[] = [
  { slot: null, label: "Tất cả" },
  { slot: 1, label: "Bộ lọc 1" },
  { slot: 2, label: "Bộ lọc 2" },
  { slot: 3, label: "Bộ lọc 3" },
]

const SLOT_TONE: Record<number, string> = {
  1: "bg-chart-1/12 text-chart-1",
  2: "bg-chart-2/15 text-chart-2",
  3: "bg-chart-7/12 text-chart-7",
}

const COLUMNS: { key: TrackingSortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol", label: "Mã", align: "left" },
  { key: "slot", label: "Bộ lọc", align: "left" },
  { key: "first_trade_date", label: "Ngày đề xuất", align: "left" },
  { key: "entry_price", label: "Giá ngày đề xuất", align: "right" },
  { key: "price", label: "Giá hôm nay", align: "right" },
  { key: "return_pct", label: "Lợi nhuận", align: "right" },
  { key: "sessions", label: "Số phiên", align: "right" },
]

function toneOf(value: number | null): string {
  if (value === null || value === 0) return "text-foreground"
  return value > 0 ? "text-price-up" : "text-price-down"
}

function demoHref(symbol: string): string {
  return `/demo-trading?view=trading&symbol=${encodeURIComponent(symbol)}`
}

function SlotLabel({ slot }: { slot: number }) {
  return (
    <span className={cn("inline-flex rounded-sm px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", SLOT_TONE[slot] ?? "bg-muted text-foreground")}>
      Bộ lọc {slot}
    </span>
  )
}

function SymbolLink({ symbol }: { symbol: string }) {
  return (
    <Link to={demoHref(symbol)} className="font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
      {symbol}
    </Link>
  )
}

function StatCard({ label, value, sub, tone, tourId }: { label: string; value: string; sub: string; tone?: string; tourId?: string }) {
  return (
    <div className="border border-border bg-card p-4" data-tour-id={tourId}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-heading text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

/** Ba ô số liệu đầu trang theo dõi: số mã, số mã có lãi, lợi nhuận trung bình so với VN-Index. */
export function TrackingStats({ summary, asOf }: { summary: TrackingSummary; asOf: string | null }) {
  const average = summary.average_return
  const trackingSub =
    summary.today_count > 0
      ? `Gồm ${summary.today_count} mã đề xuất hôm nay`
      : asOf
        ? `Cập nhật phiên ${formatBulletinDate(asOf)}`
        : "Chưa có phiên cập nhật"
  return (
    <div className="grid gap-3 sm:grid-cols-3" data-tour-id="tour-bantin-stats">
      <StatCard label="Đang theo dõi" value={`${summary.tracking_count} mã`} sub={trackingSub} />
      <StatCard
        label="Đang có lãi"
        value={`${summary.profit_count} / ${summary.profit_base} mã`}
        sub="Không tính mã đề xuất hôm nay"
      />
      <StatCard
        label="Lợi nhuận trung bình"
        value={average === null ? "-" : formatSignedPercent(average, 1)}
        tone={toneOf(average)}
        sub={
          summary.index_return === null
            ? "VN-Index cùng kỳ: chưa có số liệu"
            : `VN-Index cùng kỳ: ${formatSignedPercent(summary.index_return, 1)}`
        }
      />
    </div>
  )
}

function SortHead({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: TrackingSort; onSort: (key: TrackingSortKey) => void }) {
  const active = sort.key === column.key
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(column.align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          "inline-flex items-center gap-1 font-semibold hover:text-foreground",
          column.align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {column.label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </TableHead>
  )
}

function TrackingTable({ items, sort, onSort }: { items: TrackingItem[]; sort: TrackingSort; onSort: (key: TrackingSortKey) => void }) {
  return (
    <div className="border border-border bg-card" data-tour-id="tour-bantin-table">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <SortHead key={column.key} column={column} sort={sort} onSort={onSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.symbol}-${item.slot}-${item.first_trade_date}`}>
              <TableCell><SymbolLink symbol={item.symbol} /></TableCell>
              <TableCell><SlotLabel slot={item.slot} /></TableCell>
              <TableCell className="tabular-nums">{formatBulletinDate(item.first_trade_date)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBulletinNumber(item.entry_price)}</TableCell>
              <TableCell className="text-right tabular-nums">{item.price === null ? "-" : formatBulletinNumber(item.price)}</TableCell>
              <TableCell className={cn("text-right font-semibold tabular-nums", toneOf(item.return_pct))}>
                {item.return_pct === null ? "-" : formatSignedPercent(item.return_pct)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatSessionCount(item.sessions)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TrackingCards({ items }: { items: TrackingItem[] }) {
  return (
    <ul className="space-y-2" data-tour-id="tour-bantin-table">
      {items.map((item) => (
        <li key={`${item.symbol}-${item.slot}-${item.first_trade_date}`} className="border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SymbolLink symbol={item.symbol} />
              <SlotLabel slot={item.slot} />
            </div>
            <span className={cn("text-lg font-semibold tabular-nums", toneOf(item.return_pct))}>
              {item.return_pct === null ? "-" : formatSignedPercent(item.return_pct)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Đề xuất {formatBulletinDayMonth(item.first_trade_date)} · {formatBulletinNumber(item.entry_price)} →{" "}
            {item.price === null ? "-" : formatBulletinNumber(item.price)} ·{" "}
            {item.sessions <= 0 ? "hôm nay" : `${item.sessions} phiên`}
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tab "Theo dõi": các mã đã đề xuất trong bản tin và lợi nhuận tính từ giá đóng cửa ngày đề
 * xuất (giá đã điều chỉnh). Máy chủ quyết định mã nào còn được theo dõi; trang chỉ hiển thị.
 */
export function TrackingTab() {
  const wide = useWideScreen()
  const [slot, setSlot] = useState<TrackingSlot | null>(null)
  const [sort, setSort] = useState<TrackingSort>(DEFAULT_TRACKING_SORT)
  const query = useTracking(slot)
  const items = useMemo(() => sortTracking(query.data?.items ?? [], sort), [query.data, sort])

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        <strong className="font-semibold text-foreground">Lợi nhuận</strong> = (Giá đóng cửa hôm nay − Giá đóng cửa ngày đề xuất) ÷ Giá đóng cửa ngày đề xuất. Giá đã điều chỉnh theo cổ tức, chia tách.
      </p>

      {query.isPending ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <PanelState
          title="Không thể tải bảng theo dõi"
          description="Vui lòng thử lại sau ít phút."
          action={{ label: "Thử lại", onClick: () => void query.refetch() }}
        />
      ) : (
        <>
          <TrackingStats summary={query.data.summary} asOf={query.data.as_of} />

          <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo bộ lọc" data-tour-id="tour-bantin-slots">
            {SLOT_FILTERS.map((option) => (
              <Button
                key={option.label}
                type="button"
                size="sm"
                variant={slot === option.slot ? "default" : "outline"}
                aria-pressed={slot === option.slot}
                onClick={() => setSlot(option.slot)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {items.length === 0 ? (
            <PanelState title="Chưa có mã đang theo dõi." />
          ) : wide ? (
            <TrackingTable items={items} sort={sort} onSort={(key) => setSort((current) => nextTrackingSort(current, key))} />
          ) : (
            <TrackingCards items={items} />
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Giá: nghìn đồng. Chưa tính phí, thuế. Không phải khuyến nghị đầu tư. Kết quả quá khứ không đảm bảo kết quả tương lai.
          </p>
        </>
      )}
    </div>
  )
}
