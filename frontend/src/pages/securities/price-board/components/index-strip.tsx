import { useMemo } from "react"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, ReferenceLine, YAxis } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

import { securitiesKeys } from "../../keys"
import { fetchIndexIntraday } from "../../market/api"
import { fmtChange, fmtClock, fmtIndex, fmtMillion, fmtPercent, fmtValueBil, signTone } from "../../market/format"
import { useIndices } from "../../market/hooks"
import type { MarketIndexQuote } from "../../market/types"

const INTRADAY_REFRESH_MS = 60_000

/** 4 thẻ chỉ số chính; `quoteSymbol` là mã gửi lên endpoint OHLCV. */
const CARDS: { name: string; quoteSymbol: string }[] = [
  { name: "VN-Index", quoteSymbol: "VNINDEX" },
  { name: "VN30", quoteSymbol: "VN30" },
  // OHLCV upstream chỉ nhận "HNX" (HNXIndex/HNXINDEX → 502)
  { name: "HNX-Index", quoteSymbol: "HNX" },
  { name: "HNX30", quoteSymbol: "HNX30" },
]

const TREND_COLOR: Record<MarketIndexQuote["trend"], string> = {
  up: "var(--price-up)",
  down: "var(--price-down)",
  flat: "var(--price-ref)",
}

const chartConfig = {
  close: { label: "Điểm chỉ số", color: "var(--chart-1)" },
} satisfies ChartConfig

const chartValue = (point: number) => point

/** Breadth "↑x —y ↓z" with the board's price colours. */
function Breadth({ index }: { index: MarketIndexQuote | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums">
      <span className="flex items-center text-price-up"><ArrowUp aria-label="Tăng" className="size-3" />{index?.advances ?? "-"}</span>
      <span className="flex items-center text-price-ref"><Minus aria-label="Đứng giá" className="size-3" />{index?.noChange ?? "-"}</span>
      <span className="flex items-center text-price-down"><ArrowDown aria-label="Giảm" className="size-3" />{index?.declines ?? "-"}</span>
    </span>
  )
}

export function IndexCard({ name, quoteSymbol, live }: { name: string; quoteSymbol: string; live: MarketIndexQuote | null }) {
  const intraday = useQuery({
    queryKey: securitiesKeys.indexIntraday(quoteSymbol),
    queryFn: () => fetchIndexIntraday(quoteSymbol),
    refetchInterval: INTRADAY_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: INTRADAY_REFRESH_MS - 5_000,
  })

  // Điểm live mới nhất nối vào cuối chuỗi 5m giữa hai lần refetch.
  const closes = useMemo(() => {
    const base = intraday.data?.closes ?? []
    if (live && live.value > 0 && base[base.length - 1] !== live.value) return [...base, live.value]
    return base
  }, [intraday.data, live])

  const refValue =
    intraday.data?.refValue ?? (live && live.value > 0 ? live.value - live.change : null)
  const lastValue = closes.length > 0 ? closes[closes.length - 1] : (live?.value ?? 0)
  const trend: MarketIndexQuote["trend"] =
    refValue !== null && lastValue > 0
      ? lastValue > refValue
        ? "up"
        : lastValue < refValue
          ? "down"
          : "flat"
      : (live?.trend ?? "flat")

  return (
    <Card size="sm" role="group" aria-label={name} className="gap-1 border border-border py-2">
      <CardContent className="flex flex-col gap-1 px-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-bold text-foreground">{name}</span>
          <Breadth index={live} />
        </div>

        {closes.length >= 2 ? (
          <div aria-hidden="true">
            <ChartContainer config={chartConfig} className="aspect-auto! h-12 w-full">
              <AreaChart
                data={closes}
                margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
                accessibilityLayer={false}
              >
                <YAxis hide domain={["dataMin", "dataMax"]} width={0} />
                <ReferenceLine
                  y={refValue ?? undefined}
                  stroke="var(--price-ref)"
                  strokeOpacity={0.5}
                  strokeDasharray="4 3"
                />
                <Area
                  dataKey={chartValue}
                  type="monotone"
                  stroke={TREND_COLOR[trend]}
                  fill={TREND_COLOR[trend]}
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-12 w-full items-center justify-center text-xs text-muted-foreground">
            {intraday.isLoading ? "Đang tải diễn biến…" : "Chưa có dữ liệu phiên"}
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-sm font-bold tabular-nums", signTone(live?.change ?? 0))}>
            {fmtIndex(live?.value ?? lastValue)}
          </span>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              live ? signTone(live.change) : "text-muted-foreground",
            )}
          >
            {live ? `${fmtChange(live.change)} (${fmtPercent(live.changePercent)})` : "—"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">KLGD {fmtMillion(live?.volume)} triệu CP</span>
          <span className="tabular-nums">
            GTGD {fmtValueBil(live?.totalValue)} tỷ
            {live?.time && <> · {fmtClock(live.time)}</>}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** Dải 4 thẻ chỉ số (VN-Index, VN30, HNX-Index, HNX30) kèm diễn biến trong phiên. */
export function IndexStrip() {
  const { indices } = useIndices()
  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-4"
      data-tour-id="tour-banggia-index-strip"
    >
      {CARDS.map((card) => (
        <IndexCard
          key={card.quoteSymbol}
          name={card.name}
          quoteSymbol={card.quoteSymbol}
          live={indices.find((index) => index.name === card.name) ?? null}
        />
      ))}
    </div>
  )
}
