/**
 * Kết quả thanh toán Premium — `/{payment/success|error|cancel}` và các alias
 * tiếng Việt `/{thanh-toan/thanh-cong|that-bai|huy}`.
 *
 * HỢP ĐỒNG URL (do backend chốt trong `PremiumService.createCheckout`):
 * `success_url = ${APP_PUBLIC_URL}/payment/success`, `error_url = .../payment/error`,
 * `cancel_url = .../payment/cancel`. SePay chuyển hướng trình duyệt về đúng các
 * URL đó, kèm tham số đơn hàng (`order_invoice_number`, `order_status`, …).
 *
 * `type` của route CHỈ là gợi ý của cổng thanh toán — trang này không tin nó.
 * Mọi kết luận đều đọc từ `GET /premium/my-orders` (chỉ SePay IPN mới đổi
 * `pending → paid`) và `GET /premium/me`. Vì vậy một URL "success" vẫn có thể
 * hiện "chờ xác nhận", còn URL "error/cancel" vẫn hiện đúng nếu đơn đã trả tiền.
 */
import { Link, useSearchParams } from "react-router"
import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/use-auth"
import { formatDateTime, formatMoney } from "@/lib/format"
import type { PremiumOrder } from "./api"
import { daysUntil, formatDateOnly } from "./format"
import { usePaymentCheck, usePremiumRefreshOnPaid, usePremiumSubscription } from "./hooks"

export type PaymentResultType = "success" | "error" | "cancel"

/** Các khoá SePay có thể gắn vào URL trả về; thứ tự ưu tiên từ trái sang phải. */
const REFERENCE_KEYS = [
  "order_invoice_number",
  "invoice_number",
  "invoiceNumber",
  "order_id",
  "orderId",
] as const

const TYPE_COPY: Record<PaymentResultType, string> = {
  success: "Cổng thanh toán báo giao dịch thành công — đang đối chiếu với hệ thống IQX.",
  error: "Cổng thanh toán báo giao dịch lỗi — đang đối chiếu với hệ thống IQX.",
  cancel: "Cổng thanh toán báo giao dịch đã huỷ — đang đối chiếu với hệ thống IQX.",
}

function orderStatusCopy(order: PremiumOrder): { title: string; description: string } {
  switch (order.status) {
    case "cancelled":
      return {
        title: "Giao dịch đã bị huỷ",
        description:
          "Hệ thống ghi nhận đơn ở trạng thái đã huỷ nên không có khoản phí nào được tính. Bạn có thể chọn lại gói bất cứ lúc nào.",
      }
    case "failed":
      return {
        title: "Giao dịch không thành công",
        description:
          "Đơn hàng đã đóng ở trạng thái thất bại và chưa có khoản phí nào được ghi nhận. Bạn có thể thử lại.",
      }
    case "refunded":
      return {
        title: "Đơn đã được hoàn tiền",
        description: "Đơn hàng này đã được hoàn tiền trên hệ thống IQX.",
      }
    default:
      return {
        title: "Đơn hàng không còn hiệu lực",
        description: "Đơn hàng đã đóng và không thể kích hoạt gói Premium.",
      }
  }
}

export function PaymentResultPage({ type }: { type: PaymentResultType }) {
  return (
    <WorkspacePage
      title="Kết quả thanh toán"
      description={TYPE_COPY[type]}
      actions={
        <Button variant="outline" asChild>
          <Link to="/nang-cap">Về trang nâng cấp</Link>
        </Button>
      }
    >
      <PaymentResultBody type={type} />
    </WorkspacePage>
  )
}

function PaymentResultBody({ type }: { type: PaymentResultType }) {
  const auth = useAuth()
  const [params] = useSearchParams()
  const reference =
    REFERENCE_KEYS.map((key) => params.get(key)).find((value) => value && value.trim() !== "") ??
    null
  const reportedStatus = params.get("order_status") ?? params.get("status")
  const check = usePaymentCheck(reference, { pollMs: 5_000 })
  const subscription = usePremiumSubscription()
  usePremiumRefreshOnPaid(check.check.kind === "paid")

  if (auth.sessionError) {
    return (
      <PanelState
        title="Không xác minh được phiên đăng nhập"
        description={auth.sessionError.message}
        action={{ label: "Tải lại trang", onClick: () => window.location.reload() }}
      />
    )
  }
  if (auth.isLoading) return <PanelState title="Đang kiểm tra phiên đăng nhập" loading />
  if (!auth.isAuthenticated) {
    return (
      <PanelState
        title="Cần đăng nhập để đối chiếu thanh toán"
        description="Đơn hàng gắn với tài khoản IQX của bạn. Đăng nhập rồi trang này sẽ tự đối chiếu lại."
        action={{ label: "Đăng nhập", onClick: () => auth.openAuth("login") }}
      />
    )
  }

  const referenceLine = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        Đối chiếu theo:{" "}
        <span className="font-medium text-foreground">
          {reference ? `mã đơn ${reference}` : "đơn gần nhất của tài khoản"}
        </span>
      </span>
      {reportedStatus && <span>Cổng thanh toán báo: {reportedStatus}</span>}
      <span className="flex items-center gap-1">
        <BadgeCheck className="size-3.5" />
        Nguồn: /premium/my-orders
      </span>
    </div>
  )

  if (check.check.kind === "waiting") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            Đang đối chiếu với hệ thống IQX
          </CardTitle>
          <CardDescription>Quá trình này chỉ mất vài giây.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (check.check.kind === "error") {
    return (
      <div className="space-y-4">
        <PanelState
          title="Không đối chiếu được thanh toán"
          description={check.check.message}
          action={{ label: "Thử lại", onClick: () => void check.refresh() }}
        />
        {referenceLine}
      </div>
    )
  }

  if (check.check.kind === "not-found" || check.check.kind === "empty") {
    return (
      <div className="space-y-4">
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {check.check.kind === "not-found"
              ? "Không tìm thấy đơn hàng tương ứng"
              : "Tài khoản chưa có đơn thanh toán nào"}
          </AlertTitle>
          <AlertDescription>
            {check.check.kind === "not-found"
              ? `Mã đơn trên URL không nằm trong lịch sử thanh toán của tài khoản này. Nếu bạn vừa chuyển khoản, hãy thử lại sau ít giây.`
              : "Nếu bạn vừa hoàn tất chuyển khoản, SePay có thể chưa gửi xác nhận về hệ thống. Hãy thử lại sau ít giây."}
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={check.isRefreshing}
              onClick={() => void check.refresh()}
            >
              {check.isRefreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Kiểm tra lại
            </Button>
          </div>
        </Alert>
        {referenceLine}
      </div>
    )
  }

  const order = check.check.order

  if (check.check.kind === "paid") {
    const periodEnd = subscription.data?.periodEnd ?? null
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleCheck className="size-4 text-primary" />
              Đã xác minh thanh toán
            </CardTitle>
            <CardDescription>
              Hệ thống IQX đã ghi nhận thanh toán cho đơn {order.invoiceNumber}. Quyền truy cập hiện tại được đối chiếu riêng với thuê bao.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Gói</span>
              <span className="font-medium">{order.planName ?? "Premium"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Số tiền</span>
              <span className="font-medium">{formatMoney(order.amount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Thời điểm thanh toán</span>
              <span className="font-medium">{formatDateTime(order.paidAt)}</span>
            </div>
            {periodEnd && (
              <>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Thời hạn Premium hiện tại</span>
                  <span className="flex items-center gap-2 font-medium">
                    {formatDateOnly(periodEnd)}
                    <Badge variant="secondary">{subscription.data?.isPremium ? `còn ${daysUntil(periodEnd)} ngày` : "Không còn hiệu lực"}</Badge>
                  </span>
                </div>
              </>
            )}
            {type !== "success" && (
              <p className="text-xs leading-5 text-muted-foreground">
                URL của cổng thanh toán báo “{type}”, nhưng đối chiếu với hệ thống cho thấy đơn đã
                thanh toán — thông tin phía trên là kết quả thật.
              </p>
            )}
          </CardContent>
        </Card>
        {referenceLine}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/cai-dat">Xem tài khoản Premium</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Về trang chủ</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (check.check.kind === "pending") {
    return (
      <div className="space-y-4">
        <Alert>
          <Clock />
          <AlertTitle>SePay chưa xác nhận đơn {order.invoiceNumber}</AlertTitle>
          <AlertDescription>
            Đơn đang ở trạng thái chờ. Gói Premium chỉ được kích hoạt sau khi SePay gửi xác nhận
            (IPN) về hệ thống — trang này tự động kiểm tra lại, hoặc bạn có thể bấm “Kiểm tra lại”.
          </AlertDescription>
          <div className="col-start-2 mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={check.isRefreshing}
              onClick={() => void check.refresh()}
            >
              {check.isRefreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Kiểm tra lại
            </Button>
          </div>
        </Alert>
        {referenceLine}
      </div>
    )
  }

  const copy = orderStatusCopy(order)
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <CircleX />
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          {copy.description} Trạng thái hệ thống: {order.status} · Đơn {order.invoiceNumber} ·{" "}
          {formatMoney(order.amount)}
        </AlertDescription>
        <div className="col-start-2 mt-3 flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link to="/nang-cap">Thử lại</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/">Về trang chủ</Link>
          </Button>
        </div>
      </Alert>
      {referenceLine}
    </div>
  )
}
