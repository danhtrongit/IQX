import { useState } from "react"
import { toast } from "sonner"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { vtApi, type VTAccountRow } from "@/lib/api/vt"
import { fmtVnd } from "@/lib/format"
import { buildColumns } from "./columns"

const STATUS_OPTIONS = [
  { value: "active", label: "Đang hoạt động" },
  { value: "inactive", label: "Chưa kích hoạt" },
  { value: "suspended", label: "Đã khóa" },
]

export default function VTAccountsPage() {
  const [statusFilter, setStatusFilter] = useState("")
  const [frozenOnly, setFrozenOnly] = useState(false)
  const [searchFilter, setSearchFilter] = useState("")

  // Freeze
  const [freezeTarget, setFreezeTarget] = useState<VTAccountRow | null>(null)
  const [freezeLoading, setFreezeLoading] = useState(false)

  // Unfreeze
  const [unfreezeTarget, setUnfreezeTarget] = useState<VTAccountRow | null>(null)
  const [unfreezeLoading, setUnfreezeLoading] = useState(false)

  // Cash adjust
  const [cashTarget, setCashTarget] = useState<VTAccountRow | null>(null)
  const [cashAmount, setCashAmount] = useState("")
  const [cashReason, setCashReason] = useState("")
  const [cashLoading, setCashLoading] = useState(false)

  // Reset
  const [resetTarget, setResetTarget] = useState<VTAccountRow | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<VTAccountRow>({
    queryFn: (p) =>
      vtApi.listAccounts({
        page: p.page,
        pageSize: p.pageSize,
        status: statusFilter || undefined,
        frozenOnly: frozenOnly || null,
        search: searchFilter || undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  const handleFreeze = async (reason: string) => {
    if (!freezeTarget) return
    setFreezeLoading(true)
    try {
      await vtApi.freeze(freezeTarget.id, reason)
      toast.success("Đã khóa tài khoản")
      setFreezeTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Khóa thất bại")
      throw e
    } finally {
      setFreezeLoading(false)
    }
  }

  const handleUnfreeze = async () => {
    if (!unfreezeTarget) return
    setUnfreezeLoading(true)
    try {
      await vtApi.unfreeze(unfreezeTarget.id)
      toast.success("Đã mở khóa tài khoản")
      setUnfreezeTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mở khóa thất bại")
    } finally {
      setUnfreezeLoading(false)
    }
  }

  const handleCashAdjust = async () => {
    if (!cashTarget) return
    const amount = Number(cashAmount)
    if (!cashAmount || isNaN(amount) || amount === 0) {
      toast.error("Số tiền không hợp lệ (phải khác 0)")
      return
    }
    if (!cashReason.trim()) {
      toast.error("Lý do bắt buộc")
      return
    }
    setCashLoading(true)
    try {
      const res = await vtApi.cashAdjust(cashTarget.id, amount, cashReason)
      toast.success(`Điều chỉnh thành công. Số dư mới: ${fmtVnd(res.newCashAvailableVnd)}`)
      setCashTarget(null)
      setCashAmount("")
      setCashReason("")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Điều chỉnh thất bại")
    } finally {
      setCashLoading(false)
    }
  }

  const handleReset = async () => {
    if (!resetTarget) return
    setResetLoading(true)
    try {
      await vtApi.reset(resetTarget.userId)
      toast.success("Đã reset tài khoản")
      setResetTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset thất bại")
    } finally {
      setResetLoading(false)
    }
  }

  const columns = buildColumns({
    onFreeze: (acct) => setFreezeTarget(acct),
    onUnfreeze: (acct) => setUnfreezeTarget(acct),
    onCashAdjust: (acct) => { setCashTarget(acct); setCashAmount(""); setCashReason("") },
    onReset: (acct) => setResetTarget(acct),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tài khoản giao dịch ảo</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} tài khoản` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            const val = (v ?? "") === "all" ? "" : (v ?? "")
            setStatusFilter(val)
            setParams({ status: val, page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id="frozen-only"
            checked={frozenOnly}
            onCheckedChange={(checked) => {
              setFrozenOnly(checked)
              setParams({ frozen_only: checked ? "true" : "", page: 1 })
            }}
          />
          <Label htmlFor="frozen-only" className="cursor-pointer text-sm">
            Chỉ tài khoản bị khóa
          </Label>
        </div>

        <Input
          placeholder="Email / tên người dùng..."
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value)
            setParams({ search: e.target.value, page: 1 })
          }}
          className="w-60"
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
        emptyMessage="Không tìm thấy tài khoản"
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

      {/* Freeze dialog */}
      <ReasonDialog
        open={!!freezeTarget}
        onOpenChange={(open) => { if (!open) setFreezeTarget(null) }}
        title="Khóa tài khoản"
        description={`Khóa tài khoản của ${freezeTarget?.userEmail ?? freezeTarget?.userId}?`}
        confirmLabel={freezeLoading ? "Đang xử lý..." : "Khóa tài khoản"}
        destructive
        onConfirm={handleFreeze}
      />

      {/* Unfreeze dialog */}
      <ConfirmDialog
        open={!!unfreezeTarget}
        onOpenChange={(open) => { if (!open) setUnfreezeTarget(null) }}
        title="Mở khóa tài khoản"
        description={`Mở khóa tài khoản của ${unfreezeTarget?.userEmail ?? unfreezeTarget?.userId}?`}
        confirmLabel={unfreezeLoading ? "Đang xử lý..." : "Mở khóa"}
        onConfirm={handleUnfreeze}
      />

      {/* Cash adjust dialog */}
      <Dialog
        open={!!cashTarget}
        onOpenChange={(open) => {
          if (!open) { setCashTarget(null); setCashAmount(""); setCashReason("") }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Điều chỉnh số dư tiền mặt</DialogTitle>
          </DialogHeader>
          {cashTarget && (
            <p className="text-sm text-muted-foreground">
              Tài khoản: <strong>{cashTarget.userEmail ?? cashTarget.userId}</strong>
              <br />
              Số dư hiện tại: <strong>{fmtVnd(cashTarget.cashAvailableVnd)}</strong>
            </p>
          )}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Số tiền (+ hoặc -) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Ví dụ: 500000 hoặc -100000"
              />
              <p className="text-xs text-muted-foreground">Giá trị âm = trừ tiền, dương = cộng tiền</p>
            </div>
            <div className="space-y-1.5">
              <Label>Lý do <span className="text-destructive">*</span></Label>
              <Textarea
                value={cashReason}
                onChange={(e) => setCashReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashTarget(null)}>Hủy</Button>
            <Button
              onClick={() => { void handleCashAdjust() }}
              disabled={cashLoading}
            >
              {cashLoading ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => { if (!open) setResetTarget(null) }}
        title="Reset tài khoản"
        description={`Reset tài khoản của ${resetTarget?.userEmail ?? resetTarget?.userId}? Thao tác này sẽ đặt lại toàn bộ lệnh và vị thế.`}
        destructive
        confirmLabel={resetLoading ? "Đang xử lý..." : "Reset"}
        onConfirm={handleReset}
      />
    </div>
  )
}
