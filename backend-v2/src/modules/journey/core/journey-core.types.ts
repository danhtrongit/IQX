import type { SqlClient } from '../../../platform/database/index.js';

export type JourneyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type HistoricalJourneyLevel = JourneyLevel | 7 | 8;

export type JourneyProgressRow = {
  level: HistoricalJourneyLevel;
  entered_at: Date | string;
  graduated_at: Date | string | null;
};

export type JourneyAccountSnapshot = {
  id: string;
  user_id: string;
  status: string;
  initial_cash_vnd: string;
  cash_available_vnd: string;
  cash_reserved_vnd: string;
  cash_pending_vnd: string;
};

export const JOURNEY_LAYER_KEYS = [
  'ky_thuat',
  'dong_tien',
  'noi_bo',
  'tin_tuc',
  'dinh_gia',
] as const;
export type JourneyLayer = (typeof JOURNEY_LAYER_KEYS)[number];
export type JourneyLayerAssessment = 'ok' | 'neu' | 'bad';

export type JourneyLearningPlanInput = {
  ly_do_doi_thuong?: string | null;
  lyDo?: JourneyLayer | null;
  trangThai_luc_dat?: 'ung_ho' | 'trung_tinh' | 'can_chu_y' | 'nguoc_chieu' | null;
  vung_mua?: number | null;
  co_bam_doc_chi_tiet?: boolean;
  snapshot?: Record<string, unknown> | null;
  phuong_phap_sl_tp?: 'ho_tro_khang_cu' | 'bien_do_dao_dong' | null;
  cat_lo?: number | null;
  chot_loi?: number | null;
  khau_vi?: 'than_trong' | 'can_bang' | 'tan_cong' | null;
  muc_tu_tin?: 1 | 2 | 3 | null;
  cach_khoi_luong?: 'khau_vi_tu_tin' | 'chia_deu' | null;
  doc_5_lop?: Partial<Record<JourneyLayer, JourneyLayerAssessment>> | null;
  conflict_level?: 'nhe' | 'ngai' | 'nghiem' | 'chua_ro' | null;
};

export type JourneyOrderContext = {
  userId: string;
  orderId: string;
  side: 'buy' | 'sell';
  quantity: number;
  referencePriceVnd?: number | bigint | null;
};

export type ValidatedJourneyPlan = Readonly<{
  level: JourneyLevel;
  input: Readonly<JourneyLearningPlanInput>;
}>;

export type PersistedJourneyPlan = {
  order_id: string;
  level: JourneyLevel;
  saved_levels: JourneyLevel[];
  plan: Record<string, unknown>;
};

export const TRADING_LEARNING_PLAN_PORT = Symbol('TRADING_LEARNING_PLAN_PORT');

export interface TradingLearningPlanPort {
  validateForOrder(
    tx: SqlClient,
    context: JourneyOrderContext,
    plan: JourneyLearningPlanInput | null | undefined,
  ): Promise<ValidatedJourneyPlan | null>;

  persistForOrder(
    tx: SqlClient,
    context: JourneyOrderContext,
    plan: ValidatedJourneyPlan | null,
  ): Promise<{ savedLevels: JourneyLevel[] }>;

  readForOrder(
    tx: SqlClient,
    userId: string,
    orderId: string,
  ): Promise<PersistedJourneyPlan | null>;
}
