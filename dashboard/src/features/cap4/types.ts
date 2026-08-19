import type { LyDo } from "@/features/cap1/types"

/**
 * Cấp 4 «Thuần thục» — shared types.
 *
 * Wire shapes mirror the backend `Cap4*` schemas 1:1
 * (`backend/app/schemas/cap4.py`), whose own `LopLiteral`/`NhanDinhLiteral`
 * come from `backend/app/models/cap4.py`.
 */

/**
 * spec §5.1 — the 5 lớp (L1 Kỹ thuật · L3 Dòng tiền · L4 Nội bộ · L5 Tin tức ·
 * Định giá).
 *
 * They are EXACTLY Cấp 1's 5 `LyDo` keys, so this is an alias rather than a
 * re-declared union — the backend does the same (`LOP_KEYS` is derived from
 * `LyDo` "so the two can never drift", see `app/models/cap4.py`). Cấp 4
 * replaces "pick 1 of 5 lý do" with "rate all 5 lớp", so the vocabulary is
 * deliberately identical.
 */
export type Lop = LyDo

/** spec §5.1/§8 — the 3 mức each lớp is rated at (user's OR AI's, reduced). */
export type NhanDinhLop = "ok" | "neu" | "bad"

/** All 5 lớp rated. */
export type Lop5Map = Record<Lop, NhanDinhLop>

/** Some (possibly zero) lớp rated — the in-progress shape while reading. */
export type Lop5Partial = Partial<Record<Lop, NhanDinhLop>>

/** spec §7 khối ⑨ — a lớp's label after enough evidence (≥3 closed lệnh). */
export type NhanVuKhi = "vu_khi" | "diem_mu" | "chua_du_du_lieu"

/**
 * Số nhiệm vụ của Cấp 4 — MỘT. Mockup `iqx-cap4-hanhtrinh.html`: `.jbar`
 * "CẤP 4 · 0/1" và `.ck-head` "Trước khi lên Cấp 5 · 0/1".
 */
export const CAP4_TOTAL_TASKS = 1

/**
 * Ngưỡng của nhiệm vụ duy nhất — «Đọc và chấm đủ 5 lớp qua 20 lệnh»
 * (`Cap4Service._TASK1_SO_LENH_MIN`). FE chỉ dùng để VẼ tiến độ `n/20`; server
 * mới là nơi quyết định `task_1_done_at`.
 */
export const CAP4_SO_LENH_TARGET = 20

/**
 * Progress row for the current user's Cấp 4 (one per user).
 *
 * ★ Hình dạng MỚI — 1 nhiệm vụ. `task_2_done_at`/`task_3_done_at`/
 * `ty_le_thang_dong_thuan_cao` đã bị gỡ khỏi cả DB lẫn wire (migration
 * `a3f7c1d9e2b8`); đừng dựng lại chúng ở FE.
 */
export interface Cap4Progress {
  id: string
  user_id: string
  entered_at: string
  /** Nhiệm vụ DUY NHẤT — «Đọc và chấm đủ 5 lớp qua 20 lệnh». */
  task_1_done_at: string | null
  /** Số lệnh đã đọc + tự chấm đủ cả 5 lớp — tử số của `n/20`. */
  so_lenh_doc_du_5lop: number
  /**
   * Lớp bạn đọc chuẩn nhất — `null` = CHƯA ĐỦ DỮ LIỆU để kết luận (cần ≥3 lệnh
   * đã đóng cho lớp đó), KHÔNG phải "không có". Không còn là điều kiện tốt
   * nghiệp; vẫn hiện ở Phân tích danh mục (khối ⑨) + màn tốt nghiệp.
   */
  vu_khi_lop: Lop | null
  /** Lớp cần cải thiện — cùng quy ước `null` như `vu_khi_lop`. */
  diem_mu_lop: Lop | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * How many of the Cấp 4 nhiệm vụ are complete — 0 hoặc 1 (mirrors
 * `cap3/types.ts#countCap3TasksDone`). Dùng cho checklist `JourneyPanelCap4`
 * + điều kiện mở `GraduationModalCap4`.
 */
export function countCap4TasksDone(progress: Cap4Progress | null | undefined): number {
  if (!progress) return 0
  return progress.task_1_done_at != null ? 1 : 0
}

/**
 * `POST /cap4/kehoach` — the khối "Đọc 5 lớp" appended to the `order_kehoach`
 * row Cấp 1 already created for this BUY.
 *
 * `ai_5_lop` is `null` only while the AI đối chiếu has not been revealed (i.e.
 * the user did not rate all 5 lớp) — and in that case the server leaves
 * `so_lop_dong_thuan` NULL, so the order never counts toward nhiệm vụ ③. Send
 * both blobs whenever the reveal happened.
 *
 * `so_lop_dong_thuan`/`so_lop_khac_ai` are ADVISORY: the server always
 * re-derives them from the two blobs (see `Cap4Service.record_kehoach`).
 */
export interface KehoachInputCap4 {
  order_id: string
  doc_5_lop: Lop5Partial
  ai_5_lop: Lop5Partial | null
  so_lop_dong_thuan: number
  so_lop_khac_ai: number
}

/** Cấp 4's view of `order_kehoach` — Cấp 1's fields + the đọc-5-lớp block. */
export interface OrderKehoachCap4 {
  id: string
  order_id: string
  vung_mua: number
  doc_5_lop: Lop5Partial | null
  ai_5_lop: Lop5Partial | null
  so_lop_dong_thuan: number | null
  so_lop_khac_ai: number | null
}

/**
 * One lớp's REAL win rate when the user self-rated it Ủng hộ (spec §7 khối ⑨).
 * §C12c: `n_orders`/`n_wins` are the raw counts behind `win_rate`, and
 * `giai_thich` spells the whole thing out in plain Vietnamese.
 */
export interface LopWinRate {
  lop: Lop
  ten: string
  n_orders: number
  n_wins: number
  win_rate: number | null
  nhan: NhanVuKhi | null
  giai_thich: string
}

/** Response for `GET /cap4/vu-khi-diem-mu` — per-lớp rows sorted by win rate. */
export interface VuKhiDiemMuCap4 {
  lop: LopWinRate[]
  vu_khi_lop: Lop | null
  diem_mu_lop: Lop | null
  so_lenh_toi_thieu: number
  nguong_vu_khi: number
  nguong_diem_mu: number
  giai_thich: string
}
