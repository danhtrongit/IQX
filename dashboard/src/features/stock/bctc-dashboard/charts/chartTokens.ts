/**
 * Shared helpers for the BCTC dark-theme chart primitives.
 *
 * SPEC §5 hard rule: every fill/stroke in a chart SVG must reference a CSS
 * custom property (e.g. `var(--green)`), never a raw hex literal. These
 * helpers map the semantic colour keys that callers pass (matching the
 * template's `fill-g` / `fill-a` / `fill-r` classes) onto token references so
 * no component ever emits a hex string.
 */

/** Semantic colour keys accepted for a chart segment / series. */
export type ColorKey = string

const CLS_MAP: Record<string, string> = {
  // template class names
  "fill-g": "var(--green)",
  "fill-a": "var(--amber)",
  "fill-r": "var(--red)",
  "fill-accent": "var(--accent)",
  "fill-neutral": "var(--line-strong)",
  // shorthand / semantic aliases
  g: "var(--green)",
  green: "var(--green)",
  good: "var(--green)",
  a: "var(--amber)",
  amber: "var(--amber)",
  warn: "var(--amber)",
  r: "var(--red)",
  red: "var(--red)",
  bad: "var(--red)",
  accent: "var(--accent)",
  neutral: "var(--line-strong)",
  line: "var(--line-strong)",
}

/**
 * Resolve a caller-supplied colour key to a CSS-var reference.
 * Unknown keys fall back to `--accent`; an explicit `var(...)` passes through.
 */
export function colorVar(cls: ColorKey | undefined, fallback = "var(--accent)"): string {
  if (!cls) return fallback
  if (cls.startsWith("var(")) return cls
  return CLS_MAP[cls] ?? fallback
}

/** Qualitative band → semantic token (used by the radar & peer markers). */
export function bandVar(band: string | undefined): string {
  return colorVar(band, "var(--accent)")
}

/** Deterministic thousands separator (locale-independent, jsdom-safe). */
export function fmtNum(n: number): string {
  const rounded = Math.round(n)
  const neg = rounded < 0
  const s = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return neg ? `-${s}` : s
}

/** Clamp to a finite non-negative number (guards NaN / negative bar heights). */
export function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Build an SVG `points` string from [x,y] pairs. */
export function toPoints(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")
}

/** Round to 2dp and strip trailing zeros so output stays compact & NaN-free. */
export function round(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
