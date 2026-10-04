import { describe, expect, it } from 'vitest';

import {
  calculateMetric,
  displayToApi,
  METRIC_ARG_UNITS,
  metricSupport,
  UNSUPPORTED_METRICS,
} from '../../src/modules/screener/screener.metrics.js';
import {
  loadFundamentalRegistry,
  SCREENER_METRIC_IDS,
  type ScreenerMetricId,
} from '../../src/modules/screener/screener.registry.js';

const registry = loadFundamentalRegistry();

/** Worked-fixture inputs are lesson display units; ratio-typed arguments travel ÷ 100. */
function fixtureArgs(id: ScreenerMetricId, inputs: readonly (readonly [string, number])[]) {
  const units = METRIC_ARG_UNITS[id];
  return inputs.map(([, value], index) =>
    units !== 'series' && units[index] === 'ratio' ? value / 100 : value,
  );
}

describe('fundamental registry loader', () => {
  it('loads the 42 iqx-fund-2.0 metrics in the request-enum order', () => {
    expect(registry).toHaveLength(42);
    expect(registry.map((metric) => metric.id)).toEqual([...SCREENER_METRIC_IDS]);
    for (const metric of registry) {
      expect(metric.calculation_version).toBe('iqx-fund-2.0');
      expect(metric.api_unit).toBe(
        metric.unit === '%' || metric.unit === 'điểm %' ? 'ratio' : metric.unit,
      );
    }
  });

  it('declares argument units with the same arity as every worked fixture', () => {
    for (const metric of registry) {
      const units = METRIC_ARG_UNITS[metric.id];
      if (units !== 'series') expect(units).toHaveLength(metric.worked_fixture.inputs.length);
    }
  });
});

describe('calculateMetric worked fixtures (API units)', () => {
  it.each(registry.map((metric) => [metric.id, metric] as const))('%s', (id, metric) => {
    const fixture = metric.worked_fixture;
    const result = calculateMetric(id, fixtureArgs(id, fixture.inputs));
    const expected = displayToApi(fixture.expected, fixture.unit);
    const tolerance = displayToApi(fixture.tolerance, fixture.unit);
    expect(result.status).toBe('ok');
    expect(result.value).not.toBeNull();
    expect(Math.abs(result.value! - expected)).toBeLessThanOrEqual(tolerance);
  });

  it('returns percentages as ratios (15% travels as 0.15)', () => {
    expect(calculateMetric('roe', [120, 600]).value).toBeCloseTo(0.2, 12);
    expect(calculateMetric('revenue_yoy', [1200, 1000]).value).toBeCloseTo(0.2, 12);
    expect(displayToApi(15, '%')).toBe(0.15);
    expect(displayToApi(2.5, 'điểm %')).toBe(0.025);
    expect(displayToApi(1.5, 'lần')).toBe(1.5);
    expect(displayToApi(45, 'ngày')).toBe(45);
  });
});

describe('calculateMetric null policies', () => {
  it('missing or non-finite inputs are missing, never 0', () => {
    expect(calculateMetric('gross_margin', [300, null])).toMatchObject({
      value: null,
      status: 'missing',
    });
    expect(calculateMetric('gross_margin', [undefined, 1000])).toMatchObject({
      value: null,
      status: 'missing',
    });
    expect(calculateMetric('roe', [Number.NaN, 600]).status).toBe('missing');
    expect(calculateMetric('roe', [Number.POSITIVE_INFINITY, 600]).status).toBe('missing');
    expect(calculateMetric('roe', []).status).toBe('missing');
  });

  it.each(['revenue_yoy', 'profit_yoy', 'eps_yoy', 'fcf_yoy', 'share_count_yoy'] as const)(
    '%s: base ≤ 0 is insufficient_base (no abs denominator, no 0%%)',
    (id) => {
      expect(calculateMetric(id, [100, 0])).toMatchObject({
        value: null,
        status: 'insufficient_base',
      });
      const negativeBase = calculateMetric(id, [100, -50]);
      expect(negativeBase).toMatchObject({ value: null, status: 'insufficient_base' });
      expect(negativeBase.reason).toBeTruthy();
      // A negative current value over a positive base is a valid decline.
      expect(calculateMetric(id, [-50, 100]).value).toBeCloseTo(-1.5, 12);
    },
  );

  it.each(['revenue_cagr3', 'profit_cagr3', 'eps_cagr3', 'dividend_cagr3'] as const)(
    '%s: every year point must be positive',
    (id) => {
      expect(calculateMetric(id, [1331, 0]).status).toBe('insufficient_base');
      expect(calculateMetric(id, [-10, 1000]).status).toBe('insufficient_base');
      expect(calculateMetric(id, [1331, 1000, -1, 1100]).status).toBe('insufficient_base');
      expect(calculateMetric(id, [1331, 1000, 1210, 1100]).value).toBeCloseTo(0.1, 12);
      expect(calculateMetric(id, [1331, 1000, 1210]).status).toBe('missing');
    },
  );

  it('stability needs exactly three observations and uses population SD (÷3)', () => {
    expect(calculateMetric('net_margin_stability', [0.1, 0.12]).status).toBe('missing');
    expect(calculateMetric('net_margin_stability', [0.1, 0.12, 0.14, 0.16]).status).toBe('missing');
    expect(calculateMetric('revenue_growth_stability', [0.1, 0.2, 0.3]).value).toBeCloseTo(
      Math.sqrt(2 / 300),
      12,
    );
  });

  it('ratios with a non-positive denominator are insufficient_base; negative numerators stay valid', () => {
    expect(calculateMetric('debt_equity', [300, -500]).status).toBe('insufficient_base');
    expect(calculateMetric('pe', [40000, -100]).status).toBe('insufficient_base');
    expect(calculateMetric('pe', [40000, 0]).status).toBe('insufficient_base');
    expect(calculateMetric('ev_ebitda', [1800, 0]).status).toBe('insufficient_base');
    expect(calculateMetric('net_margin', [-120, 1000]).value).toBeCloseTo(-0.12, 12);
    expect(calculateMetric('net_debt_ebitda', [-400, 200]).value).toBeCloseTo(-2, 12);
  });

  it('P/E with a non-positive price is missing; PEG needs positive P/E and growth', () => {
    expect(calculateMetric('pe', [0, 4000])).toMatchObject({ status: 'missing', value: null });
    expect(calculateMetric('peg', [-15, 0.2]).status).toBe('insufficient_base');
    expect(calculateMetric('peg', [15, -0.2]).status).toBe('insufficient_base');
    expect(calculateMetric('peg', [15, 0]).status).toBe('insufficient_base');
  });

  it('interest coverage without interest expense is not_applicable (no huge ratio)', () => {
    expect(calculateMetric('interest_coverage', [120, 0])).toMatchObject({
      value: null,
      status: 'not_applicable',
    });
    expect(calculateMetric('interest_coverage', [-30, 30]).value).toBe(-1);
  });

  it('streaks stop at ≤ 0 and flag an all-positive history as a lower bound', () => {
    expect(calculateMetric('fcf_positive_streak', [10, 0, 8, 12])).toMatchObject({ value: 2 });
    expect(calculateMetric('fcf_positive_streak', [10, 0, 8, 12]).lower_bound).toBeUndefined();
    expect(calculateMetric('profit_positive_streak', [5, 9, 11])).toMatchObject({
      value: 3,
      lower_bound: true,
    });
    expect(calculateMetric('profit_positive_streak', [5, 9, -1]).value).toBe(0);
  });

  it('CCC can be negative and needs three components', () => {
    expect(calculateMetric('ccc', [10, 5, 40]).value).toBe(-25);
    expect(calculateMetric('ccc', [10, 5]).status).toBe('missing');
  });
});

describe('support matrix', () => {
  it('flags metrics without a real data source with a Vietnamese reason', () => {
    const unsupported = Object.keys(UNSUPPORTED_METRICS);
    expect(unsupported.length).toBeGreaterThan(0);
    for (const id of SCREENER_METRIC_IDS) {
      const support = metricSupport(id);
      if (unsupported.includes(id)) {
        expect(support.supported).toBe(false);
        expect(support.unsupported_reason).toMatch(
          /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/u,
        );
      } else {
        expect(support).toEqual({ supported: true, unsupported_reason: null });
      }
    }
    for (const id of ['dividend_yield', 'shareholder_yield', 'eps_yoy', 'roic'] as const)
      expect(metricSupport(id).supported).toBe(false);
  });
});
