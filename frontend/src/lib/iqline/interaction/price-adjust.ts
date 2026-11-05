/**
 * Co giãn trục giá bằng tay (§7 "Co giãn trục"). `InteractionState.priceScale[paneKey]` là hệ số nhân khoảng giá quanh tâm khung:
 * 1 hoặc vắng mặt là tự co giãn. Hàm này đổi dải tự co giãn của scene (`frame.price.range`) sang `ViewState.manualPriceRange`.
 */
import { zoomPriceRange, type PriceRange } from "../core/price-scale"

/** Dải giá sau khi kéo tay; null khi để tự co giãn (hệ số vắng mặt hoặc bằng 1) để scene tự tính theo nến đang hiện. */
export function manualPriceRange(auto: PriceRange, scale: number | undefined): PriceRange | null {
  if (scale === undefined || !Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 1e-9) return null
  return zoomPriceRange(auto, scale, 0.5)
}
