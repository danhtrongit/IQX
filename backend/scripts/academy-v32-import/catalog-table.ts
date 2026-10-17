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
 * Design §0.1: the only place lesson keys live. Row order = mockup article order (lesson0..lesson48),
 * which is also the catalog item order inside each chapter.
 */
export interface CatalogRow {
  id: string;
  kind: ItemKind;
  lesson_key: string;
  name: string;
  unlock?: { id: 'volume' | 'ma' | 'rsi' | 'macd' | 'bollinger'; label: string };
}

const L = (id: string, slug: string, name: string): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `concept:${slug}`,
  name,
});
const T = (
  id: string,
  ind: 'volume' | 'ma' | 'rsi' | 'macd' | 'bollinger',
  name: string,
  label: string,
): CatalogRow => ({
  id,
  kind: 'lesson',
  lesson_key: `technical:${ind}`,
  name,
  unlock: { id: ind, label },
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
];

export const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: 'Nền tảng',
  2: 'Kỹ năng Sale SACO',
  3: 'Thương hiệu cá nhân',
  4: 'Phương pháp kỹ thuật',
  5: 'Phương pháp cơ bản',
  6: 'Backtest và Bộ lọc',
  7: 'Chỉ báo xu hướng',
  8: 'Chỉ báo động lượng và dòng tiền',
  9: 'Tốc độ tăng trưởng',
  10: 'Độ ổn định',
  11: 'Hiệu quả và biên lợi nhuận',
  12: 'Nợ và khả năng thanh toán',
  13: 'Dòng tiền',
  14: 'Định giá',
};

/** Unpublished chapters: required lesson counts (sum over all 14 chapters = 94). */
export const STUB_LESSON_COUNTS: Readonly<Record<number, number>> = {
  6: 7,
  7: 4,
  8: 7,
  9: 6,
  10: 5,
  11: 7,
  12: 4,
  13: 5,
  14: 6,
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

export function buildCatalog(): CatalogFile {
  const chapters: CatalogChapter[] = [];
  for (let no = 1; no <= 14; no += 1) {
    const rows = CATALOG_ROWS.filter((r) => chapterOf(r.id) === no);
    if (rows.length === 0) {
      const count = STUB_LESSON_COUNTS[no];
      if (count === undefined) throw new Error(`chapter ${no}: no rows and no stub count`);
      chapters.push({ no, title: CHAPTER_TITLES[no] ?? '', published: false, lesson_count: count });
      continue;
    }
    const items: CatalogItem[] = rows.map((r, k) => ({
      id: r.id,
      kind: r.kind,
      lesson_key: r.lesson_key,
      order: k + 1,
      name: r.name,
      optional: r.kind === 'practice',
      question_count: questionCountFor(no, r.kind),
      unlock: r.unlock ? { kind: 'technical', id: r.unlock.id, label: r.unlock.label } : null,
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
