import { afterEach, describe, expect, it, vi } from 'vitest';

import { RUNTIME_JOB_NAMES } from '../../src/modules/runtime/runtime.types.js';
import { defaultRuntimeSchedules } from '../../src/modules/runtime/runtime.schedules.js';
import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';

function jobs(strategyAlerts?: { evaluateSession: ReturnType<typeof vi.fn> }) {
  return new DomainRuntimeJobs(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    strategyAlerts as never,
  );
}

const tick = (iso: string) => ({
  jobId: 'job',
  name: 'alerts.eod-evaluate' as const,
  scheduledFor: new Date(iso),
});

describe('alerts.eod-evaluate schedule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is a registered job that ticks every 15 minutes on trading days, separate from the legacy scan', () => {
    expect(RUNTIME_JOB_NAMES).toContain('alerts.eod-evaluate');
    const schedules = defaultRuntimeSchedules();
    expect(schedules.find((item) => item.name === 'alerts.eod-evaluate')).toMatchObject({
      everyMs: 900_000,
      tradingDay: true,
      enabled: true,
    });
    // The legacy Telegram scan keeps its own schedule and flag: no second scheduler for old rules.
    expect(schedules.filter((item) => item.name === 'alerts.scan')).toHaveLength(1);
    expect(schedules.find((item) => item.name === 'alerts.scan')?.everyMs).toBe(600_000);
  });

  it('can be switched off with the per-job flag', () => {
    vi.stubEnv('JOB_ALERTS_EOD_EVALUATE_ENABLED', 'false');
    expect(
      defaultRuntimeSchedules().find((item) => item.name === 'alerts.eod-evaluate')?.enabled,
    ).toBe(false);
  });
});

describe('alerts.eod-evaluate handler', () => {
  it('waits for the 15:45 Asia/Ho_Chi_Minh readiness gate and never touches the data before', async () => {
    const evaluateSession = vi.fn();
    const handler = jobs({ evaluateSession }).handlers()['alerts.eod-evaluate']!;
    // 08:44Z = 15:44 ICT.
    await expect(handler(tick('2026-09-21T08:44:00.000Z'))).resolves.toEqual({
      status: 'skipped',
      reason: 'before-daily-data-complete',
    });
    expect(evaluateSession).not.toHaveBeenCalled();
  });

  it('evaluates the ICT date of the tick once the gate is open and reports the summary', async () => {
    const summary = { session: '2026-09-21', alerts: 2, events_created: 1 };
    const evaluateSession = vi.fn().mockResolvedValue(summary);
    const handler = jobs({ evaluateSession }).handlers()['alerts.eod-evaluate']!;
    await expect(handler(tick('2026-09-21T09:00:00.000Z'))).resolves.toEqual({
      status: 'completed',
      detail: summary,
    });
    expect(evaluateSession).toHaveBeenCalledWith('2026-09-21', expect.any(Date));
  });

  it('A17 is skipped, not completed, while the daily data of the session is not complete', async () => {
    const summary = { session: '2026-09-21', skipped: 'daily_data_not_ready' };
    const evaluateSession = vi.fn().mockResolvedValue(summary);
    const handler = jobs({ evaluateSession }).handlers()['alerts.eod-evaluate']!;
    await expect(handler(tick('2026-09-21T09:30:00.000Z'))).resolves.toMatchObject({
      status: 'skipped',
      reason: 'daily_data_not_ready',
      detail: summary,
    });
  });

  it('skips safely when the evaluator is not wired', async () => {
    const handler = jobs().handlers()['alerts.eod-evaluate']!;
    await expect(handler(tick('2026-09-21T09:30:00.000Z'))).resolves.toEqual({
      status: 'skipped',
      reason: 'strategy-alerts-unavailable',
    });
  });
});
