import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router"
import { MoreHorizontal, Eye, XCircle, CalendarPlus } from "lucide-react"
import { differenceInDays, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/common/status-badge"
import { fmtDate } from "@/lib/format"
import type { SubscriptionRow } from "@/lib/api/subscriptions"

interface ColumnActions {
  onDetail: (sub: SubscriptionRow) => void
  onCancel: (sub: SubscriptionRow) => void
  onExtend: (sub: SubscriptionRow) => void
}

function DaysRemaining({ endDate }: { endDate: string }) {
  const diff = differenceInDays(parseISO(endDate), new Date())
  if (diff > 0) {
    return <span className="text-xs text-emerald-600">còn {diff} ngày</span>
  }
  return <span className="text-xs text-red-500">đã hết hạn {Math.abs(diff)} ngày trước</span>
}

export function buildColumns(actions: ColumnActions): ColumnDef<SubscriptionRow>[] {
  return [
    {
      id: "user",
      header: "Người dùng",
      cell: ({ row }) => {
        const sub = row.original
        return (
          <Link
            to={`/users/${sub.userId}`}
            className="text-sm font-medium hover:underline text-primary"
          >
            {sub.userEmail ?? sub.userId}
          </Link>
        )
      },
    },
    {
      id: "plan",
      header: "Gói",
      cell: ({ row }) => {
        const sub = row.original
        if (!sub.planCode) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{sub.planCode}</span>
            {sub.planName && (
              <span className="text-xs text-muted-foreground">({sub.planName})</span>
            )}
            {sub.planCode?.toLowerCase().includes("trial") && (
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                Trial
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Trạng thái",
      cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    },
    {
      id: "period",
      header: "Thời hạn",
      cell: ({ row }) => {
        const sub = row.original
        return (
          <div className="space-y-0.5">
            <div className="text-sm">
              {fmtDate(sub.currentPeriodStart)} → {fmtDate(sub.currentPeriodEnd)}
            </div>
            {sub.status === "active" && (
              <DaysRemaining endDate={sub.currentPeriodEnd} />
            )}
          </div>
        )
      },
    },
    {
      id: "cancelled",
      header: "Hủy",
      cell: ({ row }) => {
        const sub = row.original
        if (!sub.cancelledAt) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <Badge variant="outline" className="border-red-300 text-red-700 text-xs">
            Đã hủy
          </Badge>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const sub = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Hành động"
              className="inline-flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => actions.onDetail(sub)}
                className="flex items-center gap-2"
              >
                <Eye className="size-3.5" />
                Xem chi tiết
              </DropdownMenuItem>
              {sub.status === "active" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => actions.onCancel(sub)}
                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                  >
                    <XCircle className="size-3.5" />
                    Hủy thuê bao
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.onExtend(sub)}
                    className="flex items-center gap-2"
                  >
                    <CalendarPlus className="size-3.5" />
                    Gia hạn
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      size: 48,
    },
  ]
}
