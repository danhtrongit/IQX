import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/features/auth"
import type { Cap2TradeRecord } from "@/features/cap2/portfolioAnalysisCap2"
import type { CachKhoiLuong, Cap3TradeWire, KhauViLoai, MucTuTin } from "./types"

/**
 * Local fallback log cho Phân tích danh mục Cấp 3 (spec §8 khối ⑦/⑧).
 * `Cap3PortfolioAnalysisPanel` ưu tiên `GET /cap3/trades/analysis`; dữ liệu
 * này chỉ dùng khi request server đang tải hoặc không khả dụng.
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
 * `KetsoModalCap3` vẫn ghi local để trải nghiệm không mất dữ liệu tức thời khi
 * telemetry/history endpoint lỗi; lần tải server thành công kế tiếp sẽ thay
 * toàn bộ fallback bằng lịch sử cross-device.
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

export function cachKhoiLuongFromWire(
  value: Cap3TradeWire["cach_khoi_luong"],
): CachKhoiLuong | null {
  if (value == null) return null
  return value === "khau_vi_tu_tin" ? "linh_hoat" : "ky_luat"
}

/** Convert one authoritative wire row into the cumulative analysis record. */
export function cap3TradeFromWire(row: Cap3TradeWire): Cap3TradeRecord | null {
  if (
    row.khau_vi == null ||
    row.muc_tu_tin == null ||
    row.cach_khoi_luong == null ||
    row.khoi_luong == null ||
    row.pct_von == null
  ) {
    return null
  }
  return {
    orderId: row.sell_order_id,
    lyDo: row.lyDo,
    trangThaiLucDat: row.trangThai_luc_dat,
    pnlPct: row.pnl_pct,
    pnlVnd: row.pnl_vnd,
    closedAt: row.closed_at,
    chamSlKhongCat: row.cham_SL_khong_cat,
    chamTpGiuLamHut: row.cham_TP_giu_lam_hut,
    banSomKhiLoNhe: row.ban_som_khi_lo_nhe,
    nhoiLenhKhiLo: row.nhoi_lenh_khi_lo,
    ghiChuNhinLai: row.ghi_chu_nhin_lai,
    khauVi: row.khau_vi,
    mucTuTin: row.muc_tu_tin,
    cachKhoiLuong: cachKhoiLuongFromWire(row.cach_khoi_luong)!,
    khoiLuong: row.khoi_luong,
    pctVon: row.pct_von,
  }
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

  // Auth can resolve after the app shell has mounted, and the same component
  // can also survive an account switch. Reload the per-user log whenever the
  // storage namespace changes so one user's analysis never carries into the
  // next user's session.
  useEffect(() => {
    setTrades(readCap3TradeLog(userId))
  }, [userId])

  const record = useCallback(
    (rec: Cap3TradeRecord) => {
      setTrades(appendCap3TradeRecord(userId, rec))
    },
    [userId],
  )

  return { trades, record }
}
