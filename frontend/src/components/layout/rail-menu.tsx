import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRail } from "@/context/rail"
import { cn } from "cn"

import { useWorkspaceFrame } from "./workspace-frame-context"

/**
 * Vertical tool rail. Every tool in the route's chrome is listed in order and is
 * always available; selecting one switches the context panel (and, below 900px,
 * slides that panel in next to the rail).
 */
export function RailMenu() {
  const { chrome, activeId, activeContentId, setActive } = useRail()
  const frame = useWorkspaceFrame()
  if (chrome.items.length === 0) return null

  return (
    <nav
      aria-label="Công cụ theo trang"
      className="workspace-rail flex shrink-0 flex-col overflow-hidden border-l border-border bg-card"
    >
      <div className="flex h-(--panel-header-height) shrink-0 items-center justify-center border-b border-border">
        <span className="workspace-rail-title text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Công cụ
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="workspace-rail-list flex flex-col gap-1 p-1.5">
          {chrome.items.filter((item) => !item.hidden).map((item) => {
            const Icon = item.icon
            const on = item.id === (item.affects === "left" ? activeContentId : activeId)
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-pressed={on}
                data-tool={item.id}
                onClick={() => {
                  setActive(item.id)
                  frame?.revealPanel()
                }}
                className={cn(
                  "workspace-tool relative h-auto min-h-20 w-full flex-col gap-2 px-1 py-3 text-center whitespace-normal",
                  on
                    ? "bg-primary/15 text-foreground before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-5 shrink-0", on && "text-primary")}
                />
                <span className="workspace-tool-label text-[11px] leading-4 font-medium">
                  {item.label}
                </span>
              </Button>
            )
          })}
        </div>
      </ScrollArea>
    </nav>
  )
}
