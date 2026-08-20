# Endpoint — Cảnh báo, quản trị cảnh báo, Telegram

Chương này đặc tả trọn hệ cảnh báo (alert) của IQX: 10 tín hiệu mặc định do admin quản lý, rule đăng ký theo từng user, lịch sử tín hiệu đã bắn, liên kết tài khoản Telegram và webhook nhận update từ bot. Toàn bộ 16 endpoint đều nằm dưới prefix `/api/v1`.

Điểm cần nhớ trước khi đọc: nhóm `/alerts/*` yêu cầu **Premium** (không phải chỉ Bearer), nhóm `/admin/alerts/*` yêu cầu **Admin**, còn `POST /telegram/webhook/{secret}` là endpoint **công khai** chỉ được bảo vệ bằng một path segment bí mật. Cảnh báo chỉ thực sự được gửi cho user đã liên kết Telegram — user chưa liên kết thì job quét bỏ qua hoàn toàn và bảng `alert_events` của họ luôn rỗng.

Nguồn: `app/api/v1/endpoints/alerts.py`, `admin_alerts.py`, `telegram.py`; `app/schemas/alert.py`; `app/services/alerts/*`; `app/services/telegram/*`; `app/services/ta/conditions.py`, `display_names.py`; `app/models/alert.py`; `app/repositories/alert.py`.

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/alerts/signals` | Bearer + Premium | Danh sách tín hiệu preset đang bật để user đăng ký |
| 2 | GET | `/api/v1/alerts/rules` | Bearer + Premium | Liệt kê rule cảnh báo của chính user |
| 3 | POST | `/api/v1/alerts/rules` | Bearer + Premium | Đăng ký preset (copy-on-subscribe) hoặc tạo rule tùy chỉnh |
| 4 | PUT | `/api/v1/alerts/rules/{rule_id}` | Bearer + Premium | Sửa tên / tổ hợp / bật-tắt một rule |
| 5 | DELETE | `/api/v1/alerts/rules/{rule_id}` | Bearer + Premium | Xoá một rule |
| 6 | GET | `/api/v1/alerts/events` | Bearer + Premium | 50 tín hiệu đã bắn gần nhất của user |
| 7 | GET | `/api/v1/alerts/telegram` | Bearer + Premium | Trạng thái liên kết Telegram |
| 8 | POST | `/api/v1/alerts/telegram/link` | Bearer + Premium | Phát token một lần + deep-link `t.me` |
| 9 | DELETE | `/api/v1/alerts/telegram` | Bearer + Premium | Huỷ liên kết Telegram |
| 10 | POST | `/api/v1/telegram/webhook/{secret}` | Công khai (secret trong path) | Nhận update từ Telegram Bot API, xử lý `/start <token>` |
| 11 | GET | `/api/v1/admin/alerts/signals` | Bearer + Admin | Liệt kê TẤT CẢ preset (kể cả đang tắt) |
| 12 | POST | `/api/v1/admin/alerts/signals` | Bearer + Admin | Tạo preset mới |
| 13 | PUT | `/api/v1/admin/alerts/signals/{key}` | Bearer + Admin | Ghi đè toàn bộ một preset |
| 14 | DELETE | `/api/v1/admin/alerts/signals/{key}` | Bearer + Admin | Xoá một preset |
| 15 | POST | `/api/v1/admin/alerts/seed` | Bearer + Admin | Seed lại 10 preset mặc định (idempotent) |
| 16 | GET | `/api/v1/admin/alerts/indicators` | Bearer + Admin | 38 chỉ báo TA dùng được trong tổ hợp |

---

## Kiểu dữ liệu dùng chung

#### Hợp đồng `combination` (quan trọng nhất)

Mọi tín hiệu (preset của admin và rule của user) đều được mô tả bằng đúng một object `combination`. Đây là hợp đồng cốt lõi — sai shape là sai cả hệ.

~~~ts
type LogicOp = "AND" | "OR";

/** Toán tử được phép trong một điều kiện. */
type ConditionOp =
  | ">" | "<" | ">=" | "<=" | "=="   // so sánh
  | "cross_above" | "cross_below"    // cắt lên / cắt xuống
  | "is_true";                       // chỉ dùng cho chỉ báo nhị phân

interface ConditionSchema {
  /** Tên trường: 1 trong 38 chỉ báo, hoặc raw field close|open|high|low|volume. */
  indicator: string;
  op: ConditionOp;
  /**
   * Ngưỡng số, HOẶC tên một trường khác (so sánh trường-với-trường,
   * ví dụ close > ma_50), HOẶC null khi op = "is_true".
   */
  value?: number | string | null;
  /**
   * Liên kết boolean với điều kiện TRƯỚC nó. Bỏ trống → dùng `logic` của
   * combination. Điều kiện đầu tiên luôn bỏ qua `join`.
   */
  join?: LogicOp | null;
}

interface CombinationSchema {
  logic?: LogicOp;                  // default "AND"
  conditions: ConditionSchema[];    // phải có >= 1 phần tử
}
~~~

**Ngữ nghĩa đánh giá** (`app/services/ta/conditions.py`):

- `logic` chỉ là connector **mặc định**. Từng condition có thể ghi đè bằng `join`, cho ra logic trộn.
- Ưu tiên chuẩn: AND buộc chặt hơn OR. Các condition liên tiếp nối bằng AND gộp thành một *group*; các group được OR với nhau (sum-of-products). Với logic thuần nhất, công thức thu về AND phẳng hoặc OR phẳng.
- Toán hạng `NaN` (chỉ báo chưa đủ warmup) → điều kiện đó **false** ở bar đó, không phải lỗi.
- `cross_above`: `lhs > rhs && lhs_prev <= rhs_prev`. `cross_below`: `lhs < rhs && lhs_prev >= rhs_prev`. Bar đầu tiên luôn false (không có `prev`).
- `is_true` đúng khi giá trị chỉ báo `== 1.0`.
- Alert dùng `evaluate_latest` — chỉ xét **bar cuối cùng** của chuỗi; mảng rỗng → `false`.

**Quy tắc validate** (thứ tự kiểm tra, dừng ở lỗi đầu tiên — mỗi lỗi trả HTTP 400):

1. `logic` không thuộc `{AND, OR}` → `Logic phải là AND/OR, nhận '<giá trị>'`
2. `conditions` rỗng → `Tổ hợp phải có ít nhất 1 điều kiện`
3. Với từng condition, theo đúng thứ tự:
   1. `indicator` không thuộc 38 chỉ báo ∪ `{close, open, high, low, volume}` → `Chỉ số không hợp lệ: '<giá trị>'`
   2. `op` không thuộc danh sách `ConditionOp` → `Toán tử không hợp lệ: '<giá trị>'`
   3. `join` khác null và khác AND/OR → `Liên kết phải là AND/OR, nhận '<giá trị>'`
   4. Nếu `op == "is_true"`: `indicator` phải là chỉ báo **nhị phân**, nếu không → `'is_true' chỉ dùng cho chỉ số nhị phân, không phải '<giá trị>'`. Kiểm tra dừng tại đây (không cần `value`).
   5. `value` là null/undefined → `Điều kiện <indicator> <op> thiếu ngưỡng`
   6. `value` là string nhưng không phải trường referenceable → `Trường so sánh không hợp lệ: '<giá trị>'`
   7. `op` là cross mà `indicator` là nhị phân → `Không thể dùng cross trên chỉ số nhị phân '<indicator>'`

> Lưu ý shape khi lưu: bản seed (`signals.py`) lưu condition dưới dạng `{indicator, op, value}` — **không có key `join`**. Còn khi đi qua API (admin hoặc user), `CombinationSchema.to_dict()` dùng `model_dump()` nên condition lưu vào DB **luôn có `join: null`**. Cả hai đều parse được; đừng viết code giả định `join` luôn tồn tại hoặc luôn vắng.

#### Các response object

~~~ts
type AlertSide = "buy" | "sell";

interface AlertSignalResponse {
  key: string;                 // slug, ^[a-z0-9_]+$, <= 40 ký tự
  side: AlertSide;             // serialize từ enum StrEnum → chuỗi "buy"/"sell"
  ta_name: string;             // tên chỉ báo/kỹ thuật, <= 60 ký tự
  message_title: string;       // tiêu đề message tiếng Việt, <= 200 ký tự
  combination: CombinationSchema;
  is_enabled: boolean;
  sort_order: number;          // integer
}

interface UserAlertRuleResponse {
  id: string;                  // UUID
  name: string;
  side: AlertSide;
  base_signal_key: string | null;  // null = rule tùy chỉnh
  combination: CombinationSchema;
  is_enabled: boolean;
  created_at: string;          // ISO 8601 có timezone
  updated_at: string;
}

interface AlertEventResponse {
  id: string;                  // UUID
  symbol: string;              // luôn UPPERCASE
  signal_key: string | null;   // copy từ rule.base_signal_key lúc bắn
  session_date: string;        // "YYYY-MM-DD" — ngày phiên theo giờ VN
  fired_at: string;            // ISO 8601, UTC
  price: number | null;        // giá đóng cửa bar cuối lúc bắn
  delivered: boolean;          // true = đã gửi Telegram thành công
}

interface TelegramStatusResponse {
  linked: boolean;
  linked_at?: string | null;   // ISO 8601 hoặc null
  bot_username?: string | null;
}

interface TelegramLinkResponse {
  deep_link: string;           // https://t.me/<bot>?start=<token>
  token: string;
}
~~~

#### Envelope lỗi — CÓ HAI DẠNG, đừng gộp

| Nguồn lỗi | Body |
|---|---|
| Guard xác thực/quyền (`ForbiddenError`, `UnauthorizedError`… trong `app/core/exceptions.py`) | `{ "detail": "...", "code": "FORBIDDEN" }` |
| `HTTPException` thô do chính các endpoint alert raise (400/404/409/503) | `{ "detail": "..." }` — **KHÔNG có field `code`** |
| Pydantic validation | `{ "detail": [ { "loc": [...], "msg": "...", "type": "..." } ] }` (HTTP 422) |

~~~ts
interface ErrorEnvelope {
  detail: string;
  code?: string | null;        // chỉ có ở lỗi guard, không có ở lỗi nghiệp vụ alert
}
~~~

#### Guard

| Alias | Kiểm tra | Lỗi |
|---|---|---|
| Bearer | JWT hợp lệ; `user.is_active` | 401 `Thông tin xác thực không hợp lệ` / 403 `Tài khoản chưa được kích hoạt` (code `FORBIDDEN`) |
| Bearer + Premium | Bearer, rồi `is_premium_active` (admin **luôn** pass, không cần subscription) | 403 `Yêu cầu gói Premium đang hoạt động`, code `FORBIDDEN` |
| Bearer + Admin | Bearer, rồi `user.role == "admin"` | 403 `Yêu cầu quyền quản trị viên`, code `FORBIDDEN` |

#### Rate limit

Không có endpoint nào trong chương này khai báo limit riêng. Toàn bộ chịu limit toàn cục `RATE_LIMIT_DEFAULT = "60/minute"` theo **IP** (slowapi + `SlowAPIMiddleware`, storage `memory://`), tắt khi `APP_ENV ∈ {testing, test}`.

#### Biến cấu hình liên quan

| Biến | Default | Vai trò |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `""` | Token bot; rỗng ⇒ mọi call Telegram raise `TelegramError` |
| `TELEGRAM_BOT_USERNAME` | `""` | Username bot (không có `@`) dùng dựng deep-link |
| `TELEGRAM_WEBHOOK_SECRET` | `""` | Path segment bảo vệ webhook + `secret_token` gửi cho `setWebhook` |
| `ALERTS_ENABLED` | `false` | Công tắc tổng cho job quét intraday |
| `ALERT_SCAN_INTERVAL_MINUTES` | `10` | Chu kỳ job (bị `max(x, 1)`) |
| `APP_PUBLIC_URL` | `http://localhost:3000` | Base URL dựng webhook URL lúc startup |

---

## Nghiệp vụ nền

#### 10 tín hiệu mặc định (seed bởi `app/services/alerts/seeder.py` + `signals.py`)

`sort_order` = chỉ số trong mảng (0..9). Tất cả seed với `is_enabled = true`.

| # | key | message_title (tiêu đề message) | side | ta_name | logic | Điều kiện |
|---|---|---|---|---|---|---|
| 0 | `pullback` | Mua khi giá điều chỉnh nhẹ | buy | Pullback | AND | `uptrend is_true` · `dist_ma_20 < -0.03` · `rsi_14 < 45` |
| 1 | `breakout` | Mua khi giá vượt đỉnh | buy | Breakout | AND | `breakout_20d is_true` · `vol_zscore > 1.5` |
| 2 | `reversal` | Mua khi quay đầu tăng | buy | Reversal | OR | `bull_engulfing is_true` · `hammer is_true` |
| 3 | `squeeze` | Mua trước khi bung khỏi vùng nén | buy | Squeeze | AND | `bb_squeeze is_true` · `ma_20_slope > 0` |
| 4 | `continuation` | Mua khi đà tăng mạnh | buy | Continuation | AND | `ma_stack_bull is_true` · `macd_hist > 0` · `roc_20d > 0.05` |
| 5 | `overbought` | Bán khi giá đã tăng nóng | sell | Overbought | AND | `rsi_14 > 70` · `dist_ma_20 > 0.10` |
| 6 | `breakdown` | Bán khi giá vỡ hỗ trợ | sell | Breakdown | OR | `breakdown_20d is_true` · `bb_breakout_down is_true` |
| 7 | `top_reversal` | Bán khi nến đảo chiều giảm | sell | Top Reversal | OR | `bear_engulfing is_true` · `shooting_star is_true` |
| 8 | `squeeze_down` | Bán khi bung nén xuống | sell | Squeeze Down | AND | `bb_breakout_down is_true` · `vol_zscore > 1.0` |
| 9 | `trend_break` | Bán khi gãy xu hướng | sell | Trend Break | OR | `death_cross is_true` · `macd_bear_cross is_true` |

Đơn vị các ngưỡng: `dist_ma_20`, `roc_20d` là **tỷ lệ thập phân** (`-0.03` = −3%, `0.05` = +5%, `0.10` = +10%), KHÔNG phải phần trăm. `rsi_14` thang 0–100. `vol_zscore` là z-score (không đơn vị).

JSON đầy đủ của một preset khi seed (ví dụ `pullback`):

~~~json
{
  "logic": "AND",
  "conditions": [
    { "indicator": "uptrend", "op": "is_true", "value": null },
    { "indicator": "dist_ma_20", "op": "<", "value": -0.03 },
    { "indicator": "rsi_14", "op": "<", "value": 45 }
  ]
}
~~~

#### 38 chỉ báo dùng được (payload của endpoint #16)

`kind`: `"num"` = số, `"signal"` = nhị phân (chỉ nhóm `signal` được dùng với `is_true`; và cross bị **cấm** trên nhóm này).

| id | label | kind |
|---|---|---|
| `ma_5` | MA5 | num |
| `ma_20` | MA20 | num |
| `ma_50` | MA50 | num |
| `ma_200` | MA200 | num |
| `ma_stack_bull` | MA5 > MA20 > MA50 > MA200 | signal |
| `uptrend` | MA50 > MA200 | signal |
| `death_cross` | MA20 cắt xuống MA50 | signal |
| `ma_20_slope` | Độ dốc MA20 | num |
| `dist_ma_20` | Khoảng cách giá tới MA20 | num |
| `dist_ma_200` | Khoảng cách giá tới MA200 | num |
| `rsi_14` | RSI 14 | num |
| `macd_hist` | Histogram MACD | num |
| `macd_bull_cross` | MACD cắt lên Signal | signal |
| `macd_bear_cross` | MACD cắt xuống Signal | signal |
| `roc_20d` | ROC 20 phiên | num |
| `atr_14` | ATR 14 | num |
| `atr_pct` | ATR theo % giá | num |
| `bb_width` | Độ rộng dải Bollinger | num |
| `bb_squeeze` | Bollinger thắt hẹp | signal |
| `bb_breakout_down` | Giá phá xuống Bollinger dưới | signal |
| `vol_ma_20` | MA20 của khối lượng | num |
| `vol_zscore` | Độ bất thường khối lượng | num |
| `obv` | OBV | num |
| `obv_ma_20` | MA20 của OBV | num |
| `high_20` | Đỉnh 20 phiên | num |
| `high_52w` | Đỉnh 52 tuần | num |
| `dist_52w_high` | Khoảng cách tới đỉnh 52 tuần | num |
| `breakout_20d` | Phá đỉnh 20 phiên | signal |
| `breakout_52w` | Phá đỉnh 52 tuần | signal |
| `low_20` | Đáy 20 phiên | num |
| `low_52w` | Đáy 52 tuần | num |
| `dist_52w_low` | Khoảng cách tới đáy 52 tuần | num |
| `breakdown_20d` | Thủng đáy 20 phiên | signal |
| `breakdown_52w` | Thủng đáy 52 tuần | signal |
| `hammer` | Nến búa | signal |
| `bull_engulfing` | Nến nhấn chìm tăng | signal |
| `bear_engulfing` | Nến nhấn chìm giảm | signal |
| `shooting_star` | Nến sao băng | signal |

15 chỉ báo `signal` (nhị phân): `ma_stack_bull`, `uptrend`, `death_cross`, `macd_bull_cross`, `macd_bear_cross`, `bb_squeeze`, `bb_breakout_down`, `breakout_20d`, `breakout_52w`, `breakdown_20d`, `breakdown_52w`, `hammer`, `bull_engulfing`, `bear_engulfing`, `shooting_star`. Ngoài 38 id trên, condition còn được tham chiếu 5 raw field `close`, `open`, `high`, `low`, `volume` (không xuất hiện trong endpoint #16).

#### Job quét intraday (`app/services/alerts/scan.py` + `jobs/alert_scan.py`)

Đăng ký vào APScheduler chỉ khi `JOBS_ENABLED != false` **và** `ALERTS_ENABLED = true`; `IntervalTrigger(minutes = max(ALERT_SCAN_INTERVAL_MINUTES, 1))`, `id="alert_scan"`, `max_instances=1`, `coalesce=True`, `replace_existing=True`. Chi tiết hạ tầng scheduler: xem **chương 09 (Job nền / scheduler)**.

Trình tự một lần quét:

1. **Cổng giờ giao dịch** — `is_market_open(now_VN)`: Thứ 2–6, `09:00 <= t < 11:30` **hoặc** `13:00 <= t < 15:00` theo `UTC+7`. Ngoài khung ⇒ trả ngay `{"skipped": "market_closed"}`. Tham số `force=true` (test/thủ công) bỏ qua cổng này. **KHÔNG có lịch nghỉ lễ** — ngày lễ VN vẫn quét.
2. Lấy **tất cả** rule `is_enabled = true` của **mọi** user. Rỗng ⇒ `{"rules": 0, "symbols_scanned": 0, "alerts_fired": 0}` (không có `ran_at`).
3. Gom rule theo `user_id`; nạp map `user_id -> {symbols}` từ **toàn bộ** `watchlist_items` (symbol được `.upper()`).
4. **Chỉ user đã liên kết Telegram** (`telegram_chat_id` khác null) mới được tính. Universe = hợp của watchlist các user đó. Không có watchlist ⇒ không quét mã nào. **Không quét “tất cả mã sàn”.**
5. Với mỗi symbol trong universe: `get_adjusted_ohlcv(symbol, today - 420 ngày, today, use_cache=False)`. Lỗi provider ⇒ log warning và **bỏ symbol đó**, không abort cả lượt quét. `< 60` bar ⇒ bỏ. Frame được tính một lần và dùng lại cho mọi user.
6. Với mỗi (user, symbol trong watchlist của user, rule): `evaluate_latest(frame, combination)`. Exception khi eval ⇒ log warning, bỏ qua rule đó.
7. Hit ⇒ `_fire`: kiểm tra tồn tại `(user_id, rule_id, symbol, session_date)` → nếu có, bỏ. Nếu chưa, **INSERT trước, gửi sau**: tạo `alert_events` với `delivered = false`, commit; `IntegrityError` (worker khác chèn trước) ⇒ rollback + bỏ. Sau khi commit mới gửi Telegram; gửi thành công ⇒ `delivered = true`, gửi lỗi ⇒ `delivery_error = str(exc)[:300]`, rồi commit. **Gửi lỗi không xoá event và không thử lại** — không có retry queue.
8. Trả summary `{rules, symbols_scanned, alerts_fired, ran_at}` (`ran_at` = ISO giờ VN).

**Format message Telegram** (`parse_mode: HTML`, `disable_web_page_preview: true`):

```
🟢 <b>{rule.name}</b> — <b>{symbol}</b>
Giá: {price:,.0f}
```

`🟢` khi `side = "buy"`, `🔴` khi `side = "sell"`. Giá format `,.0f` — dấu phẩy ngăn nghìn, 0 chữ số thập phân, ví dụ `Giá: 118,500`.

#### Chống trùng / cooldown

Khoá dedupe: **UNIQUE `(user_id, rule_id, symbol, session_date)`** — constraint `uq_alert_events_user_rule_symbol_date` trên bảng `alert_events`. Nghĩa là:

- Một rule bắn **tối đa 1 lần / mã / ngày phiên**, dù job quét lại mỗi 10 phút.
- Không có cooldown theo phút. "Cooldown" thực chất là **hết ngày phiên (theo ngày giờ VN)**.
- Khoá dùng `rule_id`, **không** dùng `signal_key`: hai rule khác nhau cùng `base_signal_key = "breakout"` sẽ bắn **hai** event cho cùng mã cùng ngày.
- Xoá rule rồi tạo lại trong cùng ngày ⇒ `rule_id` mới ⇒ **bắn lại được** trong ngày đó.
- Constraint DB là hàng phòng ngự cuối cho multi-worker; check-then-insert chỉ là tối ưu.

#### Telegram client (`app/services/telegram/client.py`)

Base `https://api.telegram.org/bot{token}/{method}`, timeout **10s**, `httpx.AsyncClient` tạo mới mỗi call. `is_configured()` = có `TELEGRAM_BOT_TOKEN`. Nếu chưa cấu hình ⇒ raise `TelegramError("Telegram chưa được cấu hình (thiếu TELEGRAM_BOT_TOKEN)")`. Response không có `ok: true` ⇒ raise `TelegramError("Telegram {method} thất bại: {description}")`. Hai method dùng: `sendMessage`, `setWebhook`.

#### Đăng ký webhook lúc startup (`app/services/alerts/startup.py`)

Chạy trong lifespan, **sau** khi scheduler start:

1. Seed 10 preset (idempotent, `overwrite=false`). Mọi exception ⇒ chỉ log warning `Alert signal seeding skipped: ...` (chịu được race giữa nhiều worker).
2. Nếu có đủ `TELEGRAM_BOT_TOKEN` **và** `TELEGRAM_WEBHOOK_SECRET` **và** `APP_PUBLIC_URL`: gọi `setWebhook` với `url = "{APP_PUBLIC_URL bỏ / cuối}/api/v1/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}"`, `allowed_updates = ["message"]`, `secret_token = TELEGRAM_WEBHOOK_SECRET`. Thất bại ⇒ chỉ log warning, app vẫn boot.

> Bẫy vận hành: `APP_PUBLIC_URL` default là `http://localhost:3000` (URL frontend). Nếu deploy mà quên set biến này về domain **backend**, webhook sẽ được đăng ký trỏ sai và không lỗi rõ ràng.

---

## Tín hiệu preset (user)

### GET /api/v1/alerts/signals

> **Danh sách tín hiệu để đăng ký** — trả các preset đang bật mà user Premium có thể đăng ký.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (60/minute/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `alert_signals` |
| **Side-effect** | — |

**Path params** — —

**Query params** — không có tham số nào (không filter, không phân trang).

**Request body** — —

**Response 200**

~~~ts
type Response = AlertSignalResponse[];
~~~

~~~json
[
  {
    "key": "pullback",
    "side": "buy",
    "ta_name": "Pullback",
    "message_title": "Mua khi giá điều chỉnh nhẹ",
    "combination": {
      "logic": "AND",
      "conditions": [
        { "indicator": "uptrend", "op": "is_true", "value": null },
        { "indicator": "dist_ma_20", "op": "<", "value": -0.03 },
        { "indicator": "rsi_14", "op": "<", "value": 45 }
      ]
    },
    "is_enabled": true,
    "sort_order": 0
  },
  {
    "key": "breakout",
    "side": "buy",
    "ta_name": "Breakout",
    "message_title": "Mua khi giá vượt đỉnh",
    "combination": {
      "logic": "AND",
      "conditions": [
        { "indicator": "breakout_20d", "op": "is_true", "value": null },
        { "indicator": "vol_zscore", "op": ">", "value": 1.5 }
      ]
    },
    "is_enabled": true,
    "sort_order": 1
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Tài khoản bị vô hiệu | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Bảng chưa seed hoặc admin tắt hết ⇒ trả `[]` (HTTP 200), không lỗi. Số lượng **không cố định 10**: docstring gốc ghi "10 enabled presets" nhưng code chỉ lọc `is_enabled = true`, admin có thể tắt bớt hoặc thêm preset mới.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/alerts/signals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 8f2a1c40-3b7e-4a91-9d55-2c6e0b7f1a33"
~~~

**Ghi chú khi viết lại** — Sắp xếp `sort_order ASC`, **không có tie-breaker** thứ hai; nếu cần thứ tự ổn định hãy thêm `key ASC` (và ghi vào tài liệu API vì đó là thay đổi hành vi). Không lộ `id` UUID của `alert_signals` ra API — khoá công khai là `key`. `side` phải là chuỗi `"buy"`/`"sell"`, không phải object enum.

---

## Rule của người dùng

### GET /api/v1/alerts/rules

> **Danh sách rule của tôi** — mọi rule cảnh báo user đã tạo, bật và tắt.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `user_alert_rules` lọc theo `user_id` |
| **Side-effect** | — |

**Path params** — —

**Query params** — không có (không phân trang, không lọc).

**Request body** — —

**Response 200**

~~~ts
type Response = UserAlertRuleResponse[];
~~~

~~~json
[
  {
    "id": "3e9a7c12-5f48-4b6d-9a01-7c2e5d8f4b10",
    "name": "Mua khi giá vượt đỉnh",
    "side": "buy",
    "base_signal_key": "breakout",
    "combination": {
      "logic": "AND",
      "conditions": [
        { "indicator": "breakout_20d", "op": "is_true", "value": null },
        { "indicator": "vol_zscore", "op": ">", "value": 1.5 }
      ]
    },
    "is_enabled": true,
    "created_at": "2026-08-17T02:14:33.518000+00:00",
    "updated_at": "2026-08-17T02:14:33.518000+00:00"
  },
  {
    "id": "b41d6e88-0c25-42f7-8e93-1a5f7b3c9d64",
    "name": "VCB quá bán",
    "side": "buy",
    "base_signal_key": null,
    "combination": {
      "logic": "AND",
      "conditions": [
        { "indicator": "rsi_14", "op": "<", "value": 30, "join": null }
      ]
    },
    "is_enabled": false,
    "created_at": "2026-08-17T03:02:09.774000+00:00",
    "updated_at": "2026-08-17T06:41:55.102000+00:00"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Chưa có rule ⇒ `[]`.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/alerts/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 5c1b9d02-7e64-4f18-b3a7-9d40e2f6c815"
~~~

**Ghi chú khi viết lại** — Sắp xếp `created_at ASC` (rule cũ trước — **ngược** với `/alerts/events`). Rule **không có** danh sách mã riêng: phạm vi quét luôn là watchlist hiện tại của user. Rule copy từ preset lưu bản sao `combination` tại thời điểm đăng ký — admin sửa preset sau đó **không** ảnh hưởng rule đã tạo.

---

### POST /api/v1/alerts/rules

> **Tạo rule cảnh báo** — hoặc đăng ký một preset (copy-on-subscribe), hoặc định nghĩa tổ hợp tùy chỉnh.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — đọc `alert_signals`, ghi `user_alert_rules` |
| **Side-effect** | INSERT `user_alert_rules` (commit ở tầng `get_db`) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface UserAlertRuleCreate {
  /** Có giá trị ⇒ nhánh "đăng ký preset"; các field name/side/combination bị bỏ qua trừ name. */
  signal_key?: string | null;
  name?: string | null;          // <= 120 ký tự
  side?: "buy" | "sell" | null;
  combination?: CombinationSchema | null;
  is_enabled?: boolean;          // default true
}
~~~

Đăng ký preset:

~~~json
{ "signal_key": "breakout", "is_enabled": true }
~~~

Rule tùy chỉnh (FPT — RSI quá bán và còn xu hướng tăng):

~~~json
{
  "name": "FPT hồi trong uptrend",
  "side": "buy",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "uptrend", "op": "is_true" },
      { "indicator": "rsi_14", "op": "<", "value": 35 },
      { "indicator": "close", "op": ">", "value": "ma_200" }
    ]
  },
  "is_enabled": true
}
~~~

**Response 201**

~~~ts
type Response = UserAlertRuleResponse;
~~~

~~~json
{
  "id": "9a7f2b41-6c38-4d52-b0e7-4f1a8c95d327",
  "name": "Mua khi giá vượt đỉnh",
  "side": "buy",
  "base_signal_key": "breakout",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "breakout_20d", "op": "is_true", "value": null },
      { "indicator": "vol_zscore", "op": ">", "value": 1.5 }
    ]
  },
  "is_enabled": true,
  "created_at": "2026-08-17T04:20:11.006000+00:00",
  "updated_at": "2026-08-17T04:20:11.006000+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | — | `signal_key` có nhưng không tồn tại trong `alert_signals` | `Không tìm thấy tín hiệu` |
| 400 | — | Không có `signal_key` và thiếu `name` / `side` / `combination` | `Cần name, side và combination cho tín hiệu tùy chỉnh` |
| 400 | — | `combination` sai (chỉ báo/toán tử/ngưỡng) | thông điệp từ validator, ví dụ `Chỉ số không hợp lệ: 'nope'` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | `name` > 120 ký tự, `side` ngoài `buy/sell`, `logic` ngoài `AND/OR` | mảng lỗi Pydantic |

**Fallback / suy giảm** — Không có. Đây là thao tác ghi thuần DB, không phụ thuộc provider ngoài.

**curl**

~~~bash
curl -sS -X POST "https://api.iqx.vn/api/v1/alerts/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 2d4e6f80-1a3b-4c5d-8e9f-0a1b2c3d4e5f" \
  -d '{"signal_key":"breakout","is_enabled":true}'
~~~

**Ghi chú khi viết lại** — Bẫy nhiều nhất trong chương:

1. **Thứ tự nhánh**: `if signal_key` được kiểm tra **trước** mọi thứ. Nếu client gửi cả `signal_key` và `combination`, `combination` bị **bỏ qua hoàn toàn**, `side` cũng lấy từ preset.
2. Nhánh preset **KHÔNG validate** `combination` (tin bản seed) và **KHÔNG kiểm tra `is_enabled`** của preset — user vẫn đăng ký được preset đang tắt nếu biết `key`.
3. `name` khi đăng ký preset mặc định là `preset.message_title` (không phải `ta_name`).
4. **Không có giới hạn số rule / user** trong code (không quota, không 429 riêng) và **không chống trùng**: gọi hai lần cùng `signal_key` tạo hai rule độc lập, cả hai đều bắn (khoá dedupe theo `rule_id`). Nếu muốn giới hạn, phải thêm mới và ghi rõ đây là thay đổi hành vi.
5. Quyền sở hữu gắn cứng vào `user_id` từ token — client **không** được phép truyền `user_id`.
6. `combination` lưu vào DB là kết quả `model_dump()`, tức có `join: null` cho mỗi condition; nhánh preset lưu nguyên bản seed (không có `join`).
7. Cột DB: `name` `VARCHAR(120)` NOT NULL, `combination` JSON NOT NULL, `base_signal_key` `VARCHAR(40)` nullable (**không có foreign key** tới `alert_signals`).

---

### PUT /api/v1/alerts/rules/{rule_id}

> **Sửa rule** — đổi tên, đổi tổ hợp điều kiện, hoặc bật/tắt.

| | |
|---|---|
| **Quyền** | Bearer + Premium (chỉ rule của chính mình) |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `user_alert_rules` |
| **Side-effect** | UPDATE `user_alert_rules` (`updated_at` tự cập nhật) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `rule_id` | `string` | UUID hợp lệ | Id rule; phải thuộc user hiện tại |

**Query params** — —

**Request body**

~~~ts
interface UserAlertRuleUpdate {
  name?: string | null;              // <= 120; null/absent ⇒ giữ nguyên
  combination?: CombinationSchema | null;  // null/absent ⇒ giữ nguyên
  is_enabled?: boolean | null;       // null/absent ⇒ giữ nguyên
}
~~~

~~~json
{
  "name": "HPG hồi kỹ thuật",
  "combination": {
    "logic": "OR",
    "conditions": [
      { "indicator": "hammer", "op": "is_true" },
      { "indicator": "bull_engulfing", "op": "is_true" }
    ]
  },
  "is_enabled": false
}
~~~

**Response 200**

~~~ts
type Response = UserAlertRuleResponse;
~~~

~~~json
{
  "id": "3e9a7c12-5f48-4b6d-9a01-7c2e5d8f4b10",
  "name": "HPG hồi kỹ thuật",
  "side": "buy",
  "base_signal_key": "breakout",
  "combination": {
    "logic": "OR",
    "conditions": [
      { "indicator": "hammer", "op": "is_true", "value": null, "join": null },
      { "indicator": "bull_engulfing", "op": "is_true", "value": null, "join": null }
    ]
  },
  "is_enabled": false,
  "created_at": "2026-08-17T02:14:33.518000+00:00",
  "updated_at": "2026-08-17T07:05:42.881000+00:00"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | — | Rule không tồn tại **hoặc** thuộc user khác | `Không tìm thấy cảnh báo` |
| 400 | — | `combination` gửi lên không hợp lệ | thông điệp validator, ví dụ `'is_true' chỉ dùng cho chỉ số nhị phân, không phải 'rsi_14'` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | `rule_id` không phải UUID; `name` quá dài | mảng lỗi Pydantic |

**Fallback / suy giảm** — Không có.

**curl**

~~~bash
curl -sS -X PUT "https://api.iqx.vn/api/v1/alerts/rules/3e9a7c12-5f48-4b6d-9a01-7c2e5d8f4b10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 71c3a5e9-8b02-4d6f-9147-c5e8a2b0d374" \
  -d '{"is_enabled":false}'
~~~

**Ghi chú khi viết lại** — Thứ tự: **tìm rule (scoped theo user) → 404** rồi mới **validate combination → 400**. Đừng đảo, vì đảo sẽ tiết lộ tính hợp lệ của payload cho rule không thuộc user. `side` và `base_signal_key` **không sửa được** qua endpoint này (muốn đổi phía phải xoá và tạo lại). Ba field đều dùng semantics "null = không đổi" ⇒ **không thể** set `name` về rỗng/null bằng API. Tắt rule không xoá event lịch sử đã bắn.

---

### DELETE /api/v1/alerts/rules/{rule_id}

> **Xoá rule** — bỏ hẳn một cảnh báo khỏi tài khoản.

| | |
|---|---|
| **Quyền** | Bearer + Premium (chỉ rule của chính mình) |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `user_alert_rules` |
| **Side-effect** | DELETE `user_alert_rules`; **CASCADE xoá luôn `alert_events` của rule đó** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `rule_id` | `string` | UUID hợp lệ | Id rule cần xoá |

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Trả **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |
| 422 | — | `rule_id` không phải UUID | mảng lỗi Pydantic |

**Fallback / suy giảm** — **Không có 404**: rule không tồn tại hoặc thuộc user khác thì vẫn trả 204 (DELETE có điều kiện `id = ... AND user_id = ...`, số dòng ảnh hưởng bị bỏ qua). Idempotent.

**curl**

~~~bash
curl -sS -X DELETE "https://api.iqx.vn/api/v1/alerts/rules/3e9a7c12-5f48-4b6d-9a01-7c2e5d8f4b10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: c0a4f217-9de5-4b83-a061-3f7c92e5d846"
~~~

**Ghi chú khi viết lại** — Giữ đúng hành vi 204-luôn-luôn (đừng "cải thiện" thành 404, client hiện tại dựa vào đó). `alert_events.rule_id` có `ON DELETE CASCADE` ⇒ xoá rule làm **mất lịch sử** event của rule đó khỏi `/alerts/events`. Nếu muốn giữ lịch sử, phải chuyển sang soft-delete và ghi rõ đây là thay đổi hành vi.

---

## Lịch sử tín hiệu đã bắn

### GET /api/v1/alerts/events

> **Lịch sử cảnh báo** — 50 lần bắn tín hiệu gần nhất của user, kèm trạng thái gửi Telegram.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `alert_events` lọc theo `user_id` |
| **Side-effect** | — |

**Path params** — —

**Query params** — **không có tham số nào.** Giới hạn `limit = 50` **hard-code** trong endpoint; không `page`, không `offset`, không `cursor`, không lọc theo mã/ngày.

**Request body** — —

**Response 200**

~~~ts
type Response = AlertEventResponse[];
~~~

~~~json
[
  {
    "id": "f3b8c7d1-2a49-4e56-8071-9c3d5f2a4b68",
    "symbol": "FPT",
    "signal_key": "breakout",
    "session_date": "2026-08-17",
    "fired_at": "2026-08-17T02:41:07.334000+00:00",
    "price": 118500.0,
    "delivered": true
  },
  {
    "id": "a1c2e3d4-5b6f-4708-9a1b-2c3d4e5f6071",
    "symbol": "VCB",
    "signal_key": null,
    "session_date": "2026-08-17",
    "fired_at": "2026-08-17T02:11:52.907000+00:00",
    "price": 64300.0,
    "delivered": false
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Chưa bắn gì ⇒ `[]`. Đặc biệt: user **chưa liên kết Telegram** thì job quét bỏ qua họ hoàn toàn ⇒ danh sách này **luôn rỗng**, dù rule đang bật và điều kiện thoả. Đây là hành vi hiện tại, không phải bug dữ liệu.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/alerts/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 6e8f0a12-3b4c-4d5e-9f60-718293a4b5c6"
~~~

**Ghi chú khi viết lại** —

- Sắp xếp `fired_at DESC` rồi `LIMIT 50`. Không có tie-breaker; hai event cùng mốc `fired_at` có thứ tự không xác định — nên thêm `id DESC` để ổn định.
- **Chống trùng**: tín hiệu **không** bắn lại mỗi lần quét. UNIQUE `(user_id, rule_id, symbol, session_date)` giới hạn 1 event / rule / mã / ngày phiên. Xem mục "Chống trùng / cooldown" ở phần Nghiệp vụ nền.
- `signal_key` là bản copy của `rule.base_signal_key` **tại thời điểm bắn**; rule tùy chỉnh ⇒ `null`. Không join lại `alert_signals`, nên preset đã bị admin xoá vẫn hiện `signal_key` cũ (orphan).
- `session_date` tính theo **ngày giờ VN (UTC+7)**, còn `fired_at` là **UTC**. Hai giá trị này có thể lệch ngày nhau; đừng derive cái nọ từ cái kia.
- `price` là cột `NUMERIC(18,4)` — serialize ra JSON number. Là giá đóng cửa của bar cuối trong chuỗi OHLCV **đã điều chỉnh**, lấy nguyên trạng từ provider, tầng alert không nhân/chia 1000. Đơn vị chính xác: **CHƯA XÁC ĐỊNH trong chương này — xem `app/services/market_data/sources/vietcap.py` và chương dữ liệu giá/TA.**
- Cột `delivery_error` (VARCHAR(300)) tồn tại trong DB nhưng **không** được trả ra API. Client chỉ thấy `delivered = false`. Giữ nguyên để không phá hợp đồng; nếu cần debug, làm endpoint admin riêng.

---

## Liên kết Telegram (user)

### GET /api/v1/alerts/telegram

> **Trạng thái liên kết Telegram** — cho biết tài khoản đã kết nối bot chưa và username bot để hiển thị.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (cột `users.telegram_chat_id`, `users.telegram_linked_at`) + settings |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = TelegramStatusResponse;
~~~

~~~json
{
  "linked": true,
  "linked_at": "2026-08-17T01:35:20.412000+00:00",
  "bot_username": "iqx_alerts_bot"
}
~~~

Chưa liên kết và bot chưa cấu hình:

~~~json
{ "linked": false, "linked_at": null, "bot_username": null }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — `TELEGRAM_BOT_USERNAME` rỗng ⇒ `bot_username: null` (chuỗi rỗng được chuyển thành `null`, **không** trả `""`). Endpoint không gọi Telegram nên không bao giờ 503.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/alerts/telegram" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9"
~~~

**Ghi chú khi viết lại** — `linked = Boolean(user.telegram_chat_id)`; chuỗi rỗng phải cho `false`. **Không** trả `telegram_chat_id` ra ngoài (là dữ liệu định danh, và cột này `UNIQUE` toàn hệ thống). Endpoint đọc thẳng từ object user do guard nạp, không query thêm.

---

### POST /api/v1/alerts/telegram/link

> **Phát deep-link liên kết** — tạo token một lần và URL `t.me` để user bấm, bot sẽ nhận `/start <token>`.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định (không có limit riêng — xem Ghi chú) |
| **Cache** | Redis key `tg_link:<token>` → `"<user_id>"` (JSON string), **TTL 600s** |
| **Nguồn dữ liệu** | tính toán (`secrets.token_urlsafe(24)`) + settings |
| **Side-effect** | Ghi Redis. Không ghi DB, không gửi tin nhắn |

**Path params** — —

**Query params** — —

**Request body** — Không có body (endpoint POST không nhận payload).

**Response 200**

~~~ts
type Response = TelegramLinkResponse;
~~~

~~~json
{
  "deep_link": "https://t.me/iqx_alerts_bot?start=hK3pQ9vX2mR7tLbN4wZaCe1Y",
  "token": "hK3pQ9vX2mR7tLbN4wZaCe1Y"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 503 | — | `TELEGRAM_BOT_USERNAME` rỗng | `Telegram chưa được cấu hình` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Kiểm tra 503 chỉ dựa trên `TELEGRAM_BOT_USERNAME`, **không** kiểm tra `TELEGRAM_BOT_TOKEN`. Nếu có username mà thiếu token thì API vẫn trả 200 với deep-link "đẹp", nhưng bot không tồn tại/không nhận được update ⇒ liên kết không bao giờ hoàn tất. Nếu **Redis không kết nối được**, `cache_set_json` **im lặng không làm gì** (không raise) ⇒ API vẫn trả 200 kèm token, nhưng `/start <token>` sẽ luôn báo hết hạn.

**curl**

~~~bash
curl -sS -X POST "https://api.iqx.vn/api/v1/alerts/telegram/link" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 4d5e6f70-8192-43a4-b5c6-d7e8f90a1b2c"
~~~

**Ghi chú khi viết lại** —

- **Format token**: `secrets.token_urlsafe(24)` → 24 byte ngẫu nhiên, base64url không padding ⇒ **32 ký tự** thuộc `[A-Za-z0-9_-]`. Trong TS: `crypto.randomBytes(24).toString("base64url")`.
- **Cách xác nhận**: user bấm deep-link → Telegram gửi `/start <token>` tới webhook → `resolve_link_token` đọc key Redis, **xoá ngay** (một lần dùng), map ra `user_id`, set `telegram_chat_id` + `telegram_linked_at = now(UTC)`, commit, rồi bot trả tin xác nhận. Không có bước OTP hay xác nhận trong app.
- Giá trị lưu Redis đi qua `json.dumps` ⇒ trong Redis là `"<uuid>"` **có dấu ngoặc kép**. Khi đọc phải `JSON.parse` rồi mới `String()`. Nếu viết lại bằng cách lưu raw string, phải sửa cả hai đầu cho khớp.
- Key **không** dùng helper `build_cache_key` nên **không có prefix `iqx:`** — đúng nguyên văn `tg_link:<token>`. Đừng tự thêm namespace, sẽ lệch với dữ liệu đang có (dù TTL 10 phút nên rủi ro thấp).
- Xoá token hiện dùng `cache_delete_pattern(key)` (SCAN theo pattern). Token base64url không chứa ký tự glob (`*?[]`) nên an toàn, nhưng bản TS nên dùng `DEL` thẳng — nhanh hơn và không có rủi ro pattern.
- Mint nhiều lần ⇒ nhiều token cùng hiệu lực song song (không thu hồi token cũ). Endpoint chỉ chịu rate-limit IP 60/min ⇒ nên bổ sung limit theo user nếu lo bị spam token.

---

### DELETE /api/v1/alerts/telegram

> **Huỷ liên kết Telegram** — ngắt kết nối bot khỏi tài khoản, dừng nhận cảnh báo.

| | |
|---|---|
| **Quyền** | Bearer + Premium |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `users` |
| **Side-effect** | UPDATE `users` set `telegram_chat_id = NULL`, `telegram_linked_at = NULL` + commit tường minh |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Trả **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải Premium/Admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Idempotent: chưa liên kết vẫn trả 204. **Không** gọi Telegram (không thông báo cho user trong chat, không `deleteWebhook`), nên không phụ thuộc mạng ngoài.

**curl**

~~~bash
curl -sS -X DELETE "https://api.iqx.vn/api/v1/alerts/telegram" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a"
~~~

**Ghi chú khi viết lại** — Sau khi huỷ, các rule vẫn còn và vẫn `is_enabled = true`, nhưng job quét **bỏ qua user không có `telegram_chat_id`** ⇒ không sinh event mới. Lịch sử event cũ **không** bị xoá. Vì `users.telegram_chat_id` là `UNIQUE`, huỷ liên kết là bước bắt buộc trước khi chat Telegram đó có thể gắn sang tài khoản IQX khác.

---

## Webhook Telegram

### POST /api/v1/telegram/webhook/{secret}

> **Webhook bot Telegram** — nhận update từ Telegram Bot API; chỉ `/start <token>` mới thực hiện liên kết tài khoản.

| | |
|---|---|
| **Quyền** | **Công khai** — không Bearer. Bảo vệ bằng path segment `{secret}` == `TELEGRAM_WEBHOOK_SECRET`, cộng header `x-telegram-bot-api-secret-token` khi Telegram gửi kèm |
| **Rate limit** | mặc định 60/minute/IP — **áp dụng cả cho webhook** (xem Ghi chú, đây là rủi ro) |
| **Cache** | Đọc + **xoá** Redis key `tg_link:<token>` |
| **Nguồn dữ liệu** | Body JSON do Telegram gửi + Redis + DB |
| **Side-effect** | UPDATE `users` (`telegram_chat_id`, `telegram_linked_at`); DEL Redis token; gửi tin nhắn trả lời qua `sendMessage` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `secret` | `string` | Phải khớp `TELEGRAM_WEBHOOK_SECRET`, so sánh hằng-thời-gian | Segment bí mật; sai ⇒ no-op nhưng vẫn 200 |

**Query params** — —

**Request body** — Telegram Update. Chỉ các field dưới đây được code đọc (mọi field khác bị bỏ qua; `setWebhook` đăng ký `allowed_updates: ["message"]`):

~~~ts
interface TelegramUpdate {
  update_id?: number;
  message?: {
    chat?: { id?: number | string };   // dùng làm telegram_chat_id (ép sang string)
    text?: string;                     // được trim; rỗng ⇒ bỏ qua update
    // các field khác (from, date, entities...) không được dùng
  };
  // callback_query, edited_message, channel_post... KHÔNG được xử lý
}
~~~

Header nhận: `x-telegram-bot-api-secret-token` (`string | null`, optional).

~~~json
{
  "update_id": 874512309,
  "message": {
    "message_id": 42,
    "from": { "id": 987654321, "first_name": "Nguyễn Văn Bình" },
    "chat": { "id": 987654321, "type": "private" },
    "date": 1786742400,
    "text": "/start hK3pQ9vX2mR7tLbN4wZaCe1Y"
  }
}
~~~

**Response 200**

~~~ts
interface Response { ok: true }
~~~

~~~json
{ "ok": true }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 200 | — | Secret path sai / `TELEGRAM_WEBHOOK_SECRET` chưa cấu hình | `{"ok": true}` — **không** báo lỗi, không xử lý gì (chống dò secret) |
| 200 | — | Header `x-telegram-bot-api-secret-token` **có mặt** nhưng sai | `{"ok": true}` — no-op |
| 200 | — | Body không parse được thành JSON, hoặc JSON không phải object | `{"ok": true}` — no-op |
| 200 | — | Update không có `message.chat.id` hoặc `text` rỗng | `{"ok": true}` — no-op |
| 429 | — | Vượt 60 request/phút từ IP Telegram | body của slowapi (`Rate limit exceeded...`) |
| 500 | — | Chat Telegram này đã gắn user khác ⇒ vi phạm UNIQUE `users.telegram_chat_id` khi commit | body 500 mặc định — **lỗi đã biết**, xem Ghi chú |
| 422 | — | Không xảy ra trên thực tế (`{secret}` là string tự do) | — |

**Lệnh bot được hỗ trợ** (`app/services/telegram/linking.py`, xử lý theo đúng thứ tự này):

| Text nhận được | Hành vi | Tin nhắn trả lời (nguyên văn) |
|---|---|---|
| Không bắt đầu bằng `/start` | Không làm gì với DB | `IQX Alerts đang hoạt động. Quản lý cảnh báo trong ứng dụng IQX.` |
| `/start` (không token) | Không làm gì với DB | `Chào mừng đến IQX Alerts. Mở liên kết kết nối từ ứng dụng IQX để bắt đầu.` |
| `/start <token>` — token sai/hết hạn/đã dùng | Không làm gì với DB | `Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng thử lại từ ứng dụng IQX.` |
| `/start <token>` — token hợp lệ nhưng user đã bị xoá | Token **đã bị tiêu thụ** | `Không tìm thấy tài khoản tương ứng.` |
| `/start <token>` — hợp lệ | Set `telegram_chat_id` + `telegram_linked_at = now(UTC)`, commit | `✅ Đã kết nối IQX Alerts. Bạn sẽ nhận tín hiệu theo watchlist của mình.` |

**Fallback / suy giảm** — Endpoint **luôn** trả `200 {"ok": true}` trên mọi nhánh kiểm tra (secret sai, JSON hỏng, update không hiểu) để Telegram không retry và để không rò rỉ thông tin. Việc gửi tin trả lời được bọc trong `_safe_send`: `sendMessage` lỗi (bot chưa cấu hình token, user block bot, Telegram 5xx) chỉ log warning `Telegram reply failed: ...` — **liên kết vẫn đã được lưu thành công**.

**curl**

~~~bash
curl -sS -X POST "https://api.iqx.vn/api/v1/telegram/webhook/$TELEGRAM_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" \
  -H "X-Request-ID: e1f2a3b4-c5d6-4708-9a1b-2c3d4e5f6071" \
  -d '{"update_id":874512309,"message":{"chat":{"id":987654321,"type":"private"},"text":"/start hK3pQ9vX2mR7tLbN4wZaCe1Y"}}'
~~~

**Ghi chú khi viết lại** — Đây là endpoint dễ viết sai nhất:

1. **Thứ tự kiểm tra bắt buộc**: (a) `TELEGRAM_WEBHOOK_SECRET` phải khác rỗng — chưa cấu hình thì **mọi** request là no-op; (b) so sánh `secret` path bằng hàm hằng-thời-gian; (c) **chỉ khi** header `x-telegram-bot-api-secret-token` có mặt mới so sánh nó — header vắng **không** bị chặn; (d) parse JSON; (e) xử lý update.
2. So sánh hằng-thời-gian: bản Python dùng `hmac.compare_digest` trên **str**, hàm này **raise TypeError với ký tự non-ASCII** ⇒ request tới path chứa ký tự non-ASCII (sau khi URL-decode) sẽ thành **500**, không phải 200. Bản TS nên: kiểm tra độ dài + ASCII trước, rồi `crypto.timingSafeEqual(Buffer, Buffer)`, và luôn trả 200.
3. **RỦI RO BẢO MẬT phải xử lý**: secret nằm trong URL ⇒ bị ghi vào access log của reverse proxy/CDN, vào metrics theo path, vào error tracker. Coi secret này như đã lộ một phần. Khuyến nghị khi viết lại: giữ path segment cho tương thích nhưng **bắt buộc** header `x-telegram-bot-api-secret-token` (khác secret path, biến riêng), và loại path này khỏi access log.
4. `chat.id` là **số** trong payload Telegram nhưng cột DB là `VARCHAR(32)` ⇒ phải `String(id)`. Đừng để JS number precision làm sai id lớn; đọc thẳng từ JSON dạng string nếu runtime hỗ trợ.
5. `users.telegram_chat_id` là **UNIQUE**. Handler hiện tại commit **không** bắt `IntegrityError` ⇒ chat đã gắn tài khoản A mà `/start` bằng token của tài khoản B sẽ ném lỗi ra ngoài → **500**, Telegram sẽ retry. Bản TS **nên** bắt lỗi unique và trả lời user bằng tiếng Việt (ví dụ: yêu cầu huỷ liên kết ở tài khoản cũ trước), đồng thời vẫn trả `{"ok": true}`. Ghi rõ trong changelog vì đây là sửa hành vi.
6. Token bị **tiêu thụ trước** khi tìm user (`resolve_link_token` xoá key rồi mới `db.get(User, ...)`) ⇒ nhánh "không tìm thấy tài khoản" làm token mất hiệu lực, user phải mint lại. Giữ nguyên thứ tự này để không tạo lỗ hổng dùng lại token.
7. `text` được `.strip()` rồi `split(maxsplit=1)`; token là phần còn lại đã `.strip()`. Deep-link Telegram chỉ cho phép `[A-Za-z0-9_-]` trong `start=` — trùng khớp với alphabet base64url của token.
8. Không có xác thực `update_id` (không chống replay ở tầng này); token một-lần trong Redis chính là cơ chế chống replay.
9. `setWebhook` được gọi **lúc startup**, không có endpoint API nào để gọi lại — muốn đăng ký lại phải restart hoặc gọi Telegram thủ công. Xem mục "Đăng ký webhook lúc startup".

---

## Quản trị tín hiệu (Admin)

### GET /api/v1/admin/alerts/signals

> **Liệt kê preset (admin)** — trả toàn bộ preset kể cả đang tắt, để quản trị.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `alert_signals` |
| **Side-effect** | — |

**Path params** — —

**Query params** — không có.

**Request body** — —

**Response 200**

~~~ts
type Response = AlertSignalResponse[];
~~~

~~~json
[
  {
    "key": "pullback",
    "side": "buy",
    "ta_name": "Pullback",
    "message_title": "Mua khi giá điều chỉnh nhẹ",
    "combination": {
      "logic": "AND",
      "conditions": [
        { "indicator": "uptrend", "op": "is_true", "value": null },
        { "indicator": "dist_ma_20", "op": "<", "value": -0.03 },
        { "indicator": "rsi_14", "op": "<", "value": 45 }
      ]
    },
    "is_enabled": true,
    "sort_order": 0
  },
  {
    "key": "trend_break",
    "side": "sell",
    "ta_name": "Trend Break",
    "message_title": "Bán khi gãy xu hướng",
    "combination": {
      "logic": "OR",
      "conditions": [
        { "indicator": "death_cross", "op": "is_true", "value": null },
        { "indicator": "macd_bear_cross", "op": "is_true", "value": null }
      ]
    },
    "is_enabled": false,
    "sort_order": 9
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — Chưa seed ⇒ `[]`.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/admin/alerts/signals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 3a4b5c6d-7e8f-4091-a2b3-c4d5e6f70819"
~~~

**Ghi chú khi viết lại** — **Khác biệt duy nhất so với `GET /alerts/signals`**: quyền (Admin vs Premium) và bộ lọc (`enabled_only = false` vs `true`). **Shape response giống hệt nhau** (`AlertSignalResponse`) — dùng lại một serializer, đừng viết hai kiểu. Sắp xếp `sort_order ASC`, không tie-breaker.

---

### POST /api/v1/admin/alerts/signals

> **Tạo preset mới** — thêm một tín hiệu toàn cục ngoài 10 mặc định.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `alert_signals` |
| **Side-effect** | INSERT `alert_signals` + INSERT `admin_audit_logs` (action `alert.signal_create`) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface AlertSignalAdminCreate {
  key: string;                  // 1..40 ký tự, pattern ^[a-z0-9_]+$
  side: "buy" | "sell";
  ta_name: string;              // 1..60
  message_title: string;        // 1..200
  combination: CombinationSchema;
  is_enabled?: boolean;         // default true
  sort_order?: number;          // integer, default 0
}
~~~

~~~json
{
  "key": "vol_dry_up",
  "side": "buy",
  "ta_name": "Volume Dry-up",
  "message_title": "Mua khi cạn cung sau điều chỉnh",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "uptrend", "op": "is_true" },
      { "indicator": "vol_zscore", "op": "<", "value": -0.8 },
      { "indicator": "close", "op": ">", "value": "ma_50" }
    ]
  },
  "is_enabled": true,
  "sort_order": 10
}
~~~

**Response 201**

~~~ts
type Response = AlertSignalResponse;
~~~

~~~json
{
  "key": "vol_dry_up",
  "side": "buy",
  "ta_name": "Volume Dry-up",
  "message_title": "Mua khi cạn cung sau điều chỉnh",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "uptrend", "op": "is_true", "value": null, "join": null },
      { "indicator": "vol_zscore", "op": "<", "value": -0.8, "join": null },
      { "indicator": "close", "op": ">", "value": "ma_50", "join": null }
    ]
  },
  "is_enabled": true,
  "sort_order": 10
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 409 | — | `key` đã tồn tại | `Tín hiệu đã tồn tại` |
| 400 | — | `combination` không hợp lệ | thông điệp validator, ví dụ `Toán tử không hợp lệ: 'gt'` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `key` sai pattern/độ dài, `side` ngoài `buy/sell`, `ta_name`/`message_title` rỗng hoặc quá dài, thiếu `combination` | mảng lỗi Pydantic |

**Fallback / suy giảm** — Không có.

**curl**

~~~bash
curl -sS -X POST "https://api.iqx.vn/api/v1/admin/alerts/signals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 7c8d9e0f-1a2b-43c4-95d6-e7f8091a2b3c" \
  -d '{"key":"vol_dry_up","side":"buy","ta_name":"Volume Dry-up","message_title":"Mua khi cạn cung sau điều chỉnh","combination":{"logic":"AND","conditions":[{"indicator":"uptrend","op":"is_true"},{"indicator":"vol_zscore","op":"<","value":-0.8}]},"is_enabled":true,"sort_order":10}'
~~~

**Ghi chú khi viết lại** — Thứ tự: **kiểm tra trùng `key` → 409** rồi mới **validate `combination` → 400** (payload trùng key và sai combination trả 409, không phải 400). Audit log ghi `target_entity = "alert_signal"`, `target_id = null`, `payload_after = {key, combination}`, `note = "alert.signal_create <key>"`. Commit tường minh sau khi ghi audit. `sort_order` **không** unique và **không** tự tăng — admin phải tự quản; trùng `sort_order` ⇒ thứ tự hiển thị không xác định. `key` được ghi bằng `pattern` nên chữ hoa/dấu gạch ngang bị 422, **không** tự lowercase.

---

### PUT /api/v1/admin/alerts/signals/{key}

> **Sửa preset** — ghi đè toàn bộ (không phải patch) một tín hiệu toàn cục.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `alert_signals` |
| **Side-effect** | UPDATE `alert_signals` + INSERT `admin_audit_logs` (action `alert.signal_update`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `key` | `string` | Chuỗi tự do (không validate pattern ở path) | `key` của preset cần sửa |

**Query params** — —

**Request body**

~~~ts
interface AlertSignalAdminUpsert {
  side: "buy" | "sell";         // BẮT BUỘC
  ta_name: string;              // BẮT BUỘC, 1..60
  message_title: string;        // BẮT BUỘC, 1..200
  combination: CombinationSchema;  // BẮT BUỘC
  is_enabled?: boolean;         // default true — BỎ TRỐNG SẼ BẬT LẠI
  sort_order?: number;          // default 0 — BỎ TRỐNG SẼ VỀ 0
}
~~~

~~~json
{
  "side": "buy",
  "ta_name": "Pullback",
  "message_title": "Mua khi giá điều chỉnh về MA20",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "uptrend", "op": "is_true" },
      { "indicator": "dist_ma_20", "op": "<", "value": -0.02 },
      { "indicator": "rsi_14", "op": "<", "value": 40 }
    ]
  },
  "is_enabled": true,
  "sort_order": 0
}
~~~

**Response 200**

~~~ts
type Response = AlertSignalResponse;
~~~

~~~json
{
  "key": "pullback",
  "side": "buy",
  "ta_name": "Pullback",
  "message_title": "Mua khi giá điều chỉnh về MA20",
  "combination": {
    "logic": "AND",
    "conditions": [
      { "indicator": "uptrend", "op": "is_true", "value": null, "join": null },
      { "indicator": "dist_ma_20", "op": "<", "value": -0.02, "join": null },
      { "indicator": "rsi_14", "op": "<", "value": 40, "join": null }
    ]
  },
  "is_enabled": true,
  "sort_order": 0
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | — | Không có preset với `key` này | `Không tìm thấy tín hiệu` |
| 400 | — | `combination` không hợp lệ | thông điệp validator, ví dụ `Tổ hợp phải có ít nhất 1 điều kiện` |
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | Thiếu bất kỳ field bắt buộc, hoặc sai kiểu | mảng lỗi Pydantic |

**Fallback / suy giảm** — Không có. **Không** upsert: `key` không tồn tại là 404 chứ không tạo mới (dù schema tên là `Upsert`).

**curl**

~~~bash
curl -sS -X PUT "https://api.iqx.vn/api/v1/admin/alerts/signals/pullback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: b2c3d4e5-f607-4819-a2b3-c4d5e6f70819" \
  -d '{"side":"buy","ta_name":"Pullback","message_title":"Mua khi giá điều chỉnh về MA20","combination":{"logic":"AND","conditions":[{"indicator":"uptrend","op":"is_true"},{"indicator":"rsi_14","op":"<","value":40}]},"is_enabled":true,"sort_order":0}'
~~~

**Ghi chú khi viết lại** — Thứ tự: **404 trước, 400 (validate) sau**. Đây là **PUT toàn phần**: bỏ `is_enabled` khỏi payload ⇒ ngầm set `true`; bỏ `sort_order` ⇒ ngầm set `0` (đẩy preset lên đầu danh sách). UI admin phải luôn gửi đủ 6 field. `key` **không đổi được** qua endpoint này. Sửa preset **không** lan sang các `user_alert_rules` đã copy trước đó. Audit `payload_after = {key, combination, is_enabled}` (không ghi `ta_name`/`message_title` cũ hay mới ⇒ audit không đủ để rollback — biết trước và giữ nguyên, hoặc mở rộng có chủ ý).

---

### DELETE /api/v1/admin/alerts/signals/{key}

> **Xoá preset** — bỏ một tín hiệu toàn cục khỏi danh mục.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `alert_signals` |
| **Side-effect** | DELETE `alert_signals`; INSERT `admin_audit_logs` (`alert.signal_delete`) **chỉ khi thực sự xoá được dòng** |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `key` | `string` | Chuỗi tự do | `key` của preset cần xoá |

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Trả **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — **Không có 404**: `key` không tồn tại vẫn trả 204 và **không** ghi audit log. Idempotent.

**curl**

~~~bash
curl -sS -X DELETE "https://api.iqx.vn/api/v1/admin/alerts/signals/vol_dry_up" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: d5e6f708-192a-4b3c-8d4e-5f60718293a4"
~~~

**Ghi chú khi viết lại** — Hai bẫy:

1. `alert_signals.key` **không** có foreign key tới `user_alert_rules.base_signal_key`. Xoá preset ⇒ các rule đã đăng ký **vẫn sống, vẫn bắn** (đã copy `combination`), nhưng `base_signal_key` trở thành orphan và `/alerts/events` vẫn trả `signal_key` cũ. Đừng "sửa" bằng cách cascade xoá rule của user — sẽ mất dữ liệu người dùng.
2. Xoá xong nên chạy lại `POST /admin/alerts/seed`: preset thuộc 10 mặc định sẽ được **tạo lại** (vì seeder chỉ tạo khi thiếu). Nếu ý định là "ẩn vĩnh viễn", dùng `is_enabled = false` qua PUT thay vì DELETE.

---

### POST /api/v1/admin/alerts/seed

> **Seed lại tín hiệu mặc định** — đảm bảo 10 preset chuẩn tồn tại; tuỳ chọn reset về giá trị gốc.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | Hằng số `SIGNAL_DEFS` trong code (không phải DB, không phải provider) |
| **Side-effect** | INSERT các preset còn thiếu; nếu `overwrite=true` thì UPDATE các preset đã có. **KHÔNG ghi audit log** |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `overwrite` | `boolean` | Không | `false` | `true`/`false` (parse kiểu bool của FastAPI) | `true` ⇒ reset preset đã tồn tại về định nghĩa gốc |

**Request body** — —

**Response 200**

~~~ts
interface SeedResponse {
  created: number;      // số preset MỚI được tạo trong lần gọi này
  overwrite: boolean;   // echo lại tham số
}
~~~

~~~json
{ "created": 0, "overwrite": true }
~~~

Lần seed đầu tiên trên DB trắng:

~~~json
{ "created": 10, "overwrite": false }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |
| 422 | — | `overwrite` không parse được thành bool | mảng lỗi Pydantic |

**Fallback / suy giảm** — Không phụ thuộc dịch vụ ngoài. Chạy đồng thời từ nhiều worker có thể va UNIQUE `key`; endpoint này **không** bọc try/except (khác với đường startup vốn chỉ log warning) ⇒ va chạm sẽ thành 500. Xác suất thấp vì admin gọi tay.

**Ghi đè tín hiệu đã sửa tay?**

| Chế độ | Preset còn thiếu | Preset đã tồn tại (admin đã sửa) |
|---|---|---|
| `overwrite=false` (default) | Tạo mới, `is_enabled=true`, `sort_order` = chỉ số 0..9 | **Không đụng tới** — giữ nguyên toàn bộ chỉnh sửa của admin |
| `overwrite=true` | Tạo mới như trên | **Ghi đè** `side`, `ta_name`, `message_title`, `combination`, `sort_order` về gốc. **KHÔNG** ghi đè `is_enabled` — preset đang tắt vẫn tắt |

**Idempotent?** Có. Gọi lại `overwrite=false` trả `created: 0` và không đổi gì (test `test_seeder_idempotent`: lần 1 → 10, lần 2 → 0). `overwrite=true` cũng idempotent theo trạng thái cuối, nhưng ghi vào `updated_at` mỗi lần.

**curl**

~~~bash
curl -sS -X POST "https://api.iqx.vn/api/v1/admin/alerts/seed?overwrite=false" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: f7081920-3a4b-4c5d-8e6f-708192a3b4c5" \
  -d ''
~~~

**Ghi chú khi viết lại** —

- `created` **chỉ** đếm bản ghi mới; với `overwrite=true` mà 10 preset đã có, response là `{"created": 0, "overwrite": true}` dù đã sửa 10 dòng. Đừng dùng `created` để báo "đã cập nhật N".
- `sort_order` được **gán lại theo chỉ số trong `SIGNAL_DEFS`** (0..9) ở cả hai nhánh tạo và overwrite ⇒ `overwrite=true` sẽ **xoá sạch thứ tự admin tự sắp**.
- Cùng một hàm `seed_alert_signals` chạy lúc startup với `overwrite=false`, nên preset thiếu sẽ tự mọc lại sau mỗi lần deploy.
- `POST` nhưng không có body; giữ vậy để tương thích client. Trong TS, đừng đặt validator body bắt buộc.
- Không ghi audit log (khác 3 endpoint CRUD preset). Nếu muốn ghi, đó là bổ sung có chủ ý — ghi vào changelog.

---

### GET /api/v1/admin/alerts/indicators

> **Danh mục chỉ báo TA** — 38 chỉ báo dùng được khi soạn tổ hợp điều kiện, kèm nhãn tiếng Việt.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định |
| **Cache** | không (dựng từ hằng số trong code mỗi request) |
| **Nguồn dữ liệu** | tính toán — `INDICATOR_DISPLAY` + `INDICATOR_KIND` trong `app/services/ta/display_names.py` |
| **Side-effect** | — |

**Path params** — —

**Query params** — không có.

**Request body** — —

**Response 200**

~~~ts
interface IndicatorOption {
  id: string;                  // id chỉ báo dùng làm `indicator` trong condition
  label: string;               // nhãn tiếng Việt để hiển thị
  kind: "num" | "signal";      // "signal" = nhị phân, dùng được với is_true
}
type Response = IndicatorOption[];
~~~

~~~json
[
  { "id": "ma_5", "label": "MA5", "kind": "num" },
  { "id": "ma_20", "label": "MA20", "kind": "num" },
  { "id": "ma_stack_bull", "label": "MA5 > MA20 > MA50 > MA200", "kind": "signal" },
  { "id": "uptrend", "label": "MA50 > MA200", "kind": "signal" },
  { "id": "rsi_14", "label": "RSI 14", "kind": "num" },
  { "id": "macd_hist", "label": "Histogram MACD", "kind": "num" },
  { "id": "vol_zscore", "label": "Độ bất thường khối lượng", "kind": "num" },
  { "id": "breakout_20d", "label": "Phá đỉnh 20 phiên", "kind": "signal" },
  { "id": "shooting_star", "label": "Nến sao băng", "kind": "signal" }
]
~~~

(Ví dụ rút gọn; response thật có **đúng 38** phần tử — danh sách đầy đủ ở mục "38 chỉ báo dùng được" phần Nghiệp vụ nền.)

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu/sai Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Không phải admin | `Yêu cầu quyền quản trị viên` |

**Fallback / suy giảm** — Không có nhánh suy giảm: không chạm DB, không chạm Redis, không gọi provider. Luôn trả đủ 38 phần tử.

**curl**

~~~bash
curl -sS -X GET "https://api.iqx.vn/api/v1/admin/alerts/indicators" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: 1a2b3c4d-5e6f-4708-9192-a3b4c5d6e7f8"
~~~

**Ghi chú khi viết lại** —

- Thứ tự = **thứ tự khai báo trong `INDICATOR_DISPLAY`** (map giữ thứ tự chèn), **không** sort alphabet. Test `test_admin_alert_indicators.py` chỉ chốt `len == 38` và có phần tử `{"id":"rsi_14","label":"RSI 14","kind":"num"}`; nhưng UI admin dựa vào thứ tự nhóm (MA → xu hướng → momentum → biến động → khối lượng → đỉnh/đáy → nến) nên hãy giữ nguyên mảng có thứ tự, đừng dùng object/Map không đảm bảo thứ tự.
- Danh sách này **thiếu** 5 raw field `close`/`open`/`high`/`low`/`volume` dù validator cho phép dùng chúng làm `indicator` hoặc làm `value` (so sánh trường-với-trường). UI admin vì vậy không tự chọn được `close > ma_200` — biết trước, không phải bug cần tự sửa.
- `kind` ở đây là `"num" | "signal"`. Catalog của backtester (`app/services/ta/catalog.py`) dùng bộ giá trị **khác**: `"num" | "bin"`. Đừng dùng chung type; xem chương backtester.
- Endpoint này không có bản dành cho user Premium — UI người dùng chỉ đăng ký preset, không tự soạn chỉ báo qua danh mục này.

---

## Ghi chú tổng hợp khi viết lại

1. **Ba tầng quyền, đừng lẫn**: `/alerts/*` = Premium (admin pass tự động, không cần subscription); `/admin/alerts/*` = Admin; `/telegram/webhook/{secret}` = công khai. Test `test_alerts_require_premium` chốt: user thường (đã đăng nhập, active, không premium) gọi `/alerts/signals` phải nhận **403**, không phải 401.
2. **Hai envelope lỗi khác nhau**: lỗi guard có `code`, lỗi nghiệp vụ alert (`HTTPException` thô) **không có `code`**. Nếu chuẩn hoá về một dạng, đó là breaking change cho frontend — ghi vào changelog.
3. **Transaction**: repository chỉ `flush()`, commit do dependency `get_db` thực hiện sau khi handler trả về (rollback nếu có exception). Trong NestJS/TypeORM/Prisma, hãy dùng một interceptor/transaction-per-request tương đương, đừng commit rải rác — nếu không, `POST/PUT/DELETE rules` sẽ không persist đúng như bản Python.
4. **Chống trùng là hợp đồng dữ liệu, không phải logic ứng dụng**: bắt buộc tạo UNIQUE `(user_id, rule_id, symbol, session_date)` trên `alert_events`. Insert-trước-gửi-sau + bắt lỗi unique là mẫu chuẩn để an toàn với nhiều worker.
5. **Chỉ user liên kết Telegram mới được quét.** Đây là ràng buộc ẩn quan trọng nhất của job: rule bật + điều kiện thoả nhưng chưa link Telegram ⇒ không có event, không có gì trong `/alerts/events`. UI cần nói rõ điều này cho user.
6. **Phạm vi quét = watchlist**, không phải toàn sàn, không phải danh sách mã trong rule (rule v1 không có field mã).
7. **Cổng giờ giao dịch không có lịch nghỉ lễ.** VN có nhiều ngày nghỉ; job vẫn chạy và vẫn fetch provider. Nếu thêm lịch lễ, đó là cải tiến có chủ ý — xem chương 09.
8. **Đơn vị**: `dist_ma_*`, `roc_20d`, `dist_52w_*` là tỷ lệ thập phân (0.05 = 5%). `rsi_14` thang 0–100. `vol_zscore` z-score. `price` trong event là giá đóng cửa điều chỉnh nguyên trạng từ provider.
9. **Sắp xếp**: `/alerts/signals` và `/admin/alerts/signals` = `sort_order ASC`; `/alerts/rules` = `created_at ASC`; `/alerts/events` = `fired_at DESC LIMIT 50`. Không endpoint nào có tie-breaker — nên thêm khoá phụ để test không flaky.
10. **HTML injection trong message Telegram**: `_format_message` nhúng `rule.name` (do user tự đặt) vào `<b>...</b>` với `parse_mode: "HTML"` mà **không escape**. Tên rule chứa `<` hoặc `&` sẽ làm Telegram trả lỗi parse entities ⇒ `delivered = false` + `delivery_error`. Bản TS **phải escape** `&`, `<`, `>` trong `rule.name` và `symbol`.
11. **Lỗi gửi Telegram không có retry**: user block bot / bot bị xoá / Telegram 5xx ⇒ event vẫn tồn tại với `delivered = false`, `delivery_error` bị cắt còn 300 ký tự, và **không bao giờ gửi lại** (ngày sau cùng rule cùng mã cũng bị dedupe). Nếu cần retry, phải thiết kế mới.
12. **Secret trong URL webhook** bị ghi vào access log — coi như đã lộ một phần; ưu tiên header `x-telegram-bot-api-secret-token` và loại path webhook khỏi log.
13. **Webhook luôn trả `200 {"ok": true}`** ở mọi nhánh kiểm tra, kể cả secret sai. Ngoại lệ duy nhất hiện tại là 500 do vi phạm UNIQUE `telegram_chat_id` — nên bắt và trả lời user, vẫn giữ 200.
14. **Không có endpoint nào trigger job quét thủ công.** `run_alert_scan(force=True)` chỉ gọi được từ code/test. Nếu cần nút "quét ngay" cho admin, đó là endpoint mới — không có trong 16 endpoint này.
15. **Không có giới hạn số rule/user và không chống trùng rule.** Nếu sản phẩm muốn giới hạn (ví dụ 20 rule/user), thêm mới và ghi rõ; đừng ngầm thay đổi.
16. Cột `users.telegram_chat_id` là `VARCHAR(32)` **UNIQUE, indexed**, nullable; `users.telegram_linked_at` là `TIMESTAMPTZ` nullable. Một chat Telegram chỉ gắn được một tài khoản IQX tại một thời điểm.
