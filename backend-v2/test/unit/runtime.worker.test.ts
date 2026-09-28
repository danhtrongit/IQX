import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { RuntimeWorker, scheduledForJob } from '../../src/modules/runtime/runtime.worker.js';
import type { RuntimeOptions } from '../../src/modules/runtime/runtime.types.js';

const monday = Date.parse('2026-09-28T00:15:00.000Z'); // 07:15 ICT Monday
const sundayCreated = Date.parse('2026-09-27T04:08:54.237Z');

function schedulerJob(overrides: Record<string, unknown> = {}): Job {
  return {
    id: `repeat:reports.premarket:${monday}`,
    name: 'reports.premarket',
    data: { scheduler: 'reports.premarket' },
    repeatJobKey: 'reports.premarket',
    timestamp: sundayCreated,
    opts: { prevMillis: monday, delay: monday - sundayCreated },
    ...overrides,
  } as unknown as Job;
}

describe('RuntimeWorker scheduled occurrence', () => {
  it('uses BullMQ prevMillis for cron scheduler jobs', () => {
    expect(scheduledForJob(schedulerJob()).toISOString()).toBe('2026-09-28T00:15:00.000Z');
  });

  it('uses repeat ID due time when interval scheduler jobs omit prevMillis', () => {
    expect(
      scheduledForJob(schedulerJob({ opts: { delay: monday - sundayCreated } })).getTime(),
    ).toBe(monday);
  });

  it('uses the enqueue delay for old scheduler jobs without an occurrence ID', () => {
    expect(
      scheduledForJob(
        schedulerJob({ id: 'old-job', opts: { delay: monday - sundayCreated } }),
      ).getTime(),
    ).toBe(monday);
  });

  it('preserves an explicit manual scheduledFor and ordinary job timestamps', () => {
    const manual = schedulerJob({
      data: { scheduledFor: '2026-09-28T04:00:00.000Z' },
    });
    expect(scheduledForJob(manual).toISOString()).toBe('2026-09-28T04:00:00.000Z');
    expect(
      scheduledForJob(schedulerJob({ data: {}, repeatJobKey: undefined, opts: {} })).getTime(),
    ).toBe(sundayCreated);
  });

  it('checks the Monday trading date and passes the Monday occurrence to its handler', async () => {
    const isTradingDay = vi.fn().mockResolvedValue(true);
    const handler = vi.fn().mockResolvedValue({ status: 'completed' });
    const statuses = { put: vi.fn().mockResolvedValue(undefined) };
    const options: RuntimeOptions = {
      enabled: true,
      consumeJobs: true,
      handlers: { 'reports.premarket': handler },
      calendar: { isTradingDay },
      schedules: [
        {
          name: 'reports.premarket',
          description: 'report',
          tradingDay: true,
          enabled: true,
          everyMs: 900_000,
        },
      ],
    };
    const worker = new RuntimeWorker(
      options,
      { jobName: () => 'reports.premarket' } as never,
      statuses as never,
    );

    await expect(
      worker['process'](schedulerJob({ opts: { delay: monday - sundayCreated } })),
    ).resolves.toMatchObject({ status: 'completed' });
    expect(isTradingDay).toHaveBeenCalledWith('2026-09-28');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledFor: new Date(monday),
      }),
    );
    expect(statuses.put).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledFor: '2026-09-28T00:15:00.000Z',
        state: 'completed',
      }),
    );
  });
});
