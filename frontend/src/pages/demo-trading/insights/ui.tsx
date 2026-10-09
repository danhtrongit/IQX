/**
 * Shared presentational primitives for the insight panels: one card shell, one
 * section header, tiles/rows and honest loading/error lines.
 */
import type { ReactNode } from "react"
import { CircleAlert, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { CARD, HINT, NOTE, SECTION_HEADER } from "./copy"

export function SectionCard({ title, flag, children }: { title: string; flag?: string; children: ReactNode }) {
  return (
    <Card className={cn(CARD, "min-w-0")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={SECTION_HEADER}>{title}</span>
        {flag && (
          <Badge variant="outline" className="h-4 px-1.5 text-xs font-semibold">
            {flag}
          </Badge>
        )}
      </div>
      {children}
    </Card>
  )
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "accent" }) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-xs break-words text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-heading text-lg font-extrabold tabular-nums",
          tone === "up" && "text-price-up",
          tone === "down" && "text-price-down",
          tone === "accent" && "text-primary"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs break-words text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function KeyValueRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "accent" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium tabular-nums",
          tone === "up" && "text-price-up",
          tone === "down" && "text-price-down",
          tone === "accent" && "text-primary"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function LoadingLine({ label }: { label: string }) {
  return (
    <p className={cn(NOTE, "flex items-center gap-1.5")}>
      <LoaderCircle className="size-3.5 animate-spin" />
      {label}
    </p>
  )
}

export function ErrorLine({ text, onRetry, retryLabel = "Thử lại" }: { text: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
      <p className="flex items-start gap-1.5 text-xs text-destructive">
        <CircleAlert className="mt-px size-3.5 shrink-0" />
        {text}
      </p>
      {onRetry && (
        <Button variant="outline" size="xs" onClick={onRetry}>
          <RefreshCw className="size-3" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export function NoteLine({ children, tone }: { children: ReactNode; tone?: "warn" | "good" }) {
  if (tone === "warn") {
    return (
      <p className={cn("flex items-start gap-1.5 text-xs text-price-ref")}>
        <TriangleAlert className="mt-px size-3.5 shrink-0" />
        <span>{children}</span>
      </p>
    )
  }
  return <p className={cn(NOTE, tone === "good" && "text-price-up")}>{children}</p>
}

export function HintLine({ children }: { children: ReactNode }) {
  return <p className={HINT}>{children}</p>
}
