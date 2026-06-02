import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { Skeleton } from "@/components/ui/skeleton"
import { vtApi, type VTPosition } from "@/lib/api/vt"
import { fmtVnd, fmtDateTime } from "@/lib/format"

const columns: ColumnDef<VTPosition>[] = [
  {
    accessorKey: "symbol",
    header: "Mã CK",
    cell: ({ getValue }) => (
      <span className="font-mono font-semibold">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "quantityTotal",
    header: "Tổng KL",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number).toLocaleString("vi-VN")}</span>
    ),
  },
  {
    accessorKey: "quantitySellable",
    header: "KL khả dụng",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-green-700 dark:text-green-400">
        {(getValue() as number).toLocaleString("vi-VN")}
      </span>
    ),
  },
  {
    accessorKey: "quantityPending",
    header: "KL chờ",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">
        {(getValue() as number).toLocaleString("vi-VN")}
      </span>
    ),
  },
  {
    accessorKey: "avgCostVnd",
    header: "Giá vốn TB",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{fmtVnd(getValue() as number)}</span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Mở vị thế lúc",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{fmtDateTime(getValue() as string)}</span>
    ),
  },
]

interface PositionsTabProps {
  accountId: string
}

export function PositionsTab({ accountId }: PositionsTabProps) {
  const [positions, setPositions] = useState<VTPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    vtApi
      .listPositions(accountId)
      .then((data) => { if (!cancelled) setPositions(data) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountId])

  if (loading) return <Skeleton className="h-32 w-full" />
  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <DataTable
      columns={columns}
      data={positions}
      pageCount={1}
      pagination={{ pageIndex: 0, pageSize: 100 }}
      onPaginationChange={() => {}}
      emptyMessage="Không có vị thế nào"
    />
  )
}
