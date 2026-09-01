import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap5TradeRecord } from "@/features/cap5/tradeLogCap5"

/**
 * Client-side closed-trade log for Cấp 6. Its rows intentionally carry the
 * inherited Cấp 1-5 evidence only; retired order-book/Đối chiếu metadata is
 * not persisted as Cấp 6 evidence.
 */
export type Cap6TradeRecord = Cap5TradeRecord

function tradesStorageKey(userId: string): string {
  return `iqx_cap6_trades_${userId}`
}

/** Reads the Cấp 6 trade log for `userId` from `localStorage`. Never throws. */
export function readCap6TradeLog(userId: string): Cap6TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap6TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) or corrupt JSON —
    // degrade to empty history rather than throwing (mirrors Cấp 1-5).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 6 trade log (de-duplicated by `orderId` —
 * a re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendCap6TradeRecord(
  userId: string,
  record: Cap6TradeRecord,
): Cap6TradeRecord[] {
  const existing = readCap6TradeLog(userId)
  const next = existing.some((t) => t.orderId === record.orderId)
    ? existing.map((t) => (t.orderId === record.orderId ? record : t))
    : [...existing, record]
  try {
    window.localStorage.setItem(tradesStorageKey(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable — degrade silently; the returned list still reflects
    // the append for this render.
  }
  return next
}

export interface UseCap6TradeLogReturn {
  trades: Cap6TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap6TradeRecord) => void
}

/** React binding over the Cấp 6 trade log, scoped to the current auth user. */
export function useCap6TradeLog(): UseCap6TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap6TradeRecord[]>(() => readCap6TradeLog(userId))

  const record = useCallback(
    (rec: Cap6TradeRecord) => {
      setTrades(appendCap6TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
