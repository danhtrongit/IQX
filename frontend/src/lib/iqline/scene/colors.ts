/**
 * Luật màu của IQLine (docs/iqline-design.md §7, frontend/DESIGN.md §2.4-§2.5). Scene chỉ chứa tên token.
 *
 * - Nến và khối lượng chỉ dùng `price-up` và `price-down`; đường tham chiếu dùng `price-ref`.
 * - Chỉ báo theo thứ tự `chart-1`, `chart-6`, `chart-8`, `chart-2`, `chart-5`. `chart-7` chỉ dành cho lớp AI.
 * - Biểu đồ có đường trần hoặc sàn thì `chart-6`, `chart-7`, `chart-8` không dùng cho chuỗi khác: bảng màu
 *   tự đổi sang `chart-1`, `chart-2`, `chart-5`.
 * - `labelToken` chọn màu chữ: Flashback và Học viện dùng `academy-label`, nơi khác `muted-foreground`.
 */
import type { ColorToken } from "../types"

export const UP_TOKEN: ColorToken = "price-up"
export const DOWN_TOKEN: ColorToken = "price-down"
export const MAIN_SERIES_TOKEN: ColorToken = "chart-1"
/** Màu duy nhất dành cho lớp AI. */
export const AI_TOKEN: ColorToken = "chart-7"

export const INDICATOR_PALETTE: readonly ColorToken[] = ["chart-1", "chart-6", "chart-8", "chart-2", "chart-5"]
/** Bảng màu khi biểu đồ có đường trần hoặc sàn. */
export const LEVELS_PALETTE: readonly ColorToken[] = ["chart-1", "chart-2", "chart-5"]
const RESERVED_WITH_LEVELS: ReadonlySet<ColorToken> = new Set(["chart-6", "chart-7", "chart-8"])

export type PriceLevels = { reference?: number; ceiling?: number; floor?: number }

export function hasCeilingOrFloor(levels: PriceLevels | undefined | null): boolean {
  return levels?.ceiling != null || levels?.floor != null
}

/** Bảng màu chỉ báo cho `IndicatorDefinition.compute(bars, params, palette)`. */
export function indicatorPalette(levels?: PriceLevels | null): readonly ColorToken[] {
  return hasCeilingOrFloor(levels) ? LEVELS_PALETTE : INDICATOR_PALETTE
}

export function labelColorToken(labelToken?: "muted-foreground" | "academy-label"): ColorToken {
  return labelToken ?? "muted-foreground"
}

/**
 * Chỉ báo có thể đã tính màu bằng bảng khác (hoặc đổi trần/sàn sau khi tính): scene kiểm lại từng chuỗi. Màu
 * cấm (`chart-7` luôn cấm vì dành cho AI; `chart-6`, `chart-8` cấm khi có trần hoặc sàn) được thay bằng màu kế
 * tiếp của bảng màu, theo thứ tự xuất hiện, nên kết quả ổn định giữa các lần vẽ.
 */
export function createSeriesColors(levels: PriceLevels | undefined | null): (token: ColorToken) => ColorToken {
  const withLevels = hasCeilingOrFloor(levels)
  const palette = withLevels ? LEVELS_PALETTE : INDICATOR_PALETTE
  let next = 0
  return (token) => {
    const forbidden = token === AI_TOKEN || (withLevels && RESERVED_WITH_LEVELS.has(token))
    if (!forbidden) return token
    const replacement = palette[next % palette.length]
    next += 1
    return replacement
  }
}
