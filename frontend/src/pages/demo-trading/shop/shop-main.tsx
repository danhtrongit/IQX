/**
 * «Shop» main view: Linh thú collection (Shop spec 3.2).
 *
 * "Cửa hàng" lists the four mascots for sale, "Đã sở hữu" the default mascot and
 * everything owned. Every card is one of: Mua / Chưa đủ xu (locked) / Sử dụng /
 * Đang sử dụng, derived only from the server's balance, ownership and active
 * mascot. Cards carry no stats, rarity or trading advantage. While the panel is a
 * slide-over (<= 900px) the balance and the coin history are reachable here too.
 */
import { useState, type CSSProperties } from "react"
import { Check, Coins } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { MASCOT_MANIFEST } from "../journey/config"
import { HistoryDialog } from "./history-dialog"
import { MascotArt } from "./mascot-art"
import { PurchaseDialog } from "./purchase-dialog"
import type { CatalogEntry, ShopState } from "./shop-api"
import {
  SHOP_COPY,
  deriveCardState,
  formatXu,
  isMascotId,
  ownedEntries,
  storeEntries,
  type CardState,
} from "./shop-model"
import { COIN_TEXT, CoinAmount, RegionError } from "./shop-ui"
import { useActivateMascot, useShopState } from "./use-shop"

type View = "store" | "owned"

function ShopCard({ entry, state, onBuy, onUse, busy, pendingMascotId }: {
  entry: CatalogEntry
  state: ShopState
  onBuy: (entry: CatalogEntry) => void
  onUse: (entry: CatalogEntry) => void
  busy: boolean
  pendingMascotId: string | null
}) {
  const card = deriveCardState(entry, state)
  const owned = card === "owned" || card === "active"
  const shortfall = Math.max(0, entry.price_xu - state.wallet.balance)
  const accent = isMascotId(entry.mascot_id) ? MASCOT_MANIFEST[entry.mascot_id].accent : "var(--primary)"
  const hintId = `shop-hint-${entry.mascot_id}`

  return (
    <article
      data-shop-card={entry.mascot_id}
      data-card-state={card}
      aria-label={`Linh thú ${entry.name}`}
      tabIndex={-1}
      style={{ "--mascot-accent": accent } as CSSProperties}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card transition-colors motion-reduce:transition-none",
        card === "active" ? "border-primary" : "border-border hover:border-primary/40",
      )}
    >
      <div className="relative h-[205px] overflow-hidden bg-[radial-gradient(ellipse_at_50%_90%,color-mix(in_srgb,var(--mascot-accent)_20%,transparent)_0,transparent_73%)] min-[901px]:h-[193px] min-[1261px]:h-[214px] min-[1750px]:h-[246px] max-[650px]:h-[215px]">
        <MascotArt mascotId={entry.mascot_id} name={entry.name} className="size-full" imageClassName="[mask-image:linear-gradient(to_right,transparent_0,#000_5%,#000_95%,transparent_100%)]" />
        {owned && (
          <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-sm border border-border bg-background/85 px-2 py-0.5 text-[10px] text-foreground">
            <Check className="size-3" aria-hidden="true" />
            {SHOP_COPY.owned}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 min-[901px]:max-[1260px]:px-3">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-base font-bold min-[901px]:max-[1260px]:text-sm">{entry.name}</h3>
          <div className="mt-1 min-h-4 text-[11px] text-muted-foreground">
            {entry.is_default && owned ? (
              SHOP_COPY.defaultMascot
            ) : owned ? (
              SHOP_COPY.owned
            ) : card === "unavailable" ? (
              SHOP_COPY.unavailable
            ) : (
              <>
                <CoinAmount value={entry.price_xu} className="text-[11px] font-medium" iconClassName="size-3.5" />
                {card === "short" && <span id={hintId} className="sr-only">{`Còn thiếu ${formatXu(shortfall)} xu. Hoàn thành bài học để nhận thêm xu.`}</span>}
              </>
            )}
          </div>
        </div>
        <CardButton card={card} entry={entry} onBuy={onBuy} onUse={onUse} busy={busy} pending={pendingMascotId === entry.mascot_id} describedBy={card === "short" ? hintId : undefined} />
      </div>
    </article>
  )
}

function CardButton({ card, entry, onBuy, onUse, busy, pending, describedBy }: {
  card: CardState
  entry: CatalogEntry
  onBuy: (entry: CatalogEntry) => void
  onUse: (entry: CatalogEntry) => void
  busy: boolean
  pending: boolean
  describedBy?: string
}) {
  const className = "min-h-9 min-w-[104px] text-xs min-[901px]:max-[1260px]:min-w-[92px]"
  switch (card) {
    case "buy":
      return <Button type="button" className={className} data-shop-action="buy" onClick={() => onBuy(entry)}>{SHOP_COPY.buy}</Button>
    case "short":
      return <Button type="button" variant="outline" className={cn(className, "bg-muted text-muted-foreground disabled:opacity-100")} disabled aria-describedby={describedBy} data-shop-action="short">{SHOP_COPY.short}</Button>
    case "owned":
      return (
        <Button type="button" variant="outline" className={cn(className, "border-primary/50 text-primary hover:text-primary")} disabled={busy} aria-busy={pending || undefined} data-shop-action="use" onClick={() => onUse(entry)}>
          {pending ? "Đang đổi…" : SHOP_COPY.use}
        </Button>
      )
    case "active":
      return <Button type="button" variant="secondary" className={cn(className, "border-primary/30 bg-primary/15 text-primary disabled:opacity-100")} disabled data-shop-action="active">{SHOP_COPY.wearing}</Button>
    default:
      return <Button type="button" variant="outline" className={cn(className, "bg-muted text-muted-foreground disabled:opacity-100")} disabled data-shop-action="unavailable">{SHOP_COPY.unavailable}</Button>
  }
}

function MainSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Đang tải Shop" data-testid="shop-main-loading">
      <div className="flex items-center justify-between gap-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-8 w-44" /></div>
      <div className="grid grid-cols-1 gap-3.5 min-[651px]:grid-cols-2">
        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[280px] rounded-xl" />)}
      </div>
    </div>
  )
}

export function ShopMain({ onNavigate }: { onNavigate: (panel: string) => void }) {
  const shop = useShopState()
  const activation = useActivateMascot()
  const [view, setView] = useState<View>("store")
  const [buying, setBuying] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const state = shop.data

  if (!state) {
    return shop.isError
      ? <RegionError message={SHOP_COPY.loadFailed} onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
      : <MainSkeleton />
  }

  return (
    <div className="mx-auto w-full max-w-[1190px] space-y-3" data-testid="shop-main">
      {shop.isRefetchError && (
        <RegionError message="Chưa cập nhật được dữ liệu mới nhất. Đang hiển thị dữ liệu đã xác nhận gần nhất." onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
      )}

      <div
        data-testid="shop-mobile-wallet"
        className="flex items-center gap-2.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 min-[901px]:hidden"
      >
        <Coins className={cn("size-5 shrink-0", COIN_TEXT)} aria-hidden="true" />
        <strong className={cn("text-base tabular-nums", COIN_TEXT)}>{formatXu(state.wallet.balance)} xu</strong>
        <Button type="button" variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setHistoryOpen(true)}>{SHOP_COPY.history}</Button>
      </div>

      <Tabs value={view} onValueChange={(next) => setView(next === "owned" ? "owned" : "store")} className="gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="font-heading text-base font-bold">{SHOP_COPY.title}</h2>
            <span className="text-xs text-muted-foreground" data-testid="shop-owned-count">{state.owned_count} / {state.total_count} đã sở hữu</span>
          </div>
          <TabsList aria-label="Bộ sưu tập linh thú" className="h-9">
            <TabsTrigger value="store" className="px-3 text-xs">{SHOP_COPY.tabStore}</TabsTrigger>
            <TabsTrigger value="owned" className="px-3 text-xs">{SHOP_COPY.tabOwned}</TabsTrigger>
          </TabsList>
        </div>
        {(["store", "owned"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="min-w-0 focus-visible:outline-none">
            <div className="grid grid-cols-1 gap-3.5 min-[651px]:grid-cols-2 min-[1750px]:gap-4">
              {(tab === "store" ? storeEntries(state) : ownedEntries(state)).map((entry) => (
                <ShopCard
                  key={entry.mascot_id}
                  entry={entry}
                  state={state}
                  busy={activation.busy}
                  pendingMascotId={activation.pendingMascotId}
                  onBuy={(target) => setBuying(target.mascot_id)}
                  onUse={(target) => void activation.activate(target)}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {buying && (
        <PurchaseDialog
          key={buying}
          mascotId={buying}
          onClose={() => setBuying(null)}
          onEnterAcademy={() => onNavigate("academy")}
        />
      )}
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
