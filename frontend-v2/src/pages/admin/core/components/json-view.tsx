import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/** Read-only JSON payload (audit before/after, job results). Scrolls, never wraps the page. */
export function JsonView({
  data,
  className,
  maxHeight = "20rem",
}: {
  data: unknown
  className?: string
  maxHeight?: string
}) {
  return (
    <ScrollArea
      className={cn("rounded-md border border-border bg-muted/40", className)}
      style={{ maxHeight }}
    >
      <pre className="p-3 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </ScrollArea>
  )
}
