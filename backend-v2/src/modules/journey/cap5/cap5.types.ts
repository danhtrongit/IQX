export const HUNT_FILTERS = ['ngoai', 'tudoanh', 'kl', 'dinh', 'tang'] as const;
export type HuntFilter = (typeof HUNT_FILTERS)[number];

export const HUNT_FILTER_LABELS: Record<HuntFilter, string> = {
  ngoai: 'Khối ngoại gom',
  tudoanh: 'Tự doanh gom',
  kl: 'Khối lượng đột biến',
  dinh: 'Vượt đỉnh 20 phiên',
  tang: 'Tăng mạnh + KL cao',
};

export const LAYER_KEYS = ['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia'] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export type LayerLevel = 'ok' | 'neu' | 'bad';
export type WatchlistStatus = 'watching' | 'notable';

export const LAYER_LABELS: Record<LayerKey, string> = {
  ky_thuat: 'Kỹ thuật',
  dong_tien: 'Dòng tiền',
  noi_bo: 'Nội bộ',
  tin_tuc: 'Tin tức',
  dinh_gia: 'Định giá',
};

export interface ValuationReading {
  verdict: LayerLevel;
  rank: number;
  label: string;
  explanation: string;
  tradingDate: string | null;
  sourceRef: string | null;
}

export interface ConsensusLayer {
  lop: LayerKey;
  ten: string;
  ung_ho: boolean | null;
  muc: LayerLevel | null;
  nhan: string | null;
  giai_thich: string;
  nguon: string | null;
  source_date: string | null;
}

export interface ConsensusResult {
  diem: number | null;
  so_lop_da_cham: number | null;
  status: WatchlistStatus | null;
  lop: ConsensusLayer[];
  session_date: string | null;
  session_date_qua_han: string | null;
}

export interface HuntBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  gtgdVnd: number | null;
}

export interface HuntDataSource {
  dailyBars(symbols: readonly string[], candleCount: number): Promise<Map<string, HuntBar[]>>;
  netFlow(
    symbols: readonly string[],
    side: 'ngoai' | 'tudoanh',
    sessions: number,
  ): Promise<Map<string, number[]> | null>;
  restrictedSymbols(): Promise<Set<string> | null>;
}

export interface HuntItem {
  hang: number;
  symbol: string;
  gia_vnd: number;
  pct_thay_doi: number | null;
  tin_hieu: string;
  gia_tri_xep_hang: number;
}

export interface HuntFilterSpec {
  ma: HuntFilter;
  icon: string;
  ten: string;
  mo_ta: string;
  dieu_kien: string;
  xep_hang_theo: string;
  nguon_du_lieu: string;
}

export interface HuntResult {
  filter: HuntFilterSpec;
  available: boolean;
  unavailableReason: string | null;
  matchedCount: number | null;
  universeCount: number;
  evaluatedCount: number | null;
  floorRejectedCount: number | null;
  missingDataCount: number | null;
  complete: boolean | null;
  incompleteWarning: string | null;
  items: HuntItem[];
}

export interface Cap5ProgressRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  entered_at: Date | string;
  task_1_done_at: Date | string | null;
  task_2_done_at: Date | string | null;
  so_ma_da_san: number;
  so_ma_mua_tu_watchlist: number;
  da_xem_tour_sanma: boolean;
  best_filter: HuntFilter | null;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
}

export interface HuntLogRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  symbol: string;
  hunt_filter: HuntFilter;
  hunt_signal: string | null;
  first_hunted_at: Date | string;
  last_hunted_at: Date | string;
  notable_at: Date | string | null;
}

export interface WatchlistRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  symbol: string;
  sort_order: number;
  hunt_filter: HuntFilter | null;
  hunt_signal: string | null;
  hunt_at: Date | string | null;
  consensus_today: number | null;
  consensus_prev: number | null;
  consensus_da_cham: number | null;
  consensus_at: Date | string | null;
  status: WatchlistStatus | null;
  created_at: Date | string;
}

export interface VirtualOrderRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  mode: string;
  side: string;
  status: string;
  created_at: Date | string;
}

export interface OrderPlanRow extends Record<string, unknown> {
  id: string;
  order_id: string;
  from_watchlist: boolean | null;
  hunt_filter: HuntFilter | null;
  cap5_entry_snapshot_at: Date | string | null;
  hunt_signal_at_entry: string | null;
  hunt_first_hunted_at_entry: Date | string | null;
  hunt_sessions_at_entry: number | null;
  consensus_at_entry: number | null;
  consensus_scored_at_entry: number | null;
  consensus_captured_at_entry: Date | string | null;
  pct_von: number | null;
  muc_tu_tin: number | null;
  had_conflict: boolean | null;
  conflict_level: string | null;
  had_veto: boolean | null;
  veto_layers: string[] | null;
  support_layers: string[] | null;
  opposing_layers: string[] | null;
  neutral_layers: string[] | null;
  conflict_snapshot_session_date: Date | string | null;
  conflict_snapshot_at: Date | string | null;
}
