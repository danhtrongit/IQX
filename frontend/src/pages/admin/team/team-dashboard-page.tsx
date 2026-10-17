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
} from "@/pages/admin/core/components/overview-panels"

import { TEAM_USER_SEGMENTS, type TeamUserSegment } from "./api"
import { useTeamDailyRevenue, useTeamMe, useTeamMetricsOverview, useTeamSegmentCount } from "./hooks"
import { SEGMENT_COPY, segmentHref, teamScopeLabel } from "./labels"

/** Tổng quan của trưởng nhóm: cùng bố cục với quản trị viên, số liệu chỉ tính trong nhóm. */
export function TeamDashboardPage() {
  const me = useTeamMe()
  const overview = useTeamMetricsOverview()
  const revenue = useTeamDailyRevenue(30)
  const counts = {
    new_7d: useTeamSegmentCount("new_7d"),
    email_unverified: useTeamSegmentCount("email_unverified"),
    trialing: useTeamSegmentCount("trialing"),
    inactive_14d: useTeamSegmentCount("inactive_14d"),
  } satisfies Record<TeamUserSegment, unknown>
  const metrics = overview.data
  const error = overview.error ?? revenue.error
  const fetching = overview.isFetching || revenue.isFetching

  function retry() {
    void me.refetch()
    void overview.refetch()
    void revenue.refetch()
    for (const segment of TEAM_USER_SEGMENTS) void counts[segment].refetch()
  }

  const shortcuts: OverviewShortcut[] = TEAM_USER_SEGMENTS.map((segment) => ({
    to: segmentHref(segment),
    label: SEGMENT_COPY[segment].label,
    description: SEGMENT_COPY[segment].description,
    count: counts[segment].isError ? null : counts[segment].data,
    countLoading: counts[segment].isPending,
  }))

  return (
    <WorkspacePage
      title="Tổng quan"
      description={teamScopeLabel(me.data)}
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
          title="Không tải được số liệu của nhóm"
          description={errorMessage(error)}
          action={{ label: "Thử lại", onClick: retry }}
        />
      )}

      <OverviewKpiGrid metrics={metrics} error={!!error} loading={overview.isLoading} scope="team" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RevenueChartCard series={revenue.data ?? []} loading={revenue.isLoading} />
        <PlanDistributionCard planDistribution={metrics?.planDistribution ?? []} loading={overview.isLoading} />
      </div>

      <OverviewShortcuts label="Lối tắt người dùng trong nhóm" items={shortcuts} />
    </WorkspacePage>
  )
}
