/**
 * `/nang-cap` — Nâng cấp / gia hạn Premium.
 *
 * Luồng thật (không có bước nào tự báo "đã nâng cấp"):
 * 1. `GET /premium/plans` — gói đang bán; giá và thời hạn là dữ liệu server.
 * 2. `POST /premium/checkout` — tạo đơn `pending` + form SePay đã ký.
 * 3. Người dùng mở trang thanh toán SePay ở TAB MỚI (tab này giữ nguyên trạng
 *    thái) để quét mã QR / chuyển khoản.
 * 4. `GET /premium/my-orders` là nguồn duy nhất xác nhận đã thanh toán — chỉ
 *    SePay IPN mới đổi `pending → paid` và cộng hạn. Trang này chỉ hiển thị
 *    đúng những gì server trả về, có nút "Kiểm tra trạng thái" và tự dò lại
 *    trong lúc hộp thoại thanh toán còn mở.
 *
 * Người dùng đang có gói vẫn mua tiếp được: backend cộng dồn `duration_days`
 * lên trên `current_period_end` (`PremiumService.extendSubscription`).
 */
import { useState } from "react"
import { Link } from "react-router"
import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  Copy,
  ExternalLink,
  ListChecks,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { openSepayCheckout, type CheckoutSession, type PremiumOrder, type PremiumPlan } from "./api"
import {
  useCreateCheckout,
  usePaymentCheck,
  usePremiumOrders,
  usePremiumPlans,
  usePremiumRefreshOnPaid,
  usePremiumSubscription,
} from "./hooks"
import { PremiumStatusPanel } from "./premium-status-panel"

/** Quyền lợi Premium — mỗi dòng ứng với một nhóm endpoint có `PremiumGuard`. */
const PREMIUM_FEATURES = [
  "Phân tích danh mục và kịch bản hành động bằng AI",
  "Cảnh báo tín hiệu mua/bán cho mã bạn theo dõi",
  "Nhận diện mẫu nến và hình thái bằng AI",
  "Backtest chiến lược trên dữ liệu thị trường",
  "Giao dịch ảo theo luật thật: T+2, phí và thuế",
]

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xác nhận",
  paid: "Đã thanh toán",
  failed: "Thất bại",
  cancelled: "Đã huỷ",
  partially_refunded: "Đã hoàn tiền một phần",
  refunded: "Đã hoàn tiền",
}

const ORDER_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  paid: "default",
  failed: "destructive",
  cancelled: "outline",
  partially_refunded: "outline",
  refunded: "outline",
}

/* ── Thẻ gói ────────────────────────────────────────────────────────────── */

function planMonths(plan: PremiumPlan) {
  return Math.max(1, Math.round(plan.durationDays / 30))
}

function planDurationLabel(plan: PremiumPlan) {
  const months = plan.durationDays / 30
  return Number.isInteger(months) && months > 1
    ? `${months} tháng`
    : plan.durationDays >= 30
      ? `${planMonths(plan)} tháng (~${plan.durationDays} ngày)`
      : `${plan.durationDays} ngày`
}

function PlanCard({
  plan,
  reference,
  cheapestId,
  isPremium,
  pending,
  onSelect,
}: {
  plan: PremiumPlan
  /** Gói ngắn nhất đang bán — mốc "mua lẻ" để tính tiết kiệm mỗi tháng. */
  reference: PremiumPlan | null
  cheapestId: string | null
  isPremium: boolean
  pending: boolean
  onSelect: (plan: PremiumPlan) => void
}) {
  const months = planMonths(plan)
  const perMonth = plan.priceVnd / months
  const referencePerMonth = reference ? reference.priceVnd / planMonths(reference) : 0
  const savingPercent =
    reference && reference.id !== plan.id && referencePerMonth > 0 && perMonth < referencePerMonth
      ? Math.round((1 - perMonth / referencePerMonth) * 100)
      : 0
  const cheapest = cheapestId === plan.id

  return (
    <Card className={cn("h-full", cheapest && "ring-1 ring-primary/40")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-heading">
          <Sparkles className="size-4 text-chart-2" />
          {plan.name}
          {cheapest && <Badge variant="gold">Giá mỗi tháng thấp nhất</Badge>}
        </CardTitle>
        <CardDescription>{plan.description ?? `Thời hạn ${planDurationLabel(plan)}`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-heading text-3xl font-semibold tracking-tight">
            {formatMoney(plan.priceVnd)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {planDurationLabel(plan)}
            {months > 1 && ` · ≈ ${formatMoney(Math.round(perMonth))}/tháng`}
          </p>
          {savingPercent > 0 && (
            <Badge variant="secondary" className="mt-2">
              Tiết kiệm {savingPercent}% mỗi tháng so với gói {reference?.name}
            </Badge>
          )}
        </div>
        <Separator />
        <ul className="space-y-2">
          {PREMIUM_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button disabled={pending} onClick={() => onSelect(plan)}>
          {pending && <LoaderCircle className="animate-spin" />}
          {pending ? "Đang tạo đơn…" : isPremium ? "Gia hạn thêm" : "Chọn gói này"}
        </Button>
        {isPremium && (
          <p className="text-center text-xs text-muted-foreground">
            Cộng thêm {planDurationLabel(plan)} vào hạn hiện tại của bạn
          </p>
        )}
      </CardFooter>
    </Card>
  )
}

/* ── Hộp thoại thanh toán ───────────────────────────────────────────────── */

function CheckoutDialog({
  session,
  planName,
  planAmount,
  onClose,
}: {
  session: CheckoutSession | null
  planName: string | null
  /** Giá gói theo server — hiển thị trước khi đọc được đơn từ `my-orders`. */
  planAmount: number | null
  onClose: () => void
}) {
  const check = usePaymentCheck(session?.invoiceNumber ?? null, {
    pollMs: session ? 5_000 : 0,
  })
  usePremiumRefreshOnPaid(check.check.kind === "paid")

  const paid = check.check.kind === "paid"
  const order = "order" in check.check ? check.check.order : null

  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {paid ? <BadgeCheck className="size-4 text-primary" /> : <QrCode className="size-4" />}
            {paid ? "Đã nhận thanh toán" : "Thanh toán gói Premium"}
          </DialogTitle>
          <DialogDescription>
            {paid
              ? "SePay đã xác nhận và hệ thống IQX đã kích hoạt gói của bạn."
              : "Mở trang thanh toán SePay ở tab mới để quét mã QR hoặc chuyển khoản. Tab này giữ nguyên để bạn kiểm tra trạng thái."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Gói</span>
            <span className="font-medium">{planName ?? order?.planName ?? "Premium"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Số tiền</span>
            <span className="font-medium">{formatMoney(order?.amount ?? planAmount)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Mã đơn</span>
            <span className="flex items-center gap-2">
              <code className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{session?.invoiceNumber}</code>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Sao chép mã đơn"
                onClick={() => {
                  const value = session?.invoiceNumber
                  if (!value) return
                  void navigator.clipboard
                    .writeText(value)
                    .then(() => toast.success("Đã sao chép mã đơn"))
                    .catch(() => toast.error("Trình duyệt không cho phép sao chép"))
                }}
              >
                <Copy />
              </Button>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Trạng thái</span>
            {check.check.kind === "waiting" ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" /> Đang đối chiếu…
              </span>
            ) : check.check.kind === "error" ? (
              <span className="text-destructive">{check.check.message}</span>
            ) : order ? (
              <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? "outline"}>
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            ) : (
              <span className="text-muted-foreground">Chưa thấy đơn trên hệ thống</span>
            )}
          </div>

          {!paid && (
            <>
              <Separator />
              <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-5 text-muted-foreground">
                <li>Mở trang thanh toán SePay và quét mã QR (hoặc chuyển khoản đúng số tiền).</li>
                <li>Hoàn tất giao dịch trên ứng dụng ngân hàng của bạn.</li>
                <li>
                  Quay lại tab này và bấm “Kiểm tra trạng thái”. Hệ thống chỉ kích hoạt sau khi SePay
                  gửi xác nhận (IPN) — thường trong vài giây.
                </li>
              </ol>
            </>
          )}
          {paid && order && (
            <p className="text-xs leading-5 text-muted-foreground">
              Đơn {order.invoiceNumber} đã thanh toán lúc {formatDateTime(order.paidAt)}. Thời hạn
              Premium của bạn đã được cập nhật trên hệ thống.
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose}>
            {paid ? "Đóng" : "Để sau"}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={check.isRefreshing}
              onClick={() => void check.refresh()}
            >
              {check.isRefreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Kiểm tra trạng thái
            </Button>
            {paid ? (
              <Button asChild>
                <Link to="/cai-dat">Xem tài khoản</Link>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => session && openSepayCheckout(session)}
                disabled={!session}
              >
                <ExternalLink />
                Mở trang thanh toán SePay
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Lịch sử thanh toán ─────────────────────────────────────────────────── */

function OrderHistory() {
  const orders = usePremiumOrders()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          Lịch sử thanh toán
        </CardTitle>
        <CardDescription>20 đơn gần nhất, mới nhất trước.</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : orders.isError ? (
          <PanelState
            title="Không tải được lịch sử thanh toán"
            description={orders.error.message}
            action={{ label: "Thử lại", onClick: () => void orders.refetch() }}
          />
        ) : orders.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bạn chưa có đơn thanh toán nào.
          </p>
        ) : (
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead>Thanh toán lúc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data.map((order: PremiumOrder) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.invoiceNumber}</TableCell>
                    <TableCell>{order.planName ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div>{formatMoney(order.amount)}</div>
                      {order.refundedAmount > 0 && <div className="text-xs text-muted-foreground">Đã hoàn {formatMoney(order.refundedAmount)}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? "outline"}>
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(order.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Trang ──────────────────────────────────────────────────────────────── */

export function PremiumPage() {
  return (
    <WorkspacePage
      title="Nâng cấp Premium"
      description="Mở khoá các công cụ phân tích và cảnh báo dành cho thành viên Premium."
    >
      <PremiumBody />
    </WorkspacePage>
  )
}

function PremiumBody() {
  const auth = useAuth()
  const plans = usePremiumPlans()
  const subscription = usePremiumSubscription()
  const checkout = useCreateCheckout()
  const [session, setSession] = useState<CheckoutSession | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan | null>(null)

  const rows = plans.data ?? []
  // Mốc so sánh là gói NGẮN NHẤT đang bán (thường là gói 1 tháng): gói dài hơn
  // được tính tiết kiệm trên giá mỗi tháng thật của hai gói, không dùng giá ảo.
  const reference =
    rows.length > 1
      ? rows.reduce((shortest, plan) =>
          plan.durationDays < shortest.durationDays ? plan : shortest,
        )
      : null
  const cheapestId =
    rows.length > 1
      ? rows.reduce((best, plan) =>
          plan.priceVnd / planMonths(plan) < best.priceVnd / planMonths(best) ? plan : best,
        ).id
      : null

  async function selectPlan(plan: PremiumPlan) {
    if (!auth.isAuthenticated) {
      auth.openAuth("register")
      return
    }
    try {
      const next = await checkout.mutateAsync(plan.id)
      setSelectedPlan(plan)
      setSession(next)
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {auth.sessionError ? (
        <PanelState
          title="Không xác minh được phiên đăng nhập"
          description={auth.sessionError.message}
          action={{ label: "Tải lại trang", onClick: () => window.location.reload() }}
        />
      ) : auth.isAuthenticated ? (
        <PremiumStatusPanel
          action={
            <Button
              variant="outline"
              disabled={subscription.isFetching}
              onClick={() => void subscription.refetch()}
            >
              {subscription.isFetching ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Làm mới trạng thái
            </Button>
          }
        />
      ) : (
        <Alert>
          <CircleAlert />
          <AlertTitle>Bạn chưa đăng nhập</AlertTitle>
          <AlertDescription>
            Xem trước các gói bên dưới. Đăng nhập hoặc tạo tài khoản để mua gói và theo dõi trạng thái
            thuê bao.
          </AlertDescription>
          <div className="col-start-2 mt-3 flex gap-2">
            <Button size="sm" onClick={() => auth.openAuth("login")}>
              Đăng nhập
            </Button>
            <Button size="sm" variant="outline" onClick={() => auth.openAuth("register")}>
              Tạo tài khoản
            </Button>
          </div>
        </Alert>
      )}

      {plans.isPending ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <Card key={card}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : plans.isError ? (
        <PanelState
          title="Không tải được danh sách gói"
          description={plans.error.message}
          action={{ label: "Thử lại", onClick: () => void plans.refetch() }}
        />
      ) : rows.length === 0 ? (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Chưa có gói nào đang mở bán</AlertTitle>
          <AlertDescription>
            Hệ thống hiện không có gói Premium nào khả dụng. Vui lòng thử lại sau.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {rows.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              reference={reference}
              cheapestId={cheapestId}
              isPremium={auth.isPremium}
              pending={checkout.isPending && checkout.variables === plan.id}
              onSelect={(next) => void selectPlan(next)}
            />
          ))}
        </div>
      )}

      {auth.isAuthenticated && <OrderHistory />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Thanh toán &amp; kích hoạt
          </CardTitle>
          <CardDescription>
            Thanh toán qua cổng SePay. Gói được kích hoạt tự động ngay khi SePay gửi xác nhận (IPN);
            nếu mua thêm khi gói còn hạn, thời gian mới được cộng dồn vào hạn hiện tại.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <QrCode className="size-3.5" />
            Quét mã QR trên trang thanh toán SePay
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            Đơn chưa thanh toán không bị tính phí
          </span>
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="size-3.5" />
            Mã đơn dùng để đối chiếu khi cần hỗ trợ
          </span>
        </CardContent>
      </Card>

      <CheckoutDialog
        session={session}
        planName={selectedPlan?.name ?? null}
        planAmount={selectedPlan?.priceVnd ?? null}
        onClose={() => {
          setSession(null)
          setSelectedPlan(null)
        }}
      />
    </div>
  )
}
