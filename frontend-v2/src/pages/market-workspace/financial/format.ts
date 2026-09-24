/**
 * Display adapters for the BCTC dashboard. Every value the renderer prints goes
 * through one of these — the payload is the only source of numbers, and a
 * missing figure renders as "—" rather than a guess.
 */
import type { MetricPeer } from "./components/metric-card"
import { fmtNum, round } from "./charts/chart-tokens"
import type { LineSeries } from "./charts/line-chart"
import type { PeerMarker, PeerRow } from "./charts/peer-bar"
import type { BctcMetric, BctcPeerRow } from "./types"

/** Finite-number guard — the compute layer may leave any field null. */
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** fraction → "24.1%" (or "—") */
export function pct(v: number | null | undefined, dp = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(dp)}%` : "—"
}

/** VND → tỷ (number) for chart scaling. */
export function ty(v: number | null | undefined): number {
  return isNum(v) ? v / 1e9 : 0
}

/** VND → "12,345 tỷ" (or "—") */
export function tyLabel(v: number | null | undefined): string {
  return isNum(v) ? `${fmtNum(v / 1e9)} tỷ` : "—"
}

/** green | amber | red → good | warn | bad (chart bands). */
export function bandOf(color?: string | null): string | undefined {
  switch (color) {
    case "green":
      return "good"
    case "amber":
      return "warn"
    case "red":
      return "bad"
    default:
      return undefined
  }
}

/** Infer a display unit for metrics that don't carry one (valuation P/E, P/B…). */
export function inferUnit(m: BctcMetric): string {
  if (m.unit) return m.unit
  const k = m.key.toLowerCase()
  if (k.includes("pe") || k.includes("pb")) return "x"
  return "%"
}

export function fmtMetricValue(m: BctcMetric): string {
  if (!isNum(m.value)) return "—"
  const u = inferUnit(m)
  if (u === "%") return `${(m.value * 100).toFixed(1)}%`
  if (u === "x" || u === "×") return `${m.value.toFixed(2)}×`
  return fmtNum(m.value)
}

/** Build the industry-compare track for a MetricCard, when a peer median exists. */
export function peerOf(m: BctcMetric): MetricPeer | undefined {
  if (!isNum(m.value) || !isNum(m.peer_median)) return undefined
  const scale = Math.max(Math.abs(m.value), Math.abs(m.peer_median)) * 1.5 || 1
  return {
    you: (m.value / scale) * 100,
    median: (m.peer_median / scale) * 100,
    caption: "Trung vị ngành",
    band: bandOf(m.color),
  }
}

/** LineChart series from a {year,value} history, dropping nulls. */
export function toLine(
  rows: Array<{ year: number; value: number | null }>,
  cls: string,
  label = "",
  scale: (v: number) => number = (v) => v,
): LineSeries {
  return {
    label,
    cls,
    points: rows.flatMap((r) => {
      const value = r.value
      if (!isNum(value)) return []
      return [{ x: r.year, y: round(scale(value)) }]
    }),
  }
}

/** PeerBar rows from compute peer rows — infer the marker from the label. */
export function toPeerRows(peer: BctcPeerRow[]): PeerRow[] {
  return peer.flatMap((p) => {
    const value = p.value
    if (!isNum(value)) return []
    const label = p.label.toLowerCase()
    let marker: PeerMarker = "company"
    if (label.includes("trung vị") || label.includes("ngành")) marker = "median"
    else if (label.includes("ngưỡng") || label.includes("cảnh báo")) marker = "threshold"
    return [{ label: p.label, value, marker }]
  })
}
