import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import {
  composeCoachCap2,
  type ComposedCoachCap2,
  type CoachResultCap2,
  type CoachSituationCap2,
} from "@/features/cap2/coachTemplateCap2"
import type { CachKhoiLuong, MucTuTin } from "./types"

/**
 * Cấp 3 Kết sổ coach — lớp "tự tin vs kết quả" (spec `IQX-Cap3-Spec.md` §7).
 *
 * **Cộng dồn, KHÔNG thay thế.** Cấp 1's coach (`coachTemplateCap1`, lưới A-F
 * lý-do × kết-quả) và Cấp 2's coach (`pickCoachCap2`, kỷ luật cắt lỗ/chốt
 * lời) vẫn chạy nguyên vẹn — `composeCoachCap3` gọi
 * `composeCoachCap2` (chính nó đã gọi `coachTemplateCap1`) rồi THÊM đoạn thứ
 * 3 về mức tự tin. `KetsoModalCap3` render cả 3 đoạn cạnh nhau.
 *
 * Rule-based, KHÔNG phải AI — cùng quy ước với Cấp 0/1/2.
 *
 * **Composition / priority (documented, per task brief):**
 * 1. 3 lớp là ĐỘC LẬP và LUÔN cùng hiện — không lớp nào "thắng" lớp nào
 *    (nguyên tắc cộng dồn của spec). Thứ tự render: Cấp 1 ("NHÌN LẠI") → Cấp 2
 *    ("KỶ LUẬT") → Cấp 3 ("TỰ TIN VS KẾT QUẢ").
 * 2. Bên TRONG lớp Cấp 3, đúng 1 trong 6 mẫu được chọn bởi 2 trục vuông góc
 *    (mức tự tin × thắng/thua) — hàm toàn phần, không có tranh chấp thứ tự
 *    như `pickCoachIdCap2` (nơi 4 vi phạm có thể cùng true nên phải xếp hạng).
 * 3. **Vì sao 6 mẫu chứ không phải 4:** spec §7 chỉ viết sẵn 4 mẫu cho 2 CỰC
 *    (⭐⭐⭐ Cao / ⭐ Thấp) × (thắng/thua). Mức giữa ⭐⭐ Vừa vẫn phải nói được
 *    một câu ĐÚNG — nhét nó vào mẫu "Thấp" sẽ in ra nhãn "⭐ Thấp" cho một
 *    lệnh chấm ⭐⭐, tức là nói sai dữ liệu của user. Nên 2 mẫu ⭐⭐ Vừa được
 *    thêm, lấy nguyên văn giọng của mockup `iqx-cap3-ketso.html` (chính mockup
 *    trong bộ spec — nó minh hoạ đúng trường hợp ⭐⭐ Vừa + thắng).
 */

export type CoachIdCap3 =
  | "tu_tin_cao_thang"
  | "tu_tin_cao_thua"
  | "tu_tin_vua_thang"
  | "tu_tin_vua_thua"
  | "tu_tin_thap_thang"
  | "tu_tin_thap_thua"

export interface CoachSituationCap3 {
  /** Mức tự tin user TỰ chấm lúc đặt (`order_kehoach.muc_tu_tin`). */
  mucTuTin: MucTuTin
  /** Lệnh lãi — cùng nguồn với `CoachSituationCap1.pnlPositive`. */
  pnlPositive: boolean
  /** Lãi/lỗ % của lệnh (nêu con số trong câu — §C12c). */
  pnlPct: number
  /** Cách tính khối lượng đã chọn (`order_kehoach.cach_khoi_luong`). */
  cachKhoiLuong: CachKhoiLuong
  /** Khối lượng thực tế (cp) — `order_kehoach.khoi_luong`. */
  khoiLuong: number
  /** % vốn thực tế của lệnh — `order_kehoach.pct_von`. */
  pctVon: number
}

export interface CoachResultCap3 {
  id: CoachIdCap3
  text: string
}

/** Nhãn mức tự tin — giống hệt panel đặt lệnh (`QuanLyVonBlock`'s 3 nút). */
export const MUC_TU_TIN_LABEL: Record<MucTuTin, string> = {
  1: "⭐ Thấp",
  2: "⭐⭐ Vừa",
  3: "⭐⭐⭐ Cao",
}

/** `+5.8%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0/1/2. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** `1,100 cp · 19.0% vốn` — số en-US (§E). */
function fmtVon(khoiLuong: number, pctVon: number): string {
  return `${Math.round(khoiLuong).toLocaleString("en-US")} cp (${pctVon.toFixed(1)}% vốn)`
}

/**
 * `pickCoachIdCap3` — hàm toàn phần trên (mức tự tin × thắng/thua). Không có
 * thứ tự ưu tiên nào cần giải quyết: 2 trục vuông góc, mỗi tổ hợp đúng 1 id.
 */
export function pickCoachIdCap3(situation: CoachSituationCap3): CoachIdCap3 {
  const { mucTuTin, pnlPositive } = situation
  if (mucTuTin === 3) return pnlPositive ? "tu_tin_cao_thang" : "tu_tin_cao_thua"
  if (mucTuTin === 2) return pnlPositive ? "tu_tin_vua_thang" : "tu_tin_vua_thua"
  return pnlPositive ? "tu_tin_thap_thang" : "tu_tin_thap_thua"
}

/**
 * Câu đuôi về CÁCH tính khối lượng (mockup `iqx-cap3-ketso.html`'s "Điều đáng
 * ghi nhận…"): cách «linh hoạt» thì tự tin thật sự dẫn dắt khối lượng; cách
 * «kỷ luật» thì không — nhưng mức tự tin vẫn được ghi lại (spec §6.3).
 */
function ghiNhanCach(cachKhoiLuong: CachKhoiLuong): string {
  return cachKhoiLuong === "linh_hoat"
    ? "Điều đáng ghi nhận: bạn để mức tự tin dẫn dắt khối lượng, không mua theo cảm hứng."
    : "Lệnh này bạn dùng cách «kỷ luật» — luôn mua đúng trần khẩu vị; mức tự tin vẫn được ghi lại để đối chiếu."
}

function templateCaoThang(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[3]} và thắng (${pct}) — phán đoán của bạn có cơ sở. ` +
    `Bạn mua ${von} nên khối lượng lớn, lãi cũng lớn theo niềm tin.`
  )
}

function templateCaoThua(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[3]} nhưng thua (${pct}), với ${von}. Chưa vội kết luận — một quyết ` +
    `định tốt vẫn có thể thua vì thị trường. Cấp 4 sẽ dạy tách quyết định khỏi kết quả.`
  )
}

function templateVuaThang(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[2]} và thắng (${pct}) — bạn mua ${von}, khối lượng vừa phải nên lãi ` +
    `cũng vừa phải. Nếu tự tin cao hơn bạn đã mua nhiều hơn và lãi lớn hơn.`
  )
}

function templateVuaThua(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[2]} và thua (${pct}) — khối lượng vừa phải (${von}) giữ thiệt hại ` +
    `trong tầm kiểm soát. Xem lại lý do lệnh này để lần sau chấm tự tin sát hơn.`
  )
}

function templateThapThang(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[1]} mà thắng (${pct}) — bạn phòng thủ đúng (chỉ mua ${von}), nhưng ` +
    `lãi nhỏ vì khối lượng nhỏ. Nếu tin hơn đã lãi nhiều hơn.`
  )
}

function templateThapThua(pct: string, von: string): string {
  return (
    `Tự tin ${MUC_TU_TIN_LABEL[1]} và thua (${pct}) — bạn mua ít (${von}) nên thiệt hại nhỏ. ` +
    `Phòng thủ đã cứu bạn.`
  )
}

/** Chọn + render đoạn coach "tự tin vs kết quả" cho lệnh vừa đóng. */
export function pickCoachCap3(situation: CoachSituationCap3): CoachResultCap3 {
  const id = pickCoachIdCap3(situation)
  const pct = fmtPct(situation.pnlPct)
  const von = fmtVon(situation.khoiLuong, situation.pctVon)
  const ghiNhan = ghiNhanCach(situation.cachKhoiLuong)

  const body = (() => {
    switch (id) {
      case "tu_tin_cao_thang":
        return templateCaoThang(pct, von)
      case "tu_tin_cao_thua":
        return templateCaoThua(pct, von)
      case "tu_tin_vua_thang":
        return templateVuaThang(pct, von)
      case "tu_tin_vua_thua":
        return templateVuaThua(pct, von)
      case "tu_tin_thap_thang":
        return templateThapThang(pct, von)
      case "tu_tin_thap_thua":
        return templateThapThua(pct, von)
    }
  })()

  return { id, text: `${body} ${ghiNhan}` }
}

export interface ComposedCoachCap3 extends ComposedCoachCap2 {
  /** Cấp 1's A-F lý-do/kết-quả paragraph (delegated qua `composeCoachCap2`). */
  cap1Text: string
  /** Cấp 2's exit-discipline paragraph (delegated qua `composeCoachCap2`). */
  cap2: CoachResultCap2
  /** Cấp 3's tự-tin-vs-kết-quả paragraph (lớp mới). */
  cap3: CoachResultCap3
}

/**
 * Composes CẢ 3 lớp coach cho `KetsoModalCap3`: gọi `composeCoachCap2` (Cấp 1
 * + Cấp 2, không bao giờ viết lại) rồi thêm lớp Cấp 3. Modal render 3 đoạn.
 */
export function composeCoachCap3(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
  cap3Situation: CoachSituationCap3,
): ComposedCoachCap3 {
  const cap2Composed = composeCoachCap2(cap1Situation, cap1Params, cap2Situation)
  return { ...cap2Composed, cap3: pickCoachCap3(cap3Situation) }
}
