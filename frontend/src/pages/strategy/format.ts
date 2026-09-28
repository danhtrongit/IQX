/**
 * Định dạng số cho bộ backtest — port từ `dashboard/src/features/backtest/format.ts`.
 *
 * Giá trị thiếu luôn render "—" (không bao giờ thành 0) và số theo chuẩn en-US
 * để cột số thẳng hàng; `tabular-nums` do lớp CSS của bảng đảm nhiệm.
 */
import type { Factor } from "./types"

export const fmtSignedPct = (value: number | null | undefined, digits = 1): string =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`

export const fmtNum = (value: number | null | undefined, digits = 2): string =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits)

export const fmtPrice = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US")

/** Ô nhập vốn: bỏ mọi ký tự không phải số rồi đọc thành VND. */
export const parseMoney = (text: string): number => Number(text.replace(/[^\d]/g, "")) || 0

/** Đổi giá trị người dùng gõ (đã theo đơn vị hiển thị) về tỉ lệ backend lưu. */
export function toStoredValue(factor: Factor, display: number): number {
  return factor.isPercent ? display / 100 : display
}

/** Ngưỡng hiển thị trong input của factor `num` (có xử lý đơn vị phần trăm). */
export function toDisplayValue(factor: Factor, stored: number): number {
  return factor.isPercent ? Number((stored * 100).toFixed(2)) : stored
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` (mọi định dạng khác giữ nguyên). */
export function fmtDateVN(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [year, month, day] = iso.slice(0, 10).split("-")
  return day && month && year ? `${day}/${month}/${year}` : iso
}

/** `fired_at` ISO → `DD/MM/YYYY HH:mm` theo giờ máy người dùng. */
export function fmtDateTimeVN(iso: string | null | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toLocaleDateString("vi-VN")} ${date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}
