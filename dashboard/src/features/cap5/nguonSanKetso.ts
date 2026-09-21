import { cap5Api } from "./api"
import type { Cap5PlanWire, HuntFilter } from "./types"

/**
 * NGUỒN SĂN của một lệnh cho màn Kết sổ (spec Cấp 5 §8) — MỘT chỗ duy nhất đọc
 * `GET /cap5/nguon-san/{symbol}` và dịch nó sang 3 trường của bản ghi.
 *
 * ★★ VÌ SAO LÀ MODULE DÙNG CHUNG (chứ không copy vào từng trang cấp):
 * **nguyên tắc cộng dồn**. `Cap6TradingPage` bọc `Cap5Provider` ⇒ `isCap5Active
 * === true` ⇒ `RightToolbar`/`RightSidebar` mọc đủ nút «Săn mã» + «Watchlist» ở
 * CẢ Cấp 6/7/8. Nghĩa là user Ở CẤP 6 VẪN SĂN MÃ được, và backend VẪN đóng dấu
 * `order_kehoach.hunt_filter` cho lệnh đó.
 *
 * Trước bản vá này, `KetsoModalCap6/7/8#buildRecord()` điền `huntFilter: null`
 * CỨNG kèm docstring "trang Cấp 6 KHÔNG có màn Săn mã" — một khẳng định SAI, và
 * `null` ở đó không phải "chưa biết": `coachTemplateCap5` đọc nó thành câu
 * "Mã này KHÔNG đến từ săn mã". Hai nguồn (server và bản ghi FE) nói khác nhau
 * về cùng một lệnh.
 *
 * ★★★ BA TRẠNG THÁI, KHÔNG HAI (luật số 1):
 *   · gọi được + `tu_san_ma`      ⇒ bộ lọc + số phiên chờ THẬT;
 *   · gọi được + KHÔNG từ săn     ⇒ `huntFilter: null` — nói thẳng "không đến từ
 *     săn mã" là ĐÚNG, vì ta vừa hỏi và server vừa trả lời như vậy;
 *   · gọi KHÔNG được (lỗi/timeout) ⇒ `huntNguonChuaBiet: true`. Gộp trạng thái
 *     này vào `huntFilter: null` sẽ biến một cú lỗi mạng thành lời khẳng định
 *     "bạn tự chọn mã này" — điều ta không hề biết.
 *
 * `so_lop_luc_vao` là snapshot tại BUY; wire legacy có thể trả `null`. Chép
 * nguyên và KHÔNG thay bằng điểm hôm nay.
 */
export interface NguonSanKetso {
  huntFilter: HuntFilter | null
  huntSoPhienCho: number | null
  huntSoLopLucVao: number | null
  /** Mẫu số thật tại BUY; optional để Cấp 6–8 cũ vẫn tương thích. */
  huntSoLopDaChamLucVao?: number | null
  huntNguonChuaBiet: boolean
}

/** Trạng thái "chưa biết nguồn săn" — dùng khi request lỗi. */
export const NGUON_SAN_CHUA_BIET: NguonSanKetso = {
  huntFilter: null,
  huntSoPhienCho: null,
  huntSoLopLucVao: null,
  huntSoLopDaChamLucVao: null,
  huntNguonChuaBiet: true,
}

/** Dịch snapshot `/cap5/plans/{buyOrderId}` sang ba trạng thái nguồn săn an toàn. */
export function nguonSanKetsoFromPlan(plan: Cap5PlanWire): NguonSanKetso {
  if (!plan.source_known || plan.from_watchlist == null) return NGUON_SAN_CHUA_BIET
  if (plan.tu_san_ma !== plan.from_watchlist) return NGUON_SAN_CHUA_BIET
  // Chỉ dùng đồng thuận khi đủ hai mốc chứng minh server đã đóng băng nó lúc
  // BUY. Plan lịch sử (`entry_snapshot_at=null`) phải giữ trạng thái chưa biết,
  // kể cả payload lệch phiên bản vô tình mang theo một con số.
  const coSnapshotDongThuan =
    plan.entry_snapshot_at != null && plan.consensus_captured_at_entry != null
  const soLopLucVao = coSnapshotDongThuan ? plan.so_lop_luc_vao : null
  const soLopDaChamLucVao = coSnapshotDongThuan ? plan.so_lop_da_cham_luc_vao : null
  if (!plan.from_watchlist) {
    return {
      huntFilter: null,
      huntSoPhienCho: null,
      huntSoLopLucVao: soLopLucVao,
      huntSoLopDaChamLucVao: soLopDaChamLucVao,
      huntNguonChuaBiet: false,
    }
  }
  // Một lệnh được đóng dấu "từ Watchlist" nhưng thiếu bộ lọc là snapshot một
  // phần. Không được biến nó thành lời khẳng định "không đến từ săn mã".
  if (plan.hunt_filter == null) return NGUON_SAN_CHUA_BIET
  return {
    huntFilter: plan.hunt_filter,
    huntSoPhienCho: plan.so_phien_trong_watchlist,
    huntSoLopLucVao: soLopLucVao,
    huntSoLopDaChamLucVao: soLopDaChamLucVao,
    huntNguonChuaBiet: false,
  }
}

/**
 * Đọc nguồn săn của `symbol`. KHÔNG BAO GIỜ throw: lệnh đã bán thì màn Kết sổ
 * VẪN phải mở — thiếu nguồn săn không được nuốt một lệnh.
 */
export async function fetchNguonSanKetso(symbol: string, orderId?: string): Promise<NguonSanKetso> {
  try {
    const ns = await cap5Api.getNguonSan(symbol, orderId)
    return {
      huntFilter: ns.tu_san_ma ? ns.hunt_filter : null,
      huntSoPhienCho: ns.so_phien_trong_watchlist,
      huntSoLopLucVao: ns.so_lop_luc_vao,
      // Endpoint cũ chưa có mẫu số immutable; không suy ra 5.
      huntSoLopDaChamLucVao: null,
      huntNguonChuaBiet: false,
    }
  } catch {
    return NGUON_SAN_CHUA_BIET
  }
}
