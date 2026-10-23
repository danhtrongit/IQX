import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { calculateMetric } from '../../src/modules/screener/screener.metrics.js';
import {
  adjustedQuarterShares,
  periodEnd,
  rawShares,
  sharesAt,
  shareEventsFromVci,
  withShareHistory,
  type ShareEvent,
} from '../../src/modules/screener/screener.shares.js';
import {
  assumedPublication,
  effectiveTaxRate,
  evaluateScreenerMetric,
  investedCapitalOf,
  normalizeVciStatements,
  nopatOf,
  type NormalizedStatements,
  type StatementPeriod,
} from '../../src/modules/screener/screener.statements.js';

type Row = Record<string, unknown>;

/** Real VCI rows (HPG, FPT 2021-2025 quarters + ISS events), captured 2026-10-23. */
const FIXTURE = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../fixtures/dashboard/vci-share-history.json'),
    'utf8',
  ),
) as {
  symbols: Record<string, { BALANCE_SHEET: Row[]; INCOME_STATEMENT: Row[]; events: Row[] }>;
};

const AS_OF = new Date('2026-10-23T03:00:00Z');

function real(symbol: string): { statements: NormalizedStatements; events: ShareEvent[] } {
  const data = FIXTURE.symbols[symbol]!;
  const statements = normalizeVciStatements(
    {
      balance_sheet: { quarters: data.BALANCE_SHEET },
      income_statement: { quarters: data.INCOME_STATEMENT },
      cash_flow: { quarters: [] },
    },
    AS_OF,
  );
  return { statements, events: shareEventsFromVci(data.events, AS_OF) };
}

const label = (p: StatementPeriod) => `${p.year}Q${p.quarter}`;

describe('share events from VCI /v1/events (ISS)', () => {
  const iss = (title: string, exDate: string | null, ratio: unknown, id = title) => ({
    id,
    event_code: 'ISS',
    event_title_en: title,
    exright_date: exDate ? `${exDate}T00:00:00` : null,
    exercise_ratio: ratio,
  });

  it('keeps bonus issues and stock dividends, drops ESOP, rights, placements and future dates', () => {
    const events = shareEventsFromVci(
      [
        iss('Share Issue - Bonus Issue ratio 15.0%', '2024-06-12', 0.15),
        iss('Share Issue - Stock dividend ratio 20.0%', '2022-06-13', 0.2),
        iss('Share Issue - ESOP ratio 0.5%', '2024-10-09', 0.00499),
        iss('Share Issue - Rights issue ratio 20.0%', '2017-06-16', 0.2),
        iss('Share Issue - Private Placements', '2018-01-15', 0),
        iss('Share Issue - Bonus Issue ratio 10.0%', '2027-01-05', 0.1),
        iss('Share Issue - Bonus Issue ratio 12.8%', null, 0.1279),
        {
          event_code: 'DIV',
          event_title_en: 'Cash dividend',
          exright_date: '2024-01-01',
          exercise_ratio: 0.1,
        },
      ],
      AS_OF,
    );
    expect(events).toEqual([
      { ex_date: '2022-06-13', ratio: 0.2 },
      { ex_date: '2024-06-12', ratio: 0.15 },
    ]);
  });

  it('drops the duplicated rows VCI sometimes returns for one issue', () => {
    const row = iss('Share Issue - Bonus Issue ratio 3.0%', '2025-08-28', 0.03);
    expect(shareEventsFromVci([row, { ...row, id: 'other' }], AS_OF)).toEqual([
      { ex_date: '2025-08-28', ratio: 0.03 },
    ]);
  });
});

describe('adjusted share history (real VCI data)', () => {
  it('HPG: shares stay flat across every stock dividend, even when the capital is registered a quarter late', () => {
    const { statements, events } = real('HPG');
    const adjusted = adjustedQuarterShares(statements.quarters, events);
    const values = adjusted.filter((item): item is number => item !== null);
    expect(values).toHaveLength(statements.quarters.length);
    const [min, max] = [Math.min(...values), Math.max(...values)];
    // 2021-2025: 35%, 30%, 10%, 20% stock dividends; raw capital moved 4.47bn → 7.68bn shares.
    expect(max / min - 1).toBeLessThan(0.0001);
    const q2of22 = statements.quarters.find((q) => q.year === 2022 && q.quarter === 2)!;
    const q3of22 = statements.quarters.find((q) => q.year === 2022 && q.quarter === 3)!;
    // Ex-date 2022-06-17, capital still 4.47bn at 30/06: the pending 30% is added back.
    expect(rawShares(q2of22)).toBeCloseTo(4_472_922_706, 0);
    expect(rawShares(q3of22)).toBeCloseTo(5_814_785_700, 0);
    const shares = withShareHistory(statements, events);
    const at = (q: StatementPeriod) => shares.quarters.find((p) => label(p) === label(q))!;
    expect(at(q2of22).values.shares! / at(q3of22).values.shares! - 1).toBeCloseTo(0, 5);
  });

  it('FPT: no fake step at the 2024-06 and 2025-07 bonus issues (only ESOP dilution remains)', () => {
    const { statements, events } = real('FPT');
    const shares = withShareHistory(statements, events);
    const chronological = [...shares.quarters].reverse();
    for (let i = 1; i < chronological.length; i += 1) {
      const step = chronological[i]!.values.shares! / chronological[i - 1]!.values.shares! - 1;
      expect(Math.abs(step), label(chronological[i]!)).toBeLessThan(0.02);
    }
  });

  it('EPS growth equals profit growth when only bonus shares were issued (no fake drop)', () => {
    const { statements, events } = real('HPG');
    const shares = withShareHistory(statements, events);
    // Q2/2023 against Q2/2022: the 30% stock dividend went ex on 2022-06-17, registered in Q3.
    const view = {
      ...shares,
      quarters: shares.quarters.filter((q) => q.year * 4 + q.quarter! <= 2023 * 4 + 2),
    };
    const eps = evaluateScreenerMetric('eps_yoy', view, { price: null, shares: null }, 'quarter');
    const profit = evaluateScreenerMetric(
      'profit_yoy',
      view,
      { price: null, shares: null },
      'quarter',
    );
    expect(eps.status).toBe('ok');
    expect(eps.actual_period_label).toBe('Q2/2023');
    // With raw shares the base quarter (4.47bn) and this one (5.81bn) differ by the 30% dividend.
    expect(eps.value!).toBeCloseTo(profit.value!, 3);
  });

  it('EPS of a quarter = parent NPAT / average adjusted shares; years sum their quarters', () => {
    const { statements, events } = real('FPT');
    const shares = withShareHistory(statements, events);
    const q = shares.quarters.find((p) => p.year === 2025 && p.quarter === 3)!;
    const previous = shares.quarters.find((p) => p.year === 2025 && p.quarter === 2)!;
    expect(q.values.eps).toBeCloseTo(
      q.values.npat_parent! / ((q.values.shares! + previous.values.shares!) / 2),
      6,
    );
  });

  it('without the event history no EPS is built (two share bases are never mixed)', () => {
    const { statements } = real('FPT');
    const unchanged = withShareHistory(statements, null);
    expect(unchanged.quarters.every((q) => q.values.eps === undefined)).toBe(true);
  });

  it('reads the adjusted share count on a date from the last quarter end before it', () => {
    const { statements, events } = real('HPG');
    const shares = withShareHistory(statements, events);
    const q1of23 = shares.quarters.find((p) => p.year === 2023 && p.quarter === 1)!;
    expect(sharesAt(shares.quarters, '2023-04-15')).toBe(q1of23.values.shares);
    expect(sharesAt(shares.quarters, '2020-01-01')).toBeNull();
    expect(periodEnd({ year: 2024, quarter: 1 })).toBe('2024-03-31');
    expect(periodEnd({ year: 2023, quarter: null })).toBe('2023-12-31');
  });
});

describe('ROIC inputs (DB-01)', () => {
  it('effective tax = tax / PBT clamped to [0; 0.5], 20% when PBT is not positive', () => {
    expect(effectiveTaxRate(25, 100)).toBeCloseTo(0.25, 12);
    expect(effectiveTaxRate(80, 100)).toBe(0.5);
    expect(effectiveTaxRate(-10, 100)).toBe(0);
    expect(effectiveTaxRate(5, -40)).toBe(0.2);
    expect(effectiveTaxRate(5, 0)).toBe(0.2);
    expect(effectiveTaxRate(null, 100)).toBeNull();
  });

  it('NOPAT = (PBT + interest) × (1 − effective tax); invested capital = equity + debt − cash', () => {
    expect(nopatOf(180, 20, 45)).toBeCloseTo(200 * 0.75, 12);
    expect(nopatOf(-50, 10, 0)).toBeCloseTo(-40 * 0.8, 12);
    expect(investedCapitalOf({ equity: 1000, st_debt: 200, lt_debt: 300, cash: 100 })).toBe(1400);
    expect(investedCapitalOf({ equity: 1000, st_debt: 200, cash: 100 })).toBeNull();
  });

  it('ROIC TTM uses the average invested capital of both ends of the window', () => {
    const quarter = (year: number, q: 1 | 2 | 3 | 4, equity: number): StatementPeriod => ({
      year,
      quarter: q,
      values: {
        pbt: 45,
        interest_expense: 5,
        income_tax: 9,
        equity,
        st_debt: 100,
        lt_debt: 100,
        cash: 200,
      },
      published_at: `${year}-12-31`,
      updated_at: null,
    });
    const quarters = [
      quarter(2024, 4, 1200),
      quarter(2024, 3, 1100),
      quarter(2024, 2, 1100),
      quarter(2024, 1, 1100),
      quarter(2023, 4, 800),
    ];
    const statements: NormalizedStatements = { years: [], quarters, financial: false };
    const roic = evaluateScreenerMetric('roic', statements, { price: null, shares: null }, 'ttm');
    // EBIT 4 × 50 = 200, tax 36 / PBT 180 = 20% → NOPAT 160; IC (1200 + 800) / 2 = 1000.
    expect(roic.status).toBe('ok');
    expect(roic.value).toBeCloseTo(0.16, 12);
    expect(
      evaluateScreenerMetric(
        'roic',
        { ...statements, financial: true },
        { price: null, shares: null },
        'ttm',
      ).status,
    ).toBe('not_applicable');
  });
});

describe('PEG and undated reports', () => {
  it('PEG is empty below 5% EPS growth (registry formula, Dashboard §10)', () => {
    expect(calculateMetric('peg', [15, 0.2]).value).toBeCloseTo(0.75, 12);
    expect(calculateMetric('peg', [15, 0.049])).toMatchObject({ status: 'insufficient_base' });
    expect(calculateMetric('peg', [-3, 0.2]).status).toBe('insufficient_base');
  });

  it('a quarter without public_date counts as published 45 days after the quarter end (DB-04)', () => {
    expect(assumedPublication(2024, 2)).toBe('2024-08-14');
    expect(assumedPublication(2024, 4)).toBe('2025-02-14');
    expect(assumedPublication(2024, null)).toBe('2025-03-31');
    const sections = {
      balance_sheet: {},
      income_statement: {
        quarters: [{ year_report: 2024, length_report: 2, isa3: 100, public_date: null }],
      },
      cash_flow: {},
    };
    expect(
      normalizeVciStatements(sections, new Date('2024-08-14T05:00:00Z')).quarters,
    ).toHaveLength(0);
    expect(
      normalizeVciStatements(sections, new Date('2024-08-15T05:00:00Z')).quarters,
    ).toHaveLength(1);
  });
});
