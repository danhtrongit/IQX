import { Link } from "react-router"
import {
  ArrowRight,
  BadgeDollarSign,
  CircleDollarSign,
  Database,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"

import { KpiTile } from "./components/kpi-tile"
import { formatCompact, formatDay } from "./format"
import { useDailyRevenue, useMetricsOverview } from "./hooks"

const revenueConfig = {
  revenueVnd: { label: "Doanh thu", color: "var(--chart-1)" },
} satisfies ChartConfig

const SHORTCUTS = [
  {
    to: "/admin/users",
    label: "Người dùng",
    description: "Tìm kiếm, vai trò, trạng thái, đặt lại mật khẩu và xuất CSV",
  },
  {
    to: "/admin/audit",
    label: "Nhật ký kiểm toán",
    description: "Mọi thao tác quản trị, kèm dữ liệu trước/sau",
  },
  {
    to: "/admin/system",
    label: "Hệ thống",
    description: "Scheduler, job định kỳ, số liệu IPN và bảng đếm dữ liệu",
  },
  {
    to: "/admin/alerts",
    label: "Tín hiệu cảnh báo",
    description: "Cấu hình tổ hợp chỉ số cho tín hiệu gửi qua Telegram",
  },
]

export function AdminDashboardPage() {
  const overview = useMetricsOverview()
  const revenue = useDailyRevenue(30)
  const metrics = overview.data
  const series = revenue.data ?? []
  const periodOrders = series.reduce((total, point) => total + point.paidOrders, 0)
  const error = overview.error ?? revenue.error
  const loading = overview.isLoading
  const displayNumber = (value: number | undefined) => (error ? "—" : formatNumber(value ?? 0))
  const displayMoney = (value: number | undefined) => (error ? "—" : formatMoney(value ?? 0))

  function retry() {
    void overview.refetch()
    void revenue.refetch()
  }

  const planDistribution = metrics?.planDistribution ?? []
  const maxPlanCount = planDistribution.reduce(
    (max, plan) => Math.max(max, plan.activeSubscriptions),
    1,
  )

  return (
    <WorkspacePage
      title="Tổng quan"
      description="KPI người dùng, premium và giao dịch ảo"
      actions={
        <>
          {metrics && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Cập nhật lúc {formatDateTime(metrics.generatedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={overview.isFetching || revenue.isFetching}
            onClick={retry}
          >
            <RefreshCw className={overview.isFetching || revenue.isFetching ? "animate-spin" : undefined} />
            Làm mới
          </Button>
        </>
      }
    >
      {error && (
        <PanelState
          title="Không tải được số liệu"
          description={errorMessage(error)}
          action={{ label: "Thử lại", onClick: retry }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Tổng người dùng"
          value={displayNumber(metrics?.totalUsers)}
          hint={error ? undefined : `Hoạt động: ${displayNumber(metrics?.activeUsers)} · Hôm nay: +${displayNumber(metrics?.newUsersToday)}`}
          icon={Users}
          loading={loading}
        />
        <KpiTile
          label="Người dùng mới hôm nay"
          value={displayNumber(metrics?.newUsersToday)}
          hint={error ? undefined : `7 ngày: ${displayNumber(metrics?.newUsersLast7d)} · 30 ngày: ${displayNumber(metrics?.newUsersLast30d)}`}
          icon={UserPlus}
          loading={loading}
        />
        <KpiTile
          label="Premium đang hoạt động"
          value={displayNumber(metrics?.activePaidCount)}
          hint={error ? undefined : `Dùng thử: ${displayNumber(metrics?.activeTrialCount)} · Thuê bao: ${displayNumber(metrics?.activeSubscribers)}`}
          icon={BadgeDollarSign}
          loading={loading}
        />
        <KpiTile
          label="Doanh thu định kỳ (MRR)"
          value={displayMoney(metrics?.mrrVnd)}
          hint={error ? undefined : `30 ngày: ${displayMoney(metrics?.revenueLast30dVnd)}`}
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Doanh thu hôm nay"
          value={displayMoney(metrics?.revenueTodayVnd)}
          hint={error ? undefined : `7 ngày: ${displayMoney(metrics?.revenueLast7dVnd)}`}
          icon={CircleDollarSign}
          loading={loading}
        />
        <KpiTile
          label="Thuê bao đang hoạt động"
          value={displayNumber(metrics?.activeSubscribers)}
          hint={error ? undefined : `Trả phí: ${displayNumber(metrics?.activePaidCount)} · Dùng thử: ${displayNumber(metrics?.activeTrialCount)}`}
          icon={Database}
          loading={loading}
        />
        <KpiTile
          label="Tài khoản giao dịch ảo"
          value={displayNumber(metrics?.vtActiveAccounts)}
          hint={error ? undefined : "Tài khoản đang hoạt động"}
          icon={Wallet}
          loading={loading}
        />
        <KpiTile
          label="Lệnh ảo hôm nay"
          value={displayNumber(metrics?.vtOrdersToday)}
          hint={error ? undefined : "Lệnh đặt trong ngày"}
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Doanh thu 30 ngày</CardTitle>
            <CardDescription className="tabular-nums">
              {formatNumber(periodOrders)} đơn đã thanh toán trong kỳ
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenue.isLoading ? (
              <div className="h-[260px] animate-pulse rounded-md bg-muted" />
            ) : series.length === 0 ? (
              <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                Chưa có đơn thanh toán nào trong 30 ngày gần nhất.
              </p>
            ) : (
              <ChartContainer config={revenueConfig} className="aspect-auto h-[260px] w-full">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={(value: string) => formatDay(value)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(value: number) => formatCompact(value)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => formatDay(String(label), true)}
                        formatter={(value) => formatMoney(Number(value))}
                      />
                    }
                  />
                  <Area
                    dataKey="revenueVnd"
                    type="monotone"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phân bổ gói Premium</CardTitle>
            <CardDescription>Số thuê bao đang hoạt động theo gói</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            ) : planDistribution.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có thuê bao đang hoạt động.
              </p>
            ) : (
              <ul className="space-y-3">
                {planDistribution.map((plan) => (
                  <li key={plan.planCode}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{plan.planName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatMoney(plan.priceVnd)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-chart-2"
                          style={{ width: `${(plan.activeSubscriptions / maxPlanCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums">
                        {formatNumber(plan.activeSubscriptions)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <nav aria-label="Lối tắt quản trị" className="overflow-hidden rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0">
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </WorkspacePage>
  )
}
