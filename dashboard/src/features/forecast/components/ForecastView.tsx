import { useState } from "react"
import type { ForecastHorizon } from "../api"
import { useForecastRanking } from "../hooks"
import { fmtPct, fmtProjectedPrice } from "../format"
import { ForecastRankingList } from "./ForecastRankingList"
import { ForecastStockHeader } from "./ForecastStockHeader"
import { ForecastLayerCards } from "./ForecastLayerCards"
import { ForecastPatterns } from "./ForecastPatterns"
import { ForecastRightRail } from "./ForecastRightRail"

// Default horizon — the view itself has no horizon selector in the mockup.
const DEFAULT_HORIZON: ForecastHorizon = "5"

/**
 * The shared forecast surface (ranking sidebar + detail panel). Used both by the
 * full `/du-bao` page and the draggable `ForecastWindow` in the dashboard
 * terminal. Ported from `dashboard-bak/src/components/forecast/forecast-page.tsx`.
 */
export function ForecastView() {
  const { data, isLoading, error } = useForecastRanking(DEFAULT_HORIZON)
  const items = data ?? []
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null)

  // Selected symbol derives from the user's pick, falling back to the top item
  // (render-time derivation — no effect, mirrors the bak fallback behaviour).
  const selectedSymbol =
    pinnedSymbol && items.some((it) => it.symbol === pinnedSymbol)
      ? pinnedSymbol
      : (items[0]?.symbol ?? null)

  const errorMessage = error ? "Không thể tải bảng xếp hạng mô hình AI" : null

  // Shared content (header + 5 layers + BCTC + patterns).
  const detail = (
    <div className="space-y-3">
      <ForecastStockHeader symbol={selectedSymbol} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ForecastLayerCards symbol={selectedSymbol} />
        <ForecastRightRail symbol={selectedSymbol} />
      </div>
      <ForecastPatterns symbol={selectedSymbol} />
      <p className="pt-1 text-center text-[10px] italic text-[var(--color-text-3)]">
        Khuyến nghị chỉ có tính chất tham khảo, không phải là lời khuyên đầu tư.
      </p>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Mobile: thẻ mã kèm Giá dự phóng + Lợi nhuận dự kiến ── */}
      <div className="shrink-0 border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
          {items.map((it) => {
            const active = it.symbol === selectedSymbol
            return (
              <button
                key={it.symbol}
                onClick={() => setPinnedSymbol(it.symbol)}
                className={`w-[150px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[rgb(var(--primary-6))]/60 bg-[rgb(var(--primary-6))]/10"
                    : "border-[var(--color-border-1)] bg-[var(--color-bg-2)] hover:border-[var(--color-border-2)]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${active ? "bg-[rgb(var(--primary-6))]" : "bg-up"}`}
                  />
                  <span className="text-sm font-extrabold text-[var(--color-text-1)]">{it.symbol}</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] text-[var(--color-text-3)]">Giá dự phóng</p>
                    <p className="text-sm font-bold tabular-nums text-[var(--color-text-1)]">
                      {fmtProjectedPrice(it.projectedPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-[var(--color-text-3)]">Lợi nhuận</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        it.expectedReturn >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {fmtPct(it.expectedReturn, true)}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Desktop: ranking sidebar ── */}
        <aside className="hidden min-h-0 lg:flex lg:w-[280px] lg:shrink-0 lg:flex-col lg:border-r lg:border-[var(--color-border-1)]">
          <ForecastRankingList
            items={items}
            loading={isLoading}
            error={errorMessage}
            selectedSymbol={selectedSymbol}
            onSelect={setPinnedSymbol}
          />
        </aside>

        {/* ── Detail area ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-3">{detail}</div>
        </div>
      </div>
    </div>
  )
}
