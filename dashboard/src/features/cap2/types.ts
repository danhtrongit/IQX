/**
 * Cấp 2 «Kỷ luật» — shared types.
 *
 * Wire shapes mirror the backend `Cap2*` schemas 1:1
 * (`backend/app/schemas/cap2.py`). The `cham_SL_*`/`cham_TP_*` fields
 * intentionally keep the spec's exact (mixed-case) wire field names — same
 * convention `cap1/types.ts`'s `lyDo`/`trangThai_luc_dat` already uses (see
 * `backend/app/schemas/cap2.py`'s own docstring for why).
 */

export type PhuongPhapSlTp = "ho_tro_khang_cu" | "bien_do_dao_dong"
export type XepLoai = "xanh" | "vang" | "do"

/** Behaviour-progress row for the current user's Cấp 2 (one per user). */
export interface Cap2Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  task_5_done_at: string | null
  /** 🔥 chuỗi lệnh kỷ luật hiện tại (spec §6) — resets to 0 on any vi phạm. */
  chuoi_current: number
  /** Kỷ lục chuỗi cao nhất từng đạt. */
  chuoi_record: number
  last_chuoi_reset_at: string | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export interface KehoachInputCap2 {
  order_id: string
  phuong_phap_sl_tp: PhuongPhapSlTp
  cat_lo: number
  chot_loi: number
}

/** Cấp 2's view of `order_kehoach` — Cấp 1's fields + the SL/TP commitment. */
export interface OrderKehoachCap2 {
  id: string
  order_id: string
  vung_mua: number
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
}

export interface KetsoInputCap2 {
  order_id: string
  cham_SL_cuoi_phien?: boolean
  cham_SL_cat_dung_phien_ke?: boolean
  cham_SL_khong_cat?: boolean
  giu_cham_SL_bao_nhieu_phien?: number | null
  cham_TP_giu_lam_hut?: boolean
  ban_som_khi_lo_nhe?: boolean
  nhoi_lenh_khi_lo?: boolean
}

/** Cấp 2's view of `order_ketso` — Cấp 1's fields + the 7 discipline flags. */
export interface OrderKetsoCap2 {
  id: string
  order_id: string
  gia_ra: number
  pnl_pct: number
  pnl_vnd: number
  closed_at: string
  cham_SL_cuoi_phien: boolean
  cham_SL_cat_dung_phien_ke: boolean
  cham_SL_khong_cat: boolean
  giu_cham_SL_bao_nhieu_phien: number | null
  cham_TP_giu_lam_hut: boolean
  ban_som_khi_lo_nhe: boolean
  nhoi_lenh_khi_lo: boolean
}

/** Breakdown of the 0-100 điểm kỷ luật formula — §C12c "số đến từ đâu". */
export interface DiemKyLuatThanhPhan {
  ke_hoach: number
  ke_hoach_toi_da: number
  cat_lo_dung: number
  cat_lo_dung_toi_da: number
  khong_nhoi: number
  khong_nhoi_toi_da: number
  chot_loi_dung: number
  chot_loi_dung_toi_da: number
}

/** Response for `GET /cap2/diem-ky-luat` — score + explanation + breakdown. */
export interface DiemKyLuat {
  ngay: string
  co_giao_dich: boolean
  co_tinh_huong: boolean
  diem: number | null
  xep_loai: XepLoai | null
  giai_thich: string
  thanh_phan: DiemKyLuatThanhPhan | null
}

/**
 * spec §5.4 "cổng cứng": nút ĐẶT LỆNH MUA khóa cho đến khi chọn 1 trong 2
 * cách cắt lỗ/chốt lời. Hợp lệ: đã chọn 1 cách VÀ cat_lo/chot_loi > 0.
 */
export function isSlTpValid(
  phuongPhap: PhuongPhapSlTp | null,
  catLo: number | null,
  chotLoi: number | null,
): boolean {
  return phuongPhap != null && catLo != null && catLo > 0 && chotLoi != null && chotLoi > 0
}

/**
 * How many of the 5 Cấp 2 nhiệm vụ are complete (mirrors `cap1/types.ts`'s
 * `countCap1TasksDone`) — used by `JourneyPanelCap2` (later task).
 */
export function countCap2TasksDone(progress: Cap2Progress | null | undefined): number {
  if (!progress) return 0
  return (
    [
      progress.task_1_done_at,
      progress.task_2_done_at,
      progress.task_3_done_at,
      progress.task_4_done_at,
      progress.task_5_done_at,
    ].filter((t) => t != null).length
  )
}
