import { useMemo, useState, type ReactNode } from "react"
import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"
import { groupByType } from "@/pages/demo-trading/bot/panel/indicator-groups"
import { cn } from "@/lib/utils"

import { LibraryHead, LibraryShell } from "../shared/library-shell"
import { matchesQuery } from "../shared/library-utils"
import type { Indicators } from "./draft"
import { isSideUsed } from "./sides"
import { SUB_TEXT } from "./ui"

const SIDE_TEXT: Record<Side, string> = { buy: "Mua", sell: "Bán" }

export type Mode = "iqx" | "indicators"

/** The two tab buttons `IQX` · `Chỉ báo 16` (§4.1). Each tab keeps its own state and result. */
export function ModeSwitch({ mode, count, onMode, className }: { mode: Mode; count: number; onMode: (mode: Mode) => void; className?: string }) {
  const item = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      data-state={mode === value ? "active" : "inactive"}
      className={cn(
        "h-8 min-w-0 flex-1 rounded-md px-2 text-xs font-semibold transition-colors",
        mode === value ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-muted",
      )}
      onClick={() => onMode(value)}
    >
      {label}
    </button>
  )
  return (
    <div role="tablist" aria-label="Loại chiến lược" className={cn("flex gap-1 rounded-lg border border-border bg-background/40 p-1", className)}>
      {item("iqx", "IQX")}
      {item("indicators", `Chỉ báo ${count}`)}
    </div>
  )
}

/**
 * Left column of the Backtest: tab IQX (cards of the shown Chiến lược IQX) or tab Chỉ báo (the library of the
 * granted indicators, grouped by type like the Bot; "+ Mua" / "+ Bán" opens that side of the draft). Compose
 * mode of Mẫu IQX has the library only. No Luyện tập button (§4.3).
 */
export function IndicatorLibrary({
  indicators,
  draft,
  open,
  onOpenChange,
  onOpen,
  mode,
  onMode,
  iqx,
  iqxFooter,
}: {
  indicators: readonly TechnicalIndicator[]
  draft: Indicators
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (indicator: TechnicalIndicator, side: Side) => void
  mode: Mode
  onMode?: (mode: Mode) => void
  /** Content of the tab IQX; absent in compose mode, where the tab is hidden. */
  iqx?: ReactNode
  iqxFooter?: string
}) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => groupByType(indicators.filter((item) => matchesQuery(item.name, query))), [indicators, query])

  const list = (
    <>
      <LibraryHead title="Chỉ báo" count={indicators.length} searchLabel="Tìm chỉ báo" placeholder="Tìm chỉ báo…" query={query} onQuery={setQuery} />
      {indicators.length === 0 ? (
        <p className={`text-xs leading-5 ${SUB_TEXT}`}>Chưa có chỉ báo nào để dùng trong Backtest.</p>
      ) : groups.length === 0 ? (
        <p className={`text-xs ${SUB_TEXT}`}>Không tìm thấy chỉ báo.</p>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-label={group.title} className="space-y-1.5">
            <h3 className={`text-[10px] font-semibold tracking-wide uppercase ${SUB_TEXT}`}>{group.title}</h3>
            <ul className="space-y-1.5">
              {group.indicators.map((indicator) => (
                <li key={indicator.id} data-testid={`library-${indicator.id}`} className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-[13px] font-semibold">{indicator.name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(["buy", "sell"] as const).map((side) => {
                      const used = isSideUsed(draft, indicator.id, side)
                      return (
                        <Button
                          key={side}
                          type="button"
                          size="sm"
                          variant="outline"
                          className={side === "buy" ? "text-price-up" : "text-price-down"}
                          aria-label={used ? `${indicator.name} đang dùng cho ${SIDE_TEXT[side]}: chỉnh` : `Thêm ${indicator.name} vào ${SIDE_TEXT[side]}`}
                          onClick={() => { onOpen(indicator, side); onOpenChange(false) }}
                        >
                          {used ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                          {SIDE_TEXT[side]}
                        </Button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )

  return (
    <LibraryShell label="Thư viện chỉ báo" open={open} onOpenChange={onOpenChange}>
      {iqx === undefined || !onMode ? (
        list
      ) : (
        <>
          <ModeSwitch mode={mode} count={indicators.length} onMode={onMode} className="mr-8 lg:mr-0" />
          {mode === "iqx" ? (
            <div className="space-y-3">
              {iqx}
              {iqxFooter && <p className={`text-[11px] leading-4 ${SUB_TEXT}`} data-testid="iqx-footer">{iqxFooter}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">{list}</div>
          )}
        </>
      )}
    </LibraryShell>
  )
}
