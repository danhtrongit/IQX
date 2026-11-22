/**
 * Công thức của các chỉ tiêu không có trong registry Bộ lọc: 29 chỉ tiêu của ngân hàng, chứng khoán
 * và bảo hiểm (v2, spec §8.3–§8.5), 28 chỉ tiêu mới của 5 ngành v3 (spec v3 §8.6–§8.10, PLAN §6.3)
 * và 3 biến thể công thức của chỉ tiêu dạy lại (PLAN §6.2). Chúng được tính trực tiếp ở đây, từ
 * cùng cửa sổ kỳ (`DashboardWindow`)
 * mà các chỉ tiêu của registry dùng: "4 quý" là tổng 4 quý gần nhất (chế độ Năm: cả năm), "BQ" là
 * bình quân của số dư cuối kỳ và số dư cùng kỳ năm trước (chế độ Năm: hai cuối năm).
 *
 * Quy tắc §10, giống `calculateMetric`: kỳ không tính được thì để trống (null), không vẽ 0:
 * mẫu số không dương, thiếu số liệu đầu vào hoặc kỳ gốc không dương đều cho null.
 *
 * Đường chính ở đơn vị hiển thị (% hoặc lần); cột bên dưới ở đơn vị gốc của báo cáo (đồng) để
 * `dashboard.series.ts` đổi sang tỷ đồng/nghìn tỷ đồng, trừ cột đã là % (combined ratio).
 */
import type { ScreenerMetricId } from '../screener/screener.registry.js';
import type { DashboardConcept } from './dashboard.mapping.js';
import type { NativeMetricId } from './dashboard.catalog.js';
import type { DashboardWindow } from './dashboard.series.js';

export interface NativeValues {
  /** Giá trị đường chính, mỗi phần tử một đường (tối đa hai). */
  main: (number | null)[];
  /** Giá trị các cột bên dưới, mỗi phần tử một cột. */
  sub: (number | null)[];
}

/** Công cụ của cửa sổ kỳ đang tính, cho các biến thể dựa trên công thức registry. */
export interface NativeTools {
  /** Giá trị hiển thị (% hoặc lần) của một chỉ tiêu registry Bộ lọc trên cùng kỳ; null khi trống. */
  registry(metricId: ScreenerMetricId): number | null;
}

interface PeriodNames {
  q: readonly string[];
  y: readonly string[];
}

export interface NativeMetric {
  /** Tên các đường chính theo chế độ Quý/Năm. */
  main: PeriodNames;
  /** Tên các cột bên dưới theo chế độ Quý/Năm. */
  sub: PeriodNames;
  /** Chú giải định nghĩa hiện cùng chú thích biểu đồ. */
  legendNote?: string;
  /** Lý do biểu đồ trống khi không kỳ nào tính được. */
  emptyNote?: string;
  compute(window: DashboardWindow, tools: NativeTools): NativeValues;
}

type Maybe = number | null;

const both = (...names: string[]): PeriodNames => ({ q: names, y: names });

const sum = (...values: Maybe[]): Maybe =>
  values.some((value) => value === null) ? null : (values as number[]).reduce((a, b) => a + b, 0);

const minus = (a: Maybe, b: Maybe): Maybe => (a === null || b === null ? null : a - b);

/** Tỷ số: mẫu số phải dương (§10), tử số có thể âm. */
const ratio = (numerator: Maybe, denominator: Maybe): Maybe =>
  numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator;

const percent = (value: Maybe): Maybe => (value === null ? null : value * 100);

/** Tăng trưởng so với kỳ gốc (%): kỳ gốc phải dương (§10). */
const growth = (current: Maybe, base: Maybe): Maybe =>
  current === null || base === null || base <= 0 ? null : (current / base - 1) * 100;

const positive = (value: Maybe): Maybe => (value !== null && value > 0 ? value : null);

const abs = (value: Maybe): Maybe => (value === null ? null : Math.abs(value));

const times = (value: Maybe, factor: number): Maybe => (value === null ? null : value * factor);

/** Số ngày của một năm (số ngày tồn kho, số ngày thu tiền; như CCC của registry). */
const DAYS_PER_YEAR = 365;

/** Tên theo chế độ Quý ("… 4 quý") và Năm ("… năm") của các chuỗi dòng chảy. */
const flowNames = (...stems: string[]): PeriodNames => ({
  q: stems.map((stem) => `${stem} 4 quý`),
  y: stems.map((stem) => `${stem} năm`),
});

/** Tên đường chính của tỷ lệ trên số dư: "X" theo quý, "X cuối năm" theo năm. */
const balanceLine = (name: string): PeriodNames => ({ q: [name], y: [`${name} cuối năm`] });

/** Tên đường chính của tỷ lệ trên dòng chảy: "X (4 quý)" theo quý, "X năm" theo năm. */
const flowLine = (name: string): PeriodNames => ({ q: [`${name} (4 quý)`], y: [`${name} năm`] });

/** Bình quân của số dư cuối kỳ và số dư cùng kỳ năm trước (BQ). */
function averageBalance(window: DashboardWindow, concept: DashboardConcept): Maybe {
  const end = window.end(concept);
  const start = window.start(concept);
  return end === null || start === null ? null : (end + start) / 2;
}

/** Số dư của một tổng nhiều khoản mục, cuối kỳ hoặc đầu kỳ. */
function balanceOf(
  window: DashboardWindow,
  at: 'end' | 'start',
  concepts: readonly DashboardConcept[],
): Maybe {
  return sum(
    ...concepts.map((concept) => (at === 'end' ? window.end(concept) : window.start(concept))),
  );
}

const PROP_ASSETS = ['ck_fvtpl', 'ck_afs', 'ck_htm'] as const;

/** Tiền và đầu tư tài chính ngắn hạn cuối kỳ (B01-110 + 120, spec v3 §8.11). */
const cashOf = (w: DashboardWindow): Maybe => sum(w.end('cash'), w.end('st_investments'));

/** Nợ vay cuối kỳ: vay ngắn + dài hạn (5 ngành mới cộng trái phiếu chuyển đổi, D5). */
const debtOf = (w: DashboardWindow): Maybe => sum(w.end('st_debt'), w.end('lt_debt'));

/** LN kinh doanh chính = LN gộp − CPBH − CPQL (B02-20 − 25 − 26), dòng chảy của cửa sổ. */
const coreProfitOf = (w: DashboardWindow): Maybe =>
  minus(minus(w.flow('gross_profit'), w.flow('dn_selling_exp')), w.flow('dn_admin_exp'));

/** Lý do trống của chỉ tiêu cần khấu hao (PLAN D6, spec v3 §10). */
const DEPRECIATION_NOTE =
  'Chưa đủ số liệu để tính: kỳ có báo cáo lưu chuyển tiền tệ lập theo phương pháp trực tiếp không có dòng khấu hao';

/** Chú giải "tiền" của các chỉ tiêu tiền và nợ vay (DB-06). */
const CASH_NOTE = 'Tiền gồm đầu tư tài chính ngắn hạn';

/** Chú giải cho chỉ tiêu chi phí và combined ratio của bảo hiểm: chi phí tính theo số thuần. */
const INSURANCE_EXPENSE_NOTE =
  'Chi phí kinh doanh bảo hiểm và quản lý tính theo số thuần: đã trừ hoa hồng nhượng tái bảo hiểm và doanh thu khác của hoạt động bảo hiểm';

export const NATIVE_METRICS: Readonly<Record<NativeMetricId, NativeMetric>> = {
  // ---- Ngân hàng (§8.3) -----------------------------------------------------------------
  nim: {
    main: { q: ['NIM (4 quý)'], y: ['NIM năm'] },
    sub: { q: ['Thu nhập lãi thuần 4 quý'], y: ['Thu nhập lãi thuần năm'] },
    compute: (w) => {
      const nii = w.flow('nh_net_interest_income');
      return { main: [percent(ratio(nii, averageBalance(w, 'nh_earning_assets')))], sub: [nii] };
    },
  },
  yield_cost: {
    main: both('Lợi suất tài sản sinh lãi', 'Chi phí vốn'),
    sub: {
      q: ['Thu nhập lãi 4 quý', 'Chi phí lãi 4 quý'],
      y: ['Thu nhập lãi năm', 'Chi phí lãi năm'],
    },
    compute: (w) => {
      const income = w.flow('nh_interest_income');
      const expense = w.flow('nh_interest_expense');
      return {
        main: [
          percent(ratio(income, averageBalance(w, 'nh_earning_assets'))),
          percent(ratio(expense, averageBalance(w, 'nh_interest_bearing'))),
        ],
        sub: [income, expense],
      };
    },
  },
  cir: {
    main: { q: ['CIR (4 quý)'], y: ['CIR năm'] },
    sub: {
      q: ['Chi phí hoạt động 4 quý', 'TOI 4 quý'],
      y: ['Chi phí hoạt động năm', 'TOI năm'],
    },
    compute: (w) => {
      const opex = w.flow('nh_opex');
      const toi = w.flow('revenue');
      return { main: [percent(ratio(opex, toi))], sub: [opex, toi] };
    },
  },
  non_interest_share: {
    main: both('Thu nhập ngoài lãi / TOI'),
    sub: both('Thu nhập lãi thuần', 'Thu nhập ngoài lãi'),
    compute: (w) => {
      // Theo quý (chế độ Năm: cả năm), không cộng 4 quý.
      const toi = w.point('revenue');
      const nii = w.point('nh_net_interest_income');
      const nonInterest = minus(toi, nii);
      return { main: [percent(ratio(nonInterest, toi))], sub: [nii, nonInterest] };
    },
  },
  ppop_growth: {
    main: { q: ['Tăng trưởng so với cùng kỳ'], y: ['Tăng trưởng so với năm trước'] },
    sub: { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] },
    compute: (w) => {
      const current = w.point('nh_ppop');
      const base = w.previous?.point('nh_ppop') ?? null;
      return { main: [growth(current, base)], sub: [current, base] };
    },
  },
  credit_cost: {
    main: { q: ['Chi phí tín dụng (4 quý)'], y: ['Chi phí tín dụng năm'] },
    sub: { q: ['Chi phí dự phòng 4 quý'], y: ['Chi phí dự phòng năm'] },
    compute: (w) => {
      const provision = w.flow('nh_provision_expense');
      return {
        main: [percent(ratio(provision, averageBalance(w, 'nh_gross_loans')))],
        sub: [provision],
      };
    },
  },
  provision_to_loans: {
    main: { q: ['Dự phòng / Cho vay khách hàng'], y: ['Dự phòng / Cho vay cuối năm'] },
    sub: both('Dự phòng rủi ro cho vay'),
    compute: (w) => {
      const provision = abs(w.end('nh_loan_provision'));
      return { main: [percent(ratio(provision, w.end('nh_gross_loans')))], sub: [provision] };
    },
  },
  accrued_to_loans: {
    main: { q: ['Lãi, phí phải thu / Cho vay'], y: ['Lãi, phí phải thu / Cho vay cuối năm'] },
    sub: both('Lãi, phí phải thu'),
    compute: (w) => {
      const accrued = w.end('nh_accrued_receivables');
      return { main: [percent(ratio(accrued, w.end('nh_gross_loans')))], sub: [accrued] };
    },
  },
  credit_deposit_growth: {
    main: both('Tăng trưởng tín dụng', 'Tăng trưởng huy động'),
    sub: both('Cho vay khách hàng', 'Tiền gửi khách hàng'),
    compute: (w) => {
      const loans = w.end('nh_gross_loans');
      const deposits = w.end('nh_customer_deposits');
      return {
        main: [
          growth(loans, w.start('nh_gross_loans')),
          growth(deposits, w.start('nh_customer_deposits')),
        ],
        sub: [loans, deposits],
      };
    },
  },
  ldr: {
    main: { q: ['Cho vay / Tiền gửi khách hàng'], y: ['Cho vay / Tiền gửi cuối năm'] },
    sub: both('Cho vay khách hàng', 'Tiền gửi khách hàng'),
    compute: (w) => {
      const loans = w.end('nh_gross_loans');
      const deposits = w.end('nh_customer_deposits');
      return { main: [percent(ratio(loans, deposits))], sub: [loans, deposits] };
    },
  },
  equity_to_assets: {
    main: { q: ['VCSH / Tổng tài sản'], y: ['VCSH / Tổng tài sản cuối năm'] },
    sub: both('Vốn chủ sở hữu'),
    compute: (w) => {
      const equity = w.end('equity');
      return { main: [percent(ratio(equity, w.end('total_assets')))], sub: [equity] };
    },
  },

  // ---- Chứng khoán (§8.4) ---------------------------------------------------------------
  revenue_mix: {
    main: both('Tỷ trọng tự doanh'),
    sub: both('Môi giới', 'Cho vay margin', 'Tự doanh', 'Ngân hàng đầu tư và khác'),
    compute: (w) => {
      // Theo quý (chế độ Năm: cả năm). "Ngân hàng đầu tư và khác" là phần còn lại của doanh thu.
      const revenue = w.point('revenue');
      const brokerage = w.point('ck_brokerage_revenue');
      const margin = w.point('ck_margin_income');
      const prop = w.point('ck_prop_income');
      const other = minus(minus(minus(revenue, brokerage), margin), prop);
      return {
        main: [percent(ratio(prop, revenue))],
        sub: [brokerage, margin, prop, other],
      };
    },
  },
  operating_margin: {
    main: { q: ['Biên lợi nhuận hoạt động (4 quý)'], y: ['Biên lợi nhuận hoạt động năm'] },
    sub: {
      q: ['Chi phí hoạt động 4 quý', 'Lợi nhuận hoạt động 4 quý'],
      y: ['Chi phí hoạt động năm', 'Lợi nhuận hoạt động năm'],
    },
    compute: (w) => {
      const revenue = w.flow('revenue');
      const opex = w.flow('ck_opex');
      const profit = minus(revenue, opex);
      return { main: [percent(ratio(profit, revenue))], sub: [opex, profit] };
    },
  },
  opex_to_revenue: {
    main: { q: ['Chi phí / Doanh thu (4 quý)'], y: ['Chi phí / Doanh thu năm'] },
    sub: {
      q: ['Chi phí hoạt động 4 quý', 'Doanh thu hoạt động 4 quý'],
      y: ['Chi phí hoạt động năm', 'Doanh thu hoạt động năm'],
    },
    compute: (w) => {
      const opex = w.flow('ck_opex');
      const revenue = w.flow('revenue');
      return { main: [percent(ratio(opex, revenue))], sub: [opex, revenue] };
    },
  },
  margin_loan_growth: {
    main: { q: ['Tăng trưởng so với cùng kỳ'], y: ['Tăng trưởng so với năm trước'] },
    sub: { q: ['Dư nợ cuối kỳ', 'Cùng kỳ năm trước'], y: ['Dư nợ cuối năm', 'Năm trước'] },
    compute: (w) => {
      const end = w.end('ck_margin_loans');
      const start = w.start('ck_margin_loans');
      return { main: [growth(end, start)], sub: [end, start] };
    },
  },
  margin_loan_to_equity: {
    main: { q: ['Dư nợ cho vay / VCSH'], y: ['Dư nợ cho vay / VCSH cuối năm'] },
    sub: both('Dư nợ cho vay', 'Vốn chủ sở hữu'),
    compute: (w) => {
      const loans = w.end('ck_margin_loans');
      const equity = w.end('equity');
      return { main: [ratio(loans, equity)], sub: [loans, equity] };
    },
  },
  margin_loan_yield: {
    main: { q: ['Lợi suất cho vay (4 quý)'], y: ['Lợi suất cho vay năm'] },
    sub: { q: ['Lãi từ cho vay 4 quý'], y: ['Lãi từ cho vay năm'] },
    compute: (w) => {
      const income = w.flow('ck_margin_income');
      return {
        main: [percent(ratio(income, averageBalance(w, 'ck_margin_loans')))],
        sub: [income],
      };
    },
  },
  brokerage_margin: {
    main: { q: ['Biên lợi nhuận môi giới (4 quý)'], y: ['Biên lợi nhuận môi giới năm'] },
    sub: {
      q: ['Doanh thu môi giới 4 quý', 'Chi phí môi giới 4 quý'],
      y: ['Doanh thu môi giới năm', 'Chi phí môi giới năm'],
    },
    compute: (w) => {
      const revenue = w.flow('ck_brokerage_revenue');
      const cost = w.flow('ck_brokerage_cost');
      return { main: [percent(ratio(minus(revenue, cost), revenue))], sub: [revenue, cost] };
    },
  },
  prop_asset_share: {
    main: {
      q: ['Tài sản tự doanh / Tổng tài sản'],
      y: ['Tài sản tự doanh / Tổng tài sản cuối năm'],
    },
    sub: both('FVTPL', 'AFS', 'HTM'),
    compute: (w) => {
      const total = balanceOf(w, 'end', PROP_ASSETS);
      return {
        main: [percent(ratio(total, w.end('total_assets')))],
        sub: [w.end('ck_fvtpl'), w.end('ck_afs'), w.end('ck_htm')],
      };
    },
  },
  prop_return: {
    main: {
      q: ['Lãi tự doanh / Tài sản tự doanh (4 quý)'],
      y: ['Lãi tự doanh / Tài sản tự doanh năm'],
    },
    sub: { q: ['Lãi tự doanh thuần 4 quý'], y: ['Lãi tự doanh thuần năm'] },
    compute: (w) => {
      const net = minus(w.flow('ck_prop_income'), w.flow('ck_prop_expense'));
      const end = balanceOf(w, 'end', PROP_ASSETS);
      const start = balanceOf(w, 'start', PROP_ASSETS);
      const average = end === null || start === null ? null : (end + start) / 2;
      return { main: [percent(ratio(net, average))], sub: [net] };
    },
  },
  borrowings_to_equity: {
    main: { q: ['Nợ vay / VCSH'], y: ['Nợ vay / VCSH cuối năm'] },
    sub: both('Nợ vay', 'Vốn chủ sở hữu'),
    legendNote: 'Nợ vay gồm vay, trái phiếu phát hành và vay tài sản tài chính (ngắn và dài hạn)',
    compute: (w) => {
      const borrowings = w.end('ck_borrowings');
      const equity = w.end('equity');
      return { main: [ratio(borrowings, equity)], sub: [borrowings, equity] };
    },
  },

  // ---- Bảo hiểm (§8.5) ------------------------------------------------------------------
  gwp_growth: {
    main: { q: ['Tăng trưởng so với cùng kỳ'], y: ['Tăng trưởng so với năm trước'] },
    sub: { q: ['Quý này', 'Cùng kỳ năm trước'], y: ['Năm này', 'Năm trước'] },
    compute: (w) => {
      const current = w.point('bh_gwp');
      const base = w.previous?.point('bh_gwp') ?? null;
      return { main: [growth(current, base)], sub: [current, base] };
    },
  },
  retention_ratio: {
    main: { q: ['Phí thuần / Phí gốc (4 quý)'], y: ['Phí thuần / Phí gốc năm'] },
    sub: {
      q: ['Phí bảo hiểm gốc 4 quý', 'Phí bảo hiểm thuần 4 quý'],
      y: ['Phí bảo hiểm gốc năm', 'Phí bảo hiểm thuần năm'],
    },
    compute: (w) => {
      const gross = w.flow('bh_gwp');
      const net = w.flow('revenue');
      return { main: [percent(ratio(net, gross))], sub: [gross, net] };
    },
  },
  loss_ratio: {
    main: { q: ['Tỷ lệ bồi thường (4 quý)'], y: ['Tỷ lệ bồi thường năm'] },
    sub: {
      q: ['Bồi thường thuần 4 quý', 'Phí bảo hiểm thuần 4 quý'],
      y: ['Bồi thường thuần năm', 'Phí bảo hiểm thuần năm'],
    },
    compute: (w) => {
      const claims = w.flow('bh_claims');
      const net = w.flow('revenue');
      return { main: [percent(ratio(claims, net))], sub: [claims, net] };
    },
  },
  expense_ratio: {
    main: { q: ['Tỷ lệ chi phí (4 quý)'], y: ['Tỷ lệ chi phí năm'] },
    sub: {
      q: ['Chi phí kinh doanh và quản lý 4 quý', 'Phí bảo hiểm thuần 4 quý'],
      y: ['Chi phí kinh doanh và quản lý năm', 'Phí bảo hiểm thuần năm'],
    },
    legendNote: INSURANCE_EXPENSE_NOTE,
    compute: (w) => {
      const expenses = w.flow('bh_expenses');
      const net = w.flow('revenue');
      return { main: [percent(ratio(expenses, net))], sub: [expenses, net] };
    },
  },
  combined_ratio: {
    main: { q: ['Combined ratio (4 quý)'], y: ['Combined ratio năm'] },
    sub: both('Tỷ lệ bồi thường', 'Tỷ lệ chi phí'),
    legendNote: INSURANCE_EXPENSE_NOTE,
    compute: (w) => {
      const net = w.flow('revenue');
      const loss = percent(ratio(w.flow('bh_claims'), net));
      const expense = percent(ratio(w.flow('bh_expenses'), net));
      return { main: [sum(loss, expense)], sub: [loss, expense] };
    },
  },
  investment_yield: {
    main: { q: ['Lợi suất đầu tư (4 quý)'], y: ['Lợi suất đầu tư năm'] },
    sub: {
      q: ['Doanh thu hoạt động tài chính 4 quý'],
      y: ['Doanh thu hoạt động tài chính năm'],
    },
    compute: (w) => {
      const income = w.flow('bh_financial_income');
      return {
        main: [percent(ratio(income, averageBalance(w, 'bh_investments')))],
        sub: [income],
      };
    },
  },
  profit_mix: {
    main: both('Tỷ trọng lợi nhuận đầu tư'),
    sub: {
      q: ['Lợi nhuận bảo hiểm 4 quý', 'Lợi nhuận đầu tư 4 quý'],
      y: ['Lợi nhuận bảo hiểm năm', 'Lợi nhuận đầu tư năm'],
    },
    compute: (w) => {
      // Tỷ trọng LN đầu tư trong (LN bảo hiểm + LN đầu tư); tổng không dương thì tỷ trọng vô nghĩa.
      const insurance = w.flow('bh_underwriting_profit');
      const investment = w.flow('bh_investment_profit');
      return {
        main: [percent(ratio(investment, sum(insurance, investment)))],
        sub: [insurance, investment],
      };
    },
  },
  reserves_to_equity: {
    main: { q: ['Dự phòng nghiệp vụ / VCSH'], y: ['Dự phòng nghiệp vụ / VCSH cuối năm'] },
    sub: both('Dự phòng nghiệp vụ', 'Vốn chủ sở hữu'),
    emptyNote:
      'Báo cáo tài chính của doanh nghiệp này không khai dòng dự phòng nghiệp vụ bảo hiểm trên bảng cân đối',
    compute: (w) => {
      // Dòng dự phòng bằng 0 nghĩa là báo cáo không khai (bảo hiểm nhân thọ), không phải dự phòng 0.
      const reserves = positive(w.end('bh_reserves'));
      const equity = w.end('equity');
      return { main: [ratio(reserves, equity)], sub: [reserves, equity] };
    },
  },
  // ---- Biến thể của chỉ tiêu dạy lại (PLAN §6.2; metric_key là chỉ tiêu gốc) ------------
  roe_fin: {
    main: { q: ['ROE (4 quý)', 'ROA (4 quý)'], y: ['ROE năm', 'ROA năm'] },
    sub: both('Tổng tài sản BQ / VCSH BQ'),
    compute: (w, tools) => ({
      main: [tools.registry('roe'), tools.registry('roa')],
      sub: [ratio(averageBalance(w, 'total_assets'), averageBalance(w, 'equity'))],
    }),
  },
  net_margin_bh: {
    main: flowLine('LNST / Phí bảo hiểm thuần'),
    sub: flowNames('Lợi nhuận bảo hiểm', 'Lợi nhuận đầu tư'),
    compute: (w, tools) => ({
      main: [tools.registry('net_margin')],
      sub: [w.flow('bh_underwriting_profit'), w.flow('bh_investment_profit')],
    }),
  },
  gross_margin_q: {
    main: { q: ['Biên gộp quý'], y: ['Biên gộp năm'] },
    sub: { q: ['Giá vốn quý', 'Lợi nhuận gộp quý'], y: ['Giá vốn năm', 'Lợi nhuận gộp năm'] },
    compute: (w) => {
      // Từng quý (chế độ Năm: cả năm), không cộng 4 quý.
      const grossProfit = w.point('gross_profit');
      return {
        main: [percent(ratio(grossProfit, w.point('revenue')))],
        sub: [w.point('cogs'), grossProfit],
      };
    },
  },

  // ---- Bất động sản (spec v3 §8.6) ------------------------------------------------------
  non_core_profit_to_pbt: {
    main: flowLine('Ngoài kinh doanh / LNTT'),
    sub: flowNames('Thu nhập ngoài kinh doanh', 'LNTT'),
    legendNote:
      'Thu nhập ngoài kinh doanh = doanh thu hoạt động tài chính + lãi lỗ công ty liên doanh, liên kết + lợi nhuận khác',
    compute: (w) => {
      const nonCore = sum(
        w.flow('dn_fin_income'),
        w.flow('dn_jv_profit'),
        w.flow('dn_other_profit'),
      );
      const pbt = w.flow('pbt');
      return { main: [percent(ratio(nonCore, pbt))], sub: [nonCore, pbt] };
    },
  },
  buyer_prepay_to_revenue: {
    main: { q: ['Trả trước / Doanh thu 4 quý'], y: ['Trả trước / Doanh thu năm'] },
    sub: {
      q: ['Người mua trả tiền trước', 'Doanh thu 4 quý'],
      y: ['Người mua trả tiền trước', 'Doanh thu năm'],
    },
    compute: (w) => {
      const prepay = w.end('dn_buyer_prepay');
      const revenue = w.flow('revenue');
      return { main: [ratio(prepay, revenue)], sub: [prepay, revenue] };
    },
  },
  buyer_prepay_growth: {
    main: { q: ['Tăng trưởng so với cùng kỳ'], y: ['Tăng trưởng so với năm trước'] },
    sub: { q: ['Cuối quý này', 'Cùng kỳ năm trước'], y: ['Cuối năm này', 'Cuối năm trước'] },
    compute: (w) => {
      // Số dư cùng kỳ bằng 0 (hoặc âm) thì để trống (spec v3 §10).
      const end = w.end('dn_buyer_prepay');
      const start = w.start('dn_buyer_prepay');
      return { main: [growth(end, start)], sub: [end, start] };
    },
  },
  unearned_to_equity: {
    main: balanceLine('Doanh thu chưa thực hiện / VCSH'),
    sub: both('Doanh thu chưa thực hiện', 'Vốn chủ sở hữu'),
    compute: (w) => {
      const unearned = w.end('dn_unearned_revenue');
      const equity = w.end('equity');
      return { main: [percent(ratio(unearned, equity))], sub: [unearned, equity] };
    },
  },
  inventory_to_assets: {
    main: balanceLine('Tồn kho / Tổng tài sản'),
    sub: both('Hàng tồn kho', 'Tổng tài sản'),
    compute: (w) => {
      const inventory = w.end('inventory');
      const assets = w.end('total_assets');
      return { main: [percent(ratio(inventory, assets))], sub: [inventory, assets] };
    },
  },
  inventory_years: {
    main: { q: ['Tồn kho / Giá vốn 4 quý'], y: ['Tồn kho / Giá vốn năm'] },
    sub: { q: ['Hàng tồn kho', 'Giá vốn 4 quý'], y: ['Hàng tồn kho', 'Giá vốn năm'] },
    compute: (w) => {
      const inventory = w.end('inventory');
      const cogs = w.flow('cogs');
      return { main: [ratio(inventory, cogs)], sub: [inventory, cogs] };
    },
  },
  investment_property_share: {
    main: { q: ['(BĐS đầu tư + XDCB dở dang) / Tổng tài sản'], y: ['Tỷ trọng cuối năm'] },
    sub: both('Bất động sản đầu tư', 'Xây dựng cơ bản dở dang'),
    compute: (w) => {
      const property = w.end('dn_investment_property');
      const cip = w.end('dn_cip');
      return {
        main: [percent(ratio(sum(property, cip), w.end('total_assets')))],
        sub: [property, cip],
      };
    },
  },
  prepay_receivables_to_equity: {
    main: { q: ['(Trả trước + Phải thu khác) / VCSH'], y: ['Tỷ lệ cuối năm'] },
    sub: both('Trả trước cho người bán', 'Phải thu khác'),
    compute: (w) => {
      const prepay = w.end('dn_supplier_prepay');
      const other = w.end('dn_other_receivables');
      return { main: [percent(ratio(sum(prepay, other), w.end('equity')))], sub: [prepay, other] };
    },
  },
  st_debt_share: {
    main: { q: ['Vay ngắn hạn / Tổng nợ vay'], y: ['Tỷ trọng cuối năm'] },
    sub: both('Vay ngắn hạn', 'Vay dài hạn'),
    legendNote: 'Vay dài hạn gồm trái phiếu chuyển đổi',
    compute: (w) => {
      const short = w.end('st_debt');
      const long = w.end('lt_debt');
      return { main: [percent(ratio(short, sum(short, long)))], sub: [short, long] };
    },
  },
  cash_to_st_debt: {
    main: { q: ['(Tiền + Đầu tư ngắn hạn) / Vay ngắn hạn'], y: ['Tỷ lệ cuối năm'] },
    sub: both('Tiền và đầu tư ngắn hạn', 'Vay ngắn hạn'),
    compute: (w) => {
      const cash = cashOf(w);
      const short = w.end('st_debt');
      return { main: [ratio(cash, short)], sub: [cash, short] };
    },
  },
  interest_paid_to_expense: {
    main: flowLine('Lãi vay đã trả / Chi phí lãi vay'),
    sub: flowNames('Lãi vay đã trả', 'Chi phí lãi vay'),
    compute: (w) => {
      const paid = w.flow('dn_interest_paid');
      const expense = w.flow('interest_expense');
      return { main: [ratio(paid, expense)], sub: [paid, expense] };
    },
  },

  // ---- Dầu khí, bán lẻ, điện, vật liệu (spec v3 §8.7–§8.10) -------------------------------
  inventory_days: {
    main: flowLine('Số ngày tồn kho'),
    sub: { q: ['Tồn kho bình quân', 'Giá vốn 4 quý'], y: ['Tồn kho bình quân', 'Giá vốn năm'] },
    compute: (w) => {
      const inventory = averageBalance(w, 'inventory');
      const cogs = w.flow('cogs');
      return { main: [times(ratio(inventory, cogs), DAYS_PER_YEAR)], sub: [inventory, cogs] };
    },
  },
  depreciation_to_revenue: {
    main: flowLine('Khấu hao / Doanh thu'),
    sub: flowNames('Khấu hao'),
    emptyNote: DEPRECIATION_NOTE,
    compute: (w) => {
      const depreciation = w.flow('depreciation');
      return { main: [percent(ratio(depreciation, w.flow('revenue')))], sub: [depreciation] };
    },
  },
  capex_to_depreciation: {
    main: flowLine('Capex / Khấu hao'),
    sub: flowNames('Capex', 'Khấu hao'),
    emptyNote: DEPRECIATION_NOTE,
    compute: (w) => {
      const capex = w.flow('capex');
      const depreciation = w.flow('depreciation');
      return { main: [ratio(capex, depreciation)], sub: [capex, depreciation] };
    },
  },
  net_cash_to_equity: {
    main: balanceLine('Tiền ròng / VCSH'),
    sub: both('Tiền và đầu tư ngắn hạn', 'Nợ vay'),
    legendNote: CASH_NOTE,
    compute: (w) => {
      // Được âm (doanh nghiệp nợ ròng); chỉ VCSH phải dương.
      const cash = cashOf(w);
      const debt = debtOf(w);
      return { main: [percent(ratio(minus(cash, debt), w.end('equity')))], sub: [cash, debt] };
    },
  },
  fin_income_to_pbt: {
    main: flowLine('Doanh thu tài chính / LNTT'),
    sub: flowNames('Doanh thu tài chính', 'LNTT'),
    compute: (w) => {
      const income = w.flow('dn_fin_income');
      const pbt = w.flow('pbt');
      return { main: [percent(ratio(income, pbt))], sub: [income, pbt] };
    },
  },
  dividend_payout: {
    main: {
      q: ['Cổ tức đã trả 4 quý / LNST 4 quý trước đó'],
      y: ['Cổ tức đã trả / LNST năm trước'],
    },
    sub: {
      q: ['Cổ tức đã trả 4 quý', 'LNST 4 quý trước đó'],
      y: ['Cổ tức đã trả trong năm', 'LNST năm trước'],
    },
    legendNote: 'LNST của cổ đông công ty mẹ',
    compute: (w) => {
      // Cổ tức trả trong kỳ chia từ lợi nhuận của kỳ trước (D8): LNST công ty mẹ 4 quý trước đó.
      const dividends = w.flow('dn_dividends_paid');
      const profit = w.previous?.flow('npat_parent') ?? null;
      return { main: [percent(ratio(dividends, profit))], sub: [dividends, profit] };
    },
  },
  sga_to_revenue: {
    main: flowLine('(CPBH + CPQL) / Doanh thu'),
    sub: flowNames('Chi phí bán hàng', 'Chi phí quản lý'),
    compute: (w) => {
      const selling = w.flow('dn_selling_exp');
      const admin = w.flow('dn_admin_exp');
      return {
        main: [percent(ratio(sum(selling, admin), w.flow('revenue')))],
        sub: [selling, admin],
      };
    },
  },
  core_margin: {
    main: flowLine('LN kinh doanh chính / Doanh thu'),
    sub: flowNames('LN kinh doanh chính'),
    legendNote: 'LN kinh doanh chính = lợi nhuận gộp − chi phí bán hàng − chi phí quản lý',
    compute: (w) => {
      const core = coreProfitOf(w);
      return { main: [percent(ratio(core, w.flow('revenue')))], sub: [core] };
    },
  },
  inventory_provision_ratio: {
    main: balanceLine('Dự phòng / Tồn kho gốc'),
    sub: both('Dự phòng giảm giá tồn kho'),
    compute: (w) => {
      const provision = abs(w.end('dn_inventory_provision'));
      return {
        main: [percent(ratio(provision, w.end('dn_inventory_gross')))],
        sub: [provision],
      };
    },
  },
  payables_to_inventory: {
    main: balanceLine('Phải trả người bán / Tồn kho'),
    sub: both('Phải trả người bán', 'Hàng tồn kho'),
    compute: (w) => {
      const payables = w.end('payables');
      const inventory = w.end('inventory');
      return { main: [ratio(payables, inventory)], sub: [payables, inventory] };
    },
  },
  st_debt_to_inventory: {
    main: balanceLine('Vay ngắn hạn / Tồn kho'),
    sub: both('Vay ngắn hạn', 'Hàng tồn kho'),
    compute: (w) => {
      const short = w.end('st_debt');
      const inventory = w.end('inventory');
      return { main: [ratio(short, inventory)], sub: [short, inventory] };
    },
  },
  revenue_to_fixed_assets: {
    main: { q: ['Doanh thu 4 quý / TSCĐ bình quân'], y: ['Doanh thu năm / TSCĐ bình quân'] },
    sub: { q: ['Doanh thu 4 quý', 'TSCĐ bình quân'], y: ['Doanh thu năm', 'TSCĐ bình quân'] },
    compute: (w) => {
      const revenue = w.flow('revenue');
      const fixedAssets = averageBalance(w, 'dn_fixed_assets');
      return { main: [ratio(revenue, fixedAssets)], sub: [revenue, fixedAssets] };
    },
  },
  ebitda_margin: {
    main: flowLine('EBITDA / Doanh thu'),
    sub: flowNames('LN kinh doanh chính', 'Khấu hao'),
    legendNote: 'EBITDA = LN kinh doanh chính + khấu hao, không gồm thu nhập tài chính',
    emptyNote: DEPRECIATION_NOTE,
    compute: (w) => {
      const core = coreProfitOf(w);
      const depreciation = w.flow('depreciation');
      return {
        main: [percent(ratio(sum(core, depreciation), w.flow('revenue')))],
        sub: [core, depreciation],
      };
    },
  },
  fixed_assets_to_assets: {
    main: balanceLine('TSCĐ / Tổng tài sản'),
    sub: both('Tài sản cố định', 'Tổng tài sản'),
    compute: (w) => {
      const fixedAssets = w.end('dn_fixed_assets');
      const assets = w.end('total_assets');
      return { main: [percent(ratio(fixedAssets, assets))], sub: [fixedAssets, assets] };
    },
  },
  cip_to_fixed_assets: {
    main: balanceLine('XDCB dở dang / TSCĐ'),
    sub: both('Xây dựng cơ bản dở dang', 'Tài sản cố định'),
    compute: (w) => {
      const cip = w.end('dn_cip');
      const fixedAssets = w.end('dn_fixed_assets');
      return { main: [percent(ratio(cip, fixedAssets))], sub: [cip, fixedAssets] };
    },
  },
  receivable_days: {
    main: flowLine('Số ngày thu tiền'),
    sub: {
      q: ['Phải thu khách hàng bình quân', 'Doanh thu 4 quý'],
      y: ['Phải thu khách hàng bình quân', 'Doanh thu năm'],
    },
    compute: (w) => {
      const receivables = averageBalance(w, 'receivables');
      const revenue = w.flow('revenue');
      return {
        main: [times(ratio(receivables, revenue), DAYS_PER_YEAR)],
        sub: [receivables, revenue],
      };
    },
  },
  non_interest_fin_cost_to_pbt: {
    main: { q: ['Chi phí tài chính ngoài lãi vay / LNTT (4 quý)'], y: ['Tỷ lệ năm'] },
    sub: flowNames('Chi phí tài chính ngoài lãi vay', 'LNTT'),
    compute: (w) => {
      const cost = minus(w.flow('dn_fin_expense'), w.flow('interest_expense'));
      const pbt = w.flow('pbt');
      return { main: [percent(ratio(cost, pbt))], sub: [cost, pbt] };
    },
  },
};
