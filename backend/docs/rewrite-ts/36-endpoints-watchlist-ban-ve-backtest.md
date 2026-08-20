# Endpoint — Danh mục theo dõi, bản vẽ biểu đồ, Backtest

Chương này đặc tả 14 endpoint thuộc ba nhóm: **Danh mục theo dõi** (`/watchlist`, 5 endpoint), **Bản vẽ biểu đồ** (`/chart-drawings`, 3 endpoint) và **Backtest** (`/backtest`, 6 endpoint). Hai nhóm đầu là CRUD thuần trên Postgres, không gọi provider ngoài. Nhóm Backtest là phần nặng nhất: nó chứa toàn bộ engine kỹ thuật (38 chỉ báo TA tính bằng numpy, engine mô phỏng walk-forward, KPI) và là nhóm duy nhất bị chặn quyền **Premium**.

Mọi path dưới đây có prefix chung `/api/v1`. Trong các lệnh curl, `$BASE` = `http://localhost:8000` khi chạy local — thay bằng host production khi cần; chỉ cần thay `$TOKEN` bằng access token thật.

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích | Cache |
|---|---|---|---|---|---|
| 1 | GET | `/api/v1/watchlist` | Bearer | Lấy toàn bộ danh mục theo dõi | không |
| 2 | POST | `/api/v1/watchlist` | Bearer | Thêm một mã cổ phiếu vào danh mục | không |
| 3 | DELETE | `/api/v1/watchlist/{symbol}` | Bearer | Xóa một mã khỏi danh mục | không |
| 4 | PUT | `/api/v1/watchlist/reorder` | Bearer | Sắp xếp lại thứ tự danh mục | không |
| 5 | GET | `/api/v1/watchlist/check/{symbol}` | Bearer | Kiểm tra một mã có trong danh mục | không |
| 6 | GET | `/api/v1/chart-drawings/{symbol}` | Bearer | Lấy bản vẽ TradingView đã lưu | không |
| 7 | PUT | `/api/v1/chart-drawings/{symbol}` | Bearer | Lưu (ghi đè) bản vẽ TradingView | không |
| 8 | DELETE | `/api/v1/chart-drawings/{symbol}` | Bearer | Xóa bản vẽ đã lưu | không |
| 9 | GET | `/api/v1/backtest/catalog` | Bearer + Premium | Thư viện 38 factor + mẫu + preset rủi ro | không |
| 10 | POST | `/api/v1/backtest/run` | Bearer + Premium | Chạy backtest, trả KPI + equity curve + giao dịch | Redis 600s |
| 11 | GET | `/api/v1/backtest/strategies` | Bearer + Premium | Liệt kê chiến lược đã lưu của user | không |
| 12 | POST | `/api/v1/backtest/strategies` | Bearer + Premium | Tạo chiến lược mới | không |
| 13 | PUT | `/api/v1/backtest/strategies/{strategy_id}` | Bearer + Premium | Cập nhật chiến lược (partial) | không |
| 14 | DELETE | `/api/v1/backtest/strategies/{strategy_id}` | Bearer + Premium | Xóa chiến lược | không |

**Rate limit** cho cả 14 endpoint: mặc định toàn cục **60 request/phút/IP** (`RATE_LIMIT_DEFAULT = "60/minute"`, slowapi, key theo remote address, storage `memory://`). Không endpoint nào trong nhóm này có limit riêng. Rate limit bị **tắt** khi `APP_ENV ∈ {"testing", "test"}`.

---

## Kiểu dữ liệu dùng chung

#### Hình dạng lỗi — có HAI dạng khác nhau, đừng gộp

Backend gốc có hai đường sinh lỗi và **body trả về khác nhau**:

~~~ts
/** Dạng A — từ AppException (watchlist, chart-drawings, guard auth/premium). */
interface AppErrorBody {
  detail: string;
  code:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "UNPROCESSABLE_ENTITY"
    | "SERVICE_UNAVAILABLE";
}

/** Dạng B — từ HTTPException thuần (TẤT CẢ lỗi của /backtest/*). KHÔNG có `code`. */
interface PlainErrorBody {
  detail: string;
}

/** Dạng C — lỗi validation của Pydantic (422). */
interface ValidationErrorBody {
  detail: Array<{
    loc: Array<string | number>;
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}
~~~

Endpoint `/backtest/*` dùng `HTTPException` trực tiếp nên **không** đi qua handler của `AppException`; body chỉ có `{"detail": "..."}`. Endpoint `/watchlist/*` dùng `BadRequestError`/`ConflictError`/`NotFoundError` nên body có thêm `code`. Guard xác thực (401/403) luôn thuộc dạng A.

#### Watchlist

~~~ts
interface WatchlistItemResponse {
  id: string;          // UUID
  symbol: string;      // luôn UPPERCASE
  sort_order: number;  // integer, bắt đầu từ 0
  created_at: string;  // ISO-8601 datetime
}

interface WatchlistResponse {
  items: WatchlistItemResponse[];
  count: number;       // = items.length, KHÔNG phải tổng số bản ghi phân trang
}

interface WatchlistAddRequest {
  symbol: string;      // minLength 1, maxLength 20
}

interface WatchlistReorderRequest {
  symbols: string[];   // mảng MÃ theo thứ tự mới — KHÔNG phải mảng {symbol, order}
}

interface WatchlistCheckResponse {
  symbol: string;      // UPPERCASE của path param
  is_watched: boolean;
}
~~~

#### Chart drawings

~~~ts
/** Payload lưu bản vẽ. `state` là object JSON tùy ý, KHÔNG được null/mảng. */
interface ChartDrawingUpsert {
  state: Record<string, unknown>;
}

interface ChartDrawingResponse {
  symbol: string;                          // luôn UPPERCASE
  state: Record<string, unknown> | null;   // null khi chưa có bản vẽ
  updated_at: string | null;               // ISO-8601; null khi chưa có bản vẽ
}
~~~

#### Backtest

~~~ts
type Logic = "AND" | "OR";
type StopLossMode = "none" | "atr" | "fixed";
type PositionSizeMode = "all" | "half" | "quarter" | "tenth" | "fixed";
type FeePreset = "standard" | "low" | "none";

interface FactorSelection {
  id: string;            // phải là một trong 38 factor id của catalog
  value?: number | null; // ngưỡng người dùng chỉnh; bị BỎ QUA nếu factor.editable === false
}

interface StrategySide {
  logic?: Logic;                // default "AND"
  factors?: FactorSelection[];  // default []
}

interface RiskInput {
  stop_loss?: StopLossMode;            // default "atr"
  stop_atr_mult?: number;              // default 2.0
  stop_fixed_pct?: number;             // default 0.05 (tức 5%, dạng phân số)
  take_profit_pct?: number | null;     // default null = không chốt lời theo %
  max_holding?: number | null;         // default 60 (số phiên); null = không giới hạn
  position_size?: PositionSizeMode;    // default "all"
  position_fixed_amount?: number;      // default 10_000_000 (VND)
  fee?: FeePreset;                     // default "standard"
}

interface BacktestRunRequest {
  symbol: string;        // strip + upper; "" -> 422
  start: string;         // "YYYY-MM-DD" (chỉ 10 ký tự đầu được giữ)
  end: string;           // "YYYY-MM-DD"
  capital?: number;      // default 100_000_000 VND; phải > 0
  buy: StrategySide;     // BẮT BUỘC và phải có >= 1 factor
  sell?: StrategySide;   // default {logic:"AND", factors:[]} = không có tín hiệu bán
  risk?: RiskInput;      // default toàn bộ giá trị default ở trên
}

interface BacktestStrategyCreate {
  name: string;                      // minLength 1, maxLength 120
  symbol?: string | null;            // upper hóa nếu truthy
  config: Record<string, unknown>;   // object TỰ DO, backend KHÔNG validate
}

interface BacktestStrategyUpdate {
  name?: string | null;                     // maxLength 120
  symbol?: string | null;
  config?: Record<string, unknown> | null;
}

interface BacktestStrategyResponse {
  id: string;                       // UUID
  name: string;
  symbol: string | null;
  config: Record<string, unknown>;
  created_at: string;               // ISO-8601
  updated_at: string;               // ISO-8601
}
~~~

#### Kiểu kết quả backtest

~~~ts
interface BacktestKpis {
  cagr: number | null;                          // phân số, làm tròn 4 chữ số
  sharpe: number | null;                        // làm tròn 3
  sharpe_ci: [number | null, number | null];    // khoảng tin cậy 95% bootstrap
  max_drawdown: number | null;                  // phân số ÂM, làm tròn 4
  dd_recovery_sessions: number | null;          // số phiên
  win_rate: number | null;                      // phân số, làm tròn 4
  n_trades: number;
  n_wins: number;
  avg_hold: number | null;                      // số phiên, làm tròn 1
  net_return: number | null;                    // phân số, làm tròn 4
  buy_hold_return: number | null;               // phân số, làm tròn 4
  n_sessions: number;
}

interface EquityPoint {
  date: string;      // "YYYY-MM-DD"
  strategy: number;  // base 100, làm tròn 4
  buy_hold: number;  // base 100, làm tròn 4
  vnindex?: number;  // base 100, làm tròn 2 — KHÔNG có key này nếu lấy VN-Index thất bại
}

interface TradeRow {
  idx: number;            // 1-based
  entry_date: string;
  entry_price: number;    // làm tròn 2
  exit_date: string;
  exit_price: number;     // làm tròn 2
  hold: number;           // số phiên giữ = exit_idx - entry_idx
  pnl_pct: number;        // phân số, làm tròn 4 — GIÁ THUẦN, KHÔNG trừ phí
  trigger: string;        // nhãn tiếng Việt hoặc chuỗi điều kiện bán
  entry_trigger: string;  // chuỗi điều kiện mua khớp tại bar vào; "" nếu không xác định
}

interface BacktestRunResponse {
  meta: {
    symbol: string;
    start: string;      // ngày giao dịch ĐẦU TIÊN thực tế, không phải req.start
    end: string;        // ngày giao dịch CUỐI thực tế
    n_sessions: number;
    capital: number;
  };
  kpis: BacktestKpis;
  equity_curve: EquityPoint[];
  trades: TradeRow[];
}
~~~

#### Bảng DB liên quan

| Bảng | Cột đặc trưng | Ràng buộc |
|---|---|---|
| `watchlist_items` | `id` UUID PK, `user_id` FK→`users.id` ON DELETE CASCADE (index), `symbol` VARCHAR(20) (index), `sort_order` INT NOT NULL server_default `0`, `created_at`, `updated_at` | UNIQUE(`user_id`, `symbol`) tên `uq_watchlist_items_user_symbol` |
| `chart_drawings` | `id` UUID PK, `user_id` FK CASCADE (index), `symbol` VARCHAR(20) (index), `state` JSONB NOT NULL, `created_at`, `updated_at` | UNIQUE(`user_id`, `symbol`) tên `uq_chart_drawings_user_symbol` |
| `backtest_strategies` | `id` UUID PK, `user_id` FK CASCADE (index), `name` VARCHAR(120) NOT NULL, `symbol` VARCHAR(20) NULL (index), `config` JSONB NOT NULL, `created_at`, `updated_at` | UNIQUE(`user_id`, `name`) tên `uq_backtest_strategies_user_name` |

`updated_at` có `onupdate = now()` ở tầng ORM.

---

## Nghiệp vụ nền

#### 1. Guard quyền

* `Bearer` = user đã đăng nhập **và** `is_active === true`. Thiếu header → 401 `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` kèm header `WWW-Authenticate: Bearer`. Có token nhưng `is_active === false` → 403 `{"detail":"Tài khoản chưa được kích hoạt","code":"FORBIDDEN"}`.
* `Bearer + Premium` = qua guard trên, rồi kiểm tra `isPremiumActive(user)`. **Admin (`role === "ADMIN"`) luôn được coi là premium**, bỏ qua kiểm tra subscription. Không premium → 403 `{"detail":"Yêu cầu gói Premium đang hoạt động","code":"FORBIDDEN"}`.

#### 2. Lấy dữ liệu giá cho engine TA (`get_adjusted_ohlcv`)

Hàm này là nguồn dữ liệu duy nhất của `/backtest/run`.

1. `symbol` được upper hóa; `start`/`end` parse thành `date`.
2. Cache Redis: key `ta:ohlcv:{SYMBOL}:{start}:{end}`, TTL **1800s**. Cache chứa mảng record đã normalize, không phải object OHLCV.
3. Nếu miss: gọi provider theo thứ tự fallback `[("VCI", vietcap.fetch_ohlcv), ("VND", vndirect.fetch_ohlcv)]`, `interval = "1D"`.
   * Khoảng fetch bắt đầu sớm hơn `start` một khoảng warmup: `fetch_from = start - (WARMUP_SESSIONS * 1.6 + 30) ngày` với `WARMUP_SESSIONS = 300` → tức `start - 510 ngày`.
   * `end_ts` = epoch của `end + 1 ngày`; `count_back = (end - fetch_from).days + 30`.
   * Epoch tính theo timezone **UTC+7** (giờ Việt Nam), không phải UTC.
4. Normalize (`_normalize`): với mỗi record
   * `time` là số **hoặc chuỗi toàn số** → chuyển từ epoch sang ISO date theo UTC+7. Đây là bẫy thật đã gây bug "0 phiên": VCI trả epoch dưới dạng **chuỗi** `"1415145600"`; nếu không convert, so sánh chuỗi ngày sai và `start_index` nhảy về cuối mảng.
   * `time` là chuỗi khác → lấy 10 ký tự đầu.
   * `close` không parse được float, hoặc `close <= 0` → **bỏ dòng**.
   * `open`/`high`/`low` thiếu hoặc falsy → fallback bằng `close`; `volume` thiếu → `0`.
   * Dedupe theo ngày: **bản ghi sau ghi đè bản ghi trước** (last wins), rồi sort tăng dần theo ngày.
5. Không còn record nào → ném `ValueError("Không có dữ liệu giá cho mã {SYMBOL}")` → endpoint map thành **404**.
6. Cả hai provider fail → `RuntimeError("Tất cả 2 nguồn dữ liệu thị trường đều thất bại")` → endpoint map thành **502**.
7. `start_index` = index đầu tiên có `time >= start` (so sánh **chuỗi** ISO); nếu không có phiên nào → `start_index = len(time)`.

Kết quả trả `(OHLCV, start_index)`. Các bar trước `start_index` chỉ dùng để warmup chỉ báo, không dùng để giao dịch.

#### 3. 38 chỉ báo TA — bảng tra bắt buộc

Mọi chỉ báo là mảng `float` cùng độ dài chuỗi bar (cũ → mới). Bar chưa đủ lookback = `NaN`. Chỉ báo `signal` chỉ nhận `0.0` / `1.0` / `NaN`.

Quy ước ký hiệu: `C`=close, `O`=open, `H`=high, `L`=low, `V`=volume, `x[t-k]` = giá trị dịch lùi `k` bar (NaN nếu vượt biên), `SMA(x,n)` = trung bình cộng trượt `n` (**cửa sổ chứa bất kỳ NaN → NaN**), `STD(x,n)` = độ lệch chuẩn **mẫu, ddof=1**.

| # | key | Tên hiển thị (`display_names.py`) | kind | Tham số | Công thức |
|---|---|---|---|---|---|
| 1 | `ma_5` | MA5 | num | n=5 | `SMA(C,5)` |
| 2 | `ma_20` | MA20 | num | n=20 | `SMA(C,20)` |
| 3 | `ma_50` | MA50 | num | n=50 | `SMA(C,50)` |
| 4 | `ma_200` | MA200 | num | n=200 | `SMA(C,200)` |
| 5 | `ma_stack_bull` | MA5 > MA20 > MA50 > MA200 | signal | — | `ma_5>ma_20 && ma_20>ma_50 && ma_50>ma_200`; NaN nếu bất kỳ MA nào NaN |
| 6 | `uptrend` | MA50 > MA200 | signal | — | `ma_50 > ma_200` |
| 7 | `death_cross` | MA20 cắt xuống MA50 | signal | — | `ma_20<ma_50 && ma_20[t-1]>=ma_50[t-1]` |
| 8 | `ma_20_slope` | Độ dốc MA20 | num | lag=10 | `(ma_20 - ma_20[t-10]) / ma_20[t-10]` |
| 9 | `dist_ma_20` | Khoảng cách giá tới MA20 | num | — | `(C - ma_20) / ma_20` |
| 10 | `dist_ma_200` | Khoảng cách giá tới MA200 | num | — | `(C - ma_200) / ma_200` |
| 11 | `rsi_14` | RSI 14 | num | period=14 | RSI kiểu **SMA** (không phải Wilder): `Δ=diff(C)`; `gain=max(Δ,0)`, `loss=max(-Δ,0)`; `rs=SMA(gain,14)/SMA(loss,14)`; `rsi=100-100/(1+rs)`. Nếu `SMA(loss,14)==0` và `SMA(gain,14)` xác định → `100`. Mảng `Δ` dài `n-1`, kết quả gán vào `out[1:]` |
| 12 | `macd_hist` | Histogram MACD | num | 12/26/9 | `line=EMA(C,12)-EMA(C,26)`; `signal=EMA(line,9)`; `hist=line-signal` |
| 13 | `macd_bull_cross` | MACD cắt lên Signal | signal | 12/26/9 | `line>signal && line[t-1]<=signal[t-1]` |
| 14 | `macd_bear_cross` | MACD cắt xuống Signal | signal | 12/26/9 | `line<signal && line[t-1]>=signal[t-1]` |
| 15 | `roc_20d` | ROC 20 phiên | num | lag=20 | `(C - C[t-20]) / C[t-20]` |
| 16 | `atr_14` | ATR 14 | num | period=14 | `TR = max(H-L, abs(H-C[t-1]), abs(L-C[t-1]))`, `TR[0]=NaN`; `atr_14 = SMA(TR,14)` |
| 17 | `atr_pct` | ATR theo % giá | num | — | `atr_14 / C` |
| 18 | `bb_width` | Độ rộng dải Bollinger | num | n=20, k=2 | `upper=ma_20+2*STD(C,20)`, `lower=ma_20-2*STD(C,20)`, `bb_width=(upper-lower)/ma_20` |
| 19 | `bb_squeeze` | Bollinger thắt hẹp | signal | window=120, q=15 | `bb_width <= percentile(bb_width[t-119..t], 15)`, nội suy **linear** (mặc định numpy); cửa sổ chứa NaN → NaN |
| 20 | `bb_breakout_down` | Giá phá xuống Bollinger dưới | signal | n=20, k=2 | `C<lower && C[t-1]>=lower[t-1]` |
| 21 | `vol_ma_20` | MA20 của khối lượng | num | n=20 | `SMA(V,20)` |
| 22 | `vol_zscore` | Độ bất thường khối lượng | num | n=20 | `(V - vol_ma_20) / STD(V,20)` |
| 23 | `obv` | OBV | num | — | `obv[0]=0`; `obv[t]=obv[t-1] + V[t]` nếu `C[t]>C[t-1]`, `- V[t]` nếu `C[t]<C[t-1]`, giữ nguyên nếu bằng. **Không có NaN warmup** |
| 24 | `obv_ma_20` | MA20 của OBV | num | n=20 | `SMA(obv,20)` |
| 25 | `high_20` | Đỉnh 20 phiên | num | n=20 | `rollingMax(H,20)` |
| 26 | `high_52w` | Đỉnh 52 tuần | num | n=252 | `rollingMax(H,252)` |
| 27 | `dist_52w_high` | Khoảng cách tới đỉnh 52 tuần | num | — | `(C - high_52w) / high_52w` |
| 28 | `breakout_20d` | Phá đỉnh 20 phiên | signal | n=20 | `C >= high_20[t-1] && C[t-1] < high_20[t-2]` (chỉ ngày ĐẦU của cú phá) |
| 29 | `breakout_52w` | Phá đỉnh 52 tuần | signal | n=252 | `C >= high_52w[t-1] && C[t-1] < high_52w[t-2]` |
| 30 | `low_20` | Đáy 20 phiên | num | n=20 | `rollingMin(L,20)` |
| 31 | `low_52w` | Đáy 52 tuần | num | n=252 | `rollingMin(L,252)` |
| 32 | `dist_52w_low` | Khoảng cách tới đáy 52 tuần | num | — | `(C - low_52w) / low_52w` |
| 33 | `breakdown_20d` | Thủng đáy 20 phiên | signal | n=20 | `C <= low_20[t-1] && C[t-1] > low_20[t-2]` |
| 34 | `breakdown_52w` | Thủng đáy 52 tuần | signal | n=252 | `C <= low_52w[t-1] && C[t-1] > low_52w[t-2]` |
| 35 | `hammer` | Nến búa | signal | lag=5 | `lower_wick > 2*body && upper_wick < body && ret_5d < -0.03` |
| 36 | `bull_engulfing` | Nến nhấn chìm tăng | signal | — | `C[t-1]<O[t-1] && C>O && C>O[t-1] && O<C[t-1]` |
| 37 | `bear_engulfing` | Nến nhấn chìm giảm | signal | — | `C[t-1]>O[t-1] && C<O && C<O[t-1] && O>C[t-1]` |
| 38 | `shooting_star` | Nến sao băng | signal | lag=5 | `upper_wick > 2*body && lower_wick < body && ret_5d > 0.03` |

Định nghĩa phụ cho nến: `body = |C-O|`, `upper_wick = H - max(C,O)`, `lower_wick = min(C,O) - L`, `ret_5d = (C - C[t-5]) / C[t-5]`.

**Tập nhị phân** (`BINARY_INDICATORS`, 15 phần tử — chỉ những chỉ báo này dùng được `is_true`): `ma_stack_bull`, `uptrend`, `death_cross`, `macd_bull_cross`, `macd_bear_cross`, `bb_squeeze`, `bb_breakout_down`, `breakout_20d`, `breakout_52w`, `breakdown_20d`, `breakdown_52w`, `hammer`, `bull_engulfing`, `bear_engulfing`, `shooting_star`.

**Chi tiết EMA** (khác biệt lớn nhất so với các thư viện JS): `alpha = 2/(n+1)`; seed = SMA của `n` giá trị **hợp lệ** đầu tiên, gán tại index `first_valid + n - 1`; từ đó `out[t] = alpha*x[t] + (1-alpha)*out[t-1]`; nếu `x[t]` là NaN thì `out[t] = out[t-1]` (carry-forward). Nếu tổng số giá trị hợp lệ `< n` → toàn NaN.

**Chi tiết `STD` (ddof=1)** được cài bằng công thức `E[x²] - E[x]²` rồi scale `n/(n-1)`, kèm guard `var < 0 → 0` để chống nhiễu floating-point. Cách này **không đồng nhất bit-for-bit** với vòng lặp hai lượt — xem mục cảnh báo port ở cuối.

#### 4. Mô hình Condition / Combination

~~~ts
type Op = ">" | "<" | ">=" | "<=" | "==" | "cross_above" | "cross_below" | "is_true";

interface Condition {
  indicator: string;              // một trong 38 chỉ báo HOẶC raw field
  op: Op;
  value?: number | string | null; // số, hoặc TÊN FIELD khác (so field-vs-field), hoặc null cho is_true
  join?: "AND" | "OR" | null;     // liên kết với điều kiện TRƯỚC nó
}

interface Combination {
  logic: "AND" | "OR";            // liên kết mặc định
  conditions: Condition[];
}
~~~

* `RAW_FIELDS` được phép tham chiếu thêm: `close`, `open`, `high`, `low`, `volume`. `REFERENCEABLE` = 38 chỉ báo ∪ 5 raw field = 43 tên.
* Thứ tự validate một `Condition` (`validate_condition`) — phải giữ đúng thứ tự để message lỗi khớp:
  1. `indicator` không thuộc `REFERENCEABLE` → `Chỉ số không hợp lệ: 'xxx'`
  2. `op` không thuộc `ALL_OPS` → `Toán tử không hợp lệ: 'xxx'`
  3. `join` khác `AND`/`OR` (và không null) → `Liên kết phải là AND/OR, nhận 'XOR'`
  4. Nếu `op === "is_true"`: `indicator` không nằm trong `BINARY_INDICATORS` → `'is_true' chỉ dùng cho chỉ số nhị phân, không phải 'rsi_14'`; đúng thì **return ngay**
  5. `value == null` → `Điều kiện rsi_14 > thiếu ngưỡng`
  6. `value` là chuỗi nhưng không thuộc `REFERENCEABLE` → `Trường so sánh không hợp lệ: 'bogus_field'`
  7. `op` là cross và `indicator` nằm trong `BINARY_INDICATORS` → `Không thể dùng cross trên chỉ số nhị phân 'uptrend'`
* `validate_combination`: `logic` khác AND/OR → `Logic phải là AND/OR, nhận 'XOR'`; `conditions` rỗng → `Tổ hợp phải có ít nhất 1 điều kiện`; rồi validate từng condition.
* Đánh giá một condition (`eval_condition_series`) trả mảng boolean:
  * `is_true`: `true` khi giá trị `=== 1.0` và không NaN.
  * cross: cần cả 4 giá trị (`lhs`, `rhs`, `lhs[t-1]`, `rhs[t-1]`) không NaN; `cross_above = lhs>rhs && lhs[t-1]<=rhs[t-1]`, `cross_below = lhs<rhs && lhs[t-1]>=rhs[t-1]`.
  * so sánh: cần `lhs`, `rhs` không NaN.
  * **Mọi toán hạng NaN → `false`** (bar không đủ điều kiện), không phải `undefined`, không throw.
  * `rhs` là chuỗi → lấy mảng field tương ứng; là số → mảng hằng.
* Đánh giá một combination (`evaluate_series`) — **sum-of-products**, AND ràng chặt hơn OR:
  * Điều kiện đầu tiên khởi tạo nhóm đầu (`join` của nó bị **bỏ qua**).
  * Với mỗi điều kiện tiếp theo, connector = `cond.join ?? comb.logic` (upper hóa). `OR` → mở nhóm mới; `AND` → thêm vào nhóm hiện tại.
  * Kết quả = `OR` của các nhóm, mỗi nhóm = `AND` của các thành viên.
  * `conditions` rỗng → mảng `false` cùng độ dài frame.
* `build_frame(data)` = 38 chỉ báo + 5 raw field trong cùng một object.

#### 5. Engine mô phỏng (`run_backtest`)

Long-only, một mã, bar ngày, không look-ahead: tín hiệu tại bar `t` dùng dữ liệu tới `t`, khớp lệnh tại **close của chính bar `t`**.

Hằng số: `LOT = 100` (lô HOSE), `TRADING_DAYS = 252`.

Vòng lặp `i` từ `start_index` đến `n-1`:

1. `price = close[i]`.
2. **Nếu chưa có vị thế** và `buy_sig[i]`:
   * `shares = sharesFor(cash, price, fee_buy, risk)`:
     * `price <= 0` → `0`.
     * `position_size === "fixed"` → `budget = min(position_fixed_amount, cash)`; ngược lại `budget = cash * fraction` với `fraction = {all:1.0, half:0.5, quarter:0.25, tenth:0.10}`.
     * `per_share = price * (1 + fee_buy)`; `lots = floor(budget / (per_share * 100))`; `shares = lots * 100`.
   * `shares === 0` → **không vào lệnh** (giữ nguyên `position = null`).
   * `cash -= shares * price * (1 + fee_buy)`.
   * `stop = stopPrice(...)`: `stop_loss === "none"` → `null`; `"fixed"` → `entry * (1 - stop_fixed_pct)`; `"atr"` → `null` nếu `frame.atr_14` không có / `i` vượt biên / `atr_14[i]` NaN, ngược lại `entry - stop_atr_mult * atr_14[i]`.
   * `take = take_profit_pct ? price * (1 + take_profit_pct) : null`. Lưu ý: `take_profit_pct === 0` là falsy → cũng thành `null`.
   * `entry_trigger` = chuỗi các điều kiện MUA đúng tại bar `i`, hoặc `""`.
3. **Nếu đang có vị thế**: `held = i - entry_idx`. Chỉ xét thoát khi `held >= 2` (**T+2**). Ưu tiên thoát, dừng ở điều kiện khớp đầu tiên:
   1. `stop != null && low[i] <= stop` → trigger `"Cắt lỗ"`, giá thoát = **`stop`** (không phải `low`)
   2. `take != null && high[i] >= take` → trigger `"Chốt lời"`, giá thoát = **`take`**
   3. `max_holding != null && held >= max_holding` → trigger `"Hết thời gian giữ"`, giá thoát = `close[i]`
   4. `sell.conditions.length > 0 && sell_sig[i]` → trigger = chuỗi mô tả điều kiện bán khớp (hoặc `"Tín hiệu bán"` nếu không dò được), giá thoát = `close[i]`
   * Khi thoát: `cash += shares * exit_price * (1 - fee_sell)`; ghi `Trade` với `pnl_pct = exit_price/entry_price - 1` (**giá thuần, chưa trừ phí**); `position = null`.
4. Cuối mỗi bar: `port = cash + (position ? shares * price : 0)` → push vào `equity_values`. Vị thế còn mở ở bar cuối được **mark-to-market**, không bị đóng cưỡng chế và **không** xuất hiện trong `trades`.

Chuỗi mô tả điều kiện (`_format_conditions`): với `is_true` → chỉ tên hiển thị; ngược lại → `` `${displayName(indicator)} ${op} ${value}` ``; nhiều điều kiện nối bằng `" + "`. `displayName` fallback về chính `indicator` khi không có trong map (ví dụ `close` → `"close"`).

Preset phí (`_FEES`, service layer map từ `RiskInput.fee`):

| `fee` | `fee_buy` | `fee_sell` | Ghi chú |
|---|---|---|---|
| `standard` | 0.0015 | 0.0025 | mua 0.15%; bán 0.25% (đã gồm thuế chuyển nhượng 0.1%) |
| `low` | 0.0010 | 0.0010 | |
| `none` | 0.0 | 0.0 | chỉ để mô phỏng; **không** xuất hiện trong `risk_presets.fee` của catalog |

Giá trị `fee` không nằm trong map → fallback về `standard` (thực tế Pydantic Literal đã chặn).

#### 6. Công thức KPI (`_compute_kpis`)

Với `equity` = mảng giá trị portfolio theo bar (chỉ từ `start_index`), `capital` = vốn ban đầu, `base_close = close[start_index]`:

| KPI | Công thức | Làm tròn | Khi nào `null` |
|---|---|---|---|
| `n_sessions` | `equity.length` | — | không bao giờ (0 nếu rỗng) |
| `net_return` | `equity[last]/capital - 1` | 4 | `n_sessions === 0` |
| `cagr` | `years = max(n_sessions/252, 1e-9)`; `final > 0 ? (final/capital)**(1/years) - 1 : -1` | 4 | `n_sessions === 0` |
| `sharpe` | `r = diff(equity)/equity[:-1]` (bỏ NaN); `mean(r)/std(r, ddof=1) * sqrt(252)` | 3 | `r.length < 5` hoặc `std === 0` |
| `sharpe_ci` | Bootstrap 500 lần lấy mẫu có hoàn lại, `size = r.length`, **seed cố định 42** (`numpy.random.default_rng(42)`); bỏ mẫu có `std === 0`; lấy percentile `[2.5, 97.5]` | 3 | `[null, null]` khi sharpe null hoặc không có mẫu hợp lệ |
| `max_drawdown` | `dd = equity/cummax(equity) - 1`; `max_drawdown = min(dd)` (giá trị **âm**) | 4 | `n_sessions === 0` |
| `dd_recovery_sessions` | `trough = argmin(dd)`; `peak = argmax(equity[0..trough])` (0 nếu `trough === 0`); số phiên `j > trough` đầu tiên có `equity[j] >= equity[peak]`, trả `j - trough`; nếu chưa hồi phục đến hết chuỗi → `len(equity) - 1 - trough` | — | `n_sessions === 0` |
| `n_trades` | số phần tử `trades` | — | không |
| `n_wins` | số trade có `pnl_pct > 0` (so sánh **> 0** tuyệt đối, không tính hòa) | — | không |
| `win_rate` | `n_wins / n_trades` | 4 | `n_trades === 0` |
| `avg_hold` | `mean(trade.hold)` | 1 | `n_trades === 0` |
| `buy_hold_return` | `close[last của TOÀN chuỗi]/base_close - 1` | 4 | `n_sessions === 0` |

`_empty_kpis()` (khi `start_index >= n` hoặc `n_sessions === 0`): mọi trường số là `null`, trừ `n_trades: 0`, `n_wins: 0`, `n_sessions: 0`, `sharpe_ci: [null, null]`.

Equity curve: `strategy = round(equity[k]/capital*100, 4)`, `buy_hold = round(close[start_index+k]/base_close*100, 4)`.

#### 7. Gắn benchmark VN-Index (`_attach_vnindex`)

Sau khi có payload, service gọi lại `get_adjusted_ohlcv("VNINDEX", start, end)` rồi gắn `vnindex` (base 100) vào từng điểm equity:

* `vn_dates` rỗng hoặc `curve` rỗng → trả `curve` **nguyên vẹn, không thêm key `vnindex`**.
* `base` = close VN-Index tại `curve[0].date` nếu có trong map, ngược lại `vn_closes[0]`.
* Duyệt tuần tự: nếu ngày của điểm có trong map thì cập nhật `last_seen`, rồi `point.vnindex = round(last_seen/base*100, 2)` — tức **forward-fill** khi ngày bị thiếu (nghỉ lễ).
* Toàn bộ khối này bọc trong `try/catch`: bất kỳ lỗi nào (provider fail, timeout) chỉ ghi log warning, `equity_curve` **không có** key `vnindex`. Frontend phải chịu được `vnindex === undefined`.

---

## Danh mục theo dõi

### GET /api/v1/watchlist

> **Lấy danh mục theo dõi** — trả toàn bộ danh sách mã yêu thích của user hiện tại theo đúng thứ tự đã sắp.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `watchlist_items` |
| **Side-effect** | — |

**Path params** — —

**Query params** — — (không có phân trang, không có filter)

**Request body** — —

**Response 200**

~~~ts
interface WatchlistResponse {
  items: Array<{
    id: string;
    symbol: string;
    sort_order: number;
    created_at: string;
  }>;
  count: number;
}
~~~

~~~json
{
  "items": [
    { "id": "3f6c1e2a-8b47-4d9e-9a10-5c2f7b1d0e33", "symbol": "FPT", "sort_order": 0, "created_at": "2026-08-10T09:12:44.512000Z" },
    { "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "symbol": "VCB", "sort_order": 1, "created_at": "2026-08-11T02:30:01.008000Z" },
    { "id": "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f01", "symbol": "HPG", "sort_order": 2, "created_at": "2026-08-17T01:05:19.774000Z" }
  ],
  "count": 3
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — Không có provider ngoài nên không có chế độ suy giảm. Danh mục rỗng trả `{"items": [], "count": 0}` với status **200** (không phải 404).

**curl**

~~~bash
curl -X GET 'http://localhost:8000/api/v1/watchlist' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8f0a1c62-4d7b-4f11-9a3e-2b6c5d1e7a90'
~~~

**Ghi chú khi viết lại**

* **KHÔNG kèm giá thị trường.** Response chỉ có 4 field metadata; không có `price`, `change`, `volume`. Frontend tự gọi endpoint quote riêng. Đừng "cải tiến" bằng cách join thêm giá — sẽ vỡ contract.
* Sắp xếp: `ORDER BY sort_order ASC, created_at ASC`. Tie-break theo `created_at` là **bắt buộc** vì `reorder` có thể để lại `sort_order` trùng nhau (xem endpoint reorder).
* `count` = `items.length`, tính trong tầng endpoint, không phải `COUNT(*)` riêng.
* Path là `/api/v1/watchlist` **không có** dấu `/` cuối (FastAPI dùng `@router.get("")` với prefix `/watchlist`).

---

### POST /api/v1/watchlist

> **Thêm mã vào danh mục** — validate mã tồn tại + là cổ phiếu + chưa đầy + chưa trùng, rồi thêm vào cuối danh sách.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `symbols` (validate) + DB `watchlist_items` (ghi) |
| **Side-effect** | INSERT `watchlist_items` |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface WatchlistAddRequest {
  symbol: string; // minLength 1, maxLength 20
}
~~~

~~~json
{ "symbol": "hpg" }
~~~

**Response 201**

~~~ts
interface WatchlistItemResponse {
  id: string;
  symbol: string;
  sort_order: number;
  created_at: string;
}
~~~

~~~json
{
  "id": "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f01",
  "symbol": "HPG",
  "sort_order": 2,
  "created_at": "2026-08-17T01:05:19.774000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `symbol` rỗng hoặc dài hơn 20 ký tự | mảng ValidationError của Pydantic |
| 400 | `BAD_REQUEST` | Không có bản ghi trong `symbols`, HOẶC `is_active === false` | `Mã HPG không tồn tại` |
| 400 | `BAD_REQUEST` | `is_index === true` HOẶC `asset_type.toLowerCase() !== "stock"` | `Mã VNINDEX không phải là cổ phiếu` |
| 400 | `BAD_REQUEST` | Đã có 50 mã | `Danh sách yêu thích tối đa 50 mã` |
| 409 | `CONFLICT` | Mã đã có trong danh mục của user | `Mã HPG đã có trong danh sách` |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — Không có. Nếu bảng `symbols` chưa được seed thì **mọi** mã đều bị 400 `không tồn tại`; đây là hành vi đúng theo thiết kế, không có đường bypass.

**curl**

~~~bash
curl -X POST 'http://localhost:8000/api/v1/watchlist' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5c9d3a71-6e28-4b53-8f47-1d0e9c8b7a62' \
  -d '{"symbol":"hpg"}'
~~~

**Ghi chú khi viết lại**

* **Thứ tự kiểm tra là bắt buộc** (test dựa vào chính message): (1) upper hóa → (2) tồn tại & active → (3) là cổ phiếu → (4) giới hạn 50 → (5) trùng lặp → (6) insert. Đừng đảo (4) và (5): user đã có 50 mã và cố thêm lại một mã đã có sẽ nhận **400 "tối đa 50 mã"**, không phải 409.
* `_MAX_ITEMS = 50` là hằng số hard-code trong module endpoint, không phải config.
* Message lỗi dùng mã **đã upper hóa** (`requested_symbol`), nên gửi `"hpg"` sẽ nhận `Mã HPG ...`.
* `asset_type` có thể `null` → code làm `(symbol.asset_type || "").toLowerCase() !== "stock"` nên `null` cũng bị chặn.
* `sort_order` mới = `max(sort_order) + 1`, với `COALESCE(MAX(sort_order), -1)` khi danh sách rỗng → mã đầu tiên nhận `sort_order = 0`.
* Có UNIQUE(`user_id`,`symbol`) ở DB làm chốt cuối: nếu hai request song song vượt qua bước (5) thì một request sẽ vỡ constraint. Backend gốc **không** bắt lỗi này thành 409 — nó nổi lên thành 500. Khi viết lại nên bắt unique-violation và map về 409 với cùng message.

---

### DELETE /api/v1/watchlist/{symbol}

> **Xóa mã khỏi danh mục** — xóa bản ghi (user, symbol); 404 nếu không có.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `watchlist_items` |
| **Side-effect** | DELETE `watchlist_items` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | không giới hạn ở tầng route; được upper hóa trước khi query | Mã cổ phiếu cần xóa |

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Status thành công là **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Không xóa được dòng nào (mã không có trong danh mục của user) | `Mã HPG không có trong danh sách` |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — Không có. Endpoint **không idempotent**: gọi lần thứ hai trên cùng mã trả 404.

**curl**

~~~bash
curl -X DELETE 'http://localhost:8000/api/v1/watchlist/HPG' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b2e7f411-9c05-4d6a-a8f3-7e1c2d5b9083'
~~~

**Ghi chú khi viết lại**

* Điều kiện WHERE gồm cả `user_id` — đây là điểm chặn quyền sở hữu duy nhất. User A không thể xóa mã của user B vì query không khớp dòng nào → 404.
* Quyết định 404 dựa trên `rowcount > 0` của lệnh DELETE, **không** SELECT trước rồi DELETE. Giữ nguyên để tránh race.
* Không dồn lại `sort_order` sau khi xóa → sẽ có "lỗ" trong dãy (0,2,3…). Đây là hành vi hiện có; frontend không phụ thuộc vào tính liên tục.
* Trái ngược với `DELETE /chart-drawings/{symbol}` (luôn 204). Đừng làm hai endpoint này giống nhau.

---

### PUT /api/v1/watchlist/reorder

> **Sắp xếp lại danh mục** — nhận mảng mã theo thứ tự mới và ghi lại `sort_order` theo vị trí trong mảng.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `watchlist_items` |
| **Side-effect** | UPDATE `watchlist_items.sort_order` (một câu UPDATE cho mỗi mã trong mảng) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface WatchlistReorderRequest {
  /** Mảng MÃ theo thứ tự mới. Không phải mảng object {symbol, order}. */
  symbols: string[];
}
~~~

~~~json
{ "symbols": ["VCB", "HPG", "FPT"] }
~~~

**Response 200** — `WatchlistResponse` (đọc lại toàn bộ danh mục **sau khi** ghi).

~~~json
{
  "items": [
    { "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "symbol": "VCB", "sort_order": 0, "created_at": "2026-08-11T02:30:01.008000Z" },
    { "id": "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f01", "symbol": "HPG", "sort_order": 1, "created_at": "2026-08-17T01:05:19.774000Z" },
    { "id": "3f6c1e2a-8b47-4d9e-9a10-5c2f7b1d0e33", "symbol": "FPT", "sort_order": 2, "created_at": "2026-08-10T09:12:44.512000Z" }
  ],
  "count": 3
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `symbols` thiếu hoặc không phải mảng chuỗi | mảng ValidationError của Pydantic |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — Body này **không được validate về nội dung**. Mã không tồn tại trong danh mục → câu UPDATE khớp 0 dòng, **bị bỏ qua âm thầm, không có lỗi**. Mảng rỗng `{"symbols": []}` → không ghi gì, trả danh mục hiện tại. Không có kiểm tra "mảng phải bao trùm hết danh mục".

**curl**

~~~bash
curl -X PUT 'http://localhost:8000/api/v1/watchlist/reorder' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4a1b8c37-2e6d-4f09-b5a1-93c7e0d2f486' \
  -d '{"symbols":["VCB","HPG","FPT"]}'
~~~

**Ghi chú khi viết lại**

* **Hình dạng body**: mảng chuỗi phẳng, index trong mảng chính là `sort_order` mới (0-based). `symbols[0]` → `sort_order = 0`.
* **Xử lý khi thiếu mã**: mã đang có trong danh mục nhưng **không** xuất hiện trong mảng thì giữ nguyên `sort_order` cũ. Vì `sort_order` mới được ghi từ 0 tăng dần còn `sort_order` cũ có thể trùng, kết quả có thể **trùng `sort_order`** — lúc đó thứ tự cuối do tie-break `created_at ASC` quyết định. Đây là hành vi hiện tại; giữ nguyên và giữ luôn tie-break.
* Mã lạ (không thuộc danh mục, hoặc thuộc user khác) → không lỗi, không tác dụng. Không được đổi thành 400/404.
* Mã trùng trong mảng → lần xuất hiện **cuối cùng** thắng (UPDATE sau ghi đè UPDATE trước).
* Mỗi mã là một câu UPDATE riêng trong vòng lặp, upper hóa từng phần tử. Với N mã sẽ có N round-trip DB. Khi viết lại có thể gộp thành một `CASE WHEN` hoặc `UPDATE ... FROM VALUES`, miễn giữ đúng semantics "last wins" và "bỏ qua mã lạ".
* **Route ordering**: đường dẫn `/watchlist/reorder` là literal, phải khai báo **trước** bất kỳ route `/watchlist/:symbol` nào cùng method. Hiện tại `reorder` là `PUT` còn `:symbol` là `DELETE` nên chưa xung đột, nhưng NestJS đăng ký theo thứ tự khai báo — đặt literal lên trước để an toàn. Cũng lưu ý `/watchlist/check/:symbol` là literal segment `check`.

---

### GET /api/v1/watchlist/check/{symbol}

> **Kiểm tra mã có trong danh mục** — trả cờ boolean, dùng cho nút "thêm/bỏ yêu thích" trên UI.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `watchlist_items` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | không validate; upper hóa trước khi query | Mã cần kiểm tra |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface WatchlistCheckResponse {
  symbol: string;      // UPPERCASE của path param
  is_watched: boolean;
}
~~~

~~~json
{ "symbol": "VNM", "is_watched": false }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — **Không bao giờ 404.** Mã không tồn tại trong hệ thống, mã rác, mã chỉ số — tất cả đều trả 200 với `is_watched: false`. Endpoint này **không** validate mã có thật (khác với `POST /watchlist`).

**curl**

~~~bash
curl -X GET 'http://localhost:8000/api/v1/watchlist/check/vnm' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c6d0e2f8-71a4-4b3c-9e05-8f1a2b7c4d69'
~~~

**Ghi chú khi viết lại**

* Shape response chỉ có **2 field** và được khai báo là `dict` tự do trong FastAPI (OpenAPI ghi `additionalProperties: true`). Nếu viết lại bằng NestJS, khai báo DTO tường minh nhưng **đừng thêm field** (không `id`, không `sort_order`) vì frontend đang đọc đúng 2 field này.
* `symbol` trả về là bản upper hóa của path param, **không** phải giá trị lấy từ DB — nên khi `is_watched: false` vẫn có `symbol`.
* Không cache: một lượt điều hướng UI có thể gọi endpoint này liên tục; đừng thêm cache Redis nếu không muốn nút yêu thích bị "lag" state.

---

## Bản vẽ biểu đồ

> **Bối cảnh quan trọng về `state`.** Payload lưu trong `chart_drawings.state` là kết quả của **`widget.save(cb)`** của TradingView Charting Library — tức **toàn bộ layout biểu đồ**, nhận diện được nhờ có mảng `charts` ở cấp cao nhất. Nó **KHÔNG** phải kết quả `getLineToolsState()`.
>
> Docstring của `app/models/chart_drawing.py` ghi *"serialized `LineToolsAndGroupsState` produced by the Charting Library (`getLineToolsState()`)"* và field description trong `app/schemas/chart_drawing.py` ghi *"Serialized LineToolsAndGroupsState"` (chảy vào cả OpenAPI). **Cả hai đều là docstring CŨ/SAI, lệch so với client thực tế.** Bằng chứng ở phía client: `dashboard/src/features/dashboard/chart/TVChart.tsx` gọi `widget.save((state) => persist.save(sym, state))` để ghi, và khi đọc lại chỉ nhận payload nếu `Array.isArray(loaded.charts)` — kèm comment "Guards against stale/foreign payloads (e.g. an old line-tools-state object) which would otherwise wedge the widget on a loading spinner". Khi viết lại, hãy sửa mô tả trong docs/OpenAPI thành `widget.save()` full-layout, đừng copy docstring cũ.

### GET /api/v1/chart-drawings/{symbol}

> **Lấy bản vẽ đã lưu** — trả layout biểu đồ của (user, mã); `state: null` khi chưa lưu bao giờ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `chart_drawings` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | không validate; upper hóa trước khi query | Mã của biểu đồ |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface ChartDrawingResponse {
  symbol: string;
  state: Record<string, unknown> | null;
  updated_at: string | null;
}
~~~

Khi đã có bản vẽ (rút gọn — payload thật của `widget.save()` dài hàng chục KB):

~~~json
{
  "symbol": "FPT",
  "state": {
    "layout": "s",
    "charts": [
      {
        "panes": [
          {
            "sources": [
              {
                "type": "MainSeries",
                "state": { "symbol": "HOSE:FPT", "interval": "1D", "style": 1 }
              },
              {
                "id": "Bt3kQd",
                "type": "LineToolTrendLine",
                "state": { "linecolor": "#2962FF", "linewidth": 2, "text": "Kháng cự 148.5" },
                "points": [
                  { "time_t": 1755388800, "price": 132400 },
                  { "time_t": 1755993600, "price": 148500 }
                ]
              }
            ]
          }
        ],
        "timeScale": { "rightOffset": 8, "barSpacing": 6.5 }
      }
    ],
    "symbolLock": 0,
    "intervalLock": 0
  },
  "updated_at": "2026-08-17T07:41:58.203000Z"
}
~~~

Khi chưa có bản vẽ:

~~~json
{ "symbol": "VNM", "state": null, "updated_at": null }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — **Chưa có bản vẽ trả 200 với `state: null`, KHÔNG phải 404.** Client (`drawing-persistence.ts`) dựa vào đúng điều này: nó đọc `res.state ?? lsLoad(sym)` — tức `null` nghĩa là "backend chưa có gì, dùng bản localStorage". Nếu đổi thành 404, client sẽ rơi vào nhánh `catch` và cũng dùng localStorage, nhưng ta mất khả năng phân biệt "backend chưa có" với "backend lỗi". Giữ nguyên 200 + null.

**curl**

~~~bash
curl -X GET 'http://localhost:8000/api/v1/chart-drawings/FPT' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9e4f7a05-3c1d-4b82-8a6f-0d5e2c9b1748'
~~~

**Ghi chú khi viết lại**

* Khi không có bản ghi, `symbol` trả về là **upper hóa của path param**; khi có bản ghi, lấy từ cột DB (cũng đã upper). Cả hai trường hợp đều UPPERCASE.
* Query WHERE gồm `user_id` — bản vẽ của user khác không bao giờ lộ; đây là toàn bộ cơ chế phân quyền.
* Không cache Redis. Payload có thể lớn; đừng gói vào cache mà không tính dung lượng.

---

### PUT /api/v1/chart-drawings/{symbol}

> **Lưu bản vẽ (ghi đè)** — upsert layout `widget.save()` cho (user, mã); client gọi debounce nên endpoint này bị gọi rất thường xuyên.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `chart_drawings` |
| **Side-effect** | INSERT hoặc UPDATE `chart_drawings`; `updated_at` được refresh |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | không validate; upper hóa trước khi ghi | Mã của biểu đồ |

**Query params** — —

**Request body**

~~~ts
interface ChartDrawingUpsert {
  /**
   * Kết quả widget.save() của TradingView (full layout, có mảng `charts`).
   * PHẢI là object JSON. null / mảng / số / chuỗi -> 422.
   */
  state: Record<string, unknown>;
}
~~~

~~~json
{
  "state": {
    "layout": "s",
    "charts": [
      {
        "panes": [
          {
            "sources": [
              { "type": "MainSeries", "state": { "symbol": "HOSE:VCB", "interval": "1D", "style": 1 } },
              {
                "id": "Pq7mZa",
                "type": "LineToolHorzLine",
                "state": { "linecolor": "#F23645", "linewidth": 1, "text": "Cắt lỗ 61.200" },
                "points": [{ "time_t": 1755993600, "price": 61200 }]
              }
            ]
          }
        ],
        "timeScale": { "rightOffset": 5, "barSpacing": 7.2 }
      }
    ],
    "symbolLock": 0,
    "intervalLock": 0
  }
}
~~~

**Response 200** — `ChartDrawingResponse` với `state` đúng bằng payload vừa gửi và `updated_at` là thời điểm ghi.

~~~json
{
  "symbol": "VCB",
  "state": {
    "layout": "s",
    "charts": [
      {
        "panes": [
          {
            "sources": [
              { "type": "MainSeries", "state": { "symbol": "HOSE:VCB", "interval": "1D", "style": 1 } },
              {
                "id": "Pq7mZa",
                "type": "LineToolHorzLine",
                "state": { "linecolor": "#F23645", "linewidth": 1, "text": "Cắt lỗ 61.200" },
                "points": [{ "time_t": 1755993600, "price": 61200 }]
              }
            ]
          }
        ],
        "timeScale": { "rightOffset": 5, "barSpacing": 7.2 }
      }
    ],
    "symbolLock": 0,
    "intervalLock": 0
  },
  "updated_at": "2026-08-17T08:03:12.669000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | Thiếu `state`, hoặc `state` là `null` / mảng / số / chuỗi / boolean | mảng ValidationError của Pydantic |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — Không có provider ngoài. Endpoint luôn ghi đè hoàn toàn (không merge). Nếu client mất mạng, `drawing-persistence.ts` đã ghi bản sao vào localStorage trước và bỏ qua lỗi network âm thầm — nên phía backend không cần retry.

**curl**

~~~bash
curl -X PUT 'http://localhost:8000/api/v1/chart-drawings/vcb' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 1f2a3b4c-5d6e-4f70-8192-a3b4c5d6e7f8' \
  -d '{"state":{"layout":"s","charts":[{"panes":[{"sources":[{"type":"MainSeries","state":{"symbol":"HOSE:VCB","interval":"1D","style":1}}]}],"timeScale":{"rightOffset":5,"barSpacing":7.2}}],"symbolLock":0,"intervalLock":0}}'
~~~

**Ghi chú khi viết lại**

* **`symbol` được upper hóa**: `PUT /chart-drawings/vcb` trả `"symbol": "VCB"` (test khẳng định điều này). Lưu bằng `vcb` rồi đọc bằng `VCB` phải ra cùng một bản ghi.
* **Guard chống ghi rỗng: backend hiện KHÔNG có.** Pydantic chỉ chặn `null`/không-object; `{"state": {}}` được **chấp nhận và ghi vào DB** (test `test_chart_drawings_upsert_overwrites` ghi `{"sources": {}}` thành công). Guard thật nằm ở **client** (`TVChart.tsx`: chỉ nạp lại khi `Array.isArray(loaded.charts)`) — đó là bản vá cho bug "saved_data làm widget treo ở spinner". Khi viết lại, **nên** thêm guard server-side (từ chối `{}` hoặc payload không có mảng `charts` bằng 400) nhưng phải coi đây là **thay đổi hành vi có ý thức**, ghi rõ trong changelog, vì hiện tại client vẫn có thể đẩy lên payload lạ.
* **Giới hạn kích thước payload: KHÔNG có trong code ứng dụng** — không giới hạn độ dài JSON ở schema, không middleware body-size, cột là JSONB không giới hạn thực tế. Giới hạn ở tầng reverse-proxy: **CHƯA XÁC ĐỊNH** — cần kiểm tra cấu hình Coolify/nginx trước khi hứa với client. Payload `widget.save()` thường 20–200 KB.
* Upsert được cài là SELECT rồi UPDATE/INSERT, **không** dùng `ON CONFLICT`. Hai request PUT song song cho cùng (user, symbol) có thể vỡ UNIQUE constraint. Khi viết lại, dùng `ON CONFLICT (user_id, symbol) DO UPDATE SET state = ..., updated_at = now()` để vừa an toàn vừa gọn.
* Sau khi ghi phải **refresh** bản ghi để lấy `updated_at` do DB sinh (`onupdate=now()`). Trong Python đây là bắt buộc để tránh lazy-load bất đồng bộ (`MissingGreenlet`); trong TypeORM/Prisma tương ứng là `RETURNING *` hoặc reload — đừng trả `updated_at` cũ.
* Model dùng `sa.JSON` để test SQLite chạy được, nhưng **migration Postgres dùng JSONB**. Khi viết lại: cột JSONB.

---

### DELETE /api/v1/chart-drawings/{symbol}

> **Xóa bản vẽ** — bỏ layout đã lưu của (user, mã); luôn thành công.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `chart_drawings` |
| **Side-effect** | DELETE `chart_drawings` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | không validate; upper hóa trước khi query | Mã của biểu đồ |

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Status thành công là **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |

**Fallback / suy giảm** — **Idempotent**: xóa mã chưa từng có bản vẽ vẫn trả 204. Repository trả `boolean` nhưng endpoint **bỏ qua** giá trị đó — không có 404.

**curl**

~~~bash
curl -X DELETE 'http://localhost:8000/api/v1/chart-drawings/FPT' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6b8c0d2e-4f19-4a53-b7c8-d9e0f1a2b3c4'
~~~

**Ghi chú khi viết lại**

* Bất đối xứng có ý thức với `DELETE /watchlist/{symbol}` (trả 404 khi không có). Đừng "chuẩn hóa" hai endpoint này về cùng một hành vi.
* Sau khi xóa, `GET` cùng mã phải trả 200 với `state: null` (test khẳng định).
* Lưu ý: xóa ở backend **không** xóa bản sao localStorage của client, nên user cùng thiết bị có thể thấy bản vẽ "sống lại" sau refresh. Đây là hành vi đã biết của client, không phải bug backend.

---

## Backtest

### GET /api/v1/backtest/catalog

> **Thư viện factor + mẫu + preset rủi ro** — dữ liệu tĩnh để UI dựng sidebar chọn điều kiện và ô nhập ngưỡng một cách data-driven.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không (tính trong process từ hằng số, không I/O) |
| **Nguồn dữ liệu** | tính toán — hằng số `CATALOG` + `TEMPLATES` + preset hard-code |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface FactorDto {
  id: string;
  label: string;         // = displayName(indicator); có thể trùng nhau giữa các factor
  side: "buy" | "sell";
  group: string;         // "B1".."B7" | "S1".."S7"
  group_label: string;
  kind: "bin" | "num";
  indicator: string;
  op: ">" | "<" | ">=" | "<=" | "==" | "cross_above" | "cross_below" | "is_true";
  default: number | string | null;  // string = TÊN FIELD (so field-vs-field)
  editable: boolean;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: "" | "%" | "σ";
  is_percent: boolean;
  desc: string;
}

interface FactorGroupDto {
  group: string;
  group_label: string;
  factors: FactorDto[];
}

interface CatalogResponse {
  factors: {
    buy: FactorGroupDto[];   // 7 nhóm B1..B7
    sell: FactorGroupDto[];  // 7 nhóm S1..S7
    count: number;           // 38
  };
  templates: Array<{
    key: string;
    name: string;
    description: string;
    config: {
      buy: { logic: "AND" | "OR"; factors: Array<{ id: string; value?: number }> };
      sell: { logic: "AND" | "OR"; factors: Array<{ id: string; value?: number }> };
      risk: Required<RiskInput>;
    };
  }>;
  risk_presets: {
    stop_loss: Array<{ value: "atr" | "fixed" | "none"; mult?: number; pct?: number; label: string }>;
    take_profit: Array<{ value: number | null; label: string }>;
    position_size: Array<{ value: "all" | "half" | "fixed"; amount?: number; label: string }>;
    fee: Array<{ value: "standard" | "low"; label: string }>;
  };
}
~~~

**Bảng tra 38 factor** — đây là nội dung `factors.buy` + `factors.sell` (22 buy + 16 sell = 38). `default` là ngưỡng khởi tạo; `min/max/step` chỉ có nghĩa khi `editable === true`.

| side | group | group_label | id | label | kind | indicator | op | default | editable | min | max | step | unit | is_percent | desc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| buy | B1 | Xu hướng tăng | `ma_stack_bull` | MA5 > MA20 > MA50 > MA200 | bin | `ma_stack_bull` | `is_true` | `null` | false | — | — | — | | false | 4 MA xếp chồng tăng |
| buy | B1 | Xu hướng tăng | `uptrend` | MA50 > MA200 | bin | `uptrend` | `is_true` | `null` | false | — | — | — | | false | MA50 > MA200 |
| buy | B1 | Xu hướng tăng | `close_above_ma50` | close | bin | `close` | `>` | `"ma_50"` | false | — | — | — | | false | Giá vượt MA50 |
| buy | B1 | Xu hướng tăng | `ma_20_slope` | Độ dốc MA20 | num | `ma_20_slope` | `>` | `0.02` | true | `0` | `0.05` | `0.005` | | false | Độ dốc MA20 dương |
| buy | B2 | Động lượng tăng | `rsi_14_buy_mom` | RSI 14 | num | `rsi_14` | `cross_above` | `50` | **false** | — | — | — | | false | RSI cắt lên 50 |
| buy | B2 | Động lượng tăng | `macd_hist_buy` | Histogram MACD | num | `macd_hist` | `>` | `0` | true | `-0.5` | `0.5` | `0.05` | | false | MACD histogram dương |
| buy | B2 | Động lượng tăng | `macd_bull_cross` | MACD cắt lên Signal | bin | `macd_bull_cross` | `is_true` | `null` | false | — | — | — | | false | MACD cắt lên signal |
| buy | B2 | Động lượng tăng | `roc_20d_buy` | ROC 20 phiên | num | `roc_20d` | `>` | `0.05` | true | `0` | `0.20` | `0.01` | `%` | true | Đà tăng 20 phiên |
| buy | B3 | Quá bán / Mua đáy | `rsi_14_oversold` | RSI 14 | num | `rsi_14` | `<` | `30` | true | `20` | `40` | `1` | | false | RSI quá bán |
| buy | B3 | Quá bán / Mua đáy | `dist_ma_20_buy` | Khoảng cách giá tới MA20 | num | `dist_ma_20` | `<` | `-0.05` | true | `-0.15` | `0` | `0.01` | `%` | true | Giá dưới MA20 |
| buy | B3 | Quá bán / Mua đáy | `dist_52w_low_buy` | Khoảng cách tới đáy 52 tuần | num | `dist_52w_low` | `<` | `0.05` | true | `0` | `1.00` | `0.05` | `%` | true | Gần đáy năm |
| buy | B3 | Quá bán / Mua đáy | `dist_ma_200_buy` | Khoảng cách giá tới MA200 | num | `dist_ma_200` | `>` | `0` | true | `-0.20` | `0.20` | `0.01` | `%` | true | Khoảng cách giá tới MA200 |
| buy | B4 | Phá đỉnh / Bứt phá | `breakout_20d` | Phá đỉnh 20 phiên | bin | `breakout_20d` | `is_true` | `null` | false | — | — | — | | false | Phá đỉnh 20 phiên |
| buy | B4 | Phá đỉnh / Bứt phá | `breakout_52w` | Phá đỉnh 52 tuần | bin | `breakout_52w` | `is_true` | `null` | false | — | — | — | | false | Phá đỉnh 52 tuần |
| buy | B4 | Phá đỉnh / Bứt phá | `dist_52w_high_buy` | Khoảng cách tới đỉnh 52 tuần | num | `dist_52w_high` | `>` | `-0.05` | true | `-0.30` | `0` | `0.01` | `%` | true | Sát đỉnh năm |
| buy | B5 | Xác nhận khối lượng | `vol_zscore_buy` | Độ bất thường khối lượng | num | `vol_zscore` | `>` | `1.5` | true | `1.0` | `3.0` | `0.1` | `σ` | false | Khối lượng bùng nổ |
| buy | B5 | Xác nhận khối lượng | `obv_cross_buy` | OBV | bin | `obv` | `cross_above` | `"obv_ma_20"` | false | — | — | — | | false | OBV vượt MA20 |
| buy | B6 | Bối cảnh biến động | `bb_squeeze_buy` | Bollinger thắt hẹp | bin | `bb_squeeze` | `is_true` | `null` | false | — | — | — | | false | BB co hẹp (sắp bung) |
| buy | B6 | Bối cảnh biến động | `bb_width_buy` | Độ rộng dải Bollinger | num | `bb_width` | `<` | `0.05` | true | `0.01` | `0.20` | `0.01` | `%` | true | Độ rộng dải Bollinger |
| buy | B6 | Bối cảnh biến động | `atr_pct_low` | ATR theo % giá | num | `atr_pct` | `<` | `0.05` | true | `0.01` | `0.15` | `0.005` | `%` | true | Biến động thấp |
| buy | B7 | Mẫu hình nến | `hammer_buy` | Nến búa | bin | `hammer` | `is_true` | `null` | false | — | — | — | | false | Nến hammer (đảo chiều tăng) |
| buy | B7 | Mẫu hình nến | `bull_engulfing_buy` | Nến nhấn chìm tăng | bin | `bull_engulfing` | `is_true` | `null` | false | — | — | — | | false | Nến nhấn chìm tăng |
| sell | S1 | Xu hướng đảo | `death_cross` | MA20 cắt xuống MA50 | bin | `death_cross` | `is_true` | `null` | false | — | — | — | | false | MA20 cắt xuống MA50 |
| sell | S1 | Xu hướng đảo | `close_below_ma50` | close | bin | `close` | `<` | `"ma_50"` | false | — | — | — | | false | Giá thủng MA50 |
| sell | S1 | Xu hướng đảo | `uptrend_off` | MA50 > MA200 | bin | `uptrend` | `==` | `0` | false | — | — | — | | false | Không còn xu hướng tăng |
| sell | S2 | Mất động lượng | `rsi_14_sell_mom` | RSI 14 | num | `rsi_14` | `cross_below` | `50` | **false** | — | — | — | | false | RSI cắt xuống 50 |
| sell | S2 | Mất động lượng | `macd_bear_cross` | MACD cắt xuống Signal | bin | `macd_bear_cross` | `is_true` | `null` | false | — | — | — | | false | MACD cắt xuống signal |
| sell | S2 | Mất động lượng | `roc_20d_sell` | ROC 20 phiên | num | `roc_20d` | `<` | `-0.05` | true | `-0.20` | `0` | `0.01` | `%` | true | Đà giảm 20 phiên |
| sell | S3 | Quá mua / Bán đỉnh | `rsi_14_overbought` | RSI 14 | num | `rsi_14` | `>` | `70` | true | `60` | `80` | `1` | | false | RSI quá mua |
| sell | S3 | Quá mua / Bán đỉnh | `dist_ma_20_sell` | Khoảng cách giá tới MA20 | num | `dist_ma_20` | `>` | `0.10` | true | `0` | `0.20` | `0.01` | `%` | true | Giá vượt xa MA20 |
| sell | S4 | Phá đáy | `breakdown_20d` | Thủng đáy 20 phiên | bin | `breakdown_20d` | `is_true` | `null` | false | — | — | — | | false | Phá đáy 20 phiên |
| sell | S4 | Phá đáy | `breakdown_52w` | Thủng đáy 52 tuần | bin | `breakdown_52w` | `is_true` | `null` | false | — | — | — | | false | Phá đáy 52 tuần |
| sell | S4 | Phá đáy | `bb_breakout_down` | Giá phá xuống Bollinger dưới | bin | `bb_breakout_down` | `is_true` | `null` | false | — | — | — | | false | Giá phá BB dưới |
| sell | S5 | Xác nhận khối lượng | `vol_zscore_sell` | Độ bất thường khối lượng | num | `vol_zscore` | `>` | `1.5` | true | `1.0` | `3.0` | `0.1` | `σ` | false | Khối lượng bán tháo |
| sell | S5 | Xác nhận khối lượng | `obv_cross_sell` | OBV | bin | `obv` | `cross_below` | `"obv_ma_20"` | false | — | — | — | | false | OBV xuyên xuống MA |
| sell | S6 | Bối cảnh biến động | `atr_pct_high` | ATR theo % giá | num | `atr_pct` | `>` | `0.08` | true | `0.05` | `0.15` | `0.005` | `%` | true | Biến động cao |
| sell | S7 | Mẫu hình nến | `shooting_star_sell` | Nến sao băng | bin | `shooting_star` | `is_true` | `null` | false | — | — | — | | false | Nến shooting star (đảo chiều giảm) |
| sell | S7 | Mẫu hình nến | `bear_engulfing_sell` | Nến nhấn chìm giảm | bin | `bear_engulfing` | `is_true` | `null` | false | — | — | — | | false | Nến nhấn chìm giảm |

**4 template** (`templates`), mỗi `risk` là object đầy đủ 8 field:

| key | name | description | buy | sell | risk (chỉ field khác default) |
|---|---|---|---|---|---|
| `momentum_cross` | Giao cắt động lượng | Mua khi RSI quá bán + MACD cắt lên; bán khi RSI quá mua hoặc death cross. | AND: `rsi_14_oversold`=30, `macd_bull_cross` | OR: `rsi_14_overbought`=70, `death_cross` | `stop_loss:"atr"`, `stop_atr_mult:2.0`, `max_holding:60` |
| `volume_breakout` | Bứt phá khối lượng | Mua khi phá đỉnh 20 phiên với khối lượng bùng nổ; chốt lời 15%. | AND: `breakout_20d`, `vol_zscore_buy`=1.5 | OR: `breakdown_20d`, `macd_bear_cross` | `stop_atr_mult:1.5`, `take_profit_pct:0.15`, `max_holding:40` |
| `trend_follow` | Thuận xu hướng | Mua khi 4 MA xếp chồng tăng + MACD dương; bán khi giá thủng MA50. | AND: `ma_stack_bull`, `macd_hist_buy`=0 | OR: `close_below_ma50`, `death_cross` | `stop_atr_mult:3.0`, `max_holding:90` |
| `mean_reversion` | Bắt đáy hồi phục | Mua khi RSI quá bán + giá dưới MA20; chốt lời 10%, cắt lỗ 5%. | AND: `rsi_14_oversold`=28, `dist_ma_20_buy`=-0.05 | OR: `rsi_14_overbought`=68 | `stop_loss:"fixed"`, `stop_fixed_pct:0.05`, `take_profit_pct:0.10`, `max_holding:30`, `position_size:"half"` |

Base của `risk` trong template: `{stop_loss:"atr", stop_atr_mult:2.0, stop_fixed_pct:0.05, take_profit_pct:null, max_holding:60, position_size:"all", position_fixed_amount:10000000, fee:"standard"}`.

Ví dụ JSON (rút gọn — chỉ giữ 1 nhóm mỗi side, còn lại tương tự bảng trên):

~~~json
{
  "factors": {
    "buy": [
      {
        "group": "B3",
        "group_label": "Quá bán / Mua đáy",
        "factors": [
          {
            "id": "rsi_14_oversold",
            "label": "RSI 14",
            "side": "buy",
            "group": "B3",
            "group_label": "Quá bán / Mua đáy",
            "kind": "num",
            "indicator": "rsi_14",
            "op": "<",
            "default": 30,
            "editable": true,
            "min": 20,
            "max": 40,
            "step": 1,
            "unit": "",
            "is_percent": false,
            "desc": "RSI quá bán"
          }
        ]
      }
    ],
    "sell": [
      {
        "group": "S1",
        "group_label": "Xu hướng đảo",
        "factors": [
          {
            "id": "close_below_ma50",
            "label": "close",
            "side": "sell",
            "group": "S1",
            "group_label": "Xu hướng đảo",
            "kind": "bin",
            "indicator": "close",
            "op": "<",
            "default": "ma_50",
            "editable": false,
            "min": null,
            "max": null,
            "step": null,
            "unit": "",
            "is_percent": false,
            "desc": "Giá thủng MA50"
          }
        ]
      }
    ],
    "count": 38
  },
  "templates": [
    {
      "key": "mean_reversion",
      "name": "Bắt đáy hồi phục",
      "description": "Mua khi RSI quá bán + giá dưới MA20; chốt lời 10%, cắt lỗ 5%.",
      "config": {
        "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 28 }, { "id": "dist_ma_20_buy", "value": -0.05 }] },
        "sell": { "logic": "OR", "factors": [{ "id": "rsi_14_overbought", "value": 68 }] },
        "risk": {
          "stop_loss": "fixed",
          "stop_atr_mult": 2.0,
          "stop_fixed_pct": 0.05,
          "take_profit_pct": 0.10,
          "max_holding": 30,
          "position_size": "half",
          "position_fixed_amount": 10000000,
          "fee": "standard"
        }
      }
    }
  ],
  "risk_presets": {
    "stop_loss": [
      { "value": "atr", "mult": 2.0, "label": "2.0× ATR" },
      { "value": "atr", "mult": 1.5, "label": "1.5× ATR" },
      { "value": "atr", "mult": 3.0, "label": "3.0× ATR" },
      { "value": "fixed", "pct": 0.05, "label": "Cố định 5%" },
      { "value": "none", "label": "Không có" }
    ],
    "take_profit": [
      { "value": null, "label": "Không (theo signal)" },
      { "value": 0.10, "label": "10%" },
      { "value": 0.15, "label": "15%" },
      { "value": 0.20, "label": "20%" }
    ],
    "position_size": [
      { "value": "all", "label": "100% vốn còn lại" },
      { "value": "half", "label": "50% vốn còn lại" },
      { "value": "fixed", "amount": 10000000, "label": "Cố định 10tr/lệnh" }
    ],
    "fee": [
      { "value": "standard", "label": "Chuẩn (0.15% + 0.1%)" },
      { "value": "low", "label": "Thấp (0.10%)" }
    ]
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không phải premium và không phải admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Không có I/O nên không có chế độ suy giảm; endpoint không thể "thiếu dữ liệu". Ngoài giờ giao dịch trả y nguyên.

**curl**

~~~bash
curl -X GET 'http://localhost:8000/api/v1/backtest/catalog' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2c4e6a80-1b3d-4f57-9e8a-0c2d4f6b8a10'
~~~

**Ghi chú khi viết lại**

* **`label` bị GHI ĐÈ sau khi khởi tạo**: mọi factor có `label = displayName(factor.indicator)`, không phải chuỗi truyền vào constructor. Hệ quả: `close_above_ma50` và `close_below_ma50` đều có `label: "close"` (vì `"close"` không nằm trong map 38 chỉ báo → fallback về chính id); `obv_cross_buy`/`obv_cross_sell` đều là `"OBV"`; `uptrend_off` là `"MA50 > MA200"`. **`label` KHÔNG duy nhất.** Test `test_catalog_labels.py` khẳng định `label === displayName(indicator)` cho mọi factor — phải giữ.
* Field `to_dict()` đổi tên: `Factor.value` → JSON `default`; `Factor.minimum/maximum` → JSON `min`/`max`. Đừng đặt tên JSON là `value`/`minimum`.
* `default` có thể là **chuỗi tên field** (`"ma_50"`, `"obv_ma_20"`) cho so sánh field-vs-field. UI phải phân biệt số với chuỗi.
* `kind` của factor (`"bin"`/`"num"`) **khác** `INDICATOR_KIND` của chỉ báo (`"num"`/`"signal"`). Ví dụ `rsi_14_buy_mom` có `kind: "num"` nhưng `editable: false` (ngưỡng cross 50 cố định). Đừng nhập nhằng hai hệ danh mục này.
* `editable: false` → giá trị `value` mà client gửi trong `/backtest/run` bị **bỏ qua hoàn toàn** (test `test_non_editable_factor_ignores_value`: gửi `99.0` cho `rsi_14_buy_mom` vẫn resolve ra `50`).
* Thứ tự nhóm trong `factors.buy`/`factors.sell` = thứ tự **xuất hiện lần đầu** trong `CATALOG` → B1…B7 và S1…S7. Dùng cấu trúc giữ thứ tự chèn (array/Map), không phải object hash tùy tiện.
* `risk_presets.fee` **chỉ có** `standard` và `low`; giá trị `"none"` hợp lệ ở schema nhưng không được UI phơi ra.
* `risk_presets.position_size` chỉ có 3 lựa chọn, còn schema nhận 5 (`quarter`, `tenth` không có preset).

---

### POST /api/v1/backtest/run

> **Chạy backtest** — mô phỏng chiến lược trên một mã, trả KPI, đường equity (kèm benchmark VN-Index) và danh sách giao dịch.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) — **không** có limit riêng dù đây là endpoint nặng nhất |
| **Cache** | Redis key `bt:run:{md5(JSON.stringify(request, sortedKeys))}`, TTL **600s**; ngoài ra key giá `ta:ohlcv:{SYMBOL}:{start}:{end}`, TTL 1800s |
| **Nguồn dữ liệu** | provider ngoài **VCI (Vietcap)** → fallback **VND (VNDirect)**, qua `get_adjusted_ohlcv`; toàn bộ chỉ báo & mô phỏng tính tại chỗ bằng numpy |
| **Side-effect** | ghi 2 cache key Redis; ghi log warning nếu benchmark VN-Index fail. **Không** ghi DB |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface BacktestRunRequest {
  symbol: string;        // strip + upper
  start: string;         // "YYYY-MM-DD"
  end: string;           // "YYYY-MM-DD"
  capital?: number;      // default 100_000_000; > 0
  buy: StrategySide;     // bắt buộc, phải có >= 1 factor
  sell?: StrategySide;   // default rỗng = chỉ thoát bằng risk rule
  risk?: RiskInput;
}
~~~

~~~json
{
  "symbol": "FPT",
  "start": "2024-01-02",
  "end": "2026-08-17",
  "capital": 500000000,
  "buy": {
    "logic": "AND",
    "factors": [
      { "id": "rsi_14_oversold", "value": 32 },
      { "id": "macd_bull_cross" }
    ]
  },
  "sell": {
    "logic": "OR",
    "factors": [
      { "id": "rsi_14_overbought", "value": 72 },
      { "id": "death_cross" }
    ]
  },
  "risk": {
    "stop_loss": "atr",
    "stop_atr_mult": 2.0,
    "take_profit_pct": 0.15,
    "max_holding": 60,
    "position_size": "half",
    "fee": "standard"
  }
}
~~~

**Response 200**

~~~ts
interface BacktestRunResponse {
  meta: { symbol: string; start: string; end: string; n_sessions: number; capital: number };
  kpis: BacktestKpis;         // xem "Kiểu kết quả backtest"
  equity_curve: EquityPoint[];
  trades: TradeRow[];
}
~~~

~~~json
{
  "meta": {
    "symbol": "FPT",
    "start": "2024-01-02",
    "end": "2026-08-15",
    "n_sessions": 648,
    "capital": 500000000
  },
  "kpis": {
    "cagr": 0.2137,
    "sharpe": 1.084,
    "sharpe_ci": [0.412, 1.766],
    "max_drawdown": -0.1842,
    "dd_recovery_sessions": 47,
    "win_rate": 0.6,
    "n_trades": 10,
    "n_wins": 6,
    "avg_hold": 21.4,
    "net_return": 0.6019,
    "buy_hold_return": 0.4471,
    "n_sessions": 648
  },
  "equity_curve": [
    { "date": "2024-01-02", "strategy": 100.0, "buy_hold": 100.0, "vnindex": 100.0 },
    { "date": "2024-01-03", "strategy": 100.0, "buy_hold": 100.7519, "vnindex": 100.42 },
    { "date": "2026-08-15", "strategy": 160.1874, "buy_hold": 144.7135, "vnindex": 131.86 }
  ],
  "trades": [
    {
      "idx": 1,
      "entry_date": "2024-04-18",
      "entry_price": 96500.0,
      "exit_date": "2024-05-21",
      "exit_price": 110975.0,
      "hold": 23,
      "pnl_pct": 0.15,
      "trigger": "Chốt lời",
      "entry_trigger": "RSI 14 < 32.0 + MACD cắt lên Signal"
    },
    {
      "idx": 2,
      "entry_date": "2024-08-06",
      "entry_price": 121300.0,
      "exit_date": "2024-09-12",
      "exit_price": 128900.0,
      "hold": 26,
      "pnl_pct": 0.0627,
      "trigger": "RSI 14 > 72.0",
      "entry_trigger": "RSI 14 < 32.0 + MACD cắt lên Signal"
    },
    {
      "idx": 3,
      "entry_date": "2025-03-11",
      "entry_price": 134800.0,
      "exit_date": "2025-04-09",
      "exit_price": 122264.0,
      "hold": 20,
      "pnl_pct": -0.093,
      "trigger": "Cắt lỗ",
      "entry_trigger": "RSI 14 < 32.0 + MACD cắt lên Signal"
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `symbol` rỗng sau strip | `Value error, Thiếu mã cổ phiếu` (trong mảng ValidationError) |
| 422 | — | `start`/`end` không parse được bằng `Date.fromISO(v.slice(0,10))` | ValidationError của Pydantic |
| 422 | — | `capital <= 0` | `Value error, Vốn ban đầu phải > 0` |
| 422 | — | Thiếu `buy`, hoặc `logic` ngoài `AND`/`OR`, hoặc enum `risk` sai | mảng ValidationError |
| 400 | *(không có `code`)* | `factors[].id` không có trong catalog (`KeyError`) | `Không có factor: 'does_not_exist'` |
| 400 | *(không có `code`)* | `buy.factors` rỗng | `Tổ hợp phải có ít nhất 1 điều kiện` |
| 400 | *(không có `code`)* | Điều kiện tham chiếu field/toán tử không hợp lệ (`CombinationError`) | ví dụ `Chỉ số không hợp lệ: 'xxx'` / `Toán tử không hợp lệ: 'xxx'` / `'is_true' chỉ dùng cho chỉ số nhị phân, không phải 'rsi_14'` |
| 404 | *(không có `code`)* | Provider trả về nhưng không còn record hợp lệ nào (`ValueError`) | `Không có dữ liệu giá cho mã FPT` |
| 502 | *(không có `code`)* | Cả VCI và VND đều fail (`RuntimeError`) | `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không premium & không admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm**

* **Provider chính lỗi** → tự động sang VND; cả hai lỗi → 502 với message đếm số nguồn.
* **Cache giá còn sống** → dùng cache, không gọi provider (nên có thể trả 200 dù provider đang chết, trong 1800s).
* **Thiếu dữ liệu warmup**: các bar đầu có chỉ báo `NaN` → mọi điều kiện dựa vào chúng trả `false`. Nếu `stop_loss === "atr"` mà `atr_14[i]` NaN thì `stop = null` → vị thế **không có cắt lỗ**, âm thầm. Đây là suy giảm quan trọng nhất cần biết.
* **`start` sau bar cuối** hoặc không có phiên nào trong khoảng → `start_index >= n` → trả KPI rỗng (`_empty_kpis`, mọi số `null`), `equity_curve: []`, `trades: []`, và `meta.start`/`meta.end` fallback về `req.start`/`req.end`.
* **VN-Index fail** → `equity_curve` **không có** key `vnindex` (không phải `null`). Client phải render biểu đồ không benchmark.
* **Redis không khả dụng** → `cache_get_json`/`cache_set_json` fail-safe, chạy uncached, không lỗi.
* **Ngoài giờ giao dịch**: không ảnh hưởng — đây là dữ liệu ngày lịch sử.

**curl**

~~~bash
curl -X POST 'http://localhost:8000/api/v1/backtest/run' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e0f1a2b3-c4d5-4e67-8901-2a3b4c5d6e7f' \
  -d '{
    "symbol": "FPT",
    "start": "2024-01-02",
    "end": "2026-08-17",
    "capital": 500000000,
    "buy": { "logic": "AND", "factors": [{"id":"rsi_14_oversold","value":32},{"id":"macd_bull_cross"}] },
    "sell": { "logic": "OR", "factors": [{"id":"rsi_14_overbought","value":72},{"id":"death_cross"}] },
    "risk": { "stop_loss": "atr", "stop_atr_mult": 2.0, "take_profit_pct": 0.15, "max_holding": 60, "position_size": "half", "fee": "standard" }
  }'
~~~

**Ghi chú khi viết lại**

* **Thứ tự thực thi bắt buộc** (quyết định status code nào bật ra trước):
  1. Pydantic validate body → 422.
  2. `resolve_factor` cho **buy** trước → `KeyError` → 400. `validate_combination(buy)` → `CombinationError` → 400.
  3. `resolve_factor` cho **sell**, chỉ `validate_combination(sell)` **nếu `sell.conditions` không rỗng** (sell rỗng là hợp lệ, buy rỗng thì không).
  4. Build risk (map fee).
  5. Kiểm cache `bt:run:*` → trả sớm nếu hit.
  6. Fetch giá → 404 / 502.
  7. Tính chỉ báo, chạy engine, gắn VN-Index, ghi cache.
  * Điểm quan trọng: **validate factor xảy ra TRƯỚC khi fetch data**, nên request sai factor id không tốn round-trip provider và không thể trả 404.
* **Cache key** là `md5` của `JSON.stringify(request.model_dump(), sort_keys=True, default=str)`. Phải sinh **cùng một** key cho hai request tương đương nhưng thứ tự key JSON khác nhau → dùng canonical JSON (sort key đệ quy). Lưu ý `model_dump()` đã **áp default**, nên request bỏ trống `risk` và request gửi risk mặc định đầy đủ sẽ cùng key.
* **Chỉ ghi cache khi `kpis.n_sessions > 0`** — không cache kết quả rỗng, để lần sau có data thì tính lại.
* **`meta.start`/`meta.end` là ngày giao dịch THỰC TẾ** (`data.time[start_index]` và `data.time[-1]`), không phải tham số request. Chỉ khi không có phiên nào mới echo lại request.
* **KHÔNG có giới hạn số nến, KHÔNG có timeout, KHÔNG có giới hạn độ dài khoảng `start..end`** trong code. `start = "2000-01-01"` với `end` hôm nay sẽ fetch và tính hết. Sharpe CI chạy 500 vòng bootstrap trong Python thuần và OBV/EMA chạy vòng lặp từng bar — đây là điểm nóng CPU. Khi viết lại **nên** thêm giới hạn số bar và timeout, nhưng phải coi là thay đổi hành vi có chủ đích, kèm status code mới (đề xuất 400 với message tiếng Việt rõ ràng), chứ không âm thầm cắt dữ liệu.
* **`start > end`** không bị chặn. Kết quả tùy dữ liệu provider trả về; thường ra 0 phiên → KPI rỗng.
* `take_profit_pct === 0` bị coi như `null` (falsy check trong engine) — không tạo lệnh chốt lời ở giá vào.
* `pnl_pct` của trade **là biến động giá thuần**, chưa trừ phí; nhưng `net_return`/`equity_curve` **đã trừ** phí. Hai con số này không khớp nhau — đó là đúng như hiện tại, đừng "sửa".
* `win_rate` dựa trên `pnl_pct > 0` (giá thuần) nên một trade lãi 0.1% giá nhưng lỗ sau phí vẫn được đếm là **win**.
* Vị thế còn mở ở bar cuối **không** xuất hiện trong `trades` nhưng **có** trong `equity` (mark-to-market). Do đó `n_trades` có thể bằng 0 mà `net_return` khác 0.
* Đơn vị: mọi tỉ lệ (`cagr`, `net_return`, `win_rate`, `max_drawdown`, `pnl_pct`, `roc_20d`, `dist_*`, `stop_fixed_pct`, `take_profit_pct`) là **phân số**, không phải phần trăm — nhân 100 ở UI. `capital`, `position_fixed_amount`, giá là **VND**. `hold`, `max_holding`, `dd_recovery_sessions`, `n_sessions` là **số phiên giao dịch**, không phải ngày lịch.
* `equity_curve` dài bằng `n_sessions` (có thể vài nghìn điểm) và mỗi điểm là object 3–4 field. Payload có thể vài trăm KB; cân nhắc gzip.

---

### GET /api/v1/backtest/strategies

> **Liệt kê chiến lược đã lưu** — trả toàn bộ chiến lược của user hiện tại, mới cập nhật trước.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `backtest_strategies` |
| **Side-effect** | — |

**Path params** — —

**Query params** — — (không phân trang, không filter theo `symbol`)

**Request body** — —

**Response 200** — **mảng ở cấp cao nhất**, không bọc trong object.

~~~ts
type ListStrategiesResponse = BacktestStrategyResponse[];
~~~

~~~json
[
  {
    "id": "d4c3b2a1-9f8e-4d7c-6b5a-4938271605f4",
    "name": "Bắt đáy VCB",
    "symbol": "VCB",
    "config": {
      "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 28 }] },
      "sell": { "logic": "OR", "factors": [{ "id": "rsi_14_overbought", "value": 68 }] },
      "risk": { "stop_loss": "fixed", "stop_fixed_pct": 0.05, "take_profit_pct": 0.10, "max_holding": 30 }
    },
    "created_at": "2026-08-12T03:22:07.115000Z",
    "updated_at": "2026-08-17T02:14:39.880000Z"
  },
  {
    "id": "aa11bb22-cc33-4dd4-8ee5-ff6677889900",
    "name": "Thuận xu hướng chung",
    "symbol": null,
    "config": {
      "buy": { "logic": "AND", "factors": [{ "id": "ma_stack_bull" }, { "id": "macd_hist_buy", "value": 0 }] },
      "sell": { "logic": "OR", "factors": [{ "id": "close_below_ma50" }] },
      "risk": { "stop_loss": "atr", "stop_atr_mult": 3.0, "max_holding": 90 }
    },
    "created_at": "2026-07-30T08:01:55.402000Z",
    "updated_at": "2026-07-30T08:01:55.402000Z"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active === false` | `Tài khoản chưa được kích hoạt` |
| 403 | `FORBIDDEN` | Không premium & không admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Chưa có chiến lược nào trả `[]` với status **200**.

**curl**

~~~bash
curl -X GET 'http://localhost:8000/api/v1/backtest/strategies' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7a8b9c0d-1e2f-4304-8516-27384950a6b7'
~~~

**Ghi chú khi viết lại**

* Sắp xếp: `ORDER BY updated_at DESC`. Không có tie-break phụ — hai bản ghi cùng `updated_at` cho thứ tự không xác định.
* Filter `WHERE user_id = :currentUserId` — đây là **toàn bộ** cơ chế phân quyền cho nhóm CRUD này; không có bảng ACL, không có kiểm tra `role`.
* Response là mảng trần. Đừng bọc thành `{items, count}` như watchlist.
* `config` được trả **nguyên vẹn** như đã lưu, chưa từng được validate. Có thể chứa factor id đã bị xóa khỏi catalog → UI phải chịu được.

---

### POST /api/v1/backtest/strategies

> **Tạo chiến lược mới** — lưu một cấu hình buy/sell/risk dưới tên do user đặt; tên phải duy nhất trong phạm vi user.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `backtest_strategies` |
| **Side-effect** | INSERT `backtest_strategies` |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface BacktestStrategyCreate {
  name: string;                     // minLength 1, maxLength 120
  symbol?: string | null;           // upper hóa nếu truthy; null/"" -> lưu như-là
  config: Record<string, unknown>;  // BẮT BUỘC, object tự do, KHÔNG được validate
}
~~~

~~~json
{
  "name": "Bắt đáy VCB",
  "symbol": "vcb",
  "config": {
    "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 28 }] },
    "sell": { "logic": "OR", "factors": [{ "id": "rsi_14_overbought", "value": 68 }] },
    "risk": {
      "stop_loss": "fixed",
      "stop_atr_mult": 2.0,
      "stop_fixed_pct": 0.05,
      "take_profit_pct": 0.10,
      "max_holding": 30,
      "position_size": "half",
      "position_fixed_amount": 10000000,
      "fee": "standard"
    },
    "start": "2024-01-02",
    "end": "2026-08-17",
    "capital": 500000000
  }
}
~~~

**Response 200** — status thành công là **201 Created**, body `BacktestStrategyResponse`.

~~~json
{
  "id": "d4c3b2a1-9f8e-4d7c-6b5a-4938271605f4",
  "name": "Bắt đáy VCB",
  "symbol": "VCB",
  "config": {
    "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 28 }] },
    "sell": { "logic": "OR", "factors": [{ "id": "rsi_14_overbought", "value": 68 }] },
    "risk": {
      "stop_loss": "fixed",
      "stop_atr_mult": 2.0,
      "stop_fixed_pct": 0.05,
      "take_profit_pct": 0.10,
      "max_holding": 30,
      "position_size": "half",
      "position_fixed_amount": 10000000,
      "fee": "standard"
    },
    "start": "2024-01-02",
    "end": "2026-08-17",
    "capital": 500000000
  },
  "created_at": "2026-08-17T02:14:39.880000Z",
  "updated_at": "2026-08-17T02:14:39.880000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `name` rỗng hoặc > 120 ký tự; thiếu `config`; `config` không phải object | mảng ValidationError |
| 409 | *(không có `code`)* | User đã có chiến lược **cùng tên** (so sánh **chính xác, phân biệt hoa/thường**) | `Đã tồn tại chiến lược cùng tên` |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không premium & không admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Không có. `config` không được validate nên không có đường suy giảm về "config mặc định".

**curl**

~~~bash
curl -X POST 'http://localhost:8000/api/v1/backtest/strategies' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3d5f7091-2a4c-4b6e-8d0f-1a3c5e7b9d02' \
  -d '{
    "name": "Bắt đáy VCB",
    "symbol": "vcb",
    "config": {
      "buy": { "logic": "AND", "factors": [{"id":"rsi_14_oversold","value":28}] },
      "sell": { "logic": "OR", "factors": [{"id":"rsi_14_overbought","value":68}] },
      "risk": { "stop_loss": "fixed", "stop_fixed_pct": 0.05, "take_profit_pct": 0.10, "max_holding": 30, "position_size": "half", "fee": "standard" }
    }
  }'
~~~

**Ghi chú khi viết lại**

* **KHÔNG có giới hạn số chiến lược/user** trong code. Ràng buộc duy nhất là UNIQUE(`user_id`, `name`). Nếu muốn thêm quota, đây là thay đổi hành vi mới.
* **`config` hoàn toàn không được validate** — không kiểm factor id có tồn tại, không kiểm `logic`, không kiểm enum risk. Có thể lưu `{}`. Việc validate chỉ xảy ra khi user bấm "chạy" (`POST /backtest/run`). Đừng thêm validate ở đây nếu không muốn khóa các bản lưu nháp hiện có.
* Theo model docstring, `config` **nên** có hình dạng `{buy, sell, risk, symbol?, start?, end?, capital?}` — cùng shape mà `/run` nhận. Đây là **quy ước**, không phải ràng buộc kỹ thuật.
* Kiểm trùng tên bằng SELECT rồi INSERT (`get_by_name`), **không** dựa vào constraint. Hai request song song cùng tên có thể vỡ UNIQUE → 500. Khi viết lại, bắt unique-violation và map về 409 cùng message.
* So sánh tên là **exact match**: `"Bắt đáy VCB"` và `"bắt đáy vcb"` là hai tên khác nhau, cùng tồn tại được.
* `symbol` được upper hóa **chỉ khi truthy**: `null` → `null`; `""` → `""` (chuỗi rỗng được lưu, không thành `null`). Khi viết lại nên normalize `""` → `null` nhưng ghi rõ đây là thay đổi.
* Phải `refresh` sau INSERT để lấy `created_at`/`updated_at` do DB sinh.

---

### PUT /api/v1/backtest/strategies/{strategy_id}

> **Cập nhật chiến lược** — partial update `name`/`symbol`/`config` của một chiến lược thuộc user hiện tại.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `backtest_strategies` |
| **Side-effect** | UPDATE `backtest_strategies`; `updated_at` tự cập nhật |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `strategy_id` | `string` (UUID) | phải là UUID hợp lệ, sai định dạng → 422 | ID chiến lược |

**Query params** — —

**Request body**

~~~ts
interface BacktestStrategyUpdate {
  name?: string | null;                     // maxLength 120; null = KHÔNG đổi
  symbol?: string | null;                   // null = KHÔNG đổi (không phải "xóa")
  config?: Record<string, unknown> | null;  // null = KHÔNG đổi
}
~~~

~~~json
{ "name": "Bắt đáy VCB v2", "config": { "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 25 }] }, "sell": { "logic": "OR", "factors": [{ "id": "death_cross" }] }, "risk": { "stop_loss": "atr", "stop_atr_mult": 1.5, "max_holding": 45 } } }
~~~

**Response 200** — `BacktestStrategyResponse` sau khi cập nhật.

~~~json
{
  "id": "d4c3b2a1-9f8e-4d7c-6b5a-4938271605f4",
  "name": "Bắt đáy VCB v2",
  "symbol": "VCB",
  "config": {
    "buy": { "logic": "AND", "factors": [{ "id": "rsi_14_oversold", "value": 25 }] },
    "sell": { "logic": "OR", "factors": [{ "id": "death_cross" }] },
    "risk": { "stop_loss": "atr", "stop_atr_mult": 1.5, "max_holding": 45 }
  },
  "created_at": "2026-08-12T03:22:07.115000Z",
  "updated_at": "2026-08-17T09:47:11.326000Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `strategy_id` không phải UUID; `name` > 120 ký tự | mảng ValidationError |
| 404 | *(không có `code`)* | Không có chiến lược với `(id, user_id)` này — **bao gồm cả khi chiến lược tồn tại nhưng thuộc user khác** | `Không tìm thấy chiến lược` |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không premium & không admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — Body rỗng `{}` là hợp lệ: không field nào được ghi, nhưng `flush` + `refresh` vẫn chạy → response trả bản ghi hiện tại. `updated_at` có thể **không** đổi vì ORM không thấy thuộc tính nào bị dirty.

**curl**

~~~bash
curl -X PUT 'http://localhost:8000/api/v1/backtest/strategies/d4c3b2a1-9f8e-4d7c-6b5a-4938271605f4' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8c0e2a46-5b79-4d1f-a3c5-e7091b3d5f70' \
  -d '{"name":"Bắt đáy VCB v2","config":{"buy":{"logic":"AND","factors":[{"id":"rsi_14_oversold","value":25}]},"sell":{"logic":"OR","factors":[{"id":"death_cross"}]},"risk":{"stop_loss":"atr","stop_atr_mult":1.5,"max_holding":45}}}'
~~~

**Ghi chú khi viết lại**

* **Kiểm quyền sở hữu nằm trong WHERE của SELECT**: `WHERE id = :strategyId AND user_id = :currentUserId`. Không tìm thấy → 404 (không phải 403). Đây là hành vi đúng để không tiết lộ sự tồn tại của bản ghi user khác — **giữ nguyên 404**, đừng đổi thành 403.
* **`null` nghĩa là "không đổi", không phải "xóa"**: `{"symbol": null}` **không** xóa được `symbol`. Hiện tại **không có cách nào** đưa `symbol` về `null` qua endpoint này. Nếu cần, phải phân biệt "field vắng mặt" với "field = null" (JSON-Patch hoặc sentinel) — đó là tính năng mới.
* Cạm bẫy chuỗi rỗng: `symbol = ""` → `body.symbol ? upper : body.symbol` cho `""`, rồi `if (symbol !== null) item.symbol = symbol` → **ghi chuỗi rỗng vào DB**. Cần chặn hoặc normalize.
* **KHÔNG kiểm trùng tên khi update**: đổi `name` sang tên đã có của cùng user sẽ vỡ UNIQUE(`user_id`,`name`) và nổi thành 500, chứ **không** trả 409 như POST. Đây là lỗi thật của backend gốc — khi viết lại nên bắt unique-violation và trả 409 `Đã tồn tại chiến lược cùng tên` cho nhất quán, ghi rõ trong changelog.
* `config` thay thế **toàn bộ**, không merge sâu.
* Phải `refresh` sau UPDATE để lấy `updated_at` mới.

---

### DELETE /api/v1/backtest/strategies/{strategy_id}

> **Xóa chiến lược** — xóa bản ghi thuộc user hiện tại; luôn trả 204.

| | |
|---|---|
| **Quyền** | Bearer + Premium (admin bypass) |
| **Rate limit** | mặc định (60/phút/IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB `backtest_strategies` |
| **Side-effect** | DELETE `backtest_strategies` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `strategy_id` | `string` (UUID) | phải là UUID hợp lệ, sai định dạng → 422 | ID chiến lược cần xóa |

**Query params** — —

**Request body** — —

**Response 200** — Không có body. Status thành công là **204 No Content**.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | `strategy_id` không phải UUID | mảng ValidationError |
| 401 | `UNAUTHORIZED` | Thiếu / sai token | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | Không premium & không admin | `Yêu cầu gói Premium đang hoạt động` |

**Fallback / suy giảm** — **Idempotent và không có 404.** Xóa ID không tồn tại → 204. Xóa ID **thuộc user khác** → 204 nhưng **không xóa gì** (WHERE có `user_id`). Repository trả `boolean` nhưng endpoint bỏ qua.

**curl**

~~~bash
curl -X DELETE 'http://localhost:8000/api/v1/backtest/strategies/d4c3b2a1-9f8e-4d7c-6b5a-4938271605f4' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4f6081a2-b3c4-45d6-87e8-9f0a1b2c3d4e'
~~~

**Ghi chú khi viết lại**

* Bất đối xứng với `PUT` cùng resource: PUT trả 404 khi không tìm thấy, DELETE trả 204. **Giữ nguyên** — test `test_strategies_crud` chỉ khẳng định 204 cho happy path, nhưng frontend đang dựa vào "xóa luôn thành công".
* `user_id` trong WHERE là chốt phân quyền duy nhất; không có kiểm tra riêng nào khác. Đừng viết `DELETE WHERE id = ?` rồi kiểm sở hữu ở tầng service — mất tính nguyên tử.
* Xóa chiến lược **không** invalidate cache `bt:run:*` (cache theo config-hash, không theo strategy id). Đúng như hiện tại.

---

## Ghi chú tổng hợp khi viết lại

#### 1. Cảnh báo port engine numpy → TypeScript (mức nghiêm trọng cao)

Toàn bộ engine TA + backtest được viết bằng numpy. Port sang TypeScript **bắt buộc phải có golden test**: chạy backend Python trên một tập bar cố định (dump ra JSON fixture), lưu `frame` 38 chỉ báo + `kpis` + `equity_curve` + `trades` làm baseline, rồi so sánh bản TS với sai số tuyệt đối `<= 1e-9` cho chỉ báo và **bằng chính xác** cho các trường đã round.

Các điểm lệch tiềm ẩn cụ thể:

| Vấn đề | numpy (nguồn) | Bẫy trong JS |
|---|---|---|
| `NaN` lan truyền | `np.nan` lan qua mọi phép toán; `NaN > x` → `False` (kèm `errstate(invalid="ignore")` để tắt warning) | `NaN > x` trong JS cũng `false` — **đúng ngẫu nhiên**. Nhưng `Math.max(NaN, 1)` → `NaN` còn `Math.max` trên mảng có `undefined` → `NaN`. Phải dùng `NaN` tường minh, **không dùng `null`/`undefined`** làm sentinel warmup |
| Chia cho 0 | `1/0` → `Infinity`, `0/0` → `NaN`, có warning bị tắt | JS: `1/0` → `Infinity`, `0/0` → `NaN` — giống. Nhưng `rsi` xử lý riêng `avg_loss === 0 && !isNaN(avg_gain)` → `100`; **phải copy nhánh này**, không dựa vào `Infinity` |
| `std(ddof=1)` | Cài bằng `E[x²] - E[x]²` scale `n/(n-1)`, kèm guard `var < 0 → 0` | Công thức này **kém ổn định số học**. Nếu port bằng vòng lặp hai lượt (chính xác hơn) sẽ **lệch** ở chữ số cuối → `bb_width`, `vol_zscore`, `sharpe` khác. **Phải port đúng công thức one-pass + guard**, không "cải tiến" |
| Percentile | `np.percentile(..., 15.0)`, nội suy **linear** (mặc định numpy) trên cửa sổ 120 | JS không có sẵn. Phải cài đúng: sort cửa sổ, `pos = (n-1)*q/100`, nội suy tuyến tính giữa `floor(pos)` và `ceil(pos)`. Đừng dùng "nearest rank" |
| Rolling mean có NaN | `_roll_mean`: cửa sổ chứa **bất kỳ** NaN → NaN (cài bằng cumsum + đếm NaN) | Cumsum trên chuỗi dài tích lũy sai số float. Với 1000+ bar, cumsum và vòng lặp trực tiếp cho kết quả khác ở ~1e-12. Golden test phải cho phép `1e-9`, và **cài đúng cách cumsum** nếu muốn khớp chặt |
| Rolling max/min | `sliding_window_view(...).max(axis=1)` — NaN trong cửa sổ **lan ra** NaN | `Math.max(...window)` với NaN cũng ra NaN — giống. Nhưng spread operator vỡ với cửa sổ 252 × nhiều nghìn bar (stack overflow); dùng vòng lặp |
| EMA carry-forward | `x[t]` NaN → `out[t] = out[t-1]` (không reset) | Dễ bị port thành "NaN thì out cũng NaN". Phải carry-forward |
| Bootstrap Sharpe CI | `np.random.default_rng(42)` — **PCG64**, 500 lần `rng.choice(r, size=n, replace=True)` | **Không có PRNG nào trong JS sinh cùng dãy số.** `sharpe_ci` sẽ **không thể** khớp bit-for-bit. Hai lựa chọn: (a) cài lại PCG64 + `choice` của numpy (khả thi nhưng tốn công), hoặc (b) chấp nhận `sharpe_ci` lệch và **loại nó khỏi golden test**, ghi rõ trong docs. `sharpe` (không CI) thì khớp được |
| `argmin`/`argmax` khi tie | numpy trả **index đầu tiên** | `Array.prototype.indexOf(Math.min(...))` cũng đầu tiên — nhưng nếu dùng `reduce` với `<=` sẽ ra index cuối. Dùng `<` để giữ "first wins" |
| Làm tròn | `round(x, 4)` của Python là **banker's rounding** (half-to-even) trên float | `x.toFixed(4)`/`Math.round(x*1e4)/1e4` là half-away-from-zero → lệch ở đúng biên `.00005`. Với dữ liệu thực xác suất thấp nhưng golden test sẽ bắt được. Cài helper `roundHalfEven(x, digits)` |
| `float64` | numpy `float64` = IEEE-754 double | JS `number` cũng double — **an toàn**, miễn không dùng `Float32Array` |
| OBV | Vòng lặp tuần tự, `obv[0] = 0`, không NaN warmup | Đừng vector hóa bằng cumsum của `sign(diff)*volume` mà bỏ mất `obv[0] = 0` và trường hợp `close` bằng nhau |

Ngoài ra: `_shift(x, k)` dịch **lùi** (giá trị tại `t` là `x[t-k]`), điền NaN ở đầu, và trả toàn NaN nếu `k >= len(x)` hoặc `k < 0`. `_atr` set `TR[0] = NaN` tường minh vì bar 0 không có prev close.

#### 2. Chuẩn hóa `symbol`

Cả ba nhóm đều **upper hóa** `symbol`, nhưng ở các chỗ khác nhau:

* Watchlist: upper trong endpoint (`body.symbol.upper()`) **và** trong repository (`symbol.upper()` ở mọi query). Message lỗi dùng bản upper.
* Chart drawings: upper **chỉ trong repository** + khi build response fallback.
* Backtest strategies: upper trong endpoint, chỉ khi truthy.
* Backtest run: upper qua Pydantic validator (kèm `strip()`).

Khi viết lại, dùng **một** helper `normalizeSymbol(s: string): string` (trim + toUpperCase) và gọi ở biên vào, nhưng **giữ nguyên** quy tắc "chuỗi rỗng của strategy.symbol không thành null".

#### 3. Hai hình dạng lỗi phải giữ nguyên

Đừng nhất thể hóa. `/watchlist/*` và `/chart-drawings/*` trả `{detail, code}`; `/backtest/*` trả `{detail}` **không có `code`**. Nếu muốn thêm `code` cho backtest, đó là thay đổi contract — cần thống nhất với frontend trước.

#### 4. Bảng đối chiếu status code thành công / không tìm thấy

| Endpoint | Success | Không tìm thấy |
|---|---|---|
| `DELETE /watchlist/{symbol}` | 204 | **404** `Mã X không có trong danh sách` |
| `GET /watchlist/check/{symbol}` | 200 | 200 với `is_watched: false` |
| `GET /chart-drawings/{symbol}` | 200 | 200 với `state: null` |
| `DELETE /chart-drawings/{symbol}` | 204 | **204** (idempotent) |
| `PUT /backtest/strategies/{id}` | 200 | **404** `Không tìm thấy chiến lược` |
| `DELETE /backtest/strategies/{id}` | 204 | **204** (idempotent) |
| `POST /watchlist` | 201 | — |
| `POST /backtest/strategies` | 201 | — |

#### 5. Điểm cần bàn trước khi sửa (hành vi hiện tại là "sai nhưng đang được dựa vào")

1. Docstring/OpenAPI của chart-drawings ghi `getLineToolsState()`/`LineToolsAndGroupsState` — **sai**; payload thật là `widget.save()`. Sửa **mô tả**, đừng sửa hành vi.
2. Backend chart-drawings không có guard chống `{}`/payload lạ; guard đang ở client. Thêm guard server-side là cải tiến nhưng phải phối hợp với client.
3. `PUT /backtest/strategies/{id}` không kiểm trùng tên → 500 thay vì 409.
4. `POST /watchlist` và `POST /backtest/strategies` kiểm trùng bằng SELECT-then-INSERT → race gây 500 thay vì 409.
5. `POST /backtest/run` không có giới hạn số nến / timeout.
6. `PUT /watchlist/reorder` bỏ qua âm thầm mã không tồn tại và có thể để lại `sort_order` trùng.
7. Không có cách nào set `strategy.symbol` về `null` qua `PUT`.

#### 6. Danh sách message tiếng Việt nguyên văn (copy đúng, không dịch lại)

`Yêu cầu xác thực` · `Tài khoản chưa được kích hoạt` · `Yêu cầu gói Premium đang hoạt động` · `Mã {SYM} không tồn tại` · `Mã {SYM} không phải là cổ phiếu` · `Danh sách yêu thích tối đa 50 mã` · `Mã {SYM} đã có trong danh sách` · `Mã {SYM} không có trong danh sách` · `Đã tồn tại chiến lược cùng tên` · `Không tìm thấy chiến lược` · `Thiếu mã cổ phiếu` · `Vốn ban đầu phải > 0` · `Không có factor: {id!r}` · `Không có dữ liệu giá cho mã {SYM}` · `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` · `Chỉ số không hợp lệ: {name!r}` · `Toán tử không hợp lệ: {op!r}` · `Liên kết phải là AND/OR, nhận {join!r}` · `'is_true' chỉ dùng cho chỉ số nhị phân, không phải {name!r}` · `Điều kiện {indicator} {op} thiếu ngưỡng` · `Trường so sánh không hợp lệ: {value!r}` · `Không thể dùng cross trên chỉ số nhị phân {name!r}` · `Logic phải là AND/OR, nhận {logic!r}` · `Tổ hợp phải có ít nhất 1 điều kiện`

Nhãn trigger của trade: `Cắt lỗ` · `Chốt lời` · `Hết thời gian giữ` · `Tín hiệu bán`.

Lưu ý `{x!r}` là `repr()` của Python: chuỗi được bọc **dấu nháy đơn** (`'rsi_14'`). Khi viết lại TypeScript phải sinh đúng `'rsi_14'` (nháy đơn), không phải `"rsi_14"`, nếu muốn message khớp nguyên văn.
