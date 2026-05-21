import { useCallback, useEffect, useRef, useState } from "react"
import {
  Users,
  UserPlus,
  CreditCard,
  TrendingUp,
  RefreshCw,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/common/kpi-card"
import { ErrorState } from "@/components/common/error-state"
import {
  metricsApi,
  type MetricsOverview,
  type DailyRevenuePoint,
  type PlanDistributionPoint,
} from "@/lib/api/metrics"
import { fmtCompact, fmtVnd, fmtDate } from "@/lib/format"

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
]

const AUTO_REFRESH_MS = 60_000

export default function DashboardPage() {
  const [overview, setOverview] = useState<MetricsOverview | null>(null)
  const [revenue, setRevenue] = useState<DailyRevenuePoint[]>([])
  const [planDist, setPlanDist] = useState<PlanDistributionPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ov, rv, pd] = await Promise.all([
        metricsApi.overview(),
        metricsApi.revenue(30),
        metricsApi.planDistribution(),
      ])
      setOverview(ov)
      setRevenue(rv)
      setPlanDist(pd)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
    timerRef.current = setInterval(() => { void fetchAll() }, AUTO_REFRESH_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchAll])

  if (error) {
    return (
      <div className="space-y-6">
        <Header loading={false} onRefresh={fetchAll} />
        <ErrorState message={error} onRetry={fetchAll} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header loading={loading} onRefresh={fetchAll} />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tổng người dùng"
          value={loading ? "—" : fmtCompact(overview?.total_users ?? 0)}
          subText={loading ? undefined : `Hôm nay: +${overview?.new_users_today ?? 0}`}
          icon={Users}
          loading={loading}
        />
        <KpiCard
          label="Người dùng mới hôm nay"
          value={loading ? "—" : String(overview?.new_users_today ?? 0)}
          subText={loading ? undefined : `7 ngày: ${overview?.new_users_last_7d ?? 0}`}
          icon={UserPlus}
          loading={loading}
        />
        <KpiCard
          label="Premium đang hoạt động"
          value={loading ? "—" : String(overview?.active_paid_count ?? 0)}
          subText={loading ? undefined : `Trial: ${overview?.active_trial_count ?? 0}`}
          icon={CreditCard}
          loading={loading}
        />
        <KpiCard
          label="MRR (ước tính)"
          value={loading ? "—" : fmtVnd(overview?.mrr_vnd ?? 0)}
          subText={
            loading
              ? undefined
              : `30 ngày: ${fmtVnd(overview?.revenue_last_30d_vnd ?? 0)}`
          }
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-10">
        {/* Revenue Chart 70% */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Doanh thu 30 ngày</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : revenue.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Chưa có dữ liệu doanh thu
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => {
                      try {
                        return fmtDate(v).slice(0, 5) // dd/MM
                      } catch {
                        return v
                      }
                    }}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtCompact(v)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    formatter={(val: number) => [fmtVnd(val), "Doanh thu"]}
                    labelFormatter={(label: string) => {
                      try {
                        return fmtDate(label)
                      } catch {
                        return label
                      }
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue_vnd"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Plan Distribution 30% */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Phân bổ gói Premium</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : planDist.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Chưa có dữ liệu
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={planDist}
                  layout="vertical"
                  margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="plan_name"
                    width={80}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [val, "Thuê bao"]}
                  />
                  <Bar dataKey="active_subscriptions" radius={[0, 4, 4, 0]}>
                    {planDist.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Header({
  loading,
  onRefresh,
}: {
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">
          Cập nhật tự động mỗi 60 giây
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        Làm mới
      </Button>
    </div>
  )
}
