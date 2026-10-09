/**
 * «Shop» tool panel (Shop spec 3.3). Order: Xu của bạn -> balance -> completed
 * lessons -> Lịch sử xu -> Đang sử dụng -> Đã sở hữu -> Vào Học viện.
 *
 * The balance and the owned list come from the same query as the main view and
 * the header chip. Each region reports its own loading or error; none of them
 * ever falls back to "0 xu" or "not owned". "Vào Học viện" only navigates: it
 * never completes a lesson or hands out coins.
 */
import { useState } from "react"
import { ArrowRight, BookOpen, Coins } from "lucide-react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ActivePreview } from "./active-preview"
import { HistoryDialog } from "./history-dialog"
import { MascotArt } from "./mascot-art"
import { SHOP_COPY, findEntry, formatXu, ownedEntries } from "./shop-model"
import { COIN_TEXT, RegionError, RegionLoading, SideTitle } from "./shop-ui"
import { useAcademyProgress, useActivateMascot, useShopState } from "./use-shop"

const LINK_BUTTON = "inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"

export function ShopPanel({ onNavigate }: { onNavigate: (panel: string) => void }) {
  const shop = useShopState()
  const progress = useAcademyProgress()
  const activation = useActivateMascot()
  const [historyOpen, setHistoryOpen] = useState(false)
  const state = shop.data
  const active = state ? findEntry(state, state.active.mascot_id) : undefined

  return (
    <SidebarPanel title="Shop" description="Linh thú và xu học tập">
      <section aria-labelledby="shop-wallet-title" className="rounded-xl border border-accent/40 bg-gradient-to-br from-accent/10 to-card p-4.5" data-testid="shop-wallet">
        <div id="shop-wallet-title" className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <Coins className={cn("size-4", COIN_TEXT)} aria-hidden="true" />
          Xu của bạn
        </div>
        {state ? (
          <p className={cn("mt-2 flex items-baseline gap-2", COIN_TEXT)}>
            <strong className="font-mono text-[33px] leading-tight font-bold tracking-tight tabular-nums" data-testid="shop-balance">{formatXu(state.wallet.balance)}</strong>
            <span className="text-sm font-semibold">xu</span>
          </p>
        ) : shop.isError ? (
          <RegionError className="mt-3" message={SHOP_COPY.loadFailed} onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
        ) : (
          <Skeleton className="mt-3 h-9 w-28" data-testid="shop-balance-loading" />
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-accent/20 pt-3 text-xs text-muted-foreground">
          <span data-testid="shop-lessons-done">
            {progress.data ? (
              `${progress.data.courseDone} bài đã hoàn thành`
            ) : progress.isError ? (
              <button type="button" className={LINK_BUTTON} onClick={() => void progress.refetch()}>Chưa tải được số bài · Thử lại</button>
            ) : (
              <RegionLoading label="Đang tải số bài…" />
            )}
          </span>
          <button type="button" className={cn(LINK_BUTTON, "shrink-0 text-foreground")} onClick={() => setHistoryOpen(true)}>
            {SHOP_COPY.history}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section aria-labelledby="shop-active-title">
        <SideTitle id="shop-active-title">Đang sử dụng</SideTitle>
        {state && active ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3" data-testid="shop-active">
            <ActivePreview mascotId={active.mascot_id} name={active.name} className="size-[120px] shrink-0 overflow-hidden rounded-lg bg-muted/40" />
            <div className="min-w-0">
              <h4 className="truncate font-heading text-[15px] font-bold" data-testid="shop-active-name">{active.name}</h4>
              <Badge variant="secondary" className="mt-1.5 text-primary">{SHOP_COPY.wearing}</Badge>
              <div className="mt-1.5">
                <button type="button" className={LINK_BUTTON} onClick={() => onNavigate("bot")}>
                  Xem trong Bot
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : state ? (
          <RegionError message="Linh thú đang sử dụng chưa có trong danh mục. Hãy tải lại Shop." onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
        ) : shop.isError ? (
          <RegionError message={SHOP_COPY.loadFailed} onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
        ) : (
          <Skeleton className="h-[144px] rounded-xl" />
        )}
      </section>

      <section aria-labelledby="shop-owned-title">
        <SideTitle id="shop-owned-title" aside={state ? `${state.owned_count} / ${state.total_count}` : undefined}>Đã sở hữu</SideTitle>
        {state ? (
          <ul className="divide-y divide-border" data-testid="shop-owned-list">
            {ownedEntries(state).map((entry) => {
              const wearing = state.active.mascot_id === entry.mascot_id
              const pending = activation.pendingMascotId === entry.mascot_id
              return (
                <li key={entry.mascot_id} className="flex items-center gap-2.5 py-2.5" data-shop-owned={entry.mascot_id}>
                  <MascotArt mascotId={entry.mascot_id} name={entry.name} decorative showReload={false} className="h-11 w-9 shrink-0 overflow-hidden rounded-md" />
                  <b className="min-w-0 flex-1 truncate text-xs">{entry.name}</b>
                  {wearing ? (
                    <Badge variant="secondary" className="text-primary">Đang dùng</Badge>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={activation.busy} aria-busy={pending || undefined} aria-label={`Sử dụng ${entry.name}`} onClick={() => void activation.activate(entry)}>
                      {pending ? "Đang đổi…" : SHOP_COPY.use}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : shop.isError ? (
          <RegionError message={SHOP_COPY.loadFailed} onRetry={() => void shop.refetch()} retrying={shop.isFetching} />
        ) : (
          <Skeleton className="h-[118px] rounded-xl" />
        )}
      </section>

      <div className="flex items-center gap-2.5 border-t border-border pt-4">
        <BookOpen className="size-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-xs">
          Hoàn thành bài học
          <span className="mt-0.5 block text-[11px] text-muted-foreground">Lần đầu · <span className={cn("font-semibold", COIN_TEXT)}>+100 xu</span></span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onNavigate("academy")}>
          {SHOP_COPY.enterAcademy}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </SidebarPanel>
  )
}
