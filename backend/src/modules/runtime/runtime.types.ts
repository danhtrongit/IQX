export const RUNTIME_QUEUE = 'iqx-runtime';

export const RUNTIME_JOB_NAMES = [
  'reports.daily',
  'reports.daily-retry',
  'reports.midday',
  'reports.premarket',
  'billing.expiry-sweep',
  'billing.ipn-reconcile',
  'alerts.scan',
  'journey.cap2-close-scan',
  'journey.cap5-consensus',
  'journey.identity-recovery',
  'bot.session-eod',
  'market.snapshot-wave-1',
  'market.snapshot-wave-2',
  'market.snapshot-wave-3',
] as const;

export type RuntimeJobName = (typeof RUNTIME_JOB_NAMES)[number];

export type JobOutcome =
  | { status: 'completed'; detail?: Record<string, unknown> }
  | { status: 'skipped'; reason: string; detail?: Record<string, unknown> };

export type JobHandler = (context: {
  jobId: string;
  name: RuntimeJobName;
  scheduledFor: Date;
}) => Promise<JobOutcome>;

export type RuntimeJobHandlers = Partial<Record<RuntimeJobName, JobHandler>>;

export interface TradingCalendarPort {
  isTradingDay(date: string): Promise<boolean>;
}

export type RuntimeJobSchedule = {
  name: RuntimeJobName;
  description: string;
  pattern?: string;
  everyMs?: number;
  tradingDay: boolean;
  enabled: boolean;
};

export type JobExecutionStatus = {
  jobId: string;
  name: RuntimeJobName;
  state: 'queued' | 'active' | 'completed' | 'skipped' | 'failed';
  requestedBy?: string;
  scheduledFor: string;
  startedAt?: string;
  finishedAt?: string;
  reason?: string;
  errorCode?: string;
  detail?: Record<string, unknown>;
};

export type JobDescriptor = RuntimeJobSchedule & {
  handlerRegistered: boolean;
  nextRunAt?: string;
};

export type RuntimeOptions = {
  enabled: boolean;
  consumeJobs: boolean;
  handlers: RuntimeJobHandlers;
  calendar: TradingCalendarPort;
  schedules?: readonly RuntimeJobSchedule[];
  registeredJobNames?: readonly RuntimeJobName[];
  concurrency?: number;
};

export const RUNTIME_OPTIONS = Symbol('RUNTIME_OPTIONS');
export const IQX_JOBS_SERVICE = 'IQX_JOBS_SERVICE';
