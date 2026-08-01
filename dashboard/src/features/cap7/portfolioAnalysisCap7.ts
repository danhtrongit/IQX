import type { Cap2DailyScoreRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { Cap2Progress } from "@/features/cap2/types"
import type { Cap3Progress } from "@/features/cap3/types"
import type { Cap4Progress } from "@/features/cap4/types"
import type { Cap5Progress } from "@/features/cap5/types"
import {
  computeCap6PortfolioAnalysis,
  type Cap6PortfolioAnalysisResult,
} from "@/features/cap6/portfolioAnalysisCap6"
import type { Cap6Progress, NhomDoiChieuCap6 } from "@/features/cap6/types"
import type { Cap7TradeRecord } from "./tradeLogCap7"
import type { Cap7Progress, ThachThucCap7 } from "./types"

/**
 * Cấp 7 Phân tích danh mục (spec `IQX-Cap7-Spec.md` §7) — pure compute.
 *
 * **Delegation, not duplication:** MỌI khối Cấp 1-6 (①-⑮) do
 * `computeCap6PortfolioAnalysis` tính (chính nó delegate xuống Cấp 5 → 4 → 3 →
 * 2 → 1). `Cap7TradeRecord extends Cap6TradeRecord` nên mảng lệnh được truyền
 * THẲNG xuống, không map/copy — cùng tiền lệ Cấp 6 đã ghi.
 *
 * Cấp 7 chỉ THÊM 2 khối:
 *   - **⑯ Đọc lực có đúng không** — tỷ lệ đọc lực đúng (SỐ CỦA SERVER) + xu
 *     hướng theo thời gian (từ nhật ký client, vì không endpoint nào liệt kê
 *     từng lệnh kèm thứ tự đóng).
 *   - **⑰ Kỷ luật cảnh giác lệnh treo lớn** — 3 con số cờ của server + so kết
 *     quả vào lệnh của hai nhóm `cho_xac_nhan` / `mua_duoi_theo`.
 *
 * ★★ **`docLucDung === null` KHÔNG BAO GIỜ là "đọc sai".** Nó nghĩa là *chưa tới
 * hạn chấm* (hoặc chưa lấy được giá phiên đích). Ở đây nó bị LOẠI khỏi mọi mẫu
 * số — không một nhánh nào tính ngược nó cho user — và số lệnh chưa chấm được
 * nói ra thành lời để tỷ lệ không bị đọc nhầm là tính trên tất cả lệnh.
 *
 * ★★ **Tỷ lệ đọc lực đúng và 3 con số cờ ĐẾN TỪ SERVER** (`GET /cap7/thach-thuc`):
 * đó chính là con số nuôi nhiệm vụ ③, được ghép lệnh mua-bán server-side và chấm
 * bằng giá đóng cửa thật. Tính lại ở client sẽ sinh một con số thứ hai, lệch, có
 * thể mâu thuẫn với widget Thách thức — cùng tiền lệ khối ⑮ của Cấp 6, ⑬ của Cấp
 * 5 và ⑨ của Cấp 4. Chưa tải được → khối nói thẳng, KHÔNG đắp tạm bằng phép tính
 * trên máy này.
 *
 * ★★ **Mua đuổi KHÔNG BỊ PHẠT** (spec §5 "không phạt cứng"). Ở khối ⑰ nó chỉ
 * quyết định lệnh vào nhóm nào để so; không nhánh nào gọi nó là lỗi, kể cả khi
 * số liệu bất lợi cho nhóm đó. Và khi nhóm mua đuổi KHÔNG xấu hơn thì khối nói
 * thẳng ra — bênh cái cờ bằng cách im lặng sẽ là xu nịnh.
 */

/** Số lệnh đọc lực ĐÃ CHẤM tối thiểu trước khi ⑯ hiện tỷ lệ (spec §7). */
export const KHOI16_MIN_DA_CHAM = 3

/**
 * Số lệnh đã chấm tối thiểu để dựng xu hướng 2 nửa của ⑯.
 *
 * Gấp đôi `KHOI16_MIN_DA_CHAM`: một xu hướng là phép so HAI mẫu, nên mỗi nửa
 * phải tự đạt ngưỡng của chính nó — 2 lệnh so với 2 lệnh chỉ là nhiễu được vẽ
 * thành đường.
 */
export const KHOI16_MIN_XU_HUONG = KHOI16_MIN_DA_CHAM * 2

/** spec §7 — từ mốc này trở lên, đọc lực được gọi là một lợi thế. */
export const KHOI16_NGUONG_LOI_THE = 60

/** Số lệnh đã đóng CÓ diễn biến tối thiểu MỖI NHÓM ở ⑰ trước khi được so. */
export const KHOI17_MIN_LENH_MOI_NHOM = 3

/**
 * Chênh lệch (điểm %) tối thiểu để dám nói một nhóm vào giá tốt hơn nhóm kia.
 * Dưới mốc này khối nói "chưa thấy khác biệt" — 0.3 điểm % trên 3 lệnh không
 * phân biệt được với ngẫu nhiên.
 */
export const KHOI17_DELTA_RO_RANG = 1

function round(n: number): number {
  return Math.round(n)
}

/** Làm tròn 1 chữ số thập phân — đủ cho % diễn biến, không giả vờ chính xác hơn. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** `+3.0%` / `−2.0%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-6. */
function fmtPct(pct: number): string {
  const r = round1(pct)
  const sign = r > 0 ? "+" : r < 0 ? "−" : ""
  return `${sign}${Math.abs(r).toFixed(1)}%`
}

/** `+12` / `−100` / `0` điểm % — cùng quy ước dấu trừ typographic. */
function fmtDiem(diem: number): string {
  const r = round(diem)
  const sign = r > 0 ? "+" : r < 0 ? "−" : ""
  return `${sign}${Math.abs(r)}`
}

// ── Khối ⑯ — đọc lực có đúng không ──────────────────────────────────────────

/** Một nửa của xu hướng ⑯ — tính trên các lệnh ĐÃ CHẤM mà thôi. */
export interface Khoi16NuaKy {
  soLenh: number
  soDung: number
  tyLe: number
}

export interface Khoi16XuHuong {
  nuaDau: Khoi16NuaKy
  nuaSau: Khoi16NuaKy
  /** Điểm % nửa sau − nửa đầu. Âm = đang đi xuống, và khối nói thẳng. */
  delta: number
  cauChu: string
}

export interface Cap7Khoi16DocLuc {
  /** Đủ điều kiện hiện TỶ LỆ hay chưa. `false` → chỉ đếm (spec §7). */
  duDuLieu: boolean
  /** % đọc lực đúng của SERVER. `null` khi chưa đủ dữ liệu / chưa tải được. */
  tyLe: number | null
  /** Số lệnh đọc lực ĐÃ được chấm (mẫu số thật của tỷ lệ trên). */
  soDaCham: number
  /** Số lệnh đọc lực CHƯA tới hạn chấm — ★ không lệnh nào bị tính là đọc sai. */
  soChuaCham: number
  /** 1 dòng phát hiện theo spec §7, trung thực cả hai chiều. */
  phatHien: string | null
  thieuDuLieuNote: string | null
  /** Câu giải thích của server — render NGUYÊN VĂN (§C12c). */
  giaiThichServer: string | null
  xuHuong: Khoi16XuHuong | null
  xuHuongNote: string | null
  giaiThich: string
}

/** §C12c — tỷ lệ là gì, đến từ đâu, và vì sao xu hướng lại là một nguồn khác. */
const KHOI16_GIAI_THICH =
  "Tỷ lệ đọc lực đúng = số lệnh bạn đoán khớp diễn biến ngay sau / số lệnh đọc lực ĐÃ ĐƯỢC CHẤM. " +
  "Hệ thống chấm bằng giá đóng cửa thật của phiên đích rồi so với cách bạn đọc lúc mua, nên khối này " +
  `đọc thẳng con số đó chứ không tính lại. Lệnh chưa tới hạn chấm nằm ngoài mẫu số — chúng KHÔNG bị ` +
  `tính là đọc sai. Cần ít nhất ${KHOI16_MIN_DA_CHAM} lệnh đã chấm mới hiện tỷ lệ, và ` +
  `${KHOI16_MIN_XU_HUONG} lệnh mới dựng được xu hướng. Riêng xu hướng tính từ nhật ký lệnh đã đóng ` +
  "trên máy này (hệ thống không trả về thứ tự từng lệnh), nên nó chỉ mô tả các lệnh máy này ghi được."

/** Tỷ lệ đúng của một nhóm lệnh ĐÃ CHẤM. */
function nuaKy(log: Cap7TradeRecord[]): Khoi16NuaKy {
  const soDung = log.filter((t) => t.docLucDung === true).length
  return {
    soLenh: log.length,
    soDung,
    tyLe: log.length > 0 ? round((soDung / log.length) * 100) : 0,
  }
}

/**
 * Xu hướng theo thời gian — nửa sau so với nửa đầu, theo thứ tự ĐÓNG LỆNH.
 *
 * ★ Lệnh `docLucDung === null` bị loại TRƯỚC khi chia nửa: nó chưa có kết quả
 * chấm, nên xếp nó vào nửa nào cũng là bịa, và tính nó vào mẫu số sẽ biến "chưa
 * chấm" thành "đọc sai".
 *
 * Số lẻ → bỏ lệnh ở GIỮA để hai nửa bằng nhau; so 3 lệnh với 4 lệnh sẽ cho nửa
 * lớn hơn một trọng số ngầm mà không ai thấy.
 */
function tinhXuHuong(trades: Cap7TradeRecord[]): {
  xuHuong: Khoi16XuHuong | null
  note: string | null
} {
  const daCham = trades
    .filter((t) => t.docLucDung != null)
    .slice()
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt))

  if (daCham.length < KHOI16_MIN_XU_HUONG) {
    const thieu = KHOI16_MIN_XU_HUONG - daCham.length
    return {
      xuHuong: null,
      note:
        `Xu hướng cần ít nhất ${KHOI16_MIN_XU_HUONG} lệnh đọc lực đã chấm trong nhật ký máy này — ` +
        `mới có ${daCham.length}, còn thiếu ${thieu}.`,
    }
  }

  const nua = Math.floor(daCham.length / 2)
  const nuaDau = nuaKy(daCham.slice(0, nua))
  const nuaSau = nuaKy(daCham.slice(daCham.length - nua))
  const delta = nuaSau.tyLe - nuaDau.tyLe
  const huong =
    delta > 0
      ? "đang tốt lên"
      : delta < 0
        ? "đang đi xuống"
        : "đang đi ngang"
  return {
    xuHuong: {
      nuaDau,
      nuaSau,
      delta,
      cauChu:
        `Tỷ lệ đọc lực đúng ${huong}: nửa đầu ${nuaDau.tyLe}% (${nuaDau.soDung}/${nuaDau.soLenh} ` +
        `lệnh) → nửa sau ${nuaSau.tyLe}% (${nuaSau.soDung}/${nuaSau.soLenh} lệnh), ` +
        `${fmtDiem(delta)} điểm %.`,
    },
    note: null,
  }
}

/**
 * Khối ⑯ (spec §7) — tỷ lệ đọc lực đúng của server + 1 dòng phát hiện + xu hướng.
 *
 * Thứ tự nhánh:
 *  1. Chưa tải được `GET /cap7/thach-thuc` → fail-closed: KHÔNG con số nào, kể cả
 *     xu hướng (một xu hướng tính từ nhật ký đứng cạnh một tỷ lệ trống sẽ bị đọc
 *     nhầm chính là tỷ lệ đó).
 *  2. Dưới ngưỡng `KHOI16_MIN_DA_CHAM` lệnh đã chấm → CHỈ ĐẾM, ẩn tỷ lệ, và nói
 *     rõ còn thiếu bao nhiêu (spec §7).
 *  3. Đủ dữ liệu → 1 trong 2 câu NGUYÊN VĂN của spec §7, trung thực cả hai chiều.
 */
export function computeCap7Khoi16DocLuc(
  thachThuc: ThachThucCap7 | null | undefined,
  trades: Cap7TradeRecord[],
): Cap7Khoi16DocLuc {
  const base = { giaiThich: KHOI16_GIAI_THICH }

  if (!thachThuc) {
    return {
      ...base,
      duDuLieu: false,
      tyLe: null,
      soDaCham: 0,
      soChuaCham: 0,
      phatHien: null,
      giaiThichServer: null,
      xuHuong: null,
      xuHuongNote: null,
      thieuDuLieuNote:
        "Chưa lấy được tỷ lệ đọc lực đúng từ hệ thống. Khối này chỉ hiện con số do hệ thống chấm " +
        "bằng giá đóng cửa thật — sẽ hiện lại khi tải được, chứ không đắp tạm bằng phép tính trên " +
        "máy này.",
    }
  }

  const dieuKien = thachThuc.ty_le_doc_luc_dung
  const soDaCham = thachThuc.so_lenh_da_cham
  const soChuaCham = thachThuc.so_lenh_chua_cham
  const { xuHuong, note: xuHuongNote } = tinhXuHuong(trades)
  const chuaChamNote =
    soChuaCham > 0
      ? `${soChuaCham} lệnh chưa tới hạn chấm không bị tính là đọc sai.`
      : "Lệnh chưa tới hạn chấm không bị tính là đọc sai."

  // Cần CẢ HAI tín hiệu: ngưỡng của spec §7 và cờ `du_du_lieu` của server (server
  // là bên biết lệnh nào chấm được). Bên nào nói chưa đủ thì khối im về tỷ lệ.
  const duDuLieu = soDaCham >= KHOI16_MIN_DA_CHAM && dieuKien.du_du_lieu
  if (!duDuLieu) {
    const thieu = Math.max(0, KHOI16_MIN_DA_CHAM - soDaCham)
    const canThem =
      thieu > 0
        ? `cần thêm ${thieu} lệnh nữa (tối thiểu ${KHOI16_MIN_DA_CHAM} lệnh đã chấm) mới hiện tỷ lệ`
        : `hệ thống chưa chốt được tỷ lệ (cần tối thiểu ${KHOI16_MIN_DA_CHAM} lệnh đã chấm)`
    return {
      ...base,
      duDuLieu: false,
      tyLe: null,
      soDaCham,
      soChuaCham,
      phatHien: null,
      giaiThichServer: dieuKien.giai_thich,
      xuHuong,
      xuHuongNote,
      thieuDuLieuNote:
        `Mới có ${soDaCham} lệnh đọc lực đã chấm — ${canThem}. ${chuaChamNote}`,
    }
  }

  const tyLe = round(dieuKien.gia_tri_hien_tai)
  const moTa = `Đọc lực đúng ${tyLe}% (${soDaCham} lệnh đã chấm).`
  // ★ Hai câu dưới là NGUYÊN VĂN spec §7 — không câu nào mắng, kể cả nhánh thấp:
  // đọc trượt một chỉ số chỉ đúng trong vài phút là chuyện bình thường.
  const phatHien =
    tyLe >= KHOI16_NGUONG_LOI_THE
      ? `${moTa} Đọc lực đang là lợi thế vào lệnh của bạn.`
      : `${moTa} Đọc lực chưa ổn định — dùng làm tham khảo thời điểm, đừng làm lý do chính.`

  return {
    ...base,
    duDuLieu: true,
    tyLe,
    soDaCham,
    soChuaCham,
    phatHien,
    giaiThichServer: dieuKien.giai_thich,
    xuHuong,
    xuHuongNote,
    thieuDuLieuNote: soChuaCham > 0 ? chuaChamNote : null,
  }
}

// ── Khối ⑰ — kỷ luật cảnh giác lệnh treo lớn ────────────────────────────────

/** Một nhóm hành vi sau khi cờ hiện — hai nhóm được trình bày NGANG NHAU. */
export interface Khoi17Nhom {
  ten: string
  /** Số lệnh của nhóm đã đóng và có trong nhật ký máy này. */
  soLenhDaDong: number
  /** Trong số đó, bao nhiêu lệnh ĐÃ có % diễn biến để so được. */
  soCoDienBien: number
  /** % diễn biến trung bình. `null` khi nhóm chưa đủ lệnh có diễn biến. */
  dienBienTb: number | null
  duDuLieu: boolean
}

export interface Cap7Khoi17KyLuatCo {
  /** 3 con số của SERVER — luôn hiện, kể cả khi chưa so được 2 nhóm. */
  soLanGapCo: number
  soChoXacNhan: number
  soMuaDuoi: number
  choXacNhan: Khoi17Nhom
  muaDuoi: Khoi17Nhom
  /** Cả 2 nhóm đủ lệnh có diễn biến để so. `false` → KHÔNG kết luận gì. */
  duCa2Nhom: boolean
  /** Điểm % chờ xác nhận − mua đuổi. `null` khi chưa so được. */
  delta: number | null
  /** ★ Một quan sát, KHÔNG phải một phán quyết: `false` được nói thẳng ra. */
  muaDuoiXauHon: boolean
  phatHien: string | null
  thieuDuLieuNote: string | null
  giaiThich: string
}

const CHO_XAC_NHAN_TEN = "Chờ xác nhận"
const MUA_DUOI_TEN = "Mua đuổi"

/**
 * §C12c — 3 con số đến từ đâu, hai cột so là gì, cờ chỉ là heuristic, và mua đuổi
 * KHÔNG BỊ PHẠT (spec §5). Câu cuối là bắt buộc: không có nó, một người đọc kỹ
 * vẫn có thể tưởng nhóm mua đuổi đang bị đánh dấu vi phạm điều gì đó.
 */
function khoi17GiaiThich(soPhienCham: number | null): string {
  const cuaSo =
    soPhienCham != null && Number.isFinite(soPhienCham) ? `${soPhienCham} phiên` : "vài phiên"
  return (
    "Số lần gặp cờ · chờ xác nhận · mua đuổi đọc thẳng từ hệ thống (đếm trên các lệnh mua bạn đã ghi " +
    `bước đọc lực). Hai cột so sánh là % giá đóng cửa ${cuaSo} sau khi mua so với giá bạn khớp, lấy ` +
    `từ nhật ký lệnh đã đóng trên máy này; mỗi nhóm cần ít nhất ${KHOI17_MIN_LENH_MOI_NHOM} lệnh có ` +
    "diễn biến mới được so. Cờ cảnh giác chỉ là một quy tắc thô về hình dạng sổ lệnh: một mức khối " +
    "lượng lớn bất thường CHƯA CHẮC là lực mua/bán thật, và cũng chưa chắc là không — IQX không kết " +
    "luận điều đó. Mua đuổi là một lựa chọn được ghi lại để chính bạn so hai nhóm: nó không bị phạt " +
    "và không trừ điểm ở bất kỳ đâu."
  )
}

/** Gom một nhóm hành vi từ nhật ký — chỉ lệnh THỰC SỰ có cờ mới vào nhóm. */
function gomNhom(
  trades: Cap7TradeRecord[],
  hanhVi: NonNullable<Cap7TradeRecord["hanhViCo"]>,
  ten: string,
): Khoi17Nhom {
  const cuaNhom = trades.filter((t) => t.coCanhGiac === true && t.hanhViCo === hanhVi)
  const coDienBien = cuaNhom.filter(
    (t): t is Cap7TradeRecord & { dienBienPct: number } =>
      t.dienBienPct != null && Number.isFinite(t.dienBienPct),
  )
  const duDuLieu = coDienBien.length >= KHOI17_MIN_LENH_MOI_NHOM
  const tong = coDienBien.reduce((sum, t) => sum + t.dienBienPct, 0)
  return {
    ten,
    soLenhDaDong: cuaNhom.length,
    soCoDienBien: coDienBien.length,
    // ★ Lệnh chưa có diễn biến KHÔNG vào mẫu số — nó chưa nói được gì về giá vào.
    dienBienTb: duDuLieu ? round1(tong / coDienBien.length) : null,
    duDuLieu,
  }
}

/**
 * Khối ⑰ (spec §7) — 3 con số cờ của server + so kết quả vào lệnh của 2 nhóm.
 *
 * Thứ tự nhánh:
 *  1. Chưa tải được số của server → fail-closed, không so, không đắp bằng client.
 *  2. Một nhóm <`KHOI17_MIN_LENH_MOI_NHOM` lệnh CÓ diễn biến → không so, nói rõ
 *     còn cần thêm bao nhiêu.
 *  3. Chờ xác nhận tốt hơn ≥ `KHOI17_DELTA_RO_RANG` điểm % → nói ra kèm 2 số.
 *  4. Mua đuổi KHÔNG xấu hơn → nói THẲNG. Im lặng ở nhánh này để bênh cái cờ sẽ
 *     là xu nịnh, và spec §7 yêu cầu trung thực.
 *  5. Chênh lệch nhỏ → "chưa thấy khác biệt", không kết luận nhóm nào hơn.
 */
export function computeCap7Khoi17KyLuatCo(
  thachThuc: ThachThucCap7 | null | undefined,
  trades: Cap7TradeRecord[],
): Cap7Khoi17KyLuatCo {
  const choXacNhan = gomNhom(trades, "cho_xac_nhan", CHO_XAC_NHAN_TEN)
  const muaDuoi = gomNhom(trades, "mua_duoi_theo", MUA_DUOI_TEN)
  const base = {
    choXacNhan,
    muaDuoi,
    giaiThich: khoi17GiaiThich(thachThuc?.so_phien_cham ?? null),
  }

  if (!thachThuc) {
    return {
      ...base,
      soLanGapCo: 0,
      soChoXacNhan: 0,
      soMuaDuoi: 0,
      duCa2Nhom: false,
      delta: null,
      muaDuoiXauHon: false,
      phatHien: null,
      thieuDuLieuNote:
        "Chưa lấy được số lần gặp cờ từ hệ thống. Ba con số của khối này do hệ thống đếm trên các " +
        "lệnh mua của bạn — sẽ hiện lại khi tải được, chứ không đắp tạm bằng phép tính trên máy này.",
    }
  }

  const soLanGapCo = thachThuc.so_lan_gap_co
  const soChoXacNhan = thachThuc.so_lan_khong_duoi_theo_co.gia_tri_hien_tai
  const soMuaDuoi = thachThuc.so_lan_mua_duoi_theo
  const soCount = { soLanGapCo, soChoXacNhan, soMuaDuoi }

  if (!choXacNhan.duDuLieu || !muaDuoi.duDuLieu) {
    const thieuCho = Math.max(0, KHOI17_MIN_LENH_MOI_NHOM - choXacNhan.soCoDienBien)
    const thieuDuoi = Math.max(0, KHOI17_MIN_LENH_MOI_NHOM - muaDuoi.soCoDienBien)
    const canThem = [
      thieuCho > 0 ? `${thieuCho} lệnh ở nhóm chờ xác nhận` : null,
      thieuDuoi > 0 ? `${thieuDuoi} lệnh ở nhóm mua đuổi` : null,
    ].filter((s): s is string => s != null)
    return {
      ...base,
      ...soCount,
      duCa2Nhom: false,
      delta: null,
      muaDuoiXauHon: false,
      phatHien: null,
      thieuDuLieuNote:
        `Nhóm chờ xác nhận có ${choXacNhan.soCoDienBien} lệnh đã đóng có diễn biến, nhóm mua đuổi ` +
        `có ${muaDuoi.soCoDienBien} — mỗi nhóm cần ít nhất ${KHOI17_MIN_LENH_MOI_NHOM} lệnh mới so ` +
        `được.` + (canThem.length > 0 ? ` Cần thêm ${canThem.join(" và ")}.` : ""),
    }
  }

  const tbCho = choXacNhan.dienBienTb as number
  const tbDuoi = muaDuoi.dienBienTb as number
  const delta = round1(tbCho - tbDuoi)
  const hai = `${fmtPct(tbCho)} ở nhóm chờ xác nhận so với ${fmtPct(tbDuoi)} ở nhóm mua đuổi`
  const soLenh = `(${choXacNhan.soCoDienBien} và ${muaDuoi.soCoDienBien} lệnh)`

  if (delta >= KHOI17_DELTA_RO_RANG) {
    return {
      ...base,
      ...soCount,
      duCa2Nhom: true,
      delta,
      muaDuoiXauHon: true,
      phatHien:
        `Với dữ liệu của bạn, chờ khớp thật đang vào giá tốt hơn: trung bình ${hai} ${soLenh} — ` +
        `cách nhau ${fmtDiem(delta)} điểm %. Đây là mẫu riêng của bạn trên số lệnh đó, không phải ` +
        "một quy luật của thị trường.",
      thieuDuLieuNote: null,
    }
  }

  if (delta <= -KHOI17_DELTA_RO_RANG) {
    return {
      ...base,
      ...soCount,
      duCa2Nhom: true,
      delta,
      muaDuoiXauHon: false,
      phatHien:
        `Với dữ liệu của bạn, mua đuổi chưa vào giá xấu hơn: trung bình ${hai} ${soLenh} — ` +
        `cách nhau ${fmtDiem(delta)} điểm %. Cờ cảnh giác chỉ là một quy tắc thô; trọng tài cuối ` +
        "là chính hai con số ở đây.",
      thieuDuLieuNote: null,
    }
  }

  return {
    ...base,
    ...soCount,
    duCa2Nhom: true,
    delta,
    muaDuoiXauHon: false,
    phatHien:
      `Hai nhóm gần như bằng nhau: trung bình ${hai} ${soLenh} — với dữ liệu của bạn, ` +
      "chưa thấy khác biệt giữa chờ xác nhận và mua đuổi.",
    thieuDuLieuNote: null,
  }
}

// ── top-level ────────────────────────────────────────────────────────────────

export interface Cap7PortfolioAnalysisResult extends Cap6PortfolioAnalysisResult {
  /** ⑯ Đọc lực có đúng không. */
  khoi16DocLuc: Cap7Khoi16DocLuc
  /** ⑰ Kỷ luật cảnh giác lệnh treo lớn. */
  khoi17KyLuatCo: Cap7Khoi17KyLuatCo
  /** ③ đk 1 — số lệnh đã ghi bước đọc lực, do SERVER đếm. `null` khi chưa vào Cấp 7. */
  soLenhDocLucServer: number | null
  /** ③ đk 2 — số lần gặp cờ và chờ xác nhận, do SERVER đếm. */
  soLanKhongDuoiTheoCoServer: number | null
  /** ③ đk 3 — % đọc lực đúng, SERVER chốt trên các lệnh ĐÃ CHẤM. */
  tyLeDocLucDungServer: number | null
}

/**
 * Phân tích danh mục Cấp 7 (spec §7) — 1 object gồm MỌI khối Cấp 1-6 (delegate
 * xuống `computeCap6PortfolioAnalysis`) + ⑯ + ⑰ + 3 số server.
 *
 * `Cap7PortfolioAnalysis.tsx` render lại markup Cấp 1-6 bằng chính component
 * `Cap6PortfolioAnalysis` nên nó chỉ cần 2 hàm khối ở trên; hàm tổng này là API
 * cho consumer muốn 1 object duy nhất (và là bề mặt test của delegation) — cùng
 * quy ước Cấp 3/4/5/6 đã ghi.
 */
export function computeCap7PortfolioAnalysis(
  trades: Cap7TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  cap2Progress: Cap2Progress | null,
  cap3Progress: Cap3Progress | null,
  cap4Progress: Cap4Progress | null,
  cap5Progress: Cap5Progress | null,
  cap6Progress: Cap6Progress | null,
  nhomDoiChieu: {
    khop: NhomDoiChieuCap6 | null
    lech: NhomDoiChieuCap6 | null
  } | null,
  cap7Progress: Cap7Progress | null,
  thachThuc: ThachThucCap7 | null,
  now: Date = new Date(),
): Cap7PortfolioAnalysisResult {
  const cap6Result = computeCap6PortfolioAnalysis(
    trades,
    dailyScores,
    cap2Progress,
    cap3Progress,
    cap4Progress,
    cap5Progress,
    cap6Progress,
    nhomDoiChieu,
    now,
  )

  return {
    ...cap6Result,
    khoi16DocLuc: computeCap7Khoi16DocLuc(thachThuc, trades),
    khoi17KyLuatCo: computeCap7Khoi17KyLuatCo(thachThuc, trades),
    soLenhDocLucServer: cap7Progress?.so_lenh_doc_luc ?? null,
    soLanKhongDuoiTheoCoServer: cap7Progress?.so_lan_khong_duoi_theo_co ?? null,
    tyLeDocLucDungServer: cap7Progress?.ty_le_doc_luc_dung ?? null,
  }
}
