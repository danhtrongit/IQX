/**
 * Ngành của Dashboard phân tích v3 (spec v3 §1.3): 9 mã ngành, chỉ dùng trong module dashboard.
 *
 * Hai khái niệm tách bạch (PLAN-dashboard-v3 D1):
 * - `Industry` (`financials.industry.ts`) là MẪU báo cáo tài chính, 4 giá trị, dùng chung với Bộ
 *   lọc và cột `symbols.statement_template`. Không đổi.
 * - `Nganh` (file này) là ngành hiển thị của dashboard: mẫu `nh/ck/bh` giữ nguyên, mẫu doanh
 *   nghiệp (`thuong`) chia tiếp theo phân ngành ICB của VCI thành `bds/dk/bl/dien/vl/thuong`.
 *
 * Bảng ánh xạ ICB là cấu hình hệ thống (§1.3 bước 2), không phải ngoại lệ theo mã.
 */
import type { Industry } from '../financials/financials.industry.js';

export const NGANH = ['thuong', 'nh', 'ck', 'bh', 'bds', 'dk', 'bl', 'dien', 'vl'] as const;
export type Nganh = (typeof NGANH)[number];

/** Năm ngành mới của v3 (đều dùng mẫu báo cáo doanh nghiệp). */
export const NEW_NGANH = ['bds', 'dk', 'bl', 'dien', 'vl'] as const satisfies readonly Nganh[];

/** Nhãn ngành hiện cạnh mã (§1.2, §1.3). */
export const NGANH_LABELS: Readonly<Record<Nganh, string>> = {
  thuong: 'Doanh nghiệp sản xuất',
  nh: 'Ngân hàng',
  ck: 'Chứng khoán',
  bh: 'Bảo hiểm',
  bds: 'Bất động sản',
  dk: 'Dầu khí',
  bl: 'Bán lẻ và tiêu dùng',
  dien: 'Điện và tiện ích',
  vl: 'Vật liệu cơ bản',
};

/** Tên ngành viết thường trong tiêu đề nhóm cấp 1 "Chỉ tiêu <ngành>" (§3.2). */
export const NGANH_CHAPTER_TITLES: Readonly<Record<Nganh, string>> = {
  thuong: 'Chỉ tiêu doanh nghiệp sản xuất',
  nh: 'Chỉ tiêu ngân hàng',
  ck: 'Chỉ tiêu chứng khoán',
  bh: 'Chỉ tiêu bảo hiểm',
  bds: 'Chỉ tiêu bất động sản',
  dk: 'Chỉ tiêu dầu khí',
  bl: 'Chỉ tiêu bán lẻ và tiêu dùng',
  dien: 'Chỉ tiêu điện và tiện ích',
  vl: 'Chỉ tiêu vật liệu cơ bản',
};

/** Chương Học viện v5: chung 8, rồi mỗi ngành một chương 9–17 (PLAN §4). */
export const COMMON_ACADEMY_CHAPTER = 8;
export const NGANH_ACADEMY_CHAPTERS: Readonly<Record<Nganh, number>> = {
  thuong: 9,
  nh: 10,
  ck: 11,
  bh: 12,
  bds: 13,
  dk: 14,
  bl: 15,
  dien: 16,
  vl: 17,
};

export function isNganh(value: unknown): value is Nganh {
  return typeof value === 'string' && (NGANH as readonly string[]).includes(value);
}

/** Mã ICB của VCI (cấp 2 và cấp 4) của một mã; thiếu cấp nào thì để trống. */
export interface IcbCodes {
  lv2?: string | null;
  lv4?: string | null;
}

/** ICB cấp 4 xét trước cấp 2 (PLAN §4). */
const ICB_LV4: Readonly<Record<string, Nganh>> = {
  '7573': 'dk', // Phân phối xăng dầu & khí đốt (GAS), dù cấp 2 là 7500 tiện ích
  '2353': 'vl', // Vật liệu xây dựng & nội thất (xi măng), dù cấp 2 là 2300 xây dựng
};

const ICB_LV2: Readonly<Record<string, Nganh>> = {
  '8600': 'bds', // Bất động sản (gồm khu công nghiệp)
  '0500': 'dk', // Dầu khí
  '5300': 'bl', // Bán lẻ
  '3500': 'bl', // Thực phẩm và đồ uống
  '3700': 'bl', // Hàng cá nhân & gia dụng
  '7500': 'dien', // Điện, nước & khí đốt (trừ 7573)
  '1700': 'vl', // Tài nguyên cơ bản
  '1300': 'vl', // Hoá chất (gồm phân bón)
};

/**
 * Ngành dashboard của một mã (§1.3, PLAN D3): mẫu báo cáo trước (`nh/ck/bh`, gồm công ty tài
 * chính theo mẫu tổ chức tín dụng), rồi ICB cho mẫu doanh nghiệp. Không có ICB, hoặc ICB ngoài
 * bảng → `thuong` (§13.1).
 */
export function nganhOf(template: Industry, icb: IcbCodes | null): Nganh {
  if (template !== 'thuong') return template;
  if (!icb) return 'thuong';
  const byLv4 = icb.lv4 ? ICB_LV4[icb.lv4] : undefined;
  if (byLv4) return byLv4;
  const byLv2 = icb.lv2 ? ICB_LV2[icb.lv2] : undefined;
  return byLv2 ?? 'thuong';
}
