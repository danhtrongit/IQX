/**
 * IQX Backend — TypeScript declarations sinh TỰ ĐỘNG từ OpenAPI schema
 * của backend FastAPI đang chạy (`app.openapi()`).
 *
 * KHÔNG sửa tay file này. Đây là bản dịch máy móc, dùng làm NGUỒN SỰ THẬT về
 * hình dạng request/response khi viết lại backend bằng TypeScript.
 *
 * Quy ước dịch:
 *   - `integer` | `number`            -> number
 *   - `string` (mọi format)           -> string   (xem alias có thương hiệu bên dưới)
 *   - Pydantic `X | None`             -> `X | null`  (anyOf [..., {type: null}])
 *   - Field không nằm trong `required`-> optional (`?`)
 *   - `Literal[...]` / Enum           -> union literal type
 *   - dict thô / additionalProperties -> Record<string, unknown>
 *
 * CẢNH BÁO: nhiều handler dữ liệu thị trường trả `dict` thô từ provider, nên
 * OpenAPI chỉ ghi `Record<string, unknown>`. Hình dạng thật của những response đó
 * nằm trong các chương endpoint (22-27) và chương 07 (tích hợp ngoài).
 *
 * Số schema: 229
 * Sinh từ: IQX API v0.1.0
 */

/** UUID v4 dạng chuỗi, ví dụ "3f2504e0-4f89-11d3-9a0c-0305e82c3301" */
export type UUID = string;
/** ISO 8601 datetime, ví dụ "2026-08-17T09:30:00+07:00" */
export type IsoDateTime = string;
/** Ngày dạng "YYYY-MM-DD" */
export type IsoDate = string;
/** Ngày phiên giao dịch, "YYYY-MM-DD" theo giờ ICT (UTC+7) */
export type SessionDate = string;
/** Số thập phân giữ dạng chuỗi để không mất chính xác (tiền, giá, khối lượng lớn) */
export type DecimalString = string;


// ──────────────────────────────────────────────────────────────────────────
// (dùng chung nhiều nhóm)
// ──────────────────────────────────────────────────────────────────────────

/** Dùng bởi: Admin · Cảnh báo, Cảnh báo */
export interface AlertSignalResponse {
  key: string;
  side: string;
  ta_name: string;
  message_title: string;
  combination: Record<string, unknown>;
  is_enabled: boolean;
  sort_order: number;
}

/** Dùng bởi: Admin · Cảnh báo, Cảnh báo */
export interface CombinationSchema {
  logic?: "AND" | "OR";
  conditions?: ConditionSchema[];
}

/** Dùng bởi: Admin · Cảnh báo, Cảnh báo */
export interface ConditionSchema {
  indicator: string;
  op: string;
  value?: number | string | null;
  join?: "AND" | "OR" | null;
}

/** Dùng bởi: Bài học, Quản trị: Bài học */
export interface CourseResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  level: string;
  category: string;
  is_premium: boolean;
  is_published: boolean;
  total_episodes: number;
  total_duration_seconds: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Dùng bởi: AI Mô hình dự báo, AI Mẫu hình, AI Phân tích, Admin - Audit, Admin - IPN Logs, Admin - Payments, Admin - Subscriptions, Admin · Cảnh báo, Backtest, Bài học, Bản vẽ biểu đồ, Cảnh báo, Cấp 0, Cấp 1, Cấp 2, Cấp 3, Cấp 4, Cấp 5, Cấp 6, Cấp 7, Cấp 8, Danh mục theo dõi, Dữ liệu thị trường: Báo giá, Dữ liệu thị trường: Bộ lọc cổ phiếu, Dữ liệu thị trường: Công ty, Dữ liệu thị trường: Cơ bản, Dữ liệu thị trường: Giao dịch, Dữ liệu thị trường: Ngành, Dữ liệu thị trường: Phân tích, Dữ liệu thị trường: Quốc tế, Dữ liệu thị trường: Quỹ, Dữ liệu thị trường: Sự kiện, Dữ liệu thị trường: Tham chiếu, Dữ liệu thị trường: Tin AI, Dữ liệu thị trường: Tin tức, Dữ liệu thị trường: Tổng quan, Dữ liệu thị trường: Vĩ mô, Giao dịch ảo, Giao dịch ảo (quản trị), Người dùng, Nhận định thị trường, Premium, Quản trị: Bài học, Quản trị: Giao dịch ảo, Quản trị: Hệ thống, Quản trị: Người dùng, Quản trị: Số liệu, Telegram, Xác thực */
export interface HTTPValidationError {
  detail?: ValidationError[];
}

/** Metadata attached to every market data response. */
/** Dùng bởi: Dữ liệu thị trường: Báo giá, Dữ liệu thị trường: Công ty, Dữ liệu thị trường: Cơ bản, Dữ liệu thị trường: Giao dịch, Dữ liệu thị trường: Google Sheets, Dữ liệu thị trường: Phân tích, Dữ liệu thị trường: Quốc tế, Dữ liệu thị trường: Quỹ, Dữ liệu thị trường: Sự kiện, Dữ liệu thị trường: Tham chiếu, Dữ liệu thị trường: Tin tức, Dữ liệu thị trường: Vĩ mô */
export interface MarketDataMeta {
  /** Data source that served this response (e.g. VCI, VND) */
  source: string;
  /** Priority of source used (1=primary, 2+=fallback) */
  source_priority?: number;
  /** Whether a fallback source was used */
  fallback_used?: boolean;
  /** Timestamp when data was fetched */
  as_of?: string;
  /** Upstream URL that was called */
  raw_endpoint?: string;
}

/** Standard envelope for all market data endpoints. */
/** Dùng bởi: Dữ liệu thị trường: Báo giá, Dữ liệu thị trường: Công ty, Dữ liệu thị trường: Cơ bản, Dữ liệu thị trường: Giao dịch, Dữ liệu thị trường: Google Sheets, Dữ liệu thị trường: Phân tích, Dữ liệu thị trường: Quốc tế, Dữ liệu thị trường: Quỹ, Dữ liệu thị trường: Sự kiện, Dữ liệu thị trường: Tham chiếu, Dữ liệu thị trường: Tin tức, Dữ liệu thị trường: Vĩ mô */
export interface MarketDataResponse {
  data: unknown;
  meta: MarketDataMeta;
}

/** Simple message response. */
/** Dùng bởi: Người dùng, Xác thực */
export interface MessageResponse {
  message: string;
  detail?: string | null;
}

/** Dùng bởi: Bài học, Quản trị: Bài học */
export interface PaginatedResponse_CourseResponse_ {
  items: CourseResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Public user representation — never includes hashed_password. */
/** Dùng bởi: Người dùng, Xác thực */
export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string | null;
  phone_country_code?: string | null;
  phone_national_number?: string | null;
  phone_e164?: string | null;
  phone_verified_at?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  country?: string | null;
  province_state?: string | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  email_verified_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** User role enumeration. */
/** Dùng bởi: Người dùng, Xác thực */
export type UserRole = "admin" | "user" | "premium";

/** User account status enumeration. */
/** Dùng bởi: Người dùng, Xác thực */
export type UserStatus = "active" | "inactive" | "suspended" | "deleted";

/** Dùng bởi: AI Mô hình dự báo, AI Mẫu hình, AI Phân tích, Admin - Audit, Admin - IPN Logs, Admin - Payments, Admin - Subscriptions, Admin · Cảnh báo, Backtest, Bài học, Bản vẽ biểu đồ, Cảnh báo, Cấp 0, Cấp 1, Cấp 2, Cấp 3, Cấp 4, Cấp 5, Cấp 6, Cấp 7, Cấp 8, Danh mục theo dõi, Dữ liệu thị trường: Báo giá, Dữ liệu thị trường: Bộ lọc cổ phiếu, Dữ liệu thị trường: Công ty, Dữ liệu thị trường: Cơ bản, Dữ liệu thị trường: Giao dịch, Dữ liệu thị trường: Ngành, Dữ liệu thị trường: Phân tích, Dữ liệu thị trường: Quốc tế, Dữ liệu thị trường: Quỹ, Dữ liệu thị trường: Sự kiện, Dữ liệu thị trường: Tham chiếu, Dữ liệu thị trường: Tin AI, Dữ liệu thị trường: Tin tức, Dữ liệu thị trường: Tổng quan, Dữ liệu thị trường: Vĩ mô, Giao dịch ảo, Giao dịch ảo (quản trị), Người dùng, Nhận định thị trường, Premium, Quản trị: Bài học, Quản trị: Giao dịch ảo, Quản trị: Hệ thống, Quản trị: Người dùng, Quản trị: Số liệu, Telegram, Xác thực */
export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}


// ──────────────────────────────────────────────────────────────────────────
// AI Phân tích
// ──────────────────────────────────────────────────────────────────────────

/** Request body for dashboard AI analysis. */
export interface DashboardAnalyzeRequest {
  /** Ngôn ngữ đầu ra: vi hoặc en */
  language?: string;
  /** Bao gồm dữ liệu payload thô trong response (mặc định: false) */
  include_payload?: boolean;
}

/** Request body for industry AI analysis. */
export interface IndustryAnalyzeRequest {
  /** Mã ngành ICB (ví dụ: 8300, 9500) */
  icb_code: number;
  /** Ngôn ngữ đầu ra: vi hoặc en */
  language?: string;
  /** Bao gồm dữ liệu payload thô trong response (mặc định: false) */
  include_payload?: boolean;
}

/** Request body for batch industry AI analysis. */
export interface IndustryBatchAnalyzeRequest {
  /** Danh sách mã ngành ICB (tối đa 20, ví dụ: [8300, 9500]) */
  icb_codes: number[];
  /** Ngôn ngữ đầu ra: vi hoặc en */
  language?: string;
  /** Bao gồm dữ liệu payload thô trong response (mặc định: false) */
  include_payload?: boolean;
}

/** Request body for stock insight AI analysis. */
export interface InsightAnalyzeRequest {
  /** Mã cổ phiếu (ví dụ: VCB, FPT) */
  symbol: string;
  /** Ngôn ngữ đầu ra: vi hoặc en */
  language?: string;
  /** Bao gồm dữ liệu payload thô trong response (mặc định: false) */
  include_payload?: boolean;
}


// ──────────────────────────────────────────────────────────────────────────
// Admin - Audit
// ──────────────────────────────────────────────────────────────────────────

export interface AdminAuditLogResponse {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  target_entity: string | null;
  target_id: string | null;
  payload_before: Record<string, unknown> | null;
  payload_after: Record<string, unknown> | null;
  note: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
}

export interface PaginatedResponse_AdminAuditLogResponse_ {
  items: AdminAuditLogResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Admin - IPN Logs
// ──────────────────────────────────────────────────────────────────────────

export interface IPNRetryResponse {
  status: string;
  log_id: string;
  message: string;
}

export interface PaginatedResponse_SePayIPNLogResponse_ {
  items: SePayIPNLogResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SePayIPNLogResponse {
  id: string;
  received_at: string;
  secret_key_valid: boolean;
  result_status: string | null;
  matched_order_id: string | null;
  sepay_transaction_id: string | null;
  error_message: string | null;
  raw_body?: Record<string, unknown> | null;
  raw_headers?: Record<string, unknown> | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Admin - Payments
// ──────────────────────────────────────────────────────────────────────────

export interface AdminPaymentOrderBrief {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  currency: string;
  status: string;
  grant_type: string | null;
  paid_at: string | null;
  created_at: string;
  plan_id: string;
  plan_name: string | null;
  plan_code: string | null;
  user_id: string;
  user_email: string | null;
  ipn_log_count: number;
}

export interface AdminPaymentOrderDetail {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  currency: string;
  status: string;
  grant_type: string | null;
  grant_note: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  plan_id: string;
  plan_name: string | null;
  plan_code: string | null;
  plan_price_vnd: number | null;
  user_id: string;
  user_email: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  ipn_logs: Array<Record<string, unknown>>;
}

/** Manual confirmation of a PENDING order (no SePay IPN evidence). ``note`` is mandatory: it is the only record of *what* the admin actually verified (bank reference, statement line, screenshot id...). */
export interface MarkPaidRequest {
  /** Bằng chứng admin đã đối chiếu (mã giao dịch ngân hàng, sao kê, ảnh bill...) */
  note: string;
}

export interface PaginatedResponse_AdminPaymentOrderBrief_ {
  items: AdminPaymentOrderBrief[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ReconcileRequest {
  note?: string | null;
}

export interface RefundRequest {
  reason: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Admin - Subscriptions
// ──────────────────────────────────────────────────────────────────────────

export interface AdminSubscriptionBrief {
  id: string;
  user_id: string;
  user_email: string | null;
  current_plan_id: string | null;
  plan_name: string | null;
  plan_code: string | null;
  current_period_start: string;
  current_period_end: string;
  status: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface AdminSubscriptionDetail {
  id: string;
  user_id: string;
  user_email: string | null;
  current_plan_id: string | null;
  plan_name: string | null;
  plan_code: string | null;
  current_period_start: string;
  current_period_end: string;
  status: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  cancelled_by_user_id: string | null;
}

export interface CancelSubscriptionRequest {
  reason: string;
}

export interface ExtendSubscriptionRequest {
  days: number;
  reason?: string | null;
}

export interface PaginatedResponse_AdminSubscriptionBrief_ {
  items: AdminSubscriptionBrief[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Admin · Cảnh báo
// ──────────────────────────────────────────────────────────────────────────

export interface AlertSignalAdminCreate {
  side: "buy" | "sell";
  ta_name: string;
  message_title: string;
  combination: CombinationSchema;
  is_enabled?: boolean;
  sort_order?: number;
  key: string;
}

export interface AlertSignalAdminUpsert {
  side: "buy" | "sell";
  ta_name: string;
  message_title: string;
  combination: CombinationSchema;
  is_enabled?: boolean;
  sort_order?: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Backtest
// ──────────────────────────────────────────────────────────────────────────

export interface BacktestRunRequest {
  symbol: string;
  start: string;
  end: string;
  capital?: number;
  buy: StrategySide;
  sell?: StrategySide;
  risk?: RiskInput;
}

export interface BacktestStrategyCreate {
  name: string;
  symbol?: string | null;
  config: Record<string, unknown>;
}

export interface BacktestStrategyResponse {
  id: string;
  name: string;
  symbol: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BacktestStrategyUpdate {
  name?: string | null;
  symbol?: string | null;
  config?: Record<string, unknown> | null;
}

export interface FactorSelection {
  id: string;
  value?: number | null;
}

export interface RiskInput {
  stop_loss?: "none" | "atr" | "fixed";
  stop_atr_mult?: number;
  stop_fixed_pct?: number;
  take_profit_pct?: number | null;
  max_holding?: number | null;
  position_size?: "all" | "half" | "quarter" | "tenth" | "fixed";
  position_fixed_amount?: number;
  fee?: "standard" | "low" | "none";
}

export interface StrategySide {
  logic?: "AND" | "OR";
  factors?: FactorSelection[];
}


// ──────────────────────────────────────────────────────────────────────────
// Bài học
// ──────────────────────────────────────────────────────────────────────────

export interface CourseDetailResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  level: string;
  category: string;
  is_premium: boolean;
  is_published: boolean;
  total_episodes: number;
  total_duration_seconds: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  episodes?: EpisodeBrief[];
  progress_summary?: CourseProgressSummary | null;
}

export interface CourseProgressSummary {
  completed: number;
  total: number;
  percent: number;
}

/** Episode without content payload — safe for public listing. */
export interface EpisodeBrief {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** Full episode content response for authenticated user. */
export interface EpisodeContent {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: string;
  file_url: string | null;
  markdown_body: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  sort_order: number;
  is_published: boolean;
}

export interface ProgressRow {
  episode_id: string;
  course_id: string;
  completed_at: string | null;
  last_position_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProgressUpdate {
  completed?: boolean | null;
  last_position_seconds?: number | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Bản vẽ biểu đồ
// ──────────────────────────────────────────────────────────────────────────

/** Saved drawing for a (user, symbol). `state` is null when none exists. */
export interface ChartDrawingResponse {
  symbol: string;
  state?: Record<string, unknown> | null;
  updated_at?: string | null;
}

/** Save the current TradingView line-tool state for a symbol. */
export interface ChartDrawingUpsert {
  /** Serialized LineToolsAndGroupsState */
  state: Record<string, unknown>;
}


// ──────────────────────────────────────────────────────────────────────────
// Cảnh báo
// ──────────────────────────────────────────────────────────────────────────

export interface AlertEventResponse {
  id: string;
  symbol: string;
  signal_key: string | null;
  session_date: string;
  fired_at: string;
  price: number | null;
  delivered: boolean;
}

export interface TelegramLinkResponse {
  deep_link: string;
  token: string;
}

export interface TelegramStatusResponse {
  linked: boolean;
  linked_at?: string | null;
  bot_username?: string | null;
}

/** Subscribe to a preset (``signal_key``) or define a custom rule. */
export interface UserAlertRuleCreate {
  signal_key?: string | null;
  name?: string | null;
  side?: "buy" | "sell" | null;
  combination?: CombinationSchema | null;
  is_enabled?: boolean;
}

export interface UserAlertRuleResponse {
  id: string;
  name: string;
  side: string;
  base_signal_key: string | null;
  combination: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAlertRuleUpdate {
  name?: string | null;
  combination?: CombinationSchema | null;
  is_enabled?: boolean | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 0
// ──────────────────────────────────────────────────────────────────────────

/** Persisted chip + everything the Kết sổ derives from the order itself. */
export interface Cap0KehoachOut {
  id: string;
  order_id: string;
  symbol: string;
  mode: string;
  ly_do_doi_thuong: string;
  ly_do_label: string;
  mua_luc: string;
  ngay_mua: string;
  gia_vao?: number | null;
  so_phien_giu?: number | null;
}

/** Record the khối "Kế hoạch" chip for a Cấp 0 BUY order. */
export interface Cap0KehoachRequest {
  order_id: string;
  ly_do_doi_thuong: string;
}

/** Cấp 0 progress state for the current user — 4 nhiệm vụ, 1 cổng hành vi. */
export interface Cap0ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  virtual_balance_init: number;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  task_4_done_at?: string | null;
  task4_debrief_done: boolean;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

export interface PlacementRequest {
  has_traded_before: boolean;
}

export interface PlacementResponse {
  placed_level: number;
}

export interface app__schemas__cap0__TaskRequest {
  task_no: number;
  gate?: "debrief" | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 1
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 1 progress state for the current user — **5 nhiệm vụ**. ⑤ is «10 lệnh Thực chiến» (``so_lenh_thuc_chien``). The removed ⑤ («Xem lại danh mục») took ``task_6_done_at`` and ``so_lan_xem_danh_muc`` off the wire with it — see ``app.models.cap1.Cap1Progress``. */
export interface Cap1ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  da_xem_tour: boolean;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  task_4_done_at?: string | null;
  task_5_done_at?: string | null;
  so_ly_do_da_dung: number;
  so_lenh_ly_do_ung_ho: number;
  so_lenh_thuc_chien: number;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

export interface app__schemas__cap1__KehoachRequest {
  order_id: string;
  lyDo: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";
  trangThai_luc_dat: "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu";
  vung_mua: number;
  co_bam_doc_chi_tiet?: boolean;
  snapshot?: Record<string, unknown> | null;
}

export interface app__schemas__cap1__KetsoRequest {
  order_id: string;
  cam_xuc?: "binh_tinh" | "so" | "hoi_tiec" | "khong_ro" | null;
}

export interface app__schemas__cap1__OrderKehoachOut {
  id: string;
  order_id: string;
  lyDo: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";
  trangThai_luc_dat: "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu";
  vung_mua: number;
  co_bam_doc_chi_tiet: boolean;
  snapshot_lop_du_lieu?: Record<string, unknown> | null;
}

export interface app__schemas__cap1__OrderKetsoOut {
  id: string;
  order_id: string;
  gia_ra: number;
  so_phien_giu: number;
  so_ngay_lich: number;
  pnl_pct: number;
  pnl_vnd: number;
  cam_xuc?: "binh_tinh" | "so" | "hoi_tiec" | "khong_ro" | null;
  closed_at: string;
}

export interface app__schemas__cap1__TaskRequest {
  task_no: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 2
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 2 progress state for the current user — 2 nhiệm vụ làm song song. ``so_lenh_co_cl_tp`` drives ① («n/10 lệnh») and ``so_lan_thuc_hien_dung`` drives ② («n/2 lần»). ``so_lan_cat_lo_dung`` + ``so_lan_chot_loi_dung`` are the 🛑/🎯 split that «Phân tích danh mục» block ④ renders; they always sum to ``so_lan_thuc_hien_dung``. */
export interface Cap2ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  so_lenh_co_cl_tp: number;
  so_lan_cat_lo_dung: number;
  so_lan_chot_loi_dung: number;
  so_lan_thuc_hien_dung: number;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

/** Response for ``GET /cap2/diem-ky-luat`` — score + explanation + breakdown. */
export interface DiemKyLuatOut {
  ngay: string;
  co_giao_dich: boolean;
  co_tinh_huong: boolean;
  diem?: number | null;
  xep_loai?: "xanh" | "vang" | "do" | null;
  giai_thich: string;
  thanh_phan?: DiemKyLuatThanhPhan | null;
}

/** Breakdown of the 0-100 điểm kỷ luật formula — §C12c "số đến từ đâu". */
export interface DiemKyLuatThanhPhan {
  ke_hoach: number;
  ke_hoach_toi_da?: number;
  cat_lo_dung: number;
  cat_lo_dung_toi_da?: number;
  khong_nhoi: number;
  khong_nhoi_toi_da?: number;
  chot_loi_dung: number;
  chot_loi_dung_toi_da?: number;
}

export interface app__schemas__cap2__KehoachRequest {
  order_id: string;
  phuong_phap_sl_tp: "ho_tro_khang_cu" | "bien_do_dao_dong";
  cat_lo: number;
  chot_loi: number;
}

export interface app__schemas__cap2__KetsoRequest {
  order_id: string;
  cham_SL_cuoi_phien?: boolean;
  cham_SL_cat_dung_phien_ke?: boolean;
  cham_SL_khong_cat?: boolean;
  giu_cham_SL_bao_nhieu_phien?: number | null;
  cham_TP_giu_lam_hut?: boolean;
  ban_som_khi_lo_nhe?: boolean;
  nhoi_lenh_khi_lo?: boolean;
}

/** Cấp 2's view of ``order_kehoach`` — Cấp 1's fields + the SL/TP commitment. */
export interface app__schemas__cap2__OrderKehoachOut {
  id: string;
  order_id: string;
  vung_mua: number;
  phuong_phap_sl_tp?: "ho_tro_khang_cu" | "bien_do_dao_dong" | null;
  cat_lo?: number | null;
  chot_loi?: number | null;
}

/** Cấp 2's view of ``order_ketso`` — Cấp 1's fields + the 7 discipline flags. */
export interface app__schemas__cap2__OrderKetsoOut {
  id: string;
  order_id: string;
  gia_ra: number;
  pnl_pct: number;
  pnl_vnd: number;
  closed_at: string;
  cham_SL_cuoi_phien: boolean;
  cham_SL_cat_dung_phien_ke: boolean;
  cham_SL_khong_cat: boolean;
  giu_cham_SL_bao_nhieu_phien?: number | null;
  cham_TP_giu_lam_hut: boolean;
  ban_som_khi_lo_nhe: boolean;
  nhoi_lenh_khi_lo: boolean;
}

export interface app__schemas__cap2__TaskRequest {
  task_no: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 3
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 3 progress state for the current user. */
export interface Cap3ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  khau_vi_da_dat: boolean;
  khau_vi?: "than_trong" | "can_bang" | "tan_cong" | null;
  von_ban_dau: number;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_cap3: number;
  lai_pct_cap3: number;
  diem_ky_luat_tb_cap3?: number | null;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

export interface KhauViRequest {
  khau_vi: "than_trong" | "can_bang" | "tan_cong";
}

export interface app__schemas__cap3__KehoachRequest {
  order_id: string;
  khau_vi: "than_trong" | "can_bang" | "tan_cong";
  muc_tu_tin: 1 | 2 | 3;
  cach_khoi_luong: "linh_hoat" | "ky_luat";
  khoi_luong: number;
  pct_von: number;
}

/** Cấp 3's view of ``order_kehoach`` — Cấp 1's fields + the quản lý vốn block. */
export interface app__schemas__cap3__OrderKehoachOut {
  id: string;
  order_id: string;
  vung_mua: number;
  khau_vi?: "than_trong" | "can_bang" | "tan_cong" | null;
  muc_tu_tin?: number | null;
  cach_khoi_luong?: "linh_hoat" | "ky_luat" | null;
  khoi_luong?: number | null;
  pct_von?: number | null;
}

export interface app__schemas__cap3__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Bản lĩnh (§C12c: always shown with its current value + a short explanation). */
export interface app__schemas__cap3__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number | null;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap3/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③). */
export interface app__schemas__cap3__ThachThucOut {
  dat_ca_3: boolean;
  lai_pct: app__schemas__cap3__ThachThucDieuKien;
  so_lenh: app__schemas__cap3__ThachThucDieuKien;
  diem_ky_luat: app__schemas__cap3__ThachThucDieuKien;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 4
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 4 progress state for the current user. */
export interface Cap4ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_doc_du_5lop: number;
  vu_khi_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  diem_mu_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  ty_le_thang_dong_thuan_cao: number;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

/** One lớp's REAL win rate when the user self-rated it Ủng hộ (§7 khối ⑨). §C12c: every number ships with its provenance — ``n_orders``/``n_wins`` are the raw counts the rate was computed from, ``giai_thich`` spells it out. */
export interface LopWinRate {
  lop: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";
  ten: string;
  n_orders: number;
  n_wins: number;
  win_rate: number | null;
  nhan: "vu_khi" | "diem_mu" | "chua_du_du_lieu" | null;
  giai_thich: string;
}

/** Response for ``GET /cap4/vu-khi-diem-mu`` (spec §7 khối ⑨) — per-lớp win rate sorted desc, plus the identified vũ khí / điểm mù. */
export interface VuKhiDiemMuOut {
  lop: LopWinRate[];
  vu_khi_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  diem_mu_lop?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  so_lenh_toi_thieu: number;
  nguong_vu_khi: number;
  nguong_diem_mu: number;
  giai_thich: string;
}

/** ``POST /cap4/kehoach`` — khối "Đọc 5 lớp" ghi thêm vào kế hoạch đã có. ``doc_5_lop``/``ai_5_lop`` are validated in the service layer (keys must be the 5 lớp, values one of ok/neu/bad) so bad payloads produce a single, Vietnamese ``BadRequestError`` message instead of a pydantic dump. ``so_lop_dong_thuan``/``so_lop_khac_ai`` are ADVISORY: the server always recomputes them from the two blobs above (never trust the client). */
export interface app__schemas__cap4__KehoachRequest {
  order_id: string;
  /** Nhận định của user cho từng lớp: 'ok'|'neu'|'bad' */
  doc_5_lop?: Record<string, unknown> | unknown[] | null;
  /** Đánh giá AI rút về 3 mức cho từng lớp (nếu đã lộ) */
  ai_5_lop?: Record<string, unknown> | unknown[] | null;
  /** Chỉ để tham chiếu — server tự tính lại */
  so_lop_dong_thuan?: number | null;
  /** Chỉ để tham chiếu — server tự tính lại */
  so_lop_khac_ai?: number | null;
}

/** Cấp 4's view of ``order_kehoach`` — Cấp 1's fields + the đọc-5-lớp block. */
export interface app__schemas__cap4__OrderKehoachOut {
  id: string;
  order_id: string;
  vung_mua: number;
  doc_5_lop?: Record<string, "ok" | "neu" | "bad"> | null;
  ai_5_lop?: Record<string, "ok" | "neu" | "bad"> | null;
  so_lop_dong_thuan?: number | null;
  so_lop_khac_ai?: number | null;
}

export interface app__schemas__cap4__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ — Thách thức Thuần thục (§C12c: always shown with its current value + a short explanation). */
export interface app__schemas__cap4__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap4/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③). */
export interface app__schemas__cap4__ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_doc_du_5lop: app__schemas__cap4__ThachThucDieuKien;
  vu_khi_diem_mu: app__schemas__cap4__ThachThucDieuKien;
  ty_le_thang_dong_thuan_cao: app__schemas__cap4__ThachThucDieuKien;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 5
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 5 progress state for the current user. */
export interface Cap5ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_phan_loai: number;
  so_lan_dung_ngoai_da_cham: number;
  ty_le_quyet_dinh_dung: number;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

/** Response for ``POST /cap5/dung-ngoai/cham`` — same routine the reads run, exposed explicitly. */
export interface ChamDungNgoaiOut {
  so_moi_cham: number;
  so_lan_da_cham: number;
  so_chua_toi_han: number;
  giai_thich: string;
  items: DungNgoaiOut[];
}

/** Response for ``GET /cap5/dung-ngoai`` — the nhật ký + its counts. Any decision whose 5-phiên window has elapsed is scored during this call (lazy compute-on-read, no cron). */
export interface DungNgoaiListOut {
  so_lan: number;
  so_ne_dung: number;
  so_ne_hut: number;
  so_trung_tinh: number;
  so_chua_toi_han: number;
  so_lan_da_cham: number;
  du_de_phan_tich: boolean;
  so_lan_toi_thieu_phan_tich: number;
  ly_do_hay_dung?: LyDoHayDung | null;
  so_phien_cham: number;
  nguong_ne_dung_pct: number;
  nguong_ne_hut_pct: number;
  giai_thich: string;
  items: DungNgoaiOut[];
}

/** One logged đứng-ngoài decision + its score (once tới hạn). */
export interface DungNgoaiOut {
  id: string;
  symbol: string;
  decided_at: string;
  reason: "chua_du_co_so" | "dinh_gia_dat" | "cho_vung_mua_tot_hon" | "du_lieu_nguoc_chieu" | "du_vi_the_nhom";
  ly_do_ten: string;
  gia_luc_dung_ngoai: number;
  han_cham_date: string;
  da_toi_han: boolean;
  cham_at?: string | null;
  gia_sau_5_phien?: number | null;
  ket_qua?: "ne_dung" | "ne_hut" | "trung_tinh" | null;
  ket_qua_ten?: string | null;
  pct_thay_doi?: number | null;
  giai_thich: string;
}

/** ``POST /cap5/dung-ngoai`` — logs a non-trade decision. The price snapshot is resolved server-side (never client-supplied). */
export interface DungNgoaiRequest {
  symbol: string;
  /** 1 trong 5 lý do đứng ngoài */
  reason: string;
}

/** Cấp 5's view of ``order_ketso`` — Cấp 1/2's fields + the 4-ô block. */
export interface KetsoCap5Out {
  id: string;
  order_id: string;
  pnl_pct: number;
  verdict_he?: "dung" | "sai" | null;
  verdict_user?: "dung" | "sai" | null;
  verdict_provenance?: Record<string, unknown> | null;
  o_4?: "dung_thang" | "dung_thua" | "sai_thang" | "sai_thua" | null;
  ly_do_sua?: string | null;
}

/** Most-used lý do (khối ⑬). */
export interface LyDoHayDung {
  ma: "chua_du_co_so" | "dinh_gia_dat" | "cho_vung_mua_tot_hon" | "du_lieu_nguoc_chieu" | "du_vi_the_nhom";
  ten: string;
  so_lan: number;
}

/** Response for ``GET /cap5/verdict/{order_id}`` — the SUGGESTED verdict plus every signal it was derived from. ★ ``pnl_pct`` is echoed for display and to explain ``o_4_du_kien``; it never influences ``verdict`` (spec §1: đúng/sai đo QUY TRÌNH). */
export interface VerdictOut {
  order_id: string;
  verdict: "dung" | "sai";
  giai_thich: string;
  signals: VerdictSignal[];
  pnl_pct: number;
  thang: boolean;
  o_4_du_kien: "dung_thang" | "dung_thua" | "sai_thang" | "sai_thua";
}

/** One tín hiệu behind the suggested verdict — the FE shows these verbatim (spec §4: "Provenance bắt buộc — không hiện verdict trơ"). ``dat=None`` means the source data for this signal was never recorded, so it is reported as unknown rather than silently counted as passed; unknown signals are excluded from the verdict (see the service). */
export interface VerdictSignal {
  ma: string;
  ten: string;
  dat: boolean | null;
  giai_thich: string;
}

/** ``POST /cap5/ketso`` — the user confirms or overrides the hệ verdict. ``ly_do_sua`` is REQUIRED when ``verdict_user`` differs from the server's own ``verdict_he`` (422 otherwise). ``verdict_he``/``o_4`` are NOT accepted from the client — the server recomputes both at write time. */
export interface app__schemas__cap5__KetsoRequest {
  order_id: string;
  /** Chốt của user: 'dung' | 'sai' */
  verdict_user: string;
  /** Bắt buộc khi user sửa khác verdict hệ */
  ly_do_sua?: string | null;
}

export interface app__schemas__cap5__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its current value + a short explanation — never a bare number). */
export interface app__schemas__cap5__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap5/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③), all recomputed server-side. */
export interface app__schemas__cap5__ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_phan_loai: app__schemas__cap5__ThachThucDieuKien;
  so_lan_dung_ngoai_da_cham: app__schemas__cap5__ThachThucDieuKien;
  ty_le_quyet_dinh_dung: app__schemas__cap5__ThachThucDieuKien;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 6
// ──────────────────────────────────────────────────────────────────────────

/** Cấp 6 progress state for the current user. */
export interface Cap6ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_doi_chieu: number;
  so_kieu_da_gap: number;
  ty_le_thang_khop?: number | null;
  ty_le_thang_lech?: number | null;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}

/** Response for ``GET /cap6/goi-y?symbol=`` — which lớp to prioritise for this symbol's kiểu cổ phiếu, and **why**. ★ This is a SUGGESTION, never a rule (spec §5/§10). ``kieu = None`` means "chưa phân loại" (ngành missing or deliberately unmapped): ``lop_uu_tien`` / ``lop_it_tin`` come back empty and ``giai_thich`` says so honestly — the FE still lets the user pick a lớp quyết định. */
export interface GoiYOut {
  symbol: string;
  nganh?: string | null;
  kieu?: "ngan_hang" | "tang_truong" | "chu_ky" | "phong_thu" | "bat_dong_san" | "dau_co_nho" | null;
  kieu_ten?: string | null;
  lop_uu_tien?: Array<"ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia">;
  lop_uu_tien_ten?: string[];
  lop_it_tin?: Array<"ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia">;
  lop_it_tin_ten?: string[];
  giai_thich: string;
}

/** Response for ``GET /cap6/kehoach/{order_id}`` — the Đối chiếu block RECORDED on one order, everything the Kết sổ needs to render it, and nothing recomputed. ★ Why this exists next to ``GoiYOut``: ``/cap6/goi-y`` re-derives the kiểu from the symbol's ngành *now*, so for a symbol the server cannot classify it keeps answering "chưa phân loại" — even for an order whose kiểu came from the client and whose ``khop_goi_y`` the server DID record. This endpoint reads the stored columns instead, so the Kết sổ can show khớp/lệch honestly. ``co_du_lieu = False`` marks an order with no Cấp 6 data at all (placed before the level existed, or the lớp never conflicted so the step never appeared). That is a normal 200, NOT a 404: the FE must be able to tell it apart from a failed call. Every other field is then null/empty and ``giai_thich`` says so. ``khop_goi_y`` keeps its three states: ``True`` khớp · ``False`` lệch (a NEUTRAL fact, never "sai") · ``None`` kiểu chưa phân loại, so no suggestion existed to match. */
export interface KehoachCap6DetailOut {
  id?: string | null;
  order_id: string;
  kieu_co_phieu?: "ngan_hang" | "tang_truong" | "chu_ky" | "phong_thu" | "bat_dong_san" | "dau_co_nho" | null;
  kieu_ten?: string | null;
  lop_mau_thuan?: Record<string, unknown> | null;
  trong_so_goi_y?: Record<string, unknown> | null;
  lop_quyet_dinh?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  lop_quyet_dinh_ten?: string | null;
  khop_goi_y?: boolean | null;
  ly_do_doi_chieu?: string | null;
  symbol: string;
  nganh?: string | null;
  lop_uu_tien?: Array<"ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia">;
  lop_uu_tien_ten?: string[];
  lop_it_tin?: Array<"ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia">;
  lop_it_tin_ten?: string[];
  khop_goi_y_ten?: string | null;
  co_du_lieu: boolean;
  giai_thich: string;
}

/** Cấp 6's view of ``order_kehoach`` — the Đối chiếu block + its labels. */
export interface KehoachCap6Out {
  id: string;
  order_id: string;
  kieu_co_phieu?: "ngan_hang" | "tang_truong" | "chu_ky" | "phong_thu" | "bat_dong_san" | "dau_co_nho" | null;
  kieu_ten?: string | null;
  lop_mau_thuan?: Record<string, unknown> | null;
  trong_so_goi_y?: Record<string, unknown> | null;
  lop_quyet_dinh?: "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia" | null;
  lop_quyet_dinh_ten?: string | null;
  khop_goi_y?: boolean | null;
  ly_do_doi_chieu?: string | null;
}

/** One side of the khớp-vs-lệch comparison (spec §7 khối ⑮). ``ty_le_thang`` is ``None`` when the group has no closed lệnh at all; ``du_du_lieu`` is ``False`` below ``so_lenh_toi_thieu`` closed lệnh. */
export interface NhomDoiChieu {
  khop: boolean;
  ten: string;
  so_lenh: number;
  so_thang: number;
  ty_le_thang?: number | null;
  du_du_lieu: boolean;
  so_lenh_toi_thieu: number;
  giai_thich: string;
}

/** ``POST /cap6/kehoach`` — the user's Đối chiếu decision for one BUY order. ``lop_quyet_dinh`` + ``ly_do_doi_chieu`` are the user's OWN judgement and the only truly authoritative inputs; ``ly_do_doi_chieu`` is required (422 when blank). ``kieu_co_phieu`` is re-derived server-side from the symbol's ngành and the server's value wins — the client's is a fallback for symbols with no ngành, and is re-validated against the 6-kiểu enum. ``lop_mau_thuan`` is re-derived from the row's persisted ``doc_5_lop``. ``trong_so_goi_y`` and ``khop_goi_y`` are NEVER accepted from the client at all — the server derives both from the kiểu table. */
export interface app__schemas__cap6__KehoachRequest {
  order_id: string;
  /** Lớp user chọn tin: 1 trong 5 lớp */
  lop_quyet_dinh: string;
  /** 1 dòng vì sao — BẮT BUỘC */
  ly_do_doi_chieu?: string | null;
  /** Chỉ dùng khi server không xác định được ngành */
  kieu_co_phieu?: string | null;
  /** {lop: 'ok'|'neu'|'bad'} — dự phòng, server ưu tiên doc_5_lop */
  lop_mau_thuan?: Record<string, unknown> | null;
}

export interface app__schemas__cap6__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its current value + a short explanation — never a bare number). ``du_du_lieu = False`` marks a condition that cannot be judged yet (the win-rate leg needs ≥3 closed lệnh in EACH group) — it is neither passed nor held against the user. */
export interface app__schemas__cap6__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  du_du_lieu?: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap6/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③) + both comparison groups, all recomputed server-side. */
export interface app__schemas__cap6__ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_doi_chieu: app__schemas__cap6__ThachThucDieuKien;
  so_kieu_da_gap: app__schemas__cap6__ThachThucDieuKien;
  doi_chieu_giup_ich: app__schemas__cap6__ThachThucDieuKien;
  nhom_khop: NhomDoiChieu;
  nhom_lech: NhomDoiChieu;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 7
// ──────────────────────────────────────────────────────────────────────────

/** One gauge band of the chỉ số Lực + the "vì sao" the FE shows verbatim. */
export interface BandOut {
  ma: "cau_ap_dao" | "can_bang" | "cung_ap_dao";
  ten: string;
  dieu_kien_text: string;
  giai_thich: string;
}

/** Cấp 7 progress state for the current user. Carries three DERIVED fields the columns do not hold: · ``trong_phien`` — from the server's own ``is_trading_session()``. The FE must NEVER compute market-open from the browser clock (a user in another timezone would get the wrong answer). · ``so_lenh_da_cham`` / ``so_lenh_chua_cham`` — how many đọc-lực orders have been scored and how many are still waiting. ★ The unscored ones are NOT in ``ty_le_doc_luc_dung``'s denominator, so the count must be visible or the rate would look like it was computed over everything. */
export interface Cap7ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_doc_luc: number;
  so_lan_khong_duoi_theo_co: number;
  ty_le_doc_luc_dung: number;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
  trong_phien: boolean;
  so_lenh_da_cham: number;
  so_lenh_chua_cham: number;
  so_lan_gap_co: number;
  so_lan_mua_duoi_theo: number;
  so_phien_cham: number;
}

/** Response for ``POST /cap7/cham`` — the same lazy scoring pass every read performs, exposed explicitly (idempotent). */
export interface ChamOut {
  so_moi_cham: number;
  so_lenh_doc_luc: number;
  so_lenh_da_cham: number;
  so_lenh_chua_cham: number;
  ty_le_doc_luc_dung: number;
  so_phien_cham: number;
  giai_thich: string;
}

/** Response for ``GET /cap7/kehoach/{order_id}`` — the đọc-lực block recorded on one order + the scoring context the Kết sổ needs. ★ Reading this endpoint RUNS the lazy chấm pass (the same one every Cấp 7 read runs), so an order whose ``so_phien_cham`` sessions have elapsed comes back SCORED. Without it the Kết sổ could only ever say "chưa tới hạn chấm". ★ ``doc_luc_dung`` has THREE meanings and they must never be collapsed: ``True`` đọc đúng · ``False`` đọc sai · ``None`` chưa chấm. ``None`` is NOT "sai" — it means the deadline has not arrived, or the price for that session is still unavailable. ``da_toi_han_cham`` separates those two ``None`` cases. ``co_du_lieu = False`` marks an order with no Cấp 7 data at all (placed before the level existed, or the user simply skipped the optional step). That is a normal 200, NOT a 404. */
export interface KehoachCap7DetailOut {
  id?: string | null;
  order_id: string;
  luc_chi_so?: number | null;
  luc_band?: "cau_ap_dao" | "can_bang" | "cung_ap_dao" | null;
  luc_band_ten?: string | null;
  luc_doc_user?: "manh" | "can" | "yeu" | null;
  luc_doc_user_ten?: string | null;
  doc_luc_dung?: boolean | null;
  dien_bien_pct?: number | null;
  co_canh_giac_lenh_gia?: boolean | null;
  hanh_vi_co?: "cho_xac_nhan" | "mua_duoi_theo" | null;
  hanh_vi_co_ten?: string | null;
  so_phien_cham: number;
  giai_thich: string;
  symbol: string;
  co_du_lieu: boolean;
  dead_band_pct: number;
  han_cham_ngay?: string | null;
  da_toi_han_cham: boolean;
}

/** Cấp 7's view of ``order_kehoach`` — the đọc-lực block + its labels. */
export interface KehoachCap7Out {
  id: string;
  order_id: string;
  luc_chi_so?: number | null;
  luc_band?: "cau_ap_dao" | "can_bang" | "cung_ap_dao" | null;
  luc_band_ten?: string | null;
  luc_doc_user?: "manh" | "can" | "yeu" | null;
  luc_doc_user_ten?: string | null;
  doc_luc_dung?: boolean | null;
  dien_bien_pct?: number | null;
  co_canh_giac_lenh_gia?: boolean | null;
  hanh_vi_co?: "cho_xac_nhan" | "mua_duoi_theo" | null;
  hanh_vi_co_ten?: string | null;
  so_phien_cham: number;
  giai_thich: string;
}

/** Response for ``GET /cap7/phien`` — cheap and re-fetchable. The panel can stay open across the 11:30 boundary, so ``trong_phien`` must be refreshable independently of ``/cap7/progress``. */
export interface PhienOut {
  trong_phien: boolean;
  gio_giao_dich_text: string;
  giai_thich: string;
  quy_tac: app__schemas__cap7__QuyTacOut;
}

/** ``POST /cap7/kehoach`` — the user's order-book reading for one BUY order. ``luc_chi_so`` is the ONLY client-computed number Cấp 7 accepts, because the order book it comes from is realtime data the server does not hold at request time (see ``app.models.cap7``'s ★3). It must be finite and > 0. ``hanh_vi_co`` must be non-null **if and only if** ``co_canh_giac_lenh_gia`` is true — the inconsistent combination is rejected (400), never silently normalised. */
export interface app__schemas__cap7__KehoachRequest {
  order_id: string;
  /** Tổng dư MUA / tổng dư BÁN (3 mức) lúc mua */
  luc_chi_so: number;
  /** User tự đoán: 'manh' | 'can' | 'yeu' */
  luc_doc_user: string;
  /** Cờ cảnh giác heuristic có hiện hay không */
  co_canh_giac_lenh_gia?: boolean;
  /** 'cho_xac_nhan' | 'mua_duoi_theo' — bắt buộc KHI VÀ CHỈ KHI có cờ */
  hanh_vi_co?: string | null;
}

/** Every Cấp 7 constant the reading block needs, published by the SERVER. ★ The FE must render THESE values and never invent its own cut-offs — that is the only way the gauge the user sees, the copy that explains it, and the server-side chấm can be guaranteed to agree. */
export interface app__schemas__cap7__QuyTacOut {
  nguong_cau_ap_dao: number;
  nguong_cung_ap_dao: number;
  bands: BandOut[];
  co_canh_giac_he_so: number;
  co_canh_giac_min_muc: number;
  co_canh_giac_copy: string;
  so_phien_cham: number;
  dead_band_pct: number;
  cham_giai_thich: string;
}

export interface app__schemas__cap7__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its current value + a short explanation — never a bare number). ``du_du_lieu = False`` marks a condition that cannot be judged yet (the rate leg needs ≥3 SCORED đọc-lực orders, spec §7) — it is neither passed nor held against the user. */
export interface app__schemas__cap7__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  du_du_lieu?: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap7/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③), all recomputed server-side on read. ``so_lenh_chua_cham`` is part of the contract: the rate is computed over scored orders only, so the FE must be able to say how many are still waiting. */
export interface app__schemas__cap7__ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_doc_luc: app__schemas__cap7__ThachThucDieuKien;
  so_lan_khong_duoi_theo_co: app__schemas__cap7__ThachThucDieuKien;
  ty_le_doc_luc_dung: app__schemas__cap7__ThachThucDieuKien;
  so_lenh_da_cham: number;
  so_lenh_chua_cham: number;
  so_lan_gap_co: number;
  so_lan_mua_duoi_theo: number;
  so_phien_cham: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Cấp 8
// ──────────────────────────────────────────────────────────────────────────

/** One warning that ACTUALLY fired, with the copy the FE shows verbatim. ★ Cảnh báo MỀM (spec §9/§C8): nothing here blocks MUA. The FE offers Vẫn mua / Giảm khối lượng / Chọn mã khác, all three equally available. */
export interface CanhBaoOut {
  ma: "don_nganh" | "tuong_quan" | "tong_rui_ro";
  ten: string;
  text: string;
}

/** Cấp 8 progress state for the current user. ★ ``so_lan_mua_bat_chap_canh_bao`` is the LIFETIME figure; graduation condition ② measures ``bat_chap_gan_day`` over the last ``cua_so_gan_day`` checked orders (spec §2③ — "trong 15 lệnh gần nhất"). Both ride in the same payload precisely so the FE cannot mistake one for the other. ★ ``don_nganh_max_pct`` / ``tong_rui_ro_pct`` are NULL until the portfolio has actually been priced. NULL means "chưa tính được" — never 0.0, which would be a *passing* value for both. */
export interface Cap8ProgressOut {
  id: string;
  user_id: string;
  entered_at: string;
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_kiem_tra: number;
  so_lan_mua_bat_chap_canh_bao: number;
  don_nganh_max_pct?: number | null;
  tong_rui_ro_pct?: number | null;
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
  so_lan_co_canh_bao: number;
  bat_chap_gan_day: number;
  cua_so_gan_day: number;
  so_lenh_da_ket_so: number;
}

/** A high-correlation pair among the ĐÁNG KỂ positions (khối ⑱). */
export interface CapTuongQuanOut {
  a: string;
  b: string;
  he_so: number;
}

/** The closing-state block khối ⑱ renders. ★ ``tuong_quan_du_lieu = False`` means no pair could be computed at all (fewer than 2 significant positions, or not enough aligned history) — the FE renders "chưa đủ dữ liệu", NOT "không có cặp nào tương quan cao". ★ ``caveat`` is the "{N} vị thế chưa có cắt lỗ" sentence and must be shown wherever ``tong_rui_ro_pct`` is shown: the number is the part we KNOW, not the whole. */
export interface DanhMucOut {
  nav_vnd: number;
  so_vi_the: number;
  so_vi_the_thieu_cat_lo: number;
  so_vi_the_thieu_gia: number;
  phan_bo_nganh: PhanBoNganhOut[];
  don_nganh_max?: DonNganhMaxOut | null;
  tong_rui_ro_pct?: number | null;
  khau_vi?: string | null;
  khau_vi_ten?: string | null;
  tran_khau_vi_pct?: number | null;
  cap_tuong_quan_cao: CapTuongQuanOut[];
  tuong_quan_du_lieu: boolean;
  caveat: string;
  cross_ref_pm: string;
}

export interface DonNganhMaxOut {
  nganh: string;
  pct: number;
}

/** §C12c — every measure ships with its own plain-Vietnamese explanation stating the number AND where it came from. The FE renders these VERBATIM and invents no wording of its own. */
export interface GiaiThichKiemTraOut {
  don_nganh: string;
  tuong_quan: string;
  tong_rui_ro: string;
  tran_khau_vi: string;
}

/** Cấp 8's view of ``order_kehoach`` — the Kiểm tra danh mục block. */
export interface KehoachCap8Out {
  id: string;
  order_id: string;
  don_nganh_pct?: number | null;
  tuong_quan_cao_voi?: TuongQuanOut | null;
  tong_rui_ro_pct?: number | null;
  danh_muc_canh_bao?: string[] | null;
  danh_muc_canh_bao_ten?: string[] | null;
  canh_bao_text: string;
  hanh_vi_canh_bao?: "van_mua" | "giam_kl" | "chon_ma_khac" | "khong_canh_bao" | null;
  hanh_vi_canh_bao_ten?: string | null;
  giai_thich: string;
}

/** Response for ``GET /cap8/kiem-tra`` — the whole pre-trade check. ★ Each measure has an explicit unknown state, never a fabricated 0: · ``nganh is None`` ⇒ dồn ngành chưa tính được (không đoán ngành); · ``tuong_quan_du_lieu is False`` ⇒ chưa đủ dữ liệu / không có vị thế đáng kể để so — NOT "không tương quan"; · ``tong_rui_ro_pct_sau is None`` ⇒ lệnh này chưa có cắt lỗ nên phần đóng góp của nó CHƯA BIẾT (không phải 0); · ``so_vi_the_thieu_cat_lo`` / ``so_vi_the_thieu_gia`` ⇒ số vị thế bị LOẠI khỏi tổng vì rủi ro/tỷ trọng của chúng chưa biết. */
export interface KiemTraOut {
  symbol: string;
  khoi_luong: number;
  gia: number;
  cat_lo?: number | null;
  gia_tri_lenh_vnd: number;
  nav_vnd: number;
  so_vi_the: number;
  so_vi_the_thieu_cat_lo: number;
  so_vi_the_thieu_gia: number;
  nganh?: string | null;
  don_nganh_pct_truoc?: number | null;
  don_nganh_pct_sau?: number | null;
  don_nganh_canh_bao: boolean;
  tuong_quan?: TuongQuanOut | null;
  tuong_quan_canh_bao: boolean;
  tuong_quan_du_lieu: boolean;
  tong_rui_ro_pct_truoc?: number | null;
  tong_rui_ro_pct_sau?: number | null;
  tong_rui_ro_canh_bao: boolean;
  khau_vi?: string | null;
  khau_vi_ten?: string | null;
  tran_khau_vi_pct?: number | null;
  canh_bao: CanhBaoOut[];
  giai_thich: GiaiThichKiemTraOut;
  cross_ref_pm: string;
  quy_tac: app__schemas__cap8__QuyTacOut;
}

/** One bucket of khối ⑱'s PHÂN BỔ NGÀNH line. Cash is a bucket of its own — not a rounding gap. */
export interface PhanBoNganhOut {
  nganh: string;
  pct: number;
}

/** The highest-correlation ĐÁNG KỂ partner of the candidate. ★ Absent (``null``) means "chưa tính được / chưa đủ dữ liệu" — see ``tuong_quan_du_lieu``. It NEVER means "hệ số bằng 0". */
export interface TuongQuanOut {
  symbol: string;
  he_so: number;
}

/** ``POST /cap8/kehoach`` — the Kiểm tra danh mục block for one BUY order. ★ HONESTY: ``don_nganh_pct`` / ``tuong_quan_cao_voi`` / ``tong_rui_ro_pct`` / ``danh_muc_canh_bao`` are accepted for wire compatibility with the check payload the FE just rendered, and then **DISCARDED** — the server recomputes all four from the real portfolio and stores its own values. Otherwise a client could post an empty warning list and keep its ``so_lan_mua_bat_chap_canh_bao`` permanently clean. ``hanh_vi_canh_bao`` IS the client's to report (only the user knows which button they pressed) but must agree with what actually fired: ``khong_canh_bao`` while warnings are present — or ``van_mua`` while none are — is rejected (400), never silently normalised. ★ The block is WRITE-ONCE. Re-posting the same ``hanh_vi_canh_bao`` returns the stored row unchanged (a retried call must not 409, and must not re-price the snapshot against a newer portfolio either); re-posting a different one is a 409. The record is a snapshot of the danh mục at the moment of the order, and graduation condition ② is computed from it. */
export interface app__schemas__cap8__KehoachRequest {
  order_id: string;
  /** 'van_mua' | 'giam_kl' | 'chon_ma_khac' | 'khong_canh_bao' */
  hanh_vi_canh_bao: string;
  /** Các ``canh_bao[].ma`` của CHÍNH lần ``GET /cap8/kiem-tra`` mà user đã phản hồi. BẮT BUỘC gửi khi hanh_vi_canh_bao là 'giam_kl' hoặc 'chon_ma_khac': giảm khối lượng / đổi mã chính là thứ làm cảnh báo tắt đi, nên server không thể suy lại cảnh báo đó từ lệnh đã điều chỉnh. Bị BỎ QUA với 'van_mua' và 'khong_canh_bao' — hai giá trị đó luôn do server tự suy lại quyết định. */
  canh_bao_da_hien?: string[] | null;
  /** Bỏ qua — server tự tính */
  don_nganh_pct?: number | null;
  /** Bỏ qua — server tự tính */
  tuong_quan_cao_voi?: Record<string, unknown> | null;
  /** Bỏ qua — server tự tính */
  tong_rui_ro_pct?: number | null;
  /** Bỏ qua — server tự tính */
  danh_muc_canh_bao?: string[] | null;
}

/** Every Cấp 8 threshold, published by the SERVER. ★ The FE renders THESE values and never invents its own cut-offs — the only way the warning the user sees, the copy that explains it and the graduation rule are guaranteed to agree. */
export interface app__schemas__cap8__QuyTacOut {
  nguong_don_nganh_pct: number;
  nguong_tuong_quan: number;
  tuong_quan_min_ty_trong_pct: number;
  tuong_quan_min_phien: number;
  so_phien_lich_su: number;
  khau_vi_tran_pct: Record<string, number>;
  cua_so_bat_chap: number;
  bat_chap_toi_da: number;
  so_lenh_kiem_tra_min: number;
  cross_ref_pm: string;
}

export interface app__schemas__cap8__TaskRequest {
  task_no: number;
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: always shown with its current value + a short explanation — never a bare number). ``du_du_lieu = False`` marks a condition that cannot be judged yet (the portfolio could not be priced, or no khẩu vị has been set at Cấp 3) — it is neither passed nor held against the user. */
export interface app__schemas__cap8__ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  du_du_lieu?: boolean;
  giai_thich: string;
}

/** Response for ``GET /cap8/thach-thuc`` — the 3 sub-conditions of nhiệm vụ ③ (spec §2③), all recomputed server-side on read. ★ ``mua_bat_chap`` is measured over a ROLLING window of the last ``cua_so_gan_day`` checked orders, not over the whole account history — ``so_lan_mua_bat_chap_canh_bao`` (lifetime) rides alongside so both figures stay visible and distinguishable. ``danh_muc`` is ``None`` when the portfolio could not be priced — an explicit "chưa tính được", never an empty-but-confident payload. */
export interface app__schemas__cap8__ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_kiem_tra: app__schemas__cap8__ThachThucDieuKien;
  mua_bat_chap: app__schemas__cap8__ThachThucDieuKien;
  danh_muc_an_toan: app__schemas__cap8__ThachThucDieuKien;
  so_lenh_da_ket_so: number;
  so_lan_co_canh_bao: number;
  so_lan_mua_bat_chap_canh_bao: number;
  cua_so_gan_day: number;
  danh_muc?: DanhMucOut | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Danh mục theo dõi
// ──────────────────────────────────────────────────────────────────────────

/** Add a symbol to the watchlist. */
export interface WatchlistAddRequest {
  /** Mã chứng khoán */
  symbol: string;
}

/** Single watchlist item. */
export interface WatchlistItemResponse {
  id: string;
  symbol: string;
  sort_order: number;
  created_at: string;
}

/** Reorder watchlist items. */
export interface WatchlistReorderRequest {
  /** Danh sách mã theo thứ tự mới */
  symbols: string[];
}

/** Full watchlist for a user. */
export interface WatchlistResponse {
  items: WatchlistItemResponse[];
  count: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Dữ liệu thị trường: Bộ lọc cổ phiếu
// ──────────────────────────────────────────────────────────────────────────

/** Một tiêu chí lọc. */
export interface ScreeningFilter {
  /** Tên tiêu chí (ví dụ 'exchange', 'stockStrength') */
  name: string;
  /** Danh sách điều kiện lọc */
  conditionOptions?: ScreeningFilterCondition[];
  /** Tham số phụ (ví dụ '3Month', 'ema20') */
  extraName?: string | null;
}

/** Một điều kiện lọc trong filter. */
export interface ScreeningFilterCondition {
  /** 'value' cho multi-select */
  type?: string | null;
  /** Giá trị chọn (ví dụ 'hsx', '8600') */
  value?: string | null;
  /** Giá trị tối thiểu */
  from?: number | null;
  /** Giá trị tối đa */
  to?: number | null;
}

/** Validated request body for POST /screening/search. */
export interface ScreeningPagingRequest {
  /** Trang (bắt đầu từ 0) */
  page?: number;
  /** Số bản ghi mỗi trang */
  pageSize?: number;
  /** Danh sách cột sắp xếp */
  sortFields?: string[];
  /** Thứ tự: ASC hoặc DESC */
  sortOrders?: string[];
  /** Danh sách bộ lọc */
  filter?: ScreeningFilter[];
}


// ──────────────────────────────────────────────────────────────────────────
// Dữ liệu thị trường: Giao dịch
// ──────────────────────────────────────────────────────────────────────────

/** Validated request body for POST /trading/price-board. */
export interface PriceBoardRequest {
  /** Danh sách mã cổ phiếu (1-50) */
  symbols: string[];
  /** Nguồn dữ liệu: auto, VCI hoặc VND */
  source?: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Dữ liệu thị trường: Quốc tế
// ──────────────────────────────────────────────────────────────────────────

export interface _SnapshotMeta {
  snapshot_date: string | null;
  stale_count: number;
}

export interface _SnapshotResponse {
  data: _SnapshotRow[];
  meta: _SnapshotMeta;
}

export interface _SnapshotRow {
  snapshot_date: string;
  asset_category: string;
  symbol: string;
  name: string;
  last_price: number;
  previous_close: number;
  change_value: number;
  change_percent: number;
  day_high?: number | null;
  day_low?: number | null;
  volume?: number | null;
  currency?: string | null;
  market_state?: string | null;
  market_time?: string | null;
  source: string;
  stale: boolean;
  fetched_at: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Giao dịch ảo
// ──────────────────────────────────────────────────────────────────────────

/** Virtual trading account summary. */
export interface AccountResponse {
  id: string;
  user_id: string;
  status: string;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;
  cash_pending_vnd: number;
  total_cash_vnd?: number;
  activated_at: string;
  reset_at?: string | null;
  created_at: string;
}

/** Single leaderboard row. */
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  nav_vnd: number;
  profit_vnd: number;
  return_pct: number;
  initial_cash_vnd: number;
}

/** Paginated leaderboard. */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  total_eligible: number;
  evaluated_count: number;
  page: number;
  page_size: number;
  sort_by: string;
}

/** Request body for placing a virtual order. */
export interface OrderCreateRequest {
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  limit_price_vnd?: number | null;
}

/** Paginated order list. */
export interface OrderListResponse {
  orders: OrderResponse[];
  total: number;
  page: number;
  page_size: number;
}

/** Virtual order details. */
export interface OrderResponse {
  id: string;
  account_id: string;
  symbol: string;
  mode: string;
  side: string;
  order_type: string;
  status: string;
  quantity: number;
  limit_price_vnd?: number | null;
  reserved_cash_vnd?: number;
  reserved_quantity?: number;
  filled_price_vnd?: number | null;
  gross_amount_vnd?: number | null;
  fee_vnd?: number | null;
  tax_vnd?: number | null;
  net_amount_vnd?: number | null;
  trading_date: string;
  rejection_reason?: string | null;
  cancel_reason?: string | null;
  created_at: string;
}

/** Full portfolio with account summary and positions. */
export interface PortfolioResponse {
  account: AccountResponse;
  positions: PositionResponse[];
  total_market_value_vnd: number;
  nav_vnd: number;
  total_unrealized_pnl_vnd: number;
  return_pct: number;
  refresh_warnings?: string[];
}

/** A single portfolio position. */
export interface PositionResponse {
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  quantity_pending: number;
  quantity_reserved: number;
  avg_cost_vnd: number;
  current_price_vnd?: number | null;
  market_value_vnd?: number | null;
  unrealized_pnl_vnd?: number | null;
}

/** Result of processing pending orders and settlements. */
export interface RefreshResponse {
  orders_filled: number;
  orders_expired: number;
  settlements_settled: number;
  warnings?: string[];
}

/** Paginated trade list. */
export interface TradeListResponse {
  trades: TradeResponse[];
  total: number;
  page: number;
  page_size: number;
}

/** Executed trade details. */
export interface TradeResponse {
  id: string;
  order_id: string;
  symbol: string;
  side: string;
  quantity: number;
  price_vnd: number;
  gross_amount_vnd: number;
  fee_vnd: number;
  tax_vnd: number;
  net_amount_vnd: number;
  price_source: string;
  price_time: string;
  traded_at: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Giao dịch ảo (quản trị)
// ──────────────────────────────────────────────────────────────────────────

/** Active virtual trading configuration. */
export interface ConfigResponse {
  id: string;
  initial_cash_vnd: number;
  buy_fee_rate_bps: number;
  sell_fee_rate_bps: number;
  sell_tax_rate_bps: number;
  settlement_mode: string;
  board_lot_size: number;
  trading_enabled: boolean;
  holidays: string[];
  created_at: string;
  updated_at: string;
}

/** Partial update for virtual trading config. */
export interface ConfigUpdate {
  initial_cash_vnd?: number | null;
  buy_fee_rate_bps?: number | null;
  sell_fee_rate_bps?: number | null;
  sell_tax_rate_bps?: number | null;
  settlement_mode?: string | null;
  board_lot_size?: number | null;
  trading_enabled?: boolean | null;
  holidays?: string[] | null;
}

/** Result of account reset. */
export interface ResetResponse {
  accounts_reset: number;
  message: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Người dùng
// ──────────────────────────────────────────────────────────────────────────

/** Admin-level user creation — admins can set role and status. */
export interface AdminUserCreate {
  email: string;
  password: string;
  full_name: string;
  phone_number?: string | null;
  role?: UserRole;
  status?: UserStatus;
}

/** Admin-level update — admins can change role and status too. */
export interface AdminUserUpdate {
  full_name?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  country?: string | null;
  province_state?: string | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
  role?: UserRole | null;
  status?: UserStatus | null;
  is_email_verified?: boolean | null;
}

export interface PaginatedResponse_UserBriefResponse_ {
  items: UserBriefResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Minimal user representation for listings. */
export interface UserBriefResponse {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

/** Self-profile update — users can only update these fields. */
export interface UserUpdate {
  full_name?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  country?: string | null;
  province_state?: string | null;
  city?: string | null;
  district?: string | null;
  ward?: string | null;
  street_address?: string | null;
  postal_code?: string | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Nhận định thị trường
// ──────────────────────────────────────────────────────────────────────────

export interface AnalysisListItem {
  id: string;
  session_date: string;
  session_type: string;
  headline: string;
  tagline: Record<string, unknown>;
}

export interface AnalysisOut {
  id: string;
  session_date: string;
  session_type: string;
  session_type_display?: string | null;
  generated_at: string;
  headline: string;
  tagline: Record<string, unknown>;
  paragraphs: Record<string, unknown>;
  scenarios: unknown[];
  watchlist?: unknown[] | null;
  unexplained?: string | null;
  meta?: Record<string, unknown> | null;
  charts?: Record<string, unknown> | null;
  pulse?: Record<string, unknown> | null;
}

export interface GenerateResult {
  session_date: string;
  session_type: string;
  valid: boolean;
  persisted: boolean;
  memory_loaded: boolean;
  attempts: number;
  errors: unknown[];
  model: string;
  generation_time_ms: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Premium
// ──────────────────────────────────────────────────────────────────────────

/** Admin manually grants premium to a user. */
export interface AdminGrantRequest {
  plan_id: string;
  note?: string | null;
}

/** A single hidden form field. */
export interface CheckoutFormField {
  name: string;
  value: string;
}

/** User requests a checkout form for a plan. */
export interface CheckoutRequest {
  plan_id: string;
}

/** Checkout form data for frontend to submit to SePay. */
export interface CheckoutResponse {
  action: string;
  method?: string;
  fields: CheckoutFormField[];
  invoice_number: string;
  order_id: string;
}

/** Payment order data. */
export interface PaymentOrderResponse {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  currency: string;
  status: string;
  paid_at: string | null;
  grant_type: string | null;
  created_at: string;
}

/** Admin creates a new premium plan. */
export interface PlanCreate {
  code: string;
  name: string;
  description?: string | null;
  price_vnd: number;
  duration_days: number;
  is_active?: boolean;
  sort_order?: number;
}

/** Plan data returned to clients. */
export interface PlanResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_vnd: number;
  duration_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Admin updates a plan (all fields optional). */
export interface PlanUpdate {
  name?: string | null;
  description?: string | null;
  price_vnd?: number | null;
  duration_days?: number | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

/** User's current premium subscription status. */
export interface SubscriptionResponse {
  is_premium: boolean;
  is_trial?: boolean;
  status: string | null;
  current_plan?: PlanResponse | null;
  current_period_start: string | null;
  current_period_end: string | null;
}


// ──────────────────────────────────────────────────────────────────────────
// Quản lý danh mục
// ──────────────────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  analysis: Record<string, unknown>;
  narrative?: Record<string, unknown> | null;
  meta: Record<string, unknown>;
}


// ──────────────────────────────────────────────────────────────────────────
// Quản trị: Bài học
// ──────────────────────────────────────────────────────────────────────────

export interface Body_admin_upload_episode_file_api_v1_admin_lessons_episodes__episode_id__file_post {
  file: string;
}

export interface Body_admin_upload_thumbnail_api_v1_admin_lessons_courses__course_id__thumbnail_post {
  file: string;
}

/** Admin detail includes full episodes with file_url. */
export interface CourseAdminDetailResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  level: string;
  category: string;
  is_premium: boolean;
  is_published: boolean;
  total_episodes: number;
  total_duration_seconds: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  episodes?: EpisodeAdminBrief[];
}

export interface CourseCreate {
  slug: string;
  title: string;
  description?: string | null;
  level: CourseLevel;
  category: string;
  is_premium?: boolean;
  is_published?: boolean;
}

export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface CourseUpdate {
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  level?: CourseLevel | null;
  category?: string | null;
  is_premium?: boolean | null;
  is_published?: boolean | null;
}

/** Admin episode listing — includes file_url. */
export interface EpisodeAdminBrief {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  file_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type EpisodeContentType = "pdf" | "video" | "text";

export interface EpisodeCreate {
  title: string;
  description?: string | null;
  content_type: EpisodeContentType;
  markdown_body?: string | null;
  sort_order?: number | null;
}

export interface EpisodeUpdate {
  title?: string | null;
  description?: string | null;
  markdown_body?: string | null;
  sort_order?: number | null;
  is_published?: boolean | null;
}

export interface ReorderItem {
  episode_id: string;
  sort_order: number;
}

export interface ReorderRequest {
  items: ReorderItem[];
}


// ──────────────────────────────────────────────────────────────────────────
// Quản trị: Giao dịch ảo
// ──────────────────────────────────────────────────────────────────────────

export interface CashAdjustRequest {
  /** Có thể âm hoặc dương, khác 0 */
  amount_vnd: number;
  reason: string;
}

export interface CashAdjustResponse {
  account: VTAccountAdminResponse;
  ledger_id: string;
  new_cash_available_vnd: number;
}

export interface FreezeAccountRequest {
  reason: string;
}

export interface UnfreezeAccountRequest {
  reason?: string | null;
}

export interface VTAccountAdminResponse {
  id: string;
  user_id: string;
  status: string;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;
  cash_pending_vnd: number;
  activated_at: string | null;
  frozen_at: string | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_at: string;
}

export interface VTAccountStatsResponse {
  account_id: string;
  total_orders: number;
  total_trades: number;
  gross_buy_vnd: number;
  gross_sell_vnd: number;
  realized_pnl_vnd: number;
  turnover_vnd: number;
  win_rate?: number | null;
}

export interface VTPositionResponse {
  id: string;
  account_id: string;
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  quantity_pending: number;
  quantity_reserved: number;
  avg_cost_vnd: number;
  created_at: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Quản trị: Hệ thống
// ──────────────────────────────────────────────────────────────────────────

export interface JobInfo {
  id: string;
  name: string;
  next_run_at: string | null;
  trigger: string;
}

export interface RunJobResponse {
  job_id: string;
  result: Record<string, unknown>;
  ran_at: string;
}

export interface SystemStatus {
  version: string;
  environment: string;
  scheduler_running: boolean;
  jobs: JobInfo[];
  db_stats: Record<string, number>;
  last_ipn_received_at: string | null;
  last_ipn_processed_count_24h: number;
  generated_at: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Quản trị: Người dùng
// ──────────────────────────────────────────────────────────────────────────

export type BulkOp = "set_role" | "set_status" | "soft_delete";

export interface BulkUpdateError {
  user_id: string;
  message: string;
}

export interface BulkUpdateRequest {
  user_ids: string[];
  op: BulkOp;
  value?: string | null;
}

export interface BulkUpdateResponse {
  affected: number;
  skipped: string[];
  errors: BulkUpdateError[];
}

export interface LoginHistoryRow {
  id: string;
  user_id: string | null;
  email: string;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  user_agent: string | null;
  login_at: string;
}

export interface PaginatedResponse_LoginHistoryRow_ {
  items: LoginHistoryRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaymentOrderBrief {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  status: string;
  grant_type: string | null;
  plan_code: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PlanBrief {
  id: string;
  code: string;
  name: string;
  price_vnd: number;
  duration_days: number;
}

export interface ResendVerificationResponse {
  message?: string;
}

export interface ResetPasswordResponse {
  temporary_password: string;
  warning?: string;
}

export interface SubscriptionBrief {
  id: string;
  status: string;
  plan: PlanBrief | null;
  current_period_start: string;
  current_period_end: string;
  is_trial: boolean;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  cancel_reason?: string | null;
}

export interface User360Response {
  user: UserBriefForAdmin;
  subscription: SubscriptionBrief | null;
  subscription_history: SubscriptionBrief[];
  payment_history: PaymentOrderBrief[];
  trial_used: boolean;
  vt_account: VTAccountBrief | null;
  vt_recent_orders: VTOrderBrief[];
  login_history: LoginHistoryRow[];
}

export interface UserBriefForAdmin {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  role: string;
  status: string;
  is_email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface VTAccountBrief {
  id: string;
  status: string;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;
  cash_pending_vnd: number;
  activated_at: string | null;
  frozen_at?: string | null;
  freeze_reason?: string | null;
}

export interface VTOrderBrief {
  id: string;
  symbol: string;
  side: string;
  status: string;
  quantity: number;
  price_vnd: number | null;
  created_at: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Quản trị: Số liệu
// ──────────────────────────────────────────────────────────────────────────

export interface DailyRevenuePoint {
  date: string;
  paid_orders: number;
  revenue_vnd: number;
}

export interface MetricsOverview {
  total_users: number;
  active_users: number;
  new_users_today: number;
  new_users_last_7d: number;
  new_users_last_30d: number;
  active_subscribers: number;
  active_trial_count: number;
  active_paid_count: number;
  plan_distribution: PlanDistributionPoint[];
  mrr_vnd: number;
  revenue_today_vnd: number;
  revenue_last_7d_vnd: number;
  revenue_last_30d_vnd: number;
  vt_active_accounts: number;
  vt_orders_today: number;
  generated_at: string;
}

export interface PlanDistributionPoint {
  plan_code: string;
  plan_name: string;
  active_subscriptions: number;
  price_vnd: number;
}


// ──────────────────────────────────────────────────────────────────────────
// Sức khỏe hệ thống
// ──────────────────────────────────────────────────────────────────────────

/** Health check response. */
export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  environment: string;
  database: string;
  redis?: string;
  timestamp: string;
}


// ──────────────────────────────────────────────────────────────────────────
// Xác thực
// ──────────────────────────────────────────────────────────────────────────

export interface ForgotPasswordRequest {
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

/** Registration request. */
export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
  phone_number?: string | null;
}
