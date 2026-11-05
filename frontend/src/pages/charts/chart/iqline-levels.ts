/** Đường tham chiếu, trần và sàn cho IQLine, đổi từ bảng giá về cùng đơn vị với nến (docs/iqline-design.md §8). */
import type { PriceLevels } from "@/lib/iqline/scene/colors"

import { INDEX_SYMBOLS } from "./market-symbols"

type QuoteLevels = { reference: number | null; ceiling: number | null; floor: number | null }

/**
 * Bảng giá trả VND, nến OHLCV của cổ phiếu tính theo nghìn đồng, nên chia 1.000 để các đường nằm đúng chỗ trên trục giá.
 * Chỉ số không có trần sàn nên không vẽ gì. `undefined` khi chưa có mức nào.
 */
export function priceLevelsFromQuote(symbol: string, quote: QuoteLevels | null | undefined): PriceLevels | undefined {
  if (!quote || INDEX_SYMBOLS[symbol.toUpperCase()] === true) return undefined
  const levels: PriceLevels = {}
  if (quote.reference !== null) levels.reference = quote.reference / 1000
  if (quote.ceiling !== null) levels.ceiling = quote.ceiling / 1000
  if (quote.floor !== null) levels.floor = quote.floor / 1000
  return Object.keys(levels).length > 0 ? levels : undefined
}
