# Endpoint — Dữ liệu thị trường: vĩ mô, quốc tế, quỹ, sự kiện, Sheets

Chương này đặc tả **đủ 18 endpoint** thuộc 5 nhóm con của router `/api/v1/market-data`: **vĩ mô** (vàng SJC, tỷ giá Vietcombank, hàng hoá Simplize, chỉ số kinh tế Maybank Trade), **quốc tế** (chỉ số thế giới & forex qua MSN, crypto qua Binance, snapshot quốc tế đọc từ DB), **quỹ mở** (Fmarket), **lịch sự kiện doanh nghiệp** (Vietcap IQ Insight) và **Google Sheets** (3 bảng lãi suất/tỷ giá team tự nhập).

Cả 18 endpoint đều là **GET công khai** — không guard, không `Authorization` (header này nếu gửi sẽ bị bỏ qua). 17/18 trả envelope `MarketDataResponse`; riêng `GET /global/snapshot` dùng envelope riêng `_SnapshotResponse`. Đây là nhóm phụ thuộc provider ngoài nặng nhất trong backend, nên phần **Fallback / suy giảm** của mỗi mục là phần quan trọng nhất phải port đúng: có endpoint trả `200 data: []`, có endpoint trả `502`, có endpoint trả `404`, và có **một endpoint đang lỗi `500` trong production** (`/macro/fx` khi không truyền `?source=VCB`).

Nguồn sự thật: bản cắt OpenAPI của nhóm (18 operation) + source Python `app/api/v1/endpoints/market_data.py`, `app/api/v1/endpoints/market_global.py`, `app/services/market_data/{orchestrator,fallback,registry,http}.py`, `app/services/market_data/{intl_snapshot,intl_symbols}.py`, `app/services/market_data/sources/{sjc,vcb,spl,mbk,fmarket,binance,msn,yahoo,google_sheets,vietcap}.py`, `app/models/market_data_snapshot.py`, `app/services/jobs/intl_snapshot_job.py`, `app/services/cache/{decorator,redis_cache}.py`, và các test `tests/test_market_data.py`, `tests/test_market_data_global.py`, `tests/test_intl_snapshot_endpoint.py`, `tests/test_intl_snapshot_service.py`, `tests/test_yahoo_source.py`.

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Nguồn | Cache TTL | Mục đích |
|---|---|---|---|---|---|---|
| 1 | `GET` | `/api/v1/market-data/macro/gold` | Công khai | SJC → SIMPLIZE | 300s | Giá vàng SJC theo ngày (mua/bán từng loại, từng chi nhánh) |
| 2 | `GET` | `/api/v1/market-data/macro/fx` | Công khai | VCB | 300s | Bảng tỷ giá Vietcombank (mua tiền mặt / mua CK / bán) |
| 3 | `GET` | `/api/v1/market-data/macro/commodities` | Công khai | bảng tĩnh | 3600s | Danh mục **18** mã hàng hoá hợp lệ |
| 4 | `GET` | `/api/v1/market-data/macro/commodities/{code}` | Công khai | SPL (Simplize) | 300s | Lịch sử OHLCV một mã hàng hoá |
| 5 | `GET` | `/api/v1/market-data/macro/economy/{indicator}` | Công khai | MBK (Maybank Trade) | 900s | Chuỗi số liệu kinh tế vĩ mô VN (**10** indicator) |
| 6 | `GET` | `/api/v1/market-data/global/snapshot` | Công khai | **DB** `market_data_snapshot` | không cache | Snapshot 43 mã quốc tế của ngày mới nhất trong bảng |
| 7 | `GET` | `/api/v1/market-data/global/world-index` | Công khai | MSN | 300s | Lịch sử OHLCV chỉ số chứng khoán thế giới |
| 8 | `GET` | `/api/v1/market-data/global/forex` | Công khai | MSN | 300s | Lịch sử OHLC cặp tiền tệ quốc tế (volume luôn `null`) |
| 9 | `GET` | `/api/v1/market-data/global/crypto/{symbol}/ticker` | Công khai | BINANCE | 15s | Thống kê 24h một mã crypto |
| 10 | `GET` | `/api/v1/market-data/global/crypto/{symbol}/ohlc` | Công khai | BINANCE → MSN | 300s | Nến OHLCV crypto (USDT; fallback MSN trả **VND**) |
| 11 | `GET` | `/api/v1/market-data/global/crypto/{symbol}/depth` | Công khai | BINANCE | 15s | Order book bids/asks |
| 12 | `GET` | `/api/v1/market-data/funds` | Công khai | FMARKET | 900s | Danh sách quỹ mở + hiệu suất NAV 1M/3M/6M/12M/36M |
| 13 | `GET` | `/api/v1/market-data/funds/{fund_id}` | Công khai | FMARKET | 900s | Top holdings, phân bổ ngành, phân bổ loại tài sản |
| 14 | `GET` | `/api/v1/market-data/funds/{fund_id}/nav` | Công khai | FMARKET | 900s | Toàn bộ lịch sử NAV/đơn vị quỹ |
| 15 | `GET` | `/api/v1/market-data/events/calendar` | Công khai | VCI IQ Insight | 900s | Lịch sự kiện doanh nghiệp (cổ tức, ĐHCĐ, nội bộ, khác) |
| 16 | `GET` | `/api/v1/market-data/sheets/vnd` | Công khai | GOOGLE_SHEETS | 600s | Lãi suất VND liên ngân hàng theo kỳ hạn |
| 17 | `GET` | `/api/v1/market-data/sheets/tpcp` | Công khai | GOOGLE_SHEETS | 600s | Lợi suất trái phiếu chính phủ theo kỳ hạn |
| 18 | `GET` | `/api/v1/market-data/sheets/tygia` | Công khai | GOOGLE_SHEETS | 600s | Bảng tỷ giá ngoại tệ tham chiếu |

**Rate limit chung**: cả 18 endpoint chỉ chịu `default_limits` toàn app = `RATE_LIMIT_DEFAULT` = **`60/minute` per IP** (slowapi `Limiter(key_func=get_remote_address, storage_uri="memory://")`, gắn qua `SlowAPIMiddleware`). Biến `RATE_LIMIT_MARKET_DATA=120/minute` **có trong config nhưng KHÔNG áp cho endpoint nào trong chương này** — nó chỉ được gắn bằng `@limiter.limit(...)` lên `POST /trading/price-board`. Đừng "sửa cho hợp lý" khi port. Rate limit bị **tắt hoàn toàn** khi `APP_ENV in ("testing","test")`.

---

## Kiểu dữ liệu dùng chung

#### Envelope chuẩn

17/18 endpoint trả `MarketDataResponse`. Trong OpenAPI, `data` là schema **rỗng** (`{"title": "Data"}`) vì handler trả dict/list thô — hình dạng thật của `data` suy ra từ hàm normalize của từng source và được khai báo cụ thể ở từng mục bên dưới.

~~~ts
/** Metadata gắn vào MỌI response dữ liệu thị trường. */
export interface MarketDataMeta {
  /** Nguồn đã phục vụ response: 'SJC' | 'SIMPLIZE' | 'VCB' | 'SPL' | 'MBK'
   *  | 'FMARKET' | 'BINANCE' | 'MSN' | 'VCI' | 'GOOGLE_SHEETS'. */
  source: string;
  /** 1 = nguồn chính, 2+ = đã dùng dự phòng. Default 1. */
  source_priority: number;
  /** true khi source_priority > 1. Default false. */
  fallback_used: boolean;
  /** ISO-8601 datetime UTC thời điểm FETCH (không phải thời điểm dữ liệu). */
  as_of: string;
  /** URL upstream đã gọi. Default "". Với /macro/commodities là "static_mapping". */
  raw_endpoint: string;
}

export interface MarketDataResponse<T> {
  data: T;
  meta: MarketDataMeta;
}
~~~

#### Lỗi chuẩn

~~~ts
/** 422 do FastAPI/Pydantic tự sinh (sai kiểu, ngoài khoảng ge/le). */
export interface HttpValidationError {
  detail: Array<{
    loc: Array<string | number>;
    msg: string;
    type: string;
    input?: unknown;
    ctx?: Record<string, unknown>;
  }>;
}

/** 422 / 404 / 502 do handler chủ động raise HTTPException → detail là chuỗi. */
export interface MdErrorResponse { detail: string; }
~~~

> **Trap**: cùng status `422` có **hai hình dạng `detail`** — mảng object (Pydantic, khi sai kiểu/ngoài `ge/le`) và chuỗi (HTTPException, khi handler tự kiểm allowlist). Client phải xử lý cả hai.

#### Union literal của các allowlist

~~~ts
/** 10 indicator hợp lệ của /macro/economy/{indicator} (mbk._TYPE_ID). */
export type MdMacroIndicator =
  | 'gdp' | 'cpi' | 'industrial_production' | 'export_import' | 'retail'
  | 'fdi' | 'money_supply' | 'exchange_rate' | 'population_labor' | 'interest_rate';

/** 4 period hợp lệ (mbk._REPORT_PERIOD). */
export type MdMacroPeriod = 'day' | 'month' | 'quarter' | 'year';

/** 18 mã hàng hoá hợp lệ (spl.COMMODITY_MAP) — ĐỦ danh sách. */
export type MdCommodityCode =
  | 'gold_vn_buy' | 'gold_vn_sell' | 'gold_global'
  | 'oil_crude' | 'gas_natural' | 'gas_ron92' | 'gas_ron95' | 'oil_do'
  | 'coke' | 'steel_d10' | 'iron_ore' | 'steel_hrc' | 'fertilizer_ure'
  | 'soybean' | 'corn' | 'sugar' | 'pork_north_vn' | 'pork_china';

/** Loại quỹ cho ?fund_type= (fmarket.fund_type_map). '' = không lọc. */
export type MdFundType = '' | 'BALANCED' | 'BOND' | 'STOCK';

/** Loại sự kiện cho ?event_type= (vietcap._EVENT_TYPE_MAP). */
export type MdEventType = 'dividend' | 'insider' | 'agm' | 'others';

/** 8 asset_category có trong bảng market_data_snapshot (intl_symbols.INTL_SYMBOLS)
 *  + 'other' do intl_snapshot gán cho symbol lạ. */
export type MdIntlAssetCategory =
  | 'us_index' | 'us_futures' | 'asia_index' | 'fx'
  | 'commodity' | 'bond' | 'crypto' | 'etf' | 'other';

/** 33 symbol MSN hợp lệ — dùng CHUNG cho /global/world-index và /global/forex
 *  (msn.MSN_SECID; endpoint KHÔNG chặn dùng mã crypto cho world-index). */
export type MdMsnSymbol =
  // chỉ số (14)
  | 'INX' | 'DJI' | 'USA30' | 'COMP' | 'RUT' | 'NYA' | 'UKX' | 'DAX'
  | 'PX1' | 'N225' | '000001' | 'HSI' | 'SENSEX' | 'VNI'
  // crypto (10)
  | 'BTC' | 'BTCUSDT' | 'ETH' | 'BNB' | 'XRP' | 'ADA' | 'SOL' | 'DOGE'
  | 'USDT' | 'USDC'
  // forex (9)
  | 'USDVND' | 'JPYVND' | 'EURVND' | 'EURUSD' | 'USDJPY'
  | 'GBPUSD' | 'AUDUSD' | 'XAUUSD' | 'XAGUSD';

/** Khung nến crypto ghi trong OpenAPI description (Binance nhận thêm giá trị khác;
 *  backend KHÔNG validate — xem mục /global/crypto/{symbol}/ohlc). */
export type MdCryptoInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
~~~

#### Ba kiểu nến — KHÔNG gộp

~~~ts
/** (A) Nến Binance + MSN. `time` là 'YYYY-MM-DD' quy từ `timestamp` theo UTC. */
export interface MdIntlCandle {
  time: string;        // "2026-08-17"
  timestamp: number;   // epoch GIÂY (không phải ms)
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Binance: luôn number. MSN forex: luôn null. MSN index: number | null. */
  volume: number | null;
}

/** (B) Nến Simplize (/macro/commodities/{code} và fallback của /macro/gold).
 *  KHÁC BIỆT: `time` là SỐ epoch giây thô, KHÔNG có field `timestamp`. */
export interface MdCommodityCandle {
  time: number;        // 1786924800
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
~~~

#### Kiểu riêng theo domain

~~~ts
/** Một dòng giá vàng SJC (sjc.fetch_gold). */
export interface MdSjcGoldRow {
  /** YYYY-MM-DD — LẤY TỪ THAM SỐ REQUEST, không phải từ SJC. */
  date: string;
  name: string | null;        // SJC TypeName, vd "Vàng SJC 1L, 10L, 1KG"
  branch: string | null;      // SJC BranchName, vd "Hồ Chí Minh"
  buy_price: number | null;   // SJC BuyValue  — VND tuyệt đối, KHÔNG scale
  sell_price: number | null;  // SJC SellValue — VND tuyệt đối, KHÔNG scale
}

/** Một dòng tỷ giá Vietcombank (vcb.fetch_fx). */
export interface MdVcbFxRow {
  currency_code: string | null;   // "USD"
  currency_name: string | null;   // "US DOLLAR"
  buy_cash: number | null;        // VCB `cash`     — mua tiền mặt (VND/1 đơn vị)
  buy_transfer: number | null;    // VCB `transfer` — mua chuyển khoản
  sell: number | null;            // VCB `sell`     — bán (KHÔNG có sell_cash riêng)
  /** 10 ký tự đầu của VCB `Date`; rỗng thì fallback về tham số `date`. */
  date: string;
}

/** Một mục danh mục hàng hoá (spl.list_commodities). */
export interface MdCommodityCatalogItem {
  code: MdCommodityCode;   // "gold_global"
  ticker: string;          // "GC=F" — ticker nội bộ Simplize
  name: string;            // "Vàng thế giới" (tiếng Việt, hard-code trong source)
}

/** Một dòng macro MBK — key ĐỘNG, sinh bằng camel→snake + xoá tiền tố.
 *  Chỉ các key dưới đây đã được quan sát trong test; upstream có thể trả thêm. */
export interface MdMacroRow {
  report_time?: string;          // "Tháng 8/2025" hoặc "2026-06-30"
  year?: number;                 // từ TermYear/FromYear (XEM TRAP trùng key)
  name?: string;                 // từ NormName, vd "Chỉ số giá tiêu dùng"
  group_name?: string;           // từ GroupName
  value?: number | null;         // từ NormValue
  unit?: string | null;          // đơn vị do UPSTREAM trả, vd "%"
  type_id?: number;              // từ NormTypeID
  report_data_id?: number;
  day?: string;                  // "/Date(1719705600000)/" — định dạng .NET thô
  [key: string]: unknown;        // BẮT BUỘC index signature: schema không cố định
}

/** Một quỹ trong danh sách (fmarket.fetch_fund_listing). */
export interface MdFundListItem {
  fund_id: number | null;        // id nội bộ Fmarket — dùng cho 2 endpoint chi tiết
  short_name: string;            // "VESAF"
  name: string;                  // tên đầy đủ
  fund_type: string;             // dataFundAssetType.name: "STOCK"|"BOND"|"BALANCED"
  fund_owner: string;            // owner.name, vd "SSIAM"
  management_fee: number | null; // CHƯA XÁC ĐỊNH đơn vị — xem sources/fmarket.py
  inception_date: string | null; // firstIssueAt, chuỗi thô của Fmarket
  nav: number | null;            // NAV/đơn vị quỹ hiện tại (VND)
  code: string;                  // mã giao dịch, vd "VESAF"
  nav_change_1m: number | null;  // % tăng trưởng NAV — số thô (2.5 = +2.5%)
  nav_change_3m: number | null;
  nav_change_6m: number | null;
  nav_change_12m: number | null;
  nav_change_36m: number | null;
  nav_update_at: string | null;  // productNavChange.updateAt, chuỗi thô
}

/** Chi tiết quỹ (fmarket.fetch_fund_details). */
export interface MdFundDetails {
  top_holdings: Array<{
    stock_code: string;                 // "FPT"  (với trái phiếu: mã trái phiếu)
    industry: string;
    net_asset_percent: number | null;   // % NAV
    type: string;                       // "STOCK" | "BOND" | ...
  }>;
  industry_holdings: Array<{
    industry: string;
    /** Ánh xạ từ upstream `assetPercent` (KHÔNG phải netAssetPercent). */
    net_asset_percent: number | null;
  }>;
  asset_holdings: Array<{
    asset_type: string;                 // assetType.name, vd "Stock" | "Bond"
    asset_percent: number | null;
  }>;
}

/** Một điểm NAV (fmarket.fetch_fund_nav_history). */
export interface MdFundNavPoint {
  date: string | null;          // navDate, chuỗi thô Fmarket
  nav_per_unit: number | null;  // VND / đơn vị quỹ
}

/** Thống kê 24h Binance (binance.fetch_ticker). */
export interface MdCryptoTicker {
  symbol: string | null;      // "BTCUSDT"
  last_price: number;
  open_price: number;
  high_price: number;
  low_price: number;
  bid_price: number;
  ask_price: number;
  price_change: number;       // tuyệt đối, quote currency
  change_pct: number;         // % thô (2.15 = +2.15%)
  volume: number;             // khối lượng base asset (BTC)
  quote_volume: number;       // khối lượng quote asset (USDT)
  open_time: number | null;   // epoch MILLIGIÂY
  close_time: number | null;  // epoch MILLIGIÂY
  count: number | null;       // số lệnh khớp trong 24h
}

/** Order book Binance (binance.fetch_depth). */
export interface MdCryptoDepthLevel { price: number; qty: number; }
export interface MdCryptoDepth {
  last_update_id: number | null;
  bids: MdCryptoDepthLevel[];   // giữ nguyên thứ tự Binance (giá giảm dần)
  asks: MdCryptoDepthLevel[];   // giữ nguyên thứ tự Binance (giá tăng dần)
}

/** Một dòng snapshot quốc tế (_SnapshotRow trong market_global.py). */
export interface MdIntlSnapshotRow {
  snapshot_date: string;                  // "2026-08-17"
  asset_category: MdIntlAssetCategory;
  symbol: string;                         // ticker Yahoo: "^GSPC", "VND=X", "GC=F"
  name: string;                           // "S&P 500"
  last_price: number;
  previous_close: number;
  change_value: number;
  /** % THÔ: 0.4041 nghĩa là +0.4041%. KHÔNG nhân 100 nữa. */
  change_percent: number;
  day_high: number | null;
  day_low: number | null;
  volume: number | null;                  // BIGINT
  currency: string | null;                // "USD" | "VND" | ...
  market_state: string | null;            // "REGULAR" | "CLOSED" | "PRE" | "POST"
  market_time: string | null;             // ISO-8601 có tz, hoặc null
  source: string;                         // default DB = "yahoo"
  /** true = dòng COPY từ phiên trước vì fetch hôm nay thất bại. */
  stale: boolean;
  /** ISO-8601; chuỗi RỖNG "" nếu cột NULL (KHÔNG phải null). */
  fetched_at: string;
}

export interface MdIntlSnapshotMeta {
  snapshot_date: string | null;   // null khi data rỗng
  stale_count: number;            // số dòng stale=true trong ĐÚNG tập đã lọc
}

/** Envelope RIÊNG — KHÔNG có MarketDataMeta. */
export interface MdIntlSnapshotResponse {
  data: MdIntlSnapshotRow[];
  meta: MdIntlSnapshotMeta;
}

/** Dòng Google Sheets kiểu "theo kỳ hạn" (VND / TPCP). */
export interface MdSheetTenorRow {
  tenor: string;                   // nguyên văn ô "KỲ HẠN": "ON", "1W", "1M"…
  today: string;                   // nguyên văn: "4,15%"
  yesterday: string;
  change: string;
  todayNumeric: number | null;
  yesterdayNumeric: number | null;
  changeNumeric: number | null;
}

/** Dòng Google Sheets TYGIA. */
export interface MdSheetFxRow {
  currency: string;                // nguyên văn ô "NGOẠI TỆ": "USD/VND"
  today: string;
  yesterday: string;
  change: string;
  todayNumeric: number | null;
  yesterdayNumeric: number | null;
  changeNumeric: number | null;
}
~~~

> **Chú ý tên field**: 3 endpoint `sheets/*` là nhóm **DUY NHẤT** trong chương dùng `camelCase` (`todayNumeric`, `changeNumeric`), các nhóm còn lại dùng `snake_case`. Lệch chuẩn này có thật trong `google_sheets.normalize_*` — giữ y nguyên để không phá frontend.

---

## Nghiệp vụ nền

#### 1. Registry + fallback (bắt buộc port đúng thứ tự)

Hai lớp điều phối, **hành vi khác nhau**, đừng trộn:

- `fetch_with_fallback(sources, validator=None, allow_empty=False)` — nhận list `(tên, callable)` do handler tự dựng. Mỗi callable trả `(data, raw_endpoint_url)`.
- `fetch_from_registry(key, handlers, override=None, allow_empty=False)` — tra chain trong `registry.REGISTRY[key]`, **dựng TOÀN BỘ chain TRƯỚC khi fetch**, rồi gọi `fetch_with_fallback`.

Vòng lặp fallback (nguyên văn logic):

1. Với mỗi source theo thứ tự, `priority` bắt đầu từ **1**.
2. Gọi callable. Nếu ném exception → log WARNING, ghi nhớ làm `last_exc`, **sang source tiếp theo**.
3. Nếu `allow_empty=False`, chạy validator mặc định: `data is None` → fail; `list`/`dict` **rỗng** → fail (`ValueError("Nguồn {X} trả về dữ liệu rỗng")`) → sang source tiếp theo. Khi `allow_empty=True` **bỏ hẳn validator** (nhưng exception vẫn là fail).
4. Thành công → trả `MarketDataResponse` với `source_priority=priority`, `fallback_used = priority > 1`, `as_of = datetime.now(UTC)`.
5. Hết chain → `raise RuntimeError("Tất cả {n} nguồn dữ liệu thị trường đều thất bại") from last_exc`. Handler bắt `RuntimeError` → `HTTPException(502, str(exc))`.

Chain đăng ký trong `registry.REGISTRY` liên quan chương này:

| Registry key | default | fallback | Handler thực tế đăng ký |
|---|---|---|---|
| `macro.gold` | `SJC` | `SIMPLIZE` | `SJC`, `SIMPLIZE` — khớp |
| `macro.fx` | `VCB` | `MBK`, `ASEAN` | **chỉ `VCB`** → lỗi 500, xem mục 2 |
| `intl.world_index` | `MSN` | — | `MSN` — khớp |
| `intl.forex` | `MSN` | — | `MSN` — khớp |
| `intl.crypto_ohlc` | `BINANCE` | `MSN` | `BINANCE`, `MSN` — khớp |
| `intl.crypto_ticker` | `BINANCE` | — | `BINANCE` — khớp |
| `intl.crypto_depth` | `BINANCE` | — | `BINANCE` — khớp |

`sources_for(key, override)`: nếu `override` (sau `.upper()`) **nằm trong** chain → trả `[override]` (chỉ 1 nguồn); nếu override lạ → **bỏ qua âm thầm**, chạy full chain; key lạ → `KeyError`.

Các endpoint `macro.economy`, `macro.commodities`, `events.calendar`, `fund.*` **không** đi qua registry — chúng gọi `fetch_with_fallback` với chain hard-code 1 nguồn ngay trong handler (dù registry có khai fallback `ASEAN`). Giữ nguyên: registry ở đó là code chết.

#### 2. Lỗi 500 có thật của `/macro/fx`

`fetch_from_registry` dựng chain trước khi fetch:

~~~python
chain = sources_for(key, override)          # macro.fx → ["VCB", "MBK", "ASEAN"]
for name in chain:
    fn = handlers.get(name)
    if fn is None:
        raise ValueError(f"No handler registered for source '{name}' (registry key '{key}')")
~~~

Handler `/macro/fx` chỉ truyền `{"VCB": _vcb}` → khi `override is None`, hàm **luôn** ném `ValueError` **trước khi gọi VCB lần nào**. Endpoint chỉ bắt `except RuntimeError` → `ValueError` lọt ra → FastAPI trả **500**. Chỉ `?source=VCB` mới chạy được. Cách sửa khi viết lại: đổi `macro.fx` thành `SourceChain("VCB")` (đúng thực tế — chưa có connector FX cho MBK/ASEAN), **hoặc** cho orchestrator **skip** source thiếu handler và chỉ ném lỗi khi chain rỗng. **Đừng port nguyên lỗi này**; ghi vào changelog vì là thay đổi hành vi.

#### 3. Cache Redis (`@redis_cached`)

- Khoá: `iqx:{prefix}:{path_đã_strip_"/"}:{md5_12}`, `prefix="api:v1"`. `md5_12` = 12 ký tự đầu MD5 của chuỗi `k1=v1&k2=v2` (query params đã **sort theo key**, **bỏ** param rỗng/`None`). Không có param → hậu tố là `_`.
- Ví dụ: `iqx:api:v1:api/v1/market-data/macro/gold:9f2c1ab34d0e`, `iqx:api:v1:api/v1/market-data/sheets/tygia:_`.
- **Cache HIT** trả `JSONResponse` kèm header `X-Cache: HIT`. Cache MISS **không** có header này.
- Chỉ cache response 2xx. Mặc định **không cache** response có `data` rỗng; chỉ 2 endpoint bật `cache_empty=True`: `/macro/economy/{indicator}` và `/global/crypto/{symbol}/depth`.
- `REDIS_ENABLED=false` → bypass hoàn toàn, mọi request đấm provider.
- **Trap chuẩn hoá path**: `build_cache_key` chỉ uppercase segment mã CK khi segment trước đó nằm trong `{quotes, company, trading, fundamentals, tickers}`. Path crypto (`/global/crypto/btcusdt/ticker`) **không** thuộc nhóm đó → `btcusdt` và `BTCUSDT` cho **hai khoá cache khác nhau** dù response y hệt (handler tự `.upper()`). Vô hại nhưng làm loãng cache.

Giá trị TTL (`app/core/config.py`): `REDIS_DEFAULT_TTL_SECONDS=300`, `REDIS_TTL_REALTIME_SECONDS=15`, `REDIS_TTL_REFERENCE_SECONDS=3600`, `REDIS_TTL_MACRO_SECONDS=900`, `REDIS_TTL_SHEETS_SECONDS=600`.

#### 4. HTTP client dùng chung (`market_data/http.py`)

- `httpx.AsyncClient` chia sẻ toàn app, timeout `15s`, `follow_redirects=True`, `max_connections=100`.
- `fetch_json(..., max_retries=3)`: retry **chỉ** cho `TimeoutException`, `ConnectError` và **5xx** (backoff `0.5 * 2^(n-1)` + jitter ≤0.3s cho timeout).
- **`4xx` KHÔNG BAO GIỜ được retry — kể cả `429`.** Đây là gốc của cả hai bẫy provider ở mục 5.
- Header giả browser: `User-Agent` random từ 4 profile + `Referer`/`Origin` riêng theo source (`SJC`, `VCB`, `MBK`, `FMARKET`, `MSN`, `YAHOO`, …).

#### 5. ⚠ Bẫy provider quan trọng nhất chương: Yahoo `429` và MSN `404`

**Yahoo Finance → `429 Too Many Requests`.** Yahoo **không** được endpoint nào trong chương gọi trực tiếp; nó chỉ chạy trong cron job sinh bảng `market_data_snapshot`. Cách code né:

1. `yahoo.fetch_many(symbols)` chạy song song dưới `asyncio.Semaphore(5)`, mỗi request `sleep(random.uniform(0.1, 0.2))` trước khi bắn.
2. Vì `fetch_json` không retry 4xx, **một** `429` là mất symbol ở pass 1.
3. Sau pass 1, các symbol thiếu được chạy **đúng MỘT pass retry**, mỗi request có `pre_delay = 2.0s` cố định (cộng jitter, vẫn dưới cùng semaphore).
4. Symbol fail cả hai pass → log WARNING và **bị loại khỏi dict trả về** (không ném lỗi). Symbol trả về mà `last_price is None` cũng bị coi là fail.
5. Hệ quả nhìn thấy được ở API: `persist_snapshot_rows` **sao chép dòng của ngày gần nhất trước đó** và đặt `stale = true`; nếu không có lịch sử thì symbol vào danh sách `missing` và **biến mất** khỏi `/global/snapshot`. **Yahoo 429 không bao giờ làm endpoint trả 5xx** — nó biến thành `stale`/thiếu dòng.

**MSN → `404` (và resolver hỏng).** MSN là nguồn duy nhất của `/global/world-index` + `/global/forex`, và là fallback của `/global/crypto/{symbol}/ohlc`. Cách né + suy giảm:

1. Chặn trước bằng allowlist: `msn.resolve_secid(symbol)` — symbol không có SecId → handler trả **422 ngay**, không gọi MSN. Đây là lớp né 404 chính.
2. `apikey` ngắn hạn phải resolve động: `GET https://assets.msn.com/resolver/api/resolve/v3/config/` với `v = YYYYMMDD(now-7h) + ".168"` và `targetScope` là JSON locale `vi-vn`. Kết quả cache Redis khoá **`mkt:msn:apikey`, TTL 21600s (6h)**. Đọc/ghi cache bọc `try/except` → Redis lỗi chỉ mất cache, không lỗi request.
3. Không tìm được apikey trong payload resolver → `ValueError("MSN resolver: apikey not found in response")` → chain hết → **502**.
4. Nếu MSN charts trả `404`/`401`/`403`: `fetch_json` **không retry** (4xx) → callable ném → chain của `intl.world_index`/`intl.forex` **chỉ có MSN** → `RuntimeError` → **502 `Tất cả 1 nguồn dữ liệu thị trường đều thất bại`**. `allow_empty=True` chỉ tha cho trường hợp MSN trả **200 với chuỗi rỗng** (→ `200 data: []`), **không** tha 404.
5. **Lỗ hổng phải sửa khi port**: apikey hỏng vẫn nằm trong Redis 6h và `resolve_apikey` **không tự xoá cache khi request charts thất bại** → endpoint 502 liên tục tới 6h. Khi viết lại: khi charts trả 401/403/404, **xoá `mkt:msn:apikey` và resolve lại đúng 1 lần** trước khi coi là fail.
6. Chuẩn hoá series MSN: bỏ mọi điểm có `open`/`high`/`low` là `null` hoặc **sentinel `-99999901.0`**; timestamp ISO → epoch giây; `volume = null` khi là `currencyPair` hoặc khi volume bằng sentinel.

**Binance** có cơ chế riêng, khoẻ hơn: xoay vòng **6 host** (`api`, `api-gcp`, `api1`…`api4`.binance.com), retry status `{429,500,502,503,504}` tối đa **5 lần**, backoff `min(10, 2 * 2^attempt)` giây (2→4→8→10), đổi host mỗi lần gặp lỗi retryable/timeout. `4xx` khác 429 → **fail nhanh, không retry** (mã sai → 400 từ Binance).

#### 6. Pipeline sinh `market_data_snapshot` (cron, không phải endpoint)

- Bật/tắt bằng env `INTL_DATA_ENABLED` (**default `false`** — nếu không bật thì `/global/snapshot` mãi trả `data: []`).
- 3 wave APScheduler, `day_of_week="mon-fri"`, timezone `Asia/Ho_Chi_Minh`: **wave 1 06:00** (toàn bộ `ALL_SYMBOLS`), **wave 2 07:05** (`^N225`, `^KS11`, `^AXJO` + 6 FX + 11 hàng hoá), **wave 3 08:30** (`^HSI`, `000001.SS`, `399001.SZ`, `VNM`).
- Bỏ chạy nếu ngày hôm đó không phải ngày giao dịch VN (`is_trading_day`) → `{"skipped": "not_trading_day"}`.
- Chống chạy trùng nhiều worker uvicorn bằng `pg_try_advisory_lock(826101733)`; không lấy được → `{"skipped": "locked"}`.
- Universe: 8 category, **43 symbol** (`us_index` 5, `us_futures` 3, `asia_index` 8, `fx` 6, `commodity` 11, `bond` 3, `crypto` 2, `etf` 5). Docstring trong source ghi "45-symbol" — **sai**, đếm thật là 43. `CRITICAL_SYMBOLS = ["^GSPC","^N225","DX-Y.NYB","BZ=F","GC=F","VNM"]`.
- 2 mã crypto `BTC-USD`/`ETH-USD` **không** lấy từ Yahoo mà từ Binance (`BTCUSDT`/`ETHUSDT`), với `previous_close = last_price - price_change`, `currency="USD"`, `market_state="REGULAR"`.
- `persist_snapshot_rows` lọc trước các dòng thiếu bất kỳ trong 4 field NOT NULL (`last_price`, `previous_close`, `change_value`, `change_percent`) → đẩy sang nhánh stale/missing. Upsert theo unique `(snapshot_date, symbol)`; symbol thiếu → copy dòng gần nhất **strictly trước** `day` với `stale=true`; không có lịch sử → `missing`.

---

## Nhóm 1 — Vĩ mô (5 endpoint)

Router: `market_global.py` (gold, fx) + `market_data.py` (commodities, economy).

### GET /api/v1/market-data/macro/gold

> **Giá vàng SJC** — bảng giá mua/bán từng loại vàng, từng chi nhánh SJC cho một ngày; dự phòng sang giá vàng thế giới của Simplize.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/macro/gold:<md5_12>`, TTL **300s** (`REDIS_DEFAULT_TTL_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài: SJC (chính) → Simplize/SPL (dự phòng); registry `macro.gold` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `date` | `string` | không | hôm nay theo **UTC** (`datetime.now(UTC)`) | regex `^\d{4}-\d{2}-\d{2}$` | Ngày giao dịch YYYY-MM-DD |
| `source` | `string` | không | `null` | phải thuộc `["SJC","SIMPLIZE"]` (so sánh sau `.upper()`); giá trị lạ bị **bỏ qua âm thầm** | Buộc dùng một nguồn duy nhất |

**Request body** — —

**Response 200**

~~~ts
// meta.source === 'SJC'
type MdGoldSjcResponse = MarketDataResponse<MdSjcGoldRow[]>;
// meta.source === 'SIMPLIZE' → hình dạng ĐỔI HẲN sang nến, không còn buy/sell
type MdGoldSimplizeResponse = MarketDataResponse<MdCommodityCandle[]>;
~~~

~~~json
{
  "data": [
    { "date": "2026-08-17", "name": "Vàng SJC 1L, 10L, 1KG", "branch": "Hồ Chí Minh", "buy_price": 8000000, "sell_price": 8200000 },
    { "date": "2026-08-17", "name": "Nhẫn Tròn Trơn 99,99", "branch": "Hồ Chí Minh", "buy_price": 7850000, "sell_price": 8050000 }
  ],
  "meta": {
    "source": "SJC",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:22:11.502341Z",
    "raw_endpoint": "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `date` không khớp regex | `Giá trị date='17/08/2026' không hợp lệ. Định dạng YYYY-MM-DD.` |
| `502` | — | cả SJC và Simplize lỗi/rỗng | `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` |
| `502` | — | có `?source=` hợp lệ và nguồn đó lỗi/rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. `POST https://sjc.com.vn/GoldPrice/Services/PriceService.ashx`, body form-urlencoded `method=GetSJCGoldPriceByDate&toDate=<DD%2FMM%2FYYYY>` — ngày đổi `YYYY-MM-DD` → `DD/MM/YYYY` rồi `quote(safe='')` (dấu `/` → `%2F`). Header thêm `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`.
2. Đọc `data["data"]`; thiếu key hoặc rỗng → `records = []`.
3. Validator mặc định coi **list rỗng là nguồn thất bại** → nhảy Simplize. Đây chính là hành vi **ngày nghỉ / ngoài giờ**: SJC không có dòng nào cho Chủ nhật → tự động rơi sang vàng thế giới, `meta.fallback_used = true`.
4. Simplize: `GET https://api.simplize.vn/api/historical/prices/ohlcv?ticker=GC%3DF&interval=1d&type=commodity&from=<epoch>&to=<epoch>` với `start = end = date`. Trả **nến, đơn vị USD/oz** → client **phải** đọc `meta.source` để biết đang nhận hình dạng nào.
5. Cả hai fail → `502`.
6. Response rỗng **không được cache** (không bật `cache_empty`) → mỗi request lại đấm provider.

**curl**

~~~bash
# Endpoint công khai — Authorization là TUỲ CHỌN (backend bỏ qua)
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/macro/gold?date=2026-08-17' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0011'
~~~

**Ghi chú khi viết lại**

- **Đơn vị**: docstring `sjc.py` ghi *"BuyValue/SellValue are absolute VND"* và code **không nhân/chia gì cả** — truyền thẳng. Test `test_sjc_fetch_gold_normalizes` dùng `8000000/8200000`. **Tuyệt đối không scale.** Đơn vị theo lượng/chỉ do SJC quyết định — **CHƯA XÁC ĐỊNH trong source**.
- `date` mỗi dòng là **tham số request**, không phải ngày SJC trả → không dùng field này để phát hiện dữ liệu cũ.
- Default `date` tính theo **UTC**, không phải ICT: từ 00:00–07:00 giờ VN, "hôm nay" của endpoint vẫn là ngày hôm trước theo lịch VN.
- `?source=VCB` (không thuộc chain) bị bỏ qua, vẫn chạy full chain SJC→SIMPLIZE và **không** báo lỗi.

---

### GET /api/v1/market-data/macro/fx

> **Bảng tỷ giá Vietcombank** — giá mua tiền mặt, mua chuyển khoản và giá bán cho từng ngoại tệ trong một ngày.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/macro/fx:<md5_12>`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài: Vietcombank; registry `macro.fx` = `SourceChain("VCB", ("MBK","ASEAN"))` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `date` | `string` | không | hôm nay theo **UTC** | regex `^\d{4}-\d{2}-\d{2}$` | Ngày YYYY-MM-DD |
| `source` | `string` | không | `null` | **thực tế BẮT BUỘC = `VCB`** (xem Fallback) | Buộc dùng nguồn |

**Request body** — —

**Response 200**

~~~ts
type MdFxResponse = MarketDataResponse<MdVcbFxRow[]>;
~~~

~~~json
{
  "data": [
    { "currency_code": "USD", "currency_name": "US DOLLAR", "buy_cash": 26120, "buy_transfer": 26150, "sell": 26480, "date": "2026-08-17" },
    { "currency_code": "EUR", "currency_name": "EURO", "buy_cash": null, "buy_transfer": 28384.34, "sell": 29676.2, "date": "2026-08-17" },
    { "currency_code": "JPY", "currency_name": "JAPANESE YEN", "buy_cash": 168.42, "buy_transfer": 170.12, "sell": 178.9, "date": "2026-08-17" }
  ],
  "meta": {
    "source": "VCB",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:23:02.118904Z",
    "raw_endpoint": "https://www.vietcombank.com.vn/api/exchangerates"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `date` không khớp regex | `Giá trị date='2026/08/17' không hợp lệ. Định dạng YYYY-MM-DD.` |
| `500` | — | **gọi mà KHÔNG có `?source=VCB`** (kể cả case bình thường) | `Internal Server Error` (Starlette mặc định) |
| `502` | — | có `?source=VCB` và VCB lỗi/rỗng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

- **Nguyên trạng**: không truyền `?source=VCB` → `ValueError: No handler registered for source 'MBK' (registry key 'macro.fx')` ném ra trước khi gọi VCB → **500**. Xem “Nghiệp vụ nền §2” để biết cách sửa.
- Sau khi sửa, suy giảm đúng phải là:
  1. `GET https://www.vietcombank.com.vn/api/exchangerates?date=<YYYY-MM-DD>`. Query `date` là **bắt buộc** với VCB — thiếu nó VCB trả `404` (ghi trong docstring `vcb.py`).
  2. Đọc `data["Data"]` (list) và `data["Date"]`; `as_of = data["Date"][:10]`; rỗng thì `date` mỗi dòng lấy tham số request.
  3. Parse số: `float(str(v).replace(",", ""))`; ô `"-"` hoặc `None` → `null` (VCB dùng `"-"` cho ngoại tệ không giao dịch tiền mặt).
  4. **Ngày nghỉ**: VCB thường trả bảng phiên gần nhất kèm `Date` của phiên đó → field `date` sẽ **khác** tham số request. Đây là cách duy nhất phát hiện dữ liệu cũ ở endpoint này.
  5. `Data: []` → validator fail → `502`. Response rỗng không được cache.

**curl**

~~~bash
# BẮT BUỘC có source=VCB trên backend hiện tại, không thì 500
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/macro/fx?date=2026-08-17&source=VCB' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0012'
~~~

**Ghi chú khi viết lại**

- **Đơn vị**: VND cho **1 đơn vị ngoại tệ**. USD ~ `26.000`, JPY ~ `170` (VCB niêm yết theo **1 JPY**, không phải 100 JPY). Không nhân/chia.
- Tên field lệch upstream: `cash` → `buy_cash`, `transfer` → `buy_transfer`, `sell` → `sell` (không có tiền tố). VCB **không** cung cấp giá bán tiền mặt riêng — đừng bịa `sell_cash`.
- `_parse` chỉ bỏ dấu **phẩy**, không bỏ dấu chấm → nếu VCB đổi locale sang `"26.150,00"` sẽ parse sai. Giữ logic, thêm test hồi quy.
- Endpoint này **không** phải nguồn của `/sheets/tygia`; hai bảng độc lập và số liệu có thể lệch.
- `vcb.fetch_fx` còn được pipeline pre-market dùng lại (`app/services/ai/market_analysis/premarket_payload.py`) → tách service khỏi controller.

---

### GET /api/v1/market-data/macro/commodities

> **Danh mục hàng hoá** — trả bảng tra 18 mã hàng hoá hợp lệ kèm ticker Simplize và tên tiếng Việt; **không gọi provider**.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/macro/commodities:_`, TTL **3600s** (`REDIS_TTL_REFERENCE_SECONDS`) |
| **Nguồn dữ liệu** | tính toán/bảng tĩnh trong code (`spl.COMMODITY_MAP`) |
| **Side-effect** | — |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdCommodityCatalogResponse = MarketDataResponse<MdCommodityCatalogItem[]>;
~~~

~~~json
{
  "data": [
    { "code": "gold_vn_buy",  "ticker": "GOLD:VN:BUY",   "name": "Vàng VN (mua)" },
    { "code": "gold_vn_sell", "ticker": "GOLD:VN:SELL",  "name": "Vàng VN (bán)" },
    { "code": "gold_global",  "ticker": "GC=F",          "name": "Vàng thế giới" },
    { "code": "oil_crude",    "ticker": "CL=F",          "name": "Dầu thô" },
    { "code": "gas_natural",  "ticker": "NG=F",          "name": "Khí thiên nhiên" },
    { "code": "gas_ron92",    "ticker": "GAS:RON92:VN",  "name": "Xăng RON92" },
    { "code": "gas_ron95",    "ticker": "GAS:RON95:VN",  "name": "Xăng RON95" },
    { "code": "oil_do",       "ticker": "GAS:DO:VN",     "name": "Dầu DO" },
    { "code": "coke",         "ticker": "ICEEUR:NCF1!",  "name": "Than cốc" },
    { "code": "steel_d10",    "ticker": "STEEL:D10:VN",  "name": "Thép D10 VN" },
    { "code": "iron_ore",     "ticker": "COMEX:TIO1!",   "name": "Quặng sắt" },
    { "code": "steel_hrc",    "ticker": "COMEX:HRC1!",   "name": "Thép HRC" },
    { "code": "fertilizer_ure","ticker": "CBOT:UME1!",   "name": "Phân ure" },
    { "code": "soybean",      "ticker": "ZM=F",          "name": "Đậu tương" },
    { "code": "corn",         "ticker": "ZC=F",          "name": "Ngô" },
    { "code": "sugar",        "ticker": "SB=F",          "name": "Đường" },
    { "code": "pork_north_vn","ticker": "PIG:NORTH:VN",  "name": "Heo hơi miền Bắc VN" },
    { "code": "pork_china",   "ticker": "PIG:CHINA",     "name": "Heo hơi Trung Quốc" }
  ],
  "meta": {
    "source": "SPL",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:24:00.001200Z",
    "raw_endpoint": "static_mapping"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Không có nhánh lỗi: handler không gọi mạng, không validate gì | — |

**Fallback / suy giảm** — Không có suy giảm. Bảng nằm trong code nên endpoint **luôn** trả 200 với đúng 18 dòng, kể cả khi Simplize sập. `raw_endpoint` là chuỗi cố định `"static_mapping"` (không phải URL) — đây là endpoint duy nhất trong chương như vậy.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/macro/commodities' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0013'
~~~

**Ghi chú khi viết lại**

- **Thứ tự** các phần tử là thứ tự khai báo trong `COMMODITY_MAP` (dict Python giữ insertion order) — port sang TS bằng array literal để không phụ thuộc thứ tự key của `Object.entries`.
- `name` là **tiếng Việt hard-code trong backend**, không phải từ Simplize → không i18n hoá tự động, giữ nguyên chuỗi.
- Nội dung bảng này là allowlist của endpoint kế tiếp: sửa ở một chỗ, hai endpoint đổi theo.
- Endpoint không đi qua fallback layer nên `as_of` sinh trực tiếp trong handler bằng `datetime.now(UTC)`.

---

### GET /api/v1/market-data/macro/commodities/{code}

> **Lịch sử giá hàng hoá** — nến OHLCV của một mã hàng hoá trong khoảng ngày, lấy từ Simplize.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/macro/commodities/<code>:<md5_12>`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài: Simplize (`SPL`), chain hard-code 1 nguồn (không qua registry) |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `code` | `string` | phải thuộc đúng 18 giá trị `MdCommodityCode`; **phân biệt chữ hoa/thường** (so sánh nguyên văn, không `.lower()`) | Mã hàng hoá |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `start` | `string \| null` | không | `null` (không gửi `from` → Simplize tự quyết) | `YYYY-MM-DD`; **không validate regex**, sai định dạng → `ValueError` trong `strptime` → 502 | Ngày bắt đầu |
| `end` | `string \| null` | không | `null` | `YYYY-MM-DD` | Ngày kết thúc (đặt về 23:59:59 UTC trước khi đổi epoch) |
| `interval` | `string` | không | `"1d"` | **không validate** — truyền thẳng cho Simplize; description ghi `1d, 1h, 1m` | Khung thời gian |

**Request body** — —

**Response 200**

~~~ts
type MdCommodityPriceResponse = MarketDataResponse<MdCommodityCandle[]>;
~~~

~~~json
{
  "data": [
    { "time": 1786924800, "open": 68.42, "high": 69.15, "low": 68.05, "close": 68.9, "volume": 152300 },
    { "time": 1787011200, "open": 68.9,  "high": 69.8,  "low": 68.6,  "close": 69.55, "volume": 148900 }
  ],
  "meta": {
    "source": "SPL",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:25:10.884001Z",
    "raw_endpoint": "https://api.simplize.vn/api/historical/prices/ohlcv"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `code` ngoài allowlist | `Giá trị commodity 'gold' không hợp lệ. Cho phép: ['coke', 'corn', 'fertilizer_ure', 'gas_natural', 'gas_ron92', 'gas_ron95', 'gold_global', 'gold_vn_buy', 'gold_vn_sell', 'iron_ore', 'oil_crude', 'oil_do', 'pork_china', 'pork_north_vn', 'soybean', 'steel_d10', 'steel_hrc', 'sugar']` |
| `502` | — | Simplize lỗi, hoặc trả **rỗng**, hoặc `start`/`end` sai định dạng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. `GET https://api.simplize.vn/api/historical/prices/ohlcv?ticker=<ticker>&interval=<interval>&type=commodity[&from=<epoch>][&to=<epoch>]`, header riêng `accept: application/json`, `user-agent: vns_market_data/1.0` (**không** dùng UA giả browser).
2. Parser chấp nhận **hai dạng payload**: mảng lồng `[time, open, high, low, close, volume]` (cần `len >= 6`) **hoặc** mảng object có key `time/open/high/low/close/volume`. Dạng lạ → bỏ qua phần tử đó.
3. `data` có thể lấy từ `payload["data"]` hoặc chính `payload` nếu upstream trả list ở top level.
4. **Không** có nguồn dự phòng và **không** `allow_empty` → khoảng ngày không có phiên (ngày nghỉ, mã VN ngừng cập nhật) → list rỗng → `502`, **không** phải `200 data: []`. Đây là khác biệt lớn so với `/macro/economy`.
5. Response rỗng không được cache.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/macro/commodities/oil_crude?start=2026-07-01&end=2026-08-17&interval=1d' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0014'
~~~

**Ghi chú khi viết lại**

- **`time` là SỐ epoch giây thô của Simplize, không có field `timestamp`** — khác hẳn nến Binance/MSN. Đừng "chuẩn hoá cho đều".
- **Đơn vị giá phụ thuộc mã**: `gold_global` USD/oz, `oil_crude` USD/thùng, `gas_ron95`/`steel_d10`/`pork_north_vn` VND theo đơn vị nội địa. Backend **không** khai báo và **không** quy đổi → **CHƯA XÁC ĐỊNH cho từng mã, xem `app/services/market_data/sources/spl.py`**. Frontend phải tự gắn nhãn theo `code`.
- `end` được đặt `23:59:59 UTC` (không phải ICT) trước khi `int(timestamp())` → biên ngày lệch 7 giờ so với giờ VN.
- `code` so sánh **case-sensitive**: `GOLD_GLOBAL` → 422. Nếu muốn khoan dung, phải sửa có chủ ý.
- `interval` không được validate ở backend — mọi chuỗi đều đi thẳng lên Simplize; giá trị lạ thường thành `502` chứ không phải `422`.

---

### GET /api/v1/market-data/macro/economy/{indicator}

> **Số liệu kinh tế vĩ mô Việt Nam** — chuỗi thời gian GDP/CPI/FDI/tỷ giá/lãi suất… từ Maybank Trade.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/macro/economy/<indicator>:<md5_12>`, TTL **900s** (`REDIS_TTL_MACRO_SECONDS`), **`cache_empty=True`** |
| **Nguồn dữ liệu** | provider ngoài: `MBK` — `POST https://data.maybanktrade.com.vn/data/reportdatatopbynormtype` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `indicator` | `string` | phải thuộc đúng 10 giá trị `MdMacroIndicator`, **case-sensitive** | Chỉ tiêu vĩ mô |

Bảng đủ 10 indicator (`normTypeID` gửi lên MBK + `period` mặc định nếu client không truyền):

| indicator | normTypeID | period mặc định | Nội dung | Đơn vị |
|---|---|---|---|---|
| `gdp` | `43` | `quarter` | Tăng trưởng / giá trị GDP | do MBK trả trong field `unit` (vd `"%"`) |
| `cpi` | `52` | `month` | Chỉ số giá tiêu dùng | do MBK trả (`%`) |
| `industrial_production` | `46` | `month` | Chỉ số sản xuất công nghiệp | do MBK trả |
| `export_import` | `48` | `month` | Xuất nhập khẩu | do MBK trả |
| `retail` | `47` | `month` | Bán lẻ hàng hoá & dịch vụ | do MBK trả |
| `fdi` | `50` | `month` | Vốn FDI | do MBK trả |
| `money_supply` | `51` | `month` | Cung tiền | do MBK trả |
| `exchange_rate` | `53` | `day` | Tỷ giá | do MBK trả |
| `population_labor` | `55` | `year` | Dân số & lao động | do MBK trả |
| `interest_rate` | `66` | `day` | Lãi suất | do MBK trả |

> **Đơn vị**: backend **không** khai báo và **không** quy đổi đơn vị cho bất kỳ indicator nào. Đơn vị chỉ có khi MBK trả field `unit` trong từng dòng (đã quan sát `"unit": "%"` với `gdp` trong `tests/test_market_data.py::test_macro_gdp`). Đơn vị cố định cho từng indicator: **CHƯA XÁC ĐỊNH — xem `app/services/market_data/sources/mbk.py`**. Không được đoán "tỷ VND"/"triệu USD".

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `start_year` | `integer` | không | `2015` | `ge=2000`, `le=2030` | Năm bắt đầu |
| `end_year` | `integer \| null` | không | `null` → **năm hiện tại theo giờ máy** (`datetime.now().year`, naive) | `ge=2000`, `le=2030` | Năm kết thúc |
| `period` | `string \| null` | không | `null` → lấy theo bảng `period mặc định` ở trên | phải thuộc `day \| month \| quarter \| year` | Tần suất |

**Request body** — —

**Response 200**

~~~ts
type MdMacroResponse = MarketDataResponse<MdMacroRow[]>;
~~~

~~~json
{
  "data": [
    { "report_data_id": 462249, "year": 2026, "name": "Chỉ số giá tiêu dùng", "type_id": 52, "value": 0.05, "report_time": "Tháng 7/2026" },
    { "report_data_id": 463117, "year": 2026, "name": "Chỉ số giá tiêu dùng", "type_id": 52, "value": 0.12, "report_time": "Tháng 8/2026" }
  ],
  "meta": {
    "source": "MBK",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:26:44.310922Z",
    "raw_endpoint": "https://data.maybanktrade.com.vn/data/reportdatatopbynormtype"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `indicator` ngoài allowlist (kiểm **trước tiên**, chưa gọi MBK) | `Giá trị indicator 'invalid_indicator' không hợp lệ. Cho phép: ['cpi', 'exchange_rate', 'export_import', 'fdi', 'gdp', 'industrial_production', 'interest_rate', 'money_supply', 'population_labor', 'retail']` |
| `422` | — | `period` khác `null` và ngoài allowlist (kiểm **thứ hai**, chưa gọi MBK) | `Giá trị period 'week' không hợp lệ. Cho phép: ['day', 'month', 'quarter', 'year']` |
| `422` | — | `start_year`/`end_year` ngoài `[2000, 2030]` hoặc không phải số | `HttpValidationError` (mảng, do Pydantic) |
| `502` | — | MBK lỗi mạng/5xx sau 3 lần retry | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Thứ tự kiểm tra **cứng**: `indicator` → `period` → mới tính `effective_period` → mới gọi MBK. Test `test_macro_invalid_period` khẳng định MBK **không** được gọi khi period sai (`mock.assert_not_awaited()`).
2. `POST` body **form-urlencoded chuỗi thô**: `type=<1|2|3|4>&fromYear=<start_year>&toYear=<end_year>&from=0&to=0&normTypeID=<id>`, với `type` = `{day:1, month:2, quarter:3, year:4}`. Header phải **thay** `Content-Type: application/json` bằng `application/x-www-form-urlencoded; charset=UTF-8`.
3. MBK trả **list ở top level**; không phải list → `records = []`.
4. `allow_empty=True` → **chuỗi rỗng vẫn là 200 với `data: []`** (test `test_macro_empty_series_returns_200`). Kết hợp `cache_empty=True` → **kết quả rỗng vẫn được cache 900s**, tức chọn sai `period` sẽ trả rỗng trong 15 phút dù MBK có dữ liệu ở period khác.
5. Ngoài giờ / cuối tuần: MBK là dữ liệu công bố định kỳ, không phụ thuộc phiên → không có nhánh suy giảm theo giờ.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/macro/economy/cpi?start_year=2024&end_year=2026&period=month' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0015'
~~~

**Ghi chú khi viết lại**

- **Key của mỗi dòng là ĐỘNG**: sinh bằng camel→snake (`re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2")` rồi `re.sub(r"([a-z0-9])([A-Z])", r"\1_\2")`, `.lower()`), sau đó **xoá tiền tố/hậu tố** `tern_`, `norm_`, `term_`, `from_`, `_code`. Kết quả đã kiểm chứng: `NormValue→value`, `NormName→name`, `NormTypeID→type_id`, `TermYear→year`, `ReportTime→report_time`, `ReportDataID→report_data_id`, `GroupName→group_name`, `NormCode→code`.
- **TRAP trùng key**: `TermYear` và `FromYear` **cùng** map về `year` → key sau ghi đè key trước, mất dữ liệu âm thầm. Khi port, giữ đúng thuật toán nhưng thêm log khi phát hiện trùng.
- `day` của MBK có định dạng .NET `"/Date(1719705600000)/"` — backend **không** parse, truyền thẳng chuỗi. Frontend đang tự bóc số.
- `end_year` mặc định dùng `datetime.now()` **naive theo timezone của process**, khác `datetime.now(UTC)` dùng ở gold/fx. Container prod chạy UTC nên thực tế là năm UTC.
- Kể cả khi client truyền `period` hợp lệ nhưng "lệch" với indicator (vd `population_labor` + `day`), backend vẫn gọi MBK và thường nhận rỗng → 200 rỗng, cache 15 phút. `default_period_for_indicator` tồn tại chính để tránh việc này.

---

## Nhóm 2 — Quốc tế (6 endpoint)

Router: `app/api/v1/endpoints/market_global.py`.

### GET /api/v1/market-data/global/snapshot

> **Snapshot thị trường quốc tế** — trả toàn bộ dòng của `snapshot_date` mới nhất trong bảng `market_data_snapshot`; **đọc DB, KHÔNG gọi provider**.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | **không** — endpoint này là endpoint **duy nhất trong chương không có `@redis_cached`**; mỗi request là 2 query Postgres |
| **Nguồn dữ liệu** | **DB**: bảng `market_data_snapshot` (do cron `intl_snapshot_job` 3 wave sinh) |
| **Side-effect** | — (chỉ đọc) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `category` | `string \| null` | không | `null` (không lọc) | **không validate** — chuỗi lạ chỉ cho `data: []` | Lọc theo `asset_category`: `us_index`, `us_futures`, `asia_index`, `fx`, `commodity`, `bond`, `crypto`, `etf`, `other` |

**Request body** — —

**Response 200**

~~~ts
// Envelope RIÊNG — meta KHÔNG phải MarketDataMeta
type MdSnapshotResponse = MdIntlSnapshotResponse;
~~~

~~~json
{
  "data": [
    {
      "snapshot_date": "2026-08-17",
      "asset_category": "commodity",
      "symbol": "GC=F",
      "name": "Gold Futures",
      "last_price": 3418.7,
      "previous_close": 3402.1,
      "change_value": 16.6,
      "change_percent": 0.4879,
      "day_high": 3425.4,
      "day_low": 3398.2,
      "volume": 184320,
      "currency": "USD",
      "market_state": "CLOSED",
      "market_time": "2026-08-16T20:59:00+00:00",
      "source": "yahoo",
      "stale": false,
      "fetched_at": "2026-08-17T06:00:12.418000+00:00"
    },
    {
      "snapshot_date": "2026-08-17",
      "asset_category": "fx",
      "symbol": "VND=X",
      "name": "USD/VND",
      "last_price": 26150.0,
      "previous_close": 26120.0,
      "change_value": 30.0,
      "change_percent": 0.1148,
      "day_high": null,
      "day_low": null,
      "volume": null,
      "currency": "VND",
      "market_state": "REGULAR",
      "market_time": "2026-08-16T13:20:00+00:00",
      "source": "yahoo",
      "stale": true,
      "fetched_at": "2026-08-17T06:00:13.902000+00:00"
    }
  ],
  "meta": { "snapshot_date": "2026-08-17", "stale_count": 1 }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| `422` | — | `category` không phải chuỗi (rất khó xảy ra qua HTTP) | `HttpValidationError` |
| `500` | — | DB không kết nối được | `Internal Server Error` |

Không có `502` — endpoint này không gọi provider.

**Fallback / suy giảm** — **Mục quan trọng nhất của endpoint này.**

1. Query 1: `SELECT max(snapshot_date) FROM market_data_snapshot` — **trên TOÀN bảng, KHÔNG lọc theo `category`**. `NULL` (bảng rỗng) → trả ngay `{"data": [], "meta": {"snapshot_date": null, "stale_count": 0}}`.
2. Query 2: `WHERE snapshot_date = <max> [AND asset_category = <category>] ORDER BY asset_category, symbol`.
3. **Chưa có snapshot của hôm nay** (cron chưa chạy, `INTL_DATA_ENABLED=false`, ngày nghỉ, hoặc job fail): endpoint **KHÔNG trả rỗng và KHÔNG báo lỗi** — nó trả dòng của **ngày gần nhất có dữ liệu**, có thể cũ nhiều ngày. Không có cờ nào nói "đây là dữ liệu ngày khác".
4. **Cách nhận biết dữ liệu cũ** (client phải tự làm, theo thứ tự ưu tiên):
   - so `meta.snapshot_date` với **ngày hôm nay theo ICT** — lệch ≥1 ngày là snapshot cũ;
   - `stale === true` trên từng dòng = dòng đó là **bản copy của phiên trước** vì fetch hôm nay thất bại (Yahoo 429 / provider lỗi);
   - `meta.stale_count` = số dòng stale trong **đúng tập đã lọc** (không phải toàn bảng) — dùng làm chỉ báo sức khoẻ pipeline;
   - `market_time` = giờ thị trường của provider, `fetched_at` = giờ ghi DB. `market_time` cũ mà `stale=false` nghĩa là thị trường đó đang đóng cửa, khác với dữ liệu cũ.
5. **TRAP `category` + `max(snapshot_date)`**: nếu category X lần cuối được ghi ở ngày cũ hơn `max(snapshot_date)` toàn bảng (vd `etf` chỉ có ở wave 3, mà wave 3 fail), lọc theo X trả `data: []`. Và vì `rows` rỗng, handler **trả `meta.snapshot_date = null`** dù bảng có dữ liệu — client dễ hiểu sai là "bảng rỗng". Test `test_snapshot_endpoint_empty_table` chỉ phủ trường hợp bảng rỗng.
6. `fetched_at` khi cột `NULL` được serialize thành **chuỗi rỗng `""`**, không phải `null` (`fetched_at=... if r.fetched_at is not None else ""`).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/snapshot?category=us_index' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0016'
~~~

**Ghi chú khi viết lại**

- Cột `Numeric(18,6)`/`Numeric(10,4)` phải **serialize thành `number`**, không phải string — driver Postgres của Node (`pg`) mặc định trả `numeric` dưới dạng **string**, sẽ phá contract. Test `test_snapshot_endpoint_numeric_serialized_as_float` chốt điều này. Ép `parseFloat`/`Number` ở tầng mapper.
- `change_percent` đã là **phần trăm** (`0.4041` = +0.4041%), không nhân 100 nữa.
- Sắp xếp **cố định** `ORDER BY asset_category, symbol` — không được thay bằng "sort theo % tăng giảm" ở backend.
- `symbol` là ticker **Yahoo** (`^GSPC`, `VND=X`, `GC=F`, `DX-Y.NYB`, `000001.SS`), khác hoàn toàn mã MSN (`INX`, `USDVND`) dùng ở `/global/world-index` và `/global/forex`. Đừng dùng lẫn.
- Nên **thêm cache Redis TTL ngắn** (30–60s) khi port: endpoint này trả tối đa 43 dòng và được home page gọi liên tục, hiện đang query DB mỗi request.
- Bảng: unique `(snapshot_date, symbol)`, index trên `snapshot_date` và `asset_category`, `source` default `'yahoo'`, `fetched_at` `server_default now()`.

---

### GET /api/v1/market-data/global/world-index

> **Chỉ số chứng khoán thế giới** — nến OHLCV lịch sử của một chỉ số (S&P 500, Nikkei, HSI…) từ MSN Finance.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/global/world-index:<md5_12>`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài: MSN (`assets.msn.com/service/Finance/Charts/TimeRange`); registry `intl.world_index` |
| **Side-effect** | ghi cache Redis khoá `mkt:msn:apikey` (TTL 21600s) khi phải resolve apikey mới |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | **có** | — | tự `.upper()`; phải có SecId trong `msn.MSN_SECID` (33 mã, xem `MdMsnSymbol`) | Mã chỉ số: `INX`, `DJI`, `N225`, `UKX`, `VNI`… |
| `start` | `string \| null` | không | `null` → `"2000-01-01"` | `YYYY-MM-DD`, **không validate regex** | Ngày bắt đầu |
| `end` | `string \| null` | không | `null` → hôm nay theo **UTC** | `YYYY-MM-DD`, **không validate regex** | Ngày kết thúc |

**Request body** — —

**Response 200**

~~~ts
type MdWorldIndexResponse = MarketDataResponse<MdIntlCandle[]>;
~~~

~~~json
{
  "data": [
    { "time": "2026-08-13", "timestamp": 1786924800, "open": 6098.4, "high": 6131.2, "low": 6090.1, "close": 6124.85, "volume": 2418500000 },
    { "time": "2026-08-14", "timestamp": 1787011200, "open": 6126.0, "high": 6155.7, "low": 6118.3, "close": 6149.2, "volume": 2287400000 }
  ],
  "meta": {
    "source": "MSN",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:28:03.775611Z",
    "raw_endpoint": "https://assets.msn.com/service/Finance/Charts/TimeRange"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` (sau `.upper()`) không có SecId | `Không hỗ trợ mã chỉ số: SP500` |
| `422` | — | thiếu `symbol` | `HttpValidationError` (mảng, `loc: ["query","symbol"]`) |
| `502` | — | MSN trả 4xx (bao gồm **404**), resolver không tìm được apikey, hoặc lỗi mạng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Chặn allowlist SecId **trước** khi gọi mạng → phần lớn nguy cơ 404 bị lọc ở tầng 422.
2. Resolve `apikey`: đọc Redis `mkt:msn:apikey`; miss → gọi resolver `v3/config/` với `v = YYYYMMDD(now-7h) + ".168"`, `targetScope` JSON locale `vi-vn`; ghi lại cache 6h. Redis lỗi → chỉ mất cache (bọc try/except), vẫn chạy.
3. Gọi charts với `timeframe=1`, `StartTime=<start>T17:00:00.000Z`, `EndTime=<end>T16:59:00.858Z`, `ids=<secid>`, `type=All`.
4. Payload là **mảng**; phần tử đầu rỗng/không có → trả `[]` (không lỗi).
5. `allow_empty=True` → **series rỗng vẫn trả `200 data: []`** (ngày nghỉ, khoảng ngày không có phiên). Nhưng response rỗng **không được cache** (`cache_empty` không bật) → mỗi request lại đấm MSN.
6. **404 / 401 / 403 từ MSN không được retry** (4xx) và chain chỉ có MSN → `502`. Nếu nguyên nhân là apikey hỏng, lỗi **kéo dài tới 6h** vì cache apikey không tự huỷ — xem “Nghiệp vụ nền §5.5” để biết cách sửa.
7. Chuẩn hoá: bỏ điểm có `open`/`high`/`low` là `null` hoặc sentinel `-99999901.0`; `volume` giữ nguyên (`force_currency=False`) trừ khi bằng sentinel → `null`.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/world-index?symbol=INX&start=2026-08-01&end=2026-08-17' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0017'
~~~

**Ghi chú khi viết lại**

- `MSN_SECID` là **một map duy nhất** cho cả index + crypto + forex nên endpoint này **không chặn** `?symbol=BTC` hay `?symbol=USDVND` — nó sẽ chạy và trả dữ liệu crypto/forex qua endpoint "world-index". Nếu muốn siết, phải tách map theo nhóm (thay đổi hành vi, ghi changelog).
- `VNI` (VN-Index) có trong map → endpoint quốc tế này cũng trả được VN-Index từ MSN. Số liệu có thể lệch so với nguồn VCI dùng ở chương 24.
- `start` mặc định `2000-01-01` → **không truyền `start` là kéo 25 năm nến**. Nên bắt buộc `start` hoặc đặt default hẹp hơn khi port (thay đổi hành vi).
- `timestamp` là **epoch giây**; `time` là chuỗi ngày quy theo **UTC** — với chỉ số châu Á, `time` có thể lệch 1 ngày so với ngày giao dịch địa phương.

---

### GET /api/v1/market-data/global/forex

> **Cặp tiền tệ quốc tế** — nến OHLC lịch sử của một cặp tiền (EURUSD, USDJPY, USDVND, XAUUSD…) từ MSN Finance.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/global/forex:<md5_12>`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài: MSN (cùng endpoint charts với world-index); registry `intl.forex` |
| **Side-effect** | ghi cache Redis `mkt:msn:apikey` (TTL 21600s) khi resolve apikey mới |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | **có** | — | tự `.upper()`; phải có SecId trong `msn.MSN_SECID` | Cặp tiền: `EURUSD`, `USDJPY`, `USDVND`, `JPYVND`, `EURVND`, `GBPUSD`, `AUDUSD`, `XAUUSD`, `XAGUSD` |
| `start` | `string \| null` | không | `null` → `"2000-01-01"` | `YYYY-MM-DD`, không validate | Ngày bắt đầu |
| `end` | `string \| null` | không | `null` → hôm nay theo **UTC** | `YYYY-MM-DD`, không validate | Ngày kết thúc |

**Request body** — —

**Response 200**

~~~ts
/** volume LUÔN null vì force_currency=true. */
type MdForexResponse = MarketDataResponse<MdIntlCandle[]>;
~~~

~~~json
{
  "data": [
    { "time": "2026-08-14", "timestamp": 1787011200, "open": 26118.0, "high": 26165.0, "low": 26102.0, "close": 26150.0, "volume": null },
    { "time": "2026-08-17", "timestamp": 1787270400, "open": 26150.0, "high": 26190.0, "low": 26140.0, "close": 26172.0, "volume": null }
  ],
  "meta": {
    "source": "MSN",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:29:41.220117Z",
    "raw_endpoint": "https://assets.msn.com/service/Finance/Charts/TimeRange"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` không có SecId | `Không hỗ trợ cặp tiền: USDTHB` |
| `422` | — | thiếu `symbol` | `HttpValidationError` |
| `502` | — | MSN 4xx (kể cả **404**), resolver hỏng, lỗi mạng | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Giống `/global/world-index` về apikey, chặn SecId, `allow_empty=True`, và ứng xử với 404 → xem mục đó. Điểm **khác duy nhất**: gọi `msn.fetch_forex` với `force_currency=True`.
2. `force_currency=True` khiến `_norm_series` **luôn** đặt `volume = null`, **không** dựa vào `securityType` của payload. Nghĩa là kể cả khi hỏi một mã không phải cặp tiền (vd `?symbol=INX` — vẫn hợp lệ vì cùng map SecId), volume vẫn bị xoá.
3. Cuối tuần / ngày lễ: forex không có nến → `200 data: []` (không phải 502). Rỗng **không** được cache.
4. Cặp có VND (`USDVND`, `JPYVND`, `EURVND`) đến từ MSN, **độc lập** với `/macro/fx` (Vietcombank) và `/sheets/tygia` — ba nguồn, ba con số khác nhau. Không "hoà" chúng lại.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/forex?symbol=USDVND&start=2026-08-01&end=2026-08-17' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0018'
~~~

**Ghi chú khi viết lại**

- **Đơn vị**: giá trị là tỷ giá thô của MSN cho cặp đó (`USDVND` ~ 26.000 VND/USD; `EURUSD` ~ 1,08 USD/EUR; `XAUUSD` USD/oz). Không quy đổi.
- Endpoint dùng **cùng URL charts** với world-index — chỉ khác cờ `force_currency`. Khi port, tách một hàm `fetchMsnChart(secid, {forceCurrency})` dùng chung, đừng copy hai bản.
- `XAUUSD`/`XAGUSD` (vàng/bạc) nằm trong nhóm forex của map — nên UI "vàng thế giới" có **hai đường**: qua đây (MSN) và qua `/macro/commodities/gold_global` (Simplize). Chọn một, đừng trộn.

---

### GET /api/v1/market-data/global/crypto/{symbol}/ticker

> **Thống kê 24h crypto** — giá cuối, mở/cao/thấp, bid/ask, biến động và khối lượng 24 giờ của một cặp Binance.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/global/crypto/<symbol>/ticker:_`, TTL **15s** (`REDIS_TTL_REALTIME_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài: Binance `GET /api/v3/ticker/24hr`; registry `intl.crypto_ticker` |
| **Side-effect** | — (chỉ thay đổi biến module `_host_idx` khi xoay host) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | tự `.upper()`, rồi phải khớp `^[A-Z0-9]{2,20}$` | Cặp Binance **đầy đủ**, vd `BTCUSDT`, `ETHUSDT`, `SOLUSDT` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdCryptoTickerResponse = MarketDataResponse<MdCryptoTicker>;  // data là OBJECT
~~~

~~~json
{
  "data": {
    "symbol": "BTCUSDT",
    "last_price": 118450.25,
    "open_price": 116980.0,
    "high_price": 119210.5,
    "low_price": 116540.0,
    "bid_price": 118449.1,
    "ask_price": 118450.9,
    "price_change": 1470.25,
    "change_pct": 1.257,
    "volume": 21483.6412,
    "quote_volume": 2534871220.55,
    "open_time": 1787184000000,
    "close_time": 1787270399999,
    "count": 1842093
  },
  "meta": {
    "source": "BINANCE",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:30:15.004881Z",
    "raw_endpoint": "https://api.binance.com/api/v3/ticker/24hr"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` (sau `.upper()`) không khớp `^[A-Z0-9]{2,20}$` — có `-`, `/`, `.`, hoặc ngắn/dài quá | `Mã crypto không hợp lệ: BTC-USD` |
| `502` | — | Binance trả 400 (mã không tồn tại), hoặc hết 5 lần retry, hoặc payload thiếu field bắt buộc | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Regex chỉ chặn **hình dạng**, không chặn mã không tồn tại. `?symbol=XYZUSDT` qua được 422 → Binance trả `400` → `4xx` không retry, fail nhanh → **502** (không phải 404).
2. Xoay host: 6 host Binance, retry `{429,500,502,503,504}` tối đa 5 lần, backoff `2 → 4 → 8 → 10`s, đổi host khi gặp lỗi retryable/timeout/connect. Timeout riêng của Binance là **30s** (không dùng client chung 15s) và tạo `httpx.AsyncClient` mới mỗi lần gọi.
3. `binance.fetch_ticker` truy cập **trực tiếp** `r["lastPrice"]`, `r["openPrice"]`, `r["highPrice"]`, `r["lowPrice"]`, `r["bidPrice"]`, `r["askPrice"]`, `r["priceChange"]`, `r["priceChangePercent"]`, `r["volume"]`, `r["quoteVolume"]` → thiếu bất kỳ field nào ném `KeyError` → chain fail → **502**. Chỉ `symbol`, `openTime`, `closeTime`, `count` dùng `.get()` nên có thể `null`.
4. `raw_endpoint` **luôn** báo host đầu tiên `https://api.binance.com...` **dù request thật đã xoay sang host khác** — không dùng field này để debug host.
5. Crypto giao dịch 24/7 → không có nhánh "ngoài giờ". Nếu Binance bị chặn IP (một số VPS bị 451/403) → 4xx không retry → 502 ngay.
6. Không có `allow_empty` nhưng `data` là dict luôn đủ key → validator không bao giờ chặn.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/crypto/BTCUSDT/ticker' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0019'
~~~

**Ghi chú khi viết lại**

- **Định dạng symbol**: phải là cặp Binance **liền nhau, không dấu** (`BTCUSDT`), **không** phải `BTC-USD` (Yahoo) hay `BTC` (MSN). Ba hệ mã cùng tồn tại trong repo — `BTC-USD` chỉ dùng trong `market_data_snapshot`.
- `open_time`/`close_time` là **milligiây**, trong khi nến ở `/ohlc` dùng **giây**. Đừng dùng chung helper.
- `change_pct` là số thô (`1.257` = +1,257%).
- Header gửi Binance dùng `User-Agent` của profile **`MSN`** (`get_headers("MSN")["User-Agent"]`) + `Accept: application/json` — chi tiết kỳ lạ nhưng cố ý, giữ nguyên.
- `_host_idx` là **biến toàn cục module** (`global`), chia sẻ giữa mọi request và mọi endpoint Binance. Khi port sang NestJS, đặt trong một provider singleton, đừng để trong request scope.

---

### GET /api/v1/market-data/global/crypto/{symbol}/ohlc

> **Nến crypto** — OHLCV theo khung thời gian, nguồn chính Binance (`uiKlines`, giá USDT), dự phòng MSN (giá **VND**).

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/global/crypto/<symbol>/ohlc:<md5_12>`, TTL **300s** |
| **Nguồn dữ liệu** | provider ngoài: Binance (chính) → MSN (dự phòng); registry `intl.crypto_ohlc` |
| **Side-effect** | có thể ghi cache Redis `mkt:msn:apikey` nếu chạy nhánh dự phòng |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | `.upper()` rồi khớp `^[A-Z0-9]{2,20}$` | Cặp Binance, vd `BTCUSDT` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `interval` | `string` | không | `"1d"` | **KHÔNG validate ở backend**; description ghi `1m,5m,15m,1h,4h,1d,1w` | Khung nến, truyền thẳng cho Binance |
| `limit` | `integer` | không | `500` | `ge=1`, `le=1000` (Pydantic chặn) | Số nến |

**Request body** — —

**Response 200**

~~~ts
/** meta.source === 'BINANCE' → giá USDT, volume là base asset.
 *  meta.source === 'MSN'     → giá VND, KHÔNG áp dụng interval/limit. */
type MdCryptoOhlcResponse = MarketDataResponse<MdIntlCandle[]>;
~~~

~~~json
{
  "data": [
    { "time": "2026-08-15", "timestamp": 1787097600, "open": 116980.0, "high": 118420.0, "low": 116210.5, "close": 117905.4, "volume": 18342.5521 },
    { "time": "2026-08-16", "timestamp": 1787184000, "open": 117905.4, "high": 119210.5, "low": 116540.0, "close": 118450.25, "volume": 21483.6412 }
  ],
  "meta": {
    "source": "BINANCE",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:31:02.664310Z",
    "raw_endpoint": "https://api.binance.com/api/v3/uiKlines"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` sai hình dạng | `Mã crypto không hợp lệ: BTC/USDT` |
| `422` | — | `limit` ngoài `[1, 1000]` | `HttpValidationError` |
| `502` | — | Binance fail **và** MSN fail (mã không có SecId, apikey hỏng, 404…) | `Tất cả 2 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm** — **đây là chỗ dễ port sai nhất của nhóm crypto.**

1. Binance `GET /api/v3/uiKlines?symbol=<SYM>&interval=<interval>&limit=<limit>` với đủ cơ chế xoay 6 host/retry ở mục ticker.
2. Mỗi kline là mảng: `k[0]` **ms** → `ts = k[0] // 1000` (giây), `k[1..5]` = open/high/low/close/volume, ép `float`. `time = ngày UTC của ts`.
3. **`interval` không được validate** → giá trị lạ (`2d`, `1M` sai hoa/thường) làm Binance trả `400` → fail nhanh (không retry) → **chuyển sang MSN**.
4. Nhánh MSN: `msn.fetch_crypto(sym, apikey)` — gọi `https://assets.msn.com/service/Finance/Cryptocurrency/chart`. **Bỏ qua hoàn toàn `interval` và `limit`**, và vì handler không truyền `start`/`end`, MSN lấy mặc định `2000-01-01 → hôm nay`. Kết quả: response có thể **hàng nghìn nến, đơn vị VND** thay cho vài trăm nến USDT.
5. MSN cần SecId: chỉ `BTC`, `BTCUSDT`, `ETH`, `BNB`, `XRP`, `ADA`, `SOL`, `DOGE`, `USDT`, `USDC` có mặt. `ETHUSDT` **KHÔNG có** trong map → với `ETHUSDT`, nhánh dự phòng luôn ném `ValueError("No MSN SecId for symbol: ETHUSDT")` → nếu Binance fail thì chắc chắn `502`. Chỉ `BTCUSDT` là cặp `*USDT` thật sự có fallback.
6. Không `allow_empty` → Binance/MSN trả list rỗng cũng bị coi là fail và tụt nguồn; cả hai rỗng → `502`. Rỗng không được cache.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/crypto/BTCUSDT/ohlc?interval=1d&limit=200' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001a'
~~~

**Ghi chú khi viết lại**

- **Đơn vị đổi theo nguồn**: `BINANCE` → USDT; `MSN` → **VND**. Client **buộc** phải đọc `meta.source` trước khi vẽ chart, nếu không đồ thị nhảy 26.000 lần. Cân nhắc thêm field `currency` vào `meta` khi port (thay đổi hành vi, ghi changelog).
- Binance dùng **`uiKlines`** chứ không phải `klines` — `uiKlines` đã được Binance làm mượt cho UI. Giữ đúng path.
- `k[0] // 1000` là **chia lấy nguyên**; TS phải dùng `Math.floor(k[0] / 1000)`, không `/1000` thuần.
- Nên thêm allowlist `interval` ở backend để lỗi thành `422` thay vì rơi sang MSN đổi đơn vị âm thầm — nhưng đây là **thay đổi hành vi**, phải ghi changelog.

---

### GET /api/v1/market-data/global/crypto/{symbol}/depth

> **Order book crypto** — danh sách bids/asks hiện tại của một cặp Binance.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/global/crypto/<symbol>/depth:<md5_12>`, TTL **15s**, **`cache_empty=True`** |
| **Nguồn dữ liệu** | provider ngoài: Binance `GET /api/v3/depth`; registry `intl.crypto_depth` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `symbol` | `string` | `.upper()` rồi khớp `^[A-Z0-9]{2,20}$` | Cặp Binance, vd `BTCUSDT` |

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `limit` | `integer` | không | `100` | `ge=1`, `le=5000` (Pydantic chặn) | Số mức giá mỗi bên |

**Request body** — —

**Response 200**

~~~ts
type MdCryptoDepthResponse = MarketDataResponse<MdCryptoDepth>;  // data là OBJECT
~~~

~~~json
{
  "data": {
    "last_update_id": 78412993551,
    "bids": [
      { "price": 118449.1, "qty": 0.42153 },
      { "price": 118448.5, "qty": 1.07800 }
    ],
    "asks": [
      { "price": 118450.9, "qty": 0.31200 },
      { "price": 118451.4, "qty": 2.44017 }
    ]
  },
  "meta": {
    "source": "BINANCE",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:32:20.117044Z",
    "raw_endpoint": "https://api.binance.com/api/v3/depth"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `symbol` sai hình dạng | `Mã crypto không hợp lệ: BTC_USDT` |
| `422` | — | `limit` ngoài `[1, 5000]` | `HttpValidationError` |
| `502` | — | Binance 400 (mã lạ) / hết retry / chặn IP | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Không có nguồn dự phòng — chain chỉ `BINANCE`.
2. `allow_empty=True` **và** `cache_empty=True`: nếu Binance trả `bids: []`, `asks: []` (mã có nhưng không có lệnh) thì endpoint trả `200` với hai mảng rỗng, **và cache 15s**. Đây là endpoint duy nhất trong nhóm crypto cache cả kết quả rỗng.
3. `r.get("bids", [])` / `r.get("asks", [])` nên payload thiếu key vẫn ra mảng rỗng thay vì lỗi. `last_update_id` dùng `.get()` → có thể `null`.
4. Mỗi mức giá được map từ mảng chuỗi `["118449.10", "0.42153"]` → `{price: float, qty: float}`. **Thứ tự Binance được giữ nguyên**, backend không sort lại.
5. Binance giới hạn `limit` theo bậc (5/10/20/50/100/500/1000/5000); backend chỉ chặn `1..5000` nên giá trị "lẻ" như `137` được gửi thẳng — Binance hiện chấp nhận và tự làm tròn lên bậc gần nhất. **Không dựa vào hành vi này**; khi port nên chuẩn hoá về bậc hợp lệ.
6. Cơ chế xoay host / retry giống mục ticker.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/global/crypto/BTCUSDT/depth?limit=100' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001b'
~~~

**Ghi chú khi viết lại**

- **`data` là object, không phải array** — khác với `/ohlc`. Kiểu union của client phải phân biệt theo path, không theo `meta`.
- Giá/khối lượng Binance trả **dạng chuỗi**, backend ép `float`. TS phải `Number(...)`, đừng tin type suy luận từ JSON.
- TTL 15s + `limit=5000` là combo tốn RAM Redis (một response ~5000×2 mức). Cân nhắc chặn `limit` ở mức 100–500 khi port.
- Đây là dữ liệu **realtime tức thời**; cache 15s nghĩa là order book có thể lệch tới 15 giây. Không dùng để khớp lệnh, chỉ để hiển thị.

---

## Nhóm 3 — Quỹ mở (3 endpoint)

Router: `app/api/v1/endpoints/market_data.py`, nguồn duy nhất Fmarket (`https://api.fmarket.vn/res/products`).

### GET /api/v1/market-data/funds

> **Danh sách quỹ mở** — liệt kê quỹ đang giao dịch trên Fmarket kèm NAV hiện tại và hiệu suất 1M/3M/6M/12M/36M.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/funds:<md5_12>`, TTL **900s** (`REDIS_TTL_MACRO_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài: Fmarket `POST /res/products/filter` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `fund_type` | `string` | không | `""` (không lọc) | tra `fund_type_map` sau `.upper()`: `""`, `BALANCED`, `BOND`, `STOCK`; **giá trị lạ → coi như `""`**, không lỗi | Lọc theo loại tài sản quỹ |

**Request body** — —

**Response 200**

~~~ts
type MdFundListResponse = MarketDataResponse<MdFundListItem[]>;
~~~

~~~json
{
  "data": [
    {
      "fund_id": 23,
      "short_name": "VESAF",
      "name": "QUỸ ĐẦU TƯ LỢI THẾ CẠNH TRANH BỀN VỮNG SSI",
      "fund_type": "STOCK",
      "fund_owner": "SSIAM",
      "management_fee": 1.75,
      "inception_date": "2017-04-26",
      "nav": 32418.55,
      "code": "VESAF",
      "nav_change_1m": 2.14,
      "nav_change_3m": 7.32,
      "nav_change_6m": 15.08,
      "nav_change_12m": 24.91,
      "nav_change_36m": 68.4,
      "nav_update_at": "2026-08-15"
    },
    {
      "fund_id": 11,
      "short_name": "TCBF",
      "name": "QUỸ ĐẦU TƯ TRÁI PHIẾU TECHCOM",
      "fund_type": "BOND",
      "fund_owner": "TCAM",
      "management_fee": 0.9,
      "inception_date": "2015-01-08",
      "nav": 18742.1,
      "code": "TCBF",
      "nav_change_1m": 0.52,
      "nav_change_3m": 1.61,
      "nav_change_6m": 3.28,
      "nav_change_12m": 6.87,
      "nav_change_36m": 21.05,
      "nav_update_at": "2026-08-15"
    }
  ],
  "meta": {
    "source": "FMARKET",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:33:44.902113Z",
    "raw_endpoint": "https://api.fmarket.vn/res/products/filter"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | Fmarket lỗi, hoặc trả **0 quỹ** (list rỗng → validator fail) | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. `POST https://api.fmarket.vn/res/products/filter` với body JSON **cố định**: `types: ["NEW_FUND","TRADING_FUND"]`, `issuerIds: []`, `sortOrder: "DESC"`, `sortField: "navTo6Months"`, `page: 1`, `pageSize: 100`, `isIpo: false`, `fundAssetTypes: <map(fund_type)>`, `bondRemainPeriods: []`, `searchField: ""`, `isBuyByReward: false`, `thirdAppIds: []`.
2. Đọc `data["data"]["rows"]`; thiếu key → `[]`.
3. Không nguồn dự phòng, không `allow_empty` → rỗng ⇒ **502**, không phải `200 []`.
4. Quỹ mở không có "giờ giao dịch" — NAV cập nhật theo lịch của từng quỹ, dùng `nav_update_at` để biết độ mới. Trường này là **chuỗi thô của Fmarket**, backend không parse.
5. Rỗng không được cache.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/funds?fund_type=STOCK' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001c'
~~~

**Ghi chú khi viết lại**

- **KHÔNG có phân trang cho client**: `page=1, pageSize=100` hard-code → endpoint trả **tối đa 100 quỹ**, và không có cách nào lấy trang 2. Nếu thị trường vượt 100 quỹ mở, danh sách bị cắt âm thầm. Muốn phân trang thật thì phải thêm query param (thay đổi hợp đồng API).
- **Sắp xếp cố định**: `navTo6Months DESC` — tức danh sách luôn theo hiệu suất 6 tháng giảm dần, **không** theo tên. Frontend đang dựa vào thứ tự này.
- **Đơn vị**: `nav` là **VND/đơn vị quỹ** (magnitude ~1e4, test dùng `15000`). `nav_change_*` là **phần trăm thô** (`10.0` = +10%). `management_fee`: **CHƯA XÁC ĐỊNH đơn vị — xem `app/services/market_data/sources/fmarket.py`** (khả năng cao %/năm nhưng source không khẳng định, đừng gắn hậu tố "%" cứng).
- `fund_type` lạ (vd `?fund_type=ETF`) **không** báo lỗi — `fund_type_map.get(..., [])` trả `[]` nên nó im lặng thành "không lọc". Nếu muốn 422 thì phải thêm allowlist (thay đổi hành vi).
- `fund_id` trong response là **id nội bộ Fmarket**, là input duy nhất cho 2 endpoint bên dưới. Không phải mã giao dịch (`code`).

---

### GET /api/v1/market-data/funds/{fund_id}

> **Chi tiết quỹ** — top holdings (cổ phiếu + trái phiếu), phân bổ theo ngành và phân bổ theo loại tài sản.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/funds/<fund_id>:_`, TTL **900s** |
| **Nguồn dữ liệu** | provider ngoài: Fmarket `GET /res/products/{fund_id}` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `fund_id` | `integer` | Pydantic ép số nguyên; không giới hạn min/max | `fund_id` lấy từ `GET /funds` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdFundDetailsResponse = MarketDataResponse<MdFundDetails>;  // data là OBJECT
~~~

~~~json
{
  "data": {
    "top_holdings": [
      { "stock_code": "FPT", "industry": "Công nghệ Thông tin", "net_asset_percent": 11.42, "type": "STOCK" },
      { "stock_code": "VCB", "industry": "Ngân hàng", "net_asset_percent": 8.15, "type": "STOCK" },
      { "stock_code": "HPG", "industry": "Tài nguyên Cơ bản", "net_asset_percent": 6.03, "type": "STOCK" }
    ],
    "industry_holdings": [
      { "industry": "Ngân hàng", "net_asset_percent": 28.4 },
      { "industry": "Công nghệ Thông tin", "net_asset_percent": 17.9 }
    ],
    "asset_holdings": [
      { "asset_type": "Stock", "asset_percent": 92.6 },
      { "asset_type": "Cash", "asset_percent": 7.4 }
    ]
  },
  "meta": {
    "source": "FMARKET",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:34:51.331207Z",
    "raw_endpoint": "https://api.fmarket.vn/res/products/23"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `fund_id` không phải số nguyên (vd `/funds/abc`) | `HttpValidationError` |
| `404` | — | Fmarket trả **HTTP 400** cho id đó (id không tồn tại/không hợp lệ) | `Không tìm thấy quỹ 99999999` |
| `502` | — | Fmarket lỗi khác (5xx, timeout, payload lạ) | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. `GET https://api.fmarket.vn/res/products/{fund_id}` (GET, không phải POST).
2. **Ánh xạ lỗi đặc biệt**: `httpx.HTTPStatusError` với `status_code == 400` → source ném `ValueError("Không tìm thấy quỹ {fund_id}")`. `fetch_with_fallback` bọc thành `RuntimeError` với `__cause__` là `ValueError` đó. Handler kiểm `isinstance(exc.__cause__, ValueError)` → **404**; ngược lại → **502**. Test `test_fund_details_not_found` chốt đúng 404.
3. `productTopHoldingList` và `productTopHoldingBondList` được **NỐI** (`+`) thành một mảng `top_holdings` duy nhất — phân biệt bằng field `type`. Danh sách nào `null` cũng an toàn (`or []`).
4. Fmarket trả 200 nhưng thiếu `data` → `result = {}` → **dict rỗng** → validator mặc định fail → **502** (không phải 200 rỗng). Nếu có `data` nhưng ba list đều rỗng thì `result` vẫn có 3 key ⇒ **200** với 3 mảng rỗng.
5. Rỗng không được cache; kết quả có dữ liệu cache 900s.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/funds/23' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001d'
~~~

**Ghi chú khi viết lại**

- **Bẫy đổi tên field**: `industry_holdings[].net_asset_percent` được map từ upstream **`assetPercent`**, còn `top_holdings[].net_asset_percent` từ **`netAssetPercent`**. Hai nguồn field khác nhau, cùng tên đầu ra. Đừng "thống nhất" thành `asset_percent`.
- `asset_holdings[].asset_type` là `assetType.name` (**chuỗi**), không phải object.
- Thứ tự trong mỗi mảng là thứ tự Fmarket trả; backend **không** sort theo % giảm dần. Nếu UI cần, sort ở frontend.
- Đơn vị 3 field `*_percent`: **phần trăm thô** (`11.42` = 11,42% NAV), không phải tỉ lệ 0–1.
- Thứ tự kiểm tra khi port: (1) parse `fund_id` → 422; (2) gọi upstream; (3) map 400→404; (4) mọi lỗi khác →502; (5) dict rỗng →502.

---

### GET /api/v1/market-data/funds/{fund_id}/nav

> **Lịch sử NAV quỹ** — toàn bộ chuỗi NAV/đơn vị từ ngày thành lập đến hôm nay.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/funds/<fund_id>/nav:_`, TTL **900s** |
| **Nguồn dữ liệu** | provider ngoài: Fmarket `POST /res/product/get-nav-history` |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `fund_id` | `integer` | Pydantic ép số nguyên | `fund_id` lấy từ `GET /funds` |

**Query params** — — (endpoint **không** cho lọc khoảng ngày; luôn trả toàn bộ)

**Request body** — —

**Response 200**

~~~ts
type MdFundNavResponse = MarketDataResponse<MdFundNavPoint[]>;
~~~

~~~json
{
  "data": [
    { "date": "2026-08-13", "nav_per_unit": 32180.42 },
    { "date": "2026-08-14", "nav_per_unit": 32301.77 },
    { "date": "2026-08-15", "nav_per_unit": 32418.55 }
  ],
  "meta": {
    "source": "FMARKET",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:35:40.008442Z",
    "raw_endpoint": "https://api.fmarket.vn/res/product/get-nav-history"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | `fund_id` không phải số nguyên | `HttpValidationError` |
| `404` | — | Fmarket trả **HTTP 400** cho id đó | `Không tìm thấy quỹ 99999999` |
| `502` | — | Fmarket lỗi khác, hoặc trả **list rỗng** | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. URL được dựng bằng `_BASE_URL[:-1] + "/get-nav-history"`, tức `https://api.fmarket.vn/res/product/get-nav-history` — **`product`, KHÔNG phải `products`**. Đây là cách viết dễ hiểu sai nhất trong `fmarket.py`; hard-code hẳn URL khi port.
2. Body JSON: `{"isAllData": 1, "productId": <fund_id>, "fromDate": null, "toDate": "<YYYYMMDD hôm nay theo giờ máy>"}` — `datetime.now()` **naive**, không UTC.
3. Đọc `data["data"]` (list) → map `navDate → date`, `nav → nav_per_unit`.
4. `400` → `ValueError` → handler map thành **404** (giống endpoint chi tiết).
5. Không `allow_empty` → quỹ mới chưa có NAV ⇒ list rỗng ⇒ **502**. Rỗng không được cache.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/funds/23/nav' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001e'
~~~

**Ghi chú khi viết lại**

- **Đơn vị NAV**: `nav_per_unit` là **VND cho MỘT đơn vị quỹ** (test dùng `15000`; quỹ mở VN thường 10.000–60.000 VND/đơn vị). Không chia 1000, không đổi sang "nghìn đồng".
- `isAllData: 1` nghĩa là **luôn kéo toàn bộ lịch sử** → quỹ 10 năm có thể trả >2.500 điểm mỗi request, và cache 900s giữ nguyên khối đó trong Redis. Khi port nên mở query `from`/`to` và truyền xuống `fromDate`/`toDate` (đang bị bỏ trống) — **thay đổi hợp đồng API, ghi changelog**.
- `date` là **chuỗi thô** Fmarket (`navDate`), backend không chuẩn hoá → có thể là `"2026-08-15"` hoặc định dạng khác nếu Fmarket đổi. Không parse ở backend nếu muốn giữ tương thích.
- Thứ tự điểm là thứ tự Fmarket trả (thường tăng dần theo ngày) — **không** sort lại ở backend.

---

## Nhóm 4 — Lịch sự kiện (1 endpoint)

### GET /api/v1/market-data/events/calendar

> **Lịch sự kiện doanh nghiệp** — cổ tức, đại hội cổ đông, giao dịch nội bộ, niêm yết/huỷ niêm yết… trong một khoảng ngày, từ VCI IQ Insight.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/events/calendar:<md5_12>`, TTL **900s** (`REDIS_TTL_MACRO_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài: `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/events`; registry `events.calendar` (nhưng handler dựng chain trực tiếp `[("VCI", …)]`) |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `start` | `string` | **có** | — | `YYYY-MM-DD`; **không validate regex** (bị `.replace("-","")` rồi gửi thẳng) | Ngày bắt đầu |
| `end` | `string \| null` | không | `null` → **dùng lại `start`** (khoảng 1 ngày) | `YYYY-MM-DD`, không validate | Ngày kết thúc |
| `event_type` | `string \| null` | không | `null` (không lọc → mọi loại) | tra `_EVENT_TYPE_MAP` sau `.lower()`; **giá trị lạ được gửi NGUYÊN VĂN** làm `eventCode` | Nhóm sự kiện |

Ánh xạ `event_type` → `eventCode` gửi lên VCI (đủ 4 nhóm):

| `event_type` | `eventCode` | Bao gồm |
|---|---|---|
| `dividend` | `ISS,DIV` | phát hành thêm (ISS), chi trả cổ tức (DIV) |
| `insider` | `DDIND,DDRP,DDINS` | giao dịch/công bố của người nội bộ & người liên quan |
| `agm` | `EGME,AGME,AGMR` | ĐHCĐ bất thường, ĐHCĐ thường niên, kết quả ĐHCĐ |
| `others` | `MOVE,MA,NLIS,AIS,RETU,OTHE,SUSP` | chuyển sàn, M&A, huỷ niêm yết, niêm yết bổ sung, giao dịch trở lại, khác, tạm ngừng |

> Tên đầy đủ (VI/EN) của từng mã sự kiện lấy ở **`GET /api/v1/market-data/reference/event-codes` — xem chương 22**. Backend ở đây **không** dịch mã sự kiện.

**Request body** — —

**Response 200**

~~~ts
/** Key của mỗi item = camel→snake của payload VCI ⇒ KHÔNG cố định.
 *  Các key đã quan sát trong test: event_title, event_list_code, public_date. */
export interface MdEventCalendarItem {
  event_title?: string;       // "FPT: Trả cổ tức đợt 2/2026 bằng tiền, 1.000 đồng/CP"
  event_list_code?: string;   // "DIV"
  public_date?: string;       // "2026-08-14"
  ticker?: string;
  [key: string]: unknown;     // BẮT BUỘC: schema do VCI quyết định
}
type MdEventCalendarResponse = MarketDataResponse<MdEventCalendarItem[]>;
~~~

~~~json
{
  "data": [
    { "event_title": "FPT: Trả cổ tức đợt 2/2026 bằng tiền, 1.000 đồng/CP", "event_list_code": "DIV", "public_date": "2026-08-14", "ticker": "FPT" },
    { "event_title": "VCB: Nghị quyết ĐHĐCĐ thường niên năm 2026", "event_list_code": "AGMR", "public_date": "2026-08-12", "ticker": "VCB" },
    { "event_title": "HPG: Ông Nguyễn Văn Trung - Thành viên HĐQT - đã bán 500.000 CP", "event_list_code": "DDIND", "public_date": "2026-08-11", "ticker": "HPG" }
  ],
  "meta": {
    "source": "VCI",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:36:55.771903Z",
    "raw_endpoint": "https://iq.vietcap.com.vn/api/iq-insight-service/v1/events?fromDate=20260801&toDate=20260817&page=0&size=20000"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `422` | — | thiếu `start` | `HttpValidationError` (`loc: ["query","start"]`) |
| `502` | — | VCI lỗi, hoặc **không có sự kiện nào** trong khoảng ngày (list rỗng → validator fail) | `Tất cả 1 nguồn dữ liệu thị trường đều thất bại` |

**Fallback / suy giảm**

1. Ngày được đổi sang `YYYYMMDD` bằng `.replace("-","")` — **không validate**, nên `start=hom-nay` biến thành `fromDate=homnay` và VCI sẽ tự quyết định lỗi (thường 4xx → 502).
2. URL dựng **thủ công bằng nối chuỗi** (không dùng `params=`): `…/v1/events?fromDate=<>&toDate=<>&page=0&size=20000[&eventCode=<codes>]`. `size=20000` là hard-code → thực tế **không phân trang**, lấy trọn khoảng ngày trong một lần.
3. Header thêm `Origin`/`Referer` = `https://trading.vietcap.com.vn` (bắt buộc, thiếu là VCI chặn).
4. Đọ`data["data"]["content"]`; nếu `data["data"]` là list thì dùng luôn list đó; dạng khác → `[]`.
5. Mỗi item được đổi key camel→snake (`_camel_to_snake`), giữ nguyên value.
6. **Không** `allow_empty` → khoảng ngày yên tĩnh (vd 2 ngày cuối tuần, không doanh nghiệp nào công bố) trả **502**, không phải `200 []`. Đây là nhánh suy giảm sai nhất của endpoint này — khi port **nên** đổi thành `allow_empty=True` để cuối tuần trả `200 []` (ghi changelog).
7. Rỗng không được cache → mỗi lần mở lịch vào cuối tuần lại đấm VCI.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/events/calendar?start=2026-08-01&end=2026-08-17&event_type=dividend' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d001f'
~~~

**Ghi chú khi viết lại**

- `event_type` **không có allowlist**: chuỗi lạ được gửi thẳng làm `eventCode`. Nghĩa là client có thể truyền `?event_type=DIV` (mã VCI thật) và nó **hoạt động** — một API ngầm đang tồn tại. Nếu siết allowlist thì phải kiểm frontend trước.
- `event_type` được `.lower()` trước khi tra map, nên `?event_type=DIVIDEND` cũng khớp `dividend`.
- `size=20000` + khoảng ngày rộng (vd 1 năm) → payload rất lớn, cache 900s trong Redis. Nên bắt buộc khoảng ngày ≤ 90 ngày khi port.
- Tập key của item **không cố định** — index signature là bắt buộc trong TS. Đừng khai `interface` đóng rồi `strict` sẽ rơi dữ liệu.
- `raw_endpoint` chứa **cả query string** (khác các endpoint khác chỉ có base URL) vì URL được nối tay.

---

## Nhóm 5 — Google Sheets (3 endpoint)

Cả 3 endpoint đọc **cùng một spreadsheet hard-code** trong `app/services/market_data/sources/google_sheets.py`:

- Spreadsheet ID: **`1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI`** — **hard-code trong source**, KHÔNG lấy từ env.
- Range = **tên sheet**: `VND`, `TPCP`, `TYGIA` (hằng `SHEET_VND`/`SHEET_TPCP`/`SHEET_TYGIA`). Không có A1 notation, nên Sheets API trả toàn bộ vùng có dữ liệu của sheet đó.
- URL: `GET https://sheets.googleapis.com/v4/spreadsheets/{ID}/values/{SHEET}?key={GOOGLE_SHEETS_API_KEY}`, header `Accept: application/json`, `max_retries=2`.
- API key: **env `GOOGLE_SHEETS_API_KEY`** (default `""`).
- Parse header: `values[0]` là hàng header (mỗi ô `.strip()`), `values[1:]` là dữ liệu. Mỗi hàng được **pad thêm chuỗi rỗng** cho đủ độ dài header rồi zip thành dict `{header: cell}`. **`len(values) < 2` → trả `[]`** (không lỗi).
- **Thiếu `GOOGLE_SHEETS_API_KEY`** → `RuntimeError("GOOGLE_SHEETS_API_KEY is not configured")` ném ngay trong `_get_api_key()`, **trước khi gọi mạng** → handler bắt `except Exception` → **502** với detail chứa nguyên văn message.

Hai hàm parse số dùng chung:

- `_parse_vn_percent("5,50%") → 5.5`: `.strip()`, ô rỗng hoặc `"-"` → `null`, bỏ hậu tố `%`, đổi `,` → `.`, `float()`; lỗi → `null`.
- `_parse_number("26.334") → 26334.0`: ô rỗng hoặc `"-"` → `null`, **xoá TẤT CẢ dấu chấm** rồi `float()`. Vì vậy `"26.5"` (ý là 26,5) sẽ ra **265.0** — bẫy thật, xem ghi chú ở `/sheets/tygia`.

### GET /api/v1/market-data/sheets/vnd

> **Lãi suất VND liên ngân hàng** — bảng lãi suất theo kỳ hạn (hôm nay / hôm qua / chênh lệch %) do team nhập vào Google Sheets.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/sheets/vnd:_`, TTL **600s** (`REDIS_TTL_SHEETS_SECONDS`) |
| **Nguồn dữ liệu** | provider ngoài: Google Sheets v4, sheet `VND` |
| **Side-effect** | ghi log `logger.error` kèm traceback khi fetch thất bại |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdSheetsVndResponse = MarketDataResponse<MdSheetTenorRow[]>;
~~~

~~~json
{
  "data": [
    { "tenor": "ON", "today": "4,15%", "yesterday": "4,02%", "change": "0,13%", "todayNumeric": 4.15, "yesterdayNumeric": 4.02, "changeNumeric": 0.13 },
    { "tenor": "1W", "today": "4,30%", "yesterday": "4,25%", "change": "0,05%", "todayNumeric": 4.3, "yesterdayNumeric": 4.25, "changeNumeric": 0.05 },
    { "tenor": "1M", "today": "4,60%", "yesterday": "4,68%", "change": "-0,08%", "todayNumeric": 4.6, "yesterdayNumeric": 4.68, "changeNumeric": -0.08 },
    { "tenor": "3M", "today": "-", "yesterday": "5,10%", "change": "-", "todayNumeric": null, "yesterdayNumeric": 5.1, "changeNumeric": null }
  ],
  "meta": {
    "source": "GOOGLE_SHEETS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:38:12.556104Z",
    "raw_endpoint": "https://sheets.googleapis.com/v4/spreadsheets/1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI/values/VND"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | thiếu `GOOGLE_SHEETS_API_KEY` | `Google Sheets VND unavailable: GOOGLE_SHEETS_API_KEY is not configured` |
| `502` | — | Sheets trả 403 (key sai/hết quota), 404 (sheet bị đổi tên), timeout | `Google Sheets VND unavailable: <str(exception)>` |

**Fallback / suy giảm**

1. Không có nguồn dự phòng. **Không** đi qua `fetch_with_fallback` — handler tự `try/except Exception` và tự dựng `MarketDataMeta`.
2. Sheet trống hoặc chỉ có hàng header (`len(values) < 2`) → `data: []` với **200** (không 502). Vì `_has_data` thấy `data` rỗng nên **không cache** → mỗi request lại gọi Sheets.
3. Cột "chênh lệch" chấp nhận **hai cách viết**: `"CHÊNH LỆNH %"` (đúng chính tả sheet hiện tại — sai tiếng Việt) và fallback `"CHÊNH LỆCH %"`. Cả hai đều được dò; thiếu cả hai → `""`.
4. Ô `"-"`/rỗng → `*Numeric = null` nhưng chuỗi gốc vẫn giữ trong `today`/`yesterday`/`change` để UI in nguyên văn.
5. Ngoài giờ / cuối tuần: sheet không tự cập nhật → dữ liệu là của lần team nhập cuối. **Không có timestamp** trong response để biết độ mới — `meta.as_of` chỉ là thời điểm fetch.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sheets/vnd' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0020'
~~~

**Ghi chú khi viết lại**

- Header sheet mong đợi: **`KỲ HẠN`**, **`TODAY`**, **`YESTERDAY`**, **`CHÊNH LỆNH %`** (biến thể `CHÊNH LỆCH %`). Tên có **dấu tiếng Việt và viết hoa** — so khớp phải chính xác từng ký tự Unicode (chú ý NFC/NFD khi port sang Node: normalize `NFC` trước khi so).
- Tất cả 3 field số dùng `_parse_vn_percent` → đơn vị **phần trăm** (`4.15` = 4,15%/năm). `changeNumeric` cũng là điểm phần trăm.
- Field ra dùng **camelCase** (`todayNumeric`…) — lệch với toàn bộ chương, giữ nguyên.
- Không sort lại: thứ tự kỳ hạn đúng theo thứ tự hàng trong sheet (ON → 1W → 1M → …). Nếu team sửa sheet, thứ tự API đổi theo.
- Kiểu trả về khai trong OpenAPI là `MarketDataResponse` nhưng route **không** khai `response_model` (chỉ có `summary`), nên FastAPI suy từ type hint. Không ảnh hưởng hình dạng.

---

### GET /api/v1/market-data/sheets/tpcp

> **Lợi suất trái phiếu chính phủ** — bảng lợi suất TPCP theo kỳ hạn (hôm nay / hôm qua / chênh lệch tính bằng **điểm**).

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/sheets/tpcp:_`, TTL **600s** |
| **Nguồn dữ liệu** | provider ngoài: Google Sheets v4, sheet `TPCP` |
| **Side-effect** | ghi log `logger.error` kèm traceback khi fetch thất bại |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdSheetsTpcpResponse = MarketDataResponse<MdSheetTenorRow[]>;
~~~

~~~json
{
  "data": [
    { "tenor": "1Y",  "today": "2,15%", "yesterday": "2,13%", "change": "0,2",  "todayNumeric": 2.15, "yesterdayNumeric": 2.13, "changeNumeric": 0.2 },
    { "tenor": "5Y",  "today": "2,68%", "yesterday": "2,71%", "change": "-0,3", "todayNumeric": 2.68, "yesterdayNumeric": 2.71, "changeNumeric": -0.3 },
    { "tenor": "10Y", "today": "3,12%", "yesterday": "3,12%", "change": "-",    "todayNumeric": 3.12, "yesterdayNumeric": 3.12, "changeNumeric": null }
  ],
  "meta": {
    "source": "GOOGLE_SHEETS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:39:03.221765Z",
    "raw_endpoint": "https://sheets.googleapis.com/v4/spreadsheets/1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI/values/TPCP"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | thiếu `GOOGLE_SHEETS_API_KEY` | `Google Sheets TPCP unavailable: GOOGLE_SHEETS_API_KEY is not configured` |
| `502` | — | Sheets 403/404/timeout | `Google Sheets TPCP unavailable: <str(exception)>` |

**Fallback / suy giảm**

1. Giống `/sheets/vnd` về cấu trúc: không dự phòng, sheet trống → `200 data: []` (không cache), lỗi bất kỳ → 502 với prefix `Google Sheets TPCP unavailable:`.
2. Cột chênh lệch dò **`CHÊNH LỆNH POINTS`** trước, fallback **`CHÊNH LỆCH POINTS`**.
3. **Khác biệt duy nhất so với `/sheets/vnd`**: `changeNumeric` **không** dùng `_parse_vn_percent`. Nó parse riêng: ô rỗng/`"-"` → `null`; ngược lại `float(change_str.replace(",", "."))`, lỗi → `null`. Nghĩa là hậu tố `%` **không** bị bỏ → nếu team nhập `"0,2%"` thì `float("0.2%")` lỗi → `changeNumeric = null` dù `change` vẫn có chuỗi.
4. `todayNumeric`/`yesterdayNumeric` vẫn dùng `_parse_vn_percent` (bỏ `%` bình thường).

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sheets/tpcp' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0021'
~~~

**Ghi chú khi viết lại**

- Header sheet mong đợi: **`KỲ HẠN`**, **`TODAY`**, **`YESTERDAY`**, **`CHÊNH LỆNH POINTS`** (biến thể `CHÊNH LỆCH POINTS`).
- **Đơn vị lệch nhau trong cùng một dòng**: `todayNumeric`/`yesterdayNumeric` là **% lợi suất**, còn `changeNumeric` là **điểm (points)** theo tên cột. Đừng gắn hậu tố `%` cho cả ba.
- Ba endpoint sheets có **ba nhánh parse `change` khác nhau** (VND: `_parse_vn_percent`; TPCP: `float(replace(",","."))`; TYGIA: `float(replace(",","."))` nhưng `today/yesterday` dùng `_parse_number`). Viết 3 normalizer riêng, đừng gộp một hàm.
- Không có nguồn nào khác trong hệ thống cung cấp lợi suất TPCP → endpoint này sập là mất hẳn dữ liệu, không có degrade.

---

### GET /api/v1/market-data/sheets/tygia

> **Bảng tỷ giá ngoại tệ tham chiếu** — tỷ giá theo cặp tiền (hôm nay / hôm qua / chênh lệch) do team nhập vào Google Sheets.

| | |
|---|---|
| **Quyền** | Công khai |
| **Rate limit** | mặc định (`60/minute` per IP) |
| **Cache** | Redis `iqx:api:v1:api/v1/market-data/sheets/tygia:_`, TTL **600s** |
| **Nguồn dữ liệu** | provider ngoài: Google Sheets v4, sheet `TYGIA` |
| **Side-effect** | ghi log `logger.error` kèm traceback khi fetch thất bại |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type MdSheetsTygiaResponse = MarketDataResponse<MdSheetFxRow[]>;
~~~

~~~json
{
  "data": [
    { "currency": "USD/VND", "today": "26.150", "yesterday": "26.120", "change": "30",  "todayNumeric": 26150, "yesterdayNumeric": 26120, "changeNumeric": 30 },
    { "currency": "EUR/VND", "today": "30.434", "yesterday": "30.512", "change": "-78", "todayNumeric": 30434, "yesterdayNumeric": 30512, "changeNumeric": -78 },
    { "currency": "CNY/VND", "today": "3.642",  "yesterday": "3.640",  "change": "-",   "todayNumeric": 3642,  "yesterdayNumeric": 3640,  "changeNumeric": null }
  ],
  "meta": {
    "source": "GOOGLE_SHEETS",
    "source_priority": 1,
    "fallback_used": false,
    "as_of": "2026-08-17T04:40:27.994310Z",
    "raw_endpoint": "https://sheets.googleapis.com/v4/spreadsheets/1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI/values/TYGIA"
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail (nguyên văn) |
|---|---|---|---|
| `502` | — | thiếu `GOOGLE_SHEETS_API_KEY` | `Google Sheets TYGIA unavailable: GOOGLE_SHEETS_API_KEY is not configured` |
| `502` | — | Sheets 403/404/timeout | `Google Sheets TYGIA unavailable: <str(exception)>` |

**Fallback / suy giảm**

1. Không dự phòng; sheet trống → `200 data: []` (không cache); lỗi bất kỳ → 502 với prefix `Google Sheets TYGIA unavailable:`.
2. Cột chênh lệch **chỉ dò một tên**: `CHÊNH LỆCH` (không có biến thể `CHÊNH LỆNH` như 2 sheet kia). Sheet đổi tên cột → `change` thành `""`, `changeNumeric` thành `null`, **không** báo lỗi.
3. `todayNumeric`/`yesterdayNumeric` dùng `_parse_number` (**xoá mọi dấu chấm**, coi dấu chấm là ngăn nghìn kiểu VN). `changeNumeric` parse riêng bằng `float(replace(",","."))`.
4. Team chưa nhập / ô `"-"` → `null` ở phần numeric, chuỗi gốc giữ nguyên.

**curl**

~~~bash
curl -sS -X GET 'https://api.iqx.vn/api/v1/market-data/sheets/tygia' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f3a1c20-8e11-4d5b-9a02-1b6c4e9d0022'
~~~

**Ghi chú khi viết lại**

- Header sheet mong đợi: **`NGOẠI TỆ`**, **`TODAY`**, **`YESTERDAY`**, **`CHÊNH LỆCH`**. Field ra là `currency` (không phải `tenor`) — đây là điểm khác duy nhất về schema so với 2 sheet kia.
- **BẪY `_parse_number`**: hàm xoá **tất cả** dấu chấm rồi `float()`. `"26.150"` → `26150` (đúng, ngăn nghìn) nhưng `"1.08"` (EUR/USD) → **`108`** (sai 100 lần). Sheet hiện chỉ chứa cặp `*/VND` nên chưa lộ; **nếu thêm cặp có phần thập phân dùng dấu chấm là sai số ngay**. Khi port: xử lý theo pattern (`^-?\d{1,3}(\.\d{3})+$` mới coi là ngăn nghìn), và thêm test hồi quy — đây là **sửa lỗi**, ghi changelog.
- `changeNumeric` là **số VND tuyệt đối** (30 = tăng 30 đồng), không phải phần trăm — khác hẳn `/sheets/vnd`.
- Bảng này **độc lập** với `/macro/fx` (Vietcombank) và `/global/forex` (MSN): ba con số khác nhau cho cùng cặp USD/VND là **bình thường**, không phải bug. UI phải ghi rõ nguồn.

---

## Ghi chú tổng hợp khi viết lại

1. **Ba lớp lỗi phải giữ đúng, không "chuẩn hoá" cho đẹp**
   - `422` chuỗi (HTTPException) cho allowlist sai: `Không hỗ trợ mã chỉ số: X`, `Mã crypto không hợp lệ: X`, `Giá trị commodity 'X' không hợp lệ. Cho phép: [...]`, `Giá trị indicator 'X' không hợp lệ. Cho phép: [...]`, `Giá trị period 'X' không hợp lệ. Cho phép: [...]`, `Giá trị date='X' không hợp lệ. Định dạng YYYY-MM-DD.`
   - `422` mảng (Pydantic) cho sai kiểu / ngoài `ge/le`.
   - `404` **chỉ** ở 2 endpoint quỹ, với detail `Không tìm thấy quỹ <id>`, sinh từ **HTTP 400 của Fmarket** — nhớ map 400→404.
   - `502` với detail duy nhất `Tất cả {n} nguồn dữ liệu thị trường đều thất bại` cho mọi endpoint đi qua fallback; 3 endpoint sheets có detail riêng `Google Sheets <SHEET> unavailable: <lỗi>`.

2. **`allow_empty` và `cache_empty` là hai cờ độc lập, quyết định trải nghiệm cuối tuần**

   | Endpoint | `allow_empty` | `cache_empty` | Rỗng → |
   |---|---|---|---|
   | `/macro/gold`, `/macro/fx`, `/macro/commodities/{code}`, `/funds*`, `/events/calendar` | ✗ | ✗ | **502** |
   | `/global/world-index`, `/global/forex` | ✓ | ✗ | `200 []`, không cache |
   | `/macro/economy/{indicator}` | ✓ | ✓ | `200 []`, **cache 900s** |
   | `/global/crypto/{symbol}/depth` | ✓ | ✓ | `200 {bids:[],asks:[]}`, cache 15s |
   | `/global/snapshot`, `/sheets/*` | n/a (không qua fallback) | — | `200 []`, không cache |

3. **Đơn vị — bảng tổng, không được suy diễn thêm**: SJC `buy_price`/`sell_price` = **VND tuyệt đối, không scale** (đơn vị theo lượng/chỉ: CHƯA XÁC ĐỊNH); VCB = **VND cho 1 đơn vị ngoại tệ** (JPY theo 1 JPY); Simplize commodity = **tuỳ mã, CHƯA XÁC ĐỊNH trong source**; MBK = **theo field `unit` của upstream, CHƯA XÁC ĐỊNH cố định**; Binance = **quote asset (USDT)**; MSN crypto fallback = **VND**; NAV quỹ = **VND/đơn vị**; `nav_change_*`, `*_percent`, `change_percent` = **phần trăm thô** (không phải 0–1); `open_time`/`close_time` Binance = **ms**; `timestamp` nến = **giây**; `time` của Simplize = **số epoch giây**, của Binance/MSN = **chuỗi ngày UTC**.

4. **Timezone**: `/macro/gold` và `/macro/fx` lấy "hôm nay" theo **UTC**; MSN `end` mặc định UTC; MBK `end_year` và Fmarket `toDate` dùng **giờ máy naive**; cron snapshot dùng **ICT (`Asia/Ho_Chi_Minh`)**; `snapshot_date` là **ngày ICT**. Bốn quy ước cùng tồn tại — port từng chỗ đúng như nguyên bản, hoặc thống nhất về ICT **một lần** và ghi rõ vào changelog.

5. **Sắp xếp** (đừng đổi): `/macro/commodities` theo thứ tự khai báo `COMMODITY_MAP`; `/funds` theo `navTo6Months DESC` do Fmarket sort; `/global/snapshot` theo `ORDER BY asset_category, symbol`; mọi list khác giữ nguyên thứ tự upstream (order book, NAV, nến, sheets).

6. **Ba việc phải SỬA khi port (đều là thay đổi hành vi, phải ghi changelog)**
   - `/macro/fx` đang **500** khi không có `?source=VCB` → sửa registry hoặc orchestrator (Nghiệp vụ nền §2).
   - MSN apikey hỏng **không tự làm mới** trong 6h → thêm invalidate `mkt:msn:apikey` khi charts trả 401/403/404 (§5.5).
   - `google_sheets._parse_number` xoá mọi dấu chấm → sai 100× với số thập phân (`/sheets/tygia`).
   Ngoài ra nên xem xét (tuỳ chọn): `allow_empty=True` cho `/events/calendar` và `/macro/commodities/{code}` để cuối tuần trả `200 []`; thêm cache ngắn cho `/global/snapshot`; allowlist `interval` cho crypto OHLC; phân trang thật cho `/funds` và khoảng ngày cho `/funds/{id}/nav`.

7. **Ba hệ mã crypto/quốc tế cùng tồn tại, không được trộn**: Binance `BTCUSDT`/`ETHUSDT`; MSN `BTC`/`BTCUSDT`/`ETH` (map `MSN_SECID` — **không** có `ETHUSDT`); Yahoo `BTC-USD`/`ETH-USD`/`^GSPC`/`VND=X`/`GC=F` (chỉ trong `market_data_snapshot`). Viết một lớp map tường minh, đừng đoán bằng regex.

8. **Kiểu `data` không đồng nhất**: array cho gold/fx/commodities/economy/funds-list/nav/world-index/forex/crypto-ohlc/events/sheets; **object** cho `/funds/{id}`, `/global/crypto/{symbol}/ticker`, `/global/crypto/{symbol}/depth`; **envelope khác hẳn** cho `/global/snapshot` (`meta` chỉ có `snapshot_date` + `stale_count`, không có `source`/`as_of`). Khai generic `MarketDataResponse<T>` và chỉ định `T` từng endpoint.

9. **Ba nguồn tỷ giá USD/VND song song** (`/macro/fx` VCB, `/global/forex` MSN, `/sheets/tygia` team nhập) và **hai nguồn vàng thế giới** (`/macro/commodities/gold_global` Simplize, `/global/forex?symbol=XAUUSD` MSN). Số liệu lệch nhau là bình thường; UI bắt buộc hiển thị nguồn, backend **không** hoà trộn.

10. **`meta.raw_endpoint` không đáng tin để debug**: Binance luôn báo host thứ nhất dù đã xoay host; `/macro/commodities` báo `"static_mapping"`; `/events/calendar` có cả query string trong khi các endpoint khác chỉ có base URL. Nếu cần trace thật, thêm `X-Request-ID` xuyên suốt và log ở tầng HTTP client.
