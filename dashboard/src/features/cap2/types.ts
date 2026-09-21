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

/**
 * Behaviour-progress row for the current user's Cấp 2 (one per user) — mô hình
 * **ĐÚNG MỘT nhiệm vụ** (mockup `iqx-cap2-hanhtrinh.html`, jbar `CẤP 2 · 0/1`):
 *
 *  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời» → `so_lenh_co_cl_tp` (n/10)
 *
 * Tốt nghiệp = 1/1.
 *
 * ★★ `task_2_done_at` KHÔNG còn tồn tại — nhiệm vụ ② «Thực hiện đúng khi giá
 * chạm mốc» đã bỏ hẳn (backend migration `9c3f7ad10b52` DROP cột đó), nên
 * payload `GET /cap2/progress` không bao giờ còn mang nó.
 */
export interface Cap2Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  /** Số lệnh Thực chiến đã ghi cam kết cắt lỗ/chốt lời — mẫu số 10 (nhiệm vụ ①). */
  so_lenh_co_cl_tp: number
  /**
   * ★ BA con số dưới đây là SỐ MÔ TẢ, KHÔNG phải nhiệm vụ. Chúng chỉ để khối ④
   * «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào» của «Phân tích danh mục» vẽ
   * (mockup `iqx-cap2-phantich-danhmuc.html` — KHÔNG đổi khi Cấp 2 rút về 1
   * nhiệm vụ), và các trang Phân tích của Cấp 3-8 vẽ lại từ chính hàng này.
   * ⚠ KHÔNG được trình bày chúng kèm mẫu số/mốc phải đạt («x/2», «còn n lần»)
   * — không còn nhiệm vụ nào đo chúng.
   *
   * 🛑 Số lần giá chạm cắt lỗ và user cắt ngay trong phiên đó.
   */
  so_lan_cat_lo_dung: number
  /** 🎯 Số lần giá chạm chốt lời và user bán theo kế hoạch (không giữ làm hụt). */
  so_lan_chot_loi_dung: number
  /** ✅ Tổng lần thực hiện đúng. Server bảo đảm
   *  `so_lan_thuc_hien_dung === so_lan_cat_lo_dung + so_lan_chot_loi_dung`. */
  so_lan_thuc_hien_dung: number
  /** Công cụ học tập §6; không tham gia cổng tốt nghiệp. */
  chuoi_current?: number
  chuoi_record?: number
  last_chuoi_reset_at?: string | null
  so_lenh_7_ngay?: number
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
  ghi_chu_nhin_lai?: string | null
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
  ghi_chu_nhin_lai: string | null
}

export interface Cap2TradeHistory {
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
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
  cham_SL_khong_cat: boolean
  cham_TP_giu_lam_hut: boolean
  ban_som_khi_lo_nhe: boolean
  nhoi_lenh_khi_lo: boolean
  ghi_chu_nhin_lai: string | null
}

export interface Cap2TradeHistoryList {
  trades: Cap2TradeHistory[]
  total: number
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

export interface DiemKyLuatHistory {
  scores: DiemKyLuat[]
  from_date: string
  to_date: string
}

export type ViPhamCap2 = "cat_lo_cham" | "chot_loi_hut" | "ban_som_lo_nhe" | "nhoi_lenh_khi_lo"

export interface Cap2Analysis {
  score_30d: {
    scores: DiemKyLuat[]
    average_7d: number | null
    average_30d: number | null
    xanh_days: number
    vang_days: number
    do_days: number
  }
  weekly_violations: Array<{
    week_start: string
    week_end: string
    cat_lo_cham: number
    chot_loi_hut: number
    ban_som_lo_nhe: number
    nhoi_lenh_khi_lo: number
    total: number
  }>
  window20: Array<{
    sell_order_id: string
    symbol: string
    closed_at: string
    compliant: boolean
    violations: ViPhamCap2[]
  }>
  reflection: {
    eligible: boolean
    note_count: number
    violation_count: number
    insights: Array<{
      pattern: import("./portfolioAnalysisCap2").ReflectionPatternId
      matches: number
      note_count: number
    }>
  }
  patterns: Array<{
    pattern_id: 9 | 10 | 11 | 12
    message: string
    data: Record<string, unknown>
  }>
}

// Durable discipline-alert contracts (spec §8-§10). The server owns the
// per-session budget, clean-order auto-mute and ignored-alert escalation; the
// client only renders the decision returned by these endpoints.
export type Cap2AlertType = "nhoi_lenh" | "cham_cat_lo"
export type Cap2AlertStatus = "pending" | "shown" | "suppressed" | "acted"
export type Cap2AlertEscalation = "normal" | "delay_5s" | "type_phrase"
export type Cap2AlertAction = "cancel_buy" | "proceed_buy" | "sell_ato" | "hold"
export type Cap2StoredAlertAction = Cap2AlertAction | "position_closed"

export interface Cap2Alert {
  id: string
  alert_type: Cap2AlertType
  symbol: string
  session_date: string
  observed_price_vnd: number
  threshold_price_vnd: number | null
  loss_pct: number | null
  official_close_session_date: string | null
  breach_session_no: number
  status: Cap2AlertStatus
  suppression_reason: string | null
  escalation: Cap2AlertEscalation | null
  impression_count: number
  first_shown_at: string | null
  last_shown_at: string | null
  action: Cap2StoredAlertAction | null
  acted_at: string | null
  /** Context added by the durable alert service for the exact spec copy. */
  priority: "immediate" | "next_session"
  position_quantity: number | null
  position_avg_cost_vnd: number | null
  plan_started_at: string | null
}

export interface Cap2PreBuyAlertInput {
  symbol: string
  idempotency_key: string
  quantity: number
  order_type: "market" | "limit"
  limit_price_vnd: number | null
}

export interface Cap2PreBuyAlertResult {
  data_status: "available" | "unavailable"
  triggered: boolean
  reason: string
  alert: Cap2Alert | null
}

export interface Cap2ActiveAlerts {
  session_date: string
  alerts: Cap2Alert[]
}

export interface Cap2AlertActionInput {
  alertId: string
  action: Cap2AlertAction
  confirmationPhrase?: string
}

export interface Cap2AlertActionResult {
  alert: Cap2Alert
  next_step: "none" | "confirm_ato_sell"
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

/** Tổng số nhiệm vụ Cấp 2 — mẫu số DUY NHẤT cho jbar, `.ck-head`, vòng huy
 *  hiệu và điều kiện tốt nghiệp. Mockup `iqx-cap2-hanhtrinh.html`: `0/1`. */
export const CAP2_TOTAL_TASKS = 1

/**
 * How many of Cấp 2's nhiệm vụ are complete (mirrors `cap1/types.ts`'s
 * `countCap1TasksDone`) — used by `JourneyPanelCap2` + `GraduationModalCap2`.
 *
 * ★ Chỉ đếm ĐÚNG MỘT cột, `task_1_done_at`. Một wire shape cũ còn sót
 * `task_2/3/4/5_done_at` KHÔNG được tính thành nhiệm vụ thứ 2/3/4/5 — cùng cái
 * bẫy `cap0/types.ts` và `cap1/types.ts` đã ghi, và lần này chính `task_2` là
 * cột vừa bị xoá khỏi server.
 */
export function countCap2TasksDone(progress: Cap2Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at].filter((t) => t != null).length
}
