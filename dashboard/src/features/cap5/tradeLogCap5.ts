import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap4TradeRecord } from "@/features/cap4/tradeLogCap4"
import type { O4, Verdict } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 5 (spec §6 khối ⑫) —
 * mirror `cap4/tradeLogCap4.ts` một cấp lên, cùng cơ chế localStorage + de-dupe
 * theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap5TradeRecord extends Cap4TradeRecord` (chính
 * nó extends `Cap3TradeRecord` → `Cap2TradeRecord` → `Cap1TradeRecord`) — nhờ
 * vậy `computeCap5PortfolioAnalysis` và `Cap5PortfolioAnalysis` truyền THẲNG
 * cùng một mảng xuống Cấp 4/3/2/1, không map/copy, và MỌI khối cũ (①-⑪) vẫn
 * tính được y như trước từ chính các bản ghi này.
 *
 * **KHÔNG có score log riêng:** điểm kỷ luật hằng ngày vẫn là
 * `cap2/tradeLogCap2.ts`'s `useCap2TradeLog().scores` (key `iqx_cap2_scores_*`)
 * — Cấp 5 chỉ đọc lại, không nhân bản.
 *
 * GAP (giống hệt gap `cap1/tradeLog.ts` + `cap2/tradeLogCap2.ts` +
 * `cap3/tradeLogCap3.ts` + `cap4/tradeLogCap4.ts` đã ghi, một cấp lên): backend
 * Cấp 5 KHÔNG có endpoint liệt kê từng lệnh đã đóng kèm ô 4 của nó — chỉ có
 * state tổng hợp (`GET /cap5/progress`, `GET /cap5/thach-thuc`) và MỘT khối đã
 * được tính server-side (`GET /cap5/dung-ngoai`, khối ⑬). Module này là
 * workaround cho khối ⑫ (ma trận 4 ô) — `KetsoModalCap5` ghi 1 `Cap5TradeRecord`
 * mỗi lần đóng Kết sổ (nó đang giữ đúng verdict vừa chốt).
 *
 * KNOWN LIMITATION (như Cấp 1/2/3/4): không backfill được lệnh đóng trước khi
 * tính năng này ship, và là per-browser (không sync giữa thiết bị) — fix đúng là
 * một task BE sau này (vd. `GET /cap5/ma-tran`). Vì thế khối ⑬ CỐ TÌNH đọc
 * endpoint server (authoritative + có backfill) chứ không tính lại từ nhật ký
 * này, và khối ⑫ nói thẳng "chưa đủ dữ liệu" thay vì bịa số.
 */
export interface Cap5TradeRecord extends Cap4TradeRecord {
  /**
   * Ô cuối cùng của lệnh = verdict đã chốt × kết quả (`order_ketso.o_4`).
   * `null` = lệnh CHƯA được phân loại 4 ô → khối ⑫ đếm riêng, KHÔNG gộp vào ô
   * nào (gộp sẽ vu cho user một verdict mà họ chưa từng chốt).
   */
  o4: O4 | null
  /** Verdict hệ GỢI Ý (`order_ketso.verdict_he`). `null` khi hệ chưa chấm được. */
  verdictHe: Verdict | null
  /**
   * Verdict CUỐI do user chốt (`order_ketso.verdict_user`) — chính nó, không
   * phải verdict hệ, quyết định ô 4. `null` khi user chưa chốt.
   *
   * ★ 3 trường của Cấp 5 dùng **camelCase** (khác 4 trường snake_case Cấp 4
   * thêm): chúng đi cặp với các trường camelCase của Cấp 1-3 trong cùng nhật ký
   * (`mucTuTin`, `chamSlKhongCat`…) và tên wire tương ứng là `o_4` /
   * `verdict_he` / `verdict_user` — ghi ra đây để đối chiếu với hàng DB không
   * phải đoán.
   */
  verdictUser: Verdict | null
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
