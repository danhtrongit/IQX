/**
 * Five-step status scale (1 = rất yếu … 5 = rất tích cực). Exactly one segment
 * is lit per layer; the lit segment carries the tone for that step.
 */
import { cn } from "@/lib/utils"

type StatusLevel = 1 | 2 | 3 | 4 | 5

const STEPS: readonly StatusLevel[] = [1, 2, 3, 4, 5]

const SEGMENT_TONE: Record<StatusLevel, string> = {
  1: "bg-price-down",
  2: "bg-price-down/70",
  3: "bg-muted-foreground",
  4: "bg-price-up/70",
  5: "bg-price-up",
}

export function StatusScale({ level }: { level: StatusLevel }) {
  return (
    <span
      role="img"
      aria-label={`bậc ${level} trên 5`}
      className="inline-flex items-center gap-0.5"
    >
      {STEPS.map((step) => (
        <span
          key={step}
          data-seg={step}
          data-active={step === level}
          className={cn(
            "block h-1 w-3.5 rounded-sm",
            step === level ? SEGMENT_TONE[level] : "bg-muted",
          )}
        />
      ))}
    </span>
  )
}
