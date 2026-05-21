import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery } from "@/hooks/use-paginated-query"
import { paymentsApi, type PaymentRow } from "@/lib/api/payments"
import { buildColumns } from "./columns"

const STATUS_OPTIONS = [
  { value: "pending", label: "Đang chờ" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "failed", label: "Thất bại" },
  { value: "cancelled", label: "Đã hủy" },
  { value: "refunded", label: "Đã hoàn tiền" },
]

const GRANT_TYPE_OPTIONS = [
  { value: "payment", label: "Thanh toán" },
  { value: "admin_grant", label: "Cấp thủ công" },
]

export default function PaymentsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState("")
  const [grantTypeFilter, setGrantTypeFilter] = useState("")
  const [searchFilter, setSearchFilter] = useState("")

  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null)
  const [refundLoading, setRefundLoading] = useState(false)

  const [reconcileTarget, setReconcileTarget] = useState<PaymentRow | null>(null)
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<PaymentRow>({
    queryFn: (p) =>
      paymentsApi.list({
        page: p.page,
        pageSize: p.pageSize,
        status: statusFilter || undefined,
        grantType: grantTypeFilter || undefined,
        search: searchFilter || undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  const handleRefund = async (reason: string) => {
    if (!refundTarget) return
    setRefundLoading(true)
    try {
      await paymentsApi.refund(refundTarget.id, reason)
      toast.success("Đã hoàn tiền thành công")
      setRefundTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hoàn tiền thất bại")
      throw e
    } finally {
      setRefundLoading(false)
    }
  }

  const handleReconcile = async () => {
    if (!reconcileTarget) return
    setReconcileLoading(true)
    try {
      const res = await paymentsApi.reconcile(reconcileTarget.id)
      const status = (res as { status?: string }).status
      if (status === "reconciled") {
        toast.success("Reconcile thành công")
      } else {
        toast.info(`Không tìm thấy IPN log khớp (status: ${status ?? "unknown"})`)
      }
      setReconcileTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconcile thất bại")
    } finally {
      setReconcileLoading(false)
    }
  }

  const columns = buildColumns({
    onDetail: (p) => { void navigate(`/payments/${p.id}`) },
    onRefund: (p) => setRefundTarget(p),
    onReconcile: (p) => setReconcileTarget(p),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Thanh toán</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} đơn hàng` : ""}
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

        <Select
          value={grantTypeFilter || "all"}
          onValueChange={(v) => {
            const val = (v ?? "") === "all" ? "" : (v ?? "")
            setGrantTypeFilter(val)
            setParams({ grant_type: val, page: 1 })
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tất cả loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            {GRANT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Tìm kiếm hóa đơn / email..."
          value={searchFilter}
          onChange={(e) => {
            setSearchFilter(e.target.value)
            setParams({ search: e.target.value, page: 1 })
          }}
          className="w-64"
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
        emptyMessage="Không tìm thấy đơn hàng"
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

      {/* Refund dialog */}
      <ReasonDialog
        open={!!refundTarget}
        onOpenChange={(open) => { if (!open) setRefundTarget(null) }}
        title="Hoàn tiền"
        description={`Hoàn tiền đơn hàng ${refundTarget?.invoiceNumber}?`}
        confirmLabel={refundLoading ? "Đang xử lý..." : "Xác nhận hoàn tiền"}
        destructive
        onConfirm={handleRefund}
      />

      {/* Reconcile dialog */}
      <ConfirmDialog
        open={!!reconcileTarget}
        onOpenChange={(open) => { if (!open) setReconcileTarget(null) }}
        title="Reconcile đơn hàng"
        description={`Reconcile đơn hàng ${reconcileTarget?.invoiceNumber}? Thao tác này sẽ tra cứu IPN log hợp lệ và đánh dấu đơn là PAID.`}
        confirmLabel={reconcileLoading ? "Đang xử lý..." : "Reconcile"}
        onConfirm={handleReconcile}
      />
    </div>
  )
}
