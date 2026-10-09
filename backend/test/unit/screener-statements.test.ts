import { describe, expect, it } from 'vitest';

import { METRIC_STATUSES } from '../../src/modules/screener/screener.metrics.js';
import {
  evaluateScreenerMetric,
  normalizeVciStatements,
  type VciStatementSections,
} from '../../src/modules/screener/screener.statements.js';

type Row = Record<string, unknown>;

interface PeriodSpec {
  year: number;
  length: number;
  public_date: string;
  income: Row;
  cash: Row;
  balance: Row;
}

const meta = (spec: PeriodSpec) => ({
  year_report: spec.year,
  length_report: spec.length,
  public_date: `${spec.public_date}T00:00:00`,
  update_date: `${spec.public_date}T10:00:00`,
});

function sections(periods: PeriodSpec[], extraIncome: Row = {}): VciStatementSections {
  const split = (kind: 'years' | 'quarters', part: 'income' | 'cash' | 'balance') =>
    periods
      .filter((p) => (kind === 'years' ? p.length === 5 : p.length !== 5))
      .map((p) => ({ ...meta(p), ...p[part], ...(part === 'income' ? extraIncome : {}) }));
  return {
    income_statement: { years: split('years', 'income'), quarters: split('quarters', 'income') },
    cash_flow: { years: split('years', 'cash'), quarters: split('quarters', 'cash') },
    balance_sheet: { years: split('years', 'balance'), quarters: split('quarters', 'balance') },
  };
}

/** Discrete quarter with VCI sign conventions (costs/outflows negative). */
function quarter(
  year: number,
  q: number,
  revenue: number,
  profit: number,
  equity: number,
): PeriodSpec {
  const month = String(q * 3 + 1).padStart(2, '0');
  return {
    year,
    length: q,
    public_date: q === 4 ? `${year + 1}-01-30` : `${year}-${month}-20`,
    income: {
      isa3: revenue,
      isa4: -revenue * 0.7,
      isa5: revenue * 0.3,
      isa8: -10,
      isa16: 40,
      isa20: profit,
      isa22: profit,
    },
    cash: { cfa2: 5, cfa103: 0, cfa18: profit + 10, cfa19: -15, cfa27: 0, cfa28: -2 },
    balance: {
      bsa1: 600,
      bsa2: 50,
      bsa5: 30,
      bsa9: 100,
      bsa15: 120,
      bsa53: 1500,
      bsa55: 400,
      bsa56: 150,
      bsa57: 80,
      bsa71: 150,
      bsa78: equity,
      bsa174: 0,
      bsa210: 30,
    },
  };
}

function fiscalYear(year: number, revenue: number, profit: number, cfo: number): PeriodSpec {
  return {
    year,
    length: 5,
    public_date: `${year + 1}-03-20`,
    income: {
      isa3: revenue,
      isa4: -revenue * 0.7,
      isa5: revenue * 0.3,
      isa8: -40,
      isa16: 160,
      isa20: profit,
      isa22: profit,
    },
    cash: { cfa2: 20, cfa103: 0, cfa18: cfo, cfa19: -60, cfa27: 0, cfa28: 0 },
    balance: {
      bsa1: 600,
      bsa2: 50,
      bsa5: 30,
      bsa9: 100,
      bsa15: 120,
      bsa53: 1500,
      bsa55: 400,
      bsa56: 150,
      bsa57: 80,
      bsa71: 150,
      bsa78: 500 + year - 2020,
      bsa174: 0,
      bsa210: 30,
    },
  };
}

const periods: PeriodSpec[] = [
  ...[1, 2, 3, 4].map((q) => quarter(2023, q, 250, 25, 610)),
  ...[1, 2, 3, 4].map((q) => quarter(2024, q, 300, 30, 650)),
  fiscalYear(2021, 800, -10, 50),
  fiscalYear(2022, 900, 80, 90),
  fiscalYear(2023, 1000, 100, 120),
  fiscalYear(2024, 1200, 120, 130),
];

const asOf = new Date('2025-04-01T03:00:00Z');
const noMarket = { price: null, shares: null };

describe('normalizeVciStatements', () => {
  it('merges the three sections per period, newest first, negating VCI outflow lines', () => {
    const statements = normalizeVciStatements(sections(periods), asOf);
    expect(statements.financial).toBe(false);
    expect(statements.years.map((p) => p.year)).toEqual([2024, 2023, 2022, 2021]);
    expect(statements.quarters.map((p) => `${p.year}Q${p.quarter}`)).toEqual([
      '2024Q4',
      '2024Q3',
      '2024Q2',
      '2024Q1',
      '2023Q4',
      '2023Q3',
      '2023Q2',
      '2023Q1',
    ]);
    const latest = statements.quarters[0]!;
    expect(latest.values.cogs).toBe(210);
    expect(latest.values.interest_expense).toBe(10);
    expect(latest.values.capex).toBe(15);
    expect(latest.values.share_buyback).toBe(2);
    expect(latest.values.revenue).toBe(300);
    expect(latest.published_at).toBe('2025-01-30');
  });

  it('drops reports not yet published at as-of (date-only → usable from the next day)', () => {
    const sameDay = normalizeVciStatements(sections(periods), new Date('2025-01-30T03:00:00Z'));
    expect(sameDay.quarters[0]).toMatchObject({ year: 2024, quarter: 3 });
    const nextDay = normalizeVciStatements(sections(periods), new Date('2025-01-31T03:00:00Z'));
    expect(nextDay.quarters[0]).toMatchObject({ year: 2024, quarter: 4 });
    expect(nextDay.years[0]!.year).toBe(2023);
  });

  it('detects bank / securities / insurance templates', () => {
    expect(normalizeVciStatements(sections(periods, { isb25: 5 }), asOf).financial).toBe(true);
    expect(normalizeVciStatements(sections(periods, { iss1: 7 }), asOf).financial).toBe(true);
    expect(normalizeVciStatements(sections(periods, { isi3: 0 }), asOf).financial).toBe(false);
  });
});

describe('evaluateScreenerMetric', () => {
  const statements = normalizeVciStatements(sections(periods), asOf);

  it('TTM growth uses four discrete quarters vs the prior four', () => {
    const result = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'ttm');
    expect(result).toMatchObject({
      status: 'ok',
      unit: 'ratio',
      actual_period_label: 'TTM Q4/2024',
    });
    expect(result.value).toBeCloseTo(0.2, 12);
    expect(result.published_at).toBe('2025-01-30');
    expect(result.available_at).toBe('2025-01-31T00:00:00+07:00');
    expect(result.source_revision).toBe('VCI:2025-01-30T10:00:00');
  });

  it('quarter growth compares with the same quarter one year earlier', () => {
    const result = evaluateScreenerMetric('profit_yoy', statements, noMarket, 'quarter');
    expect(result).toMatchObject({ status: 'ok', actual_period_label: 'Q4/2024' });
    expect(result.value).toBeCloseTo(0.2, 12);
  });

  it('annual growth compares fiscal years', () => {
    const result = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'year');
    expect(result).toMatchObject({ status: 'ok', actual_period_label: 'FY2024' });
    expect(result.value).toBeCloseTo(0.2, 12);
  });

  it('ROE divides parent profit by the average of both-end parent equity', () => {
    // equity − NCI: Q4/2024 620, Q4/2023 580 → avg 600; TTM profit 120.
    const result = evaluateScreenerMetric('roe', statements, noMarket, 'ttm');
    expect(result.value).toBeCloseTo(0.2, 12);
  });

  it('interest coverage reconciles EBIT = PBT + interest expense', () => {
    // TTM PBT 160 + interest 40 = 200 over 40.
    expect(
      evaluateScreenerMetric('interest_coverage', statements, noMarket, 'ttm').value,
    ).toBeCloseTo(5, 12);
  });

  it('margins and balance ratios', () => {
    expect(evaluateScreenerMetric('gross_margin', statements, noMarket, 'ttm').value).toBeCloseTo(
      0.3,
      12,
    );
    expect(evaluateScreenerMetric('current_ratio', statements, noMarket, 'ttm')).toMatchObject({
      value: 1.5,
      actual_period_label: 'Q4/2024',
    });
    expect(evaluateScreenerMetric('debt_equity', statements, noMarket, 'ttm').value).toBeCloseTo(
      300 / 650,
      12,
    );
    // FCF TTM = (30+10)·4 − 15·4 = 100 over revenue 1200.
    expect(evaluateScreenerMetric('fcf_margin', statements, noMarket, 'ttm').value).toBeCloseTo(
      100 / 1200,
      12,
    );
  });

  it('valuation needs an observed price and share count; never fabricates either', () => {
    expect(evaluateScreenerMetric('pe', statements, noMarket, 'ttm')).toMatchObject({
      status: 'missing',
      value: null,
    });
    expect(
      evaluateScreenerMetric('pe', statements, { price: 10, shares: null }, 'ttm').status,
    ).toBe('missing');
    const market = { price: 10, shares: 120 };
    expect(evaluateScreenerMetric('pe', statements, market, 'ttm').value).toBeCloseTo(10, 12);
    expect(evaluateScreenerMetric('ps', statements, market, 'ttm').value).toBeCloseTo(1, 12);
    expect(evaluateScreenerMetric('pb', statements, market, 'ttm').value).toBeCloseTo(
      1200 / 620,
      12,
    );
    // Buyback 2·4 − issuance 0 over cap 1200.
    expect(evaluateScreenerMetric('buyback_yield', statements, market, 'ttm').value).toBeCloseTo(
      8 / 1200,
      12,
    );
    // EV = 1200 + 0 + 300 + 30 − 80 = 1450; EBITDA = 160 + 40 + 20 = 220.
    expect(evaluateScreenerMetric('ev_ebitda', statements, market, 'ttm').value).toBeCloseTo(
      1450 / 220,
      12,
    );
  });

  it('3-year metrics use four fiscal year points; non-positive points are insufficient_base', () => {
    const cagr = evaluateScreenerMetric('revenue_cagr3', statements, noMarket, 'ttm');
    expect(cagr).toMatchObject({ status: 'ok', actual_period_label: 'FY2021–FY2024' });
    expect(cagr.value).toBeCloseTo((1200 / 800) ** (1 / 3) - 1, 12);
    expect(evaluateScreenerMetric('profit_cagr3', statements, noMarket, 'ttm')).toMatchObject({
      status: 'insufficient_base',
      value: null,
    });
  });

  it('streaks walk fiscal years back and stop at the first non-positive year', () => {
    expect(
      evaluateScreenerMetric('profit_positive_streak', statements, noMarket, 'ttm'),
    ).toMatchObject({
      status: 'ok',
      value: 3,
    });
    const fcf = evaluateScreenerMetric('fcf_positive_streak', statements, noMarket, 'ttm');
    // FCF FY2021 = 50 − 60 < 0.
    expect(fcf).toMatchObject({ status: 'ok', value: 3 });
    expect(fcf.lower_bound).toBeUndefined();
  });

  it('net margin stability is the population SD of three fiscal-year margins', () => {
    const margins = [80 / 900, 100 / 1000, 120 / 1200];
    const mean = margins.reduce((s, x) => s + x, 0) / 3;
    const sd = Math.sqrt(margins.reduce((s, x) => s + (x - mean) ** 2, 0) / 3);
    expect(
      evaluateScreenerMetric('net_margin_stability', statements, noMarket, 'ttm').value,
    ).toBeCloseTo(sd, 12);
  });

  it('missing history yields missing, not 0', () => {
    const short = normalizeVciStatements(
      sections(periods.filter((p) => !(p.year === 2023 && p.length !== 5))),
      asOf,
    );
    expect(evaluateScreenerMetric('revenue_yoy', short, noMarket, 'ttm')).toMatchObject({
      status: 'missing',
      value: null,
    });
    expect(evaluateScreenerMetric('roe', short, noMarket, 'ttm').status).toBe('missing');
  });

  it('non-financial metrics are not_applicable for bank templates', () => {
    const bank = normalizeVciStatements(sections(periods, { isb25: 5 }), asOf);
    expect(evaluateScreenerMetric('gross_margin', bank, noMarket, 'ttm')).toMatchObject({
      status: 'not_applicable',
      value: null,
    });
    expect(evaluateScreenerMetric('roe', bank, noMarket, 'ttm').status).toBe('ok');
  });

  it('metrics without data or definition report data_unavailable / definition_pending', () => {
    const dividend = evaluateScreenerMetric(
      'dividend_yield',
      statements,
      { price: 10, shares: 120 },
      'ttm',
    );
    expect(dividend).toMatchObject({
      status: 'data_unavailable',
      value: null,
      unit: 'ratio',
      reason_code: 'data_unavailable',
    });
    expect(dividend.reason).toContain('cổ tức');
    expect(evaluateScreenerMetric('roic', statements, noMarket, 'ttm')).toMatchObject({
      status: 'definition_pending',
      value: null,
    });
    // EPS growth needs split-adjusted EPS, which the source does not provide.
    expect(evaluateScreenerMetric('eps_yoy', statements, noMarket, 'quarter').status).toBe(
      'data_unavailable',
    );
  });
});

describe('period handling and provenance (Strategy spec §7.4-§7.5, §10.3)', () => {
  const statements = normalizeVciStatements(sections(periods), asOf);

  it('every cell echoes the requested period and the exact reports it used', () => {
    const quarter = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'quarter');
    expect(quarter).toMatchObject({
      metric_id: 'revenue_yoy',
      period_mode: 'quarter',
      actual_period_label: 'Q4/2024',
      comparison_period_label: 'Q4/2023',
      published_at: '2025-01-30',
    });
    expect(quarter.components.map((item) => item.label)).toEqual(['Q4/2024', 'Q4/2023']);
    const ttm = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'ttm');
    expect(ttm.period_mode).toBe('ttm');
    expect(ttm.comparison_period_label).toBe('TTM Q4/2023');
    expect(ttm.components).toHaveLength(8);
    const year = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'year');
    expect(year.comparison_period_label).toBe('FY2023');
    expect(year.components.map((item) => item.label)).toEqual(['FY2024', 'FY2023']);
    expect(year.source_revision).toMatch(/^VCI:/);
  });

  it('changing one metric period changes only its figures (F04)', () => {
    const profitQuarter = evaluateScreenerMetric('profit_yoy', statements, noMarket, 'quarter');
    const profitYear = evaluateScreenerMetric('profit_yoy', statements, noMarket, 'year');
    const roeTtm = evaluateScreenerMetric('roe', statements, noMarket, 'ttm');
    expect(profitQuarter.actual_period_label).toBe('Q4/2024');
    expect(profitYear.actual_period_label).toBe('FY2024');
    expect(profitYear.value).toBeCloseTo(0.2, 12);
    expect(roeTtm.actual_period_label).toBe('TTM Q4/2024');
    expect(evaluateScreenerMetric('roe', statements, noMarket, 'ttm')).toEqual(roeTtm);
  });

  it('F05 quarter YoY compares the same quarter, not the previous quarter', () => {
    const fixture = [
      quarter(2023, 1, 100, 100, 600),
      quarter(2023, 2, 100, 100, 600),
      quarter(2023, 3, 100, 100, 600),
      quarter(2023, 4, 100, 100, 600),
      quarter(2024, 1, 100, 100, 600),
      quarter(2024, 2, 100, 100, 600),
      quarter(2024, 3, 125, 125, 600),
      quarter(2024, 4, 150, 150, 600),
    ];
    // Prior quarter Q3/2024 = 125 would give +20%; same quarter Q4/2023 = 100 gives +50%.
    const result = evaluateScreenerMetric(
      'revenue_yoy',
      normalizeVciStatements(sections(fixture), asOf),
      noMarket,
      'quarter',
    );
    expect(result.value).toBeCloseTo(0.5, 12);
  });

  it('F06 four-quarter YoY compares against the four quarters a year earlier', () => {
    const fixture = [
      ...[1, 2, 3, 4].map((q) => quarter(2023, q, 100, 100, 600)),
      ...[1, 2, 3, 4].map((q) => quarter(2024, q, 150, 150, 600)),
    ];
    const result = evaluateScreenerMetric(
      'revenue_yoy',
      normalizeVciStatements(sections(fixture), asOf),
      noMarket,
      'ttm',
    );
    // 600 vs 400.
    expect(result.value).toBeCloseTo(0.5, 12);
  });

  it('F10 an anchor with a missing quarter is not computable and does not fall back to an older TTM', () => {
    const gap = periods.filter((p) => !(p.year === 2024 && p.length === 1));
    const result = evaluateScreenerMetric(
      'gross_margin',
      normalizeVciStatements(sections(gap), asOf),
      noMarket,
      'ttm',
    );
    expect(result).toMatchObject({
      status: 'missing',
      value: null,
      reason_code: 'no_report',
      actual_period_label: null,
    });
  });

  it('F11 gross margin TTM sums the underlying amounts, never averages the ratios', () => {
    const gross = [
      { revenue: 100, profit: 10 },
      { revenue: 200, profit: 40 },
      { revenue: 300, profit: 90 },
      { revenue: 400, profit: 160 },
    ];
    const quarters = gross.map((item, index) => {
      const spec = quarter(2024, index + 1, item.revenue, 10, 600);
      spec.income.isa5 = item.profit;
      return spec;
    });
    const result = evaluateScreenerMetric(
      'gross_margin',
      normalizeVciStatements(sections([...quarters, quarter(2023, 4, 100, 10, 600)]), asOf),
      noMarket,
      'ttm',
    );
    expect(result.value).toBeCloseTo(0.3, 12);
    expect(result.value).not.toBeCloseTo(0.25, 6);
  });

  it('F13 ROE needs the opening equity: without it nothing is substituted', () => {
    const noOpening = periods.filter((p) => !(p.year === 2023 && p.length === 4));
    const result = evaluateScreenerMetric(
      'roe',
      normalizeVciStatements(sections(noOpening), asOf),
      noMarket,
      'ttm',
    );
    expect(result.status).toBe('missing');
    expect(result.value).toBeNull();
  });

  it('F16 a non-positive base is insufficient_base, never an absolute value or infinity', () => {
    const fixture = [
      ...[1, 2, 3, 4].map((q) => quarter(2023, q, 100, q === 4 ? -10 : 10, 600)),
      ...[1, 2, 3, 4].map((q) => quarter(2024, q, 100, 30, 600)),
    ];
    const result = evaluateScreenerMetric(
      'profit_yoy',
      normalizeVciStatements(sections(fixture), asOf),
      noMarket,
      'quarter',
    );
    expect(result).toMatchObject({
      status: 'insufficient_base',
      value: null,
      reason_code: 'non_positive_base',
    });
  });

  it('F16 a negative current figure over a positive base is a valid negative growth', () => {
    const fixture = [
      ...[1, 2, 3, 4].map((q) => quarter(2023, q, 100, 40, 600)),
      ...[1, 2, 3, 4].map((q) => quarter(2024, q, 100, q === 4 ? -20 : 40, 600)),
    ];
    const result = evaluateScreenerMetric(
      'profit_yoy',
      normalizeVciStatements(sections(fixture), asOf),
      noMarket,
      'quarter',
    );
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(-1.5, 12);
  });

  it('F15 profit growth uses the parent profit, net margin the consolidated profit', () => {
    const fixture = [
      ...[1, 2, 3, 4].map((q) => {
        const spec = quarter(2023, q, 100, 10, 600);
        spec.income.isa22 = 8;
        return spec;
      }),
      ...[1, 2, 3, 4].map((q) => {
        const spec = quarter(2024, q, 100, 20, 600);
        spec.income.isa22 = 12;
        return spec;
      }),
    ];
    const normalized = normalizeVciStatements(sections(fixture), asOf);
    expect(evaluateScreenerMetric('profit_yoy', normalized, noMarket, 'quarter').value).toBeCloseTo(
      12 / 8 - 1,
      12,
    );
    expect(evaluateScreenerMetric('net_margin', normalized, noMarket, 'ttm').value).toBeCloseTo(
      80 / 400,
      12,
    );
  });

  it('F07 the fiscal year is the latest reported full year, whatever the calendar says', () => {
    // Only FY2023 and FY2024 were reported; the calendar is already 2026.
    const late = new Date('2026-02-01T03:00:00Z');
    const result = evaluateScreenerMetric(
      'revenue_yoy',
      normalizeVciStatements(sections(periods), late),
      noMarket,
      'year',
    );
    expect(result.actual_period_label).toBe('FY2024');
  });

  it('F08 a report is unavailable until the day after publication', () => {
    const cutoffBefore = new Date('2025-01-30T03:00:00Z');
    const early = evaluateScreenerMetric(
      'revenue_yoy',
      normalizeVciStatements(sections(periods), cutoffBefore),
      noMarket,
      'quarter',
    );
    // Q4/2024 was published on 2025-01-30: at that day's cutoff the latest is Q3/2024.
    expect(early.actual_period_label).toBe('Q3/2024');
    expect(early.published_at).toBe('2024-10-20');
  });

  it('F09 companies keep their own latest period', () => {
    const q3Only = periods.filter((p) => !(p.year === 2024 && p.length === 4));
    const a = evaluateScreenerMetric(
      'revenue_yoy',
      normalizeVciStatements(sections(q3Only), asOf),
      noMarket,
      'quarter',
    );
    const b = evaluateScreenerMetric('revenue_yoy', statements, noMarket, 'quarter');
    expect([a.actual_period_label, b.actual_period_label]).toEqual(['Q3/2024', 'Q4/2024']);
  });

  it('the status enum is one documented list', () => {
    expect([...METRIC_STATUSES]).toEqual([
      'ok',
      'missing',
      'not_applicable',
      'insufficient_base',
      'definition_pending',
      'data_unavailable',
    ]);
  });
});
