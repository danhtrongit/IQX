import { Panel } from "./Panel";
import { formatVndBillion, formatVolume, changeColor, changeArrow, MASCOT_HEIGHT } from "./utils";
import { useMarketOverview, useForeignFlow } from "./hooks";
import {
  Sparkles,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export function MarketSentiment() {
  const { data: overview, source } = useMarketOverview();
  const { data: foreign } = useForeignFlow();
  const market = overview;

  const sentiment =
    market.vnindex.changePercent > 0.5
      ? "bull"
      : market.vnindex.changePercent < -0.5
        ? "bear"
        : "turtle";
  const sentimentAsset =
    sentiment === "bull"
      ? "/mascots/bull-green.png"
      : sentiment === "bear"
        ? "/mascots/bear-red.png"
        : "/mascots/turtle-yellow.png";

  const volume = market.vnindex.volume;
  const changePct = market.vnindex.changePercent;
  const totalFlow = foreign.buyValue + foreign.sellValue;

  return (
    <Panel
      title="Tâm lý thị trường"
      source={source}
      className="col-span-4"
      icon={
        <Sparkles size={14} className="text-yellow-300" />
      }
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Mascot banner — full width horizontal, no text, fills available height */}
        <div
          className="w-full overflow-hidden rounded-lg bg-slate-800 relative"
          style={{ height: MASCOT_HEIGHT }}
        >
          <img
            src={sentimentAsset}
            alt={`Tâm lý: ${sentiment}`}
            className="w-full h-full rounded-lg object-cover"
            style={{ objectPosition: "center 30%" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* 3 metric boxes: KLGD, NN mua, NN bán */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* KLGD */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-800/60 rounded border border-slate-700">
            <BarChart3 size={20} className="text-blue-400 shrink-0" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">KLGD</span>
              <span className="text-sm font-bold tabular-nums whitespace-nowrap">{formatVolume(volume)}</span>
              <span className={`text-[9px] tabular-nums font-semibold ${changeColor(changePct)}`}>
                {changeArrow(changePct)} {changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            </div>
          </div>
          {/* NN mua */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-800/60 rounded border border-slate-700">
            <TrendingUp size={20} className="text-emerald-400 shrink-0" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">NN mua</span>
              <span className="text-sm font-bold tabular-nums text-emerald-300 whitespace-nowrap">{formatVndBillion(foreign.buyValue)}</span>
              <span className="text-[9px] tabular-nums font-semibold text-emerald-300">
                ▲ {totalFlow > 0 ? ((foreign.buyValue / totalFlow) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
          </div>
          {/* NN bán */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-800/60 rounded border border-slate-700">
            <TrendingDown size={20} className="text-red-400 shrink-0" />
            <div className="flex flex-col gap-0 min-w-0">
              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">NN bán</span>
              <span className="text-sm font-bold tabular-nums text-red-400 whitespace-nowrap">{formatVndBillion(foreign.sellValue)}</span>
              <span className="text-[9px] tabular-nums font-semibold text-red-400">
                ▼ {totalFlow > 0 ? ((foreign.sellValue / totalFlow) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
