/**
 * Khối "Gói đăng ký" — trạng thái thật từ `GET /premium/me`.
 *
 * Dùng ở `/cai-dat` (CTA nâng cấp) và `/nang-cap` (trạng thái trước khi mua).
 * Không suy diễn trạng thái từ `role` của user: chỉ `admin` được coi là có toàn
 * quyền (đúng như `PremiumService.isActive` phía backend), còn lại đọc
 * `is_premium` do server trả về.
 */
import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { CalendarClock, CircleAlert, LoaderCircle, ShieldCheck, Trophy } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { daysUntil, formatDateOnly } from "./format"
import { usePremiumSubscription } from "./hooks"

export function PremiumStatusPanel({ action }: { action?: ReactNode }) {
  const { user } = useAuth()
  const subscription = usePremiumSubscription()
  const [renderedAt] = useState(() => Date.now())

  if (subscription.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            Đang tải trạng thái gói
          </CardTitle>
          <CardDescription>Đang đối chiếu với hệ thống IQX.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    )
  }

  if (subscription.isError) {
    return (
      <PanelState
        title="Không tải được trạng thái gói"
        description={subscription.error.message}
        action={{ label: "Thử lại", onClick: () => void subscription.refetch() }}
      />
    )
  }

  const data = subscription.data
  const isAdmin = user?.role === "admin"
  const premium = isAdmin || data.isPremium
  const periodEnd = data.periodEnd
  const remaining = daysUntil(periodEnd)
  // Server đã trả `is_premium: false` cho thuê bao hết hạn nhưng vẫn giữ
  // `current_period_end` — dùng mốc đó để nói rõ "hết hạn ngày nào".
  const expired = !premium && !!periodEnd && new Date(periodEnd).getTime() < renderedAt

  const title = isAdmin
    ? "Quản trị viên"
    : premium
      ? data.isTrial
        ? "Dùng thử Premium"
        : "Premium"
      : expired
        ? "Gói đã hết hạn"
        : "Gói miễn phí"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Trophy className={premium ? "size-4 text-chart-2" : "size-4 text-muted-foreground"} />
          {title}
          {isAdmin && <Badge variant="gold">Toàn quyền</Badge>}
          {!isAdmin && premium && (
            <Badge variant={data.isTrial ? "secondary" : "default"}>
              {data.isTrial ? "Đang dùng thử" : "Đang hoạt động"}
            </Badge>
          )}
          {!isAdmin && expired && <Badge variant="destructive">Hết hạn</Badge>}
        </CardTitle>
        <CardDescription>
          {isAdmin
            ? "Tài khoản quản trị có toàn quyền trên hệ thống, không cần gói Premium."
            : data.plan
              ? `Gói hiện tại: ${data.plan.name}`
              : "Bạn đang dùng các tính năng miễn phí của IQX."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1 text-sm">
          {periodEnd ? (
            <p className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              {premium ? "Hết hạn" : "Đã hết hạn"}: <span className="font-medium">{formatDateOnly(periodEnd)}</span>
              {premium && <span className="text-muted-foreground">· còn {remaining} ngày</span>}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <CircleAlert className="size-4" />
              {isAdmin ? "Không áp dụng thời hạn." : "Chưa từng có gói Premium."}
            </p>
          )}
          {premium && !isAdmin && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="size-4" />
              Mua thêm sẽ cộng dồn vào hạn hiện tại, không mất thời gian còn lại.
            </p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </CardContent>
    </Card>
  )
}

/** Nút dẫn sang `/nang-cap`, nhãn đổi theo trạng thái hiện tại. */
export function UpgradeButton({ label = "Nâng cấp Premium" }: { label?: string }) {
  return (
    <Button asChild>
      <Link to="/nang-cap">
        <Trophy />
        {label}
      </Link>
    </Button>
  )
}
