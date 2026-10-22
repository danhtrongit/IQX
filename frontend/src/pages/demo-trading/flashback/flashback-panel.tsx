/**
 * Panel phải của Flashback (spec v1.1 §2.6, §2.9): hai tab "Giao dịch" và "Xếp hạng".
 *
 * Tab Giao dịch: khung đặt lệnh (Mua/Bán, giá khớp, Mua tối đa hoặc Bán được, xem trước giá trị
 * lệnh, phí và thuế), danh sách cổ phiếu đang giữ và danh sách lệnh đã khớp. Lỗi hiện ngay
 * dưới khung đặt lệnh.
 *
 * Tab Xếp hạng: top 10 và dòng của chính người chơi, theo "Toàn IQX" hoặc "Nhóm của tôi".
 */
import { useEffect, useRef, useState } from "react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { FlashbackLeaderboardScope } from "./flashback-api"
import { useFlashback } from "./flashback-context"
import {
  FLASHBACK_FEE_RATE,
  FLASHBACK_TAX_RATE,
  formatMoney,
  formatNumber,
  formatSignedPercent,
  maxBuyQty,
  orderPreview,
  sellableQty,
} from "./flashback-model"
import { useFlashbackLeaderboard } from "./use-flashback"

export function FlashbackPanel({ onNavigate }: { onNavigate: (panel: string) => void }) {
  const game = useFlashback()
  const [scope, setScope] = useState<FlashbackLeaderboardScope>("all")
  const qtyInputRef = useRef<HTMLInputElement | null>(null)
  const leaderboard = useFlashbackLeaderboard(scope, game.panelTab === "rank")

  // Yêu cầu đưa con trỏ vào ô số cổ phiếu (phím tắt B/S, thanh Mua · Bán trên điện thoại).
  useEffect(() => {
    if (game.focusQtyTick > 0) qtyInputRef.current?.focus({ preventScroll: true })
  }, [game.focusQtyTick])

  const price = game.lastClose
  const qty = Number.parseInt(game.qty, 10)
  const qtyNumber = Number.isFinite(qty) ? qty : 0
  const preview = orderPreview(game.side, qtyNumber, price)
  const maxBuy = maxBuyQty(game.cash, price)
  const sellable = sellableQty(game.entry?.positions ?? [], game.step)
  const joined = game.entry !== null

  return (
    <SidebarPanel title="Flashback" description="Giao dịch và xếp hạng">
      <Tabs
        value={game.panelTab}
        onValueChange={(value) => game.setPanelTab(value === "rank" ? "rank" : "trade")}
        className="gap-3"
      >
        <TabsList aria-label="Bảng điều khiển Flashback" className="h-9 w-full">
          <TabsTrigger value="trade" className="flex-1 px-3 text-xs">Giao dịch</TabsTrigger>
          <TabsTrigger value="rank" className="flex-1 px-3 text-xs">Xếp hạng</TabsTrigger>
        </TabsList>

        <TabsContent value="trade" className="mt-3 space-y-3 focus-visible:outline-none">
          <section className="space-y-2.5 rounded-lg border border-border bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={game.side === "buy" ? "default" : "outline"}
                size="sm"
                onClick={() => game.setSide("buy")}
              >
                Mua
              </Button>
              <Button
                type="button"
                variant={game.side === "sell" ? "destructive" : "outline"}
                size="sm"
                onClick={() => game.setSide("sell")}
              >
                Bán
              </Button>
            </div>

            <Row label="Giá khớp" value={price ? formatNumber(price) : "—"} />
            <Row
              label={game.side === "buy" ? "Mua tối đa" : "Bán được"}
              value={`${formatNumber(game.side === "buy" ? maxBuy : sellable)} cp`}
            />

            <div className="space-y-1.5">
              <Label htmlFor="flashback-qty" className="text-xs">Số cổ phiếu</Label>
              <Input
                id="flashback-qty"
                ref={qtyInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="0"
                value={game.qty}
                disabled={!joined}
                onChange={(event) => game.setQty(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    game.submitOrder()
                  }
                }}
                className="tabular-nums"
              />
            </div>

            <Row label="Giá trị lệnh" value={formatMoney(preview.value)} />
            <Row
              label={game.side === "buy" ? `Phí ${(FLASHBACK_FEE_RATE * 100).toFixed(2).replace(".", ",")}%` : `Phí ${(FLASHBACK_FEE_RATE * 100).toFixed(2).replace(".", ",")}% và thuế ${(FLASHBACK_TAX_RATE * 100).toFixed(1).replace(".", ",")}%`}
              value={formatMoney(preview.fee + preview.tax)}
            />
            <Row
              label={game.side === "buy" ? "Tổng tiền trả" : "Tiền nhận về"}
              value={formatMoney(preview.total)}
            />

            {game.orderError ? (
              <p role="alert" className="text-xs leading-5 text-destructive">{game.orderError}</p>
            ) : null}

            <Button
              type="button"
              className="w-full"
              disabled={!joined || game.orderBusy || !qtyNumber || game.orderError !== null}
              onClick={game.submitOrder}
            >
              {game.side === "buy" ? "Đặt mua" : "Đặt bán"}
            </Button>
            {!joined ? (
              <p className="text-xs text-muted-foreground">Tham gia đề để đặt lệnh.</p>
            ) : null}
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-card p-3">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Cổ phiếu đang giữ</h3>
            {game.entry?.positions.length ? (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {game.entry.positions.map((position, index) => (
                  <li key={`${position.step}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <b className="tabular-nums">{formatNumber(position.qty)}</b> cp · giá{" "}
                      <span className="tabular-nums">{formatMoney(position.price)}</span>{" "}
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          position.pnl_pct > 0 ? "text-price-up" : position.pnl_pct < 0 ? "text-price-down" : "text-foreground",
                        )}
                      >
                        {formatSignedPercent(position.pnl_pct * 100, 1)}
                      </span>
                    </span>
                    {position.status === "settled" ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px] text-price-up">Đã về</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {`Chờ về · còn ${position.sessions_left} phiên`}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa có cổ phiếu</p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-card p-3">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Lệnh đã khớp</h3>
            {game.entry?.orders.length ? (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {[...game.entry.orders].reverse().map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Phiên {order.step}</span>
                    <span className="min-w-0">
                      <b className={order.side === "buy" ? "text-price-up" : "text-price-down"}>
                        {order.side === "buy" ? "Mua" : "Bán"}
                      </b>{" "}
                      <span className="tabular-nums">{formatNumber(order.qty)} cp × {formatMoney(order.price)}</span>
                    </span>
                    <b className="shrink-0 tabular-nums">{formatMoney(order.amount)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Chưa có lệnh</p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="rank" className="mt-3 space-y-3 focus-visible:outline-none">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={scope === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("all")}
            >
              Toàn IQX
            </Button>
            <Button
              type="button"
              variant={scope === "team" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("team")}
            >
              Nhóm của tôi
            </Button>
          </div>

          <section className="space-y-1.5 rounded-lg border border-border bg-card p-3">
            {game.round?.round_no != null ? (
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold tracking-wide text-muted-foreground uppercase">Bảng xếp hạng</span>
                <span className="font-semibold text-foreground">{`Đề #${game.round.round_no}`}</span>
              </div>
            ) : null}
            {leaderboard.isPending ? (
              <p className="text-xs text-muted-foreground">Đang tải bảng xếp hạng…</p>
            ) : leaderboard.isError ? (
              <p role="alert" className="text-xs text-destructive">Chưa tải được bảng xếp hạng.</p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {leaderboard.data?.rows.map((row) => (
                  <li key={row.user_id} className="flex items-center gap-2 text-xs">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{row.rank}</span>
                    <span className={cn("min-w-0 flex-1 truncate", row.is_me && "font-semibold text-foreground")}>
                      {row.username}
                      {row.status === "playing" ? (
                        <span className="text-muted-foreground"> · đang chơi phiên {row.step}/60</span>
                      ) : null}
                    </span>
                    <b
                      className={cn(
                        "shrink-0 tabular-nums",
                        (row.pnl_percent ?? 0) > 0
                          ? "text-price-up"
                          : (row.pnl_percent ?? 0) < 0
                            ? "text-price-down"
                            : "text-foreground",
                      )}
                    >
                      {formatSignedPercent(row.pnl_percent)}
                    </b>
                  </li>
                ))}
                {leaderboard.data?.me &&
                !leaderboard.data.rows.some(
                  (row) => row.is_me || row.user_id === leaderboard.data.me?.user_id,
                ) ? (
                  <li className="flex items-center gap-2 border-t border-border pt-1.5 text-xs">
                    <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                      {leaderboard.data.me.rank === 0 ? "—" : leaderboard.data.me.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      {leaderboard.data.me.username}
                      {leaderboard.data.me.status === "playing" ? (
                        <span className="text-muted-foreground"> · đang chơi phiên {leaderboard.data.me.step}/60</span>
                      ) : null}
                    </span>
                    <b className="shrink-0 tabular-nums text-foreground">{formatSignedPercent(leaderboard.data.me.pnl_percent)}</b>
                  </li>
                ) : null}
                {!leaderboard.data?.rows.length && !leaderboard.data?.me ? (
                  <li className="text-xs text-muted-foreground">Chưa có người chơi nào trong bảng xếp hạng.</li>
                ) : null}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              {leaderboard.data ? `${formatNumber(leaderboard.data.total_players)} người đã tham gia` : ""}
            </p>
          </section>

          <section className="space-y-1.5 rounded-lg border border-chart-2/40 bg-chart-2/10 p-3">
            <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Thưởng xu mỗi đề</h3>
            {game.round?.reward_table
              .filter((row) => (row.reward_xu ?? row.xu ?? 0) > 0)
              .map((row) => {
                const rewardXu = row.reward_xu ?? row.xu ?? 0
                const label =
                  row.to_rank === row.from_rank
                    ? `Hạng ${row.from_rank}`
                    : row.to_rank
                      ? `Hạng ${row.from_rank}–${row.to_rank}`
                      : `Từ ${row.from_rank} trở xuống`
                return (
                  <Row
                    key={`${row.from_rank}-${row.to_rank ?? "last"}`}
                    label={label}
                    value={`${formatNumber(rewardXu)} xu`}
                  />
                )
              })}
            <Row label="Phí tham gia" value={`${formatNumber(game.round?.fee_xu ?? 100)} xu, lần đầu miễn phí`} />
          </section>

          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onNavigate("academy")}>
            Học bài chỉ báo ở Học viện
          </Button>
        </TabsContent>
      </Tabs>
    </SidebarPanel>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <b className="text-right font-semibold tabular-nums text-foreground">{value}</b>
    </div>
  )
}
