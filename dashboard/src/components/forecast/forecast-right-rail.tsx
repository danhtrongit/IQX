import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CandlestickChart,
  CheckCircle2,
  LineChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { usePrice } from "@/contexts/market-data-context"
import { StockLogo } from "@/components/stock/stock-logo"
import {
  CandlePatternIllustration,
  ChartPatternIllustration,
} from "@/components/patterns/pattern-illustration"
import { api } from "@/lib/api"

// ─── Types ─────────────────────────────────────────────

interface FinancialRatio {
  pe?: number | null
  pb?: number | null
  eps?: number | null
  bvps?: number | null
  roe?: number | null
  roa?: number | null
  de?: number | null
}

type Signal = "bullish" | "bearish" | "neutral"

interface PatternItem {
  symbol: string
  name: string
  signal: Signal
  signalLabel: string | null
  state: string | null
  meaning: string | null
  action: string | null
  illustration: string | null
}

interface PatternResponse {
  symbol: string
  kind: "candles" | "charts"
  items: PatternItem[]
  count: number
}

// ─── Helpers ───────────────────────────────────────────

function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

function fmtPctRaw(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = signed && v > 0 ? "+" : ""
  return `${sign}${v.toFixed(2)}%`
}

function fmtRatio(v: number | null | undefined, suffix = "x"): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(2)}${suffix}`
}

// ─── Stock header ──────────────────────────────────────

function StockHeader({ symbol }: { symbol: string }) {
  const { data } = usePrice(symbol)
  const price = data?.closePrice || data?.referencePrice || 0
  const changePct = data?.percentChange ?? 0
  const changeColor =
    changePct > 0 ? "text-emerald-400" : changePct < 0 ? "text-red-400" : "text-amber-400"
  const ChangeIcon = changePct > 0 ? TrendingUp : changePct < 0 ? TrendingDown : Sparkles

  return (
    <div className="rounded-xl border border-border/30 bg-card/40 p-3">
      <div className="flex items-center gap-3">
        <StockLogo symbol={symbol} size={44} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-foreground">{symbol}</span>
          <span className="text-[10px] text-muted-foreground">Giá hiện tại (VND/1.000)</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between mt-2">
        <span className="text-2xl font-extrabold text-foreground tabular-nums">
          {price > 0 ? price.toFixed(2) : "—"}
        </span>
        <span className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${changeColor}`}>
          <ChangeIcon className="size-3.5" />
          {fmtPctRaw(changePct, true)}
        </span>
      </div>
    </div>
  )
}

// ─── Financial ratios card ─────────────────────────────

function RatiosCard({ symbol }: { symbol: string }) {
  const [ratio, setRatio] = useState<FinancialRatio | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(
      `${import.meta.env.VITE_API_URL || "/api/v1"}/market-data/fundamentals/${symbol}/ratio?period=Q`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((res) => {
        if (controller.signal.aborted) return
        const data = res?.data ?? res
        const arr = Array.isArray(data) ? data : data?.ratio
        const latest: Record<string, unknown> = Array.isArray(arr) ? arr[0] : arr
        if (!latest) {
          setRatio(null)
          setError("Không có chỉ số tài chính")
          return
        }
        setRatio({
          pe: (latest.pe as number) ?? null,
          pb: (latest.pb as number) ?? null,
          eps: (latest.eps as number) ?? null,
          bvps: (latest.bvps as number) ?? null,
          roe: (latest.roe as number) ?? null,
          roa: (latest.roa as number) ?? null,
          de:
            ((latest.debt_to_equity ?? latest.de ?? latest.debtToEquity) as number) ??
            null,
        })
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setRatio(null)
        setError("Lỗi tải chỉ số")
        console.error(e)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  return (
    <div className="rounded-xl border border-border/30 bg-card/40 p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 mb-2">
        Chỉ số BCTC
      </h3>
      {loading ? (
        <div className="text-[10px] text-muted-foreground py-4 text-center">Đang tải...</div>
      ) : error ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground py-4 justify-center">
          <AlertTriangle className="size-3 text-amber-500" />
          {error}
        </div>
      ) : ratio ? (
        <div className="grid grid-cols-4 gap-2 text-[10px]">
          <RatioCell label="P/E" value={fmtRatio(ratio.pe)} accent="cyan" />
          <RatioCell label="P/B" value={fmtRatio(ratio.pb)} accent="cyan" />
          <RatioCell label="EPS" value={fmtVnd(ratio.eps)} />
          <RatioCell label="BVPS" value={fmtVnd(ratio.bvps)} />
          <RatioCell
            label="ROA"
            value={ratio.roa != null ? `${(ratio.roa * 100).toFixed(1)}%` : "—"}
            accent="emerald"
          />
          <RatioCell
            label="ROE"
            value={ratio.roe != null ? `${(ratio.roe * 100).toFixed(1)}%` : "—"}
            accent="emerald"
          />
          <RatioCell label="D/E" value={fmtRatio(ratio.de)} />
          <span />
        </div>
      ) : null}
    </div>
  )
}

function RatioCell({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: "cyan" | "emerald"
}) {
  const valueCls =
    accent === "cyan"
      ? "text-cyan-400"
      : accent === "emerald"
        ? "text-emerald-400"
        : "text-foreground"
  return (
    <div className="rounded-md bg-muted/20 px-1.5 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs font-bold tabular-nums mt-0.5 ${valueCls}`}>{value}</div>
    </div>
  )
}

// ─── Patterns block ────────────────────────────────────

function PatternsBlock({ symbol }: { symbol: string }) {
  const [candles, setCandles] = useState<PatternItem | null>(null)
  const [charts, setCharts] = useState<PatternItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setCandles(null)
    setCharts(null)

    Promise.all([
      api
        .get("ai/patterns/candles", { searchParams: { symbol }, signal: controller.signal })
        .json<PatternResponse>()
        .catch(() => null),
      api
        .get("ai/patterns/charts", { searchParams: { symbol }, signal: controller.signal })
        .json<PatternResponse>()
        .catch(() => null),
    ])
      .then(([candlesRes, chartsRes]) => {
        if (controller.signal.aborted) return
        setCandles(candlesRes?.items?.[0] ?? null)
        setCharts(chartsRes?.items?.[0] ?? null)
        if (!candlesRes?.items?.length && !chartsRes?.items?.length) {
          setError(`Chưa có pattern cho ${symbol}`)
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setError("Lỗi tải pattern")
        console.error(e)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-3 text-[10px] text-muted-foreground text-center py-6">
        Đang phân tích mẫu hình...
      </div>
    )
  }

  if (error && !candles && !charts) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-3 text-[10px] text-muted-foreground py-6 text-center inline-flex items-center justify-center gap-1">
        <AlertTriangle className="size-3 text-amber-500" />
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {candles && <PatternCard kind="candles" item={candles} />}
      {charts && <PatternCard kind="charts" item={charts} />}
    </div>
  )
}

const SIGNAL_CLS: Record<Signal, string> = {
  bullish: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  bearish: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}

const SIGNAL_LABEL: Record<Signal, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Trung tính",
}

function PatternCard({ kind, item }: { kind: "candles" | "charts"; item: PatternItem }) {
  const Icon = kind === "candles" ? CandlestickChart : LineChart
  return (
    <div className="rounded-xl border border-border/30 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Icon className="size-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {kind === "candles" ? "AI Mẫu nến" : "AI Mẫu giá"}
        </span>
        <span
          className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${SIGNAL_CLS[item.signal]}`}
        >
          {SIGNAL_LABEL[item.signal]}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <h4 className="text-sm font-extrabold text-foreground">{item.name}</h4>
        <div className="rounded-md border border-border/40 bg-muted/10 p-2 aspect-[4/3]">
          {kind === "candles" ? (
            <CandlePatternIllustration name={item.name} signal={item.signal} />
          ) : (
            <ChartPatternIllustration name={item.name} />
          )}
        </div>
        {item.meaning && (
          <div className="text-[10px] leading-snug">
            <span className="inline-flex items-center gap-1 text-foreground/80 font-semibold">
              <CheckCircle2 className="size-3 text-emerald-400" />
              Ý nghĩa:
            </span>
            <p className="text-foreground/70 mt-0.5">{item.meaning}</p>
          </div>
        )}
        {item.action && (
          <div className="text-[10px] leading-snug">
            <span className="inline-flex items-center gap-1 text-foreground/80 font-semibold">
              <TrendingUp className="size-3 text-primary" />
              Hành động:
            </span>
            <p className="text-foreground/70 mt-0.5">{item.action}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────

export function ForecastRightRail({ symbol }: { symbol: string | null }) {
  if (!symbol) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <Sparkles className="size-5 opacity-30 mb-2" />
        <span className="text-xs">Chọn 1 mã để xem chi tiết</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
      <StockHeader symbol={symbol} />
      <RatiosCard symbol={symbol} />
      <PatternsBlock symbol={symbol} />
    </div>
  )
}
