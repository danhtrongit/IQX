import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap3TradeRecord } from "@/features/cap3/tradeLogCap3"
import type { Lop5Partial } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 4 (spec §7 khối
 * ⑩/⑪) — mirror `cap3/tradeLogCap3.ts` một cấp lên, cùng cơ chế localStorage +
 * de-dupe theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap4TradeRecord extends Cap3TradeRecord`
 * (chính nó extends `Cap2TradeRecord` → `Cap1TradeRecord`) — nhờ vậy
 * `computeCap4PortfolioAnalysis` và `Cap4PortfolioAnalysis` truyền THẲNG cùng
 * một mảng xuống Cấp 3/2/1, không cần map/copy dữ liệu.
 *
 * **KHÔNG có score log riêng:** điểm kỷ luật hằng ngày vẫn là
 * `cap2/tradeLogCap2.ts`'s `useCap2TradeLog().scores` (key `iqx_cap2_scores_*`)
 * — Cấp 4 chỉ đọc lại, không nhân bản.
 *
 * GAP (giống hệt gap `cap1/tradeLog.ts` + `cap2/tradeLogCap2.ts` +
 * `cap3/tradeLogCap3.ts` đã ghi, một cấp lên): backend Cấp 4 KHÔNG có endpoint
 * liệt kê từng lệnh đã đóng kèm `doc_5_lop`/`ai_5_lop` — chỉ có state tổng hợp
 * (`GET /cap4/progress`, `GET /cap4/thach-thuc`) và MỘT khối đã được tính
 * server-side (`GET /cap4/vu-khi-diem-mu`, khối ⑨). Module này là workaround
 * cho 2 khối CHƯA có endpoint (⑩ đồng thuận vs thắng · ⑪ góc nhìn riêng):
 * `KetsoModalCap4` ghi 1 `Cap4TradeRecord` mỗi lần đóng Kết sổ (nó đang giữ
 * đúng bản chấm 5 lớp vừa đối chiếu).
 *
 * KNOWN LIMITATION (như Cấp 1/2/3): không backfill được lệnh đóng trước khi
 * tính năng này ship, và là per-browser (không sync giữa thiết bị) — fix đúng
 * là một task BE sau này (vd. `GET /cap4/trades`). Vì thế khối ⑨ CỐ TÌNH đọc
 * endpoint server (authoritative + có backfill) chứ không tính lại từ nhật ký
 * này; ⑩/⑪ nói thẳng "chưa đủ dữ liệu" thay vì bịa số.
 */
export interface Cap4TradeRecord extends Cap3TradeRecord {
  /**
   * Bản tự chấm 5 lớp lúc đặt lệnh (`order_kehoach.doc_5_lop`).
   *
   * ★ 4 trường của Cấp 4 dùng **snake_case** thay vì camelCase như các trường
   * cấp dưới (`khauVi`, `mucTuTin`…): chúng là bản sao 1:1 của 4 cột
   * `order_kehoach` mà Cấp 4 thêm và của payload `POST /cap4/kehoach`
   * (`KehoachInputCap4`), nên giữ đúng tên wire/DB giúp đối chiếu nhật ký
   * client với hàng DB thật (và với khối ⑨ do server tính) không phải dịch tên.
   */
  doc_5_lop: Lop5Partial
  /** Đánh giá AI 5 lớp lúc đặt — `null` khi AI chưa bao giờ được lộ. */
  ai_5_lop: Lop5Partial | null
  /**
   * Số lớp **AI** đánh giá Ủng hộ (0-5) — CÙNG nghĩa với
   * `order_kehoach.so_lop_dong_thuan` của backend và với dòng "Đồng thuận: X/5"
   * ở panel đặt lệnh (`doc5Lop.ts#countDongThuan`). `null` khi chưa lộ AI.
   */
  so_lop_dong_thuan: number | null
  /** Số lớp user đọc khác AI — đếm TRUNG TÍNH. `null` khi chưa lộ AI. */
  so_lop_khac_ai: number | null
}

function tradesStorageKey(userId: string): string {
  return `iqx_cap4_trades_${userId}`
}

/** Reads the Cấp 4 trade log for `userId` from `localStorage`. Never throws. */
export function readCap4TradeLog(userId: string): Cap4TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap4TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) — degrade to empty
    // history rather than throwing (mirrors `cap3/tradeLogCap3.ts`).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 4 trade log (de-duplicated by `orderId` —
 * a re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendCap4TradeRecord(
  userId: string,
  record: Cap4TradeRecord,
): Cap4TradeRecord[] {
  const existing = readCap4TradeLog(userId)
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

export interface UseCap4TradeLogReturn {
  trades: Cap4TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap4TradeRecord) => void
}

/** React binding over the Cấp 4 trade log, scoped to the current auth user. */
export function useCap4TradeLog(): UseCap4TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap4TradeRecord[]>(() => readCap4TradeLog(userId))

  const record = useCallback(
    (rec: Cap4TradeRecord) => {
      setTrades(appendCap4TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
