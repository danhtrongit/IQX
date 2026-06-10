import { useMemo } from "react"
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { Panel } from "./Panel"
import { useSectorDailyFlow } from "../hooks"
import { IconLayers } from "../icons"

const SECTOR_SHORT: Record<string, string> = {
  "Ngân hàng": "Ngân hàng",
  "Chứng khoán": "CK",
  "Bất động sản": "BĐS",
  "Bảo hiểm": "Bảo hiểm",
  Thép: "Thép",
  "Dầu khí": "Dầu khí",
  "Công nghệ thông tin": "CNTT",
  "Công nghệ Thông tin": "CNTT",
  "Thực phẩm và đồ uống": "F&B",
  "Xây dựng và vật liệu": "Xây dựng",
  "Hóa chất": "Hóa chất",
  "Tài nguyên cơ bản": "Nguyên vật liệu",
  "Hàng & Dịch vụ công nghiệp": "Công nghiệp",
  "Điện, nước & xăng dầu khí đốt": "Điện nước",
  "Viễn thông": "Viễn thông",
  "Du lịch & Giải trí": "Du lịch",
  "Hàng cá nhân & Gia dụng": "Gia dụng",
  "Ô tô & phụ tùng": "Ô tô",
  "Y tế": "Y tế",
  "Truyền thông": "Truyền thông",
  "Bán lẻ": "Bán lẻ",
  "Dịch vụ tài chính": "DV tài chính",
  "Nguyên vật liệu": "Nguyên vật liệu",
  "Hàng Tiêu dùng": "Hàng tiêu dùng",
  "Hàng tiêu dùng": "Hàng tiêu dùng",
}

function shortenName(name: string): string {
  return SECTOR_SHORT[name] || name
}

function formatVND(vnd: number): string {
  if (vnd >= 1_000) return `${Math.round(vnd / 1_000).toLocaleString("vi-VN")}T`
  if (vnd >= 1) return `${Math.round(vnd).toLocaleString("vi-VN")}B`
  return `${(vnd * 1_000).toFixed(0)}M`
}

interface BubbleDatum {
  name: string
  fullName: string
  volume: number
  performance: number
  idx: number
}

function BubbleTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: BubbleDatum }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div
      className="px-3 py-2 rounded-md border text-[11px]"
      style={{ backgroundColor: "var(--color-bg-2)", border: "1px solid var(--color-border-2)", color: "var(--color-text-1)" }}
    >
      <div className="font-bold text-[12px] mb-1">{d.fullName}</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[var(--color-text-3)]">Hiệu suất:</span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: d.performance >= 0 ? "var(--color-up)" : "var(--color-down)" }}
        >
          {d.performance >= 0 ? "+" : ""}
          {Math.round(d.performance)}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text-3)]">GTGD:</span>
        <span className="font-semibold tabular-nums">{formatVND(d.volume)}</span>
      </div>
    </div>
  )
}

function BubbleShape(props: any) {
  const { cx, cy, payload, fill, fillOpacity, stroke, strokeWidth } = props
  if (!cx || !cy || !payload) return null

  const d = payload as BubbleDatum
  const isUp = d.performance >= 0
  const color = isUp ? "var(--color-up)" : "var(--color-down)"
  const r = props.r || props.width / 2 || 16
  const labelY = cy - r - 6

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={fillOpacity ?? 0.7}
        stroke={stroke}
        strokeWidth={strokeWidth ?? 1}
      />
      <text x={cx} y={labelY - 24} textAnchor="middle" fill="var(--color-text-1)" fontSize={11} fontWeight={700}>
        {d.name}
      </text>
      <text x={cx} y={labelY - 12} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>
        {isUp ? "+" : ""}
        {Math.round(d.performance)}%
      </text>
      <text x={cx} y={labelY} textAnchor="middle" fill="var(--color-text-3)" fontSize={9} fontWeight={500}>
        {formatVND(d.volume)}
      </text>
    </g>
  )
}

export function SectorChartPanel() {
  const { data, loading } = useSectorDailyFlow()
  const source = loading ? "mock" : "live"
  const hasGTGD = data.some((d) => d.volume > 0)

  const chartData: BubbleDatum[] = useMemo(
    () =>
      [...data]
        .filter((d) => d.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 8)
        .map((d, i) => ({
          name: shortenName(d.date),
          fullName: d.date,
          volume: d.volume,
          performance: d.performance,
          idx: i,
        })),
    [data],
  )

  const maxVol = useMemo(() => Math.max(...chartData.map((d) => d.volume), 1), [chartData])

  const [yMin, yMax] = useMemo(() => {
    if (chartData.length === 0) return [-2, 2]
    const perfs = chartData.map((d) => d.performance)
    const mn = Math.min(...perfs)
    const mx = Math.max(...perfs)
    const pad = Math.max(0.5, (mx - mn) * 0.25)
    return [Math.floor((mn - pad) * 2) / 2, Math.ceil((mx + pad) * 2) / 2]
  }, [chartData])

  return (
    <Panel
      title="Hiệu suất ngành & quy mô GTGD"
      source={source}
      icon={<IconLayers className="text-[rgb(var(--primary-6))]" />}
    >
      <div className="h-full min-h-[380px] flex flex-col">
        {data.length === 0 || !hasGTGD ? (
          <div className="text-[11px] text-[var(--color-text-3)] italic py-8 text-center">
            Không có dữ liệu ngành.
          </div>
        ) : (
          <>
            <div className="text-[9px] text-[var(--color-text-4)] font-medium px-1 mb-1">Hiệu suất (%)</div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 70, right: 20, left: 8, bottom: 32 }}>
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[-0.5, chartData.length - 0.5]}
                    tick={false}
                    axisLine={{ stroke: "var(--color-fill-2)" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="performance"
                    type="number"
                    domain={[yMin, yMax]}
                    tick={{ fill: "var(--color-text-3)", fontSize: 10, fontWeight: 500 }}
                    tickFormatter={(v: number) => `${Math.round(v)}%`}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <ZAxis dataKey="volume" type="number" range={[300, 2400]} domain={[0, maxVol]} />
                  <ReferenceLine y={0} stroke="var(--color-border-2)" strokeWidth={1} strokeDasharray="4 4" />
                  <Tooltip content={<BubbleTooltip />} cursor={false} />
                  <Scatter
                    data={chartData}
                    shape={(props: any) => {
                      const d = props.payload as BubbleDatum
                      const isUp = d.performance >= 0
                      return (
                        <BubbleShape
                          {...props}
                          fill={isUp ? "var(--color-up)" : "var(--color-down)"}
                          fillOpacity={0.7}
                          stroke={isUp ? "var(--color-up)" : "var(--color-down)"}
                          strokeWidth={1}
                        />
                      )
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 pt-1 pb-0.5 text-[9px] text-[var(--color-text-3)]">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[var(--color-fill-3)] border border-[var(--color-border-3)] opacity-60" />
                <span>Quy mô hình tròn = GTGD</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-up" />
                <span className="text-up font-medium">Hiệu suất dương</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-down" />
                <span className="text-down font-medium">Hiệu suất âm</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
