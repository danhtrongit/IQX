import { useState } from "react"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { StatusBadge } from "@/components/common/status-badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { vtApi, type VTOrder } from "@/lib/api/vt"
import { fmtVnd, fmtDateTime } from "@/lib/format"

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chờ" },
  { value: "filled", label: "Khớp" },
  { value: "cancelled", label: "Đã hủy" },
  { value: "expired", label: "Hết hạn" },
  { value: "rejected", label: "Từ chối" },
]

const SIDE_LABELS: Record<string, string> = {
  buy: "MUA",
  sell: "BÁN",
}

const columns: ColumnDef<VTOrder>[] = [
  {
    accessorKey: "createdAt",
    header: "Ngày đặt",
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
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
  {
    accessorKey: "quantity",
    header: "KL",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number).toLocaleString("vi-VN")}</span>
    ),
  },
  {
    id: "price",
    header: "Giá",
    cell: ({ row }) => {
      const o = row.original
      const price = o.filledPriceVnd ?? o.limitPriceVnd
      return (
        <span className="tabular-nums">
          {price != null ? fmtVnd(price) : "—"}
        </span>
      )
    },
  },
  {
    id: "totalVnd",
    header: "GT thực",
    cell: ({ row }) => {
      const o = row.original
      return (
        <span className="tabular-nums">
          {o.netAmountVnd != null ? fmtVnd(Math.abs(o.netAmountVnd)) : "—"}
        </span>
      )
    },
  },
  {
    accessorKey: "tradingDate",
    header: "Ngày GD",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue() as string}</span>
    ),
  },
]

interface OrdersTabProps {
  accountId: string
}

export function OrdersTab({ accountId }: OrdersTabProps) {
  const [statusFilter, setStatusFilter] = useState("all")
  const [symbolFilter, setSymbolFilter] = useState("")

  const { data, isLoading, params, setParams } = usePaginatedQuery<VTOrder>({
    queryFn: (p) =>
      vtApi.listOrders(accountId, {
        page: p.page,
        pageSize: p.pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
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
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v ?? "all")
            setParams({ page: 1 })
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Mã CK (VCB, HPG...)"
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
        emptyMessage="Không có lệnh nào"
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
