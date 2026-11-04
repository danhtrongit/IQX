/**
 * Danh mục 62 chỉ tiêu của Dashboard phân tích v2 theo ngành (spec §8) và bộ mặc định từng ngành
 * (spec §6.3): 17 chỉ tiêu chung (Học viện Chương 8) + 16 doanh nghiệp sản xuất (Ch. 9) + 11 ngân
 * hàng (Ch. 10) + 10 chứng khoán (Ch. 11) + 8 bảo hiểm (Ch. 12). Một mã chỉ thấy chỉ tiêu của
 * ngành mình: 33 (sản xuất), 28 (ngân hàng), 27 (chứng khoán) hoặc 25 (bảo hiểm).
 *
 * 33 chỉ tiêu của v1 giữ nguyên id (id của registry Bộ lọc, `screener.registry.ts`): công thức,
 * đơn vị và quy tắc null lấy lại từ đó. 29 chỉ tiêu mới của ngân hàng, chứng khoán, bảo hiểm có id
 * snake_case riêng và công thức nằm ở `dashboard.native.ts`. Mỗi chỉ tiêu có `metric_key` (= id)
 * ổn định để nút "Học" nối tới đúng bài của Học viện.
 */
import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  type Industry,
} from '../financials/financials.industry.js';
import { fundamentalMetric, type ScreenerMetricId } from '../screener/screener.registry.js';

export const DASHBOARD_CHART_KINDS = ['A', 'B', 'C', 'D', 'E1', 'E2', 'F', 'F2'] as const;
export type DashboardChartKind = (typeof DASHBOARD_CHART_KINDS)[number];

export const DASHBOARD_PERIOD_MODES = ['q', 'y'] as const;
export type DashboardPeriodMode = (typeof DASHBOARD_PERIOD_MODES)[number];

/** Số kỳ chọn được (spec §5.2). */
export const DASHBOARD_QUARTER_PERIODS = [4, 5, 8, 12, 20] as const;
export const DASHBOARD_YEAR_PERIODS = [3, 5, 10] as const;
/** Số kỳ mặc định của mọi biểu đồ (spec §5.2, §6.3). */
export const DASHBOARD_DEFAULT_PERIODS = 5;

/** Số kỳ tối đa API trả về; client tự cắt theo số kỳ đã chọn (spec §11). */
export const DASHBOARD_MAX_QUARTERS = 20;
export const DASHBOARD_MAX_YEARS = 10;

/** Bar arrangement below the main line of the kinds A/B/C. */
export type DashboardSubType = 'grouped' | 'stacked';

export { INDUSTRIES, INDUSTRY_LABELS };
export type { Industry };

/** Chương của danh mục: phần chung cho mọi ngành hoặc phần riêng của một ngành. */
export type DashboardScope = 'chung' | Industry;

export const DASHBOARD_SCOPES = ['chung', ...INDUSTRIES] as const;

export interface DashboardChapterInfo {
  /** Tên chương hiện ở khung "Biểu đồ" (§3.2). */
  title: string;
  /** Chương của Học viện v4 mà bài học của các chỉ tiêu trong chương nằm ở. */
  academy_chapter: 8 | 9 | 10 | 11 | 12;
}

export const DASHBOARD_CHAPTERS: Readonly<Record<DashboardScope, DashboardChapterInfo>> = {
  chung: { title: 'Phân tích cơ bản chung', academy_chapter: 8 },
  thuong: { title: INDUSTRY_LABELS.thuong, academy_chapter: 9 },
  nh: { title: INDUSTRY_LABELS.nh, academy_chapter: 10 },
  ck: { title: INDUSTRY_LABELS.ck, academy_chapter: 11 },
  bh: { title: INDUSTRY_LABELS.bh, academy_chapter: 12 },
};

/** Id của 29 chỉ tiêu mới của ngân hàng, chứng khoán và bảo hiểm (công thức ở `dashboard.native.ts`). */
export const NATIVE_METRIC_IDS = [
  // Ngân hàng (Chương 10)
  'nim',
  'yield_cost',
  'cir',
  'non_interest_share',
  'ppop_growth',
  'credit_cost',
  'provision_to_loans',
  'accrued_to_loans',
  'credit_deposit_growth',
  'ldr',
  'equity_to_assets',
  // Chứng khoán (Chương 11)
  'revenue_mix',
  'operating_margin',
  'opex_to_revenue',
  'margin_loan_growth',
  'margin_loan_to_equity',
  'margin_loan_yield',
  'brokerage_margin',
  'prop_asset_share',
  'prop_return',
  'borrowings_to_equity',
  // Bảo hiểm (Chương 12)
  'gwp_growth',
  'retention_ratio',
  'loss_ratio',
  'expense_ratio',
  'combined_ratio',
  'investment_yield',
  'profit_mix',
  'reserves_to_equity',
] as const;
export type NativeMetricId = (typeof NATIVE_METRIC_IDS)[number];

export interface DashboardChartSpec {
  /** Id ổn định của chỉ tiêu: id registry Bộ lọc (33 chỉ tiêu v1) hoặc id snake_case (29 mới). */
  metric_id: string;
  /** Khoá nối tới bài học của Học viện (= `metric_id`). */
  metric_key: string;
  /** Chương: chung hoặc ngành sở hữu chỉ tiêu. */
  scope: DashboardScope;
  /** Tên chương (§3.2). */
  chapter: string;
  /** Chương Học viện tương ứng (Ch. 8–12). */
  academy_chapter: number;
  /** Tên nhóm trong chương (§8). */
  group: string;
  /** Display name (Vietnamese): the key of a chart in the saved settings and in the query. */
  name: string;
  /** Chart shape (spec §9). */
  kind: DashboardChartKind;
  /** Đơn vị đường chính (A/B/C/F/F2) hoặc giá trị tóm tắt (D/E1/E2). */
  unit: string;
  /** Unit of the bars below the main line (kinds A/B/C). */
  sub_unit: string | null;
  /** Bar arrangement below the main line (kinds A/B/C). */
  sub_type: DashboardSubType | null;
  /** Unit of the `main` series of the year-fixed kinds (D/E1/E2). */
  main_unit: string | null;
  /** Fixed reference line (F2: PEG = 1; B: combined ratio = 100). */
  ref: number | null;
  /** Chỉ tiêu của registry Bộ lọc; null khi công thức nằm ở `dashboard.native.ts`. */
  registry_id: ScreenerMetricId | null;
}

export interface DashboardGroupSpec {
  /** Group title (Vietnamese), spec §8 order. */
  group: string;
  items: readonly DashboardChartSpec[];
}

export interface DashboardChapterSpec extends DashboardChapterInfo {
  scope: DashboardScope;
  groups: readonly DashboardGroupSpec[];
}

const T = 'tỷ đồng';
const NGHIN_TY = 'nghìn tỷ đồng';
const EPS = 'đồng/CP';

interface ChartOptions {
  sub?: readonly [unit: string, type: DashboardSubType];
  mainUnit?: string;
  ref?: number;
}

function spec(
  scope: DashboardScope,
  group: string,
  name: string,
  metricId: string,
  kind: DashboardChartKind,
  unit: string,
  registryId: ScreenerMetricId | null,
  options: ChartOptions = {},
): DashboardChartSpec {
  const chapter = DASHBOARD_CHAPTERS[scope];
  return {
    metric_id: metricId,
    metric_key: metricId,
    scope,
    chapter: chapter.title,
    academy_chapter: chapter.academy_chapter,
    group,
    name,
    kind,
    unit,
    sub_unit: options.sub?.[0] ?? null,
    sub_type: options.sub?.[1] ?? null,
    main_unit: options.mainUnit ?? null,
    ref: options.ref ?? null,
    registry_id: registryId,
  };
}

/** Chỉ tiêu của registry Bộ lọc: đơn vị lấy từ registry, không viết lại. */
function registryChart(
  scope: DashboardScope,
  group: string,
  name: string,
  metricId: ScreenerMetricId,
  kind: DashboardChartKind,
  options: ChartOptions = {},
): DashboardChartSpec {
  return spec(scope, group, name, metricId, kind, fundamentalMetric(metricId).unit, metricId, options);
}

/** Chỉ tiêu mới của ngành: công thức ở `dashboard.native.ts`. */
function nativeChart(
  scope: DashboardScope,
  group: string,
  name: string,
  metricId: NativeMetricId,
  kind: DashboardChartKind,
  unit: string,
  options: ChartOptions = {},
): DashboardChartSpec {
  return spec(scope, group, name, metricId, kind, unit, null, options);
}

const grouped = (unit: string): ChartOptions => ({ sub: [unit, 'grouped'] });
const stacked = (unit: string): ChartOptions => ({ sub: [unit, 'stacked'] });
const fixed = (mainUnit: string): ChartOptions => ({ mainUnit });

/** 17 chỉ tiêu chung của mọi ngành (§8.1, Học viện Chương 8). */
const COMMON_CHARTS: readonly DashboardChartSpec[] = [
  registryChart('chung', 'Tăng trưởng', 'Tăng trưởng doanh thu', 'revenue_yoy', 'A', grouped(T)),
  registryChart('chung', 'Tăng trưởng', 'Tăng trưởng LNST', 'profit_yoy', 'A', grouped(T)),
  registryChart('chung', 'Tăng trưởng', 'Tăng trưởng EPS', 'eps_yoy', 'A', grouped(EPS)),
  registryChart('chung', 'Tăng trưởng', 'Revenue CAGR 3Y', 'revenue_cagr3', 'D', fixed(T)),
  registryChart('chung', 'Tăng trưởng', 'Net Profit CAGR 3Y', 'profit_cagr3', 'D', fixed(T)),
  registryChart('chung', 'Tăng trưởng', 'EPS CAGR 3Y', 'eps_cagr3', 'D', fixed(EPS)),
  registryChart('chung', 'Ổn định', 'Profit Positive Streak', 'profit_positive_streak', 'E2', fixed(T)),
  registryChart('chung', 'Ổn định', 'Revenue Growth Stability', 'revenue_growth_stability', 'E1', fixed('%')),
  registryChart('chung', 'Ổn định', 'Margin Stability', 'net_margin_stability', 'E1', fixed('%')),
  registryChart('chung', 'Ổn định', 'EPS Stability', 'eps_growth_stability', 'E1', fixed(EPS)),
  registryChart('chung', 'Hiệu quả', 'ROE', 'roe', 'B', grouped(T)),
  registryChart('chung', 'Hiệu quả', 'ROA', 'roa', 'B', grouped(T)),
  registryChart('chung', 'Hiệu quả', 'Biên lợi nhuận ròng', 'net_margin', 'B', grouped(T)),
  registryChart('chung', 'Định giá', 'P/E', 'pe', 'F'),
  registryChart('chung', 'Định giá', 'P/B', 'pb', 'F'),
  registryChart('chung', 'Định giá', 'P/S', 'ps', 'F'),
  registryChart('chung', 'Định giá', 'PEG', 'peg', 'F2', { ref: 1 }),
];

/** 16 chỉ tiêu của doanh nghiệp sản xuất (§8.2, Học viện Chương 9). */
const THUONG_CHARTS: readonly DashboardChartSpec[] = [
  registryChart('thuong', 'Hiệu quả và biên lợi nhuận', 'Biên lợi nhuận gộp', 'gross_margin', 'B', stacked(T)),
  registryChart('thuong', 'Hiệu quả và biên lợi nhuận', 'ROIC', 'roic', 'B', grouped(T)),
  registryChart('thuong', 'Hiệu quả và biên lợi nhuận', 'ROIC Stability', 'roic_stability', 'E1', fixed('%')),
  registryChart('thuong', 'Hiệu quả và biên lợi nhuận', 'Asset Turnover', 'asset_turnover', 'B', grouped(T)),
  registryChart('thuong', 'Hiệu quả và biên lợi nhuận', 'Cash Conversion Cycle', 'ccc', 'C', grouped('ngày')),
  registryChart('thuong', 'Nợ và khả năng thanh toán', 'D/E', 'debt_equity', 'B', grouped(T)),
  registryChart('thuong', 'Nợ và khả năng thanh toán', 'Current Ratio', 'current_ratio', 'B', grouped(T)),
  registryChart('thuong', 'Nợ và khả năng thanh toán', 'Interest Coverage', 'interest_coverage', 'B', grouped(T)),
  registryChart('thuong', 'Nợ và khả năng thanh toán', 'Net Debt / EBITDA', 'net_debt_ebitda', 'B', grouped(T)),
  registryChart('thuong', 'Dòng tiền', 'CFO Margin', 'cfo_margin', 'B', grouped(T)),
  registryChart('thuong', 'Dòng tiền', 'CFO / LNST', 'cfo_profit', 'B', grouped(T)),
  registryChart('thuong', 'Dòng tiền', 'Capex / Revenue', 'capex_revenue', 'B', grouped(T)),
  registryChart('thuong', 'Dòng tiền', 'FCF Margin', 'fcf_margin', 'B', grouped(T)),
  registryChart('thuong', 'Dòng tiền', 'FCF Positive Streak', 'fcf_positive_streak', 'E2', fixed(T)),
  registryChart('thuong', 'Định giá', 'EV / EBITDA', 'ev_ebitda', 'F'),
  registryChart('thuong', 'Định giá', 'FCF Yield', 'fcf_yield', 'F'),
];

/** 11 chỉ tiêu của ngân hàng, gồm cả công ty tài chính (§8.3, Học viện Chương 10). */
const BANK_CHARTS: readonly DashboardChartSpec[] = [
  nativeChart('nh', 'Thu nhập và hiệu quả', 'NIM', 'nim', 'B', '%', grouped(T)),
  nativeChart('nh', 'Thu nhập và hiệu quả', 'Lợi suất tài sản sinh lãi và chi phí vốn', 'yield_cost', 'B', '%', grouped(T)),
  nativeChart('nh', 'Thu nhập và hiệu quả', 'CIR', 'cir', 'B', '%', grouped(T)),
  nativeChart('nh', 'Thu nhập và hiệu quả', 'Tỷ trọng thu nhập ngoài lãi', 'non_interest_share', 'B', '%', stacked(T)),
  nativeChart('nh', 'Thu nhập và hiệu quả', 'Tăng trưởng lợi nhuận trước dự phòng', 'ppop_growth', 'A', '%', grouped(T)),
  nativeChart('nh', 'Rủi ro tín dụng', 'Chi phí tín dụng', 'credit_cost', 'B', '%', grouped(T)),
  nativeChart('nh', 'Rủi ro tín dụng', 'Tỷ lệ dự phòng / Dư nợ', 'provision_to_loans', 'B', '%', grouped(T)),
  nativeChart('nh', 'Rủi ro tín dụng', 'Lãi dự thu / Dư nợ', 'accrued_to_loans', 'B', '%', grouped(T)),
  nativeChart('nh', 'Quy mô và vốn', 'Tăng trưởng tín dụng và huy động', 'credit_deposit_growth', 'A', '%', grouped(NGHIN_TY)),
  nativeChart('nh', 'Quy mô và vốn', 'LDR', 'ldr', 'B', '%', grouped(NGHIN_TY)),
  nativeChart('nh', 'Quy mô và vốn', 'VCSH / Tổng tài sản', 'equity_to_assets', 'B', '%', grouped(NGHIN_TY)),
];

/** 10 chỉ tiêu của công ty chứng khoán (§8.4, Học viện Chương 11). */
const SECURITIES_CHARTS: readonly DashboardChartSpec[] = [
  nativeChart('ck', 'Doanh thu và chi phí', 'Cơ cấu doanh thu hoạt động', 'revenue_mix', 'B', '%', stacked(T)),
  nativeChart('ck', 'Doanh thu và chi phí', 'Biên lợi nhuận hoạt động', 'operating_margin', 'B', '%', stacked(T)),
  nativeChart('ck', 'Doanh thu và chi phí', 'Chi phí hoạt động / Doanh thu hoạt động', 'opex_to_revenue', 'B', '%', grouped(T)),
  nativeChart('ck', 'Cho vay margin', 'Tăng trưởng dư nợ cho vay', 'margin_loan_growth', 'A', '%', grouped(T)),
  nativeChart('ck', 'Cho vay margin', 'Dư nợ cho vay / VCSH', 'margin_loan_to_equity', 'B', 'lần', grouped(T)),
  nativeChart('ck', 'Cho vay margin', 'Lợi suất cho vay', 'margin_loan_yield', 'B', '%', grouped(T)),
  nativeChart('ck', 'Môi giới và tự doanh', 'Biên lợi nhuận môi giới', 'brokerage_margin', 'B', '%', grouped(T)),
  nativeChart('ck', 'Môi giới và tự doanh', 'Tỷ trọng tài sản tự doanh', 'prop_asset_share', 'B', '%', stacked(T)),
  nativeChart('ck', 'Môi giới và tự doanh', 'Hiệu suất tự doanh', 'prop_return', 'B', '%', grouped(T)),
  nativeChart('ck', 'Đòn bẩy', 'Nợ vay / VCSH', 'borrowings_to_equity', 'B', 'lần', grouped(T)),
];

/** 8 chỉ tiêu của doanh nghiệp bảo hiểm (§8.5, Học viện Chương 12). */
const INSURANCE_CHARTS: readonly DashboardChartSpec[] = [
  nativeChart('bh', 'Doanh thu phí', 'Tăng trưởng doanh thu phí bảo hiểm gốc', 'gwp_growth', 'A', '%', grouped(T)),
  nativeChart('bh', 'Doanh thu phí', 'Tỷ lệ giữ lại', 'retention_ratio', 'B', '%', grouped(T)),
  nativeChart('bh', 'Hiệu quả nghiệp vụ', 'Tỷ lệ bồi thường', 'loss_ratio', 'B', '%', grouped(T)),
  nativeChart('bh', 'Hiệu quả nghiệp vụ', 'Tỷ lệ chi phí', 'expense_ratio', 'B', '%', grouped(T)),
  nativeChart('bh', 'Hiệu quả nghiệp vụ', 'Combined ratio', 'combined_ratio', 'B', '%', { sub: ['%', 'stacked'], ref: 100 }),
  nativeChart('bh', 'Đầu tư', 'Lợi suất đầu tư', 'investment_yield', 'B', '%', grouped(T)),
  nativeChart('bh', 'Đầu tư', 'Cơ cấu lợi nhuận', 'profit_mix', 'B', '%', grouped(T)),
  nativeChart('bh', 'Dự phòng', 'Dự phòng nghiệp vụ / VCSH', 'reserves_to_equity', 'B', 'lần', grouped(T)),
];

const SPECIFIC_CHARTS: Readonly<Record<Industry, readonly DashboardChartSpec[]>> = {
  thuong: THUONG_CHARTS,
  nh: BANK_CHARTS,
  ck: SECURITIES_CHARTS,
  bh: INSURANCE_CHARTS,
};

/** Flat list of the 62 charts: the 17 common ones, then the 16 + 11 + 10 + 8 of each industry. */
export const DASHBOARD_CHARTS: readonly DashboardChartSpec[] = [
  ...COMMON_CHARTS,
  ...INDUSTRIES.flatMap((industry) => SPECIFIC_CHARTS[industry]),
];

/** Display names of the 62 charts (the key of a chart in the saved settings). */
export const DASHBOARD_CHART_NAMES = DASHBOARD_CHARTS.map((chart) => chart.name) as [
  string,
  ...string[],
];

/** The charts a symbol of this industry shows: the common 17 + the industry's own. */
export const DASHBOARD_INDUSTRY_CHARTS: Readonly<Record<Industry, readonly DashboardChartSpec[]>> =
  {
    thuong: [...COMMON_CHARTS, ...THUONG_CHARTS],
    nh: [...COMMON_CHARTS, ...BANK_CHARTS],
    ck: [...COMMON_CHARTS, ...SECURITIES_CHARTS],
    bh: [...COMMON_CHARTS, ...INSURANCE_CHARTS],
  };

function groupsOf(charts: readonly DashboardChartSpec[]): DashboardGroupSpec[] {
  return [...new Set(charts.map((chart) => chart.group))].map((group) => ({
    group,
    items: charts.filter((chart) => chart.group === group),
  }));
}

/** The two chapters of an industry, each with its groups (spec §3.2): the common one first. */
export const DASHBOARD_INDUSTRY_CHAPTERS: Readonly<Record<Industry, readonly DashboardChapterSpec[]>> =
  Object.fromEntries(
    INDUSTRIES.map((industry) => [
      industry,
      (['chung', industry] as const).map((scope) => ({
        scope,
        ...DASHBOARD_CHAPTERS[scope],
        groups: groupsOf(scope === 'chung' ? COMMON_CHARTS : SPECIFIC_CHARTS[industry]),
      })),
    ]),
  ) as unknown as Record<Industry, readonly DashboardChapterSpec[]>;

/** Number of charts of each industry: 33, 28, 27, 25. */
export const DASHBOARD_INDUSTRY_COUNTS: Readonly<Record<Industry, number>> = {
  thuong: DASHBOARD_INDUSTRY_CHARTS.thuong.length,
  nh: DASHBOARD_INDUSTRY_CHARTS.nh.length,
  ck: DASHBOARD_INDUSTRY_CHARTS.ck.length,
  bh: DASHBOARD_INDUSTRY_CHARTS.bh.length,
};

/** The 6 charts of the default dashboard of each industry (spec §6.3). */
export const DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY: Readonly<Record<Industry, readonly string[]>> = {
  thuong: [
    'Tăng trưởng doanh thu',
    'Tăng trưởng LNST',
    'Biên lợi nhuận ròng',
    'ROE',
    'D/E',
    'P/E',
  ],
  nh: ['Tăng trưởng LNST', 'NIM', 'CIR', 'Chi phí tín dụng', 'ROE', 'P/B'],
  ck: [
    'Cơ cấu doanh thu hoạt động',
    'Tăng trưởng LNST',
    'Dư nợ cho vay / VCSH',
    'Biên lợi nhuận hoạt động',
    'ROE',
    'P/B',
  ],
  bh: [
    'Tăng trưởng doanh thu phí bảo hiểm gốc',
    'Combined ratio',
    'Lợi suất đầu tư',
    'Tăng trưởng LNST',
    'ROE',
    'P/B',
  ],
};

/** Charts of the default dashboard of the manufacturing industry (the v1 default, spec §6.3). */
export const DASHBOARD_DEFAULT_CHARTS = DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.thuong;

const CHART_BY_NAME = new Map<string, DashboardChartSpec>(
  DASHBOARD_CHARTS.map((chart) => [chart.name, chart] as const),
);

export function dashboardChart(name: string): DashboardChartSpec | null {
  return CHART_BY_NAME.get(name) ?? null;
}

export function isDashboardChartName(name: string): boolean {
  return CHART_BY_NAME.has(name);
}

/** Whether a chart belongs to the catalogue of an industry (the common 17 belong to all). */
export function chartInIndustry(chart: DashboardChartSpec, industry: Industry): boolean {
  return chart.scope === 'chung' || chart.scope === industry;
}

/** Display unit of the main line (or of the summary value of the kinds D/E1/E2). */
export function dashboardUnit(chart: Pick<DashboardChartSpec, 'unit'>): string {
  return chart.unit;
}

/** Số chữ số thập phân theo đơn vị (spec §10). */
export function dashboardDecimals(unit: string): number {
  if (unit === 'lần') return 2;
  if (unit === '%' || unit === 'điểm %') return 1;
  return 0;
}
