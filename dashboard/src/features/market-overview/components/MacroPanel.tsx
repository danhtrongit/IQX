import { useMemo, useId } from "react"
import { Skeleton } from "@arco-design/web-react"
import { AreaChart, Area, ResponsiveContainer, CartesianGrid } from "recharts"
import { Panel } from "./Panel"
import { useMacroIndicators } from "../hooks"
import { IconActivity, IconDollar } from "@/shared/icons"
import {
  IconTrendingUp,
  IconBarChart,
  IconShoppingCart,
  IconLandmark,
  IconArrowUpDown,
} from "../icons"
import type { MacroIndicatorUI } from "../types"

const MAX_SPARKLINE_POINTS = 30

function IndicatorIcon({ name, color }: { name: string; color: string }) {
  const cls = "text-[13px]"
  const style = { color }
  switch (name) {
    case "GDP":
    case "GDP Danh nghĩa":
      return <IconActivity className={cls} style={style} />
    case "CPI":
      return <IconTrendingUp className={cls} style={style} />
    case "FDI":
    case "FDI giải ngân":
      return <IconLandmark className={cls} style={style} />
    case "SX Công nghiệp":
    case "Dịch vụ":
    case "Nông nghiệp":
      return <IconBarChart className={cls} style={style} />
    case "Bán lẻ":
    case "Tổng bán lẻ":
      return <IconShoppingCart className={cls} style={style} />
    case "Xuất nhập khẩu":
    case "Xuất khẩu":
    case "XNK":
      return <IconArrowUpDown className={cls} style={style} />
    default:
      return <IconDollar className={cls} style={style} />
  }
}

function MacroSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-border-2)] bg-[var(--color-fill-2)]"
        >
          <Skeleton animation text={{ rows: 2 }} image={false} />
          <Skeleton animation text={{ rows: 1 }} image={false} />
        </div>
      ))}
    </div>
  )
}

function MacroMiniAreaChart({
  data,
  trend,
  chartId,
}: {
  data: number[]
  trend: "up" | "down"
  chartId: string
}) {
  const chartData = useMemo(
    () => data.slice(-MAX_SPARKLINE_POINTS).map((v, i) => ({ i, v })),
    [data],
  )
  const color = trend === "up" ? "var(--color-up)" : "var(--color-down)"
  const gradientId = `macro-grad-${chartId}`

  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-2)" strokeOpacity={0.4} vertical={false} />
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
  )
}

function MacroIndicatorCard({ item }: { item: MacroIndicatorUI }) {
  const isUp = item.trend === "up"
  const trendColor = isUp ? "var(--color-up)" : "var(--color-down)"
  const cardId = useId()

  return (
    <div
      className="relative flex flex-col rounded overflow-hidden"
      style={{
        border: `1px solid color-mix(in oklch, ${trendColor} 35%, var(--color-border-2))`,
        background: `linear-gradient(135deg, color-mix(in oklch, ${trendColor} 5%, var(--color-fill-2)) 0%, var(--color-fill-2) 70%)`,
      }}
    >
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            background: `color-mix(in oklch, ${trendColor} 15%, transparent)`,
          }}
        >
          <IndicatorIcon name={item.name} color={trendColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-[var(--color-text-1)] truncate leading-tight">
            {item.name}
          </div>
          {item.subtitle && (
            <div className="text-[8px] text-[var(--color-text-3)] leading-tight">{item.subtitle}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[13px] font-bold tabular-nums text-[var(--color-text-1)] leading-tight">
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
      <div className="px-1 pb-1">
        {item.sparkline && item.sparkline.length >= 2 ? (
          <MacroMiniAreaChart data={item.sparkline} trend={item.trend} chartId={cardId} />
        ) : (
          <div className="h-[36px] flex items-center justify-center">
            <span className="text-[8px] text-[var(--color-text-3)] italic">Không đủ dữ liệu</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MacroPanel() {
  const { data: indicators, loading } = useMacroIndicators()

  return (
    <Panel
      title="Chỉ số vĩ mô - Kinh tế Việt Nam"
      source={loading ? "mock" : "live"}
      icon={<IconActivity className="text-[rgb(var(--primary-6))]" />}
    >
      {loading ? (
        <MacroSkeletons />
      ) : indicators.length === 0 ? (
        <div className="text-[11px] text-[var(--color-text-3)] italic py-4 text-center">
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
  )
}
