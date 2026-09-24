/**
 * /admin/payments/:paymentId — chi tiết đơn + bằng chứng IPN (port từ
 * `admin/src/features/premium/PaymentDetailPage.vue`).
 *
 * - Hoàn tiền: `POST /admin/payments/{id}/refund` (chỉ đơn PAID, `reason` bắt
 *   buộc). Backend huỷ luôn thuê bao còn hạn của người dùng và hạ vai trò về
 *   `user` — hộp thoại nói rõ hệ quả đó trước khi bấm.
 * - Xác nhận đã thanh toán / đối chiếu IPN: dùng chung với trang danh sách
 *   (`payment-actions.tsx`).
 * - `ipn_logs` trong chi tiết đơn là bản rút gọn (không có raw body). Payload
 *   thô nằm ở trang Nhật ký IPN.
 */
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import {
  formatAmount,
  grantTypeLabel,
  ipnResultLabel,
  ipnTone,
  paymentStatusLabel,
  paymentTone,
  subscriptionStatusLabel,
  subscriptionTone,
} from "./display"
import { MarkPaidDialog, ReconcileDialog } from "./payment-actions"
import { usePayment, useRefundPayment } from "./queries"
import { ActionDialog, DetailList, DetailRow, FormField, StatusBadge, TableNoticeRow } from "./ui"

export function PaymentDetailPage() {
  const { paymentId = "" } = useParams()
  const navigate = useNavigate()
  const paymentQuery = usePayment(paymentId)
  const [refundOpen, setRefundOpen] = useState(false)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)

  const payment = paymentQuery.data

  return (
    <WorkspacePage
      title={payment?.invoice_number ?? "Chi tiết thanh toán"}
      description={`Đơn hàng ${paymentId}`}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void navigate("/admin/payments")}>
            <ArrowLeft data-icon="inline-start" />
            Danh sách
          </Button>
          {payment?.status === "pending" && (
            <>
              <Button type="button" size="sm" onClick={() => setMarkPaidOpen(true)}>
                Xác nhận đã thanh toán
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
                Đối chiếu IPN
              </Button>
            </>
          )}
          {(payment?.status === "paid" || payment?.status === "partially_refunded") && (
            <Button type="button" variant="destructive" size="sm" onClick={() => setRefundOpen(true)}>
              Hoàn tiền
            </Button>
          )}
        </>
      }
    >
      {paymentQuery.isError ? (
        <PanelState
          title="Không tải được đơn hàng"
          description={errorMessage(paymentQuery.error)}
          action={{ label: "Thử lại", onClick: () => void paymentQuery.refetch() }}
        />
      ) : paymentQuery.isLoading || !payment ? (
        <PanelState title="Đang tải đơn hàng…" loading />
      ) : (
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Thông tin đơn hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList>
                <DetailRow label="Số tiền">
                  <span className="font-medium tabular-nums">
                    {formatAmount(payment.amount_vnd, payment.currency)}
                  </span>
                </DetailRow>
                <DetailRow label="Đã hoàn tiền">
                  <span className="tabular-nums">{formatAmount(payment.refunded_amount_vnd, payment.currency)}</span>
                </DetailRow>
                <DetailRow label="Trạng thái">
                  <StatusBadge label={paymentStatusLabel(payment.status)} tone={paymentTone(payment.status)} />
                </DetailRow>
                <DetailRow label="Nguồn xác nhận">{grantTypeLabel(payment.grant_type)}</DetailRow>
                <DetailRow label="Người dùng">
                  <Link to={`/admin/users/${payment.user_id}`} className="text-primary hover:underline">
                    {payment.user_email ?? payment.user_id}
                  </Link>
                </DetailRow>
                <DetailRow label="Gói">
                  {payment.plan_name ?? payment.plan_code ?? "—"}
                  {payment.plan_price_vnd !== null && (
                    <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
                      (giá niêm yết {formatAmount(payment.plan_price_vnd, payment.currency)})
                    </span>
                  )}
                </DetailRow>
                <DetailRow label="Tạo lúc">
                  <span className="tabular-nums">{formatDateTime(payment.created_at)}</span>
                </DetailRow>
                <DetailRow label="Thanh toán lúc">
                  <span className="tabular-nums">{formatDateTime(payment.paid_at)}</span>
                </DetailRow>
                <DetailRow label="Cập nhật lần cuối">
                  <span className="tabular-nums">{formatDateTime(payment.updated_at)}</span>
                </DetailRow>
                <DetailRow label="Thuê bao">
                  {payment.subscription_id ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/admin/subscriptions/${payment.subscription_id}`}
                        className="font-mono text-[11px] text-primary hover:underline"
                      >
                        {payment.subscription_id}
                      </Link>
                      {payment.subscription_status && (
                        <StatusBadge
                          label={subscriptionStatusLabel(payment.subscription_status)}
                          tone={subscriptionTone(payment.subscription_status)}
                        />
                      )}
                      {payment.subscription_period_end && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          đến {formatDateTime(payment.subscription_period_end)}
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label="Ghi chú cấp">
                  <span className="whitespace-pre-wrap">{payment.grant_note ?? "—"}</span>
                </DetailRow>
              </DetailList>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b border-border px-3 py-2">
              <CardTitle className="text-base">Nhật ký IPN khớp đơn</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-3">Thời điểm nhận</TableHead>
                  <TableHead>Secret key</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead>SePay TX</TableHead>
                  <TableHead className="pr-3">Lỗi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment.ipn_logs.length === 0 ? (
                  <TableNoticeRow colSpan={5}>
                    Chưa có IPN nào khớp đơn này. Payload thô của mọi webhook nằm ở{" "}
                    <Link to="/admin/ipn" className="text-primary hover:underline">
                      Nhật ký IPN
                    </Link>
                    .
                  </TableNoticeRow>
                ) : (
                  payment.ipn_logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="pl-3 text-muted-foreground tabular-nums">
                        {formatDateTime(log.received_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={log.secret_key_valid ? "Key hợp lệ" : "Key sai"}
                          tone={log.secret_key_valid ? "success" : "danger"}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={ipnResultLabel(log.result_status)} tone={ipnTone(log.result_status)} />
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {log.sepay_transaction_id ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">
                        {log.error_message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        paymentId={paymentId}
        invoiceNumber={payment?.invoice_number ?? paymentId}
        hasActiveSubscription={payment?.subscription_status === "active"}
      />
      <MarkPaidDialog target={markPaidOpen && payment ? payment : null} onClose={() => setMarkPaidOpen(false)} />
      <ReconcileDialog target={reconcileOpen && payment ? payment : null} onClose={() => setReconcileOpen(false)} />
    </WorkspacePage>
  )
}

function RefundDialog({
  open,
  onOpenChange,
  paymentId,
  invoiceNumber,
  hasActiveSubscription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentId: string
  invoiceNumber: string
  hasActiveSubscription: boolean
}) {
  const refundPayment = useRefundPayment()
  const [reason, setReason] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const trimmed = reason.trim()

  async function submit() {
    if (!trimmed) return
    setServerError(null)
    try {
      await refundPayment.mutateAsync({ id: paymentId, reason: trimmed })
      toast.success(`Đã hoàn tiền đơn ${invoiceNumber}`)
      setReason("")
      onOpenChange(false)
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("")
          setServerError(null)
        }
        onOpenChange(next)
      }}
      title="Hoàn tiền đơn hàng?"
      description={`Đơn ${invoiceNumber} sẽ chuyển sang trạng thái “Đã hoàn tiền”.`}
      confirmLabel="Hoàn tiền"
      confirmVariant="destructive"
      pending={refundPayment.isPending}
      confirmDisabled={!trimmed}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <Alert variant="destructive">
        <AlertTitle>Hệ quả ngoài đơn hàng</AlertTitle>
        <AlertDescription>
          {hasActiveSubscription
            ? "Thuê bao đang hoạt động của người dùng sẽ bị huỷ và vai trò hạ về user nếu kỳ hạn còn hiệu lực. "
            : "Nếu thuê bao của người dùng còn hạn, backend sẽ huỷ thuê bao đó và hạ vai trò về user. "}
          Hành động này được ghi vào nhật ký kiểm toán kèm lý do bên dưới. Việc chuyển tiền thật cho khách phải thực hiện
          ngoài hệ thống.
        </AlertDescription>
      </Alert>
      <FormField label="Lý do hoàn tiền (bắt buộc)">
        <Textarea
          rows={3}
          value={reason}
          disabled={refundPayment.isPending}
          placeholder="VD: Khách yêu cầu huỷ trong 7 ngày đầu"
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </ActionDialog>
  )
}
