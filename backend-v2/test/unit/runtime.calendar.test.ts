import { describe, expect, it, vi } from 'vitest';

import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';

function jobsWithHolidays(holidays: unknown): DomainRuntimeJobs {
  const database = { query: vi.fn().mockResolvedValue([{ holidays }]) };
  return new DomainRuntimeJobs(
    database as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('runtime trading calendar', () => {
  it('accepts the nullable holidays field in the default trading config', async () => {
    const jobs = jobsWithHolidays(null);
    await expect(jobs.isTradingDay('2026-09-21')).resolves.toBe(true);
    await expect(jobs.isTradingDay('2026-09-20')).resolves.toBe(false);
  });

  it('honors a JSON holiday array and rejects malformed configuration', async () => {
    await expect(jobsWithHolidays('["2026-09-21"]').isTradingDay('2026-09-21')).resolves.toBe(
      false,
    );
    await expect(jobsWithHolidays('{}').isTradingDay('2026-09-21')).rejects.toThrow(
      'Active trading calendar holidays must be an array',
    );
  });
});
