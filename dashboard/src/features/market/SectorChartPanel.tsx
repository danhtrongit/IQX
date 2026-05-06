import { useMemo } from "react";
import { Panel } from "./Panel";
import { useSectorDailyFlow } from "./hooks";
import { Layers } from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

// ─── Sector name helpers ──────────────────────────────────

const SECTOR_SHORT: Record<string, string> = {
  "Ngân hàng": "Ngân hàng",
  "Chứng khoán": "CK",
  "Bất động sản": "BĐS",
  "Bảo hiểm": "Bảo hiểm",
  "Thép": "Thép",
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
};

function shortenName(name: string): string {
  return SECTOR_SHORT[name] || name;
}

/** Format volume in VND: 1.8T, 494.6B, etc. */
function formatVND(vnd: number): string {
  if (vnd >= 1_000) return `${(vnd / 1_000).toFixed(1)}T`;
  if (vnd >= 1) return `${vnd.toFixed(1)}B`;
  return `${(vnd * 1_000).toFixed(0)}M`;
}

// ─── Custom tooltip ───────────────────────────────────────

function BubbleTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BubbleDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="px-3 py-2 rounded-md border text-[11px]"
      style={{
        backgroundColor: "#0f172a",
        border: "1px solid #155e75",
        color: "#f1f5f9",
      }}
    >
      <div className="font-bold text-[12px] mb-1">{d.fullName}</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-slate-400">Hiệu suất:</span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: d.performance >= 0 ? "#34d399" : "#f87171" }}
        >
          {d.performance >= 0 ? "+" : ""}
          {d.performance.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-400">GTGD:</span>
        <span className="font-semibold tabular-nums">{formatVND(d.volume)}</span>
      </div>
    </div>
  );
}

// ─── Custom bubble shape (circle + labels above) ─────────

interface BubbleDatum {
  name: string;
  fullName: string;
  volume: number;       // billion VND
  performance: number;  // percent
  idx: number;
}

function BubbleShape(props: any) {
  const { cx, cy, payload, fill, fillOpacity, stroke, strokeWidth } = props;
  if (!cx || !cy || !payload) return null;

  const d = payload as BubbleDatum;
  const isUp = d.performance >= 0;
  const color = isUp ? "#34d399" : "#f87171";

  // Get the actual rendered radius from the props (recharts passes `r` or we estimate)
  // recharts ScatterChart passes the node size via `r` or `width`/`height`
  const r = props.r || props.width / 2 || 16;
  const labelY = cy - r - 6; // just above the bubble

  return (
    <g>
      {/* The bubble */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={fillOpacity ?? 0.7}
        stroke={stroke}
        strokeWidth={strokeWidth ?? 1}
      />
      {/* Sector name */}
      <text
        x={cx}
        y={labelY - 24}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={11}
        fontWeight={700}
      >
        {d.name}
      </text>
      {/* Performance % */}
      <text
        x={cx}
        y={labelY - 12}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight={600}
      >
        {isUp ? "+" : ""}{d.performance.toFixed(2)}%
      </text>
      {/* GTGD value */}
      <text
        x={cx}
        y={labelY}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={9}
        fontWeight={500}
      >
        {formatVND(d.volume)}
      </text>
    </g>
  );
}

// ─── Main component ───────────────────────────────────────

export function SectorChartPanel() {
  const { data, source } = useSectorDailyFlow();

  const hasGTGD = data.some((d) => d.volume > 0);

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
  );

  // Volume range for Z-axis sizing
  const maxVol = useMemo(
    () => Math.max(...chartData.map((d) => d.volume), 1),
    [chartData],
  );

  // Y-axis domain: auto with some padding
  const [yMin, yMax] = useMemo(() => {
    if (chartData.length === 0) return [-2, 2];
    const perfs = chartData.map((d) => d.performance);
    const mn = Math.min(...perfs);
    const mx = Math.max(...perfs);
    const pad = Math.max(0.5, (mx - mn) * 0.25);
    return [Math.floor((mn - pad) * 2) / 2, Math.ceil((mx + pad) * 2) / 2];
  }, [chartData]);

  return (
    <Panel
      title="Hiệu suất ngành & quy mô GTGD"
      source={source}
      className="col-span-4"
      icon={<Layers size={14} className="text-cyan-300" />}
    >
      <div className="h-full min-h-[380px] flex flex-col">
        {data.length === 0 || !hasGTGD ? (
          <div className="text-[11px] text-slate-400 italic py-8 text-center">
            Không có dữ liệu ngành.
          </div>
        ) : (
          <>
            {/* Y-axis label */}
            <div className="text-[9px] text-slate-500 font-medium px-1 mb-1">
              Hiệu suất (%)
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 70, right: 20, left: 8, bottom: 32 }}
                >
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[-0.5, chartData.length - 0.5]}
                    tick={false}
                    axisLine={{ stroke: "#1e293b" }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="performance"
                    type="number"
                    domain={[yMin, yMax]}
                    tick={{ fill: "#64748b", fontSize: 10, fontWeight: 500 }}
                    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <ZAxis
                    dataKey="volume"
                    type="number"
                    range={[300, 2400]}
                    domain={[0, maxVol]}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="#334155"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    content={<BubbleTooltip />}
                    cursor={false}
                  />
                  <Scatter
                    data={chartData}
                    shape={(props: any) => {
                      const d = props.payload as BubbleDatum;
                      const isUp = d.performance >= 0;
                      return (
                        <BubbleShape
                          {...props}
                          fill={isUp ? "#34d399" : "#f87171"}
                          fillOpacity={0.7}
                          stroke={isUp ? "#059669" : "#dc2626"}
                          strokeWidth={1}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 pt-1 pb-0.5 text-[9px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-700 border border-slate-600 opacity-60" />
                <span>Quy mô hình tròn = GTGD</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 font-medium">Hiệu suất dương</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-red-400 font-medium">Hiệu suất âm</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
