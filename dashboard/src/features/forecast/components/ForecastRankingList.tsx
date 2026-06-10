import { useMemo, useState } from "react"
import { Dropdown, Menu } from "@arco-design/web-react"
import {
  IconDown,
  IconExclamationCircle,
  IconStar,
  IconStarFill,
} from "@arco-design/web-react/icon"
import { useAuth } from "@/features/auth"
import { useWatchlistToggle } from "@/features/watchlist"
import { StockLogo } from "@/features/navigation/StockLogo"
import type { ForecastItem } from "../api"
import { fmtPct, fmtProjectedPrice } from "../format"
import { IconSparkles } from "../icons"
import { AIAnalyzingOverlay } from "./AIAnalyzingOverlay"

const PAGE_SIZE = 5

type SortMode = "return" | "price"

const SORT_LABELS: Record<SortMode, string> = {
  return: "Lợi nhuận dự kiến",
  price: "Giá dự phóng",
}

/** Returns a stable accent color for the rounded logo badge by symbol. */
function logoTint(symbol: string): { bg: string; ring: string } {
  const palettes = [
    { bg: "rgba(56,189,248,0.18)", ring: "rgba(56,189,248,0.55)" },
    { bg: "rgba(248,113,113,0.18)", ring: "rgba(248,113,113,0.55)" },
    { bg: "rgba(168,85,247,0.18)", ring: "rgba(168,85,247,0.55)" },
    { bg: "rgba(245,158,11,0.18)", ring: "rgba(245,158,11,0.55)" },
    { bg: "rgba(16,185,129,0.18)", ring: "rgba(16,185,129,0.55)" },
  ]
  let hash = 0
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0
  return palettes[hash % palettes.length]
}

export function ForecastRankingList({
  items,
  loading,
  error,
  selectedSymbol,
  onSelect,
}: {
  items: ForecastItem[]
  loading: boolean
  error: string | null
  selectedSymbol: string | null
  onSelect: (symbol: string) => void
}) {
  const [sortMode, setSortMode] = useState<SortMode>("return")
  const [showAll, setShowAll] = useState(false)
  const { isAuthenticated } = useAuth()
  const { isWatched, toggle } = useWatchlistToggle()

  const sorted = useMemo(() => {
    const copy = [...items]
    if (sortMode === "price") {
      copy.sort((a, b) => (b.projectedPrice ?? 0) - (a.projectedPrice ?? 0))
    } else {
      copy.sort((a, b) => b.expectedReturn - a.expectedReturn)
    }
    return copy
  }, [items, sortMode])

  const visible = showAll ? sorted : sorted.slice(0, PAGE_SIZE)

  const sortMenu = (
    <Menu
      onClickMenuItem={(key) => setSortMode(key as SortMode)}
      selectedKeys={[sortMode]}
      style={{ width: 160 }}
    >
      {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
        <Menu.Item key={m}>{SORT_LABELS[m]}</Menu.Item>
      ))}
    </Menu>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header — title + sort dropdown */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-3 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-1)]">
          Mã đề xuất
        </span>
        <IconSparkles className="text-[var(--color-text-4)]" style={{ fontSize: 12 }} />
        <div className="ml-auto">
          <Dropdown droplist={sortMenu} trigger="click" position="br">
            <span className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">
              Sắp xếp
              <IconDown style={{ fontSize: 12 }} />
            </span>
          </Dropdown>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3">
            <AIAnalyzingOverlay label="Đang chạy mô hình AI" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-3)]">
            <IconExclamationCircle className="mb-2 text-[rgb(var(--warning-6))]" style={{ fontSize: 16 }} />
            <span className="px-4 text-center text-[10px]">{error}</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-3)]">
            <IconSparkles className="mb-2 opacity-30" style={{ fontSize: 16 }} />
            <span className="text-[10px]">Chưa có dữ liệu mô hình</span>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {visible.map((it) => {
              const isSelected = selectedSymbol === it.symbol
              const tint = logoTint(it.symbol)
              const watched = isWatched(it.symbol)
              return (
                <div
                  key={it.symbol}
                  onClick={() => onSelect(it.symbol)}
                  className={`relative cursor-pointer rounded-xl border bg-[var(--color-bg-2)] transition-colors hover:bg-[var(--color-fill-1)] ${
                    isSelected
                      ? "border-[rgb(var(--primary-6))] ring-1 ring-[rgb(var(--primary-6))]/30"
                      : "border-[var(--color-border-1)]"
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Logo badge */}
                    <div
                      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                      style={{ backgroundColor: tint.bg, boxShadow: `inset 0 0 0 1px ${tint.ring}` }}
                    >
                      <StockLogo symbol={it.symbol} size={36} className="rounded-full" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-extrabold text-[var(--color-text-1)]">
                          {it.symbol}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[9px] text-[var(--color-text-3)]">Giá dự phóng</p>
                          <p className="text-sm font-bold tabular-nums text-[var(--color-text-1)]">
                            {fmtProjectedPrice(it.projectedPrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-[var(--color-text-3)]">Lợi nhuận dự kiến</p>
                          <p
                            className={`text-sm font-bold tabular-nums ${
                              it.expectedReturn >= 0 ? "text-up" : "text-down"
                            }`}
                          >
                            {fmtPct(it.expectedReturn, true)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Watchlist star */}
                    {isAuthenticated && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggle(it.symbol)
                        }}
                        className="-m-1 shrink-0 p-1 text-[var(--color-text-3)] transition-colors hover:text-[rgb(var(--warning-6))]"
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
                </div>
              )
            })}

            {/* Show-more / show-less */}
            {sorted.length > PAGE_SIZE && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md py-2 text-[11px] font-semibold text-[rgb(var(--primary-6))] hover:bg-[rgb(var(--primary-6))]/5"
              >
                {showAll ? "Thu gọn" : "Xem thêm mã đề xuất"}
                <IconDown
                  className={`transition-transform ${showAll ? "rotate-180" : ""}`}
                  style={{ fontSize: 12 }}
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
