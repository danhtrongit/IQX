export const LAYERS = ['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia'] as const;
export const ASSESSMENTS = ['ok', 'neu', 'bad'] as const;
export type Layer = (typeof LAYERS)[number];
export type Assessment = (typeof ASSESSMENTS)[number];

export type Cap4Progress = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  task_1_done_at: Date | string | null;
  so_lenh_doc_du_5lop: number;
  vu_khi_lop: Layer | null;
  diem_mu_lop: Layer | null;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
};

export type LayerWinRate = {
  lop: Layer;
  ten: string;
  n_orders: number;
  n_wins: number;
  win_rate: number | null;
  nhan: 'vu_khi' | 'diem_mu' | 'chua_du_du_lieu' | null;
  giai_thich: string;
};
