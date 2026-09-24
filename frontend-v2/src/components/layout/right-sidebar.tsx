import type { ReactNode } from "react"

export function RightSidebar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside
      aria-label={label}
      className="flex min-w-0 flex-1 flex-col overflow-hidden border-border bg-sidebar text-sidebar-foreground lg:w-(--sidebar-width) lg:shrink-0 lg:flex-none lg:border-l"
    >
      {children}
    </aside>
  )
}
