import { ArrowDown, ArrowUp, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CROSS_LABEL, rowSentence, ruleLine } from "@/pages/demo-trading/bot/config/labels"
import { isParamsSide, isRowsIndicator, type Side, type TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"

import type { Indicators } from "./draft"
import { isSideUsed } from "./sides"
import { SUB_TEXT } from "./ui"

const TITLE: Record<Side, string> = { buy: "Điều kiện Mua", sell: "Điều kiện Bán" }

const EMPTY: Record<Side, string> = {
  buy: "Chưa có điều kiện Mua. Bấm + Mua ở cột Chỉ báo bên trái.",
  sell: "Chưa có điều kiện Bán. Bấm + Bán ở cột Chỉ báo. Không có điều kiện Bán thì vị thế được bán khi đủ Giữ tối đa.",
}

type Line = { key: string; text: string; on: boolean }

/** Every row of one side as a sentence; `on` false = a row switched off (kept, shown struck through). */
function linesOf(indicator: TechnicalIndicator, indicators: Indicators, side: Side): Line[] {
  const saved = indicators[indicator.id]?.[side]
  if (!saved) return []
  if (isRowsIndicator(indicator)) {
    if (isParamsSide(saved)) return []
    return saved.rules.map((row, index) => {
      const definition = indicator.rows.find((item) => item.id === row.id)
      return { key: `${row.id}-${index}`, text: definition ? rowSentence(definition, row) : row.id, on: row.enabled !== false }
    })
  }
  if (!isParamsSide(saved)) return []
  return saved.rules.map((rule, index) => {
    const line = ruleLine(rule, rule.op, indicator, saved.params)
    return { key: `${rule.id}-${index}`, text: rule.kind === "cross" ? `${CROSS_LABEL}: ${line}` : line, on: rule.enabled !== false }
  })
}

/**
 * One side of the strategy on screen (§4.1 item 5). Cards are the indicators really in use (master ON, side
 * ON, one enabled row at least), joined by AND. Tab Chỉ báo: `Chỉnh`, `✕`, rows switched off are struck
 * through. Read-only (tab IQX): no buttons, only the rows that are on.
 */
export function SidePanel({
  side,
  registry,
  indicators,
  readOnly = false,
  onEdit,
  onRemove,
}: {
  side: Side
  registry: readonly TechnicalIndicator[]
  indicators: Indicators
  readOnly?: boolean
  onEdit?: (indicator: TechnicalIndicator) => void
  onRemove?: (indicator: TechnicalIndicator) => void
}) {
  // In the strategy's own order (the order its cards were added); unknown ids are skipped.
  const used = Object.keys(indicators)
    .filter((id) => isSideUsed(indicators, id, side))
    .flatMap((id) => registry.filter((indicator) => indicator.id === id))
  const buy = side === "buy"
  const Icon = buy ? ArrowUp : ArrowDown
  const sideWord = buy ? "Mua" : "Bán"
  return (
    <section
      aria-label={TITLE[side]}
      data-testid={`panel-${side}`}
      className={`min-w-0 overflow-hidden rounded-lg border bg-card ${buy ? "border-price-up/40" : "border-price-down/40"}`}
    >
      <div className={`flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-wide uppercase ${buy ? "bg-price-up/10 text-price-up" : "bg-price-down/10 text-price-down"}`}>
        <Icon aria-hidden="true" className="size-4" />
        <h3>{TITLE[side]}</h3>
        <span className="ml-auto font-normal text-foreground normal-case">{used.length} chỉ báo</span>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground">AND</span>
      </div>
      <div className="space-y-3 p-3">
        {used.length === 0 ? (
          <p className={`rounded-md border border-dashed border-border p-4 text-center text-xs leading-5 ${SUB_TEXT}`} data-testid={`empty-${side}`}>
            {readOnly ? `Chiến lược không có điều kiện ${sideWord}.` : EMPTY[side]}
          </p>
        ) : (
          used.map((indicator) => {
            const lines = linesOf(indicator, indicators, side).filter((line) => !readOnly || line.on)
            return (
              <article key={indicator.id} data-testid={`card-${side}-${indicator.id}`} className="overflow-hidden rounded-md border border-border bg-background/40">
                <div className="flex items-start justify-between gap-2 p-3">
                  <h4 className="min-w-0 text-sm font-semibold break-words">{indicator.name}</h4>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit?.(indicator)}>
                        Chỉnh<span className="sr-only"> {indicator.name} phía {sideWord}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Bỏ ${indicator.name} khỏi ${sideWord}`}
                        className="text-price-down hover:text-price-down"
                        onClick={() => onRemove?.(indicator)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {lines.map((line) => (
                    <li key={line.key} className={`px-3 py-2 text-xs break-words ${line.on ? "" : `${SUB_TEXT} line-through`}`} data-off={line.on ? undefined : true}>
                      {line.text}
                      {!line.on && <span className="sr-only"> (đang tắt)</span>}
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
