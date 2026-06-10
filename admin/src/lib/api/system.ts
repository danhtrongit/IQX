import { api } from "./client"

export interface JobInfo {
  id: string
  name: string
  nextRunAt: string | null
  trigger: string
}

export interface SystemStatus {
  version: string
  environment: string
  schedulerRunning: boolean
  jobs: JobInfo[]
  dbStats: { users: number; subscriptions: number; payment_orders: number; ipn_logs: number; audit_log: number }
  lastIpnReceivedAt: string | null
  lastIpnProcessedCount24h: number
  generatedAt: string
}

export interface RunJobResult {
  jobId: string
  result: Record<string, unknown>
  ranAt: string
}

interface RawSystemStatus {
  version: string
  environment: string
  scheduler_running: boolean
  jobs: Array<{ id: string; name: string; next_run_at: string | null; trigger: string }>
  db_stats: SystemStatus["dbStats"]
  last_ipn_received_at: string | null
  last_ipn_processed_count_24h: number
  generated_at: string
}

export const systemApi = {
  status: async (): Promise<SystemStatus> => {
    const raw = await api.get("admin/system/status").json<RawSystemStatus>()
    return {
      version: raw.version,
      environment: raw.environment,
      schedulerRunning: raw.scheduler_running,
      jobs: raw.jobs.map((job) => ({ id: job.id, name: job.name, nextRunAt: job.next_run_at, trigger: job.trigger })),
      dbStats: raw.db_stats,
      lastIpnReceivedAt: raw.last_ipn_received_at,
      lastIpnProcessedCount24h: raw.last_ipn_processed_count_24h,
      generatedAt: raw.generated_at,
    }
  },
  runJob: async (jobId: string): Promise<RunJobResult> => {
    const raw = await api.post(`admin/system/jobs/${jobId}/run`).json<{ job_id: string; result: Record<string, unknown>; ran_at: string }>()
    return { jobId: raw.job_id, result: raw.result, ranAt: raw.ran_at }
  },
}
