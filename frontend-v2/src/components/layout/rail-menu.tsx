import { LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRail } from "@/context/rail"
import { cn } from "cn"

export function RailMenu({ locked = {}, hideLocked = false }: { locked?: Record<string, string>; hideLocked?: boolean }) {
  const { chrome, activeId, activeContentId, setActive } = useRail()
  if (chrome.items.length === 0) return null

  return (
    <nav
      aria-label="Công cụ theo trang"
      className="flex w-(--rail-width) shrink-0 flex-col overflow-hidden border-l border-border bg-card"
    >
      <div className="flex h-(--panel-header-height) shrink-0 items-center justify-center border-b border-border">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Công cụ
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-1.5">
          {chrome.items.filter(item => !hideLocked || !locked[item.id]).map((item) => {
            const Icon = item.icon
            const on = item.id === (item.affects === "left" ? activeContentId : activeId)
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-pressed={on}
                aria-label={locked[item.id] ? `${item.label} · ${locked[item.id]}` : item.label}
                title={locked[item.id]}
                onClick={() => setActive(item.id)}
                className={cn(
                  "relative h-auto min-h-20 w-full flex-col gap-2 px-1 py-3 text-center whitespace-normal",
                  on
                    ? "bg-primary/15 text-foreground before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {locked[item.id] && <LockKeyhole aria-hidden="true" className="absolute top-2 right-2 size-2.5 text-muted-foreground" />}
                <Icon
                  aria-hidden="true"
                  className={cn("size-5 shrink-0", on && "text-primary")}
                />
                <span className="text-[11px] leading-4 font-medium">
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
