import { Fragment, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type AdminColumn<T> = {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Server sort field. Set it to make the header a sort control. */
  sortKey?: string
  align?: "left" | "right"
  className?: string
  headerClassName?: string
}

export type AdminSort = { field: string; dir: "asc" | "desc" }

export type AdminPagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export type AdminSelection = {
  selected: string[]
  onToggle: (key: string) => void
  onToggleAll: (keys: string[]) => void
}

const DEFAULT_PAGE_SIZES = [20, 50, 100]

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  if (dir === "asc") return <ArrowUp className="size-3" />
  if (dir === "desc") return <ArrowDown className="size-3" />
  return <ChevronsUpDown className="size-3 opacity-60" />
}

/**
 * Server-driven table: sorting, selection and pagination are reported upward —
 * this component never reorders or slices rows on its own, so what is on screen
 * is exactly what the API returned.
 */
export function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyLabel = "Không có dữ liệu",
  sort,
  onSortChange,
  selection,
  onRowClick,
  pagination,
  footer,
  expandedKey,
  onToggleExpand,
  renderExpanded,
}: {
  columns: AdminColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyLabel?: string
  sort?: AdminSort | null
  onSortChange?: (field: string) => void
  selection?: AdminSelection
  onRowClick?: (row: T) => void
  pagination?: AdminPagination
  footer?: ReactNode
  /** Row key currently expanded; pair with `onToggleExpand` + `renderExpanded`. */
  expandedKey?: string | null
  onToggleExpand?: (key: string) => void
  renderExpanded?: (row: T) => ReactNode
}) {
  const expandable = !!renderExpanded && !!onToggleExpand
  const columnCount = columns.length + (selection ? 1 : 0) + (expandable ? 1 : 0)
  const skeletonRows = Math.min(pagination?.pageSize ?? 8, 8)
  const pageSizes = pagination?.pageSizeOptions ?? DEFAULT_PAGE_SIZES
  const keys = rows.map(rowKey)
  const selectedOnPage = keys.filter((key) => selection?.selected.includes(key)).length
  const allSelected = keys.length > 0 && selectedOnPage === keys.length
  const firstRow = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const lastRow = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0

  return (
    <div className="overflow-hidden rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {expandable && <TableHead scope="col" className="w-8" />}
            {selection && (
              <TableHead scope="col" className="w-8">
                <Checkbox
                  aria-label="Chọn tất cả trên trang"
                  checked={allSelected ? true : selectedOnPage > 0 ? "indeterminate" : false}
                  onCheckedChange={() => selection.onToggleAll(keys)}
                />
              </TableHead>
            )}
            {columns.map((column) => {
              const active = sort && column.sortKey === sort.field ? sort.dir : null
              return (
                <TableHead
                  key={column.id}
                  scope="col"
                  aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
                  className={cn(column.align === "right" && "text-right", column.headerClassName)}
                >
                  {column.sortKey && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.sortKey!)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        active && "text-foreground",
                      )}
                    >
                      {column.header}
                      <SortIcon dir={active} />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {error ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="py-6 text-center whitespace-normal">
                <p className="text-sm text-destructive">{error}</p>
                {onRetry && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                    <RotateCw />
                    Thử lại
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ) : loading && rows.length === 0 ? (
            Array.from({ length: skeletonRows }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {expandable && (
                  <TableCell>
                    <Skeleton className="size-4" />
                  </TableCell>
                )}
                {selection && (
                  <TableCell>
                    <Skeleton className="size-4" />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton className="h-4 w-full max-w-[10rem]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const key = rowKey(row)
              const expanded = expandedKey === key
              return (
                <Fragment key={key}>
                  <TableRow
                    data-state={selection?.selected.includes(key) ? "selected" : undefined}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {expandable && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={expanded}
                          aria-label={expanded ? "Thu gọn chi tiết" : "Xem chi tiết"}
                          onClick={() => onToggleExpand?.(key)}
                        >
                          <ChevronRight
                            className={cn("transition-transform duration-150", expanded && "rotate-90")}
                          />
                        </Button>
                      </TableCell>
                    )}
                    {selection && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label="Chọn dòng"
                          checked={selection.selected.includes(key)}
                          onCheckedChange={() => selection.onToggle(key)}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          column.align === "right" && "text-right tabular-nums",
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expandable && expanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="bg-muted/40 py-3 whitespace-normal"
                      >
                        {renderExpanded?.(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
          )}
        </TableBody>
      </Table>
      {footer}
      {pagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {pagination.total === 0
              ? "Không có bản ghi"
              : `${firstRow}–${lastRow} trên ${pagination.total} bản ghi`}
          </span>
          <div className="flex items-center gap-2">
            {pagination.onPageSizeChange && (
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) => pagination.onPageSizeChange?.(Number(value))}
              >
                <SelectTrigger size="sm" className="w-[4.75rem]" aria-label="Số dòng mỗi trang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizes.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} dòng
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="tabular-nums">
              Trang {pagination.page}/{Math.max(pagination.totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
