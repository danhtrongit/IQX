/**
 * /admin/subscriptions/:subId — chi tiết thuê bao + gia hạn/huỷ (port từ
 * `admin/src/features/premium/SubscriptionDetailPage.vue`).
 *
 * - `POST /admin/subscriptions/{id}/extend`: `days > 0` bắt buộc, `reason` tuỳ
 *   chọn. Backend cộng ngày vào `current_period_end`, và nếu thuê bao đã hết hạn
 *   mà mốc mới còn hiệu lực thì tự chuyển về `active` — nên nút Gia hạn cũng
 *   hiện cho thuê bao đã hết hạn.
 * - `POST /admin/subscriptions/{id}/cancel`: `reason` bắt buộc; backend từ chối
 *   huỷ lần hai (`Subscription đã ở trạng thái CANCELLED`) nên nút chỉ hiện khi
 *   thuê bao đang `active`.
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { formatDay, subscriptionStatusLabel, subscriptionTone } from "./display"
import { useCancelSubscription, useExtendSubscription, useSubscription } from "./queries"
import { ActionDialog, DetailList, DetailRow, FormField, StatusBadge } from "./ui"

export function SubscriptionDetailPage() {
  const { subId = "" } = useParams()
  const navigate = useNavigate()
  const subscriptionQuery = useSubscription(subId)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)

  const subscription = subscriptionQuery.data
  const canExtend = subscription?.status === "active" || subscription?.status === "expired"
  const canCancel = subscription?.status === "active"

  return (
    <WorkspacePage
      title={subscription?.plan_name ?? "Chi tiết thuê bao"}
      description={`Thuê bao ${subId}`}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void navigate("/admin/subscriptions")}>
            <ArrowLeft data-icon="inline-start" />
            Danh sách
          </Button>
          {canExtend && (
            <Button type="button" variant="outline" size="sm" onClick={() => setExtendOpen(true)}>
              Gia hạn
            </Button>
          )}
          {canCancel && (
            <Button type="button" variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
              Hủy thuê bao
            </Button>
          )}
        </>
      }
    >
      {subscriptionQuery.isError ? (
        <PanelState
          title="Không tải được thuê bao"
          description={errorMessage(subscriptionQuery.error)}
          action={{ label: "Thử lại", onClick: () => void subscriptionQuery.refetch() }}
        />
      ) : subscriptionQuery.isLoading || !subscription ? (
        <PanelState title="Đang tải thuê bao…" loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Thông tin thuê bao</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList>
                <DetailRow label="Người dùng">
                  <Link to={`/admin/users/${subscription.user_id}`} className="text-primary hover:underline">
                    {subscription.user_email ?? subscription.user_id}
                  </Link>
                </DetailRow>
                <DetailRow label="Gói">
                  {subscription.plan_name ?? subscription.plan_code ?? "—"}
                  {subscription.plan_name && subscription.plan_code && (
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                      {subscription.plan_code}
                    </span>
                  )}
                </DetailRow>
                <DetailRow label="Trạng thái">
                  <StatusBadge
                    label={subscriptionStatusLabel(subscription.status)}
                    tone={subscriptionTone(subscription.status)}
                  />
                </DetailRow>
                <DetailRow label="Bắt đầu kỳ">
                  <span className="tabular-nums">{formatDateTime(subscription.current_period_start)}</span>
                </DetailRow>
                <DetailRow label="Kết thúc kỳ">
                  <span className="tabular-nums">{formatDateTime(subscription.current_period_end)}</span>
                </DetailRow>
                <DetailRow label="Ngày tạo">
                  <span className="tabular-nums">{formatDateTime(subscription.created_at)}</span>
                </DetailRow>
                <DetailRow label="Cập nhật lần cuối">
                  <span className="tabular-nums">{formatDateTime(subscription.updated_at)}</span>
                </DetailRow>
                <DetailRow label="Mã thuê bao">
                  <span className="font-mono text-[11px]">{subscription.id}</span>
                </DetailRow>
              </DetailList>
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Huỷ thuê bao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subscription.status === "cancelled" ? (
                <DetailList className="sm:grid-cols-1">
                  <DetailRow label="Huỷ lúc">
                    <span className="tabular-nums">{formatDateTime(subscription.cancelled_at)}</span>
                  </DetailRow>
                  <DetailRow label="Người huỷ">
                    {subscription.cancelled_by_user_id ? (
                      <Link
                        to={`/admin/users/${subscription.cancelled_by_user_id}`}
                        className="font-mono text-[11px] text-primary hover:underline"
                      >
                        {subscription.cancelled_by_user_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </DetailRow>
                  <DetailRow label="Lý do">
                    <span className="whitespace-pre-wrap">{subscription.cancel_reason ?? "—"}</span>
                  </DetailRow>
                </DetailList>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Thuê bao chưa bị huỷ. Huỷ sẽ dừng quyền Premium ngay và hạ vai trò người dùng về{" "}
                  <span className="font-medium">user</span> nếu kỳ hạn còn hiệu lực.
                </p>
              )}
              {subscription.status === "expired" && (
                <Alert>
                  <AlertTitle>Thuê bao đã hết hạn</AlertTitle>
                  <AlertDescription>
                    Gia hạn thêm ngày để kích hoạt lại (backend tự chuyển trạng thái về “Đang hoạt động”).
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        subscriptionId={subId}
        label={subscription?.user_email ?? subscription?.user_id ?? subId}
      />

      <ExtendSubscriptionDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        subscriptionId={subId}
        currentEnd={subscription?.current_period_end ?? null}
      />
    </WorkspacePage>
  )
}

function CancelSubscriptionDialog({
  open,
  onOpenChange,
  subscriptionId,
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  label: string
}) {
  const cancelSubscription = useCancelSubscription()
  const [reason, setReason] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const trimmed = reason.trim()

  async function submit() {
    if (!trimmed) return
    setServerError(null)
    try {
      await cancelSubscription.mutateAsync({ id: subscriptionId, reason: trimmed })
      toast.success("Đã huỷ thuê bao")
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
          setServerError(null)
          setReason("")
        }
        onOpenChange(next)
      }}
      title="Huỷ thuê bao"
      description={`Thuê bao của ${label} sẽ chuyển sang trạng thái “Đã hủy”.`}
      confirmLabel="Huỷ thuê bao"
      confirmVariant="destructive"
      pending={cancelSubscription.isPending}
      confirmDisabled={!trimmed}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <Alert variant="destructive">
        <AlertDescription>
          Quyền Premium dừng ngay lập tức và vai trò người dùng bị hạ về <span className="font-medium">user</span>{" "}
          nếu kỳ hạn còn hiệu lực. Hành động này được ghi vào nhật ký kiểm toán kèm lý do bên dưới.
        </AlertDescription>
      </Alert>
      <FormField label="Lý do huỷ (bắt buộc)">
        <Textarea
          rows={3}
          value={reason}
          disabled={cancelSubscription.isPending}
          placeholder="VD: Khách yêu cầu hoàn tiền, gian lận thanh toán..."
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
    </ActionDialog>
  )
}

function ExtendSubscriptionDialog({
  open,
  onOpenChange,
  subscriptionId,
  currentEnd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  currentEnd: string | null
}) {
  const extendSubscription = useExtendSubscription()
  const [days, setDays] = useState("30")
  const [reason, setReason] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const parsedDays = Number(days)
  const daysValid = Number.isInteger(parsedDays) && parsedDays > 0

  async function submit() {
    if (!daysValid) return
    setServerError(null)
    try {
      const updated = await extendSubscription.mutateAsync({
        id: subscriptionId,
        days: parsedDays,
        reason: reason.trim() || undefined,
      })
      toast.success(`Đã gia hạn ${parsedDays} ngày, kỳ mới kết thúc ${formatDay(updated.current_period_end)}`)
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
          setServerError(null)
          setReason("")
        }
        onOpenChange(next)
      }}
      title="Gia hạn thuê bao"
      description={
        currentEnd
          ? `Cộng thêm ngày vào kỳ hạn hiện tại (đang kết thúc ${formatDay(currentEnd)}).`
          : "Cộng thêm ngày vào kỳ hạn hiện tại."
      }
      confirmLabel="Gia hạn"
      pending={extendSubscription.isPending}
      confirmDisabled={!daysValid}
      error={serverError}
      onConfirm={() => void submit()}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Số ngày"
          error={daysValid ? null : "Số ngày phải là số nguyên lớn hơn 0"}
          hint="Bắt buộc, lớn hơn 0"
        >
          <Input
            type="number"
            min={1}
            value={days}
            disabled={extendSubscription.isPending}
            onChange={(event) => setDays(event.target.value)}
          />
        </FormField>
        <FormField label="Lý do (không bắt buộc)">
          <Input
            value={reason}
            disabled={extendSubscription.isPending}
            placeholder="VD: Đền bù sự cố"
            onChange={(event) => setReason(event.target.value)}
          />
        </FormField>
      </div>
    </ActionDialog>
  )
}
