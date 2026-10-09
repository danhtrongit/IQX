import { useMemo, useState } from "react"
import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SharedConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { chapterTitle } from "../shared/indicators"
import { LibraryHead, LibraryShell } from "../shared/library-shell"
import { matchesQuery } from "../shared/library-utils"
import { isSideUsed } from "./sides"

const SIDE_TEXT: Record<Side, string> = { buy: "Mua", sell: "Bán" }

/**
 * Left library of the Backtest: only the indicators the server granted (never more than the 16 of
 * the catalog). "+ Mua" / "+ Bán" opens that side to review and edit; nothing joins the saved
 * configuration until the user saves there.
 */
export function IndicatorLibrary({
  indicators,
  config,
  open,
  onOpenChange,
  onOpen,
}: {
  indicators: readonly TechnicalIndicator[]
  config: SharedConfig | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (indicator: TechnicalIndicator, side: Side) => void
}) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const byChapter = new Map<number, TechnicalIndicator[]>()
    for (const indicator of indicators.filter((item) => matchesQuery(item.name, query))) {
      byChapter.set(indicator.chapter, [...(byChapter.get(indicator.chapter) ?? []), indicator])
    }
    return [...byChapter.entries()].sort(([a], [b]) => a - b)
  }, [indicators, query])

  return (
    <LibraryShell label="Thư viện chỉ báo" open={open} onOpenChange={onOpenChange}>
      <LibraryHead title="Chỉ báo đã mở" count={indicators.length} searchLabel="Tìm chỉ báo" placeholder="Tìm chỉ báo…" query={query} onQuery={setQuery} />
      {indicators.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">Chưa có chỉ báo nào được mở. Hoàn thành bài học chỉ báo trong Học viện để dùng trong Backtest.</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không có chỉ báo phù hợp.</p>
      ) : (
        groups.map(([chapter, items]) => (
          <section key={chapter} aria-label={`Chương ${chapter}`} className="space-y-1.5">
            <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Chương {chapter} · {chapterTitle(chapter)}</h3>
            <ul className="space-y-1.5">
              {items.map((indicator) => (
                <li key={indicator.id} data-testid={`library-${indicator.id}`} className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-[13px] font-semibold">{indicator.name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(["buy", "sell"] as const).map((side) => {
                      const used = isSideUsed(config, indicator.id, side)
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
    </LibraryShell>
  )
}
