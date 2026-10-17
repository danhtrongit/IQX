import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { RailItem } from "@/config/chrome"
import { cn } from "cn"

/** Tools listed in the rail and how a selection reaches the page. */
export type WorkspaceRail = {
  /** Visible tools, top to bottom. */
  items: RailItem[]
  /** Panel tool in view (a `sidebar` item). */
  activeTool: string
  /** Main-area tool on screen (a `left` item such as Insight), if any. */
  mainToolId: string | null
  onSelectTool: (id: string) => void
  onSelectMainTool: (id: string) => void
}

/**
 * Vertical tool rail. A panel tool is highlighted only while its panel is showing; a
 * main-area tool (Insight) while it fills the main area. Selection logic (show, hide,
 * switch) belongs to the workspace frame.
 */
export function RailMenu({ rail, panelId, panelShown, onSelect, orientation = "vertical" }: {
  rail: WorkspaceRail
  panelId: string
  panelShown: boolean
  onSelect: (item: RailItem, button: HTMLElement) => void
  /** `horizontal`: a tool bar above the main area, used on phones so the main area keeps the full width. */
  orientation?: "vertical" | "horizontal"
}) {
  if (rail.items.length === 0) return null

  function isOn(item: RailItem) {
    return item.affects === "sidebar" ? panelShown && item.id === rail.activeTool : item.id === rail.mainToolId
  }

  if (orientation === "horizontal") {
    return (
      <nav
        aria-label="Công cụ theo trang"
        className="workspace-railbar flex h-11 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-card px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rail.items.map((item) => {
          const Icon = item.icon
          const panelTool = item.affects === "sidebar"
          const on = isOn(item)
          // The tool whose view fills the main area stays marked while its panel layer is closed.
          const current = panelTool ? item.id === rail.activeTool : on
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              aria-pressed={on}
              aria-controls={panelTool ? panelId : undefined}
              aria-expanded={panelTool ? on : undefined}
              data-tool={item.id}
              data-current={current || undefined}
              onClick={(event) => onSelect(item, event.currentTarget)}
              className={cn(
                "relative h-full flex-none gap-1.5 rounded-none px-3 text-xs font-semibold focus-visible:ring-inset",
                current
                  ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                on && "bg-primary/15"
              )}
            >
              <Icon aria-hidden="true" className={cn("size-4 shrink-0", current && "text-primary")} />
              <span>{item.label}</span>
            </Button>
          )
        })}
      </nav>
    )
  }

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
          {rail.items.map((item) => {
            const Icon = item.icon
            const panelTool = item.affects === "sidebar"
            const on = isOn(item)
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-pressed={on}
                aria-controls={panelTool ? panelId : undefined}
                aria-expanded={panelTool ? on : undefined}
                data-tool={item.id}
                onClick={(event) => onSelect(item, event.currentTarget)}
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
