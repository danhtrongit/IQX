import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { ChartCard } from "./chart-card"

export interface FlowTopItem {
  ticker: string
  /** tỷ VND, signed (negative = sell, positive = buy). */
  value: number
  anomaly?: boolean
}

export interface FlowCardProps {
  title: string
  buyLabel?: string
  sellLabel?: string
  /** tỷ VND, positive. */
  buyValue: number
  /** tỷ VND, shown with a "−" prefix (the absolute value is used). */
  sellValue: number
  /** Up to 12 daily net values, signed; the last one is today. */
  streakBars: number[]
  streakLabel: ReactNode
  topSell: FlowTopItem[]
  topBuy: FlowTopItem[]
  topSellHeading?: string
  topBuyHeading?: string
}

function formatBillion(value: number): string {
  return Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })
}

function StreakBars({ bars }: { bars: number[] }) {
  if (bars.length === 0) return null
  const maxAbs = Math.max(...bars.map((bar) => Math.abs(bar)), 1)
  return (
    <div className="flex h-[22px] flex-1 items-end gap-[1.5px]">
      {bars.map((value, index) => (
        <div
          key={index}
          className={cn(
            "flex-1 rounded-t-[1px]",
            value >= 0 ? "bg-price-up" : "bg-price-down",
            index === bars.length - 1 ? "opacity-100" : "opacity-50",
          )}
          style={{ height: `${Math.max((Math.abs(value) / maxAbs) * 100, 8)}%` }}
        />
      ))}
    </div>
  )
}

function TopList({ items, isPositive }: { items: FlowTopItem[]; isPositive: boolean }) {
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 1)
  return (
    <div>
      {items.map((item) => {
        const widthPct = (Math.abs(item.value) / maxAbs) * 100
        const tone = isPositive ? "text-price-up" : "text-price-down"
        return (
          <div
            key={item.ticker}
            className={cn(
              "relative grid grid-cols-[40px_1fr_56px] items-center gap-1.5 text-xs",
              item.anomaly && "-mx-1.5 my-0.5 rounded-sm bg-accent/12 px-1.5 py-1",
            )}
          >
            <span className="font-bold text-foreground">{item.ticker}</span>

            <div className="h-1 overflow-hidden rounded-sm bg-muted">
              <div
                className={cn("h-full rounded-sm", isPositive ? "bg-price-up" : "bg-price-down")}
                style={{ width: `${widthPct}%` }}
              />
            </div>

            <div className={cn("text-right font-semibold tabular-nums", tone)}>
              {isPositive ? "+" : ""}
              {formatBillion(item.value)} tỷ
            </div>

            {item.anomaly && (
              <span className="pointer-events-none absolute top-1/2 right-[52px] -translate-y-1/2 rounded-[3px] bg-card px-1 text-xs font-bold tracking-[0.04em] whitespace-nowrap text-accent">
                BẤT THƯỜNG
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Shared "dòng tiền" shell behind `ForeignFlowCard` and `PropFlowCard`: buy/sell
 * totals bled to the card edges, the 12-session streak bar row with its label,
 * then the top-buy / top-sell lists. No data fetching here.
 */
export function FlowCard({
  title,
  buyLabel = "Tổng mua",
  sellLabel = "Tổng bán",
  buyValue,
  sellValue,
  streakBars,
  streakLabel,
  topSell,
  topBuy,
  topSellHeading = "▼ TOP BÁN",
  topBuyHeading = "▲ TOP MUA",
}: FlowCardProps) {
  return (
    <ChartCard title={title}>
      <div className="-mx-4 -mt-4 mb-3 grid grid-cols-2 gap-px bg-border">
        <div className="bg-card px-3 py-2.5 text-center">
          <div className="mb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {buyLabel}
          </div>
          <div className="text-base font-semibold tabular-nums text-price-up">
            +{formatBillion(buyValue)} tỷ
          </div>
        </div>

        <div className="bg-card px-3 py-2.5 text-center">
          <div className="mb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {sellLabel}
          </div>
          <div className="text-base font-semibold tabular-nums text-price-down">
            −{formatBillion(sellValue)} tỷ
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-sm bg-muted px-2.5 py-2">
        <StreakBars bars={streakBars} />
        <div className="text-xs leading-normal whitespace-nowrap text-muted-foreground">
          {streakLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-2 border-b border-border pb-1.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {topSellHeading}
          </div>
          <TopList items={topSell} isPositive={false} />
        </div>

        <div>
          <div className="mb-2 border-b border-border pb-1.5 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {topBuyHeading}
          </div>
          <TopList items={topBuy} isPositive />
        </div>
      </div>
    </ChartCard>
  )
}
