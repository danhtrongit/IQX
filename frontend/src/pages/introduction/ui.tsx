/**
 * Shared building blocks for the introduction page.
 *
 * Shape discipline: every panel is `rounded-lg` (matching the design system's
 * card radius) and every interactive control uses the shared shadcn primitives.
 * Tone colours come from the semantic price tokens so light/dark both hold.
 */

import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { Tone } from "./content"

export function toneText(tone: Tone) {
  if (tone === "up") return "text-price-up"
  if (tone === "down") return "text-price-down"
  if (tone === "warn") return "text-price-ref"
  return "text-muted-foreground"
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
}

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("border-t border-border", className)}>
      {children}
    </section>
  )
}

/** Headline stacked above its lead paragraph. Never a split header. */
export function SectionHead({
  title,
  lead,
  className,
}: {
  title: string
  lead?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {lead && <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{lead}</p>}
    </div>
  )
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-card p-4 sm:p-5", className)}>{children}</div>
}

/** Provenance line for sample data. Functional, never decorative. */
export function Caption({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-xs leading-5 text-muted-foreground", className)}>{children}</p>
}

export function TierBadge({ tier }: { tier: "free" | "premium" }) {
  return (
    <Badge variant={tier === "premium" ? "gold" : "secondary"} className="shrink-0">
      {tier === "premium" ? "Premium" : "Miễn phí"}
    </Badge>
  )
}

/* ── Two-series line chart (backtest equity) ────────────────────────────── */

export function LineChart({
  series,
  height = 168,
}: {
  series: readonly { points: readonly number[]; stroke: string; swatch: string; label: string }[]
  height?: number
}) {
  const all = series.flatMap((s) => [...s.points])
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const step = 600 / Math.max((series[0]?.points.length ?? 2) - 1, 1)

  const path = (points: readonly number[]) =>
    points
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${(20 + (1 - (value - min) / span) * 160).toFixed(1)}`,
      )
      .join(" ")

  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between py-0.5 text-[11px] leading-none tabular-nums text-muted-foreground">
        <span>{max}</span>
        <span>{min}</span>
      </div>
      <div className="min-w-0 flex-1">
        <svg
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`Diễn biến vốn, base 100: ${series.map((s) => s.label).join(" và ")}`}
        >
          {[20, 100, 180].map((y) => (
            <rect key={y} x="0" y={y} width="600" height="1" className="fill-border" />
          ))}
          {series.map((s) => (
            <path
              key={s.label}
              d={path(s.points)}
              fill="none"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className={s.stroke}
            />
          ))}
        </svg>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("h-0.5 w-5 rounded-full", s.swatch)} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Diverging bars (foreign net flow) ──────────────────────────────────── */

export function FlowBars({ values, className }: { values: readonly number[]; className?: string }) {
  const max = Math.max(...values.map((v) => Math.abs(v))) || 1
  const zero = 40
  const slot = 300 / values.length
  const width = slot * 0.6

  return (
    <svg
      viewBox="0 0 300 80"
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      role="img"
      aria-label="Dòng tiền khối ngoại 15 phiên, đơn vị tỷ đồng"
    >
      <rect x="0" y={zero} width="300" height="1" className="fill-border" />
      {values.map((value, index) => {
        const magnitude = (Math.abs(value) / max) * 34
        return (
          <rect
            key={index}
            x={index * slot + (slot - width) / 2}
            y={value >= 0 ? zero - magnitude : zero}
            width={width}
            height={Math.max(magnitude, 1)}
            className={value >= 0 ? "fill-price-up" : "fill-price-down"}
            opacity={0.75}
          />
        )
      })}
    </svg>
  )
}

/* ── Valuation bands with a price marker ────────────────────────────────── */

export function BandChart({
  low,
  high,
  price,
  bands,
}: {
  low: number
  high: number
  price: number
  bands: readonly { label: string; lo: number; hi: number }[]
}) {
  const span = high - low || 1
  const pct = (value: number) => ((value - low) / span) * 100

  return (
    <div>
      <div className="relative space-y-3 pt-5">
        <span
          className="absolute top-0 bottom-6 w-px border-l border-dashed border-primary"
          style={{ left: `${pct(price)}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute top-0 -translate-x-1/2 rounded-sm bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular-nums text-primary-foreground"
          style={{ left: `${pct(price)}%` }}
        >
          {price}
        </span>
        {bands.map((band) => (
          <div key={band.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{band.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {band.lo} đến {band.hi}
              </span>
            </div>
            <div className="relative h-2 rounded-sm bg-muted">
              <span
                className="absolute inset-y-0 rounded-sm bg-primary/30"
                style={{ left: `${pct(band.lo)}%`, width: `${pct(band.hi) - pct(band.lo)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}
