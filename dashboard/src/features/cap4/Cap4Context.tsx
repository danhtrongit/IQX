import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"

/**
 * Cấp 4 event bus — mirrors `cap3/Cap3Context.tsx`'s (already-proven)
 * merge-semantics design.
 *
 * This is the seam that lets the EXISTING `TradingPanel` notify Cấp 4
 * journey/progress logic of user actions WITHOUT Cấp 4 knowing its internals
 * (and without it knowing Cấp 0/1/2/3's). The notifier side calls
 * `onLopRated` / `onAiRevealed` / `onOrderFilled`; later tasks (FE2/FE3 — Kết
 * sổ, Phân tích danh mục, Hành trình) supply the actual handlers via
 * `registerHandlers`.
 *
 * Outside a `Cap4Provider` the hook is a safe no-op: the notify functions are
 * `undefined` (callers guard with `?.`), `isCap4Active` is `false`, and
 * `registerHandlers` does nothing.
 *
 * NOTE (FE1 scope): this delivery only defines the bus + `isCap4Active` gate
 * that `TradingPanel` reads. The actual `Cap4Provider` wiring into a page
 * (deciding WHEN a user is in Cấp 4) is FE3's routing job — FE1's tests
 * construct `Cap4Provider` directly / mock `isCap4Active`.
 */

/** A filled order the trading UI reports to Cấp 4. */
export interface Cap4OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /** Khối "Đọc 5 lớp" carried at BUY time — undefined on sell events. */
  doc5Lop?: Lop5Partial
  /** AI's per-lớp view at BUY time (only once revealed) — undefined on sells. */
  ai5Lop?: Lop5Partial | null
  /** Số lớp AI đánh giá Ủng hộ (0-5). */
  soLopDongThuan?: number
  /** Số lớp bạn đọc khác AI — a NEUTRAL count, never a "sai" score (spec §4.2). */
  soLopKhacAi?: number
}

/** Handlers the Cấp 4 journey registers to react to trading-UI events. */
export interface Cap4EventHandlers {
  /** One lớp was (re-)self-rated — analytics `cap4_doc_lop(lop, nhan_dinh)`. */
  onLopRated?: (lop: Lop, nhanDinh: NhanDinhLop) => void
  /** All 5 lớp rated → AI đối chiếu revealed — analytics `cap4_lo_ai(so_khac_ai)`. */
  onAiRevealed?: (soLopKhacAi: number) => void
  onOrderFilled?: (order: Cap4OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap4EventBus extends Cap4EventHandlers {
  registerHandlers: (handlers: Cap4EventHandlers) => void
  /** True only inside a `Cap4Provider`. Gates `TradingPanel`'s `Doc5LopBlock`,
   * the hidden Cấp 1 lý-do field and the "đã chấm đủ 5 lớp" hard gate. */
  isCap4Active: boolean
}

const Cap4EventsContext = createContext<Cap4EventBus | null>(null)

export function Cap4Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap4EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0/1/2/3 fix: multiple independent
  // registrants (journey bar, Phân tích danh mục, later tasks) may each call
  // `registerHandlers` with only the keys they own. A plain
  // `handlersRef.current = handlers` would let whichever one's effect
  // runs/re-runs LAST wipe out the others' handlers entirely.
  const registerHandlers = useCallback((handlers: Cap4EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onLopRated = useCallback((lop: Lop, nhanDinh: NhanDinhLop) => {
    handlersRef.current.onLopRated?.(lop, nhanDinh)
  }, [])

  const onAiRevealed = useCallback((soLopKhacAi: number) => {
    handlersRef.current.onAiRevealed?.(soLopKhacAi)
  }, [])

  const onOrderFilled = useCallback((order: Cap4OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap4EventBus>(
    () => ({
      onLopRated,
      onAiRevealed,
      onOrderFilled,
      registerHandlers,
      isCap4Active: true,
    }),
    [onLopRated, onAiRevealed, onOrderFilled, registerHandlers],
  )

  return <Cap4EventsContext.Provider value={value}>{children}</Cap4EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap4EventBus = {
  registerHandlers: () => {},
  isCap4Active: false,
}

/**
 * Access the Cấp 4 event bus. Always safe to call: outside a `Cap4Provider`
 * it returns the no-op bus (notify fns `undefined`, `isCap4Active` `false`).
 */
export function useCap4Events(): Cap4EventBus {
  return useContext(Cap4EventsContext) ?? NOOP_BUS
}
