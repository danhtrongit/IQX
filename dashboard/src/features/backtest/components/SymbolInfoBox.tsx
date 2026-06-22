import { useStockOverview } from "@/features/stock/hooks"
import { usePrice } from "@/features/market-data/hooks"
import { fmtPrice, fmtDateVN } from "../format"
import type { RunResult } from "../types"

interface Props {
  symbol: string
  meta: RunResult["meta"] | null
}

export function SymbolInfoBox({ symbol, meta }: Props) {
  const { data: overview } = useStockOverview(symbol)
  const { data: priceData } = usePrice(symbol)

  if (!symbol) return null

  const profile = overview?.profile
  const industry = profile?.icbName3 || profile?.icbName4 || ""

  const closePrice = priceData?.closePrice ?? null
  const pct = priceData?.percentChange ?? null

  return (
    <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-2.5 text-xs text-[var(--color-text-2)]">
      {/* Row 1: company name · exchange · industry */}
      <div className="flex flex-wrap gap-x-1.5 font-medium text-[var(--color-text-1)]">
        {profile?.organName && <span>{profile.organName}</span>}
        {profile?.exchange && (
          <>
            <span className="text-[var(--color-text-3)]">·</span>
            <span>{profile.exchange}</span>
          </>
        )}
        {industry && (
          <>
            <span className="text-[var(--color-text-3)]">·</span>
            <span className="text-[var(--color-text-2)]">{industry}</span>
          </>
        )}
      </div>

      {/* Row 2: price · percent change */}
      <div className="mt-0.5 flex items-center gap-1.5">
        <span>{closePrice != null ? fmtPrice(closePrice) : "—"}</span>
        {pct != null ? (
          <span className={pct >= 0 ? "text-up" : "text-down"}>
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </span>
        ) : (
          <span>—</span>
        )}
      </div>

      {/* Row 3: meta info — only when a run result exists */}
      {meta && (
        <div className="mt-0.5 text-[var(--color-text-3)]">
          Dữ liệu: {meta.n_sessions} phiên ({fmtDateVN(meta.start)} → {fmtDateVN(meta.end)})
        </div>
      )}
    </div>
  )
}
