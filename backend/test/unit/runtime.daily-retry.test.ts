import { describe, expect, it, vi } from 'vitest';

import {
  isDailyRetryDue,
  isReportDue,
  DomainRuntimeJobs,
} from '../../src/platform/domain-runtime.module.js';

describe('daily report retry cutoff', () => {
  it('does not generate before the 17:00 ICT close', () => {
    expect(isDailyRetryDue(new Date('2026-09-21T09:59:59.999Z'))).toBe(false);
    expect(isDailyRetryDue(new Date('2026-09-21T10:00:00.000Z'))).toBe(true);
  });

  it('limits retries to live snapshot windows, including exact endpoints and midnight', () => {
    expect(isReportDue(new Date('2026-09-21T00:14:59.999Z'), 'premarket')).toBe(false);
    expect(isReportDue(new Date('2026-09-21T00:15:00.000Z'), 'premarket')).toBe(true);
    expect(isReportDue(new Date('2026-09-21T01:59:59.999Z'), 'premarket')).toBe(true);
    expect(isReportDue(new Date('2026-09-21T02:00:00.000Z'), 'premarket')).toBe(false);
    expect(isReportDue(new Date('2026-09-21T04:29:59.999Z'), 'midday')).toBe(false);
    expect(isReportDue(new Date('2026-09-21T04:30:00.000Z'), 'midday')).toBe(true);
    expect(isReportDue(new Date('2026-09-21T05:59:59.999Z'), 'midday')).toBe(true);
    expect(isReportDue(new Date('2026-09-21T06:00:00.000Z'), 'midday')).toBe(false);
    expect(isReportDue(new Date('2026-09-21T17:00:00.000Z'), 'premarket')).toBe(false);
    expect(isReportDue(new Date('2026-09-21T17:00:00.000Z'), 'midday')).toBe(false);
  });

  it('skips outside windows without querying or generating a report', async () => {
    const query = vi.fn();
    const capture = vi.fn();
    const generate = vi.fn();
    const jobs = new DomainRuntimeJobs(
      { query } as never,
      { generate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { capture } as never,
    );
    const handlers = jobs.handlers();
    await expect(
      handlers['reports.premarket']!({
        jobId: 'premarket',
        name: 'reports.premarket',
        scheduledFor: new Date('2026-09-21T02:00:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'outside-premarket-window' });
    await expect(
      handlers['reports.midday']!({
        jobId: 'midday',
        name: 'reports.midday',
        scheduledFor: new Date('2026-09-21T06:00:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'outside-midday-window' });
    expect(query).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('journey.identity-recovery', () => {
  it('casts the reused status parameter so PostgreSQL can deduce one type', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('from cap6_progress')
        ? [
            {
              user_id: 'u1',
              window_start: '2026-01-01T00:00:00Z',
              window_end: '2026-02-01T00:00:00Z',
            },
          ]
        : [],
    );
    const jobs = new DomainRuntimeJobs(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await jobs.handlers()['journey.identity-recovery']!({
      scheduledFor: '2026-02-01T00:00:00Z',
    } as never);
    const upsert = query.mock.calls.find(([sql]) =>
      sql.includes('insert into bot_mascot_profiles'),
    );
    expect(upsert?.[0]).toContain('$3::varchar,');
    expect(upsert?.[0]).toContain("case when $3::varchar='assigned'");
  });
});
