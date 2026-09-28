import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** One KPI in a data-heavy strip: label, big number, one supporting line. */
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading = false,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: "default" | "success" | "warning" | "danger"
  loading?: boolean
  className?: string
}) {
  return (
    <Card
      size="sm"
      className={cn("gap-0 py-3 ring-1 ring-border/60 ring-inset dark:ring-0", className)}
    >
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] leading-4 font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-24" />
          ) : (
            <p
              className={cn(
                "mt-1 font-heading text-xl leading-7 font-semibold tabular-nums",
                tone === "success" && "text-price-up",
                tone === "warning" && "text-price-ref",
                tone === "danger" && "text-destructive",
              )}
            >
              {value}
            </p>
          )}
          {hint && !loading && (
            <p className="mt-1 text-xs leading-4 text-muted-foreground">{hint}</p>
          )}
        </div>
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </CardContent>
    </Card>
  )
}
