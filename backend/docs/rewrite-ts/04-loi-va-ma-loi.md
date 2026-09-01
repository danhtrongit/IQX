# Lỗi & mã lỗi

Chương này là **hợp đồng lỗi** của backend IQX: mọi hình dạng JSON mà client có thể nhận khi request thất bại, mã status kèm theo, và message tiếng Việt mặc định. Frontend hiện tại (`dashboard/`) đã bám vào đúng các hình dạng này, nên bản viết lại bằng NestJS **phải tái tạo byte-for-byte** — đặc biệt là 422 của Pydantic, thứ có cấu trúc hoàn toàn khác với 4 hình dạng còn lại. Mọi con số, tên field và message trong chương này được đọc trực tiếp từ source Python và một số được **kiểm chứng bằng cách chạy thật** qua `fastapi.testclient.TestClient` trong venv của repo.

---

## 1. Bức tranh toàn cảnh — 5 hình dạng lỗi cùng tồn tại

Backend hiện tại KHÔNG có một envelope lỗi duy nhất. Có **5 hình dạng khác nhau**, tùy cơ chế sinh ra lỗi:

| # | Nguồn sinh lỗi | Hình dạng body | Có field `code`? | Ghi ở đâu |
|---|---|---|---|---|
| A | `AppException` và 7 lớp con (`app/core/exceptions.py`) | `{"detail": string, "code": string}` | ✅ Có | Handler tự viết trong `app/main.py` (dòng 127-135) |
| B | `HTTPException` thuần của FastAPI raise trực tiếp | `{"detail": string}` | ❌ Không | Handler mặc định của FastAPI |
| C | Lỗi validate của Pydantic (`RequestValidationError`) | `{"detail": Array<ValidationErrorItem>}` | ❌ Không | Handler mặc định của FastAPI — **KHÔNG bị override** |
| D | Rate limit (`RateLimitExceeded` của slowapi) | `{"error": string}` | ❌ Không | `slowapi._rate_limit_exceeded_handler` |
| E | Exception chưa bắt (500) | **text/plain**: `Internal Server Error` | ❌ Không | `ServerErrorMiddleware` của Starlette |

Cộng thêm 2 ngoại lệ đặc biệt (mục 8): webhook SePay IPN trả `{"error": "<slug>"}`, và các endpoint HTML (`/verify-email`) trả HTML thay vì JSON.

**Số lượng chỗ raise lỗi trong `app/` (đếm bằng grep, chỉ tính `raise X(`):**

| Exception | Số chỗ raise |
|---|---|
| `NotFoundError` | 104 |
| `BadRequestError` | 100 |
| `ConflictError` | 35 |
| `UnauthorizedError` | 17 |
| `ForbiddenError` | 10 |
| `UnprocessableEntityError` | 7 |
| `ServiceUnavailableError` | 2 |
| **Tổng họ `AppException`** | **275** (trải trên 30 file) |
| `HTTPException` thuần | **192** (trải trên 9 file) |
| **Tổng cộng** | **467** |

`AppException` bản thân nó **không bao giờ được raise trực tiếp** (0 chỗ) — nó chỉ là base class.

---

## 2. Envelope lỗi của `AppException` — hình dạng CHÍNH

### 2.1 Handler thực tế

`app/main.py` đăng ký handler cho `AppException` trả về **đúng 2 field**:

```json
{
  "detail": "Không tìm thấy lệnh",
  "code": "NOT_FOUND"
}
```

### 2.2 Ba cái bẫy PHẢI biết

**Bẫy 1 — `errors` được khai báo nhưng KHÔNG BAO GIỜ được trả về.**
`app/core/exceptions.py` định nghĩa model `ErrorResponse` có 3 field:

| Field | Type | Handler có emit? |
|---|---|---|
| `detail` | `str` | ✅ Có |
| `code` | `str \| None = None` | ✅ Có |
| `errors` | `list[dict[str, Any]] \| None = None` | ❌ **KHÔNG** |

Handler trong `main.py` build `content` thủ công chỉ với `detail` + `code`. Field `errors` **không xuất hiện trong bất kỳ response nào**. Hơn nữa, grep toàn bộ `app/` cho thấy `ErrorResponse` chỉ xuất hiện tại chính chỗ khai báo (`app/core/exceptions.py:12`) — **không route nào dùng nó trong `responses=`**, nên nó cũng không lọt vào `/openapi.json`. Bản NestJS **không được thêm** field `errors`.

**Bẫy 2 — `WWW-Authenticate: Bearer` từng bị MẤT (ĐÃ SỬA 2026-08-18).**
`UnauthorizedError.__init__` truyền `headers={"WWW-Authenticate": "Bearer"}` xuống `HTTPException`, nhưng handler tự viết **từng** tạo `JSONResponse(status_code=..., content=...)` mà **không truyền `headers=exc.headers`**, nên header bị nuốt trên mọi 401 (vi phạm RFC 7235).

✅ **ĐÃ SỬA 2026-08-18** (`app/main.py`): handler nay truyền `headers=exc.headers`. Kiểm chứng bằng TestClient: 401 **có** `WWW-Authenticate: Bearer`; envelope body không đổi; exception không có headers (404…) vẫn hoạt động bình thường. Có test chặn hồi quy: `tests/test_hardening.py::test_401_includes_www_authenticate_header`.

> **Lưu ý triển khai**: production chỉ có hành vi này **sau khi deploy** bản sửa. Nếu bản TS chạy song song với production **chưa** deploy, 401 của hai bên sẽ lệch đúng header này.

> Kết luận cho bản viết lại: header này hiện **không tồn tại trên đường truyền**. Nếu bản NestJS thêm nó vào, đó là *thay đổi hành vi* (có thể khiến một số HTTP client tự bật popup Basic-auth). Khuyến nghị: **giữ nguyên trạng thái không có header** để bug-compatible, và ghi chú lại. Nếu quyết định sửa, phải kiểm tra frontend interceptor trước.

**Bẫy 3 — Thứ tự ưu tiên handler.**
Tất cả lớp con của `AppException` đều kế thừa `fastapi.HTTPException`. Starlette tra handler theo MRO của exception → handler `AppException` (cụ thể hơn) **thắng** handler mặc định của `HTTPException`. Vì vậy mọi `NotFoundError`/`BadRequestError`/... đều đi qua envelope hình dạng A, còn `raise HTTPException(...)` trần thì đi qua hình dạng B.

### 2.3 Kết quả chạy thật (đã kiểm chứng, TestClient)

| Raise | Status | Body |
|---|---|---|
| `NotFoundError()` | 404 | `{"detail":"Không tìm thấy Tài nguyên","code":"NOT_FOUND"}` |
| `NotFoundError("lệnh")` | 404 | `{"detail":"Không tìm thấy lệnh","code":"NOT_FOUND"}` |
| `NotFoundError("x", detail="Không có bài nhận định cho ngày 2026-08-17")` | 404 | `{"detail":"Không có bài nhận định cho ngày 2026-08-17","code":"NOT_FOUND"}` |
| `ConflictError()` | 409 | `{"detail":"Tài nguyên đã tồn tại","code":"CONFLICT"}` |
| `UnauthorizedError()` | 401 | `{"detail":"Thông tin xác thực không hợp lệ","code":"UNAUTHORIZED"}` |
| `ForbiddenError()` | 403 | `{"detail":"Không đủ quyền truy cập","code":"FORBIDDEN"}` |
| `BadRequestError()` | 400 | `{"detail":"Yêu cầu không hợp lệ","code":"BAD_REQUEST"}` |
| `UnprocessableEntityError()` | 422 | `{"detail":"Dữ liệu không thể xử lý","code":"UNPROCESSABLE_ENTITY"}` |
| `ServiceUnavailableError()` | 503 | `{"detail":"Dịch vụ tạm thời không khả dụng","code":"SERVICE_UNAVAILABLE"}` |

---

## 3. Bảng đầy đủ exception class → status → code → message mặc định

Đọc từ `app/core/exceptions.py`.

| Class | Status | `code` | Message mặc định | Signature constructor | Header đặc biệt |
|---|---|---|---|---|---|
| `AppException` | (tham số) | (tham số, có thể `null`) | (bắt buộc truyền) | `(status_code, detail, code=None, headers=None)` | (tham số) |
| `NotFoundError` | **404** | `"NOT_FOUND"` | `f"Không tìm thấy {resource}"` — `resource` default `"Tài nguyên"` → `"Không tìm thấy Tài nguyên"` | `(resource="Tài nguyên", detail=None)` | — |
| `ConflictError` | **409** | `"CONFLICT"` | `"Tài nguyên đã tồn tại"` | `(detail="Tài nguyên đã tồn tại")` | — |
| `UnauthorizedError` | **401** | `"UNAUTHORIZED"` | `"Thông tin xác thực không hợp lệ"` | `(detail="Thông tin xác thực không hợp lệ")` | `WWW-Authenticate: Bearer` — ✅ **ĐÃ SỬA 2026-08-18** — `app_exception_handler` nay truyền `headers=exc.headers` (xem 2.2) |
| `ForbiddenError` | **403** | `"FORBIDDEN"` | `"Không đủ quyền truy cập"` | `(detail="Không đủ quyền truy cập")` | — |
| `BadRequestError` | **400** | `"BAD_REQUEST"` | `"Yêu cầu không hợp lệ"` | `(detail="Yêu cầu không hợp lệ")` | — |
| `UnprocessableEntityError` | **422** | `"UNPROCESSABLE_ENTITY"` | `"Dữ liệu không thể xử lý"` | `(detail="Dữ liệu không thể xử lý")` | — |
| `ServiceUnavailableError` | **503** | `"SERVICE_UNAVAILABLE"` | `"Dịch vụ tạm thời không khả dụng"` | `(detail="Dịch vụ tạm thời không khả dụng")` | — |

### 3.1 Điểm riêng của `NotFoundError` — 2 tham số, KHÔNG phải 1

`NotFoundError` là lớp duy nhất có signature khác thường:

- `NotFoundError("lệnh")` → tham số đầu là **`resource`**, message = `"Không tìm thấy lệnh"` (có prefix).
- `NotFoundError(detail="Không có bài nhận định cho ngày 2026-08-17")` → `detail` **thay thế hoàn toàn**, KHÔNG có prefix.
- Trong 104 chỗ raise, cả 2 kiểu đều xuất hiện. Ví dụ kiểu `detail`: `app/api/v1/endpoints/market_analysis.py`.

Trong TS nên tách 2 factory riêng để không nhầm:

```ts
notFound('lệnh');                    // -> "Không tìm thấy lệnh"
notFoundRaw('Chưa có bài nhận định nào'); // -> detail giữ nguyên
```

### 3.2 Va chạm 422: `UnprocessableEntityError` vs lỗi Pydantic

**Cả hai đều là 422 nhưng body khác nhau hoàn toàn.** Client nhận 422 phải kiểm tra `typeof body.detail`:

- `typeof detail === 'string'` → lỗi nghiệp vụ (`UnprocessableEntityError`), có `code: "UNPROCESSABLE_ENTITY"`.
- `Array.isArray(detail)` → lỗi validate schema, không có `code`.

Đây là điểm bắt buộc phải giữ (7 chỗ raise `UnprocessableEntityError`, chủ yếu ở virtual-trading và cap5/cap6 — xem mục 11).

---

## 4. Envelope của `HTTPException` thuần — KHÔNG có field `code`

192 chỗ trong `app/` raise `fastapi.HTTPException` trực tiếp, bỏ qua hệ thống `AppException`. Chúng đi qua handler mặc định của FastAPI → body **chỉ có `detail`**:

```json
{ "detail": "Tất cả 2 nguồn dữ liệu thị trường đều thất bại" }
```

### 4.1 Phân bố theo file

| File | Số chỗ |
|---|---|
| `app/api/v1/endpoints/market_data.py` | 141 |
| `app/api/v1/endpoints/market_global.py` | 13 |
| `app/api/v1/endpoints/ai_analysis.py` | 13 |
| `app/services/lesson/service.py` | 5 |
| `app/api/v1/endpoints/backtest.py` | 5 |
| `app/api/v1/endpoints/alerts.py` | 5 |
| `app/api/v1/endpoints/ai_patterns.py` | 4 |
| `app/api/v1/endpoints/ai_forecast.py` | 3 |
| `app/api/v1/endpoints/admin_alerts.py` | 3 |

### 4.2 Phân bố theo status code

| Status | Số chỗ | Ngữ nghĩa |
|---|---|---|
| **502** | 83 | Provider dữ liệu ngoài chết / trả sai shape / AI proxy lỗi |
| **422** | 60 | Validate thủ công (enum, symbol pattern, date format) — **nhưng body là string, KHÔNG phải array!** |
| **503** | 28 | Provider transport failure (market-overview) + Telegram chưa cấu hình |
| **404** | 10 | Không tìm thấy symbol / tín hiệu / chiến lược / bài tin |
| **400** | 4 | Combination alert không hợp lệ, thiếu field cho custom signal |
| **415** | 3 | Upload sai MIME (lesson) |
| **413** | 2 | Upload quá lớn (lesson) |
| **409** | 2 | Tín hiệu / chiến lược trùng tên |

> ⚠️ **Bẫy lớn nhất của nhóm này:** 60 chỗ trả **422 với `detail` là string**, ví dụ
> `{"detail":"Mã chứng khoán không hợp lệ: vnm123456789"}`.
> Client không thể phân biệt "422 string" này với `UnprocessableEntityError` (hình dạng A) trừ khi
> nhìn field `code`. Xem cây quyết định ở mục 13.3.

---

## 5. Lỗi 422 của FastAPI/Pydantic — hình dạng HOÀN TOÀN KHÁC

`app/main.py` **KHÔNG đăng ký** handler cho `RequestValidationError`. Vì vậy FastAPI dùng handler mặc định:

```ts
// status 422
{ "detail": ValidationErrorItem[] }
```

Mỗi phần tử có các key: `type`, `loc`, `msg`, `input`, và **`ctx` chỉ xuất hiện khi loại lỗi có tham số**. Version Pydantic ở đây **không** emit key `url` (một số version Pydantic v2 cũ có).

Toàn bộ ví dụ dưới đây được **sinh ra thật** bằng `TestClient` với chính các schema trong repo (`app/schemas/user.py`, `app/schemas/virtual_trading/order.py`).

### 5.1 Thiếu field bắt buộc

`POST /api/v1/auth/register` với body `{"email":"a@b.com"}` (schema `UserCreate`):

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "password"],
      "msg": "Field required",
      "input": { "email": "a@b.com" }
    },
    {
      "type": "missing",
      "loc": ["body", "full_name"],
      "msg": "Field required",
      "input": { "email": "a@b.com" }
    }
  ]
}
```

Lưu ý: **`input` là TOÀN BỘ body**, không phải giá trị của field bị thiếu. Và Pydantic trả **tất cả** lỗi cùng lúc (không fail-fast).

### 5.2 Email sai định dạng (`EmailStr`)

Body `{"email":"khong-phai-email","password":"Abcdef1!","full_name":"A"}`:

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "email"],
      "msg": "value is not a valid email address: An email address must have an @-sign.",
      "input": "khong-phai-email",
      "ctx": { "reason": "An email address must have an @-sign." }
    }
  ]
}
```

`msg` = `"value is not a valid email address: " + ctx.reason`. Chuỗi `ctx.reason` do thư viện `email-validator` sinh ra (tiếng Anh). Các reason hay gặp: `"An email address must have an @-sign."`, `"There must be something before the @-sign."`, `"The part after the @-sign is not valid. It should have a period."`

### 5.3 Vi phạm `min_length` (string)

Body `password: "Ab1!"` (schema đòi `min_length=8`):

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "password"],
      "msg": "String should have at least 8 characters",
      "input": "Ab1!",
      "ctx": { "min_length": 8 }
    }
  ]
}
```

### 5.4 Vi phạm `field_validator` tự viết (chính sách mật khẩu)

Body `password: "abcdefgh1!"` (đủ 8 ký tự nhưng thiếu chữ in hoa):

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "password"],
      "msg": "Value error, Mật khẩu phải chứa ít nhất một chữ in hoa",
      "input": "abcdefgh1!",
      "ctx": { "error": {} }
    }
  ]
}
```

**Ba chi tiết cực dễ sai:**
1. `msg` có prefix cứng **`"Value error, "`** rồi mới đến message tiếng Việt.
2. `ctx.error` là **object rỗng `{}`** (Pydantic serialize exception object thành `{}` khi JSON hóa) — phải emit đúng `{}`, không phải `null`, không phải string.
3. `type` là `"value_error"`, giống hệt lỗi email — không phân biệt được nguồn.

4 message của policy mật khẩu (`app/schemas/user.py::validate_password_strength`, dùng chung cho register / admin-create / reset-password), kiểm theo **đúng thứ tự** và **dừng ở lỗi đầu tiên**:

| Thứ tự | Điều kiện regex | Message (sau prefix `Value error, `) |
|---|---|---|
| 1 | `[A-Z]` | `Mật khẩu phải chứa ít nhất một chữ in hoa` |
| 2 | `[a-z]` | `Mật khẩu phải chứa ít nhất một chữ thường` |
| 3 | `\d` | `Mật khẩu phải chứa ít nhất một chữ số` |
| 4 | `[!@#$%^&*(),.?\":{}\|<>]` | `Mật khẩu phải chứa ít nhất một ký tự đặc biệt` |

### 5.5 Sai kiểu (string vào int)

Body `quantity: "nhieu"` (schema `OrderCreateRequest`, `quantity: int`):

```json
{
  "detail": [
    {
      "type": "int_parsing",
      "loc": ["body", "quantity"],
      "msg": "Input should be a valid integer, unable to parse string as an integer",
      "input": "nhieu"
    }
  ]
}
```

Không có `ctx`. Các `type` họ hàng: `int_type`, `float_parsing`, `bool_parsing`, `string_type`, `list_type`, `dict_type`, `uuid_parsing`, `date_from_datetime_parsing`.

### 5.6 Vi phạm `gt` / `le` (numeric constraint)

Body `{"quantity":0,"limit_price_vnd":99999999}` (schema: `quantity: int = Field(..., gt=0, le=1_000_000)`, `limit_price_vnd: int | None = Field(None, gt=0, le=10_000_000)`):

```json
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "quantity"],
      "msg": "Input should be greater than 0",
      "input": 0,
      "ctx": { "gt": 0 }
    },
    {
      "type": "less_than_equal",
      "loc": ["body", "limit_price_vnd"],
      "msg": "Input should be less than or equal to 10000000",
      "input": 99999999,
      "ctx": { "le": 10000000 }
    }
  ]
}
```

Bảng 4 constraint số:

| Constraint | `type` | `msg` |
|---|---|---|
| `gt=N` | `greater_than` | `Input should be greater than N` |
| `ge=N` | `greater_than_equal` | `Input should be greater than or equal to N` |
| `lt=N` | `less_than` | `Input should be less than N` |
| `le=N` | `less_than_equal` | `Input should be less than or equal to N` |

`ctx` chứa đúng 1 key trùng tên constraint. Số trong `msg` **không có dấu phân cách nghìn** (`10000000`, không phải `10,000,000`).

### 5.7 Vi phạm `pattern` (cách project này làm "enum")

Nhiều schema dùng `Field(..., pattern=r"^(buy|sell)$")` thay vì Python enum. Body `{"symbol":"vnm","side":"hold","order_type":"stop","quantity":100}`:

```json
{
  "detail": [
    {
      "type": "string_pattern_mismatch",
      "loc": ["body", "symbol"],
      "msg": "String should match pattern '^[A-Z0-9]{1,10}$'",
      "input": "vnm",
      "ctx": { "pattern": "^[A-Z0-9]{1,10}$" }
    },
    {
      "type": "string_pattern_mismatch",
      "loc": ["body", "side"],
      "msg": "String should match pattern '^(buy|sell)$'",
      "input": "hold",
      "ctx": { "pattern": "^(buy|sell)$" }
    },
    {
      "type": "string_pattern_mismatch",
      "loc": ["body", "order_type"],
      "msg": "String should match pattern '^(market|limit)$'",
      "input": "stop",
      "ctx": { "pattern": "^(market|limit)$" }
    }
  ]
}
```

Chú ý `msg` bọc regex trong **dấu nháy đơn**. Regex trong `ctx.pattern` là raw, KHÔNG có nháy.

### 5.8 Sai enum thật (Python `Enum`)

Body `{"role":"superadmin","status":"zombie"}` (schema `AdminUserUpdate`, dùng `UserRole` / `UserStatus`):

```json
{
  "detail": [
    {
      "type": "enum",
      "loc": ["body", "role"],
      "msg": "Input should be 'admin', 'user' or 'premium'",
      "input": "superadmin",
      "ctx": { "expected": "'admin', 'user' or 'premium'" }
    },
    {
      "type": "enum",
      "loc": ["body", "status"],
      "msg": "Input should be 'active', 'inactive', 'suspended' or 'deleted'",
      "input": "zombie",
      "ctx": { "expected": "'active', 'inactive', 'suspended' or 'deleted'" }
    }
  ]
}
```

Quy tắc sinh `ctx.expected` (Pydantic): các giá trị bọc nháy đơn, nối bằng `", "`, **hai phần tử cuối nối bằng `" or "`** (kiểu Oxford không dấu phẩy). `msg = "Input should be " + ctx.expected`.

Thứ tự giá trị **theo thứ tự khai báo trong enum Python**, không phải alphabet — `UserRole` cho ra `'admin', 'user' or 'premium'`.

### 5.9 Query param vi phạm `ge` / `le`

`GET /page?page=0&page_size=500`:

```json
{
  "detail": [
    {
      "type": "greater_than_equal",
      "loc": ["query", "page"],
      "msg": "Input should be greater than or equal to 1",
      "input": "0",
      "ctx": { "ge": 1 }
    },
    {
      "type": "less_than_equal",
      "loc": ["query", "page_size"],
      "msg": "Input should be less than or equal to 100",
      "input": "500",
      "ctx": { "le": 100 }
    }
  ]
}
```

**Khác biệt cực quan trọng:** với query param, `input` là **string** (`"0"`, `"500"`) vì đến từ query string; với JSON body, `input` giữ kiểu gốc (`0`, `500` là number). Bản NestJS phải giữ đúng: query → string, body → kiểu JSON gốc.

Giá trị đầu tiên của `loc` là **nguồn**: `"body"` | `"query"` | `"path"` | `"header"` | `"cookie"`.

### 5.10 JSON malformed

`POST` với `Content-Type: application/json` và body `{khong-phai-json`:

```json
{
  "detail": [
    {
      "type": "json_invalid",
      "loc": ["body", 1],
      "msg": "JSON decode error",
      "input": {},
      "ctx": { "error": "Expecting property name enclosed in double quotes" }
    }
  ]
}
```

`loc[1]` là **số nguyên** — byte offset nơi JSON hỏng. Đây là chỗ duy nhất `loc` chứa số (ngoài chỉ số phần tử array).

### 5.11 Thiếu body hoàn toàn

`POST` không có body:

```json
{
  "detail": [
    { "type": "missing", "loc": ["body"], "msg": "Field required", "input": null }
  ]
}
```

### 5.12 Body không phải object (string / số / sai Content-Type)

Body `"chuoi-thuan"` hoặc `Content-Type: text/plain` với payload `abc`:

```json
{
  "detail": [
    {
      "type": "model_attributes_type",
      "loc": ["body"],
      "msg": "Input should be a valid dictionary or object to extract fields from",
      "input": "abc"
    }
  ]
}
```

### 5.13 Cách reproduce y hệt trong NestJS

Đây là phần khó nhất khi port. Kế hoạch:

1. **Viết một `ZodValidationPipe` tự chế** — không dùng `ZodValidationPipe` mặc định của `nestjs-zod`, vì nó trả 400 và format khác.
2. Pipe `catch (ZodError)` → map từng `issue` của Zod sang `ValidationErrorItem`, rồi `throw new HttpException({ detail: items }, 422)`.
3. **Bảng map Zod issue → Pydantic type/msg** (viết một lần dùng chung, để trong `src/common/validation/pydantic-error-map.ts`):

| Zod issue | Pydantic `type` | `msg` cần tạo | `ctx` |
|---|---|---|---|
| `invalid_type` + `received: 'undefined'` | `missing` | `Field required` | (không có) |
| `invalid_type` (string → number) | `int_parsing` | `Input should be a valid integer, unable to parse string as an integer` | (không có) |
| `too_small` (`type: 'string'`) | `string_too_short` | `String should have at least {N} characters` | `{min_length: N}` |
| `too_big` (`type: 'string'`) | `string_too_long` | `String should have at most {N} characters` | `{max_length: N}` |
| `too_small` (`type: 'number'`, `inclusive: false`) | `greater_than` | `Input should be greater than {N}` | `{gt: N}` |
| `too_small` (`type: 'number'`, `inclusive: true`) | `greater_than_equal` | `Input should be greater than or equal to {N}` | `{ge: N}` |
| `too_big` (`type: 'number'`, `inclusive: false`) | `less_than` | `Input should be less than {N}` | `{lt: N}` |
| `too_big` (`type: 'number'`, `inclusive: true`) | `less_than_equal` | `Input should be less than or equal to {N}` | `{le: N}` |
| `invalid_string` (`validation: 'regex'`) | `string_pattern_mismatch` | `String should match pattern '{regex}'` | `{pattern: regex}` |
| `invalid_string` (`validation: 'email'`) | `value_error` | `value is not a valid email address: {reason}` | `{reason}` |
| `invalid_enum_value` | `enum` | `Input should be {expected}` | `{expected}` |
| `custom` (từ `.refine()`) | `value_error` | `Value error, {message}` | `{error: {}}` |
| lỗi parse JSON (bắt ở body-parser) | `json_invalid` | `JSON decode error` | `{error: "<message của JSON.parse>"}` |

4. **Bắt buộc: `abortEarly: false`.** Zod mặc định thu tất cả issue của cùng object → khớp hành vi Pydantic. Nhưng `.refine()` chỉ chạy sau khi schema base pass — Pydantic `field_validator` cũng vậy. Với **nhiều `field_validator` trên cùng một field** (như password policy), phải đảm bảo chỉ trả **lỗi đầu tiên** (Pydantic dừng ở `raise ValueError` đầu tiên).
5. **`input`**: với body, gán giá trị JSON tại `loc` (với `type: "missing"` thì gán **toàn bộ object cha**). Với query, gán **string thô** từ query string.
6. **Viết snapshot test** đối chiếu với 13 payload JSON ở mục 5.1–5.12. Đây là cách duy nhất chắc chắn không trôi.

---

## 6. 429 Rate limit

Cơ chế: `slowapi` 0.1.9, cấu hình ở `app/core/rate_limit.py`.

```
limiter = Limiter(
    key_func=get_remote_address,      # key theo IP client
    default_limits=[RATE_LIMIT_DEFAULT],
    storage_uri="memory://",          # per-process, KHÔNG chia sẻ giữa worker
    enabled=(APP_ENV not in ("testing", "test")),
)
```

### 6.1 Body (đã kiểm chứng)

```json
{ "error": "Rate limit exceeded: 60 per 1 minute" }
```

- Field là **`error`**, KHÔNG phải `detail`. Không có `code`.
- Chuỗi được build là `f"Rate limit exceeded: {exc.detail}"`, trong đó `exc.detail = str(limit.limit)`.
- Format của `str(limit)` (thư viện `limits`) — đã kiểm chứng:

| Config string | `str(limit)` | Body đầy đủ |
|---|---|---|
| `"60/minute"` | `60 per 1 minute` | `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| `"10/minute"` | `10 per 1 minute` | `{"error":"Rate limit exceeded: 10 per 1 minute"}` |
| `"120/minute"` | `120 per 1 minute` | `{"error":"Rate limit exceeded: 120 per 1 minute"}` |

### 6.2 Header

`Limiter(...)` **không truyền `headers_enabled`** → default `False`. Đã kiểm chứng: response 429 **KHÔNG có** `Retry-After`, **KHÔNG có** `X-RateLimit-Limit` / `-Remaining` / `-Reset`. Chỉ có `content-type: application/json` và `content-length`.

Một khác biệt nhỏ nhưng thật, do thứ tự middleware (xem mục 9):

| Nguồn 429 | Có `X-Request-ID`? |
|---|---|
| `SlowAPIMiddleware` (limit mặc định, áp cho mọi route không có decorator) | ❌ **Không** |
| `@limiter.limit(...)` (decorator trên route) | ✅ Có |

### 6.3 Ba mức limit và route nào áp dụng

Đọc từ `app/core/config.py` (dòng 83-85):

| Env var | Default | Áp cho |
|---|---|---|
| `RATE_LIMIT_DEFAULT` | `"60/minute"` | **Mọi route** không có decorator, qua `SlowAPIMiddleware` |
| `RATE_LIMIT_AUTH` | `"10/minute"` | 5 route trong `app/api/v1/endpoints/auth.py`: `POST /register`, `POST /login`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password` |
| `RATE_LIMIT_MARKET_DATA` | `"120/minute"` | **Đúng 1 route**: `POST /api/v1/market-data/trading/price-board` |

**Quan trọng — decorator KHÔNG cộng dồn với default.** Đọc `slowapi/middleware.py::_should_exempt`: nếu route có tên trong `limiter._route_limits` thì middleware **bỏ qua hoàn toàn** route đó ("we let the decorator handle it"). Nghĩa là `/auth/login` chỉ bị giới hạn 10/phút, **không** đồng thời bị 60/phút.

### 6.4 Mapping sang NestJS

- `storage_uri="memory://"` là **per-process**. Nếu bản NestJS chạy nhiều instance/worker, dùng in-memory store sẽ cho hạn mức thực tế = `N × limit` (giống hệt hiện trạng). Muốn giữ nguyên hành vi thì dùng in-memory; muốn sửa thì dùng Redis store và **ghi rõ đây là thay đổi hành vi**.
- `key_func=get_remote_address` → key = IP. Sau reverse proxy, `get_remote_address` đọc `request.client.host`. **CHƯA XÁC ĐỊNH** — cần đọc cấu hình proxy/uvicorn (`--proxy-headers`) trong hạ tầng Coolify để biết IP thấy được là IP thật hay IP của proxy.
- Phải override response body của `@nestjs/throttler` thành `{"error": "Rate limit exceeded: N per 1 minute"}` — mặc định Nest trả `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`, khác hoàn toàn.

---

## 7. 404 / 405 / 500 — hình dạng mặc định của Starlette

Đã kiểm chứng bằng TestClient.

### 7.1 Route không tồn tại → 404

```json
{ "detail": "Not Found" }
```

Header: chỉ `content-type: application/json`, `content-length: 22`. Message là **tiếng Anh**, không phải tiếng Việt — khác hẳn 404 nghiệp vụ (`NotFoundError`) vốn có `code: "NOT_FOUND"` và message tiếng Việt.

### 7.2 Method không cho phép → 405

```json
{ "detail": "Method Not Allowed" }
```

Header **có thêm `Allow`** liệt kê method hợp lệ, ví dụ `Allow: GET`. Message cũng tiếng Anh, cũng **không có** `code`.

### 7.3 Exception chưa bắt → 500 (KHÔNG phải JSON!)

```
HTTP/1.1 500 Internal Server Error
content-type: text/plain; charset=utf-8
content-length: 21

Internal Server Error
```

- **Body là plain text**, không phải JSON. Client cố `response.json()` sẽ throw.
- **KHÔNG có** `X-Request-ID` (xem 9.2).
- **KHÔNG có** CORS header → trên browser, lỗi 500 từ cross-origin hiện ra như lỗi CORS chứ không phải 500.
- `app/main.py` **không đăng ký** handler cho `Exception`, nên đây là hành vi mặc định của `ServerErrorMiddleware`.

> Với bản NestJS: mặc định `BaseExceptionFilter` của Nest trả JSON `{"statusCode":500,"message":"Internal server error"}`. Đây là **cải thiện**, nhưng là thay đổi hành vi. Quyết định phải rõ ràng: hoặc giữ nguyên `text/plain` cho tương thích tuyệt đối, hoặc đổi sang JSON và thông báo cho frontend. Khuyến nghị: **đổi sang JSON `{"detail":"Internal Server Error","code":null}`** và sửa frontend, vì trạng thái hiện tại là một khiếm khuyết thực sự.

---

## 8. Các envelope lỗi ĐẶC BIỆT, không theo chuẩn

### 8.1 Webhook SePay IPN — `{"error": "<slug>"}`

`POST /api/v1/premium/sepay/ipn` (`app/api/v1/endpoints/premium.py`) **không raise exception**, mà `return JSONResponse(...)` với hình dạng riêng:

| Điều kiện | Status | Body | Side-effect (luôn xảy ra TRƯỚC khi trả) |
|---|---|---|---|
| Secret key không đúng | **401** | `{"error": "unauthorized"}` | Ghi `IPNLog` với `result_status="secret_invalid"`, `secret_key_valid=False` |
| Body không parse được JSON | **400** | `{"error": "invalid_json"}` | Ghi `IPNLog` `result_status="invalid_json"`, `error_message="malformed JSON body"`, `raw_body=None` |
| Payload không khớp `IPNPayload` | **400** | `{"error": "invalid_payload"}` | Ghi `IPNLog` `result_status="invalid_payload"`, `error_message=str(exc.errors())` |
| Thành công | 200 | `result` (dict của service) | — |

Đây là hợp đồng với **SePay** (bên thứ ba), nên tuyệt đối không được đổi hình dạng.

### 8.2 Endpoint HTML — không trả JSON khi lỗi

| Endpoint | Lỗi | Status | Body |
|---|---|---|---|
| `GET /api/v1/auth/verify-email?token=...` | `EmailTokenError` hoặc `NotFoundError` | **400** | **HTML** — trang `verify_result_page(False, "Liên kết xác thực không hợp lệ hoặc đã hết hạn.")` |
| `GET /api/v1/auth/reset-password?token=...` | (không validate token ở bước này) | 200 | HTML form |

Cả hai đều `include_in_schema=False`.

### 8.3 `GET /api/v1/health` — 503 nhưng body là payload thành công

`app/api/v1/endpoints/health.py` trả `HealthResponse` với `status_code = 200 if database=="healthy" else 503`. Body **không phải envelope lỗi** mà là:

```json
{
  "status": "degraded",
  "app_name": "...",
  "version": "...",
  "environment": "...",
  "database": "unhealthy",
  "redis": "...",
  "timestamp": "2026-08-17T..."
}
```

Redis unhealthy **không** làm 503 (chỉ database mới tính).

### 8.4 WebSocket `/api/v1/market-data/ws` — lỗi trong frame, không có HTTP status

`app/api/v1/endpoints/realtime_ws.py`:

| Tình huống | Hành vi |
|---|---|
| `REALTIME_ENABLED = False` | `ws.close(code=1013)` (*try again later*) — **đóng trước cả `accept()`** |
| Client gửi message không khớp `ClientMessage` | Gửi frame `{"type":"error","detail":"invalid message"}`, **giữ kết nối**, tiếp tục vòng lặp |
| Vượt `REALTIME_WS_MAX_SYMBOLS_PER_CONN` | Gửi frame `{"type":"error","detail":"symbol limit reached"}` cho từng cặp bị chặn, `continue` (các cặp khác vẫn đăng ký được) |
| Client `{"action":"ping"}` | Trả `{"type":"pong"}` |
| Exception khác trong session | Log `debug`, **thoát vòng lặp im lặng**, gọi `conn.close()` để nhả ref-count |

Lưu ý: mã channel `"index"` **không tính** vào cap symbol.

### 8.5 Telegram webhook — luôn 200 kể cả khi sai secret

`POST /api/v1/telegram/webhook/{secret}` (`app/api/v1/endpoints/telegram.py`) trả `{"ok": true}` **trong mọi trường hợp**: secret sai, header `X-Telegram-Bot-Api-Secret-Token` sai, JSON hỏng, update không phải dict. Chủ ý: không leak thông tin. So sánh secret bằng `hmac.compare_digest` (constant-time). **Không được** "sửa" thành 401/403.

---

## 9. Header trên response lỗi

### 9.1 Thứ tự middleware thực tế (đã kiểm chứng)

`app/main.py` gọi `add_middleware` theo thứ tự: CORS (dòng 114) → RequestID (124) → SlowAPI (140). Trong Starlette, **middleware thêm SAU sẽ bọc ngoài**. Stack thực tế từ ngoài vào trong:

```
SlowAPIMiddleware  →  RequestIDMiddleware  →  CORSMiddleware  →  ExceptionMiddleware  →  router
```

> Comment trong `main.py` viết "Add RequestIDMiddleware AFTER CORS so it wraps outermost" — nhưng `SlowAPIMiddleware` được thêm sau nữa nên **SlowAPI mới là outermost**. Hệ quả trực tiếp: 429 do middleware sinh ra không đi qua `RequestIDMiddleware` → thiếu `X-Request-ID` (mục 6.2).

### 9.2 Bảng header theo loại lỗi (đã kiểm chứng)

| Loại response | `X-Request-ID` | CORS headers | Header khác |
|---|---|---|---|
| 2xx bình thường | ✅ | ✅ (khi có `Origin` hợp lệ) | `X-Cache: HIT` nếu trả từ Redis cache |
| Lỗi `AppException` (400/401/403/404/409/422/503) | ✅ | ✅ | `WWW-Authenticate: Bearer` trên 401 (từ 2026-08-18) |
| Lỗi `HTTPException` thuần (413/415/422/502/503/...) | ✅ | ✅ | — |
| 422 validate Pydantic | ✅ | ✅ | — |
| 404 route không tồn tại / 405 | ✅ | ✅ | 405 có thêm `Allow` |
| 429 từ `SlowAPIMiddleware` | ❌ | ❌ | — |
| 429 từ `@limiter.limit` decorator | ✅ | ✅ | — |
| **500 chưa bắt** | ❌ | ❌ | `content-type: text/plain; charset=utf-8` |

### 9.3 `X-Request-ID`

`app/core/request_id.py`: đọc header `X-Request-ID` từ request, nếu không có thì sinh `uuid4()`; gán vào `request.state.request_id`; **echo lại** trên response. Bản NestJS phải giữ đúng tên header (chữ hoa như vậy) và hành vi echo-hoặc-sinh.

### 9.4 CORS và `allow_credentials`

`app/main.py` có safety check: nếu `"*"` nằm trong `cors_origins_list` **và** `allow_credentials=True` thì log warning và **tự tắt** `allow_credentials`. Chi tiết env var thuộc chương cấu hình.

---

## 10. Ai raise 502 / 503 / `ServiceUnavailableError` — provider ngoài chết

Đây là nhóm lỗi vận hành quan trọng nhất: dữ liệu thị trường đến từ nhà cung cấp bên ngoài (Vietcap/VCI, VNDirect/VND, KBS, MBK, SPL, fmarket, Google Sheets, Yahoo, AI proxy).

### 10.1 `ServiceUnavailableError` — chỉ 2 chỗ trong toàn bộ codebase

| File:dòng | Message | Ngữ cảnh |
|---|---|---|
| `app/services/virtual_trading/service.py:171` | `f"Không thể xác minh mã chứng khoán: {exc.reason}"` | Bắt `SymbolValidationError` khi **fail-closed** verify mã. `exc.reason` đến từ `app/services/virtual_trading/price_resolver.py`, có 2 dạng: `"Symbol reference returned empty — cannot verify symbol"` (nguồn tham chiếu trả rỗng) hoặc `f"Cannot verify symbol: upstream source error ({exc})"` (nguồn không gọi được). Cache symbol có TTL 300s (`_SYMBOL_CACHE_TTL`), nên lỗi chỉ xảy ra khi cache hết hạn *và* upstream chết. |
| `app/services/cap5/service.py:625` | `f"Chưa lấy được giá hiện tại của {symbol_clean} — thử lại sau."` | `log_dung_ngoai` (Cấp 5 "đứng ngoài có chủ đích"). Bắt **mọi** exception từ `resolve_price` → fail-closed, vì một dòng "đứng ngoài" không có giá snapshot thì không thể chấm né đúng/hụt. |

Cả hai đều trả `{"detail": "...", "code": "SERVICE_UNAVAILABLE"}` với status 503.

### 10.2 502 Bad Gateway — 83 chỗ, hầu hết trong market-data

Pattern chủ đạo (lặp lại ~70 lần trong `app/api/v1/endpoints/market_data.py`):

```
try:
    return await fetch_from_registry("<registry.key>", {"VCI": _vci, "VND": _vnd}, override=source)
except RuntimeError as exc:
    raise HTTPException(status_code=502, detail=str(exc)) from exc
```

**Message chính xác của 502 này** đến từ `app/services/market_data/fallback.py`:

```
Tất cả {len(sources)} nguồn dữ liệu thị trường đều thất bại
```

`{len(sources)}` là số nguồn trong chain (thường 1 hoặc 2). Vậy body thật:

```json
{ "detail": "Tất cả 2 nguồn dữ liệu thị trường đều thất bại" }
```

Cơ chế fallback (`fetch_with_fallback`) trước khi tới 502:
1. Thử từng nguồn theo thứ tự ưu tiên từ registry (`sources_for(key, override)`).
2. Nếu nguồn trả dữ liệu **rỗng** (`None`, `[]`, `{}`) và không có `allow_empty=True` → coi là **thất bại**, log warning, ghi `last_exc = ValueError(f"Nguồn {source_name} trả về dữ liệu rỗng")`, thử nguồn tiếp theo.
3. Nếu nguồn throw → log warning, thử nguồn tiếp theo.
4. Hết nguồn → `raise RuntimeError("Tất cả N nguồn dữ liệu thị trường đều thất bại") from last_exc`.
5. Endpoint bắt `RuntimeError` → 502. **Message của `last_exc` KHÔNG lọt vào response** — client chỉ thấy câu tổng quát. Chi tiết chỉ có trong log server.

Khi thành công qua fallback, response có `meta.fallback_used = true` và `meta.source_priority > 1`.

Ngoài ra, `fetch_from_registry` có thể throw:
- `KeyError` — registry key không tồn tại (bug code, không phải lỗi runtime) → **không được bắt** → 500.
- `ValueError(f"No handler registered for source '{name}' (registry key '{key}')")` — cũng là bug code → 500.

### 10.3 Cặp 502 / 503 của market-overview và sector/screening

Pattern riêng, phân biệt **shape error** (502) với **transport error** (503):

```
except MarketOverviewUpstreamShapeError as exc:
    raise HTTPException(status_code=502, detail=str(exc)) from exc
except MarketOverviewUpstreamError as exc:
    raise HTTPException(status_code=503, detail=str(exc)) from exc
```

| Exception (Python) | Ý nghĩa | Status | Message pattern (tiếng Anh!) |
|---|---|---|---|
| `MarketOverviewUpstreamShapeError` | Upstream trả dữ liệu nhưng shape sai | **502** | `Expected dict from {url}, got {type}` / `Missing required key '...' from {url}` |
| `MarketOverviewUpstreamError` | Lỗi transport/connection | **503** | `GET {path}: {exc}` |
| `SectorUpstreamShapeError` / `ScreeningUpstreamShapeError` | như trên | **502** | `Expected list from {label}, got {type}` |
| `SectorUpstreamError` / `ScreeningUpstreamError` | như trên | **503** | `GET {path}: {exc}` / `POST {path}: {exc}` |
| `AINewsNotFoundError` | Slug/id không tồn tại upstream | **404** | `No detail found for slug='{slug}'` |
| `AINewsUpstreamShapeError` | shape sai | **502** | `Expected dict from {url}, got {type}` / `'news_info' is {type}, expected list` / `news_info[{i}] is {type}, expected dict` |
| `AINewsUpstreamError` | transport | **503** | `Failed to fetch {kind} news: {exc}` / `Failed to fetch detail for slug={slug}: {exc}` |

> ⚠️ **Các message này là TIẾNG ANH và có thể rò rỉ URL upstream ra client.** Đây là hiện trạng. Bản viết lại nên **giữ nguyên status code** (frontend có thể đang phân biệt 502 vs 503) nhưng nên xem xét **thay message bằng câu tiếng Việt trung tính** và đẩy chi tiết vào log — đây là quyết định cần xác nhận với chủ sở hữu, không tự ý làm.

### 10.4 502 của Google Sheets (message riêng)

`app/api/v1/endpoints/market_data.py` có 3 chỗ message riêng:

| Dòng | Message |
|---|---|
| 2370 | `f"Google Sheets VND unavailable: {exc}"` |
| 2399 | `f"Google Sheets TPCP unavailable: {exc}"` |
| 2428 | `f"Google Sheets TYGIA unavailable: {exc}"` |

### 10.5 502 của AI proxy

`app/services/ai/proxy_client.py` định nghĩa `AIProxyError`; các endpoint AI bắt và map **502**. Message (tiếng Việt, có che thông tin nhạy cảm):

| Nguyên nhân | Message |
|---|---|
| `httpx.TimeoutException` | `f"AI proxy timeout sau {timeout}s: {type(exc).__name__}"` |
| `httpx.ConnectError` | `f"Không thể kết nối đến AI proxy: {type(exc).__name__}"` |
| `httpx.HTTPStatusError` | `f"AI proxy trả về HTTP {exc.response.status_code}"` |
| `httpx.HTTPError` khác | `f"Lỗi HTTP khi gọi AI proxy: {type(exc).__name__}"` |
| Response thiếu `choices[0].message.content` | `"AI proxy trả về response không đúng format (thiếu choices[0].message.content)"` |

**Chú ý bảo mật (comment trong source):** cố ý **KHÔNG log/echo response body** vì nó có thể chứa API key trong error message. Bản NestJS phải giữ nguyên nguyên tắc này.

Các endpoint AI khác cũng map `ValueError` → **422** với `detail = str(exc)` (message do service sinh, dạng string).

`app/api/v1/endpoints/ai_forecast.py` và `ai_patterns.py` dùng message cố định, không leak chi tiết:

| File:dòng | Status | Message |
|---|---|---|
| `ai_forecast.py:48`, `:58` | 502 | `"Không thể đọc dữ liệu mô hình AI"` |
| `ai_patterns.py:54` | 502 | `"Không thể đọc dữ liệu mẫu nến"` |
| `ai_patterns.py:67` | 502 | `"Không thể đọc dữ liệu mẫu giá"` |
| `ai_patterns.py:82` | 502 | `"Không thể đọc danh sách mã"` |

### 10.6 503 khác

| File:dòng | Status | Message | Điều kiện |
|---|---|---|---|
| `app/api/v1/endpoints/alerts.py:141` | 503 | `"Telegram chưa được cấu hình"` | `TELEGRAM_BOT_USERNAME` rỗng khi gọi `POST /alerts/telegram/link` |

---

## 11. Bảng lỗi theo domain (bảng tra khi implement lại)

Tất cả message dưới đây trích **nguyên văn** từ source. `{...}` là chỗ nội suy runtime. Trừ khi ghi khác, đây là `AppException` → body có cả `code`.

### 11.1 Auth & phiên đăng nhập

`app/api/deps.py`, `app/services/auth.py`

| Status | `code` | Message | Điều kiện |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | `Yêu cầu xác thực` | Không có Bearer credentials (`deps.py:26`) |
| 401 | `UNAUTHORIZED` | `Email hoặc mật khẩu không đúng` | Sai email **hoặc** sai password — cùng 1 message, chống enumeration |
| 401 | `UNAUTHORIZED` | `Trạng thái tài khoản: {status}` | Login khi `status != active` (`status` ∈ `inactive`/`suspended`/`deleted`) |
| 401 | `UNAUTHORIZED` | `Access token đã hết hạn` | `jwt.ExpiredSignatureError` |
| 401 | `UNAUTHORIZED` | `Access token không hợp lệ` | `jwt.InvalidTokenError` |
| 401 | `UNAUTHORIZED` | `Access token bị thiếu thuộc tính` | `payload["sub"]` không parse được thành UUID |
| 401 | `UNAUTHORIZED` | `Sai loại token` | `payload["type"]` không phải `access` (hoặc `refresh` ở luồng refresh) |
| 401 | `UNAUTHORIZED` | `Refresh token đã hết hạn` | |
| 401 | `UNAUTHORIZED` | `Refresh token không hợp lệ` | |
| 401 | `UNAUTHORIZED` | `Refresh token bị thiếu thuộc tính` | thiếu `jti` hoặc `family` |
| 401 | `UNAUTHORIZED` | `Refresh token không được công nhận` | `jti` không có trong DB |
| 401 | `UNAUTHORIZED` | `Refresh token family không khớp` | `payload.family != db.token_family` → **revoke cả family** |
| 401 | `UNAUTHORIZED` | `Refresh token đã bị thu hồi (có thể bị tấn công replay)` | `claim_for_rotation` trả 0 row → **revoke cả family** |
| 401 | `UNAUTHORIZED` | `Tài khoản người dùng không còn khả dụng` | user bị xóa giữa 2 lần gọi (`NotFoundError` → map sang 401) |
| 403 | `FORBIDDEN` | `Trạng thái tài khoản: {status}` | ⚠️ Ở `get_current_user_from_token` (`auth.py:265`) dùng **403**, còn ở login dùng **401**, cùng một loại vi phạm. Đây là điểm không nhất quán **có thật** — phải copy đúng |
| 403 | `FORBIDDEN` | `Tài khoản chưa được kích hoạt` | `get_current_active_user` — `user.is_active` false |
| 403 | `FORBIDDEN` | `Yêu cầu quyền quản trị viên` | `get_current_admin` — `role != admin` |
| 403 | `FORBIDDEN` | `Yêu cầu gói Premium đang hoạt động` | `get_premium_active_user` (admin bypass) |
| 400 | `BAD_REQUEST` | `Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` | **3 nhánh khác nhau** đều trả cùng message: token malformed, user không tồn tại, token không verify được với hash hiện tại |

**Thứ tự kiểm tra của guard chain** (phải giữ đúng vì message khác nhau):
`get_current_user` (401 nếu thiếu token → 401 nếu token sai) → `get_current_active_user` (403 chưa kích hoạt) → `get_current_admin` **hoặc** `get_premium_active_user` (403).

**Không có lỗi cho `POST /auth/forgot-password`:** luôn 200 với message `"Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu."` bất kể email tồn tại hay không (chống enumeration). Email chỉ gửi khi user tồn tại **và** `status == active`.

### 11.2 Người dùng & hồ sơ

`app/services/user.py`, `app/services/admin_users.py`

| Status | `code` | Message |
|---|---|---|
| 409 | `CONFLICT` | `Đã tồn tại người dùng với email này` |
| 409 | `CONFLICT` | `Đã tồn tại người dùng với số điện thoại này` |
| 404 | `NOT_FOUND` | `Không tìm thấy người dùng` (`NotFoundError("người dùng")`) |
| 404 | `NOT_FOUND` | `Không tìm thấy Người dùng` (`NotFoundError("Người dùng")` — **chữ N hoa** trong `admin_users.py`) |
| 400 | `BAD_REQUEST` | `Export filter matches {total} rows (max 50000). Tighten filters first.` — tiếng Anh; `EXPORT_MAX_ROWS = 50_000` |

> Lưu ý viết hoa không nhất quán: `"người dùng"` (services/user.py) vs `"Người dùng"` (services/admin_users.py). Copy đúng từng chỗ.

Validate số điện thoại nằm ở tầng Pydantic (`app/schemas/user.py`), dùng `phonenumbers` với region default `"VN"` → ra **422 Pydantic** với `msg`:
- `Value error, Số điện thoại không hợp lệ` (parse được nhưng `is_valid_number()` false)
- `Value error, Số điện thoại không hợp lệ. Ví dụ: 0912345678 hoặc +84912345678` (`NumberParseException`)

### 11.3 Premium, thanh toán, subscription

`app/services/premium.py`, `admin_payments.py`, `admin_subscriptions.py`, `admin_ipn.py`, `endpoints/premium.py`

| Status | `code` | Message |
|---|---|---|
| 409 | `CONFLICT` | `Đã tồn tại gói với mã '{code}'` |
| 404 | `NOT_FOUND` | `Không tìm thấy gói Premium` |
| 400 | `BAD_REQUEST` | `Gói này không còn khả dụng` |
| 400 | `BAD_REQUEST` | `Không thể xoá gói TRIAL_7D` |
| 404 | `NOT_FOUND` | `Không tìm thấy đơn hàng` |
| 400 | `BAD_REQUEST` | `Chỉ có thể hoàn tiền cho đơn hàng ở trạng thái PAID (hiện tại: {order.status})` |
| 400 | `BAD_REQUEST` | `Chỉ có thể xác nhận thanh toán cho đơn hàng ở trạng thái PENDING (hiện tại: {order.status})` |
| 400 | `BAD_REQUEST` | `Đơn hàng vừa được xác nhận bởi một yêu cầu khác. Tải lại để xem trạng thái mới nhất.` (race điều kiện) |
| 400 | `BAD_REQUEST` | `Chỉ có thể reconcile đơn hàng PENDING (hiện tại: {order.status})` |
| 400 | `BAD_REQUEST` | `Đơn hàng chưa đủ 30 phút để reconcile` |
| 400 | `BAD_REQUEST` | `Subscription đã ở trạng thái CANCELLED` |
| 404 | `NOT_FOUND` | `Không tìm thấy subscription` |
| 404 | `NOT_FOUND` | `Không tìm thấy IPN log` |
| 400 | `BAD_REQUEST` | `Không thể retry: secret key không hợp lệ` |
| 400 | `BAD_REQUEST` | `IPN log này đã được xử lý thành công` |
| 400 | `BAD_REQUEST` | `Không có raw_body để retry` |
| 400 | `BAD_REQUEST` | `Không thể parse raw_body: {exc}` |

Webhook IPN dùng envelope riêng — xem mục 8.1.

### 11.4 Virtual trading (giao dịch ảo)

`app/services/virtual_trading/service.py` (28 chỗ raise — nhiều nhất một file), `endpoints/virtual_trading.py`, `services/admin_vt.py`

**Thứ tự kiểm tra khi đặt lệnh (`place_order`) — PHẢI giữ đúng, vì client dựa vào message đầu tiên:**

| Bước | Status | `code` | Message | Hằng số |
|---|---|---|---|---|
| 1 | 403 | `FORBIDDEN` | `Giao dịch ảo hiện đang bị tạm dừng` | flag global trong config |
| 2 | 400 | `BAD_REQUEST` | `Khối lượng phải là bội số của {config.board_lot_size}` | từ DB config |
| 3 | 400 | `BAD_REQUEST` | `Lệnh limit yêu cầu giá limit lớn hơn 0` | |
| 4 | **422** | `UNPROCESSABLE_ENTITY` | `Khối lượng {quantity} vượt quá mức tối đa 1000000 mỗi lệnh` | `_MAX_QUANTITY = 1_000_000` |
| 5 | **422** | `UNPROCESSABLE_ENTITY` | `Giá limit {limit_price_vnd} vượt quá mức tối đa 10000000 VND` | `_MAX_LIMIT_PRICE_VND = 10_000_000` |
| 6 | **422** | `UNPROCESSABLE_ENTITY` | `Mã '{symbol}' không được niêm yết trên HOSE/HNX/UPCOM` | |
| 6b | **503** | `SERVICE_UNAVAILABLE` | `Không thể xác minh mã chứng khoán: {reason}` | fail-closed |
| 7 | 404 | `NOT_FOUND` | `Không tìm thấy tài khoản giao dịch ảo` | |
| 8 | 403 | `FORBIDDEN` | `Tài khoản đã bị tạm khóa` | `account.frozen_at` (nhánh 1) |
| 8b | 403 | `FORBIDDEN` | `Tài khoản tạm khóa` | `account.frozen_at` (nhánh 2 — **message khác, ngay dòng sau**) |
| 9 | **422** | `UNPROCESSABLE_ENTITY` | `Gross giá trị lệnh {gross:,} VND vượt quá mức tối đa 100,000,000,000 VND` | `_MAX_GROSS_VND = 100_000_000_000`; **có dấu phẩy phân cách nghìn** (format `:,`) |
| 10 | 400 | `BAD_REQUEST` | `Không đủ tiền: cần {reserve_cash} VND, hiện có {cash_available_vnd} VND` | **không** có dấu phẩy |
| 11 | 400 | `BAD_REQUEST` | `Không đủ cổ phiếu khả dụng để bán: cần {quantity}, hiện có {available}` | |

> Bẫy format số: chỗ dùng `{gross:,}` ra `100,000,000,000`; chỗ khác dùng `{x}` ra `100000000000`. Phải copy từng chỗ.

**Khi khớp lệnh / hủy lệnh:**

| Status | `code` | Message |
|---|---|---|
| 400 | `BAD_REQUEST` | `Không đủ tiền sau khi giá thay đổi` |
| 400 | `BAD_REQUEST` | `Không đủ tiền: cần {total_cost}, hiện có {cash_available_vnd}` |
| 400 | `BAD_REQUEST` | `Không đủ cổ phiếu: cần {quantity}, hiện có {available}` |
| 400 | `BAD_REQUEST` | `Vi phạm toàn vẹn vị thế: bán {quantity} cổ phiếu sẽ làm tổng âm ({quantity_total} - {quantity})` |
| 404 | `NOT_FOUND` | `Không tìm thấy lệnh` |
| 403 | `FORBIDDEN` | `Lệnh này không thuộc về bạn` |
| 400 | `BAD_REQUEST` | `Không thể hủy lệnh ở trạng thái '{order.status}'` |
| 404 | `NOT_FOUND` | `Không tìm thấy tài khoản` |
| 409 | `CONFLICT` | `Tài khoản giao dịch ảo đã tồn tại` |

**Query param parse ở tầng endpoint** (`endpoints/virtual_trading.py`) — **400, không phải 422**:

| Status | Message |
|---|---|
| 400 | `Giá trị status '{status}' không hợp lệ. Cho phép: pending, filled, cancelled, expired, rejected` |
| 400 | `Giá trị side '{side}' không hợp lệ. Cho phép: buy, sell` |

**Admin virtual trading** (`services/admin_vt.py`):

| Status | Message |
|---|---|
| 400 | `Lý do (reason) bắt buộc` |
| 400 | `Tài khoản đã bị tạm khóa` |
| 400 | `Tài khoản đang không bị khóa` |
| 400 | `Số tiền điều chỉnh khác 0` |
| 400 | `Lý do (reason) bắt buộc khi điều chỉnh tiền` |
| 400 | `Số dư không đủ để trừ {abs(amount):,} VND (hiện tại: {cash_available_vnd:,})` |
| 404 | `Không tìm thấy Tài khoản giao dịch ảo` (chữ T hoa) |

### 11.5 Cấp 0-8 (gamified leveling) — pattern lặp lại

Tổng ~148 chỗ raise trải trên `app/services/cap0/` … `cap8/`. Có **4 khuôn mẫu** lặp gần như nguyên văn ở mọi cấp:

**Khuôn 1 — Vào cấp (gate tốt nghiệp cấp trước):**

| Cấp | 404 (chưa có tiến trình cấp trước) | 409 (chưa tốt nghiệp) |
|---|---|---|
| 1 | `Không tìm thấy tiến trình Cấp 0` | `Chưa tốt nghiệp Cấp 0` |
| 2 | `Không tìm thấy tiến trình Cấp 1` | `Chưa tốt nghiệp Cấp 1` |
| 3 | `Không tìm thấy tiến trình Cấp 2` | `Chưa tốt nghiệp Cấp 2` |
| 4 | `Không tìm thấy tiến trình Cấp 3` | `Chưa tốt nghiệp Cấp 3` |
| 5 | `Không tìm thấy tiến trình Cấp 4` | `Chưa tốt nghiệp Cấp 4` |
| 6 | `Không tìm thấy tiến trình Cấp 5` | `Chưa tốt nghiệp Cấp 5` |
| 7 | `Không tìm thấy tiến trình Cấp 6` | `Chưa tốt nghiệp Cấp 6` |
| 8 | `Không tìm thấy tiến trình Cấp 7` | `Chưa tốt nghiệp Cấp 7` |

**Khuôn 2 — Tiến trình cấp hiện tại chưa tồn tại:** 404 `Không tìm thấy tiến trình Cấp {N}` — có ở **mọi** cấp 0-8, nhiều lần mỗi cấp (mỗi endpoint đều gọi `_require_progress`).

**Khuôn 3 — Tốt nghiệp khi chưa đủ nhiệm vụ (409 `CONFLICT`):**

| Cấp | Message |
|---|---|
| 0 | `Chưa hoàn thành đủ nhiệm vụ và cổng Cấp 0` |
| 1 | `Chưa hoàn thành đủ 5 nhiệm vụ Cấp 1` |
| 2 | `Chưa hoàn thành đủ 2 nhiệm vụ Cấp 2` |
| 3 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 3` |
| 4 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 4` |
| 5 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 5` |
| 6 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 6` |
| 7 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 7` |
| 8 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 8` |

**Khuôn 4 — `task_no` sai:** 400 `task_no không hợp lệ` (cấp 1-8). Riêng **Cấp 0**: 400 `task_no không hợp lệ (Cấp 0 có 4 nhiệm vụ)`.

**Lỗi đặc thù từng cấp:**

| Cấp | Status | Message |
|---|---|---|
| 0 | 400 | `gate không hợp lệ` |
| 0 | 400 | `Nhiệm vụ {task_no} chỉ hoàn thành khi đóng màn Kết sổ (cần gate="{required_gate}")` |
| 0 | 400 | `Nhiệm vụ {task_no} chỉ tính sau khi hoàn thành nhiệm vụ ① (đặt lệnh mua đầu tiên)` |
| 0 | 400 | `ly_do_doi_thuong không hợp lệ` |
| 0 | 400 | `Kế hoạch Cấp 0 chỉ ghi cho lệnh MUA` |
| 0 | 404 | `Không tìm thấy kế hoạch Cấp 0` (từ `endpoints/cap0.py:88`) |
| 1 | 400 | `Kế hoạch chỉ ghi cho lệnh MUA` |
| 1 | 400 | `lyDo hoặc trangThai_luc_dat không hợp lệ` |
| 1 | 400 | `Vùng mua phải là số dương` |
| 1 | 409 | `Lệnh này đã có kế hoạch` |
| 1 | 400 | `Kết sổ chỉ ghi cho lệnh BÁN` |
| 1 | 400 | `Lệnh bán chưa khớp` |
| 1 | 400 | `cam_xuc không hợp lệ` |
| 1 | 409 | `Lệnh này đã kết sổ` |
| 1 | 409 | `Không tìm thấy lệnh mua tương ứng để kết sổ` (⚠️ message kiểu "không tìm thấy" nhưng dùng **409**, không phải 404) |
| 2 | 400 | `Cắt lỗ/Chốt lời chỉ ghi cho lệnh MUA` |
| 2 | 400 | `phuong_phap_sl_tp không hợp lệ` |
| 2 | 400 | `Cắt lỗ/Chốt lời phải là số dương` |
| 2 | 404 | `Không tìm thấy kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước` |
| 2 | 400 | `Đo kỷ luật chỉ ghi cho lệnh BÁN` |
| 2 | 404 | `Không tìm thấy kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước` |
| 3 | 400 | `khau_vi không hợp lệ` |
| 3 | 409 | `Chưa đặt khẩu vị rủi ro — cần đặt trước khi vào lệnh` |
| 3 | 400 | `Quản lý vốn chỉ ghi cho lệnh MUA` |
| 3 | 400 | `muc_tu_tin phải là 1, 2 hoặc 3` |
| 3 | 400 | `cach_khoi_luong không hợp lệ` |
| 3 | 400 | `Khối lượng phải là số dương` |
| 3 | 400 | `%vốn phải là số dương` |
| 4 | 400 | `{field} phải là object dạng {lớp: mức}` |
| 4 | 400 | `{field} không được để trống` |
| 4 | 400 | `Lớp không hợp lệ: {lop}` |
| 4 | 400 | `Nhận định lớp {LOP_LABELS[lop]} không hợp lệ: {muc_value}` |
| 4 | 400 | `Đọc 5 lớp chỉ ghi cho lệnh MUA` |
| 4 | 404 | `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` |
| 5 | 400 | `Phân loại 4 ô chỉ áp dụng cho lệnh BÁN` |
| 5 | 400 | `verdict_user phải là 'dung' hoặc 'sai'` |
| 5 | 400 | `Lý do sửa không được để trống` |
| 5 | **422** | `Bạn thấy khác hệ — cần ghi 1 dòng lý do vì sao bạn đánh giá khác.` |
| 5 | 400 | `Thiếu mã cổ phiếu` |
| 5 | 400 | `Lý do đứng ngoài không hợp lệ` |
| 5 | **503** | `Chưa lấy được giá hiện tại của {symbol} — thử lại sau.` |
| 6 | 400 | `Bước Đối chiếu chỉ ghi cho lệnh MUA` |
| 6 | 400 | `lop_quyet_dinh phải là 1 trong 5 lớp` |
| 6 | **422** | `Cần ghi 1 dòng vì sao bạn tin lớp này — đối chiếu không bao giờ là một lựa chọn trơ.` |
| 6 | 400 | `kieu_co_phieu không hợp lệ` |
| 6 | 409 | `Lệnh này đã khớp — phần Đối chiếu không sửa được nữa. Lớp bạn chọn tin phải được chốt TRƯỚC khi biết lệnh lãi hay lỗ, đó là điều làm so sánh khớp/lệch gợi ý có nghĩa.` |
| 7 | 400 | `luc_chi_so phải là một số` |
| 7 | 400 | `luc_chi_so phải là số hữu hạn và lớn hơn 0 (sổ lệnh không đọc được thì bỏ qua bước đọc lực, đừng gửi 0 hay vô cực)` |
| 7 | 400 | `luc_doc_user phải là 'manh', 'can' hoặc 'yeu'` |
| 7 | 400 | `hanh_vi_co phải là 'cho_xac_nhan' hoặc 'mua_duoi_theo'` |
| 7 | 400 | `Có cờ cảnh giác thì phải ghi bạn đã làm gì (hanh_vi_co)` |
| 7 | 400 | `Không có cờ cảnh giác thì không được ghi hanh_vi_co` |
| 7 | 400 | `Bước đọc lực chỉ ghi cho lệnh MUA` |
| 7 | 409 | `Lệnh này đã qua hạn chấm đọc lực — không ghi hay sửa đọc lực được nữa. Chỉ số Lực và phần bạn đọc phải được chốt TRƯỚC khi biết giá đi đâu, đó là điều làm thống kê đọc lực có nghĩa.` |
| 8 | 400 | `Thiếu mã cổ phiếu` |
| 8 | 400 | `Khối lượng phải lớn hơn 0` |
| 8 | 400 | `Giá phải lớn hơn 0` |
| 8 | 400 | `Chưa lấy được danh mục để kiểm tra — thử lại sau. Bước kiểm tra này không bao giờ chặn lệnh mua của bạn.` |
| 8 | 400 | `hanh_vi_canh_bao phải là 'van_mua', 'giam_kl', 'chon_ma_khac' hoặc 'khong_canh_bao'` |
| 8 | 400 | `Bước Kiểm tra danh mục chỉ ghi cho lệnh MUA` |
| 8 | 409 | `Lệnh này đã ghi bước Kiểm tra danh mục rồi — ảnh chụp danh mục LÚC MUA không sửa lại được. Đó là điều làm ô "mua bất chấp cảnh báo" có nghĩa: nó ghi lại điều đã xảy ra, không phải điều danh mục trông như thế nào hôm nay.` (⚠️ chứa **dấu ngoặc kép** trong chuỗi — cần escape khi serialize JSON) |
| 8 | 400 | `Chưa lấy được danh mục để kiểm tra — thử lại sau` |
| 8 | 400 | `Lệnh chưa có giá để tính tác động lên danh mục` |
| 8 | 400 | `Lệnh này CÓ cảnh báo danh mục ({danh sách nối bằng ", "}) nên không ghi được 'không có cảnh báo'.` |
| 8 | 400 | `Lệnh này KHÔNG có cảnh báo danh mục nào nên chỉ ghi được 'khong_canh_bao' — trừ khi bạn gửi kèm canh_bao_da_hien (các cảnh báo của chính lần kiểm tra bạn đã phản hồi).` |

Ngoài ra mọi cấp có 404 `Không tìm thấy lệnh` khi `order_id` không thuộc user.

> **Nguyên tắc chống gian lận (xuất hiện ở cấp 6/7/8):** một số bước bị **chốt cứng theo thời điểm** — sau khi lệnh khớp / qua hạn chấm thì trả **409** thay vì cho sửa. Đây là logic nghiệp vụ, không phải kỹ thuật — bản viết lại phải giữ nguyên cả điều kiện và message giải thích.

### 11.6 Lessons (khoá học / tập học) + upload

`app/services/lesson/service.py`, `endpoints/lessons.py`, `endpoints/admin_lessons.py`

| Status | `code` | Message | Ghi chú |
|---|---|---|---|
| 404 | `NOT_FOUND` | `Không tìm thấy Khoá học` | |
| 404 | `NOT_FOUND` | `Không tìm thấy Tập học` | |
| 409 | `CONFLICT` | `Slug '{slug}' đã được sử dụng` | cả create và update |
| 400 | `BAD_REQUEST` | `Phải upload file trước khi xuất bản tập học dạng PDF/Video` | |
| 400 | `BAD_REQUEST` | `Tập học dạng text không cần upload file` | |
| 403 | `FORBIDDEN` | `Yêu cầu gói Premium đang hoạt động` | `endpoints/lessons.py:130` — kiểm inline, không qua dependency |
| **415** | (không có `code`) | `Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp` | `HTTPException`; MIME hợp lệ: `image/jpeg`, `image/png`, `image/webp` |
| **415** | (không có `code`) | `Chỉ chấp nhận file PDF` | |
| **415** | (không có `code`) | `Chỉ chấp nhận video MP4 hoặc WebM` | |
| **413** | (không có `code`) | `Ảnh quá lớn (tối đa {LESSON_MAX_THUMBNAIL_MB} MB)` | default `5` |
| **413** | (không có `code`) | `File quá lớn (tối đa {max_bytes // (1024*1024)} MB)` | PDF default `50`, video default `500` |

**Thứ tự kiểm tra khi upload thumbnail** (quan trọng): kiểm **MIME trước** (415) → kiểm khoá học tồn tại (404) → đọc bytes → kiểm size (413). Nghĩa là file sai MIME bị chặn **trước khi** biết course có tồn tại hay không.

Với PDF/video, size được kiểm **theo từng chunk khi stream** (`total_bytes > max_bytes` → 413 giữa dòng), không đọc hết vào RAM.

### 11.7 Alerts & backtest

`endpoints/alerts.py`, `endpoints/admin_alerts.py`, `endpoints/backtest.py` — **toàn bộ dùng `HTTPException` thuần** → body chỉ có `detail`.

| Status | Message | Nguồn |
|---|---|---|
| 400 | `str(CombinationError)` | `validate_combination(...)` thất bại (cả user và admin route) |
| 400 | `Cần name, side và combination cho tín hiệu tùy chỉnh` | tạo custom rule thiếu field |
| 404 | `Không tìm thấy tín hiệu` | preset key không tồn tại |
| 404 | `Không tìm thấy cảnh báo` | rule id không thuộc user |
| 409 | `Tín hiệu đã tồn tại` | admin tạo preset trùng key |
| 503 | `Telegram chưa được cấu hình` | `TELEGRAM_BOT_USERNAME` rỗng |
| 400 | `str(CombinationError \| KeyError)` (lấy `exc.args[0]` nếu có) | `POST /backtest/run` |
| 404 | `str(ValueError)` | `POST /backtest/run` — thường là symbol/dữ liệu thiếu |
| 502 | `str(RuntimeError)` | `POST /backtest/run` — nguồn dữ liệu chết |
| 409 | `Đã tồn tại chiến lược cùng tên` | |
| 404 | `Không tìm thấy chiến lược` | |

> Ánh xạ `ValueError → 404` ở `/backtest/run` là **phản trực giác** nhưng có thật (`backtest.py:38`). Copy đúng.

### 11.8 Market data (chi tiết nhất — 141 chỗ)

Toàn bộ là `HTTPException` thuần → body `{"detail": string}`.

**Nhóm 422 (validate thủ công, `detail` là STRING):**

| Message pattern | Ngữ cảnh |
|---|---|
| `Mã chứng khoán không hợp lệ: {symbol}` | Không khớp `_SYMBOL_PATTERN = ^[A-Z0-9]{1,10}$` — xuất hiện ~20 lần |
| `Giá trị interval '{interval}' không hợp lệ. Cho phép: {sorted list}` | `_VALID_INTERVALS = {1m, 5m, 15m, 30m, 1H, 1D, 1W, 1M}` |
| `Giá trị group '{group}' không hợp lệ. Cho phép: {sorted(vietcap.VALID_GROUPS)}` | |
| `Giá trị kind '{kind}' không hợp lệ. Cho phép: {sorted(valid_kinds)}` | |
| `Giá trị report_type '{report_type}' không hợp lệ. Cho phép: {sorted(_VALID_REPORT_TYPES)}` | |
| `Giá trị resolution không hợp lệ: {resolution}` | |
| `Ngày kết thúc không hợp lệ: {end}` / `Ngày bắt đầu không hợp lệ: {start}` | parse date thất bại |
| `Giá trị {name} không hợp lệ: '{v}'. Phải ở dạng YYYYMMDD (ví dụ: 20260425).` | |
| `Sai định dạng date format: '{d}'. Phải đúng dạng YYYY-MM-DD.` | |
| `Giá trị {name}='{val}' không hợp lệ. Cho phép: {', '.join(sorted(valid))}` | helper `_validate_overview_enum` |
| `Giá trị adtv={adtv} không hợp lệ. Cho phép: {sorted(ADTV_VALUES)}` | screening |
| `Giá trị value={value} không hợp lệ. Cho phép: {sorted(VALUE_THRESHOLDS)}` | screening |

> Chú ý: chuỗi `{sorted(...)}` là **repr Python của list**, ví dụ `['1D', '1H', '1M', '1W', '1m', '15m', '30m', '5m']` — có dấu nháy đơn và ngoặc vuông. Còn `{', '.join(sorted(valid))}` cho ra `ALL, HNXIndex, HNXUpcomIndex, VNINDEX` (không ngoặc). Bản NestJS phải **tái tạo đúng cả 2 kiểu format**, kể cả thứ tự sort ASCII của Python (chữ hoa trước chữ thường).

**Nhóm 404:** `Không tìm thấy mã chứng khoán: {symbol.upper()}` (`market_data.py:161`); `No detail found for slug='{slug}'` (AI news).

**Nhóm 502/503:** xem mục 10.

**`market_global.py` (13 chỗ):**

| Status | Message |
|---|---|
| 422 | `Giá trị {name}='{value}' không hợp lệ. Định dạng YYYY-MM-DD.` |
| 422 | `Không hỗ trợ mã chỉ số: {sym}` |
| 422 | `Không hỗ trợ cặp tiền: {sym}` |
| 422 | `Mã crypto không hợp lệ: {sym}` |
| 502 | `str(exc)` |

**Validate ở tầng Pydantic (→ 422 hình dạng ARRAY, khác hoàn toàn):** `PriceBoardRequest` trong `market_data.py`:

| Điều kiện | `msg` (sau prefix `Value error, `) |
|---|---|
| `symbols` không phải list | `symbols phải là một danh sách` |
| phần tử không phải string | `symbols[{i}] phải là chuỗi, hiện là {type}` |
| không khớp pattern | `symbols[{i}]='{item}' không hợp lệ. Mỗi mã phải gồm 1-10 ký tự chữ hoặc số viết hoa.` |
| `len < 1` hoặc `> 50` | `too_short` / `too_long` chuẩn Pydantic (`min_length=1, max_length=50`) |
| `source` không khớp `^(auto\|VCI\|VND)$` | `string_pattern_mismatch` |

Field validator này chạy `mode="before"` và **trim + upper** từng mã trước khi so pattern.

### 11.9 Watchlist

`endpoints/watchlist.py`

| Status | `code` | Message | Ghi chú |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `Mã {symbol} không tồn tại` | symbol không có trong DB |
| 400 | `BAD_REQUEST` | `Mã {symbol} không phải là cổ phiếu` | `asset_type != stock` |
| 400 | `BAD_REQUEST` | `Danh sách yêu thích tối đa 50 mã` | `_MAX_ITEMS = 50` |
| 409 | `CONFLICT` | `Mã {symbol} đã có trong danh sách` | |
| 404 | `NOT_FOUND` | `Không tìm thấy Mã {symbol} không có trong danh sách` | ⚠️ **`NotFoundError` truyền vào tham số `resource`, nên message bị prefix "Không tìm thấy " thành câu tối nghĩa.** Đây là bug hiện trạng — bản viết lại nên **copy y hệt** (có test đang assert), rồi đề xuất sửa riêng |

### 11.10 Market analysis (bài nhận định AI hàng ngày)

`endpoints/market_analysis.py` — dùng `NotFoundError(detail=...)` nên **không có prefix**:

| Status | `code` | Message |
|---|---|---|
| 404 | `NOT_FOUND` | `Chưa có bài nhận định nào` |
| 404 | `NOT_FOUND` | `Không có bài nhận định cho ngày {YYYY-MM-DD}` |
| 404 | `NOT_FOUND` | `Chưa có bài nhận định giữa phiên nào` |
| 404 | `NOT_FOUND` | `Không có bài nhận định giữa phiên cho ngày {YYYY-MM-DD}` |
| 404 | `NOT_FOUND` | `Chưa có bài nhận định trước phiên nào` |
| 404 | `NOT_FOUND` | `Không có bài nhận định trước phiên cho ngày {YYYY-MM-DD}` |

### 11.11 Portfolio manager & admin system

| Status | `code` | Message | Nguồn |
|---|---|---|---|
| 404 | `NOT_FOUND` | `Không tìm thấy báo cáo phân tích danh mục` | `endpoints/portfolio_manager.py:31` |
| 404 | `NOT_FOUND` | `Không tìm thấy Job '{job_id}' not found` | `endpoints/admin_system.py:115` — ⚠️ **double message**: `NotFoundError(f"Job '{job_id}' not found")` truyền vào `resource` nên bị prefix. Job hợp lệ: `expiry_sweep`, `ipn_reconcile_scan` |

---

## 12. Side-effect khi lỗi (DB, audit log, email)

Đây là phần dễ bỏ sót nhất khi port: một số nhánh lỗi **ghi DB trước khi raise**.

### 12.1 Transaction pattern của `get_db`

`app/core/database.py::get_db`:
1. `yield session`
2. Nếu handler xong không lỗi → **luôn `await session.commit()`** (kể cả request read-only — commit của transaction rỗng là no-op).
3. Nếu có exception → **`await session.rollback()`** rồi `raise` lại.

Hệ quả: **mọi thay đổi DB chưa commit đều bị rollback khi raise lỗi**, bất kể loại lỗi.

### 12.2 Login thất bại — CÓ ghi DB (commit tường minh)

`app/services/auth.py::login` gọi `self._record_login(...)` rồi **`await self._session.commit()` NGAY TRƯỚC KHI** raise `UnauthorizedError`. Vì commit đã xảy ra, rollback của `get_db` không xoá bản ghi.

| Nhánh | `failure_reason` ghi vào login history |
|---|---|
| Sai email hoặc password | `"invalid_credentials"` (`user_id = None` nếu email không tồn tại) |
| `status != active` | `f"status:{user.status.value}"` |

Bản NestJS phải commit login-attempt trong **transaction riêng** (hoặc dùng connection ngoài transaction chính) để không bị rollback.

### 12.3 Refresh token — revoke bị ROLLBACK (khiếm khuyết thực tế)

Hai nhánh trong `refresh_tokens` gọi `revoke_family(...)` rồi raise 401:
- family mismatch (`auth.py:184-185`)
- replay detected (`auth.py:198-199`)

`RefreshTokenRepository.revoke_family` chỉ `session.execute(UPDATE ...)` — **không commit**. `get_db` rollback khi exception → **UPDATE bị hủy, token KHÔNG thực sự bị revoke**. Chỉ có dòng log warning còn lại.

> Đây là bug bảo mật thật ở hiện trạng, không phải hiểu sai source. Trong bản viết lại: **commit tường minh (hoặc transaction riêng) trước khi throw** ở cả 2 nhánh. Đây là chỗ nên **sửa**, không nên bug-compatible — nhưng phải ghi vào changelog vì test hiện tại có thể đang khẳng định hành vi cũ.

### 12.4 Webhook IPN — luôn ghi `IPNLog` trước khi trả lỗi

3 nhánh lỗi ở mục 8.1 đều `await log_service.record(...)` trước `return JSONResponse(...)`. Vì đây là `return` (không phải `raise`), `get_db` đi nhánh thành công → **commit**. Bản viết lại phải giữ đúng: dùng `return` chứ không `throw`, nếu không log sẽ mất.

### 12.5 Admin audit log

Các route admin ghi `AdminAuditLog` (ví dụ `endpoints/admin_alerts.py::_audit`). Vì `db.add(...)` nằm trong cùng transaction, nếu route sau đó raise thì audit **cũng bị rollback**. Nghĩa là: **hành động admin thất bại KHÔNG để lại audit trail**. Hiện trạng — cần quyết định giữ hay sửa.

### 12.6 Email — best-effort, không ảnh hưởng status

`POST /auth/register` và `POST /auth/forgot-password` gửi email qua `BackgroundTasks`. Task bọc trong `try/except Exception` + `logger.exception(...)` (comment: *"best-effort background send"*). Email lỗi **không** làm request thất bại. Với NestJS: dùng queue/`setImmediate` sau khi response đã gửi, và swallow lỗi.

### 12.7 Cache Redis không cache lỗi

`app/services/cache/decorator.py`: chỉ cache khi `200 <= status < 300`. Response lỗi không bao giờ vào cache. Response trả từ cache có header `X-Cache: HIT`. Nếu `REDIS_ENABLED=False` hoặc không tìm thấy `Request` object → decorator bypass hoàn toàn.

---

## 13. Type TypeScript

### 13.1 `ErrorCode` — union đầy đủ

```ts
/**
 * Toàn bộ giá trị field `code` mà backend có thể trả về.
 * Chỉ AppException và 7 lớp con mới có `code`; mọi envelope khác không có field này.
 */
export type ErrorCode =
  | 'NOT_FOUND'              // 404
  | 'CONFLICT'               // 409
  | 'UNAUTHORIZED'           // 401
  | 'FORBIDDEN'              // 403
  | 'BAD_REQUEST'            // 400
  | 'UNPROCESSABLE_ENTITY'   // 422 (nghiệp vụ, detail là string)
  | 'SERVICE_UNAVAILABLE';   // 503
```

`AppException` cho phép `code = null` (constructor có `code: str | None = None`), nhưng **không lớp con nào truyền `null`** và `AppException` không được raise trực tiếp. Vì vậy trong thực tế `code` luôn là một trong 7 giá trị trên khi field có mặt. Type an toàn cho client vẫn nên là `ErrorCode | null`.

### 13.2 Bốn envelope

```ts
/** Hình dạng A — AppException. Đây là envelope "chuẩn" của backend. */
export interface ApiErrorBody {
  detail: string;
  code: ErrorCode | null;
  // KHÔNG có `errors`. Model ErrorResponse khai báo nó nhưng handler không emit.
}

/** Hình dạng B — HTTPException thuần (192 chỗ), 404/405 của Starlette. */
export interface PlainHttpErrorBody {
  detail: string;
  // Không có `code`.
}

/** Một item lỗi validate của Pydantic v2. */
export interface ValidationErrorItem {
  /** Mã loại lỗi Pydantic. Xem PydanticErrorType để biết các giá trị hay gặp. */
  type: string;
  /**
   * Đường dẫn tới field lỗi. Phần tử đầu là nguồn:
   * 'body' | 'query' | 'path' | 'header' | 'cookie'.
   * Số nguyên xuất hiện khi là chỉ số array, hoặc byte-offset của lỗi json_invalid.
   */
  loc: Array<string | number>;
  /** Message tiếng Anh do Pydantic sinh. Lỗi từ field_validator có prefix "Value error, ". */
  msg: string;
  /**
   * Giá trị đầu vào gây lỗi.
   * - body: giữ kiểu JSON gốc (number/string/object/null)
   * - query/path/header: LUÔN là string (đến từ URL)
   * - type === 'missing': là TOÀN BỘ object cha, không phải field bị thiếu
   */
  input: unknown;
  /** Chỉ có mặt khi loại lỗi mang tham số. Ví dụ {ge: 1}, {pattern: '...'}, {error: {}}. */
  ctx?: Record<string, unknown>;
}

/** Hình dạng C — lỗi validate Pydantic. LUÔN status 422. */
export interface ValidationErrorBody {
  detail: ValidationErrorItem[];
}

/** Hình dạng D — 429 rate limit của slowapi. */
export interface RateLimitErrorBody {
  /** Định dạng cứng: `Rate limit exceeded: {N} per 1 {unit}` */
  error: string;
}

/** Hình dạng riêng của webhook SePay IPN (mục 8.1). */
export interface IpnErrorBody {
  error: 'unauthorized' | 'invalid_json' | 'invalid_payload';
}

/** Union của mọi body lỗi JSON mà client có thể nhận. */
export type AnyApiErrorBody =
  | ApiErrorBody
  | PlainHttpErrorBody
  | ValidationErrorBody
  | RateLimitErrorBody
  | IpnErrorBody;
```

### 13.3 Type guard — cây quyết định để phân loại body lỗi

```ts
export type PydanticErrorType =
  | 'missing'
  | 'value_error'
  | 'string_too_short'
  | 'string_too_long'
  | 'string_pattern_mismatch'
  | 'string_type'
  | 'int_parsing'
  | 'int_type'
  | 'float_parsing'
  | 'bool_parsing'
  | 'greater_than'
  | 'greater_than_equal'
  | 'less_than'
  | 'less_than_equal'
  | 'too_short'
  | 'too_long'
  | 'enum'
  | 'json_invalid'
  | 'model_attributes_type'
  | 'list_type'
  | 'dict_type'
  | 'uuid_parsing';
// Danh sách trên là các type ĐÃ QUAN SÁT ĐƯỢC khi chạy thật với schema của repo.
// Pydantic v2 còn nhiều type khác; giữ `type: string` trong interface để không vỡ.

export function isValidationErrorBody(b: unknown): b is ValidationErrorBody {
  return (
    typeof b === 'object' && b !== null &&
    'detail' in b && Array.isArray((b as { detail: unknown }).detail)
  );
}

export function isRateLimitErrorBody(b: unknown): b is RateLimitErrorBody {
  return (
    typeof b === 'object' && b !== null &&
    'error' in b && typeof (b as { error: unknown }).error === 'string' &&
    (b as { error: string }).error.startsWith('Rate limit exceeded: ')
  );
}

export function isApiErrorBody(b: unknown): b is ApiErrorBody {
  return (
    typeof b === 'object' && b !== null &&
    'detail' in b && typeof (b as { detail: unknown }).detail === 'string' &&
    'code' in b
  );
}

/**
 * Trích message hiển thị được từ BẤT KỲ body lỗi nào.
 * Thứ tự kiểm tra là quan trọng: mảng detail phải xét TRƯỚC string detail,
 * vì cả hai đều nằm dưới cùng key `detail` với cùng status 422.
 */
export function extractErrorMessage(status: number, body: unknown): string {
  if (isValidationErrorBody(body)) {
    return body.detail.map((i) => `${i.loc.join('.')}: ${i.msg}`).join('; ');
  }
  if (isRateLimitErrorBody(body)) return body.error;
  if (isApiErrorBody(body)) return body.detail;
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    return String((body as { detail: unknown }).detail); // hình dạng B, 404/405
  }
  if (typeof body === 'string') return body; // 500 text/plain
  return `HTTP ${status}`;
}
```

### 13.4 Bảng tra nhanh: status → các hình dạng có thể gặp

| Status | Hình dạng có thể | Cách phân biệt |
|---|---|---|
| 400 | A (`code: BAD_REQUEST`), B, IPN | có `code` → A; có `error` → IPN; còn lại B |
| 401 | A (`code: UNAUTHORIZED`), IPN | có `error` → IPN |
| 403 | A (`code: FORBIDDEN`) | |
| 404 | A (`code: NOT_FOUND`), B (`"Not Found"` tiếng Anh) | |
| 405 | B (`"Method Not Allowed"`) + header `Allow` | |
| 409 | A (`code: CONFLICT`), B | |
| 413 | B | |
| 415 | B | |
| **422** | **A (`code: UNPROCESSABLE_ENTITY`), B (`detail` string), C (`detail` array)** | ⚠️ ba hình dạng cùng status — bắt buộc dùng type guard |
| 429 | D (`{"error": ...}`) | |
| 500 | **text/plain**, không phải JSON | |
| 502 | B | |
| 503 | A (`code: SERVICE_UNAVAILABLE`), B, hoặc `HealthResponse` (health endpoint) | |

---

## 14. Mapping sang NestJS

### 14.1 Bốn lớp exception + filter

Tạo `src/common/errors/app.exception.ts`:

```ts
export class AppException extends HttpException {
  constructor(
    status: number,
    detail: string,
    readonly code: ErrorCode | null = null,
    headers?: Record<string, string>,
  ) {
    super({ detail, code }, status);
    this.appHeaders = headers;
  }
  readonly appHeaders?: Record<string, string>;
}

export class NotFoundError extends AppException {
  constructor(resource = 'Tài nguyên', detail?: string) {
    super(404, detail ?? `Không tìm thấy ${resource}`, 'NOT_FOUND');
  }
}
export class ConflictError extends AppException {
  constructor(detail = 'Tài nguyên đã tồn tại') { super(409, detail, 'CONFLICT'); }
}
export class UnauthorizedError extends AppException {
  constructor(detail = 'Thông tin xác thực không hợp lệ') {
    // Header WWW-Authenticate set ở đây để khớp source Python (đã sửa 2026-08-18),
    // nhưng filter CỐ Ý KHÔNG emit nó (xem mục 2.2).
    super(401, detail, 'UNAUTHORIZED', { 'WWW-Authenticate': 'Bearer' });
  }
}
export class ForbiddenError extends AppException {
  constructor(detail = 'Không đủ quyền truy cập') { super(403, detail, 'FORBIDDEN'); }
}
export class BadRequestError extends AppException {
  constructor(detail = 'Yêu cầu không hợp lệ') { super(400, detail, 'BAD_REQUEST'); }
}
export class UnprocessableEntityError extends AppException {
  constructor(detail = 'Dữ liệu không thể xử lý') { super(422, detail, 'UNPROCESSABLE_ENTITY'); }
}
export class ServiceUnavailableError extends AppException {
  constructor(detail = 'Dịch vụ tạm thời không khả dụng') { super(503, detail, 'SERVICE_UNAVAILABLE'); }
}
```

`AppExceptionFilter` (`@Catch(AppException)`) trả **đúng** `{ detail, code }` và **không** set `appHeaders` (để khớp bug hiện tại).

`HttpExceptionFilter` (`@Catch(HttpException)`, đăng ký **sau** filter trên) xử lý `HttpException` thuần → chỉ `{ detail }`.

### 14.2 Cấu hình để ra 422 thay vì 400 — 5 việc bắt buộc

Nest mặc định trả **400** cho lỗi validate. Phải đổi:

1. **`ValidationPipe` / `ZodValidationPipe` phải throw 422**, không 400:
   ```ts
   new ZodValidationPipe({
     exceptionFactory: (issues) => new HttpException({ detail: toPydanticItems(issues) }, 422),
   })
   ```
   (`toPydanticItems` là hàm map ở bảng mục 5.13.)

2. **Body của 422 phải là `{detail: [...]}`**, không phải `{statusCode, message, error}` mặc định của Nest. Nếu dùng `ValidationPipe` built-in thì `exceptionFactory` là chỗ duy nhất kiểm soát được — nhưng vẫn nên dùng Zod (xem chương 01, mục 3.3).

3. **Không bật `transform`/`whitelist` kiểu strip mặc định nếu Pydantic không strip.** **CHƯA XÁC ĐỊNH** — cần đọc `model_config` từng schema để biết `extra` là `ignore` (Pydantic v2 default) hay `forbid`; grep sơ bộ chỉ thấy `model_config = {"from_attributes": True}` ở response model. Nếu tất cả đều dùng default thì extra field được **bỏ qua im lặng**, và NestJS phải `whitelist: true, forbidNonWhitelisted: false`.

4. **Lỗi parse JSON phải ra 422**, không phải 400 của `body-parser`. Bắt lỗi của body-parser (`SyntaxError` với `type === 'entity.parse.failed'`) trong một filter riêng và map sang item `json_invalid` (mục 5.10). Đây là chỗ mặc định của Express/Fastify **chắc chắn** khác.

5. **Body rỗng phải ra 422 `{type:"missing", loc:["body"]}`**, không phải pass-through với `{}`. Zod schema phải `.strict()`-check chính object gốc, và pipe phải phân biệt `undefined` (thiếu body) với `{}` (body rỗng hợp lệ).

### 14.3 Các filter khác cần đăng ký

| Filter | `@Catch` | Trả về |
|---|---|---|
| `AppExceptionFilter` | `AppException` | `{detail, code}` + status của exception |
| `HttpExceptionFilter` | `HttpException` | `{detail}` (đọc `detail` từ response object, hoặc `message` nếu là string) |
| `ZodValidationFilter` | `ZodError` (nếu không bắt trong pipe) | `{detail: ValidationErrorItem[]}`, status 422 |
| `JsonParseFilter` | `SyntaxError` từ body parser | `{detail: [{type:'json_invalid',...}]}`, status 422 |
| `ThrottlerFilter` | `ThrottlerException` | `{error: "Rate limit exceeded: N per 1 minute"}`, status 429 |
| (404/405) | — | Cấu hình adapter để trả `{detail:"Not Found"}` / `{detail:"Method Not Allowed"}` + header `Allow` |
| `CatchAllFilter` | `Error` | **Quyết định:** giữ `text/plain "Internal Server Error"` (bug-compatible) hoặc đổi sang JSON (khuyến nghị — xem 7.3) |

### 14.4 Thứ tự middleware phải khớp

Để giữ đúng bảng header ở 9.2:

```
Throttler (ngoài cùng, 429 KHÔNG có X-Request-ID)
  → RequestId (echo hoặc sinh X-Request-ID)
    → CORS
      → filters/pipes
        → controllers
```

Với Fastify adapter, `onRequest` hook cho throttler và `onSend` hook cho request-id là cách map gần nhất. Nếu chọn thứ tự "đúng đắn hơn" (request-id ngoài cùng) thì 429 sẽ **có thêm** `X-Request-ID` — thay đổi nhỏ, chấp nhận được, nhưng phải ghi lại.

### 14.5 Quy tắc vàng khi port 467 chỗ raise

1. **Copy message y hệt** — kể cả lỗi chính tả, viết hoa không nhất quán (`"người dùng"` vs `"Người dùng"`), và các câu tối nghĩa do prefix (`"Không tìm thấy Mã VNM không có trong danh sách"`). Nếu muốn sửa, mở PR riêng.
2. **Giữ đúng status** kể cả khi phản trực giác (`ValueError → 404` ở backtest; `Không tìm thấy lệnh mua tương ứng → 409` ở Cấp 1; `Trạng thái tài khoản` → 401 ở login nhưng 403 ở token check).
3. **Giữ đúng thứ tự kiểm tra** trong các hàm nhiều bước (`place_order` 11 bước, guard chain auth, upload lesson MIME-trước-404).
4. **Giữ đúng format số**: `{x:,}` → `100,000,000,000`; `{x}` → `100000000000`. Ở Python `f"{n:,}"` dùng dấu phẩy; trong TS dùng `n.toLocaleString('en-US')`.
5. **Giữ đúng repr list của Python** khi nội suy `{sorted(...)}` vào message (`['1D', '1H', ...]` — nháy đơn, ngoặc vuông, sort ASCII).
6. **Escape đúng dấu ngoặc kép** trong message Cấp 8 (`ô "mua bất chấp cảnh báo"`).
7. **Viết snapshot test cho từng nhóm** trước khi port logic, không sau.

---

## 15. Checklist nghiệm thu chương này

- [ ] `{"detail","code"}` — đúng 2 field, **không** có `errors`, cho cả 7 lớp exception.
- [ ] 401 **có** header `WWW-Authenticate: Bearer` (bug đã sửa 2026-08-18 — filter phải forward headers của exception).
- [ ] 422 nghiệp vụ có `code`, `detail` là string; 422 validate không có `code`, `detail` là array. Cùng status.
- [ ] 13 payload validate ở mục 5.1–5.12 khớp byte-for-byte (snapshot test).
- [ ] `msg` của `field_validator` có prefix `"Value error, "` và `ctx.error === {}`.
- [ ] `input` là string cho query param, kiểu gốc cho body, object cha cho `type:"missing"`.
- [ ] 429 body là `{"error":"Rate limit exceeded: N per 1 minute"}`, **không** có `Retry-After` / `X-RateLimit-*`.
- [ ] Route có decorator limit **không** cộng dồn với limit mặc định 60/phút.
- [ ] 404 route không tồn tại → `{"detail":"Not Found"}` (tiếng Anh); 405 → `{"detail":"Method Not Allowed"}` + header `Allow`.
- [ ] 500 — quyết định đã ghi rõ (`text/plain` giữ nguyên, hay đổi sang JSON).
- [ ] `X-Request-ID` có trên mọi response **trừ** 500 và 429-từ-middleware.
- [ ] Webhook SePay IPN trả `{"error": slug}` với 401/400 và **vẫn ghi `IPNLog`**.
- [ ] Webhook Telegram trả `{"ok":true}` trong **mọi** tình huống lỗi.
- [ ] Login thất bại **vẫn ghi** login history (commit riêng, không bị rollback).
- [ ] Quyết định về `revoke_family` bị rollback (mục 12.3) đã ghi trong changelog.
- [ ] 502 của market-data có message `"Tất cả {N} nguồn dữ liệu thị trường đều thất bại"`, chi tiết `last_exc` **chỉ ở log**.
- [ ] AI proxy error **không** echo response body ra client (bảo mật API key).
- [ ] `/health` trả 503 khi database unhealthy nhưng body là `HealthResponse`, không phải envelope lỗi. Redis unhealthy **không** làm 503.
