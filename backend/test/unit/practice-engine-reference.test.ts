import { describe, expect, it } from 'vitest';

import {
  defaultPracticeConfig,
  practiceEntry,
  toSideConfig,
} from '../../src/modules/practice/practice.config.js';
import { MINI_ENGINE_PROFILE } from '../../src/modules/practice/practice.constants.js';
import { simulate, type SimulationInput } from '../../src/modules/practice/practice.engine.js';
import type { PracticeRowsConfig } from '../../src/modules/practice/practice.types.js';
import {
  calc,
  evaluateRule,
  isParamsSide,
  type Bar,
  type Side,
  type SideConfig,
  type Tri,
} from '../../src/modules/quant/v2/index.js';
import { makeBars } from './practice-fixtures.js';

type Series = ReadonlyArray<number | null | undefined>;

// ------------------------------------------------------------------ independent decision oracle
//
// SPEC V3 §2 written out directly over the raw `calc` arrays, with none of the shared evaluator
// code: the same primitives (>, <, cross up/down, trend N, vs previous bar) applied to the default
// rows of each indicator. Only the decision layer is re-derived here; the formulas of `calc` are the
// unchanged ones of the indicator engine.

const num = (series: Series | undefined, i: number): number | null => {
  const value = series?.[i];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const gt = (x: Series, y: Series | number, i: number): Tri => {
  const a = num(x, i);
  const b = typeof y === 'number' ? y : num(y, i);
  return a === null || b === null ? null : a > b;
};
const lt = (x: Series, y: Series | number, i: number): Tri => {
  const a = num(x, i);
  const b = typeof y === 'number' ? y : num(y, i);
  return a === null || b === null ? null : a < b;
};
const level = (y: Series | number, j: number): number | null =>
  typeof y === 'number' ? y : num(y, j);
const crossUp = (x: Series, y: Series | number, i: number): Tri => {
  const [a, b, pa, pb] = [num(x, i), level(y, i), num(x, i - 1), level(y, i - 1)];
  return a === null || b === null || pa === null || pb === null ? null : pa <= pb && a > b;
};
const crossDown = (x: Series, y: Series | number, i: number): Tri => {
  const [a, b, pa, pb] = [num(x, i), level(y, i), num(x, i - 1), level(y, i - 1)];
  return a === null || b === null || pa === null || pb === null ? null : pa >= pb && a < b;
};
const lag = (up: boolean, x: Series, n: number, i: number): Tri =>
  up ? gt(x, num(x, i - n) ?? Number.NaN, i) : lt(x, num(x, i - n) ?? Number.NaN, i);

type Oracle = (side: Side, i: number) => Tri[];

function oracleOf(id: string, bars: readonly Bar[]): Oracle | null {
  const close: Series = bars.map((bar) => bar.close);
  const buy = (side: Side): boolean => side === 'buy';
  switch (id) {
    case 'rsi': {
      const rsi = calc('rsi', { period: 14 }, bars).value!;
      return (side, i) => [buy(side) ? lt(rsi, 30, i) : gt(rsi, 70, i), lag(buy(side), rsi, 14, i)];
    }
    case 'macd': {
      const m = calc('macd', { fast: 12, slow: 26, signal: 9 }, bars);
      return (side, i) => [
        buy(side) ? crossUp(m.value!, m.signal!, i) : crossDown(m.value!, m.signal!, i),
      ];
    }
    case 'ma': {
      const sma = calc('ma', { period: 20 }, bars).value!;
      return (side, i) => [buy(side) ? crossUp(close, sma, i) : crossDown(close, sma, i)];
    }
    case 'ema': {
      const ema = calc('ema', { period: 20 }, bars).value!;
      return (side, i) => [buy(side) ? crossUp(close, ema, i) : crossDown(close, ema, i)];
    }
    case 'ma_cross': {
      const m = calc('ma_cross', { fast: 20, slow: 50 }, bars);
      return (side, i) => [
        buy(side) ? crossUp(m.fast!, m.slow!, i) : crossDown(m.fast!, m.slow!, i),
      ];
    }
    case 'bollinger': {
      const b = calc('bollinger', { period: 20, k: 2 }, bars);
      const width = (j: number): number | null => {
        const [u, l, m] = [num(b.upper, j), num(b.lower, j), num(b.middle, j)];
        return u === null || l === null || m === null || m === 0 ? null : (u - l) / m;
      };
      return (side, i) => {
        const [c, pc] = [num(close, i), num(close, i - 1)];
        const [l, u] = [num(b.lower, i), num(b.upper, i)];
        const [pl, pu] = [num(b.lower, i - 1), num(b.upper, i - 1)];
        const prev = buy(side) ? pl : pu;
        const reenter: Tri =
          c === null || pc === null || l === null || u === null || prev === null
            ? null
            : (buy(side) ? pc < prev : pc > prev) && c >= l && c <= u;
        const [w, pw] = [width(i), width(i - 1)];
        const narrowed: Tri = w === null || pw === null ? null : buy(side) ? w < pw : w > pw;
        return [reenter, c === null || pc === null ? null : buy(side) ? c > pc : c < pc, narrowed];
      };
    }
    case 'stochastic': {
      const level14 = calc('stochastic', { k: 14, smooth: 3, d: 3 }, bars);
      return (side, i) => [
        buy(side) ? lt(level14.value!, 20, i) : gt(level14.value!, 80, i),
        buy(side)
          ? crossUp(level14.value!, level14.signal!, i)
          : crossDown(level14.value!, level14.signal!, i),
      ];
    }
    case 'donchian': {
      const d = calc('donchian', { period: 20 }, bars);
      return (side, i) => [buy(side) ? gt(close, d.upper!, i) : lt(close, d.lower!, i)];
    }
    case 'cci': {
      const cci = calc('cci', { period: 20 }, bars).value!;
      return (side, i) => [buy(side) ? crossUp(cci, -100, i) : crossDown(cci, 100, i)];
    }
    case 'mfi': {
      const mfi = calc('mfi', { period: 14 }, bars).value!;
      return (side, i) => [buy(side) ? crossUp(mfi, 20, i) : crossDown(mfi, 80, i)];
    }
    case 'dmi': {
      const d = calc('dmi', { period: 14 }, bars);
      return (side, i) => [
        buy(side) ? crossUp(d.plus!, d.minus!, i) : crossDown(d.plus!, d.minus!, i),
      ];
    }
    default:
      return null;
  }
}

const and3 = (values: readonly Tri[]): Tri =>
  values.includes(false) ? false : values.includes(null) ? null : true;

/** Decision of one tab: the oracle for row indicators, the unchanged legacy rules for Volume. */
function decide(
  oracle: Oracle | null,
  config: SideConfig,
  side: Side,
  bars: readonly Bar[],
  i: number,
): Tri {
  if (!config.enabled) return false;
  if (isParamsSide(config)) {
    const rules = config.rules.filter((rule) => rule.enabled !== false);
    if (rules.length === 0) return false;
    const series = calc('volume', config.params, bars);
    return and3(rules.map((rule) => evaluateRule(rule, series, config.params, i)));
  }
  if (!oracle) throw new Error('no oracle');
  return and3(oracle(side, i));
}

/** Direct transcription of the approved HTML `simulate` (behavioural reference only). */
function reference(input: SimulationInput, oracle: Oracle | null) {
  const { bars, firstTestIndex: first, lastTestIndex: last } = input;
  const profile = MINI_ENGINE_PROFILE;
  const maxQty = (cash: number, price: number): number => {
    let q = Math.floor(cash / (price * (1 + profile.buy_fee_rate)) / profile.lot) * profile.lot;
    while (q > 0 && q * price + Math.round(q * price * profile.buy_fee_rate) > cash)
      q -= profile.lot;
    return Math.max(0, q);
  };
  let cash = profile.capital;
  let pos: { n: number; qty: number; at: number; price: number; total: number } | null = null;
  let pending: { side: 'buy' | 'sell'; reason?: string } | null = null;
  let buys = 0;
  const trades: Array<{
    qty: number;
    entry: number;
    exit: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    holding: number;
    reason: string | undefined;
  }> = [];
  for (let i = first; i <= last; i++) {
    const bar = bars[i]!;
    if (pending) {
      const order: { side: 'buy' | 'sell'; reason?: string } = pending;
      pending = null;
      if (order.side === 'buy' && !pos) {
        const q = maxQty(cash, bar.open);
        if (q > 0) {
          const fee = Math.round(q * bar.open * profile.buy_fee_rate);
          const total = q * bar.open + fee;
          cash -= total;
          buys++;
          pos = { n: buys, qty: q, at: i, price: bar.open, total };
        }
      } else if (order.side === 'sell' && pos) {
        const fee = Math.round(pos.qty * bar.open * profile.sell_cost_rate);
        const net = pos.qty * bar.open - fee;
        cash += net;
        trades.push({
          qty: pos.qty,
          entry: pos.at,
          exit: i,
          entryPrice: pos.price,
          exitPrice: bar.open,
          pnl: net - pos.total,
          holding: i - pos.at,
          reason: order.reason,
        });
        pos = null;
      }
    }
    const open = pos as { at: number } | null;
    if (open) {
      const sellMet = decide(oracle, input.sell, 'sell', bars, i);
      const due = i - open.at + 1 >= input.holdMaxSessions;
      if (sellMet === true || due)
        pending = { side: 'sell', reason: sellMet === true ? 'indicator' : 'max_holding' };
    } else if (decide(oracle, input.buy, 'buy', bars, i) === true) pending = { side: 'buy' };
  }
  const lastBar = bars[last]!;
  const held = pos as { qty: number } | null;
  return { trades, buys, nav: cash + (held ? held.qty * lastBar.close : 0), cash };
}

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

describe('practice engine: differential check against the reference HTML loop (rows)', () => {
  it.each([
    'rsi',
    'macd',
    'ma',
    'ema',
    'bollinger',
    'stochastic',
    'ma_cross',
    'donchian',
    'cci',
    'mfi',
    'dmi',
    'volume',
  ])('produces the same fills, P&L and NAV as the reference loop for %s', (id) => {
    const target = practiceEntry(id)!;
    const defaults = defaultPracticeConfig(target);
    let compared = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const next = random(seed * 104729);
      const closes: number[] = [];
      let price = 15_000 + Math.floor(next() * 50_000);
      for (let i = 0; i < 700; i++) {
        price = Math.max(1_000, Math.round((price * (1 + (next() - 0.5) * 0.05)) / 10) * 10);
        closes.push(price);
      }
      const input: SimulationInput = {
        entry: target,
        bars: makeBars(closes),
        firstTestIndex: 270,
        lastTestIndex: closes.length - 1,
        buy: toSideConfig(target, 'buy', defaults.buy),
        sell: toSideConfig(target, 'sell', defaults.sell),
        holdMaxSessions: 1 + Math.floor(next() * 80),
      };
      const oracle = oracleOf(id, input.bars);
      expect(oracle !== null || id === 'volume', id).toBe(true);
      const mine = simulate(input);
      const ref = reference(input, oracle);
      const closed = mine.trades.filter((trade) => trade.status === 'closed');
      expect(mine.kpis.buy_count, `${id}#${seed} buys`).toBe(ref.buys);
      expect(closed.length, `${id}#${seed} closed`).toBe(ref.trades.length);
      closed.forEach((trade, index) => {
        const expected = ref.trades[index]!;
        expect(trade.qty).toBe(expected.qty);
        expect(trade.buy.session).toBe(expected.entry - 270 + 1);
        expect(trade.sell!.session).toBe(expected.exit - 270 + 1);
        expect(trade.buy.price).toBe(expected.entryPrice);
        expect(trade.sell!.price).toBe(expected.exitPrice);
        expect(trade.pnl_vnd).toBe(expected.pnl);
        expect(trade.holding_sessions).toBe(expected.holding);
        expect(trade.sell!.reason).toBe(expected.reason);
      });
      expect(mine.kpis.nav_end).toBeCloseTo(ref.nav, 4);
      expect(mine.kpis.cash_end).toBe(ref.cash);
      compared += ref.trades.length;
    }
    expect(compared, `${id} trades compared`).toBeGreaterThan(0);
  });

  it('agrees with the oracle on a non-default combination of rows (several rows on, own periods)', () => {
    // RSI 9 < 35 AND RSI 9 trend up over 9 sessions; sell RSI 21 > 65 only
    const target = practiceEntry('rsi')!;
    const config = structuredClone(defaultPracticeConfig(target) as PracticeRowsConfig);
    Object.assign(config.buy.rules[0]!, { period: 9, threshold: 35 });
    Object.assign(config.buy.rules[1]!, { period: 9 });
    Object.assign(config.sell.rules[0]!, { period: 21, threshold: 65 });
    config.sell.rules[1]!.enabled = false;
    let compared = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const next = random(seed * 7907);
      const closes: number[] = [];
      let price = 20_000;
      for (let i = 0; i < 700; i++) {
        price = Math.max(1_000, Math.round((price * (1 + (next() - 0.5) * 0.06)) / 10) * 10);
        closes.push(price);
      }
      const input: SimulationInput = {
        entry: target,
        bars: makeBars(closes),
        firstTestIndex: 270,
        lastTestIndex: closes.length - 1,
        buy: toSideConfig(target, 'buy', config.buy),
        sell: toSideConfig(target, 'sell', config.sell),
        holdMaxSessions: 5 + Math.floor(next() * 60),
      };
      const rsi9 = calc('rsi', { period: 9 }, input.bars).value!;
      const rsi21 = calc('rsi', { period: 21 }, input.bars).value!;
      const oracle: Oracle = (side, i) =>
        side === 'buy' ? [lt(rsi9, 35, i), lag(true, rsi9, 9, i)] : [gt(rsi21, 65, i)];
      const mine = simulate(input);
      const ref = reference(input, oracle);
      expect(mine.kpis.buy_count, `#${seed} buys`).toBe(ref.buys);
      const closed = mine.trades.filter((trade) => trade.status === 'closed');
      expect(
        closed.map((trade) => [trade.buy.session, trade.sell!.session, trade.pnl_vnd]),
      ).toEqual(
        ref.trades.map((trade) => [trade.entry - 270 + 1, trade.exit - 270 + 1, trade.pnl]),
      );
      compared += ref.trades.length;
    }
    expect(compared).toBeGreaterThan(0);
  });
});
