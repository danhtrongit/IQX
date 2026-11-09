/**
 * «Thẻ nến · x / 47» block of the Shop panel (Candle Dojo spec v1.2, section 8.3), directly above "Hoàn thành
 * bài học": five small card backs in the tier colours, each showing how many cards of that tier the learner
 * owns, and the text button "Xem kho thẻ →". The button opens the "Đã sở hữu" tab of the Thẻ nến section in the
 * main area and scrolls to it; while the panel is a slide-over (phones) it also closes the layer so the section
 * is the first thing on screen. The block has its own loading and error state like every other panel block.
 */
import { ArrowRight } from "lucide-react"

import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { Skeleton } from "@/components/ui/skeleton"
import { CD_TIER_INFO, type CdTier } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"
import { tierStyle } from "../candle-dojo/candle-card-style"
import { useCandleDojoCards } from "../candle-dojo/candle-dojo-api"
import { CANDLE_COPY, CANDLE_TIERS, isUsableCards, ownedCountsByTier, ownedTotal } from "./candle-cards-model"
import { showOwnedCandleCards } from "./candle-cards-store"
import { LINK_BUTTON, RegionError, SideTitle } from "./shop-ui"

/** Back of a card in a tier: the metal frame gradient of the card with the owned count on it. */
function TierBack({ tier, count }: { tier: CdTier; count: number }) {
  return (
    <li
      data-candle-tier-back={tier}
      aria-label={`${CD_TIER_INFO[tier].label}: ${count} thẻ`}
      style={{
        ...tierStyle(tier),
        background: "linear-gradient(140deg,var(--c2) 0%,var(--c1) 38%,var(--c3) 100%)",
      }}
      className={cn("grid h-[34px] w-6 place-items-center rounded-[5px] text-[11px] leading-none font-extrabold text-white tabular-nums shadow-sm ring-1 ring-black/10", count === 0 && "opacity-70")}
    >
      <span aria-hidden="true">{count}</span>
    </li>
  )
}

export function CandleCardsPanelBlock() {
  const cards = useCandleDojoCards()
  const frame = useWorkspaceFrame()
  const data = isUsableCards(cards.data) ? cards.data : undefined
  const failed = !data && (cards.isError || !!cards.data)
  const total = data ? ownedTotal(data) : null
  const counts = data ? ownedCountsByTier(data.items) : null

  function openOwned() {
    showOwnedCandleCards()
    if (frame?.overlay) frame.setOpen(false)
  }

  return (
    <section aria-labelledby="shop-candle-cards-panel-title" data-testid="shop-candle-cards">
      <SideTitle id="shop-candle-cards-panel-title" aside={total ? `${total.owned} / ${total.total}` : undefined}>{CANDLE_COPY.title}</SideTitle>
      {counts ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
          <ul className="flex gap-1" aria-label="Số thẻ đã có theo bậc">
            {CANDLE_TIERS.map((tier) => <TierBack key={tier} tier={tier} count={counts[tier]} />)}
          </ul>
          <button type="button" className={cn(LINK_BUTTON, "ml-auto")} onClick={openOwned}>
            {CANDLE_COPY.viewOwned}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : failed ? (
        <RegionError message="Chưa tải được thẻ nến." onRetry={() => void cards.refetch()} retrying={cards.isFetching} />
      ) : (
        <Skeleton className="h-[58px] rounded-xl" data-testid="shop-candle-cards-loading" />
      )}
    </section>
  )
}
