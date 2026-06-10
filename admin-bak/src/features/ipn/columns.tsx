import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router"
import { Check, X } from "lucide-react"
import { StatusBadge } from "@/components/common/status-badge"
import { CopyButton } from "@/components/common/copy-button"
import { fmtDateTime } from "@/lib/format"
import type { IPNLogRow } from "@/lib/api/ipn"

interface ColumnActions {
  onDetail: (log: IPNLogRow) => void
}

export function buildColumns(actions: ColumnActions): ColumnDef<IPNLogRow>[] {
  return [
    {
      accessorKey: "receivedAt",
      header: "Nhận lúc",
      cell: ({ getValue }) => (
        <span className="text-sm">{fmtDateTime(getValue() as string)}</span>
      ),
    },
    {
      accessorKey: "secretKeyValid",
      header: "Secret Key",
      cell: ({ getValue }) => {
        const valid = getValue() as boolean
        return valid ? (
          <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
            <Check className="size-3.5" />
            Hợp lệ
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
            <X className="size-3.5" />
            Không hợp lệ
          </span>
        )
      },
    },
    {
      accessorKey: "resultStatus",
      header: "Kết quả",
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground text-sm">—</span>
        return <StatusBadge status={v} />
      },
    },
    {
      accessorKey: "matchedOrderId",
      header: "Đơn hàng",
      cell: ({ getValue }) => {
        const id = getValue() as string | null
        if (!id) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <Link
            to={`/payments/${id}`}
            className="text-xs font-mono text-primary hover:underline"
            title={id}
          >
            {id.slice(0, 8)}…
          </Link>
        )
      },
    },
    {
      accessorKey: "sepayTransactionId",
      header: "SePay TXN ID",
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <div className="flex items-center gap-1 max-w-[160px]">
            <span className="truncate text-xs font-mono" title={v}>{v}</span>
            <CopyButton text={v} className="size-5 shrink-0" />
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => actions.onDetail(row.original)}
        >
          Xem
        </button>
      ),
      size: 48,
    },
  ]
}
