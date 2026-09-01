/**
 * IQX Backend — TypeScript declarations generated from the live FastAPI OpenAPI schema.
 * Do not edit by hand; regenerate with `uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py`.
 */

export type UUID = string;
export type IsoDateTime = string;
export type IsoDate = string;
export type SessionDate = string;
export type DecimalString = string;

/**
 * Virtual trading account summary.
 */
export type AccountResponse = { activated_at: IsoDateTime; cash_available_vnd: number; cash_pending_vnd: number; cash_reserved_vnd: number; created_at: IsoDateTime; id: UUID; initial_cash_vnd: number; reset_at?: IsoDateTime | null; status: string; total_cash_vnd?: number; user_id: UUID; };

/**
 * ``POST /cap5/watchlist`` — thêm mã kèm NGUỒN SĂN (§5.4/§10).
 *
 * ``hunt_signal`` được nhận cho khớp wire của FE nhưng **BỊ BỎ QUA**: server tự
 * tính lại tín hiệu từ dữ liệu thị trường. Tin một chuỗi số do client gửi là
 * mở cửa cho một dòng "+45,2 tỷ ròng" không ai kiểm được.
 */
export type AddWatchlistRequest = { hunt_filter: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"; hunt_signal?: string | null; symbol: string; };

export type AdminAuditLogResponse = { action: string; admin_email: string | null; admin_user_id: UUID | null; created_at: IsoDateTime; id: UUID; ip: string | null; note: string | null; payload_after: { [key: string]: unknown; } | null; payload_before: { [key: string]: unknown; } | null; request_id: string | null; target_entity: string | null; target_id: string | null; user_agent: string | null; };

/**
 * Admin manually grants premium to a user.
 */
export type AdminGrantRequest = { note?: string | null; plan_id: UUID; };

export type AdminPaymentOrderBrief = { amount_vnd: number; created_at: IsoDateTime; currency: string; grant_type: string | null; id: UUID; invoice_number: string; ipn_log_count: number; paid_at: IsoDateTime | null; plan_code: string | null; plan_id: UUID; plan_name: string | null; status: string; user_email: string | null; user_id: UUID; };

export type AdminPaymentOrderDetail = { amount_vnd: number; created_at: IsoDateTime; currency: string; grant_note: string | null; grant_type: string | null; id: UUID; invoice_number: string; ipn_logs: { [key: string]: unknown; }[]; paid_at: IsoDateTime | null; plan_code: string | null; plan_id: UUID; plan_name: string | null; plan_price_vnd: number | null; status: string; subscription_id: UUID | null; subscription_period_end: IsoDateTime | null; subscription_status: string | null; updated_at: IsoDateTime; user_email: string | null; user_id: UUID; };

export type AdminSubscriptionBrief = { cancel_reason: string | null; cancelled_at: IsoDateTime | null; created_at: IsoDateTime; current_period_end: IsoDateTime; current_period_start: IsoDateTime; current_plan_id: UUID | null; id: UUID; plan_code: string | null; plan_name: string | null; status: string; user_email: string | null; user_id: UUID; };

export type AdminSubscriptionDetail = { cancel_reason: string | null; cancelled_at: IsoDateTime | null; cancelled_by_user_id: UUID | null; created_at: IsoDateTime; current_period_end: IsoDateTime; current_period_start: IsoDateTime; current_plan_id: UUID | null; id: UUID; plan_code: string | null; plan_name: string | null; status: string; updated_at: IsoDateTime; user_email: string | null; user_id: UUID; };

/**
 * Admin-level user creation — admins can set role and status.
 */
export type AdminUserCreate = { email: string; full_name: string; password: string; phone_number?: string | null; role?: UserRole; status?: UserStatus; };

/**
 * Admin-level update — admins can change role and status too.
 */
export type AdminUserUpdate = { avatar_url?: string | null; city?: string | null; country?: string | null; date_of_birth?: IsoDate | null; district?: string | null; full_name?: string | null; gender?: string | null; is_email_verified?: boolean | null; phone_number?: string | null; postal_code?: string | null; province_state?: string | null; role?: UserRole | null; status?: UserStatus | null; street_address?: string | null; ward?: string | null; };

export type AlertEventResponse = { delivered: boolean; fired_at: IsoDateTime; id: UUID; price: number | null; session_date: IsoDate; signal_key: string | null; symbol: string; };

export type AlertSignalAdminCreate = { combination: CombinationSchema; is_enabled?: boolean; key: string; message_title: string; side: "buy" | "sell"; sort_order?: number; ta_name: string; };

export type AlertSignalAdminUpsert = { combination: CombinationSchema; is_enabled?: boolean; message_title: string; side: "buy" | "sell"; sort_order?: number; ta_name: string; };

export type AlertSignalResponse = { combination: { [key: string]: unknown; }; is_enabled: boolean; key: string; message_title: string; side: string; sort_order: number; ta_name: string; };

export type AnalysisListItem = { headline: string; id: string; session_date: IsoDate; session_type: string; tagline: { [key: string]: unknown; }; };

export type AnalysisOut = { charts?: { [key: string]: unknown; } | null; generated_at: IsoDateTime; headline: string; id: string; meta?: { [key: string]: unknown; } | null; paragraphs: { [key: string]: unknown; }; pulse?: { [key: string]: unknown; } | null; scenarios: unknown[]; session_date: IsoDate; session_type: string; session_type_display?: string | null; tagline: { [key: string]: unknown; }; unexplained?: string | null; watchlist?: unknown[] | null; };

export type AnalyzeResponse = { analysis: { [key: string]: unknown; }; meta: { [key: string]: unknown; }; narrative?: { [key: string]: unknown; } | null; };

export type BacktestRunRequest = { buy: StrategySide; capital?: number; end: string; risk?: RiskInput; sell?: StrategySide; start: string; symbol: string; };

export type BacktestStrategyCreate = { config: { [key: string]: unknown; }; name: string; symbol?: string | null; };

export type BacktestStrategyResponse = { config: { [key: string]: unknown; }; created_at: IsoDateTime; id: UUID; name: string; symbol: string | null; updated_at: IsoDateTime; };

export type BacktestStrategyUpdate = { config?: { [key: string]: unknown; } | null; name?: string | null; symbol?: string | null; };

export type Body_admin_upload_episode_file_api_v1_admin_lessons_episodes__episode_id__file_post = { file: string; };

export type Body_admin_upload_thumbnail_api_v1_admin_lessons_courses__course_id__thumbnail_post = { file: string; };

export type BulkOp = "set_role" | "set_status" | "soft_delete";

export type BulkUpdateError = { message: string; user_id: UUID; };

export type BulkUpdateRequest = { op: BulkOp; user_ids: UUID[]; value?: string | null; };

export type BulkUpdateResponse = { affected: number; errors: BulkUpdateError[]; skipped: UUID[]; };

export type CancelSubscriptionRequest = { reason: string; };

/**
 * Persisted chip + everything the Kết sổ derives from the order itself.
 */
export type Cap0KehoachOut = { gia_vao?: number | null; id: UUID; ly_do_doi_thuong: string; ly_do_label: string; mode: string; mua_luc: IsoDateTime; ngay_mua: IsoDate; order_id: UUID; so_phien_giu?: number | null; symbol: string; };

/**
 * Record the khối "Kế hoạch" chip for a Cấp 0 BUY order.
 */
export type Cap0KehoachRequest = { ly_do_doi_thuong: string; order_id: UUID; };

/**
 * Cấp 0 progress state for the current user — 4 nhiệm vụ, 1 cổng hành vi.
 */
export type Cap0ProgressOut = { entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; task4_debrief_done: boolean; task_1_done_at?: IsoDateTime | null; task_2_done_at?: IsoDateTime | null; task_3_done_at?: IsoDateTime | null; task_4_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; virtual_balance_init: number; };

/**
 * Cấp 1 progress state for the current user — **5 nhiệm vụ**.
 *
 * ⑤ is «10 lệnh Thực chiến» (``so_lenh_thuc_chien``). The removed ⑤
 * («Xem lại danh mục») took ``task_6_done_at`` and ``so_lan_xem_danh_muc``
 * off the wire with it — see ``app.models.cap1.Cap1Progress``.
 */
export type Cap1ProgressOut = { da_xem_tour: boolean; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; so_lenh_ly_do_ung_ho: number; so_lenh_thuc_chien: number; so_ly_do_da_dung: number; task_1_done_at?: IsoDateTime | null; task_2_done_at?: IsoDateTime | null; task_3_done_at?: IsoDateTime | null; task_4_done_at?: IsoDateTime | null; task_5_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; };

/**
 * Cấp 2 progress state for the current user — ĐÚNG MỘT nhiệm vụ.
 *
 * ``so_lenh_co_cl_tp`` drives the only nhiệm vụ, ① («n/10 lệnh»), and
 * ``task_1_done_at`` is the whole tốt-nghiệp gate.
 *
 * ★ ``task_2_done_at`` is GONE from the wire: nhiệm vụ ② «Thực hiện đúng khi
 * giá chạm mốc» no longer exists (migration ``9c3f7ad10b52``). Leaving an
 * always-null field on the payload would invite a client to draw a second
 * checklist row for a nhiệm vụ that cannot be completed.
 *
 * ★ ``so_lan_cat_lo_dung`` / ``so_lan_chot_loi_dung`` / ``so_lan_thuc_hien_dung``
 * stay on the payload as ANALYTICS, not as a nhiệm vụ: they are the 🛑/🎯/✅
 * numbers «Phân tích danh mục» block ④ renders (and Cấp 3-8's Phân tích pages
 * re-render). ✅ always equals 🛑 + 🎯.
 */
export type Cap2ProgressOut = { entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; so_lan_cat_lo_dung: number; so_lan_chot_loi_dung: number; so_lan_thuc_hien_dung: number; so_lenh_co_cl_tp: number; task_1_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; };

/**
 * Cấp 3 progress state for the current user.
 */
export type Cap3ProgressOut = { diem_ky_luat_tb_cap3?: number | null; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; khau_vi?: "than_trong" | "can_bang" | "tan_cong" | null; khau_vi_da_dat: boolean; lai_pct_cap3: number; muc_tu_tin_da_dung: (1 | 2 | 3)[]; so_lenh_cap3: number; so_lenh_quan_ly_von: number; so_muc_tu_tin_da_dung: number; task_1_done_at?: IsoDateTime | null; task_2_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; von_ban_dau: number; };

/**
 * Cấp 4 progress state for the current user.
 */
export type Cap4ProgressOut = { diem_mu_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; so_lenh_doc_du_5lop: number; task_1_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; vu_khi_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null; };

/**
 * ``GET /cap5/phan-tich`` — 2 khối THÊM MỚI của Cấp 5 (§9).
 */
export type Cap5PhanTichOut = { khoi_12: Khoi12Out; khoi_13: Khoi13Out; };

/**
 * Tiến trình Cấp 5 của user hiện tại — **2 nhiệm vụ song song, độc lập**.
 *
 * ① ``so_ma_da_san >= muc_tieu_so_ma_san`` (10 mã vào Watchlist)
 * ② ``so_ma_mua_tu_watchlist >= muc_tieu_so_ma_mua`` (5 mã săn đã mua)
 *
 * ② KHÔNG bị gác sau ①. Tốt nghiệp = 2/2. Cả hai con số đều được server tính
 * lại ở MỌI lần đọc — client không gửi lên.
 */
export type Cap5ProgressOut = { best_filter?: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang" | null; best_filter_ten?: string | null; da_xem_tour_sanma: boolean; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; muc_tieu_so_ma_mua: number; muc_tieu_so_ma_san: number; so_ma_cho_du_lop?: number | null; so_ma_cho_du_lop_day_du?: boolean; so_ma_da_cham_diem?: number; so_ma_da_san: number; so_ma_mua_tu_watchlist: number; task_1_done_at?: IsoDateTime | null; task_2_done_at?: IsoDateTime | null; time_to_graduate_hours?: number | null; user_id: UUID; };

/**
 * Một thẻ mã trong Watchlist Cấp 5 (§6.2).
 */
export type Cap5WatchlistItemOut = { added_at?: IsoDateTime | null; consensus_at?: IsoDateTime | null; consensus_da_cham?: number | null; consensus_het_han?: boolean; consensus_prev?: number | null; consensus_session_date?: IsoDate | null; consensus_session_date_qua_han?: IsoDate | null; consensus_today?: number | null; hunt_at?: IsoDateTime | null; hunt_filter?: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang" | null; hunt_filter_ten?: string | null; hunt_signal?: string | null; lop?: { [key: string]: "ok" | "neu" | "bad" | null; } | null; lop_chi_tiet?: LopChiTietOut[] | null; nguong_dang_chu_y: number; nhac?: string | null; so_phien_hieu_luc: number; so_phien_tu_khi_san?: number | null; status?: "watching" | "notable" | null; symbol: string; tong_so_lop: number; };

/**
 * ``GET /cap5/watchlist`` — Watchlist + 2 tab đếm sẵn (§6.3).
 */
export type Cap5WatchlistOut = { items: Cap5WatchlistItemOut[]; so_dang_chu_y: number; so_luong: number; so_phien_hieu_luc: number; toi_da: number; };

/**
 * ``GET /cap6/progress`` — tiến trình Cấp 6 của user hiện tại.
 *
 * ``muc_tieu_nhat_quan`` là mục tiêu duy nhất của cổng hành trình.
 */
export type Cap6ProgressOut = { da_xem_tour_mauthuan: boolean; dat_nhiem_vu: boolean; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; muc_tieu_nhat_quan: number; so_lan_xu_ly_nhat_quan: number; so_lan_xu_ly_veto_nhat_quan: number; time_to_graduate_hours?: number | null; tong_lai_lenh_cap6_pct?: number | null; user_id: UUID; };

/**
 * Live Cấp 7 gate. Values are recomputed from the same allocation snapshot.
 */
export type Cap7ProgressOut = { can_doi_ok: boolean; du_lieu_day_du: boolean; entered_at: IsoDateTime; graduated_at?: IsoDateTime | null; id: UUID; ma_chua_co_gia: string[]; ma_chua_ro_nganh: string[]; ma_ty_trong_cao_nhat?: string | null; nganh_ty_trong_cao_nhat?: string | null; nguong_ty_trong_ma_pct?: number; nguong_ty_trong_nganh_pct?: number; so_ma_dang_giu: number; so_nganh_dang_giu: number; time_to_graduate_hours?: number | null; toi_thieu_ma?: number; toi_thieu_nganh?: number; ty_trong_ma_cao_nhat_pct?: number | null; ty_trong_nganh_cao_nhat_pct?: number | null; user_id: UUID; };

export type Cap8ProgressOut = { entered_at: IsoDateTime; graduated_at: IsoDateTime | null; id: UUID; muc_tieu_thoat_dung_ke_hoach?: number; so_lenh_thoat_dung_ke_hoach: number; time_to_graduate_hours: number | null; user_id: UUID; };

export type CashAdjustRequest = { amount_vnd: number; reason: string; };

export type CashAdjustResponse = { account: VTAccountAdminResponse; ledger_id: UUID; new_cash_available_vnd: number; };

/**
 * Saved drawing for a (user, symbol). `state` is null when none exists.
 */
export type ChartDrawingResponse = { state?: { [key: string]: unknown; } | null; symbol: string; updated_at?: IsoDateTime | null; };

/**
 * Save the current TradingView line-tool state for a symbol.
 */
export type ChartDrawingUpsert = { state: { [key: string]: unknown; }; };

/**
 * A single hidden form field.
 */
export type CheckoutFormField = { name: string; value: string; };

/**
 * User requests a checkout form for a plan.
 */
export type CheckoutRequest = { plan_id: UUID; };

/**
 * Checkout form data for frontend to submit to SePay.
 */
export type CheckoutResponse = { action: string; fields: CheckoutFormField[]; invoice_number: string; method?: string; order_id: UUID; };

export type CombinationSchema = { conditions?: ConditionSchema[]; logic?: "AND" | "OR"; };

export type ConditionSchema = { indicator: string; join?: "AND" | "OR" | null; op: string; value?: number | string | null; };

/**
 * Active virtual trading configuration.
 */
export type ConfigResponse = { board_lot_size: number; buy_fee_rate_bps: number; created_at: IsoDateTime; holidays: string[]; id: UUID; initial_cash_vnd: number; sell_fee_rate_bps: number; sell_tax_rate_bps: number; settlement_mode: string; trading_enabled: boolean; updated_at: IsoDateTime; };

/**
 * Partial update for virtual trading config.
 */
export type ConfigUpdate = { board_lot_size?: number | null; buy_fee_rate_bps?: number | null; holidays?: string[] | null; initial_cash_vnd?: number | null; sell_fee_rate_bps?: number | null; sell_tax_rate_bps?: number | null; settlement_mode?: string | null; trading_enabled?: boolean | null; };

/**
 * Admin detail includes full episodes with file_url.
 */
export type CourseAdminDetailResponse = { category: string; created_at: IsoDateTime; created_by_user_id: UUID | null; description: string | null; episodes?: EpisodeAdminBrief[]; id: UUID; is_premium: boolean; is_published: boolean; level: string; slug: string; thumbnail_url: string | null; title: string; total_duration_seconds: number; total_episodes: number; updated_at: IsoDateTime; };

export type CourseCreate = { category: string; description?: string | null; is_premium?: boolean; is_published?: boolean; level: CourseLevel; slug: string; title: string; };

export type CourseDetailResponse = { category: string; created_at: IsoDateTime; created_by_user_id: UUID | null; description: string | null; episodes?: EpisodeBrief[]; id: UUID; is_premium: boolean; is_published: boolean; level: string; progress_summary?: CourseProgressSummary | null; slug: string; thumbnail_url: string | null; title: string; total_duration_seconds: number; total_episodes: number; updated_at: IsoDateTime; };

export type CourseLevel = "beginner" | "intermediate" | "advanced";

export type CourseProgressSummary = { completed: number; percent: number; total: number; };

export type CourseResponse = { category: string; created_at: IsoDateTime; created_by_user_id: UUID | null; description: string | null; id: UUID; is_premium: boolean; is_published: boolean; level: string; slug: string; thumbnail_url: string | null; title: string; total_duration_seconds: number; total_episodes: number; updated_at: IsoDateTime; };

export type CourseUpdate = { category?: string | null; description?: string | null; is_premium?: boolean | null; is_published?: boolean | null; level?: CourseLevel | null; slug?: string | null; title?: string | null; };

export type DailyRevenuePoint = { date: IsoDate; paid_orders: number; revenue_vnd: number; };

/**
 * Request body for dashboard AI analysis.
 */
export type DashboardAnalyzeRequest = { include_payload?: boolean; language?: string; };

/**
 * Response for ``GET /cap2/diem-ky-luat`` — score + explanation + breakdown.
 */
export type DiemKyLuatOut = { co_giao_dich: boolean; co_tinh_huong: boolean; diem?: number | null; giai_thich: string; ngay: IsoDate; thanh_phan?: DiemKyLuatThanhPhan | null; xep_loai?: "xanh" | "vang" | "do" | null; };

/**
 * Breakdown of the 0-100 điểm kỷ luật formula — §C12c "số đến từ đâu".
 */
export type DiemKyLuatThanhPhan = { cat_lo_dung: number; cat_lo_dung_toi_da?: number; chot_loi_dung: number; chot_loi_dung_toi_da?: number; ke_hoach: number; ke_hoach_toi_da?: number; khong_nhoi: number; khong_nhoi_toi_da?: number; };

export type DynamicStopOut = { dynamic_stop_set_at: IsoDateTime; dynamic_stop_vnd: number; symbol: string; };

export type DynamicStopRequest = { dynamic_stop_vnd: number; };

/**
 * Admin episode listing — includes file_url.
 */
export type EpisodeAdminBrief = { content_type: string; created_at: IsoDateTime; description: string | null; duration_seconds: number | null; file_size_bytes: number | null; file_url: string | null; id: UUID; is_published: boolean; sort_order: number; title: string; updated_at: IsoDateTime; };

/**
 * Episode without content payload — safe for public listing.
 */
export type EpisodeBrief = { content_type: string; created_at: IsoDateTime; description: string | null; duration_seconds: number | null; file_size_bytes: number | null; id: UUID; is_published: boolean; sort_order: number; title: string; updated_at: IsoDateTime; };

/**
 * Full episode content response for authenticated user.
 */
export type EpisodeContent = { content_type: string; course_id: UUID; description: string | null; duration_seconds: number | null; file_size_bytes: number | null; file_url: string | null; id: UUID; is_published: boolean; markdown_body: string | null; sort_order: number; title: string; };

export type EpisodeContentType = "pdf" | "video" | "text";

export type EpisodeCreate = { content_type: EpisodeContentType; description?: string | null; markdown_body?: string | null; sort_order?: number | null; title: string; };

export type EpisodeUpdate = { description?: string | null; is_published?: boolean | null; markdown_body?: string | null; sort_order?: number | null; title?: string | null; };

export type ExitContextOut = { avg_cost_vnd: number; board_lot_size: number; can_update_dynamic_stop: boolean; current_price_vnd: number | null; dynamic_stop_set_at: IsoDateTime | null; dynamic_stop_vnd: number | null; original_stop_vnd: number | null; original_take_profit_vnd: number | null; proposed_sale_quantity: number; quantity_sellable: number; quantity_total: number; sector_impact: { [key: string]: unknown; }; source_buy_order_id: UUID | null; symbol: string; };

export type ExitOut = { ban_cam_xuc: boolean; classification_reason: string; dung_ke_hoach: boolean; effective_stop_vnd: number | null; exit_method: string; exited_at: IsoDateTime; filled_price_vnd: number; id: UUID; matched_buy_order_id: UUID | null; original_stop_vnd: number | null; original_take_profit_vnd: number | null; quantity: number; remaining_position_pct: number; sell_order_id: UUID; symbol: string; };

export type ExitRecordRequest = { sell_order_id: UUID; };

export type ExtendSubscriptionRequest = { days: number; reason?: string | null; };

export type FactorSelection = { id: string; value?: number | null; };

export type ForgotPasswordRequest = { email: string; };

export type FreezeAccountRequest = { reason: string; };

export type GenerateResult = { attempts: number; errors: unknown[]; generation_time_ms: number; memory_loaded: boolean; model: string; persisted: boolean; session_date: string; session_type: string; valid: boolean; };

export type HTTPValidationError = { detail?: ValidationError[]; };

/**
 * Health check response.
 */
export type HealthResponse = { app_name: string; database: string; environment: string; redis?: string; status: string; timestamp: string; version: string; };

/**
 * Tình trạng một bộ lọc trên màn Săn mã (``GET /cap5/san-ma``).
 *
 * ★ ``kha_dung`` ở đây là PHÉP THỬ RẺ (không quét sàn, không gọi mạng): nó
 * chắc chắn đúng cho 2 bộ lọc dòng tiền (thiếu nguồn là thuộc tính của
 * backend, không phụ thuộc mã), nhưng với 3 bộ lọc nến ngày nó chỉ nói "có
 * nguồn về nguyên tắc". Sự thật cuối cùng nằm ở ``kha_dung`` của
 * ``GET /cap5/san-ma/{ma}`` — FE không được cache lại giá trị từ đây.
 */
export type HuntFilterStatusOut = { dieu_kien: string; icon: string; kha_dung: boolean; ly_do_chua_kha_dung?: string | null; ma: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"; mo_ta: string; nguon_du_lieu: string; ten: string; xep_hang_theo: string; };

/**
 * Một dòng kết quả trong popup (§5.4).
 *
 * ``tin_hieu`` là chuỗi thô do SERVER dựng từ dữ liệu thật (VD "+45,2 tỷ ròng
 * · 4/5 phiên"). ``pct_thay_doi`` nullable vì phiên trước có thể thiếu giá.
 */
export type HuntItemOut = { gia_tri_xep_hang: number; gia_vnd: number; hang: number; pct_thay_doi?: number | null; symbol: string; tin_hieu: string; };

/**
 * ``GET /cap5/san-ma/{ma}`` — kết quả một bộ lọc.
 *
 * ★ BẤT BIẾN: ``kha_dung=False`` ⇔ ``tong_so_ma is None`` ⇔ ``items == []``.
 * "Chưa lọc được" (kèm ``ly_do_chua_kha_dung``) và "đã lọc, hôm nay không mã
 * nào thoả" (``kha_dung=True``, ``tong_so_ma=0``) là HAI câu khác hẳn nhau.
 */
export type HuntResultOut = { canh_bao_thieu_du_lieu?: string | null; dieu_kien: string; hien_thi_toi_da: number; icon: string; items: HuntItemOut[]; ket_qua_day_du?: boolean | null; kha_dung: boolean; loc_san: LocSanDieuKienOut[]; ly_do_chua_kha_dung?: string | null; ma: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"; mo_ta: string; nguon_du_lieu: string; so_ma_bo_qua_thieu_du_lieu?: number | null; so_ma_trong_ro: number; so_ma_truot_loc_san?: number | null; so_ma_xet?: number | null; ten: string; tong_so_ma?: number | null; xep_hang_theo: string; };

export type IPNRetryResponse = { log_id: UUID; message: string; status: string; };

/**
 * Request body for industry AI analysis.
 */
export type IndustryAnalyzeRequest = { icb_code: number; include_payload?: boolean; language?: string; };

/**
 * Request body for batch industry AI analysis.
 */
export type IndustryBatchAnalyzeRequest = { icb_codes: number[]; include_payload?: boolean; language?: string; };

/**
 * Request body for stock insight AI analysis.
 */
export type InsightAnalyzeRequest = { include_payload?: boolean; language?: string; symbol: string; };

export type JobInfo = { id: string; name: string; next_run_at: string | null; trigger: string; };

/**
 * Khối Cấp 6 đã ghi trên ``order_kehoach`` — cho panel/Kết sổ đọc lại.
 */
export type KehoachCap6Out = { conflict_level?: "nhe" | "ngai" | "nghiem" | "chua_ro" | null; conflict_level_ten?: string | null; had_conflict?: boolean | null; had_veto?: boolean | null; id: UUID; khoi_luong_pct_von?: number | null; muc_tu_tin?: number | null; nhat_quan?: boolean | null; order_id: UUID; veto_layers?: ("ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia")[] | null; veto_layers_ten?: string[] | null; };

export type KhauViRequest = { khau_vi: "than_trong" | "can_bang" | "tan_cong"; };

/**
 * Một bộ lọc ở khối ⑫ — "bộ lọc nào ra mã thắng nhiều nhất".
 *
 * ``ty_le_thang=None`` ⇔ ``du_mau=False`` = chưa đủ lệnh đã đóng để kết luận
 * (≠ 0%). ``so_lenh``/``so_lenh_thang`` là số THẬT (ta sở hữu dữ liệu lệnh).
 */
export type Khoi12ItemOut = { canh_bao?: string | null; du_mau: boolean; giai_thich: string; ma: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"; nhan?: string | null; so_lenh: number; so_lenh_thang: number; ten: string; ty_le_thang?: number | null; };

export type Khoi12Out = { best_filter?: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang" | null; du_de_ket_luan: boolean; giai_thich: string; items: Khoi12ItemOut[]; so_lenh_khong_tu_san: number; so_lenh_toi_thieu: number; };

/**
 * Phễu kỷ luật săn mã: săn → chờ đủ lớp → vào lệnh.
 */
export type Khoi13Out = { giai_thich: string; loi_ket: string; so_ma_cho_du_lop?: number | null; so_ma_cho_du_lop_day_du?: boolean; so_ma_da_cham_diem?: number; so_ma_da_san: number; so_ma_vao_lenh: number; };

/**
 * Khối ⑭ — nhận định của bạn có khớp hành động không (CHỈ soi khối lượng).
 */
export type Khoi14Out = { du_mau: boolean; giai_thich: string; nhan_xet?: string | null; rows?: Khoi14Row[]; };

/**
 * Một mức nhận định → khối lượng trung bình đã mua.
 *
 * ★ ``kl_tb_pct_von = null`` ⇔ mức này chưa có lệnh nào (≠ "mua 0% vốn").
 * ★ ``khop = null`` = KHÔNG so được: mức chưa có dữ liệu, mức ``chua_ro``
 * (không nằm trên thang nặng dần), hoặc mức nhẹ nhất đang có dữ liệu (chưa có
 * mức nào nhẹ hơn để so).
 */
export type Khoi14Row = { khop?: boolean | null; kl_tb_pct_von?: number | null; muc: "nhe" | "ngai" | "nghiem" | "chua_ro"; muc_ten: string; so_lenh: number; };

/**
 * Khối ⑮ — kết quả theo mức nhận định + số lần đứng ngoài.
 */
export type Khoi15Out = { giai_thich: string; nhan_xet?: string | null; rows?: Khoi15Row[]; so_lan_khong_mua: number; so_lan_nghiem_khong_mua: number; so_lenh_toi_thieu: number; };

/**
 * Một mức nhận định → tỷ lệ thắng của các lệnh đã đóng ở mức đó.
 *
 * ★ ``ty_le_thang_pct = null`` khi ``du_mau = False`` (< số lệnh tối thiểu) —
 * "chưa đủ dữ liệu", KHÔNG phải 0%.
 */
export type Khoi15Row = { du_mau: boolean; muc: "nhe" | "ngai" | "nghiem" | "chua_ro"; muc_ten: string; so_lenh: number; so_lenh_thang: number; ty_le_thang_pct?: number | null; };

/**
 * Single leaderboard row.
 */
export type LeaderboardEntry = { display_name: string; initial_cash_vnd: number; nav_vnd: number; profit_vnd: number; rank: number; return_pct: number; user_id: UUID; };

/**
 * Paginated leaderboard.
 */
export type LeaderboardResponse = { entries: LeaderboardEntry[]; evaluated_count: number; page: number; page_size: number; sort_by: string; total: number; total_eligible: number; };

/**
 * Một tiêu chí của LỌC SÀN (§5.2).
 *
 * ``ap_dung=False`` = server CHƯA lọc được tiêu chí này (hiện có: "loại mã diện
 * cảnh báo / kiểm soát / hạn chế giao dịch" — backend không lưu trạng thái đó).
 * FE phải nói thẳng, không được để dòng "Đã lọc: …" hứa hão.
 */
export type LocSanDieuKienOut = { ap_dung: boolean; giai_thich: string; ma: string; ten: string; };

export type LoginHistoryRow = { email: string; failure_reason: string | null; id: UUID; ip: string | null; login_at: IsoDateTime; success: boolean; user_agent: string | null; user_id: UUID | null; };

export type LoginRequest = { email: string; password: string; };

/**
 * Chấm một lớp trong 5 lớp.
 *
 * ``ung_ho=None``/``muc=None`` = CHƯA chấm được lớp này. ★ Lớp 💎 Định giá LUÔN
 * ở trạng thái này: AI Insight v2 không có lớp Định giá (L2 là Thanh khoản —
 * ánh xạ vào đó là bịa), nên mỗi mã chỉ chấm được tối đa 4/5 lớp.
 */
export type LopChiTietOut = { giai_thich: string; lop: string; muc?: "ok" | "neu" | "bad" | null; nhan?: string | null; ten: string; ung_ho?: boolean | null; };

/**
 * Một lớp thuộc phe «Ngược chiều» (bậc 1-2).
 *
 * ★ ``la_phu_quyet`` = lớp này **thuộc NHÓM có quyền phủ quyết** (📰 Tin tức ·
 * 👤 Nội bộ) — thuộc tính của LỚP, không phụ thuộc bậc; nó quyết định tag đỏ
 * "PHỦ QUYẾT". Việc lớp đó có ĐANG KÍCH HOẠT hay không là chuyện khác, nằm ở
 * ``phu_quyet_kich_hoat``/``lop_phu_quyet_xau`` (spec §5.3: "tiêu cực nhẹ"
 * KHÔNG phải phủ quyết kích hoạt).
 */
export type LopNguocOut = { bac: number; la_phu_quyet: boolean; lop: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; nhan: string; ten: string; };

/**
 * Một lớp ở bậc 3 — không nghiêng bên nào, không vẽ vào phe nào.
 */
export type LopTrungTinhOut = { lop: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; nhan: string; ten: string; };

/**
 * Một lớp thuộc phe «Ủng hộ mua» (bậc 4-5 của thang 5 bậc).
 */
export type LopUngHoOut = { bac: number; lop: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; nhan: string; ten: string; };

/**
 * One lớp's REAL win rate when the user self-rated it Ủng hộ (§7 khối ⑨).
 *
 * §C12c: every number ships with its provenance — ``n_orders``/``n_wins`` are
 * the raw counts the rate was computed from, ``giai_thich`` spells it out.
 */
export type LopWinRate = { giai_thich: string; lop: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; n_orders: number; n_wins: number; nhan: "vu_khi" | "diem_mu" | "chua_du_du_lieu" | null; ten: string; win_rate: number | null; };

/**
 * Manual confirmation of a PENDING order (no SePay IPN evidence).
 *
 * ``note`` is mandatory: it is the only record of *what* the admin actually
 * verified (bank reference, statement line, screenshot id...).
 */
export type MarkPaidRequest = { note: string; };

/**
 * Metadata attached to every market data response.
 */
export type MarketDataMeta = { as_of?: IsoDateTime; fallback_used?: boolean; raw_endpoint?: string; source: string; source_priority?: number; };

/**
 * Standard envelope for all market data endpoints.
 */
export type MarketDataResponse = { data: unknown; meta: MarketDataMeta; };

/**
 * ``GET /cap6/mau-thuan/{symbol}`` — bảng mâu thuẫn 2 phe của một mã.
 *
 * ★ ``chua_du_du_lieu = True`` là một TRẠNG THÁI THẬT (mã chưa có bản AI
 * Insight còn hiệu lực), KHÔNG phải "0 mâu thuẫn": khi đó mọi phe rỗng và FE
 * phải hiện ``ly_do_chua_du`` thay vì dựng một bảng mâu thuẫn trống.
 */
export type MauThuanOut = { canh_bao?: string | null; chua_du_du_lieu: boolean; co_mau_thuan: boolean; lop_diem_tru?: ("ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia")[]; lop_phu_quyet?: ("ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia")[]; lop_phu_quyet_xau?: ("ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia")[]; lop_phu_quyet_xau_ten?: string[]; ly_do_chua_du?: string | null; nguoc?: LopNguocOut[]; phu_quyet_kich_hoat: boolean; session_date?: IsoDate | null; so_lop_da_cham: number; symbol: string; trung_tinh?: LopTrungTinhOut[]; ung_ho?: LopUngHoOut[]; };

/**
 * Simple message response.
 */
export type MessageResponse = { detail?: string | null; message: string; };

export type MetricsOverview = { active_paid_count: number; active_subscribers: number; active_trial_count: number; active_users: number; generated_at: IsoDateTime; mrr_vnd: number; new_users_last_30d: number; new_users_last_7d: number; new_users_today: number; plan_distribution: PlanDistributionPoint[]; revenue_last_30d_vnd: number; revenue_last_7d_vnd: number; revenue_today_vnd: number; total_users: number; vt_active_accounts: number; vt_orders_today: number; };

/**
 * ``GET /cap5/nguon-san/{symbol}`` — dòng "mã này săn từ bộ lọc nào".
 *
 * ★ ``so_lop_luc_vao`` LUÔN NULL kèm ``ly_do_thieu_so_lop``: điểm đồng thuận
 * tại thời điểm đặt lệnh chưa từng được lưu. Dựng câu "vào lệnh khi lên 4/5
 * lớp" từ điểm HÔM NAY là gán một con số hiện tại cho một quyết định quá khứ.
 */
export type NguonSanOut = { canh_bao_nguon_moi_hon?: string | null; canh_bao_thieu_order_id?: string | null; first_hunted_at?: IsoDateTime | null; giai_thich: string; hunt_filter?: "ngoai" | "tudoanh" | "kl" | "dinh" | "tang" | null; hunt_filter_ten?: string | null; hunt_signal?: string | null; ly_do_thieu_so_lop?: string | null; moc_tinh_phien?: "luc_dat_lenh" | "hom_nay"; order_id?: UUID | null; so_lop_luc_vao?: number | null; so_phien_trong_watchlist?: number | null; symbol: string; tu_san_ma: boolean; };

/**
 * Request body for placing a virtual order.
 */
export type OrderCreateRequest = { limit_price_vnd?: number | null; order_type: string; quantity: number; side: string; symbol: string; };

/**
 * Paginated order list.
 */
export type OrderListResponse = { orders: OrderResponse[]; page: number; page_size: number; total: number; };

/**
 * Virtual order details.
 */
export type OrderResponse = { account_id: UUID; cancel_reason?: string | null; created_at: IsoDateTime; fee_vnd?: number | null; filled_price_vnd?: number | null; gross_amount_vnd?: number | null; id: UUID; limit_price_vnd?: number | null; mode: string; net_amount_vnd?: number | null; order_type: string; quantity: number; rejection_reason?: string | null; reserved_cash_vnd?: number; reserved_quantity?: number; side: string; status: string; symbol: string; tax_vnd?: number | null; trading_date: IsoDate; };

export type PaginatedResponse_AdminAuditLogResponse_ = { items: AdminAuditLogResponse[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_AdminPaymentOrderBrief_ = { items: AdminPaymentOrderBrief[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_AdminSubscriptionBrief_ = { items: AdminSubscriptionBrief[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_CourseResponse_ = { items: CourseResponse[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_LoginHistoryRow_ = { items: LoginHistoryRow[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_SePayIPNLogResponse_ = { items: SePayIPNLogResponse[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaginatedResponse_UserBriefResponse_ = { items: UserBriefResponse[]; page: number; page_size: number; total: number; total_pages: number; };

export type PaymentOrderBrief = { amount_vnd: number; created_at: IsoDateTime; grant_type: string | null; id: UUID; invoice_number: string; paid_at: IsoDateTime | null; plan_code: string | null; status: string; };

/**
 * Payment order data.
 */
export type PaymentOrderResponse = { amount_vnd: number; created_at: IsoDateTime; currency: string; grant_type: string | null; id: UUID; invoice_number: string; paid_at: IsoDateTime | null; status: string; };

/**
 * ``GET /cap6/phan-tich`` — 2 khối mới của Phân tích danh mục Cấp 6.
 */
export type PhanTichOut = { khoi_14: Khoi14Out; khoi_15: Khoi15Out; };

export type PlacementRequest = { has_traded_before: boolean; };

export type PlacementResponse = { placed_level: number; };

export type PlanBrief = { code: string; duration_days: number; id: UUID; name: string; price_vnd: number; };

/**
 * Admin creates a new premium plan.
 */
export type PlanCreate = { code: string; description?: string | null; duration_days: number; is_active?: boolean; name: string; price_vnd: number; sort_order?: number; };

export type PlanDistributionPoint = { active_subscriptions: number; plan_code: string; plan_name: string; price_vnd: number; };

/**
 * Plan data returned to clients.
 */
export type PlanResponse = { code: string; created_at: IsoDateTime; description: string | null; duration_days: number; id: UUID; is_active: boolean; name: string; price_vnd: number; sort_order: number; updated_at: IsoDateTime; };

/**
 * Admin updates a plan (all fields optional).
 */
export type PlanUpdate = { description?: string | null; duration_days?: number | null; is_active?: boolean | null; name?: string | null; price_vnd?: number | null; sort_order?: number | null; };

/**
 * A serializable allocation snapshot and its exact balance decision.
 *
 * ``known_sector_count`` counts distinct resolved sectors among all held
 * symbols. A known sector on an unpriced position still counts as known, but
 * that position is absent from ``sectors`` because its sector *weight* cannot
 * be measured. ``data_complete`` and ``can_doi_ok`` remain false until every
 * positive position has both a price and a resolved sector.
 */
export type PortfolioBalanceSnapshot = { can_doi_ok: boolean; cash_vnd?: number | null; cash_weight_pct?: number | null; data_complete: boolean; held_symbol_count: number; known_sector_count: number; max_sector?: string | null; max_sector_weight_pct?: number | null; max_symbol?: string | null; max_symbol_weight_pct?: number | null; nav_vnd: number; positions: SymbolAllocation[]; sectors: SectorAllocation[]; unknown_sector_symbols: string[]; unpriced_symbols: string[]; };

/**
 * Full portfolio with account summary and positions.
 */
export type PortfolioResponse = { account: AccountResponse; nav_vnd: number; positions: PositionResponse[]; refresh_warnings?: string[]; return_pct: number; total_market_value_vnd: number; total_unrealized_pnl_vnd: number; };

/**
 * A single portfolio position.
 */
export type PositionResponse = { avg_cost_vnd: number; current_price_vnd?: number | null; market_value_vnd?: number | null; quantity_pending: number; quantity_reserved: number; quantity_sellable: number; quantity_total: number; symbol: string; unrealized_pnl_vnd?: number | null; };

/**
 * Validated request body for POST /trading/price-board.
 */
export type PriceBoardRequest = { source?: string; symbols: string[]; };

export type ProgressRow = { completed_at: IsoDateTime | null; course_id: UUID; created_at: IsoDateTime; episode_id: UUID; last_position_seconds: number | null; updated_at: IsoDateTime; };

export type ProgressUpdate = { completed?: boolean | null; last_position_seconds?: number | null; };

export type ReconcileRequest = { note?: string | null; };

/**
 * Result of processing pending orders and settlements.
 */
export type RefreshResponse = { orders_expired: number; orders_filled: number; settlements_settled: number; warnings?: string[]; };

export type RefreshTokenRequest = { refresh_token: string; };

export type RefundRequest = { reason: string; };

export type ReorderItem = { episode_id: UUID; sort_order: number; };

export type ReorderRequest = { items: ReorderItem[]; };

export type ResendVerificationResponse = { message?: string; };

export type ResetPasswordRequest = { new_password: string; token: string; };

export type ResetPasswordResponse = { temporary_password: string; warning?: string; };

/**
 * Result of account reset.
 */
export type ResetResponse = { accounts_reset: number; message: string; };

export type RiskInput = { fee?: "standard" | "low" | "none"; max_holding?: number | null; position_fixed_amount?: number; position_size?: "all" | "half" | "quarter" | "tenth" | "fixed"; stop_atr_mult?: number; stop_fixed_pct?: number; stop_loss?: "none" | "atr" | "fixed"; take_profit_pct?: number | null; };

export type RunJobResponse = { job_id: string; ran_at: IsoDateTime; result: { [key: string]: unknown; }; };

/**
 * ``GET /cap5/san-ma`` — lọc sàn + 5 bộ lọc (chưa mở popup nào).
 */
export type SanMaIndexOut = { bo_loc: HuntFilterStatusOut[]; hien_thi_toi_da: number; loc_san: LocSanDieuKienOut[]; so_ma_trong_ro: number; };

/**
 * Một tiêu chí lọc.
 */
export type ScreeningFilter = { conditionOptions?: ScreeningFilterCondition[]; extraName?: string | null; name: string; };

/**
 * Một điều kiện lọc trong filter.
 */
export type ScreeningFilterCondition = { from?: number | number | null; to?: number | number | null; type?: string | null; value?: string | null; };

/**
 * Validated request body for POST /screening/search.
 */
export type ScreeningPagingRequest = { filter?: ScreeningFilter[]; page?: number; pageSize?: number; sortFields?: string[]; sortOrders?: string[]; };

export type SePayIPNLogResponse = { error_message: string | null; id: UUID; matched_order_id: UUID | null; raw_body?: { [key: string]: unknown; } | null; raw_headers?: { [key: string]: unknown; } | null; received_at: IsoDateTime; result_status: string | null; secret_key_valid: boolean; sepay_transaction_id: string | null; };

/**
 * The priced market value and NAV weight of one known ICB sector.
 */
export type SectorAllocation = { market_value_vnd: number; sector: string; weight_pct?: number | null; };

/**
 * Một lần «Không mua lần này» đã ghi.
 */
export type SkipOut = { at: IsoDateTime; conflict_level: "nhe" | "ngai" | "nghiem" | "chua_ro"; conflict_level_ten: string; had_conflict?: boolean | null; had_veto?: boolean | null; id: UUID; symbol: string; };

/**
 * ``POST /cap6/skip`` — quyết định đứng ngoài, lấy mức nhận định làm lý do.
 */
export type SkipRequest = { conflict_level: "nhe" | "ngai" | "nghiem" | "chua_ro"; symbol: string; };

export type StrategySide = { factors?: FactorSelection[]; logic?: "AND" | "OR"; };

export type SubscriptionBrief = { cancel_reason?: string | null; cancelled_at?: IsoDateTime | null; cancelled_by_user_id?: UUID | null; current_period_end: IsoDateTime; current_period_start: IsoDateTime; id: UUID; is_trial: boolean; plan: PlanBrief | null; status: string; };

/**
 * User's current premium subscription status.
 */
export type SubscriptionResponse = { current_period_end: IsoDateTime | null; current_period_start: IsoDateTime | null; current_plan?: PlanResponse | null; is_premium: boolean; is_trial?: boolean; status: string | null; };

/**
 * One held symbol, retaining unknown pricing and sector states explicitly.
 */
export type SymbolAllocation = { market_value_vnd?: number | null; sector?: string | null; symbol: string; weight_pct?: number | null; };

export type SyncPlanOut = { dynamic_stop_set_at?: null; dynamic_stop_vnd?: null; original_stop_vnd: number; original_take_profit_vnd: number; source_buy_order_id: UUID; symbol: string; };

export type SyncPlanRequest = { buy_order_id: UUID; };

export type SystemStatus = { db_stats: { [key: string]: number; }; environment: string; generated_at: IsoDateTime; jobs: JobInfo[]; last_ipn_processed_count_24h: number; last_ipn_received_at: IsoDateTime | null; scheduler_running: boolean; version: string; };

export type TelegramLinkResponse = { deep_link: string; token: string; };

export type TelegramStatusResponse = { bot_username?: string | null; linked: boolean; linked_at?: IsoDateTime | null; };

export type TokenResponse = { access_token: string; refresh_token: string; token_type?: string; };

/**
 * Paginated trade list.
 */
export type TradeListResponse = { page: number; page_size: number; total: number; trades: TradeResponse[]; };

/**
 * Executed trade details.
 */
export type TradeResponse = { fee_vnd: number; gross_amount_vnd: number; id: UUID; net_amount_vnd: number; order_id: UUID; price_source: string; price_time: IsoDateTime; price_vnd: number; quantity: number; side: string; symbol: string; tax_vnd: number; traded_at: IsoDateTime; };

export type UnfreezeAccountRequest = { reason?: string | null; };

export type User360Response = { login_history: LoginHistoryRow[]; payment_history: PaymentOrderBrief[]; subscription: SubscriptionBrief | null; subscription_history: SubscriptionBrief[]; trial_used: boolean; user: UserBriefForAdmin; vt_account: VTAccountBrief | null; vt_recent_orders: VTOrderBrief[]; };

/**
 * Subscribe to a preset (``signal_key``) or define a custom rule.
 */
export type UserAlertRuleCreate = { combination?: CombinationSchema | null; is_enabled?: boolean; name?: string | null; side?: "buy" | "sell" | null; signal_key?: string | null; };

export type UserAlertRuleResponse = { base_signal_key: string | null; combination: { [key: string]: unknown; }; created_at: IsoDateTime; id: UUID; is_enabled: boolean; name: string; side: string; updated_at: IsoDateTime; };

export type UserAlertRuleUpdate = { combination?: CombinationSchema | null; is_enabled?: boolean | null; name?: string | null; };

export type UserBriefForAdmin = { created_at: IsoDateTime; email: string; full_name: string; id: UUID; is_email_verified: boolean; last_login_at: IsoDateTime | null; phone_number: string | null; role: string; status: string; };

/**
 * Minimal user representation for listings.
 */
export type UserBriefResponse = { created_at: IsoDateTime; email: string; full_name: string; id: UUID; role: UserRole; status: UserStatus; };

/**
 * Registration request.
 */
export type UserCreate = { email: string; full_name: string; password: string; phone_number?: string | null; };

/**
 * Public user representation — never includes hashed_password.
 */
export type UserResponse = { avatar_url?: string | null; city?: string | null; country?: string | null; created_at: IsoDateTime; date_of_birth?: IsoDate | null; district?: string | null; email: string; email_verified_at?: IsoDateTime | null; full_name: string; gender?: string | null; id: UUID; is_email_verified: boolean; last_login_at?: IsoDateTime | null; phone_country_code?: string | null; phone_e164?: string | null; phone_national_number?: string | null; phone_number?: string | null; phone_verified_at?: IsoDateTime | null; postal_code?: string | null; province_state?: string | null; role: UserRole; status: UserStatus; street_address?: string | null; updated_at: IsoDateTime; ward?: string | null; };

/**
 * User role enumeration.
 */
export type UserRole = "admin" | "user" | "premium";

/**
 * User account status enumeration.
 */
export type UserStatus = "active" | "inactive" | "suspended" | "deleted";

/**
 * Self-profile update — users can only update these fields.
 */
export type UserUpdate = { avatar_url?: string | null; city?: string | null; country?: string | null; date_of_birth?: IsoDate | null; district?: string | null; full_name?: string | null; gender?: string | null; phone_number?: string | null; postal_code?: string | null; province_state?: string | null; street_address?: string | null; ward?: string | null; };

export type VTAccountAdminResponse = { activated_at: IsoDateTime | null; cash_available_vnd: number; cash_pending_vnd: number; cash_reserved_vnd: number; created_at: IsoDateTime; freeze_reason: string | null; frozen_at: IsoDateTime | null; frozen_by_user_id: UUID | null; id: UUID; initial_cash_vnd: number; status: string; user_id: UUID; };

export type VTAccountBrief = { activated_at: IsoDateTime | null; cash_available_vnd: number; cash_pending_vnd: number; cash_reserved_vnd: number; freeze_reason?: string | null; frozen_at?: IsoDateTime | null; id: UUID; initial_cash_vnd: number; status: string; };

export type VTAccountStatsResponse = { account_id: UUID; gross_buy_vnd: number; gross_sell_vnd: number; realized_pnl_vnd: number; total_orders: number; total_trades: number; turnover_vnd: number; win_rate?: number | null; };

export type VTOrderBrief = { created_at: IsoDateTime; id: UUID; price_vnd: number | null; quantity: number; side: string; status: string; symbol: string; };

export type VTPositionResponse = { account_id: UUID; avg_cost_vnd: number; created_at: IsoDateTime; id: UUID; quantity_pending: number; quantity_reserved: number; quantity_sellable: number; quantity_total: number; symbol: string; };

export type ValidationError = { ctx?: {  }; input?: unknown; loc: (string | number)[]; msg: string; type: string; };

/**
 * Response for ``GET /cap4/vu-khi-diem-mu`` (spec §7 khối ⑨) — per-lớp win
 * rate sorted desc, plus the identified vũ khí / điểm mù.
 */
export type VuKhiDiemMuOut = { diem_mu_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null; giai_thich: string; lop: LopWinRate[]; nguong_diem_mu: number; nguong_vu_khi: number; so_lenh_toi_thieu: number; vu_khi_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null; };

/**
 * Add a symbol to the watchlist.
 */
export type WatchlistAddRequest = { symbol: string; };

/**
 * Single watchlist item.
 */
export type WatchlistItemResponse = { created_at: IsoDateTime; id: UUID; sort_order: number; symbol: string; };

/**
 * Reorder watchlist items.
 */
export type WatchlistReorderRequest = { symbols: string[]; };

/**
 * Full watchlist for a user.
 */
export type WatchlistResponse = { count: number; items: WatchlistItemResponse[]; };

export type _SnapshotMeta = { snapshot_date: string | null; stale_count: number; };

export type _SnapshotResponse = { data: _SnapshotRow[]; meta: _SnapshotMeta; };

export type _SnapshotRow = { asset_category: string; change_percent: number; change_value: number; currency?: string | null; day_high?: number | null; day_low?: number | null; fetched_at: string; last_price: number; market_state?: string | null; market_time?: string | null; name: string; previous_close: number; snapshot_date: string; source: string; stale: boolean; symbol: string; volume?: number | null; };

export type app__schemas__cap0__TaskRequest = { gate?: "debrief" | null; task_no: number; };

export type app__schemas__cap1__KehoachRequest = { co_bam_doc_chi_tiet?: boolean; lyDo: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; order_id: UUID; snapshot?: { [key: string]: unknown; } | null; trangThai_luc_dat: "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"; vung_mua: number; };

export type app__schemas__cap1__KetsoRequest = { cam_xuc?: "binh_tinh" | "so" | "hoi_tiec" | "khong_ro" | null; order_id: UUID; };

export type app__schemas__cap1__OrderKehoachOut = { co_bam_doc_chi_tiet: boolean; id: UUID; lyDo: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"; order_id: UUID; snapshot_lop_du_lieu?: { [key: string]: unknown; } | null; trangThai_luc_dat: "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"; vung_mua: number; };

export type app__schemas__cap1__OrderKetsoOut = { cam_xuc?: "binh_tinh" | "so" | "hoi_tiec" | "khong_ro" | null; closed_at: IsoDateTime; gia_ra: number; id: UUID; order_id: UUID; pnl_pct: number; pnl_vnd: number; so_ngay_lich: number; so_phien_giu: number; };

export type app__schemas__cap1__TaskRequest = { task_no: number; };

export type app__schemas__cap2__KehoachRequest = { cat_lo: number; chot_loi: number; order_id: UUID; phuong_phap_sl_tp: "ho_tro_khang_cu" | "bien_do_dao_dong"; };

export type app__schemas__cap2__KetsoRequest = { ban_som_khi_lo_nhe?: boolean; cham_SL_cat_dung_phien_ke?: boolean; cham_SL_cuoi_phien?: boolean; cham_SL_khong_cat?: boolean; cham_TP_giu_lam_hut?: boolean; giu_cham_SL_bao_nhieu_phien?: number | null; nhoi_lenh_khi_lo?: boolean; order_id: UUID; };

/**
 * Cấp 2's view of ``order_kehoach`` — Cấp 1's fields + the SL/TP commitment.
 */
export type app__schemas__cap2__OrderKehoachOut = { cat_lo?: number | null; chot_loi?: number | null; id: UUID; order_id: UUID; phuong_phap_sl_tp?: "ho_tro_khang_cu" | "bien_do_dao_dong" | null; vung_mua: number; };

/**
 * Cấp 2's view of ``order_ketso`` — Cấp 1's fields + the 7 discipline flags.
 */
export type app__schemas__cap2__OrderKetsoOut = { ban_som_khi_lo_nhe: boolean; cham_SL_cat_dung_phien_ke: boolean; cham_SL_cuoi_phien: boolean; cham_SL_khong_cat: boolean; cham_TP_giu_lam_hut: boolean; closed_at: IsoDateTime; gia_ra: number; giu_cham_SL_bao_nhieu_phien?: number | null; id: UUID; nhoi_lenh_khi_lo: boolean; order_id: UUID; pnl_pct: number; pnl_vnd: number; };

export type app__schemas__cap2__TaskRequest = { task_no: number; };

export type app__schemas__cap3__KehoachRequest = { cach_khoi_luong: "linh_hoat" | "ky_luat"; khau_vi: "than_trong" | "can_bang" | "tan_cong"; khoi_luong: number; muc_tu_tin: 1 | 2 | 3; order_id: UUID; pct_von: number; };

/**
 * Cấp 3's view of ``order_kehoach`` — Cấp 1's fields + the quản lý vốn block.
 */
export type app__schemas__cap3__OrderKehoachOut = { cach_khoi_luong?: "linh_hoat" | "ky_luat" | null; id: UUID; khau_vi?: "than_trong" | "can_bang" | "tan_cong" | null; khoi_luong?: number | null; muc_tu_tin?: number | null; order_id: UUID; pct_von?: number | null; vung_mua: number; };

export type app__schemas__cap3__TaskRequest = { task_no: 1 | 2; };

/**
 * ``POST /cap4/kehoach`` — khối "Đọc 5 lớp" ghi thêm vào kế hoạch đã có.
 *
 * ``doc_5_lop``/``ai_5_lop`` are validated in the service layer (keys must be
 * the 5 lớp, values one of ok/neu/bad) so bad payloads produce a single,
 * Vietnamese ``BadRequestError`` message instead of a pydantic dump.
 *
 * ``so_lop_dong_thuan``/``so_lop_khac_ai`` are ADVISORY: the server always
 * recomputes them from the two blobs above (never trust the client).
 */
export type app__schemas__cap4__KehoachRequest = { ai_5_lop?: { [key: string]: unknown; } | unknown[] | null; doc_5_lop?: { [key: string]: unknown; } | unknown[] | null; order_id: UUID; so_lop_dong_thuan?: number | null; so_lop_khac_ai?: number | null; };

/**
 * Cấp 4's view of ``order_kehoach`` — Cấp 1's fields + the đọc-5-lớp block.
 */
export type app__schemas__cap4__OrderKehoachOut = { ai_5_lop?: { [key: string]: "ok" | "neu" | "bad"; } | null; doc_5_lop?: { [key: string]: "ok" | "neu" | "bad"; } | null; id: UUID; order_id: UUID; so_lop_dong_thuan?: number | null; so_lop_khac_ai?: number | null; vung_mua: number; };

/**
 * ``PATCH /cap4/task`` — Cấp 4 chỉ còn nhiệm vụ ①, nên ``task_no`` hợp lệ
 * duy nhất là 1 (service ném ``BadRequestError`` cho mọi giá trị khác).
 */
export type app__schemas__cap4__TaskRequest = { task_no: number; };

/**
 * ``PATCH /cap5/task`` — chỉ kích hoạt tính lại (1 hoặc 2).
 */
export type app__schemas__cap5__TaskRequest = { task_no: number; };

/**
 * ``POST /cap6/kehoach`` — mức nhận định mâu thuẫn cho 1 lệnh MUA.
 *
 * ★ ``conflict_level`` là thứ DUY NHẤT client được gửi.
 * ``had_conflict``/``had_veto``/``veto_layers`` do SERVER suy lại từ AI
 * Insight của mã — client khai được chúng là client tự cấp cho mình điều kiện
 * tốt nghiệp.
 */
export type app__schemas__cap6__KehoachRequest = { conflict_level: "nhe" | "ngai" | "nghiem" | "chua_ro"; order_id: UUID; };
