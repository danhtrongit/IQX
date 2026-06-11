import { memo } from "react"
import { cn } from "@/shared/lib/cn"
import { DepthCells, FlashCell } from "./FlashCell"
import { changeTone, fmtBil, fmtChange, fmtK, fmtPct, fmtVol, priceTone } from "./format"
import type { PriceBoardData } from "@/features/market-data"

interface BoardRowProps {
  p: PriceBoardData
  onOpen: (symbol: string) => void
}

const BORDER_L = "border-l border-[var(--color-border-2)]"

/**
 * One symbol row of the price board. Memoized with a field-wise comparator so
 * the 500ms overlay flush only re-renders rows whose displayed values changed.
 */
export const BoardRow = memo(function BoardRow({ p, onOpen }: BoardRowProps) {
  const bid = p.bid ?? []
  const ask = p.ask ?? []
  return (
    <tr
      onClick={() => onOpen(p.symbol)}
      className="group cursor-pointer border-b border-[var(--color-border-1)] hover:bg-[var(--color-fill-1)]"
    >
      {/* Mã — sticky first column. Hover dùng 2 lớp nền (tint hover trên bg-2
          đục) vì --color-fill-1 ở dark theme gần như trong suốt — nếu chỉ đổi
          sang fill-1 thì cell phía dưới sẽ xuyên qua khi scroll ngang. */}
      <td className="sticky left-0 z-10 bg-[var(--color-bg-2)] px-2 py-1 font-bold text-[var(--color-text-1)] group-hover:[background:linear-gradient(var(--color-fill-1),var(--color-fill-1)),var(--color-bg-2)]">
        {p.symbol}
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-ceiling">{fmtK(p.ceilingPrice)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-floor">{fmtK(p.floorPrice)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-reference">{fmtK(p.referencePrice)}</td>

      {/* Bên mua: Giá 3 → Giá 1 (giá tốt nhất sát cột khớp) */}
      <DepthCells level={bid[2]} p={p} priceClassName={BORDER_L} />
      <DepthCells level={bid[1]} p={p} />
      <DepthCells level={bid[0]} p={p} />

      {/* Khớp lệnh: Giá | KL | +/- | % */}
      <FlashCell
        value={fmtK(p.closePrice)}
        numeric={p.closePrice}
        className={cn(BORDER_L, "font-bold", priceTone(p.closePrice, p))}
      />
      <FlashCell
        value={p.lastMatchVolume ? fmtVol(p.lastMatchVolume) : "—"}
        numeric={p.lastMatchVolume ?? null}
        className={cn(priceTone(p.closePrice, p), "opacity-80")}
      />
      <td className={cn("px-2 py-1 text-right tabular-nums", changeTone(p))}>
        {p.hasTraded ? fmtChange(p.priceChange) : "—"}
      </td>
      <FlashCell
        value={p.hasTraded ? fmtPct(p.percentChange) : "—"}
        numeric={p.hasTraded ? p.percentChange : null}
        className={changeTone(p)}
      />

      {/* Bên bán: Giá 1 → Giá 3 */}
      <DepthCells level={ask[0]} p={p} priceClassName={BORDER_L} />
      <DepthCells level={ask[1]} p={p} />
      <DepthCells level={ask[2]} p={p} />

      <FlashCell
        value={fmtVol(p.totalVolume)}
        numeric={p.totalVolume}
        className={cn(BORDER_L, "text-[var(--color-text-2)]")}
      />
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtBil(p.totalValue)}</td>
      <FlashCell
        value={fmtK(p.highestPrice)}
        numeric={p.highestPrice}
        className={priceTone(p.highestPrice, p)}
      />
      <FlashCell
        value={fmtK(p.lowestPrice)}
        numeric={p.lowestPrice}
        className={priceTone(p.lowestPrice, p)}
      />

      {/* ĐTNN */}
      <td className={cn(BORDER_L, "px-2 py-1 text-right tabular-nums text-up")}>{fmtVol(p.foreignBuy)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-down">{fmtVol(p.foreignSell)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-text-2)]">{fmtVol(p.foreignRoom)}</td>
    </tr>
  )
}, propsAreEqual)

function sameLevels(
  a: { price: number; volume: number }[],
  b: { price: number; volume: number }[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].price !== b[i].price || a[i].volume !== b[i].volume) return false
  }
  return true
}

/** Compare only the fields actually rendered, so unchanged rows skip re-render. */
function propsAreEqual(prev: BoardRowProps, next: BoardRowProps): boolean {
  if (prev.onOpen !== next.onOpen) return false
  const a = prev.p
  const b = next.p
  if (a === b) return true
  return (
    a.symbol === b.symbol &&
    a.ceilingPrice === b.ceilingPrice &&
    a.floorPrice === b.floorPrice &&
    a.referencePrice === b.referencePrice &&
    a.closePrice === b.closePrice &&
    a.lastMatchVolume === b.lastMatchVolume &&
    a.priceChange === b.priceChange &&
    a.percentChange === b.percentChange &&
    a.hasTraded === b.hasTraded &&
    a.totalVolume === b.totalVolume &&
    a.totalValue === b.totalValue &&
    a.highestPrice === b.highestPrice &&
    a.lowestPrice === b.lowestPrice &&
    a.foreignBuy === b.foreignBuy &&
    a.foreignSell === b.foreignSell &&
    a.foreignRoom === b.foreignRoom &&
    sameLevels(a.bid ?? [], b.bid ?? []) &&
    sameLevels(a.ask ?? [], b.ask ?? [])
  )
}
