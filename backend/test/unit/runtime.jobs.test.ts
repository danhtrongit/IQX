import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobsService } from '../../src/modules/runtime/jobs.service.js';
import {
  defaultRuntimeSchedules,
  WeekdayCalendar,
} from '../../src/modules/runtime/runtime.schedules.js';
import { RUNTIME_JOB_NAMES, type RuntimeOptions } from '../../src/modules/runtime/runtime.types.js';

describe('JobsService producer mode', () => {
  afterEach(() => vi.useRealTimers());

  it('lazily opens the producer queue and enqueues an allowlisted job', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'manual-reports.daily-test' }),
      getJobSchedulers: vi.fn().mockResolvedValue([]),
    };
    const queues = { createQueue: vi.fn().mockResolvedValue(queue) };
    const statuses = { putIfAbsent: vi.fn().mockResolvedValue(true), get: vi.fn() };
    const options: RuntimeOptions = {
      enabled: true,
      consumeJobs: false,
      handlers: {},
      registeredJobNames: RUNTIME_JOB_NAMES,
      calendar: new WeekdayCalendar(),
      schedules: defaultRuntimeSchedules(),
      concurrency: 4,
    };
    const service = new JobsService(options, queues as never, statuses as never);

    await expect(service.runNow('reports.daily', 'admin-id')).resolves.toMatchObject({
      name: 'reports.daily',
      state: 'queued',
    });
    expect(queues.createQueue).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
    expect(statuses.putIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ state: 'queued' }));
    await expect(service.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'reports.daily', handlerRegistered: true }),
      ]),
    );
  });

  it('uses one deterministic job id per requester and 30-second window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:29.999Z'));
    const queue = {
      add: vi.fn(async (_name, _data, options) => ({ id: options.jobId })),
    };
    const statuses = { putIfAbsent: vi.fn().mockResolvedValue(true), get: vi.fn() };
    const service = new JobsService(
      { enabled: true, consumeJobs: false, handlers: {}, calendar: new WeekdayCalendar() },
      { createQueue: vi.fn().mockResolvedValue(queue) } as never,
      statuses as never,
    );

    const first = await service.runNow('reports.daily', 'admin@example.com');
    const duplicate = await service.runNow('reports.daily', 'admin@example.com');
    expect(duplicate.jobId).toBe(first.jobId);
    expect(first.jobId).toMatch(/^manual-reports\.daily-adminexamplecom-\d+$/);

    vi.advanceTimersByTime(1);
    const nextWindow = await service.runNow('reports.daily', 'admin@example.com');
    expect(nextWindow.jobId).not.toBe(first.jobId);
  });

  it('rejects arbitrary queue job names', async () => {
    const service = new JobsService(
      { enabled: true, consumeJobs: false, handlers: {}, calendar: new WeekdayCalendar() },
      { createQueue: vi.fn() } as never,
      { putIfAbsent: vi.fn(), get: vi.fn() } as never,
    );
    await expect(service.runNow('shell.exec' as never)).rejects.toMatchObject({
      status: 404,
      response: { code: 'RUNTIME_JOB_NOT_FOUND' },
    });
  });

  it('returns a controlled unavailable response for a disabled runtime', async () => {
    const queues = { createQueue: vi.fn() };
    const service = new JobsService(
      { enabled: false, consumeJobs: false, handlers: {}, calendar: new WeekdayCalendar() },
      queues as never,
      { putIfAbsent: vi.fn(), get: vi.fn() } as never,
    );
    await expect(service.runNow('reports.daily')).rejects.toMatchObject({
      status: 503,
      response: { code: 'RUNTIME_DISABLED' },
    });
    expect(queues.createQueue).not.toHaveBeenCalled();
  });
});
