/**
 * «Thẻ nến» section of the Shop main view (Candle Dojo spec v1.2, section 8.1), under the Linh thú grid and
 * set off by a rule. Same head as Linh thú (title, "x / 47 đã sở hữu", the same Cửa hàng | Đã sở hữu tabs, with
 * a tab state of its own) and the same cell frame; the picture of every cell is the card itself.
 *
 * "Cửa hàng" lists the cards of the lessons already learned that the learner does not own, grouped by tier
 * with the tier's price; "Đã sở hữu" lists the owned ones with the tier counts and an "Đã gặp" mark for the
 * ones Flashback has shown. Each cell offers Mua, Chưa đủ xu (locked) or nothing (owned). Ownership, unlocking,
 * price and balance come only from the server. The cards read has its own loading and error states, so a
 * failed read never takes the Linh thú part of the Shop down with it.
 */
import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CD_TIER_INFO } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"
import { CandleCard } from "../candle-dojo/candle-card"
import { tierStyle } from "../candle-dojo/candle-card-style"
import { useCandleDojoCards, type CandleDojoCardItem } from "../candle-dojo/candle-dojo-api"
import {
  CANDLE_COPY,
  asTier,
  cardsOfView,
  emptyCardsText,
  groupByTier,
  isUsableCards,
  ownedTotal,
  type CardsView,
} from "./candle-cards-model"
import { CandleCardPurchaseDialog } from "./candle-cards-purchase-dialog"
import {
  setCandleCardsView,
  takeCandleCardsFocus,
  useCandleCardsFocusToken,
  useCandleCardsView,
} from "./candle-cards-store"
import { formatXu } from "./shop-model"
import { CoinAmount, RegionError, SHOP_CELL_FRAME } from "./shop-ui"

function CandleCardCell({ item, balance, view, onBuy }: {
  item: CandleDojoCardItem
  balance: number
  view: CardsView
  onBuy: (item: CandleDojoCardItem) => void
}) {
  const tier = asTier(item.tier)
  const short = !item.owned && balance < item.price_xu
  const hintId = `candle-hint-${item.card_id}`
  const buttonClass = "min-h-9 w-full text-xs"

  return (
    <article
      data-candle-card={item.card_id}
      data-candle-state={item.owned ? "owned" : short ? "short" : "buy"}
      aria-label={`Thẻ ${item.name}`}
      className={cn(SHOP_CELL_FRAME, "flex flex-col border-border hover:border-primary/40")}
    >
      <div
        style={tier ? tierStyle(tier) : undefined}
        className="relative flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_100%,var(--tint),transparent_72%)] px-3 pt-3.5 pb-2.5"
      >
        <div className="w-[96px] max-[650px]:w-[88px]">
          <CandleCard card={item.card_id} />
        </div>
        {view === "owned" && item.seen && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-sm border border-price-up/40 bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-price-up">
            <Check className="size-3" aria-hidden="true" />
            {CANDLE_COPY.seen}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-border px-3 py-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 min-h-8 font-heading text-[12.5px] leading-snug font-bold">{item.name}</h3>
          <div className="mt-1 min-h-4 text-[11px]">
            {item.owned ? (
              CANDLE_COPY.owned
            ) : (
              <>
                <CoinAmount value={item.price_xu} className="text-[11px] font-medium" iconClassName="size-3.5" />
                {short && <span id={hintId} className="sr-only">{`Còn thiếu ${formatXu(item.price_xu - balance)} xu. Hoàn thành bài học để nhận thêm xu.`}</span>}
              </>
            )}
          </div>
        </div>
        {!item.owned && (
          short ? (
            <Button type="button" variant="outline" className={cn(buttonClass, "mt-auto bg-muted text-muted-foreground disabled:opacity-100")} disabled aria-describedby={hintId} data-candle-action="short">
              {CANDLE_COPY.short}
            </Button>
          ) : (
            <Button type="button" className={cn(buttonClass, "mt-auto")} data-candle-action="buy" aria-label={`Mua thẻ ${item.name}`} onClick={() => onBuy(item)}>
              {CANDLE_COPY.buy}
            </Button>
          )
        )}
      </div>
    </article>
  )
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 max-[650px]:grid-cols-2" role="status" aria-label="Đang tải thẻ nến" data-testid="candle-cards-loading">
      {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[250px] rounded-xl" />)}
    </div>
  )
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function CandleCardsSection({ balance }: { balance: number }) {
  const cards = useCandleDojoCards()
  const view = useCandleCardsView()
  const focusToken = useCandleCardsFocusToken()
  const [buying, setBuying] = useState<string | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  // "Xem kho thẻ →" in the panel (or "Mở Shop › Thẻ nến" in Candle Dojo, possibly made before this section
  // mounted) asks for the section: scroll it into view and put keyboard focus on it.
  useEffect(() => {
    if (!takeCandleCardsFocus()) return
    const section = sectionRef.current
    if (!section) return
    section.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" })
    section.focus({ preventScroll: true })
  }, [focusToken])

  const data = isUsableCards(cards.data) ? cards.data : undefined
  const failed = !data && (cards.isError || !!cards.data)
  const count = data ? ownedTotal(data) : null

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="shop-candle-cards-title"
      data-candle-cards-section=""
      data-testid="candle-cards-section"
      className="mt-6 scroll-mt-3 border-t border-border pt-5 focus-visible:outline-none"
    >
      <Tabs value={view} onValueChange={(next) => setCandleCardsView(next === "owned" ? "owned" : "store")} className="gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 id="shop-candle-cards-title" className="font-heading text-base font-bold">{CANDLE_COPY.title}</h2>
            {count && (
              <span className="text-xs text-muted-foreground" data-testid="candle-cards-owned-count">{count.owned} / {count.total} đã sở hữu</span>
            )}
          </div>
          <TabsList aria-label={CANDLE_COPY.tabsLabel} className="h-9">
            <TabsTrigger value="store" className="px-3 text-xs">{CANDLE_COPY.tabStore}</TabsTrigger>
            <TabsTrigger value="owned" className="px-3 text-xs">{CANDLE_COPY.tabOwned}</TabsTrigger>
          </TabsList>
        </div>

        {cards.isRefetchError && data && (
          <RegionError message={CANDLE_COPY.refreshFailed} onRetry={() => void cards.refetch()} retrying={cards.isFetching} />
        )}

        {(["store", "owned"] as const).map((tab) => {
          const shown = data ? cardsOfView(data.items, tab) : []
          return (
            <TabsContent key={tab} value={tab} className="min-w-0 focus-visible:outline-none">
              {data ? (
                shown.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3.5 py-5 text-center text-xs leading-relaxed" data-testid="candle-cards-empty">
                    {emptyCardsText(data.items, tab)}
                  </p>
                ) : (
                  groupByTier(shown).map((group) => (
                    <div key={group.tier} data-candle-tier={group.tier}>
                      <div className="mt-4 mb-2.5 flex items-center justify-between gap-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase first:mt-0">
                        <span>{CD_TIER_INFO[group.tier].label}</span>
                        {tab === "owned" ? (
                          <span className="tabular-nums">{group.items.length} thẻ</span>
                        ) : (
                          <CoinAmount value={group.items[0].price_xu} className="text-[11px]" iconClassName="size-3.5" />
                        )}
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 max-[650px]:grid-cols-2">
                        {group.items.map((item) => (
                          <CandleCardCell key={item.card_id} item={item} balance={balance} view={tab} onBuy={(target) => setBuying(target.card_id)} />
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : failed ? (
                <RegionError message={CANDLE_COPY.loadFailed} onRetry={() => void cards.refetch()} retrying={cards.isFetching} />
              ) : (
                <CardsSkeleton />
              )}
            </TabsContent>
          )
        })}
      </Tabs>

      {buying && <CandleCardPurchaseDialog key={buying} cardId={buying} onClose={() => setBuying(null)} />}
    </section>
  )
}
