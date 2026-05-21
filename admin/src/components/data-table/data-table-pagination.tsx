import type { PaginationState, OnChangeFn } from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DataTablePaginationProps {
  pagination: PaginationState
  pageCount: number
  onPaginationChange: OnChangeFn<PaginationState>
  total?: number
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function DataTablePagination({
  pagination,
  pageCount,
  onPaginationChange,
  total,
}: DataTablePaginationProps) {
  const { pageIndex, pageSize } = pagination

  const canPreviousPage = pageIndex > 0
  const canNextPage = pageIndex < pageCount - 1

  const goToPage = (newIndex: number) => {
    onPaginationChange({ pageIndex: newIndex, pageSize })
  }

  const setPageSize = (size: number) => {
    onPaginationChange({ pageIndex: 0, pageSize: size })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      {/* Total records */}
      <div className="text-sm text-muted-foreground">
        {total !== undefined ? `${total} bản ghi` : ""}
      </div>

      <div className="flex items-center gap-4">
        {/* Page size selector */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Hiển thị</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">/ trang</span>
        </div>

        {/* Page info */}
        <span className="text-sm text-muted-foreground">
          Trang {pageIndex + 1}/{Math.max(1, pageCount)}
        </span>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(0)}
            disabled={!canPreviousPage}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(pageIndex - 1)}
            disabled={!canPreviousPage}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(pageIndex + 1)}
            disabled={!canNextPage}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(pageCount - 1)}
            disabled={!canNextPage}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
