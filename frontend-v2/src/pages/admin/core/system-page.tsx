import { useState } from "react"
import { Activity, Database, Play, RefreshCw, Server, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"

import { MANUAL_JOB_IDS, type JobInfo, type RunJobResult } from "./api"
import { AdminDataTable, type AdminColumn } from "./components/admin-data-table"
import { useConfirmDialog } from "./components/use-confirm-dialog"
import { DetailList } from "./components/detail-list"
import { JsonView } from "./components/json-view"
import { KpiTile } from "./components/kpi-tile"
import { StatusBadge } from "./components/status-badge"
import { formatRelative } from "./format"
import { useRunSystemJob, useSystemStatus } from "./hooks"
import { DB_STAT_LABELS } from "./labels"

const WEEKDAY_LABELS: Record<string, string> = {
  "mon-fri": "Thứ 2 – Thứ 6",
  "mon-sun": "Cả tuần",
  mon: "Thứ 2",
  tue: "Thứ 3",
  wed: "Thứ 4",
  thu: "Thứ 5",
  fri: "Thứ 6",
  sat: "Thứ 7",
  sun: "Chủ nhật",
}

/**
 * APScheduler repr (`interval[0:15:00]`, `cron[day_of_week='mon-fri', hour='6', minute='0']`)
 * rendered as a sentence. The raw string stays available as the cell's title.
 */
function describeTrigger(trigger: string): string {
  const interval = /^interval\[(?:(\d+) days?, )?(\d+):(\d+):(\d+)\]$/.exec(trigger)
  if (interval) {
    const [, days, hours, minutes, seconds] = interval
    const parts = [
      Number(days) > 0 ? `${Number(days)} ngày` : null,
      Number(hours) > 0 ? `${Number(hours)} giờ` : null,
      Number(minutes) > 0 ? `${Number(minutes)} phút` : null,
      Number(seconds) > 0 ? `${Number(seconds)} giây` : null,
    ].filter(Boolean)
    return parts.length > 0 ? `Mỗi ${parts.join(" ")}` : "Chạy liên tục"
  }
  const cron = /^cron\[day_of_week='([^']+)', hour='(\d+)', minute='(\d+)'\]$/.exec(trigger)
  if (cron) {
    const [, weekday, hour, minute] = cron
    const day = WEEKDAY_LABELS[weekday] ?? weekday
    return `${day} lúc ${String(Number(hour)).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`
  }
  return trigger
}

export function SystemPage() {
  const status = useSystemStatus()
  const runJob = useRunSystemJob()
  const confirm = useConfirmDialog()
  const [result, setResult] = useState<RunJobResult | null>(null)
  const snapshot = status.data

  function askRun(job: JobInfo) {
    confirm.ask({
      title: "Chạy job thủ công?",
      description: `Job “${job.name}” sẽ được kích hoạt ngay, ngoài lịch định kỳ.`,
      confirmLabel: "Chạy ngay",
      body: (
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>
            Mã job: <span className="font-mono text-xs">{job.id}</span>
          </div>
          <div>Lịch định kỳ: {describeTrigger(job.trigger)}</div>
          <div>Thao tác này được ghi vào nhật ký kiểm toán.</div>
        </div>
      ),
      run: async () => {
        try {
          const outcome = await runJob.mutateAsync(job.id)
          setResult(outcome)
          toast.success(`Đã gửi job ${job.id} vào hàng đợi`)
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    })
  }

  const columns: AdminColumn<JobInfo>[] = [
    {
      id: "id",
      header: "Job",
      cell: (job) => <span className="font-mono text-xs">{job.id}</span>,
    },
    { id: "name", header: "Tên", cell: (job) => job.name },
    {
      id: "nextRun",
      header: "Lần chạy tiếp theo",
      cell: (job) =>
        job.nextRunAt ? (
          <span className="tabular-nums">
            {formatDateTime(job.nextRunAt)}{" "}
            <span className="text-muted-foreground">({formatRelative(job.nextRunAt)})</span>
          </span>
        ) : (
          <span
            className="text-muted-foreground"
            title="Chưa có lịch chạy kế tiếp, hàng đợi có thể đang tắt (QUEUE_ENABLED=false)."
          >
            Chưa xác định
          </span>
        ),
    },
    {
      id: "trigger",
      header: "Lịch",
      cell: (job) => (
        <span title={job.trigger} className="text-muted-foreground">
          {describeTrigger(job.trigger)}
        </span>
      ),
    },
    {
      id: "action",
      header: "Thao tác",
      align: "right",
      cell: (job) => {
        const runnable = (MANUAL_JOB_IDS as readonly string[]).includes(job.id)
        return (
          <Button
            variant="outline"
            size="sm"
            disabled={!runnable || runJob.isPending}
            title={
              runnable
                ? `Chạy ${job.id} ngay`
                : "Máy chủ chỉ cho chạy thủ công expiry_sweep và ipn_reconcile_scan"
            }
            onClick={() => askRun(job)}
          >
            <Play />
            Chạy
          </Button>
        )
      },
    },
  ]

  return (
    <WorkspacePage
      title="Hệ thống"
      description="Bộ lập lịch, job định kỳ, số liệu IPN và bảng đếm dữ liệu"
      actions={
        <>
          {snapshot && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Cập nhật lúc {formatDateTime(snapshot.generatedAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            <RefreshCw className={status.isFetching ? "animate-spin" : undefined} />
            Làm mới
          </Button>
        </>
      }
    >
      {status.isError && (
        <PanelState
          title="Không tải được trạng thái hệ thống"
          description={errorMessage(status.error)}
          action={{ label: "Thử lại", onClick: () => void status.refetch() }}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Phiên bản"
          value={snapshot?.version ?? "—"}
          hint={snapshot ? `Môi trường: ${snapshot.environment}` : undefined}
          icon={Server}
          loading={status.isLoading}
        />
        <KpiTile
          label="Bộ lập lịch"
          value={snapshot ? (snapshot.schedulerRunning ? "Đang chạy" : "Đã dừng") : "—"}
          hint={snapshot ? `${snapshot.jobs.length} job được đăng ký` : undefined}
          icon={ShieldCheck}
          tone={snapshot?.schedulerRunning ? "success" : "danger"}
          loading={status.isLoading}
        />
        <KpiTile
          label="IPN 24 giờ"
          value={formatNumber(snapshot?.lastIpnProcessedCount24h ?? 0)}
          hint={
            snapshot?.lastIpnReceivedAt
              ? `Gần nhất: ${formatDateTime(snapshot.lastIpnReceivedAt)} (${formatRelative(snapshot.lastIpnReceivedAt)})`
              : "Chưa nhận IPN nào"
          }
          icon={Activity}
          loading={status.isLoading}
        />
        <KpiTile
          label="Nhật ký kiểm toán"
          value={formatNumber(snapshot?.dbStats.audit_log ?? 0)}
          hint="Số bản ghi đã ghi"
          icon={Database}
          loading={status.isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bảng đếm dữ liệu</CardTitle>
          <CardDescription>Số bản ghi hiện có theo bảng</CardDescription>
        </CardHeader>
        <CardContent>
          {status.isLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          ) : (
            <DetailList
              columns={3}
              items={Object.entries(DB_STAT_LABELS).map(([key, label]) => ({
                label,
                value: <span className="tabular-nums">{formatNumber(snapshot?.dbStats[key] ?? 0)}</span>,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bộ lập lịch</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={snapshot?.schedulerRunning ?? false}
              label={snapshot?.schedulerRunning ? "Đang chạy" : "Đã dừng"}
            />
            <span>
              Chỉ hai job <span className="font-mono text-xs">expiry_sweep</span> và{" "}
              <span className="font-mono text-xs">ipn_reconcile_scan</span> chạy thủ công được.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDataTable
            columns={columns}
            rows={snapshot?.jobs ?? []}
            rowKey={(job) => job.id}
            loading={status.isLoading}
            error={status.isError ? errorMessage(status.error) : null}
            onRetry={() => void status.refetch()}
            emptyLabel="Chưa có job nào được đăng ký."
          />
        </CardContent>
      </Card>

      {confirm.element}

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kết quả job {result?.jobId}</DialogTitle>
            <DialogDescription>
              Chạy lúc {result ? formatDateTime(result.ranAt) : "—"} · đã ghi vào nhật ký kiểm toán.
            </DialogDescription>
          </DialogHeader>
          <JsonView data={result?.result} maxHeight="24rem" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResult(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  )
}
