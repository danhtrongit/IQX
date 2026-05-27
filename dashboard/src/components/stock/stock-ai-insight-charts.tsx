import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ─── Shared helpers ────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K"
  return n.toLocaleString("vi-VN")
}

/** Display "YYYY-MM-DD" or ISO date as "DD/MM". */
function shortDate(raw: string | undefined): string {
  if (!raw) return ""
  const datePart = raw.split("T")[0]
  const [, mm, dd] = datePart.split("-")
  if (!mm || !dd) return datePart
  return `${dd}/${mm}`
}

const AXIS_TICK = { fill: "#64748b", fontSize: 9, fontWeight: 500 } as const
const GRID_STROKE = "#1e293b"

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

// ─── L1 — Trend (close + MA10/MA20 lines + volume bars) ─

interface OhlcvBar {
  date?: string
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

export function TrendRawChart({ ohlcv }: { ohlcv: OhlcvBar[] }) {
  // OHLCV from backend is ascending (oldest → newest). Compute rolling MA10/MA20
  // so the chart shows the same indicators the AI prompt sees.
  const data = useMemo(() => {
    const closes = ohlcv.map((b) => Number(b.close ?? 0))
    return ohlcv.map((bar, i) => {
      const ma10 =
        i >= 9
          ? closes.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10
          : null
      const ma20 =
        i >= 19
          ? closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20
          : null
      return {
        date: shortDate(bar.date),
        close: Number(bar.close ?? 0),
        volume: Number(bar.volume ?? 0),
        ma10,
        ma20,
      }
    })
  }, [ohlcv])

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu OHLCV</p>
  }

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            yAxisId="price"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={36}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtNum(v)}
            width={38}
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
                    { label: "Giá", value: p.close.toFixed(2), color: "#06b6d4" },
                    {
                      label: "MA10",
                      value: p.ma10 != null ? p.ma10.toFixed(2) : "—",
                      color: "#3b82f6",
                    },
                    {
                      label: "MA20",
                      value: p.ma20 != null ? p.ma20.toFixed(2) : "—",
                      color: "#f59e0b",
                    },
                    { label: "Volume", value: fmtNum(p.volume), color: "#94a3b8" },
                  ]}
                />
              )
            }}
          />
          <Bar yAxisId="volume" dataKey="volume" fill="#475569" opacity={0.45} />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="close"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma10"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            isAnimationActive={false}
            connectNulls
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma20"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch="#06b6d4">Giá đóng cửa</Legend>
        <Legend swatch="#3b82f6" dashed>MA10</Legend>
        <Legend swatch="#f59e0b" dashed>MA20</Legend>
        <Legend swatch="#475569">Volume</Legend>
      </div>
    </div>
  )
}

// ─── L2 — Liquidity (buy/sell unmatched bars + matched volume line) ─

interface LiquidityRow {
  date?: string
  buyUnmatchedVolume?: number
  sellUnmatchedVolume?: number
  totalVolume?: number
}

export function LiquidityRawChart({ history }: { history: LiquidityRow[] }) {
  // Backend returns history newest-first; reverse so the X axis goes
  // oldest → newest (left → right), which is what humans read.
  const data = useMemo(
    () =>
      [...history].reverse().map((r) => ({
        date: shortDate(r.date),
        buyUnmatched: Number(r.buyUnmatchedVolume ?? 0),
        sellUnmatched: Number(r.sellUnmatchedVolume ?? 0),
        matched: Number(r.totalVolume ?? 0),
      })),
    [history],
  )

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có dữ liệu</p>
  }

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            yAxisId="vol"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtNum(v)}
            width={42}
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
                    { label: "Mua chưa khớp", value: fmtNum(p.buyUnmatched), color: "#34d399" },
                    { label: "Bán chưa khớp", value: fmtNum(p.sellUnmatched), color: "#f87171" },
                    { label: "Volume khớp", value: fmtNum(p.matched), color: "#06b6d4" },
                  ]}
                />
              )
            }}
            cursor={{ fill: "#1e293b33" }}
          />
          <Bar yAxisId="vol" dataKey="buyUnmatched" fill="#34d399" opacity={0.85} />
          <Bar yAxisId="vol" dataKey="sellUnmatched" fill="#f87171" opacity={0.85} />
          <Line
            yAxisId="vol"
            type="monotone"
            dataKey="matched"
            stroke="#06b6d4"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch="#34d399">Mua chưa khớp</Legend>
        <Legend swatch="#f87171">Bán chưa khớp</Legend>
        <Legend swatch="#06b6d4">Volume khớp</Legend>
      </div>
    </div>
  )
}

// ─── L3 — Money flow (net volume bar, color by sign) ──

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
  // Backend returns desc; reverse so chart reads oldest → newest.
  const data = useMemo(
    () =>
      [...items].reverse().map((r) => ({
        date: shortDate(r.date),
        match: Number(r.matchNetVolume ?? 0),
        deal: Number(r.dealNetVolume ?? 0),
        total: Number(r.totalNetVolume ?? 0),
      })),
    [items],
  )

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
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => fmtNum(v)}
              width={48}
            />
            <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
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
                        label: "Ròng khớp",
                        value: fmtNum(p.match),
                        color: p.match >= 0 ? "#34d399" : "#f87171",
                      },
                      { label: "Ròng deal", value: fmtNum(p.deal), color: "#94a3b8" },
                      {
                        label: "Tổng ròng",
                        value: fmtNum(p.total),
                        color: p.total >= 0 ? "#34d399" : "#f87171",
                      },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#1e293b33" }}
            />
            <Bar dataKey="total">
              {data.map((row, i) => (
                <Cell key={i} fill={row.total >= 0 ? "#34d399" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── L4 — Insider (registered + executed grouped bars by date) ─

interface InsiderTxn {
  action?: string
  shareRegistered?: number
  shareExecuted?: number
  startDate?: string
}

export function InsiderRawChart({ txns }: { txns: InsiderTxn[] }) {
  // Backend returns newest-first; reverse for chronological X axis.
  const data = useMemo(
    () =>
      [...txns].reverse().map((t) => {
        const isSell = (t.action || "").toLowerCase().includes("bán")
        return {
          date: shortDate(t.startDate),
          registered: Number(t.shareRegistered ?? 0),
          executed: Number(t.shareExecuted ?? 0),
          action: t.action || "—",
          isSell,
        }
      }),
    [txns],
  )

  if (data.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">Không có giao dịch</p>
  }

  return (
    <div className="h-[160px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtNum(v)}
            width={48}
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
                      color: p.isSell ? "#f87171" : "#34d399",
                    },
                    { label: "KL đăng ký", value: fmtNum(p.registered), color: "#94a3b8" },
                    {
                      label: "KL thực hiện",
                      value: fmtNum(p.executed),
                      color: p.isSell ? "#f87171" : "#34d399",
                    },
                  ]}
                />
              )
            }}
            cursor={{ fill: "#1e293b33" }}
          />
          <Bar dataKey="registered" opacity={0.45}>
            {data.map((row, i) => (
              <Cell key={`r-${i}`} fill={row.isSell ? "#f87171" : "#34d399"} />
            ))}
          </Bar>
          <Bar dataKey="executed">
            {data.map((row, i) => (
              <Cell key={`e-${i}`} fill={row.isSell ? "#f87171" : "#34d399"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-3 text-[9px] text-slate-400 mt-1">
        <Legend swatch="#34d399">Mua / đăng ký mua</Legend>
        <Legend swatch="#f87171">Bán / đăng ký bán</Legend>
        <span className="text-slate-500">Mờ = đăng ký, đậm = thực hiện</span>
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
