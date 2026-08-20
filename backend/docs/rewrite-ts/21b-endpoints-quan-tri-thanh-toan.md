# Endpoint — Quản trị thanh toán, subscription & IPN log

Chương này là **phần tiếp của chương 21** và đặc tả **13 operation quản trị** còn thiếu: 5
endpoint đơn thanh toán (`/admin/payments`), 5 endpoint subscription (`/admin/subscriptions`,
`/admin/users/{id}/subscriptions/history`) và 3 endpoint IPN log (`/admin/ipn`). Đây là mặt
back-office của tiền thật: nơi admin sửa hậu quả khi webhook SePay không tới, khi khách đòi
hoàn tiền, hoặc khi cần cộng bù ngày cho người dùng.

**Các type dùng chung được định nghĩa ở chương 21 §Kiểu dữ liệu dùng chung** —
`PaymentOrderStatus`, `SubscriptionStatus`, `PremiumGrantType`, `PaginatedResponse<T>`,
`AdminPaymentOrderBrief`, `AdminPaymentOrderDetail`, `AdminPaymentOrderIpnLogBrief`,
`AdminSubscriptionBrief`, `AdminSubscriptionDetail`, `SePayIpnLogResponse`, `SePayIpnPayload`,
`SePayIpnResultMessage`. Chương này **không định nghĩa lại** chúng.

Vòng đời `pending → paid → refunded` của đơn và `active ↔ expired ↔ cancelled` của
subscription (kèm 2 sơ đồ mermaid và các ràng buộc bất biến) nằm ở
**chương 21 §Vòng đời trạng thái** — đọc mục đó trước khi port bất kỳ endpoint ghi-dữ-liệu
nào ở đây. Chương này chỉ mô tả *endpoint nào đẩy trạng thái đi đâu*, không lặp lại sơ đồ.

**Quy ước áp cho cả 13 endpoint**

- **Quyền**: Bearer + `role == 'admin'` (dep `get_current_admin`). Không có endpoint công khai.
- **Rate limit**: mặc định toàn cục **60 request/phút/IP**. Không endpoint nào có limit riêng.
- **Cache**: **không có Redis cache ở bất kỳ endpoint nào.** Dữ liệu tiền đọc trực tiếp Postgres.
- Router prefix: `admin_payments.router` có `prefix="/admin/payments"`; `admin_ipn.router` có
  `prefix="/admin/ipn"`; `admin_subscriptions.router` **không** có prefix (mỗi handler khai
  báo path đầy đủ) — nên nó ôm được cả `/admin/users/{user_id}/subscriptions/history`.
  Tất cả nằm dưới `/api/v1`.
- Lỗi domain trả `{ "detail": string, "code": string }`; 422 của framework trả
  `{ "detail": [{ loc, msg, type, ... }] }`.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/v1/admin/payments` | Bearer + Admin | Danh sách đơn thanh toán, phân trang + 7 bộ lọc |
| GET | `/api/v1/admin/payments/{order_id}` | Bearer + Admin | Chi tiết 1 đơn + 10 IPN log gần nhất |
| POST | `/api/v1/admin/payments/{order_id}/mark-paid` | Bearer + Admin | Xác nhận tay đơn PENDING (không có IPN) → PAID + kích hoạt |
| POST | `/api/v1/admin/payments/{order_id}/reconcile` | Bearer + Admin | Đối soát đơn PENDING >30 phút với IPN log đã lưu |
| POST | `/api/v1/admin/payments/{order_id}/refund` | Bearer + Admin | Đổi đơn PAID → REFUNDED + thu hồi Premium |
| GET | `/api/v1/admin/subscriptions` | Bearer + Admin | Danh sách subscription, phân trang + 4 bộ lọc |
| GET | `/api/v1/admin/subscriptions/{sub_id}` | Bearer + Admin | Chi tiết 1 subscription |
| GET | `/api/v1/admin/users/{user_id}/subscriptions/history` | Bearer + Admin | Lịch sử subscription của 1 user (mảng, không phân trang) |
| POST | `/api/v1/admin/subscriptions/{sub_id}/cancel` | Bearer + Admin | Huỷ subscription ngay (giữ nguyên `current_period_end`) |
| POST | `/api/v1/admin/subscriptions/{sub_id}/extend` | Bearer + Admin | Cộng N ngày vào `current_period_end` |
| GET | `/api/v1/admin/ipn` | Bearer + Admin | Danh sách IPN log (raw_body/raw_headers = null) |
| GET | `/api/v1/admin/ipn/{log_id}` | Bearer + Admin | Chi tiết IPN log kèm raw_body + raw_headers |
| POST | `/api/v1/admin/ipn/{log_id}/retry` | Bearer + Admin | Phát lại 1 IPN log qua `process_ipn`, ghi log mới |

---

## Type bổ sung

Chỉ 5 type dưới đây **chưa** có ở chương 21 (toàn bộ là request/response body riêng của
nhóm quản trị).

~~~ts
/** POST /admin/payments/{order_id}/mark-paid — body */
interface MarkPaidRequest {
  /**
   * BẮT BUỘC. 1..1000 ký tự sau khi trim; chuỗi toàn khoảng trắng → 422.
   * Giá trị được trim trước khi lưu vào premium_payment_orders.grant_note
   * và admin_audit_log.note.
   */
  note: string;
}

/** POST /admin/payments/{order_id}/reconcile — body (bắt buộc gửi body, `{}` là hợp lệ) */
interface ReconcileRequest {
  note?: string | null;   // default null; không giới hạn độ dài ở tầng schema
}

/** POST /admin/payments/{order_id}/refund — body */
interface RefundRequest {
  reason: string;   // BẮT BUỘC nhưng KHÔNG có min_length → "" vẫn qua validate
}

/** POST /admin/subscriptions/{sub_id}/cancel — body */
interface CancelSubscriptionRequest {
  reason: string;   // BẮT BUỘC, không min/max length
}

/** POST /admin/subscriptions/{sub_id}/extend — body */
interface ExtendSubscriptionRequest {
  days: number;            // int, ràng buộc DUY NHẤT: > 0. KHÔNG có trần trên.
  reason?: string | null;  // default null
}

/** Kết quả POST /admin/payments/{order_id}/reconcile (endpoint KHÔNG có response_model) */
interface ReconcileResult {
  status: 'reconciled' | 'no_match';
  order_id: string;        // uuid dạng chuỗi
}

/** Kết quả POST /admin/ipn/{log_id}/retry */
interface IpnRetryResponse {
  /** = message của process_ipn (xem SePayIpnResultMessage ở ch.21), fallback "retried" */
  status: string;
  /** ID của BẢN GHI LOG MỚI vừa tạo — KHÔNG phải log_id trong path */
  log_id: string;
  /** Chuỗi tự do: `IPN retry completed: {dict Python}` — xem Ghi chú */
  message: string;
}
~~~

> `AdminSubscriptionDetail` (ch.21) mở rộng `AdminSubscriptionBrief` bằng đúng 2 khoá
> `updated_at` và `cancelled_by_user_id`. Endpoint `history` trả `AdminSubscriptionDetail[]`,
> endpoint `list` trả `PaginatedResponse<AdminSubscriptionBrief>` — **hai hình dạng khác nhau**,
> đừng dùng chung một type.

---

## Nhóm A — Đơn thanh toán

### GET /api/v1/admin/payments

> **Danh sách đơn thanh toán** — bảng đối soát chính của back-office: mọi đơn checkout, đơn
> admin grant, đơn đã hoàn tiền, kèm số IPN log đã khớp vào từng đơn.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_payment_orders` LEFT JOIN `premium_plans` + `users` + subquery COUNT trên `sepay_ipn_logs` |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | int | không | `1` | `>= 1` | Trang, 1-based |
| `page_size` | int | không | `20` | `1..200` | Số dòng mỗi trang |
| `status` | string \| null | không | `null` | **không validate enum** | So sánh đúng bằng: `status = ?`. Giá trị lạ → 0 kết quả, KHÔNG 422 |
| `grant_type` | string \| null | không | `null` | **không validate enum** | So sánh đúng bằng: `grant_type = ?` |
| `user_id` | uuid \| null | không | `null` | uuid hợp lệ | Lọc theo chủ đơn |
| `plan_id` | uuid \| null | không | `null` | uuid hợp lệ | Lọc theo gói |
| `date_from` | date-time \| null | không | `null` | ISO-8601 | `created_at >= date_from` (**bao gồm** mốc) |
| `date_to` | date-time \| null | không | `null` | ISO-8601 | `created_at < date_to` (**loại trừ** mốc) |
| `search` | string \| null | không | `null` | — | `invoice_number ILIKE '%s%'` **OR** `users.email ILIKE '%s%'` — chứa, không phải prefix |

Mọi filter kết hợp bằng `AND`. Không filter nào → không có `WHERE`.

**Sắp xếp mặc định (và duy nhất):** `ORDER BY premium_payment_orders.created_at DESC`.
Không có khoá phụ, không có tham số `sort` — đơn tạo cùng thời điểm có thứ tự không xác định.

**Request body**

—

**Response 200**

~~~ts
type ListAdminPaymentsResponse = PaginatedResponse<AdminPaymentOrderBrief>;
~~~

~~~json
{
  "items": [
    {
      "id": "9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45",
      "invoice_number": "IQX_7A3F9C2D1E4B",
      "amount_vnd": 299000,
      "currency": "VND",
      "status": "paid",
      "grant_type": "payment",
      "paid_at": "2026-08-17T03:42:11.204881+00:00",
      "created_at": "2026-08-17T03:40:58.113002+00:00",
      "plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
      "plan_name": "Premium 3 tháng",
      "plan_code": "PREMIUM_3M",
      "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
      "user_email": "nguyen.thi.mai@gmail.com",
      "ipn_log_count": 1
    },
    {
      "id": "4b60a97e-1c58-42df-b3aa-8f0e2d5619c7",
      "invoice_number": "IQX_5B8E2A1C9D0F",
      "amount_vnd": 99000,
      "currency": "VND",
      "status": "pending",
      "grant_type": null,
      "paid_at": null,
      "created_at": "2026-08-17T02:11:07.500419+00:00",
      "plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
      "plan_name": "Premium 1 tháng",
      "plan_code": "PREMIUM_1M",
      "user_id": "b7d3f018-42e9-4c1a-9de6-3a5b7c9e0f11",
      "user_email": "tran.van.hung@gmail.com",
      "ipn_log_count": 0
    },
    {
      "id": "e0a7c391-5d24-4b8f-a016-9c3e7f2d5b48",
      "invoice_number": "GRANT_C4D2E8A1F095",
      "amount_vnd": 0,
      "currency": "VND",
      "status": "paid",
      "grant_type": "admin_grant",
      "paid_at": "2026-08-16T09:05:33.771244+00:00",
      "created_at": "2026-08-16T09:05:33.769018+00:00",
      "plan_id": "c3e9f012-45a6-4d7b-8e91-2a3b4c5d6e7f",
      "plan_name": "Premium 12 tháng",
      "plan_code": "PREMIUM_12M",
      "user_id": "5e91b204-8c37-4f6d-b0a2-71d8e3c9f460",
      "user_email": "le.minh.chau@iqx.vn",
      "ipn_log_count": 0
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có / sai Bearer token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Token hợp lệ nhưng `role != 'admin'` | `Yêu cầu quyền quản trị viên` |
| 403 | `FORBIDDEN` | User bị vô hiệu hoá | `Tài khoản chưa được kích hoạt` |
| 422 | — | `page < 1`, `page_size > 200`, `user_id`/`plan_id`/`date_*` sai định dạng | mảng `detail` của Pydantic |

**Fallback / suy giảm**

Không có provider ngoài. Không khớp dòng nào → `items: []`, `total: 0`, `total_pages: 0`
(HTTP 200). `page` vượt trang cuối → `items: []` nhưng `total`/`total_pages` vẫn đúng.
`plan_name`/`plan_code` = `null` khi gói đã bị xoá cứng; `user_email` = `null` khi user đã bị
xoá (đơn vẫn còn vì LEFT JOIN).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/payments?page=1&page_size=20&status=pending&date_from=2026-08-01T00:00:00Z&date_to=2026-08-18T00:00:00Z&search=IQX_7A3F' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 3f1a9c72-5b48-4e0d-9a13-6c8b2e7d0415'
~~~

**Ghi chú khi viết lại**

- `amount_vnd` là **INTEGER đồng VND** (`Integer`, không phải `Decimal`/`Numeric`). `299000`
  nghĩa là 299.000 ₫. Trong TS dùng `number`; đừng bọc `Decimal`/`BigInt`, đừng chia 1000.
- `ipn_log_count` đến từ subquery `SELECT matched_order_id, COUNT(id) FROM sepay_ipn_logs
  GROUP BY matched_order_id` LEFT JOIN theo `matched_order_id = order.id`, bọc
  `COALESCE(..., 0)`. Vì subquery đã GROUP BY nên **không fan-out** — `total` đếm đúng số đơn.
  Nếu port bằng ORM khác, đừng thay bằng JOIN trực tiếp vào `sepay_ipn_logs` (sẽ nhân dòng
  và làm `total` sai).
- `total` được tính bằng `SELECT count(*) FROM (<truy vấn base kèm mọi JOIN và WHERE>)` —
  tức đếm trên **cùng** một truy vấn đã join, không phải `COUNT` trên bảng gốc. Giữ nguyên để
  filter `search` theo email (cần JOIN `users`) vẫn đếm đúng.
- `status`/`grant_type` là chuỗi thô, **không** đi qua enum validate. Bản TS đừng thêm
  `@IsEnum` — sẽ đổi 200-rỗng thành 400/422 và làm vỡ UI đang gửi giá trị rỗng.
- `date_to` là **nửa mở** (`<`). UI muốn "hết ngày 17/08" phải gửi `2026-08-18T00:00:00Z`.

---

### GET /api/v1/admin/payments/{order_id}

> **Chi tiết đơn thanh toán** — dựng đủ bối cảnh để quyết định `mark-paid` / `reconcile` /
> `refund`: đơn, gói, user, subscription hiện tại của user, và 10 IPN log đã khớp.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | 5 truy vấn rời: `premium_payment_orders`, `premium_plans`, `users`, `premium_subscriptions`, `sepay_ipn_logs` |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | uuid | uuid hợp lệ | `premium_payment_orders.id` |

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetAdminPaymentResponse = AdminPaymentOrderDetail;
~~~

~~~json
{
  "id": "9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45",
  "invoice_number": "IQX_7A3F9C2D1E4B",
  "amount_vnd": 299000,
  "currency": "VND",
  "status": "paid",
  "grant_type": "payment",
  "grant_note": null,
  "paid_at": "2026-08-17T03:42:11.204881+00:00",
  "created_at": "2026-08-17T03:40:58.113002+00:00",
  "updated_at": "2026-08-17T03:42:11.204881+00:00",
  "plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
  "plan_name": "Premium 3 tháng",
  "plan_code": "PREMIUM_3M",
  "plan_price_vnd": 299000,
  "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
  "user_email": "nguyen.thi.mai@gmail.com",
  "subscription_id": "7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73",
  "subscription_status": "active",
  "subscription_period_end": "2026-11-15T03:42:11.204881+00:00",
  "ipn_logs": [
    {
      "id": "a1c7e390-4d52-4b8f-9016-3c8e7f2d5b41",
      "received_at": "2026-08-17T03:42:10.882317+00:00",
      "secret_key_valid": true,
      "result_status": "processed",
      "sepay_transaction_id": "SP2608170342117745",
      "error_message": null
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có đơn với `order_id` này | `Không tìm thấy đơn hàng` |
| 401 | `UNAUTHORIZED` | Thiếu/sai token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `order_id` không phải uuid | mảng `detail` của Pydantic |

**Fallback / suy giảm**

Không có IPN log → `ipn_logs: []`. User chưa từng có subscription → cả 3 khoá
`subscription_id` / `subscription_status` / `subscription_period_end` = `null`. Gói bị xoá →
`plan_name` / `plan_code` / `plan_price_vnd` = `null` (đơn vẫn trả 200).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/payments/9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- ⚠️ `subscription_*` là **subscription hiện tại của user**, tra bằng
  `WHERE premium_subscriptions.user_id = order.user_id` — KHÔNG có FK từ đơn sang
  subscription. Với đơn cũ, ba trường này mô tả trạng thái *hôm nay*, không phải trạng thái
  do đơn đó tạo ra. Đừng đặt tên biến kiểu `order.subscription` trong bản TS.
- `ipn_logs` là **10 log mới nhất**, `ORDER BY received_at DESC LIMIT 10`, khớp qua
  `sepay_ipn_logs.matched_order_id = order_id`. Dựng thủ công thành dict 6 khoá snake_case;
  `id` đã `str()`, `received_at` đã `.isoformat()` (nên là **chuỗi**, và là `null` nếu cột
  null). Xem `AdminPaymentOrderIpnLogBrief` ở ch.21.
- Cùng một hàm `get()` này được 3 endpoint POST (`mark-paid`, `refund`) gọi lại ở cuối để
  dựng response — port thành một hàm dùng chung, đừng nhân bản.

---

### POST /api/v1/admin/payments/{order_id}/mark-paid

> **Xác nhận tay đơn PENDING** — cửa thoát khi SePay **không hề gửi IPN**: admin đã tự đối
> chiếu sao kê thấy tiền về, nên đóng chính đơn đó thành PAID và kích hoạt Premium.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_payment_orders` (+ `premium_plans`, `premium_subscriptions`, `users`) |
| **Side-effect** | `pending → paid` (UPDATE có điều kiện), gia hạn/tạo subscription, `users.role → premium`, **1 audit row** `premium.order.mark_paid` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | uuid | uuid hợp lệ | Đơn đang PENDING cần xác nhận |

**Query params**

—

**Request body**

~~~ts
type MarkPaidBody = MarkPaidRequest;   // { note: string } — 1..1000 ký tự sau trim
~~~

~~~json
{
  "note": "CK 17/08/2026 20:14, ref FT2608170342117745, đã đối chiếu sao kê VCB"
}
~~~

**Response 200**

~~~ts
type MarkPaidResponse = AdminPaymentOrderDetail;   // đọc lại bằng get(order_id)
~~~

~~~json
{
  "id": "4b60a97e-1c58-42df-b3aa-8f0e2d5619c7",
  "invoice_number": "IQX_5B8E2A1C9D0F",
  "amount_vnd": 99000,
  "currency": "VND",
  "status": "paid",
  "grant_type": "admin_confirmed",
  "grant_note": "CK 17/08/2026 20:14, ref FT2608170342117745, đã đối chiếu sao kê VCB",
  "paid_at": "2026-08-17T14:22:36.918440+00:00",
  "created_at": "2026-08-17T02:11:07.500419+00:00",
  "updated_at": "2026-08-17T14:22:36.918440+00:00",
  "plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
  "plan_name": "Premium 1 tháng",
  "plan_code": "PREMIUM_1M",
  "plan_price_vnd": 99000,
  "user_id": "b7d3f018-42e9-4c1a-9de6-3a5b7c9e0f11",
  "user_email": "tran.van.hung@gmail.com",
  "subscription_id": "c8f1a406-92d5-4e37-b1c0-6a4d8e2f7b59",
  "subscription_status": "active",
  "subscription_period_end": "2026-09-16T14:22:36.918440+00:00",
  "ipn_logs": []
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có đơn `order_id` | `Không tìm thấy đơn hàng` |
| 400 | `BAD_REQUEST` | Đơn không ở PENDING (paid/failed/cancelled/refunded) | `Chỉ có thể xác nhận thanh toán cho đơn hàng ở trạng thái PENDING (hiện tại: paid)` |
| 400 | `BAD_REQUEST` | Mất cuộc đua UPDATE có điều kiện (double-submit hoặc IPN tới cùng lúc) | `Đơn hàng vừa được xác nhận bởi một yêu cầu khác. Tải lại để xem trạng thái mới nhất.` |
| 422 | — | Thiếu `note`, `note` rỗng/toàn khoảng trắng, `note` > 1000 ký tự | mảng `detail`; message của validator: `Ghi chú xác nhận không được để trống` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

Nếu `plan_id` của đơn trỏ tới gói không còn tồn tại (trên lý thuyết không xảy ra: cột
`NOT NULL` + FK `RESTRICT`), đơn **vẫn** thành PAID nhưng subscription **không** được gia hạn,
chỉ ghi log `logger.error`. Endpoint vẫn trả 200. Không có retry, không rollback.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/payments/4b60a97e-1c58-42df-b3aa-8f0e2d5619c7/mark-paid' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"note":"CK 17/08/2026 20:14, ref FT2608170342117745, đã đối chiếu sao kê VCB"}'
~~~

**Ghi chú khi viết lại**

- **Audit**: `action = "premium.order.mark_paid"`, `target_entity = "payment_order"`,
  `target_id = str(order.id)`, `payload_before = {"status": "pending"}`,
  `payload_after = {"status": "paid", "grant_type": "admin_confirmed"}`, `note = note` (đã trim).
  Đúng **1** row, ghi **sau** khi mutation thành công.
- Kích hoạt đi qua **đúng cùng** đường với webhook: `claim_pending_order()` —
  `UPDATE premium_payment_orders SET status='paid', paid_at=now, grant_type='admin_confirmed',
  granted_by_user_id=<admin>, grant_note=<note> WHERE invoice_number = ? AND status='pending'`,
  rồi đếm `rowcount`. `rowcount = 0` → **không** áp gì cả và ném 400. Tuyệt đối không đổi
  thành `SELECT rồi UPDATE`.
- Cố ý **không** bịa `sepay_transaction_id` và **không** ghi `raw_ipn` — hai cột đó ở lại
  `null` để auditor phân biệt "SePay báo tiền về" với "admin khẳng định tiền về". Test
  `test_mark_paid_is_distinguishable_from_webhook_confirmation` khoá hành vi này.
- Sau claim, gọi `_extend_subscription(user_id, plan)` → `atomic_extend_period`:
  còn hạn (`current_period_end > now`) thì **cộng dồn** lên hạn cũ và giữ `current_period_start`;
  hết hạn thì mở kỳ mới từ `now`. Luôn set `status = 'active'` (kể cả đang `cancelled`).
- Không idempotent theo HTTP: gọi lần 2 → **400** (đơn đã `paid`). Nhưng **idempotent về
  hiệu ứng**: chỉ 1 lần gia hạn, chỉ 1 audit row (test `test_mark_paid_double_submit_is_safe`).
- ⚠️ `_set_user_role_premium()` gọi `session.commit()` **giữa request** → phần mutation
  (claim + subscription + role) commit **trước** khi audit row được flush. Nên khẳng định
  "audit và mutation cùng sống hoặc cùng chết" ở ch.21 **không đúng cho riêng đường này**. Khi
  port sang TS, cách an toàn hơn là bỏ commit giữa request và để một transaction bao cả hai —
  nhưng phải ghi rõ đây là **thay đổi hành vi có chủ ý**, không phải port 1:1.

---

### POST /api/v1/admin/payments/{order_id}/reconcile

> **Đối soát đơn PENDING treo** — dùng khi IPN **đã tới và đã được lưu** vào `sepay_ipn_logs`
> nhưng đơn vì lý do nào đó vẫn PENDING: tìm log làm bằng chứng rồi đóng đơn.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_payment_orders` + `sepay_ipn_logs` (+ `premium_plans`) |
| **Side-effect** | Nhánh khớp: `pending → paid` + gia hạn subscription + `users.role → premium` + **1 audit row**. Nhánh không khớp: **chỉ 1 audit row**, không đổi dữ liệu |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | uuid | uuid hợp lệ | Đơn PENDING đã tạo **≥ 30 phút** |

**Query params**

—

**Request body**

~~~ts
type ReconcileBody = ReconcileRequest;   // { note?: string | null }
~~~

~~~json
{
  "note": "Khách gửi bill 17/08, đối soát theo IPN log a1c7e390"
}
~~~

Body **bắt buộc gửi** (OpenAPI `requestBody.required = true`) nhưng mọi field optional, nên
`{}` là payload hợp lệ tối thiểu.

**Response 200**

~~~ts
type ReconcileResponse = ReconcileResult;   // { status: 'reconciled' | 'no_match'; order_id: string }
~~~

~~~json
{
  "status": "reconciled",
  "order_id": "4b60a97e-1c58-42df-b3aa-8f0e2d5619c7"
}
~~~

~~~json
{
  "status": "no_match",
  "order_id": "4b60a97e-1c58-42df-b3aa-8f0e2d5619c7"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có đơn `order_id` | `Không tìm thấy đơn hàng` |
| 400 | `BAD_REQUEST` | Đơn không ở PENDING | `Chỉ có thể reconcile đơn hàng PENDING (hiện tại: paid)` |
| 400 | `BAD_REQUEST` | `now - created_at < 30 phút` | `Đơn hàng chưa đủ 30 phút để reconcile` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `order_id` không phải uuid, body không phải JSON object | mảng `detail` |

**Fallback / suy giảm**

Không tìm được IPN log hợp lệ → **200** với `status: "no_match"` (không phải lỗi). Vẫn ghi
audit row để lưu dấu "đã thử đối soát lúc này, không có bằng chứng". Đây là tín hiệu cho admin
chuyển sang `mark-paid`. Nếu gói của đơn không còn → đơn vẫn thành `paid` nhưng subscription
không được gia hạn (im lặng, không log error ở nhánh này).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/payments/4b60a97e-1c58-42df-b3aa-8f0e2d5619c7/reconcile' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"note":"Khách gửi bill 17/08, đối soát theo IPN log a1c7e390"}'
~~~

**Ghi chú khi viết lại**

- **Audit** (cả hai nhánh dùng **cùng** `action`):
  - khớp: `action = "premium.order.reconcile"`, `target_entity = "payment_order"`,
    `target_id = str(order.id)`, `before = {"status": "pending"}`, `after = {"status": "paid"}`,
    `note = body.note` (có thể `null`).
  - không khớp: cùng `action`/`target`, `before = {"status": "pending"}` (giá trị enum thật của
    đơn), `after = {"status": "no_match"}` — tức `payload_after.status` **không phải** trạng
    thái đơn mà là kết quả đối soát. Quirk có thật; dashboard audit phải xử lý.
- Điều kiện tìm log: `secret_key_valid IS TRUE AND (matched_order_id = :order_id OR
  (sepay_transaction_id IS NOT NULL AND sepay_transaction_id = order.sepay_transaction_id))`,
  `ORDER BY received_at DESC LIMIT 1`.
  ⚠️ Đơn PENDING gần như luôn có `sepay_transaction_id = NULL`, nên **nhánh thứ hai thực tế
  là code chết**: chỉ `matched_order_id` mới khớp. Giữ nguyên logic nhưng đừng kỳ vọng nó cứu
  được đơn mà IPN log chưa gắn `matched_order_id`.
- ⚠️ **Endpoint này không khớp theo `invoice_number`.** Job nền `run_ipn_reconcile_scan`
  (mỗi 6h) thì khớp bằng `raw_body.order.order_invoice_number` và replay qua `process_ipn()`.
  Hai cơ chế đối soát **khác nhau** — đừng gộp khi port.
- ⚠️ Nhánh khớp **không** dùng UPDATE có điều kiện: nó set thẳng qua ORM
  (`status = 'paid'`, `paid_at = now`, `sepay_transaction_id = order.sepay_transaction_id ||
  ipn_log.sepay_transaction_id || "reconcile_<invoice_number>"`,
  `grant_type = order.grant_type || "payment"`) rồi `flush()`. Chạy song song với một IPN tới
  muộn **có thể gia hạn hai lần**. Bản TS nên dùng lại `claim_pending_order` như `mark-paid`
  để đóng lỗ này — và ghi rõ đó là sửa lỗi, không phải port 1:1.
- Response **không** phải `AdminPaymentOrderDetail` (khác `mark-paid` và `refund`) — endpoint
  không khai `response_model`, trả nguyên dict 2 khoá. Frontend phải gọi lại
  `GET /admin/payments/{order_id}` để lấy trạng thái mới.

---

### So sánh `mark-paid` vs `reconcile` (chỗ dễ hiểu sai nhất chương)

| | `mark-paid` | `reconcile` |
|---|---|---|
| **Tình huống** | SePay **chưa bao giờ** gửi IPN; bảng `sepay_ipn_logs` trống với đơn này | IPN **đã tới và đã lưu**, nhưng đơn vẫn PENDING |
| **Bằng chứng** | Con người: sao kê / mã giao dịch ngân hàng, ghi trong `note` (bắt buộc) | Máy: 1 dòng `sepay_ipn_logs` có `secret_key_valid = true` |
| **Điều kiện tiền quyết** | `status = 'pending'`. **Không** yêu cầu tuổi đơn | `status = 'pending'` **và** đơn đã ≥ **30 phút** |
| **`note`** | **Bắt buộc**, 1..1000 ký tự sau trim | Tuỳ chọn, có thể `null` |
| **`grant_type` sau khi chạy** | `admin_confirmed` (luôn ghi đè) | `payment` (chỉ set nếu đang `null`: `grant_type || 'payment'`) |
| **`granted_by_user_id`** | = admin thực hiện | **không** set (giữ `null`) |
| **`sepay_transaction_id`** | giữ `null` — không bịa | set `= ipn_log.sepay_transaction_id` hoặc `"reconcile_<invoice>"` |
| **Kích hoạt / gia hạn subscription** | **Có** — qua `admin_confirm_pending_payment` → `claim_pending_order` + `_extend_subscription` | **Có** ở nhánh khớp — set trạng thái thủ công + `_extend_subscription` |
| **Chống đua** | Có: UPDATE có điều kiện + đếm `rowcount`, mất đua → 400 | **Không**: set thẳng qua ORM |
| **Không đủ điều kiện** | Ném **400** | Trả **200** `{"status":"no_match"}` |
| **Response** | `AdminPaymentOrderDetail` đầy đủ | `{ status, order_id }` |
| **Gọi lần 2** | 400 (đơn đã `paid`) — hiệu ứng vẫn chỉ 1 lần | 400 (đơn đã `paid`); nhánh `no_match` gọi bao nhiêu lần cũng được, mỗi lần thêm 1 audit row |
| **Quy trình khuyến nghị** | Thử `reconcile` trước; `no_match` **và** đã xác minh tiền → mới `mark-paid` | Là bước đầu tiên — rẻ, có bằng chứng máy |

---

### POST /api/v1/admin/payments/{order_id}/refund

> **Hoàn tiền đơn PAID** — đổi đơn sang `refunded` và **thu hồi Premium** của user; đây là
> thao tác *ghi sổ nội bộ*, việc chuyển tiền lại cho khách làm ở nơi khác.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_payment_orders` + `premium_subscriptions` + `users` |
| **Side-effect** | `paid → refunded`; nếu subscription của user đang `active` và còn hạn → `cancelled` + hạ `users.role` về `user`; **1 hoặc 2 audit row** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | uuid | uuid hợp lệ | Đơn đang ở `paid` |

**Query params**

—

**Request body**

~~~ts
type RefundBody = RefundRequest;   // { reason: string }
~~~

~~~json
{
  "reason": "Khách chuyển nhầm 2 lần cùng ngày, hoàn đơn thứ hai theo yêu cầu ngày 17/08/2026"
}
~~~

**Response 200**

~~~ts
type RefundResponse = AdminPaymentOrderDetail;   // đọc lại bằng get(order_id)
~~~

~~~json
{
  "id": "9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45",
  "invoice_number": "IQX_7A3F9C2D1E4B",
  "amount_vnd": 299000,
  "currency": "VND",
  "status": "refunded",
  "grant_type": "payment",
  "grant_note": null,
  "paid_at": "2026-08-17T03:42:11.204881+00:00",
  "created_at": "2026-08-17T03:40:58.113002+00:00",
  "updated_at": "2026-08-17T15:08:47.332190+00:00",
  "plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
  "plan_name": "Premium 3 tháng",
  "plan_code": "PREMIUM_3M",
  "plan_price_vnd": 299000,
  "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
  "user_email": "nguyen.thi.mai@gmail.com",
  "subscription_id": "7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73",
  "subscription_status": "cancelled",
  "subscription_period_end": "2026-11-15T03:42:11.204881+00:00",
  "ipn_logs": [
    {
      "id": "a1c7e390-4d52-4b8f-9016-3c8e7f2d5b41",
      "received_at": "2026-08-17T03:42:10.882317+00:00",
      "secret_key_valid": true,
      "result_status": "processed",
      "sepay_transaction_id": "SP2608170342117745",
      "error_message": null
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có đơn `order_id` | `Không tìm thấy đơn hàng` |
| 400 | `BAD_REQUEST` | Đơn không ở PAID (pending/failed/cancelled/refunded) | `Chỉ có thể hoàn tiền cho đơn hàng ở trạng thái PAID (hiện tại: pending)` |
| 422 | — | Thiếu `reason` | mảng `detail` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 500 | — | `reason` quá dài làm `cancel_reason` vượt `VARCHAR(1000)` | lỗi DB, xem Ghi chú |

**Fallback / suy giảm**

User không có subscription, hoặc subscription đang `expired`/`cancelled`, hoặc
`current_period_end <= now` → **chỉ** đơn đổi sang `refunded`; không huỷ subscription, không
hạ role, chỉ **1** audit row. Endpoint vẫn trả 200
(test `test_refund_paid_order_no_active_sub`).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/payments/9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45/refund' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Khách chuyển nhầm 2 lần cùng ngày, hoàn đơn thứ hai theo yêu cầu ngày 17/08/2026"}'
~~~

**Ghi chú khi viết lại**

- ⚠️ **Không gọi ra SePay.** Không có HTTP request nào tới cổng thanh toán, không có API
  hoàn tiền. Endpoint **chỉ** đổi trạng thái nội bộ + thu hồi quyền. Tiền thật phải được
  chuyển lại bằng tay (ngân hàng / dashboard SePay). Đây là điểm dễ hiểu sai nhất: gọi API
  này **không** làm khách nhận lại tiền.
- **Audit — có thể là 2 row**:
  1. `action = "premium.order.refund"`, `target_entity = "payment_order"`,
     `target_id = str(order.id)`, `before = {"status": "paid"}`,
     `after = {"status": "refunded"}`, `note = reason`.
  2. **Chỉ khi** huỷ subscription kèm theo: `action = "premium.subscription.cancel"`,
     `target_entity = "subscription"`, `target_id = str(sub.id)`,
     `before = {"status": "active"}`, `after = {"status": "cancelled"}`,
     `note = "Cancelled due to refund of order IQX_7A3F9C2D1E4B"`.
     ⚠️ Tên action **khác** action của endpoint cancel (`subscription.cancel`, không tiền tố).
     Hai chuỗi này phải giữ nguyên, khác nhau — báo cáo audit đang lọc theo tiền tố.
- Điều kiện thu hồi Premium (đủ **cả ba**): tồn tại subscription của user **và**
  `status == 'active'` **và** `current_period_end > now`. Khi đó set
  `status='cancelled'`, `cancelled_at=now`, `cancelled_by_user_id=<admin>`,
  `cancel_reason = "Refund of order <invoice_number>: <reason>"`, rồi
  `UPDATE users SET role='user' WHERE id = :user_id AND role = 'premium'` — điều kiện
  `role='premium'` bảo đảm **không bao giờ** hạ cấp một `admin`.
- ⚠️ Thu hồi là **toàn bộ subscription**, không trừ đúng số ngày mà đơn đó đã cộng. Nếu user
  mua 3 đơn nối nhau và bạn hoàn đơn đầu, họ mất luôn phần thời gian của 2 đơn còn lại. Hành
  vi thật, phải giữ; hãy cảnh báo trên UI.
- `paid_at` và `grant_type` **không** bị xoá khi refund — dấu vết "đơn này từng thu tiền" vẫn còn.
- `refunded` là ngõ cụt (xem ch.21). Gọi refund lần 2 → 400.
- ⚠️ `RefundRequest.reason` **không giới hạn độ dài** ở tầng schema, nhưng
  `premium_subscriptions.cancel_reason` là `VARCHAR(1000)` và `cancel_reason` được ghép thêm
  tiền tố `"Refund of order <invoice>: "` (~30 ký tự); `admin_audit_log.note` cũng là
  `VARCHAR(1000)`. `reason` dài hơn ~970 ký tự sẽ làm Postgres ném lỗi → 500. Bản TS **nên**
  thêm `MaxLength(900)` và ghi rõ đây là siết chặt có chủ ý.

---

## Nhóm B — Subscription

### GET /api/v1/admin/subscriptions

> **Danh sách subscription** — mỗi user tối đa 1 dòng (`UNIQUE(user_id)`), nên bảng này thực
> chất là "danh sách người dùng có/từng có Premium".

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions` LEFT JOIN `premium_plans` (qua `current_plan_id`) + LEFT JOIN `users` |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | int | không | `1` | `>= 1` | Trang, 1-based |
| `page_size` | int | không | `20` | `1..200` | Số dòng mỗi trang |
| `status` | string \| null | không | `null` | **không validate enum** | `status = ?` (`active`/`expired`/`cancelled`) |
| `plan_id` | uuid \| null | không | `null` | uuid hợp lệ | So với **`current_plan_id`** |
| `user_id` | uuid \| null | không | `null` | uuid hợp lệ | Lọc theo user |
| `expiring_within_days` | int \| null | không | `null` | `>= 1` | Thêm **2** điều kiện: `status = 'active'` **AND** `current_period_end < now + N ngày` |

**Sắp xếp mặc định (và duy nhất):** `ORDER BY premium_subscriptions.created_at DESC` —
tức theo **ngày tạo subscription**, không phải theo ngày hết hạn. Không có tham số `sort`.

**Request body**

—

**Response 200**

~~~ts
type ListAdminSubscriptionsResponse = PaginatedResponse<AdminSubscriptionBrief>;
~~~

~~~json
{
  "items": [
    {
      "id": "7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73",
      "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
      "user_email": "nguyen.thi.mai@gmail.com",
      "current_plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
      "plan_name": "Premium 3 tháng",
      "plan_code": "PREMIUM_3M",
      "current_period_start": "2026-08-17T03:42:11.204881+00:00",
      "current_period_end": "2026-11-15T03:42:11.204881+00:00",
      "status": "active",
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-08-17T03:42:11.210553+00:00"
    },
    {
      "id": "c8f1a406-92d5-4e37-b1c0-6a4d8e2f7b59",
      "user_id": "b7d3f018-42e9-4c1a-9de6-3a5b7c9e0f11",
      "user_email": "tran.van.hung@gmail.com",
      "current_plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
      "plan_name": "Premium 1 tháng",
      "plan_code": "PREMIUM_1M",
      "current_period_start": "2026-07-19T08:15:02.441007+00:00",
      "current_period_end": "2026-08-18T08:15:02.441007+00:00",
      "status": "active",
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-06-19T08:15:02.447712+00:00"
    },
    {
      "id": "1f5b8c73-40e2-4d96-a7b1-3c8d0e6f9a24",
      "user_id": "5e91b204-8c37-4f6d-b0a2-71d8e3c9f460",
      "user_email": "le.minh.chau@iqx.vn",
      "current_plan_id": null,
      "plan_name": null,
      "plan_code": null,
      "current_period_start": "2026-05-02T01:20:44.118293+00:00",
      "current_period_end": "2026-06-01T01:20:44.118293+00:00",
      "status": "expired",
      "cancelled_at": null,
      "cancel_reason": null,
      "created_at": "2026-05-02T01:20:44.125008+00:00"
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `page < 1`, `page_size > 200`, `expiring_within_days < 1`, uuid sai | mảng `detail` |

**Fallback / suy giảm**

Không khớp dòng nào → `items: []`, `total: 0`, `total_pages: 0` (HTTP 200). `current_plan_id`
= `null` khi gói bị xoá (FK `ondelete SET NULL`) — khi đó `plan_name`/`plan_code` cũng `null`
nhưng subscription vẫn hoạt động bình thường.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/subscriptions?page=1&page_size=50&status=active&expiring_within_days=7' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- ⚠️ `expiring_within_days` **không có biên dưới**: điều kiện chỉ là
  `current_period_end < now + N ngày`, nên các subscription `status='active'` mà hạn **đã qua**
  (chưa kịp bị job `expiry_sweep` quét) cũng xuất hiện trong kết quả. Nếu UI hiển thị "sắp
  hết hạn trong 7 ngày" thì phải tự lọc thêm `current_period_end >= now`, hoặc chấp nhận có
  dòng âm ngày. Đừng "sửa" ở backend nếu muốn port 1:1.
- `expiring_within_days` **ép** `status = 'active'`. Gửi kèm `status=expired` →
  hai điều kiện xung đột → luôn 0 kết quả.
- `plan_id` lọc theo `current_plan_id`, tức **gói hiện tại**. Đổi gói ghi đè cột này, nên
  không có cách lọc "từng mua gói X" ở endpoint này — dùng `/admin/payments?plan_id=`.
- `total_pages = ceil(total / page_size)`, `= 0` khi `total = 0` (giống mọi list khác).
- `current_period_start` / `current_period_end` là `NOT NULL`, luôn có giá trị.

---

### GET /api/v1/admin/subscriptions/{sub_id}

> **Chi tiết subscription** — như một dòng trong list nhưng thêm `updated_at` và
> `cancelled_by_user_id` (ai đã huỷ).

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions` LEFT JOIN `premium_plans` + `users` (1 truy vấn) |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `sub_id` | uuid | uuid hợp lệ | `premium_subscriptions.id` |

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetAdminSubscriptionResponse = AdminSubscriptionDetail;
~~~

~~~json
{
  "id": "7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73",
  "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
  "user_email": "nguyen.thi.mai@gmail.com",
  "current_plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
  "plan_name": "Premium 3 tháng",
  "plan_code": "PREMIUM_3M",
  "current_period_start": "2026-08-17T03:42:11.204881+00:00",
  "current_period_end": "2026-11-15T03:42:11.204881+00:00",
  "status": "active",
  "cancelled_at": null,
  "cancel_reason": null,
  "created_at": "2026-08-17T03:42:11.210553+00:00",
  "updated_at": "2026-08-17T03:42:11.210553+00:00",
  "cancelled_by_user_id": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có subscription `sub_id` | `Không tìm thấy subscription` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `sub_id` không phải uuid | mảng `detail` |

**Fallback / suy giảm**

Không có nhánh suy giảm — hoặc 200 với đủ trường, hoặc 404. `user_email` = `null` nếu user đã
bị xoá (LEFT JOIN).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/subscriptions/7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- Truy vấn dùng `.one_or_none()` trên tuple `(subscription, plan_name, plan_code, user_email)`
  → `null` → 404 `Không tìm thấy subscription`. Vì các JOIN đều là LEFT nên không có nguy cơ
  404 sai do thiếu plan/user.
- `cancelled_by_user_id` là **admin đã bấm huỷ** (`AuditContext.admin_id`), không phải
  chủ subscription. FK `users.id ondelete SET NULL`.
- 3 endpoint POST của nhóm B đều gọi lại `get(sub_id)` để dựng response — dùng chung một hàm.

---

### GET /api/v1/admin/users/{user_id}/subscriptions/history

> **Lịch sử subscription của một user** — mảng phẳng, mới nhất trước, **bao gồm** cả
> subscription đã hết hạn và đã bị huỷ.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions WHERE user_id = ?` LEFT JOIN `premium_plans` + `users` |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | uuid | uuid hợp lệ | `users.id`. **Không** kiểm tra user có tồn tại |

**Query params**

— (không phân trang, không filter, không giới hạn số dòng)

**Request body**

—

**Response 200**

~~~ts
type UserSubscriptionHistoryResponse = AdminSubscriptionDetail[];
~~~

~~~json
[
  {
    "id": "c8f1a406-92d5-4e37-b1c0-6a4d8e2f7b59",
    "user_id": "b7d3f018-42e9-4c1a-9de6-3a5b7c9e0f11",
    "user_email": "tran.van.hung@gmail.com",
    "current_plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
    "plan_name": "Premium 1 tháng",
    "plan_code": "PREMIUM_1M",
    "current_period_start": "2026-07-19T08:15:02.441007+00:00",
    "current_period_end": "2026-09-16T14:22:36.918440+00:00",
    "status": "active",
    "cancelled_at": "2026-08-02T10:31:19.664201+00:00",
    "cancel_reason": "Khách yêu cầu tạm dừng, sau đó mua lại ngày 17/08",
    "created_at": "2026-06-19T08:15:02.447712+00:00",
    "updated_at": "2026-08-17T14:22:36.918440+00:00",
    "cancelled_by_user_id": "0a3c7e91-52d8-4b06-9f14-8c2e5d7a1b30"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `user_id` không phải uuid | mảng `detail` |

**Fallback / suy giảm**

User không tồn tại, hoặc tồn tại nhưng chưa từng có Premium → **`[]` với HTTP 200**, KHÔNG
404. Endpoint không tra bảng `users` để xác thực `user_id`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/users/b7d3f018-42e9-4c1a-9de6-3a5b7c9e0f11/subscriptions/history' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- **Thứ tự**: `ORDER BY created_at DESC` (mới nhất trước).
- **Không lọc theo `status`** → mảng chứa cả `expired` và `cancelled`. Đó là ý đồ: đây là
  "lịch sử", không phải "đang hiệu lực".
- ⚠️ Vì `premium_subscriptions` có `UNIQUE(user_id)` và **dòng không bao giờ bị xoá**, mảng
  này thực tế luôn có **0 hoặc 1** phần tử. Nó trả `list` để về sau còn chỗ cho bảng lịch sử
  thật. Bản TS phải giữ kiểu mảng (frontend đang map qua mảng) nhưng đừng xây UI timeline
  nhiều dòng — sẽ luôn chỉ có 1 dòng.
- Vì cùng lý do trên, `cancelled_at` + `status='active'` **có thể cùng xuất hiện** (như ví dụ
  trên): subscription từng bị huỷ rồi được `mark-paid`/IPN/`extend` bật lại `active`, còn
  `cancelled_at`/`cancel_reason` **không được xoá**. Đừng suy `status` từ `cancelled_at`.
- Không phân trang và không `LIMIT`: an toàn hôm nay (≤1 dòng), nhưng nếu port sang schema có
  bảng lịch sử thật thì phải thêm `LIMIT`.
- Path này nằm trong `admin_subscriptions.py` (router không prefix), **không** phải trong
  module admin users.

---

### POST /api/v1/admin/subscriptions/{sub_id}/cancel

> **Huỷ subscription** — đánh dấu `cancelled` **ngay lập tức** và hạ `users.role`, nhưng
> **không** rút ngắn `current_period_end`.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions` + `users` |
| **Side-effect** | `status → cancelled`, set `cancelled_at`/`cancelled_by_user_id`/`cancel_reason`; hạ `users.role` nếu còn hạn; **1 audit row** `subscription.cancel` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `sub_id` | uuid | uuid hợp lệ | Subscription cần huỷ |

**Query params**

—

**Request body**

~~~ts
type CancelSubscriptionBody = CancelSubscriptionRequest;   // { reason: string }
~~~

~~~json
{
  "reason": "Khách yêu cầu ngừng gia hạn qua ticket #4821 ngày 17/08/2026"
}
~~~

**Response 200**

~~~ts
type CancelSubscriptionResponse = AdminSubscriptionDetail;
~~~

~~~json
{
  "id": "7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73",
  "user_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92",
  "user_email": "nguyen.thi.mai@gmail.com",
  "current_plan_id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
  "plan_name": "Premium 3 tháng",
  "plan_code": "PREMIUM_3M",
  "current_period_start": "2026-08-17T03:42:11.204881+00:00",
  "current_period_end": "2026-11-15T03:42:11.204881+00:00",
  "status": "cancelled",
  "cancelled_at": "2026-08-17T16:04:52.771903+00:00",
  "cancel_reason": "Khách yêu cầu ngừng gia hạn qua ticket #4821 ngày 17/08/2026",
  "created_at": "2026-08-17T03:42:11.210553+00:00",
  "updated_at": "2026-08-17T16:04:52.771903+00:00",
  "cancelled_by_user_id": "0a3c7e91-52d8-4b06-9f14-8c2e5d7a1b30"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có subscription `sub_id` | `Không tìm thấy subscription` |
| 400 | `BAD_REQUEST` | `status` đã là `cancelled` | `Subscription đã ở trạng thái CANCELLED` |
| 422 | — | Thiếu `reason` | mảng `detail` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

Subscription đang `expired` → **vẫn huỷ được** (chỉ chặn khi đã `cancelled`): `status` thành
`cancelled`, nhưng **không** hạ role vì `current_period_end <= now`. User đang là `admin` →
huỷ subscription thành công nhưng role giữ `admin`
(test `test_cancel_admin_role_not_downgraded`).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/subscriptions/7d2e9f04-3b16-4a58-9c0d-2e5f8a1b6c73/cancel' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Khách yêu cầu ngừng gia hạn qua ticket #4821 ngày 17/08/2026"}'
~~~

**Ghi chú khi viết lại**

- **Audit**: `action = "subscription.cancel"` — **KHÔNG có tiền tố `premium.`** (khác với
  action `premium.subscription.cancel` mà `refund` ghi). `target_entity = "subscription"`,
  `target_id = str(sub.id)`, `before = {"status": <trạng thái cũ: "active" | "expired">}`,
  `after = {"status": "cancelled"}`, `note = reason`.
- **Huỷ NGAY, không huỷ cuối kỳ.** `status` đổi tức thì; `current_period_end` **giữ nguyên**,
  không bị kéo về `now`.
- Các cột được ghi: `status='cancelled'`, `cancelled_at = now` (UTC),
  `cancelled_by_user_id = AuditContext.admin_id` (**admin bấm nút**, không phải chủ
  subscription), `cancel_reason = reason` (cột `VARCHAR(1000)`; body không giới hạn độ dài →
  nên thêm `MaxLength(1000)` khi port).
- Hạ role **chỉ khi** `current_period_end > now`, bằng
  `UPDATE users SET role='user' WHERE id = :user_id AND role = 'premium'` — điều kiện
  `role='premium'` là cách duy nhất bảo vệ `admin`. Giữ nguyên mệnh đề `WHERE` này.
- ⚠️ **User còn Premium tới hết hạn hay không?** Có, ở guard: `is_premium` **chỉ** so
  `current_period_end` với `now` và **không đọc `status`** (xem ch.21 §Vòng đời subscription).
  Nên sau `cancel`, `GET /premium/me` vẫn trả `is_premium: true` (kèm `status: "cancelled"`)
  cho tới `current_period_end`, dù `users.role` đã bị hạ về `user`. Hệ quả: guard dựa trên
  subscription (`get_premium_active_user`) vẫn cho vào, còn bất kỳ chỗ nào đọc thẳng
  `users.role` sẽ chặn. Đây là **mâu thuẫn có thật** trong bản Python — khi port phải quyết
  định giữ nguyên (an toàn cho frontend hiện tại) hay thống nhất, và ghi lại lựa chọn đó.
- Không idempotent: gọi lần 2 → 400.

---

### POST /api/v1/admin/subscriptions/{sub_id}/extend

> **Gia hạn thêm N ngày** — cộng thẳng vào `current_period_end` hiện có; nếu nhờ đó hạn vượt
> `now` thì bật lại `active` và nâng role.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions` + `users` |
| **Side-effect** | `current_period_end += days`; có thể `expired/cancelled → active` + nâng `users.role` lên `premium`; **1 audit row** `subscription.extend` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `sub_id` | uuid | uuid hợp lệ | Subscription cần gia hạn (**mọi** trạng thái đều được) |

**Query params**

—

**Request body**

~~~ts
type ExtendSubscriptionBody = ExtendSubscriptionRequest;   // { days: number; reason?: string | null }
~~~

~~~json
{
  "days": 30,
  "reason": "Bù 30 ngày do sự cố mất dữ liệu tín hiệu 15-16/08/2026"
}
~~~

**Response 200**

~~~ts
type ExtendSubscriptionResponse = AdminSubscriptionDetail;
~~~

~~~json
{
  "id": "1f5b8c73-40e2-4d96-a7b1-3c8d0e6f9a24",
  "user_id": "5e91b204-8c37-4f6d-b0a2-71d8e3c9f460",
  "user_email": "le.minh.chau@iqx.vn",
  "current_plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
  "plan_name": "Premium 1 tháng",
  "plan_code": "PREMIUM_1M",
  "current_period_start": "2026-08-01T01:20:44.118293+00:00",
  "current_period_end": "2026-09-30T01:20:44.118293+00:00",
  "status": "active",
  "cancelled_at": null,
  "cancel_reason": null,
  "created_at": "2026-05-02T01:20:44.125008+00:00",
  "updated_at": "2026-08-17T16:39:10.552817+00:00",
  "cancelled_by_user_id": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có subscription `sub_id` | `Không tìm thấy subscription` |
| 422 | — | Thiếu `days`, `days <= 0`, `days` không phải int | mảng `detail` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

Không có 400 nào: **không** có điều kiện tiền quyết về trạng thái.

**Fallback / suy giảm**

Nếu `current_period_end + days` **vẫn còn trong quá khứ** (gia hạn một subscription đã hết
hạn quá lâu): hạn được đẩy lên nhưng `status` **giữ nguyên** `expired`, role **không** được
nâng, endpoint vẫn 200. Admin phải gọi thêm cho đủ ngày, hoặc dùng
`POST /premium/admin/users/{user_id}/grant` (ch.21) để mở kỳ mới từ hôm nay.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/subscriptions/1f5b8c73-40e2-4d96-a7b1-3c8d0e6f9a24/extend' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"days":30,"reason":"Bù 30 ngày do sự cố mất dữ liệu tín hiệu 15-16/08/2026"}'
~~~

**Ghi chú khi viết lại**

- ⚠️ **Mốc cộng dồn: LUÔN là `current_period_end` cũ, KHÔNG BAO GIỜ là hôm nay.**
  `new_end = current_period_end + days` — kể cả khi `current_period_end` đã ở quá khứ. Đây là
  điểm **khác** `atomic_extend_period` (dùng bởi IPN / `mark-paid` / `admin grant`), vốn mở kỳ
  mới từ `now` khi đã hết hạn. Hai ngữ nghĩa cùng tồn tại; endpoint này là "cộng bù vào
  sổ", không phải "bán thêm một kỳ".
  - Đang còn hạn (hết 15/11, cộng 30) → hạn mới 15/12, `current_period_start` **không đổi**.
  - Đã hết hạn 78 ngày, cộng 30 → hạn mới **vẫn** ở quá khứ → giữ `expired`.
- Điều kiện bật `active`: `was_expired = (status == 'expired' OR current_period_end <= now)`
  **và** `new_end > now`. Khi đó `status = 'active'` **và**
  `UPDATE users SET role='premium' WHERE id = :user_id AND role = 'user'` — mệnh đề
  `role='user'` bảo đảm không ghi đè `admin`.
- ⚠️ Subscription `cancelled` mà hạn **còn hiệu lực**: `was_expired = false` → chỉ đẩy
  `current_period_end`, `status` **vẫn là `cancelled`** (khớp sơ đồ ch.21). Kết hợp với việc
  `is_premium` bỏ qua `status`, user đó tiếp tục dùng Premium dài thêm mà vẫn hiện "đã huỷ".
- **Audit**: `action = "subscription.extend"` (không tiền tố `premium.`),
  `target_entity = "subscription"`, `target_id = str(sub.id)`,
  `before = {"status": <cũ>, "current_period_end": "<str(datetime) cũ>"}`,
  `after = {"status": <mới>, "current_period_end": "<str(datetime) mới>", "days_added": days}`,
  `note = reason` (có thể `null`).
  ⚠️ Hai mốc thời gian trong payload dùng `str(datetime)` của Python →
  `"2026-09-30 01:20:44.118293+00:00"` (**dấu cách**, không phải `T` của ISO-8601). Nếu bản TS
  ghi ISO thì UI đọc audit cũ/mới sẽ khác định dạng — cân nhắc và ghi rõ lựa chọn.
- ⚠️ `days` **không có trần**: `{"days": 36500}` là hợp lệ và cấp 100 năm Premium. Bản TS nên
  đặt trần (ví dụ ≤ 3650) và coi đó là siết chặt có chủ ý.
- `current_plan_id` **không** đổi khi extend — vẫn là gói cũ, kể cả khi cộng bù không liên
  quan gói nào.

---

## Nhóm C — IPN log

### GET /api/v1/admin/ipn

> **Danh sách IPN log** — sổ nhật ký mọi callback SePay từng gửi tới, kể cả callback sai
> secret key; `raw_body`/`raw_headers` bị lược khỏi danh sách.

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `sepay_ipn_logs` (không JOIN) |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | int | không | `1` | `>= 1` | Trang, 1-based |
| `page_size` | int | không | `20` | `1..200` | Số dòng mỗi trang |
| `secret_key_valid` | boolean \| null | không | `null` | `true`/`false` | `secret_key_valid IS ?`. Gửi `false` để soi callback nghi vấn |
| `result_status` | string \| null | không | `null` | **không validate enum** | So sánh đúng bằng: `result_status = ?` |
| `date_from` | date-time \| null | không | `null` | ISO-8601 | `received_at >= date_from` (**bao gồm**) |
| `date_to` | date-time \| null | không | `null` | ISO-8601 | `received_at < date_to` (**loại trừ**) |
| `search` | string \| null | không | `null` | — | `sepay_transaction_id ILIKE '%s%'` **OR** `result_status ILIKE '%s%'` |

**Sắp xếp mặc định (và duy nhất):** `ORDER BY received_at DESC`.

**Request body**

—

**Response 200**

~~~ts
type ListIpnLogsResponse = PaginatedResponse<SePayIpnLogResponse>;
// Trong nhánh list, raw_body và raw_headers LUÔN có mặt với giá trị null.
~~~

~~~json
{
  "items": [
    {
      "id": "a1c7e390-4d52-4b8f-9016-3c8e7f2d5b41",
      "received_at": "2026-08-17T03:42:10.882317+00:00",
      "secret_key_valid": true,
      "result_status": "processed",
      "matched_order_id": "9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45",
      "sepay_transaction_id": "SP2608170342117745",
      "error_message": null,
      "raw_body": null,
      "raw_headers": null
    },
    {
      "id": "d3f80b16-7a94-4e25-b8c1-05e6f9a2d374",
      "received_at": "2026-08-17T02:58:44.019662+00:00",
      "secret_key_valid": true,
      "result_status": "amount_mismatch",
      "matched_order_id": null,
      "sepay_transaction_id": "SP2608170258441120",
      "error_message": null,
      "raw_body": null,
      "raw_headers": null
    },
    {
      "id": "62b4e97c-1d50-42a8-9f36-8c0d3e5b7a19",
      "received_at": "2026-08-16T23:07:12.443508+00:00",
      "secret_key_valid": false,
      "result_status": "secret_invalid",
      "matched_order_id": null,
      "sepay_transaction_id": null,
      "error_message": null,
      "raw_body": null,
      "raw_headers": null
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `page < 1`, `page_size > 200`, `secret_key_valid` không phải bool, `date_*` sai | mảng `detail` |

**Fallback / suy giảm**

Không khớp dòng nào → `items: []`, `total: 0`, `total_pages: 0` (HTTP 200).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/ipn?page=1&page_size=50&secret_key_valid=false&date_from=2026-08-16T00:00:00Z&date_to=2026-08-18T00:00:00Z' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- `raw_body`/`raw_headers` **không được truyền** khi dựng item ở nhánh list, nhưng vì schema
  khai `dict | None = None` nên Pydantic **vẫn xuất hai khoá với giá trị `null`**. Test khoá
  hành vi bằng `"raw_body" not in item or item["raw_body"] is None` → bản TS xuất `null` hoặc
  bỏ hẳn khoá đều chấp nhận được; **an toàn nhất là xuất `null`**. Điều bắt buộc: **không**
  được trả nội dung thật ở list (payload có số thẻ đã mask, IP, user-agent).
- `result_status` là `VARCHAR(60)` tự do. Giá trị thực tế: các `SePayIpnResultMessage` của
  ch.21 (`processed`, `ignored`, `already_processed`, `order_not_found`, `amount_mismatch`,
  `amount_invalid`, `currency_mismatch`), cộng thêm `secret_invalid` (ghi khi header
  `X-Secret-Key` sai) và `retried` (fallback của endpoint retry). **Không** validate enum.
- `search` **không** tìm theo `invoice_number` (cột đó không có trong bảng — nó nằm trong
  `raw_body` JSON). Muốn tra theo mã đơn thì đi từ `GET /admin/payments?search=IQX_...` rồi
  mở chi tiết đơn để đọc `ipn_logs`.
- Bảng này **append-only**: app code không có UPDATE/DELETE. Retry **thêm dòng mới** thay vì
  sửa dòng cũ. Giữ đúng tính chất đó.
- Có index sẵn cho `received_at`, `secret_key_valid`, `result_status`, `matched_order_id`,
  `sepay_transaction_id`, và index tổ hợp `(received_at, result_status)`.

---

### GET /api/v1/admin/ipn/{log_id}

> **Chi tiết IPN log** — bản duy nhất trả `raw_body` (payload SePay nguyên văn) và
> `raw_headers` (đã redact secret).

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `sepay_ipn_logs` (1 truy vấn theo PK) |
| **Side-effect** | — (GET, không ghi audit) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `log_id` | uuid | uuid hợp lệ | `sepay_ipn_logs.id` |

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetIpnLogResponse = SePayIpnLogResponse;   // raw_body + raw_headers có nội dung thật
~~~

~~~json
{
  "id": "a1c7e390-4d52-4b8f-9016-3c8e7f2d5b41",
  "received_at": "2026-08-17T03:42:10.882317+00:00",
  "secret_key_valid": true,
  "result_status": "processed",
  "matched_order_id": "9f14c2d8-6b03-4a71-8e52-1d7c9a0b3e45",
  "sepay_transaction_id": "SP2608170342117745",
  "error_message": null,
  "raw_body": {
    "timestamp": 1786412530,
    "notification_type": "ORDER_PAID",
    "order": {
      "order_status": "CAPTURED",
      "order_currency": "VND",
      "order_amount": "299000",
      "order_invoice_number": "IQX_7A3F9C2D1E4B",
      "order_description": "IQX Premium 3 thang",
      "ip_address": "113.161.74.22"
    },
    "transaction": {
      "transaction_id": "SP2608170342117745",
      "payment_method": "BANK_TRANSFER",
      "transaction_status": "APPROVED",
      "transaction_amount": "299000",
      "transaction_currency": "VND",
      "transaction_date": "2026-08-17 10:42:09"
    },
    "customer": {
      "customer_id": "2c5b8e10-77af-4d63-9b21-0e4f6a8c1d92"
    }
  },
  "raw_headers": {
    "host": "api.iqx.vn",
    "content-type": "application/json",
    "user-agent": "SePay-Webhook/1.0",
    "x-secret-key": "***"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có log `log_id` | `Không tìm thấy IPN log` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `log_id` không phải uuid | mảng `detail` |

**Fallback / suy giảm**

`raw_body` = `null` khi body gửi tới không parse được thành JSON (log vẫn được ghi để giữ dấu
vết). Trường hợp đó `POST /retry` sẽ ném 400 `Không có raw_body để retry`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/admin/ipn/a1c7e390-4d52-4b8f-9016-3c8e7f2d5b41' \
  -H "Authorization: Bearer $TOKEN"
~~~

**Ghi chú khi viết lại**

- `raw_headers` đã được redact **lúc ghi**, không phải lúc đọc: các header
  `x-secret-key`, `authorization`, `cookie`, `set-cookie` (so sánh **lowercase**) bị thay bằng
  `"***"`. Endpoint đọc chỉ trả nguyên những gì đã lưu. Bản TS phải redact **ở tầng ghi**, nếu
  không log cũ và log mới sẽ khác nhau về mức an toàn.
- `raw_body` là cột `JSON` (migration dùng `JSONB` trên Postgres) — trả nguyên object, đừng
  bọc `JSON.stringify`.
- Đây là endpoint duy nhất phơi payload thanh toán thô; nếu hệ thống có phân quyền admin nhỏ
  hơn thì đây là chỗ đầu tiên nên siết.

---

### POST /api/v1/admin/ipn/{log_id}/retry

> **Phát lại một IPN log** — nạp `raw_body` đã lưu vào đúng pipeline `process_ipn`, dùng khi
> lần xử lý đầu thất bại vì lỗi tạm (đơn chưa kịp tạo, DB lỗi, gói bị sửa…).

| | |
|---|---|
| **Quyền** | Bearer + `role == 'admin'` |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `sepay_ipn_logs` → `process_ipn` (đọc/ghi `premium_payment_orders`, `premium_subscriptions`, `users`) |
| **Side-effect** | Có thể `pending → paid` + gia hạn subscription + nâng role; **luôn** INSERT 1 dòng `sepay_ipn_logs` mới; **1 audit row** `premium.ipn.retry` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `log_id` | uuid | uuid hợp lệ | Log **gốc** cần phát lại |

**Query params**

—

**Request body**

— (không có body; POST rỗng)

**Response 200**

~~~ts
type RetryIpnLogResponse = IpnRetryResponse;
~~~

~~~json
{
  "status": "processed",
  "log_id": "f47b2e08-93c1-4a56-b0d7-2e8f5a1c6b34",
  "message": "IPN retry completed: {'success': 'true', 'message': 'processed'}"
}
~~~

~~~json
{
  "status": "already_processed",
  "log_id": "8c0e5a72-41b9-4d38-96f1-7a2d3e8b5c06",
  "message": "IPN retry completed: {'success': 'true', 'message': 'already_processed'}"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có log `log_id` | `Không tìm thấy IPN log` |
| 400 | `BAD_REQUEST` | `secret_key_valid = false` | `Không thể retry: secret key không hợp lệ` |
| 400 | `BAD_REQUEST` | `result_status == "processed"` (so sánh **đúng bằng**, phân biệt chữ) | `IPN log này đã được xử lý thành công` |
| 400 | `BAD_REQUEST` | `raw_body` rỗng/`null` | `Không có raw_body để retry` |
| 400 | `BAD_REQUEST` | `raw_body` không parse được thành `SePayIpnPayload` | `Không thể parse raw_body: <thông điệp lỗi Pydantic>` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

`process_ipn` **không ném lỗi** cho payload không đủ điều kiện — nó trả `message` mô tả
(`ignored`, `order_not_found`, `amount_mismatch`, `amount_invalid`, `currency_mismatch`,
`already_processed`). Mọi trường hợp đó vẫn là **HTTP 200**, chỉ khác `status` trong body, và
**vẫn** tạo 1 log mới + 1 audit row. Nghĩa là: 200 **không** đồng nghĩa "đã kích hoạt Premium"
— phải đọc `status == "processed"`.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/admin/ipn/d3f80b16-7a94-4e25-b8c1-05e6f9a2d374/retry' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Length: 0'
~~~

**Ghi chú khi viết lại**

- **Replay bản ghi nào?** Đúng `raw_body` của log `log_id`, parse lại thành `SePayIpnPayload`
  rồi gọi `PremiumService.process_ipn(payload)` — **cùng** hàm mà webhook công khai dùng.
  Không có nhánh xử lý riêng, nên mọi kiểm tra của ch.21 (`ORDER_PAID`, `CAPTURED`,
  `APPROVED`, `VND`, khớp số tiền, khớp `invoice_number`, atomic claim) đều được áp lại.
- **Log mới** được INSERT với: `secret_key_valid = true` (**hard-code**, không kiểm lại
  header — đã chặn ở guard đầu), `raw_body`/`raw_headers` copy từ log gốc,
  `result_status = result["message"]` (fallback `"retried"`),
  `matched_order_id` và `sepay_transaction_id` copy từ log gốc. Log **gốc không bị sửa**
  (bảng append-only).
- **Audit**: `action = "premium.ipn.retry"`, `target_entity = "sepay_ipn_log"`,
  `target_id = str(log_id)` — **id của log GỐC**, `payload_before = null`,
  `payload_after = {"retry_log_id": "<id log mới>", "result": {"success": "true",
  "message": "processed"}}`, `note = null`.
- ⚠️ `log_id` trong **response** là id của **log mới vừa tạo**, không phải `log_id` trong
  path. Đặt tên rõ (`retry_log_id`) trong client TS để tránh nhầm.
- ⚠️ `message` được dựng bằng `f"IPN retry completed: {result}"` → **repr dict Python** với
  dấu nháy đơn: `IPN retry completed: {'success': 'true', 'message': 'processed'}`. Không phải
  JSON hợp lệ, **đừng parse**. Bản TS nên đổi sang JSON và coi đây là thay đổi có chủ ý (chuỗi
  này chỉ để người đọc).
- **Có an toàn khi gọi nhiều lần?** *An toàn về tiền*: `process_ipn` chốt bằng UPDATE có điều
  kiện `WHERE invoice_number = ? AND status='pending'`, nên lần thứ hai chỉ nhận
  `already_processed`, subscription **không** được gia hạn thêm. *Không sạch về dữ liệu*: mỗi
  lần gọi vẫn thêm 1 dòng `sepay_ipn_logs` và 1 dòng `admin_audit_log`.
- ⚠️ **Đơn đã paid thì sao?** `process_ipn` phát hiện qua hai cửa: trùng
  `sepay_transaction_id` với một đơn đã `paid`, hoặc `local_order.status == 'paid'` → trả
  `already_processed`, **không** gia hạn. Nhưng guard của endpoint chỉ xét `result_status` của
  **log gốc**, mà log gốc không bao giờ được cập nhật → **có thể retry cùng một log vô số
  lần**, mỗi lần trả `already_processed` và sinh thêm 2 dòng rác. Nếu port muốn siết, hãy chặn
  khi `matched_order_id` trỏ tới đơn đã `paid`/`refunded` — và ghi rõ đó là thay đổi hành vi.
- Endpoint **không** kiểm tra `matched_order_id` có khớp `raw_body.order.order_invoice_number`
  hay không; việc tìm đơn hoàn toàn do `process_ipn` làm lại từ `invoice_number` trong payload.

---

## Bảng tra action audit log

Mọi endpoint ghi-dữ-liệu ở chương này đều nhận `AuditCtx` (dep `get_audit_context`) và gọi
`AdminAuditService.record(...)`. Bảng này là **bản tra chuẩn** để bản TS ghi đúng chỗ, đúng
tên chuỗi. 5 GET endpoint (`/admin/payments`, `/admin/payments/{id}`,
`/admin/subscriptions`, `/admin/subscriptions/{id}`, `.../subscriptions/history`,
`/admin/ipn`, `/admin/ipn/{id}`) **không ghi audit**.

| Endpoint | `action` | `target_entity` | `target_id` | `payload_before` | `payload_after` | `note` | Số row |
|---|---|---|---|---|---|---|---|
| POST `/admin/payments/{id}/mark-paid` | `premium.order.mark_paid` | `payment_order` | `order.id` | `{"status":"pending"}` | `{"status":"paid","grant_type":"admin_confirmed"}` | `body.note` (đã trim, bắt buộc) | 1 |
| POST `/admin/payments/{id}/reconcile` — khớp IPN | `premium.order.reconcile` | `payment_order` | `order.id` | `{"status":"pending"}` | `{"status":"paid"}` | `body.note` \| `null` | 1 |
| POST `/admin/payments/{id}/reconcile` — không khớp | `premium.order.reconcile` | `payment_order` | `order.id` | `{"status":"pending"}` | `{"status":"no_match"}` | `body.note` \| `null` | 1 |
| POST `/admin/payments/{id}/refund` — luôn có | `premium.order.refund` | `payment_order` | `order.id` | `{"status":"paid"}` | `{"status":"refunded"}` | `body.reason` | 1 |
| POST `/admin/payments/{id}/refund` — kèm huỷ sub | `premium.subscription.cancel` | `subscription` | `sub.id` | `{"status":"active"}` | `{"status":"cancelled"}` | `"Cancelled due to refund of order <invoice_number>"` | 0 hoặc 1 |
| POST `/admin/subscriptions/{id}/cancel` | `subscription.cancel` | `subscription` | `sub.id` | `{"status":"<active\|expired>"}` | `{"status":"cancelled"}` | `body.reason` | 1 |
| POST `/admin/subscriptions/{id}/extend` | `subscription.extend` | `subscription` | `sub.id` | `{"status":"<cũ>","current_period_end":"<str(datetime) cũ>"}` | `{"status":"<mới>","current_period_end":"<str(datetime) mới>","days_added":<int>}` | `body.reason` \| `null` | 1 |
| POST `/admin/ipn/{id}/retry` | `premium.ipn.retry` | `sepay_ipn_log` | `log_id` **gốc** | `null` | `{"retry_log_id":"<uuid log mới>","result":{"success":"true","message":"<...>"}}` | `null` | 1 |

**Bốn cái bẫy đặt tên phải giữ nguyên**

1. Nhóm đơn dùng tiền tố `premium.order.*`; nhóm subscription dùng `subscription.*`
   **không** tiền tố — trừ đúng một ngoại lệ: cascade trong `refund` ghi
   `premium.subscription.cancel`. Vậy **huỷ subscription có 2 tên action khác nhau** tuỳ đường
   vào (`subscription.cancel` khi admin bấm cancel, `premium.subscription.cancel` khi cascade
   từ refund). Đây là bug đặt tên đã đi vào dữ liệu prod — báo cáo audit đang lọc theo cả hai.
2. `premium.order.mark_paid` dùng **underscore**, còn path là `mark-paid` (**gạch nối**).
3. Nhóm IPN dùng `premium.ipn.retry` với `target_entity = "sepay_ipn_log"` (tên bảng), khác
   quy ước `payment_order`/`subscription` (tên khái niệm).
4. Job nền ghi audit với `admin_user_id = NULL`: `system.expiry_sweep` (mỗi 1h) và
   `system.ipn_reconcile_scan` (mỗi 6h). Hai action đó **không** thuộc 13 endpoint này nhưng
   xuất hiện chung bảng — dashboard phải chịu được `admin_user_id` null.

**Các cột `admin_audit_log` được lấp từ `AuditContext`**

| Cột | Nguồn | Kiểu DB |
|---|---|---|
| `admin_user_id` | `admin.id` (user đã xác thực) | uuid, FK `users.id` ondelete SET NULL, nullable |
| `action` | tham số `action` | `VARCHAR(80)` NOT NULL, có index |
| `target_entity` | tham số | `VARCHAR(60)` nullable |
| `target_id` | tham số, **đã `str()`** | `VARCHAR(100)` nullable |
| `payload_before` / `payload_after` | dict → JSON (JSONB trên Postgres) | nullable |
| `note` | tham số | `VARCHAR(1000)` nullable |
| `ip` | `request.client.host` \| `null` | `VARCHAR(45)` |
| `user_agent` | header `user-agent` | `VARCHAR(500)` |
| `request_id` | `request.state.request_id` → header `x-request-id` → `uuid4()` mới | `VARCHAR(40)` |
| `created_at` | `server_default NOW()` | timestamptz, có index |

> `record()` **không bắt exception**: ghi audit lỗi thì cả request lỗi. Giữ nguyên — mất dấu
> vết một thao tác tiền tệ tệ hơn là trả lỗi cho admin. Cũng **không** dùng helper `diff_dict`
> ở 8 chỗ trên: `before`/`after` được truyền tay và lưu nguyên, không lọc khoá thay đổi.

---

## Ghi chú tổng hợp khi viết lại

**1. Tiền là số nguyên đồng VND, không phải Decimal.**
`premium_payment_orders.amount_vnd` và `premium_plans.price_vnd` là `Integer` (SQLAlchemy
`Integer` → `INTEGER` Postgres, **không** `BigInteger`, **không** `Numeric`). VND không có
đơn vị nhỏ hơn đồng nên không cần phần thập phân. Trong TS dùng `number` thẳng; đừng đưa
`decimal.js`/`Prisma.Decimal` vào — sẽ làm mọi so sánh `amount_vnd === order_amount` phải
chuyển kiểu và mở đường cho lỗi làm tròn. Chỗ **duy nhất** dùng `Decimal` là parse chuỗi số
tiền trong payload IPN (`_parse_vnd_amount`, xem ch.21): nhận `.00`, từ chối phần thập phân
khác, từ chối `<= 0`. Lưu ý trần `INTEGER` là 2.147.483.647 đồng (~2,1 tỷ) — đủ cho gói hiện
tại, nhưng nếu bán gói doanh nghiệp thì phải migrate sang `BIGINT`.

**2. Ba tham số phân trang giống nhau ở cả 3 endpoint list.**
`page` (int, `>= 1`, default `1`), `page_size` (int, `1..200`, default `20`), offset tính
`(page - 1) * page_size`. `total_pages = ceil(total / page_size)`, và **`= 0` khi
`total = 0`** (không phải 1). Wrapper luôn echo lại `page`/`page_size` client gửi. Không có
cursor pagination, không có `sort` — sắp xếp cứng: `payments` và `subscriptions` theo
`created_at DESC`, `ipn` theo `received_at DESC`.

**3. Không endpoint nào validate enum cho filter chuỗi.**
`status`, `grant_type`, `result_status` so sánh chuỗi thẳng. Thêm validate enum ở bản TS sẽ
đổi "200 rỗng" thành "422" và làm vỡ UI đang gửi giá trị lạ/rỗng.

**4. Mọi filter khoảng ngày là nửa mở `[date_from, date_to)`.**
Đúng cho cả `/admin/payments` (`created_at`) và `/admin/ipn` (`received_at`).

**5. Bảo vệ role `admin` bằng mệnh đề `WHERE`, không bằng `if`.**
Hạ cấp luôn là `UPDATE users SET role='user' WHERE id = ? AND role = 'premium'`; nâng cấp
trong `extend` là `... SET role='premium' WHERE id = ? AND role = 'user'`. Đừng đổi thành đọc
rồi ghi — mệnh đề `WHERE` chính là thứ giữ cho một admin không bị mất quyền khi subscription
của họ bị huỷ (test `test_cancel_admin_role_not_downgraded`).

**6. `users.role` là bản sao mềm, `current_period_end` là sự thật.**
`is_premium` **chỉ** so `current_period_end` với `now`, bỏ qua `status`. Hệ quả cần nhớ:
subscription `cancelled` mà còn hạn vẫn tính là Premium ở guard, dù `users.role` đã bị hạ.
Xem ch.21 §Vòng đời subscription. Khi port, ghi rõ bạn giữ nguyên mâu thuẫn này hay thống nhất.

**7. Ba đường vào `paid` — ba `grant_type` khác nhau, đừng gộp.**
`payment` (IPN hoặc reconcile), `admin_confirmed` (mark-paid), `admin_grant` (grant, ch.21).
Chuỗi này là cột `VARCHAR(20)` không có CHECK, và bộ lọc `?grant_type=` so sánh thẳng. Nó là
căn cứ đối soát doanh thu: `payment` = có tiền thật vào SePay; `admin_confirmed` = có tiền
thật nhưng chỉ admin xác nhận; `admin_grant` = **không** có tiền (`amount_vnd = 0`).

**8. Định dạng mã đơn.**
`IQX_` + `uuid4().hex[:12].upper()` cho checkout (vd `IQX_7A3F9C2D1E4B`), `GRANT_` + 12 hex
cho admin grant (vd `GRANT_C4D2E8A1F095`). Cột `invoice_number` là `VARCHAR(100)` UNIQUE có
index — nó là khoá khớp IPN, phải sinh đúng format này.

**9. Transaction & commit giữa request.**
`get_db` mở 1 session/request, `commit()` sau khi handler trả về, `rollback()` khi có
exception. NHƯNG `PremiumService._set_user_role_premium()` gọi `session.commit()` **giữa
request**, nên trên đường `mark-paid` và `reconcile` (nhánh khớp), mutation nghiệp vụ đã
commit **trước** khi audit row được ghi. Đây là sai lệch so với lời hứa "audit và mutation
cùng sống hoặc cùng chết" ở ch.21. Bản TS nên bỏ commit giữa request (một transaction bao cả
hai) — và ghi rõ đó là sửa lỗi có chủ ý.

**10. Bốn chỗ thiếu ràng buộc độ dài / phạm vi — nên siết khi port, và ghi lại.**

| Chỗ | Hiện tại | Rủi ro | Đề xuất |
|---|---|---|---|
| `RefundRequest.reason` | không max | ghép vào `cancel_reason VARCHAR(1000)` → 500 | `MaxLength(900)` |
| `CancelSubscriptionRequest.reason` | không max | `cancel_reason VARCHAR(1000)` → 500 | `MaxLength(1000)` |
| `ReconcileRequest.note` | không max | `admin_audit_log.note VARCHAR(1000)` → 500 | `MaxLength(1000)` |
| `ExtendSubscriptionRequest.days` | chỉ `> 0` | `days: 36500` cấp 100 năm Premium | trần ≤ 3650 |

(`MarkPaidRequest.note` đã có `1..1000` + validator chặn chuỗi toàn khoảng trắng — dùng nó làm
khuôn cho 3 field còn lại.)

**11. Hai chỗ nên chống đua tốt hơn bản Python.**
`reconcile` nhánh khớp set trạng thái thẳng qua ORM (không UPDATE có điều kiện) → có thể gia
hạn hai lần nếu IPN tới cùng lúc; `retry` có thể chạy vô hạn trên cùng một log. Cả hai đều
được `claim_pending_order` bảo vệ **một phần** (`process_ipn` thì có, `reconcile` thì không).
Khi port, dùng lại một hàm claim duy nhất cho **cả ba** đường vào `paid`.

**12. Ba response không theo khuôn chung — giữ nguyên vì frontend đã bám vào.**
`reconcile` trả `{status, order_id}` (không có `response_model`, OpenAPI ghi schema rỗng `{}`);
`retry` trả `{status, log_id, message}` với `log_id` là **log mới**; `history` trả **mảng
phẳng** thay vì `PaginatedResponse`. Đừng "chuẩn hoá" ba chỗ này khi port nếu không đồng thời
sửa client.
