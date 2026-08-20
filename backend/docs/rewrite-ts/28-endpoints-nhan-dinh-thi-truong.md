# Endpoint — Nhận định thị trường (EOD / giữa phiên / trước phiên)

Chương này đặc tả đầy đủ **10 operation** thuộc `/api/v1/market-analysis/*` — ba bài viết AI
tự sinh mỗi ngày giao dịch về VN-Index: **trước phiên** (07:15 ICT), **giữa phiên** (11:30 ICT)
và **cuối ngày** (16:30 ICT, có lần chạy vá 17:00). Cả ba loại nằm chung một bảng
`analysis_history`, phân biệt bằng cột `report_type`, và cùng chia sẻ một khung
response duy nhất `AnalysisOut` — điều này khiến các field trong `AnalysisOut` mang
**hình dạng khác nhau tùy `report_type`**, là cái bẫy lớn nhất của chương này.

7 endpoint đọc là **công khai** (không cần token); 3 endpoint `run` là **admin**, chạy
**đồng bộ** và gọi LLM ngay trong request — có thể mất 2-4 phút.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/market-analysis/daily` | Công khai | Mục lục N bài cuối ngày gần nhất (headline + tagline) |
| `GET` | `/api/v1/market-analysis/daily/latest` | Công khai | Bài cuối ngày mới nhất đã publish (bất kể ngày nào) |
| `GET` | `/api/v1/market-analysis/daily/{session_date}` | Công khai | Bài cuối ngày của một phiên cụ thể |
| `POST` | `/api/v1/market-analysis/daily/run` | Bearer + Admin | Sinh lại bài cuối ngày ngay lập tức (đồng bộ, ghi audit) |
| `GET` | `/api/v1/market-analysis/midday/latest` | Công khai | Bài giữa phiên mới nhất đã publish |
| `GET` | `/api/v1/market-analysis/midday/{session_date}` | Công khai | Bài giữa phiên của một ngày cụ thể |
| `POST` | `/api/v1/market-analysis/midday/run` | Bearer + Admin | Sinh lại bài giữa phiên ngay lập tức (đồng bộ, ghi audit) |
| `GET` | `/api/v1/market-analysis/premarket/latest` | Công khai | Bài trước phiên mới nhất đã publish |
| `GET` | `/api/v1/market-analysis/premarket/{session_date}` | Công khai | Bài trước phiên của một ngày cụ thể |
| `POST` | `/api/v1/market-analysis/premarket/run` | Bearer + Admin | Sinh lại bài trước phiên ngay lập tức (đồng bộ, ghi audit) |

> ⚠️ **Thứ tự khai báo route là load-bearing.** Trong FastAPI, `/daily/latest` được khai báo
> **TRƯỚC** `/daily/{session_date}`, nên `GET /daily/latest` khớp route `latest` chứ không
> bị parse thành `session_date="latest"`. Tương tự cho `midday` và `premarket`. Trong
> NestJS/Express phải đặt `@Get('daily/latest')` **trên** `@Get('daily/:sessionDate')`,
> nếu không `/daily/latest` sẽ trả 422 (parse date thất bại).

> ⚠️ **Không có endpoint list cho midday và premarket.** Chỉ `daily` có `GET /daily`.
> Đừng "cho đối xứng" bằng cách thêm `GET /midday` — nó không tồn tại trong contract hiện tại.

---

## Kiểu dữ liệu dùng chung

### Enum và literal

~~~ts
/** Cột analysis_history.report_type — String(16), server_default 'daily', có index.
 *  Ba giá trị này là TOÀN BỘ tập giá trị được sinh ra bởi backend. */
type ReportType = 'daily' | 'midday' | 'premarket';

/** Cột analysis_history.session_type — String(30), có index.
 *  Do classifier sinh ra (app/services/ai/market_analysis/classifier.py). */
type SessionType =
  | 'narrow_rally'          // Tăng phân hóa
  | 'broad_rally'           // Tăng lan tỏa
  | 'broad_selloff'         // Giảm sâu
  | 'low_volatility'        // Đi ngang
  | 'derivatives_anomaly'   // Đáo hạn phái sinh
  | 'hidden_distribution';  // Rút tiền ngầm

/** meta.session_type_display — bản tiếng Việt của session_type.
 *  Map trong generator.py :: SESSION_DISPLAY. Có thể null nếu LLM tự set khác. */
type SessionTypeDisplay =
  | 'Tăng phân hóa' | 'Tăng lan tỏa' | 'Giảm sâu'
  | 'Đi ngang' | 'Đáo hạn phái sinh' | 'Rút tiền ngầm';
~~~

### `AnalysisOut` — response của 6 endpoint đọc chi tiết

~~~ts
/** app/api/v1/endpoints/market_analysis.py :: AnalysisOut
 *  DÙNG CHUNG cho cả 3 report_type. Các field in-đậm bên dưới đổi hình dạng
 *  theo report_type — xem mục "Nội dung brief theo từng loại". */
interface AnalysisOut {
  /** = cột public_id. 'vnindex-2026-08-17' (daily) | 'midday-2026-08-17'
   *  | 'premarket-2026-08-17'. UNIQUE toàn bảng. KHÔNG phải UUID. */
  id: string;
  /** 'YYYY-MM-DD' (serialize từ kiểu date của Python) */
  session_date: string;
  session_type: SessionType;
  /** Lấy từ meta.session_type_display — null khi meta không có key đó */
  session_type_display: string | null;
  /** ISO 8601 có timezone, ví dụ '2026-08-17T09:31:04.512338+00:00' */
  generated_at: string;
  headline: string;
  /** Luôn là object (backend đổi null → {}) */
  tagline: DailyTagline | MiddayTagline | PremarketTagline | Record<string, never>;
  /** Luôn là object (backend đổi null → {}) */
  paragraphs: DailyParagraphs | MiddayParagraphs | PremarketParagraphs | Record<string, never>;
  /** Luôn là array (backend đổi null → []). premarket LUÔN [] */
  scenarios: DailyScenario[] | MiddayScenario[];
  /** null khi cột NULL — KHÔNG bị đổi thành [] */
  watchlist: DailyWatchItem[] | MiddayWatchItem[] | PremarketWatchItem[] | null;
  /** Cột Text. daily = HTML string | null. midday = string chứa JSON đã
   *  serialize của {title, content}. premarket = null. */
  unexplained: string | null;
  /** Toàn bộ cột meta, trả nguyên vẹn (không lọc) */
  meta: AnalysisMeta | null;
  /** = meta.charts (trích ra cho tiện) — null cho premarket */
  charts: ChartsBlock | null;
  /** = meta.pulse — CHỈ midday có; daily/premarket luôn null */
  pulse: PulseBlock | null;
}
~~~

> ⚠️ `charts` và `pulse` **xuất hiện hai lần** trong response: một lần ở top level và
> một lần bên trong `meta`. Đây là hành vi hiện tại (`_to_out` trích từ `meta` nhưng
> vẫn trả cả `meta`). Giữ nguyên để không phá frontend.

### `AnalysisListItem` — chỉ dùng cho `GET /daily`

~~~ts
interface AnalysisListItem {
  id: string;                 // public_id
  session_date: string;       // 'YYYY-MM-DD'
  session_type: SessionType;
  headline: string;
  tagline: Record<string, unknown>;   // null → {}
}
~~~

### `GenerateResult` — response của 3 endpoint `run`

~~~ts
interface GenerateResult {
  /** LƯU Ý: là string, KHÔNG phải date. 'YYYY-MM-DD' */
  session_date: string;
  session_type: SessionType;
  /** true khi validator trả 0 lỗi (kể cả lỗi cosmetic) */
  valid: boolean;
  /** true khi đã ghi/cập nhật xong row analysis_history */
  persisted: boolean;
  /** true khi memory_context nạp được last_analysis hoặc claims (chỉ daily) */
  memory_loaded: boolean;
  /** Số lần gọi LLM đã dùng (1 = thành công ngay lần đầu). Tối đa 4 */
  attempts: number;
  /** Danh sách lỗi validator còn lại (string tiếng Việt). [] khi sạch */
  errors: string[];
  /** Model do proxy báo về, ví dụ 'deepseek-v4-pro' */
  model: string;
  generation_time_ms: number;
}
~~~

### Khối `meta`

~~~ts
interface AnalysisMeta {
  /** Do generator ghi vào sau mỗi lần LLM trả về */
  model_used?: string;
  /** 0.0-1.0, chỉ daily có (midday/premarket payload không tính) */
  data_completeness?: number | null;
  memory_loaded?: boolean;
  /** Chỉ có khi còn lỗi cosmetic lúc publish (fail-open có ghi log) */
  validation_warnings?: string[];
  /** persist_analysis luôn ghi 3 key này, giá trị có thể null */
  session_type_display: string | null;
  charts: ChartsBlock | null;
  pulse: PulseBlock | null;
  /** CHỈ premarket — do postprocess `_resolve_premarket_output` chèn vào */
  hot_news?: PremarketHotNews[];
  events_filtered?: PremarketEvent[];
  world_overview?: GlobalMarketsBlock;
}
~~~

### Nội dung brief theo từng loại

~~~ts
// ── DAILY (cuối ngày) ────────────────────────────────────────────────────────
interface DailyTagline {
  direction: 'up' | 'down' | 'flat' | 'anomaly';
  marker: '◆' | '▲' | '▼' | '▬';
  /** KHÔNG được chứa ký tự marker — validator BUG17 chặn */
  text: string;
}
interface DailyParagraphs {
  /** HTML-inline: số bọc <span class="num">, tăng <span class="up-text">,
   *  giảm <span class="down-text">. 80-120 từ. */
  structure: string;
  smart_money: string;   // 70-100 từ
  market_health: string; // 80-110 từ, BẮT BUỘC chứa 'MA20' và 'thanh khoản'
  historical_pattern?: string | null;
}
interface DailyScenario {
  direction: 'up' | 'down';
  condition_html: string;  // mốc kỹ thuật bọc <strong>
  outcome_html: string;
}
interface DailyWatchItem {
  ticker: string;   // 'FPT'
  alert: boolean;   // true khi flow bất thường / mâu thuẫn
  reason_html: string;
}

// ── MIDDAY (giữa phiên) ──────────────────────────────────────────────────────
interface MiddayTagline {
  text: string;
  /** 'neutral' khi KLGD phiên sáng < 30% MA20 toàn ngày */
  color: 'up' | 'down' | 'neutral';
}
interface MiddayParagraphs {
  session_structure: { status: 'published'; content: string };
  money_flow:        { status: 'published'; content: string };
  /** KHÔNG có content — chờ EOD mới đánh giá được sức khỏe thị trường */
  market_health: {
    status: 'pending';
    pending_message: string;
    pending_until: string;   // ISO có offset, ví dụ '2026-08-17T16:30:00+07:00'
  };
}
interface MiddayScenario {
  type: 'up' | 'down';
  scope: 'afternoon_session';   // BẮT BUỘC, cả 3 phần tử
  condition: string;
  outcome: string;
}
interface MiddayWatchItem {
  /** Mã cổ phiếu, TRỪ phần tử index 1 phải là đúng chuỗi 'Giao dịch chiều' */
  key: string;
  alert_level: 'normal' | 'alert' | 'warn';
  reason: string;
}

// ── PREMARKET (trước phiên) ──────────────────────────────────────────────────
/** LLM trả tagline là STRING; postprocess đổi thành {text} */
interface PremarketTagline { text: string }
interface PremarketParagraphs {
  /** 70-130 từ sau khi strip HTML */
  world_paragraph: string | null;
}
interface PremarketWatchItem {
  level: 'normal' | 'alert' | 'warn';
  /** Mã cổ phiếu bọc <span class='tkr'>FPT</span>.
   *  Phần tử index 0 BẮT BUỘC chứa chuỗi 'VN-Index'. */
  content: string;
}
/** Nằm trong meta.hot_news — là item của news_pool đã merge thêm 2 field */
interface PremarketHotNews {
  id: string; title: string; summary: string; source: string;
  published_at: string; tickers: string[]; sectors: string[];
  sentiment: string; url: string;
  /** BẮT BUỘC mở đầu bằng '<strong>Tác động phiên sáng nay:</strong> ' */
  insight: string | null;
  rank_order: number | null;
}
/** Nằm trong meta.events_filtered — item của events_pool merge thêm 2 field */
interface PremarketEvent {
  id: string;
  type: 'ex_dividend' | 'agm' | 'insider' | 'listing' | 'other';
  time: string | null;      // 'HH:MM' hoặc null
  time_label: string;
  title: string;
  tickers: string[];
  note: string | null;      // 8-20 từ
  impact: 'high' | 'medium' | 'low' | null;
}
interface GlobalMarketsBlock {
  /** ĐÚNG 6 ô, đúng thứ tự: ^GSPC, ^IXIC, ^N225, BZ=F, GC=F, VND=X */
  cells: Array<{
    id: string; label: string;
    value: number | null; change_pct: number | null;
    sentiment: 'up' | 'down' | 'flat';
    stale: boolean;
    source?: 'vcb';          // chỉ khi USD/VND lấy fallback từ VCB
  }>;
  /** Symbol phụ: ^KS11, DX-Y.NYB, ES=F, NQ=F, ^VIX */
  context: Record<string, { value: number | null; change_pct: number | null; stale: boolean }>;
}
~~~

### Khối `charts` và `pulse`

~~~ts
interface ChartsBlock {
  breadth: {
    ceiling: number; up: number; flat: number; down: number; floor: number;
    ratio_up_down: string;   // '1.4 : 1' hoặc '1 : 2.0'
    classification: 'Phân hóa tiêu cực' | 'Nghiêng giảm' | 'Cân bằng' | 'Nghiêng tăng' | 'Tích cực';
    pct_above_ma20: number | null;
    /** CHỈ midday có */
    data_state?: 'am_session' | 'eod_previous' | 'unavailable';
  };
  contribution: {
    top_positive: Array<{ ticker: string; points: number }>;  // tối đa 8
    top_negative: Array<{ ticker: string; points: number }>;
    data_state?: 'am_session' | 'eod_previous' | 'unavailable';
  };
  foreign_detail: {
    total_buy_vnd_billion: number | null;
    total_sell_vnd_billion: number | null;
    streak: { count: number; direction: 'buy' | 'sell'; last_5d_cumulative: number | null };
    last_12_sessions: number[];   // tỷ VND, net theo phiên
    top_buy: Array<{ ticker: string; value: number | null }>;
    top_sell: Array<{ ticker: string; value: number | null }>;
    data_state?: 'am_session' | 'eod_previous' | 'unavailable';
  };
  prop_detail: {
    total_buy_vnd_billion: number | null;
    total_sell_vnd_billion: number | null;
    net_vnd_billion: number | null;
    last_12_sessions: number[];
    /** anomaly=true khi mã đó chiếm >50% tổng mua tự doanh */
    top_buy: Array<{ ticker: string; value: number | null; anomaly?: true }>;
    top_sell: Array<{ ticker: string; value: number | null }>;
    data_state?: 'am_session' | 'eod_previous' | 'unavailable';
  };
  market_health_detail: {
    pct_above_ma20: number | null;
    pct_above_ma20_change: number;
    pct_above_ma50: number | null;
    pct_above_ma200: null;          // luôn null ở v1 (API không trả EMA200)
    trend_20d: number[];
    callout: { tone: string; text: string };
    data_state?: 'eod_previous' | 'unavailable';
  };
  sector_rotation: {
    /** Sắp xếp change_pct GIẢM DẦN */
    sectors_today: Array<{ name: string; pct: number }>;
    data_state?: 'eod_previous' | 'unavailable';
  };
}

/** CHỈ midday. Dữ liệu tất định từ payload phiên sáng, KHÔNG do LLM sinh. */
interface PulseBlock {
  vn_index: {
    value: number | null; change: number | null; change_pct: number | null;
    sparkline: number[];
  };
  breadth: { up: number | null; down: number | null };
  foreign_net_billion: number | null;
  liquidity: {
    am_value_billion: number | null;
    ma20_billion: number | null;
    vs_ma20_pct: number | null;
  };
}
~~~

### Đơn vị — bắt buộc nhớ

| Field | Đơn vị | Ghi chú |
|---|---|---|
| `*_vnd_billion`, `net_vnd_billion`, `foreign_net_billion`, `*_billion` | **tỷ VND** | Nguồn Vietcap trả VND, backend chia `1_000_000_000` |
| `am_value_billion`, `ma20_billion` | **tỷ VND** | Nguồn trả **triệu VND**, chia `1_000` |
| `points` (contribution) | **điểm chỉ số** | Có dấu, âm = kéo giảm |
| `change_pct`, `pct_above_ma20`, `vs_ma20_pct` | **phần trăm** (`-0.17` = −0,17%) | KHÔNG phải tỷ lệ 0-1 |
| `generation_time_ms` | **millisecond** | Thực tế thường 60 000-200 000 |

---

## Nghiệp vụ nền

### 1. Một bảng, ba loại brief

`analysis_history` (SQLAlchemy: `app/models/market_analysis.py`) chứa cả ba loại:

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | UUID | PK (từ `UUIDMixin`) |
| `public_id` | `String(50)` | **UNIQUE**, NOT NULL |
| `session_date` | `Date` | index, NOT NULL |
| `generated_at` | `DateTime(tz)` | `server_default now()`, NOT NULL |
| `session_type` | `String(30)` | index, NOT NULL |
| `report_type` | `String(16)` | index, NOT NULL, `server_default 'daily'` |
| `headline` | `Text` | NOT NULL |
| `tagline`, `paragraphs`, `scenarios` | `JSON` | NOT NULL |
| `watchlist`, `meta` | `JSON` | NULL được |
| `unexplained` | `Text` | NULL được |
| `is_published` | `Boolean` | `server_default 'true'`, NOT NULL |
| — | — | `UNIQUE (session_date, report_type)` tên `uq_analysis_session_date_report_type` |
| `created_at`, `updated_at` | `DateTime(tz)` | từ `TimestampMixin` |

Map `report_type` → endpoint:

| `report_type` | Endpoint đọc | Job cron | Entrypoint Python |
|---|---|---|---|
| `daily` | `/daily`, `/daily/latest`, `/daily/{d}` | 16:30 ICT + vá 17:00 ICT | `run_daily_analysis()` |
| `midday` | `/midday/latest`, `/midday/{d}` | 11:30 ICT | `run_midday_analysis()` |
| `premarket` | `/premarket/latest`, `/premarket/{d}` | 07:15 ICT | `run_premarket_analysis()` |

Mọi query đọc đều **lọc cả hai** điều kiện `is_published = true` AND `report_type = <loại>`.
Không có endpoint nào trả row của loại khác — đã có test chặn
(`tests/test_midday_endpoints.py::test_daily_latest_ignores_midday_rows`).

`analysis_claims` là bảng phụ **chỉ daily dùng**:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | PK |
| `analysis_id` | UUID | FK → `analysis_history.id`, `ON DELETE CASCADE`, index |
| `session_date` | `Date` | index |
| `claim_text` | `Text` | `"{condition} → {outcome}"` |
| `claim_type` | `String(30)` | `'scenario_up'` (index 0) hoặc `'scenario_down'` |
| `conditions` | `JSON` | Object máy đọc được (xem §5) |
| `predicted_outcome` | `Text` | NULL được |
| `status` | `String(20)` | `server_default 'pending'` → `confirmed` / `refuted` / `partial` |
| `verified_at` | `DateTime(tz)` | NULL cho tới khi verify |
| `verification_note` | `Text` | Câu tiếng Việt mô tả kết quả |
| `expires_at` | `Date` | `session_date + 5 ngày` |
| — | — | `INDEX ix_analysis_claims_status_date (status, session_date)` |

> Cột `embedding VECTOR(1536)` trong spec gốc **bị bỏ có chủ đích** ở v1 (chưa cài pgvector).
> Không tạo cột này trong bản TS.

### 2. Pipeline sinh brief (`run_session_analysis`)

Cả ba loại dùng đúng một hàm, tham số hóa bằng `SessionConfig`:

| Trường config | daily | midday | premarket |
|---|---|---|---|
| `report_type` | `daily` | `midday` | `premarket` |
| Payload builder | `build_analysis_payload()` (không cần db) | `build_midday_payload(db)` | `build_premarket_payload(db)` |
| System prompt | `SYSTEM_PROMPT` | `MIDDAY_SYSTEM_PROMPT` | `PREMARKET_SYSTEM_PROMPT` |
| Validator | `validate_output` | `validate_midday` | `validate_premarket` |
| `use_memory` | **true** | false | false |
| `persist_claims` | **true** | false | false |
| `postprocess` | — | — | `_resolve_premarket_output` |
| `temperature` | 0.3 | 0.3 | **0.5** |
| `max_retries` | 3 | 3 | 3 |

Thứ tự các bước (bám đúng thứ tự này khi viết lại):

1. Build payload (hoặc nhận payload truyền sẵn — midday/premarket **luôn** truyền sẵn vì
   builder cần `db`; `payload_builder` của hai config đó là stub **ném RuntimeError** nếu bị gọi).
2. `session_date = date.fromisoformat(payload.meta.generated_for_date)`.
3. Nếu `use_memory` và có db: nạp `memory_context` + verify claims → `db.commit()`.
   **Lỗi ở bước này không làm hỏng bài**: log warning, `db.rollback()`, đi tiếp với
   `memory_loaded = false`.
4. `session_type = classify_session(payload)` → ghi vào `payload.meta.session_type`.
5. Vòng lặp tối đa **4 lần** (`range(max_retries + 1)` với `max_retries=3`):
   - build user prompt; từ lần 2 trở đi **nối thêm** block
     `"\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n- <lỗi>…"`.
   - gọi `chat_completion(system, user, temperature)`.
   - parse JSON: bóc markdown fence bằng regex `^```(?:json)?\s*|\s*```$` (multiline),
     nếu vẫn lỗi thì cắt từ `{` đầu tiên tới `}` cuối cùng. Vẫn lỗi → `errors = ["Output không
     phải JSON hợp lệ"]`, `continue` sang lần sau.
   - `setdefault` các khóa: `session_type`, `session_date`, `id`, `session_type_display`, `meta`.
     **`id` fallback theo report_type**: prefix `vnindex` cho daily, còn lại lấy chính
     `report_type` → `midday-2026-08-17`, `premarket-2026-08-17`. (Nếu dùng chung
     `vnindex-{date}` thì row non-daily sẽ chiếm `public_id` UNIQUE và làm INSERT daily
     cùng ngày chết IntegrityError.)
   - ghi vào `meta`: `model_used`, `data_completeness`, `memory_loaded`.
   - chạy validator → nếu `errors` rỗng thì **break**.
6. `valid = (errors rỗng) && output != null`.
7. `blocking = hard_errors(errors)` — bỏ mọi lỗi có prefix trong
   `SOFT_ERROR_PREFIXES = ("BUG15","BUG16","BUG17","BUG18")`.
8. `publishable = output != null && blocking rỗng`. Nếu còn lỗi cosmetic thì vẫn publish và
   ghi `meta.validation_warnings = errors`.
9. Gắn `output.charts = payload.charts`, `output.pulse = payload.pulse` (daily/premarket
   payload không có key `pulse` → `null`).
10. Nếu `publishable` và có db: chạy `postprocess` (nếu có) rồi `persist_analysis(...)`.
    **Lỗi persist → log error + `db.rollback()`, `persisted = false`, request vẫn trả 200.**

### 3. Validator — nguyên tắc fail-closed / fail-open

- Validator **không** ném exception; nó trả `string[]`.
- **Fail-closed cho lỗi cứng**: còn bất kỳ lỗi không thuộc `SOFT_ERROR_PREFIXES` sau 4 lần
  thử → **không ghi DB**, endpoint `run` trả 200 với `persisted=false`, `valid=false`,
  `errors` đầy đủ. Không có row nào được publish → endpoint đọc sẽ vẫn trả bài của ngày cũ.
- **Fail-open cho lỗi cosmetic** (`BUG15/16/17/18`): vẫn publish, ghi warning vào
  `meta.validation_warnings`. Lý do: một lỗi văn phong không được phép làm bài EOD offline.

Danh sách rule chính (nguyên văn message tiếng Việt sinh ra):

**Chung ba loại — danh sách từ cấm (`validator.py`)**

| Danh sách | Nội dung | Message |
|---|---|---|
| `FORBIDDEN_ANGLICIZED` | catalyst, rotation, concentration, breakout, momentum, smart money, sell-off, selloff, outperform, oversold, overbought, risk-on, risk-off, exposure, performance, narrative, rebalancing, midcap, smallcap | `Anh hóa: '<t>'` |
| `FORBIDDEN_BUG11` | phân phối ngầm, phân phối đỉnh, vùng phân phối, co cụm | `Cấm: '<t>'` |
| `FORBIDDEN_LEAK` | không có sẵn, không có dữ liệu, thiếu thông tin, chưa cập nhật, dữ liệu không đầy đủ, không đủ thông tin, không khả dụng, không thể truy cập | `Cấm: '<t>'` |
| `FORBIDDEN_INTL` | s&p, nasdaq, nikkei, kospi, shanghai, hang seng, usd/vnd, dxy, vàng thế giới, brent, us10y, fomc, powell, cpi mỹ, chứng khoán mỹ, chứng khoán thế giới, bối cảnh thế giới, châu á, `\bfed\b`, `\bvix\b` | `Quốc tế: '<t>'` |

`FORBIDDEN_ANGLICIZED` khớp bằng `\b<term>\b`; `FORBIDDEN_BUG11`/`FORBIDDEN_LEAK` khớp
substring; `FORBIDDEN_INTL` — phần tử bắt đầu bằng `\b` dùng regex, còn lại substring.
Toàn bộ so sánh trên text **đã strip HTML** (`re.sub(r"<[^>]+>", "", s)`) và **lowercase**.

**`validate_output` (daily)** — `BUG17` marker trong `tagline.text`; `BUG16` số lặp ≥3 lần
(bỏ qua mốc kỹ thuật trong scenarios); `BUG15` câu tham chiếu memory nằm ở 70% đầu đoạn
`structure`; `BUG18` `market_health` <70 từ hoặc <4/6 chỉ báo; `BUG20` mốc scenario thấp hơn
`far_support − 5` mà không gắn nhãn "cực đoan"; `BUG21` có mâu thuẫn (mã trong `top_positive`
lại nằm trong `foreign_flow.top_sell` với |giá trị| >100 tỷ, hoặc `prop_trading.
buy_concentration_flag.concentrated`) mà thiếu `unexplained`; headline >80 ký tự;
`market_health` thiếu chuỗi `ma20` hoặc `thanh khoản`.

**`validate_midday`** (cứng): headline 60-90 ký tự; `paragraphs.session_structure` và
`money_flow` phải `status='published'`; `market_health` phải `status='pending'`; đúng 3
scenarios, phần tử [2] `type='down'`, cả 3 `scope='afternoon_session'`; đúng 5 watchlist,
`watchlist[1].key === 'Giao dịch chiều'`; không có ASCII `-` ngay trước chữ số (phải dùng
U+2212 `−`); không có cụm khuyến nghị mua/bán (`nên mua`, `nên bán`, `khuyến nghị mua`,
`khuyến nghị bán`, `recommend.*buy`, `recommend.*sell`, `\bbuy\b`, `\bsell\b`).

**`validate_premarket`** (cứng): headline 60-90 ký tự **và phải chứa em-dash `—`**; `tagline`
không rỗng; `world_paragraph` 70-130 từ sau strip HTML; `len(hot_news) === min(5, len(news_pool))`;
mọi `hot_news[].id` ∈ id của `news_pool`; mọi `insight` mở đầu **đúng** bằng
`<strong>Tác động phiên sáng nay:</strong> ` và thân 30-55 từ; `events_filtered` 2-10 mục
(**bỏ qua** kiểm tra này khi CẢ pool và output đều rỗng); mọi `events_filtered[].id` ∈ pool;
`impact` ∈ `{high, medium, low}`; `watch_today` 5-6 mục; `watch_today[0].content` chứa
`'VN-Index'`; `level` ∈ `{normal, alert, warn}`; không ASCII `-` trước chữ số.

### 4. Quy tắc `FORBIDDEN_INTL` của brief trước phiên — QUAN TRỌNG

Đây là ngoại lệ dễ làm hỏng bản viết lại nhất.

- Với **daily** và **midday**: `FORBIDDEN_INTL` áp lên **toàn bộ** text hiển thị. Bài EOD/giữa
  phiên **cấm tuyệt đối** nhắc S&P, Nikkei, Brent, Fed, USD/VND, "châu Á"…
- Với **premarket**: `FORBIDDEN_INTL` **CHỈ áp cho các field nội địa** —
  `tagline`, `hot_news[].insight`, `events_filtered[].note`, `watch_today[].content`.
  **`headline` và `world_paragraph` được MIỄN** vì theo contract chúng phải tóm bức tranh
  quốc tế qua đêm; ban chúng ở đó đã làm generation **thất bại 4/4 lần trên prod**
  (ghi rõ trong docstring `premarket_validator._all_content_texts`).
- `headline` + `world_paragraph` **vẫn bị** quét `FORBIDDEN_ANGLICIZED`, `FORBIDDEN_BUG11`,
  `FORBIDDEN_LEAK` và quy tắc hyphen.
- Cụm nói chung ("Phố Wall", "thị trường quốc tế", "qua đêm") được phép ở **mọi** field.

Triển khai TS: cần **hai** tập text — `allTextsIncludingWorld` (cho ANGLICIZED/BUG11/LEAK +
hyphen) và `allTextsNoWorld` (cho INTL). Đừng gộp một hàm.

### 5. `memory.py` — brief tham chiếu phiên trước thế nào

Chỉ **daily** dùng (`use_memory=true`).

`build_memory_context(db, today)`:
- `last`: row `analysis_history` mới nhất có `session_date < today`, `is_published=true`,
  **`report_type='daily'`** (lọc này bắt buộc — nếu không row midday cùng ngày sẽ lọt vào).
  → `{date, days_ago, headline, tagline (lấy tagline.text), key_paragraphs:{structure, smart_money}}`.
- `recent_5_sessions_overview`: 5 row daily gần nhất (`LOAD_LAST_N = 5`), mỗi row
  `{date, type, headline, tagline}`.

`verify_pending_claims(db, today, today_payload)`:
- Lấy claim `status='pending'` AND `expires_at >= today` AND `session_date < today`,
  `ORDER BY session_date DESC`.
- Với mỗi claim, `verify_claim(conditions, today_payload)`:
  - `today_index = payload.vnindex.close`; nếu null → `still_pending`, note
    `"Thiếu dữ liệu index hôm nay"`.
  - `today_foreign_sell = |payload.foreign_flow.net_value_vnd_billion|` **chỉ khi net < 0**,
    ngược lại `0.0`.
  - Đối chiếu các key có mặt: `vnindex_above` (index >), `vnindex_below` (index <),
    `foreign_sell_lt_vnd_billion` (<), `foreign_sell_gt_vnd_billion` (>).
  - Không có điều kiện nào → `still_pending`, note `"Không có điều kiện verify được"`.
  - Tất cả đúng → `confirmed` / không cái nào đúng → `refuted` / còn lại → `partial`.
  - Note mẫu: `"Tất cả điều kiện đúng: Index 1827.41, KN net -1867.8 tỷ"`.
- Claim khác `still_pending` được **ghi lại** `status`, `verified_at = now(UTC)`,
  `verification_note`. Generator gọi `db.commit()` ngay sau đó.

`extract_claims(output)` (chạy trong `persist_analysis` khi `persist_claims=true`):
- Duyệt `output.scenarios`, lấy `condition_html || condition`, parse bằng
  `parse_scenario_condition`; **bỏ qua** scenario không parse ra điều kiện nào.
- `claim_type = 'scenario_up'` nếu index 0, còn lại `'scenario_down'`.

`parse_scenario_condition(text)` — strip HTML rồi lowercase, dùng 4 regex:

| Regex | Key sinh ra |
|---|---|
| `(?:giữ trên\|vượt\|trên)\s*([\d.,]+)` | `vnindex_above` |
| `(?:mất\|dưới\|về)\s*([\d.,]+)` | `vnindex_below` |
| `(?:kn\|khối ngoại\|ngoại)\s*bán\s*(?:dưới\|<)\s*([\d.,]+)\s*tỷ` | `foreign_sell_lt_vnd_billion` |
| `(?:kn\|khối ngoại\|ngoại)\s*bán\s*(?:trên\|>)\s*([\d.,]+)\s*tỷ` | `foreign_sell_gt_vnd_billion` |

Parse số kiểu VN: bỏ hết dấu `.`, đổi `,` → `.` → `'1.825,4'` thành `1825.4`. Không parse
được → `0.0` (không ném lỗi).

`persist_analysis(db, output, session_date, session_type, report_type, persist_claims)`:
- UPSERT theo `(session_date, report_type)` — **không** theo `public_id`.
- `unexplained`: nếu là `dict` (midday) thì `json.dumps(..., ensure_ascii=False)` trước khi ghi
  vào cột Text.
- `public_id = output.id || f"vnindex-{session_date}"` (fallback cuối cùng vẫn là `vnindex-`
  — chỉ chạm tới khi output không có `id`, mà generator đã `setdefault` nên thực tế không xảy ra).
- `generated_at = now(UTC)` — **ghi lại mỗi lần upsert**, kể cả khi chỉ chạy lại cùng ngày.
- `meta = {...output.meta, session_type_display, charts, pulse}`.
- `is_published = true` **luôn** (không có đường code nào ghi `false`).
- Khi update và `persist_claims=true`: `DELETE FROM analysis_claims WHERE analysis_id = <id>`
  trước khi tạo claim mới.
- `expires_at = session_date + 5 ngày` (`CLAIM_EXPIRY_DAYS = 5`).
- Kết thúc bằng `db.commit()` **bên trong** hàm.

### 6. `market_calendar.py` — xác định ngày giao dịch

Không có data feed; **tất cả tính từ ngày** (spec §13). Bản TS cần đúng 7 hàm:

| Hàm | Logic |
|---|---|
| `third_thursday(year, month)` | Quét ngày 15→21, trả ngày có `weekday() === Thursday` |
| `get_next_futures_expiry(today)` | Thứ 5 tuần 3 tháng này; nếu đã qua thì sang tháng sau. Mã `VN30F{yy}{mm}` (2 chữ số, pad 0) |
| `is_futures_expiry_date(d)` | `d === third_thursday(d.year, d.month)`. Nhận cả `Date` và string ISO |
| `get_next_macro_publish(today)` | TCTK công bố CPI/IIP/XNK **ngày 29 mỗi tháng**; đã qua thì sang tháng sau. Trả `{type: "CPI/IIP/XNK tháng <m>", date, days_until}` |
| `get_earnings_context(today)` | Mùa KQKD: `Q1 = 01/04→30/04`, `Q2 = 01/07→30/07`, `Q3 = 01/10→30/10`, `Q4_FY = 01/01→31/01`. Trả `{current, current_until, next:null}` khi đang trong mùa, ngược lại `{current:null, next:{name, starts, days_until}}` |
| `is_trading_day(d)` | `weekday < 5` **và** `d ∉ VN_HOLIDAYS_2026` |
| `build_calendar_block(today)` | Gộp expiry + earnings + macro thành khối `calendar_hardcoded` |

`VN_HOLIDAYS_2026` (hardcode, **chỉ có năm 2026**):
`2026-01-01, 2026-02-16, 2026-02-17, 2026-02-18, 2026-02-19, 2026-02-20, 2026-04-06,
2026-04-30, 2026-05-01, 2026-09-02`.

> ⚠️ Sang **2027 danh sách này rỗng** ⇒ `is_trading_day` sẽ coi mọi ngày lễ 2027 là ngày
> giao dịch và cron vẫn chạy. Bản TS nên chuyển sang bảng cấu hình theo năm, nhưng **giữ
> nguyên giá trị 2026** để hành vi hiện tại không đổi.

> ⚠️ `get_earnings_context` giả định `upcoming` không rỗng (`upcoming[0]` không guard).
> Danh sách windows phủ cả năm nay và năm sau nên thực tế luôn có phần tử — giữ nguyên
> cách sinh windows đó, đừng chỉ sinh cho năm hiện tại.

`_compute_calendar_flags(today)` trong `premarket_payload.py`:
- `is_post_weekend = today.weekday() === 0` (thứ Hai).
- `is_post_holiday`: ngày **lịch** hôm qua là ngày trong tuần (`weekday < 5`) **và**
  `!is_trading_day(hôm qua)` — tức hôm qua là ngày lễ, không phải cuối tuần.
- `_prev_trading_day(today)`: lùi từ hôm qua, tối đa 14 vòng, trả ngày giao dịch đầu tiên
  gặp; hết vòng thì fallback về `today - 1`.

### 7. `classify_session` — và cái bẫy với midday/premarket

Đọc payload, quyết định theo **thứ tự ưu tiên** (dừng ở điều kiện đầu tiên khớp):

1. `derivatives_anomaly` — nếu là ngày đáo hạn phái sinh **HOẶC** (`intraday_range_pct > 1.5`
   và `|last_30min_change_pct| > 0.7`).
2. `broad_selloff` — `change_pct < -2.0` và `advances/max(declines,1) < 0.3` và
   `foreign_net_billion < -500`.
3. `hidden_distribution` — `|change_pct| < 0.5` và **≥2 trong 3**: (`|foreign_net| > 500` và
   `foreign_net < 0`), `breadth_ratio < 0.6`, `streak_count >= 3`.
4. `broad_rally` — `change_pct > 1.0` và `breadth_ratio > 3.0` và `top3_pct < 50`.
5. `narrow_rally` — `change_pct > 0.5` và `top3_pct > 50` và `breadth_ratio < 1.5`.
6. `low_volatility` — `|change_pct| < 0.3` và `volume_ratio != null` và `volume_ratio < 0.7`.
7. Fallback — `change_pct > 0 ? 'narrow_rally' : 'low_volatility'`.

> ⚠️ **Bẫy đã có trong prod, phải giữ nguyên**: classifier đọc `payload.breadth.advances` /
> `.declines`, nhưng payload **midday** dùng khóa `up` / `down`, và payload **premarket**
> **không có** khối `vnindex`/`breadth` nào cả. Kết quả:
> - premarket luôn ra `low_volatility` (hoặc `derivatives_anomaly` vào thứ 5 tuần 3);
> - midday có `breadth_ratio = 0` nên rất dễ rơi vào `hidden_distribution` hoặc
>   `low_volatility`.
>
> `session_type` và `session_type_display` của hai loại này vì thế **không mang ý nghĩa
> phân tích**. Đừng "sửa" khi viết lại, và đừng để frontend hiển thị chúng như nhãn phiên thật.

### 8. Gọi LLM (`proxy_client.chat_completion`)

- `POST {AI_PROXY_BASE_URL}/chat/completions`, body OpenAI-compatible
  `{model, messages:[system,user], temperature}`, header `Authorization: Bearer <AI_PROXY_API_KEY>`.
- Timeout `AI_PROXY_TIMEOUT_SECONDS` (default **120s**). Model default `deepseek-v4-flash`
  (prod dùng `deepseek-v4-pro`).
- Trả `[content, data.model ?? model]`.
- Ném `AIProxyError` khi: timeout (`AI proxy timeout sau <n>s: <ClassName>`), connect error
  (`Không thể kết nối đến AI proxy: <ClassName>`), HTTP lỗi
  (`AI proxy trả về HTTP <status>`), lỗi HTTP khác, hoặc response thiếu
  `choices[0].message.content`.
- Ném `ValueError` khi chưa cấu hình: `AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL
  trong biến môi trường.` / `AI proxy API key chưa được cấu hình. Hãy đặt AI_PROXY_API_KEY
  trong biến môi trường.`
- **TUYỆT ĐỐI không log response body** (có thể echo lại API key trong message lỗi).

> ⚠️ `chat_completion` **không** được bọc try/except trong vòng lặp retry. `AIProxyError`
> và `ValueError` **thoát ra khỏi** pipeline ⇒ endpoint `run` trả **500**, không phải 200 với
> `errors`. Chỉ lỗi *parse JSON* và lỗi *validator* mới được retry.

`prompt_loader.load_prompt()` **không dùng** cho nhóm này — prompt của market-analysis là
constant Python trong `prompts.py` / `midday_prompts.py` / `premarket_prompts.py`, không đọc
từ `docs/ai/`. (`prompt_loader` chỉ phục vụ `bctc`/`dashboard`/`industry`/`insight`.)

### 9. Cron + chống chạy trùng

Job nằm ở `app/services/jobs/market_analysis_job.py`, đăng ký trong
`app/services/jobs/__init__.py` bằng APScheduler `CronTrigger(timezone="Asia/Ho_Chi_Minh")`.

| Job id | Cron | Điều kiện đăng ký | Advisory-lock key |
|---|---|---|---|
| `market_analysis_premarket` | `mon-fri 07:15` | `PREMARKET_ANALYSIS_ENABLED` | `826101734` |
| `market_analysis_midday` | `mon-fri 11:30` | `MIDDAY_ANALYSIS_ENABLED` | `826101731` |
| `market_analysis_daily` | `mon-fri 16:30` | `MARKET_ANALYSIS_ENABLED` | `826101730` |
| `market_analysis_daily_retry` | `mon-fri 17:00` | `MARKET_ANALYSIS_ENABLED` | `826101732` |

Giờ/phút đều đọc từ env (`*_CRON_HOUR`, `*_CRON_MINUTE`, `MARKET_ANALYSIS_RETRY_HOUR/MINUTE`).
Mọi job đặt `max_instances=1, coalesce=True, replace_existing=True`.

Thân mỗi job:
1. `today = now(ICT).date()`. `!is_trading_day(today)` → trả
   `{"skipped": "not_trading_day", "date": "<ISO>"}`, **không** gọi LLM.
2. Nếu được truyền `session` sẵn (test/manual) → chạy luôn, **bỏ qua lock**.
3. Ngược lại mở session riêng, `SELECT pg_try_advisory_lock(:key)`. Không lấy được →
   `{"skipped": "locked", "date": "<ISO>"}`. Lấy được → chạy, và trong `finally`:
   `SELECT pg_advisory_unlock(:key)` + `commit()`.

`run_daily_retry_job` thêm một bước idempotent: kiểm tra đã có row
`(session_date=today, report_type='daily', is_published=true)` hay chưa; có rồi →
`{"skipped": "already_published", "date": "<ISO>"}`.

> ⚠️ Lock là **session-level** (`pg_try_advisory_lock`), không phải transaction-level. Nó sống
> qua các `commit()` nội bộ của generator (bắt buộc), nhưng nếu connection bị pool tái sử
> dụng mà chưa unlock thì lock rò rỉ và job **im lặng skip mãi mãi**. Bản TS nên dùng lock
> theo advisory-xact hoặc bảo đảm connection dedicated + unlock trong `finally`.

> ⚠️ **Ba endpoint `run` KHÔNG dùng lock, KHÔNG kiểm tra ngày giao dịch.** Chúng gọi thẳng
> `run_*_analysis()`. Hai admin bấm cùng lúc → hai lần gọi LLM song song, và cả hai đều
> `persist_analysis` UPSERT lên cùng `(session_date, report_type)`; kết quả cuối phụ thuộc
> ai commit sau. Xem "Ghi chú tổng hợp".

### 10. `latest` = "mới nhất theo session_date", KHÔNG phải "của hôm nay"

Query dùng chung cho cả ba loại:

~~~sql
SELECT * FROM analysis_history
WHERE is_published = TRUE AND report_type = :report_type
ORDER BY session_date DESC
LIMIT 1;
~~~

Không có bất kỳ điều kiện `session_date = CURRENT_DATE` hay khoảng thời gian nào.
Hệ quả **đã gặp trên prod**: sau một ngày generation thất bại (hoặc trước giờ cron của
phiên hôm nay), `latest` trả bài của **phiên trước** và client hiển thị nó như bài mới.

Client phân biệt bằng **hai field trong response**:
- `session_date` — so với ngày hôm nay theo ICT. Khác ⇒ bài cũ.
- `generated_at` — thời điểm sinh thật (UTC, có tz), dùng để hiện "cập nhật lúc …".

Không có field `is_stale` / `is_today` nào ở API. Nếu bản TS muốn thêm, **thêm mới**
(ví dụ `is_current_session: boolean`) chứ đừng đổi ý nghĩa của `latest`.

`ORDER BY` chỉ trên `session_date`, không tie-break bằng `generated_at`. Ràng buộc
`UNIQUE(session_date, report_type)` bảo đảm không có hai row cùng cặp khóa nên thực tế
không bị nhập nhằng — nhưng **nếu bản TS bỏ unique constraint thì phải thêm
`ORDER BY session_date DESC, generated_at DESC`**.

---

## Nhóm Cuối ngày — EOD (`report_type = "daily"`)

### GET /api/v1/market-analysis/daily

> **Danh sách bài nhận định cuối ngày** — trả mục lục N bài EOD gần nhất (chỉ headline + tagline) để dựng danh sách/điều hướng.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`RATE_LIMIT_DEFAULT = 60/minute`, SlowAPI toàn app) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `limit` | integer | Không | `20` | `>= 1`, `<= 100` | Số bài tối đa trả về |

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisListItem[];
~~~

~~~json
[
  {
    "id": "vnindex-2026-08-17",
    "session_date": "2026-08-17",
    "session_type": "narrow_rally",
    "headline": "VN-Index tăng 0.84% nhờ VCB và FPT, độ rộng vẫn nghiêng giảm",
    "tagline": { "direction": "up", "marker": "▲", "text": "TĂNG PHÂN HÓA · Trụ đỡ điểm · Khối ngoại bán ròng" }
  },
  {
    "id": "vnindex-2026-08-14",
    "session_date": "2026-08-14",
    "session_type": "low_volatility",
    "headline": "VN-Index đi ngang, thanh khoản còn 61% MA20",
    "tagline": { "direction": "flat", "marker": "▬", "text": "ĐI NGANG · Thanh khoản cạn · Chờ dòng tiền" }
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `limit` không phải số nguyên, `< 1` hoặc `> 100` | `[{"loc":["query","limit"],"msg":"Input should be less than or equal to 100","type":"less_than_equal"}]` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Chưa có bài EOD nào (hoặc mọi row `is_published=false`) → **`200` với
array rỗng `[]`**, KHÔNG phải 404. Endpoint không gọi provider ngoài nên không có đường suy giảm khác.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/daily?limit=20' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 6f1a2c3d-4e5b-4a7c-9d80-1b2c3d4e5f60'
~~~

**Ghi chú khi viết lại** — Sắp xếp `ORDER BY session_date DESC` (không dùng `created_at`).
Chỉ lấy `report_type='daily'` AND `is_published=true`. `tagline` null phải hóa `{}` trước khi
trả (schema khai `dict`, không nullable). Không trả `paragraphs`/`scenarios`/`meta` ở endpoint
này — payload phải nhẹ. Path **không** có dấu `/` cuối.

---

### GET /api/v1/market-analysis/daily/latest

> **Bài nhận định cuối ngày mới nhất** — trả bài EOD có `session_date` lớn nhất đã publish.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể daily: DailyTagline / DailyParagraphs / DailyScenario[] / DailyWatchItem[]
~~~

~~~json
{
  "id": "vnindex-2026-08-17",
  "session_date": "2026-08-17",
  "session_type": "narrow_rally",
  "session_type_display": "Tăng phân hóa",
  "generated_at": "2026-08-17T09:33:18.204117+00:00",
  "headline": "VN-Index tăng 0.84% nhờ VCB và FPT, độ rộng vẫn nghiêng giảm",
  "tagline": { "direction": "up", "marker": "▲", "text": "TĂNG PHÂN HÓA · Trụ đỡ điểm · Khối ngoại bán ròng" },
  "paragraphs": {
    "structure": "VN-Index đóng cửa <span class=\"num\">1,842.60</span> (<span class=\"up-text\">+0.84%</span>), tăng <span class=\"num\">15.34</span> điểm nhưng độ rộng chỉ 148 mã tăng / 176 mã giảm. VCB và FPT gộp lại đóng góp <span class=\"num\">62%</span> tổng phía tăng.",
    "smart_money": "Khối ngoại bán ròng <span class=\"num\">412.6</span> tỷ đồng, phiên thứ 4 liên tiếp. Bán mạnh nhất là FPT (<span class=\"down-text\">−188.3</span> tỷ) và HPG (<span class=\"down-text\">−96.1</span> tỷ); mua ròng nhiều nhất VNM (<span class=\"num\">+54.2</span> tỷ). Tự doanh mua ròng nhẹ <span class=\"num\">37.8</span> tỷ.",
    "market_health": "Tỷ lệ mã trên MA20 tăng từ 44.1% lên 47.9%, phiên thứ 2 tăng liên tiếp. Thanh khoản 16,240 tỷ, thấp hơn 14% MA20. VN-Index nằm trên MA20 và MA200 nhưng vẫn dưới MA50 tại 1,858. Nhóm ngân hàng dẫn dắt phiên thứ 3 liên tiếp; dòng tiền rời nhóm thép sang nhóm bán lẻ. Vốn hóa lớn giữ nhịp còn HNX giảm 0.42% (HNX chủ yếu là cổ phiếu vốn hóa vừa và nhỏ), cho thấy sức khỏe cải thiện nhưng chưa lan tỏa.",
    "historical_pattern": null
  },
  "scenarios": [
    {
      "direction": "up",
      "condition_html": "Nếu VN-Index giữ trên <strong>1,838</strong> và thanh khoản vượt <strong>18,000</strong> tỷ",
      "outcome_html": "chỉ số có thể kiểm tra lại MA50 tại <strong>1,858</strong>."
    },
    {
      "direction": "down",
      "condition_html": "Nếu mất <strong>1,825</strong> với khối ngoại bán trên <strong>600</strong> tỷ",
      "outcome_html": "áp lực điều chỉnh mở về vùng <strong>1,810</strong>."
    }
  ],
  "watchlist": [
    { "ticker": "FPT", "alert": true, "reason_html": "— Tăng 1.9% nhưng khối ngoại bán ròng 188.3 tỷ, mâu thuẫn giữa giá và dòng tiền ngoại." },
    { "ticker": "VCB", "alert": false, "reason_html": "— Đóng góp +4.7 điểm, chiếm 31% tổng phía tăng." }
  ],
  "unexplained": "HNX giảm 0.42% trong khi VN-Index tăng 0.84% và thanh khoản HNX chỉ bằng 58% bình quân. Chưa rõ nguyên nhân từ dữ liệu hiện có; đáng quan sát dòng tiền nhóm vốn hóa nhỏ vài phiên tới.",
  "meta": {
    "model_used": "deepseek-v4-pro",
    "data_completeness": 1.0,
    "memory_loaded": true,
    "session_type_display": "Tăng phân hóa",
    "charts": { "breadth": { "ceiling": 3, "up": 148, "flat": 61, "down": 176, "floor": 2, "ratio_up_down": "1 : 1.2", "classification": "Nghiêng giảm", "pct_above_ma20": 47.9 } },
    "pulse": null
  },
  "charts": { "breadth": { "ceiling": 3, "up": 148, "flat": 61, "down": 176, "floor": 2, "ratio_up_down": "1 : 1.2", "classification": "Nghiêng giảm", "pct_above_ma20": 47.9 } },
  "pulse": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row nào `report_type='daily'` AND `is_published=true` | `Không tìm thấy Chưa có bài nhận định nào` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

> ⚠️ `detail` đúng như trên, kể cả chỗ đọc hơi kỳ. Code gọi
> `NotFoundError("Chưa có bài nhận định nào")` — tham số **thứ nhất** của `NotFoundError` là
> `resource`, không phải `detail`, nên constructor ghép thành `f"Không tìm thấy {resource}"`.
> **Giữ nguyên chuỗi này** để không phá test/frontend đang so string.

**Fallback / suy giảm** — Chỉ đọc DB, không có provider ngoài. Ngoài giờ giao dịch / ngày nghỉ
lễ vẫn trả bài của phiên giao dịch gần nhất (không có kiểm tra "hôm nay là phiên hay không").
Nếu generation hôm nay thất bại thì trả bài **hôm trước** — client tự so `session_date`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/daily/latest' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 7a2b3c4d-5e6f-4a8b-9c01-2d3e4f5a6b71'
~~~

**Ghi chú khi viết lại** — Route phải khai **trước** `/daily/{session_date}`.
`session_type_display` lấy từ `meta.session_type_display` (không phải map lại từ
`session_type`) — nếu `meta` null thì trả `null`. `charts`/`pulse` **cũng** lấy từ `meta`, không
phải cột riêng. `watchlist` giữ `null` (không hóa `[]`); `tagline`/`paragraphs` null → `{}`;
`scenarios` null → `[]`. `generated_at` phải giữ offset timezone.

---

### GET /api/v1/market-analysis/daily/{session_date}

> **Bài nhận định cuối ngày theo phiên** — trả bài EOD của đúng một ngày phiên.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `session_date` | `string` (format `date`) | `YYYY-MM-DD`, parse được bởi `date.fromisoformat` | Ngày phiên. So sánh **bằng** với cột `session_date` (kiểu `DATE`, không giờ, không timezone) |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể daily, giống /daily/latest
~~~

~~~json
{
  "id": "vnindex-2026-08-14",
  "session_date": "2026-08-14",
  "session_type": "low_volatility",
  "session_type_display": "Đi ngang",
  "generated_at": "2026-08-14T09:32:41.880912+00:00",
  "headline": "VN-Index đi ngang, thanh khoản còn 61% MA20",
  "tagline": { "direction": "flat", "marker": "▬", "text": "ĐI NGANG · Thanh khoản cạn · Chờ dòng tiền" },
  "paragraphs": {
    "structure": "VN-Index đóng cửa <span class=\"num\">1,827.26</span> (<span class=\"down-text\">−0.11%</span>), biên độ chỉ 0.48%.",
    "smart_money": "Khối ngoại bán ròng <span class=\"num\">238.9</span> tỷ, phiên thứ 3 liên tiếp.",
    "market_health": "Tỷ lệ mã trên MA20 giảm còn 44.1%; thanh khoản 11,530 tỷ, bằng 61% MA20. VN-Index bám sát MA20 tại 1,829, dưới MA50. Nhóm bất động sản dẫn dắt phiên thứ 2; dòng tiền thu hẹp về nhóm vốn hóa lớn. Sức khỏe thị trường đang suy yếu rõ.",
    "historical_pattern": null
  },
  "scenarios": [
    { "direction": "up", "condition_html": "Nếu VN-Index vượt <strong>1,835</strong> với thanh khoản trên <strong>15,000</strong> tỷ", "outcome_html": "chỉ số có thể hướng lên <strong>1,845</strong>." },
    { "direction": "down", "condition_html": "Nếu mất <strong>1,820</strong>", "outcome_html": "vùng hỗ trợ tiếp theo là <strong>1,806</strong>." }
  ],
  "watchlist": [
    { "ticker": "HPG", "alert": false, "reason_html": "— Kéo giảm 1.8 điểm, chiếm 22% tổng phía giảm." }
  ],
  "unexplained": null,
  "meta": { "model_used": "deepseek-v4-pro", "data_completeness": 1.0, "memory_loaded": true, "session_type_display": "Đi ngang", "charts": {}, "pulse": null },
  "charts": {},
  "pulse": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row daily published cho ngày đó | `Không tìm thấy Không có bài nhận định cho ngày 2026-08-16` |
| 422 | — | `session_date` không phải date hợp lệ (`2026-13-40`, `hom-nay`) | `[{"loc":["path","session_date"],"msg":"Input should be a valid date, month value is outside expected range of 1-12","type":"date_from_datetime_parsing"}]` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — **Không phải phiên giao dịch** (thứ Bảy, Chủ nhật, ngày lễ) hay
ngày tương lai đều **không được xử lý đặc biệt**: không có row ⇒ **404**, không phải
`200` với `null`, không phải "lùi về phiên gần nhất". Endpoint không tự suy ra phiên liền
trước. Nếu client cần "phiên gần nhất trước ngày X" thì phải gọi `GET /daily?limit=…` rồi lọc.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/daily/2026-08-14' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 8b3c4d5e-6f70-4b9c-8d12-3e4f5a6b7c82'
~~~

**Ghi chú khi viết lại** — Query dùng `scalar_one_or_none()` chứ **không** `.limit(1)`; nhờ
`UNIQUE(session_date, report_type)` nên tối đa 1 row. Nếu bản TS bỏ unique constraint thì phải
thêm `LIMIT 1` để không ném lỗi "multiple rows". Không cache — bài của ngày quá khứ là bất
biến, có thể thêm `Cache-Control` nếu muốn, nhưng **API hiện tại không set header cache nào**.
Thông điệp 404 nhúng ngày ở dạng ISO (`session_date.isoformat()`), luôn có tiền tố
`"Không tìm thấy "` do lỗi truyền tham số nêu trên.

---

### POST /api/v1/market-analysis/daily/run

> **Sinh bài cuối ngày thủ công** — admin kích hoạt lại toàn bộ pipeline EOD ngay lập tức, chạy đồng bộ trong request.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | Tính toán — payload từ Vietcap (nhiều endpoint) + `analysis_history` (memory) + LLM qua AI proxy |
| **Side-effect** | UPSERT `analysis_history` (`report_type='daily'`); DELETE + INSERT `analysis_claims`; UPDATE `analysis_claims` (status/verified_at/verification_note của claim phiên trước); INSERT `admin_audit_logs` với `action='market_analysis.run'` |

**Path params** — —

**Query params** — **KHÔNG CÓ.** Không có `force`, không có `session_date`, không có
`dry_run`. Ngày phiên luôn suy từ bar chỉ số cuối cùng trong payload.

**Request body** — Không nhận body (gửi body cũng bị bỏ qua).

**Response 200**

~~~ts
type Response = GenerateResult;
~~~

~~~json
{
  "session_date": "2026-08-17",
  "session_type": "narrow_rally",
  "valid": true,
  "persisted": true,
  "memory_loaded": true,
  "attempts": 2,
  "errors": [],
  "model": "deepseek-v4-pro",
  "generation_time_ms": 131510
}
~~~

Ví dụ chạy thất bại nhưng **vẫn trả 200**:

~~~json
{
  "session_date": "2026-08-17",
  "session_type": "narrow_rally",
  "valid": false,
  "persisted": false,
  "memory_loaded": true,
  "attempts": 4,
  "errors": [
    "Anh hóa: 'momentum'",
    "market_health thiếu 'thanh khoản'",
    "BUG18: market_health chỉ 3/6 chỉ báo (cần ≥4)"
  ],
  "model": "deepseek-v4-pro",
  "generation_time_ms": 402877
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / hết hạn access token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Token hợp lệ nhưng `role != 'admin'` | `Yêu cầu quyền quản trị viên` |
| 500 | — | AI proxy không cấu hình (`ValueError`), timeout, connect error, HTTP lỗi, response sai format (`AIProxyError`) — các lỗi này **không** được retry và **không** biến thành `errors[]` | Body do handler 500 mặc định sinh |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Từng nguồn dữ liệu Vietcap được bọc `_safe()`: fetch lỗi → block đó
`None`/`{"_missing": true}`, tên block vào `meta.missing_fields`, `meta.data_completeness`
giảm, và prompt yêu cầu LLM **viết quanh chỗ thiếu, không bịa**. Memory lỗi → tiếp tục với
`memory_loaded=false`. Validator còn lỗi cứng sau 4 lần → **không ghi DB**, trả 200 với
`persisted=false`. Lỗi khi persist → rollback, `persisted=false`, vẫn 200. Endpoint **không**
kiểm tra hôm nay có phải phiên giao dịch — bấm ngày Chủ nhật vẫn chạy và ghi row cho
`session_date` của phiên gần nhất (đọc từ bar cuối), tức **ghi đè** bài phiên đó.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/market-analysis/daily/run' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 9c4d5e6f-7081-4cad-9e23-4f5a6b7c8d93' \
  --max-time 600
~~~

**Ghi chú khi viết lại** —
1. **Đồng bộ và rất dài.** Sample thật: `generation_time_ms = 131510` (2 phút 11 giây); 4 lần
   retry có thể lên ~7 phút. Timeout của reverse proxy/gateway phải nới, hoặc client dùng
   `--max-time` lớn. Nếu chuyển sang chạy nền thì **response shape đổi** — phải nêu rõ trong
   changelog vì frontend admin đang đọc `valid`/`persisted`.
2. **Generator mở session DB riêng** (`get_session_factory()`), **không** dùng session của
   request, vì bên trong nó `commit()` nhiều lần (memory + persist). Nếu dùng chung session sẽ
   commit dở dang transaction của request. Trong TS: dùng một connection/transaction riêng,
   không phải `EntityManager` của request.
3. Audit log được ghi bằng session **của request** sau khi generator xong: `record(ctx,
   action='market_analysis.run', target_entity='market_analysis', target_id=str(result.session_date),
   after=result, note='Manual market-analysis generation')`. `record()` chỉ `flush()`; commit
   xảy ra ở cuối request. `AuditContext` gồm `admin_id`, `ip` (`request.client.host`),
   `user_agent`, `request_id` (ưu tiên `request.state.request_id`, rồi header `X-Request-ID`,
   cuối cùng UUID mới).
4. **Không có chống chạy trùng.** Muốn thêm thì dùng đúng advisory-lock key của job
   (`826101730`) để manual và cron không đạp nhau — nhưng đó là **thay đổi hành vi**, phải
   ghi rõ.
5. `GenerateResult` được build bằng `GenerateResult(**result)` — dict trả về từ
   `run_daily_analysis` có **đúng 9 khóa**, không thừa không thiếu. Nếu bản TS trả thêm field
   thì OpenAPI lệch.

---

## Nhóm Giữa phiên — mid-day (`report_type = "midday"`)

### GET /api/v1/market-analysis/midday/latest

> **Bài nhận định giữa phiên mới nhất** — trả bản "Cập nhật phiên sáng" có `session_date` lớn nhất đã publish.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` (`report_type='midday'`) |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể midday: MiddayTagline / MiddayParagraphs / MiddayScenario[] / MiddayWatchItem[] + pulse != null
~~~

~~~json
{
  "id": "midday-2026-08-17",
  "session_date": "2026-08-17",
  "session_type": "hidden_distribution",
  "session_type_display": "Rút tiền ngầm",
  "generated_at": "2026-08-17T04:32:07.115204+00:00",
  "headline": "Phiên sáng tăng nhẹ +0.31% — KLGD chỉ 41% MA20, chiều cần dòng tiền thật",
  "tagline": { "text": "Đi ngang · KLGD thấp · Chờ chiều", "color": "neutral" },
  "paragraphs": {
    "session_structure": {
      "status": "published",
      "content": "VN-Index kết thúc phiên sáng tại <span class='num'>1,832.10</span> (<span class='up-text'>+0.31%</span>), tăng <span class='num'>5.68</span> điểm. Độ rộng cân bằng: 172 mã tăng / 168 mã giảm. VCB góp <span class='num'>+1.9</span> điểm, chiếm <span class='num'>34%</span> tổng phía tăng."
    },
    "money_flow": {
      "status": "published",
      "content": "Khối ngoại bán ròng <span class='num'>96.4</span> tỷ phiên sáng, tập trung ở FPT (<span class='down-text'>−41.2</span> tỷ) và HPG (<span class='down-text'>−22.8</span> tỷ). Tự doanh mua ròng <span class='num'>18.3</span> tỷ. KLGD phiên sáng <span class='num'>6,940</span> tỷ, bằng <span class='num'>41%</span> MA20 toàn ngày."
    },
    "market_health": {
      "status": "pending",
      "pending_message": "Chờ EOD để đánh giá đầy đủ sức khỏe thị trường.",
      "pending_until": "2026-08-17T16:30:00+07:00"
    }
  },
  "scenarios": [
    { "type": "up", "scope": "afternoon_session", "condition": "Nếu KLGD phiên chiều bù thêm trên <strong>10,000</strong> tỷ và VN-Index giữ trên <strong>1,830</strong>", "outcome": "Index có thể test <strong>1,842</strong> trước ATC." },
    { "type": "down", "scope": "afternoon_session", "condition": "Nếu VN-Index mất <strong>1,826</strong> với KLGD chiều dưới <strong>7,000</strong> tỷ", "outcome": "Áp lực bán chiều đẩy về vùng <strong>1,815</strong>–<strong>1,820</strong>." },
    { "type": "down", "scope": "afternoon_session", "condition": "Nếu KLGD tổng ngày dưới <strong>60%</strong> MA20 dù phiên sáng tăng — dấu hiệu tăng giả", "outcome": "ATC có thể đảo về <strong>1,824</strong> hoặc thấp hơn." }
  ],
  "watchlist": [
    { "key": "VCB", "alert_level": "normal", "reason": "Đóng góp +1.9 điểm phiên sáng; xem chiều có giữ được lực đỡ." },
    { "key": "Giao dịch chiều", "alert_level": "alert", "reason": "KLGD phiên sáng chỉ 41% MA20; theo dõi từ 13:00 để xác nhận dòng tiền thực hay phiên tăng giả." },
    { "key": "FPT", "alert_level": "normal", "reason": "Khối ngoại bán ròng 41.2 tỷ sáng nay dù giá tăng 0.6%." },
    { "key": "HPG", "alert_level": "normal", "reason": "Nhóm thép chưa hồi, đóng góp âm nhẹ phiên sáng." },
    { "key": "VNM", "alert_level": "normal", "reason": "Tăng 1.1% không có tin riêng; cần xem chiều giữ giá." }
  ],
  "unexplained": "{\"title\": \"Điểm cần xác nhận trong phiên chiều\", \"content\": \"KLGD phiên sáng chỉ 41% MA20 — cần theo dõi dòng tiền chiều từ 13:00.\"}",
  "meta": {
    "model_used": "deepseek-v4-pro",
    "memory_loaded": false,
    "session_type_display": "Rút tiền ngầm",
    "charts": { "breadth": { "up": 172, "down": 168, "flat": 74, "ceiling": 2, "floor": 1, "ratio_up_down": "1.0 : 1", "classification": "Cân bằng", "pct_above_ma20": null, "data_state": "am_session" }, "market_health_detail": { "pct_above_ma20": 44.1, "data_state": "eod_previous" } },
    "pulse": { "vn_index": { "value": 1832.1, "change": 5.68, "change_pct": 0.31, "sparkline": [1826.4, 1828.9, 1831.2, 1832.1] }, "breadth": { "up": 172, "down": 168 }, "foreign_net_billion": -96.4, "liquidity": { "am_value_billion": 6940, "ma20_billion": 16930, "vs_ma20_pct": 41.0 } }
  },
  "charts": { "breadth": { "up": 172, "down": 168, "flat": 74, "ceiling": 2, "floor": 1, "ratio_up_down": "1.0 : 1", "classification": "Cân bằng", "pct_above_ma20": null, "data_state": "am_session" }, "market_health_detail": { "pct_above_ma20": 44.1, "data_state": "eod_previous" } },
  "pulse": { "vn_index": { "value": 1832.1, "change": 5.68, "change_pct": 0.31, "sparkline": [1826.4, 1828.9, 1831.2, 1832.1] }, "breadth": { "up": 172, "down": 168 }, "foreign_net_billion": -96.4, "liquidity": { "am_value_billion": 6940, "ma20_billion": 16930, "vs_ma20_pct": 41.0 } }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row `report_type='midday'` published (kể cả khi đã có row `daily` cùng ngày) | `Không tìm thấy Chưa có bài nhận định giữa phiên nào` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Chỉ đọc DB. **Ngoài giờ**: sau 15:00 hay ban đêm, endpoint vẫn trả
bài giữa phiên của phiên gần nhất (nội dung nói về "phiên chiều" đã qua). Cuối tuần / lễ:
trả bài của thứ Sáu. Client phải so `session_date` với hôm nay (ICT) rồi tự quyết định ẩn/gắn
nhãn "cũ". `paragraphs.market_health.status` **luôn** là `'pending'` — đây là thiết kế, không
phải lỗi dữ liệu; UI phải render placeholder chứ đừng coi là thiếu.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/midday/latest' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: a1b2c3d4-e5f6-4a7b-8c90-1d2e3f4a5b60'
~~~

**Ghi chú khi viết lại** — (1) `unexplained` là **string chứa JSON** (LLM trả dict, cột là
`Text`, `persist_analysis` `json.dumps(..., ensure_ascii=False)`) — client phải `JSON.parse`
sau khi kiểm tra chuỗi bắt đầu bằng `{`. Đừng "sửa" thành object. (2) `pulse` là **dữ liệu tất
định từ payload**, không do LLM sinh — luôn tin được. (3) `charts.*.data_state` phân biệt ba
tầng: `am_session` (số liệu phiên sáng thật), `eod_previous` (đóng băng từ bài EOD hôm trước —
áp cho `market_health_detail` và `sector_rotation`), `unavailable` (không lấy được, key **vẫn
được emit** với chỉ mình `data_state`). (4) `charts.breadth.pct_above_ma20` **luôn `null`** ở
midday (không có dữ liệu intraday). (5) `session_type`/`session_type_display` của midday
không đáng tin — xem §7 Nghiệp vụ nền.

---

### GET /api/v1/market-analysis/midday/{session_date}

> **Bài nhận định giữa phiên theo ngày** — trả bản cập nhật phiên sáng của đúng một ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` (`report_type='midday'`) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `session_date` | `string` (format `date`) | `YYYY-MM-DD` | Ngày phiên, so sánh bằng với cột `DATE` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể midday, giống /midday/latest
~~~

~~~json
{
  "id": "midday-2026-08-14",
  "session_date": "2026-08-14",
  "session_type": "low_volatility",
  "session_type_display": "Đi ngang",
  "generated_at": "2026-08-14T04:31:52.660118+00:00",
  "headline": "Phiên sáng giảm nhẹ −0.18% — KLGD 36% MA20, dòng tiền chưa trở lại",
  "tagline": { "text": "Giảm nhẹ · Thanh khoản cạn · Chờ chiều", "color": "neutral" },
  "paragraphs": {
    "session_structure": { "status": "published", "content": "VN-Index phiên sáng tại <span class='num'>1,824.02</span> (<span class='down-text'>−0.18%</span>)." },
    "money_flow": { "status": "published", "content": "Khối ngoại bán ròng <span class='num'>74.1</span> tỷ; KLGD phiên sáng <span class='num'>6,090</span> tỷ, bằng <span class='num'>36%</span> MA20." },
    "market_health": { "status": "pending", "pending_message": "Chờ EOD để đánh giá đầy đủ sức khỏe thị trường.", "pending_until": "2026-08-14T16:30:00+07:00" }
  },
  "scenarios": [
    { "type": "up", "scope": "afternoon_session", "condition": "Nếu VN-Index lấy lại <strong>1,828</strong>", "outcome": "có thể test <strong>1,836</strong>." },
    { "type": "down", "scope": "afternoon_session", "condition": "Nếu mất <strong>1,818</strong>", "outcome": "về vùng <strong>1,808</strong>." },
    { "type": "down", "scope": "afternoon_session", "condition": "Nếu KLGD tổng ngày dưới <strong>60%</strong> MA20", "outcome": "ATC có thể đảo chiều bất ngờ." }
  ],
  "watchlist": [
    { "key": "VNM", "alert_level": "normal", "reason": "Giữ giá tốt nhất nhóm tiêu dùng phiên sáng." },
    { "key": "Giao dịch chiều", "alert_level": "alert", "reason": "KLGD phiên sáng 36% MA20 — theo dõi từ 13:00." },
    { "key": "VCB", "alert_level": "normal", "reason": "Kéo giảm 0.9 điểm phiên sáng." },
    { "key": "FPT", "alert_level": "normal", "reason": "Khối ngoại bán ròng 30.5 tỷ." },
    { "key": "HPG", "alert_level": "normal", "reason": "Nhóm thép giảm phiên thứ 3." }
  ],
  "unexplained": null,
  "meta": { "model_used": "deepseek-v4-pro", "memory_loaded": false, "session_type_display": "Đi ngang", "charts": { "contribution": { "data_state": "unavailable" } }, "pulse": { "vn_index": { "value": 1824.02, "change": -3.24, "change_pct": -0.18, "sparkline": [] }, "breadth": { "up": 141, "down": 189 }, "foreign_net_billion": -74.1, "liquidity": { "am_value_billion": 6090, "ma20_billion": 16930, "vs_ma20_pct": 36.0 } } },
  "charts": { "contribution": { "data_state": "unavailable" } },
  "pulse": { "vn_index": { "value": 1824.02, "change": -3.24, "change_pct": -0.18, "sparkline": [] }, "breadth": { "up": 141, "down": 189 }, "foreign_net_billion": -74.1, "liquidity": { "am_value_billion": 6090, "ma20_billion": 16930, "vs_ma20_pct": 36.0 } }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row midday published cho ngày đó (row `daily` cùng ngày **không** được dùng thay) | `Không tìm thấy Không có bài nhận định giữa phiên cho ngày 2026-08-16` |
| 422 | — | `session_date` không phải date hợp lệ | `[{"loc":["path","session_date"],"msg":"Input should be a valid date, ...","type":"date_parsing"}]` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Ngày nghỉ / ngày chưa tới ⇒ **404**, không trả `200 null`, không
lùi phiên. Trước 11:30 ICT của chính hôm nay cũng 404 (job chưa chạy). Client nên hỏi
`latest` rồi so `session_date`, thay vì gọi `{session_date}` với ngày hôm nay và nhận 404.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/midday/2026-08-14' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: b2c3d4e5-f607-4b8c-9d01-2e3f4a5b6c71'
~~~

**Ghi chú khi viết lại** — Dùng đúng helper `_get_by_date(db, session_date, 'midday')`; điều
kiện là `session_date = :d AND is_published = true AND report_type = 'midday'`. Có test chặn
việc row `daily` cùng ngày lọt sang (`test_midday_by_date_ignores_daily_rows`). Thông điệp
404 khác chuỗi của `daily` và `premarket` — copy nguyên văn từng chuỗi, đừng dùng một template chung.

---

### POST /api/v1/market-analysis/midday/run

> **Sinh bài giữa phiên thủ công** — admin kích hoạt pipeline "Cập nhật phiên sáng" ngay lập tức, chạy đồng bộ.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | Tính toán — snapshot + liquidity ONE_MINUTE + impact + foreign + prop từ Vietcap, `analysis_history` (bài EOD gần nhất), LLM qua AI proxy |
| **Side-effect** | UPSERT `analysis_history` (`report_type='midday'`); INSERT `admin_audit_logs` với `action='market_analysis.midday.run'`. **KHÔNG** ghi/sửa `analysis_claims` (`persist_claims=false`) |

**Path params** — —

**Query params** — **KHÔNG CÓ** (không `force`, không `session_date`).

**Request body** — Không nhận body.

**Response 200**

~~~ts
type Response = GenerateResult;   // memory_loaded LUÔN false (use_memory=false)
~~~

~~~json
{
  "session_date": "2026-08-17",
  "session_type": "hidden_distribution",
  "valid": true,
  "persisted": true,
  "memory_loaded": false,
  "attempts": 1,
  "errors": [],
  "model": "deepseek-v4-pro",
  "generation_time_ms": 68420
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / hết hạn token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | `role != 'admin'` | `Yêu cầu quyền quản trị viên` |
| 500 | — | `AIProxyError` / `ValueError` từ proxy client (không retry) | Body handler 500 mặc định |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Mỗi nguồn AM bọc `_safe()`; block nào lỗi thì `null`, tên vào
`meta.missing_fields` (`breadth`, `contribution`, `foreign_detail`, `prop_detail`,
`am_liquidity`, `am_ma20_partial`) và `charts.<block>.data_state = 'unavailable'`.
Chưa có bài EOD nào ⇒ `previous_eod = null`, prompt chèn *"CHƯA CÓ EOD hôm qua (lần đầu chạy
hoặc chưa có bài daily). Bỏ qua phần tham chiếu EOD."*, và hai khối đóng băng
(`market_health_detail`, `sector_rotation`) trả `{data_state: 'unavailable'}`.
MA20 thanh khoản tính trên số ngày tìm được — dưới 20 ngày thì thêm `am_ma20_partial` vào
`missing_fields` nhưng **vẫn dùng** giá trị đó. Chạy **ngoài giờ giao dịch** vẫn cho phép:
cửa sổ AM là 09:00→hiện tại (ICT), nên gọi lúc 22:00 sẽ gom cả ngày và bài sẽ nói sai về
"phiên sáng" — không có guard nào chặn.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/market-analysis/midday/run' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: c3d4e5f6-0718-4c9d-8e12-3f4a5b6c7d82' \
  --max-time 600
~~~

**Ghi chú khi viết lại** —
1. Payload builder **cần `db`** nên `run_midday_analysis` tự build payload rồi truyền vào
   pipeline qua tham số `payload=`. `MIDDAY_CONFIG.payload_builder` là **stub ném
   RuntimeError** — bản TS nên để `payloadBuilder: null` và assert khi thiếu payload, đừng
   viết builder giả trả rỗng.
2. Hai truy vấn DB (`_load_previous_eod`) và các fetch HTTP: fetch HTTP gom `Promise.all`,
   nhưng **truy vấn DB phải tuần tự** — SQLAlchemy cấm dùng đồng thời một session; đây là
   bug đã sửa ở phía premarket (xem endpoint dưới). Trong TS cũng đừng chạy song song hai
   query trên cùng transaction.
3. `date.today()` (giờ **local của server**) được dùng cho `meta.generated_for_date`, nhưng
   cửa sổ AM lại dùng ICT rõ ràng. Container prod chạy UTC ⇒ 11:30 ICT = 04:30 UTC cùng ngày
   nên hiện tại trùng khớp; bản TS nên dùng ICT ở **cả hai** chỗ để không lệch khi đổi giờ chạy.
4. Audit action là `market_analysis.midday.run` (khác `daily`). `target_entity` vẫn là
   `'market_analysis'`.
5. Import trong handler là `from app.services.ai.market_analysis.generator import
   run_midday_analysis` (module `generator`, **không** phải package `__init__`) — test patch
   đúng path đó.

---

## Nhóm Trước phiên — pre-market (`report_type = "premarket"`)

### GET /api/v1/market-analysis/premarket/latest

> **Bản tin trước phiên mới nhất** — trả brief "Sáng nay cần lưu ý" có `session_date` lớn nhất đã publish.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` (`report_type='premarket'`) |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể premarket: tagline={text}, paragraphs={world_paragraph},
                               // scenarios=[], watchlist=PremarketWatchItem[], charts=null, pulse=null,
                               // nội dung chính nằm trong meta.hot_news / meta.events_filtered / meta.world_overview
~~~

~~~json
{
  "id": "premarket-2026-08-17",
  "session_date": "2026-08-17",
  "session_type": "low_volatility",
  "session_type_display": "Đi ngang",
  "generated_at": "2026-08-17T00:16:44.930251+00:00",
  "headline": "Phố Wall tăng nhẹ, Nikkei bật 0.62% — tâm lý mở cửa thận trọng",
  "tagline": { "text": "THẬN TRỌNG · 3 tin tích cực · 2 sự kiện cao · Theo dõi thanh khoản mở cửa" },
  "paragraphs": {
    "world_paragraph": "S&P 500 đóng cửa tại <span class='num'>5,612</span> (<span class='up-text num'>+0.28%</span>); NASDAQ tăng <span class='up-text num'>+0.41%</span>. Nikkei 225 tại <span class='num'>39,180</span> (<span class='up-text num'>+0.62%</span>). Dầu Brent <span class='num'>82.4</span> USD/thùng, giảm <span class='down-text num'>−0.5%</span>. Vàng <span class='num'>2,412</span> USD/oz gần đỉnh ngắn hạn. USD/VND theo dữ liệu VCB ở mức trung tính, không tạo áp lực đặc biệt lên khối ngoại. Tổng thể không có cú sốc qua đêm, nền tâm lý thuận nhẹ cho phiên khai mạc nhưng thanh khoản vẫn là biến số quyết định."
  },
  "scenarios": [],
  "watchlist": [
    { "level": "normal", "content": "VN-Index: vùng hỗ trợ <span class='num'>1,825</span>–<span class='num'>1,830</span> là mốc giữ chính phiên sáng; nếu mở cửa trên <span class='num'>1,838</span> và giữ được, tâm lý cải thiện rõ." },
    { "level": "alert", "content": "<span class='tkr'>VCB</span>: ngày giao dịch không hưởng quyền cổ tức — giá tham chiếu giảm kỹ thuật, không phải áp lực bán thực." },
    { "level": "normal", "content": "<span class='tkr'>HPG</span>: nhóm thép theo dõi giá quặng và dầu qua đêm; HPG chiếm trọng số lớn trong nhóm công nghiệp cơ bản." },
    { "level": "warn", "content": "<span class='tkr'>VIC</span>: nhạy cảm với thông tin lãi suất; nếu nhóm bất động sản mở cửa giảm trên <span class='num'>1%</span> có thể kéo độ rộng toàn sàn." },
    { "level": "normal", "content": "<span class='tkr'>FPT</span>: nhóm công nghệ hưởng lợi từ tâm lý Phố Wall; theo dõi thanh khoản có xác nhận dòng tiền thực hay không." }
  ],
  "unexplained": null,
  "meta": {
    "model_used": "deepseek-v4-pro",
    "memory_loaded": false,
    "session_type_display": "Đi ngang",
    "charts": null,
    "pulse": null,
    "hot_news": [
      {
        "id": "news-84213",
        "title": "FPT ký hợp đồng chuyển đổi số 120 triệu USD tại Nhật Bản",
        "summary": "Hợp đồng có thời hạn 3 năm, ghi nhận doanh thu từ quý IV.",
        "source": "CafeF",
        "published_at": "2026-08-16T19:42:00",
        "tickers": ["FPT"],
        "sectors": ["Công nghệ thông tin"],
        "sentiment": "Positive",
        "url": "https://cafef.vn/fpt-ky-hop-dong-120-trieu-usd.chn",
        "insight": "<strong>Tác động phiên sáng nay:</strong> Hợp đồng quy mô lớn có thể tạo lực mua chủ động nhóm công nghệ ngay phiên sáng, đặc biệt nếu thanh khoản FPT trong 15 phút đầu vượt 200 tỷ; tác động lên điểm số toàn thị trường ở mức trung bình do trọng số vốn hóa.",
        "rank_order": 1
      }
    ],
    "events_filtered": [
      {
        "id": "1284471",
        "type": "ex_dividend",
        "time": null,
        "time_label": "17/08/2026",
        "title": "Ngày giao dịch không hưởng quyền nhận cổ tức tiền mặt 800 đồng/cp",
        "tickers": ["VCB"],
        "note": "Giá tham chiếu giảm kỹ thuật, không phải bán thực",
        "impact": "high"
      },
      {
        "id": "1284509",
        "type": "agm",
        "time": "09:00",
        "time_label": "09:00 17/08/2026",
        "title": "Đại hội đồng cổ đông thường niên 2026",
        "tickers": ["VNM"],
        "note": "Quyết định kế hoạch lợi nhuận và cổ tức năm nay",
        "impact": "medium"
      }
    ],
    "world_overview": {
      "cells": [
        { "id": "^GSPC", "label": "S&P 500", "value": 5612.4, "change_pct": 0.28, "sentiment": "up", "stale": false },
        { "id": "^IXIC", "label": "NASDAQ", "value": 18342.1, "change_pct": 0.41, "sentiment": "up", "stale": false },
        { "id": "^N225", "label": "NIKKEI 225", "value": 39180.0, "change_pct": 0.62, "sentiment": "up", "stale": false },
        { "id": "BZ=F", "label": "Dầu Brent", "value": 82.4, "change_pct": -0.5, "sentiment": "down", "stale": false },
        { "id": "GC=F", "label": "Vàng", "value": 2412.3, "change_pct": 0.12, "sentiment": "up", "stale": false },
        { "id": "VND=X", "label": "USD/VND", "value": 26480.0, "change_pct": null, "sentiment": "flat", "stale": false, "source": "vcb" }
      ],
      "context": {
        "^VIX": { "value": 14.8, "change_pct": -2.1, "stale": false },
        "DX-Y.NYB": { "value": 103.4, "change_pct": 0.08, "stale": false }
      }
    }
  },
  "charts": null,
  "pulse": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row `report_type='premarket'` published | `Không tìm thấy Chưa có bài nhận định trước phiên nào` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Chỉ đọc DB. Sau 09:00 ICT bài "trước phiên" đã hết thời sự nhưng
endpoint **vẫn trả** nó cho tới khi có bài của phiên sau; client so `session_date` (và có thể
so giờ hiện tại với 09:00 ICT) để quyết định. Cuối tuần / lễ trả bài của phiên giao dịch gần
nhất. `charts` và `pulse` **luôn `null`** với premarket — payload không có hai khối đó; UI
không được coi đây là lỗi.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/premarket/latest' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: d4e5f607-1829-4dae-9f23-4a5b6c7d8e93'
~~~

**Ghi chú khi viết lại** —
1. **Nội dung chính không nằm ở top level.** `hot_news`, `events_filtered`, `world_overview`
   chỉ có trong `meta` (do `_resolve_premarket_output` đặt vào `output.meta` rồi
   `persist_analysis` merge). Frontend đọc `response.meta.hot_news`, **không** phải
   `response.hot_news`. Nếu muốn nâng lên top level thì phải sửa cả `AnalysisOut` — đó là
   thay đổi contract.
2. `scenarios` **luôn `[]`** (contract premarket chỉ có 6 khóa, không có scenarios).
3. `tagline` là object `{text}` chứ không phải string, dù LLM trả string — postprocess chuẩn hóa.
4. `paragraphs` chỉ có `world_paragraph`; giá trị có thể `null` nếu LLM bỏ khóa đó (đã qua
   validator nên thực tế luôn có).
5. `watchlist` chính là `watch_today` được đổi tên trong postprocess.

---

### GET /api/v1/market-analysis/premarket/{session_date}

> **Bản tin trước phiên theo ngày** — trả brief trước phiên của đúng một ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `analysis_history` (`report_type='premarket'`) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `session_date` | `string` (format `date`) | `YYYY-MM-DD` | Ngày phiên, so sánh bằng với cột `DATE` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = AnalysisOut;   // biến thể premarket, giống /premarket/latest
~~~

~~~json
{
  "id": "premarket-2026-08-14",
  "session_date": "2026-08-14",
  "session_type": "low_volatility",
  "session_type_display": "Đi ngang",
  "generated_at": "2026-08-14T00:16:12.402881+00:00",
  "headline": "Phố Wall lùi nhẹ, dầu Brent giảm 1.2% — mở cửa nghiêng phòng thủ",
  "tagline": { "text": "PHÒNG THỦ · 1 tin tích cực · 1 sự kiện cao · Chú ý nhóm dầu khí" },
  "paragraphs": {
    "world_paragraph": "S&P 500 giảm <span class='down-text num'>−0.34%</span> về <span class='num'>5,596</span>; NASDAQ mất <span class='down-text num'>−0.51%</span>. Nikkei 225 gần như đi ngang tại <span class='num'>38,940</span>. Dầu Brent lùi <span class='down-text num'>−1.2%</span> còn <span class='num'>81.0</span> USD/thùng sau báo cáo tồn kho. Vàng giữ <span class='num'>2,408</span> USD/oz. USD/VND ở mức trung tính theo dữ liệu VCB. Bức tranh qua đêm nghiêng phòng thủ nhẹ, chưa xuất hiện cú sốc, nhưng nhóm dầu khí trong nước có thể chịu áp lực tham chiếu ngay đầu phiên."
  },
  "scenarios": [],
  "watchlist": [
    { "level": "normal", "content": "VN-Index: hỗ trợ <span class='num'>1,818</span>–<span class='num'>1,822</span>; mất mốc này độ rộng có thể xấu nhanh." },
    { "level": "warn", "content": "<span class='tkr'>PLX</span>: nhóm dầu khí chịu áp lực từ giá dầu qua đêm." },
    { "level": "normal", "content": "<span class='tkr'>VCB</span>: nhóm ngân hàng vẫn là trụ đỡ điểm số." },
    { "level": "normal", "content": "<span class='tkr'>HPG</span>: theo dõi thanh khoản mở cửa nhóm thép." },
    { "level": "normal", "content": "<span class='tkr'>VNM</span>: đại hội cổ đông trong ngày, chú ý thông tin cổ tức." }
  ],
  "unexplained": null,
  "meta": {
    "model_used": "deepseek-v4-pro",
    "memory_loaded": false,
    "session_type_display": "Đi ngang",
    "charts": null,
    "pulse": null,
    "hot_news": [],
    "events_filtered": [],
    "world_overview": { "cells": [ { "id": "^GSPC", "label": "S&P 500", "value": 5596.2, "change_pct": -0.34, "sentiment": "down", "stale": false } ], "context": {} }
  },
  "charts": null,
  "pulse": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có row premarket published cho ngày đó (row `daily`/`midday` cùng ngày **không** thay được) | `Không tìm thấy Không có bài nhận định trước phiên cho ngày 2026-08-16` |
| 422 | — | `session_date` không phải date hợp lệ | `[{"loc":["path","session_date"],"msg":"Input should be a valid date, ...","type":"date_parsing"}]` |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Ngày nghỉ / tương lai / trước 07:15 ICT hôm nay ⇒ **404**. Không
lùi phiên, không trả `200 null`. Nếu ngày đó `news_pool` rỗng thì `meta.hot_news` là `[]`
(validator cho phép vì `min(5, 0) = 0`); nếu `events_pool` rỗng thì `meta.events_filtered`
là `[]` (kiểm tra 2-10 bị **bỏ qua** khi cả pool và output đều rỗng).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-analysis/premarket/2026-08-14' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: e5f60718-2930-4ebf-8034-5b6c7d8e9fa4'
~~~

**Ghi chú khi viết lại** — Giống hai endpoint `{session_date}` kia: `scalar_one_or_none()`,
filter đủ ba điều kiện, chuỗi 404 riêng biệt. Có test chặn cross-contamination
(`test_premarket_by_date_ignores_daily_rows`). `meta.hot_news[].published_at` là chuỗi thô
từ nguồn tin (đã qua `normalize_news`), **không** đảm bảo có offset timezone — đừng parse
cứng thành UTC.

---

### POST /api/v1/market-analysis/premarket/run

> **Sinh bản tin trước phiên thủ công** — admin kích hoạt pipeline pre-market ngay lập tức, chạy đồng bộ.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute) |
| **Cache** | không |
| **Nguồn dữ liệu** | Tính toán — `market_data_snapshot` (chỉ số quốc tế), tin tức AI Vietcap (cửa sổ 17:00 phiên trước → 06:30 hôm nay ICT), lịch sự kiện VCI, tỷ giá VCB, `analysis_history` (bài EOD gần nhất), LLM qua AI proxy |
| **Side-effect** | UPSERT `analysis_history` (`report_type='premarket'`); INSERT `admin_audit_logs` với `action='market_analysis.premarket.run'`. **KHÔNG** chạm `analysis_claims` |

**Path params** — —

**Query params** — **KHÔNG CÓ** (không `force`, không `session_date`).

**Request body** — Không nhận body.

**Response 200**

~~~ts
type Response = GenerateResult;   // session_type gần như luôn 'low_volatility'; memory_loaded LUÔN false
~~~

~~~json
{
  "session_date": "2026-08-17",
  "session_type": "low_volatility",
  "valid": true,
  "persisted": true,
  "memory_loaded": false,
  "attempts": 1,
  "errors": [],
  "model": "deepseek-v4-pro",
  "generation_time_ms": 74905
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / hết hạn token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | `role != 'admin'` | `Yêu cầu quyền quản trị viên` |
| 500 | — | `AIProxyError` / `ValueError` từ proxy client (không retry) | Body handler 500 mặc định |
| 429 | — | Vượt 60 req/phút | Body do SlowAPI sinh |

**Fallback / suy giảm** — Nhiều tầng, phải giữ đủ:
- **Snapshot quốc tế thiếu symbol** ⇒ ô đó `{value: null, change_pct: null, sentiment:'flat',
  stale: true}` và `'global_markets'` được thêm vào `meta.missing_fields`. 6 ô **luôn được
  emit đủ, đúng thứ tự** `^GSPC, ^IXIC, ^N225, BZ=F, GC=F, VND=X`.
- **`VND=X` stale** ⇒ thử fallback tỷ giá bán USD của VCB (`source: 'vcb'`, `change_pct: null`,
  `sentiment: 'flat'`, `stale: false`); VCB cũng không có ⇒ giữ row stale (`stale: true`) vì
  "stale còn hơn không có".
- **Snapshot cũ hơn hôm nay (ICT)** ⇒ `_stale_out_outdated_snapshot` **ép mọi row thành stale**
  để không hiển thị biến động qua đêm giả.
- **Tin tức fetch lỗi** ⇒ `news_pool = []`, `missing_fields += ['news_pool']`, và validator
  chấp nhận `hot_news = []`.
- **Lịch sự kiện lỗi** ⇒ `events_pool = []`, `missing_fields += ['events_pool']`,
  `events_filtered = []` được miễn kiểm tra số lượng.
- **Chưa có bài EOD** ⇒ `eod_previous_summary = null`, prompt yêu cầu bỏ tham chiếu EOD và
  `watch_today[0]` vẫn phải nêu `'VN-Index'` dựa trên `global_markets`.
- **`sentiment` của USD/VND bị đảo dấu** (`invert=true`): USD giảm ⇒ `'up'` (tốt cho thị
  trường VN). Prompt nói rõ LLM **không được tự suy lại** từ tỷ giá.
- Không có guard giờ / ngày giao dịch — bấm ngày Chủ nhật vẫn tạo row cho `date.today()`.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/market-analysis/premarket/run' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: f6071829-3a41-4fc0-9145-6c7d8e9fa0b5' \
  --max-time 600
~~~

**Ghi chú khi viết lại** —
1. **Hai truy vấn DB phải tuần tự.** `load_latest_snapshot(db)` và `_load_previous_eod(db)`
   dùng chung một session; đưa cả hai vào `asyncio.gather` từng làm `_load_previous_eod`
   **crash mọi lần chạy và âm thầm null `eod_previous_summary`**. Chỉ gom song song các fetch
   HTTP (news, events, VCB fx). Comment cảnh báo này nằm trong `build_premarket_payload`.
2. **Postprocess `_resolve_premarket_output` chạy SAU validator, TRƯỚC persist.** Nó: đổi
   `hot_news[].id` → object đầy đủ từ `news_pool` merge `{insight, rank_order}`; đổi
   `events_filtered[].id` → object từ `events_pool` merge `{note, impact}`; chuẩn hóa
   `tagline` string → `{text}`; set `world_overview = payload.global_markets`;
   `paragraphs = {world_paragraph}`; `watchlist = watch_today`; nhồi
   `meta.hot_news / meta.events_filtered / meta.world_overview`. **Id lạ KHÔNG làm crash** —
   log warning rồi bỏ qua item (validator đã chặn trước, đây là guard phòng vệ).
3. `temperature = 0.5` cho premarket (daily/midday dùng 0.3). Đừng dùng một hằng số chung.
4. Cửa sổ tin: `17:00` ngày giao dịch **trước** (tính bằng `_prev_trading_day`) →
   `06:30` hôm nay, **ICT**, bao gồm hai đầu. Dedup tin gần trùng bằng
   `SequenceMatcher >= 0.8` trên **80 ký tự đầu** của tiêu đề (đã lowercase/normalize), giữ
   nguồn có rank thấp hơn (bloomberg=1 < vnexpress/tuổi trẻ=2 < cafef/ndh=3 <
   tinnhanhchungkhoan/đtck=4, không rõ nguồn = hạng thấp nhất). Cap **20 tin**.
5. `normalize_events` map `event_code` → `type`: `ISS|DIV → ex_dividend`;
   `EGME|AGME|AGMR → agm`; `DDIND|DDRP|DDINS → insider`; `NLIS|AIS → listing`; còn lại
   `other`. `id` = id nguồn, hoặc `"{event_code}-{date}-{ticker}"` khi nguồn không có id.
   VCI **không** trả field giờ riêng — giờ được suy từ `display_date1` khi phần giờ khác
   nửa đêm.
6. Audit action là `market_analysis.premarket.run`.

---

## Bảng so sánh 3 loại brief

| Tiêu chí | Trước phiên (`premarket`) | Giữa phiên (`midday`) | Cuối ngày (`daily`) |
|---|---|---|---|
| **Tên hiển thị** | "Sáng nay cần lưu ý" | "Cập nhật phiên sáng" | "Nhận định phiên" |
| **Giờ cron (ICT)** | 07:15, T2-T6 | 11:30, T2-T6 | 16:30 + vá 17:00, T2-T6 |
| **Cờ bật** | `PREMARKET_ANALYSIS_ENABLED` | `MIDDAY_ANALYSIS_ENABLED` | `MARKET_ANALYSIS_ENABLED` |
| **Advisory lock** | `826101734` | `826101731` | `826101730` (+ retry `826101732`) |
| **Dữ liệu đầu vào** | Snapshot chỉ số quốc tế (6 ô + context), tin 17:00→06:30, lịch sự kiện VCI, tỷ giá VCB, bài EOD gần nhất | Snapshot VN 09:00→now, liquidity ONE_MINUTE, impact, foreign, prop, `charts` đóng băng từ EOD trước | OHLCV 260 phiên, snapshot 4 chỉ số, breadth EMA20/EMA50, impact, foreign(+top), prop(+top), sectors, tin 24h, lịch hardcode |
| **`use_memory` / claims** | ❌ / ❌ | ❌ / ❌ | ✅ nạp memory / ✅ ghi + verify claims |
| **`temperature`** | 0.5 | 0.3 | 0.3 |
| **Prefix `public_id`** | `premarket-` | `midday-` | `vnindex-` |
| **Khóa LLM phải trả** | 6: headline, tagline, world_paragraph, hot_news, events_filtered, watch_today | id, session_date, report_type, headline, tagline, paragraphs, scenarios, watchlist, unexplained | id, session_date, session_type, session_type_display, headline, tagline, paragraphs, scenarios, watchlist, unexplained |
| **`paragraphs`** | `{world_paragraph}` (70-130 từ) | `{session_structure, money_flow}` published + `market_health` **pending** | `{structure, smart_money, market_health(+historical_pattern)}` — tất cả string |
| **`scenarios`** | **`[]`** (không có) | Đúng **3**, `scope='afternoon_session'`, [2] `type='down'` | 2-3, `{direction, condition_html, outcome_html}` |
| **`watchlist`** | `watch_today` 5-6 mục `{level, content}`, [0] chứa `'VN-Index'` | Đúng **5** mục `{key, alert_level, reason}`, [1].key = `'Giao dịch chiều'` | 0-4 mục `{ticker, alert, reason_html}` |
| **`unexplained`** | `null` | string chứa JSON của `{title, content}` | HTML string hoặc `null` |
| **`charts`** | `null` | Có, kèm `data_state` mỗi block | Có, không có `data_state` |
| **`pulse`** | `null` | **Có** | `null` |
| **Section riêng** | `meta.hot_news`, `meta.events_filtered`, `meta.world_overview` | `pulse`, `market_health` pending | `analysis_claims`, `memory_context`, `historical_pattern` |
| **Headline** | 60-90 ký tự, **bắt buộc em-dash `—`**, không kết bằng dấu chấm | 60-90 ký tự, bắt buộc có % VN-Index phiên sáng | **≤ 80 ký tự** |
| **`FORBIDDEN_INTL`** | Chỉ áp field nội địa; **miễn** `headline` + `world_paragraph` | Áp **toàn bộ** | Áp **toàn bộ** |
| **Endpoint list** | ❌ không có | ❌ không có | ✅ `GET /daily?limit=` |
| **`session_type` có nghĩa?** | ❌ luôn `low_volatility` (payload không có breadth/vnindex) | ⚠️ méo (khóa breadth khác tên) | ✅ đúng theo classifier |

---

## Ghi chú tổng hợp khi viết lại

1. **Thứ tự route.** `latest` phải khai trước `{session_date}` ở cả ba nhóm; `GET /daily`
   (list) là path riêng, không có dấu `/` cuối.

2. **Chuỗi 404 phải copy nguyên văn**, kể cả tiền tố `"Không tìm thấy "` bị ghép do truyền
   message vào tham số `resource` của `NotFoundError`. Sáu chuỗi:
   `Không tìm thấy Chưa có bài nhận định nào` /
   `Không tìm thấy Không có bài nhận định cho ngày <ISO>` /
   `Không tìm thấy Chưa có bài nhận định giữa phiên nào` /
   `Không tìm thấy Không có bài nhận định giữa phiên cho ngày <ISO>` /
   `Không tìm thấy Chưa có bài nhận định trước phiên nào` /
   `Không tìm thấy Không có bài nhận định trước phiên cho ngày <ISO>`.
   Body luôn `{"detail": "...", "code": "NOT_FOUND"}`.

3. **`AnalysisOut` là union ngụy trang.** Đừng khai `paragraphs: Record<string, string>` —
   midday có object lồng, premarket chỉ một khóa. Nên khai discriminated union theo
   `session_type`… **không được**, vì `session_type` không phân biệt loại brief. Phân biệt bằng
   **endpoint** (hoặc prefix của `id`), rồi cast. Cân nhắc thêm field `report_type` vào
   response ở phiên bản mới — hiện tại **không có** trong `AnalysisOut`, dù cột DB có.

4. **`is_published` chưa bao giờ được set `false`** bởi code hiện tại; cột chỉ tồn tại để
   admin tắt bài bằng SQL. Vẫn phải giữ điều kiện `is_published = true` trong mọi query đọc.

5. **UPSERT theo `(session_date, report_type)`, không theo `public_id`.** `public_id` là UNIQUE
   riêng nên nếu prefix bị đặt sai (ví dụ dùng `vnindex-` cho premarket) thì INSERT daily cùng
   ngày sẽ chết IntegrityError. Giữ nguyên logic prefix trong generator.

6. **Chạy trùng.** Cron có advisory lock, `run` **không có**. Rủi ro: cron 16:30 chưa xong,
   admin bấm `daily/run` → hai lần gọi LLM, hai lần UPSERT cùng khóa, `generated_at` bị ghi
   lại, claims bị DELETE + INSERT lại. Nếu bổ sung lock cho `run` thì phải trả 409 (hoặc 200
   với cờ mới) và ghi vào changelog.

7. **`run` đồng bộ, cực dài.** 60-200 giây là bình thường; tối đa 4 lần gọi LLM ⇒ có thể >7
   phút. Cấu hình timeout của gateway/Nest interceptor tương ứng; đừng để framework tự cắt ở 30s.

8. **Sinh bài dùng session DB riêng, audit dùng session của request.** Trộn hai cái sẽ làm
   commit dở transaction request. `AdminAuditService.record` chỉ `flush()`; commit ở cuối request.

9. **Múi giờ.** Job dùng `now(ICT).date()`. `build_analysis_payload` lấy `session_date` từ
   timestamp bar cuối, convert sang ICT. `build_midday_payload` và `build_premarket_payload`
   dùng `date.today()` (**giờ local của process**) cho `meta.generated_for_date` nhưng lại
   dùng ICT cho cửa sổ dữ liệu — bản TS nên **thống nhất ICT ở mọi chỗ**, giá trị hiện tại
   không đổi ở giờ cron hiện hành.

10. **Định dạng số trong nội dung là kiểu Anh-Mỹ.** Prompt yêu cầu hàng nghìn dùng dấu **phẩy**,
    thập phân dùng dấu **chấm** (`1,824.53`, `3.37%`, `−0.3%`, VN-Index viết `1,815 điểm`).
    Số âm dùng **U+2212 `−`**, không dùng hyphen ASCII — validator midday/premarket chặn cứng
    `-\d` trên text đã strip HTML. Frontend không được reformat lại theo `vi-VN`.

11. **HTML-inline trong nội dung là hợp đồng, không phải rác.** Class dùng: `num`, `up-text`,
    `down-text`, `tkr`, và thẻ `<strong>` cho mốc kỹ thuật. Render bằng `dangerouslySetInnerHTML`
    (hoặc tương đương) sau khi sanitize whitelist đúng các thẻ/class trên.

12. **`errors[]` là thông điệp tiếng Việt hướng dev, có thể lộ chi tiết prompt.** Endpoint `run`
    chỉ admin nên chấp nhận được; đừng forward `errors` ra API công khai.

13. **Không có cache Redis nào** cho toàn bộ nhóm này — 7 endpoint đọc query thẳng DB mỗi lần.
    Thêm cache thì phải invalidate sau mỗi `persist_analysis` (cả cron và `run`), và nhớ rằng
    `latest` đổi mỗi ngày làm việc.

14. **Sample JSON trong `docs/ai/market_analysis_output/nhan-dinh-2026-06-19.json` là bản CŨ
    (v1.x)** — nó còn `paragraphs.internal_heat` và `paragraphs.global_context`, hai khóa đã bị
    bỏ ở contract v1.4 hiện tại (`market_health` thay `internal_heat`; đoạn bối cảnh thế giới bị
    cấm hoàn toàn ở daily). **Không dùng file đó làm chuẩn hình dạng**; dùng
    `prompts.py` / `midday_prompts.py` / `premarket_prompts.py` + validator tương ứng.

15. **`prompt_loader.py` không liên quan** tới nhóm này. Prompt market-analysis là constant
    trong code. Chỉ `bctc`/`dashboard`/`industry`/`insight` đọc file từ `docs/ai/`.

16. **CHƯA XÁC ĐỊNH** — Không có endpoint nào cho phép `force` regenerate một `session_date`
    **quá khứ** cụ thể, cũng không có endpoint xóa/unpublish một bài. Nếu cần, đó là tính năng
    mới; xem `app/api/v1/endpoints/market_analysis.py` để xác nhận trước khi thiết kế.
