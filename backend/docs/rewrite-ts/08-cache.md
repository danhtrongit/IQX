# Tầng cache

Chương này đặc tả toàn bộ cơ chế cache của backend IQX: một `TTLCache` in-memory (thực tế **không được nối dây** vào endpoint nào) và một tầng Redis chia sẻ dùng cho 74 endpoint market-data cộng các payload/kết quả AI. Đọc chương này để port đúng cách sinh cache key, TTL theo nhóm dữ liệu, hành vi fail-open khi Redis chết, và những nguy cơ (stampede, dữ liệu cũ tràn sang phiên mới) mà bản Python hiện **chưa** xử lý.

Nguồn đọc: `app/services/cache/redis_cache.py`, `app/services/cache/decorator.py`, `app/services/market_data/cache.py`, `app/core/config.py`, `app/main.py`, `app/api/v1/endpoints/market_data.py`, `app/api/v1/endpoints/market_global.py`, `app/api/v1/endpoints/health.py`, `app/services/ai/payloads.py`, `app/services/ai/analysis_service.py`, `app/services/telegram/linking.py`, `app/services/realtime/{bridge,demand,pubsub,topics}.py`, `app/services/market_data/sources/msn.py`, `app/services/bctc_dashboard/peer_median.py`, `app/models/sector_median_cache.py`, `tests/test_redis_cache.py`, `tests/test_hardening.py`.

---

## 1. Bản đồ tầng cache

Hệ thống có **5 loại cache khác nhau**, không phải 2. Bảng dưới là bức tranh đầy đủ để bản TS không bỏ sót:

| # | Tầng | Vị trí | Phạm vi | Ai dùng | Trạng thái |
|---|---|---|---|---|---|
| 1 | `TTLCache` in-memory (LRU + TTL) | `app/services/market_data/cache.py` | 1 process | **Không ai** — chỉ `get_cache()` nội bộ + `tests/test_hardening.py` | **DEAD CODE** |
| 2 | Redis JSON cache qua decorator `@redis_cached` | `app/services/cache/{redis_cache,decorator}.py` | Toàn cluster | 74 endpoint `GET /api/v1/market-data/...` | Đang chạy (khi `REDIS_ENABLED=true`) |
| 3 | Redis JSON cache gọi trực tiếp ở tầng service | `app/services/ai/payloads.py`, `app/services/ai/analysis_service.py` | Toàn cluster | Payload AI + kết quả phân tích AI | Đang chạy |
| 4 | Cache lưu trong Postgres | `app/services/bctc_dashboard/peer_median.py` + bảng `sector_median_cache` | Toàn cluster, bền vững | Peer-median BCTC dashboard | Đang chạy, **có chống stampede** |
| 5 | Memo in-process (`lru_cache`, biến module + `time.monotonic()`) | `app/core/config.py`, `app/services/ai/prompt_loader.py`, `app/services/bctc/mapping_loader.py`, `app/services/ai/portfolio_manager/prompts.py`, `app/services/virtual_trading/price_resolver.py`, `app/services/realtime/dnse_auth.py` | 1 process | Config, prompt, mapping, tập symbol, token DNSE | Đang chạy |

Ngoài ra Redis còn được dùng cho **các mục đích không phải cache** (leader election, pub/sub, ref-count) — xem §11. Cả hai loại **dùng chung một client duy nhất** từ `redis_cache.get_redis_client()`, nên `REDIS_ENABLED=false` làm tê liệt cả cache lẫn realtime lẫn Telegram link-token.

---

## 2. Tầng 1 — `TTLCache` in-memory

File: `app/services/market_data/cache.py`.

### 2.1 Thuật toán

- Cấu trúc: `OrderedDict[str, tuple[float, Any]]` — value là `(expires_at, value)` với `expires_at = time.monotonic() + ttl_seconds`.
- **Chính sách đuổi (eviction): LRU theo lần truy cập**. `get()` hit → `move_to_end(key)`; `set()` với key đã có → `move_to_end(key)` trước khi ghi. Khi `len > max_size` → `popitem(last=False)` (đuổi phần tử ở đầu = ít dùng gần nhất), lặp cho tới khi `len <= max_size`.
- **TTL theo từng key**, truyền vào lúc `set()` — **không có TTL theo nhóm** ở bên trong class. Ý tưởng "TTL theo nhóm" chỉ nằm ở docstring (`reference` dài / `history` trung bình / `realtime` ngắn) và ở 3 biến env `MARKET_DATA_CACHE_TTL_*`, nhưng **không có code nào đọc 3 biến đó** và **không có code nào gọi `set()`**.
- `get()` khi đã hết hạn: xoá key rồi trả `None` (lazy expiry).
- **Không thread-safe** (docstring nói rõ). Thiết kế cho single-process, single event loop.
- `max_size` lấy từ `MARKET_DATA_CACHE_MAX_SIZE` (default **1000**) tại lần gọi `get_cache()` đầu tiên (singleton module-level, lazy init).

### 2.2 Hợp đồng (type TS tương đương)

```ts
export interface TtlCache {
  /** Trả value nếu còn sống; hit thì đẩy key về cuối (LRU). Hết hạn → xoá + null. */
  get<T = unknown>(key: string): T | null;
  /** Ghi với TTL (giây, cho phép số thực). Vượt maxSize → đuổi phần tử ít dùng nhất. */
  set(key: string, value: unknown, ttlSeconds: number): void;
  /** Xoá đúng 1 key (no-op nếu không tồn tại). */
  invalidate(key: string): void;
  /** Xoá sạch. */
  clear(): void;
  /** Xoá mọi entry đã hết hạn, trả về số entry đã xoá. Không có ai gọi định kỳ. */
  cleanup(): number;
  /** Số entry CÒN SỐNG (đếm bằng cách lọc expiry, KHÁC với số entry đang lưu). */
  readonly size: number;
  readonly maxSize: number;
}
```

Lưu ý hành vi: `size` **không** bằng số phần tử trong store — nó đếm lại các entry chưa hết hạn mỗi lần đọc (O(n)). `cleanup()` tồn tại nhưng **không có job nào gọi** → nếu tầng này được nối dây thì entry hết hạn chỉ bị dọn khi `get()` chạm vào hoặc khi bị LRU đuổi.

### 2.3 Khuyến nghị cho bản TS

Vì đây là dead code, có **2 lựa chọn**, phải chọn tường minh và ghi vào changelog:

- **(A) Bỏ hẳn** tầng 1 + 4 env `MARKET_DATA_CACHE_ENABLED`, `MARKET_DATA_CACHE_TTL_{REFERENCE,REALTIME,HISTORY}_SECONDS` (không ai đọc), giữ `MARKET_DATA_CACHE_MAX_SIZE` chỉ khi giữ tầng 1. Đây là lựa chọn **được khuyến nghị**: đơn giản, không mất hành vi nào.
- **(B) Port nguyên trạng** (khuyến nghị nếu muốn giữ parity 100% về mặt cấu hình): implement `TtlCache` như trên và giữ đủ 5 env, nhưng vẫn **không nối vào endpoint** — parity chính xác là "có class, không có người dùng".

Không được tự ý "sửa cho đúng ý đồ" bằng cách nối `TTLCache` vào các endpoint market-data: làm thế sẽ tạo ra tầng cache thứ hai chồng lên Redis với TTL khác (10s/300s/3600s), sinh ra sai lệch dữ liệu giữa các worker.

---

## 3. Tầng 2 — Redis client: cấu hình và lifecycle

File: `app/services/cache/redis_cache.py`. Client là **biến module `_redis`**, khởi tạo một lần trong lifespan.

### 3.1 Cấu hình client

```
aioredis.from_url(
  settings.REDIS_URL,
  decode_responses=True,
  socket_connect_timeout=5,
  socket_timeout=3,
  retry_on_timeout=True,
)
```

| Tham số | Giá trị | Ý nghĩa cho bản TS |
|---|---|---|
| DSN | `REDIS_URL`, default `"redis://localhost:6379/0"` | ioredis nhận thẳng URL này (kể cả `/0` = db index) |
| `decode_responses` | `true` | Trả `string`, không phải `Buffer`. ioredis mặc định đã trả string → không cần cờ |
| `socket_connect_timeout` | `5` giây | ioredis: `connectTimeout: 5000` |
| `socket_timeout` | `3` giây | ioredis: `commandTimeout: 3000` |
| `retry_on_timeout` | `true` | ioredis: bật retry (`retryStrategy`) khi command timeout |

### 3.2 `startup()` — gọi trong lifespan của app

Thứ tự trong `app/main.py` (lifespan):

1. `setup_logging()`
2. `market_data.http.startup()` — HTTP client dùng chung
3. **`redis_cache.startup()`** ← tầng cache
4. `jobs.startup()` — APScheduler
5. `alerts.startup()`
6. `realtime.startup()`

Hành vi `startup()`:

1. Đọc `settings.REDIS_ENABLED`. Nếu `false` → log info `"Redis cache disabled (REDIS_ENABLED=false)"`, `_redis` giữ `None`, **return ngay** (không import cả thư viện redis).
2. Nếu `true` → tạo client theo §3.1 rồi **`await _redis.ping()`** để xác thực kết nối.
3. Nếu bất kỳ bước nào ném exception (kể cả `ping` thất bại) → log warning `"Redis cache unavailable, running uncached"` (có traceback) và **đặt lại `_redis = None`**.

> **Bẫy vận hành cực quan trọng:** `startup()` chỉ chạy **một lần**. Nếu Redis chết ở thời điểm boot, `_redis` là `None` **suốt đời process** — không có retry, không có lazy reconnect, không có health-loop nào bật lại. Cache chỉ trở lại sau khi **restart backend**. Ngược lại, nếu Redis chết *sau* khi boot thành công, object client vẫn tồn tại và connection pool của redis-py tự reconnect ở từng command; mỗi lần lỗi chỉ log warning và trả cache-miss.
>
> Bản TS **nên** sửa điểm này (lazy re-init hoặc để ioredis tự retry vô hạn với `lazyConnect`), và ghi vào changelog vì đây là thay đổi hành vi.

### 3.3 `shutdown()` — gọi khi app tắt

Thứ tự shutdown (ngược lại): `realtime.shutdown()` → `jobs.shutdown()` → **`redis_cache.shutdown()`** → `http.shutdown()`.

Hành vi: nếu `_redis` không `None` → `await _redis.aclose()` trong `try/except` (lỗi chỉ log warning `"Error closing Redis connection"`), rồi `_redis = None`. Log info `"Redis cache connection closed"` **luôn được ghi**, kể cả khi Redis vốn đã tắt.

### 3.4 `health_check()` — dùng bởi `GET /api/v1/health`

Trả về **union 3 giá trị**:

```ts
type RedisHealth = 'healthy' | 'disabled' | 'unhealthy';
```

Thứ tự kiểm tra (đúng thứ tự này, quan trọng):

1. `_redis is None` **và** `REDIS_ENABLED=false` → `'disabled'`
2. `_redis is None` **và** `REDIS_ENABLED=true` → `'unhealthy'` (nghĩa là: bật cờ nhưng kết nối lúc boot đã thất bại)
3. `_redis` tồn tại → `await ping()`; thành công → `'healthy'`, ném exception → `'unhealthy'`

Trường `redis` trong `HealthResponse` chỉ mang tính thông tin: **status code của `/health` không phụ thuộc Redis**. `is_healthy = (db_status == "healthy")`; Redis `unhealthy` vẫn trả **200**. Chỉ database chết mới trả **503**.

### 3.5 Chính sách lỗi: FAIL-OPEN toàn diện

Không có bất kỳ đường nào mà Redis làm request thất bại:

| Tình huống | Hành vi |
|---|---|
| `REDIS_ENABLED=false` | Decorator gọi thẳng hàm gốc; `cache_get_json` trả `None`; `cache_set_json` no-op; `cache_delete_pattern` trả `0` |
| Redis chết lúc boot | Như trên (vì `_redis = None`) |
| Redis chết khi đang chạy — GET lỗi | Log warning `"Redis GET failed for key=%s"`, trả `None` → coi như cache miss → gọi upstream |
| Redis chết khi đang chạy — SET lỗi | Log warning `"Redis SET failed for key=%s"`, bỏ qua |
| JSON trong Redis bị hỏng | `json.loads` ném → bắt trong cùng `except` của GET → trả `None` (miss) |
| Value không serialize được | `json.dumps(..., default=str)` gần như luôn thành công; nếu vẫn ném → bắt trong `except` của SET |
| `cache_delete_pattern` lỗi | Log warning, trả `0` |

**Kết luận cho bản TS: fail-open là hợp đồng bắt buộc.** Không được để lỗi Redis rò ra thành 500. Mọi hàm cache phải bọc `try/catch` và trả giá trị "coi như không có cache".

---

## 4. Hợp đồng API của module `redis_cache`

```ts
/** Khởi tạo pool. Gọi 1 lần trong bootstrap, SAU khi HTTP client sẵn sàng. */
export function startup(): Promise<void>;

/** Đóng pool. Gọi trong shutdown, TRƯỚC khi đóng HTTP client. */
export function shutdown(): Promise<void>;

/** Client dùng chung; null khi Redis tắt hoặc kết nối boot thất bại. */
export function getRedisClient(): Redis | null;

/** 'healthy' | 'disabled' | 'unhealthy' — xem §3.4. */
export function healthCheck(): Promise<RedisHealth>;

/** Sinh key ổn định: `iqx:{prefix}:{normalisedPath}:{paramHash}`. Xem §5. */
export function buildCacheKey(
  prefix: string,
  path: string,
  params?: Record<string, unknown> | null,
): string;

/** GET + JSON.parse. Trả null khi miss, khi Redis tắt/chết, hoặc khi JSON hỏng. */
export function cacheGetJson<T = unknown>(key: string): Promise<T | null>;

/** SET với TTL (giây). Serialize bằng JSON, datetime → string, KHÔNG escape non-ASCII. */
export function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;

/** SCAN MATCH pattern (COUNT 100) rồi DEL từng key. Trả số key đã xoá; 0 khi lỗi/tắt. */
export function cacheDeletePattern(pattern: string): Promise<number>;
```

Chi tiết serialize khi ghi (`cache_set_json`): `json.dumps(value, default=str, ensure_ascii=False)`.

- `default=str` → mọi object không JSON-native (`datetime`, `Decimal`, `UUID`, `date`) được `str()` hoá. **Cảnh báo:** `str(datetime)` trong Python dùng dấu **cách** (`"2026-08-17 03:12:00+00:00"`), khác `isoformat()` dùng chữ **T**. Nếu value chứa `datetime` thô thì bản HIT và bản MISS **khác nhau về format**. Trong thực tế đường decorator đã gọi `model_dump(mode="json")` trước (→ ISO có `T`), nên rủi ro chỉ tồn tại ở các endpoint trả `dict` thô có chứa `datetime` — hiện các endpoint `overview/*` trả `{"data": ..., "source_url": ...}` không chứa `datetime`, nên không lộ ra.
- `ensure_ascii=False` → tiếng Việt lưu nguyên ký tự UTF-8, không escape `\uXXXX`. `JSON.stringify` của JS cũng vậy → tương đương.

Chi tiết `cache_delete_pattern`: dùng `scan_iter(match=pattern, count=100)` rồi `DELETE` **từng key một**. Đây là N+1 round-trip và **SCAN quét toàn keyspace** kể cả khi pattern là một key chính xác (xem §12 — đó chính là cách nó đang bị dùng).

---

## 5. Cách sinh cache key — `build_cache_key`

Định dạng: **`iqx:{prefix}:{normalised_path}:{param_hash}`**

### 5.1 Chuẩn hoá path

1. `path.strip("/")` rồi `split("/")`.
2. Duyệt tuần tự, giữ một cờ `in_symbol_context`:
   - Nếu segment thuộc tập **`{"quotes", "company", "trading", "fundamentals", "tickers"}`** → giữ nguyên segment, bật `in_symbol_context = True`.
   - Nếu đang `in_symbol_context` **và** segment `isalnum()` **và** `len(segment) <= 10` → **uppercase** segment, tắt cờ.
   - Ngược lại → giữ nguyên, tắt cờ.
3. Join lại bằng `/`.

Ví dụ (đã có test bảo hộ trong `tests/test_redis_cache.py`):

| Path vào | `normalised_path` |
|---|---|
| `/api/v1/market-data/quotes/vcb/ohlcv` | `api/v1/market-data/quotes/VCB/ohlcv` |
| `/api/v1/market-data/quotes/VCB/ohlcv` | `api/v1/market-data/quotes/VCB/ohlcv` (trùng key với dòng trên) |
| `/api/v1/market-data/reference/symbols` | `api/v1/market-data/reference/symbols` |
| `/api/v1/market-data/news/ai/tickers/fpt` | `api/v1/market-data/news/ai/tickers/FPT` |
| `/api/v1/market-data/global/crypto/btcusdt/ohlc` | `api/v1/market-data/global/crypto/btcusdt/ohlc` — **KHÔNG** uppercase (`crypto` không có trong tập) |
| `/api/v1/market-data/fundamentals/vcb/balance_sheet` | `api/v1/market-data/fundamentals/VCB/balance_sheet` (`balance_sheet` không đổi vì cờ đã tắt) |
| `/api/v1/market-data/macro/commodities/gold` | không đổi (`commodities` không có trong tập) |

> **Hệ quả cần biết:** chỉ 5 vị trí path được chuẩn hoá chữ hoa. Với `global/crypto/{symbol}/…`, `reference/groups/{group}/symbols`, `macro/commodities/{code}`, `macro/economy/{indicator}`, `funds/{fund_id}`, `news/ai/detail/{slug}` — client gửi chữ thường và chữ hoa sẽ tạo **2 key khác nhau** (phân mảnh cache, gấp đôi lượt gọi provider). Đây là hành vi hiện tại, port nguyên trạng để giữ parity; nếu muốn sửa thì mở rộng tập `_symbol_path_positions` và ghi changelog.

### 5.2 Chuẩn hoá query params

1. Params **luôn là toàn bộ query string** của request: `dict(request.query_params)` — decorator **không** cho phép chọn lọc param nào tham gia key.
2. Loại bỏ param có giá trị `None` hoặc `str(v) == ""`.
3. Ép `str(v)` cho mọi value.
4. **Sort theo tên param** (chỉ theo key, không theo value).
5. Nối `"&".join(f"{k}={v}")`.
6. `param_hash = md5(param_str).hexdigest()[:12]` (`usedforsecurity=False`).
7. Nếu **không có param nào sống sót** (hoặc `params` là `None`/rỗng) → `param_hash = "_"`.

Bảo đảm đã được test: cùng tập param nhưng khác thứ tự → **cùng key**; param rỗng `{"source": ""}` → **cùng key với không param**; `{"symbol":"VCB"}` vs `{"symbol":"FPT"}` → **khác key**.

> **Bẫy khi port sang Node:** trong Python `dict(request.query_params)` với query lặp (`?symbols=A&symbols=B`) chỉ giữ **giá trị cuối** (`B`). Trong Express, `req.query.symbols` là **array** `['A','B']` → `String(['A','B'])` = `"A,B"` → **key khác Python**. Phải chủ động lấy giá trị cuối để giữ parity. Ngoài ra `md5` bị cắt còn 12 hex ký tự (48 bit) — xác suất trùng thấp nhưng khác 0; giữ nguyên độ dài để key tương thích khi migrate.

### 5.3 Prefix

`prefix` mặc định của decorator là **`"api:v1"`** → key thực tế bắt đầu bằng `iqx:api:v1:`. **Không có endpoint nào truyền `prefix` khác** trong 74 lượt dùng.

---

## 6. Decorator `@redis_cached` — hợp đồng và luồng thực thi

File: `app/services/cache/decorator.py`.

### 6.1 Signature

```ts
interface RedisCachedOptions {
  /** Tên attribute TTL trên object Settings. Default: 'REDIS_DEFAULT_TTL_SECONDS'. */
  ttlSetting?: string;
  /** Prefix key sau 'iqx:'. Default: 'api:v1'. */
  prefix?: string;
  /** true → cache cả response rỗng (list/dict rỗng). Default: false. */
  cacheEmpty?: boolean;
}
```

### 6.2 Thứ tự thực thi (đúng thứ tự này)

1. `settings = get_settings()`.
2. **Nếu `REDIS_ENABLED` là `false` → gọi thẳng hàm gốc và return.** Không sinh key, không log.
3. Lấy `Request`: ưu tiên `kwargs["request"]`, nếu không có thì quét `args` tìm instance `Request`.
4. **Nếu không tìm được `Request` → gọi thẳng hàm gốc và return** (không thể sinh key). Đây là lý do **mọi endpoint được cache đều phải khai báo `request: Request`** làm tham số đầu tiên.
5. `path = request.url.path` (đường dẫn đầy đủ, gồm `/api/v1/market-data/...`), `params = dict(request.query_params)`.
6. `cache_key = build_cache_key(prefix, path, params)`.
7. `ttl = getattr(settings, ttl_setting, settings.REDIS_DEFAULT_TTL_SECONDS)` — **gõ sai tên setting thì âm thầm rơi về 300s**, không báo lỗi.
8. `cached = await cache_get_json(cache_key)`.
   - Nếu **không `None`** → log debug `"Cache HIT"`, return **`JSONResponse(content=cached, headers={"X-Cache": "HIT"})`**.
9. Cache miss → log debug `"Cache MISS"`, **`result = await func(...)`** (nằm **ngoài** `try` — xem 6.4).
10. Vào `try`, quyết định có ghi cache không:
    - `result` là `JSONResponse`: chỉ khi `200 <= status_code < 300` → `body = json.loads(result.body)`.
    - `result` có `model_dump` (Pydantic model) → `body = result.model_dump(mode="json")`.
    - `result` là `dict` → `body = result`.
    - **Còn lại (list thô, `Response` không phải JSON, `StreamingResponse`, str…) → `return result` ngay, không cache.**
11. Nếu `cache_empty` **hoặc** `_has_data(body)` → `await cache_set_json(cache_key, body, ttl)`.
12. Mọi exception trong bước 10–11 → log warning `"Cache SET failed for %s"`, bỏ qua.
13. `return result` (bản gốc, **không phải** `JSONResponse` — xem 6.5).

### 6.3 `_has_data(body)` — điều kiện "có dữ liệu"

```ts
function hasData(body: unknown): boolean {
  if (isPlainObject(body)) {
    const data = (body as Record<string, unknown>)['data'];
    if (data === undefined || data === null) {
      return Object.keys(body as object).length > 0;   // dict không rỗng → coi là CÓ dữ liệu
    }
    if (Array.isArray(data)) return data.length !== 0;
    if (isPlainObject(data)) return Object.keys(data as object).length !== 0;
    return true;                                       // data là số/chuỗi/bool → CÓ dữ liệu
  }
  return body !== null && body !== undefined;
}
```

Hệ quả cần nhớ:

- `{"data": [], "meta": {...}}` → **KHÔNG** cache (trừ khi `cache_empty=True`).
- `{"data": null, "meta": {...}}` → **CÓ** cache (vì `data is None` → rơi vào nhánh `bool(body)`, mà dict không rỗng → `True`). Đây là hành vi dễ gây bất ngờ: response "không có dữ liệu" kiểu `null` **bị cache**.
- `{"data": 0}` / `{"data": false}` → **CÓ** cache (không phải list/dict nên `True`).
- Response không phải dict (ví dụ `body` là chuỗi) → cache nếu khác `None`.

### 6.4 Lỗi không bao giờ bị cache

`result = await func(...)` nằm **ngoài** `try/except`. Nghĩa là khi endpoint `raise HTTPException(422/502/503)`, exception lan ra ngoài wrapper **trước khi** tới bất kỳ nhánh ghi cache → **không có response lỗi nào được ghi vào Redis**. Nhánh kiểm `200 <= status_code < 300` chỉ dùng cho trường hợp endpoint **trả về** `JSONResponse` với status lỗi thay vì raise.

Với các endpoint market-data thực tế: `422` (enum không hợp lệ), `502` (upstream shape sai / tất cả nguồn fail), `503` (upstream lỗi) đều được **raise** → đều không bị cache. Đúng như mong đợi.

### 6.5 Sai lệch HIT vs MISS (phải giữ hay phải sửa — quyết định tường minh)

| Khía cạnh | Cache HIT | Cache MISS |
|---|---|---|
| Loại object trả | `JSONResponse` dựng tay | Pydantic model / `dict` do FastAPI serialize |
| Header `X-Cache` | **`HIT`** | **Không có header nào** |
| `response_model` validate | **Bị bỏ qua hoàn toàn** (FastAPI không validate `Response`) | Được áp dụng |
| Nội dung | Đúng bằng những gì đã ghi (`model_dump(mode="json")` hoặc dict thô) | Kết quả serialize của FastAPI |
| Status code | Luôn `200` | Theo endpoint |

**`X-Cache` không được `expose_headers` trong CORS** (`app/main.py` chỉ set `allow_origins/allow_credentials/allow_methods/allow_headers`) → **browser không đọc được header này**; chỉ hữu ích khi debug bằng curl/server-side. Bản TS nếu muốn frontend đọc được thì phải thêm `exposedHeaders: ['X-Cache']` (thay đổi hành vi → ghi changelog).

Khuyến nghị bản TS: phát **cả hai** `X-Cache: HIT` và `X-Cache: MISS` để quan sát tỉ lệ hit, và đảm bảo đường HIT bỏ qua serializer giống Python (tránh double-transform).

### 6.6 Một chi tiết Python quan trọng khi port

Trong Python, thứ tự decorator là:

```
@router.get(...)          ← ngoài
@redis_cached(...)        ← trong
async def get_x(request: Request, ...)
```

`functools.wraps` set `__wrapped__`, và `inspect.signature` mặc định **đi theo `__wrapped__`** → FastAPI vẫn thấy signature gốc (đủ `Query`, `Path`, `Annotated`) dù nó đang bọc `wrapper`. Bản NestJS **không có vấn đề này** vì interceptor không thay signature — nhưng phải nhớ rằng interceptor cần truy cập `request.path` + `request.query`, tương đương với việc Python bắt buộc có `request: Request`.

---

## 7. Bảng TTL đầy đủ

Tất cả đọc từ `app/core/config.py` (dòng 76–80 và 97–108).

### 7.1 Nhóm Redis (`REDIS_*`)

| Env | Default (giây) | Nhóm dữ liệu | Số endpoint | Có trong `.env.example`? |
|---|---|---|---|---|
| `REDIS_URL` | `"redis://localhost:6379/0"` | — (DSN) | — | Có (dòng 55) |
| `REDIS_ENABLED` | **`false`** | — (công tắc) | — | Có (dòng 56) |
| `REDIS_DEFAULT_TTL_SECONDS` | **300** (5 phút) | Mặc định + OHLCV, trading history/summary, sector, gold/fx, world-index, forex, crypto OHLC | **20** | Có (dòng 57) |
| `REDIS_TTL_REALTIME_SECONDS` | **15** | Intraday, price-depth, ranking, crypto ticker/depth | **5** | Có (dòng 58) |
| `REDIS_TTL_REFERENCE_SECONDS` | **3600** (1 giờ) | Symbols, industries, indices, groups, commodities list, news sources, search, event-codes, screening criteria/presets | **10** | Có (dòng 59) |
| `REDIS_TTL_OVERVIEW_SECONDS` | **30** | Toàn bộ `overview/*` (liquidity, breadth, heatmap, foreign, proprietary, valuation, market-index, maintenance…) | **16** | Có (dòng 60) |
| `REDIS_TTL_MACRO_SECONDS` | **900** (15 phút) | Company overview/details/shareholders/officers/subsidiaries, fundamentals, BCTC, events calendar, macro economy, funds | **13** | Có (dòng 61) |
| `REDIS_TTL_NEWS_SECONDS` | **300** | `news/latest`, `company/{symbol}/news`, toàn bộ `news/ai/*` | **7** | Có (dòng 62) |
| `REDIS_TTL_SHEETS_SECONDS` | **600** (10 phút) | 3 endpoint Google Sheets (`sheets/vnd`, `sheets/tpcp`, `sheets/tygia`) | **3** | **Không** |
| `REDIS_TTL_AI_DASHBOARD_SECONDS` | **60** | Payload AI dashboard (không qua decorator) | 0 (tầng service) | **Không** |
| `REDIS_TTL_AI_INDUSTRY_SECONDS` | **600** | Payload AI theo ngành (`icb_code`) | 0 (tầng service) | **Không** |
| `REDIS_TTL_AI_ANALYSIS_SECONDS` | **1800** (30 phút) | **DEAD CONFIG** — chỉ còn trong docstring `analysis_service.py`; TTL thật do `_get_analysis_ttl()` tính (xem §9.2) | 0 | **Không** |

Tổng endpoint dùng decorator: **20 + 5 + 10 + 16 + 13 + 7 + 3 = 74** (67 ở `market_data.py`, 7 ở `market_global.py`).

### 7.2 Nhóm in-memory (`MARKET_DATA_CACHE_*`)

| Env | Default | Thực tế được đọc ở đâu | Ghi chú |
|---|---|---|---|
| `MARKET_DATA_CACHE_ENABLED` | `true` | **Không ai đọc** | DEAD CONFIG |
| `MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS` | `3600` | **Không ai đọc** | DEAD CONFIG |
| `MARKET_DATA_CACHE_TTL_REALTIME_SECONDS` | `10` | **Không ai đọc** | DEAD CONFIG |
| `MARKET_DATA_CACHE_TTL_HISTORY_SECONDS` | `300` | **Không ai đọc** | DEAD CONFIG |
| `MARKET_DATA_CACHE_MAX_SIZE` | `1000` | `market_data/cache.py` → `TTLCache(max_size=...)` | Chỉ dùng để dựng singleton của tầng dead code |

Không biến nào trong nhóm này có trong `.env.example`.

### 7.3 TTL hard-code (không có env)

| Giá trị | Nơi dùng | Ý nghĩa |
|---|---|---|
| `600` | `app/services/ai/payloads.py` → `build_bctc_ai_payload` | TTL payload BCTC cho AI (hard-code, **không** đọc env) |
| `7 * 24 * 3600` = `604800` | `analysis_service._BCTC_ANALYSIS_TTL` | Kết quả phân tích BCTC cache 1 tuần |
| tới 15:00 VN, sàn tối thiểu `3600` | `analysis_service._ttl_until_end_of_session()` | TTL kết quả AI dashboard/industry/insight |
| `600` | `telegram/linking.py` → `_LINK_TTL` | Token liên kết Telegram (10 phút) |
| `21600` (6 giờ) | `market_data/sources/msn.py` → `_APIKEY_TTL` | apikey MSN |
| `REALTIME_LEADER_LOCK_TTL` = `30` | `realtime/bridge.py` | TTL khoá leader (env riêng, không thuộc nhóm cache) |
| `300.0` | `virtual_trading/price_resolver.py` → `_SYMBOL_CACHE_TTL` | Tập symbol hợp lệ, cache in-process 5 phút, có `asyncio.Lock` + double-check |

---

## 8. Endpoint áp dụng cache, theo nhóm TTL

Tất cả đều là `GET`, router prefix `/market-data` được include dưới `/api/v1` → path đầy đủ `/api/v1/market-data/...`. `**cache_empty**` = decorator truyền `cache_empty=True`.

### `REDIS_DEFAULT_TTL_SECONDS` (300s) — 20 endpoint

| Path | Handler |
|---|---|
| `/quotes/{symbol}/ohlcv` | `get_ohlcv` |
| `/trading/{symbol}/foreign-trade` | `get_foreign_trade` |
| `/trading/{symbol}/insider-deals` | `get_insider_deals` |
| `/trading/{symbol}/history` | `get_trading_history` |
| `/trading/{symbol}/summary` | `get_trading_summary` |
| `/trading/{symbol}/foreign-trade/summary` | `get_foreign_trade_summary` |
| `/trading/{symbol}/supply-demand` | `get_supply_demand_history` |
| `/trading/{symbol}/supply-demand/summary` | `get_supply_demand_summary` |
| `/trading/{symbol}/proprietary` | `get_proprietary_history` |
| `/trading/{symbol}/proprietary/summary` | `get_proprietary_summary` |
| `/company/{symbol}/price-chart` | `get_company_price_chart` |
| `/macro/commodities/{code}` | `get_commodity_price` |
| `/sectors/trading-dates` | `get_sector_trading_dates` |
| `/sectors/ranking` | `get_sector_ranking` |
| `/sectors/information` | `get_sector_information` |
| `/macro/gold` | `get_gold_prices` |
| `/macro/fx` | `get_exchange_rates` |
| `/global/world-index` | `get_world_index` |
| `/global/forex` | `get_global_forex` |
| `/global/crypto/{symbol}/ohlc` | `get_crypto_ohlc` |

### `REDIS_TTL_REALTIME_SECONDS` (15s) — 5 endpoint

| Path | Handler | |
|---|---|---|
| `/quotes/{symbol}/intraday` | `get_intraday` | **cache_empty** |
| `/quotes/{symbol}/price-depth` | `get_price_depth` | **cache_empty** |
| `/insights/ranking/{kind}` | `get_ranking` | |
| `/global/crypto/{symbol}/ticker` | `get_crypto_ticker` | |
| `/global/crypto/{symbol}/depth` | `get_crypto_depth` | **cache_empty** |

### `REDIS_TTL_REFERENCE_SECONDS` (3600s) — 10 endpoint

| Path | Handler |
|---|---|
| `/reference/symbols` | `list_symbols` |
| `/reference/industries` | `list_industries` |
| `/reference/indices` | `list_indices` |
| `/reference/groups/{group}/symbols` | `list_group_symbols` |
| `/macro/commodities` | `list_commodities` |
| `/news/sources` | `list_news_sources` |
| `/reference/search` | `get_search_bar` |
| `/reference/event-codes` | `get_event_codes` |
| `/screening/criteria` | `get_screening_criteria` |
| `/screening/presets` | `get_screening_presets` |

> Chú ý: `/reference/symbols/search` (`search_symbols_db`, đọc từ DB) **KHÔNG** được cache — dễ nhầm với `/reference/search`.

### `REDIS_TTL_OVERVIEW_SECONDS` (30s) — 16 endpoint

| Path | Handler |
|---|---|
| `/overview/liquidity` | `get_liquidity` |
| `/overview/index-impact` | `get_index_impact` |
| `/overview/foreign` | `get_foreign` |
| `/overview/foreign/top` | `get_foreign_top` |
| `/overview/proprietary` | `get_proprietary` |
| `/overview/proprietary/top` | `get_proprietary_top` |
| `/overview/allocation` | `get_allocation` |
| `/overview/sectors/allocation` | `get_sectors_allocation` |
| `/overview/valuation` | `get_valuation` |
| `/overview/breadth` | `get_breadth` |
| `/overview/heatmap` | `get_heatmap` |
| `/overview/heatmap/index` | `get_heatmap_index` |
| `/overview/sectors/detail` | `get_sector_detail` |
| `/overview/stock-strength` | `get_stock_strength` |
| `/overview/market-index` | `get_market_index` |
| `/overview/maintenance` | `get_maintenance` |

### `REDIS_TTL_MACRO_SECONDS` (900s) — 13 endpoint

| Path | Handler | |
|---|---|---|
| `/company/{symbol}/overview` | `get_company_overview` | |
| `/company/{symbol}/shareholders` | `get_shareholders` | |
| `/company/{symbol}/officers` | `get_officers` | |
| `/company/{symbol}/subsidiaries` | `get_subsidiaries` | |
| `/company/{symbol}/details` | `get_company_details` | |
| `/fundamentals/{symbol}/{report_type}` | `get_financial_report` | |
| `/bctc/{symbol}` | `get_bctc_dashboard` | |
| `/bctc-dashboard/{symbol}` | `get_bctc_storytelling_dashboard` | |
| `/events/calendar` | `get_events_calendar` | |
| `/macro/economy/{indicator}` | `get_macro_data` | **cache_empty** |
| `/funds` | `list_funds` | |
| `/funds/{fund_id}` | `get_fund_details` | |
| `/funds/{fund_id}/nav` | `get_fund_nav` | |

### `REDIS_TTL_NEWS_SECONDS` (300s) — 7 endpoint

| Path | Handler | |
|---|---|---|
| `/company/{symbol}/news` | `get_company_news` | **cache_empty** |
| `/news/latest` | `get_latest_news` | **cache_empty** |
| `/news/ai` | `get_ai_news` | |
| `/news/ai/detail/{slug}` | `get_ai_news_detail` | |
| `/news/ai/audio/{news_id}` | `get_ai_news_audio` | |
| `/news/ai/catalogs` | `get_ai_news_catalogs` | |
| `/news/ai/tickers/{symbol}` | `get_ai_ticker_view` | |

### `REDIS_TTL_SHEETS_SECONDS` (600s) — 3 endpoint

| Path | Handler |
|---|---|
| `/sheets/vnd` | `get_sheets_vnd` |
| `/sheets/tpcp` | `get_sheets_tpcp` |
| `/sheets/tygia` | `get_sheets_tygia` |

**Tổng: 74 endpoint.** Tất cả đều **public, không có dependency xác thực** — không endpoint nào trong `market_data.py`/`market_global.py` dùng `CurrentUser` hay guard premium. Vì key **không chứa user id**, nếu bản TS thêm cache cho endpoint có phân quyền thì **bắt buộc** phải đưa user/role vào key, nếu không sẽ rò dữ liệu giữa các user.

---

## 9. Cache ở tầng service (không qua decorator)

### 9.1 Payload AI — `app/services/ai/payloads.py`

Ba builder tự đọc/ghi Redis, mỗi lời gọi bọc `try/except` riêng (`_cache_get` / `_cache_set` — lỗi chỉ log ở mức `debug`, không bao giờ ném):

| Hàm | Cache key | TTL | Nguồn TTL |
|---|---|---|---|
| `build_dashboard_payload(language)` | `iqx:ai:payload:dashboard:{language}` | 60 | `REDIS_TTL_AI_DASHBOARD_SECONDS`, có `try/except` fallback hard-code `60` |
| `build_industry_payload(icb_code, language)` | `iqx:ai:payload:industry:{icb_code}:{language}` | 600 | `REDIS_TTL_AI_INDUSTRY_SECONDS`, fallback hard-code `600` |
| `build_industry_payload_batch(icb_codes, language)` | **cùng key** `iqx:ai:payload:industry:{code}:{language}` cho từng code | 600 | như trên |
| `build_bctc_ai_payload(symbol, term_type, language)` | `iqx:ai:payload:bctc:{SYMBOL}:{term_type}:{language}` | **600 hard-code** | không đọc env |
| `build_insight_payload(symbol, language)` | **KHÔNG cache** | — | — |

Chi tiết cần giữ:

- `build_industry_payload_batch` kiểm cache **từng code một** (vòng lặp `_cache_get` tuần tự), gom các code miss, fetch **nguồn dùng chung một lần** (`sectors_allocation`, `sector_information`, `sector_ranking`, `stock_strength`, `market_index`, `foreign_top`) rồi fetch `sector_detail` 3 khung thời gian cho từng code song song, cuối cùng ghi cache **từng payload** riêng. Batch và single **chia sẻ cùng namespace key** → gọi batch làm nóng cache cho single và ngược lại.
- `symbol` được `.upper()` trước khi vào key BCTC; `language` **không** được chuẩn hoá (`"vi"` vs `"VI"` → 2 key khác nhau).
- Payload build theo mô hình **fail-soft**: mỗi nguồn chạy qua `_safe_fetch` + `asyncio.gather(return_exceptions=True)`; nguồn nào chết thì field đó là `null`, payload vẫn được **cache** (kể cả khi thiếu nửa dữ liệu). Đây là nguy cơ thật: một payload thiếu dữ liệu bị đóng băng 60s/600s.

### 9.2 Kết quả phân tích AI — `app/services/ai/analysis_service.py`

Key: `iqx:ai:analysis:{analysis_type}:{identifier}:{language}`

| Loại | `analysis_type` | `identifier` | Điều kiện coi là HIT |
|---|---|---|---|
| Dashboard | `dashboard` | `"all"` (hằng số, **không** phải language) | `cached && "analysis" in cached` |
| Ngành | `industry` | `str(icb_code)` | `cached && "analysis" in cached` |
| Insight cổ phiếu | `insight` | `symbol.upper()` | `cached && "layers" in cached` |
| BCTC | `bctc` | `f"{SYMBOL}:{term_type}"` | `cached && "analysis" in cached` |

TTL do `_get_analysis_ttl(analysis_type)` quyết định — **không đọc `REDIS_TTL_AI_ANALYSIS_SECONDS`**:

```ts
function getAnalysisTtl(analysisType: string): number {
  if (analysisType === 'bctc') return 7 * 24 * 3600;   // 604800 — BCTC chỉ đổi theo quý/năm
  return ttlUntilEndOfSession();
}

/** Số giây tới 15:00 giờ Việt Nam (Asia/Ho_Chi_Minh). Đã qua 15:00 → 15:00 ngày kế. Sàn tối thiểu 3600. */
function ttlUntilEndOfSession(): number {
  const now = nowInTz('Asia/Ho_Chi_Minh');
  let end = setTime(now, 15, 0, 0, 0);
  if (now >= end) end = addDays(end, 1);
  return Math.max(Math.floor((end.getTime() - now.getTime()) / 1000), 3600);
}
```

Hành vi cần chú ý:

- Sàn `3600` khiến TTL **vượt quá mốc 15:00** khi request đến sau 14:00. Ví dụ 14:30 → còn 1800s tới 15:00 nhưng TTL = 3600 → phân tích cũ sống tới 15:30.
- Sau 15:00, TTL ≈ tới 15:00 **ngày kế** → phân tích sinh lúc 15:01 hôm nay còn hiệu lực suốt buổi sáng phiên hôm sau (≈24 giờ). Đây là "dữ liệu cũ tràn vào phiên mới" đã được cài sẵn trong thiết kế.
- Hàm **không biết cuối tuần / ngày lễ** — thứ Sáu 15:01 sẽ cache tới thứ Bảy 15:00 (vô hại) nhưng logic không có concept "phiên giao dịch tiếp theo".
- `analyze_dashboard`/`analyze_industry` khi HIT + `include_payload=True` vẫn **build lại payload** (payload đó có cache riêng 60s/600s) rồi gắn vào `cached["payload"]`. Kết quả cache **không** chứa payload (ghi chú trong code: "keep cache small").
- Ghi cache dùng `_cache_set_analysis` với `try/except` → lỗi log warning, không ném.

### 9.3 Insight lưu DB (không phải cache Redis)

`analyze_insight` mở session DB, gọi `load_prev_insight(db, symbol, today)` để lấy insight phiên trước và `save_insight(...)` để lưu. Đây là **lịch sử nghiệp vụ**, không phải cache — không được TTL hoá hay xoá cùng cache. Chi tiết ở chương AI/CSDL.

---

## 10. Danh sách mẫu key Redis thực tế (đầy đủ)

Toàn bộ prefix/pattern tìm thấy trong source (không có key nào khác):

| Mẫu key | Kiểu Redis | TTL | Sinh ở đâu | Mục đích |
|---|---|---|---|---|
| `iqx:api:v1:{normalised_path}:{md5_12}` | string (JSON) | theo bảng §7.1 | `redis_cache.build_cache_key` qua `@redis_cached` | Cache response 74 endpoint market-data |
| `iqx:ai:payload:dashboard:{language}` | string (JSON) | 60 | `payloads.build_dashboard_payload` | Payload thô cho prompt dashboard |
| `iqx:ai:payload:industry:{icb_code}:{language}` | string (JSON) | 600 | `payloads.build_industry_payload` + `..._batch` | Payload thô cho prompt ngành |
| `iqx:ai:payload:bctc:{SYMBOL}:{term_type}:{language}` | string (JSON) | 600 (hard-code) | `payloads.build_bctc_ai_payload` | Payload KPI BCTC cho prompt |
| `iqx:ai:analysis:dashboard:all:{language}` | string (JSON) | tới 15:00 VN, min 3600 | `analysis_service` | Kết quả AI dashboard |
| `iqx:ai:analysis:industry:{icb_code}:{language}` | string (JSON) | tới 15:00 VN, min 3600 | `analysis_service` | Kết quả AI ngành |
| `iqx:ai:analysis:insight:{SYMBOL}:{language}` | string (JSON) | tới 15:00 VN, min 3600 | `analysis_service` | Kết quả AI insight cổ phiếu (v2, có `layers`) |
| `iqx:ai:analysis:bctc:{SYMBOL}:{term_type}:{language}` | string (JSON) | 604800 | `analysis_service` | Kết quả AI phân tích BCTC |
| `tg_link:{token}` | string (JSON của `str(uuid)`) | 600 | `telegram/linking.mint_link_token` | Token deep-link Telegram, dùng 1 lần |
| `mkt:msn:apikey` | string (plain, **không** JSON) | 21600 | `market_data/sources/msn.resolve_apikey` | apikey MSN ngắn hạn |
| `realtime:leader` | string (`_WORKER_ID`) | `REALTIME_LEADER_LOCK_TTL` = 30 | `realtime/bridge` (`SET NX EX`) | Leader election cầu nối DNSE |
| `realtime:demand` | **hash**, field `{CHANNEL}:{SYMBOL}` (vd `tick:FPT`), value int | không TTL | `realtime/demand` (`HINCRBY`/`HDEL`) | Ref-count nhu cầu symbol xuyên worker |
| `rt:tick:{SYMBOL}` | **pub/sub channel** | — | `realtime/topics.redis_channel` | Phát tick đã normalize |
| `rt:ob:{SYMBOL}` | pub/sub channel | — | như trên | Order book |
| `rt:ohlc:{SYMBOL}` | pub/sub channel | — | như trên | Nến |
| `rt:index:{SYMBOL}` | pub/sub channel | — | như trên | Chỉ số |
| `rt:other:{SYMBOL}` | pub/sub channel | — | như trên | Fallback khi `kind` không khớp 4 loại trên |

**Chỉ 8 mẫu đầu dùng prefix `iqx:`.** `tg_link:`, `mkt:`, `realtime:`, `rt:` **không** có prefix chung → nếu Redis dùng chung với hệ khác, bản TS nên gom hết vào một namespace (thay đổi hành vi → ghi changelog, và cần migrate/flush).

---

## 11. Consumer Redis không phải cache

Cần biết vì chúng **dùng chung client** với tầng cache:

1. **`realtime/bridge.py` — leader election.** `SET realtime:leader {worker_id} NX EX 30`; gia hạn theo kiểu compare-and-extend (`GET` rồi `EXPIRE`, **không atomic** — có race lý thuyết); release chỉ khi `GET == worker_id` rồi `DELETE`. `get_redis_client() is None` → `_try_acquire_leader` trả `false` → **không worker nào làm leader** → bridge không chạy.
2. **`realtime/demand.py` — ref-count.** `HINCRBY realtime:demand "{channel}:{SYMBOL}" ±1`, `HDEL` khi về `<= 0`; `add` dùng pipeline không transaction, `remove` gọi lần lượt. Không TTL → **hash này có thể rò field** nếu worker chết giữa lúc tăng (có hàm reset gọi `DELETE` toàn hash).
3. **`realtime/pubsub.py` — pub/sub.** `PUBLISH channel json.dumps(payload, default=str, ensure_ascii=False)`; subscribe không có channel → return sớm.
4. **`market_data/sources/msn.py` — apikey.** `resolve_apikey(redis)` nhận client **qua tham số** (endpoint `market_global.py` truyền `get_redis_client()`); `redis is None` → luôn resolve lại từ upstream. Đọc/ghi đều bọc `try/except` chỉ log `debug`. Value lưu **plain string**, không JSON → nếu bản TS dùng cùng helper JSON thì phải giữ đúng dạng plain.
5. **`telegram/linking.py` — token một lần.** Xem §12.

`REDIS_ENABLED=false` làm tê liệt: cache decorator, cache AI, realtime bridge (kể cả khi `REALTIME_ENABLED=true`), và Telegram account linking (token không lưu được → `resolve_link_token` luôn `None` → không ai link được tài khoản). Trong bản TS nên **cảnh báo rõ ràng ở boot** khi `REALTIME_ENABLED=true` hoặc `TELEGRAM_BOT_TOKEN` có giá trị mà `REDIS_ENABLED=false`.

---

## 12. Invalidation — chủ động xoá key

Kết quả grep toàn repo: **chỉ có đúng MỘT chỗ chủ động xoá key cache.**

| Nơi | Lệnh | Mục đích |
|---|---|---|
| `app/services/telegram/linking.py:41` (`resolve_link_token`) | `await cache_delete_pattern(f"tg_link:{token}")` | Tiêu thụ token deep-link (one-time use) |

Ngoài ra:

- `realtime/demand.py` có `DELETE realtime:demand` (reset toàn hash) và `HDEL` field — không phải invalidate cache.
- `realtime/bridge.py` có `DELETE realtime:leader` khi release leader.
- `ai/prompt_loader.clear_cache()` → `load_prompt.cache_clear()` (lru_cache in-process, dùng cho test).
- `realtime/dnse_auth.reset_cache()` → đặt `_cached = None` (in-process).
- `cap7/service.py:303` → `_cham_miss.clear()` (dict in-process, có comment "a cache, not a record").

**Không có gì invalidate cache market-data hay cache AI.** Hệ quả:

- **Không có cách nào ép làm mới** một endpoint đang cache ngoài việc **chờ TTL hết** hoặc **`FLUSHDB`/`DEL` bằng tay từ redis-cli**.
- Không có endpoint admin kiểu `POST /admin/cache/purge`.
- Không có invalidation khi seed lại symbol, khi job nền ghi dữ liệu mới, hay khi admin sửa cấu hình.
- Job nền cũng **không warm cache** — mọi key sinh ra hoàn toàn theo nhịp request người dùng.

`cache_delete_pattern` đang bị dùng **sai công cụ**: pattern truyền vào là một key chính xác, nhưng hàm vẫn `SCAN MATCH` toàn keyspace rồi `DEL` từng key. Với keyspace lớn, mỗi lần link Telegram sẽ tốn nhiều vòng SCAN. Bản TS nên:

- Thêm `cacheDelete(key)` dùng `DEL` trực tiếp và cho `resolveLinkToken` dùng nó (tốt hơn nữa: `GETDEL` để atomic one-time-use);
- Giữ `cacheDeletePattern` cho invalidation theo prefix, dùng `SCAN` + `UNLINK` theo lô (không xoá từng key).

---

## 13. Cache lưu trong Postgres — `sector_median_cache`

Đây là tầng cache **duy nhất trong hệ thống có chống stampede đúng cách**, đáng học và phải port nguyên vẹn.

- Bảng: `sector_median_cache` (`app/models/sector_median_cache.py`), unique `(icb_lv2, asof_date)` — constraint `uq_sector_median_icb_asof`. Cột: `icb_lv2` `String(100)` (index), `asof_date` `Date` (index), `medians` `JSON` (Postgres dùng JSONB trong migration), `peer_count` `Integer` default 0, `computed_at` `DateTime(timezone=True)` server default `now()`, cộng `UUIDMixin`.
- Luồng `get_sector_medians(db, icb_lv2, asof, top_k=20)`:
  1. `_read_cache` → có row thì trả `{...allNull, ...stored}` (luôn phơi đủ union 8 metric key).
  2. Miss **và** dialect là `postgresql` → `SELECT pg_advisory_xact_lock(:k)` với `k = int64(sha256(f"{icb_lv2}|{asof.isoformat()}")[:8], signed)`, rồi **đọc lại cache** (double-check) — chỉ một request thực sự compute.
  3. Compute: fetch peer top-K theo market cap (`_SCREEN_PAGE_SIZE=100`, `_SCREEN_MAX_PAGES=15`), fetch ratio từng peer dưới `asyncio.Semaphore(5)` + jitter, lấy `statistics.median`. `< _MIN_PEERS = 3` peer có dữ liệu → trả toàn bộ `None`, **không raise**.
  4. `_upsert_cache` chạy trong **SAVEPOINT** (`begin_nested`) để nếu đụng race insert thì chỉ rollback row cache, **không** rollback transaction của caller; lỗi chỉ log warning.
- Ghi chú lịch sử trong code: **tuyệt đối không dùng lock cấp session** (`pg_try_advisory_lock`) — loại lock đó từng rò qua pool asyncpg và làm hỏng production 8 ngày. Chỉ dùng `pg_advisory_xact_lock` (tự nhả khi transaction kết thúc).

Bản TS: giữ nguyên bảng, giữ nguyên `pg_advisory_xact_lock`, giữ nguyên SAVEPOINT. Đây là mẫu để **nhân rộng cho các cache đắt tiền khác** (đặc biệt là cache AI).

---

## 14. Nguy cơ và bẫy đã biết

### 14.1 Cache stampede (thundering herd) — **CHƯA có bảo vệ ở tầng Redis**

`@redis_cached` không có lock, không có "single-flight", không có early-refresh. Khi một key hết hạn:

- `REDIS_TTL_OVERVIEW_SECONDS = 30` và `REDIS_TTL_REALTIME_SECONDS = 15` là những mốc **cực ngắn** trên các endpoint nóng nhất (`overview/*`, `intraday`, `price-depth`) → cứ 15–30 giây, **mọi** request đang bay đều miss cùng lúc và **cùng gọi upstream**.
- Không có jitter TTL → các key của cùng nhóm hết hạn gần như đồng thời.
- Nhân với số worker: mỗi worker cũng độc lập gọi upstream.
- Nguy cơ trực tiếp: provider (Vietcap/VND/Yahoo/Binance) trả **429** — điều đã từng xảy ra với Yahoo (xem ghi chú lịch sử của dự án).

Với cache AI thì nặng hơn: mỗi miss là **một lần gọi LLM** (`AI_PROXY_TIMEOUT_SECONDS = 120`). Hai request đồng thời cho cùng `symbol` sau 15:00 sẽ tạo **hai** lần gọi LLM tốn tiền. `payloads.py` cũng vậy: `build_industry_payload` miss đồng thời cho cùng `icb_code` sẽ fetch 9 nguồn hai lần.

**Việc phải làm trong bản TS** (được khuyến nghị, ghi changelog vì là hành vi mới):

1. **Single-flight in-process**: map `key -> Promise` để nhiều request trong cùng process chỉ gọi upstream một lần.
2. **Lock phân tán** cho các miss đắt tiền (AI): `SET lock:{key} {id} NX PX 30000`; ai không lấy được lock thì poll cache ngắn hoặc trả 503/stale.
3. **Jitter TTL**: `ttl * (0.9 + random * 0.2)` để phá vỡ đồng bộ hết hạn.
4. **Stale-while-revalidate** cho nhóm `overview`/`realtime`: lưu kèm `soft_expires_at`, trả bản cũ ngay và refresh nền.

### 14.2 Dữ liệu cũ tràn sang phiên mới

- `REDIS_TTL_REFERENCE_SECONDS = 3600` và `REDIS_TTL_MACRO_SECONDS = 900`: snapshot lấy lúc 14:55 vẫn được phục vụ tới 15:10 (macro) / 15:55 (reference), tức **sau khi phiên đã đóng** — người dùng thấy số liệu "đang chạy" của phiên cũ.
- Không có key nào chứa **ngày giao dịch** hay **mã phiên**. TTL là cơ chế duy nhất phân biệt phiên → **không có ranh giới phiên trong cache key**.
- Cache AI: TTL tới 15:00 rồi nhảy sang 15:00 hôm sau, sàn tối thiểu 1 giờ (§9.2) → phân tích sinh sau giờ đóng cửa sống xuyên đêm và **suốt buổi sáng phiên kế tiếp**.
- Endpoint `intraday`/`price-depth` khai báo `cache_empty=True` → response rỗng **bị cache** 15 giây. Trước giờ mở cửa, các key này chứa `[]` và giữ trong 15s sau khi phiên đã mở.
- Payload AI bị cache **kể cả khi thiếu dữ liệu** (fail-soft, §9.1) → một nguồn chết trong 1 giây làm payload lỗi bị đóng băng 60s (dashboard) hoặc 600s (ngành).

**Khuyến nghị bản TS:** đưa **mã phiên/ngày giao dịch** vào cache key cho nhóm realtime/overview/AI (ví dụ `…:{YYYY-MM-DD}:{session}`), để sang phiên mới là key mới, khỏi phụ thuộc TTL. Đây là thay đổi hành vi có lợi rõ ràng nhưng phải ghi changelog.

### 14.3 Các bẫy nhỏ hơn nhưng thật

| # | Bẫy | Hệ quả |
|---|---|---|
| 1 | `getattr(settings, ttl_setting, REDIS_DEFAULT_TTL_SECONDS)` | Gõ sai tên setting → **âm thầm** dùng 300s, không lỗi, không log |
| 2 | Toàn bộ query string vào key, không allowlist | Param rác (`?_=1712345678`, `?utm_source=...`) sinh key mới → **cache poisoning nhẹ / phình keyspace**, và mỗi biến thể là 1 lượt gọi upstream |
| 3 | Không có `maxmemory-policy` được đặt trong code/compose | Keyspace phình → phụ thuộc cấu hình Redis bên ngoài; nên đặt `allkeys-lru` |
| 4 | Symbol chỉ uppercase ở 5 vị trí path (§5.1) | `crypto/{symbol}`, `funds/{fund_id}`, `macro/commodities/{code}`… phân mảnh theo chữ hoa/thường |
| 5 | `md5[:12]` | 48 bit → va chạm lý thuyết; hai tập param khác nhau có thể trả sai cache |
| 6 | `dict(query_params)` giữ giá trị **cuối** với param lặp | Node/Express mặc định trả array → **key khác Python** nếu không xử lý |
| 7 | `X-Cache` chỉ có trên HIT, và không `expose_headers` | Không đo được hit-rate từ phía browser |
| 8 | HIT bỏ qua `response_model` | Nếu response_model từng lọc bớt field, HIT có thể trả field mà MISS không trả |
| 9 | `{"data": null}` bị cache (§6.3) | Response "không có dữ liệu" bị đóng băng trọn TTL |
| 10 | Redis chết lúc boot → cache off vĩnh viễn (§3.2) | Sau sự cố Redis phải **restart backend** mới có cache trở lại |
| 11 | `cache_delete_pattern` dùng SCAN cho một key chính xác | O(keyspace) mỗi lần link Telegram |
| 12 | `tg_link:` token: `GET` rồi `SCAN`+`DEL` (2 bước, không atomic) | Hai webhook đồng thời cùng token có thể cùng link (nên dùng `GETDEL`) |
| 13 | Key không chứa user/role | An toàn hiện tại (74 endpoint đều public) nhưng **sẽ rò dữ liệu** ngay khi ai đó cache một endpoint có auth |
| 14 | `language` không chuẩn hoá trong key AI | `"vi"`/`"VI"`/`"vi-VN"` tạo bản cache riêng, tốn LLM |

---

## 15. Mapping sang TypeScript / NestJS

### 15.1 Lựa chọn thư viện

| Thành phần Python | Tương đương TS | Ghi chú |
|---|---|---|
| `redis.asyncio` | **`ioredis`** | Hỗ trợ `scanStream`, `pipeline`, pub/sub, `SET NX EX`, `HINCRBY` — đủ cho cả cache lẫn realtime |
| Decorator `@redis_cached` | **`SetMetadata` + `NestInterceptor`** (đăng ký global) | Interceptor có `ExecutionContext` → truy cập `request.path`/`request.query` |
| `cache-manager` | Chỉ dùng nếu muốn abstraction đa store | **Không bắt buộc**; hợp đồng ở §4 mỏng hơn cache-manager. Nếu dùng `@nestjs/cache-manager` thì vẫn phải tự viết `buildCacheKey` + `hasData` để giữ parity |
| `TTLCache` in-memory | `lru-cache` (npm) hoặc `Map` + `OrderedMap` | Chỉ cần nếu chọn phương án (B) ở §2.3 |
| `functools.lru_cache` | memo module-level đơn giản | Config/prompt/mapping — không cần thư viện |

### 15.2 `RedisCacheService`

```ts
// cache/redis-cache.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

export type RedisHealth = 'healthy' | 'disabled' | 'unhealthy';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly log = new Logger(RedisCacheService.name);
  private client: Redis | null = null;

  constructor(private readonly cfg: AppConfigService) {}

  /** Tương đương redis_cache.startup(). Gọi trong bootstrap, SAU khi HTTP client sẵn sàng. */
  async startup(): Promise<void> {
    if (!this.cfg.REDIS_ENABLED) {
      this.log.log('Redis cache disabled (REDIS_ENABLED=false)');
      return;
    }
    try {
      const client = new Redis(this.cfg.REDIS_URL, {
        connectTimeout: 5_000,   // socket_connect_timeout=5
        commandTimeout: 3_000,   // socket_timeout=3
        lazyConnect: true,
        maxRetriesPerRequest: 3, // xấp xỉ retry_on_timeout=True
      });
      await client.connect();
      await client.ping();       // Python xác thực bằng PING — giữ nguyên
      this.client = client;
      this.log.log(`Redis cache connected: ${this.cfg.REDIS_URL}`);
    } catch (err) {
      // FAIL-OPEN: không ném. Parity Python = chạy không cache.
      this.log.warn(`Redis cache unavailable, running uncached: ${String(err)}`);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try { await this.client.quit(); }
      catch (err) { this.log.warn(`Error closing Redis connection: ${String(err)}`); }
      this.client = null;
    }
    this.log.log('Redis cache connection closed');
  }

  getClient(): Redis | null { return this.client; }

  async healthCheck(): Promise<RedisHealth> {
    if (!this.client) return this.cfg.REDIS_ENABLED ? 'unhealthy' : 'disabled';
    try { await this.client.ping(); return 'healthy'; } catch { return 'unhealthy'; }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.log.warn(`Redis GET failed for key=${key}: ${String(err)}`);
      return null;   // JSON hỏng cũng coi là miss — parity Python
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.log.warn(`Redis SET failed for key=${key}: ${String(err)}`);
    }
  }

  /** MỚI so với Python: xoá 1 key bằng DEL (Python phải đi qua SCAN). */
  async del(key: string): Promise<number> {
    if (!this.client) return 0;
    try { return await this.client.del(key); } catch { return 0; }
  }

  /** Parity cache_delete_pattern, nhưng UNLINK theo lô thay vì DEL từng key. */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.client) return 0;
    try {
      let count = 0;
      const stream = this.client.scanStream({ match: pattern, count: 100 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) { await this.client.unlink(...keys); count += keys.length; }
      }
      return count;
    } catch (err) {
      this.log.warn(`Redis DELETE pattern failed for ${pattern}: ${String(err)}`);
      return 0;
    }
  }
}
```

### 15.3 `buildCacheKey` — port 1:1

```ts
// cache/build-cache-key.ts
import { createHash } from 'node:crypto';

const SYMBOL_PATH_POSITIONS = new Set(['quotes', 'company', 'trading', 'fundamentals', 'tickers']);

/** Tương đương Python str.isalnum() (unicode letters + digits, không rỗng). */
function isAlnum(s: string): boolean {
  return s.length > 0 && /^[\p{L}\p{N}]+$/u.test(s);
}

export function buildCacheKey(
  prefix: string,
  path: string,
  params?: Record<string, unknown> | null,
): string {
  const parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  const out: string[] = [];
  let inSymbolContext = false;
  for (const part of parts) {
    if (SYMBOL_PATH_POSITIONS.has(part)) {
      inSymbolContext = true;
      out.push(part);
    } else if (inSymbolContext && isAlnum(part) && part.length <= 10) {
      out.push(part.toUpperCase());
      inSymbolContext = false;
    } else {
      inSymbolContext = false;
      out.push(part);
    }
  }
  const normalisedPath = out.join('/');

  let paramHash = '_';
  if (params) {
    const sorted = Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
      .map(([k, v]) => [k, String(v)] as [string, string])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // sort THEO KEY, như Python
    if (sorted.length > 0) {
      const paramStr = sorted.map(([k, v]) => `${k}=${v}`).join('&');
      paramHash = createHash('md5').update(paramStr, 'utf8').digest('hex').slice(0, 12);
    }
  }
  return `iqx:${prefix}:${normalisedPath}:${paramHash}`;
}

/** Query lặp: Python `dict(query_params)` giữ GIÁ TRỊ CUỐI. Express trả array → phải quy về cuối. */
export function normaliseQuery(q: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) out[k] = Array.isArray(v) ? v[v.length - 1] : v;
  return out;
}
```

### 15.4 Decorator `@Cacheable` + interceptor

```ts
// cache/cacheable.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const CACHEABLE_KEY = 'iqx:cacheable';

export interface CacheableOptions {
  /** TTL cố định (giây). Ưu tiên hơn ttlConfigKey nếu cả hai được truyền. */
  ttl?: number;
  /** Tên key cấu hình chứa TTL — tương đương ttl_setting của Python. */
  ttlConfigKey?: string;
  /** Prefix key sau 'iqx:'. Default 'api:v1'. */
  keyPrefix?: string;
  /** true → cache cả response rỗng. Default false. */
  cacheEmpty?: boolean;
}

export const Cacheable = (opts: CacheableOptions = {}) => SetMetadata(CACHEABLE_KEY, opts);
```

```ts
// cache/cacheable.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { RedisCacheService } from './redis-cache.service';
import { buildCacheKey, normaliseQuery } from './build-cache-key';
import { CACHEABLE_KEY, CacheableOptions } from './cacheable.decorator';
import { AppConfigService } from '../config/app-config.service';

/** Port của decorator._has_data — giữ nguyên cả các nhánh gây bất ngờ. */
export function hasData(body: unknown): boolean {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const data = (body as Record<string, unknown>)['data'];
    if (data === null || data === undefined) return Object.keys(body).length > 0;
    if (Array.isArray(data)) return data.length !== 0;
    if (typeof data === 'object') return Object.keys(data as object).length !== 0;
    return true;
  }
  return body !== null && body !== undefined;
}

@Injectable()
export class CacheableInterceptor implements NestInterceptor {
  /** Single-flight in-process: chống stampede trong cùng worker (MỚI so với Python). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly cache: RedisCacheService,
    private readonly cfg: AppConfigService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const opts = this.reflector.get<CacheableOptions>(CACHEABLE_KEY, ctx.getHandler());
    if (!opts) return next.handle();
    if (!this.cfg.REDIS_ENABLED) return next.handle();          // bước 2 của §6.2

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.method !== 'GET') return next.handle();

    const prefix = opts.keyPrefix ?? 'api:v1';
    const key = buildCacheKey(prefix, req.path, normaliseQuery(req.query as Record<string, unknown>));

    // TTL: ttl > ttlConfigKey > REDIS_DEFAULT_TTL_SECONDS.
    // KHÁC Python: config key sai sẽ THROW ở boot (Python âm thầm về 300).
    const ttl = opts.ttl
      ?? (opts.ttlConfigKey ? this.cfg.getNumber(opts.ttlConfigKey) : undefined)
      ?? this.cfg.REDIS_DEFAULT_TTL_SECONDS;

    const cached = await this.cache.getJson<unknown>(key);
    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      return of(cached);           // bỏ qua serializer — parity với JSONResponse của Python
    }
    res.setHeader('X-Cache', 'MISS');   // MỚI: Python không phát header trên MISS

    return next.handle().pipe(
      tap((body) => {
        // Lỗi (throw) không đi qua tap → response lỗi KHÔNG BAO GIỜ bị cache, đúng như Python.
        if (opts.cacheEmpty || hasData(body)) {
          void this.cache.setJson(key, body, ttl);   // fire-and-forget, fail-open
        }
      }),
    );
  }
}
```

Đăng ký:

```ts
// cache/cache.module.ts — Global để mọi controller dùng được @Cacheable
@Global()
@Module({
  providers: [
    RedisCacheService,
    { provide: APP_INTERCEPTOR, useClass: CacheableInterceptor },
  ],
  exports: [RedisCacheService],
})
export class CacheModule {}
```

Cách dùng ở controller (tương ứng `@redis_cached(ttl_setting="REDIS_TTL_REFERENCE_SECONDS")`):

```ts
@Get('reference/symbols')
@Cacheable({ ttlConfigKey: 'REDIS_TTL_REFERENCE_SECONDS' })
listSymbols(@Query() q: ListSymbolsQuery) { /* ... */ }

@Get('quotes/:symbol/intraday')
@Cacheable({ ttlConfigKey: 'REDIS_TTL_REALTIME_SECONDS', cacheEmpty: true })
getIntraday(/* ... */) { /* ... */ }
```

**Thứ tự interceptor rất quan trọng:** `CacheableInterceptor` phải chạy **ngoài** `ClassSerializerInterceptor` / interceptor bọc envelope, để (a) giá trị ghi vào cache là giá trị đã serialize xong, và (b) đường HIT không bị serialize lần hai. Nếu dự án có interceptor bọc response chung, hãy quyết định tường minh: cache **trước** hay **sau** khi bọc, và giữ nhất quán — trong Python, cái được cache là `model_dump(mode="json")` hoặc dict thô, tức **payload cuối cùng** mà client nhận.

### 15.5 Type cấu hình

```ts
export interface CacheConfig {
  REDIS_URL: string;                          // 'redis://localhost:6379/0'
  REDIS_ENABLED: boolean;                     // false
  REDIS_DEFAULT_TTL_SECONDS: number;          // 300
  REDIS_TTL_REALTIME_SECONDS: number;         // 15
  REDIS_TTL_REFERENCE_SECONDS: number;        // 3600
  REDIS_TTL_OVERVIEW_SECONDS: number;         // 30
  REDIS_TTL_MACRO_SECONDS: number;            // 900
  REDIS_TTL_NEWS_SECONDS: number;             // 300
  REDIS_TTL_AI_DASHBOARD_SECONDS: number;     // 60
  REDIS_TTL_AI_INDUSTRY_SECONDS: number;      // 600
  REDIS_TTL_AI_ANALYSIS_SECONDS: number;      // 1800 — KHÔNG được đọc ở đâu (dead)
  REDIS_TTL_SHEETS_SECONDS: number;           // 600

  // Nhóm in-memory: chỉ MAX_SIZE thực sự được đọc
  MARKET_DATA_CACHE_ENABLED: boolean;                  // true  (dead)
  MARKET_DATA_CACHE_TTL_REFERENCE_SECONDS: number;     // 3600  (dead)
  MARKET_DATA_CACHE_TTL_REALTIME_SECONDS: number;      // 10    (dead)
  MARKET_DATA_CACHE_TTL_HISTORY_SECONDS: number;       // 300   (dead)
  MARKET_DATA_CACHE_MAX_SIZE: number;                  // 1000
}
```

---

## 16. Checklist nghiệm thu bản TS

- [ ] `buildCacheKey` vượt **toàn bộ 7 test** trong `tests/test_redis_cache.py::TestBuildCacheKey` (port sang Jest/Vitest): prefix `iqx:api:v1:`, sort param, param rỗng bị loại, `vcb` == `VCB` ở path `quotes`.
- [ ] `REDIS_ENABLED=false`: mọi endpoint vẫn trả đúng; `/health` trả `redis: "disabled"` và **status 200**; không có kết nối Redis nào được mở.
- [ ] `REDIS_ENABLED=true` nhưng Redis không tồn tại: boot **không crash**, log warning, `/health` trả `redis: "unhealthy"` và status **200** (chỉ DB chết mới 503).
- [ ] Redis chết giữa lúc chạy: request tiếp theo vẫn trả 200 với dữ liệu upstream; log warning GET/SET; **không có 500 nào**.
- [ ] HIT trả header `X-Cache: HIT`; hàm handler **không được gọi** (đếm bằng spy).
- [ ] Endpoint raise 422/502/503 → **không có key nào** được ghi vào Redis.
- [ ] `{"data": []}` không được cache khi `cacheEmpty=false`; **được** cache khi `cacheEmpty=true` — kiểm đủ **6 endpoint** có cờ này trong §8: `quotes/{symbol}/intraday`, `quotes/{symbol}/price-depth`, `global/crypto/{symbol}/depth`, `company/{symbol}/news`, `news/latest`, `macro/economy/{indicator}`.
- [ ] TTL đúng theo bảng §7.1 cho **cả 74 endpoint** (test bằng cách spy `setJson` và so TTL).
- [ ] TTL AI: `bctc` = `604800`; loại khác = số giây tới 15:00 `Asia/Ho_Chi_Minh`, sàn `3600`, đã qua 15:00 → hôm sau.
- [ ] Các key AI đúng chính tả tuyệt đối theo §10 (kể cả `dashboard:all:{language}` với identifier hằng `"all"`).
- [ ] `tg_link:{token}` mint/resolve/consume hoạt động; token chỉ dùng được **một lần**.
- [ ] `mkt:msn:apikey` lưu **plain string** (không JSON), TTL 21600.
- [ ] `sector_median_cache` giữ nguyên unique `(icb_lv2, asof_date)`, `pg_advisory_xact_lock`, SAVEPOINT khi upsert.
- [ ] Query lặp (`?symbols=A&symbols=B`) sinh key giống Python (lấy giá trị cuối).
- [ ] Ghi changelog cho mọi khác biệt có chủ ý: `X-Cache: MISS`, single-flight, jitter TTL, `DEL` thay `SCAN`, throw khi `ttlConfigKey` sai, lazy reconnect Redis, `exposedHeaders`.

---

## 17. Điểm chưa xác định

1. **`maxmemory` / `maxmemory-policy` của Redis production** — không có trong repo backend (`REDIS_URL` chỉ là DSN). Nếu policy là `noeviction` thì keyspace phình sẽ khiến `SET` báo lỗi (bị `except` nuốt → cache im lặng ngừng ghi). **CHƯA XÁC ĐỊNH — cần đọc cấu hình Redis trong hạ tầng Coolify, không có trong source backend.**
2. **Số worker/process chạy production** — quyết định mức độ nghiêm trọng của stampede và của việc tầng in-memory (nếu bật) lệch nhau. **CHƯA XÁC ĐỊNH — cần đọc cấu hình deploy (Dockerfile/compose/command uvicorn), không nằm trong các file đã đọc cho chương này.**
3. **Có instance Redis dùng chung với hệ thống khác không** — quyết định việc có cần namespace hoá `tg_link:`/`mkt:`/`realtime:`/`rt:`. **CHƯA XÁC ĐỊNH — cần đọc env production.**
4. **Ý định thật của `MARKET_DATA_CACHE_*`** — 4/5 biến chưa từng được đọc; không rõ đây là tính năng bị bỏ dở hay bị thay thế bởi Redis. Cần chủ dự án xác nhận trước khi xoá khỏi `.env` (xoá config là thay đổi hợp đồng vận hành).
5. **`REDIS_TTL_AI_ANALYSIS_SECONDS = 1800`** — giá trị này có phải hành vi *mong muốn* (30 phút) trước khi bị thay bằng "TTL tới hết phiên"? Nếu đúng, cần quyết định giữ hành vi hiện tại (tới 15:00) hay quay lại 1800s. Hiện tài liệu này đặc tả **hành vi đang chạy**: TTL tới hết phiên, sàn 3600.
