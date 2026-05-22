import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router"
import { MoreHorizontal, Eye, RotateCcw, CheckCircle2 } from "lucide-react"
import { differenceInMinutes, parseISO } from "date-fns"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge } from "@/components/common/status-badge"
import { fmtVnd, fmtDateTime } from "@/lib/format"
import type { PaymentRow } from "@/lib/api/payments"

interface ColumnActions {
  onDetail: (row: PaymentRow) => void
  onRefund: (row: PaymentRow) => void
  onReconcile: (row: PaymentRow) => void
}

const GRANT_TYPE_LABELS: Record<string, string> = {
  payment: "Thanh toán",
  admin_grant: "Cấp thủ công",
}

export function buildColumns(actions: ColumnActions): ColumnDef<PaymentRow>[] {
  return [
    {
      accessorKey: "invoiceNumber",
      header: "Số hóa đơn",
      cell: ({ getValue, row }) => (
        <Link
          to={`/payments/${row.original.id}`}
          className="font-mono text-sm text-primary hover:underline"
        >
          {getValue() as string}
        </Link>
      ),
    },
    {
      accessorKey: "userEmail",
      header: "Email",
      cell: ({ getValue }) => (
        <span className="text-sm">{(getValue() as string | null) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "amountVnd",
      header: "Số tiền",
      cell: ({ getValue }) => (
        <span className="text-sm font-medium">{fmtVnd(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Trạng thái",
      cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    },
    {
      accessorKey: "grantType",
      header: "Loại",
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <StatusBadge
            status={v}
            label={GRANT_TYPE_LABELS[v] ?? v}
            variantMap={{ payment: "blue", admin_grant: "amber" }}
          />
        )
      },
    },
    {
      accessorKey: "planCode",
      header: "Gói",
      cell: ({ getValue }) => (
        <span className="text-sm">{(getValue() as string | null) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "paidAt",
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
    {
      accessorKey: "createdAt",
      header: "Tạo lúc",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {fmtDateTime(getValue() as string)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const payment = row.original
        const canRefund = payment.status === "paid"
        const canReconcile =
          payment.status === "pending" &&
          differenceInMinutes(new Date(), parseISO(payment.createdAt)) > 30

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
                onClick={() => actions.onDetail(payment)}
                className="flex items-center gap-2"
              >
                <Eye className="size-3.5" />
                Xem chi tiết
              </DropdownMenuItem>
              {(canRefund || canReconcile) && <DropdownMenuSeparator />}
              {canRefund && (
                <DropdownMenuItem
                  onClick={() => actions.onRefund(payment)}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  <RotateCcw className="size-3.5" />
                  Hoàn tiền
                </DropdownMenuItem>
              )}
              {canReconcile && (
                <DropdownMenuItem
                  onClick={() => actions.onReconcile(payment)}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="size-3.5" />
                  Reconcile
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      size: 48,
    },
  ]
}
