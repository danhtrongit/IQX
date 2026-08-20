# Endpoint — Quản trị: người dùng, số liệu, hệ thống, audit

Chương này đặc tả **12 endpoint** thuộc bốn nhóm quản trị lõi của IQX: quản lý người dùng (hồ sơ 360, hành động hàng loạt, đặt lại mật khẩu, gửi lại email xác thực, xuất CSV, lịch sử đăng nhập), số liệu KPI (overview / doanh thu theo ngày / phân bố gói), trạng thái hệ thống + kích hoạt scheduled job thủ công, và trình xem audit log.

Toàn bộ nhóm này nằm dưới prefix `/api/v1` và **bắt buộc Bearer + quyền `admin`**. Mọi endpoint gây thay đổi dữ liệu (mutation) đều ghi một dòng vào bảng `admin_audit_log` trong **cùng transaction** với thay đổi đó — xem `## Nghiệp vụ nền`.

Nguồn sự thật: bản cắt OpenAPI `slice-admin-core.json` (hình dạng) + source Python `app/api/v1/endpoints/admin_users.py`, `admin_metrics.py`, `admin_system.py`, `admin_audit.py`, `app/services/admin_users.py`, `admin_metrics.py`, `admin_audit.py`, `app/api/deps_audit.py`, `app/services/jobs/__init__.py` (hành vi).

---

## Bảng tra nhanh

| # | METHOD | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/admin/users/export` | Bearer + Admin | Xuất danh sách người dùng ra **CSV** (stream) |
| 2 | POST | `/api/v1/admin/users/bulk` | Bearer + Admin | Đổi role / status / xoá mềm tối đa 500 user một lượt |
| 3 | GET | `/api/v1/admin/users/{user_id}/360` | Bearer + Admin | Hồ sơ 360° của một người dùng |
| 4 | POST | `/api/v1/admin/users/{user_id}/reset-password` | Bearer + Admin | Sinh mật khẩu tạm 16 ký tự + gửi email đặt lại |
| 5 | POST | `/api/v1/admin/users/{user_id}/resend-verification` | Bearer + Admin | Gửi lại email xác thực |
| 6 | GET | `/api/v1/admin/users/{user_id}/login-history` | Bearer + Admin | Lịch sử đăng nhập có phân trang |
| 7 | GET | `/api/v1/admin/metrics/overview` | Bearer + Admin | Ảnh chụp KPI nền tảng |
| 8 | GET | `/api/v1/admin/metrics/revenue` | Bearer + Admin | Chuỗi doanh thu theo ngày |
| 9 | GET | `/api/v1/admin/metrics/plan-distribution` | Bearer + Admin | Số subscription active theo từng gói |
| 10 | GET | `/api/v1/admin/system/status` | Bearer + Admin | Version, scheduler, jobs, đếm bảng, IPN |
| 11 | POST | `/api/v1/admin/system/jobs/{job_id}/run` | Bearer + Admin | Chạy thủ công một scheduled job |
| 12 | GET | `/api/v1/admin/audit` | Bearer + Admin | Danh sách audit log có bộ lọc + phân trang |

---

## Kiểu dữ liệu dùng chung

~~~ts
/** Bọc phân trang chuẩn toàn hệ thống (app/schemas/common.py::PaginatedResponse). */
interface PaginatedResponse<T> {
  items: T[];
  total: number;        // tổng số dòng khớp filter
  page: number;         // 1-based
  page_size: number;
  total_pages: number;  // ceil(total / page_size); = 0 khi total = 0
}

/** Body lỗi chuẩn do app_exception_handler trả về. */
interface ErrorResponse {
  detail: string;              // tiếng Việt, hiển thị được cho admin
  code: string | null;         // NOT_FOUND | BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | ...
}

/** Lỗi validate của FastAPI (422) — NestJS nên giữ nguyên hình dạng này. */
interface HTTPValidationError {
  detail: Array<{ loc: (string | number)[]; msg: string; type: string }>;
}

type UserRole = "admin" | "user" | "premium";
type UserStatus = "active" | "inactive" | "suspended" | "deleted";
type SubscriptionStatus = "active" | "expired" | "cancelled";
type PaymentOrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";
type GrantType = "payment" | "admin_grant";     // cột nullable trong DB
type VTAccountStatus = "active" | "suspended";
type VTOrderSide = "buy" | "sell";
type VTOrderStatus = "pending" | "filled" | "cancelled" | "expired" | "rejected";
type BulkOp = "set_role" | "set_status" | "soft_delete";
~~~

**Quy ước chung của cả chương**

- Mọi số tiền là **VND, số nguyên (`number`)**, không có phần thập phân, không nhân/chia 1000.
- Mọi `datetime` serialize theo ISO-8601. Cảnh báo: một số cột trong DB gốc là `DateTime` **naive** (không timezone) — `users.created_at`, `virtual_orders.created_at` — nên chuỗi trả ra có thể **không có hậu tố `Z`/offset**. Các cột `DateTime(timezone=True)` (`admin_audit_log.created_at`, `user_login_history.login_at`, `sepay_ipn_logs.received_at`) trả ra kèm offset. Khi viết lại bằng TypeScript nên **chuẩn hoá tất cả về `timestamptz`** và ghi rõ trong changelog rằng đây là thay đổi có chủ ý.
- `date` (chỉ trong `DailyRevenuePoint`) là chuỗi `"YYYY-MM-DD"`.
- Tất cả tính toán mốc thời gian trong nhóm này dùng **UTC** (`datetime.now(UTC)`), **không** dùng `Asia/Ho_Chi_Minh`. Xem cảnh báo múi giờ ở mục 7 và 8.

---

## Nghiệp vụ nền

### 1. Guard admin — thứ tự kiểm tra bắt buộc

Chuỗi dependency là `get_current_user` → `get_current_active_user` → `get_current_admin`. Phải giữ **đúng thứ tự** này, vì mã lỗi khác nhau ở từng bước:

| Bước | Điều kiện fail | Status | code | detail |
|---|---|---|---|---|
| 1 | Không có header `Authorization: Bearer …` | 401 | `UNAUTHORIZED` | `Yêu cầu xác thực` |
| 1 | Token sai/hết hạn/user không tồn tại | 401 | `UNAUTHORIZED` | do `AuthService` sinh — xem chương Auth |
| 2 | `user.status != "active"` | 403 | `FORBIDDEN` | `Tài khoản chưa được kích hoạt` |
| 3 | `user.role != "admin"` | 403 | `FORBIDDEN` | `Yêu cầu quyền quản trị viên` |

Kèm 401: header `WWW-Authenticate: Bearer`.

### 2. `AuditContext` — dependency dựng ngữ cảnh audit

`app/api/deps_audit.py` dựng object sau cho **mỗi request** đến endpoint có mutation:

~~~ts
interface AuditContext {
  admin_id: string;            // uuid của admin đang đăng nhập
  ip: string | null;           // request.client.host — địa chỉ TCP peer
  user_agent: string | null;   // header user-agent, cắt còn 500 ký tự khi lưu
  request_id: string;          // ưu tiên request.state.request_id (middleware)
                               // → rồi header X-Request-ID → rồi uuid4() mới
}
~~~

`RequestIDMiddleware` đọc header `X-Request-ID` (hoặc sinh `uuid4()`), gắn vào `request.state.request_id`, và **echo lại header `X-Request-ID` trên response**. Cột `admin_audit_log.request_id` chỉ dài `String(40)` — UUID 36 ký tự vừa đủ; nếu client gửi request-id dài hơn 40 ký tự, Postgres sẽ báo lỗi. Khi viết lại: **cắt còn 40 ký tự trước khi insert**.

Lưu ý bảo mật: `ip` lấy từ TCP peer, **không** đọc `X-Forwarded-For`. Sau reverse proxy (Coolify/nginx) giá trị này sẽ là IP của proxy. Đây là hành vi gốc — nếu muốn IP thật, phải bật trust-proxy và ghi rõ là thay đổi có chủ ý.

### 3. `AdminAuditService.record()` — hợp đồng ghi audit

~~~ts
interface RecordAuditInput {
  ctx: AuditContext | null;    // null cho hành động hệ thống (job) → admin_user_id = NULL
  action: string;              // <= 80 ký tự, namespace "domain.verb"
  target_entity?: string | null;  // <= 60 ký tự: "user" | "job" | "plan" | ...
  target_id?: string | null;      // <= 100 ký tự, đã stringify
  before?: Record<string, unknown> | null;  // chỉ các khoá đã đổi
  after?: Record<string, unknown> | null;
  note?: string | null;        // <= 1000 ký tự
}
~~~

Ba quy tắc **không được vi phạm** khi viết lại:

1. `record()` **chỉ flush, KHÔNG commit**. Transaction của request sở hữu commit → hoặc cả mutation + dòng audit cùng vào DB, hoặc cả hai cùng rollback.
2. `record()` **không bọc try/catch**. Nếu ghi audit lỗi thì cả request phải fail ầm ĩ (403/500), không được âm thầm bỏ qua.
3. Bảng `admin_audit_log` là **append-only** — không có code nào UPDATE/DELETE nó.

Helper `diff_dict(before, after)` trả về cặp `(before_subset, after_subset)` **chỉ chứa các khoá có giá trị khác nhau**; nếu cả hai rỗng hoặc không có gì đổi thì trả `(null, null)`.

### 4. Bảng tra ĐẦY ĐỦ giá trị `action` mà hệ thống ghi

Đây là bảng tra cho bộ lọc `action_prefix` của endpoint #12. Danh sách lấy từ **mọi** chỗ gọi `AdminAuditService.record()` cùng hai job ghi trực tiếp vào model:

| `action` | `target_entity` | `target_id` | Nơi phát sinh (file gốc) |
|---|---|---|---|
| `user.create` | `user` | uuid user | `endpoints/users.py` |
| `user.update` | `user` | uuid user | `endpoints/users.py` |
| `user.delete` | `user` | uuid user | `endpoints/users.py` |
| `user.bulk_update` | `user` | uuid user (1 dòng/user) | `services/admin_users.py` — **endpoint #2** |
| `user.password_reset` | `user` | uuid user | `services/admin_users.py` — **endpoint #4** |
| `user.verify_resend` | `user` | uuid user | `services/admin_users.py` — **endpoint #5** |
| `user.export` | `user` | `null` | `services/admin_users.py` — **endpoint #1** |
| `premium.plan.create` | `plan` | — | `endpoints/premium.py` |
| `premium.plan.update` | `plan` | — | `endpoints/premium.py` |
| `premium.plan.delete` | `plan` | — | `endpoints/premium.py` |
| `premium.grant` | — | — | `endpoints/premium.py` |
| `premium.ipn.retry` | — | — | `services/admin_ipn.py` |
| `premium.order.refund` | — | — | `services/admin_payments.py` |
| `premium.order.mark_paid` | — | — | `services/admin_payments.py` |
| `premium.order.reconcile` | — | — | `services/admin_payments.py` (2 chỗ gọi) |
| `premium.subscription.cancel` | — | — | `services/admin_payments.py` |
| `subscription.cancel` | — | — | `services/admin_subscriptions.py` |
| `subscription.extend` | — | — | `services/admin_subscriptions.py` |
| `vt.config.update` | — | — | `endpoints/virtual_trading.py` |
| `vt.account.reset` | — | — | `endpoints/virtual_trading.py` |
| `vt.account.reset_all` | — | — | `endpoints/virtual_trading.py` |
| `vt.account.freeze` | — | — | `services/admin_vt.py` |
| `vt.account.unfreeze` | — | — | `services/admin_vt.py` |
| `vt.cash.adjust` | — | — | `services/admin_vt.py` |
| `lesson.course.create` / `.update` / `.delete` / `.thumbnail` | — | — | `endpoints/admin_lessons.py` |
| `lesson.episode.create` / `.update` / `.delete` / `.upload` / `.reorder` | — | — | `endpoints/admin_lessons.py` |
| `market_analysis.run` | — | — | `endpoints/market_analysis.py` |
| `market_analysis.midday.run` | — | — | `endpoints/market_analysis.py` |
| `market_analysis.premarket.run` | — | — | `endpoints/market_analysis.py` |
| `system.job_run` | `job` | `job_id` (chuỗi) | `endpoints/admin_system.py` — **endpoint #11** |
| `system.expiry_sweep` | `null` | `null` | `services/jobs/expiry_sweep.py` — `admin_user_id = NULL` |
| `system.ipn_reconcile_scan` | `null` (không set) | `null` | `services/jobs/ipn_reconcile.py` — `admin_user_id = NULL` |

Các cột `target_entity` / `target_id` ghi `—` là những chỗ nằm **ngoài phạm vi chương này**; giá trị chính xác nằm trong chương tương ứng (Premium, VT, Lessons, Market analysis). Không suy đoán.

### 5. Rate limit

Toàn app dùng `slowapi` với **giới hạn mặc định `60/minute` theo IP** (`RATE_LIMIT_DEFAULT`), áp qua `SlowAPIMiddleware` cho mọi route. **Không** endpoint nào trong 12 endpoint này khai báo giới hạn riêng — kể cả `reset-password` và `resend-verification`. Rate limiter bị **tắt** khi `APP_ENV in ("testing", "test")`. Storage là `memory://` → không chia sẻ giữa các process; nếu chạy nhiều instance thì giới hạn thực tế là 60/phút **mỗi instance**.

---

## Nhóm 1 — Người dùng (`/admin/users`)

> **Cảnh báo thứ tự khai báo route:** trong FastAPI, `/export` **phải** được khai báo TRƯỚC `/{user_id}/...`, nếu không `"export"` sẽ bị ép thành UUID và trả 422. Trong NestJS, đặt method `@Get('export')` phía trên các route có param, hoặc dùng `ParseUUIDPipe` cho `user_id` để phân biệt.

### GET /api/v1/admin/users/export

> **Xuất người dùng ra CSV** — stream file CSV danh sách user khớp bộ lọc để admin mở bằng Excel / nạp vào CRM.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `users` |
| **Side-effect** | Ghi 1 dòng `admin_audit_log` với `action="user.export"`, `target_entity="user"`, `payload_after={row_count, filters}` |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `role` | `string` | không | `null` | phải là một `UserRole` hợp lệ | Lọc đúng bằng role |
| `status` | `string` | không | `null` | phải là một `UserStatus` hợp lệ | Lọc đúng bằng status |
| `search` | `string` | không | `null` | — | `ILIKE '%term%'` trên `email` **HOẶC** `full_name` |
| `last_login_from` | `string` (date-time) | không | `null` | — | `last_login_at >= from` (**>=**, bao gồm mốc) |
| `last_login_to` | `string` (date-time) | không | `null` | — | `last_login_at < to` (**<**, KHÔNG bao gồm mốc) |

**Request body** — —

**Response 200** — Đây là **`text/csv`, KHÔNG phải JSON.**

> **Lệch OpenAPI:** bản cắt `slice-admin-core.json` ghi `content: {"application/json": {"schema": {}}}` cho response 200. Đây là **sai lệch do handler Python thiếu `response_class=StreamingResponse`** trong decorator — FastAPI mặc định đoán `application/json`. Hành vi thật (khẳng định bởi `tests/test_admin_users.py::test_export_csv_basic`: `assert "text/csv" in resp.headers["content-type"]`) là CSV. Khi viết lại bằng NestJS, **khai báo `@Header('Content-Type', 'text/csv')` và cập nhật OpenAPI cho đúng**.

Đặc tả file:

| Thuộc tính | Giá trị chính xác |
|---|---|
| `Content-Type` | `text/csv` (Starlette thêm `; charset=utf-8`) |
| `Content-Disposition` | `attachment; filename=users-<YYYYMMDD-HHmmss>.csv` — **không có dấu ngoặc kép** quanh tên file; timestamp lấy từ `datetime.utcnow()` (**UTC**, không phải giờ VN) |
| Encoding | **UTF-8 KHÔNG có BOM** (`buf.getvalue().encode("utf-8")`, không ghi `﻿`) |
| Dấu phân tách | `,` (dấu phẩy — `csv.writer` mặc định) |
| Trích dẫn | `QUOTE_MINIMAL` — chỉ bọc `"` khi ô chứa `,`, `"`, `\r` hoặc `\n`; `"` bên trong nhân đôi thành `""` |
| Kết thúc dòng | `\r\n` (CRLF — mặc định của `csv.writer` Python) |
| Stream | **CÓ** — `StreamingResponse` sinh dữ liệu theo lô 500 dòng |
| Sắp xếp | `created_at DESC` (user mới nhất lên đầu) |

Header CSV — **đúng 9 cột, đúng thứ tự này**:

~~~
id,email,full_name,phone_e164,role,status,is_email_verified,last_login_at,created_at
~~~

Quy tắc chuyển giá trị từng cột:

| Cột | Nguồn | Khi NULL |
|---|---|---|
| `id` | `str(user.id)` | — |
| `email` | `users.email` | — |
| `full_name` | `users.full_name` | — |
| `phone_e164` | `users.phone_e164` — **cột E.164, KHÔNG phải `phone_number`** | chuỗi rỗng `""` |
| `role` | `users.role` (giá trị enum: `admin`/`user`/`premium`) | — |
| `status` | `users.status` | — |
| `is_email_verified` | `"1"` nếu true, `"0"` nếu false — **KHÔNG phải `true`/`false`** | — |
| `last_login_at` | `.isoformat()` | chuỗi rỗng `""` |
| `created_at` | `.isoformat()` | chuỗi rỗng `""` |

Ví dụ nội dung file thật (CRLF hiển thị dưới dạng xuống dòng):

~~~
id,email,full_name,phone_e164,role,status,is_email_verified,last_login_at,created_at
9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f,nguyen.van.an@iqx.vn,Nguyễn Văn An,+84912345678,premium,active,1,2026-08-17T02:11:43.512000,2026-05-03T08:22:10.004000
a2b3c4d5-6e7f-4081-9a2b-3c4d5e6f7081,tran.thi.bich@gmail.com,"Trần Thị Bích, CFA",+84987654321,user,active,0,,2026-07-29T14:05:33.881000
b7c8d9e0-1f2a-4b3c-8d4e-5f60718293a4,le.minh.hoang@iqx.vn,Lê Minh Hoàng,,admin,active,1,2026-08-17T01:47:02.190000,2026-01-12T03:00:00
~~~

(Chú ý dòng 2: `full_name` chứa dấu phẩy nên bị bọc trong `"`; `last_login_at` rỗng vì user chưa từng đăng nhập; dòng 3 `phone_e164` rỗng.)

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Bộ lọc khớp > `EXPORT_MAX_ROWS` = **50 000** dòng | `Export filter matches {total} rows (max 50000). Tighten filters first.` — **detail này là tiếng Anh trong source gốc**, giữ nguyên hoặc dịch có chủ ý và ghi vào changelog |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `role` / `status` truyền giá trị không thuộc enum | `HTTPValidationError` — **nhưng xem ghi chú bên dưới**, hành vi gốc là 500 |

**Fallback / suy giảm**

- Không có user nào khớp → trả **200** với file chỉ chứa dòng header (`total = 0` vẫn hợp lệ, không phải 404).
- Việc đếm số dòng (`count_for_export`) chạy **TRƯỚC** khi mở stream, cố ý — để `BadRequestError` có thể trả về HTTP 400 bình thường thay vì crash giữa stream (lúc đó header 200 đã gửi rồi, client sẽ nhận file CSV bị cắt cụt không có tín hiệu lỗi nào).
- Không có provider ngoài → không có nhánh suy giảm nào khác.

**curl**

~~~bash
curl -N -X GET \
  'https://api.iqx.vn/api/v1/admin/users/export?role=premium&status=active&search=nguy%E1%BB%85n&last_login_from=2026-08-01T00:00:00Z&last_login_to=2026-08-17T00:00:00Z' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4d9f1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b' \
  -o users-export.csv
~~~

**Ghi chú khi viết lại**

1. **RỦI RO RÒ DỮ LIỆU CÁ NHÂN — mức cao.** File này xuất email + họ tên đầy đủ + số điện thoại E.164 của **toàn bộ** người dùng, tối đa 50 000 dòng, qua một request GET duy nhất, không có bước xác nhận, không giới hạn số lần gọi ngoài 60/phút mặc định. Khi viết lại **nên** (a) buộc `note`/lý do xuất và lưu vào audit, (b) đặt rate limit riêng rất chặt (ví dụ 3/giờ/admin), (c) cân nhắc mask `phone_e164`, (d) alert khi có export > N dòng. Dòng audit `user.export` hiện đã lưu `filters` + `row_count` — **phải giữ**, vì đây là dấu vết điều tra duy nhất.
2. **BUG CẦN SỬA — audit ghi bên trong generator.** Ở bản Python, `record("user.export")` được gọi **bên trong** async generator `stream_csv()`, tức là chạy trong lúc body đang được stream. Từ FastAPI ≥ 0.106, dependency dạng `yield` (ở đây là `get_db`, chủ sở hữu commit) thoát **trước khi** body được gửi → dòng audit rất có thể **không được commit** trên production (test pass vì fixture override giữ session mở). Khi viết lại: **ghi dòng audit và commit TRƯỚC khi bắt đầu stream.**
3. **Encoding không có BOM → Excel trên Windows hiển thị "Nguyá»…n VÄƒn An".** Đây là hành vi gốc. Cân nhắc thêm BOM `﻿` và ghi rõ là thay đổi có chủ ý; nếu giữ nguyên, phải nói trong UI là "mở bằng Google Sheets / import với encoding UTF-8".
4. **Phân trang stream bằng `OFFSET` không an toàn.** Vòng lặp dùng `ORDER BY created_at DESC LIMIT 500 OFFSET n` — `created_at` không unique, và không có tie-breaker → có thể **trùng hoặc mất dòng** khi có nhiều user cùng `created_at`, hoặc khi có user mới được tạo giữa lúc export. Khi viết lại: dùng keyset pagination `(created_at, id)` hoặc một server-side cursor.
5. **`role`/`status` sai giá trị → 500, không phải 422.** Filter gọi `UserRole(params.role)` / `UserStatus(params.status)` **bên trong** hàm build query, sau khi Pydantic đã validate (khai báo chỉ là `str | None`, không phải enum). Truyền `?role=superadmin` sẽ ném `ValueError` không được bắt → 500. Khi viết lại: **khai báo hai query param này là enum** để trả 422 sạch.
6. Ranh giới ngày là **bất đối xứng có chủ ý**: `from` dùng `>=`, `to` dùng `<`. Giữ nguyên để kết quả không bị đếm trùng khi admin ghép các khoảng liền kề.
7. Số dòng `count` được tính **hai lần** (một lần ở endpoint để chặn, một lần trong generator để ghi audit). Giữa hai lần đó có thể chênh nhau — dòng audit ghi lần đếm thứ hai. Khi viết lại nên đếm một lần và dùng lại.

---

### POST /api/v1/admin/users/bulk

> **Cập nhật người dùng hàng loạt** — đổi role, đổi status, hoặc xoá mềm cho tối đa 500 user trong một request.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `users` |
| **Side-effect** | Cập nhật `users.role` / `users.status` / `users.deleted_at`; ghi **MỘT dòng `admin_audit_log` cho MỖI user thành công** (`action="user.bulk_update"`) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface BulkUpdateRequest {
  /** 1..500 uuid. Trùng lặp KHÔNG bị loại — xem ghi chú. */
  user_ids: string[];
  op: BulkOp;                 // "set_role" | "set_status" | "soft_delete"
  /** Bắt buộc (chuỗi không rỗng) cho set_role / set_status.
   *  Với soft_delete: bị ép thành null, giá trị truyền lên bị bỏ qua. */
  value?: string | null;
}
~~~

Bảng hành động hợp lệ — **danh sách ĐẦY ĐỦ, chỉ có 3**:

| `op` | `value` hợp lệ | Thay đổi trên bản ghi user |
|---|---|---|
| `set_role` | `"admin"` \| `"user"` \| `"premium"` | `role = value` |
| `set_status` | `"active"` \| `"inactive"` \| `"suspended"` \| `"deleted"` | `status = value` |
| `soft_delete` | *(bỏ qua, luôn `null`)* | `status = "deleted"` **và** `deleted_at = now()` (UTC) |

~~~json
{
  "user_ids": [
    "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
    "a2b3c4d5-6e7f-4081-9a2b-3c4d5e6f7081",
    "00000000-0000-4000-8000-000000000000"
  ],
  "op": "set_role",
  "value": "premium"
}
~~~

**Response 200**

~~~ts
interface BulkUpdateError {
  user_id: string;
  message: string;   // tiếng Anh, do source gốc sinh: "invalid role: superadmin"
}

interface BulkUpdateResponse {
  affected: number;        // số user đã đổi thành công (đã flush + đã ghi audit)
  skipped: string[];       // uuid KHÔNG tồn tại trong bảng users
  errors: BulkUpdateError[]; // uuid tồn tại nhưng xử lý thất bại
}
~~~

~~~json
{
  "affected": 2,
  "skipped": ["00000000-0000-4000-8000-000000000000"],
  "errors": []
}
~~~

Ví dụ khi `value` sai enum (op = `set_role`, value = `"superadmin"`):

~~~json
{
  "affected": 0,
  "skipped": [],
  "errors": [
    { "user_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f", "message": "invalid role: superadmin" },
    { "user_id": "a2b3c4d5-6e7f-4081-9a2b-3c4d5e6f7081", "message": "invalid role: superadmin" }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `user_ids` rỗng, hoặc > 500 phần tử, hoặc phần tử không phải UUID | `HTTPValidationError` |
| 422 | — | `op` không thuộc 3 giá trị enum | `HTTPValidationError` |
| 422 | — | `op` là `set_role`/`set_status` mà `value` thiếu hoặc là chuỗi rỗng | msg: `Value error, \`value\` is required for set_role / set_status` |

**Fallback / suy giảm**

- Đây là **partial success**: response luôn **200** kể cả khi `affected = 0`. Client phải tự đọc `skipped` + `errors` để biết kết quả thật.
- `user_id` không tồn tại → vào `skipped` (**không** phải `errors`, không phải 404). Khẳng định bởi `tests/test_admin_users.py::test_bulk_with_missing_user_ids`.
- `value` sai enum, hoặc bất kỳ exception nào khi cập nhật một user → vào `errors` với `message = str(exception)`; vòng lặp **tiếp tục** sang user kế tiếp.
- Không có provider ngoài, không có nhánh ngoài giờ.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/admin/users/bulk' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7a1b2c3d-4e5f-4061-8273-849506a7b8c9' \
  -d '{
    "user_ids": [
      "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "a2b3c4d5-6e7f-4081-9a2b-3c4d5e6f7081"
    ],
    "op": "set_status",
    "value": "suspended"
  }'
~~~

**Ghi chú khi viết lại**

1. **Audit: MỘT dòng cho MỖI user**, không phải một dòng cho cả batch. `target_entity="user"`, `target_id=str(uid)`, `note = op` (ví dụ `"set_role"`), và `before`/`after` là **kết quả của `diff_dict`** trên `{role, status}` — tức chỉ chứa khoá thực sự đổi. Nếu không có gì đổi (set đúng giá trị cũ) thì `payload_before`/`payload_after` là `null` nhưng dòng audit **vẫn được ghi** và `affected` vẫn tăng. Test `test_bulk_set_role` khẳng định 2 user → đúng 2 dòng audit.
2. **Không có atomicity trên toàn batch.** Vòng lặp `flush()` sau từng user; commit ở cuối request. Nếu request fail sau đó thì *tất cả* rollback (kể cả các `affected` đã báo) — nhưng response đã trả 200 rồi thì không. Khi viết lại nên giữ đúng: một transaction cho cả request, per-user chỉ flush.
3. **Không có bảo vệ chống tự khoá mình / hạ quyền admin cuối cùng.** Admin có thể `set_status=suspended` chính uuid của mình, hoặc `set_role=user` cho toàn bộ admin, và hệ thống chấp nhận. Đây là hành vi gốc, **không** bịa thêm guard; nếu muốn thêm thì ghi rõ là bổ sung mới.
4. **`soft_delete` KHÔNG xoá dữ liệu và KHÔNG revoke refresh token.** Nó chỉ set `status="deleted"` + `deleted_at`. Vì guard `get_current_active_user` chặn `status != "active"`, access token cũ sẽ bị 403 ở request tiếp theo — nhưng refresh token vẫn nằm trong bảng. Cân nhắc revoke và ghi rõ là bổ sung.
5. **`user_ids` trùng lặp không bị dedupe.** Cùng một uuid xuất hiện 3 lần → 3 dòng audit và `affected += 3`. Khi viết lại nên dedupe và ghi vào changelog.
6. `set_status` **cho phép** `value="deleted"` — nhưng nhánh đó **không** set `deleted_at` (chỉ `soft_delete` mới set). Giữ đúng sự khác biệt này, hoặc hợp nhất và ghi rõ.
7. `message` trong `errors` là tiếng Anh nguyên văn từ source (`invalid role: …`, `invalid status: …`, `unknown op`). Nếu dịch sang tiếng Việt thì phải cập nhật cả frontend đang match chuỗi.

---

### GET /api/v1/admin/users/{user_id}/360

> **Hồ sơ 360° người dùng** — gộp trong một response: thông tin cơ bản, subscription hiện tại + toàn bộ lịch sử, đơn thanh toán, tài khoản giao dịch ảo + lệnh gần đây, và lịch sử đăng nhập.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — 6 truy vấn vào `users`, `premium_subscriptions`⋈`premium_plans`, `premium_payment_orders`⋈`premium_plans`, `virtual_trading_accounts`, `virtual_orders`, `user_login_history` |
| **Side-effect** | **KHÔNG có** — endpoint chỉ đọc, **KHÔNG ghi audit log** (xem ghi chú 1) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | `string` | UUID hợp lệ | Id người dùng cần xem |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface PlanBrief {
  id: string;
  code: string;              // "MONTHLY" | "ANNUAL" | "TRIAL_7D" | ...
  name: string;
  price_vnd: number;
  duration_days: number;
}

interface SubscriptionBrief {
  id: string;
  status: SubscriptionStatus;
  plan: PlanBrief | null;            // null nếu current_plan_id trỏ vào plan đã bị xoá
  current_period_start: string;      // ISO datetime
  current_period_end: string;
  is_trial: boolean;                 // = (plan?.code === "TRIAL_7D")
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancel_reason: string | null;
}

interface PaymentOrderBrief {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  status: PaymentOrderStatus;
  grant_type: GrantType | null;
  plan_code: string | null;          // lấy từ plan đã join, null nếu không có plan
  paid_at: string | null;
  created_at: string;
}

interface VTAccountBrief {
  id: string;
  status: VTAccountStatus;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;         // tiền đang giữ cho lệnh mua chờ khớp
  cash_pending_vnd: number;          // tiền bán chờ về (T+)
  activated_at: string | null;
  frozen_at: string | null;
  freeze_reason: string | null;
}

interface VTOrderBrief {
  id: string;
  symbol: string;                    // "FPT" | "VCB" | "HPG" | "VNM" | ...
  side: VTOrderSide;
  status: VTOrderStatus;
  quantity: number;                  // số cổ phiếu
  price_vnd: number | null;          // = virtual_orders.limit_price_vnd → null với lệnh MARKET
  created_at: string;
}

interface LoginHistoryRow {
  id: string;
  user_id: string | null;            // null nếu email không khớp user nào
  email: string;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  user_agent: string | null;
  login_at: string;
}

interface UserBriefForAdmin {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;       // cột phone_number, KHÔNG phải phone_e164
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface User360Response {
  user: UserBriefForAdmin;
  subscription: SubscriptionBrief | null;      // sub ACTIVE còn hiệu lực, mới nhất
  subscription_history: SubscriptionBrief[];   // TẤT CẢ sub, mới → cũ, không giới hạn
  payment_history: PaymentOrderBrief[];        // TỐI ĐA 20, created_at giảm dần
  trial_used: boolean;                         // đã từng có sub gói TRIAL_7D
  vt_account: VTAccountBrief | null;           // 1 tài khoản/user (unique constraint)
  vt_recent_orders: VTOrderBrief[];            // TỐI ĐA 10, created_at giảm dần
  login_history: LoginHistoryRow[];            // TỐI ĐA 20, login_at giảm dần
}
~~~

~~~json
{
  "user": {
    "id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
    "email": "nguyen.van.an@iqx.vn",
    "full_name": "Nguyễn Văn An",
    "phone_number": "0912345678",
    "role": "premium",
    "status": "active",
    "is_email_verified": true,
    "last_login_at": "2026-08-17T02:11:43.512000",
    "created_at": "2026-05-03T08:22:10.004000"
  },
  "subscription": {
    "id": "c3d4e5f6-7081-492a-8b3c-4d5e6f708192",
    "status": "active",
    "plan": {
      "id": "11112222-3333-4444-8555-666677778888",
      "code": "MONTHLY",
      "name": "Gói tháng",
      "price_vnd": 299000,
      "duration_days": 30
    },
    "current_period_start": "2026-08-01T00:00:00+00:00",
    "current_period_end": "2026-08-31T00:00:00+00:00",
    "is_trial": false,
    "cancelled_at": null,
    "cancelled_by_user_id": null,
    "cancel_reason": null
  },
  "subscription_history": [
    {
      "id": "c3d4e5f6-7081-492a-8b3c-4d5e6f708192",
      "status": "active",
      "plan": {
        "id": "11112222-3333-4444-8555-666677778888",
        "code": "MONTHLY",
        "name": "Gói tháng",
        "price_vnd": 299000,
        "duration_days": 30
      },
      "current_period_start": "2026-08-01T00:00:00+00:00",
      "current_period_end": "2026-08-31T00:00:00+00:00",
      "is_trial": false,
      "cancelled_at": null,
      "cancelled_by_user_id": null,
      "cancel_reason": null
    },
    {
      "id": "d4e5f607-8192-4a3b-8c4d-5e6f70819203",
      "status": "expired",
      "plan": {
        "id": "99990000-1111-4222-8333-444455556666",
        "code": "TRIAL_7D",
        "name": "Dùng thử 7 ngày",
        "price_vnd": 0,
        "duration_days": 7
      },
      "current_period_start": "2026-05-03T08:25:00+00:00",
      "current_period_end": "2026-05-10T08:25:00+00:00",
      "is_trial": true,
      "cancelled_at": null,
      "cancelled_by_user_id": null,
      "cancel_reason": null
    }
  ],
  "payment_history": [
    {
      "id": "e5f60718-2930-4a4b-8c5d-6e7f80910a1b",
      "invoice_number": "INV-2026080100017",
      "amount_vnd": 299000,
      "status": "paid",
      "grant_type": "payment",
      "plan_code": "MONTHLY",
      "paid_at": "2026-08-01T03:14:22+00:00",
      "created_at": "2026-08-01T03:12:05+00:00"
    }
  ],
  "trial_used": true,
  "vt_account": {
    "id": "f6071829-3040-4b5c-8d6e-7f8091a2b3c4",
    "status": "active",
    "initial_cash_vnd": 1000000000,
    "cash_available_vnd": 742350000,
    "cash_reserved_vnd": 0,
    "cash_pending_vnd": 118600000,
    "activated_at": "2026-05-03T08:30:00+00:00",
    "frozen_at": null,
    "freeze_reason": null
  },
  "vt_recent_orders": [
    {
      "id": "07182930-4150-4c6d-8e7f-8091a2b3c4d5",
      "symbol": "FPT",
      "side": "buy",
      "status": "filled",
      "quantity": 1000,
      "price_vnd": 118600,
      "created_at": "2026-08-17T02:15:07.881000"
    },
    {
      "id": "18293041-5060-4d7e-8f80-91a2b3c4d5e6",
      "symbol": "VCB",
      "side": "sell",
      "status": "pending",
      "quantity": 500,
      "price_vnd": null,
      "created_at": "2026-08-14T07:41:19.203000"
    }
  ],
  "login_history": [
    {
      "id": "29304150-6070-4e8f-8091-a2b3c4d5e6f7",
      "user_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "email": "nguyen.van.an@iqx.vn",
      "success": true,
      "failure_reason": null,
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "login_at": "2026-08-17T02:11:43.512000+00:00"
    },
    {
      "id": "30415060-7080-4f90-81a2-b3c4d5e6f708",
      "user_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "email": "nguyen.van.an@iqx.vn",
      "success": false,
      "failure_reason": "Mật khẩu không đúng",
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "login_at": "2026-08-17T02:11:20.044000+00:00"
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `user_id` không có trong bảng `users` | `Không tìm thấy Người dùng` |
| 422 | — | `user_id` không phải UUID | `HTTPValidationError` |

**Fallback / suy giảm**

Từng khối suy giảm **độc lập**, không có khối nào làm cả response fail (trừ khi user không tồn tại → 404):

| Khối | Khi không có dữ liệu |
|---|---|
| `subscription` | `null` (kể cả khi có sub nhưng đã `expired`/`cancelled`, hoặc `current_period_end <= now`) |
| `subscription_history` | `[]` |
| `payment_history` | `[]` |
| `trial_used` | `false` |
| `vt_account` | `null` |
| `vt_recent_orders` | `[]` — **và luôn `[]` khi `vt_account` là `null`**, vì query lệnh chỉ chạy khi có account |
| `login_history` | `[]` |
| `plan` trong `SubscriptionBrief`/`plan_code` trong `PaymentOrderBrief` | `null` (dùng `OUTER JOIN`, plan bị xoá không làm mất dòng) |

Khẳng định bởi `tests/test_admin_users.py::test_360_basic_fields` — user mới, không có gì: tất cả các khối trả về đúng như bảng trên.

**curl**

~~~bash
curl -X GET \
  'https://api.iqx.vn/api/v1/admin/users/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/360' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5b6c7d8e-9f01-4a2b-8c3d-4e5f60718293'
~~~

**Ghi chú khi viết lại**

1. **Endpoint này KHÔNG ghi audit log** — không có `AuditCtx` trong signature. Admin xem toàn bộ PII + lịch sử giao dịch của một user mà không để lại dấu vết. Nếu muốn ghi (nên), đó là **bổ sung mới**, ghi vào changelog.
2. **Các khối KHÔNG có trong response** — đừng tự thêm: **không** có tiến độ Cấp 0–8 / gamification, **không** có alert rules, **không** có tiến độ bài học (lessons), **không** có watchlist, **không** có vị thế (positions) hay giao dịch đã khớp (trades) hay sổ tiền (ledger). Chi tiết VT sâu hơn nằm ở nhóm endpoint riêng `/admin/virtual-trading/...` — xem chương VT quản trị. Nếu frontend cần các khối đó, đó là feature mới, KHÔNG phải port.
3. **Cách chọn `subscription` hiện tại — thứ tự quan trọng.** Danh sách sub được sắp `current_period_start DESC`; duyệt từ đầu và lấy **cái ĐẦU TIÊN** thoả cả 3 điều kiện: `status == "active"` **AND** `current_period_end != null` **AND** `current_period_end > now()` (UTC). Không phải "sub mới nhất", không phải "sub có status active".
4. **Bẫy timezone naive.** Code gốc phải tự gắn `tzinfo=UTC` cho `current_period_end` khi nó naive trước khi so sánh với `now()`. Nếu viết lại bằng Postgres `timestamptz` thuần thì vấn đề tự hết — nhưng nếu migrate dữ liệu, phải xác định các timestamp naive cũ đang là UTC (đúng, vì code gốc dùng `datetime.now(UTC)` khi ghi).
5. **`trial_used` quét TOÀN BỘ `subscription_history`**, không chỉ sub hiện tại: `true` nếu **bất kỳ** sub nào (kể cả đã expired/cancelled) có `plan.code == "TRIAL_7D"`. Hằng số `TRIAL_PLAN_CODE = "TRIAL_7D"` xuất hiện ở **hai** file (`services/admin_users.py` và `services/admin_metrics.py`) — khi viết lại nên đưa vào một constant dùng chung.
6. **`vt_recent_orders[].price_vnd` map từ cột `limit_price_vnd`**, không phải giá khớp. Lệnh `market` có `limit_price_vnd = null` → field này `null`. Đừng nhầm là giá thực hiện.
7. **`subscription_history` KHÔNG bị giới hạn số dòng** (khác `payment_history` 20 / `vt_recent_orders` 10 / `login_history` 20). User lâu năm có thể trả về hàng chục dòng. Cân nhắc thêm `LIMIT` và ghi rõ.
8. `UserBriefForAdmin.phone_number` là cột `phone_number` — **khác** cột `phone_e164` mà CSV export dùng. Hai cột này tồn tại song song trong bảng `users`; giữ đúng mapping từng endpoint.

---

### POST /api/v1/admin/users/{user_id}/reset-password

> **Đặt lại mật khẩu người dùng** — sinh mật khẩu tạm 16 ký tự, ghi hash mới vào DB, đồng thời gửi email chứa link tự đặt lại mật khẩu.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) — **KHÔNG có giới hạn riêng** |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `users` |
| **Side-effect** | Ghi `users.hashed_password`; **gửi email** qua Resend (subject `Đặt lại mật khẩu IQX`); ghi 1 dòng `admin_audit_log` (`action="user.password_reset"`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | `string` | UUID hợp lệ | Id người dùng cần reset |

**Query params** — —

**Request body** — **không có body**. Endpoint không nhận trường nào (không có lý do/note, không có cờ "gửi email hay không").

**Response 200**

~~~ts
interface ResetPasswordResponse {
  /** Mật khẩu tạm 16 ký tự — CHỈ trả về lần này, không lưu ở đâu dạng plaintext. */
  temporary_password: string;
  /** Chuỗi cố định do server sinh; client không truyền vào. */
  warning: string;
}
~~~

~~~json
{
  "temporary_password": "kQ7m@Xz2Rb9%Tn4P",
  "warning": "Đã gửi liên kết đặt lại mật khẩu tới email người dùng. Mật khẩu tạm thời ở trên là phương án dự phòng — hãy chia sẻ an toàn."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `user_id` không tồn tại | `Không tìm thấy Người dùng` |
| 422 | — | `user_id` không phải UUID | `HTTPValidationError` |

**Fallback / suy giảm**

- **Gửi email là best-effort, KHÔNG chặn.** `EmailService.send()` trả `false` (không ném) khi `EMAIL_ENABLED=false`, khi thiếu `RESEND_API_KEY`, khi Resend trả ≥ 400, hoặc khi lỗi mạng/timeout (15s). Response vẫn **200** kèm `temporary_password`, chuỗi `warning` vẫn nói "Đã gửi…" **dù thực tế không gửi được**.
- Cách duy nhất biết email có đi hay không là đọc `note` của dòng audit: `admin reset; temp password issued; reset email sent` hoặc `… reset email skipped/failed`.
- Mật khẩu mới **đã được ghi vào DB bất kể email có gửi được hay không** — mật khẩu cũ của user mất ngay.

**curl**

~~~bash
curl -X POST \
  'https://api.iqx.vn/api/v1/admin/users/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/reset-password' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6c7d8e9f-0a1b-4c2d-8e3f-405162738495'
~~~

**Ghi chú khi viết lại**

1. **CẢ HAI — vừa sinh mật khẩu tạm, vừa gửi link reset.** Trả lời trực tiếp câu hỏi: endpoint làm **cả hai việc**. Thứ tự bắt buộc: (a) tìm user → 404 nếu không có; (b) sinh mật khẩu tạm; (c) `hashed_password = hash(temp)`; (d) `flush()`; (e) gửi email reset — **token reset được ký dựa trên hash MỚI**, nên link vẫn hợp lệ cho tới khi user tự đặt mật khẩu; (f) ghi audit. Nếu đảo (e) lên trước (c)/(d), token sẽ ký theo hash cũ và **link chết ngay** — đây là bẫy chính.
2. **BẢO MẬT — KHÔNG revoke refresh token.** Đường này **không** gọi `revoke_all_for_user`. Hệ quả: nếu tài khoản đang bị chiếm, kẻ tấn công vẫn giữ được session bằng refresh token cũ dù mật khẩu đã đổi. Đối chiếu: đường tự phục vụ `/auth/reset-password` **CÓ** revoke toàn bộ session (`app/services/auth.py:309`). Đây là **lỗ hổng thật của bản gốc**. Khi viết lại: **revoke toàn bộ refresh token của user đó trong cùng transaction**, và ghi rõ trong changelog là sửa lỗi bảo mật.
3. **Bảng chữ sinh mật khẩu — chính xác:** `string.ascii_letters + string.digits + "@#$%&*"` = 62 + 6 = **68 ký tự**, chọn 16 lần bằng CSPRNG (`secrets.choice`). Trong TypeScript dùng `crypto.randomInt`/`randomBytes` với rejection sampling — **không** dùng `Math.random()`. Không có ràng buộc "phải có ít nhất 1 chữ số/1 ký tự đặc biệt": về lý thuyết có thể sinh ra mật khẩu toàn chữ. Nếu policy mật khẩu của hệ thống yêu cầu độ phức tạp, mật khẩu tạm này **có thể không thoả** → user vẫn đăng nhập được (chỉ hash được so khớp) nhưng đừng thêm validate.
4. **`temporary_password` là plaintext trong response body.** Nó sẽ nằm trong log của reverse proxy nếu body được log, và trong DevTools của admin. Không được đưa vào dòng audit (bản gốc đúng: `note` chỉ ghi "temp password issued"). Khi viết lại nhớ **loại field này khỏi mọi response logging**.
5. **Không có rate limit riêng** → một admin bị chiếm quyền có thể reset mật khẩu hàng loạt user với 60 req/phút. Cân nhắc giới hạn riêng và ghi rõ là bổ sung.
6. `warning` là **giá trị mặc định của schema**, do server sinh, client không gửi lên. Giữ nguyên chuỗi tiếng Việt nguyên văn vì UI đang hiển thị trực tiếp.

---

### POST /api/v1/admin/users/{user_id}/resend-verification

> **Gửi lại email xác thực** — phát một link xác thực email mới cho người dùng.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) — **KHÔNG có giới hạn riêng** |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `users` (chỉ đọc `id`, `email`, `full_name`) |
| **Side-effect** | **Gửi email** qua Resend (subject `Xác thực địa chỉ email của bạn`); ghi 1 dòng `admin_audit_log` (`action="user.verify_resend"`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | `string` | UUID hợp lệ | Id người dùng cần gửi lại email |

**Query params** — —

**Request body** — không có body.

**Response 200** — **Status thật là `202 Accepted`**, không phải 200 (`status_code=202` trên decorator).

~~~ts
interface ResendVerificationResponse {
  /** Chuỗi cố định do server sinh. */
  message: string;
}
~~~

~~~json
{ "message": "Đã gửi lại email xác thực." }
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `user_id` không tồn tại | `Không tìm thấy Người dùng` |
| 422 | — | `user_id` không phải UUID | `HTTPValidationError` |

**Fallback / suy giảm**

- **Khi user ĐÃ verify (`is_email_verified = true`): endpoint vẫn gửi email và vẫn trả 202.** Không có kiểm tra nào, không có 409/400. Đây là hành vi gốc — đã kiểm chứng bằng đọc `AdminUserService.resend_verification()`: chỉ có một nhánh 404 duy nhất.
- Gửi email best-effort như endpoint #4: `false` khi `EMAIL_ENABLED=false` / thiếu API key / Resend ≥ 400 / lỗi mạng. Response vẫn **202** với đúng chuỗi `message` đó.
- Kết quả gửi chỉ thấy trong `note` của audit: `verification email sent` hoặc `verification email skipped/failed`.

**curl**

~~~bash
curl -X POST \
  'https://api.iqx.vn/api/v1/admin/users/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/resend-verification' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7d8e9f0a-1b2c-4d3e-8f40-516273849506'
~~~

**Ghi chú khi viết lại**

1. **Giữ đúng `202`, không đổi thành `200`.** Frontend có thể đang phân biệt. Khẳng định bởi `tests/test_admin_users.py::test_resend_verification_202`.
2. **Không có rate limit riêng và không có cooldown per-user.** Gọi 60 lần/phút cùng một `user_id` sẽ gửi 60 email → hộp thư user bị spam và domain gửi có nguy cơ bị đánh dấu. Đây là hành vi gốc. **Nên** bổ sung cooldown (ví dụ 1 email/5 phút/user) và ghi rõ là bổ sung mới.
3. **Nên (bổ sung) trả 409 khi `is_email_verified` đã là `true`** để tránh gửi email vô nghĩa — nhưng phải ghi vào changelog, vì bản gốc trả 202.
4. Link xác thực được dựng là `{EMAIL_LINK_BASE_URL || APP_PUBLIC_URL}/api/v1/auth/verify-email?token=<token>`; token ký từ `(user_id, email)`. Nếu `EMAIL_LINK_BASE_URL` chưa cấu hình trên môi trường mới, link sẽ trỏ về `APP_PUBLIC_URL` — kiểm tra env khi deploy.
5. Endpoint **không** ghi gì vào bảng `users` — không có cột "verification_sent_at". Nếu cần cooldown ở mục 2 thì phải thêm cột hoặc dùng Redis key.

---

### GET /api/v1/admin/users/{user_id}/login-history

> **Lịch sử đăng nhập của một người dùng** — danh sách mọi lần đăng nhập (thành công và thất bại) có phân trang, mới nhất trước.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `user_login_history` (1 COUNT + 1 SELECT) |
| **Side-effect** | không |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | `string` | UUID hợp lệ | Id người dùng |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang, 1-based |
| `page_size` | `number` | không | `50` | `1 <= x <= 200` | Số dòng mỗi trang |

**Request body** — —

**Response 200** — `PaginatedResponse<LoginHistoryRow>` (`LoginHistoryRow` đã định nghĩa ở endpoint #3).

~~~ts
type LoginHistoryPage = PaginatedResponse<LoginHistoryRow>;
~~~

~~~json
{
  "items": [
    {
      "id": "29304150-6070-4e8f-8091-a2b3c4d5e6f7",
      "user_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "email": "nguyen.van.an@iqx.vn",
      "success": true,
      "failure_reason": null,
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
      "login_at": "2026-08-17T02:11:43.512000+00:00"
    },
    {
      "id": "30415060-7080-4f90-81a2-b3c4d5e6f708",
      "user_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "email": "nguyen.van.an@iqx.vn",
      "success": false,
      "failure_reason": "Mật khẩu không đúng",
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
      "login_at": "2026-08-17T02:11:20.044000+00:00"
    }
  ],
  "total": 5,
  "page": 1,
  "page_size": 2,
  "total_pages": 3
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `user_id` không phải UUID; `page < 1`; `page_size < 1` hoặc `> 200` | `HTTPValidationError` |

**Fallback / suy giảm**

- **`user_id` KHÔNG tồn tại → 200 với `items: []`, `total: 0`, `total_pages: 0`. KHÔNG phải 404.** Service không kiểm tra sự tồn tại của user, chỉ lọc theo `user_id`. Khác hẳn endpoint #3/#4/#5.
- `page` vượt quá số trang → 200 với `items: []` nhưng `total` vẫn là tổng thật.
- `total = 0` → `total_pages = 0` (không phải 1). Công thức: `total > 0 ? ceil(total / page_size) : 0`.

**curl**

~~~bash
curl -X GET \
  'https://api.iqx.vn/api/v1/admin/users/9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f/login-history?page=1&page_size=50' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8e9f0a1b-2c3d-4e4f-8051-627384950617'
~~~

**Ghi chú khi viết lại**

1. **Sắp xếp: `login_at DESC`** (mới nhất trước). Không có tie-breaker → dòng cùng `login_at` có thể đổi chỗ giữa các trang. Nên thêm `, id DESC`.
2. **Bảng chứa cả lần đăng nhập THẤT BẠI** (`success = false`, `failure_reason` có nội dung tiếng Việt). Đừng lọc bỏ — chính các dòng thất bại mới hữu ích cho điều tra.
3. Lọc theo `user_id`, nên các lần thử với email không khớp user nào (`user_id = null` trong bảng) **không bao giờ xuất hiện** ở endpoint này. Muốn xem chúng phải truy vấn bảng trực tiếp — hiện **không có endpoint nào** cho việc đó.
4. Phân trang `LIMIT/OFFSET`. Bảng append-only nên với sort DESC, dòng mới chèn vào đầu sẽ **đẩy lệch** các trang sau. Chấp nhận được cho UI audit, nhưng nếu cần chính xác thì dùng keyset trên `(login_at, id)`.
5. `total_pages` được **endpoint tự tính** (`math.ceil` trong handler), không phải service. Giữ đúng nhánh `total == 0 → 0`.
6. `user_agent` bị cắt còn 500 ký tự khi ghi; `ip` còn 45 (đủ cho IPv6). Giữ nguyên độ dài cột.
7. **Không ghi audit** — admin xem lịch sử đăng nhập (PII: IP, thiết bị) mà không để lại dấu vết. Cân nhắc bổ sung.

---

## Nhóm 2 — Số liệu (`/admin/metrics`)

> **Đây là nhóm dễ ra số khác nhau nhất giữa bản Python và bản TypeScript.** Đọc kỹ định nghĩa từng con số; mỗi dòng dưới đây là một điều kiện WHERE cụ thể, không phải diễn giải.

### GET /api/v1/admin/metrics/overview

> **Ảnh chụp KPI nền tảng** — 15 con số về người dùng, premium, doanh thu và giao dịch ảo tại thời điểm gọi.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | **không** — mỗi request chạy ~11 truy vấn aggregate |
| **Nguồn dữ liệu** | DB — `users`, `premium_subscriptions`, `premium_plans`, `premium_payment_orders`, `virtual_trading_accounts`, `virtual_orders` |
| **Side-effect** | không |

**Path params** — —

**Query params** — **KHÔNG có.** Không thể chọn khoảng thời gian; các cửa sổ 7/30 ngày là cố định.

**Request body** — —

**Response 200**

~~~ts
interface PlanDistributionPoint {
  plan_code: string;
  plan_name: string;
  active_subscriptions: number;
  price_vnd: number;
}

interface MetricsOverview {
  // Người dùng
  total_users: number;
  active_users: number;
  new_users_today: number;
  new_users_last_7d: number;
  new_users_last_30d: number;
  // Premium
  active_subscribers: number;
  active_trial_count: number;
  active_paid_count: number;
  plan_distribution: PlanDistributionPoint[];
  // Doanh thu
  mrr_vnd: number;
  revenue_today_vnd: number;
  revenue_last_7d_vnd: number;
  revenue_last_30d_vnd: number;
  // Giao dịch ảo
  vt_active_accounts: number;
  vt_orders_today: number;
  // Hệ thống
  generated_at: string;   // ISO datetime, UTC — thời điểm bắt đầu tính
}
~~~

**ĐỊNH NGHĨA CHÍNH XÁC từng con số** (`now = thời điểm request, UTC`; `today_start = now` với `hour=minute=second=microsecond=0`, tức **00:00 UTC = 07:00 giờ VN**):

| Field | Bảng | Điều kiện WHERE chính xác |
|---|---|---|
| `total_users` | `users` | `status != 'deleted'` — **đếm cả `inactive` và `suspended`** |
| `active_users` | `users` | `status == 'active'` — chỉ mỗi điều kiện này; **KHÔNG liên quan tới lần đăng nhập gần nhất, KHÔNG phải MAU/DAU** |
| `new_users_today` | `users` | `created_at >= today_start` — **KHÔNG loại `deleted`** |
| `new_users_last_7d` | `users` | `created_at >= now - 7 ngày` — **cửa sổ trượt theo giờ-phút-giây, không phải 7 ngày lịch** |
| `new_users_last_30d` | `users` | `created_at >= now - 30 ngày` — cửa sổ trượt |
| `active_subscribers` | `premium_subscriptions` | `status == 'active'` **AND** `current_period_end > now` — đếm **dòng subscription**, không phải user riêng biệt |
| `active_trial_count` | `premium_subscriptions` ⋈ `premium_plans` | như trên **AND** `plans.code == 'TRIAL_7D'` (INNER JOIN → sub không có plan bị loại) |
| `active_paid_count` | *(tính)* | `active_subscribers - active_trial_count` — **phép trừ, không phải query riêng** |
| `plan_distribution[]` | `premium_subscriptions` ⋈ `premium_plans` (INNER) | `plans.code != 'TRIAL_7D'` **AND** `sub.status == 'active'` **AND** `sub.current_period_end > now`; GROUP BY `(code, name, price_vnd)`; **ORDER BY `price_vnd` tăng dần**. Gói có 0 sub active **KHÔNG xuất hiện** (INNER JOIN). Bỏ qua `plans.is_active`. |
| `mrr_vnd` | `premium_subscriptions` ⋈ `premium_plans` | Cùng WHERE với `plan_distribution`. Công thức: `SUM(plans.price_vnd * 30.0 / NULLIF(plans.duration_days, 0))`, `COALESCE(…, 0)`, rồi **`int()` — cắt bỏ phần thập phân, KHÔNG làm tròn**. Cơ sở là **giá niêm yết của gói**, không phải số tiền user thực trả. Gói `duration_days = 0` → `NULLIF` cho `NULL` → `SUM` bỏ qua dòng đó. |
| `revenue_today_vnd` | `premium_payment_orders` | `status == 'paid'` **AND** `paid_at >= today_start` **AND** `grant_type != 'admin_grant'` |
| `revenue_last_7d_vnd` | `premium_payment_orders` | như trên với `paid_at >= now - 7 ngày` |
| `revenue_last_30d_vnd` | `premium_payment_orders` | như trên với `paid_at >= now - 30 ngày` |
| `vt_active_accounts` | `virtual_trading_accounts` | `status == 'active'` |
| `vt_orders_today` | `virtual_orders` | `created_at >= today_start` — **đếm MỌI lệnh**, bất kể `status` (`pending`/`filled`/`cancelled`/`expired`/`rejected` đều tính) |

**Doanh thu tính theo đơn `paid` hay theo subscription?** → **Theo ĐƠN (`premium_payment_orders`)**, và mốc thời gian là **`paid_at`** (ngày thanh toán), **KHÔNG phải `created_at`** (ngày tạo đơn). Đơn có `grant_type = 'admin_grant'` bị loại vì không phải tiền thật. Còn `mrr_vnd` thì đi theo **subscription** + giá gói — hai chỉ số này **dùng hai nguồn khác nhau và sẽ không khớp nhau**; đó là chủ ý.

~~~json
{
  "total_users": 4812,
  "active_users": 4655,
  "new_users_today": 37,
  "new_users_last_7d": 264,
  "new_users_last_30d": 1103,
  "active_subscribers": 512,
  "active_trial_count": 88,
  "active_paid_count": 424,
  "plan_distribution": [
    { "plan_code": "MONTHLY", "plan_name": "Gói tháng", "active_subscriptions": 301, "price_vnd": 299000 },
    { "plan_code": "QUARTERLY", "plan_name": "Gói 3 tháng", "active_subscriptions": 82, "price_vnd": 799000 },
    { "plan_code": "ANNUAL", "plan_name": "Gói năm", "active_subscriptions": 41, "price_vnd": 2790000 }
  ],
  "mrr_vnd": 187106849,
  "revenue_today_vnd": 4186000,
  "revenue_last_7d_vnd": 41870000,
  "revenue_last_30d_vnd": 168920000,
  "vt_active_accounts": 3944,
  "vt_orders_today": 1276,
  "generated_at": "2026-08-17T09:41:12.884215+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

- **DB rỗng → 200 với tất cả số = 0** và `plan_distribution: []`. Mọi aggregate đều bọc `COALESCE(…, 0)`. Khẳng định bởi `tests/test_admin_metrics.py::test_overview_empty_database`.
- Không gọi provider ngoài nào → không có nhánh "provider lỗi".
- Không có nhánh "ngoài giờ giao dịch": `vt_orders_today` chỉ đơn giản là 0 vào ngày không có lệnh nào.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/metrics/overview' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9f0a1b2c-3d4e-4f50-8162-738495061728'
~~~

**Ghi chú khi viết lại**

1. **MÚI GIỜ — bẫy lớn nhất của chương.** `today_start` là **00:00 UTC**, tức **07:00 sáng giờ Việt Nam**. Vậy `new_users_today` / `revenue_today_vnd` / `vt_orders_today` **KHÔNG** phải "hôm nay theo giờ VN": chúng bỏ qua khoảng 00:00–07:00 ICT của hôm nay và tính thêm 17:00–24:00 ICT của **hôm qua**. Với sàn HOSE mở 09:00–15:00 ICT thì `vt_orders_today` may mắn vẫn khớp một phiên, nhưng doanh thu và user mới thì **lệch thật**. Khi viết lại: giữ nguyên UTC để số khớp bản cũ, **hoặc** đổi sang `Asia/Ho_Chi_Minh` và **ghi rõ vào changelog rằng các con số "today" sẽ đổi giá trị**. Đừng đổi âm thầm.
2. **`created_at` của `users` và `virtual_orders` là cột naive** — code gốc phải `.replace(tzinfo=None)` các mốc trước khi so sánh. Nếu chuyển sang `timestamptz` khi viết lại, kiểm tra lại toàn bộ so sánh này.
3. **`active_paid_count` là phép trừ, có thể lệch.** Sub `active` còn hiệu lực nhưng `current_plan_id = NULL` (hoặc trỏ plan đã xoá) sẽ được đếm trong `active_subscribers` nhưng **không** trong `active_trial_count` (INNER JOIN) và **không** trong `plan_distribution` → nó rơi hết vào `active_paid_count`. Tổng `sum(plan_distribution[].active_subscriptions)` do đó **có thể nhỏ hơn** `active_paid_count`. Đừng "sửa" để chúng khớp; giữ đúng và tài liệu hoá.
4. **`plan_distribution` trong overview KHÁC endpoint #9.** Ở đây: INNER JOIN, **loại** `TRIAL_7D`, **bỏ qua** `plans.is_active`, sort theo `price_vnd`. Ở #9: OUTER JOIN, **giữ** trial, **chỉ** `is_active = true`, sort theo `(sort_order, price_vnd)`. Hai endpoint sẽ trả **khác nhau**; đó là chủ ý, không phải bug.
5. **`mrr_vnd` cắt (`int()`) chứ không làm tròn.** `299000 * 30 / 30 = 299000` chuẩn, nhưng `2790000 * 30 / 365 = 229315.068…` → cộng dồn rồi cắt cuối. Trong TypeScript: tính tổng bằng `numeric`/float ở SQL rồi `Math.trunc` **một lần ở cuối**, đừng làm tròn từng dòng — số sẽ lệch.
6. **Đơn `refunded` KHÔNG bị trừ khỏi doanh thu.** Bộ lọc chỉ là `status == 'paid'`; đơn đã hoàn tiền chuyển sang `status = 'refunded'` nên tự động rơi khỏi tổng — nhưng nếu nó được hoàn **sau** kỳ báo cáo thì số của các kỳ trước đã chốt sẽ **thay đổi hồi tố** khi gọi lại. Nêu rõ với người dùng dashboard.
7. **11 truy vấn tuần tự, không cache.** Với bảng lớn, đây là endpoint đắt. `active_users`/`total_users` là full COUNT trên `users`. Cân nhắc cache Redis TTL ngắn (60–300s) và ghi rõ là bổ sung — nhưng nhớ `generated_at` phải phản ánh thời điểm **tính**, không phải thời điểm trả cache.
8. `generated_at = now` được lấy **một lần ở đầu** và dùng cho **tất cả** các mốc so sánh — đảm bảo các con số nhất quán với nhau. Đừng gọi `new Date()` nhiều lần.

---

### GET /api/v1/admin/metrics/revenue

> **Doanh thu theo ngày** — chuỗi thời gian liền mạch (không khuyết ngày) từ cũ đến mới để vẽ biểu đồ.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `premium_payment_orders` (1 truy vấn GROUP BY) |
| **Side-effect** | không |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `days` | `number` | không | `30` | `1 <= x <= 365` | Số ngày tính từ hôm nay (mô tả gốc: `Số ngày tính từ hôm nay`) |

**Request body** — —

**Response 200** — **mảng phẳng, KHÔNG bọc trong object phân trang.**

~~~ts
interface DailyRevenuePoint {
  date: string;          // "YYYY-MM-DD"
  paid_orders: number;   // số đơn PAID trong ngày đó
  revenue_vnd: number;   // tổng amount_vnd, đã loại admin_grant
}

type DailyRevenueResponse = DailyRevenuePoint[];
~~~

Định nghĩa chính xác:

- Mốc bắt đầu: `start = (now - days ngày)` rồi **cắt về 00:00 UTC**.
- Truy vấn: `status == 'paid'` **AND** `paid_at >= start` **AND** `grant_type != 'admin_grant'`, `GROUP BY DATE(paid_at)`, `ORDER BY DATE(paid_at)`.
- `paid_orders` = `COUNT(id)`; `revenue_vnd` = `COALESCE(SUM(amount_vnd), 0)`.
- Chuỗi trả về được **dựng lại** bằng vòng lặp `i = 0..days-1`: `date = (start + i ngày).date()`, lấy giá trị từ map theo ngày, thiếu thì `(0, 0)`. → **độ dài response LUÔN đúng bằng `days`**, kể cả DB rỗng (khẳng định bởi `tests/test_admin_metrics.py::test_daily_revenue_series_length` với `days=7` → `len == 7`).

~~~json
[
  { "date": "2026-08-11", "paid_orders": 0,  "revenue_vnd": 0 },
  { "date": "2026-08-12", "paid_orders": 4,  "revenue_vnd": 1196000 },
  { "date": "2026-08-13", "paid_orders": 11, "revenue_vnd": 4287000 },
  { "date": "2026-08-14", "paid_orders": 7,  "revenue_vnd": 2093000 },
  { "date": "2026-08-15", "paid_orders": 2,  "revenue_vnd": 598000 },
  { "date": "2026-08-16", "paid_orders": 0,  "revenue_vnd": 0 },
  { "date": "2026-08-17", "paid_orders": 14, "revenue_vnd": 4186000 }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `days < 1` hoặc `days > 365` hoặc không phải số nguyên | `HTTPValidationError` |

**Fallback / suy giảm**

- Không có đơn nào → 200 với `days` phần tử, tất cả `paid_orders = 0`, `revenue_vnd = 0`. **Không bao giờ trả `[]`** (trừ trường hợp `days` không hợp lệ → 422).
- Không có provider ngoài, không có nhánh ngoài giờ.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/metrics/revenue?days=7' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: a0b1c2d3-4e5f-4061-8273-849506172839'
~~~

**Ghi chú khi viết lại**

1. **MÚI GIỜ — `DATE(paid_at)` gom theo ngày UTC.** Một đơn thanh toán lúc **05:30 sáng giờ VN ngày 17/08** có `paid_at = 2026-08-16T22:30:00Z` → bị gom vào bucket **`2026-08-16`**. Với thanh toán qua SePay (hoạt động cả sáng sớm), lệch này là **thật và thường xuyên**. Muốn gom theo giờ VN thì dùng `DATE(paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')` — **nhưng phải ghi vào changelog rằng biểu đồ sẽ đổi số**.
2. **Off-by-one ở hai đầu chuỗi.** `start` là `now - days` rồi cắt về 00:00, và vòng lặp chạy `days` bước → phần tử cuối là `start.date() + (days-1)` = **hôm nay** (theo UTC). Nhưng bộ lọc SQL chỉ có `paid_at >= start`, **không có chặn trên** → các đơn thanh toán *sau* thời điểm cuối chuỗi vẫn được lấy về; chúng không rơi vào bucket nào nên **bị âm thầm bỏ**. Trong thực tế không xảy ra (không có `paid_at` ở tương lai), nhưng nếu dữ liệu có timestamp lệch thì tổng chuỗi sẽ **nhỏ hơn** tổng SQL. Khi viết lại nên thêm chặn trên rõ ràng.
3. **Tổng chuỗi `days=7` KHÔNG bằng `revenue_last_7d_vnd` ở endpoint #7.** #7 dùng cửa sổ trượt `now - 7 ngày` (tính cả giờ-phút), #8 cắt về 00:00 UTC rồi lấy 7 bucket ngày. Hai số **luôn lệch**. Đừng "sửa" cho khớp; nếu dashboard cần khớp thì phải chọn một định nghĩa duy nhất và ghi rõ.
4. `DATE()` trên Postgres trả `date`; trên SQLite (dùng trong test) trả chuỗi `"YYYY-MM-DD"`. Map lookup ở Python vì thế có thể **miss** trên một trong hai backend. Khi viết lại bằng TypeScript, **chuẩn hoá khoá map về chuỗi `YYYY-MM-DD`** trước khi tra, đừng dùng `Date` object làm khoá.
5. Response là **array trần**, không phải `{items: [...]}`. Frontend đang phụ thuộc hình dạng này.
6. Giống #7: cùng bộ lọc `status='paid'` + loại `grant_type='admin_grant'`. Đơn `pending`/`failed`/`cancelled`/`refunded` không tính.

---

### GET /api/v1/admin/metrics/plan-distribution

> **Phân bố gói Premium** — mọi gói đang bật kèm số subscription đang hoạt động, dùng cho biểu đồ tròn/cột.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `premium_plans` LEFT OUTER JOIN `premium_subscriptions` (1 truy vấn) |
| **Side-effect** | không |

**Path params** — —

**Query params** — **KHÔNG có.**

**Request body** — —

**Response 200** — mảng phẳng `PlanDistributionPoint[]` (interface đã định nghĩa ở #7).

~~~ts
type PlanDistributionResponse = PlanDistributionPoint[];
~~~

Định nghĩa chính xác — **khác endpoint #7 ở 4 điểm**:

| Khía cạnh | Endpoint này (#9) | Trong `overview` (#7) |
|---|---|---|
| Kiểu JOIN | **LEFT OUTER** → gói có 0 sub vẫn xuất hiện với `active_subscriptions: 0` | INNER → gói 0 sub bị ẩn |
| Gói `TRIAL_7D` | **CÓ** trong kết quả | bị loại |
| Lọc `plans.is_active` | **`is_active = true`** (chỉ gói đang bật) | không lọc |
| Sắp xếp | `ORDER BY plans.sort_order, plans.price_vnd` | `ORDER BY plans.price_vnd` |

Điều kiện đếm nằm **trong ON của OUTER JOIN** (không phải WHERE): `sub.current_plan_id == plan.id` **AND** `sub.status == 'active'` **AND** `sub.current_period_end > now` (UTC). `active_subscriptions = COUNT(sub.id)` → 0 khi không match (`COUNT` bỏ qua NULL).

~~~json
[
  { "plan_code": "TRIAL_7D",  "plan_name": "Dùng thử 7 ngày", "active_subscriptions": 88,  "price_vnd": 0 },
  { "plan_code": "MONTHLY",   "plan_name": "Gói tháng",       "active_subscriptions": 301, "price_vnd": 299000 },
  { "plan_code": "QUARTERLY", "plan_name": "Gói 3 tháng",     "active_subscriptions": 82,  "price_vnd": 799000 },
  { "plan_code": "ANNUAL",    "plan_name": "Gói năm",         "active_subscriptions": 41,  "price_vnd": 2790000 },
  { "plan_code": "LIFETIME",  "plan_name": "Gói trọn đời",    "active_subscriptions": 0,   "price_vnd": 9900000 }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

- Không có gói nào `is_active = true` → 200 với `[]` (mảng rỗng).
- Có gói nhưng chưa ai mua → 200 với đầy đủ dòng, `active_subscriptions: 0` cho mỗi dòng.
- Không có provider ngoài.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/metrics/plan-distribution' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b1c2d3e4-5f60-4172-8394-05061728394a'
~~~

**Ghi chú khi viết lại**

1. **Điều kiện `status`/`period_end` PHẢI nằm trong `ON`, không phải `WHERE`.** Nếu chuyển xuống `WHERE`, LEFT JOIN thoái hoá thành INNER và các gói có 0 sub active **biến mất** khỏi kết quả — đúng cái mà endpoint này cố ý giữ. Đây là bẫy kinh điển; trong TypeORM/Prisma phải viết điều kiện vào phần `on`/`joinAndSelect` với tham số, không vào `where`.
2. `GROUP BY` bao gồm cả `plans.sort_order` (dù không nằm trong SELECT) vì nó được dùng ở `ORDER BY` — Postgres yêu cầu điều này. Query builder nào bỏ sót sẽ báo lỗi SQL.
3. **Đừng dùng endpoint này thay cho `overview.plan_distribution`** (và ngược lại) — bảng so sánh ở trên cho thấy 4 khác biệt. Frontend cần biết mình đang xem con số nào.
4. Không đếm distinct user: nếu một user (bằng cách nào đó) có 2 sub active cùng gói, nó được tính 2. `premium_subscriptions` **không** có unique constraint trên `user_id` theo hiểu biết từ các file đã đọc — **CHƯA XÁC ĐỊNH, xem `app/models/premium.py`** nếu cần chắc.
5. `now` lấy một lần đầu request. `price_vnd` là giá niêm yết hiện tại của gói, **không** phải giá user đã trả.

---

## Nhóm 3 — Hệ thống (`/admin/system`)

### GET /api/v1/admin/system/status

> **Trạng thái hệ thống** — version, môi trường, tình trạng scheduler + danh sách job, số dòng các bảng lõi, và số liệu IPN.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (5 COUNT + 2 truy vấn IPN) + **scheduler in-process** (APScheduler singleton) + settings |
| **Side-effect** | không |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface JobInfo {
  id: string;                  // job_id — xem bảng ĐẦY ĐỦ ở endpoint #11
  name: string;                // mô tả người-đọc-được, tiếng Anh trong source gốc
  next_run_at: string | null;  // ISO datetime lần chạy kế tiếp; null nếu job đang bị pause
  trigger: string;             // biểu diễn chuỗi của trigger APScheduler
}

interface SystemStatus {
  version: string;                          // settings.APP_VERSION (default "0.1.0")
  environment: string;                      // settings.APP_ENV ("development"|"production"|...)
  scheduler_running: boolean;
  jobs: JobInfo[];
  db_stats: Record<string, number>;         // 5 khoá cố định, xem bảng dưới
  last_ipn_received_at: string | null;
  last_ipn_processed_count_24h: number;
  generated_at: string;                     // ISO datetime UTC
}
~~~

**Thành phần được kiểm tra — chính xác những gì có và những gì KHÔNG:**

| Thành phần | Có kiểm tra? | Cách kiểm |
|---|---|---|
| **Postgres** | **Ngầm** — 7 truy vấn chạy được nghĩa là DB sống. Không có field `database: "ok"` nào. DB chết → request ném exception → **500**, không phải 503. |
| **Redis** | **KHÔNG.** Không có field nào về Redis. (Endpoint `/health` công khai mới có `redis` — xem chương Health.) |
| **Scheduler** | `scheduler_running` = `_scheduler != null && _scheduler.running` |
| **Danh sách job** | `jobs` từ `list_jobs()` — đọc từ instance APScheduler trong **process hiện tại** |
| **Provider ngoài** (VCI/DNSE/Yahoo/DeepSeek/Resend/SePay) | **KHÔNG kiểm tra cái nào.** Endpoint này **không** gọi HTTP ra ngoài. |
| **IPN (SePay)** | `last_ipn_received_at` + `last_ipn_processed_count_24h` |

`db_stats` — **đúng 5 khoá, tên chính xác** (COUNT(*) toàn bảng, **không có điều kiện lọc nào**, kể cả user đã `deleted`):

| Khoá | Bảng |
|---|---|
| `users` | `users` |
| `subscriptions` | `premium_subscriptions` |
| `payment_orders` | `premium_payment_orders` |
| `ipn_logs` | `sepay_ipn_logs` |
| `audit_log` | `admin_audit_log` |

- `last_ipn_received_at`: `SELECT received_at FROM sepay_ipn_logs ORDER BY received_at DESC LIMIT 1` → `null` nếu bảng rỗng.
- `last_ipn_processed_count_24h`: `COUNT(*)` với `received_at >= now - 24 giờ` **AND** `result_status == 'processed'` — cửa sổ trượt 24 giờ, không phải "hôm nay".

~~~json
{
  "version": "0.1.0",
  "environment": "production",
  "scheduler_running": true,
  "jobs": [
    {
      "id": "expiry_sweep",
      "name": "Expire subscriptions whose period_end passed",
      "next_run_at": "2026-08-17T10:00:00+00:00",
      "trigger": "interval[1:00:00]"
    },
    {
      "id": "ipn_reconcile_scan",
      "name": "Scan stuck PENDING payment orders against IPN logs",
      "next_run_at": "2026-08-17T12:00:00+00:00",
      "trigger": "interval[6:00:00]"
    },
    {
      "id": "market_analysis_daily",
      "name": "Generate daily VN-Index AI analysis (16:30 ICT, EOD)",
      "next_run_at": "2026-08-17T09:30:00+00:00",
      "trigger": "cron[day_of_week='mon-fri', hour='16', minute='30']"
    }
  ],
  "db_stats": {
    "users": 4812,
    "subscriptions": 1607,
    "payment_orders": 2394,
    "ipn_logs": 2411,
    "audit_log": 18043
  },
  "last_ipn_received_at": "2026-08-17T09:12:44.301000+00:00",
  "last_ipn_processed_count_24h": 14,
  "generated_at": "2026-08-17T09:41:12.884215+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 500 | — | DB không truy vấn được | Body do handler exception mặc định sinh — **không** phải `ErrorResponse` có `code` |

**Fallback / suy giảm**

- **KHÔNG BAO GIỜ trả 503.** Endpoint không có nhánh nào ném `ServiceUnavailableError`. Nếu thành phần "chết", biểu hiện là: DB chết → **500**; scheduler tắt → **200** với `scheduler_running: false` và `jobs: []`.
- `JOBS_ENABLED=false` (hoặc scheduler chưa start) → `list_jobs()` trả `[]` **và** `scheduler_running: false`. Đây là trạng thái hợp lệ, 200.
- Bảng `sepay_ipn_logs` rỗng → `last_ipn_received_at: null`, `last_ipn_processed_count_24h: 0`.
- Danh sách `jobs` **phụ thuộc feature flag**: các job market-analysis / midday / premarket / intl / alert chỉ xuất hiện khi flag tương ứng bật (xem #11). Nên `jobs` trên staging và production **khác nhau** một cách hợp lệ.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/system/status' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c2d3e4f5-6071-4283-8495-061728394a5b'
~~~

**Ghi chú khi viết lại**

1. **`jobs` và `scheduler_running` là trạng thái CỦA PROCESS HIỆN TẠI, không phải của cluster.** Scheduler là singleton mức process với giả định `workers=1`. Nếu chạy nhiều instance/replica, mỗi instance trả danh sách riêng và request sẽ hit instance bất kỳ → **kết quả không xác định**. Cùng với đó, nhiều replica đều bật scheduler sẽ **chạy job trùng** (comment trong `services/jobs/__init__.py` nói rõ: cần Postgres advisory lock nếu scale). Trong NestJS: nếu dùng `@nestjs/schedule` thì bài toán y hệt — dùng advisory lock **`pg_advisory_xact_lock`** (không phải session-level, để tránh leak qua connection pool).
2. **5 COUNT(*) không điều kiện là đắt trên bảng lớn.** `admin_audit_log` và `sepay_ipn_logs` chỉ tăng. Cân nhắc dùng `pg_class.reltuples` (xấp xỉ) hoặc cache, và ghi rõ là thay đổi có chủ ý.
3. **Không kiểm Redis, không kiểm provider.** Nếu dashboard cần, đó là **feature mới** — đừng bịa field. Field `redis` chỉ tồn tại ở `HealthResponse` của endpoint health.
4. `JobInfo.trigger` là chuỗi `str(j.trigger)` của APScheduler (ví dụ `interval[1:00:00]`, `cron[day_of_week='mon-fri', hour='16', minute='30']`). Không có schema; **chỉ để hiển thị**, đừng parse. Khi viết lại bằng thư viện scheduler khác, chuỗi này sẽ khác — ghi vào changelog.
5. `next_run_at` do APScheduler tính theo timezone của scheduler (`UTC` cho scheduler gốc, nhưng các `CronTrigger` khai báo `timezone="Asia/Ho_Chi_Minh"`). Chuỗi ISO trả về vì thế có thể mang offset `+00:00` hoặc `+07:00` tuỳ job. Đừng giả định một offset duy nhất.
6. `version` và `environment` lấy từ settings (`APP_VERSION` default `"0.1.0"`, `APP_ENV` default `"development"`) — là **chuỗi tự do**, không phải enum. Đừng khai báo union literal.

---

### POST /api/v1/admin/system/jobs/{job_id}/run

> **Chạy scheduled job thủ công** — kích hoạt ngay một job nền, chờ nó xong, và trả về kết quả.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | Tính toán — thực thi hàm job trên **session DB của request** |
| **Side-effect** | **Tuỳ job** — job sửa dữ liệu thật (hết hạn subscription, hạ role premium→user, đối soát/`FAILED` đơn thanh toán). Ngoài ra ghi 1 dòng `admin_audit_log` (`action="system.job_run"`), và bản thân job cũng ghi thêm dòng audit riêng của nó. |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `job_id` | `string` | Phải thuộc **đúng 2 giá trị** trong `job_map` — xem bảng dưới | Id job cần chạy |

**Query params** — —

**Request body** — không có body.

**DANH SÁCH ĐẦY ĐỦ `job_id` — đây là chỗ dễ hiểu sai nhất:** hệ thống có **hai** danh sách job khác nhau.

**(A) `job_id` mà endpoint này CHẤP NHẬN — chỉ 2, hard-code trong `job_map`:**

| `job_id` | Hàm | Trả về |
|---|---|---|
| `expiry_sweep` | `run_expiry_sweep(session=db)` | `{ expired_count, downgraded_count, ran_at }` |
| `ipn_reconcile_scan` | `run_ipn_reconcile_scan(session=db)` | `{ attempted, reconciled, failed_old }` |

**(B) `job_id` mà scheduler ĐĂNG KÝ (và hiện ra trong `jobs[]` của #10) — 10 job, phần lớn phụ thuộc feature flag.** Các job này **KHÔNG chạy được** qua endpoint này (sẽ nhận 404):

| `job_id` | Trigger | Điều kiện bật (settings) |
|---|---|---|
| `expiry_sweep` | interval 1 giờ | luôn (khi `JOBS_ENABLED != false`) |
| `ipn_reconcile_scan` | interval 6 giờ | luôn |
| `alert_scan` | interval `ALERT_SCAN_INTERVAL_MINUTES` (default 10, tối thiểu 1) | `ALERTS_ENABLED` |
| `market_analysis_daily` | cron mon–fri, `MARKET_ANALYSIS_CRON_HOUR/MINUTE` (default 16:30 ICT) | `MARKET_ANALYSIS_ENABLED` |
| `market_analysis_daily_retry` | cron mon–fri, `MARKET_ANALYSIS_RETRY_HOUR/MINUTE` (default 17:00 ICT) | `MARKET_ANALYSIS_ENABLED` |
| `market_analysis_midday` | cron mon–fri, `MIDDAY_ANALYSIS_CRON_HOUR/MINUTE` (default 11:30 ICT) | `MIDDAY_ANALYSIS_ENABLED` |
| `market_analysis_premarket` | cron mon–fri, `PREMARKET_ANALYSIS_CRON_HOUR/MINUTE` (default 07:15 ICT) | `PREMARKET_ANALYSIS_ENABLED` |
| `intl_snapshot_wave1` | cron mon–fri **06:00 ICT** (cứng) | `INTL_DATA_ENABLED` |
| `intl_snapshot_wave2` | cron mon–fri **07:05 ICT** (cứng) | `INTL_DATA_ENABLED` |
| `intl_snapshot_wave3` | cron mon–fri **08:30 ICT** (cứng) | `INTL_DATA_ENABLED` |

Toàn bộ job trong (B) đăng ký với `max_instances=1, coalesce=True, replace_existing=True`. Scheduler tạo với `timezone="UTC"`; các `CronTrigger` khai báo riêng `timezone="Asia/Ho_Chi_Minh"`.

**Response 200**

~~~ts
interface RunJobResponse {
  job_id: string;
  /** Hình dạng PHỤ THUỘC job — không có schema chung. */
  result: Record<string, unknown>;
  ran_at: string;   // ISO datetime UTC, lấy SAU khi job xong
}

/** Hình dạng result cụ thể của 2 job hợp lệ: */
interface ExpirySweepResult {
  expired_count: number;      // số subscription bị chuyển sang expired
  downgraded_count: number;   // số user bị hạ premium → user
  ran_at: string;             // ISO datetime — LẶP LẠI bên trong result
}
interface IpnReconcileResult {
  attempted: number;   // số đơn PENDING được xét
  reconciled: number;  // số đơn khớp IPN và xử lý lại thành công
  failed_old: number;  // số đơn PENDING quá cũ bị đánh FAILED
}
~~~

~~~json
{
  "job_id": "expiry_sweep",
  "result": {
    "expired_count": 12,
    "downgraded_count": 9,
    "ran_at": "2026-08-17T09:41:13.002914+00:00"
  },
  "ran_at": "2026-08-17T09:41:13.118440+00:00"
}
~~~

~~~json
{
  "job_id": "ipn_reconcile_scan",
  "result": { "attempted": 6, "reconciled": 4, "failed_old": 1 },
  "ran_at": "2026-08-17T09:43:01.774219+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `job_id` không thuộc 2 giá trị trong `job_map` — **kể cả khi nó là job hợp lệ đang chạy trong scheduler**, ví dụ `alert_scan` hay `market_analysis_daily` | `Job 'alert_scan' not found` — **tiếng Anh trong source gốc**, format: `Job '{job_id}' not found` |
| 500 | — | Job ném exception khi thực thi | Body handler mặc định; toàn bộ transaction bị rollback |

**Fallback / suy giảm**

- **Đồng bộ, KHÔNG phải nền.** Request **chờ job chạy xong** rồi mới trả về. Không có `202`, không có job-id để poll. Job chậm → request có nguy cơ timeout ở reverse proxy trong khi job vẫn tiếp tục chạy phía server.
- **KHÔNG có chống chạy trùng.** Không lock, không kiểm tra "job đang chạy". Gọi endpoint 5 lần song song → 5 lần thực thi đồng thời; và nếu scheduler cũng vừa tick thì có thêm một lần nữa. Cờ `max_instances=1` chỉ áp cho **lịch của scheduler**, không áp cho đường HTTP này (endpoint gọi hàm job trực tiếp, **không** đi qua scheduler).
- Job được truyền `session=db` — **session của request** — nên nó dùng chung transaction context. Nếu job thất bại giữa đường, cả thay đổi của job **và** dòng audit `system.job_run` cùng rollback.
- `scheduler_running = false` (`JOBS_ENABLED=false`) **KHÔNG chặn** endpoint này: nó không đi qua scheduler, vẫn chạy bình thường. Đây là tính năng có ích (ops disable scheduler nhưng vẫn chạy tay được).

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/admin/system/jobs/expiry_sweep/run' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: d3e4f560-7182-4394-8506-1728394a5b6c'
~~~

**Ghi chú khi viết lại**

1. **Hai danh sách job PHẢI không lệch nhau.** Bản gốc có `job_map` hard-code 2 phần tử trong handler, tách rời khỏi `startup()` đăng ký 10 job — nên UI hiển thị 10 job (từ #10) mà bấm "Chạy" 8 trong số đó thì nhận **404**. Khi viết lại: **một registry duy nhất** `{ job_id → { name, trigger, handler, enabledWhen } }` cho cả liệt kê và chạy tay; hoặc chí ít trả về cờ `runnable: boolean` trong `JobInfo` — ghi rõ là bổ sung.
2. **CHỐNG CHẠY TRÙNG là bắt buộc phải thêm.** Cả hai job đều mutate dữ liệu tiền/quyền. Chạy song song `expiry_sweep` có thể hạ role hai lần (idempotent, ít hại), nhưng `ipn_reconcile_scan` replay IPN song song thì rủi ro **cấp premium/ghi nhận thanh toán hai lần**. Dùng `pg_advisory_xact_lock(hashtext('job:' || job_id))` — **transaction-scoped**, tự nhả khi commit/rollback, không leak qua connection pool.
3. **Ghi audit: đúng một dòng, SAU khi job xong.** `action="system.job_run"`, `target_entity="job"`, `target_id=job_id`, `payload_after = result` (nguyên object), `note = "Manual trigger of {job_id}"`. Nếu job ném exception thì **không có dòng audit nào** (rollback) → mất dấu vết lần chạy thất bại. Cân nhắc ghi audit lần thất bại ở transaction riêng, và ghi vào changelog.
4. **Bản thân job cũng tự ghi audit** với `admin_user_id = NULL` (`system.expiry_sweep` / `system.ipn_reconcile_scan`) **và tự `commit()`**. Vậy một lần bấm chạy tay sinh **2 dòng audit**: một dòng system (`admin_user_id = NULL`) + một dòng `system.job_run` (có `admin_user_id`). `commit()` bên trong job cũng có nghĩa là nó **cắt** transaction của request giữa đường — trong NestJS/TypeORM cần thiết kế lại rõ ràng: hoặc job tự quản transaction riêng, hoặc bỏ commit nội bộ và để request commit.
5. **`ran_at` xuất hiện hai lần với hai giá trị khác nhau**: `result.ran_at` là lúc job **bắt đầu** (chỉ có ở `expiry_sweep`), `ran_at` ở cấp ngoài là lúc build response, **sau** khi job xong. Đừng hợp nhất.
6. `expiry_sweep` **không bao giờ hạ role của `admin`** (`WHERE role == 'premium'`). Giữ nguyên guard này — bỏ đi là mất quyền admin.
7. `job_id` là `string` tự do trong path (không phải enum trong OpenAPI). Trong NestJS: validate bằng `ParseEnumPipe` hoặc kiểm tra registry rồi ném `NotFoundException` với đúng format detail.
8. Kết quả của các job **không** đi qua bất kỳ schema Pydantic nào — `result: dict` là raw. Nếu job đổi khoá trả về, response đổi theo mà OpenAPI không đổi. Cân nhắc khai báo union type cho `result` khi viết lại.

---

## Nhóm 4 — Audit (`/admin/audit`)

### GET /api/v1/admin/audit

> **Danh sách audit log** — trình xem toàn bộ dấu vết hành động quản trị, có bộ lọc theo admin / action / entity / khoảng ngày và phân trang.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `admin_audit_log` (1 COUNT + 1 SELECT) + 1 truy vấn phụ vào `users` để lấy email admin |
| **Side-effect** | không |

**Path params** — —

> Lưu ý path: route được khai báo là `@router.get("")` với prefix `/admin/audit`, nên path đúng là **`/api/v1/admin/audit` — KHÔNG có dấu `/` cuối**. Gọi `/api/v1/admin/audit/` có thể bị redirect 307 hoặc 404 tuỳ cấu hình. Trong NestJS dùng `@Get()` trên controller có `@Controller('admin/audit')`.

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang, 1-based |
| `page_size` | `number` | không | `50` | `1 <= x <= 200` | Số dòng mỗi trang |
| `admin_user_id` | `string` (uuid) | không | `null` | UUID hợp lệ | Lọc đúng bằng `admin_user_id`. **Không có cách nào lọc riêng các dòng hệ thống (`admin_user_id IS NULL`)** |
| `action_prefix` | `string` | không | `null` | — | `action LIKE '{prefix}%'` — **tiền tố, không phải khớp đúng**; ký tự `%`/`_` trong input **không được escape** (xem ghi chú) |
| `target_entity` | `string` | không | `null` | — | Khớp **đúng** (`==`), ví dụ `user`, `job`, `plan` |
| `target_id` | `string` | không | `null` | — | Khớp **đúng** (`==`), chuỗi đã stringify |
| `date_from` | `string` (date-time) | không | `null` | — | `created_at >= date_from` (**bao gồm mốc**) |
| `date_to` | `string` (date-time) | không | `null` | — | `created_at < date_to` (**KHÔNG bao gồm mốc**) |

Các filter kết hợp bằng **AND**. Không truyền filter nào → không có WHERE.

**Request body** — —

**Response 200** — `PaginatedResponse<AdminAuditLogResponse>`

~~~ts
interface AdminAuditLogResponse {
  id: string;
  admin_user_id: string | null;   // null = hành động hệ thống (job)
  admin_email: string | null;     // KHÔNG lưu trong bảng — join thêm ở tầng endpoint
  action: string;                 // xem bảng tra ĐẦY ĐỦ ở "## Nghiệp vụ nền" §4
  target_entity: string | null;
  target_id: string | null;
  payload_before: Record<string, unknown> | null;  // chỉ các khoá đã đổi
  payload_after: Record<string, unknown> | null;
  note: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;             // ISO datetime có offset (timestamptz)
}

type AuditLogPage = PaginatedResponse<AdminAuditLogResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "e4f56071-8293-4405-8617-28394a5b6c7d",
      "admin_user_id": "b7c8d9e0-1f2a-4b3c-8d4e-5f60718293a4",
      "admin_email": "le.minh.hoang@iqx.vn",
      "action": "user.bulk_update",
      "target_entity": "user",
      "target_id": "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
      "payload_before": { "role": "user" },
      "payload_after": { "role": "premium" },
      "note": "set_role",
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "request_id": "7a1b2c3d-4e5f-4061-8273-849506a7b8c9",
      "created_at": "2026-08-17T09:38:52.117000+00:00"
    },
    {
      "id": "f5607182-9304-4516-8728-394a5b6c7d8e",
      "admin_user_id": "b7c8d9e0-1f2a-4b3c-8d4e-5f60718293a4",
      "admin_email": "le.minh.hoang@iqx.vn",
      "action": "user.export",
      "target_entity": "user",
      "target_id": null,
      "payload_before": null,
      "payload_after": {
        "row_count": 4655,
        "filters": {
          "role": "premium",
          "status": "active",
          "search": null,
          "last_login_from": "2026-08-01T00:00:00Z",
          "last_login_to": null
        }
      },
      "note": null,
      "ip": "113.161.74.22",
      "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "request_id": "4d9f1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
      "created_at": "2026-08-17T09:22:04.905000+00:00"
    },
    {
      "id": "60718293-0405-4627-8839-4a5b6c7d8e9f",
      "admin_user_id": null,
      "admin_email": null,
      "action": "system.expiry_sweep",
      "target_entity": null,
      "target_id": null,
      "payload_before": null,
      "payload_after": {
        "expired_count": 12,
        "downgraded_count": 9,
        "ran_at": "2026-08-17T09:00:00.114820+00:00"
      },
      "note": "Auto-expired 12 subs; downgraded 9 users",
      "ip": null,
      "user_agent": null,
      "request_id": null,
      "created_at": "2026-08-17T09:00:01.220000+00:00"
    }
  ],
  "total": 18043,
  "page": 1,
  "page_size": 3,
  "total_pages": 6015
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `page < 1`; `page_size` ngoài `[1, 200]`; `admin_user_id` không phải UUID; `date_from`/`date_to` không parse được | `HTTPValidationError` |

**Fallback / suy giảm**

- Không có dòng nào khớp → 200 với `items: []`, `total: 0`, `total_pages: 0`.
- `admin_user_id` trỏ tới admin đã bị xoá cứng: FK là `ON DELETE SET NULL` → dòng audit vẫn tồn tại nhưng `admin_user_id` thành `null` và `admin_email` là `null`. **Dấu vết không bị mất, nhưng danh tính thì mất.**
- Dòng hệ thống (job) luôn có `admin_email: null` vì `admin_user_id` là `null`. Khẳng định bởi `tests/test_admin_audit_endpoint.py::test_list_audit_null_admin_rows`.
- Nếu `admin_user_id` có giá trị nhưng không tìm thấy trong bảng `users` (race), `admin_email` là `null` (`email_map.get(...)`).
- Truy vấn email chỉ chạy khi trang hiện tại có **ít nhất một** `admin_user_id` không null; nếu không, bỏ hẳn query đó.

**curl**

~~~bash
curl -X GET \
  'https://api.iqx.vn/api/v1/admin/audit?page=1&page_size=50&admin_user_id=b7c8d9e0-1f2a-4b3c-8d4e-5f60718293a4&action_prefix=user.&target_entity=user&date_from=2026-08-01T00:00:00Z&date_to=2026-08-18T00:00:00Z' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e5607182-9304-4516-8728-394a5b6c7d8e'
~~~

**Ghi chú khi viết lại**

1. **`admin_email` KHÔNG phải cột trong DB.** Nó được ghép ở tầng endpoint bằng **một** query phụ: lấy tập `admin_user_id` distinct của trang hiện tại → `SELECT id, email FROM users WHERE id IN (...)` → build map → gán. Giữ đúng cách này (1 query cho cả trang, không N+1). Hệ quả cần biết: email hiển thị là email **hiện tại** của admin, không phải email tại thời điểm hành động.
2. **`action_prefix` dùng `LIKE '{prefix}%'` mà KHÔNG escape `%` và `_`.** Truyền `action_prefix=user%delete` sẽ khớp nhiều hơn mong đợi; `_` khớp một ký tự bất kỳ. Không phải lỗ hổng SQL injection (đã tham số hoá) nhưng là **wildcard injection** làm kết quả sai. Khi viết lại: escape `\`, `%`, `_` trong input trước khi ghép, hoặc dùng `startsWith` ở tầng query builder.
3. **Chỉ có `action_prefix`, KHÔNG có filter khớp đúng `action`.** Muốn xem riêng `user.export` phải truyền `action_prefix=user.export` (tiền tố trùng khít). Nếu cần khớp đúng, đó là bổ sung mới.
4. **Không có cách lọc "chỉ hành động hệ thống".** `admin_user_id=null` không truyền được qua query string (Pydantic coi thiếu = không lọc). Cách thay thế hiện có: `action_prefix=system.`. Nếu cần lọc theo NULL, phải thêm param mới (ví dụ `system_only=true`) — ghi rõ là bổ sung.
5. **Sắp xếp `created_at DESC` không có tie-breaker.** Nhiều dòng cùng millisecond (rất dễ xảy ra với `user.bulk_update` — 500 dòng trong cùng transaction, `server_default=now()` cho **cùng một** timestamp trong Postgres!) sẽ **đổi chỗ giữa các trang** → admin có thể thấy dòng trùng hoặc mất dòng khi lật trang. Đây là vấn đề **thật, không lý thuyết**. Khi viết lại: `ORDER BY created_at DESC, id DESC` và cân nhắc thêm cột sequence.
6. **`total_pages` được service tính**, công thức `total > 0 ? ceil(total / page_size) : 0`. `page` và `page_size` echo lại nguyên giá trị request (không clamp về số trang thật).
7. **Phân trang OFFSET trên bảng chỉ tăng, sort DESC** → dòng mới chèn vào đầu làm lệch các trang sau. Với bảng hàng chục nghìn dòng, `OFFSET 500000` cũng rất chậm. Cân nhắc keyset trên `(created_at, id)`.
8. **`payload_before` / `payload_after` là JSON tự do**, hình dạng khác nhau theo `action`. Trên Postgres migration dùng `JSONB`; model dùng `sa.JSON` để test SQLite chạy được. Trong NestJS: cột `jsonb`, type TS là `Record<string, unknown> | null` — **đừng** cố khai báo union chi tiết, và **đừng** cho phép filter/index vào bên trong payload.
9. **Bảng này chứa PII** (`ip`, `user_agent`, `payload_*` có thể chứa email/tên, và `user.export` lưu cả bộ lọc tìm kiếm). Endpoint mở cho mọi admin, không phân quyền nhỏ hơn, và **không tự ghi audit khi được đọc**. Cân nhắc chính sách retention + audit-của-audit; ghi rõ là bổ sung.
10. Giới hạn độ dài cột phải giữ nguyên khi tạo migration mới: `action` 80, `target_entity` 60, `target_id` 100, `note` 1000, `ip` 45, `user_agent` 500, `request_id` **40**. Ba index composite cần tái tạo: `(admin_user_id, created_at)`, `(target_entity, target_id)`, `(action, created_at)`.

---

## Ghi chú tổng hợp khi viết lại

### Ba mức nghiêm trọng cần xử lý trước khi port

**A. Bảo mật — phải sửa, không port nguyên trạng**

1. `POST /admin/users/{id}/reset-password` **không revoke refresh token** của user bị reset → session bị chiếm vẫn sống sau khi đổi mật khẩu. Đường tự phục vụ `/auth/reset-password` thì có revoke. **Sửa khi viết lại** và ghi vào changelog.
2. `GET /admin/users/export` là kênh trích xuất PII toàn hệ thống (email + họ tên + số điện thoại, tới 50 000 dòng) với rate limit mặc định 60/phút, không cần lý do. Thêm rate limit riêng + bắt buộc `note` (lưu vào audit).
3. `POST /admin/system/jobs/{job_id}/run` **không có chống chạy trùng** cho job mutate tiền/quyền. Thêm `pg_advisory_xact_lock`.
4. `POST /admin/users/bulk` không chặn admin tự khoá mình / hạ toàn bộ admin. `soft_delete` không revoke token.
5. Ba endpoint đọc dữ liệu nhạy cảm nhất (`/360`, `/login-history`, `/admin/audit`) **không ghi audit khi được đọc**.

**B. Bug hoặc gần-bug — cần quyết định rõ ràng**

6. Dòng audit `user.export` được ghi **bên trong** streaming generator, sau khi dependency `get_db` (chủ commit) đã thoát → khả năng cao **không persist** trên production. Ghi audit + commit **trước** khi stream.
7. `role`/`status` sai enum ở `/export` → **500** thay vì 422, vì việc chuyển enum nằm trong hàm build query. Khai báo query param là enum.
8. `/admin/audit` sắp xếp `created_at DESC` **không tie-breaker**, mà `user.bulk_update` sinh tới 500 dòng cùng `now()` trong một transaction → phân trang trả trùng/mất dòng. Thêm `id DESC`.
9. `action_prefix` không escape wildcard `%`/`_`.
10. `job_map` (2 job chạy được) lệch với `startup()` (10 job hiển thị) → UI hiện 10 nút, 8 nút trả 404. Hợp nhất thành một registry.
11. Stream CSV dùng `OFFSET` không có khoá ổn định → có thể trùng/mất dòng.

**C. Khác biệt định nghĩa số liệu — phải quyết trước khi code, không phát hiện sau**

12. **Múi giờ.** Tất cả cửa sổ "today"/"ngày" trong nhóm metrics dùng **UTC** (`00:00 UTC = 07:00 ICT`). Nếu dashboard hiện số theo giờ VN thì phải đổi sang `Asia/Ho_Chi_Minh` và **thông báo rằng các con số sẽ thay đổi**.
13. `revenue_last_7d_vnd` (#7, cửa sổ trượt theo giây) ≠ tổng `revenue?days=7` (#8, 7 bucket ngày UTC). Chọn một định nghĩa.
14. `plan_distribution` trong `/overview` (#7) ≠ `/plan-distribution` (#9): INNER vs OUTER JOIN, loại vs giữ `TRIAL_7D`, bỏ vs áp `is_active`, sort `price_vnd` vs `(sort_order, price_vnd)`.
15. `mrr_vnd` tính từ **giá niêm yết gói** × `30 / duration_days`, `int()` **cắt** (không làm tròn), và loại `TRIAL_7D`. Nó **không** đối chiếu được với `revenue_*` (nguồn khác: đơn thanh toán).
16. `active_users` chỉ là `status == 'active'` — **không phải MAU/DAU**, không liên quan `last_login_at`. Đừng đổi tên/ý nghĩa.
17. `active_subscribers` đếm **dòng subscription**, không phải user distinct. `active_paid_count` là phép trừ, có thể lớn hơn tổng `plan_distribution`.
18. `total_users` loại `deleted` nhưng `new_users_*` **không** loại; `db_stats.users` ở #10 cũng **không** loại.
19. Doanh thu bám `paid_at` (ngày thanh toán), **không** `created_at`; loại `grant_type = 'admin_grant'`; đơn `refunded` không được trừ ngược mà rơi khỏi tổng, nên số kỳ cũ **đổi hồi tố**.

### Quy ước phải giữ nguyên nguyên trạng

- **Bốn hình dạng response khác nhau** trong nhóm 12 endpoint — đừng chuẩn hoá: `PaginatedResponse<T>` (#6, #12); **array trần** (#8, #9); object phẳng (#3, #4, #5, #7, #10, #11); **`text/csv`** (#1).
- **Status code không mặc định**: #5 trả **202**, không phải 200.
- **`404` vs `[] rỗng`** khi entity không tồn tại: #3/#4/#5 → **404** `Không tìm thấy Người dùng`; #6 → **200 với `items: []`**. Không hợp nhất.
- **Partial success**: #2 luôn 200; lỗi nằm trong `skipped` (không tồn tại) và `errors` (tồn tại nhưng fail). Không đổi thành 207/400.
- **Detail tiếng Anh còn sót** — quyết định một lần rồi áp dụng đồng loạt: `Export filter matches {n} rows (max 50000). Tighten filters first.` (#1), `Job '{job_id}' not found` (#11), `invalid role: …` / `invalid status: …` / `unknown op` (#2), `\`value\` is required for set_role / set_status` (#2), và `JobInfo.name` (#10). Các detail còn lại đều đã tiếng Việt.
- **Transaction & audit**: một transaction cho mỗi request; service chỉ `flush()`; commit ở tầng ngoài; `record()` **không** try/catch. Ngoại lệ duy nhất: job trong #11 tự `commit()` bên trong — phải thiết kế lại rõ ràng khi port.
- **Route order**: `/admin/users/export` phải đứng trước `/admin/users/{user_id}/...`.
- **`X-Request-ID`**: đọc header (hoặc sinh `uuid4`), gắn vào context, **echo lại trên response**, và **cắt còn 40 ký tự** trước khi ghi vào `admin_audit_log.request_id`.
- **Đơn vị**: mọi tiền là VND integer; `quantity` là số cổ phiếu; `duration_days` là ngày; `bps` (nếu gặp ở chương VT) là điểm cơ bản.

### Điểm CHƯA XÁC ĐỊNH

- `premium_subscriptions` có unique constraint trên `user_id` hay không (ảnh hưởng việc `active_subscribers` có thể đếm trùng một user) — **xem `app/models/premium.py`**.
- Giá trị `target_entity` / `target_id` chính xác của các `action` ngoài phạm vi chương này (nhóm `premium.*`, `subscription.*`, `vt.*`, `lesson.*`, `market_analysis.*`) — **xem chương tương ứng và các file `app/services/admin_payments.py`, `admin_subscriptions.py`, `admin_vt.py`, `admin_ipn.py`, `app/api/v1/endpoints/premium.py`, `admin_lessons.py`, `virtual_trading.py`, `market_analysis.py`**.
- Hình dạng đầy đủ của `result` cho 8 job **không** chạy được qua #11 (chúng không có đường HTTP nào) — **xem `app/services/jobs/alert_scan.py`, `market_analysis_job.py`, `intl_snapshot_job.py`**.
- Nội dung HTML/text của hai email (verification, password reset) — **xem `app/services/email_templates.py`**.
- Tiêu chí "đơn PENDING quá cũ" mà `ipn_reconcile_scan` đánh `FAILED` (giá trị cutoff cụ thể) — **xem `app/services/jobs/ipn_reconcile.py`**.
