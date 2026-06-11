import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { usePrices } from "@/features/market-data"
import { useGroups } from "@/features/stock-directory/hooks"
import { cn } from "@/shared/lib/cn"
import type { PriceBoardData } from "@/features/market-data"

/**
 * /bang-gia — SSI iBoard-style live price board.
 *
 * Dense grid: Trần/Sàn/TC, bid depth (3), khớp lệnh, ask depth (3), tổng KL,
 * cao/thấp, and foreign (NN mua/bán/room). Live prices come from the shared
 * MarketDataProvider, so this board is fed by the realtime DNSE WebSocket
 * (tick overlay) with REST polling fallback — no extra wiring needed.
 *
 * Color convention follows Vietnamese trading boards (domain standard, not
 * decorative): ceiling = tím, floor = xanh lơ, reference = vàng, tăng = xanh,
 * giảm = đỏ.
 */

const GROUPS = ["VN30", "VN100", "HOSE", "HNX30", "HNX", "UPCOM"] as const
type Group = (typeof GROUPS)[number]

// ── formatters ────────────────────────────────────
/** Price stored in "nghìn đồng" convention → "73.40". */
function fmtK(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—"
  return n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Share volume → compact (e.g. 103600 → "103,600"). */
function fmtVol(n: number | null | undefined): string {
  if (!n) return "—"
  return Math.round(n).toLocaleString("vi-VN")
}

/** Large VND value → "X tỷ". */
function fmtBil(n: number | null | undefined): string {
  if (!n) return "—"
  if (n >= 1e9) return (n / 1e9).toFixed(1)
  if (n >= 1e6) return (n / 1e6).toFixed(2)
  return Math.round(n).toLocaleString("vi-VN")
}

/** Color class for a price cell relative to reference/ceiling/floor. */
function priceTone(price: number, p: PriceBoardData): string {
  if (price <= 0) return "text-[var(--color-text-3)]"
  if (p.ceilingPrice && price >= p.ceilingPrice) return "text-ceiling"
  if (p.floorPrice && price <= p.floorPrice) return "text-floor"
  if (p.referencePrice && price === p.referencePrice) return "text-reference"
  if (p.referencePrice && price > p.referencePrice) return "text-up"
  if (p.referencePrice && price < p.referencePrice) return "text-down"
  return "text-[var(--color-text-1)]"
}

function changeTone(p: PriceBoardData): string {
  if (!p.hasTraded) return "text-reference"
  if (p.priceChange > 0) return "text-up"
  if (p.priceChange < 0) return "text-down"
  return "text-reference"
}

// ── depth cell ────────────────────────────────────
function DepthCell({ price, vol, p }: { price?: number; vol?: number; p: PriceBoardData }) {
  if (!price || price <= 0) {
    return (
      <>
        <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-3)]">—</td>
        <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-3)]">—</td>
      </>
    )
  }
  return (
    <>
      <td className={cn("px-2 py-1 text-right tabular-nums font-medium", priceTone(price, p))}>
        {fmtK(price)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtVol(vol)}</td>
    </>
  )
}

export default function BangGiaPage() {
  useEffect(() => {
    document.title = "Bảng giá | IQX"
  }, [])

  const navigate = useNavigate()
  const [group, setGroup] = useState<Group>("VN30")
  const { tickers, isLoading: isGroupLoading } = useGroups(group)

  // Subscribe to live prices for all tickers in the selected group.
  const { priceMap } = usePrices(tickers)

  const rows = useMemo(
    () => tickers.map((sym) => priceMap[sym]).filter((p): p is PriceBoardData => !!p),
    [tickers, priceMap],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 py-4">
      {/* Header + group tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-text-1)]">Bảng giá</h1>
          <p className="text-xs text-[var(--color-text-3)]">
            Cập nhật realtime · {rows.length}/{tickers.length} mã
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                group === g
                  ? "bg-[rgb(var(--primary-6))] text-white"
                  : "bg-[var(--color-fill-2)] text-[var(--color-text-2)] hover:bg-[var(--color-fill-3)]",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Board table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border-2)]">
        <table className="w-full min-w-[1200px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-bg-2)] text-[10px] uppercase text-[var(--color-text-3)]">
            <tr className="border-b border-[var(--color-border-2)]">
              <th rowSpan={2} className="px-2 py-2 text-left">Mã</th>
              <th rowSpan={2} className="px-2 py-2 text-right">Trần</th>
              <th rowSpan={2} className="px-2 py-2 text-right">Sàn</th>
              <th rowSpan={2} className="px-2 py-2 text-right">TC</th>
              <th colSpan={6} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center text-up">Bên mua</th>
              <th colSpan={3} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center">Khớp lệnh</th>
              <th colSpan={6} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center text-down">Bên bán</th>
              <th rowSpan={2} className="border-l border-[var(--color-border-2)] px-2 py-2 text-right">Tổng KL</th>
              <th rowSpan={2} className="px-2 py-2 text-right">GT (tỷ)</th>
              <th rowSpan={2} className="px-2 py-2 text-right">Cao</th>
              <th rowSpan={2} className="px-2 py-2 text-right">Thấp</th>
              <th colSpan={3} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center">ĐTNN</th>
            </tr>
            <tr className="border-b border-[var(--color-border-2)]">
              <th className="border-l border-[var(--color-border-2)] px-2 py-1 text-right">Giá 3</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">Giá 2</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">Giá 1</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="border-l border-[var(--color-border-2)] px-2 py-1 text-right">Giá</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">+/-</th>
              <th className="border-l border-[var(--color-border-2)] px-2 py-1 text-right">Giá 1</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">Giá 2</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">Giá 3</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="border-l border-[var(--color-border-2)] px-2 py-1 text-right">Mua</th>
              <th className="px-2 py-1 text-right">Bán</th>
              <th className="px-2 py-1 text-right">Room</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={24} className="px-3 py-10 text-center text-[var(--color-text-3)]">
                  {isGroupLoading ? "Đang tải danh sách mã…" : "Đang chờ dữ liệu giá…"}
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const bid = p.bid ?? []
                const ask = p.ask ?? []
                const sign = p.priceChange > 0 ? "+" : ""
                return (
                  <tr
                    key={p.symbol}
                    onClick={() => navigate(`/co-phieu/${p.symbol}`)}
                    className="cursor-pointer border-b border-[var(--color-border-1)] hover:bg-[var(--color-fill-1)]"
                  >
                    <td className="px-2 py-1 font-bold text-[var(--color-text-1)]">{p.symbol}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-ceiling">{fmtK(p.ceilingPrice)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-floor">{fmtK(p.floorPrice)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-reference">{fmtK(p.referencePrice)}</td>

                    {/* Bid side: Giá 3 → Giá 1 (best bid closest to match) */}
                    <DepthCell price={bid[2]?.price} vol={bid[2]?.volume} p={p} />
                    <DepthCell price={bid[1]?.price} vol={bid[1]?.volume} p={p} />
                    <DepthCell price={bid[0]?.price} vol={bid[0]?.volume} p={p} />

                    {/* Match */}
                    <td className={cn("border-l border-[var(--color-border-2)] px-2 py-1 text-right tabular-nums font-bold", priceTone(p.closePrice, p))}>
                      {fmtK(p.closePrice)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtVol(p.totalVolume)}</td>
                    <td className={cn("px-2 py-1 text-right tabular-nums", changeTone(p))}>
                      {p.hasTraded ? `${sign}${p.percentChange.toFixed(2)}%` : "—"}
                    </td>

                    {/* Ask side: Giá 1 → Giá 3 */}
                    <DepthCell price={ask[0]?.price} vol={ask[0]?.volume} p={p} />
                    <DepthCell price={ask[1]?.price} vol={ask[1]?.volume} p={p} />
                    <DepthCell price={ask[2]?.price} vol={ask[2]?.volume} p={p} />

                    <td className="border-l border-[var(--color-border-2)] px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtVol(p.totalVolume)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtBil(p.totalValue)}</td>
                    <td className={cn("px-2 py-1 text-right tabular-nums", priceTone(p.highestPrice, p))}>{fmtK(p.highestPrice)}</td>
                    <td className={cn("px-2 py-1 text-right tabular-nums", priceTone(p.lowestPrice, p))}>{fmtK(p.lowestPrice)}</td>

                    {/* Foreign */}
                    <td className="border-l border-[var(--color-border-2)] px-2 py-1 text-right tabular-nums text-up">{fmtVol(p.foreignBuy)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-down">{fmtVol(p.foreignSell)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtVol(p.foreignRoom)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
