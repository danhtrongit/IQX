/**
 * Số liệu Dashboard phân tích: dựng chuỗi kỳ cho 62 chỉ tiêu theo khuôn biểu đồ (spec §8–§10).
 *
 * Công thức KHÔNG được viết lại cho 33 chỉ tiêu của registry Bộ lọc: chúng chạy qua
 * `evaluateScreenerMetric` / `calculateMetric` của `modules/screener`, nên số liệu khớp đúng công
 * thức đang dùng trong sản phẩm (với dòng "Doanh thu" riêng của từng ngành, §8.1). 29 chỉ tiêu
 * mới của ngân hàng, chứng khoán, bảo hiểm tính ở `dashboard.native.ts` trên cùng cửa sổ kỳ. Phần
 * làm ở đây là:
 *  - dựng lịch sử kỳ (20 quý / 10 năm) và các số thành phần đi kèm (cột dưới đường chính);
 *  - quy đổi đơn vị: tỷ đồng, nghìn tỷ đồng (VCI báo cáo bằng đồng), % và điểm % (phần trăm), lần,
 *    ngày, đồng/CP (EPS điều chỉnh tách/thưởng của `withShareHistory`);
 *  - quy tắc §10: kỳ không tính được thì để trống (null), không vẽ số 0.
 */
import type { Industry } from '../financials/financials.industry.js';
import {
  calculateMetric,
  METRIC_REASONS,
  metricSupport,
  type MetricStatus,
} from '../screener/screener.metrics.js';
import {
  fundamentalMetric,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from '../screener/screener.registry.js';
import { periodEnd } from '../screener/screener.shares.js';
import {
  evaluateScreenerMetric,
  nopatOf,
  type MarketInputs,
  type NormalizedStatements,
  type StatementPeriod,
} from '../screener/screener.statements.js';
import {
  DASHBOARD_MAX_QUARTERS,
  DASHBOARD_MAX_YEARS,
  dashboardDecimals,
  dashboardUnit,
  type DashboardChartKind,
  type DashboardChartSpec,
  type DashboardSubType,
  type NativeMetricId,
} from './dashboard.catalog.js';
import { industryConcepts, type DashboardConcept } from './dashboard.mapping.js';
import { NATIVE_METRICS } from './dashboard.native.js';

/** VCI báo cáo tài chính bằng đồng; Dashboard hiển thị tỷ đồng hoặc nghìn tỷ đồng. */
const VND_PER_BILLION = 1_000_000_000;
/** Chia cho đơn vị này để ra đơn vị của cột bên dưới (cột đã ở đơn vị hiển thị thì không có mặt). */
const SUB_UNIT_DIVISOR: Readonly<Record<string, number>> = {
  'tỷ đồng': VND_PER_BILLION,
  'nghìn tỷ đồng': VND_PER_BILLION * 1000,
};
/** Số ngày của một năm (DIO/DSO/DPO — công thức CCC của registry). */
const DAYS_PER_YEAR = 365;

/** Concepts that are flows: a fiscal year is their sum over the four quarters. */
const FLOW_CONCEPTS: readonly DashboardConcept[] = [
  'revenue',
  'cogs',
  'gross_profit',
  'interest_expense',
  'pbt',
  'income_tax',
  'npat',
  'npat_parent',
  'depreciation',
  'goodwill_amortization',
  'cfo',
  'capex',
  'share_issuance',
  'share_buyback',
  'eps',
];

/** Concepts that are balances: a fiscal year keeps the end-of-year value. */
const BALANCE_CONCEPTS: readonly DashboardConcept[] = [
  'current_assets',
  'cash',
  'st_investments',
  'receivables',
  'inventory',
  'total_assets',
  'current_liabilities',
  'st_debt',
  'payables',
  'lt_debt',
  'equity',
  'preferred_equity',
  'nci',
  'charter_capital',
  'shares',
];

type ConceptValues = Partial<Record<DashboardConcept, number>>;

/** Số liệu của một kỳ ở dạng khoản mục của Dashboard (gồm cả khoản mục riêng của ngành). */
const valuesOf = (period: StatementPeriod): ConceptValues => period.values;

export interface DashboardWindow {
  /** Label of the period ("Q2/26" / "2025"). */
  label: string;
  /** Value of the current discrete period (the quarter itself, or the whole fiscal year). */
  point(concept: DashboardConcept): number | null;
  /** Flow of the window (four quarters / one fiscal year). */
  flow(concept: DashboardConcept): number | null;
  /** Balance at the end of the window. */
  end(concept: DashboardConcept): number | null;
  /** Balance at the start of the window (the same balance one year earlier). */
  start(concept: DashboardConcept): number | null;
  /** The same window one year earlier (null when the history is shorter). */
  previous: DashboardWindow | null;
}

export interface DashboardSeriesData {
  labels: string[];
  main: { name: string; v: (number | null)[] }[];
  sub?: {
    unit: string;
    type: DashboardSubType;
    series: { name: string; v: (number | null)[] }[];
  };
}

export interface DashboardFixedData {
  labels: string[];
  main: { name: string; v: (number | null)[] }[];
  mainUnit: string;
  hero: number | null;
}

export interface DashboardChartPayload {
  name: string;
  kind: DashboardChartKind;
  unit: string;
  decimals: number;
  /** Status of the indicator (the same enum as the Bộ lọc). */
  status: MetricStatus;
  /** Why the chart is empty (display only). */
  note?: string;
  /** Definition note shown with the legend, e.g. what "tiền" covers (DB-06). */
  legend_note?: string;
  /** Quarter mode (kinds A/B/C/F2); `main` has two lines for the indicators of §9. */
  q?: DashboardSeriesData;
  /** Year mode (kinds A/B/C/F2). */
  y?: DashboardSeriesData;
  /** Year-fixed kinds (D/E1/E2). */
  labels?: string[];
  main?: { name: string; v: (number | null)[] }[];
  mainUnit?: string;
  hero?: number | null;
  /** Fixed reference line (kind F2: PEG = 1; kind B: combined ratio = 100). */
  ref?: number;
  /** Daily series of a kind-F chart; the fundamental endpoint leaves it empty. */
  v?: (number | null)[];
}

const ordinal = (p: StatementPeriod) => p.year * 4 + (p.quarter ?? 1) - 1;

const quarterLabel = (p: StatementPeriod) => `Q${p.quarter ?? 1}/${String(p.year).slice(2)}`;
const yearLabel = (p: StatementPeriod) => String(p.year);

const value = (p: StatementPeriod | null | undefined, concept: DashboardConcept): number | null =>
  (p ? valuesOf(p)[concept] : undefined) ?? null;

const average = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : (a + b) / 2;

const sum = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b;

/** VND → billion VND (the unit of the bars). */
export const toBillion = (v: number | null): number | null =>
  v === null ? null : v / VND_PER_BILLION;

/**
 * Registry formula value → display unit: a ratio travels as a fraction, the dashboard shows
 * percentage points ("%"/"điểm %"); "lần"/"ngày"/"năm" are unchanged.
 */
export function displayValue(metricId: ScreenerMetricId, raw: number | null): number | null {
  if (raw === null) return null;
  return fundamentalMetric(metricId).api_unit === 'ratio' ? raw * 100 : raw;
}

/**
 * Fiscal-year rows of the dashboard: flows are the sum of the four quarters, balances are the
 * end-of-year values, and a year without its four quarters is left out (spec §8). The concepts of
 * the industry template (`dashboard.mapping.ts`) follow the same rule by their kind.
 */
export function annualStatements(
  statements: NormalizedStatements,
  industry: Industry = 'thuong',
): NormalizedStatements {
  const flows: readonly DashboardConcept[] = [...FLOW_CONCEPTS, ...industryConcepts(industry, 'flow')];
  const balances: readonly DashboardConcept[] = [
    ...BALANCE_CONCEPTS,
    ...industryConcepts(industry, 'balance'),
  ];
  const byYear = new Map<number, StatementPeriod[]>();
  for (const quarter of statements.quarters) {
    if (quarter.quarter === null) continue;
    const list = byYear.get(quarter.year) ?? [];
    list.push(quarter);
    byYear.set(quarter.year, list);
  }
  const published = new Map(statements.years.map((year) => [year.year, year]));
  const latestDate = (rows: StatementPeriod[], field: 'published_at' | 'updated_at') =>
    rows
      .map((row) => row[field])
      .filter((item): item is string => item !== null)
      .sort()
      .at(-1) ?? null;
  const years: StatementPeriod[] = [];
  for (const year of [...byYear.keys()].sort((a, b) => b - a)) {
    const quarters = [1, 2, 3, 4].map((q) =>
      byYear.get(year)?.find((period) => period.quarter === q),
    );
    if (quarters.some((period) => period === undefined)) continue;
    const rows = quarters as StatementPeriod[];
    const values: ConceptValues = {};
    for (const concept of flows) {
      let total = 0;
      let complete = true;
      for (const row of rows) {
        const current = valuesOf(row)[concept];
        if (current === undefined) {
          complete = false;
          break;
        }
        total += current;
      }
      if (complete) values[concept] = total;
    }
    const last = rows[3]!;
    for (const concept of balances) {
      const current = valuesOf(last)[concept];
      if (current !== undefined) values[concept] = current;
    }
    const annual = published.get(year);
    years.push({
      year,
      quarter: null,
      values,
      published_at: annual?.published_at ?? latestDate(rows, 'published_at'),
      updated_at: annual?.updated_at ?? latestDate(rows, 'updated_at'),
    });
  }
  return { years, quarters: statements.quarters, financial: statements.financial };
}

/**
 * Statements seen "as of" one quarter: the target quarter becomes the latest one, the rest of the
 * history stays reachable (the four quarters of the TTM window and the balance one year back).
 */
export function sliceQuarters(
  statements: NormalizedStatements,
  index: number,
): NormalizedStatements {
  const target = statements.quarters[index];
  if (!target) return statements;
  return {
    ...statements,
    quarters: [target, ...statements.quarters.filter((_, i) => i !== index)],
  };
}

/** Statements seen "as of" one fiscal year (same idea as `sliceQuarters`). */
export function sliceYears(statements: NormalizedStatements, index: number): NormalizedStatements {
  const target = statements.years[index];
  if (!target) return statements;
  return {
    ...statements,
    years: [target, ...statements.years.filter((_, i) => i !== index)],
  };
}

/** Index of the quarter `back` quarters before the quarter at `index` (-1 when missing). */
function quarterIndexAt(statements: NormalizedStatements, index: number, back: number): number {
  const current = statements.quarters[index];
  if (!current) return -1;
  const target = ordinal(current) - back;
  return statements.quarters.findIndex((period) => ordinal(period) === target);
}

/** Window of one quarter: the four quarters ending at it (TTM) and the balance one year back. */
export function quarterWindow(
  statements: NormalizedStatements,
  index: number,
): DashboardWindow | null {
  const current = statements.quarters[index];
  if (!current) return null;
  const windowIndexes = [0, 1, 2, 3].map((back) => quarterIndexAt(statements, index, back));
  const complete = windowIndexes.every((item) => item >= 0);
  const startIndex = quarterIndexAt(statements, index, 4);
  const flow = (concept: DashboardConcept): number | null => {
    if (!complete) return null;
    let total = 0;
    for (const item of windowIndexes) {
      const current = valuesOf(statements.quarters[item]!)[concept];
      if (current === undefined) return null;
      total += current;
    }
    return total;
  };
  return {
    label: quarterLabel(current),
    point: (concept) => value(current, concept),
    flow,
    end: (concept) => value(current, concept),
    start: (concept) =>
      startIndex >= 0 ? value(statements.quarters[startIndex], concept) : null,
    previous: startIndex >= 0 ? quarterWindow(statements, startIndex) : null,
  };
}

/** Window of one fiscal year: the whole year as flow, the year-end as balance. */
export function yearWindow(statements: NormalizedStatements, index: number): DashboardWindow | null {
  const current = statements.years[index];
  if (!current) return null;
  const previousIndex = statements.years.findIndex((period) => period.year === current.year - 1);
  const previous = previousIndex >= 0 ? statements.years[previousIndex] : null;
  return {
    label: yearLabel(current),
    point: (concept) => value(current, concept),
    flow: (concept) => value(current, concept),
    end: (concept) => value(current, concept),
    start: (concept) => value(previous, concept),
    previous: previousIndex >= 0 ? yearWindow(statements, previousIndex) : null,
  };
}

/** Debt of a balance: short-term + long-term borrowings (the registry's definition). */
const debtOf = (window: DashboardWindow): number | null =>
  sum(window.end('st_debt'), window.end('lt_debt'));

/** Cash that can pay debt: cash and cash equivalents + short-term investments. */
const eligibleCashOf = (window: DashboardWindow): number | null =>
  sum(window.end('cash'), window.end('st_investments'));

/** EBITDA of a flow window (the registry's definition). */
const ebitdaOf = (window: DashboardWindow): number | null => {
  const goodwill = window.flow('goodwill_amortization');
  const base = sum(
    sum(window.flow('pbt'), window.flow('interest_expense')),
    window.flow('depreciation'),
  );
  return sum(base, goodwill ?? 0);
};

/** Free cash flow of a flow window: CFO − capex. */
const fcfOf = (window: DashboardWindow): number | null => {
  const capex = window.flow('capex');
  return sum(window.flow('cfo'), capex === null ? null : -capex);
};

export interface CccParts {
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  ccc: number | null;
}

/**
 * Cash conversion cycle of a window, with the registry formula:
 * DIO + DSO − DPO (days). A missing input or a non-positive revenue/cogs leaves it empty (§10).
 */
export function cccParts(window: DashboardWindow): CccParts {
  const revenue = window.flow('revenue');
  const cogs = window.flow('cogs');
  const inventory = average(window.end('inventory'), window.start('inventory'));
  const receivables = average(window.end('receivables'), window.start('receivables'));
  const payables = average(window.end('payables'), window.start('payables'));
  if ([revenue, cogs, inventory, receivables, payables].some((item) => item === null))
    return { dio: null, dso: null, dpo: null, ccc: null };
  if (revenue! <= 0 || cogs! <= 0) return { dio: null, dso: null, dpo: null, ccc: null };
  const dio = (inventory! / cogs!) * DAYS_PER_YEAR;
  const dso = (receivables! / revenue!) * DAYS_PER_YEAR;
  const dpo = (payables! / cogs!) * DAYS_PER_YEAR;
  return { dio, dso, dpo, ccc: dio + dso - dpo };
}

/**
 * PEG (spec §8.6, §10): empty when the EPS growth is below 5% or the P/E is negative — a growth
 * close to zero makes PEG explode and breaks the chart.
 * `epsGrowth` is a ratio (0.05 = 5%).
 */
export function pegValue(pe: number | null, epsGrowth: number | null): number | null {
  if (pe === null || epsGrowth === null) return null;
  if (pe <= 0) return null;
  if (epsGrowth < 0.05) return null;
  return pe / (epsGrowth * 100);
}

/** Tên một chuỗi theo chế độ Quý/Năm. */
interface PeriodNames {
  q: readonly string[];
  y: readonly string[];
}

/**
 * "Doanh thu" của từng ngành (spec §8.1): tên đường và cột ghi đúng loại doanh thu, ví dụ "TOI
 * quý này", "LNST / Phí bảo hiểm thuần (4 quý)". `title` đứng đầu câu, `inline` đứng giữa câu.
 */
export const REVENUE_LABELS: Readonly<Record<Industry, { title: string; inline: string }>> = {
  thuong: { title: 'Doanh thu', inline: 'doanh thu' },
  nh: { title: 'TOI', inline: 'TOI' },
  ck: { title: 'Doanh thu hoạt động', inline: 'doanh thu hoạt động' },
  bh: { title: 'Phí bảo hiểm thuần', inline: 'phí bảo hiểm thuần' },
};

/** Name of the main line of every registry indicator (spec §8). */
const MAIN_NAMES: Readonly<Partial<Record<ScreenerMetricId, { q: string; y: string }>>> = {
  revenue_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  profit_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  eps_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  gross_margin: { q: 'Biên gộp (4 quý)', y: 'Biên gộp năm' },
  // DB-06: ROE = LNST cổ đông công ty mẹ / VCSH cổ đông công ty mẹ bình quân.
  roe: { q: 'ROE (4 quý, cổ đông công ty mẹ)', y: 'ROE năm (cổ đông công ty mẹ)' },
  roa: { q: 'ROA (4 quý)', y: 'ROA năm' },
  roic: { q: 'ROIC (4 quý)', y: 'ROIC năm' },
  asset_turnover: { q: 'Vòng quay tài sản (4 quý)', y: 'Vòng quay tài sản năm' },
  ccc: { q: 'CCC', y: 'CCC' },
  debt_equity: { q: 'Nợ vay / VCSH', y: 'Nợ vay / VCSH cuối năm' },
  current_ratio: { q: 'Current Ratio', y: 'Current Ratio cuối năm' },
  interest_coverage: { q: 'EBIT / lãi vay (4 quý)', y: 'EBIT / lãi vay năm' },
  net_debt_ebitda: { q: 'Nợ ròng / EBITDA', y: 'Nợ ròng / EBITDA năm' },
  cfo_margin: { q: 'CFO / doanh thu (4 quý)', y: 'CFO / doanh thu năm' },
  cfo_profit: { q: 'CFO / LNST (4 quý)', y: 'CFO / LNST năm' },
  capex_revenue: { q: 'Capex / doanh thu (4 quý)', y: 'Capex / doanh thu năm' },
  fcf_margin: { q: 'FCF / doanh thu (4 quý)', y: 'FCF / doanh thu năm' },
  peg: { q: 'PEG cuối quý', y: 'PEG cuối năm' },
  eps_cagr3: { q: 'EPS', y: 'EPS' },
  profit_cagr3: { q: 'LNST', y: 'LNST' },
  profit_positive_streak: { q: 'LNST năm', y: 'LNST năm' },
  fcf_positive_streak: { q: 'FCF năm', y: 'FCF năm' },
  net_margin_stability: { q: 'Biên ròng năm', y: 'Biên ròng năm' },
  eps_growth_stability: { q: 'EPS năm', y: 'EPS năm' },
  roic_stability: { q: 'ROIC năm', y: 'ROIC năm' },
};

/** Chú giải định nghĩa đi kèm chú thích của một chỉ tiêu registry (DB-06). */
const LEGEND_NOTES: Readonly<Partial<Record<ScreenerMetricId, string>>> = {
  net_debt_ebitda: 'Tiền gồm đầu tư tài chính ngắn hạn',
};

/** Tên đường chính của một chỉ tiêu registry; các chỉ tiêu theo "doanh thu" đổi tên theo ngành. */
function mainNameOf(metricId: ScreenerMetricId, industry: Industry): { q: string; y: string } {
  const revenue = REVENUE_LABELS[industry];
  switch (metricId) {
    case 'net_margin':
      return industry === 'thuong'
        ? { q: 'Biên ròng (4 quý)', y: 'Biên ròng năm' }
        : { q: `LNST / ${revenue.title} (4 quý)`, y: `LNST / ${revenue.title} năm` };
    case 'revenue_cagr3':
      return { q: revenue.title, y: revenue.title };
    case 'revenue_growth_stability': {
      const name = `Tăng trưởng ${revenue.inline} năm`;
      return { q: name, y: name };
    }
    default: {
      const names = MAIN_NAMES[metricId];
      if (!names) throw new Error(`Dashboard: chỉ tiêu ${metricId} chưa có tên đường chính`);
      return names;
    }
  }
}

/** Period used in the quarter mode of every registry indicator (the registry's own periods). */
const QUARTER_PERIOD: Readonly<Partial<Record<ScreenerMetricId, ScreenerPeriod>>> = {
  revenue_yoy: 'quarter',
  profit_yoy: 'quarter',
  eps_yoy: 'quarter',
  debt_equity: 'quarter',
  current_ratio: 'quarter',
};

const SUB_NAMES: Readonly<Partial<Record<ScreenerMetricId, PeriodNames>>> = {
  profit_yoy: { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] },
  eps_yoy: { q: ['EPS quý này', 'EPS cùng kỳ'], y: ['EPS năm này', 'EPS năm trước'] },
  gross_margin: {
    q: ['Giá vốn 4 quý', 'Lợi nhuận gộp 4 quý'],
    y: ['Giá vốn năm', 'Lợi nhuận gộp năm'],
  },
  roe: { q: ['LNST 4 quý'], y: ['LNST năm'] },
  roa: { q: ['Tổng tài sản bình quân'], y: ['Tổng tài sản bình quân'] },
  roic: { q: ['NOPAT 4 quý'], y: ['NOPAT năm'] },
  asset_turnover: {
    q: ['Doanh thu 4 quý', 'Tài sản bình quân'],
    y: ['Doanh thu năm', 'Tài sản bình quân'],
  },
  ccc: {
    q: ['Ngày tồn kho', 'Ngày thu tiền', 'Ngày trả tiền'],
    y: ['Ngày tồn kho', 'Ngày thu tiền', 'Ngày trả tiền'],
  },
  debt_equity: { q: ['Nợ vay', 'Vốn chủ sở hữu'], y: ['Nợ vay', 'Vốn chủ sở hữu'] },
  current_ratio: { q: ['Tài sản ngắn hạn', 'Nợ ngắn hạn'], y: ['Tài sản ngắn hạn', 'Nợ ngắn hạn'] },
  interest_coverage: {
    q: ['EBIT quý', 'Chi phí lãi vay quý'],
    y: ['EBIT năm', 'Chi phí lãi vay năm'],
  },
  net_debt_ebitda: { q: ['Nợ ròng', 'EBITDA 4 quý'], y: ['Nợ ròng', 'EBITDA năm'] },
  cfo_margin: { q: ['CFO 4 quý'], y: ['CFO năm'] },
  cfo_profit: { q: ['CFO 4 quý', 'LNST 4 quý'], y: ['CFO năm', 'LNST năm'] },
  capex_revenue: { q: ['Capex 4 quý'], y: ['Capex năm'] },
  fcf_margin: {
    q: ['CFO 4 quý', 'Capex 4 quý', 'FCF 4 quý'],
    y: ['CFO năm', 'Capex năm', 'FCF năm'],
  },
};

/** Tên các cột bên dưới đường chính của một chỉ tiêu registry; doanh thu đổi tên theo ngành. */
function subNamesOf(metricId: ScreenerMetricId, industry: Industry): PeriodNames | undefined {
  const revenue = REVENUE_LABELS[industry];
  switch (metricId) {
    case 'revenue_yoy':
      return industry === 'thuong'
        ? { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] }
        : {
            q: [`${revenue.title} quý này`, 'Cùng kỳ năm trước'],
            y: [`${revenue.title} năm này`, 'Năm trước'],
          };
    case 'net_margin':
      return { q: ['LNST 4 quý'], y: ['LNST năm'] };
    default:
      return SUB_NAMES[metricId];
  }
}

/**
 * Values of the bars below the main line of a registry indicator. Every bar comes from the same
 * window as the line, so `main = f(bars)`; amounts stay in VND, days and EPS as they are.
 */
function subValues(metricId: ScreenerMetricId, window: DashboardWindow): (number | null)[] {
  switch (metricId) {
    case 'revenue_yoy':
      return [window.point('revenue'), window.previous?.point('revenue') ?? null];
    case 'profit_yoy':
      return [window.point('npat_parent'), window.previous?.point('npat_parent') ?? null];
    case 'eps_yoy':
      return [window.point('eps'), window.previous?.point('eps') ?? null];
    case 'gross_margin':
      return [window.flow('cogs'), window.flow('gross_profit')];
    case 'net_margin':
      return [window.flow('npat')];
    case 'roe':
      return [window.flow('npat_parent')];
    case 'roa':
      return [average(window.end('total_assets'), window.start('total_assets'))];
    case 'roic':
      return [
        nopatOf(window.flow('pbt'), window.flow('interest_expense'), window.flow('income_tax')),
      ];
    case 'asset_turnover':
      return [
        window.flow('revenue'),
        average(window.end('total_assets'), window.start('total_assets')),
      ];
    case 'ccc': {
      const parts = cccParts(window);
      return [parts.dio, parts.dso, parts.dpo];
    }
    case 'debt_equity':
      return [debtOf(window), window.end('equity')];
    case 'current_ratio':
      return [window.end('current_assets'), window.end('current_liabilities')];
    case 'interest_coverage':
      return [
        sum(window.point('pbt'), window.point('interest_expense')),
        window.point('interest_expense'),
      ];
    case 'net_debt_ebitda': {
      const cash = eligibleCashOf(window);
      return [sum(debtOf(window), cash === null ? null : -cash), ebitdaOf(window)];
    }
    case 'cfo_margin':
      return [window.flow('cfo')];
    case 'cfo_profit':
      return [window.flow('cfo'), window.flow('npat')];
    case 'capex_revenue':
      return [window.flow('capex')];
    case 'fcf_margin':
      return [window.flow('cfo'), window.flow('capex'), fcfOf(window)];
    default:
      return [];
  }
}

export interface DashboardContext {
  /** Statements with the dashboard fiscal-year rows (`annualStatements`). */
  statements: NormalizedStatements;
  /** Ngành của mã: quyết định tên đường/cột của các chỉ tiêu theo "doanh thu" (§8.1). */
  industry: Industry;
  /** Price and share count of the company (null when the chart does not need them). */
  market: MarketInputs;
  /**
   * Adjusted close (VND) of the last session on or before a date — PEG takes the P/E at the
   * last session of each period. Absent when no price history was loaded.
   */
  priceAt?: (date: string) => number | null;
}

/** Indexes of the most recent quarters, oldest first. */
function recentQuarterIndexes(statements: NormalizedStatements): number[] {
  const count = Math.min(statements.quarters.length, DASHBOARD_MAX_QUARTERS);
  return Array.from({ length: count }, (_, i) => count - 1 - i);
}

/** Indexes of the most recent fiscal years, oldest first. */
function recentYearIndexes(statements: NormalizedStatements): number[] {
  const count = Math.min(statements.years.length, DASHBOARD_MAX_YEARS);
  return Array.from({ length: count }, (_, i) => count - 1 - i);
}

/** The value and the status of one period, straight from the registry formula. */
interface PeriodValue {
  value: number | null;
  status: MetricStatus;
  reason?: string;
}

function evaluatePeriod(
  metricId: ScreenerMetricId,
  context: DashboardContext,
  index: number,
  mode: 'q' | 'y',
  window: DashboardWindow,
): PeriodValue {
  if (metricId === 'ccc') {
    if (mode === 'q') {
      const parts = cccParts(window);
      return {
        value: parts.ccc,
        status: parts.ccc === null ? 'insufficient_base' : 'ok',
      };
    }
    const annual = evaluateScreenerMetric(
      'ccc',
      sliceYears(context.statements, index),
      context.market,
      'year',
    );
    return {
      value: annual.status === 'ok' ? annual.value : null,
      status: annual.status,
      ...(annual.reason ? { reason: annual.reason } : {}),
    };
  }
  if (metricId === 'peg') return pegPeriod(context, index, mode, window);
  const period: ScreenerPeriod = mode === 'q' ? (QUARTER_PERIOD[metricId] ?? 'ttm') : 'year';
  const statements =
    mode === 'q'
      ? sliceQuarters(context.statements, index)
      : sliceYears(context.statements, index);
  const result = evaluateScreenerMetric(metricId, statements, context.market, period);
  return {
    value: result.status === 'ok' ? displayValue(metricId, result.value) : null,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

/**
 * PEG of one period (kind F2, spec §8.6): P/E at the last session of the quarter (or year) —
 * adjusted close / adjusted EPS 4 quý (EPS năm) — divided by the EPS growth against the same
 * window one year earlier. Empty below 5% growth or with a non-positive P/E (§10).
 */
function pegPeriod(
  context: DashboardContext,
  index: number,
  mode: 'q' | 'y',
  window: DashboardWindow,
): PeriodValue {
  if (!context.statements.quarters.some((quarter) => quarter.values.shares !== undefined))
    return { value: null, status: 'missing', reason: METRIC_REASONS.shareHistoryUnavailable };
  const period = mode === 'q' ? context.statements.quarters[index] : context.statements.years[index];
  const eps = mode === 'q' ? window.flow('eps') : window.point('eps');
  const base =
    mode === 'q' ? (window.previous?.flow('eps') ?? null) : (window.previous?.point('eps') ?? null);
  const growth = calculateMetric('eps_yoy', [eps, base]);
  if (growth.status !== 'ok')
    return { value: null, status: growth.status, ...(growth.reason ? { reason: growth.reason } : {}) };
  const price = period && context.priceAt ? context.priceAt(periodEnd(period)) : null;
  if (price === null)
    return { value: null, status: 'missing', reason: METRIC_REASONS.priceUnavailable };
  const pe = calculateMetric('pe', [price, eps]);
  if (pe.status !== 'ok')
    return { value: null, status: pe.status, ...(pe.reason ? { reason: pe.reason } : {}) };
  const peg = calculateMetric('peg', [pe.value, growth.value]);
  return {
    value: peg.status === 'ok' ? peg.value : null,
    status: peg.status,
    ...(peg.reason ? { reason: peg.reason } : {}),
  };
}

/** One period of the chart: the main line(s) and the bars below them. */
interface ChartPoint {
  label: string;
  main: (number | null)[];
  sub: (number | null)[];
  status: MetricStatus;
  reason?: string;
}

function periodPoint(
  spec: DashboardChartSpec,
  context: DashboardContext,
  index: number,
  mode: 'q' | 'y',
): ChartPoint {
  const window =
    mode === 'q'
      ? quarterWindow(context.statements, index)
      : yearWindow(context.statements, index);
  if (!window) return { label: '', main: [], sub: [], status: 'missing' };
  if (spec.registry_id === null) {
    const values = NATIVE_METRICS[spec.metric_id as NativeMetricId].compute(window);
    return {
      label: window.label,
      main: values.main,
      sub: values.sub,
      status: values.main.every((item) => item === null) ? 'missing' : 'ok',
    };
  }
  const evaluated = evaluatePeriod(spec.registry_id, context, index, mode, window);
  return {
    label: window.label,
    main: [evaluated.value],
    sub: subValues(spec.registry_id, window),
    status: evaluated.status,
    ...(evaluated.reason ? { reason: evaluated.reason } : {}),
  };
}

/** Builds the quarter and year points of the kinds A/B/C/F2. */
function buildPeriodChart(
  spec: DashboardChartSpec,
  context: DashboardContext,
): { qPoints: ChartPoint[]; yPoints: ChartPoint[] } {
  return {
    qPoints: recentQuarterIndexes(context.statements).map((index) =>
      periodPoint(spec, context, index, 'q'),
    ),
    yPoints: recentYearIndexes(context.statements).map((index) =>
      periodPoint(spec, context, index, 'y'),
    ),
  };
}

/** Tên đường chính và cột dưới của một chỉ tiêu theo chế độ Quý/Năm. */
function seriesNames(
  spec: DashboardChartSpec,
  industry: Industry,
): { main: PeriodNames; sub: PeriodNames } {
  if (spec.registry_id === null) {
    const native = NATIVE_METRICS[spec.metric_id as NativeMetricId];
    return { main: native.main, sub: native.sub };
  }
  const main = mainNameOf(spec.registry_id, industry);
  return {
    main: { q: [main.q], y: [main.y] },
    sub: subNamesOf(spec.registry_id, industry) ?? { q: [], y: [] },
  };
}

/** One period block of the kinds A/B/C/F2: the main line(s) and the bars below them. */
function toPeriodSeries(
  spec: DashboardChartSpec,
  points: ChartPoint[],
  mode: 'q' | 'y',
  industry: Industry,
): DashboardSeriesData {
  const names = seriesNames(spec, industry);
  const mainNames = names.main[mode];
  const subNames = names.sub[mode];
  const series: DashboardSeriesData = {
    labels: points.map((point) => point.label),
    main: mainNames.map((name, position) => ({
      name,
      v: points.map((point) => point.main[position] ?? null),
    })),
  };
  if (subNames.length > 0 && spec.sub_unit && spec.sub_type) {
    // Amounts travel in VND and show in tỷ đồng / nghìn tỷ đồng; days, EPS and % are shown as they are.
    const divisor = SUB_UNIT_DIVISOR[spec.sub_unit];
    series.sub = {
      unit: spec.sub_unit,
      type: spec.sub_type,
      series: subNames.map((name, position) => ({
        name,
        v: points.map((point) => {
          const raw = point.sub[position] ?? null;
          return divisor === undefined || raw === null ? raw : raw / divisor;
        }),
      })),
    };
  }
  return series;
}

/** Annual values of one registry indicator, used by the kinds D/E1/E2. */
function annualValues(
  metricId: ScreenerMetricId,
  context: DashboardContext,
  indexes: number[],
): (number | null)[] {
  return indexes.map((index) => {
    const window = yearWindow(context.statements, index);
    if (!window) return null;
    switch (metricId) {
      case 'revenue_cagr3':
        return toBillion(window.point('revenue'));
      case 'profit_cagr3':
        return toBillion(window.point('npat_parent'));
      case 'eps_cagr3':
        return window.point('eps');
      case 'profit_positive_streak':
        return toBillion(window.point('npat_parent'));
      case 'fcf_positive_streak':
        return toBillion(fcfOf(window));
      case 'revenue_growth_stability': {
        const previous = window.previous;
        if (!previous) return null;
        const growth = calculateMetric('revenue_yoy', [
          window.point('revenue'),
          previous.point('revenue'),
        ]);
        return growth.status === 'ok' ? displayValue('revenue_yoy', growth.value) : null;
      }
      case 'net_margin_stability': {
        const margin = calculateMetric('net_margin', [
          window.point('npat'),
          window.point('revenue'),
        ]);
        return margin.status === 'ok' ? displayValue('net_margin', margin.value) : null;
      }
      case 'eps_growth_stability':
        return window.point('eps');
      case 'roic_stability': {
        const roic = evaluateScreenerMetric(
          'roic',
          sliceYears(context.statements, index),
          context.market,
          'year',
        );
        return roic.status === 'ok' ? displayValue('roic', roic.value) : null;
      }
      default:
        return null;
    }
  });
}

/** Builds the year-fixed kinds D/E1/E2 of a registry indicator. */
function buildFixedChart(
  spec: DashboardChartSpec,
  metricId: ScreenerMetricId,
  context: DashboardContext,
): DashboardFixedData {
  const count = spec.kind === 'E2' ? 7 : spec.kind === 'E1' ? 5 : 4;
  const indexes = recentYearIndexes(context.statements).slice(-count);
  const labels = indexes.map((index) =>
    context.statements.years[index] ? yearLabel(context.statements.years[index]!) : '',
  );
  const values = annualValues(metricId, context, indexes);
  const result = evaluateScreenerMetric(
    metricId,
    context.statements,
    context.market,
    spec.kind === 'E2' ? 'year' : 'three_year',
  );
  const hero = result.status === 'ok' ? displayValue(metricId, result.value) : null;
  return {
    labels,
    main: [{ name: mainNameOf(metricId, context.industry).q, v: values }],
    mainUnit: spec.main_unit ?? dashboardUnit(spec),
    hero,
  };
}

/**
 * Chart payload of one indicator. An indicator the registry cannot compute (no data source, no
 * share-event history for the adjusted EPS) stays empty with its status and reason — the client
 * shows "—"; nothing is ever invented (§10).
 */
export function buildDashboardChart(
  spec: DashboardChartSpec,
  context: DashboardContext,
): DashboardChartPayload {
  const unit = dashboardUnit(spec);
  const payload: DashboardChartPayload = {
    name: spec.name,
    kind: spec.kind,
    unit,
    decimals: dashboardDecimals(unit),
    status: 'ok',
  };
  if (spec.kind === 'F') {
    // A daily valuation chart: the series itself comes from the valuation endpoint.
    return { ...payload, v: [] };
  }
  if (spec.registry_id === null) return buildNativeChart(spec, context, payload);
  const metricId = spec.registry_id;
  const legend = LEGEND_NOTES[metricId];
  if (legend) payload.legend_note = legend;
  const support = metricSupport(metricId);
  if (!support.supported) {
    payload.status =
      fundamentalMetric(metricId).readiness === 'definition_pending'
        ? 'definition_pending'
        : 'data_unavailable';
    if (support.unsupported_reason) payload.note = support.unsupported_reason;
  }

  if (spec.kind === 'D' || spec.kind === 'E1' || spec.kind === 'E2') {
    const fixed = buildFixedChart(spec, metricId, context);
    payload.labels = fixed.labels;
    payload.mainUnit = fixed.mainUnit;
    payload.hero = fixed.hero;
    if (support.supported) {
      payload.main = fixed.main;
      if (fixed.hero === null && fixed.main[0]!.v.every((item) => item === null)) {
        payload.status = 'missing';
      }
      return payload;
    }
    payload.main = [
      { name: mainNameOf(metricId, context.industry).q, v: fixed.labels.map(() => null) },
    ];
    payload.hero = null;
    return payload;
  }

  const points = buildPeriodChart(spec, context);
  payload.q = toPeriodSeries(spec, points.qPoints, 'q', context.industry);
  payload.y = toPeriodSeries(spec, points.yPoints, 'y', context.industry);
  if (spec.ref !== null) payload.ref = spec.ref;
  if (!support.supported) {
    payload.q = emptyPeriod(payload.q);
    payload.y = emptyPeriod(payload.y);
    return payload;
  }
  const last = points.qPoints.at(-1);
  if (points.qPoints.every((point) => point.main.every((item) => item === null))) {
    payload.status = last?.status ?? 'missing';
    if (last?.reason) payload.note = last.reason;
  }
  return payload;
}

/** Chart of one of the 29 industry indicators of `dashboard.native.ts` (kinds A and B). */
function buildNativeChart(
  spec: DashboardChartSpec,
  context: DashboardContext,
  payload: DashboardChartPayload,
): DashboardChartPayload {
  const native = NATIVE_METRICS[spec.metric_id as NativeMetricId];
  if (native.legendNote) payload.legend_note = native.legendNote;
  const points = buildPeriodChart(spec, context);
  payload.q = toPeriodSeries(spec, points.qPoints, 'q', context.industry);
  payload.y = toPeriodSeries(spec, points.yPoints, 'y', context.industry);
  if (spec.ref !== null) payload.ref = spec.ref;
  if (points.qPoints.every((point) => point.main.every((item) => item === null))) {
    payload.status = 'missing';
    payload.note = native.emptyNote ?? 'Chưa đủ số liệu báo cáo tài chính để tính chỉ tiêu';
  }
  return payload;
}

/** A period block whose values are all empty (an indicator without a data source). */
function emptyPeriod(series: DashboardSeriesData): DashboardSeriesData {
  return {
    labels: series.labels,
    main: series.main.map((item) => ({ name: item.name, v: series.labels.map(() => null) })),
    ...(series.sub
      ? {
          sub: {
            unit: series.sub.unit,
            type: series.sub.type,
            series: series.sub.series.map((item) => ({
              name: item.name,
              v: series.labels.map(() => null),
            })),
          },
        }
      : {}),
  };
}

