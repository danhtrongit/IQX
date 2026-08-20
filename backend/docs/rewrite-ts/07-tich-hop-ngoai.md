# Tích hợp nhà cung cấp ngoài

Chương này liệt kê **toàn bộ upstream mà backend IQX gọi ra**: dữ liệu thị trường (Vietcap/VCI, VNDirect, KBS, MBK, Fmarket, Simplize, SJC, Vietcombank, Google Sheets, Binance, Yahoo Finance, MSN, RSS), realtime (DNSE), thanh toán (SePay), thông báo (Telegram), email (Resend) và LLM (AI proxy DeepSeek). Mỗi nhà cung cấp được mô tả đủ để viết lại bằng TypeScript/NestJS **không cần đọc lại source Python**: base URL, header, ví dụ request, hình dạng response upstream, mapping normalize từng field (kèm đơn vị và tỷ lệ nhân/chia), timeout, retry, cơ chế fallback và giới hạn đã biết.

Mọi con số, tên field, tên biến env trong chương này được đọc trực tiếp từ source. Chỗ nào không xác minh được đều ghi rõ "CHƯA XÁC ĐỊNH".

---

## 1. Tầng HTTP dùng chung (`market_data/http.py`)

Mọi source module (trừ Binance, RSS, Telegram, Resend, AI proxy, một phần logo CDN) đều gọi qua một hàm duy nhất: `fetchJson`. Bản TS phải tái tạo chính xác hành vi này vì retry/timeout của tất cả provider phụ thuộc nó.

### 1.1 Client dùng chung

| Thuộc tính | Giá trị (hardcode trong `http.py`) |
|---|---|
| Timeout mặc định | `15.0` giây (`_DEFAULT_TIMEOUT`) |
| Số lần thử tối đa | `3` (`_MAX_RETRIES`) |
| Backoff base | `0.5` giây (`_BACKOFF_BASE`) |
| Connection pool | `max_connections=100`, `max_keepalive_connections=20` |
| Follow redirects | `true` |

- Client là **singleton module-level**, khởi tạo lazy; được tạo lại nếu client đã đóng hoặc event loop thay đổi (đặc thù pytest, bản TS không cần).
- `startup()` / `shutdown()` được gọi từ lifespan của app (`app/main.py`): tạo client khi boot, đóng client khi shutdown. Bản NestJS nên dùng một provider singleton (ví dụ `undici.Agent` hoặc axios instance) với `onModuleDestroy`.
- **Lưu ý quan trọng:** `MARKET_DATA_TIMEOUT_SECONDS`, `MARKET_DATA_CACHE_ENABLED`, `MARKET_DATA_CACHE_TTL_*` được khai báo trong config **nhưng KHÔNG được đọc ở bất kỳ đâu trong code** (chỉ `MARKET_DATA_CACHE_MAX_SIZE` được dùng bởi `TTLCache`). Timeout thực tế luôn là hằng số 15s.

### 1.2 Header sinh theo nguồn

`getHeaders(source, randomAgent = true)` = base headers + `User-Agent` random từ pool 4 UA + `Referer`/`Origin` riêng theo nguồn.

Base headers (khớp `vnstock` `DEFAULT_HEADERS`):

```
Accept: application/json, text/plain, */*
Accept-Language: en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7
Connection: keep-alive
Content-Type: application/json
Cache-Control: no-cache
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
DNT: 1
Pragma: no-cache
sec-ch-ua-platform: "Windows"
sec-ch-ua-mobile: ?0
```

Pool User-Agent (chọn ngẫu nhiên, `randomAgent=false` → lấy phần tử đầu):

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/605.1.15 Version/16.3 Safari/605.1.15
Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36
```

Referer/Origin theo token nguồn (key **uppercase**):

| Source token | Referer | Origin |
|---|---|---|
| `VCI` | `https://trading.vietcap.com.vn/` | `https://trading.vietcap.com.vn` |
| `VND` | `https://mkw.vndirect.com.vn` | `https://mkw.vndirect.com.vn` |
| `CAFEF` | `https://s.cafef.vn/lich-su-giao-dich-vnindex-3.chn` | `https://s.cafef.vn` |
| `KBS` | `https://kbbuddywts.kbsec.com.vn/` | `https://kbbuddywts.kbsec.com.vn` |
| `MBK` | `https://data.maybanktrade.com.vn` | `https://data.maybanktrade.com.vn` |
| `FMARKET` | `https://fmarket.vn/` | `https://fmarket.vn` |
| `SJC` | `https://sjc.com.vn/bieu-do-gia-vang` | `https://sjc.com.vn` |
| `VCB` | `https://www.vietcombank.com.vn/` | `https://www.vietcombank.com.vn` |
| `ASEAN` | `https://research.aseansc.com.vn/` | `https://research.aseansc.com.vn` |
| `MSN` | `https://www.msn.com/` | `https://www.msn.com` |
| `YAHOO` | `https://finance.yahoo.com/` | `https://finance.yahoo.com` |
| `SPL`, `RSS`, `SIMPLIZE` | (không thêm gì) | — |

> `CAFEF` và `ASEAN` có header nhưng **không có source module nào** trong backend hiện tại — chỉ là chỗ dành sẵn.

### 1.3 Hợp đồng `fetchJson`

```ts
type FetchJsonOptions = {
  method?: 'GET' | 'POST';          // default 'GET'
  headers?: Record<string, string>; // default = getHeaders(source)
  params?: Record<string, unknown>; // query string
  jsonBody?: unknown;               // POST với Content-Type: application/json
  formData?: string;                // POST body thô (Content-Type lấy từ headers)
  timeout?: number;                 // default 15.0 (giây)
  maxRetries?: number;              // default 3
  source?: string;                  // default 'UNKNOWN' — chỉ dùng để chọn header + log
};

declare function fetchJson(url: string, opts?: FetchJsonOptions): Promise<unknown>;
```

Thứ tự xử lý lỗi (bắt buộc giữ nguyên):

1. `timeout` / `connect error` → retry. Delay = `0.5 * 2^(attempt-1) + random(0, 0.3)` giây.
2. HTTP **4xx** → **throw ngay, KHÔNG retry**. ⚠️ Điều này bao gồm cả **429** — `fetchJson` không hề retry rate-limit. (Binance và Yahoo tự cài lớp retry riêng, xem §14, §15.)
3. HTTP **5xx** → retry. Delay = `0.5 * 2^(attempt-1)` giây (không jitter).
4. Hết lượt thử → throw exception cuối cùng; nếu không có exception nào thì throw connect-error với message `All {maxRetries} retries exhausted for {url}`.
5. Thành công → `response.json()` (không validate schema ở tầng này).

`formData` khi có sẽ được encode UTF-8 và gửi làm body thô (dùng cho MBK, SJC, và VCI GraphQL — xem §2.6).

---

## 2. Registry, orchestrator, fallback

### 2.1 Registry (`market_data/registry.py`)

Mỗi "operation logic" có key `<domain>.<method>`, ánh xạ sang 1 nguồn chính (`default`) + danh sách fallback có thứ tự.

```ts
type SourceChain = { default: string; fallback: string[] };

const REGISTRY: Record<string, SourceChain> = {
  // Reference
  'reference.symbols':      { default: 'VCI', fallback: ['VND'] },
  'reference.industries':   { default: 'VCI', fallback: [] },
  'reference.groups':       { default: 'VCI', fallback: [] },
  // Quotes
  'quote.ohlcv':            { default: 'VND', fallback: ['VCI'] },
  'quote.intraday':         { default: 'VCI', fallback: [] },
  'quote.price_depth':      { default: 'VCI', fallback: [] },
  // Trading
  'trading.price_board':    { default: 'VCI', fallback: [] },
  'trading.foreign_trade':  { default: 'VCI', fallback: [] },
  'trading.insider_deals':  { default: 'VCI', fallback: [] },
  'trading.history':        { default: 'VCI', fallback: [] },
  'trading.summary':        { default: 'VCI', fallback: [] },
  'trading.proprietary':    { default: 'VCI', fallback: [] },
  // Company
  'company.profile':        { default: 'KBS', fallback: ['VCI'] },
  'company.shareholders':   { default: 'KBS', fallback: [] },
  'company.officers':       { default: 'KBS', fallback: [] },
  'company.subsidiaries':   { default: 'KBS', fallback: [] },
  'company.news':           { default: 'KBS', fallback: [] },
  'company.details':        { default: 'VCI', fallback: [] },
  'company.price_chart':    { default: 'VCI', fallback: [] },
  // Fundamentals
  'financial.statement':    { default: 'VCI', fallback: [] },
  'financial.bctc':         { default: 'VCI', fallback: [] },
  // Insights
  'insights.ranking':       { default: 'VND', fallback: [] },
  // Events
  'events.calendar':        { default: 'VCI', fallback: [] },
  // Macro
  'macro.economy':          { default: 'MBK', fallback: ['ASEAN'] },
  'macro.gold':             { default: 'SJC', fallback: ['SIMPLIZE'] },
  'macro.fx':               { default: 'VCB', fallback: ['MBK', 'ASEAN'] },
  'macro.commodities':      { default: 'SPL', fallback: ['ASEAN'] },
  // Funds
  'fund.list':              { default: 'FMARKET', fallback: [] },
  'fund.detail':            { default: 'FMARKET', fallback: [] },
  'fund.nav':               { default: 'FMARKET', fallback: [] },
  // International
  'intl.world_index':       { default: 'MSN', fallback: [] },
  'intl.forex':             { default: 'MSN', fallback: [] },
  'intl.crypto_ohlc':       { default: 'BINANCE', fallback: ['MSN'] },
  'intl.crypto_ticker':     { default: 'BINANCE', fallback: [] },
  'intl.crypto_depth':      { default: 'BINANCE', fallback: [] },
  // News
  'news.latest':            { default: 'RSS', fallback: [] },
};
```

`sourcesFor(key, override?)`:
- Key không tồn tại → throw `KeyError: Unknown registry key: {key}`.
- `override` (từ query `?source=`) uppercase; **nếu nằm trong chain** → trả về **duy nhất** nguồn đó; nếu không nằm trong chain → bỏ qua override, trả về full chain.

⚠️ **Sự thật quan trọng về mức độ sử dụng thực tế:** dù registry khai báo ~34 key, chỉ **6 key** được gọi qua orchestrator trong code hiện tại:
- `reference.symbols` (handlers VCI + VND) — `GET /market-data/reference/symbols`
- `quote.ohlcv` (handlers VND + VCI) — `GET /market-data/quotes/{symbol}/ohlcv`
- `macro.gold` (handlers SJC + SIMPLIZE) — `GET /market-data/macro/gold`
- `macro.fx` (chỉ handler VCB được đăng ký) — `GET /market-data/macro/fx`
- `intl.world_index`, `intl.forex` (chỉ MSN), `intl.crypto_ohlc` (BINANCE + MSN), `intl.crypto_ticker`, `intl.crypto_depth` (chỉ BINANCE)

Các endpoint còn lại gọi `fetchWithFallback([[<SOURCE>, handler]])` trực tiếp với **một nguồn duy nhất** (VCI/KBS/MBK/FMARKET/SPL/RSS) — nghĩa là **không có fallback thật** cho chúng. `ASEAN` không có handler ở bất kỳ đâu, nên nếu ai đó gọi `macro.economy` hay `macro.commodities` qua orchestrator sẽ nhận `ValueError: No handler registered for source 'ASEAN'`.

Ngoài ra `app/services/ta/data.py` gọi trực tiếp `fetchWithFallback([['VCI', …], ['VND', …]])` cho dữ liệu OHLCV phục vụ TA/backtest/alerts.

### 2.2 Orchestrator (`market_data/orchestrator.py`)

```ts
type SourceCallable = () => Promise<[data: unknown, rawEndpointUrl: string]>;

declare function fetchFromRegistry(
  key: string,
  handlers: Record<string, SourceCallable>,
  opts?: { override?: string | null; validator?: (d: unknown) => boolean; allowEmpty?: boolean },
): Promise<MarketDataResponse>;
```

Thứ tự: resolve chain → với mỗi tên nguồn, tra handler; **thiếu handler → throw `ValueError`** (`No handler registered for source '{name}' (registry key '{key}')`) → gọi `fetchWithFallback`.

### 2.3 Fallback (`market_data/fallback.py`)

```ts
type MarketDataMeta = {
  source: string;          // tên nguồn đã phục vụ
  source_priority: number; // 1 = nguồn chính, 2+ = fallback
  fallback_used: boolean;  // priority > 1
  as_of: string;           // ISO datetime UTC lúc fetch xong
  raw_endpoint: string;    // URL upstream đã gọi
};

type MarketDataResponse<T = unknown> = { data: T; meta: MarketDataMeta };
```

Vòng lặp theo thứ tự ưu tiên (index bắt đầu từ 1):

1. Gọi handler. Exception → log WARNING `Source {name} (priority {p}) failed: {err}`, lưu làm `lastExc`, sang nguồn kế.
2. Nếu `allowEmpty === false` → chạy validator. Validator mặc định: `null`/`undefined` → invalid; array/object **rỗng** → invalid; mọi giá trị khác valid. Invalid → log WARNING, `lastExc = ValueError("Nguồn {name} trả về dữ liệu rỗng")`, sang nguồn kế.
3. Valid → trả `MarketDataResponse` với meta như trên.
4. Hết nguồn → throw `RuntimeError("Tất cả {n} nguồn dữ liệu thị trường đều thất bại")` (chain nguyên nhân là `lastExc`).

Ở tầng endpoint, `RuntimeError` này được bắt và trả **HTTP 502** với `detail` = message trên. Các endpoint dùng exception riêng theo module (Market Overview / Screening / Sector / AI News) map như sau:

| Loại lỗi | HTTP |
|---|---|
| `*UpstreamShapeError` (response sai hình dạng) | **502** |
| `*UpstreamError` (transport/connection) | **503** |
| `AINewsNotFoundError` | **404** |
| `ValueError` (tham số sai, enum sai, mã không hỗ trợ) | **422** |
| `RuntimeError` từ `fetchWithFallback` | **502** |

### 2.4 Hai lớp cache trước upstream

1. **In-process TTL cache** (`market_data/cache.py`): `TTLCache` LRU, `maxSize = MARKET_DATA_CACHE_MAX_SIZE` (default `1000`), API `get/set(key, value, ttlSeconds)/invalidate/clear/cleanup`. Là singleton module-level.
2. **Redis cache theo endpoint** (`services/cache/decorator.py` — `@redis_cached`): key = `iqx:{prefix}:{path}:{sorted query params}` (prefix default `api:v1`); bỏ qua hoàn toàn khi `REDIS_ENABLED=false`; chỉ cache response 2xx; `cache_empty=false` (default) → không cache list/dict rỗng. TTL lấy từ tên setting truyền vào:

| TTL setting | Default (giây) | Dùng cho |
|---|---|---|
| `REDIS_DEFAULT_TTL_SECONDS` | 300 | macro gold/fx, world-index, forex, crypto OHLC |
| `REDIS_TTL_REALTIME_SECONDS` | 15 | intraday, price-board, crypto ticker/depth |
| `REDIS_TTL_REFERENCE_SECONDS` | 3600 | symbols, industries |
| `REDIS_TTL_OVERVIEW_SECONDS` | 30 | market overview |
| `REDIS_TTL_MACRO_SECONDS` | 900 | macro, funds, company |
| `REDIS_TTL_NEWS_SECONDS` | 300 | tin tức, AI news |
| `REDIS_TTL_SHEETS_SECONDS` | 600 | Google Sheets |
| `REDIS_TTL_AI_DASHBOARD_SECONDS` | 60 | payload AI dashboard |
| `REDIS_TTL_AI_INDUSTRY_SECONDS` | 600 | payload AI industry |
| `REDIS_TTL_AI_ANALYSIS_SECONDS` | 1800 | (khai báo; xem §22 về TTL thực tế) |

---

## 3. Bảng danh mục nhà cung cấp

| # | Provider | Host | Xác thực | Module gốc |
|---|---|---|---|---|
| 1 | Vietcap Trading | `trading.vietcap.com.vn` | Không | `sources/vietcap.py`, `vietcap_market_overview.py` |
| 2 | Vietcap IQ Insight | `iq.vietcap.com.vn` | Không | `vietcap.py`, `vietcap_market_overview.py`, `vietcap_screening.py`, `vietcap_sector.py` |
| 3 | Vietcap AI News | `ai.vietcap.com.vn` | Không | `vietcap_ai_news.py` |
| 4 | VNDIRECT | `dchart-api.vndirect.com.vn`, `api-finfo.vndirect.com.vn` | Không | `vndirect.py` |
| 5 | KB Securities | `kbbuddywts.kbsec.com.vn` | Không (header cứng) | `kbs.py` |
| 6 | Maybank Trade | `data.maybanktrade.com.vn` | Không | `mbk.py` |
| 7 | Fmarket | `api.fmarket.vn` | Không | `fmarket.py` |
| 8 | Simplize API | `api.simplize.vn` | Không | `spl.py` |
| 9 | Simplize CDN (logo) | `cdn.simplize.vn` | Không | `services/symbols.py` |
| 10 | SJC | `sjc.com.vn` | Không | `sjc.py` |
| 11 | Vietcombank | `www.vietcombank.com.vn` | Không | `vcb.py` |
| 12 | Google Sheets v4 | `sheets.googleapis.com` | API key (`GOOGLE_SHEETS_API_KEY`) | `google_sheets.py` |
| 13 | Binance | 6 host `api*.binance.com` | Không | `binance.py` |
| 14 | Yahoo Finance | `query1.finance.yahoo.com` | Không | `yahoo.py` |
| 15 | MSN Finance | `assets.msn.com` | apikey động (resolver) | `msn.py` |
| 16 | RSS báo VN | 7 site | Không | `news.py` |
| 17 | DNSE Entrade + KRX + OpenAPI | `services.entrade.com.vn`, `datafeed-lts.dnse.com.vn`, `ws-openapi.dnse.com.vn` | user/pass + JWT / API key HMAC | `realtime/*` |
| 18 | SePay | `pay-sandbox.sepay.vn` (default) | HMAC-SHA256 + `X-Secret-Key` | `services/premium.py` |
| 19 | Telegram Bot API | `api.telegram.org` | Bot token | `services/telegram/*` |
| 20 | Resend | `api.resend.com` | Bearer API key | `services/email.py` |
| 21 | AI proxy (DeepSeek) | `AI_PROXY_BASE_URL` | Bearer API key | `services/ai/proxy_client.py` |

---

## 4. Vietcap Trading — dữ liệu tham chiếu, báo giá, bảng giá

Base: `https://trading.vietcap.com.vn/api` (biến `_TRADING_BASE`). Source token `VCI`. **Không cần authentication.**

### 4.1 Danh sách mã (`reference.symbols`, nguồn chính)

```bash
curl 'https://trading.vietcap.com.vn/api/price/symbols/getAll' \
  -H 'Referer: https://trading.vietcap.com.vn/' \
  -H 'Origin: https://trading.vietcap.com.vn'
```

Response upstream: **array** các object dạng `{ symbol, organName, board, type, ... }`.

Normalize (`fetch_symbols_by_exchange`):

| Field nội bộ | Nguồn upstream | Ghi chú |
|---|---|---|
| `symbol` | `item.symbol` | default `""` |
| `name` | `item.organName` ?? `item.organ_name` ?? `""` | thử camelCase trước |
| `exchange` | `normalizeExchange(item.board)` | map `HSX→HOSE`, `HNX→HNX`, `UPCOM→UPCOM`, còn lại giữ nguyên |
| `asset_type` | `item.type.toLowerCase()` nếu có, ngược lại `null` | |

```ts
type SymbolRecord = { symbol: string; name: string; exchange: string; asset_type: string | null };
```

### 4.2 Mã theo nhóm chỉ số

`GET {trading}/price/symbols/getByGroup?group={group}` — `group` hợp lệ (`VALID_GROUPS`): `HOSE, VN30, VNMidCap, VNSmallCap, VNAllShare, VN100, ETF, HNX, HNX30, HNXCon, HNXFin, HNXLCap, HNXMSCap, HNXMan, UPCOM, FU_INDEX, CW, BOND`.

Normalize: nếu response là array → mỗi phần tử là object thì lấy `item.symbol`, nếu là string thì dùng chính string đó → `{ symbol }`.

### 4.3 OHLCV (`quote.ohlcv`, fallback sau VND)

```bash
curl -X POST 'https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart' \
  -H 'Content-Type: application/json' \
  -d '{"timeFrame":"ONE_DAY","symbols":["VCB"],"to":1777091198,"countBack":1000}'
```

- `interval` nội bộ → `timeFrame`: `1D→ONE_DAY`, `1W→ONE_WEEK`, `1M→ONE_MONTH`; giá trị khác → `ONE_DAY`.
- ⚠️ `start_ts` **được truyền vào hàm nhưng KHÔNG có trong payload** — upstream chỉ nhận `to` + `countBack`.

Response: array, phần tử `[0]` là chart với **các mảng song song**: `t`, `o`, `h`, `l`, `c`, `v`, `accumulatedValue`.

Normalize (loop theo `t.length`, thiếu index → `0`, riêng `value` thiếu → `null`):

```ts
type VciOhlcvRecord = {
  time: number;                 // giá trị thô từ t[i]
  open: number; high: number; low: number; close: number;
  volume: number;
  value: number | null;         // accumulatedValue[i] — GTGD từng nến, đơn vị TRIỆU VND
};
```

### 4.4 Intraday tick (`quote.intraday`)

`POST {trading}/market-watch/LEData/getAll`, body `{ symbol, limit }` (+ `truncTime` = `last_time` nếu có). `page_size` default `100`.

| Field nội bộ | Upstream | Chuyển đổi |
|---|---|---|
| `time` | `truncTime` | default `""` |
| `price` | `matchPrice` | `toNum` → float, lỗi/`null` → `0.0` |
| `volume` | `matchVol` | `toNum` |
| `side` | `matchType` | default `""` |
| `accumulated_volume` | `accumulatedVolume` | `toNum` |
| `accumulated_value` | `accumulatedValue` | `toNum` |

Ngoài giờ giao dịch upstream trả `[]` → endpoint dùng `allowEmpty=true` nên **rỗng là hợp lệ**, trả 200 với `data: []`.

### 4.5 Price depth (`quote.price_depth`)

`POST {trading}/market-watch/AccumulatedPriceStepVol/getSymbolData`, body `{ symbol }`.

`price ← priceStep`, `volume ← accumulatedVolume`, `buy_volume ← accumulatedBuyVolume`, `sell_volume ← accumulatedSellVolume`, `undefined_volume ← accumulatedUndefinedVolume` — tất cả qua `toNum` (fail → `0.0`). Cũng `allowEmpty=true`.

### 4.6 Bảng giá (`trading.price_board`)

`POST {trading}/price/symbols/getList`, body `{ symbols: string[] }` (uppercase).

Response upstream (rút gọn, xác nhận qua test fixture):

```json
[
  {
    "listingInfo": { "symbol": "VCB", "board": "HSX", "ceiling": 100, "floor": 90, "refPrice": 95 },
    "matchPrice": { "openPrice": 96, "highest": 99, "lowest": 94, "matchPrice": 97,
                    "avgMatchPrice": 96.5, "accumulatedVolume": 5000000,
                    "accumulatedValue": 485000, "foreignBuyVolume": 0, "foreignSellVolume": 0,
                    "foreignBuyValue": 0, "foreignSellValue": 0, "currentRoom": 0, "totalRoom": 0 },
    "bidAsk": { "bidPrices": [{"price": 96.9, "volume": 100}], "askPrices": [] }
  }
]
```

Quy tắc normalize (`fetch_price_board`):

- Phần tử **không phải object** (VCI trả `null` cho mã không có trên bảng giá, ví dụ mã chỉ số) → **bỏ qua**, không làm hỏng cả batch. Test xác nhận: gọi `["VNINDEX","VCB"]` chỉ trả 1 dòng VCB.
- `listingInfo`, `matchPrice`, `bidAsk` mặc định `{}` khi `null`.
- Chỉ giữ **tối đa 3 bước** giá cho mỗi bên `bid_prices`/`ask_prices`, mỗi bước `{ price, volume }`.
- **`total_value = matchPrice.accumulatedValue × 1_000_000`** (upstream trả triệu đồng) — `null` nếu upstream `null`.

```ts
type PriceBoardRow = {
  symbol: string;                      // listingInfo.symbol, default ''
  exchange: string;                    // normalizeExchange(listingInfo.board)
  ceiling_price: number | null;        // listingInfo.ceiling
  floor_price: number | null;          // listingInfo.floor
  reference_price: number | null;      // listingInfo.refPrice
  open_price: number | null;           // matchPrice.openPrice
  high_price: number | null;           // matchPrice.highest
  low_price: number | null;            // matchPrice.lowest
  close_price: number | null;          // matchPrice.matchPrice
  average_price: number | null;        // matchPrice.avgMatchPrice
  total_volume: number | null;         // matchPrice.accumulatedVolume (số cổ phiếu)
  total_value: number | null;          // matchPrice.accumulatedValue × 1e6 → VND
  bid_prices: { price: number | null; volume: number | null }[]; // ≤ 3
  ask_prices: { price: number | null; volume: number | null }[]; // ≤ 3
  foreign_buy_volume: number | null;
  foreign_sell_volume: number | null;
  foreign_buy_value: number | null;
  foreign_sell_value: number | null;
  foreign_remaining_room: number | null; // matchPrice.currentRoom
  foreign_total_room: number | null;     // matchPrice.totalRoom
};
```

### 4.7 Company GraphQL (VCI, endpoint NGOÀI `/api`)

URL: `https://trading.vietcap.com.vn/data-mt/graphql` (**không** có `/api`).

- Method POST, body là **`JSON.stringify(payload)` gửi dưới dạng raw body** (`form_data=`) — bám theo hành vi `vnstock` (`data=json.dumps(payload)`), **không** dùng `json=`. Header vẫn có `Content-Type: application/json` từ base headers.
- Payload: `{ query: <_COMPANY_GRAPHQL_QUERY>, variables: { ticker: SYMBOL_UPPER, lang: "vi" } }`.
- Query lấy các root field: `CompanyListingInfo`, `OrganizationShareHolders`, `OrganizationManagers`, `OrganizationEvents`, `News(ticker, langCode)`, `Subsidiary`.
- Trả về `data.data` (mặc định `{}` nếu response không phải object).

Các normalizer thuần (pure function, không I/O):

| Hàm | Đầu vào | Kết quả |
|---|---|---|
| `normalizeCompanyOverview` | `CompanyListingInfo` | `{ issue_share ← issueShare, charter_capital ← financialRatio.charterCapital, company_profile ← companyProfile ?? '', history ?? '', icb_name_2/3/4 ← icbName2/3/4 }`; `{}` nếu thiếu `CompanyListingInfo` |
| `normalizeShareholders` | `OrganizationShareHolders[]` | `{ name ← ownerFullName, quantity, percentage, update_date ← updateDate }` |
| `normalizeOfficers` | `OrganizationManagers[]` | `{ name ← fullName, position ← positionName, quantity, percentage, update_date }` |
| `normalizeEvents` | `OrganizationEvents[]` | `{ title ← eventTitle, event_code ← eventListCode, event_name ← eventListName, public_date, issue_date, record_date, exright_date, ratio, value }` |
| `normalizeNews` | `News[]` | `{ title ← newsTitle, subtitle ← newsSubTitle, short_content ← newsShortContent, image_url ← newsImageUrl, source_link ← newsSourceLink, public_date, created_at ← createdAt }` |
| `normalizeSubsidiaries` | `Subsidiary[]` | `{ name ← subOrListingInfo.organName, en_name ← subOrListingInfo.enOrganName, percentage }` |

> Theo `docs/market-data-source-map.md`: endpoint `/company/{symbol}/events` **đã bị gỡ** vì KBS thường rỗng và VCI GraphQL không khả dụng. Bản TS nên port code nhưng biết rằng nó không được endpoint nào phục vụ.

---

## 5. Vietcap IQ Insight — thống kê công ty & BCTC

Base: `https://iq.vietcap.com.vn/api/iq-insight-service` (biến `_IQ_BASE`). Source token `VCI`.

Quy ước chung của cụm này: response bọc `{ status, successful, msg, data }`. Hầu hết hàm trong `vietcap.py` chỉ lấy `data` (không kiểm tra `successful`), rồi **đổi mọi key camelCase → snake_case** bằng regex hai bước:

```ts
function camelToSnake(name: string): string {
  return name
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
```

`_extract_data(data, path)` đi theo path (`['data','content']`) và trả `[]` nếu bất kỳ bước nào không phải object/không có key.

### 5.1 Danh mục endpoint IQ dùng trong `vietcap.py`

| Hàm | Endpoint | Params | Trả về |
|---|---|---|---|
| `fetch_industries_icb` | `GET /v1/sectors/icb-codes` | — | `{ icb_code ← name, icb_name ← viSector, en_icb_name ← enSector, level ← icbLevel }` |
| `fetch_trading_history` | `GET /v1/company/{sym}/price-history` | `timeFrame`, `page`, `size` (+ `fromDate`/`toDate` khi có cả start & end) | `data.content[]` snake_case toàn bộ |
| `fetch_trading_summary` | `GET /v1/company/{sym}/price-history-summary` | `timeFrame` (+ dates) | `data` (object) snake_case |
| `fetch_foreign_trade` | (dùng lại `price-history`) | như trên, `size` default 100 | lọc **chỉ các key bắt đầu bằng `foreign`** + thêm `trading_date` |
| `fetch_insider_deals` | `GET /v1/company/{sym}/insider-transaction` | `page=0`, `size=limit` (default 100) | `data.content[]` snake_case |
| `fetch_proprietary_history` | `GET /v1/company/{sym}/proprietary-history` | `timeFrame`, `page`, `size` (+ dates) | `data.content[]` snake_case |
| `fetch_proprietary_summary` | `GET /v1/company/{sym}/proprietary-history-summary` | `timeFrame` (+ dates) | `data` snake_case |
| `fetch_company_details` | `GET /v1/company/details` | `ticker` | `data` snake_case (`{}` nếu không phải object) |
| `fetch_price_chart` | `GET /v1/company/{sym}/price-chart` | `lengthReport` (default 365) | xem dưới |
| `fetch_events_calendar` | `GET /v1/events?...` | xem §5.3 | list snake_case |
| `_fetch_financial_metrics` | `GET /v1/company/{sym}/financial-statement/metrics` | — | dict section → list metric |
| `_fetch_financial_raw` | `GET /v1/company/{sym}/financial-statement?section=…` | `section` | `{ years: [...], quarters: [...] }` snake_case |
| ratio | `GET /v1/company/{sym}/statistics-financial` | — | list snake_case → enrich (§6) |

`timeFrame` map (`_REPORT_RESOLUTION`): `1D→ONE_DAY`, `1W→ONE_WEEK`, `1M→ONE_MONTH`, `1Q→ONE_QUARTER`, `1Y→ONE_YEAR`; mặc định `ONE_DAY`.
Ngày: `fromDate`/`toDate` = `start.replace('-','')` → định dạng `YYYYMMDD`, **chỉ gửi khi có cả start và end**.

`fetch_price_chart` normalize (mỗi phần tử phải là object, ngược lại bỏ):

```ts
type PriceChartRow = {
  open_price: number;    // toNum(openPrice)     — fail → 0
  high_price: number;    // toNum(highPrice)
  low_price: number;     // toNum(lowPrice)
  closing_price: number; // toNum(closingPrice)
  trading_time: unknown; // tradingTime (nguyên trạng)
};
```

### 5.2 BCTC dạng flat rows (`financial.bctc`)

`fetch_bctc_statements(symbol, termType = 1)`:
- Gọi `_fetch_financial_raw` **3 lần** với `section` = `BALANCE_SHEET`, `INCOME_STATEMENT`, `CASH_FLOW`.
- `periodKey = termType === 1 ? 'years' : 'quarters'`.
- Trả `{ balance_sheet: rows, income_statement: rows, cash_flow: rows }` — mỗi rows là **flat dict keyed theo FieldCode** (`isa1..isi125`, `bsa1..bsb215`, `cfa1..cfi100`) + `year_report`, `length_report`.
- `url` trả về là URL của **lần gọi cuối** (cả 3 lần cùng path, khác query).

### 5.3 Lịch sự kiện (`events.calendar`)

URL build bằng **string concat** (không dùng `params`):

```
{IQ}/v1/events?fromDate=YYYYMMDD&toDate=YYYYMMDD&page=0&size={limit}
[&eventCode={code}]
```

- `limit` default `20000`; `toDate` = `end ?? start`.
- `event_type` → `eventCode` (`_EVENT_TYPE_MAP`): `dividend→"ISS,DIV"`, `insider→"DDIND,DDRP,DDINS"`, `agm→"EGME,AGME,AGMR"`, `others→"MOVE,MA,NLIS,AIS,RETU,OTHE,SUSP"`. Giá trị không nằm trong map → dùng nguyên văn.
- Header: base VCI + ghi đè lại `Origin`/`Referer` `https://trading.vietcap.com.vn`.
- Bóc dữ liệu: `data.data.content` nếu `data.data` là object, hoặc `data.data` nếu nó là array; ngược lại `[]`. Sau đó snake_case toàn bộ key.

---

## 6. Normalize BCTC VCI → hình dạng KBS (`vci_finance_normalize.py`)

Đây là phần normalize **phức tạp nhất và dễ sai nhất** — frontend đang render trực tiếp shape `{Head, Content}` kiểu KBS cũ. Bản TS phải copy chính xác.

### 6.1 `fetchFinancialReport` — luồng chính

```ts
type ReportType = 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratio';
// _FINANCE_TYPES: balance_sheet→BALANCE_SHEET, income_statement→INCOME_STATEMENT,
//                 cash_flow→CASH_FLOW, ratio→RATIO ; không khớp → BALANCE_SHEET
```

**Nhánh `ratio`:**
1. `GET {IQ}/v1/company/{sym}/statistics-financial` → `data.data ?? data`; nếu là array → snake_case từng row.
2. Gọi thêm `_fetch_financial_raw(sym, 'INCOME_STATEMENT')`, lấy `quarters` (fallback key `quarter`) và `years` (fallback `year`).
3. `enrichRatioRecords(rows, { incomeQuarters, incomeYears })` → `filterRatioPeriod(enriched, period)` với `period ∈ {'Q','Y'}` (default `'Q'`).

**Nhánh báo cáo (CDKT/KQKD/LCTT):**
1. `_fetch_financial_raw(sym, section)` → `{ years, quarters }` (snake_case).
2. `_fetch_financial_metrics(sym)` → object các section (`BALANCE_SHEET`, `INCOME_STATEMENT`, `CASH_FLOW`, `NOTE`) trong đó mỗi value là array metric; **chỉ giữ các value là array**; response không hợp lệ → `{}`.
3. `bucket = termType === 2 ? 'quarters' : 'years'`; nếu bucket rỗng thì thử key số ít (`bucket.replace(/s$/,'')`); nếu vẫn rỗng thì **lấy bucket khác đầu tiên có dữ liệu**.
4. `sectionLabel` (`_SECTION_DISPLAY_LABEL`): `INCOME_STATEMENT→"KQKD"`, `BALANCE_SHEET→"CDKT"`, `CASH_FLOW→"LCTT"`; section không có trong map → `section.toLowerCase()`.
5. `toKbsShape({ items, metricsSection, sectionKey, termType, pageSize })`.

### 6.2 `toKbsShape`

```ts
type KbsHeadItem = { TermCode: string; YearPeriod: number; TermName: string };
type KbsRow = {
  Name: string;                       // titleVi (hoặc fullTitleVi) đã trim
  Levels: number;                     // max(level - 1, 0)
  CssStyle: 'B' | '';                 // 'B' khi Levels === 0
  ChildTotal: number;                 // số metric có parent = field này
  ReportNormID: number;               // vị trí 1-based trong meta_rows
  ParentReportNormID: number | null;  // vị trí 1-based của parent, null nếu không có
  FieldCode: string;                  // field lowercase, vd 'isa1'
  [valueKey: string]: unknown;        // Value1..ValueN theo thứ tự periods
};
type KbsShape = { Head: KbsHeadItem[]; Content: Record<string, KbsRow[]> };
```

**Bước 1 — lọc & sắp kỳ (`_filterPeriods`):**
- `termType === 1` → chỉ giữ row có `length_report === 5` (kỳ năm).
- `termType !== 1` → chỉ giữ `length_report ∈ {1,2,3,4}`.
- Sắp **giảm dần** theo tuple `(year_report, length_report)`.
- Cắt còn `pageSize` phần tử đầu (default của endpoint báo cáo: `page_size = 8`, `term_type = 2`).

**Bước 2 — Head (`_termLabel`):**
- `termType === 1` **hoặc** `length ∈ {null, 5}` → `TermCode = 'Y'`, `TermName = String(year)`.
- Ngược lại → `TermCode = 'Q{length}'`, `TermName = 'Q{length}/{year}'`.
- `YearPeriod = year_report` (int, `0` nếu thiếu).

**Bước 3 — metadata (`_normalizeMetadata`):**
- Bỏ metric không có `field`.
- `name = (titleVi ?? fullTitleVi ?? '').trim()`.
- `parent` lowercase nếu là string, ngược lại `null`.
- `level = int(raw.level ?? 1)`; parse lỗi → `1`. Lưu `max(level - 1, 0)`.
- **Giữ nguyên thứ tự VCI trả về** (thứ tự trên→dưới của báo cáo).

**Bước 4 — dựng rows:** mỗi metric thành 1 `KbsRow`; `Value{col}` (col bắt đầu từ 1) = `period[fieldCode]` — có thể `undefined`/`null` nếu kỳ đó không có field.

**Bước 5:** `Content = { [sectionKey]: rows }` — **một key duy nhất**, frontend flatten hết.

### 6.3 `enrichRatioRecords`

Mục tiêu: hợp nhất schema ngân hàng và phi ngân hàng thành các tên canonical.

Bảng ứng viên (`RATIO_FIELD_FALLBACKS`) — thử theo thứ tự, dừng ở giá trị đầu tiên **không thuộc `{null, 0, 0.0}`**:

| Canonical | Ứng viên |
|---|---|
| `revenue` | `revenue`, `net_revenue`, `total_operating_income` |
| `net_profit` | `net_profit`, `profit_after_tax`, `net_profit_after_tax` |
| `revenue_growth` | `revenue_growth`, `revenue_yoy` |
| `net_profit_growth` | `net_profit_growth`, `profit_after_tax_growth` |
| `eps` | `eps`, `earnings_per_share`, `basic_eps` |
| `bvps` | `bvps`, `book_value_per_share` |
| `dividend` | `dividend`, `cash_dividend` |

Thứ tự xử lý mỗi row:
1. Chuẩn hoá kỳ: `year = int(year_report ?? year ?? 0)`, `quarter = int(length_report ?? quarter ?? 0)`; parse lỗi → `(0, 0)`. Ghi lại vào `year_report` / `length_report`.
2. Điền canonical từ ứng viên (chỉ khi canonical hiện tại thuộc `{null, 0}`).
3. Nếu còn thiếu → lấy từ `_bankMetrics` theo key `(year, quarter)`:
   - Nguồn = `incomeQuarters` **nối** `incomeYears`.
   - Phát hiện ngân hàng theo từng record: `isBank = Boolean(isb38 || isb27 || isb43)`.
   - Ngân hàng: `revenue = isb38 || isb27 || 0`, `net_profit = isb43 || isa22 || 0`.
   - Phi ngân hàng: `revenue = isa3 || 0`, `net_profit = isa22 || 0`.
   - Cả hai: `eps = isa23 || isa24 || 0`.
   - Chỉ ghi đè khi field canonical đang falsy.
4. `bvps` nếu vẫn thiếu: `bvps = market_cap / pb / number_of_shares_mkt_cap` (chỉ khi cả 3 truthy; bỏ qua `TypeError`/chia 0).
5. Sắp **giảm dần** theo `(year_report, length_report)`.
6. Tính growth thiếu, dùng kỳ **cùng quý năm trước** `(year - 1, length_report)`:
   - `revenue_growth = (r.revenue - prev.revenue) / prev.revenue` (tỷ lệ thập phân, **không** ×100).
   - `net_profit_growth` tương tự. Chỉ tính khi cả hai giá trị truthy và growth hiện tại falsy.

### 6.4 `filterRatioPeriod`

- `period === 'Y'`: giữ row `length_report === 5`; **và** giữ row `length_report === 4` cho những năm **không có** row `length_report === 5` (fallback Q4 làm kỳ năm).
- Ngược lại (`'Q'`): giữ `length_report ∈ {1,2,3,4}`.

---

## 7. Vietcap Market Overview (`vietcap_market_overview.py`)

Base: `_TRADING_BASE = https://trading.vietcap.com.vn`, `_IQ_BASE = https://iq.vietcap.com.vn` (ở module này **không** kèm `/api`; path truyền đầy đủ).

Header: base `VCI` + ghi đè `Accept: application/json`, `Referer: https://trading.vietcap.com.vn/iq/market` (POST thêm `Content-Type: application/json`).

### 7.1 Bộ helper số học (bắt buộc tái tạo đúng)

```ts
// Tiền (VND), số cổ phiếu, số đếm → integer hoặc null
function toIntAmount(v: unknown): number | null;
//  null/undefined → null
//  int (không phải bool) → giữ nguyên
//  parse Decimal(String(v).trim()); nếu có phần thập phân ≠ 0 → log WARNING rồi TRUNCATE
//  parse lỗi → null

// Tỷ lệ, phần trăm, điểm ảnh hưởng → float hoặc null
function toFloatRatio(v: unknown): number | null;
//  null → null ; number (không bool) → float ; string → parseFloat(trim) ; lỗi → null
```

### 7.2 Validator hình dạng & unwrap

- `_unwrap_iq(data, url)`: data phải là object; **`data.successful` phải truthy**, ngược lại throw `MarketOverviewUpstreamShapeError("API unsuccessful: {data.msg ?? 'unknown'}")`; trả `data.data`.
- `_require_dict` / `_require_list` / `_require_key`: sai kiểu hoặc thiếu key bắt buộc → `MarketOverviewUpstreamShapeError`.
- `_post_trading` / `_get_trading` / `_get_iq`: bọc mọi exception từ `fetchJson` thành `MarketOverviewUpstreamError("POST {path}: {err}")`.
- Endpoint map: ShapeError → **502**, UpstreamError → **503**.
- `_default_from_to()` = `[now - 365*86400, now]` (epoch giây), dùng khi caller không truyền `from_ts`/`to_ts`.

### 7.3 16 phép lấy dữ liệu

| # | Hàm | Upstream | Enum / default | Normalize |
|---|---|---|---|---|
| 1 | `fetch_liquidity` | `POST /api/chart/v3/OHLCChart/gap-liquidity` body `{from,to,symbols:[symbols],timeFrame}` | `time_frame ∈ ONE_MINUTE, ONE_DAY, ONE_WEEK, ONE_MONTH, ONE_YEAR` (default `ONE_MINUTE`); `symbols ∈ ALL, VNINDEX, HNXIndex, HNXUpcomIndex` | `symbols ← symbol` (array), `timestamps ← t[]` (toIntAmount), `accumulated_volume ← accumulatedVolume[]` (toIntAmount), `accumulated_value_million_vnd ← accumulatedValue[]` (**toFloatRatio, đơn vị triệu VND**), `min_batch_trunc_time ← minBatchTruncTime` |
| 2 | `fetch_index_impact` | `POST /api/market-watch/v2/IndexImpactChart/getData` body `{group,timeFrame}` | `group ∈ ALL,HOSE,HNX,UPCOM`; `time_frame ∈ ONE_DAY,ONE_WEEK,ONE_MONTH,YTD,ONE_YEAR` | `{ top_up, top_down, group, time_frame }`; mỗi item: `symbol`, `impact` (toFloatRatio, **điểm chỉ số**), `exchange`, `company_name ← organName`, `match_price` (toIntAmount), `ref_price` (toFloatRatio). `topUp`/`topDown` là key **bắt buộc** và phải là array |
| 3 | `fetch_foreign` | `POST /api/market-watch/v3/ForeignVolumeChart/getAll` body `{from,to,group,timeFrame}` | default `time_frame=ONE_MONTH` | `trunc_time`, `foreign_buy_volume`, `foreign_sell_volume` (shares), `foreign_buy_value_vnd`, `foreign_sell_value_vnd` (**VND tuyệt đối**), `group`, `time_frame` |
| 4 | `fetch_foreign_top` | `POST /api/market-watch/v3/ForeignNetValue/top` | default `ONE_YEAR` | `{ net_buy[], net_sell[], total_net_buy_vnd ← totalNetBuy, total_net_sell_vnd ← totalNetSell, group }`; item: `symbol, exchange, company_name ← organName, net_value_vnd ← net, buy_value_vnd ← foreignBuyValue, sell_value_vnd ← foreignSellValue, match_price, ref_price` |
| 5 | `fetch_proprietary` | `GET /api/fiin-api-service/v3/proprietary-trading-value?timeFrame&market` | default `market=ALL`, `ONE_YEAR` | `_unwrap_iq` → `data` (object) → `data.data` (array). Item: `trading_date`, `total_buy_value_vnd`, `total_sell_value_vnd`, `total_buy_volume`, `total_sell_volume`, `total_deal_buy_volume`, `total_deal_sell_volume` |
| 6 | `fetch_proprietary_top` | `GET {IQ}/api/iq-insight-service/v1/market-watch/top-proprietary?timeFrame&exchange` | default `exchange=ALL` | `{ buy ← data.data.BUY, sell ← data.data.SELL, trading_date }`; item: `ticker, exchange, company_name ← organName, total_value_vnd ← totalValue, total_volume, match_price, ref_price`. `totalValue` âm = bán ròng |
| 7 | `fetch_allocation` | `POST /api/market-watch/AllocatedValue/getAllocatedValue` body `{group,timeFrame}` | — | **Flatten đặc biệt:** với mỗi block, quét 6 section `totalIncrease, totalNochange, totalDecrease, totalSymbolIncrease, totalSymbolNochange, totalSymbolDecrease`; mỗi item trong section có `group` + các key giá trị; sinh key kết quả `"{section}_{item.group}"` = `toIntAmount(value)` cho **mọi key ≠ 'group'**. Vì vậy hậu tố upstream (`_t_last_year`, `_t_today`…) bị bỏ hoàn toàn và nhiều key sẽ ghi đè nhau nếu section có >1 field giá trị |
| 8 | `fetch_sectors_allocation` | `POST /api/market-watch/AllocatedICB/getAllocated` | — | `icb_code` (toIntAmount), `icb_change_percent ← icbChangePercent` (float), `total_value_vnd ← totalValue`, `total_stock_increase/decrease/no_change`, `icb_code_parent ← icbCodeParent` (nguyên trạng) |
| 8b | `fetch_icb_codes` | `GET {IQ}/api/iq-insight-service/v1/sectors/icb-codes` | — | Bỏ item thiếu `name`; `icb_code ← toIntAmount(name)`, `vi_sector`, `en_sector`, `icb_level ← icbLevel` |
| 9 | `fetch_valuation` | `GET {TRADING}/api/iq-insight-service/v1/market-watch/index-valuation?type&comGroupCode&timeFrame` | `val_type ∈ pe,pb`; `com_group_code ∈ VNINDEX,HNX30,VN30,VNMIDCAP,VNSMALLCAP,VN100`; `time_frame ∈ SIX_MONTHS,YTD,ONE_YEAR,TWO_YEAR,FIVE_YEAR,ALL` | `data.values[] → { date, value: toFloatRatio }`. ⚠️ Path này nằm trên host **trading**, không phải iq |
| 10 | `fetch_breadth` | `GET {IQ}/api/iq-insight-service/v1/market-watch/breadth?condition&exchange&enNumberOfDays` | `condition ∈ EMA50,EMA20,SMA50,SMA200`; `exchange` default `"HSX,HNX,UPCOM"`; `period ∈ M6,YTD,Y1,Y2,Y5,ALL` (default `Y1`) | `{ condition, count, total, percent (0–1), trading_date }` |
| 11 | `fetch_heatmap` | `POST /api/market-watch/HeatMapChart/getByIcb` body `{group,sector,size}` | `sector ∈ icb_code_1..4` (default `icb_code_2`); `size ∈ MKC,VOL,VAL` | Sector: `icb_code`, `icb_name`, `en_icb_name`, `icb_change_percent`, `total_market_cap_vnd ← totalMarketCap`, `stocks[]`. Stock: `symbol`, `volume`, `value_million_vnd ← value` (**triệu VND, float**), `price`, `ref_price ← refPrice`, `market_cap_vnd ← marketCap`, `ceiling_price`, `floor_price` (đều VND, toIntAmount) |
| 12 | `fetch_heatmap_index` | `GET /api/market-watch/HeatMapChart/getIndex` | — | `total_stock`, `total_trading_volume`, `total_trading_value_million_vnd ← totalTradingValue` (**triệu VND**), `total_foreign_buy_volume ← totalFrBuyVolume`, `…SellVolume`, `total_foreign_buy_value_vnd ← totalFrBuyValue`, `…SellValue`, `index_data[] ← indexData[] → { symbol, price, ref_price }` (float) |
| 13 | `fetch_sector_detail` | `POST /api/market-watch/AllocatedICB/getAllocatedDetail` body `{group,timeFrame,icbCode}` | `group ∈ ALL,HOSE,HNX,UPCOM`; `time_frame ∈ ONE_DAY,ONE_WEEK,ONE_MONTH,YTD,ONE_YEAR` | Header sector giống #8, thêm `stocks[]` từ `icbDataDetail[]`: `symbol, ref_price, match_price, ceiling_price, floor_price, accumulated_volume, accumulated_value_vnd ← accumulatedValue, company_name ← organName, en_company_name ← enOrganName, foreign_net_volume, foreign_net_value_vnd, board` |
| 14 | `fetch_stock_strength` | `GET {IQ}/api/iq-insight-service/v1/ta/stock-strength?exchange` | `exchange ∈ ALL,HOSE,HNX,UPCOM,HSX` | Map phẳng `{ ticker: score }`; **lọc bỏ mọi value không phải int** (loại `null`). Score 3–99 |
| 15 | `fetch_market_index` | `POST /api/price/marketIndex/getList` body `{symbols}` | default `["VNINDEX","HNXIndex","HNXUpcomIndex"]`; hợp lệ thêm `VN30`, `HNX30` | `symbol, board, price, ref_price, change, change_percent` (float), `total_shares` (int), `total_value_million_vnd ← totalValue` (**triệu VND, float**), `total_stock_increase/decline/no_change/ceiling/floor` (int), `time` |
| 16 | `fetch_search_bar` | `GET {IQ}/api/iq-insight-service/v2/company/search-bar?language` | `language: 1=vi, 2=en` | `code, name, short_name ← shortName, floor, is_index ← isIndex (default false), current_price ← currentPrice, target_price ← targetPrice, upside_pct ← upsideToTpPercentage, logo_url ← logoUrl, icb_lv1 ← icbLv1, icb_lv2 ← icbLv2` |
| 17 | `fetch_event_codes` | `GET {IQ}/api/iq-insight-service/v1/event-codes` | — | `event_code, event_name_vi ← eventNameVi, event_name_en ← eventNameEn` |
| 18 | `fetch_maintenance` | `GET {IQ}/api/iq-insight-service/v1/notification?type=maintenance` | — | `data` là array → trả nguyên; là object → `[obj]` nếu non-empty, `[]` nếu rỗng; khác → `[]` |

Endpoint nội bộ tương ứng: `GET /api/v1/market-data/overview/{liquidity, index-impact, foreign, foreign/top, proprietary, proprietary/top, allocation, sectors/allocation, sectors/detail, valuation, breadth, heatmap, heatmap/index, stock-strength, market-index, maintenance}` (cache `REDIS_TTL_OVERVIEW_SECONDS = 30s`), cùng `GET /reference/search`, `GET /reference/event-codes`.

---

## 8. Vietcap Screening (`vietcap_screening.py`)

Base `https://iq.vietcap.com.vn/api/iq-insight-service`. Header: base `VCI` + `Accept: application/json` + `Referer: https://trading.vietcap.com.vn/iq/screening`.

`_unwrap(data, url)` ở module này **không kiểm tra `successful`** — chỉ yêu cầu object rồi lấy `data.data`. Exception: `ScreeningUpstreamShapeError` → 502, `ScreeningUpstreamError` → 503.

### 8.1 `GET /v1/screening/criteria` → `GET /market-data/screening/criteria`

34 tiêu chí, 3 category (`general`, `technical`, `fundamental`). Normalize:

```ts
type ScreeningCriterion = {
  id: string; category: string; name: string;
  order: number | null;
  allow_duplicate: boolean;      // allowDuplicate, default false
  select_type: string;           // selectType, default ''
  slider_stepper: unknown | null;// sliderStepper
  multiplier: unknown | null;
  min: unknown | null; max: unknown | null;
  condition_options: unknown[];  // conditionOptions, default []
  condition_extra: unknown | null;
  active: boolean;               // default true
};
```

### 8.2 `POST /v1/screening/paging` → `POST /market-data/screening/search`

Body gửi lên (tên field upstream, **không** snake_case):

```json
{
  "page": 0,
  "pageSize": 50,
  "sortFields": ["stockStrength"],
  "sortOrders": ["DESC"],
  "filter": [
    { "name": "exchange", "conditionOptions": [{ "type": "value", "value": "hsx" }] },
    { "name": "marketCap", "conditionOptions": [{ "from": 500, "to": 100000 }] },
    { "name": "rs", "conditionOptions": [{ "from": 50, "to": 100 }], "extraName": "3Month" }
  ]
}
```

Default khi caller không truyền: `page=0`, `pageSize=50`, `sortFields=["stockStrength"]`, `sortOrders=["DESC"]`, `filter=[]`.

Response normalize:

```ts
type ScreeningResult = {
  content: {
    ticker: string; exchange: string;
    ref_price: unknown; ceiling: unknown; market_price: unknown; floor: unknown;   // refPrice/marketPrice
    accumulated_value: unknown; accumulated_volume: unknown; market_cap: unknown;
    daily_price_change_percent: unknown;                                           // dailyPriceChangePercent
    en_organ_name: string; vi_organ_name: string;
    en_organ_short_name: string; vi_organ_short_name: string;
    icb_code_lv2: string; en_sector: string; vi_sector: string; icb_code_lv4: string;
    stock_strength: unknown;                                                       // stockStrength
  }[];
  total_elements: number;  // totalElements, default 0
  total_pages: number;     // totalPages, default 0
  page: number;            // number, default = page gửi lên
  page_size: number;       // size, default = pageSize gửi lên
  first: boolean;          // default true
  last: boolean;           // default false
  empty: boolean;          // default false
};
```

Lưu ý: các field số ở đây **giữ nguyên kiểu upstream** (không qua toInt/toFloat).

### 8.3 `GET /v1/setting/screeners` → `GET /market-data/screening/presets`

Response `data` là object `{ SYSTEM: [...], USER?: [...] }`. Với mỗi category (bỏ value không phải array), normalize từng screener: `{ id, name, vi_name ← viName, mode, order, metrics ← metrics ?? [] }`. Kết quả giữ đúng key category gốc (`SYSTEM`, `USER`).

---

## 9. Vietcap Sector (`vietcap_sector.py`)

Base `https://iq.vietcap.com.vn/api/iq-insight-service`. Header: `VCI` + `Accept: application/json` + `Referer: https://trading.vietcap.com.vn/iq/sector`.
`_unwrap` ở module này **CÓ** kiểm tra `data.successful` (khác module screening). Enum: `ICB_LEVELS = {1,2,3,4}`, `ADTV_VALUES = {1,3,6}`, `VALUE_THRESHOLDS = {3,5,10}`.

| Hàm | Upstream | Normalize |
|---|---|---|
| `fetch_trading_dates` | `GET /v1/sector-ranking/trading-date` | array 20 date string; **chỉ giữ phần tử là string**; giảm dần theo upstream |
| `fetch_sector_ranking` | `GET /v1/sector-ranking/sectors?icbLevel&adtv&value` (default 2/3/3) | `{ icb_code ← item.name, values: [...] }`; mỗi value: `{ date, value: toInt }` + **chỉ thêm khi key tồn tại**: `sector_trend ← sectorTrend` (UP/DOWN, nguyên trạng), `extreme_value ← extremeValue` (toInt), `trend_start_value ← trendStartValue` (toInt) |
| `fetch_sector_information` | `GET /v1/sector-information?icbLevel` (default 2) | `icb_code ← icbCode`, `market_cap` (toInt), `last_close_index ← lastCloseIndex` (float), `last_20_day_index ← last20DayIndex[]` (float, `[]` nếu không phải array), `percent_price_change_1d/1w/1m/6m/ytd/1y/2y/5y ← percentPriceChange1Day/1Week/1Month/6Month/YTD/1Year/2Year/5Year` (float) |

Helper: `toFloat` (null → null, bool bị loại, string trim → parse, lỗi → null); `toInt` (`int(float(String(v).trim()))`, lỗi → null).

---

## 10. Vietcap AI News (`vietcap_ai_news.py`)

Base `https://ai.vietcap.com.vn`. Header: `VCI` + `Accept: application/json` + `Referer`/`Origin` = `https://ai.vietcap.com.vn`.

Exception: `AINewsNotFoundError` → 404, `AINewsUpstreamShapeError` → 502, `AINewsUpstreamError` → 503.

### 10.1 Danh sách tin

`kind` → path (`_KIND_MAP`): `business → /api/v3/news_info`, `topic → /api/v3/topics_info`, `exchange → /api/v3/xnews_info`. `kind` khác → `ValueError("Loại tin không hợp lệ: {kind}")` → 422.

Query params (`_build_list_params`):

| Param | Nguồn | Quy tắc |
|---|---|---|
| `page` | `page` (default 1) | luôn gửi |
| `page_size` | `min(page_size, 99)` (default 20) | **max 99 do VietCap chặn** |
| `language` | default `"vi"` | luôn gửi |
| `ticker`, `industry`, `topic`, `sentiment` | tương ứng | chỉ gửi khi truthy |
| `newsfrom` | `source` | chỉ gửi khi truthy — **đổi tên** |
| `update_from` | `max(update_from, today - 30 ngày)` | **clamp về tối đa 30 ngày** (VietCap từ chối khoảng lớn); so sánh là **string ISO** |
| `update_to` | tương ứng | chỉ gửi khi truthy |

Kiểm tra hình dạng (mọi vi phạm → ShapeError): response phải là object, phải có key `news_info`, `news_info` phải là array, và **mọi phần tử phải là object** (kiểm tra trước khi normalize). `total_records` default `0`.

Normalize item (`_norm_item(raw, rawType)`):

```ts
type AiNewsItem = {
  id: string; slug: string; ticker: string; industry: string;
  title: string;                  // news_title
  short_content: string;          // news_short_content
  source_link: string;            // news_source_link
  image_url: string;              // news_image_url
  update_date: string;            // update_date
  source: string;                 // news_from
  source_name: string;            // news_from_name
  sentiment: string;
  score: number;                  // default 0
  topic_name: string;
  male_audio_duration: number;    // default 0
  female_audio_duration: number;  // default 0
  raw_type: string;               // = kind đã truyền
};
```

### 10.2 Chi tiết theo slug

`GET /api/v3/news_from_slug?slug=&language=`. Response phải là object; **`data.id` falsy → `AINewsNotFoundError`** → 404.

`_norm_detail` = `_norm_item(raw, raw.news_type ?? 'unknown')` + thêm:
`company_name`, `summary`, `highlight_position`, `news_full_content_html ← news_full_content`, `news_full_content_text` = strip HTML (`<[^>]+>` → space, sau đó gộp whitespace, trim) — `''` nếu không có html, `file_attachments ← file_attachment` (default `[]`), `news_type`.

### 10.3 Audio

`GET /api/audio_from_id?id={news_id}`. Response phải là object; **thiếu cả `male` và `female` → NotFound (404)**. Trả `{ male_url ← male ?? '', female_url ← female ?? '' }`.

### 10.4 Catalogs (partial-tolerant)

4 sub-fetch **độc lập**, mỗi cái lỗi thì chỉ ghi warning và trả section rỗng:

| Section | Upstream | Normalize |
|---|---|---|
| `topics` | `GET /api/v3/topics_all?language=` | phải có `static_topic`; item → `{ name, key }` |
| `sources` | `GET /api/v3/get_source_info?language=` | phải là **array**; item → `{ name: viName ?? enName ?? '', value }` |
| `industries` | `GET /api/get_industry_info` (không param language) | phải là array; item → `{ name: viName ?? enName ?? '', value }` |
| `top_tickers` | `GET /api/v2/get_top_tickers?industry=&group=hose&top_neg=5&top_pos=5` | phải có `ticker_info`; item → `{ ticker, score (default 0), sentiment, company_name ← organ_name, logo }` |

Kết quả bổ sung: `partial = warnings.length > 0`, `available_sections` = các section trong thứ tự `[topics, sources, industries, top_tickers]` **có dữ liệu**, `warnings: string[]` dạng `"{section}: {error}"`. Endpoint `GET /market-data/news/ai/catalogs` **luôn trả 200** kèm `partial`/`warnings` — không throw.

### 10.5 Ticker sentiment

`GET /api/v3/ticker_score?ticker={SYM}&industry=&group=&summary=false&language=`.

- Response phải là object, phải có `ticker_info`, `ticker_info` phải là array (vi phạm → ShapeError 502).
- `ticker_info` **rỗng** → trả `{ ticker: SYM, score: 0, sentiment: '', news_count: 0 }` (không lỗi).
- Phần tử `[0]` phải là object. Normalize: `ticker` (fallback SYM), `score` (0), `sentiment` (''), `news_count ← cnt_news` (0), `count_positive ← count_pos`, `count_neutral ← count_neu`, `count_negative ← count_neg`, `company_name ← organ_name`, `logo`, `summaries ← extractive_summaries` (`[]`), `summary_sentiments ← extractive_sentiments` (`[]`).

---

## 11. VNDIRECT (`vndirect.py`)

Source token `VND`. Hai host: `https://dchart-api.vndirect.com.vn` (chart) và `https://api-finfo.vndirect.com.vn/v4` (insights).

### 11.1 Danh sách mã (fallback cho `reference.symbols`)

`GET {INSIGHT}/stocks?q=type:stock,ifc~floor:{exchange}&size=9999` — `exchange` default `"HOSE,HNX,UPCOM"`.

Normalize: `symbol ← code`, `name ← companyName`, `exchange ← floor`, `asset_type ← type.toLowerCase()` (hoặc `null`). Items lấy từ `raw.data` nếu object, ngược lại dùng chính `raw`.

### 11.2 OHLCV (nguồn CHÍNH của `quote.ohlcv`)

```bash
curl 'https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=VCB&from=1745452800&to=1776988800'
```

Interval map (`INTERVAL_MAP`): `1m→1`, `5m→5`, `15m→15`, `30m→30`, `1H→60`, `1D→D`, `1W→W`, `1M→M`; khác → `D`.

Response là **object các mảng song song** `{ t, o, h, l, c, v }`. Normalize giống VCI nhưng **không có** `value`: `{ time, open, high, low, close, volume }`, thiếu index → `0`.

### 11.3 Xếp hạng (`insights.ranking`)

`_INDEX_MAP`: `VNINDEX→VNIndex`, `HNX→HNX`, `VN30→VN30`; khác → `VNIndex`.

| `kind` | URL |
|---|---|
| `gainer` | `{INSIGHT}/top_stocks?q=index:{idx}~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:gt:0&size={limit}&sort=priceChgPctCr1D` |
| `loser` | `…~priceChgPctCr1D:lt:0&size={limit}&sort=priceChgPctCr1D:asc` |
| `value` | `…?q=index:{idx}~accumulatedVal:gt:0&size={limit}&sort=accumulatedVal` |
| `volume` | `…~nmVolumeAvgCr20D:gte:10000~nmVolNmVolAvg20DPctCr:gte:100&size={limit}&sort=nmVolNmVolAvg20DPctCr` |
| `deal` | `{INSIGHT}/top_stocks?size={limit}&q=index:{idx}~nmVolumeAvgCr20D:gte:10000&sort=ptVolTotalVolAvg20DPctCr` |
| `foreign-buy` | `{INSIGHT}/foreigns?q=type:STOCK,IFC,ETF~netVal:gt:0~tradingDate:{date}&sort=tradingDate~netVal:desc&size={limit}&fields=code,netVal,tradingDate` |
| `foreign-sell` | như trên với `netVal:lt:0` và `sort=tradingDate~netVal:asc` |
| khác | throw `ValueError("Unknown ranking kind: {kind}")` |

Normalize top_stocks (`_TOP_STOCK_COLS`, **chỉ copy key có mặt trong item**):

| Upstream | Nội bộ |
|---|---|
| `code` | `symbol` |
| `index` | `index` |
| `lastPrice` | `last_price` |
| `lastUpdated` | `last_updated` |
| `priceChgCr1D` | `price_change_1d` |
| `priceChgPctCr1D` | `price_change_pct_1d` |
| `accumulatedVal` | `accumulated_value` |
| `nmVolumeAvgCr20D` | `avg_volume_20d` |
| `nmVolNmVolAvg20DPctCr` | `volume_spike_20d_pct` |

Normalize foreigns: `{ symbol ← code, date ← tradingDate, net_value ← netVal (default 0) }`. `date` trống → phần `tradingDate:` trong query rỗng (upstream tự hiểu là mới nhất).

---

## 12. KB Securities (`kbs.py`)

Base `https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo`.

Header **cứng, không dùng `getHeaders`**:

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0
Referer: https://kbbuddywts.kbsec.com.vn/6d054136-b880-4c8b-887b-90311120d1c4
Origin: https://kbbuddywts.kbsec.com.vn
Accept: application/json
Accept-Language: en-US,en;q=0.9,vi;q=0.8
```

### 12.1 Profile

`GET {base}/profile/{SYMBOL}?l=1`. Trả `{}` nếu response không phải object hoặc rỗng (không throw).

Response là object với **key viết tắt**. Map (`_PROFILE_MAP`):

| KBS key | Field nội bộ | Đơn vị / ghi chú |
|---|---|---|
| `SM` | `business_model` | |
| `SB` | `symbol` | |
| `FD` | `founded_date` | |
| `HM` | `number_of_employees` | có thể bị ghi đè, xem dưới |
| `LD` | `listing_date` | |
| `FV` | `par_value` | VND / cổ phiếu |
| `EX` | `exchange` | map qua `_EXCHANGE_CODE_MAP` |
| `LP` | `listing_price` | VND |
| `KLCPNY` | `charter_capital` | **VND, chính xác** (= `KLCPLH × FV`) |
| `KLCPLH` | `outstanding_shares` | số cổ phiếu, chính xác |
| `CTP` / `CTPP` | `ceo_name` / `ceo_position` | |
| `IS` / `ISP` | `inspector_name` / `inspector_position` | |
| `FP` | `establishment_license` | |
| `BP` | `business_code` | |
| `TC` | `tax_id` | |
| `KT` | `auditor` | |
| `TY` | `company_type` | |
| `ADD`, `PHONE`, `FAX`, `EMAIL`, `URL` | `address`, `phone`, `fax`, `email`, `website` | |
| `BRANCH` | `branches` | |
| `HS` | `history` | |
| `AD` | `as_of_date` | |

**Bị chủ động DROP (không map):** `CC` (vốn điều lệ đơn vị **tỷ**, làm tròn → thiếu chính xác), `VL` (KL niêm yết đơn vị **triệu** cổ phiếu, làm tròn), `SFV` (trùng `FV`).

Xử lý thêm:
- Field kiểu string chứa `<` hoặc `&` → strip HTML (`<[^>]+>` → `''`, trim).
- `exchange` map: `HOSE→HOSE`, `HSX→HOSE`, `HNX→HNX`, `UPCOM→UPCOM`, `XHNF→HNX`; ngoài map → giữ nguyên.
- `number_of_employees`: nếu `raw.LaborStructure` là array non-empty thì **cộng tổng `item.Value`** (bỏ giá trị parse lỗi); tổng > 0 → **ghi đè** giá trị từ `HM`.
- Invariant kiểm chứng (VCB/FPT/VNM): `charter_capital === outstanding_shares × par_value`.

### 12.2 Sub-entity (cùng response profile)

| Hàm | Mảng nguồn | Map |
|---|---|---|
| `normalizeShareholders` | `raw.Shareholders` | `NM→name`, `D→date`, `V→shares_owned`, `OR→ownership_percentage` |
| `normalizeOfficers` | `raw.Leaders` | `FD→from_date`, `PN→position`, `NM→name`, `PO→position_en`, `PI→owner_code` |
| `normalizeSubsidiaries` | `raw.Subsidiaries` | `D→date`, `NM→name`, `CC→charter_capital`, `OR→ownership_percent`, `CR→currency` + **thêm `type`**: `ownership_percent > 50 → 'subsidiary'`, `≤ 50 → 'affiliate'`, parse lỗi → `'unknown'`; không có pct → không thêm key |

Mảng không tồn tại / không phải array / rỗng → `[]`.

### 12.3 Tin công ty

`GET {base}/news/{SYMBOL}?l=1&p={page}&s={page_size}` (default `page=1`, `page_size=20`). Response **phải là array**, ngược lại `[]`.

Normalize: `{ article_id ← ArticleID, title ← Title (''), summary ← stripHtml(Head), url ← URL (''), published_at ← PublishTime ('') }`.

Endpoint nội bộ `GET /company/{symbol}/news` dùng `allowEmpty=true` (rỗng là hợp lệ); các endpoint KBS còn lại dùng validator mặc định (rỗng → 502).

---

## 13. Maybank Trade — vĩ mô (`mbk.py`)

Base `https://data.maybanktrade.com.vn/`. Endpoint duy nhất: `POST {base}data/reportdatatopbynormtype`.

Header: `getHeaders('MBK')` rồi **xoá `Content-Type` cũ và set `application/x-www-form-urlencoded; charset=UTF-8`** (case của key phải khớp). Body là **string form-encoded thô**:

```
type={periodType}&fromYear={start_year}&toYear={end_year}&from=0&to=0&normTypeID={normTypeId}
```

`period` → `type` (`_REPORT_PERIOD`): `day→"1"`, `month→"2"`, `quarter→"3"`, `year→"4"`. Ngoài danh sách → `ValueError`.

`indicator` → `normTypeID` (`_TYPE_ID`):

| indicator | normTypeID | Chu kỳ mặc định (`_DEFAULT_PERIOD_BY_INDICATOR`) |
|---|---|---|
| `gdp` | `43` | `quarter` |
| `cpi` | `52` | `month` |
| `industrial_production` | `46` | `month` |
| `export_import` | `48` | `month` |
| `retail` | `47` | `month` |
| `fdi` | `50` | `month` |
| `money_supply` | `51` | `month` |
| `exchange_rate` | `53` | `day` |
| `population_labor` | `55` | `year` |
| `interest_rate` | `66` | `day` |

Indicator không hợp lệ → `ValueError("Unknown indicator '{x}'. Valid: [...]")` (→ 422). `default_period_for_indicator` trả `quarter` cho indicator lạ. `start_year` default `2015`; `end_year` default = năm hiện tại.

Normalize: response phải là array; mỗi item **snake_case toàn bộ key** rồi **xoá các tiền tố/hậu tố**: thay thế chuỗi `tern_`, `norm_`, `term_`, `from_`, `_code` bằng `''` (theo đúng thứ tự đó, `String.replace` toàn cục trên chuỗi snake). Ví dụ `normValue → value`, `termCode → ` (xem cảnh báo dưới).

⚠️ Cảnh báo khi port: phép xoá tiền tố là `replace` chuỗi con **bất kể vị trí**, nên có thể tạo key trùng nhau và ghi đè. Phải copy đúng thứ tự thay thế để giữ nguyên hành vi (kể cả điểm yếu này).

Endpoint nội bộ `GET /market-data/macro/economy/{indicator}` dùng `allowEmpty=true`.

---

## 14. Fmarket — quỹ mở (`fmarket.py`)

Base `_BASE_URL = https://api.fmarket.vn/res/products`. Source token `FMARKET`.

### 14.1 Danh sách quỹ — `POST {base}/filter`

Body (nguyên văn, các field cố định phải giữ):

```json
{
  "types": ["NEW_FUND", "TRADING_FUND"],
  "issuerIds": [],
  "sortOrder": "DESC",
  "sortField": "navTo6Months",
  "page": 1,
  "pageSize": 100,
  "isIpo": false,
  "fundAssetTypes": [],
  "bondRemainPeriods": [],
  "searchField": "",
  "isBuyByReward": false,
  "thirdAppIds": []
}
```

`fund_type` → `fundAssetTypes`: `""→[]`, `"BALANCED"→["BALANCED"]`, `"BOND"→["BOND"]`, `"STOCK"→["STOCK"]`; giá trị lạ (sau `.toUpperCase()`) → `[]`.

Rows lấy từ `data.data.rows` (chỉ khi response là object). Normalize:

```ts
type FundListItem = {
  fund_id: number | null;        // id
  short_name: string;            // shortName
  name: string;
  fund_type: string;             // dataFundAssetType.name
  fund_owner: string;            // owner.name
  management_fee: unknown;       // managementFee
  inception_date: unknown;       // firstIssueAt
  nav: unknown;
  code: string;
  nav_change_1m: unknown;        // productNavChange.navTo1Months
  nav_change_3m: unknown;        // productNavChange.navTo3Months
  nav_change_6m: unknown;        // navTo6Months
  nav_change_12m: unknown;       // navTo12Months
  nav_change_36m: unknown;       // navTo36Months
  nav_update_at: unknown;        // productNavChange.updateAt
};
```

### 14.2 Chi tiết quỹ — `GET {base}/{fund_id}`

**HTTP 400 từ upstream → throw `ValueError("Không tìm thấy quỹ {fund_id}")`** (endpoint map → 404). Các status khác → re-throw.

Normalize từ `data.data`:
- `top_holdings` = `productTopHoldingList` **nối** `productTopHoldingBondList`; item → `{ stock_code ← stockCode, industry, net_asset_percent ← netAssetPercent, type }`.
- `industry_holdings` = `productIndustriesHoldingList` → `{ industry, net_asset_percent ← assetPercent }` (chú ý: key upstream là `assetPercent`, không phải `netAssetPercent`).
- `asset_holdings` = `productAssetHoldingList` → `{ asset_type ← assetType.name, asset_percent ← assetPercent }`.

Nếu response không phải object → trả `{}`.

### 14.3 NAV history

URL **được xây bằng cách bỏ ký tự cuối của base**: `_BASE_URL[:-1] + "/get-nav-history"` → **`https://api.fmarket.vn/res/product/get-nav-history`** (số ít "product"). Đây là URL thật, không phải bug — bản TS phải hardcode đúng chuỗi này.

Method POST, body:

```json
{ "isAllData": 1, "productId": <fund_id>, "fromDate": null, "toDate": "YYYYMMDD" }
```

`toDate` = ngày hiện tại theo giờ **local server**, format `%Y%m%d`.

HTTP 400 → `ValueError("Không tìm thấy quỹ {fund_id}")`. Normalize: `data.data[]` → `{ date ← navDate, nav_per_unit ← nav }`.

---

## 15. Simplize — hàng hoá (`spl.py`)

Base `https://api.simplize.vn/api`. Header **cứng, không dùng `getHeaders`**:

```
accept: application/json
user-agent: vns_market_data/1.0
```

`GET {base}/historical/prices/ohlcv?ticker={ticker}&interval={interval}&type=commodity[&from=&to=]`

- `code` không nằm trong `COMMODITY_MAP` → `ValueError("Unknown commodity '{code}'. Valid: [...]")`.
- `interval` cho phép `1d` (default), `1h`, `1m`.
- `from` = epoch giây của `start` 00:00:00 UTC; `to` = epoch giây của `end` **23:59:59 UTC**.

`COMMODITY_MAP` (code nội bộ → ticker upstream + tên VN):

| code | ticker | name |
|---|---|---|
| `gold_vn_buy` | `GOLD:VN:BUY` | Vàng VN (mua) |
| `gold_vn_sell` | `GOLD:VN:SELL` | Vàng VN (bán) |
| `gold_global` | `GC=F` | Vàng thế giới |
| `oil_crude` | `CL=F` | Dầu thô |
| `gas_natural` | `NG=F` | Khí thiên nhiên |
| `gas_ron92` | `GAS:RON92:VN` | Xăng RON92 |
| `gas_ron95` | `GAS:RON95:VN` | Xăng RON95 |
| `oil_do` | `GAS:DO:VN` | Dầu DO |
| `coke` | `ICEEUR:NCF1!` | Than cốc |
| `steel_d10` | `STEEL:D10:VN` | Thép D10 VN |
| `iron_ore` | `COMEX:TIO1!` | Quặng sắt |
| `steel_hrc` | `COMEX:HRC1!` | Thép HRC |
| `fertilizer_ure` | `CBOT:UME1!` | Phân ure |
| `soybean` | `ZM=F` | Đậu tương |
| `corn` | `ZC=F` | Ngô |
| `sugar` | `SB=F` | Đường |
| `pork_north_vn` | `PIG:NORTH:VN` | Heo hơi miền Bắc VN |
| `pork_china` | `PIG:CHINA` | Heo hơi Trung Quốc |

Normalize (chấp nhận **hai hình dạng**): `raw = data.data ?? data`; với mỗi item —
- item là **array** độ dài ≥ 6 → `{ time: item[0], open: item[1], high: item[2], low: item[3], close: item[4], volume: item[5] }`;
- item là object → lấy theo key `time/open/high/low/close/volume`.

`list_commodities()` trả catalog tĩnh `{ code, ticker, name }[]` cho `GET /macro/commodities`.

SPL còn là **fallback `SIMPLIZE` của `macro.gold`**: khi SJC lỗi/rỗng, endpoint gọi `fetch_commodity_price('gold_global', start=date, end=date)` → dữ liệu vàng **thế giới** (đơn vị USD/oz), khác bản chất với giá SJC (VND/lượng). Bản TS phải giữ nguyên hành vi này và biết meta `source` sẽ là `SIMPLIZE`, `fallback_used = true`.

---

## 16. SJC — giá vàng (`sjc.py`)

`POST https://sjc.com.vn/GoldPrice/Services/PriceService.ashx`

- Header: `getHeaders('SJC')` + ghi đè `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`.
- Body raw: `method=GetSJCGoldPriceByDate&toDate={urlEncoded(DD/MM/YYYY)}` — chuyển từ `YYYY-MM-DD` bằng cách split `-` rồi ghép `{d}/{m}/{y}`; encode với `safe=''` (mã hoá cả `/` thành `%2F`).

Response: `{ "data": [ { "TypeName": ..., "BranchName": ..., "BuyValue": ..., "SellValue": ... } ] }` — `BuyValue`/`SellValue` là **VND tuyệt đối**.

Normalize: `{ date: <date đã truyền>, name ← TypeName, branch ← BranchName, buy_price ← BuyValue, sell_price ← SellValue }` (giá giữ nguyên kiểu upstream, không đổi đơn vị). `data` không phải object → `[]`.

Endpoint `GET /market-data/macro/gold?date=&source=` — `date` default hôm nay theo **UTC** (`datetime.now(UTC)`), validate regex `^\d{4}-\d{2}-\d{2}$`, sai → 422. Chain: SJC → SIMPLIZE (§15).

---

## 17. Vietcombank — tỷ giá (`vcb.py`)

`GET https://www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD`

⚠️ **`date` là bắt buộc — thiếu sẽ nhận 404** (ghi rõ trong docstring source).

Response: `{ "Date": "2026-08-17T...", "Data": [ { "currencyCode", "currencyName", "cash", "transfer", "sell" } ] }`.

Parse số (`_parse`): `null` hoặc `"-"` → `null`; ngược lại **bỏ toàn bộ dấu phẩy** rồi `parseFloat`; lỗi → `null`.

```ts
type FxRow = {
  currency_code: string | null;  // currencyCode
  currency_name: string | null;  // currencyName
  buy_cash: number | null;       // cash
  buy_transfer: number | null;   // transfer
  sell: number | null;           // sell
  date: string;                  // data.Date.slice(0,10) nếu có, ngược lại date đã truyền
};
```

Registry `macro.fx` khai báo fallback `MBK, ASEAN` nhưng endpoint **chỉ đăng ký handler `VCB`** → VCB chết là 502 ngay (`?source=MBK` cũng sẽ throw `ValueError` vì thiếu handler).

---

## 18. Google Sheets v4 (`google_sheets.py`)

- Base `https://sheets.googleapis.com/v4/spreadsheets`
- Spreadsheet ID **hardcode**: `1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI`
- Ranges: `VND` (lãi suất liên bank), `TPCP` (lợi suất trái phiếu chính phủ), `TYGIA` (tỷ giá)
- Xác thực: query `key={GOOGLE_SHEETS_API_KEY}`. Env rỗng → throw `RuntimeError("GOOGLE_SHEETS_API_KEY is not configured")`.
- Header **chỉ** `Accept: application/json`; `maxRetries = 2` (khác default 3).

```bash
curl 'https://sheets.googleapis.com/v4/spreadsheets/1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI/values/VND?key=$GOOGLE_SHEETS_API_KEY'
```

Response: `{ "values": [[header...], [row...], ...] }`.

Parse chung (`fetch_sheet_data`): `values.length < 2` → `[]`. Hàng 0 là header (đã `.trim()`); mỗi hàng sau được **pad thêm chuỗi rỗng** cho đủ độ dài header rồi zip thành object.

Hai bộ parse số:

```ts
// '5,50%' → 5.5 ; '-3,10%' → -3.1 ; '' hoặc '-' → null
function parseVnPercent(s: string): number | null; // bỏ '%', đổi ',' thành '.', parseFloat

// '26.334' → 26334 ; '165' → 165 ; '-' → null
function parseNumber(s: string): number | null;    // XOÁ TẤT CẢ dấu '.', rồi parseFloat
```

⚠️ `parseNumber` **xoá mọi dấu chấm** (coi `.` là phân cách nghìn kiểu VN) — số thập phân kiểu Anh sẽ bị nhân sai. Phải giữ nguyên hành vi.

Normalize theo sheet (output dùng **camelCase**, khác phần còn lại của backend):

| Sheet | Header đầu vào | Output |
|---|---|---|
| `VND` (`normalize_vnd`) | `KỲ HẠN`, `TODAY`, `YESTERDAY`, `CHÊNH LỆNH %` (fallback `CHÊNH LỆCH %`) | `{ tenor, today, yesterday, change, todayNumeric, yesterdayNumeric, changeNumeric }` — cả 3 số dùng `parseVnPercent` |
| `TPCP` (`normalize_tpcp`) | `KỲ HẠN`, `TODAY`, `YESTERDAY`, `CHÊNH LỆNH POINTS` (fallback `CHÊNH LỆCH POINTS`) | như trên, nhưng `changeNumeric` = `parseFloat(change.replace(',', '.'))` (đơn vị **điểm**), `'-'`/rỗng → `null` |
| `TYGIA` (`normalize_tygia`) | `NGOẠI TỆ`, `TODAY`, `YESTERDAY`, `CHÊNH LỆCH` | `{ currency, today, yesterday, change, todayNumeric, yesterdayNumeric, changeNumeric }` — `today/yesterday` dùng `parseNumber`, `change` dùng `replace(',', '.')` |

Nơi dùng: `GET /market-data/rates/interbank`, `/rates/bond-yields`, `/rates/fx-table` (cache `REDIS_TTL_SHEETS_SECONDS`), cùng `ai/patterns_service.py` và `ai/forecast_service.py`.

---

## 19. Binance — crypto (`binance.py`)

**Không dùng `fetchJson`.** Module tự tạo `httpx.AsyncClient` mỗi request với logic riêng.

| Thuộc tính | Giá trị |
|---|---|
| Hosts (rotate) | `api.binance.com`, `api-gcp.binance.com`, `api1..api4.binance.com` (6 host) |
| Timeout | `30.0` giây |
| Số lần thử | `5` (`_MAX_ATTEMPTS`) |
| Status retry | `{429, 500, 502, 503, 504}` |
| Backoff | `min(10.0, 2.0 * 2^attempt)` giây |
| Header | chỉ `User-Agent` (lấy từ `getHeaders('MSN')`) + `Accept: application/json` |

Quy tắc rotate host: gặp status retryable → `hostIdx = (hostIdx + 1) % 6` **trước khi** throw để retry; gặp timeout/connect error → cũng rotate. 4xx khác 429 → **fail fast** (throw ngay). Biến `_host_idx` là **module-level, dùng chung mọi request** (round-robin toàn cục).

`raw_endpoint` trả về luôn là `"{_HOSTS[0]}{path}"` — tức URL của host **đầu tiên**, không phải host đã thực sự phục vụ.

### 19.1 OHLC — `GET /api/v3/uiKlines?symbol&interval&limit`

`interval` default `'1d'`, `limit` default `500` (endpoint chặn `1..1000`).

Response là array các array; index dùng: `[0]` openTime (ms), `[1]` open, `[2]` high, `[3]` low, `[4]` close, `[5]` volume.

```ts
type BinanceOhlc = {
  time: string;      // YYYY-MM-DD (UTC) từ floor(k[0]/1000)
  timestamp: number; // epoch giây
  open: number; high: number; low: number; close: number; volume: number; // parseFloat
};
```

### 19.2 Ticker 24h — `GET /api/v3/ticker/24hr?symbol`

⚠️ Truy cập **bắt buộc** (`r["lastPrice"]` v.v.): `lastPrice`, `openPrice`, `highPrice`, `lowPrice`, `bidPrice`, `askPrice`, `priceChange`, `priceChangePercent`, `volume`, `quoteVolume` — thiếu key → KeyError. Các key `symbol`, `openTime`, `closeTime`, `count` dùng `.get()`.

```ts
type BinanceTicker = {
  symbol: string | null; last_price: number; open_price: number; high_price: number;
  low_price: number; bid_price: number; ask_price: number; price_change: number;
  change_pct: number;      // priceChangePercent (đơn vị %)
  volume: number; quote_volume: number;
  open_time: number | null; close_time: number | null; count: number | null;
};
```

### 19.3 Depth — `GET /api/v3/depth?symbol&limit`

`limit` default `100` (endpoint chặn `1..5000`). Normalize: `{ last_update_id ← lastUpdateId, bids: [{price, qty}], asks: [{price, qty}] }` — mỗi level là `[priceStr, qtyStr]` → `parseFloat`.

Nơi dùng: `GET /market-data/global/crypto/{symbol}/{ohlc|ticker|depth}` (validate symbol regex `^[A-Z0-9]{2,20}$`, sai → 422); và job snapshot quốc tế (§20.3).

---

## 20. Yahoo Finance — chỉ số/FX/hàng hoá quốc tế (`yahoo.py`)

`GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d` — qua `fetchJson` với source `YAHOO`.

```bash
curl 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d' \
  -H 'Referer: https://finance.yahoo.com/'
```

Chỉ dùng `data.chart.result[0].meta`. Thiếu cấu trúc → `ValueError("Yahoo: unexpected response structure for '{symbol}'")`.

### 20.1 `parseChartMeta(meta, symbol)` — parser thuần

| Field | Nguồn | Quy tắc |
|---|---|---|
| `symbol` | `meta.symbol` | fallback = symbol truyền vào |
| `name` | `meta.shortName` \|\| `meta.longName` \|\| `symbol` | |
| `last_price` | `meta.regularMarketPrice` | có thể `null` |
| `previous_close` | `meta.chartPreviousClose` **nếu ≠ null**, ngược lại `meta.previousClose` | dùng nullish (không dùng `\|\|`) để không hiểu sai giá trị `0.0` |
| `change_value` | `last_price - previous_close` | `null` nếu thiếu một trong hai |
| `change_percent` | `change_value / previous_close × 100` | `null` khi `previous_close === 0` |
| `day_high` / `day_low` | `regularMarketDayHigh` / `regularMarketDayLow` | |
| `volume` | `regularMarketVolume` | |
| `currency`, `market_state` | `currency`, `marketState` | |
| `market_time` | `regularMarketTime` (epoch giây) → **ISO-8601 UTC** | parse lỗi (`ValueError/OSError/OverflowError`) → `null` |

### 20.2 `fetchMany(symbols)` — chống 429

- `Semaphore(5)` (`_SEMAPHORE_LIMIT`).
- Trước mỗi request: `sleep(random(0.1, 0.2))` giây (jitter).
- Symbol **fail** hoặc `last_price == null` → coi là thất bại (log WARNING), **không** đưa vào kết quả.
- Sau pass 1, các symbol thất bại được thử lại **đúng MỘT pass** với `pre_delay = 2.0` giây trước mỗi request (`_RETRY_PRE_DELAY_S`), vẫn dưới cùng semaphore + jitter.
- Symbol fail cả 2 pass bị **bỏ khỏi dict trả về** (contract: chỉ trả symbol thành công).

Giới hạn đã biết: Yahoo trả **429** khi burst; vì `fetchJson` không retry 4xx, cơ chế né duy nhất là semaphore 5 + jitter + 1 retry-pass 2s. Symbol vẫn thiếu sẽ được xử lý ở tầng snapshot (§20.4).

### 20.3 Vũ trụ 45 mã (`intl_symbols.py`)

8 category: `us_index` (5: `^DJI ^GSPC ^IXIC ^RUT ^VIX`), `us_futures` (3: `ES=F NQ=F YM=F`), `asia_index` (8: `^N225 ^KS11 ^HSI 000001.SS 399001.SZ ^TWII ^STI ^AXJO`), `fx` (6: `DX-Y.NYB VND=X CNY=X JPY=X KRW=X EURUSD=X`), `commodity` (11: `BZ=F CL=F GC=F SI=F HG=F NG=F SB=F KC=F ZC=F ZS=F ZW=F`), `bond` (3: `^TNX ^IRX ^TYX`), `crypto` (2: `BTC-USD ETH-USD`), `etf` (5: `VNM EEM FM SPY AAXJ`).

- `WAVE2_SYMBOLS` = `^N225, ^KS11, ^AXJO` + toàn bộ fx + toàn bộ commodity.
- `WAVE3_SYMBOLS` = `^HSI, 000001.SS, 399001.SZ, VNM`.
- `CRITICAL_SYMBOLS` = `^GSPC, ^N225, DX-Y.NYB, BZ=F, GC=F, VNM`.

### 20.4 Job 3-wave + snapshot DB (`intl_snapshot_job.py`, `intl_snapshot.py`)

- Wave 1 (06:00 ICT) = ALL_SYMBOLS; Wave 2 (07:05) = WAVE2; Wave 3 (08:30) = WAVE3. Cron mon-fri, gate `INTL_DATA_ENABLED`.
- Bỏ qua nếu không phải ngày giao dịch VN (`is_trading_day`) → `{ skipped: 'not_trading_day' }`.
- Advisory lock Postgres key **`826_101_733`** (`pg_try_advisory_lock`) khi chạy theo scheduler → chỉ một uvicorn worker fetch; không lấy được lock → `{ skipped: 'locked' }`. Unlock trong `finally` + commit.
- **`BTC-USD` và `ETH-USD` KHÔNG lấy từ Yahoo** mà từ Binance ticker: map `BTC-USD→BTCUSDT (Bitcoin)`, `ETH-USD→ETHUSDT (Ethereum)`. Chuyển đổi: `previous_close = last_price - price_change`, `change_value = price_change`, `change_percent = change_pct`, `currency = 'USD'`, `market_state = 'REGULAR'`.
- `parsed = { ...yahooParsed, ...cryptoParsed }` (crypto ghi đè).

`persistSnapshotRows(db, day, parsed, requested)`:

1. **Pre-filter NOT NULL:** chỉ giữ symbol có **cả 4** `last_price`, `previous_close`, `change_value`, `change_percent` ≠ null. Symbol bị loại được log WARNING và đi tiếp vào nhánh stale/missing.
2. Upsert từng symbol hợp lệ vào `market_data_snapshot` theo khoá `(snapshot_date, symbol)`; `asset_category` từ `CATEGORY_BY_SYMBOL` (không tìm thấy → `'other'` + WARNING); `market_time` parse từ ISO string (lỗi → `null` + WARNING); `stale = false`.
3. Symbol **được yêu cầu nhưng thiếu** → tìm row mới nhất **strictly trước `day`**:
   - Không có → thêm vào `missing[]`.
   - Có → **copy nguyên giá trị cũ** sang row của `day` với `stale = true` (kể cả `source`), update nếu row hôm nay đã tồn tại.
4. `commit()`, trả `{ upserted, stale_copied, missing }`.

Cảnh báo chất lượng dữ liệu (log ERROR) khi: `(missing.length + stale_copied) > 0.2 × requested.length`, **hoặc** có symbol trong `CRITICAL_SYMBOLS` bị missing, **hoặc** critical bị stale-copy.

`GET /market-data/global/snapshot?category=` đọc **snapshot_date lớn nhất** trong bảng (không phải hôm nay) và trả `{ data: rows, meta: { snapshot_date, stale_count } }`; bảng rỗng → `{ data: [], meta: { snapshot_date: null, stale_count: 0 } }`.

---

## 21. MSN Finance (`msn.py`)

Ba URL:

```
Charts (index/forex): https://assets.msn.com/service/Finance/Charts/TimeRange
Crypto:               https://assets.msn.com/service/Finance/Cryptocurrency/chart
Resolver (apikey):    https://assets.msn.com/resolver/api/resolve/v3/config/
```

### 21.1 apikey động

MSN không có API key tĩnh — phải resolve từ config endpoint:

```
GET {resolver}?expType=AppConfig&expInstance=default&apptype=finance
  &v={YYYYMMDD}.168&targetScope={JSON}
```

- `v` = `YYYYMMDD` của **(now UTC − 7 giờ)** rồi thêm hậu tố `.168`.
- `targetScope` = JSON stringify của object `_MSN_SCOPE`:

```json
{
  "audienceMode": "adult",
  "browser": { "browserType": "chrome", "version": "0", "ismobile": "false" },
  "deviceFormFactor": "desktop",
  "domain": "www.msn.com",
  "locale": { "content": { "language": "vi", "market": "vn" },
              "display": { "language": "vi", "market": "vn" } },
  "ocid": "hpmsn",
  "os": "macos",
  "platform": "web",
  "pageType": "financestockdetails"
}
```

Bóc apikey (`_extract_apikey`), theo đúng thứ tự ưu tiên, từ
`res.configs["shared/msn-ns/HoroscopeAnswerCardWC/default"].properties`:
1. `horoscopeAnswerServiceClientSettings.apikey`
2. `mvpAPIkey`
3. `weatherApi.apiKey`

Không có → `ValueError("MSN resolver: apikey not found in response")`.

**Cache Redis:** key `mkt:msn:apikey`, TTL **21600 giây (6 giờ)**. Đọc cache lỗi hay ghi cache lỗi đều chỉ log DEBUG, không throw. Redis `null` → bỏ qua cache hoàn toàn.

### 21.2 Bảng SecId (`MSN_SECID`)

Symbol nội bộ → MSN SecId. Symbol không có trong bảng → `resolve_secid` trả `null` → endpoint trả **422** (`Không hỗ trợ mã chỉ số/cặp tiền`); trong `_fetch_chart` thì throw `ValueError("No MSN SecId for symbol: {symbol}")`.

| Nhóm | Mapping |
|---|---|
| Index | `INX→a33k6h`, `DJI→a6qja2`, `USA30→a6qja2`, `COMP→a3oxnm`, `RUT→b9v42w`, `NYA→a74pqh`, `UKX→aopnp2`, `DAX→afx2kr`, `PX1→aecfh7`, `N225→a9j7bh`, `000001→adfh77`, `HSI→ah7etc`, `SENSEX→ahkucw`, `VNI→aqk2nm` |
| Crypto | `BTC→c2111`, `BTCUSDT→c2111`, `ETH→c2112`, `BNB→c2113`, `XRP→c2117`, `ADA→c2114`, `SOL→c2116`, `DOGE→c2119`, `USDT→c2115`, `USDC→c211a` |
| Forex | `USDVND→avyufr`, `JPYVND→ave8sm`, `EURVND→av93ec`, `EURUSD→av932w`, `USDJPY→avyomw`, `GBPUSD→avyjhw`, `AUDUSD→auxr9c`, `XAUUSD→ck48ur`, `XAGUSD→ck48xm` |

### 21.3 Query chart (`_chart_params`)

```
apikey={apikey}
StartTime={start}T17:00:00.000Z     // start default '2000-01-01'
EndTime={end}T16:59:00.858Z         // end default hôm nay (UTC)
timeframe=1
ocid=finance-utils-peregrine
cm=vi-vn
it=web
scn=ANON
ids={secid}
type=All
wrapodata=false
disableSymbol=false
```

Response: array; lấy phần tử `[0]`; rỗng → trả `[]`. `is_currency` = `force_currency` nếu được truyền, ngược lại `item.securityType === 'currencyPair'`.
- `fetch_world_index` → `force_currency = false`
- `fetch_forex` → `force_currency = true`
- `fetch_crypto` → `force_currency = false`, dùng URL crypto (giá **theo VND**)

### 21.4 Normalize series (`_norm_series`)

Mảng song song trong `item.series`: `timeStamps`, `openPrices`, `pricesHigh`, `pricesLow`, `prices` (close), `volumes`.

Sentinel `_SENTINEL = -99999901.0`.

Với mỗi index i:
1. Nếu **bất kỳ** trong `open/high/low` là `null` hoặc `=== _SENTINEL` → **bỏ hàng**.
2. `ts` = epoch giây parse từ `timeStamps[i]` (ISO, thay `Z` → `+00:00`); parse lỗi → **bỏ hàng**.
3. `volume` = `null` nếu `is_currency` **hoặc** `volumes[i] === _SENTINEL`; ngược lại giá trị thô.

```ts
type MsnOhlc = {
  time: string;      // YYYY-MM-DD (UTC)
  timestamp: number; // epoch giây
  open: number; high: number; low: number;
  close: number | null;    // prices[i] — KHÔNG bị loại theo sentinel
  volume: number | null;
};
```

Giới hạn đã biết: MSN từng trả **404** cho một số SecId/khoảng thời gian; ba endpoint MSN (`world-index`, `forex`) đặt `allowEmpty=true` nên **`[]` là hợp lệ** (trả 200 với data rỗng) thay vì 502. `intl.crypto_ohlc` mới có MSN làm fallback thật sau Binance.

---

## 22. RSS tin tức (`news.py`)

**Không dùng `fetchJson`** (vì response là XML). Tự tạo `httpx.AsyncClient(timeout=10.0)`, header `getHeaders('RSS')` + `Accept: application/rss+xml, application/xml, text/xml`. Duyệt feed **tuần tự** (không song song), feed lỗi → `continue` **âm thầm**.

`RSS_FEEDS`:

| site | feeds |
|---|---|
| `vnexpress` | `https://vnexpress.net/rss/tin-moi-nhat.rss` |
| `tuoitre` | `https://tuoitre.vn/rss/tin-moi-nhat.rss`, `https://tuoitre.vn/rss/kinh-doanh.rss` |
| `cafebiz` | `https://cafebiz.vn/rss/home.rss`, `https://cafebiz.vn/rss/vi-mo.rss` |
| `vietstock` | `https://vietstock.vn/761/kinh-te/vi-mo.rss`, `https://vietstock.vn/768/kinh-te/kinh-te-dau-tu.rss` |
| `thanhnien` | `https://thanhnien.vn/rss/home.rss` |
| `dantri` | `https://dantri.com.vn/rss/tin-moi-nhat.rss` |
| `vietnamnet` | `https://vietnamnet.vn/rss/tin-moi-nhat.rss` |

Parse: XML → tìm mọi `.//item`. Bỏ item thiếu `title` hoặc `link`. Xử lý text: bỏ wrapper `<![CDATA[...]]>` (DOTALL) rồi strip tag HTML, trim. `image_url` = `src` của thẻ `<img>` **đầu tiên** trong `description` **thô** (regex `<img[^>]+src=["']([^"']+)["']`).

```ts
type NewsItem = {
  title: string; link: string;
  description: string;   // đã strip, cắt còn 500 ký tự
  pub_date: string;      // pubDate nguyên trạng (chuỗi RFC-822)
  image_url: string;     // '' nếu không có
  site: string;          // tên site
};
```

`max_per_site` (default 20) áp cho **từng feed URL**, không phải từng site. Dedupe theo `link` **sau khi** gom hết. `raw_endpoint` = 3 URL đầu nối bằng `,`, thêm `...+{n} more` nếu nhiều hơn 3.

Endpoint `GET /market-data/news/latest` dùng `allowEmpty=true`.

---

## 23. Simplize CDN — logo (`services/symbols.py`)

- Base: `SIMPLIZE_LOGO_BASE_URL`, default `https://cdn.simplize.vn/simplizevn/logo`.
- URL logo: `{base}/{SYMBOL_UPPER}.jpeg`.
- Chỉ dùng trong script seed symbol (`python -m app.scripts.seed_symbols`).
- Với flag `--validate-logos`: gửi **HEAD** request (`httpx`, timeout **5.0s**, `follow_redirects=true`); hợp lệ khi `status === 200` **và** `content-type` bắt đầu bằng `image/`. Mọi exception → coi là không hợp lệ.
- Fallback: logo Simplize không hợp lệ → dùng `logo_url` từ Vietcap search-bar, đặt `logo_source = 'VIETCAP'`; không có nữa → `logo_url = null`, `logo_source = null`.
- Không có flag → **không kiểm tra**, mặc định coi Simplize hợp lệ (`logo_source = 'SIMPLIZE'` theo logic đếm).

Nguồn dữ liệu của seed: `fetch_search_bar(language=1)` (Vietcap IQ, primary) merge với `fetch_symbols_by_exchange()` (Vietcap Trading; lỗi → fallback `vndirect.fetch_symbols()`; cả hai lỗi → `null`, chỉ dùng dữ liệu search-bar). Symbol bị bỏ nếu `code` rỗng, dài > 10, hoặc chứa space. `source = 'VIETCAP_SEARCH_BAR'`.

---

## 24. DNSE — xác thực + realtime

### 24.1 REST auth (`realtime/dnse_auth.py`)

Hai bước (đã xác minh live 2026-06-11):

```bash
# 1) Lấy JWT (~8h)
curl -X POST "$DNSE_AUTH_URL" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"username":"...","password":"..."}'
# → { "token": "<JWT>" }

# 2) Lấy investorId (dùng làm MQTT username)
curl "$DNSE_ME_URL" -H 'Accept: application/json' -H 'authorization: Bearer <JWT>'
# → { "investorId": "0001234567", ... }
```

- URL default: `DNSE_AUTH_URL = https://services.entrade.com.vn/dnse-user-service/api/auth`, `DNSE_ME_URL = https://services.entrade.com.vn/dnse-user-service/api/me`.
- Gọi qua `fetchJson` với `maxRetries = 2`, `source = 'DNSE'`.
- Lỗi transport → `DnseAuthError("DNSE /auth request failed: {ExceptionType}")` (chỉ log **tên** exception, không log body/password). Thiếu `token` → `DnseAuthError("DNSE /auth returned no token")`; thiếu `investorId` → `"DNSE /me returned no investorId"`.
- Cache module-level `DnseToken { token, investor_id, issued_at }`. `is_stale(refreshHours)` = `monotonic() - issued_at >= refreshHours * 3600`; `REALTIME_TOKEN_REFRESH_HOURS` default **7** (refresh trước hạn ~8h).
- Thiếu `DNSE_USERNAME`/`DNSE_PASSWORD` → `DnseAuthError("DNSE credentials missing (DNSE_USERNAME/DNSE_PASSWORD)")`.
- `reset_cache()` xoá cache (shutdown / buộc re-auth).

### 24.2 Chọn transport (`resolve_transport`)

`DNSE_TRANSPORT` ∈ `auto | openapi | mqtt` (default `auto`). Giá trị tường minh thắng; `auto` chọn `openapi` **chỉ khi có cả** `DNSE_API_KEY` và `DNSE_API_SECRET`, ngược lại `mqtt`.

### 24.3 OpenAPI WebSocket (`realtime/openapi_stream.py`)

URL: `DNSE_OPENAPI_WS_URL` default `wss://ws-openapi.dnse.com.vn/v1/stream`; nếu URL chưa có `?` thì tự thêm `?encoding=json`.

Handshake:
1. Connect (`ssl` context chỉ khi `wss://`; `ping_interval=30`, `ping_timeout=30`, `max_queue=512`; toàn bộ bọc timeout **30s**).
2. Đọc frame welcome → `session_id = welcome.session_id ?? welcome.sid ?? ''`.
3. Gửi frame auth HMAC:

```ts
// message = `${apiKey}:${timestamp}:${nonce}`
// signature = HMAC_SHA256(apiSecret, message).hex()
type AuthFrame = {
  action: 'auth'; api_key: string; signature: string; timestamp: number; nonce: string;
};
// default: timestamp = floor(Date.now()/1000), nonce = String(floor(Date.now()*1000)) (micro giây)
```

4. Reply phải có `action === 'auth_success'`; ngược lại throw `OpenApiAuthError("DNSE OpenAPI auth failed: {reply.message ?? reply.msg ?? action ?? 'unknown'}")`. **Bất kỳ lỗi trong handshake đều phải `close()` socket** trước khi throw (nếu không sẽ rò kết nối TLS vì bridge retry liên tục).
5. Keepalive: client tự gửi `{"action":"ping"}` mỗi **25s**; server ping ~3 phút và force-close sau 1 phút không có pong; mọi connection bị force-close sau **8 giờ**.

Frame subscribe/unsubscribe:

```json
{ "action": "subscribe", "channels": [ { "name": "tick_extra.G1.json", "symbols": ["FPT"] } ] }
```

Channel theo kind (`openapi_channel`):

| kind | channel | symbols |
|---|---|---|
| `tick` | `tick_extra.G1.json` | `[SYMBOL]` — **phải là `tick_extra`**, chỉ TradeExtra có field `side`; `tick` thường sẽ làm mọi tick thành `side: 'unknown'` |
| `orderbook` | `top_price.G1.json` | `[SYMBOL]` |
| `ohlc` | `ohlc.1.json` | `[SYMBOL]` — resolution `1` = 1 phút |
| `index` | `market_index.{SYMBOL}.json` | `[]` (mảng rỗng) |

Dispatch frame dữ liệu theo discriminator `T` (`_T_KIND`): `t→tick`, `te→tick`, `q→orderbook`, `b→ohlc`, `mi→index`. Frame có `action`/`a` là **control frame**: `ping` → gửi `{"action":"pong"}`; `error` → log WARNING; `subscribed`/`unsubscribed`/`pong` → bỏ qua. Các `T` khác (`sd`, `e`, `f`, `bc`) hiện bị bỏ qua có chủ đích.

### 24.4 MQTT legacy KRX (`realtime/bridge.py`, `topics.py`)

Kết nối `aiomqtt`:

| Tham số | Giá trị |
|---|---|
| hostname | `DNSE_MQTT_HOST` = `datafeed-lts.dnse.com.vn` |
| port | `DNSE_MQTT_PORT` = `443` |
| transport | `websockets`, `websocket_path` = `DNSE_MQTT_WS_PATH` = `/wss` |
| username | `token.investor_id` |
| password | `token.token` (JWT) |
| identifier | `iqx-{WORKER_ID}` |
| protocol | MQTT **v5** |
| TLS | `ssl.create_default_context()` |
| keepalive | `120` |

Topic prefix `plaintext/quotes/krx/mdds`; **wildcard `#` KHÔNG được phép** — phải subscribe từng topic chính xác:

| kind | topic |
|---|---|
| `tick` | `{prefix}/tick/v1/roundlot/symbol/{SYMBOL}` |
| `orderbook` | `{prefix}/topprice/v1/roundlot/symbol/{SYMBOL}` |
| `ohlc` | `{prefix}/v2/ohlc/stock/1/{SYMBOL}` |
| `index` | `{prefix}/marketindex/v1/code/{SYMBOL}` |

`topic_kind(topic)` lấy segment ngay sau `/krx/mdds/`: `tick→tick`, `topprice→orderbook`, `v2→ohlc`, `ohlc→ohlc`, `marketindex→index`, `stockinfo→stockinfo`; không chứa `/krx/mdds/` → `null`.

Redis pub/sub channel (`redis_channel`): `rt:tick:{SYM}`, `rt:ob:{SYM}`, `rt:ohlc:{SYM}`, `rt:index:{SYM}`, khác → `rt:other:{SYM}`.

### 24.5 Normalize payload DNSE (`realtime/normalize.py`)

Quy ước đơn vị (đã xác minh live):
- Giá **cổ phiếu** DNSE ở **nghìn đồng** → phải **×1000** thành VND tuyệt đối (`_to_vnd` = `round(float × 1000)`), để khớp schema price-board REST.
- Khối lượng đã là **số cổ phiếu** tuyệt đối.
- Giá **phái sinh** và **chỉ số** là **điểm** → **KHÔNG** nhân 1000.
- `_f(value)` = parse float, `null`/lỗi → `0.0`.
- `_time_value`: object `{Seconds, Nanos}` (OpenAPI) → chuỗi ISO `YYYY-MM-DDTHH:MM:SS.mmmZ` (UTC); `Seconds <= 0` → `null`; string/None đi qua nguyên trạng.
- `_side`: chuỗi chứa `BUY` → `'B'`, chứa `SELL` → `'S'`, còn lại `'unknown'`.

```ts
type RtTick = { type: 'tick'; symbol: string; price: number; volume: number;
  side: 'B'|'S'|'unknown'; total_volume: number; time: string | null; session: unknown };
// price ← matchPrice (×1000 nếu là cổ phiếu), volume ← matchQtty,
// total_volume ← totalVolumeTraded, time ← sendingTime ?? time, session ← tradingSessionId

type RtOrderbook = { type: 'orderbook'; symbol: string;
  bids: {price:number;volume:number}[]; asks: {price:number;volume:number}[]; time: string|null };
// DNSE dùng key `bid` / `offer` (KHÔNG phải `ask`); qty key là `qtty` (MQTT/SDK) hoặc `quantity` (OpenAPI)

type RtOhlc = { type: 'ohlc'; symbol: string; time: number; open: number; high: number;
  low: number; close: number; volume: number; last_updated: number };
// time / lastUpdated là epoch giây (dạng string) → int

type RtIndex = { type: 'index'; code: string; value: number; change: number;
  change_percent: number; total_volume: number; total_value: number;
  advances: number; declines: number; nochange: number; time: string | null };
```

`RtIndex` phải chấp nhận **cả hai** hình dạng:

| Field | MQTT legacy | OpenAPI (`mi`) |
|---|---|---|
| `code` | `symbol` / `code` / `indexId` | `indexName` |
| `value` | `indexValue` / `value` | `valueIndexes` |
| `change` | `change` | `changedValue` |
| `change_percent` | `changePercent` / `ratioChange` | `changedRatio` |
| `total_volume` | `totalVolumeTraded` / `allQty` / `totalQtty` | như trên |
| `total_value` | `allValue` / `totalValue` | **`grossTradeAmount × 1e9`** (upstream đơn vị **tỷ đồng**) |
| `advances/declines/nochange` | `advances` / `declines` / `nochange`/`noChanges` | `fluctuationUpIssueCount` / `fluctuationDownIssueCount` / `fluctuationSteadinessIssueCount` |
| `time` | `sendingTime` / `time` | `transactTime` |

### 24.6 Degraded mode — fallback sang VCI polling

Khi DNSE mất kết nối, bridge (leader) vào chế độ degraded:
- Đặt cờ degraded, log WARNING `realtime: entering degraded mode (VCI polling)`.
- Mỗi vòng: gia hạn leader lock (mất lock → throw), đọc demand, **chỉ lấy symbol có kênh ngoài `index`** (mã chỉ số không tồn tại trên bảng giá VCI, trả `null`), cắt còn `REALTIME_MAX_SYMBOLS` (default 200).
- Gọi `vietcap.fetch_price_board(symbols)`, publish **tick tổng hợp** cho mỗi mã: `price = close_price ?? reference_price` (bỏ nếu 0/thiếu), `volume = 0`, `side = 'unknown'`, `total_volume = total_volume ?? 0`, `time = null`, **`degraded: true`**.
- Sleep `REALTIME_FALLBACK_POLL_SECONDS` (default 2.0s), đồng thời probe DNSE; OpenAPI → probe TCP tới host WS; MQTT → re-auth (JWT cached) + TCP tới broker. Kết nối lại được → thoát degraded.

Các setting liên quan: `REALTIME_ENABLED` (default false), `REALTIME_LEADER_LOCK_TTL` 30, `REALTIME_LEADER_RENEW_SECONDS` 10, `REALTIME_SUBSCRIBE_POLL_SECONDS` 1.5, `REALTIME_WS_MAX_SYMBOLS_PER_CONN` 100.

---

## 25. SePay — thanh toán + IPN

### 25.1 Cấu hình

| Env | Default | Ý nghĩa |
|---|---|---|
| `SEPAY_MERCHANT_ID` | `""` | field `merchant` trong form |
| `SEPAY_SECRET_KEY` | `""` | khoá HMAC **và** khoá so sánh IPN `X-Secret-Key` (cùng một giá trị!) |
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` | URL form action (đổi sang production URL khi go-live) |
| `APP_PUBLIC_URL` | `http://localhost:3000` | gốc để build success/error/cancel URL |

### 25.2 Tạo checkout — `POST /api/v1/premium/checkout`

Thứ tự thao tác (bắt buộc giữ):
1. Load plan theo `plan_id`; không có → `NotFoundError("gói Premium")`; `is_active === false` → `BadRequestError("Gói này không còn khả dụng")`.
2. Sinh `invoice_number = "IQX_" + uuid4().hex.slice(0,12).toUpperCase()`.
3. **Ghi DB**: tạo `PremiumPaymentOrder { invoice_number, user_id, plan_id, amount_vnd: plan.price_vnd, currency: 'VND', status: PENDING }`.
4. Dựng fields **theo đúng thứ tự** dưới đây (thứ tự quyết định signature).
5. Sinh signature, append field `signature` vào cuối danh sách.

```ts
type CheckoutFields = {
  order_amount: string;         // String(plan.price_vnd)
  merchant: string;             // SEPAY_MERCHANT_ID
  currency: 'VND';
  operation: 'PURCHASE';
  order_description: string;    // `IQX Premium - ${plan.name}`
  order_invoice_number: string; // invoice_number
  customer_id: string;          // String(user_id)
  success_url: string;          // `${APP_PUBLIC_URL}/payment/success`
  error_url: string;            // `${APP_PUBLIC_URL}/payment/error`
  cancel_url: string;           // `${APP_PUBLIC_URL}/payment/cancel`
};

type CheckoutResponse = {
  action: string;               // SEPAY_CHECKOUT_URL
  method: 'POST';
  fields: { name: string; value: string }[];  // 10 field + signature
  invoice_number: string;
  order_id: string;             // UUID của order vừa tạo
};
```

### 25.3 Thuật toán signature (CHÍNH XÁC)

```ts
const ALLOWED_FIELDS = [
  'order_amount', 'merchant', 'currency', 'operation', 'order_description',
  'order_invoice_number', 'customer_id', 'payment_method',
  'success_url', 'error_url', 'cancel_url',
] as const;

function signFields(fields: Record<string, string>, secretKey: string): string {
  const parts: string[] = [];
  for (const f of ALLOWED_FIELDS) {           // duyệt theo THỨ TỰ của ALLOWED_FIELDS
    if (f in fields) parts.push(`${f}=${fields[f]}`);  // bỏ qua field không có
  }
  const signedString = parts.join(',');       // ngăn cách bằng DẤU PHẨY, không space
  return crypto.createHmac('sha256', secretKey).update(signedString).digest('base64');
}
```

Điểm phải chú ý:
- Duyệt theo `ALLOWED_FIELDS` (không theo thứ tự key của object) → `payment_method` nằm giữa `customer_id` và `success_url` **nếu** có mặt; hiện IQX không gửi field này.
- Không URL-encode, không lowercase, không thêm secret vào chuỗi.
- Output là **base64 của HMAC-SHA256 dạng bytes** (không phải hex).

Ví dụ chuỗi được ký (giá trị minh hoạ):

```
order_amount=199000,merchant=MERCHANT1,currency=VND,operation=PURCHASE,order_description=IQX Premium - Gói 1 tháng,order_invoice_number=IQX_0A1B2C3D4E5F,customer_id=3f2a…,success_url=https://iqx.vn/payment/success,error_url=https://iqx.vn/payment/error,cancel_url=https://iqx.vn/payment/cancel
```

### 25.4 IPN — `POST /api/v1/premium/sepay/ipn` (public, không auth JWT)

**Bước 1 — lấy secret từ header, theo thứ tự:**
1. Header `X-Secret-Key`.
2. Nếu thiếu: header `Authorization` — bỏ prefix `Apikey ` (7 ký tự) hoặc `Bearer ` (7 ký tự); nếu có `Authorization` nhưng không khớp prefix nào thì dùng **toàn bộ** giá trị.
3. Nếu vẫn thiếu: header `x-api-key`.

**Bước 2 — so sánh constant-time** với `SEPAY_SECRET_KEY` (`hmac.compare_digest`). Không hợp lệ:
- Cố đọc body JSON để log (lỗi → `null`).
- Ghi `sepay_ipn_logs` với `secret_key_valid = false`, `result_status = 'secret_invalid'`.
- Trả **HTTP 401** `{"error": "unauthorized"}`.

**Bước 3 — parse:** JSON lỗi → log `result_status='invalid_json'` + **400** `{"error":"invalid_json"}`. Validate schema lỗi → `result_status='invalid_payload'` + **400** `{"error":"invalid_payload"}`.

**Bước 4 — `process_ipn(payload)`** (mọi nhánh dưới đây trả **HTTP 200** với `{"success":"true","message":<...>}`):

| Điều kiện | `message` |
|---|---|
| `notification_type !== 'ORDER_PAID'` | `ignored` |
| thiếu `order` hoặc `transaction` | `ignored` |
| `order.order_status !== 'CAPTURED'` | `ignored` |
| `transaction.transaction_status !== 'APPROVED'` | `ignored` |
| `order.order_currency !== 'VND'` | `ignored` |
| `transaction.transaction_currency` có mặt và `!== 'VND'` | `currency_mismatch` |
| thiếu `order.order_invoice_number` | `ignored` |
| `transaction_id` đã tồn tại và order đó đã `PAID` | `already_processed` |
| không tìm thấy order theo `invoice_number` | `order_not_found` |
| order local đã `PAID` | `already_processed` |
| `order_amount` parse fail | `amount_invalid` |
| `order_amount !== local.amount_vnd` | `amount_mismatch` |
| `transaction_amount` (nếu có) parse fail | `amount_invalid` |
| `transaction_amount !== local.amount_vnd` | `amount_mismatch` |
| atomic claim trả 0 dòng (request khác thắng) | `already_processed` |
| thành công | `processed` |

Parse tiền VND (`_parse_vnd_amount`): dùng **Decimal** (không float); rỗng/`null` → `null`; parse lỗi → `null`; `<= 0` → `null`; có phần thập phân khác `.00` → `null` (VND không có subunit); ngược lại `int`.

**Bước 5 — kích hoạt (chỉ khi claim thắng):**
- `claim_pending_order(invoice_number, sepay_transaction_id = txnId ?? "unknown_{invoice}", raw_ipn = JSON.stringify(payload), paid_at = now)` — **UPDATE có điều kiện `status = 'pending' → 'paid'`**, đây là toàn bộ cơ chế idempotency.
- Load plan theo `local_order.plan_id` → `_extend_subscription(user_id, plan)`.
- `_extend_subscription`: thử `atomic_extend_period` (UPDATE có `CASE`, cộng `plan.duration_days`); nếu 0 dòng thì INSERT subscription mới `{ current_period_start: now, current_period_end: now + duration, status: ACTIVE }`; INSERT gặp `IntegrityError` → rollback rồi **retry atomic extend**. Sau đó luôn `UPDATE users SET role = 'premium', updated_at = now()`.

**Bước 6 — log IPN:** `IPNLogService.record` ghi `sepay_ipn_logs` với `raw_body`, `raw_headers` (đã redact), `secret_key_valid`, `result_status = result.message`, `matched_order_id` (query theo `invoice_number`), `sepay_transaction_id`. Header bị redact thành `***`: `x-secret-key`, `authorization`, `cookie`, `set-cookie` (so sánh **lowercase**).

**Trường IPN nhận được (tất cả optional):**

```ts
type IPNPayload = {
  timestamp?: number | null;
  notification_type?: string | null;
  order?: {
    id?: string | null; order_id?: string | null; order_status?: string | null;
    order_currency?: string | null; order_amount?: string | null;
    order_invoice_number?: string | null; order_description?: string | null;
    custom_data?: string[] | null; user_agent?: string | null; ip_address?: string | null;
  } | null;
  transaction?: {
    id?: string | null; payment_method?: string | null; transaction_id?: string | null;
    transaction_type?: string | null; transaction_date?: string | null;
    transaction_status?: string | null; transaction_amount?: string | null;
    transaction_currency?: string | null; authentication_status?: string | null;
    card_number?: string | null; card_holder_name?: string | null; card_expiry?: string | null;
    card_funding_method?: string | null; card_brand?: string | null;
  } | null;
  customer?: { id?: string | null; customer_id?: string | null } | null;
};
```

### 25.5 Đường kích hoạt không qua SePay

`grant_type` trên `PremiumPaymentOrder` phân biệt nguồn gốc:
- `payment` — SePay IPN xác nhận.
- `admin_confirmed` — admin xác minh tiền bằng tay: dùng **cùng** `claim_pending_order` + `_extend_subscription`, nhưng `granted_by_user_id` + `grant_note` và **không** giả `sepay_transaction_id`/`raw_ipn`. Cần thiết vì webhook có thể không bao giờ đến (order kẹt PENDING mãi, `reconcile()` không giúp được vì nó cần một dòng `sepay_ipn_logs` làm bằng chứng). Trả `false` nếu request khác đã claim trước.
- `admin_grant` — comp, không kỳ vọng thanh toán: `invoice_number = "GRANT_" + uuid4().hex.slice(0,12).toUpperCase()`, `amount_vnd = 0`.

---

## 26. Telegram Bot API

Base `https://api.telegram.org`, URL method = `{base}/bot{TELEGRAM_BOT_TOKEN}/{method}`. Timeout **10.0s**, client `httpx` tạo mới mỗi call. Không cấu hình token → `is_configured() === false` và mọi call throw `TelegramError("Telegram chưa được cấu hình (thiếu TELEGRAM_BOT_TOKEN)")`.

Xử lý response: parse JSON, `data.ok` falsy → `TelegramError("Telegram {method} thất bại: {data.description}")`. Trả `data.result` nếu là object, ngược lại `{}`.

### 26.1 `sendMessage`

```json
{ "chat_id": "<id>", "text": "<html>", "parse_mode": "HTML", "disable_web_page_preview": true }
```

`parse_mode` mặc định `HTML` (tham số hoá được). Dùng trong `alerts/scan.py`: sau khi INSERT `AlertEvent` thành công (`IntegrityError` → rollback vì worker khác đã bắn trước → `false`), nếu `user.telegram_chat_id` có giá trị thì gửi tin; thành công → `event.delivered = true`, lỗi → `event.delivery_error = String(err).slice(0,300)` (**không throw ra ngoài**), rồi commit.

### 26.2 `setWebhook`

```json
{ "url": "<url>", "allowed_updates": ["message"], "secret_token": "<TELEGRAM_WEBHOOK_SECRET>" }
```

Gọi tại startup (`alerts/startup.py`) **chỉ khi** có đủ: bot token, `TELEGRAM_WEBHOOK_SECRET`, `APP_PUBLIC_URL`. URL = `{APP_PUBLIC_URL rstrip '/'}/api/v1/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}` — secret **vừa là path segment vừa là `secret_token`**. Thất bại → chỉ log WARNING, app vẫn boot.

Webhook endpoint kiểm tra header `X-Telegram-Bot-Api-Secret-Token` bằng `hmac.compare_digest` — **chỉ khi header có mặt** (header vắng thì không chặn; path segment là lớp bảo vệ chính).

### 26.3 Deep-link liên kết tài khoản (`telegram/linking.py`)

- `mint_link_token(user_id)`: token = `secrets.token_urlsafe(24)`, lưu Redis key `tg_link:{token}` = `String(user_id)`, TTL **600 giây (10 phút)**. Trả `{ token, deep_link }` với `deep_link = "https://t.me/{TELEGRAM_BOT_USERNAME}?start={token}"`; username rỗng → `deep_link = ""`.
- `resolve_link_token(token)`: đọc Redis, **xoá ngay** (one-time), parse UUID; miss hoặc parse lỗi → `null`.
- `handle_update(update, db)`: chỉ xử lý `update.message`; bỏ qua nếu thiếu `chat.id` hoặc `text` rỗng.
  - Text không bắt đầu `/start` → trả lời `"IQX Alerts đang hoạt động. Quản lý cảnh báo trong ứng dụng IQX."`
  - `/start` không kèm token → `"Chào mừng đến IQX Alerts. Mở liên kết kết nối từ ứng dụng IQX để bắt đầu."`
  - Token không resolve được → `"Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng thử lại từ ứng dụng IQX."`
  - Không tìm thấy user → `"Không tìm thấy tài khoản tương ứng."`
  - Thành công → set `user.telegram_chat_id = String(chat.id)`, `user.telegram_linked_at = now(UTC)`, commit, trả lời `"✅ Đã kết nối IQX Alerts. Bạn sẽ nhận tín hiệu theo watchlist của mình."`
- Mọi lỗi khi gửi reply đều bị **nuốt** (log WARNING) để không làm webhook fail.

---

## 27. Resend — email giao dịch (`services/email.py`)

`POST https://api.resend.com/emails`, header `Authorization: Bearer {RESEND_API_KEY}`, timeout **15.0s**, client mới mỗi lần gửi.

```ts
type ResendPayload = {
  from: string;      // EMAIL_FROM, default 'IQX <no-reply@iqx.vn>' (domain phải verified ở Resend)
  to: string[];      // [to]
  subject: string;
  html: string;
  text?: string;     // chỉ thêm khi có
};
```

Hành vi bắt buộc:
- `EMAIL_ENABLED === false` **hoặc** `RESEND_API_KEY` rỗng → **không gọi network**, log INFO `[email-disabled] skip send to=… subject=…`, trả `false`.
- Lỗi transport → log ERROR, trả `false` (**không throw** — không được làm hỏng luồng gọi).
- `status >= 400` → log ERROR kèm 300 ký tự đầu của body, trả `false`.
- 2xx → log INFO, trả `true`.

Link base: `EMAIL_LINK_BASE_URL || APP_PUBLIC_URL`, bỏ `/` cuối.
- Verify: `{base}/api/v1/auth/verify-email?token={token}` — subject `"Xác thực địa chỉ email của bạn"`, TTL token `EMAIL_VERIFY_TOKEN_TTL_HOURS` (default 48h).
- Reset: `{base}/api/v1/auth/reset-password?token={token}` — subject `"Đặt lại mật khẩu IQX"`, TTL `PASSWORD_RESET_TOKEN_TTL_HOURS` (default 2h). Token reset **bao gồm hash mật khẩu hiện tại** (đổi mật khẩu → token cũ vô hiệu).

Template (`email_templates.py`): HTML inline-style thuần, không Jinja, tiếng Việt; màu brand `#2563eb`, bg `#f4f5f7`, card `#ffffff`, text `#1f2937`, muted `#6b7280`. Mọi giá trị chèn vào đều **HTML-escape**; URL trong `href` escape với `quote=true`. Trả tuple `(html, text)`.

---

## 28. AI proxy — DeepSeek (`services/ai/proxy_client.py`)

Giao thức **OpenAI-compatible chat completions**.

| Env | Default | Ghi chú |
|---|---|---|
| `AI_PROXY_BASE_URL` | `""` | rỗng → `ValueError("AI proxy chưa được cấu hình. Hãy đặt AI_PROXY_BASE_URL trong biến môi trường.")` |
| `AI_PROXY_MODEL` | `deepseek-v4-flash` | gửi trong field `model` |
| `AI_PROXY_API_KEY` | `""` | rỗng → `ValueError("AI proxy API key chưa được cấu hình. …")` |
| `AI_PROXY_TIMEOUT_SECONDS` | `120.0` | timeout httpx |

URL = `{AI_PROXY_BASE_URL rstrip '/'}/chat/completions`. Header: `Content-Type: application/json`, `Authorization: Bearer {key}`.

```ts
type ChatCompletionBody = {
  model: string;
  messages: [{ role: 'system'; content: string }, { role: 'user'; content: string }];
  temperature: number;   // caller quyết định; default hàm = 0.2
};

declare function chatCompletion(args: {
  systemPrompt: string; userContent: string; temperature?: number;
}): Promise<[responseText: string, modelUsed: string]>;
```

Xử lý lỗi → tất cả gói thành `AIProxyError` (endpoint map → **502**):

| Loại | Message |
|---|---|
| timeout | `AI proxy timeout sau {timeout}s: {ExceptionType}` |
| connect error | `Không thể kết nối đến AI proxy: {ExceptionType}` |
| HTTP status error | `AI proxy trả về HTTP {status}` — **cố ý KHÔNG log body** (body có thể echo API key) |
| HTTP error khác | `Lỗi HTTP khi gọi AI proxy: {ExceptionType}` |
| thiếu `choices[0].message.content` | `AI proxy trả về response không đúng format (thiếu choices[0].message.content)` |

Trả `[data.choices[0].message.content, data.model ?? AI_PROXY_MODEL]`. **Không retry ở tầng client** — retry nằm ở tầng generator (§28.2). Log INFO chỉ chứa model, url, độ dài prompt (không nội dung, không key).

### 28.1 Parse JSON từ LLM (`_parse_json`) — dùng ở mọi generator

```ts
const FENCE = /^```(?:json)?\s*|\s*```$/gm;   // multiline

function parseJson(text: string): unknown {
  const cleaned = text.replace(FENCE, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const i = cleaned.indexOf('{'), j = cleaned.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) return JSON.parse(cleaned.slice(i, j + 1));
    throw; // vẫn là lỗi JSON
  }
}
```

Tức là: bóc code fence → thử parse → nếu fail thì **cắt từ `{` đầu tiên đến `}` cuối cùng** và parse lại → vẫn fail thì throw.

### 28.2 Vòng lặp retry + validate (pattern chung)

Áp dụng cho `ai/market_analysis/generator.py` (daily/midday/premarket), `ai/portfolio_manager/generator.py`, `bctc_dashboard/narrative.py`:

1. Vòng `for attempt in 0..maxRetries` (default `maxRetries = 3`, tức tối đa **4 lần gọi**).
2. Từ attempt ≥ 1, **append vào user prompt**: `"\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n"` + danh sách `- {error}`.
3. `chatCompletion(...)` với `temperature` riêng theo pipeline: daily/midday `0.3`, premarket `0.5`, portfolio `LLM_TEMPERATURE` (config module), BCTC narrative theo tham số hàm.
4. `parseJson` fail → `lastErrors = ["Output không phải JSON hợp lệ"]` (portfolio dùng `"STRUCT: output không phải JSON hợp lệ"`), log WARNING, **continue** sang attempt kế.
5. Parse OK → điền default (`session_type`, `session_date`, `id`, `session_type_display`, `meta.model_used`, `meta.data_completeness`, `meta.memory_loaded`) → chạy validator riêng của pipeline.
6. Validator trả `[]` → break.

Sau vòng lặp:
- `valid = lastErrors.length === 0 && output !== null`.
- `blocking = hard_errors(lastErrors)` — chỉ lỗi **blocking** mới chặn publish; các rule "cosmetic" (BUG15/16/17/18) **không** được phép làm bài viết offline.
- `publishable = output !== null && blocking.length === 0`. Khi publish best-effort với lỗi cosmetic: ghi `meta.validation_warnings = lastErrors` và log INFO.
- Persist chỉ khi `db != null && publishable`; lỗi persist → log ERROR + `db.rollback()`, `persisted = false`.

**Fail-closed đặc biệt của BCTC narrative:** nếu sau hết retry mà `output === null` → throw `AIProxyError("AI không trả về JSON hợp lệ cho narrative BCTC sau {n} lần thử")`. Nếu còn lỗi bắt đầu bằng `"Cấm tên mô hình học thuật"` hoặc `"Cấm khuyến nghị"` → **throw** `AIProxyError("narrative BCTC vi phạm quy tắc bắt buộc sau {n} lần thử: {blocking}")` — tuyệt đối không để đến tay user. Lỗi cấu trúc thuần → trả best-effort + log WARNING.

### 28.3 Cache kết quả AI

Key Redis (`analysis_service.py`):
- `iqx:ai:analysis:dashboard:{language}`
- `iqx:ai:analysis:industry:{icb_code}:{language}`
- `iqx:ai:analysis:insight:{symbol}:{language}`

TTL **không** dùng `REDIS_TTL_AI_ANALYSIS_SECONDS` mà tính động:
- `analysis_type === 'bctc'` → `7 * 24 * 3600` (1 tuần, vì BCTC chỉ đổi theo quý/năm).
- Còn lại → số giây tới **15:00 giờ Việt Nam** (`Asia/Ho_Chi_Minh`); đã qua 15:00 → 15:00 ngày kế; **tối thiểu 3600 giây**.

Lỗi đọc/ghi cache đều bị nuốt (log WARNING/DEBUG), không ảnh hưởng luồng chính.

---

## 29. Bảng biến môi trường liên quan tích hợp ngoài

| Env | Default | Provider | Bắt buộc để tính năng hoạt động |
|---|---|---|---|
| `SEPAY_MERCHANT_ID` | `""` | SePay | ✅ checkout |
| `SEPAY_SECRET_KEY` | `""` | SePay | ✅ signature + IPN auth |
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` | SePay | đổi khi go-live |
| `APP_PUBLIC_URL` | `http://localhost:3000` | SePay, Telegram, Resend | ✅ |
| `RESEND_API_KEY` | `""` | Resend | ✅ gửi email |
| `EMAIL_ENABLED` | `false` | Resend | ✅ (false = chỉ log) |
| `EMAIL_FROM` | `IQX <no-reply@iqx.vn>` | Resend | domain phải verified |
| `EMAIL_LINK_BASE_URL` | `""` | Resend | fallback `APP_PUBLIC_URL` |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | `48` | Resend | |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `2` | Resend | |
| `AI_PROXY_BASE_URL` | `""` | AI proxy | ✅ |
| `AI_PROXY_MODEL` | `deepseek-v4-flash` | AI proxy | |
| `AI_PROXY_API_KEY` | `""` | AI proxy | ✅ |
| `AI_PROXY_TIMEOUT_SECONDS` | `120.0` | AI proxy | |
| `GOOGLE_SHEETS_API_KEY` | `""` | Google Sheets | ✅ 3 endpoint rates |
| `TELEGRAM_BOT_TOKEN` | `""` | Telegram | ✅ |
| `TELEGRAM_BOT_USERNAME` | `""` | Telegram | ✅ deep-link |
| `TELEGRAM_WEBHOOK_SECRET` | `""` | Telegram | ✅ webhook |
| `ALERTS_ENABLED` | `false` | Telegram | bật job scan |
| `ALERT_SCAN_INTERVAL_MINUTES` | `10` | Telegram | |
| `DNSE_TRANSPORT` | `auto` | DNSE | `auto\|openapi\|mqtt` |
| `DNSE_USERNAME` / `DNSE_PASSWORD` | `""` | DNSE | ✅ cho MQTT |
| `DNSE_API_KEY` / `DNSE_API_SECRET` | `""` | DNSE | ✅ cho OpenAPI |
| `DNSE_OPENAPI_WS_URL` | `wss://ws-openapi.dnse.com.vn/v1/stream` | DNSE | |
| `DNSE_AUTH_URL` | `https://services.entrade.com.vn/dnse-user-service/api/auth` | DNSE | |
| `DNSE_ME_URL` | `https://services.entrade.com.vn/dnse-user-service/api/me` | DNSE | |
| `DNSE_MQTT_HOST` / `PORT` / `WS_PATH` | `datafeed-lts.dnse.com.vn` / `443` / `/wss` | DNSE | |
| `REALTIME_ENABLED` | `false` | DNSE | master switch |
| `REALTIME_TOKEN_REFRESH_HOURS` | `7` | DNSE | |
| `REALTIME_FALLBACK_POLL_SECONDS` | `2.0` | DNSE→VCI | degraded mode |
| `REALTIME_MAX_SYMBOLS` | `200` | DNSE | |
| `REALTIME_WS_MAX_SYMBOLS_PER_CONN` | `100` | DNSE | |
| `SIMPLIZE_LOGO_BASE_URL` | `https://cdn.simplize.vn/simplizevn/logo` | Simplize CDN | seed symbol |
| `INTL_DATA_ENABLED` | `false` | Yahoo + Binance | job 3-wave |
| `REDIS_ENABLED` | `false` | mọi provider | tắt = không cache endpoint, MSN apikey không cache |
| `MARKET_DATA_CACHE_MAX_SIZE` | `1000` | in-proc cache | |
| `MARKET_DATA_TIMEOUT_SECONDS` | `15.0` | — | **khai báo nhưng KHÔNG dùng** |
| `MARKET_DATA_CACHE_ENABLED` / `..._TTL_*` | true / 3600 / 10 / 300 | — | **khai báo nhưng KHÔNG dùng** |

Vietcap (mọi module), VNDirect, KBS, MBK, Fmarket, Simplize API, SJC, VCB, Binance, Yahoo, MSN, RSS **không cần env nào** — đều là API công khai không auth.

---

## 30. Bảng tổng hợp

| Provider | Env cần | Endpoint nội bộ dùng nó | Fallback khi lỗi | Rủi ro chính |
|---|---|---|---|---|
| **Vietcap Trading** | — | `/reference/symbols`, `/reference/groups/{g}/symbols`, `/quotes/{s}/ohlcv` (fallback), `/quotes/{s}/intraday`, `/quotes/{s}/price-depth`, `/trading/price-board`, `/events/calendar`, `/overview/*` | Chỉ `reference.symbols` có fallback thật (VND). Còn lại → **502** | Không auth → có thể bị chặn theo UA/Referer; response đổi shape lặng lẽ; `accumulatedValue` đơn vị triệu VND dễ sai ×1e6 |
| **Vietcap IQ Insight** | — | `/trading/{s}/{history,summary,foreign-trade,supply-demand,insider-deals,proprietary}`, `/fundamentals/{s}/*`, `/company/{s}/{details,price-chart}`, `/sectors/*`, `/screening/*`, `/overview/{breadth,stock-strength,proprietary/top,maintenance}`, `/reference/{search,event-codes,industries}` | Không có → ShapeError **502**, UpstreamError **503** | Bọc `{successful}` — module sector/overview kiểm tra, module screening/vietcap.py **không**; FieldCode BCTC (`isa*/bsa*/cfa*`) khác nhau giữa ngân hàng & phi ngân hàng |
| **Vietcap AI News** | — | `/news/ai`, `/news/ai/detail/{slug}`, `/news/ai/audio/{id}`, `/news/ai/catalogs`, `/news/ai/tickers/{sym}` | `catalogs`/`tickers` → **partial + warnings, HTTP 200**; còn lại 404/502/503 | `page_size` max 99, `update_from` clamp 30 ngày — vượt là upstream từ chối |
| **VNDIRECT** | — | `/quotes/{s}/ohlcv` (chính), `/reference/symbols` (fallback), `/insights/ranking/{kind}` | OHLCV → VCI; ranking không có → 502 | Query DSL `q=…~…` rất dễ vỡ; không có field `value` trong OHLCV |
| **KBS** | — | `/company/{s}/{overview,shareholders,officers,subsidiaries,news}` | Không (registry ghi VCI nhưng endpoint không đăng ký handler) → 502; `news` cho phép rỗng | Key viết tắt không tài liệu; `CC`/`VL` làm tròn nên bị drop — dùng nhầm sẽ sai vốn điều lệ |
| **MBK** | — | `/macro/economy/{indicator}` | `allowEmpty=true` → rỗng vẫn 200 | Body form-encoded; luật xoá tiền tố khi snake_case có thể gây trùng key |
| **Fmarket** | — | `/funds`, `/funds/{id}`, `/funds/{id}/nav` | Không → 502; HTTP 400 → **404** | URL NAV history là `/res/product/get-nav-history` (số ít) — sai một chữ là 404 |
| **Simplize API** | — | `/macro/commodities`, `/macro/commodities/{code}`, fallback `macro.gold` | Là fallback cho SJC | Fallback vàng trả **vàng thế giới (USD/oz)**, khác đơn vị SJC (VND/lượng) |
| **Simplize CDN** | `SIMPLIZE_LOGO_BASE_URL` | script `seed_symbols` | HEAD fail → logo Vietcap → `null` | Chỉ chạy khi seed; 404 logo là bình thường |
| **SJC** | — | `/macro/gold` | → SIMPLIZE (vàng thế giới) | Body form-encoded, ngày `DD/MM/YYYY` đã URL-encode |
| **Vietcombank** | — | `/macro/fx` | Registry ghi MBK/ASEAN nhưng **không có handler** → 502 | Thiếu `date` → 404; số có dấu phẩy phân cách nghìn |
| **Google Sheets** | `GOOGLE_SHEETS_API_KEY` | `/rates/interbank`, `/rates/bond-yields`, `/rates/fx-table`, AI patterns/forecast | Không có → lỗi lan lên | Spreadsheet ID hardcode; đổi tên header sheet (`CHÊNH LỆNH` vs `CHÊNH LỆCH`) là vỡ parse; `parseNumber` xoá mọi dấu `.` |
| **Binance** | — | `/global/crypto/{s}/{ohlc,ticker,depth}`, job snapshot (BTC/ETH) | `crypto_ohlc` → MSN; ticker/depth không có → 502 | Rotate 6 host + retry 5 lần cho 429/5xx; `_host_idx` là state toàn cục; ticker truy cập key bắt buộc → KeyError nếu upstream đổi |
| **Yahoo Finance** | — | job snapshot 3-wave → `/global/snapshot` | Symbol fail → **stale-copy row cũ trong `market_data_snapshot`** (`stale=true`); không có row cũ → `missing[]` | **429 khi burst** và `fetchJson` không retry 4xx; chỉ có semaphore 5 + jitter + 1 retry-pass 2s |
| **MSN Finance** | — | `/global/world-index`, `/global/forex`, fallback `crypto_ohlc` | `allowEmpty=true` → rỗng trả 200 | apikey phải resolve động (cache Redis 6h); từng gặp **404**; sentinel `-99999901.0` phải lọc |
| **RSS** | — | `/news/latest` | Feed lỗi → skip âm thầm; `allowEmpty=true` | Duyệt tuần tự 11 feed → chậm; XML đổi cấu trúc |
| **DNSE** | `DNSE_*`, `REALTIME_ENABLED` | WebSocket `/api/v1/market-data/ws` | Mất broker → **degraded mode: poll VCI price-board mỗi 2s**, publish tick `degraded:true` | Wildcard MQTT bị chặn; connection bị force-close sau 8h; giá cổ phiếu ×1000, phái sinh/chỉ số **không** ×1000 |
| **SePay** | `SEPAY_*`, `APP_PUBLIC_URL` | `POST /premium/checkout`, `POST /premium/sepay/ipn` | IPN không đến → admin `mark-paid` (`grant_type='admin_confirmed'`) hoặc `reconcile` từ `sepay_ipn_logs` | Signature phải đúng thứ tự field + dấu phẩy + base64; secret dùng chung cho HMAC và IPN header; idempotency dựa hoàn toàn vào UPDATE `pending→paid` |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `_USERNAME`, `_WEBHOOK_SECRET` | `POST /telegram/webhook/{secret}`, `/alerts/telegram*`, job alert scan | Gửi lỗi → ghi `delivery_error` (≤300 ký tự), không throw; setWebhook lỗi → chỉ WARNING | Webhook secret nằm trong URL path; check header chỉ khi header có mặt |
| **Resend** | `RESEND_API_KEY`, `EMAIL_ENABLED`, `EMAIL_FROM` | verify-email, forgot/reset-password | Tắt hoặc lỗi → trả `false`, **luồng gọi vẫn tiếp tục** | Email "gửi rồi" mà thực ra chỉ log nếu `EMAIL_ENABLED=false`; domain chưa verify → 4xx |
| **AI proxy (DeepSeek)** | `AI_PROXY_BASE_URL`, `_API_KEY`, `_MODEL`, `_TIMEOUT_SECONDS` | `/ai/*`, `/market-analysis/*`, `/portfolio-manager/*`, `/ai/bctc-dashboard/{sym}` | Retry 3 lần feed lỗi validate lại prompt; cosmetic-error vẫn publish; BCTC narrative **fail-closed** khi vi phạm rule cấm | LLM trả sai JSON → cứu bằng cắt `{…}`; timeout 120s × 4 lần = tối đa ~8 phút; không log body để tránh leak key |

---

## 31. Checklist khi port sang TypeScript

1. **Một client HTTP dùng chung** với đúng timeout 15s, 3 lần thử, backoff `0.5·2^(n-1)` (+jitter cho lỗi mạng), **không retry 4xx (kể cả 429)**.
2. Header per-source (Referer/Origin) + UA random — thiếu là nhiều upstream Vietcap/KBS trả 403.
3. **Đơn vị:** VCI `accumulatedValue` là **triệu VND** (×1e6 ở price-board; giữ nguyên `value_million_vnd` ở overview); DNSE giá cổ phiếu **nghìn đồng** (×1000), chỉ số/phái sinh **không** nhân; OpenAPI `grossTradeAmount` **tỷ đồng** (×1e9).
4. Giữ đúng `toIntAmount` (Decimal, truncate + WARNING) vs `toFloatRatio` — đảo hai hàm này là sai kiểu hàng loạt field.
5. `camelToSnake` phải là **đúng 2 bước regex** như §5, vì nó tạo ra tên field mà frontend đang dùng.
6. `toKbsShape` + `enrichRatioRecords` + `filterRatioPeriod`: port 1:1, kể cả fallback Q4→kỳ năm và công thức BVPS.
7. SePay signature: thứ tự `ALLOWED_FIELDS`, join `,`, HMAC-SHA256 → **base64**.
8. IPN: mọi nhánh từ chối vẫn trả **200** (trừ 401 secret sai, 400 JSON/payload sai); idempotency = UPDATE có điều kiện.
9. Fallback dữ liệu: chỉ 6 registry key có chain thật; các endpoint một-nguồn phải trả 502 khi nguồn chết (đừng "tốt bụng" thêm fallback mới — sẽ đổi contract `meta.fallback_used`).
10. Yahoo/Binance/MSN có logic retry & cache **riêng**, không dùng chung `fetchJson` — port đúng từng lớp.
