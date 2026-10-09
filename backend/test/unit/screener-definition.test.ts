import { describe, expect, it } from 'vitest';

import {
  isLegacyDefinition,
  mapLegacyPeriod,
  normalizeDefinition,
  notReadyMetrics,
  readStoredDefinition,
  ruleIssues,
  type LegacyScreenerDefinition,
} from '../../src/modules/screener/screener.definition.js';
import {
  METRIC_REASON_CODES,
  METRIC_REASONS,
  UNSUPPORTED_METRICS,
  reasonCode,
} from '../../src/modules/screener/screener.metrics.js';
import {
  loadFundamentalRegistry,
  SCREENER_PERIODS,
  screenerPeriodLabel,
} from '../../src/modules/screener/screener.registry.js';

const legacy = (
  period: 'TTM' | 'annual' | 'quarter',
  metrics: string[],
): LegacyScreenerDefinition =>
  ({
    schema_version: '2.0',
    name: 'Bộ lọc cũ',
    logic: 'AND',
    rules: metrics.map((metric_id, index) => ({
      id: `r${index + 1}`,
      metric_id,
      operator: '>',
      value: 0.1,
      api_unit: 'ratio',
    })),
    scope: { market: 'HOSE', sector: 'all', period },
  }) as LegacyScreenerDefinition;

describe('fundamental registry period policy (Strategy spec §7.3, Appendix A.3)', () => {
  const registry = loadFundamentalRegistry();
  const byId = new Map(registry.map((metric) => [metric.id, metric]));

  it('gives all 42 metrics a default period inside their allowed periods', () => {
    expect(registry).toHaveLength(42);
    for (const metric of registry) {
      expect(metric.allowed_periods).toContain(metric.default_period);
      expect(new Set(metric.allowed_periods).size).toBe(metric.allowed_periods.length);
      for (const period of metric.allowed_periods) expect(SCREENER_PERIODS).toContain(period);
    }
  });

  it('F02/F03 follows the six Chapter 3 contracts exactly', () => {
    const six = (id: string) => {
      const metric = byId.get(id as never)!;
      return [metric.default_period, [...metric.allowed_periods]];
    };
    expect(six('revenue_yoy')).toEqual(['quarter', ['quarter', 'ttm', 'year']]);
    expect(six('profit_yoy')).toEqual(['quarter', ['quarter', 'ttm', 'year']]);
    expect(six('eps_yoy')).toEqual(['quarter', ['quarter', 'ttm', 'year']]);
    expect(six('gross_margin')).toEqual(['ttm', ['ttm', 'quarter', 'year']]);
    expect(six('net_margin')).toEqual(['ttm', ['ttm', 'quarter', 'year']]);
    // ROE has no quarterly period in the current scope.
    expect(six('roe')).toEqual(['ttm', ['ttm', 'year']]);
  });

  it('fixed-window metrics do not borrow quarter / ttm / year from the six', () => {
    for (const id of [
      'revenue_cagr3',
      'profit_cagr3',
      'revenue_growth_stability',
      'net_margin_stability',
    ])
      expect(byId.get(id as never)).toMatchObject({
        default_period: 'three_year',
        allowed_periods: ['three_year'],
      });
    for (const id of ['ccc', 'fcf_positive_streak', 'profit_positive_streak'])
      expect(byId.get(id as never)).toMatchObject({
        default_period: 'year',
        allowed_periods: ['year'],
      });
    // Balance metrics are read at a period end, so they have no TTM.
    for (const id of ['debt_equity', 'current_ratio'])
      expect(byId.get(id as never)!.allowed_periods).toEqual(['quarter', 'year']);
  });

  it('readiness matches what the repository can really compute', () => {
    const notReady = registry.filter((metric) => metric.readiness !== 'ready').map((m) => m.id);
    expect(notReady.sort()).toEqual(Object.keys(UNSUPPORTED_METRICS).sort());
    expect(byId.get('roic')?.readiness).toBe('definition_pending');
    expect(byId.get('roic_stability')?.readiness).toBe('definition_pending');
    expect(byId.get('dividend_yield')?.readiness).toBe('data_unavailable');
    expect(byId.get('eps_yoy')?.readiness).toBe('data_unavailable');
    expect(notReadyMetrics(['roe', 'roic', 'dividend_yield', 'roic'])).toEqual([
      { metric_id: 'roic', readiness: 'definition_pending' },
      { metric_id: 'dividend_yield', readiness: 'data_unavailable' },
    ]);
  });

  it('labels periods; balance metrics say "số dư cuối kỳ"', () => {
    expect(screenerPeriodLabel('revenue_yoy', 'quarter')).toBe('Quý gần nhất');
    expect(screenerPeriodLabel('revenue_yoy', 'ttm')).toBe('Bốn quý gần nhất');
    expect(screenerPeriodLabel('revenue_yoy', 'year')).toBe('Năm tài chính gần nhất');
    expect(screenerPeriodLabel('debt_equity', 'quarter')).toBe('Số dư cuối quý gần nhất');
  });

  it('every reason text has a stable machine-readable code', () => {
    expect(Object.keys(METRIC_REASON_CODES).sort()).toEqual(Object.keys(METRIC_REASONS).sort());
    expect(reasonCode('missing', METRIC_REASONS.noReport)).toBe('no_report');
    expect(reasonCode('insufficient_base', METRIC_REASONS.nonPositiveBase)).toBe(
      'non_positive_base',
    );
    expect(reasonCode('data_unavailable', 'free text')).toBe('data_unavailable');
    expect(reasonCode('ok', undefined)).toBeUndefined();
  });
});

describe('ruleIssues', () => {
  const rule = {
    metric_id: 'roe' as const,
    period: 'ttm' as const,
    operator: '>' as const,
    api_unit: 'ratio' as const,
  };

  it('F03 rejects ROE quarter, never converting it', () => {
    expect(ruleIssues([{ ...rule, period: 'quarter' }]).map((issue) => issue.code)).toEqual([
      'PERIOD_NOT_ALLOWED',
    ]);
    expect(ruleIssues([rule])).toEqual([]);
  });

  it('flags a wrong unit and a repeated metric', () => {
    expect(ruleIssues([{ ...rule, api_unit: 'lần' }])[0]?.code).toBe('UNIT_MISMATCH');
    expect(ruleIssues([rule, { ...rule, period: 'year' }])[0]?.code).toBe('DUPLICATE_METRIC');
    expect(ruleIssues([rule], [{ metric_id: 'roe', period: 'year' }])[0]?.code).toBe(
      'DUPLICATE_METRIC',
    );
  });
});

describe('legacy 2.0 definitions (I05 / I06)', () => {
  it('I05 maps the filter-wide period onto each rule, preserving what the old run computed', () => {
    const quarter = normalizeDefinition(legacy('quarter', ['revenue_yoy', 'gross_margin']));
    expect(quarter.definition.schema_version).toBe('3.0');
    expect(quarter.definition.data_mode).toBe('latest_disclosed');
    expect(quarter.definition.rules.map((r) => [r.metric_id, r.period])).toEqual([
      ['revenue_yoy', 'quarter'],
      ['gross_margin', 'quarter'],
    ]);
    expect(quarter.definition.scope).toEqual({ market: 'HOSE', sector: 'all' });
    expect(quarter.legacy).toMatchObject({ needs_review: false, legacy_period: 'quarter' });

    const annual = normalizeDefinition(legacy('annual', ['profit_yoy', 'pe', 'debt_equity']));
    expect(annual.definition.rules.map((r) => r.period)).toEqual(['year', 'year', 'year']);

    const ttm = normalizeDefinition(legacy('TTM', ['roe', 'debt_equity', 'pe']));
    // Old balance metrics read the latest quarter end under TTM; valuation used TTM flows.
    expect(ttm.definition.rules.map((r) => r.period)).toEqual(['ttm', 'quarter', 'ttm']);
  });

  it('metrics with one fixed window keep it whatever the old period said', () => {
    for (const period of ['TTM', 'annual', 'quarter'] as const) {
      const mapped = normalizeDefinition(
        legacy(period, ['revenue_cagr3', 'ccc', 'profit_positive_streak']),
      );
      expect(mapped.definition.rules.map((r) => r.period)).toEqual(['three_year', 'year', 'year']);
      expect(mapped.legacy?.needs_review).toBe(false);
    }
  });

  it('I06 an unsupported period (ROE quarter) is kept as evidence and flagged, not turned into TTM', () => {
    const mapped = normalizeDefinition(legacy('quarter', ['roe', 'revenue_yoy']));
    expect(mapped.definition.rules[0]).toMatchObject({ metric_id: 'roe', period: 'quarter' });
    expect(mapped.legacy?.needs_review).toBe(true);
    expect(mapped.legacy?.rules).toEqual([
      expect.objectContaining({
        rule_id: 'r1',
        metric_id: 'roe',
        legacy_period: 'quarter',
        mapped_period: 'quarter',
        status: 'needs_review',
      }),
      expect.objectContaining({ rule_id: 'r2', status: 'ok' }),
    ]);
    expect(mapLegacyPeriod('roe', 'quarter')).toEqual({
      period: 'quarter',
      review: 'unsupported_period',
    });
    expect(mapLegacyPeriod('roe', 'annual')).toEqual({ period: 'year', review: null });
  });

  it('readStoredDefinition maps 2.0 on read, passes 3.0 through and tolerates garbage', () => {
    const stored = legacy('annual', ['revenue_yoy']);
    const copy = structuredClone(stored);
    const mapped = readStoredDefinition(stored);
    expect(mapped?.definition.rules[0]?.period).toBe('year');
    // The stored document itself is never rewritten.
    expect(stored).toEqual(copy);
    expect(isLegacyDefinition(stored)).toBe(true);
    const current = readStoredDefinition(mapped?.definition);
    expect(current?.legacy).toBeNull();
    expect(current?.definition.rules[0]?.period).toBe('year');
    expect(readStoredDefinition(null)).toBeNull();
    expect(readStoredDefinition({ schema_version: '9.9', rules: [], scope: {} })).toBeNull();
    expect(readStoredDefinition(legacy('TTM', ['not_a_metric']))).toBeNull();
  });
});
