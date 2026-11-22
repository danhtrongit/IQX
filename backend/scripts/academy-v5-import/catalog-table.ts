import {
  CATALOG_ROWS as V4_ROWS,
  CHAPTER_TITLES as V4_CHAPTER_TITLES,
  chapterOf,
  examIntro,
} from '../academy-v4-import/catalog-table.js';
import {
  ACADEMY_V5_CATALOG_VERSION,
  ACADEMY_V5_CHAPTER_COUNT,
  CHAPTER_NO_PLACEHOLDER,
  examKeyOf,
  nganhOfChapter,
  questionCountFor,
} from '../../src/modules/academy/content/v5/schema.js';
import type {
  CatalogChapter,
  CatalogFile,
  CatalogItem,
  ItemKind,
  Nganh,
} from '../../src/modules/academy/content/v5/schema.js';

export { chapterOf, examIntro };
export { EXAM_LEAD_SUFFIX } from '../academy-v4-import/catalog-table.js';

/**
 * Plan HV v5 §5 / D7-D10: the only place lesson ids, lesson keys, metric keys and industry codes of v5 live. Row order =
 * mockup article order (lesson0..lesson220), which is also the catalog item order inside each chapter.
 *
 * - Chương 1-9 and every v4 lesson keep their v4 row (id, lesson_key, metric_key) unchanged.
 * - Chương 10-12: the v4 lessons keep their ids (`ch10-l01` = NIM is now position 2); the re-taught lessons take the next
 *   free numbers in order of appearance (`ch10-l12` = Tăng trưởng doanh thu · ở ngân hàng, position 1).
 * - Chương 13-17: ids = position.
 * - Every lesson added in v5 has `lesson_key = fundamental:<metric_key>-<nganh>` (D8).
 */
export interface CatalogRow {
  id: string;
  kind: ItemKind;
  lesson_key: string;
  name: string;
  /** Dashboard metric key (chapters 8-17 lessons only). */
  metric_key?: string;
  /** Industry code (chapters 8-17 lessons only). */
  nganh?: Nganh;
  /** True for the 87 lessons added in v5 (extracted from the mockup); false for the 117 v4 lesson files. */
  added: boolean;
}

/**
 * Dashboard metric name (title before " ·") -> metric key. 17 re-taught v4 keys + the 28 new keys of the Dashboard v3
 * catalog (PLAN-dashboard-v3 §6.3, the contract with Học viện v5; it supersedes the names in PLAN-hoc-vien-v5 §5).
 * Formula variants (`roe_fin`, `net_margin_bh`, `gross_margin_q`) keep the lesson keys `roe`, `net_margin`, `gross_margin`.
 */
export const METRIC_KEY_BY_NAME: Readonly<Record<string, string>> = {
  /* re-taught (v4 keys) */
  'Tăng trưởng doanh thu': 'revenue_yoy',
  'Revenue Growth Stability': 'revenue_growth_stability',
  'Margin Stability': 'net_margin_stability',
  ROE: 'roe',
  ROA: 'roa',
  'Biên lợi nhuận ròng': 'net_margin',
  'P/E': 'pe',
  'P/B': 'pb',
  'Biên lợi nhuận gộp': 'gross_margin',
  ROIC: 'roic',
  'Cash Conversion Cycle': 'ccc',
  'D/E': 'debt_equity',
  'Interest Coverage': 'interest_coverage',
  'Net Debt / EBITDA': 'net_debt_ebitda',
  'CFO / LNST': 'cfo_profit',
  'FCF Margin': 'fcf_margin',
  'EV / EBITDA': 'ev_ebitda',
  /* new (Dashboard v3 §6.3) */
  'Lợi nhuận ngoài kinh doanh bất động sản / LNTT': 'non_core_profit_to_pbt',
  'Người mua trả tiền trước / Doanh thu': 'buyer_prepay_to_revenue',
  'Tăng trưởng người mua trả tiền trước': 'buyer_prepay_growth',
  'Doanh thu chưa thực hiện / VCSH': 'unearned_to_equity',
  'Tồn kho / Tổng tài sản': 'inventory_to_assets',
  'Số năm bán hết tồn kho': 'inventory_years',
  'Tỷ trọng bất động sản đầu tư': 'investment_property_share',
  'Phải thu và trả trước / VCSH': 'prepay_receivables_to_equity',
  'Tỷ trọng nợ vay ngắn hạn': 'st_debt_share',
  'Tiền / Nợ vay ngắn hạn': 'cash_to_st_debt',
  'Lãi vay đã trả / Chi phí lãi vay': 'interest_paid_to_expense',
  'Số ngày tồn kho': 'inventory_days',
  'Khấu hao / Doanh thu': 'depreciation_to_revenue',
  'Capex / Khấu hao': 'capex_to_depreciation',
  'Tiền ròng / VCSH': 'net_cash_to_equity',
  'Thu nhập tài chính / LNTT': 'fin_income_to_pbt',
  'Tỷ lệ chi trả cổ tức': 'dividend_payout',
  'Chi phí bán hàng và quản lý / Doanh thu': 'sga_to_revenue',
  'Biên lợi nhuận kinh doanh chính': 'core_margin',
  'Dự phòng giảm giá tồn kho / Tồn kho': 'inventory_provision_ratio',
  'Phải trả người bán / Tồn kho': 'payables_to_inventory',
  'Vay ngắn hạn / Tồn kho': 'st_debt_to_inventory',
  'Doanh thu / Tài sản cố định': 'revenue_to_fixed_assets',
  'Biên EBITDA': 'ebitda_margin',
  'Tài sản cố định / Tổng tài sản': 'fixed_assets_to_assets',
  'Xây dựng dở dang / Tài sản cố định': 'cip_to_fixed_assets',
  'Số ngày thu tiền': 'receivable_days',
  'Chi phí tài chính ngoài lãi vay / LNTT': 'non_interest_fin_cost_to_pbt',
};

/** Metric name of a lesson title: the part before " · " (the whole title when there is none). */
export const metricNameOf = (title: string): string => title.split(' · ')[0] ?? title;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A lesson added in v5: metric key from its title, key `fundamental:<metric_key>-<nganh>`. */
const N = (id: string, name: string): CatalogRow => {
  const metric = METRIC_KEY_BY_NAME[metricNameOf(name)];
  if (!metric) throw new Error(`${id}: no metric key for "${metricNameOf(name)}"`);
  const nganh = nganhOfChapter(chapterOf(id));
  if (!nganh) throw new Error(`${id}: no industry for chapter ${chapterOf(id)}`);
  return {
    id,
    kind: 'lesson',
    lesson_key: `fundamental:${metric}-${nganh}`,
    name,
    metric_key: metric,
    nganh,
    added: true,
  };
};

const v4Row = (id: string): CatalogRow => {
  const r = V4_ROWS.find((x) => x.id === id);
  if (!r) throw new Error(`no v4 row ${id}`);
  const nganh = r.metric_key ? (nganhOfChapter(chapterOf(id)) ?? undefined) : undefined;
  return { ...r, ...(nganh ? { nganh } : {}), added: false };
};
const V = (id: string): CatalogRow => v4Row(id);
const E = (ch: number): CatalogRow => {
  const id = `ch${pad2(ch)}-exam`;
  if (ch <= 12) return v4Row(id);
  return {
    id,
    kind: 'chapter_exam',
    lesson_key: examKeyOf(ch),
    name: `Bài thi Chương ${CHAPTER_NO_PLACEHOLDER}`,
    added: true,
  };
};
/** Chapter `ch` lessons, ids = position (chapters 13-17). */
const chapter = (ch: number, names: readonly string[]): CatalogRow[] => [
  ...names.map((name, k) => N(`ch${pad2(ch)}-l${pad2(k + 1)}`, name)),
  E(ch),
];

export const CATALOG_ROWS: readonly CatalogRow[] = [
  /* Chương 1-9: v4 rows in v4 order (Chương 3 keeps its optional practice after the exam). */
  ...V4_ROWS.filter((r) => chapterOf(r.id) <= 9).map((r) => v4Row(r.id)),
  /* Chương 10 · ngân hàng (spec v5 §1.5) */
  N('ch10-l12', 'Tăng trưởng doanh thu · ở ngân hàng'),
  V('ch10-l01'),
  V('ch10-l02'),
  V('ch10-l03'),
  V('ch10-l04'),
  V('ch10-l05'),
  N('ch10-l13', 'ROE · ở ngân hàng'),
  N('ch10-l14', 'ROA · ở ngân hàng'),
  V('ch10-l06'),
  V('ch10-l07'),
  V('ch10-l08'),
  V('ch10-l09'),
  V('ch10-l10'),
  V('ch10-l11'),
  N('ch10-l15', 'P/B · ở ngân hàng'),
  E(10),
  /* Chương 11 · chứng khoán (§1.6) */
  N('ch11-l11', 'Tăng trưởng doanh thu · ở công ty chứng khoán'),
  V('ch11-l01'),
  V('ch11-l02'),
  N('ch11-l12', 'Margin Stability · ở công ty chứng khoán'),
  V('ch11-l03'),
  V('ch11-l04'),
  V('ch11-l05'),
  V('ch11-l06'),
  V('ch11-l07'),
  V('ch11-l08'),
  V('ch11-l09'),
  V('ch11-l10'),
  N('ch11-l13', 'ROE · ở công ty chứng khoán'),
  N('ch11-l14', 'P/B · ở công ty chứng khoán'),
  E(11),
  /* Chương 12 · bảo hiểm (§1.7) */
  V('ch12-l01'),
  V('ch12-l02'),
  V('ch12-l03'),
  V('ch12-l04'),
  V('ch12-l05'),
  V('ch12-l06'),
  V('ch12-l07'),
  N('ch12-l09', 'Biên lợi nhuận ròng · ở công ty bảo hiểm'),
  N('ch12-l10', 'ROE · ở công ty bảo hiểm'),
  V('ch12-l08'),
  N('ch12-l11', 'P/B · ở công ty bảo hiểm'),
  E(12),
  /* Chương 13 · bất động sản (§1.8) */
  ...chapter(13, [
    'Tăng trưởng doanh thu · ở bất động sản',
    'Revenue Growth Stability · ở bất động sản',
    'Biên lợi nhuận gộp · ở bất động sản',
    'Lợi nhuận ngoài kinh doanh bất động sản / LNTT · lợi nhuận đến từ đâu',
    'Người mua trả tiền trước / Doanh thu · doanh thu đang chờ ghi nhận',
    'Tăng trưởng người mua trả tiền trước · tín hiệu sớm của bán hàng',
    'Doanh thu chưa thực hiện / VCSH · tiền thuê trả trước',
    'Tồn kho / Tổng tài sản · vốn nằm trong dự án',
    'Số năm bán hết tồn kho · tồn kho bằng bao nhiêu năm giá vốn',
    'Tỷ trọng bất động sản đầu tư · phần tài sản để cho thuê',
    'Phải thu và trả trước / VCSH · tiền đang nằm ở bên khác',
    'D/E · ở bất động sản',
    'Tỷ trọng nợ vay ngắn hạn · áp lực đáo hạn',
    'Tiền / Nợ vay ngắn hạn · có đủ tiền trả nợ sắp đến hạn',
    'Lãi vay đã trả / Chi phí lãi vay · lãi vay đang được vốn hoá',
    'Interest Coverage · ở bất động sản',
    'CFO / LNST · ở bất động sản',
    'P/E · ở bất động sản',
    'P/B · ở bất động sản',
  ]),
  /* Chương 14 · dầu khí (§1.9) */
  ...chapter(14, [
    'Tăng trưởng doanh thu · ở dầu khí',
    'Biên lợi nhuận gộp · ở dầu khí',
    'Margin Stability · ở dầu khí',
    'Số ngày tồn kho · thời gian hàng nằm trong kho',
    'Khấu hao / Doanh thu · mức nặng tài sản',
    'Capex / Khấu hao · đầu tư mới hay chỉ dùng tài sản cũ',
    'ROIC · ở dầu khí',
    'FCF Margin · ở dầu khí',
    'Tiền ròng / VCSH · lượng tiền dư sau khi trừ nợ vay',
    'Net Debt / EBITDA · ở dầu khí',
    'Thu nhập tài chính / LNTT · lợi nhuận từ tiền gửi',
    'Người mua trả tiền trước / Doanh thu · việc đã ký chưa làm',
    'Tỷ lệ chi trả cổ tức · phần lợi nhuận trả lại cổ đông',
    'P/E · ở dầu khí',
    'EV / EBITDA · ở dầu khí',
  ]),
  /* Chương 15 · bán lẻ và hàng tiêu dùng (§1.10) */
  ...chapter(15, [
    'Tăng trưởng doanh thu · ở bán lẻ và tiêu dùng',
    'Biên lợi nhuận gộp · ở bán lẻ và tiêu dùng',
    'Chi phí bán hàng và quản lý / Doanh thu · chi phí vận hành chuỗi',
    'Biên lợi nhuận kinh doanh chính · lãi từ việc bán hàng',
    'Số ngày tồn kho · tốc độ quay vòng hàng hoá',
    'Dự phòng giảm giá tồn kho / Tồn kho · hàng đang mất giá',
    'Phải trả người bán / Tồn kho · nhà cung cấp tài trợ hàng hoá',
    'Cash Conversion Cycle · ở bán lẻ và tiêu dùng',
    'Vay ngắn hạn / Tồn kho · hàng hoá được tài trợ bằng nợ',
    'Doanh thu / Tài sản cố định · mỗi đồng cửa hàng bán được bao nhiêu',
    'ROIC · ở bán lẻ và tiêu dùng',
    'Tỷ lệ chi trả cổ tức · ở bán lẻ và tiêu dùng',
    'P/E · ở bán lẻ và tiêu dùng',
  ]),
  /* Chương 16 · điện và tiện ích (§1.11) */
  ...chapter(16, [
    'Tăng trưởng doanh thu · ở điện',
    'Biên lợi nhuận gộp · ở điện',
    'Margin Stability · ở điện',
    'Biên EBITDA · biên lợi nhuận trước khấu hao',
    'Khấu hao / Doanh thu · ở điện',
    'Tài sản cố định / Tổng tài sản · mức nặng tài sản',
    'Xây dựng dở dang / Tài sản cố định · nhà máy đang xây',
    'Capex / Khấu hao · ở điện',
    'Số ngày thu tiền · bên mua điện trả tiền nhanh hay chậm',
    'D/E · ở điện',
    'Net Debt / EBITDA · ở điện',
    'Interest Coverage · ở điện',
    'Chi phí tài chính ngoài lãi vay / LNTT · ảnh hưởng của tỷ giá',
    'Tỷ lệ chi trả cổ tức · ở điện',
    'EV / EBITDA · ở điện',
  ]),
  /* Chương 17 · vật liệu cơ bản (§1.12) */
  ...chapter(17, [
    'Tăng trưởng doanh thu · ở vật liệu cơ bản',
    'Biên lợi nhuận gộp · ở vật liệu cơ bản',
    'Margin Stability · ở vật liệu cơ bản',
    'Số ngày tồn kho · ở vật liệu cơ bản',
    'Dự phòng giảm giá tồn kho / Tồn kho · ở vật liệu cơ bản',
    'Vay ngắn hạn / Tồn kho · ở vật liệu cơ bản',
    'Biên EBITDA · ở vật liệu cơ bản',
    'Capex / Khấu hao · ở vật liệu cơ bản',
    'Xây dựng dở dang / Tài sản cố định · ở vật liệu cơ bản',
    'ROIC · ở vật liệu cơ bản',
    'Net Debt / EBITDA · ở vật liệu cơ bản',
    'Chi phí tài chính ngoài lãi vay / LNTT · ở vật liệu cơ bản',
    'EV / EBITDA · ở vật liệu cơ bản',
    'P/B · ở vật liệu cơ bản',
  ]),
];

export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  ...V4_CHAPTER_TITLES,
  13: 'Phân tích công ty bất động sản',
  14: 'Phân tích doanh nghiệp dầu khí',
  15: 'Phân tích bán lẻ và hàng tiêu dùng',
  16: 'Phân tích điện và tiện ích',
  17: 'Phân tích vật liệu cơ bản',
};

/**
 * Spec v5 §2.3: the industry part of Chương 13-17 lessons (last section before Tóm tắt) and its cards. The mockup
 * uses the same title in every lesson of the chapter.
 */
export const INDUSTRY_PART: Readonly<Record<number, { title: string; cards: readonly string[] }>> =
  {
    13: { title: 'Nhà ở và khu công nghiệp', cards: ['Nhà ở', 'Khu công nghiệp'] },
    14: { title: 'Theo từng mảng', cards: ['Thượng nguồn và dịch vụ', 'Trung nguồn', 'Hạ nguồn'] },
    15: { title: 'Bán lẻ và hàng tiêu dùng', cards: ['Chuỗi bán lẻ', 'Sản xuất hàng tiêu dùng'] },
    16: { title: 'Theo loại nguồn điện', cards: ['Thủy điện', 'Nhiệt điện', 'Tái tạo và nước'] },
    17: { title: 'Theo từng mảng', cards: ['Thép', 'Xi măng', 'Phân bón và hoá chất'] },
  };

/** Section title that replaces "Với ngân hàng, chứng khoán, bảo hiểm" in Chương 8 and is added to 9 Chương 9 lessons. */
export const INDUSTRIES_SECTION = 'Ở các ngành';
export const OLD_INDUSTRIES_SECTION = 'Với ngân hàng, chứng khoán, bảo hiểm';

export function buildCatalog(): CatalogFile {
  const chapters: CatalogChapter[] = [];
  for (let no = 1; no <= ACADEMY_V5_CHAPTER_COUNT; no += 1) {
    const rows = CATALOG_ROWS.filter((r) => chapterOf(r.id) === no);
    if (rows.length === 0) throw new Error(`chapter ${no}: no rows`);
    const items: CatalogItem[] = rows.map((r, k) => ({
      id: r.id,
      kind: r.kind,
      lesson_key: r.lesson_key,
      order: k + 1,
      name: r.name,
      optional: r.kind === 'practice',
      question_count: questionCountFor(no, r.kind),
      metric_key: r.metric_key ?? null,
      nganh: r.nganh ?? null,
      has_scenario: r.kind === 'lesson' && (no === 2 || no === 3),
      intro: r.kind === 'chapter_exam' ? examIntro(no) : null,
    }));
    chapters.push({
      no,
      title: CHAPTER_TITLES[no] ?? '',
      published: true,
      audience: 'all',
      lesson_count: items.filter((i) => i.kind === 'lesson').length,
      items,
    });
  }
  return {
    format: 'iqx-academy-catalog-v4',
    catalog_version: ACADEMY_V5_CATALOG_VERSION,
    chapters,
  };
}
