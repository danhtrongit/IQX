import { useVNIndexOHLCV, useMarketOverview } from "./hooks";
import { changeColor, CHART_HEIGHT } from "./utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { TrendingUp } from "lucide-react";

const wholeNumber = (value: number) =>
  Math.round(value).toLocaleString("vi-VN");

const round2 = (v: number) => Math.round(v * 100) / 100;

const CANDLE_UP = "#34d399";
const CANDLE_DOWN = "#f87171";

interface CandleDatum {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** [low, high] range bar — drives recharts' pixel scaling for the candle. */
  range: [number, number];
  volume: number;
}

/**
 * Custom candlestick shape for a recharts range `Bar` whose dataKey is the
 * `[low, high]` tuple. Recharts gives us `y` = pixel of `high` and `height` =
 * pixel span down to `low`, so we can linearly map any price to a Y pixel and
 * draw the wick (high→low) plus the open/close body.
 */
function Candle(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandleDatum;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? CANDLE_UP : CANDLE_DOWN;

  const range = high - low;
  const priceToY = (p: number) =>
    range === 0 ? y : y + ((high - p) / range) * height;

  const openY = priceToY(open);
  const closeY = priceToY(close);
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1); // ≥1px doji
  const cx = x + width / 2;
  const bodyWidth = Math.max(width * 0.6, 1);
  const bodyX = cx - bodyWidth / 2;

  return (
    <g>
      {/* Wick: high → low */}
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
      {/* Body: open → close */}
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: CandleDatum }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  if (!d) return null;
  const isUp = d.close >= d.open;
  const closeColor = isUp ? CANDLE_UP : CANDLE_DOWN;
  return (
    <div
      className="rounded-md px-2.5 py-2 text-[11px]"
      style={{ backgroundColor: "#0f172a", border: "1px solid #155e75", color: "#f1f5f9" }}
    >
      <div className="text-[10px] text-slate-400 mb-1">{label}</div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Mở</span><span className="tabular-nums">{wholeNumber(d.open)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Cao</span><span className="tabular-nums text-emerald-300">{wholeNumber(d.high)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Thấp</span><span className="tabular-nums text-red-300">{wholeNumber(d.low)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-400">Đóng</span><span className="tabular-nums font-semibold" style={{ color: closeColor }}>{wholeNumber(d.close)}</span></div>
      <div className="flex justify-between gap-3 mt-0.5 pt-0.5 border-t border-slate-700"><span className="text-slate-400">KLGD</span><span className="tabular-nums">{d.volume}M</span></div>
    </div>
  );
}

export function VNIndexChart() {
  const { data: ohlcv, source } = useVNIndexOHLCV();
  const { data: market } = useMarketOverview();

  const chartData: CandleDatum[] = ohlcv.map((bar) => {
    const d = new Date(bar.time * 1000);
    return {
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      range: [round2(bar.low), round2(bar.high)],
      volume: Math.round(bar.volume / 1_000_000),
    };
  });

  // Price axis domain from the low/high extremes (+5% padding) so candles
  // aren't clipped at the chart edges.
  const lows = chartData.map((d) => d.low).filter((v) => v > 0);
  const highs = chartData.map((d) => d.high).filter((v) => v > 0);
  const minLow = lows.length ? Math.min(...lows) : 0;
  const maxHigh = highs.length ? Math.max(...highs) : 0;
  const pad = (maxHigh - minLow) * 0.05 || 1;
  const priceDomain: [number, number] = [
    Math.floor(minLow - pad),
    Math.ceil(maxHigh + pad),
  ];

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
            {wholeNumber(m.value)}
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${changeColor(m.change)}`}
          >
            {isUp ? "+" : ""}
            {wholeNumber(m.change)} ({isUp ? "+" : ""}
            {wholeNumber(m.changePercent)}%)
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
            <XAxis
              dataKey="date"
              tick={{ fill: "#cbd5e1", fontSize: 9 }}
              axisLine={{ stroke: "#164e63" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="price"
              domain={priceDomain}
              tick={{ fill: "#cbd5e1", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => wholeNumber(v)}
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
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#1e293b55" }} />
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="#34d399"
              fillOpacity={0.2}
              radius={[1, 1, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="price"
              dataKey="range"
              shape={<Candle />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
