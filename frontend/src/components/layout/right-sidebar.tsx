import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Context-panel shell. Its width belongs to the surrounding layout (the
 * workspace frame's grid column), so it only fills the space it is given.
 */
export function RightSidebar({ label, className, children, ...props }: Omit<ComponentProps<"aside">, "aria-label"> & { label: string }) {
  return (
    <aside
      aria-label={label}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border bg-sidebar text-sidebar-foreground", className)}
      {...props}
    >
      {children}
    </aside>
  )
}
