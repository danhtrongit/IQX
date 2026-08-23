# Endpoint — Giao dịch ảo (người dùng + quản trị)

Chương này đặc tả **24 endpoint** của phân hệ Giao dịch ảo (virtual trading): tài khoản ảo 1 tỷ VND, đặt/huỷ lệnh theo giá thật của TTCK Việt Nam, danh mục + NAV, thanh toán T0/T2, bảng xếp hạng công khai, và hai nhóm endpoint quản trị. Mọi số tiền là **số nguyên đồng VND** (BigInteger), phí/thuế theo **basis point** (1 bps = 0,01%). Đây là chương "tiền" — sai một phép làm tròn là sai sổ, nên phần `Nghiệp vụ nền` phải được đọc trước khi viết bất kỳ endpoint nào.

Nguồn sự thật: bản cắt OpenAPI (hình dạng) + `app/api/v1/endpoints/virtual_trading.py`, `app/api/v1/endpoints/admin_vt.py`, `app/services/virtual_trading/{service,settlement,price_resolver}.py`, `app/services/admin_vt.py`, `app/models/virtual_trading.py`, `app/repositories/virtual_trading.py` (hành vi).

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | POST | `/api/v1/virtual-trading/account/activate` | Bearer + Premium | Kích hoạt tài khoản ảo (nạp vốn khởi tạo) |
| 2 | GET | `/api/v1/virtual-trading/account` | Bearer | Tóm tắt tài khoản ảo của chính mình |
| 3 | GET | `/api/v1/virtual-trading/portfolio` | Bearer | Danh mục + NAV + lãi/lỗ chưa thực hiện |
| 4 | POST | `/api/v1/virtual-trading/refresh` | Bearer | Khớp lệnh limit chờ, hết hạn GFD, thanh toán T+2 |
| 5 | POST | `/api/v1/virtual-trading/orders` | Bearer | Đặt lệnh (market khớp ngay / limit vào chờ) |
| 6 | GET | `/api/v1/virtual-trading/orders` | Bearer | Danh sách lệnh có lọc + phân trang |
| 7 | POST | `/api/v1/virtual-trading/orders/{order_id}/cancel` | Bearer | Huỷ lệnh đang chờ, hoàn phong toả |
| 8 | GET | `/api/v1/virtual-trading/trades` | Bearer | Lịch sử khớp lệnh |
| 9 | GET | `/api/v1/virtual-trading/leaderboard` | Công khai | Bảng xếp hạng NAV/lợi nhuận/%lợi nhuận |
| 10 | GET | `/api/v1/virtual-trading/admin/config` | Bearer + Admin | Lấy cấu hình đang hoạt động |
| 11 | PATCH | `/api/v1/virtual-trading/admin/config` | Bearer + Admin | Cập nhật cấu hình (phí, thuế, lô, T0/T2, ngày nghỉ) |
| 12 | POST | `/api/v1/virtual-trading/admin/users/{user_id}/reset` | Bearer + Admin | Đặt lại tài khoản ảo của 1 người dùng |
| 13 | POST | `/api/v1/virtual-trading/admin/reset-all` | Bearer + Admin | Đặt lại toàn bộ tài khoản ảo |
| 14 | GET | `/api/v1/virtual-trading/admin/accounts` | Bearer + Admin | Liệt kê tài khoản ảo (lọc + phân trang) |
| 15 | GET | `/api/v1/admin/vt/accounts/{account_id}` | Bearer + Admin | Chi tiết 1 tài khoản ảo (kèm trạng thái khoá) |
| 16 | GET | `/api/v1/admin/vt/accounts/{account_id}/positions` | Bearer + Admin | Vị thế của tài khoản (không phân trang) |
| 17 | GET | `/api/v1/admin/vt/accounts/{account_id}/orders` | Bearer + Admin | Lệnh của tài khoản (phân trang + lọc ngày) |
| 18 | GET | `/api/v1/admin/vt/accounts/{account_id}/trades` | Bearer + Admin | Giao dịch của tài khoản (phân trang) |
| 19 | GET | `/api/v1/admin/vt/accounts/{account_id}/ledger` | Bearer + Admin | Sổ cái tiền mặt (phân trang) |
| 20 | GET | `/api/v1/admin/vt/accounts/{account_id}/settlements` | Bearer + Admin | Bản ghi thanh toán T+N (phân trang) |
| 21 | GET | `/api/v1/admin/vt/accounts/{account_id}/stats` | Bearer + Admin | Thống kê tài khoản (PnL gần đúng) |
| 22 | POST | `/api/v1/admin/vt/accounts/{account_id}/cash-adjust` | Bearer + Admin | Cộng/trừ tiền mặt + ghi sổ cái + audit |
| 23 | POST | `/api/v1/admin/vt/accounts/{account_id}/freeze` | Bearer + Admin | Tạm khoá tài khoản (chặn đặt lệnh) |
| 24 | POST | `/api/v1/admin/vt/accounts/{account_id}/unfreeze` | Bearer + Admin | Mở khoá tài khoản |

---

## Kiểu dữ liệu dùng chung

#### Enum

~~~ts
type SettlementMode  = "T0" | "T2";
type AccountStatus   = "active" | "suspended";
type OrderSide       = "buy" | "sell";
type OrderType       = "market" | "limit";
type OrderStatus     = "pending" | "filled" | "cancelled" | "expired" | "rejected";
type SettlementKind  = "buy_qty_release" | "sell_cash_release";
type SettlementStatus = "pending" | "settled";
/** Nhãn chế độ trên lệnh: sân tập (Cấp 0, miễn phí) vs thực chiến (Premium). */
type OrderMode       = "san_tap" | "thuc_chien";
/** kind của sổ cái tiền: cột String tự do, các giá trị thực tế do code sinh ra. */
type LedgerKind      = "activate" | "reset" | "buy" | "sell" | "admin_adjust";
~~~

#### Envelope lỗi (toàn app)

~~~ts
interface ErrorBody { detail: string; code: string | null; }
~~~

`code` là một trong `NOT_FOUND | CONFLICT | UNAUTHORIZED | FORBIDDEN | BAD_REQUEST | UNPROCESSABLE_ENTITY | SERVICE_UNAVAILABLE` (xem `app/core/exceptions.py`). Riêng lỗi validate body/query do framework sinh (Pydantic) trả 422 với hình dạng khác: `{ "detail": [ { "loc": [...], "msg": "...", "type": "..." } ] }`.

#### Response dùng nhiều lần

~~~ts
interface AccountResponse {
  id: string;                  // uuid
  user_id: string;             // uuid
  status: AccountStatus;
  initial_cash_vnd: number;    // vốn khởi tạo (mốc tính % lợi nhuận)
  cash_available_vnd: number;  // tiền dùng được ngay
  cash_reserved_vnd: number;   // tiền phong toả cho lệnh mua limit đang chờ
  cash_pending_vnd: number;    // tiền bán T+2 chưa về
  total_cash_vnd: number;      // available + reserved + pending (endpoint tự tính)
  activated_at: string;        // ISO datetime
  reset_at: string | null;
  created_at: string;
}

interface OrderResponse {
  id: string; account_id: string;
  symbol: string; mode: OrderMode;
  side: OrderSide; order_type: OrderType; status: OrderStatus;
  quantity: number;
  limit_price_vnd: number | null;
  reserved_cash_vnd: number;      // luôn 0 khi lệnh đã ở trạng thái cuối
  reserved_quantity: number;      // luôn 0 khi lệnh đã ở trạng thái cuối
  filled_price_vnd: number | null;
  gross_amount_vnd: number | null;
  fee_vnd: number | null;
  tax_vnd: number | null;
  net_amount_vnd: number | null;  // mua: âm (=-total_cost); bán: dương (=proceeds)
  trading_date: string;           // "YYYY-MM-DD"
  rejection_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
}

interface PositionResponse {
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;   // bán được ngay
  quantity_pending: number;    // mua T+2 chưa về
  quantity_reserved: number;   // khoá cho lệnh bán limit đang chờ
  avg_cost_vnd: number;        // giá vốn TB/CP (chia lấy sàn)
  current_price_vnd: number | null;
  market_value_vnd: number | null;
  unrealized_pnl_vnd: number | null;
}

interface TradeResponse {
  id: string; order_id: string;
  symbol: string; side: OrderSide;
  quantity: number; price_vnd: number;
  gross_amount_vnd: number; fee_vnd: number; tax_vnd: number; net_amount_vnd: number;
  price_source: "realtime" | "close";
  price_time: string;   // thời điểm lấy giá (ISO, UTC)
  traded_at: string;    // thời điểm khớp (ISO, UTC)
}

interface PaginatedResponse<T> {
  items: T[]; total: number; page: number; page_size: number; total_pages: number;
}
~~~

#### Response nhóm quản trị mới (`/admin/vt/*`)

~~~ts
interface VTAccountAdminResponse {
  id: string; user_id: string; status: AccountStatus;
  initial_cash_vnd: number; cash_available_vnd: number;
  cash_reserved_vnd: number; cash_pending_vnd: number;
  activated_at: string | null;
  frozen_at: string | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_at: string;
}

interface VTPositionResponse {
  id: string; account_id: string; symbol: string;
  quantity_total: number; quantity_sellable: number;
  quantity_pending: number; quantity_reserved: number;
  avg_cost_vnd: number; created_at: string;
}

interface VTOrderResponse {
  id: string; account_id: string; user_id: string;
  symbol: string; side: OrderSide; order_type: OrderType; status: OrderStatus;
  quantity: number; limit_price_vnd: number | null; filled_price_vnd: number | null;
  gross_amount_vnd: number | null; fee_vnd: number | null; tax_vnd: number | null;
  net_amount_vnd: number | null; trading_date: string;
  rejection_reason: string | null; cancel_reason: string | null; created_at: string;
}                                     // KHÔNG có field `mode`

interface VTTradeResponse {
  id: string; order_id: string; account_id: string;
  symbol: string; side: OrderSide; quantity: number; price_vnd: number;
  gross_amount_vnd: number; fee_vnd: number; tax_vnd: number; net_amount_vnd: number;
  price_source: string; traded_at: string; created_at: string;
}                                     // KHÔNG có field `price_time`

interface VTLedgerResponse {
  id: string; account_id: string;
  amount_vnd: number;          // CÓ DẤU: mua/trừ tiền là số âm
  balance_after_vnd: number;   // = cash_available_vnd sau bút toán
  kind: LedgerKind;
  reference_type: string | null;   // "trade" | "admin_audit" | null
  reference_id: string | null;     // uuid của trade (null với admin_adjust)
  note: string | null; created_at: string;
}

interface VTSettlementResponse {
  id: string; account_id: string; trade_id: string;
  kind: SettlementKind;
  amount: number;              // buy_qty_release: số CP; sell_cash_release: số VND
  symbol: string | null;       // chỉ có với buy_qty_release
  due_date: string;            // "YYYY-MM-DD"
  status: SettlementStatus; settled_at: string | null; created_at: string;
}

interface VTAccountStatsResponse {
  account_id: string;
  total_orders: number; total_trades: number;
  gross_buy_vnd: number; gross_sell_vnd: number;
  realized_pnl_vnd: number; turnover_vnd: number;
  win_rate: number | null;     // LUÔN null (chưa cài)
}
~~~

---

## Nghiệp vụ nền

#### 1. Ba nhóm quyền — và vì sao có **hai** nhóm quản trị

| Nhóm | Prefix | Quyền | Vai trò |
|---|---|---|---|
| Người dùng | `/api/v1/virtual-trading/*` | Bearer (một endpoint cần Premium) | Người chơi tự giao dịch, chỉ thấy dữ liệu của chính mình |
| Quản trị **cũ** | `/api/v1/virtual-trading/admin/*` | Bearer + Admin | Cấu hình hệ thống + reset + liệt kê tài khoản. Được viết cùng lúc với phân hệ, nằm chung router `virtual_trading.py` |
| Quản trị **mới** | `/api/v1/admin/vt/*` | Bearer + Admin | "Account 360" theo từng tài khoản: xem sổ cái/lệnh/khớp/thanh toán + khoá/mở khoá + điều chỉnh tiền. Router riêng `admin_vt.py`, service riêng `AdminVTService`, và **luôn ghi audit log cho thao tác ghi** |

Hai nhóm KHÔNG trùng chức năng: nhóm cũ làm việc theo **user_id** và ở tầm hệ thống (config, reset), nhóm mới làm việc theo **account_id** và ở tầm điều tra/hỗ trợ một tài khoản. Khi viết lại: **giữ cả hai** (frontend admin đang gọi cả hai), nhưng UI/tài liệu nội bộ nên hướng người vận hành dùng `/admin/vt/*` cho mọi thao tác trên một tài khoản cụ thể vì chỉ nhóm này ghi `admin_audit_logs` đầy đủ (before/after/ip/user_agent/request_id). Nhóm cũ chỉ ghi audit cho `PATCH admin/config`, `users/{id}/reset`, `reset-all`; `GET admin/accounts` và `GET admin/config` không ghi audit.

#### 2. Toán tiền (BẮT BUỘC ĐÚNG TỪNG ĐỒNG)

~~~ts
/** Phí/thuế theo basis point, làm tròn nửa lên bằng số học nguyên. */
function roundBps(amountVnd: bigint, rateBps: number): bigint {
  return (amountVnd * BigInt(rateBps) + 5000n) / 10000n;   // amount >= 0
}
~~~

- Python gốc: `_round_bps(amount, bps) = (amount * bps + 5000) // 10000` (`app/services/virtual_trading/service.py:58`). Ví dụ kiểm chứng trong test: `_round_bps(10_000_000, 15) == 15_000`, `_round_bps(1_000_000, 0) == 0`.
- Mua: `gross = price_vnd * quantity`; `fee = roundBps(gross, buy_fee_rate_bps)`; `total_cost = gross + fee`; `net_amount_vnd = -total_cost`; `tax = 0`.
- Bán: `gross = price_vnd * quantity`; `fee = roundBps(gross, sell_fee_rate_bps)`; `tax = roundBps(gross, sell_tax_rate_bps)`; `proceeds = gross - fee - tax`; `net_amount_vnd = +proceeds`. **Phí và thuế đều tính trên `gross`, không tính chồng nhau.**
- Giá vốn trung bình khi mua thêm (chia **LẤY SÀN**):
  `new_avg = ((old_avg * old_total) + (price_vnd * quantity)) / new_total` với phép chia số nguyên; nếu `new_total <= 0` thì `new_avg = 0`. Bán **KHÔNG** thay đổi `avg_cost_vnd`.
- Ngưỡng cứng trong service: `quantity <= 1_000_000`; `limit_price_vnd <= 10_000_000`; `gross <= 100_000_000_000` (100 tỷ VND).

#### 3. Snapshot cấu hình tại thời điểm đặt lệnh

Mỗi lệnh lưu `config_snapshot` (TEXT chứa JSON) gồm đúng 5 khoá:

~~~json
{"buy_fee_rate_bps":15,"sell_fee_rate_bps":15,"sell_tax_rate_bps":10,"settlement_mode":"T0","board_lot_size":100}
~~~

Khi khớp một lệnh limit đang chờ (trong `POST /refresh`), phí/thuế/chế độ thanh toán được đọc **từ snapshot của lệnh đó**, KHÔNG đọc lại config hiện tại; thiếu khoá nào thì mới lấy từ config hiện tại làm phòng vệ. Nhờ vậy admin sửa phí không tác động ngược vào lệnh đã đặt.

#### 4. Cấp 0 (sân tập) vs Premium (thực chiến)

`POST /orders` KHÔNG yêu cầu Premium. Endpoint tự tính `is_premium` (admin luôn tính là premium) rồi truyền vào service:

- `is_premium = true` → `mode = "thuc_chien"`, chế độ thanh toán = `config.settlement_mode`.
- `is_premium = false` → `mode = "san_tap"`, chế độ thanh toán **luôn T0** bất kể config đang là T2.

Đây là cách duy nhất hệ thống "hạn chế Cấp 0": không chặn lệnh, chỉ **ép nhãn + ép T0**. Mặc định của tham số là `false` (fail-closed).

#### 5. T+N — quy tắc chính xác

- Lịch giao dịch: Thứ 2–Thứ 6, **loại trừ** các ngày trong `config.holidays` (danh sách chuỗi `"YYYY-MM-DD"`). Không có nguồn lịch nghỉ tự động — admin phải nhập tay.
- `trading_date` của lệnh = hôm nay theo giờ VN (UTC+7) nếu hôm nay là ngày giao dịch; nếu không thì **ngày giao dịch gần nhất trong quá khứ**.
- **T0**: mua → CP vào `quantity_sellable` ngay; bán → tiền vào `cash_available_vnd` ngay. Không sinh bản ghi settlement.
- **T2**: mua → CP vào `quantity_pending`, sinh settlement `buy_qty_release(amount = quantity, symbol)`; bán → `proceeds` vào `cash_pending_vnd`, sinh settlement `sell_cash_release(amount = proceeds, symbol = null)`. `due_date = add_trading_days(trading_date, 2, holidays)` — cộng 2 **ngày giao dịch**, nhảy qua cuối tuần và ngày nghỉ.
- Tiền/CP chỉ thực sự chuyển khi có ai gọi `POST /refresh` cho tài khoản đó và `due_date <= hôm nay (giờ VN)`. **Không có cron nào tự settle** — quá hạn bao lâu không quan trọng, lần refresh đầu tiên sẽ settle hết.
- Khi release CP: `release = min(settlement.amount, position.quantity_pending)` (chống release âm), rồi `pending -= release; sellable += release`. Với tiền: `cash_pending -= amount; cash_available += amount` (không kẹp).

#### 6. Bộ phân giải giá (`price_resolver`)

- Phiên giao dịch VN (UTC+7): 09:00–11:30 và 13:00–14:45, chỉ ngày trong tuần, trừ `holidays`. So sánh theo cặp `(giờ, phút)`, biên dưới đóng, biên trên mở.
- **Trong phiên**: thử VCI intraday (`fetch_intraday(symbol, page_size=1)`, lấy `close_price` rồi `price`, đơn vị **VND, nhân 1**) → nếu không có thì rơi xuống giá đóng cửa.
- **Ngoài phiên / cuối tuần / ngày nghỉ**: chỉ dùng giá đóng cửa: VNDIRECT OHLCV 1D 7 ngày gần nhất (`close` rồi `adClose`, đơn vị **kVND → nhân 1000**) → nếu lỗi thì VCI OHLCV 1D (`close` rồi `closePrice`, đơn vị **VND, nhân 1**).
- Giá `<= 0`, không phải số, hoặc kết quả nhân ra `<= 0` → coi như không có giá. Hết mọi nguồn → `PriceUnavailableError("<SYMBOL>: All price sources failed")`.
- `price_source` ghi vào trade là `"realtime"` hoặc `"close"`; `price_time` là **thời điểm gọi hàm (now UTC)**, KHÔNG phải timestamp của nến/khớp lệnh.

#### 7. Kiểm tra mã chứng khoán

`validate_symbol` lấy toàn bộ danh sách mã từ VCI (`fetch_symbols_by_exchange`), giữ các mã có `exchange ∈ {HOSE, HNX, UPCOM}` và `asset_type ∈ {"stock", null, ""}`, cache **trong tiến trình** 300 giây (có lock chống refresh đồng thời). Fail-closed: nguồn lỗi hoặc trả rỗng → ném lỗi → endpoint trả **503**, không tạo lệnh.

#### 8. Rate limit & cache

- Rate limit toàn cục theo IP: `60/minute` (`RATE_LIMIT_DEFAULT`), áp bằng middleware SlowAPI. **Không endpoint nào trong chương này có giới hạn riêng.** Vượt hạn → 429 (thân lỗi do SlowAPI sinh).
- **Không có cache Redis** cho bất kỳ endpoint nào ở đây. Cache duy nhất là danh sách mã trong bộ nhớ tiến trình (TTL 300s) — khi viết lại bằng NestJS nhiều instance, nên chuyển sang Redis với TTL 300s để hành vi nhất quán.

---

## Nhóm 1 — Tài khoản & danh mục (người dùng)

### POST /api/v1/virtual-trading/account/activate

> **Kích hoạt tài khoản giao dịch ảo** — tạo tài khoản ảo và nạp vốn khởi tạo theo cấu hình hệ thống.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin cũng qua được vì admin được tính là premium) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`virtual_trading_configs`, `virtual_trading_accounts`) |
| **Side-effect** | INSERT `virtual_trading_accounts`; INSERT `virtual_cash_ledger` (`kind="activate"`); có thể INSERT `virtual_trading_configs` nếu chưa có config nào |

**Path params** — —
**Query params** — —
**Request body** — không có body.

**Response 201** — `AccountResponse`

~~~ts
type ActivateAccountResponse = AccountResponse;
~~~

~~~json
{
  "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
  "status": "active",
  "initial_cash_vnd": 1000000000,
  "cash_available_vnd": 1000000000,
  "cash_reserved_vnd": 0,
  "cash_pending_vnd": 0,
  "total_cash_vnd": 1000000000,
  "activated_at": "2026-08-17T02:15:33.412000Z",
  "reset_at": null,
  "created_at": "2026-08-17T02:15:33.412000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không có Premium hiệu lực | `Yêu cầu gói Premium đang hoạt động` |
| 403 | `FORBIDDEN` | `config.trading_enabled = false` | `Giao dịch ảo hiện đang bị tạm dừng` |
| 409 | `CONFLICT` | Đã có tài khoản ảo | `Tài khoản giao dịch ảo đã tồn tại` |

**Fallback / suy giảm** — Nếu bảng config chưa có dòng `is_active = true`, service **tự tạo** config mặc định (`initial_cash_vnd = 1_000_000_000`, `buy_fee_rate_bps = 15`, `sell_fee_rate_bps = 15`, `sell_tax_rate_bps = 10`, `settlement_mode = "T0"`, `board_lot_size = 100`, `trading_enabled = true`, `holidays = null`) rồi dùng luôn. Không phụ thuộc provider ngoài nên không có nhánh suy giảm khác.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/account/activate' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f2b1c90-0d44-4a1e-9c73-8ab2e5d61f07'
~~~

**Ghi chú khi viết lại** — Thứ tự kiểm tra: (1) tồn tại tài khoản → 409 **trước**; (2) `trading_enabled` → 403. Gọi lần 2 luôn 409, **không idempotent**, không cấp thêm tiền. `activated_at` do code set (`now UTC`), không dùng default DB. `total_cash_vnd` không có trong DB — endpoint tự cộng 3 quỹ tiền; nếu quên, mặc định trả 0 (Pydantic default) → bug thầm lặng. Ràng buộc DB `uq_vt_accounts_user_id` là chốt cuối cho race condition: bắt lỗi unique và ánh xạ về 409.

---

### GET /api/v1/virtual-trading/account

> **Tóm tắt tài khoản ảo** — trả 4 quỹ tiền và trạng thái tài khoản của chính người gọi.

| | |
|---|---|
| **Quyền** | Bearer (KHÔNG cần Premium — người dùng Cấp 0 đọc được tài khoản sân tập của mình) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trading_accounts` (theo `user_id` từ token) |
| **Side-effect** | không |

**Path params** — —
**Query params** — —
**Request body** — —

**Response 200** — `AccountResponse` (xem "Kiểu dữ liệu dùng chung")

~~~ts
type GetAccountResponse = AccountResponse;
~~~

~~~json
{
  "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
  "status": "active",
  "initial_cash_vnd": 1000000000,
  "cash_available_vnd": 812350000,
  "cash_reserved_vnd": 60090000,
  "cash_pending_vnd": 0,
  "total_cash_vnd": 872440000,
  "activated_at": "2026-07-01T01:10:00.000000Z",
  "reset_at": null,
  "created_at": "2026-07-01T01:10:00.000000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | Chưa kích hoạt tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |

**Fallback / suy giảm** — Không gọi provider ngoài, luôn phản hồi được. Tài khoản bị admin khoá vẫn đọc được (chỉ `status = "suspended"`, đọc không bị chặn).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/account' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0c9d3f21-4e8a-4d1b-b6c2-7f5019ae3d84'
~~~

**Ghi chú khi viết lại** — Chỉ được truy vấn theo `user_id` lấy từ token; không nhận `user_id` từ query (tránh IDOR). `frozen_at`/`freeze_reason` **không** xuất hiện trong response người dùng — nếu frontend cần hiển thị "tài khoản đang bị khoá", suy ra từ `status = "suspended"`.

---

### GET /api/v1/virtual-trading/portfolio

> **Danh mục đầu tư** — vị thế + giá hiện tại + NAV + lãi/lỗ chưa thực hiện; **chỉ đọc, không thay đổi trạng thái**.

| | |
|---|---|
| **Quyền** | Bearer (không cần Premium) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không (mỗi mã gọi provider 1 lần mỗi request) |
| **Nguồn dữ liệu** | DB (`virtual_trading_accounts`, `virtual_positions`) + provider ngoài VCI/VNDIRECT cho giá |
| **Side-effect** | không mutate dữ liệu giao dịch; có thể INSERT config mặc định nếu chưa có |

**Path params** — —
**Query params** — —
**Request body** — —

**Response 200**

~~~ts
interface PortfolioResponse {
  account: AccountResponse;
  positions: PositionResponse[];
  total_market_value_vnd: number;
  nav_vnd: number;                    // total_cash + total_market_value
  total_unrealized_pnl_vnd: number;
  return_pct: number;                 // làm tròn 2 chữ số thập phân
  refresh_warnings: string[];         // LUÔN [] ở endpoint này
}
~~~

~~~json
{
  "account": {
    "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
    "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
    "status": "active",
    "initial_cash_vnd": 1000000000,
    "cash_available_vnd": 812350000,
    "cash_reserved_vnd": 0,
    "cash_pending_vnd": 0,
    "total_cash_vnd": 812350000,
    "activated_at": "2026-07-01T01:10:00.000000Z",
    "reset_at": null,
    "created_at": "2026-07-01T01:10:00.000000Z"
  },
  "positions": [
    {
      "symbol": "FPT",
      "quantity_total": 2000,
      "quantity_sellable": 2000,
      "quantity_pending": 0,
      "quantity_reserved": 0,
      "avg_cost_vnd": 93500,
      "current_price_vnd": 96800,
      "market_value_vnd": 193600000,
      "unrealized_pnl_vnd": 6600000
    },
    {
      "symbol": "VNM",
      "quantity_total": 1000,
      "quantity_sellable": 1000,
      "quantity_pending": 0,
      "quantity_reserved": 0,
      "avg_cost_vnd": 61200,
      "current_price_vnd": null,
      "market_value_vnd": null,
      "unrealized_pnl_vnd": null
    }
  ],
  "total_market_value_vnd": 193600000,
  "nav_vnd": 1005950000,
  "total_unrealized_pnl_vnd": 6600000,
  "return_pct": 0.6,
  "refresh_warnings": []
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | Chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |

**Fallback / suy giảm** — Vị thế nào không lấy được giá thì vẫn xuất hiện trong `positions` nhưng `current_price_vnd = market_value_vnd = unrealized_pnl_vnd = null`, và **không** được cộng vào `total_market_value_vnd`, `nav_vnd`, `total_unrealized_pnl_vnd` (NAV bị hụt phần đó — frontend nên cảnh báo). Vị thế có `quantity_total <= 0` bị **loại khỏi danh sách**. Ngoài giờ giao dịch: dùng giá đóng cửa gần nhất, không lỗi.

**Công thức**

~~~
market_value_vnd     = current_price_vnd * quantity_total
cost                 = avg_cost_vnd      * quantity_total
unrealized_pnl_vnd   = market_value_vnd - cost
total_cash           = cash_available + cash_reserved + cash_pending
nav_vnd              = total_cash + total_market_value_vnd
return_pct           = initial_cash_vnd > 0
                       ? round((nav_vnd - initial_cash_vnd) / initial_cash_vnd * 100, 2)
                       : 0.0
~~~

Lãi/lỗ **đã thực hiện** KHÔNG có ở endpoint này. Chỉ có xấp xỉ ở `GET /admin/vt/accounts/{id}/stats` (`realized_pnl_vnd = tổng net bán − |tổng net mua|`).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/portfolio' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7d4e1b02-93c5-4a67-8f21-c0b4d6e29a13'
~~~

**Ghi chú khi viết lại** — `refresh_warnings` là di sản của phiên bản cũ (portfolio từng tự refresh); service hiện **không bao giờ** điền, luôn `[]`. Giữ field để không phá client. Giá được resolve **tuần tự từng mã** → danh mục 20 mã là 20 lượt gọi provider trong 1 request: nên gom song song (`Promise.all`) + cache ngắn, nhưng phải giữ nguyên quy tắc "mã lỗi giá → null, không cộng vào tổng". `return_pct` là `number` (float) — dùng `Number(...)` chứ không BigInt, và làm tròn 2 chữ số **ở server**.

---

### POST /api/v1/virtual-trading/refresh

> **Làm mới tài khoản** — khớp lệnh limit đang chờ, cho hết hạn lệnh GFD quá ngày, và thanh toán các bản ghi T+2 đã đến hạn.

| | |
|---|---|
| **Quyền** | Bearer (không cần Premium) |
| **Rate limit** | mặc định 60/minute/IP (KHÔNG có giới hạn riêng) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider ngoài (giá cho từng mã có lệnh chờ) |
| **Side-effect** | UPDATE `virtual_orders`, `virtual_positions`, `virtual_trading_accounts`, `virtual_settlements`; INSERT `virtual_trades`, `virtual_cash_ledger` |

**Path params** — —
**Query params** — —
**Request body** — không có body.

**Response 200**

~~~ts
interface RefreshResponse {
  orders_filled: number;
  orders_expired: number;
  settlements_settled: number;
  warnings: string[];       // mỗi phần tử: mã không lấy được giá, lệnh vẫn chờ
}
~~~

~~~json
{
  "orders_filled": 1,
  "orders_expired": 2,
  "settlements_settled": 3,
  "warnings": ["Không có giá cho VNM, lệnh 4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6 vẫn ở trạng thái chờ"]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | Chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 400 | `BAD_REQUEST` | Khi khớp lệnh mua limit mà giá tăng làm thiếu tiền | `Không đủ tiền sau khi giá thay đổi` |

**Fallback / suy giảm** — Mã không lấy được giá: **không** lỗi HTTP, lệnh giữ `pending`, thêm 1 dòng vào `warnings`. Ngoài giờ giao dịch: dùng giá đóng cửa → lệnh limit VẪN có thể khớp ngoài phiên (hành vi thực tế của source, không phải bug đã sửa). Tài khoản bị khoá vẫn refresh được (không kiểm tra `frozen_at`).

**Trình tự xử lý (giữ đúng thứ tự)**

1. Lock tài khoản (`SELECT … FOR UPDATE`) theo `user_id`; không có → 404.
2. Lấy config, parse `holidays`, tính `trading_date` hiện tại theo giờ VN.
3. Với **từng** lệnh `pending` của tài khoản: nếu `order.trading_date < trading_date` → `expired`, hoàn phong toả (mua: `cash_reserved -= r; cash_available += r`; bán: `quantity_reserved -= q; quantity_sellable += q`), xoá phong toả trên lệnh về 0, `orders_expired++`, sang lệnh kế.
4. Ngược lại: resolve giá. Mua khớp khi `price <= limit_price`; bán khớp khi `price >= limit_price`. Khớp thì tính phí/thuế/settlement **từ `config_snapshot` của lệnh**, `orders_filled++`.
5. Sau khi xử lý hết lệnh: lấy settlement `pending` có `due_date <= hôm nay (giờ VN)`, release CP hoặc tiền, đặt `status = "settled"`, `settled_at = now UTC`, `settlements_settled++`.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/refresh' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b1f7c3d5-6a20-4e98-9c14-3d5e8f0a7b62'
~~~

**Ghi chú khi viết lại** — **Idempotent về kết quả cuối, không idempotent về con số trả về**: gọi lần 2 ngay sau lần 1 sẽ trả `0/0/0` vì không còn việc để làm; không có lệnh nào bị khớp hai lần (mỗi lệnh chuyển khỏi `pending`, mỗi settlement chuyển khỏi `pending`). Nhưng chạy hai request song song cho cùng tài khoản có thể khớp đôi nếu bỏ lock hàng tài khoản → **phải giữ `FOR UPDATE` trên account**. Bước 5 dùng **ngày hôm nay** (`today`), không dùng `trading_date` — settlement đến hạn vào ngày nghỉ vẫn được settle nếu người dùng gọi refresh trong ngày nghỉ đó. Không có scheduler: nếu muốn tự động settle, phải viết cron mới (không tồn tại trong bản Python) và ghi rõ vào tài liệu vận hành.

---

## Nhóm 2 — Lệnh & giao dịch (người dùng)

### POST /api/v1/virtual-trading/orders

> **Đặt lệnh giao dịch ảo** — endpoint quan trọng nhất: lệnh `market` khớp ngay, lệnh `limit` vào trạng thái chờ kèm phong toả.

| | |
|---|---|
| **Quyền** | Bearer (KHÔNG cần Premium; non-premium bị ép `mode="san_tap"` + T0) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không (danh sách mã hợp lệ cache trong tiến trình 300s) |
| **Nguồn dữ liệu** | DB + provider ngoài VCI (validate mã, giá intraday) / VNDIRECT (giá đóng cửa) |
| **Side-effect** | INSERT `virtual_orders`; khi khớp: INSERT `virtual_trades`, UPSERT `virtual_positions`, UPDATE `virtual_trading_accounts`, INSERT `virtual_cash_ledger`, và (T2) INSERT `virtual_settlements` — tất cả trong **một** transaction của request |

**Path params** — —
**Query params** — —

**Request body**

~~~ts
interface OrderCreateRequest {
  symbol: string;                  // 1..10 ký tự, regex ^[A-Z0-9]{1,10}$ (CHỮ IN)
  side: OrderSide;                 // "buy" | "sell"
  order_type: OrderType;           // "market" | "limit"
  quantity: number;                // > 0 và <= 1_000_000; PHẢI là bội số board_lot_size
  limit_price_vnd?: number | null; // > 0 và <= 10_000_000; bắt buộc khi order_type="limit"
}
~~~

~~~json
{ "symbol": "FPT", "side": "buy", "order_type": "limit", "quantity": 1000, "limit_price_vnd": 93500 }
~~~

**Response 201** — `OrderResponse`

~~~ts
type PlaceOrderResponse = OrderResponse;
~~~

~~~json
{
  "id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
  "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "symbol": "FPT",
  "mode": "thuc_chien",
  "side": "buy",
  "order_type": "market",
  "status": "filled",
  "quantity": 1000,
  "limit_price_vnd": null,
  "reserved_cash_vnd": 0,
  "reserved_quantity": 0,
  "filled_price_vnd": 96800,
  "gross_amount_vnd": 96800000,
  "fee_vnd": 145200,
  "tax_vnd": 0,
  "net_amount_vnd": -96945200,
  "trading_date": "2026-08-17",
  "rejection_reason": null,
  "cancel_reason": null,
  "created_at": "2026-08-17T02:31:07.884000Z"
}
~~~

**Lỗi** (theo đúng thứ tự phát sinh)

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — (Pydantic) | Sai schema: `symbol` không khớp `^[A-Z0-9]{1,10}$`, `side`/`order_type` ngoài enum, `quantity <= 0` hoặc `> 1_000_000`, `limit_price_vnd <= 0` hoặc `> 10_000_000` | mảng `detail` của framework |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | User `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | `config.trading_enabled = false` | `Giao dịch ảo hiện đang bị tạm dừng` |
| 400 | `BAD_REQUEST` | `quantity % board_lot_size != 0` | `Khối lượng phải là bội số của 100` |
| 400 | `BAD_REQUEST` | `order_type="limit"` mà thiếu/không dương `limit_price_vnd` | `Lệnh limit yêu cầu giá limit lớn hơn 0` |
| 422 | `UNPROCESSABLE_ENTITY` | `quantity > 1_000_000` (chốt ở service) | `Khối lượng 2000000 vượt quá mức tối đa 1000000 mỗi lệnh` |
| 422 | `UNPROCESSABLE_ENTITY` | `limit_price_vnd > 10_000_000` (chốt ở service) | `Giá limit 20000000 vượt quá mức tối đa 10000000 VND` |
| 422 | `UNPROCESSABLE_ENTITY` | Mã không thuộc HOSE/HNX/UPCOM | `Mã 'ZZZZ' không được niêm yết trên HOSE/HNX/UPCOM` |
| 503 | `SERVICE_UNAVAILABLE` | Nguồn danh sách mã lỗi/rỗng (fail-closed) | `Không thể xác minh mã chứng khoán: <lý do>` |
| 404 | `NOT_FOUND` | Chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 403 | `FORBIDDEN` | `account.status != "active"` | `Tài khoản đã bị tạm khóa` |
| 403 | `FORBIDDEN` | `account.frozen_at != null` | `Tài khoản tạm khóa` |
| 422 | `UNPROCESSABLE_ENTITY` | `gross > 100_000_000_000` (limit: tính theo `limit_price`; market: tính **sau khi** có giá) | `Gross giá trị lệnh 120,000,000,000 VND vượt quá mức tối đa 100,000,000,000 VND` |
| 400 | `BAD_REQUEST` | Mua **limit**: thiếu tiền để phong toả | `Không đủ tiền: cần 93640250 VND, hiện có 50000000 VND` |
| 400 | `BAD_REQUEST` | Mua **market**: thiếu tiền khi khớp | `Không đủ tiền: cần 96945200, hiện có 50000000` |
| 400 | `BAD_REQUEST` | Bán **limit**: thiếu CP khả dụng | `Không đủ cổ phiếu khả dụng để bán: cần 1000, hiện có 300` |
| 400 | `BAD_REQUEST` | Bán **market**: thiếu CP khả dụng | `Không đủ cổ phiếu: cần 1000, hiện có 300` |
| 400 | `BAD_REQUEST` | Bán làm `quantity_total` âm (dữ liệu lệch) | `Vi phạm toàn vẹn vị thế: bán 1000 cổ phiếu sẽ làm tổng âm (300 - 1000)` |

**CHUỖI KIỂM TRA — ĐÚNG THỨ TỰ NÀY** (`app/services/virtual_trading/service.py:111-215`)

1. Validate schema body (framework) → 422.
2. Xác thực + `is_active` → 401/403. Endpoint tính `is_premium` (admin = true) rồi suy ra `mode`.
3. Lấy/khởi tạo config → kiểm `trading_enabled` → 403.
4. `quantity % board_lot_size` → 400.
5. `order_type == "limit"` mà `limit_price_vnd` thiếu hoặc `<= 0` → 400.
6. `symbol = symbol.toUpperCase()`.
7. `quantity > 1_000_000` → 422; `limit_price_vnd > 10_000_000` → 422.
8. `validate_symbol(symbol)`: false → 422; nguồn lỗi → 503. (**Gọi provider trước khi chạm DB tài khoản**.)
9. Parse `holidays`, tính `trading_date` (giờ VN).
10. `SELECT … FOR UPDATE` tài khoản theo `user_id`: null → 404; `status != active` → 403 (`Tài khoản đã bị tạm khóa`); `frozen_at != null` → 403 (`Tài khoản tạm khóa`).
11. Tạo `config_snapshot` với `settlement_mode` **hiệu lực** (`config.settlement_mode` nếu premium, ngược lại luôn `"T0"`).
12. Nhánh **market**: resolve giá → nếu `PriceUnavailableError` thì **tạo lệnh `status="rejected"`** với `rejection_reason = "<SYMBOL>: All price sources failed"` và trả **201** (không phải lỗi HTTP); nếu có giá thì kiểm `gross > 100 tỷ` → 422 rồi khớp ngay.
13. Nhánh **limit**: kiểm `gross > 100 tỷ` → 422; mua → phong toả `gross + fee` (kiểm đủ tiền, chuyển `cash_available → cash_reserved`); bán → lock vị thế, kiểm `quantity_sellable`, chuyển `quantity_sellable → quantity_reserved`; tạo lệnh `status = "pending"`.

**KHÔNG tồn tại trong source** (đừng tự thêm khi viết lại, sẽ lệch hành vi): **không** có kiểm tra giờ giao dịch (đặt lệnh 24/7, ngoài phiên khớp theo giá đóng cửa); **không** có kiểm biên độ trần/sàn ±7%/±10%/±15%; **không** có giới hạn cỡ vị thế (chỉ có 3 ngưỡng cứng ở mục Nghiệp vụ nền); **không** có bước chặn riêng cho Cấp 0 (chỉ ép `mode` + T0). Nếu sản phẩm muốn các luật này, phải coi là **tính năng mới**.

**Ghi gì khi khớp (một transaction)**

| Bảng | Nội dung |
|---|---|
| `virtual_orders` | `status="filled"`, `filled_price_vnd`, `gross_amount_vnd`, `fee_vnd`, `tax_vnd`, `net_amount_vnd`, `config_snapshot`, `mode`; sau `flush` gán `reserved_cash_vnd = reserved_quantity = 0` |
| `virtual_trades` | 1 dòng: giá, phí, thuế, net, `price_source`, `price_time`, `traded_at = now UTC` |
| `virtual_positions` | mua: upsert `quantity_total`, `avg_cost_vnd` mới, cộng vào `sellable` (T0) hoặc `pending` (T2); bán: giảm `quantity_total`, `avg_cost_vnd` giữ nguyên |
| `virtual_trading_accounts` | mua: `cash_available -= total_cost`; bán T0: `cash_available += proceeds`; bán T2: `cash_pending += proceeds` |
| `virtual_settlements` | chỉ khi T2 (xem mục T+N) |
| `virtual_cash_ledger` | `amount_vnd = net_amount_vnd` (mua âm, bán dương), `balance_after_vnd = cash_available_vnd` hiện tại, `kind = side` (`"buy"`/`"sell"`), `reference_type="trade"`, `reference_id = trade.id` |

**Fallback / suy giảm** — Không lấy được giá cho lệnh market → lệnh `rejected`, HTTP 201, không đụng tiền. Nguồn danh sách mã lỗi → 503, không tạo lệnh. Cuối tuần/ngày nghỉ/ngoài giờ → giá đóng cửa gần nhất (`price_source = "close"`), lệnh vẫn khớp.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/orders' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: a2c47e19-8b53-4d06-91af-6e2b7c0d4315' \
  -d '{"symbol":"FPT","side":"buy","order_type":"market","quantity":1000}'
~~~

**Ghi chú khi viết lại** — (a) Dùng **BigInt** cho mọi phép nhân trung gian: `price_vnd * quantity` với `10_000_000 × 1_000_000 = 10^13` vượt an toàn `Number` khi còn nhân tiếp `× bps` trong `roundBps` (`10^13 × 1000 = 10^16 > 2^53`). Tính bằng BigInt rồi mới `Number(...)` khi serialize. (b) Thông điệp lỗi thiếu tiền của nhánh **limit** có hậu tố `" VND"`, nhánh **market** thì **không** — giữ nguyên văn nếu muốn kiểm thử so khớp chuỗi. (c) Lệnh `rejected` là **201**, đừng biến thành 4xx. (d) Lệnh limit không có `expires_at` được set (cột tồn tại nhưng luôn null): hết hạn được suy ra từ `trading_date < trading_date hiện tại` (GFD), xử lý ở `POST /refresh`. (e) Snapshot ghi `board_lot_size` nhưng khi khớp lại không dùng — chỉ phí/thuế/settlement được đọc từ snapshot. (f) Bán trong chế độ T2 ghi ledger `amount_vnd = +proceeds` nhưng `balance_after_vnd = cash_available_vnd` **chưa tăng** (tiền vào `cash_pending`) → sổ cái không cân theo delta; giữ nguyên để không lệch số với dữ liệu cũ, và ghi chú rõ trong tài liệu vận hành.

---

### GET /api/v1/virtual-trading/orders

> **Danh sách lệnh của tôi** — lọc theo trạng thái/mã/chiều, phân trang, mới nhất trước.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_orders` (scope theo `account_id` của người gọi) |
| **Side-effect** | không |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `status` | `string \| null` | không | `null` | `pending\|filled\|cancelled\|expired\|rejected` | Lọc trạng thái; giá trị lạ → 400 |
| `symbol` | `string \| null` | không | `null` | tự động `.toUpperCase()` | Lọc theo mã |
| `side` | `string \| null` | không | `null` | `buy\|sell` | Lọc chiều; giá trị lạ → 400 |
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `20` | `1..100` | Số dòng/trang |

**Request body** — —

**Response 200**

~~~ts
interface OrderListResponse {
  orders: OrderResponse[]; total: number; page: number; page_size: number;
}
~~~

~~~json
{
  "orders": [
    {
      "id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "symbol": "VCB", "mode": "thuc_chien", "side": "sell", "order_type": "limit",
      "status": "pending", "quantity": 500, "limit_price_vnd": 64500,
      "reserved_cash_vnd": 0, "reserved_quantity": 500,
      "filled_price_vnd": null, "gross_amount_vnd": null, "fee_vnd": null,
      "tax_vnd": null, "net_amount_vnd": null,
      "trading_date": "2026-08-17", "rejection_reason": null, "cancel_reason": null,
      "created_at": "2026-08-17T02:40:11.002000Z"
    }
  ],
  "total": 1, "page": 1, "page_size": 20
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `status` ngoài enum | `Giá trị status 'xong' không hợp lệ. Cho phép: pending, filled, cancelled, expired, rejected` |
| 400 | `BAD_REQUEST` | `side` ngoài enum | `Giá trị side 'mua' không hợp lệ. Cho phép: buy, sell` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | Chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 422 | — (Pydantic) | `page < 1` hoặc `page_size` ngoài `1..100` | mảng `detail` của framework |

**Fallback / suy giảm** — Không gọi provider ngoài. Trang vượt tổng số dòng → `orders: []` và `total` vẫn là tổng thật.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/orders?status=pending&symbol=VCB&side=sell&page=1&page_size=20' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6b0a5c72-31d4-4f8e-8a95-2c7d1e4b93f0'
~~~

**Ghi chú khi viết lại** — Thứ tự: validate enum `status`/`side` **trước** khi tra tài khoản (giá trị lạ trả 400, không phải 422). Sắp xếp `created_at DESC`; `total` đếm theo cùng bộ lọc; offset = `(page-1) * page_size`. Không có sắp xếp thứ cấp → hai lệnh cùng `created_at` có thể đổi chỗ giữa các trang: thêm `id DESC` làm tie-break là cải tiến an toàn.

---

### POST /api/v1/virtual-trading/orders/{order_id}/cancel

> **Huỷ lệnh đang chờ** — chuyển lệnh sang `cancelled` và hoàn lại phần tiền/CP đang bị phong toả.

| | |
|---|---|
| **Quyền** | Bearer (kiểm tra quyền sở hữu lệnh) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `virtual_orders` (status, `cancel_reason`), UPDATE `virtual_trading_accounts` hoặc `virtual_positions` để hoàn phong toả. **Không** ghi ledger (tiền chỉ chuyển giữa `reserved` và `available`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | `string` | khai báo là chuỗi; parse UUID trong handler | ID lệnh cần huỷ |

**Query params** — —
**Request body** — không có body.

**Response 200** — `OrderResponse` (đã `status = "cancelled"`, hai trường phong toả về 0)

~~~ts
type CancelOrderResponse = OrderResponse;
~~~

~~~json
{
  "id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
  "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "symbol": "VCB", "mode": "thuc_chien", "side": "sell", "order_type": "limit",
  "status": "cancelled", "quantity": 500, "limit_price_vnd": 64500,
  "reserved_cash_vnd": 0, "reserved_quantity": 0,
  "filled_price_vnd": null, "gross_amount_vnd": null, "fee_vnd": null,
  "tax_vnd": null, "net_amount_vnd": null,
  "trading_date": "2026-08-17", "rejection_reason": null,
  "cancel_reason": "Người dùng hủy",
  "created_at": "2026-08-17T02:40:11.002000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | `order_id` không phải UUID hợp lệ, hoặc không tồn tại | `Không tìm thấy lệnh` |
| 403 | `FORBIDDEN` | Lệnh của người khác | `Lệnh này không thuộc về bạn` |
| 400 | `BAD_REQUEST` | Lệnh không ở trạng thái `pending` | `Không thể hủy lệnh ở trạng thái 'filled'` |
| 404 | `NOT_FOUND` | Không tìm thấy tài khoản của lệnh (dữ liệu lệch) | `Không tìm thấy tài khoản` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |

**Fallback / suy giảm** — Không gọi provider ngoài nên luôn thực hiện được. Nếu vị thế tương ứng đã bị xoá (ví dụ vừa bị admin reset), phần hoàn CP bị bỏ qua **âm thầm** (`if position:`) nhưng lệnh vẫn `cancelled`.

**Điều kiện huỷ & hoàn phong toả**

- Chỉ huỷ được lệnh `pending` (tức lệnh limit chưa khớp). Lệnh `filled`/`cancelled`/`expired`/`rejected` → 400.
- Mua: `cash_reserved -= reserved_cash_vnd; cash_available += reserved_cash_vnd` (hoàn **đúng** số đã phong toả gồm cả phí dự tính).
- Bán: `quantity_reserved -= reserved_quantity; quantity_sellable += reserved_quantity`.
- Sau `flush`, gán `reserved_cash_vnd = reserved_quantity = 0` trên lệnh.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/orders/4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6/cancel' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e4d9a103-72b8-4c6f-9051-8b3f2e7d6a41'
~~~

**Ghi chú khi viết lại** — UUID sai định dạng trả **404**, không phải 422 (path khai báo là `str`). Thứ tự: lấy lệnh (`FOR UPDATE`) → kiểm sở hữu → kiểm `pending` → mới lock tài khoản. Endpoint này **không** kiểm `frozen_at`: người dùng bị khoá vẫn huỷ được lệnh chờ (chủ ý, để không kẹt tiền). Chuỗi trạng thái trong detail là **giá trị enum** (`'filled'`), không phải tên hằng.

---

### GET /api/v1/virtual-trading/trades

> **Lịch sử khớp lệnh của tôi** — danh sách giao dịch đã thực hiện, mới nhất trước.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trades` |
| **Side-effect** | không |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `20` | `1..100` | Số dòng/trang |

**Request body** — —

**Response 200**

~~~ts
interface TradeListResponse {
  trades: TradeResponse[]; total: number; page: number; page_size: number;
}
~~~

~~~json
{
  "trades": [
    {
      "id": "d51a7c68-0b94-4e23-a7f5-91c6d3b08e47",
      "order_id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
      "symbol": "HPG", "side": "sell", "quantity": 2000, "price_vnd": 27350,
      "gross_amount_vnd": 54700000, "fee_vnd": 82050, "tax_vnd": 54700,
      "net_amount_vnd": 54563250,
      "price_source": "close",
      "price_time": "2026-08-17T02:44:02.118000Z",
      "traded_at": "2026-08-17T02:44:02.118000Z"
    }
  ],
  "total": 1, "page": 1, "page_size": 20
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | Chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 422 | — (Pydantic) | `page`/`page_size` ngoài khoảng | mảng `detail` của framework |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài. Không có bộ lọc mã/ngày ở phía người dùng (chỉ nhóm admin mới có lọc `symbol`).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/trades?page=1&page_size=20' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8f31d6b0-5a27-4e91-bc48-0d7e2a95c136'
~~~

**Ghi chú khi viết lại** — Sắp xếp `traded_at DESC` (KHÔNG phải `created_at`). `net_amount_vnd` của giao dịch **mua là số âm** — client hiển thị phải dùng `Math.abs` hoặc theo `side`. `price_time` hiện bằng thời điểm resolve giá, không phải giờ khớp trên sàn: đừng dùng để dựng biểu đồ.

---

## Nhóm 3 — Bảng xếp hạng (công khai)

### GET /api/v1/virtual-trading/leaderboard

> **Bảng xếp hạng công khai** — xếp các tài khoản `active` theo NAV / lợi nhuận / %lợi nhuận; **không cần xác thực**.

| | |
|---|---|
| **Quyền** | Công khai (không header nào) |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không (mỗi request resolve lại giá từng mã duy nhất) |
| **Nguồn dữ liệu** | DB (`virtual_trading_accounts`, `virtual_positions`, `users`) + provider ngoài cho giá |
| **Side-effect** | không (có thể INSERT config mặc định nếu chưa có) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `sort_by` | `string` | không | `"nav"` | `nav` \| `profit` \| `return_pct`; giá trị lạ **không lỗi**, tự về `nav` | Tiêu chí xếp hạng (giảm dần) |
| `page` | `number` | không | `1` | `>= 1` | Trang (cắt trên danh sách đã xếp hạng trong bộ nhớ) |
| `page_size` | `number` | không | `20` | `1..100` | Số dòng/trang |

**Request body** — —

**Response 200**

~~~ts
interface LeaderboardEntry {
  rank: number;              // hạng toàn cục trong danh sách đã đánh giá (1-based)
  user_id: string;           // uuid — LỘ ra ngoài công khai
  display_name: string;      // = users.full_name, hoặc "Không xác định"
  nav_vnd: number;
  profit_vnd: number;        // nav - initial_cash
  return_pct: number;        // 2 chữ số thập phân
  initial_cash_vnd: number;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;            // = evaluated_count (số tài khoản thực sự được tính)
  total_eligible: number;   // tổng tài khoản status="active" trong DB
  evaluated_count: number;  // <= 200 (mức chặn cứng)
  page: number; page_size: number; sort_by: string;
}
~~~

~~~json
{
  "entries": [
    { "rank": 1, "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55", "display_name": "Nguyễn Văn An",
      "nav_vnd": 1187400000, "profit_vnd": 187400000, "return_pct": 18.74, "initial_cash_vnd": 1000000000 },
    { "rank": 2, "user_id": "b7c94e21-8d03-4f16-a52b-6e1c7d90a483", "display_name": "Trần Thị Bích Hạnh",
      "nav_vnd": 1043910000, "profit_vnd": 43910000, "return_pct": 4.39, "initial_cash_vnd": 1000000000 }
  ],
  "total": 137, "total_eligible": 412, "evaluated_count": 137,
  "page": 1, "page_size": 20, "sort_by": "nav"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — (Pydantic) | `page < 1` hoặc `page_size` ngoài `1..100` | mảng `detail` của framework |

**Fallback / suy giảm** — Mã không lấy được giá → dùng `avg_cost_vnd * quantity_total` thay cho giá thị trường (NAV vẫn có số, không null). Người dùng đã bị xoá / không tìm thấy tên → `display_name = "Không xác định"`. Chặn cứng **200 tài khoản** được đánh giá (lấy theo `activated_at DESC`): nếu `total_eligible > 200` thì bảng xếp hạng **không đầy đủ** — `evaluated_count` và `total_eligible` chính là hai số để UI nói rõ điều đó.

**Công thức & thứ tự**

~~~
total_cash = cash_available + cash_reserved + cash_pending
mv         = Σ (giá_mã > 0 ? giá_mã : avg_cost_vnd) * quantity_total      // bỏ vị thế qty <= 0
nav_vnd    = total_cash + mv
profit_vnd = nav_vnd - initial_cash_vnd
return_pct = initial_cash_vnd > 0 ? round(profit/initial*100, 2) : 0.0
sort       : giảm dần theo (nav_vnd | profit_vnd | return_pct)
rank       : chỉ số toàn cục sau khi sort, gán cho các dòng của trang hiện tại
~~~

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/leaderboard?sort_by=return_pct&page=1&page_size=20' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 1a6e9b47-3c50-4d82-97f1-5b8c0d2e4736'
~~~

**RỦI RO RIÊNG TƯ (phải xử lý khi viết lại)** — Endpoint công khai này trả **`user_id` (UUID thật) + `full_name` thật** của người dùng, kèm NAV và %lợi nhuận, cho bất kỳ ai không cần token. Email **không** bị lộ. Đây là dữ liệu định danh gắn với hành vi tài chính (dù là tiền ảo). Khuyến nghị: (1) thay `display_name` bằng bút danh do người dùng chọn, hoặc rút gọn (`Nguyễn Văn A.`); (2) bỏ `user_id` khỏi payload công khai hoặc thay bằng id ẩn danh theo mùa; (3) cho phép người dùng tắt xuất hiện trên bảng (opt-out). Nếu buộc giữ hình dạng cũ, ghi rõ trong tài liệu là quyết định sản phẩm có ý thức.

**Ghi chú khi viết lại** — Xếp hạng + phân trang làm **trong bộ nhớ**: tải tối đa 200 tài khoản, tải vị thế từng tài khoản (N+1 truy vấn — nên gom 1 truy vấn `IN (...)`), gom tập mã **duy nhất** rồi resolve giá **1 lần/mã** (đừng resolve theo từng vị thế). `total` = `evaluated_count`, KHÔNG phải `total_eligible` — client phân trang theo `total` sẽ không bao giờ thấy quá 200 dòng. Với `page` vượt quá thì `entries: []`. `sort_by` lạ không gây lỗi — giữ nguyên hành vi này để không phá client cũ, nhưng vẫn nên echo lại giá trị đã dùng trong `sort_by` (hiện đang echo **nguyên văn tham số vào**, kể cả khi đã fallback về `nav` — cân nhắc echo giá trị hiệu lực và ghi vào changelog).

---

## Nhóm 4 — Quản trị cũ (`/virtual-trading/admin/*`)

### GET /api/v1/virtual-trading/admin/config

> **Xem cấu hình giao dịch ảo** — trả dòng cấu hình `is_active` đang áp dụng cho toàn hệ thống.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trading_configs` |
| **Side-effect** | **INSERT** dòng config mặc định nếu chưa tồn tại (`created_by = admin.id`) — đây là endpoint đọc nhưng có thể ghi |

**Path params** — —
**Query params** — —
**Request body** — —

**Response 200**

~~~ts
interface ConfigResponse {
  id: string;
  initial_cash_vnd: number;
  buy_fee_rate_bps: number;
  sell_fee_rate_bps: number;
  sell_tax_rate_bps: number;
  settlement_mode: SettlementMode;
  board_lot_size: number;
  trading_enabled: boolean;
  holidays: string[];        // đã parse từ TEXT JSON; null trong DB → []
  created_at: string;
  updated_at: string;
}
~~~

~~~json
{
  "id": "c0a8f512-6d34-4b90-8e17-4f2c9a7b5d38",
  "initial_cash_vnd": 1000000000,
  "buy_fee_rate_bps": 15,
  "sell_fee_rate_bps": 15,
  "sell_tax_rate_bps": 10,
  "settlement_mode": "T0",
  "board_lot_size": 100,
  "trading_enabled": true,
  "holidays": ["2026-09-02", "2026-09-03"],
  "created_at": "2026-06-01T03:00:00.000000Z",
  "updated_at": "2026-08-16T09:12:44.207000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — `holidays` trong DB là TEXT; nếu JSON hỏng, hàm parse trả về tập rỗng (không lỗi) → response `[]`. Nếu chưa có config nào, trả về bộ mặc định vừa được tạo.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/admin/config' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3e7f2c81-9a04-4b6d-8517-c2e9d0a4f63b'
~~~

**Ghi chú khi viết lại** — Không ghi audit log (chỉ đọc). Chỉ có **một** dòng `is_active = true` được coi là hiệu lực; nếu có nhiều dòng, truy vấn `scalar_one_or_none()` sẽ **lỗi** → phải giữ bất biến "duy nhất một config active" (thêm partial unique index là cải tiến nên làm). `holidays` ra ngoài là mảng chuỗi, trong DB là TEXT JSON — nhớ serialize khi ghi, parse khi đọc.

---

### PATCH /api/v1/virtual-trading/admin/config

> **Cập nhật cấu hình giao dịch ảo** — sửa một phần (partial update) và ghi audit log diff before/after.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `virtual_trading_configs` (+ `updated_by = admin.id`); INSERT `admin_audit_logs` action `vt.config.update` |

**Path params** — —
**Query params** — —

**Request body** — chỉ các khoá được gửi mới bị sửa (`exclude_unset`)

~~~ts
interface ConfigUpdate {
  initial_cash_vnd?: number;    // > 0 (không giới hạn trên)
  buy_fee_rate_bps?: number;    // 0..1000  (0% .. 10%)
  sell_fee_rate_bps?: number;   // 0..1000
  sell_tax_rate_bps?: number;   // 0..1000
  settlement_mode?: "T0" | "T2";
  board_lot_size?: number;      // > 0
  trading_enabled?: boolean;
  holidays?: string[];          // mảng "YYYY-MM-DD"; GHI ĐÈ toàn bộ danh sách
}
~~~

~~~json
{ "settlement_mode": "T2", "sell_tax_rate_bps": 10, "holidays": ["2026-09-02", "2026-09-03"] }
~~~

**Response 200** — `ConfigResponse` (như endpoint GET config)

~~~ts
type UpdateConfigResponse = ConfigResponse;
~~~

~~~json
{
  "id": "c0a8f512-6d34-4b90-8e17-4f2c9a7b5d38",
  "initial_cash_vnd": 1000000000,
  "buy_fee_rate_bps": 15,
  "sell_fee_rate_bps": 15,
  "sell_tax_rate_bps": 10,
  "settlement_mode": "T2",
  "board_lot_size": 100,
  "trading_enabled": true,
  "holidays": ["2026-09-02", "2026-09-03"],
  "created_at": "2026-06-01T03:00:00.000000Z",
  "updated_at": "2026-08-17T02:50:19.664000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `initial_cash_vnd <= 0`, bps ngoài `0..1000`, `board_lot_size <= 0`, `settlement_mode` ngoài `T0/T2` | mảng `detail` của framework |

**Fallback / suy giảm** — Body rỗng `{}` là hợp lệ: không sửa gì, vẫn trả config hiện tại, audit ghi `before/after = null` (hàm diff trả `None, None` khi không có gì thay đổi). Chuỗi ngày trong `holidays` **không** được validate định dạng — chuỗi rác sẽ lặng lẽ không khớp ngày nào (lịch coi mọi ngày làm việc là ngày giao dịch).

**curl**

~~~bash
curl -X PATCH 'https://api.iqx.vn/api/v1/virtual-trading/admin/config' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9b2d4f60-7c18-4e35-a9d2-6f0b3c8e1a57' \
  -d '{"settlement_mode":"T2","holidays":["2026-09-02","2026-09-03"]}'
~~~

**Ghi chú khi viết lại** — (a) `holidays` **thay thế toàn bộ** danh sách, không merge; muốn thêm 1 ngày phải gửi lại cả mảng. (b) Sửa `initial_cash_vnd` **không** ảnh hưởng tài khoản đã tồn tại — chỉ tác động khi `activate` mới hoặc khi `reset`. (c) Sửa phí/thuế/`settlement_mode` **không** ảnh hưởng lệnh đang chờ (snapshot). (d) `trading_enabled = false` chặn `activate` và `place_order`, nhưng **KHÔNG** chặn `refresh`, `cancel`, hay các endpoint đọc. (e) Audit: thu `before` bằng cách đọc thuộc tính theo đúng các khoá có trong patch, chuyển enum về `.value`, rồi diff — chỉ khoá **thay đổi** được ghi. (f) `bps` tối đa 1000 = 10%: kiểm ở tầng schema, service không kiểm lại.

---

### POST /api/v1/virtual-trading/admin/users/{user_id}/reset

> **Đặt lại tài khoản ảo của một người dùng** — xoá sạch lịch sử giao dịch ảo và nạp lại vốn khởi tạo.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | DELETE `virtual_settlements`, `virtual_trades`, `virtual_orders`, `virtual_positions`, `virtual_cash_ledger` của tài khoản; UPDATE `virtual_trading_accounts`; INSERT `virtual_cash_ledger` (`kind="reset"`); INSERT `admin_audit_logs` action `vt.account.reset` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `user_id` | `string` | khai báo là chuỗi; parse UUID trong handler | ID **người dùng** (không phải account_id) |

**Query params** — —
**Request body** — không có body.

**Response 200**

~~~ts
interface ResetResponse { accounts_reset: number; message: string; }
~~~

~~~json
{ "accounts_reset": 1, "message": "Đặt lại tài khoản thành công" }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | `user_id` không phải UUID hợp lệ | `Không tìm thấy người dùng` |
| 404 | `NOT_FOUND` | Người dùng chưa có tài khoản ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài. Nếu tài khoản đang bị khoá (`frozen_at != null`), reset **vẫn chạy** và **không** mở khoá (`frozen_at`, `status="suspended"` giữ nguyên) → sau reset người dùng vẫn không đặt được lệnh.

**Reset xoá gì / KHÔNG xoá gì**

| Bị xoá | Được giữ |
|---|---|
| `virtual_settlements`, `virtual_trades`, `virtual_orders`, `virtual_positions`, `virtual_cash_ledger` (của tài khoản đó) | Dòng `virtual_trading_accounts` (không tạo lại, chỉ ghi đè số dư) |
| — | `frozen_at`, `frozen_by_user_id`, `freeze_reason`, `status` |
| — | **TOÀN BỘ tiến độ Cấp 0–8**: `cap0_progress`, `cap0_order_kehoach`, `user_placement`, `cap1_progress`, `order_kehoach`, `order_ketso`, `cap2_progress`, `cap3_progress`, `cap4_progress`, `cap5_progress`, `standby_decision`, `cap6_progress`, `cap7_progress`, `cap8_progress` |
| — | `admin_audit_logs` (bất biến) |

Sau reset: `initial_cash_vnd = cash_available_vnd = config.initial_cash_vnd`, `cash_reserved_vnd = cash_pending_vnd = 0`, `reset_at = now UTC`, và một bút toán ledger `kind="reset"`, `note="Tài khoản được đặt lại bởi quản trị <admin_id>"`.

**KHÔNG HOÀN TÁC ĐƯỢC.** Dữ liệu bị `DELETE` cứng, không soft-delete, không bảng lưu trữ. Bản ghi audit chỉ nói "đã reset user X", không chứa dữ liệu đã xoá.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/admin/users/3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55/reset' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 42a7c0e9-1b6d-4f38-95c7-8e0a2d4b7f19'
~~~

**Ghi chú khi viết lại** — Reset **giữ nguyên tiến độ Cấp 0–8**: đây là hành vi hiện tại và rất dễ bị "cải tiến" sai. Người học đã tốt nghiệp một cấp vẫn ở cấp đó dù danh mục ảo về mo — nếu sản phẩm muốn reset kèm tiến độ thì phải là endpoint/flag **mới**, có xác nhận riêng. Cảnh báo tiếp: xoá `virtual_cash_ledger` phá vỡ tính "bất biến" của sổ cái; nếu viết lại có điều kiện, hãy xét lưu trữ sang bảng lịch sử trước khi xoá. Path nhận `user_id` chứ không `account_id` — khác hoàn toàn nhóm `/admin/vt/*`.

---

### POST /api/v1/virtual-trading/admin/reset-all

> **Đặt lại toàn bộ tài khoản ảo** — chạy đúng logic reset ở trên cho **mọi** tài khoản trong hệ thống.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | Như reset một người, nhân với số tài khoản; INSERT `admin_audit_logs` action `vt.account.reset_all` (`after = {"count": n}`) |

**Path params** — —
**Query params** — —
**Request body** — không có body.

**Response 200**

~~~ts
type ResetAllResponse = ResetResponse;   // { accounts_reset, message }
~~~

~~~json
{ "accounts_reset": 412, "message": "Đã đặt lại 412 tài khoản" }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — Không có tài khoản nào → `{"accounts_reset": 0, "message": "Đã đặt lại 0 tài khoản"}`. Toàn bộ vòng lặp nằm trong **một transaction** của request: lỗi giữa đường → rollback tất cả (không reset nửa vời), nhưng cũng nghĩa là với hàng nghìn tài khoản, transaction rất dài và có thể timeout.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/virtual-trading/admin/reset-all' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: cf58b1a2-4e73-4d09-86b5-1a7f3c2e9d40'
~~~

**Ghi chú khi viết lại** — Cài đặt hiện tại lặp **tuần tự**, mỗi tài khoản là 5 câu DELETE + 1 UPDATE + 1 INSERT ledger và mỗi lần lại đọc lại config → O(n) round-trip. Khi viết lại: giữ nguyên **ngữ nghĩa** (một transaction, count trả về = số tài khoản đã lặp) nhưng dùng DELETE theo `account_id IN (…)` gom lô, và đọc config một lần. Endpoint này **cũng không** xoá tiến độ Cấp 0–8 và **cũng không** mở khoá tài khoản. Nên đặt sau một xác nhận hai bước ở UI admin (không có cờ `confirm` nào ở backend — gọi là chạy).

---

### GET /api/v1/virtual-trading/admin/accounts

> **Liệt kê tài khoản ảo** — bảng quản trị có lọc theo trạng thái/khoá và tìm theo email/tên.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trading_accounts` LEFT JOIN `users` |
| **Side-effect** | không (không ghi audit log) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `50` | `1..200` | Số dòng/trang |
| `status` | `string \| null` | không | `null` | `active` \| `suspended`; giá trị lạ bị **bỏ qua âm thầm** | Lọc trạng thái |
| `frozen_only` | `boolean \| null` | không | `null` | 3 trạng thái: `true` = chỉ đang khoá, `false` = chỉ **không** khoá, không gửi = tất cả | Lọc theo `frozen_at` |
| `search` | `string \| null` | không | `null` | ILIKE `%…%` trên `users.email` **hoặc** `users.full_name` | Tìm kiếm người dùng |

**Request body** — —

**Response 200**

~~~ts
interface AdminAccountResponse {
  id: string; user_id: string;
  user_email: string | null;
  user_name: string | null;
  status: AccountStatus;
  initial_cash_vnd: number;
  cash_available_vnd: number;
  cash_reserved_vnd: number;
  cash_pending_vnd: number;
  activated_at: string;
  reset_at: string | null;
}
type AdminListAccountsResponse = PaginatedResponse<AdminAccountResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
      "user_email": "an.nguyen@iqx.vn",
      "user_name": "Nguyễn Văn An",
      "status": "active",
      "initial_cash_vnd": 1000000000,
      "cash_available_vnd": 812350000,
      "cash_reserved_vnd": 60090000,
      "cash_pending_vnd": 0,
      "activated_at": "2026-07-01T01:10:00.000000Z",
      "reset_at": null
    }
  ],
  "total": 412, "page": 1, "page_size": 50, "total_pages": 9
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `page < 1`, `page_size` ngoài `1..200`, `frozen_only` không parse được thành bool | mảng `detail` của framework |

**Fallback / suy giảm** — Người dùng đã bị xoá (JOIN không khớp): `user_email`/`user_name` = `null`, dòng vẫn hiện. `status` sai chính tả → **không lọc gì** (trả tất cả) chứ không lỗi — bẫy dễ khiến admin tưởng đã lọc.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/virtual-trading/admin/accounts?page=1&page_size=50&frozen_only=true&search=nguyen' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2d6b8f31-0c47-4a95-b1e8-7f3d5a0c9e24'
~~~

**Ghi chú khi viết lại** — Sắp xếp `virtual_trading_accounts.created_at DESC`. `total_pages = ceil(total / page_size)`, và **bằng 0 khi `total = 0`** (khác nhóm `/admin/vt/*` trả 1 — xem ghi chú tổng hợp). Điều kiện `search` áp trên bảng `users` trong khi JOIN là **LEFT** → dòng có `users` null sẽ bị loại khi có `search`. Response này **không** có `frozen_at`/`freeze_reason`: muốn xem lý do khoá phải gọi `GET /admin/vt/accounts/{id}`.

---

## Nhóm 5 — Quản trị mới `/admin/vt/*` (Account 360)

### GET /api/v1/admin/vt/accounts/{account_id}

> **Chi tiết tài khoản ảo (quản trị)** — bản đầy đủ, kèm trạng thái khoá và ai khoá.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trading_accounts` |
| **Side-effect** | không (không ghi audit log — chỉ đọc) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID (validate bởi framework) | ID **tài khoản ảo** |

**Query params** — —
**Request body** — —

**Response 200** — `VTAccountAdminResponse`

~~~ts
type GetVTAccountResponse = VTAccountAdminResponse;
~~~

~~~json
{
  "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
  "status": "suspended",
  "initial_cash_vnd": 1000000000,
  "cash_available_vnd": 812350000,
  "cash_reserved_vnd": 60090000,
  "cash_pending_vnd": 0,
  "activated_at": "2026-07-01T01:10:00.000000Z",
  "frozen_at": "2026-08-16T07:45:12.339000Z",
  "frozen_by_user_id": "f0e1d2c3-b4a5-4968-8776-5a4b3c2d1e0f",
  "freeze_reason": "Nghi vấn lạm dụng lệnh tự động",
  "created_at": "2026-07-01T01:10:00.000000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không có tài khoản với `account_id` | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` không phải UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài. Không trả email/tên người dùng (phải tra thêm ở nhóm quản trị người dùng).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5c1a9d38-6f24-4b70-8e93-0d7b2c5f4a61'
~~~

**Ghi chú khi viết lại** — Thông điệp 404 của cả nhóm này là `Không tìm thấy Tài khoản giao dịch ảo` (chữ **T** hoa, do truyền `"Tài khoản giao dịch ảo"` vào `NotFoundError`), khác nhóm người dùng (`… tài khoản giao dịch ảo`, chữ thường). Giữ nguyên nếu test so khớp chuỗi. `account_id` ở nhóm này được framework validate thành UUID → sai định dạng là **422**, khác cancel/reset của nhóm cũ (404).

---

### GET /api/v1/admin/vt/accounts/{account_id}/positions

> **Vị thế của tài khoản (quản trị)** — toàn bộ vị thế, **không phân trang**, sắp xếp theo mã.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_positions` |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params** — không có (chú ý: **không** có `page`/`page_size`)
**Request body** — —

**Response 200**

~~~ts
type ListVTPositionsResponse = VTPositionResponse[];
~~~

~~~json
[
  {
    "id": "7e2c5b91-4d06-4a83-9f17-2b8e0c6d3a54",
    "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
    "symbol": "FPT",
    "quantity_total": 2000, "quantity_sellable": 2000,
    "quantity_pending": 0, "quantity_reserved": 0,
    "avg_cost_vnd": 93500,
    "created_at": "2026-08-10T02:11:45.780000Z"
  },
  {
    "id": "b3f81d47-9c25-4e60-a8d1-5f2c7b0e6493",
    "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
    "symbol": "HPG",
    "quantity_total": 0, "quantity_sellable": 0,
    "quantity_pending": 0, "quantity_reserved": 0,
    "avg_cost_vnd": 27100,
    "created_at": "2026-07-28T06:32:10.114000Z"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` không phải UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Không có vị thế → `[]`. **Khác** `GET /portfolio`: ở đây vị thế `quantity_total = 0` **vẫn được trả** (không lọc), và **không** có giá thị trường / lãi lỗ (không gọi provider).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/positions' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 08e5b2c7-1a34-4d69-9057-c3f8d1b6e402'
~~~

**Ghi chú khi viết lại** — Không phân trang: tài khoản giao dịch nhiều mã sẽ trả mảng dài — an toàn vì mỗi cặp (account, symbol) chỉ có 1 dòng (`uq_vt_positions_account_symbol`), nhưng vẫn nên thêm `page`/`page_size` **tuỳ chọn** mà giữ mặc định trả hết để không phá client. Bất biến cần kiểm tra khi soi dữ liệu: `quantity_total = quantity_sellable + quantity_pending + quantity_reserved`.

---

### GET /api/v1/admin/vt/accounts/{account_id}/orders

> **Lệnh của tài khoản (quản trị)** — phân trang, lọc theo trạng thái, mã và khoảng `trading_date`.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_orders` |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `50` | `1..200` | Số dòng/trang |
| `status` | `string \| null` | không | `null` | nên whitelist `pending\|filled\|cancelled\|expired\|rejected` | Lọc trạng thái |
| `symbol` | `string \| null` | không | `null` | tự `.toUpperCase()` | Lọc mã |
| `date_from` | `string \| null` | không | `null` | `YYYY-MM-DD` | `trading_date >= date_from` |
| `date_to` | `string \| null` | không | `null` | `YYYY-MM-DD` | `trading_date <= date_to` |

**Request body** — —

**Response 200**

~~~ts
type ListVTOrdersResponse = PaginatedResponse<VTOrderResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
      "symbol": "FPT", "side": "buy", "order_type": "market", "status": "filled",
      "quantity": 1000, "limit_price_vnd": null, "filled_price_vnd": 96800,
      "gross_amount_vnd": 96800000, "fee_vnd": 145200, "tax_vnd": 0,
      "net_amount_vnd": -96945200,
      "trading_date": "2026-08-17", "rejection_reason": null, "cancel_reason": null,
      "created_at": "2026-08-17T02:31:07.884000Z"
    }
  ],
  "total": 128, "page": 1, "page_size": 50, "total_pages": 3
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại (kiểm **trước** khi truy vấn) | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` sai UUID, `page`/`page_size` ngoài khoảng | mảng `detail` của framework |
| 500 | — | `date_from`/`date_to` không phải ngày ISO hợp lệ (bản Python **không** bắt lỗi `date.fromisoformat`) | lỗi nội bộ, không có `detail` nghiệp vụ |

**Fallback / suy giảm** — Không có lệnh → `items: []` nhưng `total_pages` vẫn là **1** (xem ghi chú). Không phụ thuộc provider ngoài.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/orders?page=1&page_size=50&status=filled&symbol=FPT&date_from=2026-08-01&date_to=2026-08-17' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 74be2c05-8d19-4f37-a260-1c9e5b3d0af8'
~~~

**Ghi chú khi viết lại** — (a) **Sửa lỗi tiềm ẩn**: validate `date_from`/`date_to` theo `YYYY-MM-DD` ở tầng DTO và trả **400** thay vì để văng 500; ghi vào changelog vì đây là thay đổi hành vi. (b) `status` không được whitelist trong bản Python: giá trị lạ đi thẳng xuống tầng ORM/DB và sinh lỗi 500 — bản TS **phải** whitelist và trả 400. (c) Sắp xếp `created_at DESC` (không phải `trading_date`). (d) Response thiếu `mode` và `config_snapshot`: khi admin điều tra lệnh Cấp 0 sẽ không phân biệt được sân tập/thực chiến — bổ sung `mode` là cải tiến đáng làm nhưng phải nêu trong changelog.

---

### GET /api/v1/admin/vt/accounts/{account_id}/trades

> **Giao dịch của tài khoản (quản trị)** — phân trang, lọc theo mã, mới nhất trước.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_trades` |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `50` | `1..200` | Số dòng/trang |
| `symbol` | `string \| null` | không | `null` | tự `.toUpperCase()` | Lọc mã |

**Request body** — —

**Response 200**

~~~ts
type ListVTTradesResponse = PaginatedResponse<VTTradeResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "d51a7c68-0b94-4e23-a7f5-91c6d3b08e47",
      "order_id": "4c81f0a7-2d63-4b19-9a55-0e7c3b8d21f6",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "symbol": "HPG", "side": "sell", "quantity": 2000, "price_vnd": 27350,
      "gross_amount_vnd": 54700000, "fee_vnd": 82050, "tax_vnd": 54700,
      "net_amount_vnd": 54563250,
      "price_source": "close",
      "traded_at": "2026-08-17T02:44:02.118000Z",
      "created_at": "2026-08-17T02:44:02.201000Z"
    }
  ],
  "total": 57, "page": 1, "page_size": 50, "total_pages": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` sai UUID, `page`/`page_size` ngoài khoảng | mảng `detail` của framework |

**Fallback / suy giảm** — Không có giao dịch → `items: []`, `total: 0`, `total_pages: 1`.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/trades?page=1&page_size=50&symbol=HPG' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9e07f4a1-3b58-42d6-8c19-6d2b5e0a7c34'
~~~

**Ghi chú khi viết lại** — Sắp xếp `traded_at DESC`. Response admin **không** có `price_time` (khác `TradeResponse` phía người dùng) nhưng **có** `created_at` — đừng dùng chung một DTO cho hai nhóm. Kiểm tra tồn tại tài khoản chạy **trước** mọi truy vấn danh sách (một round-trip thêm nhưng giữ đúng 404).

---

### GET /api/v1/admin/vt/accounts/{account_id}/ledger

> **Sổ cái tiền mặt của tài khoản** — mọi bút toán tiền có dấu, lọc theo `kind`, phân trang.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_cash_ledger` |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `50` | `1..200` | Số dòng/trang |
| `kind` | `string \| null` | không | `null` | `activate\|reset\|buy\|sell\|admin_adjust` (cột String, so khớp **chính xác**, phân biệt chữ) | Lọc loại bút toán |

**Request body** — —

**Response 200**

~~~ts
type ListVTLedgerResponse = PaginatedResponse<VTLedgerResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "1c8f6b30-7a25-4d94-8e01-3f5b2c7d9a48",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "amount_vnd": -50000000,
      "balance_after_vnd": 762350000,
      "kind": "admin_adjust",
      "reference_type": "admin_audit",
      "reference_id": null,
      "note": "Thu hồi tiền cấp sai do lỗi vận hành ngày 2026-08-16",
      "created_at": "2026-08-17T03:02:55.417000Z"
    },
    {
      "id": "6a3d9e12-5c74-4b08-91f6-8d0b2e7c4a35",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "amount_vnd": -96945200,
      "balance_after_vnd": 812350000,
      "kind": "buy",
      "reference_type": "trade",
      "reference_id": "d51a7c68-0b94-4e23-a7f5-91c6d3b08e47",
      "note": null,
      "created_at": "2026-08-17T02:31:07.902000Z"
    }
  ],
  "total": 214, "page": 1, "page_size": 50, "total_pages": 5
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` sai UUID, `page`/`page_size` ngoài khoảng | mảng `detail` của framework |

**Fallback / suy giảm** — `kind` không tồn tại → `items: []`, `total: 0` (cột là String tự do nên không lỗi enum). Tài khoản vừa bị reset → sổ cái chỉ còn **một** dòng `kind="reset"` (các dòng cũ đã bị DELETE).

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/ledger?page=1&page_size=50&kind=admin_adjust' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b58c0d31-2e79-4a46-91f7-0c3d6b5e8a24'
~~~

**Ghi chú khi viết lại** — Sắp xếp `created_at DESC`. `amount_vnd` **có dấu** (mua/điều chỉnh giảm là âm) và `balance_after_vnd` là **`cash_available_vnd`** sau bút toán — KHÔNG phải tổng tiền. Vì bán T+2 ghi `amount_vnd` dương nhưng chưa đổi `cash_available`, chuỗi `balance_after` **không** luôn bằng `balance_after` trước + `amount`: đừng viết kiểm toán tự động dựa trên giả định đó cho tới khi hành vi này được sửa có chủ đích. `virtual_cash_ledger` không có `updated_at` (chỉ `created_at`, server default `now()`).

---

### GET /api/v1/admin/vt/accounts/{account_id}/settlements

> **Thanh toán T+N của tài khoản** — các bản ghi chờ/đã thanh toán CP hoặc tiền, phân trang.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `virtual_settlements` |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | `number` | không | `1` | `>= 1` | Trang |
| `page_size` | `number` | không | `50` | `1..200` | Số dòng/trang |
| `status` | `string \| null` | không | `null` | nên whitelist `pending\|settled` | Lọc trạng thái thanh toán |

**Request body** — —

**Response 200**

~~~ts
type ListVTSettlementsResponse = PaginatedResponse<VTSettlementResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "3f7b1e58-9d20-4c63-a015-7e2c8b4d6f91",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "trade_id": "d51a7c68-0b94-4e23-a7f5-91c6d3b08e47",
      "kind": "sell_cash_release",
      "amount": 54563250,
      "symbol": null,
      "due_date": "2026-08-19",
      "status": "pending",
      "settled_at": null,
      "created_at": "2026-08-17T02:44:02.235000Z"
    },
    {
      "id": "8d2a6c94-1f37-4b85-9e60-4a7b3d0c5e12",
      "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
      "trade_id": "0b6e4f81-3a29-4d57-8c13-9f5a2b7e6d40",
      "kind": "buy_qty_release",
      "amount": 1000,
      "symbol": "VCB",
      "due_date": "2026-08-14",
      "status": "settled",
      "settled_at": "2026-08-14T01:05:33.874000Z",
      "created_at": "2026-08-12T03:20:14.660000Z"
    }
  ],
  "total": 12, "page": 1, "page_size": 50, "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` sai UUID, `page`/`page_size` ngoài khoảng | mảng `detail` của framework |
| 500 | — | `status` không thuộc enum (không được whitelist trong bản Python) | lỗi nội bộ |

**Fallback / suy giảm** — Tài khoản chỉ giao dịch T0 → luôn `items: []` (T0 không sinh settlement). Bản ghi quá hạn mà chưa `settled` là **bình thường** khi người dùng chưa gọi `POST /refresh` — đây là dấu hiệu để bộ phận hỗ trợ nhắc người dùng, không phải lỗi dữ liệu.

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/settlements?page=1&page_size=50&status=pending' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c17e5a92-4b60-4d38-8f21-9a3c7d0b6e45'
~~~

**Ghi chú khi viết lại** — Sắp xếp `created_at DESC`. `amount` **đổi đơn vị theo `kind`**: `buy_qty_release` là **số cổ phiếu**, `sell_cash_release` là **số VND** — tuyệt đối không format chung một kiểu; `symbol` chỉ có nghĩa với `buy_qty_release`. Cột `amount` là BigInteger dùng cho cả hai. Whitelist `status` và trả 400 cho giá trị lạ.

---

### GET /api/v1/admin/vt/accounts/{account_id}/stats

> **Thống kê tài khoản** — tổng lệnh/giao dịch, dòng tiền mua/bán và PnL **gần đúng**.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (đếm/`SUM` trên `virtual_orders`, `virtual_trades`) |
| **Side-effect** | không (không ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params** — không có (không phân trang)
**Request body** — —

**Response 200** — `VTAccountStatsResponse`

~~~ts
type GetVTAccountStatsResponse = VTAccountStatsResponse;
~~~

~~~json
{
  "account_id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "total_orders": 128,
  "total_trades": 57,
  "gross_buy_vnd": 1842300500,
  "gross_sell_vnd": 1907650750,
  "realized_pnl_vnd": 65350250,
  "turnover_vnd": 3749951250,
  "win_rate": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | `account_id` sai UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Chưa có giao dịch → mọi số `0`, `win_rate: null`. `win_rate` **luôn** `null` (chưa cài, cần theo dõi giá vốn theo từng lần khớp).

**Công thức (đọc kỹ — tên field gây nhầm)**

~~~
gross_buy_vnd    = | SUM(net_amount_vnd) WHERE side='buy'  |   // net, đã gồm phí; net mua âm nên lấy trị tuyệt đối
gross_sell_vnd   =   SUM(net_amount_vnd) WHERE side='sell'     // net, đã trừ phí + thuế
realized_pnl_vnd = gross_sell_vnd - gross_buy_vnd
turnover_vnd     = gross_buy_vnd + gross_sell_vnd
~~~

**curl**

~~~bash
curl -X GET 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/stats' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4a9f2e7c-0b53-4d16-8927-5e1c6b3d8f02'
~~~

**Ghi chú khi viết lại** — Tên `gross_*` là **sai nghĩa**: giá trị thực là **net** (đã gồm phí/thuế), không phải `gross_amount_vnd` của trade. Giữ tên field để không phá client admin, nhưng ghi rõ trong tooltip UI. `realized_pnl_vnd` chỉ là xấp xỉ dòng tiền: nếu còn hàng chưa bán, con số này **âm** một cách bình thường (đã mua nhiều hơn bán) — không phải "đang lỗ". `SUM` trên BigInteger có thể vượt `Number.MAX_SAFE_INTEGER` khi tài khoản có hàng nghìn lệnh: nhận về dạng chuỗi/BigInt rồi mới chuyển. 4 câu `COUNT`/`SUM` chạy tuần tự — nên gộp bằng một truy vấn có `FILTER (WHERE …)`.

---

### POST /api/v1/admin/vt/accounts/{account_id}/cash-adjust

> **Điều chỉnh số dư tiền mặt** — cộng hoặc trừ `cash_available_vnd`, bắt buộc có lý do, ghi sổ cái + audit log.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `virtual_trading_accounts.cash_available_vnd`; INSERT `virtual_cash_ledger` (`kind="admin_adjust"`, `reference_type="admin_audit"`, `reference_id=null`, `note=reason`); INSERT `admin_audit_logs` action `vt.cash.adjust` (`before={cash_available_vnd}`, `after={cash_available_vnd, ledger_id}`, `note=reason`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params** — —

**Request body**

~~~ts
interface CashAdjustRequest {
  amount_vnd: number;   // BẮT BUỘC; có dấu: dương = cấp thêm, âm = thu hồi; KHÁC 0
  reason: string;       // BẮT BUỘC, 1..1000 ký tự, không được chỉ gồm khoảng trắng
}
~~~

~~~json
{ "amount_vnd": -50000000, "reason": "Thu hồi tiền cấp sai do lỗi vận hành ngày 2026-08-16" }
~~~

**Response 200**

~~~ts
interface CashAdjustResponse {
  account: VTAccountAdminResponse;
  ledger_id: string;                 // uuid bút toán vừa tạo
  new_cash_available_vnd: number;
}
~~~

~~~json
{
  "account": {
    "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
    "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
    "status": "active",
    "initial_cash_vnd": 1000000000,
    "cash_available_vnd": 762350000,
    "cash_reserved_vnd": 60090000,
    "cash_pending_vnd": 0,
    "activated_at": "2026-07-01T01:10:00.000000Z",
    "frozen_at": null,
    "frozen_by_user_id": null,
    "freeze_reason": null,
    "created_at": "2026-07-01T01:10:00.000000Z"
  },
  "ledger_id": "1c8f6b30-7a25-4d94-8e01-3f5b2c7d9a48",
  "new_cash_available_vnd": 762350000
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `amount_vnd == 0` | `Số tiền điều chỉnh khác 0` |
| 400 | `BAD_REQUEST` | `reason` rỗng/chỉ khoảng trắng (vượt được schema) | `Lý do (reason) bắt buộc khi điều chỉnh tiền` |
| 400 | `BAD_REQUEST` | Trừ quá số dư khả dụng | `Số dư không đủ để trừ 900,000,000 VND (hiện tại: 762,350,000)` |
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | Thiếu `amount_vnd`/`reason`, `reason` dài > 1000, `account_id` sai UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài. Không có nhánh suy giảm: hoặc điều chỉnh thành công (kèm ledger + audit trong cùng transaction), hoặc thất bại toàn bộ.

**Thứ tự kiểm tra** — (1) `amount_vnd != 0`; (2) `reason` sau `trim()` không rỗng; (3) tải tài khoản → 404; (4) `cash_available_vnd + amount_vnd >= 0`; (5) ghi số dư mới; (6) INSERT ledger; (7) `flush`; (8) ghi audit. Lưu ý: **không** kiểm `frozen_at` — tài khoản đang bị khoá vẫn điều chỉnh được tiền (chủ ý, để xử lý sự cố).

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/cash-adjust' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: d20b7f34-6c81-4e59-9a07-3b5e1c8d2f60' \
  -d '{"amount_vnd":-50000000,"reason":"Thu hồi tiền cấp sai do lỗi vận hành ngày 2026-08-16"}'
~~~

**Ghi chú khi viết lại** — (a) Chỉ chạm `cash_available_vnd`; **không** chạm `initial_cash_vnd` → sau khi cấp thêm tiền, `return_pct` trên bảng xếp hạng sẽ tăng "giả" vì mốc so sánh không đổi. Đây là hành vi hiện tại; nếu muốn công bằng, phải quyết định sản phẩm riêng (điều chỉnh cả mốc) và ghi changelog. (b) Thông điệp lỗi số dư dùng **dấu phẩy nhóm nghìn kiểu en-US** (`900,000,000`) — Python `f"{x:,}"`; trong TS dùng `Intl.NumberFormat('en-US')` để giống nguyên văn. (c) **CẢNH BÁO số âm + chia lấy sàn**: `amount_vnd` có thể âm, và Python `//` **làm tròn xuống −∞** (`-7 // 2 == -4`) trong khi phép chia `BigInt` của TS **cắt về 0** (`-7n / 2n === -3n`). Riêng endpoint này không có phép chia, nhưng mọi công thức khác trong chương (`roundBps`, giá vốn TB) đều dùng `//`; nếu bất kỳ tham số nào có thể âm, phải cài hàm `floorDiv` tường minh:
~~~ts
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;                                  // truncate
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}
~~~
Dùng `floorDiv` cho giá vốn TB và cho `roundBps` nếu cho phép `amount < 0`. (d) Không có cơ chế đảo bút toán: muốn hoàn tác phải gọi lại cash-adjust với dấu ngược và lý do tham chiếu `ledger_id` cũ.

---

### POST /api/v1/admin/vt/accounts/{account_id}/freeze

> **Tạm khoá tài khoản ảo** — chặn đặt lệnh mới, bắt buộc nêu lý do, ghi audit log.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `virtual_trading_accounts` (`frozen_at`, `frozen_by_user_id`, `freeze_reason`, `status="suspended"`); INSERT `admin_audit_logs` action `vt.account.freeze` (before/after + `note=reason`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params** — —

**Request body**

~~~ts
interface FreezeAccountRequest {
  reason: string;   // BẮT BUỘC, 1..1000 ký tự, không chỉ gồm khoảng trắng
}
~~~

~~~json
{ "reason": "Nghi vấn lạm dụng lệnh tự động, tạm khoá chờ xác minh" }
~~~

**Response 200** — `VTAccountAdminResponse`

~~~ts
type FreezeAccountResponse = VTAccountAdminResponse;
~~~

~~~json
{
  "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
  "status": "suspended",
  "initial_cash_vnd": 1000000000,
  "cash_available_vnd": 762350000,
  "cash_reserved_vnd": 60090000,
  "cash_pending_vnd": 0,
  "activated_at": "2026-07-01T01:10:00.000000Z",
  "frozen_at": "2026-08-17T03:15:41.902000Z",
  "frozen_by_user_id": "f0e1d2c3-b4a5-4968-8776-5a4b3c2d1e0f",
  "freeze_reason": "Nghi vấn lạm dụng lệnh tự động, tạm khoá chờ xác minh",
  "created_at": "2026-07-01T01:10:00.000000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `reason` rỗng/chỉ khoảng trắng | `Lý do (reason) bắt buộc` |
| 400 | `BAD_REQUEST` | Tài khoản đã bị khoá (`frozen_at != null`) | `Tài khoản đã bị tạm khóa` |
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | Thiếu `reason`, `reason` > 1000 ký tự, `account_id` sai UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Không có nhánh suy giảm. Khoá **không** hoàn phong toả và **không** huỷ lệnh `pending`: tiền/CP đang treo vẫn treo, lệnh chờ vẫn có thể khớp nếu ai đó gọi `POST /refresh` cho tài khoản đó (kể cả chính người dùng bị khoá) — chỉ **đặt lệnh mới** bị chặn.

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/freeze' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6f3a1d70-8b25-4c94-a0e6-2d7b5c1f9e38' \
  -d '{"reason":"Nghi vấn lạm dụng lệnh tự động, tạm khoá chờ xác minh"}'
~~~

**Ghi chú khi viết lại** — Khoá là **hai tín hiệu song song**: `frozen_at` và `status="suspended"`; `place_order` kiểm **cả hai** (status trước, `frozen_at` sau) với hai thông điệp khác nhau (`Tài khoản đã bị tạm khóa` vs `Tài khoản tạm khóa`) — giữ đúng cặp thông điệp/thứ tự. `reason` được `trim()` trước khi lưu và trước khi ghi vào `note` của audit. Nếu muốn "khoá là đóng hết cửa" (huỷ lệnh chờ, chặn refresh), đó là **thay đổi hành vi**, phải nêu changelog.

---

### POST /api/v1/admin/vt/accounts/{account_id}/unfreeze

> **Mở khoá tài khoản ảo** — xoá dấu khoá, đưa `status` về `active`, ghi audit log.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute/IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `virtual_trading_accounts` (`frozen_at=null`, `frozen_by_user_id=null`, `freeze_reason=null`, `status="active"`); INSERT `admin_audit_logs` action `vt.account.unfreeze` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `account_id` | `string` | UUID | ID tài khoản ảo |

**Query params** — —

**Request body** — body **bắt buộc gửi** (dù mọi field đều tuỳ chọn)

~~~ts
interface UnfreezeAccountRequest {
  reason?: string | null;   // tuỳ chọn, tối đa 1000 ký tự; dùng làm note của audit
}
~~~

~~~json
{ "reason": "Đã xác minh, người dùng không vi phạm" }
~~~

**Response 200** — `VTAccountAdminResponse`

~~~ts
type UnfreezeAccountResponse = VTAccountAdminResponse;
~~~

~~~json
{
  "id": "9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02",
  "user_id": "3a8d6e10-5f42-4b7c-8e19-2c4f9a7b6d55",
  "status": "active",
  "initial_cash_vnd": 1000000000,
  "cash_available_vnd": 762350000,
  "cash_reserved_vnd": 60090000,
  "cash_pending_vnd": 0,
  "activated_at": "2026-07-01T01:10:00.000000Z",
  "frozen_at": null,
  "frozen_by_user_id": null,
  "freeze_reason": null,
  "created_at": "2026-07-01T01:10:00.000000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Tài khoản đang **không** bị khoá | `Tài khoản đang không bị khóa` |
| 404 | `NOT_FOUND` | Tài khoản không tồn tại | `Không tìm thấy Tài khoản giao dịch ảo` |
| 401/403 | `UNAUTHORIZED`/`FORBIDDEN` | Không đăng nhập / không phải admin | `Yêu cầu xác thực` / `Yêu cầu quyền quản trị viên` |
| 422 | — (Pydantic) | Không gửi body, `reason` > 1000 ký tự, `account_id` sai UUID | mảng `detail` của framework |

**Fallback / suy giảm** — Không có nhánh suy giảm. `reason` không gửi → audit `note = null` (endpoint truyền `""` xuống service, service ghi `null` khi chuỗi rỗng).

**curl**

~~~bash
curl -X POST 'https://api.iqx.vn/api/v1/admin/vt/accounts/9f1c2a44-7b3e-4c58-9d21-b7a6e0f31d02/unfreeze' \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: ae91c407-52d3-4b68-8f10-7c2b6d3e5a94' \
  -d '{"reason":"Đã xác minh, người dùng không vi phạm"}'
~~~

**Ghi chú khi viết lại** — Mở khoá **luôn** đặt `status = "active"`, kể cả khi tài khoản trước đó `suspended` vì nguyên nhân khác (hiện tại chỉ freeze mới tạo `suspended`, nên chấp nhận được — nhưng nếu thêm nguyên nhân treo mới thì logic này thành bug). Lý do khoá cũ bị **xoá khỏi bảng account** — bằng chứng chỉ còn trong `admin_audit_logs` (`payload_before` của bản ghi unfreeze), nên đừng xoá/rút gọn audit. Body bắt buộc gửi (ít nhất `{}`) vì schema request không có default ở tầng route.

---

## Ghi chú tổng hợp khi viết lại

1. **Tiền là BigInt.** Mọi phép nhân trung gian (`price × quantity`, `× bps`) phải làm bằng `bigint`; chỉ chuyển sang `number` khi serialize JSON và chỉ khi chắc chắn trong `2^53`. Các cột `BigInteger` (`*_vnd`, `settlement.amount`) nên map sang `bigint` trong ORM (TypeORM/Prisma đều hỗ trợ) và có transformer serialize thành **số JSON** (không phải chuỗi) để giữ đúng hình dạng cũ.
2. **Làm tròn.** `roundBps` = làm tròn **nửa lên** bằng số học nguyên `(amount*bps + 5000) / 10000`; giá vốn TB = chia **lấy sàn**. Không dùng `Math.round`/`toFixed` (sai ở biên .5 và mất chính xác). Với số âm, dùng `floorDiv` như ở mục cash-adjust — `//` của Python ≠ `/` của BigInt.
3. **Đơn vị.** Giá và mọi số tiền: **đồng VND, số nguyên**. `bps`: 1 bps = 0,01% (mặc định mua 15, bán 15, thuế 10). `settlement.amount` đổi nghĩa theo `kind` (CP hay VND). VNDIRECT trả **kVND** (×1000), VCI trả **VND** (×1) — sai chỗ này là sai giá 1000 lần.
4. **Thứ tự kiểm tra là hợp đồng.** Đặc biệt `POST /orders`: validate schema → config/`trading_enabled` → lô → limit price → ngưỡng cứng → validate mã (provider!) → lock account → status/frozen → snapshot → khớp/treo. Đảo thứ tự sẽ đổi mã lỗi mà client đang xử lý.
5. **Snapshot > config hiện tại.** Khi khớp lệnh đang chờ, đọc phí/thuế/settlement từ `config_snapshot` của lệnh. Chỉ thiếu khoá mới lấy config hiện tại.
6. **Lock hàng.** `place_order`, `cancel_order`, `refresh` đều `SELECT … FOR UPDATE` trên account (và position khi bán). Trong NestJS: dùng transaction + `pessimistic_write` lock, đừng thay bằng optimistic version nếu không đổi cả tài liệu.
7. **Một transaction cho một request.** Mọi mutation (kể cả `admin_audit_logs`) nằm trong transaction của request; audit chỉ `flush`, không commit riêng — hoặc cả mutation + audit cùng vào, hoặc cùng rollback. Không được `try/catch` bỏ qua lỗi ghi audit.
8. **`total_pages` không thống nhất giữa hai nhóm admin.** `/virtual-trading/admin/accounts` trả `0` khi `total = 0`; `/admin/vt/*` trả `max(1, …)` = `1`. Giữ nguyên từng nhóm (client đang dựa vào), đừng "chuẩn hoá" âm thầm.
9. **Mã lỗi cho UUID sai định dạng cũng không thống nhất**: `/virtual-trading/orders/{order_id}/cancel` và `/virtual-trading/admin/users/{user_id}/reset` trả **404**; tất cả `/admin/vt/*` trả **422**. Đây là do khai báo kiểu path khác nhau — giữ nguyên.
10. **Không validate whitelist ở vài query admin** (`status` của `/admin/vt/*/orders` và `/settlements`, `date_from`/`date_to`): bản Python để lỗi văng thành 500. Bản TS **nên** validate và trả 400 — nhưng phải ghi vào changelog vì là thay đổi hành vi quan sát được.
11. **Provider ngoài & fail-closed.** Validate mã: nguồn lỗi → **503, không tạo lệnh**. Giá: hết nguồn → lệnh market thành `rejected` (HTTP 201), lệnh limit giữ `pending` kèm `warnings`, portfolio trả `null` cho vị thế đó. Cache danh sách mã 300s (nên chuyển sang Redis khi chạy nhiều instance).
12. **Không có cron.** T+2 chỉ settle khi `POST /refresh` được gọi; lệnh GFD chỉ `expired` khi refresh. Nếu thêm scheduler, phải giữ nguyên logic từng bước và cân nhắc khoá phân tán (tham khảo bài học advisory-lock của hệ thống).
13. **Reset không xoá tiến độ Cấp 0–8** và không mở khoá tài khoản; xoá cứng, không hoàn tác được. Đây là điểm dễ làm sai nhất khi viết lại.
14. **Bảng xếp hạng công khai lộ `user_id` + họ tên thật** (không lộ email) và chỉ đánh giá tối đa 200 tài khoản. Xử lý riêng tư và hiển thị `evaluated_count` vs `total_eligible` cho người xem.
15. **Hai điểm không nhất quán dữ liệu đã biết** (giữ nguyên, ghi tài liệu, đừng "sửa" lặng lẽ): (a) ledger của lệnh bán T2 ghi `amount_vnd` dương nhưng `balance_after_vnd` chưa tăng; (b) `cash-adjust` đổi `cash_available_vnd` mà không đổi `initial_cash_vnd`, làm lệch `return_pct`.
16. **Chưa xác định / cần xác nhận với chủ sản phẩm**: thông điệp và body lỗi 429 do SlowAPI sinh (xem `app/main.py` + `app/core/rate_limit.py`); mã lỗi chính xác khi `status` lạ rơi xuống tầng ORM ở `/admin/vt/*/orders|settlements` (xem `app/services/admin_vt.py`); nội dung `WWW-Authenticate` và luồng làm mới token (xem chương xác thực).
