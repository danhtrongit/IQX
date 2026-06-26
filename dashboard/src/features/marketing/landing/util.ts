import type { Tone } from "./data"

export const toneColor: Record<Tone, string> = {
  up: "var(--lp-up)",
  down: "var(--lp-down)",
  warn: "var(--lp-gold)",
  flat: "var(--lp-t3)",
}

export const toneSoft: Record<Tone, string> = {
  up: "var(--lp-up-soft)",
  down: "var(--lp-down-soft)",
  warn: "var(--lp-gold-soft)",
  flat: "var(--lp-bg-2)",
}

/** Build a sparkline `line` + `area` path string for an SVG of size w×h. */
export function buildSpark(values: number[], w: number, h: number, pad = 4) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (w - pad * 2) / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`
  return { line, area, pts }
}
