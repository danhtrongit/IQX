import { randomUUID } from 'node:crypto';

import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import { StrategiesService } from '../../src/modules/strategies/strategies.service.js';
import { StrategyBacktestExecutor } from '../../src/modules/strategy-backtests/strategy-backtests.executor.js';
import type {
  BacktestListFilter,
  BacktestRunRecord,
  BacktestRunRow,
  BacktestRunSummaryRow,
  StrategyBacktestStore,
} from '../../src/modules/strategy-backtests/strategy-backtests.repository.js';
import { backtestRunBodySchema } from '../../src/modules/strategy-backtests/strategy-backtests.schemas.js';
import { StrategyBacktestsService } from '../../src/modules/strategy-backtests/strategy-backtests.service.js';
import {
  BOT_SCHEDULE_PORT,
  strategyConfigHash,
  type PriceSeriesBundle,
  type PriceStorePort,
  type ResolvedStrategy,
  type StrategyContent,
  type StrategyReaderPort,
  type SymbolSeries,
} from '../../src/modules/strategy-rules/index.js';
import type { DatabaseService } from '../../src/platform/database/index.js';

const USER = '00000000-0000-4000-8000-000000000001';
const IQX_ID = '00000000-0000-4000-8000-0000000000aa';
const MINE_ID = '00000000-0000-4000-8000-0000000000bb';

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

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

const CAL = weekdays('2023-01-02', 700);
const VN30 = ['AAA', 'BBB', 'CCC', 'DDD'];
const VN100 = [...VN30, 'EEE', 'FFF'];

function bundle(symbols: readonly string[]): PriceSeriesBundle {
  const out: Record<string, SymbolSeries> = {};
  for (const symbol of symbols) {
    const k = VN100.indexOf(symbol);
    const rand = lcg(1_000 + k * 7_919);
    const n = CAL.length;
    const close = new Float64Array(n);
    const open = new Float64Array(n);
    const high = new Float64Array(n);
    const low = new Float64Array(n);
    const volume = new Float64Array(n);
    let price = 10_000 + k * 1_000;
    for (let i = 0; i < n; i += 1) {
      const o = price;
      price = Math.max(1_000, Math.round(price * (1 + (rand() - 0.5) * 0.06)));
      open[i] = o;
      close[i] = price;
      high[i] = Math.max(o, price) + 50;
      low[i] = Math.min(o, price) - 50;
      volume[i] = Math.round(100_000 + rand() * 900_000);
    }
    out[symbol] = {
      symbol,
      session_idx: Int32Array.from({ length: n }, (_, i) => i),
      open,
      high,
      low,
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
    data_hash: 'c'.repeat(64),
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

/** RSI < 45 buys, RSI > 55 sells: trades often on a random walk. */
function rsiContent(
  maxHolding: number,
  universe: StrategyContent['universe'] = { type: 'vn30' },
): StrategyContent {
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
  return { universe, indicators, max_holding: maxHolding };
}

class InMemoryStore implements StrategyBacktestStore {
  rows: BacktestRunRow[] = [];
  events: Array<{ templateId: string; version: number; event: string }> = [];
  async findByIdempotencyKey(userId: string, key: string) {
    return this.rows.find((row) => row.user_id === userId && row.idempotency_key === key) ?? null;
  }
  async insert(record: BacktestRunRecord) {
    if (await this.findByIdempotencyKey(record.user_id, record.idempotency_key)) return null;
    const row = { ...structuredClone(record), id: randomUUID(), created_at: new Date() };
    this.rows.push(row);
    return row;
  }
  async findById(userId: string, id: string) {
    return this.rows.find((row) => row.user_id === userId && row.id === id) ?? null;
  }
  async list(userId: string, filter: BacktestListFilter): Promise<BacktestRunSummaryRow[]> {
    return this.rows
      .filter(
        (row) =>
          row.user_id === userId &&
          (!filter.strategy_source || row.strategy_source === filter.strategy_source) &&
          (!filter.strategy_id || row.strategy_ref_id === filter.strategy_id),
      )
      .reverse()
      .slice(0, filter.limit)
      .map((row) => {
        const snapshot = (row.snapshot ?? {}) as Record<string, string | null>;
        const request = row.request as Record<string, unknown>;
        return {
          id: row.id,
          kind: row.kind,
          status: row.status,
          strategy_source: row.strategy_source,
          strategy_ref_id: row.strategy_ref_id,
          strategy_version: row.strategy_version,
          created_at: row.created_at,
          config_hash: row.config_hash,
          strategy_label: snapshot.strategy_label ?? null,
          version_label: snapshot.version_label ?? null,
          universe_label: snapshot.universe_label ?? null,
          start: (request.start as string) ?? null,
          end: (request.end as string) ?? null,
          symbol: (request.symbol as string) ?? null,
          kpis:
            row.kind === 'basket'
              ? ((row.result as Record<string, unknown>).kpis as Record<string, unknown>)
              : ((row.result as Record<string, unknown> | null)?.kpis as Record<string, unknown>),
        };
      });
  }
  async recordIqxEvent(templateId: string, version: number, _userId: string, event: string) {
    this.events.push({ templateId, version, event });
  }
}

function setup(
  options: {
    granted?: string[];
    hiddenIqx?: boolean;
    botUses?: boolean;
  } = {},
) {
  const store = new InMemoryStore();
  const iqxContent = rsiContent(30);
  const mineContent = rsiContent(10, { type: 'vn100' });
  const reader: StrategyReaderPort = {
    resolve: async (_userId, ref) => {
      const make = (resolved: Omit<ResolvedStrategy, 'config_hash'>): ResolvedStrategy => ({
        ...resolved,
        config_hash: strategyConfigHash(resolved.content),
      });
      if (ref.source === 'iqx' && (ref.id === IQX_ID || ref.id === 'phadinh'))
        return make({
          ref: { source: 'iqx', id: IQX_ID, version: ref.version ?? 2 },
          name: 'Phá đỉnh',
          version_label: `v${ref.version ?? 2}`,
          content: iqxContent,
          hidden: options.hiddenIqx ?? false,
          deleted: false,
        });
      if (ref.source === 'user' && ref.id === MINE_ID)
        return make({
          ref: { source: 'user', id: MINE_ID, version: ref.version ?? 3 },
          name: 'RSI của tôi',
          version_label: 'bản 08/11 13:20',
          content: mineContent,
          hidden: false,
          deleted: false,
        });
      return null;
    },
  };
  const schedule = {
    usage: async () => ({ last: false, next: options.botUses ?? false }),
  };
  const moduleRef = {
    get: (token: unknown) => {
      if (token === BOT_SCHEDULE_PORT) return schedule;
      throw new Error('unknown');
    },
  } as unknown as ModuleRef;
  const strategies = new StrategiesService({} as DatabaseService, undefined, prices);
  const granted = new Set((options.granted ?? ['rsi']).map((id) => `indicator:${id}`));
  const service = new StrategyBacktestsService(
    store,
    reader,
    { grantedCapabilities: async () => granted },
    strategies,
    new StrategyBacktestExecutor(),
    moduleRef,
    prices,
  );
  return { service, store, iqxContent, mineContent };
}

const START = CAL[460]!;
const END = CAL.at(-1)!;

const body = (strategy: unknown, extra: Record<string, unknown> = {}) =>
  backtestRunBodySchema.parse({
    idempotency_key: `key-${randomUUID()}`,
    strategy,
    start: START,
    end: END,
    ...extra,
  });

describe('POST /backtests basket mode (spec v2.0 §4, §10.3)', () => {
  it('refuses the pre-22-11 fields with 422 STRATEGY_INVALID', async () => {
    const { service } = setup();
    for (const extra of [
      { symbol: 'FPT' },
      { shared_revision: 3 },
      { assumptions: {} },
      { research: {} },
      { system: {} },
    ])
      await expect(
        service.create(USER, body({ source: 'iqx', id: IQX_ID }, extra)),
      ).rejects.toMatchObject({ response: { code: 'STRATEGY_INVALID' } });
  });

  it('S11 draft with Giữ tối đa 5: every closed trade held ≤ 5 sessions, none sold before entry+2', async () => {
    const { service, store } = setup();
    const content = rsiContent(5);
    const view = await service.create(USER, body({ source: 'draft', content, base: null }));
    expect(view.legacy).toBe(false);
    const trades = view.result!.trades as unknown as Array<{
      holding_sessions: number;
      exit_reason: string;
      exit_reasons: string[];
    }>;
    expect(trades.length).toBeGreaterThan(0);
    for (const trade of trades) {
      expect(trade.holding_sessions).toBeLessThanOrEqual(5);
      expect(trade.holding_sessions).toBeGreaterThanOrEqual(2);
    }
    expect(trades.some((trade) => trade.exit_reason === 'max_holding')).toBe(true);
    expect(view.result!.time_exits).toBe(
      trades.filter((trade) => trade.exit_reason === 'max_holding').length,
    );
    // Snapshot §10.3 + money as strings.
    expect(view.snapshot).toMatchObject({
      strategy_ref: { source: 'draft', id: null, version: null },
      strategy_label: 'Bản nháp',
      result_label: 'Bản nháp',
      config_hash: strategyConfigHash(content),
      universe_label: 'VN30',
      universe_resolved: VN30,
      excluded_symbols: [],
      data_store: 'flashback_vn100',
      data_as_of: END,
      price_unit: 'VND',
      adjusted: true,
      rules_version: 'iqx-strategy-rules-2.0',
      initial_cash_vnd: '100000000',
      fee_rules: { buy_fee_bps: 15, sell_fee_bps: 15, sell_tax_bps: 10, lot_size: 100 },
    });
    expect(view.snapshot!.warnings.map((warning) => warning.code)).toContain(
      'UNIVERSE_CURRENT_MEMBERS',
    );
    expect(view.snapshot!.subtitle).toContain('giữ tối đa 5 phiên');
    expect(view.result!.final_nav_vnd).toMatch(/^\d+$/);
    expect(Object.keys(view.result!.kpis)).toEqual(
      expect.arrayContaining([
        'total_return_pct',
        'annualized_return_pct',
        'max_drawdown_pct',
        'closed_trades',
        'win_rate_pct',
        'basket_buy_hold_pct',
        'vnindex_pct',
      ]),
    );
    // Stored JSON-safe (no bigint) and found by the list.
    expect(() => JSON.stringify(store.rows[0]!.result)).not.toThrow();
    expect(store.rows[0]).toMatchObject({
      kind: 'basket',
      shared_revision: null,
      strategy_source: 'draft',
    });
    const list = await service.list(USER, { limit: 20 });
    expect(list.items[0]).toMatchObject({
      run_id: view.run_id,
      legacy: false,
      strategy_label: 'Bản nháp',
      universe_label: 'VN30',
      start: START,
      end: END,
    });
    // Trades page: newest exit first, total = whole run.
    const page = await service.trades(USER, view.run_id, 0, 3);
    expect(page.total).toBe(trades.length);
    expect(page.items[0]).toEqual(trades.at(-1));
  });

  it('replays an idempotency key; another payload with the same key is 409', async () => {
    const { service, store } = setup();
    const request = body({ source: 'iqx', id: IQX_ID });
    const first = await service.create(USER, request);
    const again = await service.create(USER, request);
    expect(again.run_id).toBe(first.run_id);
    expect(store.rows).toHaveLength(1);
    await expect(service.create(USER, { ...request, end: CAL.at(-2)! })).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('IQX run: label `Chiến lược IQX · {tên} v{n}`, strategy_run event; hidden only when the Bot uses it', async () => {
    const shown = setup();
    const view = await shown.service.create(USER, body({ source: 'iqx', id: 'phadinh' }));
    expect(view.snapshot).toMatchObject({
      strategy_ref: { source: 'iqx', id: IQX_ID, version: 2 },
      result_label: 'Chiến lược IQX · Phá đỉnh v2',
    });
    expect(shown.store.events).toEqual([{ templateId: IQX_ID, version: 2, event: 'strategy_run' }]);
    // IQX runs need no indicator grant (read-only templates).
    const ungranted = setup({ granted: [] });
    await expect(
      ungranted.service.create(USER, body({ source: 'iqx', id: IQX_ID })),
    ).resolves.toBeTruthy();

    const hidden = setup({ hiddenIqx: true });
    await expect(
      hidden.service.create(USER, body({ source: 'iqx', id: IQX_ID })),
    ).rejects.toMatchObject({
      response: { code: 'IQX_TEMPLATE_HIDDEN' },
    });
    const pinned = setup({ hiddenIqx: true, botUses: true });
    await expect(
      pinned.service.create(USER, body({ source: 'iqx', id: IQX_ID })),
    ).resolves.toBeTruthy();
    await expect(
      shown.service.create(USER, body({ source: 'iqx', id: 'khong-co' })),
    ).rejects.toMatchObject({ response: { code: 'IQX_TEMPLATE_NOT_FOUND' } });
  });

  it('user strategy run: `{tên} · bản …` and filter by strategy id; unknown id is 404', async () => {
    const { service, mineContent } = setup();
    const view = await service.create(USER, body({ source: 'user', id: MINE_ID }));
    expect(view.snapshot).toMatchObject({
      strategy_ref: { source: 'user', id: MINE_ID, version: 3 },
      result_label: 'RSI của tôi · bản 08/11 13:20',
      universe_resolved: VN100,
      config_hash: strategyConfigHash(mineContent),
    });
    const draft = await service.create(
      USER,
      body({ source: 'draft', content: rsiContent(12), base: { id: MINE_ID, version: 3 } }),
    );
    expect(draft.snapshot!.result_label).toBe('Bản nháp · sửa từ RSI của tôi');
    await service.create(USER, body({ source: 'iqx', id: IQX_ID }));
    const mine = await service.list(USER, { strategy_id: MINE_ID, limit: 20 });
    expect(mine.items.map((item) => item.run_id)).toEqual([draft.run_id, view.run_id]);
    await expect(
      service.create(USER, body({ source: 'user', id: randomUUID() })),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_NOT_FOUND' } });
  });

  it('S09 saved list: symbols outside VN100 are excluded with a warning; all outside is UNIVERSE_EMPTY', async () => {
    const { service } = setup();
    const view = await service.create(
      USER,
      body({
        source: 'draft',
        content: rsiContent(30, {
          type: 'saved_list',
          list_id: 'l1',
          list_name: 'ROE',
          symbols: ['AAA', 'EEE', 'VIX'],
        }),
      }),
    );
    expect(view.snapshot).toMatchObject({
      universe_resolved: ['AAA', 'EEE'],
      universe_label: 'ROE',
    });
    expect((view.snapshot!.content.universe as { symbols: string[] }).symbols).toEqual([
      'AAA',
      'EEE',
    ]);
    expect(view.snapshot!.warnings.map((warning) => warning.code)).toContain('UNIVERSE_SNAPSHOT');
    await expect(
      service.create(
        USER,
        body({
          source: 'draft',
          content: rsiContent(30, {
            type: 'saved_list',
            list_id: 'l1',
            list_name: 'X',
            symbols: ['VIX', 'SHS'],
          }),
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'UNIVERSE_EMPTY' } });
  });

  it('S06 refuses invalid drafts, date ranges outside the store, and locked indicators', async () => {
    const { service } = setup();
    const noBuy = rsiContent(30);
    noBuy.indicators.rsi!.buy.enabled = false;
    await expect(
      service.create(USER, body({ source: 'draft', content: noBuy })),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_INVALID' } });
    await expect(
      service.create(USER, body({ source: 'draft', content: rsiContent(30) }, { start: CAL[10]! })),
    ).rejects.toMatchObject({ response: { code: 'DATE_RANGE_INVALID' } });
    const locked = setup({ granted: [] });
    await expect(
      locked.service.create(USER, body({ source: 'draft', content: rsiContent(30) })),
    ).rejects.toMatchObject({ response: { code: 'CAPABILITY_LOCKED' } });
  });

  it('trial (admin "Chạy để thử") answers without storing; only for drafts', async () => {
    const { service, store } = setup();
    const view = await service.create(
      USER,
      body({ source: 'draft', content: rsiContent(30) }, { trial: true }),
    );
    expect(view.trial).toBe(true);
    expect(store.rows).toHaveLength(0);
    await expect(
      service.create(USER, body({ source: 'iqx', id: IQX_ID }, { trial: true })),
    ).rejects.toMatchObject({ response: { code: 'STRATEGY_INVALID' } });
  });

  it('S13 legacy runs are read-only: legacy flag + three numbers, no trades', async () => {
    const { service, store } = setup();
    const legacy: BacktestRunRow = {
      id: randomUUID(),
      created_at: new Date('2026-11-01T00:00:00Z'),
      user_id: USER,
      kind: 'single',
      shared_revision: 4,
      strategy_source: null,
      strategy_ref_id: null,
      strategy_version: null,
      request: { symbol: 'FPT', start: '2024-01-02', end: '2025-01-02' },
      request_hash: 'a'.repeat(64),
      snapshot: {},
      result: {
        kpis: { net_return: 12.5, max_drawdown: -8.1, n_trades: 7, buy_hold_return: 3, cagr: 5 },
      },
      config_hash: 'b'.repeat(64),
      data_hash: null,
      engine_version: 'e',
      calculation_version: 'c',
      rule_version: 'r',
      idempotency_key: 'legacy-key-1',
      status: 'succeeded',
      error: null,
    };
    store.rows.push(legacy);
    const view = await service.get(USER, legacy.id);
    expect(view).toMatchObject({
      legacy: true,
      snapshot: null,
      result: null,
      legacy_view: {
        symbol: 'FPT',
        kpis: { total_return_pct: 12.5, max_drawdown_pct: -8.1, closed_trades: 7 },
      },
    });
    expect((await service.list(USER, { limit: 5 })).items[0]).toMatchObject({
      legacy: true,
      strategy_label: 'Cấu hình cũ',
      universe_label: 'FPT',
      kpis: { total_return_pct: 12.5, max_drawdown_pct: -8.1, closed_trades: 7 },
    });
    await expect(service.trades(USER, legacy.id, 0, 20)).rejects.toMatchObject({
      response: { code: 'BACKTEST_RESULT_NOT_FOUND' },
    });
  });
});
