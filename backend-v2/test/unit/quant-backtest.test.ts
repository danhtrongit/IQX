import { describe, expect, it } from 'vitest';
import {
  attachVnIndex,
  runBacktest,
  sharesFor,
  type RiskConfig,
} from '../../src/modules/quant/backtest.engine.js';
import { buildFrame } from '../../src/modules/quant/conditions.js';
import { ohlcvFromRecords } from '../../src/modules/quant/indicators.js';

const risk: RiskConfig = {
  stop_loss: 'fixed',
  stop_atr_mult: 2,
  stop_fixed_pct: 0.05,
  take_profit_pct: null,
  max_holding: 4,
  position_size: 'all',
  position_fixed_amount: 10_000_000,
  fee_buy: 0.0015,
  fee_sell: 0.0025,
};
describe('quant backtest engine', () => {
  it('rounds lots including buy fee', () => expect(sharesFor(10_000_000, 10_000, risk)).toBe(900));
  it('reports trade PnL net of buy fee and sell tax', () => {
    const records = Array.from({ length: 35 }, (_, index) => ({
      time: `2026-02-${String(index + 1).padStart(2, '0')}`,
      open: 100,
      high: 101,
      low: 99,
      close: index === 20 ? 100 : index === 23 ? 110 : 100,
      volume: 1_000_000,
    }));
    const data = ohlcvFromRecords(records),
      frame = buildFrame(data);
    const result = runBacktest(
      data,
      frame,
      { logic: 'AND', conditions: [{ indicator: 'rsi_14', op: '==', value: 100 }] },
      { logic: 'AND', conditions: [] },
      { ...risk, stop_loss: 'none', max_holding: 3 },
      100_000_000,
      20,
    );
    const trade = result.trades[0]!;
    expect(trade.pnl_pct).toBeCloseTo((110 * 0.9975) / (100 * 1.0015) - 1, 4);
  });
  it('enforces T+2 and executes an adverse stop gap at the opening price', () => {
    const records = Array.from({ length: 35 }, (_, index) => ({
      time: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: index === 22 ? 80 : 100,
      high: index === 22 ? 82 : 101,
      low: index === 22 ? 79 : 99,
      close: index === 22 ? 81 : 100,
      volume: 1_000_000,
    }));
    const data = ohlcvFromRecords(records),
      frame = buildFrame(data);
    const result = runBacktest(
      data,
      frame,
      { logic: 'AND', conditions: [{ indicator: 'rsi_14', op: '==', value: 100 }] },
      { logic: 'AND', conditions: [] },
      risk,
      100_000_000,
      20,
    );
    expect(result.trades[0]).toMatchObject({
      entry_date: '2026-01-21',
      exit_date: '2026-01-23',
      exit_price: 80,
      hold: 2,
      trigger: 'Cắt lỗ',
    });
    expect(result.kpis.n_sessions).toBe(15);
  });
  it('aligns and forward-fills VNINDEX', () => {
    const curve = [
      { date: 'a', strategy: 100, buy_hold: 100 },
      { date: 'b', strategy: 101, buy_hold: 102 },
      { date: 'c', strategy: 99, buy_hold: 98 },
    ];
    expect(attachVnIndex(curve, ['a', 'c'], [1000, 1100]).map((item) => item.vnindex)).toEqual([
      100, 100, 110,
    ]);
  });
});
