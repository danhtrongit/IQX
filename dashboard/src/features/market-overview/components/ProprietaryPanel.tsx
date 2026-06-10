import { Panel } from "./Panel"
import { formatVndBillion, changeColor, displayTicker } from "../utils"
import { useProprietaryTrading } from "../hooks"
import { IconBriefcase } from "../icons"

export function ProprietaryPanel() {
  const { data, loading } = useProprietaryTrading()
  const source = loading ? "mock" : "live"
  const maxBuy = data.topBuy.length ? Math.max(...data.topBuy.map((i) => i.value)) : 1
  const maxSell = data.topSell.length ? Math.max(...data.topSell.map((i) => i.value)) : 1

  return (
    <Panel
      title="Tự doanh"
      source={source}
      icon={<IconBriefcase className="text-[rgb(var(--primary-6))]" />}
    >
      <div className="flex h-full">
        <div className="flex-1 min-w-0 px-1.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[9px] text-[var(--color-text-3)] font-semibold uppercase tracking-wide">
              Mua ròng
            </span>
            <span className={`text-xs font-bold tabular-nums ${changeColor(data.netValue)}`}>
              +{formatVndBillion(data.netValue)}
            </span>
          </div>
          <div className="text-[8px] text-[var(--color-text-3)] uppercase tracking-wider mb-1">Top mua ròng</div>
          <div className="flex flex-col gap-1">
            {data.topBuy.map((item) => (
              <div key={item.symbol} className="flex items-center gap-1">
                <span
                  className="text-[10px] font-bold text-[var(--color-text-1)] w-[34px] min-w-[34px] max-w-[34px] truncate"
                  title={item.symbol}
                >
                  {displayTicker(item.symbol)}
                </span>
                <div className="flex-1 h-3.5 bg-[var(--color-fill-2)] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-up opacity-80 transition-all duration-500"
                    style={{ width: `${(item.value / maxBuy) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-[var(--color-text-2)] min-w-[50px] text-right whitespace-nowrap">
                  {formatVndBillion(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="w-px bg-[var(--color-fill-2)] shrink-0" />
        <div className="flex-1 min-w-0 px-1.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[9px] text-[var(--color-text-3)] font-semibold uppercase tracking-wide">
              Bán ròng
            </span>
            <span className="text-xs font-bold tabular-nums text-down">
              -{formatVndBillion(Math.abs(data.netSellValue))}
            </span>
          </div>
          <div className="text-[8px] text-[var(--color-text-3)] uppercase tracking-wider mb-1">Top bán ròng</div>
          <div className="flex flex-col gap-1">
            {data.topSell.map((item) => (
              <div key={item.symbol} className="flex items-center gap-1">
                <span
                  className="text-[10px] font-bold text-[var(--color-text-1)] w-[34px] min-w-[34px] max-w-[34px] truncate"
                  title={item.symbol}
                >
                  {displayTicker(item.symbol)}
                </span>
                <div className="flex-1 h-3.5 bg-[var(--color-fill-2)] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-down opacity-80 transition-all duration-500"
                    style={{ width: `${(item.value / maxSell) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-[var(--color-text-2)] min-w-[50px] text-right whitespace-nowrap">
                  -{formatVndBillion(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}
