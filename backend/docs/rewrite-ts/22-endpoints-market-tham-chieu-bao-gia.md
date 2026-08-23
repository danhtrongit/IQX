# Endpoint — Dữ liệu thị trường: tham chiếu, báo giá, bộ lọc

Chương này đặc tả **14 endpoint** đầu tiên của router `/api/v1/market-data`: dữ liệu tham chiếu
(danh mục mã, phân ngành ICB, chỉ số, nhóm chỉ số, thanh tìm kiếm, mã sự kiện), báo giá
(nến OHLCV, khớp lệnh trong phiên, bậc giá tích lũy) và bộ lọc cổ phiếu (tiêu chí, tìm kiếm,
bộ lọc mặc định). Tất cả 14 endpoint đều **công khai** — không cần Bearer token.

Đây là nhóm endpoint **proxy + normalize**: gần như không có logic nghiệp vụ, nhưng cực nhiều
bẫy về **đơn vị dữ liệu**, **thứ tự kiểm tra lỗi**, **hành vi khi provider trả rỗng** và
**tên field lệch giữa upstream / response**. Hai endpoint duy nhất đọc Postgres là
`/reference/symbols/search` và `/reference/symbols/{symbol}` (bảng `symbols`); 12 endpoint còn lại
gọi ra ngoài (Vietcap Trading, Vietcap IQ Insight, VNDirect) hoặc trả hằng số tĩnh.

> Nguồn sự thật của chương: `app/api/v1/endpoints/market_data.py` (dòng 82–350, 1815–1851,
> 2190–2342), `app/services/market_data/{registry,orchestrator,fallback,schemas,cache,http}.py`,
> `app/services/market_data/sources/{vietcap,vndirect,vietcap_screening,vietcap_market_overview}.py`,
> `app/services/symbols.py`, `app/repositories/symbol.py`, `app/models/symbol.py`,
> `app/schemas/symbol.py`, `docs/vietcap-screening-api.md`,
> `docs/vietcap-market-overview-api-supplement.md`, `docs/market-data-source-map.md`,
> và bản cắt OpenAPI của nhóm.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| `GET` | `/api/v1/market-data/reference/symbols` | Công khai | Toàn bộ danh mục mã chứng khoán từ provider (VCI → VND), lọc theo sàn/loại |
| `GET` | `/api/v1/market-data/reference/industries` | Công khai | Danh mục phân ngành ICB (mã + tên VI/EN + cấp) |
| `GET` | `/api/v1/market-data/reference/indices` | Công khai | Danh mục 9 chỉ số thị trường — **hằng số tĩnh trong code** |
| `GET` | `/api/v1/market-data/reference/groups/{group}/symbols` | Công khai | Danh sách mã thuộc một nhóm chỉ số (VN30, HNX30, VNMidCap…) |
| `GET` | `/api/v1/market-data/reference/symbols/search` | Công khai | **Đọc DB** — tìm kiếm mã trong bảng `symbols` có xếp hạng + phân trang |
| `GET` | `/api/v1/market-data/reference/symbols/{symbol}` | Công khai | **Đọc DB** — chi tiết đầy đủ một mã trong bảng `symbols`, 404 nếu không có/không active |
| `GET` | `/api/v1/market-data/reference/search` | Công khai | Dữ liệu autocomplete thanh tìm kiếm (~2000 doanh nghiệp + chỉ số) kèm giá mục tiêu |
| `GET` | `/api/v1/market-data/reference/event-codes` | Công khai | Bảng ánh xạ mã sự kiện → tên sự kiện (VI/EN) |
| `GET` | `/api/v1/market-data/quotes/{symbol}/ohlcv` | Công khai | Nến OHLCV theo khung thời gian (VND → VCI) |
| `GET` | `/api/v1/market-data/quotes/{symbol}/intraday` | Công khai | Danh sách lệnh khớp trong phiên (tick) |
| `GET` | `/api/v1/market-data/quotes/{symbol}/price-depth` | Công khai | Khối lượng tích lũy theo từng bước giá |
| `GET` | `/api/v1/market-data/screening/criteria` | Công khai | Catalog 34 tiêu chí lọc + options + min/max |
| `POST` | `/api/v1/market-data/screening/search` | Công khai | Lọc cổ phiếu theo bộ tiêu chí, có sort + phân trang |
| `GET` | `/api/v1/market-data/screening/presets` | Công khai | 3 bộ lọc mặc định (SYSTEM) từ Vietcap |

---

## 1. Cơ chế chung: registry → orchestrator → fallback → cache

Đọc mục này một lần; mỗi endpoint bên dưới chỉ trỏ về đây.

### 1.1 Registry — chuỗi nguồn theo khoá `<domain>.<method>`

`app/services/market_data/registry.py` khai báo một `dict` bất biến, mỗi khoá ánh xạ sang
một nguồn chính (`default`) và danh sách fallback **có thứ tự**. Các khoá liên quan chương này:

| Khoá registry | default | fallback | Endpoint dùng |
|---|---|---|---|
| `reference.symbols` | `VCI` | `VND` | `GET /reference/symbols` |
| `reference.industries` | `VCI` | — | (khai báo nhưng **endpoint không dùng registry**) |
| `reference.groups` | `VCI` | — | (khai báo nhưng **endpoint không dùng registry**) |
| `quote.ohlcv` | `VND` | `VCI` | `GET /quotes/{symbol}/ohlcv` |
| `quote.intraday` | `VCI` | — | (khai báo nhưng **endpoint không dùng registry**) |
| `quote.price_depth` | `VCI` | — | (khai báo nhưng **endpoint không dùng registry**) |

Hàm `sources_for(key, override)`:

1. `REGISTRY[key]` không tồn tại → ném `KeyError: Unknown registry key: <key>`.
2. `chain = [default, ...fallback]`.
3. Nếu có `override` **và** `override.toUpperCase()` nằm trong `chain` → trả về `[override]` (một nguồn duy nhất).
4. `override` không nằm trong chain (ví dụ `?source=auto`, `?source=KBS`) → **bỏ qua im lặng**, trả về chain đầy đủ.

### 1.2 Orchestrator

`fetch_from_registry(key, handlers, override?, validator?, allowEmpty?)`:

- Resolve chain qua `sources_for`.
- Với mỗi tên nguồn trong chain, lấy handler từ `handlers[name]`; thiếu handler →
  ném `ValueError: No handler registered for source '<name>' (registry key '<key>')` (lỗi lập trình, không phải lỗi runtime bình thường).
- Chuyển danh sách `[(name, handler)]` sang `fetch_with_fallback`.

Mỗi handler là hàm async trả về **tuple `[data, rawEndpointUrl]`**.

### 1.3 Fallback

`fetch_with_fallback(sources, { validator, allowEmpty })` (`fallback.py`):

```
priority = 1
for (name, fn) of sources:
  try:
    [data, rawEndpoint] = await fn()
    if (!allowEmpty && !check(data)):
       # log warning, ghi lastError = ValueError(`Nguồn ${name} trả về dữ liệu rỗng`)
       priority++; continue
    return { data, meta: { source: name, source_priority: priority,
                           fallback_used: priority > 1,
                           as_of: now(UTC), raw_endpoint: rawEndpoint } }
  catch (exc):
    # log warning, lastError = exc
    priority++; continue
throw RuntimeError(`Tất cả ${sources.length} nguồn dữ liệu thị trường đều thất bại`)
```

`check` mặc định (`_default_validator`): **`null`/`undefined` → không hợp lệ**;
**array rỗng hoặc object rỗng → không hợp lệ**; mọi giá trị khác → hợp lệ.
`allowEmpty: true` bỏ qua validator hoàn toàn.

**Hệ quả then chốt:** với endpoint dùng validator mặc định, provider trả `[]` bị coi là **thất bại**
và endpoint trả **502**, chứ không phải `200` với mảng rỗng. Chỉ `intraday` và `price-depth` dùng
`allowEmpty: true`.

Chuỗi số `source_priority` đếm **theo vị trí trong chain đã resolve**, nên khi ép
`?source=VCI` cho `quote.ohlcv` thì VCI có `source_priority = 1` và `fallback_used = false`
dù nó là fallback trong registry.

### 1.4 Ánh xạ lỗi → HTTP status

| Nguồn lỗi | Status | Body |
|---|---|---|
| `RuntimeError` từ `fetch_with_fallback` (mọi nguồn fail) | `502` | `{ "detail": "Tất cả N nguồn dữ liệu thị trường đều thất bại" }` |
| `MarketOverviewUpstreamShapeError` / `ScreeningUpstreamShapeError` | `502` | `{ "detail": "<message của exception>" }` |
| `MarketOverviewUpstreamError` / `ScreeningUpstreamError` | `503` | `{ "detail": "<method> <path>: <lỗi gốc>" }` |
| `HTTPException(422, "…")` do validate thủ công trong handler | `422` | `{ "detail": "<câu tiếng Việt>" }` (detail là **string**) |
| Validate query/path/body của framework | `422` | `{ "detail": [ { loc, msg, type, input, ctx? } ] }` (detail là **array**) |
| Vượt rate limit | `429` | `{ "error": "Rate limit exceeded: 60 per 1 minute" }` |

Toàn bộ 14 endpoint dùng `HTTPException` trần → response lỗi **không có field `code`**
(khác các domain nghiệp vụ dùng `AppException`). Cột `code` trong bảng lỗi của từng endpoint
vì vậy luôn là `—`.

### 1.5 Cache Redis

Decorator `redis_cached(ttlSetting, prefix = "api:v1", cacheEmpty = false)`:

- Chỉ hoạt động khi `REDIS_ENABLED = true` (**mặc định `false`** → khi tắt, mọi request đi thẳng upstream).
- Khoá: `iqx:api:v1:{normalizedPath}:{paramHash}` với
  - `normalizedPath`: path đã bỏ `/` đầu/cuối; **segment ngay sau** `quotes`, `company`, `trading`, `fundamentals`, `tickers` được `toUpperCase()` nếu là alphanumeric và ≤ 10 ký tự (chuẩn hoá mã CK). Lưu ý: `reference` **không** nằm trong danh sách này.
  - `paramHash`: các query param bỏ giá trị `null`/rỗng, sort theo tên, nối `k=v&k=v`, băm MD5 rồi lấy **12 hex đầu**; không có param nào → chuỗi `_`.
- **Cache HIT** → trả `JSONResponse` với header `X-Cache: HIT`. Cache MISS **không** set header này.
- Chỉ cache response 2xx. Nếu `cacheEmpty = false` thì bỏ qua khi `body.data` là array/object rỗng
  (`body.data === undefined` → cache nếu body không rỗng).
- Redis lỗi → log warning và đi tiếp, không làm fail request.

TTL theo settings (giá trị mặc định):

| Setting | Giây | Dùng cho |
|---|---|---|
| `REDIS_TTL_REFERENCE_SECONDS` | `3600` | 6 endpoint `/reference/*` (trừ 2 endpoint DB-backed) + `screening/criteria` + `screening/presets` |
| `REDIS_DEFAULT_TTL_SECONDS` | `300` | `quotes/{symbol}/ohlcv` |
| `REDIS_TTL_REALTIME_SECONDS` | `15` | `quotes/{symbol}/intraday`, `quotes/{symbol}/price-depth` (kèm `cacheEmpty: true`) |

Không cache: `/reference/symbols/search`, `/reference/symbols/{symbol}`, `POST /screening/search`.

> **Bẫy:** trên cache HIT, `meta.as_of` là thời điểm **lần fetch gốc**, không phải thời điểm request.
> Ngoài ra `?source=` luôn tham gia `paramHash` **dù nhiều endpoint bỏ qua nó** → sinh nhiều bản cache
> trùng nội dung. Giữ nguyên hành vi này để parity.

### 1.6 Cache trong tiến trình (không dùng cho nhóm này)

`app/services/market_data/cache.py` cài `TTLCache` (LRU + TTL, max size từ
`MARKET_DATA_CACHE_MAX_SIZE = 1000`). **Không endpoint nào trong 14 endpoint này dùng nó** —
cache duy nhất đang hoạt động là Redis qua decorator. Khi viết lại có thể bỏ qua `TTLCache`
cho chương này.

### 1.7 HTTP client tới upstream

`app/services/market_data/http.py`:

- Một `httpx.AsyncClient` dùng chung (`maxConnections: 100`, `maxKeepalive: 20`, `followRedirects: true`), timeout **15.0s**.
- Retry: tối đa **3 lần**. Backoff `0.5 * 2^(attempt-1)` giây; với timeout/connect error cộng thêm jitter `random(0, 0.3)`.
- **Không retry với HTTP 4xx** (ném ngay). 5xx thì retry.
- Header cơ bản mô phỏng browser (`Accept`, `Accept-Language`, `Content-Type: application/json`, `Cache-Control: no-cache`, `Sec-Fetch-*`, `DNT: 1`, `Pragma: no-cache`, `sec-ch-ua-platform`, `sec-ch-ua-mobile`) + `User-Agent` chọn **random** từ 4 chuỗi cố định.
- Header riêng theo nguồn:
  - `VCI`: `Referer: https://trading.vietcap.com.vn/`, `Origin: https://trading.vietcap.com.vn`
  - `VND`: `Referer: https://mkw.vndirect.com.vn`, `Origin: https://mkw.vndirect.com.vn`
- Riêng nhóm screening ghi đè `Accept: application/json` và `Referer: https://trading.vietcap.com.vn/iq/screening`.
- Riêng nhóm market-overview (`/reference/search`, `/reference/event-codes`) ghi đè `Referer: https://trading.vietcap.com.vn/iq/market`.

### 1.8 Rate limit & request id

- `SlowAPIMiddleware` áp **`RATE_LIMIT_DEFAULT = "60/minute"` theo IP** cho *mọi* endpoint.
  Không endpoint nào trong chương này khai báo limit riêng (`RATE_LIMIT_MARKET_DATA = "120/minute"`
  chỉ dùng cho `POST /trading/price-board` và các endpoint khác — không thuộc chương này).
- Middleware `RequestIDMiddleware` đọc header `X-Request-ID`, nếu thiếu thì sinh UUID v4, gắn vào
  `request.state.request_id` và **echo lại trong response header**.

### 1.9 Host upstream

| Nguồn | Base URL |
|---|---|
| VCI Trading | `https://trading.vietcap.com.vn/api` |
| VCI IQ Insight | `https://iq.vietcap.com.vn/api/iq-insight-service` |
| VND chart | `https://dchart-api.vndirect.com.vn` |
| VND insights | `https://api-finfo.vndirect.com.vn/v4` |

---

## 2. Kiểu dữ liệu dùng chung

### 2.1 Vỏ response

Hai vỏ khác nhau — **đừng trộn lẫn**.

~~~ts
/** Vỏ chuẩn của các endpoint đi qua registry/fallback. */
interface MdMeta {
  /** Nguồn đã phục vụ response: "VCI" | "VND" | "STATIC" (mở rộng theo registry). */
  source: string;
  /** 1 = nguồn chính trong chain đã resolve, 2+ = fallback. Default 1. */
  source_priority: number;
  /** true khi source_priority > 1. Default false. */
  fallback_used: boolean;
  /** ISO-8601 UTC, ví dụ "2026-08-17T02:31:07.412903Z". */
  as_of: string;
  /** URL upstream đã gọi. Default "". */
  raw_endpoint: string;
}

interface MdResponse<T> {
  data: T;
  meta: MdMeta;
}
~~~

~~~ts
/** Vỏ của 4 endpoint proxy trực tiếp Vietcap IQ (không đi qua registry). */
interface IqProxyResponse<T> {
  data: T;
  /** URL upstream đã gọi — luôn có, không nằm trong meta. */
  source_url: string;
}
~~~

Áp dụng `MdResponse<T>` cho: `/reference/symbols`, `/reference/industries`, `/reference/indices`,
`/reference/groups/{group}/symbols`, `/quotes/{symbol}/ohlcv`, `/quotes/{symbol}/intraday`,
`/quotes/{symbol}/price-depth`.

Áp dụng `IqProxyResponse<T>` cho: `/reference/search`, `/reference/event-codes`,
`/screening/criteria`, `POST /screening/search`, `/screening/presets`.

Hai endpoint DB-backed có shape riêng (mục 2.4).

### 2.2 Bản ghi tham chiếu

~~~ts
/** GET /reference/symbols — sau normalize của VCI hoặc VND. */
interface MdSymbolListingItem {
  /** VCI: field `symbol`; VND: field `code`. Rỗng "" nếu upstream thiếu. */
  symbol: string;
  /** VCI: `organName` (hoặc `organ_name`); VND: `companyName`. Rỗng "" nếu thiếu. */
  name: string;
  /** VCI: `board` sau chuẩn hoá HSX→HOSE; VND: `floor`. Rỗng "" nếu thiếu. */
  exchange: string;
  /** `type` của upstream, đã lowercase. null nếu upstream thiếu/rỗng. */
  asset_type: string | null;
}

/** GET /reference/industries — chú ý icb_code lấy từ field `name` của upstream. */
interface MdIndustryIcbItem {
  /** Mã ICB dạng chuỗi số, ví dụ "8300". Lấy từ upstream `name`. Rỗng "" nếu thiếu. */
  icb_code: string;
  /** Tên ngành tiếng Việt. Lấy từ upstream `viSector`. Rỗng "" nếu thiếu. */
  icb_name: string;
  /** Lấy từ upstream `enSector`. Rỗng "" nếu thiếu (không phải null). */
  en_icb_name: string;
  /** Cấp ICB 1..4. Lấy từ upstream `icbLevel`. null nếu thiếu. */
  level: number | null;
}

/** GET /reference/indices — danh sách hằng số trong code, không gọi upstream. */
interface MdStaticIndexItem {
  code:
    | "VNINDEX" | "HNXIndex" | "UPCOMIndex"
    | "VN30" | "VN100" | "VNMID" | "VNSML" | "VNALL" | "HNX30";
  name: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
}

/** GET /reference/groups/{group}/symbols — chỉ một field duy nhất. */
interface MdGroupSymbolItem {
  symbol: string;
}
~~~

### 2.3 Bản ghi báo giá

~~~ts
/**
 * GET /quotes/{symbol}/ohlcv — một nến.
 * CẢNH BÁO ĐƠN VỊ: shape giống nhau nhưng ĐƠN VỊ phụ thuộc meta.source.
 *  - source = "VND": giá tính bằng NGHÌN ĐỒNG (123.5 = 123.500 đ), KHÔNG có field `value`.
 *  - source = "VCI": giá tính bằng ĐỒNG (123500), CÓ field `value` (triệu đồng).
 * `time` là epoch giây: number khi source = "VND", string số khi source = "VCI".
 */
interface MdOhlcvCandle {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Khối lượng — số cổ phiếu (không phải lô). */
  volume: number;
  /** Chỉ nhánh VCI: giá trị giao dịch của nến, đơn vị TRIỆU ĐỒNG. null nếu upstream thiếu. */
  value?: number | null;
}

/** GET /quotes/{symbol}/intraday — một lệnh khớp. */
interface MdIntradayTick {
  /** Upstream `truncTime` — epoch giây dạng CHUỖI. "" nếu thiếu. */
  time: string;
  /** Upstream `matchPrice`. Đơn vị: ĐỒNG (124700 = 124.700 đ). 0 nếu không parse được. */
  price: number;
  /** Upstream `matchVol`. Số cổ phiếu, trả về dạng float. 0 nếu không parse được. */
  volume: number;
  /** Upstream `matchType` — CHUỖI THÔ, backend KHÔNG map sang mua/bán. "" nếu thiếu. */
  side: string;
  /** Upstream `accumulatedVolume` — khối lượng lũy kế trong phiên (cổ phiếu). 0 nếu thiếu. */
  accumulated_volume: number;
  /** Upstream `accumulatedValue` — giá trị lũy kế, GIỮ NGUYÊN ĐƠN VỊ THÔ của VCI. 0 nếu thiếu. */
  accumulated_value: number;
}

/** GET /quotes/{symbol}/price-depth — một bậc giá. */
interface MdPriceDepthStep {
  /** Upstream `priceStep`. Đơn vị ĐỒNG. 0 nếu không parse được. */
  price: number;
  /** Upstream `accumulatedVolume` — tổng KL khớp tại bậc giá này (cổ phiếu). */
  volume: number;
  /** Upstream `accumulatedBuyVolume` — phần khớp do bên mua chủ động. */
  buy_volume: number;
  /** Upstream `accumulatedSellVolume` — phần khớp do bên bán chủ động. */
  sell_volume: number;
  /** Upstream `accumulatedUndefinedVolume` — phần không xác định bên chủ động (ATO/ATC, thỏa thuận). */
  undefined_volume: number;
}
~~~

> Hàm `_to_num` của source VCI: `null` → `0.0`; parse lỗi → `0.0`. Do đó **mọi field số của
> `MdIntradayTick` và `MdPriceDepthStep` không bao giờ null** — chúng là `0` khi thiếu.
> Đây là điểm phải copy y nguyên: không đổi thành `null`.

### 2.4 Tra cứu IQ & bảng `symbols`

~~~ts
/** Một mắt ICB trong search-bar — upstream trả về OBJECT, không phải chuỗi. */
interface MdIcbRef {
  code?: string;
  name?: string;
  level?: number;
}

/** Item của GET /reference/search. is_index phân biệt doanh nghiệp và chỉ số. */
interface MdSearchBarCompany {
  is_index: false;
  /** Mã CK, ví dụ "FPT". "" nếu upstream thiếu. */
  code: string;
  /** Tên đầy đủ theo `language`. "" nếu thiếu. */
  name: string;
  /** Upstream `shortName`. "" nếu thiếu. */
  short_name: string;
  /** Upstream `floor` — sàn: "HOSE" | "HNX" | "UPCOM" | "". */
  floor: string;
  /** Upstream `currentPrice` ép về SỐ NGUYÊN, đơn vị ĐỒNG. null nếu không parse được. */
  current_price: number | null;
  /** Upstream `targetPrice` ép về SỐ NGUYÊN, đơn vị ĐỒNG. null nếu không có khuyến nghị. */
  target_price: number | null;
  /** Upstream `upsideToTpPercentage` — LÀ TỶ LỆ, KHÔNG PHẢI PHẦN TRĂM (0.3472 = +34,72%). */
  upside_pct: number | null;
  logo_url: string;
  /** Object ICB thô từ provider, hoặc null. */
  icb_lv1: MdIcbRef | string | null;
  icb_lv2: MdIcbRef | string | null;
}

interface MdSearchBarIndex extends Omit<MdSearchBarCompany, "is_index"> {
  is_index: true;
}

type MdSearchBarItem = MdSearchBarCompany | MdSearchBarIndex;

/** Item của GET /reference/event-codes. */
interface MdEventCode {
  /** Ví dụ "AGME", "DIV", "ISS". "" nếu thiếu. */
  event_code: string;
  event_name_vi: string;
  event_name_en: string;
}
~~~

~~~ts
/** Item của GET /reference/symbols/search (bảng symbols, bản rút gọn). */
interface SymbolSearchItem {
  symbol: string;
  name: string | null;
  short_name: string | null;
  exchange: string | null;
  asset_type: string | null;
  is_index: boolean;
  logo_url: string | null;
  /** Giá hiện tại, đơn vị ĐỒNG (BIGINT trong DB). */
  current_price_vnd: number | null;
  target_price_vnd: number | null;
  /** Tỷ lệ upside (kế thừa từ upstream `upsideToTpPercentage`) — KHÔNG phải %. */
  upside_pct: number | null;
  icb_lv1: string | null;
  icb_lv2: string | null;
}

interface SymbolSearchResponse {
  items: SymbolSearchItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Response của GET /reference/symbols/{symbol} — bản đầy đủ của bảng symbols. */
interface SymbolRead {
  id: string;              // UUID
  symbol: string;
  name: string | null;
  short_name: string | null;
  exchange: string | null;
  asset_type: string | null;
  is_index: boolean;
  current_price_vnd: number | null;
  target_price_vnd: number | null;
  upside_pct: number | null;
  logo_url: string | null;
  /** "SIMPLIZE" | "VIETCAP" | null (giá trị do script seed ghi). */
  logo_source: string | null;
  icb_lv1: string | null;
  icb_lv2: string | null;
  /** Provenance, script seed ghi "VIETCAP_SEARCH_BAR". */
  source: string | null;
  source_url: string | null;
  last_synced_at: string | null;   // ISO-8601
  is_active: boolean;
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601
}
~~~

### 2.5 Bộ lọc cổ phiếu

~~~ts
/** Một option của tiêu chí lọc — GIỮ NGUYÊN camelCase của upstream. */
interface ScreeningConditionOption {
  /** "value" cho multi-select / value-select. */
  type?: string;
  viName?: string;
  enName?: string;
  /** Giá trị gửi lại khi lọc, ví dụ "hsx", "8600", "STRONG_UPTREND". */
  value?: string;
  [k: string]: unknown;
}

/** Một tiêu chí trong catalog GET /screening/criteria. */
interface ScreeningCriterion {
  /** ObjectId của Vietcap, ví dụ "697cae6a1ac33a766fea7e53". "" nếu thiếu. */
  id: string;
  /** "general" | "technical" | "fundamental" (theo dữ liệu quan sát). "" nếu thiếu. */
  category: string;
  /** Tên tiêu chí dùng lại trong filter.name, ví dụ "exchange", "stockStrength". */
  name: string;
  order: number | null;
  /** Default false. */
  allow_duplicate: boolean;
  /** Ví dụ "multiple". "" nếu thiếu. */
  select_type: string;
  slider_stepper: number | null;
  multiplier: number | null;
  min: number | null;
  max: number | null;
  /** THÔ từ provider, camelCase bên trong. */
  condition_options: ScreeningConditionOption[];
  /** THÔ từ provider — danh sách giá trị cho extraName, hoặc null. */
  condition_extra: unknown;
  /** Default true. */
  active: boolean;
}

/** Một điều kiện trong request lọc. */
interface ScreeningFilterCondition {
  /** "value" cho multi-select / value-select. Bỏ hẳn nếu dùng range. */
  type?: string | null;
  /** Giá trị chọn, ví dụ "hsx", "8600". Luôn là STRING kể cả khi trông như số. */
  value?: string | null;
  /** Giá trị tối thiểu (range). */
  from?: number | null;
  /** Giá trị tối đa (range). */
  to?: number | null;
}

interface ScreeningFilter {
  /** Bắt buộc. Trùng ScreeningCriterion.name. */
  name: string;
  /** Default []. */
  conditionOptions?: ScreeningFilterCondition[];
  /** Tham số phụ khi tiêu chí có condition_extra, ví dụ "3Month", "ema20", "20Days". */
  extraName?: string | null;
}

interface ScreeningPagingRequest {
  /** 0-based. min 0. Default 0. */
  page?: number;
  /** 1..200. Default 50. */
  pageSize?: number;
  /** Default ["stockStrength"]. */
  sortFields?: string[];
  /** Mỗi phần tử phải là "ASC" hoặc "DESC" (không phân biệt hoa/thường khi nhập, chuẩn hoá thành hoa). Default ["DESC"]. */
  sortOrders?: string[];
  /** Default []. */
  filter?: ScreeningFilter[];
}

/** Một dòng kết quả lọc. */
interface ScreeningStockRow {
  ticker: string;
  /** Ví dụ "HOSE", "HNX", "UPCOM". "" nếu thiếu. */
  exchange: string;
  /** Giá tham chiếu, đơn vị ĐỒNG. */
  ref_price: number | null;
  ceiling: number | null;
  /** Giá khớp hiện tại, đơn vị ĐỒNG. */
  market_price: number | null;
  floor: number | null;
  /** Giá trị giao dịch lũy kế — ĐỒNG (thô từ provider). */
  accumulated_value: number | null;
  accumulated_volume: number | null;
  /** Vốn hoá — ĐỒNG (thô từ provider, ví dụ 126570579090300). */
  market_cap: number | null;
  /** % thay đổi trong ngày (đơn vị phần trăm, ví dụ -0.82). */
  daily_price_change_percent: number | null;
  en_organ_name: string;
  vi_organ_name: string;
  en_organ_short_name: string;
  vi_organ_short_name: string;
  icb_code_lv2: string;
  en_sector: string;
  vi_sector: string;
  icb_code_lv4: string;
  /** Sức mạnh giá 0..100. */
  stock_strength: number | null;
}

interface ScreeningPagingResult {
  content: ScreeningStockRow[];
  /** Upstream `totalElements`. Default 0. */
  total_elements: number;
  /** Upstream `totalPages`. Default 0. */
  total_pages: number;
  /** Upstream `number`; nếu thiếu thì bằng `page` của request. */
  page: number;
  /** Upstream `size`; nếu thiếu thì bằng `pageSize` của request. */
  page_size: number;
  /** Default true. */
  first: boolean;
  /** Default false. */
  last: boolean;
  /** Default false. */
  empty: boolean;
}

/** Một bộ lọc mặc định. */
interface ScreeningPreset {
  id: string;
  /** Tên tiếng Anh, ví dụ "Leading Stocks". */
  name: string;
  /** Tên tiếng Việt, ví dụ "Top CP mạnh nhất". */
  vi_name: string;
  /** Ví dụ "slider". */
  mode: string;
  order: number | null;
  /**
   * THÔ từ provider — cùng format với ScreeningFilter (camelCase) nhưng có thêm `category`.
   * Có thể gửi trực tiếp vào body của POST /screening/search.
   */
  metrics: Array<{
    name: string;
    category?: string;
    conditionOptions?: ScreeningFilterCondition[];
    extraName?: string;
    [k: string]: unknown;
  }>;
}

/** Key là tên category do provider quyết định: "SYSTEM" luôn có, "USER" chỉ khi đã đăng nhập Vietcap. */
type ScreeningPresetsResult = Record<string, ScreeningPreset[]>;
~~~

### 2.6 Kiểu lỗi

~~~ts
/** HTTPException trần của handler — detail là chuỗi tiếng Việt. */
interface MdHttpError {
  detail: string;
}

/** Validate của framework (query/path/body) — detail là danh sách. */
interface MdValidationError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}
~~~

### 2.7 Lưu ý: 6 class Pydantic là code chết

`app/services/market_data/schemas.py` khai báo `SymbolInfo`, `IndustryInfo`, `OHLCVRecord`,
`IntradayRecord`, `PriceDepthRecord`, `PriceBoardRecord`. **Không nơi nào trong app hoặc test dùng
chúng** — `MarketDataResponse.data` khai báo `Any`, handler trả `dict` thô. Hai điểm lệch cụ thể:

- `IntradayRecord.volume: int` và `OHLCVRecord.volume: int` — nhưng thực tế response trả **float**
  (`volume: 100.0`, khẳng định bởi `tests/test_market_data.py`).
- `IntradayRecord.side: str | None` — thực tế luôn là `str` (default `""`).

Khi viết lại: **lấy shape từ hàm normalize của source, đừng lấy từ các class này.**

---

## 3. Tham chiếu — danh mục từ provider

### GET /api/v1/market-data/reference/symbols

> **Danh mục toàn bộ mã chứng khoán** — trả về danh sách mã + tên doanh nghiệp + sàn + loại tài sản, lấy từ provider và lọc phía server.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/symbols:{md5(params)[0..12]}`, TTL `3600`s |
| **Nguồn dữ liệu** | provider ngoài — registry `reference.symbols`: VCI `GET https://trading.vietcap.com.vn/api/price/symbols/getAll` → fallback VND `GET https://api-finfo.vndirect.com.vn/v4/stocks?q=type:stock,ifc~floor:{exchange}&size=9999` |
| **Side-effect** | — |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `exchange` | `string \| null` | Không | `null` | — | Lọc theo sàn. So sánh `record.exchange.toUpperCase() === exchange.toUpperCase()`. Giá trị thực tế: `HOSE`, `HNX`, `UPCOM`. Ở nhánh VND, giá trị này còn được **nhúng vào URL upstream**; nếu bỏ trống thì upstream dùng `"HOSE,HNX,UPCOM"` |
| `asset_type` | `string \| null` | Không | `null` | — | Lọc theo loại. So sánh `record.asset_type === asset_type.toLowerCase()` (khớp tuyệt đối sau khi lowercase). Giá trị đã quan sát: `stock` |
| `source` | `string \| null` | Không | `null` | — | Ép nguồn. Chỉ có tác dụng khi `toUpperCase()` ∈ `{VCI, VND}`; giá trị khác (kể cả `auto`) bị bỏ qua và dùng chain đầy đủ |

**Request body**

—

**Response 200**

~~~ts
type ListSymbolsResponse = MdResponse<MdSymbolListingItem[]>;
~~~

~~~json
{
  "data": [
    { "symbol": "FPT", "name": "Công ty Cổ phần FPT", "exchange": "HOSE", "asset_type": "stock" },
    { "symbol": "VCB", "name": "Ngân hàng TMCP Ngoại thương Việt Nam", "exchange": "HOSE", "asset_type": "stock" },
    { "symbol": "HPG", "name": "Công ty Cổ phần Tập đoàn Hòa Phát", "exchange": "HOSE", "asset_type": "stock" },
    { "symbol": "SHB", "name": "Ngân hàng TMCP Sài Gòn - Hà Nội", "exchange": "HNX", "asset_type": "stock" }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T02:31:07.412903Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/price/symbols/getAll"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | VCI lỗi/trả rỗng **và** VND lỗi/trả rỗng (chain 2 nguồn) | `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` |
| `502` | — | Đã ép `?source=VCI` (hoặc `VND`) và nguồn đó lỗi/rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- VCI lỗi HTTP/timeout → thử VND, `meta.source = "VND"`, `meta.source_priority = 2`, `meta.fallback_used = true`.
- **Lọc trước khi validate:** handler áp `exchange`/`asset_type` **bên trong** handler của mỗi nguồn, rồi
  mới đưa kết quả cho validator. Nghĩa là `?exchange=XYZ` (sàn không tồn tại) làm VCI trả `[]` → coi
  là *nguồn rỗng* → thử VND → cũng `[]` → **502**, KHÔNG phải `200` với `data: []`. Đây là hành vi
  phải giữ nguyên nếu muốn parity.
- Không có cơ chế giữ giá trị phiên trước. Không có 503.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/symbols?exchange=HOSE&asset_type=stock' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- `icb`/`board` chuẩn hoá sàn: chỉ map **`HSX` → `HOSE`**; `HNX` và `UPCOM` giữ nguyên; giá trị khác
  đi qua nguyên vẹn (không ném lỗi).
- Nhánh VND **hardcode `type:stock,ifc`** trong query upstream → nhánh này về bản chất chỉ trả cổ phiếu,
  nên `?asset_type=etf` sẽ không bao giờ có kết quả từ VND.
- Cả hai nhánh dùng default `""` cho `symbol`/`name`/`exchange` (không phải `null`); chỉ `asset_type` là nullable.
- Danh sách này rất lớn (~1600–2000 dòng, không phân trang). Nếu viết lại, giữ nguyên "không phân trang"
  để client hiện tại không vỡ.

---

### GET /api/v1/market-data/reference/industries

> **Danh mục phân ngành ICB** — trả về mã ICB, tên ngành tiếng Việt/Anh và cấp phân ngành.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/industries:{md5(params)[0..12]}`, TTL `3600`s |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes` |
| **Side-effect** | — |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `source` | `string \| null` | Không | `null` | — | **KHÔNG CÓ TÁC DỤNG.** Handler gọi `fetchWithFallback([["VCI", vci]])` trực tiếp, không truyền override. Param vẫn nằm trong OpenAPI và vẫn tham gia cache key |

**Request body**

—

**Response 200**

~~~ts
type ListIndustriesResponse = MdResponse<MdIndustryIcbItem[]>;
~~~

~~~json
{
  "data": [
    { "icb_code": "8000", "icb_name": "Tài chính", "en_icb_name": "Financials", "level": 1 },
    { "icb_code": "8300", "icb_name": "Ngân hàng", "en_icb_name": "Banks", "level": 2 },
    { "icb_code": "8600", "icb_name": "Bất động sản", "en_icb_name": "Real Estate", "level": 2 },
    { "icb_code": "8633", "icb_name": "Phát triển bất động sản", "en_icb_name": "Real Estate Holding & Development", "level": 4 }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T02:31:08.004512Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/sectors/icb-codes"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | VCI lỗi HTTP/timeout, hoặc trả về danh sách rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

Không có nguồn dự phòng. Validator mặc định → **`[]` trở thành 502**. Không giữ giá trị cũ.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/industries' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Tên field lệch nghiêm trọng:** `icb_code` lấy từ upstream `name` (chuỗi số), `icb_name` lấy từ
  upstream `viSector`. Rất dễ nhầm `name` → `icb_name`. Đừng nhầm.
- Hàm normalize chấp nhận cả hai shape: upstream trả `{ "data": [...] }` **hoặc** một array trần
  (`items = data.data ?? data`). Nếu sau khi bóc không phải array thì trả `[]` (→ 502).
- `en_icb_name` default `""`, không phải `null`; `level` default `null`.

---

### GET /api/v1/market-data/reference/indices

> **Danh mục chỉ số thị trường** — 9 chỉ số hardcode trong code, không gọi mạng.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/indices:{md5(params)[0..12]}`, TTL `3600`s (chỉ cache khi `data` không rỗng) |
| **Nguồn dữ liệu** | tính toán — mảng hằng số trong `market_data.py`, `meta.source = "STATIC"` |
| **Side-effect** | — |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `group` | `string \| null` | Không | `null` | — | Lọc theo sàn của chỉ số: so sánh `index.exchange === group.toUpperCase()`. Giá trị hữu ích: `HOSE`, `HNX`, `UPCOM` |

**Request body**

—

**Response 200**

~~~ts
type ListIndicesResponse = MdResponse<MdStaticIndexItem[]>;
~~~

Danh sách hằng số **đầy đủ, đúng thứ tự** (không được đổi thứ tự khi viết lại):

~~~json
{
  "data": [
    { "code": "VNINDEX",    "name": "VN-Index",      "exchange": "HOSE" },
    { "code": "HNXIndex",   "name": "HNX-Index",     "exchange": "HNX" },
    { "code": "UPCOMIndex", "name": "UPCOM-Index",   "exchange": "UPCOM" },
    { "code": "VN30",       "name": "VN30",          "exchange": "HOSE" },
    { "code": "VN100",      "name": "VN100",         "exchange": "HOSE" },
    { "code": "VNMID",      "name": "VN Mid Cap",    "exchange": "HOSE" },
    { "code": "VNSML",      "name": "VN Small Cap",  "exchange": "HOSE" },
    { "code": "VNALL",      "name": "VN All Share",  "exchange": "HOSE" },
    { "code": "HNX30",      "name": "HNX30",         "exchange": "HNX" }
  ],
  "meta": {
    "source": "STATIC",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T02:31:08.101204Z",
    "raw_endpoint": "static_mapping"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

Không có 4xx/5xx nào khác — endpoint không thể fail do dữ liệu.

**Fallback / suy giảm**

Không áp dụng: dữ liệu tĩnh, luôn 200. `?group=XYZ` không khớp → **`data: []` với status 200**
(khác hẳn `/reference/symbols`, nơi rỗng thành 502). Kết quả rỗng không được cache
(`_has_data` trả false).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/indices?group=HNX' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- `meta.raw_endpoint` là chuỗi cố định `"static_mapping"` (không phải URL). Giữ nguyên.
- **Từ vựng chỉ số ở đây KHÁC từ vựng `group` của `/reference/groups/{group}/symbols`**:
  ở đây là `VNMID`/`VNSML`/`VNALL`, còn endpoint groups yêu cầu `VNMidCap`/`VNSmallCap`/`VNAllShare`.
  Không được dùng lẫn. Xem bảng đầy đủ ở endpoint tiếp theo.
- `code` phân biệt hoa/thường theo đúng bảng trên (`HNXIndex`, `UPCOMIndex` — không phải `HNXINDEX`).

---

### GET /api/v1/market-data/reference/groups/{group}/symbols

> **Thành phần một nhóm chỉ số** — trả danh sách mã thuộc rổ chỉ số hoặc sàn (VN30, HNX30, ETF…).

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/groups/{group}/symbols:{md5(params)[0..12]}`, TTL `3600`s. `group` **không** được uppercase trong key (chỉ segment sau `quotes`/`company`/`trading`/`fundamentals`/`tickers` mới bị uppercase) |
| **Nguồn dữ liệu** | provider ngoài — VCI `GET https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group={group}` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `group` | `string` | Phải nằm **đúng chính tả, đúng hoa/thường** trong tập 18 giá trị bên dưới | Mã nhóm chỉ số / sàn / loại tài sản |

Tập `VALID_GROUPS` (18 giá trị, khớp `vietcap.VALID_GROUPS`):

| Nhóm | Giá trị |
|---|---|
| Sàn | `HOSE`, `HNX`, `UPCOM` |
| Rổ HOSE | `VN30`, `VN100`, `VNMidCap`, `VNSmallCap`, `VNAllShare` |
| Rổ HNX | `HNX30`, `HNXCon`, `HNXFin`, `HNXLCap`, `HNXMSCap`, `HNXMan` |
| Loại tài sản | `ETF`, `CW`, `BOND`, `FU_INDEX` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `source` | `string \| null` | Không | `null` | — | **KHÔNG CÓ TÁC DỤNG** (handler gọi `fetchWithFallback([["VCI", vci]])`). Vẫn tham gia cache key |

**Request body**

—

**Response 200**

~~~ts
type ListGroupSymbolsResponse = MdResponse<MdGroupSymbolItem[]>;
~~~

~~~json
{
  "data": [
    { "symbol": "FPT" },
    { "symbol": "VCB" },
    { "symbol": "HPG" },
    { "symbol": "VNM" },
    { "symbol": "TCB" }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T02:31:08.552810Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group=VN30"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `group` không nằm trong 18 giá trị hợp lệ (kiểm tra **trước** khi gọi upstream) | `Giá trị group 'VNMID' không hợp lệ. Cho phép: ['BOND', 'CW', 'ETF', 'FU_INDEX', 'HNX', 'HNX30', 'HNXCon', 'HNXFin', 'HNXLCap', 'HNXMSCap', 'HNXMan', 'HOSE', 'UPCOM', 'VN100', 'VN30', 'VNAllShare', 'VNMidCap', 'VNSmallCap']` |
| `502` | — | VCI lỗi HTTP/timeout, hoặc trả danh sách rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

`detail` của lỗi 422 là **string** (HTTPException trần), không phải array kiểu validate framework.
Danh sách trong message được render bằng `sorted(set)` của Python → **thứ tự và dấu nháy đơn phải
giữ nguyên y nguyên như trên** nếu muốn parity byte-level.

**Fallback / suy giảm**

Không có nguồn dự phòng. Nhóm hợp lệ nhưng upstream trả `[]` (ví dụ nhóm không có thành viên tại thời điểm đó)
→ **502**, không phải `200 []`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/groups/VN30/symbols' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Kiểm tra `group` là **so sánh chuỗi phân biệt hoa/thường** (`group not in VALID_GROUPS`).
  `vn30` → 422. `VNMID` → 422 (phải là `VNMidCap`).
- Normalize chịu được cả hai shape upstream: nếu phần tử là object thì lấy `item.symbol`,
  nếu là scalar thì `String(item)`. Nếu response không phải array → `[]` (→ 502).
- Kết quả **chỉ có field `symbol`** — không có tên, không có sàn. Client muốn tên phải join với
  `/reference/symbols` hoặc `/reference/search`.

---

## 4. Tham chiếu — bảng `symbols` trong Postgres (DB-backed)

Hai endpoint dưới đây **không gọi provider**. Chúng đọc bảng `symbols`, được nạp bởi script
`python -m app.scripts.seed_symbols` (nguồn: `fetch_search_bar(language=1)` merge với
`fetch_symbols_by_exchange()`, logo mặc định Simplize CDN). Vì vậy dữ liệu có thể **cũ** —
`last_synced_at` cho biết lần seed gần nhất.

Cột bảng `symbols` (`app/models/symbol.py`):
`id` (UUID, PK) · `symbol` (VARCHAR(10), unique, index) · `name` (VARCHAR(500)) ·
`short_name` (VARCHAR(255)) · `exchange` (VARCHAR(20), index) · `asset_type` (VARCHAR(50),
default `"stock"`, index) · `is_index` (BOOL, default `false`, index) ·
`current_price_vnd` (BIGINT) · `target_price_vnd` (BIGINT) · `upside_pct` (FLOAT) ·
`logo_url` (VARCHAR(2048)) · `logo_source` (VARCHAR(30)) · `icb_lv1` (VARCHAR(100)) ·
`icb_lv2` (VARCHAR(100)) · `source` (VARCHAR(50)) · `source_url` (VARCHAR(2048)) ·
`last_synced_at` (TIMESTAMPTZ) · `is_active` (BOOL, default `true`) ·
`created_at`, `updated_at` (TIMESTAMPTZ, từ `TimestampMixin`).

> **Thứ tự khai báo route là bắt buộc:** `/reference/symbols/search` phải được đăng ký **trước**
> `/reference/symbols/{symbol}`, nếu không chuỗi `search` sẽ bị bắt làm giá trị `symbol` và endpoint
> tìm kiếm trở nên không thể gọi. Trong NestJS: đặt method `search` phía trên method có `@Get(':symbol')`
> trong cùng controller.

### GET /api/v1/market-data/reference/symbols/search

> **Tìm kiếm mã trong DB nội bộ** — truy vấn bảng `symbols` với xếp hạng khớp chính xác → tiền tố → chứa, kèm phân trang.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | không (không có `@redis_cached`) |
| **Nguồn dữ liệu** | DB — bảng `symbols` (Postgres) |
| **Side-effect** | — (chỉ SELECT; hai câu lệnh: `COUNT(*)` trên subquery rồi SELECT có `OFFSET/LIMIT`) |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `q` | `string \| null` | Không | `null` | — | Từ khoá. Được `trim()` rồi `toUpperCase()`; ký tự `\`, `%`, `_` được escape để chống wildcard injection; tìm `ILIKE '%kw%'` trên **`symbol` OR `name` OR `short_name`** |
| `exchange` | `string \| null` | Không | `null` | — | Điều kiện `exchange = exchange.toUpperCase()` (khớp tuyệt đối) |
| `asset_type` | `string \| null` | Không | `null` | — | Điều kiện `asset_type = asset_type.toLowerCase()` (khớp tuyệt đối) |
| `include_indices` | `boolean` | Không | `false` | — | `false` → thêm điều kiện `is_index = false`. `true` → **không thêm điều kiện nào** (lấy cả mã thường và chỉ số) |
| `page` | `integer` | Không | `1` | `>= 1` | **1-based** |
| `page_size` | `integer` | Không | `20` | `1..100` | Số bản ghi mỗi trang |

Điều kiện luôn có: `is_active = true` (bản ghi đã bị `deactivate_missing` sẽ không xuất hiện).

**Request body**

—

**Response 200**

~~~ts
type SearchSymbolsDbResponse = SymbolSearchResponse;
~~~

~~~json
{
  "items": [
    {
      "symbol": "VNM",
      "name": "Công ty Cổ phần Sữa Việt Nam",
      "short_name": "Vinamilk",
      "exchange": "HOSE",
      "asset_type": "stock",
      "is_index": false,
      "logo_url": "https://cdn.simplize.vn/simplizevn/logo/VNM.jpeg",
      "current_price_vnd": 61800,
      "target_price_vnd": 74000,
      "upside_pct": 0.1974,
      "icb_lv1": "Hàng tiêu dùng",
      "icb_lv2": "Thực phẩm và đồ uống"
    },
    {
      "symbol": "VND",
      "name": "Công ty Cổ phần Chứng khoán VNDIRECT",
      "short_name": "VNDIRECT",
      "exchange": "HOSE",
      "asset_type": "stock",
      "is_index": false,
      "logo_url": "https://cdn.simplize.vn/simplizevn/logo/VND.jpeg",
      "current_price_vnd": 16250,
      "target_price_vnd": null,
      "upside_pct": null,
      "icb_lv1": "Tài chính",
      "icb_lv2": "Dịch vụ tài chính"
    }
  ],
  "total": 27,
  "page": 1,
  "page_size": 20,
  "total_pages": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `page < 1`, `page_size < 1`, `page_size > 100`, hoặc `include_indices` không parse được thành boolean | detail dạng **array** của framework, ví dụ `msg = "Input should be greater than or equal to 1"`, `type = "greater_than_equal"` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |
| `500` | — | Lỗi DB (không được bắt trong handler) | body do handler lỗi chung của app |

**Fallback / suy giảm**

Không có upstream nên không có suy giảm. Không tìm thấy gì → **`200`** với
`{"items": [], "total": 0, "page": <page>, "page_size": <page_size>, "total_pages": 0}`.
Lưu ý `total_pages = 0` khi `total = 0` (không phải `1`). Nếu `page` vượt `total_pages` thì
`items` rỗng nhưng `total` vẫn là tổng thật.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/symbols/search?q=VN&exchange=HOSE&page=1&page_size=20' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Sắp xếp** (bắt buộc giữ nguyên):
  - Có `q`: `ORDER BY rank, symbol ASC` với `rank = CASE WHEN symbol = :kw THEN 1 WHEN symbol ILIKE :kw || '%' THEN 2 ELSE 3 END`.
    `:kw` là từ khoá đã trim+uppercase; nhánh so sánh `= :kw` là **so sánh chính xác** (không ILIKE).
  - Không có `q`: `ORDER BY symbol ASC`.
- `total` được tính bằng `SELECT COUNT(*) FROM (<query đã áp mọi filter, kèm ORDER BY>) AS sub`
  — tức đếm **sau filter, trước phân trang**.
- `OFFSET = (page - 1) * page_size`.
- `total_pages = total > 0 ? Math.ceil(total / page_size) : 0`.
- Escape LIKE theo đúng thứ tự: `\` → `\\`, rồi `%` → `\%`, rồi `_` → `\_`; dùng `ESCAPE '\'`.
- `items` là bản **rút gọn 12 field** (`SymbolSearchItem`) — **không** có `id`, `created_at`,
  `updated_at`, `logo_source`, `source`, `source_url`, `last_synced_at`. Khác hẳn endpoint chi tiết.
- `page` ở đây là **1-based**, còn `page` của `POST /screening/search` là **0-based**. Đừng đồng bộ hoá chúng.
- Ghi chú vận hành: trên SQLite (môi trường test) `ILIKE` không phân biệt hoa/thường với ký tự có dấu
  tiếng Việt; trên Postgres thì có. Test hiện tại né bằng cách tìm chuỗi ASCII.

---

### GET /api/v1/market-data/reference/symbols/{symbol}

> **Chi tiết một mã trong DB nội bộ** — trả toàn bộ cột của bảng `symbols`, 404 nếu không tồn tại hoặc đã bị vô hiệu hoá.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `symbols`, `SELECT ... WHERE symbol = :symbol.toUpperCase()` (`scalar_one_or_none`) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | **Không** có regex/độ dài — mọi chuỗi đều nhận | Mã chứng khoán. Được `toUpperCase()` trước khi query, nên `fpt` và `FPT` tương đương |

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetSymbolDetailResponse = SymbolRead;
~~~

~~~json
{
  "id": "0f3b7c1a-5d24-4b6e-9a11-8c2f4d7e6b30",
  "symbol": "FPT",
  "name": "Công ty Cổ phần FPT",
  "short_name": "FPT",
  "exchange": "HOSE",
  "asset_type": "stock",
  "is_index": false,
  "current_price_vnd": 124700,
  "target_price_vnd": 168000,
  "upside_pct": 0.3472,
  "logo_url": "https://cdn.simplize.vn/simplizevn/logo/FPT.jpeg",
  "logo_source": "SIMPLIZE",
  "icb_lv1": "Công nghệ Thông tin",
  "icb_lv2": "Công nghệ Thông tin",
  "source": "VIETCAP_SEARCH_BAR",
  "source_url": null,
  "last_synced_at": "2026-08-16T22:10:04.517000Z",
  "is_active": true,
  "created_at": "2026-05-02T03:44:11.120333Z",
  "updated_at": "2026-08-16T22:10:04.519880Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `404` | — | Không có bản ghi, **hoặc** có nhưng `is_active = false` | `Không tìm thấy mã chứng khoán: FPT` (phần sau dấu hai chấm là `symbol.toUpperCase()` do client gửi) |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

Không có upstream. Không có fallback sang provider: mã tồn tại thật trên sàn nhưng **chưa được seed
vào bảng `symbols`** thì endpoint này vẫn trả **404**. Muốn dữ liệu provider thì phải dùng
`/reference/symbols` hoặc `/reference/search`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/symbols/FPT' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Điều kiện 404 là `record == null || !record.is_active` — **hai** trường hợp gộp một message.
  Message dùng `symbol.toUpperCase()` của **input**, không phải của bản ghi.
- Bản ghi inactive vẫn tồn tại trong DB nhưng bị coi như không có. Không được trả `is_active: false`.
- Response được serialize bằng `SymbolRead.model_dump()` (không `mode="json"`), sau đó framework
  encode: `id` thành chuỗi UUID, các `datetime` thành ISO-8601 với `Z`.
- Endpoint này **không nhận** `request: Request` (không có cache), nên trong NestJS không cần
  inject request.
- `upside_pct` là **tỷ lệ**, không phải phần trăm (0.3472 = +34,72%) — thừa hưởng
  `upsideToTpPercentage` từ Vietcap qua script seed.
- Đây là endpoint bắt-tất cho `/reference/symbols/*`: mọi path segment lạ sẽ vào đây và ra 404
  (`/reference/symbols/foo-bar` → `404 Không tìm thấy mã chứng khoán: FOO-BAR`).

---

## 5. Tham chiếu — tra cứu Vietcap IQ

Hai endpoint dưới đây dùng vỏ `IqProxyResponse<T>` (`{data, source_url}`), **không** dùng
`MdResponse`. Chúng gọi `_get_iq` của `vietcap_market_overview.py`, bóc vỏ bằng `_unwrap_iq` với
**hai lớp kiểm tra**:

1. Response không phải object → `MarketOverviewUpstreamShapeError("Expected dict from <url>, got <type>")` → 502.
2. `response.successful` falsy → `MarketOverviewUpstreamShapeError("API unsuccessful: <response.msg ?? 'unknown'>")` → 502.
3. Sau đó `_require_list(inner, "<label>")`: không phải array → `"Expected list from <label>, got <type>"` → 502.

Lỗi transport (mọi exception của `fetchJson`) → `MarketOverviewUpstreamError("GET <path>: <lỗi gốc>")` → 503.

### GET /api/v1/market-data/reference/search

> **Dữ liệu autocomplete thanh tìm kiếm** — ~2000 doanh nghiệp niêm yết + chỉ số, kèm giá hiện tại, giá mục tiêu và phân ngành ICB.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/search:{md5("language=1")[0..12]}`, TTL `3600`s |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `GET https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar?language={language}` |
| **Side-effect** | — |

**Path params**

—

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `language` | `integer` | Không | `1` | `1..2` | `1` = tiếng Việt, `2` = tiếng Anh. Truyền nguyên vào upstream; ảnh hưởng nội dung `name`/`short_name` |

**Request body**

—

**Response 200**

~~~ts
type GetSearchBarResponse = IqProxyResponse<MdSearchBarItem[]>;
~~~

~~~json
{
  "data": [
    {
      "code": "FPT",
      "name": "Công ty Cổ phần FPT",
      "short_name": "FPT",
      "floor": "HOSE",
      "is_index": false,
      "current_price": 124700,
      "target_price": 168000,
      "upside_pct": 0.3472,
      "logo_url": "https://vietcap-website.s3.ap-southeast-1.amazonaws.com/logo/FPT.webp",
      "icb_lv1": { "code": "9000", "name": "Công nghệ Thông tin", "level": 1 },
      "icb_lv2": { "code": "9500", "name": "Công nghệ Thông tin", "level": 2 }
    },
    {
      "code": "VNINDEX",
      "name": "VN-Index",
      "short_name": "VN-Index",
      "floor": "HOSE",
      "is_index": true,
      "current_price": 1642,
      "target_price": null,
      "upside_pct": null,
      "logo_url": "",
      "icb_lv1": null,
      "icb_lv2": null
    }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `language < 1` hoặc `language > 2` hoặc không phải số nguyên | detail dạng **array** của framework (`type = "less_than_equal"` / `"greater_than_equal"` / `"int_parsing"`) |
| `502` | — | Upstream trả không phải object | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v2/company/search-bar, got str` |
| `502` | — | Upstream trả `successful` falsy | `API unsuccessful: <msg của upstream, hoặc "unknown">` |
| `502` | — | `data` của upstream không phải array | `Expected list from search-bar, got dict` |
| `503` | — | Timeout / connect error / HTTP 4xx-5xx sau retry | `GET /api/iq-insight-service/v2/company/search-bar: <lỗi gốc>` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

Không có nguồn dự phòng, **không có validator** → upstream trả `data: []` thì endpoint trả
**`200` với `{"data": [], "source_url": "..."}`** (khác hẳn `/reference/symbols`). Response rỗng
không được cache. Ngoài giờ giao dịch, dữ liệu vẫn đầy đủ (đây là dữ liệu tham chiếu, không phải realtime),
nhưng `current_price` là giá đóng cửa phiên gần nhất.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/search?language=1' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Endpoint này KHÔNG nhận từ khoá.** Nó trả *toàn bộ* dataset (~2077 bản ghi) để client tự lọc
  phía trình duyệt. Đừng thêm param `q` — sẽ lệch hợp đồng.
- **Không phải discriminated union nhiều loại thực thể**: response chỉ có **một** loại item.
  Phân biệt duy nhất là boolean `is_index` (chỉ số như `VNINDEX`, `VN30` nằm cùng mảng với doanh nghiệp).
  Endpoint **không** trả kết quả ngành hay tin tức.
- Chỉ **11 field** được giữ lại từ upstream. Upstream còn `id`, `organCode`, `comTypeCode`, `isBank`,
  `inCu`, `projectedTsrPercentage`, `dividendPerShareTsr`, `icbLv3`, `icbLv4`, `phone`, `fax`, `tax`
  — **bị loại bỏ**. Nếu viết lại và giữ thêm field, hợp đồng sẽ khác.
- `icb_lv1`/`icb_lv2` **truyền thô** — trong dữ liệu thật là object `{code, name, level}`.
  Script seed phải gọi helper riêng (`_icb_to_str`: lấy `name` → `code` → `String(value)`) để nhét
  vào cột `VARCHAR(100)`. Endpoint này **không** gọi helper đó.
- `current_price`/`target_price` đi qua `_to_int_amount`: nhận `int`, `float`, hoặc chuỗi số
  (`"50300.0"`); dùng `Decimal` rồi **truncate** phần thập phân (kèm log warning); parse lỗi → `null`.
  Đơn vị **đồng**.
- `upside_pct` đi qua `_to_float_ratio` → **tỷ lệ** (`0.3472`), tên field gây nhầm là phần trăm.
- `name`/`short_name`/`floor`/`logo_url` default `""`; `is_index` default `false`.
- Với dòng `is_index: true`, `current_price` là **điểm chỉ số** (ví dụ `1642` cho VN-Index), không phải
  đồng — cùng một field mang hai đơn vị tuỳ theo `is_index`. `target_price`/`upside_pct` của dòng chỉ số
  thường là `null` (Vietcap Research không đặt giá mục tiêu cho chỉ số), nhưng backend không ép buộc điều đó.

---

### GET /api/v1/market-data/reference/event-codes

> **Bảng tra mã sự kiện** — ánh xạ mã sự kiện doanh nghiệp sang tên tiếng Việt/Anh, dùng để hiển thị lịch sự kiện.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/reference/event-codes:_`, TTL `3600`s (không có query param → hậu tố khoá là `_`) |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/event-codes` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetEventCodesResponse = IqProxyResponse<MdEventCode[]>;
~~~

~~~json
{
  "data": [
    { "event_code": "AGME", "event_name_vi": "Đại hội Đồng Cổ đông", "event_name_en": "Annual General Meeting" },
    { "event_code": "AGMR", "event_name_vi": "Nghị quyết đại hội cổ đông thường niên", "event_name_en": "AGM Resolution" },
    { "event_code": "AIS",  "event_name_vi": "Niêm yết thêm", "event_name_en": "Additional Listing" },
    { "event_code": "DIV",  "event_name_vi": "Trả cổ tức", "event_name_en": "Dividend" },
    { "event_code": "ISS",  "event_name_vi": "Phát hành thêm", "event_name_en": "Issuance" }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/event-codes"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | Upstream trả không phải object | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/event-codes, got list` |
| `502` | — | Upstream trả `successful` falsy | `API unsuccessful: <msg của upstream, hoặc "unknown">` |
| `502` | — | `data` không phải array | `Expected list from event-codes, got NoneType` |
| `503` | — | Timeout / connect error / HTTP error sau retry | `GET /api/iq-insight-service/v1/event-codes: <lỗi gốc>` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

Endpoint này **không có 422** — không có param nào để validate. OpenAPI của nó cũng không khai báo
response 422.

**Fallback / suy giảm**

Không có nguồn dự phòng, không validator → `data: []` được trả với `200` (không cache).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/reference/event-codes' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- Chỉ giữ **3 field**; phần tử không phải object trong `data` bị **bỏ qua im lặng** (filter, không lỗi).
- Các nhóm mã sự kiện được dùng ở endpoint lịch sự kiện (`/events/calendar`, ngoài chương này):
  cổ tức `ISS,DIV`; nội bộ `DDIND,DDRP,DDINS`; đại hội `EGME,AGME,AGMR`;
  khác `MOVE,MA,NLIS,AIS,RETU,OTHE,SUSP`. Bảng tra này chứa toàn bộ các mã đó.
- Dữ liệu gần như bất biến → TTL 3600s là hợp lý; có thể cân nhắc TTL dài hơn nhưng **đừng đổi** nếu muốn parity.

---

## 6. Báo giá

### GET /api/v1/market-data/quotes/{symbol}/ohlcv

> **Nến OHLCV** — trả chuỗi nến theo khung thời gian cho một mã, ưu tiên VNDirect và dự phòng Vietcap.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/quotes/{SYMBOL}/ohlcv:{md5(params)[0..12]}` — segment mã **được uppercase** trong khoá, TTL `300`s |
| **Nguồn dữ liệu** | provider ngoài — registry `quote.ohlcv`: VND `GET https://dchart-api.vndirect.com.vn/dchart/history?resolution={r}&symbol={SYM}&from={start_ts}&to={end_ts}` → fallback VCI `POST https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán hoặc mã chỉ số (`FPT`, `VCB`, `VNINDEX`, `VN30`) |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `start` | `string \| null` | Không | **hôm nay trừ 1 năm** | Đúng định dạng `YYYY-MM-DD` | Ngày bắt đầu. Parse thành `Date` tại **00:00 UTC** rồi lấy epoch giây |
| `end` | `string \| null` | Không | **thời điểm hiện tại** | Đúng định dạng `YYYY-MM-DD` | Ngày kết thúc. Parse thành `Date` tại **00:00 UTC** rồi lấy epoch giây |
| `interval` | `string` | Không | `"1D"` | ∈ `{1m, 5m, 15m, 30m, 1H, 1D, 1W, 1M}` | Khung nến. **Phân biệt hoa/thường**: `1M` = tháng, `1m` = 1 phút |
| `source` | `string \| null` | Không | `null` | — | Ép nguồn. Có tác dụng khi `toUpperCase()` ∈ `{VND, VCI}`. `auto` (hoặc bất kỳ giá trị khác) → bỏ qua, dùng chain đầy đủ |

Ánh xạ `interval` sang tham số upstream:

| `interval` | VND `resolution` | VCI `timeFrame` |
|---|---|---|
| `1m` | `1` | `ONE_DAY` ⚠️ |
| `5m` | `5` | `ONE_DAY` ⚠️ |
| `15m` | `15` | `ONE_DAY` ⚠️ |
| `30m` | `30` | `ONE_DAY` ⚠️ |
| `1H` | `60` | `ONE_DAY` ⚠️ |
| `1D` | `D` | `ONE_DAY` |
| `1W` | `W` | `ONE_WEEK` |
| `1M` | `M` | `ONE_MONTH` |

⚠️ `INTERVAL_MAP` của VCI **chỉ có 3 khoá** (`1D`, `1W`, `1M`); các khung intraday rơi vào default
`ONE_DAY`. Nghĩa là khi VND fail và fallback sang VCI với `interval=5m`, client nhận **nến ngày**
mà không có cảnh báo nào ngoài `meta.source = "VCI"`.

**Request body**

—

**Response 200**

~~~ts
type GetOhlcvResponse = MdResponse<MdOhlcvCandle[]>;
~~~

Ví dụ nhánh chính **VND** (giá tính bằng **nghìn đồng**, `time` là **number**, **không có** `value`):

~~~json
{
  "data": [
    { "time": 1755043200, "open": 121.8, "high": 123.9, "low": 121.5, "close": 123.5, "volume": 3982400 },
    { "time": 1755129600, "open": 123.5, "high": 125.4, "low": 123.1, "close": 124.7, "volume": 4820100 }
  ],
  "meta": {
    "source": "VND",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T02:31:09.884120Z",
    "raw_endpoint": "https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=FPT&from=1723852800&to=1755388800"
  }
}
~~~

Ví dụ nhánh dự phòng **VCI** (giá tính bằng **đồng**, `time` là **chuỗi số**, **có** `value` đơn vị **triệu đồng**):

~~~json
{
  "data": [
    { "time": "1755043200", "open": 121800, "high": 123900, "low": 121500, "close": 123500, "volume": 3982400, "value": 488912.7 },
    { "time": "1755129600", "open": 123500, "high": 125400, "low": 123100, "close": 124700, "volume": 4820100, "value": 595234.5 }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 2,
    "fallback_used": true,
    "as_of": "2026-08-17T02:31:11.226703Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `interval` ngoài tập hợp lệ — **kiểm tra ĐẦU TIÊN** | `Giá trị interval '2D' không hợp lệ. Cho phép: ['15m', '1D', '1H', '1M', '1W', '1m', '30m', '5m']` |
| `422` | — | `symbol` không khớp `^[A-Z0-9]{1,10}$` sau uppercase | `Mã chứng khoán không hợp lệ: INVALID!` |
| `422` | — | `end` không parse được `YYYY-MM-DD` | `Ngày kết thúc không hợp lệ: 2026-13-45` |
| `422` | — | `start` không parse được `YYYY-MM-DD` | `Ngày bắt đầu không hợp lệ: 17/08/2026` |
| `502` | — | Cả VND và VCI lỗi/trả rỗng | `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` |
| `502` | — | Đã ép `?source=VND` (hoặc `VCI`) và nguồn đó lỗi/rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Thứ tự kiểm tra bắt buộc** (không được đổi): `symbol = symbol.toUpperCase()` → kiểm `interval` →
kiểm regex `symbol` → parse `end` → parse `start`. Request vừa sai `interval` vừa sai `symbol`
sẽ nhận **lỗi interval**.

**Fallback / suy giảm**

- VND lỗi hoặc trả `[]` → thử VCI. VCI cũng rỗng → **502**. **Khoảng thời gian không có phiên nào
  (ví dụ `start=end=2026-01-01`, ngày lễ) trả 502, KHÔNG phải `200 []`.** Đây là điểm khác biệt lớn nhất
  so với thiết kế "trả mảng rỗng" mà lập trình viên thường mặc định.
- Không có cache dài hạn / không giữ dữ liệu phiên trước ngoài Redis TTL 300s.
- Không có 503 ở endpoint này (mọi lỗi upstream gộp thành 502).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/quotes/FPT/ohlcv?start=2026-01-01&end=2026-08-17&interval=1D' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

Ép nguồn VCI (để lấy `value` — giá trị giao dịch từng nến):

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/quotes/VNINDEX/ohlcv?end=2026-08-17&interval=1D&source=VCI' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **BẪY ĐƠN VỊ SỐ MỘT CỦA CẢ CHƯƠNG.** Cùng một endpoint, hai đơn vị giá:
  VND dchart trả **kVND** (`123.5` = 123.500 đ), VCI gap-chart trả **VND** (`123500`).
  Backend **không** chuẩn hoá. Xác nhận trong `app/services/virtual_trading/price_resolver.py`:
  nhánh VND nhân `1000` (`_VND_OHLCV_MULTIPLIER = 1000`), nhánh VCI nhân `1`.
  Client **phải** đọc `meta.source` để biết đơn vị. Nếu viết lại và "sửa" cho thống nhất,
  bạn phá vỡ mọi client hiện có — hãy giữ nguyên và ghi chú.
- **BẪY KIỂU `time`.** VND trả `t` là số nguyên; VCI trả `t` là **chuỗi số** (`"1415145600"`).
  Xác nhận trong `app/services/ta/data.py` (`raw_t.isdigit()` branch được thêm để sửa bug
  "0 sessions"). Type là `number | string`.
- **VCI bỏ qua `start` hoàn toàn.** Payload gap-chart chỉ gồm `{timeFrame, symbols: [SYM], to: end_ts, countBack: 1000}`.
  Nghĩa là nhánh VCI trả **tối đa 1000 nến** đếm ngược từ `end`, bất kể `start`. Nhánh VND thì
  dùng cả `from` và `to`. Cùng một request có thể cho hai khoảng dữ liệu khác nhau.
- **`start`/`end` được parse ở UTC**, không ở `Asia/Ho_Chi_Minh`. `end=2026-08-17` → epoch của
  17/08 00:00 UTC = 17/08 07:00 giờ VN, nên nến của chính ngày `end` có thể bị loại. So sánh:
  `app/services/ta/data.py` parse ngày ở `UTC+7`. Sự bất nhất này là hành vi hiện tại.
- **Không kiểm tra `start <= end`.** Khoảng đảo ngược cho `[]` → 502.
- Default `start` được tính bằng `now.replace(year=now.year - 1)`. Trên Python đây là **lỗi tiềm ẩn
  vào 29/02**: `Date(2028-02-29).replace(year=2027)` ném `ValueError` → 500. Khi viết lại bằng TS,
  `new Date(...)` sẽ tự trượt sang 01/03 thay vì lỗi — hãy quyết định rõ và ghi chú (khuyến nghị:
  trừ 365 ngày hoặc clamp ngày, đồng thời không để 500).
- `value` chỉ có ở nhánh VCI, mang **triệu đồng** (`accumulatedValue` của gap-chart). Xác nhận trong
  `app/services/ai/market_analysis/payload.py` (chia `_MILLION_PER_B` để ra tỷ đồng). Nhánh VND
  **không có** key này (không phải `null` — key vắng mặt hoàn toàn).
- Cả hai nguồn trả nến theo **thứ tự tăng dần theo thời gian** (cũ → mới); `price_resolver` lấy
  `data[data.length - 1]` làm nến gần nhất.
- Normalize theo mảng song song: `t/o/h/l/c/v` (VCI thêm `accumulatedValue`); nếu mảng phụ ngắn hơn
  `t` thì phần tử thiếu được điền `0` (`value` điền `null`).
- Nhánh VCI đọc `data[0]` của response (array chứa 1 object cho 1 symbol); response không phải
  array hoặc rỗng → `[]`.

---

### GET /api/v1/market-data/quotes/{symbol}/intraday

> **Khớp lệnh trong phiên** — danh sách các lệnh đã khớp (tick) của một mã trong phiên hiện tại.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/quotes/{SYMBOL}/intraday:{md5(params)[0..12]}`, TTL `15`s, **`cacheEmpty: true`** (mảng rỗng cũng được cache) |
| **Nguồn dữ liệu** | provider ngoài — VCI `POST https://trading.vietcap.com.vn/api/market-watch/LEData/getAll` với body `{"symbol": "<SYM>", "limit": <page_size>}` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page_size` | `integer` | Không | `100` | `1..30000` | Số tick tối đa. Được truyền vào upstream dưới tên **`limit`** |
| `source` | `string \| null` | Không | `null` | — | **KHÔNG CÓ TÁC DỤNG** (handler gọi `fetchWithFallback([["VCI", vci]], { allowEmpty: true })`). Vẫn tham gia cache key |

Không có param phân trang thực sự (không `page`, không cursor). Hàm source `fetch_intraday` có
tham số `last_time` (map sang `truncTime` của upstream để phân trang theo con trỏ thời gian)
nhưng **endpoint không expose nó** — nếu cần phân trang trong bản viết lại, đây là chỗ móc vào,
nhưng thêm param sẽ làm lệch hợp đồng hiện tại.

**Request body**

—

**Response 200**

~~~ts
type GetIntradayResponse = MdResponse<MdIntradayTick[]>;
~~~

~~~json
{
  "data": [
    {
      "time": "1755407700",
      "price": 124700,
      "volume": 300,
      "side": "unknown",
      "accumulated_volume": 4820100,
      "accumulated_value": 601035.6
    },
    {
      "time": "1755407640",
      "price": 124600,
      "volume": 1200,
      "side": "shark",
      "accumulated_volume": 4819800,
      "accumulated_value": 600998.2
    }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T07:15:03.114582Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/market-watch/LEData/getAll"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `page_size < 1` hoặc `> 30000` hoặc không phải số nguyên — validate của framework, chạy **trước** handler | detail dạng **array** (`type = "less_than_equal"`, `msg = "Input should be less than or equal to 30000"`) |
| `422` | — | `symbol` không khớp `^[A-Z0-9]{1,10}$` sau uppercase | `Mã chứng khoán không hợp lệ: FPT-X` |
| `502` | — | VCI lỗi HTTP/timeout sau retry | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- `allowEmpty: true` → **ngoài giờ giao dịch (và với mã chưa có lệnh khớp nào trong phiên) endpoint
  trả `200` với `data: []`**, không 502. Đây là một trong hai endpoint duy nhất của chương có hành vi này.
- Mảng rỗng vẫn được ghi vào Redis 15s (`cacheEmpty: true`) → tránh đập upstream ngoài phiên.
- Không có nguồn dự phòng, không giữ dữ liệu phiên trước. Chỉ lỗi transport thật (sau 3 lần retry)
  mới thành 502.
- Nếu upstream trả object thay vì array → normalize cho `[]` → **`200 []`** (không phải 502), vì
  `allowEmpty` bỏ qua validator.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/quotes/FPT/intraday?page_size=100' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Thứ tự: mới nhất trước.** `app/services/virtual_trading/price_resolver.py` gọi
  `fetch_intraday(symbol, page_size=1)` rồi lấy **`data[0]`** làm giá realtime gần nhất
  → upstream trả tick mới nhất ở đầu mảng. Giữ nguyên, không sort lại.
- **Đơn vị `price` là ĐỒNG** (`124700` = 124.700 đ) — khẳng định bởi comment và `multiplier=1`
  trong `price_resolver`. Khác hẳn nhánh VND của `/ohlcv`.
- `volume` là **số cổ phiếu** (không phải lô) và trả về dạng **float** vì đi qua `_to_num`
  (test khẳng định `volume == 100.0`). Đừng ép về `int`.
- **`side` là chuỗi thô, KHÔNG phải enum mua/bán.** Backend chỉ copy `matchType` của VCI, default `""`,
  không map, không chuẩn hoá. **SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI (Vietcap Trading).**
  Các giá trị đã xuất hiện trong fixture của repo: `"unknown"`, `"shark"`. Không có bảng enum nào trong
  source, nên **tuyệt đối không** suy diễn `"B"`/`"S"`/`"buy"`/`"sell"`. Nếu UI cần "mua/bán chủ động"
  thì dùng `buy_volume`/`sell_volume` của `/price-depth` — chỗ đó ngữ nghĩa rõ ràng.
- `accumulated_value`: **giữ nguyên giá trị thô**, backend không nhân/chia. Lưu ý nguồn khác
  (`price/symbols/getList` dùng cho bảng giá) có `accumulatedValue` đơn vị **triệu đồng** và ở đó
  backend nhân `1e6` — nhưng ở LEData thì **không**. Đừng suy đơn vị chéo giữa hai API.
- `_to_num` biến mọi giá trị không parse được thành `0.0` (kể cả `null`) → không field số nào là `null`.
- Trong khoá cache, `{SYMBOL}` bị uppercase (vì segment nằm ngay sau `quotes`), nên
  `/quotes/fpt/intraday` và `/quotes/FPT/intraday` dùng **cùng một** entry cache.

---

### GET /api/v1/market-data/quotes/{symbol}/price-depth

> **Bậc giá tích lũy** — khối lượng khớp lũy kế tại từng mức giá trong phiên, tách theo bên chủ động mua/bán.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/quotes/{SYMBOL}/price-depth:{md5(params)[0..12]}`, TTL `15`s, **`cacheEmpty: true`** |
| **Nguồn dữ liệu** | provider ngoài — VCI `POST https://trading.vietcap.com.vn/api/market-watch/AccumulatedPriceStepVol/getSymbolData` với body `{"symbol": "<SYM>"}` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | Sau `toUpperCase()` phải khớp `^[A-Z0-9]{1,10}$` | Mã chứng khoán |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `source` | `string \| null` | Không | `null` | — | **KHÔNG CÓ TÁC DỤNG** (handler gọi `fetchWithFallback([["VCI", vci]], { allowEmpty: true })`). Vẫn tham gia cache key |

**Request body**

—

**Response 200**

~~~ts
type GetPriceDepthResponse = MdResponse<MdPriceDepthStep[]>;
~~~

~~~json
{
  "data": [
    { "price": 125400, "volume": 109500, "buy_volume": 86300, "sell_volume": 4800, "undefined_volume": 18400 },
    { "price": 125000, "volume": 412700, "buy_volume": 198400, "sell_volume": 201600, "undefined_volume": 12700 },
    { "price": 124700, "volume": 1284300, "buy_volume": 602100, "sell_volume": 651500, "undefined_volume": 30700 },
    { "price": 124400, "volume": 336800, "buy_volume": 121000, "sell_volume": 215800, "undefined_volume": 0 }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T07:15:03.552901Z",
    "raw_endpoint": "https://trading.vietcap.com.vn/api/market-watch/AccumulatedPriceStepVol/getSymbolData"
  }
}
~~~

Cấu trúc một bậc giá: `price` là **mức giá**, `volume` là **tổng KL đã khớp tại mức giá đó trong phiên**;
`buy_volume` + `sell_volume` + `undefined_volume` phân rã `volume` theo bên **chủ động** (mua chủ động /
bán chủ động / không xác định — phiên ATO/ATC, giao dịch thoả thuận). Backend **không kiểm tra** đẳng thức
tổng, cũng không sắp xếp lại — thứ tự do upstream quyết định.

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` không khớp `^[A-Z0-9]{1,10}$` sau uppercase | `Mã chứng khoán không hợp lệ: FPT.HM` |
| `502` | — | VCI lỗi HTTP/timeout sau retry | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- `allowEmpty: true` → **ngoài giờ giao dịch trả `200` với `data: []`**, không 502. Mảng rỗng
  được cache 15s.
- Không nguồn dự phòng, không giữ dữ liệu phiên trước. Upstream trả object thay vì array → `200 []`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/quotes/FPT/price-depth' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Upstream trả TẤT CẢ số dưới dạng CHUỖI** (`"63000.0"`, `"109500.0"`). Backend bắt buộc ép về number
  qua `_to_num`; test `tests/test_market_data.py::test_price_depth` kiểm tra chính xác điều này
  (`isinstance(row["price"], (int, float))`). Nếu bản TS trả `"63000.0"`, test parity sẽ fail.
- `_to_num` trả `0.0` khi `null`/parse lỗi → không field nào null. `undefined_volume: 0` là giá trị
  hợp lệ, không phải "thiếu dữ liệu".
- Ánh xạ tên field: `priceStep` → `price`, `accumulatedVolume` → `volume`,
  `accumulatedBuyVolume` → `buy_volume`, `accumulatedSellVolume` → `sell_volume`,
  `accumulatedUndefinedVolume` → `undefined_volume`.
- Đơn vị `price` là **đồng**; `volume` là **số cổ phiếu**, trả dạng float.
- Endpoint không có param nào ngoài `source` (vô dụng) → cache key hầu như luôn là hậu tố `_`
  khi client không gửi `source`.

---

## 7. Bộ lọc cổ phiếu (Screening)

Ba endpoint dùng vỏ `IqProxyResponse<T>`. Chúng gọi `vietcap_screening.py` với base
`https://iq.vietcap.com.vn/api/iq-insight-service` và header ghi đè
`Referer: https://trading.vietcap.com.vn/iq/screening`. Bóc vỏ bằng `_unwrap`:

- Response không phải object → `ScreeningUpstreamShapeError("Expected dict from <url>, got <type>")` → **502**.
- **KHÁC nhóm market-overview: `_unwrap` của screening KHÔNG kiểm tra `successful`.** Nó chỉ lấy
  `response.data`. Nếu upstream trả `{"status": 500}` thì `inner = undefined` và lỗi shape phát sinh
  ở bước `_require_list`/`_require_dict` với `got NoneType`.
- Lỗi transport → `ScreeningUpstreamError("<METHOD> <path>: <lỗi gốc>")` → **503**.

### GET /api/v1/market-data/screening/criteria

> **Catalog tiêu chí lọc** — 34 tiêu chí chia theo 3 nhóm, kèm loại điều khiển (multi-select / range / value-select), min/max và danh sách option.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/screening/criteria:_`, TTL `3600`s |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/criteria` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetScreeningCriteriaResponse = IqProxyResponse<ScreeningCriterion[]>;
~~~

~~~json
{
  "data": [
    {
      "id": "697cae6a1ac33a766fea7e53",
      "category": "general",
      "name": "sectorLv1",
      "order": 1,
      "allow_duplicate": false,
      "select_type": "multiple",
      "slider_stepper": null,
      "multiplier": null,
      "min": null,
      "max": null,
      "condition_options": [
        { "type": "value", "viName": "Bất động sản", "enName": "Real Estate", "value": "8600" },
        { "type": "value", "viName": "Tài chính", "enName": "Financials", "value": "8000" }
      ],
      "condition_extra": null,
      "active": true
    },
    {
      "id": "697cae6a1ac33a766fea7e57",
      "category": "general",
      "name": "exchange",
      "order": 5,
      "allow_duplicate": false,
      "select_type": "multiple",
      "slider_stepper": null,
      "multiplier": null,
      "min": null,
      "max": null,
      "condition_options": [
        { "type": "value", "viName": "HOSE", "enName": "HOSE", "value": "hsx" },
        { "type": "value", "viName": "HNX", "enName": "HNX", "value": "hnx" },
        { "type": "value", "viName": "UPCOM", "enName": "UPCOM", "value": "upcom" }
      ],
      "condition_extra": null,
      "active": true
    },
    {
      "id": "697cae6a1ac33a766fea7e61",
      "category": "technical",
      "name": "rs",
      "order": 14,
      "allow_duplicate": false,
      "select_type": "slider",
      "slider_stepper": 1,
      "multiplier": null,
      "min": 0,
      "max": 100,
      "condition_options": [],
      "condition_extra": ["1Month", "3Month", "6Month", "12Month"],
      "active": true
    }
  ],
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/criteria"
}
~~~

> ⚠️ **Chưa xác minh được từ source:** giá trị `select_type` duy nhất xuất hiện trong source Python và
> fixture test của repo là **`"multiple"`**. Trong object thứ ba ở trên, `select_type: "slider"`,
> `slider_stepper: 1` và nội dung `condition_extra` là **chỗ giữ chỗ theo dạng dữ liệu**, không phải
> giá trị đã xác minh — `docs/vietcap-screening-api.md` chỉ ghi *kiểu điều khiển UI* ("range/slider"),
> không ghi giá trị API. **SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI IQ Insight.**
> Trước khi hardcode enum cho `select_type`, phải gọi API thật một lần và chốt danh sách.

Catalog gồm **34 tiêu chí** trong 3 `category` (theo `docs/vietcap-screening-api.md`):

**`general` — Thông tin chung (12 tiêu chí)**

| # | `name` | Nhãn | Kiểu | min | max | `conditionExtra` (in đậm = default) |
|---|---|---|---|---|---|---|
| 1 | `sectorLv1` | Ngành cấp 1 | multi-select | — | — | — |
| 2 | `sector` | Ngành cấp 2 | multi-select | — | — | — |
| 3 | `sectorLv3` | Ngành cấp 3 | multi-select | — | — | — |
| 4 | `sectorLv4` | Ngành cấp 4 | multi-select | — | — | — |
| 5 | `exchange` | Sàn | multi-select | — | — | — |
| 6 | `marketCap` | Vốn hoá (tỷ VND) | range | 0 | 2.000.000 | — |
| 7 | `marketPrice` | Giá (VND) | range | 0 | 2.000.000 | — |
| 8 | `dailyPriceChangePercent` | Thay đổi giá (%) | range | -15 | 15 | — |
| 9 | `adtv` | GTGD trung bình (tỷ VND) | range | 0 | 2.000 | `10Days`, `20Days`, **`30Days`** |
| 10 | `tradingValueAdtv` | GTGD/ADTV (%) | range | — | — | `10Days`, `20Days`, **`30Days`** |
| 11 | `avgVolume` | KL trung bình | range | 0 | 200.000.000 | `10Days`, `20Days`, **`30Days`** |
| 12 | `esVolumeVsAvgVolume` | KL ước tính / KL TB (%) | range | — | — | `10Days`, `20Days`, **`30Days`** |

**`technical` — Tín hiệu kỹ thuật (15 tiêu chí)**

| # | `name` | Nhãn | Kiểu | min | max | `conditionExtra` |
|---|---|---|---|---|---|---|
| 13 | `stockStrength` | Sức mạnh giá | range | 0 | 100 | — |
| 14 | `rs` | RS (Relative Strength) | range | 0 | 100 | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 15 | `rsi` | RSI | range | 0 | 100 | — |
| 16 | `priceEma` | Giá vs EMA (%) | range | -50 | 50 | **`ema20`**, `ema50`, `ema100`, `ema200` |
| 17 | `ema20Ema50` | EMA20 vs EMA50 (%) | range | — | — | — |
| 18 | `ema50Ema200` | EMA50 vs EMA200 (%) | range | — | — | — |
| 19 | `priceReturn` | Hiệu suất giá (%) | range | -100 | 100 | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 20 | `outperformsIndex` | Vượt chỉ số (%) | range | — | — | `Ytd`, `1Month`, **`3Month`**, `6Month`, `12Month` |
| 21 | `priceFluctuation` | Biến động giá (%) | range | — | — | `1Month`, **`3Month`**, `6Month`, `12Month` |
| 22 | `macd` | MACD | range | — | — | — |
| 23 | `histogram` | MACD Histogram | value-select | — | — | — |
| 24 | `adx` | ADX | range | 0 | 100 | — |
| 25 | `stockTrend` | Xu hướng cổ phiếu | value-select | — | — | — |
| 26 | `aoTrend` | AO Trend | value-select | — | — | — |
| 27 | `ichimoku` | Ichimoku | value-select | — | — | — |

**`fundamental` — Chỉ số tài chính (7 tiêu chí)**

| # | `name` | Nhãn | Kiểu | min | max | `conditionExtra` |
|---|---|---|---|---|---|---|
| 28 | `ttmPe` | P/E (lần) | range | 0 | 100 | — |
| 29 | `ttmPb` | P/B (lần) | range | 0 | 100 | — |
| 30 | `ttmRoe` | ROE (%) | range | -50 | 50 | — |
| 31 | `npatmiGrowth` | Tăng trưởng LNST (%) | range | -100 | 500 | Quý dạng `Q1,2026` + `YoY`/`QoQ` |
| 32 | `revenueGrowth` | Tăng trưởng doanh thu (%) | range | -100 | 500 | Quý dạng `Q1,2026` + `YoY`/`QoQ` |
| 33 | `netMargin` | Biên LN ròng (%) | range | — | — | — |
| 34 | `grossMargin` | Biên LN gộp (%) | range | — | — | — |

Giá trị của các tiêu chí **value-select**:

| `name` | Giá trị | Ý nghĩa |
|---|---|---|
| `histogram` | `aboveSignal` / `belowSignal` | Trên / dưới đường tín hiệu |
| `stockTrend` | `STRONG_UPTREND`, `UPTREND`, `DOWNTREND`, `STRONG_DOWNTREND` | Đã tăng mạnh / tăng / giảm / giảm mạnh |
| `aoTrend` | `ABOVE_ZERO`, `BELOW_ZERO`, `CROSS_ABOVE`, `CROSS_BELOW` | Trên 0 / dưới 0 / cắt lên 0 / cắt xuống 0 |
| `ichimoku` | `PRICE_ABOVE_CLOUD`, `PRICE_IN_CLOUD`, `PRICE_BELOW_CLOUD`, `CROSS_ABOVE` | Giá trên mây / trong mây / dưới mây / cắt lên trên mây |
| `exchange` | `hsx`, `hnx`, `upcom` | HOSE / HNX / UPCOM — **chữ thường, `hsx` không phải `hose`** |
| `sectorLv1` | 13 mã ICB cấp 1 dạng chuỗi số (`"8600"`, `"8000"`, …) | Lấy từ `condition_options` của tiêu chí |

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | Response upstream không phải object | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/criteria, got str` |
| `502` | — | `data` của upstream không phải array (kể cả `undefined`) | `Expected list from screening/criteria, got str` / `... got NoneType` |
| `503` | — | Timeout / connect error / HTTP error sau retry | `GET /v1/screening/criteria: <lỗi gốc>` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

Không có 422 (không param nào).

**Fallback / suy giảm**

Không nguồn dự phòng, không validator → `data: []` trả `200` (không cache vì rỗng). Dữ liệu này là
catalog gần như tĩnh; nếu upstream chết, endpoint trả 503 và UI bộ lọc không dựng được form.
Khuyến nghị (chưa có trong bản Python): giữ bản snapshot fallback — nhưng **đừng bật mặc định**
nếu muốn parity.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/screening/criteria' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **Trộn hai kiểu naming trong cùng một response**: 13 field cấp ngoài là snake_case
  (`allow_duplicate`, `select_type`, `slider_stepper`, `condition_options`, `condition_extra`),
  còn **nội dung bên trong `condition_options` và `condition_extra` là camelCase thô của provider**
  (`viName`, `enName`, `type`, `value`). Không được "sửa cho đẹp".
- Default khi upstream thiếu field: `id`/`category`/`name`/`select_type` → `""`;
  `allow_duplicate` → `false`; `active` → `true`; `condition_options` → `[]`;
  `order`/`slider_stepper`/`multiplier`/`min`/`max`/`condition_extra` → `null`.
- Phần tử không phải object trong `data` bị **bỏ qua im lặng**.
- `min`/`max` là **đơn vị hiển thị của UI**, không phải đơn vị của response `/screening/search`:
  `marketCap` ở đây tính **tỷ VND** (max 2.000.000) nhưng `market_cap` trong kết quả lọc là **đồng**
  (`126570579090300`). Còn `adtv` trong bộ preset lại gửi giá trị **đồng** (`from: 10000000000`).
  Đơn vị của từng tiêu chí do Vietcap quyết định — không suy diễn, hãy đọc preset để biết đơn vị thực dụng.

---

### POST /api/v1/market-data/screening/search

> **Lọc cổ phiếu** — nhận bộ tiêu chí, trả danh sách mã thoả điều kiện kèm sort và phân trang.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | không (POST, không có `@redis_cached`) |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `POST https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/paging` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

~~~ts
interface ScreeningSearchRequest {
  /** 0-based. min 0. Default 0. */
  page?: number;
  /** 1..200. Default 50. */
  pageSize?: number;
  /** Default ["stockStrength"]. Không có whitelist — chuỗi tuỳ ý được chuyển thẳng lên upstream. */
  sortFields?: string[];
  /** Mỗi phần tử phải parse thành "ASC" | "DESC" (nhập chữ thường vẫn được, sẽ uppercase). Default ["DESC"]. */
  sortOrders?: string[];
  /** Default []. Mảng rỗng = không lọc = trả tất cả mã. */
  filter?: Array<{
    name: string;
    conditionOptions?: Array<{
      type?: string | null;
      value?: string | null;
      from?: number | null;
      to?: number | null;
    }>;
    extraName?: string | null;
  }>;
}
~~~

Ví dụ thực tế: cổ phiếu HOSE/HNX ngành bất động sản + tài chính, vốn hoá 500–100.000 tỷ,
sức mạnh giá ≥ 70, RS 3 tháng ≥ 50, giá trên EMA20:

~~~json
{
  "page": 0,
  "pageSize": 50,
  "sortFields": ["stockStrength"],
  "sortOrders": ["DESC"],
  "filter": [
    { "name": "exchange", "conditionOptions": [
        { "type": "value", "value": "hsx" },
        { "type": "value", "value": "hnx" }
    ]},
    { "name": "sectorLv1", "conditionOptions": [
        { "type": "value", "value": "8600" },
        { "type": "value", "value": "8000" }
    ]},
    { "name": "marketCap",     "conditionOptions": [{ "from": 500, "to": 100000 }] },
    { "name": "stockStrength", "conditionOptions": [{ "from": 70, "to": 100 }] },
    { "name": "rs",            "conditionOptions": [{ "from": 50, "to": 100 }], "extraName": "3Month" },
    { "name": "priceEma",      "conditionOptions": [{ "from": 0,  "to": 50  }], "extraName": "ema20" }
  ]
}
~~~

**Response 200**

~~~ts
type PostScreeningSearchResponse = IqProxyResponse<ScreeningPagingResult>;
~~~

~~~json
{
  "data": {
    "content": [
      {
        "ticker": "FPT",
        "exchange": "HOSE",
        "ref_price": 123500,
        "ceiling": 132100,
        "market_price": 124700,
        "floor": 114900,
        "accumulated_value": 601035600000,
        "accumulated_volume": 4820100,
        "market_cap": 126570579090300,
        "daily_price_change_percent": 0.97,
        "en_organ_name": "FPT Corporation",
        "vi_organ_name": "Công ty Cổ phần FPT",
        "en_organ_short_name": "FPT Corp",
        "vi_organ_short_name": "FPT",
        "icb_code_lv2": "9500",
        "en_sector": "Technology",
        "vi_sector": "Công nghệ Thông tin",
        "icb_code_lv4": "9537",
        "stock_strength": 88
      },
      {
        "ticker": "HPG",
        "exchange": "HOSE",
        "ref_price": 27350,
        "ceiling": 29250,
        "market_price": 27600,
        "floor": 25450,
        "accumulated_value": 812446000000,
        "accumulated_volume": 29438500,
        "market_cap": 176524800000000,
        "daily_price_change_percent": 0.91,
        "en_organ_name": "Hoa Phat Group Joint Stock Company",
        "vi_organ_name": "Công ty Cổ phần Tập đoàn Hòa Phát",
        "en_organ_short_name": "Hoa Phat Group",
        "vi_organ_short_name": "Hòa Phát",
        "icb_code_lv2": "1700",
        "en_sector": "Basic Resources",
        "vi_sector": "Tài nguyên Cơ bản",
        "icb_code_lv4": "1757",
        "stock_strength": 74
      }
    ],
    "total_elements": 312,
    "total_pages": 7,
    "page": 0,
    "page_size": 50,
    "first": true,
    "last": false,
    "empty": false
  },
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/paging"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `sortOrders` không phải array | detail array, `msg = "Value error, sortOrders phải là một danh sách"` |
| `422` | — | Một phần tử `sortOrders` không phải chuỗi, hoặc uppercase không ∈ `{ASC, DESC}` | detail array, `msg = "Value error, sortOrders[0]='INVALID' không hợp lệ. Cho phép: ASC, DESC"` |
| `422` | — | `pageSize > 200` hoặc `< 1` | detail array, `type = "less_than_equal"` / `"greater_than_equal"` |
| `422` | — | `page < 0` | detail array, `type = "greater_than_equal"` |
| `422` | — | `filter[i].name` thiếu | detail array, `type = "missing"`, `loc = ["body","filter",0,"name"]` |
| `502` | — | Upstream trả không phải object | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/screening/paging, got str` |
| `502` | — | `data` của upstream không phải object | `Expected dict from screening/paging, got str` |
| `502` | — | `data.content` không phải array | `Expected list from screening/paging.content, got dict` |
| `503` | — | Timeout / connect error / HTTP error sau retry | `POST /v1/screening/paging: <lỗi gốc>` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

**Fallback / suy giảm**

- Không nguồn dự phòng, không validator ở tầng fallback. Bộ lọc không khớp mã nào → upstream trả
  `content: []` → endpoint trả **`200`** với
  `{"content": [], "total_elements": 0, "total_pages": 0, "page": 0, "page_size": 50, "first": true, "last": true, "empty": true}`.
- Body rỗng `{}` là hợp lệ (mọi field có default) → lọc tất cả mã, sort `stockStrength DESC`,
  trang 0 × 50.
- Upstream chết → 503; upstream trả shape lạ → 502. Không có bản cache dự phòng.

**curl**

~~~bash
curl -sS -X POST 'https://api.iqx.vn/api/v1/market-data/screening/search' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555' \
  -d '{
    "page": 0,
    "pageSize": 50,
    "sortFields": ["stockStrength"],
    "sortOrders": ["DESC"],
    "filter": [
      { "name": "exchange", "conditionOptions": [{ "type": "value", "value": "hsx" }] },
      { "name": "marketCap", "conditionOptions": [{ "from": 500, "to": 100000 }] },
      { "name": "rs", "conditionOptions": [{ "from": 50, "to": 100 }], "extraName": "3Month" }
    ]
  }'
~~~

**Ghi chú khi viết lại**

- **Tên field body là `filter` (số ít), không phải `filters`.** Nhưng khi dựng payload upstream,
  key cũng là `filter`. Đừng đổi.
- **Handler dựng lại từng condition và LOẠI BỎ key có giá trị `null`/vắng mặt:**
  `{"type": null, "value": "hsx", "from": null, "to": null}` → gửi lên upstream thành `{"value": "hsx"}`.
  Điều kiện toàn `null` → gửi lên `{}` (object rỗng) — vẫn được thêm vào mảng, không bị lọc.
- **`extraName` chỉ được gửi khi truthy**: `extraName: ""` hoặc `null` → **key bị bỏ hẳn**
  khỏi payload upstream (`if f.extra_name`). `conditionOptions` thì luôn được gửi, kể cả `[]`.
- **Service thay giá trị falsy bằng default lần thứ hai:** `sortFields: []` → upstream nhận
  `["stockStrength"]`; `sortOrders: []` → `["DESC"]`; `filter: []` → `[]`.
  Nghĩa là **không thể gửi "không sort"**.
- **Chỉ `sortOrders` được validate.** `sortFields` là chuỗi tuỳ ý, không whitelist, không kiểm tra
  độ dài khớp với `sortOrders`. Gửi `sortFields: ["khongTonTai"]` sẽ chuyển thẳng lên Vietcap.
- **Alias nhân đôi (tác dụng phụ của `populate_by_name = True`):** ngoài `pageSize`, `sortFields`,
  `sortOrders`, `conditionOptions`, `extraName`, `from`, `to`, body **cũng chấp nhận** dạng snake_case
  của tên field Python: `page_size`, `sort_fields`, `sort_orders`, `condition_options`, `extra_name`,
  `from_val`, `to_val`. Đây là tai nạn của Pydantic, không phải thiết kế. Nếu bản TS chỉ nhận camelCase
  thì phải xác nhận không client nào đang dùng dạng kia (khuyến nghị: nhận cả hai để an toàn, ưu tiên camelCase).
- **`page` là 0-based** ở đây, còn `/reference/symbols/search` là 1-based. Đừng đồng bộ hoá.
- Response giữ **19 field** cho mỗi dòng. Upstream còn `tradingValueAdtv10Days`, `estVolume`,
  `matchPriceTime`, `emaTime`, `lastModifiedDate`, `numberOfElements`, `pageable`… — **bị loại bỏ**.
  Phần tử không phải object trong `content` bị **bỏ qua im lặng**.
- Ánh xạ trường phân trang: upstream `totalElements` → `total_elements`, `totalPages` → `total_pages`,
  **`number` → `page`**, **`size` → `page_size`**; nếu upstream thiếu `number`/`size` thì lấy giá trị
  `page`/`pageSize` của request.
- **Đơn vị trong `content` là ĐỒNG thô từ provider**: `market_price`, `ref_price`, `ceiling`, `floor`
  (đồng), `market_cap` và `accumulated_value` (đồng, số rất lớn), `accumulated_volume` (cổ phiếu),
  `daily_price_change_percent` (phần trăm, ví dụ `0.97`), `stock_strength` (0–100).
  Backend **không** nhân/chia gì. Trong khi đó bộ lọc `marketCap` gửi lên tính bằng **tỷ VND** —
  hai đơn vị khác nhau trong cùng một luồng.
- Có thể lấy `metrics` của một preset (endpoint kế tiếp) và **đưa thẳng vào `filter`** — hai format
  tương thích (preset có thêm `category`, upstream bỏ qua field lạ).

---

### GET /api/v1/market-data/screening/presets

> **Bộ lọc mặc định** — 3 bộ lọc do Vietcap dựng sẵn (`SYSTEM`), mỗi bộ chứa danh sách tiêu chí dùng được ngay làm `filter`.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` theo IP) |
| **Cache** | Redis key `iqx:api:v1:api/v1/market-data/screening/presets:_`, TTL `3600`s |
| **Nguồn dữ liệu** | provider ngoài — VCI IQ `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/setting/screeners` |
| **Side-effect** | — |

**Path params**

—

**Query params**

—

**Request body**

—

**Response 200**

~~~ts
type GetScreeningPresetsResponse = IqProxyResponse<ScreeningPresetsResult>;
~~~

~~~json
{
  "data": {
    "SYSTEM": [
      {
        "id": "65fe3efc5712c6ec79202e58",
        "name": "Leading Stocks",
        "vi_name": "Top CP mạnh nhất",
        "mode": "slider",
        "order": 1,
        "metrics": [
          { "name": "exchange", "category": "general", "conditionOptions": [
              { "type": "value", "value": "hsx" },
              { "type": "value", "value": "hnx" },
              { "type": "value", "value": "upcom" }
          ]},
          { "name": "adtv", "category": "general",
            "conditionOptions": [{ "from": 10000000000, "to": 2000000000000 }],
            "extraName": "20Days" },
          { "name": "rsi", "category": "technical", "conditionOptions": [{ "from": 50, "to": 100 }] },
          { "name": "priceEma", "category": "technical",
            "conditionOptions": [{ "from": 0, "to": 50 }], "extraName": "ema20" },
          { "name": "priceEma", "category": "technical",
            "conditionOptions": [{ "from": 0, "to": 50 }], "extraName": "ema50" },
          { "name": "rs", "category": "technical",
            "conditionOptions": [{ "from": 90, "to": 100 }], "extraName": "1Month" },
          { "name": "ema20Ema50", "category": "technical", "conditionOptions": [{ "from": 0, "to": 50 }] }
        ]
      },
      {
        "id": "65fe3f2a5712c6ec79202e60",
        "name": "Good Profit Stocks",
        "vi_name": "Cổ phiếu lợi nhuận tốt",
        "mode": "slider",
        "order": 2,
        "metrics": []
      },
      {
        "id": "65fe3f515712c6ec79202e6a",
        "name": "Accumulation Stocks",
        "vi_name": "Cổ phiếu tích lũy",
        "mode": "slider",
        "order": 3,
        "metrics": []
      }
    ]
  },
  "source_url": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/setting/screeners"
}
~~~

Ba bộ lọc `SYSTEM` (theo `docs/vietcap-screening-api.md`):

| # | `name` | `vi_name` | Tiêu chí chính |
|---|---|---|---|
| 1 | `Leading Stocks` | Top CP mạnh nhất | ADTV > 10 tỷ, RSI 50–100, giá > EMA20 và EMA50, RS 1 tháng > 90, EMA20 > EMA50 |
| 2 | `Good Profit Stocks` | Cổ phiếu lợi nhuận tốt | Giá > 10k, ADTV > 10 tỷ, giá > EMA20, tăng trưởng LNST > 0 (2 kỳ) |
| 3 | `Accumulation Stocks` | Cổ phiếu tích lũy | ADTV > 10 tỷ, RSI 25–50, giá < EMA20 và EMA50, biến động < 10% |

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | Response upstream không phải object | `Expected dict from https://iq.vietcap.com.vn/api/iq-insight-service/v1/setting/screeners, got str` |
| `502` | — | `data` của upstream không phải object | `Expected dict from setting/screeners, got str` / `... got NoneType` |
| `503` | — | Timeout / connect error / HTTP error sau retry | `GET /v1/setting/screeners: <lỗi gốc>` |
| `429` | — | Vượt 60 req/phút | body `{"error":"Rate limit exceeded: 60 per 1 minute"}` |

Không có 422.

**Fallback / suy giảm**

Không nguồn dự phòng, không validator → `data: {}` trả `200` (không cache vì rỗng).
Category nào có giá trị không phải array sẽ bị **bỏ khỏi** kết quả (không lỗi).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/screening/presets' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: 11111111-2222-3333-4444-555555555555'
~~~

**Ghi chú khi viết lại**

- **`data` là map động, KHÔNG phải array.** Key do provider quyết định. Thực tế: `"SYSTEM"` luôn có;
  `"USER"` chỉ xuất hiện khi request tới Vietcap có phiên đăng nhập — backend IQX **không gửi token
  Vietcap nào**, nên trong thực tế chỉ có `"SYSTEM"`. Đừng hardcode type thành `{ SYSTEM: ... }` —
  dùng `Record<string, ScreeningPreset[]>`.
- Chỉ giữ **6 field** mỗi preset. Default khi thiếu: `id`/`name`/`vi_name`/`mode` → `""`;
  `order` → `null`; `metrics` → `[]`.
- **`metrics` truyền thô, camelCase** (`conditionOptions`, `extraName`) + có thêm `category` — khác
  `condition_options` snake_case của `/screening/criteria`. Đây là điểm trộn naming thứ hai của nhóm.
- Cùng một `name` có thể xuất hiện **nhiều lần** trong `metrics` với `extraName` khác nhau
  (`priceEma` + `ema20` và `priceEma` + `ema50`) — liên quan tới `allow_duplicate` của catalog.
  Đừng dedupe theo `name`.
- `metrics` dùng được trực tiếp làm `filter` của `POST /screening/search` (bỏ `category` hoặc để nguyên
  đều được — upstream bỏ qua field lạ, còn DTO của backend cũng bỏ qua field không khai báo).
- Đơn vị trong `metrics` là **đơn vị Vietcap dùng nội bộ**: `adtv` ở đây là **đồng**
  (`from: 10000000000` = 10 tỷ), trong khi catalog ghi `min/max` của `adtv` theo **tỷ VND** (0–2.000).
  Không tự chuyển đổi.

---

## 8. Ghi chú tổng hợp khi viết lại

### 8.1 Bốn bẫy đơn vị phải in ra dán lên tường

1. **`/quotes/{symbol}/ohlcv` có hai đơn vị giá trong cùng một endpoint.**
   `meta.source === "VND"` → **nghìn đồng**; `meta.source === "VCI"` → **đồng**. Backend không chuẩn hoá.
2. **`upside_pct` là tỷ lệ, không phải phần trăm.** `0.3472` = +34,72%. Áp dụng cho
   `/reference/search`, `/reference/symbols/search`, `/reference/symbols/{symbol}`.
   Ngược lại, `daily_price_change_percent` trong `/screening/search` **là phần trăm** (`0.97` = +0,97%).
3. **`accumulatedValue` có ba đơn vị khác nhau ở ba API của cùng nhà cung cấp VCI:**
   gap-chart → **triệu đồng** (thành `value` của nến, chỉ nhánh VCI); `price/symbols/getList` (bảng giá,
   ngoài chương này) → **triệu đồng** và backend nhân `1e6`; LEData intraday → **đơn vị thô, backend
   không nhân**. Không suy diễn chéo.
4. **`marketCap` gửi đi (tỷ VND) khác `market_cap` nhận về (đồng).** Tương tự `adtv`:
   catalog nói tỷ VND, preset gửi đồng.

### 8.2 Bẫy hành vi rỗng — hai chế độ đối nghịch

| Chế độ | Endpoint | Provider trả rỗng ⇒ |
|---|---|---|
| Validator mặc định | `/reference/symbols`, `/reference/industries`, `/reference/groups/{group}/symbols`, `/quotes/{symbol}/ohlcv` | **502** `Tất cả N nguồn dữ liệu thị trường đều thất bại` |
| `allowEmpty: true` | `/quotes/{symbol}/intraday`, `/quotes/{symbol}/price-depth` | **200** `{"data": []}` (và **được cache 15s**) |
| Không qua fallback | `/reference/indices`, `/reference/search`, `/reference/event-codes`, `/screening/*`, 2 endpoint DB | **200** với mảng/object rỗng |

Nếu bản viết lại "hợp lý hoá" cả 14 endpoint thành `200 []`, mọi client đang bắt 502 để hiện
"không có dữ liệu" sẽ hành xử khác. Đây là quyết định sản phẩm, không phải quyết định kỹ thuật —
mặc định phải là **giữ nguyên**.

### 8.3 Bẫy `?source=`

| Endpoint | `source` có tác dụng? |
|---|---|
| `/reference/symbols` | **Có** — `VCI` \| `VND` |
| `/quotes/{symbol}/ohlcv` | **Có** — `VND` \| `VCI` (`auto` bị bỏ qua → chain đầy đủ) |
| `/reference/industries`, `/reference/groups/{group}/symbols`, `/quotes/{symbol}/intraday`, `/quotes/{symbol}/price-depth` | **Không** — param tồn tại trong OpenAPI nhưng handler không truyền override |

Ở mọi trường hợp, `source` **vẫn** vào cache key → sinh entry trùng nội dung. Giữ nguyên để parity;
nếu muốn dọn thì phải xoá param khỏi cả OpenAPI và đồng bộ với client.

### 8.4 Bẫy thứ tự route & thứ tự kiểm tra

- `/reference/symbols/search` **phải** đứng trước `/reference/symbols/{symbol}`.
- Trong NestJS, khai báo `@Get('reference/symbols/search')` trước `@Get('reference/symbols/:symbol')`
  trong **cùng** controller; nếu tách controller thì phải kiểm soát thứ tự `imports`.
- `/quotes/{symbol}/ohlcv` kiểm theo đúng thứ tự: uppercase symbol → `interval` → regex symbol →
  parse `end` → parse `start`. Test parity phải cover trường hợp sai nhiều thứ cùng lúc.
- `/quotes/{symbol}/intraday`: `page_size` được validate **bởi framework trước khi handler chạy**,
  nên `?page_size=0` với symbol sai vẫn trả lỗi `page_size` (detail dạng array), không phải lỗi symbol.

### 8.5 Hai dạng body lỗi 422

Cùng status `422` nhưng khác shape:

- Validate của framework (`Query`/`Path`/`Body` constraint, Pydantic validator) → `detail` là **array** object.
- `HTTPException(422, "...")` thủ công trong handler (`interval`, `symbol`, `group`, `start`, `end`) →
  `detail` là **string tiếng Việt**.

Trong NestJS: dùng `ValidationPipe` cho nhóm đầu, `throw new HttpException({ detail: '...' }, 422)`
cho nhóm sau. **Không** để `ValidationPipe` bọc lại nhóm sau thành array.

### 8.6 Không có field `code` trong lỗi

Cả 14 endpoint dùng `HTTPException` trần → body lỗi chỉ có `detail`. Đừng thêm `code` (các domain
nghiệp vụ khác dùng `AppException` có `code`, nhưng nhóm này thì không).

### 8.7 Naming lai giữa snake_case và camelCase

| Chỗ | Naming |
|---|---|
| Field cấp ngoài của mọi response | `snake_case` |
| `condition_options[*]`, `condition_extra` của `/screening/criteria` | **camelCase thô** (`viName`, `enName`) |
| `metrics[*]` của `/screening/presets` | **camelCase thô** (`conditionOptions`, `extraName`) |
| Body của `POST /screening/search` | **camelCase** (`pageSize`, `sortFields`, `conditionOptions`, `extraName`, `from`, `to`) + chấp nhận thêm snake_case do alias |

Nếu bật `class-transformer` với chiến lược đổi tên toàn cục, các cụm camelCase thô sẽ bị viết lại
và hợp đồng vỡ. Hãy dùng `unknown`/passthrough cho các cụm "thô".

### 8.8 Các trường thô cần đánh dấu passthrough

Những field sau **không được typing chặt** vì backend không chuẩn hoá — chỉ copy nguyên từ provider:

- `MdIntradayTick.side` (từ `matchType`) — **SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI (Vietcap Trading)**.
- `MdSearchBarItem.icb_lv1` / `icb_lv2` — object `{code, name, level}` trong dữ liệu thật.
- `ScreeningCriterion.condition_options` / `condition_extra`.
- `ScreeningPreset.metrics`.
- Key của `ScreeningPresetsResult`.

### 8.9 Giá trị mặc định phải copy chính xác

- Chuỗi thiếu ở nhánh normalize → **`""`** (không phải `null`): `symbol`, `name`, `exchange` của
  `/reference/symbols`; `icb_code`, `icb_name`, `en_icb_name` của `/reference/industries`;
  `code`, `name`, `short_name`, `floor`, `logo_url` của `/reference/search`;
  `event_code`, `event_name_vi`, `event_name_en`; `ticker`, `exchange`, các `*_organ_name`,
  `icb_code_lv2/lv4`, `en_sector`, `vi_sector` của `/screening/search`.
- Số thiếu ở `/quotes/{symbol}/intraday` và `/quotes/{symbol}/price-depth` → **`0`** (không `null`),
  do `_to_num`.
- Số thiếu ở `/screening/search` → **`null`** (copy trực tiếp, không có `_to_num`).
- Boolean: `allow_duplicate` → `false`, `active` → `true`, `first` → `true`, `last` → `false`,
  `empty` → `false`.
- `total_elements`, `total_pages` → `0`.

### 8.10 Cache: chi tiết dễ bỏ sót

- `REDIS_ENABLED` mặc định **`false`** → hành vi mặc định của dev là **không cache**. Test parity nên
  chạy cả hai chế độ.
- Header **`X-Cache: HIT`** chỉ xuất hiện khi hit; không có `X-Cache: MISS`.
- Trên hit, `meta.as_of` là thời điểm fetch gốc → client tính "dữ liệu mới bao lâu" sẽ thấy lệch tới
  đúng bằng TTL.
- Chuẩn hoá mã trong khoá cache **chỉ** áp dụng cho segment ngay sau `quotes`, `company`, `trading`,
  `fundamentals`, `tickers` — nên `/quotes/fpt/intraday` và `/quotes/FPT/intraday` chia sẻ cache,
  còn `/reference/symbols/fpt` và `/reference/symbols/FPT` thì **không** (nhưng hai endpoint đó
  không cache nên vô hại).
- `paramHash` bỏ param có giá trị `null` hoặc chuỗi rỗng trước khi băm → `?source=` (rỗng) và
  không truyền `source` cho **cùng** một khoá.

### 8.11 Điểm nợ kỹ thuật nên sửa (ghi rõ là "khác biệt có chủ ý" nếu sửa)

1. `start` default `now.replace(year: -1)` — lỗi 29/02 trong Python. Trong TS nên trừ 365 ngày và
   ghi chú thay đổi.
2. Parse `start`/`end` ở UTC thay vì `Asia/Ho_Chi_Minh` — lệch 7 giờ so với engine TA.
3. Nhánh VCI của `/ohlcv` bỏ qua `start` và cứng `countBack = 1000`.
4. `interval` intraday (`1m`…`1H`) rơi về nến ngày khi fallback sang VCI mà không cảnh báo.
5. Param `source` vô dụng ở 4 endpoint.
6. Alias snake_case ngoài ý muốn trong body screening.
7. 6 class Pydantic trong `market_data/schemas.py` là code chết và **lệch kiểu** với response thật
   (`volume: int` vs thực tế float).

Mọi thay đổi ở 7 điểm trên phải được ghi vào changelog của bản viết lại, vì chúng **thay đổi hợp đồng**
với client hiện có.
