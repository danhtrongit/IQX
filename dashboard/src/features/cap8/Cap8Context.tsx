import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { HanhViCanhBao, LoaiCanhBao, TuongQuanCap8 } from "./types"

/**
 * Cấp 8 event bus — mirrors `cap7/Cap7Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * The seam that lets the EXISTING `TradingPanel` notify Cấp 8 journey/progress
 * logic WITHOUT either side knowing the other's internals (and without knowing
 * Cấp 0-7's). Notifiers call `onCheckShown` / `onCheckHanhVi` / `onOrderFilled`
 * (spec §8's analytics list); FE2/FE3 (Kết sổ, Phân tích danh mục, Hành trình)
 * register the actual handlers.
 *
 * Outside a `Cap8Provider` the hook is a safe no-op: notify fns are `undefined`
 * (callers guard with `?.`), `isCap8Active` is `false`, and `registerHandlers`
 * does nothing.
 *
 * ★ `isCap8Active` gates the Kiểm tra danh mục block and NOTHING ELSE. Cấp 8
 * adds no cổng cứng anywhere (spec §9/§C8: cảnh báo MỀM, user quyết), so this
 * flag must never appear in the panel's `disabled` chain.
 */

/** A filled order the trading UI reports to Cấp 8. */
export interface Cap8OrderEvent {
  symbol: string
  side: "buy" | "sell"
  quantity: number
  /** Filled price (VND). */
  price: number
  orderId: string
  /**
   * The Kiểm tra danh mục block carried at BUY time — present ONLY when the
   * check actually returned (undefined otherwise, and on sells). The check is
   * never required to buy, and a failed check never blocks one.
   *
   * ★ These are the numbers the FE *displayed*; the server re-derives and stores
   * its own when `/cap8/kehoach` runs. They ride the bus so Kết sổ can show what
   * the user was looking at, not so anything can be persisted from them.
   */
  donNganhPct?: number | null
  tuongQuanCaoVoi?: TuongQuanCap8 | null
  tongRuiRoPct?: number | null
  danhMucCanhBao?: LoaiCanhBao[]
  /** ★ `van_mua` is recorded, never penalised (spec §9: không cổng cứng). */
  hanhViCanhBao?: HanhViCanhBao
}

/** Handlers the Cấp 8 journey registers to react to trading-UI events. */
export interface Cap8EventHandlers {
  /**
   * Analytics `cap8_check_shown(mã, cảnh_báo[])` — the check rendered.
   * `canhBao` is `[]` for a clean order: the check DID run and nothing fired,
   * which is a different fact from the check never running.
   */
  onCheckShown?: (symbol: string, canhBao: LoaiCanhBao[]) => void
  /** Analytics `cap8_check_hanh_vi(hanh_vi)` — which of the 3 the user pressed. */
  onCheckHanhVi?: (hanhVi: HanhViCanhBao) => void
  onOrderFilled?: (order: Cap8OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap8EventBus extends Cap8EventHandlers {
  registerHandlers: (handlers: Cap8EventHandlers) => void
  /**
   * True only inside a `Cap8Provider`. Gates `TradingPanel`'s
   * `KiemTraDanhMucBlock` and nothing else — Cấp 8 changes NOTHING about Cấp
   * 0-7's blocks, their cổng cứng chain or Cấp 3's volume auto-fill (spec §0),
   * and adds no gate of its own (spec §9).
   */
  isCap8Active: boolean
}

const Cap8EventsContext = createContext<Cap8EventBus | null>(null)

export function Cap8Provider({ children }: { children: ReactNode }) {
  // Handlers live in a ref so registering them never re-renders notifiers and
  // the notify fns keep a stable identity.
  const handlersRef = useRef<Cap8EventHandlers>({})

  // MERGE (not replace) — mirrors the Cấp 0-7 fix: multiple independent
  // registrants may each register only the keys they own, and a plain
  // assignment would let whichever effect runs LAST wipe the others.
  const registerHandlers = useCallback((handlers: Cap8EventHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers }
  }, [])

  const onCheckShown = useCallback((symbol: string, canhBao: LoaiCanhBao[]) => {
    handlersRef.current.onCheckShown?.(symbol, canhBao)
  }, [])

  const onCheckHanhVi = useCallback((hanhVi: HanhViCanhBao) => {
    handlersRef.current.onCheckHanhVi?.(hanhVi)
  }, [])

  const onOrderFilled = useCallback((order: Cap8OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap8EventBus>(
    () => ({
      onCheckShown,
      onCheckHanhVi,
      onOrderFilled,
      registerHandlers,
      isCap8Active: true,
    }),
    [onCheckShown, onCheckHanhVi, onOrderFilled, registerHandlers],
  )

  return <Cap8EventsContext.Provider value={value}>{children}</Cap8EventsContext.Provider>
}

/** Safe no-op bus used outside a provider — notify fns undefined. */
const NOOP_BUS: Cap8EventBus = {
  registerHandlers: () => {},
  isCap8Active: false,
}

/**
 * Access the Cấp 8 event bus. Always safe to call: outside a `Cap8Provider` it
 * returns the no-op bus (notify fns `undefined`, `isCap8Active` `false`).
 */
export function useCap8Events(): Cap8EventBus {
  return useContext(Cap8EventsContext) ?? NOOP_BUS
}
