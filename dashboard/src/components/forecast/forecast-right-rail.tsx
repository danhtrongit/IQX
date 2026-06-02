import { useEffect, useState } from "react"
import { AlertTriangle, Info, Sparkles } from "lucide-react"
import { fmtRatioPlain } from "./forecast-format"

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

// ─── Helpers ───────────────────────────────────────────

function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

function fmtPctFraction(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${(v * 100).toFixed(1)}%`
}

// ─── Main ─────────────────────────────────────────────

export function ForecastRightRail({ symbol }: { symbol: string | null }) {
  const [ratio, setRatio] = useState<FinancialRatio | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbol) {
      setRatio(null)
      setLoading(false)
      setError(null)
      return
    }
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
      .catch(() => {
        if (controller.signal.aborted) return
        setRatio(null)
        setError("Lỗi tải chỉ số")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [symbol])

  if (!symbol) {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Sparkles className="size-5 opacity-30 mb-2" />
          <span className="text-xs">Chọn 1 mã để xem chi tiết</span>
        </div>
      </Frame>
    )
  }

  if (loading) {
    return (
      <Frame>
        <div className="py-6 text-center text-[11px] text-muted-foreground">Đang tải...</div>
      </Frame>
    )
  }

  if (error || !ratio) {
    return (
      <Frame>
        <div className="py-6 text-center text-[11px] text-muted-foreground inline-flex items-center justify-center gap-1 w-full">
          <AlertTriangle className="size-3 text-amber-500" />
          {error || "Không có dữ liệu"}
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      {/* Top row: 4 simple ratios — P/E, P/B, EPS, BVPS */}
      <div className="grid grid-cols-4 gap-2">
        <RatioCell label="P/E" value={fmtRatioPlain(ratio.pe)} />
        <RatioCell label="P/B" value={fmtRatioPlain(ratio.pb)} />
        <RatioCell label="EPS" value={fmtVnd(ratio.eps)} />
        <RatioCell label="BVPS" value={fmtVnd(ratio.bvps)} />
      </div>
      {/* Bottom row: 3 ratios — ROA, ROE, D/E */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        <RatioCell label="ROA" value={fmtPctFraction(ratio.roa)} />
        <RatioCell label="ROE" value={fmtPctFraction(ratio.roe)} />
        <RatioCell label="D/E" value={fmtRatioPlain(ratio.de)} />
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/30 p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          Chỉ số BCTC
        </span>
        <Info className="size-3 text-muted-foreground/60" />
      </div>
      {children}
    </div>
  )
}

function RatioCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/40 border border-border/20 px-2 py-3 text-center">
      <div className="text-[11px] font-bold uppercase tracking-wider text-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums text-foreground mt-1">{value}</div>
    </div>
  )
}
