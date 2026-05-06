import { useVNIndexOHLCV, useMarketOverview } from "./hooks";
import { changeColor, CHART_HEIGHT } from "./utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp } from "lucide-react";

export function VNIndexChart() {
  const { data: ohlcv, source } = useVNIndexOHLCV();
  const { data: market } = useMarketOverview();

  const chartData = ohlcv.map((bar) => {
    const d = new Date(bar.time * 1000);
    return {
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      close: Math.round(bar.close * 100) / 100,
      open: Math.round(bar.open * 100) / 100,
      volume: Math.round(bar.volume / 1_000_000),
    };
  });

  const m = market.vnindex;
  const isUp = m.change >= 0;

  return (
    <div className="col-span-4 bg-slate-900 border border-slate-800 rounded-md overflow-hidden flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-400" />
          <span className="font-heading text-[11px] font-bold uppercase tracking-wide">
            VNINDEX
          </span>
          <span className="text-[9px] text-slate-400">ⓘ</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-slate-100">
            {m.value.toLocaleString("vi-VN")}
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${changeColor(m.change)}`}
          >
            {isUp ? "+" : ""}
            {m.change.toFixed(2)} ({isUp ? "+" : ""}
            {m.changePercent.toFixed(2)}%)
          </span>
          <span
            className={`text-[8px] px-1.5 py-px leading-tight font-semibold tracking-wider rounded border ${
              source === "live"
                ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/20"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {source === "live" ? "● LIVE" : "○ MOCK"}
          </span>
        </div>
      </div>
      <div className="p-1 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="vnidxFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isUp ? "#34d399" : "#f87171"}
                  stopOpacity={0.25}
                />
                <stop
                  offset="95%"
                  stopColor={isUp ? "#34d399" : "#f87171"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#164e63" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#cbd5e1", fontSize: 9 }}
              axisLine={{ stroke: "#164e63" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              domain={["auto", "auto"]}
              tick={{ fill: "#cbd5e1", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
              width={40}
            />
            <YAxis
              yAxisId="vol"
              orientation="right"
              domain={[0, (max: number) => max * 4]}
              tick={false}
              axisLine={false}
              tickLine={false}
              width={0}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #155e75",
                borderRadius: 6,
                fontSize: 11,
                color: "#f1f5f9",
              }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(value: unknown, name: unknown) => {
                const v = Number(value);
                if (name === "volume") return [`${v}M`, "KLGD"];
                return [v.toFixed(2), "Đóng cửa"];
              }}
            />
            <ReferenceLine
              yAxisId="price"
              y={chartData[0]?.open}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="#34d399"
              fillOpacity={0.2}
              radius={[1, 1, 0, 0]}
              isAnimationActive={false}
            />
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={isUp ? "#34d399" : "#f87171"}
              strokeWidth={1.5}
              fill="url(#vnidxFill)"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
