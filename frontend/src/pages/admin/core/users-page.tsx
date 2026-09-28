import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import { Copy, Download, KeyRound, Mail, RotateCw, Search, UserCog } from "lucide-react"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  ASSIGNABLE_STATUSES,
  type AdminUserRow,
  type BulkOp,
  type ResetPasswordResult,
  type UserSortField,
} from "./api"
import { AdminDataTable, type AdminColumn, type AdminSort } from "./components/admin-data-table"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import { StatusBadge } from "./components/status-badge"
import {
  useAdminUsers,
  useBulkUpdateUsers,
  useExportUsersCsv,
  useResetUserPassword,
  useResendUserVerification,
} from "./hooks"
import { labelForRole, labelForStatus } from "./labels"

const ALL = "all"

const ROLE_LABELS_BY_VALUE: Record<string, string> = Object.fromEntries(
  ADMIN_ROLES.map((role) => [role, labelForRole(role)]),
)

const BULK_OP_LABELS: Record<BulkOp, string> = {
  set_role: "Đặt vai trò",
  set_status: "Đặt trạng thái",
  soft_delete: "Xóa mềm",
}

type Filters = { search: string; role: string; status: string }

export function UsersPage() {
  const [searchInput, setSearchInput] = useState("")
  const [filters, setFilters] = useState<Filters>({ search: "", role: ALL, status: ALL })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState<AdminSort>({ field: "created_at", dir: "desc" })
  const [selected, setSelected] = useState<string[]>([])
  const [bulkOp, setBulkOp] = useState<BulkOp | "">("")
  const [bulkValue, setBulkValue] = useState("")
  const [temporaryPassword, setTemporaryPassword] = useState<ResetPasswordResult | null>(null)

  const users = useAdminUsers({
    page,
    pageSize,
    sortBy: sort.field as UserSortField,
    sortDir: sort.dir,
    role: filters.role === ALL ? undefined : filters.role,
    status: filters.status === ALL ? undefined : filters.status,
    search: filters.search || undefined,
  })
  const bulk = useBulkUpdateUsers()
  const resetPassword = useResetUserPassword()
  const resendVerification = useResendUserVerification()
  const exportCsv = useExportUsersCsv()
  const confirm = useConfirmDialog()

  const rows = users.data?.items ?? []
  const emailById = new Map(rows.map((row) => [row.id, row.email]))

  function applyFilters(next: Partial<Filters>) {
    setFilters((previous) => ({ ...previous, ...next }))
    setPage(1)
    setSelected([])
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    applyFilters({ search: searchInput.trim() })
  }

  function changeSort(field: string) {
    setSort((previous) =>
      previous.field === field ? { field, dir: previous.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" },
    )
    setPage(1)
  }

  function askResetPassword(user: AdminUserRow) {
    confirm.ask({
      title: "Đặt lại mật khẩu?",
      description: `Mật khẩu hiện tại của ${user.email} sẽ bị thay thế bằng một mật khẩu tạm thời do hệ thống sinh ra.`,
      confirmLabel: "Đặt lại",
      body: (
        <p className="text-muted-foreground">
          Hệ thống cũng gửi email đặt lại mật khẩu tới người dùng; mật khẩu tạm thời trả về ngay sau đó để
          chia sẻ dự phòng nếu email không tới.
        </p>
      ),
      run: async () => {
        try {
          const result = await resetPassword.mutateAsync(user.id)
          setTemporaryPassword(result)
          toast.success(`Đã đặt lại mật khẩu cho ${user.email}`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askResendVerification(user: AdminUserRow) {
    confirm.ask({
      title: "Gửi lại email xác thực?",
      description: `${user.email} sẽ nhận một email xác thực mới.`,
      confirmLabel: "Gửi lại",
      run: async () => {
        try {
          const message = await resendVerification.mutateAsync(user.id)
          toast.success(message)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askBulk() {
    if (!bulkOp || selected.length === 0) return
    if (bulkOp !== "soft_delete" && !bulkValue) {
      toast.error("Chọn giá trị cần áp dụng")
      return
    }
    const targets = selected.map((id) => emailById.get(id) ?? id)
    const operation =
      bulkOp === "soft_delete"
        ? BULK_OP_LABELS.soft_delete
        : `${BULK_OP_LABELS[bulkOp]} → ${bulkOp === "set_role" ? labelForRole(bulkValue) : labelForStatus(bulkValue)}`
    confirm.ask({
      title: bulkOp === "soft_delete" ? "Xóa mềm người dùng?" : "Áp dụng thao tác hàng loạt?",
      description: `${operation} cho ${selected.length} người dùng.`,
      confirmLabel: bulkOp === "soft_delete" ? "Xóa mềm" : "Áp dụng",
      tone: bulkOp === "soft_delete" ? "destructive" : "default",
      body: (
        <ul className="space-y-1 text-muted-foreground">
          {targets.slice(0, 6).map((target) => (
            <li key={target} className="truncate font-mono text-xs">
              {target}
            </li>
          ))}
          {targets.length > 6 && <li className="text-xs">… và {targets.length - 6} người dùng khác</li>}
        </ul>
      ),
      run: async () => {
        try {
          const result = await bulk.mutateAsync({
            userIds: selected,
            op: bulkOp,
            value: bulkOp === "soft_delete" ? null : bulkValue,
          })
          const problems = [
            result.skipped.length > 0 ? `bỏ qua ${result.skipped.length}` : null,
            result.errors.length > 0
              ? `${result.errors.length} lỗi (${result.errors[0].message})`
              : null,
          ].filter(Boolean)
          if (problems.length > 0) {
            toast.warning(`Đã cập nhật ${result.affected} người dùng · ${problems.join(" · ")}`)
          } else {
            toast.success(`Đã cập nhật ${result.affected} người dùng`)
          }
          setSelected([])
          setBulkOp("")
          setBulkValue("")
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  function askExport() {
    confirm.ask({
      title: "Xuất CSV người dùng?",
      description: "Bộ lọc đang áp dụng sẽ được dùng cho tệp xuất.",
      confirmLabel: "Xuất CSV",
      body: (
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Tìm kiếm: {filters.search || "tất cả"}</div>
          <div>Vai trò: {filters.role === ALL ? "tất cả" : ROLE_LABELS_BY_VALUE[filters.role]}</div>
          <div>Trạng thái: {filters.status === ALL ? "tất cả" : labelForStatus(filters.status)}</div>
        </div>
      ),
      run: async () => {
        try {
          const filename = await exportCsv.mutateAsync({
            role: filters.role === ALL ? undefined : filters.role,
            status: filters.status === ALL ? undefined : filters.status,
            search: filters.search || undefined,
          })
          toast.success(`Đã xuất ${filename}`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  const columns: AdminColumn<AdminUserRow>[] = [
    {
      id: "email",
      header: "Email",
      sortKey: "email",
      cell: (user) => (
        <Link
          to={`/admin/users/${user.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {user.email}
        </Link>
      ),
    },
    {
      id: "fullName",
      header: "Tên",
      sortKey: "full_name",
      cell: (user) => user.fullName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "phone",
      header: "Điện thoại",
      cell: (user) =>
        user.phoneNumber ? (
          <span className="font-mono text-xs">{user.phoneNumber}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "role",
      header: "Vai trò",
      sortKey: "role",
      cell: (user) => <StatusBadge status={user.role} label={labelForRole(user.role)} tone="info" />,
    },
    {
      id: "status",
      header: "Trạng thái",
      sortKey: "status",
      cell: (user) => <StatusBadge status={user.status} />,
    },
    {
      id: "verified",
      header: "Xác thực",
      cell: (user) => <StatusBadge status={user.isEmailVerified} label={user.isEmailVerified ? "Đã xác thực" : "Chưa xác thực"} />,
    },
    {
      id: "lastLogin",
      header: "Đăng nhập gần nhất",
      sortKey: "last_login_at",
      cell: (user) =>
        user.lastLoginAt ? (
          <span className="tabular-nums">{formatDateTime(user.lastLoginAt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "createdAt",
      header: "Tạo lúc",
      sortKey: "created_at",
      cell: (user) => <span className="tabular-nums">{formatDateTime(user.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "Thao tác",
      align: "right",
      cell: (user) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/users/${user.id}`}>
              <UserCog />
              Chi tiết
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Đặt lại mật khẩu ${user.email}`}
            title="Đặt lại mật khẩu"
            onClick={() => askResetPassword(user)}
          >
            <KeyRound />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Gửi lại email xác thực ${user.email}`}
            title="Gửi lại email xác thực"
            disabled={user.isEmailVerified}
            onClick={() => askResendVerification(user)}
          >
            <Mail />
          </Button>
        </div>
      ),
    },
  ]

  const state = users.data

  return (
    <WorkspacePage
      title="Người dùng"
      description={
        state ? `${state.total} người dùng khớp bộ lọc` : "Tìm kiếm, phân quyền và xử lý tài khoản người dùng"
      }
      actions={
        <Button variant="outline" size="sm" disabled={exportCsv.isPending} onClick={askExport}>
          {exportCsv.isPending ? <RotateCw className="animate-spin" /> : <Download />}
          Xuất CSV
        </Button>
      }
    >
      <form
        onSubmit={submitSearch}
        className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60 ring-inset dark:ring-0"
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm theo email hoặc tên"
            aria-label="Tìm theo email hoặc tên"
            className="pl-8"
          />
        </div>
        <Select value={filters.role} onValueChange={(value) => applyFilters({ role: value })}>
          <SelectTrigger className="w-[9.5rem]" aria-label="Lọc theo vai trò">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi vai trò</SelectItem>
            {ADMIN_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {labelForRole(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => applyFilters({ status: value })}>
          <SelectTrigger className="w-[11rem]" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {ADMIN_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {labelForStatus(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm">
          <Search />
          Lọc
        </Button>
        {(filters.search || filters.role !== ALL || filters.status !== ALL) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("")
              applyFilters({ search: "", role: ALL, status: ALL })
            }}
          >
            Xóa bộ lọc
          </Button>
        )}
      </form>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60 ring-inset dark:ring-0">
          <span className="text-sm">Đã chọn {selected.length} người dùng</span>
          <Select value={bulkOp} onValueChange={(value) => { setBulkOp(value as BulkOp); setBulkValue("") }}>
            <SelectTrigger className="w-[11rem]" aria-label="Thao tác hàng loạt">
              <SelectValue placeholder="Chọn thao tác" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BULK_OP_LABELS) as BulkOp[]).map((op) => (
                <SelectItem key={op} value={op}>
                  {BULK_OP_LABELS[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkOp === "set_role" && (
            <Select value={bulkValue} onValueChange={setBulkValue}>
              <SelectTrigger className="w-[9.5rem]" aria-label="Vai trò áp dụng">
                <SelectValue placeholder="Vai trò" />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {labelForRole(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {bulkOp === "set_status" && (
            <Select value={bulkValue} onValueChange={setBulkValue}>
              <SelectTrigger className="w-[11rem]" aria-label="Trạng thái áp dụng">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {labelForStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" disabled={!bulkOp || bulk.isPending} onClick={askBulk}>
            Áp dụng
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        loading={users.isLoading || users.isFetching}
        error={users.error ? errorMessage(users.error) : null}
        onRetry={() => void users.refetch()}
        emptyLabel="Không có người dùng khớp bộ lọc."
        sort={sort}
        onSortChange={changeSort}
        selection={{
          selected,
          onToggle: (key) =>
            setSelected((previous) =>
              previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
            ),
          onToggleAll: (keys) =>
            setSelected((previous) => {
              const allSelected = keys.every((key) => previous.includes(key))
              return allSelected
                ? previous.filter((key) => !keys.includes(key))
                : [...new Set([...previous, ...keys])]
            }),
        }}
        pagination={{
          page,
          pageSize,
          total: state?.total ?? 0,
          totalPages: state?.totalPages ?? 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setPage(1)
          },
        }}
      />

      {confirm.element}

      <Dialog open={temporaryPassword !== null} onOpenChange={(open) => !open && setTemporaryPassword(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mật khẩu tạm thời</DialogTitle>
            <DialogDescription>
              Chỉ hiển thị một lần. Hãy chia sẻ qua kênh an toàn và yêu cầu người dùng đổi ngay sau khi đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {temporaryPassword?.temporaryPassword}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!temporaryPassword) return
                void navigator.clipboard
                  .writeText(temporaryPassword.temporaryPassword)
                  .then(() => toast.success("Đã sao chép mật khẩu tạm thời"))
                  .catch(() => toast.error("Không sao chép được — hãy chọn và sao chép thủ công"))
              }}
            >
              <Copy />
              Sao chép
            </Button>
          </div>
          {temporaryPassword?.warning && (
            <p className="text-xs leading-5 text-muted-foreground">{temporaryPassword.warning}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemporaryPassword(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  )
}
