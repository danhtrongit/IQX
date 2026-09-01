import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { Lop } from "@/features/cap4/types"
import type { ConflictLevel } from "./mauThuanTypes"

/**
 * Cấp 6 event bus — mirrors `cap5/Cap5Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * logic without either side knowing the other's internals. Notifiers report
 * conflict evidence, user ratings, skip decisions, and filled orders; the
 * journey/settlement UI registers the actual handlers.
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
  // ── CẤP 6 «BẬC THẦY» (spec đợt 7) ─────────────────────────────────────────
  /**
   * Mức nhận định mâu thuẫn user chọn lúc MUA (spec §6). `undefined`/`null` =
   * lệnh không có bảng mâu thuẫn, hoặc user không chọn mức nào.
   */
  conflictLevel?: ConflictLevel | null
  /** Bảng mâu thuẫn CÓ hiện cho lệnh này không (spec §11 `had_conflict`). */
  coMauThuan?: boolean
  /** Lệnh này có lớp phủ quyết ở bậc rất xấu không (spec §11 `had_veto`). */
  phuQuyetKichHoat?: boolean
  /** Lớp phủ quyết đang xấu (spec §11 `veto_layers`). */
  lopPhuQuyetXau?: Lop[]
  /** Hai phe lúc đặt — để Kết sổ dựng bảng "nhận định vs hành động". */
  pheUngHo?: Lop[]
  pheNguoc?: Lop[]
}

/** Handlers the Cấp 6 journey registers to react to trading-UI events. */
export interface Cap6EventHandlers {
  onOrderFilled?: (order: Cap6OrderEvent) => void
  /** `cap6_conflict_shown(symbol, veto_layers)` — bảng mâu thuẫn vừa hiện. */
  onMauThuanShown?: (symbol: string, lopPhuQuyetXau: Lop[]) => void
  /** `cap6_conflict_rated(symbol, level)` — user chọn một mức nhận định. */
  onNhanDinhPicked?: (symbol: string, level: ConflictLevel) => void
  /** `cap6_skip(symbol, level)` — user bấm «Không mua lần này» (spec §7). */
  onKhongMua?: (symbol: string, level: ConflictLevel | null) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap6EventBus extends Cap6EventHandlers {
  registerHandlers: (handlers: Cap6EventHandlers) => void
  /**
   * True only inside a `Cap6Provider`. It gates the Cấp 6 conflict controls
   * without changing the Cấp 0–5 flow or Cấp 3's volume auto-fill.
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


  const onOrderFilled = useCallback((order: Cap6OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const onMauThuanShown = useCallback((symbol: string, lopPhuQuyetXau: Lop[]) => {
    handlersRef.current.onMauThuanShown?.(symbol, lopPhuQuyetXau)
  }, [])

  const onNhanDinhPicked = useCallback((symbol: string, level: ConflictLevel) => {
    handlersRef.current.onNhanDinhPicked?.(symbol, level)
  }, [])

  const onKhongMua = useCallback((symbol: string, level: ConflictLevel | null) => {
    handlersRef.current.onKhongMua?.(symbol, level)
  }, [])

  const value = useMemo<Cap6EventBus>(
    () => ({
      onOrderFilled,
      onMauThuanShown,
      onNhanDinhPicked,
      onKhongMua,
      registerHandlers,
      isCap6Active: true,
    }),
    [
      onOrderFilled,
      onMauThuanShown,
      onNhanDinhPicked,
      onKhongMua,
      registerHandlers,
    ],
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
