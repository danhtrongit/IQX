import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

export function SidebarPanel({ title, description, actions, children, footer }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-(--panel-header-height) shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0"><h2 className="truncate font-heading text-base font-bold">{title}</h2>{description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>}</div>
        {actions}
      </div>
      <ScrollArea className="min-h-0 flex-1"><div className="space-y-4 p-3">{children}</div></ScrollArea>
      {footer && <div className="shrink-0 border-t border-border p-3">{footer}</div>}
    </section>
  )
}
