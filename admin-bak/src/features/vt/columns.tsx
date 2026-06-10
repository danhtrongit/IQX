import type { ColumnDef } from "@tanstack/react-table"
import { Lock, MoreHorizontal, Snowflake, Unlock, DollarSign, RotateCcw } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/common/status-badge"
import { fmtVnd, fmtDateTime } from "@/lib/format"
import type { VTAccountRow } from "@/lib/api/vt"

interface ColumnActions {
  onFreeze: (acct: VTAccountRow) => void
  onUnfreeze: (acct: VTAccountRow) => void
  onCashAdjust: (acct: VTAccountRow) => void
  onReset: (acct: VTAccountRow) => void
}

export function buildColumns(actions: ColumnActions): ColumnDef<VTAccountRow>[] {
  return [
    {
      id: "user",
      header: "Người dùng",
      cell: ({ row }) => {
        const acct = row.original
        return (
          <div>
            <p className="text-sm font-medium">{acct.userEmail ?? acct.userId}</p>
            {acct.userName && (
              <p className="text-xs text-muted-foreground">{acct.userName}</p>
            )}
          </div>
        )
      },
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: ({ row }) => {
        const acct = row.original
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={acct.status} />
            {acct.frozenAt && (
              <Lock className="size-3.5 text-amber-600" aria-label="Đang bị khóa" />
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "initialCashVnd",
      header: "Vốn ban đầu",
      cell: ({ getValue }) => (
        <span className="text-sm">{fmtVnd(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "cashAvailableVnd",
      header: "Khả dụng",
      cell: ({ getValue }) => (
        <span className="text-sm font-medium">{fmtVnd(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "cashReservedVnd",
      header: "Đặt cọc",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{fmtVnd(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "cashPendingVnd",
      header: "Chờ thanh toán",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{fmtVnd(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "activatedAt",
      header: "Kích hoạt lúc",
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return (
          <span className="text-sm text-muted-foreground">
            {v ? fmtDateTime(v) : "—"}
          </span>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: "Tạo lúc",
      cell: ({ getValue }) => {
        const v = getValue() as string
        return (
          <span className="text-sm text-muted-foreground">
            {v ? fmtDateTime(v) : "—"}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const acct = row.original
        const isFrozen = !!acct.frozenAt
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Hành động"
              className="inline-flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isFrozen ? (
                <DropdownMenuItem
                  onClick={() => actions.onFreeze(acct)}
                  className="flex items-center gap-2 text-amber-700 focus:text-amber-700"
                >
                  <Snowflake className="size-3.5" />
                  Khóa tài khoản
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => actions.onUnfreeze(acct)}
                  className="flex items-center gap-2 text-green-700 focus:text-green-700"
                >
                  <Unlock className="size-3.5" />
                  Mở khóa
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => actions.onCashAdjust(acct)}
                className="flex items-center gap-2"
              >
                <DollarSign className="size-3.5" />
                Điều chỉnh tiền
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => actions.onReset(acct)}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <RotateCcw className="size-3.5" />
                Reset tài khoản
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        )
      },
      size: 48,
    },
  ]
}
