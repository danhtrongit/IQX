import { TriangleAlert } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { activeConditions, effectiveConfigOf, pendingConfigOf, pendingStartText, type ConditionItem } from "../config/summary"
import type { Side, SharedConfigState, TechnicalIndicator } from "../config/types"
import type { BotConditions } from "../types"
import { pendingConfigNote, sideBlocks } from "./state"

const SIDE_TITLE: Record<Side, string> = { buy: "ĐIỀU KIỆN MUA", sell: "ĐIỀU KIỆN BÁN" }
const SIDE_TONE: Record<Side, string> = { buy: "text-price-up", sell: "text-price-down" }

function ConditionList({ items, label }: { items: ConditionItem[]; label: string }) {
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-border bg-background/40 px-2.5 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-semibold">{item.name}</span>
            <span className="text-[11px] text-muted-foreground">{item.params.join(" · ")}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] leading-4 text-muted-foreground">
            {item.rules.map((rule, index) => <li key={`${item.id}-${index}`}>{rule}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/**
 * One side of the conditions the Bot FOLLOWS: the effective revision's config. A newer saved
 * revision that does not count yet is listed apart, under «Chờ hiệu lực từ phiên …», and only
 * on a side where it differs, so a saved edit never reads as already in force.
 */
function SideCard({
  side,
  conditions,
  config,
  indicators,
}: {
  side: Side
  conditions: BotConditions | null
  config: SharedConfigState | undefined
  indicators: readonly TechnicalIndicator[]
}) {
  const block = sideBlocks(conditions).find((item) => item.side === side)
  const effectiveRevision = conditions?.effective_revision ?? null
  const count = side === "buy" ? (conditions?.buy_condition_count ?? 0) : (conditions?.sell_condition_count ?? 0)
  const status = side === "buy" ? conditions?.buy_status : conditions?.sell_status
  const effective = effectiveConfigOf(config)
  const pending = pendingConfigOf(config)
  const effectiveItems = effective ? activeConditions(effective.config, side, indicators) : []
  const pendingItems = pending ? activeConditions(pending.config, side, indicators) : []
  const pendingDiffers = !!pending && JSON.stringify(pendingItems) !== JSON.stringify(effectiveItems)
  const title = SIDE_TITLE[side]

  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-border bg-card p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className={cn("text-[11px] font-semibold tracking-wide", SIDE_TONE[side])}>{title}</h3>
        <span className="rounded-sm border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">AND</span>
      </div>

      {block ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>Phía {side === "buy" ? "Mua" : "Bán"} đang bị chặn: {block.detail}</span>
        </p>
      ) : effectiveItems.length > 0 ? (
        <>
          {pendingDiffers && effective && (
            <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Đang hiệu lực · bản {effective.revision}</p>
          )}
          <ConditionList items={effectiveItems} label={`${title} đang hiệu lực`} />
        </>
      ) : status === "active" && count > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {count} điều kiện đang hiệu lực theo bản {effectiveRevision}.
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">Chưa có điều kiện hiệu lực.</p>
      )}

      {pending && pendingDiffers && (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-price-ref uppercase">
            {pendingStartText(pending)} · bản {pending.revision}
          </p>
          {pendingItems.length > 0 ? (
            <ConditionList items={pendingItems} label={`${title} chờ hiệu lực`} />
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">Không còn điều kiện nào được bật ở phía này.</p>
          )}
        </div>
      )}
    </section>
  )
}

export function ConditionCards({
  loading = false,
  conditions,
  config,
  indicators,
}: {
  loading?: boolean
  conditions: BotConditions | null
  config: SharedConfigState | undefined
  indicators: readonly TechnicalIndicator[]
}) {
  const note = pendingConfigNote(conditions)
  if (loading) {
    return (
      <div className="grid gap-2.5 min-[1031px]:grid-cols-2" aria-label="Đang tải điều kiện">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    )
  }
  return (
    <>
      <div className="grid gap-2.5 min-[1031px]:grid-cols-2">
        <SideCard side="buy" conditions={conditions} config={config} indicators={indicators} />
        <SideCard side="sell" conditions={conditions} config={config} indicators={indicators} />
      </div>
      {note && (
        <p role="status" className="rounded-md border border-price-ref/40 bg-price-ref/10 p-3 text-xs leading-5 text-price-ref">
          {note}
        </p>
      )}
    </>
  )
}
