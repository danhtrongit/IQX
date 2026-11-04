import {
  ACADEMY_V4_CATALOG_VERSION,
  CHAPTER_NO_PLACEHOLDER,
  examKeyOf,
  questionCountFor,
} from '../../src/modules/academy/content/v4/schema.js';
import type {
  CatalogChapter,
  CatalogFile,
  CatalogItem,
  ItemKind,
} from '../../src/modules/academy/content/v4/schema.js';

/**
 * Design §0.1 (v4): the only place lesson keys live. Row order = mockup article order
 * (lesson0..lesson128), which is also the catalog item order inside each chapter.
 *
 * Keys are durable: every lesson of v3.3 keeps its `lesson_key`, so completions carry over (spec §5.3). The 33
 * metric lessons of chapters 8-9 moved from v3.3 chapters 8-13 and keep `fundamental:<metric id>`; the 29 new
 * bank / securities / insurance lessons get `fundamental:<metric_key>` too (`metric_key` = Dashboard chart id, as
 * fixed by the Dashboard v2 catalog and matched to the lesson by title).
 * Exam keys of chapters 8-12 are new (`examKeyOf`), so an old exam pass never counts for them (spec §5.3.2).
 */
export interface CatalogRow {
  id: string;
  kind: ItemKind;
  lesson_key: string;
  name: string;
  /** Dashboard metric key (chapters 8-12 lessons only). */
  metric_key?: string;
}

const L = (id: string, slug: string, name: string): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `concept:${slug}`,
  name,
});
/** Technical indicator lesson (chapters 4, 6, 7): key `technical:<indicator id>`. */
const T = (id: string, indicator: string, name: string): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `technical:${indicator}`,
  name,
});
/** Metric lesson (chapters 8-12): key `fundamental:<metric key>`. */
const M = (id: string, metric: string, name: string): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `fundamental:${metric}`,
  name,
  metric_key: metric,
});
const E = (ch: number): CatalogRow => {
  const cc = `ch${String(ch).padStart(2, '0')}`;
  return {
    id: `${cc}-exam`,
    kind: 'chapter_exam',
    lesson_key: examKeyOf(ch),
    // Template, not a literal number (spec v4.1 §2.3): the API fills in the learner's chapter number.
    name: `Bài thi Chương ${CHAPTER_NO_PLACEHOLDER}`,
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
  T('ch04-l04', 'volume', 'Khối lượng'),
  T('ch04-l05', 'ma', 'MA · đường trung bình'),
  T('ch04-l06', 'rsi', 'RSI'),
  T('ch04-l07', 'macd', 'MACD'),
  T('ch04-l08', 'bollinger', 'Bollinger Bands'),
  L('ch04-l09', 'fibonacci', 'Fibonacci'),
  L('ch04-l10', 'song_elliott', 'Sóng Elliott'),
  E(4),
  L('ch05-l01', 'dca', 'Đầu tư định kỳ (DCA)'),
  L('ch05-l02', 'dau_tu_gia_tri', 'Đầu tư giá trị'),
  L('ch05-l03', 'phuong_phap_4m', 'Phương pháp 4M'),
  L('ch05-l04', 'canslim', 'CANSLIM'),
  E(5),
  T('ch06-l01', 'ema', 'EMA · đường trung bình hàm mũ'),
  T('ch06-l02', 'ma_cross', 'MA Cross · giao cắt đường trung bình'),
  T('ch06-l03', 'dmi', 'DMI · chỉ báo định hướng'),
  T('ch06-l04', 'donchian', 'Donchian Channel · kênh giá'),
  E(6),
  T('ch07-l01', 'stochastic', 'Stochastic · dao động ngẫu nhiên'),
  T('ch07-l02', 'cci', 'CCI · chỉ số kênh hàng hóa'),
  T('ch07-l03', 'roc', 'ROC · tốc độ thay đổi giá'),
  T('ch07-l04', 'williams_r', 'Williams %R · chỉ báo Williams'),
  T('ch07-l05', 'obv', 'OBV · khối lượng cân bằng'),
  T('ch07-l06', 'mfi', 'MFI · chỉ số dòng tiền'),
  T('ch07-l07', 'cmf', 'Chaikin Money Flow · dòng tiền Chaikin'),
  E(7),
  M('ch08-l01', 'revenue_yoy', 'Tăng trưởng doanh thu'),
  M('ch08-l02', 'profit_yoy', 'Tăng trưởng LNST'),
  M('ch08-l03', 'eps_yoy', 'Tăng trưởng EPS'),
  M('ch08-l04', 'revenue_cagr3', 'Revenue CAGR 3Y · tăng trưởng doanh thu kép 3 năm'),
  M('ch08-l05', 'profit_cagr3', 'Net Profit CAGR 3Y · tăng trưởng LNST kép 3 năm'),
  M('ch08-l06', 'eps_cagr3', 'EPS CAGR 3Y · tăng trưởng EPS kép 3 năm'),
  M('ch08-l07', 'profit_positive_streak', 'Profit Positive Streak · số năm lãi liên tiếp'),
  M(
    'ch08-l08',
    'revenue_growth_stability',
    'Revenue Growth Stability · độ ổn định tăng trưởng doanh thu',
  ),
  M('ch08-l09', 'net_margin_stability', 'Margin Stability · độ ổn định biên lợi nhuận'),
  M('ch08-l10', 'eps_growth_stability', 'EPS Stability · độ ổn định EPS'),
  M('ch08-l11', 'roe', 'ROE · tỷ suất lợi nhuận trên vốn chủ'),
  M('ch08-l12', 'roa', 'ROA · tỷ suất lợi nhuận trên tổng tài sản'),
  M('ch08-l13', 'net_margin', 'Biên lợi nhuận ròng'),
  M('ch08-l14', 'pe', 'P/E · giá trên lợi nhuận'),
  M('ch08-l15', 'pb', 'P/B · giá trên giá trị sổ sách'),
  M('ch08-l16', 'ps', 'P/S · giá trên doanh thu'),
  M('ch08-l17', 'peg', 'PEG · P/E so với tăng trưởng'),
  E(8),
  M('ch09-l01', 'gross_margin', 'Biên lợi nhuận gộp'),
  M('ch09-l02', 'roic', 'ROIC · tỷ suất lợi nhuận trên vốn đầu tư'),
  M('ch09-l03', 'roic_stability', 'ROIC Stability · độ ổn định ROIC'),
  M('ch09-l04', 'asset_turnover', 'Asset Turnover · vòng quay tài sản'),
  M('ch09-l05', 'ccc', 'Cash Conversion Cycle · chu kỳ chuyển đổi tiền mặt'),
  M('ch09-l06', 'debt_equity', 'D/E · nợ vay trên vốn chủ'),
  M('ch09-l07', 'current_ratio', 'Current Ratio · khả năng thanh toán hiện hành'),
  M('ch09-l08', 'interest_coverage', 'Interest Coverage · khả năng trả lãi'),
  M('ch09-l09', 'net_debt_ebitda', 'Net Debt / EBITDA · nợ ròng trên EBITDA'),
  M('ch09-l10', 'cfo_margin', 'CFO Margin · biên dòng tiền hoạt động'),
  M('ch09-l11', 'cfo_profit', 'CFO / LNST · chất lượng lợi nhuận'),
  M('ch09-l12', 'capex_revenue', 'Capex / Revenue · tỷ lệ chi đầu tư'),
  M('ch09-l13', 'fcf_margin', 'FCF Margin · biên dòng tiền tự do'),
  M(
    'ch09-l14',
    'fcf_positive_streak',
    'FCF Positive Streak · số năm dòng tiền tự do dương liên tiếp',
  ),
  M('ch09-l15', 'ev_ebitda', 'EV / EBITDA'),
  M('ch09-l16', 'fcf_yield', 'FCF Yield · tỷ suất dòng tiền tự do'),
  E(9),
  M('ch10-l01', 'nim', 'NIM · biên lãi thuần'),
  M('ch10-l02', 'yield_cost', 'Lợi suất tài sản sinh lãi và chi phí vốn · hai vế của NIM'),
  M('ch10-l03', 'cir', 'CIR · tỷ lệ chi phí trên thu nhập'),
  M('ch10-l04', 'non_interest_share', 'Tỷ trọng thu nhập ngoài lãi · độ đa dạng nguồn thu'),
  M('ch10-l05', 'ppop_growth', 'Tăng trưởng lợi nhuận trước dự phòng · sức kiếm tiền cốt lõi'),
  M('ch10-l06', 'credit_cost', 'Chi phí tín dụng · giá phải trả cho rủi ro cho vay'),
  M('ch10-l07', 'provision_to_loans', 'Tỷ lệ dự phòng / Dư nợ · bộ đệm chống rủi ro'),
  M(
    'ch10-l08',
    'credit_deposit_growth',
    'Tăng trưởng tín dụng và huy động · tốc độ mở rộng của ngân hàng',
  ),
  M('ch10-l09', 'ldr', 'LDR · tỷ lệ cho vay trên tiền gửi'),
  M('ch10-l10', 'accrued_to_loans', 'Lãi dự thu / Dư nợ · chất lượng thu nhập lãi'),
  M('ch10-l11', 'equity_to_assets', 'VCSH / Tổng tài sản · mức đệm vốn của ngân hàng'),
  E(10),
  M('ch11-l01', 'revenue_mix', 'Cơ cấu doanh thu hoạt động · nguồn thu của công ty chứng khoán'),
  M('ch11-l02', 'operating_margin', 'Biên lợi nhuận hoạt động · biên gộp của công ty chứng khoán'),
  M('ch11-l03', 'margin_loan_growth', 'Tăng trưởng dư nợ cho vay · quy mô cho vay margin'),
  M('ch11-l04', 'margin_loan_to_equity', 'Dư nợ cho vay / VCSH · mức dùng vốn cho margin'),
  M('ch11-l05', 'margin_loan_yield', 'Lợi suất cho vay · lãi thu được trên dư nợ'),
  M('ch11-l06', 'brokerage_margin', 'Biên lợi nhuận môi giới · lãi từ phí giao dịch'),
  M('ch11-l07', 'prop_asset_share', 'Tỷ trọng tài sản tự doanh · mức vốn dành cho đầu tư'),
  M('ch11-l08', 'prop_return', 'Hiệu suất tự doanh · lãi trên danh mục đầu tư'),
  M('ch11-l09', 'opex_to_revenue', 'Chi phí hoạt động / Doanh thu hoạt động · mức tiêu hao doanh thu'),
  M('ch11-l10', 'borrowings_to_equity', 'Nợ vay / VCSH · đòn bẩy của công ty chứng khoán'),
  E(11),
  M('ch12-l01', 'gwp_growth', 'Tăng trưởng doanh thu phí bảo hiểm gốc · tốc độ bán bảo hiểm'),
  M('ch12-l02', 'retention_ratio', 'Tỷ lệ giữ lại · phần rủi ro công ty tự gánh'),
  M('ch12-l03', 'loss_ratio', 'Tỷ lệ bồi thường · phần phí dùng để trả tổn thất'),
  M('ch12-l04', 'expense_ratio', 'Tỷ lệ chi phí · chi phí để bán và vận hành'),
  M('ch12-l05', 'combined_ratio', 'Combined ratio · tỷ lệ kết hợp'),
  M('ch12-l06', 'investment_yield', 'Lợi suất đầu tư · hiệu quả của danh mục đầu tư'),
  M('ch12-l07', 'profit_mix', 'Cơ cấu lợi nhuận · bảo hiểm và đầu tư đóng góp bao nhiêu'),
  M('ch12-l08', 'reserves_to_equity', 'Dự phòng nghiệp vụ / VCSH · quy mô nghĩa vụ so với vốn'),
  E(12),
];

/**
 * v3.3 position `[chapter, lesson]` of the 33 lessons that moved into chapters 8-9 (spec §1.3, §1.4 "Nguồn (v3.3)").
 * The mockup keeps naming their charts by the old position (`O10L1-g1`), the lesson files store them under the new one.
 */
export const MOVED_FROM: Readonly<Record<string, readonly [number, number]>> = {
  'ch08-l01': [8, 1],
  'ch08-l02': [8, 2],
  'ch08-l03': [8, 3],
  'ch08-l04': [8, 4],
  'ch08-l05': [8, 5],
  'ch08-l06': [8, 6],
  'ch08-l07': [9, 1],
  'ch08-l08': [9, 2],
  'ch08-l09': [9, 3],
  'ch08-l10': [9, 4],
  'ch08-l11': [10, 1],
  'ch08-l12': [10, 2],
  'ch08-l13': [10, 5],
  'ch08-l14': [13, 1],
  'ch08-l15': [13, 2],
  'ch08-l16': [13, 3],
  'ch08-l17': [13, 4],
  'ch09-l01': [10, 4],
  'ch09-l02': [10, 3],
  'ch09-l03': [9, 5],
  'ch09-l04': [10, 6],
  'ch09-l05': [10, 7],
  'ch09-l06': [11, 1],
  'ch09-l07': [11, 2],
  'ch09-l08': [11, 3],
  'ch09-l09': [11, 4],
  'ch09-l10': [12, 1],
  'ch09-l11': [12, 2],
  'ch09-l12': [12, 3],
  'ch09-l13': [12, 4],
  'ch09-l14': [12, 5],
  'ch09-l15': [13, 5],
  'ch09-l16': [13, 6],
};

export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: 'Nền tảng',
  2: 'Kỹ năng Sale SACO',
  3: 'Thương hiệu cá nhân',
  4: 'Phương pháp kỹ thuật',
  5: 'Phương pháp cơ bản',
  6: 'Chỉ báo xu hướng',
  7: 'Chỉ báo động lượng và dòng tiền',
  8: 'Phân tích cơ bản chung',
  9: 'Phân tích doanh nghiệp sản xuất',
  10: 'Phân tích ngân hàng',
  11: 'Phân tích công ty chứng khoán',
  12: 'Phân tích công ty bảo hiểm',
};

/**
 * First sentence of the exam intro (the UI appends the bold "Cần trả lời đúng tất cả câu hỏi..."), stored as a template:
 * `{n}` is the chapter number the learner sees (spec v4.1 §2.3). The mockup spells the original number, so the
 * importer compares `withChapterNo(template, chapter)` with the mockup text.
 */
export function examIntro(chapter: number): string {
  const n = questionCountFor(chapter, 'chapter_exam');
  if (chapter === 2)
    return `Bài thi gồm ${n} câu hỏi về toàn bộ kỹ năng sale của SACO trong Chương ${CHAPTER_NO_PLACEHOLDER}.`;
  if (chapter === 3)
    return `Bài thi gồm ${n} câu hỏi về toàn bộ kiến thức thương hiệu cá nhân trong Chương ${CHAPTER_NO_PLACEHOLDER}.`;
  return `Bài thi gồm ${n} câu hỏi về toàn bộ kiến thức Chương ${CHAPTER_NO_PLACEHOLDER}.`;
}

/** Sentence the mockup appends to every exam lead; checked, then dropped. */
export const EXAM_LEAD_SUFFIX = 'Cần trả lời đúng tất cả câu hỏi để hoàn thành.';

export const chapterOf = (id: string): number => Number(id.slice(2, 4));

export function buildCatalog(): CatalogFile {
  const chapters: CatalogChapter[] = [];
  for (let no = 1; no <= 12; no += 1) {
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
    catalog_version: ACADEMY_V4_CATALOG_VERSION,
    chapters,
  };
}
