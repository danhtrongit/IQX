import type { DebriefData } from "./DebriefModal"

/**
 * Retroactive Kết sổ (nhiệm vụ ⑥) recovery — derives a `DebriefData` from
 * SERVER order history instead of the session-local refs in `Gbar`.
 *
 * ## Why this exists
 *
 * Nhiệm vụ ⑥ has exactly one completion path: reading the Kết sổ and pressing
 * "Đóng kết sổ ✓" (`DebriefModal` → `completeTask(6, "debrief")`). That modal
 * used to be reachable ONLY from `Gbar`'s live `onOrderFilled` sell branch,
 * which is driven by the Cấp 0 event bus — and that bus only exists inside
 * `Cap0Provider` (mounted by `Cap0TradingPage` alone). Two ways a user got
 * permanently stuck, unable to ever finish Cấp 0:
 *
 *  1. They sold from `/bieu-do` or `/co-phieu`. The SAME `TradingPanel`
 *     renders there, but `useCap0Events()` is the no-op bus, so
 *     `cap0Events.onOrderFilled?.(...)` silently did nothing.
 *  2. They sold on `/dau-truong` but reloaded or navigated away before
 *     pressing "Đóng kết sổ ✓". `Gbar`'s `lastBuyBySymbolRef` /
 *     `debriefCountRef` are session-local refs — a reload loses them.
 *
 * Either way `task_6_done_at` stays NULL forever, and since
 * `Cap0Service.graduate` requires all 6 tasks + both gates, the graduation
 * modal (`isGraduationReady`) never opens. This function lets `Gbar` re-open
 * the Kết sổ for a round trip that ALREADY closed, so the user can still read
 * it and complete ⑥ themselves. Nhiệm vụ ⑥ is still earned by reading the Kết
 * sổ — nothing is auto-completed behind the user's back.
 *
 * ## Single-lot approximation (carried over from the backend, verbatim caveat)
 *
 * The entry price comes from "the most recent FILLED buy for the same
 * account+symbol at/before the sell" — the exact rule
 * `Cap1Service._find_matching_buy` (`backend/app/services/cap1/service.py`)
 * uses, whose own docstring records the caveat this inherits: *"Cấp 1's
 * account model is average-cost (not lot-tracked, see `VirtualPosition`), so
 * this is a pragmatic single-lot approximation — good enough for the common
 * '1 lệnh = 1 round trip' flow this level teaches."* A user who scaled into a
 * position across several buys will see the LAST buy's price as "giá vào",
 * not their average cost.
 *
 * ## What it deliberately does NOT do
 *
 * `sl`/`tp` are left ABSENT (not `0`, not guessed). The trading backend never
 * persists the Kế hoạch cắt lỗ/chốt lời — the live path only has them because
 * `TradingPanel` carries them on the bus at buy time (see
 * `Cap0OrderEvent.sl`). For a round trip reconstructed from history they are
 * genuinely unknown, and `DebriefModal` renders that honestly ("không ghi
 * nhận") rather than implying the user missed a stop they never set.
 *
 * Returns `null` — no modal at all — whenever there is nothing truthful to
 * show: no filled sell, or a filled sell with no matching filled buy (which
 * would otherwise fabricate a 0% P&L by using the exit price as the entry).
 */

/** The `VTOrder` fields this reconstruction reads (structural subset). */
export interface RetroDebriefOrder {
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
  /** Filled price (VND). */
  price: number
  status: string
  /** ISO timestamp. */
  createdAt: string
}

function isFilled(o: RetroDebriefOrder): boolean {
  return o.status.toUpperCase() === "FILLED"
}

function sideOf(o: RetroDebriefOrder): string {
  return o.side?.toUpperCase?.() ?? ""
}

/** `createdAt` as epoch ms; unparseable/missing sorts oldest. */
function timeOf(o: RetroDebriefOrder): number {
  const t = Date.parse(o.createdAt)
  return Number.isNaN(t) ? 0 : t
}

/**
 * Most recent closed round trip in `orders`, or `null` when there isn't one.
 * See the module docstring for the matching rule and its caveats.
 */
export function findRetroDebrief(
  orders: readonly RetroDebriefOrder[] | null | undefined,
): DebriefData | null {
  if (!orders || orders.length === 0) return null

  const filled = orders.filter(isFilled)
  // Newest-first. The backend already returns `created_at DESC`, but don't
  // rely on a caller's ordering for a correctness-critical "most recent" pick.
  const sells = filled
    .filter((o) => sideOf(o) === "SELL")
    .sort((a, b) => timeOf(b) - timeOf(a))
  if (sells.length === 0) return null

  const sell = sells[0]
  const symbol = sell.symbol.toUpperCase()
  const sellTime = timeOf(sell)

  const buy = filled
    .filter(
      (o) =>
        sideOf(o) === "BUY" &&
        o.symbol.toUpperCase() === symbol &&
        timeOf(o) <= sellTime,
    )
    .sort((a, b) => timeOf(b) - timeOf(a))[0]

  // No entry price we can honestly attribute to this exit → show nothing
  // rather than a fabricated break-even Kết sổ.
  if (!buy) return null

  return {
    // "#N" = which round trip this is, counted from server history — so it
    // stays stable across reloads (unlike the old session-local counter).
    n: sells.length,
    symbol,
    quantity: sell.quantity,
    entryPrice: buy.price,
    exitPrice: sell.price,
    // sl/tp intentionally omitted — see the module docstring.
  }
}
