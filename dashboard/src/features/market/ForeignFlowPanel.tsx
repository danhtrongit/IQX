import { Panel } from "./Panel";
import { formatVndBillion, changeColor, displayTicker } from "./utils";
import { useForeignFlow } from "./hooks";
import { Globe2 } from "lucide-react";

export function ForeignFlowPanel() {
  const { data, source } = useForeignFlow();
  const maxBuy = data.topBuy.length > 0 ? Math.max(...data.topBuy.map((i) => i.value)) : 1;
  const maxSell = data.topSell.length > 0 ? Math.max(...data.topSell.map((i) => i.value)) : 1;

  return (
    <Panel
      title="Khối ngoại"
      source={source}
      className="col-span-4"
      icon={<Globe2 size={14} className="text-cyan-300" />}
    >
      <div className="flex h-full">
        <div className="flex-1 min-w-0 px-1.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
              Mua ròng
            </span>
            <span
              className={`text-xs font-bold tabular-nums ${changeColor(data.netValue)}`}
            >
              +{formatVndBillion(data.buyValue)}
            </span>
          </div>
          <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">
            Top mua ròng
          </div>
          <div className="flex flex-col gap-1">
            {data.topBuy.map((item) => (
              <div key={item.symbol} className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-100 w-[34px] min-w-[34px] max-w-[34px] truncate" title={item.symbol}>
                  {displayTicker(item.symbol)}
                </span>
                <div className="flex-1 h-3.5 bg-slate-800 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-emerald-400 opacity-80 transition-all duration-500"
                    style={{ width: `${(item.value / maxBuy) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-slate-300 min-w-[50px] text-right whitespace-nowrap">
                  {formatVndBillion(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="w-px bg-cyan-900/50 shrink-0" />
        <div className="flex-1 min-w-0 px-1.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
              Bán ròng
            </span>
            <span className="text-xs font-bold tabular-nums text-red-400">
              -{formatVndBillion(data.sellValue)}
            </span>
          </div>
          <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">
            Top bán ròng
          </div>
          <div className="flex flex-col gap-1">
            {data.topSell.map((item) => (
              <div key={item.symbol} className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-100 w-[34px] min-w-[34px] max-w-[34px] truncate" title={item.symbol}>
                  {displayTicker(item.symbol)}
                </span>
                <div className="flex-1 h-3.5 bg-slate-800 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-red-500 opacity-80 transition-all duration-500"
                    style={{ width: `${(item.value / maxSell) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-slate-300 min-w-[50px] text-right whitespace-nowrap">
                  -{formatVndBillion(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
