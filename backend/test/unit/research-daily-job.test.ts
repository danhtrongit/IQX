// research.reports-sync scheduled job: feature flag gate and the VN calendar date handed to sync (spec §7.3).
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { Environment } from '../../src/platform/config/environment.js';
import { ResearchDailyJob } from '../../src/modules/research/research-daily.job.js';
import type { ResearchSyncService } from '../../src/modules/research/research-sync.service.js';

function make(enabled: boolean) {
  const sync = { sync: vi.fn(async () => ({ listed: 3, downloaded: 2 })) };
  const config = { get: vi.fn(() => enabled) } as unknown as ConfigService<Environment, true>;
  const job = new ResearchDailyJob(config, sync as unknown as ResearchSyncService);
  return { job, sync, config };
}

describe('ResearchDailyJob', () => {
  it('RESEARCH_INSIGHT_ENABLED=false -> skipped, sync never called', async () => {
    const { job, sync, config } = make(false);
    await expect(job.run(new Date('2026-10-13T00:00:00Z'))).resolves.toEqual({ skipped: 'feature_disabled' });
    expect(sync.sync).not.toHaveBeenCalled();
    expect(config.get).toHaveBeenCalledWith('RESEARCH_INSIGHT_ENABLED', { infer: true });
  });

  it('RESEARCH_INSIGHT_ENABLED=true -> calls sync with today in Ho Chi Minh and returns its result', async () => {
    const { job, sync } = make(true);
    await expect(job.run(new Date('2026-10-13T05:00:00Z'))).resolves.toEqual({ listed: 3, downloaded: 2 });
    expect(sync.sync).toHaveBeenCalledExactlyOnceWith({ today: '2026-10-13' });
  });

  it('uses the VN date, not the UTC one: 20:00 UTC is already the next day in Vietnam', async () => {
    const { job, sync } = make(true);
    await job.run(new Date('2026-10-13T20:00:00Z'));
    expect(sync.sync).toHaveBeenCalledWith({ today: '2026-10-14' });
  });

  it('a sync failure propagates to the scheduler', async () => {
    const { job, sync } = make(true);
    sync.sync.mockRejectedValueOnce(new Error('source down'));
    await expect(job.run(new Date('2026-10-13T05:00:00Z'))).rejects.toThrow('source down');
  });
});
