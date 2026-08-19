import type { Lop, NhanDinhLop } from "@/features/cap4/types"
import { LOP_DEFS } from "@/features/cap4/doc5Lop"
import { huntFilterLabel, type HuntFilterKey } from "./sanMaTypes"

/**
 * Cấp 5 «Lão luyện» — WATCHLIST nâng cấp (spec §6, mockup
 * `iqx-cap5-watchlist.html`): hình dạng wire + helper THUẦN.
 *
 * ★★ Vì sao KHÔNG sửa `features/watchlist/WatchlistPanel.tsx`:
 * panel đó DÙNG CHUNG cho `/bieu-do`, `/co-phieu` và cả chín shell cấp; nhiệm
 * vụ ③ của Cấp 0 («Xem tab Theo dõi») bắn qua `onPortfolioTabOpen` từ chính
 * nó, khoá localStorage nhớ tab và `data-tour-id` của tour Bảng điện cũng nằm
 * ở đó. Watchlist Cấp 5 là một panel RIÊNG (`Cap5WatchlistPanel`), chỉ sống
 * khi `isCap5Active` — Cấp 0-4 và hai trang kia giữ NGUYÊN hành vi cũ.
 *
 * ─── GIẢ ĐỊNH WIRE (BE làm song song) ───────────────────────────────────────
 * `GET  /cap5/watchlist` → `Cap5WatchlistItem[]`
 * `POST /cap5/watchlist` { symbol, hunt_filter, hunt_signal }
 * `DELETE /cap5/watchlist/{symbol}`
 *
 * ★ 5 lớp: `null` cho một lớp nghĩa là CHƯA CÓ DỮ LIỆU (khảo sát Cấp 5: lớp
 * 💎 Định giá lấy từ BCTC premium, rất nhiều mã sẽ không có). `null` TUYỆT ĐỐI
 * không được quy về "không ủng hộ" khi đếm "X/5" — nó phải hiện là chưa rõ và
 * phải kéo theo lời cảnh báo "chưa chấm đủ 5 lớp".
 */

/** Trạng thái một mã trong watchlist — DẪN XUẤT, không đọc từ server. */
export type Cap5WatchStatus = "chua_cham" | "watching" | "notable"

/** spec §6.1 — ngưỡng "★ Đáng chú ý". */
export const NOTABLE_MIN_LOP = 4

/** Tổng số lớp (spec §5.1 Cấp 4). */
export const TONG_SO_LOP = 5

export interface Cap5WatchlistItem {
  symbol: string
  /** `created_at` của hàng `watchlist_items`. */
  added_at?: string | null
  /** Bộ lọc đã săn ra mã; `null` = mã được thêm tay, không qua săn. */
  hunt_filter: HuntFilterKey | null
  /** Tín hiệu thô lúc săn, VD "+45,2 tỷ ròng · 4/5 phiên". */
  hunt_signal: string | null
  /** Thời điểm săn (cột `hunt_at`). */
  hunt_at?: string | null
  /** Số phiên kể từ lúc săn. `null`/thiếu = server chưa tính được (≠ 0 phiên). */
  so_phien_tu_khi_san?: number | null
  /**
   * Chấm từng lớp. Server hiện chỉ lưu SỐ ĐẾM (`consensus_today`), nên cụm này
   * thường vắng — khi vắng, cả 5 icon hiện dấu "–" (chưa rõ) chứ KHÔNG ⚪.
   */
  lop?: Partial<Record<Lop, NhanDinhLop | null>> | null
  /** Số lớp ủng hộ hôm nay. `null` = hệ CHƯA chấm được mã này (≠ 0). */
  consensus_today: number | null
  /** Số lớp ủng hộ lần chấm trước. `null` = chưa có lần trước để so. */
  consensus_prev: number | null
  /** Thời điểm chấm gần nhất (batch 1 lần/ngày sau phiên — spec §6.1/§10). */
  consensus_at?: string | null
  /**
   * `status` của server ('watching'/'notable'/NULL). ADVISORY — hiển thị dùng
   * `cap5WatchStatus()` dẫn xuất từ `consensus_today` để chỉ có MỘT nguồn sự
   * thật; giữ trường ở đây cho khớp wire.
   */
  status?: "watching" | "notable" | null
}

/* ─────────────────────────────── Helper thuần ──────────────────────────── */

/**
 * spec §6.1 — trạng thái hiển thị. CHƯA chấm là một trạng thái RIÊNG: gọi nó
 * là "Đang quan sát" sẽ ngầm khẳng định "đã chấm và chưa đủ 4 lớp", tức là bịa
 * ra một kết quả chấm chưa từng có.
 */
export function cap5WatchStatus(item: Cap5WatchlistItem): Cap5WatchStatus {
  if (item.consensus_today == null) return "chua_cham"
  return item.consensus_today >= NOTABLE_MIN_LOP ? "notable" : "watching"
}

export const CAP5_WATCH_STATUS_LABEL: Record<Cap5WatchStatus, string> = {
  chua_cham: "Chưa chấm 5 lớp",
  watching: "Đang quan sát",
  notable: "★ Đáng chú ý",
}

/** Đếm số lớp CHƯA có dữ liệu (thiếu key hoặc `null`). `null` = chưa chấm gì. */
export function soLopChuaRo(item: Cap5WatchlistItem): number | null {
  if (item.lop == null) return null
  let n = 0
  for (const def of LOP_DEFS) {
    if (item.lop[def.lop] == null) n++
  }
  return n
}

/**
 * Dòng điểm đồng thuận. `text` là chuỗi hiện cạnh cụm icon.
 * ★ Khi còn lớp chưa rõ, "X/5" một mình là lời nói dối ngầm (ngụ ý 5-X lớp đã
 * được chấm là KHÔNG ủng hộ) — nên kèm luôn cảnh báo số lớp chưa có dữ liệu.
 */
export function describeConsensus(item: Cap5WatchlistItem): {
  text: string
  canhBao: string | null
} {
  if (item.consensus_today == null) {
    return { text: "—/5", canhBao: "Chưa chấm 5 lớp cho mã này" }
  }
  const chuaRo = soLopChuaRo(item)
  return {
    text: `${item.consensus_today.toLocaleString("en-US")}/${TONG_SO_LOP}`,
    canhBao:
      chuaRo != null && chuaRo > 0
        ? `${chuaRo.toLocaleString("en-US")} lớp chưa có dữ liệu — chưa chấm đủ 5 lớp`
        : null,
  }
}

export type TrendTone = "up" | "down" | "flat" | "unknown"

/**
 * spec §6.2 "Dòng thay đổi": "3/5 → 4/5 (cải thiện)".
 *
 * ★ Mockup có thêm "(3 phiên)" ở vài thẻ. Số phiên KỂ TỪ LÚC ĐỔI ĐIỂM không
 * có trên wire (server chỉ lưu `consensus_prev` = phiên liền trước), nên ta
 * KHÔNG in nó ra — thà thiếu một cụm phụ còn hơn bịa một con số.
 */
export function describeConsensusTrend(item: Cap5WatchlistItem): {
  text: string
  tone: TrendTone
} {
  const now = item.consensus_today
  const prev = item.consensus_prev
  if (now == null) return { text: "chưa chấm lần nào", tone: "unknown" }
  if (prev == null) return { text: "chưa có phiên trước để so", tone: "unknown" }
  const head = `${prev}/${TONG_SO_LOP} → ${now}/${TONG_SO_LOP}`
  if (now > prev) return { text: `${head} (cải thiện)`, tone: "up" }
  if (now < prev) return { text: `${head} (yếu đi)`, tone: "down" }
  return { text: `${head} (đi ngang)`, tone: "flat" }
}

/**
 * spec §6.2 "Nguồn săn": "Săn từ [bộ lọc] · N phiên trước".
 * Thiếu bộ lọc → nói thẳng là thêm tay; thiếu số phiên → lùi về NGÀY THÊM thật
 * (ngày vi-VN theo luật số 8), không bịa "0 phiên trước".
 */
export function describeHuntSource(item: Cap5WatchlistItem): string {
  const ten = huntFilterLabel(item.hunt_filter)
  const nguon = ten ? `Săn từ ${ten}` : "Thêm tay — không qua bộ lọc săn"
  if (item.so_phien_tu_khi_san != null) {
    return `${nguon} · ${item.so_phien_tu_khi_san.toLocaleString("en-US")} phiên trước`
  }
  const raw = item.hunt_at ?? item.added_at ?? null
  const d = raw ? new Date(raw) : null
  if (d && !Number.isNaN(d.getTime())) {
    return `${nguon} · thêm ngày ${d.toLocaleDateString("vi-VN")}`
  }
  return nguon
}

/** Ký hiệu một lớp: ✅ ủng hộ · ⚠ ngược chiều · ⚪ trung tính · – CHƯA RÕ. */
export function lopMark(nhan: NhanDinhLop | null | undefined): string {
  if (nhan === "ok") return "✅"
  if (nhan === "bad") return "⚠"
  if (nhan === "neu") return "⚪"
  return "–"
}

/** Cụm icon 5 lớp theo đúng thứ tự chuẩn `LOP_DEFS`. */
export function lopIconRow(item: Cap5WatchlistItem): { lop: Lop; icon: string; mark: string }[] {
  return LOP_DEFS.map((def) => ({
    lop: def.lop,
    icon: def.icon,
    mark: lopMark(item.lop?.[def.lop] ?? null),
  }))
}

/** Đếm cho hai tab (spec §6.3). */
export function countWatchTabs(items: readonly Cap5WatchlistItem[]): {
  tatCa: number
  dangChuY: number
} {
  return {
    tatCa: items.length,
    dangChuY: items.filter((i) => cap5WatchStatus(i) === "notable").length,
  }
}
