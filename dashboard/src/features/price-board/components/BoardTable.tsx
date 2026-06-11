import { BoardRow } from "./BoardRow"
import type { PriceBoardData } from "@/features/market-data"

/** Total column count (for the empty-state row): 4 + 6 + 4 + 6 + 4 + 3. */
const COL_COUNT = 27

const TH = "px-2 py-1 text-right"
const TH_BL = "border-l border-[var(--color-border-2)] px-2 py-1 text-right"

interface BoardTableProps {
  rows: PriceBoardData[]
  emptyHint: string
  onOpen: (symbol: string) => void
}

/**
 * The dense price-board grid: sticky header + sticky "Mã" column inside a
 * scrollable container so both axes stay usable on long lists. Sticky cells
 * carry an opaque bg so scrolled content never bleeds through.
 */
export function BoardTable({ rows, emptyHint, onOpen }: BoardTableProps) {
  return (
    <div className="custom-scrollbar max-h-[calc(100dvh-300px)] min-h-[280px] overflow-auto rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <table className="w-full min-w-[1280px] border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-[var(--color-bg-2)] text-[10px] uppercase text-[var(--color-text-3)]">
          <tr className="border-b border-[var(--color-border-2)]">
            <th rowSpan={2} className="sticky left-0 z-30 bg-[var(--color-bg-2)] px-2 py-2 text-left">Mã</th>
            <th rowSpan={2} className="px-2 py-2 text-right">Trần</th>
            <th rowSpan={2} className="px-2 py-2 text-right">Sàn</th>
            <th rowSpan={2} className="px-2 py-2 text-right">TC</th>
            <th colSpan={6} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center text-up">Bên mua</th>
            <th colSpan={4} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center">Khớp lệnh</th>
            <th colSpan={6} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center text-down">Bên bán</th>
            <th rowSpan={2} className="border-l border-[var(--color-border-2)] px-2 py-2 text-right">Tổng KL</th>
            <th rowSpan={2} className="px-2 py-2 text-right">GT (tỷ)</th>
            <th rowSpan={2} className="px-2 py-2 text-right">Cao</th>
            <th rowSpan={2} className="px-2 py-2 text-right">Thấp</th>
            <th colSpan={3} className="border-l border-[var(--color-border-2)] px-2 py-1 text-center">ĐTNN</th>
          </tr>
          <tr className="border-b border-[var(--color-border-2)]">
            <th className={TH_BL}>Giá 3</th>
            <th className={TH}>KL</th>
            <th className={TH}>Giá 2</th>
            <th className={TH}>KL</th>
            <th className={TH}>Giá 1</th>
            <th className={TH}>KL</th>
            <th className={TH_BL}>Giá</th>
            <th className={TH}>KL</th>
            <th className={TH}>+/-</th>
            <th className={TH}>%</th>
            <th className={TH_BL}>Giá 1</th>
            <th className={TH}>KL</th>
            <th className={TH}>Giá 2</th>
            <th className={TH}>KL</th>
            <th className={TH}>Giá 3</th>
            <th className={TH}>KL</th>
            <th className={TH_BL}>Mua</th>
            <th className={TH}>Bán</th>
            <th className={TH}>Room</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COL_COUNT} className="px-3 py-10 text-center text-[var(--color-text-3)]">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((p) => <BoardRow key={p.symbol} p={p} onOpen={onOpen} />)
          )}
        </tbody>
      </table>
    </div>
  )
}
