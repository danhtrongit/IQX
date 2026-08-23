import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import { lopLabelCap4, type CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import {
  composeCoachCap5,
  type ComposedCoachCap5,
  type CoachSituationCap5,
} from "@/features/cap5/coachTemplateCap5"
import type { Lop } from "./types"

/**
 * Cấp 6 Kết sổ coach — lớp "đối chiếu vs kết quả" (spec `IQX-Cap6-Spec.md` §6).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap6` gọi `composeCoachCap5` (chính
 * nó gọi Cấp 4 → 3 → 2 → 1) rồi THÊM đoạn thứ 6. `KetsoModalCap6` render cả 6
 * đoạn cạnh nhau. Rule-based, KHÔNG phải AI — như Cấp 0-5.
 *
 * ★★ **LỆCH GỢI Ý KHÔNG BAO GIỜ LÀ "SAI"** (spec §5/§10). Bảng trọng số theo kiểu
 * cổ phiếu là *gợi ý để cân nhắc*, không phải luật; trọng tài cuối là kết quả
 * thật, đo ở khối ⑮. Vì vậy KHÔNG ô nào ở đây được:
 *  - gọi lựa chọn của user là "sai" / "không nên" / "lẽ ra";
 *  - gọi một lệnh lệch mà thắng là "may mắn" (đó là ngôn ngữ của Cấp 5 dành cho
 *    ô Sai-Thắng — một chuyện KHÁC: ở đó verdict quy trình là "sai" do chính user
 *    chốt, còn ở đây không có ai chấm đúng/sai cả);
 *  - kết luận từ MỘT lệnh. Cả 4 ô đều nói rõ đây là một điểm dữ liệu và chỉ về
 *    khối ⑮ — nơi mẫu thật tích lại.
 *
 * ★ `khopGoiY === null` (kiểu cổ phiếu "chưa phân loại" → chưa từng có gợi ý nào
 * để so) trả về **`null`**, tức KHÔNG có đoạn coach Cấp 6. Nặn ra một ô ở đây sẽ
 * là vu cho user "lệch" một gợi ý chưa bao giờ được đưa ra.
 *
 * ★ **KHÔNG BAO GIỜ BỊA** (§C12c): lớp quyết định, tên kiểu và nhóm lớp gợi ý đều
 * đến từ các cột Cấp 6 của lệnh (`order_kehoach`) / câu trả lời `GET /cap6/goi-y`.
 * Thiếu trường nào thì câu coach NÓI THẲNG là hệ chưa ghi lại được, chứ không
 * điền một cái tên hợp lý.
 */

/** 4 ô = khớp gợi ý (có/không) × kết quả (thắng/thua) — spec §6. */
export type CoachIdCap6 = "khop_thang" | "khop_thua" | "lech_thang" | "lech_thua"

/** Nhãn 4 ô — dùng cho tag của đoạn coach ở Kết sổ. Trung tính, không đúng/sai. */
export const COACH_CAP6_LABEL: Record<CoachIdCap6, string> = {
  khop_thang: "Khớp gợi ý · Thắng",
  khop_thua: "Khớp gợi ý · Thua",
  lech_thang: "Khác gợi ý · Thắng",
  lech_thua: "Khác gợi ý · Thua",
}

export interface CoachSituationCap6 {
  /**
   * `order_kehoach.khop_goi_y`. `null` = kiểu chưa phân loại → KHÔNG có ô nào
   * (xem docstring đầu file), tuyệt đối không quy về `false`.
   */
  khopGoiY: boolean | null
  pnlPct: number
  /** Lớp user quyết định tin. `null` khi hệ không ghi lại được. */
  lopQuyetDinh: Lop | null
  /** Tên kiểu cổ phiếu SERVER trả (`kieu_ten`). `null` khi không ghi lại được. */
  kieuTen: string | null
  /** Nhóm lớp server gợi ý ưu tiên cho kiểu đó — nguồn của khớp/lệch. */
  lopUuTien: Lop[]
}

export interface CoachResultCap6 {
  id: CoachIdCap6
  text: string
  /** Cụm từ cần in đậm — mọi cụm LUÔN có mặt nguyên văn trong `text`. */
  nhanManh: string[]
  /**
   * Lệnh này khớp gợi ý hay không — một sự thật TRUNG TÍNH dùng để chọn màu nhấn
   * của khối, KHÔNG phải cờ đúng/sai (không có ô nào là cảnh báo ở Cấp 6).
   */
  khop: boolean
}

/**
 * 4 ô = khớp × kết quả. Mirror `services/cap6/service.py`'s win rule
 * (`order_ketso.pnl_pct > 0`): lệnh đóng ngang giá (0%) tính là THUA — không có
 * ô "hoà" (cùng luật `pnlPct > 0` mà mọi cấp dưới dùng).
 */
export function deriveCoachIdCap6(khopGoiY: boolean, pnlPct: number): CoachIdCap6 {
  const thang = pnlPct > 0
  if (khopGoiY) return thang ? "khop_thang" : "khop_thua"
  return thang ? "lech_thang" : "lech_thua"
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-5. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** "🎯 Kỹ thuật · 💰 Dòng tiền" — icon + tên lớp của Cấp 4, không tự đặt tên mới. */
function lopList(lop: readonly Lop[]): string {
  return lop.map((l) => lopLabelCap4(l)).join(" · ")
}

/** Cụm chỉ về khối ⑮ — cả 4 ô đều chốt ở đây, không ô nào kết luận một mình. */
const TRO_VE_KHOI15 = "khối ⑮"

const MOT_DIEM_DU_LIEU = "một điểm dữ liệu"

/**
 * Chỗ NÓI THẲNG khi một trường của khối Đối chiếu không được ghi lại. Ghép thành
 * MỘT câu ở cuối đoạn coach thay vì nhồi vào giữa câu mẫu của spec.
 */
function ghiChuThieu(situation: CoachSituationCap6): string {
  const thieu: string[] = []
  if (situation.lopQuyetDinh == null) thieu.push("lớp quyết định")
  if (situation.kieuTen == null) thieu.push("tên kiểu cổ phiếu")
  if (thieu.length === 0) return ""
  return ` (Hệ chưa ghi lại được ${thieu.join(" và ")} của lệnh này nên câu trên nói chung.)`
}

/** Cụm "(gợi ý: 💎 Định giá · 👤 Nội bộ)" — bỏ hẳn khi không có gợi ý nào. */
function cumGoiY(lopUuTien: Lop[]): string {
  return lopUuTien.length > 0 ? ` (gợi ý: ${lopList(lopUuTien)})` : ""
}

/**
 * spec §6 ô Khớp + thắng — "Bạn tin {lớp} — đúng lớp nên ưu tiên cho {kiểu}, và
 * thắng. Đối chiếu theo kiểu đang cho quả ngọt." + khung một-điểm-dữ-liệu.
 */
function templateKhopThang(lop: string, kieu: string, pct: string): string {
  return (
    `Bạn tin ${lop} — đúng lớp nên ưu tiên cho ${kieu}, và thắng (${pct}). ` +
    `Đối chiếu theo kiểu đang cho quả ngọt. Đây là ${MOT_DIEM_DU_LIEU}, chưa phải ` +
    `bằng chứng — ${TRO_VE_KHOI15} mới nói được mẫu.`
  )
}

/**
 * spec §6 ô Khớp + thua — "Bạn tin đúng lớp cho {kiểu} nhưng vẫn thua — thị
 * trường không thuận. Cách đối chiếu vẫn hợp lý, đừng vội đổi."
 *
 * ★ KHÔNG quy lỗi cho gợi ý: trọng số theo kiểu là một xác suất khởi điểm cho cả
 * nhóm cổ phiếu, nó chưa bao giờ hứa từng lệnh.
 */
function templateKhopThua(kieu: string, pct: string): string {
  return (
    `Bạn tin đúng lớp cho ${kieu} nhưng vẫn thua (${pct}) — thị trường không thuận. ` +
    `Cách đối chiếu vẫn hợp lý, đừng vội đổi: trọng số theo kiểu là một xác suất ` +
    `khởi điểm, không phải bảo đảm cho từng lệnh. ${capHoa(TRO_VE_KHOI15)} là nơi ` +
    `nhiều lệnh cộng lại mới trả lời được.`
  )
}

/**
 * spec §6 ô Lệch + thắng — "Bạn tin {lớp} — khác gợi ý cho {kiểu} — và thắng. Có
 * thể bạn thấy điều gì riêng; theo dõi thêm xem có lặp lại không."
 *
 * ★ Ghi nhận THẲNG, không nói user gặp may và không nói gợi ý hỏng.
 */
function templateLechThang(lop: string, kieu: string, goiY: string, pct: string): string {
  return (
    `Bạn tin ${lop} — khác gợi ý cho ${kieu}${goiY} — và thắng (${pct}). ` +
    `Có thể bạn thấy điều gì riêng; theo dõi thêm xem có lặp lại không. ` +
    `${capHoa(TRO_VE_KHOI15)} đang cộng dồn cả hai nhóm để trả lời bằng số của chính bạn.`
  )
}

/**
 * spec §6 ô Lệch + thua — "Bạn tin {lớp} thay vì lớp nên ưu tiên cho {kiểu}, và
 * thua. Lần sau thử tin lớp gợi ý cho loại này." + khung một-điểm-dữ-liệu.
 */
function templateLechThua(lop: string, kieu: string, goiY: string, pct: string): string {
  return (
    `Bạn tin ${lop} thay vì lớp nên ưu tiên cho ${kieu}${goiY}, và thua (${pct}). ` +
    `Lần sau thử tin lớp gợi ý cho loại này — nhưng đây vẫn chỉ là ${MOT_DIEM_DU_LIEU}, ` +
    `chưa phải kết luận: ${TRO_VE_KHOI15} là nơi mẫu tích lại.`
  )
}

/** "khối ⑮" → "Khối ⑮" khi cụm đứng đầu câu. */
function capHoa(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Chọn + render đoạn coach "đối chiếu vs kết quả" cho lệnh vừa đóng.
 *
 * `null` khi `khopGoiY == null` — kiểu chưa phân loại nên chưa từng có gợi ý để
 * so (spec §10). KHÔNG có ô nào, và đó KHÔNG phải "lệch".
 */
export function pickCoachCap6(situation: CoachSituationCap6): CoachResultCap6 | null {
  const { khopGoiY, pnlPct, lopQuyetDinh, kieuTen, lopUuTien } = situation
  if (khopGoiY == null) return null

  const id = deriveCoachIdCap6(khopGoiY, pnlPct)
  const pct = fmtPct(pnlPct)
  const lop = lopQuyetDinh ? lopLabelCap4(lopQuyetDinh) : "lớp bạn đã chọn"
  const kieu = kieuTen ?? "kiểu cổ phiếu của mã này"
  const goiY = cumGoiY(lopUuTien)
  const thieu = ghiChuThieu(situation)

  switch (id) {
    case "khop_thang":
      return {
        id,
        text: templateKhopThang(lop, kieu, pct) + thieu,
        nhanManh: ["Đối chiếu theo kiểu đang cho quả ngọt", "một điểm dữ liệu, chưa phải bằng chứng"],
        khop: true,
      }
    case "khop_thua":
      return {
        id,
        text: templateKhopThua(kieu, pct) + thieu,
        nhanManh: [
          "Cách đối chiếu vẫn hợp lý, đừng vội đổi",
          "một xác suất khởi điểm, không phải bảo đảm",
        ],
        khop: true,
      }
    case "lech_thang":
      return {
        id,
        text: templateLechThang(lop, kieu, goiY, pct) + thieu,
        nhanManh: ["khác gợi ý", "theo dõi thêm xem có lặp lại không"],
        khop: false,
      }
    case "lech_thua":
      return {
        id,
        text: templateLechThua(lop, kieu, goiY, pct) + thieu,
        nhanManh: ["một điểm dữ liệu", "chưa phải kết luận"],
        khop: false,
      }
  }
}

export interface ComposedCoachCap6 extends ComposedCoachCap5 {
  /**
   * Đoạn "đối chiếu vs kết quả" của Cấp 6 — `null` khi lệnh không có đối chiếu
   * hoặc kiểu chưa phân loại (không có gợi ý nào để so).
   */
  cap6: CoachResultCap6 | null
}

/**
 * Composes CẢ 6 lớp coach cho `KetsoModalCap6`: gọi `composeCoachCap5` (Cấp 1-5,
 * không bao giờ viết lại) rồi thêm lớp Cấp 6. `cap6Situation === null` (lệnh
 * không có đối chiếu) → 5 lớp dưới VẪN đủ, `cap6` là `null`; và ngược lại,
 * `cap5Situation === null` (lệnh không có nguồn săn mã để nói) không chặn đoạn
 * Cấp 6.
 */
export function composeCoachCap6(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
  cap5Situation: CoachSituationCap5 | null,
  cap6Situation: CoachSituationCap6 | null,
): ComposedCoachCap6 {
  const cap5Composed = composeCoachCap5(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
  )
  return {
    ...cap5Composed,
    cap6: cap6Situation ? pickCoachCap6(cap6Situation) : null,
  }
}
