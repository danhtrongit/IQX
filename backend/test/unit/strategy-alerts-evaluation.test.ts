import { describe, expect, it } from 'vitest';

import {
  ALERT_EOD_READY_MINUTE,
  EVENT_KIND_LABEL,
  MAX_UNKNOWN_ATTEMPTS,
  activeIndicatorIds,
  barsDataVersion,
  definitionHash,
  evaluateSide,
  isEodEvaluationDue,
  isPairDue,
  pinnedConfigProblem,
  planEvaluation,
  signalMessage,
  transition,
  type AlertStateRow,
  type ValidState,
} from '../../src/modules/alerts/strategy-alerts.evaluation.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  defaultConfig,
  type Bar,
  type ConditionRow,
  type IndicatorConfig,
  type RowSideConfig,
  type SharedConfig,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import { preV3Config } from './helpers/strategy-pre-v3.js';

const NONE: ValidState = { last_valid_result: null, last_valid_session: null };
const TRUE_: ValidState = { last_valid_result: true, last_valid_session: '2026-01-05' };
const FALSE_: ValidState = { last_valid_result: false, last_valid_session: '2026-01-05' };
const D = '2026-01-06';

describe('transition table (spec §4.4)', () => {
  it('no valid check yet + true → "Đang thỏa ở lần kiểm tra đầu", never a claimed crossing', () => {
    const out = transition(NONE, true, D);
    expect(out.event).toEqual({ kind: 'first_observation' });
    expect(out.next).toEqual({ last_valid_result: true, last_valid_session: D });
    expect(EVENT_KIND_LABEL.first_observation).toBe('Đang thỏa ở lần kiểm tra đầu');
  });

  it('false → true is a new signal', () => {
    const out = transition(FALSE_, true, D);
    expect(out.event).toEqual({ kind: 'new_signal' });
    expect(out.result).toBe('true');
  });

  it('true → true emits nothing and keeps the state', () => {
    const out = transition(TRUE_, true, D);
    expect(out.event).toBeNull();
    expect(out.next).toEqual({ last_valid_result: true, last_valid_session: D });
  });

  it('true/false/none → false updates the state and never emits (losing the condition is not a signal)', () => {
    for (const prev of [NONE, TRUE_, FALSE_]) {
      const out = transition(prev, false, D);
      expect(out.event).toBeNull();
      expect(out.result).toBe('false');
      expect(out.next).toEqual({ last_valid_result: false, last_valid_session: D });
    }
  });

  it('any → unknown keeps the previous valid state and emits nothing', () => {
    for (const prev of [NONE, TRUE_, FALSE_]) {
      const out = transition(prev, null, D);
      expect(out.event).toBeNull();
      expect(out.result).toBe('unknown');
      expect(out.next).toEqual(prev);
    }
  });

  it('A10 true → unknown → true is not a new signal', () => {
    let state: ValidState = NONE;
    const events: string[] = [];
    for (const [session, value] of [
      ['2026-01-05', true],
      ['2026-01-06', null],
      ['2026-01-07', true],
    ] as const) {
      const out = transition(state, value, session);
      state = out.next;
      if (out.event) events.push(`${session}:${out.event.kind}`);
    }
    expect(events).toEqual(['2026-01-05:first_observation']);
  });

  it('A09 three true sessions emit once; false then true emits again', () => {
    let state: ValidState = NONE;
    const kinds: Array<string | null> = [];
    for (const [i, value] of [true, true, true, false, true].entries()) {
      const out = transition(state, value, `2026-01-0${i + 1}`);
      state = out.next;
      kinds.push(out.event?.kind ?? null);
    }
    expect(kinds).toEqual(['first_observation', null, null, null, 'new_signal']);
  });

  it('the message is a condition match, never a Bot trade', () => {
    expect(signalMessage('buy')).toBe('Thỏa điều kiện Mua');
    expect(signalMessage('sell')).toBe('Thỏa điều kiện Bán');
    for (const text of [
      signalMessage('buy'),
      signalMessage('sell'),
      ...Object.values(EVENT_KIND_LABEL),
    ])
      expect(text).not.toMatch(/Bot đã|Lệnh đã khớp/i);
  });
});

const state = (patch: Partial<AlertStateRow> = {}): AlertStateRow => ({
  alert_id: 'a',
  version: 1,
  symbol: 'AAA',
  side: 'buy',
  epoch: 1,
  last_valid_result: null,
  last_valid_session: null,
  last_result: 'unknown',
  last_session: null,
  last_reason: null,
  attempts: 0,
  ...patch,
});

describe('planEvaluation and isPairDue', () => {
  it('a first evaluation plans a state and the first-observation event', () => {
    const plan = planEvaluation(undefined, 1, D, true);
    expect(plan).toMatchObject({
      skip: null,
      result: 'true',
      attempts: 1,
      epoch: 1,
      event: { kind: 'first_observation', previous: NONE },
    });
  });

  it('a session that already has a valid result is not evaluated twice (retry / second worker)', () => {
    const done = state({ last_result: 'false', last_session: D, last_valid_result: false });
    expect(planEvaluation(done, 1, D, true)).toEqual({ skip: 'already_evaluated' });
    expect(isPairDue(done, 1, D)).toBe(false);
    expect(isPairDue(done, 1, '2026-01-07')).toBe(true);
  });

  it('an older session never overwrites a newer state', () => {
    const newer = state({ last_result: 'true', last_session: '2026-01-08' });
    expect(planEvaluation(newer, 1, D, true)).toEqual({ skip: 'stale_session' });
    expect(isPairDue(newer, 1, D)).toBe(false);
  });

  it('unknown results are retried a few times within the session, then left alone', () => {
    let current = state({ last_result: 'unknown', last_session: D, attempts: 1 });
    expect(isPairDue(current, 1, D)).toBe(true);
    const plan = planEvaluation(current, 1, D, null);
    expect(plan).toMatchObject({ skip: null, result: 'unknown', attempts: 2, event: null });
    current = state({ last_result: 'unknown', last_session: D, attempts: MAX_UNKNOWN_ATTEMPTS });
    expect(isPairDue(current, 1, D)).toBe(false);
    expect(planEvaluation(current, 1, D, true)).toEqual({ skip: 'attempts_exhausted' });
    // Data arrives while retries remain: the valid result is recorded.
    const late = planEvaluation(
      state({ last_result: 'unknown', last_session: D, attempts: 2 }),
      1,
      D,
      true,
    );
    expect(late).toMatchObject({
      skip: null,
      result: 'true',
      event: { kind: 'first_observation' },
    });
  });

  it('A14 a resume (higher epoch) starts a fresh observation and drops the previous valid state', () => {
    const before = state({
      epoch: 1,
      last_result: 'true',
      last_session: '2026-01-05',
      last_valid_result: true,
      last_valid_session: '2026-01-05',
    });
    expect(isPairDue(before, 2, '2026-01-05')).toBe(true);
    const plan = planEvaluation(before, 2, '2026-01-05', true);
    // Same session as the pre-pause check: the event key (not this plan) prevents a duplicate.
    expect(plan).toMatchObject({
      skip: null,
      epoch: 2,
      attempts: 1,
      event: { kind: 'first_observation', previous: NONE },
    });
    // Without a resume the same state would not be re-evaluated.
    expect(planEvaluation(before, 1, '2026-01-05', true)).toEqual({ skip: 'already_evaluated' });
  });

  it('a gap keeps the last valid state: false (Jan 5) … true (Jan 9) is a new signal with its evidence', () => {
    const plan = planEvaluation(
      state({
        last_result: 'false',
        last_session: '2026-01-05',
        last_valid_result: false,
        last_valid_session: '2026-01-05',
      }),
      1,
      '2026-01-09',
      true,
    );
    expect(plan).toMatchObject({
      skip: null,
      event: {
        kind: 'new_signal',
        previous: { last_valid_result: false, last_valid_session: '2026-01-05' },
      },
    });
  });
});

describe('isEodEvaluationDue', () => {
  it('is false before 15:45 and true from 15:45 Asia/Ho_Chi_Minh', () => {
    expect(ALERT_EOD_READY_MINUTE).toBe(15 * 60 + 45);
    // 08:44Z = 15:44 ICT; 08:45Z = 15:45 ICT.
    expect(isEodEvaluationDue(new Date('2026-01-06T08:44:59.000Z'))).toBe(false);
    expect(isEodEvaluationDue(new Date('2026-01-06T08:45:00.000Z'))).toBe(true);
    expect(isEodEvaluationDue(new Date('2026-01-06T09:30:00.000Z'))).toBe(true);
    // Midnight ICT of the next day is a new calendar day: not due again until 15:45.
    expect(isEodEvaluationDue(new Date('2026-01-06T17:00:00.000Z'))).toBe(false);
    expect(isEodEvaluationDue(new Date('2026-01-06T02:00:00.000Z'))).toBe(false);
  });
});

/** Row 1 of an MA tab: `ma.price_cross` (Mua `cross_up`, Bán `cross_down` the SMA of `period`). */
const priceCross = (config: SharedConfig, side: Side): ConditionRow =>
  ((config.indicators.ma as IndicatorConfig)[side] as RowSideConfig).rules[0]!;

function maConfig(buy = true, sell = true, period = 5): SharedConfig {
  const config = defaultConfig();
  const ma = config.indicators.ma as IndicatorConfig;
  ma.master_enabled = true;
  ma.buy.enabled = buy;
  ma.sell.enabled = sell;
  priceCross(config, 'buy').period = period;
  priceCross(config, 'sell').period = period;
  return config;
}

const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const bars = (closes: number[]): Bar[] =>
  closes.map((close, i) => ({
    date: day(i),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }));

describe('evaluateSide', () => {
  it('evaluates the 16-indicator engine on the bar of the session with three-valued results', () => {
    const rising = bars([10, 10, 10, 10, 10, 12]);
    const buy = evaluateSide(maConfig(), rising, 'buy', day(5));
    expect(buy.result).toBe(true);
    expect(buy.indicator_ids).toEqual(['ma']);
    // Evidence is one entry per evaluated row, with the row's own stored values.
    expect(buy.rules).toHaveLength(1);
    expect(buy.rules[0]).toMatchObject({
      id: 'ma.price_cross',
      indicator: 'ma',
      side: 'buy',
      op: 'cross_up',
      lhs: 12,
      rhs: 10.4,
      result: true,
      missing: false,
      values: { op: 'cross_up', period: 5 },
    });
    expect(evaluateSide(maConfig(), rising, 'sell', day(5)).result).toBe(false);
  });

  it('missing data is unknown, not false: warm-up not reached, or the session bar is absent', () => {
    expect(evaluateSide(maConfig(), bars([10, 11, 12]), 'buy', day(2))).toMatchObject({
      result: null,
      reason: 'insufficient_or_missing_data',
    });
    // The latest bar is a day behind: a forming/older candle is never presented as the session.
    expect(evaluateSide(maConfig(), bars([10, 10, 10, 10, 10, 12]), 'buy', day(6))).toMatchObject({
      result: null,
      reason: 'no_bar_for_session',
    });
    expect(evaluateSide(maConfig(), [], 'buy', day(0))).toMatchObject({
      result: null,
      reason: 'no_bar_for_session',
    });
  });

  it('a side without a condition set is not evaluated to false', () => {
    expect(activeIndicatorIds(maConfig(true, false), 'sell')).toEqual([]);
    expect(
      evaluateSide(maConfig(true, false), bars([10, 10, 10, 10, 10, 12]), 'sell', day(5)),
    ).toMatchObject({ result: null, reason: 'no_active_condition' });
  });

  it('uses the pinned config only: a changed MA period gives another verdict', () => {
    // 12 sessions: both SMA 5 and SMA 10 are defined on the last bar, with different values.
    const data = bars([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10.5, 10.4]);
    const short = evaluateSide(maConfig(true, true, 5), data, 'buy', day(11));
    const long = evaluateSide(maConfig(true, true, 10), data, 'buy', day(11));
    expect(short.result).not.toBeNull();
    expect(long.result).not.toBeNull();
    expect(short.rules[0]?.rhs).toBeCloseTo(10.18, 10);
    expect(long.rules[0]?.rhs).toBeCloseTo(10.09, 10);
    expect(short.rules[0]?.values).toMatchObject({ period: 5 });
    expect(long.rules[0]?.values).toMatchObject({ period: 10 });
  });

  it('evaluates every enabled row with its own periods and combines them with AND (three-valued)', () => {
    // Row 1 `Giá cắt lên SMA 5` and row 3 `SMA 10 xu hướng lên` (SMA 10 now vs 10 sessions ago).
    const config = maConfig(true, false);
    const rows = ((config.indicators.ma as IndicatorConfig).buy as RowSideConfig).rules;
    const trend = rows.find((row) => row.id === 'ma.trend')!;
    Object.assign(trend, { enabled: true, period: 10, dir: 'up' });
    const last = (closes: number[]) => day(closes.length - 1);

    const flatThenJump = [...Array<number>(24).fill(10), 12];
    const both = evaluateSide(config, bars(flatThenJump), 'buy', last(flatThenJump));
    expect(both.result).toBe(true);
    expect(both.reason).toBeNull();
    expect(both.indicator_ids).toEqual(['ma']);
    expect(both.rules.map((rule) => [rule.id, rule.result])).toEqual([
      ['ma.price_cross', true],
      ['ma.trend', true],
    ]);
    expect(both.rules[0]?.values).toMatchObject({ period: 5 });
    expect(both.rules[1]?.values).toMatchObject({ period: 10, dir: 'up' });

    // One false row decides the side: price crosses up SMA 5 but SMA 10 is falling.
    const fallingThenJump = [...Array.from({ length: 30 }, (_, i) => 50 - i), 40];
    const mixed = evaluateSide(config, bars(fallingThenJump), 'buy', last(fallingThenJump));
    expect(mixed.result).toBe(false);
    expect(mixed.reason).toBeNull();
    expect(mixed.rules.map((rule) => [rule.id, rule.result])).toEqual([
      ['ma.price_cross', true],
      ['ma.trend', false],
    ]);

    // Row 3 needs 20 sessions: with 7 bars the unknown row keeps the AND unknown, never false.
    const short = [10, 10, 10, 10, 10, 10, 12];
    const insufficient = evaluateSide(config, bars(short), 'buy', last(short));
    expect(insufficient).toMatchObject({ result: null, reason: 'insufficient_or_missing_data' });
    expect(insufficient.rules.find((rule) => rule.id === 'ma.trend')).toMatchObject({
      result: null,
      missing: true,
    });
  });

  it('an active indicator with no enabled row keeps the side false (NO_SIGNAL is not a pass)', () => {
    const config = maConfig(true, false);
    const rows = ((config.indicators.ma as IndicatorConfig).buy as RowSideConfig).rules;
    for (const row of rows) row.enabled = false;
    const outcome = evaluateSide(config, bars([10, 10, 10, 10, 10, 12]), 'buy', day(5));
    expect(outcome).toMatchObject({
      result: false,
      reason: null,
      indicator_ids: ['ma'],
      rules: [],
    });
  });

  it('keeps the combination of several indicators: every active indicator must hold', () => {
    const config = maConfig(true, false);
    const rsi = config.indicators.rsi as IndicatorConfig;
    rsi.master_enabled = true;
    rsi.buy.enabled = true;
    const closes = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 12];
    // MA holds (price crosses up SMA 5 on the last bar); RSI(14) has no history yet: unknown.
    const outcome = evaluateSide(config, bars(closes), 'buy', day(11));
    expect([...outcome.indicator_ids].sort()).toEqual(['ma', 'rsi']);
    expect(outcome.rules.find((rule) => rule.id === 'ma.price_cross')?.result).toBe(true);
    expect(
      outcome.rules.filter((rule) => rule.indicator === 'rsi').every((rule) => rule.missing),
    ).toBe(true);
    expect(outcome.result).toBeNull();
    expect(outcome.reason).toBe('insufficient_or_missing_data');
  });
});

describe('activeIndicatorIds', () => {
  it('lists indicators with the master and the side ON, sorted', () => {
    const config = maConfig(true, false);
    const rsi = config.indicators.rsi as IndicatorConfig;
    rsi.master_enabled = true;
    rsi.sell.enabled = true;
    expect(activeIndicatorIds(config, 'buy')).toEqual(['ma']);
    expect(activeIndicatorIds(config, 'sell')).toEqual(['rsi']);
  });

  it('reads the pinned configs of older versions without throwing on any shape', () => {
    expect(activeIndicatorIds(preV3Config() as unknown as SharedConfig, 'buy')).toEqual(['ma']);
    for (const garbage of [
      null,
      undefined,
      7,
      'x',
      [],
      {},
      { indicators: null },
      { indicators: { ma: null } },
    ])
      expect(
        activeIndicatorIds(garbage as unknown as SharedConfig, 'buy'),
        String(garbage),
      ).toEqual([]);
    expect(
      activeIndicatorIds(
        { indicators: { ma: { master_enabled: true } } } as unknown as SharedConfig,
        'buy',
      ),
    ).toEqual([]);
  });
});

describe('pinnedConfigProblem (a pinned version that cannot be evaluated)', () => {
  it('is null for a valid current-format config', () => {
    expect(pinnedConfigProblem(maConfig())).toBeNull();
    expect(pinnedConfigProblem(defaultConfig())).toBeNull();
  });

  it('is "outdated" for a config pinned before SPEC V3 (side-level params, iqx-rules-3.0)', () => {
    expect(pinnedConfigProblem(preV3Config())).toBe('outdated');
    // The version stamps alone do not make a document current: rows must be in the new shape.
    expect(
      pinnedConfigProblem({
        ...preV3Config(),
        schema_version: SCHEMA_VERSION,
        rule_version: RULE_VERSION,
      }),
    ).toBe('outdated');
    expect(pinnedConfigProblem({ ...maConfig(), rule_version: 'iqx-rules-3.0' })).not.toBeNull();
  });

  it('is "invalid" for a current-format config with a value the registry refuses', () => {
    const config = maConfig();
    priceCross(config, 'buy').period = 7; // not an SMA preset
    expect(pinnedConfigProblem(config)).toBe('invalid');
  });

  it('never throws, whatever the stored document looks like', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      0,
      'config',
      [],
      {},
      { indicators: null },
      { schema_version: SCHEMA_VERSION, rule_version: RULE_VERSION, indicators: null },
      { schema_version: SCHEMA_VERSION, rule_version: RULE_VERSION, indicators: { ma: null } },
      {
        schema_version: SCHEMA_VERSION,
        rule_version: RULE_VERSION,
        indicators: { ma: { buy: 5 } },
      },
    ];
    for (const document of garbage) {
      const problem = pinnedConfigProblem(document);
      expect(problem, JSON.stringify(document)).not.toBeNull();
      expect(['outdated', 'invalid']).toContain(problem);
    }
  });
});

describe('hashes', () => {
  it('data version changes with any bar value and is stable otherwise', () => {
    const a = bars([10, 11, 12]);
    expect(barsDataVersion(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(barsDataVersion(a)).toBe(barsDataVersion(structuredClone(a)));
    const changed = structuredClone(a);
    changed[2]!.close = 12.5;
    expect(barsDataVersion(changed)).not.toBe(barsDataVersion(a));
  });

  it('the definition hash ignores order but sees config, symbols, sides and scope', () => {
    const base = {
      config_hash: 'a'.repeat(64),
      symbols: ['FPT', 'VNM'],
      sides: ['sell', 'buy'],
      scope: { kind: 'symbols' },
    };
    const hash = definitionHash(base);
    expect(definitionHash({ ...base, symbols: ['VNM', 'FPT'], sides: ['buy', 'sell'] })).toBe(hash);
    expect(definitionHash({ ...base, symbols: ['FPT'] })).not.toBe(hash);
    expect(definitionHash({ ...base, sides: ['buy'] })).not.toBe(hash);
    expect(definitionHash({ ...base, config_hash: 'b'.repeat(64) })).not.toBe(hash);
    expect(definitionHash({ ...base, scope: { kind: 'saved_list', list_id: 'x' } })).not.toBe(hash);
  });
});
