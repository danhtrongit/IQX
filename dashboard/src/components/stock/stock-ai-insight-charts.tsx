import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ─── Shared helpers ────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return n.toLocaleString("vi-VN")
}

/** "YYYY-MM-DD" or ISO date → "DD/MM" */
function shortDate(raw: string | undefined): string {
  if (!raw) return ""
  const datePart = raw.split("T")[0]
  const [, mm, dd] = datePart.split("-")
  if (!mm || !dd) return datePart
  return `${dd}/${mm}`
}

const AXIS_TICK = { fill: "#64748b", fontSize: 9, fontWeight: 500 } as const
const GRID_STROKE = "#1e293b"
const LABEL_FILL = "#e2e8f0"
const COLOR_BUY = "#f59e0b" // orange (TB line, MA10)
const COLOR_LINE_PRIMARY = "#f59e0b"
const COLOR_LINE_SECONDARY = "#06b6d4"
const COLOR_LINE_TERTIARY = "#a78bfa"
const COLOR_POS = "#10b981"
const COLOR_NEG = "#ef4444"

interface TooltipRow {
  label: string
  value: string
  color?: string
}

function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean
  label?: string
  rows: TooltipRow[]
}) {
  if (!active) return null
  return (
    <div className="px-2 py-1.5 rounded-md border text-[10px] bg-[#0f172a] border-[#1e3a5f] text-slate-100 shadow-lg">
      <div className="font-bold text-[11px] mb-1 text-slate-300">{label}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-slate-400">{r.label}:</span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: r.color || "#f1f5f9" }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Skip every other tick on the X axis when there are many points. */
function xInterval(len: number): number {
  if (len <= 7) return 0
  if (len <= 14) return 1
  return Math.ceil(len / 7)
}

/** Compact number formatter for point labels. */
function labelFormatter(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  return fmtNum(value)
}

/** Sample indices for labels: thin to ~8 labels max — too many labels both
 *  clutter the chart and slow first paint (each label is an SVG text node). */
function sampledIndices(length: number, maxLabels = 8): Set<number> {
  if (length <= maxLabels) return new Set(Array.from({ length }, (_, i) => i))
  const step = Math.ceil(length / maxLabels)
  const picked = new Set<number>()
  for (let i = 0; i < length; i += step) picked.add(i)
  picked.add(0)
  picked.add(length - 1)
  return picked
}

// ─── L1 — Trend (close + MA10 + MA20, value labels) ─

interface OhlcvBar {
  date?: string
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

export function TrendRawChart({ ohlcv }: { ohlcv: OhlcvBar[] }) {
  // OHLCV is ascending (oldest → newest). Compute rolling MAs over the full
  // history (so MA values are accurate), then keep only the most recent ~20
  // points for plotting — denser is unreadable and slow to render.
  const data = useMemo(() => {
    const closes = ohlcv.map((b) => Number(b.close ?? 0))
    const withMa = ohlcv.map((bar, i) => {
      const ma10 =
        i >= 9 ? closes.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10 : null
      const ma20 =
        i >= 19 ? closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20 : null
      return {
        date: shortDate(bar.date),
        close: Number(bar.close ?? 0),
        volume: Number(bar.volume ?? 0),
        ma10,
        ma20,
      }
    })
    const recent = withMa.slice(-20)
    const labelIdx = sampledIndices(recent.length)
    return recent.map((row, i) => ({
      ...row,
      closeLabel: labelIdx.has(i) ? row.close : null,
    }))
  }, [ohlcv])

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu OHLCV</p>
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-1">
        Giá đóng cửa & MA ({data.length} phiên)
      </p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={xInterval(data.length)}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={32}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[
                      { label: "Giá", value: p.close.toFixed(2), color: COLOR_LINE_PRIMARY },
                      {
                        label: "MA10",
                        value: p.ma10 != null ? p.ma10.toFixed(2) : "—",
                        color: COLOR_LINE_SECONDARY,
                      },
                      {
                        label: "MA20",
                        value: p.ma20 != null ? p.ma20.toFixed(2) : "—",
                        color: COLOR_LINE_TERTIARY,
                      },
                      { label: "Volume", value: fmtNum(p.volume), color: "#94a3b8" },
                    ]}
                  />
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke={COLOR_LINE_PRIMARY}
              strokeWidth={2}
              dot={{ r: 2.5, fill: COLOR_LINE_PRIMARY, stroke: "none" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="closeLabel"
                position="top"
                formatter={(v: unknown) =>
                  typeof v === "number" ? v.toFixed(1) : ""
                }
                fill={LABEL_FILL}
                fontSize={9}
                fontWeight={700}
              />
            </Line>
            <Line
              type="monotone"
              dataKey="ma10"
              stroke={COLOR_LINE_SECONDARY}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="ma20"
              stroke={COLOR_LINE_TERTIARY}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch={COLOR_LINE_PRIMARY}>Giá đóng cửa</Legend>
        <Legend swatch={COLOR_LINE_SECONDARY} dashed>MA10</Legend>
        <Legend swatch={COLOR_LINE_TERTIARY} dashed>MA20</Legend>
      </div>
    </div>
  )
}

// ─── L2 — Liquidity (volume bars + average matched-volume line) ─

interface LiquidityRow {
  date?: string
  buyUnmatchedVolume?: number
  sellUnmatchedVolume?: number
  totalVolume?: number
}

export function LiquidityRawChart({
  history,
  avgVolume,
}: {
  history: LiquidityRow[]
  /** "Volume khớp TB" — average matched volume (avg30) drawn as a flat line. */
  avgVolume?: number
}) {
  // Backend returns newest-first; reverse to oldest → newest (left → right).
  const data = useMemo(() => {
    const rows = [...history].reverse().map((r) => ({
      date: shortDate(r.date),
      volume: Number(r.totalVolume ?? 0),
    }))
    // Fall back to the period mean when avg30 isn't supplied.
    const avg =
      avgVolume != null && Number.isFinite(avgVolume) && avgVolume > 0
        ? avgVolume
        : rows.length
          ? rows.reduce((s, r) => s + r.volume, 0) / rows.length
          : 0
    const labelIdx = sampledIndices(rows.length)
    return rows.map((r, i) => ({
      ...r,
      avg,
      volumeLabel: labelIdx.has(i) ? r.volume : null,
    }))
  }, [history, avgVolume])

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu</p>
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-1">
        Thanh khoản {data.length} phiên
      </p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={xInterval(data.length)}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[
                      { label: "Volume khớp", value: fmtNum(p.volume), color: COLOR_LINE_SECONDARY },
                      { label: "Volume khớp TB", value: fmtNum(p.avg), color: COLOR_BUY },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#1e293b55" }}
            />
            <Bar dataKey="volume" fill={COLOR_LINE_SECONDARY} fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="volumeLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={9}
                fontWeight={700}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="avg"
              stroke={COLOR_BUY}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch={COLOR_LINE_SECONDARY}>Volume khớp</Legend>
        <Legend swatch={COLOR_BUY} dashed>Volume khớp TB</Legend>
      </div>
    </div>
  )
}

// ─── L3 — Money flow (net-volume bars, colored by sign) ─

interface MoneyFlowRow {
  date?: string
  matchNetVolume?: number
  dealNetVolume?: number
  totalNetVolume?: number
}

export function MoneyFlowRawChart({
  items,
  title,
}: {
  items: MoneyFlowRow[]
  title: string
}) {
  // Reverse desc → asc for X axis. Thin labels (15 labels feels crowded).
  const data = useMemo(() => {
    const rows = [...items].reverse().map((r) => ({
      date: shortDate(r.date),
      total: Number(r.totalNetVolume ?? 0),
    }))
    const labelIdx = sampledIndices(rows.length)
    return rows.map((r, i) => ({ ...r, totalLabel: labelIdx.has(i) ? r.total : null }))
  }, [items])

  if (data.length === 0) {
    return (
      <div>
        <ChartTitle>{title}</ChartTitle>
        <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu</p>
      </div>
    )
  }

  return (
    <div>
      <ChartTitle>{title}</ChartTitle>
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={xInterval(data.length)}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[
                      {
                        label: "Tổng ròng",
                        value: fmtNum(p.total),
                        color: p.total >= 0 ? COLOR_POS : COLOR_NEG,
                      },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#1e293b55" }}
            />
            <Bar dataKey="total" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((row, i) => (
                <Cell key={i} fill={row.total >= 0 ? COLOR_POS : COLOR_NEG} />
              ))}
              <LabelList
                dataKey="totalLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={9}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch={COLOR_POS}>Mua ròng (+)</Legend>
        <Legend swatch={COLOR_NEG}>Bán ròng (−)</Legend>
      </div>
    </div>
  )
}

// ─── L4 — Insider (executed bars, color by Buy/Sell) ──

interface InsiderTxn {
  action?: string
  shareRegistered?: number
  shareExecuted?: number
  startDate?: string
}

export function InsiderRawChart({ txns }: { txns: InsiderTxn[] }) {
  // Insider transactions are discrete events (not a continuous time series).
  // Bar per transaction reads cleaner than a line that would jump between
  // unrelated points. Keep the labelled+coloured aesthetic of the other charts.
  const data = useMemo(() => {
    const rows = [...txns].reverse().map((t) => {
      const isSell = (t.action || "").toLowerCase().includes("bán")
      return {
        date: shortDate(t.startDate),
        executed: Number(t.shareExecuted ?? 0),
        action: t.action || "—",
        isSell,
      }
    })
    const labelIdx = sampledIndices(rows.length)
    return rows.map((r, i) => ({ ...r, executedLabel: labelIdx.has(i) ? r.executed : null }))
  }, [txns])

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có giao dịch</p>
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-1">
        Giao dịch nội bộ ({data.length})
      </p>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={xInterval(data.length)}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[
                      {
                        label: "Hành động",
                        value: p.action,
                        color: p.isSell ? COLOR_NEG : COLOR_POS,
                      },
                      {
                        label: "KL thực hiện",
                        value: fmtNum(p.executed),
                        color: p.isSell ? COLOR_NEG : COLOR_POS,
                      },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#1e293b33" }}
            />
            <Bar dataKey="executed">
              {data.map((row, i) => (
                <Cell key={i} fill={row.isSell ? COLOR_NEG : COLOR_POS} />
              ))}
              <LabelList
                dataKey="executedLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={9}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch={COLOR_POS}>Mua</Legend>
        <Legend swatch={COLOR_NEG}>Bán</Legend>
      </div>
    </div>
  )
}

// ─── Tiny presentational helpers ──────────────────────

function Legend({
  swatch,
  dashed,
  children,
}: {
  swatch: string
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-3 h-[3px]"
        style={{
          backgroundColor: swatch,
          borderTop: dashed ? `1px dashed ${swatch}` : undefined,
        }}
      />
      <span>{children}</span>
    </span>
  )
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-1">
      {children}
    </p>
  )
}
