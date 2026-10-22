/**
 * Số liệu Dashboard phân tích: dựng chuỗi kỳ cho 33 chỉ tiêu theo khuôn biểu đồ (spec §8–§10).
 *
 * Công thức KHÔNG được viết lại: mọi chỉ tiêu đều chạy qua registry Bộ lọc
 * (`evaluateScreenerMetric` / `calculateMetric` của `modules/screener`), nên số liệu khớp đúng
 * công thức đang dùng trong sản phẩm. Phần chỉ làm ở đây là:
 *  - dựng lịch sử kỳ (20 quý / 10 năm) và các số thành phần đi kèm (cột dưới đường chính);
 *  - quy đổi đơn vị: tỷ đồng (VCI báo cáo bằng triệu đồng), % và điểm % (phần trăm), lần, ngày;
 *  - quy tắc §10: kỳ không tính được thì để trống (null), không vẽ số 0.
 */
import { calculateMetric, metricSupport, type MetricStatus } from '../screener/screener.metrics.js';
import {
  fundamentalMetric,
  type ScreenerMetricId,
  type ScreenerPeriod,
} from '../screener/screener.registry.js';
import {
  evaluateScreenerMetric,
  type MarketInputs,
  type NormalizedStatements,
  type StatementConcept,
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
} from './dashboard.catalog.js';

/** VCI báo cáo tài chính bằng triệu đồng; Dashboard hiển thị tỷ đồng. */
const MILLION_VND = 1000;
/** Số ngày của một năm (DIO/DSO/DPO — công thức CCC của registry). */
const DAYS_PER_YEAR = 365;

/** Concepts that are flows: a fiscal year is their sum over the four quarters. */
const FLOW_CONCEPTS: readonly StatementConcept[] = [
  'revenue',
  'cogs',
  'gross_profit',
  'interest_expense',
  'pbt',
  'npat',
  'npat_parent',
  'depreciation',
  'goodwill_amortization',
  'cfo',
  'capex',
  'share_issuance',
  'share_buyback',
];

/** Concepts that are balances: a fiscal year keeps the end-of-year value. */
const BALANCE_CONCEPTS: readonly StatementConcept[] = [
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
];

export interface DashboardWindow {
  /** Label of the period ("Q2/26" / "2025"). */
  label: string;
  /** Value of the current discrete period (the quarter itself, or the whole fiscal year). */
  point(concept: StatementConcept): number | null;
  /** Flow of the window (four quarters / one fiscal year). */
  flow(concept: StatementConcept): number | null;
  /** Balance at the end of the window. */
  end(concept: StatementConcept): number | null;
  /** Balance at the start of the window (the same balance one year earlier). */
  start(concept: StatementConcept): number | null;
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
  /** Quarter mode (kinds A/B/C/F2). */
  q?: DashboardSeriesData;
  /** Year mode (kinds A/B/C/F2). */
  y?: DashboardSeriesData;
  /** Year-fixed kinds (D/E1/E2). */
  labels?: string[];
  main?: { name: string; v: (number | null)[] }[];
  mainUnit?: string;
  hero?: number | null;
  /** Fixed reference line (kind F2: PEG = 1). */
  ref?: number;
  /** Daily series of a kind-F chart; the fundamental endpoint leaves it empty. */
  v?: (number | null)[];
}

/** The chart of an indicator that does not apply to this kind of company (spec §7). */
export interface DashboardNotApplicablePayload {
  name: string;
  na: 1;
}

const ordinal = (p: StatementPeriod) => p.year * 4 + (p.quarter ?? 1) - 1;

const quarterLabel = (p: StatementPeriod) => `Q${p.quarter ?? 1}/${String(p.year).slice(2)}`;
const yearLabel = (p: StatementPeriod) => String(p.year);

const value = (p: StatementPeriod | null | undefined, concept: StatementConcept): number | null =>
  p?.values[concept] ?? null;

const average = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : (a + b) / 2;

const sum = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b;

/** Million VND → billion VND (the unit of the bars). */
export const toBillion = (v: number | null): number | null =>
  v === null ? null : v / MILLION_VND;

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
 * end-of-year values, and a year without its four quarters is left out (spec §8).
 */
export function annualStatements(statements: NormalizedStatements): NormalizedStatements {
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
    const values: Partial<Record<StatementConcept, number>> = {};
    for (const concept of FLOW_CONCEPTS) {
      let total = 0;
      let complete = true;
      for (const row of rows) {
        const current = row.values[concept];
        if (current === undefined) {
          complete = false;
          break;
        }
        total += current;
      }
      if (complete) values[concept] = total;
    }
    const last = rows[3]!;
    for (const concept of BALANCE_CONCEPTS) {
      const current = last.values[concept];
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
  const flow = (concept: StatementConcept): number | null => {
    if (!complete) return null;
    let total = 0;
    for (const item of windowIndexes) {
      const current = statements.quarters[item]!.values[concept];
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

/** Name of the main line of every indicator (spec §8). */
const MAIN_NAMES: Readonly<Partial<Record<ScreenerMetricId, { q: string; y: string }>>> = {
  revenue_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  profit_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  eps_yoy: { q: 'Tăng trưởng so với cùng kỳ', y: 'Tăng trưởng so với năm trước' },
  gross_margin: { q: 'Biên gộp (4 quý)', y: 'Biên gộp năm' },
  net_margin: { q: 'Biên ròng (4 quý)', y: 'Biên ròng năm' },
  roe: { q: 'ROE (4 quý)', y: 'ROE năm' },
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
  revenue_cagr3: { q: 'Doanh thu', y: 'Doanh thu' },
  profit_cagr3: { q: 'LNST', y: 'LNST' },
  eps_cagr3: { q: 'EPS', y: 'EPS' },
  profit_positive_streak: { q: 'LNST năm', y: 'LNST năm' },
  fcf_positive_streak: { q: 'FCF năm', y: 'FCF năm' },
  revenue_growth_stability: {
    q: 'Tăng trưởng doanh thu năm',
    y: 'Tăng trưởng doanh thu năm',
  },
  net_margin_stability: { q: 'Biên ròng năm', y: 'Biên ròng năm' },
  eps_growth_stability: { q: 'EPS năm', y: 'EPS năm' },
  roic_stability: { q: 'ROIC năm', y: 'ROIC năm' },
};

/** Tên đường chính của một chỉ tiêu (bảng trên là nguồn duy nhất). */
function mainNameOf(metricId: ScreenerMetricId): { q: string; y: string } {
  const names = MAIN_NAMES[metricId];
  if (!names) throw new Error(`Dashboard: chỉ tiêu ${metricId} chưa có tên đường chính`);
  return names;
}

/** Period used in the quarter mode of every indicator (the registry's own periods). */
const QUARTER_PERIOD: Readonly<Partial<Record<ScreenerMetricId, ScreenerPeriod>>> = {
  revenue_yoy: 'quarter',
  profit_yoy: 'quarter',
  eps_yoy: 'quarter',
  debt_equity: 'quarter',
  current_ratio: 'quarter',
};

/** Names of the bars below the main line, per indicator and mode. */
interface SubNames {
  q: string[];
  y: string[];
}

const SUB_NAMES: Readonly<Partial<Record<ScreenerMetricId, SubNames>>> = {
  revenue_yoy: { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] },
  profit_yoy: { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] },
  eps_yoy: { q: ['EPS quý này', 'EPS cùng kỳ'], y: ['EPS năm này', 'EPS năm trước'] },
  gross_margin: {
    q: ['Giá vốn 4 quý', 'Lợi nhuận gộp 4 quý'],
    y: ['Giá vốn năm', 'Lợi nhuận gộp năm'],
  },
  net_margin: { q: ['LNST 4 quý'], y: ['LNST năm'] },
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

/**
 * Values of the bars below the main line. Every bar comes from the same window as the line, so
 * `main = f(bars)`; the unit is the display unit of the bars (tỷ đồng, ngày).
 */
function subValues(
  metricId: ScreenerMetricId,
  window: DashboardWindow,
): (number | null)[][] {
  switch (metricId) {
    case 'revenue_yoy':
      return [[window.point('revenue')], [window.previous?.point('revenue') ?? null]];
    case 'profit_yoy':
      return [[window.point('npat_parent')], [window.previous?.point('npat_parent') ?? null]];
    case 'eps_yoy':
      return [[null], [null]];
    case 'gross_margin':
      return [[window.flow('cogs')], [window.flow('gross_profit')]];
    case 'net_margin':
      return [[window.flow('npat')]];
    case 'roe':
      return [[window.flow('npat_parent')]];
    case 'roa':
      return [[average(window.end('total_assets'), window.start('total_assets'))]];
    case 'roic':
      return [[null]];
    case 'asset_turnover':
      return [
        [window.flow('revenue')],
        [average(window.end('total_assets'), window.start('total_assets'))],
      ];
    case 'ccc': {
      const parts = cccParts(window);
      return [[parts.dio], [parts.dso], [parts.dpo]];
    }
    case 'debt_equity':
      return [[debtOf(window)], [window.end('equity')]];
    case 'current_ratio':
      return [[window.end('current_assets')], [window.end('current_liabilities')]];
    case 'interest_coverage':
      return [
        [sum(window.point('pbt'), window.point('interest_expense'))],
        [window.point('interest_expense')],
      ];
    case 'net_debt_ebitda': {
      const cash = eligibleCashOf(window);
      return [
        [sum(debtOf(window), cash === null ? null : -cash)],
        [ebitdaOf(window)],
      ];
    }
    case 'cfo_margin':
      return [[window.flow('cfo')]];
    case 'cfo_profit':
      return [[window.flow('cfo')], [window.flow('npat')]];
    case 'capex_revenue':
      return [[window.flow('capex')]];
    case 'fcf_margin':
      return [[window.flow('cfo')], [window.flow('capex')], [fcfOf(window)]];
    default:
      return [];
  }
}

export interface DashboardContext {
  /** Statements with the dashboard fiscal-year rows (`annualStatements`). */
  statements: NormalizedStatements;
  /** Price and share count of the company (null when the chart does not need them). */
  market: MarketInputs;
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
  spec: DashboardChartSpec,
  context: DashboardContext,
  index: number,
  mode: 'q' | 'y',
  window: DashboardWindow,
): PeriodValue {
  if (spec.metric_id === 'ccc') {
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
  if (spec.metric_id === 'peg') {
    // PEG needs the price at the end of the period and the split/bonus adjusted EPS history;
    // neither is available (the registry marks PEG as data_unavailable), so it stays empty (§10).
    const value = pegValue(null, null);
    return { value, status: value === null ? 'data_unavailable' : 'ok' };
  }
  const period: ScreenerPeriod =
    mode === 'q' ? (QUARTER_PERIOD[spec.metric_id] ?? 'ttm') : 'year';
  const statements =
    mode === 'q'
      ? sliceQuarters(context.statements, index)
      : sliceYears(context.statements, index);
  const result = evaluateScreenerMetric(spec.metric_id, statements, context.market, period);
  return {
    value: result.status === 'ok' ? displayValue(spec.metric_id, result.value) : null,
    status: result.status,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

/** One quarter of the chart: the main line and the bars below it. */
interface ChartPoint {
  label: string;
  main: number | null;
  sub: (number | null)[][];
  status: MetricStatus;
  reason?: string;
}

function quarterPoint(
  spec: DashboardChartSpec,
  context: DashboardContext,
  index: number,
): ChartPoint {
  const window = quarterWindow(context.statements, index);
  if (!window)
    return { label: '', main: null, sub: [], status: 'missing' };
  const evaluated = evaluatePeriod(spec, context, index, 'q', window);
  return {
    label: window.label,
    main: evaluated.value,
    sub: subValues(spec.metric_id, window),
    status: evaluated.status,
    ...(evaluated.reason ? { reason: evaluated.reason } : {}),
  };
}

/** One fiscal year of the chart. */
function yearPoint(
  spec: DashboardChartSpec,
  context: DashboardContext,
  index: number,
): ChartPoint {
  const window = yearWindow(context.statements, index);
  if (!window) return { label: '', main: null, sub: [], status: 'missing' };
  const evaluated = evaluatePeriod(spec, context, index, 'y', window);
  return {
    label: window.label,
    main: evaluated.value,
    sub: subValues(spec.metric_id, window),
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
      quarterPoint(spec, context, index),
    ),
    yPoints: recentYearIndexes(context.statements).map((index) =>
      yearPoint(spec, context, index),
    ),
  };
}

/** One period block of the kinds A/B/C/F2: the main line and the bars below it. */
function toPeriodSeries(
  spec: DashboardChartSpec,
  points: ChartPoint[],
  mode: 'q' | 'y',
): DashboardSeriesData {
  const names = mainNameOf(spec.metric_id);
  const subNames = SUB_NAMES[spec.metric_id];
  const series: DashboardSeriesData = {
    labels: points.map((point) => point.label),
    main: [{ name: names[mode], v: points.map((point) => point.main) }],
  };
  if (subNames && spec.sub_unit && spec.sub_type) {
    const inDays = spec.metric_id === 'ccc';
    series.sub = {
      unit: spec.sub_unit,
      type: spec.sub_type,
      series: subNames[mode].map((name, position) => ({
        name,
        v: points.map((point) => {
          const raw = point.sub[position]?.[0] ?? null;
          return inDays ? raw : toBillion(raw);
        }),
      })),
    };
  }
  return series;
}

/** Annual values of one indicator, used by the kinds D/E1/E2. */
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
        return null;
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
      case 'roic_stability':
        return null;
      default:
        return null;
    }
  });
}

/** Builds the year-fixed kinds D/E1/E2. */
function buildFixedChart(
  spec: DashboardChartSpec,
  context: DashboardContext,
): DashboardFixedData {
  const count = spec.kind === 'E2' ? 7 : spec.kind === 'E1' ? 5 : 4;
  const indexes = recentYearIndexes(context.statements).slice(-count);
  const labels = indexes.map((index) =>
    context.statements.years[index] ? yearLabel(context.statements.years[index]!) : '',
  );
  const values = annualValues(spec.metric_id, context, indexes);
  const result = evaluateScreenerMetric(
    spec.metric_id,
    context.statements,
    context.market,
    spec.kind === 'E2' ? 'year' : 'three_year',
  );
  const hero = result.status === 'ok' ? displayValue(spec.metric_id, result.value) : null;
  return {
    labels,
    main: [{ name: mainNameOf(spec.metric_id).q, v: values }],
    mainUnit: spec.main_unit ?? dashboardUnit(spec.metric_id),
    hero,
  };
}

/**
 * Chart payload of one indicator. An indicator the registry cannot compute (no split/bonus
 * adjusted EPS history, no normalized tax rate) stays empty with its status and reason — the
 * client shows "—"; nothing is ever invented (§10).
 */
export function buildDashboardChart(
  spec: DashboardChartSpec,
  context: DashboardContext,
): DashboardChartPayload {
  const unit = dashboardUnit(spec.metric_id);
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
  const support = metricSupport(spec.metric_id);
  if (!support.supported) {
    payload.status =
      fundamentalMetric(spec.metric_id).readiness === 'definition_pending'
        ? 'definition_pending'
        : 'data_unavailable';
    if (support.unsupported_reason) payload.note = support.unsupported_reason;
  }

  if (spec.kind === 'D' || spec.kind === 'E1' || spec.kind === 'E2') {
    const fixed = buildFixedChart(spec, context);
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
      { name: mainNameOf(spec.metric_id).q, v: fixed.labels.map(() => null) },
    ];
    payload.hero = null;
    return payload;
  }

  const points = buildPeriodChart(spec, context);
  payload.q = toPeriodSeries(spec, points.qPoints, 'q');
  payload.y = toPeriodSeries(spec, points.yPoints, 'y');
  if (spec.ref !== null) payload.ref = spec.ref;
  if (!support.supported) {
    payload.q = emptyPeriod(payload.q);
    payload.y = emptyPeriod(payload.y);
    return payload;
  }
  const last = points.qPoints.at(-1);
  if (points.qPoints.every((point) => point.main === null)) {
    payload.status = last?.status ?? 'missing';
    if (last?.reason) payload.note = last.reason;
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
