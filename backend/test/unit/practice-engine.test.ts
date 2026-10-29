import { describe, expect, it } from 'vitest';

import {
  defaultPracticeConfig,
  practiceEntry,
  toSideConfig,
} from '../../src/modules/practice/practice.config.js';
import { MINI_ENGINE_PROFILE } from '../../src/modules/practice/practice.constants.js';
import {
  PracticeEngineError,
  maxLotQty,
  simulate,
  type SimulationInput,
} from '../../src/modules/practice/practice.engine.js';
import type { PracticeRowsConfig } from '../../src/modules/practice/practice.types.js';
import {
  isRowsEntry,
  type RowsRegistryEntry,
  type Side,
} from '../../src/modules/quant/v2/index.js';
import { makeBars } from './practice-fixtures.js';

const WARM = 30; // observation + warmup bars before the first test session
const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = practiceEntry(id);
  if (!entry || !isRowsEntry(entry)) throw new Error(`${id} is not row-based`);
  return entry;
};
const entry = rowsEntry('ma');

/** Global bar index of session s (Phiên 1 = first test session). */
const at = (session: number): number => WARM - 1 + session;

type SideOptions = { enabled?: boolean; period?: number };

/**
 * One tab of the SMA indicator that only runs the "SMA trend" row: Mua when the SMA rises against
 * `period` sessions earlier, Bán when it falls. Price-cross and MA-cross rows are off.
 */
function trendSide(side: Side, options: SideOptions) {
  const config = defaultPracticeConfig(entry) as PracticeRowsConfig;
  return toSideConfig(entry, side, {
    enabled: options.enabled ?? true,
    rules: config[side].rules.map((row) =>
      row.id === 'ma.trend'
        ? {
            ...row,
            enabled: true,
            period: options.period ?? 5,
            dir: side === 'buy' ? 'up' : 'down',
          }
        : { ...row, enabled: false },
    ),
  });
}

function maInput(
  closes: readonly number[],
  options: {
    hold?: number;
    buy?: SideOptions;
    sell?: SideOptions;
    openOf?: (i: number) => number;
    profile?: SimulationInput['profile'];
  } = {},
): SimulationInput {
  return {
    entry,
    bars: makeBars(closes, options.openOf ? { openOf: options.openOf } : {}),
    firstTestIndex: WARM,
    lastTestIndex: closes.length - 1,
    buy: trendSide('buy', options.buy ?? {}),
    sell: trendSide('sell', options.sell ?? {}),
    holdMaxSessions: options.hold ?? 60,
    ...(options.profile ? { profile: options.profile } : {}),
  };
}

/**
 * Flat 100 through session `jump - 1`, a jump at the close of session `jump` (the SMA5 trend turns
 * up there), then +1 per session: the buy condition stays true and the sell condition (SMA5 falling)
 * never is. `length` is the number of test sessions.
 */
function risingAfter(jump: number, length: number): number[] {
  const closes: number[] = new Array(WARM + length).fill(100);
  for (let s = jump; s <= length; s++) closes[at(s)] = 110 + (s - jump);
  return closes;
}

describe('practice engine: next-open timing and flat start', () => {
  it('decides at the close of session i and fills at the open of session i + 1', () => {
    const closes = risingAfter(9, 30);
    const out = simulate(maInput(closes));
    const trade = out.trades[0]!;
    expect(trade.buy.signal_session).toBe(9);
    expect(trade.buy.session).toBe(10);
    // makeBars opens at (previous close - 1): the fill uses the OPEN of session 10, never a close.
    expect(trade.buy.price).toBe(closes[at(9)]! - 1);
    expect(trade.buy.price).not.toBe(closes[at(9)]);
    expect(out.events[0]).toMatchObject({ side: 'buy', session: 10, trade_ordinal: 1 });
  });

  it('starts flat: a signal on the last observation session never fills at test session 1', () => {
    const closes: number[] = new Array(WARM + 20).fill(100);
    closes[WARM - 1] = 120; // last observation close: the SMA5 trend is already up
    for (let s = 1; s <= 20; s++) closes[at(s)] = 121 + s;
    const out = simulate(maInput(closes));
    expect(out.trades[0]!.buy.signal_session).toBe(1);
    expect(out.trades[0]!.buy.session).toBe(2);
    expect(out.events.every((event) => event.session >= 2)).toBe(true);
  });

  it('does not open a position when nothing triggers a buy', () => {
    const out = simulate(maInput(new Array(WARM + 40).fill(100)));
    expect(out.kpis.buy_count).toBe(0);
    expect(out.kpis.total_return).toBe(0);
    expect(out.kpis.insufficient_cash_buys).toBe(0);
    expect(out.trades).toHaveLength(0);
  });
});

describe('practice engine: maximum holding time (spec 11.2)', () => {
  const closes = risingAfter(9, 75);
  const out = simulate(maInput(closes, { hold: 60 }));

  it('buy at session 10 with N=60 exits at the open of session 70, decided at close 69', () => {
    const trade = out.trades[0]!;
    expect(trade.status).toBe('closed');
    expect(trade.buy.session).toBe(10);
    expect(trade.sell!.signal_session).toBe(69);
    expect(trade.sell!.time_exit.held_sessions_at_signal).toBe(60);
    expect(trade.sell!.session).toBe(70);
    expect(trade.holding_sessions).toBe(60);
    expect(trade.sell!.reason).toBe('max_holding');
    expect(trade.sell!.time_due).toBe(true);
    expect(trade.sell!.indicator_met).toBe(false);
    expect(trade.sell!.price).toBe(closes[at(69)]! - 1);
  });

  it('re-enters only after the sell: the next buy fills at session 71 at the earliest', () => {
    expect(out.trades[1]!.buy.session).toBe(71);
    expect(out.trades[1]!.buy.signal_session).toBe(70);
  });

  it('counts the buys: buy_count == closed trades + open position', () => {
    expect(out.kpis.buy_count).toBe(2);
    expect(out.kpis.closed_trade_count).toBe(1);
    expect(out.kpis.open_position).toBe(true);
    expect(out.kpis.buy_count).toBe(out.kpis.closed_trade_count + 1);
  });

  it('holds N = 1 for exactly one session (decided at the entry close)', () => {
    const one = simulate(maInput(risingAfter(9, 30), { hold: 1 }));
    expect(one.trades[0]!.buy.session).toBe(10);
    expect(one.trades[0]!.sell!.signal_session).toBe(10);
    expect(one.trades[0]!.sell!.session).toBe(11);
    expect(one.trades[0]!.holding_sessions).toBe(1);
  });

  it('rejects a hold outside the integer range 1..1000', () => {
    for (const hold of [0, -1, 1.5, 1001, Number.NaN]) {
      expect(() => simulate(maInput(risingAfter(9, 30), { hold }))).toThrow(PracticeEngineError);
    }
  });
});

describe('practice engine: sell reasons', () => {
  it('keeps one sell with primary reason indicator and the time_due flag when both hold', () => {
    // N=5: entry session 10, time due at close 14; the close of 14 also falls under SMA5.
    const closes = risingAfter(9, 30);
    closes[at(14)] = 50;
    for (let s = 15; s <= 30; s++) closes[at(s)] = 50;
    const out = simulate(maInput(closes, { hold: 5 }));
    expect(out.trades).toHaveLength(1);
    const sell = out.trades[0]!.sell!;
    expect(sell.signal_session).toBe(14);
    expect(sell.session).toBe(15);
    expect(sell.reason).toBe('indicator');
    expect(sell.indicator_met).toBe(true);
    expect(sell.time_due).toBe(true);
    expect(out.events.filter((event) => event.side === 'sell')).toHaveLength(1);
  });

  it('sells earlier on the indicator when it triggers before the time limit', () => {
    const closes = risingAfter(9, 40);
    for (let s = 20; s <= 40; s++) closes[at(s)] = 50;
    const out = simulate(maInput(closes, { hold: 60 }));
    const sell = out.trades[0]!.sell!;
    expect(sell.session).toBe(21);
    expect(sell.reason).toBe('indicator');
    expect(sell.time_due).toBe(false);
    expect(out.trades[0]!.holding_sessions).toBe(11);
  });

  it('missing sell-indicator data does not disable the time exit', () => {
    // SMA200 trend needs 400 bars; only 105 exist, so the sell row is unknown on every session.
    const out = simulate(maInput(risingAfter(9, 75), { hold: 10, sell: { period: 200 } }));
    const trade = out.trades[0]!;
    expect(trade.sell!.reason).toBe('max_holding');
    expect(trade.sell!.evidence.result).toBeNull();
    expect(trade.sell!.evidence.rules[0]!.missing).toBe(true);
    expect(trade.sell!.session).toBe(20);
  });

  it('exits on time when the sell side is switched off', () => {
    const out = simulate(maInput(risingAfter(9, 75), { hold: 10, sell: { enabled: false } }));
    const trade = out.trades[0]!;
    expect(trade.sell!.reason).toBe('max_holding');
    expect(trade.sell!.evidence.enabled).toBe(false);
    expect(trade.sell!.evidence.rules).toHaveLength(0);
  });
});

describe('practice engine: money', () => {
  it('buys 100% of cash incl. fees in whole lots (spec P17)', () => {
    expect(maxLotQty(100_000_000, 20_000, MINI_ENGINE_PROFILE)).toBe(4_900);
    const closes = risingAfter(9, 20);
    const out = simulate(maInput(closes, { openOf: () => 20_000 }));
    const trade = out.trades[0]!;
    expect(trade.qty).toBe(4_900);
    expect(trade.buy.fee).toBe(147_000);
    expect(trade.buy.total_cost).toBe(98_147_000);
    expect(out.kpis.cash_end).toBe(1_853_000);
  });

  it('computes entry, net proceeds and P&L with the exact fee model (spec P19)', () => {
    const profile = { ...MINI_ENGINE_PROFILE, capital: 1_001_500 };
    expect(maxLotQty(1_001_500, 10_000, profile)).toBe(100);
    // Buy fills at 10,000 (session 10); the time exit (N=3) fills at 11,000 (session 13).
    const out = simulate(
      maInput(risingAfter(9, 14), {
        hold: 3,
        profile,
        openOf: (i) => (i === at(13) ? 11_000 : 10_000),
      }),
    );
    const trade = out.trades[0]!;
    expect(trade.qty).toBe(100);
    expect(trade.buy.total_cost).toBe(1_001_500);
    expect(trade.sell!.price).toBe(11_000);
    expect(trade.sell!.fee).toBe(2_750);
    expect(trade.sell!.net_proceeds).toBe(1_097_250);
    expect(trade.pnl_kind).toBe('realized');
    expect(trade.pnl_vnd).toBe(95_750);
    expect(trade.pnl_ratio).toBeCloseTo(95_750 / 1_001_500, 12);
  });

  it('never buys a fraction of a lot and never overspends', () => {
    for (const price of [333, 1_234, 9_999, 20_000, 71_300, 1_999_999]) {
      const qty = maxLotQty(100_000_000, price, MINI_ENGINE_PROFILE);
      expect(qty % 100).toBe(0);
      const cost = qty * price + Math.round(qty * price * 0.0015);
      expect(cost).toBeLessThanOrEqual(100_000_000);
      const next = (qty + 100) * price + Math.round((qty + 100) * price * 0.0015);
      expect(next).toBeGreaterThan(100_000_000);
    }
  });

  it('records insufficient cash for one lot and keeps the portfolio in cash', () => {
    const closes = risingAfter(9, 20).map((value) => value * 30_000);
    const out = simulate(maInput(closes));
    expect(out.kpis.buy_count).toBe(0);
    expect(out.kpis.insufficient_cash_buys).toBeGreaterThan(0);
    expect(out.missed_buys[0]).toMatchObject({ signal_session: 9, fill_session: 10 });
    expect(out.kpis.total_return).toBe(0);
    expect(out.kpis.cash_end).toBe(100_000_000);
    expect(out.trades).toHaveLength(0);
  });
});

describe('practice engine: end of the window', () => {
  it('leaves a buy signal on the last session pending and unfilled', () => {
    const closes: number[] = new Array(WARM + 20).fill(100);
    closes[at(20)] = 130;
    const out = simulate(maInput(closes));
    expect(out.kpis.buy_count).toBe(0);
    expect(out.pending_orders).toEqual([
      expect.objectContaining({
        side: 'buy',
        signal_session: 20,
        status: 'unfilled_end_of_window',
      }),
    ]);
    expect(out.kpis.total_return).toBe(0);
  });

  it('does not liquidate: a due time exit on the last session stays pending, position open', () => {
    // Entry at session 10; N=21 is due at the close of session 30, the last session.
    const closes = risingAfter(9, 30);
    const out = simulate(maInput(closes, { hold: 21 }));
    expect(out.trades).toHaveLength(1);
    const open = out.trades[0]!;
    expect(open.status).toBe('open');
    expect(open.sell).toBeNull();
    expect(open.pnl_kind).toBe('unrealized');
    expect(out.pending_orders).toEqual([
      expect.objectContaining({ side: 'sell', reason: 'max_holding', time_due: true }),
    ]);
    expect(out.kpis.closed_trade_count).toBe(0);
    expect(out.kpis.buy_count).toBe(1);
    expect(out.kpis.open_position).toBe(true);
  });

  it('values an open position at the last valid close and includes the fees paid', () => {
    const closes = risingAfter(9, 30);
    const out = simulate(maInput(closes, { hold: 100 }));
    const open = out.trades[0]!;
    const last = closes[closes.length - 1]!;
    expect(open.mark).toMatchObject({ session: 30, price: last });
    expect(out.kpis.open_position_value).toBe(open.qty * last);
    expect(out.kpis.nav_end).toBe(out.kpis.cash_end + open.qty * last);
    expect(out.kpis.total_return).toBeCloseTo((out.kpis.nav_end! - 100_000_000) / 100_000_000, 12);
    // Unrealized P&L is value - entry total (the sell fee has not happened yet).
    expect(open.pnl_vnd).toBe(open.qty * last - open.buy.total_cost);
    expect(open.holding_sessions).toBe(30 - 10);
  });

  it('refuses an empty or invalid test window instead of returning a fake 0%', () => {
    const input = maInput(risingAfter(9, 20));
    expect(() => simulate({ ...input, firstTestIndex: 0 })).toThrow(PracticeEngineError);
    expect(() => simulate({ ...input, lastTestIndex: input.bars.length + 3 })).toThrow(
      PracticeEngineError,
    );
    const invalidBars = input.bars.map((bar, i) =>
      i >= WARM ? { ...bar, open: Number.NaN } : bar,
    );
    expect(() => simulate({ ...input, bars: invalidBars })).toThrow(/Không có phiên hợp lệ/);
  });
});

describe('practice engine: evidence', () => {
  const rsi = rowsEntry('rsi');
  // Oversold dip then recovery: RSI < 30 on T and above its value 14 sessions earlier.
  const dipAndRecovery = (): number[] => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i++) closes.push(100 + (i % 2));
    for (let i = 0; i < 30; i++) closes.push(100 - i * 1.5);
    for (let i = 0; i < 60; i++) closes.push(55 + i * 0.7);
    return closes;
  };

  it('stores every enabled row with its own values, sentence, operands and result', () => {
    const defaults = defaultPracticeConfig(rsi) as PracticeRowsConfig;
    const closes = dipAndRecovery();
    const out = simulate({
      entry: rsi,
      bars: makeBars(closes),
      firstTestIndex: 40,
      lastTestIndex: closes.length - 1,
      buy: toSideConfig(rsi, 'buy', defaults.buy),
      sell: toSideConfig(rsi, 'sell', defaults.sell),
      holdMaxSessions: 40,
    });
    const first = out.trades[0]!;
    expect(first).toBeDefined();
    const evidence = first.buy.evidence;
    // Row-based indicators have no side-level params: every row carries its own values.
    expect(evidence.params).toEqual({});
    expect(evidence.enabled).toBe(true);
    expect(evidence.status).toBe('ok');
    expect(evidence.reason).toBeNull();
    expect(evidence.result).toBe(true);
    expect(evidence.rules.map((rule) => rule.rule_id)).toEqual(['rsi.level', 'rsi.trend']);
    const [level, trend] = evidence.rules;
    expect(level).toMatchObject({
      kind: 'compare',
      op: '<',
      label: 'RSI 14 < 30',
      values: { period: 14, op: '<', threshold: 30 },
      left_label: 'RSI 14',
      right_label: '30',
      rhs: 30,
      result: true,
      missing: false,
    });
    expect(level!.lhs).toBeLessThan(30);
    expect(trend).toMatchObject({
      kind: 'compare',
      op: '>',
      label: 'RSI 14 xu hướng lên',
      values: { period: 14, dir: 'up' },
      left_label: 'RSI 14',
      right_label: 'RSI 14 cách 14 phiên',
      result: true,
      missing: false,
    });
    expect(trend!.lhs!).toBeGreaterThan(trend!.rhs!);
    expect(evidence.signal_session).toBe(first.buy.signal_session);
  });

  it('keeps the old rule evidence of Volume: side params and r1 / r2 with their labels', () => {
    const volume = practiceEntry('volume')!;
    const defaults = defaultPracticeConfig(volume);
    const bars = makeBars(
      Array.from({ length: 200 }, (_, i) => 100 + (i % 7) * 3 + (i > 120 ? (i - 120) * 0.2 : 0)),
    ).map((bar, i) => ({ ...bar, volume: i % 9 === 0 ? 50_000 : 1_000 }));
    const out = simulate({
      entry: volume,
      bars,
      firstTestIndex: 60,
      lastTestIndex: bars.length - 1,
      buy: toSideConfig(volume, 'buy', defaults.buy),
      sell: toSideConfig(volume, 'sell', defaults.sell),
      holdMaxSessions: 10,
    });
    const first = out.trades[0]!;
    expect(first).toBeDefined();
    expect(first.buy.evidence.params).toEqual({ lookback: 20, mult: 1 });
    expect(first.buy.evidence.rules.map((rule) => rule.rule_id)).toEqual(['r1', 'r2']);
    expect(first.buy.evidence.rules[0]).toMatchObject({
      kind: 'compare',
      op: '>',
      left_label: 'Giá đóng cửa',
      right_label: 'Giá đóng cửa phiên trước',
    });
    expect(first.buy.evidence.rules[1]).toMatchObject({
      left_label: 'Khối lượng',
      right_label: '1 × TB 20 phiên',
    });
    // Volume rules keep the pre-V3 shape: no sentence, no per-row values
    expect(first.buy.evidence.rules[0]).not.toHaveProperty('label');
    expect(first.buy.evidence.rules[0]).not.toHaveProperty('values');
  });

  it('records a cross row with the previous bar values', () => {
    const closes = risingAfter(9, 30);
    const out = simulate(maInput(closes));
    expect(out.trades[0]!.buy.evidence.rules[0]).toMatchObject({
      rule_id: 'ma.trend',
      kind: 'compare',
      label: 'SMA 5 xu hướng lên',
    });
    const cross = defaultPracticeConfig(entry) as PracticeRowsConfig;
    cross.buy.rules[0]!.enabled = true; // price crosses up SMA 20
    cross.buy.rules[2]!.enabled = false;
    const flatThenJump = new Array<number>(WARM + 30).fill(100);
    for (let s = 9; s <= 30; s++) flatThenJump[at(s)] = 130;
    const crossed = simulate({
      entry,
      bars: makeBars(flatThenJump),
      firstTestIndex: WARM,
      lastTestIndex: flatThenJump.length - 1,
      buy: toSideConfig(entry, 'buy', cross.buy),
      sell: toSideConfig(entry, 'sell', { ...cross.sell, enabled: false }),
      holdMaxSessions: 5,
    });
    const evidence = crossed.trades[0]!.buy.evidence;
    expect(evidence.signal_session).toBe(9);
    expect(evidence.rules[0]).toMatchObject({
      rule_id: 'ma.price_cross',
      kind: 'cross',
      op: 'cross_up',
      label: 'Giá cắt lên SMA 20',
      left_label: 'Giá đóng cửa',
      right_label: 'SMA 20',
      lhs: 130,
      previous_lhs: 100,
      result: true,
    });
    expect(evidence.rules[0]!.previous_rhs).toBe(100);
  });
});

describe('practice engine: invariants over random markets', () => {
  const random = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it.each(['rsi', 'ma', 'macd', 'bollinger', 'stochastic'])(
    'keeps buy_count == closed + open, cash >= 0 and ordered fills for %s',
    (id) => {
      const target = practiceEntry(id)!;
      const defaults = defaultPracticeConfig(target);
      for (let seed = 1; seed <= 25; seed++) {
        const next = random(seed * 7919);
        const closes: number[] = [];
        let price = 20_000;
        for (let i = 0; i < 520; i++) {
          price = Math.max(1_000, Math.round(price * (1 + (next() - 0.5) * 0.06)));
          closes.push(price);
        }
        const hold = 1 + Math.floor(next() * 40);
        const out = simulate({
          entry: target,
          bars: makeBars(closes),
          firstTestIndex: 260,
          lastTestIndex: closes.length - 1,
          buy: toSideConfig(target, 'buy', defaults.buy),
          sell: toSideConfig(target, 'sell', defaults.sell),
          holdMaxSessions: hold,
        });
        const closed = out.trades.filter((trade) => trade.status === 'closed');
        const open = out.trades.filter((trade) => trade.status === 'open');
        expect(out.kpis.buy_count).toBe(closed.length + open.length);
        expect(out.kpis.closed_trade_count).toBe(closed.length);
        expect(open.length).toBeLessThanOrEqual(1);
        expect(out.kpis.cash_end).toBeGreaterThanOrEqual(0);
        expect(out.nav.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
        expect(out.nav).toHaveLength(closes.length - 260);
        let previousSell = 0;
        for (const trade of out.trades) {
          expect(trade.buy.session).toBeGreaterThan(previousSell);
          expect(trade.buy.session).toBeGreaterThan(trade.buy.signal_session);
          expect(trade.buy.total_cost).toBeGreaterThan(0);
          if (trade.sell) {
            expect(trade.sell.session).toBeGreaterThan(trade.sell.signal_session);
            expect(trade.holding_sessions).toBe(trade.sell.session - trade.buy.session);
            expect(trade.holding_sessions).toBeLessThanOrEqual(hold);
            expect(trade.pnl_vnd).toBe(trade.sell.net_proceeds - trade.buy.total_cost);
            previousSell = trade.sell.session;
          }
        }
      }
    },
  );
});
