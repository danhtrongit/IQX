# Quy ước API chung

Chương này mô tả **nền tảng mà mọi endpoint của backend IQX tuân theo**: base URL, thứ tự
middleware, CORS, request-id, rate limiting, hợp đồng lỗi, phân trang, và cách serialize
dữ liệu. Đây là hợp đồng phải giữ nguyên khi viết lại bằng TypeScript/NestJS — sai một
chi tiết ở đây thì cả 293 endpoint sai theo.

> **Lưu ý về con số**: các thống kê trong chương này (193 endpoint có security, 205 khai báo 422…) đếm trên **291 operation hiện trong OpenAPI**. Hệ thống còn **2 route ẩn** (`include_in_schema=False`) không nằm trong các thống kê đó — xem ch20 và ch90. Mọi con số/tên field trong chương này đọc trực
tiếp từ source hoặc kiểm chứng bằng cách chạy thật (`TestClient`) — chỗ nào chưa xác định
đều được ghi rõ.

---

## 1. Base URL, versioning và các mount cấp gốc

Toàn bộ REST API nằm dưới **một** prefix duy nhất: `/api/v1`.

- `app/api/v1/router.py` tạo `APIRouter(prefix="/api/v1")` rồi `include_router(...)` cho **40
  router con** (health, auth, users, premium, market_data, market_global, market_analysis,
  realtime_ws, virtual_trading, ai_analysis, ai_patterns, ai_forecast, watchlist,
  chart_drawings, backtest, alerts, admin_alerts, telegram, lessons, admin_lessons,
  admin_metrics, admin_payments, admin_subscriptions, admin_audit, admin_users, admin_vt,
  admin_ipn, admin_system, portfolio_manager, cap0…cap8).
- `app/main.py` chỉ `app.include_router(api_v1_router)` — **không có router nào ở gốc `/`**,
  và **không có route `/`**. Gọi `GET /` trả 404.
- **Không có `servers[]`** trong OpenAPI (kiểm chứng: `app.openapi()["servers"]` là `None`),
  nên client tự ghép host.

### 1.1 Danh sách đầy đủ các path KHÔNG nằm dưới `/api/v1`

Kiểm chứng bằng cách duyệt `app.routes` — chỉ có 5 mục:

| Path | Loại | Method | Điều kiện tồn tại |
|---|---|---|---|
| `/openapi.json` | Route | GET, HEAD | chỉ khi `settings.api_docs_enabled` |
| `/docs` | Route | GET, HEAD | chỉ khi `settings.api_docs_enabled` |
| `/docs/oauth2-redirect` | Route | GET, HEAD | chỉ khi `settings.api_docs_enabled` |
| `/redoc` | Route | GET, HEAD | chỉ khi `settings.api_docs_enabled` |
| `/media` | Mount (StaticFiles) | — | **luôn luôn** |

### 1.2 Mount `/media` — static file, không xác thực

```
media_dir = Path(settings.LESSON_MEDIA_DIR)   # default "./media"
media_dir.mkdir(parents=True, exist_ok=True)  # tạo thư mục nếu chưa có, khi khởi động
app.mount("/media", StaticFiles(directory=media_dir), name="media")
```

Hành vi phải giữ nguyên:

1. Thư mục được **tạo tự động lúc khởi động app** (`create_app()`), không đợi request đầu tiên.
2. `LESSON_MEDIA_DIR` mặc định `"./media"` — **đường dẫn tương đối theo CWD của process**.
   Trên production giá trị này được đặt bằng env (theo comment trong
   `app/services/lesson/storage.py`: `/www/wwwroot/iqx.vn/media`).
3. `MediaStorage.public_url()` sinh URL dạng `/media/courses/{course_id}/{filename}`, và
   `from_url()` chỉ nhận URL bắt đầu bằng `/media/` rồi **kiểm tra path traversal** bằng
   `resolve()` + `relative_to(base)`; nếu ra ngoài base thì trả `None`.
4. **Không có auth guard trên `/media`** — bất kỳ ai có URL đều tải được file bài học.
   Đây là hành vi hiện tại, không phải bug cần sửa trong bản viết lại (nếu muốn siết thì
   phải quyết định riêng).
5. `/media` **được miễn rate limit** (xem §6.6).

### 1.3 WebSocket

Duy nhất **1** WebSocket endpoint: `GET(ws) /api/v1/market-data/ws`
(`app/api/v1/endpoints/realtime_ws.py`, `@router.websocket("/market-data/ws")`).
Nó **không đi qua** RequestIDMiddleware / SlowAPIMiddleware / CORSMiddleware vì cả ba đều là
`BaseHTTPMiddleware` (chỉ xử lý scope `"http"`). Nếu `REALTIME_ENABLED=false` thì server
`ws.close(code=1013)` ngay (không accept). Chi tiết protocol nằm ở chương realtime.

---

## 2. OpenAPI docs — logic bật/tắt chính xác

`create_app()` gán ba URL theo **một** cờ duy nhất:

```
docs_url    = "/docs"         if settings.api_docs_enabled else None
redoc_url   = "/redoc"        if settings.api_docs_enabled else None
openapi_url = "/openapi.json" if settings.api_docs_enabled else None
```

`api_docs_enabled` là property trong `app/core/config.py`:

```
if ENABLE_API_DOCS is not None:   -> trả đúng ENABLE_API_DOCS
else:                             -> trả (not is_production)
is_production = (APP_ENV == "production")
```

Diễn giải cho bản TS:

| `ENABLE_API_DOCS` | `APP_ENV` | Docs bật? |
|---|---|---|
| không set (null) | `production` | **KHÔNG** |
| không set (null) | bất kỳ khác (`development`, `staging`, `testing`…) | CÓ |
| `true` | `production` | CÓ (override có chủ ý) |
| `false` | `development` | KHÔNG |

Lưu ý: `ENABLE_API_DOCS: bool | None = None` — **tri-state**, không phải boolean thường.
Trong TS phải là `boolean | null` với default `null`, không được default `false`.

Metadata OpenAPI (kiểm chứng từ `app.openapi()`):

| Trường | Giá trị |
|---|---|
| `openapi` | `3.1.0` |
| `info.title` | `` `${APP_NAME} API` `` → `"IQX API"` |
| `info.version` | `APP_VERSION` → `"0.1.0"` |
| `info.description` | `"IQX Backend API — Ứng dụng FastAPI sẵn sàng cho môi trường sản xuất"` |
| `components.securitySchemes` | chỉ một: `HTTPBearer` = `{type:"http", scheme:"bearer"}` |

Trong 291 operation: **193** operation có `security: [{HTTPBearer: []}]`, **98** operation không
có (public). Hai route `GET /api/v1/auth/verify-email` và `GET /api/v1/auth/reset-password`
dùng `include_in_schema=False` nên **không xuất hiện trong OpenAPI** (đó là 2 trang HTML cho
email, không phải API).

---

## 3. Middleware stack — thứ tự THẬT (khác với comment trong source)

### 3.1 Cảnh báo quan trọng

Trong `app/main.py` có comment nói RequestIDMiddleware được add **sau** CORS để "bọc ngoài
cùng". Comment này **đã lỗi thời và sai**: sau đó `SlowAPIMiddleware` mới được add (dòng 140),
nên nó chiếm vị trí ngoài cùng, không phải RequestID.

Thứ tự gọi `add_middleware` trong `create_app()`:

1. `CORSMiddleware` (dòng ~114)
2. `RequestIDMiddleware` (dòng ~124)
3. `SlowAPIMiddleware` (dòng ~140)

Starlette `add_middleware` **insert vào đầu** list, và list được bọc sao cho **phần tử đầu là
ngoài cùng** ⇒ cái add **sau cùng** thành ngoài cùng.

### 3.2 Sơ đồ thứ tự thật (kiểm chứng bằng `app.build_middleware_stack()`)

```
   Request đi vào
        │
        ▼
┌──────────────────────────────────────────────────┐
│ 0. ServerErrorMiddleware        (Starlette)      │  bắt exception chưa xử lý -> 500
│ ┌──────────────────────────────────────────────┐ │
│ │ 1. SlowAPIMiddleware          (slowapi)      │ │  <-- NGOÀI CÙNG trong user middleware
│ │ ┌──────────────────────────────────────────┐ │ │      (kiểm tra default limit, có thể
│ │ │ 2. RequestIDMiddleware  (app.core)       │ │ │       short-circuit 429 tại đây)
│ │ │ ┌──────────────────────────────────────┐ │ │ │
│ │ │ │ 3. CORSMiddleware   (Starlette)      │ │ │ │  <-- TRONG CÙNG trong user middleware
│ │ │ │ ┌──────────────────────────────────┐ │ │ │ │      (xử lý preflight OPTIONS ở đây)
│ │ │ │ │ 4. ExceptionMiddleware           │ │ │ │ │  áp dụng exception handlers
│ │ │ │ │ 5. AsyncExitStackMiddleware      │ │ │ │ │  (FastAPI, dọn dependency)
│ │ │ │ │ 6. APIRouter -> endpoint         │ │ │ │ │
│ │ │ │ └──────────────────────────────────┘ │ │ │ │
│ │ │ └──────────────────────────────────────┘ │ │ │
│ │ └──────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 3.3 Ba hệ quả BẮT BUỘC phải tái tạo

**(a) 429 từ default limit KHÔNG có CORS header và KHÔNG có `X-Request-ID`.**
SlowAPIMiddleware ở ngoài cùng nên response 429 nó tạo ra không đi qua RequestID hay CORS.
Kiểm chứng thật (61 request liên tiếp tới `GET /api/v1/premium/plans` với `Origin` hợp lệ):

```
status  : 429
body    : {"error":"Rate limit exceeded: 60 per 1 minute"}
headers : content-length, content-type      <-- CHỈ CÓ HAI HEADER NÀY
```

⇒ Trình duyệt nhìn thấy đây là **lỗi CORS**, không đọc được status 429.

**(b) 429 từ endpoint có `@limiter.limit(...)` thì CÓ đủ header.**
Decorator kiểm tra limit **bên trong handler**, exception nổi lên `ExceptionMiddleware` (lớp
4) rồi response đi ngược ra qua CORS + RequestID. Kiểm chứng thật (11 request tới
`POST /api/v1/auth/login`):

```
status  : 429
body    : {"error":"Rate limit exceeded: 10 per 1 minute"}
headers : content-type, access-control-allow-credentials,
          access-control-allow-origin, vary, x-request-id
```

⇒ Hai loại 429 **khác nhau về header**. Bản TS phải quyết định: hoặc tái tạo y nguyên sự
bất đối xứng này, hoặc chuẩn hoá (nếu chuẩn hoá thì phải ghi vào changelog vì frontend có
thể đang bắt lỗi khác nhau ở hai đường).

**(c) Preflight `OPTIONS` VẪN có `X-Request-ID`.** CORSMiddleware nằm **trong** RequestID nên
mọi response preflight (kể cả 400 do bị từ chối) đều được gắn `X-Request-ID`.

---

## 4. CORS

### 4.1 Env điều khiển và cách parse

| Env | Kiểu | Default trong code | Cách parse |
|---|---|---|---|
| `CORS_ORIGINS` | `str` | `"http://localhost:3000"` | `cors_origins_list`: split `,` → `strip()` → bỏ phần tử rỗng |
| `CORS_METHODS` | `str` | `"GET,POST,PUT,DELETE,PATCH,OPTIONS"` | `cors_methods_list`: cùng thuật toán |
| `CORS_HEADERS` | `str` | `"Authorization,Content-Type,Accept"` | `cors_headers_list`: cùng thuật toán |

Cả ba là **chuỗi phẳng phân tách bằng dấu phẩy**, KHÔNG phải JSON array. Trong bản TS phải
parse hệt như vậy (`s.split(",").map(x => x.trim()).filter(Boolean)`), vì file `.env` thật
đang chứa:

```
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

### 4.2 Quy tắc an toàn với wildcard

```
origins = settings.cors_origins_list
allow_credentials = True
if "*" in origins and allow_credentials:
    logger.warning("CORS: allow_credentials=True with wildcard origins is insecure, disabling credentials")
    allow_credentials = False
```

Hành vi: `allow_credentials` **mặc định luôn `True`**; chỉ khi danh sách origins **chứa đúng
phần tử `"*"`** thì tự động hạ xuống `False` **và ghi một log WARNING** (nội dung log ở trên —
giữ nguyên để ops grep được). Lưu ý: điều kiện là phần tử `"*"` trong list, không phải
substring `*` trong chuỗi.

### 4.3 Những gì KHÔNG được cấu hình

- **`expose_headers` không được set** ⇒ không có `Access-Control-Expose-Headers` trên response
  ⇒ **JavaScript trên trình duyệt KHÔNG đọc được `X-Request-ID`** dù server luôn gửi. Nếu
  frontend cần đọc request-id để báo lỗi, bản TS phải thêm `expose_headers: ["X-Request-ID"]`
  (đây là thay đổi có chủ ý, không phải parity).
- **`max_age` không được set** ⇒ dùng default của Starlette = **600 giây** (kiểm chứng:
  response preflight có `access-control-max-age: 600`).
- **`allow_origin_regex` không dùng** — chỉ khớp origin chính xác theo list.

### 4.4 Hành vi thực đo được

`allow_headers` hiệu dụng = danh sách cấu hình **hợp** với safelist của Starlette. Preflight
trả về: `Accept, Accept-Language, Authorization, Content-Language, Content-Type`.

| Tình huống | Kết quả thật |
|---|---|
| `OPTIONS` + Origin hợp lệ + `Access-Control-Request-Headers: Content-Type,Authorization` | `200`, body `"OK"` |
| `OPTIONS` + Origin hợp lệ + `Access-Control-Request-Headers: X-Request-ID` | **`400`, body `"Disallowed CORS headers"`** |
| `OPTIONS` + Origin không có trong list | **`400`, body `"Disallowed CORS origin"`** |
| `GET` thường + Origin không có trong list | `200` bình thường, response **không có** `access-control-allow-origin` (chỉ có `access-control-allow-credentials`) — trình duyệt tự chặn |

**Cái bẫy lớn**: `X-Request-ID` **không nằm trong `CORS_HEADERS` mặc định**, nên client trong
trình duyệt **không thể tự gửi** header này (preflight 400). Chỉ server-to-server hoặc client
không bị CORS mới gửi được. Nếu bản TS muốn cho client truyền request-id xuyên suốt thì phải
bổ sung `X-Request-ID` vào `CORS_HEADERS`.

---

## 5. Header `X-Request-ID`

Nguồn: `app/core/request_id.py`. Hằng số tên header: `HEADER = "X-Request-ID"`.

Thuật toán (`RequestIDMiddleware.dispatch`), giữ nguyên 4 bước:

1. Đọc `request.headers.get("X-Request-ID")`.
2. Nếu **thiếu hoặc rỗng** (`or` của Python: chuỗi rỗng cũng bị coi là thiếu) → sinh
   `str(uuid.uuid4())`.
3. Gán vào `request.state.request_id` (để downstream đọc).
4. Sau khi có response: `response.headers["X-Request-ID"] = req_id` — **luôn echo lại**, kể cả
   khi client tự gửi (echo đúng giá trị client gửi, không sinh mới).

Giá trị **không được validate** — client gửi gì thì echo lại nguyên xi (không kiểm tra định
dạng UUID, không giới hạn độ dài ở middleware). Lưu ý cột DB chỉ chứa 40 ký tự (xem dưới).

### 5.1 Ai tiêu thụ `request.state.request_id`

Duy nhất một consumer trong code: **audit log của admin** (`app/api/deps_audit.py`).
`get_audit_context()` dựng `AuditContext` với thứ tự fallback **3 bậc**:

```
request_id = request.state.request_id
          ?? request.headers["x-request-id"]
          ?? str(uuid4())
```

`AuditContext` gồm: `admin_id`, `ip` (`request.client.host` hoặc `null`),
`user_agent` (`request.headers["user-agent"]`), `request_id`.

Giá trị được ghi xuống bảng `admin_audit_log`, cột `request_id VARCHAR(40) NULL`
(`app/models/admin_audit.py`). **Giới hạn 40 ký tự** — UUID4 dạng chuỗi là 36 ký tự nên vừa,
nhưng request-id do client gửi dài hơn 40 sẽ làm INSERT lỗi. Bản TS nên truncate về 40 ký tự
trước khi ghi DB (hành vi hiện tại là để lỗi nổi lên — CHƯA XÁC ĐỊNH có test nào phủ; nếu cần
parity tuyệt đối thì không truncate).

`app/core/logging.py` **KHÔNG** đưa request_id vào format log. Format hiện tại:

```
%(asctime)s | %(levelname)-8s | %(name)s | %(message)s      datefmt=%Y-%m-%d %H:%M:%S
```

Handler: `StreamHandler(sys.stdout)`; level từ `LOG_LEVEL` (default `INFO`, `getattr` fallback
về `INFO` nếu tên level sai); `root.handlers.clear()` trước khi add (chống nhân bản khi reload);
hai logger bị hạ xuống `WARNING`: `sqlalchemy.engine`, `uvicorn.access`.

---

## 6. Rate limiting (slowapi)

Nguồn: `app/core/rate_limit.py` + `SlowAPIMiddleware` trong `main.py`.
Thư viện: `slowapi>=0.1.9`.

### 6.1 Cấu hình Limiter

```
_enabled = settings.APP_ENV not in ("testing", "test")

limiter = Limiter(
    key_func       = get_remote_address,
    default_limits = [settings.RATE_LIMIT_DEFAULT],
    storage_uri    = "memory://",
    enabled        = _enabled,
)
```

| Thuộc tính | Giá trị | Ghi chú |
|---|---|---|
| key theo | `get_remote_address` → `request.client.host`, fallback `"127.0.0.1"` nếu không có client | **KHÔNG** đọc `X-Forwarded-For`. Sau reverse proxy, mọi request cùng IP proxy ⇒ dùng chung một bucket. slowapi có `get_ipaddr` đọc XFF nhưng code **không dùng** |
| storage | `memory://` | **In-process**, không phải Redis ⇒ mỗi worker/replica có bucket riêng; restart là mất |
| strategy | `fixed-window` (default của slowapi, code không set) | |
| `headers_enabled` | **`False`** (default, code không set, `.env` không có `RATELIMIT_*`) | ⇒ **KHÔNG** phát `X-RateLimit-Limit/Remaining/Reset` và **KHÔNG** phát `Retry-After` |
| bật/tắt | tắt khi `APP_ENV ∈ {"testing", "test"}` | so sánh **chính xác chuỗi**, không lowercase |

### 6.2 Cách tạo khoá bucket — quan trọng

`key_style` để default `"url"`. Trong `_check_request_limit`:
`_endpoint_key = request["path"]`. Trong `__evaluate_limits`: `args = [limit_key, limit_scope]`
với `limit_key` = IP, `limit_scope` = path.

⇒ **Bucket = (IP client, path đầy đủ đã resolve)**, không phải per-IP toàn cục và cũng không
phải per-route-template. Hệ quả cụ thể:

- `/api/v1/market-data/quotes/VCB/intraday` và `/api/v1/market-data/quotes/FPT/intraday` là
  **hai bucket riêng biệt** (60 request/phút mỗi mã).
- `GET /api/v1/watchlist` và `POST /api/v1/watchlist` dùng **chung một bucket** (`per_method`
  mặc định `False`).
- Trailing slash tạo bucket khác: `/api/v1/users/` khác `/api/v1/users`.

### 6.3 Ba biến env limit

| Env | Default | Dùng ở đâu |
|---|---|---|
| `RATE_LIMIT_DEFAULT` | `"60/minute"` | limit mặc định áp cho **mọi** route không có decorator riêng |
| `RATE_LIMIT_AUTH` | `"10/minute"` | 5 endpoint auth (xem 6.4) |
| `RATE_LIMIT_MARKET_DATA` | `"120/minute"` | **đúng 1 endpoint** dù tên gợi ý cả nhóm |

`.env` hiện tại **không set** cả ba ⇒ đang chạy bằng default.

### 6.4 Toàn bộ endpoint có `@limiter.limit(...)` riêng

Grep `@limiter.limit` trên `app/` cho ra đúng **6** chỗ:

| Method + path | Limit dùng | Giá trị |
|---|---|---|
| `POST /api/v1/auth/register` | `_AUTH_LIMIT` | `RATE_LIMIT_AUTH` = 10/minute |
| `POST /api/v1/auth/login` | `_AUTH_LIMIT` | 10/minute |
| `POST /api/v1/auth/refresh` | `_AUTH_LIMIT` | 10/minute |
| `POST /api/v1/auth/forgot-password` | `_AUTH_LIMIT` | 10/minute |
| `POST /api/v1/auth/reset-password` | `_AUTH_LIMIT` | 10/minute |
| `POST /api/v1/market-data/trading/price-board` | `_MARKET_DATA_LIMIT` | `RATE_LIMIT_MARKET_DATA` = 120/minute |

Ghi chú hành vi:

- `_AUTH_LIMIT = get_settings().RATE_LIMIT_AUTH` đọc **một lần khi import module** (module-level
  constant) — đổi env lúc runtime không có tác dụng.
- Comment trong `auth.py` ghi rõ: dashboard admin **dùng chung** `POST /auth/login`, nên rate
  limit áp cả cho đăng nhập admin (hardening T35).
- `POST /api/v1/auth/logout` **KHÔNG** có decorator ⇒ chỉ chịu default 60/minute.
- slowapi decorator dùng `override_defaults=True` (default) ⇒ endpoint có decorator **chỉ**
  chịu limit riêng, **không** cộng thêm default 60/minute.
- Decorator yêu cầu handler có tham số `request: Request`. Đó là lý do 6 handler này có
  `request` ở đầu signature — trong NestJS không cần, guard tự lấy từ context.

### 6.5 Response 429 — hình dạng chính xác

`_rate_limit_exceeded_handler` của slowapi:

```
JSONResponse({"error": f"Rate limit exceeded: {exc.detail}"}, status_code=429)
```

`exc.detail = str(limit.limit)`, và `limits` render `"60/minute"` thành `"60 per 1 minute"`.

Body thật (kiểm chứng):

```json
{"error": "Rate limit exceeded: 60 per 1 minute"}
```
```json
{"error": "Rate limit exceeded: 10 per 1 minute"}
```

**Chú ý**: đây là **duy nhất** loại lỗi trong hệ thống dùng key `error` thay vì `detail`.
Mọi lỗi khác dùng `detail` (xem §7).

**Về `Retry-After`**: `_inject_headers()` bắt đầu bằng
`if self.enabled and self._headers_enabled and current_limit is not None`. Vì
`headers_enabled=False`, hàm này là **no-op** ⇒ **response 429 KHÔNG có `Retry-After`, cũng
không có `X-RateLimit-*`**. Kiểm chứng thật: header của 429 default chỉ gồm `content-length`
và `content-type`.

Nếu bản TS muốn phát `Retry-After` (khuyến nghị, vì client cần biết chờ bao lâu), đó là
**thay đổi có chủ ý** — phải ghi rõ, không phải parity.

### 6.6 Ai được miễn rate limit

`SlowAPIMiddleware._should_exempt()` trả `True` khi `_find_route_handler` không tìm ra handler
(route không có attribute `endpoint`). Hệ quả:

- **`/media/*` được miễn** — `Mount(StaticFiles)` không có `.endpoint`.
- **WebSocket `/api/v1/market-data/ws` được miễn** — `BaseHTTPMiddleware` bỏ qua scope non-http.
- `/docs`, `/redoc`, `/openapi.json` **KHÔNG** được miễn (là `Route` có `endpoint`) ⇒ chịu
  default 60/minute.
- Endpoint có decorator cũng "exempt" ở tầng middleware (`endpoint_func_name in _route_limits`)
  — vì decorator đã tự kiểm tra bên trong handler.

---

## 7. Hợp đồng lỗi (error contract) — 4 hình dạng khác nhau

Handler đã đăng ký (kiểm chứng bằng `app.exception_handlers`):

| Exception | Handler | Nguồn |
|---|---|---|
| `starlette.exceptions.HTTPException` | `http_exception_handler` | FastAPI default |
| `fastapi.exceptions.RequestValidationError` | `request_validation_exception_handler` | FastAPI default |
| `fastapi.exceptions.WebSocketRequestValidationError` | `websocket_request_validation_exception_handler` | FastAPI default |
| `app.core.exceptions.AppException` | `app_exception_handler` | **custom, trong `main.py`** |
| `slowapi.errors.RateLimitExceeded` | `_rate_limit_exceeded_handler` | slowapi |

### 7.1 Hình dạng A — `AppException` (lỗi nghiệp vụ)

```
{"detail": "<thông điệp tiếng Việt>", "code": "<MÃ_LỖI>"}
```

Handler custom:

```
JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code})
```

**Từng có bẫy ở đây (ĐÃ SỬA 2026-08-18)**: handler cũ **không copy `exc.headers`**, nên
`headers={"WWW-Authenticate": "Bearer"}` của `UnauthorizedError` bị mất trên mọi 401.
Nay handler truyền `headers=exc.headers`. Kiểm chứng thật
(`GET /api/v1/users/me` không token):

```
401  {"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}
headers: content-length, content-type, x-request-id, www-authenticate: Bearer
```

Bảng lớp lỗi (`app/core/exceptions.py`) — giữ nguyên cả status, `code`, và **thông điệp default
tiếng Việt**:

| Lớp | status | `code` | detail default |
|---|---|---|---|
| `NotFoundError(resource="Tài nguyên")` | 404 | `NOT_FOUND` | `` `Không tìm thấy ${resource}` `` |
| `ConflictError` | 409 | `CONFLICT` | `"Tài nguyên đã tồn tại"` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | `"Thông tin xác thực không hợp lệ"` |
| `ForbiddenError` | 403 | `FORBIDDEN` | `"Không đủ quyền truy cập"` |
| `BadRequestError` | 400 | `BAD_REQUEST` | `"Yêu cầu không hợp lệ"` |
| `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` | `"Dữ liệu không thể xử lý"` |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | `"Dịch vụ tạm thời không khả dụng"` |

Ba thông điệp thực tế hay gặp từ guard (`app/api/deps.py`):
`"Yêu cầu xác thực"` (401), `"Tài khoản chưa được kích hoạt"` (403),
`"Yêu cầu quyền quản trị viên"` (403), `"Yêu cầu gói Premium đang hoạt động"` (403).

### 7.2 Hình dạng B — `HTTPException` trần (không có `code`)

Rất nhiều endpoint market-data raise `HTTPException(status_code=..., detail=...)` trực tiếp
⇒ đi qua handler default của FastAPI ⇒ body **chỉ có `detail`**, **không có `code`**:

```json
{"detail": "Mã chứng khoán không hợp lệ: BADSYMBOL!!!"}
```

Route không tồn tại cũng theo dạng này: `404 {"detail":"Not Found"}`.

Status code thường dùng ở nhóm market-data:

| Status | Khi nào |
|---|---|
| 422 | validate mã CK / enum / định dạng ngày sai (raise thủ công, không phải Pydantic) |
| 502 | `RuntimeError` từ `fetch_with_fallback` / `fetch_from_registry` — mọi nguồn upstream chết, hoặc shape upstream sai |
| 503 | upstream lỗi tạm thời (ví dụ `AINewsUpstreamError`) |

### 7.3 Hình dạng C — lỗi validate của Pydantic/FastAPI (422)

`detail` là **array**, không phải string:

```json
{"detail":[{"type":"greater_than_equal","loc":["query","page"],
            "msg":"Input should be greater than or equal to 1",
            "input":"0","ctx":{"ge":1}}]}
```

Item có `loc: (string|number)[]`, `msg`, `type` bắt buộc; `input`, `ctx` optional.
**205 / 291 operation** khai báo response 422 trong OpenAPI.

### 7.4 Hình dạng D — rate limit (429)

`{"error": "..."}` — xem §6.5. Key là `error`, **không** `detail`.

### 7.5 Hình dạng E — webhook SePay tự trả JSON riêng

`POST /api/v1/premium/sepay/ipn` **không** dùng exception, mà `return JSONResponse(...)` với
body riêng: `{"error":"unauthorized"}` (401), `{"error":"invalid_json"}` (400),
`{"error":"invalid_payload"}` (400), hoặc `result` dict (200). Đây là hợp đồng với SePay,
không phải hợp đồng nội bộ — giữ nguyên tuyệt đối.

### 7.6 Exception chưa xử lý → 500

`ServerErrorMiddleware` (ngoài cùng) trả 500. Vì nó ở **ngoài** RequestID và CORS ⇒ 500 do
crash **không có `X-Request-ID`, không có CORS header**. Với `DEBUG=true` Starlette in
traceback ra response; production thì không.

---

## 8. Xác thực — tóm tắt ở mức quy ước

Chi tiết ở chương auth; ở đây chỉ ghi phần thuộc "quy ước chung":

- Scheme duy nhất: `Authorization: Bearer <access_token>` (`HTTPBearer(auto_error=False)`).
  `auto_error=False` ⇒ khi thiếu header, FastAPI **không** tự trả 403; code tự raise
  `UnauthorizedError("Yêu cầu xác thực")` ⇒ **401**, không phải 403.
- Không dùng cookie, không dùng API key header cho API chính (webhook SePay và Telegram có
  cơ chế riêng).
- 4 alias dependency định nghĩa toàn bộ ma trận quyền (`app/api/deps.py`):

| Alias | Kiểm tra | Lỗi nếu fail |
|---|---|---|
| `CurrentUser` | token hợp lệ **và** `user.is_active` | 401 hoặc 403 `"Tài khoản chưa được kích hoạt"` |
| `AdminUser` | `CurrentUser` **và** `role == ADMIN` | 403 `"Yêu cầu quyền quản trị viên"` |
| `PremiumUser` | `CurrentUser` **và** `is_premium_active` (admin luôn pass) | 403 `"Yêu cầu gói Premium đang hoạt động"` |
| `DBSession` | — | — |

Thứ tự kiểm tra là **tuần tự và có ý nghĩa**: token → active → role/premium. Bản TS phải giữ
đúng thứ tự để status code khớp.

---

## 9. Content types

### 9.1 Mặc định: `application/json`

Toàn bộ REST API nhận và trả JSON, charset UTF-8. **Không** dùng `application/xml`,
không dùng `application/x-www-form-urlencoded` (kể cả login — `POST /auth/login` nhận JSON
body `LoginRequest`, **không** phải OAuth2 form).

### 9.2 `multipart/form-data` — đúng 2 endpoint (upload bài học)

Grep `UploadFile` trên `app/api/v1/endpoints/` chỉ ra 2 chỗ (`admin_lessons.py`):

| Endpoint | Field | Response |
|---|---|---|
| `POST /api/v1/admin/lessons/courses/{course_id}/thumbnail` | `file` (`UploadFile`) | `CourseResponse` (JSON) |
| `POST /api/v1/admin/lessons/episodes/{episode_id}/file` | `file` (`UploadFile`) | `EpisodeAdminBrief` (JSON) |

Giới hạn kích thước lấy từ env, kiểm tra ở tầng service (chương lessons):
`LESSON_MAX_PDF_MB=50`, `LESSON_MAX_VIDEO_MB=500`, `LESSON_MAX_THUMBNAIL_MB=5`.
Ghi file dùng `write_atomic` (`.tmp` rồi `os.replace`).

### 9.3 `text/csv` — đúng 1 endpoint

`GET /api/v1/admin/users/export` (`admin_users.py`):

- `StreamingResponse(svc.stream_csv(...), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})`
- `filename = f"users-{utcnow:%Y%m%d-%H%M%S}.csv"`
- **Chặn trước khi stream**: đếm số dòng, nếu `> EXPORT_MAX_ROWS = 50_000` thì raise
  `BadRequestError` ⇒ **400** với body JSON (`{"detail":..., "code":"BAD_REQUEST"}`).
  Comment trong code nói rõ vì sao phải pre-check: raise giữa stream sẽ làm response vỡ.
- Header CSV (đúng thứ tự cột):
  `id, email, full_name, phone_e164, role, status, is_email_verified, last_login_at, created_at`
- Stream theo lô 500 dòng, encode UTF-8.
- Side-effect: ghi audit `action="user.export"` với `after={"row_count": total, "filters": ...}`
  **trước khi** yield dòng đầu tiên.
- **Lưu ý OpenAPI**: endpoint không khai `response_class` nên spec vẫn ghi
  `application/json` — spec **sai**, thực tế là `text/csv`.

### 9.4 `text/html` — 2 trang cho luồng email

| Endpoint | Ghi chú |
|---|---|
| `GET /api/v1/auth/verify-email?token=...` | `response_class=HTMLResponse`, `include_in_schema=False`. 200 = trang thành công; **400** = trang lỗi `"Liên kết xác thực không hợp lệ hoặc đã hết hạn."` |
| `GET /api/v1/auth/reset-password?token=...` | `response_class=HTMLResponse`, `include_in_schema=False`. Trả form đặt lại mật khẩu (`reset_form_page(token)`) |

Đây là HTML server-render (`app/services/email_templates.py`), không phải API.

### 9.5 Stream / audio — KHÔNG có endpoint nào stream nhị phân

`GET /api/v1/market-data/news/ai/audio/{news_id}` trả **JSON** `{"data": audio, "source_url": url}`
chứa **URL audio**, chứ **không** proxy bytes audio. `news_id` bị ràng buộc
`minLength=1, maxLength=100, pattern=^[a-zA-Z0-9._-]+$`.

Ngoài `admin/users/export`, **không có** endpoint nào trả `text/event-stream`,
`application/octet-stream`, hay audio/video stream. File media được phục vụ tĩnh qua `/media`.

---

## 10. Phân trang — KHÔNG nhất quán, phải chép từng chỗ

Đây là phần dễ làm sai nhất. Hệ thống có **6 kiểu phân trang khác nhau**. Không được "chuẩn
hoá" khi viết lại nếu muốn frontend chạy không sửa.

### 10.1 Kiểu 1 (chuẩn) — `page` + `page_size`, wrapper `PaginatedResponse`

Tham số: `page` (default `1`, `ge=1`, **không có max**), `page_size` (default và max thay đổi
theo endpoint). Response (`app/schemas/common.py`):

```ts
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;   // ceil(total / page_size), = 0 khi total === 0
}
```

Công thức `total_pages` xuất hiện 2 biến thể tương đương trong code, cả hai đều trả `0` khi
`total === 0`: `math.ceil(total / page_size)` và `(total + page_size - 1) // page_size`.

| Endpoint | `page_size` default | max |
|---|---|---|
| `GET /api/v1/users/` | 20 | 100 |
| `GET /api/v1/lessons/courses` | 20 | 100 |
| `GET /api/v1/admin/lessons/courses` | 20 | 100 |
| `GET /api/v1/admin/audit` | 50 | 200 |
| `GET /api/v1/admin/ipn` | 20 | 200 |
| `GET /api/v1/admin/payments` | 20 | 200 |
| `GET /api/v1/admin/subscriptions` | 20 | 200 |
| `GET /api/v1/admin/users/{user_id}/login-history` | 50 | 200 |
| `GET /api/v1/virtual-trading/admin/accounts` | 50 | 200 |

### 10.2 Kiểu 2 — `page`/`page_size` + dict `{items,total,page,page_size,total_pages}` không khai response_model

4 endpoint `admin_vt` trả `dict` (OpenAPI ghi schema inline `Response List ... Get`, không phải
`$ref` `PaginatedResponse`) nhưng **field giống hệt kiểu 1**:

| Endpoint | `page_size` default / max |
|---|---|
| `GET /api/v1/admin/vt/accounts/{account_id}/orders` | 50 / 200 |
| `GET /api/v1/admin/vt/accounts/{account_id}/trades` | 50 / 200 |
| `GET /api/v1/admin/vt/accounts/{account_id}/ledger` | 50 / 200 |
| `GET /api/v1/admin/vt/accounts/{account_id}/settlements` | 50 / 200 |

Cùng nhóm: `GET /api/v1/market-data/reference/symbols/search`
(`page` def 1, `page_size` def 20 max 100) trả dict với đúng 5 field như kiểu 1.

### 10.3 Kiểu 3 — wrapper có tên field DOMAIN, KHÔNG có `total_pages`

`virtual_trading.py` — client phải tự tính số trang:

| Endpoint | `page_size` def/max | Field mảng | Field khác |
|---|---|---|---|
| `GET /api/v1/virtual-trading/orders` | 20 / 100 | **`orders`** | `total, page, page_size` |
| `GET /api/v1/virtual-trading/trades` | 20 / 100 | **`trades`** | `total, page, page_size` |
| `GET /api/v1/virtual-trading/leaderboard` | 20 / 100 | **`entries`** | `total, total_eligible, evaluated_count, page, page_size, sort_by` |

```ts
interface OrderListResponse  { orders: OrderResponse[]; total: number; page: number; page_size: number; }
interface TradeListResponse  { trades: TradeResponse[]; total: number; page: number; page_size: number; }
interface LeaderboardResponse {
  entries: LeaderboardEntry[]; total: number;
  total_eligible: number; evaluated_count: number;
  page: number; page_size: number; sort_by: string;
}
```

### 10.4 Kiểu 4 — chỉ `limit` (không có page), trả **array trần** hoặc envelope market-data

| Endpoint | `limit` def | max | Response |
|---|---|---|---|
| `GET /api/v1/ai/forecast/ranking` | 20 | 100 | dict (inline) |
| `GET /api/v1/market-analysis/daily` | 20 | 100 | **array trần** |
| `GET /api/v1/market-data/insights/ranking/{kind}` | 10 | 50 | `MarketDataResponse` |
| `GET /api/v1/market-data/trading/{symbol}/foreign-trade` | 100 | 1000 | `MarketDataResponse` |
| `GET /api/v1/market-data/trading/{symbol}/insider-deals` | 100 | 1000 | `MarketDataResponse` |
| `GET /api/v1/market-data/global/crypto/{symbol}/depth` | 100 | 5000 | `MarketDataResponse` |
| `GET /api/v1/market-data/global/crypto/{symbol}/ohlc` | 500 | 1000 | `MarketDataResponse` |

### 10.5 Kiểu 5 — `page` bắt đầu từ **0** + `size` (không phải `page_size`)

Đây là **passthrough của upstream VCI**, khác hoàn toàn kiểu 1:

| Endpoint | `page` | `size` |
|---|---|---|
| `GET /api/v1/market-data/trading/{symbol}/history` | def **0**, `ge=0 le=1000` | def 50, `ge=1 le=200` |
| `GET /api/v1/market-data/trading/{symbol}/proprietary` | def **0**, `ge=0 le=1000` | def 50, `ge=1 le=200` |
| `GET /api/v1/market-data/trading/{symbol}/supply-demand` | def **0**, `ge=0 le=1000` | def 50, `ge=1 le=200` |

Ngoài ra `GET /api/v1/market-data/overview/heatmap` có tham số tên `size` nhưng **không phải
phân trang**: default là chuỗi `"MKC"` (loại metric).

### 10.6 Kiểu 6 — `page_size` đứng một mình, nghĩa khác hẳn

| Endpoint | Tham số | Ý nghĩa thật |
|---|---|---|
| `GET /api/v1/market-data/quotes/{symbol}/intraday` | `page_size` def 100, max **30000** | số lệnh khớp lấy về, không có `page` |
| `GET /api/v1/market-data/fundamentals/{symbol}/{report_type}` | `page_size` def **8**, max 20 | **số kỳ báo cáo** trả về, không có `page` |

### 10.7 Kiểu 7 — camelCase trong body (screener), `page` từ 0

`POST /api/v1/market-data/screening/search` — body `ScreeningPagingRequest` với
`populate_by_name=True` (nhận **cả** snake_case và camelCase):

| Field Python | alias JSON | default | ràng buộc |
|---|---|---|---|
| `page` | `page` | **0** | `ge=0` |
| `page_size` | **`pageSize`** | 50 | `ge=1, le=200` |
| `sort_fields` | **`sortFields`** | `["stockStrength"]` | — |
| `sort_orders` | **`sortOrders`** | `["DESC"]` | mỗi phần tử ∈ {`ASC`,`DESC`} (uppercase hoá; lỗi thì `sortOrders[i]='x' không hợp lệ. Cho phép: ASC, DESC`) |
| `filter` | `filter` | `[]` | — |

### 10.8 Kiểu 8 — pseudo-pagination trong envelope tin AI

| Endpoint | Tham số | Response |
|---|---|---|
| `GET /api/v1/market-data/news/ai` | `page` def 1, `page_size` def 20 max 100 | `{data, total_records, kind, page, page_size, source_url}` — dùng **`total_records`** và **`data`**, không phải `total`/`items` |
| `GET /api/v1/market-data/news/ai/tickers/{symbol}` | `page` def 1, `page_size` def 12 max **50** | `{ticker, sentiment, business_news:{data,total_records}, exchange_news:{data,total_records}, partial, warnings, page, page_size}` — hai khối lồng, thêm cờ `partial` + `warnings[]` khi một nguồn con chết |

### 10.9 Endpoint list KHÔNG phân trang — trả array trần

14 operation trả `type: "array"` ở 200 (kiểm chứng từ OpenAPI):

```
GET /api/v1/premium/plans
GET /api/v1/premium/admin/plans
GET /api/v1/alerts/rules
GET /api/v1/alerts/events
GET /api/v1/alerts/signals
GET /api/v1/admin/alerts/signals
GET /api/v1/admin/alerts/indicators
GET /api/v1/admin/metrics/revenue
GET /api/v1/admin/metrics/plan-distribution
GET /api/v1/admin/users/{user_id}/subscriptions/history
GET /api/v1/admin/vt/accounts/{account_id}/positions
GET /api/v1/backtest/strategies
GET /api/v1/lessons/me/progress
GET /api/v1/market-analysis/daily
```

### 10.10 Kết luận cho bản TS

Không có "một" DTO phân trang. Phải tạo **ít nhất 5** DTO riêng: `PaginatedResponse<T>` (kiểu
1+2), `OrderListResponse`, `TradeListResponse`, `LeaderboardResponse`, và các dict passthrough.
Mọi giá trị default/max trong các bảng trên phải chép **chính xác** — chúng khác nhau
(20/100, 50/200, 20/200, 12/50, 8/20, 100/30000…).

---

## 11. Sắp xếp và lọc

**Không có** quy ước chung. Chỉ 2 endpoint có sort qua query param:

| Endpoint | Tham số | Default | Ràng buộc |
|---|---|---|---|
| `GET /api/v1/users/` | `sort_by` | `"created_at"` | enum literal: `created_at`, `updated_at`, `email`, `full_name`, `role`, `status`, `last_login_at` (whitelist `SORTABLE_FIELDS` trong `app/schemas/user.py`) |
| | `sort_order` | `"desc"` | regex `^(asc|desc)$` |
| `GET /api/v1/virtual-trading/leaderboard` | `sort_by` | `"nav"` | **string tự do** (description ghi `nav, profit, return_pct`) — validate ở tầng service, không ở query |

Body screener dùng `sortFields[]` + `sortOrders[]` (§10.7). `sort_order` ở `admin_lessons` /
`admin_alerts` là **field dữ liệu** (thứ tự hiển thị), không phải tham số sắp xếp.

Filter phổ biến (không bắt buộc, đều nullable): `search` (7 endpoint, luôn `ILIKE %...%` trên
email/full_name), `status`, `role`, `symbol`, `date_from`/`date_to`, `update_from`/`update_to`.

**Bất nhất về đặt tên ngày**: có cả `date_from`/`date_to` (snake, 4 endpoint), `fromDate`/`toDate`
(**camelCase alias**, 7 endpoint market-data, format `YYYYMMDD`), `update_from`/`update_to`
(snake, format `YYYY-MM-DD`), `from_ts`/`to_ts`, `start`/`end`, `last_login_from`/`last_login_to`.
Chép nguyên tên và nguyên format từng chỗ.

---

## 12. Định dạng dữ liệu trên JSON

Serializer là Pydantic v2 (`model_dump_json`). Kiểm chứng bằng cách chạy thật:

```json
{"naive":"2026-08-17T10:30:05.123456",
 "aware":"2026-08-17T10:30:05.123456Z",
 "d":"2026-08-17",
 "u":"f89513e3-897b-4629-8847-0b5d99e6c5ef",
 "f":1234567.5}
```

### 12.1 `datetime` — ISO 8601, CÓ và KHÔNG có timezone lẫn lộn

Đây là bất nhất **thật** trong DB, không phải lỗi serializer:

| Nguồn cột | Kiểu Postgres | JSON |
|---|---|---|
| `TimestampMixin.created_at` / `updated_at` (`mapped_column(server_default=func.now())`, **không** `timezone=True`) | `TIMESTAMP WITHOUT TIME ZONE` | `"2026-08-17T10:30:05.123456"` — **không có offset** |
| Cột khai rõ `DateTime(timezone=True)` (ví dụ `users.last_login_at`, `users.email_verified_at`, `admin_audit_log.created_at`, mọi cột cap0–cap8 `entered_at`/`graduated_at`) | `TIMESTAMPTZ` | `"2026-08-17T10:30:05.123456Z"` — hậu tố **`Z`** cho UTC (Pydantic v2 dùng `Z`, **không** `+00:00`) |

Kiểm chứng: `alembic/versions/000000000001_initial_schema.py` có cả
`sa.DateTime()` (bảng `users` — created_at) và `sa.DateTime(timezone=True)` (bảng khác).
22 file model có ít nhất một cột `DateTime(timezone=True)`.

Trong OpenAPI có **69** property `format: "date-time"`.

⇒ Bản TS: `created_at`/`updated_at` của các bảng dùng `TimestampMixin` phải serialize **không**
offset để giữ parity byte-level. Nếu quyết định chuẩn hoá hết về UTC-with-Z thì phải ghi rõ
là breaking change cho frontend (mọi `new Date(s)` sẽ đổi nghĩa vì chuỗi không offset bị parse
theo local time).

### 12.2 `date` (ngày phiên `session_date`)

Kiểu Postgres `DATE`, JSON là `"YYYY-MM-DD"` (10 ký tự, không có phần giờ). OpenAPI:
`format: "date"`, **8** property:

```
AlertEventResponse.session_date     AnalysisListItem.session_date
AnalysisOut.session_date            Cap0KehoachOut.ngay_mua
DailyRevenuePoint.date              DiemKyLuatOut.ngay
DungNgoaiOut.han_cham_date          OrderResponse.trading_date
```

Bảng dùng `session_date DATE`: `ai_insight_history`, `portfolio_reports`, `alert_events`,
`daily_market_analysis` (+ bảng claim), mỗi bảng có `UniqueConstraint` gồm `session_date`
(ví dụ `uq_ai_insight_symbol_date`, `uq_portfolio_reports_account_date`,
`uq_analysis_session_date_report_type`) ⇒ **`session_date` là khoá idempotency của các job
theo phiên**, không chỉ là field hiển thị.

Ngoài ra một số **query param** ngày là **string** chứ không phải `date`, với 2 format khác nhau:
`fromDate`/`toDate` = `"YYYYMMDD"` (không dấu gạch, validate bằng `_validate_yyyymmdd`),
`update_from`/`update_to` = `"YYYY-MM-DD"`.

### 12.3 `UUID`

Luôn là **string** dạng canonical 36 ký tự có dấu gạch (`uuid4`). Khoá chính sinh ở tầng
Python (`UUIDMixin`: `default=uuid.uuid4`), **không** dùng `gen_random_uuid()` của Postgres.
Path param khai `uuid.UUID` ⇒ chuỗi không đúng dạng UUID trả **422** (không phải 404).

**Bẫy route order**: `admin_users.py` có comment rõ — `/export` phải khai **trước**
`/{user_id}/...` nếu không FastAPI thử coerce `"export"` thành UUID. NestJS cũng match theo
thứ tự khai báo ⇒ giữ nguyên thứ tự.

`admin_audit_log.target_id` là **`VARCHAR(100)`**, không phải UUID — nó stringify mọi loại khoá
(UUID, int, code).

### 12.4 Tiền và số

Hai chiến lược, không được trộn:

| Miền | Cách lưu | JSON |
|---|---|---|
| Giao dịch ảo, thanh toán Premium, sổ cái | **`BigInteger` VND nguyên** (docstring `virtual_trading.py`: "All monetary values stored as integer VND"), tên field luôn có hậu tố `_vnd` (`cash_available_vnd`, `avg_cost_vnd`, `filled_price_vnd`, `fee_vnd`, `tax_vnd`, `net_amount_vnd`, `balance_after_vnd`, `amount_vnd`…) | **number** nguyên |
| Giá/tỷ lệ dữ liệu thị trường & cấp 1–8 | `Numeric(p, s)`, phần lớn có **`asdecimal=False`** (ví dụ `Numeric(18,6,asdecimal=False)`, `Numeric(18,4,asdecimal=False)`, `Numeric(9,4,asdecimal=False)`) ⇒ SQLAlchemy trả `float` | **number** (float) |

**Không có** field nào serialize số thành string. **Không** có `Decimal` trong
`app/schemas/*.py` (grep `Decimal` trên `app/schemas/` = 0 hit).

Ngoại lệ đáng ghi: `market_data_snapshot.py` dùng `Numeric(18,6)` / `Numeric(10,4)`
**không** có `asdecimal=False` ⇒ SQLAlchemy trả `Decimal`. Pydantic serialize `Decimal` thành
**number** trong JSON (mặc định của Pydantic v2). CHƯA XÁC ĐỊNH có mất chính xác hay không ở
đường này — cần đọc `app/api/v1/endpoints/market_global.py` khi làm chương market-global.

Với bản TS: dùng `bigint`/`number` nguyên cho `*_vnd` (giá trị tối đa vốn ảo mặc định
`1_000_000_000` VND, an toàn trong `Number.MAX_SAFE_INTEGER`), và **không** dùng
`string` cho tiền — sẽ phá frontend.

### 12.5 Enum

Mọi enum serialize thành **giá trị chuỗi lowercase snake** của `Enum.value` (ví dụ
`role: "user" | "premium" | "admin"`, `status: "active" | ... | "deleted"`).
Trong audit code phải gọi `.value` tường minh (`user.role.value`) — bản TS dùng union literal
type là tương đương.

### 12.6 Envelope dữ liệu thị trường

Mọi endpoint market-data có `response_model=MarketDataResponse` dùng envelope chung
(`app/services/market_data/schemas.py`):

```ts
interface MarketDataMeta {
  source: string;          // "VCI" | "VND" | ... — nguồn đã phục vụ response
  source_priority: number; // default 1 (1 = primary, 2+ = fallback)
  fallback_used: boolean;  // default false
  as_of: IsoDateTime;      // default datetime.now() — LOCAL TIME, KHÔNG có tz
  raw_endpoint: string;    // default "" — URL upstream đã gọi
}
interface MarketDataResponse<T = unknown> { data: T; meta: MarketDataMeta; }
```

Lưu ý `as_of` dùng `datetime.now()` (naive, giờ máy) chứ **không** `datetime.now(UTC)`
⇒ JSON không có offset. Đây là hành vi hiện tại.

Các endpoint market-data **không** dùng `MarketDataResponse` thường trả dict có thêm field
**`source_url`** (28 lần xuất hiện trong `market_data.py`) — cùng vai trò với
`meta.raw_endpoint`. Đây là bất nhất, giữ nguyên.

---

## 13. Trailing slash

FastAPI/Starlette **không** tự chuẩn hoá dấu `/` cuối: `/x` và `/x/` là hai path khác nhau và
Starlette trả **307 redirect** (`redirect_slashes` default `True`) khi client gọi sai — nhưng
307 giữ method + body nên POST sẽ được gửi lại, thêm một round-trip.

Duyệt toàn bộ `app.routes` để tìm path kết thúc bằng `/` (trừ `/`), kết quả **đúng 2 operation
trên 1 path**:

| Method | Path |
|---|---|
| GET | `/api/v1/users/` |
| POST | `/api/v1/users/` |

Nguồn: `users.py` khai `@router.get("/")` và `@router.post("/")` với `prefix="/users"`.

**Mọi path khác trong hệ thống KHÔNG có trailing slash.** Các router khác dùng `@router.get("")`
(chuỗi rỗng) để có path không dấu `/` cuối — grep thấy 5 chỗ:
`admin_audit.py`, `admin_ipn.py`, `admin_payments.py` (GET `""`), `watchlist.py`
(GET `""` và POST `""`).

⇒ Bản TS: `GET /api/v1/users/` và `POST /api/v1/users/` phải **giữ đúng dấu `/`**. Trong NestJS
`@Get('/')` trên controller có `@Controller('api/v1/users')` mặc định cho ra
`/api/v1/users` (không dấu `/`) — phải cấu hình để ra đúng `/api/v1/users/`, hoặc đăng ký cả
hai và ghi rõ. Đừng "sửa" thành không dấu `/` nếu chưa cập nhật frontend, và nhớ nó cũng thay
đổi bucket rate-limit (§6.2).

---

## 14. Cache header và transaction per-request

### 14.1 `X-Cache: HIT`

Decorator `@redis_cached(...)` (`app/services/cache/decorator.py`) bọc nhiều endpoint GET
market-data. Khi cache hit:

```
JSONResponse(content=cached, headers={"X-Cache": "HIT"})
```

Hành vi cần giữ:

- Bỏ qua hoàn toàn nếu `REDIS_ENABLED=false` (gọi thẳng handler, **không** thêm header).
- Không có header `X-Cache: MISS` — **chỉ** phát `HIT`. Vắng header ⇒ miss hoặc redis tắt.
- Cache key: `iqx:{prefix}:{path}:{hash(sorted query params)}`, `prefix` default `"api:v1"`.
  Path được normalize: segment sau `quotes|company|trading|fundamentals|tickers` được
  **uppercase** (để `/quotes/vcb/...` và `/quotes/VCB/...` chung key).
- Chỉ cache response 2xx. `cache_empty=False` (default) ⇒ **không** cache khi `data` là list/dict
  rỗng; `cache_empty=True` ⇒ cache cả rỗng (dùng cho `intraday`, `price-depth`).
- Lỗi khi ghi cache bị **swallow** (log WARNING), không làm fail request.
- Decorator cần handler có tham số `request: Request` để lấy path/query — nếu không tìm thấy
  `Request` thì bỏ qua cache.

### 14.2 Một transaction cho mỗi request

`get_db()` (`app/core/database.py`) là dependency duy nhất cấp session:

```
async with factory() as session:
    try:
        yield session
        await session.commit()     # LUÔN commit, kể cả request read-only (no-op vô hại)
    except Exception:
        await session.rollback()
        raise
```

Hệ quả cho bản TS: mỗi HTTP request = **một** transaction; commit tự động ở cuối nếu không có
exception; **bất kỳ** exception (kể cả `HTTPException` 404) ⇒ rollback ⇒ mọi ghi trước đó trong
request đó bị mất. Đây là lý do audit log được ghi **cùng** transaction với mutation (atomic:
mutation thành công ⇔ audit tồn tại).

Engine: `pool_size=10`, `max_overflow=20`, `pool_pre_ping=True`, `echo=settings.DEBUG`.
Session factory: `expire_on_commit=False` (đọc được attribute sau commit — quan trọng vì
endpoint `return UserResponse.model_validate(user)` sau khi service đã commit).

Naming convention của constraint (phải tái tạo y hệt nếu migration TS tự sinh tên):

```
ix -> ix_%(column_0_label)s
uq -> uq_%(table_name)s_%(column_0_name)s
ck -> ck_%(table_name)s_%(constraint_name)s
fk -> fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s
pk -> pk_%(table_name)s
```

---

## 15. Status code — bảng dùng thật

Đếm từ OpenAPI (291 operation): `200` × 271, `201` × 12, `202` × 1, `204` × 7, `422` × 205.

**201 Created** (12 operation):

```
POST /api/v1/auth/register
POST /api/v1/users/
POST /api/v1/watchlist
POST /api/v1/alerts/rules
POST /api/v1/admin/alerts/signals
POST /api/v1/admin/lessons/courses
POST /api/v1/admin/lessons/courses/{course_id}/episodes
POST /api/v1/backtest/strategies
POST /api/v1/premium/admin/plans
POST /api/v1/premium/admin/users/{user_id}/grant
POST /api/v1/virtual-trading/account/activate
POST /api/v1/virtual-trading/orders
```

**202 Accepted** (1): `POST /api/v1/admin/users/{user_id}/resend-verification`.

**204 No Content** (7) — body rỗng:

```
DELETE /api/v1/watchlist/{symbol}
DELETE /api/v1/chart-drawings/{symbol}
DELETE /api/v1/alerts/rules/{rule_id}
DELETE /api/v1/alerts/telegram
DELETE /api/v1/admin/alerts/signals/{key}
DELETE /api/v1/admin/lessons/episodes/{episode_id}
DELETE /api/v1/backtest/strategies/{strategy_id}
```

Chú ý bất nhất: `DELETE /api/v1/users/{user_id}` trả **200** + `MessageResponse`
(`{"message":"Xóa người dùng thành công"}`), **không** phải 204.

`GET /api/v1/health` trả **200** khi `database=="healthy"`, **503** khi không — cả hai đều có
body `HealthResponse` đầy đủ (không phải body lỗi):

```ts
interface HealthResponse {
  status: 'ok' | 'degraded';
  app_name: string; version: string; environment: string;
  database: 'healthy' | 'unhealthy';
  redis: string;          // default "disabled"; giá trị khác do redis_health() trả
  timestamp: IsoDateTime; // datetime.now(UTC).isoformat() -> CÓ offset "+00:00"
}
```

Lưu ý: `timestamp` ở health dùng `.isoformat()` của Python (không qua Pydantic) ⇒ ra
**`+00:00`**, không phải `Z`. Redis unhealthy **không** làm health 503 — chỉ database.

---

## 16. Type TypeScript nền

Đặt các type này ở một file dùng chung (ví dụ `src/common/api-contract.ts`) và tái sử dụng
xuyên toàn bộ bản viết lại.

```ts
/** UUID v4 canonical, 36 ký tự có dấu gạch. Sinh ở tầng app, không phải DB. */
export type UUID = string;

/**
 * ISO 8601. CẢNH BÁO: hệ thống trả HAI dạng:
 *   - "2026-08-17T10:30:05.123456"   (cột TIMESTAMP WITHOUT TIME ZONE — created_at/updated_at
 *                                     của các bảng dùng TimestampMixin, và MarketDataMeta.as_of)
 *   - "2026-08-17T10:30:05.123456Z"  (cột TIMESTAMPTZ)
 *   - "2026-08-17T10:30:05.123456+00:00" (chỉ HealthResponse.timestamp — dùng .isoformat())
 * Client PHẢI không giả định có offset.
 */
export type IsoDateTime = string;

/** Ngày phiên giao dịch, "YYYY-MM-DD" (cột DATE). Là khoá idempotency của các job theo phiên. */
export type SessionDate = string;

/** Ngày dạng query param của nhóm market-data: "YYYYMMDD" (fromDate/toDate). */
export type CompactDate = string;

/** Vai trò và trạng thái người dùng (Enum.value, lowercase). */
export type UserRole = 'user' | 'premium' | 'admin';
// UserStatus: CHƯA XÁC ĐỊNH đầy đủ ở chương này — cần đọc app/models/user.py (class UserStatus).
// Đã xác nhận tồn tại: 'active', 'deleted'.

/** ── Hình dạng lỗi ────────────────────────────────────────────────────────────
 * Hệ thống có 4 body lỗi KHÁC NHAU. Union này bao hết.
 */

/** A. AppException — lỗi nghiệp vụ, CÓ `code`. Handler forward `exc.headers` (sửa 2026-08-18). */
export interface AppErrorBody {
  detail: string;
  code:
    | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'FORBIDDEN'
    | 'BAD_REQUEST' | 'UNPROCESSABLE_ENTITY' | 'SERVICE_UNAVAILABLE'
    | (string & {});      // cho phép mã mới
}

/** B. HTTPException trần — KHÔNG có `code`. Dùng nhiều ở market-data (422/502/503) và 404 route. */
export interface PlainErrorBody { detail: string }

/** C. Lỗi validate của FastAPI/Pydantic — 422, detail là ARRAY. */
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}
export interface ValidationErrorBody { detail: ValidationErrorItem[] }

/** D. Rate limit — 429. Key là `error`, KHÔNG phải `detail`. Không có Retry-After. */
export interface RateLimitErrorBody { error: string }   // "Rate limit exceeded: 60 per 1 minute"

/** E. Webhook SePay — hợp đồng riêng với SePay, giữ nguyên. */
export interface SepayIpnErrorBody { error: 'unauthorized' | 'invalid_json' | 'invalid_payload' }

export type ApiError =
  | AppErrorBody
  | PlainErrorBody
  | ValidationErrorBody
  | RateLimitErrorBody
  | SepayIpnErrorBody;

/** Type guard tiện dụng cho client. */
export const isValidationError = (e: ApiError): e is ValidationErrorBody =>
  'detail' in e && Array.isArray((e as ValidationErrorBody).detail);
export const isRateLimitError = (e: ApiError): e is RateLimitErrorBody =>
  'error' in e && typeof (e as RateLimitErrorBody).error === 'string';

/** ── Phân trang ───────────────────────────────────────────────────────────── */

/** Kiểu 1+2: wrapper chuẩn (app/schemas/common.py). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;        // 1-based
  page_size: number;
  total_pages: number; // ceil(total/page_size); 0 khi total === 0
}

/** Query param của kiểu 1+2. `page_size` max KHÁC NHAU theo endpoint — xem §10.1. */
export interface PageQuery {
  page?: number;       // default 1, ge=1, KHÔNG có max
  page_size?: number;  // default & max tuỳ endpoint
}

/** Kiểu 5: passthrough VCI — page 0-based, dùng `size` chứ không `page_size`. */
export interface VciPageQuery {
  page?: number;       // default 0, ge=0 le=1000
  size?: number;       // default 50, ge=1 le=200
}

/** ── Envelope market-data ─────────────────────────────────────────────────── */
export interface MarketDataMeta {
  source: string;
  source_priority: number;   // default 1
  fallback_used: boolean;    // default false
  as_of: IsoDateTime;        // datetime.now() naive -> KHÔNG có offset
  raw_endpoint: string;      // default ""
}
export interface MarketDataResponse<T = unknown> { data: T; meta: MarketDataMeta }

/** ── Response dùng lại nhiều nơi ──────────────────────────────────────────── */
export interface MessageResponse { message: string; detail?: string | null }
```

---

## 17. Bảng tổng hợp header

### 17.1 Request header hệ thống ĐỌC

| Header | Ai đọc | Bắt buộc | Hành vi khi thiếu |
|---|---|---|---|
| `Authorization: Bearer <token>` | `HTTPBearer(auto_error=False)` → `get_current_user` | với 193/291 operation | `UnauthorizedError` → **401** `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` |
| `X-Request-ID` | `RequestIDMiddleware`, `get_audit_context` | không | sinh UUID4 mới |
| `User-Agent` | `AuthService.login` (ghi login history), `get_audit_context` (ghi audit) | không | lưu `null` |
| `Origin` | `CORSMiddleware` | không | không thêm CORS header vào response |
| `Access-Control-Request-Method` / `-Headers` | `CORSMiddleware` (preflight) | chỉ với OPTIONS | preflight fail 400 |
| `Content-Type: application/json` | FastAPI body parse | với request có body | 422 |
| `Content-Type: multipart/form-data` | 2 endpoint upload (§9.2) | có | 422 |
| `X-Secret-Key` / `Authorization` / `X-Api-Key` | `POST /premium/sepay/ipn` — thử **theo đúng thứ tự này** | có | **401** `{"error":"unauthorized"}` + ghi 1 dòng `sepay_ipn_logs` với `result_status="secret_invalid"` |

Ghi chú: `X-Forwarded-For` **không** được đọc ở bất kỳ đâu (rate limit dùng
`request.client.host`, audit/login-history cũng vậy). Sau reverse proxy, IP ghi vào DB là IP
proxy. Muốn sửa thì phải thêm trust-proxy tường minh — là thay đổi có chủ ý.

### 17.2 Response header hệ thống SINH

| Header | Nguồn | Khi nào có |
|---|---|---|
| `X-Request-ID` | `RequestIDMiddleware` | **hầu hết** response, kể cả preflight 400 và 404. **KHÔNG** có trên 429-từ-default-limit và 500-từ-ServerErrorMiddleware |
| `Access-Control-Allow-Origin` | `CORSMiddleware` | khi `Origin` khớp `CORS_ORIGINS` |
| `Access-Control-Allow-Credentials: true` | `CORSMiddleware` | khi `allow_credentials` còn `True` (xem §4.2) |
| `Access-Control-Allow-Methods` | `CORSMiddleware` | preflight; giá trị = `CORS_METHODS` |
| `Access-Control-Allow-Headers` | `CORSMiddleware` | preflight; = `CORS_HEADERS` ∪ safelist → `Accept, Accept-Language, Authorization, Content-Language, Content-Type` |
| `Access-Control-Max-Age: 600` | `CORSMiddleware` | preflight (default Starlette) |
| `Vary: Origin` | `CORSMiddleware` | khi có `Origin` |
| `Access-Control-Expose-Headers` | — | **KHÔNG BAO GIỜ** (không cấu hình) ⇒ JS không đọc được `X-Request-ID` |
| `X-Cache: HIT` | `@redis_cached` | chỉ khi Redis bật **và** cache hit. Không có biến thể `MISS` |
| `Content-Disposition: attachment; filename=users-YYYYmmdd-HHMMSS.csv` | `admin/users/export` | 1 endpoint |
| `Content-Type: text/csv` | `admin/users/export` | 1 endpoint |
| `Content-Type: text/html; charset=utf-8` | 2 route email (§9.4) | |
| `WWW-Authenticate: Bearer` | — | Trên **401** do `UnauthorizedError`. Handler từng bỏ mất header này; **đã sửa 2026-08-18** (forward `exc.headers`) |
| `Retry-After`, `X-RateLimit-*` | — | **KHÔNG BAO GIỜ** — `headers_enabled=False` (§6.5) |

---

## 18. Checklist nghiệm thu chương này

Bản TS chỉ được coi là đạt parity ở tầng "quy ước chung" khi tất cả các mục sau đúng:

1. `GET /` → 404. `GET /api/v1/health` → 200 hoặc 503 với body `HealthResponse` đầy đủ.
2. `/docs`, `/redoc`, `/openapi.json` **mất hoàn toàn** khi `APP_ENV=production` và
   `ENABLE_API_DOCS` không set; **có** khi `ENABLE_API_DOCS=true` dù đang production.
3. `/media/<file>` trả file tĩnh, không cần token, không bị rate limit; thư mục được tạo lúc
   khởi động.
4. Mọi response (trừ 429-default và 500-crash) có `X-Request-ID`; client gửi header này thì
   được echo lại nguyên xi.
5. `OPTIONS` với `Access-Control-Request-Headers: X-Request-ID` trả **400 "Disallowed CORS
   headers"** (trừ khi cố ý mở rộng `CORS_HEADERS` — phải ghi vào changelog).
6. `OPTIONS` với origin lạ trả **400 "Disallowed CORS origin"**.
7. Đặt `CORS_ORIGINS=*` ⇒ `allow_credentials` tự về `false` **và** có 1 log WARNING.
8. Request thứ **11** trong 1 phút tới `POST /api/v1/auth/login` từ cùng IP trả
   `429 {"error":"Rate limit exceeded: 10 per 1 minute"}` **kèm** CORS + `X-Request-ID`.
9. Request thứ **61** trong 1 phút tới một path không có decorator trả
   `429 {"error":"Rate limit exceeded: 60 per 1 minute"}` **không** kèm CORS/`X-Request-ID`.
10. Bucket rate limit tách theo **path đã resolve**: 60 request `/quotes/VCB/intraday` không
    làm `/quotes/FPT/intraday` bị chặn.
11. `APP_ENV=testing` hoặc `test` ⇒ rate limit tắt hoàn toàn.
12. Không response nào có `Retry-After` hoặc `X-RateLimit-*`.
13. `GET /api/v1/users/me` không token → `401 {"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}`
    **có** `WWW-Authenticate: Bearer` (từ 2026-08-18).
14. `?page=0` trên endpoint kiểu 1 → 422 với `detail` là **array** có `loc:["query","page"]`.
15. `GET /api/v1/users/` và `POST /api/v1/users/` (CÓ dấu `/`) hoạt động; đó là **hai path duy
    nhất** có trailing slash.
16. `created_at` của bảng dùng `TimestampMixin` serialize **không** offset; `last_login_at`
    serialize **có** `Z`.
17. Mọi field `*_vnd` là số nguyên (number), không phải string.
18. Ném exception giữa request ⇒ mọi ghi DB trong request đó bị rollback, kể cả audit log.
