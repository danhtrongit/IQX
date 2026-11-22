import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_DEFAULT_CHARTS,
  DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY,
  DASHBOARD_INDUSTRY_CHAPTERS,
  DASHBOARD_INDUSTRY_CHARTS,
  DASHBOARD_INDUSTRY_COUNTS,
  NATIVE_METRIC_IDS,
  V2_NATIVE_METRIC_IDS,
  V3_NEW_METRIC_IDS,
  V3_VARIANT_METRIC_KEYS,
  chartFor,
  dashboardDecimals,
  isDashboardChartName,
} from '../../src/modules/dashboard/dashboard.catalog.js';
import { NGANH, type Nganh } from '../../src/modules/dashboard/dashboard.nganh.js';
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

/** In-memory twin of the dashboard_settings table: one row per (account, industry). */
class InMemorySettingsStore implements DashboardSettingsStore {
  readonly rows = new Map<string, StoredDashboardSettings>();

  async findAll(userId: string): Promise<Partial<Record<Nganh, StoredDashboardSettings>>> {
    const result: Partial<Record<Nganh, StoredDashboardSettings>> = {};
    for (const industry of NGANH) {
      const row = this.rows.get(`${userId}:${industry}`);
      if (row) result[industry] = row;
    }
    return result;
  }

  async save(
    userId: string,
    industry: Nganh,
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
    // VCI ICB codes (spec v3 §1.3): FPT is a technology company, so it stays `thuong`.
    fetchIcbDirectory: async () => ({
      data: [{ symbol: 'FPT', lv2: '9500', lv4: '9537' }],
      rawEndpoint: 'fake',
    }),
    fetchCompanyIcb: async () => ({ data: { lv2: null, lv4: null }, rawEndpoint: 'fake' }),
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

describe('dashboard catalog v3 (9 ngành, 90 tên, 260 cặp)', () => {
  /** Spec v3 §3.2: chỉ tiêu chung còn lại · chỉ tiêu ngành · N. */
  const COUNTS: Record<Nganh, [number, number, number]> = {
    thuong: [17, 16, 33],
    nh: [13, 15, 28],
    ck: [13, 14, 27],
    bh: [14, 11, 25],
    bds: [13, 19, 32],
    dk: [14, 15, 29],
    bl: [15, 13, 28],
    dien: [15, 15, 30],
    vl: [14, 14, 28],
  };
  const count = (chapter: { groups: readonly { items: readonly unknown[] }[] }) =>
    chapter.groups.reduce((sum, group) => sum + group.items.length, 0);

  it('§12.1: every industry has the counts of §3.2; 90 names and 260 pairs overall', () => {
    expect(DASHBOARD_CHARTS).toHaveLength(260);
    expect(DASHBOARD_CHART_NAMES).toHaveLength(90);
    expect(new Set(DASHBOARD_CHART_NAMES).size).toBe(90);
    for (const nganh of NGANH) {
      const [common, own, total] = COUNTS[nganh];
      const chapters = DASHBOARD_INDUSTRY_CHAPTERS[nganh];
      expect(chapters.map(count), nganh).toEqual([common, own]);
      expect(DASHBOARD_INDUSTRY_CHARTS[nganh], nganh).toHaveLength(total);
      expect(DASHBOARD_INDUSTRY_COUNTS[nganh]).toBe(total);
      expect(chapters.map((chapter) => chapter.scope)).toEqual(['chung', nganh]);
      expect(chapters[0]!.title).toBe('Chỉ tiêu chung');
      // A name shows once per industry.
      const names = DASHBOARD_INDUSTRY_CHARTS[nganh].map((chart) => chart.name);
      expect(new Set(names).size, nganh).toBe(names.length);
    }
  });

  it('§12.2: a re-taught chart shows only once, in the industry chapter', () => {
    const commonOf = (nganh: Nganh) =>
      DASHBOARD_INDUSTRY_CHAPTERS[nganh][0]!.groups.flatMap((group) =>
        group.items.map((item) => item.name),
      );
    const ownOf = (nganh: Nganh) =>
      DASHBOARD_INDUSTRY_CHAPTERS[nganh][1]!.groups.flatMap((group) =>
        group.items.map((item) => item.name),
      );
    const RETAUGHT: Record<Exclude<Nganh, 'thuong'>, string[]> = {
      nh: ['Tăng trưởng doanh thu', 'ROE', 'ROA', 'P/B'],
      ck: ['Tăng trưởng doanh thu', 'Margin Stability', 'ROE', 'P/B'],
      bh: ['Biên lợi nhuận ròng', 'ROE', 'P/B'],
      bds: ['Tăng trưởng doanh thu', 'Revenue Growth Stability', 'P/E', 'P/B'],
      dk: ['Tăng trưởng doanh thu', 'Margin Stability', 'P/E'],
      bl: ['Tăng trưởng doanh thu', 'P/E'],
      dien: ['Tăng trưởng doanh thu', 'Margin Stability'],
      vl: ['Tăng trưởng doanh thu', 'Margin Stability', 'P/B'],
    };
    for (const [nganh, names] of Object.entries(RETAUGHT) as [Nganh, string[]][]) {
      for (const name of names) {
        expect(commonOf(nganh), `${nganh}: ${name}`).not.toContain(name);
        expect(ownOf(nganh), `${nganh}: ${name}`).toContain(name);
      }
    }
    // Example of §3.2: ROE of a bank sits in "Chỉ tiêu ngân hàng › Thu nhập và hiệu quả".
    expect(chartFor('nh', 'ROE')).toMatchObject({
      chapter: 'nh',
      chapter_title: 'Chỉ tiêu ngân hàng',
      group: 'Thu nhập và hiệu quả',
      academy_chapter: 10,
    });
    expect(chartFor('thuong', 'ROE')).toMatchObject({ chapter: 'chung', academy_chapter: 8 });
  });

  it('§12.3: the five new industries carry no manufacturing chart that is not re-taught', () => {
    expect(chartFor('bds', 'Asset Turnover')).toBeNull();
    expect(chartFor('bds', 'Cash Conversion Cycle')).toBeNull();
    const manufacturing = DASHBOARD_INDUSTRY_CHAPTERS.thuong[1]!.groups.flatMap((group) =>
      group.items.map((item) => item.name),
    );
    for (const nganh of ['bds', 'dk', 'bl', 'dien', 'vl'] as const) {
      const own = new Set(
        DASHBOARD_INDUSTRY_CHAPTERS[nganh][1]!.groups.flatMap((group) =>
          group.items.map((item) => item.name),
        ),
      );
      const common = DASHBOARD_INDUSTRY_CHAPTERS[nganh][0]!.groups.flatMap((group) =>
        group.items.map((item) => item.name),
      );
      for (const name of manufacturing) expect(common, `${nganh}: ${name}`).not.toContain(name);
      // Every manufacturing chart an industry offers is a re-taught one of its own chapter.
      for (const chart of DASHBOARD_INDUSTRY_CHARTS[nganh].filter((item) =>
        manufacturing.includes(item.name),
      ))
        expect(own.has(chart.name), `${nganh}: ${chart.name}`).toBe(true);
    }
    expect(DASHBOARD_INDUSTRY_CHARTS.bl.map((chart) => chart.name)).toContain(
      'Cash Conversion Cycle',
    );
  });

  it('§12.8: the reference line 1 sits on exactly four kind-B charts; PEG and combined ratio keep theirs', () => {
    const withRefOne = [
      ...new Set(
        DASHBOARD_CHARTS.filter((chart) => chart.kind === 'B' && chart.ref === 1).map(
          (chart) => chart.name,
        ),
      ),
    ].sort();
    expect(withRefOne).toEqual(
      [
        'Capex / Khấu hao',
        'Lãi vay đã trả / Chi phí lãi vay',
        'Phải trả người bán / Tồn kho',
        'Tiền / Nợ vay ngắn hạn',
      ].sort(),
    );
    for (const chart of DASHBOARD_CHARTS.filter((item) => item.kind === 'B' && item.ref === 1))
      expect(chart.unit).toBe('lần');
    expect(chartFor('bh', 'Combined ratio')?.ref).toBe(100);
    expect(chartFor('bds', 'PEG')?.ref).toBe(1);
  });

  it('declares the 28 new metric keys and the 3 variants as native formulas, keyed for the Academy', () => {
    expect(V3_NEW_METRIC_IDS).toHaveLength(28);
    expect(NATIVE_METRIC_IDS).toHaveLength(29 + 28 + 3);
    const native = DASHBOARD_CHARTS.filter((chart) => chart.registry_id === null);
    expect(new Set(native.map((chart) => chart.metric_id))).toEqual(new Set(NATIVE_METRIC_IDS));
    // Every new key is used by at least one pair; none collides with a v2 id.
    for (const id of V3_NEW_METRIC_IDS) {
      expect(
        DASHBOARD_CHARTS.some((chart) => chart.metric_key === id),
        id,
      ).toBe(true);
      expect((V2_NATIVE_METRIC_IDS as readonly string[]).includes(id), id).toBe(false);
    }
    expect(V3_NEW_METRIC_IDS).not.toContain('payout_ratio');
    // Variants: their own formula id, the lesson key of the chart they re-teach (D7).
    expect(chartFor('nh', 'ROE')).toMatchObject({ metric_id: 'roe_fin', metric_key: 'roe' });
    expect(chartFor('ck', 'ROE')).toMatchObject({ metric_id: 'roe_fin', metric_key: 'roe' });
    expect(chartFor('bh', 'ROE')).toMatchObject({ metric_id: 'roe_fin', metric_key: 'roe' });
    expect(chartFor('nh', 'ROE')).toMatchObject({ sub_unit: 'lần', sub_type: 'grouped' });
    expect(chartFor('bh', 'Biên lợi nhuận ròng')).toMatchObject({
      metric_id: 'net_margin_bh',
      metric_key: 'net_margin',
    });
    for (const nganh of ['dk', 'vl'] as const)
      expect(chartFor(nganh, 'Biên lợi nhuận gộp')).toMatchObject({
        metric_id: 'gross_margin_q',
        metric_key: 'gross_margin',
      });
    for (const nganh of ['thuong', 'bds', 'bl', 'dien'] as const)
      expect(chartFor(nganh, 'Biên lợi nhuận gộp')).toMatchObject({
        metric_id: 'gross_margin',
        registry_id: 'gross_margin',
      });
    expect(chartFor('thuong', 'ROE')).toMatchObject({ metric_id: 'roe', registry_id: 'roe' });
    // Outside the variants, the lesson key equals the formula id.
    for (const chart of DASHBOARD_CHARTS)
      if (!(chart.metric_id in V3_VARIANT_METRIC_KEYS))
        expect(chart.metric_key).toBe(chart.metric_id);
  });

  it('keeps the v2 names of the 4 old industries (no settings migration, D9)', () => {
    const V2: Record<'thuong' | 'nh' | 'ck' | 'bh', number> = {
      thuong: 33,
      nh: 28,
      ck: 27,
      bh: 25,
    };
    for (const nganh of Object.keys(V2) as (keyof typeof V2)[])
      expect(DASHBOARD_INDUSTRY_CHARTS[nganh]).toHaveLength(V2[nganh]);
    // ck/bh renamed groups.
    expect(chartFor('ck', 'Nợ vay / VCSH')?.group).toBe('Chi phí, đòn bẩy và hiệu quả');
    expect(chartFor('ck', 'Chi phí hoạt động / Doanh thu hoạt động')?.group).toBe(
      'Chi phí, đòn bẩy và hiệu quả',
    );
    expect(chartFor('bh', 'Lợi suất đầu tư')?.group).toBe('Đầu tư và lợi nhuận');
  });

  it('has a valid default set of 6 charts for each industry (spec §6.3)', () => {
    for (const nganh of NGANH) {
      const defaults = DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[nganh];
      expect(defaults).toHaveLength(6);
      expect(new Set(defaults).size).toBe(6);
      for (const name of defaults)
        expect(chartFor(nganh, name), `${nganh}: ${name}`).not.toBeNull();
    }
    expect(DASHBOARD_DEFAULT_CHARTS).toEqual(DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.thuong);
    expect(DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.bds).toEqual([
      'Người mua trả tiền trước / Doanh thu',
      'Tăng trưởng LNST',
      'Số năm bán hết tồn kho',
      'D/E',
      'Lãi vay đã trả / Chi phí lãi vay',
      'P/B',
    ]);
  });

  it('exposes the catalogue of 9 industries with chapters, Academy chapters 8–17 and lesson keys', () => {
    const catalog = service().service.catalog();
    expect(catalog.industries.map((industry) => [industry.nganh, industry.total])).toEqual(
      NGANH.map((nganh) => [nganh, COUNTS[nganh][2]]),
    );
    expect(
      catalog.industries.map((industry) => industry.chapters.map((c) => c.academy_chapter)),
    ).toEqual([
      [8, 9],
      [8, 10],
      [8, 11],
      [8, 12],
      [8, 13],
      [8, 14],
      [8, 15],
      [8, 16],
      [8, 17],
    ]);
    const bds = catalog.industries.find((industry) => industry.nganh === 'bds')!;
    expect(bds.label).toBe('Bất động sản');
    expect(bds.chapters.map((chapter) => chapter.chapter)).toEqual([
      'Chỉ tiêu chung',
      'Chỉ tiêu bất động sản',
    ]);
    expect(bds.default_charts).toEqual([...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.bds]);
    const items = bds.chapters.flatMap((chapter) => chapter.groups.flatMap((group) => group.items));
    expect(items).toHaveLength(32);
    expect(items.find((item) => item.name === 'Số năm bán hết tồn kho')).toEqual({
      name: 'Số năm bán hết tồn kho',
      metric_key: 'inventory_years',
      kind: 'B',
    });
    const bank = catalog.industries.find((industry) => industry.nganh === 'nh')!;
    const bankItems = bank.chapters.flatMap((chapter) =>
      chapter.groups.flatMap((group) => group.items),
    );
    expect(bankItems.find((item) => item.name === 'ROE')).toEqual({
      name: 'ROE',
      metric_key: 'roe',
      kind: 'B',
    });
    for (const name of ['Biên lợi nhuận gộp', 'D/E', 'Cash Conversion Cycle', 'CFO Margin'])
      expect(bankItems.map((item) => item.name)).not.toContain(name);
  });

  it('uses the chart shapes of the spec and the decimals of §10 (năm = 1 except E2)', () => {
    const kinds = new Set(DASHBOARD_CHARTS.map((chart) => chart.kind));
    expect([...kinds].sort()).toEqual(['A', 'B', 'C', 'D', 'E1', 'E2', 'F', 'F2']);
    expect(chartFor('bds', 'Số năm bán hết tồn kho')?.unit).toBe('năm');
    expect(dashboardDecimals('năm', 'B')).toBe(1);
    expect(dashboardDecimals('năm', 'E2')).toBe(0);
    expect(dashboardDecimals('lần', 'B')).toBe(2);
    expect(dashboardDecimals('%', 'B')).toBe(1);
    expect(dashboardDecimals('ngày', 'B')).toBe(0);
  });
});

describe('dashboard settings (theo tài khoản và 9 ngành, trên server)', () => {
  it('returns the default dashboard of every industry when the account never saved anything', async () => {
    const { service: dashboard } = service();
    const settings = await dashboard.settings(USER);
    expect(Object.keys(settings)).toEqual([...NGANH]);
    for (const nganh of NGANH)
      expect(settings[nganh]).toEqual({
        charts: [...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[nganh]],
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

  it('saves a new industry (bds) and rejects a chart outside it with 400 CHART_NOT_IN_INDUSTRY', async () => {
    const { service: dashboard } = service();
    const input = dashboardSettingsInputSchema.parse({
      charts: ['Số năm bán hết tồn kho', 'D/E', 'Tiền / Nợ vay ngắn hạn'],
      per: 'q',
      nks: { 'D/E': { q: 8 } },
    });
    await expect(dashboard.saveSettings(USER, 'bds', input)).resolves.toMatchObject({
      nganh: 'bds',
      charts: ['Số năm bán hết tồn kho', 'D/E', 'Tiền / Nợ vay ngắn hạn'],
    });
    expect((await dashboard.settings(USER)).bds.charts).toEqual([
      'Số năm bán hết tồn kho',
      'D/E',
      'Tiền / Nợ vay ngắn hạn',
    ]);
    await expect(
      dashboard.saveSettings(
        USER,
        'bds',
        dashboardSettingsInputSchema.parse({ charts: ['Asset Turnover'], per: 'q', nks: {} }),
      ),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHART_NOT_IN_INDUSTRY' } });
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
        dashboardSettingsInputSchema.parse({ charts: ['D/E'], per: 'q', nks: { NIM: { q: 8 } } }),
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
    expect(dashboardSettingsInputSchema.safeParse({ ...base, charts: ['RSI'] }).success).toBe(
      false,
    );
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
    const pe = response.charts['P/E'] as {
      name: string;
      kind: string;
      unit: string;
      v: (number | null)[];
    };
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
    expect(chartOf(response, 'Biên lợi nhuận ròng').q?.main[0]?.name).toBe('LNST / TOI (4 quý)');
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
      template: 'thuong',
    });
    expect(await service(true).service.industry('vcb')).toEqual({
      symbol: 'VCB',
      nganh: 'nh',
      label: 'Ngân hàng',
      template: 'nh',
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
  it('finds a chart by its (industry, name) pair', () => {
    expect(chartFor('thuong', 'ROE')?.metric_id).toBe('roe');
    expect(chartFor('nh', 'NIM')?.metric_id).toBe('nim');
    expect(chartFor('thuong', 'NIM')).toBeNull();
    expect(chartFor('thuong', 'RSI')).toBeNull();
    expect(isDashboardChartName('NIM')).toBe(true);
    expect(isDashboardChartName('RSI')).toBe(false);
  });
});
