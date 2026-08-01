import { useCallback, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap6TradeRecord } from "@/features/cap6/tradeLogCap6"
import type { BandLuc, HanhViCo, LucDocUser } from "./types"

/**
 * Client-side closed-trade log cho Phân tích danh mục Cấp 7 (spec §7 khối ⑯⑰) —
 * mirror `cap6/tradeLogCap6.ts` một cấp lên, cùng cơ chế localStorage + de-dupe
 * theo `orderId`.
 *
 * **Cộng dồn ở tầng dữ liệu:** `Cap7TradeRecord extends Cap6TradeRecord` (chính
 * nó extends Cấp 5 → 4 → 3 → 2 → 1) — nhờ vậy `Cap7PortfolioAnalysis` truyền
 * THẲNG cùng một mảng xuống Cấp 6/5/4/3/2/1, không map/copy, và MỌI khối cũ
 * (①-⑮) vẫn tính được y như trước từ chính các bản ghi này.
 *
 * GAP (giống hệt gap Cấp 1-6 đã ghi, một cấp lên): backend Cấp 7 chỉ trả state
 * TỔNG HỢP (`GET /cap7/progress`, `GET /cap7/thach-thuc`) — không endpoint nào
 * liệt kê từng lệnh kèm `dien_bien_pct` và `hanh_vi_co` của nó. Hai thứ ⑯⑰ cần
 * mà tổng hợp không cho được là:
 *   · **xu hướng theo thời gian** của tỷ lệ đọc lực đúng (⑯) — cần thứ tự lệnh;
 *   · **so kết quả vào lệnh của hai nhóm cờ** (⑰) — cần `dien_bien_pct` tách
 *     theo `hanh_vi_co`.
 * Module này là workaround cho đúng hai thứ đó; `KetsoModalCap7` ghi 1
 * `Cap7TradeRecord` mỗi lần đóng Kết sổ (nó đang giữ đúng khối Đọc sổ lệnh của
 * lệnh vừa đóng).
 *
 * ★ Ngược lại, **tỷ lệ đọc lực đúng và 3 con số cờ thì KHÔNG tính lại ở đây**:
 * `GET /cap7/thach-thuc` đã trả về chúng (authoritative, ghép lệnh mua-bán
 * server-side, chấm bằng giá đóng cửa thật, và chính là con số nuôi nhiệm vụ ③).
 * Tính lại ở client sẽ sinh một con số thứ hai, lệch, có thể mâu thuẫn với widget
 * Thách thức — cùng tiền lệ khối ⑮ của Cấp 6, ⑬ của Cấp 5 và ⑨ của Cấp 4.
 *
 * KNOWN LIMITATION (như Cấp 1-6): không backfill được lệnh đóng trước khi tính
 * năng này ship, và là per-browser (không sync giữa thiết bị) — fix đúng là một
 * task BE sau này (vd. `GET /cap7/lenh`). Khối ⑯⑰ vì vậy nói thẳng "chưa đủ dữ
 * liệu" thay vì bịa số.
 */
export interface Cap7TradeRecord extends Cap6TradeRecord {
  /** `order_kehoach.luc_chi_so` — tổng dư MUA / tổng dư BÁN lúc mua. */
  lucChiSo: number | null
  /** Band SERVER suy ra từ `lucChiSo`. `null` = sổ quá mỏng để đọc. */
  lucBand: BandLuc | null
  /** `order_kehoach.luc_doc_user` — chính user đọc, hệ không bao giờ điền hộ. */
  lucDocUser: LucDocUser | null
  /**
   * `order_kehoach.doc_luc_dung`.
   *
   * ★ `null` = CHƯA TỚI HẠN CHẤM (hoặc chưa lấy được giá phiên đích), KHÔNG phải
   * "đọc sai". Mọi khối ở đây loại nó khỏi mẫu số thay vì tính ngược cho user.
   */
  docLucDung: boolean | null
  /** % giá đóng cửa phiên đích so với giá khớp — thước đo "vào giá tốt/xấu". */
  dienBienPct: number | null
  /** Cờ cảnh giác CÓ hiện lúc đặt lệnh hay không (heuristic, không phán quyết). */
  coCanhGiac: boolean | null
  /**
   * `order_kehoach.hanh_vi_co`.
   *
   * ★ `mua_duoi_theo` là một sự thật TRUNG TÍNH (spec §5 "không phạt cứng") — nó
   * chỉ quyết định lệnh vào nhóm nào ở khối ⑰, không bao giờ là một điểm trừ.
   */
  hanhViCo: HanhViCo | null
}

function tradesStorageKey(userId: string): string {
  return `iqx_cap7_trades_${userId}`
}

/** Reads the Cấp 7 trade log for `userId` from `localStorage`. Never throws. */
export function readCap7TradeLog(userId: string): Cap7TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(tradesStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Cap7TradeRecord[]) : []
  } catch {
    // Storage unavailable (SSR / private mode / disabled) or corrupt JSON —
    // degrade to empty history rather than throwing (mirrors Cấp 1-6).
    return []
  }
}

/**
 * Appends `record` to `userId`'s Cấp 7 trade log (de-duplicated by `orderId` —
 * a re-render/re-mount must never double-count the same closed order) and
 * persists it. Returns the updated list.
 */
export function appendCap7TradeRecord(
  userId: string,
  record: Cap7TradeRecord,
): Cap7TradeRecord[] {
  const existing = readCap7TradeLog(userId)
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

export interface UseCap7TradeLogReturn {
  trades: Cap7TradeRecord[]
  /** Appends a newly-closed trade to the log (call once per Kết sổ). */
  record: (record: Cap7TradeRecord) => void
}

/** React binding over the Cấp 7 trade log, scoped to the current auth user. */
export function useCap7TradeLog(): UseCap7TradeLogReturn {
  const { user } = useAuth()
  const userId = user?.id ?? "anon"
  const [trades, setTrades] = useState<Cap7TradeRecord[]>(() => readCap7TradeLog(userId))

  const record = useCallback(
    (rec: Cap7TradeRecord) => {
      setTrades(appendCap7TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
