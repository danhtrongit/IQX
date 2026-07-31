import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { LyDoDungNgoai, Verdict } from "./types"

/**
 * Cấp 5 event bus — mirrors `cap4/Cap4Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * The seam that lets the EXISTING `TradingPanel` notify Cấp 5 journey/progress
 * logic WITHOUT either side knowing the other's internals (and without knowing
 * Cấp 0-4's). Notifiers call `onDungNgoai` / `onVerdictSettled` /
 * `onOrderFilled`; FE2 (Kết sổ, Phân tích danh mục, Hành trình) registers the
 * actual handlers.
 *
 * Outside a `Cap5Provider` the hook is a safe no-op: notify fns are
 * `undefined` (callers guard with `?.`), `isCap5Active` is `false`, and
 * `registerHandlers` does nothing.
 */

/** A filled order the trading UI reports to Cấp 5. */
export interface Cap5OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
}

/** Handlers the Cấp 5 journey registers to react to trading-UI events. */
export interface Cap5EventHandlers {
  /** User logged a "tôi đứng ngoài mã này" decision (spec §5). */
  onDungNgoai?: (symbol: string, reason: LyDoDungNgoai) => void
  /**
   * The 4-ô classification was settled in Kết sổ (spec §4). `daSua` is true when
   * the user overrode the hệ verdict — a NEUTRAL fact for analytics, never a
   * penalty.
   */
  onVerdictSettled?: (verdict: Verdict, daSua: boolean) => void
  onOrderFilled?: (order: Cap5OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap5EventBus extends Cap5EventHandlers {
  registerHandlers: (handlers: Cap5EventHandlers) => void
  /**
   * True only inside a `Cap5Provider`. Gates `TradingPanel`'s "Đứng ngoài"
   * affordance. NOTE: Cấp 5 adds NOTHING to the buy panel's existing blocks or
   * cổng cứng chain (spec §0) — it is purely additive.
   */
  isCap5Active: boolean
}

const Cap5EventsContext = createContext<Cap5EventBus | null>(null)

export function Cap5Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap5EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0-4 fix: multiple independent
  // registrants may each register only the keys they own, and a plain
  // assignment would let whichever effect runs LAST wipe the others.
  const registerHandlers = useCallback((handlers: Cap5EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onDungNgoai = useCallback((symbol: string, reason: LyDoDungNgoai) => {
    handlersRef.current.onDungNgoai?.(symbol, reason)
  }, [])

  const onVerdictSettled = useCallback((verdict: Verdict, daSua: boolean) => {
    handlersRef.current.onVerdictSettled?.(verdict, daSua)
  }, [])

  const onOrderFilled = useCallback((order: Cap5OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap5EventBus>(
    () => ({
      onDungNgoai,
      onVerdictSettled,
      onOrderFilled,
      registerHandlers,
      isCap5Active: true,
    }),
    [onDungNgoai, onVerdictSettled, onOrderFilled, registerHandlers],
  )

  return <Cap5EventsContext.Provider value={value}>{children}</Cap5EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap5EventBus = {
  registerHandlers: () => {},
  isCap5Active: false,
}

/**
 * Access the Cấp 5 event bus. Always safe to call: outside a `Cap5Provider` it
 * returns the no-op bus (notify fns `undefined`, `isCap5Active` `false`).
 */
export function useCap5Events(): Cap5EventBus {
  return useContext(Cap5EventsContext) ?? NOOP_BUS
}
