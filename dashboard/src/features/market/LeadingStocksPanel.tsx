import { useMemo } from "react";
import { Panel } from "./Panel";
import { formatImpactPoint, displayTicker } from "./utils";
import { useLeadingStocks } from "./hooks";
import { Star } from "lucide-react";

export function LeadingStocksPanel() {
  const { data, source } = useLeadingStocks();

  // Split into topUp / topDown, sort, limit to top 5
  const { topUp, topDown, maxUp, maxDown } = useMemo(() => {
    const up = data
      .filter((s) => s.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 10);

    const down = data
      .filter((s) => s.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution)
      .slice(0, 10);

    return {
      topUp: up,
      topDown: down,
      maxUp: up.length > 0 ? Math.max(...up.map((s) => Math.abs(s.contribution))) : 1,
      maxDown: down.length > 0 ? Math.max(...down.map((s) => Math.abs(s.contribution))) : 1,
    };
  }, [data]);

  const isEmpty = topUp.length === 0 && topDown.length === 0;

  return (
    <Panel
      title="Cổ phiếu dẫn dắt thị trường"
      source={source}
      icon={
        <Star size={14} className="text-yellow-300" />
      }
    >
      {isEmpty ? (
        <div className="flex items-center justify-center h-[180px] text-[11px] text-slate-400">
          Không có dữ liệu dẫn dắt.
        </div>
      ) : (
        <div className="flex h-full">
          {/* Left: Top kéo tăng */}
          <div className="flex-1 min-w-0 px-1.5">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
              Top kéo tăng
            </div>
            <div className="flex flex-col gap-1">
              {topUp.map((item) => (
                <div key={item.symbol} className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-100 w-[34px] min-w-[34px] max-w-[34px] truncate" title={item.symbol}>
                    {displayTicker(item.symbol)}
                  </span>
                  <div className="flex-1 h-3.5 bg-slate-800 rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm bg-emerald-400 opacity-80 transition-all duration-500"
                      style={{ width: `${(Math.abs(item.contribution) / maxUp) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-slate-300 min-w-[44px] text-right whitespace-nowrap">
                    {formatImpactPoint(item.contribution)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Divider */}
          <div className="w-px bg-cyan-900/50 shrink-0" />
          {/* Right: Top kéo giảm */}
          <div className="flex-1 min-w-0 px-1.5">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
              Top kéo giảm
            </div>
            <div className="flex flex-col gap-1">
              {topDown.map((item) => (
                <div key={item.symbol} className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-100 w-[34px] min-w-[34px] max-w-[34px] truncate" title={item.symbol}>
                    {displayTicker(item.symbol)}
                  </span>
                  <div className="flex-1 h-3.5 bg-slate-800 rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm bg-red-500 opacity-80 transition-all duration-500"
                      style={{ width: `${(Math.abs(item.contribution) / maxDown) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] tabular-nums text-slate-300 min-w-[44px] text-right whitespace-nowrap">
                    {formatImpactPoint(item.contribution)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
