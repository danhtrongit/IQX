/**
 * Raw-input charts for the L1–L4 layer cards.
 *
 * Ported from the legacy `StockAiInsightCharts` (dashboard/) and re-skinned to
 * the v2 tokens: series colours come from `--chart-*` / `--price-*`, grid and
 * axis from `--border` / `--muted-foreground`, no fixed hex, no animation.
 *
 * The raw-input payload mixes numbers with numeric strings and may be missing
 * keys entirely, so every field is read through `toNumber` / `shortDate` and
 * every list prop is optional.
 */
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

type RawRow = Record<string, unknown>

const NO_ROWS: readonly RawRow[] = []

const COLOR_PRICE = "var(--chart-2)"
const COLOR_MA10 = "var(--chart-1)"
const COLOR_MA20 = "var(--chart-5)"
const COLOR_VOLUME = "var(--chart-1)"
const COLOR_AVERAGE = "var(--chart-2)"
const COLOR_POS = "var(--price-up)"
const COLOR_NEG = "var(--price-down)"
const COLOR_GRID = "var(--border)"
const COLOR_AXIS = "var(--muted-foreground)"
const COLOR_ZERO = "var(--muted-foreground)"
const COLOR_CURSOR = "var(--muted)"

const AXIS_TICK = { fill: COLOR_AXIS, fontSize: 12 } as const
const LABEL_FILL = "var(--foreground)"

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/** Compact axis/label form: 1.2B / 3.4M / 5.6K. */
function fmtCompact(value: unknown): string {
  const n = typeof value === "number" ? value : toNumber(value)
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString("vi-VN")
}

const fixed2 = (value: unknown) => toNumber(value).toFixed(2)

/** "YYYY-MM-DD" or ISO → "DD/MM". */
function shortDate(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return ""
  const datePart = raw.split("T")[0]
  const [year, month, day] = datePart.split("-")
  return month && day ? `${day}/${month}` : (year ?? datePart)
}

/** Show every tick for short series, then thin out to ~7 dates. */
function xInterval(length: number): number {
  if (length <= 7) return 0
  if (length <= 14) return 1
  return Math.ceil(length / 7)
}

/** Value-label sampling so 12px labels never overlap on a 10–20 point chart. */
function isLabelled(index: number, length: number, maxLabels = 6): boolean {
  if (length <= maxLabels) return true
  const step = Math.ceil(length / maxLabels)
  return index % step === 0 || index === length - 1
}

const labelFormatter = (value: unknown): string =>
  typeof value === "number" && Number.isFinite(value) ? fmtCompact(value) : ""

type TooltipRow = { label: string; value: string; color?: string }

function RawTooltip({
  active,
  label,
  payload,
  rows,
}: {
  active?: boolean
  label?: ReactNode
  /** Injected by recharts when it clones this element. */
  payload?: readonly { payload?: unknown }[]
  rows: (row: RawRow) => TooltipRow[]
}) {
  const raw = payload?.[0]?.payload
  if (!active || typeof raw !== "object" || raw === null) return null

  return (
    <div className="rounded-md bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-semibold">{label}</div>
      {rows(raw as RawRow).map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="text-muted-foreground">{row.label}:</span>
          <span
            className="font-semibold tabular-nums"
            style={row.color ? { color: row.color } : undefined}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartLegend({
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
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  )
}

function ChartTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

/* ── L1 — Xu hướng ─────────────────────────────────────────────────────────── */

export function TrendRawChart({ ohlcv }: { ohlcv?: readonly RawRow[] }) {
  const data = useMemo(() => {
    const bars = ohlcv ?? NO_ROWS
    const closes = bars.map((bar) => toNumber(bar.close))
    const withMa = bars.map((bar, index) => ({
      date: shortDate(bar.date),
      close: toNumber(bar.close),
      volume: toNumber(bar.volume),
      ma10:
        index >= 9
          ? closes.slice(index - 9, index + 1).reduce((sum, value) => sum + value, 0) / 10
          : null,
      ma20:
        index >= 19
          ? closes.slice(index - 19, index + 1).reduce((sum, value) => sum + value, 0) / 20
          : null,
    }))
    const recent = withMa.slice(-20)
    return recent.map((row, index) => ({
      ...row,
      closeLabel: isLabelled(index, recent.length) ? row.close : null,
    }))
  }, [ohlcv])

  const domain = useMemo<[number, number]>(() => {
    const values: number[] = []
    for (const row of data) {
      if (row.close > 0) values.push(row.close)
      if (row.ma10 != null) values.push(row.ma10)
      if (row.ma20 != null) values.push(row.ma20)
    }
    if (values.length === 0) return [0, 1]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min) * 0.08 || 1
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [data])

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Không có dữ liệu OHLCV</p>
  }

  return (
    <div>
      <ChartTitle>Giá &amp; MA ({data.length} phiên)</ChartTitle>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} vertical={false} />
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
              width={36}
              domain={domain}
              allowDataOverflow
              tickFormatter={(value: number) => value.toFixed(0)}
            />
            <Tooltip
              cursor={{ fill: COLOR_CURSOR }}
              content={
                <RawTooltip
                  rows={(row) => [
                    { label: "Giá", value: fixed2(row.close), color: COLOR_PRICE },
                    {
                      label: "MA10",
                      value: row.ma10 == null ? "—" : fixed2(row.ma10),
                      color: COLOR_MA10,
                    },
                    {
                      label: "MA20",
                      value: row.ma20 == null ? "—" : fixed2(row.ma20),
                      color: COLOR_MA20,
                    },
                    { label: "Volume", value: fmtCompact(row.volume), color: COLOR_AXIS },
                  ]}
                />
              }
            />
            <Bar
              dataKey="close"
              fill={COLOR_PRICE}
              fillOpacity={0.7}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="closeLabel"
                position="top"
                formatter={(value: unknown) =>
                  typeof value === "number" ? value.toFixed(1) : ""
                }
                fill={LABEL_FILL}
                fontSize={12}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="ma10"
              stroke={COLOR_MA10}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma20"
              stroke={COLOR_MA20}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <ChartLegend swatch={COLOR_PRICE}>Giá</ChartLegend>
        <ChartLegend swatch={COLOR_MA10}>MA10</ChartLegend>
        <ChartLegend swatch={COLOR_MA20}>MA20</ChartLegend>
      </div>
    </div>
  )
}

/* ── L2 — Thanh khoản ──────────────────────────────────────────────────────── */

export function LiquidityRawChart({
  history,
  avgVolume,
}: {
  history?: readonly RawRow[]
  avgVolume?: number
}) {
  const data = useMemo(() => {
    const rows = [...(history ?? NO_ROWS)].reverse().map((row) => ({
      date: shortDate(row.date),
      volume: toNumber(row.totalVolume),
    }))
    const avg =
      avgVolume != null && Number.isFinite(avgVolume) && avgVolume > 0
        ? avgVolume
        : rows.length > 0
          ? rows.reduce((sum, row) => sum + row.volume, 0) / rows.length
          : 0
    return rows.map((row, index) => ({
      ...row,
      avg,
      volumeLabel: isLabelled(index, rows.length) ? row.volume : null,
    }))
  }, [history, avgVolume])

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Không có dữ liệu</p>
  }

  return (
    <div>
      <ChartTitle>Thanh khoản {data.length} phiên</ChartTitle>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} vertical={false} />
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
              width={44}
              tickFormatter={fmtCompact}
            />
            <Tooltip
              cursor={{ fill: COLOR_CURSOR }}
              content={
                <RawTooltip
                  rows={(row) => [
                    { label: "Volume khớp", value: fmtCompact(row.volume), color: COLOR_VOLUME },
                    { label: "Volume khớp TB", value: fmtCompact(row.avg), color: COLOR_AVERAGE },
                  ]}
                />
              }
            />
            <Bar
              dataKey="volume"
              fill={COLOR_VOLUME}
              fillOpacity={0.7}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="volumeLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={12}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="avg"
              stroke={COLOR_AVERAGE}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <ChartLegend swatch={COLOR_VOLUME}>Volume khớp</ChartLegend>
        <ChartLegend swatch={COLOR_AVERAGE} dashed>
          Volume khớp TB
        </ChartLegend>
      </div>
    </div>
  )
}

/* ── L3 — Dòng tiền ────────────────────────────────────────────────────────── */

export function MoneyFlowRawChart({ items, title }: { items?: readonly RawRow[]; title: string }) {
  const data = useMemo(() => {
    const rows = [...(items ?? NO_ROWS)].reverse().map((row) => ({
      date: shortDate(row.date),
      total: toNumber(row.totalNetVolume),
    }))
    return rows.map((row, index) => ({
      ...row,
      totalLabel: isLabelled(index, rows.length) ? row.total : null,
    }))
  }, [items])

  if (data.length === 0) {
    return (
      <div>
        <ChartTitle>{title}</ChartTitle>
        <p className="text-xs text-muted-foreground italic">Không có dữ liệu</p>
      </div>
    )
  }

  return (
    <div>
      <ChartTitle>{title}</ChartTitle>
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} vertical={false} />
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
              tickFormatter={fmtCompact}
            />
            <ReferenceLine y={0} stroke={COLOR_ZERO} strokeDasharray="2 2" />
            <Tooltip
              cursor={{ fill: COLOR_CURSOR }}
              content={
                <RawTooltip
                  rows={(row) => [
                    {
                      label: "Tổng ròng",
                      value: fmtCompact(row.total),
                      color: toNumber(row.total) >= 0 ? COLOR_POS : COLOR_NEG,
                    },
                  ]}
                />
              }
            />
            <Bar dataKey="total" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((row, index) => (
                <Cell key={index} fill={row.total >= 0 ? COLOR_POS : COLOR_NEG} />
              ))}
              <LabelList
                dataKey="totalLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <ChartLegend swatch={COLOR_POS}>Mua ròng (+)</ChartLegend>
        <ChartLegend swatch={COLOR_NEG}>Bán ròng (−)</ChartLegend>
      </div>
    </div>
  )
}

/* ── L4 — Nội bộ ───────────────────────────────────────────────────────────── */

export function InsiderRawChart({ txns }: { txns?: readonly RawRow[] }) {
  const data = useMemo(() => {
    const rows = [...(txns ?? NO_ROWS)].reverse().map((txn) => {
      const action = typeof txn.action === "string" ? txn.action : ""
      return {
        date: shortDate(txn.startDate),
        executed: toNumber(txn.shareExecuted),
        action: action || "—",
        isSell: action.toLowerCase().includes("bán"),
      }
    })
    return rows.map((row, index) => ({
      ...row,
      executedLabel: isLabelled(index, rows.length) ? row.executed : null,
    }))
  }, [txns])

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Không có giao dịch</p>
  }

  return (
    <div>
      <ChartTitle>Giao dịch nội bộ ({data.length})</ChartTitle>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} vertical={false} />
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
              tickFormatter={fmtCompact}
            />
            <Tooltip
              cursor={{ fill: COLOR_CURSOR }}
              content={
                <RawTooltip
                  rows={(row) => [
                    {
                      label: "Hành động",
                      value: String(row.action ?? "—"),
                      color: row.isSell ? COLOR_NEG : COLOR_POS,
                    },
                    {
                      label: "KL thực hiện",
                      value: fmtCompact(row.executed),
                      color: row.isSell ? COLOR_NEG : COLOR_POS,
                    },
                  ]}
                />
              }
            />
            <Bar dataKey="executed" isAnimationActive={false}>
              {data.map((row, index) => (
                <Cell key={index} fill={row.isSell ? COLOR_NEG : COLOR_POS} />
              ))}
              <LabelList
                dataKey="executedLabel"
                position="top"
                formatter={labelFormatter}
                fill={LABEL_FILL}
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <ChartLegend swatch={COLOR_POS}>Mua</ChartLegend>
        <ChartLegend swatch={COLOR_NEG}>Bán</ChartLegend>
      </div>
    </div>
  )
}
