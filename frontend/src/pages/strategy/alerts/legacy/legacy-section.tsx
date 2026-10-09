import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"

import { LegacyEventsList } from "./events-list"
import { LegacyRulesList } from "./rules-list"
import { TelegramConnect } from "./telegram-connect"

/**
 * "Cảnh báo cũ": the alerts and Telegram link created before the pinned-snapshot alerts. Closed by
 * default and fetched only when opened, so it never mixes with the new alerts; nothing here is
 * deleted by the new page.
 */
export function LegacyAlertsSection() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <section className="rounded-lg border border-dashed border-border bg-card/50" aria-label="Cảnh báo cũ">
      <Button
        type="button"
        variant="ghost"
        className="flex h-auto w-full items-center justify-between gap-3 rounded-lg p-4 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block font-heading text-sm font-bold">Cảnh báo cũ</span>
          <span className="mt-0.5 block text-xs font-normal whitespace-normal text-muted-foreground">
            Cảnh báo theo luật cũ và kết nối Telegram. Dữ liệu của bạn được giữ nguyên; cảnh báo mới ở trên không dùng chung với phần này.
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-border p-4">
          <TelegramConnect />
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Cảnh báo cũ của tôi</h3>
            <LegacyRulesList />
          </div>
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Lịch sử tín hiệu cũ</h3>
            <LegacyEventsList />
          </div>
        </div>
      )}
    </section>
  )
}
