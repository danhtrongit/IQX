import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { PracticeEnabledGuard } from '../../src/modules/practice/practice-enabled.guard.js';
import {
  OUTDATED_RUN_ERROR,
  defaultPracticeConfig,
  practiceEntry,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import * as contracts from '../../src/modules/practice/practice.schemas.js';
import {
  draftBodySchema,
  draftResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  indicatorIdParamSchema,
  indicatorsResponseSchema,
  nextBodySchema,
  previewBodySchema,
  previewResponseSchema,
  runIdParamSchema,
  runViewSchema,
  startRunBodySchema,
  stateResponseSchema,
} from '../../src/modules/practice/practice.schemas.js';
import { PracticeService } from '../../src/modules/practice/practice.service.js';
import { loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import type {
  PracticeParamsConfig,
  PracticeRowsConfig,
} from '../../src/modules/practice/practice.types.js';
import type { Environment } from '../../src/platform/config/environment.js';
import {
  FakeDataPort,
  MemoryPracticeStore,
  USER,
  addPreV3Run,
  newKey,
  preV3Config,
  tradingRsiConfig,
} from './practice-fixtures.js';

const set = loadPracticeSet();

const rowsDefaults = (id: string) =>
  defaultPracticeConfig(practiceEntry(id)!) as PracticeRowsConfig;

function build(indicators: readonly string[] = PRACTICE_INDICATOR_IDS) {
  const store = new MemoryPracticeStore();
  const grants: AcademyGrantsPort = {
    grantedCapabilities: async () => new Set(indicators.map((id) => `indicator:${id}`)),
  };
  const service = new PracticeService(store, grants, new FakeDataPort(set), set);
  return { store, service };
}

describe('practice API contracts', () => {
  const uuid = '00000000-0000-4000-8000-000000000009';
  const config = rowsDefaults('rsi');
  const volume = defaultPracticeConfig(practiceEntry('volume')!) as PracticeParamsConfig;

  it('validates request bodies strictly', () => {
    const start = { idempotency_key: 'a-valid-key', ordinal: 1, case_id: uuid, config };
    expect(startRunBodySchema.safeParse(start).success).toBe(true);
    // the defaults of all 16 indicators (15 row-based + Volume) are valid bodies
    for (const id of PRACTICE_INDICATOR_IDS) {
      const defaults = defaultPracticeConfig(practiceEntry(id)!);
      expect(startRunBodySchema.safeParse({ ...start, config: defaults }).success, id).toBe(true);
      expect(draftBodySchema.safeParse({ expected_revision: 1, draft: defaults }).success, id).toBe(
        true,
      );
    }
    const row = config.buy.rules[0]!;
    for (const patch of [
      { ordinal: 0 },
      { ordinal: 31 },
      { ordinal: 1.5 },
      { case_id: 'not-a-uuid' },
      { idempotency_key: 'short' },
      { symbol: 'ACB' },
      { config: { ...config, extra: true } },
      { config: { ...config, hold_max_sessions: '60' } },
      // a rows tab does not take params/ops (the pre-V3 fields) next to its rules
      { config: { ...config, buy: { ...config.buy, ops: { r1: '=' } } } },
      { config: { ...config, buy: { ...config.buy, params: { period: 14 } } } },
      // a tab needs its switch and its rules, as an array of at most 8 rows
      { config: { ...config, buy: { enabled: true } } },
      { config: { ...config, buy: { rules: config.buy.rules } } },
      { config: { ...config, buy: { ...config.buy, rules: 'rows' } } },
      {
        config: { ...config, buy: { ...config.buy, rules: Array.from({ length: 9 }, () => row) } },
      },
      // a row needs its id and its own switch; values are numbers, codes or booleans only
      { config: { ...config, buy: { ...config.buy, rules: [{ id: 'rsi.level', period: 14 }] } } },
      { config: { ...config, buy: { ...config.buy, rules: [{ enabled: true, period: 14 }] } } },
      {
        config: { ...config, buy: { ...config.buy, rules: [{ ...row, period: { value: 14 } }] } },
      },
      { config: { ...config, buy: { ...config.buy, rules: [{ ...row, period: Number.NaN }] } } },
      {
        config: {
          ...config,
          buy: { ...config.buy, rules: [{ ...row, op: 'x'.repeat(33) }] },
        },
      },
      // Volume keeps its params shape and its operator list
      { config: { ...volume, buy: { ...volume.buy, ops: { r1: '=' } } } },
      { config: { ...volume, buy: { ...volume.buy, rules_enabled: { r1: 'yes' } } } },
    ]) {
      expect(
        startRunBodySchema.safeParse({ ...start, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
    // the pre-V3 shape still parses (as the params shape): rejecting it with a readable message
    // for the indicator is the service's job, not a bare schema error (see the service tests)
    expect(startRunBodySchema.safeParse({ ...start, config: preV3Config() }).success).toBe(true);

    expect(
      nextBodySchema.safeParse({ expected_cursor: 3, idempotency_key: 'next-key-1' }).success,
    ).toBe(true);
    expect(
      nextBodySchema.safeParse({ expected_cursor: 31, idempotency_key: 'next-key-1' }).success,
    ).toBe(false);
    expect(nextBodySchema.safeParse({ expected_cursor: 3 }).success).toBe(false);
    expect(draftBodySchema.safeParse({ expected_revision: 1, draft: config }).success).toBe(true);
    expect(draftBodySchema.safeParse({ expected_revision: 0, draft: config }).success).toBe(false);
    expect(historyQuerySchema.parse({})).toEqual({ page: 1, page_size: 30 });
    expect(historyQuerySchema.safeParse({ page_size: '500' }).success).toBe(false);
    expect(indicatorIdParamSchema.safeParse('rsi').success).toBe(true);
    expect(indicatorIdParamSchema.safeParse('../etc').success).toBe(false);
    expect(runIdParamSchema.safeParse(uuid).success).toBe(true);
    expect(runIdParamSchema.safeParse('1').success).toBe(false);
  });

  it('validates the preview body: rows for the 15 indicators, params for Volume', () => {
    const rows = config.buy.rules;
    expect(previewBodySchema.safeParse({}).success).toBe(false);
    expect(previewBodySchema.safeParse({ buy_rows: rows }).success).toBe(true);
    expect(previewBodySchema.safeParse({ sell_rows: rows }).success).toBe(true);
    expect(previewBodySchema.safeParse({ buy_rows: rows, sell_rows: rows }).success).toBe(true);
    expect(previewBodySchema.safeParse({ buy_params: { lookback: 20, mult: 1 } }).success).toBe(
      true,
    );
    expect(previewBodySchema.safeParse({ sell_params: { mult: 1.5 } }).success).toBe(true);
    for (const body of [
      { buy_rows: 'rows' },
      { buy_rows: [{ id: 'rsi.level', period: 14 }] }, // no row switch
      { buy_rows: [{ ...rows[0]!, period: Number.NaN }] },
      { buy_rows: Array.from({ length: 9 }, () => rows[0]) },
      { buy_params: { lookback: Number.NaN } },
      { buy_params: { lookback: '20' } },
      { buy_rows: rows, symbol: 'ACB' },
      { buy_rows: rows, buy: { enabled: true } },
    ]) {
      expect(previewBodySchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('converts every contract to OpenAPI 3.0 and builds the controller', async () => {
    const exported: Array<[string, unknown]> = Object.entries(contracts);
    const schemas = exported.flatMap(([name, value]) =>
      value instanceof z.ZodType ? [[name, value] as const] : [],
    );
    expect(schemas.length).toBeGreaterThanOrEqual(15);
    for (const [name, schema] of schemas) {
      expect(() => z.toJSONSchema(schema, { target: 'openapi-3.0' }), name).not.toThrow();
    }
    // the response schema documents both condition models and the stored run error
    const state = JSON.stringify(z.toJSONSchema(stateResponseSchema, { target: 'openapi-3.0' }));
    expect(state).toContain('"rows"');
    expect(state).toContain('"legacy_params"');
    expect(state).toContain('"sentence"');
    expect(state).toContain('"rules_enabled"');
    const body = JSON.stringify(z.toJSONSchema(startRunBodySchema, { target: 'openapi-3.0' }));
    expect(body).toContain('"rules"');
    // the controller turns these into the OpenAPI document when its class is defined
    await expect(
      import('../../src/modules/practice/practice.controller.js'),
    ).resolves.toMatchObject({
      PracticeController: expect.any(Function),
    });
  });

  it('matches the documented response schemas for every endpoint payload', async () => {
    const { store, service } = build();

    const list = await service.listIndicators(USER);
    expect(indicatorsResponseSchema.parse(list)).toBeTruthy();
    const state = await service.state(USER, 'rsi');
    expect(stateResponseSchema.parse(state)).toBeTruthy();
    const sellRows = rowsDefaults('rsi').sell.rules.map((row) => ({ ...row }));
    Object.assign(sellRows[0]!, { period: 9, threshold: 70 });
    const preview = await service.preview(USER, 'rsi', { sell_rows: sellRows });
    expect(previewResponseSchema.parse(preview)).toBeTruthy();
    // a config that trades on every case, whatever its random order
    const draft = await service.saveDraft(USER, 'rsi', {
      expected_revision: 1,
      draft: tradingRsiConfig(25),
    });
    expect(draftResponseSchema.parse(draft)).toBeTruthy();
    const run = await service.startRun(USER, 'rsi', {
      idempotency_key: newKey(),
      ordinal: 1,
      case_id: state.case.case_id,
      config: draft.draft,
    });
    const parsedRun = runViewSchema.parse(run);
    expect(parsedRun.result!.trades.length).toBeGreaterThan(0);
    // the evidence of a row-based run carries the row id, its sentence and its own values
    expect(parsedRun.result!.trades[0]!.buy.evidence.rules[0]).toMatchObject({
      rule_id: 'rsi.level',
      label: 'RSI 14 > 0',
      values: { period: 14, op: '>', threshold: 0 },
    });
    expect(runViewSchema.parse(await service.getRun(USER, run.run_id))).toBeTruthy();
    expect(stateResponseSchema.parse(await service.state(USER, 'rsi'))).toBeTruthy();
    expect(
      historyResponseSchema.parse(await service.history(USER, 'rsi', { page: 1, page_size: 5 })),
    ).toBeTruthy();
    // a run that has not started has no result
    const fresh = await service.state(USER, 'macd');
    expect(fresh.current_run).toBeNull();
    // a run still computing / failed exposes no result either
    store.runRows.push({
      ...store.runRows[0]!,
      id: '00000000-0000-4000-8000-0000000000cc',
      status: 'failed',
      result: null,
      chart: null,
      summary: null,
      error: { code: 'X', message: 'y' },
    });
    const failed = await service.getRun(USER, '00000000-0000-4000-8000-0000000000cc');
    expect(runViewSchema.parse(failed)).toMatchObject({
      status: 'failed',
      result: null,
      chart: null,
      error: { code: 'X', message: 'y' },
    });
  });

  it('describes the form of all 16 indicators and their run payloads with the contracts', async () => {
    const { service } = build();
    for (const id of PRACTICE_INDICATOR_IDS) {
      const state = stateResponseSchema.parse(await service.state(USER, id));
      expect(state.form.indicator_id, id).toBe(id);
      expect(state.form.model, id).toBe(id === 'volume' ? 'legacy_params' : 'rows');
      expect(state.form.defaults, id).toEqual(defaultPracticeConfig(practiceEntry(id)!));
      expect(state.draft, id).toEqual(state.form.defaults);
      const preview = previewResponseSchema.parse(
        await service.preview(
          USER,
          id,
          id === 'volume'
            ? { buy_params: { lookback: 30, mult: 1.5 } }
            : { buy_rows: rowsDefaults(id).buy.rules },
        ),
      );
      expect(preview.chart.last_session, id).toBe(0);
      const run = runViewSchema.parse(
        await service.startRun(USER, id, {
          idempotency_key: newKey(),
          ordinal: 1,
          case_id: state.case.case_id,
          config: state.draft,
        }),
      );
      expect(run.status, id).toBe('succeeded');
      expect(run.config, id).toEqual(state.draft);
    }
  }, 60_000);

  it('serves a run locked before SPEC V3 as failed with the outdated-format error', async () => {
    const { store, service } = build();
    const state = await service.state(USER, 'rsi');
    const old = addPreV3Run(store, state.case.case_id, 'computing');

    const view = stateResponseSchema.parse(await service.state(USER, 'rsi'));
    expect(view).toMatchObject({
      status: 'failed',
      can_retry: false,
      can_start: true,
      current_run: { run_id: old.id, status: 'failed', error: OUTDATED_RUN_ERROR },
    });
    expect(view.draft).toEqual(rowsDefaults('rsi')); // the V3 defaults, not the stored pre-V3 draft shape
    const run = runViewSchema.parse(await service.getRun(USER, old.id));
    expect(run).toMatchObject({
      status: 'failed',
      error: OUTDATED_RUN_ERROR,
      result: null,
      chart: null,
      config: preV3Config(),
      versions: { engine_version: 'practice-engine-1', rule_version: 'iqx-rules-3.0' },
    });

    // a succeeded run of the old format keeps parsing: it is shown exactly as it was stored
    const second = await service.state(USER, 'macd');
    store.runRows.length = 0;
    const done = addPreV3Run(store, second.case.case_id, 'succeeded', {
      id: '00000000-0000-4000-8000-0000000000d2',
      indicator_id: 'macd',
      idempotency_key: 'old-run-key-0002',
      summary: {
        total_return: 0,
        buy_count: 0,
        closed_trade_count: 0,
        open_position: false,
        comment_rule_id: 'x',
      },
      completed_at: new Date('2026-10-01T00:05:00Z'),
    });
    expect(done.status).toBe('succeeded');
    expect(
      historyResponseSchema.parse(await service.history(USER, 'macd', { page: 1, page_size: 5 }))
        .items[0]!.config,
    ).toEqual(preV3Config());
  });

  it('paginates the history of completed runs', async () => {
    const { service } = build(['ma']);
    for (let ordinal = 1; ordinal <= 7; ordinal++) {
      const state = await service.state(USER, 'ma');
      await service.startRun(USER, 'ma', {
        idempotency_key: newKey(),
        ordinal,
        case_id: state.case.case_id,
        config: state.draft,
      });
      await service.next(USER, 'ma', { expected_cursor: ordinal, idempotency_key: newKey() });
    }
    const page1 = await service.history(USER, 'ma', { page: 1, page_size: 3 });
    const page3 = await service.history(USER, 'ma', { page: 3, page_size: 3 });
    expect(page1).toMatchObject({ total: 7, page: 1, page_size: 3 });
    expect(page1.items.map((item) => item.ordinal)).toEqual([7, 6, 5]);
    expect(page3.items.map((item) => item.ordinal)).toEqual([1]);
    // the locked config of a run is its per-row conditions, not side-level params
    expect(page1.items[0]!.config).toEqual(rowsDefaults('ma'));
    expect((page1.items[0]!.config as PracticeRowsConfig).buy.rules.map((row) => row.id)).toEqual([
      'ma.price_cross',
      'ma.ma_cross',
      'ma.trend',
    ]);
    expect(page1.items[0]!.kpis).toMatchObject({ buy_count: expect.any(Number) });
    expect(page1.items[0]!.versions.engine_version).toBe('practice-engine-2');
    expect((await service.history(USER, 'ma', { page: 9, page_size: 3 })).items).toEqual([]);
  });
});

describe('practice feature switch', () => {
  const guard = (enabled: boolean) =>
    new PracticeEnabledGuard({ get: () => enabled } as unknown as ConfigService<Environment, true>);

  it('follows ACADEMY_ENABLED with a 404 FEATURE_DISABLED', () => {
    expect(guard(true).canActivate()).toBe(true);
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    try {
      guard(false).canActivate();
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
  });
});
