import type { SeriesRole } from "./chart-math"

/**
 * Series colour roles of the chart models, mapped to theme tokens (never to the hex values of the
 * handoff HTML). Colour is never the only signal: dashed series, the legend and the data table carry
 * the same information. Class names are written out in full so Tailwind can see them.
 */
export const ROLE_STROKE: Record<SeriesRole, string> = {
  price: "stroke-foreground",
  p1: "stroke-chart-1",
  p2: "stroke-chart-2",
  p3: "stroke-muted-foreground",
  pos: "stroke-price-up",
  neg: "stroke-price-down",
}

export const ROLE_FILL: Record<SeriesRole, string> = {
  price: "fill-foreground",
  p1: "fill-chart-1",
  p2: "fill-chart-2",
  p3: "fill-muted-foreground",
  pos: "fill-price-up",
  neg: "fill-price-down",
}

/** Tone of a bar of a `series_panels` panel. */
export const BAR_FILL = {
  pos: "fill-price-up",
  neg: "fill-price-down",
  neutral: "fill-muted-foreground",
} as const

/** Categorical colours of the series of a category chart, in order. */
export const CATEGORY_FILL = ["fill-chart-1", "fill-chart-2", "fill-muted-foreground", "fill-price-up", "fill-price-down"] as const
export const CATEGORY_STROKE = [
  "stroke-chart-1",
  "stroke-chart-2",
  "stroke-muted-foreground",
  "stroke-price-up",
  "stroke-price-down",
] as const
/** Dash patterns that differentiate series without relying on colour. */
export const CATEGORY_DASH = [undefined, "6 4", "2 3", "8 3 2 3", "1 4"] as const

export const WATERFALL_FILL = {
  total: "fill-chart-1",
  up: "fill-price-up",
  down: "fill-price-down",
} as const
