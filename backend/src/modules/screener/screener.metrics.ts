/**
 * Bộ lọc — pure metric calculator (calculation_version iqx-fund-2.0).
 *
 * Two layers:
 *  1. `calculateMetric(id, args)` — the registry formula on already-derived inputs, mirroring
 *     spec 03-REFERENCE-ENGINE/financial_reference.py but returning API units
 *     (unit "%" and "điểm %" travel as ratio: 15% = 0.15). `METRIC_ARG_UNITS` documents the
 *     argument order/units (same order as each registry `worked_fixture.inputs`).
 *  2. `screener.statements.ts` derives those arguments from normalized VCI statements.
 *
 * Null policies (registry `null_policy`, DATA-CONTRACT §3):
 *  - any required input missing/non-finite → `missing` (never 0);
 *  - growth: base ≤ 0 → `insufficient_base` (never abs(base), never 0%);
 *  - CAGR 3Y: every year point must be > 0, else `insufficient_base`;
 *  - stability: exactly 3 valid observations, population SD (÷3);
 *  - ratios: denominator ≤ 0 → `insufficient_base` (no Infinity, no "cheap" negative multiples);
 *    a negative numerator with a valid denominator is a valid negative value;
 *  - Interest Coverage with zero interest expense → `not_applicable` (no huge ratio);
 *  - streaks stop at ≤ 0 and never cross a missing year; an all-positive history is a
 *    lower bound (`lower_bound: true`).
 *
 * SUPPORT MATRIX (data source: VCI IQ financial statements years+quarters, VCI statistics-
 * financial share count, VCI price board; universe from the `symbols` directory table):
 *
 *  supported — revenue_yoy, profit_yoy, gross_margin, net_margin, roe, roa, debt_equity,
 *    net_debt_ebitda, current_ratio, interest_coverage, cfo_margin, cfo_profit, fcf_margin,
 *    fcf_yoy, capex_revenue, accrual, pe, pb, ps, ev_ebitda, fcf_yield, revenue_cagr3,
 *    profit_cagr3, asset_turnover, ccc, working_cap_turnover, revenue_growth_stability,
 *    net_margin_stability, fcf_positive_streak, profit_positive_streak, buyback_yield.
 *  documented variants —
 *    pe: EPS TTM = LNST cổ đông công ty mẹ TTM / số cổ phiếu cơ sở vốn hóa hiện tại (VCI
 *        numberOfSharesMktCap) so price and EPS share one share basis; reported per-quarter EPS
 *        is not adjusted for later bonus/split events and is never summed across bases.
 *    net debt / EV: eligible cash = tiền và tương đương tiền + đầu tư ngắn hạn.
 *    EBIT = LNTT + chi phí lãi vay; EBITDA = EBIT + khấu hao (+ phân bổ lợi thế thương mại).
 *    buyback_yield: (tiền chi mua lại/trả vốn góp − tiền thu phát hành cổ phiếu) TTM / vốn hóa.
 *    price: last matched price, or reference price when the session has no match yet.
 *  unsupported (supported:false, status `missing`) — eps_yoy, eps_cagr3, eps_growth_stability,
 *    peg (no split/bonus-adjusted EPS history), roic, roic_stability (no normalized tax-rate
 *    policy / operating-cash classification), dividend_yield, payout_ratio, dividend_cagr3,
 *    shareholder_yield (no per-share cash-dividend events by ex-date), share_count_yoy (no
 *    split/bonus event history to adjust the base share count).
 */
import { fundamentalMetric, type ScreenerMetricId } from './screener.registry.js';

/**
 * The ONE status enum of a metric cell (documented in the OpenAPI `screenerMetricResult`):
 *  - `ok`: `value` is valid (compare/sort on it unrounded); streak metrics may add `lower_bound`;
 *  - `missing`: a report, a component or the provider is missing — never counts as a pass;
 *  - `not_applicable`: the metric does not apply to this kind of company — never a pass;
 *  - `insufficient_base`: the base period/denominator is not positive, so no ordinary ratio exists;
 *  - `definition_pending`: no approved definition in the repo (the metric cannot run);
 *  - `data_unavailable`: defined, but the data source cannot supply its inputs (cannot run).
 */
export type MetricStatus =
  | 'ok'
  | 'missing'
  | 'not_applicable'
  | 'insufficient_base'
  | 'definition_pending'
  | 'data_unavailable';

export const METRIC_STATUSES = [
  'ok',
  'missing',
  'not_applicable',
  'insufficient_base',
  'definition_pending',
  'data_unavailable',
] as const satisfies readonly MetricStatus[];

export interface MetricValue {
  value: number | null;
  status: MetricStatus;
  reason?: string;
  /** Streak metrics: the whole available history is positive, so the value is a lower bound. */
  lower_bound?: boolean;
}

/** Units of each formula argument; `ratio` arguments are API ratios (display % ÷ 100). */
export type MetricArgUnit = 'amount' | 'ratio' | 'multiple' | 'days';

export const METRIC_REASONS = {
  missingInput: 'Thiếu dữ liệu đầu vào',
  nonPositiveBase: 'Kỳ gốc không dương — không đủ cơ sở tính tăng trưởng thông thường',
  nonPositivePoint: 'Có mốc năm không dương — không đủ cơ sở tính CAGR',
  nonPositiveDenominator: 'Mẫu số không dương — không diễn giải như tỷ số thông thường',
  invalidPrice: 'Giá không hợp lệ',
  noInterestExpense: 'Không phát sinh chi phí lãi vay',
  financialSector: 'Không áp dụng cho ngân hàng, bảo hiểm, chứng khoán',
  insufficientHistory: 'Chưa đủ lịch sử báo cáo liên tục',
  providerError: 'Nguồn dữ liệu tài chính tạm thời không khả dụng',
  priceUnavailable: 'Chưa có giá giao dịch hợp lệ',
  sharesUnavailable: 'Chưa có số cổ phiếu lưu hành',
  noReport: 'Chưa có báo cáo của kỳ cần dùng',
} as const;

const EPS_ADJUSTMENT =
  'Nguồn dữ liệu hiện tại chỉ có EPS báo cáo, chưa điều chỉnh tách/thưởng cổ phiếu; không ghép hai EPS khác cơ sở.';
const ROIC_INPUTS =
  'Chưa có thuế suất chuẩn hóa và phân loại tiền phục vụ hoạt động; không tự ước lượng NOPAT/vốn đầu tư.';
const DIVIDEND_EVENTS =
  'Chưa có nguồn cổ tức tiền mặt mỗi cổ phiếu theo ngày giao dịch không hưởng quyền đã điều chỉnh.';
const SHARE_EVENTS =
  'Chưa có hồ sơ sự kiện tách/gộp/thưởng cổ phiếu để điều chỉnh số cổ phiếu cùng kỳ.';

export const UNSUPPORTED_METRICS: Readonly<Partial<Record<ScreenerMetricId, string>>> = {
  eps_yoy: EPS_ADJUSTMENT,
  eps_cagr3: EPS_ADJUSTMENT,
  eps_growth_stability: EPS_ADJUSTMENT,
  peg: `${EPS_ADJUSTMENT} PEG cần tăng trưởng EPS YoY.`,
  roic: ROIC_INPUTS,
  roic_stability: ROIC_INPUTS,
  dividend_yield: DIVIDEND_EVENTS,
  payout_ratio: DIVIDEND_EVENTS,
  dividend_cagr3: DIVIDEND_EVENTS,
  shareholder_yield: `${DIVIDEND_EVENTS} Shareholder Yield cần Dividend Yield.`,
  share_count_yoy: SHARE_EVENTS,
};

export function metricSupport(id: ScreenerMetricId): {
  supported: boolean;
  unsupported_reason: string | null;
} {
  const reason = UNSUPPORTED_METRICS[id];
  return reason
    ? { supported: false, unsupported_reason: reason }
    : { supported: true, unsupported_reason: null };
}

/** Machine-readable cause of a non-ok cell (stable codes; the Vietnamese `reason` is for display). */
export const METRIC_REASON_CODES: Readonly<Record<keyof typeof METRIC_REASONS, string>> = {
  missingInput: 'missing_input',
  nonPositiveBase: 'non_positive_base',
  nonPositivePoint: 'non_positive_point',
  nonPositiveDenominator: 'non_positive_denominator',
  invalidPrice: 'invalid_price',
  noInterestExpense: 'no_interest_expense',
  financialSector: 'financial_sector',
  insufficientHistory: 'insufficient_history',
  providerError: 'provider_error',
  priceUnavailable: 'price_unavailable',
  sharesUnavailable: 'shares_unavailable',
  noReport: 'no_report',
};

export function reasonCode(status: MetricStatus, reason: string | undefined): string | undefined {
  if (status === 'ok') return undefined;
  const key = (Object.keys(METRIC_REASONS) as Array<keyof typeof METRIC_REASONS>).find(
    (name) => METRIC_REASONS[name] === reason,
  );
  return key ? METRIC_REASON_CODES[key] : status;
}

/** Registry readiness of a metric: only `ready` metrics run (no formula is ever invented). */
export function metricReadiness(id: ScreenerMetricId) {
  return fundamentalMetric(id).readiness;
}

const GROWTH = new Set<ScreenerMetricId>([
  'revenue_yoy',
  'profit_yoy',
  'eps_yoy',
  'fcf_yoy',
  'share_count_yoy',
]);
const CAGR = new Set<ScreenerMetricId>([
  'revenue_cagr3',
  'profit_cagr3',
  'eps_cagr3',
  'dividend_cagr3',
]);
const STDEV = new Set<ScreenerMetricId>([
  'revenue_growth_stability',
  'eps_growth_stability',
  'net_margin_stability',
  'roic_stability',
]);
const STREAK = new Set<ScreenerMetricId>(['fcf_positive_streak', 'profit_positive_streak']);

const A = 'amount' as const;
const R = 'ratio' as const;
const M = 'multiple' as const;
const D = 'days' as const;

/**
 * Formula argument order and units per metric (matches registry worked_fixture.inputs order).
 * `series` = chronological annual values (oldest → newest), any length ≥ 1.
 * CAGR accepts [end, base] and optionally the two intermediate year points after them.
 */
export const METRIC_ARG_UNITS: Readonly<
  Record<ScreenerMetricId, readonly MetricArgUnit[] | 'series'>
> = {
  revenue_yoy: [A, A],
  profit_yoy: [A, A],
  eps_yoy: [A, A],
  gross_margin: [A, A],
  net_margin: [A, A],
  roe: [A, A],
  roa: [A, A],
  roic: [A, A],
  debt_equity: [A, A],
  net_debt_ebitda: [A, A],
  current_ratio: [A, A],
  interest_coverage: [A, A],
  cfo_margin: [A, A],
  cfo_profit: [A, A],
  fcf_margin: [A, A],
  fcf_yoy: [A, A],
  capex_revenue: [A, A],
  accrual: [A, A],
  pe: [A, A],
  pb: [A, A],
  ps: [A, A],
  ev_ebitda: [A, A],
  peg: [M, R],
  fcf_yield: [A, A],
  revenue_cagr3: [A, A],
  profit_cagr3: [A, A],
  eps_cagr3: [A, A],
  asset_turnover: [A, A],
  ccc: [D, D, D],
  working_cap_turnover: [A, A],
  revenue_growth_stability: [R, R, R],
  eps_growth_stability: [R, R, R],
  net_margin_stability: [R, R, R],
  roic_stability: [R, R, R],
  fcf_positive_streak: 'series',
  profit_positive_streak: 'series',
  dividend_yield: [A, A],
  payout_ratio: [A, A],
  dividend_cagr3: [A, A],
  share_count_yoy: [A, A],
  buyback_yield: [A, A],
  shareholder_yield: [R, R],
};

type Arg = number | null | undefined;

const isFiniteNumber = (value: Arg): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const ok = (
  value: number,
  extra: Omit<MetricValue, 'value' | 'status'> = {},
): MetricValue => ({
  value,
  status: 'ok',
  ...extra,
});
export const missing = (reason: string = METRIC_REASONS.missingInput): MetricValue => ({
  value: null,
  status: 'missing',
  reason,
});
export const insufficientBase = (reason: string): MetricValue => ({
  value: null,
  status: 'insufficient_base',
  reason,
});
export const notApplicable = (reason: string): MetricValue => ({
  value: null,
  status: 'not_applicable',
  reason,
});
export const notRunnable = (
  status: 'definition_pending' | 'data_unavailable',
  reason: string,
): MetricValue => ({ value: null, status, reason });

/** Population standard deviation of exactly three observations (÷3, not ÷2). */
function populationStdev3(values: readonly number[]): number {
  const mean = (values[0]! + values[1]! + values[2]!) / 3;
  return Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / 3);
}

/**
 * Registry formula for one metric on derived inputs. Output is in the registry `api_unit`
 * (ratio for "%" / "điểm %"). Unsupported metrics are still computable here so the worked
 * fixtures stay verifiable; the data adapter never feeds them provider data.
 */
export function calculateMetric(id: ScreenerMetricId, args: readonly Arg[]): MetricValue {
  if (!args.length || !args.every(isFiniteNumber)) return missing();
  const a = args as readonly number[];

  if (STREAK.has(id)) {
    let streak = 0;
    for (let i = a.length - 1; i >= 0; i -= 1) {
      if (a[i]! <= 0) break;
      streak += 1;
    }
    return streak === a.length ? ok(streak, { lower_bound: true }) : ok(streak);
  }
  if (STDEV.has(id)) {
    if (a.length !== 3) return missing(METRIC_REASONS.insufficientHistory);
    return ok(populationStdev3(a));
  }
  if (id === 'ccc') {
    if (a.length !== 3) return missing();
    return ok(a[0]! + a[1]! - a[2]!);
  }
  if (CAGR.has(id)) {
    if (a.length !== 2 && a.length !== 4) return missing();
    if (a.some((x) => x <= 0)) return insufficientBase(METRIC_REASONS.nonPositivePoint);
    return ok((a[0]! / a[1]!) ** (1 / 3) - 1);
  }
  if (a.length !== 2) return missing();
  const [x, y] = a as [number, number];

  if (id === 'shareholder_yield') return ok(x + y);
  if (GROWTH.has(id)) {
    if (y <= 0) return insufficientBase(METRIC_REASONS.nonPositiveBase);
    return ok(x / y - 1);
  }
  if (id === 'peg') {
    // PEG = P/E ÷ EPS growth in percentage points; growth arrives as an API ratio.
    if (x <= 0 || y <= 0) return insufficientBase(METRIC_REASONS.nonPositiveDenominator);
    return ok(x / (y * 100));
  }
  if (id === 'interest_coverage' && y === 0) return notApplicable(METRIC_REASONS.noInterestExpense);
  if (id === 'pe' && x <= 0) return missing(METRIC_REASONS.invalidPrice);
  if (y <= 0) return insufficientBase(METRIC_REASONS.nonPositiveDenominator);
  return ok(x / y);
}

/** Display unit → API unit codec ("%"/"điểm %" ÷ 100; lần/ngày/năm unchanged). */
export function displayToApi(value: number, unit: string): number {
  return unit === '%' || unit === 'điểm %' ? value / 100 : value;
}
