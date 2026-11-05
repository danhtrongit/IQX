/**
 * Chỉ báo của IQLine (docs/iqline-design.md §9): 24 chỉ báo, sổ đăng ký, kiểm tra tham số và ghi nhớ kết quả.
 * Nhập module này là đăng ký sẵn cả 24 chỉ báo. Thư mục này chỉ phụ thuộc `../types`.
 */
import type { Bar, ChartIndicatorInput, ColorToken, IndicatorPlot } from "../types"
import { DEFAULT_PALETTE } from "./cache"
import { registerBuiltinFormulas } from "./definitions"
import { getIndicator, resolveIndicatorParams, validateIndicatorParams } from "./registry"
import { registerVolumeProfile } from "./volume-profile"

registerBuiltinFormulas()
registerVolumeProfile()

export { createIndicatorCache, DEFAULT_PALETTE, type IndicatorCache, type IndicatorCacheStats } from "./cache"
export { emptyPlot, getIndicator, indicatorTailMemory, listIndicators, paramsKey, registerIndicator, resolveIndicatorParams, unregisterIndicator, validateIndicatorParams, type IndicatorOptions } from "./registry"
export { computeVolumeProfile, DEFAULT_PROFILE_ROWS, VOLUME_PROFILE_ID, type ProfileRange, type ProfileRow } from "./volume-profile"

/** Tính một chỉ báo không qua ghi nhớ. `null` nếu id lạ hoặc tham số sai. */
export function computeIndicator(input: Pick<ChartIndicatorInput, "id" | "params">, bars: readonly Bar[], palette: readonly ColorToken[] = DEFAULT_PALETTE): IndicatorPlot | null {
  const definition = getIndicator(input.id)
  if (!definition || validateIndicatorParams(input.id, input.params)) return null
  const params = resolveIndicatorParams(input.id, input.params)
  return params ? definition.compute(bars, params, palette) : null
}
