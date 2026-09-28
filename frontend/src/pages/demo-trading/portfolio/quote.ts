/**
 * Diễn giải `MarketQuote` (hợp đồng `market/use-quote.ts`) cho các hàng giá của
 * panel Danh mục.
 *
 * Mức thay đổi dùng thẳng `quoteChange` của panel thị trường — một quy ước duy
 * nhất cho "giá so với giá tham chiếu", và cùng quy ước "chưa biết": backend trả
 * `price = null` khi mã chưa khớp phiên này, `reference = null` khi không có giá
 * tham chiếu; mọi giá trị suy ra từ chúng đều là `null` để UI render "—" thay vì
 * bịa ra 0.
 */
import { quoteChange, type QuoteTone } from "@/pages/demo-trading/market/use-quote"
import type { MarketQuote } from "@/pages/demo-trading/types"

/** Thang màu cho mức thay đổi — khớp `QuoteSummary` của panel thị trường. */
export const QUOTE_TONE_CLASS: Record<QuoteTone, string> = {
  up: "text-price-up",
  down: "text-price-down",
  ref: "text-price-ref",
}

/**
 * Giá để hiển thị: giá khớp gần nhất, hoặc giá tham chiếu khi phiên chưa khớp
 * (chuẩn bảng giá VN). `null` khi không có cả hai.
 */
export function displayPrice(quote: MarketQuote | null | undefined): number | null {
  return quote?.price ?? quote?.reference ?? null
}

/** Màu giá theo biên độ trần/sàn — cùng thang màu với bảng giá. */
export function priceToneClass(quote: MarketQuote | null | undefined): string {
  const price = quote?.price
  if (price == null) return "text-muted-foreground"
  if (quote?.ceiling != null && price >= quote.ceiling) return "text-price-ceiling"
  if (quote?.floor != null && price <= quote.floor) return "text-price-floor"
  const tone = quoteChange(quote)?.tone
  return tone ? QUOTE_TONE_CLASS[tone] : "text-foreground"
}
