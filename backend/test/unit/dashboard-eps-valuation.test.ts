import { describe, expect, it } from 'vitest';

import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import type { DashboardSettingsStore } from '../../src/modules/dashboard/dashboard.repository.js';
import type { DashboardChartPayload } from '../../src/modules/dashboard/dashboard.series.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';

type Row = Record<string, unknown>;

const BILLION = 1e9;
/** Quarters 2022Q1..2024Q4. */
const QUARTERS = [2022, 2023, 2024].flatMap((year) => [1, 2, 3, 4].map((q) => ({ year, q })));

const quarterEnd = (year: number, q: number) =>
  new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10);
const plusDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** LNST cổ đông công ty mẹ mỗi quý (đồng): 100 tỷ (2022), 120 tỷ (2023), 150 tỷ (2024). */
const npat = (year: number) => ({ 2022: 100, 2023: 120, 2024: 150 })[year as 2022]! * BILLION;

/**
 * Vốn góp (đồng): 1 tỷ cổ phiếu; thưởng 50% GDKHQ 2023-06-20 nhưng vốn chỉ tăng ở cuối Q3/2023;
 * phát hành riêng lẻ 10% (tiền thật, không điều chỉnh) ở Q4/2024.
 */
const capital = (year: number, q: number) => {
  const ord = year * 4 + q;
  if (ord >= 2024 * 4 + 4) return 1.65e13;
  if (ord >= 2023 * 4 + 3) return 1.5e13;
  return 1e13;
};

interface Options {
  bank?: boolean;
  /** Quarter whose public_date is missing (DB-04). */
  undated?: { year: number; q: number };
}

function statementRows(options: Options) {
  const income: Row[] = [];
  const balance: Row[] = [];
  const cash: Row[] = [];
  for (const { year, q } of QUARTERS) {
    const undated = options.undated?.year === year && options.undated.q === q;
    const meta = {
      year_report: year,
      length_report: q,
      public_date: undated ? null : `${plusDays(quarterEnd(year, q), 30)}T00:00:00`,
    };
    const profit = npat(year);
    income.push({
      ...meta,
      isa3: 1000 * BILLION,
      isa8: -10 * BILLION,
      isa16: profit * 1.25,
      isa19: -profit * 0.25,
      isa20: profit,
      isa22: profit,
      ...(options.bank ? { isb27: 200 * BILLION } : {}),
    });
    balance.push({
      ...meta,
      bsa2: 500 * BILLION,
      bsa5: 0,
      bsa56: 300 * BILLION,
      bsa71: 200 * BILLION,
      bsa78: 2000 * BILLION,
      bsa80: capital(year, q),
      bsa174: 0,
      bsa210: 0,
    });
    cash.push({ ...meta, cfa2: 5 * BILLION, cfa18: 200 * BILLION, cfa19: -50 * BILLION });
  }
  return {
    BALANCE_SHEET: { years: [], quarters: balance },
    INCOME_STATEMENT: { years: [], quarters: income },
    CASH_FLOW: { years: [], quarters: cash },
  };
}

const BONUS = {
  id: 'e1',
  ticker: 'AAA',
  event_code: 'ISS',
  event_title_en: 'Share Issue - Bonus Issue ratio 50.0%',
  exright_date: '2023-06-20T00:00:00',
  exercise_ratio: 0.5,
};
const PLACEMENT = {
  ...BONUS,
  id: 'e2',
  event_title_en: 'Share Issue - Private Placements',
  exercise_ratio: 0,
};

/** Adjusted close in thousand VND (VND dchart) on every quarter end and a few other days. */
const PRICE_DATES = [
  ...QUARTERS.map(({ year, q }) => quarterEnd(year, q)),
  '2023-05-02',
  '2024-01-02',
  '2024-02-01',
  '2024-08-01',
  '2024-08-20',
].sort();

function service(options: Options = {}, events: Row[] | null = [BONUS, PLACEMENT]) {
  const vci = {
    fetchFinancialRaw: async (_symbol: string, section: 'BALANCE_SHEET') => ({
      data: statementRows(options)[section],
      rawEndpoint: 'fake',
    }),
    fetchShareEvents: async () => {
      if (events === null) throw new Error('events down');
      return { data: events, rawEndpoint: 'fake' };
    },
    fetchFinancialReport: async () => ({
      data: [{ number_of_shares_mkt_cap: 1.65e9 }],
      rawEndpoint: 'fake',
    }),
  } as unknown as VciMarketProvider;
  const market = {
    ohlcv: async () => ({
      data: PRICE_DATES.map((date) => ({ time: `${date}T00:00:00Z`, close: 20 })),
      meta: {
        source: 'VND',
        source_priority: 1,
        fallback_used: false,
        as_of: '',
        raw_endpoint: '',
      },
    }),
  } as unknown as MarketDataService;
  const store = {
    find: async () => null,
    save: async () => null,
  } as unknown as DashboardSettingsStore;
  return new DashboardService(vci, market, store);
}

const chart = (response: { charts: Record<string, unknown> }, name: string) =>
  response.charts[name] as DashboardChartPayload;

/** Adjusted EPS (đồng/CP): every period on the 1.5bn-share basis, 1.65bn after the placement. */
const EPS = { 2022: 100 / 1.5, 2023: 80, 2024: 100 };

describe('Dashboard EPS charts on split/bonus-adjusted shares (DB-01)', () => {
  it('EPS growth compares the same share basis across the bonus issue (no fake −33% jump)', async () => {
    const response = await service().fundamental('AAA', { charts: 'Tăng trưởng EPS', per: 'q' });
    const eps = chart(response, 'Tăng trưởng EPS');
    expect(eps.status).toBe('ok');
    const labels = eps.q!.labels;
    const growth = eps.q!.main[0]!.v;
    const at = (label: string) => growth[labels.indexOf(label)];
    // Profit +20% in 2023: raw EPS would read 120/1.5 vs 100/1.0 = −20% after the bonus.
    expect(at('Q3/23')).toBeCloseTo(20, 6);
    expect(at('Q2/23')).toBeCloseTo(20, 6);
    expect(at('Q1/24')).toBeCloseTo(25, 6);
    expect(at('Q1/22')).toBeNull();
    // Bars in đồng/CP, not tỷ đồng.
    expect(eps.q!.sub!.unit).toBe('đồng/CP');
    const [current, previous] = eps.q!.sub!.series;
    expect(current!.v[labels.indexOf('Q2/23')]).toBeCloseTo(EPS[2023], 6);
    expect(previous!.v[labels.indexOf('Q2/23')]).toBeCloseTo(EPS[2022], 6);
    // Year mode: FY2023 EPS = 4 × 80 against FY2022 = 4 × 66.67.
    expect(eps.y!.main[0]!.v[eps.y!.labels.indexOf('2023')]).toBeCloseTo(20, 6);
  });

  it('EPS CAGR 3Y and EPS Stability use the adjusted annual EPS', async () => {
    const response = await service().fundamental('AAA', {
      charts: 'EPS CAGR 3Y,EPS Stability',
      per: 'q',
    });
    const cagr = chart(response, 'EPS CAGR 3Y');
    expect(cagr.status).toBe('ok');
    expect(cagr.labels).toEqual(['2022', '2023', '2024']);
    expect(cagr.mainUnit).toBe('đồng/CP');
    expect(cagr.main![0]!.v[0]).toBeCloseTo(4 * EPS[2022], 6);
    expect(cagr.main![0]!.v[1]).toBeCloseTo(4 * EPS[2023], 6);
    // Only three fiscal years: CAGR 3Y needs four year points, so the hero stays empty.
    expect(cagr.hero).toBeNull();
    const stability = chart(response, 'EPS Stability');
    expect(stability.main![0]!.v.filter((item) => item !== null)).toHaveLength(3);
  });

  it('ROIC = NOPAT 4 quý / average (equity + debt − cash) with the effective tax rate', async () => {
    const response = await service().fundamental('AAA', { charts: 'ROIC', per: 'q' });
    const roic = chart(response, 'ROIC');
    expect(roic.status).toBe('ok');
    const labels = roic.q!.labels;
    // 2024: EBIT 4 × (187.5 + 10) = 790 tỷ, tax 20% → NOPAT 632 tỷ; IC 2000 + 500 − 500 = 2000 tỷ.
    expect(roic.q!.main[0]!.v[labels.indexOf('Q4/24')]).toBeCloseTo(31.6, 6);
    expect(roic.q!.sub!.series[0]!.v[labels.indexOf('Q4/24')]).toBeCloseTo(632, 6);
    expect(roic.y!.main[0]!.v[roic.y!.labels.indexOf('2024')]).toBeCloseTo(31.6, 6);
  });

  it('PEG = P/E at the last session of the quarter / EPS growth 4 quý', async () => {
    const response = await service().fundamental('AAA', { charts: 'PEG', per: 'q' });
    const peg = chart(response, 'PEG');
    expect(peg.status).toBe('ok');
    const labels = peg.q!.labels;
    const v = peg.q!.main[0]!.v;
    // Q3/24: EPS TTM 80 + 3 × 100 = 380 vs 66.67 + 3 × 80; price 20.000đ (dchart 20 × 1000).
    const growth = (380 / (EPS[2022] + 240) - 1) * 100;
    expect(v[labels.indexOf('Q3/24')]).toBeCloseTo(20_000 / 380 / growth, 6);
    // The four quarters of 2022 have no comparison window: empty, never 0.
    expect(v[labels.indexOf('Q4/22')]).toBeNull();
    expect(peg.ref).toBe(1);
  });

  it('the bank template still gets the EPS charts and PEG, ROIC stays not applicable', async () => {
    const response = await service({ bank: true }).fundamental('BBB', {
      charts: 'Tăng trưởng EPS,PEG,ROIC,ROIC Stability',
      per: 'q',
    });
    expect(response.is_bank).toBe(true);
    expect(chart(response, 'Tăng trưởng EPS').status).toBe('ok');
    expect(chart(response, 'PEG').status).toBe('ok');
    expect(response.charts.ROIC).toEqual({ name: 'ROIC', na: 1 });
    expect(response.charts['ROIC Stability']).toEqual({ name: 'ROIC Stability', na: 1 });
  });

  it('Net Debt / EBITDA carries the definition note of its cash (DB-06)', async () => {
    const response = await service().fundamental('AAA', {
      charts: 'Net Debt / EBITDA,ROE',
      per: 'q',
    });
    expect(chart(response, 'Net Debt / EBITDA').legend_note).toBe(
      'Tiền gồm đầu tư tài chính ngắn hạn',
    );
    expect(chart(response, 'ROE').legend_note).toBeUndefined();
  });
});

describe('Dashboard daily valuation on point-in-time shares (DB-03, DB-04)', () => {
  const valueOn = (
    response: { dates: string[]; charts: Record<string, unknown> },
    name: string,
    date: string,
  ) => (response.charts[name] as { v: (number | null)[] }).v[response.dates.indexOf(date)];

  it('P/E = adjusted price / adjusted EPS 4 quý of the latest published quarter', async () => {
    const response = await service().valuation('AAA', { from: '2016-01-01' });
    // 2024-01-02: Q3/2023 is the latest published (Q4/2023 is published 2024-01-30).
    expect(valueOn(response, 'P/E', '2024-01-02')).toBeCloseTo(20_000 / (EPS[2022] + 240), 6);
    // 2024-02-01: Q4/2023 became usable — a later date moves to the newer quarter.
    expect(valueOn(response, 'P/E', '2024-02-01')).toBeCloseTo(20_000 / 320, 6);
  });

  it('market cap = adjusted price × adjusted shares on that date, not today’s share count', async () => {
    const response = await service().valuation('AAA', { from: '2016-01-01' });
    // Before the bonus registration: raw 1bn shares, adjusted 1.5bn; equity 2000 tỷ.
    expect(valueOn(response, 'P/B', '2023-05-02')).toBeCloseTo((20_000 * 1.5e9) / 2e12, 6);
    // Today's count (1.65bn, after the placement) would give 16.5 — the old bug.
    expect(valueOn(response, 'P/B', '2023-05-02')).not.toBeCloseTo(16.5, 3);
  });

  it('an undated quarter is used from quarter end + 45 days, never earlier (DB-04)', async () => {
    const response = await service({ undated: { year: 2024, q: 2 } }).valuation('AAA', {
      from: '2016-01-01',
    });
    // Q2/2024 has no public_date: usable from 2024-08-15. On 2024-08-01 Q1/2024 still applies.
    expect(valueOn(response, 'P/E', '2024-08-01')).toBeCloseTo(20_000 / (3 * 80 + 100), 6);
    expect(valueOn(response, 'P/E', '2024-08-20')).toBeCloseTo(20_000 / (2 * 80 + 200), 6);
  });

  it('falls back to the current share count when the share events are unavailable', async () => {
    const response = await service({}, null).valuation('AAA', { from: '2016-01-01' });
    expect(valueOn(response, 'P/B', '2023-05-02')).toBeCloseTo((20_000 * 1.65e9) / 2e12, 6);
  });
});
