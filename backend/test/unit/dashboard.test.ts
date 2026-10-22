import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_DEFAULT_CHARTS,
  DASHBOARD_GROUPS,
  appliesToBank,
  dashboardChart,
} from '../../src/modules/dashboard/dashboard.catalog.js';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import type {
  DashboardSettingsStore,
  StoredDashboardSettings,
} from '../../src/modules/dashboard/dashboard.repository.js';
import {
  dashboardSettingsInputSchema,
  type DashboardSettings,
} from '../../src/modules/dashboard/dashboard.schemas.js';
import {
  pegValue,
  type DashboardChartPayload,
} from '../../src/modules/dashboard/dashboard.series.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';

/** 11 chỉ tiêu áp dụng cho mã ngân hàng (spec §7). */
const BANK_APPLICABLE = [
  'Tăng trưởng LNST',
  'Tăng trưởng EPS',
  'Net Profit CAGR 3Y',
  'EPS CAGR 3Y',
  'Profit Positive Streak',
  'EPS Stability',
  'ROE',
  'ROA',
  'P/E',
  'P/B',
  'PEG',
];

/** In-memory twin of the dashboard_settings table. */
class InMemorySettingsStore implements DashboardSettingsStore {
  readonly rows = new Map<string, StoredDashboardSettings>();

  async find(userId: string): Promise<StoredDashboardSettings | null> {
    return this.rows.get(userId) ?? null;
  }

  async save(userId: string, settings: DashboardSettings): Promise<StoredDashboardSettings> {
    const previous = this.rows.get(userId);
    const row: StoredDashboardSettings = {
      ...structuredClone(settings),
      revision: (previous?.revision ?? 0) + 1,
      updated_at: '2026-10-22T03:00:00.000Z',
    };
    this.rows.set(userId, row);
    return row;
  }
}

/**
 * Bốn quý của 2023 và 2024: doanh thu 1.000 và LNST 100 mỗi quý của 2024 (tăng 25% và 25%),
 * năm 2021-2024 cho các chỉ tiêu theo năm. `bank` bật mẫu báo cáo của ngân hàng (isb*).
 */
function statementRows(bank: boolean) {
  const quarters: Record<'income' | 'cash' | 'balance', Row[]> = {
    income: [],
    cash: [],
    balance: [],
  };
  const years: Record<'income' | 'cash' | 'balance', Row[]> = { income: [], cash: [], balance: [] };
  for (const year of [2023, 2024]) {
    for (const quarter of [1, 2, 3, 4]) {
      const meta = {
        year_report: year,
        length_report: quarter,
        public_date: `${year}-${String(quarter * 3).padStart(2, '0')}-28T00:00:00`,
      };
      const revenue = year === 2024 ? 1000 : 800;
      quarters.income.push({
        ...meta,
        isa3: revenue,
        isa4: -revenue * 0.6,
        isa5: revenue * 0.4,
        isa8: -10,
        isa16: 120,
        isa20: 100,
        isa22: 100,
        ...(bank ? { isb27: 200, isb38: 400 } : {}),
      });
      quarters.cash.push({ ...meta, cfa2: 5, cfa18: 90, cfa19: -20 });
      quarters.balance.push({
        ...meta,
        bsa1: 300,
        bsa2: 60,
        bsa5: 10,
        bsa9: 120,
        bsa15: 80,
        bsa53: 1000,
        bsa55: 200,
        bsa56: 50,
        bsa57: 70,
        bsa71: 50,
        bsa78: 400,
      });
    }
  }
  for (const year of [2021, 2022, 2023, 2024]) {
    const meta = { year_report: year, length_report: 5, public_date: `${year + 1}-03-01T00:00:00` };
    years.income.push({ ...meta, isa3: 100 * (year - 2019), isa22: 10 });
    years.cash.push({ ...meta, cfa18: 90, cfa19: -20 });
    years.balance.push({ ...meta, bsa78: 400 });
  }
  return {
    BALANCE_SHEET: { years: years.balance, quarters: quarters.balance },
    INCOME_STATEMENT: { years: years.income, quarters: quarters.income },
    CASH_FLOW: { years: years.cash, quarters: quarters.cash },
  };
}

function fakeVci(bank: boolean) {
  return {
    fetchFinancialRaw: async (
      _symbol: string,
      section: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW',
    ) => ({ data: statementRows(bank)[section], rawEndpoint: 'fake' }),
    fetchFinancialReport: async () => ({
      data: [{ number_of_shares_mkt_cap: 1000 }],
      rawEndpoint: 'fake',
    }),
  } as unknown as VciMarketProvider;
}

function fakeMarket() {
  return {
    ohlcv: async () => ({
      data: [
        { time: '2024-01-02T00:00:00Z', close: 90 },
        { time: '2024-01-03T00:00:00Z', close: 91 },
      ],
      meta: {
        source: 'fake',
        source_priority: 1,
        fallback_used: false,
        as_of: '2024-01-03T00:00:00Z',
        raw_endpoint: 'fake',
      },
    }),
  } as unknown as MarketDataService;
}

/** Một biểu đồ có dữ liệu (không phải cờ "không áp dụng"). */
function chartOf(
  response: { charts: Record<string, unknown> },
  name: string,
): DashboardChartPayload {
  return response.charts[name] as DashboardChartPayload;
}

function service(bank = false, store = new InMemorySettingsStore()) {
  return {
    store,
    service: new DashboardService(fakeVci(bank), fakeMarket(), store),
  };
}

describe('dashboard catalog (33 chỉ tiêu, 6 nhóm, 11 chỉ tiêu ngân hàng)', () => {
  it('has 33 charts in 6 groups, in the order of the spec', () => {
    expect(DASHBOARD_CHARTS).toHaveLength(33);
    expect(DASHBOARD_CHART_NAMES).toHaveLength(33);
    expect(new Set(DASHBOARD_CHART_NAMES).size).toBe(33);
    expect(DASHBOARD_GROUPS.map((group) => group.group)).toEqual([
      'Tốc độ tăng trưởng',
      'Độ ổn định',
      'Hiệu quả và biên lợi nhuận',
      'Nợ và khả năng thanh toán',
      'Dòng tiền',
      'Định giá',
    ]);
    expect(DASHBOARD_GROUPS.flatMap((group) => group.items)).toHaveLength(33);
  });

  it('marks exactly the 11 bank-applicable indicators of the spec', () => {
    const applicable = DASHBOARD_CHARTS.filter((chart) => appliesToBank(chart.metric_id)).map(
      (chart) => chart.name,
    );
    expect(applicable.sort()).toEqual([...BANK_APPLICABLE].sort());
    expect(applicable).toHaveLength(11);
    expect(DASHBOARD_CHARTS.length - applicable.length).toBe(22);
  });

  it('exposes the catalogue with the bank flag', () => {
    const catalog = service().service.catalog();
    expect(catalog).toHaveLength(6);
    expect(catalog.flatMap((group) => group.items)).toHaveLength(33);
    const flagged = catalog.flatMap((group) => group.items).filter((item) => item.na_for_bank);
    expect(flagged).toHaveLength(22);
    expect(catalog.flatMap((group) => group.items).find((item) => item.name === 'ROE')).toEqual({
      name: 'ROE',
      na_for_bank: false,
    });
  });

  it('uses the six chart shapes of the spec', () => {
    const kinds = new Set(DASHBOARD_CHARTS.map((chart) => chart.kind));
    expect([...kinds].sort()).toEqual(['A', 'B', 'C', 'D', 'E1', 'E2', 'F', 'F2']);
  });
});

describe('dashboard settings (theo tài khoản, trên server)', () => {
  it('returns the default dashboard when the account never saved anything', async () => {
    const { service: dashboard } = service();
    expect(await dashboard.settings(USER)).toEqual({
      charts: [...DASHBOARD_DEFAULT_CHARTS],
      per: 'q',
      nks: {},
    });
    expect(DASHBOARD_DEFAULT_CHARTS).toHaveLength(6);
  });

  it('saves the settings and reads them back', async () => {
    const { service: dashboard, store } = service();
    const input = dashboardSettingsInputSchema.parse({
      charts: ['ROE', 'P/E'],
      per: 'y',
      nks: { ROE: { q: 20, y: 5 } },
    });
    const saved = await dashboard.saveSettings(USER, input);
    expect(saved.charts).toEqual(['ROE', 'P/E']);
    expect(saved.per).toBe('y');
    expect(saved.nks).toEqual({ ROE: { q: 20, y: 5 } });
    expect(saved.revision).toBe(1);
    expect(saved.updated_at).toBe('2026-10-22T03:00:00.000Z');
    expect(await dashboard.settings(USER)).toEqual({
      charts: ['ROE', 'P/E'],
      per: 'y',
      nks: { ROE: { q: 20, y: 5 } },
    });
    await dashboard.saveSettings(USER, input);
    expect(store.rows.get(USER)?.revision).toBe(2);
  });

  it('rejects a chart outside the catalogue and a period outside the allowed ones', () => {
    const base = { charts: ['ROE'], per: 'q', nks: {} };
    expect(dashboardSettingsInputSchema.safeParse(base).success).toBe(true);
    expect(dashboardSettingsInputSchema.safeParse({ ...base, charts: ['RSI'] }).success).toBe(false);
    expect(dashboardSettingsInputSchema.safeParse({ ...base, per: 'm' }).success).toBe(false);
    expect(
      dashboardSettingsInputSchema.safeParse({ ...base, nks: { ROE: { q: 7 } } }).success,
    ).toBe(false);
    expect(
      dashboardSettingsInputSchema.safeParse({ ...base, nks: { RSI: { q: 5 } } }).success,
    ).toBe(false);
    expect(
      dashboardSettingsInputSchema.safeParse({ ...base, charts: ['ROE', 'ROE'] }).success,
    ).toBe(false);
  });
});

describe('dashboard charts (khuôn dữ liệu theo spec §8–§11)', () => {
  it('gives A/B/C charts a quarter block, a year block and the bars below the line', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', {
      charts: 'Tăng trưởng doanh thu,ROE,Cash Conversion Cycle',
      per: 'q',
    });
    expect(response.symbol).toBe('FPT');
    expect(response.is_bank).toBe(false);
    const growth = chartOf(response, 'Tăng trưởng doanh thu');
    expect(growth.kind).toBe('A');
    expect(growth.unit).toBe('%');
    expect(growth.q?.labels.length).toBeGreaterThan(0);
    expect(growth.y?.labels.length).toBeGreaterThan(0);
    expect(growth.q?.main[0]?.name).toBe('Tăng trưởng so với cùng kỳ');
    expect(growth.y?.main[0]?.name).toBe('Tăng trưởng so với năm trước');
    expect(growth.q?.sub?.unit).toBe('tỷ đồng');
    expect(growth.q?.sub?.type).toBe('grouped');
    expect(growth.q?.sub?.series.map((item) => item.name)).toEqual([
      'Quý này',
      'Cùng kỳ năm trước',
    ]);
    const roe = chartOf(response, 'ROE');
    expect(roe.kind).toBe('B');
    expect(roe.q?.sub?.series[0]?.name).toBe('LNST 4 quý');
    const ccc = chartOf(response, 'Cash Conversion Cycle');
    expect(ccc.kind).toBe('C');
    expect(ccc.unit).toBe('ngày');
    expect(ccc.q?.sub?.unit).toBe('ngày');
    expect(ccc.q?.sub?.series).toHaveLength(3);
    // The line is the sum of the three bars: the registry formula DIO + DSO − DPO.
    const [dio, dso, dpo] = ccc.y?.sub?.series ?? [];
    const days = dio?.v.map((item, index) =>
      item === null || dso?.v[index] === null || dpo?.v[index] === null
        ? null
        : item + (dso?.v[index] ?? 0) - (dpo?.v[index] ?? 0),
    );
    expect(days).toEqual(ccc.y?.main[0]?.v);
  });

  it('gives D/E1/E2 charts the year-fixed shape and no period box', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', {
      charts: 'Revenue CAGR 3Y,Revenue Growth Stability,Profit Positive Streak',
      per: 'q',
    });
    const cagr = chartOf(response, 'Revenue CAGR 3Y');
    expect(cagr.kind).toBe('D');
    expect(cagr.labels).toHaveLength(2);
    expect(cagr.mainUnit).toBe('tỷ đồng');
    expect(cagr.main?.[0]?.name).toBe('Doanh thu');
    expect(cagr.hero).not.toBeUndefined();
    expect(cagr.q).toBeUndefined();
    expect(cagr.y).toBeUndefined();
    const stability = chartOf(response, 'Revenue Growth Stability');
    expect(stability.kind).toBe('E1');
    expect(stability.unit).toBe('điểm %');
    expect(stability.mainUnit).toBe('%');
    const streak = chartOf(response, 'Profit Positive Streak');
    expect(streak.kind).toBe('E2');
    expect(streak.unit).toBe('năm');
    expect(streak.main?.[0]?.name).toBe('LNST năm');
  });

  it('gives the F2 chart the PEG reference line', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', { charts: 'PEG', per: 'q' });
    const peg = chartOf(response, 'PEG');
    expect(peg.kind).toBe('F2');
    expect(peg.ref).toBe(1);
    expect(peg.q?.main[0]?.name).toBe('PEG cuối quý');
    expect(peg.y?.main[0]?.name).toBe('PEG cuối năm');
  });

  it('gives the daily valuation series the shared dates and the values of each chart', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.valuation('FPT', { from: '2024-01-01' });
    expect(response.symbol).toBe('FPT');
    expect(response.dates).toEqual(['2024-01-02', '2024-01-03']);
    const pe = response.charts['P/E'] as { name: string; kind: string; unit: string; v: (number | null)[] };
    expect(pe.kind).toBe('F');
    expect(pe.unit).toBe('lần');
    expect(pe.v).toHaveLength(response.dates.length);
    expect(pe.v[0]).toBeTypeOf('number');
  });

  it('marks the 22 indicators a bank does not have and keeps the 11 others', async () => {
    const { service: dashboard } = service(true);
    const response = await dashboard.fundamental('VCB', { per: 'q' });
    expect(response.is_bank).toBe(true);
    const charts = Object.values(response.charts);
    const notApplicable = charts.filter((chart) => 'na' in chart && chart.na === 1);
    expect(notApplicable).toHaveLength(22);
    expect(Object.keys(response.charts)).toHaveLength(33);
    expect(notApplicable.map((chart) => chart.name)).toEqual(
      expect.arrayContaining(['Tăng trưởng doanh thu', 'Biên lợi nhuận gộp', 'D/E']),
    );
    const applicable = charts.filter((chart) => !('na' in chart));
    expect(applicable).toHaveLength(11);
    expect(applicable.map((chart) => chart.name)).toEqual(
      expect.arrayContaining(BANK_APPLICABLE),
    );
  });

  it('leaves a period that cannot be computed empty instead of drawing zero', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', { charts: 'ROE', per: 'q' });
    const roe = chartOf(response, 'ROE');
    const values = roe.q?.main[0]?.v ?? [];
    expect(values.length).toBeGreaterThan(0);
    // The first quarters have no balance one year back: they stay empty, never 0.
    expect(values[0]).toBeNull();
    expect(values.some((item) => item === null)).toBe(true);
    expect(values.filter((item) => item === 0)).toHaveLength(0);
  });

  it('keeps the indicators without a data source empty and says why', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', {
      charts: 'Tăng trưởng EPS,ROIC,PEG',
      per: 'q',
    });
    for (const name of ['Tăng trưởng EPS', 'PEG']) {
      const chart = chartOf(response, name);
      expect(chart.status).toBe('data_unavailable');
      expect(chart.note).toBeTruthy();
      const values = chart.q?.main[0]?.v ?? [];
      expect(values.every((item) => item === null)).toBe(true);
    }
    // ROIC has no approved definition yet, so the registry marks it definition_pending.
    const roic = chartOf(response, 'ROIC');
    expect(roic.status).toBe('definition_pending');
    expect(roic.note).toBeTruthy();
    expect((roic.q?.main[0]?.v ?? []).every((item) => item === null)).toBe(true);
  });

  it('rejects an indicator outside the catalogue', async () => {
    const { service: dashboard } = service();
    await expect(dashboard.fundamental('FPT', { charts: 'RSI', per: 'q' })).rejects.toThrow();
  });
});

describe('PEG rule (spec §10)', () => {
  it('is empty when the EPS growth is below 5% or the P/E is negative', () => {
    expect(pegValue(20, 0.03)).toBeNull();
    expect(pegValue(20, 0)).toBeNull();
    expect(pegValue(20, -0.1)).toBeNull();
    expect(pegValue(-5, 0.2)).toBeNull();
    expect(pegValue(0, 0.2)).toBeNull();
    expect(pegValue(null, 0.2)).toBeNull();
    expect(pegValue(20, null)).toBeNull();
  });

  it('is P/E divided by the EPS growth in percentage points from 5% up', () => {
    expect(pegValue(20, 0.05)).toBeCloseTo(4, 10);
    expect(pegValue(20, 0.1)).toBeCloseTo(2, 10);
  });
});

describe('dashboard catalogue helpers', () => {
  it('finds a chart by its display name', () => {
    expect(dashboardChart('ROE')?.metric_id).toBe('roe');
    expect(dashboardChart('RSI')).toBeNull();
  });
});
