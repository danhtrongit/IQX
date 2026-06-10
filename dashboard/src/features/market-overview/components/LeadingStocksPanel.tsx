import { useMemo } from "react"
import { Panel } from "./Panel"
import { formatImpactPoint, displayTicker } from "../utils"
import { useLeadingStocks } from "../hooks"
import { IconStar } from "@arco-design/web-react/icon"

export function LeadingStocksPanel() {
  const { data, loading } = useLeadingStocks()
  const source = loading ? "mock" : "live"

  const { topUp, topDown, maxUp, maxDown } = useMemo(() => {
    const up = data
      .filter((s) => s.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 10)
    const down = data
      .filter((s) => s.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution)
      .slice(0, 10)
    return {
      topUp: up,
      topDown: down,
      maxUp: up.length ? Math.max(...up.map((s) => Math.abs(s.contribution))) : 1,
      maxDown: down.length ? Math.max(...down.map((s) => Math.abs(s.contribution))) : 1,
    }
  }, [data])

  const isEmpty = topUp.length === 0 && topDown.length === 0

  return (
    <Panel
      title="Cổ phiếu dẫn dắt thị trường"
      source={source}
      icon={<IconStar className="text-[rgb(var(--gold-6))]" />}
    >
      {isEmpty ? (
        <div className="flex items-center justify-center h-[180px] text-[11px] text-[var(--color-text-3)]">
          Không có dữ liệu dẫn dắt.
        </div>
      ) : (
        <div className="flex h-full">
          <div className="flex-1 min-w-0 px-1.5">
            <div className="text-[8px] text-[var(--color-text-3)] uppercase tracking-wider mb-1.5 font-semibold">
              Top kéo tăng
            </div>
            <div className="flex flex-col gap-1">
              {topUp.map((item) => (
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
                      style={{ width: `${(Math.abs(item.contribution) / maxUp) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-[var(--color-text-2)] min-w-[44px] text-right whitespace-nowrap">
                    {formatImpactPoint(item.contribution)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-px bg-[var(--color-fill-2)] shrink-0" />
          <div className="flex-1 min-w-0 px-1.5">
            <div className="text-[8px] text-[var(--color-text-3)] uppercase tracking-wider mb-1.5 font-semibold">
              Top kéo giảm
            </div>
            <div className="flex flex-col gap-1">
              {topDown.map((item) => (
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
                      style={{ width: `${(Math.abs(item.contribution) / maxDown) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-[var(--color-text-2)] min-w-[44px] text-right whitespace-nowrap">
                    {formatImpactPoint(item.contribution)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
