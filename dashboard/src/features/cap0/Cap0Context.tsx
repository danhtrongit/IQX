import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useCap0Progress } from "./hooks"

/**
 * Cấp 0 event bus.
 *
 * This is the seam that lets the EXISTING, untouched TradingPanel / StockHeader
 * notify Cấp 0 of user actions WITHOUT Cấp 0 knowing their internals (and
 * without them knowing Cấp 0's). The notifier side calls `onReasonPicked` /
 * `onOrderFilled` / `onStarToggled` / `onGbarWarn`; the Cấp 0 journey logic
 * (`Gbar.tsx`) supplies the actual handlers via `registerHandlers`.
 *
 * Outside a `Cap0Provider` the hook is a safe no-op: the notify functions are
 * `undefined` (so callers guard with `?.`), `isCap0Active`/
 * `requireReasonBeforeOrder` are `false`, and `registerHandlers` does
 * nothing — this is how the same components keep working when Cấp 0 is off.
 */

/** A filled order the trading UI reports to Cấp 0. */
export interface Cap0OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  /**
   * Kế hoạch cắt lỗ/chốt lời shown (nhiệm vụ ①, preset) or typed (nhiệm vụ
   * ⑤, manual) at BUY time — `undefined` on sell events and outside Cấp 0.
   * Cấp 0 needs these later (§5 Kết sổ) but the trading backend never
   * persists them (spec: "chỉ để hiển thị"), so the FE carries them on the
   * bus at buy-time for whoever handles the later sell (`Gbar`).
   */
  sl?: number
  tp?: number
}

/** Handlers the Cấp 0 journey registers to react to trading-UI events. */
export interface Cap0EventHandlers {
  /** A Kế hoạch reason chip was picked (spec §4 THÊM MỚI — new UI, no web-existing equivalent). */
  onReasonPicked?: (reason: string) => void
  onOrderFilled?: (order: Cap0OrderEvent) => void
  onStarToggled?: (symbol: string, watched: boolean) => void
  /** A guarded action was attempted without its precondition (spec §6 "Làm SAI") — flash the gbar red + `gshake` for ~1.6s. */
  onGbarWarn?: () => void
  /**
   * Nhiệm vụ ⑤'s `keydown` into the (now-manual) ô cắt lỗ (spec §4 Chặng 3
   * "cổng chất lượng 1"). Notified INSTANTLY off the DOM event itself — not
   * derived from the `task5_sl_typed` PATCH's round trip — so the gbar's
   * "Bước 1/2 → 2/2" text (spec §6) advances the moment the user types,
   * exactly mirroring how nhiệm vụ ①'s `onReasonPicked`/`onStarToggled`
   * update the bar before any server confirmation.
   */
  onSlTyped?: () => void
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

  const registerHandlers = useCallback((handlers: Cap0EventHandlers) => {
    handlersRef.current = handlers
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

  const onSlTyped = useCallback(() => {
    handlersRef.current.onSlTyped?.()
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
      onSlTyped,
      registerHandlers,
      isCap0Active: true,
      requireReasonBeforeOrder,
    }),
    [
      onReasonPicked,
      onOrderFilled,
      onStarToggled,
      onGbarWarn,
      onSlTyped,
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
