import { IconStar, IconStarFill } from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { usePrice } from "@/features/market-data"
import { useWatchlistToggle } from "@/features/watchlist"
import { StockLogo } from "@/features/navigation/StockLogo"
import { useForecastCompany } from "../hooks"
import { fmtValueVnd, fmtVolume } from "../format"

function changeColor(v: number): string {
  return v > 0 ? "text-up" : v < 0 ? "text-down" : "text-reference"
}

export function ForecastStockHeader({ symbol }: { symbol: string | null }) {
  const { data } = usePrice(symbol || "")
  const { data: meta } = useForecastCompany(symbol)
  const { isAuthenticated } = useAuth()
  const { isWatched, toggle } = useWatchlistToggle()

  if (!symbol) return null

  const price = data?.closePrice || data?.referencePrice || 0
  const change = data?.priceChange ?? 0
  const pct = data?.percentChange ?? 0
  const volume = data?.totalVolume ?? 0
  const value = data?.totalValue ?? 0
  const exchange = meta?.exchange || data?.exchange || ""
  const watched = isWatched(symbol)
  const cc = changeColor(change)

  return (
    <div className="rounded-xl border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3 md:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3">
          <StockLogo symbol={symbol} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold leading-none text-[var(--color-text-1)]">
                {symbol}
              </h1>
              {exchange && (
                <span className="rounded border border-up/40 bg-up/10 px-1.5 py-0.5 text-[10px] font-bold text-up">
                  {exchange}
                </span>
              )}
              {isAuthenticated && (
                <button
                  onClick={() => void toggle(symbol)}
                  className="text-[var(--color-text-3)] transition-colors hover:text-[rgb(var(--warning-6))]"
                  aria-label={watched ? "Bỏ theo dõi" : "Theo dõi"}
                >
                  {watched ? (
                    <IconStarFill className="text-[rgb(var(--warning-6))]" style={{ fontSize: 16 }} />
                  ) : (
                    <IconStar style={{ fontSize: 16 }} />
                  )}
                </button>
              )}
            </div>
            {meta?.name && (
              <p className="mt-0.5 truncate text-xs text-[var(--color-text-3)]">{meta.name}</p>
            )}
          </div>
        </div>

        {/* Metrics strip */}
        <div className="grid shrink-0 grid-cols-4 gap-3 md:gap-5">
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
      <p className="text-[10px] uppercase leading-tight tracking-wider text-[var(--color-text-3)]">
        {label}
      </p>
      <p className={`text-base font-bold tabular-nums ${valueClass || "text-[var(--color-text-1)]"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] tabular-nums text-[var(--color-text-3)]">{sub}</p>}
    </div>
  )
}
