import { ArrowDown, ArrowUp, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CROSS_LABEL, operandLabel } from "@/pages/demo-trading/bot/config/labels"
import { activeConditions } from "@/pages/demo-trading/bot/config/summary"
import type { SharedConfig, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import { isSideUsed } from "./sides"

const TITLE: Record<Side, string> = { buy: "Điều kiện Mua", sell: "Điều kiện Bán" }

/**
 * One side of the saved shared configuration. Cards are the indicators that really take part (master
 * ON and this side ON), all joined by AND. Removing a card turns this side OFF in the shared
 * configuration, keeping its params: it is a save that also affects the Bot, not a way to hide a card.
 */
export function SidePanel({
  side,
  indicators,
  config,
  onEdit,
  onRemove,
}: {
  side: Side
  indicators: readonly TechnicalIndicator[]
  config: SharedConfig | undefined
  onEdit: (indicator: TechnicalIndicator) => void
  onRemove: (indicator: TechnicalIndicator) => void
}) {
  const used = indicators.filter((indicator) => isSideUsed(config, indicator.id, side))
  const summaries = new Map(activeConditions(config, side, indicators).map((item) => [item.id, item]))
  const buy = side === "buy"
  const Icon = buy ? ArrowUp : ArrowDown
  return (
    <section
      aria-label={TITLE[side]}
      data-testid={`panel-${side}`}
      className={`overflow-hidden rounded-lg border bg-card ${buy ? "border-price-up/40" : "border-price-down/40"}`}
    >
      <div className={`flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-wide uppercase ${buy ? "bg-price-up/10 text-price-up" : "bg-price-down/10 text-price-down"}`}>
        <Icon aria-hidden="true" className="size-4" />
        <h3>{TITLE[side]}</h3>
        <span className="ml-auto font-normal text-muted-foreground normal-case">{used.length} chỉ báo</span>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground">AND</span>
      </div>
      <div className="space-y-3 p-3">
        {used.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
            Chưa có điều kiện {side === "buy" ? "Mua" : "Bán"}. Thêm chỉ báo từ thư viện bằng nút “+ {side === "buy" ? "Mua" : "Bán"}”.
          </p>
        ) : (
          used.map((indicator) => {
            const saved = config?.indicators[indicator.id]?.[side]
            const summary = summaries.get(indicator.id)
            const params = Object.fromEntries(Object.entries(saved?.params ?? {}))
            return (
              <article key={indicator.id} data-testid={`card-${side}-${indicator.id}`} className="overflow-hidden rounded-md border border-border bg-background/40">
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold">{indicator.name}</h4>
                    {summary && summary.params.length > 0 && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{summary.params.join(" · ")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(indicator)}>
                      Chỉnh<span className="sr-only"> {indicator.name} phía {side === "buy" ? "Mua" : "Bán"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Bỏ ${indicator.name} khỏi ${side === "buy" ? "Mua" : "Bán"}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => onRemove(indicator)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {(saved?.rules ?? []).map((rule) => (
                    <li key={rule.id}>
                      {rule.kind === "cross" && <span className="block bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">{CROSS_LABEL}</span>}
                      <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 break-words">{operandLabel(rule.lhs, indicator, params)}</span>
                        <span className="text-center text-base font-bold text-primary" aria-label={`Dấu ${rule.op}`}>{rule.op}</span>
                        <span className="min-w-0 text-right break-words">{operandLabel(rule.rhs, indicator, params)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
