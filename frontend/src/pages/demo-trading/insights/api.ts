/**
 * Wire layer for the four insights panels - every endpoint is called through the
 * shared `api()` client, so auth/refresh/proxy behaviour is identical to the
 * trading hooks.
 *
 * Shapes are snake_case exactly as the backend serializes them (see
 * `backend-v2/src/modules/{journey,bot}/*.mapper.ts`). Nothing here invents a
 * value: unknown stays `null` on the wire, and the panels render it as "-".
 */
import { ApiError, api } from "@/lib/api"

/* ── Shared ─────────────────────────────────────────────────────────────── */

/** One durable BUY-plan → SELL closeout row (`TradeHistoryOut`, shared by Cấp 1-3). */
export type TradeRow = {
  buy_order_id: string
  sell_order_id: string
  matched_by: string
  symbol: string
  quantity: number
  bought_at: string
  closed_at: string
  gia_vao: number | null
  gia_ra: number
  pnl_pct: number
  pnl_vnd: number
  lyDo: string
  trangThai_luc_dat: string
  vung_mua: number
  cam_xuc: string | null
  phuong_phap_sl_tp: string | null
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
  khau_vi: string | null
  muc_tu_tin: number | null
  cach_khoi_luong: string | null
  khoi_luong: number | null
  pct_von: number | null
}

export type TradeList = { trades: TradeRow[]; total: number }

/* ── Cấp 1 ──────────────────────────────────────────────────────────────── */

export type Cap1Progress = {
  id: string
  user_id: string
  entered_at: string | null
  da_xem_tour: boolean
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  task_5_done_at: string | null
  so_ly_do_da_dung: number
  so_lenh_ly_do_ung_ho: number
  so_lenh_thuc_chien: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/* ── Cấp 2 ──────────────────────────────────────────────────────────────── */

export type Cap2Progress = {
  id: string
  user_id: string
  entered_at: string | null
  task_1_done_at: string | null
  so_lenh_co_cl_tp: number
  so_lan_cat_lo_dung: number
  so_lan_chot_loi_dung: number
  so_lan_thuc_hien_dung: number
  chuoi_current: number
  chuoi_record: number
  last_chuoi_reset_at: string | null
  so_lenh_7_ngay: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export type DiemKyLuat = {
  ngay: string
  co_giao_dich: boolean
  co_tinh_huong: boolean
  diem: number | null
  xep_loai: "xanh" | "vang" | "do" | null
  giai_thich: string
  thanh_phan: Record<string, number> | null
}

export type DiemKyLuatHistory = { scores: DiemKyLuat[]; from_date: string; to_date: string }

export type WeeklyViolations = {
  week_start: string
  week_end: string
  cat_lo_cham: number
  chot_loi_hut: number
  ban_som_lo_nhe: number
  nhoi_lenh_khi_lo: number
  total: number
  trend: string | null
}

export type ReflectionInsight = {
  pattern: string
  matches: number
  note_count: number
  interpretation: string
  next_step: string
}

export type Cap2Analysis = {
  score_30d: {
    scores: DiemKyLuat[]
    average_7d: number | null
    average_30d: number | null
    xanh_days: number
    vang_days: number
    do_days: number
  }
  weekly_violations: WeeklyViolations[]
  window20: { sell_order_id: string; symbol: string; closed_at: string; compliant: boolean; violations: string[] }[]
  reflection: { eligible: boolean; note_count: number; violation_count: number; insights: ReflectionInsight[] }
  patterns: { pattern_id: number; message: string; data: Record<string, unknown> }[]
}

/* ── Cấp 3 ──────────────────────────────────────────────────────────────── */

export type Cap3Progress = {
  id: string
  user_id: string
  entered_at: string | null
  khau_vi_da_dat: boolean
  khau_vi: string | null
  von_ban_dau: number
  task_1_done_at: string | null
  task_2_done_at: string | null
  so_lenh_quan_ly_von: number
  muc_tu_tin_da_dung: number[]
  so_muc_tu_tin_da_dung: number
  so_lenh_cap3: number
  lai_pct_cap3: number
  diem_ky_luat_tb_cap3: number | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export type ConfidenceRow = {
  muc_tu_tin: number
  count: number
  wins: number
  win_rate: number | null
  avg_pnl_pct: number | null
  avg_khoi_luong: number | null
  avg_pct_von: number | null
}

export type Cap3TradeAnalysis = { trades: TradeRow[]; total: number; by_confidence: ConfidenceRow[] }

/* ── Cấp 4 ──────────────────────────────────────────────────────────────── */

export type Cap4Progress = {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  so_lenh_doc_du_5lop: number
  vu_khi_lop: string | null
  diem_mu_lop: string | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export type LopWinRate = {
  lop: string
  ten: string
  n_orders: number
  n_wins: number
  win_rate: number | null
  nhan: string | null
  giai_thich: string
}

export type VuKhiDiemMu = {
  lop: LopWinRate[]
  vu_khi_lop: string | null
  diem_mu_lop: string | null
  so_lenh_toi_thieu: number
  nguong_vu_khi: number
  nguong_diem_mu: number
  giai_thich: string
}

export type Khoi10 = {
  rows: { band: string; label: string; count: number; wins: number; win_rate: number | null; insufficient: boolean }[]
  total_trades: number
  excluded_no_ai: number
  hieu_qua: boolean | null
  phat_hien: string | null
  insufficient_note: string | null
  giai_thich: string
}

export type Khoi11 = {
  so_lan_khac_ai: number
  so_lan_ban_dung: number
  so_lan_ai_dung: number
  phat_hien: string | null
  insufficient_note: string | null
  giai_thich: string
}

export type Cap4PhanTich = { khoi_10: Khoi10; khoi_11: Khoi11 }

/* ── Cấp 5 ──────────────────────────────────────────────────────────────── */

export type Cap5Progress = {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  so_ma_da_san: number
  so_ma_mua_tu_watchlist: number
  so_ma_cho_du_lop: number | null
  so_ma_da_cham_diem: number
  so_ma_cho_du_lop_day_du: boolean
  muc_tieu_so_ma_san: number
  muc_tieu_so_ma_mua: number
  da_xem_tour_sanma: boolean
  best_filter: string | null
  best_filter_ten: string | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export type LocSanTieuChi = { ma: string; ten: string; ap_dung: boolean; giai_thich: string | null }

export type HuntFilterStatus = {
  ma: string
  icon: string
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
}

export type SanMaIndex = {
  loc_san: LocSanTieuChi[]
  so_ma_trong_ro: number | null
  bo_loc: HuntFilterStatus[]
  hien_thi_toi_da: number
}

export type HuntItem = {
  hang: number
  symbol: string
  gia_vnd: number | null
  pct_thay_doi: number | null
  tin_hieu: string
  gia_tri_xep_hang: number | null
}

export type HuntResult = {
  ma: string
  icon: string | null
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
  tong_so_ma: number | null
  so_ma_trong_ro: number | null
  so_ma_xet: number | null
  so_ma_truot_loc_san: number | null
  so_ma_bo_qua_thieu_du_lieu: number | null
  ket_qua_day_du: boolean | null
  canh_bao_thieu_du_lieu: string | null
  hien_thi_toi_da: number
  loc_san: LocSanTieuChi[]
  items: HuntItem[]
}

export type Cap5LopChiTiet = {
  lop: string
  ten: string | null
  ung_ho: boolean | null
  muc: "ok" | "neu" | "bad" | null
  nhan: string | null
  giai_thich: string | null
  nguon: string | null
  source_date: string | null
}

export type Cap5WatchlistItem = {
  symbol: string
  current_price_vnd: number | null
  percent_change: number | null
  added_at: string | null
  hunt_filter: string | null
  hunt_filter_ten: string | null
  hunt_signal: string | null
  hunt_at: string | null
  so_phien_tu_khi_san: number | null
  consensus_today: number | null
  consensus_prev: number | null
  consensus_da_cham: number | null
  consensus_at: string | null
  consensus_session_date: string | null
  consensus_session_date_qua_han: string | null
  consensus_het_han: boolean
  so_phien_hieu_luc: number | null
  status: string | null
  tong_so_lop: number | null
  nguong_dang_chu_y: number | null
  nhac: string | null
  lop: Record<string, "ok" | "neu" | "bad" | null> | null
  lop_chi_tiet: Cap5LopChiTiet[] | null
}

export type Cap5Watchlist = {
  items: Cap5WatchlistItem[]
  so_luong: number
  so_dang_chu_y: number
  toi_da: number
  so_phien_hieu_luc: number | null
}

export type NguonSan = {
  symbol: string
  order_id: string | null
  tu_san_ma: boolean
  hunt_filter: string | null
  hunt_filter_ten: string | null
  hunt_signal: string | null
  first_hunted_at: string | null
  so_phien_trong_watchlist: number | null
  moc_tinh_phien: string | null
  canh_bao_thieu_order_id: string | null
  canh_bao_nguon_moi_hon: string | null
  so_lop_luc_vao: number | null
  giai_thich: string
  ly_do_thieu_so_lop: string | null
}

export type Khoi12 = {
  items: { ma: string; ten: string; so_lenh: number; so_lenh_thang: number; ty_le_thang: number | null; du_mau: boolean; nhan: string | null; canh_bao: string | null; giai_thich: string }[]
  best_filter: string | null
  so_lenh_toi_thieu: number
  so_lenh_khong_tu_san: number
  du_de_ket_luan: boolean
  giai_thich: string
}

export type Khoi13 = {
  so_ma_da_san: number
  so_ma_cho_du_lop: number | null
  so_ma_da_cham_diem: number
  so_ma_cho_du_lop_day_du: boolean
  so_ma_vao_lenh: number
  giai_thich: string
  loi_ket: string
}

export type Cap5PhanTich = { khoi_12: Khoi12; khoi_13: Khoi13 }

/* ── Cấp 6 ──────────────────────────────────────────────────────────────── */

export type Cap6Progress = {
  id: string
  user_id: string
  entered_at: string
  so_lan_xu_ly_nhat_quan: number
  so_lan_xu_ly_veto_nhat_quan: number
  muc_tieu_nhat_quan: number
  tong_lai_lenh_cap6_pct: number | null
  da_xem_tour_mauthuan: boolean
  dat_nhiem_vu: boolean
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export type Cap6PhanTich = {
  khoi_14: {
    rows: { muc: string; muc_ten: string; so_lenh: number; kl_tb_pct_von: number | null; khop: boolean | null }[]
    du_mau: boolean
    giai_thich: string
    nhan_xet: string | null
  }
  khoi_15: {
    rows: { muc: string; muc_ten: string; so_lenh: number; so_lenh_thang: number; ty_le_thang_pct: number | null; du_mau: boolean }[]
    so_lan_nghiem_khong_mua: number
    so_lan_khong_mua: number
    so_lenh_toi_thieu: number
    giai_thich: string
    nhan_xet: string | null
  }
}

/* ── Bot ────────────────────────────────────────────────────────────────── */

export type BotRunIssue = { code: string; symbol: string | null; detail: string | null }

export type BotRunStatus = {
  status: "idle" | "running" | "succeeded" | "failed"
  latest_run_id: string | null
  last_updated_at: string | null
  processed_unseen_sessions: number
  issues: BotRunIssue[]
}

export type BotOverview = {
  eligible: boolean
  current_level: number
  cap6_graduated_at: string | null
  disclosure: string
  bot: { strategy_id: string; strategy_version: number; execution_model: string; initial_cash_vnd: string; activated_at: string } | null
  account: {
    cash_vnd: string
    market_value_vnd: string | null
    nav_vnd: string | null
    pnl_total_net_vnd: string | null
    return_total: string | null
    valuation_complete: boolean
    as_of_session: string | null
  } | null
  bot_run: BotRunStatus
}

export type BotPosition = {
  id: string
  symbol: string
  qty: number
  entry_price_vnd: string
  current_close_vnd: string | null
  market_value_vnd: string | null
  weight_pct: string | null
  amplitude_at_entry_vnd: string
  amplitude_source_ref: string
  stop_loss_vnd: string
  take_profit_vnd: string
  unrealized_pnl_net_vnd: string | null
  filter_ids: string[]
  opened_session: string
  opened_at: string
  sector: string | null
}

export type BotPositions = { items: BotPosition[]; valuation_complete: boolean; as_of_session: string | null }

export type BotJournalItem = {
  id: string
  run_id: string
  trading_date: string
  action: string
  reason_code: string
  reason: string
  execution: { id: string; side: string; qty: number; price_vnd: string; gross_value_vnd: string; fee_vnd: string; tax_vnd: string; net_cash_delta_vnd: string } | null
  symbol: string | null
  filter_ids: string[]
  supporting_count: number | null
  threshold_vnd: string | null
  created_at: string
}

export type BotJournal = { items: BotJournalItem[]; next_cursor: string | null; issues: BotRunIssue[] }

export type BotPerformance = {
  base: { trading_date: string; bot_nav_vnd: string; vnindex_value: string | null } | null
  series: {
    trading_date: string
    cash_vnd: string
    market_value_vnd: string | null
    nav_vnd: string | null
    valuation_complete: boolean
    bot_return_since_base: string | null
    vnindex_value: string | null
    vnindex_return_since_base: string | null
  }[]
  comparison_available: boolean
}

/* ── Reading dataset / self-assessment / reveal ─────────────────────────── */

export type ReadingRow = { lines: string[]; degraded: boolean }
export type ReadingDataset = {
  id: string
  symbol: string
  trading_date: string
  readings: Record<string, ReadingRow | undefined>
  price: number | null
}
export type ReadingReceipt = { id: string; dataset_id: string }
export type ReadingReveal = ReadingReceipt & {
  ai_answers: Record<string, string>
  readings: Record<string, ReadingRow | undefined>
  first_answers: Record<string, string>
}

/* ── Fetchers ───────────────────────────────────────────────────────────── */

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

const get = async <T,>(path: string, signal?: AbortSignal) =>
  unwrap<T>(await api<unknown>(path, { signal }))

/**
 * Level-scoped reads answer 404 (`Không tìm thấy tiến trình Cấp N`) until the
 * user has actually entered that Cấp. That is a gate, not a failure - it maps to
 * `null` so the panels can say "chưa vào cấp" instead of reporting an error.
 * Every other status still throws.
 */
async function getOrNull<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    return unwrap<T>(await api<unknown>(path, { signal }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export const insightsApi = {
  cap1Progress: (signal?: AbortSignal) => get<Cap1Progress | null>("/cap1/progress", signal),
  cap1Trades: (signal?: AbortSignal) => get<TradeList>("/cap1/trades", signal),
  cap2Progress: (signal?: AbortSignal) => get<Cap2Progress | null>("/cap2/progress", signal),
  cap2Trades: (signal?: AbortSignal) => getOrNull<TradeList>("/cap2/trades", signal),
  cap2Analysis: (signal?: AbortSignal) => getOrNull<Cap2Analysis>("/cap2/analysis", signal),
  cap2Scores: (signal?: AbortSignal) => getOrNull<DiemKyLuatHistory>("/cap2/diem-ky-luat/history", signal),
  cap3Progress: (signal?: AbortSignal) => get<Cap3Progress | null>("/cap3/progress", signal),
  cap3Analysis: (signal?: AbortSignal) => getOrNull<Cap3TradeAnalysis>("/cap3/trades/analysis", signal),
  cap4Progress: (signal?: AbortSignal) => get<Cap4Progress | null>("/cap4/progress", signal),
  cap4VuKhiDiemMu: (signal?: AbortSignal) => getOrNull<VuKhiDiemMu>("/cap4/vu-khi-diem-mu", signal),
  cap4PhanTich: (signal?: AbortSignal) => getOrNull<Cap4PhanTich>("/cap4/phan-tich", signal),
  cap5Progress: (signal?: AbortSignal) => get<Cap5Progress | null>("/cap5/progress", signal),
  cap5PhanTich: (signal?: AbortSignal) => getOrNull<Cap5PhanTich>("/cap5/phan-tich", signal),
  cap5SanMaIndex: (signal?: AbortSignal) => getOrNull<SanMaIndex>("/cap5/san-ma", signal),
  cap5Hunt: (filter: string, signal?: AbortSignal) => getOrNull<HuntResult>(`/cap5/san-ma/${filter}`, signal),
  cap5Watchlist: (signal?: AbortSignal) => getOrNull<Cap5Watchlist>("/cap5/watchlist", signal),
  cap5AddWatchlist: (input: { symbol: string; hunt_filter: string | null; hunt_signal: string | null }) =>
    api<Cap5WatchlistItem>("/cap5/watchlist", { method: "POST", body: JSON.stringify(input) }),
  cap5RemoveWatchlist: (symbol: string) => api<void>(`/cap5/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }),
  cap5NguonSan: (symbol: string, signal?: AbortSignal) => getOrNull<NguonSan>(`/cap5/nguon-san/${encodeURIComponent(symbol)}`, signal),
  cap6Progress: (signal?: AbortSignal) => get<Cap6Progress | null>("/cap6/progress", signal),
  cap6PhanTich: (signal?: AbortSignal) => getOrNull<Cap6PhanTich>("/cap6/phan-tich", signal),
  botOverview: (signal?: AbortSignal) => get<BotOverview>("/bot", signal),
  botPositions: (signal?: AbortSignal) => get<BotPositions>("/bot/positions", signal),
  botJournal: (cursor: string | null, signal?: AbortSignal) =>
    get<BotJournal>(`/bot/journal?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, signal),
  botPerformance: (signal?: AbortSignal) => get<BotPerformance>("/bot/performance", signal),
  readingDataset: (symbol: string) =>
    api<ReadingDataset>("/journey/reading-datasets", { method: "POST", body: JSON.stringify({ symbol }) }),
  submitAssessment: (datasetId: string, answers: Record<string, string>) =>
    api<ReadingReceipt>("/journey/assessments", { method: "POST", body: JSON.stringify({ dataset_id: datasetId, answers }) }),
  revealAssessment: (assessmentId: string) =>
    api<ReadingReveal>(`/journey/assessments/${encodeURIComponent(assessmentId)}/reveal`, { method: "POST" }),
}
