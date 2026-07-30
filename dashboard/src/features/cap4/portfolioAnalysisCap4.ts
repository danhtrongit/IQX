import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import {
  computeCap3PortfolioAnalysis,
  type Cap3PortfolioAnalysisResult,
} from "@/features/cap3/portfolioAnalysisCap3"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4TradeRecord } from "./tradeLogCap4"
import type { Cap4Progress, Lop } from "./types"

/**
 * Cấp 4 Phân tích danh mục (spec `IQX-Cap4-Spec.md` §7) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-3 (khối ① hồ sơ, ② bảng 5 lý
 * do, ③ vi phạm 30 ngày, ④ cửa sổ 20 lệnh, ⑤ điểm kỷ luật, ⑥ vi phạm theo
 * tuần, ⑦ phát hiện từ ghi chú, ⑦ tự tin, ⑧ khối lượng, mẫu tự phát hiện) đều
 * do `computeCap3PortfolioAnalysis` tính (chính nó delegate xuống Cấp 2 → Cấp
 * 1). `Cap4TradeRecord extends Cap3TradeRecord` nên mảng lệnh được truyền
 * THẲNG xuống, không map/copy.
 *
 * Cấp 4 chỉ THÊM 2 khối ở đây:
 *   - **⑩ Đọc toàn cảnh có giúp chọn lệnh tốt hơn không** — 3 dải đồng thuận
 *     (4-5 / 2-3 / 0-1 lớp ủng hộ) → tỷ lệ thắng + số lệnh mỗi dải.
 *   - **⑪ Góc nhìn riêng của bạn (khác AI)** — 3 số: số lần đọc khác AI · số
 *     lần bạn đúng (lệnh thắng) · số lần AI đúng (lệnh thua).
 *
 * ★ **KHỐI ⑨ KHÔNG Ở ĐÂY — CỐ TÌNH.** "Vũ khí & điểm mù" có endpoint riêng
 * `GET /cap4/vu-khi-diem-mu` tính từ hàng DB thật (`order_kehoach` JOIN
 * `order_ketso`), tức là authoritative + có backfill cho lệnh đóng trước khi FE
 * ship + đúng bằng con số nuôi nhiệm vụ ③. Tính lại ở client từ nhật ký
 * localStorage sẽ cho ra MỘT con số thứ hai, thấp hơn, và có thể mâu thuẫn với
 * widget Thách thức — nên `Cap4PortfolioAnalysis` render thẳng dữ liệu hook
 * `useVuKhiDiemMu()`. Module này chỉ surface lại 3 số server đã chốt trên
 * `cap4_progress` (`so_lenh_doc_du_5lop`, `vu_khi_lop`, `diem_mu_lop`).
 *
 * **Honesty over fake data:** ⑩/⑪ CHƯA có endpoint nào, nên nguồn duy nhất là
 * nhật ký client `tradeLogCap4.ts` (xem gap ghi ở đó). Dải/nhóm nào chưa đủ
 * lệnh thì bị đánh `insufficient` và mọi phát hiện bị chặn bằng
 * `insufficientNote` — không bao giờ kết luận từ 1-2 lệnh, không bao giờ in 0%
 * thay cho "chưa có dữ liệu". Lệnh chưa lộ AI (`so_lop_dong_thuan == null`)
 * được ĐẾM RIÊNG (`excludedNoAi`) chứ không gộp vào dải 0-1 lớp — gộp sẽ vu cho
 * user một độ đồng thuận thấp mà thực ra chưa từng được đo.
 */

/** Số lệnh tối thiểu ở 1 dải đồng thuận trước khi dám kết luận gì về dải đó.
 * Cùng ngưỡng 3 mà spec §8 đặt cho khối ⑨ và Cấp 3 đặt cho khối ⑦/⑧ — một
 * chuẩn duy nhất cho toàn bộ chương trình. */
export const KHOI10_MIN_TRADES_PER_NHOM = 3

/** Chênh lệch tỷ lệ thắng (điểm %) để gọi là "hơn hẳn" (như Cấp 3's khối ⑦). */
export const KHOI10_WIN_RATE_GAP_PCT = 15

/**
 * Số lệnh khác-AI tối thiểu trước khi nói bất cứ điều gì về trực giác riêng.
 *
 * Spec §7 khối ⑪ KHÔNG đặt ngưỡng nào; 5 được chọn vì dưới đó một tỷ lệ 2-1 là
 * nhiễu thuần, mà khối này lại là khối dễ khiến user "thích cãi AI" nhất (spec
 * cảnh báo đúng điều đó) — nên nó khắt khe hơn ngưỡng 3 của ⑨/⑩.
 */
export const KHOI11_MIN_LENH = 5

/** 3 dải đồng thuận của mockup `iqx-cap4-phantich-danhmuc.html`, trên → dưới. */
export type DongThuanBand = "cao" | "vua" | "thap"

const BAND_ORDER: readonly DongThuanBand[] = ["cao", "vua", "thap"] as const

export const DONG_THUAN_BAND_LABEL: Record<DongThuanBand, string> = {
  cao: "4-5 lớp ủng hộ",
  vua: "2-3 lớp ủng hộ",
  thap: "0-1 lớp ủng hộ",
}

/**
 * §C12c — nói rõ con số "đồng thuận" đến từ đâu.
 *
 * ★ Đây là số lớp **AI** đánh giá Ủng hộ (`order_kehoach.so_lop_dong_thuan`),
 * ĐÚNG bằng dòng "Đồng thuận: X/5 lớp AI đánh giá Ủng hộ" ở panel đặt lệnh
 * (`doc5Lop.ts#countDongThuan`) và bằng số backend dùng cho nhiệm vụ ③ — không
 * phải số lớp user tự chấm Ủng hộ. Ghi ra đây vì "đồng thuận" rất dễ bị đọc
 * thành nghĩa kia.
 */
const KHOI10_GIAI_THICH =
  "Độ đồng thuận = số lớp AI đánh giá Ủng hộ lúc bạn đặt lệnh (0-5), đúng bằng dòng " +
  '"Đồng thuận: X/5" ở panel đặt lệnh. Tỷ lệ thắng là KẾT QUẢ THẬT của các lệnh đã đóng ' +
  "trong nhóm đó. Lưu ý: mốc «đồng thuận cao» của Thách thức Thuần thục là ≥3 lớp, rộng hơn " +
  "dải 4-5 lớp ở hàng đầu bảng này."

const KHOI11_GIAI_THICH =
  "Đếm theo LỆNH (không theo lớp): một lệnh có ít nhất 1 lớp bạn đọc khác AI được tính 1 lần, " +
  'rồi phân loại bằng kết quả thật — lệnh thắng là "bạn đúng", lệnh thua là "AI đúng". Lệnh chưa ' +
  "lộ đối chiếu AI không được tính vào đâu cả."

function round(n: number): number {
  return Math.round(n)
}

// ── Khối ⑩ — đọc toàn cảnh có giúp chọn lệnh tốt hơn không ───────────────────

export interface Khoi10DongThuanRow {
  band: DongThuanBand
  /** "4-5 lớp ủng hộ" — nhãn của mockup. */
  label: string
  count: number
  wins: number
  /** % lệnh lãi. `null` khi dải này chưa có lệnh nào (KHÔNG in 0%). */
  winRate: number | null
  /** Con số THẬT nhưng chưa đủ lệnh để kết luận (`count < KHOI10_MIN_TRADES_PER_NHOM`). */
  insufficient: boolean
}

export interface Cap4Khoi10DongThuan {
  rows: Khoi10DongThuanRow[]
  /** Số lệnh đã đóng CÓ đối chiếu AI (tổng 3 dải). */
  totalTrades: number
  /** Lệnh đã đóng bị loại vì chưa lộ AI — hiện ra để không ai thắc mắc số lệnh. */
  excludedNoAi: number
  /** `true` = đọc toàn cảnh có hiệu quả rõ · `false` = chưa thấy ·
   * `null` = chưa đủ dữ liệu để nói (KHÔNG mặc định false). */
  hieuQua: boolean | null
  phatHien: string | null
  insufficientNote: string | null
  giaiThich: string
}

/** Dải của một lệnh theo số lớp AI đánh giá Ủng hộ; `null` khi chưa lộ AI. */
function bandOf(soLopDongThuan: number | null | undefined): DongThuanBand | null {
  if (soLopDongThuan == null) return null
  if (soLopDongThuan >= 4) return "cao"
  if (soLopDongThuan >= 2) return "vua"
  return "thap"
}

/**
 * Khối ⑩ (spec §7) — 3 hàng + 1 phát hiện. 3 nhánh phát hiện:
 *  1. `winRate(4-5) − winRate(0-1) ≥ 15` → "Đọc toàn cảnh có hiệu quả…" (mẫu
 *     spec, kèm CẢ 2 con số thật).
 *  2. `≤ −15` → nói THẲNG là dữ liệu đang ngược giả thuyết của Cấp 4 (spec chỉ
 *     viết mẫu thuận; im lặng ở đây sẽ là xu nịnh).
 *  3. Ở giữa → câu trung tính: chưa khác biệt rõ, KHÔNG chọn bừa 1 trong 2.
 * Cả 3 nhánh đều đòi dải 4-5 VÀ dải 0-1 mỗi dải ≥ `KHOI10_MIN_TRADES_PER_NHOM`.
 */
export function computeCap4Khoi10DongThuan(trades: Cap4TradeRecord[]): Cap4Khoi10DongThuan {
  const byBand = new Map<DongThuanBand, Cap4TradeRecord[]>()
  for (const band of BAND_ORDER) byBand.set(band, [])
  let excludedNoAi = 0
  for (const t of trades) {
    const band = bandOf(t.so_lop_dong_thuan)
    if (band == null) {
      excludedNoAi += 1
      continue
    }
    byBand.get(band)!.push(t)
  }

  const rows: Khoi10DongThuanRow[] = BAND_ORDER.map((band) => {
    const list = byBand.get(band) ?? []
    const count = list.length
    const wins = list.filter((t) => t.pnlPct > 0).length
    return {
      band,
      label: DONG_THUAN_BAND_LABEL[band],
      count,
      wins,
      winRate: count > 0 ? round((wins / count) * 100) : null,
      insufficient: count < KHOI10_MIN_TRADES_PER_NHOM,
    }
  })

  const totalTrades = rows.reduce((sum, r) => sum + r.count, 0)
  const cao = rows[0]
  const thap = rows[2]

  if (totalTrades === 0) {
    return {
      rows,
      totalTrades,
      excludedNoAi,
      hieuQua: null,
      phatHien: null,
      insufficientNote:
        "Chưa có lệnh Cấp 4 nào đã đóng có đối chiếu AI — chưa thể so tỷ lệ thắng giữa các mức đồng thuận.",
      giaiThich: KHOI10_GIAI_THICH,
    }
  }

  if (
    cao.count < KHOI10_MIN_TRADES_PER_NHOM ||
    thap.count < KHOI10_MIN_TRADES_PER_NHOM ||
    cao.winRate == null ||
    thap.winRate == null
  ) {
    return {
      rows,
      totalTrades,
      excludedNoAi,
      hieuQua: null,
      phatHien: null,
      insufficientNote:
        `Cần ít nhất ${KHOI10_MIN_TRADES_PER_NHOM} lệnh ở CẢ nhóm ` +
        `«${DONG_THUAN_BAND_LABEL.cao}» và «${DONG_THUAN_BAND_LABEL.thap}» để so sánh ` +
        `(hiện: ${cao.count} và ${thap.count}).`,
      giaiThich: KHOI10_GIAI_THICH,
    }
  }

  const gap = cao.winRate - thap.winRate
  let hieuQua: boolean
  let phatHien: string
  if (gap >= KHOI10_WIN_RATE_GAP_PCT) {
    hieuQua = true
    phatHien =
      `Đọc toàn cảnh có hiệu quả — lệnh ${DONG_THUAN_BAND_LABEL.cao} thắng ${cao.winRate}% ` +
      `(${cao.wins}/${cao.count} lệnh), so với ${thap.winRate}% ở lệnh ` +
      `${DONG_THUAN_BAND_LABEL.thap} (${thap.wins}/${thap.count}). Ưu tiên lệnh có nhiều lớp cùng ủng hộ.`
  } else if (gap <= -KHOI10_WIN_RATE_GAP_PCT) {
    hieuQua = false
    phatHien =
      `Dữ liệu của bạn đang ngược giả thuyết: lệnh ${DONG_THUAN_BAND_LABEL.cao} thắng ` +
      `${cao.winRate}% (${cao.wins}/${cao.count}), THẤP hơn lệnh ${DONG_THUAN_BAND_LABEL.thap} ` +
      `(${thap.winRate}%, ${thap.wins}/${thap.count}). Chưa có cơ sở ưu tiên lệnh đồng thuận cao — ` +
      `xem lại cách bạn đọc từng lớp ở khối ⑨.`
  } else {
    hieuQua = false
    phatHien =
      `Tỷ lệ thắng của lệnh ${DONG_THUAN_BAND_LABEL.cao} (${cao.winRate}%, ${cao.wins}/${cao.count}) ` +
      `chưa khác biệt rõ so với lệnh ${DONG_THUAN_BAND_LABEL.thap} (${thap.winRate}%, ` +
      `${thap.wins}/${thap.count}) — chưa đủ chênh lệch để nói đọc toàn cảnh đã giúp chọn lệnh tốt hơn.`
  }

  return {
    rows,
    totalTrades,
    excludedNoAi,
    hieuQua,
    phatHien,
    insufficientNote: null,
    giaiThich: KHOI10_GIAI_THICH,
  }
}

// ── Khối ⑪ — góc nhìn riêng của bạn (khác AI) ────────────────────────────────

export interface Cap4Khoi11GocNhinRieng {
  /** Số LỆNH đã đóng có ≥1 lớp user đọc khác AI. */
  soLanKhacAi: number
  /** Trong đó, số lệnh THẮNG — "bạn đúng" theo kết quả thật. */
  soLanBanDung: number
  /** Trong đó, số lệnh THUA — "AI đúng" theo kết quả thật. */
  soLanAiDung: number
  phatHien: string | null
  insufficientNote: string | null
  giaiThich: string
}

/**
 * Khối ⑪ (spec §7) — 3 số + 1 phát hiện.
 *
 * **Vì sao đếm theo LỆNH chứ không theo LỚP:** kết quả thật (thắng/thua) là
 * thuộc tính của LỆNH, không của lớp. Đếm theo lớp rồi gán cùng một kết quả cho
 * 3 lớp lệch của một lệnh sẽ đếm ba lần một bằng chứng duy nhất. Mockup cũng
 * đếm theo lệnh (7 + 5 = 12).
 *
 * **Ngưỡng phán:** đa số ĐƠN GIẢN quyết định mẫu nào (spec §7 minh hoạ mẫu
 * "trực giác có cơ sở" ở đúng 7/12 = 58%, tức spec KHÔNG đòi 60%), hoà thì câu
 * trung tính. Cả 3 mẫu đều in ra tỷ lệ thô để user tự thấy nó mỏng hay dày —
 * đó là "trình bày trung thực" của spec, thay vì che bằng một nhãn.
 *
 * ★ Nhãn "bạn đúng / AI đúng" ở đây được phân xử bởi KẾT QUẢ THẬT của thị
 * trường, KHÔNG phải bởi độ khớp AI — nên nó không vi phạm lệnh cấm "chấm
 * đúng/sai khi lệch AI" (spec §9). Và không chỗ nào nói user "sai".
 */
export function computeCap4Khoi11GocNhinRieng(
  trades: Cap4TradeRecord[],
): Cap4Khoi11GocNhinRieng {
  const khacAi = trades.filter((t) => t.so_lop_khac_ai != null && t.so_lop_khac_ai > 0)
  const soLanKhacAi = khacAi.length
  const soLanBanDung = khacAi.filter((t) => t.pnlPct > 0).length
  const soLanAiDung = soLanKhacAi - soLanBanDung

  if (soLanKhacAi === 0) {
    return {
      soLanKhacAi,
      soLanBanDung,
      soLanAiDung,
      phatHien: null,
      insufficientNote:
        "Chưa có lệnh nào bạn đọc khác AI (trong số lệnh đã đóng có đối chiếu) — " +
        "chưa có gì để đo về góc nhìn riêng.",
      giaiThich: KHOI11_GIAI_THICH,
    }
  }

  if (soLanKhacAi < KHOI11_MIN_LENH) {
    return {
      soLanKhacAi,
      soLanBanDung,
      soLanAiDung,
      phatHien: null,
      insufficientNote:
        `Cần ít nhất ${KHOI11_MIN_LENH} lệnh bạn đọc khác AI để nói được điều gì về trực giác ` +
        `riêng (hiện: ${soLanKhacAi}). Vài lệnh đầu chưa phân biệt được trực giác với may mắn.`,
      giaiThich: KHOI11_GIAI_THICH,
    }
  }

  let phatHien: string
  if (soLanBanDung > soLanAiDung) {
    phatHien =
      `Trực giác riêng của bạn đang có cơ sở — khi đọc khác AI, bạn đúng ${soLanBanDung}/` +
      `${soLanKhacAi} lần. Tiếp tục rèn góc nhìn riêng, nhưng vẫn cân nhắc kỹ khi AI cảnh báo mạnh.`
  } else if (soLanAiDung > soLanBanDung) {
    phatHien =
      `Khi bạn đọc khác AI, phần lớn AI đúng (AI đúng ${soLanAiDung}/${soLanKhacAi} lần). ` +
      `Giai đoạn này nên tin AI nhiều hơn ở các lớp bạn chưa chắc, và xem khối ⑨ để biết lớp nào.`
  } else {
    phatHien =
      `Khi bạn đọc khác AI, kết quả chia đều (bạn đúng ${soLanBanDung}/${soLanKhacAi}, AI đúng ` +
      `${soLanAiDung}/${soLanKhacAi}) — chưa đủ căn cứ để nói góc nhìn riêng của bạn tốt hơn hay ` +
      `kém hơn AI.`
  }

  return {
    soLanKhacAi,
    soLanBanDung,
    soLanAiDung,
    phatHien,
    insufficientNote: null,
    giaiThich: KHOI11_GIAI_THICH,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap4PortfolioAnalysisResult extends Cap3PortfolioAnalysisResult {
  /** ⑩ Đọc toàn cảnh có giúp chọn lệnh tốt hơn không. */
  khoi10DongThuan: Cap4Khoi10DongThuan
  /** ⑪ Góc nhìn riêng của bạn (khác AI). */
  khoi11GocNhinRieng: Cap4Khoi11GocNhinRieng
  /** ③ đk 1 — số lệnh đọc đủ 5 lớp, do SERVER đếm. `null` khi chưa vào Cấp 4. */
  soLenhDocDu5Lop: number | null
  /** Lớp đọc chuẩn nhất, do SERVER chốt (khối ⑨). `null` khi chưa đủ dữ liệu. */
  vuKhiLop: Lop | null
  /** Lớp cần cải thiện, do SERVER chốt (khối ⑨). `null` khi chưa đủ dữ liệu. */
  diemMuLop: Lop | null
}

/**
 * Phân tích danh mục Cấp 4 (spec §7) — 1 object gồm MỌI khối Cấp 1-3
 * (delegate xuống `computeCap3PortfolioAnalysis`) + khối ⑩/⑪ + 3 số server.
 *
 * Khối ⑨ KHÔNG có ở đây (xem docstring đầu file): nó đến từ
 * `GET /cap4/vu-khi-diem-mu` qua hook `useVuKhiDiemMu`.
 *
 * `Cap4PortfolioAnalysis.tsx` render lại markup Cấp 1-3 bằng chính component
 * `Cap3PortfolioAnalysis` nên nó chỉ cần 2 hàm khối lẻ ở trên; hàm tổng này là
 * API cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation) —
 * cùng quy ước mà Cấp 3 đã ghi.
 */
export function computeCap4PortfolioAnalysis(
  trades: Cap4TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  cap4Progress: Cap4Progress | null,
  now: Date = new Date(),
): Cap4PortfolioAnalysisResult {
  const cap3Result = computeCap3PortfolioAnalysis(
    trades,
    dailyScores,
    cap2Progress,
    cap3Progress,
    now,
  )

  return {
    ...cap3Result,
    khoi10DongThuan: computeCap4Khoi10DongThuan(trades),
    khoi11GocNhinRieng: computeCap4Khoi11GocNhinRieng(trades),
    soLenhDocDu5Lop: cap4Progress?.so_lenh_doc_du_5lop ?? null,
    vuKhiLop: cap4Progress?.vu_khi_lop ?? null,
    diemMuLop: cap4Progress?.diem_mu_lop ?? null,
  }
}
