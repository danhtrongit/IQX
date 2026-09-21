import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap1TradeHistory, LyDo, TrangThaiLucDat } from "./types"

/**
 * Client-side closed-trade log for Cấp 1's Phân tích danh mục (spec §7) +
 * Kết sổ "HỒ SƠ CỦA BẠN" (spec §6).
 *
 * Every time `KetsoModalCap1` finishes reconciling a closed order
 * (it already holds BOTH the `OrderKehoach` fields captured at BUY time and
 * the `OrderKetso` fields computed at SELL time — exactly the "existing
 * trade/kehoach data" the record already carries), it appends one
 * `Cap1TradeRecord` here via `useCap1TradeLog().record`. This accumulates a
 * durable (per-browser, per-user) closed-trade history going forward.
 *
 * Durable backfill and cross-device reads use `GET /cap1/trades`; this local
 * log remains an immediate fallback between a close and query refetch.
 */
export interface Cap1TradeRecord {
  orderId: string
  lyDo: LyDo
  trangThaiLucDat: TrangThaiLucDat
  pnlPct: number
  pnlVnd: number
  closedAt: string
}

export function cap1TradeFromHistory(row: Cap1TradeHistory): Cap1TradeRecord {
  return {
    orderId: row.sell_order_id,
    lyDo: row.lyDo,
    trangThaiLucDat: row.trangThai_luc_dat,
    pnlPct: row.pnl_pct,
    pnlVnd: row.pnl_vnd,
    closedAt: row.closed_at,
  }
}

function storageKey(userId: string): string {
  return `iqx_cap1_trades_${userId}`
}

/** Reads the trade log for `userId` from `localStorage`. Never throws. */
export function readTradeLog(userId: string): Cap1TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap1TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — degrade to empty
    // history rather than throwing (mirrors `features/tour/useFeatureTour.ts`).
    return []
  }
}

/**
 * Appends `record` to `userId`'s trade log (de-duplicated by `orderId` — a
 * re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendTradeRecord(userId: string, record: Cap1TradeRecord): Cap1TradeRecord[] {
  const existing = readTradeLog(userId)
  const next = existing.some((t) => t.orderId === record.orderId)
    ? existing.map((t) => (t.orderId === record.orderId ? record : t))
    : [...existing, record]
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable — degrade silently, the in-memory list below still
    // reflects the append for this render.
  }
  return next
}

export interface UseCap1TradeLogReturn {
  trades: Cap1TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap1TradeRecord) => void
}

/** React binding over the trade log, scoped to the current auth user. */
export function useCap1TradeLog(): UseCap1TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [trades, setTrades] = useState<Cap1TradeRecord[]>(() =>
    userId ? readTradeLog(userId) : [],
  )

  // Auth context can switch accounts without unmounting the Đấu trường shell.
  // Replace in-memory state immediately so account B never sees account A's
  // fallback while B's authoritative server query is loading.
  useEffect(() => {
    setTrades(userId ? readTradeLog(userId) : [])
  }, [userId])

  const record = useCallback(
    (rec: Cap1TradeRecord) => {
      if (!userId) return
      setTrades(appendTradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
