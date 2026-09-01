/** Cấp 3 «Bản lĩnh» wire types. */

export type KhauViLoai = "than_trong" | "can_bang" | "tan_cong"
export type MucTuTin = 1 | 2 | 3
export type CachKhoiLuong = "linh_hoat" | "ky_luat"

/** Server-derived journey evidence and retained learning analytics. */
export interface Cap3Progress {
  id: string
  user_id: string
  entered_at: string
  khau_vi_da_dat: boolean
  khau_vi: KhauViLoai | null
  von_ban_dau: number
  task_1_done_at: string | null
  task_2_done_at: string | null
  so_lenh_quan_ly_von: number
  muc_tu_tin_da_dung: MucTuTin[]
  so_muc_tu_tin_da_dung: number
  so_lenh_cap3: number
  lai_pct_cap3: number
  diem_ky_luat_tb_cap3: number | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export function countCap3TasksDone(progress: Cap3Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at].filter((doneAt) => doneAt != null).length
}

export interface KehoachInputCap3 {
  order_id: string
  khau_vi: KhauViLoai
  muc_tu_tin: MucTuTin
  cach_khoi_luong: CachKhoiLuong
  khoi_luong: number
  pct_von: number
}

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
