import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { definitionHash } from '../../src/modules/alerts/strategy-alerts.evaluation.js';
import { StrategyAlertEvaluator } from '../../src/modules/alerts/strategy-alerts.evaluator.js';
import type { OhlcvRecord } from '../../src/modules/quant/indicators.js';
import type {
  HistoricalBars,
  QuantMarketDataProvider,
} from '../../src/modules/quant/quant.types.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  configHash,
  defaultConfig,
  type ConditionRow,
  type IndicatorConfig,
  type RowSideConfig,
  type SharedConfig,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import type { NewVersionInput } from '../../src/modules/alerts/strategy-alerts.store.js';
import { MemoryAlertStore } from './helpers/strategy-alerts-memory.js';
import { preV3Config } from './helpers/strategy-pre-v3.js';

const USER = '00000000-0000-4000-8000-0000000000a1';
const USER_2 = '00000000-0000-4000-8000-0000000000b2';
const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

/** Row 1 of an MA tab: `ma.price_cross`. */
const priceCross = (config: SharedConfig, side: Side): ConditionRow =>
  ((config.indicators.ma as IndicatorConfig)[side] as RowSideConfig).rules[0]!;

/**
 * Buy: close crosses above SMA(buyPeriod); Sell: close crosses below SMA(sellPeriod)
 * (row `ma.price_cross`; the period is an SMA preset: 5, 10, 20, 50, 100, 200).
 */
function maConfig(buyPeriod = 5, sellPeriod = 5, sides: Side[] = ['buy', 'sell']): SharedConfig {
  const config = defaultConfig();
  const ma = config.indicators.ma as IndicatorConfig;
  ma.master_enabled = true;
  ma.buy.enabled = sides.includes('buy');
  ma.sell.enabled = sides.includes('sell');
  priceCross(config, 'buy').period = buyPeriod;
  priceCross(config, 'sell').period = sellPeriod;
  return config;
}

const records = (closes: readonly number[]): OhlcvRecord[] =>
  closes.map((close, i) => ({
    time: day(i),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }));

/**
 * Closes whose MA(5) buy verdicts are: day5 false, day6 true, day7 true, day8 true, day9 false,
 * day10 true (and MA(5) sell true only on day9).
 */
const S1 = [10, 10, 10, 10, 10, 10, 12, 13, 14, 9, 15];
/** On day10 (close 17 -> 15): close crosses above SMA(5) (17.4 -> 12.4) and below SMA(10) (15.7 -> 16.2). */
const BOTH = [10, 15, 15, 15, 15, 40, 10, 10, 10, 17, 15];
const FLAT = Array.from({ length: 11 }, () => 10);

class FakeMarket implements QuantMarketDataProvider {
  readonly calls: string[] = [];
  constructor(readonly series: Map<string, OhlcvRecord[]>) {}

  getHistoricalOhlcv(symbol: string, _start: string, end: string): Promise<HistoricalBars> {
    this.calls.push(`${symbol}@${end}`);
    const rows = this.series.get(symbol);
    if (!rows)
      return Promise.reject(
        new NotFoundException({ code: 'MARKET_HISTORY_NOT_FOUND', message: 'missing' }),
      );
    return Promise.resolve({
      records: rows.filter((row) => row.time <= end),
      startIndex: 0,
      source: 'fake-feed',
    });
  }
}

function setup() {
  const store = new MemoryAlertStore();
  const market = new FakeMarket(
    new Map([
      ['VNINDEX', records(FLAT)],
      ['FPT', records(S1)],
      ['VNM', records(FLAT)],
      ['HPG', records(BOTH)],
    ]),
  );
  let granted = new Set(['indicator:ma']);
  const grants: AcademyGrantsPort = { grantedCapabilities: () => Promise.resolve(granted) };
  const evaluator = new StrategyAlertEvaluator(store, grants, market);

  const seed = async (options: {
    userId?: string;
    name?: string;
    config?: unknown;
    symbols?: string[];
    sides?: Side[];
    enabled?: boolean;
  }) => {
    const config = ('config' in options ? options.config : maConfig()) as SharedConfig;
    const symbols = options.symbols ?? ['FPT'];
    const sides = options.sides ?? ['buy'];
    const hash = configHash(config);
    const version: NewVersionInput = {
      source: {
        kind: 'shared_config',
        revision: 1,
        saved_at: '2026-01-01T00:00:00Z',
        stored_config_hash: hash,
      },
      config,
      config_hash: hash,
      schema_version: SCHEMA_VERSION,
      rule_version: RULE_VERSION,
      calculation_version: 'iqx-ta-2.0',
      scope: { kind: 'symbols' },
      symbols,
      sides,
      definition_hash: definitionHash({
        config_hash: hash,
        symbols,
        sides,
        scope: { kind: 'symbols' },
      }),
    };
    const created = await store.create({
      user_id: options.userId ?? USER,
      name: options.name ?? `Cảnh báo ${store.alerts.size + 1}`,
      enabled: options.enabled ?? true,
      version,
      idempotency_key: null,
      request_hash: 'h'.repeat(64),
    });
    return created.id;
  };
  return {
    store,
    market,
    evaluator,
    seed,
    setGrants: (next: string[]) => (granted = new Set(next)),
  };
}

const at = (hour: number) => new Date(`2026-01-10T${String(hour).padStart(2, '0')}:00:00.000Z`);

describe('StrategyAlertEvaluator — end-of-session transitions', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('A07 the first valid check that is true records "Đang thỏa ở lần kiểm tra đầu"', async () => {
    const id = await env.seed({});
    const summary = await env.evaluator.evaluateSession(day(6), at(9));
    expect(summary).toMatchObject({
      session: day(6),
      alerts: 1,
      pairs_due: 1,
      pairs_evaluated: 1,
      events_created: 1,
      results: { true: 1, false: 0, unknown: 0 },
    });
    expect(env.store.events).toHaveLength(1);
    expect(env.store.events[0]).toMatchObject({
      alert_id: id,
      alert_version: 1,
      symbol: 'FPT',
      side: 'buy',
      signal_session: day(6),
      event_kind: 'first_observation',
      message: 'Thỏa điều kiện Mua',
      previous_valid_result: null,
      previous_valid_session: null,
      rule_version: RULE_VERSION,
      calculation_version: 'iqx-ta-2.0',
      config_hash: configHash(maConfig()),
    });
  });

  it('A08 false then true is one new-signal event, with the previous valid session recorded', async () => {
    await env.seed({});
    await env.evaluator.evaluateSession(day(5), at(9));
    expect(env.store.events).toHaveLength(0);
    await env.evaluator.evaluateSession(day(6), at(9));
    expect(env.store.events).toHaveLength(1);
    expect(env.store.events[0]).toMatchObject({
      event_kind: 'new_signal',
      signal_session: day(6),
      previous_valid_result: false,
      previous_valid_session: day(5),
    });
  });

  it('A09 three consecutive true sessions send one signal; losing and regaining the condition sends another', async () => {
    await env.seed({});
    for (const i of [5, 6, 7, 8]) await env.evaluator.evaluateSession(day(i), at(9));
    expect(env.store.events.map((event) => event.signal_session)).toEqual([day(6)]);
    // day9 false (no event for losing it), day10 true again => a new signal.
    await env.evaluator.evaluateSession(day(9), at(9));
    expect(env.store.events).toHaveLength(1);
    await env.evaluator.evaluateSession(day(10), at(9));
    expect(env.store.events.map((event) => [event.signal_session, event.event_kind])).toEqual([
      [day(6), 'new_signal'],
      [day(10), 'new_signal'],
    ]);
  });

  it('A10 true, then a session without data, then true again is not a new signal', async () => {
    await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    // The feed loses day7: FPT's latest bar stays day6.
    env.market.series.set(
      'FPT',
      records(S1).filter((row) => row.time !== day(7)),
    );
    const gap = await env.evaluator.evaluateSession(day(7), at(9));
    expect(gap.results.unknown).toBe(1);
    expect(env.store.events).toHaveLength(1);
    const state = [...env.store.states.values()][0]!;
    expect(state).toMatchObject({
      last_result: 'unknown',
      last_reason: 'no_bar_for_session',
      last_valid_result: true,
      last_valid_session: day(6),
    });
    // Feed restored for day8.
    env.market.series.set('FPT', records(S1));
    await env.evaluator.evaluateSession(day(8), at(9));
    expect(env.store.events).toHaveLength(1);
  });

  it('A11 a symbol nobody holds or hunts still produces the signal, and never mentions the Bot', async () => {
    await env.seed({ config: maConfig(5, 5, ['sell']), sides: ['sell'] });
    await env.evaluator.evaluateSession(day(9), at(9));
    expect(env.store.events).toHaveLength(1);
    expect(env.store.events[0]).toMatchObject({ side: 'sell', message: 'Thỏa điều kiện Bán' });
    expect(JSON.stringify(env.store.events)).not.toMatch(/Bot đã/i);
  });

  it('A12 buy and sell true on the same session are two independent signals', async () => {
    await env.seed({ config: maConfig(5, 10), symbols: ['HPG'], sides: ['buy', 'sell'] });
    const summary = await env.evaluator.evaluateSession(day(10), at(9));
    expect(summary.events_created).toBe(2);
    expect(env.store.events.map((event) => event.side).sort()).toEqual(['buy', 'sell']);
    expect(new Set(env.store.events.map((event) => event.id)).size).toBe(2);
  });

  it('records, per evaluated row, the values and operator the verdict used, and the bar of the session', async () => {
    await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    const event = env.store.events[0]!;
    expect(event.evidence).toMatchObject({
      session: day(6),
      bar: { date: day(6), close: 12 },
      indicator_ids: ['ma'],
    });
    // The row's own values replace the per-indicator `indicator_params` of events before SPEC V3.
    expect(event.evidence).not.toHaveProperty('indicator_params');
    const rules = event.evidence.rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule).toMatchObject({
      id: 'ma.price_cross',
      indicator: 'ma',
      side: 'buy',
      op: 'cross_up',
      lhs: 12,
      result: true,
      missing: false,
      values: { op: 'cross_up', period: 5 },
    });
    expect(rule.rhs).toBeCloseTo(10.4, 12);
    expect(event.data_version).toMatch(/^[a-f0-9]{64}$/);
    expect(event.evaluated_at).toEqual(at(9));
  });

  it('records one evidence entry per enabled row, each with its own periods', async () => {
    const config = maConfig(5, 5, ['buy']);
    const rows = ((config.indicators.ma as IndicatorConfig).buy as RowSideConfig).rules;
    Object.assign(
      rows.find((row) => row.id === 'ma.trend')!,
      {
        enabled: true,
        period: 10,
        dir: 'up',
      },
    );
    // 24 flat sessions, then a jump: the price crosses up SMA 5 and SMA 10 turns up on the last one.
    const closes = [...Array<number>(24).fill(10), 12];
    env.market.series.set('FPT', records(closes));
    env.market.series.set('VNINDEX', records(closes));
    await env.seed({ config });
    const summary = await env.evaluator.evaluateSession(day(24), at(9));
    expect(summary).toMatchObject({
      events_created: 1,
      results: { true: 1, false: 0, unknown: 0 },
    });
    const rules = env.store.events[0]!.evidence.rules as Array<Record<string, unknown>>;
    expect(rules.map((rule) => [rule.id, rule.result])).toEqual([
      ['ma.price_cross', true],
      ['ma.trend', true],
    ]);
    expect(rules.map((rule) => rule.values)).toEqual([
      { op: 'cross_up', period: 5 },
      { period: 10, dir: 'up' },
    ]);
  });

  it('never looks past the session: later bars in the feed do not change the verdict or data version', async () => {
    await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    const early = env.store.events[0]!.data_version;
    expect(env.market.calls).toContain(`FPT@${day(6)}`);
    const alone = setup();
    alone.market.series.set('FPT', records(S1.slice(0, 7)));
    await alone.seed({});
    await alone.evaluator.evaluateSession(day(6), at(9));
    expect(alone.store.events[0]!.data_version).toBe(early);
  });
});

describe('StrategyAlertEvaluator — durability, pause and data readiness', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it('A13 a retry or a second worker cannot write the same event twice', async () => {
    await env.seed({});
    await Promise.all([
      env.evaluator.evaluateSession(day(6), at(9)),
      env.evaluator.evaluateSession(day(6), at(9)),
    ]);
    await env.evaluator.evaluateSession(day(6), at(10));
    expect(env.store.events).toHaveLength(1);
  });

  it('A13 the durable key also holds when the state was lost: the duplicate is counted, not written', async () => {
    const id = await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    // Simulate a worker that lost its state row (e.g. restored backup) but the event survived.
    env.store.states.clear();
    const summary = await env.evaluator.evaluateSession(day(6), at(10));
    expect(summary).toMatchObject({ events_created: 0, duplicates: 1 });
    expect(env.store.events.filter((event) => event.alert_id === id)).toHaveLength(1);
  });

  it('A14 a paused alert records nothing; resuming observes the current state without replaying the pause', async () => {
    const id = await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    await env.store.update(USER, id, { enabled: false });
    for (const i of [7, 8, 9]) {
      const summary = await env.evaluator.evaluateSession(day(i), at(9));
      expect(summary.skipped).toBe('no_active_alerts');
    }
    expect(env.store.events).toHaveLength(1);
    await env.store.update(USER, id, { enabled: true });
    // Resumed on day10: the condition holds (true). It is a fresh observation, one event only.
    const summary = await env.evaluator.evaluateSession(day(10), at(9));
    expect(summary.events_created).toBe(1);
    expect(
      env.store.events.map((event) => [event.signal_session, event.event_kind]).sort(),
    ).toEqual(
      [
        [day(10), 'first_observation'],
        [day(6), 'first_observation'],
      ].sort(),
    );
    // None of the sessions skipped while paused (day7..day9) produced an event.
    expect(
      env.store.events.some((event) => [day(7), day(8), day(9)].includes(event.signal_session)),
    ).toBe(false);
  });

  it('A14 resuming within the session that already has its event is deduplicated', async () => {
    const id = await env.seed({});
    await env.evaluator.evaluateSession(day(6), at(9));
    await env.store.update(USER, id, { enabled: false });
    await env.store.update(USER, id, { enabled: true });
    const summary = await env.evaluator.evaluateSession(day(6), at(10));
    expect(summary).toMatchObject({ pairs_evaluated: 1, events_created: 0, duplicates: 1 });
    expect(env.store.events).toHaveLength(1);
  });

  it('A15/A16 renaming changes nothing for the evaluator; old events keep their name and snapshot', async () => {
    const id = await env.seed({ name: 'Tên cũ' });
    await env.evaluator.evaluateSession(day(6), at(9));
    await env.store.update(USER, id, { name: 'Tên mới' });
    await env.evaluator.evaluateSession(day(7), at(9));
    expect(env.store.events).toHaveLength(1);
    expect(env.store.events[0]).toMatchObject({
      alert_name: 'Tên cũ',
      alert_version: 1,
      config_hash: configHash(maConfig()),
    });
    // A new definition version starts its own states and its own events.
    const next = { ...env.store.versionRows[0]! };
    await env.store.update(USER, id, {
      version: {
        source: next.source,
        config: maConfig(10, 10),
        config_hash: configHash(maConfig(10, 10)),
        schema_version: next.schema_version,
        rule_version: next.rule_version,
        calculation_version: next.calculation_version,
        scope: next.scope,
        symbols: next.symbols,
        sides: next.sides,
        definition_hash: 'd'.repeat(64),
      },
    });
    await env.evaluator.evaluateSession(day(10), at(9));
    expect(env.store.events.map((event) => [event.alert_version, event.alert_name])).toEqual(
      expect.arrayContaining([
        [1, 'Tên cũ'],
        [2, 'Tên mới'],
      ]),
    );
    // Version 1's evidence is still version 1's snapshot.
    expect(env.store.events.find((event) => event.alert_version === 1)!.config_hash).toBe(
      configHash(maConfig()),
    );
  });

  it('A17 a benchmark without the session bar means the daily data is not complete: nothing is judged', async () => {
    await env.seed({});
    env.market.series.set('VNINDEX', records(FLAT.slice(0, 6)));
    const summary = await env.evaluator.evaluateSession(day(6), at(9));
    expect(summary.skipped).toBe('daily_data_not_ready');
    expect(env.store.states.size).toBe(0);
    expect(env.store.events).toHaveLength(0);
    expect(env.market.calls.some((call) => call.startsWith('FPT@'))).toBe(false);
  });

  it('A17 one symbol with a missing bar is unknown; the other symbols are still evaluated', async () => {
    await env.seed({ symbols: ['FPT', 'VNM'] });
    env.market.series.set('VNM', records(FLAT.slice(0, 6))); // no bar for day6
    const summary = await env.evaluator.evaluateSession(day(6), at(9));
    expect(summary).toMatchObject({
      pairs_evaluated: 2,
      results: { true: 1, false: 0, unknown: 1 },
      symbols_without_bar: 1,
      events_created: 1,
    });
    const vnm = [...env.store.states.values()].find((state) => state.symbol === 'VNM')!;
    expect(vnm).toMatchObject({ last_result: 'unknown', last_reason: 'no_bar_for_session' });
  });

  it('a symbol whose history cannot be fetched is unknown (market_data_unavailable) and does not stop the run', async () => {
    await env.seed({ symbols: ['FPT', 'NOPE'] });
    const summary = await env.evaluator.evaluateSession(day(6), at(9));
    expect(summary).toMatchObject({ pairs_evaluated: 2, events_created: 1, errors: 0 });
    const missing = [...env.store.states.values()].find((state) => state.symbol === 'NOPE')!;
    expect(missing.last_reason).toBe('market_data_unavailable');
  });

  it('retries an unknown pair within the session once the data arrives, then stops retrying', async () => {
    await env.seed({});
    env.market.series.set('FPT', records(S1.slice(0, 6))); // day6 missing
    expect((await env.evaluator.evaluateSession(day(6), at(9))).results.unknown).toBe(1);
    env.market.series.set('FPT', records(S1));
    const retry = await env.evaluator.evaluateSession(day(6), at(10));
    expect(retry).toMatchObject({ events_created: 1, results: { true: 1, false: 0, unknown: 0 } });
    const done = await env.evaluator.evaluateSession(day(6), at(11));
    expect(done.pairs_due).toBe(0);
  });

  it('a missing indicator grant blocks the pair as unknown (capability_locked) instead of judging it', async () => {
    await env.seed({});
    env.setGrants([]);
    const summary = await env.evaluator.evaluateSession(day(6), at(9));
    expect(summary.results.unknown).toBe(1);
    expect(env.store.events).toHaveLength(0);
    const state = [...env.store.states.values()][0]!;
    expect(state.last_reason).toBe('capability_locked');
    const [summaryRow] = await env.store.stateSummaries([...env.store.alerts.keys()]);
    expect(summaryRow).toMatchObject({ blocked_count: 1 });
  });

  it('an invalid pinned config is unknown (config_invalid), never a verdict', async () => {
    const broken = maConfig();
    priceCross(broken, 'buy').period = 7; // not an SMA preset
    await env.seed({ config: broken });
    await env.evaluator.evaluateSession(day(6), at(9));
    expect([...env.store.states.values()][0]!.last_reason).toBe('config_invalid');
    expect(env.store.events).toHaveLength(0);
  });

  describe('a version pinned to a config the engine cannot evaluate', () => {
    const blockedStates = () => [...env.store.states.values()];

    it('pre-V3 (iqx-rules-3.0, side-level params): no verdict, no event, no crash', async () => {
      const id = await env.seed({ config: preV3Config(), sides: ['buy', 'sell'] });
      const summary = await env.evaluator.evaluateSession(day(6), at(9));
      expect(summary).toMatchObject({
        pairs_due: 2,
        pairs_evaluated: 2,
        results: { true: 0, false: 0, unknown: 2 },
        events_created: 0,
        errors: 0,
      });
      expect(
        blockedStates().map((state) => [state.side, state.last_result, state.last_reason]),
      ).toEqual(
        expect.arrayContaining([
          ['buy', 'unknown', 'config_invalid'],
          ['sell', 'unknown', 'config_invalid'],
        ]),
      );
      expect(env.store.events).toHaveLength(0);
      // The alert reads as blocked until it is re-pinned (`config_error` in the service view).
      const [row] = await env.store.stateSummaries([id]);
      expect(row).toMatchObject({ blocked_count: 2 });
    });

    it('does not depend on the account holding the grants, and keeps being retried per session', async () => {
      await env.seed({ config: preV3Config() });
      env.setGrants([]);
      await env.evaluator.evaluateSession(day(6), at(9));
      expect(blockedStates()[0]).toMatchObject({ last_reason: 'config_invalid' });
      await env.evaluator.evaluateSession(day(7), at(9));
      expect(blockedStates()[0]).toMatchObject({
        last_session: day(7),
        last_reason: 'config_invalid',
      });
      expect(env.store.events).toHaveLength(0);
    });

    it('a malformed stored document is the same: unknown, config_invalid, never an exception', async () => {
      for (const garbage of [{}, { indicators: null }, { indicators: { ma: null } }, null, 'x']) {
        const fresh = setup();
        await fresh.seed({ config: garbage });
        const summary = await fresh.evaluator.evaluateSession(day(6), at(9));
        expect(summary, JSON.stringify(garbage)).toMatchObject({ pairs_evaluated: 1, errors: 0 });
        expect([...fresh.store.states.values()][0], JSON.stringify(garbage)).toMatchObject({
          last_result: 'unknown',
          last_reason: 'config_invalid',
        });
        expect(fresh.store.events).toHaveLength(0);
      }
    });

    it('does not stop the other alerts: they are judged in the same run', async () => {
      await env.seed({ userId: USER, name: 'Cũ', config: preV3Config() });
      await env.seed({ userId: USER_2, name: 'Mới' });
      const summary = await env.evaluator.evaluateSession(day(6), at(9));
      expect(summary).toMatchObject({
        alerts: 2,
        pairs_evaluated: 2,
        results: { true: 1, false: 0, unknown: 1 },
        events_created: 1,
        errors: 0,
      });
      expect(env.store.events.map((event) => event.user_id)).toEqual([USER_2]);
    });

    it('is judged normally again once the alert is re-pinned to a current config', async () => {
      const id = await env.seed({ config: preV3Config() });
      await env.evaluator.evaluateSession(day(6), at(9));
      expect(env.store.events).toHaveLength(0);
      const first = env.store.versionRows[0]!;
      const config = maConfig();
      await env.store.update(USER, id, {
        version: {
          source: first.source,
          config,
          config_hash: configHash(config),
          schema_version: SCHEMA_VERSION,
          rule_version: RULE_VERSION,
          calculation_version: first.calculation_version,
          scope: first.scope,
          symbols: first.symbols,
          sides: first.sides,
          definition_hash: 'e'.repeat(64),
        },
      });
      // Version 2 starts a fresh observation of day 6: the condition holds.
      const summary = await env.evaluator.evaluateSession(day(6), at(10));
      expect(summary).toMatchObject({
        results: { true: 1, false: 0, unknown: 0 },
        events_created: 1,
      });
      expect(env.store.events[0]).toMatchObject({
        alert_version: 2,
        event_kind: 'first_observation',
      });
    });
  });

  it('keeps accounts apart: each owner gets only their own events', async () => {
    await env.seed({ userId: USER, name: 'A' });
    await env.seed({ userId: USER_2, name: 'A' });
    await env.evaluator.evaluateSession(day(6), at(9));
    expect(env.store.events.map((event) => event.user_id).sort()).toEqual([USER, USER_2].sort());
  });

  it('reports no work when there is no enabled alert, and market_data_unavailable without a provider', async () => {
    expect((await env.evaluator.evaluateSession(day(6), at(9))).skipped).toBe('no_active_alerts');
    const noMarket = new StrategyAlertEvaluator(env.store, {
      grantedCapabilities: () => Promise.resolve(new Set()),
    });
    expect((await noMarket.evaluateSession(day(6), at(9))).skipped).toBe('market_data_unavailable');
  });
});
