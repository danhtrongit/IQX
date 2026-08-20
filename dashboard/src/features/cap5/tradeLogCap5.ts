import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap4TradeRecord } from "@/features/cap4/tradeLogCap4"
import type { HuntFilter } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 5 (spec §9 khối ⑫) —
 * mirror `cap4/tradeLogCap4.ts` một cấp lên, cùng cơ chế localStorage + de-dupe
 * theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap5TradeRecord extends Cap4TradeRecord` (chính
 * nó extends `Cap3TradeRecord` → `Cap2TradeRecord` → `Cap1TradeRecord`) — nhờ
 * vậy `computeCap5PortfolioAnalysis` và `Cap5PortfolioAnalysis` truyền THẲNG
 * cùng một mảng xuống Cấp 4/3/2/1, không map/copy, và MỌI khối cũ (①-⑪) vẫn
 * tính được y như trước từ chính các bản ghi này.
 *
 * ★★ **ĐÃ GỠ 3 trường của Cấp 5 cũ** (`o4` / `verdictHe` / `verdictUser`): bước
 * phân loại 4 ô đã nghỉ hưu cùng toàn bộ Cấp 5 cũ. Thay bằng NGUỒN SĂN của lệnh
 * — đúng thứ khối ⑫ mới ("bộ lọc nào ra mã thắng nhiều nhất") cần.
 *
 * ⚠ Bản ghi CŨ còn nằm trong `localStorage` của user đang chơi dở sẽ thiếu
 * `huntFilter`. `JSON.parse` không kiểm kiểu, nên trường đó về `undefined` —
 * `computeCap5Khoi12BoLoc` xử lý `undefined` **y hệt `null`** (= "không đến từ
 * săn mã"), tức là bản ghi cũ bị loại khỏi khối ⑫ chứ KHÔNG bị gán bừa một bộ
 * lọc. Đó là hành vi đúng: chúng thật sự không có nguồn săn nào.
 *
 * **KHÔNG có score log riêng:** điểm kỷ luật hằng ngày vẫn là
 * `cap2/tradeLogCap2.ts`'s `useCap2TradeLog().scores` (key `iqx_cap2_scores_*`)
 * — Cấp 5 chỉ đọc lại, không nhân bản.
 *
 * GAP (giống hệt gap `cap1/tradeLog.ts` … `cap4/tradeLogCap4.ts` đã ghi, một
 * cấp lên): backend Cấp 5 KHÔNG có endpoint liệt kê từng lệnh đã đóng kèm nguồn
 * săn của nó — chỉ có state tổng hợp (`GET /cap5/progress`). Module này là
 * workaround cho khối ⑫; khối ⑬ (phễu kỷ luật săn mã) thì CỐ TÌNH đọc 3 con số
 * của `GET /cap5/progress` (authoritative + có backfill) chứ không tính lại từ
 * nhật ký này.
 *
 * KNOWN LIMITATION (như Cấp 1/2/3/4): không backfill được lệnh đóng trước khi
 * tính năng này ship, và là per-browser (không sync giữa thiết bị).
 */
export interface Cap5TradeRecord extends Cap4TradeRecord {
  /**
   * Bộ lọc đã SĂN RA mã của lệnh này (`order_kehoach.hunt_filter`).
   *
   * `null` = lệnh KHÔNG đến từ săn mã (user tự gõ mã) → khối ⑫ đếm riêng, KHÔNG
   * gán vào bộ lọc nào. Gán bừa sẽ là bịa nguồn săn — đúng thứ Kết sổ §8 cấm.
   */
  huntFilter: HuntFilter | null
  /**
   * Số phiên mã nằm trong Watchlist trước khi vào lệnh (Kết sổ §8 "đưa vào
   * Watchlist N phiên trước"). `null` khi không đo được — dòng nguồn săn khi đó
   * bỏ hẳn vế này thay vì in "0 phiên trước".
   */
  huntSoPhienCho: number | null
  /**
   * Số lớp ủng hộ (0-5) lúc mã được vào lệnh (Kết sổ §8 "vào lệnh khi lên 4/5
   * lớp ủng hộ"). `null` = CHƯA BIẾT (mẻ chấm 5 lớp chưa chạy cho mã này) —
   * KHÔNG được hiểu là 0 lớp.
   */
  huntSoLopLucVao: number | null
}

function tradesStorageKey(userId: string): string {
  return `iqx_cap5_trades_${userId}`
}

/** Reads the Cấp 5 trade log for `userId` from `localStorage`. Never throws. */
export function readCap5TradeLog(userId: string): Cap5TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap5TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — degrade to empty
    // history rather than throwing (mirrors `cap4/tradeLogCap4.ts`).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 5 trade log (de-duplicated by `orderId` —
 * a re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendCap5TradeRecord(
  userId: string,
  record: Cap5TradeRecord,
): Cap5TradeRecord[] {
  const existing = readCap5TradeLog(userId)
  const next = existing.some((t) => t.orderId === record.orderId)
    ? existing.map((t) => (t.orderId === record.orderId ? record : t))
    : [...existing, record]
  try {
    window.localStorage.setItem(tradesStorageKey(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable — degrade silently, the returned list above still
    // reflects the append for this render.
  }
  return next
}

export interface UseCap5TradeLogReturn {
  trades: Cap5TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap5TradeRecord) => void
}

/** React binding over the Cấp 5 trade log, scoped to the current auth user. */
export function useCap5TradeLog(): UseCap5TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap5TradeRecord[]>(() => readCap5TradeLog(userId))

  const record = useCallback(
    (rec: Cap5TradeRecord) => {
      setTrades(appendCap5TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
