import { afterEach, describe, expect, it, vi } from 'vitest';

import { definitionHash } from '../../src/modules/alerts/strategy-alerts.evaluation.js';
import { StrategyAlertEvaluator } from '../../src/modules/alerts/strategy-alerts.evaluator.js';
import type {
  HistoricalBars,
  QuantMarketDataProvider,
} from '../../src/modules/quant/quant.types.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  configHash,
  defaultConfig,
  type IndicatorConfig,
  type RowSideConfig,
  type SharedConfig,
} from '../../src/modules/quant/v2/index.js';
import { RUNTIME_JOB_NAMES } from '../../src/modules/runtime/runtime.types.js';
import { defaultRuntimeSchedules } from '../../src/modules/runtime/runtime.schedules.js';
import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';
import { MemoryAlertStore } from './helpers/strategy-alerts-memory.js';
import { preV3Config } from './helpers/strategy-pre-v3.js';

function jobs(strategyAlerts?: { evaluateSession: unknown }) {
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

  describe('with the real evaluator and alerts pinned before SPEC V3', () => {
    const SESSION = '2026-09-21';
    const USER = '00000000-0000-4000-8000-0000000000a1';
    const day = (i: number): string =>
      new Date(Date.UTC(2026, 8, 21 - 5 + i)).toISOString().slice(0, 10);
    const closes = [10, 10, 10, 10, 10, 12]; // day(5) = SESSION

    const market: QuantMarketDataProvider = {
      getHistoricalOhlcv: (_symbol, _start, end): Promise<HistoricalBars> =>
        Promise.resolve({
          records: closes
            .map((close, i) => ({
              time: day(i),
              open: close,
              high: close + 1,
              low: close - 1,
              close,
              volume: 1000,
            }))
            .filter((row) => row.time <= end),
          startIndex: 0,
          source: 'fake-feed',
        }),
    };

    const seed = (store: MemoryAlertStore, name: string, config: SharedConfig) =>
      store.create({
        user_id: USER,
        name,
        enabled: true,
        version: {
          source: {
            kind: 'shared_config',
            revision: 1,
            saved_at: '2026-01-01T00:00:00Z',
            stored_config_hash: configHash(config),
          },
          config,
          config_hash: configHash(config),
          schema_version: SCHEMA_VERSION,
          rule_version: RULE_VERSION,
          calculation_version: 'iqx-ta-2.0',
          scope: { kind: 'symbols' },
          symbols: ['FPT'],
          sides: ['buy'],
          definition_hash: definitionHash({
            config_hash: configHash(config),
            symbols: ['FPT'],
            sides: ['buy'],
            scope: { kind: 'symbols' },
          }),
        },
        idempotency_key: null,
        request_hash: 'h'.repeat(64),
      });

    it('completes the job: the outdated version is blocked, the current one is still judged', async () => {
      const store = new MemoryAlertStore();
      const current = defaultConfig();
      const ma = current.indicators.ma as IndicatorConfig;
      ma.master_enabled = true;
      ma.buy.enabled = true;
      (ma.buy as RowSideConfig).rules[0]!.period = 5;
      const outdated = await seed(store, 'Cũ', preV3Config() as unknown as SharedConfig);
      const fresh = await seed(store, 'Mới', current);
      const evaluator = new StrategyAlertEvaluator(
        store,
        { grantedCapabilities: () => Promise.resolve(new Set(['indicator:ma'])) },
        market,
      );
      const handler = jobs(evaluator).handlers()['alerts.eod-evaluate']!;

      const result = await handler(tick(`${SESSION}T09:00:00.000Z`));
      expect(result).toMatchObject({
        status: 'completed',
        detail: {
          session: SESSION,
          alerts: 2,
          pairs_evaluated: 2,
          results: { true: 1, false: 0, unknown: 1 },
          events_created: 1,
          errors: 0,
        },
      });
      expect(store.events.map((event) => event.alert_id)).toEqual([fresh.id]);
      const summaries = await store.stateSummaries([outdated.id, fresh.id]);
      expect(summaries.find((item) => item.alert_id === outdated.id)).toMatchObject({
        blocked_count: 1,
      });
      expect(summaries.find((item) => item.alert_id === fresh.id)).toMatchObject({
        blocked_count: 0,
        true_count: 1,
      });
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
