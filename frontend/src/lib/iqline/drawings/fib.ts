/**
 * Mức và nhãn Fibonacci (chuyển từ flashback-drawings.ts, spec Flashback v2.1 §7.3).
 *
 * Màu là tên token. Bản cũ dùng chart-3 và chart-4 (cùng giá trị với màu tăng giảm) và chart-7 (dành cho lớp AI);
 * bản này chỉ dùng chart-1, chart-2, chart-5, chart-6 và chart-8 (docs/iqline-design.md §7).
 */
import type { ColorToken } from "../types"

export type FibLevel = { level: number; token: ColorToken }

/** 7 mức Fibonacci thoái lui. */
export const FIB_RETRACEMENT_LEVELS: readonly FibLevel[] = [
  { level: 0, token: "chart-5" },
  { level: 0.236, token: "chart-6" },
  { level: 0.382, token: "chart-2" },
  { level: 0.5, token: "chart-8" },
  { level: 0.618, token: "chart-1" },
  { level: 0.786, token: "chart-6" },
  { level: 1, token: "chart-5" },
]

/** 7 mức Fibonacci mở rộng, đo bằng đoạn A đến B tính từ điểm C. */
export const FIB_EXTENSION_LEVELS: readonly FibLevel[] = [
  { level: 0, token: "chart-5" },
  { level: 0.618, token: "chart-6" },
  { level: 1, token: "chart-2" },
  { level: 1.272, token: "chart-8" },
  { level: 1.618, token: "chart-1" },
  { level: 2, token: "chart-6" },
  { level: 2.618, token: "chart-5" },
]

/** Vùng 38,2 đến 61,8% của Fibonacci thoái lui được tô nhạt. */
export const FIB_ZONE = [0.382, 0.618] as const
export const FIB_ZONE_TOKEN: ColorToken = "chart-1"

/** Token không được dùng cho Fibonacci (§7). */
export const FIB_FORBIDDEN_TOKENS: readonly ColorToken[] = ["chart-3", "chart-4", "chart-7"]

/** Giá tại mức L = giá cuối - (giá cuối - giá đầu) x L: điểm đầu là 100%, điểm cuối là 0%. */
export function fibRetracementPrice(startPrice: number, endPrice: number, level: number): number {
  return endPrice - (endPrice - startPrice) * level
}

/** Giá tại mức L của Fibonacci mở rộng: C + (B - A) x L. */
export function fibExtensionPrice(aPrice: number, bPrice: number, cPrice: number, level: number): number {
  return cPrice + (bPrice - aPrice) * level
}

const priceFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

/** Định dạng giá mặc định khi bên dùng không đưa `formatPrice`. */
export function defaultFormatPrice(price: number): string {
  return Number.isFinite(price) ? priceFormat.format(price) : "-"
}

/** "61,8% · 25.630": mức nguyên không có số lẻ, còn lại một chữ số thập phân; giá qua `formatPrice`. */
export function fibLabel(level: number, price: number, formatPrice: (price: number) => string = defaultFormatPrice): string {
  const percent = Math.round(level * 1000) / 10
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(".", ",")
  return `${text}% · ${formatPrice(price)}`
}
