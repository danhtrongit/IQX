import type { LayerKey } from '../cap5/cap5.types.js';

export const CONFLICT_LEVELS = ['nhe', 'ngai', 'nghiem', 'chua_ro'] as const;
export type ConflictLevel = (typeof CONFLICT_LEVELS)[number];
export const CONFLICT_LABELS: Record<ConflictLevel, string> = {
  nhe: 'Mâu thuẫn nhẹ',
  ngai: 'Đáng ngại',
  nghiem: 'Nghiêm trọng',
  chua_ro: 'Chưa rõ',
};
export const ORDERED_CONFLICT_LEVELS: readonly ConflictLevel[] = ['nhe', 'ngai', 'nghiem'];
export const VETO_LAYERS: ReadonlySet<LayerKey> = new Set(['tin_tuc', 'noi_bo']);
export const DEDUCTION_LAYERS: ReadonlySet<LayerKey> = new Set([
  'ky_thuat',
  'dong_tien',
  'dinh_gia',
]);

export interface ConflictSupportRow {
  lop: LayerKey;
  ten: string;
  nhan: string;
  bac: number;
}
export interface ConflictOpposingRow extends ConflictSupportRow {
  la_phu_quyet: boolean;
}
export interface ConflictNeutralRow {
  lop: LayerKey;
  ten: string;
  nhan: string;
}
export interface ConflictResult {
  co_mau_thuan: boolean;
  ung_ho: ConflictSupportRow[];
  nguoc: ConflictOpposingRow[];
  trung_tinh: ConflictNeutralRow[];
  phu_quyet_kich_hoat: boolean;
  lop_phu_quyet_xau: LayerKey[];
  canh_bao: string | null;
  chua_du_du_lieu: boolean;
  ly_do_chua_du: string | null;
  so_lop_da_cham: number;
  session_date: string | null;
}

export interface Cap6ProgressRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  entered_at: Date | string;
  so_lan_xu_ly_nhat_quan: number;
  so_lan_xu_ly_veto_nhat_quan: number;
  tong_lai_lenh_cap6_pct: number | null;
  da_xem_tour_mauthuan: boolean;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
}

export interface Cap6SkipRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  symbol: string;
  at: Date | string;
  conflict_level: ConflictLevel;
  had_conflict: boolean | null;
  had_veto: boolean | null;
}

export const CAP6_POST_GRADUATION_HOOKS = Symbol('CAP6_POST_GRADUATION_HOOKS');
export interface Cap6PostGraduationHooks {
  initializeBot(userId: string): Promise<void>;
  initializeMascot(userId: string): Promise<void>;
}
