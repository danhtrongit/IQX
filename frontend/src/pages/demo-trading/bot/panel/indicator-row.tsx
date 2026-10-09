import { Lock } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import type { TechnicalIndicator } from "../config/types"

/**
 * One indicator of the Bot panel. Locked (not learned) indicators only offer the
 * lesson: no practice, no configuration, no ON/OFF. Learned ones offer Luyện tập,
 * Cấu hình and the master switch.
 */
export function IndicatorRow({
  indicator,
  granted,
  masterOn,
  busy,
  lessonSearch,
  onPractice,
  onConfigure,
  onToggleMaster,
}: {
  indicator: TechnicalIndicator
  granted: boolean
  masterOn: boolean
  busy: boolean
  lessonSearch: string
  onPractice: () => void
  onConfigure: () => void
  onToggleMaster: () => void
}) {
  return (
    <article
      aria-label={indicator.name}
      data-indicator={indicator.id}
      data-granted={granted}
      className={cn("rounded-lg border bg-card p-3.5", granted ? "border-primary/25" : "border-border")}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h4 className={cn("flex min-w-0 items-center gap-1.5 text-[13px] leading-snug font-semibold", !granted && "text-muted-foreground")}>
          {!granted && <Lock aria-hidden="true" className="size-3 shrink-0" />}
          <span className="min-w-0 break-words">{indicator.name}</span>
        </h4>
        <span className="shrink-0 text-[10px] text-muted-foreground">{granted ? "Đã mở" : "Chưa mở"}</span>
      </div>

      {granted ? (
        <div className="flex flex-nowrap items-center gap-1.5">
          <Button type="button" size="sm" className="h-8 px-2.5 text-[11px]" onClick={onPractice}>
            Luyện tập<span className="sr-only"> {indicator.name}</span>
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-[11px]" onClick={onConfigure}>
            Cấu hình<span className="sr-only"> {indicator.name}</span>
          </Button>
          <Switch
            className="ml-auto"
            checked={masterOn}
            disabled={busy}
            aria-label={`Bật ${indicator.name} cho Bot`}
            onCheckedChange={onToggleMaster}
          />
        </div>
      ) : (
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-[11px]">
          <Link to={{ search: lessonSearch }} aria-label={`Xem bài ${indicator.name}`}>Xem bài</Link>
        </Button>
      )}
    </article>
  )
}
