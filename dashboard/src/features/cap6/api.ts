import { api, unwrap } from "@/shared/http/client"
import type {
  KehoachMauThuanCap6,
  KehoachMauThuanInput,
  MauThuanCap6,
  PhanTichCap6,
  SkipCap6Input,
} from "./mauThuanTypes"
import type { Cap6Progress } from "./types"

/**
 * Cấp 6 «Bậc thầy» API — server-owned conflict handling under `/cap6/*`.
 * Payloads are un-enveloped; `unwrap` is applied defensively.
 */
export const cap6Api = {
  /** GET /cap6/progress → the row, or null if the user hasn't entered yet. */
  getProgress: async (): Promise<Cap6Progress | null> => {
    const res = await api.get("cap6/progress").json<unknown>()
    return (unwrap(res as never) ?? null) as Cap6Progress | null
  },

  /** POST /cap6/enter — idempotent; requires Cấp 5 already graduated. */
  enter: async (): Promise<Cap6Progress> => {
    const res = await api.post("cap6/enter").json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },



  /** POST /cap6/graduate — only succeeds at 3/3 consistent conflict-handling events. */
  graduate: async (): Promise<Cap6Progress> => {
    const res = await api.post("cap6/graduate").json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },


  // ── CẤP 6 «BẬC THẦY» (spec đợt 7) ─────────────────────────────────────────

  /**
   * GET /cap6/mau-thuan/{symbol} — bức tranh 5 lớp CHIA PHE của một mã (spec §5).
   *
   * ★ Toàn bộ việc phân loại (phe ủng hộ / phe ngược / lớp nào phủ quyết / bậc
   * nào là "rất xấu") do SERVER quyết — FE không giữ bản sao thứ hai của một
   * quan điểm đầu tư còn đang mở (spec §12.1).
   *
   * ★ `chua_du_du_lieu` là một 200 BÌNH THƯỜNG, không phải lỗi: AI Insight KHÔNG
   * chạy cho mã user chưa từng xem (spec §11). Nó KHÁC "không có mâu thuẫn".
   */
  getMauThuan: async (symbol: string): Promise<MauThuanCap6> => {
    const res = await api.get(`cap6/mau-thuan/${symbol}`).json<unknown>()
    return unwrap(res as never) as MauThuanCap6
  },

  /**
   * POST /cap6/kehoach — ghi MỨC NHẬN ĐỊNH mâu thuẫn lên hàng kế hoạch của lệnh
   * mua (spec §6/§11). Chạy SAU khi lệnh đã khớp, nên caller PHẢI bọc
   * `ghiKehoachKhongChiMang`: một lỗi ở đây từng nuốt cả event bus "lệnh đã
   * khớp" và làm KHÔNG cấp nào mở được Kết sổ.
   */
  recordKehoachMauThuan: async (input: KehoachMauThuanInput): Promise<unknown> => {
    const res = await api.post("cap6/kehoach", { json: input }).json<unknown>()
    return unwrap(res as never)
  },

  /**
   * POST /cap6/skip — ghi nhận quyết định "Không mua lần này" (spec §7).
   *
   * Lý do lấy CHÍNH mức nhận định user đã chọn ở trên, không hỏi thêm. IQX KHÔNG
   * theo dõi giá mã sau đó (spec §7 "tránh dạy tiếc nuối", §13 ngoài phạm vi).
   */
  skip: async (input: SkipCap6Input): Promise<unknown> => {
    const res = await api.post("cap6/skip", { json: input }).json<unknown>()
    return unwrap(res as never)
  },

  /**
   * GET /cap6/kehoach/{order_id} — các cột Cấp 6 ĐÃ LƯU của một lệnh (spec §8).
   *
   * ★ Kết sổ đọc khối "nhận định vs hành động" TỪ ĐÂY, không suy lại ở client:
   * suy lại thì mỗi lần mở Kết sổ ra một con số khác.
   *
   * **404** cho lệnh lạ / user chưa có hàng tiến độ Cấp 6 — caller gác trên
   * `isCap6Active` và degrade IM LẶNG (modal Kết sổ `closable={false}`, nên nó
   * KHÔNG được phụ thuộc vào call này).
   */
  getKehoachMauThuan: async (orderId: string): Promise<KehoachMauThuanCap6> => {
    const res = await api.get(`cap6/kehoach/${orderId}`).json<unknown>()
    return unwrap(res as never) as KehoachMauThuanCap6
  },

  /** GET /cap6/phan-tich — khối ⑭ + ⑮ của Phân tích danh mục (spec §9). */
  getPhanTich: async (): Promise<PhanTichCap6> => {
    const res = await api.get("cap6/phan-tich").json<unknown>()
    return unwrap(res as never) as PhanTichCap6
  },

  /** POST /cap6/tour-mauthuan — đánh dấu ĐÃ ĐI HẾT tour «Xử lý mâu thuẫn». */
  markTourMauThuan: async (): Promise<Cap6Progress> => {
    const res = await api.post("cap6/tour-mauthuan").json<unknown>()
    return unwrap(res as never) as Cap6Progress
  },
}
