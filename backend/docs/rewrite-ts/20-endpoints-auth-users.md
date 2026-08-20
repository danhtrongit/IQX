# Endpoint — Xác thực, Người dùng, Health

Chương này đặc tả đầy đủ **15 operation** thuộc ba nhóm nền tảng của backend IQX:
`/api/v1/auth/*` (7 operation công khai trong OpenAPI), `/api/v1/users/*` (7 operation),
và `/api/v1/health` (1 operation). Đây là nhóm phải viết lại **trước tiên** vì mọi nhóm
khác đều phụ thuộc vào access token, guard `CurrentUser` / `AdminUser` và các kiểu dữ liệu
`UserResponse` / `MessageResponse` / `PaginatedResponse<T>` khai báo ở đây.

Ngoài 15 operation trên, nhóm `auth` còn có **2 endpoint HTML ẩn** (`include_in_schema=False`,
không xuất hiện trong OpenAPI) phục vụ link trong email — được đặc tả ở phần **Phụ lục A**
cuối chương. Chúng không tính vào con số 15 nhưng **bắt buộc phải triển khai**, nếu không
thì email xác thực và email đặt lại mật khẩu sẽ trỏ tới 404.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/health` | Công khai | Kiểm tra sức khỏe app + DB + Redis |
| `POST` | `/api/v1/auth/register` | Công khai | Đăng ký tài khoản mới (kèm gửi email xác thực + tặng trial 7 ngày) |
| `POST` | `/api/v1/auth/login` | Công khai | Đăng nhập, trả cặp access + refresh token |
| `POST` | `/api/v1/auth/refresh` | Công khai (mang refresh token trong body) | Xoay vòng refresh token, phát cặp token mới |
| `POST` | `/api/v1/auth/logout` | Bearer | Thu hồi **toàn bộ** refresh token của user |
| `GET` | `/api/v1/auth/me` | Bearer | Hồ sơ người dùng đang đăng nhập |
| `POST` | `/api/v1/auth/forgot-password` | Công khai | Gửi email đặt lại mật khẩu (không tiết lộ email tồn tại) |
| `POST` | `/api/v1/auth/reset-password` | Công khai (mang token email trong body) | Đổi mật khẩu bằng token, thu hồi mọi phiên |
| `GET` | `/api/v1/auth/verify-email` | Công khai (token trong query) | **Trang HTML** xác thực email — ẩn khỏi OpenAPI |
| `GET` | `/api/v1/auth/reset-password` | Công khai (token trong query) | **Trang HTML** form đặt mật khẩu mới — ẩn khỏi OpenAPI |
| `GET` | `/api/v1/users/me` | Bearer | Hồ sơ của chính mình (cùng shape với `/auth/me`) |
| `PATCH` | `/api/v1/users/me` | Bearer | Tự cập nhật hồ sơ cá nhân (không được sửa role/status) |
| `GET` | `/api/v1/users/` | Bearer + Admin | Danh sách người dùng có phân trang, lọc, sắp xếp |
| `POST` | `/api/v1/users/` | Bearer + Admin | Admin tạo người dùng với role/status tùy chỉnh |
| `GET` | `/api/v1/users/{user_id}` | Bearer + Admin | Chi tiết một người dùng |
| `PATCH` | `/api/v1/users/{user_id}` | Bearer + Admin | Admin cập nhật hồ sơ / role / status / cờ verify |
| `DELETE` | `/api/v1/users/{user_id}` | Bearer + Admin | Xóa **mềm** người dùng (status → `deleted`) |

> ⚠️ **`GET /api/v1/users/` và `POST /api/v1/users/` có dấu `/` ở cuối path.**
> Đây là path thật, không được chuẩn hoá thành `/api/v1/users`. Trong FastAPI đó là
> `@router.get("/")` với `prefix="/users"`. Nếu framework TS của bạn tự redirect
> `/users` → `/users/` bằng 307 thì client cũ vẫn chạy, nhưng **`/users` không được
> trả 404** và **`/users/` phải là URL canonical** vì frontend hiện tại gọi đúng
> `/api/v1/users/?search=...`. Ngược lại, `/api/v1/users/me` **không** có dấu `/` cuối.

---

## Kiểu dữ liệu dùng chung

Khai báo một lần ở đây; các mục endpoint bên dưới chỉ tham chiếu theo tên.

#### Enum

~~~ts
/** app/models/user.py :: UserRole (enum Postgres `user_role`) */
type UserRole = 'admin' | 'user' | 'premium';

/** app/models/user.py :: UserStatus (enum Postgres `user_status`) */
type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

/** Whitelist cột được phép sort — app/schemas/user.py :: SORTABLE_FIELDS */
type UserSortableField =
  | 'created_at'
  | 'updated_at'
  | 'email'
  | 'full_name'
  | 'role'
  | 'status'
  | 'last_login_at';

type SortOrder = 'asc' | 'desc';
~~~

Lịch sử enum `user_role`: migration gốc `000000000001_initial_schema` chỉ tạo
`('admin', 'user')`; giá trị `'premium'` được thêm sau bằng
`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'premium'`
(`83fe4c37a788_add_premium_to_user_role_enum`). Khi viết lại phải tạo enum với **cả 3 giá trị**.

#### `UserResponse` — hồ sơ đầy đủ (dùng cho 7 endpoint)

~~~ts
/** app/schemas/user.py :: UserResponse — TUYỆT ĐỐI không bao giờ chứa hashed_password */
interface UserResponse {
  id: string;                              // UUID v4
  email: string;                           // luôn lowercase (được .lower() khi tạo)
  full_name: string;

  // ── Điện thoại: 1 field người dùng gõ + 3 field dẫn xuất từ libphonenumber ──
  phone_number: string | null;             // NGUYÊN VĂN người dùng gõ, có thể còn dấu cách
  phone_country_code: string | null;       // ví dụ "+84"
  phone_national_number: string | null;    // ví dụ "912345678" (không có số 0 đầu)
  phone_e164: string | null;               // ví dụ "+84912345678" — đây là field UNIQUE
  phone_verified_at: string | null;        // ISO 8601 có offset; hiện chưa có luồng nào set

  // ── Hồ sơ ──
  avatar_url: string | null;
  date_of_birth: string | null;            // "YYYY-MM-DD"
  gender: string | null;                   // chuỗi tự do, max 20 ký tự — KHÔNG phải enum
  country: string | null;
  province_state: string | null;
  city: string | null;
  district: string | null;
  ward: string | null;
  street_address: string | null;
  postal_code: string | null;

  // ── Phân quyền & trạng thái ──
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  email_verified_at: string | null;        // ISO 8601 CÓ offset ("+00:00")
  last_login_at: string | null;            // ISO 8601 CÓ offset ("+00:00")
  created_at: string;                      // ISO 8601 KHÔNG offset (xem cảnh báo dưới)
  updated_at: string;                      // ISO 8601 KHÔNG offset
}
~~~

> ⚠️ **Bẫy timezone rất dễ bỏ sót.** Trong `alembic/versions/000000000001_initial_schema.py`:
> `email_verified_at`, `last_login_at`, `phone_verified_at`, `deleted_at` là
> `sa.DateTime(timezone=True)` → `TIMESTAMPTZ` → serialize thành
> `"2026-08-17T03:12:44.918233+00:00"`.
> Nhưng `created_at` và `updated_at` là `sa.DateTime()` **không** timezone →
> `TIMESTAMP WITHOUT TIME ZONE` → serialize thành `"2026-08-17T03:12:44.918233"`
> (**không có hậu tố offset**). Frontend hiện tại đang parse đúng chuỗi này.
> Nếu bản TS đổi hết sang `timestamptz` thì payload đổi hình dạng — phải giữ nguyên
> hoặc cập nhật frontend đồng thời.

> Về `required`: trong OpenAPI chỉ `id, email, full_name, role, status, is_email_verified,
> created_at, updated_at` nằm trong `required`. Nhưng vì handler dùng `response_model`
> mặc định (không `exclude_none`), **mọi field nullable vẫn luôn xuất hiện với giá trị `null`**.
> Vì vậy TS nên khai `T | null` (bắt buộc có mặt) chứ không dùng `?`.

#### `UserBriefResponse` — bản rút gọn cho danh sách

~~~ts
/** app/schemas/user.py :: UserBriefResponse */
interface UserBriefResponse {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;   // ISO 8601 KHÔNG offset
}
~~~

#### Wrapper & response chung

~~~ts
/** app/schemas/common.py :: PaginatedResponse[T] */
interface PaginatedResponse<T> {
  items: T[];
  total: number;         // tổng số bản ghi khớp filter (KHÔNG phải số item trang này)
  page: number;
  page_size: number;
  total_pages: number;   // Math.ceil(total / page_size); === 0 khi total === 0
}

/** app/schemas/common.py :: MessageResponse */
interface CommonMessageResponse {
  message: string;
  detail: string | null;   // luôn có mặt, hiện tại LUÔN là null ở nhóm này
}

/** app/schemas/auth.py :: TokenResponse */
interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;      // luôn "bearer"
}

/** app/schemas/common.py :: HealthResponse */
interface HealthResponse {
  status: 'ok' | 'degraded';
  app_name: string;
  version: string;
  environment: string;
  database: 'healthy' | 'unhealthy';
  redis: 'healthy' | 'unhealthy' | 'disabled';
  timestamp: string;       // datetime.now(UTC).isoformat() → có "+00:00"
}
~~~

#### Hình dạng lỗi

Có **ba** hình dạng lỗi khác nhau trong chương này. Phải tái tạo cả ba.

~~~ts
/**
 * (1) Lỗi nghiệp vụ — handler app.main :: app_exception_handler cho AppException.
 * Dùng cho 400 / 401 / 403 / 404 / 409 / 422(nghiệp vụ) / 503.
 */
interface CommonApiError {
  detail: string;          // tiếng Việt, hiển thị trực tiếp cho người dùng
  code: string | null;     // 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN'
                           // | 'NOT_FOUND' | 'CONFLICT' | 'UNPROCESSABLE_ENTITY'
                           // | 'SERVICE_UNAVAILABLE'
}

/**
 * (2) Lỗi validate schema — handler mặc định của FastAPI (RequestValidationError).
 * LƯU Ý: `detail` ở đây là MẢNG, không phải string. Client phải phân biệt được.
 */
interface CommonValidationErrorItem {
  loc: (string | number)[];         // ví dụ ["body", "password"]
  msg: string;                      // Pydantic v2 thêm tiền tố "Value error, " cho ValueError
  type: string;                     // ví dụ "value_error", "string_too_short", "missing"
  input?: unknown;
  ctx?: Record<string, unknown>;
}
interface CommonValidationError {
  detail: CommonValidationErrorItem[];
}

/**
 * (3) Lỗi vượt rate limit — slowapi :: _rate_limit_exceeded_handler.
 * KHÔNG có field `detail` và KHÔNG có field `code`.
 */
interface CommonRateLimitError {
  error: string;    // ví dụ "Rate limit exceeded: 10 per 1 minute"
}
~~~

Bảng mã lỗi nghiệp vụ (`app/core/exceptions.py`):

| Class | Status | `code` | `detail` mặc định |
|---|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` | `Yêu cầu không hợp lệ` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | `Thông tin xác thực không hợp lệ` |
| `ForbiddenError` | 403 | `FORBIDDEN` | `Không đủ quyền truy cập` |
| `NotFoundError` | 404 | `NOT_FOUND` | `Không tìm thấy {resource}` |
| `ConflictError` | 409 | `CONFLICT` | `Tài nguyên đã tồn tại` |
| `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` | `Dữ liệu không thể xử lý` |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | `Dịch vụ tạm thời không khả dụng` |

> ⚠️ `UnauthorizedError` được khởi tạo với `headers={"WWW-Authenticate": "Bearer"}`,
> **nhưng exception handler trong `app/main.py` không truyền `headers` vào `JSONResponse`**,
> nên header đó **thực tế bị mất** trên mọi response 401. Bản TS nên giữ nguyên hành vi này
> (không phát `WWW-Authenticate`) để tránh làm thay đổi hành vi trình duyệt/basic-auth prompt.

#### Guard và cách phân giải người dùng hiện tại

`app/api/deps.py` định nghĩa chuỗi guard. Thứ tự kiểm tra **rất quan trọng** vì nó quyết
định 401 hay 403.

1. `bearer_scheme = HTTPBearer(auto_error=False)` — đọc header `Authorization: Bearer <token>`.
   Nếu thiếu header, hoặc scheme không phải `Bearer` → `credentials = None`
   → **401 `Yêu cầu xác thực`**.
2. `AuthService.get_current_user_from_token(token)`:
   - decode HS256 bằng `JWT_SECRET_KEY`; `ExpiredSignatureError` → **401 `Access token đã hết hạn`**;
     mọi `InvalidTokenError` khác → **401 `Access token không hợp lệ`**.
   - `payload.type !== 'access'` → **401 `Sai loại token`** (chặn việc dùng refresh token
     làm access token).
   - `payload.sub` thiếu hoặc không parse được thành UUID → **401 `Access token bị thiếu thuộc tính`**.
   - `UserService.get_by_id(sub)`: user không tồn tại **hoặc `status === 'deleted'`**
     → **401 `Tài khoản người dùng không còn khả dụng`** (cố tình map 404 → 401 để không
     leak sự tồn tại của user).
   - `user.status !== 'active'` (tức `inactive` / `suspended`) → **403 `Trạng thái tài khoản: <status>`**,
     ví dụ `Trạng thái tài khoản: suspended`.
3. `get_current_active_user` kiểm tra thêm `user.is_active` (property = `status === 'active'`)
   → `ForbiddenError('Tài khoản chưa được kích hoạt')`. **Nhánh này thực tế không thể xảy ra**
   vì bước 2 đã lọc; vẫn nên viết lại để phòng hờ.
4. `get_current_admin` yêu cầu `role === 'admin'`, nếu không → **403 `Yêu cầu quyền quản trị viên`**.
   Lưu ý: chỉ `'admin'`, **`'premium'` không phải admin**.

Type alias tương ứng: `CurrentUser` = guard (1)+(2)+(3); `AdminUser` = thêm (4).
Trong OpenAPI cả hai đều hiện là `security: [{ HTTPBearer: [] }]` — **OpenAPI không phân
biệt được Bearer thường và Bearer+Admin**, phải đọc từ source (cột "Quyền" ở mỗi mục dưới
đây là nguồn sự thật).

#### Cấu hình JWT & token

| Hằng số | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `JWT_ALGORITHM` | `HS256` | dùng cho cả access, refresh, email token |
| `JWT_SECRET_KEY` | *(bắt buộc, không default)* | ký access token + email-verify token |
| `JWT_REFRESH_SECRET_KEY` | *(bắt buộc, không default)* | ký refresh token — **khoá KHÁC** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | `48` | |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `2` | |
| `RATE_LIMIT_DEFAULT` | `60/minute` | áp cho mọi route không được decorate |
| `RATE_LIMIT_AUTH` | `10/minute` | áp cho 5 route auth được decorate |

Payload token (`app/core/security.py`):

~~~ts
interface AuthAccessTokenClaims {
  sub: string;             // user id (UUID dạng chuỗi)
  iat: number;
  exp: number;
  type: 'access';
  role: UserRole;          // extra_claims — có thể đọc để bỏ qua 1 truy vấn DB
}

interface AuthRefreshTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  type: 'refresh';
  jti: string;             // UUID v4 — khoá tra bảng refresh_tokens
  family: string;          // UUID v4 — 1 family = 1 phiên đăng nhập
}
~~~

#### Rate limit — cơ chế chính xác

`app/core/rate_limit.py` dùng `slowapi.Limiter(key_func=get_remote_address,
default_limits=[RATE_LIMIT_DEFAULT], storage_uri="memory://", enabled=APP_ENV not in ("testing","test"))`
kết hợp `SlowAPIMiddleware`.

- Route **có** decorator `@limiter.limit("10/minute")` (register, login, refresh,
  forgot-password, reset-password): vì `override_defaults=True` là mặc định của slowapi,
  route này **chỉ** chịu giới hạn 10/phút, **không** cộng thêm 60/phút.
- Route **không** có decorator (health, logout, `/auth/me`, toàn bộ `/users/*`):
  chịu giới hạn mặc định **60/phút**.
- Khóa đếm là **IP client** (`get_remote_address`), không phải user id.
- Storage là **in-memory của từng process** → khi chạy nhiều worker/replica, giới hạn thực
  tế nhân theo số process. Khi viết lại nên dùng Redis store để đúng hơn, nhưng phải biết
  đây là **thay đổi hành vi** (siết chặt hơn hiện tại).
- `headers_enabled` không được bật → **không** có `X-RateLimit-*` / `Retry-After`
  trong response 429.

#### Header chung mọi response

`RequestIDMiddleware` (`app/core/request_id.py`) là middleware ngoài cùng: đọc
`X-Request-ID` từ request (nếu không có thì sinh UUID v4), gán vào `request.state.request_id`,
và **luôn echo lại header `X-Request-ID`** trên mọi response — kể cả response lỗi.
Giá trị này cũng được ghi vào `admin_audit_log.request_id` ở các endpoint admin.

#### Chính sách mật khẩu (dùng chung 3 nơi)

`app/schemas/user.py :: validate_password_strength` được tái sử dụng bởi `UserCreate`,
`AdminUserCreate` (kế thừa) và `ResetPasswordRequest`. Ràng buộc độ dài do Pydantic
`Field` kiểm trước, sau đó mới tới validator.

| Thứ tự | Luật | Regex | Message (nguyên văn) |
|---|---|---|---|
| 0 | Độ dài 8–128 | `min_length=8`, `max_length=128` | message chuẩn Pydantic (`String should have at least 8 characters`) |
| 1 | Có chữ in hoa | `[A-Z]` | `Mật khẩu phải chứa ít nhất một chữ in hoa` |
| 2 | Có chữ thường | `[a-z]` | `Mật khẩu phải chứa ít nhất một chữ thường` |
| 3 | Có chữ số | `\d` | `Mật khẩu phải chứa ít nhất một chữ số` |
| 4 | Có ký tự đặc biệt | `[!@#$%^&*(),.?\":{}\|<>]` | `Mật khẩu phải chứa ít nhất một ký tự đặc biệt` |

Validator **dừng ở lỗi đầu tiên** → response 422 chỉ chứa **một** item cho field `password`.
Trong JSON, `msg` bị Pydantic v2 bọc thành `"Value error, Mật khẩu phải chứa ít nhất một chữ in hoa"`
(có tiền tố `Value error, `). Tập ký tự đặc biệt là **danh sách trắng hữu hạn** — các ký tự
như `-`, `_`, `+`, `=`, `[`, `]`, `;`, `'`, `/`, `\`, `~`, `` ` `` **không** được tính là
ký tự đặc biệt. Ví dụ `Str0ng-Pass` bị từ chối, `Str0ng@Pass` được chấp nhận.

Hash: `passlib.CryptContext(schemes=["bcrypt"], deprecated="auto")` → bcrypt. Cột
`users.hashed_password` là `String(1024)`.

> ⚠️ bcrypt bỏ qua ký tự sau byte thứ 72. `max_length=128` cho phép mật khẩu dài hơn
> giới hạn bcrypt — hành vi hiện tại là **âm thầm cắt** ở tầng bcrypt. Giữ nguyên
> (dùng `bcrypt` trong Node) để hash cũ vẫn verify được. **Không được** đổi sang argon2
> nếu chưa có kế hoạch rehash-on-login.

#### Chính sách số điện thoại

Cả `UserCreate` và `UserUpdate` (và các lớp Admin kế thừa) dùng cùng validator
`validate_phone` với thư viện `phonenumbers` (libphonenumber), **region mặc định `"VN"`**:

1. `None` → giữ `None` (nghĩa là "xoá số điện thoại").
2. `v.strip()`; nếu chuỗi rỗng sau strip → trả `None` (tức `""` cũng xoá số).
3. `phonenumbers.parse(v, "VN")`:
   - `NumberParseException` → `ValueError("Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678")`
   - parse được nhưng `is_valid_number()` false → `ValueError("Số điện thoại không hợp lệ")`
     (**message ngắn hơn, khác message trên** — phải giữ đúng cả hai).
4. Trả về **chuỗi đã strip, nguyên định dạng người dùng gõ** (không normalize).

Được chấp nhận (đã có test): `"0912345678"`, `"+84912345678"`, `" 0912345678 "`,
`"0901 234 567"`. Bị từ chối: `"abc-not-a-number"` (message dài),
`"0999999999999"` (message ngắn).

Sau khi qua validator, `UserService._parse_phone` (tầng service) mới tách field dẫn xuất:

| Input | `phone_number` | `phone_country_code` | `phone_national_number` | `phone_e164` |
|---|---|---|---|---|
| `"0912345678"` | `"0912345678"` | `"+84"` | `"912345678"` | `"+84912345678"` |
| `"+84912345678"` | `"+84912345678"` | `"+84"` | `"912345678"` | `"+84912345678"` |
| `"0901 234 567"` | `"0901 234 567"` | `"+84"` | `"901234567"` | `"+84901234567"` |
| `null` | `null` | `null` | `null` | `null` |

> ⚠️ `phone_number` lưu **nguyên văn có dấu cách**, còn `phone_e164` mới là dạng chuẩn hoá.
> Cả hai đều `UNIQUE` trong DB (`ix_users_phone_number` unique, `uq_users_phone_e164`).
> Kiểm tra trùng ở tầng service **chỉ dùng `phone_e164`** → hai người gõ `"0912345678"`
> và `"0912 345 678"` sẽ cùng ra e164 `+84912345678` và bị chặn 409 đúng như mong đợi.
> Nhưng nếu `_parse_phone` không suy ra được e164 (số không valid — không xảy ra qua API vì
> validator đã chặn), service chỉ set `phone_number` và **bỏ qua kiểm tra trùng** →
> khi đó constraint unique của DB sẽ bắn lỗi 500 chứ không phải 409. Bản TS nên bắt lỗi
> unique-violation và map về 409 cho an toàn.

#### Giao dịch DB (quan trọng cho mọi endpoint)

`app/core/database.py :: get_db` mở một session cho mỗi request, `yield`, rồi **luôn
`commit()`** khi handler kết thúc bình thường; **`rollback()`** khi có exception thoát ra.
Tầng repository chỉ `flush()` + `refresh()`, **không commit**.

Hệ quả bắt buộc phải sao chép:
- Endpoint chỉ đọc vẫn commit (no-op vô hại).
- Endpoint ghi rồi **raise** → mọi thay đổi bị rollback. Vì thế `AuthService.login` phải
  **`commit()` tường minh** trước khi raise 401, nếu không thì bản ghi lịch sử đăng nhập
  thất bại sẽ bị rollback (xem mục `POST /auth/login`).
- `BackgroundTasks` (gửi email) chạy **sau khi response đã trả và session đã commit**.

---

## Nhóm Health

### GET /api/v1/health

> **Kiểm tra sức khỏe hệ thống** — trả trạng thái app, kết nối Postgres, kết nối Redis, phiên bản và dấu thời gian.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`SELECT 1`) + Redis (`PING`) + settings |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
// Tham chiếu HealthResponse ở mục "Kiểu dữ liệu dùng chung"
type HealthCheckResponse = HealthResponse;
~~~

~~~json
{
  "status": "ok",
  "app_name": "IQX",
  "version": "0.1.0",
  "environment": "production",
  "database": "healthy",
  "redis": "healthy",
  "timestamp": "2026-08-17T03:12:44.918233+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 503 | — | `await db.execute(text("SELECT 1"))` ném exception | *(không có field `detail`)* — body vẫn là `HealthResponse` với `status: "degraded"`, `database: "unhealthy"` |

**Fallback / suy giảm**

- Handler **không** dùng `response_model` để serialize — nó tự tạo `JSONResponse(status_code=..., content=body.model_dump())`.
  Vì vậy body của 503 **giống hệt** body của 200 về hình dạng, chỉ khác giá trị.
- Postgres lỗi → `database: "unhealthy"`, `status: "degraded"`, **HTTP 503**.
- Redis lỗi → `redis: "unhealthy"` nhưng `status` **vẫn `"ok"`** và **HTTP vẫn 200**.
  Redis **không** ảnh hưởng status code. Đây là chủ ý: Redis chỉ là cache.
- Redis bị tắt bằng config (`REDIS_ENABLED=false`) → `redis: "disabled"`, HTTP 200.
  Ba giá trị hợp lệ của `redis` là `"healthy" | "unhealthy" | "disabled"`
  (`app/services/cache/redis_cache.py :: health_check`).
- `timestamp` = `datetime.now(UTC).isoformat()` → **luôn** có hậu tố `+00:00` và có microsecond.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/health' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- `app_name` / `version` / `environment` đọc từ settings: `APP_NAME` (default `"IQX"`),
  `APP_VERSION` (default `"0.1.0"`), `APP_ENV` (default `"development"`).
  Test `tests/test_health.py` assert `data["app_name"] == "IQX"`.
- Endpoint này nằm ở `/api/v1/health` — **không** phải `/health`. Load balancer / Coolify
  healthcheck đang trỏ vào path có prefix `/api/v1`.
- Không được thêm bất kỳ thông tin bí mật nào (connection string, version DB) vì endpoint
  công khai.
- Vì có `default_limits` 60/phút theo IP, healthcheck poll dày hơn 1 lần/giây từ cùng một IP
  sẽ bị 429. Nếu hạ tầng poll dày, cần exempt path này khi viết lại.

---

## Nhóm Xác thực (`/api/v1/auth`)

### POST /api/v1/auth/register

> **Đăng ký người dùng mới** — tạo tài khoản `role=user` / `status=active`, gửi email xác thực ở background và cấp thử Premium 7 ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | **10/minute per IP** (`RATE_LIMIT_AUTH`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `users`; INSERT `premium_subscriptions` (+ bảng liên quan) qua `PremiumService.grant_trial_if_eligible`; gửi email Resend "Xác thực địa chỉ email của bạn" ở **BackgroundTask**. **KHÔNG** ghi `admin_audit_log`. **KHÔNG** tạo tài khoản giao dịch ảo, **KHÔNG** tạo bản ghi Cấp 0. |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/user.py :: UserCreate */
interface AuthRegisterRequest {
  email: string;                  // EmailStr — email-validator, bắt buộc
  password: string;               // 8..128 + chính sách mật khẩu (xem mục dùng chung)
  full_name: string;              // 1..200, bắt buộc
  phone_number?: string | null;   // <=30, validator libphonenumber region "VN"
}
~~~

~~~json
{
  "email": "nguyen.van.an@gmail.com",
  "password": "Str0ng@Pass",
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678"
}
~~~

**Response 200**

Status thực tế là **201**, `response_model = UserResponse`.

~~~ts
type AuthRegisterResponse = UserResponse;
~~~

~~~json
{
  "id": "9f1c7d2e-5b83-4a16-9d0f-2c4a8e7b6103",
  "email": "nguyen.van.an@gmail.com",
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678",
  "phone_country_code": "+84",
  "phone_national_number": "912345678",
  "phone_e164": "+84912345678",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": null,
  "gender": null,
  "country": null,
  "province_state": null,
  "city": null,
  "district": null,
  "ward": null,
  "street_address": null,
  "postal_code": null,
  "role": "user",
  "status": "active",
  "is_email_verified": false,
  "email_verified_at": null,
  "last_login_at": null,
  "created_at": "2026-08-17T03:12:44.918233",
  "updated_at": "2026-08-17T03:12:44.918233"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 409 | `CONFLICT` | `email_exists(data.email)` — so sánh trên email đã `.lower()` | `Đã tồn tại người dùng với email này` |
| 409 | `CONFLICT` | `phone_exists(phone_e164)` — chỉ chạy khi suy ra được e164 | `Đã tồn tại người dùng với số điện thoại này` |
| 422 | — | Sai định dạng email | `detail[0].msg` = `value is not a valid email address: An email address must have an @-sign.` (do email-validator sinh) |
| 422 | — | Mật khẩu < 8 hoặc > 128 ký tự | message chuẩn Pydantic `String should have at least 8 characters` |
| 422 | — | Mật khẩu không đủ mạnh | `Value error, Mật khẩu phải chứa ít nhất một chữ in hoa` (hoặc chữ thường / chữ số / ký tự đặc biệt — lỗi đầu tiên gặp) |
| 422 | — | `phone_number` không parse được | `Value error, Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678` |
| 422 | — | `phone_number` parse được nhưng không hợp lệ | `Value error, Số điện thoại không hợp lệ` |
| 422 | — | Thiếu `email` / `password` / `full_name` | `type: "missing"`, `msg: "Field required"` |
| 429 | — | Vượt 10 request/phút/IP | body `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

**Fallback / suy giảm**

- **Gửi email thất bại KHÔNG làm hỏng đăng ký.** Email được đưa vào `BackgroundTasks`;
  hàm `_send_verification_email` bọc toàn bộ trong `try/except Exception` và chỉ
  `logger.exception("Verification email task failed for %s", email)`.
  Client vẫn nhận 201.
- Khi `EMAIL_ENABLED=false` hoặc thiếu `RESEND_API_KEY`, `EmailService.send` **không gọi
  HTTP**, chỉ log `[email-disabled] skip send ...` và trả `False`. Đây là chế độ dev/test.
- **Cấp trial thất bại cũng KHÔNG làm hỏng đăng ký.** `UserService.register` bọc
  `PremiumService.grant_trial_if_eligible` trong `try/except Exception` →
  `logger.warning("Failed to grant trial for user %s: %s", ...)`.
  Nếu gói `TRIAL_7D` chưa được seed trong DB thì hàm log warning
  `TRIAL_7D plan not seeded; skipping trial grant for user %s` và no-op.
- `grant_trial_if_eligible` **idempotent**: nếu user đã có bất kỳ subscription nào (kể cả
  đã hết hạn) thì no-op, trả `None`.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/register' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
        "email": "nguyen.van.an@gmail.com",
        "password": "Str0ng@Pass",
        "full_name": "Nguyễn Văn An",
        "phone_number": "0912345678"
      }'
~~~

**Ghi chú khi viết lại**

- **Trạng thái user mới**: `role = 'user'`, `status = 'active'`, `is_email_verified = false`,
  `email_verified_at = null`, `last_login_at = null`. **Không có** khái niệm "chờ kích hoạt"
  — user đăng nhập được **ngay** dù chưa xác thực email. Đây là quyết định nghiệp vụ hiện tại;
  `POST /auth/login` **không** kiểm tra `is_email_verified`.
- **Thứ tự kiểm tra bắt buộc**: (1) trùng email → (2) parse phone → (3) trùng phone e164 →
  (4) INSERT user → (5) cấp trial → (6) `session.refresh(created)`.
  Nếu đảo (1) và (3), message 409 sẽ khác với hiện tại.
- `email` được **hạ về lowercase** khi INSERT (`data.email.lower()`), nên response trả email
  lowercase kể cả khi client gửi `Nguyen.Van.An@Gmail.com`. `full_name` **không** bị trim
  hay chuẩn hoá.
- `session.refresh(created)` ở cuối là cần thiết vì `grant_trial_if_eligible` có thể đã
  commit/expire lazy attribute. Trong TS/TypeORM/Prisma tương đương là reload entity sau
  khi ghi trial.
- Endpoint này **không** trả token. Client phải gọi `POST /auth/login` ngay sau đó.
- Không có endpoint "gửi lại email xác thực" trong nhóm này — nó nằm ở nhóm admin
  (`POST /api/v1/admin/users/{user_id}/resend-verification`, xem chương admin).

---

### POST /api/v1/auth/login

> **Đăng nhập** — xác thực email + mật khẩu, trả cặp access/refresh token và ghi lịch sử đăng nhập.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | **10/minute per IP** (`RATE_LIMIT_AUTH`) — áp dụng **cả cho admin dashboard** vì admin dùng chung endpoint này |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `user_login_history` (thành công **và** thất bại); UPDATE `users.last_login_at`; INSERT `refresh_tokens` |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/auth.py :: LoginRequest */
interface AuthLoginRequest {
  email: string;      // EmailStr
  password: string;   // min_length=1 — KHÔNG áp chính sách mật khẩu ở đây
}
~~~

~~~json
{
  "email": "nguyen.van.an@gmail.com",
  "password": "Str0ng@Pass"
}
~~~

**Response 200**

~~~ts
type AuthLoginResponse = AuthTokenResponse;
~~~

~~~json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJpYXQiOjE3ODY5OTIzNjQsImV4cCI6MTc4Njk5NDE2NCwidHlwZSI6ImFjY2VzcyIsInJvbGUiOiJ1c2VyIn0.qKX3n8bQ1x4nHc2fV5rTsA7dPmEwZyLuNvOgIhRkJbc",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJpYXQiOjE3ODY5OTIzNjQsImV4cCI6MTc4NzU5NzE2NCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiJiNGE5YzIxZS03ZjM4LTQ0YjEtOTIwYS0xZTVkOGM3ZjMwYTIiLCJmYW1pbHkiOiIzZTA3YTVkNC02YjExLTQ5YzgtODdmMi0wYTFkNGU2YjkyYzUifQ.Yt7sQ2mLpR0xVwB4nKdJfHgAeUcIoZlN9rTyMbXqPvE",
  "token_type": "bearer"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Email không tồn tại **hoặc** mật khẩu sai (gộp chung, không phân biệt) | `Email hoặc mật khẩu không đúng` |
| 401 | `UNAUTHORIZED` | `user.status !== 'active'` (`inactive` / `suspended` / `deleted`) | `Trạng thái tài khoản: inactive` / `Trạng thái tài khoản: suspended` / `Trạng thái tài khoản: deleted` |
| 422 | — | `email` sai định dạng | message của email-validator |
| 422 | — | `password` là chuỗi rỗng | `String should have at least 1 character` |
| 429 | — | Vượt 10 request/phút/IP | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

**Fallback / suy giảm**

- Không có provider ngoài → không có nhánh suy giảm. Mọi lỗi DB đều thành 500.
- **Đăng nhập KHÔNG kiểm tra `is_email_verified`.** User chưa xác thực email vẫn đăng nhập
  bình thường. Đây là hành vi hiện tại, phải giữ (đổi sẽ khoá toàn bộ user cũ chưa verify).
- **`status: 'deleted'` bị chặn bởi cùng một nhánh với `inactive`/`suspended`**, vì
  `UserService.get_by_email` gọi thẳng repository (**không** filter `deleted`), khác với
  `get_by_id`. Nên user đã xoá mềm nhận `Trạng thái tài khoản: deleted` chứ **không** phải
  `Email hoặc mật khẩu không đúng`. → **Đây là một kênh liệt kê tài khoản (enumeration):**
  gửi đúng mật khẩu của một tài khoản đã bị xoá/khoá sẽ tiết lộ trạng thái tài khoản.
  Ghi lại nguyên trạng; nếu muốn siết thì phải quyết định tường minh vì frontend đang
  hiển thị message này cho người dùng.

**Bảng ghi `user_login_history`** (`app/models/login_history.py`) — **mọi** lần thử đều ghi 1 dòng:

| Tình huống | `user_id` | `email` | `success` | `failure_reason` |
|---|---|---|---|---|
| Đăng nhập thành công | `user.id` | email đã `.lower()` | `true` | `null` |
| Email không tồn tại | `null` | email đã `.lower()` | `false` | `"invalid_credentials"` |
| Sai mật khẩu | `user.id` | email đã `.lower()` | `false` | `"invalid_credentials"` |
| `status !== 'active'` | `user.id` | email đã `.lower()` | `false` | `"status:<status>"` — ví dụ `"status:inactive"` |

Các cột khác: `ip` = `request.client.host` (hoặc `null`), `user_agent` = header `user-agent`
(hoặc `null`, `String(500)`), `login_at` = `server_default now()` (`TIMESTAMPTZ`).
FK `user_id` là `ON DELETE SET NULL`.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
        "email": "nguyen.van.an@gmail.com",
        "password": "Str0ng@Pass"
      }'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra bắt buộc** (`AuthService.login`):
  1. `get_by_email(email.lower())`.
  2. `!user || !verify_password(password, user.hashed_password)` → ghi history
     `invalid_credentials` → **`session.commit()` tường minh** → raise 401.
  3. `user.status !== 'active'` → ghi history `status:<value>` → **`session.commit()`
     tường minh** → raise 401.
  4. `update_last_login(user)` (UPDATE `last_login_at = now()`).
  5. Sinh `token_family = uuid4()`.
  6. `create_access_token(sub=user.id, extra_claims={role})`.
  7. `create_refresh_token(sub=user.id, token_family)` → trả `(token, jti)`.
  8. INSERT `refresh_tokens` với `expires_at = now() + REFRESH_TOKEN_EXPIRE_DAYS`,
     `revoked = false`, `created_at = now()`.
  9. Ghi history `success = true` (commit do `get_db` lo).
- **Bắt buộc commit trước khi raise 401.** Nếu không, `get_db` sẽ rollback và dòng lịch sử
  thất bại biến mất — mất hoàn toàn khả năng phát hiện brute-force.
  `tests/test_auth.py::test_login_invalid_password_records_history` bảo vệ hành vi này.
- `verify_password` phải được gọi **kể cả khi user không tồn tại**? — **Không**, code hiện
  tại short-circuit bằng `not user or not verify_password(...)`, nên khi email không tồn tại
  thì bcrypt **không** chạy → có timing side-channel. Giữ nguyên hoặc sửa có ý thức.
- Mỗi lần login tạo **một family mới** → mỗi thiết bị/phiên có family riêng.
- Response **không** chứa thông tin user. Frontend gọi tiếp `/auth/me`.
- `expires_at` trong bảng `refresh_tokens` **không được kiểm tra** ở luồng refresh
  (chỉ dựa vào `exp` của JWT) — nó chỉ dùng cho job dọn rác `purge_expired`.

---

### POST /api/v1/auth/refresh

> **Làm mới token** — đổi một refresh token hợp lệ lấy cặp token mới, xoay vòng (rotation) và phát hiện replay.

| | |
|---|---|
| **Quyền** | Công khai — refresh token nằm trong body, **không** dùng header `Authorization` |
| **Rate limit** | **10/minute per IP** (`RATE_LIMIT_AUTH`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `refresh_tokens.revoked = true` (1 dòng, hoặc cả family khi phát hiện replay); INSERT `refresh_tokens` dòng mới. **Không** ghi `user_login_history`. |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/auth.py :: RefreshTokenRequest */
interface AuthRefreshRequest {
  refresh_token: string;   // KHÔNG có min_length — chuỗi rỗng qua được Pydantic, bị 401 ở service
}
~~~

~~~json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJpYXQiOjE3ODY5OTIzNjQsImV4cCI6MTc4NzU5NzE2NCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiJiNGE5YzIxZS03ZjM4LTQ0YjEtOTIwYS0xZTVkOGM3ZjMwYTIiLCJmYW1pbHkiOiIzZTA3YTVkNC02YjExLTQ5YzgtODdmMi0wYTFkNGU2YjkyYzUifQ.Yt7sQ2mLpR0xVwB4nKdJfHgAeUcIoZlN9rTyMbXqPvE"
}
~~~

**Response 200**

Trả **cả access token mới và refresh token mới** (`token_type` luôn `"bearer"`).

~~~ts
type AuthRefreshResponse = AuthTokenResponse;
~~~

~~~json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJpYXQiOjE3ODY5OTQwMDAsImV4cCI6MTc4Njk5NTgwMCwidHlwZSI6ImFjY2VzcyIsInJvbGUiOiJ1c2VyIn0.M2pQnR7vXsYtA9dLkEwZbHcUoIfNgJmTyKrBqPvXlSo",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJpYXQiOjE3ODY5OTQwMDAsImV4cCI6MTc4NzU5ODgwMCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiI3YzJlOWExNC0zZDU2LTQ4YjAtOGUxZi01YTdjOWQyYjRlODEiLCJmYW1pbHkiOiIzZTA3YTVkNC02YjExLTQ5YzgtODdmMi0wYTFkNGU2YjkyYzUifQ.Db8KwQ3sYmXtR6vNhLpEfAzUcIoJgNyTrKqBlSvPxMe",
  "token_type": "bearer"
}
~~~

**Lỗi**

Tất cả đều 401 với `code: "UNAUTHORIZED"`. Message **khác nhau theo từng nguyên nhân** —
phải giữ nguyên văn để hỗ trợ debug.

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | JWT hết hạn (`ExpiredSignatureError`) | `Refresh token đã hết hạn` |
| 401 | `UNAUTHORIZED` | JWT sai chữ ký / malformed / chuỗi rỗng (`InvalidTokenError`) | `Refresh token không hợp lệ` |
| 401 | `UNAUTHORIZED` | `payload.type !== 'refresh'` (ví dụ đưa access token vào) | `Sai loại token` |
| 401 | `UNAUTHORIZED` | Thiếu claim `jti` hoặc `family` | `Refresh token bị thiếu thuộc tính` |
| 401 | `UNAUTHORIZED` | Không có dòng nào trong `refresh_tokens` với `jti` đó | `Refresh token không được công nhận` |
| 401 | `UNAUTHORIZED` | `family` trong JWT ≠ `token_family` trong DB → **revoke cả family trong DB** rồi raise | `Refresh token family không khớp` |
| 401 | `UNAUTHORIZED` | `claim_for_rotation(jti)` trả 0 dòng (token đã bị revoke) → **replay** → **revoke cả family** rồi raise | `Refresh token đã bị thu hồi (có thể bị tấn công replay)` |
| 401 | `UNAUTHORIZED` | User không còn (bị xoá mềm → `get_by_id` ném `NotFoundError`) | `Tài khoản người dùng không còn khả dụng` |
| 401 | `UNAUTHORIZED` | `user.status !== 'active'` | `Trạng thái tài khoản: suspended` (v.v.) |
| 422 | — | Thiếu field `refresh_token` | `type: "missing"`, `msg: "Field required"` |
| 429 | — | Vượt 10 request/phút/IP | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

**Fallback / suy giảm**

- Không có provider ngoài. Không có nhánh suy giảm — mọi thất bại là 401 (hoặc 500 nếu DB chết).
- **Lưu ý nghiêm trọng về giao dịch**: hai nhánh `revoke_family(...)` được thực hiện rồi
  **raise ngay**. Vì `get_db` rollback khi có exception, **việc revoke family đó bị rollback**
  và **không được ghi vào DB**. Nghĩa là: cơ chế "phát hiện replay → khoá cả family" hiện
  tại **chỉ ghi log warning, không thực sự khoá được family**; token còn lại trong family
  vẫn dùng được. `tests/test_auth.py::test_refresh_token_rotation_revokes_old` vẫn xanh vì
  nó chỉ kiểm tra token **đã dùng** bị từ chối (do `claim_for_rotation` đã commit thành công
  ở request trước đó). **Khi viết lại bằng TS: hãy commit phần revoke-family trước khi
  ném lỗi** (transaction riêng) — đây là bug cần sửa, ghi lại ở đây để không "port nguyên bug".

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/refresh' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJ0eXBlIjoicmVmcmVzaCJ9.SIGNATURE"}'
~~~

**Ghi chú khi viết lại**

- **Refresh token được ký bằng `JWT_REFRESH_SECRET_KEY`**, khác khoá của access token.
  Không được dùng cùng một secret.
- **Thứ tự kiểm tra bắt buộc** (`AuthService.refresh_tokens`):
  decode JWT → check `type` → check có `jti` + `family` → `get_by_jti` →
  so sánh `family` → `claim_for_rotation(jti)` (atomic) → `get_by_id(user)` →
  check `status` → sinh cặp mới → INSERT dòng mới.
- **`claim_for_rotation` phải là UPDATE có điều kiện, không phải SELECT-rồi-UPDATE**:
  `UPDATE refresh_tokens SET revoked = true WHERE jti = :jti AND revoked = false`
  rồi đọc `rowcount`. Chỉ đúng một request đồng thời thắng được. Nếu viết thành
  `SELECT ... FOR UPDATE` hay check-then-set thì hai tab trình duyệt refresh cùng lúc sẽ
  cùng thành công → mất tính chống replay.
- **Xoay vòng giữ nguyên `family`**: dòng mới có `jti` mới nhưng `token_family` **giống cũ**.
  Dòng cũ **không bị xoá**, chỉ `revoked = true` (dọn dẹp bằng job `purge_expired`).
- Refresh **không** cập nhật `last_login_at` và **không** ghi `user_login_history`.
- Access token mới lại nhúng `role` hiện tại của user → nếu admin đổi role, role mới có
  hiệu lực sau lần refresh kế tiếp (tối đa 30 phút trễ).

---

### POST /api/v1/auth/logout

> **Đăng xuất** — thu hồi **toàn bộ** refresh token của người dùng hiện tại (đăng xuất mọi thiết bị).

| | |
|---|---|
| **Quyền** | **Bearer** (`CurrentUser`) |
| **Rate limit** | mặc định (60/minute per IP) — **không** có decorator auth limit |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | `UPDATE refresh_tokens SET revoked = true WHERE user_id = :id` — **mọi family**, không chỉ family hiện tại |

**Path params**

—

**Query params**

—

**Request body**

**Không cần body.** Endpoint không khai báo `requestBody` trong OpenAPI. Refresh token
cần thu hồi được suy ra từ `user_id` trong access token, không lấy từ body.
Gửi kèm body JSON cũng không lỗi — nó bị bỏ qua.

**Response 200**

~~~ts
type AuthLogoutResponse = CommonMessageResponse;
~~~

~~~json
{
  "message": "Đăng xuất thành công",
  "detail": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu header `Authorization` / scheme không phải Bearer | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Access token hết hạn | `Access token đã hết hạn` |
| 401 | `UNAUTHORIZED` | Access token sai chữ ký / malformed | `Access token không hợp lệ` |
| 401 | `UNAUTHORIZED` | `payload.type !== 'access'` | `Sai loại token` |
| 401 | `UNAUTHORIZED` | `sub` thiếu / không phải UUID | `Access token bị thiếu thuộc tính` |
| 401 | `UNAUTHORIZED` | User đã bị xoá mềm | `Tài khoản người dùng không còn khả dụng` |
| 403 | `FORBIDDEN` | `status` là `inactive` / `suspended` | `Trạng thái tài khoản: suspended` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- Idempotent: gọi lại khi đã không còn token nào vẫn trả 200 (UPDATE 0 dòng).
- **Access token vẫn còn hiệu lực sau logout** (tối đa 30 phút) vì access token là stateless,
  không có blacklist. Đây là lỗ hổng đã biết của thiết kế hiện tại: sau logout, client vẫn
  gọi được `/auth/me` bằng access token cũ cho tới khi nó hết hạn.
  `tests/test_auth.py::test_logout` chỉ kiểm tra refresh token bị chặn.
  **Nếu bản TS muốn thêm blacklist thì đó là thay đổi hành vi có chủ đích.**

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/logout' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Dùng `revoke_all_for_user(user_id)`, **không** phải `revoke_by_jti` hay `revoke_family`.
  Đây là "đăng xuất mọi thiết bị" chứ không phải "đăng xuất thiết bị này".
  Nếu cần đăng xuất từng thiết bị, phải thêm endpoint mới — hiện tại **không có**.
- Message trả về đúng nguyên văn `"Đăng xuất thành công"` —
  `tests/test_auth.py::test_logout` assert chuỗi này.
- Không ghi `admin_audit_log`, không ghi `user_login_history`.

---

### GET /api/v1/auth/me

> **Lấy thông tin người dùng hiện tại** — trả hồ sơ đầy đủ của user gắn với access token.

| | |
|---|---|
| **Quyền** | **Bearer** (`CurrentUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (đã nạp sẵn trong guard, handler không truy vấn thêm) |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type AuthMeResponse = UserResponse;   // GIỐNG HỆT GET /api/v1/users/me
~~~

~~~json
{
  "id": "9f1c7d2e-5b83-4a16-9d0f-2c4a8e7b6103",
  "email": "nguyen.van.an@gmail.com",
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678",
  "phone_country_code": "+84",
  "phone_national_number": "912345678",
  "phone_e164": "+84912345678",
  "phone_verified_at": null,
  "avatar_url": "https://cdn.iqx.vn/avatars/9f1c7d2e.jpg",
  "date_of_birth": "1992-03-14",
  "gender": "male",
  "country": "Việt Nam",
  "province_state": "Hồ Chí Minh",
  "city": "Hồ Chí Minh",
  "district": "Quận 1",
  "ward": "Phường Bến Nghé",
  "street_address": "12 Nguyễn Huệ",
  "postal_code": "700000",
  "role": "user",
  "status": "active",
  "is_email_verified": true,
  "email_verified_at": "2026-08-17T04:01:09.220145+00:00",
  "last_login_at": "2026-08-17T06:12:44.918233+00:00",
  "created_at": "2026-07-02T09:41:03.114820",
  "updated_at": "2026-08-17T04:01:09.223908"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai header `Authorization` | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Token hết hạn | `Access token đã hết hạn` |
| 401 | `UNAUTHORIZED` | Token sai chữ ký / malformed | `Access token không hợp lệ` |
| 401 | `UNAUTHORIZED` | `type !== 'access'` | `Sai loại token` |
| 401 | `UNAUTHORIZED` | `sub` thiếu / không phải UUID | `Access token bị thiếu thuộc tính` |
| 401 | `UNAUTHORIZED` | User bị xoá mềm (`status = 'deleted'`) | `Tài khoản người dùng không còn khả dụng` |
| 403 | `FORBIDDEN` | `status` là `inactive` / `suspended` | `Trạng thái tài khoản: suspended` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/auth/me' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`GET /auth/me` và `GET /users/me` trả CÙNG MỘT shape.** Cả hai đều
  `response_model=UserResponse` và cùng thân hàm `return UserResponse.model_validate(current_user)`
  (xem `app/api/v1/endpoints/auth.py:126` và `app/api/v1/endpoints/users.py:35`).
  Chúng là **hai alias trùng lặp**, khác nhau duy nhất ở OpenAPI tag
  (`Xác thực` vs `Người dùng`). Phải giữ **cả hai**, không được bỏ một cái —
  frontend đang gọi cả hai ở các luồng khác nhau.
- Endpoint **không** trả thông tin subscription Premium. Trạng thái Premium lấy từ
  nhóm `/api/v1/premium/*`. Đặc biệt: `role` **không** đổi thành `'premium'` khi user
  mua gói — Premium được xác định bởi bảng subscription (`app/api/deps.py :: is_premium_active`).
  Đừng suy ra "premium" từ `role`.
- `hashed_password` **không bao giờ** xuất hiện. `tests/test_auth.py` assert
  `"hashed_password" not in data`. Trong TS, không dùng "select all rồi spread entity" —
  phải map tường minh.
- `telegram_chat_id` và `telegram_linked_at` **có** trong model `User` nhưng **không** có
  trong `UserResponse` → đừng thêm vào.

---

### POST /api/v1/auth/forgot-password

> **Quên mật khẩu** — gửi email chứa liên kết đặt lại mật khẩu; luôn trả 200 với cùng một message bất kể email có tồn tại hay không.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | **10/minute per IP** (`RATE_LIMIT_AUTH`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (tra user theo email) |
| **Side-effect** | Gửi email Resend "Đặt lại mật khẩu IQX" ở **BackgroundTask** — **chỉ** khi user tồn tại **và** `status === 'active'`. Không ghi bảng nào (token là JWT stateless). |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/auth.py :: ForgotPasswordRequest */
interface AuthForgotPasswordRequest {
  email: string;   // EmailStr — bắt buộc, đây là field DUY NHẤT
}
~~~

~~~json
{ "email": "nguyen.van.an@gmail.com" }
~~~

**Response 200**

~~~ts
type AuthForgotPasswordResponse = CommonMessageResponse;
~~~

~~~json
{
  "message": "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.",
  "detail": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 422 | — | `email` sai định dạng (ví dụ `"not-an-email"`) | message của email-validator, `loc: ["body","email"]` |
| 422 | — | Thiếu field `email` | `type: "missing"`, `msg: "Field required"` |
| 429 | — | Vượt 10 request/phút/IP | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

**Không có 404, không có 400.** Email không tồn tại vẫn là 200 với cùng message.

**Fallback / suy giảm**

- **KHÔNG tiết lộ email tồn tại (no user enumeration).** Response body, status code và
  header **giống hệt** trong cả ba trường hợp: email tồn tại + active, email tồn tại nhưng
  bị khoá/xoá, email không tồn tại. Test `tests/test_email_flows.py::test_forgot_password_unknown_email_returns_200`
  và `::test_forgot_password_existing_user_returns_200` bảo vệ hành vi này.
- **Chỉ user `status === 'active'` được gửi email.** Điều kiện tường minh trong code:
  `if user and user.status == UserStatus.ACTIVE`. User `inactive` / `suspended` / `deleted`
  **không** nhận email nhưng vẫn nhận 200 với cùng message.
  Lưu ý: `UserService.get_by_email` **không** filter `deleted`, nên việc chặn xoá-mềm
  đến từ đúng phép so sánh `status == ACTIVE` này.
- Gửi email thất bại (Resend down, thiếu API key, `EMAIL_ENABLED=false`) → **im lặng**.
  `_send_reset_email` bọc `try/except Exception` → `logger.exception("Password reset email task failed for %s", email)`.
  Client vẫn nhận 200. **Không có cách nào để client biết email đã gửi hay chưa** — đúng
  chủ ý bảo mật.
- **Kênh phụ về thời gian**: nhánh có user thêm một lần thêm-background-task (rất nhanh),
  còn việc gọi Resend xảy ra **sau** khi response đã trả. Nên độ lệch thời gian gần như 0.
  Đừng thêm `await` gửi email vào request — sẽ tạo timing oracle.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/forgot-password' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"email": "nguyen.van.an@gmail.com"}'
~~~

**Ghi chú khi viết lại**

- Token reset **không lưu DB**. Nó là JWT `{ sub, type: "password_reset", iat, exp }`
  ký bằng khoá ghép `JWT_SECRET_KEY + user.hashed_password`
  (`app/core/email_tokens.py :: create_password_reset_token`). Vì khoá phụ thuộc vào
  hash mật khẩu hiện tại nên **token tự động vô hiệu ngay khi mật khẩu đổi** — đó là
  cơ chế "dùng một lần" mà không cần bảng nào.
- TTL = `PASSWORD_RESET_TOKEN_TTL_HOURS` = **2 giờ**.
- Link trong email: `{EMAIL_LINK_BASE_URL || APP_PUBLIC_URL}/api/v1/auth/reset-password?token=<jwt>`
  (bỏ dấu `/` cuối của base). Link này trỏ tới endpoint HTML ẩn — xem **Phụ lục A.2**.
- Subject email: `Đặt lại mật khẩu IQX`. Người gửi: `EMAIL_FROM` (mặc định
  `IQX <no-reply@iqx.vn>`). Transport: `POST https://api.resend.com/emails` với
  `Authorization: Bearer <RESEND_API_KEY>`, timeout 15s, payload
  `{from, to: [email], subject, html, text?}`.
- Endpoint truyền `user.hashed_password` vào background task. Trong TS, cẩn thận đừng
  log hay serialize giá trị này ra ngoài.
- Không cần (và không được) tra `user` bằng `get_by_id` — dùng `get_by_email(email.lower())`.

---

### POST /api/v1/auth/reset-password

> **Đặt lại mật khẩu** — đổi mật khẩu bằng token từ email, đồng thời thu hồi mọi refresh token của user.

| | |
|---|---|
| **Quyền** | Công khai — token nằm trong body |
| **Rate limit** | **10/minute per IP** (`RATE_LIMIT_AUTH`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `users.hashed_password`; `UPDATE refresh_tokens SET revoked = true WHERE user_id = :id` (toàn bộ). **Không** gửi email thông báo, **không** ghi audit log, **không** ghi `user_login_history`. |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/auth.py :: ResetPasswordRequest */
interface AuthResetPasswordRequest {
  token: string;          // min_length=1
  new_password: string;   // 8..128 + validate_password_strength (giống register)
}
~~~

~~~json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjFjN2QyZS01YjgzLTRhMTYtOWQwZi0yYzRhOGU3YjYxMDMiLCJ0eXBlIjoicGFzc3dvcmRfcmVzZXQiLCJpYXQiOjE3ODY5OTIzNjQsImV4cCI6MTc4Njk5OTU2NH0.hV2rTqNsXwLpB8dKmEcZyJoIfAgUnMtYrKbQlSvPxDe",
  "new_password": "NewStr0ng@Pass"
}
~~~

**Response 200**

~~~ts
type AuthResetPasswordResponse = CommonMessageResponse;
~~~

~~~json
{
  "message": "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.",
  "detail": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `token` malformed (không đọc được `sub`) | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| 400 | `BAD_REQUEST` | User trong `sub` không tồn tại hoặc `status = 'deleted'` | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| 400 | `BAD_REQUEST` | Chữ ký không khớp `JWT_SECRET_KEY + hash hiện tại` (mật khẩu đã đổi → token đã dùng) | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| 400 | `BAD_REQUEST` | Token quá 2 giờ (`exp`) | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| 400 | `BAD_REQUEST` | `payload.type !== 'password_reset'` (ví dụ đưa token verify-email vào) | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| 422 | — | `new_password` < 8 hoặc > 128 ký tự | `String should have at least 8 characters` |
| 422 | — | `new_password` không đủ mạnh | `Value error, Mật khẩu phải chứa ít nhất một ký tự đặc biệt` (hoặc luật bị vi phạm đầu tiên) |
| 422 | — | `token` là chuỗi rỗng | `String should have at least 1 character` |
| 429 | — | Vượt 10 request/phút/IP | `{"error": "Rate limit exceeded: 10 per 1 minute"}` |

> **Mọi lỗi token đều dùng CHÍNH XÁC MỘT message giống nhau** —
> `"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn"` (hằng `invalid` trong
> `AuthService.reset_password_with_token`). Đây là chủ ý: không tiết lộ token sai ở đâu.
> Lưu ý message trong `app/core/email_tokens.py` có một biến thể ngắn hơn
> (`Liên kết đặt lại mật khẩu không hợp lệ`) nhưng nó **không bao giờ tới được client**
> vì service bắt `EmailTokenError` và thay bằng message dài.

**Fallback / suy giảm**

- Token **dùng một lần theo cơ chế tự nhiên**: khoá ký = `JWT_SECRET_KEY + user.hashed_password`.
  Sau khi đổi mật khẩu, hash thay đổi → mọi token reset còn hiệu lực (kể cả token vừa dùng
  và token từ email cũ) **đều verify thất bại** → 400.
  `tests/test_email_flows.py::test_reset_password_is_single_use` bảo vệ hành vi này.
- Đặt lại mật khẩu **không** kiểm tra `status === 'active'` — chỉ cần user không bị xoá mềm
  (`get_by_id` lọc `deleted`). Nghĩa là user `suspended` **vẫn đổi được mật khẩu**
  (nhưng vẫn không đăng nhập được). Bất đối xứng có ý so với `forgot-password` (chỉ mail
  cho `active`): user `suspended` không nhận được link, nhưng nếu có link từ trước khi bị
  khoá thì vẫn dùng được trong 2 giờ.
- **Không** ràng buộc "mật khẩu mới phải khác mật khẩu cũ" — đặt lại đúng mật khẩu hiện tại
  vẫn thành công 200.
- **Không** set `is_email_verified` — reset mật khẩu không đồng nghĩa xác thực email.
- Sau reset, tất cả refresh token bị revoke → mọi thiết bị phải đăng nhập lại. Nhưng
  **access token cũ vẫn dùng được tối đa 30 phút** (không có blacklist).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/auth/reset-password' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.SIGNATURE",
        "new_password": "NewStr0ng@Pass"
      }'
~~~

**Ghi chú khi viết lại**

- **Thứ tự bắt buộc** (`AuthService.reset_password_with_token`):
  1. `read_unverified_subject(token)` — decode JWT **KHÔNG verify chữ ký**
     (`jwt.decode(token, options={"verify_signature": False})`) chỉ để lấy `sub`.
     Đây là bước duy nhất được phép bỏ verify, và **chỉ** được đọc `sub`, tuyệt đối
     không tin claim nào khác.
  2. `get_by_id(sub)` — lấy `hashed_password` **hiện tại**.
  3. `decode_password_reset_token(token, user.hashed_password)` — **giờ mới** verify chữ ký
     với khoá ghép, và kiểm tra `type === 'password_reset'`.
  4. `user.hashed_password = hash_password(new_password)` → `flush()`.
  5. `revoke_all_for_user(user.id)`.
  Bước 1 và 3 **không thể gộp** vì không biết khoá trước khi biết user.
- Không được đổi thứ tự 4 và 5 — nếu revoke trước rồi đổi hash sau, một request đồng thời
  có thể xen vào giữa.
- Handler chỉ trả message; **không** trả token mới. Người dùng phải đăng nhập lại
  (message đã nói rõ điều đó).

---

## Nhóm Người dùng (`/api/v1/users`)

### GET /api/v1/users/me

> **Lấy hồ sơ của chính mình** — bản sao chức năng của `GET /auth/me`, khác tag OpenAPI.

| | |
|---|---|
| **Quyền** | **Bearer** (`CurrentUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (đã nạp trong guard) |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type UserMeResponse = UserResponse;   // GIỐNG HỆT GET /api/v1/auth/me
~~~

~~~json
{
  "id": "9f1c7d2e-5b83-4a16-9d0f-2c4a8e7b6103",
  "email": "nguyen.van.an@gmail.com",
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678",
  "phone_country_code": "+84",
  "phone_national_number": "912345678",
  "phone_e164": "+84912345678",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": "1992-03-14",
  "gender": "male",
  "country": "Việt Nam",
  "province_state": "Hồ Chí Minh",
  "city": "Hồ Chí Minh",
  "district": "Quận 1",
  "ward": "Phường Bến Nghé",
  "street_address": "12 Nguyễn Huệ",
  "postal_code": "700000",
  "role": "user",
  "status": "active",
  "is_email_verified": true,
  "email_verified_at": "2026-08-17T04:01:09.220145+00:00",
  "last_login_at": "2026-08-17T06:12:44.918233+00:00",
  "created_at": "2026-07-02T09:41:03.114820",
  "updated_at": "2026-08-17T04:01:09.223908"
}
~~~

**Lỗi**

Giống hệt `GET /api/v1/auth/me`:

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai header `Authorization` | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Token hết hạn | `Access token đã hết hạn` |
| 401 | `UNAUTHORIZED` | Token sai chữ ký / malformed | `Access token không hợp lệ` |
| 401 | `UNAUTHORIZED` | `type !== 'access'` | `Sai loại token` |
| 401 | `UNAUTHORIZED` | `sub` thiếu / không phải UUID | `Access token bị thiếu thuộc tính` |
| 401 | `UNAUTHORIZED` | User bị xoá mềm | `Tài khoản người dùng không còn khả dụng` |
| 403 | `FORBIDDEN` | `status` là `inactive` / `suspended` | `Trạng thái tài khoản: suspended` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/users/me' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Route `/users/me` phải được khai báo **TRƯỚC** `/users/{user_id}` trong router,
  đúng như file gốc (`users.py`: `/me` ở dòng 29, `/{user_id}` ở dòng 87).
  Nếu đăng ký ngược lại, `"me"` sẽ bị khớp vào `{user_id}` → cố parse `"me"` thành UUID →
  **422** thay vì trả hồ sơ. Đây là bẫy routing kinh điển khi port sang NestJS
  (thứ tự decorator trong controller quyết định thứ tự match).
- Không có dấu `/` cuối ở path này (khác `/users/`).
- Đây là endpoint **Bearer thường**, không phải admin — dù các route `/users/*` khác đều là
  admin. Đừng gắn guard admin cho cả controller.

---

### PATCH /api/v1/users/me

> **Cập nhật hồ sơ của chính mình** — user tự sửa thông tin cá nhân; không được sửa role, status hay email.

| | |
|---|---|
| **Quyền** | **Bearer** (`CurrentUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `users` (chỉ các field có mặt trong body); `updated_at` tự cập nhật qua `onupdate=func.now()`. **Không** ghi `admin_audit_log`. |

**Path params**

—

**Query params**

—

**Request body**

Tất cả field đều **optional**; ngữ nghĩa là `exclude_unset` (xem ghi chú).

~~~ts
/** app/schemas/user.py :: UserUpdate */
interface UserSelfUpdateRequest {
  full_name?: string | null;        // 1..200
  phone_number?: string | null;     // <=30, validator libphonenumber VN
  avatar_url?: string | null;       // <=2048 — CHỈ kiểm độ dài, KHÔNG kiểm là URL
  date_of_birth?: string | null;    // "YYYY-MM-DD" — KHÔNG kiểm tuổi/quá khứ
  gender?: string | null;           // <=20, chuỗi tự do
  country?: string | null;          // <=100
  province_state?: string | null;   // <=100
  city?: string | null;             // <=100
  district?: string | null;         // <=100
  ward?: string | null;             // <=100
  street_address?: string | null;   // <=500
  postal_code?: string | null;      // <=20
}
~~~

~~~json
{
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678",
  "date_of_birth": "1992-03-14",
  "gender": "male",
  "country": "Việt Nam",
  "province_state": "Hồ Chí Minh",
  "city": "Hồ Chí Minh",
  "district": "Quận 1",
  "ward": "Phường Bến Nghé",
  "street_address": "12 Nguyễn Huệ",
  "postal_code": "700000"
}
~~~

**Response 200**

~~~ts
type UserSelfUpdateResponse = UserResponse;
~~~

~~~json
{
  "id": "9f1c7d2e-5b83-4a16-9d0f-2c4a8e7b6103",
  "email": "nguyen.van.an@gmail.com",
  "full_name": "Nguyễn Văn An",
  "phone_number": "0912345678",
  "phone_country_code": "+84",
  "phone_national_number": "912345678",
  "phone_e164": "+84912345678",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": "1992-03-14",
  "gender": "male",
  "country": "Việt Nam",
  "province_state": "Hồ Chí Minh",
  "city": "Hồ Chí Minh",
  "district": "Quận 1",
  "ward": "Phường Bến Nghé",
  "street_address": "12 Nguyễn Huệ",
  "postal_code": "700000",
  "role": "user",
  "status": "active",
  "is_email_verified": true,
  "email_verified_at": "2026-08-17T04:01:09.220145+00:00",
  "last_login_at": "2026-08-17T06:12:44.918233+00:00",
  "created_at": "2026-07-02T09:41:03.114820",
  "updated_at": "2026-08-17T07:55:41.660210"
}
~~~

**Bảng phân quyền theo field**

| Field | Self (`PATCH /users/me`) | Admin (`PATCH /users/{user_id}`) | Ghi chú |
|---|---|---|---|
| `full_name` | ✅ | ✅ | |
| `phone_number` | ✅ | ✅ | kéo theo 3 field dẫn xuất |
| `avatar_url` | ✅ | ✅ | |
| `date_of_birth` | ✅ | ✅ | |
| `gender` | ✅ | ✅ | |
| `country`, `province_state`, `city`, `district`, `ward`, `street_address`, `postal_code` | ✅ | ✅ | |
| `role` | ❌ **bị bỏ qua âm thầm** | ✅ | xem cảnh báo dưới |
| `status` | ❌ **bị bỏ qua âm thầm** | ✅ | |
| `is_email_verified` | ❌ **bị bỏ qua âm thầm** | ✅ | |
| `email` | ❌ không endpoint nào sửa được | ❌ | bất biến sau khi tạo |
| `password` | ❌ | ❌ | chỉ qua luồng `forgot`/`reset-password` |
| `phone_country_code`, `phone_national_number`, `phone_e164` | ❌ (dẫn xuất) | ❌ (dẫn xuất) | server tính, client không set |
| `phone_verified_at`, `email_verified_at`, `last_login_at`, `deleted_at`, `created_at`, `updated_at` | ❌ | ❌ | server quản lý |
| `telegram_chat_id`, `telegram_linked_at` | ❌ | ❌ | có endpoint riêng ở nhóm Telegram |

> ⚠️ **`role` / `status` / `is_email_verified` gửi vào `PATCH /users/me` KHÔNG gây lỗi 422
> và KHÔNG bị 403 — chúng bị Pydantic loại bỏ âm thầm** (`UserUpdate` không đặt
> `model_config`, nên mặc định Pydantic v2 là `extra='ignore'`). Response 200 với `role`
> nguyên như cũ. Đã kiểm chứng: `UserUpdate(**{'full_name':'A','role':'admin'}).model_dump(exclude_unset=True)`
> → `{'full_name': 'A'}`.
> Trong NestJS mặc định `ValidationPipe({ whitelist: true })` cho hành vi tương đương;
> **đừng** bật `forbidNonWhitelisted: true` vì sẽ chuyển hành vi từ 200 sang 400 —
> đó là breaking change với frontend hiện tại.

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc các message token khác — xem `GET /auth/me`) |
| 403 | `FORBIDDEN` | `status` là `inactive` / `suspended` | `Trạng thái tài khoản: suspended` |
| 404 | `NOT_FOUND` | User bị xoá mềm giữa lúc request chạy (`get_by_id` trong service) | `Không tìm thấy người dùng` — thực tế guard đã trả 401 trước đó |
| 409 | `CONFLICT` | `phone_e164` mới đã thuộc **user khác** | `Đã tồn tại người dùng với số điện thoại này` |
| 422 | — | `full_name` là chuỗi rỗng | `String should have at least 1 character` |
| 422 | — | `phone_number` không parse được | `Value error, Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678` |
| 422 | — | `phone_number` parse được nhưng không hợp lệ | `Value error, Số điện thoại không hợp lệ` |
| 422 | — | `date_of_birth` sai format | `Input should be a valid date...` |
| 422 | — | Field vượt `max_length` | `String should have at most 100 characters` (v.v.) |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X PATCH 'https://api.iqx.vn/api/v1/users/me' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
        "full_name": "Nguyễn Văn An",
        "city": "Hồ Chí Minh",
        "district": "Quận 1",
        "phone_number": "0912345678"
      }'
~~~

**Ghi chú khi viết lại**

- **`exclude_unset` là ngữ nghĩa cốt lõi**: chỉ những key **có mặt trong JSON body** được ghi.
  - Không gửi `city` → `city` giữ nguyên.
  - Gửi `"city": null` → `city` bị **xoá về NULL** (200).
    `tests/test_users.py::test_patch_can_clear_nullable_fields` bảo vệ hành vi này.
  - Trong TS phải phân biệt được "absent" vs "present-and-null" — **không** dùng
    `?? undefined` hay `JSON.parse` rồi lọc null. Nếu dùng Prisma, chỉ đưa vào `data`
    những key thực sự có trong body (kiểm bằng `Object.prototype.hasOwnProperty`).
- **Cập nhật `phone_number` là trường hợp đặc biệt** (`UserService.update_profile`):
  1. Nếu key `phone_number` có mặt → `pop` ra khỏi `update_data`.
  2. `_parse_phone(value)`:
     - `null` → trả cả 4 field = `null` → **xoá sạch** cả 4 cột phone.
     - số hợp lệ → trả 4 field đã tách.
  3. Nếu suy ra được `phone_e164`, gọi `get_by_phone(e164)`; nếu tìm được user khác
     (`existing.id !== user_id`) → **409**. Trùng với chính mình → cho phép (idempotent).
  4. Merge 4 field vào `update_data` rồi UPDATE.
  Nghĩa là **một field trong request tạo ra bốn field trong UPDATE** — dễ bỏ sót.
- `updated_at` do DB xử lý (`onupdate=func.now()`) và là `TIMESTAMP` **không** timezone.
  Trong TS phải mô phỏng bằng `@UpdateDateColumn` / `@updatedAt` với cột không timezone.
- Handler tự gọi `UserService.get_by_id(current_user.id)` chứ không dùng entity từ guard →
  trong TS có thể tối ưu bỏ truy vấn này, nhưng nhớ vẫn phải chặn `status = 'deleted'`.
- Repository `update()` dùng `setattr` cho từng key rồi `flush()` + `refresh()`. Trong TS
  nhớ **reload entity sau UPDATE** để `updated_at` trong response là giá trị DB thật,
  không phải giá trị cũ.

---

### GET /api/v1/users/

> **Danh sách người dùng (quản trị)** — phân trang, tìm kiếm, lọc theo role/status, sắp xếp theo cột whitelist.

| | |
|---|---|
| **Quyền** | **Bearer + Admin** (`AdminUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | — (không ghi audit log cho hành vi đọc) |

> Path có **dấu `/` cuối**: `/api/v1/users/`.

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | integer | Không | `1` | `>= 1` | Trang, đánh số từ 1 |
| `page_size` | integer | Không | `20` | `1 <= x <= 100` | Số bản ghi mỗi trang |
| `search` | string \| null | Không | `null` | — | Khớp `ILIKE %term%` trên `email` **hoặc** `full_name` **hoặc** `phone_number` |
| `role` | `UserRole` \| null | Không | `null` | `admin` \| `user` \| `premium` | Lọc chính xác theo role |
| `status` | `UserStatus` \| null | Không | `null` | `active` \| `inactive` \| `suspended` \| `deleted` | Lọc chính xác theo status — xem cảnh báo |
| `sort_by` | `UserSortableField` | Không | `created_at` | enum 7 giá trị | Cột sắp xếp; ngoài whitelist → **422** |
| `sort_order` | string | Không | `desc` | regex `^(asc\|desc)$` | Hướng sắp xếp |

**Request body**

—

**Response 200**

~~~ts
type UserListResponse = PaginatedResponse<UserBriefResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "9f1c7d2e-5b83-4a16-9d0f-2c4a8e7b6103",
      "email": "nguyen.van.an@gmail.com",
      "full_name": "Nguyễn Văn An",
      "role": "user",
      "status": "active",
      "created_at": "2026-08-17T03:12:44.918233"
    },
    {
      "id": "c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48",
      "email": "tran.thi.bich@iqx.vn",
      "full_name": "Trần Thị Bích",
      "role": "premium",
      "status": "active",
      "created_at": "2026-08-14T01:44:20.007611"
    },
    {
      "id": "1a5b9c3d-2e47-4f80-b6a1-9d0c8e2f5b73",
      "email": "admin@iqx.vn",
      "full_name": "Quản trị IQX",
      "role": "admin",
      "status": "active",
      "created_at": "2026-06-01T02:00:00.000000"
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc message token tương ứng) |
| 403 | `FORBIDDEN` | Token hợp lệ nhưng `role !== 'admin'` | `Yêu cầu quyền quản trị viên` |
| 403 | `FORBIDDEN` | `status` là `inactive` / `suspended` | `Trạng thái tài khoản: suspended` |
| 422 | — | `sort_by` ngoài whitelist (ví dụ `sort_by=password`) | `Input should be 'created_at', 'updated_at', 'email', 'full_name', 'role', 'status' or 'last_login_at'` |
| 422 | — | `sort_order` khác `asc`/`desc` | `String should match pattern '^(asc\|desc)$'` |
| 422 | — | `page < 1` | `Input should be greater than or equal to 1` |
| 422 | — | `page_size > 100` hoặc `< 1` | `Input should be less than or equal to 100` |
| 422 | — | `role` / `status` không thuộc enum | `Input should be 'admin', 'user' or 'premium'` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- Không có provider ngoài.
- `page` vượt quá số trang → `items: []` nhưng `total` và `total_pages` **vẫn là giá trị thật**.
- Không kết quả → `items: []`, `total: 0`, `total_pages: 0` (**không** phải 1 —
  `math.ceil(total / page_size) if total > 0 else 0`).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/users/?page=1&page_size=20&search=nguyen&role=user&sort_by=created_at&sort_order=desc' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Query gốc luôn có `WHERE status != 'deleted'`** (`UserRepository.list_users`), rồi mới
  AND thêm các filter.
  → ⚠️ **`?status=deleted` LUÔN trả về rỗng** vì hai điều kiện xung đột
  (`status != 'deleted' AND status = 'deleted'`). Không có cách nào liệt kê user đã xoá qua
  endpoint này. Giữ nguyên hành vi (endpoint admin nâng cao ở `/api/v1/admin/users/*`
  mới xử lý việc đó — xem chương admin).
- **Escape wildcard LIKE bắt buộc**: `search` được escape theo đúng thứ tự
  `\` → `\\`, rồi `%` → `\%`, rồi `_` → `\_`; sau đó bọc `%...%` và dùng
  `ILIKE :term ESCAPE '\'`. Nếu bỏ escape, người dùng gõ `%` sẽ khớp toàn bộ bảng.
  Thứ tự escape backslash **phải trước** hai ký tự còn lại.
- `search` khớp trên `phone_number` (**chuỗi nguyên văn**), **không** khớp `phone_e164`.
  Nên tìm `"+84912"` sẽ **không** ra user đã gõ số dạng `"0912345678"`. Bẫy nghiệp vụ thật.
- `total` được tính bằng `SELECT count(*) FROM (<query đã filter>) AS anon` — đếm **trước**
  khi áp `offset`/`limit`, nhưng **sau** khi áp filter.
- Sắp xếp: `getattr(User, sort_by)`; nếu không tìm được cột (không thể xảy ra vì đã whitelist)
  thì fallback `created_at`. `order_func = desc if sort_order == 'desc' else asc` —
  nghĩa là **mọi giá trị khác `"desc"` đều thành `asc`**, nhưng regex đã chặn nên chỉ còn
  đúng hai lựa chọn.
- **Không có tie-breaker**: `ORDER BY <col> <dir>` đơn lẻ. Với `sort_by=role` hay `status`
  (nhiều dòng cùng giá trị), Postgres **không đảm bảo thứ tự ổn định** giữa các trang →
  có thể trùng/mất bản ghi khi phân trang. Khi viết lại **nên** thêm `, id ASC` làm
  tie-breaker; đây là cải thiện, ghi rõ vì nó làm thay đổi thứ tự output.
- `OFFSET (page - 1) * page_size LIMIT page_size`.
- Response dùng `UserBriefResponse` (6 field), **không** phải `UserResponse` đầy đủ.
  Đây là chủ ý giảm payload — đừng "nâng cấp" thành hồ sơ đầy đủ.

---

### POST /api/v1/users/

> **Tạo người dùng (quản trị)** — admin tạo tài khoản với `role` và `status` tùy chọn, có ghi audit log.

| | |
|---|---|
| **Quyền** | **Bearer + Admin** (`AdminUser`) |
| **Rate limit** | mặc định (60/minute per IP) — **không** bị siết 10/phút như `/auth/register` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `users`; INSERT `admin_audit_log` với `action = "user.create"`. **KHÔNG** gửi email xác thực. **KHÔNG** cấp trial 7 ngày. |

> Path có **dấu `/` cuối**: `/api/v1/users/`.

**Path params**

—

**Query params**

—

**Request body**

~~~ts
/** app/schemas/user.py :: AdminUserCreate (kế thừa UserCreate) */
interface UserAdminCreateRequest {
  email: string;                  // EmailStr, bắt buộc
  password: string;               // 8..128 + chính sách mật khẩu, bắt buộc
  full_name: string;              // 1..200, bắt buộc
  phone_number?: string | null;   // <=30, validator VN
  role?: UserRole;                // default 'user'
  status?: UserStatus;            // default 'active'
}
~~~

~~~json
{
  "email": "le.minh.chau@iqx.vn",
  "password": "Adm1n@Pass",
  "full_name": "Lê Minh Châu",
  "phone_number": "0987654321",
  "role": "premium",
  "status": "active"
}
~~~

**Response 200**

Status thực tế là **201**, `response_model = UserResponse`.

~~~ts
type UserAdminCreateResponse = UserResponse;
~~~

~~~json
{
  "id": "e3b91f24-6c07-4d58-a10b-7f2e9c4d5a86",
  "email": "le.minh.chau@iqx.vn",
  "full_name": "Lê Minh Châu",
  "phone_number": "0987654321",
  "phone_country_code": "+84",
  "phone_national_number": "987654321",
  "phone_e164": "+84987654321",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": null,
  "gender": null,
  "country": null,
  "province_state": null,
  "city": null,
  "district": null,
  "ward": null,
  "street_address": null,
  "postal_code": null,
  "role": "premium",
  "status": "active",
  "is_email_verified": false,
  "email_verified_at": null,
  "last_login_at": null,
  "created_at": "2026-08-17T08:20:11.402388",
  "updated_at": "2026-08-17T08:20:11.402388"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc message token tương ứng) |
| 403 | `FORBIDDEN` | `role !== 'admin'` | `Yêu cầu quyền quản trị viên` |
| 409 | `CONFLICT` | Email đã tồn tại | `Đã tồn tại người dùng với email này` |
| 409 | `CONFLICT` | `phone_e164` đã tồn tại | `Đã tồn tại người dùng với số điện thoại này` |
| 422 | — | Sai email / mật khẩu yếu / phone sai | giống bảng lỗi của `POST /auth/register` |
| 422 | — | `role` hoặc `status` ngoài enum | `Input should be 'admin', 'user' or 'premium'` / `Input should be 'active', 'inactive', 'suspended' or 'deleted'` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/users/' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
        "email": "le.minh.chau@iqx.vn",
        "password": "Adm1n@Pass",
        "full_name": "Lê Minh Châu",
        "phone_number": "0987654321",
        "role": "premium",
        "status": "active"
      }'
~~~

**Ghi chú khi viết lại**

- **Khác biệt then chốt so với `POST /auth/register`** — bảng đối chiếu:

  | | `/auth/register` | `POST /users/` (admin) |
  |---|---|---|
  | Quyền | Công khai | Bearer + Admin |
  | Rate limit | 10/phút | 60/phút |
  | `role` / `status` | luôn `user` / `active` | do admin chọn |
  | Email xác thực | **có** (background) | **không** |
  | Trial Premium 7 ngày | **có** (best-effort) | **không** |
  | Audit log | không | **có** (`user.create`) |
  | `session.refresh` cuối | có | không |

- `status: 'deleted'` **được phép** truyền vào (enum không loại giá trị này) → tạo ra một
  user "sinh ra đã bị xoá", không đăng nhập được và không hiện trong `GET /users/`.
  Hành vi hiện tại không chặn; nếu muốn chặn thì đó là thay đổi có chủ đích.
- Bản ghi audit (`AdminAuditService.record`):
  `action = "user.create"`, `target_entity = "user"`, `target_id = str(user.id)`,
  `before = null`, `after = { email, role, status }` (giá trị enum dạng chuỗi).
  Cùng với `admin_user_id`, `ip`, `user_agent`, `request_id` lấy từ `AuditCtx`.
  `record()` chỉ `flush()`, **không commit** — commit do `get_db` lo, nên nếu tạo user
  thất bại thì audit cũng bị rollback (đúng ý).
- `AuditContext.request_id` ưu tiên `request.state.request_id` (do `RequestIDMiddleware`
  đặt) → luôn có giá trị, kể cả khi client không gửi header.
- `email` được `.lower()` như register.

---

### GET /api/v1/users/{user_id}

> **Lấy thông tin người dùng theo ID (quản trị)** — trả hồ sơ đầy đủ của một user bất kỳ.

| | |
|---|---|
| **Quyền** | **Bearer + Admin** (`AdminUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | string (UUID) | phải parse được thành UUID, nếu không → 422 | ID người dùng cần xem |

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type UserAdminGetResponse = UserResponse;
~~~

~~~json
{
  "id": "c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48",
  "email": "tran.thi.bich@iqx.vn",
  "full_name": "Trần Thị Bích",
  "phone_number": "0901 234 567",
  "phone_country_code": "+84",
  "phone_national_number": "901234567",
  "phone_e164": "+84901234567",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": "1988-11-02",
  "gender": "female",
  "country": "Việt Nam",
  "province_state": "Hà Nội",
  "city": "Hà Nội",
  "district": "Quận Ba Đình",
  "ward": "Phường Cống Vị",
  "street_address": "45 Đội Cấn",
  "postal_code": "100000",
  "role": "premium",
  "status": "active",
  "is_email_verified": true,
  "email_verified_at": "2026-08-14T02:10:55.881204+00:00",
  "last_login_at": "2026-08-17T02:03:18.442901+00:00",
  "created_at": "2026-08-14T01:44:20.007611",
  "updated_at": "2026-08-16T23:12:07.556310"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc message token tương ứng) |
| 403 | `FORBIDDEN` | `role !== 'admin'` | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | Không có user với ID đó | `Không tìm thấy người dùng` |
| 404 | `NOT_FOUND` | User tồn tại nhưng `status = 'deleted'` | `Không tìm thấy người dùng` |
| 422 | — | `user_id` không phải UUID hợp lệ | `Input should be a valid UUID, invalid character: ...` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/users/c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- `NotFoundError("người dùng")` sinh detail bằng template `f"Không tìm thấy {resource}"`
  → chuỗi đầy đủ là **`Không tìm thấy người dùng`** (chữ thường, không hoa đầu từ "người").
  Giữ đúng nguyên văn vì frontend có thể so khớp.
- `UserService.get_by_id` **gộp** "không tồn tại" và "đã xoá mềm" thành cùng một 404.
  Hàm này được **mọi** endpoint dùng lại (kể cả guard auth) → không được thay đổi ngữ nghĩa.
- Không có endpoint tra user theo email hoặc theo số điện thoại trong nhóm này.

---

### PATCH /api/v1/users/{user_id}

> **Cập nhật người dùng (quản trị)** — admin sửa hồ sơ, `role`, `status`, `is_email_verified` của bất kỳ user nào, có ghi audit log kèm diff.

| | |
|---|---|
| **Quyền** | **Bearer + Admin** (`AdminUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `users`; INSERT `admin_audit_log` với `action = "user.update"` và diff `before`/`after` **chỉ chứa key thực sự thay đổi** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | string (UUID) | phải parse được thành UUID | ID người dùng cần sửa |

**Query params**

—

**Request body**

~~~ts
/** app/schemas/user.py :: AdminUserUpdate (kế thừa UserUpdate + 3 field admin) */
interface UserAdminUpdateRequest {
  // ── Kế thừa từ UserUpdate ──
  full_name?: string | null;        // 1..200
  phone_number?: string | null;     // <=30
  avatar_url?: string | null;       // <=2048
  date_of_birth?: string | null;    // "YYYY-MM-DD"
  gender?: string | null;           // <=20
  country?: string | null;          // <=100
  province_state?: string | null;   // <=100
  city?: string | null;             // <=100
  district?: string | null;         // <=100
  ward?: string | null;             // <=100
  street_address?: string | null;   // <=500
  postal_code?: string | null;      // <=20

  // ── CHỈ admin ──
  role?: UserRole | null;
  status?: UserStatus | null;
  is_email_verified?: boolean | null;
}
~~~

~~~json
{
  "status": "suspended",
  "role": "user",
  "is_email_verified": true
}
~~~

**Response 200**

~~~ts
type UserAdminUpdateResponse = UserResponse;
~~~

~~~json
{
  "id": "c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48",
  "email": "tran.thi.bich@iqx.vn",
  "full_name": "Trần Thị Bích",
  "phone_number": "0901 234 567",
  "phone_country_code": "+84",
  "phone_national_number": "901234567",
  "phone_e164": "+84901234567",
  "phone_verified_at": null,
  "avatar_url": null,
  "date_of_birth": "1988-11-02",
  "gender": "female",
  "country": "Việt Nam",
  "province_state": "Hà Nội",
  "city": "Hà Nội",
  "district": "Quận Ba Đình",
  "ward": "Phường Cống Vị",
  "street_address": "45 Đội Cấn",
  "postal_code": "100000",
  "role": "user",
  "status": "suspended",
  "is_email_verified": true,
  "email_verified_at": "2026-08-14T02:10:55.881204+00:00",
  "last_login_at": "2026-08-17T02:03:18.442901+00:00",
  "created_at": "2026-08-14T01:44:20.007611",
  "updated_at": "2026-08-17T08:41:33.019477"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc message token tương ứng) |
| 403 | `FORBIDDEN` | `role !== 'admin'` | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | User không tồn tại hoặc đã xoá mềm | `Không tìm thấy người dùng` |
| 409 | `CONFLICT` | `phone_e164` mới thuộc user khác | `Đã tồn tại người dùng với số điện thoại này` |
| 422 | — | `role` / `status` ngoài enum | `Input should be 'admin', 'user' or 'premium'` / `Input should be 'active', 'inactive', 'suspended' or 'deleted'` |
| 422 | — | `phone_number` sai | `Value error, Số điện thoại không hợp lệ...` |
| 422 | — | `full_name` rỗng, field vượt max_length, `date_of_birth` sai format | message chuẩn Pydantic |
| 422 | — | `user_id` không phải UUID | `Input should be a valid UUID, ...` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X PATCH 'https://api.iqx.vn/api/v1/users/c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"status": "suspended", "is_email_verified": true}'
~~~

**Ghi chú khi viết lại**

- **Thứ tự bắt buộc trong handler** (`users.py :: admin_update_user`):
  1. `existing = get_by_id(user_id)` — **404 xảy ra ở đây, trước mọi thứ**.
  2. `patch = data.model_dump(exclude_unset=True)` — chỉ key có mặt trong body.
  3. `before_raw = { k: getattr(existing, k, null) for k in patch }` — snapshot **chỉ**
     các key sắp sửa.
  4. Chuẩn hoá enum: `v.value if hasattr(v, "value") else v`.
  5. `admin_update(user_id, data)` (có thể ném 409).
  6. `after_vals` tính lại từ entity sau update, cùng chuẩn hoá enum.
  7. `diff_dict(before_vals, after_vals)` → chỉ giữ key **thực sự đổi giá trị**;
     nếu không có key nào đổi thì trả `(null, null)`.
  8. `AdminAuditService.record(action="user.update", target_entity="user",
     target_id=str(user.id), before=b, after=a)`.
  → PATCH không đổi gì (gửi lại giá trị y hệt) vẫn tạo **một dòng audit** với
  `payload_before = null`, `payload_after = null`. Giữ nguyên hành vi này.
- ⚠️ **Bẫy `phone_number` trong diff**: bước 3 snapshot theo key của `patch`, tức
  `before_vals` chứa `phone_number` cũ; bước 6 đọc `user.phone_number` mới. Nhưng
  `admin_update` còn ghi thêm 3 field dẫn xuất (`phone_country_code`,
  `phone_national_number`, `phone_e164`) — **3 field này KHÔNG xuất hiện trong audit diff**
  vì không nằm trong `patch`. Audit log vì thế không đầy đủ. Giữ nguyên (hoặc mở rộng
  có ý thức, và ghi vào changelog).
- ⚠️ **`is_email_verified: true` KHÔNG set `email_verified_at`.** Chỉ cờ boolean được đổi,
  timestamp giữ `null`. Kết quả là trạng thái không nhất quán (đã verify nhưng không biết
  lúc nào). Chỉ luồng `GET /auth/verify-email` mới set cả hai. Đây là hành vi thật —
  đừng "sửa" trong bản TS nếu không cập nhật cả frontend.
- ⚠️ **`status: "deleted"` qua PATCH ≠ `DELETE /users/{user_id}`.** PATCH chỉ đổi `status`
  và **không** set `deleted_at`; DELETE set **cả hai**. Nếu bản TS suy ra "đã xoá" từ
  `deleted_at != null` thì hai đường sẽ cho kết quả khác nhau. Nguồn sự thật duy nhất
  cho "đã xoá" là `status === 'deleted'` (đúng như `UserService.get_by_id`).
- **Không có guard tự-bảo-vệ**: admin có thể tự hạ `role` của mình xuống `user`, hoặc
  tự đặt `status = 'suspended'`, và ngay sau đó mất quyền admin. Không có kiểm tra
  "không được sửa chính mình" và không có kiểm tra "phải còn ít nhất 1 admin".
- `email` và `password` **không** sửa được qua endpoint này (không có trong schema).
  Muốn đổi mật khẩu cho user khác thì dùng nhóm admin nâng cao
  (`POST /api/v1/admin/users/{user_id}/reset-password`).
- Logic ghi dữ liệu (`UserService.admin_update`) **giống hệt** `update_profile`, chỉ khác
  schema đầu vào — có thể chia sẻ một hàm chung trong TS, nhưng phải giữ hai schema riêng
  để phân quyền theo field.

---

### DELETE /api/v1/users/{user_id}

> **Xóa người dùng (quản trị)** — xóa **mềm**: đặt `status = 'deleted'` và `deleted_at = now()`; không xoá dòng nào khỏi DB.

| | |
|---|---|
| **Quyền** | **Bearer + Admin** (`AdminUser`) |
| **Rate limit** | mặc định (60/minute per IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `users SET status = 'deleted', deleted_at = now()`; INSERT `admin_audit_log` với `action = "user.delete"`. **KHÔNG** xoá dòng, **KHÔNG** cascade, **KHÔNG** revoke refresh token, **KHÔNG** gửi email. |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | string (UUID) | phải parse được thành UUID | ID người dùng cần xoá mềm |

**Query params**

—

**Request body**

Không cần body.

**Response 200**

~~~ts
type UserAdminDeleteResponse = CommonMessageResponse;
~~~

~~~json
{
  "message": "Xóa người dùng thành công",
  "detail": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (tiếng Việt, đúng nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` (hoặc message token tương ứng) |
| 403 | `FORBIDDEN` | `role !== 'admin'` | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | User không tồn tại | `Không tìm thấy người dùng` |
| 404 | `NOT_FOUND` | User **đã** bị xoá mềm trước đó (gọi DELETE lần 2) | `Không tìm thấy người dùng` |
| 422 | — | `user_id` không phải UUID | `Input should be a valid UUID, ...` |
| 429 | — | Vượt 60 request/phút/IP | `{"error": "Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- **Không idempotent về status code**: lần đầu 200, lần hai **404** (vì `get_by_id` lọc
  `deleted`). Frontend phải xử lý được 404 khi bấm xoá hai lần.

**curl**

~~~bash
curl -sS -X DELETE 'https://api.iqx.vn/api/v1/users/c4d8e2a1-7b60-4f93-8a25-6e1b0d3f7c48' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Xoá MỀM, không xoá cứng.** `UserRepository.soft_delete` chỉ làm hai việc:
  `user.status = UserStatus.DELETED` và `user.deleted_at = datetime.now(UTC)`.
  Không có `DELETE FROM users` ở bất kỳ đâu trong API.
- **Không có cascade nào chạy.** Trong schema có ~25 FK trỏ tới `users.id`
  (`ON DELETE CASCADE` cho phần lớn: `refresh_tokens`, giao dịch ảo, watchlist, alert,
  subscription…; `ON DELETE SET NULL` cho `user_login_history` và vài bảng audit;
  `ON DELETE RESTRICT` cho một bảng). Vì không có DELETE thật, **các quy tắc này không
  bao giờ được kích hoạt** từ endpoint này. Mọi dữ liệu liên quan (danh mục ảo, lịch sử
  giao dịch, subscription, watchlist) **vẫn còn nguyên**.
- **Refresh token KHÔNG bị revoke khi xoá mềm.** Chúng vẫn `revoked = false` trong DB.
  Chúng trở nên vô dụng **gián tiếp**: `AuthService.refresh_tokens` gọi `get_by_id`
  → `NotFoundError` → **401 `Tài khoản người dùng không còn khả dụng`**.
  Tương tự với access token (`get_current_user_from_token` cũng → 401).
  `tests/test_auth.py::test_deleted_user_token_returns_401` assert `status_code in (401, 403)`.
  → Nếu bản TS thay "lọc deleted trong get_by_id" bằng cách khác, phải **tự** revoke
  refresh token trong DELETE, nếu không tài khoản đã xoá vẫn refresh được token mới.
- **Thứ tự handler**: `get_by_id` (404 tại đây) → lưu `before_status = existing.status.value`
  → `soft_delete` → audit `record(action="user.delete", target_entity="user",
  target_id=str(user_id), before={"status": <status cũ>}, after={"status": "deleted"})`.
  Lưu ý `after` là **chuỗi hằng `"deleted"`**, không đọc lại từ entity.
- **Không có guard chống tự xoá**: admin có thể DELETE chính mình → mất quyền truy cập ngay
  ở request kế tiếp. Không có kiểm tra "phải còn ít nhất một admin".
- Message trả về đúng nguyên văn `"Xóa người dùng thành công"`
  (`tests/test_users.py::test_admin_delete_user` assert chuỗi này).
  Chú ý dấu: **"Xóa"** (không phải "Xoá") — giữ đúng ký tự.

---

## Luồng đầy đủ

#### Luồng 1 — `register` → `verify-email` → `login` → `refresh` → `logout`

~~~mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant API as Backend API
    participant DB as Postgres
    participant BG as BackgroundTask
    participant RS as Resend
    participant MAIL as Hộp thư người dùng

    FE->>API: POST /api/v1/auth/register<br/>{email, password, full_name, phone_number}
    API->>DB: SELECT count(*) WHERE email = lower(email)
    API->>DB: SELECT count(*) WHERE phone_e164 = ?
    API->>DB: INSERT users (role='user', status='active',<br/>is_email_verified=false)
    API->>DB: PremiumService.grant_trial_if_eligible()<br/>INSERT subscription TRIAL_7D (best-effort)
    API-->>FE: 201 UserResponse (chưa có token)
    Note over API,BG: BackgroundTask chạy SAU khi response đã trả và session đã commit
    API->>BG: _send_verification_email(user_id, email, full_name)
    BG->>BG: create_email_verify_token()<br/>JWT ký JWT_SECRET_KEY, TTL 48h
    BG->>RS: POST https://api.resend.com/emails<br/>subject "Xác thực địa chỉ email của bạn"
    RS->>MAIL: Email chứa link<br/>{BASE}/api/v1/auth/verify-email?token=...
    Note over BG: Mọi lỗi bị nuốt + logger.exception<br/>→ KHÔNG ảnh hưởng 201 đã trả

    MAIL->>API: GET /api/v1/auth/verify-email?token=...
    API->>API: decode_email_verify_token()<br/>check type == 'email_verify'
    API->>DB: UPDATE users SET is_email_verified=true,<br/>email_verified_at=now()
    API-->>MAIL: 200 HTML "Xác thực thành công"

    FE->>API: POST /api/v1/auth/login {email, password}
    API->>DB: SELECT user WHERE email = lower(email)
    API->>API: bcrypt verify
    Note over API: KHÔNG kiểm is_email_verified — user chưa verify vẫn login được
    API->>DB: UPDATE users SET last_login_at = now()
    API->>DB: INSERT refresh_tokens (jti, token_family=uuid4(),<br/>expires_at=+7d, revoked=false)
    API->>DB: INSERT user_login_history (success=true, failure_reason=null)
    API-->>FE: 200 {access_token (30m), refresh_token (7d), token_type:"bearer"}

    FE->>API: GET /api/v1/auth/me<br/>Authorization: Bearer <access>
    API-->>FE: 200 UserResponse

    Note over FE: Access token hết hạn sau 30 phút
    FE->>API: POST /api/v1/auth/refresh {refresh_token}
    API->>API: decode bằng JWT_REFRESH_SECRET_KEY<br/>check type=='refresh', có jti + family
    API->>DB: SELECT refresh_tokens WHERE jti = ?
    API->>API: so sánh family JWT vs DB
    API->>DB: UPDATE refresh_tokens SET revoked=true<br/>WHERE jti=? AND revoked=false  → rowcount
    alt rowcount == 0 (replay)
        API->>DB: revoke_family(family) — NHƯNG bị rollback vì raise ngay
        API-->>FE: 401 "Refresh token đã bị thu hồi (có thể bị tấn công replay)"
    else rowcount == 1
        API->>DB: SELECT user (chặn deleted) + check status=='active'
        API->>DB: INSERT refresh_tokens (jti MỚI, family GIỮ NGUYÊN)
        API-->>FE: 200 {access_token mới, refresh_token mới}
    end

    FE->>API: POST /api/v1/auth/logout<br/>Authorization: Bearer <access>  (không cần body)
    API->>DB: UPDATE refresh_tokens SET revoked=true<br/>WHERE user_id = ?  (TẤT CẢ family)
    API-->>FE: 200 {"message":"Đăng xuất thành công","detail":null}
    Note over FE,API: Access token cũ VẪN dùng được tới khi exp (≤30 phút)<br/>— không có blacklist
~~~

#### Luồng 2 — `forgot-password` → `reset-password`

~~~mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant API as Backend API
    participant DB as Postgres
    participant BG as BackgroundTask
    participant RS as Resend
    participant MAIL as Hộp thư người dùng

    FE->>API: POST /api/v1/auth/forgot-password {email}
    API->>DB: SELECT user WHERE email = lower(email)
    alt user tồn tại VÀ status == 'active'
        API->>BG: _send_reset_email(user_id, email, full_name, hashed_password)
    else user không tồn tại HOẶC status != 'active'
        Note over API: Không làm gì — KHÔNG gửi email
    end
    API-->>FE: 200 {"message":"Nếu email tồn tại trong hệ thống, chúng tôi đã gửi<br/>hướng dẫn đặt lại mật khẩu.","detail":null}
    Note over FE,API: Response GIỐNG HỆT trong mọi trường hợp<br/>→ không tiết lộ email có tồn tại

    BG->>BG: create_password_reset_token(user_id, hashed_password)<br/>JWT ký JWT_SECRET_KEY + hashed_password, TTL 2h
    BG->>RS: POST https://api.resend.com/emails<br/>subject "Đặt lại mật khẩu IQX"
    RS->>MAIL: Link {BASE}/api/v1/auth/reset-password?token=...

    MAIL->>API: GET /api/v1/auth/reset-password?token=...
    API-->>MAIL: 200 HTML form "Đặt lại mật khẩu"<br/>(2 ô mật khẩu, minlength=8, JS inline)

    MAIL->>API: POST /api/v1/auth/reset-password<br/>{token, new_password}  (fetch từ trang HTML)
    API->>API: Pydantic: 8..128 + validate_password_strength
    API->>API: read_unverified_subject(token)<br/>decode KHÔNG verify chữ ký, CHỈ lấy sub
    API->>DB: SELECT user WHERE id = sub (chặn status='deleted')
    API->>API: decode_password_reset_token(token, user.hashed_password)<br/>verify chữ ký + check type=='password_reset' + exp
    Note over API: Mọi thất bại → 400 "Liên kết đặt lại mật khẩu<br/>không hợp lệ hoặc đã hết hạn" (một message duy nhất)
    API->>DB: UPDATE users SET hashed_password = bcrypt(new_password)
    API->>DB: UPDATE refresh_tokens SET revoked=true WHERE user_id = ?
    API-->>MAIL: 200 {"message":"Mật khẩu đã được đặt lại thành công.<br/>Vui lòng đăng nhập lại.","detail":null}
    Note over API: hash đổi → khoá ký đổi → token vừa dùng<br/>và mọi token reset cũ đều vô hiệu (single-use tự nhiên)

    FE->>API: POST /api/v1/auth/login {email, new_password}
    API-->>FE: 200 {access_token, refresh_token, token_type}
~~~

---

## Phụ lục A — 2 endpoint HTML ẩn (không có trong OpenAPI)

Cả hai khai báo `include_in_schema=False` và `response_class=HTMLResponse` trong
`app/api/v1/endpoints/auth.py`, nên **không** xuất hiện ở `/openapi.json` và **không**
nằm trong 15 operation *có trong OpenAPI* của chương này — nhưng vẫn được đặc tả đầy đủ bên dưới như hai mục endpoint riêng, nâng tổng số endpoint của chương lên **17**. Chúng **bắt buộc** phải triển khai vì email
xác thực và email đặt lại mật khẩu trỏ trực tiếp tới đây. Cả hai đều **công khai**,
**không** có decorator rate limit (nên chịu 60/phút mặc định), và trả `Content-Type: text/html`.

### GET /api/v1/auth/verify-email

> **Trang xác thực email** — tiêu thụ link trong email, đánh dấu email đã xác thực. Trả **HTML**, ẩn khỏi OpenAPI (`include_in_schema=False`).

- **Mục đích**: tiêu thụ link xác thực và đánh dấu email đã xác thực.
- **Query param**: `token` — `string`, **bắt buộc** (thiếu → 422 JSON của FastAPI, không phải HTML).
- **Side-effect**: `UPDATE users SET is_email_verified = true, email_verified_at = now()`
  — **chỉ khi** `is_email_verified` đang là `false` (idempotent, verify lại là no-op thành công).
- **Thành công**: **200**, HTML, tiêu đề trang `Xác thực email`, heading `Xác thực thành công`,
  nội dung `Email của bạn đã được xác thực thành công. Bạn có thể đóng trang này.`
- **Thất bại**: **400**, HTML, heading `Xác thực không thành công`, nội dung
  `Liên kết xác thực không hợp lệ hoặc đã hết hạn.` (chú ý **có dấu chấm cuối câu**).
  Áp dụng cho: token malformed, sai chữ ký, hết hạn (>48h), `type !== 'email_verify'`,
  hoặc user không tồn tại / đã xoá mềm (`EmailTokenError` **hoặc** `NotFoundError`).
- **Token**: JWT `{ sub, email, type: 'email_verify', iat, exp }` ký bằng `JWT_SECRET_KEY`
  (khoá của access token, **không** phải khoá refresh), TTL `EMAIL_VERIFY_TOKEN_TTL_HOURS = 48`.
- **Bẫy**: token **không** bị vô hiệu sau khi dùng — nó còn hiệu lực đủ 48 giờ và bấm lại
  vẫn ra trang thành công (nhờ nhánh idempotent). Claim `email` trong payload
  **không được kiểm tra** đối chiếu với email hiện tại của user — đổi email (hiện không có
  endpoint đổi email) sẽ không làm token hết hiệu lực.
- **curl**:

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/auth/verify-email?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.SIGNATURE' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

### GET /api/v1/auth/reset-password

> **Form đặt lại mật khẩu** — trang HTML mà email reset trỏ tới. Trả **HTML**, ẩn khỏi OpenAPI (`include_in_schema=False`).

- **Mục đích**: phục vụ form HTML "đặt mật khẩu mới" mà email reset trỏ tới.
- **Query param**: `token` — `string`, **bắt buộc**.
- **Side-effect**: **không có**. Handler **không** validate token, **không** truy vấn DB —
  chỉ nhét token vào form.
- **Response**: **luôn 200** HTML, tiêu đề/heading `Đặt lại mật khẩu`
  (`tests/test_email_flows.py::test_reset_form_page_served` gọi với `token=abc` và assert 200).
  Token sai chỉ bị phát hiện khi form submit sang `POST /api/v1/auth/reset-password`.
- **Nội dung form** (`app/services/email_templates.py :: reset_form_page`):
  - `<input type="hidden" id="token">` chứa token đã `html.escape(token, quote=True)`
    — **bắt buộc escape**, nếu không sẽ có XSS phản chiếu qua query string.
  - Hai `<input type="password">` (`pw`, `pw2`), cả hai `required minlength="8"`.
  - Dòng hướng dẫn: `Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.`
  - JS inline (không thư viện ngoài): so khớp hai ô, nếu lệch hiện
    `Hai mật khẩu không khớp.` (màu `#dc2626`); nếu khớp thì `fetch('/api/v1/auth/reset-password',
    { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ token, new_password: pw }) })`.
  - Thành công (`r.ok`): hiện `d.message` (màu `#16a34a`) và ẩn form.
  - Thất bại: hiện `d.detail` hoặc fallback `Liên kết không hợp lệ hoặc đã hết hạn.`,
    bật lại nút.
  - Lỗi mạng: `Có lỗi xảy ra. Vui lòng thử lại.`
- **Bẫy**: JS gọi `fetch` bằng **đường dẫn tương đối** `/api/v1/auth/reset-password`.
  Nghĩa là trang HTML **phải** được phục vụ từ **cùng origin** với API. Nếu bản TS đặt
  trang này ở domain frontend khác, fetch sẽ trỏ sai → phải sửa thành URL tuyệt đối
  hoặc thêm CORS.
- **curl**:

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/auth/reset-password?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.SIGNATURE' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

> Có thêm một helper `reset_result_page(ok, message)` trong `email_templates.py`
> (heading `Đã đổi mật khẩu` / `Không thể đặt lại mật khẩu`) nhưng **hiện không endpoint
> nào gọi nó** — form dùng JS hiển thị kết quả inline. Không cần port nếu không dùng.

---

## Ghi chú tổng hợp khi viết lại

1. **Path có dấu `/` cuối là path thật.** `/api/v1/users/` (GET, POST) khác
   `/api/v1/users/me`. Không chuẩn hoá, không strip. Trong NestJS, `@Get()` trong
   `@Controller('users')` cho ra `/users` — **phải** khai `@Get('/')` và kiểm tra bằng
   `curl` rằng `/api/v1/users/` trả 200 chứ không 404/301.

2. **`/auth/me` và `/users/me` là hai alias trùng nhau, cùng shape `UserResponse`.**
   Giữ cả hai. Tương tự cần giữ cả hai vì frontend gọi ở các nơi khác nhau.

3. **Thứ tự đăng ký route**: `/users/me` phải trước `/users/{user_id}`. Sai thứ tự →
   `"me"` bị parse thành UUID → 422.

4. **Hai hình dạng lỗi hoàn toàn khác nhau.** Lỗi nghiệp vụ: `{detail: string, code: string}`.
   Lỗi validate: `{detail: ValidationErrorItem[]}` (mảng!). Lỗi rate limit:
   `{error: string}` (không có `detail`, không có `code`). Client hiện tại phân biệt bằng
   `typeof body.detail === 'string'`. Đừng thống nhất lại — sẽ vỡ frontend.

5. **Pydantic v2 thêm tiền tố `"Value error, "`** vào message của mọi `ValueError` do
   validator tự viết. Vì vậy `msg` thật là `"Value error, Mật khẩu phải chứa ít nhất một
   chữ in hoa"`. Nếu framework TS không thêm tiền tố này thì frontend so khớp chuỗi sẽ lệch
   — hãy đối chiếu với frontend trước khi bỏ.

6. **Timezone không đồng nhất trong cùng một response.** `created_at` / `updated_at` là
   `TIMESTAMP` (không offset trong JSON); `last_login_at` / `email_verified_at` /
   `phone_verified_at` / `deleted_at` là `TIMESTAMPTZ` (có `+00:00`). Đây là di sản từ
   `TimestampMixin` không đặt `timezone=True`. Phải giữ hoặc migrate có kế hoạch.

7. **`role` KHÔNG phản ánh Premium.** `role` chỉ là `admin` / `user` / `premium` trong DB,
   nhưng "user có Premium hay không" được quyết bởi bảng subscription
   (`app/api/deps.py :: is_premium_active`, admin luôn được coi là premium).
   Đừng suy ra quyền Premium từ `role`.

8. **Guard trả 401 cho "user đã xoá" nhưng 403 cho "user bị khoá".** Nhớ chính xác:
   `deleted` → **401** `Tài khoản người dùng không còn khả dụng`;
   `inactive`/`suspended` → **403** `Trạng thái tài khoản: <status>`.
   Nhưng ở **login** thì cả ba đều → **401** `Trạng thái tài khoản: <status>`.
   Ba nhánh, ba hành vi khác nhau — dễ port sai.

9. **`WWW-Authenticate: Bearer` — ĐÃ SỬA 2026-08-18.** `UnauthorizedError` luôn khai báo
   header này, nhưng exception handler cũ không truyền `headers` vào response nên nó bị mất
   trên mọi 401. Nay `app/main.py` truyền `headers=exc.headers`; bản TS phải làm tương tự
   (`ExceptionFilter` forward headers, không chỉ status + body).

   > Một lo ngại từng được nêu là "trả `WWW-Authenticate` sẽ làm trình duyệt hiện popup
   > đăng nhập" — **không đúng với scheme `Bearer`**. Trình duyệt chỉ mở hộp thoại
   > credential có sẵn cho các scheme nó cài đặt sẵn (`Basic`, `Digest`). `Bearer` không
   > được xử lý native nên không có popup nào. Trả header này là đúng RFC 7235 và không
   > ảnh hưởng UX.

10. **`exclude_unset` là bắt buộc cho cả hai endpoint PATCH.** Phân biệt "field vắng mặt"
    (giữ nguyên) và "field = null" (xoá về NULL). Trong TS phải dùng
    `hasOwnProperty` / raw body key set, không dùng `undefined` check trên DTO đã transform.

11. **Một field `phone_number` → bốn cột DB.** Mọi nơi ghi phone phải chạy qua
    `_parse_phone`. Kiểm tra trùng dùng `phone_e164` (đã chuẩn hoá), lưu trữ giữ
    `phone_number` nguyên văn. Cả hai cột đều `UNIQUE`.

12. **Tập ký tự đặc biệt của mật khẩu là danh sách trắng hữu hạn**
    `!@#$%^&*(),.?":{}|<>`. `-`, `_`, `+`, `=`, `[`, `]`, `;`, `'`, `/`, `\`, `~`, `` ` ``
    **không** tính. Copy nguyên regex, đừng thay bằng `\W` hay `[^a-zA-Z0-9]`.

13. **Bcrypt, không phải argon2.** `passlib.CryptContext(schemes=["bcrypt"])`. Hash cũ
    trong DB là bcrypt (`$2b$...`). Bản TS dùng `bcrypt` npm để verify được hash cũ.

14. **Email và trial là best-effort, không bao giờ làm hỏng request chính.**
    `register` bọc cả hai trong `try/except`. Trong TS: dùng queue/`setImmediate` với
    catch-all, **không** `await` trong luồng request.

15. **Không tiết lộ email ở `forgot-password`, NHƯNG có tiết lộ trạng thái ở `login`.**
    `forgot-password` luôn cùng một response. `login` với đúng mật khẩu của tài khoản
    `suspended`/`deleted` lại trả message chứa trạng thái. Bất đối xứng này là hành vi thật —
    ghi lại, đừng âm thầm sửa.

16. **Token reset mật khẩu dùng một lần "tự nhiên"** vì ký bằng
    `JWT_SECRET_KEY + user.hashed_password`. Không có bảng token, không có cột `used_at`.
    Cơ chế này phải được port **chính xác**, nếu không token sẽ dùng lại được nhiều lần.

17. **`revoke_family` khi phát hiện replay hiện đang bị rollback** (revoke rồi raise ngay,
    `get_db` rollback). Bản TS nên commit phần revoke trong transaction riêng **trước khi**
    ném lỗi — đây là bug cần sửa, không phải hành vi cần bảo tồn.

18. **Xoá là xoá mềm.** Không có DELETE thật ở bất kỳ endpoint nào. Nguồn sự thật cho
    "đã xoá" là `status === 'deleted'`, **không** phải `deleted_at != null` (vì
    `PATCH ... {"status":"deleted"}` không set `deleted_at`).

19. **Endpoint admin ghi `admin_audit_log`, endpoint self thì không.**
    `POST /users/` → `user.create`; `PATCH /users/{id}` → `user.update` (kèm diff chỉ
    chứa key đổi); `DELETE /users/{id}` → `user.delete`. `PATCH /users/me` và
    `/auth/register` **không** ghi audit. `record()` chỉ `flush()` — commit theo request.

20. **`?status=deleted` trên `GET /users/` luôn trả rỗng** vì xung đột với điều kiện gốc
    `status != 'deleted'`. Không phải bug cần sửa ở nhóm này — nhóm admin nâng cao mới
    liệt kê user đã xoá.

21. **`GET /users/` không có tie-breaker trong `ORDER BY`** → phân trang không ổn định khi
    sort theo cột có nhiều giá trị trùng (`role`, `status`). Nên thêm `, id ASC`, nhưng
    biết rằng nó thay đổi thứ tự output hiện tại.

22. **Escape wildcard LIKE theo đúng thứ tự** `\` → `%` → `_`, rồi `ILIKE ... ESCAPE '\'`.
    Bỏ bước này mở đường cho wildcard injection (gõ `%` khớp toàn bộ bảng).

23. **`total_pages === 0` khi không có kết quả** (không phải 1).

24. **Không có endpoint đổi mật khẩu khi đã đăng nhập, không có endpoint đổi email, không
    có endpoint đăng xuất một thiết bị.** Đừng "bổ sung cho đủ" — sẽ lệch với frontend
    và với tài liệu API.

25. **Không có guard tự-bảo-vệ cho admin**: admin có thể tự hạ role, tự suspend, tự xoá mềm
    chính mình; hệ thống không đảm bảo còn ít nhất một admin. Nếu muốn thêm, ghi vào
    changelog vì đó là hành vi mới.

26. **Rate limit theo IP, in-memory từng process.** Chạy nhiều replica → giới hạn thực tế
    nhân lên. Chuyển sang Redis là siết chặt hơn hiện tại → phải cân nhắc với đội frontend
    (đặc biệt `10/minute` cho `login` khi nhiều người dùng sau cùng một NAT).

27. **`X-Request-ID` phải được echo trên MỌI response**, kể cả lỗi, và phải được ghi vào
    `admin_audit_log.request_id`. Middleware này là ngoài cùng trong stack.
