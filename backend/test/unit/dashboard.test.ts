import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_DEFAULT_CHARTS,
  DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY,
  DASHBOARD_INDUSTRY_CHAPTERS,
  DASHBOARD_INDUSTRY_CHARTS,
  NATIVE_METRIC_IDS,
  chartInIndustry,
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
import { INDUSTRIES, type Industry } from '../../src/modules/financials/financials.industry.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';

type Row = Record<string, unknown>;

const USER = '00000000-0000-4000-8000-000000000001';

/** In-memory twin of the dashboard_settings table: one row per (account, industry). */
class InMemorySettingsStore implements DashboardSettingsStore {
  readonly rows = new Map<string, StoredDashboardSettings>();

  async findAll(userId: string): Promise<Partial<Record<Industry, StoredDashboardSettings>>> {
    const result: Partial<Record<Industry, StoredDashboardSettings>> = {};
    for (const industry of INDUSTRIES) {
      const row = this.rows.get(`${userId}:${industry}`);
      if (row) result[industry] = row;
    }
    return result;
  }

  async save(
    userId: string,
    industry: Industry,
    settings: DashboardSettings,
  ): Promise<StoredDashboardSettings> {
    const key = `${userId}:${industry}`;
    const previous = this.rows.get(key);
    const row: StoredDashboardSettings = {
      ...structuredClone(settings),
      nganh: industry,
      revision: (previous?.revision ?? 0) + 1,
      updated_at: '2026-10-22T03:00:00.000Z',
    };
    this.rows.set(key, row);
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

/** Một biểu đồ có dữ liệu của response. */
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

describe('dashboard catalog (62 chỉ tiêu theo ngành)', () => {
  it('has 62 charts: 17 common + 16 manufacturing + 11 bank + 10 securities + 8 insurance', () => {
    expect(DASHBOARD_CHARTS).toHaveLength(62);
    expect(DASHBOARD_CHART_NAMES).toHaveLength(62);
    expect(new Set(DASHBOARD_CHART_NAMES).size).toBe(62);
    const byScope = (scope: string) =>
      DASHBOARD_CHARTS.filter((chart) => chart.scope === scope).length;
    expect([
      byScope('chung'),
      byScope('thuong'),
      byScope('nh'),
      byScope('ck'),
      byScope('bh'),
    ]).toEqual([17, 16, 11, 10, 8]);
  });

  it('gives each industry its common chapter plus its own: 33, 28, 27 and 25 charts', () => {
    expect(INDUSTRIES.map((industry) => DASHBOARD_INDUSTRY_CHARTS[industry].length)).toEqual([
      33, 28, 27, 25,
    ]);
    for (const industry of INDUSTRIES) {
      const chapters = DASHBOARD_INDUSTRY_CHAPTERS[industry];
      expect(chapters.map((chapter) => chapter.scope)).toEqual(['chung', industry]);
      expect(chapters[0]!.title).toBe('Phân tích cơ bản chung');
      expect(chapters.flatMap((chapter) => chapter.groups.flatMap((group) => group.items))).toEqual(
        DASHBOARD_INDUSTRY_CHARTS[industry],
      );
    }
    expect(DASHBOARD_INDUSTRY_CHAPTERS.nh.map((chapter) => chapter.academy_chapter)).toEqual([
      8, 10,
    ]);
    expect(DASHBOARD_INDUSTRY_CHAPTERS.bh.map((chapter) => chapter.title)).toEqual([
      'Phân tích cơ bản chung',
      'Bảo hiểm',
    ]);
  });

  it('keeps the 33 ids of v1 and gives every chart a stable metric key equal to its id', () => {
    const keys = DASHBOARD_CHARTS.map((chart) => chart.metric_key);
    expect(new Set(keys).size).toBe(62);
    for (const chart of DASHBOARD_CHARTS) expect(chart.metric_key).toBe(chart.metric_id);
    expect(DASHBOARD_CHARTS.filter((chart) => chart.registry_id !== null)).toHaveLength(33);
    expect(DASHBOARD_CHARTS.filter((chart) => chart.registry_id === null)).toHaveLength(29);
    expect(
      DASHBOARD_CHARTS.filter((chart) => chart.registry_id === null).map((chart) => chart.metric_id),
    ).toEqual([...NATIVE_METRIC_IDS]);
    for (const chart of DASHBOARD_CHARTS.filter((item) => item.registry_id !== null))
      expect(chart.registry_id).toBe(chart.metric_id);
  });

  it('has a valid default set of 6 charts for each industry (spec §6.3)', () => {
    for (const industry of INDUSTRIES) {
      const defaults = DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[industry];
      expect(defaults).toHaveLength(6);
      expect(new Set(defaults).size).toBe(6);
      for (const name of defaults) {
        const chart = dashboardChart(name);
        expect(chart, name).not.toBeNull();
        expect(chartInIndustry(chart!, industry), `${industry}: ${name}`).toBe(true);
      }
    }
    expect(DASHBOARD_DEFAULT_CHARTS).toEqual(DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.thuong);
    expect(DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.nh).toEqual([
      'Tăng trưởng LNST',
      'NIM',
      'CIR',
      'Chi phí tín dụng',
      'ROE',
      'P/B',
    ]);
  });

  it('exposes the catalogue per industry with chapters, groups, counts and the lesson key', () => {
    const catalog = service().service.catalog();
    expect(catalog.industries.map((industry) => [industry.nganh, industry.total])).toEqual([
      ['thuong', 33],
      ['nh', 28],
      ['ck', 27],
      ['bh', 25],
    ]);
    const bank = catalog.industries.find((industry) => industry.nganh === 'nh')!;
    expect(bank.label).toBe('Ngân hàng');
    expect(bank.default_charts).toEqual([...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.nh]);
    expect(bank.chapters.map((chapter) => [chapter.chapter, chapter.academy_chapter])).toEqual([
      ['Phân tích cơ bản chung', 8],
      ['Ngân hàng', 10],
    ]);
    const groups = bank.chapters.flatMap((chapter) => chapter.groups);
    expect(groups.map((group) => group.group)).toEqual([
      'Tăng trưởng',
      'Ổn định',
      'Hiệu quả',
      'Định giá',
      'Thu nhập và hiệu quả',
      'Rủi ro tín dụng',
      'Quy mô và vốn',
    ]);
    const items = groups.flatMap((group) => group.items);
    expect(items).toHaveLength(28);
    expect(items.find((item) => item.name === 'NIM')).toEqual({
      name: 'NIM',
      metric_key: 'nim',
      kind: 'B',
    });
    expect(items.find((item) => item.name === 'ROE')).toEqual({
      name: 'ROE',
      metric_key: 'roe',
      kind: 'B',
    });
    // Nothing of a manufacturer is offered to a bank: no gross margin, D/E, CCC, cash flow...
    const names = items.map((item) => item.name);
    for (const name of ['Biên lợi nhuận gộp', 'D/E', 'Cash Conversion Cycle', 'CFO Margin'])
      expect(names).not.toContain(name);
  });

  it('uses the chart shapes of the spec', () => {
    const kinds = new Set(DASHBOARD_CHARTS.map((chart) => chart.kind));
    expect([...kinds].sort()).toEqual(['A', 'B', 'C', 'D', 'E1', 'E2', 'F', 'F2']);
    expect(dashboardChart('Combined ratio')?.ref).toBe(100);
    expect(dashboardChart('PEG')?.ref).toBe(1);
  });
});

describe('dashboard settings (theo tài khoản và theo ngành, trên server)', () => {
  it('returns the default dashboard of every industry when the account never saved anything', async () => {
    const { service: dashboard } = service();
    const settings = await dashboard.settings(USER);
    expect(Object.keys(settings)).toEqual(['thuong', 'nh', 'ck', 'bh']);
    for (const industry of INDUSTRIES)
      expect(settings[industry]).toEqual({
        charts: [...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[industry]],
        per: 'q',
        nks: {},
      });
  });

  it('saves one industry, reads it back and leaves the other industries at their defaults', async () => {
    const { service: dashboard, store } = service();
    const input = dashboardSettingsInputSchema.parse({
      charts: ['ROE', 'NIM'],
      per: 'y',
      nks: { ROE: { q: 20, y: 5 } },
    });
    const saved = await dashboard.saveSettings(USER, 'nh', input);
    expect(saved.nganh).toBe('nh');
    expect(saved.charts).toEqual(['ROE', 'NIM']);
    expect(saved.per).toBe('y');
    expect(saved.nks).toEqual({ ROE: { q: 20, y: 5 } });
    expect(saved.revision).toBe(1);
    expect(saved.updated_at).toBe('2026-10-22T03:00:00.000Z');
    const settings = await dashboard.settings(USER);
    expect(settings.nh).toEqual({
      charts: ['ROE', 'NIM'],
      per: 'y',
      nks: { ROE: { q: 20, y: 5 } },
    });
    expect(settings.thuong.charts).toEqual([...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.thuong]);
    expect(settings.ck.charts).toEqual([...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.ck]);
    await dashboard.saveSettings(USER, 'nh', input);
    expect(store.rows.get(`${USER}:nh`)?.revision).toBe(2);
    expect(store.rows.has(`${USER}:thuong`)).toBe(false);
  });

  it('rejects a chart that is not in the industry (400) and keeps the other settings', async () => {
    const { service: dashboard } = service();
    const input = dashboardSettingsInputSchema.parse({ charts: ['ROE', 'D/E'], per: 'q', nks: {} });
    await expect(dashboard.saveSettings(USER, 'nh', input)).rejects.toThrow(BadRequestException);
    await expect(
      dashboard.saveSettings(
        USER,
        'bh',
        dashboardSettingsInputSchema.parse({ charts: ['NIM'], per: 'q', nks: {} }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      dashboard.saveSettings(
        USER,
        'thuong',
        dashboardSettingsInputSchema.parse({ charts: ['D/E'], per: 'q', nks: { 'NIM': { q: 8 } } }),
      ),
    ).rejects.toThrow(BadRequestException);
    // The same set is fine for the industry that owns it.
    await expect(dashboard.saveSettings(USER, 'thuong', input)).resolves.toMatchObject({
      charts: ['ROE', 'D/E'],
    });
  });

  it('falls back to the default set when a saved row holds charts outside its industry', async () => {
    const { service: dashboard, store } = service();
    store.rows.set(`${USER}:bh`, {
      nganh: 'bh',
      charts: ['NIM'],
      per: 'y',
      nks: {},
      revision: 3,
      updated_at: '2026-10-22T03:00:00.000Z',
    });
    expect((await dashboard.settings(USER)).bh.charts).toEqual([
      ...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.bh,
    ]);
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
    expect(response.nganh).toBe('thuong');
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
    // DB-06: the code's ROE is the parent-company definition, and the name says so.
    expect(roe.q?.main[0]?.name).toBe('ROE (4 quý, cổ đông công ty mẹ)');
    expect(roe.y?.main[0]?.name).toBe('ROE năm (cổ đông công ty mẹ)');
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
    expect(stability.main?.[0]?.name).toBe('Tăng trưởng doanh thu năm');
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
    expect(response.nganh).toBe('thuong');
    expect(response.dates).toEqual(['2024-01-02', '2024-01-03']);
    const pe = response.charts['P/E'] as { name: string; kind: string; unit: string; v: (number | null)[] };
    expect(pe.kind).toBe('F');
    expect(pe.unit).toBe('lần');
    expect(pe.v).toHaveLength(response.dates.length);
    expect(pe.v[0]).toBeTypeOf('number');
    const fcfYield = response.charts['FCF Yield'] as {
      name: string;
      kind: string;
      unit: string;
      v: (number | null)[];
    };
    expect(fcfYield.kind).toBe('F');
    expect(fcfYield.unit).toBe('%');
    // FCF TTM = 4 * (90 - 20) = 280; market cap = 90 * 1000 = 90,000 -> percentage points (* 100)
    expect(fcfYield.v[0]).toBeCloseTo((280 / 90_000) * 100, 6);
    expect(fcfYield.v[1]).toBeCloseTo((280 / 91_000) * 100, 6);
  });

  it('gives a bank only its own 28 charts: no not-applicable cards, 400 for a foreign chart', async () => {
    const { service: dashboard } = service(true);
    const response = await dashboard.fundamental('VCB', { per: 'q' });
    expect(response.nganh).toBe('nh');
    const charts = Object.values(response.charts);
    expect(charts).toHaveLength(28);
    expect(charts.some((chart) => 'na' in chart)).toBe(false);
    expect(Object.keys(response.charts)).toEqual(
      DASHBOARD_INDUSTRY_CHARTS.nh.map((chart) => chart.name),
    );
    // The revenue of a bank is its total operating income (TOI): the names say so.
    const growth = chartOf(response, 'Tăng trưởng doanh thu');
    expect(growth.q?.sub?.series.map((item) => item.name)).toEqual([
      'TOI quý này',
      'Cùng kỳ năm trước',
    ]);
    expect(chartOf(response, 'Biên lợi nhuận ròng').q?.main[0]?.name).toBe(
      'LNST / TOI (4 quý)',
    );
    await expect(
      dashboard.fundamental('VCB', { charts: 'ROE,Biên lợi nhuận gộp', per: 'q' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      dashboard.valuation('VCB', { charts: 'EV / EBITDA', from: '2024-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns the industry of a symbol from its statement template', async () => {
    expect(await service(false).service.industry('fpt')).toEqual({
      symbol: 'FPT',
      nganh: 'thuong',
      label: 'Doanh nghiệp sản xuất',
    });
    expect(await service(true).service.industry('vcb')).toEqual({
      symbol: 'VCB',
      nganh: 'nh',
      label: 'Ngân hàng',
    });
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

  it('keeps the EPS charts empty and says why when the share events are unavailable', async () => {
    const { service: dashboard } = service();
    const response = await dashboard.fundamental('FPT', {
      charts: 'Tăng trưởng EPS,PEG',
      per: 'q',
    });
    for (const name of ['Tăng trưởng EPS', 'PEG']) {
      const chart = chartOf(response, name);
      expect(chart.status).toBe('missing');
      expect(chart.note).toBe('Chưa có lịch sử số cổ phiếu đã điều chỉnh tách/thưởng');
      const values = chart.q?.main[0]?.v ?? [];
      expect(values.every((item) => item === null)).toBe(true);
    }
  });

  it('rejects an indicator outside the catalogue (422) before any statement is fetched', async () => {
    const { service: dashboard } = service();
    await expect(dashboard.fundamental('FPT', { charts: 'RSI', per: 'q' })).rejects.toThrow(
      UnprocessableEntityException,
    );
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
    expect(dashboardChart('NIM')?.metric_id).toBe('nim');
    expect(dashboardChart('RSI')).toBeNull();
  });
});
