import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { LyDo, TrangThaiLucDat } from "./types"

/**
 * Cấp 1 event bus — mirrors `cap0/Cap0Context.tsx`'s (already-fixed)
 * merge-semantics design.
 *
 * This is the seam that lets the EXISTING, untouched `TradingPanel` notify
 * Cấp 1 journey/progress logic of user actions WITHOUT Cấp 1 knowing its
 * internals (and without it knowing Cấp 1's). The notifier side calls
 * `onLyDoPicked` / `onOrderFilled` / `onDocChiTietClicked`; a later task
 * (FE2/FE3 — Phân tích danh mục, Hành trình) supplies the actual handlers via
 * `registerHandlers`.
 *
 * Outside a `Cap1Provider` the hook is a safe no-op: the notify functions are
 * `undefined` (callers guard with `?.`), `isCap1Active` is `false`, and
 * `registerHandlers` does nothing.
 *
 * NOTE (FE1 scope): this delivery only defines the bus + `isCap1Active` gate
 * that `TradingPanel` reads. The actual `Cap1Provider` wiring into a page
 * (deciding WHEN a user is in Cấp 1) is FE3's progression-routing job — FE1's
 * tests construct `Cap1Provider` directly.
 */

/** A filled order the trading UI reports to Cấp 1. */
export interface Cap1OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /** Kế hoạch fields carried at BUY time — undefined on sell events. */
  lyDo?: LyDo
  trangThaiLucDat?: TrangThaiLucDat
  vungMua?: number
}

/** Handlers the Cấp 1 journey registers to react to trading-UI events. */
export interface Cap1EventHandlers {
  /** A Form Kế hoạch lý do was picked (spec §4/§5) — fetches that layer + shows AI Thanh tra. */
  onLyDoPicked?: (lyDo: LyDo) => void
  onOrderFilled?: (order: Cap1OrderEvent) => void
  /** "Đọc chi tiết lớp này →" was clicked (spec §5 — voluntary, not a nhiệm vụ). */
  onDocChiTietClicked?: (lyDo: LyDo) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap1EventBus extends Cap1EventHandlers {
  registerHandlers: (handlers: Cap1EventHandlers) => void
  /** True only inside a `Cap1Provider`. Gates `TradingPanel`'s Form Kế hoạch + AI Thanh tra + hard gate. */
  isCap1Active: boolean
}

const Cap1EventsContext = createContext<Cap1EventBus | null>(null)

export function Cap1Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap1EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0 fix: multiple independent
  // registrants (journey bar, Phân tích danh mục view-log, later tasks) may
  // each call `registerHandlers` with only the keys they own. A plain
  // `handlersRef.current = handlers` would let whichever one's effect
  // runs/re-runs LAST wipe out the others' handlers entirely.
  const registerHandlers = useCallback((handlers: Cap1EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onLyDoPicked = useCallback((lyDo: LyDo) => {
    handlersRef.current.onLyDoPicked?.(lyDo)
  }, [])

  const onOrderFilled = useCallback((order: Cap1OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const onDocChiTietClicked = useCallback((lyDo: LyDo) => {
    handlersRef.current.onDocChiTietClicked?.(lyDo)
  }, [])

  const value = useMemo<Cap1EventBus>(
    () => ({
      onLyDoPicked,
      onOrderFilled,
      onDocChiTietClicked,
      registerHandlers,
      isCap1Active: true,
    }),
    [onLyDoPicked, onOrderFilled, onDocChiTietClicked, registerHandlers],
  )

  return <Cap1EventsContext.Provider value={value}>{children}</Cap1EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap1EventBus = {
  registerHandlers: () => {},
  isCap1Active: false,
}

/**
 * Access the Cấp 1 event bus. Always safe to call: outside a `Cap1Provider`
 * it returns the no-op bus (notify fns `undefined`, `isCap1Active` `false`).
 */
export function useCap1Events(): Cap1EventBus {
  return useContext(Cap1EventsContext) ?? NOOP_BUS
}
