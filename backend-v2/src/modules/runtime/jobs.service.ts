import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { QueueService } from '../../platform/queue/queue.service.js';
import { RuntimeStatusStore } from './runtime.status-store.js';
import {
  RUNTIME_JOB_NAMES,
  RUNTIME_OPTIONS,
  RUNTIME_QUEUE,
  type JobDescriptor,
  type JobExecutionStatus,
  type RuntimeJobName,
  type RuntimeOptions,
} from './runtime.types.js';

const JOB_NAMES = new Set<string>(RUNTIME_JOB_NAMES);

@Injectable()
export class JobsService {
  private queue: Queue | undefined;

  constructor(
    @Inject(RUNTIME_OPTIONS) private readonly options: RuntimeOptions,
    private readonly queues: QueueService,
    private readonly statuses: RuntimeStatusStore,
  ) {}

  bindQueue(queue: Queue): void {
    this.queue = queue;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  async list(): Promise<JobDescriptor[]> {
    const schedules = this.options.schedules ?? [];
    const schedulerRuns = new Map<string, string>();
    if (this.options.enabled && !this.queue) await this.queueForRuntime();
    if (this.queue) {
      const schedulers = await this.queue.getJobSchedulers(0, 100, true);
      for (const scheduler of schedulers) {
        if (scheduler.next)
          schedulerRuns.set(scheduler.key, new Date(scheduler.next).toISOString());
      }
    }
    return schedules.map((schedule) => ({
      ...schedule,
      handlerRegistered:
        Boolean(this.options.handlers[schedule.name]) ||
        Boolean(this.options.registeredJobNames?.includes(schedule.name)),
      nextRunAt: schedulerRuns.get(schedule.name),
    }));
  }

  async runNow(
    name: RuntimeJobName,
    requestedBy?: string,
  ): Promise<{ jobId: string; name: RuntimeJobName; state: 'queued' }> {
    this.assertName(name);
    if (!this.options.enabled) {
      throw new ServiceUnavailableException({
        code: 'RUNTIME_DISABLED',
        message: 'Runtime worker is disabled',
      });
    }
    const queue = this.queue ?? (await this.queueForRuntime());
    const scheduledFor = new Date();
    const requestScope = (requestedBy ?? 'system').replaceAll(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const bucket = Math.floor(scheduledFor.getTime() / 30_000);
    const jobId = `manual-${name}-${requestScope}-${bucket}`;
    const job = await queue.add(
      name,
      { scheduledFor: scheduledFor.toISOString(), requestedBy },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 2_000,
      },
    );
    await this.statuses.putIfAbsent({
      jobId: job.id ?? jobId,
      name,
      state: 'queued',
      requestedBy,
      scheduledFor: scheduledFor.toISOString(),
    });
    return { jobId: job.id ?? jobId, name, state: 'queued' };
  }

  async getStatus(jobId: string): Promise<JobExecutionStatus | null> {
    return this.statuses.get(jobId);
  }

  async queueForRuntime(): Promise<Queue> {
    if (!this.options.enabled) throw new ServiceUnavailableException('Runtime worker is disabled');
    const queue = await this.queues.createQueue(RUNTIME_QUEUE, {
      defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 2_000 },
    });
    this.bindQueue(queue);
    return queue;
  }

  jobName(job: Job): RuntimeJobName {
    this.assertName(job.name);
    return job.name;
  }

  private assertName(name: string): asserts name is RuntimeJobName {
    if (!JOB_NAMES.has(name)) {
      throw new NotFoundException({
        code: 'RUNTIME_JOB_NOT_FOUND',
        message: 'Unknown runtime job',
      });
    }
  }
}
