import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import type { CoachSituationCap4 } from "@/features/cap4/coachTemplateCap4"
import type { CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import type { CoachSituationCap6 } from "@/features/cap6/coachTemplateCap6"
import {
  composeCoachCap7,
  type ComposedCoachCap7,
  type CoachSituationCap7,
} from "@/features/cap7/coachTemplateCap7"
import type { HanhViCanhBao } from "./types"

/**
 * Cấp 8 Kết sổ coach — lớp "cảnh báo danh mục lúc mua vs cách xử lý" (spec §6).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap8` gọi `composeCoachCap7` (chính
 * nó gọi Cấp 6 → 5 → 4 → 3 → 2 → 1) rồi THÊM đoạn thứ 8. `KetsoModalCap8` render
 * cả 8 đoạn cạnh nhau. Rule-based, KHÔNG phải AI — như Cấp 0-7.
 *
 * ★★ **Ô "vẫn mua + thua" KHÔNG QUY NHÂN QUẢ.** Câu của spec §6 nói thẳng
 * *"Không chắc thua vì điều đó"* và đó là phần quan trọng nhất của cả lớp coach
 * này: IQX **không biết** vì sao một lệnh thua. Một danh mục dồn ngành làm cả
 * danh mục dễ tổn thương CÙNG LÚC — đó là một mệnh đề về danh mục, không phải
 * một lời giải thích cho lệnh vừa rồi. Viết "bạn thua vì dồn ngành" sẽ là bịa.
 *
 * ★★ **"Vẫn mua" KHÔNG BỊ PHẠT** (§C8, spec §9: cảnh báo mềm, không cổng cứng).
 * Không ô nào gọi user là sai/vi phạm, kể cả ô họ bỏ qua cảnh báo. Ô duy nhất
 * được tô màu cảnh báo là **vẫn mua + THẮNG** — và nó cảnh báo việc *củng cố*
 * một thói quen rủi ro ("sai mà thắng" của Cấp 5), chứ không phạt lệnh thắng.
 *
 * ★ **KHÔNG BAO GIỜ BỊA** (§C12c): tên các cảnh báo tới từ
 * `order_kehoach.danh_muc_canh_bao_ten` của server. Thiếu thì câu coach nói
 * "cảnh báo danh mục" chung chung, chứ không điền đại một loại nghe hợp lý.
 */

/** 4 mẫu của spec §6 — cảnh báo (có/không) × cách xử lý × kết quả. */
export type CoachIdCap8 = "nghe" | "van_mua_thua" | "van_mua_thang" | "khong_canh_bao"

/**
 * Nhãn ô — TRUNG TÍNH. "Vẫn mua" là một lựa chọn được GHI LẠI, không bị chấm:
 * nhãn nói user đã làm gì, không nói việc đó đúng hay sai.
 */
export const COACH_CAP8_LABEL: Record<CoachIdCap8, string> = {
  nghe: "Có cảnh báo · đã điều chỉnh",
  van_mua_thua: "Có cảnh báo · vẫn mua · thua",
  van_mua_thang: "Có cảnh báo · vẫn mua · thắng",
  khong_canh_bao: "Không có cảnh báo",
}

export interface CoachSituationCap8 {
  /**
   * `order_kehoach.danh_muc_canh_bao_ten` — tên các cảnh báo ĐÃ BẬT lúc mua.
   * `[]` = đã kiểm tra và sạch; `null` = hệ chưa ghi lại được tên (câu coach
   * chuyển sang nói chung, KHÔNG đoán một loại).
   */
  canhBaoTen: string[] | null
  /**
   * `order_kehoach.hanh_vi_canh_bao` — chỉ chính user biết họ đã chọn gì.
   * ★ `null` = lệnh CHƯA QUA bước Kiểm tra danh mục (mua trước Cấp 8, hoặc
   * `POST /cap8/kehoach` chưa ghi được) → KHÔNG có đoạn coach nào.
   */
  hanhVi: HanhViCanhBao | null
  pnlPct: number
}

export interface CoachResultCap8 {
  id: CoachIdCap8
  text: string
  /** Cụm cần in đậm — mọi cụm LUÔN có mặt nguyên văn trong `text`. */
  nhanManh: string[]
  /**
   * Có tô màu cảnh báo hay không. ★ CHỈ ô `van_mua_thang`: nó chống việc một
   * lần thắng củng cố thói quen dồn rủi ro (bài "sai mà thắng" của Cấp 5). Ô
   * `van_mua_thua` KHÔNG được tô — tô nó sẽ đọc như một lời buộc tội nhân quả
   * mà chính câu copy vừa phủ nhận.
   */
  canhBao: boolean
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-7. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** "Dồn ngành" → "dồn ngành" — tên cảnh báo nằm GIỮA câu nên viết thường. */
function thuong(ten: string): string {
  return ten.length > 0 ? ten[0].toLowerCase() + ten.slice(1) : ten
}

/**
 * Cụm `{loại}` của spec §6.
 *
 * ★ Liệt kê ĐỦ mọi cảnh báo đã bật: rút gọn còn một loại sẽ giấu mất phần user
 * cần thấy nhất khi hai thước đo cùng kêu. Không có tên nào → "danh mục" chung
 * chung, KHÔNG đoán một loại.
 */
function loaiCanhBao(canhBaoTen: string[] | null): string {
  const ten = (canhBaoTen ?? []).filter((t) => t.trim().length > 0)
  if (ten.length === 0) return "danh mục"
  return ten.map(thuong).join(" và ")
}

/**
 * spec §6 ô Có cảnh báo + nghe (giảm KL/đổi mã) — nguyên văn.
 *
 * `chon_ma_khac` và `giam_kl` CÙNG một ô: cả hai đều là "nghe cảnh báo và điều
 * chỉnh", và spec §6 gộp chúng đúng như thế.
 */
function templateNghe(loai: string): string {
  return (
    `Bạn thấy cảnh báo ${loai} và điều chỉnh — đúng tinh thần phân tán. ` +
    "Danh mục bạn an toàn hơn nhờ vậy."
  )
}

/**
 * spec §6 ô Có cảnh báo + vẫn mua + thua — nguyên văn.
 *
 * ★★ Câu "Không chắc thua vì điều đó" là BẮT BUỘC và không được rút gọn: nó là
 * ranh giới giữa một quan sát về danh mục và một lời quy kết mà IQX không có cơ
 * sở để đưa ra.
 */
function templateVanMuaThua(pct: string, loai: string): string {
  return (
    `Lệnh này thua (${pct}), và lúc mua đã có cảnh báo ${loai}. Không chắc thua ` +
    "vì điều đó — nhưng dồn ngành/tương quan cao làm cả danh mục dễ tổn thương " +
    "cùng lúc."
  )
}

/** spec §6 ô Có cảnh báo + vẫn mua + thắng — nguyên văn, nối lại bài Cấp 5. */
function templateVanMuaThang(pct: string, loai: string): string {
  return (
    `Thắng (${pct}), nhưng bạn đã bỏ qua cảnh báo ${loai}. Thắng lần này không ` +
    "có nghĩa dồn rủi ro là đúng — như Cấp 5 đã dạy, coi chừng 'sai mà thắng'."
  )
}

/** spec §6 ô Không cảnh báo — nguyên văn. Ô này KHÔNG xét thắng/thua. */
const TEMPLATE_KHONG_CANH_BAO =
  "Lệnh này không làm danh mục mất cân đối — thêm vào lành mạnh."

/**
 * Chọn + render đoạn coach "cảnh báo danh mục vs cách xử lý" cho lệnh vừa đóng.
 *
 * `null` khi `hanhVi == null` — lệnh chưa qua bước Kiểm tra danh mục. Đó KHÔNG
 * phải "không có cảnh báo": một lệnh mua trước Cấp 8 chưa từng được kiểm tra,
 * và nói với user rằng nó "không làm danh mục mất cân đối" sẽ là một lời khen
 * dựa trên phép đo chưa bao giờ chạy.
 *
 * ★ Định tuyến theo `hanhVi`, KHÔNG theo độ dài `canhBaoTen`: server đã cross-
 * check hai thứ đó với nhau (`khong_canh_bao` kèm cảnh báo → 400 và ngược lại),
 * nên `hanhVi` là câu trả lời authoritative cho "có cảnh báo hay không". Nếu hệ
 * chỉ mất phần TÊN cảnh báo thì câu coach vẫn đúng ô, chỉ nói chung chung hơn.
 */
export function pickCoachCap8(situation: CoachSituationCap8): CoachResultCap8 | null {
  const { canhBaoTen, hanhVi, pnlPct } = situation
  if (hanhVi == null) return null

  if (hanhVi === "khong_canh_bao") {
    return {
      id: "khong_canh_bao",
      text: TEMPLATE_KHONG_CANH_BAO,
      nhanManh: ["thêm vào lành mạnh"],
      canhBao: false,
    }
  }

  const loai = loaiCanhBao(canhBaoTen)

  if (hanhVi === "giam_kl" || hanhVi === "chon_ma_khac") {
    return {
      id: "nghe",
      text: templateNghe(loai),
      nhanManh: ["đúng tinh thần phân tán"],
      canhBao: false,
    }
  }

  // `van_mua` — thắng/thua theo đúng quy ước Cấp 5/6: `pnlPct > 0` mới là thắng,
  // lệnh đóng ngang giá (0%) tính là thua (không có ô "hòa" trong spec).
  const pct = fmtPct(pnlPct)
  if (pnlPct > 0) {
    return {
      id: "van_mua_thang",
      text: templateVanMuaThang(pct, loai),
      nhanManh: ["Thắng lần này không có nghĩa dồn rủi ro là đúng", "sai mà thắng"],
      canhBao: true,
    }
  }
  return {
    id: "van_mua_thua",
    text: templateVanMuaThua(pct, loai),
    nhanManh: ["Không chắc thua vì điều đó"],
    canhBao: false,
  }
}

export interface ComposedCoachCap8 extends ComposedCoachCap7 {
  /**
   * Đoạn "cảnh báo danh mục vs cách xử lý" của Cấp 8 — `null` khi lệnh chưa qua
   * bước Kiểm tra danh mục (không bao giờ là một lời khen đoán trước).
   */
  cap8: CoachResultCap8 | null
}

/**
 * Composes CẢ 8 lớp coach cho `KetsoModalCap8`: gọi `composeCoachCap7` (Cấp 1-7,
 * không bao giờ viết lại) rồi thêm lớp Cấp 8. Mọi lớp dưới độc lập với nhau —
 * `cap8Situation === null` không chặn 7 đoạn dưới, và `cap7Situation === null`
 * (lệnh không đọc lực) không chặn đoạn Cấp 8.
 */
export function composeCoachCap8(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
  cap5Situation: CoachSituationCap5 | null,
  cap6Situation: CoachSituationCap6 | null,
  cap7Situation: CoachSituationCap7 | null,
  cap8Situation: CoachSituationCap8 | null,
): ComposedCoachCap8 {
  const cap7Composed = composeCoachCap7(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
    cap6Situation,
    cap7Situation,
  )
  return {
    ...cap7Composed,
    cap8: cap8Situation ? pickCoachCap8(cap8Situation) : null,
  }
}
