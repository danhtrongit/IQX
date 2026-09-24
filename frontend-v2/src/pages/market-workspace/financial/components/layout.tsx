import type { ReactNode } from "react"

import { colorVar } from "../charts/chart-tokens"
import { fmtMetricValue, isNum, pct, peerOf, tyLabel } from "../format"
import type { BctcMetric, BctcTotal } from "../types"
import { MetricCard } from "./metric-card"

/* ── metric row (1 ô / chỉ tiêu, kèm thanh so ngành khi có trung vị) ───────── */

export function MetricRow({ items }: { items: BctcMetric[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      {items.map((m) => (
        <MetricCard key={m.key} label={m.label} value={fmtMetricValue(m)} peer={peerOf(m)} />
      ))}
    </div>
  )
}

/* ── labelled horizontal bars (asset mix / growth sources / income mix) ────── */

export interface BarRow {
  label: string
  pct: number | null
  valueLabel?: string
  cls?: string
}

export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const width = isNum(r.pct) ? Math.max(0, Math.min(100, r.pct * 100)) : 0
        return (
          <div
            className="grid grid-cols-[104px_minmax(0,1fr)_72px] items-center gap-2 sm:grid-cols-[168px_minmax(0,1fr)_96px] sm:gap-3"
            key={i}
          >
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="block h-3 overflow-hidden rounded-sm bg-muted">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${width}%`, background: colorVar(r.cls) }}
              />
            </span>
            <span className="text-right text-xs tabular-nums">{r.valueLabel ?? pct(r.pct)}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── totals row (3 big numbers, "gấp N lần" growth multiple) ───────────────── */

export function Totals({ items }: { items: BctcTotal[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      {items.map((t, i) => (
        <div className="rounded-sm bg-background p-4" key={i}>
          <div className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t.label}
          </div>
          <div className="mt-1.5 mb-0.5 font-heading text-xl font-medium tabular-nums">
            {tyLabel(t.value)}
          </div>
          {isNum(t.mult) ? (
            <div className="text-xs text-price-up tabular-nums">gấp {t.mult.toFixed(1)} lần</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* ── legend (stacked-bar key) ──────────────────────────────────────────────── */

export function Legend({ items }: { items: Array<{ label: string; cls: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map((it, i) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" key={i}>
          <span
            className="size-[9px] shrink-0 rounded-[2px]"
            style={{ background: colorVar(it.cls) }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/* ── panel label (small uppercase caption with a token dot) ────────────────── */

export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      {children}
    </div>
  )
}
