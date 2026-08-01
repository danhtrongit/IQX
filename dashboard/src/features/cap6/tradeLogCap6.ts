import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap5TradeRecord } from "@/features/cap5/tradeLogCap5"
import type { KieuCoPhieu, Lop } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 6 (spec §7 khối ⑭) —
 * mirror `cap5/tradeLogCap5.ts` một cấp lên, cùng cơ chế localStorage + de-dupe
 * theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap6TradeRecord extends Cap5TradeRecord` (chính
 * nó extends Cấp 4 → 3 → 2 → 1) — nhờ vậy `computeCap6PortfolioAnalysis` và
 * `Cap6PortfolioAnalysis` truyền THẲNG cùng một mảng xuống Cấp 5/4/3/2/1, không
 * map/copy, và MỌI khối cũ (①-⑬) vẫn tính được y như trước từ chính các bản ghi
 * này.
 *
 * GAP (giống hệt gap Cấp 1-5 đã ghi, một cấp lên): backend Cấp 6 KHÔNG có
 * endpoint liệt kê từng lệnh đã đóng kèm kiểu cổ phiếu + lớp quyết định của nó —
 * chỉ có state tổng hợp (`GET /cap6/progress`, `GET /cap6/thach-thuc`). Module
 * này là workaround cho khối ⑭; `KetsoModalCap6` ghi 1 `Cap6TradeRecord` mỗi lần
 * đóng Kết sổ (nó đang giữ đúng khối Đối chiếu vừa đối soát).
 *
 * ★ Vì thế khối ⑮ CỐ TÌNH KHÔNG tính từ nhật ký này: `GET /cap6/thach-thuc` đã
 * trả về đúng hai nhóm khớp/lệch (authoritative, có ghép lệnh mua-bán server-side
 * và chính là con số nuôi nhiệm vụ ③). Tính lại ở client sẽ sinh một con số thứ
 * hai, lệch, và có thể mâu thuẫn với widget Thách thức — cùng tiền lệ khối ⑬ của
 * Cấp 5 và khối ⑨ của Cấp 4.
 *
 * KNOWN LIMITATION (như Cấp 1-5): không backfill được lệnh đóng trước khi tính
 * năng này ship, và là per-browser (không sync giữa thiết bị) — fix đúng là một
 * task BE sau này (vd. `GET /cap6/ma-tran`). Khối ⑭ vì vậy nói thẳng "chưa đủ dữ
 * liệu" thay vì bịa số.
 */
export interface Cap6TradeRecord extends Cap5TradeRecord {
  /**
   * Kiểu cổ phiếu SERVER chốt cho lệnh (`order_kehoach.kieu_co_phieu`).
   * `null` = "chưa phân loại" (ngành thiếu/chưa map) → khối ⑭ đếm riêng, KHÔNG
   * gộp vào ô kiểu nào.
   */
  kieuCoPhieu: KieuCoPhieu | null
  /** Lớp user quyết định tin (`order_kehoach.lop_quyet_dinh`). `null` = lệnh
   * không có mâu thuẫn nên chưa từng đi qua bước Đối chiếu. */
  lopQuyetDinh: Lop | null
  /**
   * `order_kehoach.khop_goi_y`.
   *
   * ★ `false` là một SỰ THẬT TRUNG TÍNH (spec §5/§10), không bao giờ là "sai".
   * `null` = kiểu chưa phân loại (không có gợi ý nào để so) HOẶC lệnh không có
   * đối chiếu — cả hai đều KHÔNG được tính là lệch ở bất cứ khối nào.
   */
  khopGoiY: boolean | null
}

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
