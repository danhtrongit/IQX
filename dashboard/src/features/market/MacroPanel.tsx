import { useMemo, useId } from "react";
import { Panel } from "./Panel";
import { useMacroIndicators } from "./hooks";
import {
  Activity,
  TrendingUp,
  BarChart3,
  ShoppingCart,
  Landmark,
  ArrowUpDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MacroIndicatorUI } from "./types";

// ─── Max sparkline points (≈ 1 month of data) ───────────
const MAX_SPARKLINE_POINTS = 30;

// ─── Icon rendering per indicator name ───────────────────

function IndicatorIcon({
  name,
  size,
  color,
}: {
  name: string;
  size: number;
  color: string;
}) {
  const style = { color };
  switch (name) {
    case "GDP":
    case "GDP Danh nghĩa":
      return <Activity size={size} style={style} />;
    case "CPI":
      return <TrendingUp size={size} style={style} />;
    case "FDI":
    case "FDI giải ngân":
      return <Landmark size={size} style={style} />;
    case "SX Công nghiệp":
    case "Dịch vụ":
    case "Nông nghiệp":
      return <BarChart3 size={size} style={style} />;
    case "Bán lẻ":
    case "Tổng bán lẻ":
      return <ShoppingCart size={size} style={style} />;
    case "Xuất nhập khẩu":
    case "Xuất khẩu":
    case "XNK":
      return <ArrowUpDown size={size} style={style} />;
    default:
      return <Activity size={size} style={style} />;
  }
}

// ─── Skeleton for compact card layout ────────────────────

function MacroSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 p-2 rounded border border-slate-700 bg-slate-800/60"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-full bg-slate-800" />
            <div className="flex-1 flex flex-col gap-0.5">
              <Skeleton className="h-2.5 w-16 bg-slate-800" />
              <Skeleton className="h-2 w-10 bg-slate-800" />
            </div>
            <Skeleton className="h-4 w-16 bg-slate-800" />
          </div>
          <Skeleton className="h-[36px] w-full rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

// ─── Mini Area Chart component ───────────────────────────

function MacroMiniAreaChart({
  data,
  trend,
  chartId,
}: {
  data: number[];
  trend: "up" | "down";
  chartId: string;
}) {
  const chartData = useMemo(
    () => data.slice(-MAX_SPARKLINE_POINTS).map((v, i) => ({ i, v })),
    [data],
  );

  const color = trend === "up" ? "#34d399" : "#f87171";
  const gradientId = `macro-grad-${chartId}`;

  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart
        data={chartData}
        margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#164e63"
          strokeOpacity={0.4}
          vertical={false}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Individual Macro Indicator Card ─────────────────────

function MacroIndicatorCard({ item }: { item: MacroIndicatorUI }) {
  const isUp = item.trend === "up";
  const trendColor = isUp ? "#34d399" : "#f87171";
  const cardId = useId();

  return (
    <div
      className="relative flex flex-col rounded overflow-hidden"
      style={{
        border: `1px solid color-mix(in oklch, ${trendColor} 35%, #164e63)`,
        background: `linear-gradient(135deg, color-mix(in oklch, ${trendColor} 5%, #1e293b) 0%, #1e293b 70%)`,
      }}
    >
      {/* Top section: icon + text + value */}
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        {/* Icon circle */}
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            background: `color-mix(in oklch, ${trendColor} 15%, transparent)`,
          }}
        >
          <IndicatorIcon name={item.name} size={13} color={trendColor} />
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-slate-100 truncate leading-tight">
            {item.name}
          </div>
          {item.subtitle && (
            <div className="text-[8px] text-slate-400 leading-tight">
              {item.subtitle}
            </div>
          )}
        </div>

        {/* Value + change */}
        <div className="shrink-0 text-right">
          <div className="text-[13px] font-bold tabular-nums text-slate-100 leading-tight">
            {item.value}
          </div>
          {item.change && (
            <div
              className="text-[9px] font-semibold tabular-nums leading-tight"
              style={{ color: trendColor }}
            >
              {isUp ? "▲" : "▼"} {item.change}
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="px-1 pb-1">
        {item.sparkline && item.sparkline.length >= 2 ? (
          <MacroMiniAreaChart data={item.sparkline} trend={item.trend} chartId={cardId} />
        ) : (
          <div className="h-[36px] flex items-center justify-center">
            <span className="text-[8px] text-slate-400 italic">
              Không đủ dữ liệu
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MacroPanel (main export) ────────────────────────────

export function MacroPanel() {
  const { data: indicators, source, loading } = useMacroIndicators();

  return (
    <Panel
      title="Chỉ số vĩ mô - Kinh tế Việt Nam"
      source={source}
      className="col-span-4"
      icon={<Activity size={14} className="text-cyan-300" />}
    >
      {loading ? (
        <MacroSkeletons />
      ) : indicators.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic py-4 text-center">
          Không có dữ liệu vĩ mô.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {indicators.map((item) => (
            <MacroIndicatorCard key={item.name} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}
