import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react"
import type { HuntFilter } from "./types"

/**
 * Cấp 5 event bus — mirrors `cap4/Cap4Context.tsx`'s (proven) merge-semantics
 * design.
 *
 * The seam that lets the EXISTING `TradingPanel` notify Cấp 5 journey/progress
 * logic WITHOUT either side knowing the other's internals (and without knowing
 * Cấp 0-4's). Notifiers call `onKetsoClosed` / `onOrderFilled`; Kết sổ, Phân
 * tích danh mục và Hành trình đăng ký handler thật.
 *
 * ★★ `onDungNgoai` + `onVerdictSettled` ĐÃ BỊ GỠ cùng Cấp 5 cũ (nhật ký đứng
 * ngoài + phân loại 4 ô). Giữ lại một event không còn ai bắn sẽ là dây chết —
 * và tệ hơn, là lời mời dựng lại một màn hình đã nghỉ hưu.
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
  /**
   * Kết sổ Cấp 5 vừa được đóng cho một lệnh. `huntFilter` là NGUỒN SĂN THẬT của
   * lệnh (`null` = mã không đến từ săn mã) — chỗ nhận tuyệt đối không được suy
   * ra một bộ lọc mặc định từ `null`.
   */
  onKetsoClosed?: (symbol: string, huntFilter: HuntFilter | null) => void
  onOrderFilled?: (order: Cap5OrderEvent) => void
}

/** The bus value: notify fns (undefined when no handlers) + `registerHandlers`. */
export interface Cap5EventBus extends Cap5EventHandlers {
  registerHandlers: (handlers: Cap5EventHandlers) => void
  /**
   * True only inside a `Cap5Provider`. Mọi sửa đổi Cấp 5 vào component DÙNG
   * CHUNG phải gác trên cờ này, nếu không nó rò sang /bieu-do và /co-phieu.
   * NOTE: Cấp 5 KHÔNG thêm gì vào panel đặt lệnh (spec §0 "GIỮ NGUYÊN — panel
   * đặt lệnh = Cấp 4"); săn mã là MÀN RIÊNG.
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

  const onKetsoClosed = useCallback((symbol: string, huntFilter: HuntFilter | null) => {
    handlersRef.current.onKetsoClosed?.(symbol, huntFilter)
  }, [])

  const onOrderFilled = useCallback((order: Cap5OrderEvent) => {
    handlersRef.current.onOrderFilled?.(order)
  }, [])

  const value = useMemo<Cap5EventBus>(
    () => ({
      onKetsoClosed,
      onOrderFilled,
      registerHandlers,
      isCap5Active: true,
    }),
    [onKetsoClosed, onOrderFilled, registerHandlers],
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
