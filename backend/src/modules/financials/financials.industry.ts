/**
 * Ngành của một mã theo MẪU BÁO CÁO TÀI CHÍNH mà doanh nghiệp đang dùng (Dashboard v2 §1.3).
 *
 * Ngành lấy từ nguồn dữ liệu, không nhập tay: VCI IQ trả cho mọi mã cùng một bộ cột (hợp của bốn
 * mẫu báo cáo), cột nào không thuộc mẫu của doanh nghiệp thì bằng 0. Nên mẫu được nhận ra bằng
 * các dòng CHỈ có ở mẫu đó và khác 0 trong báo cáo kết quả kinh doanh:
 *
 *  | Mẫu báo cáo                               | Dòng nhận diện            | Ngành   |
 *  |-------------------------------------------|---------------------------|---------|
 *  | Tổ chức tín dụng (gồm công ty tài chính)  | isb25–isb33, isb37–isb41  | `nh`    |
 *  | Công ty chứng khoán                       | iss*                      | `ck`    |
 *  | Doanh nghiệp bảo hiểm                     | isi*                      | `bh`    |
 *  | Doanh nghiệp (mọi trường hợp còn lại)     | —                         | `thuong`|
 *
 * Bất động sản, bán lẻ, dịch vụ… dùng mẫu doanh nghiệp nên thuộc `thuong`. Mã không xác định được
 * mẫu (mới niêm yết, chưa có báo cáo) coi là `thuong`; công ty tài chính dùng mẫu tổ chức tín dụng
 * nên thuộc `nh` (§13). Hàm thuần, dùng lại được cho Bộ lọc.
 */
import { finite } from './financials.calculations.js';

export const INDUSTRIES = ['thuong', 'nh', 'ck', 'bh'] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** Ngành của mã không xác định được mẫu báo cáo (§13). */
export const DEFAULT_INDUSTRY: Industry = 'thuong';

/** Nhãn ngành hiện cạnh mã trên dashboard (§1.2). */
export const INDUSTRY_LABELS: Readonly<Record<Industry, string>> = {
  thuong: 'Doanh nghiệp sản xuất',
  nh: 'Ngân hàng',
  ck: 'Chứng khoán',
  bh: 'Bảo hiểm',
};

export function isIndustry(value: unknown): value is Industry {
  return typeof value === 'string' && (INDUSTRIES as readonly string[]).includes(value);
}

type Row = Readonly<Record<string, unknown>>;

/** Các dòng báo cáo kết quả kinh doanh của VCI (`years` và/hoặc `quarters`) hoặc một danh sách dòng. */
export type IndustrySource =
  | readonly Row[]
  | { readonly years?: readonly Row[]; readonly quarters?: readonly Row[] };

/**
 * Tổ chức tín dụng: thu nhập lãi (isb25–isb33) và tổng thu nhập hoạt động, chi phí, dự phòng
 * (isb37–isb41). isb34–isb36 (thu nhập/chi phí khác) cũng xuất hiện ở mẫu khác nên không dùng.
 */
const BANK_SIGNATURE = new Set<string>([
  ...Array.from({ length: 9 }, (_, i) => `isb${25 + i}`),
  ...Array.from({ length: 5 }, (_, i) => `isb${37 + i}`),
]);
const SECURITIES_SIGNATURE = /^iss\d+$/;
const INSURANCE_SIGNATURE = /^isi\d+$/;

function rowsOf(source: IndustrySource): readonly Row[] {
  if (Array.isArray(source)) return source as readonly Row[];
  const sections = source as { years?: readonly Row[]; quarters?: readonly Row[] };
  return [...(sections.quarters ?? []), ...(sections.years ?? [])];
}

/** Số dòng nhận diện khác 0 của từng mẫu, cộng dồn trên mọi kỳ. */
export function industrySignals(source: IndustrySource): Record<Exclude<Industry, 'thuong'>, number> {
  const signals = { nh: 0, ck: 0, bh: 0 };
  for (const row of rowsOf(source)) {
    for (const [key, value] of Object.entries(row)) {
      if ((finite(value) ?? 0) === 0) continue;
      if (BANK_SIGNATURE.has(key)) signals.nh += 1;
      else if (SECURITIES_SIGNATURE.test(key)) signals.ck += 1;
      else if (INSURANCE_SIGNATURE.test(key)) signals.bh += 1;
    }
  }
  return signals;
}

/**
 * Ngành của mã, từ các dòng báo cáo kết quả kinh doanh của VCI. Mẫu có nhiều dòng nhận diện khác 0
 * nhất thắng (thực tế chỉ có một mẫu); không dòng nào thì `thuong`.
 */
export function detectIndustry(source: IndustrySource): Industry {
  const signals = industrySignals(source);
  let best: Industry = DEFAULT_INDUSTRY;
  let bestScore = 0;
  for (const industry of ['nh', 'ck', 'bh'] as const) {
    if (signals[industry] > bestScore) {
      best = industry;
      bestScore = signals[industry];
    }
  }
  return best;
}
