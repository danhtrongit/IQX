/**
 * Performance bench of a VN100 × 10 years basket run (§10.6, D8). Skipped unless
 * `STRATEGY_RULES_BENCH=1`:
 *
 *   STRATEGY_RULES_BENCH=1 npx vitest run test/unit/strategy-rules-bench
 *
 * Synthetic random-walk OHLCV, 100 symbols × ~3.700 sessions (2012-03 → 2026-11, the store's span),
 * a 10-year range, two strategies (RSI only; RSI + MACD + MA + Bollinger on both sides).
 */

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import {
  runBasketBacktest,
  type PriceSeriesBundle,
  type StrategyContent,
  type SymbolSeries,
} from '../../src/modules/strategy-rules/index.js';

const enabled = process.env.STRATEGY_RULES_BENCH === '1';

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

function bundleOf(calendar: string[], count: number): PriceSeriesBundle {
  const symbols: Record<string, SymbolSeries> = {};
  for (let k = 0; k < count; k += 1) {
    let seed = 17 + k * 7_919;
    const rand = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 2 ** 32;
    };
    const n = calendar.length;
    const s: SymbolSeries = {
      symbol: `S${String(k).padStart(3, '0')}`,
      session_idx: Int32Array.from({ length: n }, (_, i) => i),
      open: new Float64Array(n),
      high: new Float64Array(n),
      low: new Float64Array(n),
      close: new Float64Array(n),
      volume: new Float64Array(n),
      series_rev: 1,
    };
    let price = 10_000 + k * 500;
    for (let i = 0; i < n; i += 1) {
      const open = price;
      price = Math.max(1_000, Math.round(price * (1 + (rand() - 0.5) * 0.05)));
      s.open[i] = open;
      s.close[i] = price;
      s.high[i] = Math.max(open, price) + 100;
      s.low[i] = Math.min(open, price) - 100;
      s.volume[i] = Math.round(200_000 + rand() * 2_000_000);
    }
    symbols[s.symbol] = s;
  }
  return {
    calendar,
    data_as_of: calendar.at(-1)!,
    symbols,
    market: Float64Array.from(calendar, (_, i) => 1_000 + i / 10),
    data_hash: 'bench',
  };
}

function content(heavy: boolean): StrategyContent {
  const indicators = structuredClone(defaultConfig().indicators);
  const ids = heavy ? ['rsi', 'macd', 'ma', 'bollinger'] : ['rsi'];
  for (const id of ids) {
    const item = indicators[id]!;
    item.master_enabled = true;
    item.buy.enabled = true;
    item.sell.enabled = true;
  }
  return { universe: { type: 'vn100' }, indicators, max_holding: 30 };
}

describe.skipIf(!enabled)('bench · VN100 × 10 years', () => {
  it('runs within the 30 s executor budget', () => {
    const calendar = weekdays('2012-03-01', 3_700);
    const t0 = performance.now();
    const bundle = bundleOf(calendar, 100);
    const built = performance.now() - t0;
    const universe = Object.keys(bundle.symbols);
    const start = calendar[calendar.length - 2_520]!;
    const report: Record<string, unknown> = { bundle_build_ms: Math.round(built) };
    for (const heavy of [false, true]) {
      const cache = new Map();
      const c1 = process.cpuUsage();
      const t1 = performance.now();
      const result = runBasketBacktest({
        content: content(heavy),
        universe,
        start,
        end: calendar.at(-1)!,
        data: bundle,
        signal_cache: cache,
      });
      const cold = performance.now() - t1;
      const coldCpu = process.cpuUsage(c1).user / 1000;
      const t2 = performance.now();
      runBasketBacktest({
        content: content(heavy),
        universe,
        start,
        end: calendar.at(-1)!,
        data: bundle,
        signal_cache: cache,
      });
      const warm = performance.now() - t2;
      report[heavy ? 'rsi_macd_ma_bb' : 'rsi'] = {
        sessions: result.sessions,
        trades: result.trades.length,
        cold_ms: Math.round(cold),
        cold_cpu_ms: Math.round(coldCpu),
        warm_cached_signals_ms: Math.round(warm),
      };
      expect(cold).toBeLessThan(30_000);
    }
    report.heap_used_mb = Math.round(process.memoryUsage().heapUsed / 1e6);
    // stderr: vitest does not swallow it (console output of passing tests may be hidden).
    process.stderr.write(`STRATEGY_RULES_BENCH ${JSON.stringify(report)}\n`);
  }, 300_000);
});
