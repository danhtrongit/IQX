import { LY_DO_OPTIONS, type CamXuc, type LyDo, type TrangThaiLucDat } from "./types"

/**
 * Cấp 1 Kết sổ coach block (spec §6) — rule-based, NOT AI: picks exactly 1 of
 * 6 verbatim templates (A-F) from the situation of the just-closed order.
 */

export interface CoachSituationCap1 {
  /** Lệnh lãi (giá ra > giá vào). */
  pnlPositive: boolean
  /** AI Thanh tra verdict captured at BUY time (`order_kehoach.trangThai_luc_dat`). */
  trangThaiLucDat: TrangThaiLucDat
  /** Số phiên giữ lệnh (from `order_ketso.so_phien_giu`). */
  soPhienGiu: number
}

export type CoachLetterCap1 = "A" | "B" | "C" | "D" | "E" | "F"

/**
 * spec §6 table lists A..F top-to-bottom ("Ưu tiên từ trên xuống"), but A-D
 * together are an EXHAUSTIVE grid over {lãi/lỗ} × {4 trạng thái lúc đặt} — if
 * checked first, E/F (which are about holding-time BEHAVIOUR, not the
 * lý-do/kết-quả grid) would never be reachable. E/F are therefore checked
 * FIRST here: a holding-time anomaly is the more urgent, distinct signal
 * spec §6's "có chuyện" definition already treats it as (alongside the loss
 * threshold, which routes through C/D as normal). Within the grid, B/D each
 * broaden the spec's literal "⚪/⚠" ("❌") to "not ✅" ("not ❌") so every
 * {pnlPositive, trangThaiLucDat} pair resolves to exactly one letter.
 */
export function pickCoachLetterCap1(situation: CoachSituationCap1): CoachLetterCap1 {
  const { pnlPositive, trangThaiLucDat, soPhienGiu } = situation
  if (soPhienGiu > 10) return "E"
  if (soPhienGiu < 1) return "F"
  if (pnlPositive) return trangThaiLucDat === "ung_ho" ? "A" : "B"
  return trangThaiLucDat === "ung_ho" ? "C" : "D"
}

const TRANG_THAI_LABEL: Record<TrangThaiLucDat, string> = {
  ung_ho: "✅ Ủng hộ",
  trung_tinh: "⚪ Trung tính",
  can_chu_y: "⚠ Cần chú ý",
  nguoc_chieu: "❌ Ngược chiều",
}

const CAM_XUC_LABEL: Record<CamXuc, string> = {
  binh_tinh: "😌 Bình tĩnh",
  so: "😰 Sợ",
  hoi_tiec: "😔 Hối tiếc",
  khong_ro: "🤔 Không rõ",
}

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

/** `+8.2%` / `−4.1%` / `0.0%` — same typographic minus "−" (U+2212) as Cấp 0's `fmtPct`. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

export interface CoachParamsCap1 {
  pnlPct: number
  lyDo: LyDo
  /** Số phiên giữ — used by templates E/F ("Bạn giữ/bán ... {n} phiên"). */
  soPhienGiu: number
  /** Cảm xúc chosen in Khối cảm xúc, if any (template F only). */
  emotion: CamXuc | null
}

/** A. Lãi, lý do lúc đặt ✅ Ủng hộ. */
function templateA(pct: string, lyDo: string): string {
  return `Lệnh lãi ${pct}. Bạn chọn lý do ${lyDo} lúc lớp đó ✅ Ủng hộ — chọn lý do có cơ sở đã cho kết quả tốt. Ghi lại như mẫu chuẩn.`
}

/** B. Lãi, lý do lúc đặt không phải ✅ Ủng hộ. */
function templateB(pct: string, lyDo: string, trangThai: string): string {
  return `Lệnh lãi ${pct}. Lý do ${lyDo} lúc đặt chỉ ${trangThai} — kết quả tốt nhưng chưa chắc do phán đoán đúng. Thử ưu tiên lệnh có lý do ✅ Ủng hộ.`
}

/** C. Lỗ, lý do lúc đặt ✅ Ủng hộ. */
function templateC(pct: string, lyDo: string): string {
  return `Lệnh lỗ ${pct} dù lý do ${lyDo} lúc đặt ✅ Ủng hộ. Có dữ liệu ủng hộ vẫn có thể lỗ — thị trường không chắc chắn. Đây không phải lỗi chọn lý do.`
}

/** D. Lỗ, lý do lúc đặt không phải ✅ Ủng hộ. */
function templateD(pct: string, lyDo: string): string {
  return `Lệnh lỗ ${pct}. Lúc đặt, lớp ${lyDo} đã ❌ Ngược chiều — bạn vẫn mua. Khi dữ liệu cảnh báo ngược, thị trường thường đúng.`
}

/** E. Giữ quá lâu (>10 phiên). */
function templateE(n: number): string {
  return `Bạn giữ lệnh ${n} phiên. Ở Cấp 2 bạn sẽ học đặt chốt lời/cắt lỗ để biết khi nào nên thoát — không giữ mãi theo cảm tính.`
}

/** F. Bán vội (<1 phiên). */
function templateF(n: number, emotion: string): string {
  return `Bạn bán chỉ sau ${n} phiên. Cảm xúc ${emotion}. Ở Cấp 2 bạn sẽ học đặt vùng thoát trước, tránh bán theo phản ứng nhất thời.`
}

/**
 * Chọn + render 1 trong 6 đoạn coach (spec §6) theo tình huống lệnh vừa Kết
 * sổ. `params.lyDo`/`params.pnlPct`/`params.soPhienGiu`/`params.emotion` fill
 * the chosen template's placeholders.
 */
export function coachTemplateCap1(situation: CoachSituationCap1, params: CoachParamsCap1): string {
  const letter = pickCoachLetterCap1(situation)
  const pct = fmtPct(params.pnlPct)
  const lyDo = lyDoLabel(params.lyDo)
  switch (letter) {
    case "A":
      return templateA(pct, lyDo)
    case "B":
      return templateB(pct, lyDo, TRANG_THAI_LABEL[situation.trangThaiLucDat])
    case "C":
      return templateC(pct, lyDo)
    case "D":
      return templateD(pct, lyDo)
    case "E":
      return templateE(params.soPhienGiu)
    case "F":
      return templateF(params.soPhienGiu, params.emotion ? CAM_XUC_LABEL[params.emotion] : "chưa rõ")
  }
}
