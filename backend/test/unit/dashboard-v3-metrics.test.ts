/**
 * Dashboard v3 (update 22-11) formulas: the 28 new metrics of the 5 new industries, the 3 formula
 * variants of re-taught metrics, the enterprise line map (TT200 → VCI) and the direct-method cash
 * flow rule (PLAN-dashboard-v3 §5, §6.2, §6.3, D5, D6; spec v3 §7, §10, §12.6, §12.7, §12.9, §12.10).
 *
 * Expected numbers are recomputed by hand from the raw VCI fields of the fixture
 * (`test/fixtures/dashboard/vci-v3-statements.json`, reduced from VCI on 2026-11-22), never through
 * the dashboard mapping.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_INDUSTRY_CHARTS,
  NATIVE_METRIC_IDS,
  V3_NEW_METRIC_IDS,
  V3_VARIANT_METRIC_KEYS,
  chartFor,
} from '../../src/modules/dashboard/dashboard.catalog.js';
import type { IcbDirectory } from '../../src/modules/dashboard/dashboard.icb.js';
import {
  applyDirectMethod,
  isDirectMethodRow,
  normalizeIndustryStatements,
} from '../../src/modules/dashboard/dashboard.mapping.js';
import { NATIVE_METRICS } from '../../src/modules/dashboard/dashboard.native.js';
import { NGANH, type IcbCodes, type Nganh } from '../../src/modules/dashboard/dashboard.nganh.js';
import type { DashboardSettingsStore } from '../../src/modules/dashboard/dashboard.repository.js';
import type { DashboardChartPayload } from '../../src/modules/dashboard/dashboard.series.js';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';
import { evaluateScreenerMetric } from '../../src/modules/screener/screener.statements.js';

type Row = Record<string, unknown>;
type Section = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW';
type Sections = Record<Section, { years: Row[]; quarters: Row[] }>;

const FIXTURE = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../fixtures/dashboard/vci-v3-statements.json'),
    'utf8',
  ),
) as Record<string, Sections>;

/** VCI ICB codes of the fixture symbols (search-bar, 2026-11-22). */
const ICB: Record<string, IcbCodes> = {
  VHM: { lv2: '8600', lv4: '8633' },
  GAS: { lv2: '7500', lv4: '7573' },
  MWG: { lv2: '5300', lv4: '5379' },
  REE: { lv2: '7500', lv4: '7535' },
  REE_DIRECT: { lv2: '7500', lv4: '7535' },
  HPG: { lv2: '1700', lv4: '1757' },
  ANV: { lv2: '3500', lv4: '3573' },
};

const B = 1e9;

interface Options {
  /** Daily closes (đồng) served by the market data fake. */
  prices?: { time: string; close: number }[];
  shares?: number;
}

function serviceFor(data: Record<string, Sections>, options: Options = {}) {
  const vci = {
    fetchFinancialRaw: async (symbol: string, section: Section) => ({
      data: data[symbol]![section],
      rawEndpoint: 'fake',
    }),
    fetchShareEvents: async () => ({ data: [], rawEndpoint: 'fake' }),
    fetchFinancialReport: async () => ({
      data: options.shares ? [{ number_of_shares_mkt_cap: options.shares }] : [],
      rawEndpoint: 'fake',
    }),
  } as unknown as VciMarketProvider;
  const market = {
    ohlcv: async () => ({
      data: (options.prices ?? []).map((price) => ({ time: price.time, close: price.close })),
      meta: {
        source: 'fake',
        source_priority: 1,
        fallback_used: false,
        as_of: '',
        raw_endpoint: '',
      },
    }),
  } as unknown as MarketDataService;
  const store = {
    findAll: async () => ({}),
    save: async () => null,
  } as unknown as DashboardSettingsStore;
  const icb = { lookup: async (symbol: string) => ICB[symbol] ?? null } as unknown as IcbDirectory;
  return new DashboardService(vci, market, store, icb);
}

const service = serviceFor(FIXTURE);

async function charts(symbol: string, names: string[]) {
  const response = await service.fundamental(symbol, { charts: names.join(','), per: 'q' });
  return {
    nganh: response.nganh,
    chart: (name: string) => response.charts[name] as DashboardChartPayload,
  };
}

// ---- Hand computation on the raw VCI rows -----------------------------------------------------

const SECTION_OF = (field: string): Section =>
  field.startsWith('bsa')
    ? 'BALANCE_SHEET'
    : field.startsWith('isa')
      ? 'INCOME_STATEMENT'
      : 'CASH_FLOW';

const ordinal = (row: Row) => Number(row.year_report) * 4 + Number(row.length_report) - 1;

/** Raw field of the quarter `back` quarters before the latest one (a missing field counts as 0). */
function raw(symbol: string, field: string, back = 0): number {
  const rows = FIXTURE[symbol]![SECTION_OF(field)].quarters;
  const latest = Math.max(...FIXTURE[symbol]!.INCOME_STATEMENT.quarters.map(ordinal));
  const row = rows.find((item) => ordinal(item) === latest - back);
  if (!row) throw new Error(`fixture ${symbol} has no quarter ${back} back`);
  return Number(row[field] ?? 0);
}

/** Sum of a raw field over the four quarters ending `back` quarters before the latest one. */
const ttm = (symbol: string, field: string, back = 0) =>
  [0, 1, 2, 3].reduce((total, i) => total + raw(symbol, field, back + i), 0);

/** Raw field summed over the four quarters of a fiscal year. */
function yearSum(symbol: string, field: string, year: number): number {
  return FIXTURE[symbol]![SECTION_OF(field)].quarters.filter(
    (row) => row.year_report === year,
  ).reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

/** Raw balance at the end of a fiscal year (Q4). */
function yearEnd(symbol: string, field: string, year: number): number {
  const row = FIXTURE[symbol]![SECTION_OF(field)].quarters.find(
    (item) => item.year_report === year && item.length_report === 4,
  );
  return Number(row?.[field] ?? 0);
}

const lastQ = (chart: DashboardChartPayload, line = 0) => chart.q!.main[line]!.v.at(-1);
const qAt = (chart: DashboardChartPayload, label: string, line = 0) =>
  chart.q!.main[line]!.v[chart.q!.labels.indexOf(label)];
const yAt = (chart: DashboardChartPayload, label: string, line = 0) =>
  chart.y!.main[line]!.v[chart.y!.labels.indexOf(label)];
const lastBar = (chart: DashboardChartPayload, bar: number) => chart.q!.sub!.series[bar]!.v.at(-1);

// -------------------------------------------------------------------------------------------------

describe('dashboard v3 catalogue: every metric has a formula (PLAN §10 T2 step 5)', () => {
  it('declares the 28 new metrics and the 3 variants as native formulas, none pending', () => {
    expect(NATIVE_METRIC_IDS).toHaveLength(29 + 28 + 3);
    for (const id of NATIVE_METRIC_IDS) expect(NATIVE_METRICS[id], id).toBeDefined();
    for (const nganh of NGANH)
      for (const spec of DASHBOARD_INDUSTRY_CHARTS[nganh]) {
        expect(spec).not.toHaveProperty('pending');
        if ((V3_NEW_METRIC_IDS as readonly string[]).includes(spec.metric_id))
          expect(spec.registry_id).toBeNull();
      }
    for (const [id, key] of Object.entries(V3_VARIANT_METRIC_KEYS)) {
      const specs = NGANH.flatMap((nganh) => DASHBOARD_INDUSTRY_CHARTS[nganh]).filter(
        (spec) => spec.metric_id === id,
      );
      expect(specs.length).toBeGreaterThan(0);
      for (const spec of specs) expect(spec).toMatchObject({ metric_key: key, registry_id: null });
    }
  });
});

describe('industry of the fixture symbols (spec v3 §1.3)', () => {
  it.each<[string, Nganh]>([
    ['VHM', 'bds'],
    ['GAS', 'dk'],
    ['MWG', 'bl'],
    ['REE', 'dien'],
    ['HPG', 'vl'],
    ['ANV', 'bl'],
  ])('%s → %s', async (symbol, nganh) => {
    expect((await service.industry(symbol)).nganh).toBe(nganh);
  });
});

describe('real estate metrics (spec v3 §8.6) on VHM', () => {
  const S = 'VHM';
  const names = [
    'Lợi nhuận ngoài kinh doanh bất động sản / LNTT',
    'Người mua trả tiền trước / Doanh thu',
    'Tăng trưởng người mua trả tiền trước',
    'Doanh thu chưa thực hiện / VCSH',
    'Tồn kho / Tổng tài sản',
    'Số năm bán hết tồn kho',
    'Tỷ trọng bất động sản đầu tư',
    'Phải thu và trả trước / VCSH',
    'Tỷ trọng nợ vay ngắn hạn',
    'Tiền / Nợ vay ngắn hạn',
    'Lãi vay đã trả / Chi phí lãi vay',
  ];

  it('computes the 11 new real estate metrics from the TT200 lines', async () => {
    const { nganh, chart } = await charts(S, names);
    expect(nganh).toBe('bds');
    const nonCore = ttm(S, 'isa6') + ttm(S, 'isa102') + ttm(S, 'isa15') + ttm(S, 'isa14');
    expect(lastQ(chart(names[0]!))).toBeCloseTo((nonCore / ttm(S, 'isa16')) * 100, 9);
    expect(lastBar(chart(names[0]!), 0)).toBeCloseTo(nonCore / B, 6);

    const prepay = (back = 0) => raw(S, 'bsa58', back) + raw(S, 'bsa170', back);
    expect(lastQ(chart(names[1]!))).toBeCloseTo(prepay() / ttm(S, 'isa3'), 9);
    expect(lastQ(chart(names[2]!))).toBeCloseTo((prepay() / prepay(4) - 1) * 100, 9);
    expect(chart(names[2]!).kind).toBe('A');
    expect(lastQ(chart(names[3]!))).toBeCloseTo(
      ((raw(S, 'bsa167') + raw(S, 'bsa76')) / raw(S, 'bsa78')) * 100,
      9,
    );
    expect(lastQ(chart(names[4]!))).toBeCloseTo((raw(S, 'bsa15') / raw(S, 'bsa53')) * 100, 9);

    const years = chart(names[5]!);
    expect(years).toMatchObject({ unit: 'năm', decimals: 1 });
    expect(lastQ(years)).toBeCloseTo(raw(S, 'bsa15') / -ttm(S, 'isa4'), 9);
    expect(yAt(years, '2025')).toBeCloseTo(
      yearEnd(S, 'bsa15', 2025) / -yearSum(S, 'isa4', 2025),
      9,
    );

    expect(lastQ(chart(names[6]!))).toBeCloseTo(
      ((raw(S, 'bsa40') + raw(S, 'bsa188') + raw(S, 'bsa39')) / raw(S, 'bsa53')) * 100,
      9,
    );
    expect(chart(names[6]!).q!.sub!.type).toBe('stacked');
    expect(lastQ(chart(names[7]!))).toBeCloseTo(
      ((raw(S, 'bsa10') + raw(S, 'bsa161') + raw(S, 'bsa13') + raw(S, 'bsa27')) / raw(S, 'bsa78')) *
        100,
      9,
    );
    // D5: long-term debt of the 5 new industries includes convertible bonds (bsa173).
    const longDebt = raw(S, 'bsa71') + raw(S, 'bsa173');
    expect(lastQ(chart(names[8]!))).toBeCloseTo(
      (raw(S, 'bsa56') / (raw(S, 'bsa56') + longDebt)) * 100,
      9,
    );
    expect(lastBar(chart(names[8]!), 1)).toBeCloseTo(longDebt / B, 6);

    const cash = chart(names[9]!);
    expect(cash).toMatchObject({ unit: 'lần', decimals: 2, ref: 1 });
    expect(lastQ(cash)).toBeCloseTo((raw(S, 'bsa2') + raw(S, 'bsa5')) / raw(S, 'bsa56'), 9);

    const interest = chart(names[10]!);
    expect(interest.ref).toBe(1);
    expect(lastQ(interest)).toBeCloseTo(ttm(S, 'cfa14') / ttm(S, 'isa8'), 9);
  });

  it('uses the line and bar names of the MAU', async () => {
    const { chart } = await charts(S, [
      'Số năm bán hết tồn kho',
      'Tăng trưởng người mua trả tiền trước',
    ]);
    expect(chart('Số năm bán hết tồn kho').q!.main.map((line) => line.name)).toEqual([
      'Tồn kho / Giá vốn 4 quý',
    ]);
    expect(chart('Số năm bán hết tồn kho').y!.sub!.series.map((bar) => bar.name)).toEqual([
      'Hàng tồn kho',
      'Giá vốn năm',
    ]);
    expect(
      chart('Tăng trưởng người mua trả tiền trước').y!.sub!.series.map((bar) => bar.name),
    ).toEqual(['Cuối năm này', 'Cuối năm trước']);
  });

  it('keeps the revenue growth on 4 quarters for a real estate symbol (spec v3 §12.6)', async () => {
    const { chart } = await charts(S, ['Biên lợi nhuận gộp']);
    expect(chart('Biên lợi nhuận gộp').q!.main[0]!.name).toBe('Biên gộp (4 quý)');
    expect(lastQ(chart('Biên lợi nhuận gộp'))).toBeCloseTo(
      (ttm(S, 'isa5') / ttm(S, 'isa3')) * 100,
      9,
    );
  });
});

describe('oil and gas metrics (spec v3 §8.7) on GAS', () => {
  const S = 'GAS';

  it('computes the gross margin quarter by quarter, "Biên gộp quý" (spec v3 §12.6)', async () => {
    const { chart } = await charts(S, ['Biên lợi nhuận gộp']);
    const margin = chart('Biên lợi nhuận gộp');
    expect(margin.q!.main[0]!.name).toBe('Biên gộp quý');
    expect(margin.q!.sub!.series.map((bar) => bar.name)).toEqual([
      'Giá vốn quý',
      'Lợi nhuận gộp quý',
    ]);
    expect(lastQ(margin)).toBeCloseTo((raw(S, 'isa5') / raw(S, 'isa3')) * 100, 9);
    expect(lastBar(margin, 0)).toBeCloseTo(-raw(S, 'isa4') / B, 6);
    expect(margin.y!.main[0]!.name).toBe('Biên gộp năm');
    expect(yAt(margin, '2025')).toBeCloseTo(
      (yearSum(S, 'isa5', 2025) / yearSum(S, 'isa3', 2025)) * 100,
      9,
    );
  });

  it('computes inventory days, depreciation, capex, net cash, financial income and payout', async () => {
    const names = [
      'Số ngày tồn kho',
      'Khấu hao / Doanh thu',
      'Capex / Khấu hao',
      'Tiền ròng / VCSH',
      'Thu nhập tài chính / LNTT',
      'Tỷ lệ chi trả cổ tức',
      'Người mua trả tiền trước / Doanh thu',
    ];
    const { nganh, chart } = await charts(S, names);
    expect(nganh).toBe('dk');
    const avgInventory = (raw(S, 'bsa15') + raw(S, 'bsa15', 4)) / 2;
    expect(lastQ(chart(names[0]!))).toBeCloseTo((avgInventory / -ttm(S, 'isa4')) * 365, 9);
    expect(lastQ(chart(names[1]!))).toBeCloseTo((ttm(S, 'cfa2') / ttm(S, 'isa3')) * 100, 9);
    expect(chart(names[2]!).ref).toBe(1);
    expect(lastQ(chart(names[2]!))).toBeCloseTo(-ttm(S, 'cfa19') / ttm(S, 'cfa2'), 9);
    const netCash =
      raw(S, 'bsa2') + raw(S, 'bsa5') - raw(S, 'bsa56') - raw(S, 'bsa71') - raw(S, 'bsa173');
    expect(lastQ(chart(names[3]!))).toBeCloseTo((netCash / raw(S, 'bsa78')) * 100, 9);
    expect(lastQ(chart(names[4]!))).toBeCloseTo((ttm(S, 'isa6') / ttm(S, 'isa16')) * 100, 9);
    // D8: dividends paid over the parent's net profit of the four quarters before.
    expect(lastQ(chart(names[5]!))).toBeCloseTo((-ttm(S, 'cfa32') / ttm(S, 'isa22', 4)) * 100, 9);
    expect(yAt(chart(names[5]!), '2025')).toBeCloseTo(
      (-yearSum(S, 'cfa32', 2025) / yearSum(S, 'isa22', 2024)) * 100,
      9,
    );
    expect(lastQ(chart(names[6]!))).toBeCloseTo(
      (raw(S, 'bsa58') + raw(S, 'bsa170')) / ttm(S, 'isa3'),
      9,
    );
  });
});

describe('retail metrics (spec v3 §8.8) on MWG', () => {
  const S = 'MWG';

  it('computes SG&A, core margin, inventory provision, payables, short debt and fixed-asset turnover', async () => {
    const names = [
      'Chi phí bán hàng và quản lý / Doanh thu',
      'Biên lợi nhuận kinh doanh chính',
      'Dự phòng giảm giá tồn kho / Tồn kho',
      'Phải trả người bán / Tồn kho',
      'Vay ngắn hạn / Tồn kho',
      'Doanh thu / Tài sản cố định',
      'Số ngày tồn kho',
      'Tỷ lệ chi trả cổ tức',
    ];
    const { nganh, chart } = await charts(S, names);
    expect(nganh).toBe('bl');
    const sga = -ttm(S, 'isa9') - ttm(S, 'isa10');
    expect(lastQ(chart(names[0]!))).toBeCloseTo((sga / ttm(S, 'isa3')) * 100, 9);
    expect(lastBar(chart(names[0]!), 0)).toBeCloseTo(-ttm(S, 'isa9') / B, 6);
    const core = ttm(S, 'isa5') + ttm(S, 'isa9') + ttm(S, 'isa10');
    expect(lastQ(chart(names[1]!))).toBeCloseTo((core / ttm(S, 'isa3')) * 100, 9);
    expect(lastQ(chart(names[2]!))).toBeCloseTo(
      (Math.abs(raw(S, 'bsa17')) / raw(S, 'bsa16')) * 100,
      9,
    );
    expect(chart(names[3]!).ref).toBe(1);
    expect(lastQ(chart(names[3]!))).toBeCloseTo(raw(S, 'bsa57') / raw(S, 'bsa15'), 9);
    expect(chart(names[4]!).ref).toBeUndefined();
    expect(lastQ(chart(names[4]!))).toBeCloseTo(raw(S, 'bsa56') / raw(S, 'bsa15'), 9);
    expect(lastQ(chart(names[5]!))).toBeCloseTo(
      ttm(S, 'isa3') / ((raw(S, 'bsa29') + raw(S, 'bsa29', 4)) / 2),
      9,
    );
    expect(chart(names[6]!).decimals).toBe(0);
    expect(lastQ(chart(names[6]!))).toBeCloseTo(
      ((raw(S, 'bsa15') + raw(S, 'bsa15', 4)) / 2 / -ttm(S, 'isa4')) * 365,
      9,
    );
    expect(lastQ(chart(names[7]!))).toBeCloseTo((-ttm(S, 'cfa32') / ttm(S, 'isa22', 4)) * 100, 9);
  });
});

describe('power and utilities metrics (spec v3 §8.9) on REE', () => {
  const S = 'REE';

  it('computes EBITDA margin, fixed assets, construction in progress, receivable days and financial costs', async () => {
    const names = [
      'Biên EBITDA',
      'Tài sản cố định / Tổng tài sản',
      'Xây dựng dở dang / Tài sản cố định',
      'Số ngày thu tiền',
      'Chi phí tài chính ngoài lãi vay / LNTT',
      'Khấu hao / Doanh thu',
      'Capex / Khấu hao',
      'Tỷ lệ chi trả cổ tức',
    ];
    const { nganh, chart } = await charts(S, names);
    expect(nganh).toBe('dien');
    const core = ttm(S, 'isa5') + ttm(S, 'isa9') + ttm(S, 'isa10');
    expect(lastQ(chart(names[0]!))).toBeCloseTo(
      ((core + ttm(S, 'cfa2')) / ttm(S, 'isa3')) * 100,
      9,
    );
    expect(chart(names[0]!).q!.sub).toMatchObject({ type: 'stacked' });
    expect(lastQ(chart(names[1]!))).toBeCloseTo((raw(S, 'bsa29') / raw(S, 'bsa53')) * 100, 9);
    expect(lastQ(chart(names[2]!))).toBeCloseTo(
      ((raw(S, 'bsa188') + raw(S, 'bsa39')) / raw(S, 'bsa29')) * 100,
      9,
    );
    expect(lastQ(chart(names[3]!))).toBeCloseTo(
      ((raw(S, 'bsa9') + raw(S, 'bsa9', 4)) / 2 / ttm(S, 'isa3')) * 365,
      9,
    );
    // Financial expense (isa7) minus its interest part (isa8), both reported negative.
    expect(lastQ(chart(names[4]!))).toBeCloseTo(
      ((-ttm(S, 'isa7') + ttm(S, 'isa8')) / ttm(S, 'isa16')) * 100,
      9,
    );
    for (const name of names) expect(chart(name).status, name).toBe('ok');
  });
});

describe('basic materials metrics (spec v3 §8.10) on HPG', () => {
  const S = 'HPG';

  it('computes the quarterly gross margin and the materials metrics', async () => {
    const names = [
      'Biên lợi nhuận gộp',
      'Dự phòng giảm giá tồn kho / Tồn kho',
      'Vay ngắn hạn / Tồn kho',
      'Xây dựng dở dang / Tài sản cố định',
      'Capex / Khấu hao',
      'Biên EBITDA',
      'Chi phí tài chính ngoài lãi vay / LNTT',
    ];
    const { nganh, chart } = await charts(S, names);
    expect(nganh).toBe('vl');
    expect(chart(names[0]!).q!.main[0]!.name).toBe('Biên gộp quý');
    expect(lastQ(chart(names[0]!))).toBeCloseTo((raw(S, 'isa5') / raw(S, 'isa3')) * 100, 9);
    expect(lastQ(chart(names[1]!))).toBeCloseTo(
      (Math.abs(raw(S, 'bsa17')) / raw(S, 'bsa16')) * 100,
      9,
    );
    expect(lastQ(chart(names[2]!))).toBeCloseTo(raw(S, 'bsa56') / raw(S, 'bsa15'), 9);
    expect(lastQ(chart(names[4]!))).toBeCloseTo(-ttm(S, 'cfa19') / ttm(S, 'cfa2'), 9);
    for (const name of names) expect(chart(name).status, name).toBe('ok');
  });
});

describe('direct-method cash flow statements (PLAN D6, spec v3 §7, §10, §12.9)', () => {
  const DEPRECIATION_CHARTS = [
    'Khấu hao / Doanh thu',
    'Capex / Khấu hao',
    'Biên EBITDA',
    'Net Debt / EBITDA',
  ];

  it('detects a direct-method period and drops its depreciation, taking interest paid from line 04', () => {
    const direct = { cfa1: 0, cfa2: 0, cfa18: 120, cfa14: 0, cfa42: -7, cfa103: 0 };
    expect(isDirectMethodRow(direct)).toBe(true);
    expect(isDirectMethodRow({ cfa1: 10, cfa2: 0, cfa18: 120 })).toBe(false);
    expect(isDirectMethodRow({ cfa1: 0, cfa2: 0, cfa18: 0 })).toBe(false);
    const [row] = applyDirectMethod([direct])!;
    expect(row).not.toHaveProperty('cfa2');
    expect(row).not.toHaveProperty('cfa103');
    expect(row).toMatchObject({ cfa14: -7, cfa18: 120 });
    // Line 04 at 0: interest paid stays empty, never 0.
    expect(applyDirectMethod([{ ...direct, cfa42: 0 }])![0]).not.toHaveProperty('cfa14');
  });

  it('leaves every window holding a quarter of 2025 empty on REE restated to the direct method', async () => {
    const { chart } = await charts('REE_DIRECT', DEPRECIATION_CHARTS);
    for (const name of DEPRECIATION_CHARTS) {
      const payload = chart(name);
      const labels = payload.q!.labels;
      for (const [index, label] of labels.entries()) {
        const [quarter, yy] = label.slice(1).split('/').map(Number) as [number, number];
        const end = (2000 + yy) * 4 + quarter - 1;
        const touches2025 = end >= 2025 * 4 && end - 3 <= 2025 * 4 + 3;
        const value = payload.q!.main[0]!.v[index];
        if (touches2025) expect(value, `${name} ${label}`).toBeNull();
        else expect(value, `${name} ${label}`).not.toBeNull();
      }
      expect(yAt(payload, '2025'), `${name} 2025`).toBeNull();
      expect(yAt(payload, '2024'), `${name} 2024`).not.toBeNull();
    }
    // The real (indirect) REE fills the same windows.
    const real = await charts('REE', DEPRECIATION_CHARTS);
    for (const name of DEPRECIATION_CHARTS) expect(qAt(real.chart(name), 'Q2/25')).not.toBeNull();
  });

  it('takes the interest paid of a direct-method quarter from line 04', async () => {
    const { chart } = await charts('REE_DIRECT', ['Chi phí tài chính ngoài lãi vay / LNTT']);
    expect(chart('Chi phí tài chính ngoài lãi vay / LNTT').status).toBe('ok');
    const statements = normalizeIndustryStatements(
      {
        balance_sheet: FIXTURE.REE_DIRECT!.BALANCE_SHEET,
        income_statement: FIXTURE.REE_DIRECT!.INCOME_STATEMENT,
        cash_flow: FIXTURE.REE_DIRECT!.CASH_FLOW,
      },
      new Date('2026-11-22T00:00:00Z'),
      'thuong',
      'dien',
    );
    const q2 = statements.quarters.find((period) => period.year === 2025 && period.quarter === 2)!;
    expect(q2.values).not.toHaveProperty('depreciation');
    const original = FIXTURE.REE!.CASH_FLOW.quarters.find(
      (row) => row.year_report === 2025 && row.length_report === 2,
    )!;
    expect((q2.values as Record<string, number>).dn_interest_paid).toBe(-Number(original.cfa14));
  });

  it('leaves the depreciation metrics of ANV (real direct-method statements) empty with a reason', async () => {
    const { nganh, chart } = await charts('ANV', [
      'Biên lợi nhuận kinh doanh chính',
      'Tỷ lệ chi trả cổ tức',
    ]);
    expect(nganh).toBe('bl');
    expect(chart('Biên lợi nhuận kinh doanh chính').status).toBe('ok');
    const statements = normalizeIndustryStatements(
      {
        balance_sheet: FIXTURE.ANV!.BALANCE_SHEET,
        income_statement: FIXTURE.ANV!.INCOME_STATEMENT,
        cash_flow: FIXTURE.ANV!.CASH_FLOW,
      },
      new Date('2026-11-22T00:00:00Z'),
      'thuong',
      'bl',
    );
    expect(statements.quarters[0]!.values).not.toHaveProperty('depreciation');
    const ttmEbitda = evaluateScreenerMetric(
      'net_debt_ebitda',
      statements,
      { price: null, shares: null },
      'ttm',
    );
    expect(ttmEbitda.status).not.toBe('ok');
  });

  it('leaves EV / EBITDA empty on the days that use a direct-method period', async () => {
    const prices = [
      { time: '2024-12-31', close: 60_000 }, // uses Q3/24: indirect window
      { time: '2025-06-30', close: 60_000 }, // uses Q1/25: window holds a direct quarter
      { time: '2026-11-20', close: 60_000 }, // uses Q3/26: window Q4/25..Q3/26 holds Q4/25
    ];
    const dashboard = serviceFor(FIXTURE, { prices, shares: 471_000_000 });
    const direct = await dashboard.valuation('REE_DIRECT', { charts: 'EV / EBITDA' });
    const real = await dashboard.valuation('REE', { charts: 'EV / EBITDA' });
    expect(direct.dates).toEqual(prices.map((price) => price.time));
    const ev = direct.charts['EV / EBITDA']!.v;
    expect(ev[0]).not.toBeNull();
    expect(ev[1]).toBeNull();
    expect(ev[2]).toBeNull();
    expect(real.charts['EV / EBITDA']!.v.every((value) => value !== null)).toBe(true);
  });
});

describe('every chart of the 9 industries renders in quarter and year mode (spec v3 §12.10)', () => {
  it.each(['VHM', 'GAS', 'MWG', 'REE', 'HPG', 'ANV'])('%s', async (symbol) => {
    const response = await service.fundamental(symbol, { per: 'q' });
    for (const [name, value] of Object.entries(response.charts)) {
      const chart = value as DashboardChartPayload;
      expect(chart.status, name).not.toBe('definition_pending');
      if (['D', 'E1', 'E2'].includes(chart.kind)) expect(chart.labels, name).toBeDefined();
      else if (chart.kind !== 'F') {
        expect(chart.q?.labels.length, name).toBeGreaterThan(0);
        expect(chart.y?.labels.length, name).toBeGreaterThan(0);
        for (const line of [...chart.q!.main, ...chart.y!.main])
          for (const item of line.v)
            expect(item === null || Number.isFinite(item), name).toBe(true);
      }
    }
  });
});

// ---- Variants on the financial templates (PLAN §6.2, spec v3 §12.7) -------------------------

type Fields = Record<string, number>;

/** Two fiscal years of four identical quarters each (tỷ đồng), as in the v2 industry tests. */
function synthetic(years: Record<number, { income: Fields; balance: Fields }>): Sections {
  const meta = (year: number, quarter: number) => ({
    year_report: year,
    length_report: quarter,
    public_date: `${quarter === 4 ? year + 1 : year}-${String((quarter % 4) * 3 + 1).padStart(2, '0')}-15T00:00:00`,
  });
  const scale = (fields: Fields) =>
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value * B]));
  const income: Row[] = [];
  const balance: Row[] = [];
  for (const [year, fixture] of Object.entries(years))
    for (const quarter of [1, 2, 3, 4]) {
      income.push({ ...meta(Number(year), quarter), ...scale(fixture.income) });
      balance.push({ ...meta(Number(year), quarter), ...scale(fixture.balance) });
    }
  return {
    BALANCE_SHEET: { years: [], quarters: balance },
    INCOME_STATEMENT: { years: [], quarters: income },
    CASH_FLOW: { years: [], quarters: [] },
  };
}

/**
 * Per quarter: net profit 12 → 15, parent 10 → 12; year-end balances: total assets 3.250 → 3.750,
 * equity 260 → 300 with minority interest 10 → 20. Q4/24: ROE = 48 / ((280 + 250) / 2),
 * ROA = 60 / ((3.750 + 3.250) / 2), leverage = 3.500 / 280.
 */
const COMMON = {
  2023: {
    income: { isa20: 12, isa22: 10 },
    balance: { bsa53: 3250, bsa78: 260, bsa210: 10, bsa174: 0 },
  },
  2024: {
    income: { isa20: 15, isa22: 12 },
    balance: { bsa53: 3750, bsa78: 300, bsa210: 20, bsa174: 0 },
  },
};
const withIncome = (extra: Record<number, Fields>) =>
  synthetic(
    Object.fromEntries(
      Object.entries(COMMON).map(([year, fixture]) => [
        year,
        { income: { ...fixture.income, ...extra[Number(year)] }, balance: fixture.balance },
      ]),
    ),
  );

const FINANCIAL = {
  BANK: withIncome({ 2023: { isb27: 20, isb38: 26 }, 2024: { isb27: 25, isb38: 32 } }),
  SEC: withIncome({ 2023: { isa3: 50, iss42: 10 }, 2024: { isa3: 60, iss42: 12 } }),
  INS: withIncome({
    2023: { isi105: 180, isi97: 18, isi100: 20 },
    2024: { isi105: 200, isi97: 10, isi100: 24 },
  }),
};

describe('ROE of banks, securities companies and insurers: two lines and leverage bars (spec v3 §12.7)', () => {
  const financial = serviceFor(FINANCIAL);

  it.each<[string, Nganh]>([
    ['BANK', 'nh'],
    ['SEC', 'ck'],
    ['INS', 'bh'],
  ])('%s', async (symbol, nganh) => {
    expect(chartFor(nganh, 'ROE')).toMatchObject({ metric_id: 'roe_fin', metric_key: 'roe' });
    const response = await financial.fundamental(symbol, { charts: 'ROE', per: 'q' });
    expect(response.nganh).toBe(nganh);
    const roe = response.charts.ROE as DashboardChartPayload;
    expect(roe.q!.main.map((line) => line.name)).toEqual(['ROE (4 quý)', 'ROA (4 quý)']);
    expect(roe.y!.main.map((line) => line.name)).toEqual(['ROE năm', 'ROA năm']);
    expect(roe.q!.sub).toMatchObject({ unit: 'lần', type: 'grouped' });
    expect(roe.q!.sub!.series[0]!.name).toBe('Tổng tài sản BQ / VCSH BQ');
    expect(lastQ(roe, 0)).toBeCloseTo((48 / ((280 + 250) / 2)) * 100, 9);
    expect(lastQ(roe, 1)).toBeCloseTo((60 / ((3750 + 3250) / 2)) * 100, 9);
    expect(lastBar(roe, 0)).toBeCloseTo(3500 / 280, 9);
    expect(yAt(roe, '2024', 0)).toBeCloseTo((48 / 265) * 100, 9);
  });

  it('computes the insurer net margin on net premium with underwriting and investment profit bars', async () => {
    expect(chartFor('bh', 'Biên lợi nhuận ròng')).toMatchObject({
      metric_id: 'net_margin_bh',
      metric_key: 'net_margin',
    });
    const response = await financial.fundamental('INS', {
      charts: 'Biên lợi nhuận ròng',
      per: 'q',
    });
    const margin = response.charts['Biên lợi nhuận ròng'] as DashboardChartPayload;
    expect(margin.q!.main[0]!.name).toBe('LNST / Phí bảo hiểm thuần (4 quý)');
    expect(margin.q!.sub!.series.map((bar) => bar.name)).toEqual([
      'Lợi nhuận bảo hiểm 4 quý',
      'Lợi nhuận đầu tư 4 quý',
    ]);
    expect(lastQ(margin)).toBeCloseTo((60 / 800) * 100, 9);
    expect(lastBar(margin, 0)).toBeCloseTo(40, 9);
    expect(lastBar(margin, 1)).toBeCloseTo(96, 9);
  });
});

describe('number rules for the new metrics (spec v3 §10)', () => {
  /** One enterprise symbol where every denominator is controlled (tỷ đồng, per quarter / balance). */
  function enterprise(balance2024: Fields, income2024: Fields, cash2024: Fields = {}) {
    const base = synthetic({
      2023: {
        income: { isa3: 100, isa4: -80, isa5: 20, isa16: 10, isa22: 8, isa8: -2 },
        balance: {
          bsa2: 50,
          bsa5: 0,
          bsa15: 40,
          bsa53: 500,
          bsa56: 30,
          bsa71: 20,
          bsa78: 200,
          bsa58: 0,
        },
      },
      2024: {
        income: { isa3: 100, isa4: -80, isa5: 20, isa16: 10, isa22: 8, isa8: -2, ...income2024 },
        balance: {
          bsa2: 50,
          bsa5: 0,
          bsa15: 40,
          bsa53: 500,
          bsa56: 30,
          bsa71: 20,
          bsa78: 200,
          bsa58: 0,
          ...balance2024,
        },
      },
    });
    base.CASH_FLOW.quarters = base.INCOME_STATEMENT.quarters.map((row) => ({
      year_report: row.year_report,
      length_report: row.length_report,
      public_date: row.public_date,
      cfa1: 10 * B,
      cfa2: 5 * B,
      cfa18: 12 * B,
      cfa32: -2 * B,
      ...Object.fromEntries(
        Object.entries(cash2024).map(([key, value]) => [
          key,
          row.year_report === 2024 ? value * B : 5 * B,
        ]),
      ),
    }));
    return base;
  }

  const ICB_GAS = { lv2: '7500', lv4: '7573' };

  async function oneChart(data: Sections, name: string, icb: IcbCodes = ICB_GAS) {
    ICB.TEST = icb;
    const response = await serviceFor({ TEST: data }).fundamental('TEST', {
      charts: name,
      per: 'q',
    });
    return response.charts[name] as DashboardChartPayload;
  }

  it('allows a negative net cash over equity (net debt) and leaves a non-positive equity empty', async () => {
    const indebted = await oneChart(enterprise({ bsa2: 10, bsa56: 300 }, {}), 'Tiền ròng / VCSH');
    expect(lastQ(indebted)).toBeCloseTo(((10 - 300 - 20) / 200) * 100, 9);
    const negativeEquity = await oneChart(enterprise({ bsa78: -5 }, {}), 'Tiền ròng / VCSH');
    expect(lastQ(negativeEquity)).toBeNull();
  });

  it('leaves the financial income over a negative profit before tax empty', async () => {
    const chart = await oneChart(
      enterprise({}, { isa16: -10, isa6: 3 }),
      'Thu nhập tài chính / LNTT',
    );
    expect(lastQ(chart)).toBeNull();
  });

  it('leaves the payout empty when the profit of the previous year is not positive', async () => {
    const data = enterprise({}, {});
    for (const row of data.INCOME_STATEMENT.quarters)
      if (row.year_report === 2023) row.isa22 = -1 * B;
    const chart = await oneChart(data, 'Tỷ lệ chi trả cổ tức');
    expect(lastQ(chart)).toBeNull();
  });

  it('leaves the buyer prepayment growth empty when the same period a year earlier is 0', async () => {
    const chart = await oneChart(
      enterprise({ bsa58: 40 }, {}),
      'Tăng trưởng người mua trả tiền trước',
      { lv2: '8600', lv4: '8633' },
    );
    expect(chart.q!.sub!.series[0]!.v.at(-1)).toBeCloseTo(40, 9);
    expect(lastQ(chart)).toBeNull();
  });

  it('shows a zero interest paid as 0, not empty, on an indirect-method statement', async () => {
    const chart = await oneChart(
      enterprise({}, {}, { cfa14: 0 }),
      'Lãi vay đã trả / Chi phí lãi vay',
      { lv2: '8600', lv4: '8633' },
    );
    expect(lastQ(chart)).toBe(0);
  });
});
