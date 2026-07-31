import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { KieuCoPhieu, Lop, Lop5Partial } from "./types"

/**
 * Cấp 6 event bus — mirrors `cap5/Cap5Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * The seam that lets the EXISTING `TradingPanel` notify Cấp 6 journey/progress
 * logic WITHOUT either side knowing the other's internals (and without knowing
 * Cấp 0-5's). Notifiers call `onConflictShown` / `onLopQuyetDinhPicked` /
 * `onOrderFilled`; FE2 (Kết sổ, Phân tích danh mục, Hành trình) registers the
 * actual handlers.
 *
 * Outside a `Cap6Provider` the hook is a safe no-op: notify fns are `undefined`
 * (callers guard with `?.`), `isCap6Active` is `false`, and `registerHandlers`
 * does nothing.
 *
 * NOTE (FE1 scope): this delivery only defines the bus + the `isCap6Active` gate
 * `TradingPanel` reads. Wiring an actual `Cap6Provider` into a page (deciding
 * WHEN a user is in Cấp 6) is FE2's routing job — FE1's tests construct
 * `Cap6Provider` directly / mock `isCap6Active`.
 */

/** A filled order the trading UI reports to Cấp 6. */
export interface Cap6OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /**
   * The Đối chiếu block carried at BUY time — present ONLY when the 5 lớp
   * conflicted and the user resolved it (undefined otherwise, and on sells).
   */
  kieuCoPhieu?: KieuCoPhieu | null
  lopQuyetDinh?: Lop
  lyDoDoiChieu?: string
  /** The user's own 5-lớp ratings the conflict was read from. */
  lopMauThuan?: Lop5Partial
}

/** Handlers the Cấp 6 journey registers to react to trading-UI events. */
export interface Cap6EventHandlers {
  /**
   * The bước Đối chiếu just appeared for a symbol (its lớp conflict) — analytics
   * `cap6_conflict_shown(mã, kiểu)`. `kieu` is `null` when the server could not
   * classify the symbol ("chưa phân loại").
   */
  onConflictShown?: (symbol: string, kieu: KieuCoPhieu | null) => void
  /**
   * The user picked which lớp to trust — analytics `cap6_lop_quyet_dinh(lop,
   * khop)`. ★ `khopGoiY === false` is a NEUTRAL FACT (spec §5/§10), never "sai";
   * `null` means there was no suggestion to match (kiểu chưa phân loại or the
   * suggestion could not be fetched).
   */
  onLopQuyetDinhPicked?: (lop: Lop, khopGoiY: boolean | null) => void
  onOrderFilled?: (order: Cap6OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap6EventBus extends Cap6EventHandlers {
  registerHandlers: (handlers: Cap6EventHandlers) => void
  /**
   * True only inside a `Cap6Provider`. Gates `TradingPanel`'s `DoiChieuBlock`
   * and — only when the ratings actually conflict — the extra cổng cứng. Cấp 6
   * changes NOTHING about Cấp 0-5's blocks, gates or Cấp 3's volume auto-fill
   * (spec §0).
   */
  isCap6Active: boolean
}

const Cap6EventsContext = createContext<Cap6EventBus | null>(null)

export function Cap6Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap6EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0-5 fix: multiple independent
  // registrants may each register only the keys they own, and a plain
  // assignment would let whichever effect runs LAST wipe the others.
  const registerHandlers = useCallback((handlers: Cap6EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onConflictShown = useCallback((symbol: string, kieu: KieuCoPhieu | null) => {
    handlersRef.current.onConflictShown?.(symbol, kieu)
  }, [])

  const onLopQuyetDinhPicked = useCallback((lop: Lop, khopGoiY: boolean | null) => {
    handlersRef.current.onLopQuyetDinhPicked?.(lop, khopGoiY)
  }, [])

  const onOrderFilled = useCallback((order: Cap6OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap6EventBus>(
    () => ({
      onConflictShown,
      onLopQuyetDinhPicked,
      onOrderFilled,
      registerHandlers,
      isCap6Active: true,
    }),
    [onConflictShown, onLopQuyetDinhPicked, onOrderFilled, registerHandlers],
  )

  return <Cap6EventsContext.Provider value={value}>{children}</Cap6EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap6EventBus = {
  registerHandlers: () => {},
  isCap6Active: false,
}

/**
 * Access the Cấp 6 event bus. Always safe to call: outside a `Cap6Provider` it
 * returns the no-op bus (notify fns `undefined`, `isCap6Active` `false`).
 */
export function useCap6Events(): Cap6EventBus {
  return useContext(Cap6EventsContext) ?? NOOP_BUS
}
