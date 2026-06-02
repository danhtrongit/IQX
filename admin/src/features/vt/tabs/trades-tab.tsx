import { useState } from "react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { Link } from "react-router"
import { ExternalLink } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { StatusBadge } from "@/components/common/status-badge"
import { Input } from "@/components/ui/input"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { vtApi, type VTTrade } from "@/lib/api/vt"
import { fmtVnd, fmtDateTime } from "@/lib/format"

const SIDE_LABELS: Record<string, string> = {
  buy: "MUA",
  sell: "BÁN",
}

const columns: ColumnDef<VTTrade>[] = [
  {
    accessorKey: "tradedAt",
    header: "Thời gian GD",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{fmtDateTime(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: "symbol",
    header: "Mã CK",
    cell: ({ getValue }) => (
      <span className="font-mono font-semibold">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "side",
    header: "Chiều",
    cell: ({ getValue }) => {
      const side = getValue() as string
      return (
        <StatusBadge
          status={side}
          label={SIDE_LABELS[side] ?? side.toUpperCase()}
          variantMap={{ buy: "blue", sell: "red" }}
        />
      )
    },
  },
  {
    accessorKey: "quantity",
    header: "Khối lượng",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number).toLocaleString("vi-VN")}</span>
    ),
  },
  {
    accessorKey: "priceVnd",
    header: "Giá khớp",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{fmtVnd(getValue() as number)}</span>
    ),
  },
  {
    accessorKey: "grossAmountVnd",
    header: "GT gộp",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{fmtVnd(getValue() as number)}</span>
    ),
  },
  {
    accessorKey: "netAmountVnd",
    header: "GT thực",
    cell: ({ getValue }) => {
      const v = getValue() as number
      return (
        <span className={`tabular-nums font-medium ${v >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {fmtVnd(v)}
        </span>
      )
    },
  },
  {
    id: "order",
    header: "Lệnh",
    cell: ({ row }) => (
      <Link
        to={`/vt/accounts/${row.original.accountId}?tab=orders`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="size-3" />
        <span className="font-mono">{row.original.orderId.slice(0, 8)}…</span>
      </Link>
    ),
  },
]

interface TradesTabProps {
  accountId: string
}

export function TradesTab({ accountId }: TradesTabProps) {
  const [symbolFilter, setSymbolFilter] = useState("")

  const { data, isLoading, params, setParams } = usePaginatedQuery<VTTrade>({
    queryFn: (p) =>
      vtApi.listTrades(accountId, {
        page: p.page,
        pageSize: p.pageSize,
        symbol: symbolFilter || undefined,
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
        <Input
          placeholder="Lọc mã CK..."
          value={symbolFilter}
          onChange={(e) => {
            setSymbolFilter(e.target.value)
            setParams({ page: 1 })
          }}
          className="w-44"
        />
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
        emptyMessage="Không có giao dịch nào"
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
