import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import {
  composeCoachCap3,
  type ComposedCoachCap3,
  type CoachSituationCap3,
} from "@/features/cap3/coachTemplateCap3"
import { LOP_DEFS, LOP_KEYS, NHAN_DINH_LABEL } from "./doc5Lop"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"

/**
 * Cấp 4 Kết sổ coach — lớp "góc nhìn khác AI" (spec `IQX-Cap4-Spec.md` §6).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap4` gọi `composeCoachCap3`
 * (chính nó gọi `composeCoachCap2` → `coachTemplateCap1`) rồi THÊM đoạn thứ 4.
 * `KetsoModalCap4` render CẢ 4 đoạn cạnh nhau: NHÌN LẠI (Cấp 1, lưới lý do ×
 * kết quả) · KỶ LUẬT (Cấp 2, cắt lỗ/chốt lời) · TỰ TIN VS KẾT QUẢ (Cấp 3) ·
 * GÓC NHÌN KHÁC AI (Cấp 4). Rule-based, KHÔNG phải AI — như Cấp 0/1/2/3.
 *
 * ★ **KHÔNG BAO GIỜ gọi việc đọc khác AI là "sai"** (spec §4.2 + §9): AI là
 * công cụ tham chiếu, trọng tài cuối là KẾT QUẢ THẬT của thị trường. Khi user
 * đọc khác AI thì đó là "góc nhìn khác" cần kiểm chứng — nên mẫu "khác AI +
 * thua" chỉ nói "lần này AI có lý", tuyệt đối không phán user sai. Và Kết sổ
 * chỉ nói về MỘT lệnh: mọi mẫu đều nhắc "một lệnh chưa đủ kết luận" và trỏ sang
 * Phân tích danh mục (spec §6 dòng cuối).
 *
 * **Vì sao 5 id chứ không phải 4:** spec §6 viết sẵn 4 mẫu cho 2 trục
 * (khác-AI/cùng-AI × thắng/thua). Nhưng `ai_5_lop` có thể là `null` — lệnh đặt
 * mà AI đối chiếu chưa bao giờ lộ (user không chấm đủ 5 lớp, hoặc dữ liệu lớp
 * lỗi). Nhét trường hợp đó vào 1 trong 4 mẫu sẽ IN RA một đối chiếu không tồn
 * tại (bịa "AI đánh giá X"), nên có thêm id trung tính `chua_doi_chieu` nói
 * thẳng là chưa có dữ liệu AI — thà thiếu hơn bịa (§C12c).
 */

export type CoachIdCap4 =
  | "khac_ai_thang"
  | "khac_ai_thua"
  | "cung_ai_thang"
  | "cung_ai_thua"
  | "chua_doi_chieu"

export interface CoachSituationCap4 {
  /** Bản tự chấm 5 lớp của user lúc đặt (`order_kehoach.doc_5_lop`). */
  doc5Lop: Lop5Partial
  /**
   * Đánh giá AI 5 lớp đã rút về 3 mức (`order_kehoach.ai_5_lop`). `null` khi AI
   * chưa bao giờ được lộ cho lệnh này → nhánh `chua_doi_chieu`.
   */
  ai5Lop: Lop5Partial | null
  /** Lệnh lãi — cùng nguồn với `CoachSituationCap1.pnlPositive`. */
  pnlPositive: boolean
  /** Lãi/lỗ % của lệnh (luôn nêu con số trong câu — §C12c). */
  pnlPct: number
}

export interface CoachResultCap4 {
  id: CoachIdCap4
  text: string
  /**
   * Các lớp user đọc KHÁC AI, theo THỨ TỰ LỚP CHUẨN (`LOP_KEYS`) — cùng thứ tự
   * mà bảng "Đọc 5 lớp — nhìn lại" render, nên `KetsoModalCap4` dùng thẳng
   * danh sách này để nổi nền tím đúng hàng.
   */
  lopKhacAi: Lop[]
  /** Lớp được NÊU TÊN trong câu coach. `null` khi chưa có đối chiếu AI. */
  lopNoiBat: Lop | null
}

/** `📰 Tin tức` — icon + tên lớp, ghép y hệt panel đặt lệnh (`LOP_DEFS`). */
export function lopLabelCap4(lop: Lop): string {
  const def = LOP_DEFS.find((d) => d.lop === lop)
  return def ? `${def.icon} ${def.label}` : lop
}

/**
 * Các lớp so sánh được: có mặt ở CẢ 2 bản chấm. Một lớp mà dữ liệu thật không
 * tải được (AI không có mức) KHÔNG bao giờ bị coi là lệch (spec §5.2 —
 * "⚪ Chưa có dữ liệu lớp này để đối chiếu").
 */
export function lopSoSanhDuocCap4(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop: Lop5Partial | null | undefined,
): Lop[] {
  if (!doc5Lop || !ai5Lop) return []
  return LOP_KEYS.filter((lop) => doc5Lop[lop] != null && ai5Lop[lop] != null)
}

/**
 * Các lớp user đọc khác AI, theo thứ tự lớp chuẩn. Cùng vị từ với
 * `doc5Lop.ts#countKhacAi` — bất biến `countKhacAi(d, a) === lopKhacAiCap4(d, a).length`
 * được test khoá lại để 2 chỗ không bao giờ lệch nhau (số ở panel đặt lệnh và
 * số hàng tím ở Kết sổ phải luôn khớp).
 */
export function lopKhacAiCap4(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop: Lop5Partial | null | undefined,
): Lop[] {
  return lopSoSanhDuocCap4(doc5Lop, ai5Lop).filter((lop) => doc5Lop![lop] !== ai5Lop![lop])
}

/** Khoảng cách giữa 2 mức (0-2) — dùng để chọn lớp lệch MẠNH nhất. */
const MUC_RANK: Record<NhanDinhLop, number> = { bad: 0, neu: 1, ok: 2 }

/**
 * Lớp lệch mạnh nhất: khoảng cách mức lớn nhất (Ủng hộ vs Ngược chiều = 2 ăn
 * Ủng hộ vs Trung tính = 1). Hoà thì lấy theo thứ tự lớp chuẩn (`>` chặt).
 */
function lopLechManhNhat(doc5Lop: Lop5Partial, ai5Lop: Lop5Partial, khac: Lop[]): Lop | null {
  let best: Lop | null = null
  let bestDist = -1
  for (const lop of khac) {
    const docMuc = doc5Lop[lop]
    const aiMuc = ai5Lop[lop]
    if (docMuc == null || aiMuc == null) continue
    const dist = Math.abs(MUC_RANK[docMuc] - MUC_RANK[aiMuc])
    if (dist > bestDist) {
      best = lop
      bestDist = dist
    }
  }
  return best
}

/**
 * Lớp đại diện cho 2 mẫu "cùng góc nhìn AI": ưu tiên lớp cả hai cùng đọc **Ủng
 * hộ** (spec §6 viết "cùng đọc [X] là Ủng hộ"), nếu không có thì lớp so sánh
 * được đầu tiên — câu coach nêu ĐÚNG mức thật của lớp đó, không mặc định "Ủng
 * hộ" cho một lệnh mà cả hai đều đọc Trung tính.
 */
function lopDaiDienCungAi(doc5Lop: Lop5Partial, soSanh: Lop[]): Lop | null {
  return soSanh.find((lop) => doc5Lop[lop] === "ok") ?? soSanh[0] ?? null
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-3. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/**
 * `pickCoachIdCap4` — 2 trục vuông góc (khác-AI/cùng-AI × thắng/thua) + 1 nhánh
 * "chưa đối chiếu" xét TRƯỚC (không có đối chiếu thì 2 trục kia vô nghĩa).
 */
export function pickCoachIdCap4(situation: CoachSituationCap4): CoachIdCap4 {
  const { doc5Lop, ai5Lop, pnlPositive } = situation
  if (lopSoSanhDuocCap4(doc5Lop, ai5Lop).length === 0) return "chua_doi_chieu"
  if (lopKhacAiCap4(doc5Lop, ai5Lop).length > 0) {
    return pnlPositive ? "khac_ai_thang" : "khac_ai_thua"
  }
  return pnlPositive ? "cung_ai_thang" : "cung_ai_thua"
}

const CHUA_KET_LUAN =
  "Nhưng một lệnh chưa đủ kết luận; Phân tích danh mục sẽ cho biết trực giác của bạn có ổn định không."

/** spec §6 mẫu 1 — khác AI + thắng: góc nhìn của bạn đúng, chưa vội kết luận. */
function templateKhacAiThang(
  pct: string,
  soKhac: number,
  lopLabel: string,
  docMuc: NhanDinhLop,
  aiMuc: NhanDinhLop,
): string {
  return (
    `Lệnh này lãi (${pct}). Bạn đọc khác AI ở ${soKhac}/5 lớp. Ở lớp ${lopLabel}, bạn đọc ` +
    `${NHAN_DINH_LABEL[docMuc]} trong khi AI đánh giá ${NHAN_DINH_LABEL[aiMuc]} — lần này góc nhìn ` +
    `của bạn đúng. ${CHUA_KET_LUAN}`
  )
}

/**
 * spec §6 mẫu 2 — khác AI + thua: "lần này AI có lý", nhắc xem lại cách đọc.
 * ★ KHÔNG có chữ "sai" ở đây: một lệnh thua không chứng minh cách đọc của user
 * là sai, nó chỉ cho thấy lần này AI có lý (spec §4.2).
 */
function templateKhacAiThua(
  pct: string,
  soKhac: number,
  lopLabel: string,
  docMuc: NhanDinhLop,
  aiMuc: NhanDinhLop,
): string {
  return (
    `Lệnh này thua (${pct}). Bạn đọc khác AI ở ${soKhac}/5 lớp. Ở lớp ${lopLabel}, bạn đọc ` +
    `${NHAN_DINH_LABEL[docMuc]} trong khi AI đánh giá ${NHAN_DINH_LABEL[aiMuc]} — lần này AI có lý. ` +
    `Xem lại cách bạn đọc lớp này ở các lệnh tới. ${CHUA_KET_LUAN}`
  )
}

/** spec §6 mẫu 3 — cùng góc nhìn AI + thắng: "đọc chuẩn". */
function templateCungAiThang(
  pct: string,
  soSoSanh: number,
  lopLabel: string,
  muc: NhanDinhLop,
): string {
  return (
    `Lệnh này lãi (${pct}). Bạn và AI cùng góc nhìn ở cả ${soSoSanh}/5 lớp so được — cùng đọc ` +
    `${lopLabel} là ${NHAN_DINH_LABEL[muc]}, và lệnh thắng: đọc chuẩn. ${CHUA_KET_LUAN}`
  )
}

/** spec §6 mẫu 4 — cùng góc nhìn AI + thua: "thị trường thôi, không phải lỗi đọc". */
function templateCungAiThua(
  pct: string,
  soSoSanh: number,
  lopLabel: string,
  muc: NhanDinhLop,
): string {
  return (
    `Lệnh này thua (${pct}). Bạn và AI cùng góc nhìn ở cả ${soSoSanh}/5 lớp so được — cả hai đều ` +
    `đọc ${lopLabel} là ${NHAN_DINH_LABEL[muc]}, nhưng lệnh vẫn thua: thị trường thôi, không phải ` +
    `lỗi đọc. Một quyết định tốt vẫn có thể thua.`
  )
}

/** Nhánh trung tính khi `ai_5_lop` trống — nói thẳng là chưa có dữ liệu AI. */
function templateChuaDoiChieu(pct: string, pnlPositive: boolean): string {
  return (
    `Lệnh này ${pnlPositive ? "lãi" : "thua"} (${pct}). Lệnh này chưa có đối chiếu AI — AI chỉ lộ ` +
    `khi bạn chấm đủ 5 lớp, nên không có gì để so về góc nhìn riêng của bạn ở lệnh này. Các lớp ` +
    `coach phía trên vẫn đầy đủ.`
  )
}

/** Chọn + render đoạn coach "góc nhìn khác AI" cho lệnh vừa đóng. */
export function pickCoachCap4(situation: CoachSituationCap4): CoachResultCap4 {
  const { doc5Lop, ai5Lop, pnlPositive, pnlPct } = situation
  const id = pickCoachIdCap4(situation)
  const pct = fmtPct(pnlPct)

  if (id === "chua_doi_chieu") {
    return { id, text: templateChuaDoiChieu(pct, pnlPositive), lopKhacAi: [], lopNoiBat: null }
  }

  const ai = ai5Lop as Lop5Partial
  const soSanh = lopSoSanhDuocCap4(doc5Lop, ai)
  const lopKhacAi = lopKhacAiCap4(doc5Lop, ai)

  if (id === "khac_ai_thang" || id === "khac_ai_thua") {
    const lopNoiBat = lopLechManhNhat(doc5Lop, ai, lopKhacAi) as Lop
    const label = lopLabelCap4(lopNoiBat)
    const docMuc = doc5Lop[lopNoiBat] as NhanDinhLop
    const aiMuc = ai[lopNoiBat] as NhanDinhLop
    const text =
      id === "khac_ai_thang"
        ? templateKhacAiThang(pct, lopKhacAi.length, label, docMuc, aiMuc)
        : templateKhacAiThua(pct, lopKhacAi.length, label, docMuc, aiMuc)
    return { id, text, lopKhacAi, lopNoiBat }
  }

  const lopNoiBat = lopDaiDienCungAi(doc5Lop, soSanh) as Lop
  const label = lopLabelCap4(lopNoiBat)
  const muc = doc5Lop[lopNoiBat] as NhanDinhLop
  const text =
    id === "cung_ai_thang"
      ? templateCungAiThang(pct, soSanh.length, label, muc)
      : templateCungAiThua(pct, soSanh.length, label, muc)
  return { id, text, lopKhacAi, lopNoiBat }
}

export interface ComposedCoachCap4 extends ComposedCoachCap3 {
  /** Cấp 4's góc-nhìn-khác-AI paragraph (lớp mới). */
  cap4: CoachResultCap4
}

/**
 * Composes CẢ 4 lớp coach cho `KetsoModalCap4`: gọi `composeCoachCap3` (Cấp 1 +
 * Cấp 2 + Cấp 3, không bao giờ viết lại) rồi thêm lớp Cấp 4.
 */
export function composeCoachCap4(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
): ComposedCoachCap4 {
  const cap3Composed = composeCoachCap3(cap1Situation, cap1Params, cap2Situation, cap3Situation)
  return { ...cap3Composed, cap4: pickCoachCap4(cap4Situation) }
}
