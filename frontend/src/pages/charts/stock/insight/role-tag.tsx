/**
 * Insider role tag (L4 "Nội bộ"): senior leader / major shareholder / related
 * party. Kept as a standalone primitive — the briefing's L4 layer currently
 * carries narrative fields only, so nothing consumes it yet.
 */
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type RoleVariant = "senior" | "major" | "related"

const ROLE_TONE: Record<RoleVariant, string> = {
  senior: "bg-primary/15 text-primary",
  major: "bg-muted text-muted-foreground",
  related: "bg-muted/60 text-muted-foreground",
}

export function RoleTag({ variant, children }: { variant: RoleVariant; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase",
        ROLE_TONE[variant],
      )}
    >
      {children}
    </span>
  )
}
