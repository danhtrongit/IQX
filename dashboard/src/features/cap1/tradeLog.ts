import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { LyDo, TrangThaiLucDat } from "./types"

/**
 * Client-side closed-trade log for Cấp 1's Phân tích danh mục (spec §7) +
 * Kết sổ "HỒ SƠ CỦA BẠN" (spec §6).
 *
 * GAP (see `/Users/danhtrongit/Projects/IQX/.superpowers/sdd/cap1-FE2-report.md`
 * for the full writeup): `GET /cap1/progress` only returns AGGREGATE counters
 * (`so_ly_do_da_dung`, `so_lenh_ly_do_ung_ho`, …) — there is no BE endpoint
 * that lists the user's `order_kehoach`/`order_ketso` rows, so per-lý-do
 * win/loss breakdowns (Khối 2/3's coverage grid, the 3 mẫu tự phát hiện, Kết
 * sổ's "dòng 2/3") cannot be computed from a single server round-trip.
 *
 * Workaround: every time `KetsoModalCap1` finishes reconciling a closed order
 * (it already holds BOTH the `OrderKehoach` fields captured at BUY time and
 * the `OrderKetso` fields computed at SELL time — exactly the "existing
 * trade/kehoach data" the record already carries), it appends one
 * `Cap1TradeRecord` here via `useCap1TradeLog().record`. This accumulates a
 * durable (per-browser, per-user) closed-trade history going forward.
 *
 * KNOWN LIMITATION: this cannot backfill trades closed before this feature
 * shipped, and it's per-browser (not synced across devices) — a proper fix
 * is a future BE task (e.g. `GET /cap1/trades`) that lists `order_kehoach`
 * JOIN `order_ketso` rows directly from the database.
 */
export interface Cap1TradeRecord {
  orderId: string
  lyDo: LyDo
  trangThaiLucDat: TrangThaiLucDat
  pnlPct: number
  pnlVnd: number
  closedAt: string
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
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap1TradeRecord[]>(() => readTradeLog(userId))

  const record = useCallback(
    (rec: Cap1TradeRecord) => {
      setTrades(appendTradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
