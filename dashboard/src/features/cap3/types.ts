/**
 * Cấp 3 «Bản lĩnh» — shared types.
 *
 * Wire shapes mirror the backend `Cap3*` schemas 1:1
 * (`backend/app/schemas/cap3.py`) — see that module + `backend/app/models/cap1.py`'s
 * `KhauViRuiRo`/`CachKhoiLuong` enums (Cấp 3's khẩu vị/cách khối lượng enums
 * live there since they decorate `OrderKehoach` columns, not a Cấp-3-only
 * table) for the canonical wire values this file's unions repeat.
 */

/** spec §5.1 — 3-mức khẩu vị rủi ro (% vốn tối đa/lệnh, trần). */
export type KhauViLoai = "than_trong" | "can_bang" | "tan_cong"

/** spec §6.2 — 3-mức tự tin (1=Thấp ⭐ / 2=Vừa ⭐⭐ / 3=Cao ⭐⭐⭐). */
export type MucTuTin = 1 | 2 | 3

/** spec §6.3 — 2 cách khối lượng, chọn 1. */
export type CachKhoiLuong = "linh_hoat" | "ky_luat"

/** Progress row for the current user's Cấp 3 (one per user). */
export interface Cap3Progress {
  id: string
  user_id: string
  entered_at: string
  khau_vi_da_dat: boolean
  khau_vi: KhauViLoai | null
  von_ban_dau: number
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  so_lenh_cap3: number
  lai_pct_cap3: number
  diem_ky_luat_tb_cap3: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * How many of the 3 Cấp 3 nhiệm vụ are complete (mirrors
 * `cap2/types.ts`'s `countCap2TasksDone`) — used by `JourneyPanelCap3`'s
 * checklist header/ring and by `GraduationModalCap3`'s open condition.
 */
export function countCap3TasksDone(progress: Cap3Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at, progress.task_3_done_at].filter(
    (t) => t != null,
  ).length
}

export interface KehoachInputCap3 {
  order_id: string
  khau_vi: KhauViLoai
  muc_tu_tin: MucTuTin
  cach_khoi_luong: CachKhoiLuong
  khoi_luong: number
  pct_von: number
}

/** Cấp 3's view of `order_kehoach` — Cấp 1's fields + the quản lý vốn block. */
export interface OrderKehoachCap3 {
  id: string
  order_id: string
  vung_mua: number
  khau_vi: KhauViLoai | null
  muc_tu_tin: number | null
  cach_khoi_luong: CachKhoiLuong | null
  khoi_luong: number | null
  pct_von: number | null
}

/** One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Bản lĩnh
 * (§C12c: always shown with its current value + a short explanation). */
export interface ThachThucDieuKienCap3 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  giai_thich: string
}

/** Response for `GET /cap3/thach-thuc`. */
export interface ThachThucCap3 {
  dat_ca_3: boolean
  lai_pct: ThachThucDieuKienCap3
  so_lenh: ThachThucDieuKienCap3
  diem_ky_luat: ThachThucDieuKienCap3
}
