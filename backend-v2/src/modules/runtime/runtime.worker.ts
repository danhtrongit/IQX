import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type IRedisClient, type Job, type Queue } from 'bullmq';

import { JobsService } from './jobs.service.js';
import { RuntimeStatusStore } from './runtime.status-store.js';
import {
  RUNTIME_OPTIONS,
  RUNTIME_QUEUE,
  type JobOutcome,
  type RuntimeJobName,
  type RuntimeOptions,
} from './runtime.types.js';

function ictDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

@Injectable()
export class RuntimeWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RuntimeWorker.name);
  private worker: Worker | undefined;
  private queue: Queue | undefined;
  private workerConnection: IRedisClient | undefined;

  constructor(
    @Inject(RUNTIME_OPTIONS) private readonly options: RuntimeOptions,
    private readonly jobs: JobsService,
    private readonly statuses: RuntimeStatusStore,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.options.enabled && this.options.consumeJobs) await this.start();
  }

  async start(): Promise<void> {
    if (this.worker || !this.options.consumeJobs) return;
    this.queue = await this.jobs.queueForRuntime();
    await this.installSchedules(this.queue);
    await this.queue.waitUntilReady();
    const queueClient = await this.queue.getBackend().client;
    const connection = queueClient.duplicate({ maxRetriesPerRequest: null });
    this.workerConnection = connection;
    this.worker = new Worker(RUNTIME_QUEUE, (job) => this.process(job), {
      connection,
      prefix: this.queue.opts.prefix,
      concurrency: this.options.concurrency ?? 4,
    });
    this.worker.on('error', (error) => this.logger.error(`Runtime worker error: ${error.name}`));
  }

  async stop(): Promise<void> {
    const worker = this.worker;
    const connection = this.workerConnection;
    this.worker = undefined;
    this.workerConnection = undefined;
    await worker?.close();
    if (connection) {
      try {
        await connection.quit();
      } catch {
        connection.disconnect(false);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  private async installSchedules(queue: Queue): Promise<void> {
    for (const schedule of this.options.schedules ?? []) {
      if (!schedule.enabled) {
        await queue.removeJobScheduler(schedule.name);
        continue;
      }
      const repeat = schedule.pattern
        ? { pattern: schedule.pattern, tz: 'Asia/Ho_Chi_Minh' }
        : { every: schedule.everyMs as number };
      await queue.upsertJobScheduler(schedule.name, repeat, {
        name: schedule.name,
        data: { scheduler: schedule.name },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
      });
    }
  }

  private async process(job: Job): Promise<JobOutcome> {
    const name = this.jobs.jobName(job);
    const scheduledFor = new Date(
      typeof job.data?.scheduledFor === 'string' ? job.data.scheduledFor : job.timestamp,
    );
    const statusBase = {
      jobId: job.id ?? `${name}-${job.timestamp}`,
      name,
      scheduledFor: scheduledFor.toISOString(),
      ...(typeof job.data?.requestedBy === 'string' ? { requestedBy: job.data.requestedBy } : {}),
    };
    await this.statuses.put({
      ...statusBase,
      state: 'active',
      startedAt: new Date().toISOString(),
    });
    try {
      const schedule = (this.options.schedules ?? []).find((item) => item.name === name);
      let outcome: JobOutcome;
      if (!schedule?.enabled) {
        outcome = { status: 'skipped', reason: 'job-disabled' };
      } else if (
        schedule.tradingDay &&
        !(await this.options.calendar.isTradingDay(ictDate(scheduledFor)))
      ) {
        outcome = { status: 'skipped', reason: 'market-closed' };
      } else {
        const handler = this.options.handlers[name];
        outcome = handler
          ? await handler({ jobId: statusBase.jobId, name: name as RuntimeJobName, scheduledFor })
          : { status: 'skipped', reason: 'handler-not-registered' };
      }
      await this.statuses.put({
        ...statusBase,
        state: outcome.status,
        finishedAt: new Date().toISOString(),
        ...(outcome.status === 'skipped' ? { reason: outcome.reason } : {}),
        detail: outcome.detail,
      });
      return outcome;
    } catch (error) {
      await this.statuses.put({
        ...statusBase,
        state: 'failed',
        finishedAt: new Date().toISOString(),
        errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      });
      throw error;
    }
  }
}
