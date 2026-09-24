/**
 * Shared helpers for the BCTC chart primitives.
 *
 * Every fill/stroke in a chart SVG must reference a design token — never a raw
 * hex literal. These helpers map the legacy semantic colour keys that the block
 * bodies pass (`fill-g` / `fill-a` / `good` / `warn` …) onto the IQX chart
 * tokens, so the ported call sites read exactly like the legacy renderer while
 * the emitted values are `var(--chart-*)`.
 */

/** Semantic colour key accepted for a chart segment / series. */
export type ColorKey = string

const TOKEN_MAP: Record<string, string> = {
  // legacy template class names → IQX chart tokens
  "fill-g": "var(--chart-3)", // xanh — tốt / tăng
  "fill-a": "var(--chart-2)", // vàng — trung tính / nợ
  "fill-r": "var(--chart-4)", // đỏ — xấu / giảm
  "fill-accent": "var(--chart-1)", // xanh dương — nhấn
  "fill-neutral": "var(--chart-5)", // xám — nền / trung vị
  // shorthand / semantic aliases
  g: "var(--chart-3)",
  green: "var(--chart-3)",
  good: "var(--chart-3)",
  a: "var(--chart-2)",
  amber: "var(--chart-2)",
  warn: "var(--chart-2)",
  r: "var(--chart-4)",
  red: "var(--chart-4)",
  bad: "var(--chart-4)",
  accent: "var(--chart-1)",
  neutral: "var(--chart-5)",
  line: "var(--chart-5)",
}

/**
 * Resolve a caller-supplied colour key to a token reference.
 * Unknown keys fall back to the accent token; an explicit `var(...)` passes
 * through untouched.
 */
export function colorVar(cls: ColorKey | undefined, fallback = "var(--chart-1)"): string {
  if (!cls) return fallback
  if (cls.startsWith("var(")) return cls
  return TOKEN_MAP[cls] ?? fallback
}

/** Qualitative band → token (radar polygon, per-axis bars, peer markers). */
export function bandVar(band: string | undefined): string {
  return colorVar(band, "var(--chart-1)")
}

/** Deterministic thousands separator (locale-independent). */
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

/** Round to 2dp so coordinates stay compact and NaN-free. */
export function round(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}
