import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { PhuongPhapSlTp } from "./types"

/**
 * Cấp 2 event bus — mirrors `cap1/Cap1Context.tsx`'s (already-fixed)
 * merge-semantics design.
 *
 * This is the seam that lets the EXISTING, untouched `TradingPanel` notify
 * Cấp 2 journey/progress logic of user actions WITHOUT Cấp 2 knowing its
 * internals (and without it knowing Cấp 2's). The notifier side calls
 * `onSlTpPicked` / `onOrderFilled`; a later task (FE2/FE3/FE4 — chuỗi, điểm
 * kỷ luật, Kết sổ, Hành trình) supplies the actual handlers via
 * `registerHandlers`.
 *
 * Outside a `Cap2Provider` the hook is a safe no-op: the notify functions are
 * `undefined` (callers guard with `?.`), `isCap2Active` is `false`, and
 * `registerHandlers` does nothing.
 *
 * NOTE (FE1 scope): this delivery only defines the bus + `isCap2Active` gate
 * that `TradingPanel` reads. The actual `Cap2Provider` wiring into a page
 * (deciding WHEN a user is in Cấp 2) is FE4's routing job — FE1's tests
 * construct `Cap2Provider` directly.
 */

/** A filled order the trading UI reports to Cấp 2. */
export interface Cap2OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /** SL/TP commitment fields carried at BUY time — undefined on sell events. */
  phuongPhapSlTp?: PhuongPhapSlTp
  catLo?: number
  chotLoi?: number
}

/** Handlers the Cấp 2 journey registers to react to trading-UI events. */
export interface Cap2EventHandlers {
  /** A cách cắt lỗ/chốt lời was picked in `SlTpBlock` (spec §5.4). */
  onSlTpPicked?: (method: PhuongPhapSlTp, catLo: number, chotLoi: number) => void
  onOrderFilled?: (order: Cap2OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap2EventBus extends Cap2EventHandlers {
  registerHandlers: (handlers: Cap2EventHandlers) => void
  /** True only inside a `Cap2Provider`. Gates `TradingPanel`'s `SlTpBlock` +
   * hard gate + always-visible sổ lệnh bid/ask. */
  isCap2Active: boolean
}

const Cap2EventsContext = createContext<Cap2EventBus | null>(null)

export function Cap2Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap2EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0/Cấp 1 fix: multiple independent
  // registrants (journey bar, Phân tích danh mục, later tasks) may each call
  // `registerHandlers` with only the keys they own. A plain
  // `handlersRef.current = handlers` would let whichever one's effect
  // runs/re-runs LAST wipe out the others' handlers entirely.
  const registerHandlers = useCallback((handlers: Cap2EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onSlTpPicked = useCallback((method: PhuongPhapSlTp, catLo: number, chotLoi: number) => {
    handlersRef.current.onSlTpPicked?.(method, catLo, chotLoi)
  }, [])

  const onOrderFilled = useCallback((order: Cap2OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap2EventBus>(
    () => ({
      onSlTpPicked,
      onOrderFilled,
      registerHandlers,
      isCap2Active: true,
    }),
    [onSlTpPicked, onOrderFilled, registerHandlers],
  )

  return <Cap2EventsContext.Provider value={value}>{children}</Cap2EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap2EventBus = {
  registerHandlers: () => {},
  isCap2Active: false,
}

/**
 * Access the Cấp 2 event bus. Always safe to call: outside a `Cap2Provider`
 * it returns the no-op bus (notify fns `undefined`, `isCap2Active` `false`).
 */
export function useCap2Events(): Cap2EventBus {
  return useContext(Cap2EventsContext) ?? NOOP_BUS
}
