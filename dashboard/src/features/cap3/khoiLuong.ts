import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"

/**
 * Pure khối lượng mua computation (spec §6.3) — kept side-effect-free and
 * independently unit-tested so `QuanLyVonBlock.tsx` stays a thin
 * controlled-state + render shell around it (mirrors `cap2/slTp.ts`'s own
 * split between pure math and its `SlTpBlock.tsx` shell).
 */

/** spec §5.1 — 3-mức khẩu vị rủi ro, % vốn TỐI ĐA cho 1 lệnh (trần). */
export const KHAU_VI_PCT: Record<KhauViLoai, number> = {
  than_trong: 10,
  can_bang: 20,
  tan_cong: 30,
}

/** spec §6.2 — hệ số tự tin. Used by Cách 1 (linh hoạt) only — Cách 2 (kỷ
 * luật) never multiplies by this (spec §6.3 "Chỉ dùng khẩu vị"). */
export const MUC_TU_TIN_HE_SO: Record<MucTuTin, number> = {
  1: 50,
  2: 75,
  3: 100,
}

const LO_MAC_DINH = 100

/**
 * Làm tròn lô 100 cổ phiếu (VN market: khối lượng luôn là bội số của 100).
 * Rounding rule = ROUND-TO-NEAREST (not floor/ceil) — verified against the
 * spec §6.3 worked example itself (vốn 100tr, VNM giá 62.400, khẩu vị Cân
 * bằng trần 20%):
 *   - ⭐ Thấp, cách 1: 10tr ÷ 62.400 = 160.3cp → spec says "~200 cp".
 *     Floor would give 100 (wrong); round-to-nearest gives 200 (dist 40 <
 *     dist 60 to 100) — matches.
 *   - ⭐⭐ Vừa, cách 1: 15tr ÷ 62.400 = 240.4cp → spec says "~200 cp" —
 *     round-to-nearest gives 200 (240 is closer to 200 than 300).
 *   - ⭐⭐⭐ Cao / cách 2 (mọi mức): 20tr ÷ 62.400 = 320.5cp → spec says
 *     "~300 cp" — round-to-nearest gives 300.
 * Floor is consistent with rows 2-3 but contradicts row 1; round-to-nearest
 * is the only rule consistent with all 3 rows, so that is what this
 * implements. Ties (exact x50) round up, matching `Math.round`'s and
 * `cap2/slTp.ts#roundToStep`'s existing convention elsewhere in the app.
 */
export function roundToLo(shares: number, lo: number = LO_MAC_DINH): number {
  if (!Number.isFinite(shares) || shares <= 0) return 0
  return Math.round(shares / lo) * lo
}

export interface KhoiLuongInput {
  /** % trần khẩu vị (10/20/30) — NOT the enum; caller resolves via `KHAU_VI_PCT`. */
  khauViPct: number
  mucTuTin: MucTuTin
  cachKhoiLuong: CachKhoiLuong
  /** Vốn ban đầu demo (spec §4/§C12b — cố định 100,000,000đ, nhưng để tham
   * số hoá thay vì hard-code). */
  vonBanDau: number
  /** "Giá vào" — giá thị trường/giới hạn tại thời điểm tính (VND). */
  giaVao: number
}

export interface KhoiLuongResult {
  /** Số cổ phiếu nên mua — đã làm tròn lô 100. */
  khoiLuong: number
  /** % vốn THỰC TẾ dựa trên khối lượng đã làm tròn (không phải % mục tiêu
   * trước khi làm tròn — spec §7 "Khối lượng + % vốn thực tế"). */
  pctVon: number
  /** Số tiền dự kiến TRƯỚC khi làm tròn lô (dùng để hiển thị "con số đến từ
   * đâu" — §C12c). */
  tienDuKien: number
}

const KHOI_LUONG_ZERO: KhoiLuongResult = { khoiLuong: 0, pctVon: 0, tienDuKien: 0 }

/**
 * Cách 1 «linh hoạt» (spec §6.3): Khối lượng = % trần khẩu vị × hệ số tự tin
 * × vốn ÷ giá — "tin nhiều mua nhiều, tin ít mua ít".
 *
 * Cách 2 «kỷ luật» (spec §6.3): Khối lượng = % trần khẩu vị × vốn ÷ giá —
 * "luôn mua đúng mức trần, không để cảm xúc tự tin chi phối". `mucTuTin` is
 * NOT used in this branch's math, but the caller must still have collected
 * it (spec §6.3 "mức tự tin LUÔN được ghi lại dù chọn cách nào") — enforced
 * by `isKhoiLuongValid`, not by this pure function.
 *
 * Degrades to all-zero (never throws/NaN) when any required input is
 * missing/non-positive — mirrors `cap2/slTp.ts`'s "disable, don't crash"
 * convention.
 */
export function computeKhoiLuong(input: KhoiLuongInput): KhoiLuongResult {
  const { khauViPct, mucTuTin, cachKhoiLuong, vonBanDau, giaVao } = input
  if (!khauViPct || khauViPct <= 0 || !vonBanDau || vonBanDau <= 0 || !giaVao || giaVao <= 0) {
    return KHOI_LUONG_ZERO
  }

  const heSo = cachKhoiLuong === "linh_hoat" ? (MUC_TU_TIN_HE_SO[mucTuTin] ?? 100) : 100
  const tienDuKien =
    cachKhoiLuong === "linh_hoat"
      ? vonBanDau * (khauViPct / 100) * (heSo / 100)
      : vonBanDau * (khauViPct / 100)

  const khoiLuong = roundToLo(tienDuKien / giaVao)
  const pctVon = ((khoiLuong * giaVao) / vonBanDau) * 100

  return { khoiLuong, pctVon, tienDuKien }
}

/**
 * spec §6.4 "cổng cứng": nút ĐẶT LỆNH MUA khóa cho đến khi CẢ mức tự tin lẫn
 * cách khối lượng đã được chọn (regardless of which cách — mức tự tin is
 * always mandatory, spec §6.3).
 */
export function isKhoiLuongValid(
  mucTuTin: MucTuTin | null,
  cachKhoiLuong: CachKhoiLuong | null,
): boolean {
  return mucTuTin != null && cachKhoiLuong != null
}
