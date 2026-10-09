import { describe, expect, it } from 'vitest';

import {
  defaultPracticeConfig,
  practiceEntry,
  toSideConfig,
} from '../../src/modules/practice/practice.config.js';
import { MINI_ENGINE_PROFILE } from '../../src/modules/practice/practice.constants.js';
import { simulate, type SimulationInput } from '../../src/modules/practice/practice.engine.js';
import { calc, evaluateRule } from '../../src/modules/quant/v2/index.js';
import { makeBars } from './practice-fixtures.js';

/** Direct transcription of the approved HTML `simulate` (behavioural reference only). */
function reference(input: SimulationInput) {
  const { bars, entry: target, firstTestIndex: first, lastTestIndex: last } = input;
  const profile = MINI_ENGINE_PROFILE;
  const buySeries = calc(target.id, input.buy.params, bars);
  const sellSeries = calc(target.id, input.sell.params, bars);
  const met = (cfg: typeof input.buy, series: typeof buySeries, i: number): boolean | null => {
    if (!cfg.enabled) return false;
    let missing = false;
    let failed = false;
    for (const rule of cfg.rules) {
      const value = evaluateRule(rule, series, cfg.params, i);
      if (value === null) missing = true;
      else if (!value) failed = true;
    }
    return missing ? null : !failed;
  };
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
    const buyMet = met(input.buy, buySeries, i);
    const sellMet = met(input.sell, sellSeries, i);
    const open = pos as { at: number } | null;
    if (open) {
      const due = i - open.at + 1 >= input.holdMaxSessions;
      if (sellMet === true || due)
        pending = { side: 'sell', reason: sellMet === true ? 'indicator' : 'max_holding' };
    } else if (buyMet === true) pending = { side: 'buy' };
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

describe('practice engine: differential check against the reference HTML loop', () => {
  it.each(['rsi', 'macd', 'bollinger', 'stochastic', 'ma_cross', 'donchian', 'volume'])(
    'produces the same fills, P&L and NAV as the reference loop for %s',
    (id) => {
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
        const mine = simulate(input);
        const ref = reference(input);
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
      expect(compared).toBeGreaterThan(0);
    },
  );
});
