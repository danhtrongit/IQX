import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import {
  composeCoachCap4,
  type ComposedCoachCap4,
  type CoachSituationCap4,
} from "@/features/cap4/coachTemplateCap4"
import type { O4, Verdict, VerdictSignal } from "./types"

/**
 * Cấp 5 Kết sổ coach — lớp "quyết định vs kết quả" (spec `IQX-Cap5-Spec.md` §4).
 *
 * **Cộng dồn, KHÔNG thay thế.** `composeCoachCap5` gọi `composeCoachCap4` (chính
 * nó gọi Cấp 3 → Cấp 2 → Cấp 1) rồi THÊM đoạn thứ 5. `KetsoModalCap5` render cả
 * 5 đoạn cạnh nhau. Rule-based, KHÔNG phải AI — như Cấp 0-4.
 *
 * ★ Hai ô PHẢN TRỰC GIÁC là lý do cấp này tồn tại, nên chúng được nhấn mạnh:
 *  - **Đúng-Thua**: làm đúng mà vẫn thua → "không phải lỗi của bạn", đừng đổi
 *    cách làm đúng chỉ vì một lần thua.
 *  - **Sai-Thắng**: làm sai mà vẫn thắng → ⚠ nguy hiểm nhất, đó là **may mắn**,
 *    không phải năng lực; thắng kiểu này củng cố thói quen xấu.
 *
 * ★ **KHÔNG BAO GIỜ bịa vi phạm** (§C12c): vi phạm chỉ lấy từ `signals` mà server
 * chấm TRƯỢT (`dat === false`). Tín hiệu `dat === null` nghĩa là dữ liệu nguồn
 * chưa từng được ghi → "chưa rõ", tuyệt đối không tính là vi phạm. Nếu user tự
 * đảo verdict sang "sai" mà hệ không thấy vi phạm nào, câu coach nói thẳng điều
 * đó thay vì nặn ra một lỗi.
 */

export type CoachIdCap5 = O4

/** Vi phạm diễn đạt bằng lời người dùng hiểu, khoá theo `ma` của tín hiệu BE. */
const VI_PHAM_LABEL: Record<string, string> = {
  co_so: "vào lệnh khi chưa đủ cơ sở",
  ky_luat_thoat: "không tôn trọng ngưỡng cắt lỗ / chốt lời đã cam kết",
  khong_nhoi: "nhồi lệnh khi đang lỗ",
  khoi_luong_khop: "mua quá trần khẩu vị đã chọn",
}

/**
 * 4 ô = verdict CUỐI × kết quả. Mirror `services/cap5/service.py#_derive_o_4`:
 * lệnh đóng ngang giá (0%) tính là THUA (không có "hoà" trong 4 ô).
 */
export function deriveO4(verdict: Verdict, pnlPct: number): O4 {
  const thang = pnlPct > 0
  if (verdict === "dung") return thang ? "dung_thang" : "dung_thua"
  return thang ? "sai_thang" : "sai_thua"
}

/**
 * Vi phạm cụ thể lấy TỪ provenance, giữ đúng thứ tự tín hiệu server trả về.
 * Chỉ `dat === false`; `dat === null` (chưa rõ) không bao giờ thành vi phạm.
 */
export function viPhamTuSignals(signals: VerdictSignal[]): string[] {
  return signals
    .filter((s) => s.dat === false)
    .map((s) => VI_PHAM_LABEL[s.ma] ?? s.ten.toLowerCase())
}

/** Các tín hiệu ĐẠT — dùng để nói "bạn giữ đúng X" mà không bịa. */
function tinHieuDat(signals: VerdictSignal[]): string[] {
  return signals.filter((s) => s.dat === true).map((s) => s.ten.toLowerCase())
}

export interface CoachSituationCap5 {
  /** Ô cuối cùng của lệnh (verdict đã chốt × kết quả). */
  o4: O4
  /** Verdict đã chốt (của user, sau khi đồng ý/đảo verdict hệ). */
  verdict: Verdict
  pnlPct: number
  /** Provenance từ `GET /cap5/verdict/{order_id}` — nguồn duy nhất của vi phạm. */
  signals: VerdictSignal[]
}

export interface CoachResultCap5 {
  id: CoachIdCap5
  text: string
  /** Cụm từ cần in đậm — mọi cụm LUÔN có mặt nguyên văn trong `text`. */
  nhanManh: string[]
  /** Ô "Sai-Thắng" — cần hiển thị như một cảnh báo, không phải lời khen. */
  canhBao: boolean
  /** Vi phạm cụ thể (rỗng nếu hệ không thấy vi phạm nào). */
  viPham: string[]
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-4. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** Liệt kê "a, b và c". */
function lietKe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} và ${items[items.length - 1]}`
}

const KHONG_TIN_HIEU = "Lệnh này chưa ghi tín hiệu quy trình nào để đối chiếu."
const TU_DANH_GIA =
  "Ô này do bạn tự đánh giá — hệ không tìm thấy vi phạm nào trong dữ liệu quy trình của lệnh."

/** spec §4 ô Đúng-Thắng — chuẩn mực, mẫu để lặp lại. */
function templateDungThang(pct: string, dat: string[]): string {
  const duoi =
    dat.length > 0
      ? `Bạn giữ đúng ${lietKe(dat)}.`
      : KHONG_TIN_HIEU
  return (
    `Chuẩn mực. Bạn làm đúng quy trình VÀ được thị trường thưởng (${pct}). ${duoi} ` +
    `Đây là mẫu để lặp lại — ghi nhớ vì sao nó đúng.`
  )
}

/** spec §4 ô Đúng-Thua — ô phản trực giác #1. */
function templateDungThua(pct: string, dat: string[]): string {
  const duoi = dat.length > 0 ? `Bạn vẫn giữ đúng ${lietKe(dat)}.` : KHONG_TIN_HIEU
  return (
    `Chấp nhận được. Bạn làm đúng nhưng thị trường không thuận (${pct}) — ` +
    `không phải lỗi của bạn: một quyết định tốt vẫn có thể thua. ${duoi} ` +
    `Đừng đổi cách làm đúng chỉ vì một lần thua.`
  )
}

/** spec §4 ô Sai-Thắng — ô phản trực giác #2, nguy hiểm nhất. */
function templateSaiThang(pct: string, viPham: string[]): string {
  const duoi =
    viPham.length > 0
      ? `Lệnh này bạn đã ${lietKe(viPham)}.`
      : TU_DANH_GIA
  return (
    `⚠ Đây là ô nguy hiểm nhất. Bạn thắng (${pct}) dù làm sai quy trình — đó là ` +
    `may mắn, không phải năng lực. ${duoi} Thắng kiểu này củng cố thói quen xấu, ` +
    `đừng để nó đánh lừa bạn.`
  )
}

/** spec §4 ô Sai-Thua — bài học rõ ràng nhất. */
function templateSaiThua(pct: string, viPham: string[]): string {
  const duoi =
    viPham.length > 0
      ? `Lệnh này bạn đã ${lietKe(viPham)} — sửa đúng điểm này là tiến bộ nhanh nhất.`
      : TU_DANH_GIA
  return `Bài học rõ ràng nhất: bạn làm sai VÀ bị thị trường phạt (${pct}). ${duoi}`
}

/** Chọn + render đoạn coach "quyết định vs kết quả" cho lệnh vừa đóng. */
export function pickCoachCap5(situation: CoachSituationCap5): CoachResultCap5 {
  const { o4, pnlPct, signals } = situation
  const pct = fmtPct(pnlPct)
  const viPham = viPhamTuSignals(signals)
  const dat = tinHieuDat(signals)

  switch (o4) {
    case "dung_thang":
      return {
        id: o4,
        text: templateDungThang(pct, dat),
        nhanManh: ["Chuẩn mực"],
        canhBao: false,
        viPham,
      }
    case "dung_thua":
      return {
        id: o4,
        text: templateDungThua(pct, dat),
        nhanManh: ["không phải lỗi của bạn", "Đừng đổi cách làm đúng"],
        canhBao: false,
        viPham,
      }
    case "sai_thang":
      return {
        id: o4,
        text: templateSaiThang(pct, viPham),
        nhanManh: ["ô nguy hiểm nhất", "may mắn, không phải năng lực"],
        canhBao: true,
        viPham,
      }
    case "sai_thua":
      return {
        id: o4,
        text: templateSaiThua(pct, viPham),
        nhanManh: ["Bài học rõ ràng nhất"],
        canhBao: false,
        viPham,
      }
  }
}

export interface EmphasisPart {
  text: string
  strong: boolean
}

/**
 * Cắt câu thành các đoạn để in đậm đúng cụm từ được nhấn. Không bao giờ mất chữ
 * (ghép lại luôn bằng câu gốc) và giữ THỨ TỰ XUẤT HIỆN trong câu, không phải
 * thứ tự trong `phrases`.
 */
export function splitEmphasis(text: string, phrases: string[]): EmphasisPart[] {
  const hits: { start: number; end: number }[] = []
  for (const phrase of phrases) {
    if (!phrase) continue
    let from = 0
    for (;;) {
      const idx = text.indexOf(phrase, from)
      if (idx === -1) break
      hits.push({ start: idx, end: idx + phrase.length })
      from = idx + phrase.length
    }
  }
  hits.sort((a, b) => a.start - b.start)

  const parts: EmphasisPart[] = []
  let cursor = 0
  for (const hit of hits) {
    // Bỏ qua cụm chồng lấn cụm đã lấy (giữ cụm xuất hiện trước).
    if (hit.start < cursor) continue
    if (hit.start > cursor) parts.push({ text: text.slice(cursor, hit.start), strong: false })
    parts.push({ text: text.slice(hit.start, hit.end), strong: true })
    cursor = hit.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), strong: false })
  return parts.length > 0 ? parts : [{ text, strong: false }]
}

export interface ComposedCoachCap5 extends ComposedCoachCap4 {
  /** Cấp 5's quyết-định-vs-kết-quả paragraph — `null` khi chưa chốt phân loại. */
  cap5: CoachResultCap5 | null
}

/**
 * Composes CẢ 5 lớp coach cho `KetsoModalCap5`: gọi `composeCoachCap4` (Cấp 1-4,
 * không bao giờ viết lại) rồi thêm lớp Cấp 5. `cap5Situation === null` (user
 * chưa chốt verdict) → 4 lớp dưới VẪN đủ, `cap5` là `null`.
 */
export function composeCoachCap5(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
  cap4Situation: CoachSituationCap4,
  cap5Situation: CoachSituationCap5 | null,
): ComposedCoachCap5 {
  const cap4Composed = composeCoachCap4(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
  )
  return {
    ...cap4Composed,
    cap5: cap5Situation ? pickCoachCap5(cap5Situation) : null,
  }
}
