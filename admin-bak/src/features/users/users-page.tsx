import { useState } from "react"
import type { DateRange } from "react-day-picker"
import type { RowSelectionState } from "@tanstack/react-table"
import { toast } from "sonner"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableBulkActions } from "@/components/data-table/data-table-bulk-actions"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CopyButton } from "@/components/common/copy-button"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { usersApi, type AdminUserRow, type BulkOp } from "@/lib/api/users"
import { buildColumns } from "./columns"
import { UsersFilters } from "./filters"

export default function UsersPage() {
  // ── Selection ──────────────────────────────────────────────────────────
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // ── Filters ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [loginRange, setLoginRange] = useState<DateRange | undefined>()

  // ── Bulk state ─────────────────────────────────────────────────────────
  const [bulkOp, setBulkOp] = useState<BulkOp | "">("")
  const [bulkValue, setBulkValue] = useState("")
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // ── Reset password dialog ──────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  // ── CSV export ─────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  // ── Paginated query ────────────────────────────────────────────────────
  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<AdminUserRow>({
    queryFn: (p) =>
      usersApi.list({
        page: p.page,
        pageSize: p.pageSize,
        sortBy: p.sortBy,
        sortDir: p.sortDir,
        role: roles.length === 1 ? roles[0] : undefined,
        status: statuses.length === 1 ? statuses[0] : undefined,
        search: search || undefined,
      }),
    defaults: { page: 1, pageSize: 20, sortBy: "created_at", sortDir: "desc" },
  })

  // Re-fetch when filters change
  const handleSearchChange = (v: string) => {
    setSearch(v)
    setParams({ search: v, page: 1 })
  }

  const handleRolesChange = (v: string[]) => {
    setRoles(v)
    setParams({ role: v.length === 1 ? v[0] : "", page: 1 })
  }

  const handleStatusesChange = (v: string[]) => {
    setStatuses(v)
    setParams({ status: v.length === 1 ? v[0] : "", page: 1 })
  }

  // Selected rows
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k])
  const selectedCount = selectedIds.length

  // ── Bulk confirm ───────────────────────────────────────────────────────
  const handleBulkConfirm = async () => {
    if (!bulkOp) return
    setBulkLoading(true)
    try {
      const body = {
        user_ids: selectedIds,
        op: bulkOp,
        value: bulkOp !== "soft_delete" ? bulkValue : null,
      }
      const res = await usersApi.bulk(body)
      toast.success(`Đã cập nhật ${res.affected} người dùng`)
      setRowSelection({})
      setBulkOp("")
      setBulkValue("")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại")
    } finally {
      setBulkLoading(false)
    }
  }

  // ── Reset password ─────────────────────────────────────────────────────
  const handleResetPassword = async (user: AdminUserRow) => {
    setResetTarget(user)
    setTempPassword(null)
    setResetLoading(true)
    try {
      const res = await usersApi.resetPassword(user.id)
      setTempPassword(res.temporary_password)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể đặt lại mật khẩu")
      setResetTarget(null)
    } finally {
      setResetLoading(false)
    }
  }

  // ── Resend verification ────────────────────────────────────────────────
  const handleResendVerification = async (user: AdminUserRow) => {
    try {
      await usersApi.resendVerification(user.id)
      toast.success(`Đã gửi lại email xác thực cho ${user.email}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gửi thất bại")
    }
  }

  // ── Export CSV ─────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const filters: Record<string, string> = {}
      if (search) filters.search = search
      if (roles.length === 1) filters.role = roles[0]
      if (statuses.length === 1) filters.status = statuses[0]
      if (loginRange?.from)
        filters.last_login_from = loginRange.from.toISOString()
      if (loginRange?.to)
        filters.last_login_to = loginRange.to.toISOString()
      await usersApi.exportCsv(filters)
      toast.success("Đã xuất CSV thành công")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export thất bại")
    } finally {
      setExporting(false)
    }
  }

  const columns = buildColumns({
    onResetPassword: (u) => { void handleResetPassword(u) },
    onResendVerification: (u) => { void handleResendVerification(u) },
  })

  const pagination = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Người dùng</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} người dùng` : ""}
        </p>
      </div>

      {/* Filters */}
      <UsersFilters
        search={search}
        onSearchChange={handleSearchChange}
        roles={roles}
        onRolesChange={handleRolesChange}
        statuses={statuses}
        onStatusesChange={handleStatusesChange}
        loginRange={loginRange}
        onLoginRangeChange={setLoginRange}
        onExportCsv={() => { void handleExportCsv() }}
        exporting={exporting}
      />

      {/* Bulk toolbar */}
      <DataTableBulkActions
        selectedCount={selectedCount}
        onClearSelection={() => setRowSelection({})}
      >
        <Select
          value={bulkOp}
          onValueChange={(v) => {
            setBulkOp((v ?? "") as BulkOp | "")
            setBulkValue("")
          }}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Chọn thao tác" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="set_role">Đặt vai trò</SelectItem>
            <SelectItem value="set_status">Đặt trạng thái</SelectItem>
            <SelectItem value="soft_delete">Xoá mềm</SelectItem>
          </SelectContent>
        </Select>

        {bulkOp === "set_role" && (
          <Select value={bulkValue} onValueChange={(v) => setBulkValue(v ?? "")}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Vai trò" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        )}

        {bulkOp === "set_status" && (
          <Select value={bulkValue} onValueChange={(v) => setBulkValue(v ?? "")}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="inactive">Không hoạt động</SelectItem>
              <SelectItem value="suspended">Bị đình chỉ</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={
            !bulkOp ||
            (bulkOp !== "soft_delete" && !bulkValue) ||
            bulkLoading
          }
          onClick={() => setConfirmBulk(true)}
        >
          Áp dụng
        </Button>
      </DataTableBulkActions>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 1}
        pagination={pagination}
        onPaginationChange={(updater) => {
          const next =
            typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        loading={isLoading}
        emptyMessage="Không tìm thấy người dùng"
      />

      {/* Pagination */}
      <DataTablePagination
        pagination={pagination}
        pageCount={data?.totalPages ?? 1}
        onPaginationChange={(updater) => {
          const next =
            typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        total={data?.total}
      />

      {/* Bulk confirm dialog */}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title="Xác nhận thao tác hàng loạt"
        description={`Áp dụng "${bulkOp}" cho ${selectedCount} người dùng đã chọn?`}
        destructive={bulkOp === "soft_delete"}
        confirmLabel={bulkLoading ? "Đang xử lý..." : "Xác nhận"}
        onConfirm={handleBulkConfirm}
      />

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setTempPassword(null)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {resetLoading ? (
              <p className="text-sm text-muted-foreground">Đang tạo mật khẩu...</p>
            ) : tempPassword ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Mật khẩu tạm thời cho{" "}
                  <strong>{resetTarget?.email}</strong>:
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <code className="flex-1 text-sm font-mono break-all">
                    {tempPassword}
                  </code>
                  <CopyButton text={tempPassword} />
                </div>
                <p className="text-xs text-amber-600">
                  Hãy chia sẻ mật khẩu này một cách an toàn. Mật khẩu sẽ không được gửi qua email.
                </p>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
