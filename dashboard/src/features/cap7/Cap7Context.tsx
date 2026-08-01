import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { HanhViCo, LucDocUser } from "./types"

/**
 * Cấp 7 event bus — mirrors `cap6/Cap6Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * The seam that lets the EXISTING `TradingPanel` notify Cấp 7 journey/progress
 * logic WITHOUT either side knowing the other's internals (and without knowing
 * Cấp 0-6's). Notifiers call `onLucShown` / `onLucDoc` / `onCoShown` /
 * `onCoHanhVi` / `onOrderFilled` (spec §8's analytics list); FE2/FE3 (Kết sổ,
 * Phân tích danh mục, Hành trình) register the actual handlers.
 *
 * Outside a `Cap7Provider` the hook is a safe no-op: notify fns are `undefined`
 * (callers guard with `?.`), `isCap7Active` is `false`, and `registerHandlers`
 * does nothing.
 *
 * ★ `isCap7Active` gates the reading block and NOTHING ELSE. Cấp 7 adds no cổng
 * cứng anywhere (spec §9: đọc lực là SOFT — nhiệm vụ ① chỉ cần ghi ≥ 1 lần), so
 * this flag must never appear in the panel's `disabled` chain.
 */

/** A filled order the trading UI reports to Cấp 7. */
export interface Cap7OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /**
   * The đọc-lực block carried at BUY time — present ONLY when the book was
   * readable in-session and the user recorded a reading (undefined otherwise,
   * and on sells). Reading is never required to buy.
   */
  lucChiSo?: number
  lucDocUser?: LucDocUser
  /** Whether the cờ cảnh giác was showing at the moment of the buy. */
  coCanhGiac?: boolean
  /** ★ Recorded, never penalised (spec §5 "không phạt cứng"). */
  hanhViCo?: HanhViCo | null
}

/** Handlers the Cấp 7 journey registers to react to trading-UI events. */
export interface Cap7EventHandlers {
  /** Analytics `cap7_luc_shown(mã, chi_so)` — the gauge became readable. */
  onLucShown?: (symbol: string, chiSo: number) => void
  /** Analytics `cap7_luc_doc(user_read)` — the user picked their own reading. */
  onLucDoc?: (doc: LucDocUser) => void
  /**
   * Analytics `cap7_co_lenhgia_shown` — the heuristic tripped on this snapshot.
   * ★ "Tripped" means the book has one unusually large level, NOT that anything
   * was detected as fake (spec §9 excludes real detection).
   */
  onCoShown?: (symbol: string, gia: number, khoiLuong: number) => void
  /** Analytics `cap7_co_hanh_vi(hanh_vi)` — what the user did about the cờ. */
  onCoHanhVi?: (hanhVi: HanhViCo) => void
  onOrderFilled?: (order: Cap7OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap7EventBus extends Cap7EventHandlers {
  registerHandlers: (handlers: Cap7EventHandlers) => void
  /**
   * True only inside a `Cap7Provider`. Gates `TradingPanel`'s `DocSoLenhBlock`
   * and nothing else — Cấp 7 changes NOTHING about Cấp 0-6's blocks, their cổng
   * cứng chain or Cấp 3's volume auto-fill (spec §0), and adds no gate of its
   * own (spec §9).
   */
  isCap7Active: boolean
}

const Cap7EventsContext = createContext<Cap7EventBus | null>(null)

export function Cap7Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap7EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0-6 fix: multiple independent
  // registrants may each register only the keys they own, and a plain
  // assignment would let whichever effect runs LAST wipe the others.
  const registerHandlers = useCallback((handlers: Cap7EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onLucShown = useCallback((symbol: string, chiSo: number) => {
    handlersRef.current.onLucShown?.(symbol, chiSo)
  }, [])

  const onLucDoc = useCallback((doc: LucDocUser) => {
    handlersRef.current.onLucDoc?.(doc)
  }, [])

  const onCoShown = useCallback((symbol: string, gia: number, khoiLuong: number) => {
    handlersRef.current.onCoShown?.(symbol, gia, khoiLuong)
  }, [])

  const onCoHanhVi = useCallback((hanhVi: HanhViCo) => {
    handlersRef.current.onCoHanhVi?.(hanhVi)
  }, [])

  const onOrderFilled = useCallback((order: Cap7OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap7EventBus>(
    () => ({
      onLucShown,
      onLucDoc,
      onCoShown,
      onCoHanhVi,
      onOrderFilled,
      registerHandlers,
      isCap7Active: true,
    }),
    [onLucShown, onLucDoc, onCoShown, onCoHanhVi, onOrderFilled, registerHandlers],
  )

  return <Cap7EventsContext.Provider value={value}>{children}</Cap7EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap7EventBus = {
  registerHandlers: () => {},
  isCap7Active: false,
}

/**
 * Access the Cấp 7 event bus. Always safe to call: outside a `Cap7Provider` it
 * returns the no-op bus (notify fns `undefined`, `isCap7Active` `false`).
 */
export function useCap7Events(): Cap7EventBus {
  return useContext(Cap7EventsContext) ?? NOOP_BUS
}
