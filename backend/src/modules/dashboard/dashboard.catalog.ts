/**
 * Danh mục chỉ tiêu của Dashboard phân tích v3 theo CẶP (ngành, tên) (spec v3 §3.2, §8) và bộ mặc
 * định từng ngành (§6.3). 9 ngành, 90 tên khác nhau, 260 cặp.
 *
 * Mỗi ngành có hai nhóm cấp 1: "Chỉ tiêu chung" (17 chỉ tiêu chung, bỏ những chỉ tiêu ngành có bài
 * dạy lại) và "Chỉ tiêu <ngành>" (gồm cả chỉ tiêu dạy lại). Thứ tự nhóm, tên nhóm và tên chỉ tiêu
 * lấy nguyên `SEC`/`DEFS` của bản mẫu `IQX-Dashboard-Phan-Tich-v3-MAU.html`.
 *
 * - `metric_id`: khoá công thức. 33 chỉ tiêu v1 dùng id registry Bộ lọc (`screener.registry.ts`),
 *   29 chỉ tiêu ngành của v2 có công thức ở `dashboard.native.ts`.
 * - `metric_key`: khoá bài học của Học viện v5 (tìm bài theo `(metric_key, nganh)`). Bằng
 *   `metric_id`, trừ 3 biến thể công thức của chỉ tiêu dạy lại (PLAN D7).
 * - 28 chỉ tiêu mới + 3 biến thể (`PENDING_V3_METRIC_IDS`) chưa có công thức (T2 viết): mục của
 *   chúng mang `pending: true`.
 */
import { fundamentalMetric, type ScreenerMetricId } from '../screener/screener.registry.js';
import {
  COMMON_ACADEMY_CHAPTER,
  NGANH,
  NGANH_ACADEMY_CHAPTERS,
  NGANH_CHAPTER_TITLES,
  NGANH_LABELS,
  type Nganh,
} from './dashboard.nganh.js';

export { NGANH, NGANH_LABELS };
export type { Nganh };

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

/** Nhóm cấp 1 của danh mục: phần chung (Học viện Ch. 8) hoặc phần riêng của một ngành. */
export type DashboardScope = 'chung' | Nganh;

export const DASHBOARD_SCOPES = ['chung', ...NGANH] as const;

export interface DashboardChapterInfo {
  /** Tiêu đề nhóm cấp 1 ở khung "Biểu đồ" (§3.2): "Chỉ tiêu chung", "Chỉ tiêu ngân hàng"... */
  title: string;
  /**
   * Chương CỐ ĐỊNH của Học viện v5 (8 chung, 9–17 theo ngành) chứa bài học của chỉ tiêu. Không
   * phải số chương người học thấy: đừng hiển thị. Nút "Học" nối bài theo `(metric_key, nganh)`.
   */
  academy_chapter: number;
}

export const DASHBOARD_CHAPTERS: Readonly<Record<DashboardScope, DashboardChapterInfo>> = {
  chung: { title: 'Chỉ tiêu chung', academy_chapter: COMMON_ACADEMY_CHAPTER },
  ...(Object.fromEntries(
    NGANH.map((nganh) => [
      nganh,
      { title: NGANH_CHAPTER_TITLES[nganh], academy_chapter: NGANH_ACADEMY_CHAPTERS[nganh] },
    ]),
  ) as Record<Nganh, DashboardChapterInfo>),
};

/** Id của 29 chỉ tiêu ngành của v2 (công thức ở `dashboard.native.ts`). */
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

/**
 * 28 chỉ tiêu mới của v3 (PLAN §6.3). Các id này LÀ `metric_key` — hợp đồng với Học viện v5
 * (khoá bài `(metric_key, nganh)`): không đổi tên.
 */
export const V3_NEW_METRIC_IDS = [
  'non_core_profit_to_pbt',
  'buyer_prepay_to_revenue',
  'buyer_prepay_growth',
  'unearned_to_equity',
  'inventory_to_assets',
  'inventory_years',
  'investment_property_share',
  'prepay_receivables_to_equity',
  'st_debt_share',
  'cash_to_st_debt',
  'interest_paid_to_expense',
  'inventory_days',
  'depreciation_to_revenue',
  'capex_to_depreciation',
  'net_cash_to_equity',
  'fin_income_to_pbt',
  'dividend_payout',
  'sga_to_revenue',
  'core_margin',
  'inventory_provision_ratio',
  'payables_to_inventory',
  'st_debt_to_inventory',
  'revenue_to_fixed_assets',
  'ebitda_margin',
  'fixed_assets_to_assets',
  'cip_to_fixed_assets',
  'receivable_days',
  'non_interest_fin_cost_to_pbt',
] as const;
export type V3NewMetricId = (typeof V3_NEW_METRIC_IDS)[number];

/** Ba biến thể công thức của chỉ tiêu dạy lại: `metric_id` → `metric_key` (PLAN §6.2, D7). */
export const V3_VARIANT_METRIC_KEYS = {
  roe_fin: 'roe',
  net_margin_bh: 'net_margin',
  gross_margin_q: 'gross_margin',
} as const satisfies Record<string, ScreenerMetricId>;
export type V3VariantMetricId = keyof typeof V3_VARIANT_METRIC_KEYS;

/**
 * 31 id chưa có công thức ở dashboard (28 mới + 3 biến thể). T2 chuyển chúng vào
 * `NATIVE_METRIC_IDS` khi viết công thức và gỡ cờ `pending`.
 */
export const PENDING_V3_METRIC_IDS = [
  ...V3_NEW_METRIC_IDS,
  ...(Object.keys(V3_VARIANT_METRIC_KEYS) as V3VariantMetricId[]),
] as const;
export type PendingV3MetricId = V3NewMetricId | V3VariantMetricId;

export interface DashboardChartSpec {
  /** Ngành của cặp (ngành, tên). */
  nganh: Nganh;
  /** Nhóm cấp 1: chung hoặc ngành (`DASHBOARD_CHAPTERS`). */
  chapter: DashboardScope;
  /** Tiêu đề nhóm cấp 1 (§3.2). */
  chapter_title: string;
  /** Chương Học viện v5 chứa bài học (8 chung, 9–17 theo ngành). */
  academy_chapter: number;
  /** Tên nhóm cấp 2 (§8). */
  group: string;
  /** Display name (Vietnamese): the key of a chart in the saved settings and in the query. */
  name: string;
  /** Khoá công thức. */
  metric_id: string;
  /** Khoá bài học của Học viện (`= metric_id`, trừ 3 biến thể). */
  metric_key: string;
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
  /** Mốc tham chiếu: PEG = 1 (F2), combined ratio = 100, 4 chỉ tiêu mốc 1 lần (§9). */
  ref: number | null;
  /**
   * Chỉ tiêu tính bằng registry Bộ lọc; null khi công thức nằm ở `dashboard.native.ts`. Ba biến thể
   * đang chờ (`pending`) tạm giữ id registry của chỉ tiêu gốc (công thức v2) cho tới khi T2 viết
   * công thức riêng.
   */
  registry_id: ScreenerMetricId | null;
  /** Chỉ tiêu v3 chưa có công thức riêng (`PENDING_V3_METRIC_IDS`). */
  pending: boolean;
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

/** Định nghĩa một chỉ tiêu, chưa gắn ngành và nhóm. */
interface ChartDef {
  metric_id: string;
  metric_key: string;
  kind: DashboardChartKind;
  unit: string;
  sub_unit: string | null;
  sub_type: DashboardSubType | null;
  main_unit: string | null;
  ref: number | null;
  registry_id: ScreenerMetricId | null;
  pending: boolean;
}

interface ChartOptions {
  sub?: readonly [unit: string, type: DashboardSubType];
  mainUnit?: string;
  ref?: number;
}

function def(
  metricId: string,
  kind: DashboardChartKind,
  unit: string,
  registryId: ScreenerMetricId | null,
  options: ChartOptions = {},
  extra: { metricKey?: string; pending?: boolean } = {},
): ChartDef {
  return {
    metric_id: metricId,
    metric_key: extra.metricKey ?? metricId,
    kind,
    unit,
    sub_unit: options.sub?.[0] ?? null,
    sub_type: options.sub?.[1] ?? null,
    main_unit: options.mainUnit ?? null,
    ref: options.ref ?? null,
    registry_id: registryId,
    pending: extra.pending ?? false,
  };
}

/** Chỉ tiêu của registry Bộ lọc: đơn vị lấy từ registry, không viết lại. */
const registry = (id: ScreenerMetricId, kind: DashboardChartKind, options: ChartOptions = {}) =>
  def(id, kind, fundamentalMetric(id).unit, id, options);

/** Chỉ tiêu ngành của v2: công thức ở `dashboard.native.ts`. */
const native = (
  id: NativeMetricId,
  kind: DashboardChartKind,
  unit: string,
  options: ChartOptions = {},
) => def(id, kind, unit, null, options);

/** Chỉ tiêu mới của v3: chưa có công thức (T2). */
const fresh = (
  id: V3NewMetricId,
  kind: DashboardChartKind,
  unit: string,
  options: ChartOptions = {},
) => def(id, kind, unit, null, options, { pending: true });

/** Biến thể công thức của chỉ tiêu dạy lại; tạm tính bằng công thức gốc (registry). */
const variant = (
  id: V3VariantMetricId,
  kind: DashboardChartKind,
  unit: string,
  options: ChartOptions = {},
) => {
  const key = V3_VARIANT_METRIC_KEYS[id];
  return def(id, kind, unit, key, options, { metricKey: key, pending: true });
};

const grouped = (unit: string): ChartOptions => ({ sub: [unit, 'grouped'] });
const stacked = (unit: string): ChartOptions => ({ sub: [unit, 'stacked'] });
const fixed = (mainUnit: string): ChartOptions => ({ mainUnit });
const refOne = (unit: string): ChartOptions => ({ sub: [unit, 'grouped'], ref: 1 });

/** 90 tên chỉ tiêu → định nghĩa mặc định (dùng ở mọi ngành trừ khi `VARIANTS` ghi đè). */
const DEFS: Readonly<Record<string, ChartDef>> = {
  // Chung (Chương 8)
  'Tăng trưởng doanh thu': registry('revenue_yoy', 'A', grouped(T)),
  'Tăng trưởng LNST': registry('profit_yoy', 'A', grouped(T)),
  'Tăng trưởng EPS': registry('eps_yoy', 'A', grouped(EPS)),
  'Revenue CAGR 3Y': registry('revenue_cagr3', 'D', fixed(T)),
  'Net Profit CAGR 3Y': registry('profit_cagr3', 'D', fixed(T)),
  'EPS CAGR 3Y': registry('eps_cagr3', 'D', fixed(EPS)),
  'Profit Positive Streak': registry('profit_positive_streak', 'E2', fixed(T)),
  'Revenue Growth Stability': registry('revenue_growth_stability', 'E1', fixed('%')),
  'Margin Stability': registry('net_margin_stability', 'E1', fixed('%')),
  'EPS Stability': registry('eps_growth_stability', 'E1', fixed(EPS)),
  ROE: registry('roe', 'B', grouped(T)),
  ROA: registry('roa', 'B', grouped(T)),
  'Biên lợi nhuận ròng': registry('net_margin', 'B', grouped(T)),
  'P/E': registry('pe', 'F'),
  'P/B': registry('pb', 'F'),
  'P/S': registry('ps', 'F'),
  PEG: registry('peg', 'F2', { ref: 1 }),
  // Doanh nghiệp sản xuất (Chương 9)
  'Biên lợi nhuận gộp': registry('gross_margin', 'B', stacked(T)),
  ROIC: registry('roic', 'B', grouped(T)),
  'ROIC Stability': registry('roic_stability', 'E1', fixed('%')),
  'Asset Turnover': registry('asset_turnover', 'B', grouped(T)),
  'Cash Conversion Cycle': registry('ccc', 'C', grouped('ngày')),
  'D/E': registry('debt_equity', 'B', grouped(T)),
  'Current Ratio': registry('current_ratio', 'B', grouped(T)),
  'Interest Coverage': registry('interest_coverage', 'B', grouped(T)),
  'Net Debt / EBITDA': registry('net_debt_ebitda', 'B', grouped(T)),
  'CFO Margin': registry('cfo_margin', 'B', grouped(T)),
  'CFO / LNST': registry('cfo_profit', 'B', grouped(T)),
  'Capex / Revenue': registry('capex_revenue', 'B', grouped(T)),
  'FCF Margin': registry('fcf_margin', 'B', grouped(T)),
  'FCF Positive Streak': registry('fcf_positive_streak', 'E2', fixed(T)),
  'EV / EBITDA': registry('ev_ebitda', 'F'),
  'FCF Yield': registry('fcf_yield', 'F'),
  // Ngân hàng (Chương 10)
  NIM: native('nim', 'B', '%', grouped(T)),
  'Lợi suất tài sản sinh lãi và chi phí vốn': native('yield_cost', 'B', '%', grouped(T)),
  CIR: native('cir', 'B', '%', grouped(T)),
  'Tỷ trọng thu nhập ngoài lãi': native('non_interest_share', 'B', '%', stacked(T)),
  'Tăng trưởng lợi nhuận trước dự phòng': native('ppop_growth', 'A', '%', grouped(T)),
  'Chi phí tín dụng': native('credit_cost', 'B', '%', grouped(T)),
  'Tỷ lệ dự phòng / Dư nợ': native('provision_to_loans', 'B', '%', grouped(T)),
  'Lãi dự thu / Dư nợ': native('accrued_to_loans', 'B', '%', grouped(T)),
  'Tăng trưởng tín dụng và huy động': native('credit_deposit_growth', 'A', '%', grouped(NGHIN_TY)),
  LDR: native('ldr', 'B', '%', grouped(NGHIN_TY)),
  'VCSH / Tổng tài sản': native('equity_to_assets', 'B', '%', grouped(NGHIN_TY)),
  // Chứng khoán (Chương 11)
  'Cơ cấu doanh thu hoạt động': native('revenue_mix', 'B', '%', stacked(T)),
  'Biên lợi nhuận hoạt động': native('operating_margin', 'B', '%', stacked(T)),
  'Chi phí hoạt động / Doanh thu hoạt động': native('opex_to_revenue', 'B', '%', grouped(T)),
  'Tăng trưởng dư nợ cho vay': native('margin_loan_growth', 'A', '%', grouped(T)),
  'Dư nợ cho vay / VCSH': native('margin_loan_to_equity', 'B', 'lần', grouped(T)),
  'Lợi suất cho vay': native('margin_loan_yield', 'B', '%', grouped(T)),
  'Biên lợi nhuận môi giới': native('brokerage_margin', 'B', '%', grouped(T)),
  'Tỷ trọng tài sản tự doanh': native('prop_asset_share', 'B', '%', stacked(T)),
  'Hiệu suất tự doanh': native('prop_return', 'B', '%', grouped(T)),
  'Nợ vay / VCSH': native('borrowings_to_equity', 'B', 'lần', grouped(T)),
  // Bảo hiểm (Chương 12)
  'Tăng trưởng doanh thu phí bảo hiểm gốc': native('gwp_growth', 'A', '%', grouped(T)),
  'Tỷ lệ giữ lại': native('retention_ratio', 'B', '%', grouped(T)),
  'Tỷ lệ bồi thường': native('loss_ratio', 'B', '%', grouped(T)),
  'Tỷ lệ chi phí': native('expense_ratio', 'B', '%', grouped(T)),
  'Combined ratio': native('combined_ratio', 'B', '%', { sub: ['%', 'stacked'], ref: 100 }),
  'Lợi suất đầu tư': native('investment_yield', 'B', '%', grouped(T)),
  'Cơ cấu lợi nhuận': native('profit_mix', 'B', '%', grouped(T)),
  'Dự phòng nghiệp vụ / VCSH': native('reserves_to_equity', 'B', 'lần', grouped(T)),
  // Mới ở v3 (Chương 13–17): khuôn, đơn vị, mốc và kiểu cột theo MAU và PLAN §6.3
  'Lợi nhuận ngoài kinh doanh bất động sản / LNTT': fresh('non_core_profit_to_pbt', 'B', '%', grouped(T)),
  'Người mua trả tiền trước / Doanh thu': fresh('buyer_prepay_to_revenue', 'B', 'lần', grouped(T)),
  'Tăng trưởng người mua trả tiền trước': fresh('buyer_prepay_growth', 'A', '%', grouped(T)),
  'Doanh thu chưa thực hiện / VCSH': fresh('unearned_to_equity', 'B', '%', grouped(T)),
  'Tồn kho / Tổng tài sản': fresh('inventory_to_assets', 'B', '%', grouped(T)),
  'Số năm bán hết tồn kho': fresh('inventory_years', 'B', 'năm', grouped(T)),
  'Tỷ trọng bất động sản đầu tư': fresh('investment_property_share', 'B', '%', stacked(T)),
  'Phải thu và trả trước / VCSH': fresh('prepay_receivables_to_equity', 'B', '%', stacked(T)),
  'Tỷ trọng nợ vay ngắn hạn': fresh('st_debt_share', 'B', '%', stacked(T)),
  'Tiền / Nợ vay ngắn hạn': fresh('cash_to_st_debt', 'B', 'lần', refOne(T)),
  'Lãi vay đã trả / Chi phí lãi vay': fresh('interest_paid_to_expense', 'B', 'lần', refOne(T)),
  'Số ngày tồn kho': fresh('inventory_days', 'B', 'ngày', grouped(T)),
  'Khấu hao / Doanh thu': fresh('depreciation_to_revenue', 'B', '%', grouped(T)),
  'Capex / Khấu hao': fresh('capex_to_depreciation', 'B', 'lần', refOne(T)),
  'Tiền ròng / VCSH': fresh('net_cash_to_equity', 'B', '%', grouped(T)),
  'Thu nhập tài chính / LNTT': fresh('fin_income_to_pbt', 'B', '%', grouped(T)),
  'Tỷ lệ chi trả cổ tức': fresh('dividend_payout', 'B', '%', grouped(T)),
  'Chi phí bán hàng và quản lý / Doanh thu': fresh('sga_to_revenue', 'B', '%', stacked(T)),
  'Biên lợi nhuận kinh doanh chính': fresh('core_margin', 'B', '%', grouped(T)),
  'Dự phòng giảm giá tồn kho / Tồn kho': fresh('inventory_provision_ratio', 'B', '%', grouped(T)),
  'Phải trả người bán / Tồn kho': fresh('payables_to_inventory', 'B', 'lần', refOne(T)),
  'Vay ngắn hạn / Tồn kho': fresh('st_debt_to_inventory', 'B', 'lần', grouped(T)),
  'Doanh thu / Tài sản cố định': fresh('revenue_to_fixed_assets', 'B', 'lần', grouped(T)),
  'Biên EBITDA': fresh('ebitda_margin', 'B', '%', stacked(T)),
  'Tài sản cố định / Tổng tài sản': fresh('fixed_assets_to_assets', 'B', '%', grouped(T)),
  'Xây dựng dở dang / Tài sản cố định': fresh('cip_to_fixed_assets', 'B', '%', grouped(T)),
  'Số ngày thu tiền': fresh('receivable_days', 'B', 'ngày', grouped(T)),
  'Chi phí tài chính ngoài lãi vay / LNTT': fresh('non_interest_fin_cost_to_pbt', 'B', '%', grouped(T)),
};

/** Biến thể theo ngành của chỉ tiêu dạy lại (PLAN §6.2). */
const ROE_FIN = variant('roe_fin', 'B', '%', grouped('lần'));
const GROSS_MARGIN_Q = variant('gross_margin_q', 'B', '%', stacked(T));
const VARIANTS: Partial<Record<Nganh, Readonly<Record<string, ChartDef>>>> = {
  nh: { ROE: ROE_FIN },
  ck: { ROE: ROE_FIN },
  bh: { ROE: ROE_FIN, 'Biên lợi nhuận ròng': variant('net_margin_bh', 'B', '%', grouped(T)) },
  dk: { 'Biên lợi nhuận gộp': GROSS_MARGIN_Q },
  vl: { 'Biên lợi nhuận gộp': GROSS_MARGIN_Q },
};

type Layout = readonly (readonly [group: string, names: readonly string[]])[];

const COMMON_GROWTH_NO_REVENUE = [
  'Tăng trưởng LNST',
  'Tăng trưởng EPS',
  'Revenue CAGR 3Y',
  'Net Profit CAGR 3Y',
  'EPS CAGR 3Y',
] as const;
const COMMON_GROWTH = ['Tăng trưởng doanh thu', ...COMMON_GROWTH_NO_REVENUE] as const;
const STABILITY = [
  'Profit Positive Streak',
  'Revenue Growth Stability',
  'Margin Stability',
  'EPS Stability',
] as const;
const STABILITY_NO_MARGIN = [
  'Profit Positive Streak',
  'Revenue Growth Stability',
  'EPS Stability',
] as const;
const EFFICIENCY = ['ROE', 'ROA', 'Biên lợi nhuận ròng'] as const;

/** Bố cục hai nhóm cấp 1 của từng ngành, đúng `SEC` của MAU (§3.2, §8). */
const LAYOUT: Readonly<Record<Nganh, readonly [common: Layout, own: Layout]>> = {
  thuong: [
    [
      ['Tăng trưởng', COMMON_GROWTH],
      ['Ổn định', STABILITY],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/E', 'P/B', 'P/S', 'PEG']],
    ],
    [
      [
        'Hiệu quả và biên lợi nhuận',
        ['Biên lợi nhuận gộp', 'ROIC', 'ROIC Stability', 'Asset Turnover', 'Cash Conversion Cycle'],
      ],
      ['Nợ và khả năng thanh toán', ['D/E', 'Current Ratio', 'Interest Coverage', 'Net Debt / EBITDA']],
      ['Dòng tiền', ['CFO Margin', 'CFO / LNST', 'Capex / Revenue', 'FCF Margin', 'FCF Positive Streak']],
      ['Định giá', ['EV / EBITDA', 'FCF Yield']],
    ],
  ],
  nh: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY],
      ['Hiệu quả', ['Biên lợi nhuận ròng']],
      ['Định giá', ['P/E', 'P/S', 'PEG']],
    ],
    [
      [
        'Thu nhập và hiệu quả',
        [
          'Tăng trưởng doanh thu',
          'NIM',
          'Lợi suất tài sản sinh lãi và chi phí vốn',
          'CIR',
          'Tỷ trọng thu nhập ngoài lãi',
          'Tăng trưởng lợi nhuận trước dự phòng',
          'ROE',
          'ROA',
        ],
      ],
      ['Rủi ro tín dụng', ['Chi phí tín dụng', 'Tỷ lệ dự phòng / Dư nợ', 'Lãi dự thu / Dư nợ']],
      ['Quy mô và vốn', ['Tăng trưởng tín dụng và huy động', 'LDR', 'VCSH / Tổng tài sản']],
      ['Định giá', ['P/B']],
    ],
  ],
  ck: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY_NO_MARGIN],
      ['Hiệu quả', ['ROA', 'Biên lợi nhuận ròng']],
      ['Định giá', ['P/E', 'P/S', 'PEG']],
    ],
    [
      [
        'Doanh thu và chi phí',
        [
          'Tăng trưởng doanh thu',
          'Cơ cấu doanh thu hoạt động',
          'Biên lợi nhuận hoạt động',
          'Margin Stability',
        ],
      ],
      ['Cho vay margin', ['Tăng trưởng dư nợ cho vay', 'Dư nợ cho vay / VCSH', 'Lợi suất cho vay']],
      [
        'Môi giới và tự doanh',
        ['Biên lợi nhuận môi giới', 'Tỷ trọng tài sản tự doanh', 'Hiệu suất tự doanh'],
      ],
      [
        'Chi phí, đòn bẩy và hiệu quả',
        ['Chi phí hoạt động / Doanh thu hoạt động', 'Nợ vay / VCSH', 'ROE'],
      ],
      ['Định giá', ['P/B']],
    ],
  ],
  bh: [
    [
      ['Tăng trưởng', COMMON_GROWTH],
      ['Ổn định', STABILITY],
      ['Hiệu quả', ['ROA']],
      ['Định giá', ['P/E', 'P/S', 'PEG']],
    ],
    [
      ['Doanh thu phí', ['Tăng trưởng doanh thu phí bảo hiểm gốc', 'Tỷ lệ giữ lại']],
      ['Hiệu quả nghiệp vụ', ['Tỷ lệ bồi thường', 'Tỷ lệ chi phí', 'Combined ratio']],
      [
        'Đầu tư và lợi nhuận',
        ['Lợi suất đầu tư', 'Cơ cấu lợi nhuận', 'Biên lợi nhuận ròng', 'ROE'],
      ],
      ['Dự phòng', ['Dự phòng nghiệp vụ / VCSH']],
      ['Định giá', ['P/B']],
    ],
  ],
  bds: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', ['Profit Positive Streak', 'Margin Stability', 'EPS Stability']],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/S', 'PEG']],
    ],
    [
      [
        'Doanh thu và lợi nhuận',
        [
          'Tăng trưởng doanh thu',
          'Revenue Growth Stability',
          'Biên lợi nhuận gộp',
          'Lợi nhuận ngoài kinh doanh bất động sản / LNTT',
        ],
      ],
      [
        'Doanh thu chờ ghi nhận',
        [
          'Người mua trả tiền trước / Doanh thu',
          'Tăng trưởng người mua trả tiền trước',
          'Doanh thu chưa thực hiện / VCSH',
        ],
      ],
      [
        'Tồn kho và tài sản',
        [
          'Tồn kho / Tổng tài sản',
          'Số năm bán hết tồn kho',
          'Tỷ trọng bất động sản đầu tư',
          'Phải thu và trả trước / VCSH',
        ],
      ],
      [
        'Nợ và dòng tiền',
        [
          'D/E',
          'Tỷ trọng nợ vay ngắn hạn',
          'Tiền / Nợ vay ngắn hạn',
          'Lãi vay đã trả / Chi phí lãi vay',
          'Interest Coverage',
          'CFO / LNST',
        ],
      ],
      ['Định giá', ['P/E', 'P/B']],
    ],
  ],
  dk: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY_NO_MARGIN],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/B', 'P/S', 'PEG']],
    ],
    [
      [
        'Doanh thu và biên lợi nhuận',
        ['Tăng trưởng doanh thu', 'Biên lợi nhuận gộp', 'Margin Stability', 'Số ngày tồn kho'],
      ],
      ['Tài sản và đầu tư', ['Khấu hao / Doanh thu', 'Capex / Khấu hao', 'ROIC', 'FCF Margin']],
      ['Tiền và nợ', ['Tiền ròng / VCSH', 'Net Debt / EBITDA', 'Thu nhập tài chính / LNTT']],
      ['Đơn hàng và cổ tức', ['Người mua trả tiền trước / Doanh thu', 'Tỷ lệ chi trả cổ tức']],
      ['Định giá', ['P/E', 'EV / EBITDA']],
    ],
  ],
  bl: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/B', 'P/S', 'PEG']],
    ],
    [
      [
        'Doanh thu và biên lợi nhuận',
        [
          'Tăng trưởng doanh thu',
          'Biên lợi nhuận gộp',
          'Chi phí bán hàng và quản lý / Doanh thu',
          'Biên lợi nhuận kinh doanh chính',
        ],
      ],
      [
        'Vốn lưu động',
        [
          'Số ngày tồn kho',
          'Dự phòng giảm giá tồn kho / Tồn kho',
          'Phải trả người bán / Tồn kho',
          'Cash Conversion Cycle',
          'Vay ngắn hạn / Tồn kho',
        ],
      ],
      ['Hiệu quả và cổ tức', ['Doanh thu / Tài sản cố định', 'ROIC', 'Tỷ lệ chi trả cổ tức']],
      ['Định giá', ['P/E']],
    ],
  ],
  dien: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY_NO_MARGIN],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/E', 'P/B', 'P/S', 'PEG']],
    ],
    [
      [
        'Doanh thu và biên lợi nhuận',
        ['Tăng trưởng doanh thu', 'Biên lợi nhuận gộp', 'Margin Stability', 'Biên EBITDA'],
      ],
      [
        'Tài sản và đầu tư',
        [
          'Khấu hao / Doanh thu',
          'Tài sản cố định / Tổng tài sản',
          'Xây dựng dở dang / Tài sản cố định',
          'Capex / Khấu hao',
          'Số ngày thu tiền',
        ],
      ],
      [
        'Nợ và chi phí tài chính',
        ['D/E', 'Net Debt / EBITDA', 'Interest Coverage', 'Chi phí tài chính ngoài lãi vay / LNTT'],
      ],
      ['Cổ tức và định giá', ['Tỷ lệ chi trả cổ tức', 'EV / EBITDA']],
    ],
  ],
  vl: [
    [
      ['Tăng trưởng', COMMON_GROWTH_NO_REVENUE],
      ['Ổn định', STABILITY_NO_MARGIN],
      ['Hiệu quả', EFFICIENCY],
      ['Định giá', ['P/E', 'P/S', 'PEG']],
    ],
    [
      ['Doanh thu và biên lợi nhuận', ['Tăng trưởng doanh thu', 'Biên lợi nhuận gộp', 'Margin Stability']],
      [
        'Tồn kho',
        ['Số ngày tồn kho', 'Dự phòng giảm giá tồn kho / Tồn kho', 'Vay ngắn hạn / Tồn kho'],
      ],
      [
        'Tài sản và đầu tư',
        ['Biên EBITDA', 'Capex / Khấu hao', 'Xây dựng dở dang / Tài sản cố định', 'ROIC'],
      ],
      ['Nợ và chi phí tài chính', ['Net Debt / EBITDA', 'Chi phí tài chính ngoài lãi vay / LNTT']],
      ['Định giá', ['EV / EBITDA', 'P/B']],
    ],
  ],
};

function entry(nganh: Nganh, scope: DashboardScope, group: string, name: string): DashboardChartSpec {
  const base = VARIANTS[nganh]?.[name] ?? DEFS[name];
  if (!base) throw new Error(`Dashboard catalog: '${name}' has no definition`);
  const chapter = DASHBOARD_CHAPTERS[scope];
  return {
    nganh,
    chapter: scope,
    chapter_title: chapter.title,
    academy_chapter: chapter.academy_chapter,
    group,
    name,
    ...base,
  };
}

/** Hai nhóm cấp 1 của mỗi ngành, mỗi nhóm chia nhóm cấp 2 (spec §3.2): nhóm chung trước. */
export const DASHBOARD_INDUSTRY_CHAPTERS: Readonly<Record<Nganh, readonly DashboardChapterSpec[]>> =
  Object.fromEntries(
    NGANH.map((nganh) => [
      nganh,
      (['chung', nganh] as const).map((scope, index) => ({
        scope,
        ...DASHBOARD_CHAPTERS[scope],
        groups: LAYOUT[nganh][index]!.map(([group, names]) => ({
          group,
          items: names.map((name) => entry(nganh, scope, group, name)),
        })),
      })),
    ]),
  ) as unknown as Record<Nganh, readonly DashboardChapterSpec[]>;

/** Chỉ tiêu của từng ngành theo thứ tự hiển thị: 33, 28, 27, 25, 32, 29, 28, 30, 28. */
export const DASHBOARD_INDUSTRY_CHARTS: Readonly<Record<Nganh, readonly DashboardChartSpec[]>> =
  Object.fromEntries(
    NGANH.map((nganh) => [
      nganh,
      DASHBOARD_INDUSTRY_CHAPTERS[nganh].flatMap((chapter) =>
        chapter.groups.flatMap((group) => group.items),
      ),
    ]),
  ) as unknown as Record<Nganh, readonly DashboardChartSpec[]>;

/** Số chỉ tiêu của từng ngành (N của "Đã chọn n/N", §3.1). */
export const DASHBOARD_INDUSTRY_COUNTS: Readonly<Record<Nganh, number>> = Object.fromEntries(
  NGANH.map((nganh) => [nganh, DASHBOARD_INDUSTRY_CHARTS[nganh].length]),
) as Record<Nganh, number>;

/** Mọi cặp (ngành, tên): 260 mục. */
export const DASHBOARD_CHARTS: readonly DashboardChartSpec[] = NGANH.flatMap(
  (nganh) => DASHBOARD_INDUSTRY_CHARTS[nganh],
);

/** 90 tên chỉ tiêu khác nhau (khoá của biểu đồ trong thiết lập và query). */
export const DASHBOARD_CHART_NAMES = [...new Set(DASHBOARD_CHARTS.map((chart) => chart.name))] as [
  string,
  ...string[],
];

/** Bộ mặc định 6 biểu đồ của từng ngành (spec §6.3, `DEFS` của MAU). */
export const DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY: Readonly<Record<Nganh, readonly string[]>> = {
  thuong: ['Tăng trưởng doanh thu', 'Tăng trưởng LNST', 'Biên lợi nhuận ròng', 'ROE', 'D/E', 'P/E'],
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
  bds: [
    'Người mua trả tiền trước / Doanh thu',
    'Tăng trưởng LNST',
    'Số năm bán hết tồn kho',
    'D/E',
    'Lãi vay đã trả / Chi phí lãi vay',
    'P/B',
  ],
  dk: [
    'Tăng trưởng doanh thu',
    'Biên lợi nhuận gộp',
    'Tăng trưởng LNST',
    'Tiền ròng / VCSH',
    'ROE',
    'EV / EBITDA',
  ],
  bl: [
    'Tăng trưởng doanh thu',
    'Biên lợi nhuận gộp',
    'Chi phí bán hàng và quản lý / Doanh thu',
    'Số ngày tồn kho',
    'ROIC',
    'P/E',
  ],
  dien: [
    'Tăng trưởng doanh thu',
    'Biên EBITDA',
    'Capex / Khấu hao',
    'D/E',
    'Interest Coverage',
    'EV / EBITDA',
  ],
  vl: [
    'Tăng trưởng doanh thu',
    'Biên lợi nhuận gộp',
    'Số ngày tồn kho',
    'Net Debt / EBITDA',
    'Capex / Khấu hao',
    'P/B',
  ],
};

/** Bộ mặc định của doanh nghiệp sản xuất (bộ mặc định của v1). */
export const DASHBOARD_DEFAULT_CHARTS = DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY.thuong;

const CHART_BY_PAIR = new Map<string, DashboardChartSpec>(
  DASHBOARD_CHARTS.map((chart) => [`${chart.nganh}\u0000${chart.name}`, chart] as const),
);
const NAME_SET = new Set<string>(DASHBOARD_CHART_NAMES);

/** Chỉ tiêu của cặp (ngành, tên); null khi tên không thuộc ngành. */
export function chartFor(nganh: Nganh, name: string): DashboardChartSpec | null {
  return CHART_BY_PAIR.get(`${nganh}\u0000${name}`) ?? null;
}

/** Tên có trong danh mục 90 tên (của ngành bất kỳ). */
export function isDashboardChartName(name: string): boolean {
  return NAME_SET.has(name);
}

/** Display unit of the main line (or of the summary value of the kinds D/E1/E2). */
export function dashboardUnit(chart: Pick<DashboardChartSpec, 'unit'>): string {
  return chart.unit;
}

/**
 * Số chữ số thập phân theo đơn vị (spec §10, PLAN D11): "lần" 2; "%" và "điểm %" 1; "năm" 1 trừ
 * khuôn E2 (chuỗi năm liên tiếp, số nguyên); tỷ đồng, đồng/CP, ngày 0.
 */
export function dashboardDecimals(unit: string, kind?: DashboardChartKind): number {
  if (unit === 'lần') return 2;
  if (unit === '%' || unit === 'điểm %') return 1;
  if (unit === 'năm') return kind === 'E2' ? 0 : 1;
  return 0;
}
