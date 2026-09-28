import { useId, type ReactNode } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"

type PagePanelProps = {
  title: string
  description: string
  children?: ReactNode
}

export function PagePanel({ title, description, children }: PagePanelProps) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="flex h-full min-h-0 flex-col">
      <div className="flex h-(--panel-header-height) shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-card px-4">
        <h1 id={titleId} className="truncate font-heading text-lg font-bold">
          {title}
        </h1>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1" orientation="both" viewportClassName="[&>div]:h-full">
        <div className="flex min-h-full flex-col p-(--page-padding)">
          <div className="flex-1 rounded-lg bg-card p-4 ring-1 ring-border/60 ring-inset dark:ring-0">
            {children}
          </div>
        </div>
      </ScrollArea>
    </section>
  )
}
