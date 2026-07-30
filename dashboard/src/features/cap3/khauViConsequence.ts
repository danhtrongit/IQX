import { KHAU_VI_PCT } from "./khoiLuong"
import type { KhauViLoai } from "./types"

/**
 * Pure "hệ quả của khẩu vị" computation (spec §5.1/§C12c) — used by
 * `KhauViModal` to show WHERE the "số mã nắm được" / "thiệt hại tối đa nếu 1
 * mã giảm sàn" numbers on each of the 3 mức come from, not just the
 * conclusion (§C12c "cho thấy con số đến từ đâu").
 */

/** Biên độ giảm sàn giả định cho phép tính minh hoạ (HOSE/HNX phổ biến ~7%/phiên). */
export const SAN_PCT_GIA_DINH = 7

export interface KhauViConsequence {
  khauViPct: number
  /** Số tiền tối đa cho 1 lệnh ở mức khẩu vị này (VND). */
  vonMoiLenh: number
  /** Số mã ước tính có thể nắm cùng lúc nếu chia đều vốn theo mức trần này
   * (100% vốn ÷ % trần/lệnh — round-to-nearest, e.g. 20% → 5 mã). */
  soMa: number
  /** Thiệt hại tối đa (VND) nếu MỘT mã giảm sàn ~7% khi đã bỏ full mức trần
   * vào mã đó (vốn/lệnh × sàn%). */
  thietHaiToiDa: number
}

/**
 * @param khauVi Mức khẩu vị (than_trong/can_bang/tan_cong).
 * @param vonBanDau Vốn ban đầu (spec §4: cố định 100,000,000đ — tham số hoá
 *   thay vì hard-code cho testability/tái sử dụng).
 * @param sanPct % giảm sàn giả định cho phép tính thiệt hại tối đa (mặc định 7).
 */
export function computeKhauViConsequence(
  khauVi: KhauViLoai,
  vonBanDau: number,
  sanPct: number = SAN_PCT_GIA_DINH,
): KhauViConsequence {
  const khauViPct = KHAU_VI_PCT[khauVi]
  const vonMoiLenh = vonBanDau * (khauViPct / 100)
  const soMa = khauViPct > 0 ? Math.round(100 / khauViPct) : 0
  const thietHaiToiDa = vonMoiLenh * (sanPct / 100)
  return { khauViPct, vonMoiLenh, soMa, thietHaiToiDa }
}
