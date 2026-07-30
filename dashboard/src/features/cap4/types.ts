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

/** Progress row for the current user's Cấp 4 (one per user). */
export interface Cap4Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  /** ③ đk 1 — số lệnh đã đọc + tự chấm đủ cả 5 lớp. */
  so_lenh_doc_du_5lop: number
  /** ③ đk 2 — lớp bạn đọc chuẩn nhất (null khi chưa đủ dữ liệu). */
  vu_khi_lop: Lop | null
  /** ③ đk 2 — lớp cần cải thiện (null khi chưa đủ dữ liệu). */
  diem_mu_lop: Lop | null
  /** ③ đk 3 — % thắng của lệnh có ≥3 lớp được đánh giá Ủng hộ. */
  ty_le_thang_dong_thuan_cao: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * How many of the 3 Cấp 4 nhiệm vụ are complete (mirrors
 * `cap3/types.ts#countCap3TasksDone`) — used by FE3's `JourneyPanelCap4`
 * checklist + `GraduationModalCap4`'s open condition.
 */
export function countCap4TasksDone(progress: Cap4Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at, progress.task_3_done_at].filter(
    (t) => t != null,
  ).length
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

/** One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Thuần thục (§C12c). */
export interface ThachThucDieuKienCap4 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  giai_thich: string
}

/** Response for `GET /cap4/thach-thuc`. */
export interface ThachThucCap4 {
  dat_ca_3: boolean
  so_lenh_doc_du_5lop: ThachThucDieuKienCap4
  vu_khi_diem_mu: ThachThucDieuKienCap4
  ty_le_thang_dong_thuan_cao: ThachThucDieuKienCap4
}
