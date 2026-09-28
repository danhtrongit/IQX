import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function WorkspacePage({ title, description, actions, children, contentClassName, scroll = true }: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  contentClassName?: string
  scroll?: boolean
}) {
  const content = <div className={cn("mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6", contentClassName)}>{children}</div>
  return <main className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
    {scroll ? <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">{content}</ScrollArea> : <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", contentClassName)}>{children}</div>}
  </main>
}
