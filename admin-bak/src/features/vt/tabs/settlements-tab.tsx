import { useState } from "react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { Link } from "react-router"
import { ExternalLink } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { StatusBadge } from "@/components/common/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { vtApi, type VTSettlement } from "@/lib/api/vt"
import { fmtDate, fmtDateTime } from "@/lib/format"

const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chờ" },
  { value: "settled", label: "Đã thanh toán" },
]

const KIND_LABELS: Record<string, string> = {
  buy_qty_release: "Phát hành CP (T+N)",
  sell_cash_release: "Phát tiền bán (T+N)",
}

const columns: ColumnDef<VTSettlement>[] = [
  {
    accessorKey: "createdAt",
    header: "Tạo lúc",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{fmtDateTime(getValue() as string)}</span>
    ),
  },
  {
    id: "trade",
    header: "Giao dịch",
    cell: ({ row }) => (
      <Link
        to={`/vt/accounts/${row.original.accountId}?tab=trades`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="size-3" />
        <span className="font-mono">{row.original.tradeId.slice(0, 8)}…</span>
      </Link>
    ),
  },
  {
    accessorKey: "kind",
    header: "Loại thanh toán",
    cell: ({ getValue }) => {
      const kind = getValue() as string
      return (
        <span className="text-sm">{KIND_LABELS[kind] ?? kind}</span>
      )
    },
  },
  {
    accessorKey: "symbol",
    header: "Mã CK",
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      return v ? (
        <span className="font-mono font-semibold">{v}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  },
  {
    accessorKey: "amount",
    header: "Số lượng / Tiền",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number).toLocaleString("vi-VN")}</span>
    ),
  },
  {
    accessorKey: "dueDate",
    header: "Ngày đáo hạn",
    cell: ({ getValue }) => (
      <span className="text-sm">{fmtDate(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
  {
    accessorKey: "settledAt",
    header: "Thanh toán lúc",
    cell: ({ getValue }) => {
      const v = getValue() as string | null
      return (
        <span className="text-sm text-muted-foreground">
          {v ? fmtDateTime(v) : "—"}
        </span>
      )
    },
  },
]

interface SettlementsTabProps {
  accountId: string
}

export function SettlementsTab({ accountId }: SettlementsTabProps) {
  const [statusFilter, setStatusFilter] = useState("all")

  const { data, isLoading, params, setParams } = usePaginatedQuery<VTSettlement>({
    queryFn: (p) =>
      vtApi.listSettlements(accountId, {
        page: p.page,
        pageSize: p.pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
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
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v ?? "all")
            setParams({ page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
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
        emptyMessage="Không có thanh toán nào"
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
