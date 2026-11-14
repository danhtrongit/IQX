import type { IndexQuote, Quote } from "./types.ts"
import { priceTone } from "./tone.ts"

/** Percent at which a heatmap tile reaches its brightest shade. */
const FULL_PCT = 3

export interface HeatColour {
  /** Tile background, `#rrggbb`. */
  bg: string
  /** Text on the tile. */
  fg: string
}

const hex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
const mix = (a: number[], b: number[], t: number): number[] =>
  a.map((v, i) => v + (b[i] - v) * t)

const UP_DIM = [42, 92, 56]
const UP_FULL = [46, 204, 96]
const DOWN_DIM = [92, 38, 34]
const DOWN_FULL = [196, 48, 40]

/** Heatmap colour of a stock tile: shade grows with the move, ceiling violet, floor cyan, unchanged yellow. */
export function heatColour(
  quote: Pick<Quote, "price" | "ref" | "ceiling" | "floor" | "traded" | "pct">
): HeatColour {
  const tone = priceTone(quote)
  if (tone === "ceiling") return { bg: "#a64fd6", fg: "#ffffff" }
  if (tone === "floor") return { bg: "#2fa9cf", fg: "#ffffff" }
  if (tone === "ref") return { bg: "#f5e21a", fg: "#2a2400" }
  const t = Math.min(1, Math.abs(quote.pct) / FULL_PCT)
  const [r, g, b] =
    tone === "up" ? mix(UP_DIM, UP_FULL, t) : mix(DOWN_DIM, DOWN_FULL, t)
  return { bg: hex(r, g, b), fg: "#ffffff" }
}

/** "Market weather" next to VN-Index. */
export function marketWeather(
  index: Pick<IndexQuote, "pct"> | null | undefined
): { icon: string; label: string } {
  const pct = index?.pct ?? 0
  if (pct >= 0.5) return { icon: "☀️", label: "Nắng" }
  if (pct > 0) return { icon: "🌤️", label: "Hửng nắng" }
  if (pct > -0.5) return { icon: "☁️", label: "Nhiều mây" }
  return { icon: "🌧️", label: "Mưa" }
}

/** Prices on the heatmap: thousands with two decimals, Vietnamese comma ("24,34"). */
export function heatPrice(vnd: number | null): string {
  return vnd && vnd > 0 ? (vnd / 1000).toFixed(2).replace(".", ",") : "—"
}

export function heatPct(pct: number): string {
  const s = Math.abs(pct).toFixed(2).replace(".", ",")
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${s}%`
}
