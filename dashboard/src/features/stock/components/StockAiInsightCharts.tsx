import { useMemo, type ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

/* ── Shared helpers ────────────────────────────────────────────────────────── */

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return n.toLocaleString("vi-VN")
}

/** "YYYY-MM-DD" or ISO → "DD/MM". */
function shortDate(raw: string | undefined): string {
  if (!raw) return ""
  const datePart = raw.split("T")[0]
  const [, mm, dd] = datePart.split("-")
  if (!mm || !dd) return datePart
  return `${dd}/${mm}`
}

const AXIS_TICK = { fill: "#64748b", fontSize: 9, fontWeight: 500 } as const
const GRID_STROKE = "var(--color-border-2)"
const LABEL_FILL = "var(--color-text-1)"
const COLOR_BUY = "#f59e0b"
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
    <div className="rounded-md border border-[var(--color-border-3)] bg-[var(--color-bg-popup)] px-2 py-1.5 text-[10px] text-[var(--color-text-1)] shadow-lg">
      <div className="mb-1 text-[11px] font-bold text-[var(--color-text-2)]">{label}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[var(--color-text-3)]">{r.label}:</span>
          <span className="font-semibold tabular-nums" style={{ color: r.color || undefined }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function xInterval(len: number): number {
  if (len <= 7) return 0
  if (len <= 14) return 1
  return Math.ceil(len / 7)
}

function labelFormatter(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  return fmtNum(value)
}

function sampledIndices(length: number, maxLabels = 8): Set<number> {
  if (length <= maxLabels) return new Set(Array.from({ length }, (_, i) => i))
  const step = Math.ceil(length / maxLabels)
  const picked = new Set<number>()
  for (let i = 0; i < length; i += step) picked.add(i)
  picked.add(0)
  picked.add(length - 1)
  return picked
}

function Legend({
  swatch,
  dashed,
  children,
}: {
  swatch: string
  dashed?: boolean
  children: ReactNode
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-[3px] w-3"
        style={{ backgroundColor: swatch, borderTop: dashed ? `1px dashed ${swatch}` : undefined }}
      />
      <span>{children}</span>
    </span>
  )
}

function ChartTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-1)]">
      {children}
    </p>
  )
}

/* ── L1 — Trend ────────────────────────────────────────────────────────────── */

interface OhlcvBar {
  date?: string
  open?: number
  high?: number
  low?: number
  close?: number
  volume?: number
}

export function TrendRawChart({ ohlcv }: { ohlcv: OhlcvBar[] }) {
  const data = useMemo(() => {
    const closes = ohlcv.map((b) => Number(b.close ?? 0))
    const withMa = ohlcv.map((bar, i) => {
      const ma10 = i >= 9 ? closes.slice(i - 9, i + 1).reduce((a, b) => a + b, 0) / 10 : null
      const ma20 = i >= 19 ? closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20 : null
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
    return recent.map((row, i) => ({ ...row, closeLabel: labelIdx.has(i) ? row.close : null }))
  }, [ohlcv])

  const domain = useMemo<[number, number]>(() => {
    const vals: number[] = []
    data.forEach((d) => {
      if (d.close > 0) vals.push(d.close)
      if (d.ma10 != null) vals.push(d.ma10)
      if (d.ma20 != null) vals.push(d.ma20)
    })
    if (vals.length === 0) return [0, 1]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.08 || 1
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [data])

  if (data.length === 0) {
    return <p className="text-[10px] italic text-[var(--color-text-3)]">Không có dữ liệu OHLCV</p>
  }

  return (
    <div>
      <ChartTitle>Giá &amp; MA ({data.length} phiên)</ChartTitle>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={xInterval(data.length)} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={32}
              domain={domain}
              allowDataOverflow
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
                      { label: "MA10", value: p.ma10 != null ? p.ma10.toFixed(2) : "—", color: COLOR_LINE_SECONDARY },
                      { label: "MA20", value: p.ma20 != null ? p.ma20.toFixed(2) : "—", color: COLOR_LINE_TERTIARY },
                      { label: "Volume", value: fmtNum(p.volume), color: "#94a3b8" },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#64748b22" }}
            />
            <Bar dataKey="close" fill={COLOR_LINE_PRIMARY} fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="closeLabel"
                position="top"
                formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(1) : "")}
                fill={LABEL_FILL}
                fontSize={9}
                fontWeight={700}
              />
            </Bar>
            <Line type="monotone" dataKey="ma10" stroke={COLOR_LINE_SECONDARY} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="ma20" stroke={COLOR_LINE_TERTIARY} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-[var(--color-text-3)]">
        <Legend swatch={COLOR_LINE_PRIMARY}>Giá</Legend>
        <Legend swatch={COLOR_LINE_SECONDARY}>MA10</Legend>
        <Legend swatch={COLOR_LINE_TERTIARY}>MA20</Legend>
      </div>
    </div>
  )
}

/* ── L2 — Liquidity ────────────────────────────────────────────────────────── */

interface LiquidityRow {
  date?: string
  totalVolume?: number
}

export function LiquidityRawChart({
  history,
  avgVolume,
}: {
  history: LiquidityRow[]
  avgVolume?: number
}) {
  const data = useMemo(() => {
    const rows = [...history].reverse().map((r) => ({
      date: shortDate(r.date),
      volume: Number(r.totalVolume ?? 0),
    }))
    const avg =
      avgVolume != null && Number.isFinite(avgVolume) && avgVolume > 0
        ? avgVolume
        : rows.length
          ? rows.reduce((s, r) => s + r.volume, 0) / rows.length
          : 0
    const labelIdx = sampledIndices(rows.length)
    return rows.map((r, i) => ({ ...r, avg, volumeLabel: labelIdx.has(i) ? r.volume : null }))
  }, [history, avgVolume])

  if (data.length === 0) {
    return <p className="text-[10px] italic text-[var(--color-text-3)]">Không có dữ liệu</p>
  }

  return (
    <div>
      <ChartTitle>Thanh khoản {data.length} phiên</ChartTitle>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={xInterval(data.length)} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => fmtNum(v)} />
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
              cursor={{ fill: "#64748b22" }}
            />
            <Bar dataKey="volume" fill={COLOR_LINE_SECONDARY} fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="volumeLabel" position="top" formatter={labelFormatter} fill={LABEL_FILL} fontSize={9} fontWeight={700} />
            </Bar>
            <Line type="monotone" dataKey="avg" stroke={COLOR_BUY} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-[var(--color-text-3)]">
        <Legend swatch={COLOR_LINE_SECONDARY}>Volume khớp</Legend>
        <Legend swatch={COLOR_BUY} dashed>
          Volume khớp TB
        </Legend>
      </div>
    </div>
  )
}

/* ── L3 — Money flow ───────────────────────────────────────────────────────── */

interface MoneyFlowRow {
  date?: string
  totalNetVolume?: number
}

export function MoneyFlowRawChart({ items, title }: { items: MoneyFlowRow[]; title: string }) {
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
        <p className="text-[10px] italic text-[var(--color-text-3)]">Không có dữ liệu</p>
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
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={xInterval(data.length)} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => fmtNum(v)} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[{ label: "Tổng ròng", value: fmtNum(p.total), color: p.total >= 0 ? COLOR_POS : COLOR_NEG }]}
                  />
                )
              }}
              cursor={{ fill: "#64748b22" }}
            />
            <Bar dataKey="total" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((row, i) => (
                <Cell key={i} fill={row.total >= 0 ? COLOR_POS : COLOR_NEG} />
              ))}
              <LabelList dataKey="totalLabel" position="top" formatter={labelFormatter} fill={LABEL_FILL} fontSize={9} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-[var(--color-text-3)]">
        <Legend swatch={COLOR_POS}>Mua ròng (+)</Legend>
        <Legend swatch={COLOR_NEG}>Bán ròng (−)</Legend>
      </div>
    </div>
  )
}

/* ── L4 — Insider ──────────────────────────────────────────────────────────── */

interface InsiderTxn {
  action?: string
  shareExecuted?: number
  startDate?: string
}

export function InsiderRawChart({ txns }: { txns: InsiderTxn[] }) {
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
    return <p className="text-[10px] italic text-[var(--color-text-3)]">Không có giao dịch</p>
  }

  return (
    <div>
      <ChartTitle>Giao dịch nội bộ ({data.length})</ChartTitle>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={xInterval(data.length)} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => fmtNum(v)} />
            <Tooltip
              content={({ active, label, payload }) => {
                if (!active || !payload || !payload.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return (
                  <ChartTooltip
                    active={active}
                    label={String(label)}
                    rows={[
                      { label: "Hành động", value: p.action, color: p.isSell ? COLOR_NEG : COLOR_POS },
                      { label: "KL thực hiện", value: fmtNum(p.executed), color: p.isSell ? COLOR_NEG : COLOR_POS },
                    ]}
                  />
                )
              }}
              cursor={{ fill: "#64748b22" }}
            />
            <Bar dataKey="executed" isAnimationActive={false}>
              {data.map((row, i) => (
                <Cell key={i} fill={row.isSell ? COLOR_NEG : COLOR_POS} />
              ))}
              <LabelList dataKey="executedLabel" position="top" formatter={labelFormatter} fill={LABEL_FILL} fontSize={9} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[9px] text-[var(--color-text-3)]">
        <Legend swatch={COLOR_POS}>Mua</Legend>
        <Legend swatch={COLOR_NEG}>Bán</Legend>
      </div>
    </div>
  )
}
