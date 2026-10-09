import { Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import {
  defaultPracticeConfig,
  practiceEntry,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import { PracticeDataError } from '../../src/modules/practice/practice.data.js';
import { PracticeService } from '../../src/modules/practice/practice.service.js';
import { loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import type { PracticeConfigInput } from '../../src/modules/practice/practice.schemas.js';
import {
  FakeDataPort,
  MemoryPracticeStore,
  OTHER_USER,
  USER,
  newKey,
} from './practice-fixtures.js';

const set = loadPracticeSet();

// Failure paths log on purpose; keep the test output clean.
beforeAll(() => Logger.overrideLogger(false));
const ALL_GRANTS = PRACTICE_INDICATOR_IDS.map((id) => `indicator:${id}`);

function build(grantsByUser: Record<string, readonly string[]> = { [USER]: ALL_GRANTS }) {
  const store = new MemoryPracticeStore();
  const data = new FakeDataPort(set);
  const grants: AcademyGrantsPort = {
    grantedCapabilities: async (userId) => new Set(grantsByUser[userId] ?? []),
  };
  const service = new PracticeService(store, grants, data, set);
  return { store, data, service };
}

const rsiConfig = (): PracticeConfigInput => defaultPracticeConfig(practiceEntry('rsi')!);

async function startCurrent(
  service: PracticeService,
  options: { user?: string; indicator?: string; config?: PracticeConfigInput; key?: string } = {},
) {
  const user = options.user ?? USER;
  const indicator = options.indicator ?? 'rsi';
  const state = await service.state(user, indicator);
  const run = await service.startRun(user, indicator, {
    idempotency_key: options.key ?? newKey(),
    ordinal: state.ordinal,
    case_id: state.case.case_id,
    config: options.config ?? state.draft,
  });
  return { state, run };
}

async function rejection(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus?: () => number; getResponse?: () => { code?: string } };
    return { status: e.getStatus?.() ?? 500, code: e.getResponse?.().code ?? 'UNKNOWN' };
  }
  throw new Error('expected the call to be rejected');
}

describe('practice permutation', () => {
  it('stores 30 distinct cases once per (user, indicator, set) and never reshuffles', async () => {
    const { store, service } = build();
    const first = await service.state(USER, 'rsi');
    expect(store.progressRows).toHaveLength(1);
    const progressId = store.progressRows[0]!.id;
    const order = store.caseRows
      .filter((row) => row.progress_id === progressId)
      .sort((a, b) => a.ordinal - b.ordinal);
    expect(order).toHaveLength(30);
    expect(order.map((row) => row.ordinal)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(new Set(order.map((row) => row.symbol))).toEqual(new Set(set.symbols));
    expect(new Set(order.map((row) => row.case_id)).size).toBe(30);

    // reload, device change, params change and draft saves leave the stored order untouched
    const before = JSON.stringify(order);
    await service.state(USER, 'rsi');
    await service.preview(USER, 'rsi', { buy_params: { period: 10, level: 25 } });
    await service.saveDraft(USER, 'rsi', {
      expected_revision: first.draft_revision,
      draft: { ...first.draft, hold_max_sessions: 30 },
    });
    const after = store.caseRows
      .filter((row) => row.progress_id === progressId)
      .sort((a, b) => a.ordinal - b.ordinal);
    expect(JSON.stringify(after)).toBe(before);
    expect((await service.state(USER, 'rsi')).case.case_id).toBe(first.case.case_id);
  });

  it('creates exactly one permutation under concurrent first requests', async () => {
    const { store, service } = build();
    const states = await Promise.all(Array.from({ length: 6 }, () => service.state(USER, 'macd')));
    expect(new Set(states.map((state) => state.case.case_id)).size).toBe(1);
    expect(store.progressRows).toHaveLength(1);
    expect(store.caseRows).toHaveLength(30);
  });

  it('keeps indicators and users independent (no shared progress or params)', async () => {
    const { store, service } = build({ [USER]: ALL_GRANTS, [OTHER_USER]: ALL_GRANTS });
    await service.state(USER, 'rsi');
    await service.state(USER, 'macd');
    await service.state(OTHER_USER, 'rsi');
    expect(store.progressRows).toHaveLength(3);
    const ids = new Set(store.caseRows.map((row) => row.case_id));
    expect(ids.size).toBe(90);
    await service.saveDraft(USER, 'rsi', {
      expected_revision: 1,
      draft: { ...rsiConfig(), hold_max_sessions: 7 },
    });
    expect((await service.state(USER, 'macd')).draft.hold_max_sessions).toBe(60);
    expect((await service.state(OTHER_USER, 'rsi')).draft.hold_max_sessions).toBe(60);
  });

  it('serves all 30 cases once each and never wraps after the 30th', async () => {
    const { data, service, store } = build();
    for (let ordinal = 1; ordinal <= 30; ordinal++) {
      const { state, run } = await startCurrent(service);
      expect(state.ordinal).toBe(ordinal);
      expect(run.status).toBe('succeeded');
      const view = await service.state(USER, 'rsi');
      expect(view.status).toBe(ordinal === 30 ? 'set_completed' : 'completed');
      if (ordinal < 30) {
        const next = await service.next(USER, 'rsi', {
          expected_cursor: ordinal,
          idempotency_key: newKey(),
        });
        expect(next.ordinal).toBe(ordinal + 1);
      }
    }
    // 30 distinct hidden symbols were served: the stored order, exactly once each
    expect(new Set(data.loads).size).toBe(30);
    expect(new Set(data.loads)).toEqual(new Set(set.symbols));
    expect(store.runRows).toHaveLength(30);

    const code = await rejection(
      service.next(USER, 'rsi', { expected_cursor: 30, idempotency_key: newKey() }),
    );
    expect(code).toEqual({ status: 409, code: 'PRACTICE_SET_COMPLETED' });
    const reloaded = await service.state(USER, 'rsi');
    expect(reloaded.ordinal).toBe(30);
    expect(reloaded.completed_count).toBe(30);
    const history = await service.history(USER, 'rsi', { page: 1, page_size: 100 });
    expect(history.total).toBe(30);
    expect(history.items.map((item) => item.ordinal)).toEqual(
      Array.from({ length: 30 }, (_, i) => 30 - i),
    );
  }, 60_000);
});

describe('practice grants and indicator whitelist', () => {
  it('requires the indicator:<id> grant on every indicator endpoint', async () => {
    const { store, service } = build({ [USER]: ['indicator:macd'] });
    const calls: Array<() => Promise<unknown>> = [
      () => service.state(USER, 'rsi'),
      () => service.saveDraft(USER, 'rsi', { expected_revision: 1, draft: rsiConfig() }),
      () => service.preview(USER, 'rsi', { buy_params: { period: 14, level: 30 } }),
      () =>
        service.startRun(USER, 'rsi', {
          idempotency_key: newKey(),
          ordinal: 1,
          case_id: '00000000-0000-4000-8000-0000000000aa',
          config: rsiConfig(),
        }),
      () => service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: newKey() }),
      () => service.history(USER, 'rsi', { page: 1, page_size: 10 }),
    ];
    for (const call of calls) {
      expect(await rejection(call())).toEqual({ status: 403, code: 'CAPABILITY_LOCKED' });
    }
    // a refused user leaves no trace: no progress, no permutation, no run
    expect(store.progressRows).toHaveLength(0);
    expect(store.caseRows).toHaveLength(0);
    expect(store.runRows).toHaveLength(0);
    // the learned indicator works
    expect((await service.state(USER, 'macd')).status).toBe('ready');
  });

  it('forwards the lock capability and reason in `details` (the error filter drops other extras)', async () => {
    const { service } = build({ [USER]: ['indicator:macd'] });
    const error = await service.state(USER, 'rsi').then(
      () => null,
      (caught: unknown) => caught as { getResponse: () => Record<string, unknown> },
    );
    expect(error?.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      details: [{ capability: 'indicator:rsi', reason: 'not_learned', indicator: 'rsi' }],
    });
  });

  it('accepts only the 16 indicators of Appendix B', async () => {
    const { service } = build({ [USER]: ['indicator:adx', 'indicator:atr', ...ALL_GRANTS] });
    for (const id of ['adx', 'atr', 'keltner', 'psar', 'rs_market', 'ad_line', 'nope']) {
      expect(await rejection(service.state(USER, id))).toEqual({
        status: 404,
        code: 'PRACTICE_INDICATOR_NOT_FOUND',
      });
    }
    for (const id of PRACTICE_INDICATOR_IDS) {
      expect((await service.state(USER, id)).indicator.id).toBe(id);
    }
  });

  it('lists the 16 indicators with the granted flag and the progress summary', async () => {
    const { service } = build({ [USER]: ['indicator:rsi', 'indicator:ma'] });
    await startCurrent(service, { indicator: 'rsi' });
    const list = await service.listIndicators(USER);
    expect(list.set.case_count).toBe(30);
    expect(list.indicators.map((item) => item.indicator_id)).toEqual([...PRACTICE_INDICATOR_IDS]);
    const byId = new Map(list.indicators.map((item) => [item.indicator_id, item]));
    expect(byId.get('rsi')).toMatchObject({
      granted: true,
      lesson_key: 'technical:rsi',
      progress: { status: 'in_progress', cursor: 1, completed_count: 1, total: 30 },
    });
    expect(byId.get('ma')).toMatchObject({
      granted: true,
      progress: { status: 'not_started', cursor: 1, completed_count: 0 },
    });
    expect(byId.get('macd')).toMatchObject({ granted: false, progress: null });
    expect(list.indicators.filter((item) => item.granted)).toHaveLength(2);
    expect(list.profile).toMatchObject({ capital: 100_000_000, lot: 100, verified: false });
    expect(list.hold).toEqual({ default: 60, min: 1, max: 1000 });
  });
});

describe('practice start: validation and locking', () => {
  it('rejects invalid input without consuming the case', async () => {
    const { store, service } = build();
    const state = await service.state(USER, 'rsi');
    const base = state.draft;
    const invalid: Array<[string, PracticeConfigInput]> = [
      ['buy off', { ...base, buy: { ...base.buy, enabled: false } }],
      ['hold 0', { ...base, hold_max_sessions: 0 }],
      ['hold decimal', { ...base, hold_max_sessions: 12.5 }],
      ['hold > 1000', { ...base, hold_max_sessions: 1001 }],
      ['period below domain', { ...base, buy: { ...base.buy, params: { period: 4, level: 30 } } }],
      [
        'buy level outside 10..49',
        { ...base, buy: { ...base.buy, params: { period: 14, level: 60 } } },
      ],
      [
        'sell level outside 51..90',
        { ...base, sell: { ...base.sell, params: { period: 14, level: 40 } } },
      ],
      ['bad step', { ...base, buy: { ...base.buy, params: { period: 14.5, level: 30 } } }],
      ['unknown param', { ...base, buy: { ...base.buy, params: { period: 14, level: 30, x: 1 } } }],
      ['bad operator', { ...base, buy: { ...base.buy, ops: { r1: '∈', r2: '>' } } }],
      ['missing rule', { ...base, buy: { ...base.buy, ops: { r1: '<' } } }],
      ['unknown rule', { ...base, buy: { ...base.buy, ops: { ...base.buy.ops, r9: '>' } } }],
    ];
    for (const [label, config] of invalid) {
      const result = await rejection(
        service.startRun(USER, 'rsi', {
          idempotency_key: newKey(),
          ordinal: state.ordinal,
          case_id: state.case.case_id,
          config,
        }),
      );
      expect(result, label).toEqual({ status: 422, code: 'PRACTICE_CONFIG_INVALID' });
    }
    expect(store.runRows).toHaveLength(0);
    const after = await service.state(USER, 'rsi');
    expect(after.ordinal).toBe(1);
    expect(after.case.case_id).toBe(state.case.case_id);
    expect(after.status).toBe('ready');
    expect(after.can_start).toBe(true);
  });

  it('allows Buy only: a disabled Sell side still runs and exits on time', async () => {
    const { service } = build();
    const state = await service.state(USER, 'rsi');
    const config = {
      ...state.draft,
      sell: { ...state.draft.sell, enabled: false },
      hold_max_sessions: 15,
    };
    const run = await service.startRun(USER, 'rsi', {
      idempotency_key: newKey(),
      ordinal: 1,
      case_id: state.case.case_id,
      config,
    });
    expect(run.status).toBe('succeeded');
    for (const trade of run.result!.trades.filter((item) => item.status === 'closed')) {
      expect(trade.sell!.reason).toBe('max_holding');
      expect(trade.holding_sessions).toBe(15);
    }
  });

  it('rejects a stale tab that references another ordinal or case', async () => {
    const { service } = build();
    const state = await service.state(USER, 'rsi');
    for (const patch of [{ ordinal: 2 }, { case_id: '00000000-0000-4000-8000-0000000000bb' }]) {
      const result = await rejection(
        service.startRun(USER, 'rsi', {
          idempotency_key: newKey(),
          ordinal: state.ordinal,
          case_id: state.case.case_id,
          config: state.draft,
          ...patch,
        }),
      );
      expect(result).toEqual({ status: 409, code: 'PRACTICE_CASE_MISMATCH' });
    }
  });

  it('locks the config at start: another config for the same case is refused', async () => {
    const { store, service } = build();
    const { state, run } = await startCurrent(service);
    const changed = {
      ...state.draft,
      buy: { ...state.draft.buy, params: { period: 10, level: 25 } },
    };
    const result = await rejection(
      service.startRun(USER, 'rsi', {
        idempotency_key: newKey(),
        ordinal: 1,
        case_id: state.case.case_id,
        config: changed,
      }),
    );
    expect(result).toEqual({ status: 409, code: 'PRACTICE_RUN_LOCKED' });
    expect(store.runRows).toHaveLength(1);
    expect(store.runRows[0]!.config.buy.params).toEqual(run.config.buy.params);
    // the draft cannot be edited under a locked run either
    expect(
      await rejection(service.saveDraft(USER, 'rsi', { expected_revision: 1, draft: changed })),
    ).toEqual({ status: 409, code: 'PRACTICE_RUN_LOCKED' });
  });
});

describe('practice start: idempotency and concurrency', () => {
  it('returns the same run for a replayed key without recomputing', async () => {
    const { store, service } = build();
    const state = await service.state(USER, 'rsi');
    const body = {
      idempotency_key: 'replay-key-0001',
      ordinal: 1,
      case_id: state.case.case_id,
      config: state.draft,
    };
    const first = await service.startRun(USER, 'rsi', body);
    const again = await service.startRun(USER, 'rsi', body);
    expect(again.run_id).toBe(first.run_id);
    expect(again.result).toEqual(first.result);
    expect(store.runRows).toHaveLength(1);
    expect(store.runRows[0]!.attempts).toBe(1);
    // the key stays bound to its request even after the cursor moved on
    await service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: newKey() });
    const late = await service.startRun(USER, 'rsi', body);
    expect(late.run_id).toBe(first.run_id);
    expect(store.runRows).toHaveLength(1);
    // the same key with another payload is a client bug
    const reused = await rejection(
      service.startRun(USER, 'rsi', { ...body, config: { ...state.draft, hold_max_sessions: 20 } }),
    );
    expect(reused).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('creates one run when two tabs start the same case concurrently', async () => {
    const { store, service } = build();
    const state = await service.state(USER, 'rsi');
    const request = (key: string) =>
      service.startRun(USER, 'rsi', {
        idempotency_key: key,
        ordinal: 1,
        case_id: state.case.case_id,
        config: state.draft,
      });
    const runs = await Promise.all([
      request('tab-a-key-001'),
      request('tab-b-key-002'),
      request('tab-a-key-001'),
    ]);
    expect(new Set(runs.map((run) => run.run_id)).size).toBe(1);
    expect(store.runRows).toHaveLength(1);
    expect(runs.every((run) => run.status === 'succeeded')).toBe(true);
  });

  it('keeps the reservation when the data feed fails before the lock', async () => {
    const { store, data, service } = build();
    const state = await service.state(USER, 'rsi');
    data.failWith = new PracticeDataError('DATA_UNAVAILABLE', 'Dữ liệu tạm thời chưa sẵn sàng.');
    const request = () =>
      service.startRun(USER, 'rsi', {
        idempotency_key: 'feed-key-0001',
        ordinal: 1,
        case_id: state.case.case_id,
        config: state.draft,
      });
    expect(await rejection(request())).toEqual({ status: 503, code: 'PRACTICE_DATA_UNAVAILABLE' });
    expect(store.runRows).toHaveLength(0);
    const mid = await service.state(USER, 'rsi');
    expect(mid).toMatchObject({ status: 'ready', ordinal: 1, can_start: true });
    expect(mid.case.case_id).toBe(state.case.case_id);
    data.failWith = null;
    expect((await request()).status).toBe('succeeded');
  });

  it('keeps the locked run for retry when the computation fails, then completes it', async () => {
    const { store, data, service } = build();
    const state = await service.state(USER, 'rsi');
    const body = {
      idempotency_key: 'retry-key-0001',
      ordinal: 1,
      case_id: state.case.case_id,
      config: state.draft,
    };
    data.corruptOnce = true;
    expect(await rejection(service.startRun(USER, 'rsi', body))).toEqual({
      status: 500,
      code: 'PRACTICE_COMPUTE_FAILED',
    });
    expect(store.runRows).toHaveLength(1);
    expect(store.runRows[0]).toMatchObject({ status: 'failed', ordinal: 1 });
    const failed = await service.state(USER, 'rsi');
    expect(failed).toMatchObject({
      status: 'failed',
      can_start: false,
      can_retry: true,
      can_next: false,
    });
    // a failed run is never marked done and never lets the player skip ahead
    expect(
      await rejection(service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: newKey() })),
    ).toEqual({ status: 409, code: 'PRACTICE_RUN_NOT_COMPLETED' });
    // the config stays locked while failed
    expect(
      await rejection(
        service.startRun(USER, 'rsi', {
          ...body,
          idempotency_key: 'other-key-0002',
          config: { ...state.draft, hold_max_sessions: 10 },
        }),
      ),
    ).toEqual({ status: 409, code: 'PRACTICE_RUN_LOCKED' });
    const runId = store.runRows[0]!.id;
    const retried = await service.startRun(USER, 'rsi', body);
    expect(retried.run_id).toBe(runId);
    expect(retried.status).toBe('succeeded');
    expect(store.runRows).toHaveLength(1);
  });
});

describe('practice next', () => {
  it('moves exactly one case per completed run, even for a double click', async () => {
    const { service } = build();
    await startCurrent(service);
    const results = await Promise.all([
      service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: 'click-key-0001' }),
      service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: 'click-key-0002' }),
      service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: 'click-key-0001' }),
    ]);
    expect(results.map((state) => state.ordinal)).toEqual([2, 2, 2]);
    expect((await service.state(USER, 'rsi')).ordinal).toBe(2);
    // a late retry of an old click is still a no-op
    expect(
      (await service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: 'click-key-0003' }))
        .ordinal,
    ).toBe(2);
  });

  it('refuses a stale cursor, a reused key and next before the run is completed', async () => {
    const { service } = build();
    const state = await service.state(USER, 'rsi');
    expect(
      await rejection(service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: newKey() })),
    ).toEqual({ status: 409, code: 'PRACTICE_RUN_NOT_COMPLETED' });
    await service.startRun(USER, 'rsi', {
      idempotency_key: newKey(),
      ordinal: 1,
      case_id: state.case.case_id,
      config: state.draft,
    });
    await service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: 'advance-key-01' });
    expect(
      await rejection(service.next(USER, 'rsi', { expected_cursor: 2, idempotency_key: newKey() })),
    ).toEqual({ status: 409, code: 'PRACTICE_RUN_NOT_COMPLETED' });
    expect(
      await rejection(service.next(USER, 'rsi', { expected_cursor: 5, idempotency_key: newKey() })),
    ).toEqual({ status: 409, code: 'PRACTICE_CURSOR_MISMATCH' });
    expect(
      await rejection(
        service.next(USER, 'rsi', { expected_cursor: 2, idempotency_key: 'advance-key-01' }),
      ),
    ).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('keeps the draft for the next case and never selects a config by itself', async () => {
    const { service } = build();
    const first = await service.state(USER, 'rsi');
    // the config that was started (not an older saved draft) is what carries over
    const started = {
      ...first.draft,
      buy: { ...first.draft.buy, params: { period: 9, level: 28 } },
      hold_max_sessions: 33,
    };
    const { state } = await startCurrent(service, { config: started });
    const next = await service.next(USER, 'rsi', { expected_cursor: 1, idempotency_key: newKey() });
    expect(next.draft).toEqual(started);
    expect(next.draft).not.toEqual(state.draft);
    expect(next.status).toBe('ready');
    expect(next.case.case_id).not.toBe(state.case.case_id);
    const saved = await service.saveDraft(USER, 'rsi', {
      expected_revision: next.draft_revision,
      draft: { ...next.draft, hold_max_sessions: 20 },
    });
    expect(saved.draft_revision).toBe(next.draft_revision + 1);
    expect(saved.validation.valid).toBe(true);
    // a stale tab cannot overwrite the newer draft
    expect(
      await rejection(
        service.saveDraft(USER, 'rsi', {
          expected_revision: 1,
          draft: { ...next.draft, hold_max_sessions: 99 },
        }),
      ),
    ).toEqual({ status: 409, code: 'DRAFT_REVISION_CONFLICT' });
    expect((await service.state(USER, 'rsi')).draft.hold_max_sessions).toBe(20);
  });
});

describe('practice run results', () => {
  it('stores an immutable result with locked versions, evidence and a comment', async () => {
    const { store, service } = build();
    const { run } = await startCurrent(service);
    expect(run.versions).toMatchObject({
      set_version: set.set_version,
      profile_version: 'mini-profile-v1',
      calculation_version: 'iqx-ta-2.0',
      execution_version: set.versions.execution,
      comment_version: set.versions.comment,
    });
    expect(run.versions.data_version).toMatch(/^[a-f0-9]{64}$/);
    const result = run.result!;
    expect(result.kpis.capital_initial).toBe(100_000_000);
    expect(result.kpis.buy_count).toBe(
      result.kpis.closed_trade_count + (result.kpis.open_position ? 1 : 0),
    );
    expect(result.comment.status).toBe('ok');
    expect(result.comment.version).toBe(set.versions.comment);
    expect(result.nav).toHaveLength(result.last_session);
    expect(run.chart!.first_session).toBeLessThan(0);
    expect(run.chart!.last_session).toBe(result.last_session);
    for (const trade of result.trades) {
      expect(trade.buy.evidence.rules.length).toBeGreaterThan(0);
      expect(trade.buy.evidence.params).toEqual(run.config.buy.params);
    }
    // reading the run later returns the very same stored result, not a recomputation
    const again = await service.getRun(USER, run.run_id);
    expect(again).toEqual(run);
    // a completed run is final in the store
    expect(await store.completeRun(run.run_id, { summary: {}, result: {}, chart: {} })).toBeNull();
    expect(store.runRows[0]!.attempts).toBe(1);
    // other owners cannot read it
    expect(await rejection(service.getRun(OTHER_USER, run.run_id))).toEqual({
      status: 404,
      code: 'PRACTICE_RUN_NOT_FOUND',
    });
  });

  it('computes each side with its own params', async () => {
    const { service } = build();
    const state = await service.state(USER, 'rsi');
    const config: PracticeConfigInput = {
      ...state.draft,
      buy: { ...state.draft.buy, params: { period: 7, level: 35 } },
      sell: { ...state.draft.sell, params: { period: 21, level: 65 } },
    };
    const { run } = await startCurrent(service, { config });
    expect(run.chart!.plot.buy.lines[0]!.label).toBe('RSI 7');
    expect(run.chart!.plot.sell.lines[0]!.label).toBe('RSI 21');
    expect(run.chart!.plot.buy.threshold_levels).toEqual([35]);
    expect(run.chart!.plot.sell.threshold_levels).toEqual([65]);
    expect(run.chart!.series.buy.value).not.toEqual(run.chart!.series.sell.value);
    for (const trade of run.result!.trades) {
      expect(trade.buy.evidence.params).toEqual({ period: 7, level: 35 });
      if (trade.sell) expect(trade.sell.evidence.params).toEqual({ period: 21, level: 65 });
    }
  });

  it('runs every one of the 16 indicators with its own algorithm', async () => {
    const { service } = build();
    for (const id of PRACTICE_INDICATOR_IDS) {
      const { run } = await startCurrent(service, { indicator: id });
      expect(run.status, id).toBe('succeeded');
      const { plot, series } = run.chart!;
      for (const side of ['buy', 'sell'] as const) {
        for (const line of plot[side].lines) {
          const values = series[side][line.key]!;
          expect(values, `${id}.${side}.${line.key}`).toHaveLength(run.chart!.bars.close.length);
          // a plotted key that the engine does not produce would be all null
          expect(
            values.some((value) => value !== null),
            `${id}.${side}.${line.key} has values`,
          ).toBe(true);
        }
        for (const key of [plot[side].histogram_key, plot[side].volume_key]) {
          if (key) expect(series[side][key]!.some((value) => value !== null)).toBe(true);
        }
      }
    }
  }, 60_000);
});

describe('practice data hiding', () => {
  const dateLike = /\d{4}-\d{2}-\d{2}/;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  function stripTimestamps(payload: unknown): string {
    return JSON.stringify(payload, (key, value: unknown) =>
      key === 'locked_at' || key === 'completed_at' ? undefined : value,
    );
  }

  /** Every object key and string value of a payload (ids stripped), so a year-like number never trips it. */
  function textOf(payload: unknown): string {
    const parts: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') parts.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          parts.push(key);
          walk(item);
        }
      }
    };
    walk(JSON.parse(stripTimestamps(payload)));
    return parts.join('\n').replace(UUID, 'id');
  }

  /** No calendar year and no set identity (index name, period, set label) in text of any payload. */
  function assertNoSetIdentity(payload: unknown) {
    const text = textOf(payload);
    expect(text).not.toMatch(/20\d\d/);
    expect(text).not.toMatch(/vn30/i);
    expect(text).not.toMatch(/2024h1/i);
  }

  function assertNoLeak(json: string, extraDates: readonly string[] = []) {
    for (const symbol of set.symbols) {
      expect(json, `symbol ${symbol}`).not.toMatch(new RegExp(`\\b${symbol}\\b`, 'i'));
    }
    expect(json).not.toMatch(dateLike);
    expect(json).not.toMatch(
      /Ngân hàng|Tập đoàn|Vinhomes|Vingroup|Vietjet|Masan|Hòa Phát|Bảo Việt/i,
    );
    expect(json).not.toMatch(/"(symbol|company|ticker|date|time|isin|logo)"/i);
    for (const date of extraDates) expect(json).not.toContain(date);
  }

  it('never serialises a symbol, a company or a calendar date', async () => {
    const { store, data, service } = build();
    const state = await service.state(USER, 'rsi');
    const symbol = store.caseRows.find((row) => row.case_id === state.case.case_id)!.symbol;
    const dates = data.allDates(symbol);

    const list = await service.listIndicators(USER);
    const preview = await service.preview(USER, 'rsi', { buy_params: { period: 10, level: 25 } });
    const draft = await service.saveDraft(USER, 'rsi', {
      expected_revision: 1,
      draft: state.draft,
    });
    const run = await service.startRun(USER, 'rsi', {
      idempotency_key: newKey(),
      ordinal: 1,
      case_id: state.case.case_id,
      config: draft.draft,
    });
    const reread = await service.getRun(USER, run.run_id);
    const afterState = await service.state(USER, 'rsi');
    const history = await service.history(USER, 'rsi', { page: 1, page_size: 10 });
    for (const payload of [list, state, preview, draft, run, reread, afterState, history]) {
      assertNoLeak(stripTimestamps(payload), dates);
      assertNoSetIdentity(payload);
    }
    // the set label is opaque: it names neither the index nor the observation period
    expect(run.versions.set_version).toMatch(/^[a-z0-9-]+$/);
    expect(set.set_version).not.toMatch(/vn30|20\d\d/i);
    // the payload keys that exist are session-based, never calendar-based
    expect(Object.keys(run.chart!)).toEqual([
      'first_session',
      'last_session',
      'last_observed_session',
      'bars',
      'series',
      'plot',
    ]);
  });

  it('never names the set, the index or a year in an error body', async () => {
    const bodies: unknown[] = [];
    const capture = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        const e = error as { message: string; getResponse: () => unknown; getStatus: () => number };
        bodies.push({ status: e.getStatus(), response: e.getResponse(), message: e.message });
        return;
      }
      throw new Error('expected the call to be rejected');
    };
    const locked = build({ [USER]: [] });
    await capture(locked.service.state(USER, 'rsi'));
    await capture(locked.service.history(USER, 'rsi', { page: 1, page_size: 10 }));

    const { data, service } = build();
    await capture(service.state(USER, 'nope'));
    await capture(service.preview(USER, 'rsi', { buy_params: { period: 3, level: 30 } }));
    const state = await service.state(USER, 'rsi');
    await capture(
      service.startRun(USER, 'rsi', {
        idempotency_key: newKey(),
        ordinal: 2,
        case_id: state.case.case_id,
        config: state.draft,
      }),
    );
    data.failWith = new PracticeDataError('DATA_UNAVAILABLE', 'Dữ liệu tạm thời chưa sẵn sàng.');
    await capture(
      service.startRun(USER, 'rsi', {
        idempotency_key: newKey(),
        ordinal: 1,
        case_id: state.case.case_id,
        config: state.draft,
      }),
    );
    expect(bodies).toHaveLength(6);
    for (const body of bodies) assertNoSetIdentity(body);
  });

  it('shows only the observation window before start: no warmup, no future, no seed from it', async () => {
    const { store, data, service } = build();
    const state = await service.state(USER, 'ma_cross');
    const symbol = store.caseRows.find((row) => row.case_id === state.case.case_id)!.symbol;
    const loaded = await data.load(symbol);
    const { observationStart, firstTest } = loaded.calendar;
    const preview = await service.preview(USER, 'ma_cross', {
      buy_params: { fast: 100, slow: 250 },
      sell_params: { fast: 5, slow: 10 },
    });
    const { chart } = preview;
    const observed = firstTest - observationStart;
    expect(chart.bars.close).toHaveLength(observed);
    expect(chart.last_session).toBe(0);
    expect(chart.first_session).toBe(-(observed - 1));
    // exactly the observation closes, not one test close and not a warmup close
    expect(chart.bars.close).toEqual(
      loaded.calendar.bars.slice(observationStart, firstTest).map((bar) => bar.close),
    );
    // warmup history is deeper than the 130-bar view and feeds the 250-session average
    expect(chart.series.buy.slow).toHaveLength(observed);
    expect(chart.series.buy.slow?.every((value) => value !== null)).toBe(true);
    expect(chart.series.buy.fast?.every((value) => value !== null)).toBe(true);
    expect(preview.window_bars).toBe(130);
    // a not-yet-started case exposes no result
    expect((await service.state(USER, 'ma_cross')).current_run).toBeNull();
  });

  it('rejects invalid preview params and applies the requested side params only', async () => {
    const { service } = build();
    expect(
      await rejection(service.preview(USER, 'rsi', { buy_params: { period: 3, level: 30 } })),
    ).toEqual({ status: 422, code: 'PRACTICE_CONFIG_INVALID' });
    const a = await service.preview(USER, 'rsi', { buy_params: { period: 10, level: 30 } });
    const b = await service.preview(USER, 'rsi', { buy_params: { period: 20, level: 30 } });
    expect(a.chart.plot.buy.lines[0]!.label).toBe('RSI 10');
    expect(b.chart.plot.buy.lines[0]!.label).toBe('RSI 20');
    expect(a.chart.series.buy.value).not.toEqual(b.chart.series.buy.value);
    // the unspecified side keeps the saved draft params
    expect(a.chart.plot.sell.lines[0]!.label).toBe('RSI 14');
  });
});
