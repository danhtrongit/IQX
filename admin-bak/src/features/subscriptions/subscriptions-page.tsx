import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import type { RowSelectionState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { ReasonDialog } from "@/components/common/reason-dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { subscriptionsApi, type SubscriptionRow } from "@/lib/api/subscriptions"
import { buildColumns } from "./columns"

const STATUS_OPTIONS = [
  { value: "active", label: "Đang hoạt động" },
  { value: "expired", label: "Đã hết hạn" },
  { value: "cancelled", label: "Đã hủy" },
]

export default function SubscriptionsPage() {
  const navigate = useNavigate()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [statusFilter, setStatusFilter] = useState("")
  const [searchFilter, setSearchFilter] = useState("")
  const [expiringDays, setExpiringDays] = useState("")

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<SubscriptionRow | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  // Extend dialog
  const [extendTarget, setExtendTarget] = useState<SubscriptionRow | null>(null)
  const [extendDays, setExtendDays] = useState("30")
  const [extendReason, setExtendReason] = useState("")
  const [extendLoading, setExtendLoading] = useState(false)

  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<SubscriptionRow>({
    queryFn: (p) =>
      subscriptionsApi.list({
        page: p.page,
        pageSize: p.pageSize,
        status: statusFilter || undefined,
        expiringWithinDays: expiringDays ? Number(expiringDays) : undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  const handleCancel = async (reason: string) => {
    if (!cancelTarget) return
    setCancelLoading(true)
    try {
      await subscriptionsApi.cancel(cancelTarget.id, reason)
      toast.success("Đã hủy thuê bao thành công")
      setCancelTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hủy thất bại")
      throw e
    } finally {
      setCancelLoading(false)
    }
  }

  const handleExtend = async () => {
    if (!extendTarget) return
    const days = Number(extendDays)
    if (!days || days < 1) {
      toast.error("Số ngày gia hạn phải lớn hơn 0")
      return
    }
    setExtendLoading(true)
    try {
      await subscriptionsApi.extend(extendTarget.id, days, extendReason || undefined)
      toast.success(`Đã gia hạn ${days} ngày thành công`)
      setExtendTarget(null)
      setExtendDays("30")
      setExtendReason("")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gia hạn thất bại")
    } finally {
      setExtendLoading(false)
    }
  }

  const columns = buildColumns({
    onDetail: (sub) => { void navigate(`/subscriptions/${sub.id}`) },
    onCancel: (sub) => { setCancelTarget(sub) },
    onExtend: (sub) => { setExtendTarget(sub); setExtendDays("30"); setExtendReason("") },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Thuê bao</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} thuê bao` : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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

        <Input
          placeholder="Email người dùng..."
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value)
            setParams({ search: e.target.value, page: 1 })
          }}
          className="w-60"
        />

        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Hết hạn trong</Label>
          <Input
            type="number"
            placeholder="N ngày"
            value={expiringDays}
            onChange={(e) => {
              setExpiringDays(e.target.value)
              setParams({ expiringWithinDays: e.target.value, page: 1 })
            }}
            className="w-24"
            min={1}
          />
          <span className="text-sm text-muted-foreground">ngày</span>
        </div>
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
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        loading={isLoading}
        emptyMessage="Không tìm thấy thuê bao"
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

      {/* Cancel dialog */}
      <ReasonDialog
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        title="Hủy thuê bao"
        description={`Hủy thuê bao của ${cancelTarget?.userEmail ?? cancelTarget?.userId}?`}
        confirmLabel={cancelLoading ? "Đang xử lý..." : "Hủy thuê bao"}
        destructive
        onConfirm={handleCancel}
      />

      {/* Extend dialog */}
      <Dialog
        open={!!extendTarget}
        onOpenChange={(open) => { if (!open) { setExtendTarget(null); setExtendDays("30"); setExtendReason("") } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gia hạn thuê bao</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Số ngày gia hạn <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lý do</Label>
              <Textarea
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                placeholder="Nhập lý do..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Hủy</Button>
            <Button onClick={() => { void handleExtend() }} disabled={extendLoading}>
              {extendLoading ? "Đang xử lý..." : "Gia hạn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
