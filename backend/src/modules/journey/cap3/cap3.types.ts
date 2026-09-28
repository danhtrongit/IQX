export const RISK_APPETITES = ['than_trong', 'can_bang', 'tan_cong'] as const;
export const SIZING_METHODS = ['khau_vi_tu_tin', 'chia_deu'] as const;
export const CONFIDENCE_LEVELS = [1, 2, 3] as const;

export type RiskAppetite = (typeof RISK_APPETITES)[number];
export type SizingMethod = (typeof SIZING_METHODS)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type Cap3Progress = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  khau_vi_da_dat: boolean;
  khau_vi: RiskAppetite | null;
  von_ban_dau: number;
  task_1_done_at: Date | string | null;
  task_2_done_at: Date | string | null;
  so_lenh_quan_ly_von: number;
  muc_tu_tin_da_dung: ConfidenceLevel[];
  so_muc_tu_tin_da_dung: number;
  so_lenh_cap3: number;
  lai_pct_cap3: number;
  diem_ky_luat_tb_cap3: number | null;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
};

export type OrderPlanRow = {
  id: string;
  order_id: string;
  lyDo: 'ky_thuat' | 'dong_tien' | 'noi_bo' | 'tin_tuc' | 'dinh_gia';
  trangThai_luc_dat: 'ung_ho' | 'trung_tinh' | 'can_chu_y' | 'nguoc_chieu';
  vung_mua: string | number | bigint;
  phuong_phap_sl_tp: 'ho_tro_khang_cu' | 'bien_do_dao_dong' | null;
  cat_lo: string | number | bigint | null;
  chot_loi: string | number | bigint | null;
  khau_vi: RiskAppetite | null;
  muc_tu_tin: number | null;
  cach_khoi_luong: SizingMethod | null;
  khoi_luong: number | null;
  pct_von: number | string | null;
};

export type Cap3Trade = {
  buy_order_id: string;
  sell_order_id: string;
  matched_by: 'snapshot' | 'symbol_fallback';
  symbol: string;
  quantity: number;
  bought_at: Date | string;
  closed_at: Date | string;
  gia_vao: number | null;
  gia_ra: number;
  pnl_pct: number;
  pnl_vnd: number;
  lyDo: OrderPlanRow['lyDo'];
  trangThai_luc_dat: OrderPlanRow['trangThai_luc_dat'];
  vung_mua: number;
  cam_xuc: 'binh_tinh' | 'so' | 'hoi_tiec' | 'khong_ro' | null;
  phuong_phap_sl_tp: OrderPlanRow['phuong_phap_sl_tp'];
  cat_lo: number | null;
  chot_loi: number | null;
  cham_SL_cuoi_phien: boolean;
  cham_SL_cat_dung_phien_ke: boolean;
  cham_SL_khong_cat: boolean;
  giu_cham_SL_bao_nhieu_phien: number | null;
  cham_TP_giu_lam_hut: boolean;
  ban_som_khi_lo_nhe: boolean;
  nhoi_lenh_khi_lo: boolean;
  ghi_chu_nhin_lai: string | null;
  khau_vi: RiskAppetite;
  muc_tu_tin: ConfidenceLevel;
  cach_khoi_luong: SizingMethod;
  khoi_luong: number;
  pct_von: number;
};
