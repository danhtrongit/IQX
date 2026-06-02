import { useState } from "react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { vtApi, type VTLedgerEntry } from "@/lib/api/vt"
import { fmtVnd, fmtDateTime } from "@/lib/format"

const KIND_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "activate", label: "Kích hoạt" },
  { value: "buy", label: "Mua" },
  { value: "sell", label: "Bán" },
  { value: "admin_adjust", label: "Điều chỉnh" },
  { value: "reset", label: "Reset" },
]

const KIND_COLORS: Record<string, string> = {
  activate: "bg-blue-100 text-blue-700 border-blue-200",
  buy: "bg-red-100 text-red-700 border-red-200",
  sell: "bg-green-100 text-green-700 border-green-200",
  admin_adjust: "bg-amber-100 text-amber-700 border-amber-200",
  reset: "bg-gray-100 text-gray-700 border-gray-200",
}

const columns: ColumnDef<VTLedgerEntry>[] = [
  {
    accessorKey: "createdAt",
    header: "Thời gian",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{fmtDateTime(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: "kind",
    header: "Loại",
    cell: ({ getValue }) => {
      const kind = getValue() as string
      const cls = KIND_COLORS[kind] ?? "bg-gray-100 text-gray-700 border-gray-200"
      return (
        <Badge variant="outline" className={`border font-medium ${cls}`}>
          {kind}
        </Badge>
      )
    },
  },
  {
    accessorKey: "amountVnd",
    header: "Số tiền",
    cell: ({ getValue }) => {
      const v = getValue() as number
      return (
        <span className={`tabular-nums font-medium ${v >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {v >= 0 ? "+" : ""}{fmtVnd(v)}
        </span>
      )
    },
  },
  {
    accessorKey: "balanceAfterVnd",
    header: "Số dư sau",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{fmtVnd(getValue() as number)}</span>
    ),
  },
  {
    accessorKey: "referenceType",
    header: "Tham chiếu",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{(getValue() as string | null) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "note",
    header: "Ghi chú",
    cell: ({ getValue }) => {
      const note = getValue() as string | null
      if (!note) return <span className="text-muted-foreground">—</span>
      return (
        <Tooltip>
          <TooltipTrigger className="max-w-[200px] truncate block cursor-help text-sm text-left">
            {note}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{note}</TooltipContent>
        </Tooltip>
      )
    },
  },
]

interface LedgerTabProps {
  accountId: string
}

export function LedgerTab({ accountId }: LedgerTabProps) {
  const [kindFilter, setKindFilter] = useState("all")

  const { data, isLoading, params, setParams } = usePaginatedQuery<VTLedgerEntry>({
    queryFn: (p) =>
      vtApi.listLedger(accountId, {
        page: p.page,
        pageSize: p.pageSize,
        kind: kindFilter !== "all" ? kindFilter : undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination: PaginationState = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={kindFilter}
          onValueChange={(v) => {
            setKindFilter(v ?? "all")
            setParams({ page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Loại giao dịch" />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 1}
        pagination={pagination}
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        loading={isLoading}
        emptyMessage="Không có bút toán nào"
      />

      <DataTablePagination
        pagination={pagination}
        pageCount={data?.totalPages ?? 1}
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        total={data?.total}
      />
    </div>
  )
}
