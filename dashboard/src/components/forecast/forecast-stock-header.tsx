import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { usePrice } from "@/contexts/market-data-context"
import { StockLogo } from "@/components/stock/stock-logo"
import { useWatchlist } from "@/hooks/use-watchlist"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—"
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M"
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K"
  return v.toLocaleString("vi-VN")
}

function fmtValueVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—"
  // totalValue is in VND. Display as tỷ.
  if (v >= 1e9) return (v / 1e9).toFixed(1) + " tỷ"
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " tr"
  return v.toLocaleString("vi-VN")
}

function changeColor(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-amber-400"
}

interface CompanyMeta {
  name: string
  exchange: string
}

export function ForecastStockHeader({ symbol }: { symbol: string | null }) {
  const { data } = usePrice(symbol || "")
  const [meta, setMeta] = useState<CompanyMeta>({ name: "", exchange: "" })
  const { isSymbolWatched, toggleSymbol, isUnavailable } = useWatchlist()

  useEffect(() => {
    if (!symbol) {
      setMeta({ name: "", exchange: "" })
      return
    }
    const controller = new AbortController()
    fetch(`${API_BASE}/market-data/company/${symbol}/overview`, { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (controller.signal.aborted) return
        const d = res?.data ?? res ?? {}
        setMeta({
          name: d.organ_name || d.organName || d.organ_short_name || d.organShortName || "",
          exchange: d.exchange || "",
        })
      })
      .catch(() => {
        /* keep price-board exchange fallback */
      })
    return () => controller.abort()
  }, [symbol])

  if (!symbol) return null

  const price = data?.closePrice || data?.referencePrice || 0
  const change = data?.priceChange ?? 0
  const pct = data?.percentChange ?? 0
  const volume = data?.totalVolume ?? 0
  const value = data?.totalValue ?? 0
  const exchange = meta.exchange || data?.exchange || ""
  const watched = isSymbolWatched(symbol)
  const cc = changeColor(change)

  return (
    <div className="rounded-xl border border-border/30 bg-card/30 p-3 md:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <StockLogo symbol={symbol} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-foreground leading-none">{symbol}</h1>
              {exchange && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  {exchange}
                </span>
              )}
              {!isUnavailable && (
                <button
                  onClick={() => toggleSymbol(symbol)}
                  className="text-muted-foreground hover:text-amber-400 transition-colors"
                  aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
                >
                  <Star className={`size-4 ${watched ? "fill-amber-400 text-amber-400" : ""}`} />
                </button>
              )}
            </div>
            {meta.name && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{meta.name}</p>
            )}
          </div>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-4 gap-3 md:gap-5 shrink-0">
          <Metric label="Giá hiện tại" value={price > 0 ? price.toFixed(2) : "—"} />
          <Metric
            label="Tăng hiện tại"
            value={`${change > 0 ? "+" : ""}${change.toFixed(2)}`}
            valueClass={cc}
          />
          <Metric
            label="% thay đổi hiện tại"
            value={`${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
            valueClass={cc}
          />
          <Metric
            label="Khối lượng hiện tại"
            value={fmtVolume(volume)}
            sub={value > 0 ? fmtValueVnd(value) : undefined}
          />
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="text-right md:text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${valueClass || "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  )
}
