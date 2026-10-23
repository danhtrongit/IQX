import type { ChartTone } from "../content-types"

/**
 * Colour roles of the v3.3 chart models, mapped to theme tokens (schema.ts §2), never to the hex
 * values of the mockup. Class names are written out in full so Tailwind can see them.
 *
 *   price -> foreground, p1 -> chart-1, p2 -> chart-2, p3 -> chart-5 (lines only), p4 -> chart-7,
 *   p5 -> chart-8, pos -> price-up, neg -> price-down, warn -> chart-2, info -> chart-6,
 *   neutral -> border.
 *
 * Chart text never takes the grey tones: an omitted (or grey) text tone renders with
 * `academy-label`.
 */
export type TextTone = Exclude<ChartTone, "p3" | "neutral">

export const TONE_STROKE: Record<ChartTone, string> = {
  price: "stroke-foreground",
  p1: "stroke-chart-1",
  p2: "stroke-chart-2",
  p3: "stroke-chart-5",
  p4: "stroke-chart-7",
  p5: "stroke-[var(--s2)]",
  pos: "stroke-price-up",
  neg: "stroke-price-down",
  warn: "stroke-chart-2",
  info: "stroke-chart-6",
  neutral: "stroke-border",
}

export const TONE_FILL: Record<ChartTone, string> = {
  price: "fill-foreground",
  p1: "fill-chart-1",
  p2: "fill-chart-2",
  p3: "fill-chart-5",
  p4: "fill-chart-7",
  p5: "fill-[var(--s2)]",
  pos: "fill-price-up",
  neg: "fill-price-down",
  warn: "fill-chart-2",
  info: "fill-chart-6",
  neutral: "fill-border",
}

/** Background of HTML swatches (legend dots, funnel bars, segment bars drawn in HTML). */
export const TONE_BG: Record<ChartTone, string> = {
  price: "bg-foreground",
  p1: "bg-chart-1",
  p2: "bg-chart-2",
  p3: "bg-chart-5",
  p4: "bg-chart-7",
  p5: "bg-[var(--s2)]",
  pos: "bg-price-up",
  neg: "bg-price-down",
  warn: "bg-chart-2",
  info: "bg-chart-6",
  neutral: "bg-border",
}

export const TONE_BORDER: Record<ChartTone, string> = {
  price: "border-foreground",
  p1: "border-chart-1",
  p2: "border-chart-2",
  p3: "border-chart-5",
  p4: "border-chart-7",
  p5: "border-[var(--s2)]",
  pos: "border-price-up",
  neg: "border-price-down",
  warn: "border-chart-2",
  info: "border-chart-6",
  neutral: "border-border",
}

const TEXT_FILL: Record<TextTone, string> = {
  price: "fill-foreground",
  p1: "fill-chart-1",
  p2: "fill-chart-2",
  p4: "fill-chart-7",
  p5: "fill-[var(--s2)]",
  pos: "fill-price-up",
  neg: "fill-price-down",
  warn: "fill-chart-2",
  info: "fill-chart-6",
}

const TEXT_COLOR: Record<TextTone, string> = {
  price: "text-foreground",
  p1: "text-chart-1",
  p2: "text-chart-2",
  p4: "text-chart-7",
  p5: "text-[var(--s2)]",
  pos: "text-price-up",
  neg: "text-price-down",
  warn: "text-chart-2",
  info: "text-chart-6",
}

function isTextTone(tone: ChartTone | undefined): tone is TextTone {
  return tone !== undefined && tone !== "p3" && tone !== "neutral"
}

/** SVG text fill for a tone; grey or missing tones use the academy label colour. */
export function textFill(tone?: ChartTone): string {
  return isTextTone(tone) ? TEXT_FILL[tone] : "fill-academy-label"
}

/** HTML text colour for a tone; grey or missing tones use the academy label colour. */
export function textColor(tone?: ChartTone): string {
  return isTextTone(tone) ? TEXT_COLOR[tone] : "text-academy-label"
}

/** Title text (node, milestone, caption): a grey or missing tone falls back to foreground. */
export function titleColor(tone?: ChartTone): string {
  return isTextTone(tone) ? TEXT_COLOR[tone] : "text-foreground"
}

export function titleFill(tone?: ChartTone): string {
  return isTextTone(tone) ? TEXT_FILL[tone] : "fill-foreground"
}

/** Neutral chart text (ticks, axis titles, labels without a tone). */
export const LABEL_FILL = "fill-academy-label"
export const LABEL_TEXT = "text-academy-label"
/** Grid lines and baselines. */
export const GRID_STROKE = "stroke-border"
export const DASH = "5 4"
