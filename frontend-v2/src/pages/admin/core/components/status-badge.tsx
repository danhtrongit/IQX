import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { labelForStatus, statusTone, type StatusTone } from "../labels"

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-price-up/35 bg-price-up/10 text-price-up",
  warning: "border-accent/45 bg-accent/15 text-price-ref",
  danger: "border-destructive/35 bg-destructive/12 text-destructive",
  info: "border-primary/35 bg-primary/10 text-primary",
  neutral: "border-border bg-muted text-muted-foreground",
}

/** Status/enum pill. Unknown values render verbatim instead of being guessed. */
export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string | boolean | null | undefined
  label?: string
  tone?: StatusTone
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone ?? statusTone(status)], className)}>
      {label ?? labelForStatus(status)}
    </Badge>
  )
}
