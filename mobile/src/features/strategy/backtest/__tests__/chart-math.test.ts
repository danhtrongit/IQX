import { buildChartModel, chartPoints, indexAtX, linePath, makeScale, thinPoints } from '../chart-math';
import type { BacktestResult } from '../types';

const pts = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('chart math', () => {
  it('keeps all points under the cap', () => {
    expect(thinPoints(pts(600))).toHaveLength(600);
  });
  it('downsamples to <= 600 keeping first and last', () => {
    const out = thinPoints(pts(1801));
    expect(out.length).toBeLessThanOrEqual(601);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(1800);
  });

  const result = {
    kpis: {},
    initial: { date: '2025-01-02', return_pct: 0, buy_hold_pct: 0, market_pct: 0 },
    curve: [
      { date: '2025-01-03', return_pct: 5, buy_hold_pct: -10, market_pct: 2 },
      { date: '2025-01-06', return_pct: -3, buy_hold_pct: 4, market_pct: null },
    ],
    chart: { series: [{ id: 'market', label: 'VN-Index', available: true }] },
  } as unknown as BacktestResult;

  it('prepends initial and computes range including zero', () => {
    expect(chartPoints(result)).toHaveLength(3);
    const m = buildChartModel(result);
    expect(m.hasMarket).toBe(true);
    expect(m.min).toBeLessThan(-10);
    expect(m.max).toBeGreaterThan(5);
  });

  it('hides market when unavailable', () => {
    const r = { ...result, chart: { series: [{ id: 'market', label: 'VN-Index', available: false }] } } as unknown as BacktestResult;
    expect(buildChartModel(r).hasMarket).toBe(false);
  });

  it('scales values and breaks paths at gaps', () => {
    const m = buildChartModel(result);
    const s = makeScale(m, 300, 240);
    expect(s.x(0)).toBe(44);
    expect(s.x(2)).toBe(292);
    expect(s.y(m.max)).toBeCloseTo(8);
    expect(s.y(m.min)).toBeCloseTo(220);
    const d = linePath(m.points, 'market_pct', s);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.includes('L')).toBe(true);
  });

  it('maps touch x to index', () => {
    expect(indexAtX(0, 10, 300)).toBe(0);
    expect(indexAtX(1000, 10, 300)).toBe(9);
    expect(indexAtX(168, 3, 300)).toBe(1);
  });
});
