import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap2DailyScoreRecord, Cap2TradeRecord } from "./portfolioAnalysisCap2"

/**
 * Client-side closed-trade + daily-score log for Cấp 2's Phân tích danh mục
 * (spec `IQX-Cap2-Spec.md` §12) — mirrors `cap1/tradeLog.ts`'s accumulator
 * one level up. `Cap2TradeRecord`/`Cap2DailyScoreRecord` are already defined
 * by `portfolioAnalysisCap2.ts` (this module only supplies their storage +
 * accumulation) — they're exactly the plain parameters
 * `computeCap2PortfolioAnalysis` expects (see that module's own docstring on
 * why no BE endpoint lists historical trades/scores directly).
 *
 * GAP (mirrors `cap1/tradeLog.ts`'s own documented gap, one level up):
 * `GET /cap2/progress` only returns aggregate chuỗi/task state, and
 * `GET /cap2/diem-ky-luat` only ever answers for ONE ngày at a time — there
 * is no BE endpoint that lists historical `order_ketso` rows or a 30-day
 * điểm kỷ luật series. This module is the workaround: `Cap2TradingPage`
 * appends one `Cap2TradeRecord` every time `KetsoModalCap2` finishes
 * reconciling a closed order (it already carries the 4 vi phạm flags it just
 * posted to `/cap2/ketso`), and one `Cap2DailyScoreRecord` whenever
 * `useDiemKyLuat` resolves a real (non-null) score for a given ngày.
 *
 * KNOWN LIMITATION (same as Cấp 1's): this cannot backfill trades/scores from
 * before this feature shipped, and it's per-browser (not synced across
 * devices) — a proper fix is a future BE task (e.g. `GET /cap2/trades` +
 * `GET /cap2/diem-ky-luat/history`).
 */

function tradesStorageKey(userId: string): string {
  return `iqx_cap2_trades_${userId}`
}

function scoresStorageKey(userId: string): string {
  return `iqx_cap2_scores_${userId}`
}

/** Reads the Cấp 2 trade log for `userId` from `localStorage`. Never throws. */
export function readCap2TradeLog(userId: string): Cap2TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap2TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — degrade to empty
    // history rather than throwing (mirrors `cap1/tradeLog.ts`).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 2 trade log (de-duplicated by
 * `orderId` — a re-render/re-mount must never double-count the same closed
 * order) and persists it. Returns the updated list.
 */
export function appendCap2TradeRecord(
  userId: string,
  record: Cap2TradeRecord,
): Cap2TradeRecord[] {
  const existing = readCap2TradeLog(userId)
  const next = existing.some((t) => t.orderId === record.orderId)
    ? existing.map((t) => (t.orderId === record.orderId ? record : t))
    : [...existing, record]
  try {
    window.localStorage.setItem(tradesStorageKey(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable — degrade silently, the in-memory list above still
    // reflects the append for this render.
  }
  return next
}

/** Reads the Cấp 2 daily-score log for `userId` from `localStorage`. */
export function readCap2ScoreLog(userId: string): Cap2DailyScoreRecord[] {
  try {
    const raw = window.localStorage.getItem(scoresStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap2DailyScoreRecord[]) : []
  } catch {
    return []
  }
}

/**
 * Appends `record` to `userId`'s daily-score log (de-duplicated by `ngay` —
 * a day's điểm kỷ luật can be recomputed/refetched several times as more
 * lệnh close during that day, so the LATEST value for a given ngày replaces,
 * never duplicates) and persists it. Returns the updated list.
 */
export function appendCap2ScoreRecord(
  userId: string,
  record: Cap2DailyScoreRecord,
): Cap2DailyScoreRecord[] {
  const existing = readCap2ScoreLog(userId)
  const next = existing.some((s) => s.ngay === record.ngay)
    ? existing.map((s) => (s.ngay === record.ngay ? record : s))
    : [...existing, record]
  try {
    window.localStorage.setItem(scoresStorageKey(userId), JSON.stringify(next))
  } catch {
    // degrade silently
  }
  return next
}

export interface UseCap2TradeLogReturn {
  trades: Cap2TradeRecord[]
  scores: Cap2DailyScoreRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap2TradeRecord) => void
  /** Appends/replaces today's điểm kỷ luật (call whenever `useDiemKyLuat`
   * resolves a real, non-null score). */
  recordScore: (record: Cap2DailyScoreRecord) => void
}

/** React binding over the Cấp 2 trade + score log, scoped to the current auth user. */
export function useCap2TradeLog(): UseCap2TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap2TradeRecord[]>(() => readCap2TradeLog(userId))
  const [scores, setScores] = useState<Cap2DailyScoreRecord[]>(() => readCap2ScoreLog(userId))

  const record = useCallback(
    (rec: Cap2TradeRecord) => {
      setTrades(appendCap2TradeRecord(userId, rec))
    },
    [userId],
  )

  const recordScore = useCallback(
    (rec: Cap2DailyScoreRecord) => {
      setScores(appendCap2ScoreRecord(userId, rec))
    },
    [userId],
  )

  return { trades, scores, record, recordScore }
}
