import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import type { CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import {
  composeCoachCap6,
  type ComposedCoachCap6,
  type CoachSituationCap6,
} from "@/features/cap6/coachTemplateCap6"
import { LUC_DOC_OPTIONS, type HanhViCo, type LucDocUser } from "./types"

/**
 * Cấp 7 Kết sổ coach — lớp "đọc lực vs diễn biến ngay sau" (spec §6).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap7` gọi `composeCoachCap6` (chính
 * nó gọi Cấp 5 → 4 → 3 → 2 → 1) rồi THÊM đoạn thứ 7. `KetsoModalCap7` render cả
 * 7 đoạn cạnh nhau. Rule-based, KHÔNG phải AI — như Cấp 0-6.
 *
 * ★★ **`docLucDung === null` KHÔNG PHẢI MỘT PHÁN QUYẾT.** Nó nghĩa là *chưa tới
 * hạn chấm* (hoặc chưa lấy được giá đóng cửa của phiên đích) — hai chuyện hoàn
 * toàn khác "đọc sai". Hàm trả **`null`**: không đoán ô nào, không hiện ĐÚNG/SAI,
 * và lệnh đó không bao giờ bị tính là đọc sai ở bất cứ đâu.
 *
 * ★★ **4 mẫu của spec §6 là HAI TRỤC, không phải 4 ô loại trừ nhau:**
 *  - trục 1 (luôn có khi đã chấm): **đọc đúng** / **đọc sai**;
 *  - trục 2 (chỉ khi có cờ VÀ hệ ghi được hành vi): **chờ xác nhận** / **mua đuổi**.
 * Một lệnh vừa đọc đúng vừa mua đuổi là chuyện có thật, và cả hai câu đều đáng
 * nói — ép nó vào một ô duy nhất sẽ nuốt mất một nửa bài học.
 *
 * ★ **Ô "đọc sai" KHÔNG MẮNG** (spec §6): bài học là *lực sổ lệnh nhiễu*, không
 * phải *bạn dở*. Đọc sai một chỉ số vốn dĩ chỉ đúng trong vài phút là chuyện bình
 * thường; câu coach nói đúng điều đó và dừng lại ở đó.
 *
 * ★ **Ô "mua đuổi" là NHẮC NHỞ, KHÔNG phải phạt** (spec §5 "không phạt cứng").
 * Nó nói thẳng ra rằng đây không phải điểm trừ — và nó chỉ đặt giả thiết ("Nếu đó
 * là lệnh kê giá rồi rút…"), TUYỆT ĐỐI không tuyên bố lệnh treo đó là lệnh giả:
 * IQX không phát hiện được điều ấy và spec §9 loại nó khỏi phạm vi.
 *
 * ★ **KHÔNG BAO GIỜ BỊA** (§C12c): cách user đọc, %diễn biến và giá của mức bị
 * gắn cờ đều đến từ các cột Cấp 7 của lệnh. Thiếu trường nào thì câu coach NÓI
 * THẲNG là hệ chưa ghi lại được, chứ không điền một con số hợp lý.
 */

/** Trục 1 — kết quả chấm đọc lực. */
export type CoachIdCap7 = "doc_dung" | "doc_sai"

/** Trục 2 — hành vi sau khi cờ cảnh giác hiện. */
export type CoachCoIdCap7 = "co_cho_xac_nhan" | "co_mua_duoi_theo"

/** Nhãn trục 1 — dùng cho tag của đoạn coach. "Chưa đúng", không phải "SAI". */
export const COACH_CAP7_LABEL: Record<CoachIdCap7, string> = {
  doc_dung: "Đọc lực đúng",
  doc_sai: "Đọc lực chưa đúng",
}

/** Nhãn trục 2 — trung tính: mua đuổi là một lựa chọn được GHI, không bị chấm. */
export const COACH_CO_CAP7_LABEL: Record<CoachCoIdCap7, string> = {
  co_cho_xac_nhan: "Có cờ · chờ xác nhận",
  co_mua_duoi_theo: "Có cờ · mua đuổi",
}

export interface CoachSituationCap7 {
  /**
   * `order_kehoach.doc_luc_dung`. ★ `null` = CHƯA TỚI HẠN CHẤM → không có đoạn
   * coach nào; tuyệt đối không quy về `false`.
   */
  docLucDung: boolean | null
  /** `order_kehoach.luc_doc_user` — cách user tự đọc lúc mua. */
  lucDocUser: LucDocUser | null
  /** Nhãn SERVER trả (`luc_doc_user_ten`); fallback về nhãn của picker. */
  lucDocUserTen: string | null
  /** % giá đóng cửa phiên đích so với giá khớp. `null` khi hệ chưa tính được. */
  dienBienPct: number | null
  /** Số phiên "ngay sau" mà hệ dùng để chấm (`so_phien_cham` của server). */
  soPhienCham: number
  /** ±% coi như đứng yên (`quy_tac.dead_band_pct`). `null` khi chưa tải được. */
  deadBandPct: number | null
  /** `order_kehoach.co_canh_giac_lenh_gia` — cờ CÓ HIỆN lúc đặt hay không. */
  coCanhGiac: boolean
  /** `order_kehoach.hanh_vi_co`. `null` khi hệ không ghi lại được. */
  hanhViCo: HanhViCo | null
  /**
   * Giá của mức bị gắn cờ, để câu "mua đuổi" gọi tên được nó.
   *
   * ★ Backend Cấp 7 KHÔNG lưu mức nào đã trip cờ (chỉ lưu cờ có/không), nên
   * trường này thường là `null` — và khi `null` thì câu coach bỏ hẳn cụm "ở
   * {giá}" thay vì đắp một con số.
   */
  giaCo: number | null
}

export interface CoachResultCap7 {
  id: CoachIdCap7
  /** Ô cờ, hoặc `null` khi không có cờ / hệ không ghi được hành vi. */
  coId: CoachCoIdCap7 | null
  text: string
  /** Cụm cần in đậm — mọi cụm LUÔN có mặt nguyên văn trong `text`. */
  nhanManh: string[]
  /**
   * Lệnh này đọc lực đúng hay chưa — dùng chọn màu nhấn của khối. `false` KHÔNG
   * phải cờ cảnh báo: đọc sai một chỉ số tức thời là chuyện bình thường.
   */
  docDung: boolean
}

/** Hướng giá đã đi trong cửa sổ chấm, theo chính dead band của server. */
type HuongGia = "tang" | "giam" | "dung_yen"

function huongGia(pct: number, deadBandPct: number | null): HuongGia {
  const band = deadBandPct != null && Number.isFinite(deadBandPct) ? Math.abs(deadBandPct) : 0
  if (pct > band) return "tang"
  if (pct < -band) return "giam"
  return "dung_yen"
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-6. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** `62,000` — số en-US (dấu phẩy hàng nghìn), như mọi cấp. */
function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

function lucDocLabel(luc: LucDocUser): string {
  return LUC_DOC_OPTIONS.find((o) => o.value === luc)?.label ?? luc
}

/**
 * Mô tả diễn biến ĐÚNG SỰ THẬT cho từng cách đọc.
 *
 * ★ Vì sao không dùng một câu duy nhất: "giá đi đúng hướng" là vô nghĩa cho một
 * người đọc "Cân bằng" (họ đoán giá ĐỨNG YÊN), và "giá đi ngược" là SAI SỰ THẬT
 * khi người đọc "Cầu mạnh" gặp một phiên đứng im. Câu bài học phía sau thì giữ
 * nguyên văn spec ở cả bốn nhánh.
 */
function moTaDienBien(
  dung: boolean,
  doc: LucDocUser | null,
  huong: HuongGia | null,
): string {
  if (huong == null) {
    return dung ? "giá đi đúng hướng ngay sau" : "giá không đi theo hướng bạn đọc ngay sau"
  }
  if (dung) {
    return huong === "dung_yen"
      ? "giá gần như đứng yên ngay sau — đúng như bạn đọc"
      : "giá đi đúng hướng ngay sau"
  }
  const nguoc =
    (doc === "manh" && huong === "giam") || (doc === "yeu" && huong === "tang")
  if (nguoc) return "giá đi ngược ngay sau"
  if (doc === "can") return "giá đi khỏi vùng đứng yên ngay sau"
  if (huong === "dung_yen") return "giá gần như đứng yên ngay sau"
  return "giá không đi theo hướng bạn đọc ngay sau"
}

/**
 * Chỗ NÓI THẲNG khi một trường của khối Đọc sổ lệnh không được ghi lại — ghép
 * thành MỘT câu ở cuối đoạn thay vì nhồi vào giữa câu mẫu của spec.
 */
function ghiChuThieu(situation: CoachSituationCap7): string {
  const thieu: string[] = []
  if (situation.lucDocUser == null && situation.lucDocUserTen == null) {
    thieu.push("cách bạn đọc lực")
  }
  if (situation.dienBienPct == null) thieu.push("mức biến động của phiên đích")
  if (thieu.length === 0) return ""
  return ` (Hệ chưa ghi lại được ${thieu.join(" và ")} của lệnh này nên câu trên nói chung.)`
}

/**
 * spec §6 ô Đọc đúng — "Bạn đoán '{đọc}' và giá đi đúng hướng ngay sau. Đọc lực
 * đang lên tay — nhưng nhớ lực chỉ đúng cho thời điểm rất ngắn."
 */
function templateDocDung(mo: string, dienBien: string, cum: string): string {
  return (
    `${mo}${dienBien}${cum}. Đọc lực đang lên tay — nhưng nhớ lực chỉ đúng cho ` +
    "thời điểm rất ngắn."
  )
}

/**
 * spec §6 ô Đọc sai — "Bạn đoán '{đọc}' nhưng giá đi ngược ngay sau. Lực sổ lệnh
 * nhiễu và đổi nhanh — đừng đặt cược lớn chỉ vào lực tức thời."
 *
 * ★ KHÔNG một chữ nào quy lỗi cho user: chỉ số Lực là ảnh chụp vài phút của sổ
 * lệnh, đọc trượt nó là chuyện bình thường và câu này nói đúng thế.
 */
function templateDocSai(mo: string, dienBien: string, cum: string): string {
  return (
    `${mo}${dienBien}${cum}. Lực sổ lệnh nhiễu và đổi nhanh — đừng đặt cược lớn ` +
    "chỉ vào lực tức thời."
  )
}

/** spec §6 ô Có cờ + chờ xác nhận — nguyên văn. */
const TEMPLATE_CHO_XAC_NHAN =
  'Bạn thấy lệnh treo lớn và chờ khớp thật — đúng phản xạ. Tỉnh táo với lệnh "hù".'

/**
 * spec §6 ô Có cờ + mua đuổi — nguyên văn, CỘNG một câu nói thẳng rằng đây không
 * phải điểm trừ (spec §5 "không phạt cứng"): không có câu đó, một người đọc kỹ
 * vẫn có thể tưởng mình vừa bị đánh dấu vi phạm.
 *
 * ★ "Nếu đó là…" là một GIẢ THIẾT có chủ đích. IQX không biết lệnh treo đó thật
 * hay không, và không bao giờ được viết như thể nó biết.
 */
function templateMuaDuoi(giaCo: number | null): string {
  const oGia = giaCo != null && Number.isFinite(giaCo) ? ` ở ${fmtVnd(giaCo)}` : ""
  return (
    `Bạn mua đuổi vào lệnh treo lớn${oGia}. Nếu đó là lệnh kê giá rồi rút, bạn ` +
    "vào sai điểm. Lần sau chờ nó khớp thật. Đây là một nhắc nhở, không phải " +
    "điểm trừ — Cấp 7 không phạt việc mua đuổi, chỉ ghi lại để chính bạn so hai " +
    "nhóm tại khối ⑰."
  )
}

/**
 * Chọn + render đoạn coach "đọc lực vs diễn biến ngay sau" cho lệnh vừa đóng.
 *
 * `null` khi `docLucDung == null` — lệnh chưa tới hạn chấm (hoặc chưa lấy được
 * giá phiên đích). KHÔNG có ô nào, và đó KHÔNG phải "đọc sai".
 */
export function pickCoachCap7(situation: CoachSituationCap7): CoachResultCap7 | null {
  const { docLucDung, lucDocUser, lucDocUserTen, dienBienPct, soPhienCham, deadBandPct } =
    situation
  if (docLucDung == null) return null

  const ten = lucDocUserTen ?? (lucDocUser ? lucDocLabel(lucDocUser) : null)
  const noi = docLucDung ? "và" : "nhưng"
  const mo = ten ? `Bạn đoán "${ten}" ${noi} ` : `Bạn đã đọc lực lúc mua ${noi} `
  const huong = dienBienPct != null ? huongGia(dienBienPct, deadBandPct) : null
  const dienBien = moTaDienBien(docLucDung, lucDocUser, huong)
  const cum =
    dienBienPct != null ? ` (${fmtPct(dienBienPct)} sau ${soPhienCham} phiên)` : ""
  const thieu = ghiChuThieu(situation)

  const id: CoachIdCap7 = docLucDung ? "doc_dung" : "doc_sai"
  const doanDoc = docLucDung
    ? templateDocDung(mo, dienBien, cum)
    : templateDocSai(mo, dienBien, cum)

  const nhanManh = docLucDung
    ? ["Đọc lực đang lên tay", "lực chỉ đúng cho thời điểm rất ngắn"]
    : ["Lực sổ lệnh nhiễu và đổi nhanh", "đừng đặt cược lớn chỉ vào lực tức thời"]

  // Trục 2 — chỉ khi cờ THỰC SỰ hiện VÀ hệ ghi được hành vi. Không có cả hai thì
  // im lặng: đoán một hành vi mà user chưa từng chọn là bịa.
  let coId: CoachCoIdCap7 | null = null
  let doanCo = ""
  if (situation.coCanhGiac && situation.hanhViCo === "cho_xac_nhan") {
    coId = "co_cho_xac_nhan"
    doanCo = ` ${TEMPLATE_CHO_XAC_NHAN}`
    nhanManh.push("đúng phản xạ")
  } else if (situation.coCanhGiac && situation.hanhViCo === "mua_duoi_theo") {
    coId = "co_mua_duoi_theo"
    doanCo = ` ${templateMuaDuoi(situation.giaCo)}`
    nhanManh.push("Lần sau chờ nó khớp thật", "không phải điểm trừ")
  }

  return {
    id,
    coId,
    text: `${doanDoc}${doanCo}${thieu}`,
    nhanManh,
    docDung: docLucDung,
  }
}

export interface ComposedCoachCap7 extends ComposedCoachCap6 {
  /**
   * Đoạn "đọc lực vs diễn biến ngay sau" của Cấp 7 — `null` khi lệnh không ghi
   * bước đọc lực HOẶC chưa tới hạn chấm (không bao giờ là một phán quyết đoán).
   */
  cap7: CoachResultCap7 | null
}

/**
 * Composes CẢ 7 lớp coach cho `KetsoModalCap7`: gọi `composeCoachCap6` (Cấp 1-6,
 * không bao giờ viết lại) rồi thêm lớp Cấp 7. Mọi lớp dưới độc lập với nhau —
 * `cap6Situation === null` (lệnh không mâu thuẫn) không chặn đoạn Cấp 7, và
 * `cap7Situation === null` (lệnh không đọc lực) không chặn 6 đoạn dưới.
 */
export function composeCoachCap7(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
  cap5Situation: CoachSituationCap5 | null,
  cap6Situation: CoachSituationCap6 | null,
  cap7Situation: CoachSituationCap7 | null,
): ComposedCoachCap7 {
  const cap6Composed = composeCoachCap6(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
    cap6Situation,
  )
  return {
    ...cap6Composed,
    cap7: cap7Situation ? pickCoachCap7(cap7Situation) : null,
  }
}
