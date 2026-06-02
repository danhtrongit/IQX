import { useCallback, useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router"
import { ArrowLeft, RotateCcw, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { differenceInMinutes, parseISO } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/status-badge"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { JsonViewer } from "@/components/common/json-viewer"
import { ErrorState } from "@/components/common/error-state"
import { fmtVnd, fmtDateTime, fmtDate } from "@/lib/format"
import { paymentsApi, type PaymentDetail, type IPNLogBrief } from "@/lib/api/payments"

function LabeledValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function IPNLogRow({ log }: { log: IPNLogBrief }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <div className="text-sm font-medium">{fmtDateTime(log.receivedAt)}</div>
            {log.sepayTransactionId && (
              <div className="text-xs text-muted-foreground font-mono">{log.sepayTransactionId}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={log.secretKeyValid ? "active" : "failed"}
            label={log.secretKeyValid ? "Key hợp lệ" : "Key sai"}
          />
          {log.resultStatus && <StatusBadge status={log.resultStatus} />}
        </div>
      </button>
      {expanded && log.rawBody && (
        <div className="border-t px-3 pb-3 pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Raw Body</p>
          <JsonViewer data={log.rawBody} maxHeight="240px" />
        </div>
      )}
      {expanded && log.errorMessage && (
        <div className="border-t px-3 pb-3 pt-2">
          <p className="text-xs font-medium text-red-600 mb-1">Lỗi</p>
          <p className="text-sm text-red-700">{log.errorMessage}</p>
        </div>
      )}
    </div>
  )
}

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const navigate = useNavigate()
  const [payment, setPayment] = useState<PaymentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)

  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const load = useCallback(async () => {
    if (!paymentId) return
    setLoading(true)
    setError(null)
    try {
      const data = await paymentsApi.get(paymentId)
      setPayment(data)
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Không thể tải dữ liệu"))
    } finally {
      setLoading(false)
    }
  }, [paymentId])

  useEffect(() => { void load() }, [load])

  const handleRefund = async (reason: string) => {
    if (!payment) return
    setRefundLoading(true)
    try {
      const updated = await paymentsApi.refund(payment.id, reason)
      setPayment(updated)
      toast.success("Đã hoàn tiền thành công")
      setRefundOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hoàn tiền thất bại")
      throw e
    } finally {
      setRefundLoading(false)
    }
  }

  const handleReconcile = async () => {
    if (!payment) return
    setReconcileLoading(true)
    try {
      const res = await paymentsApi.reconcile(payment.id)
      const status = (res as { status?: string }).status
      if (status === "reconciled") {
        toast.success("Reconcile thành công")
        void load()
      } else {
        toast.info(`Không tìm thấy IPN log khớp`)
      }
      setReconcileOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconcile thất bại")
    } finally {
      setReconcileLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !payment) {
    return <ErrorState message={error?.message ?? "Không tìm thấy đơn hàng"} onRetry={load} />
  }

  const canRefund = payment.status === "paid"
  const canReconcile =
    payment.status === "pending" &&
    differenceInMinutes(new Date(), parseISO(payment.createdAt)) > 30

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => void navigate(-1)}>
            <ArrowLeft className="size-4 mr-1" />
            Quay lại
          </Button>
          <h1 className="text-2xl font-bold">{payment.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground font-mono">{payment.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRefund && (
            <Button variant="destructive" size="sm" onClick={() => setRefundOpen(true)}>
              <RotateCcw className="size-4 mr-1" />
              Hoàn tiền
            </Button>
          )}
          {canReconcile && (
            <Button variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
              <CheckCircle2 className="size-4 mr-1" />
              Reconcile
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Số tiền</p>
            <p className="text-lg font-bold">{fmtVnd(payment.amountVnd)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Trạng thái</p>
            <div className="mt-1"><StatusBadge status={payment.status} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Tạo lúc</p>
            <p className="text-sm font-medium">{fmtDateTime(payment.createdAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Thanh toán lúc</p>
            <p className="text-sm font-medium">{payment.paidAt ? fmtDateTime(payment.paidAt) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* User card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Người dùng</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Email">
              <Link to={`/users/${payment.userId}`} className="text-primary hover:underline">
                {payment.userEmail ?? payment.userId}
              </Link>
            </LabeledValue>
            <LabeledValue label="User ID">
              <span className="font-mono text-xs">{payment.userId}</span>
            </LabeledValue>
          </CardContent>
        </Card>

        {/* Plan card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Gói dịch vụ</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <LabeledValue label="Mã gói">{payment.planCode ?? "—"}</LabeledValue>
            <LabeledValue label="Tên gói">{payment.planName ?? "—"}</LabeledValue>
            {payment.planPriceVnd !== null && (
              <LabeledValue label="Giá gói">{fmtVnd(payment.planPriceVnd!)}</LabeledValue>
            )}
            {payment.grantType && (
              <LabeledValue label="Loại cấp phép">
                <StatusBadge
                  status={payment.grantType}
                  label={payment.grantType === "admin_grant" ? "Cấp thủ công" : "Thanh toán"}
                  variantMap={{ payment: "blue", admin_grant: "amber" }}
                />
              </LabeledValue>
            )}
            {payment.grantNote && (
              <LabeledValue label="Ghi chú">{payment.grantNote}</LabeledValue>
            )}
          </CardContent>
        </Card>

        {/* Linked subscription */}
        {payment.subscriptionId && (
          <Card>
            <CardHeader><CardTitle className="text-base">Thuê bao liên kết</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <LabeledValue label="ID thuê bao">
                <Link
                  to={`/subscriptions/${payment.subscriptionId}`}
                  className="text-primary hover:underline font-mono text-xs"
                >
                  {payment.subscriptionId}
                </Link>
              </LabeledValue>
              {payment.subscriptionStatus && (
                <LabeledValue label="Trạng thái">
                  <StatusBadge status={payment.subscriptionStatus} />
                </LabeledValue>
              )}
              {payment.subscriptionPeriodEnd && (
                <LabeledValue label="Hết hạn">
                  {fmtDate(payment.subscriptionPeriodEnd)}
                </LabeledValue>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* IPN Logs */}
      {payment.ipnLogs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">IPN Logs ({payment.ipnLogs.length})</h2>
          <div className="space-y-2">
            {payment.ipnLogs.map((log) => (
              <IPNLogRow key={log.id} log={log} />
            ))}
          </div>
        </div>
      )}

      {/* Refund dialog */}
      <ReasonDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        title="Hoàn tiền"
        description={`Hoàn tiền đơn hàng ${payment.invoiceNumber}?`}
        confirmLabel={refundLoading ? "Đang xử lý..." : "Xác nhận hoàn tiền"}
        destructive
        onConfirm={handleRefund}
      />

      {/* Reconcile dialog */}
      <ConfirmDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        title="Reconcile đơn hàng"
        description={`Reconcile đơn hàng ${payment.invoiceNumber}?`}
        confirmLabel={reconcileLoading ? "Đang xử lý..." : "Reconcile"}
        onConfirm={handleReconcile}
      />
    </div>
  )
}
