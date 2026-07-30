import {
  computeCap2PortfolioAnalysis,
  type Cap2DailyScoreRecord,
  type Cap2PortfolioAnalysisResult,
} from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import { MUC_TU_TIN_LABEL } from "./coachTemplateCap3"
import { KHAU_VI_PCT } from "./khoiLuong"
import type { Cap3TradeRecord } from "./tradeLogCap3"
import type { CachKhoiLuong, Cap3Progress, KhauViLoai, MucTuTin } from "./types"

/**
 * Cấp 3 Phân tích danh mục (spec `IQX-Cap3-Spec.md` §8) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-2 (khối 1 hồ sơ, khối 2 bảng
 * 5 lý do, khối 3 vi phạm 30 ngày, khối 4 cửa sổ 20 lệnh, khối 5 điểm kỷ luật,
 * khối 6 vi phạm theo tuần, khối 7 phát hiện từ ghi chú, mẫu 1-3 + 9-12) đều
 * do `computeCap2PortfolioAnalysis` tính — module này KHÔNG viết lại phép tính
 * nào của Cấp 1/Cấp 2 (và Cấp 2 lại delegate khối 1/2/mẫu 1-3 xuống
 * `computeCap1PortfolioAnalysis`). `Cap3TradeRecord extends Cap2TradeRecord`
 * nên mảng lệnh được truyền THẲNG xuống, không map/copy.
 *
 * Cấp 3 chỉ THÊM 2 khối mới:
 *   - **⑦ Thắng/thua theo mức tự tin** — 3 hàng (số lệnh · tỷ lệ thắng ·
 *     lãi/lỗ TB) + 1 phát hiện "mức tự tin của bạn có đáng tin không".
 *   - **⑧ Khối lượng có đi theo tự tin không** — 3 hàng (KL TB · %vốn TB ·
 *     cách hay dùng) + 1 phát hiện.
 * và surface `khauVi` cho khối ① (spec §8: "thêm hiển thị khẩu vị đang dùng").
 *
 * **CẢNH BÁO đánh số:** spec §8 đánh lại số các khối cho Cấp 3 (⑦ = tự tin,
 * ⑧ = khối lượng), trong khi `Cap2PortfolioAnalysisResult` ĐÃ có `khoi7`
 * (phát hiện từ ghi chú — khối ⑥ trong cách đánh số của Cấp 3). Để không phá
 * hợp đồng của Cấp 2 và không gây nhầm, 2 khối mới mang key riêng
 * `khoi7TuTin` / `khoi8KhoiLuong`; `khoi7` giữ nguyên nghĩa Cấp 2.
 *
 * **Honesty over fake data (task brief):** nguồn dữ liệu duy nhất của ⑦/⑧ là
 * `muc_tu_tin` / `cach_khoi_luong` / `khoi_luong` / `pct_von` của từng lệnh đã
 * đóng — backend Cấp 3 KHÔNG có endpoint liệt kê chúng (chỉ có
 * `GET /cap3/progress` + `GET /cap3/thach-thuc` tổng hợp), nên chúng đến từ
 * nhật ký client `tradeLogCap3.ts` (xem gap ghi ở đó). Mức tự tin nào chưa đủ
 * `KHOI7_MIN_TRADES_PER_MUC` lệnh thì hàng đó bị đánh `insufficient` và mọi
 * phát hiện so sánh 2 cực bị chặn bằng `insufficientNote` — không bao giờ suy
 * ra kết luận từ 1-2 lệnh, không bao giờ in 0% thay cho "chưa có dữ liệu".
 *
 * **Cửa sổ thời gian:** ⑦/⑧ dùng TOÀN BỘ nhật ký Cấp 3 (không cắt 30 ngày như
 * khối 3 của Cấp 2) — nhật ký này chỉ bắt đầu tích luỹ từ lúc user vào Cấp 3,
 * nên "toàn bộ" CHÍNH LÀ giai đoạn Cấp 3 (mockup: "34 lệnh · từ 15/03/2026").
 */

/** Số lệnh tối thiểu ở 1 mức tự tin trước khi dám kết luận gì về mức đó. */
export const KHOI7_MIN_TRADES_PER_MUC = 3

/** Chênh lệch tỷ lệ thắng (điểm %) để gọi là "cao hơn hẳn" / "thấp hơn hẳn". */
export const KHOI7_WIN_RATE_GAP_PCT = 15

/** Số lệnh tối thiểu mỗi mức cho khối ⑧ (cùng ngưỡng với ⑦ — 1 chuẩn duy nhất). */
export const KHOI8_MIN_TRADES_PER_MUC = KHOI7_MIN_TRADES_PER_MUC

/** %vốn TB của mức Cao phải vượt mức Thấp ít nhất 15% (tương đối) mới coi là
 * "khối lượng đi theo tự tin" — dưới ngưỡng này là nhiễu làm tròn/giá cổ phiếu. */
export const KHOI8_MIN_RATIO = 1.15

/** Thứ tự hiển thị: Cao → Vừa → Thấp (mockup `iqx-cap3-phantich-danhmuc.html`). */
const MUC_ORDER: readonly MucTuTin[] = [3, 2, 1]

export const CACH_KHOI_LUONG_LABEL: Record<CachKhoiLuong, string> = {
  linh_hoat: "Khẩu vị × tự tin",
  ky_luat: "Chia đều theo khẩu vị",
}

function round(n: number): number {
  return Math.round(n)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

// ── Khối ⑦ — thắng/thua theo mức tự tin ─────────────────────────────────────

export interface Khoi7TuTinRow {
  mucTuTin: MucTuTin
  /** "⭐⭐⭐ Cao" / "⭐⭐ Vừa" / "⭐ Thấp" — cùng nhãn với panel đặt lệnh. */
  label: string
  count: number
  /** % lệnh lãi. `null` khi mức này chưa có lệnh nào (KHÔNG in 0%). */
  winRate: number | null
  /** Lãi/lỗ % trung bình. `null` khi mức này chưa có lệnh nào. */
  avgPnlPct: number | null
  /** Con số trong hàng là THẬT nhưng chưa đủ lệnh để kết luận
   * (`count < KHOI7_MIN_TRADES_PER_MUC`) — UI phải gắn dấu "chưa đủ dữ liệu". */
  insufficient: boolean
}

export interface Cap3Khoi7TuTin {
  rows: Khoi7TuTinRow[]
  totalTrades: number
  /** Phát hiện "mức tự tin của bạn có đáng tin không" — `null` khi chưa đủ dữ liệu. */
  phatHien: string | null
  /** Lý do KHÔNG có phát hiện (nói thẳng còn thiếu bao nhiêu lệnh). */
  insufficientNote: string | null
}

function rowsByMuc(trades: Cap3TradeRecord[]): Map<MucTuTin, Cap3TradeRecord[]> {
  const map = new Map<MucTuTin, Cap3TradeRecord[]>()
  for (const muc of MUC_ORDER) map.set(muc, [])
  for (const t of trades) {
    const bucket = map.get(t.mucTuTin)
    // Bỏ qua giá trị lạ (dữ liệu cũ/ngoài 1-3) thay vì gộp bừa vào 1 mức.
    if (bucket) bucket.push(t)
  }
  return map
}

/**
 * Khối ⑦ (spec §8) — 3 hàng + phát hiện. 3 nhánh phát hiện:
 *  1. `winRate(Cao) − winRate(Thấp) ≥ 15` → "Tự tin của bạn đáng tin…" (spec's
 *     mẫu 1, kèm cả 2 con số thật).
 *  2. `≤ −15` → "Cẩn thận — lệnh bạn tự tin cao lại thắng ít hơn…" (mẫu 2).
 *  3. Ở giữa → câu trung tính do module này thêm (spec chỉ viết 2 cực): nói
 *     THẲNG là chưa khác biệt rõ, KHÔNG chọn bừa 1 trong 2 mẫu kết luận.
 * Cả 3 nhánh đều đòi Cao VÀ Thấp mỗi mức ≥ `KHOI7_MIN_TRADES_PER_MUC` lệnh.
 */
export function computeCap3Khoi7TuTin(trades: Cap3TradeRecord[]): Cap3Khoi7TuTin {
  const byMuc = rowsByMuc(trades)

  const rows: Khoi7TuTinRow[] = MUC_ORDER.map((muc) => {
    const list = byMuc.get(muc) ?? []
    const count = list.length
    const wins = list.filter((t) => t.pnlPct > 0).length
    return {
      mucTuTin: muc,
      label: MUC_TU_TIN_LABEL[muc],
      count,
      winRate: count > 0 ? round((wins / count) * 100) : null,
      avgPnlPct:
        count > 0 ? round1(list.reduce((sum, t) => sum + t.pnlPct, 0) / count) : null,
      insufficient: count < KHOI7_MIN_TRADES_PER_MUC,
    }
  })

  const totalTrades = MUC_ORDER.reduce((sum, muc) => sum + (byMuc.get(muc)?.length ?? 0), 0)
  const cao = rows.find((r) => r.mucTuTin === 3)!
  const thap = rows.find((r) => r.mucTuTin === 1)!

  if (totalTrades === 0) {
    return {
      rows,
      totalTrades,
      phatHien: null,
      insufficientNote:
        "Chưa có lệnh Thực chiến nào đã đóng ở Cấp 3 — chưa thể đối chiếu mức tự tin với kết quả.",
    }
  }

  if (
    cao.count < KHOI7_MIN_TRADES_PER_MUC ||
    thap.count < KHOI7_MIN_TRADES_PER_MUC ||
    cao.winRate == null ||
    thap.winRate == null
  ) {
    return {
      rows,
      totalTrades,
      phatHien: null,
      insufficientNote:
        `Cần ít nhất ${KHOI7_MIN_TRADES_PER_MUC} lệnh ở CẢ mức ${MUC_TU_TIN_LABEL[3]} và ` +
        `${MUC_TU_TIN_LABEL[1]} để so sánh (hiện: Cao ${cao.count}, Thấp ${thap.count}).`,
    }
  }

  const gap = cao.winRate - thap.winRate
  let phatHien: string
  if (gap >= KHOI7_WIN_RATE_GAP_PCT) {
    phatHien =
      `Tự tin của bạn đáng tin — lệnh bạn chấm ${MUC_TU_TIN_LABEL[3]} thắng ${cao.winRate}%, ` +
      `cao hơn hẳn lệnh ${MUC_TU_TIN_LABEL[1]} (${thap.winRate}%). Trực giác đã qua rèn luyện của bạn có cơ sở.`
  } else if (gap <= -KHOI7_WIN_RATE_GAP_PCT) {
    phatHien =
      `Cẩn thận — lệnh bạn tự tin cao lại thắng ít hơn (${MUC_TU_TIN_LABEL[3]} ${cao.winRate}% ` +
      `so với ${MUC_TU_TIN_LABEL[1]} ${thap.winRate}%). Có thể bạn đang quá tự tin ở những mã không nên. ` +
      `Xem lại lý do các lệnh ${MUC_TU_TIN_LABEL[3]}.`
  } else {
    phatHien =
      `Tỷ lệ thắng của lệnh ${MUC_TU_TIN_LABEL[3]} (${cao.winRate}%) chưa khác biệt rõ so với ` +
      `${MUC_TU_TIN_LABEL[1]} (${thap.winRate}%) — chưa đủ cơ sở để nói mức tự tin của bạn dự báo được kết quả.`
  }

  return { rows, totalTrades, phatHien, insufficientNote: null }
}

// ── Khối ⑧ — khối lượng có đi theo tự tin không ──────────────────────────────

export interface Khoi8KhoiLuongRow {
  mucTuTin: MucTuTin
  label: string
  count: number
  /** Khối lượng TB (cp), làm tròn. `null` khi mức này chưa có lệnh nào. */
  avgKhoiLuong: number | null
  /** % vốn TB, làm tròn số nguyên (như mockup). `null` khi chưa có lệnh nào. */
  avgPctVon: number | null
  /** Cách tính khối lượng dùng nhiều nhất ở mức này (`null` khi chưa có lệnh). */
  cachHayDung: CachKhoiLuong | null
  cachHayDungLabel: string | null
  insufficient: boolean
}

export interface Cap3Khoi8KhoiLuong {
  rows: Khoi8KhoiLuongRow[]
  /** `true` = khối lượng thật sự tăng theo tự tin · `false` = chưa ·
   * `null` = chưa đủ dữ liệu để nói (KHÔNG mặc định false). */
  theoTuTin: boolean | null
  phatHien: string | null
  insufficientNote: string | null
}

/** Cách khối lượng dùng nhiều nhất; hoà thì ưu tiên `linh_hoat` (thứ tự spec §6.3). */
function modeCach(list: Cap3TradeRecord[]): CachKhoiLuong | null {
  if (list.length === 0) return null
  const linhHoat = list.filter((t) => t.cachKhoiLuong === "linh_hoat").length
  const kyLuat = list.length - linhHoat
  return linhHoat >= kyLuat ? "linh_hoat" : "ky_luat"
}

/**
 * Khối ⑧ (spec §8) — 3 hàng + phát hiện.
 *
 * **Tại sao xét trên %vốn (không phải số cổ phiếu):** số cp không so sánh được
 * giữa các mã khác giá (20% vốn vào mã 12.000đ ra nhiều cp hơn hẳn 20% vốn vào
 * mã 90.000đ), nên "khối lượng có đi theo tự tin không" được kết luận trên
 * **%vốn TB**; câu phát hiện vẫn nêu CẢ %vốn và số cp (mockup nêu cp).
 *
 * Điều kiện "đi theo tự tin": %vốn(Cao) ≥ %vốn(Thấp) × `KHOI8_MIN_RATIO`, VÀ
 * nếu mức Vừa cũng đủ dữ liệu thì phải đơn điệu không giảm Thấp ≤ Vừa ≤ Cao.
 */
export function computeCap3Khoi8KhoiLuong(trades: Cap3TradeRecord[]): Cap3Khoi8KhoiLuong {
  const byMuc = rowsByMuc(trades)

  const rows: Khoi8KhoiLuongRow[] = MUC_ORDER.map((muc) => {
    const list = byMuc.get(muc) ?? []
    const count = list.length
    const cach = modeCach(list)
    return {
      mucTuTin: muc,
      label: MUC_TU_TIN_LABEL[muc],
      count,
      avgKhoiLuong:
        count > 0 ? round(list.reduce((sum, t) => sum + t.khoiLuong, 0) / count) : null,
      avgPctVon: count > 0 ? round(list.reduce((sum, t) => sum + t.pctVon, 0) / count) : null,
      cachHayDung: cach,
      cachHayDungLabel: cach ? CACH_KHOI_LUONG_LABEL[cach] : null,
      insufficient: count < KHOI8_MIN_TRADES_PER_MUC,
    }
  })

  const cao = rows.find((r) => r.mucTuTin === 3)!
  const vua = rows.find((r) => r.mucTuTin === 2)!
  const thap = rows.find((r) => r.mucTuTin === 1)!

  if (
    cao.count < KHOI8_MIN_TRADES_PER_MUC ||
    thap.count < KHOI8_MIN_TRADES_PER_MUC ||
    cao.avgPctVon == null ||
    thap.avgPctVon == null ||
    cao.avgKhoiLuong == null ||
    thap.avgKhoiLuong == null
  ) {
    return {
      rows,
      theoTuTin: null,
      phatHien: null,
      insufficientNote:
        `Cần ít nhất ${KHOI8_MIN_TRADES_PER_MUC} lệnh ở CẢ mức ${MUC_TU_TIN_LABEL[3]} và ` +
        `${MUC_TU_TIN_LABEL[1]} để biết khối lượng có đi theo tự tin không ` +
        `(hiện: Cao ${cao.count}, Thấp ${thap.count}).`,
    }
  }

  const tangTheoCuc = cao.avgPctVon >= thap.avgPctVon * KHOI8_MIN_RATIO
  const vuaDuDuLieu = vua.count >= KHOI8_MIN_TRADES_PER_MUC && vua.avgPctVon != null
  const donDieu = vuaDuDuLieu
    ? thap.avgPctVon <= (vua.avgPctVon as number) &&
      (vua.avgPctVon as number) <= cao.avgPctVon
    : true
  const theoTuTin = tangTheoCuc && donDieu

  const soSanh =
    `${cao.avgPctVon}% vs ${thap.avgPctVon}% vốn · ` +
    `${fmtInt(cao.avgKhoiLuong)} vs ${fmtInt(thap.avgKhoiLuong)} cp`

  const phatHien = theoTuTin
    ? `Bạn đang quản lý vốn đúng hướng — tự tin càng cao, khối lượng càng lớn (${soSanh}). ` +
      `Bạn thưởng cho lệnh chắc chắn, phòng thủ ở lệnh mơ hồ.`
    : `Khối lượng của bạn chưa đi theo tự tin (${soSanh}). Cân nhắc dùng Cách 1 ` +
      `(khẩu vị × tự tin) để khối lượng phản ánh niềm tin.`

  return { rows, theoTuTin, phatHien, insufficientNote: null }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap3PortfolioAnalysisResult extends Cap2PortfolioAnalysisResult {
  /** Khẩu vị đang dùng (khối ① — spec §8). `null` khi chưa đặt: KHÔNG mặc định. */
  khauVi: KhauViLoai | null
  /** % trần vốn/lệnh của khẩu vị đó — `null` khi chưa đặt. */
  khauViPct: number | null
  /** ⑦ Thắng/thua theo mức tự tin (khác `khoi7` của Cấp 2 — xem docstring). */
  khoi7TuTin: Cap3Khoi7TuTin
  /** ⑧ Khối lượng có đi theo tự tin không. */
  khoi8KhoiLuong: Cap3Khoi8KhoiLuong
}

/**
 * Phân tích danh mục Cấp 3 (spec §8) — 1 object gồm MỌI khối Cấp 1-2
 * (delegate xuống `computeCap2PortfolioAnalysis`) + khối ⑦/⑧ + khẩu vị.
 *
 * `Cap3PortfolioAnalysis.tsx` render lại markup Cấp 2 bằng chính component
 * `Cap2PortfolioAnalysis` nên nó chỉ cần 2 hàm khối lẻ ở trên; hàm tổng này là
 * API cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation).
 */
export function computeCap3PortfolioAnalysis(
  trades: Cap3TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  now: Date = new Date(),
): Cap3PortfolioAnalysisResult {
  const cap2Result = computeCap2PortfolioAnalysis(trades, dailyScores, cap2Progress, now)
  const khauVi = cap3Progress?.khau_vi ?? null

  return {
    ...cap2Result,
    khauVi,
    khauViPct: khauVi ? KHAU_VI_PCT[khauVi] : null,
    khoi7TuTin: computeCap3Khoi7TuTin(trades),
    khoi8KhoiLuong: computeCap3Khoi8KhoiLuong(trades),
  }
}
