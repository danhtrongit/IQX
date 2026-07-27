import { Button } from "@arco-design/web-react"
import { IconQuestionCircle } from "@arco-design/web-react/icon"
import { cn } from "@/shared/lib/cn"

export interface TourLaunchButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

/**
 * Small, unobtrusive "Xem hướng dẫn" affordance that launches a feature tour
 * (T1, `docs/superpowers/plans/2026-07-27-feature-tours.md`). Text-style Arco
 * button — no fill, no border — so it reads as a quiet help link rather than
 * a primary action, and inherits the current Arco theme (light/dark) via CSS
 * variables like the rest of the app.
 */
export function TourLaunchButton({ onClick, label = "Xem hướng dẫn", className }: TourLaunchButtonProps) {
  return (
    <Button
      type="text"
      size="small"
      icon={<IconQuestionCircle />}
      onClick={onClick}
      className={cn("!text-[var(--color-text-3)] hover:!text-[rgb(var(--primary-6))]", className)}
    >
      {label}
    </Button>
  )
}
