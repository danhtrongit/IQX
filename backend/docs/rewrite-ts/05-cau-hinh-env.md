# Cấu hình & biến môi trường

Chương này là tài liệu tra cứu đầy đủ về toàn bộ cấu hình runtime của backend IQX: 93 biến môi trường (đọc từ `app/core/config.py`), các property dẫn xuất, validator chặn secret placeholder ở production, và bảng feature flag quyết định module nào được bật. Mọi giá trị default, tên biến và hành vi trong chương này được đọc trực tiếp từ source Python — bản TypeScript/NestJS phải giữ **nguyên tên biến và nguyên default** để có thể dùng lại file `.env` production hiện có mà không phải sửa hạ tầng.

> Đường dẫn file trong chương này là đường dẫn tương đối tính từ repo root `/Users/danhtrongit/Projects/IQX/backend`.

---

## 1. Cơ chế nạp cấu hình

### 1.1 Nguồn và thứ tự ưu tiên

Cấu hình do class `Settings` (pydantic-settings `BaseSettings`) trong `app/core/config.py` quản lý, với `SettingsConfigDict`:

| Thuộc tính | Giá trị trong source | Ý nghĩa |
|---|---|---|
| `env_file` | `Path(__file__).resolve().parents[2] / ".env"` | File `.env` nằm **ở repo root `backend/.env`**. `__file__` là `app/core/config.py`; `parents[0]` = `app/core`, `parents[1]` = `app`, `parents[2]` = `backend/`. Đường dẫn là **tuyệt đối, tính từ vị trí file source** — không phụ thuộc CWD khi chạy process. |
| `env_file_encoding` | `"utf-8"` | Đọc `.env` bằng UTF-8. |
| `case_sensitive` | `False` | Tên biến env không phân biệt hoa/thường: `database_url` và `DATABASE_URL` đều map vào field `DATABASE_URL`. |
| `extra` | `"ignore"` | Biến env lạ (không có field tương ứng) bị **bỏ qua im lặng**, không lỗi. Hệ quả: gõ sai tên biến env → không có cảnh báo, setting im lặng dùng default. |

Thứ tự ưu tiên (mặc định của pydantic-settings, không bị override trong source): **biến môi trường thật của process > file `.env` > default khai báo trong class**. Không có secrets-dir, không có nhiều env_file, không có prefix.

### 1.2 Singleton + cache

```python
@lru_cache
def get_settings() -> Settings: ...
```

Hành vi cần mô phỏng lại ở TS:

- `get_settings()` trả về **một instance duy nhất** cho cả tiến trình; lần gọi đầu tiên mới thực sự đọc env + chạy validator.
- Đổi biến môi trường trong lúc process đang chạy **không có tác dụng** — phải restart process. Không có endpoint reload config.
- Test suite khai thác `get_settings.cache_clear()` để đổi env giữa các test (`tests/test_hardening.py`, `tests/conftest.py`). Bản TS nên có tương đương (ví dụ export hàm `resetConfigForTests()`), nếu không sẽ không viết được test cho nhánh production-validator.
- **Bẫy import-time**: một số module đọc settings ngay lúc import module, không phải lúc xử lý request:
  - `app/core/rate_limit.py` — `_settings = get_settings()` ở top-level.
  - `app/api/v1/endpoints/auth.py:36` — `_AUTH_LIMIT = get_settings().RATE_LIMIT_AUTH`.
  - `app/api/v1/endpoints/market_data.py:33` — `_MARKET_DATA_LIMIT = get_settings().RATE_LIMIT_MARKET_DATA`.
  Nghĩa là cấu hình rate-limit được "đóng băng" tại thời điểm import; ở TS nên đọc các giá trị này khi khởi tạo guard/interceptor (bootstrap), tương đương về hành vi.

### 1.3 Kiểu dữ liệu & parse

- `bool`: pydantic v2 chấp nhận (đã kiểm chứng bằng cách chạy thật với `TypeAdapter(bool)`): `"true"`, `"True"`, `"TRUE"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`, `"on"`, `"off"`, `"y"`, `"n"`, `"t"`, `"f"` (không phân biệt hoa/thường). **Chuỗi rỗng `""` gây lỗi validation.**
- Hệ quả đã kiểm chứng bằng cách chạy thật: đặt `ENABLE_API_DOCS=` (rỗng) trong `.env` làm **app crash lúc khởi động** với `ValidationError: ENABLE_API_DOCS Input should be a valid boolean ... input_value=''`. Với các field `str` thì chuỗi rỗng lại hợp lệ và có ý nghĩa (thường là "chưa cấu hình"). Bản TS cần giữ đúng sự khác biệt này: bool rỗng = lỗi, str rỗng = "tắt/chưa cấu hình".
- `int` / `float`: parse từ chuỗi; giá trị không parse được → `ValidationError` lúc khởi động.
- Không có field nào dùng list/JSON: `CORS_ORIGINS`, `CORS_METHODS`, `CORS_HEADERS` là **`str`**, được tách bằng property (xem §4). Đây là lựa chọn cố ý để tránh pydantic parse JSON cho list.

---

## 2. Bảng biến môi trường theo nhóm

Cột "Bắt buộc?" — `CÓ` nghĩa là field không có default, thiếu → app không khởi động được.
Cột "Ai đọc" — file thực sự đọc setting đó (kết quả grep toàn bộ `app/` + `alembic/`).

### 2.1 Application

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `APP_NAME` | `string` | `"IQX"` | Không | Tiêu đề OpenAPI (`f"{APP_NAME} API"`), log startup/shutdown, field `app_name` của `/health` | `app/main.py`, `app/api/v1/endpoints/health.py` |
| `APP_VERSION` | `string` | `"0.1.0"` | Không | Version OpenAPI, field `version` của `/health` và của `SystemStatus` (admin) | `app/main.py`, `app/api/v1/endpoints/health.py`, `app/api/v1/endpoints/admin_system.py` |
| `APP_ENV` | `string` | `"development"` | Không | Khoá điều khiển môi trường. `"production"` → bật validator JWT + tắt docs mặc định; `"testing"` hoặc `"test"` → tắt rate limiting. Cũng trả về trong `/health` (`environment`) và `SystemStatus` | `app/core/config.py` (validator + `is_production`), `app/core/rate_limit.py`, `app/main.py`, `app/api/v1/endpoints/health.py`, `app/api/v1/endpoints/admin_system.py` |
| `DEBUG` | `boolean` | `false` | Không | **Chỉ dùng một chỗ**: `echo=settings.DEBUG` cho SQLAlchemy engine (log toàn bộ SQL). Không ảnh hưởng log level, không ảnh hưởng docs | `app/core/database.py` |

Lưu ý: `APP_ENV` là **string tự do**, không phải enum — code chỉ so sánh với các literal `"production"`, `"testing"`, `"test"`. Giá trị khác (ví dụ `"staging"`) hợp lệ và hành xử như development (docs bật, validator JWT không chạy, rate limit bật).

### 2.2 Database

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `DATABASE_URL` | `string` | **không có** | **CÓ** | DSN Postgres async. Runtime dùng nguyên chuỗi; Alembic thay `+asyncpg` → `+psycopg`; script seed tạo engine riêng | `app/core/database.py`, `alembic/env.py`, `app/scripts/seed_symbols.py` |

Chi tiết ở §7.

### 2.3 JWT

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `JWT_SECRET_KEY` | `string` | **không có** | **CÓ** | Khoá ký/verify **access token**. Đồng thời là base khoá cho email-verify token, và `JWT_SECRET_KEY + hashed_password` là khoá cho password-reset token (tự vô hiệu khi user đổi mật khẩu) | `app/core/security.py`, `app/core/email_tokens.py` |
| `JWT_REFRESH_SECRET_KEY` | `string` | **không có** | **CÓ** | Khoá ký/verify **refresh token** (khác khoá access — không được gộp) | `app/core/security.py` |
| `JWT_ALGORITHM` | `string` | `"HS256"` | Không | Thuật toán cho cả 4 loại token (access, refresh, email-verify, password-reset) | `app/core/security.py`, `app/core/email_tokens.py` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `number` | `30` | Không | TTL access token (`exp = now + minutes`) | `app/core/security.py` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `number` | `7` | Không | TTL refresh token (`exp = now + days`) và cũng dùng để tính `expires_at` của bản ghi refresh token trong DB | `app/core/security.py`, `app/services/auth.py` |

### 2.4 CORS

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `CORS_ORIGINS` | `string` (CSV) | `"http://localhost:3000"` | Không | Danh sách origin, phân tách bằng dấu phẩy. Nếu chứa `*` thì `allow_credentials` bị hạ xuống `false` kèm log warning | `app/main.py` qua `cors_origins_list` |
| `CORS_METHODS` | `string` (CSV) | `"GET,POST,PUT,DELETE,PATCH,OPTIONS"` | Không | `allow_methods` | `app/main.py` qua `cors_methods_list` |
| `CORS_HEADERS` | `string` (CSV) | `"Authorization,Content-Type,Accept"` | Không | `allow_headers` | `app/main.py` qua `cors_headers_list` |

### 2.5 API Docs

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `ENABLE_API_DOCS` | `boolean \| null` | `null` (auto) | Không | `null` = auto (bật ở non-production, tắt ở production). Đặt tường minh sẽ override cả hai chiều. Điều khiển đồng thời `/docs`, `/redoc`, `/openapi.json` | `app/main.py` qua `api_docs_enabled` |

**Cảnh báo**: đây là field bool optional duy nhất. `ENABLE_API_DOCS=` (rỗng) → crash khi khởi động. Muốn về chế độ auto thì **xoá hẳn dòng đó khỏi `.env`**, không để rỗng.

### 2.6 SePay Payment Gateway

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `SEPAY_MERCHANT_ID` | `string` | `""` | Không | Field `merchant` trong payload khởi tạo checkout | `app/services/premium.py` |
| `SEPAY_SECRET_KEY` | `string` | `""` | Không | (1) HMAC-SHA256 ký các field checkout; (2) so sánh constant-time (`hmac.compare_digest`) với secret key trong header của IPN webhook | `app/services/premium.py`, `app/api/v1/endpoints/premium.py` |
| `SEPAY_CHECKOUT_URL` | `string` | `"https://pay-sandbox.sepay.vn/v1/checkout/init"` | Không | Endpoint khởi tạo checkout. **Default là SANDBOX** — production phải override | `app/services/premium.py` |
| `APP_PUBLIC_URL` | `string` | `"http://localhost:3000"` | Không | Base URL public. Dùng để build `{APP_PUBLIC_URL}/payment/success` \| `/payment/error` \| `/payment/cancel`; build URL webhook Telegram; và là fallback cho link trong email khi `EMAIL_LINK_BASE_URL` rỗng | `app/services/premium.py`, `app/services/alerts/startup.py`, `app/services/email.py` |

Bảo mật: nếu `SEPAY_SECRET_KEY` để rỗng thì so sánh IPN vẫn chạy nhưng chỉ khớp khi client cũng gửi rỗng — mà điều kiện `bool(secret_key and ...)` yêu cầu secret_key phía client phải truthy, nên thực tế **mọi IPN đều bị từ chối**. Bản TS phải giữ hành vi fail-closed này.

### 2.7 Email / Resend

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | `string` | `""` | Không | Bearer token gọi `https://api.resend.com/emails`. Rỗng → gửi bị skip (log `[email-disabled]`) dù `EMAIL_ENABLED=true` | `app/services/email.py` |
| `EMAIL_ENABLED` | `boolean` | **`false`** | Không | Công tắc gửi email thật. `false` → chỉ log, trả `False`, **không lỗi** | `app/services/email.py` |
| `EMAIL_FROM` | `string` | `"IQX <no-reply@iqx.vn>"` | Không | Header `from`; domain phải được verify ở Resend | `app/services/email.py` |
| `EMAIL_LINK_BASE_URL` | `string` | `""` | Không | Base URL cho link trong email. Rỗng → fallback `APP_PUBLIC_URL`. Cả hai đều bị `.rstrip("/")` | `app/services/email.py` |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | `number` | `48` | Không | TTL token xác thực email | `app/core/email_tokens.py` |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `number` | `2` | Không | TTL token đặt lại mật khẩu | `app/core/email_tokens.py` |

Link được build theo đúng dạng: `{base}/api/v1/auth/verify-email?token={token}` và `{base}/api/v1/auth/reset-password?token={token}` — nghĩa là base phải route được `/api/v1/auth/*` về backend này.

### 2.8 Logging

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `LOG_LEVEL` | `string` | `"INFO"` | Không | Level của root logger. Lookup `getattr(logging, LOG_LEVEL.upper(), logging.INFO)` → **giá trị sai chính tả im lặng fallback về INFO**, không lỗi | `app/core/logging.py` |

Chi tiết format ở §8.

### 2.9 Market Data (cache in-process)

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `MARKET_DATA_TIMEOUT_SECONDS` | `number` (float) | `15.0` | Không | **KHÔNG được đọc ở đâu.** `app/services/market_data/http.py` hard-code `_DEFAULT_TIMEOUT = 15.0` (trùng giá trị nhưng độc lập) | *(không ai)* |
| `MARKET_DATA_CACHE_ENABLED` | `boolean` | **`true`** | Không | **KHÔNG được đọc ở đâu** (dead config) | *(không ai)* |
| `MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS` | `number` | `3600` | Không | **KHÔNG được đọc ở đâu** (dead config) | *(không ai)* |
| `MARKET_DATA_CACHE_TTL_REALTIME_SECONDS` | `number` | `10` | Không | **KHÔNG được đọc ở đâu** (dead config) | *(không ai)* |
| `MARKET_DATA_CACHE_TTL_HISTORY_SECONDS` | `number` | `300` | Không | **KHÔNG được đọc ở đâu** (dead config) | *(không ai)* |
| `MARKET_DATA_CACHE_MAX_SIZE` | `number` | `1000` | Không | Số entry tối đa của `TTLCache` in-process (LRU eviction) | `app/services/market_data/cache.py` |

Xem thêm §10 về nhóm biến chết này.

### 2.10 Rate Limiting

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `RATE_LIMIT_DEFAULT` | `string` | `"60/minute"` | Không | `default_limits` của slowapi Limiter (áp cho mọi route qua middleware) | `app/core/rate_limit.py` |
| `RATE_LIMIT_AUTH` | `string` | `"10/minute"` | Không | Limit riêng cho các endpoint `/auth/*` (áp bằng decorator `@limiter.limit`) | `app/api/v1/endpoints/auth.py` |
| `RATE_LIMIT_MARKET_DATA` | `string` | `"120/minute"` | Không | Limit riêng cho một endpoint market-data (áp tại `market_data.py:354`) | `app/api/v1/endpoints/market_data.py` |

Cú pháp giá trị là chuỗi slowapi/limits (`"<số>/<đơn vị>"`, ví dụ `60/minute`). Storage là `"memory://"` — **per-process, không dùng Redis**, nên scale nhiều instance sẽ nhân limit lên theo số instance. Limiter bị tắt hoàn toàn khi `APP_ENV ∈ {"testing", "test"}`.

### 2.11 AI Proxy

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `AI_PROXY_BASE_URL` | `string` | `""` | Không | Base URL API OpenAI-compatible. URL cuối = `{base_url.rstrip('/')}/chat/completions`. Rỗng → **ném lỗi cấu hình** (thông báo tiếng Việt: `"AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường."`) | `app/services/ai/proxy_client.py` |
| `AI_PROXY_MODEL` | `string` | `"deepseek-v4-flash"` | Không | Field `model` trong request body | `app/services/ai/proxy_client.py` |
| `AI_PROXY_API_KEY` | `string` | `""` | Không | Header `Authorization: Bearer …`. Rỗng → ném lỗi `"AI proxy API key chưa được cấu hình. Hãy đặt AI_PROXY_API_KEY trong biến môi trường."` | `app/services/ai/proxy_client.py` |
| `AI_PROXY_TIMEOUT_SECONDS` | `number` (float) | `120.0` | Không | Timeout HTTP cho lời gọi chat completion | `app/services/ai/proxy_client.py` |

Lưu ý: default `AI_PROXY_MODEL` trong code (`deepseek-v4-flash`) **khác** giá trị trong `.env.example` (`cx/gpt-5.5`). Giá trị thực tế do env quyết định.

### 2.12 Symbol Seed

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `SIMPLIZE_LOGO_BASE_URL` | `string` | `"https://cdn.simplize.vn/simplizevn/logo"` | Không | Base CDN logo; URL logo = `{base}/{SYMBOL_UPPER}.jpeg` | `app/services/symbols.py` |

Đặc biệt: đây là setting duy nhất có đường đọc **trực tiếp từ `os.environ`** làm fallback — `app/services/symbols.py:36` bọc `get_settings()` trong try/except và nếu lỗi thì đọc `os.environ.get("SIMPLIZE_LOGO_BASE_URL", <hằng số nội bộ>)`.

### 2.13 Redis

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `REDIS_URL` | `string` | `"redis://localhost:6379/0"` | Không | DSN Redis. Client mở với `decode_responses=True`, `socket_connect_timeout=5`, `socket_timeout=3`, `retry_on_timeout=True` | `app/services/cache/redis_cache.py` |
| `REDIS_ENABLED` | `boolean` | **`false`** | Không | Công tắc cache Redis. `false` → không kết nối, decorator cache bypass, realtime bridge không chạy | `app/services/cache/redis_cache.py`, `app/services/cache/decorator.py`, `app/services/realtime/__init__.py` |
| `REDIS_DEFAULT_TTL_SECONDS` | `number` | `300` | Không | TTL mặc định của decorator `@redis_cached` (và fallback khi tên `ttl_setting` không tồn tại) | `app/services/cache/decorator.py`, dùng qua `ttl_setting` ở `market_data.py`, `market_global.py` |
| `REDIS_TTL_REALTIME_SECONDS` | `number` | `15` | Không | TTL cho endpoint intraday / price-board | `app/api/v1/endpoints/market_data.py`, `app/api/v1/endpoints/market_global.py` |
| `REDIS_TTL_REFERENCE_SECONDS` | `number` | `3600` | Không | TTL cho dữ liệu tham chiếu (symbols, industries) | `app/api/v1/endpoints/market_data.py` |
| `REDIS_TTL_OVERVIEW_SECONDS` | `number` | `30` | Không | TTL cho nhóm `/market-data/overview/*` (liquidity, index-impact, foreign, foreign/top) | `app/api/v1/endpoints/market_data.py` |
| `REDIS_TTL_MACRO_SECONDS` | `number` | `900` | Không | TTL cho macro / funds / company | `app/api/v1/endpoints/market_data.py` |
| `REDIS_TTL_NEWS_SECONDS` | `number` | `300` | Không | TTL cho tin tức | `app/api/v1/endpoints/market_data.py` |
| `REDIS_TTL_AI_DASHBOARD_SECONDS` | `number` | `60` | Không | TTL payload AI dashboard (hàm đọc có try/except, fallback hard-code `60`) | `app/services/ai/payloads.py` |
| `REDIS_TTL_AI_INDUSTRY_SECONDS` | `number` | `600` | Không | TTL payload AI theo ngành (`icb_code`); fallback hard-code `600` | `app/services/ai/payloads.py` |
| `REDIS_TTL_AI_ANALYSIS_SECONDS` | `number` | `1800` | Không | **Đã bị vô hiệu hoá trên thực tế**: chỉ còn được nhắc trong docstring `app/services/ai/analysis_service.py`. TTL thật do `_get_analysis_ttl()` tính: BCTC = `7*24*3600`, còn lại = số giây tới hết phiên (tối thiểu `3600`) | *(chỉ docstring)* |
| `REDIS_TTL_SHEETS_SECONDS` | `number` | `600` | Không | TTL cho dữ liệu Google Sheets | `app/api/v1/endpoints/market_data.py` |

Hành vi fail-safe quan trọng: **mọi lỗi Redis đều bị nuốt**. `startup()` bọc try/except → log warning và set client = `None` (app vẫn chạy, không cache). `cache_get_json` lỗi → trả `None`; `cache_set_json` lỗi → im lặng. Bản TS phải giữ đúng: Redis chết không được làm request lỗi.

### 2.14 Google Sheets

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `GOOGLE_SHEETS_API_KEY` | `string` | `""` | Không | API key Sheets v4 Values API (dùng cho VND / TPCP / TYGIA). Rỗng → `RuntimeError("GOOGLE_SHEETS_API_KEY is not configured")` khi endpoint đó được gọi (lazy, không chặn startup) | `app/services/market_data/sources/google_sheets.py` |

### 2.15 Background Jobs

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `JOBS_ENABLED` | `boolean` | **`true`** | Không | Công tắc toàn bộ APScheduler. `false` → không tạo scheduler, log `"Scheduler disabled via JOBS_ENABLED=false"`; endpoint admin liệt kê job trả list rỗng và `run_job_now` ném `ValueError("Scheduler not running")` | `app/services/jobs/__init__.py` |

Scheduler chạy với `timezone="UTC"`; các cron job dùng `timezone="Asia/Ho_Chi_Minh"` riêng cho từng trigger. Mọi job đặt `max_instances=1, coalesce=True, replace_existing=True`. Giả định vận hành: **uvicorn `workers=1`** (docstring nói rõ nếu scale worker thì phải bọc advisory lock).

### 2.16 Telegram / Alerts

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `string` | `""` | Không | Token Bot API; URL gọi = `https://api.telegram.org/bot{token}/{method}`. Rỗng → `is_configured()` = false, mọi lời gọi ném `TelegramError("Telegram chưa được cấu hình (thiếu TELEGRAM_BOT_TOKEN)")` | `app/services/telegram/client.py` |
| `TELEGRAM_BOT_USERNAME` | `string` | `""` | Không | Username (không có `@`) để build deep-link `https://t.me/{username}?start={token}`. Rỗng → `deep_link` trả về **chuỗi rỗng** | `app/services/telegram/linking.py`, `app/api/v1/endpoints/alerts.py` |
| `TELEGRAM_WEBHOOK_SECRET` | `string` | `""` | Không | Vừa là **path segment** bảo vệ webhook (`POST /api/v1/telegram/webhook/{secret}`), vừa là `secret_token` khi gọi `setWebhook` và để so sánh header `X-Telegram-Bot-Api-Secret-Token`. Rỗng → webhook trả `{"ok": true}` mà không xử lý gì | `app/api/v1/endpoints/telegram.py`, `app/services/alerts/startup.py` |
| `ALERTS_ENABLED` | `boolean` | **`false`** | Không | Bật job quét alert intraday (`alert_scan`) | `app/services/jobs/__init__.py` |
| `ALERT_SCAN_INTERVAL_MINUTES` | `number` | `10` | Không | Chu kỳ job quét alert. Được kẹp sàn: `max(int(value), 1)` → không thể nhỏ hơn 1 phút | `app/services/jobs/__init__.py` |

Startup hook `alerts_startup()` chỉ đăng ký webhook khi **đủ 3 điều kiện**: bot đã cấu hình (`TELEGRAM_BOT_TOKEN`), `TELEGRAM_WEBHOOK_SECRET` truthy, và `APP_PUBLIC_URL` truthy. Mọi lỗi ở bước này chỉ log warning (best-effort). Việc seed 10 alert preset chạy độc lập với các flag trên và cũng bọc try/except (tolerate race giữa nhiều worker).

### 2.17 Daily AI Market Analysis (EOD 16:30)

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `MARKET_ANALYSIS_ENABLED` | `boolean` | **`false`** | Không | Bật 2 job: `market_analysis_daily` và `market_analysis_daily_retry` | `app/services/jobs/__init__.py` |
| `MARKET_ANALYSIS_CRON_HOUR` | `number` | `16` | Không | Giờ (ICT) chạy bản EOD | `app/services/jobs/__init__.py` |
| `MARKET_ANALYSIS_CRON_MINUTE` | `number` | `30` | Không | Phút chạy bản EOD | `app/services/jobs/__init__.py` |
| `MARKET_ANALYSIS_RETRY_HOUR` | `number` | `17` | Không | Giờ (ICT) chạy lại nếu bản 16:30 thất bại | `app/services/jobs/__init__.py` |
| `MARKET_ANALYSIS_RETRY_MINUTE` | `number` | `0` | Không | Phút chạy lại | `app/services/jobs/__init__.py` |

Cron: `day_of_week="mon-fri"`, `timezone="Asia/Ho_Chi_Minh"`.

### 2.18 Mid-day AI Market Analysis (11:30)

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `MIDDAY_ANALYSIS_ENABLED` | `boolean` | **`false`** | Không | Bật job `market_analysis_midday` | `app/services/jobs/__init__.py` |
| `MIDDAY_ANALYSIS_CRON_HOUR` | `number` | `11` | Không | Giờ (ICT) | `app/services/jobs/__init__.py` |
| `MIDDAY_ANALYSIS_CRON_MINUTE` | `number` | `30` | Không | Phút | `app/services/jobs/__init__.py` |

### 2.19 Pre-market AI Market Analysis (07:15)

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `PREMARKET_ANALYSIS_ENABLED` | `boolean` | **`false`** | Không | Bật job `market_analysis_premarket` | `app/services/jobs/__init__.py` |
| `PREMARKET_ANALYSIS_CRON_HOUR` | `number` | `7` | Không | Giờ (ICT) | `app/services/jobs/__init__.py` |
| `PREMARKET_ANALYSIS_CRON_MINUTE` | `number` | `15` | Không | Phút | `app/services/jobs/__init__.py` |

### 2.20 International Market Data Snapshots

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `INTL_DATA_ENABLED` | `boolean` | **`false`** | Không | Bật 3 job snapshot quốc tế | `app/services/jobs/__init__.py` |

Giờ của 3 wave này **hard-code trong code, không có env**: wave 1 = 06:00 ICT (`ALL_SYMBOLS`), wave 2 = 07:05 ICT (`WAVE2_SYMBOLS`), wave 3 = 08:30 ICT (`WAVE3_SYMBOLS`), tất cả `mon-fri`, timezone `Asia/Ho_Chi_Minh`.

### 2.21 Lessons / Media

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `LESSON_MEDIA_DIR` | `string` | `"./media"` | Không | Thư mục gốc lưu media. `create_app()` `mkdir(parents=True, exist_ok=True)` rồi mount static tại `/media`. `MediaStorage` `resolve()` thành absolute và chặn path-traversal (`relative_to(base)`) | `app/main.py`, `app/services/lesson/storage.py` |
| `LESSON_MAX_PDF_MB` | `number` | `50` | Không | Giới hạn upload PDF (`MB * 1024 * 1024`); vượt → HTTP 413 | `app/services/lesson/service.py` |
| `LESSON_MAX_VIDEO_MB` | `number` | `500` | Không | Giới hạn upload video MP4/WebM; vượt → HTTP 413 | `app/services/lesson/service.py` |
| `LESSON_MAX_THUMBNAIL_MB` | `number` | `5` | Không | Giới hạn upload ảnh thumbnail; vượt → HTTP 413 với message `f"Ảnh quá lớn (tối đa {LESSON_MAX_THUMBNAIL_MB} MB)"` | `app/services/lesson/service.py` |

Sai MIME thì trả HTTP 415 (`"Chỉ chấp nhận file PDF"` / `"Chỉ chấp nhận video MP4 hoặc WebM"`) — kiểm MIME **trước** khi kiểm size.

### 2.22 Realtime / DNSE

| Biến | Type | Default | Bắt buộc? | Tác dụng | Ai đọc |
|---|---|---|---|---|---|
| `REALTIME_ENABLED` | `boolean` | **`false`** | Không | Công tắc bridge realtime. `false` → `startup()` no-op; WebSocket `/market-data/ws` đóng ngay với code **1013** (try again later) | `app/services/realtime/__init__.py`, `app/api/v1/endpoints/realtime_ws.py` |
| `DNSE_TRANSPORT` | `'auto' \| 'openapi' \| 'mqtt'` | `"auto"` | Không | Chọn transport. Giá trị được `.strip().lower()`; nếu là `openapi`/`mqtt` thì thắng tuyệt đối; `auto` (hoặc bất kỳ giá trị lạ) → `openapi` **chỉ khi có đủ cả** `DNSE_API_KEY` và `DNSE_API_SECRET`, ngược lại `mqtt` | `app/services/realtime/openapi_stream.py` (`resolve_transport`) |
| `DNSE_USERNAME` | `string` | `""` | Không | Tài khoản Entrade cho luồng MQTT legacy. Thiếu username **hoặc** password → `DnseAuthError("DNSE credentials missing (DNSE_USERNAME/DNSE_PASSWORD)")` | `app/services/realtime/dnse_auth.py` |
| `DNSE_PASSWORD` | `string` | `""` | Không | Mật khẩu Entrade | `app/services/realtime/dnse_auth.py` |
| `DNSE_API_KEY` | `string` | `""` | Không | API key LightSpeed OpenAPI (`entradex.dnse.com.vn`) | `app/services/realtime/openapi_stream.py`, `app/services/realtime/bridge.py` |
| `DNSE_API_SECRET` | `string` | `""` | Không | API secret LightSpeed (chỉ hiển thị 1 lần khi tạo) | `app/services/realtime/openapi_stream.py`, `app/services/realtime/bridge.py` |
| `DNSE_OPENAPI_WS_URL` | `string` | `"wss://ws-openapi.dnse.com.vn/v1/stream"` | Không | Endpoint WS OpenAPI; cũng dùng để probe (host, port) khi health-check | `app/services/realtime/bridge.py` |
| `DNSE_AUTH_URL` | `string` | `"https://services.entrade.com.vn/dnse-user-service/api/auth"` | Không | `POST {username, password}` → JWT | `app/services/realtime/dnse_auth.py` |
| `DNSE_ME_URL` | `string` | `"https://services.entrade.com.vn/dnse-user-service/api/me"` | Không | `GET` (Bearer) → `investorId`, dùng làm MQTT username | `app/services/realtime/dnse_auth.py` |
| `DNSE_MQTT_HOST` | `string` | `"datafeed-lts.dnse.com.vn"` | Không | Host MQTT-over-WSS | `app/services/realtime/bridge.py` |
| `DNSE_MQTT_PORT` | `number` | `443` | Không | Port MQTT | `app/services/realtime/bridge.py` |
| `DNSE_MQTT_WS_PATH` | `string` | `"/wss"` | Không | WebSocket path của MQTT | `app/services/realtime/bridge.py` |
| `REALTIME_LEADER_LOCK_TTL` | `number` (giây) | `30` | Không | TTL khoá leader trong Redis (`SET NX EX`) và giá trị `EXPIRE` khi gia hạn | `app/services/realtime/bridge.py` |
| `REALTIME_LEADER_RENEW_SECONDS` | `number` (giây) | `10` | Không | Nhịp gia hạn / thử giành lại lock; cũng là bước sleep tối đa khi chờ | `app/services/realtime/bridge.py` |
| `REALTIME_TOKEN_REFRESH_HOURS` | `number` (giờ) | `7` | Không | Ngưỡng coi JWT DNSE là "stale" để refresh trước hạn (~8h) | `app/services/realtime/dnse_auth.py` |
| `REALTIME_SUBSCRIBE_POLL_SECONDS` | `number` (float, giây) | `1.5` | Không | Nhịp leader đọc demand để (un)subscribe topic | `app/services/realtime/bridge.py` |
| `REALTIME_FALLBACK_POLL_SECONDS` | `number` (float, giây) | `2.0` | Không | Nhịp polling VCI khi mất broker (fallback) | `app/services/realtime/bridge.py` |
| `REALTIME_MAX_SYMBOLS` | `number` | `200` | Không | Trần tổng số mã subscribe đồng thời (cắt demand) | `app/services/realtime/bridge.py` |
| `REALTIME_WS_MAX_SYMBOLS_PER_CONN` | `number` | `100` | Không | Trần số mã **mỗi WS connection**; vượt → server gửi `{"type":"error","detail":"symbol limit reached"}`. Channel `index` **không** tính vào trần | `app/api/v1/endpoints/realtime_ws.py` |

Phụ thuộc quan trọng: realtime cần **cả** `REALTIME_ENABLED=true` **và** `REDIS_ENABLED=true`. Nếu realtime bật mà Redis tắt, `startup()` log warning `"Realtime requires Redis; REDIS_ENABLED=false — skipping bridge"` và bỏ qua bridge — nhưng endpoint WS **vẫn accept** (vì nó chỉ kiểm `REALTIME_ENABLED`), dẫn tới kết nối không có dữ liệu. Bản TS nên giữ hành vi hoặc chủ động kiểm cả hai ở endpoint (khác biệt cần ghi vào changelog nếu sửa).

---

## 3. Biến bắt buộc (không có default)

Chỉ đúng **3 biến** không có default; thiếu bất kỳ biến nào → pydantic `ValidationError` và process **không khởi động**:

| Biến | Vì sao không thể có default |
|---|---|
| `DATABASE_URL` | Không có DSN an toàn để đoán |
| `JWT_SECRET_KEY` | Secret; default sẽ là lỗ hổng |
| `JWT_REFRESH_SECRET_KEY` | Secret riêng biệt cho refresh token |

Ngoài ra có nhóm "bắt buộc theo tính năng" — có default `""` nên app vẫn boot, nhưng tính năng tương ứng sẽ không hoạt động (fail lazily, thường kèm message tiếng Việt): `AI_PROXY_BASE_URL` + `AI_PROXY_API_KEY` (AI), `SEPAY_MERCHANT_ID` + `SEPAY_SECRET_KEY` (thanh toán), `RESEND_API_KEY` (email), `GOOGLE_SHEETS_API_KEY` (sheets), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (alert), `DNSE_*` (realtime).

---

## 4. Property dẫn xuất

Năm property, logic chính xác như sau (không có cache, tính lại mỗi lần truy cập):

| Property | Type TS | Logic chính xác |
|---|---|---|
| `cors_origins_list` | `string[]` | `CORS_ORIGINS.split(",")`, `trim()` từng phần tử, **bỏ phần tử rỗng sau khi trim** |
| `cors_methods_list` | `string[]` | Y hệt trên, áp cho `CORS_METHODS` |
| `cors_headers_list` | `string[]` | Y hệt trên, áp cho `CORS_HEADERS` |
| `is_production` | `boolean` | `APP_ENV === "production"` — so sánh **chính xác, phân biệt hoa/thường, không trim**. `"Production"` hay `" production"` đều **không** phải production |
| `api_docs_enabled` | `boolean` | Nếu `ENABLE_API_DOCS !== null` → trả chính giá trị đó. Ngược lại → `!is_production` |

TS tương đương:

```ts
function splitCsv(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

const isProduction = (cfg: AppConfig): boolean => cfg.APP_ENV === 'production';

const apiDocsEnabled = (cfg: AppConfig): boolean =>
  cfg.ENABLE_API_DOCS !== null ? cfg.ENABLE_API_DOCS : !isProduction(cfg);
```

Hệ quả nghiệp vụ của `cors_origins_list` ở `app/main.py`: nếu list chứa `"*"` thì `allow_credentials` bị hạ về `false` kèm log warning `"CORS: allow_credentials=True with wildcard origins is insecure, disabling credentials"`. Ngoài trường hợp đó, `allow_credentials` luôn `true`.

---

## 5. Validator production: `_reject_placeholder_jwt_secrets`

Là `@model_validator(mode="after")` — chạy **sau** khi mọi field đã parse xong, mỗi lần tạo `Settings` (tức 1 lần / process nhờ `lru_cache`).

### 5.1 Điều kiện áp dụng

```
if APP_ENV != "production": return  # bỏ qua hoàn toàn
```

So sánh chuỗi chính xác. Vậy ở `development`, `testing`, `staging`… validator **không chạy** và secret placeholder được chấp nhận (có test khẳng định: `test_jwt_placeholder_allowed_in_dev`).

### 5.2 Thứ tự kiểm tra

Duyệt **theo đúng thứ tự** `("JWT_SECRET_KEY", "JWT_REFRESH_SECRET_KEY")`, với mỗi field:

1. Kiểm **placeholder** trước → nếu match, raise ngay.
2. Rồi kiểm **độ dài `< 32`** → nếu ngắn, raise.

Nên nếu cả hai field đều sai, thông báo lỗi chỉ nêu `JWT_SECRET_KEY`.

### 5.3 Regex placeholder (đầy đủ, nguyên văn)

```
change.in.production|changeme|replace.me|your.secret|CHANGE_ME|placeholder|^dev-|^test-|^default-|^secret$|^changethis$
```

- Cờ: `re.IGNORECASE`. **Không** có `re.MULTILINE` → `^`/`$` neo vào đầu/cuối cả chuỗi.
- Dùng `re.search` (không phải `fullmatch`) → các alternative **không** neo (`changeme`, `placeholder`, …) match ở **bất kỳ vị trí** trong secret.
- Dấu `.` trong `change.in.production`, `replace.me`, `your.secret` là **metacharacter "một ký tự bất kỳ"**, không phải dấu chấm literal. Nên `change-in-production`, `change_in_production`, `changeXinYproduction` đều bị chặn.
- `CHANGE_ME` là alternative riêng (vì `changeme` không match `CHANGE_ME` do dấu gạch dưới). Hệ quả trực tiếp: giá trị trong `.env.example` — `CHANGE_ME_TO_A_RANDOM_SECRET_KEY` — **bị từ chối ở production**.
- Các alternative neo đầu: `^dev-`, `^test-`, `^default-`; neo cả hai đầu: `^secret$`, `^changethis$`.

Regex tương đương trong TS (giữ nguyên semantics, `i` flag, không `m` flag):

```ts
const PLACEHOLDER_PATTERNS =
  /change.in.production|changeme|replace.me|your.secret|CHANGE_ME|placeholder|^dev-|^test-|^default-|^secret$|^changethis$/i;
```

### 5.4 Thông báo lỗi (nguyên văn, phải giữ nguyên chuỗi)

- Placeholder: `"{field_name} contains a placeholder value and must be changed before running in production (APP_ENV=production)."`
- Quá ngắn: `"{field_name} is too short ({len} chars). Use at least 32 characters in production."` — trong đó `{len}` là số ký tự thực tế.

Ở Python, `ValueError` này được pydantic bọc thành `ValidationError`; các test chỉ khớp substring `"placeholder"` và `"too short"`.

### 5.5 Bảng ví dụ đã được test khẳng định

| `APP_ENV` | `JWT_SECRET_KEY` | Kết quả |
|---|---|---|
| `production` | `dev-secret-key-change-in-production-abc123xyz789` | **Từ chối** — khớp `^dev-` (và cả `change.in.production`) |
| `production` | `AbCdEfGhIjKlMnOpQrStUvWxYz12` (28 ký tự) | **Từ chối** — `too short (28 chars)` |
| `production` | `a-secure-production-secret-key-at-least-32-chars-long` | Chấp nhận |
| `development` | `dev-secret-key-change-in-production-abc123xyz789` | Chấp nhận (validator không chạy) |

### 5.6 Ghi chú cho bản TS

Validator phải chạy **lúc bootstrap, trước khi mở HTTP listener** (fail fast), không phải lazily ở request đầu tiên. Trong NestJS: dùng `validate` của `ConfigModule.forRoot({ validate })` hoặc gọi hàm parse Zod ở `main.ts` trước `app.listen()`.

---

## 6. Bảng feature flag

Đây là phần dev mới hay hiểu sai nhất: **phần lớn flag default `false`**, nên một môi trường chỉ set 3 biến bắt buộc sẽ chạy được nhưng **gần như tắt hết** tính năng nền.

| Flag | Default | Khi OFF thì mất gì | Khi ON cần thêm gì |
|---|---|---|---|
| `JOBS_ENABLED` | **`true`** | Không tạo APScheduler → mất `expiry_sweep` (mỗi 1h, hết hạn subscription) và `ipn_reconcile_scan` (mỗi 6h, đối soát order PENDING); mọi cron AI/alert/intl cũng không được đăng ký dù flag riêng của chúng ON; admin API thấy `jobs: []`, `run_job_now` ném `ValueError` | — |
| `REDIS_ENABLED` | **`false`** | Không kết nối Redis; `@redis_cached` bypass hoàn toàn (mọi request đi thẳng provider); `/health` trả `redis: "disabled"`; realtime bridge bị skip; Telegram link-token (lưu bằng `cache_set_json`) không hoạt động | `REDIS_URL` trỏ instance thật |
| `ALERTS_ENABLED` | **`false`** | Không có job `alert_scan` → không quét rule alert intraday, không gửi Telegram. Việc seed 10 preset và đăng ký webhook **vẫn chạy** (độc lập flag này) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_PUBLIC_URL`, `JOBS_ENABLED=true` |
| `MARKET_ANALYSIS_ENABLED` | **`false`** | Không có job EOD 16:30 và job retry 17:00 → không sinh bản nhận định VN-Index cuối phiên | AI proxy đã cấu hình, `JOBS_ENABLED=true` |
| `MIDDAY_ANALYSIS_ENABLED` | **`false`** | Không có job 11:30 → không có bản "cập nhật phiên sáng" | như trên |
| `PREMARKET_ANALYSIS_ENABLED` | **`false`** | Không có job 07:15 → không có bản pre-market | như trên |
| `INTL_DATA_ENABLED` | **`false`** | Không có 3 job snapshot quốc tế (06:00 / 07:05 / 08:30 ICT) | `JOBS_ENABLED=true` |
| `REALTIME_ENABLED` | **`false`** | Bridge DNSE không chạy; WebSocket `/market-data/ws` **đóng ngay với code 1013** | `REDIS_ENABLED=true` + credentials DNSE (theo transport) |
| `EMAIL_ENABLED` | **`false`** | Không gửi email thật; mọi `send()` chỉ log `[email-disabled]` và trả `false` — flow đăng ký / quên mật khẩu **không lỗi**, chỉ là user không nhận được mail | `RESEND_API_KEY` (rỗng cũng khiến skip), `EMAIL_FROM` domain đã verify |
| `MARKET_DATA_CACHE_ENABLED` | **`true`** | **Không có tác dụng gì** — không code nào đọc flag này. Cache in-process luôn bật | — |
| `ENABLE_API_DOCS` | **`null`** (auto) | `null` + production → tắt `/docs`, `/redoc`, `/openapi.json`. `false` → tắt ở mọi môi trường. `true` → bật cả ở production | — |

Bảng phụ thuộc rút gọn:

```
JOBS_ENABLED=false  ⟹  vô hiệu hoá: ALERTS_ENABLED, MARKET_ANALYSIS_ENABLED,
                        MIDDAY_ANALYSIS_ENABLED, PREMARKET_ANALYSIS_ENABLED,
                        INTL_DATA_ENABLED  (dù chúng =true)

REDIS_ENABLED=false ⟹  vô hiệu hoá thực tế: REALTIME_ENABLED (bridge bị skip),
                        cache HTTP, Telegram link-token
```

---

## 7. `DATABASE_URL` — scheme, engine option, và việc phải đổi khi sang TS

### 7.1 Scheme dùng ở Python

| Ngữ cảnh | Scheme | Nguồn |
|---|---|---|
| Runtime app | `postgresql+asyncpg://user:pass@host:port/db` | `.env.example` + `app/core/database.py` |
| Alembic migration | `postgresql+psycopg://…` — sinh ra bằng `DATABASE_URL.replace("+asyncpg", "+psycopg")` | `alembic/env.py:_sync_db_url()` |
| Test suite | `sqlite+aiosqlite:///` | `tests/conftest.py` |

Lý do Alembic đổi driver được ghi rõ trong docstring: giao thức prepared-statement của asyncpg xử lý sai DDL thô như `CREATE TYPE` (câu lệnh bị thực thi hai lần), nên migration dùng driver sync `psycopg`, còn runtime giữ `asyncpg`.

### 7.2 Engine option runtime (`app/core/database.py`)

| Option | Giá trị | Ghi chú |
|---|---|---|
| `echo` | `settings.DEBUG` | Bật log SQL khi `DEBUG=true` |
| `pool_size` | `10` | Hard-code, **không có env** |
| `max_overflow` | `20` | Hard-code, **không có env** → tối đa 30 connection/process |
| `pool_pre_ping` | `True` | Kiểm tra connection còn sống trước khi dùng |

Engine + session factory được khởi tạo **lazy** (global `_engine`, `_async_session_factory`), tạo ở lần gọi đầu tiên.

Alembic engine: `create_engine(url, poolclass=pool.NullPool)` — không pool.
Script seed (`app/scripts/seed_symbols.py`): `create_async_engine(DATABASE_URL, echo=False)` — engine riêng, không dùng pool config trên.

### 7.3 Pattern transaction của dependency `get_db`

Hành vi phải sao lại (đọc từ docstring + code):

- Session **không** auto-commit theo statement.
- Sau khi handler trả về bình thường → `session.commit()` **luôn** được gọi (kể cả request read-only; commit một transaction chỉ đọc là no-op vô hại).
- Có exception → `session.rollback()` rồi re-raise.
- `expire_on_commit=False` → object vẫn dùng được sau commit (quan trọng khi serialize response sau commit).

### 7.4 Cần đổi gì khi sang TypeScript

`postgresql+asyncpg://` là **cú pháp riêng của SQLAlchemy** (`dialect+driver`), `node-postgres` / Drizzle / TypeORM **không hiểu** nó.

| Consumer TS | DSN cần | Cách xử lý |
|---|---|---|
| `pg` (node-postgres), Drizzle, Kysely | `postgres://` hoặc `postgresql://` | Chuẩn hoá: bỏ hậu tố `+asyncpg` / `+psycopg` |
| Prisma | `postgresql://` | như trên |
| Migration tool (Drizzle Kit…) | `postgresql://` | dùng cùng DSN đã chuẩn hoá — TS không cần driver sync riêng như Python |

Hai lựa chọn kiến trúc, chọn 1 và ghi vào runbook deploy:

1. **Giữ nguyên `.env` production** (khuyến nghị, không phải sửa hạ tầng): nhận `DATABASE_URL` có thể chứa `+asyncpg` và chuẩn hoá trong config layer.

```ts
/** Bỏ hậu tố driver kiểu SQLAlchemy: postgresql+asyncpg:// -> postgresql:// */
export function normalizePgUrl(raw: string): string {
  return raw.replace(/^postgresql\+\w+:\/\//, 'postgresql://')
            .replace(/^postgres\+\w+:\/\//, 'postgres://');
}
```

2. **Sửa `.env` production** thành `postgresql://…` và chỉ chấp nhận scheme thuần trong Zod. Rủi ro: Python và TS không thể dùng chung file env trong giai đoạn chạy song song.

Pool tương đương cho `pg.Pool`: `max: 30` (≈ `pool_size 10 + max_overflow 20`). Không có option `pre_ping`; dùng `keepAlive: true` + retry, hoặc để pool tự loại connection lỗi. `poolSize`/`maxOverflow` hiện **không cấu hình được qua env** ở bản Python — nếu bản TS muốn thêm env mới thì phải ghi rõ đây là biến **mới**, không có trong bản gốc.

---

## 8. Logging (`app/core/logging.py`)

`setup_logging()` được gọi ở đầu lifespan, trước mọi startup hook khác. Hành vi:

| Khía cạnh | Chi tiết |
|---|---|
| Level | `getattr(logging, LOG_LEVEL.upper(), logging.INFO)` — sai chính tả → **im lặng dùng INFO** |
| Format | `"%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"` |
| Datefmt | `"%Y-%m-%d %H:%M:%S"` (giờ local của process, không phải UTC tường minh) |
| Handler | Một `StreamHandler(sys.stdout)` duy nhất |
| Reset | `root.handlers.clear()` trước khi add → tránh nhân đôi handler khi reload |
| Logger bị hạ ồn | `sqlalchemy.engine` → `WARNING`; `uvicorn.access` → `WARNING` |

Tương đương TS: logger ghi ra **stdout**, một transport, cùng format `timestamp | LEVEL(pad 8) | context | message`. Nhớ tắt access log mặc định (tương đương `uvicorn.access = WARNING`) để không đổi khối lượng log ở production, và hạ log của ORM về mức warning.

---

## 9. Env không đi qua `Settings`

| Nguồn | Biến | Ghi chú |
|---|---|---|
| `app/services/symbols.py:36` | `SIMPLIZE_LOGO_BASE_URL` | Đọc `os.environ` làm fallback khi `get_settings()` ném lỗi |
| `app/core/rate_limit.py` (docstring) | `TESTING=1` | Docstring nói "Disabled during test runs (TESTING=1 or APP_ENV=testing)", nhưng **code chỉ kiểm `APP_ENV`**. `TESTING` không được đọc ở đâu → docstring lỗi thời, đừng implement `TESTING` ở TS |

`tests/conftest.py` set env **trước khi import app** rồi gọi `get_settings.cache_clear()`; giá trị dùng cho test: `DATABASE_URL=sqlite+aiosqlite:///`, `APP_ENV=testing`, `DEBUG=false`, `REDIS_ENABLED=false`, `AI_PROXY_*` giả, `SEPAY_*` giả, `LESSON_MEDIA_DIR` = thư mục tạm. Bản TS nên có `test-env.ts` tương đương.

---

## 10. Biến khai báo nhưng không được đọc (dead config)

Grep toàn bộ `app/` + `alembic/` cho thấy 6 biến sau **không có consumer**. Giữ chúng trong `.env.example` để không phá tương thích, nhưng **đừng viết code phụ thuộc**:

| Biến | Trạng thái |
|---|---|
| `MARKET_DATA_TIMEOUT_SECONDS` | Không ai đọc. Timeout thật hard-code `_DEFAULT_TIMEOUT = 15.0` trong `app/services/market_data/http.py` |
| `MARKET_DATA_CACHE_ENABLED` | Không ai đọc |
| `MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS` | Không ai đọc |
| `MARKET_DATA_CACHE_TTL_REALTIME_SECONDS` | Không ai đọc |
| `MARKET_DATA_CACHE_TTL_HISTORY_SECONDS` | Không ai đọc |
| `REDIS_TTL_AI_ANALYSIS_SECONDS` | Chỉ còn trong docstring `app/services/ai/analysis_service.py`. TTL thật: BCTC = `604800` (7 ngày), loại khác = số giây tới hết phiên, sàn `3600` |

Khuyến nghị cho bản TS: nếu muốn "sửa" (nối `MARKET_DATA_TIMEOUT_SECONDS` vào HTTP client thật) thì phải ghi vào changelog — đó là **thay đổi hành vi**, không phải port 1-1.

---

## 11. `.env.example` hoàn chỉnh cho bản TypeScript

```dotenv
# ──────────────────────────────────────────────
# IQX Backend (TypeScript/NestJS) — Environment Variables
# Copy thành .env rồi điền giá trị thật.
# Quy ước: giá trị ghi ở đây là DEFAULT trong code, trừ 3 biến bắt buộc.
# Bool nhận: true|false|1|0|yes|no|on|off. TUYỆT ĐỐI KHÔNG để bool rỗng.
# ──────────────────────────────────────────────

# ── Application ───────────────────────────────
APP_NAME=IQX
APP_VERSION=0.1.0
# development | production | testing | test | (giá trị khác = hành xử như development)
APP_ENV=development
# true => bật echo SQL của ORM (KHÔNG ảnh hưởng log level, không ảnh hưởng docs)
DEBUG=false

# ── Database (BẮT BUỘC) ───────────────────────
# Bản Python dùng scheme SQLAlchemy: postgresql+asyncpg://
# Bản TS chuẩn hoá về postgresql:// (xem chương Cấu hình §7.4)
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/YOUR_DB

# ── JWT (BẮT BUỘC) ────────────────────────────
# Sinh khoá: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Ở APP_ENV=production: >= 32 ký tự và KHÔNG chứa placeholder
# (change.in.production | changeme | replace.me | your.secret | CHANGE_ME |
#  placeholder | ^dev- | ^test- | ^default- | ^secret$ | ^changethis$)
JWT_SECRET_KEY=
JWT_REFRESH_SECRET_KEY=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── CORS (chuỗi CSV, không phải JSON) ─────────
CORS_ORIGINS=http://localhost:3000
CORS_METHODS=GET,POST,PUT,DELETE,PATCH,OPTIONS
CORS_HEADERS=Authorization,Content-Type,Accept

# ── API Docs ──────────────────────────────────
# XOÁ HẲN dòng dưới để về chế độ auto (bật ở non-prod, tắt ở prod).
# Để rỗng sẽ CRASH lúc khởi động.
#ENABLE_API_DOCS=true

# ── SePay Payment Gateway ─────────────────────
SEPAY_MERCHANT_ID=
SEPAY_SECRET_KEY=
# Default dưới đây là SANDBOX — production phải đổi
SEPAY_CHECKOUT_URL=https://pay-sandbox.sepay.vn/v1/checkout/init
# Base public: dùng cho redirect /payment/success|error|cancel, webhook Telegram,
# và là fallback của EMAIL_LINK_BASE_URL
APP_PUBLIC_URL=http://localhost:3000

# ── Email / Resend ────────────────────────────
RESEND_API_KEY=
# false => chỉ log, KHÔNG gửi (flow đăng ký/quên mật khẩu vẫn thành công)
EMAIL_ENABLED=false
EMAIL_FROM=IQX <no-reply@iqx.vn>
# Rỗng => fallback APP_PUBLIC_URL. Phải route được /api/v1/auth/* về backend này.
EMAIL_LINK_BASE_URL=
EMAIL_VERIFY_TOKEN_TTL_HOURS=48
PASSWORD_RESET_TOKEN_TTL_HOURS=2

# ── Logging ───────────────────────────────────
# Giá trị sai chính tả sẽ im lặng fallback về INFO
LOG_LEVEL=INFO

# ── Market Data ───────────────────────────────
# 5 biến dưới đây HIỆN KHÔNG ĐƯỢC ĐỌC ở bản Python (dead config) — giữ để tương thích
MARKET_DATA_TIMEOUT_SECONDS=15
MARKET_DATA_CACHE_ENABLED=true
MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS=3600
MARKET_DATA_CACHE_TTL_REALTIME_SECONDS=10
MARKET_DATA_CACHE_TTL_HISTORY_SECONDS=300
# Biến dưới đây CÓ tác dụng: trần số entry của cache in-process (LRU)
MARKET_DATA_CACHE_MAX_SIZE=1000

# ── Rate Limiting (cú pháp "<số>/<đơn vị>", storage in-memory per-process) ──
RATE_LIMIT_DEFAULT=60/minute
RATE_LIMIT_AUTH=10/minute
RATE_LIMIT_MARKET_DATA=120/minute
# Rate limit bị TẮT hoàn toàn khi APP_ENV = testing | test

# ── AI Proxy (OpenAI-compatible) ──────────────
# Rỗng => lời gọi AI ném lỗi cấu hình (fail lazily, không chặn startup)
AI_PROXY_BASE_URL=
AI_PROXY_MODEL=deepseek-v4-flash
AI_PROXY_API_KEY=
AI_PROXY_TIMEOUT_SECONDS=120

# ── Symbol Seed ───────────────────────────────
SIMPLIZE_LOGO_BASE_URL=https://cdn.simplize.vn/simplizevn/logo

# ── Redis ─────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
# false => KHÔNG cache HTTP, /health trả redis="disabled", realtime bridge bị skip
REDIS_ENABLED=false
REDIS_DEFAULT_TTL_SECONDS=300
REDIS_TTL_REALTIME_SECONDS=15
REDIS_TTL_REFERENCE_SECONDS=3600
REDIS_TTL_OVERVIEW_SECONDS=30
REDIS_TTL_MACRO_SECONDS=900
REDIS_TTL_NEWS_SECONDS=300
REDIS_TTL_AI_DASHBOARD_SECONDS=60
REDIS_TTL_AI_INDUSTRY_SECONDS=600
# Biến dưới đây KHÔNG còn được đọc (TTL thật tính động theo phiên / 7 ngày cho BCTC)
REDIS_TTL_AI_ANALYSIS_SECONDS=1800
REDIS_TTL_SHEETS_SECONDS=600

# ── Google Sheets ─────────────────────────────
GOOGLE_SHEETS_API_KEY=

# ── Background Jobs ───────────────────────────
# LƯU Ý: đây là flag duy nhất trong nhóm nền default = true.
# false => TẮT scheduler => tắt luôn mọi cron AI/alert/intl bên dưới
JOBS_ENABLED=true

# ── Telegram / Alerts ─────────────────────────
TELEGRAM_BOT_TOKEN=
# Không có ký tự @
TELEGRAM_BOT_USERNAME=
# Vừa là path segment của webhook, vừa là secret_token khi setWebhook
TELEGRAM_WEBHOOK_SECRET=
ALERTS_ENABLED=false
# Được kẹp sàn tối thiểu 1 phút
ALERT_SCAN_INTERVAL_MINUTES=10

# ── Daily AI Market Analysis (EOD) — cron mon-fri, timezone Asia/Ho_Chi_Minh ──
MARKET_ANALYSIS_ENABLED=false
MARKET_ANALYSIS_CRON_HOUR=16
MARKET_ANALYSIS_CRON_MINUTE=30
MARKET_ANALYSIS_RETRY_HOUR=17
MARKET_ANALYSIS_RETRY_MINUTE=0

# ── Mid-day AI Market Analysis ────────────────
MIDDAY_ANALYSIS_ENABLED=false
MIDDAY_ANALYSIS_CRON_HOUR=11
MIDDAY_ANALYSIS_CRON_MINUTE=30

# ── Pre-market AI Market Analysis ─────────────
PREMARKET_ANALYSIS_ENABLED=false
PREMARKET_ANALYSIS_CRON_HOUR=7
PREMARKET_ANALYSIS_CRON_MINUTE=15

# ── International Market Data Snapshots ───────
# 3 wave: 06:00 / 07:05 / 08:30 ICT — giờ HARD-CODE, không có env
INTL_DATA_ENABLED=false

# ── Lessons / Media ───────────────────────────
LESSON_MEDIA_DIR=./media
LESSON_MAX_PDF_MB=50
LESSON_MAX_VIDEO_MB=500
LESSON_MAX_THUMBNAIL_MB=5

# ── Realtime / DNSE ───────────────────────────
# Cần ĐỒNG THỜI REALTIME_ENABLED=true VÀ REDIS_ENABLED=true
REALTIME_ENABLED=false
# auto | openapi | mqtt — auto chọn openapi CHỈ KHI có đủ DNSE_API_KEY + DNSE_API_SECRET
DNSE_TRANSPORT=auto
DNSE_USERNAME=
DNSE_PASSWORD=
# LightSpeed API tại entradex.dnse.com.vn (secret chỉ hiện 1 lần)
DNSE_API_KEY=
DNSE_API_SECRET=
DNSE_OPENAPI_WS_URL=wss://ws-openapi.dnse.com.vn/v1/stream
DNSE_AUTH_URL=https://services.entrade.com.vn/dnse-user-service/api/auth
DNSE_ME_URL=https://services.entrade.com.vn/dnse-user-service/api/me
DNSE_MQTT_HOST=datafeed-lts.dnse.com.vn
DNSE_MQTT_PORT=443
DNSE_MQTT_WS_PATH=/wss
REALTIME_LEADER_LOCK_TTL=30
REALTIME_LEADER_RENEW_SECONDS=10
REALTIME_TOKEN_REFRESH_HOURS=7
REALTIME_SUBSCRIBE_POLL_SECONDS=1.5
REALTIME_FALLBACK_POLL_SECONDS=2.0
REALTIME_MAX_SYMBOLS=200
REALTIME_WS_MAX_SYMBOLS_PER_CONN=100
```

---

## 12. Type TypeScript: `interface AppConfig`

```ts
// ── Union literal types ───────────────────────
/** APP_ENV là string tự do ở bản Python; chỉ 3 literal dưới đây có ý nghĩa với code. */
export type AppEnv = 'development' | 'production' | 'testing' | 'test' | (string & {});

/** Giá trị hợp lệ của DNSE_TRANSPORT (được .trim().toLowerCase() trước khi so sánh). */
export type DnseTransport = 'auto' | 'openapi' | 'mqtt';

/** LOG_LEVEL — giá trị lạ im lặng fallback về 'INFO'. */
export type LogLevel = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | (string & {});

/** Cú pháp rate-limit của slowapi/limits, ví dụ '60/minute'. */
export type RateLimitRule = string;

export interface AppConfig {
  // ── Application ─────────────────────────────
  APP_NAME: string;                                  // 'IQX'
  APP_VERSION: string;                               // '0.1.0'
  APP_ENV: AppEnv;                                   // 'development'
  DEBUG: boolean;                                    // false

  // ── Database (bắt buộc) ─────────────────────
  DATABASE_URL: string;

  // ── JWT (2 biến đầu bắt buộc) ───────────────
  JWT_SECRET_KEY: string;
  JWT_REFRESH_SECRET_KEY: string;
  JWT_ALGORITHM: string;                             // 'HS256'
  ACCESS_TOKEN_EXPIRE_MINUTES: number;               // 30
  REFRESH_TOKEN_EXPIRE_DAYS: number;                 // 7

  // ── CORS (chuỗi CSV thô) ────────────────────
  CORS_ORIGINS: string;                              // 'http://localhost:3000'
  CORS_METHODS: string;                              // 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
  CORS_HEADERS: string;                              // 'Authorization,Content-Type,Accept'

  // ── API Docs ────────────────────────────────
  /** null = auto (bật ở non-prod, tắt ở prod). */
  ENABLE_API_DOCS: boolean | null;                   // null

  // ── SePay ───────────────────────────────────
  SEPAY_MERCHANT_ID: string;                         // ''
  SEPAY_SECRET_KEY: string;                          // ''
  SEPAY_CHECKOUT_URL: string;                        // sandbox URL
  APP_PUBLIC_URL: string;                            // 'http://localhost:3000'

  // ── Email / Resend ──────────────────────────
  RESEND_API_KEY: string;                            // ''
  EMAIL_ENABLED: boolean;                            // false
  EMAIL_FROM: string;                                // 'IQX <no-reply@iqx.vn>'
  EMAIL_LINK_BASE_URL: string;                       // '' -> fallback APP_PUBLIC_URL
  EMAIL_VERIFY_TOKEN_TTL_HOURS: number;              // 48
  PASSWORD_RESET_TOKEN_TTL_HOURS: number;            // 2

  // ── Logging ─────────────────────────────────
  LOG_LEVEL: LogLevel;                               // 'INFO'

  // ── Market Data ─────────────────────────────
  MARKET_DATA_TIMEOUT_SECONDS: number;               // 15.0  (dead config)
  MARKET_DATA_CACHE_ENABLED: boolean;                // true  (dead config)
  MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS: number;   // 3600  (dead config)
  MARKET_DATA_CACHE_TTL_REALTIME_SECONDS: number;    // 10    (dead config)
  MARKET_DATA_CACHE_TTL_HISTORY_SECONDS: number;     // 300   (dead config)
  MARKET_DATA_CACHE_MAX_SIZE: number;                // 1000

  // ── Rate Limiting ───────────────────────────
  RATE_LIMIT_DEFAULT: RateLimitRule;                 // '60/minute'
  RATE_LIMIT_AUTH: RateLimitRule;                    // '10/minute'
  RATE_LIMIT_MARKET_DATA: RateLimitRule;             // '120/minute'

  // ── AI Proxy ────────────────────────────────
  AI_PROXY_BASE_URL: string;                         // ''
  AI_PROXY_MODEL: string;                            // 'deepseek-v4-flash'
  AI_PROXY_API_KEY: string;                          // ''
  AI_PROXY_TIMEOUT_SECONDS: number;                  // 120.0

  // ── Symbol Seed ─────────────────────────────
  SIMPLIZE_LOGO_BASE_URL: string;                    // CDN Simplize

  // ── Redis ───────────────────────────────────
  REDIS_URL: string;                                 // 'redis://localhost:6379/0'
  REDIS_ENABLED: boolean;                            // false
  REDIS_DEFAULT_TTL_SECONDS: number;                 // 300
  REDIS_TTL_REALTIME_SECONDS: number;                // 15
  REDIS_TTL_REFERENCE_SECONDS: number;               // 3600
  REDIS_TTL_OVERVIEW_SECONDS: number;                // 30
  REDIS_TTL_MACRO_SECONDS: number;                   // 900
  REDIS_TTL_NEWS_SECONDS: number;                    // 300
  REDIS_TTL_AI_DASHBOARD_SECONDS: number;            // 60
  REDIS_TTL_AI_INDUSTRY_SECONDS: number;             // 600
  REDIS_TTL_AI_ANALYSIS_SECONDS: number;             // 1800 (không còn được đọc)
  REDIS_TTL_SHEETS_SECONDS: number;                  // 600

  // ── Google Sheets ───────────────────────────
  GOOGLE_SHEETS_API_KEY: string;                     // ''

  // ── Background Jobs ─────────────────────────
  JOBS_ENABLED: boolean;                             // true

  // ── Telegram / Alerts ───────────────────────
  TELEGRAM_BOT_TOKEN: string;                        // ''
  TELEGRAM_BOT_USERNAME: string;                     // ''
  TELEGRAM_WEBHOOK_SECRET: string;                   // ''
  ALERTS_ENABLED: boolean;                           // false
  ALERT_SCAN_INTERVAL_MINUTES: number;               // 10 (sàn 1)

  // ── Daily AI Market Analysis ────────────────
  MARKET_ANALYSIS_ENABLED: boolean;                  // false
  MARKET_ANALYSIS_CRON_HOUR: number;                 // 16 (ICT)
  MARKET_ANALYSIS_CRON_MINUTE: number;               // 30
  MARKET_ANALYSIS_RETRY_HOUR: number;                // 17 (ICT)
  MARKET_ANALYSIS_RETRY_MINUTE: number;              // 0

  // ── Mid-day AI Market Analysis ──────────────
  MIDDAY_ANALYSIS_ENABLED: boolean;                  // false
  MIDDAY_ANALYSIS_CRON_HOUR: number;                 // 11 (ICT)
  MIDDAY_ANALYSIS_CRON_MINUTE: number;               // 30

  // ── Pre-market AI Market Analysis ───────────
  PREMARKET_ANALYSIS_ENABLED: boolean;               // false
  PREMARKET_ANALYSIS_CRON_HOUR: number;              // 7 (ICT)
  PREMARKET_ANALYSIS_CRON_MINUTE: number;            // 15

  // ── International Data ──────────────────────
  INTL_DATA_ENABLED: boolean;                        // false

  // ── Lessons / Media ─────────────────────────
  LESSON_MEDIA_DIR: string;                          // './media'
  LESSON_MAX_PDF_MB: number;                         // 50
  LESSON_MAX_VIDEO_MB: number;                       // 500
  LESSON_MAX_THUMBNAIL_MB: number;                   // 5

  // ── Realtime / DNSE ─────────────────────────
  REALTIME_ENABLED: boolean;                         // false
  DNSE_TRANSPORT: DnseTransport;                     // 'auto'
  DNSE_USERNAME: string;                             // ''
  DNSE_PASSWORD: string;                             // ''
  DNSE_API_KEY: string;                              // ''
  DNSE_API_SECRET: string;                           // ''
  DNSE_OPENAPI_WS_URL: string;                       // 'wss://ws-openapi.dnse.com.vn/v1/stream'
  DNSE_AUTH_URL: string;                             // entrade /auth
  DNSE_ME_URL: string;                               // entrade /me
  DNSE_MQTT_HOST: string;                            // 'datafeed-lts.dnse.com.vn'
  DNSE_MQTT_PORT: number;                            // 443
  DNSE_MQTT_WS_PATH: string;                         // '/wss'
  REALTIME_LEADER_LOCK_TTL: number;                  // 30 (giây)
  REALTIME_LEADER_RENEW_SECONDS: number;             // 10 (giây)
  REALTIME_TOKEN_REFRESH_HOURS: number;              // 7 (giờ)
  REALTIME_SUBSCRIBE_POLL_SECONDS: number;           // 1.5 (giây)
  REALTIME_FALLBACK_POLL_SECONDS: number;            // 2.0 (giây)
  REALTIME_MAX_SYMBOLS: number;                      // 200
  REALTIME_WS_MAX_SYMBOLS_PER_CONN: number;          // 100
}

/** Các giá trị dẫn xuất, tính từ AppConfig (tương đương @property của Settings). */
export interface DerivedConfig {
  corsOriginsList: string[];
  corsMethodsList: string[];
  corsHeadersList: string[];
  isProduction: boolean;
  apiDocsEnabled: boolean;
}

export type ResolvedConfig = AppConfig & DerivedConfig;
```

---

## 13. Schema Zod validate env

```ts
import { z } from 'zod';

/**
 * Bool giống pydantic v2: true|True|TRUE|1|yes|on|y|t  /  false|0|no|off|n|f
 * Chuỗi rỗng => LỖI (đúng như bản Python).
 */
const zBool = z
  .string()
  .transform((raw, ctx) => {
    const v = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'y', 't'].includes(v)) return true;
    if (['false', '0', 'no', 'off', 'n', 'f'].includes(v)) return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Input should be a valid boolean, got ${JSON.stringify(raw)}` });
    return z.NEVER;
  });

const zBoolDefault = (d: boolean) => zBool.optional().transform((v) => (v === undefined ? d : v));

const zInt = (d: number) =>
  z.string().optional().transform((raw, ctx) => {
    if (raw === undefined) return d;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Input should be a valid integer, got ${JSON.stringify(raw)}` });
      return z.NEVER;
    }
    return n;
  });

const zFloat = (d: number) =>
  z.string().optional().transform((raw, ctx) => {
    if (raw === undefined) return d;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Input should be a valid number, got ${JSON.stringify(raw)}` });
      return z.NEVER;
    }
    return n;
  });

/** str có default; chuỗi rỗng LÀ hợp lệ và mang nghĩa "chưa cấu hình". */
const zStr = (d: string) => z.string().default(d);

export const envSchema = z.object({
  // Application
  APP_NAME: zStr('IQX'),
  APP_VERSION: zStr('0.1.0'),
  APP_ENV: zStr('development'),
  DEBUG: zBoolDefault(false),

  // Database — BẮT BUỘC
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT — 2 biến BẮT BUỘC
  JWT_SECRET_KEY: z.string().min(1, 'JWT_SECRET_KEY is required'),
  JWT_REFRESH_SECRET_KEY: z.string().min(1, 'JWT_REFRESH_SECRET_KEY is required'),
  JWT_ALGORITHM: zStr('HS256'),
  ACCESS_TOKEN_EXPIRE_MINUTES: zInt(30),
  REFRESH_TOKEN_EXPIRE_DAYS: zInt(7),

  // CORS
  CORS_ORIGINS: zStr('http://localhost:3000'),
  CORS_METHODS: zStr('GET,POST,PUT,DELETE,PATCH,OPTIONS'),
  CORS_HEADERS: zStr('Authorization,Content-Type,Accept'),

  // API Docs — undefined => null (auto); rỗng => lỗi
  ENABLE_API_DOCS: zBool.optional().transform((v) => (v === undefined ? null : v)),

  // SePay
  SEPAY_MERCHANT_ID: zStr(''),
  SEPAY_SECRET_KEY: zStr(''),
  SEPAY_CHECKOUT_URL: zStr('https://pay-sandbox.sepay.vn/v1/checkout/init'),
  APP_PUBLIC_URL: zStr('http://localhost:3000'),

  // Email / Resend
  RESEND_API_KEY: zStr(''),
  EMAIL_ENABLED: zBoolDefault(false),
  EMAIL_FROM: zStr('IQX <no-reply@iqx.vn>'),
  EMAIL_LINK_BASE_URL: zStr(''),
  EMAIL_VERIFY_TOKEN_TTL_HOURS: zInt(48),
  PASSWORD_RESET_TOKEN_TTL_HOURS: zInt(2),

  // Logging
  LOG_LEVEL: zStr('INFO'),

  // Market Data
  MARKET_DATA_TIMEOUT_SECONDS: zFloat(15.0),
  MARKET_DATA_CACHE_ENABLED: zBoolDefault(true),
  MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS: zInt(3600),
  MARKET_DATA_CACHE_TTL_REALTIME_SECONDS: zInt(10),
  MARKET_DATA_CACHE_TTL_HISTORY_SECONDS: zInt(300),
  MARKET_DATA_CACHE_MAX_SIZE: zInt(1000),

  // Rate Limiting
  RATE_LIMIT_DEFAULT: zStr('60/minute'),
  RATE_LIMIT_AUTH: zStr('10/minute'),
  RATE_LIMIT_MARKET_DATA: zStr('120/minute'),

  // AI Proxy
  AI_PROXY_BASE_URL: zStr(''),
  AI_PROXY_MODEL: zStr('deepseek-v4-flash'),
  AI_PROXY_API_KEY: zStr(''),
  AI_PROXY_TIMEOUT_SECONDS: zFloat(120.0),

  // Symbol Seed
  SIMPLIZE_LOGO_BASE_URL: zStr('https://cdn.simplize.vn/simplizevn/logo'),

  // Redis
  REDIS_URL: zStr('redis://localhost:6379/0'),
  REDIS_ENABLED: zBoolDefault(false),
  REDIS_DEFAULT_TTL_SECONDS: zInt(300),
  REDIS_TTL_REALTIME_SECONDS: zInt(15),
  REDIS_TTL_REFERENCE_SECONDS: zInt(3600),
  REDIS_TTL_OVERVIEW_SECONDS: zInt(30),
  REDIS_TTL_MACRO_SECONDS: zInt(900),
  REDIS_TTL_NEWS_SECONDS: zInt(300),
  REDIS_TTL_AI_DASHBOARD_SECONDS: zInt(60),
  REDIS_TTL_AI_INDUSTRY_SECONDS: zInt(600),
  REDIS_TTL_AI_ANALYSIS_SECONDS: zInt(1800),
  REDIS_TTL_SHEETS_SECONDS: zInt(600),

  // Google Sheets
  GOOGLE_SHEETS_API_KEY: zStr(''),

  // Background Jobs
  JOBS_ENABLED: zBoolDefault(true),

  // Telegram / Alerts
  TELEGRAM_BOT_TOKEN: zStr(''),
  TELEGRAM_BOT_USERNAME: zStr(''),
  TELEGRAM_WEBHOOK_SECRET: zStr(''),
  ALERTS_ENABLED: zBoolDefault(false),
  ALERT_SCAN_INTERVAL_MINUTES: zInt(10),

  // Daily AI Market Analysis
  MARKET_ANALYSIS_ENABLED: zBoolDefault(false),
  MARKET_ANALYSIS_CRON_HOUR: zInt(16),
  MARKET_ANALYSIS_CRON_MINUTE: zInt(30),
  MARKET_ANALYSIS_RETRY_HOUR: zInt(17),
  MARKET_ANALYSIS_RETRY_MINUTE: zInt(0),

  // Mid-day
  MIDDAY_ANALYSIS_ENABLED: zBoolDefault(false),
  MIDDAY_ANALYSIS_CRON_HOUR: zInt(11),
  MIDDAY_ANALYSIS_CRON_MINUTE: zInt(30),

  // Pre-market
  PREMARKET_ANALYSIS_ENABLED: zBoolDefault(false),
  PREMARKET_ANALYSIS_CRON_HOUR: zInt(7),
  PREMARKET_ANALYSIS_CRON_MINUTE: zInt(15),

  // International Data
  INTL_DATA_ENABLED: zBoolDefault(false),

  // Lessons / Media
  LESSON_MEDIA_DIR: zStr('./media'),
  LESSON_MAX_PDF_MB: zInt(50),
  LESSON_MAX_VIDEO_MB: zInt(500),
  LESSON_MAX_THUMBNAIL_MB: zInt(5),

  // Realtime / DNSE
  REALTIME_ENABLED: zBoolDefault(false),
  DNSE_TRANSPORT: zStr('auto'),
  DNSE_USERNAME: zStr(''),
  DNSE_PASSWORD: zStr(''),
  DNSE_API_KEY: zStr(''),
  DNSE_API_SECRET: zStr(''),
  DNSE_OPENAPI_WS_URL: zStr('wss://ws-openapi.dnse.com.vn/v1/stream'),
  DNSE_AUTH_URL: zStr('https://services.entrade.com.vn/dnse-user-service/api/auth'),
  DNSE_ME_URL: zStr('https://services.entrade.com.vn/dnse-user-service/api/me'),
  DNSE_MQTT_HOST: zStr('datafeed-lts.dnse.com.vn'),
  DNSE_MQTT_PORT: zInt(443),
  DNSE_MQTT_WS_PATH: zStr('/wss'),
  REALTIME_LEADER_LOCK_TTL: zInt(30),
  REALTIME_LEADER_RENEW_SECONDS: zInt(10),
  REALTIME_TOKEN_REFRESH_HOURS: zInt(7),
  REALTIME_SUBSCRIBE_POLL_SECONDS: zFloat(1.5),
  REALTIME_FALLBACK_POLL_SECONDS: zFloat(2.0),
  REALTIME_MAX_SYMBOLS: zInt(200),
  REALTIME_WS_MAX_SYMBOLS_PER_CONN: zInt(100),
})
// ── Validator production: cổng chặn secret placeholder ──
.superRefine((cfg, ctx) => {
  if (cfg.APP_ENV !== 'production') return;             // giống Python: chỉ chạy ở production

  const PLACEHOLDER =
    /change.in.production|changeme|replace.me|your.secret|CHANGE_ME|placeholder|^dev-|^test-|^default-|^secret$|^changethis$/i;

  // Thứ tự đúng như Python: JWT_SECRET_KEY trước, JWT_REFRESH_SECRET_KEY sau.
  for (const field of ['JWT_SECRET_KEY', 'JWT_REFRESH_SECRET_KEY'] as const) {
    const value = cfg[field];
    if (PLACEHOLDER.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} contains a placeholder value and must be changed before running in production (APP_ENV=production).`,
      });
      return; // fail-fast như Python (raise ngay ở field đầu tiên sai)
    }
    if (value.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is too short (${value.length} chars). Use at least 32 characters in production.`,
      });
      return;
    }
  }
});

export type EnvParsed = z.infer<typeof envSchema>;
```

Bootstrap + singleton + derived (tương đương `lru_cache`):

```ts
import 'dotenv/config'; // nạp <repo-root>/.env — xem ghi chú §15 về vị trí file

let cached: ResolvedConfig | null = null;

export function getConfig(): ResolvedConfig {
  if (cached) return cached;

  // case_sensitive=False ở Python: chuẩn hoá key env về UPPER_CASE trước khi parse.
  const upper: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) upper[k.toUpperCase()] = v;
  }

  const parsed = envSchema.safeParse(upper); // extra keys bị bỏ qua => tương đương extra="ignore"
  if (!parsed.success) {
    // Fail fast TRƯỚC khi mở listener.
    console.error('Invalid configuration:\n' + JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  const cfg = parsed.data;
  const isProduction = cfg.APP_ENV === 'production';

  cached = {
    ...cfg,
    corsOriginsList: splitCsv(cfg.CORS_ORIGINS),
    corsMethodsList: splitCsv(cfg.CORS_METHODS),
    corsHeadersList: splitCsv(cfg.CORS_HEADERS),
    isProduction,
    apiDocsEnabled: cfg.ENABLE_API_DOCS !== null ? cfg.ENABLE_API_DOCS : !isProduction,
  } as ResolvedConfig;

  return cached;
}

/** Chỉ dùng trong test — tương đương get_settings.cache_clear(). */
export function resetConfigForTests(): void {
  cached = null;
}
```

---

## 14. Checklist di trú & bẫy thường gặp

1. **Giữ nguyên tên biến.** Toàn bộ 93 tên phải khớp bản Python để dùng lại `.env` production. Đổi tên = phải đổi cấu hình hạ tầng (Coolify/systemd), rủi ro cao.
2. **Fail fast lúc bootstrap.** `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY` thiếu → thoát process, không mở port.
3. **Nhớ 3 flag hay bị quên bật.** `REDIS_ENABLED`, `JOBS_ENABLED`, và cặp `REALTIME_ENABLED + REDIS_ENABLED`. Ở production hiện tại các flag AI (`MARKET_ANALYSIS_ENABLED`, `MIDDAY_ANALYSIS_ENABLED`, `PREMARKET_ANALYSIS_ENABLED`) và `INTL_DATA_ENABLED`, `ALERTS_ENABLED` phải được bật tường minh vì default là `false`.
4. **Đừng để bool rỗng.** `ENABLE_API_DOCS=` làm crash startup; muốn auto thì xoá dòng.
5. **`DATABASE_URL` phải chuẩn hoá** (bỏ `+asyncpg`) hoặc đổi env — chọn 1 và ghi vào runbook (§7.4).
6. **CORS là CSV chuỗi, không phải JSON array.** Nếu đổi sang JSON sẽ phá `.env` production hiện tại.
7. **Rate limit là in-memory per-process.** Nếu bản TS chạy nhiều instance/cluster mà vẫn dùng bộ đếm in-memory thì hiệu lực limit khác bản Python; nếu chuyển sang Redis-backed thì đó là **thay đổi hành vi**, phải ghi changelog.
8. **Scheduler giả định 1 worker.** Bản TS nếu chạy nhiều replica phải bọc job bằng Postgres advisory lock. Ưu tiên `pg_advisory_xact_lock` (lock theo transaction) thay vì lock theo session — lock session-level từng gây rò rỉ khiến cron bị skip vĩnh viễn.
9. **Timezone.** Scheduler chạy nền UTC nhưng mọi cron nghiệp vụ dùng `Asia/Ho_Chi_Minh`. Ở TS phải chỉ định timezone tường minh cho từng cron, đừng dựa vào TZ của container.
10. **Đừng log secret.** Các setting `*_SECRET*`, `*_KEY*`, `*_TOKEN*`, `*_PASSWORD` không được xuất hiện trong log hay response. Endpoint `/health` và `SystemStatus` hiện chỉ trả `APP_NAME`, `APP_VERSION`, `APP_ENV` — giữ đúng mức đó.
11. **Dead config (§10) giữ trong schema nhưng đừng nối vào logic** nếu muốn port 1-1.
12. **Vị trí file `.env`.** Python neo vào `parents[2]` của `app/core/config.py` (tức repo root), độc lập CWD. Ở TS, `dotenv` mặc định đọc `.env` theo **CWD** — nếu process chạy từ thư mục khác sẽ không thấy file. Hãy chỉ định tường minh: `dotenv.config({ path: path.resolve(__dirname, '../../.env') })` (điều chỉnh theo layout `dist/`).

---

## 15. Điểm chưa xác định

- **Giá trị env production thực tế** không nằm trong repo (file `backend/.env` local chỉ có 27 biến, phần lớn là dev). Muốn biết production đang bật flag nào, cần đọc cấu hình trên host Coolify — CHƯA XÁC ĐỊNH từ source.
- **`REDIS_TTL_AI_ANALYSIS_SECONDS`**: chỉ chắc chắn rằng không còn code nào đọc và TTL thật do `_get_analysis_ttl()` tính. Chi tiết đầy đủ hàm `_ttl_until_end_of_session()` (mốc 15:00, sàn 3600s) — cần đọc `app/services/ai/analysis_service.py` nếu chương AI cần chính xác từng nhánh.
- **`pool_size` / `max_overflow`** hard-code `10` / `20`, không có env. Nếu bản TS muốn cấu hình được thì đó là biến **mới**, không có tương đương trong bản gốc.
