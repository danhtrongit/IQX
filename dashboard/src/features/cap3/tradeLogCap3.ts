import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap2TradeRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 3 (spec §8 khối
 * ⑦/⑧) — mirror `cap2/tradeLogCap2.ts` một cấp lên, cùng cơ chế
 * localStorage + de-dupe theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap3TradeRecord extends Cap2TradeRecord`
 * (chính nó extends `Cap1TradeRecord`) — nhờ vậy `computeCap3PortfolioAnalysis`
 * truyền THẲNG cùng một mảng cho `computeCap2PortfolioAnalysis` để dựng lại
 * mọi khối Cấp 1-2, không cần map/copy dữ liệu.
 *
 * **KHÔNG có score log riêng:** điểm kỷ luật hằng ngày là công cụ Cấp 2 và
 * không phụ thuộc cấp — `cap2/tradeLogCap2.ts`'s `useCap2TradeLog().scores`
 * (key `iqx_cap2_scores_*`) vẫn là nguồn duy nhất; Cấp 3 chỉ đọc lại nó, không
 * nhân bản thêm một nhật ký điểm.
 *
 * GAP (giống hệt gap `cap1/tradeLog.ts` + `cap2/tradeLogCap2.ts` đã ghi, một
 * cấp lên): backend Cấp 3 chỉ trả state tổng hợp (`GET /cap3/progress`) —
 * không có endpoint nào liệt kê `order_kehoach` JOIN `order_ketso` để lấy
 * `muc_tu_tin`/`cach_khoi_luong`/`khoi_luong`/
 * `pct_von` của từng lệnh đã đóng. Module này là workaround: `KetsoModalCap3`
 * ghi 1 `Cap3TradeRecord` mỗi lần đóng Kết sổ (nó đang giữ đúng các giá trị
 * quản lý vốn vừa đối chiếu).
 *
 * KNOWN LIMITATION (như Cấp 1/2): không backfill được lệnh đóng trước khi
 * tính năng này ship, và là per-browser (không sync giữa thiết bị) — fix đúng
 * là một task BE sau này (vd. `GET /cap3/trades`).
 */
export interface Cap3TradeRecord extends Cap2TradeRecord {
  /** Khẩu vị rủi ro LÚC ĐẶT lệnh (hồ sơ có thể đổi sau — snapshot tại đây). */
  khauVi: KhauViLoai
  /** Mức tự tin user tự chấm (`order_kehoach.muc_tu_tin`) — trục của khối ⑦/⑧. */
  mucTuTin: MucTuTin
  /** Cách tính khối lượng đã chọn (`order_kehoach.cach_khoi_luong`). */
  cachKhoiLuong: CachKhoiLuong
  /** Khối lượng thực tế (cp) — `order_kehoach.khoi_luong`. */
  khoiLuong: number
  /** % vốn thực tế của lệnh — `order_kehoach.pct_von`. */
  pctVon: number
}

function tradesStorageKey(userId: string): string {
  return `iqx_cap3_trades_${userId}`
}

/** Reads the Cấp 3 trade log for `userId` from `localStorage`. Never throws. */
export function readCap3TradeLog(userId: string): Cap3TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap3TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — degrade to empty
    // history rather than throwing (mirrors `cap2/tradeLogCap2.ts`).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 3 trade log (de-duplicated by `orderId` —
 * a re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendCap3TradeRecord(
  userId: string,
  record: Cap3TradeRecord,
): Cap3TradeRecord[] {
  const existing = readCap3TradeLog(userId)
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

export interface UseCap3TradeLogReturn {
  trades: Cap3TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap3TradeRecord) => void
}

/** React binding over the Cấp 3 trade log, scoped to the current auth user. */
export function useCap3TradeLog(): UseCap3TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap3TradeRecord[]>(() => readCap3TradeLog(userId))

  const record = useCallback(
    (rec: Cap3TradeRecord) => {
      setTrades(appendCap3TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
