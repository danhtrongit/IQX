import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DASHBOARD_INDUSTRY_CHARTS } from '../../src/modules/dashboard/dashboard.catalog.js';
import {
  INDUSTRY_MAPPINGS,
  industryConcepts,
  industryFieldMap,
  normalizeIndustryStatements,
} from '../../src/modules/dashboard/dashboard.mapping.js';
import type { DashboardSettingsStore } from '../../src/modules/dashboard/dashboard.repository.js';
import type { DashboardChartPayload } from '../../src/modules/dashboard/dashboard.series.js';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import type { Industry } from '../../src/modules/financials/financials.industry.js';
import type { VciMarketProvider } from '../../src/modules/market-data/index.js';
import type { MarketDataService } from '../../src/modules/market-data/market-data.service.js';

type Row = Record<string, unknown>;
type Fields = Record<string, number>;

/** 1 tỷ đồng: the fixtures are written in tỷ đồng and stored in đồng, as VCI does. */
const B = 1e9;

/** Per-quarter flows and end-of-quarter balances of one fiscal year of a fixture company. */
interface YearFixture {
  income: Fields;
  balance: Fields;
  /** Cash-flow lines of the quarter; most industry fixtures do not need them. */
  cash?: Fields;
}

const scale = (fields: Fields): Fields =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value * B]));

/** A quarter is published about two weeks after its end: always before the test's "now". */
function meta(year: number, quarter: number) {
  const publishedYear = quarter === 4 ? year + 1 : year;
  const month = String((quarter % 4) * 3 + 1).padStart(2, '0');
  return {
    year_report: year,
    length_report: quarter,
    public_date: `${publishedYear}-${month}-15T00:00:00`,
  };
}

/** Two fiscal years of four identical quarters each, enough for the 4-quarter windows and YoY. */
function sections(years: Record<number, YearFixture>) {
  const income: Row[] = [];
  const balance: Row[] = [];
  const cash: Row[] = [];
  for (const [year, fixture] of Object.entries(years)) {
    for (const quarter of [1, 2, 3, 4]) {
      income.push({ ...meta(Number(year), quarter), ...scale(fixture.income) });
      balance.push({ ...meta(Number(year), quarter), ...scale(fixture.balance) });
      if (fixture.cash) cash.push({ ...meta(Number(year), quarter), ...scale(fixture.cash) });
    }
  }
  return {
    BALANCE_SHEET: { years: [], quarters: balance },
    INCOME_STATEMENT: { years: [], quarters: income },
    CASH_FLOW: { years: [], quarters: cash },
  };
}

function service(years: Record<number, YearFixture>) {
  const data = sections(years);
  const vci = {
    fetchFinancialRaw: async (_symbol: string, section: keyof typeof data) => ({
      data: data[section],
      rawEndpoint: 'fake',
    }),
    fetchShareEvents: async () => ({ data: [], rawEndpoint: 'fake' }),
    fetchFinancialReport: async () => ({ data: [], rawEndpoint: 'fake' }),
  } as unknown as VciMarketProvider;
  const market = {
    ohlcv: async () => ({
      data: [],
      meta: {
        source: 'fake',
        source_priority: 1,
        fallback_used: false,
        as_of: '',
        raw_endpoint: '',
      },
    }),
  } as unknown as MarketDataService;
  const store = { findAll: async () => ({}), save: async () => null } as unknown as DashboardSettingsStore;
  return new DashboardService(vci, market, store);
}

const chartOf = (response: { charts: Record<string, unknown> }, name: string) =>
  response.charts[name] as DashboardChartPayload;

/** Last quarter (Q4/24) and last year (2024) of the main line(s) / bars of a chart. */
const lastQuarter = (chart: DashboardChartPayload, line = 0) => chart.q!.main[line]!.v.at(-1);
const lastYear = (chart: DashboardChartPayload, line = 0) => chart.y!.main[line]!.v.at(-1);
const lastBar = (chart: DashboardChartPayload, bar: number, mode: 'q' | 'y' = 'q') =>
  chart[mode]!.sub!.series[bar]!.v.at(-1);

// ---------------------------------------------------------------------------------------------
// Bank (VCB, MBB, EVF): credit-institution template isb* / bsb*
// ---------------------------------------------------------------------------------------------

/**
 * Per quarter: interest income 50 → 60, interest expense -30 → -35, net interest income 20 → 25,
 * TOI 26 → 32, opex -10 → -13, pre-provision profit 16 → 19, provision -3 → -4. Balances at the
 * end of the quarter (tỷ đồng): earning assets 2.500 → 3.050, interest-bearing 2.600 → 3.200,
 * loans 1.800 → 2.250, deposits 2.000 → 2.400.
 */
const BANK: Record<number, YearFixture> = {
  2023: {
    income: {
      isb25: 50,
      isb26: -30,
      isb27: 20,
      isb38: 26,
      isb39: -10,
      isb40: 16,
      isb41: -3,
      isa22: 10,
    },
    balance: {
      bsb98: 300,
      bsb99: 200,
      bsb104: 1800,
      bsb105: -36,
      bsb106: 200,
      bsb111: 50,
      bsb112: 250,
      bsb113: 2000,
      bsb115: 50,
      bsb116: 250,
      bsb265: 18,
      bsa53: 3250,
      bsa78: 260,
    },
  },
  2024: {
    income: {
      isb25: 60,
      isb26: -35,
      isb27: 25,
      isb38: 32,
      isb39: -13,
      isb40: 19,
      isb41: -4,
      isa22: 12,
    },
    balance: {
      bsb98: 400,
      bsb99: 200,
      bsb104: 2250,
      bsb105: -45,
      bsb106: 200,
      bsb111: 50,
      bsb112: 350,
      bsb113: 2400,
      bsb115: 50,
      bsb116: 350,
      bsb265: 22.5,
      bsa53: 3750,
      bsa78: 300,
    },
  },
};

describe('bank metrics (spec §8.3) on the credit-institution template', () => {
  it('computes NIM on the average earning assets (4 quarters, end and one year earlier)', async () => {
    const response = await service(BANK).fundamental('VCB', { charts: 'NIM', per: 'q' });
    expect(response.nganh).toBe('nh');
    const nim = chartOf(response, 'NIM');
    expect(nim.status).toBe('ok');
    expect(nim.unit).toBe('%');
    expect(nim.q!.labels).toHaveLength(8);
    expect(nim.q!.main[0]!.name).toBe('NIM (4 quý)');
    // 4 x 25 = 100 over the average of 3.050 and 2.500 = 2.775.
    expect(lastQuarter(nim)).toBeCloseTo((100 / 2775) * 100, 9);
    expect(lastBar(nim, 0)).toBeCloseTo(100, 9);
    // The first four quarters have no four-quarter window or no balance one year back: empty,
    // never 0. Q1/24 is the first with both: its window is Q2/23 to Q1/24 (20 + 20 + 20 + 25).
    expect(nim.q!.main[0]!.v.slice(0, 4).every((item) => item === null)).toBe(true);
    expect(nim.q!.main[0]!.v[4]).toBeCloseTo((85 / 2775) * 100, 9);
    // Year mode: the fiscal year 2024 over the average of the two year-ends.
    expect(nim.y!.labels).toEqual(['2023', '2024']);
    expect(lastYear(nim)).toBeCloseTo((100 / 2775) * 100, 9);
    expect(nim.y!.main[0]!.v[0]).toBeNull();
  });

  it('draws two lines for the asset yield and the cost of funds, with interest income and expense below', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'Lợi suất tài sản sinh lãi và chi phí vốn',
      per: 'q',
    });
    const chart = chartOf(response, 'Lợi suất tài sản sinh lãi và chi phí vốn');
    expect(chart.q!.main.map((line) => line.name)).toEqual([
      'Lợi suất tài sản sinh lãi',
      'Chi phí vốn',
    ]);
    expect(chart.y!.main).toHaveLength(2);
    // Yield: 4 x 60 = 240 over average earning assets 2.775; cost: 4 x 35 = 140 over average
    // interest-bearing liabilities (3.200 + 2.600) / 2 = 2.900.
    expect(lastQuarter(chart, 0)).toBeCloseTo((240 / 2775) * 100, 9);
    expect(lastQuarter(chart, 1)).toBeCloseTo((140 / 2900) * 100, 9);
    // The expense is reported negative by VCI and shown positive.
    expect(lastBar(chart, 0)).toBeCloseTo(240, 9);
    expect(lastBar(chart, 1)).toBeCloseTo(140, 9);
    expect(chart.q!.sub!.series.map((item) => item.name)).toEqual([
      'Thu nhập lãi 4 quý',
      'Chi phí lãi 4 quý',
    ]);
  });

  it('computes CIR = operating cost / TOI, the credit cost and the loan-book ratios', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'CIR,Chi phí tín dụng,Tỷ lệ dự phòng / Dư nợ,Lãi dự thu / Dư nợ',
      per: 'q',
    });
    // CIR: 4 x 13 = 52 over TOI 4 x 32 = 128.
    expect(lastQuarter(chartOf(response, 'CIR'))).toBeCloseTo((52 / 128) * 100, 9);
    // Credit cost: provisioning 4 x 4 = 16 over average loans (2.250 + 1.800) / 2 = 2.025.
    const credit = chartOf(response, 'Chi phí tín dụng');
    expect(lastQuarter(credit)).toBeCloseTo((16 / 2025) * 100, 9);
    expect(lastBar(credit, 0)).toBeCloseTo(16, 9);
    // Provision stock (reported negative) over gross loans at the quarter end: 45 / 2.250 = 2%.
    const provision = chartOf(response, 'Tỷ lệ dự phòng / Dư nợ');
    expect(lastQuarter(provision)).toBeCloseTo(2, 9);
    expect(lastBar(provision, 0)).toBeCloseTo(45, 9);
    // Accrued interest and fees receivable over loans: 22,5 / 2.250 = 1%.
    expect(lastQuarter(chartOf(response, 'Lãi dự thu / Dư nợ'))).toBeCloseTo(1, 9);
  });

  it('computes the non-interest income share on the quarter itself, not on four quarters', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'Tỷ trọng thu nhập ngoài lãi',
      per: 'q',
    });
    const share = chartOf(response, 'Tỷ trọng thu nhập ngoài lãi');
    // TOI 32, net interest income 25 → non-interest income 7 = 21,875% of TOI.
    expect(lastQuarter(share)).toBeCloseTo((7 / 32) * 100, 9);
    expect(share.q!.sub!.type).toBe('stacked');
    expect(share.q!.sub!.series.map((item) => item.name)).toEqual([
      'Thu nhập lãi thuần',
      'Thu nhập ngoài lãi',
    ]);
    expect(lastBar(share, 0)).toBeCloseTo(25, 9);
    expect(lastBar(share, 1)).toBeCloseTo(7, 9);
    // The first quarter already has a value: it needs no four-quarter window.
    expect(share.q!.main[0]!.v[0]).toBeCloseTo((6 / 26) * 100, 9);
  });

  it('computes the pre-provision profit growth against the same quarter one year earlier', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'Tăng trưởng lợi nhuận trước dự phòng',
      per: 'q',
    });
    const growth = chartOf(response, 'Tăng trưởng lợi nhuận trước dự phòng');
    expect(growth.kind).toBe('A');
    expect(lastQuarter(growth)).toBeCloseTo((19 / 16 - 1) * 100, 9);
    expect(growth.q!.sub!.series.map((item) => item.name)).toEqual([
      'Quý này',
      'Cùng kỳ năm trước',
    ]);
    expect(lastBar(growth, 0)).toBeCloseTo(19, 9);
    expect(lastBar(growth, 1)).toBeCloseTo(16, 9);
    // Year mode compares the two fiscal years: (4 x 19) / (4 x 16) − 1.
    expect(lastYear(growth)).toBeCloseTo((76 / 64 - 1) * 100, 9);
  });

  it('draws credit and deposit growth as two lines with both balances in nghìn tỷ đồng', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'Tăng trưởng tín dụng và huy động,LDR,VCSH / Tổng tài sản',
      per: 'q',
    });
    const growth = chartOf(response, 'Tăng trưởng tín dụng và huy động');
    expect(growth.q!.main.map((line) => line.name)).toEqual([
      'Tăng trưởng tín dụng',
      'Tăng trưởng huy động',
    ]);
    expect(lastQuarter(growth, 0)).toBeCloseTo((2250 / 1800 - 1) * 100, 9);
    expect(lastQuarter(growth, 1)).toBeCloseTo((2400 / 2000 - 1) * 100, 9);
    expect(growth.q!.sub!.unit).toBe('nghìn tỷ đồng');
    expect(lastBar(growth, 0)).toBeCloseTo(2.25, 9);
    expect(lastBar(growth, 1)).toBeCloseTo(2.4, 9);
    expect(growth.decimals).toBe(1);
    // LDR = loans / customer deposits at the quarter end.
    const ldr = chartOf(response, 'LDR');
    expect(lastQuarter(ldr)).toBeCloseTo((2250 / 2400) * 100, 9);
    expect(ldr.q!.sub!.unit).toBe('nghìn tỷ đồng');
    // Equity over total assets: 300 / 3.750 = 8%.
    expect(lastQuarter(chartOf(response, 'VCSH / Tổng tài sản'))).toBeCloseTo(8, 9);
  });

  it('names the revenue of a bank "TOI" and computes the common metrics on it', async () => {
    const response = await service(BANK).fundamental('VCB', {
      charts: 'Tăng trưởng doanh thu,Biên lợi nhuận ròng,Revenue CAGR 3Y',
      per: 'q',
    });
    const growth = chartOf(response, 'Tăng trưởng doanh thu');
    expect(growth.q!.sub!.series[0]!.name).toBe('TOI quý này');
    // TOI 32 against 26: +23,08% — the TOI line, not the net interest income.
    expect(lastQuarter(growth)).toBeCloseTo((32 / 26 - 1) * 100, 9);
    expect(chartOf(response, 'Biên lợi nhuận ròng').q!.main[0]!.name).toBe('LNST / TOI (4 quý)');
    expect(chartOf(response, 'Revenue CAGR 3Y').main![0]!.name).toBe('TOI');
  });

  it('leaves a metric empty and explains why when its balance line is missing', async () => {
    const noLoans: Record<number, YearFixture> = {
      2023: { ...BANK[2023]!, balance: { bsa53: 3250, bsa78: 260 } },
      2024: { ...BANK[2024]!, balance: { bsa53: 3750, bsa78: 300 } },
    };
    const response = await service(noLoans).fundamental('VCB', {
      charts: 'NIM,LDR',
      per: 'q',
    });
    for (const name of ['NIM', 'LDR']) {
      const chart = chartOf(response, name);
      expect(chart.status).toBe('missing');
      expect(chart.note).toBe('Chưa đủ số liệu báo cáo tài chính để tính chỉ tiêu');
      expect(chart.q!.main[0]!.v.every((item) => item === null)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Securities company (SSI, VND): template iss* / bss*
// ---------------------------------------------------------------------------------------------

/**
 * Per quarter, 2024: revenue 120 = brokerage 36 + margin 14 + proprietary 42 + other 28; operating
 * cost -66; brokerage cost -20; proprietary losses -12. Balances: margin loans 400 → 600, FVTPL 300
 * → 400, AFS 100 → 150, HTM 100 → 50, borrowings 500 → 800, equity 800 → 1.000.
 */
const SECURITIES: Record<number, YearFixture> = {
  2023: {
    income: {
      isa3: 100,
      isa4: -60,
      isa22: 20,
      iss42: 30,
      iss115: 20,
      iss119: 5,
      iss120: 12,
      iss121: 5,
      iss124: -6,
      iss128: -1,
      iss130: -1,
      iss132: -2,
      iss133: -18,
    },
    balance: {
      bss215: 400,
      bsa6: 300,
      bss216: 100,
      bsb108: 100,
      bsa56: 300,
      bsa71: 0,
      bss241: 50,
      bss242: 50,
      bsa173: 100,
      bsa53: 2000,
      bsa78: 800,
    },
  },
  2024: {
    income: {
      isa3: 120,
      isa4: -66,
      isa22: 24,
      iss42: 36,
      iss115: 30,
      iss119: 6,
      iss120: 14,
      iss121: 6,
      iss124: -8,
      iss128: -1,
      iss130: -1,
      iss132: -2,
      iss133: -20,
    },
    balance: {
      bss215: 600,
      bsa6: 400,
      bss216: 150,
      bsb108: 50,
      bsa56: 400,
      bsa71: 100,
      bss240: 20,
      bss241: 40,
      bss242: 40,
      bss243: 0,
      bss249: 20,
      bsa173: 100,
      bss250: 80,
      bsa53: 2800,
      bsa78: 1000,
    },
  },
};

describe('securities metrics (spec §8.4) on the securities template', () => {
  it('splits the revenue into four buckets that add up to the operating revenue', async () => {
    const response = await service(SECURITIES).fundamental('SSI', {
      charts: 'Cơ cấu doanh thu hoạt động',
      per: 'q',
    });
    expect(response.nganh).toBe('ck');
    const mix = chartOf(response, 'Cơ cấu doanh thu hoạt động');
    expect(mix.q!.sub!.type).toBe('stacked');
    expect(mix.q!.sub!.series.map((item) => item.name)).toEqual([
      'Môi giới',
      'Cho vay margin',
      'Tự doanh',
      'Ngân hàng đầu tư và khác',
    ]);
    const buckets = [0, 1, 2, 3].map((bar) => lastBar(mix, bar)!);
    expect(buckets[0]).toBeCloseTo(36, 9);
    expect(buckets[1]).toBeCloseTo(14, 9);
    expect(buckets[2]).toBeCloseTo(42, 9);
    expect(buckets[3]).toBeCloseTo(28, 9);
    expect(buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(120, 9);
    // The line is the proprietary-trading share of the quarter's revenue.
    expect(mix.q!.main[0]!.name).toBe('Tỷ trọng tự doanh');
    expect(lastQuarter(mix)).toBeCloseTo((42 / 120) * 100, 9);
    // Year mode: the whole fiscal year, again adding up to the year's revenue.
    const year = [0, 1, 2, 3].map((bar) => lastBar(mix, bar, 'y')!);
    expect(year.reduce((a, b) => a + b, 0)).toBeCloseTo(480, 9);
  });

  it('computes the operating margin and the cost ratio on four quarters of revenue', async () => {
    const response = await service(SECURITIES).fundamental('SSI', {
      charts: 'Biên lợi nhuận hoạt động,Chi phí hoạt động / Doanh thu hoạt động',
      per: 'q',
    });
    const margin = chartOf(response, 'Biên lợi nhuận hoạt động');
    // Revenue 4 x 120 = 480, cost 4 x 66 = 264, profit 216 → 45%.
    expect(lastQuarter(margin)).toBeCloseTo(45, 9);
    expect(lastBar(margin, 0)).toBeCloseTo(264, 9);
    expect(lastBar(margin, 1)).toBeCloseTo(216, 9);
    expect(margin.q!.sub!.type).toBe('stacked');
    expect(lastQuarter(chartOf(response, 'Chi phí hoạt động / Doanh thu hoạt động'))).toBeCloseTo(
      55,
      9,
    );
  });

  it('computes margin lending: growth, leverage on equity and yield on the average book', async () => {
    const response = await service(SECURITIES).fundamental('SSI', {
      charts: 'Tăng trưởng dư nợ cho vay,Dư nợ cho vay / VCSH,Lợi suất cho vay',
      per: 'q',
    });
    expect(lastQuarter(chartOf(response, 'Tăng trưởng dư nợ cho vay'))).toBeCloseTo(50, 9);
    const leverage = chartOf(response, 'Dư nợ cho vay / VCSH');
    expect(leverage.unit).toBe('lần');
    expect(leverage.decimals).toBe(2);
    expect(lastQuarter(leverage)).toBeCloseTo(0.6, 9);
    // Interest 4 x 14 = 56 over the average book (600 + 400) / 2 = 500.
    expect(lastQuarter(chartOf(response, 'Lợi suất cho vay'))).toBeCloseTo((56 / 500) * 100, 9);
  });

  it('computes brokerage margin, proprietary asset share and return, and borrowings over equity', async () => {
    const response = await service(SECURITIES).fundamental('SSI', {
      charts:
        'Biên lợi nhuận môi giới,Tỷ trọng tài sản tự doanh,Hiệu suất tự doanh,Nợ vay / VCSH',
      per: 'q',
    });
    // Brokerage: revenue 144 less cost 80 → 44,44%.
    expect(lastQuarter(chartOf(response, 'Biên lợi nhuận môi giới'))).toBeCloseTo(
      (64 / 144) * 100,
      9,
    );
    const share = chartOf(response, 'Tỷ trọng tài sản tự doanh');
    // FVTPL 400 + AFS 150 + HTM 50 = 600 of 2.800 total assets.
    expect(lastQuarter(share)).toBeCloseTo((600 / 2800) * 100, 9);
    expect(share.q!.sub!.series.map((item) => item.name)).toEqual(['FVTPL', 'AFS', 'HTM']);
    expect(lastBar(share, 0)).toBeCloseTo(400, 9);
    expect(lastBar(share, 1)).toBeCloseTo(150, 9);
    expect(lastBar(share, 2)).toBeCloseTo(50, 9);
    // Proprietary gains 4 x 42 less losses 4 x 12 = 120 over the average book (600 + 500) / 2.
    const trading = chartOf(response, 'Hiệu suất tự doanh');
    expect(lastQuarter(trading)).toBeCloseTo((120 / 550) * 100, 9);
    expect(lastBar(trading, 0)).toBeCloseTo(120, 9);
    // Borrowings: 400 + 100 + 20 + 40 + 40 + 0 + 20 + 100 + 80 = 800 over equity 1.000.
    const leverage = chartOf(response, 'Nợ vay / VCSH');
    expect(lastQuarter(leverage)).toBeCloseTo(0.8, 9);
    expect(lastBar(leverage, 0)).toBeCloseTo(800, 9);
    expect(leverage.legend_note).toContain('Nợ vay gồm vay, trái phiếu phát hành');
  });

  it('names the revenue of a securities company "Doanh thu hoạt động"', async () => {
    const response = await service(SECURITIES).fundamental('SSI', {
      charts: 'Tăng trưởng doanh thu',
      per: 'q',
    });
    const growth = chartOf(response, 'Tăng trưởng doanh thu');
    expect(growth.q!.sub!.series[0]!.name).toBe('Doanh thu hoạt động quý này');
    expect(lastQuarter(growth)).toBeCloseTo((120 / 100 - 1) * 100, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Insurer (BVH, BMI, PVI): template isi* / bsi*
// ---------------------------------------------------------------------------------------------

/**
 * Per quarter, 2024: gross written premium 300, net earned premium (revenue) 200, claims -120,
 * expenses (-4 -50 -36 +20 reinsurance commission) -70, underwriting profit 10 = 200 - 120 - 70;
 * so the combined ratio is (120 + 70) / 200 = 95% = 1 - 10 / 200. 2023: 240 / 180 / -100 / -62 / 18.
 */
const INSURER: Record<number, YearFixture> = {
  2023: {
    income: {
      isi51: 240,
      isi105: 180,
      isi111: -100,
      isi74: -3,
      isi75: -45,
      isi94: -32,
      isi106: 18,
      isi97: 18,
      isi100: 20,
      isa6: 25,
      isa22: 14,
    },
    balance: { bsa5: 400, bsa43: 1100, bsi202: 500, bsa53: 3000, bsa78: 1000 },
  },
  2024: {
    income: {
      isi51: 300,
      isi105: 200,
      isi111: -120,
      isi74: -4,
      isi75: -50,
      isi94: -36,
      isi106: 20,
      isi97: 10,
      isi100: 24,
      isa6: 30,
      isa22: 16,
    },
    balance: { bsa5: 500, bsa43: 1500, bsi202: 600, bsa53: 3600, bsa78: 1200 },
  },
};

describe('insurance metrics (spec §8.5) on the insurance template', () => {
  it('computes the gross premium growth on the quarter and the retention on four quarters', async () => {
    const response = await service(INSURER).fundamental('BVH', {
      charts: 'Tăng trưởng doanh thu phí bảo hiểm gốc,Tỷ lệ giữ lại',
      per: 'q',
    });
    expect(response.nganh).toBe('bh');
    const growth = chartOf(response, 'Tăng trưởng doanh thu phí bảo hiểm gốc');
    expect(lastQuarter(growth)).toBeCloseTo((300 / 240 - 1) * 100, 9);
    expect(lastBar(growth, 0)).toBeCloseTo(300, 9);
    expect(lastBar(growth, 1)).toBeCloseTo(240, 9);
    // Net premium 4 x 200 over gross premium 4 x 300.
    const retention = chartOf(response, 'Tỷ lệ giữ lại');
    expect(lastQuarter(retention)).toBeCloseTo((800 / 1200) * 100, 9);
    expect(lastBar(retention, 0)).toBeCloseTo(1200, 9);
    expect(lastBar(retention, 1)).toBeCloseTo(800, 9);
  });

  it('ties the loss ratio, expense ratio and combined ratio to the underwriting profit', async () => {
    const response = await service(INSURER).fundamental('BVH', {
      charts: 'Tỷ lệ bồi thường,Tỷ lệ chi phí,Combined ratio',
      per: 'q',
    });
    const loss = chartOf(response, 'Tỷ lệ bồi thường');
    const expense = chartOf(response, 'Tỷ lệ chi phí');
    const combined = chartOf(response, 'Combined ratio');
    expect(lastQuarter(loss)).toBeCloseTo((480 / 800) * 100, 9);
    // The net expense basis: (4 + 50 + 36 - 20) x 4 = 280 over net premium 800.
    expect(lastQuarter(expense)).toBeCloseTo((280 / 800) * 100, 9);
    expect(expense.legend_note).toContain('số thuần');
    expect(lastQuarter(combined)).toBeCloseTo(95, 9);
    // Combined ratio = loss + expense = 1 − underwriting profit / net premium (4 x 10 / 800).
    expect(lastQuarter(combined)).toBeCloseTo(
      lastQuarter(loss)! + lastQuarter(expense)!,
      9,
    );
    expect(lastQuarter(combined)).toBeCloseTo((1 - 40 / 800) * 100, 9);
    // Stacked bars in % under the line, a dashed reference at 100% above them (§9).
    expect(combined.ref).toBe(100);
    expect(combined.q!.sub!.unit).toBe('%');
    expect(combined.q!.sub!.type).toBe('stacked');
    expect(combined.q!.sub!.series.map((item) => item.name)).toEqual([
      'Tỷ lệ bồi thường',
      'Tỷ lệ chi phí',
    ]);
    expect(lastBar(combined, 0)).toBeCloseTo(60, 9);
    expect(lastBar(combined, 1)).toBeCloseTo(35, 9);
    expect(combined.y!.main[0]!.name).toBe('Combined ratio năm');
    expect(lastYear(combined)).toBeCloseTo(95, 9);
    // The 2023 year closes at (400 + 248) / 720 = 90%.
    expect(combined.y!.main[0]!.v[0]).toBeCloseTo(90, 9);
  });

  it('computes the investment yield on the average investments and the profit mix', async () => {
    const response = await service(INSURER).fundamental('BVH', {
      charts: 'Lợi suất đầu tư,Cơ cấu lợi nhuận',
      per: 'q',
    });
    // Financial income 4 x 30 over the average of 2.000 and 1.500.
    expect(lastQuarter(chartOf(response, 'Lợi suất đầu tư'))).toBeCloseTo((120 / 1750) * 100, 9);
    const mix = chartOf(response, 'Cơ cấu lợi nhuận');
    // Investment profit 4 x 24 = 96 of (insurance 4 x 10 + investment 96) = 70,59%.
    expect(lastQuarter(mix)).toBeCloseTo((96 / 136) * 100, 9);
    expect(lastBar(mix, 0)).toBeCloseTo(40, 9);
    expect(lastBar(mix, 1)).toBeCloseTo(96, 9);
  });

  it('leaves the profit mix empty when the insurance and investment profits sum to zero or less', async () => {
    const loss: Record<number, YearFixture> = {
      2023: INSURER[2023]!,
      2024: {
        ...INSURER[2024]!,
        income: { ...INSURER[2024]!.income, isi97: -50, isi100: 20 },
      },
    };
    const response = await service(loss).fundamental('BVH', {
      charts: 'Cơ cấu lợi nhuận',
      per: 'q',
    });
    const mix = chartOf(response, 'Cơ cấu lợi nhuận');
    // 4 x (−50 + 20) = −120: a share of a non-positive total means nothing (§10).
    expect(lastQuarter(mix)).toBeNull();
    expect(lastBar(mix, 0)).toBeCloseTo(-200, 9);
    expect(lastBar(mix, 1)).toBeCloseTo(80, 9);
  });

  it('computes the technical reserves over equity, empty for a life insurer that reports none', async () => {
    const response = await service(INSURER).fundamental('BMI', {
      charts: 'Dự phòng nghiệp vụ / VCSH',
      per: 'q',
    });
    const reserves = chartOf(response, 'Dự phòng nghiệp vụ / VCSH');
    expect(reserves.unit).toBe('lần');
    expect(lastQuarter(reserves)).toBeCloseTo(0.5, 9);
    expect(lastBar(reserves, 0)).toBeCloseTo(600, 9);
    expect(lastBar(reserves, 1)).toBeCloseTo(1200, 9);

    // BVH-like life insurer: bsi202 is 0, which means "not reported", never "no reserves".
    const life: Record<number, YearFixture> = {
      2023: { ...INSURER[2023]!, balance: { ...INSURER[2023]!.balance, bsi202: 0 } },
      2024: { ...INSURER[2024]!, balance: { ...INSURER[2024]!.balance, bsi202: 0 } },
    };
    const empty = chartOf(
      await service(life).fundamental('BVH', { charts: 'Dự phòng nghiệp vụ / VCSH', per: 'q' }),
      'Dự phòng nghiệp vụ / VCSH',
    );
    expect(empty.status).toBe('missing');
    expect(empty.note).toContain('không khai dòng dự phòng nghiệp vụ');
    expect(empty.q!.main[0]!.v.every((item) => item === null)).toBe(true);
  });

  it('names the revenue of an insurer "Phí bảo hiểm thuần" and computes the common metrics on it', async () => {
    const response = await service(INSURER).fundamental('BVH', {
      charts: 'Tăng trưởng doanh thu',
      per: 'q',
    });
    const growth = chartOf(response, 'Tăng trưởng doanh thu');
    expect(growth.q!.sub!.series[0]!.name).toBe('Phí bảo hiểm thuần quý này');
    expect(lastQuarter(growth)).toBeCloseTo((200 / 180 - 1) * 100, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Cross-industry rules
// ---------------------------------------------------------------------------------------------

describe('industry catalogue guard (spec §11)', () => {
  it.each<[string, Record<number, YearFixture>, Industry, string]>([
    ['bank', BANK, 'nh', 'Combined ratio'],
    ['securities', SECURITIES, 'ck', 'NIM'],
    ['insurer', INSURER, 'bh', 'Dư nợ cho vay / VCSH'],
  ])(
    'serves a %s only its own charts and refuses the charts of another industry with 400',
    async (_label, fixture, industry, foreign) => {
      const dashboard = service(fixture);
      const response = await dashboard.fundamental('XXX', { per: 'q' });
      expect(response.nganh).toBe(industry);
      expect(Object.keys(response.charts)).toEqual(
        DASHBOARD_INDUSTRY_CHARTS[industry].map((chart) => chart.name),
      );
      await expect(
        dashboard.fundamental('XXX', { charts: `ROE,${foreign}`, per: 'q' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        dashboard.fundamental('XXX', { charts: 'D/E', per: 'q' }),
      ).rejects.toMatchObject({ response: { code: 'CHART_NOT_IN_INDUSTRY' } });
    },
  );

  it('never returns a not-applicable card: every chart of an industry has a real payload', async () => {
    for (const fixture of [BANK, SECURITIES, INSURER]) {
      const response = await service(fixture).fundamental('XXX', { per: 'q' });
      for (const chart of Object.values(response.charts))
        expect(chart as object).not.toHaveProperty('na');
    }
  });
});

describe('industry statement mapping (spec §7)', () => {
  const rows = (income: Row, balance: Row = {}) => ({
    balance_sheet: { quarters: [{ ...meta(2024, 4), ...balance }], years: [] },
    income_statement: { quarters: [{ ...meta(2024, 4), ...income }], years: [] },
    cash_flow: { quarters: [], years: [] },
  });
  const asOf = new Date('2026-06-01T00:00:00Z');

  it('overrides the revenue line of each industry (TOI, operating revenue, net premium)', () => {
    const income = { isa3: 70, isb38: 40, isi105: 25 };
    const revenueOf = (industry: Industry) =>
      normalizeIndustryStatements(rows(income), asOf, industry).quarters[0]!.values.revenue;
    expect(revenueOf('thuong')).toBe(70);
    expect(revenueOf('nh')).toBe(40);
    expect(revenueOf('ck')).toBe(70);
    expect(revenueOf('bh')).toBe(25);
    expect(INDUSTRY_MAPPINGS.nh.revenue.field).toBe('isb38');
    expect(INDUSTRY_MAPPINGS.bh.revenue.field).toBe('isi105');
  });

  it('turns the costs VCI reports as negative numbers into positive amounts, never -0', () => {
    const statements = normalizeIndustryStatements(
      rows({ isb26: -30, isb39: 0, isb41: -4, isb27: 25 }),
      asOf,
      'nh',
    );
    const values = statements.quarters[0]!.values as Record<string, number>;
    expect(values.nh_interest_expense).toBe(30);
    expect(values.nh_provision_expense).toBe(4);
    expect(values.nh_net_interest_income).toBe(25);
    expect(Object.is(values.nh_opex, 0)).toBe(true);
    expect(Object.is(values.nh_opex, -0)).toBe(false);
  });

  it('adds up the lines of a derived concept and keeps it absent when none of them is reported', () => {
    const statements = normalizeIndustryStatements(
      rows(
        {},
        { bsb98: 300, bsb99: 200, bsb104: 1800, bsb106: 200, bsb111: 50, bsb113: 2000 },
      ),
      asOf,
      'nh',
    );
    const values = statements.quarters[0]!.values as Record<string, number | undefined>;
    expect(values.nh_earning_assets).toBe(2500);
    expect(values.nh_interest_bearing).toBe(2050);
    const empty = normalizeIndustryStatements(rows({}), asOf, 'nh').quarters[0]!.values as Record<
      string,
      number | undefined
    >;
    expect(empty.nh_earning_assets).toBeUndefined();
    expect(empty.nh_gross_loans).toBeUndefined();
  });

  it('never marks an industry statement as financial, so the shared formulas keep running', () => {
    for (const industry of ['thuong', 'nh', 'ck', 'bh'] as const)
      expect(normalizeIndustryStatements(rows({ isb27: 1 }), asOf, industry).financial).toBe(false);
  });

  it('sorts the industry concepts into flows (summed over four quarters) and balances (year end)', () => {
    expect(industryConcepts('thuong', 'flow')).toEqual([]);
    expect(industryConcepts('nh', 'flow')).toContain('nh_net_interest_income');
    expect(industryConcepts('nh', 'balance')).toContain('nh_gross_loans');
    expect(industryConcepts('ck', 'balance')).toContain('ck_margin_loans');
    expect(industryConcepts('bh', 'flow')).toContain('bh_underwriting_profit');
    expect(industryConcepts('bh', 'balance')).toEqual(['bh_investments', 'bh_reserves']);
    expect(Object.keys(industryFieldMap('nh'))).toContain('revenue');
  });
});

// ---------------------------------------------------------------------------------------------
// Window length (spec §12.10): every chart of the four industries, in quarter and in year mode
// ---------------------------------------------------------------------------------------------

describe('window length with a long history (spec §12.10)', () => {
  /** An enterprise company (template isa* / bsa*): the dashboard falls back to it when nothing else fits. */
  const ENTERPRISE: YearFixture = {
    income: {
      isa3: 1000,
      isa4: -600,
      isa5: 400,
      isa8: -10,
      isa16: 120,
      isa19: -20,
      isa20: 100,
      isa22: 100,
    },
    balance: {
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
    },
    cash: { cfa2: 5, cfa18: 90, cfa19: -20 },
  };

  /**
   * The lines the common chapter reads on every template: net profit, parent equity (equity less
   * minorities and preferred shares) and the charter capital that gives the share count and EPS.
   * A fixture keeps its own value where it already reports the line.
   */
  const withCommonLines = (year: YearFixture): YearFixture => ({
    ...year,
    income: { isa20: 10, isa22: 10, ...year.income },
    balance: { bsa53: 3000, bsa78: 300, bsa80: 100, bsa174: 0, bsa210: 0, ...year.balance },
  });

  /** Twelve fiscal years of the same figures: 48 quarters, more than any chart ever draws. */
  const longHistory = (year: YearFixture): Record<number, YearFixture> =>
    Object.fromEntries(Array.from({ length: 12 }, (_, index) => [2013 + index, withCommonLines(year)]));

  /** Window of the year-fixed kinds (spec §9): CAGR 4 years, stability 5, streak 7. */
  const FIXED_YEARS: Record<string, number> = { D: 4, E1: 5, E2: 7 };

  it.each<[Industry, YearFixture]>([
    ['thuong', ENTERPRISE],
    ['nh', BANK[2024]!],
    ['ck', SECURITIES[2024]!],
    ['bh', INSURER[2024]!],
  ])('draws 20 quarters and 10 years for every chart of %s', async (industry, fixture) => {
    const response = await service(longHistory(fixture)).fundamental('XXX', { per: 'q' });
    expect(response.nganh).toBe(industry);
    const names = Object.keys(response.charts);
    expect(names).toEqual(DASHBOARD_INDUSTRY_CHARTS[industry].map((chart) => chart.name));

    for (const name of names) {
      const chart = chartOf(response, name);
      // The daily valuation charts take their series from the valuation endpoint, not from here.
      if (chart.kind === 'F') continue;
      if (chart.kind === 'D' || chart.kind === 'E1' || chart.kind === 'E2') {
        expect(chart.labels, name).toHaveLength(FIXED_YEARS[chart.kind]!);
        continue;
      }
      // Quarter and year mode both carry the full window, on the lines and on the bars below.
      for (const [mode, length] of [
        ['q', 20],
        ['y', 10],
      ] as const) {
        const block = chart[mode]!;
        expect(block.labels, `${name} ${mode}`).toHaveLength(length);
        for (const line of block.main) expect(line.v, `${name} ${mode}`).toHaveLength(length);
        for (const bar of block.sub?.series ?? []) expect(bar.v, `${name} ${mode}`).toHaveLength(length);
      }
    }
  });

  it.each<[Industry, YearFixture]>([
    ['thuong', ENTERPRISE],
    ['nh', BANK[2024]!],
    ['ck', SECURITIES[2024]!],
    ['bh', INSURER[2024]!],
  ])('computes every chart of %s with real values, never an empty card', async (_industry, fixture) => {
    const response = await service(longHistory(fixture)).fundamental('XXX', { per: 'q' });
    const empty: string[] = [];
    for (const [name, raw] of Object.entries(response.charts)) {
      const chart = raw as DashboardChartPayload;
      if (chart.kind === 'F') continue;
      if (chart.status !== 'ok') empty.push(`${name}: ${chart.status}`);
      else if (chart.q) {
        // A constant history is the easy case: the newest quarter and year always have a value.
        expect(chart.q.main[0]!.v.at(-1), `${name} q`).not.toBeNull();
        expect(chart.y!.main[0]!.v.at(-1), `${name} y`).not.toBeNull();
      }
    }
    // The only chart that needs the market price (no quotes in this fixture) is the PEG.
    expect(empty).toEqual(['PEG: missing']);
  });
});
