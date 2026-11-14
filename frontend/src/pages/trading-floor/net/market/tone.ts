import type { IndexQuote, PriceTone, Quote } from "./types.ts"

/** Prices are whole VND, so anything closer than this is the same price. */
const SAME_PRICE_VND = 0.5
/** Index moves smaller than this are shown as unchanged. */
const SAME_POINTS = 0.005

/**
 * Vietnamese board colours: ceiling violet, floor cyan, reference amber, above reference green,
 * below reference red. A stock that has not matched yet is shown at its reference price.
 */
export function priceTone(
  quote: Pick<Quote, "price" | "ref" | "ceiling" | "floor" | "traded">
): PriceTone {
  const { price, ref, ceiling, floor } = quote
  if (!quote.traded || price === null || price <= 0) return "ref"
  if (ceiling !== null && ceiling > 0 && price >= ceiling - SAME_PRICE_VND)
    return "ceiling"
  if (floor !== null && floor > 0 && price <= floor + SAME_PRICE_VND)
    return "floor"
  if (ref === null || Math.abs(price - ref) < SAME_PRICE_VND) return "ref"
  return price > ref ? "up" : "down"
}

/** Colour of a signed index change. */
export function indexTone(index: Pick<IndexQuote, "change">): PriceTone {
  if (Math.abs(index.change) < SAME_POINTS) return "ref"
  return index.change > 0 ? "up" : "down"
}

/** Dark-theme `--price-*` tokens of iqx.vn (frontend/src/index.css). Immutable exchange colours. */
export const PRICE_COLORS: Readonly<Record<PriceTone, string>> = {
  up: "#32d74b",
  down: "#ff453a",
  ref: "#ffd60a",
  ceiling: "#bf5af2",
  floor: "#64d2ff",
}
