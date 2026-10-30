/**
 * Panel phải của Flashback v2 (spec v2 §6.3): khung đặt lệnh, cổ phiếu đang giữ và lệnh đã khớp.
 * Không có tab Xếp hạng; % của từng người nằm ở thanh người chơi trên màn chơi.
 *
 * Khung đặt lệnh: Mua/Bán, giá khớp (giá đóng cửa phiên đang hiện), Mua tối đa hoặc Bán được,
 * xem trước giá trị lệnh, phí và thuế. Lỗi hiện ngay dưới khung. Sau khi Hoàn thành hoặc hết giờ
 * thì không đặt lệnh được nữa.
 */
import { useEffect, useRef } from "react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useFlashback, type MatchApi } from "./flashback-context"
import {
  FLASHBACK_FEE_RATE,
  FLASHBACK_TAX_RATE,
  formatMoney,
  formatNumber,
  formatSignedMoney,
  formatSignedPercent,
  orderCashChange,
  orderPreview,
} from "./flashback-model"

export function FlashbackPanel() {
  const { match } = useFlashback()
  return (
    <SidebarPanel title="Flashback">
      {match ? (
        <OrderSections match={match} />
      ) : (
        <div className="space-y-3" role="status" aria-label="Đang tải ván chơi">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
    </SidebarPanel>
  )
}

function OrderSections({ match }: { match: MatchApi }) {
  const qtyInputRef = useRef<HTMLInputElement | null>(null)

  // Yêu cầu đưa con trỏ vào ô số cổ phiếu (phím tắt B/S, thanh Mua · Bán trên điện thoại).
  useEffect(() => {
    if (match.focusQtyTick > 0) qtyInputRef.current?.focus({ preventScroll: true })
  }, [match.focusQtyTick])

  const locked = match.finished || match.ended
  const buy = match.side === "buy"
  const parsedQty = Number.parseInt(match.qty, 10)
  const qtyNumber = Number.isFinite(parsedQty) ? parsedQty : 0
  const preview = orderPreview(match.side, qtyNumber, match.price)
  const feePercent = (FLASHBACK_FEE_RATE * 100).toFixed(2).replace(".", ",")
  const taxPercent = (FLASHBACK_TAX_RATE * 100).toFixed(1).replace(".", ",")

  return (
    <>
      <section className="space-y-2.5 rounded-lg border border-border bg-card p-3" aria-label="Đặt lệnh">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={buy}
            disabled={locked}
            className={cn(buy && "border-price-up bg-price-up/15 text-price-up hover:bg-price-up/20 hover:text-price-up")}
            onClick={() => match.setSide("buy")}
          >
            Mua
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={!buy}
            disabled={locked}
            className={cn(!buy && "border-price-down bg-price-down/15 text-price-down hover:bg-price-down/20 hover:text-price-down")}
            onClick={() => match.setSide("sell")}
          >
            Bán
          </Button>
        </div>

        <Row label="Giá khớp" value={match.price ? formatNumber(match.price) : "—"} />
        <Row label={buy ? "Mua tối đa" : "Bán được"} value={`${formatNumber(buy ? match.me.max_buy_qty : match.me.sellable)} cp`} />

        <div className="space-y-1.5">
          <Label htmlFor="flashback-qty" className="text-xs">
            Số cổ phiếu
          </Label>
          <Input
            id="flashback-qty"
            ref={qtyInputRef}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="0"
            value={match.qty}
            disabled={locked}
            onChange={(event) => match.setQty(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                match.submitOrder()
              }
            }}
            className="tabular-nums placeholder:text-text-secondary"
          />
        </div>

        <Row label="Giá trị lệnh" value={formatMoney(preview.value)} />
        <Row
          label={buy ? `Phí ${feePercent}%` : `Phí ${feePercent}% và thuế ${taxPercent}%`}
          value={formatMoney(preview.fee + preview.tax)}
        />
        <Row label={buy ? "Tổng tiền trả" : "Tiền nhận về"} value={formatMoney(preview.total)} />

        {match.orderError ? (
          <p role="alert" className="text-xs leading-5 font-medium text-destructive">
            {match.orderError}
          </p>
        ) : null}

        <Button
          type="button"
          className={cn(
            "w-full font-bold text-card",
            buy ? "bg-price-up hover:bg-price-up/90" : "bg-price-down hover:bg-price-down/90",
          )}
          disabled={locked || match.orderBusy || !qtyNumber || match.orderError !== null}
          onClick={match.submitOrder}
        >
          {buy ? "Đặt mua" : "Đặt bán"}
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h3 className="text-xs font-bold tracking-wide text-text-secondary uppercase">Cổ phiếu đang giữ</h3>
        {match.me.positions.length ? (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {match.me.positions.map((position, index) => (
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
                  <Badge variant="outline" className="shrink-0 border-price-up/50 text-[10px] text-price-up">
                    Đã về
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 border-status-warning/50 bg-status-warning/10 text-[10px] text-foreground">
                    {`Chờ về · còn ${position.sessions_left} phiên`}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-secondary">Chưa có cổ phiếu</p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h3 className="text-xs font-bold tracking-wide text-text-secondary uppercase">Lệnh đã khớp</h3>
        {match.me.orders.length ? (
          <ul className="m-0 list-none space-y-1.5 p-0">
            {[...match.me.orders].reverse().map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary">Phiên {order.step}</span>
                <span className="min-w-0">
                  <b className={order.side === "buy" ? "text-price-up" : "text-price-down"}>
                    {order.side === "buy" ? "Mua" : "Bán"}
                  </b>{" "}
                  <span className="tabular-nums">
                    {formatNumber(order.qty)} cp × {formatMoney(order.price)}
                  </span>
                </span>
                <b className="shrink-0 tabular-nums">{formatSignedMoney(orderCashChange(order))}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-secondary">Chưa có lệnh</p>
        )}
      </section>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-text-secondary">{label}</span>
      <b className="text-right font-semibold tabular-nums text-foreground">{value}</b>
    </div>
  )
}
