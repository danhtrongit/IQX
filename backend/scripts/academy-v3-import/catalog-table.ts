import {
  ACADEMY_V3_CATALOG_VERSION,
  questionCountFor,
} from '../../src/modules/academy/content/v3/schema.js';
import type {
  CatalogChapter,
  CatalogFile,
  CatalogItem,
  ItemKind,
} from '../../src/modules/academy/content/v3/schema.js';

/**
 * Design §0.1 (v3.3): the only place lesson keys live. Row order = mockup article order
 * (lesson0..lesson100), which is also the catalog item order inside each chapter.
 */
export interface CatalogRow {
  id: string;
  kind: ItemKind;
  lesson_key: string;
  name: string;
  unlock?:
    | { kind: 'technical'; id: TechnicalIndicatorId; label: string }
    | { kind: 'fundamental'; id: FundamentalMetricId; label: string };
}

/** 16 chỉ báo kỹ thuật mở sau khi đạt bài kiểm tra (spec §4.2). */
export const TECHNICAL_INDICATOR_IDS = [
  'volume',
  'ma',
  'rsi',
  'macd',
  'bollinger',
  'ema',
  'ma_cross',
  'dmi',
  'donchian',
  'stochastic',
  'cci',
  'roc',
  'williams_r',
  'obv',
  'mfi',
  'cmf',
] as const;
export type TechnicalIndicatorId = (typeof TECHNICAL_INDICATOR_IDS)[number];

/** 33 chỉ tiêu cơ bản mở trong Bộ lọc (spec §4.2). Id trùng `metric_id` của registry Bộ lọc. */
export const FUNDAMENTAL_METRIC_IDS = [
  'revenue_yoy',
  'profit_yoy',
  'eps_yoy',
  'revenue_cagr3',
  'profit_cagr3',
  'eps_cagr3',
  'profit_positive_streak',
  'revenue_growth_stability',
  'net_margin_stability',
  'eps_growth_stability',
  'roic_stability',
  'roe',
  'roa',
  'roic',
  'gross_margin',
  'net_margin',
  'asset_turnover',
  'ccc',
  'debt_equity',
  'current_ratio',
  'interest_coverage',
  'net_debt_ebitda',
  'cfo_margin',
  'cfo_profit',
  'capex_revenue',
  'fcf_margin',
  'fcf_positive_streak',
  'pe',
  'pb',
  'ps',
  'peg',
  'ev_ebitda',
  'fcf_yield',
] as const;
export type FundamentalMetricId = (typeof FUNDAMENTAL_METRIC_IDS)[number];

const L = (id: string, slug: string, name: string): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `concept:${slug}`,
  name,
});
const T = (
  id: string,
  ind: TechnicalIndicatorId,
  name: string,
  label: string,
): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `technical:${ind}`,
  name,
  unlock: { kind: 'technical', id: ind, label },
});
const F = (
  id: string,
  metric: FundamentalMetricId,
  name: string,
  label: string,
): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `fundamental:${metric}`,
  name,
  unlock: { kind: 'fundamental', id: metric, label },
});
const E = (ch: number): CatalogRow => {
  const cc = `ch${String(ch).padStart(2, '0')}`;
  return {
    id: `${cc}-exam`,
    kind: 'chapter_exam',
    lesson_key: `exam:${cc}`,
    name: `Bài thi Chương ${ch}`,
  };
};

export const CATALOG_ROWS: readonly CatalogRow[] = [
  L('ch01-l01', 'dau_tu_chung_khoan', 'Đầu tư chứng khoán'),
  L('ch01-l02', 'thi_truong_va_san', 'Thị trường và các sàn'),
  L('ch01-l03', 'co_che_giao_dich', 'Cơ chế giao dịch'),
  L('ch01-l04', 't2_phi_thue_margin', 'T+2, phí, thuế và margin'),
  L('ch01-l05', 'co_phieu_trai_phieu', 'Cổ phiếu và trái phiếu'),
  L('ch01-l06', 'quy_etf_cw_phai_sinh', 'Quỹ, ETF, chứng quyền và phái sinh'),
  L('ch01-l07', 'quyen_co_dong', 'Quyền cổ đông và sự kiện doanh nghiệp'),
  L('ch01-l08', 'chu_ky_kinh_te_lai_suat', 'Chu kỳ kinh tế và lãi suất'),
  L('ch01-l09', 'bon_pha_thi_truong', 'Bốn pha của thị trường'),
  L('ch01-l10', 'quan_tri_rui_ro_tam_ly', 'Quản trị rủi ro và tâm lý đầu tư'),
  E(1),
  L('ch02-l01', 'saco_la_ai', 'SACO là ai và làm gì'),
  L('ch02-l02', 'hieu_khach_hang', 'Hiểu khách hàng'),
  L('ch02-l03', 'tim_khach_hang', 'Tìm khách hàng'),
  L('ch02-l04', 'mo_loi_tiep_can', 'Mở lời tiếp cận'),
  L('ch02-l05', 'tu_van_hoi_nghe', 'Tư vấn: hỏi đúng, nghe nhiều'),
  L('ch02-l06', 'ban_gia_tri_dong_hanh', 'Bán giá trị bạn đồng hành'),
  L('ch02-l07', 'xu_ly_tu_choi', 'Xử lý từ chối'),
  L('ch02-l08', 'chot_kich_hoat_khach', 'Chốt và kích hoạt khách'),
  L('ch02-l09', 'cham_soc_gioi_thieu', 'Chăm sóc và giới thiệu'),
  L('ch02-l10', 'nguyen_tac_lich_lam_viec', 'Nguyên tắc nghề và lịch làm việc mỗi ngày'),
  E(2),
  L('ch03-l01', 'vi_sao_thuong_hieu', 'Vì sao SACO cần thương hiệu cá nhân'),
  L('ch03-l02', 'dinh_vi_hinh_anh', 'Định vị và hình ảnh'),
  L('ch03-l03', 'thuong_hieu_offline', 'Thương hiệu offline'),
  L('ch03-l04', 'he_sinh_thai_online', 'Hệ sinh thái online'),
  L('ch03-l05', 'thuong_hieu_facebook', 'Thương hiệu trên Facebook cá nhân'),
  L('ch03-l06', 'thuong_hieu_zalo', 'Thương hiệu trên Zalo'),
  L('ch03-l07', 'thuong_hieu_tiktok_reels', 'Thương hiệu trên TikTok và Reels'),
  L('ch03-l08', 'livestream_hoi_nhom', 'Livestream và hội nhóm'),
  L('ch03-l09', 'tam_sai_lam_100_ngay', 'Tám sai lầm và kế hoạch 100 ngày'),
  E(3),
  {
    id: 'ch03-practice',
    kind: 'practice',
    lesson_key: 'concept:phong_tap_thuc_chien',
    name: 'Phòng tập thực chiến',
  },
  L('ch04-l01', 'bieu_do_nen', 'Biểu đồ nến'),
  L('ch04-l02', 'xu_huong', 'Xu hướng'),
  L('ch04-l03', 'ho_tro_khang_cu', 'Hỗ trợ và kháng cự'),
  T('ch04-l04', 'volume', 'Khối lượng', 'Khối lượng'),
  T('ch04-l05', 'ma', 'MA · đường trung bình', 'MA'),
  T('ch04-l06', 'rsi', 'RSI', 'RSI'),
  T('ch04-l07', 'macd', 'MACD', 'MACD'),
  T('ch04-l08', 'bollinger', 'Bollinger Bands', 'Bollinger Bands'),
  L('ch04-l09', 'fibonacci', 'Fibonacci'),
  L('ch04-l10', 'song_elliott', 'Sóng Elliott'),
  E(4),
  L('ch05-l01', 'dca', 'Đầu tư định kỳ (DCA)'),
  L('ch05-l02', 'dau_tu_gia_tri', 'Đầu tư giá trị'),
  L('ch05-l03', 'phuong_phap_4m', 'Phương pháp 4M'),
  L('ch05-l04', 'canslim', 'CANSLIM'),
  E(5),
  T('ch06-l01', 'ema', 'EMA · đường trung bình hàm mũ', 'EMA'),
  T('ch06-l02', 'ma_cross', 'MA Cross · giao cắt đường trung bình', 'MA Cross'),
  T('ch06-l03', 'dmi', 'DMI · chỉ báo định hướng', 'DMI'),
  T('ch06-l04', 'donchian', 'Donchian Channel · kênh giá', 'Donchian Channel'),
  E(6),
  T('ch07-l01', 'stochastic', 'Stochastic · dao động ngẫu nhiên', 'Stochastic'),
  T('ch07-l02', 'cci', 'CCI · chỉ số kênh hàng hóa', 'CCI'),
  T('ch07-l03', 'roc', 'ROC · tốc độ thay đổi giá', 'ROC'),
  T('ch07-l04', 'williams_r', 'Williams %R · chỉ báo Williams', 'Williams %R'),
  T('ch07-l05', 'obv', 'OBV · khối lượng cân bằng', 'OBV'),
  T('ch07-l06', 'mfi', 'MFI · chỉ số dòng tiền', 'MFI'),
  T('ch07-l07', 'cmf', 'Chaikin Money Flow · dòng tiền Chaikin', 'Chaikin Money Flow'),
  E(7),
  F('ch08-l01', 'revenue_yoy', 'Tăng trưởng doanh thu YoY', 'Tăng trưởng doanh thu YoY'),
  F('ch08-l02', 'profit_yoy', 'Tăng trưởng LNST YoY', 'Tăng trưởng LNST YoY'),
  F('ch08-l03', 'eps_yoy', 'Tăng trưởng EPS YoY', 'Tăng trưởng EPS YoY'),
  F(
    'ch08-l04',
    'revenue_cagr3',
    'Revenue CAGR 3Y · tăng trưởng doanh thu kép 3 năm',
    'Revenue CAGR 3Y',
  ),
  F(
    'ch08-l05',
    'profit_cagr3',
    'Net Profit CAGR 3Y · tăng trưởng LNST kép 3 năm',
    'Net Profit CAGR 3Y',
  ),
  F('ch08-l06', 'eps_cagr3', 'EPS CAGR 3Y · tăng trưởng EPS kép 3 năm', 'EPS CAGR 3Y'),
  E(8),
  F(
    'ch09-l01',
    'profit_positive_streak',
    'Profit Positive Streak · số năm lãi liên tiếp',
    'Profit Positive Streak',
  ),
  F(
    'ch09-l02',
    'revenue_growth_stability',
    'Revenue Growth Stability · độ ổn định tăng trưởng doanh thu',
    'Revenue Growth Stability',
  ),
  F(
    'ch09-l03',
    'net_margin_stability',
    'Margin Stability · độ ổn định biên lợi nhuận',
    'Margin Stability',
  ),
  F('ch09-l04', 'eps_growth_stability', 'EPS Stability · độ ổn định EPS', 'EPS Stability'),
  F('ch09-l05', 'roic_stability', 'ROIC Stability · độ ổn định ROIC', 'ROIC Stability'),
  E(9),
  F('ch10-l01', 'roe', 'ROE · tỷ suất lợi nhuận trên vốn chủ', 'ROE'),
  F('ch10-l02', 'roa', 'ROA · tỷ suất lợi nhuận trên tổng tài sản', 'ROA'),
  F('ch10-l03', 'roic', 'ROIC · tỷ suất lợi nhuận trên vốn đầu tư', 'ROIC'),
  F('ch10-l04', 'gross_margin', 'Biên lợi nhuận gộp', 'Biên lợi nhuận gộp'),
  F('ch10-l05', 'net_margin', 'Biên lợi nhuận ròng', 'Biên lợi nhuận ròng'),
  F('ch10-l06', 'asset_turnover', 'Asset Turnover · vòng quay tài sản', 'Asset Turnover'),
  F(
    'ch10-l07',
    'ccc',
    'Cash Conversion Cycle · chu kỳ chuyển đổi tiền mặt',
    'Cash Conversion Cycle',
  ),
  E(10),
  F('ch11-l01', 'debt_equity', 'D/E · nợ vay trên vốn chủ', 'D/E'),
  F(
    'ch11-l02',
    'current_ratio',
    'Current Ratio · khả năng thanh toán hiện hành',
    'Current Ratio',
  ),
  F('ch11-l03', 'interest_coverage', 'Interest Coverage · khả năng trả lãi', 'Interest Coverage'),
  F(
    'ch11-l04',
    'net_debt_ebitda',
    'Net Debt / EBITDA · nợ ròng trên EBITDA',
    'Net Debt / EBITDA',
  ),
  E(11),
  F('ch12-l01', 'cfo_margin', 'CFO Margin · biên dòng tiền hoạt động', 'CFO Margin'),
  F('ch12-l02', 'cfo_profit', 'CFO / LNST · chất lượng lợi nhuận', 'CFO / LNST'),
  F('ch12-l03', 'capex_revenue', 'Capex / Revenue · tỷ lệ chi đầu tư', 'Capex / Revenue'),
  F('ch12-l04', 'fcf_margin', 'FCF Margin · biên dòng tiền tự do', 'FCF Margin'),
  F(
    'ch12-l05',
    'fcf_positive_streak',
    'FCF Positive Streak · số năm dòng tiền tự do dương liên tiếp',
    'FCF Positive Streak',
  ),
  E(12),
  F('ch13-l01', 'pe', 'P/E · giá trên lợi nhuận', 'P/E'),
  F('ch13-l02', 'pb', 'P/B · giá trên giá trị sổ sách', 'P/B'),
  F('ch13-l03', 'ps', 'P/S · giá trên doanh thu', 'P/S'),
  F('ch13-l04', 'peg', 'PEG · P/E so với tăng trưởng', 'PEG'),
  F('ch13-l05', 'ev_ebitda', 'EV / EBITDA', 'EV / EBITDA'),
  F('ch13-l06', 'fcf_yield', 'FCF Yield · tỷ suất dòng tiền tự do', 'FCF Yield'),
  E(13),
];

export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: 'Nền tảng',
  2: 'Kỹ năng Sale SACO',
  3: 'Thương hiệu cá nhân',
  4: 'Phương pháp kỹ thuật',
  5: 'Phương pháp cơ bản',
  6: 'Chỉ báo xu hướng',
  7: 'Chỉ báo động lượng và dòng tiền',
  8: 'Tốc độ tăng trưởng',
  9: 'Độ ổn định',
  10: 'Hiệu quả và biên lợi nhuận',
  11: 'Nợ và khả năng thanh toán',
  12: 'Dòng tiền',
  13: 'Định giá',
};

/** First sentence of the exam intro (the UI appends the bold "Cần trả lời đúng tất cả câu hỏi..."). */
export function examIntro(chapter: number): string {
  const n = questionCountFor(chapter, 'chapter_exam');
  if (chapter === 2)
    return `Bài thi gồm ${n} câu hỏi về toàn bộ kỹ năng sale của SACO trong Chương 2.`;
  if (chapter === 3)
    return `Bài thi gồm ${n} câu hỏi về toàn bộ kiến thức thương hiệu cá nhân trong Chương 3.`;
  return `Bài thi gồm ${n} câu hỏi về toàn bộ kiến thức Chương ${chapter}.`;
}

/** Sentence the mockup appends to every exam lead; checked, then dropped. */
export const EXAM_LEAD_SUFFIX = 'Cần trả lời đúng tất cả câu hỏi để hoàn thành.';

export const chapterOf = (id: string): number => Number(id.slice(2, 4));

/** Unlock of one row, narrowed to the discriminated union of the catalog schema. */
function unlockOf(row: CatalogRow): CatalogItem['unlock'] {
  if (!row.unlock) return null;
  return row.unlock.kind === 'technical'
    ? { kind: 'technical', id: row.unlock.id, label: row.unlock.label }
    : { kind: 'fundamental', id: row.unlock.id, label: row.unlock.label };
}

export function buildCatalog(): CatalogFile {
  const chapters: CatalogChapter[] = [];
  for (let no = 1; no <= 13; no += 1) {
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
      unlock: unlockOf(r),
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
    format: 'iqx-academy-catalog-v3',
    catalog_version: ACADEMY_V3_CATALOG_VERSION,
    chapters,
  };
}
