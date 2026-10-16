import { RefreshCw } from "lucide-react"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import {
  OverviewKpiGrid,
  OverviewShortcuts,
  PlanDistributionCard,
  RevenueChartCard,
  type OverviewShortcut,
} from "./components/overview-panels"
import { useDailyRevenue, useMetricsOverview } from "./hooks"

const SHORTCUTS: OverviewShortcut[] = [
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
  const error = overview.error ?? revenue.error
  const fetching = overview.isFetching || revenue.isFetching

  function retry() {
    void overview.refetch()
    void revenue.refetch()
  }

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
          <Button variant="outline" size="sm" disabled={fetching} onClick={retry}>
            <RefreshCw className={fetching ? "animate-spin" : undefined} />
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

      <OverviewKpiGrid metrics={metrics} error={!!error} loading={overview.isLoading} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RevenueChartCard series={revenue.data ?? []} loading={revenue.isLoading} />
        <PlanDistributionCard planDistribution={metrics?.planDistribution ?? []} loading={overview.isLoading} />
      </div>

      <OverviewShortcuts label="Lối tắt quản trị" items={SHORTCUTS} />
    </WorkspacePage>
  )
}
