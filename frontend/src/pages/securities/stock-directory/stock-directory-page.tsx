import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RotateCcw,
  Search,
} from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import { MarketDataProvider } from "../market/provider"
import { usePrices } from "../market/hooks"
import { DirectoryRow } from "./components/directory-row"
import { useGroups, useSymbols } from "./hooks"
import {
  GROUP_OPTIONS,
  industryOf,
  type DirectorySymbol,
  type StockGroup,
} from "./types"

const PAGE_SIZE = 20
/** Sentinel for "no filter" — Radix Select forbids an empty item value. */
const ALL = "ALL"

type SortKey = "symbol" | "name" | "industry"
type SortState = { key: SortKey; direction: "asc" | "desc" } | null

interface DirectoryFilters {
  query: string
  group: StockGroup | null
  industry: string | null
}

const EMPTY_FILTERS: DirectoryFilters = { query: "", group: null, industry: null }

function compareRows(a: DirectorySymbol, b: DirectorySymbol, key: SortKey): number {
  if (key === "symbol") return a.symbol.localeCompare(b.symbol)
  if (key === "name") {
    return (a.name ?? a.shortName ?? "").localeCompare(b.name ?? b.shortName ?? "", "vi")
  }
  return industryOf(a).localeCompare(industryOf(b), "vi")
}

/** Page numbers to render around the current page, with "gap" markers between runs. */
function pageItems(current: number, total: number): (number | "gap")[] {
  const wanted = new Set<number>([1, total])
  for (let offset = -1; offset <= 1; offset += 1) {
    const candidate = current + offset
    if (candidate >= 1 && candidate <= total) wanted.add(candidate)
  }
  if (current <= 3) for (let page = 2; page <= Math.min(4, total); page += 1) wanted.add(page)
  if (current >= total - 2) {
    for (let page = Math.max(1, total - 3); page <= total; page += 1) wanted.add(page)
  }

  const ordered = [...wanted].sort((a, b) => a - b)
  const items: (number | "gap")[] = []
  for (const [index, page] of ordered.entries()) {
    if (index > 0 && page - ordered[index - 1] > 1) items.push("gap")
    items.push(page)
  }
  return items
}

function SortableHead({
  label,
  sortKey,
  sort,
  onToggle,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onToggle: (key: SortKey) => void
  className?: string
}) {
  const active = sort?.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 gap-1 px-1.5 text-xs font-medium"
        onClick={() => onToggle(sortKey)}
      >
        {label}
        <Icon className={cn("size-3", !active && "text-muted-foreground")} aria-hidden />
      </Button>
    </TableHead>
  )
}

function DirectoryView() {
  const navigate = useNavigate()
  const { symbols, isLoading, error, refetch } = useSymbols()
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>(null)

  const { tickerSet, isLoading: isGroupLoading, error: groupError } = useGroups(filters.group)

  // Filter changes reset the page so a narrowed result set never starts mid-list.
  function updateFilters(patch: Partial<DirectoryFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }))
    setPage(1)
  }

  function toggleSort(key: SortKey) {
    setSort((previous) =>
      previous?.key === key
        ? { key, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    )
    setPage(1)
  }

  // Industry options derive from the loaded directory so they always match the
  // buckets the rows themselves carry.
  const industryOptions = useMemo(() => {
    const names = new Set<string>()
    for (const item of symbols) names.add(industryOf(item))
    return [...names].sort((a, b) => a.localeCompare(b, "vi"))
  }, [symbols])

  const filtered = useMemo(() => {
    const text = filters.query.trim().toLowerCase()
    return symbols.filter((item) => {
      if (filters.group && !tickerSet.has(item.symbol)) return false
      if (filters.industry && industryOf(item) !== filters.industry) return false
      if (!text) return true
      const haystack = [
        item.symbol,
        item.name,
        item.shortName,
        item.exchange,
        item.icbLv1,
        item.icbLv2,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(text)
    })
  }, [symbols, filters, tickerSet])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const direction = sort.direction === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => compareRows(a, b, sort.key) * direction)
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage],
  )
  const pageSymbols = useMemo(() => pageRows.map((row) => row.symbol), [pageRows])
  const { priceMap } = usePrices(pageSymbols)

  const hasFilters = Boolean(filters.query || filters.group || filters.industry)
  const firstRow = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(currentPage * PAGE_SIZE, sorted.length)

  return (
    <WorkspacePage
      title="Danh mục cổ phiếu theo ngành"
      description={
        isLoading
          ? "Đang tải danh mục cổ phiếu…"
          : `${formatNumber(symbols.length)} mã cổ phiếu · ${formatNumber(industryOptions.length)} ngành ICB`
      }
      actions={
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Tìm mã, tên công ty hoặc ngành"
            aria-label="Tìm mã, tên công ty hoặc ngành"
            spellCheck={false}
            className="w-full pl-7 sm:w-72"
          />
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.group ?? ALL}
          onValueChange={(value) =>
            updateFilters({ group: value === ALL ? null : (value as StockGroup) })
          }
        >
          <SelectTrigger size="sm" className="w-[180px]" aria-label="Lọc theo nhóm chỉ số">
            <SelectValue placeholder="Nhóm chỉ số" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả nhóm</SelectItem>
            {GROUP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.industry ?? ALL}
          onValueChange={(value) => updateFilters({ industry: value === ALL ? null : value })}
        >
          <SelectTrigger size="sm" className="w-[240px]" aria-label="Lọc theo ngành">
            <SelectValue placeholder="Ngành" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả ngành</SelectItem>
            {industryOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateFilters(EMPTY_FILTERS)}>
            <RotateCcw aria-hidden />
            Xoá lọc
          </Button>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {isGroupLoading ? "Đang tải nhóm mã…" : `${formatNumber(sorted.length)} mã phù hợp`}
        </span>
      </div>

      {groupError && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Không tải được nhóm {filters.group}</AlertTitle>
          <AlertDescription>{groupError.message}</AlertDescription>
        </Alert>
      )}

      {error && symbols.length === 0 ? (
        <PanelState
          title="Không tải được danh mục cổ phiếu"
          description={error.message}
          action={{ label: "Thử lại", onClick: refetch }}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    label="Mã"
                    sortKey="symbol"
                    sort={sort}
                    onToggle={toggleSort}
                    className="w-[240px]"
                  />
                  <SortableHead label="Tên công ty" sortKey="name" sort={sort} onToggle={toggleSort} />
                  <SortableHead
                    label="Ngành"
                    sortKey="industry"
                    sort={sort}
                    onToggle={toggleSort}
                    className="w-[220px]"
                  />
                  <TableHead className="w-[110px] text-right">Giá</TableHead>
                  <TableHead className="w-[150px] text-right">+/- (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                      <TableCell className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="size-7 rounded-sm" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Skeleton className="ml-auto h-4 w-14" />
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </TableCell>
                    </TableRow>
                  ))}

                {!isLoading &&
                  pageRows.map((item) => (
                    <DirectoryRow
                      key={item.symbol}
                      item={item}
                      price={priceMap[item.symbol]}
                      onOpen={(symbol) => navigate(`/co-phieu/${symbol}`)}
                    />
                  ))}

                {!isLoading && pageRows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="px-3 py-12 text-center">
                      <span className="flex flex-col items-center gap-3">
                        <span className="text-muted-foreground">
                          Không có cổ phiếu phù hợp với bộ lọc hiện tại.
                        </span>
                        {hasFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateFilters(EMPTY_FILTERS)}
                          >
                            Xoá lọc
                          </Button>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs tabular-nums text-muted-foreground">
              Hiển thị {firstRow}–{lastRow} / {formatNumber(sorted.length)} mã
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Trang trước"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                </PaginationItem>
                {pageItems(currentPage, totalPages).map((item, index) =>
                  item === "gap" ? (
                    <PaginationItem key={`gap-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item}>
                      <Button
                        variant={item === currentPage ? "outline" : "ghost"}
                        size="icon-sm"
                        className="tabular-nums"
                        aria-current={item === currentPage ? "page" : undefined}
                        aria-label={`Trang ${item}`}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </Button>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Trang sau"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </WorkspacePage>
  )
}

/**
 * `/co-phieu` — danh mục cổ phiếu niêm yết kèm giá khớp gần nhất. Public data:
 * the directory, its filters and the live quote columns need no account.
 */
export function StockDirectoryPage() {
  useEffect(() => {
    document.title = "Cổ phiếu theo ngành | IQX"
  }, [])

  return (
    <MarketDataProvider>
      <DirectoryView />
    </MarketDataProvider>
  )
}
