/**
 * Bảng ánh xạ khoản mục của Dashboard v2 (spec §7): mã dòng trên mẫu báo cáo của từng ngành →
 * khoản mục (concept) mà công thức §8 dùng. Chỉ dùng số trên 3 báo cáo tài chính (bảng cân đối,
 * kết quả kinh doanh, lưu chuyển tiền tệ), không dùng thuyết minh.
 *
 * Nguồn: danh mục `/financial-statement/metrics` của VCI IQ và số liệu thật của VCB, MBB, EVF
 * (tổ chức tín dụng), SSI, VND (chứng khoán), BVH, BMI, PVI (bảo hiểm). Quy ước dấu của VCI: chi
 * phí, giá vốn, dự phòng báo cáo SỐ ÂM; `negate` đổi thành số dương như mọi khoản mục của Bộ lọc.
 *
 * Doanh nghiệp (`thuong`) dùng đúng bảng của Bộ lọc (`screener.statements.ts`), không có khoản
 * mục riêng. Ba ngành còn lại có:
 *  - dòng "Doanh thu" riêng (§8.1): TOI của ngân hàng, doanh thu hoạt động của công ty chứng
 *    khoán, doanh thu phí bảo hiểm thuần của bảo hiểm — ghi đè khoản mục `revenue`;
 *  - các khoản mục riêng (`nh_*`, `ck_*`, `bh_*`) cho 29 chỉ tiêu của ngành.
 */
import type { Industry } from '../financials/financials.industry.js';
import {
  normalizeVciStatements,
  type ConceptFieldMap,
  type ConceptFieldSpec,
  type NormalizedStatements,
  type StatementConcept,
  type VciStatementSections,
} from '../screener/screener.statements.js';

/** Dòng chảy cộng 4 quý thành năm; số dư lấy cuối năm (§8.0). */
export type ConceptKind = 'flow' | 'balance';

interface ConceptDefinition extends ConceptFieldSpec {
  kind: ConceptKind;
  /** Khoản mục trên báo cáo (tiếng Việt). */
  label: string;
}

/**
 * Tổ chức tín dụng (mẫu `isb*`/`bsb*`; gồm cả công ty tài chính như EVF).
 *
 * Tài sản sinh lãi = tiền gửi và cho vay các TCTD khác (bsb98) + chứng khoán kinh doanh (bsb99) +
 * cho vay khách hàng (bsb104) + chứng khoán đầu tư (bsb106), đúng §8.3 — KHÔNG gồm tiền gửi tại
 * Ngân hàng Nhà nước (bsb97) như `financials.calculations` (NIM của trang Cổ phiếu).
 * Nợ chịu lãi = vay NHNN/Chính phủ (bsb111) + tiền gửi và vay các TCTD (bsb112) + tiền gửi khách
 * hàng (bsb113) + vốn tài trợ, uỷ thác (bsb115) + giấy tờ có giá (bsb116); hai dòng bsb111 và
 * bsb115 là "vốn vay khác" của §8.3.
 */
const BANK_CONCEPTS = {
  nh_net_interest_income: {
    field: 'isb27',
    kind: 'flow',
    label: 'Thu nhập lãi thuần',
  },
  nh_interest_income: {
    field: 'isb25',
    kind: 'flow',
    label: 'Thu nhập lãi và các khoản thu nhập tương tự',
  },
  nh_interest_expense: {
    field: 'isb26',
    negate: true,
    kind: 'flow',
    label: 'Chi phí lãi và các chi phí tương tự',
  },
  nh_opex: {
    field: 'isb39',
    negate: true,
    kind: 'flow',
    label: 'Chi phí quản lý doanh nghiệp (chi phí hoạt động)',
  },
  nh_ppop: {
    field: 'isb40',
    kind: 'flow',
    label: 'Lợi nhuận thuần hoạt động trước chi phí dự phòng',
  },
  nh_provision_expense: {
    field: 'isb41',
    negate: true,
    kind: 'flow',
    label: 'Chi phí dự phòng rủi ro tín dụng',
  },
  nh_gross_loans: { field: 'bsb104', kind: 'balance', label: 'Cho vay khách hàng' },
  nh_loan_provision: {
    field: 'bsb105',
    negate: true,
    kind: 'balance',
    label: 'Dự phòng rủi ro cho vay khách hàng',
  },
  nh_accrued_receivables: {
    field: 'bsb265',
    kind: 'balance',
    label: 'Các khoản lãi và phí phải thu',
  },
  nh_customer_deposits: { field: 'bsb113', kind: 'balance', label: 'Tiền gửi của khách hàng' },
  nh_earning_assets: {
    fields: ['bsb98', 'bsb99', 'bsb104', 'bsb106'],
    kind: 'balance',
    label: 'Tài sản sinh lãi',
  },
  nh_interest_bearing: {
    fields: ['bsb111', 'bsb112', 'bsb113', 'bsb115', 'bsb116'],
    kind: 'balance',
    label: 'Nợ chịu lãi',
  },
} as const satisfies Record<string, ConceptDefinition>;

/**
 * Công ty chứng khoán (mẫu `iss*`/`bss*`). Doanh thu hoạt động = isa3 (bằng isa1); chi phí hoạt
 * động = isa4. Tự doanh = FVTPL (iss115) + HTM (iss119) + AFS (iss121) về doanh thu, và các khoản
 * lỗ/chi phí tương ứng (iss124, iss128, iss130, iss132) về chi phí. Nợ vay gồm vay (bsa56, bsa71),
 * vay tài sản tài chính (bss240, bss249), trái phiếu phát hành và chuyển đổi (bss241, bss242,
 * bss250, bsa173) và vay Quỹ Hỗ trợ thanh toán (bss243): rộng hơn "vay ngắn + dài hạn" của §8.4
 * vì nguồn vốn của công ty chứng khoán chủ yếu là trái phiếu.
 */
const SECURITIES_CONCEPTS = {
  ck_opex: { field: 'isa4', negate: true, kind: 'flow', label: 'Chi phí hoạt động' },
  ck_brokerage_revenue: {
    field: 'iss42',
    kind: 'flow',
    label: 'Doanh thu nghiệp vụ môi giới chứng khoán',
  },
  ck_brokerage_cost: {
    field: 'iss133',
    negate: true,
    kind: 'flow',
    label: 'Chi phí nghiệp vụ môi giới chứng khoán',
  },
  ck_margin_income: {
    field: 'iss120',
    kind: 'flow',
    label: 'Lãi từ các khoản cho vay và phải thu',
  },
  ck_prop_income: {
    fields: ['iss115', 'iss119', 'iss121'],
    kind: 'flow',
    label: 'Lãi từ tự doanh (FVTPL, HTM, AFS)',
  },
  ck_prop_expense: {
    fields: ['iss124', 'iss128', 'iss130', 'iss132'],
    negate: true,
    kind: 'flow',
    label: 'Lỗ và chi phí tự doanh (FVTPL, HTM, AFS, hoạt động tự doanh)',
  },
  ck_margin_loans: {
    field: 'bss215',
    kind: 'balance',
    label: 'Các khoản cho vay (margin và ứng trước)',
  },
  ck_fvtpl: {
    field: 'bsa6',
    kind: 'balance',
    label: 'Tài sản tài chính ghi nhận thông qua lãi/lỗ (FVTPL)',
  },
  ck_afs: { field: 'bss216', kind: 'balance', label: 'Tài sản tài chính sẵn sàng để bán (AFS)' },
  ck_htm: {
    field: 'bsb108',
    kind: 'balance',
    label: 'Các khoản đầu tư nắm giữ đến ngày đáo hạn (HTM)',
  },
  ck_borrowings: {
    fields: [
      'bsa56',
      'bsa71',
      'bss240',
      'bss241',
      'bss242',
      'bss243',
      'bss249',
      'bsa173',
      'bss250',
    ],
    kind: 'balance',
    label: 'Nợ vay (vay, trái phiếu phát hành và vay tài sản tài chính)',
  },
} as const satisfies Record<string, ConceptDefinition>;

/**
 * Doanh nghiệp bảo hiểm (mẫu `isi*`/`bsi*`). Doanh thu = phí bảo hiểm thuần (isi105).
 *
 * Chi phí kinh doanh bảo hiểm và quản lý = trích dự phòng dao động lớn (isi74) + chi khác hoạt
 * động bảo hiểm (isi75: hoa hồng, giám định…) + chi quản lý doanh nghiệp của hoạt động bảo hiểm
 * (isi94), TRỪ hoa hồng nhượng tái bảo hiểm và doanh thu khác của hoạt động bảo hiểm (isi106).
 * Cách tính theo số thuần này làm tỷ lệ bồi thường + tỷ lệ chi phí = 1 − lợi nhuận thuần hoạt
 * động kinh doanh bảo hiểm (isi97) / phí thuần, tức combined ratio khớp đúng lợi nhuận bảo hiểm.
 * Dự phòng nghiệp vụ = bsi202; doanh nghiệp bảo hiểm nhân thọ như BVH không khai dòng này (dự
 * phòng nằm ở "phải trả dài hạn khác") nên chỉ tiêu bị trống với họ.
 */
const INSURANCE_CONCEPTS = {
  bh_gwp: { field: 'isi51', kind: 'flow', label: 'Thu phí bảo hiểm gốc' },
  bh_claims: {
    field: 'isi111',
    negate: true,
    kind: 'flow',
    label: 'Tổng chi bồi thường bảo hiểm',
  },
  bh_expenses: {
    fields: ['isi74', 'isi75', 'isi94', 'isi106'],
    negate: true,
    kind: 'flow',
    label: 'Chi phí kinh doanh bảo hiểm và quản lý (thuần)',
  },
  bh_underwriting_profit: {
    field: 'isi97',
    kind: 'flow',
    label: 'Lợi nhuận thuần hoạt động kinh doanh bảo hiểm',
  },
  bh_investment_profit: {
    field: 'isi100',
    kind: 'flow',
    label: 'Lợi nhuận hoạt động tài chính',
  },
  bh_financial_income: {
    field: 'isa6',
    kind: 'flow',
    label: 'Doanh thu hoạt động tài chính',
  },
  bh_investments: {
    fields: ['bsa5', 'bsa43'],
    kind: 'balance',
    label: 'Đầu tư tài chính (ngắn hạn và dài hạn)',
  },
  bh_reserves: { field: 'bsi202', kind: 'balance', label: 'Dự phòng nghiệp vụ bảo hiểm' },
} as const satisfies Record<string, ConceptDefinition>;

export type BankConcept = keyof typeof BANK_CONCEPTS;
export type SecuritiesConcept = keyof typeof SECURITIES_CONCEPTS;
export type InsuranceConcept = keyof typeof INSURANCE_CONCEPTS;
export type IndustryConcept = BankConcept | SecuritiesConcept | InsuranceConcept;

/** Khoản mục của Dashboard: các khoản mục chuẩn của Bộ lọc + khoản mục riêng của ngành. */
export type DashboardConcept = StatementConcept | IndustryConcept;

export interface IndustryMapping {
  /** Dòng "Doanh thu" của ngành (§8.1), ghi đè khoản mục `revenue`. */
  revenue: { field: string; label: string };
  /** Khoản mục riêng của ngành (rỗng với doanh nghiệp). */
  concepts: Readonly<Record<string, ConceptDefinition>>;
}

export const INDUSTRY_MAPPINGS: Readonly<Record<Industry, IndustryMapping>> = {
  thuong: {
    revenue: { field: 'isa3', label: 'Doanh thu thuần' },
    concepts: {},
  },
  nh: {
    revenue: { field: 'isb38', label: 'Tổng thu nhập hoạt động (TOI)' },
    concepts: BANK_CONCEPTS,
  },
  ck: {
    revenue: { field: 'isa3', label: 'Doanh thu hoạt động' },
    concepts: SECURITIES_CONCEPTS,
  },
  bh: {
    revenue: { field: 'isi105', label: 'Doanh thu phí bảo hiểm thuần' },
    concepts: INSURANCE_CONCEPTS,
  },
};

/** Bản đồ khoản mục → dòng VCI của một ngành, đưa vào `normalizeVciStatements`. */
export function industryFieldMap(industry: Industry): ConceptFieldMap {
  const mapping = INDUSTRY_MAPPINGS[industry];
  const map: Record<string, ConceptFieldSpec> = { revenue: { field: mapping.revenue.field } };
  for (const [concept, definition] of Object.entries(mapping.concepts)) {
    map[concept] = {
      ...(definition.field !== undefined ? { field: definition.field } : {}),
      ...(definition.fields !== undefined ? { fields: definition.fields } : {}),
      ...(definition.negate ? { negate: true } : {}),
    };
  }
  return map;
}

/** Khoản mục riêng của ngành theo loại (dòng chảy cộng 4 quý, số dư lấy cuối kỳ). */
export function industryConcepts(industry: Industry, kind: ConceptKind): IndustryConcept[] {
  return Object.entries(INDUSTRY_MAPPINGS[industry].concepts)
    .filter(([, definition]) => definition.kind === kind)
    .map(([concept]) => concept as IndustryConcept);
}

/**
 * Báo cáo đã công bố của một mã theo mẫu của ngành: dòng "Doanh thu" và các khoản mục riêng của
 * ngành (`industryFieldMap`) cùng các khoản mục chuẩn của Bộ lọc. Cờ `financial` của Bộ lọc luôn
 * tắt: nó chặn các chỉ tiêu "không áp dụng cho tổ chức tài chính", còn Dashboard v2 đã có danh
 * mục riêng cho từng ngành và tính "doanh thu" theo ngành.
 */
export function normalizeIndustryStatements(
  sections: VciStatementSections,
  asOf: Date,
  industry: Industry,
): NormalizedStatements {
  return { ...normalizeVciStatements(sections, asOf, industryFieldMap(industry)), financial: false };
}
