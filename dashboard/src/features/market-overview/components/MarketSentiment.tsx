import { Panel } from "./Panel"
import {
  formatVndBillion,
  formatVolume,
  changeColor,
  changeArrow,
  MASCOT_HEIGHT,
} from "../utils"
import { useMarketOverview, useForeignFlow } from "../hooks"
import { IconSparkles, IconBars } from "@/shared/icons"
import { IconTrendingUp, IconTrendingDown } from "../icons"

export function MarketSentiment() {
  const { data: overview, loading } = useMarketOverview()
  const { data: foreign } = useForeignFlow()
  const market = overview
  const source = loading ? "mock" : "live"

  const sentiment =
    market.vnindex.changePercent > 0.5
      ? "bull"
      : market.vnindex.changePercent < -0.5
        ? "bear"
        : "turtle"
  const sentimentAsset =
    sentiment === "bull"
      ? "/mascots/bull-green.png"
      : sentiment === "bear"
        ? "/mascots/bear-red.png"
        : "/mascots/turtle-yellow.png"

  const volume = market.vnindex.volume
  const changePct = market.vnindex.changePercent
  const totalFlow = foreign.buyValue + foreign.sellValue

  return (
    <Panel
      title="Tâm lý thị trường"
      source={source}
      icon={<IconSparkles className="text-[rgb(var(--gold-6))]" />}
    >
      <div className="flex flex-col gap-2 h-full">
        <div
          className="w-full overflow-hidden rounded-lg bg-[var(--color-fill-2)] relative"
          style={{ height: MASCOT_HEIGHT }}
        >
          <img
            src={sentimentAsset}
            alt={`Tâm lý: ${sentiment}`}
            className="w-full h-full rounded-lg object-contain"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="flex items-center gap-2 p-1.5 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]">
            <IconBars className="text-[rgb(var(--primary-6))] shrink-0 text-xl" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-[var(--color-text-3)] font-semibold uppercase tracking-wide">
                KLGD
              </span>
              <span className="text-sm font-bold tabular-nums whitespace-nowrap text-[var(--color-text-1)]">
                {formatVolume(volume)}
              </span>
              <span className={`text-[9px] tabular-nums font-semibold ${changeColor(changePct)}`}>
                {changeArrow(changePct)} {changePct > 0 ? "+" : ""}
                {Math.round(changePct)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]">
            <IconTrendingUp className="text-up shrink-0 text-xl" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-[var(--color-text-3)] font-semibold uppercase tracking-wide">
                NN mua
              </span>
              <span className="text-sm font-bold tabular-nums text-up whitespace-nowrap">
                {formatVndBillion(foreign.buyValue)}
              </span>
              <span className="text-[9px] tabular-nums font-semibold text-up">
                ▲ {totalFlow > 0 ? Math.round((foreign.buyValue / totalFlow) * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]">
            <IconTrendingDown className="text-down shrink-0 text-xl" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-[var(--color-text-3)] font-semibold uppercase tracking-wide">
                NN bán
              </span>
              <span className="text-sm font-bold tabular-nums text-down whitespace-nowrap">
                {formatVndBillion(foreign.sellValue)}
              </span>
              <span className="text-[9px] tabular-nums font-semibold text-down">
                ▼ {totalFlow > 0 ? Math.round((foreign.sellValue / totalFlow) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
