import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"

/**
 * Cấp 3 event bus — mirrors `cap2/Cap2Context.tsx`'s (already-proven)
 * merge-semantics design.
 *
 * This is the seam that lets the EXISTING, untouched `TradingPanel` notify
 * Cấp 3 journey/progress logic of user actions WITHOUT Cấp 3 knowing its
 * internals (and without it knowing Cấp 0/1/2's). The notifier side calls
 * `onKhauViPicked` / `onOrderFilled`; a later task (FE2/FE3 — Kết sổ, Phân
 * tích danh mục, Hành trình) supplies the actual handlers via
 * `registerHandlers`.
 *
 * Outside a `Cap3Provider` the hook is a safe no-op: the notify functions
 * are `undefined` (callers guard with `?.`), `isCap3Active` is `false`, and
 * `registerHandlers` does nothing.
 *
 * NOTE (FE1 scope): this delivery only defines the bus + `isCap3Active` gate
 * that `TradingPanel` reads. The actual `Cap3Provider` wiring into a page
 * (deciding WHEN a user is in Cấp 3) is FE3's routing job — FE1's tests
 * construct `Cap3Provider` directly.
 */

/** A filled order the trading UI reports to Cấp 3. */
export interface Cap3OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /** Quản lý vốn fields carried at BUY time — undefined on sell events. */
  khauVi?: KhauViLoai
  mucTuTin?: MucTuTin
  cachKhoiLuong?: CachKhoiLuong
  khoiLuong?: number
  pctVon?: number
}

/** Handlers the Cấp 3 journey registers to react to trading-UI events. */
export interface Cap3EventHandlers {
  /** Khẩu vị rủi ro was (re-)picked — first time (KhauViModal, mandatory) or
   * later (đổi affordance in `QuanLyVonBlock`). */
  onKhauViPicked?: (khauVi: KhauViLoai) => void
  onOrderFilled?: (order: Cap3OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap3EventBus extends Cap3EventHandlers {
  registerHandlers: (handlers: Cap3EventHandlers) => void
  /** True only inside a `Cap3Provider`. Gates `TradingPanel`'s
   * `QuanLyVonBlock` + hard gate. */
  isCap3Active: boolean
}

const Cap3EventsContext = createContext<Cap3EventBus | null>(null)

export function Cap3Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap3EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0/1/2 fix: multiple independent
  // registrants (journey bar, Phân tích danh mục, later tasks) may each call
  // `registerHandlers` with only the keys they own. A plain
  // `handlersRef.current = handlers` would let whichever one's effect
  // runs/re-runs LAST wipe out the others' handlers entirely.
  const registerHandlers = useCallback((handlers: Cap3EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onKhauViPicked = useCallback((khauVi: KhauViLoai) => {
    handlersRef.current.onKhauViPicked?.(khauVi)
  }, [])

  const onOrderFilled = useCallback((order: Cap3OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap3EventBus>(
    () => ({
      onKhauViPicked,
      onOrderFilled,
      registerHandlers,
      isCap3Active: true,
    }),
    [onKhauViPicked, onOrderFilled, registerHandlers],
  )

  return <Cap3EventsContext.Provider value={value}>{children}</Cap3EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap3EventBus = {
  registerHandlers: () => {},
  isCap3Active: false,
}

/**
 * Access the Cấp 3 event bus. Always safe to call: outside a `Cap3Provider`
 * it returns the no-op bus (notify fns `undefined`, `isCap3Active` `false`).
 */
export function useCap3Events(): Cap3EventBus {
  return useContext(Cap3EventsContext) ?? NOOP_BUS
}
