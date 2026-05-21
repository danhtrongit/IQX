import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Play,
  RefreshCw,
  Server,
  XCircle,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ErrorState } from "@/components/common/error-state"
import { JsonViewer } from "@/components/common/json-viewer"
import { KpiCard } from "@/components/common/kpi-card"
import { systemApi, type JobInfo, type SystemStatus } from "@/lib/api/system"
import { fmtDateTime, fmtRelative } from "@/lib/format"

const AUTO_REFRESH_MS = 30_000

function SchedulerBadge({ running }: { running: boolean }) {
  if (running) {
    return (
      <Badge className="gap-1.5 bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 border font-medium">
        <CheckCircle2 className="size-3.5" />
        Running
      </Badge>
    )
  }
  return (
    <Badge className="gap-1.5 bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 border font-medium">
      <XCircle className="size-3.5" />
      Stopped
    </Badge>
  )
}

function JobCard({
  job,
  onRun,
  running,
}: {
  job: JobInfo
  onRun: (jobId: string) => void
  running: boolean
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Zap className="size-4 shrink-0 text-primary" />
              <span className="font-mono text-sm font-semibold">{job.id}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{job.name}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                <span className="font-medium">Next run:</span>
                {job.nextRunAt
                  ? `${fmtDateTime(job.nextRunAt)} (${fmtRelative(job.nextRunAt)})`
                  : "—"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                <span className="font-medium">Trigger:</span>
                {job.trigger}
              </span>
            </div>
          </div>
          <div className="shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setConfirmOpen(true)}
              disabled={running}
            >
              {running ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Chạy ngay
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Chạy job thủ công?"
          description={`Bạn đang kích hoạt "${job.name}" ngay lập tức. Job sẽ chạy với phiên DB riêng và ghi audit log.`}
          confirmLabel="Chạy ngay"
          onConfirm={() => onRun(job.id)}
        />
      </CardContent>
    </Card>
  )
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    setError(null)
    try {
      const data = await systemApi.status()
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải trạng thái hệ thống")
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void fetchStatus().then(scheduleRefresh)
    }, AUTO_REFRESH_MS)
  }, [fetchStatus])

  useEffect(() => {
    void fetchStatus().then(scheduleRefresh)
    const onFocus = () => {
      void fetchStatus().then(scheduleRefresh)
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fetchStatus, scheduleRefresh])

  const handleRefresh = () => {
    setLoading(true)
    void fetchStatus().then(scheduleRefresh)
  }

  const handleRunJob = async (jobId: string) => {
    setRunningJobId(jobId)
    try {
      const result = await systemApi.runJob(jobId)
      toast.success(`Job "${jobId}" hoàn thành`, {
        description: (
          <div className="mt-2">
            <JsonViewer data={result.result} maxHeight="200px" />
          </div>
        ),
        duration: 8000,
      })
      void fetchStatus()
    } catch (e) {
      toast.error(`Lỗi khi chạy job "${jobId}"`, {
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setRunningJobId(null)
    }
  }

  if (loading && !status) {
    return (
      <div className="space-y-6 p-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hệ thống</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Hệ thống</h1>
        <ErrorState message={error} onRetry={handleRefresh} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hệ thống</h1>
          {status && (
            <p className="text-sm text-muted-foreground">
              Cập nhật lúc {fmtDateTime(status.generatedAt)}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* Row 1: App info + scheduler */}
      {status && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Phiên bản"
            value={status.version}
            subText={`Môi trường: ${status.environment}`}
            icon={Server}
          />
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-muted-foreground">Scheduler</p>
                  <div className="mt-1.5">
                    <SchedulerBadge running={status.schedulerRunning} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status.jobs.length} job đã đăng ký
                  </p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <KpiCard
            label="IPN gần nhất"
            value={status.lastIpnReceivedAt ? fmtRelative(status.lastIpnReceivedAt) : "—"}
            subText={
              status.lastIpnReceivedAt
                ? fmtDateTime(status.lastIpnReceivedAt)
                : "Chưa có IPN nào"
            }
            icon={Zap}
          />
          <KpiCard
            label="IPN xử lý (24h)"
            value={status.lastIpnProcessedCount24h}
            subText="Trạng thái: processed"
            icon={CheckCircle2}
          />
        </div>
      )}

      {/* Row 2: DB stats */}
      {status && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Thống kê Database</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <KpiCard label="Người dùng" value={status.dbStats.users} icon={Database} />
            <KpiCard label="Đăng ký" value={status.dbStats.subscriptions} icon={Database} />
            <KpiCard label="Đơn hàng" value={status.dbStats.payment_orders} icon={Database} />
            <KpiCard label="IPN Logs" value={status.dbStats.ipn_logs} icon={Database} />
            <KpiCard label="Audit Log" value={status.dbStats.audit_log} icon={Database} />
          </div>
        </div>
      )}

      {/* Jobs section */}
      {status && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Background Jobs</h2>
          {status.jobs.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Scheduler chưa khởi động hoặc không có job nào được đăng ký.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {status.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onRun={(id) => void handleRunJob(id)}
                  running={runningJobId === job.id}
                />
              ))}
            </div>
          )}

          {/* Fallback manual trigger when scheduler is off */}
          {!status.schedulerRunning && (
            <div className="mt-4">
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-400">
                    <XCircle className="size-4" />
                    Scheduler không chạy — kích hoạt job thủ công
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-0">
                  {["expiry_sweep", "ipn_reconcile_scan"].map((jobId) => (
                    <Button
                      key={jobId}
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-amber-300 dark:border-amber-700"
                      onClick={() => void handleRunJob(jobId)}
                      disabled={runningJobId === jobId}
                    >
                      {runningJobId === jobId ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      {jobId}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
