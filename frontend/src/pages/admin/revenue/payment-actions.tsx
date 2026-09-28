/**
 * Ba thao tác ghi trên đơn thanh toán, dùng chung cho danh sách
 * (`/admin/payments`) và chi tiết (`/admin/payments/:paymentId`):
 *
 * - `MarkPaidDialog`   → `POST /admin/payments/{id}/mark-paid` (chỉ đơn PENDING,
 *   `note` bắt buộc: bằng chứng admin đã tự đối chiếu tiền về).
 * - `ReconcileDialog`  → `POST /admin/payments/{id}/reconcile` (chỉ đơn PENDING
 *   đã tạo > 30 phút; `no_match` KHÔNG phải lỗi — chỉ là chưa có webhook nào).
 * - `GrantPremiumDialog` → `POST /premium/admin/users/{userId}/grant`: cấp
 *   Premium không có thanh toán, tạo một đơn mới 0đ và giữ nguyên đơn hiện tại.
 *
 * Không thao tác nào ở đây tự xác nhận chuyển tiền thay ngân hàng.
 */
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { formatAmount } from "./display"
import { useGrantPremium, useMarkPaymentPaid, useReconcilePayment } from "./queries"
import { ActionDialog, FormField } from "./ui"

/** Phần tối thiểu mà cả `PaymentBrief` và `PaymentDetail` đều có. */
export type PaymentActionTarget = {
  id: string
  invoice_number: string
  amount_vnd: number
  currency: string
  user_id: string
  user_email: string | null
  plan_id: string
  plan_name: string | null
  plan_code: string | null
}

function targetLabel(target: PaymentActionTarget) {
  return target.user_email ?? target.user_id
}

export function MarkPaidDialog({
  target,
  onClose,
}: {
  target: PaymentActionTarget | null
  onClose: () => void
}) {
  const markPaid = useMarkPaymentPaid()
  const [note, setNote] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const trimmed = note.trim()

  async function submit() {
    if (!target || !trimmed) return
    setServerError(null)
    try {
      await markPaid.mutateAsync({ id: target.id, note: trimmed })
      toast.success(`Đã xác nhận thanh toán cho ${target.invoice_number}. Premium đã được kích hoạt.`)
      setNote("")
      onClose()
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNote("")
          setServerError(null)
          onClose()
        }
      }}
      title="Xác nhận đã thanh toán"
      description={target ? `Đơn ${target.invoice_number}` : undefined}
      confirmLabel="Xác nhận đã nhận tiền"
      pending={markPaid.isPending}
      confirmDisabled={!trimmed}
      error={serverError}
      onConfirm={() => void submit()}
    >
      {target && (
        <Alert>
          <AlertTitle>Chỉ dùng khi bạn đã tự kiểm tra tiền về</AlertTitle>
          <AlertDescription>
            Đơn <span className="font-medium">{target.invoice_number}</span> (
            {formatAmount(target.amount_vnd, target.currency)} — {targetLabel(target)}) sẽ được đánh dấu đã thanh toán
            và Premium kích hoạt/gia hạn ngay. Đơn được ghi nhận là{" "}
            <span className="font-medium">Admin xác nhận</span>, không phải do SePay báo về, và ghi lại tên bạn trong
            nhật ký kiểm toán.
          </AlertDescription>
        </Alert>
      )}
      <FormField label="Bằng chứng đã đối chiếu (bắt buộc)">
        <Textarea
          rows={3}
          value={note}
          disabled={markPaid.isPending}
          placeholder="VD: CK VCB 09/08 20:14, ref FT25081234567 — đã khớp sao kê"
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
    </ActionDialog>
  )
}

export function ReconcileDialog({
  target,
  onClose,
}: {
  target: PaymentActionTarget | null
  onClose: () => void
}) {
  const reconcile = useReconcilePayment()
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit() {
    if (!target) return
    setServerError(null)
    try {
      const result = await reconcile.mutateAsync({ id: target.id })
      onClose()
      if (result.status === "reconciled") {
        toast.success(
          `Đã đối chiếu ${target.invoice_number}: tìm thấy IPN hợp lệ, đơn chuyển sang đã thanh toán.`,
        )
      } else {
        // Không phải lỗi nút bấm — chỉ đơn giản là không tồn tại bằng chứng webhook.
        toast.warning("Không có IPN nào khớp", {
          description: `SePay chưa từng gửi webhook hợp lệ cho ${target.invoice_number}, nên không có bằng chứng để đối chiếu. Đơn giữ nguyên trạng thái. Nếu bạn đã tự kiểm tra và thấy tiền về, hãy dùng “Xác nhận đã thanh toán”.`,
          duration: 12000,
        })
      }
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setServerError(null)
          onClose()
        }
      }}
      title="Đối chiếu IPN từ SePay?"
      description={
        target
          ? `Hệ thống sẽ tìm bản ghi IPN hợp lệ mà SePay đã gửi cho đơn ${target.invoice_number}.`
          : undefined
      }
      confirmLabel="Đối chiếu"
      pending={reconcile.isPending}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <p className="text-sm text-muted-foreground">
        Chỉ áp dụng cho đơn <span className="font-medium">đang chờ</span> đã tạo quá 30 phút. Nếu SePay chưa từng gọi
        webhook thì không có gì để đối chiếu và đơn giữ nguyên trạng thái.
      </p>
    </ActionDialog>
  )
}

export function GrantPremiumDialog({
  target,
  onClose,
}: {
  target: PaymentActionTarget | null
  onClose: () => void
}) {
  const grantPremium = useGrantPremium()
  const [note, setNote] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const trimmed = note.trim()

  async function submit() {
    if (!target || !trimmed) return
    if (!target.plan_id) {
      setServerError("Đơn hàng này không gắn với gói nào nên không thể cấp Premium.")
      return
    }
    setServerError(null)
    try {
      const granted = await grantPremium.mutateAsync({
        userId: target.user_id,
        planId: target.plan_id,
        note: trimmed,
      })
      toast.success(`Đã cấp Premium thủ công. Đơn mới: ${granted.invoice_number}`)
      setNote("")
      onClose()
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <ActionDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNote("")
          setServerError(null)
          onClose()
        }
      }}
      title="Cấp Premium thủ công"
      description={target ? `Người dùng ${targetLabel(target)}` : undefined}
      confirmLabel="Cấp Premium (không có thanh toán)"
      confirmVariant="destructive"
      pending={grantPremium.isPending}
      confirmDisabled={!trimmed}
      error={serverError}
      onConfirm={() => void submit()}
    >
      {target && (
        <Alert variant="destructive">
          <AlertTitle>Cấp Premium mà KHÔNG có bằng chứng thanh toán</AlertTitle>
          <AlertDescription>
            Thao tác này tạo một <span className="font-medium">đơn mới 0đ</span> cho {targetLabel(target)} — gói{" "}
            {target.plan_name ?? target.plan_code ?? "?"}, và kích hoạt Premium ngay. Đơn{" "}
            <span className="font-medium">{target.invoice_number}</span> vẫn giữ nguyên trạng thái hiện tại. Nếu khách
            đã thực sự chuyển tiền cho đơn này, hãy dùng “Xác nhận đã thanh toán” thay vì thao tác này.
          </AlertDescription>
        </Alert>
      )}
      <FormField label="Lý do cấp (bắt buộc)">
        <Textarea
          rows={3}
          value={note}
          disabled={grantPremium.isPending}
          placeholder="VD: Đền bù sự cố, KH đối tác, quà tặng sự kiện..."
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
    </ActionDialog>
  )
}
