# Endpoint — Premium, thanh toán SePay, quản trị đơn & gói

Chương này đặc tả **23 operation** liên quan tới tiền thật: gói Premium (plan), trạng thái
subscription của người dùng, luồng checkout SePay, webhook IPN công khai, và toàn bộ mặt
quản trị (đơn thanh toán, subscription, IPN log). Đây là chương duy nhất trong bộ tài liệu
có thể gây **mất tiền hoặc cấp Premium sai** nếu port lệch, nên mỗi mục đều ghi rõ thứ tự
kiểm tra điều kiện, tính idempotent, và giá trị trả về chính xác của từng nhánh.

Bốn nhóm bảng Postgres liên quan: `premium_plans`, `premium_subscriptions`,
`premium_payment_orders`, `sepay_ipn_logs` (+ `admin_audit_log` cho mọi hành động admin).
Đơn vị tiền **luôn là ĐỒNG (VND) dạng số nguyên** — không có nghìn đồng, không có số thập phân.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/v1/premium/plans` | Công khai | Danh sách gói đang bán (ẩn `TRIAL_7D`) |
| GET | `/api/v1/premium/me` | Bearer | Trạng thái Premium của tôi |
| POST | `/api/v1/premium/checkout` | Bearer | Tạo đơn + form POST sang SePay |
| GET | `/api/v1/premium/my-orders` | Bearer | 20 đơn thanh toán gần nhất của tôi |
| POST | `/api/v1/premium/sepay/ipn` | Công khai (X-Secret-Key) | Webhook SePay báo đã thu tiền |
| GET | `/api/v1/premium/admin/plans` | Bearer + Admin | Liệt kê tất cả gói (kể cả tắt) |
| POST | `/api/v1/premium/admin/plans` | Bearer + Admin | Tạo gói mới |
| PATCH | `/api/v1/premium/admin/plans/{plan_id}` | Bearer + Admin | Sửa gói |
| DELETE | `/api/v1/premium/admin/plans/{plan_id}` | Bearer + Admin | Soft-delete gói (`is_active=false`) |
| POST | `/api/v1/premium/admin/users/{user_id}/grant` | Bearer + Admin | Cấp Premium thủ công (miễn phí) |
| GET | `/api/v1/admin/payments` | Bearer + Admin | Danh sách đơn thanh toán (phân trang) |
| GET | `/api/v1/admin/payments/{order_id}` | Bearer + Admin | Chi tiết đơn + IPN log liên quan |
| POST | `/api/v1/admin/payments/{order_id}/mark-paid` | Bearer + Admin | Xác nhận tay đơn PENDING đã có tiền |
| POST | `/api/v1/admin/payments/{order_id}/reconcile` | Bearer + Admin | Đối soát đơn PENDING >30 phút với IPN log |
| POST | `/api/v1/admin/payments/{order_id}/refund` | Bearer + Admin | Hoàn tiền đơn PAID + thu hồi Premium |
| GET | `/api/v1/admin/subscriptions` | Bearer + Admin | Danh sách subscription (phân trang) |
| GET | `/api/v1/admin/subscriptions/{sub_id}` | Bearer + Admin | Chi tiết subscription |
| POST | `/api/v1/admin/subscriptions/{sub_id}/cancel` | Bearer + Admin | Huỷ subscription |
| POST | `/api/v1/admin/subscriptions/{sub_id}/extend` | Bearer + Admin | Gia hạn thêm N ngày |
| GET | `/api/v1/admin/users/{user_id}/subscriptions/history` | Bearer + Admin | Lịch sử subscription của 1 user |
| GET | `/api/v1/admin/ipn` | Bearer + Admin | Danh sách IPN log (không kèm raw) |
| GET | `/api/v1/admin/ipn/{log_id}` | Bearer + Admin | Chi tiết IPN log (kèm `raw_body`/`raw_headers`) |
| POST | `/api/v1/admin/ipn/{log_id}/retry` | Bearer + Admin | Phát lại 1 IPN log qua `process_ipn` |

**Quy ước chung cả chương**

- Rate limit: **60 request/phút/IP** (`RATE_LIMIT_DEFAULT = "60/minute"`, slowapi
  `SlowAPIMiddleware` áp toàn cục, storage `memory://`). Không endpoint nào trong nhóm này
  có limit riêng — **kể cả webhook IPN** (xem cảnh báo ở mục IPN).
- Cache: **không có endpoint nào trong chương này dùng Redis cache.** Mọi số liệu đọc trực
  tiếp từ Postgres. Đây là chủ ý — dữ liệu tiền không được phục vụ từ cache.
- Mọi phản hồi đều có header `X-Request-ID` (echo lại header client gửi, hoặc UUID4 sinh mới).
- Lỗi domain trả body `{ "detail": string, "code": string }` (xem `ErrorResponse`).
  Lỗi validate của framework trả 422 dạng `{ "detail": [{ loc, msg, type, ... }] }`.
- Transaction: mỗi request là **một** transaction; commit xảy ra ở tầng dependency sau khi
  handler trả về. Audit row và mutation nghiệp vụ **cùng sống hoặc cùng chết**.

---

## Kiểu dữ liệu dùng chung

### Enum trạng thái

~~~ts
/** premium_payment_orders.status — lưu DB dạng chữ thường */
type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

/** premium_subscriptions.status — lưu DB dạng chữ thường */
type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

/**
 * premium_payment_orders.grant_type — vì sao đơn này thành PAID.
 * Cột nullable: đơn PENDING chưa bao giờ được kích hoạt thì grant_type = null.
 */
type PremiumGrantType =
  | 'payment'          // SePay IPN xác nhận (hoặc reconcile khớp IPN log)
  | 'admin_confirmed'  // admin tự kiểm tra tiền về rồi mark-paid
  | 'admin_grant';     // comp/tặng, không có tiền
~~~

> Cột `grant_type` là `VARCHAR(20)` **không phải enum DB** — không có ràng buộc CHECK. Giữ
> nguyên 3 giá trị trên, đừng đổi tên, vì bộ lọc `?grant_type=` của admin so sánh chuỗi thẳng.

### Gói Premium

~~~ts
interface PremiumPlanResponse {
  id: string;                  // uuid
  code: string;                // <=50 ký tự, UNIQUE
  name: string;                // <=200 ký tự
  description: string | null;
  price_vnd: number;           // ĐỒNG, số nguyên. 99000 = 99.000 ₫
  duration_days: number;       // số ngày cộng vào subscription
  is_active: boolean;
  sort_order: number;          // tăng dần; TRIAL_7D seed = -1
  created_at: string;          // ISO-8601 có timezone
  updated_at: string;
}
~~~

### Trạng thái Premium của user

~~~ts
interface PremiumSubscriptionStatusResponse {
  is_premium: boolean;
  is_trial: boolean;                          // default false; true khi plan.code === 'TRIAL_7D'
  status: SubscriptionStatus | null;          // null khi user chưa từng có subscription
  current_plan?: PremiumPlanResponse | null;  // CHỈ có khi is_premium = true
  current_period_start: string | null;
  current_period_end: string | null;
}
~~~

### Đơn thanh toán (view của user)

~~~ts
interface PremiumPaymentOrderResponse {
  id: string;                       // uuid
  invoice_number: string;           // "IQX_XXXXXXXXXXXX" | "GRANT_XXXXXXXXXXXX"
  amount_vnd: number;               // ĐỒNG
  currency: string;                 // luôn "VND" (cột VARCHAR(3))
  status: PaymentOrderStatus;
  paid_at: string | null;
  grant_type: PremiumGrantType | null;
  created_at: string;
}
~~~

### Wrapper phân trang (dùng cho 3 endpoint list của admin)

~~~ts
interface PaginatedResponse<T> {
  items: T[];
  total: number;        // tổng số dòng khớp filter
  page: number;         // echo lại query param
  page_size: number;    // echo lại query param
  total_pages: number;  // ceil(total / page_size); = 0 khi total = 0
}
~~~

### Đơn thanh toán (view của admin)

~~~ts
interface AdminPaymentOrderBrief {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  currency: string;
  status: PaymentOrderStatus;
  grant_type: PremiumGrantType | null;
  paid_at: string | null;
  created_at: string;
  plan_id: string;              // NOT NULL trong DB (FK RESTRICT)
  plan_name: string | null;     // null nếu LEFT JOIN không ra plan
  plan_code: string | null;
  user_id: string;
  user_email: string | null;
  ipn_log_count: number;        // COUNT(sepay_ipn_logs) theo matched_order_id, COALESCE 0
}

interface AdminPaymentOrderIpnLogBrief {
  id: string;                        // uuid dạng chuỗi
  received_at: string | null;        // ISO-8601
  secret_key_valid: boolean;
  result_status: string | null;
  sepay_transaction_id: string | null;
  error_message: string | null;
}

interface AdminPaymentOrderDetail {
  id: string;
  invoice_number: string;
  amount_vnd: number;
  currency: string;
  status: PaymentOrderStatus;
  grant_type: PremiumGrantType | null;
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
  subscription_id: string | null;             // subscription HIỆN TẠI của user, không phải của đơn
  subscription_status: SubscriptionStatus | null;
  subscription_period_end: string | null;
  ipn_logs: AdminPaymentOrderIpnLogBrief[];   // 10 log mới nhất, received_at DESC
}
~~~

> `ipn_logs` trong OpenAPI là `array<object additionalProperties:true>` vì service dựng dict
> thô. Hình dạng trên đọc từ `AdminPaymentService.get()` — đúng 6 khoá, **snake_case**, và
> `id` là **chuỗi** (đã `str()`), không phải uuid object.

### Subscription (view của admin)

~~~ts
interface AdminSubscriptionBrief {
  id: string;
  user_id: string;
  user_email: string | null;
  current_plan_id: string | null;      // nullable: FK ondelete SET NULL
  plan_name: string | null;
  plan_code: string | null;
  current_period_start: string;        // NOT NULL
  current_period_end: string;          // NOT NULL
  status: SubscriptionStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;        // <=1000 ký tự
  created_at: string;
}

interface AdminSubscriptionDetail extends AdminSubscriptionBrief {
  updated_at: string;
  cancelled_by_user_id: string | null;
}
~~~

### IPN log

~~~ts
interface SePayIpnLogResponse {
  id: string;
  received_at: string;
  secret_key_valid: boolean;
  result_status: string | null;              // <=60 ký tự, xem bảng giá trị ở mục IPN
  matched_order_id: string | null;
  sepay_transaction_id: string | null;       // <=200 ký tự
  error_message: string | null;
  raw_body?: Record<string, unknown> | null;   // CHỈ trả ở endpoint detail
  raw_headers?: Record<string, string> | null; // CHỈ trả ở endpoint detail; đã redact
}
~~~

### Payload IPN của SePay

~~~ts
/** Tất cả field đều optional/nullable — Pydantic không bắt buộc field nào. */
interface SePayIpnOrderData {
  id?: string | null;
  order_id?: string | null;
  order_status?: string | null;            // cần "CAPTURED" để kích hoạt
  order_currency?: string | null;          // cần "VND"
  order_amount?: string | null;            // CHUỖI, ví dụ "99000"
  order_invoice_number?: string | null;    // khoá khớp đơn nội bộ
  order_description?: string | null;
  custom_data?: string[] | null;
  user_agent?: string | null;
  ip_address?: string | null;
}

interface SePayIpnTransactionData {
  id?: string | null;
  payment_method?: string | null;
  transaction_id?: string | null;          // khoá idempotency phía SePay
  transaction_type?: string | null;
  transaction_date?: string | null;
  transaction_status?: string | null;      // cần "APPROVED"
  transaction_amount?: string | null;      // CHUỖI
  transaction_currency?: string | null;    // nếu có, phải là "VND"
  authentication_status?: string | null;
  card_number?: string | null;
  card_holder_name?: string | null;
  card_expiry?: string | null;
  card_funding_method?: string | null;
  card_brand?: string | null;
}

interface SePayIpnCustomerData {
  id?: string | null;
  customer_id?: string | null;
}

interface SePayIpnPayload {
  timestamp?: number | null;               // int, epoch seconds
  notification_type?: string | null;       // cần "ORDER_PAID"
  order?: SePayIpnOrderData | null;
  transaction?: SePayIpnTransactionData | null;
  customer?: SePayIpnCustomerData | null;
}
~~~

### Kết quả xử lý IPN (body trả về cho SePay)

~~~ts
interface SePayIpnAck {
  success: 'true';        // CHUỖI "true", không phải boolean
  message: SePayIpnResultMessage;
}

type SePayIpnResultMessage =
  | 'processed'          // đã thu và kích hoạt
  | 'ignored'            // không đủ điều kiện kích hoạt, coi như đã nhận
  | 'already_processed'  // idempotent hit
  | 'order_not_found'
  | 'amount_mismatch'
  | 'amount_invalid'
  | 'currency_mismatch';
~~~

### Cấu hình bắt buộc

| Biến env | Default | Dùng ở đâu |
|---|---|---|
| `SEPAY_MERCHANT_ID` | `""` | field `merchant` trong form checkout |
| `SEPAY_SECRET_KEY` | `""` | khoá HMAC ký form checkout **và** shared secret verify IPN |
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` | `action` của form |
| `APP_PUBLIC_URL` | `http://localhost:3000` | gốc của `success_url` / `error_url` / `cancel_url` |

> `SEPAY_SECRET_KEY` bị dùng cho **hai** mục đích khác nhau (ký checkout + verify IPN). Giữ
> nguyên hành vi này; đừng tách thành 2 biến khi port, vì cấu hình prod chỉ có 1 giá trị.

---

## Vòng đời trạng thái

### Vòng đời đơn thanh toán (`premium_payment_orders.status`)

~~~mermaid
stateDiagram-v2
    [*] --> pending: POST /premium/checkout
    [*] --> paid: POST /premium/admin/users/{id}/grant<br/>(tạo pending rồi mark_admin_grant ngay trong 1 transaction)

    pending --> paid: IPN ORDER_PAID hợp lệ<br/>grant_type=payment
    pending --> paid: POST mark-paid<br/>grant_type=admin_confirmed
    pending --> paid: POST reconcile khớp IPN log<br/>grant_type=payment
    pending --> failed: job ipn_reconcile_scan (6h)<br/>đơn >24h, không có IPN log khớp
    pending --> cancelled: repo.cancel_pending_for_user()<br/>(housekeeping, KHÔNG có endpoint gọi)

    paid --> refunded: POST /admin/payments/{id}/refund

    failed --> [*]
    cancelled --> [*]
    refunded --> [*]
~~~

Ràng buộc bất biến:

- Chỉ `pending → paid` là chuyển trạng thái có tranh chấp đồng thời; nó luôn đi qua
  `UPDATE ... WHERE invoice_number = ? AND status = 'pending'` và **đếm số dòng update được**.
- `refunded` là ngõ cụt: không có đường quay lại `paid`. Không endpoint nào cho phép
  `refunded → *`.
- Không có trạng thái `expired` cho đơn. Đơn treo được job đẩy sang `failed` sau 24h.

### Vòng đời subscription (`premium_subscriptions.status`)

~~~mermaid
stateDiagram-v2
    [*] --> active: trial 7 ngày lúc đăng ký<br/>hoặc IPN/grant/mark-paid đầu tiên

    active --> active: gia hạn — cộng dồn vào current_period_end<br/>(IPN mới, admin grant, extend)
    active --> expired: job expiry_sweep (mỗi 1h)<br/>current_period_end < now
    active --> cancelled: POST /admin/subscriptions/{id}/cancel<br/>hoặc refund đơn PAID

    expired --> active: IPN/grant/mark-paid mới (atomic_extend_period)<br/>hoặc POST extend làm new_end > now
    cancelled --> active: IPN/grant/mark-paid mới (atomic_extend_period LUÔN set active)<br/>hoặc POST extend khi hạn cũ đã qua
    cancelled --> cancelled: POST extend khi hạn cũ CÒN hiệu lực<br/>(chỉ đẩy period_end, status giữ nguyên)
~~~

Ràng buộc bất biến:

- `premium_subscriptions` có `UNIQUE(user_id)` → **mỗi user tối đa 1 dòng, tồn tại mãi mãi**.
  Không có bảng lịch sử. "Đổi gói" chỉ là ghi đè `current_plan_id`.
- `is_premium` **không đọc `status`** — chỉ so `current_period_end` với `now` (xem
  `GET /premium/me`). Vì vậy subscription `cancelled` mà hạn còn tương lai **vẫn tính là
  Premium** ở guard. Đây là hành vi thật, phải giữ.
- Vai trò user (`users.role`) là bản sao mềm của trạng thái Premium, được cập nhật rời rạc:
  nâng lên `premium` khi kích hoạt/gia hạn, hạ về `user` khi cancel/refund/expiry sweep.
  `admin` **không bao giờ** bị hạ (mọi UPDATE đều có `WHERE role = 'premium'`).

### Gói dùng thử 7 ngày (`TRIAL_7D`)

Seed bằng migration `8823d69d4667_seed_trial_7d_plan`:

~~~sql
INSERT INTO premium_plans (id, code, name, description, price_vnd, duration_days,
                           is_active, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), 'TRIAL_7D', 'Dùng thử 7 ngày',
        'Gói dùng thử Premium 7 ngày miễn phí, tự cấp khi đăng ký tài khoản mới.',
        0, 7, true, -1, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
~~~

Điều kiện được nhận trial (`PremiumService.grant_trial_if_eligible`), theo đúng thứ tự:

1. `SELECT * FROM premium_subscriptions WHERE user_id = ?` — nếu **tồn tại bất kỳ dòng nào**
   (kể cả `expired`, kể cả `cancelled`) → no-op, trả `null`. Đây chính là cơ chế "mỗi user
   1 lần": vì `UNIQUE(user_id)` và dòng không bao giờ bị xoá, hàng đã có = đã dùng trial.
2. `SELECT * FROM premium_plans WHERE code = 'TRIAL_7D'` — nếu chưa seed → log warning
   `"TRIAL_7D plan not seeded; skipping trial grant for user %s"` và no-op.
3. Gọi `_extend_subscription(user_id, trial_plan)` → tạo subscription `active`,
   `period_start = now`, `period_end = now + 7 ngày`, và set `users.role = 'premium'`.

Nơi gọi duy nhất: `UserService.register()` (đăng ký thường), bọc trong `try/except` —
**trial lỗi không được làm hỏng đăng ký**. `admin_create` (admin tạo user) **không** cấp trial.
Không có endpoint nào trong chương này cấp trial trực tiếp.

`TRIAL_7D` bị ẩn khỏi `GET /premium/plans` (repo `list_active()` có `code != 'TRIAL_7D'`) và
không thể xoá qua `DELETE /premium/admin/plans/{id}`.

---

## Nhóm 1 — Gói & trạng thái Premium của người dùng

### GET /api/v1/premium/plans

> **Danh sách gói Premium đang bán** — trả các gói `is_active = true`, ẩn gói nội bộ `TRIAL_7D`.

| | |
|---|---|
| **Quyền** | Công khai (không cần token) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type ListPremiumPlansResponse = PremiumPlanResponse[];
~~~

~~~json
[
  {
    "id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
    "code": "PREMIUM_1M",
    "name": "Premium 1 tháng",
    "description": "Toàn bộ tín hiệu, AI phân tích cổ phiếu và bộ lọc nâng cao trong 30 ngày.",
    "price_vnd": 99000,
    "duration_days": 30,
    "is_active": true,
    "sort_order": 1,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  },
  {
    "id": "8a1d5e7c-2f64-4b98-9c30-5d6e7f801b45",
    "code": "PREMIUM_6M",
    "name": "Premium 6 tháng",
    "description": "Tiết kiệm 2 tháng so với gói tháng.",
    "price_vnd": 499000,
    "duration_days": 180,
    "is_active": true,
    "sort_order": 2,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-06-01T03:12:44.001233+00:00"
  },
  {
    "id": "c3e9f012-45a6-4d7b-8e91-2a3b4c5d6e7f",
    "code": "PREMIUM_12M",
    "name": "Premium 12 tháng",
    "description": null,
    "price_vnd": 899000,
    "duration_days": 365,
    "is_active": true,
    "sort_order": 3,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Endpoint không sinh lỗi domain nào | — |

**Fallback / suy giảm**

Không có provider ngoài. Nếu chưa seed gói nào (hoặc tất cả `is_active = false`) → trả
**mảng rỗng `[]`**, HTTP 200. Không trả 404, không trả `null`. Frontend phải tự xử lý
trường hợp rỗng (nghĩa là "tạm thời không bán gói nào").

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/premium/plans' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Sắp xếp: `ORDER BY sort_order ASC, price_vnd ASC` — **hai** khoá, đúng thứ tự đó.
  `sort_order` cho phép số âm (`TRIAL_7D` seed `-1`), nên đừng coi nó là unsigned.
- Bộ lọc là `is_active = true AND code <> 'TRIAL_7D'`. Chuỗi `'TRIAL_7D'` bị hard-code trong
  repository, không nằm trong config — giữ nguyên dạng hard-code để hành vi không đổi.
- `price_vnd` là **ĐỒNG**. 99000 phải render "99.000 ₫". Đừng chia 1000.
- Đây là endpoint công khai duy nhất trong nhóm ngoài webhook IPN.

---

### GET /api/v1/premium/me

> **Trạng thái Premium của tôi** — nguồn sự thật duy nhất cho câu hỏi "user này có Premium không".

| | |
|---|---|
| **Quyền** | Bearer (user active) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_subscriptions` + `premium_plans` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetMyPremiumStatusResponse = PremiumSubscriptionStatusResponse;
~~~

Trường hợp đang có Premium (gói trả phí):

~~~json
{
  "is_premium": true,
  "is_trial": false,
  "status": "active",
  "current_plan": {
    "id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
    "code": "PREMIUM_1M",
    "name": "Premium 1 tháng",
    "description": "Toàn bộ tín hiệu, AI phân tích cổ phiếu và bộ lọc nâng cao trong 30 ngày.",
    "price_vnd": 99000,
    "duration_days": 30,
    "is_active": true,
    "sort_order": 1,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  },
  "current_period_start": "2026-08-17T02:15:30.120000+00:00",
  "current_period_end": "2026-09-16T02:15:30.120000+00:00"
}
~~~

Trường hợp đang dùng thử 7 ngày:

~~~json
{
  "is_premium": true,
  "is_trial": true,
  "status": "active",
  "current_plan": {
    "id": "0d9c8b7a-6f5e-4d3c-2b1a-098765432100",
    "code": "TRIAL_7D",
    "name": "Dùng thử 7 ngày",
    "description": "Gói dùng thử Premium 7 ngày miễn phí, tự cấp khi đăng ký tài khoản mới.",
    "price_vnd": 0,
    "duration_days": 7,
    "is_active": true,
    "sort_order": -1,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  },
  "current_period_start": "2026-08-14T08:00:00+00:00",
  "current_period_end": "2026-08-21T08:00:00+00:00"
}
~~~

Trường hợp đã hết hạn (có dòng subscription nhưng `period_end` đã qua):

~~~json
{
  "is_premium": false,
  "is_trial": false,
  "status": "active",
  "current_plan": null,
  "current_period_start": "2026-07-01T08:00:00+00:00",
  "current_period_end": "2026-07-31T08:00:00+00:00"
}
~~~

Trường hợp chưa từng có subscription:

~~~json
{
  "is_premium": false,
  "is_trial": false,
  "status": null,
  "current_plan": null,
  "current_period_start": null,
  "current_period_end": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không gửi header `Authorization` | `Yêu cầu xác thực` |
| 401 | `UNAUTHORIZED` | Token sai/hết hạn | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm**

Không gọi provider ngoài. Ba nhánh "không có Premium" đều trả **HTTP 200** với
`is_premium = false` — **không bao giờ 404**. Khi `current_plan_id` trỏ tới plan đã bị xoá
cứng (FK `ON DELETE SET NULL`), `current_plan` = `null` nhưng `is_premium` vẫn có thể `true`
và `is_trial` bị ép về `false`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/premium/me' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Thuật toán `is_premium` — đọc kỹ, đây là chỗ dễ port sai nhất:**
  1. `sub = SELECT * FROM premium_subscriptions WHERE user_id = :me` (tối đa 1 dòng).
  2. `now = new Date()` — **so sánh theo UTC**, không phải ICT. Cột
     `current_period_end` là `TIMESTAMPTZ`; nếu đọc ra naive thì coi như UTC.
  3. Nếu `sub == null` **HOẶC** `sub.current_period_end < now` →
     `is_premium = false`, `is_trial = false`, `current_plan` bỏ trống, nhưng **vẫn trả
     `status`, `current_period_start`, `current_period_end` của dòng cũ** (chỉ `null` khi
     không có dòng nào).
  4. Ngược lại → `is_premium = true`, `status = sub.status`, rồi mới nạp plan.
- **`status` KHÔNG tham gia quyết định `is_premium`.** Subscription `cancelled` hoặc
  `expired` mà `current_period_end` còn ở tương lai **vẫn trả `is_premium: true`**. Guard
  Premium (`is_premium_active`) dùng chính hàm này, nên hệ quả là *huỷ = huỷ cuối kỳ* về mặt
  quyền truy cập, dù `users.role` bị hạ ngay. Đừng "sửa" thành `status === 'active' && ...`.
- So sánh là `<` (strictly less), không phải `<=`: đúng thời điểm `period_end === now` vẫn
  tính là Premium.
- `is_trial` được suy ra bằng cách nạp plan và so `plan.code === 'TRIAL_7D'` — **không** có
  cột `is_trial` trong DB.
- Admin: endpoint này **không** ưu tiên role admin. Admin không có subscription sẽ nhận
  `is_premium: false` ở đây, dù guard `PremiumUser` cho admin đi qua (kiểm tra
  `role === 'admin'` trước khi gọi service). Đừng hợp nhất 2 logic đó.
- `current_plan` là field optional trong schema (`current_plan?: ...`) — ở nhánh hết hạn
  Pydantic vẫn serialize `"current_plan": null` vì mặc định không loại field null. Trả
  `null` cho đúng, đừng omit.

---

### POST /api/v1/premium/checkout

> **Tạo đơn thanh toán + form POST sang SePay** — sinh `invoice_number`, lưu đơn `pending`,
> trả về đặc tả form đã ký HMAC để **browser** tự submit sang SePay.

| | |
|---|---|
| **Quyền** | Bearer (user active) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` (đọc) + `premium_payment_orders` (ghi) + config SePay |
| **Side-effect** | INSERT 1 dòng `premium_payment_orders` status `pending`. **Không** gọi HTTP ra ngoài, **không** ghi audit log |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
interface PremiumCheckoutRequest {
  plan_id: string; // uuid, bắt buộc
}
~~~

~~~json
{ "plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23" }
~~~

**Response 200**

~~~ts
interface PremiumCheckoutFormField {
  name: string;
  value: string;   // LUÔN là chuỗi, kể cả số tiền
}

interface PremiumCheckoutResponse {
  action: string;                        // = SEPAY_CHECKOUT_URL
  method: string;                        // hằng "POST"
  fields: PremiumCheckoutFormField[];    // 10 field + "signature" ở cuối
  invoice_number: string;                // "IQX_" + 12 hex chữ IN
  order_id: string;                      // uuid đơn vừa tạo
}
~~~

~~~json
{
  "action": "https://pay-sandbox.sepay.vn/v1/checkout/init",
  "method": "POST",
  "fields": [
    { "name": "order_amount", "value": "99000" },
    { "name": "merchant", "value": "IQX_MERCHANT_01" },
    { "name": "currency", "value": "VND" },
    { "name": "operation", "value": "PURCHASE" },
    { "name": "order_description", "value": "IQX Premium - Premium 1 tháng" },
    { "name": "order_invoice_number", "value": "IQX_9F3B2C1D4E5A" },
    { "name": "customer_id", "value": "7b1e4d2c-3a5f-4e6b-8c9d-0a1b2c3d4e5f" },
    { "name": "success_url", "value": "https://iqx.vn/payment/success" },
    { "name": "error_url", "value": "https://iqx.vn/payment/error" },
    { "name": "cancel_url", "value": "https://iqx.vn/payment/cancel" },
    { "name": "signature", "value": "kQ8v1Zr3sYb7NcM2pLxJd9TfH0aWuE4gRiO6yB5nQzU=" }
  ],
  "invoice_number": "IQX_9F3B2C1D4E5A",
  "order_id": "e5d4c3b2-a190-4f8e-9d7c-6b5a49382716"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | `plan_id` không tồn tại | `Không tìm thấy gói Premium` |
| 400 | `BAD_REQUEST` | Plan tồn tại nhưng `is_active = false` | `Gói này không còn khả dụng` |
| 422 | — | `plan_id` thiếu hoặc không phải uuid | body dạng `{ "detail": [ ... ] }` |

**Fallback / suy giảm**

Backend **không gọi SePay** ở bước này, nên không có nhánh lỗi provider: không 502, không
503, không timeout. Nếu `SEPAY_MERCHANT_ID` hoặc `SEPAY_SECRET_KEY` là chuỗi rỗng (default
config), endpoint **vẫn trả 200** với `merchant: ""` và một signature ký bằng khoá rỗng —
SePay sẽ từ chối ở phía họ. Đây là hành vi hiện tại; nếu muốn fail-fast thì phải thêm mới
(ghi vào changelog, đừng lặng lẽ đổi). Đơn `pending` đã INSERT vẫn nằm lại DB kể cả khi user
không bao giờ submit form — job `ipn_reconcile_scan` sẽ đẩy nó sang `failed` sau 24h.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/premium/checkout' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"plan_id":"4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23"}'
~~~

**Ghi chú khi viết lại**

- **Backend KHÔNG gửi request tới `SEPAY_CHECKOUT_URL`.** Nó chỉ trả `action` = URL đó cùng
  danh sách field ẩn; **frontend dựng `<form method="POST" action={action}>` và submit** để
  browser điều hướng sang trang thanh toán SePay. Không có "redirect URL" nào được backend
  sinh ra, không có `Location` header, không có 302.
- **Thứ tự kiểm tra:** (1) nạp plan theo id → 404; (2) `plan.is_active` → 400; (3) mới sinh
  `invoice_number` và INSERT đơn. Nghĩa là gói không tồn tại/đã tắt **không** tạo đơn rác.
- **Format `invoice_number`:** `"IQX_" + uuid4().hex.slice(0,12).toUpperCase()` → 12 ký tự
  hex chữ IN, ví dụ `IQX_9F3B2C1D4E5A`. Tổng 16 ký tự. Cột `VARCHAR(100)` UNIQUE, có index.
  Không có bộ đếm tuần tự, không nhúng ngày, không nhúng user id. Đơn do admin cấp dùng tiền
  tố khác: `GRANT_` (xem endpoint grant).
- **Thời hạn đơn:** không có cột `expires_at`, không có TTL. Đơn `pending` sống vô hạn cho tới
  khi IPN khớp, admin can thiệp, hoặc job đẩy sang `failed` sau **24 giờ**. Nếu bản TS muốn
  hiện "đơn hết hạn sau 15 phút" thì đó là logic mới ở UI, không phải hành vi backend.
- **Thuật toán ký (`_sign_fields`) — port đúng từng byte:**
  1. Danh sách field được ký, **cố định đúng thứ tự này**:
     `order_amount, merchant, currency, operation, order_description,
     order_invoice_number, customer_id, payment_method, success_url, error_url, cancel_url`.
  2. Bỏ qua field không có mặt trong dict. Thực tế `payment_method` **không bao giờ** được
     set nên luôn bị bỏ qua — nhưng phải giữ nó trong danh sách để thứ tự đúng nếu sau này thêm.
  3. Nối `` `${name}=${value}` `` bằng dấu **phẩy**, không có space:
     `order_amount=99000,merchant=IQX_MERCHANT_01,currency=VND,operation=PURCHASE,order_description=IQX Premium - Premium 1 tháng,order_invoice_number=IQX_9F3B2C1D4E5A,customer_id=7b1e...,success_url=https://iqx.vn/payment/success,error_url=https://iqx.vn/payment/error,cancel_url=https://iqx.vn/payment/cancel`
  4. `HMAC-SHA256(secret = SEPAY_SECRET_KEY, message = chuỗi trên)`, mã hoá **base64**
     (không phải hex). UTF-8 cho cả key và message — chú ý `order_description` có tiếng Việt
     ("Premium 1 tháng") nên **phải** encode UTF-8, không latin-1.
  5. Không URL-encode, không escape dấu phẩy trong value. Nếu `plan.name` chứa dấu phẩy thì
     chuỗi ký bị nhập nhằng — đó là rủi ro hiện có; đừng tự ý escape vì sẽ lệch signature.
- **Giá trị các field:**
  - `order_amount` = `String(plan.price_vnd)` — số nguyên đồng dạng chuỗi, không phân cách nghìn.
  - `order_description` = `` `IQX Premium - ${plan.name}` `` (dấu gạch ngang có space hai bên).
  - `customer_id` = **user id (uuid) dạng chuỗi**, không phải email.
  - `success_url` / `error_url` / `cancel_url` = `${APP_PUBLIC_URL}` + `/payment/success`,
    `/payment/error`, `/payment/cancel`. Không có query param nào kèm theo (không nhúng
    `invoice_number` vào URL) — trang success phải tự gọi `/premium/me` để biết kết quả.
- **Thứ tự phần tử `fields` trong response** = đúng thứ tự dict khai báo
  (`order_amount → merchant → currency → operation → order_description →
  order_invoice_number → customer_id → success_url → error_url → cancel_url`) rồi
  **`signature` được append cuối cùng**. Test hiện có chỉ kiểm tra sự tồn tại, nhưng giữ
  đúng thứ tự để dễ so sánh khi debug với SePay.
- Đơn được INSERT với `amount_vnd = plan.price_vnd` **chụp tại thời điểm tạo đơn**. Admin đổi
  giá gói sau đó không ảnh hưởng đơn cũ — và IPN sẽ đối chiếu với `amount_vnd` của đơn, không
  phải giá hiện tại của gói.
- Không giới hạn số đơn `pending` đồng thời của một user: bấm "Thanh toán" 5 lần tạo 5 đơn.
  IPN chỉ khớp đúng `invoice_number` mà SePay trả về.

---

### GET /api/v1/premium/my-orders

> **Lịch sử thanh toán của tôi** — 20 đơn gần nhất, kèm tên gói, trả **camelCase** (khác toàn
> bộ phần còn lại của API).

| | |
|---|---|
| **Quyền** | Bearer (user active) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — raw SQL join `premium_payment_orders` ⨝ `premium_plans` |
| **Side-effect** | — |

**Path params**

—

**Query params**

— (không có phân trang, không có filter; luôn `LIMIT 20`)

**Request body**

—

**Response 200**

Response schema trong OpenAPI là **object rỗng** (`{}`) vì handler trả list dict thô. Hình
dạng dưới đây đọc trực tiếp từ raw SQL + vòng lặp dựng dict trong `premium.py`:

~~~ts
interface MyPremiumOrderItem {
  id: string;                 // uuid dạng chuỗi
  invoiceNumber: string;      // = premium_payment_orders.invoice_number
  amount: number;             // = amount_vnd (ĐỒNG) — CHÚ Ý tên field khác cột
  currency: string;           // "VND"
  status: PaymentOrderStatus;
  planName: string | null;    // LEFT JOIN → có thể null
  planCode: string | null;
  paidAt: string | null;      // ISO-8601 hoặc null
  createdAt: string | null;   // ISO-8601 hoặc null (nullable do .isoformat() có guard)
}

type GetMyPremiumOrdersResponse = MyPremiumOrderItem[];
~~~

~~~json
[
  {
    "id": "e5d4c3b2-a190-4f8e-9d7c-6b5a49382716",
    "invoiceNumber": "IQX_9F3B2C1D4E5A",
    "amount": 99000,
    "currency": "VND",
    "status": "paid",
    "planName": "Premium 1 tháng",
    "planCode": "PREMIUM_1M",
    "paidAt": "2026-08-17T02:15:30.120000+00:00",
    "createdAt": "2026-08-17T02:14:58.004411+00:00"
  },
  {
    "id": "b7a6958c-4d3e-4f21-8a0b-1c2d3e4f5a6b",
    "invoiceNumber": "IQX_1A2B3C4D5E6F",
    "amount": 499000,
    "currency": "VND",
    "status": "pending",
    "planName": "Premium 6 tháng",
    "planCode": "PREMIUM_6M",
    "paidAt": null,
    "createdAt": "2026-08-15T09:41:02.771903+00:00"
  },
  {
    "id": "1f0e2d3c-4b5a-4968-8778-99aabbccddee",
    "invoiceNumber": "GRANT_7C8D9E0F1A2B",
    "amount": 0,
    "currency": "VND",
    "status": "paid",
    "planName": "Dùng thử 7 ngày",
    "planCode": "TRIAL_7D",
    "paidAt": "2026-07-02T04:00:00+00:00",
    "createdAt": "2026-07-02T04:00:00+00:00"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User chưa kích hoạt | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm**

User chưa có đơn nào → **`[]`** với HTTP 200. Không 404. Gói đã bị xoá cứng khỏi
`premium_plans` → `planName`/`planCode` = `null` nhưng dòng đơn vẫn hiện (LEFT JOIN).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/premium/my-orders' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Đây là endpoint duy nhất trong chương trả camelCase.** `invoiceNumber`, `planName`,
  `planCode`, `paidAt`, `createdAt` — và đặc biệt **`amount`** (không phải `amount_vnd`).
  Frontend đang bind đúng những tên này; đổi sang snake_case sẽ làm trắng bảng lịch sử.
- Không có `grant_type`, không có `updated_at`, không có `plan_id` trong payload này — dù
  bảng có. Đừng "bổ sung cho đầy đủ".
- SQL nguyên bản (giữ nguyên `ORDER BY` và `LIMIT`):

  ~~~sql
  SELECT o.id, o.invoice_number, o.amount_vnd, o.currency,
         o.status, o.paid_at, o.created_at,
         p.name AS plan_name, p.code AS plan_code
  FROM premium_payment_orders o
  LEFT JOIN premium_plans p ON p.id = o.plan_id
  WHERE o.user_id = :uid
  ORDER BY o.created_at DESC
  LIMIT 20
  ~~~
- `LIMIT 20` là hằng số hard-code, không có query param để đổi. Không có `total`. Nếu cần
  phân trang thì là feature mới.
- Đơn do admin cấp (`GRANT_*`, `amount = 0`) **cũng xuất hiện** trong danh sách này — user
  nhìn thấy mình được tặng gói. Kể cả đơn `refunded` và `failed` cũng hiện (không filter theo
  status).
- `status` trả về là chuỗi thô từ cột enum → luôn chữ thường.

---

## Nhóm 2 — Webhook SePay (công khai)

### POST /api/v1/premium/sepay/ipn

> **Webhook IPN của SePay** — máy chủ SePay gọi mỗi khi trạng thái thanh toán đổi; đây là
> đường duy nhất khiến một đơn tự động thành `paid` và Premium được kích hoạt.

| | |
|---|---|
| **Quyền** | **Công khai** — không Bearer. Xác thực bằng **shared secret** trong header (xem dưới) |
| **Rate limit** | mặc định (60/phút/IP) — **CẢNH BÁO: áp cả cho webhook**, xem ghi chú |
| **Cache** | không |
| **Nguồn dữ liệu** | body JSON do SePay gửi + DB `premium_payment_orders` |
| **Side-effect** | INSERT `sepay_ipn_logs` (mọi nhánh, kể cả 401/400); UPDATE `premium_payment_orders` (pending→paid); UPSERT `premium_subscriptions`; UPDATE `users.role = 'premium'`. **Không** ghi `admin_audit_log` |

**Path params**

—

**Query params**

—

**Headers**

| Tên | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `X-Secret-Key` | string | Không (nhưng thực tế phải có 1 trong 4 dạng) | Shared secret, so sánh constant-time với `SEPAY_SECRET_KEY` |
| `Authorization` | string | Không | Fallback: `Apikey <key>`, `Bearer <key>`, hoặc **toàn bộ giá trị** header |
| `X-Api-Key` | string | Không | Fallback cuối |

**Request body**

~~~ts
type SePayIpnRequest = SePayIpnPayload; // xem "Kiểu dữ liệu dùng chung"
~~~

Payload SePay gửi khi thu tiền thành công (đây là hình dạng đầy đủ nhất, mọi field đều optional):

~~~json
{
  "timestamp": 1786000530,
  "notification_type": "ORDER_PAID",
  "order": {
    "id": "3921884",
    "order_id": "SEPAY_ORD_3921884",
    "order_status": "CAPTURED",
    "order_currency": "VND",
    "order_amount": "99000",
    "order_invoice_number": "IQX_9F3B2C1D4E5A",
    "order_description": "IQX Premium - Premium 1 tháng",
    "custom_data": [],
    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)",
    "ip_address": "113.161.74.22"
  },
  "transaction": {
    "id": "7745102",
    "payment_method": "domestic_card",
    "transaction_id": "SEPAY_TXN_7745102",
    "transaction_type": "PURCHASE",
    "transaction_date": "2026-08-17 09:15:30",
    "transaction_status": "APPROVED",
    "transaction_amount": "99000",
    "transaction_currency": "VND",
    "authentication_status": "AUTHENTICATED",
    "card_number": "970436******1234",
    "card_holder_name": "NGUYEN VAN A",
    "card_expiry": "12/29",
    "card_funding_method": "DEBIT",
    "card_brand": "VCB"
  },
  "customer": {
    "id": "88213",
    "customer_id": "7b1e4d2c-3a5f-4e6b-8c9d-0a1b2c3d4e5f"
  }
}
~~~

**Response 200**

~~~ts
type SePayIpnResponse = SePayIpnAck;
~~~

~~~json
{ "success": "true", "message": "processed" }
~~~

**Toàn bộ giá trị `message` có thể trả về (HTTP 200):**

| `message` | Nghĩa | Đã kích hoạt Premium? |
|---|---|---|
| `processed` | Khớp đơn, thu đúng tiền, đã gia hạn subscription | Có |
| `ignored` | Không đủ điều kiện kích hoạt (loại thông báo khác, thiếu section, status khác, sai `order_currency`, thiếu `invoice_number`) | Không |
| `already_processed` | Idempotent — đã xử lý trước đó / đơn không còn `pending` | Không (lần này) |
| `order_not_found` | `invoice_number` không có trong DB | Không |
| `amount_mismatch` | `order_amount` hoặc `transaction_amount` lệch `amount_vnd` của đơn | Không |
| `amount_invalid` | Số tiền không parse được / ≤ 0 / có phần thập phân khác `.00` | Không |
| `currency_mismatch` | `transaction_currency` có mặt nhưng khác `VND` | Không |

**Lỗi**

| Status | code | Khi nào | Body nguyên văn |
|---|---|---|---|
| 401 | — | Không tìm được secret ở bất kỳ header nào, **hoặc** secret không khớp `SEPAY_SECRET_KEY` | `{"error": "unauthorized"}` |
| 400 | — | Body không phải JSON hợp lệ (`ValueError`/`UnicodeDecodeError`) | `{"error": "invalid_json"}` |
| 400 | — | JSON hợp lệ nhưng không validate được thành `IPNPayload` (ví dụ `timestamp` là chuỗi không phải số, `order` là mảng…) | `{"error": "invalid_payload"}` |

> Ba nhánh lỗi này trả body **`{"error": ...}`**, **không** phải `{"detail","code"}` như phần
> còn lại của API — vì handler dùng `JSONResponse` trực tiếp, không đi qua exception filter.
> Giữ nguyên hình dạng này.

**Fallback / suy giảm**

- **SePay coi là "đã nhận" khi và chỉ khi HTTP 200.** Mọi tình huống nghiệp vụ không thuận
  lợi (không khớp đơn, lệch tiền, trùng lặp, sai loại thông báo) đều trả **200 +
  `{"success":"true","message":"<lý do>"}`** để SePay **ngừng retry**. Chỉ 3 nhánh trả
  non-2xx: 401 (sai secret) và 400 (body hỏng) — đó là những lúc ta *muốn* SePay thử lại
  hoặc báo động.
- **Không bao giờ trả 5xx cho nhánh nghiệp vụ.** Nếu bản TS ném exception (ví dụ vi phạm
  UNIQUE `sepay_transaction_id`) thì SePay sẽ retry vô hạn — phải bắt và quy về 200/`ignored`
  hoặc để 500 có ý thức. Bản Python hiện tại **không** bọc `process_ipn` trong try/except, nên
  một lỗi DB sẽ thành 500 và SePay retry; retry đó **an toàn** vì luồng là idempotent.
- Không có provider ngoài nào được gọi. Không phụ thuộc giờ giao dịch — IPN xử lý 24/7.
- Mọi request đều để lại **một dòng** `sepay_ipn_logs`, kể cả khi bị 401. Nếu INSERT log thất
  bại thì cả request thất bại (không swallow).

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/premium/sepay/ipn' \
  -H 'X-Secret-Key: $SEPAY_SECRET_KEY' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
    "timestamp": 1786000530,
    "notification_type": "ORDER_PAID",
    "order": {
      "order_status": "CAPTURED",
      "order_currency": "VND",
      "order_amount": "99000",
      "order_invoice_number": "IQX_9F3B2C1D4E5A"
    },
    "transaction": {
      "transaction_id": "SEPAY_TXN_7745102",
      "transaction_status": "APPROVED",
      "transaction_currency": "VND",
      "transaction_amount": "99000"
    }
  }'
~~~

**Ghi chú khi viết lại**

#### 1. Thuật toán xác thực — KHÔNG có HMAC, KHÔNG cần raw body

Đây là chỗ dễ port sai nhất cả chương. Sự thật từ source:

- **Không có chữ ký HMAC nào được verify ở IPN.** Không đọc header `signature`, không tính
  `HMAC-SHA256` trên body, không so sánh digest. HMAC chỉ dùng ở **checkout** (chiều đi).
- Xác thực là **so sánh shared secret nguyên văn**:
  `hmac.compare_digest(secret_key, settings.SEPAY_SECRET_KEY)` — constant-time compare hai
  chuỗi, không phải HMAC của gì cả (`hmac.compare_digest` chỉ là hàm so sánh an toàn).
- **Thứ tự tìm secret** (dừng ở dạng đầu tiên tìm được):
  1. Header `X-Secret-Key` (đường chính, SePay cấu hình được).
  2. Nếu (1) rỗng/không có → đọc header `Authorization`:
     - bắt đầu bằng `"Apikey "` → lấy `substring(7)`;
     - bắt đầu bằng `"Bearer "` → lấy `substring(7)`;
     - khác rỗng nhưng không có tiền tố → lấy **toàn bộ** giá trị header.
  3. Nếu sau (2) vẫn không có gì → header `X-Api-Key` (mặc định `""`).
- Điều kiện hợp lệ: `Boolean(secret_key) && compare_digest(secret_key, SEPAY_SECRET_KEY)`.
  Chuỗi rỗng → **luôn 401** (nên nếu quên set `SEPAY_SECRET_KEY`, mọi IPN đều 401 — an toàn
  theo hướng fail-closed).
- **Bẫy khi port sang Node:** `crypto.timingSafeEqual` yêu cầu 2 Buffer **cùng độ dài**, nếu
  khác thì **ném lỗi** thay vì trả false. Phải tự bọc:

  ~~~ts
  function secretMatches(given: string, expected: string): boolean {
    if (!given || !expected) return false;
    const a = Buffer.from(given, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;   // Python compare_digest trả False, không ném
    return crypto.timingSafeEqual(a, b);
  }
  ~~~
  (Python `hmac.compare_digest` trả `False` với độ dài khác nhau, nhưng **ném `TypeError`** nếu
  chuỗi có ký tự non-ASCII → khi đó thành HTTP 500 chứ không phải 401. Đừng tái tạo cái bẫy
  này; chuẩn hoá về Buffer/UTF-8 như trên.)
- **KHÔNG cần raw body để xác thực** → tin tốt cho Fastify/NestJS: **không phải** cấu hình
  `rawBody` hay tắt body parser cho route này. Chỉ cần JSON đã parse. (Nếu sau này SePay bật
  ký body thì mới phải giữ raw body — hiện tại thì không.)

#### 2. Thứ tự xử lý (đúng tuyệt đối)

~~~
1. Đọc toàn bộ headers (để log).
2. Trích secret theo thứ tự X-Secret-Key → Authorization → X-Api-Key.
3. Ghi log INFO (có in cả dict headers — xem cảnh báo bảo mật ở dưới).
4. Verify secret.
   ├─ SAI  → thử `await request.json()` (bọc try, lỗi thì raw_body = null)
   │         → INSERT sepay_ipn_logs { secret_key_valid: false,
   │                                   result_status: 'secret_invalid',
   │                                   sepay_transaction_id: null }
   │         → return 401 {"error":"unauthorized"}      ← DỪNG
   └─ ĐÚNG → tiếp
5. Parse JSON.
   └─ lỗi → INSERT log { secret_key_valid: true, result_status: 'invalid_json',
                         raw_body: null, error_message: 'malformed JSON body' }
            → return 400 {"error":"invalid_json"}       ← DỪNG
6. Validate schema thành IPNPayload.
   └─ lỗi → INSERT log { secret_key_valid: true, result_status: 'invalid_payload',
                         raw_body: <json thô>, error_message: <chuỗi hoá danh sách lỗi> }
            → return 400 {"error":"invalid_payload"}    ← DỪNG
7. sepay_txn_id = payload.transaction?.transaction_id ?? null   (chỉ để log)
8. result = process_ipn(payload)        ← toàn bộ nghiệp vụ, xem §3
9. Nếu payload.order?.order_invoice_number có giá trị:
      matched_order_id = SELECT id FROM premium_payment_orders
                         WHERE invoice_number = :invoice   (không lọc theo user/status)
   Ngược lại matched_order_id = null.
10. INSERT sepay_ipn_logs { secret_key_valid: true,
                            result_status: result.message,   ← LƯU Ý: lưu `message`, không phải `success`
                            matched_order_id, sepay_transaction_id }
11. return 200 <result>
~~~

**Lưu ý quan trọng về thứ tự:** log IPN được ghi **SAU** khi nghiệp vụ chạy (bước 10), không
phải trước. Nghĩa là nếu bước 8 ném lỗi thì **không có** dòng log nào cho request đó (transaction
rollback). Trong bản Python cả log và mutation nằm cùng transaction — hoặc cùng commit, hoặc
cùng mất. Nếu bản TS tách log ra transaction riêng (để luôn có audit) thì đó là **thay đổi
hành vi**: `reconcile`/`retry` sau này sẽ thấy log mà bản Python không có. Ghi rõ nếu đổi.

#### 3. `process_ipn` — chuỗi điều kiện, dừng ở lần thất bại đầu tiên

| # | Điều kiện | Không thoả → trả |
|---|---|---|
| 1 | `notification_type === 'ORDER_PAID'` | `ignored` |
| 2 | `order` **và** `transaction` đều có mặt (không null) | `ignored` |
| 3 | `order.order_status === 'CAPTURED'` | `ignored` |
| 4 | `transaction.transaction_status === 'APPROVED'` | `ignored` |
| 5 | `order.order_currency === 'VND'` | `ignored` |
| 6 | `transaction.transaction_currency` — nếu **có giá trị** thì phải `=== 'VND'` | `currency_mismatch` |
| 7 | `order.order_invoice_number` khác rỗng | `ignored` |
| 8 | Nếu có `transaction_id`: đơn nào đang giữ `sepay_transaction_id` đó **không** ở trạng thái `paid` | `already_processed` |
| 9 | Tồn tại đơn với `invoice_number` = giá trị nhận được | `order_not_found` |
| 10 | Đơn đó **không** ở trạng thái `paid` | `already_processed` |
| 11 | `parseVnd(order.order_amount)` ra số hợp lệ | `amount_invalid` |
| 12 | Số đó `=== order.amount_vnd` | `amount_mismatch` |
| 13 | Nếu `transaction_amount` có giá trị: parse được | `amount_invalid` |
| 14 | …và `=== order.amount_vnd` | `amount_mismatch` |
| 15 | `claim_pending_order()` update được ≥1 dòng | `already_processed` |
| — | Tất cả thoả | `processed` |

Chi tiết cần chính xác:

- **Điều kiện 6 khác 5:** thiếu `order_currency` → `ignored`; thiếu `transaction_currency` →
  **bỏ qua kiểm tra** (không lỗi). Sai `transaction_currency` → `currency_mismatch` (chỉ nhánh
  này dùng message đó).
- **`parseVnd` (`_parse_vnd_amount`) — dùng Decimal, KHÔNG dùng float:**
  1. Chuỗi rỗng/null → `null`.
  2. `new Decimal(raw)`; parse lỗi → `null`.
  3. `d <= 0` → `null` (từ chối 0 và số âm).
  4. `d !== d.trunc()` → `null` — **từ chối mọi phần thập phân khác `.00`**. `"99000.00"` được
     chấp nhận (bằng chính phần nguyên), `"99000.50"` bị từ chối vì VND không có đơn vị lẻ.
  5. Trả `Number(d)` / `BigInt`.
  Trong TS **đừng dùng `parseFloat`/`Number` trực tiếp**: `Number("99000.00000000001")` vẫn ra
  99000.00000000001 nhưng làm tròn nhị phân có thể qua được test `=== trunc`. Dùng
  `decimal.js`/`big.js` hoặc kiểm tra bằng regex `^\d+(\.0+)?$` trước khi chuyển.
- **Điều kiện 8 (idempotency theo `transaction_id`)**: tra `premium_payment_orders` theo
  `sepay_transaction_id = <txn>`; nếu đơn đó **đang `paid`** → `already_processed` ngay, không
  cần biết `invoice_number`. Nếu tìm thấy đơn nhưng chưa `paid`, hoặc không tìm thấy → đi tiếp.
- **Điều kiện 15 — `claim_pending_order`, hạt nhân idempotency:**

  ~~~sql
  UPDATE premium_payment_orders
  SET status = 'paid',
      paid_at = :now,
      grant_type = 'payment',
      sepay_transaction_id = :txn_id,   -- chỉ set khi tham số khác null
      raw_ipn = :raw_json               -- chỉ set khi tham số khác null
  WHERE invoice_number = :invoice
    AND status = 'pending'              -- ← điều kiện sống còn
  ~~~
  Đếm `rowCount`. `0` → có request khác đã lấy đơn (hoặc đơn không còn `pending`) → trả
  `already_processed` và **không** gia hạn subscription. `1` → mình là người thắng, tiếp tục
  gia hạn. Đây là lý do gọi lại cùng một IPN 10 lần cũng chỉ cộng thời gian **một** lần.
- `sepay_transaction_id` được set là `transaction_id` của SePay, hoặc — khi payload không có
  `transaction_id` — chuỗi tổng hợp **`"unknown_" + invoice_number`** (ví dụ
  `unknown_IQX_9F3B2C1D4E5A`). Cột này **UNIQUE**, nên hai IPN khác nhau cùng thiếu
  `transaction_id` cho cùng một invoice sẽ không xung đột (cùng giá trị, mà lần 2 không update
  được do `status != 'pending'`), nhưng hai đơn khác nhau cùng nhận một `transaction_id` thật
  sẽ **vi phạm UNIQUE → lỗi DB → 500**. Giữ nguyên ràng buộc UNIQUE; nó là chốt an toàn cuối.
- `raw_ipn` lưu **`JSON.stringify(payload đã validate)`** (Python: `json.dumps(payload.model_dump(), default=str)`)
  — tức là bản đã qua schema, **không** phải body thô. Cột `TEXT`.
- Sau khi claim thành công: nạp `plan` theo `order.plan_id`; **nếu tìm thấy** thì gọi
  `_extend_subscription(order.user_id, plan)`. Nếu không tìm thấy plan (thực tế không xảy ra vì
  FK RESTRICT) thì **đơn vẫn `paid` nhưng subscription không được gia hạn** và vẫn trả
  `processed`. Giữ nguyên thứ tự này (đơn được đánh dấu trước, gia hạn sau).

#### 4. Gia hạn subscription (`_extend_subscription`) — cộng dồn từ ngày hết hạn

Dùng chung cho IPN, `mark-paid`, `admin grant`, `reconcile` và trial:

1. `now = new Date()` (UTC).
2. `atomic_extend_period(user_id, plan_id, plan.duration_days, now)`:
   - `SELECT * FROM premium_subscriptions WHERE user_id = :uid **FOR UPDATE**` (row lock;
     Postgres thật, SQLite thoái hoá thành SELECT thường).
   - Không có dòng → trả `0`.
   - Có dòng:
     - **Nếu `current_period_end > now`** (còn hạn) → `new_start = current_period_start` (giữ
       nguyên), `new_end = current_period_end + duration` → **cộng dồn từ ngày hết hạn, KHÔNG
       phải từ hôm nay**. Người mua sớm không mất ngày nào.
     - **Ngược lại** (đã hết hạn) → `new_start = now`, `new_end = now + duration` → chu kỳ mới
       tính từ hiện tại.
     - Ghi `current_plan_id = plan.id` và **`status = 'active'`** (luôn luôn — kể cả khi đang
       `cancelled`/`expired`, tức là mua mới sẽ **hồi sinh** subscription đã huỷ).
     - Trả `1`.
3. Nếu bước 2 trả `> 0` → đọc lại subscription, set `users.role = 'premium'`, xong.
4. Nếu trả `0` (chưa có subscription) → INSERT mới:
   `current_period_start = now`, `current_period_end = now + duration`, `status = 'active'`.
   - **Nếu INSERT vi phạm UNIQUE(user_id)** (2 request đồng thời) → `rollback`, gọi lại
     `atomic_extend_period` với `now` **mới**, đọc lại, set role, trả về. Bản TS phải tái tạo
     nhánh bắt lỗi unique này — nếu không, IPN song song sẽ ném 500 và SePay retry mãi.
5. `_set_user_role_premium` chạy `UPDATE users SET role='premium', updated_at=now() WHERE id=:uid`
   và **`await session.commit()`** — **commit giữa request**. Đây là hành vi thật và có hệ quả:
   phần mutation trước đó (claim đơn) được commit tại đây, trước khi dòng log IPN được INSERT.
   Khi port sang TypeORM/Prisma, hoặc giữ đúng commit sớm này, hoặc chuyển sang một transaction
   duy nhất **và ghi rõ là thay đổi có ý thức** (một transaction duy nhất an toàn hơn, nhưng
   khác bản gốc).
   Chú ý `UPDATE` này **không** có `WHERE role <> 'admin'` → admin mua Premium sẽ **bị hạ role
   xuống `premium`**, mất quyền admin. Đây là bug thật tồn tại trong bản Python; nếu quyết định
   sửa (thêm `AND role <> 'admin'`) thì ghi vào changelog, đừng sửa lặng lẽ.

#### 5. Bảng `sepay_ipn_logs` — dùng như thế nào

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | sinh phía app (`uuid4`) |
| `received_at` | timestamptz, `DEFAULT now()`, index | thời điểm nhận |
| `secret_key_valid` | boolean NOT NULL, index | `false` cho nhánh 401 |
| `raw_body` | JSON nullable | body **đã parse**; `null` khi không parse được |
| `raw_headers` | JSON nullable | đã **redact** — xem dưới |
| `result_status` | varchar(60) nullable, index | `message` của `process_ipn`, hoặc `secret_invalid` / `invalid_json` / `invalid_payload` |
| `matched_order_id` | uuid nullable, FK `premium_payment_orders(id)` ON DELETE SET NULL, index | tra theo `invoice_number` |
| `sepay_transaction_id` | varchar(200) nullable, index | **KHÔNG UNIQUE** ở bảng này |
| `error_message` | text nullable | chỉ set ở 2 nhánh body hỏng |

- Index tổ hợp: `ix_sepay_ipn_logs_received_status (received_at, result_status)`.
- **Bảng này append-only và KHÔNG có unique key chống trùng.** Gọi lại cùng một IPN 5 lần sẽ
  tạo **5 dòng log** — chống trùng nằm ở `premium_payment_orders` (`status='pending'` guard +
  `sepay_transaction_id` UNIQUE), không ở đây. Đừng thêm unique constraint vào bảng log: job
  `ipn_reconcile` và `POST /admin/ipn/{id}/retry` dựa vào việc mỗi lần chạy đều thêm dòng mới.
- **Redact header:** khi lưu, mọi header có tên (lowercase) thuộc
  `{ 'x-secret-key', 'authorization', 'cookie', 'set-cookie' }` bị thay bằng chuỗi **`"***"`**.
  Tên header giữ nguyên chữ như client gửi, chỉ giá trị bị thay. Bắt buộc giữ — đây là chốt
  chống lộ secret qua endpoint `GET /admin/ipn/{log_id}`.
- **CẢNH BÁO đang tồn tại:** handler ghi `logger.info("IPN received: ... all_headers=%s", ..., dict(request.headers))`
  — **log toàn bộ header, KHÔNG redact**, tức secret có thể nằm trong log file/stdout. Khi
  viết lại, **redact trước khi log** (dùng chính hàm redact ở trên). Đây là sửa lỗi bảo mật, an
  toàn để làm ngay.

#### 6. Rate limit trên webhook — cảnh báo vận hành

`SlowAPIMiddleware` áp `60/minute` theo **IP nguồn** cho *mọi* route, kể cả `/premium/sepay/ipn`.
Nếu SePay burst > 60 callback/phút từ cùng một IP, các callback sau nhận **429** và SePay sẽ
retry. Bản TS nên **loại route webhook khỏi throttler** (`@SkipThrottle()`) hoặc cho nó một
limit riêng cao hơn — đây là cải thiện có chủ ý, ghi rõ trong changelog.

#### 7. Các tình huống nghiệp vụ và kết quả tương ứng

| Tình huống | `message` | Trạng thái đơn sau đó | Premium |
|---|---|---|---|
| Không khớp đơn nào (`invoice_number` lạ) | `order_not_found` | không đổi | không đổi. Log có `matched_order_id = null` |
| Số tiền lệch (trả 90.000 cho đơn 99.000) | `amount_mismatch` | vẫn `pending` | không đổi. **Không** tự động ghi nhận một phần |
| Số tiền có phần lẻ (`"99000.50"`) | `amount_invalid` | vẫn `pending` | không đổi |
| Đơn đã `paid` (SePay gửi lại) | `already_processed` | `paid` | không cộng thêm ngày |
| Đơn đã `failed` (job đẩy sau 24h) rồi tiền mới về | `already_processed` | vẫn `failed` | **KHÔNG** kích hoạt — vì `claim` chỉ nhận `pending`. Cần admin `mark-paid`… nhưng `mark-paid` cũng chỉ nhận `pending` → **đơn này bị kẹt, phải xử lý tay bằng `admin grant`**. Ghi nhớ khi thiết kế quy trình vận hành |
| Đơn đã `cancelled` / `refunded` | `already_processed` | không đổi | không đổi (message hơi gây nhầm — thực chất là "không claim được") |
| `notification_type = 'ORDER_REFUNDED'` (hoặc bất kỳ giá trị khác) | `ignored` | không đổi | không đổi. **Backend KHÔNG tự xử lý refund từ IPN** — refund chỉ qua endpoint admin |
| Hai IPN đồng thời cho cùng đơn | một cái `processed`, cái kia `already_processed` | `paid` | cộng ngày **một** lần |

---

## Nhóm 3 — Quản trị gói Premium & cấp thủ công

Cả 5 endpoint dưới đây yêu cầu `role === 'admin'` (guard `AdminUser`) và 4/5 endpoint ghi
`admin_audit_log`. Chuỗi kiểm tra quyền của guard, theo đúng thứ tự: có Bearer token → token
hợp lệ → `is_active` → `role === 'admin'`.

### GET /api/v1/premium/admin/plans

> **Liệt kê tất cả gói (quản trị)** — bao gồm gói đã tắt và gói nội bộ `TRIAL_7D`.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` |
| **Side-effect** | — (không ghi audit log: đây là hành động đọc) |

**Path params**

—

**Query params**

— (không phân trang, không filter)

**Request body**

—

**Response 200**

~~~ts
type AdminListPremiumPlansResponse = PremiumPlanResponse[];
~~~

~~~json
[
  {
    "id": "0d9c8b7a-6f5e-4d3c-2b1a-098765432100",
    "code": "TRIAL_7D",
    "name": "Dùng thử 7 ngày",
    "description": "Gói dùng thử Premium 7 ngày miễn phí, tự cấp khi đăng ký tài khoản mới.",
    "price_vnd": 0,
    "duration_days": 7,
    "is_active": true,
    "sort_order": -1,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  },
  {
    "id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
    "code": "PREMIUM_1M",
    "name": "Premium 1 tháng",
    "description": "Toàn bộ tín hiệu, AI phân tích cổ phiếu và bộ lọc nâng cao trong 30 ngày.",
    "price_vnd": 99000,
    "duration_days": 30,
    "is_active": true,
    "sort_order": 1,
    "created_at": "2026-05-21T09:30:07.899342+00:00",
    "updated_at": "2026-05-21T09:30:07.899342+00:00"
  },
  {
    "id": "9e8d7c6b-5a49-4382-9716-e5d4c3b2a190",
    "code": "PREMIUM_3M_KHUYENMAI",
    "name": "Premium 3 tháng (đã ngừng bán)",
    "description": null,
    "price_vnd": 249000,
    "duration_days": 90,
    "is_active": false,
    "sort_order": 5,
    "created_at": "2026-06-10T02:00:00+00:00",
    "updated_at": "2026-08-01T07:22:10.884301+00:00"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm**

Chưa có gói nào → `[]`, HTTP 200.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/premium/admin/plans' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- `ORDER BY sort_order ASC, price_vnd ASC` — **giống** endpoint công khai, nhưng **không có**
  bộ lọc `is_active` và **không** ẩn `TRIAL_7D`. Vì `TRIAL_7D` có `sort_order = -1`, nó luôn
  đứng đầu danh sách admin.
- Không phân trang: nếu số gói lớn lên thì phải thêm mới, hiện tại trả hết.
- Đây là endpoint admin **duy nhất** trong nhóm dùng path prefix `/premium/admin/...` thay vì
  `/admin/...`. Router `premium` mang prefix `/premium` nên các route quản trị gói nằm dưới đó.
  Giữ nguyên URL — dashboard đang gọi đúng đường này.

---

### POST /api/v1/premium/admin/plans

> **Tạo gói Premium mới** — `code` phải là duy nhất toàn hệ thống.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` |
| **Side-effect** | INSERT `premium_plans`; INSERT `admin_audit_log` action **`premium.plan.create`** |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
interface AdminCreatePremiumPlanRequest {
  code: string;            // bắt buộc, 1..50 ký tự
  name: string;            // bắt buộc, 1..200 ký tự
  description?: string | null;  // default null
  price_vnd: number;       // bắt buộc, số nguyên > 0 (exclusiveMinimum 0)
  duration_days: number;   // bắt buộc, số nguyên > 0
  is_active?: boolean;     // default true
  sort_order?: number;     // default 0
}
~~~

~~~json
{
  "code": "PREMIUM_3M",
  "name": "Premium 3 tháng",
  "description": "Gói 3 tháng, tiết kiệm 15% so với gói tháng.",
  "price_vnd": 249000,
  "duration_days": 90,
  "is_active": true,
  "sort_order": 2
}
~~~

**Response 201**

~~~ts
type AdminCreatePremiumPlanResponse = PremiumPlanResponse;
~~~

~~~json
{
  "id": "6b5a4938-2716-4e5d-9c3b-2a190f8e7d6c",
  "code": "PREMIUM_3M",
  "name": "Premium 3 tháng",
  "description": "Gói 3 tháng, tiết kiệm 15% so với gói tháng.",
  "price_vnd": 249000,
  "duration_days": 90,
  "is_active": true,
  "sort_order": 2,
  "created_at": "2026-08-17T10:04:12.551204+00:00",
  "updated_at": "2026-08-17T10:04:12.551204+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 409 | `CONFLICT` | `code` đã tồn tại | `Đã tồn tại gói với mã 'PREMIUM_3M'` (nội suy chính `code` client gửi) |
| 422 | — | `price_vnd <= 0`, `duration_days <= 0`, `code`/`name` rỗng hoặc quá dài, thiếu field bắt buộc | body dạng `{ "detail": [ ... ] }` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/premium/admin/plans' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
    "code": "PREMIUM_3M",
    "name": "Premium 3 tháng",
    "description": "Gói 3 tháng, tiết kiệm 15% so với gói tháng.",
    "price_vnd": 249000,
    "duration_days": 90,
    "is_active": true,
    "sort_order": 2
  }'
~~~

**Ghi chú khi viết lại**

- **HTTP 201**, không phải 200. (Các endpoint plan còn lại trả 200.)
- Kiểm tra trùng `code` được làm **ở tầng service bằng một SELECT** trước khi INSERT
  (`get_by_code`) → trả 409 với message tiếng Việt. Ràng buộc UNIQUE ở DB là lưới an toàn
  thứ hai (nếu race thì thành 500). Giữ cả hai lớp.
- Message 409 nội suy `code` **đúng như client gửi** (không upper-case, không trim). Không có
  chuẩn hoá `code` ở đâu cả — `"premium_3m"` và `"PREMIUM_3M"` là hai gói khác nhau.
- `price_vnd` và `duration_days` dùng `gt=0` → **`0` bị từ chối (422)**. Nghĩa là **không thể
  tạo gói miễn phí qua API**; gói `TRIAL_7D` (`price_vnd = 0`) chỉ tồn tại vì được seed bằng
  migration. Nếu cần gói 0đ thì phải seed hoặc UPDATE trực tiếp.
- Audit row ghi **sau** khi tạo, `payload_after` chỉ gồm 3 khoá:
  `{ "code": ..., "name": ..., "price_vnd": ... }` — **không** có `duration_days`,
  `is_active`, `sort_order`. `payload_before` = `null`. `target_entity = "plan"`,
  `target_id = <plan.id dạng chuỗi>`.
- Body được truyền vào service bằng `model_dump()` (tất cả field, kể cả default) → gói mới luôn
  có `is_active`/`sort_order` tường minh.

---

### PATCH /api/v1/premium/admin/plans/{plan_id}

> **Cập nhật gói Premium** — partial update; chỉ field được gửi mới bị thay đổi.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` |
| **Side-effect** | UPDATE `premium_plans`; INSERT `admin_audit_log` action **`premium.plan.update`** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `plan_id` | string (uuid) | uuid hợp lệ | Id gói cần sửa |

**Query params**

—

**Request body**

~~~ts
/** Mọi field optional. Field KHÔNG gửi sẽ không bị ghi; gửi null sẽ ghi null. */
interface AdminUpdatePremiumPlanRequest {
  name?: string | null;
  description?: string | null;
  price_vnd?: number | null;      // nếu gửi số thì phải > 0
  duration_days?: number | null;  // nếu gửi số thì phải > 0
  is_active?: boolean | null;
  sort_order?: number | null;
}
~~~

~~~json
{ "price_vnd": 129000, "description": "Đã cập nhật giá từ 17/08/2026." }
~~~

**Response 200**

~~~ts
type AdminUpdatePremiumPlanResponse = PremiumPlanResponse;
~~~

~~~json
{
  "id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
  "code": "PREMIUM_1M",
  "name": "Premium 1 tháng",
  "description": "Đã cập nhật giá từ 17/08/2026.",
  "price_vnd": 129000,
  "duration_days": 30,
  "is_active": true,
  "sort_order": 1,
  "created_at": "2026-05-21T09:30:07.899342+00:00",
  "updated_at": "2026-08-17T10:12:41.330918+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `plan_id` không tồn tại | `Không tìm thấy gói Premium` |
| 422 | — | `plan_id` không phải uuid, hoặc `price_vnd`/`duration_days` gửi số ≤ 0 | body dạng `{ "detail": [ ... ] }` |

**Fallback / suy giảm**

Body rỗng `{}` → **không** lỗi: service thấy patch rỗng thì trả về plan hiện tại nguyên vẹn
(HTTP 200), và audit row vẫn được ghi nhưng `payload_before`/`payload_after` = `null`
(vì `diff_dict` của hai dict rỗng trả `(None, None)`).

**curl**

~~~bash
curl -sS -X PATCH 'https://api.iqx.vn/api/v1/premium/admin/plans/4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{"price_vnd":129000,"description":"Đã cập nhật giá từ 17/08/2026."}'
~~~

**Ghi chú khi viết lại**

- **`code` KHÔNG sửa được** — không có trong `PlanUpdate`. Muốn đổi mã thì tạo gói mới và tắt
  gói cũ.
- Phân biệt "không gửi" vs "gửi null" là **bắt buộc**: Python dùng
  `model_dump(exclude_unset=True)`. Trong Zod/NestJS phải kiểm `Object.prototype.hasOwnProperty`
  trên body thô, **không** dùng `value === undefined` sau khi DTO đã điền default. Gửi
  `{"description": null}` sẽ **xoá** mô tả; không gửi `description` sẽ giữ nguyên.
- **Thứ tự thao tác** (quan trọng cho audit đúng):
  1. `getPlan(plan_id)` → 404 nếu không có.
  2. `patch = body chỉ gồm field đã gửi`.
  3. `before = { mỗi khoá trong patch: giá trị hiện tại của plan }` — chụp **trước** khi ghi.
  4. `update_plan(plan_id, patch)`.
  5. `diff_dict(before, patch)` → chỉ giữ những khoá **thực sự đổi giá trị**; nếu không khoá nào
     đổi thì cả hai bên là `null`.
  6. Ghi audit `premium.plan.update`, `target_entity = "plan"`, `target_id = plan.id`.
- `diff_dict` so sánh bằng `!==` trên giá trị thô, nên PATCH gửi đúng giá trị cũ sẽ tạo audit
  row với payload `null` (có dòng log nhưng không có diff). Đó là hành vi mong đợi.
- Đổi `price_vnd` **không** ảnh hưởng đơn `pending` đã tạo (đơn giữ `amount_vnd` riêng) — nghĩa
  là user đang ở trang SePay với giá cũ vẫn thanh toán được giá cũ và IPN vẫn khớp.
- Đổi `duration_days` ảnh hưởng **mọi lần gia hạn sau đó**, kể cả đơn `pending` cũ khi IPN về
  (vì `_extend_subscription` đọc `plan.duration_days` tại thời điểm kích hoạt, không phải lúc
  tạo đơn). Đây là bẫy nghiệp vụ thật — ghi rõ cho vận hành.

---

### DELETE /api/v1/premium/admin/plans/{plan_id}

> **Ngừng bán gói (soft-delete)** — chỉ set `is_active = false`; không xoá dòng, không xoá đơn.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans` |
| **Side-effect** | UPDATE `premium_plans SET is_active = false`; INSERT `admin_audit_log` action **`premium.plan.delete`** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `plan_id` | string (uuid) | uuid hợp lệ | Id gói cần ngừng bán |

**Query params**

—

**Request body**

— (DELETE không nhận body)

**Response 200**

~~~ts
/** Trả về chính bản ghi gói SAU khi tắt (không phải 204 No Content). */
type AdminDeletePremiumPlanResponse = PremiumPlanResponse;
~~~

~~~json
{
  "id": "9e8d7c6b-5a49-4382-9716-e5d4c3b2a190",
  "code": "PREMIUM_3M_KHUYENMAI",
  "name": "Premium 3 tháng (khuyến mãi hè)",
  "description": null,
  "price_vnd": 249000,
  "duration_days": 90,
  "is_active": false,
  "sort_order": 5,
  "created_at": "2026-06-10T02:00:00+00:00",
  "updated_at": "2026-08-17T10:20:03.117640+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `plan_id` không tồn tại | `Không tìm thấy gói Premium` |
| 400 | `BAD_REQUEST` | `plan.code === 'TRIAL_7D'` | `Không thể xoá gói TRIAL_7D` |
| 422 | — | `plan_id` không phải uuid | body dạng `{ "detail": [ ... ] }` |

**Fallback / suy giảm**

Gọi lại trên gói đã `is_active = false` → **không lỗi**, trả 200 và vẫn ghi audit row (với
`payload_before = { is_active: false }`, `payload_after = { is_active: false }` — hai bên giống
nhau vì đây **không** dùng `diff_dict`). Idempotent.

**curl**

~~~bash
curl -sS -X DELETE 'https://api.iqx.vn/api/v1/premium/admin/plans/9e8d7c6b-5a49-4382-9716-e5d4c3b2a190' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Không bao giờ DELETE thật.** Dòng `premium_plans` phải tồn tại mãi vì
  `premium_payment_orders.plan_id` là FK **RESTRICT** (đơn cũ chặn xoá) và
  `premium_subscriptions.current_plan_id` là FK **SET NULL**.
- **Thứ tự kiểm tra:** (1) nạp plan → 404; (2) **chặn `TRIAL_7D`** → 400; (3) mới UPDATE.
  Chuỗi `'TRIAL_7D'` hard-code ngay trong handler endpoint (không ở service).
- Audit: `action = "premium.plan.delete"`, `target_entity = "plan"`,
  `payload_before = { "is_active": <giá trị trước> }`, `payload_after = { "is_active": false }`.
  Dùng dict thủ công, **không** qua `diff_dict`.
- Tắt gói **không** ảnh hưởng subscription đang chạy của user (họ vẫn dùng tới hết hạn) và
  **không** huỷ các đơn `pending` trỏ tới gói đó — nhưng `POST /premium/checkout` cho gói đó
  sẽ trả 400 `Gói này không còn khả dụng`. Còn IPN cho đơn `pending` cũ **vẫn kích hoạt bình
  thường** (`process_ipn` không kiểm `plan.is_active`). Đúng và cố ý: khách đã trả tiền thì
  phải được nhận hàng.
- HTTP 200 + body là plan, **không** phải 204.

---

### POST /api/v1/premium/admin/users/{user_id}/grant

> **Cấp Premium thủ công (miễn phí)** — tạo một đơn `GRANT_*` giá 0đ đã `paid` để lưu dấu vết,
> rồi gia hạn subscription.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `premium_plans`, `users`, `premium_payment_orders`, `premium_subscriptions` |
| **Side-effect** | INSERT `premium_payment_orders` (status `paid`, `grant_type='admin_grant'`, `amount_vnd=0`); UPSERT `premium_subscriptions`; UPDATE `users.role='premium'`; INSERT `admin_audit_log` action **`premium.grant`** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | string (uuid) | uuid hợp lệ, user phải tồn tại | Người được cấp |

**Query params**

—

**Request body**

~~~ts
interface AdminGrantPremiumRequest {
  plan_id: string;        // uuid, bắt buộc — quyết định số ngày được cấp
  note?: string | null;   // lý do; KHÔNG bắt buộc, không giới hạn độ dài ở schema
}
~~~

~~~json
{
  "plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
  "note": "Tặng 30 ngày cho KH báo lỗi biểu đồ HPG - ticket #4821"
}
~~~

**Response 201**

~~~ts
type AdminGrantPremiumResponse = PremiumPaymentOrderResponse;
~~~

~~~json
{
  "id": "1f0e2d3c-4b5a-4968-8778-99aabbccddee",
  "invoice_number": "GRANT_7C8D9E0F1A2B",
  "amount_vnd": 0,
  "currency": "VND",
  "status": "paid",
  "paid_at": "2026-08-17T10:31:55.402118+00:00",
  "grant_type": "admin_grant",
  "created_at": "2026-08-17T10:31:55.402118+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 404 | `NOT_FOUND` | `user_id` không tồn tại | `Không tìm thấy người dùng` |
| 404 | `NOT_FOUND` | `plan_id` không tồn tại | `Không tìm thấy gói Premium` |
| 422 | — | Thiếu `plan_id` / uuid sai | body dạng `{ "detail": [ ... ] }` |

**Fallback / suy giảm**

—

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/premium/admin/users/7b1e4d2c-3a5f-4e6b-8c9d-0a1b2c3d4e5f/grant' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
    "plan_id": "4f2b8c1a-9d3e-4a57-b012-7c8d9e0f1a23",
    "note": "Tặng 30 ngày cho KH báo lỗi biểu đồ HPG - ticket #4821"
  }'
~~~

**Ghi chú khi viết lại**

- **HTTP 201.**
- **Thứ tự kiểm tra:** (1) `UserService.get_by_id(user_id)` → nếu `NotFoundError` thì **bắt lại
  và ném `NotFoundError("người dùng")`** để message là `Không tìm thấy người dùng`; (2)
  `plan_repo.get_by_id(plan_id)` → 404 `Không tìm thấy gói Premium`; (3) mới tạo đơn.
- **Format `invoice_number`: `"GRANT_" + uuid4().hex.slice(0,12).toUpperCase()`** — tiền tố
  khác `IQX_` để phân biệt đơn tặng với đơn thật khi soát sổ. Ví dụ `GRANT_7C8D9E0F1A2B`.
- Đơn được tạo **hai bước trong cùng transaction**: INSERT với `status='pending'`,
  `amount_vnd=0`, rồi `mark_admin_grant()` set `status='paid'`, `paid_at=now`,
  `grant_type='admin_grant'`, `granted_by_user_id=<admin.id>`, `grant_note=<note>`.
  Bản TS có thể INSERT thẳng `paid` — kết quả DB giống nhau; giữ `amount_vnd = 0`.
- **Không** đi qua `claim_pending_order` (khác `mark-paid`) nên **không** có bảo vệ đồng thời:
  gọi 2 lần liên tiếp tạo **2 đơn** và **cộng dồn 2 lần** thời hạn. Đây là hành vi thật (test
  `test_admin_grant_stacks_time` xác nhận cộng dồn). Nếu UI có nút "Tặng gói" thì phải tự chống
  double-click.
- Gia hạn dùng chung `_extend_subscription` → **cộng dồn từ `current_period_end`** nếu còn hạn,
  ngược lại tính từ `now`. Cùng `plan.duration_days` như mua thật.
- `users.role` được set `premium` (kèm cảnh báo ở mục IPN §4: **admin được cấp gói sẽ bị hạ role
  xuống `premium`**).
- **Audit row có điểm lệch cần giữ nguyên:** `action = "premium.grant"`,
  `target_entity = "subscription"` nhưng `target_id = <ORDER id>` (id đơn, không phải id
  subscription). `payload_after = { "user_id": <uuid chuỗi>, "plan_id": <uuid chuỗi>, "note": <note> }`,
  `payload_before = null`. Đừng "sửa cho hợp lý" — công cụ soát sổ đang tra theo cặp
  `(entity, id)` này.
- Có thể cấp `TRIAL_7D` qua endpoint này (không bị chặn), và nó **không** bị ràng buộc "mỗi user
  1 lần" — ràng buộc đó chỉ nằm ở `grant_trial_if_eligible` lúc đăng ký. Admin cấp `TRIAL_7D`
  10 lần sẽ cộng 70 ngày.



