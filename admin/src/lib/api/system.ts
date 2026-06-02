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
  dbStats: {
    users: number
    subscriptions: number
    payment_orders: number
    ipn_logs: number
    audit_log: number
  }
  lastIpnReceivedAt: string | null
  lastIpnProcessedCount24h: number
  generatedAt: string
}

export interface RunJobResult {
  jobId: string
  result: Record<string, unknown>
  ranAt: string
}

// Raw API shape uses snake_case
interface RawJobInfo {
  id: string
  name: string
  next_run_at: string | null
  trigger: string
}

interface RawSystemStatus {
  version: string
  environment: string
  scheduler_running: boolean
  jobs: RawJobInfo[]
  db_stats: {
    users: number
    subscriptions: number
    payment_orders: number
    ipn_logs: number
    audit_log: number
  }
  last_ipn_received_at: string | null
  last_ipn_processed_count_24h: number
  generated_at: string
}

interface RawRunJobResult {
  job_id: string
  result: Record<string, unknown>
  ran_at: string
}

function normalizeJob(raw: RawJobInfo): JobInfo {
  return {
    id: raw.id,
    name: raw.name,
    nextRunAt: raw.next_run_at,
    trigger: raw.trigger,
  }
}

function normalizeStatus(raw: RawSystemStatus): SystemStatus {
  return {
    version: raw.version,
    environment: raw.environment,
    schedulerRunning: raw.scheduler_running,
    jobs: raw.jobs.map(normalizeJob),
    dbStats: raw.db_stats,
    lastIpnReceivedAt: raw.last_ipn_received_at,
    lastIpnProcessedCount24h: raw.last_ipn_processed_count_24h,
    generatedAt: raw.generated_at,
  }
}

export const systemApi = {
  status: async (): Promise<SystemStatus> => {
    const raw = await api.get("admin/system/status").json<RawSystemStatus>()
    return normalizeStatus(raw)
  },

  runJob: async (jobId: string): Promise<RunJobResult> => {
    const raw = await api
      .post(`admin/system/jobs/${jobId}/run`)
      .json<RawRunJobResult>()
    return {
      jobId: raw.job_id,
      result: raw.result,
      ranAt: raw.ran_at,
    }
  },
}
