import type { LessonBlock } from "../content-types"

/** Block tones of the content schema (`cardToneSchema`): cards, table cells, definitions, stats. */
export type CardTone = NonNullable<Extract<LessonBlock, { type: "cards" }>["items"][number]["tone"]>

/**
 * Text colour per tone. `pos`/`neg` are the mockup's up/down cards (market meaning), `good`/`bad`
 * its do/don't cards, `info` the blue group and `violet` the violet group of colour-coded lists.
 */
export const CARD_TONE_TEXT: Record<CardTone, string> = {
  neutral: "text-foreground",
  highlight: "text-chart-1",
  pos: "text-price-up",
  neg: "text-price-down",
  good: "text-(--status-success)",
  bad: "text-destructive",
  warn: "text-status-warning",
  info: "text-chart-1",
  violet: "text-chart-7",
}

/** Card frame per tone: a tinted border, plus a light fill for the highlighted card. */
export const CARD_TONE_FRAME: Record<CardTone, string> = {
  neutral: "border-border",
  highlight: "border-chart-1/60 bg-chart-1/5",
  pos: "border-price-up/45",
  neg: "border-price-down/45",
  good: "border-(--status-success)/45",
  bad: "border-destructive/45",
  warn: "border-status-warning/50",
  info: "border-chart-1/45",
  violet: "border-chart-7/45",
}

/** Small swatch (dot or bar) per tone. */
export const CARD_TONE_BG: Record<CardTone, string> = {
  neutral: "bg-chart-5",
  highlight: "bg-chart-1",
  pos: "bg-price-up",
  neg: "bg-price-down",
  good: "bg-(--status-success)",
  bad: "bg-destructive",
  warn: "bg-status-warning",
  info: "bg-chart-1",
  violet: "bg-chart-7",
}

/** Good / warn / bad states (gauges, ratings, quotes, roleplay bands). */
export const STATE_TEXT = {
  good: "text-(--status-success)",
  ok: "text-(--status-success)",
  mid: "text-status-warning",
  warn: "text-status-warning",
  bad: "text-destructive",
  neutral: "text-foreground",
} as const

export const STATE_BG = {
  good: "bg-(--status-success)",
  ok: "bg-(--status-success)",
  mid: "bg-status-warning",
  warn: "bg-status-warning",
  bad: "bg-destructive",
  neutral: "bg-chart-5",
} as const

export const STATE_BORDER = {
  good: "border-(--status-success)/50",
  ok: "border-(--status-success)/50",
  mid: "border-status-warning/50",
  warn: "border-status-warning/50",
  bad: "border-destructive/50",
  neutral: "border-border",
} as const
