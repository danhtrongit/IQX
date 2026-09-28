import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface TourLaunchButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

/**
 * Quiet help affordance that launches a view's tour — a text button, so it
 * reads as a help link rather than a primary action.
 */
export function TourLaunchButton({
  onClick,
  label = "Xem hướng dẫn",
  className,
}: TourLaunchButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("gap-1.5 text-muted-foreground hover:text-primary", className)}
    >
      <CircleHelp className="size-3.5" aria-hidden />
      {label}
    </Button>
  )
}
