/**
 * Stock identification bar: ticker block, price grid and the LIVE marker.
 * Prices arrive in đồng; they are grouped with the app-wide vi-VN formatter.
 */
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { StockHeader } from "../types"

const LABEL_CLASS = "mb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"

export function HeaderStrip({ header }: { header: StockHeader }) {
  const { symbol, sector, indexGroup, price, changePercent, high, low, volume, isLive } = header

  const pct = Number.isFinite(changePercent)
    ? `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`
    : "—"
  const pctTone =
    changePercent > 0 ? "text-price-up" : changePercent < 0 ? "text-price-down" : "text-price-ref"

  return (
    <div
      data-tour-id="tour-phantich-header"
      className="grid grid-cols-1 items-center gap-4 rounded-lg border-0 bg-card px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:gap-6"
    >
      {/* Ticker block */}
      <div className="border-b border-border pb-3 sm:border-r sm:border-b-0 sm:pr-6 sm:pb-0">
        <div className="font-heading text-3xl leading-none font-bold tracking-tight">{symbol}</div>
        <div className="mt-1 text-xs tracking-wide text-muted-foreground">
          {sector} · {indexGroup}
        </div>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
        <div className="flex flex-col">
          <span className={LABEL_CLASS}>Giá</span>
          <span className="text-xl leading-none font-medium tabular-nums">{formatNumber(price)}</span>
        </div>
        <div className="flex flex-col">
          <span className={LABEL_CLASS}>% Phiên</span>
          <span className={cn("text-sm leading-none font-medium tabular-nums", pctTone)}>
            {pct}
          </span>
        </div>
        <div className="flex flex-col">
          <span className={LABEL_CLASS}>Cao / Thấp</span>
          <span className="text-sm leading-none font-medium tabular-nums">
            {formatNumber(high)} / {formatNumber(low)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className={LABEL_CLASS}>Khối lượng</span>
          <span className="text-sm leading-none font-medium tabular-nums">{volume}</span>
        </div>
      </div>

      {/* Live indicator */}
      {isLive ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          <span className="block size-1.5 rounded-full bg-price-up" aria-hidden="true" />
          LIVE
        </div>
      ) : null}
    </div>
  )
}
