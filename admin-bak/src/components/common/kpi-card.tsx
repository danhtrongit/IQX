import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  label: string
  value: string | number
  subText?: string
  icon?: LucideIcon
  trend?: {
    value: number // percentage change
    label?: string
  }
  className?: string
  loading?: boolean
}

export function KpiCard({
  label,
  value,
  subText,
  icon: Icon,
  trend,
  className,
  loading = false,
}: KpiCardProps) {
  const isPositive = trend && trend.value >= 0

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <div className="mt-1.5 h-7 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
            )}
            {subText && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subText}</p>
            )}
          </div>
          {Icon && (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-5 text-primary" />
            </div>
          )}
        </div>
        {trend && !loading && (
          <div
            className={cn(
              "mt-3 flex items-center gap-1 text-xs font-medium",
              isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
            )}
          >
            {isPositive ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {trend.value.toFixed(1)}%
            </span>
            {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
