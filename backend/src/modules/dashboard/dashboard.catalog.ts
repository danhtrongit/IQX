/**
 * Danh mục 33 biểu đồ của Dashboard phân tích (spec §8) và bộ mặc định (spec §6.3).
 *
 * Mỗi chỉ tiêu trỏ tới một metric id của registry Bộ lọc (`screener.registry.ts`): công thức,
 * đơn vị và quy tắc null đều lấy lại từ đó, không viết lại ở đây. Nhóm, tên hiển thị và khuôn
 * biểu đồ là của riêng Dashboard (tiếng Việt cho người dùng, mã tiếng Anh cho client).
 */
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

export interface DashboardChartSpec {
  /** Group title (Vietnamese), spec §8 order. */
  group: string;
  /** Display name (Vietnamese): the key of a chart in the saved settings. */
  name: string;
  /** Metric id of the Bộ lọc registry (the formula and the unit live there). */
  metric_id: ScreenerMetricId;
  /** Chart shape (spec §9). */
  kind: DashboardChartKind;
  /** Unit of the bars below the main line (kinds A/B/C). */
  sub_unit: string | null;
  /** Bar arrangement below the main line (kinds A/B/C). */
  sub_type: DashboardSubType | null;
  /** Unit of the `main` series of the year-fixed kinds (D/E1/E2). */
  main_unit: string | null;
  /** Fixed reference line (kind F2: PEG = 1). */
  ref: number | null;
}

export interface DashboardGroupSpec {
  /** Group title (Vietnamese), spec §8 order. */
  group: string;
  items: readonly DashboardChartSpec[];
}

const T = 'tỷ đồng';
const EPS = 'đồng/CP';

/** Danh mục 33 chỉ tiêu theo đúng thứ tự và nhóm của spec §8. */
const CHART_LIST = [
  {
    group: 'Tốc độ tăng trưởng',
    name: 'Tăng trưởng doanh thu',
    metric_id: 'revenue_yoy',
    kind: 'A',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Tốc độ tăng trưởng',
    name: 'Tăng trưởng LNST',
    metric_id: 'profit_yoy',
    kind: 'A',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Tốc độ tăng trưởng',
    name: 'Tăng trưởng EPS',
    metric_id: 'eps_yoy',
    kind: 'A',
    sub_unit: EPS,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Tốc độ tăng trưởng',
    name: 'Revenue CAGR 3Y',
    metric_id: 'revenue_cagr3',
    kind: 'D',
    sub_unit: null,
    sub_type: null,
    main_unit: T,
    ref: null,
  },
  {
    group: 'Tốc độ tăng trưởng',
    name: 'Net Profit CAGR 3Y',
    metric_id: 'profit_cagr3',
    kind: 'D',
    sub_unit: null,
    sub_type: null,
    main_unit: T,
    ref: null,
  },
  {
    group: 'Tốc độ tăng trưởng',
    name: 'EPS CAGR 3Y',
    metric_id: 'eps_cagr3',
    kind: 'D',
    sub_unit: null,
    sub_type: null,
    main_unit: EPS,
    ref: null,
  },
  {
    group: 'Độ ổn định',
    name: 'Profit Positive Streak',
    metric_id: 'profit_positive_streak',
    kind: 'E2',
    sub_unit: null,
    sub_type: null,
    main_unit: T,
    ref: null,
  },
  {
    group: 'Độ ổn định',
    name: 'Revenue Growth Stability',
    metric_id: 'revenue_growth_stability',
    kind: 'E1',
    sub_unit: null,
    sub_type: null,
    main_unit: '%',
    ref: null,
  },
  {
    group: 'Độ ổn định',
    name: 'Margin Stability',
    metric_id: 'net_margin_stability',
    kind: 'E1',
    sub_unit: null,
    sub_type: null,
    main_unit: '%',
    ref: null,
  },
  {
    group: 'Độ ổn định',
    name: 'EPS Stability',
    metric_id: 'eps_growth_stability',
    kind: 'E1',
    sub_unit: null,
    sub_type: null,
    main_unit: EPS,
    ref: null,
  },
  {
    group: 'Độ ổn định',
    name: 'ROIC Stability',
    metric_id: 'roic_stability',
    kind: 'E1',
    sub_unit: null,
    sub_type: null,
    main_unit: '%',
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'ROE',
    metric_id: 'roe',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'ROA',
    metric_id: 'roa',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'ROIC',
    metric_id: 'roic',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'Biên lợi nhuận gộp',
    metric_id: 'gross_margin',
    kind: 'B',
    sub_unit: T,
    sub_type: 'stacked',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'Biên lợi nhuận ròng',
    metric_id: 'net_margin',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'Asset Turnover',
    metric_id: 'asset_turnover',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Hiệu quả và biên lợi nhuận',
    name: 'Cash Conversion Cycle',
    metric_id: 'ccc',
    kind: 'C',
    sub_unit: 'ngày',
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Nợ và khả năng thanh toán',
    name: 'D/E',
    metric_id: 'debt_equity',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Nợ và khả năng thanh toán',
    name: 'Current Ratio',
    metric_id: 'current_ratio',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Nợ và khả năng thanh toán',
    name: 'Interest Coverage',
    metric_id: 'interest_coverage',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Nợ và khả năng thanh toán',
    name: 'Net Debt / EBITDA',
    metric_id: 'net_debt_ebitda',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Dòng tiền',
    name: 'CFO Margin',
    metric_id: 'cfo_margin',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Dòng tiền',
    name: 'CFO / LNST',
    metric_id: 'cfo_profit',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Dòng tiền',
    name: 'Capex / Revenue',
    metric_id: 'capex_revenue',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Dòng tiền',
    name: 'FCF Margin',
    metric_id: 'fcf_margin',
    kind: 'B',
    sub_unit: T,
    sub_type: 'grouped',
    main_unit: null,
    ref: null,
  },
  {
    group: 'Dòng tiền',
    name: 'FCF Positive Streak',
    metric_id: 'fcf_positive_streak',
    kind: 'E2',
    sub_unit: null,
    sub_type: null,
    main_unit: T,
    ref: null,
  },
  {
    group: 'Định giá',
    name: 'P/E',
    metric_id: 'pe',
    kind: 'F',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: null,
  },
  {
    group: 'Định giá',
    name: 'P/B',
    metric_id: 'pb',
    kind: 'F',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: null,
  },
  {
    group: 'Định giá',
    name: 'P/S',
    metric_id: 'ps',
    kind: 'F',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: null,
  },
  {
    group: 'Định giá',
    name: 'PEG',
    metric_id: 'peg',
    kind: 'F2',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: 1,
  },
  {
    group: 'Định giá',
    name: 'EV / EBITDA',
    metric_id: 'ev_ebitda',
    kind: 'F',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: null,
  },
  {
    group: 'Định giá',
    name: 'FCF Yield',
    metric_id: 'fcf_yield',
    kind: 'F',
    sub_unit: null,
    sub_type: null,
    main_unit: null,
    ref: null,
  },
] as const satisfies readonly DashboardChartSpec[];

/** Flat list of the 33 charts, in the order of spec §8. */
export const DASHBOARD_CHARTS = CHART_LIST;

/** The 33 metric ids of the dashboard (a subset of the Bộ lọc registry). */
export type DashboardMetricId = (typeof DASHBOARD_CHARTS)[number]['metric_id'];

/** The 6 groups of the catalogue, in the order of spec §8. */
export const DASHBOARD_GROUPS = [...new Set(CHART_LIST.map((chart) => chart.group))].map(
  (group) => ({
    group,
    items: CHART_LIST.filter((chart) => chart.group === group),
  }),
);

/** Display names of the 33 charts (the key of a chart in the saved settings). */
export const DASHBOARD_CHART_NAMES = CHART_LIST.map((chart) => chart.name);

/** Charts of the default dashboard (spec §6.3). */
export const DASHBOARD_DEFAULT_CHARTS = [
  'Tăng trưởng doanh thu',
  'Tăng trưởng LNST',
  'Biên lợi nhuận ròng',
  'ROE',
  'D/E',
  'P/E',
] as const;

const CHART_BY_NAME = new Map<string, DashboardChartSpec>(
  CHART_LIST.map((chart) => [chart.name, chart] as const),
);

export function dashboardChart(name: string): DashboardChartSpec | null {
  return CHART_BY_NAME.get(name) ?? null;
}

export function isDashboardChartName(name: string): boolean {
  return CHART_BY_NAME.has(name);
}

/**
 * Một chỉ tiêu có áp dụng cho ngân hàng không (spec §7).
 * Registry Bộ lọc đã phân loại sẵn: `applicability = 'all'` là chỉ tiêu áp dụng cho mã ngân hàng,
 * `non_financial` là chỉ tiêu không áp dụng. Không tự đặt thêm ngưỡng riêng.
 */
export function appliesToBank(metricId: ScreenerMetricId): boolean {
  return fundamentalMetric(metricId).applicability === 'all';
}

/** Display unit of a metric (registry): '%', 'điểm %', 'lần', 'ngày', 'năm'. */
export function dashboardUnit(metricId: ScreenerMetricId): string {
  return fundamentalMetric(metricId).unit;
}

/** Số chữ số thập phân theo đơn vị (spec §10). */
export function dashboardDecimals(unit: string): number {
  if (unit === 'lần') return 2;
  if (unit === '%' || unit === 'điểm %') return 1;
  return 0;
}
