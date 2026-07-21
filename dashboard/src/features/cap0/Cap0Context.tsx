import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

/**
 * Cấp 0 event bus.
 *
 * This is the seam that lets the EXISTING, untouched TradingPanel / StockHeader
 * notify Cấp 0 of user actions WITHOUT Cấp 0 knowing their internals (and
 * without them knowing Cấp 0's). The notifier side calls `onOrderFilled` /
 * `onStarToggled`; the Cấp 0 journey logic (a later task) supplies the actual
 * handlers via `registerHandlers`.
 *
 * Outside a `Cap0Provider` the hook is a safe no-op: the two notify functions
 * are `undefined` (so callers guard with `?.`) and `registerHandlers` does
 * nothing — this is how the same components keep working when Cấp 0 is off.
 */

/** A filled order the trading UI reports to Cấp 0. */
export interface Cap0OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
}

/** Handlers the Cấp 0 journey registers to react to trading-UI events. */
export interface Cap0EventHandlers {
  onOrderFilled?: (order: Cap0OrderEvent) => void
  onStarToggled?: (symbol: string, watched: boolean) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap0EventBus extends Cap0EventHandlers {
  registerHandlers: (handlers: Cap0EventHandlers) => void
}

const Cap0EventsContext = createContext<Cap0EventBus | null>(null)

export function Cap0Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap0EventHandlers>({})

  const registerHandlers = useCallback((handlers: Cap0EventHandlers) => {
    handlersRef.current = handlers
  }, [])

  const onOrderFilled = useCallback((order: Cap0OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const onStarToggled = useCallback((symbol: string, watched: boolean) => {
    handlersRef.current.onStarToggled?.(symbol, watched)
  }, [])

  const value = useMemo<Cap0EventBus>(
    () => ({ onOrderFilled, onStarToggled, registerHandlers }),
    [onOrderFilled, onStarToggled, registerHandlers],
  )

  return <Cap0EventsContext.Provider value={value}>{children}</Cap0EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap0EventBus = {
  registerHandlers: () => {},
}

/**
 * Access the Cấp 0 event bus. Always safe to call: outside a `Cap0Provider`
 * it returns the no-op bus (`onOrderFilled`/`onStarToggled` are `undefined`).
 */
export function useCap0Events(): Cap0EventBus {
  return useContext(Cap0EventsContext) ?? NOOP_BUS
}
