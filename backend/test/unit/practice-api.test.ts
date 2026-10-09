import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { PracticeEnabledGuard } from '../../src/modules/practice/practice-enabled.guard.js';
import {
  defaultPracticeConfig,
  practiceEntry,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
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
import type { Environment } from '../../src/platform/config/environment.js';
import { FakeDataPort, MemoryPracticeStore, USER, newKey } from './practice-fixtures.js';

const set = loadPracticeSet();

describe('practice API contracts', () => {
  const uuid = '00000000-0000-4000-8000-000000000009';
  const config = defaultPracticeConfig(practiceEntry('rsi')!);

  it('validates request bodies strictly', () => {
    const start = { idempotency_key: 'a-valid-key', ordinal: 1, case_id: uuid, config };
    expect(startRunBodySchema.safeParse(start).success).toBe(true);
    for (const patch of [
      { ordinal: 0 },
      { ordinal: 31 },
      { ordinal: 1.5 },
      { case_id: 'not-a-uuid' },
      { idempotency_key: 'short' },
      { symbol: 'ACB' },
      { config: { ...config, extra: true } },
      { config: { ...config, buy: { ...config.buy, ops: { r1: '=' } } } },
      { config: { ...config, hold_max_sessions: '60' } },
    ]) {
      expect(
        startRunBodySchema.safeParse({ ...start, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
    expect(
      nextBodySchema.safeParse({ expected_cursor: 3, idempotency_key: 'next-key-1' }).success,
    ).toBe(true);
    expect(
      nextBodySchema.safeParse({ expected_cursor: 31, idempotency_key: 'next-key-1' }).success,
    ).toBe(false);
    expect(nextBodySchema.safeParse({ expected_cursor: 3 }).success).toBe(false);
    expect(draftBodySchema.safeParse({ expected_revision: 1, draft: config }).success).toBe(true);
    expect(draftBodySchema.safeParse({ expected_revision: 0, draft: config }).success).toBe(false);
    expect(previewBodySchema.safeParse({}).success).toBe(false);
    expect(previewBodySchema.safeParse({ buy_params: { period: 14 } }).success).toBe(true);
    expect(previewBodySchema.safeParse({ buy_params: { period: Number.NaN } }).success).toBe(false);
    expect(historyQuerySchema.parse({})).toEqual({ page: 1, page_size: 30 });
    expect(historyQuerySchema.safeParse({ page_size: '500' }).success).toBe(false);
    expect(indicatorIdParamSchema.safeParse('rsi').success).toBe(true);
    expect(indicatorIdParamSchema.safeParse('../etc').success).toBe(false);
    expect(runIdParamSchema.safeParse(uuid).success).toBe(true);
    expect(runIdParamSchema.safeParse('1').success).toBe(false);
  });

  it('matches the documented response schemas for every endpoint payload', async () => {
    const store = new MemoryPracticeStore();
    const grants: AcademyGrantsPort = {
      grantedCapabilities: async () =>
        new Set(PRACTICE_INDICATOR_IDS.map((id) => `indicator:${id}`)),
    };
    const service = new PracticeService(store, grants, new FakeDataPort(set), set);

    const list = await service.listIndicators(USER);
    expect(indicatorsResponseSchema.parse(list)).toBeTruthy();
    const state = await service.state(USER, 'rsi');
    expect(stateResponseSchema.parse(state)).toBeTruthy();
    const preview = await service.preview(USER, 'rsi', { sell_params: { period: 9, level: 70 } });
    expect(previewResponseSchema.parse(preview)).toBeTruthy();
    const draft = await service.saveDraft(USER, 'rsi', {
      expected_revision: 1,
      draft: { ...state.draft, hold_max_sessions: 25 },
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
    });
  });

  it('paginates the history of completed runs', async () => {
    const store = new MemoryPracticeStore();
    const grants: AcademyGrantsPort = {
      grantedCapabilities: async () => new Set(['indicator:ma']),
    };
    const service = new PracticeService(store, grants, new FakeDataPort(set), set);
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
    expect(page1.items[0]!.config.buy.params).toEqual({ period: 20 });
    expect(page1.items[0]!.kpis).toMatchObject({ buy_count: expect.any(Number) });
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
