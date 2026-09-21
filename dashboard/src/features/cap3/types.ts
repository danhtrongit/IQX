/** Cấp 3 «Bản lĩnh» wire types. */

export type KhauViLoai = "than_trong" | "can_bang" | "tan_cong"
export type MucTuTin = 1 | 2 | 3
export type CachKhoiLuong = "linh_hoat" | "ky_luat"
export type CachKhoiLuongWire = "khau_vi_tu_tin" | "chia_deu"

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

/** Authoritative closed-trade row returned by `GET /cap3/trades*`. */
export interface Cap3TradeWire {
  buy_order_id: string
  sell_order_id: string
  matched_by: "snapshot" | "symbol_fallback"
  symbol: string
  quantity: number
  bought_at: string
  closed_at: string
  gia_vao: number | null
  gia_ra: number
  pnl_pct: number
  pnl_vnd: number
  lyDo: import("@/features/cap1/types").LyDo
  trangThai_luc_dat: import("@/features/cap1/types").TrangThaiLucDat
  vung_mua: number
  cam_xuc: import("@/features/cap1/types").CamXuc | null
  phuong_phap_sl_tp: import("@/features/cap2/types").PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
  cham_SL_cuoi_phien: boolean
  cham_SL_cat_dung_phien_ke: boolean
  cham_SL_khong_cat: boolean
  giu_cham_SL_bao_nhieu_phien: number | null
  cham_TP_giu_lam_hut: boolean
  ban_som_khi_lo_nhe: boolean
  nhoi_lenh_khi_lo: boolean
  ghi_chu_nhin_lai: string | null
  khau_vi: KhauViLoai | null
  muc_tu_tin: MucTuTin | null
  cach_khoi_luong: CachKhoiLuongWire | null
  khoi_luong: number | null
  pct_von: number | null
}

export interface Cap3ConfidenceAnalysisWire {
  muc_tu_tin: MucTuTin
  count: number
  wins: number
  win_rate: number | null
  avg_pnl_pct: number | null
  avg_khoi_luong: number | null
  avg_pct_von: number | null
}

export interface Cap3TradesAnalysis {
  trades: Cap3TradeWire[]
  total: number
  by_confidence: Cap3ConfidenceAnalysisWire[]
}

/** Cumulative BUY commitment used to rebuild Kết sổ after a reload. */
export interface Cap3PlanWire {
  id: string
  order_id: string
  symbol: string
  quantity: number
  bought_at: string
  gia_vao: number
  lyDo: import("@/features/cap1/types").LyDo
  trangThai_luc_dat: import("@/features/cap1/types").TrangThaiLucDat
  vung_mua: number
  phuong_phap_sl_tp: import("@/features/cap2/types").PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
  khau_vi: KhauViLoai | null
  muc_tu_tin: MucTuTin | null
  cach_khoi_luong: CachKhoiLuongWire | null
  khoi_luong: number | null
  pct_von: number | null
}
