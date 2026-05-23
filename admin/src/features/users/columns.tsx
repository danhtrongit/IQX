import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router"
import { MoreHorizontal, RotateCcw, Mail, Eye } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/common/status-badge"
import { fmtRelative, fmtDate } from "@/lib/format"
import type { AdminUserRow } from "@/lib/api/users"


const ROLE_LABELS: Record<string, string> = {
  user: "User",
  premium: "Premium",
  admin: "Admin",
}

interface ColumnActions {
  onResetPassword: (user: AdminUserRow) => void
  onResendVerification: (user: AdminUserRow) => void
}

function initials(user: AdminUserRow): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
}

export function buildColumns(actions: ColumnActions): ColumnDef<AdminUserRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Chọn tất cả"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Chọn hàng"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      id: "user",
      header: "Người dùng",
      cell: ({ row }) => {
        const user = row.original
        return (
          <Link
            to={`/users/${user.id}`}
            className="flex items-center gap-2.5 hover:underline"
          >
            <Avatar className="size-7 shrink-0">
              <AvatarFallback className="text-xs">{initials(user)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.fullName ?? `${user.firstName} ${user.lastName}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </Link>
        )
      },
    },
    {
      accessorKey: "phoneNumber",
      header: "SĐT",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {(getValue() as string | null) ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: "Vai trò",
      cell: ({ getValue }) => {
        const role = getValue() as string
        return (
          <StatusBadge
            status={role}
            label={ROLE_LABELS[role] ?? role}
            variantMap={{ premium: "blue", admin: "amber", user: "gray" }}
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
      accessorKey: "isEmailVerified",
      header: "Email xác thực",
      cell: ({ getValue }) => (
        <StatusBadge
          status={String(getValue())}
          label={getValue() ? "Đã xác thực" : "Chưa xác thực"}
        />
      ),
    },
    {
      accessorKey: "lastLoginAt",
      header: "Đăng nhập lần cuối",
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return (
          <span className="text-sm text-muted-foreground">
            {v ? fmtRelative(v) : "—"}
          </span>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: "Ngày tạo",
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const user = row.original
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
              <DropdownMenuItem
                onClick={() => {
                  // Navigate to user 360
                  window.location.href = `/users/${user.id}`
                }}
                className="flex items-center gap-2"
              >
                <Eye className="size-3.5" />
                Xem 360
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => actions.onResetPassword(user)}
                className="flex items-center gap-2"
              >
                <RotateCcw className="size-3.5" />
                Đặt lại mật khẩu
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => actions.onResendVerification(user)}
                className="flex items-center gap-2"
              >
                <Mail className="size-3.5" />
                Gửi lại xác thực
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
