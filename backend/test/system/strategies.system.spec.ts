import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import { defaultConfig } from '../../src/modules/quant/v2/index.js';
import {
  PRICE_STORE,
  type PriceSeriesBundle,
  type PriceStorePort,
  type StrategyContent,
  type SymbolSeries,
} from '../../src/modules/strategy-rules/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function weekdays(start: string, count: number): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

const CAL = weekdays('2023-01-02', 650);
const VN30 = ['AAA', 'BBB', 'CCC'];
const VN100 = [...VN30, 'DDD'];

function bundle(symbols: readonly string[]): PriceSeriesBundle {
  const out: Record<string, SymbolSeries> = {};
  for (const symbol of symbols) {
    let state = 1_000 + VN100.indexOf(symbol) * 7_919;
    const rand = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
    const n = CAL.length;
    const close = new Float64Array(n);
    const volume = new Float64Array(n);
    let price = 20_000;
    for (let i = 0; i < n; i += 1) {
      price = Math.max(1_000, Math.round(price * (1 + (rand() - 0.5) * 0.06)));
      close[i] = price;
      volume[i] = Math.round(100_000 + rand() * 900_000);
    }
    out[symbol] = {
      symbol,
      session_idx: Int32Array.from({ length: n }, (_, i) => i),
      open: close.slice(),
      high: close.map((value) => value + 50),
      low: close.map((value) => value - 50),
      close,
      volume,
      series_rev: 1,
    };
  }
  return {
    calendar: CAL,
    data_as_of: CAL.at(-1)!,
    symbols: out,
    market: Float64Array.from(CAL, (_, i) => 1_200 + Math.sin(i / 10) * 50),
    data_hash: 'd'.repeat(64),
  };
}

const prices: PriceStorePort = {
  meta: async () => ({
    data_store: 'flashback_vn100',
    data_as_of: CAL.at(-1)!,
    earliest_start: CAL[450]!,
    price_unit: 'VND',
    adjusted: true,
    sessions: CAL.length,
  }),
  calendar: async () => CAL,
  eligibility: async () => ({
    vn30: VN30,
    vn100: VN100,
    membership_session: { vn30: CAL.at(-1)!, vn100: CAL.at(-1)! },
  }),
  membersAt: async () => VN30,
  loadSeries: async (symbols) => bundle(symbols),
};

function rsiContent(maxHolding: number): StrategyContent {
  const indicators = structuredClone(defaultConfig().indicators);
  const rsi = indicators.rsi!;
  rsi.master_enabled = true;
  rsi.buy.enabled = true;
  rsi.sell.enabled = true;
  const rows = (side: 'buy' | 'sell') => rsi[side].rules as Array<Record<string, unknown>>;
  rows('buy')[0] = { ...rows('buy')[0], op: '<', threshold: 45 };
  rows('buy')[1] = { ...rows('buy')[1], enabled: false };
  rows('sell')[0] = { ...rows('sell')[0], op: '>', threshold: 55 };
  rows('sell')[1] = { ...rows('sell')[1], enabled: false };
  return { universe: { type: 'vn30' }, indicators, max_holding: maxHolding };
}

/**
 * Strategies + basket Backtest through HTTP (guards, zod, exception filter) on a real database
 * with migration 0059: S05, S06 (API 422), S08, S11 via API, S13, S14, IQX v2 content, PATCH 410.
 */
describe('system acceptance: strategies and basket Backtest (update 22-11, W2)', () => {
  let stack: SystemStack;
  let user: Awaited<ReturnType<typeof registerAndLogin>>;
  let key = 0;

  beforeAll(async () => {
    stack = await startSystemStack(
      { STRATEGY_V2_ENABLED: 'true' },
      {
        overrideProviders: [
          { token: PRICE_STORE, value: prices },
          {
            token: ACADEMY_GRANTS,
            value: { grantedCapabilities: async () => new Set(['indicator:rsi']) },
          },
        ],
      },
    );
    // The stack's TRUNCATE users CASCADE also empties iqx_templates: replay the 0057 seed and
    // the 0059 IQX v2 step (the exact migration SQL) so the published v2 content is what users see.
    const between = (text: string, from: string, to: string) =>
      text.slice(text.indexOf(from), text.indexOf(to) + to.length);
    const m57 = await readFile(
      new URL('../../migrations/0057_iqx_templates.sql', import.meta.url),
      'utf8',
    );
    const m59 = await readFile(
      new URL('../../migrations/0059_user_strategies.sql', import.meta.url),
      'utf8',
    );
    await stack.query(between(m57, 'WITH seed (', 'seed.slug = inserted.slug;'));
    await stack.query(between(m59, 'WITH targets AS (', 'WHERE t.id = inserted.template_id;'));
    user = await registerAndLogin(stack.app, 'strategies-w2');
  });

  afterAll(async () => {
    await stack?.close();
  });

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Json) =>
    stack.app.inject({
      method,
      url,
      headers: authHeader(user.accessToken),
      ...(payload ? { payload } : {}),
    });

  const runDraft = async (content: StrategyContent) => {
    const response = await call('POST', '/api/v2/strategy/backtests', {
      idempotency_key: `w2-run-${++key}`,
      strategy: { source: 'draft', content, base: null },
      start: CAL[460],
      end: CAL.at(-1),
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json() as Json;
  };

  it('store meta and universe options come from the price store', async () => {
    const meta = (await call('GET', '/api/v2/strategy/store/meta')).json() as Json;
    expect(meta).toMatchObject({
      data_store: 'flashback_vn100',
      data_as_of: CAL.at(-1),
      earliest_start: CAL[450],
      price_unit: 'VND',
      adjusted: true,
      default_end: CAL.at(-1),
    });
    const options = (await call('GET', '/api/v2/strategy/universe-options')).json() as Json;
    expect(options).toMatchObject({ vn30: { symbols: VN30 }, vn100: { symbols: VN100 } });
  });

  it('S11 via API: N = 5, every closed trade held 2..5 sessions; legacy fields 422', async () => {
    const run = await runDraft(rsiContent(5));
    expect(run).toMatchObject({ legacy: false, status: 'succeeded' });
    for (const trade of run.result.trades as Json[]) {
      expect(trade.holding_sessions).toBeGreaterThanOrEqual(2);
      expect(trade.holding_sessions).toBeLessThanOrEqual(5);
    }
    const trades = (
      await call('GET', `/api/v2/strategy/backtests/${run.run_id}/trades?limit=2`)
    ).json() as Json;
    expect(trades.total).toBe(run.result.trades.length);
    const legacy = await call('POST', '/api/v2/strategy/backtests', {
      idempotency_key: 'w2-legacy-1',
      shared_revision: 1,
      symbol: 'FPT',
      strategy: { source: 'iqx', id: 'phadinh' },
      start: CAL[460],
      end: CAL.at(-1),
    });
    expect(legacy.statusCode).toBe(422);
    expect(legacy.json().error).toMatchObject({ code: 'STRATEGY_INVALID' });
    const range = await call('POST', '/api/v2/strategy/backtests', {
      idempotency_key: 'w2-range-1',
      strategy: { source: 'iqx', id: 'phadinh' },
      start: CAL[10],
      end: CAL.at(-1),
    });
    expect(range.statusCode).toBe(422);
    expect(range.json().error).toMatchObject({ code: 'DATE_RANGE_INVALID' });
  });

  it('S06/S08/S14/S05: save from a run, version conflict, restore, delete', async () => {
    const v1 = rsiContent(30);
    const run1 = await runDraft(v1);
    const refused = await call('POST', '/api/v2/strategy/strategies', {
      name: 'RSI',
      content: rsiContent(31),
      from_run_id: run1.run_id,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error).toMatchObject({ code: 'RUN_REQUIRED' });

    const created = await call('POST', '/api/v2/strategy/strategies', {
      name: 'RSI',
      content: v1,
      from_run_id: run1.run_id,
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = (created.json() as Json).strategy.id as string;
    const taken = await call('POST', '/api/v2/strategy/strategies', {
      name: 'rsi',
      content: v1,
      from_run_id: run1.run_id,
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toMatchObject({ code: 'STRATEGY_NAME_TAKEN' });

    const v2 = rsiContent(12);
    const run2 = await runDraft(v2);
    const save = () =>
      call('POST', `/api/v2/strategy/strategies/${id}/versions`, {
        content: v2,
        from_run_id: run2.run_id,
        expected_latest_version: 1,
      });
    const [a, b] = await Promise.all([save(), save()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect([a, b].find((response) => response.statusCode === 409)!.json().error).toMatchObject({
      code: 'STRATEGY_VERSION_CONFLICT',
    });

    const restored = await call('POST', `/api/v2/strategy/strategies/${id}/versions/1/restore`, {
      expected_latest_version: 2,
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect((restored.json() as Json).version).toMatchObject({ version: 3, content: v1 });
    const versions = (
      await call('GET', `/api/v2/strategy/strategies/${id}/versions`)
    ).json() as Json;
    expect(versions.items.map((item: Json) => item.version)).toEqual([3, 2, 1]);
    expect(versions.items[0].note).toMatch(/^Khôi phục từ bản /);

    // A run of the saved strategy is labelled with its name and found by the strategy filter.
    const mine = await call('POST', '/api/v2/strategy/backtests', {
      idempotency_key: `w2-run-${++key}`,
      strategy: { source: 'user', id },
      start: CAL[460],
      end: CAL.at(-1),
    });
    expect(mine.statusCode).toBe(201);
    expect((mine.json() as Json).snapshot.strategy_ref).toEqual({ source: 'user', id, version: 3 });
    const filtered = (
      await call('GET', `/api/v2/strategy/backtests?strategy_source=user&strategy_id=${id}`)
    ).json() as Json;
    expect(filtered.items).toHaveLength(1);

    expect((await call('DELETE', `/api/v2/strategy/strategies/${id}`)).statusCode).toBe(204);
    expect(((await call('GET', '/api/v2/strategy/strategies')).json() as Json).items).toEqual([]);
    // The run keeps its label after the strategy is deleted.
    const old = (
      await call('GET', `/api/v2/strategy/backtests/${(mine.json() as Json).run_id}`)
    ).json() as Json;
    expect(old.snapshot.strategy_label).toBe('RSI');
  });

  it('IQX strategies are v2 (VN30, Giữ tối đa 30) with versions for users; runs record strategy_run', async () => {
    const list = (await call('GET', '/api/v2/strategy/iqx-templates?kind=strategy')).json() as Json;
    expect(list.items).toHaveLength(5);
    for (const item of list.items as Json[])
      expect(item).toMatchObject({
        version: 2,
        current_version: 2,
        universe: { type: 'vn30' },
        max_holding: 30,
        on_bot: { last: false, next: false },
      });
    const first = list.items[0] as Json;
    const versions = (
      await call('GET', `/api/v2/strategy/iqx-templates/${first.id}/versions`)
    ).json() as Json;
    expect(versions.items.map((item: Json) => [item.version, item.current])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(versions.items[0].reason).toBe('Thêm rổ mã; giữ tối đa 30 phiên');
    const run = await call('POST', '/api/v2/strategy/backtests', {
      idempotency_key: `w2-run-${++key}`,
      strategy: { source: 'iqx', id: first.id },
      start: CAL[460],
      end: CAL.at(-1),
    });
    expect(run.statusCode, run.body).toBe(201);
    expect((run.json() as Json).snapshot.result_label).toBe(
      `Chiến lược IQX · ${first.content.name} v2`,
    );
    const [event] = await stack.query<{ event: string }>(
      `select event from iqx_template_used where template_id = $1 and user_id = $2`,
      [first.id, user.id],
    );
    expect(event?.event).toBe('strategy_run');
  });

  it('PATCH shared-config is retired with 410 SHARED_CONFIG_RETIRED', async () => {
    const response = await call('PATCH', '/api/v2/strategy/shared-config', {
      expected_revision: 0,
      idempotency_key: 'retired-0001',
      indicators: {},
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().error).toMatchObject({ code: 'SHARED_CONFIG_RETIRED' });
  });
});
