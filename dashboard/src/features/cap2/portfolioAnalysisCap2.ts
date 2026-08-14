import {
  computeCap1PortfolioAnalysis,
  type Cap1PortfolioAnalysisResult,
  type ReasonRow,
} from "@/features/cap1/portfolioAnalysis"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import type { Cap2Progress, XepLoai } from "./types"

/**
 * Cấp 2 Phân tích danh mục — pure compute cho 4 khối của mockup
 * `iqx-cap2-phantich-danhmuc.html`:
 *
 *   ① Hồ sơ tổng quan            — Cấp 1 + 2 ô «Đã đặt CL/CL» và «Thực hiện đúng»
 *   ② Thắng / thua theo 5 lý do  — giữ từ Cấp 1
 *   ③ Độ phủ 5 lý do             — giữ từ Cấp 1
 *   ④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào — MỚI ở Cấp 2
 *
 * **Delegation, not duplication:** ①②③ 100% uỷ quyền cho
 * `computeCap1PortfolioAnalysis` — module này không viết lại phép tính đó.
 * `progress` cố tình truyền `null` cho lời gọi ấy: khối 1/2/3 của Cấp 1 không
 * đọc `progress` (chỉ khối 4 của nó đọc, và Cấp 2 không dùng khối đó), nên an
 * toàn và không đòi một `Cap1Progress` mà người gọi Cấp 2 không có.
 *
 * ★★ **Những khối ĐÃ BỎ so với bản 5 nhiệm vụ** — «Danh sách vi phạm 4 loại»,
 * «Cửa sổ 20 lệnh», «Điểm kỷ luật 30 ngày», «Phân loại vi phạm theo tuần»,
 * «Phát hiện từ ghi chú» và «Mẫu tự phát hiện 9-12». Mô hình 2 nhiệm vụ không
 * còn đo vi phạm/chuỗi/điểm kỷ luật, nên mọi khối đó chỉ có thể trình bày một
 * thứ sản phẩm không còn tính. Đúng tinh thần câu chốt của chính mockup: *"Cấp
 * 2 chỉ giúp bạn làm quen cơ chế… Rèn kỷ luật sâu hơn sẽ đến ở các cấp sau."*
 *
 * **Nguồn số của khối ④ là SERVER**, không phải nhật ký cục bộ: `Cap2Progress`
 * mang sẵn `so_lan_cat_lo_dung` (🛑) / `so_lan_chot_loi_dung` (🎯) /
 * `so_lan_thuc_hien_dung` (✅), và server bảo đảm ✅ = 🛑 + 🎯. Nhật ký trên
 * trình duyệt (`tradeLogCap2.ts`) chỉ đủ cho khối ②③ (thắng/thua + độ phủ theo
 * lý do) — nó per-browser và không backfill được, nên không được phép làm nguồn
 * cho con số quyết định nhiệm vụ.
 *
 * **Trung thực hơn số đẹp:** khi chưa có lần nào giá chạm mốc, khối ④ trả
 * `emptyNote` chứ không bịa một nhận xét từ 0/0.
 */

// ── Cấp 2 trade record (client-side closed-trade log analogue) ──────────────

/**
 * A closed Cấp 2 order — Cấp 1's `Cap1TradeRecord` fields (lý do, P&L, …) plus
 * the 4 vi phạm flags `order_ketso` carries and the optional "ghi chú nhìn lại"
 * text captured in Kết sổ.
 *
 * ★ Bốn cờ vi phạm + ghi chú vẫn được `KetsoModalCap2` ghi (màn Kết sổ giữ
 * nguyên) và `portfolioAnalysisCap5.ts` còn đọc `ViPhamLoai` bên dưới — nhưng
 * **Phân tích danh mục Cấp 2 không còn trình bày chúng**, xem docstring module.
 */
export interface Cap2TradeRecord extends Cap1TradeRecord {
  chamSlKhongCat: boolean
  chamTpGiuLamHut: boolean
  banSomKhiLoNhe: boolean
  nhoiLenhKhiLo: boolean
  ghiChuNhinLai?: string | null
}

/** One day's điểm kỷ luật, as returned by `GET /cap2/diem-ky-luat?ngay=`. */
export interface Cap2DailyScoreRecord {
  /** YYYY-MM-DD. */
  ngay: string
  diem: number
  xepLoai: XepLoai
}

/** 4 hành vi vi phạm kỷ luật mà `order_ketso` ghi lại. Cấp 2 không còn xếp hạng
 *  chúng, nhưng `portfolioAnalysisCap5.ts` vẫn dùng bảng nhãn này. */
export type ViPhamLoai = "cat_lo_cham" | "chot_loi_hut" | "ban_som_khi_lo" | "nhoi_lenh"

export const VI_PHAM_LOAI_LABELS: Record<ViPhamLoai, string> = {
  cat_lo_cham: "Cắt lỗ chậm",
  chot_loi_hut: "Chốt lời hụt",
  ban_som_khi_lo: "Bán sớm khi lỗ nhẹ",
  nhoi_lenh: "Nhồi lệnh khi lỗ",
}

// ── Khối ④ — «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào» ──────────────────

/** Mẫu số của ô «Đã đặt CL/CL» ở khối ① — cùng mốc 10 lệnh của nhiệm vụ ①. */
export const SL_TP_ORDERS_TARGET = 10

export interface Cap2SlTpUsage {
  /** 🛑 số lần giá chạm cắt lỗ và user cắt ngay trong phiên. */
  catLoDung: number
  /** 🎯 số lần giá chạm chốt lời và user bán theo kế hoạch. */
  chotLoiDung: number
  /** ✅ tổng lần thực hiện đúng (server bảo đảm = `catLoDung + chotLoiDung`). */
  tongDung: number
  /** Số lệnh đã đặt cắt lỗ/chốt lời, đã chặn trần ở `SL_TP_ORDERS_TARGET`. */
  soLenhCoSlTp: number
  soLenhCoSlTpTarget: number
  /** Nhận xét `.pat.good` của mockup — `null` khi chưa có lần nào để nhận xét. */
  patternNote: string | null
  /** Trạng thái rỗng trung thực — `null` khi đã có ít nhất 1 lần. */
  emptyNote: string | null
  /** Câu nền `.pat.info` — luôn hiện. `**đậm**` theo quy ước renderer inline. */
  scopeNote: string
}

/** Nguyên văn `.pat.info` của mockup — luôn hiện, kể cả khi chưa có số nào. */
const SCOPE_NOTE =
  "Cấp 2 chỉ giúp bạn **làm quen cơ chế** đặt và thực hiện cắt lỗ / chốt lời. Rèn kỷ luật sâu hơn — bám kế hoạch qua thời gian — sẽ đến ở các cấp sau."

/**
 * Khối ④ — đọc THẲNG từ `progress` (server). Câu nhận xét bám sát nguyên văn
 * `.pat.good` của mockup ("Bạn đã làm quen cả hai cơ chế — … cắt lỗ chặn thua,
 * … chốt lời khóa lãi.") nhưng để CON SỐ tự nói, thay vì chốt cứng "một lần …
 * một lần" như bản vẽ tĩnh: cùng một câu phải đúng ở mọi giá trị.
 */
export function computeSlTpUsageCap2(progress: Cap2Progress | null): Cap2SlTpUsage {
  const catLoDung = progress?.so_lan_cat_lo_dung ?? 0
  const chotLoiDung = progress?.so_lan_chot_loi_dung ?? 0
  const tongDung = progress?.so_lan_thuc_hien_dung ?? 0
  const soLenhCoSlTp = Math.min(progress?.so_lenh_co_cl_tp ?? 0, SL_TP_ORDERS_TARGET)

  let patternNote: string | null = null
  let emptyNote: string | null = null

  if (catLoDung > 0 && chotLoiDung > 0) {
    patternNote = `Bạn đã làm quen cả hai cơ chế — ${catLoDung} lần cắt lỗ chặn thua, ${chotLoiDung} lần chốt lời khóa lãi. Đây là hai công cụ cơ bản nhất của việc thoát lệnh có kế hoạch.`
  } else if (catLoDung > 0) {
    patternNote = `Bạn mới dùng cơ chế cắt lỗ (${catLoDung} lần) — chưa lần nào giá chạm chốt lời để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái chặn thua, một cái khóa lãi.`
  } else if (chotLoiDung > 0) {
    patternNote = `Bạn mới dùng cơ chế chốt lời (${chotLoiDung} lần) — chưa lần nào giá chạm cắt lỗ để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái khóa lãi, một cái chặn thua.`
  } else {
    emptyNote =
      "Chưa có lần nào giá chạm mốc cắt lỗ hoặc chốt lời để bạn thực hiện. Con số này chỉ lên khi thị trường thật sự chạm mốc bạn đã cam kết — không phải việc bạn cố làm cho có."
  }

  return {
    catLoDung,
    chotLoiDung,
    tongDung,
    soLenhCoSlTp,
    soLenhCoSlTpTarget: SL_TP_ORDERS_TARGET,
    patternNote,
    emptyNote,
    scopeNote: SCOPE_NOTE,
  }
}

// ── top-level ─────────────────────────────────────────────────────────────

export interface Cap2PortfolioAnalysisResult {
  /** ① — uỷ quyền Cấp 1. */
  khoi1: Cap1PortfolioAnalysisResult["khoi1"]
  hideKhoi2: boolean
  khoi2HiddenNote: string | null
  /** ② — uỷ quyền Cấp 1. */
  khoi2: ReasonRow[]
  /** ③ — uỷ quyền Cấp 1 (độ phủ 5 lý do). */
  khoi3: Cap1PortfolioAnalysisResult["khoi3"]
  /** ④ — mới ở Cấp 2. */
  khoi4: Cap2SlTpUsage
}

/**
 * Cấp 2 Phân tích danh mục — xem docstring module cho luật uỷ quyền/trung thực.
 *
 * `dailyScores`/`now` **không còn được đọc**: khối «Điểm kỷ luật 30 ngày» và
 * các khối cửa sổ thời gian đã bỏ. Hai tham số vẫn giữ vì Cấp 3-8 gọi qua đây
 * với đúng chữ ký này và `Cap2TradingPage` vẫn tích luỹ nhật ký điểm — đổi chữ
 * ký sẽ lan sang 6 cấp đang tắt mà không đổi được gì cho user.
 */
export function computeCap2PortfolioAnalysis(
  trades: Cap2TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  progress: Cap2Progress | null,
  now: Date = new Date(),
): Cap2PortfolioAnalysisResult {
  void dailyScores
  void now
  const cap1Result = computeCap1PortfolioAnalysis(trades, null)

  return {
    khoi1: cap1Result.khoi1,
    hideKhoi2: cap1Result.hideKhoi2,
    khoi2HiddenNote: cap1Result.khoi2HiddenNote,
    khoi2: cap1Result.khoi2,
    khoi3: cap1Result.khoi3,
    khoi4: computeSlTpUsageCap2(progress),
  }
}
