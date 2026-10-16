import { Link } from "react-router"
import {
  ArrowRight,
  BadgeDollarSign,
  CircleDollarSign,
  Database,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatMoney, formatNumber } from "@/lib/format"

import type { DailyRevenuePoint, MetricsOverview, PlanDistributionPoint } from "../api"
import { formatCompact, formatDay } from "../format"
import { KpiTile } from "./kpi-tile"

/**
 * Khối dùng chung của trang Tổng quan (admin spec v1.0 §3.1). Quản trị viên và trưởng nhóm
 * có cùng bố cục: 8 ô KPI, biểu đồ doanh thu, phân bổ gói và 4 lối tắt; chỉ nguồn số liệu
 * khác nhau (`admin/metrics/*` hoặc `team/metrics/*`).
 */

const revenueConfig = {
  revenueVnd: { label: "Doanh thu", color: "var(--chart-1)" },
} satisfies ChartConfig

export function OverviewKpiGrid({
  metrics,
  error,
  loading,
  scope = "admin",
}: {
  metrics: MetricsOverview | undefined
  error: boolean
  loading: boolean
  scope?: "admin" | "team"
}) {
  const displayNumber = (value: number | undefined) => (error ? "—" : formatNumber(value ?? 0))
  const displayMoney = (value: number | undefined) => (error ? "—" : formatMoney(value ?? 0))
  const hint = (text: string) => (error ? undefined : text)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Tổng người dùng"
          value={displayNumber(metrics?.totalUsers)}
          hint={hint(`Hoạt động: ${displayNumber(metrics?.activeUsers)} · Hôm nay: +${displayNumber(metrics?.newUsersToday)}`)}
          icon={Users}
          loading={loading}
        />
        <KpiTile
          label="Người dùng mới hôm nay"
          value={displayNumber(metrics?.newUsersToday)}
          hint={hint(`7 ngày: ${displayNumber(metrics?.newUsersLast7d)} · 30 ngày: ${displayNumber(metrics?.newUsersLast30d)}`)}
          icon={UserPlus}
          loading={loading}
        />
        <KpiTile
          label="Premium đang hoạt động"
          value={displayNumber(metrics?.activePaidCount)}
          hint={hint(
            `Dùng thử: ${displayNumber(metrics?.activeTrialCount)} · Ưu đãi mã: ${displayNumber(metrics?.activeReferralOfferCount)} · Thuê bao: ${displayNumber(metrics?.activeSubscribers)}`,
          )}
          icon={BadgeDollarSign}
          loading={loading}
        />
        <KpiTile
          label="Doanh thu định kỳ (MRR)"
          value={displayMoney(metrics?.mrrVnd)}
          hint={hint(`30 ngày: ${displayMoney(metrics?.revenueLast30dVnd)}`)}
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Doanh thu hôm nay"
          value={displayMoney(metrics?.revenueTodayVnd)}
          hint={hint(`7 ngày: ${displayMoney(metrics?.revenueLast7dVnd)}`)}
          icon={CircleDollarSign}
          loading={loading}
        />
        <KpiTile
          label="Thuê bao đang hoạt động"
          value={displayNumber(metrics?.activeSubscribers)}
          hint={hint(`Trả phí: ${displayNumber(metrics?.activePaidCount)} · Dùng thử: ${displayNumber(metrics?.activeTrialCount)}`)}
          icon={Database}
          loading={loading}
        />
        <KpiTile
          label="Tài khoản giao dịch ảo"
          value={displayNumber(metrics?.vtActiveAccounts)}
          hint={hint(scope === "team" ? "Tài khoản đang hoạt động của thành viên" : "Tài khoản đang hoạt động")}
          icon={Wallet}
          loading={loading}
        />
        <KpiTile
          label="Lệnh ảo hôm nay"
          value={displayNumber(metrics?.vtOrdersToday)}
          hint={hint(scope === "team" ? "Lệnh mô phỏng hôm nay của thành viên" : "Lệnh đặt trong ngày")}
          icon={TrendingUp}
          loading={loading}
        />
      </div>
    </>
  )
}

export function RevenueChartCard({
  series,
  loading,
  days = 30,
}: {
  series: DailyRevenuePoint[]
  loading: boolean
  days?: number
}) {
  const periodOrders = series.reduce((total, point) => total + point.paidOrders, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Doanh thu {days} ngày</CardTitle>
        <CardDescription className="tabular-nums">
          {formatNumber(periodOrders)} đơn đã thanh toán trong kỳ
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[260px] animate-pulse rounded-md bg-muted" />
        ) : series.length === 0 ? (
          <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Chưa có đơn thanh toán nào trong {days} ngày gần nhất.
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
  )
}

export function PlanDistributionCard({
  planDistribution,
  loading,
}: {
  planDistribution: PlanDistributionPoint[]
  loading: boolean
}) {
  const maxPlanCount = planDistribution.reduce((max, plan) => Math.max(max, plan.activeSubscriptions), 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phân bổ gói Premium</CardTitle>
        <CardDescription>Số thuê bao đang hoạt động theo gói</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
        ) : planDistribution.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Chưa có thuê bao đang hoạt động.</p>
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
  )
}

export type OverviewShortcut = {
  to: string
  label: string
  description: string
  /** Số bản ghi khớp lối tắt; `undefined` khi lối tắt không có số đếm. */
  count?: number | null
  countLoading?: boolean
}

export function OverviewShortcuts({ label, items }: { label: string; items: OverviewShortcut[] }) {
  return (
    <nav aria-label={label} className="overflow-hidden rounded-lg bg-card ring-1 ring-border/60 ring-inset dark:ring-0">
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {item.count !== undefined && (
                  <span className="min-w-8 text-right font-heading text-base font-semibold tabular-nums">
                    {item.countLoading ? (
                      <span className="inline-block h-4 w-6 animate-pulse rounded bg-muted align-middle">
                        <span className="sr-only">Đang tải số lượng</span>
                      </span>
                    ) : item.count === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatNumber(item.count)
                    )}
                  </span>
                )}
                <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
