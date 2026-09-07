import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useCap0Progress } from "./hooks"
import type { WatchlistTab } from "@/features/watchlist/tabStorage"

/**
 * Cấp 0 event bus.
 *
 * This is the seam that lets the EXISTING, untouched TradingPanel /
 * WatchlistPanel notify Cấp 0 of user actions WITHOUT Cấp 0 knowing their
 * internals (and without them knowing Cấp 0's). The notifier side calls
 * `onReasonPicked` / `onOrderFilled` / `onStarToggled` / `onPortfolioTabOpen` /
 * `onGbarWarn`; the Cấp 0 journey logic (`Gbar.tsx`) supplies the actual
 * handlers via `registerHandlers`.
 *
 * Outside a `Cap0Provider` the hook is a safe no-op: the notify functions are
 * `undefined` (so callers guard with `?.`), `isCap0Active`/
 * `requireReasonBeforeOrder` are `false`, and `registerHandlers` does
 * nothing — this is how the same components keep working when Cấp 0 is off.
 */

/**
 * A filled order the trading UI reports to Cấp 0.
 *
 * v2.2 also carried `sl`/`tp` — the Kế hoạch cắt lỗ/chốt lời shown or typed at
 * BUY time, ferried over this bus because the trading backend never persists
 * them. Spec v3.0 removes cắt lỗ/chốt lời from Cấp 0 entirely (preamble, §0,
 * §8, §13), so there is nothing left to carry.
 */
export interface Cap0OrderEvent {
  /**
   * `virtual_orders.id` of the order that just filled.
   *
   * ★ Load-bearing for the Kết sổ, not bookkeeping. `Gbar` keeps each symbol's
   * most recent BUY id and hands it to `DebriefData.buyOrderId`, which is the
   * key `GET /cap0/kehoach?order_id=` reads the `Lý do mua` / `Thời gian giữ`
   * rows under. Without it the Kết sổ can only ask "the latest buy of this mã",
   * which after a re-entry is a different, still-open order. (Cấp 1's
   * `KetsoDataCap1` carries an order id for the same reason.)
   */
  orderId: string
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
}

/**
 * Tab đang hiện trong panel "Danh mục". Lấy từ `@/features/watchlist/tabStorage`
 * (module localStorage thuần, không có component) thay vì barrel
 * `@/features/watchlist`, để bus không phụ thuộc ngược vào component nó phục vụ.
 */
export type Cap0PortfolioTab = WatchlistTab

/** Handlers the Cấp 0 journey registers to react to trading-UI events. */
export interface Cap0EventHandlers {
  /** A Kế hoạch reason chip was picked (spec §4 THÊM MỚI — new UI, no web-existing equivalent). */
  onReasonPicked?: (reason: string) => void
  onOrderFilled?: (order: Cap0OrderEvent) => void
  /**
   * The ★ watchlist button was toggled. Still notified by `TradingPanel`, but
   * Cấp 0 no longer registers a handler for it: nhiệm vụ ① used to demand the
   * ★ as its third step; nhiệm vụ ③ «Xem tab Theo dõi» is about OPENING that
   * tab, not about starring anything.
   */
  onStarToggled?: (symbol: string, watched: boolean) => void
  /**
   * Panel "Danh mục" switched to (or mounted on) a tab — the completion event
   * for nhiệm vụ ② «Xem tab Nắm giữ» (`holdings`) and ③ «Xem tab Theo dõi»
   * (`watchlist`). `WatchlistPanel` fires it for whichever tab is showing,
   * including on mount (the tab is remembered in localStorage, so a returning
   * user can land on Nắm giữ without ever clicking it); `Gbar` owns all the
   * "should this actually PATCH?" rules.
   */
  onPortfolioTabOpen?: (tab: Cap0PortfolioTab) => void
  /** A guarded action was attempted without its precondition (spec §6 "Làm SAI") — flash the gbar red + `gshake` for ~1.6s. */
  onGbarWarn?: () => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap0EventBus extends Cap0EventHandlers {
  registerHandlers: (handlers: Cap0EventHandlers) => void
  /** True only inside a `Cap0Provider` (i.e. the Cấp 0 «Sân tập» practice-trading shell). Lets `GatedOrderEntry` ungate the order form without a premium plan. */
  isCap0Active: boolean
  /**
   * True while Cấp 0 nhiệm vụ ① is still open — `OrderEntry` must block
   * "ĐẶT LỆNH MUA" until a Kế hoạch reason chip is picked (spec §4 "chặn nếu
   * chưa chọn chip lý do → gbar warn") and call `onGbarWarn` instead. `false`
   * once task ① is done, or entirely outside Cấp 0.
   */
  requireReasonBeforeOrder: boolean
}

const Cap0EventsContext = createContext<Cap0EventBus | null>(null)

export function Cap0Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap0EventHandlers>({})
  const { data: progress } = useCap0Progress()

  // MERGE (not replace). Today `Gbar` is the only registrant, but its own
  // effect re-fires whenever `task1Done`/`task2Done`/`task3Done` change, and a
  // plain `handlersRef.current = handlers` would silently make any future
  // second registrant clobber it (that is exactly what happened while
  // `Cap0TradingPage` also registered a tour-launch handler). Merging keeps
  // every previously-registered key intact unless the SAME caller re-registers
  // it — which just refreshes that key's closure, as `Gbar` relies on.
  const registerHandlers = useCallback((handlers: Cap0EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onReasonPicked = useCallback((reason: string) => {
    handlersRef.current.onReasonPicked?.(reason)
  }, [])

  const onOrderFilled = useCallback((order: Cap0OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const onStarToggled = useCallback((symbol: string, watched: boolean) => {
    handlersRef.current.onStarToggled?.(symbol, watched)
  }, [])

  const onGbarWarn = useCallback(() => {
    handlersRef.current.onGbarWarn?.()
  }, [])

  const onPortfolioTabOpen = useCallback((tab: Cap0PortfolioTab) => {
    handlersRef.current.onPortfolioTabOpen?.(tab)
  }, [])

  // Fail-closed while progress is still loading (`progress` undefined →
  // `task_1_done_at` undefined → the gate stays required), matching the
  // product's "chặn nếu chưa chọn" protective default.
  const requireReasonBeforeOrder = !progress?.task_1_done_at

  const value = useMemo<Cap0EventBus>(
    () => ({
      onReasonPicked,
      onOrderFilled,
      onStarToggled,
      onGbarWarn,
      onPortfolioTabOpen,
      registerHandlers,
      isCap0Active: true,
      requireReasonBeforeOrder,
    }),
    [
      onReasonPicked,
      onOrderFilled,
      onStarToggled,
      onGbarWarn,
      onPortfolioTabOpen,
      registerHandlers,
      requireReasonBeforeOrder,
    ],
  )

  return <Cap0EventsContext.Provider value={value}>{children}</Cap0EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap0EventBus = {
  registerHandlers: () => {},
  isCap0Active: false,
  requireReasonBeforeOrder: false,
}

/**
 * Access the Cấp 0 event bus. Always safe to call: outside a `Cap0Provider`
 * it returns the no-op bus (notify fns `undefined`, `isCap0Active`/
 * `requireReasonBeforeOrder` `false`).
 */
export function useCap0Events(): Cap0EventBus {
  return useContext(Cap0EventsContext) ?? NOOP_BUS
}
