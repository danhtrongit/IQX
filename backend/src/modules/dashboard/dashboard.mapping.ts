/**
 * Bảng ánh xạ khoản mục của Dashboard v2 (spec §7): mã dòng trên mẫu báo cáo của từng ngành →
 * khoản mục (concept) mà công thức §8 dùng. Chỉ dùng số trên 3 báo cáo tài chính (bảng cân đối,
 * kết quả kinh doanh, lưu chuyển tiền tệ), không dùng thuyết minh.
 *
 * Nguồn: danh mục `/financial-statement/metrics` của VCI IQ và số liệu thật của VCB, MBB, EVF
 * (tổ chức tín dụng), SSI, VND (chứng khoán), BVH, BMI, PVI (bảo hiểm). Quy ước dấu của VCI: chi
 * phí, giá vốn, dự phòng báo cáo SỐ ÂM; `negate` đổi thành số dương như mọi khoản mục của Bộ lọc.
 *
 * Mẫu doanh nghiệp (`thuong`) dùng bảng của Bộ lọc (`screener.statements.ts`) cộng các khoản mục
 * `dn_*` (Thông tư 200) cho 28 chỉ tiêu mới của v3 (spec v3 §7, PLAN §5); 5 ngành mới cộng trái
 * phiếu chuyển đổi vào nợ vay dài hạn (D5) và mọi mẫu doanh nghiệp xử lý báo cáo lưu chuyển tiền
 * tệ lập theo phương pháp trực tiếp (D6, `applyDirectMethod`). Ba mẫu tài chính có:
 *  - dòng "Doanh thu" riêng (§8.1): TOI của ngân hàng, doanh thu hoạt động của công ty chứng
 *    khoán, doanh thu phí bảo hiểm thuần của bảo hiểm — ghi đè khoản mục `revenue`;
 *  - các khoản mục riêng (`nh_*`, `ck_*`, `bh_*`) cho 29 chỉ tiêu của ngành.
 */
import type { Industry } from '../financials/financials.industry.js';
import { finite } from '../financials/financials.calculations.js';
import {
  normalizeVciStatements,
  type ConceptFieldMap,
  type ConceptFieldSpec,
  type NormalizedStatements,
  type StatementConcept,
  type VciStatementSections,
} from '../screener/screener.statements.js';
import type { Nganh } from './dashboard.nganh.js';

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

/**
 * Mẫu doanh nghiệp (Thông tư 200), các dòng thêm của spec v3 §7 (PLAN §5, đã đối chiếu số liệu
 * VCI của HPG, VHM, KBC, REE). Các dòng 110, 120, 131, 140, 270, 311, 320, 338, 410, B02-10/11/20/
 * 23/50, B03-02/21 dùng khoản mục chuẩn của Bộ lọc (`cash`, `st_investments`, `receivables`,
 * `inventory`, …).
 */
const ENTERPRISE_CONCEPTS = {
  dn_supplier_prepay: {
    fields: ['bsa10', 'bsa161'],
    kind: 'balance',
    label: 'Trả trước cho người bán ngắn hạn và dài hạn (B01-132, 212)',
  },
  dn_other_receivables: {
    fields: ['bsa13', 'bsa27'],
    kind: 'balance',
    label: 'Phải thu ngắn hạn khác và dài hạn khác (B01-136, 216)',
  },
  dn_inventory_gross: { field: 'bsa16', kind: 'balance', label: 'Hàng tồn kho, giá gốc (B01-141)' },
  dn_inventory_provision: {
    field: 'bsa17',
    negate: true,
    kind: 'balance',
    label: 'Dự phòng giảm giá hàng tồn kho (B01-149)',
  },
  dn_fixed_assets: { field: 'bsa29', kind: 'balance', label: 'Tài sản cố định (B01-220)' },
  dn_investment_property: {
    field: 'bsa40',
    kind: 'balance',
    label: 'Bất động sản đầu tư (B01-230)',
  },
  dn_cip: {
    // bsa39 là dòng XDCB dở dang của mẫu trước 2015; từ 2015 VCI để ở bsa188.
    fields: ['bsa188', 'bsa39'],
    kind: 'balance',
    label: 'Chi phí xây dựng cơ bản dở dang (B01-242)',
  },
  dn_buyer_prepay: {
    fields: ['bsa58', 'bsa170'],
    kind: 'balance',
    label: 'Người mua trả tiền trước ngắn hạn và dài hạn (B01-312, 332)',
  },
  dn_unearned_revenue: {
    fields: ['bsa167', 'bsa76'],
    kind: 'balance',
    label: 'Doanh thu chưa thực hiện ngắn hạn và dài hạn (B01-318, 336)',
  },
  dn_fin_income: { field: 'isa6', kind: 'flow', label: 'Doanh thu hoạt động tài chính (B02-21)' },
  dn_fin_expense: {
    field: 'isa7',
    negate: true,
    kind: 'flow',
    label: 'Chi phí tài chính (B02-22)',
  },
  dn_jv_profit: {
    // isa15 là dòng của mẫu trước 2015 (bằng 0 từ 2015).
    fields: ['isa102', 'isa15'],
    kind: 'flow',
    label: 'Lãi lỗ trong công ty liên doanh, liên kết (B02-24)',
  },
  dn_selling_exp: {
    field: 'isa9',
    negate: true,
    kind: 'flow',
    label: 'Chi phí bán hàng (B02-25)',
  },
  dn_admin_exp: {
    field: 'isa10',
    negate: true,
    kind: 'flow',
    label: 'Chi phí quản lý doanh nghiệp (B02-26)',
  },
  dn_other_profit: { field: 'isa14', kind: 'flow', label: 'Lợi nhuận khác (B02-40)' },
  dn_interest_paid: {
    // Phương pháp trực tiếp: `applyDirectMethod` đưa dòng 04 (cfa42) vào chỗ của cfa14.
    field: 'cfa14',
    negate: true,
    kind: 'flow',
    label: 'Tiền lãi vay đã trả (B03-14; phương pháp trực tiếp: B03-04)',
  },
  dn_dividends_paid: {
    field: 'cfa32',
    negate: true,
    kind: 'flow',
    label: 'Cổ tức, lợi nhuận đã trả cho chủ sở hữu (B03-36)',
  },
} as const satisfies Record<string, ConceptDefinition>;

export type EnterpriseConcept = keyof typeof ENTERPRISE_CONCEPTS;
export type BankConcept = keyof typeof BANK_CONCEPTS;
export type SecuritiesConcept = keyof typeof SECURITIES_CONCEPTS;
export type InsuranceConcept = keyof typeof INSURANCE_CONCEPTS;
export type IndustryConcept =
  EnterpriseConcept | BankConcept | SecuritiesConcept | InsuranceConcept;

/** Khoản mục của Dashboard: các khoản mục chuẩn của Bộ lọc + khoản mục riêng của ngành. */
export type DashboardConcept = StatementConcept | IndustryConcept;

export interface IndustryMapping {
  /** Dòng "Doanh thu" của ngành (§8.1), ghi đè khoản mục `revenue`. */
  revenue: { field: string; label: string };
  /** Khoản mục riêng của mẫu báo cáo (`dn_*` của doanh nghiệp, `nh_*`, `ck_*`, `bh_*`). */
  concepts: Readonly<Record<string, ConceptDefinition>>;
}

export const INDUSTRY_MAPPINGS: Readonly<Record<Industry, IndustryMapping>> = {
  thuong: {
    revenue: { field: 'isa3', label: 'Doanh thu thuần' },
    concepts: ENTERPRISE_CONCEPTS,
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

/**
 * Năm ngành mới của v3 tính nợ vay gồm cả trái phiếu chuyển đổi B01-339 (`bsa173`, spec v3 §8.11,
 * PLAN D5). Mẫu `thuong` giữ đúng định nghĩa của v2 và Bộ lọc (vay ngắn + dài hạn).
 */
const CONVERTIBLE_DEBT_NGANH: ReadonlySet<Nganh> = new Set<Nganh>([
  'bds',
  'dk',
  'bl',
  'dien',
  'vl',
]);

/**
 * Bản đồ khoản mục → dòng VCI của một mẫu báo cáo, đưa vào `normalizeVciStatements`. `nganh` (ngành
 * dashboard v3) chỉ đổi định nghĩa nợ vay dài hạn của 5 ngành mới (D5).
 */
export function industryFieldMap(industry: Industry, nganh?: Nganh): ConceptFieldMap {
  const mapping = INDUSTRY_MAPPINGS[industry];
  const map: Record<string, ConceptFieldSpec> = { revenue: { field: mapping.revenue.field } };
  for (const [concept, definition] of Object.entries(mapping.concepts)) {
    map[concept] = {
      ...(definition.field !== undefined ? { field: definition.field } : {}),
      ...(definition.fields !== undefined ? { fields: definition.fields } : {}),
      ...(definition.negate ? { negate: true } : {}),
    };
  }
  if (industry === 'thuong' && nganh !== undefined && CONVERTIBLE_DEBT_NGANH.has(nganh))
    map.lt_debt = { fields: ['bsa71', 'bsa173'] };
  return map;
}

/** Khoản mục riêng của ngành theo loại (dòng chảy cộng 4 quý, số dư lấy cuối kỳ). */
export function industryConcepts(industry: Industry, kind: ConceptKind): IndustryConcept[] {
  return Object.entries(INDUSTRY_MAPPINGS[industry].concepts)
    .filter(([, definition]) => definition.kind === kind)
    .map(([concept]) => concept as IndustryConcept);
}

type VciRow = Record<string, unknown>;

/**
 * Kỳ báo cáo lưu chuyển tiền tệ lập theo phương pháp trực tiếp: VCI để mọi dòng của phương pháp
 * gián tiếp bằng 0, gồm LNTT (`cfa1`) và khấu hao (`cfa2`), trong khi lưu chuyển tiền thuần từ
 * hoạt động kinh doanh (`cfa18`) khác 0 (đã đối chiếu ANV, DBD, STK).
 */
export function isDirectMethodRow(row: VciRow): boolean {
  const pbt = finite(row.cfa1);
  const depreciation = finite(row.cfa2);
  const cfo = finite(row.cfa18);
  return pbt === 0 && depreciation === 0 && cfo !== undefined && cfo !== 0;
}

/**
 * PLAN D6, spec v3 §7, §10: một kỳ lập theo phương pháp trực tiếp KHÔNG có dòng khấu hao, nên
 * khấu hao (`cfa2`) và phân bổ lợi thế thương mại (`cfa103`) bị bỏ khỏi kỳ đó thay vì để số 0: mọi
 * cửa sổ 4 quý và năm chứa kỳ đó để trống ở chỉ tiêu cần khấu hao (Khấu hao / Doanh thu, Capex /
 * Khấu hao, Biên EBITDA, Net Debt / EBITDA, EV / EBITDA). Tiền lãi vay đã trả lấy dòng 04 của
 * phương pháp trực tiếp (`cfa42`) vào chỗ dòng 14 (`cfa14`); `cfa42 = 0` thì để trống.
 */
export function applyDirectMethod(rows: readonly VciRow[] | undefined): VciRow[] | undefined {
  if (!rows) return rows;
  return rows.map((row) => {
    if (!isDirectMethodRow(row)) return row;
    const { cfa2: _depreciation, cfa103: _goodwill, cfa14: _interest, ...rest } = row;
    const interestPaid = finite(row.cfa42);
    return interestPaid !== undefined && interestPaid !== 0
      ? { ...rest, cfa14: interestPaid }
      : rest;
  });
}

/**
 * Báo cáo đã công bố của một mã theo mẫu của ngành: dòng "Doanh thu" và các khoản mục riêng của
 * ngành (`industryFieldMap`) cùng các khoản mục chuẩn của Bộ lọc. Cờ `financial` của Bộ lọc luôn
 * tắt: nó chặn các chỉ tiêu "không áp dụng cho tổ chức tài chính", còn Dashboard đã có danh mục
 * riêng cho từng ngành và tính "doanh thu" theo ngành. Mẫu doanh nghiệp xử lý kỳ lập theo phương
 * pháp trực tiếp (`applyDirectMethod`); Bộ lọc không đổi.
 */
export function normalizeIndustryStatements(
  sections: VciStatementSections,
  asOf: Date,
  industry: Industry,
  nganh?: Nganh,
): NormalizedStatements {
  const source: VciStatementSections =
    industry === 'thuong'
      ? {
          ...sections,
          cash_flow: {
            ...sections.cash_flow,
            ...(sections.cash_flow.years
              ? { years: applyDirectMethod(sections.cash_flow.years) }
              : {}),
            ...(sections.cash_flow.quarters
              ? { quarters: applyDirectMethod(sections.cash_flow.quarters) }
              : {}),
          },
        }
      : sections;
  return {
    ...normalizeVciStatements(source, asOf, industryFieldMap(industry, nganh)),
    financial: false,
  };
}
